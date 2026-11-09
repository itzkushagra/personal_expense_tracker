import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { todayInAppZone } from "@/lib/dates";
import { computeNetWorth } from "@/lib/net-worth";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // ?current=1 returns today's live figure instead of the snapshot history.
  if (new URL(request.url).searchParams.get("current")) {
    return NextResponse.json({ data: await computeNetWorth(supabase, user.id) });
  }

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

  const nw = await computeNetWorth(supabase, user.id);

  const today = todayInAppZone();
  const { data, error } = await supabase
    .from("net_worth_snapshots")
    .upsert(
      {
        user_id: user.id,
        date: today,
        total_assets: nw.total_assets,
        total_liabilities: nw.total_liabilities,
        net_worth: nw.net_worth,
        breakdown: nw.breakdown,
      },
      { onConflict: "user_id,date" }
    )
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}
