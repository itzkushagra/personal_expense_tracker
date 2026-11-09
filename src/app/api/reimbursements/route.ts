import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { ReimbursementStatus } from "@/types";

const STATUSES: ReimbursementStatus[] = ["pending", "submitted", "reimbursed", "rejected"];

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("expenses")
    .select("*")
    .eq("user_id", user.id)
    .eq("is_reimbursable", true)
    .order("date", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

/**
 * Bulk-update claim status.
 * Body: { ids: string[], status, claim_reference?, reimbursed_date?, reimbursed_amount? }
 * reimbursed_amount is only honoured for a single expense; otherwise each expense
 * is marked as reimbursed in full.
 */
export async function PATCH(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { ids, status, claim_reference, reimbursed_date, reimbursed_amount } = await request.json();
  if (!Array.isArray(ids) || ids.length === 0 || !STATUSES.includes(status)) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const { data: expenses, error: fetchError } = await supabase
    .from("expenses")
    .select("id, amount")
    .eq("user_id", user.id)
    .eq("is_reimbursable", true)
    .in("id", ids);

  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 });

  const today = new Date().toISOString().split("T")[0];
  const results = await Promise.all(
    (expenses || []).map((exp) => {
      const update: Record<string, unknown> = {
        reimbursement_status: status,
        updated_at: new Date().toISOString(),
      };
      if (claim_reference !== undefined) update.claim_reference = claim_reference;
      if (status === "reimbursed") {
        update.reimbursed_date = reimbursed_date || today;
        update.reimbursed_amount =
          ids.length === 1 && reimbursed_amount !== undefined && reimbursed_amount !== null
            ? Number(reimbursed_amount)
            : Number(exp.amount);
      } else {
        update.reimbursed_date = null;
        update.reimbursed_amount = 0;
      }
      return supabase.from("expenses").update(update).eq("id", exp.id).eq("user_id", user.id);
    })
  );

  const failed = results.find((r) => r.error);
  if (failed?.error) return NextResponse.json({ error: failed.error.message }, { status: 500 });
  return NextResponse.json({ updated: results.length });
}
