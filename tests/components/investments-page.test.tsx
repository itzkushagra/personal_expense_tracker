// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import type { PortfolioData } from "@/lib/investments";
import { summarizeHolding, summarizePortfolio } from "@/lib/portfolio";

// No network and no Supabase: account pickers and toasts are stubbed, fetch is mocked per test.
vi.mock("@/components/account-select", () => ({
  useAccounts: () => ({ accounts: [], loaded: true, defaultId: null }),
  AccountSelect: () => null,
  refreshAccounts: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import InvestmentsPage from "@/app/(app)/investments/page";

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const respond = (status: number, body: unknown) =>
  fetchMock.mockResolvedValueOnce({ ok: status < 400, status, json: async () => body });

const empty: PortfolioData = {
  available: true,
  sips_available: true,
  sips: [],
  holdings: [],
  summary: summarizePortfolio([]),
  legacy: { count: 0, total: 0 },
};

function holding(name: string, price: number | null, txns: { type: "buy" | "sell" | "opening"; quantity: number; price: number }[]) {
  const transactions = txns.map((t, i) => ({
    id: `${name}-${i}`,
    user_id: "u",
    holding_id: name,
    date: `2026-0${i + 1}-01`,
    fees: 0,
    account_id: t.type === "opening" ? null : "acc",
    note: "",
    created_at: "",
    updated_at: "",
    ...t,
  }));
  return {
    id: name,
    user_id: "u",
    name,
    asset_type: "mutual_fund" as const,
    symbol: "",
    current_price: price,
    valued_on: price === null ? null : "2026-11-10",
    note: "",
    is_active: true,
    created_at: "",
    updated_at: "",
    transactions,
    summary: summarizeHolding({ current_price: price }, transactions),
  };
}

describe("Investments page (mocked API)", () => {
  it("shows a spinner, then the empty state", async () => {
    respond(200, { data: empty });
    const { container } = render(<InvestmentsPage />);
    expect(container.querySelector(".animate-spin")).toBeTruthy();
    expect(await screen.findByText(/No holdings yet/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Add holding/ })).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith("/api/investments", expect.objectContaining({ method: "GET" }));
  });

  it("explains when the portfolio migration hasn't been applied, with no way to add holdings", async () => {
    respond(200, { data: { ...empty, available: false } });
    render(<InvestmentsPage />);
    expect(await screen.findByText(/20261110200100_investment_portfolio/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Add holding/ })).toBeNull();
  });

  it("shows the server's error instead of an empty portfolio", async () => {
    respond(500, { error: "database unavailable" });
    render(<InvestmentsPage />);
    expect(await screen.findByText(/Couldn.t load your portfolio: database unavailable/)).toBeTruthy();
    expect(screen.queryByText(/No holdings yet/)).toBeNull();
  });

  it("points out investment expenses recorded before portfolio tracking", async () => {
    respond(200, { data: { ...empty, legacy: { count: 3, total: 15000 } } });
    render(<InvestmentsPage />);
    expect(await screen.findByText(/3 "Investments" expenses totalling ₹15,000/)).toBeTruthy();
  });

  it("lists holdings with value, gain, and at-cost valuation", async () => {
    const priced = holding("Index fund", 120, [{ type: "buy", quantity: 10, price: 100 }]);
    const atCost = holding("Gold bond", null, [{ type: "opening", quantity: 2, price: 5000 }]);
    const soldOut = holding("Old stock", 50, [
      { type: "buy", quantity: 1, price: 40 },
      { type: "sell", quantity: 1, price: 45 },
    ]);
    const data = { ...empty, holdings: [priced, atCost, soldOut], summary: summarizePortfolio([priced, atCost, soldOut]) };
    respond(200, { data });
    render(<InvestmentsPage />);

    await waitFor(() => expect(screen.getAllByTestId("holding")).toHaveLength(3));
    expect(screen.getByText(/\+₹200 \(20\.0%\) on ₹1,000/)).toBeTruthy();
    expect(screen.getByText(/valued at cost \(no price entered\)/)).toBeTruthy();
    // Portfolio totals: 1,200 + 10,000 at cost.
    expect(screen.getByTestId("portfolio-current-value").textContent).toBe("₹11,200");
    // Nothing left to sell in a sold-out holding.
    const rows = screen.getAllByTestId("holding");
    const sellButtons = rows.map((r) => r.querySelector("button:nth-of-type(2)") as HTMLButtonElement);
    expect(sellButtons.map((b) => b.textContent)).toEqual(["Sell", "Sell", "Sell"]);
    expect(sellButtons.map((b) => b.disabled)).toEqual([false, false, true]);
  });
});
