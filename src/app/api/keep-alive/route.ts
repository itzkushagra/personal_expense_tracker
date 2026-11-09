import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Called daily by the Netlify scheduled function so the free Supabase project
// doesn't pause after a week without activity.
//
// It used the service role key (which bypasses row-level security) and
// returned the number of expense rows to anyone who called it. It now uses the
// public anon key: the query still reaches the database, which is all a
// keep-alive needs, but row security returns no data and the response says
// nothing about the database's contents.
export async function GET() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );

  const { error } = await supabase.from("expenses").select("id", { head: true }).limit(1);

  return NextResponse.json(
    { status: error ? "error" : "ok" },
    { status: error ? 503 : 200, headers: { "Cache-Control": "no-store" } }
  );
}
