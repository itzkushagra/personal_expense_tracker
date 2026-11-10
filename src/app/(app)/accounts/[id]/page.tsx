"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Loader2,
  ArrowLeft,
  ArrowDownLeft,
  ArrowUpRight,
  ArrowLeftRight,
  Pencil,
  Wallet,
  Receipt,
  HandCoins,
  Briefcase,
  CalendarClock,
} from "lucide-react";
import {
  type Account,
  type LedgerEntry,
  type LedgerKind,
  ACCOUNT_TYPE_LABELS,
  LIABILITY_ACCOUNT_TYPES,
} from "@/types";
import { cn, formatCurrency, formatDate } from "@/lib/utils";
import { toast } from "sonner";

interface Statement {
  account: Account;
  entries: LedgerEntry[];
  balance: number;
  money_in: number;
  money_out: number;
  earlier_count: number;
}

const KIND_META: Record<LedgerKind, { label: string; icon: React.ElementType; href: (id: string) => string }> = {
  expense: { label: "Expense", icon: Receipt, href: (id) => `/expenses?edit=${id}` },
  income: { label: "Income", icon: Wallet, href: () => "/income" },
  loan: { label: "People & Loans", icon: HandCoins, href: () => "/people" },
  reimbursement: { label: "Reimbursement", icon: Briefcase, href: () => "/reimbursements" },
  transfer_in: { label: "Transfer", icon: ArrowLeftRight, href: () => "/accounts" },
  transfer_out: { label: "Transfer", icon: ArrowLeftRight, href: () => "/accounts" },
  debt_payment: { label: "Debt repayment", icon: CalendarClock, href: () => "/bills" },
};

export default function AccountStatementPage() {
  const params = useParams<{ id: string }>();
  const [statement, setStatement] = useState<Statement | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [month, setMonth] = useState("");

  const fetchStatement = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/accounts/${params.id}/statement`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setStatement(json.data);
    } catch (err) {
      toast.error(err instanceof Error && err.message ? err.message : "Failed to load statement");
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  useEffect(() => { fetchStatement(); }, [fetchStatement]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!statement) {
    return (
      <div className="space-y-4">
        <Link href="/accounts"><Button variant="ghost" size="sm"><ArrowLeft className="mr-1 h-4 w-4" /> Accounts</Button></Link>
        <p className="text-muted-foreground">Account not found.</p>
      </div>
    );
  }

  const { account, entries } = statement;
  const isLiability = LIABILITY_ACCOUNT_TYPES.includes(account.type);
  const q = search.trim().toLowerCase();
  const visible = entries
    .filter((e) => (!month || e.date.startsWith(month)) && (!q || `${e.description} ${e.detail}`.toLowerCase().includes(q)))
    .slice()
    .reverse();

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Link href="/accounts">
            <Button variant="ghost" size="sm" className="-ml-2 mb-1"><ArrowLeft className="mr-1 h-4 w-4" /> Accounts</Button>
          </Link>
          <h1 className="text-2xl font-bold">{account.name}</h1>
          <p className="text-muted-foreground">
            {ACCOUNT_TYPE_LABELS[account.type]}{account.institution && ` · ${account.institution}`}
          </p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{isLiability ? "Amount Owed" : "Balance"}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className={cn("text-2xl font-bold", isLiability ? statement.balance > 0 && "text-destructive" : statement.balance < 0 ? "text-destructive" : "text-green-600")}>
              {formatCurrency(statement.balance)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Starting Balance</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(Number(account.opening_balance))}</div>
            <p className="text-xs text-muted-foreground">as of {formatDate(account.opening_date)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Money In</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">+{formatCurrency(statement.money_in)}</div>
            <p className="text-xs text-muted-foreground">since {formatDate(account.opening_date)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Money Out</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">−{formatCurrency(statement.money_out)}</div>
            <p className="text-xs text-muted-foreground">{entries.length} transactions</p>
          </CardContent>
        </Card>
      </div>

      {statement.earlier_count > 0 && (
        <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
          {statement.earlier_count} linked transactions are dated before {formatDate(account.opening_date)} and aren&apos;t
          counted, because the starting balance already includes them. To count them, move the account&apos;s
          &quot;as of&quot; date earlier and set the starting balance for that date.
        </p>
      )}

      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-base">Statement</CardTitle>
          <div className="flex gap-2">
            <Input placeholder="Search" value={search} onChange={(e) => setSearch(e.target.value)} className="h-8 w-40" />
            <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="h-8 w-40" aria-label="Filter by month" />
          </div>
        </CardHeader>
        <CardContent>
          {visible.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {entries.length === 0
                ? "Nothing linked to this account yet. Choose it as \"Paid from\" or \"Received in\" when adding expenses and income."
                : "No transactions match."}
            </p>
          ) : (
            <div className="space-y-1.5">
              {visible.map((e) => {
                const meta = KIND_META[e.kind];
                const Icon = e.amount >= 0 ? ArrowDownLeft : ArrowUpRight;
                return (
                  <div key={`${e.kind}-${e.id}`} className="flex items-center gap-3 rounded-lg border px-3 py-2 text-sm">
                    <Icon className={cn("h-4 w-4 shrink-0", e.amount >= 0 ? "text-green-600" : "text-destructive")} />
                    <span className="w-24 shrink-0 text-muted-foreground">{formatDate(e.date)}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{e.description}</p>
                      <p className="truncate text-xs text-muted-foreground">{e.detail}</p>
                    </div>
                    <Badge variant="secondary" className="hidden shrink-0 gap-1 text-xs sm:inline-flex">
                      <meta.icon className="h-3 w-3" /> {meta.label}
                    </Badge>
                    <span className={cn("w-24 shrink-0 text-right font-semibold", e.amount >= 0 ? "text-green-600" : "text-destructive")}>
                      {e.amount >= 0 ? "+" : "−"}{formatCurrency(Math.abs(e.amount))}
                    </span>
                    <span className="hidden w-24 shrink-0 text-right text-muted-foreground md:inline">{formatCurrency(e.running_balance)}</span>
                    <Link href={meta.href(e.id)} aria-label={`Edit ${meta.label.toLowerCase()}`} className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">
                      <Pencil className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
