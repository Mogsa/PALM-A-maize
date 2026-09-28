import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../state/TagsProvider", () => ({ useTags: () => ({ tags: [{ id: "t-q", name: "question", colour: "#7C3AED" }] }) }));
import { SelectionPopover } from "./SelectionPopover";

afterEach(cleanup);
const base = { at: new DOMRect(100, 100, 0, 0), preview: "residual learning", busy: false, canHighlight: true, onCut: vi.fn(), onDismiss: vi.fn(), menu: [] };

describe("SelectionPopover (spec A2)", () => {
  it("reads: colour dots | ✂ 🔍 ›", () => {
    const { getByRole } = render(<SelectionPopover {...base} onHighlight={vi.fn()} onFind={vi.fn()}
      menu={[{ id: "add-tag", label: "Add tag", run: vi.fn() }]} />);
    const names = Array.from(getByRole("dialog", { name: "Selection" }).querySelectorAll("button")).map((b) => b.getAttribute("aria-label"));
    expect(names).toEqual(["Highlight", "question", "Cut", "Find", "More actions"]);
  });
  it("one tap on a colour highlights with that main tag; plain highlights with none", () => {
    const onHighlight = vi.fn();
    const { getByRole } = render(<SelectionPopover {...base} onHighlight={onHighlight} />);
    fireEvent.click(getByRole("button", { name: "question" }));
    fireEvent.click(getByRole("button", { name: "Highlight" }));
    expect(onHighlight.mock.calls).toEqual([["t-q"], [null]]);
  });
  it("a heading cannot be highlighted, only cut", () => {
    const { getByRole } = render(<SelectionPopover {...base} canHighlight={false} onHighlight={vi.fn()} />);
    expect((getByRole("button", { name: "question" }) as HTMLButtonElement).disabled).toBe(true);
    expect((getByRole("button", { name: "Cut" }) as HTMLButtonElement).disabled).toBe(false);
  });
});
