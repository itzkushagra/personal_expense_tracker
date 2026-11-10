import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { todayInAppZone } from "@/lib/dates";
import { loadPortfolio } from "@/lib/investments";
import { isMissingTable, parseHoldingInput, parseTransactionInput } from "@/lib/portfolio";

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
      .insert({ ...first, holding_id: data.id, user_id: user.id });
    if (txError) {
      // Don't leave an empty holding behind when its first transaction was refused.
      await supabase.from("investment_holdings").delete().eq("id", data.id).eq("user_id", user.id);
      return NextResponse.json({ error: txError.message }, { status: 400 });
    }
  }

  return NextResponse.json({ data }, { status: 201 });
}
