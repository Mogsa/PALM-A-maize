import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Source } from "../../model/types";

const source: Source = {
  schema: 1, paper_id: "p", pages: [], sections: [], regions: [], page_text: [],
  figures: [{ id: "fig-4", kind: "figure", label: "Figure 4", caption: "Figure 4. Training.", caption_rect: null, rect: { page: 4, rect: [80, 247, 515, 394] }, confidence: "region" }],
};
vi.mock("../../state/BoardProvider", () => ({ useBoard: () => ({ paperId: "p", source }) }));
import { ChunkBody } from "./ChunkBody";

afterEach(cleanup);

const block = { kind: "text" as const, page: 0, rect: [0, 0, 100, 100] as [number, number, number, number], text: "" };

describe("ChunkBody (D26): references the paper can show are underlined and focusable", () => {
  it("marks a matched reference, and leaves an unmatched one and a mark's words plain", () => {
    const painted = [{ block, runs: [
      { text: "shown in Fig. 4 and Fig. 2, and ", highlightId: null },
      { text: "Figure 4 marked", highlightId: "h-1" },
    ] }];
    const { container } = render(<ChunkBody painted={painted} dimmed={() => false} />);
    const refs = container.querySelectorAll(".ref");
    expect(Array.from(refs).map((r) => r.textContent)).toEqual(["Fig. 4"]);
    expect(refs[0].getAttribute("data-ref-kind")).toBe("figure");
    expect(refs[0].getAttribute("data-ref-key")).toBe("4");
    expect(refs[0].getAttribute("tabindex")).toBe("0");
    expect(container.querySelector("p")!.textContent).toBe("shown in Fig. 4 and Fig. 2, and Figure 4 marked");
  });
});
