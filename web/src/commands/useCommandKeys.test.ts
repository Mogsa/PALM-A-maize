import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useCommandKeys } from "./useCommandKeys";

afterEach(cleanup);

describe("useCommandKeys (Review Focus 5)", () => {
  it("⌘K and Ctrl-K open the palette, even from a text field", () => {
    const onPalette = vi.fn();
    renderHook(() => useCommandKeys({ onPalette, onShortcuts: vi.fn() }));
    const field = document.body.appendChild(document.createElement("input"));
    field.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true, bubbles: true }));
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "K", ctrlKey: true }));
    expect(onPalette).toHaveBeenCalledTimes(2);
    field.remove();
  });
  it("? opens the shortcuts, but not while typing", () => {
    const onShortcuts = vi.fn();
    renderHook(() => useCommandKeys({ onPalette: vi.fn(), onShortcuts }));
    const field = document.body.appendChild(document.createElement("textarea"));
    field.dispatchEvent(new KeyboardEvent("keydown", { key: "?", bubbles: true }));
    expect(onShortcuts).not.toHaveBeenCalled();
    document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "?", bubbles: true }));
    expect(onShortcuts).toHaveBeenCalledTimes(1);
    field.remove();
  });
});
