"use client";

import { useEffect, useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { type Account, ACCOUNT_TYPE_LABELS } from "@/types";
import { formatCurrency } from "@/lib/utils";

const NONE = "none";

// One fetch shared by every picker on the page; refreshAccounts() after balances change.
let cache: Promise<Account[]> | null = null;
const listeners = new Set<(a: Account[]) => void>();

function load() {
  if (!cache) {
    cache = fetch("/api/accounts")
      .then((r) => r.json())
      .then((j) => (j.data || []) as Account[])
      .catch(() => []);
    cache.then((a) => listeners.forEach((l) => l(a)));
  }
  return cache;
}

/** Active accounts, from the shared fetch. */
export function loadAccounts() {
  return load().then((a) => a.filter((x) => x.is_active !== false));
}

/** The account marked default, else the first one. */
export function defaultAccountId(accounts: Account[]) {
  return accounts.find((a) => a.is_default)?.id ?? accounts[0]?.id ?? null;
}

export function refreshAccounts() {
  cache = null;
  return load();
}

/** Active accounts plus the default account's id (the one marked default, else the first). */
export function useAccounts() {
  const [accounts, setAccounts] = useState<Account[] | null>(null);
  useEffect(() => {
    let alive = true;
    const update = (a: Account[]) => alive && setAccounts(a.filter((x) => x.is_active !== false));
    listeners.add(update);
    load().then(update);
    return () => {
      alive = false;
      listeners.delete(update);
    };
  }, []);
  const defaultId = accounts ? defaultAccountId(accounts) : null;
  return { accounts: accounts ?? [], loaded: accounts !== null, defaultId };
}

interface AccountSelectProps {
  value: string | null;
  onChange: (id: string | null) => void;
  /** Form field name, so it's included in FormData. Empty string means "no account". */
  name?: string;
  placeholder?: string;
  className?: string;
}

export function AccountSelect({ value, onChange, name, placeholder = "No account", className }: AccountSelectProps) {
  const { accounts } = useAccounts();
  const labels: Record<string, string> = { [NONE]: placeholder };
  for (const a of accounts) labels[a.id] = a.name;

  return (
    <>
      <Select value={value ?? NONE} onValueChange={(v) => onChange(!v || v === NONE ? null : (v as string))}>
        <SelectTrigger className={className ?? "w-full"}>
          <SelectValue>{(v: string) => labels[v] ?? placeholder}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {accounts.map((a) => (
            <SelectItem key={a.id} value={a.id}>
              <span className="flex w-full items-center justify-between gap-3">
                <span>
                  {a.name}
                  <span className="ml-1.5 text-xs text-muted-foreground">{ACCOUNT_TYPE_LABELS[a.type]}</span>
                </span>
                <span className="text-xs text-muted-foreground">{formatCurrency(Number(a.balance))}</span>
              </span>
            </SelectItem>
          ))}
          <SelectItem value={NONE}>{placeholder}</SelectItem>
        </SelectContent>
      </Select>
      {name && <input type="hidden" name={name} value={value ?? ""} />}
    </>
  );
}
