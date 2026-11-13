import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { depositLeft, depositUsed } from "@/lib/deposit";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("expenses")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { amount, description, category, date, is_reimbursable, claim_reference, account_id } = body;

  const update: Record<string, unknown> = {
    amount,
    description,
    category,
    date,
    ai_categorized: false,
    updated_at: new Date().toISOString(),
  };
  if (account_id !== undefined) update.account_id = account_id || null;

  // Rent paid out of the security deposit: giving it a bank account means it was paid from the
  // bank after all; raising its amount can't use more deposit than is left.
  const { data: existing } = await supabase.from("expenses").select("*").eq("id", id).eq("user_id", user.id).maybeSingle();
  if (existing?.paid_from_deposit) {
    if (update.account_id) {
      update.paid_from_deposit = false;
    } else if (amount !== undefined && Number(amount) > Number(existing.amount)) {
      const { data: rental } = await supabase.from("rentals").select("security_deposit").eq("user_id", user.id).maybeSingle();
      const left = depositLeft(Number(rental?.security_deposit || 0), await depositUsed(supabase, user.id));
      if (Number(amount) - Number(existing.amount) > left + 0.005) {
        return NextResponse.json({ error: `Only ₹${left.toLocaleString("en-IN")} of the deposit is left` }, { status: 400 });
      }
    }
  }

  if (is_reimbursable !== undefined) {
    const { data: current } = await supabase
      .from("expenses")
      .select("is_reimbursable")
      .eq("id", id)
      .eq("user_id", user.id)
      .maybeSingle();

    update.is_reimbursable = !!is_reimbursable;
    update.claim_reference = is_reimbursable ? claim_reference || "" : "";
    if (!is_reimbursable) {
      update.reimbursement_status = null;
      update.reimbursed_amount = 0;
      update.reimbursed_date = null;
    } else if (!current?.is_reimbursable) {
      // Newly flagged: start the claim; otherwise keep its existing status.
      update.reimbursement_status = "pending";
    }
  }

  const { data, error } = await supabase
    .from("expenses")
    .update(update)
    .eq("id", id)
    .eq("user_id", user.id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { error } = await supabase
    .from("expenses")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
