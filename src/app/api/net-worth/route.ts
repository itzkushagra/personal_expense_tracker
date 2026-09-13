import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("net_worth_snapshots")
    .select("*")
    .eq("user_id", user.id)
    .order("date", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: accounts } = await supabase
    .from("accounts")
    .select("*")
    .eq("user_id", user.id)
    .eq("is_active", true);

  if (!accounts) return NextResponse.json({ error: "No accounts" }, { status: 404 });

  const breakdown: Record<string, number> = {};
  let totalAssets = 0;
  let totalLiabilities = 0;

  for (const acc of accounts) {
    breakdown[acc.name] = Number(acc.balance);
    if (acc.type === "credit_card" || acc.type === "loan") {
      totalLiabilities += Math.abs(Number(acc.balance));
    } else {
      totalAssets += Number(acc.balance);
    }
  }

  const today = new Date().toISOString().split("T")[0];
  const { data, error } = await supabase
    .from("net_worth_snapshots")
    .upsert(
      {
        user_id: user.id,
        date: today,
        total_assets: totalAssets,
        total_liabilities: totalLiabilities,
        net_worth: totalAssets - totalLiabilities,
        breakdown,
      },
      { onConflict: "user_id,date" }
    )
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}
