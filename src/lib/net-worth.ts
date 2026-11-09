import type { SupabaseClient } from "@supabase/supabase-js";
import { reimbursementDue } from "@/types";

export interface NetWorthBreakdown {
  total_assets: number;
  total_liabilities: number;
  net_worth: number;
  /** Account balances plus deposit / reimbursements / held money adjustments. */
  breakdown: Record<string, number>;
  /** Money owed to you or by you beyond plain account balances. */
  adjustments: {
    security_deposit: number;
    pending_reimbursements: number;
    held_for_others: number;
  };
  account_count: number;
}

export async function computeNetWorth(supabase: SupabaseClient, userId: string): Promise<NetWorthBreakdown> {
  const [{ data: accounts }, { data: rental }, { data: heldEntries }, { data: claims }] = await Promise.all([
    supabase.from("accounts").select("name, type, balance").eq("user_id", userId).eq("is_active", true),
    supabase.from("rentals").select("security_deposit").eq("user_id", userId).maybeSingle(),
    supabase.from("held_fund_entries").select("type, amount").eq("user_id", userId),
    supabase
      .from("expenses")
      .select("amount, is_reimbursable, reimbursement_status")
      .eq("user_id", userId)
      .eq("is_reimbursable", true)
      .in("reimbursement_status", ["pending", "submitted"]),
  ]);

  const breakdown: Record<string, number> = {};
  let totalAssets = 0;
  let totalLiabilities = 0;

  for (const acc of accounts || []) {
    breakdown[acc.name] = Number(acc.balance);
    if (acc.type === "credit_card" || acc.type === "loan") {
      totalLiabilities += Math.abs(Number(acc.balance));
    } else {
      totalAssets += Number(acc.balance);
    }
  }

  // Refundable rent deposit and pending company claims are money owed to you.
  const deposit = Number(rental?.security_deposit || 0);
  if (deposit > 0) {
    breakdown["Rent security deposit"] = deposit;
    totalAssets += deposit;
  }
  const claimsDue = (claims || []).reduce((s, e) => s + reimbursementDue(e), 0);
  if (claimsDue > 0) {
    breakdown["Pending reimbursements"] = claimsDue;
    totalAssets += claimsDue;
  }

  // Money friends/family left with you sits in your accounts but isn't yours.
  const heldForOthers = Math.max(
    0,
    (heldEntries || []).reduce(
      (s, e) => s + (e.type === "received" ? Number(e.amount) : -Number(e.amount)),
      0
    )
  );
  if (heldForOthers > 0) {
    breakdown["Held for others"] = -heldForOthers;
    totalLiabilities += heldForOthers;
  }

  return {
    total_assets: totalAssets,
    total_liabilities: totalLiabilities,
    net_worth: totalAssets - totalLiabilities,
    breakdown,
    adjustments: {
      security_deposit: deposit,
      pending_reimbursements: claimsDue,
      held_for_others: heldForOthers,
    },
    account_count: (accounts || []).length,
  };
}
