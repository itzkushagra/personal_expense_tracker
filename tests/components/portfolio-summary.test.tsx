// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { PortfolioSummaryCards } from "@/components/investments/portfolio-summary";
import type { PortfolioSummary } from "@/lib/portfolio";

afterEach(cleanup);

const base: PortfolioSummary = {
  invested: 100000,
  current_value: 112500,
  unrealized_gain: 12500,
  unrealized_pct: 12.5,
  realized_gain: -800,
  allocation: [
    { asset_type: "mutual_fund", value: 90000, pct: 80 },
    { asset_type: "gold", value: 22500, pct: 20 },
  ],
  by_fund_category: [],
  holding_count: 2,
};

describe("PortfolioSummaryCards (mocked data)", () => {
  it("shows invested, value, and signed gains with their colours", () => {
    render(<PortfolioSummaryCards summary={base} />);
    expect(screen.getByTestId("portfolio-invested").textContent).toBe("₹1,00,000");
    expect(screen.getByTestId("portfolio-current-value").textContent).toBe("₹1,12,500");
    const gain = screen.getByTestId("portfolio-unrealised-gain");
    expect(gain.textContent).toBe("+₹12,500");
    expect(gain.className).toContain("text-green-600");
    expect(screen.getByText("+12.5%")).toBeTruthy();
    const realised = screen.getByTestId("portfolio-realised-gain");
    expect(realised.textContent).toBe("−₹800");
    expect(realised.className).toContain("text-destructive");
  });

  it("lists allocation by asset type", () => {
    render(<PortfolioSummaryCards summary={base} />);
    expect(screen.getByRole("img", { name: "Portfolio allocation" })).toBeTruthy();
    expect(screen.getByText("Mutual fund")).toBeTruthy();
    expect(screen.getByText("₹90,000 · 80%")).toBeTruthy();
    expect(screen.getByText("Gold")).toBeTruthy();
  });

  it("an empty portfolio shows zeros and no allocation", () => {
    render(
      <PortfolioSummaryCards
        summary={{ ...base, invested: 0, current_value: 0, unrealized_gain: 0, unrealized_pct: null, realized_gain: 0, allocation: [], holding_count: 0 }}
      />
    );
    expect(screen.getByTestId("portfolio-current-value").textContent).toBe("₹0");
    expect(screen.getByText("—")).toBeTruthy();
    expect(screen.queryByRole("img", { name: "Portfolio allocation" })).toBeNull();
  });
});
