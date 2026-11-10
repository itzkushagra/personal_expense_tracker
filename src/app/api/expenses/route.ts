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
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const q = searchParams.get("q");
  const accountId = searchParams.get("account_id");
  const limit = parseInt(searchParams.get("limit") || "50");
  const offset = parseInt(searchParams.get("offset") || "0");

  let query = supabase
    .from("expenses")
    .select("*", { count: "exact" })
    .eq("user_id", user.id)
    .order("date", { ascending: false })
    .order("created_at", { ascending: false });

  if (month && year) {
    const { start, end } = monthRange(parseInt(year), parseInt(month));
    query = query.gte("date", start).lte("date", end);
  }

  if (category) {
    query = query.eq("category", category);
  }

  if (from) query = query.gte("date", from);
  if (to) query = query.lte("date", to);
  if (q) query = query.ilike("description", `%${q.replace(/[%_,()]/g, " ").trim()}%`);
  // account_id=none lists expenses not linked to any account
  if (accountId === "none") query = query.is("account_id", null);
  else if (accountId) query = query.eq("account_id", accountId);

  // The database returns at most 1000 rows per request, so larger limits are fetched in pages.
  const rows: unknown[] = [];
  let count: number | null = null;
  for (let start = offset; start < offset + limit; start += 1000) {
    const end = Math.min(start + 1000, offset + limit) - 1;
    const { data, error, count: total } = await query.range(start, end);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    count = total;
    rows.push(...(data || []));
    if (!data || data.length < end - start + 1) break;
  }

  return NextResponse.json({ data: rows, count });
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
    account_id,
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
      account_id: account_id || null,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data }, { status: 201 });
}
