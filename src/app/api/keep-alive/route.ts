import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function GET() {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { cookies: { getAll: () => [], setAll: () => {} } }
  );

  const { count, error } = await supabase
    .from("expenses")
    .select("id", { count: "exact", head: true })
    .limit(1);

  return NextResponse.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    db: error ? "error" : "connected",
    rows: count,
  });
}
