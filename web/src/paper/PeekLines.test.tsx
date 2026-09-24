import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PageRect } from "../model/types";

const postText = vi.fn(async (_id: string, rects: PageRect[]) => ({ text: rects[0].rect[1] < 200 ? "the line\nbefore." : "the line after." }));
vi.mock("../api/client", () => ({ api: { postText: (...args: [string, PageRect[]]) => postText(...args) } }));
const source = { pages: [0, 1, 2].map((index) => ({ index, width: 612, height: 792, rotation: 0 })), regions: [{ page: 2, rect: [50, 100, 286, 400], label: "text" }] };
const words = new Set<string>();
vi.mock("../state/BoardProvider", () => ({ useBoard: () => ({ source, paperId: "p", words }) }));
import { PeekButton, PeekText, usePeek } from "./PeekLines";

const rects: PageRect[] = [{ page: 2, rect: [50, 200, 286, 250] }];
function Piece() {
  const peek = usePeek(rects);
  return <div><PeekButton peek={peek} /><PeekText peek={peek} side="before" /><p>the piece</p><PeekText peek={peek} side="after" /></div>;
}

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("Peek (D28): the paper's own lines either side of a piece, in place", () => {
  it("shows nothing until asked, then the lines before and after, dimmed, read under the peek rects", async () => {
    const { getByRole, container } = render(<Piece />);
    expect(container.querySelectorAll(".peek")).toHaveLength(0);
    await act(async () => { fireEvent.click(getByRole("button", { name: "More context" })); });
    expect(postText).toHaveBeenCalledWith("p", [{ page: 2, rect: [50, 164, 286, 200] }], false, "text");
    expect(postText).toHaveBeenCalledWith("p", [{ page: 2, rect: [50, 250, 286, 286] }], false, "text");
    expect(Array.from(container.querySelectorAll(".peek")).map((p) => p.textContent)).toEqual(["the line before.", "the line after."]);
    expect(container.textContent!.indexOf("before.")).toBeLessThan(container.textContent!.indexOf("the piece"));
  });
  it("collapses on a second click, and on Escape", async () => {
    const { getByRole, container } = render(<Piece />);
    await act(async () => { fireEvent.click(getByRole("button", { name: "More context" })); });
    fireEvent.click(getByRole("button", { name: "Less context" }));
    expect(container.querySelectorAll(".peek")).toHaveLength(0);
    await act(async () => { fireEvent.click(getByRole("button", { name: "More context" })); });
    fireEvent.keyDown(window, { key: "Escape" });
    expect(container.querySelectorAll(".peek")).toHaveLength(0);
  });
});
