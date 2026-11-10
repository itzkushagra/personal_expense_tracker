import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { accountStatement } from "@/lib/ledger";
import type { Account } from "@/types";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: account } = await supabase
    .from("accounts")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!account) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    const statement = await accountStatement(supabase, user.id, account as Account);
    return NextResponse.json({ data: { account: { ...account, balance: statement.balance }, ...statement } });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to load statement" }, { status: 500 });
  }
}
