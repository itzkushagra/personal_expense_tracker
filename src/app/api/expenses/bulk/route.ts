import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { EXPENSE_CATEGORIES } from "@/types";

/** Bulk edit. Body: { ids: string[], category?, account_id? (null to unlink) } */
export async function PATCH(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { ids, category, account_id } = await request.json();
  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: "No expenses selected" }, { status: 400 });
  }

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (category !== undefined) {
    if (!(EXPENSE_CATEGORIES as readonly string[]).includes(category)) {
      return NextResponse.json({ error: "Unknown category" }, { status: 400 });
    }
    update.category = category;
    update.ai_categorized = false;
  }
  if (account_id !== undefined) update.account_id = account_id || null;

  const { error, count } = await supabase
    .from("expenses")
    .update(update, { count: "exact" })
    .eq("user_id", user.id)
    .in("id", ids);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ updated: count ?? 0 });
}

/** Bulk delete. Body: { ids: string[] } */
export async function DELETE(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { ids } = await request.json();
  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: "No expenses selected" }, { status: 400 });
  }

  const { error, count } = await supabase
    .from("expenses")
    .delete({ count: "exact" })
    .eq("user_id", user.id)
    .in("id", ids);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ deleted: count ?? 0 });
}
