import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { emptyBoard, type ChunkNode, type Source } from "../model/types";

vi.mock("./PageMargin", () => ({ Margin: () => null }));
vi.mock("../state/TagsProvider", () => ({
  useTags: () => ({ byId: new Map([["t-q", { id: "t-q", name: "question", colour: "#7C3AED" }], ["t-s", { id: "t-s", name: "supports", colour: "#15803D" }]]) }),
}));
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
  it("draws one stretch per piece, solid even in the Paper group while trays are off, with ticks and no label or box over the text", () => {
    const { container } = draw();
    expect(container.querySelectorAll(".cut-ruler")).toHaveLength(1);
    const stretches = [...container.querySelectorAll(".cut-stretch")];
    expect(stretches.map((el) => [el.getAttribute("data-node-id"), el.classList.contains("tray")])).toEqual([["n-split", false], ["n-cut", false]]);
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

describe("PageOverlay marks (spec A2)", () => {
  const mark = (tags: string[]) => ({ id: "h-1", tags, anchor: { rects: [{ page: 0, rect: [0, 0, 10, 10] as [number, number, number, number] }], quote: q, position: 0, state: "anchored" as const } });
  const drawMark = (tags: string[]) => render(<PageOverlay page={0} scale={1} board={{ ...emptyBoard("p"), highlights: [mark(tags)] }} source={source}
    onOutlineClick={vi.fn()} onJump={() => undefined} onOpenNote={() => undefined} />);
  it("paints a mark in its main tag's colour, and plain yellow with no tag", () => {
    const { container, unmount } = drawMark(["t-q"]);
    expect((container.querySelector(".mark") as HTMLElement).style.getPropertyValue("--mark-colour")).toBe("#7C3AED");
    unmount();
    const plain = drawMark([]);
    expect((plain.container.querySelector(".mark") as HTMLElement).style.getPropertyValue("--mark-colour")).toBe("");
  });
  it("shows each extra tag as a small chip and leaves the colour alone", () => {
    const { container } = drawMark(["t-q", "t-s"]);
    const chips = container.querySelectorAll(".mark-extras .mark-extra");
    expect(chips).toHaveLength(1);
    expect((chips[0] as HTMLElement).title).toBe("supports");
  });
});

describe("PageOverlay AI underlines", () => {
  const renderOverlay = (aiLines: { term: string; at: { page: number; rect: [number, number, number, number] } }[]) =>
    render(<PageOverlay page={0} scale={1} board={emptyBoard("p")} source={source} aiLines={aiLines}
      onOutlineClick={() => undefined} onJump={() => undefined} onOpenNote={() => undefined} />);
  it("draws a dotted AI underline except where the reader's term mark is", () => {
    const { container } = renderOverlay([{ term: "residual", at: { page: 0, rect: [300, 10, 340, 20] } }]);
    expect(container.querySelectorAll(".ai-term")).toHaveLength(1);
    expect(renderOverlay([]).container.querySelectorAll(".ai-term")).toHaveLength(0);
  });
});

describe("PageOverlay key sentences", () => {
  const line = (page: number, y: number) => ({ page, rect: [50, y, 300, y + 10] as [number, number, number, number] });
  const sentence = (lines: ReturnType<typeof line>[]) => ({ slot: "Problem", colour: "var(--slot-0)", quote: "q.", page: 0, lines, at: line(0, 0) });
  const renderKeys = (keySentences: ReturnType<typeof sentence>[]) =>
    render(<PageOverlay page={0} scale={2} board={emptyBoard("p")} source={source} keySentences={keySentences}
      onOutlineClick={() => undefined} onJump={() => undefined} onOpenNote={() => undefined} />);
  it("draws one AI rect per line on this page only, in the slot's colour, with no hover title (the overlay takes no pointer)", () => {
    const { container } = renderKeys([sentence([line(0, 100), line(0, 112), line(1, 10)])]);
    const rects = [...container.querySelectorAll<HTMLElement>(".key-sentence")];
    expect(rects).toHaveLength(2);
    expect(rects[0].hasAttribute("title")).toBe(false);   // the slot is named in the Key sentences panel
    expect(rects[0].style.getPropertyValue("--key-colour")).toBe("var(--slot-0)");
    expect(rects[1].style.top).toBe("224px");   // 112pt at scale 2
    expect(container.querySelector(".mark")).toBeNull();   // never drawn as the reader's own
  });
  it("draws nothing for a sentence whose lines were not found, or with none given", () => {
    expect(renderKeys([sentence([])]).container.querySelectorAll(".key-sentence")).toHaveLength(0);
    expect(draw().container.querySelectorAll(".key-sentence")).toHaveLength(0);
  });
});
