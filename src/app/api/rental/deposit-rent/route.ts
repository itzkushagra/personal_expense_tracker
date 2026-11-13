import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { todayInAppZone } from "@/lib/dates";
import { isMissingColumn } from "@/lib/ledger";
import { DEPOSIT_NOT_SET_UP, depositLeft, depositUsed, rentFromDeposit } from "@/lib/deposit";

const isDate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));

/**
 * Record a month's rent as paid out of the security deposit: a Rent expense with no bank account,
 * for the monthly rent or whatever is left of the deposit if that's less.
 * Body: { date?: "YYYY-MM-DD", description?: string }. Undo is deleting the expense.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const date = body.date === undefined ? todayInAppZone() : body.date;
  if (!isDate(date)) return NextResponse.json({ error: "Enter a valid date" }, { status: 400 });

  const { data: rental, error: rentalError } = await supabase
    .from("rentals")
    .select("monthly_rent, security_deposit")
    .eq("user_id", user.id)
    .maybeSingle();
  if (rentalError) return NextResponse.json({ error: rentalError.message }, { status: 500 });
  if (!rental) return NextResponse.json({ error: "Add your flat details first" }, { status: 400 });

  const left = depositLeft(Number(rental.security_deposit), await depositUsed(supabase, user.id));
  const amount = rentFromDeposit(Number(rental.monthly_rent), left);
  if (!(amount > 0)) {
    return NextResponse.json({ error: left > 0 ? "Set your monthly rent first" : "There's no security deposit left to use" }, { status: 400 });
  }

  const description =
    typeof body.description === "string" && body.description.trim()
      ? body.description.trim().slice(0, 200)
      : "Flat rent (from security deposit)";
  const { data, error } = await supabase
    .from("expenses")
    .insert({
      user_id: user.id,
      amount,
      description,
      category: "Rent",
      date,
      input_method: "manual",
      ai_categorized: false,
      is_reimbursable: false,
      account_id: null,
      paid_from_deposit: true,
    })
    .select()
    .single();
  if (error) {
    const missing = isMissingColumn(error);
    return NextResponse.json({ error: missing ? DEPOSIT_NOT_SET_UP : error.message }, { status: missing ? 503 : 500 });
  }
  return NextResponse.json({ data, deposit_left: depositLeft(left, amount) }, { status: 201 });
}
