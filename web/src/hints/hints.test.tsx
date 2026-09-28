import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Hint } from "./Hint";
import { closeHint, HINT_TEXT, resetHintsForTest } from "./hints";

beforeEach(() => { window.localStorage.clear(); resetHintsForTest(); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("hints (spec A4)", () => {
  it("shows when it applies, and not before", () => {
    const { queryByRole, rerender } = render(<Hint id="connect" when={false} />);
    expect(queryByRole("note")).toBeNull();
    rerender(<Hint id="connect" when />);
    expect(queryByRole("note")?.textContent).toContain(HINT_TEXT.connect);
  });
  it("is shown once: once it has gone, it never comes back, even after a reload", () => {
    const { queryByRole, rerender, unmount } = render(<Hint id="connect" when />);
    rerender(<Hint id="connect" when={false} />);
    rerender(<Hint id="connect" when />);
    expect(queryByRole("note")).toBeNull();
    unmount();
    resetHintsForTest();   // a reload: only browser storage is left
    expect(render(<Hint id="connect" when />).queryByRole("note")).toBeNull();
  });
  it("goes when its gesture is done, or when dismissed", () => {
    const first = render(<Hint id="dblclick-note" when />);
    act(() => closeHint("dblclick-note"));
    expect(first.queryByRole("note")).toBeNull();
    const second = render(<Hint id="drag-cut" when />);
    fireEvent.click(second.getByRole("button", { name: "Dismiss hint" }));
    expect(second.queryByRole("note")).toBeNull();
  });
  it("still works, for this session, when browser storage throws (Review Focus 3)", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
    resetHintsForTest();
    const { queryByRole, rerender } = render(<Hint id="connect" when />);
    expect(queryByRole("note")).not.toBeNull();
    rerender(<Hint id="connect" when={false} />);
    rerender(<Hint id="connect" when />);
    expect(queryByRole("note")).toBeNull();
  });
});
