import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn, formatCurrency } from "@/lib/utils";
import type { PortfolioSummary } from "@/lib/portfolio";
import { INVESTMENT_ASSET_COLORS, INVESTMENT_ASSET_LABELS } from "@/types";

const pct = (n: number | null) => (n === null ? "—" : `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`);
const signed = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${formatCurrency(Math.abs(n))}`;
const tone = (n: number) => (n > 0 ? "text-green-600" : n < 0 ? "text-destructive" : "");

/** Totals and allocation for the whole portfolio. Purely presentational. */
export function PortfolioSummaryCards({ summary }: { summary: PortfolioSummary }) {
  const cards = [
    { title: "Invested", value: formatCurrency(summary.invested), note: "cost of what you hold now" },
    { title: "Current value", value: formatCurrency(summary.current_value), note: "at the prices you entered" },
    {
      title: "Unrealised gain",
      value: signed(summary.unrealized_gain),
      note: pct(summary.unrealized_pct),
      className: tone(summary.unrealized_gain),
    },
    {
      title: "Realised gain",
      value: signed(summary.realized_gain),
      note: "from units you have sold",
      className: tone(summary.realized_gain),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => (
          <Card key={c.title}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{c.title}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className={cn("text-2xl font-bold", c.className)} data-testid={`portfolio-${c.title.toLowerCase().replace(/\s+/g, "-")}`}>
                {c.value}
              </div>
              <p className="text-xs text-muted-foreground">{c.note}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {summary.allocation.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Allocation</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted" role="img" aria-label="Portfolio allocation">
              {summary.allocation.map((a) => (
                <div key={a.asset_type} style={{ width: `${a.pct}%`, backgroundColor: INVESTMENT_ASSET_COLORS[a.asset_type] }} />
              ))}
            </div>
            <ul className="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
              {summary.allocation.map((a) => (
                <li key={a.asset_type} className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: INVESTMENT_ASSET_COLORS[a.asset_type] }} />
                    {INVESTMENT_ASSET_LABELS[a.asset_type]}
                  </span>
                  <span className="text-muted-foreground">
                    {formatCurrency(a.value)} · {a.pct.toFixed(0)}%
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
