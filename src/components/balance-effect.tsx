"use client";

import { cn } from "@/lib/utils";

/**
 * Whether an entry moves its account's balance, or is only a record of money that's already
 * reflected there (moves_balance = false). Shown under an account picker once an account is chosen.
 */
export function BalanceEffect({
  movesBalance,
  onChange,
  direction,
  className,
}: {
  movesBalance: boolean;
  onChange: (moves: boolean) => void;
  /** in = money arriving in the account, out = money leaving it. */
  direction: "in" | "out";
  className?: string;
}) {
  const options = [
    {
      moves: true,
      label: direction === "in" ? "Add to the balance" : "Take from the balance",
      hint: direction === "in" ? "The money is arriving now" : "The money is leaving now",
    },
    {
      moves: false,
      label: "Already in the balance",
      hint:
        direction === "in"
          ? "Just keep a record; the balance already includes it"
          : "Just keep a record; it's already taken out",
    },
  ];
  return (
    <div role="radiogroup" aria-label="Effect on the account balance" className={cn("grid grid-cols-2 gap-2", className)}>
      {options.map((o) => (
        <button
          key={String(o.moves)}
          type="button"
          role="radio"
          aria-checked={movesBalance === o.moves}
          onClick={() => onChange(o.moves)}
          className={cn(
            "rounded-lg border p-2 text-left transition-colors",
            movesBalance === o.moves ? "border-primary bg-primary/10" : "hover:bg-muted"
          )}
        >
          <span className={cn("block text-xs font-medium", movesBalance === o.moves && "text-primary")}>{o.label}</span>
          <span className="block text-[11px] leading-tight text-muted-foreground">{o.hint}</span>
        </button>
      ))}
    </div>
  );
}

/** Small marker for an entry kept for the record without moving its account's balance. */
export function RecordOnlyBadge({ className }: { className?: string }) {
  return (
    <span
      title="Kept for the record; the account balance already included this money"
      className={cn("rounded bg-muted px-1 py-0.5 text-[10px] font-medium text-muted-foreground", className)}
    >
      record only
    </span>
  );
}
