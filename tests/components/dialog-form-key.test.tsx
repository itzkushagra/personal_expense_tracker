// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { Input } from "@/components/ui/input";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/**
 * Edit dialogs (Income, People & Loans, Goals, Accounts) fill their fields with defaultValue from
 * the record being edited and clear that record when they close. Changing a mounted field's
 * defaultValue makes Base UI log a console error; keying the form on the record remounts it instead.
 */
function EditForm({ record, keyed }: { record: { id: string; amount: number } | null; keyed: boolean }) {
  return (
    <form key={keyed ? record?.id ?? "new" : undefined}>
      <label htmlFor="amt">Amount</label>
      <Input id="amt" name="amount" defaultValue={record?.amount ?? ""} />
    </form>
  );
}

const baseUiWarnings = (spy: ReturnType<typeof vi.spyOn>) =>
  spy.mock.calls.filter((c: unknown[]) => String(c[0]).includes("changing the default value state")).length;

describe("edit dialog forms", () => {
  it("without a key, closing an edit (record → none) triggers the Base UI warning", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const { rerender } = render(<EditForm record={{ id: "a", amount: 500 }} keyed={false} />);
    rerender(<EditForm record={null} keyed={false} />);
    expect(baseUiWarnings(error)).toBeGreaterThan(0);
  });

  it("keyed on the record, switching or clearing it gives fresh fields and no warning", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const { rerender } = render(<EditForm record={{ id: "a", amount: 500 }} keyed />);
    expect((screen.getByLabelText("Amount") as HTMLInputElement).value).toBe("500");
    rerender(<EditForm record={{ id: "b", amount: 750 }} keyed />);
    expect((screen.getByLabelText("Amount") as HTMLInputElement).value).toBe("750");
    rerender(<EditForm record={null} keyed />);
    expect((screen.getByLabelText("Amount") as HTMLInputElement).value).toBe("");
    expect(baseUiWarnings(error)).toBe(0);
  });
});
