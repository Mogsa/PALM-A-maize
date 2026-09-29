import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const source = {
  page_text: [
    { page: 0, text: "Our residual nets are deep." },
    { page: 1, text: "We evaluate 18-layer residual nets (ResNets)." },
  ],
  sections: [],
};
vi.mock("../state/BoardProvider", () => ({ useBoard: () => ({ source }) }));
import { FindPanel } from "./FindPanel";

afterEach(cleanup);

describe("FindPanel (D13, D25)", () => {
  it("lists the likely definition first, badged, and a pick still jumps to that hit", () => {
    const onPick = vi.fn();
    const { getAllByRole } = render(<FindPanel query="residual nets" onQuery={vi.fn()} onPick={onPick} onClose={() => undefined} />);
    const items = getAllByRole("listitem");
    expect(items[0].textContent).toContain("p2");
    expect(items[0].textContent).toContain("likely definition");
    expect(items[1].textContent).not.toContain("likely definition");
    fireEvent.click(items[0].querySelector("button")!);
    expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ page: 1, match: "residual nets" }), 0);
  });

  it("shows the words in a field that can be typed into, and an empty query lists nothing", () => {
    const onQuery = vi.fn();
    const { getByRole, queryAllByRole } = render(<FindPanel query="" onQuery={onQuery} onPick={vi.fn()} onClose={() => undefined} />);
    expect(queryAllByRole("listitem")).toHaveLength(0);
    fireEvent.change(getByRole("textbox", { name: "Find words" }), { target: { value: "residual" } });
    expect(onQuery).toHaveBeenCalledWith("residual");
  });
});
