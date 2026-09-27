import { cleanup, fireEvent, render } from "@testing-library/react";
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

const tray = { id: "n-tray", type: "group" as const, position: { x: 0, y: 0 }, data: { tags: [], name: "Paper", tray: true } };
const draw = (onOpen = vi.fn()) => {
  const board = { ...emptyBoard("p"), nodes: [tray, { ...chunk("n-split", "s-1"), parentId: "n-tray" }, chunk("n-cut", null)] };
  return render(<PageOverlay page={0} scale={2} board={board} source={source} onOutlineClick={onOpen} onJump={() => undefined} onOpenNote={() => undefined} />);
};

describe("PageOverlay cut ruler", () => {
  it("draws one stretch per piece, faint in the tray and solid out of it, with ticks and no label or box over the text", () => {
    const { container } = draw();
    expect(container.querySelectorAll(".cut-ruler")).toHaveLength(1);
    const stretches = [...container.querySelectorAll(".cut-stretch")];
    expect(stretches.map((el) => [el.getAttribute("data-node-id"), el.classList.contains("tray")])).toEqual([["n-split", true], ["n-cut", false]]);
    expect((stretches[1] as HTMLElement).style.height).toBe("20px");   // 10pt at scale 2
    expect([...container.querySelectorAll<HTMLElement>(".cut-tick")].map((t) => t.style.top)).toEqual(["0px", "20px"]);
    expect(container.querySelector(".cut-tint")).toBeNull();
    expect(container.querySelector(".cut-tip")).toBeNull();
    expect(container.textContent).toBe("");
  });
  it("shows the name and tints the piece's lines while hovered or focused, and opens it on click", () => {
    const onOpen = vi.fn();
    const { container, getAllByRole } = draw(onOpen);
    const stretch = getAllByRole("button", { name: "Open this piece: x" })[1];
    fireEvent.mouseEnter(stretch);
    expect(container.querySelectorAll(".cut-tint")).toHaveLength(1);
    expect(container.querySelector(".cut-tip")?.textContent).toBe("x");
    fireEvent.mouseLeave(stretch);
    expect(container.querySelector(".cut-tip")).toBeNull();
    fireEvent.focus(stretch);
    expect(container.querySelectorAll(".cut-tint")).toHaveLength(1);
    fireEvent.click(stretch);
    expect(onOpen).toHaveBeenCalledWith("n-cut");
  });
});
