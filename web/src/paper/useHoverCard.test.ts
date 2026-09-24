import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CARD_CLOSE_DELAY_MS, CARD_OPEN_DELAY_MS, useHoverCard, type CardContent } from "./useHoverCard";

const at = new DOMRect(1, 2, 3, 4);
const words = (text: string): CardContent => ({ kind: "words", text, clip: null, failed: false, go: { page: 0, rect: [0, 0, 0, 0] } });

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe("useHoverCard: one card at a time, opened by a pause on a thing and closed by leaving it", () => {
  it("opens after CARD_OPEN_DELAY_MS on the thing, not before", () => {
    const { result } = renderHook(() => useHoverCard());
    act(() => result.current.arrive("a", () => result.current.open("a", at, words("A"))));
    expect(result.current.card).toBeNull();
    act(() => { vi.advanceTimersByTime(CARD_OPEN_DELAY_MS); });
    expect(result.current.card).toMatchObject({ key: "a", content: { text: "A" } });
  });
  it("opens at once for a keyboard focus", () => {
    const { result } = renderHook(() => useHoverCard());
    act(() => result.current.arrive("a", () => result.current.open("a", at, words("A")), true));
    expect(result.current.card?.key).toBe("a");
  });
  it("closes CARD_CLOSE_DELAY_MS after leaving, unless the mouse comes onto the card", () => {
    const { result } = renderHook(() => useHoverCard());
    act(() => result.current.arrive("a", () => result.current.open("a", at, words("A")), true));
    act(() => result.current.depart());
    act(() => result.current.cardHandlers.onEnter());
    act(() => { vi.advanceTimersByTime(CARD_CLOSE_DELAY_MS); });
    expect(result.current.card).not.toBeNull();
    act(() => result.current.cardHandlers.onLeave());
    act(() => { vi.advanceTimersByTime(CARD_CLOSE_DELAY_MS); });
    expect(result.current.card).toBeNull();
  });
  it("never shows a card for a thing the mouse has already left for another", () => {
    const { result } = renderHook(() => useHoverCard());
    act(() => result.current.arrive("a", () => result.current.open("a", at, words("A")), true));
    act(() => result.current.arrive("b", () => undefined));
    expect(result.current.card).toBeNull();
    act(() => result.current.open("a", at, words("late")));
    expect(result.current.card).toBeNull();
  });
  it("updates only its own card's content", () => {
    const { result } = renderHook(() => useHoverCard());
    act(() => result.current.arrive("a", () => result.current.open("a", at, words("A")), true));
    act(() => result.current.update("b", () => words("B")));
    expect(result.current.card?.content).toMatchObject({ text: "A" });
    act(() => result.current.update("a", () => words("A2")));
    expect(result.current.card?.content).toMatchObject({ text: "A2" });
  });
});
