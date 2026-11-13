// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { HoldingWithSummary, SipWithStatus } from "@/lib/investments";
import { summarizeHolding } from "@/lib/portfolio";

vi.mock("@/components/account-select", () => ({
  useAccounts: () => ({ accounts: [{ id: "sbi", name: "SBI" }], loaded: true, defaultId: "sbi" }),
  AccountSelect: () => null,
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { SipSection } from "@/components/investments/sip-section";

afterEach(cleanup);

const holding = (id: string, name: string): HoldingWithSummary => ({
  id,
  user_id: "u",
  name,
  asset_type: "mutual_fund",
  fund_category: "small_cap",
  symbol: "",
  current_price: null,
  valued_on: null,
  note: "",
  is_active: true,
  created_at: "",
  updated_at: "",
  transactions: [],
  summary: summarizeHolding({ current_price: null }, []),
});

const sip = (id: string, name: string, amount: number, day: number, status: SipWithStatus["status"], is_active = true): SipWithStatus => ({
  id,
  user_id: "u",
  holding_id: `h-${id}`,
  holding_name: name,
  amount,
  day_of_month: day,
  account_id: "sbi",
  start_date: "2026-01-01",
  is_active,
  note: "",
  created_at: "",
  updated_at: "",
  status,
});

describe("SipSection (mocked data)", () => {
  const sips = [
    sip("a", "Small cap fund", 5000, 5, { due_date: "2026-11-05", state: "due" }),
    sip("b", "Mid cap fund", 3000, 25, { due_date: "2026-11-25", state: "upcoming" }),
    sip("c", "Large cap fund", 2000, 1, { due_date: "2026-11-01", state: "logged", logged: { id: "t", quantity: 20.5, price: 97.5 } }),
    sip("d", "Old fund", 1000, 10, { due_date: "2026-11-10", state: "paused" }, false),
  ];

  it("totals active SIPs and shows each one's state this month", () => {
    render(<SipSection sips={sips} holdings={[holding("h-a", "Small cap fund")]} onChanged={vi.fn()} />);
    expect(screen.getByTestId("sip-total").textContent).toBe("₹10,000 a month across 3 SIPs · 1 to log");
    const rows = screen.getAllByTestId("sip");
    expect(rows).toHaveLength(4);
    expect(rows[0].textContent).toContain("₹5,000 on the 5th · from SBI");
    expect(rows[0].textContent).toContain("Due");
    expect(rows[1].textContent).toContain("Upcoming");
    expect(rows[2].textContent).toContain("20.5 units at ₹97.5");
    expect(rows[3].textContent).toContain("Paused");
    expect(screen.getByRole("button", { name: "Log now" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Log early" })).toBeTruthy();
  });

  it("works out the units as you type the NAV", async () => {
    render(<SipSection sips={sips} holdings={[holding("h-a", "Small cap fund")]} onChanged={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Log now" }));
    expect((await screen.findByTestId("sip-units")).textContent).toBe("Enter the NAV to see the units");
    expect((screen.getByLabelText("Amount (₹)") as HTMLInputElement).value).toBe("5000");
    fireEvent.change(screen.getByLabelText("NAV (₹ per unit)"), { target: { value: "87.6543" } });
    expect(screen.getByTestId("sip-units").textContent).toBe("57.0423 units");
  });

  it("asks for a fund before a SIP can be added", () => {
    render(<SipSection sips={[]} holdings={[]} onChanged={vi.fn()} />);
    expect(screen.getByText(/Add a fund first/)).toBeTruthy();
    expect((screen.getByRole("button", { name: /Add SIP/ }) as HTMLButtonElement).disabled).toBe(true);
  });
});
