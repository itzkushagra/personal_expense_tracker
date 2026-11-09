"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  LayoutDashboard,
  Receipt,
  PlusCircle,
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
} from "lucide-react";
import { useState } from "react";
import { ThemeToggle } from "@/components/theme-toggle";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/expenses", label: "Expenses", icon: Receipt },
  { href: "/expenses/add", label: "Add Expense", icon: PlusCircle },
  { href: "/rent", label: "Rent & Home", icon: Home },
  { href: "/accounts", label: "Accounts", icon: Landmark },
  { href: "/held-money", label: "Held Money", icon: HandCoins },
  { href: "/reimbursements", label: "Reimbursements", icon: Briefcase },
  { href: "/budgets", label: "Budgets", icon: PieChart },
  { href: "/goals", label: "Goals", icon: Target },
  { href: "/bills", label: "Bills", icon: CalendarClock },
  { href: "/reports", label: "Reports", icon: BarChart3 },
  { href: "/tips", label: "Saving Tips", icon: Lightbulb },
];

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
      <div className="flex items-center gap-2 px-4 py-6">
        <Wallet className="h-7 w-7 text-primary" />
        <span className="text-xl font-bold">SpendWise</span>
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto px-2">
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => setMobileOpen(false)}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
              pathname === item.href
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            <item.icon className="h-4 w-4" />
            {item.label}
          </Link>
        ))}
      </nav>
      <div className="border-t p-4 space-y-2">
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
        className="fixed top-4 left-4 z-50 rounded-lg bg-background p-2 shadow-md md:hidden"
        onClick={() => setMobileOpen(!mobileOpen)}
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
