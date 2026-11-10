"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  LayoutDashboard,
  Receipt,
  Lightbulb,
  LogOut,
  Wallet,
  Menu,
  X,
  Landmark,
  PieChart,
  Target,
  CalendarClock,
  BarChart3,
  Home,
  HandCoins,
  Briefcase,
  Banknote,
  CalendarRange,
  Settings,
  PlusCircle,
} from "lucide-react";
import { useState } from "react";
import { ThemeToggle } from "@/components/theme-toggle";

const navGroups = [
  {
    title: "Overview",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { href: "/yearly", label: "Yearly", icon: CalendarRange },
      { href: "/reports", label: "Reports", icon: BarChart3 },
    ],
  },
  {
    title: "Money",
    items: [
      { href: "/expenses", label: "Expenses", icon: Receipt },
      { href: "/income", label: "Income", icon: Banknote },
      { href: "/accounts", label: "Accounts", icon: Landmark },
      { href: "/people", label: "People & Loans", icon: HandCoins },
      { href: "/reimbursements", label: "Reimbursements", icon: Briefcase },
    ],
  },
  {
    title: "Plan",
    items: [
      { href: "/budgets", label: "Budgets", icon: PieChart },
      { href: "/bills", label: "Bills", icon: CalendarClock },
      { href: "/goals", label: "Goals", icon: Target },
      { href: "/rent", label: "Rent & Home", icon: Home },
    ],
  },
  {
    title: "More",
    items: [
      { href: "/tips", label: "Saving Tips", icon: Lightbulb },
      { href: "/settings", label: "Settings & Data", icon: Settings },
    ],
  },
];

/** A section is active on its own page and any page below it (e.g. /accounts/<id>). */
function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(href + "/");
}

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();
  const [mobileOpen, setMobileOpen] = useState(false);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const nav = (
    <>
      <div className="flex items-center gap-2 px-4 py-5">
        <Wallet className="h-7 w-7 text-primary" />
        <span className="text-xl font-bold">SpendWise</span>
      </div>
      <div className="px-3 pb-3">
        {/* Adding happens in the pop-up on the Expenses page. */}
        <Link href="/expenses?add=1" onClick={() => setMobileOpen(false)}>
          <Button className="w-full justify-start gap-2">
            <PlusCircle className="h-4 w-4" /> Add Expense
          </Button>
        </Link>
      </div>
      <nav className="flex-1 space-y-4 overflow-y-auto px-2 pb-4">
        {navGroups.map((group) => (
          <div key={group.title} className="space-y-0.5">
            <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
              {group.title}
            </p>
            {group.items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  isActive(pathname, item.href)
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            ))}
          </div>
        ))}
      </nav>
      <div className="space-y-2 border-t p-4">
        <div className="flex items-center justify-between px-3">
          <span className="text-sm text-muted-foreground">Theme</span>
          <ThemeToggle />
        </div>
        <Button
          variant="ghost"
          className="w-full justify-start gap-2 text-muted-foreground"
          onClick={handleLogout}
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </Button>
      </div>
    </>
  );

  return (
    <>
      {/* Mobile toggle */}
      <button
        className="fixed left-4 top-4 z-50 rounded-lg bg-background p-2 shadow-md md:hidden"
        onClick={() => setMobileOpen(!mobileOpen)}
        aria-label={mobileOpen ? "Close menu" : "Open menu"}
      >
        {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Mobile sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r bg-background transition-transform duration-200 md:hidden",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {nav}
      </aside>

      {/* Desktop sidebar */}
      <aside className="hidden md:flex md:w-64 md:flex-col md:border-r md:bg-background">
        {nav}
      </aside>
    </>
  );
}

const mobileTabs = [
  { href: "/dashboard", label: "Home", icon: LayoutDashboard },
  { href: "/expenses", label: "Expenses", icon: Receipt },
  { href: "/income", label: "Income", icon: Banknote },
  { href: "/accounts", label: "Accounts", icon: Landmark },
];

/** Bottom tab bar on phones; the quick-add button sits in the middle. */
export function MobileTabBar({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const tab = (t: (typeof mobileTabs)[number]) => (
    <Link
      key={t.href}
      href={t.href}
      className={cn(
        "flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium",
        isActive(pathname, t.href) ? "text-primary" : "text-muted-foreground"
      )}
    >
      <t.icon className="h-5 w-5" />
      {t.label}
    </Link>
  );
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 flex items-end border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
      {mobileTabs.slice(0, 2).map(tab)}
      <div className="-mt-6 flex flex-1 justify-center">{children}</div>
      {mobileTabs.slice(2).map(tab)}
    </div>
  );
}
