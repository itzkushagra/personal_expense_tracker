"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  X,
  Receipt,
  Wallet,
  ArrowLeftRight,
  HandCoins,
  Home,
  Briefcase,
} from "lucide-react";
import { cn } from "@/lib/utils";

export const QUICK_ACTIONS = [
  { key: "e", label: "Expense", href: "/expenses?add=1", icon: Receipt, color: "bg-orange-500" },
  { key: "i", label: "Income", href: "/income?new=1", icon: Wallet, color: "bg-green-600" },
  { key: "t", label: "Transfer", href: "/accounts?transfer=1", icon: ArrowLeftRight, color: "bg-blue-600" },
  { key: "l", label: "Lent / Borrowed", href: "/people?new=1", icon: HandCoins, color: "bg-violet-600" },
  { key: "c", label: "Office claim", href: "/expenses?add=1&reimbursable=1", icon: Briefcase, color: "bg-sky-600" },
  { key: "r", label: "Log rent", href: "/rent", icon: Home, color: "bg-teal-700" },
] as const;

function isTyping(el: EventTarget | null) {
  const t = el as HTMLElement | null;
  return !!t && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName));
}

/**
 * Floating "+" with the most common entries. Keyboard: N opens it, then the
 * letter shown next to an action (E, I, T, L, C, R) jumps there; Esc closes.
 */
export function QuickAdd({
  className,
  shortcuts = false,
  centered = false,
}: {
  className?: string;
  /** Listen for the N / letter shortcuts (only one instance on the page should). */
  shortcuts?: boolean;
  /** Centre the menu above the button (bottom tab bar) instead of right-aligning it. */
  centered?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!shortcuts && !open) return;
      if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return;
      const k = e.key.toLowerCase();
      if (k === "escape") return setOpen(false);
      if (!open && k === "n") {
        e.preventDefault();
        return setOpen(true);
      }
      if (open) {
        const action = QUICK_ACTIONS.find((a) => a.key === k);
        if (action) {
          e.preventDefault();
          setOpen(false);
          router.push(action.href);
        }
      }
    }
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onClick);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onClick);
    };
  }, [open, router, shortcuts]);

  return (
    <div ref={ref} className={cn("relative", className)}>
      {open && (
        <div
          className={cn(
            "absolute bottom-16 z-50 w-56 space-y-1 rounded-xl border bg-popover p-2 shadow-xl",
            centered ? "left-1/2 -translate-x-1/2" : "right-0"
          )}
        >
          {QUICK_ACTIONS.map((a) => (
            <button
              key={a.key}
              onClick={() => { setOpen(false); router.push(a.href); }}
              className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left text-sm transition-colors hover:bg-muted"
            >
              <span className={cn("flex h-8 w-8 items-center justify-center rounded-full text-white", a.color)}>
                <a.icon className="h-4 w-4" />
              </span>
              <span className="flex-1 font-medium">{a.label}</span>
              <kbd className="rounded border px-1.5 text-[10px] uppercase text-muted-foreground">{a.key}</kbd>
            </button>
          ))}
          {shortcuts && <p className="px-2 pt-1 text-[11px] text-muted-foreground">Press N anywhere to open this</p>}
        </div>
      )}
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? "Close quick add" : "Quick add"}
        aria-expanded={open}
        className="flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105 active:scale-95"
      >
        {open ? <X className="h-6 w-6" /> : <Plus className="h-6 w-6" />}
      </button>
    </div>
  );
}
