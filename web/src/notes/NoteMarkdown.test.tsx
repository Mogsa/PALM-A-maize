import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { NoteMarkdown } from "./NoteMarkdown";

afterEach(cleanup);

describe("NoteMarkdown (D22)", () => {
  it("renders paragraphs, emphasis, lists and code", () => {
    const { container } = render(<NoteMarkdown text={"A *point*.\n\n- one\n- two\n\n```\ncode()\n```"} />);
    expect(container.querySelector("em")?.textContent).toBe("point");
    expect(container.querySelectorAll("li")).toHaveLength(2);
    expect(container.querySelector("pre code")?.textContent).toContain("code()");
  });

  it("renders inline maths with KaTeX", () => {
    const { container } = render(<NoteMarkdown text="The block learns $F(x) = H(x) - x$." />);
    const maths = container.querySelector(".katex");
    expect(maths).not.toBeNull();
    expect(container.querySelector(".katex-display")).toBeNull();
    expect(maths?.querySelector("annotation")?.textContent).toBe("F(x) = H(x) - x");
  });

  it("renders display maths with KaTeX", () => {
    const { container } = render(<NoteMarkdown text={"$$\n\\sum_{i=1}^{n} x_i^2\n$$"} />);
    expect(container.querySelector(".katex-display .katex")).not.toBeNull();
  });

  it("a formula that does not parse shows its source in place and does not throw", () => {
    const { container } = render(<NoteMarkdown text="Broken $\\frac{1}{$ here, fine $x$ after." />);
    expect(container.textContent).toContain("\\frac{1}{");
    expect(container.textContent).toContain("here, fine");
    expect(container.querySelectorAll(".katex").length).toBeGreaterThan(0);
  });

  it("a link opens in a new tab, without giving that tab a handle on this one", () => {
    const { getByRole } = render(<NoteMarkdown text="See [the paper](https://arxiv.org/abs/1512.03385)." />);
    const link = getByRole("link", { name: "the paper" });
    expect(link.getAttribute("href")).toBe("https://arxiv.org/abs/1512.03385");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
  });

  it("raw HTML is shown as text, never rendered", () => {
    const { container } = render(<NoteMarkdown text={'<script>alert(1)</script>\n\n<img src=x onerror="alert(2)">'} />);
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("img")).toBeNull();
  });

  it("a javascript: link is not a link", () => {
    const { container } = render(<NoteMarkdown text="[click](javascript:alert(1))" />);
    expect(container.querySelector("a")?.getAttribute("href") ?? "").not.toContain("javascript");
  });
});
