"use client";

import { useState, useEffect } from "react";
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
import { Mic, MicOff, Loader2, Sparkles, Briefcase, PiggyBank } from "lucide-react";
import { useSpeech } from "@/hooks/use-speech";
import {
  SAVINGS_CATEGORIES,
  SPENDING_CATEGORIES,
  isSavingsCategory,
  type Expense,
} from "@/types";
import { toast } from "sonner";

interface ExpenseFormProps {
  expense?: Expense;
  mode?: "create" | "edit";
}

export function ExpenseForm({ expense, mode = "create" }: ExpenseFormProps) {
  const router = useRouter();
  const { isListening, transcript, error: speechError, startListening, stopListening, isSupported } = useSpeech();

  const [amount, setAmount] = useState(expense?.amount?.toString() || "");
  const [description, setDescription] = useState(expense?.description || "");
  const [category, setCategory] = useState(expense?.category || "");
  const [date, setDate] = useState(
    expense?.date || new Date().toISOString().split("T")[0]
  );
  const [loading, setLoading] = useState(false);
  const [categorizing, setCategorizing] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [inputMethod, setInputMethod] = useState<"manual" | "voice">(
    expense?.input_method || "manual"
  );
  const [isReimbursable, setIsReimbursable] = useState(expense?.is_reimbursable || false);
  const [claimReference, setClaimReference] = useState(expense?.claim_reference || "");
  const isSavings = isSavingsCategory(category);

  useEffect(() => {
    if (transcript && !isListening) {
      handleVoiceParse(transcript);
    }
  }, [transcript, isListening]);

  async function handleVoiceParse(text: string) {
    setParsing(true);
    setInputMethod("voice");
    try {
      const res = await fetch("/api/voice-parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const data = await res.json();
      if (data.amount > 0) setAmount(data.amount.toString());
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
    setLoading(true);

    const url =
      mode === "edit" ? `/api/expenses/${expense?.id}` : "/api/expenses";
    const method = mode === "edit" ? "PUT" : "POST";

    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: parseFloat(amount),
          description,
          category: category || "Miscellaneous",
          date,
          input_method: inputMethod,
          ai_categorized: categorizing || category !== "",
          // Savings are your own money set aside, never a company claim.
          is_reimbursable: isSavings ? false : isReimbursable,
          claim_reference: isSavings ? "" : claimReference,
        }),
      });

      if (!res.ok) throw new Error("Failed to save expense");

      toast.success(
        isSavings
          ? mode === "edit" ? "Savings entry updated" : "Savings entry added"
          : mode === "edit" ? "Expense updated" : "Expense added"
      );
      router.push("/expenses");
      router.refresh();
    } catch {
      toast.error("Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {mode === "edit" ? "Edit Expense" : "Add Expense"}
        </CardTitle>
      </CardHeader>
      <CardContent>
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
              <Label htmlFor="amount">Amount (₹)</Label>
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
              onClick={() => router.back()}
            >
              Cancel
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
