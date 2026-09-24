import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { emptyBoard } from "../model/types";
import type { HoverCard, OpenCard } from "./useHoverCard";

const words = new Set(["middle"]);
vi.mock("../state/BoardProvider", () => ({ useBoard: () => ({ paperId: "p", state: { board: emptyBoard("p") }, words }) }));
import { ContextCard } from "./ContextCard";

const hover = { close: vi.fn(), cardHandlers: { onEnter: vi.fn(), onLeave: vi.fn(), onClose: vi.fn() } } as unknown as HoverCard;
const card = (text: string): OpenCard => ({
  key: "k", at: new DOMRect(0, 0, 1, 1),
  content: { kind: "words", text, clip: { page: 3, rect: [1, 2, 3, 4] }, failed: false, go: { page: 3, rect: [0, 2, 0, 2] } },
});

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("ContextCard (D26)", () => {
  it("shows the paper's words as prose, a line break a space and a line-end hyphen joined as the paper spells the word", () => {
    const { getByRole } = render(<ContextCard card={card("Figure 3. Left: the\nVGG-19 model. Mid-\ndle: a plain network.")} hover={hover} onGo={vi.fn()} onOpenNote={vi.fn()} />);
    expect(getByRole("dialog").querySelector(".citation-text")!.textContent).toBe("Figure 3. Left: the VGG-19 model. Middle: a plain network.");
    expect(getByRole("img").getAttribute("src")).toContain("/render?page=3&x0=1&y0=2&x1=3&y1=4");
  });
  it("goes where its content says, and closes", () => {
    const onGo = vi.fn();
    const { getByRole } = render(<ContextCard card={card("x")} hover={hover} onGo={onGo} onOpenNote={vi.fn()} />);
    fireEvent.click(getByRole("button", { name: "Go there" }));
    expect(onGo).toHaveBeenCalledWith({ page: 3, rect: [0, 2, 0, 2] });
    expect(hover.close).toHaveBeenCalled();
  });
});
