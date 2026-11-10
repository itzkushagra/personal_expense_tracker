import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { withLiveBalances } from "@/lib/ledger";
import { pickAccountFields } from "@/lib/accounts";
import type { Account } from "@/types";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("accounts")
    .select("*")
    .eq("user_id", user.id)
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  try {
    return NextResponse.json({ data: await withLiveBalances(supabase, user.id, (data || []) as Account[]) });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to calculate balances" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const row = pickAccountFields(await request.json());
  if (!row.name || !row.type) return NextResponse.json({ error: "Name and type are required" }, { status: 400 });

  // The first account becomes the default automatically.
  const { count } = await supabase.from("accounts").select("id", { count: "exact", head: true }).eq("user_id", user.id);
  if (!count) row.is_default = true;
  if (row.is_default) await supabase.from("accounts").update({ is_default: false }).eq("user_id", user.id);

  const { data, error } = await supabase
    .from("accounts")
    .insert({ ...row, user_id: user.id })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data }, { status: 201 });
}
