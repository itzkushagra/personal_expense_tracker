"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ChevronDown, ChevronUp, Info, Loader2, Pencil, Plus, Tag, Trash2, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { AccountSelect, refreshAccounts, useAccounts } from "@/components/account-select";
import { BalanceEffect, RecordOnlyBadge } from "@/components/balance-effect";
import { PortfolioSummaryCards } from "@/components/investments/portfolio-summary";
import { SipSection } from "@/components/investments/sip-section";
import { cashAmount } from "@/lib/portfolio";
import type { HoldingWithSummary, PortfolioData } from "@/lib/investments";
import { cn, formatCurrency, formatDate, formatPrice, toLocalDateString } from "@/lib/utils";
import { startLoad } from "@/lib/load";
import {
  FUND_CATEGORY_LABELS,
  type FundCategory,
  INVESTMENT_ASSET_COLORS,
  INVESTMENT_ASSET_LABELS,
  type InvestmentAssetType,
  type InvestmentTransactionType,
} from "@/types";

const ASSET_TYPES = Object.keys(INVESTMENT_ASSET_LABELS) as InvestmentAssetType[];
const FUND_CATEGORIES = Object.keys(FUND_CATEGORY_LABELS) as Exclude<FundCategory, "">[];
const NO_CATEGORY = "none";
const TXN_LABELS: Record<InvestmentTransactionType, string> = { buy: "Buy", sell: "Sell", opening: "Already owned" };
const qty = (n: number) => n.toLocaleString("en-IN", { maximumFractionDigits: 4 });

type TxnDialog = { holding: HoldingWithSummary; type: "buy" | "sell" } | null;

async function send(url: string, method: string, body?: unknown) {
  const res = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `Server returned ${res.status}`);
  return json;
}

