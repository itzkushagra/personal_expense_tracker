import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { monthRange, todayInAppZone } from "@/lib/dates";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const month = searchParams.get("month");
  const year = searchParams.get("year");
  const category = searchParams.get("category");
  const limit = parseInt(searchParams.get("limit") || "50");
  const offset = parseInt(searchParams.get("offset") || "0");

  let query = supabase
    .from("expenses")
    .select("*", { count: "exact" })
    .eq("user_id", user.id)
    .order("date", { ascending: false })
    .range(offset, offset + limit - 1);

  if (month && year) {
    const { start, end } = monthRange(parseInt(year), parseInt(month));
    query = query.gte("date", start).lte("date", end);
  }

  if (category) {
    query = query.eq("category", category);
  }

  const { data, error, count } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data, count });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  if (!(Number(body.amount) > 0) || !String(body.description || "").trim()) {
    return NextResponse.json({ error: "Amount and description are required" }, { status: 400 });
  }
  const {
    amount,
    description,
    category,
    date,
    input_method,
    ai_categorized,
    is_reimbursable,
    claim_reference,
  } = body;

  const { data, error } = await supabase
    .from("expenses")
    .insert({
      user_id: user.id,
      amount,
      description,
      category: category || "Miscellaneous",
      date: date || todayInAppZone(),
      input_method: input_method || "manual",
      ai_categorized: ai_categorized || false,
      is_reimbursable: !!is_reimbursable,
      reimbursement_status: is_reimbursable ? "pending" : null,
      claim_reference: is_reimbursable ? claim_reference || "" : "",
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data }, { status: 201 });
}
