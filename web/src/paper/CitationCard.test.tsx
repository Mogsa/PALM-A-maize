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
