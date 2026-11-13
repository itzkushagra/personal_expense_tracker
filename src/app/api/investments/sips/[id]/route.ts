import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { todayInAppZone } from "@/lib/dates";
import { parseSipInput } from "@/lib/portfolio";

/** Change a SIP's amount, day, account or start date, or pause / resume it (is_active). */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = parseSipInput(await request.json(), { partial: true, today: todayInAppZone() });
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const { data, error } = await supabase
    .from("investment_sips")
    .update({ ...parsed.value, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", user.id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ data });
}

/**
 * Stop tracking a SIP. Instalments already logged stay as normal buys of the fund
 * (their link to the SIP is cleared), so holdings and balances don't change.
 */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { error } = await supabase.from("investment_sips").delete().eq("id", id).eq("user_id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
