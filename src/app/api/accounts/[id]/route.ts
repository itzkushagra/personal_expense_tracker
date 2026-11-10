import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { pickAccountFields } from "@/lib/accounts";
import { withLiveBalances } from "@/lib/ledger";
import type { Account } from "@/types";

/**
 * Body: account fields, and optionally { actual_balance } to reconcile — the
 * opening balance is shifted so the calculated balance equals what your bank shows.
 */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const row = pickAccountFields(body);

  if (body.actual_balance !== undefined && body.actual_balance !== null && body.actual_balance !== "") {
    const { data: current } = await supabase.from("accounts").select("*").eq("id", id).eq("user_id", user.id).single();
    if (!current) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const [live] = await withLiveBalances(supabase, user.id, [{ ...current, ...row } as Account]);
    const opening = Number(row.opening_balance ?? current.opening_balance);
    row.opening_balance = Math.round((opening + Number(body.actual_balance) - live.balance) * 100) / 100;
    row.balance = row.opening_balance;
  }

  if (row.is_default) {
    await supabase.from("accounts").update({ is_default: false }).eq("user_id", user.id).neq("id", id);
  }

  const { data, error } = await supabase
    .from("accounts")
    .update({ ...row, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", user.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Linked expenses/income keep their records (account is cleared); transfers involving it are removed.
  const { error } = await supabase
    .from("accounts")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
