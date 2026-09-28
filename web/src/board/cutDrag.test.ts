import { afterEach, describe, expect, it, vi } from "vitest";
import { CUT_DRAG_TYPE, isCutDrag, offerCut, takeCut, withdrawCut } from "./cutDrag";

afterEach(withdrawCut);

describe("a cut carried from the paper or a card to the board (Review Focus 4)", () => {
  it("is taken once: a later drop never replays it", () => {
    const drop = vi.fn(async () => undefined);
    offerCut(drop);
    expect(takeCut()).toBe(drop);
    expect(takeCut()).toBeNull();
  });
  it("a drag that ends elsewhere withdraws it", () => {
    offerCut(vi.fn(async () => undefined));
    withdrawCut();
    expect(takeCut()).toBeNull();
  });
  it("only a drag of ours is a cut", () => {
    expect(isCutDrag([CUT_DRAG_TYPE, "text/plain"])).toBe(true);
    expect(isCutDrag(["text/plain"])).toBe(false);
  });
});
