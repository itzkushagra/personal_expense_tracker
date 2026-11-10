import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { pick, WRITABLE } from "@/lib/api-fields";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("debts")
    .select("*")
    .eq("user_id", user.id)
    .order("current_balance", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  if (body.account_id === "") body.account_id = null;
  // Not told which account it is: if exactly one card / loan account has the same name,
  // it is the same liability (what net worth previously assumed by name), so link it.
  if (body.account_id === undefined && typeof body.name === "string") {
    const { data: same } = await supabase
      .from("accounts")
      .select("id, name")
      .eq("user_id", user.id)
      .in("type", ["credit_card", "loan"]);
    const matches = (same || []).filter((a) => a.name.trim().toLowerCase() === body.name.trim().toLowerCase());
    if (matches.length === 1) {
      const { count } = await supabase.from("debts").select("id", { count: "exact", head: true }).eq("account_id", matches[0].id);
      if (!count) body.account_id = matches[0].id;
    }
  }
  const { data, error } = await supabase
    .from("debts")
    .insert({ ...pick(body, WRITABLE.debts), user_id: user.id })
    .select()
    .single();

  // A bad link (not your card / loan account, or already linked) is the user's input, not a server fault.
  if (error) return NextResponse.json({ error: error.code === "23505" ? "That account is already linked to another Debt Tracker entry" : error.message }, { status: error.code === "P0001" || error.code === "23505" ? 400 : 500 });
  return NextResponse.json({ data }, { status: 201 });
}
