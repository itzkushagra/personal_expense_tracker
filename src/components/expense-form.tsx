"use client";

import { useState, useEffect, useEffectEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Mic, MicOff, Loader2, Sparkles, Briefcase, PiggyBank, Users, Plus, X } from "lucide-react";
import { useSpeech } from "@/hooks/use-speech";
import { AccountSelect, refreshAccounts, useAccounts } from "@/components/account-select";
import {
  SAVINGS_CATEGORIES,
  SPENDING_CATEGORIES,
  isSavingsCategory,
  type Expense,
} from "@/types";
import { toast } from "sonner";
import { toLocalDateString } from "@/lib/utils";

interface ExpenseFormProps {
  expense?: Expense;
  mode?: "create" | "edit";
  /** Shown inside a dialog: no card or title of its own. */
  inDialog?: boolean;
  /** Called after a successful save instead of navigating to /expenses. */
  onSaved?: () => void;
  /** Called after each save when "add another" keeps the form open (e.g. to refresh a list). */
  onChanged?: () => void;
  /** Called on Cancel instead of going back a page. */
  onCancel?: () => void;
  /** Pre-tick "Company will reimburse this" when adding. */
  defaultReimbursable?: boolean;
}

export function ExpenseForm({
  expense,
  mode = "create",
  inDialog = false,
  onSaved,
  onChanged,
  onCancel,
  defaultReimbursable = false,
}: ExpenseFormProps) {
  const router = useRouter();
  const { isListening, transcript, error: speechError, startListening, stopListening, isSupported } = useSpeech();

  const [amount, setAmount] = useState(expense?.amount?.toString() || "");
  const [description, setDescription] = useState(expense?.description || "");
  const [category, setCategory] = useState(expense?.category || "");
  const [date, setDate] = useState(
    // Local date: toISOString() gave yesterday's date for anything added before 5:30 AM IST.
    expense?.date || toLocalDateString()
  );
  const [loading, setLoading] = useState(false);
  const [categorizing, setCategorizing] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [inputMethod, setInputMethod] = useState<"manual" | "voice">(
    expense?.input_method || "manual"
  );
  const [isReimbursable, setIsReimbursable] = useState(expense ? !!expense.is_reimbursable : defaultReimbursable);
  const [claimReference, setClaimReference] = useState(expense?.claim_reference || "");
  const isSavings = isSavingsCategory(category);
  const { loaded: accountsLoaded, defaultId } = useAccounts();
  // undefined = not chosen yet; new expenses start on the default account once accounts load.
  const [accountId, setAccountId] = useState<string | null | undefined>(
    mode === "edit" ? expense?.account_id ?? null : undefined
  );
  const selectedAccount = accountId === undefined ? defaultId : accountId;

  // Split a bill: you paid the total, friends owe their shares (recorded as "Lent to them").
  const [splitOn, setSplitOn] = useState(false);
  const [splits, setSplits] = useState<{ name: string; amount: string }[]>([{ name: "", amount: "" }]);
  const [addAnother, setAddAnother] = useState(false);
  const total = parseFloat(amount) || 0;
  const friendsTotal = splitOn ? splits.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0) : 0;
  const myShare = Math.round((total - friendsTotal) * 100) / 100;

  function splitEqually() {
    const people = splits.length + 1;
    const share = Math.floor((total / people) * 100) / 100;
    setSplits(splits.map((r) => ({ ...r, amount: share ? String(share) : "" })));
  }

  // Parse once the user stops speaking. An effect event so the latest handler runs
  // without re-triggering the effect.
  const onSpeechDone = useEffectEvent((text: string) => handleVoiceParse(text));
  useEffect(() => {
    if (transcript && !isListening) {
      onSpeechDone(transcript);
    }
  }, [transcript, isListening]);

  async function handleVoiceParse(text: string) {
    setParsing(true);
    setInputMethod("voice");
    try {
      const res = await fetch("/api/voice-parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, today: toLocalDateString() }),
      });
      const data = await res.json();
      if (data.amount > 0) setAmount(data.amount.toString());
      // "yesterday", "last Sunday", "on 5th Nov"... otherwise keep the date as it is.
      if (typeof data.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(data.date)) setDate(data.date);
      if (data.description) {
        setDescription(data.description);
        handleCategorize(data.description);
      }
    } catch {
      setDescription(text);
    } finally {
      setParsing(false);
    }
  }

  async function handleCategorize(desc?: string) {
    const text = desc || description;
    if (!text.trim()) return;
    setCategorizing(true);
    try {
      const res = await fetch("/api/categorize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: text }),
      });
      const data = await res.json();
      if (data.category) setCategory(data.category);
    } catch {
      // keep existing category
    } finally {
      setCategorizing(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!amount || !description) {
      toast.error("Amount and description are required");
      return;
    }
    const friendRows = splitOn ? splits.filter((r) => r.name.trim() && parseFloat(r.amount) > 0) : [];
    if (splitOn && (friendRows.length === 0 || myShare < 0)) {
      toast.error(myShare < 0 ? "Friends' shares add up to more than the total" : "Add at least one friend and their share");
      return;
    }
    setLoading(true);

    const url =
      mode === "edit" ? `/api/expenses/${expense?.id}` : "/api/expenses";
    const method = mode === "edit" ? "PUT" : "POST";

    try {
      // If friends' shares cover the whole bill there's no expense of your own to record.
      const skipOwn = splitOn && myShare <= 0;
      const res = skipOwn ? new Response("{}") : await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: splitOn ? myShare : parseFloat(amount),
          description: splitOn ? `${description} (split)` : description,
          category: category || "Miscellaneous",
          date,
          input_method: inputMethod,
          ai_categorized: categorizing || category !== "",
          // Savings are your own money set aside, never a company claim.
          is_reimbursable: isSavings ? false : isReimbursable,
          claim_reference: isSavings ? "" : claimReference,
          account_id: accountsLoaded ? selectedAccount : expense?.account_id ?? null,
        }),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || `Server returned ${res.status}`);
      }

      // Each friend's share is money you lent from the same account.
      for (const r of friendRows) {
        await fetch("/api/people-loans", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            person_name: r.name.trim(),
            relation: "friend",
            direction: "lent",
            amount: parseFloat(r.amount),
            date,
            purpose: `Share of ${description}`,
            account_id: accountsLoaded ? selectedAccount : null,
          }),
        });
      }

      // The list opens on this month, so say where an entry from another month went.
      const savedMonth = date.slice(0, 7);
      const otherMonth = savedMonth !== toLocalDateString().slice(0, 7);
      const monthName = new Date(`${date}T00:00:00`).toLocaleString("en-IN", { month: "long", year: "numeric" });
      toast.success(
        mode === "edit"
          ? isSavings ? "Savings entry updated" : "Expense updated"
          : friendRows.length
            ? `Added your share ${myShare.toLocaleString("en-IN")} and ${friendRows.length} friend${friendRows.length > 1 ? "s" : ""} owe you`
            : isSavings ? "Savings entry added" : "Expense added",
        otherMonth ? { description: `Saved under ${monthName}. Pick that month in the filter to see it.` } : undefined
      );
      refreshAccounts();
      if (addAnother && mode === "create") {
        // Keep date and account; clear the rest for the next entry.
        setAmount("");
        setDescription("");
        setCategory("");
        setIsReimbursable(false);
        setClaimReference("");
        setSplitOn(false);
        setSplits([{ name: "", amount: "" }]);
        setInputMethod("manual");
        document.getElementById("amount")?.focus();
        onChanged?.();
        return;
      }
      if (onSaved) {
        onSaved();
      } else {
        router.push("/expenses");
        router.refresh();
      }
    } catch (err) {
      toast.error(
        err instanceof Error && err.message ? `Couldn't save: ${err.message}` : "Couldn't save the expense"
      );
    } finally {
      setLoading(false);
    }
  }

  const body = (
      <>
        {/* Voice input section */}
        {isSupported && mode === "create" && (
          <div className="mb-6 rounded-lg border-2 border-dashed p-4 text-center">
            <p className="mb-3 text-sm text-muted-foreground">
              Speak your expense naturally, e.g. &quot;spent 450 on groceries&quot;
            </p>
            <Button
              type="button"
              variant={isListening ? "destructive" : "secondary"}
              size="lg"
              onClick={isListening ? stopListening : startListening}
              disabled={parsing}
            >
              {parsing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Parsing...
                </>
              ) : isListening ? (
                <>
                  <MicOff className="mr-2 h-4 w-4" />
                  Stop Recording
                </>
              ) : (
                <>
                  <Mic className="mr-2 h-4 w-4" />
                  Start Voice Input
                </>
              )}
            </Button>
            {isListening && (
              <div className="mt-3 flex items-center justify-center gap-1">
                <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
                <span className="text-sm text-muted-foreground">Listening...</span>
              </div>
            )}
            {transcript && (
              <p className="mt-2 text-sm">
                Heard: &quot;<span className="font-medium">{transcript}</span>&quot;
              </p>
            )}
            {speechError && (
              <p className="mt-2 text-sm text-destructive">{speechError}</p>
            )}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="amount">{splitOn ? "Total paid (₹)" : "Amount (₹)"}</Label>
              <Input
                id="amount"
                type="number"
                step="0.01"
                min="0"
                placeholder="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="date">Date</Label>
              <Input
                id="date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              placeholder="What did you spend on? (or e.g. Mutual fund SIP, RD deposit)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onBlur={() => {
                if (description && !category) handleCategorize();
              }}
              required
              rows={2}
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Label htmlFor="category">Category</Label>
              {categorizing && (
                <Badge variant="secondary" className="text-xs">
                  <Sparkles className="mr-1 h-3 w-3" />
                  AI categorizing...
                </Badge>
              )}
              {category && !categorizing && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 text-xs"
                  onClick={() => handleCategorize()}
                >
                  <Sparkles className="mr-1 h-3 w-3" />
                  Re-categorize
                </Button>
              )}
            </div>
            <Select value={category} onValueChange={(v) => setCategory(v ?? "")}>
              <SelectTrigger>
                <SelectValue placeholder="Select or let AI decide" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectLabel>Savings &amp; investments</SelectLabel>
                  {SAVINGS_CATEGORIES.map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      {cat}
                    </SelectItem>
                  ))}
                </SelectGroup>
                <SelectSeparator />
                <SelectGroup>
                  <SelectLabel>Spending</SelectLabel>
                  {SPENDING_CATEGORIES.map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      {cat}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            {isSavings && (
              <p className="flex items-start gap-1.5 text-xs text-green-700 dark:text-green-500">
                <PiggyBank className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                Counted as money saved, not spent. It stays in your history but is left
                out of spending totals, budgets and charts.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label>Paid from</Label>
            <AccountSelect value={selectedAccount} onChange={setAccountId} placeholder="Not linked to an account" />
          </div>

          {!isSavings && (
          <div className="space-y-3 rounded-lg border p-3">
            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 accent-primary"
                checked={isReimbursable}
                onChange={(e) => setIsReimbursable(e.target.checked)}
              />
              <span>
                <span className="flex items-center gap-1.5 text-sm font-medium">
                  <Briefcase className="h-3.5 w-3.5" />
                  Company will reimburse this
                </span>
                <span className="text-xs text-muted-foreground">
                  Tracked under Reimbursements and left out of your budgets until the claim is settled
                </span>
              </span>
            </label>
            {isReimbursable && (
              <div className="space-y-2">
                <Label htmlFor="claim-ref">Claim / bill reference (optional)</Label>
                <Input
                  id="claim-ref"
                  placeholder="e.g. EXP-2026-114 or invoice number"
                  value={claimReference}
                  onChange={(e) => setClaimReference(e.target.value)}
                />
              </div>
            )}
          </div>
          )}

          {mode === "create" && !isSavings && (
            <div className="space-y-3 rounded-lg border p-3">
              <label className="flex cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 accent-primary"
                  checked={splitOn}
                  onChange={(e) => setSplitOn(e.target.checked)}
                />
                <span>
                  <span className="flex items-center gap-1.5 text-sm font-medium">
                    <Users className="h-3.5 w-3.5" />
                    Split this bill with friends
                  </span>
                  <span className="text-xs text-muted-foreground">
                    Only your share counts as spending; each friend&apos;s share is added to People &amp; Loans as money they owe you
                  </span>
                </span>
              </label>
              {splitOn && (
                <div className="space-y-2">
                  {splits.map((r, i) => (
                    <div key={i} className="flex gap-2">
                      <Input
                        placeholder="Friend's name"
                        value={r.name}
                        onChange={(e) => setSplits(splits.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
                      />
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="Their share"
                        className="w-36"
                        value={r.amount}
                        onChange={(e) => setSplits(splits.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => setSplits(splits.length > 1 ? splits.filter((_, j) => j !== i) : [{ name: "", amount: "" }])}
                        aria-label="Remove friend"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                  <div className="flex flex-wrap items-center gap-2">
                    <Button type="button" variant="outline" size="sm" onClick={() => setSplits([...splits, { name: "", amount: "" }])}>
                      <Plus className="mr-1 h-3.5 w-3.5" /> Add friend
                    </Button>
                    <Button type="button" variant="outline" size="sm" onClick={splitEqually} disabled={!total}>
                      Split equally ({splits.length + 1} people)
                    </Button>
                    <span className={`ml-auto text-sm ${myShare < 0 ? "text-destructive" : "text-muted-foreground"}`}>
                      Your share: <span className="font-semibold">₹{myShare.toLocaleString("en-IN")}</span>
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}

          {mode === "create" && (
            <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
              <input type="checkbox" className="h-4 w-4 accent-primary" checked={addAnother} onChange={(e) => setAddAnother(e.target.checked)} />
              Keep this form open to add another
            </label>
          )}

          <div className="flex gap-3 pt-2">
            <Button type="submit" disabled={loading} className="flex-1">
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : mode === "edit" ? (
                "Update Expense"
              ) : (
                "Add Expense"
              )}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => (onCancel ? onCancel() : router.back())}
            >
              Cancel
            </Button>
          </div>
        </form>
      </>
  );

  if (inDialog) return body;

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {mode === "edit" ? "Edit Expense" : "Add Expense"}
        </CardTitle>
      </CardHeader>
      <CardContent>{body}</CardContent>
    </Card>
  );
}
