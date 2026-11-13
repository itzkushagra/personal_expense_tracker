import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { todayInAppZone } from "@/lib/dates";
import { loadPortfolio } from "@/lib/investments";
import { writeErrorMessage } from "@/lib/record-only";
import { isMissingTable, parseHoldingInput, parseSipInput, parseTransactionInput, transactionRow } from "@/lib/portfolio";

const NOT_SET_UP = "Portfolio tracking needs the 20261110200100_investment_portfolio migration applied first";

/** All holdings with their transactions and figures, portfolio totals and legacy investment expenses. */
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    return NextResponse.json({ data: await loadPortfolio(supabase, user.id, { includeLegacy: true }) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed to load portfolio" }, { status: 500 });
  }
}

/**
 * Create a holding. Optional `first_transaction` records its first buy (or units you already
 * own, type "opening") in the same request.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const holding = parseHoldingInput(body, { partial: false, today: todayInAppZone() });
  if ("error" in holding) return NextResponse.json({ error: holding.error }, { status: 400 });

  // Optional monthly SIP into the new holding.
  let sip = null;
  if (body.sip) {
    const parsedSip = parseSipInput({ ...body.sip, holding_id: "new" }, { partial: false, today: todayInAppZone() });
    if ("error" in parsedSip) return NextResponse.json({ error: parsedSip.error }, { status: 400 });
    sip = parsedSip.value;
  }

  let first = null;
  if (body.first_transaction) {
    const parsed = parseTransactionInput(body.first_transaction);
    if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
    if (parsed.value.type === "sell") return NextResponse.json({ error: "A new holding starts with a buy" }, { status: 400 });
    first = parsed.value;
  }

  const { data, error } = await supabase
    .from("investment_holdings")
    .insert({ ...holding.value, user_id: user.id })
    .select()
    .single();
  if (error) {
    return NextResponse.json({ error: isMissingTable(error) ? NOT_SET_UP : error.message }, { status: isMissingTable(error) ? 503 : 500 });
  }

  if (first) {
    const { error: txError } = await supabase
      .from("investment_transactions")
      .insert({ ...transactionRow(first), holding_id: data.id, user_id: user.id });
    if (txError) {
      // Don't leave an empty holding behind when its first transaction was refused.
      await supabase.from("investment_holdings").delete().eq("id", data.id).eq("user_id", user.id);
      return NextResponse.json({ error: writeErrorMessage(txError) }, { status: 400 });
    }
  }

  if (sip) {
    const { error: sipError } = await supabase
      .from("investment_sips")
      .insert({ ...sip, holding_id: data.id, user_id: user.id });
    if (sipError) {
      // The holding (and any first buy) is saved; report the SIP problem so it can be added again.
      return NextResponse.json(
        { data, warning: isMissingTable(sipError) ? "Holding added, but SIPs aren't set up yet" : `Holding added, but the SIP wasn't: ${sipError.message}` },
        { status: 201 }
      );
    }
  }

  return NextResponse.json({ data }, { status: 201 });
}