export default function InvestmentsPage() {
  const [data, setData] = useState<PortfolioData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [holdingDialog, setHoldingDialog] = useState<{ editing: HoldingWithSummary | null } | null>(null);
  const [firstKind, setFirstKind] = useState<"buy" | "opening">("buy");
  // Buys can be entered as an amount + NAV (how SIPs and lump sums work) or as units + price.
  const [entryMode, setEntryMode] = useState<"amount" | "units">("amount");
  const [withSip, setWithSip] = useState(false);
  const [sipAccount, setSipAccount] = useState<string | null>(null);
  const [txnDialog, setTxnDialog] = useState<TxnDialog>(null);
  const [priceDialog, setPriceDialog] = useState<HoldingWithSummary | null>(null);
  const { defaultId } = useAccounts();
  const [cashAccount, setCashAccount] = useState<string | null | undefined>(undefined);
  const cashAccountId = cashAccount === undefined ? defaultId : cashAccount;
  // false = the cash movement is already reflected in the account; the buy/sale is only a record.
  const [cashMoves, setCashMoves] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const json = await send("/api/investments", "GET");
      setData(json.data);
      setLoadError(null);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Failed to load portfolio");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { startLoad(fetchData); }, [fetchData]);

  async function afterChange(message: string) {
    toast.success(message);
    await fetchData();
    refreshAccounts();
  }

  function openHolding(editing: HoldingWithSummary | null) {
    setFirstKind("buy");
    setEntryMode("amount");
    setWithSip(false);
    setSipAccount(null);
    setCashAccount(undefined);
    setCashMoves(true);
    setHoldingDialog({ editing });
  }

  async function saveHolding(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const editing = holdingDialog?.editing;
    const body: Record<string, unknown> = {
      name: fd.get("name"),
      asset_type: fd.get("asset_type") || "mutual_fund",
      symbol: fd.get("symbol") || "",
      note: fd.get("note") || "",
    };
    if (data?.sips_available) {
      const cat = fd.get("fund_category") as string | null;
      body.fund_category = cat && cat !== NO_CATEGORY ? cat : "";
    }
    if (!editing && withSip) {
      body.sip = {
        amount: fd.get("sip_amount"),
        day_of_month: Number(fd.get("sip_day")),
        start_date: fd.get("sip_start"),
        account_id: sipAccount ?? cashAccountId,
      };
    }
    const firstMode = firstKind === "buy" ? entryMode : "units";
    if (!editing && (fd.get("quantity") || fd.get("amount"))) {
      if (!fd.get("price")) {
        toast.error(firstMode === "amount" ? "Enter the NAV / price to work out the units" : "Enter the price per unit too");
        return;
      }
      body.first_transaction = {
        type: firstKind,
        date: fd.get("date"),
        ...(firstMode === "amount" ? { amount: fd.get("amount") } : { quantity: fd.get("quantity") }),
        price: fd.get("price"),
        fees: fd.get("fees") || 0,
        account_id: firstKind === "buy" ? cashAccountId : null,
        moves_balance: cashMoves,
      };
    }
    setSaving(true);
    try {
      const json = await send(editing ? `/api/investments/${editing.id}` : "/api/investments", editing ? "PUT" : "POST", body);
      if (json.warning) toast.warning(json.warning);
      setHoldingDialog(null);
      await afterChange(editing ? "Holding updated" : "Holding added");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save the holding");
    } finally {
      setSaving(false);
    }
  }

  async function saveTxn(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!txnDialog) return;
    const fd = new FormData(e.currentTarget);
    setSaving(true);
    try {
      await send(`/api/investments/${txnDialog.holding.id}/transactions`, "POST", {
        type: txnDialog.type,
        date: fd.get("date"),
        ...(txnDialog.type === "buy" && entryMode === "amount" ? { amount: fd.get("amount") } : { quantity: fd.get("quantity") }),
        price: fd.get("price"),
        fees: fd.get("fees") || 0,
        account_id: cashAccountId,
        moves_balance: cashMoves,
        note: fd.get("note") || "",
      });
      setTxnDialog(null);
      await afterChange(txnDialog.type === "sell" ? "Sale recorded" : "Purchase recorded");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't record the transaction");
    } finally {
      setSaving(false);
    }
  }

  async function savePrice(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!priceDialog) return;
    const fd = new FormData(e.currentTarget);
    setSaving(true);
    try {
      await send(`/api/investments/${priceDialog.id}`, "PUT", {
        current_price: fd.get("current_price"),
        valued_on: fd.get("valued_on"),
      });
      setPriceDialog(null);
      await afterChange("Value updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't update the value");
    } finally {
      setSaving(false);
    }
  }

  async function deleteHolding(h: HoldingWithSummary) {
    const moved = h.transactions.filter((t) => t.account_id).length;
    const warning = moved
      ? `\n\nIts ${moved} buy/sell entr${moved === 1 ? "y" : "ies"} will be removed and the cash they moved goes back onto those accounts' balances.`
      : "";
    if (!confirm(`Delete ${h.name}?${warning}`)) return;
    try {
      await send(`/api/investments/${h.id}`, "DELETE");
      await afterChange("Holding deleted");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't delete the holding");
    }
  }

  async function deleteTxn(h: HoldingWithSummary, txId: string) {
    if (!confirm("Delete this transaction?")) return;
    try {
      await send(`/api/investments/${h.id}/transactions/${txId}`, "DELETE");
      await afterChange("Transaction deleted");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't delete the transaction");
    }
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const holdings = data?.holdings ?? [];
  const today = toLocalDateString();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Investments</h1>
          <p className="text-muted-foreground">Holdings, buys and sales, and what they&apos;re worth today</p>
        </div>
        {data?.available && (
          <Button onClick={() => openHolding(null)} className="shrink-0">
            <Plus className="mr-1 h-4 w-4" /> Add holding
          </Button>
        )}
      </div>

      {loadError && (
        <Card className="border-destructive/50">
          <CardContent className="pt-6 text-sm text-destructive">Couldn&apos;t load your portfolio: {loadError}</CardContent>
        </Card>
      )}

      {data && !data.available && (
        <Card>
          <CardContent className="flex gap-3 pt-6 text-sm">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <p>
              Portfolio tracking isn&apos;t switched on for this database yet. It needs the
              <code className="mx-1 rounded bg-muted px-1">20261110200100_investment_portfolio</code>
              migration to be applied.
            </p>
          </CardContent>
        </Card>
      )}

      {data && data.legacy.count > 0 && (
        <Card>
          <CardContent className="flex gap-3 pt-6 text-sm">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <p className="text-muted-foreground">
              You have {data.legacy.count} &quot;Investments&quot; expense{data.legacy.count === 1 ? "" : "s"} totalling{" "}
              {formatCurrency(data.legacy.total)} from before portfolio tracking. That money already left your accounts,
              but SpendWise can&apos;t tell what it bought, so it isn&apos;t shown as a holding or counted in net worth.
              To include it, add the holding and choose <strong>I already own these units</strong>, which records it
              without moving any cash again.
            </p>
          </CardContent>
        </Card>
      )}

      {data?.available && (
        <>
          <PortfolioSummaryCards summary={data.summary} />

          {data.sips_available ? (
            <SipSection sips={data.sips} holdings={holdings} onChanged={afterChange} />
          ) : (
            <Card>
              <CardContent className="flex gap-3 pt-6 text-sm text-muted-foreground">
                <Info className="mt-0.5 h-4 w-4 shrink-0" />
                <p>
                  Monthly SIPs and fund categories need the
                  <code className="mx-1 rounded bg-muted px-1">20261113120000_investment_sips</code>
                  migration to be applied.
                </p>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5" /> Holdings
              </CardTitle>
            </CardHeader>
            <CardContent>
              {holdings.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  No holdings yet. Add a mutual fund, stock, FD or anything else you invest in.
                </p>
              ) : (
                <div className="space-y-3">
                  {holdings.map((h) => {
                    const s = h.summary;
                    const open = expanded === h.id;
                    return (
                      <div key={h.id} className="rounded-lg border p-4" data-testid="holding">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: INVESTMENT_ASSET_COLORS[h.asset_type] }} />
                              <p className="font-medium">{h.name}</p>
                              <Badge variant="secondary">
                                {h.fund_category ? FUND_CATEGORY_LABELS[h.fund_category] : INVESTMENT_ASSET_LABELS[h.asset_type]}
                              </Badge>
                              {h.symbol && <span className="text-xs text-muted-foreground">{h.symbol}</span>}
                            </div>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {qty(s.quantity)} units · avg cost {formatPrice(s.average_cost)} ·{" "}
                              {s.valued_at_cost
                                ? "valued at cost (no price entered)"
                                : `price ${formatPrice(Number(h.current_price))}${h.valued_on ? ` on ${formatDate(h.valued_on)}` : ""}`}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="font-semibold">{formatCurrency(s.current_value)}</p>
                            <p className={cn("text-xs", s.unrealized_gain > 0 ? "text-green-600" : s.unrealized_gain < 0 ? "text-destructive" : "text-muted-foreground")}>
                              {s.unrealized_gain >= 0 ? "+" : "−"}
                              {formatCurrency(Math.abs(s.unrealized_gain))}
                              {s.unrealized_pct !== null && ` (${s.unrealized_pct.toFixed(1)}%)`} on {formatCurrency(s.cost_basis)}
                            </p>
                          </div>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <Button size="sm" variant="outline" onClick={() => { setCashAccount(undefined); setCashMoves(true); setEntryMode("amount"); setTxnDialog({ holding: h, type: "buy" }); }}>Buy</Button>
                          <Button size="sm" variant="outline" disabled={s.quantity <= 0} onClick={() => { setCashAccount(undefined); setCashMoves(true); setTxnDialog({ holding: h, type: "sell" }); }}>Sell</Button>
                          <Button size="sm" variant="outline" onClick={() => setPriceDialog(h)}>
                            <Tag className="mr-1 h-3.5 w-3.5" /> Update value
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setExpanded(open ? null : h.id)}>
                            {open ? <ChevronUp className="mr-1 h-3.5 w-3.5" /> : <ChevronDown className="mr-1 h-3.5 w-3.5" />}
                            History ({h.transactions.length})
                          </Button>
                          <div className="ml-auto flex gap-1">
                            <Button size="icon" variant="ghost" className="h-8 w-8" aria-label={`Edit ${h.name}`} onClick={() => openHolding(h)}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" aria-label={`Delete ${h.name}`} onClick={() => deleteHolding(h)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                        {open && (
                          <div className="mt-3 overflow-x-auto">
                            <table className="w-full min-w-[480px] text-sm">
                              <thead className="text-left text-xs text-muted-foreground">
                                <tr>
                                  <th className="py-1 font-medium">Date</th>
                                  <th className="py-1 font-medium">Type</th>
                                  <th className="py-1 text-right font-medium">Units</th>
                                  <th className="py-1 text-right font-medium">Price</th>
                                  <th className="py-1 text-right font-medium">Cash</th>
                                  <th />
                                </tr>
                              </thead>
                              <tbody>
                                {h.transactions.map((t) => (
                                  <tr key={t.id} className="border-t">
                                    <td className="py-1.5">{formatDate(t.date)}</td>
                                    <td className="py-1.5">{TXN_LABELS[t.type]}</td>
                                    <td className="py-1.5 text-right">{qty(Number(t.quantity))}</td>
                                    <td className="py-1.5 text-right">{formatPrice(Number(t.price))}</td>
                                    <td className="py-1.5 text-right">
                                      {t.type === "opening" ? "—" : `${t.type === "sell" ? "+" : "−"}${formatCurrency(cashAmount(t))}`}
                                      {t.account_id && t.moves_balance === false && <RecordOnlyBadge className="ml-1" />}
                                    </td>
                                    <td className="py-1.5 text-right">
                                      <Button size="icon" variant="ghost" className="h-7 w-7" aria-label="Delete transaction" onClick={() => deleteTxn(h, t.id)}>
                                        <Trash2 className="h-3.5 w-3.5" />
                                      </Button>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* Add / edit holding */}
      <Dialog open={!!holdingDialog} onOpenChange={(o) => !o && setHoldingDialog(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{holdingDialog?.editing ? "Edit holding" : "Add holding"}</DialogTitle>
            <DialogDescription>A fund, stock, deposit or anything else you invest in.</DialogDescription>
          </DialogHeader>
          {holdingDialog && (
            <form onSubmit={saveHolding} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="inv-name">Name</Label>
                <Input id="inv-name" name="name" required maxLength={120} defaultValue={holdingDialog.editing?.name ?? ""} placeholder="e.g. Nifty 50 index fund" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Type</Label>
                  <Select name="asset_type" defaultValue={holdingDialog.editing?.asset_type ?? "mutual_fund"}>
                    <SelectTrigger><SelectValue>{(v: string) => INVESTMENT_ASSET_LABELS[v as InvestmentAssetType] ?? v}</SelectValue></SelectTrigger>
                    <SelectContent>
                      {ASSET_TYPES.map((t) => (
                        <SelectItem key={t} value={t}>{INVESTMENT_ASSET_LABELS[t]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="inv-symbol">Symbol / folio (optional)</Label>
                  <Input id="inv-symbol" name="symbol" maxLength={40} defaultValue={holdingDialog.editing?.symbol ?? ""} />
                </div>
              </div>

              {data?.sips_available && (
                <div className="space-y-2">
                  <Label>Fund category (optional)</Label>
                  <Select name="fund_category" defaultValue={holdingDialog.editing?.fund_category || NO_CATEGORY}>
                    <SelectTrigger className="w-full">
                      <SelectValue>{(v: string) => (v === NO_CATEGORY ? "Not a fund / not set" : FUND_CATEGORY_LABELS[v as Exclude<FundCategory, "">] ?? v)}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NO_CATEGORY}>Not a fund / not set</SelectItem>
                      {FUND_CATEGORIES.map((c) => (
                        <SelectItem key={c} value={c}>{FUND_CATEGORY_LABELS[c]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {!holdingDialog.editing && (
                <div className="space-y-3 rounded-lg border p-3">
                  <div className="flex flex-wrap gap-4 text-sm">
                    <label className="flex cursor-pointer items-center gap-2">
                      <input type="radio" name="first_kind" className="accent-primary" checked={firstKind === "buy"} onChange={() => setFirstKind("buy")} />
                      Bought now (cash leaves an account)
                    </label>
                    <label className="flex cursor-pointer items-center gap-2">
                      <input type="radio" name="first_kind" className="accent-primary" checked={firstKind === "opening"} onChange={() => setFirstKind("opening")} />
                      I already own these units
                    </label>
                  </div>
                  {firstKind === "buy" && <EntryModeToggle mode={entryMode} onChange={setEntryMode} />}
                  <TxnFields today={today} mode={firstKind === "buy" ? entryMode : "units"} />
                  {firstKind === "buy" ? (
                    <div className="space-y-2">
                      <Label>Paid from</Label>
                      <AccountSelect value={cashAccountId} onChange={setCashAccount} placeholder="Not tracked" className="w-full" />
                      {cashAccountId && <BalanceEffect movesBalance={cashMoves} onChange={setCashMoves} direction="out" />}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">No cash moves: use this for units bought earlier, including ones logged as an &quot;Investments&quot; expense.</p>
                  )}
                  <p className="text-xs text-muted-foreground">Leave the amount / units empty to add the holding without a transaction.</p>
                </div>
              )}

              {!holdingDialog.editing && data?.sips_available && (
                <div className="space-y-3 rounded-lg border p-3">
                  <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
                    <input type="checkbox" className="h-4 w-4 accent-primary" checked={withSip} onChange={(e) => setWithSip(e.target.checked)} />
                    I invest in this every month (SIP)
                  </label>
                  {withSip && (
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <Label htmlFor="new-sip-amount">SIP amount (₹)</Label>
                        <Input id="new-sip-amount" name="sip_amount" type="number" step="any" min="1" required />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="new-sip-day">Day of month</Label>
                        <Input id="new-sip-day" name="sip_day" type="number" min="1" max="31" required defaultValue={5} />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="new-sip-start">Started on</Label>
                        <Input id="new-sip-start" name="sip_start" type="date" defaultValue={today} />
                      </div>
                      <div className="space-y-2">
                        <Label>Debited from</Label>
                        <AccountSelect value={sipAccount ?? cashAccountId} onChange={setSipAccount} placeholder="Not tracked" className="w-full" />
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="inv-note">Note (optional)</Label>
                <Input id="inv-note" name="note" maxLength={500} defaultValue={holdingDialog.editing?.note ?? ""} />
              </div>
              <Button type="submit" className="w-full" disabled={saving}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {holdingDialog.editing ? "Save" : "Add holding"}
              </Button>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Buy / sell */}
      <Dialog open={!!txnDialog} onOpenChange={(o) => !o && setTxnDialog(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{txnDialog?.type === "sell" ? "Sell" : "Buy"} {txnDialog?.holding.name}</DialogTitle>
            <DialogDescription>
              {txnDialog?.type === "sell"
                ? `You hold ${qty(txnDialog.holding.summary.quantity)} units. The sale amount goes into the account you pick.`
                : "The cost leaves the account you pick; it is an investment, not spending."}
            </DialogDescription>
          </DialogHeader>
          {txnDialog && (
            <form onSubmit={saveTxn} className="space-y-4">
              {txnDialog.type === "buy" && <EntryModeToggle mode={entryMode} onChange={setEntryMode} />}
              <TxnFields
                today={today}
                required
                mode={txnDialog.type === "buy" ? entryMode : "units"}
                maxQuantity={txnDialog.type === "sell" ? txnDialog.holding.summary.quantity : undefined}
              />
              <div className="space-y-2">
                <Label>{txnDialog.type === "sell" ? "Paid into" : "Paid from"}</Label>
                <AccountSelect value={cashAccountId} onChange={setCashAccount} placeholder="Not tracked" className="w-full" />
                {cashAccountId && (
                  <BalanceEffect movesBalance={cashMoves} onChange={setCashMoves} direction={txnDialog.type === "sell" ? "in" : "out"} />
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="txn-note">Note (optional)</Label>
                <Input id="txn-note" name="note" maxLength={500} />
              </div>
              <Button type="submit" className="w-full" disabled={saving}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Record {txnDialog.type === "sell" ? "sale" : "purchase"}
              </Button>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Update valuation */}
      <Dialog open={!!priceDialog} onOpenChange={(o) => !o && setPriceDialog(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Update value: {priceDialog?.name}</DialogTitle>
            <DialogDescription>Enter today&apos;s price per unit (NAV, share price). Leave it empty to value the holding at cost.</DialogDescription>
          </DialogHeader>
          {priceDialog && (
            <form onSubmit={savePrice} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="inv-price">Price per unit</Label>
                  <Input id="inv-price" name="current_price" type="number" step="any" min="0" defaultValue={priceDialog.current_price ?? ""} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="inv-valued">As of</Label>
                  <Input id="inv-valued" name="valued_on" type="date" max={today} defaultValue={priceDialog.valued_on ?? today} />
                </div>
              </div>
              <Button type="submit" className="w-full" disabled={saving}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save value
              </Button>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Choose how a buy is entered. */
function EntryModeToggle({ mode, onChange }: { mode: "amount" | "units"; onChange: (m: "amount" | "units") => void }) {
  return (
    <div className="inline-flex rounded-md border p-0.5 text-xs" role="group" aria-label="Enter the buy as">
      {(["amount", "units"] as const).map((m) => (
        <button
          key={m}
          type="button"
          aria-pressed={mode === m}
          onClick={() => onChange(m)}
          className={cn("rounded px-2.5 py-1", mode === m ? "bg-primary text-primary-foreground" : "text-muted-foreground")}
        >
          {m === "amount" ? "Amount + NAV" : "Units + price"}
        </button>
      ))}
    </div>
  );
}

/**
 * Date, size, price and fees: shared by the first purchase and the buy / sell form.
 * "amount" mode asks for the rupees invested and the NAV; the server works out the units.
 */
function TxnFields({
  today,
  required = false,
  maxQuantity,
  mode = "units",
}: {
  today: string;
  required?: boolean;
  maxQuantity?: number;
  mode?: "amount" | "units";
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="space-y-2">
        <Label htmlFor="txn-date">Date</Label>
        <Input id="txn-date" name="date" type="date" required max={today} defaultValue={today} />
      </div>
      {mode === "amount" ? (
        <div className="space-y-2">
          <Label htmlFor="txn-amount">Amount invested (₹)</Label>
          <Input id="txn-amount" name="amount" type="number" step="any" min="1" required={required} />
        </div>
      ) : (
        <div className="space-y-2">
          <Label htmlFor="txn-qty">Units</Label>
          <Input id="txn-qty" name="quantity" type="number" step="any" min="0.000001" max={maxQuantity} required={required} />
        </div>
      )}
      <div className="space-y-2">
        <Label htmlFor="txn-price">{mode === "amount" ? "NAV / price per unit" : "Price per unit"}</Label>
        <Input id="txn-price" name="price" type="number" step="any" min="0" required={required} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="txn-fees">{mode === "amount" ? "Stamp duty / charges" : "Fees / charges"}</Label>
        <Input id="txn-fees" name="fees" type="number" step="any" min="0" placeholder="0" />
      </div>
    </div>
  );
}
