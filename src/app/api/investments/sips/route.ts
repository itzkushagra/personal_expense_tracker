import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { todayInAppZone } from "@/lib/dates";
import { isMissingTable, parseSipInput } from "@/lib/portfolio";

export const SIPS_NOT_SET_UP = "SIPs need the 20261113120000_investment_sips migration applied first";

/** Start a monthly SIP into one of your holdings. */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = parseSipInput(await request.json(), { partial: false, today: todayInAppZone() });
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const { data, error } = await supabase
    .from("investment_sips")
    .insert({ ...parsed.value, user_id: user.id })
    .select()
    .single();
  if (error) {
    const missing = isMissingTable(error);
    return NextResponse.json({ error: missing ? SIPS_NOT_SET_UP : error.message }, { status: missing ? 503 : 400 });
  }
  return NextResponse.json({ data }, { status: 201 });
}
