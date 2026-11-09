import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const FIELDS = ["amount", "source", "type", "date", "for_month", "is_received", "note"] as const;

// Partial update: only the fields sent are changed (e.g. { is_received: true, date } to mark received).
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const key of FIELDS) {
    if (body[key] !== undefined) update[key] = body[key];
  }
  if (typeof update.for_month === "string") update.for_month = `${update.for_month.slice(0, 7)}-01`;

  const { data, error } = await supabase
    .from("incomes")
    .update(update)
    .eq("id", id)
    .eq("user_id", user.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { error } = await supabase
    .from("incomes")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
