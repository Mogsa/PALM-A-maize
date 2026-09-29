import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CitationCard } from "./CitationCard";

const at = new DOMRect(100, 200, 20, 10);
const handlers = () => ({ onGo: vi.fn(), onClose: vi.fn(), onEnter: vi.fn(), onLeave: vi.fn() });

afterEach(cleanup);

describe("CitationCard (D24)", () => {
  it("shows the paper's own words, labelled as the paper's, with Go there", () => {
    const h = handlers();
    const { getByRole } = render(<CitationCard at={at} text="[22] Y. LeCun. Backpropagation." failed={false} {...h} />);
    const card = getByRole("dialog", { name: "In this paper" });
    expect(card.textContent).toContain("In this paper");
    expect(card.textContent).toContain("[22] Y. LeCun. Backpropagation.");
    fireEvent.click(getByRole("button", { name: "Go there" }));
    expect(h.onGo).toHaveBeenCalledTimes(1);
  });
  it("says it is reading, or that it could not, before words arrive", () => {
    const { getByRole, rerender } = render(<CitationCard at={at} text={null} failed={false} {...handlers()} />);
    expect(getByRole("dialog").textContent).toContain("Reading");
    rerender(<CitationCard at={at} text={null} failed={true} {...handlers()} />);
    expect(getByRole("dialog").textContent).toContain("Could not read");
  });
  it("shows a clip of the paper above the words when it points at a figure, table or formula (D26)", () => {
    const { getByRole } = render(<CitationCard at={at} text="Figure 4. Training on ImageNet." failed={false} clip="/render?page=4" {...handlers()} />);
    const image = getByRole("img");
    expect(image.getAttribute("src")).toBe("/render?page=4");
    expect(getByRole("dialog").textContent).toContain("Figure 4. Training on ImageNet.");
  });
  it("shows only the clip for a formula, which has no words of its own", () => {
    const { getByRole } = render(<CitationCard at={at} text="" failed={false} clip="/render" {...handlers()} />);
    expect(getByRole("dialog").querySelector(".citation-text")).toBeNull();
  });
  it("takes its own label and body, and no Go there without somewhere to go (D27)", () => {
    const { onGo: _onGo, ...h } = handlers();
    const { getByRole, queryByRole } = render(<CitationCard at={at} label="Term" {...h}><p>body</p></CitationCard>);
    expect(getByRole("dialog", { name: "Term" }).textContent).toContain("body");
    expect(queryByRole("button", { name: "Go there" })).toBeNull();
  });
  it("closes on Escape, and holds open while the mouse is on it", () => {
    const h = handlers();
    const { getByRole } = render(<CitationCard at={at} text="x" failed={false} {...h} />);
    fireEvent.mouseEnter(getByRole("dialog"));
    expect(h.onEnter).toHaveBeenCalled();
    fireEvent.mouseLeave(getByRole("dialog"));
    expect(h.onLeave).toHaveBeenCalled();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(h.onClose).toHaveBeenCalledTimes(1);
  });
});
