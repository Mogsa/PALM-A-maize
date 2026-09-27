import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { emptyBoard, type ChunkNode, type Source } from "../model/types";

vi.mock("./PageMargin", () => ({ Margin: () => null }));
import { PageOverlay } from "./PageOverlay";

const q = { exact: "x", prefix: "", suffix: "" };
const chunk = (id: string, source_id: string | null): ChunkNode => ({
  id, type: "chunk", position: { x: 0, y: 0 },
  data: { tags: [], collapsed: false, user_sized: false, blocks: [], source_id,
    region: { rects: [{ page: 0, rect: [0, 0, 10, 10] }], start: q, end: q, position: 0, state: "anchored" } },
});
const source = { pages: [], sections: [], figures: [], regions: [], page_text: [] } as unknown as Source;

afterEach(cleanup);

describe("PageOverlay outlines", () => {
  it("outlines only the reader's own cuts, not the pieces split made", () => {
    const board = { ...emptyBoard("p"), nodes: [chunk("n-split", "s-1"), chunk("n-cut", null)] };
    const { container } = render(<PageOverlay page={0} scale={1} board={board} source={source}
                                              onOutlineClick={() => undefined} onJump={() => undefined} onOpenNote={() => undefined} />);
    const ids = [...container.querySelectorAll(".outline")].map((el) => el.getAttribute("data-node-id"));
    expect(ids).toEqual(["n-cut"]);
  });
});
