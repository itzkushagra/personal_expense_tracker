import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const TABLES = [
  "accounts",
  "transfers",
  "expenses",
  "incomes",
  "held_funds",
  "held_fund_entries",
  "budgets",
  "goals",
  "bills",
  "bill_payments",
  "debts",
  "rentals",
  "net_worth_snapshots",
  "monthly_summaries",
] as const;

/** Full backup of the signed-in user's data as a downloadable JSON file. */
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const backup: Record<string, unknown> = {
    app: "SpendWise",
    exported_at: new Date().toISOString(),
    email: user.email,
  };

  for (const table of TABLES) {
    const rows: unknown[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await supabase
        .from(table)
        .select("*")
        .eq("user_id", user.id)
        .range(from, from + 999);
      if (error) {
        // A table from a migration that hasn't been run yet shouldn't block the rest.
        backup[`${table}_error`] = error.message;
        break;
      }
      rows.push(...(data || []));
      if (!data || data.length < 1000) break;
    }
    backup[table] = rows;
  }

  const date = new Date().toISOString().slice(0, 10);
  return new NextResponse(JSON.stringify(backup, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="spendwise-backup-${date}.json"`,
    },
  });
}
