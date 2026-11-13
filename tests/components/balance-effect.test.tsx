// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { BalanceEffect } from "@/components/balance-effect";

afterEach(cleanup);

describe("BalanceEffect", () => {
  it("offers adding the money or keeping a record of money already there", () => {
    const onChange = vi.fn();
    render(<BalanceEffect movesBalance direction="in" onChange={onChange} />);
    const [add, already] = screen.getAllByRole("radio");
    expect(add.textContent).toContain("Add to the balance");
    expect(add.getAttribute("aria-checked")).toBe("true");
    expect(already.textContent).toContain("Already in the balance");
    fireEvent.click(already);
    expect(onChange).toHaveBeenCalledWith(false);
  });

  it("speaks of taking money out for payments", () => {
    render(<BalanceEffect movesBalance={false} direction="out" onChange={vi.fn()} />);
    const [take, already] = screen.getAllByRole("radio");
    expect(take.textContent).toContain("Take from the balance");
    expect(already.getAttribute("aria-checked")).toBe("true");
    expect(already.textContent).toContain("already taken out");
  });
});
