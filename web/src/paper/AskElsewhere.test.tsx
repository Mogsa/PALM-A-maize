import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { emptyBoard, type Highlight } from "../model/types";

const dispatch = vi.fn();
const source = { sections: [], figures: [], pages: [], page_text: [{ page: 0, text: "We call it the residual\nmapping. Then more." }] };
vi.mock("../state/BoardProvider", () => ({ useBoard: () => ({ state: { board: emptyBoard("p") }, dispatch, source }) }));
vi.mock("../state/TagsProvider", () => ({ useTags: () => ({ tags: [{ id: "t-term", name: "term", colour: "#0F766E" }] }) }));
import { AskElsewhere } from "./AskElsewhere";

const mark = (tags: string[]): Highlight => ({
  id: "h-1", tags, anchor: { rects: [{ page: 0, rect: [0, 0, 10, 10] }], quote: { exact: "residual\nmapping", prefix: "", suffix: "" }, position: 0, state: "anchored" },
});

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("AskElsewhere for a term (D27)", () => {
  it("is Look up elsewhere, copying the jargon prompt with the term's sentence, and makes an AI note as before", async () => {
    const writeText = vi.fn(async () => undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    const { getByRole } = render(<AskElsewhere highlight={mark(["t-term"])} />);
    await act(async () => { fireEvent.click(getByRole("button", { name: "Look up elsewhere" })); });
    expect(writeText).toHaveBeenCalledWith("Explain the term 'residual mapping' as used in this sentence: 'We call it the residual mapping.'. "
      + "Assume I am a student new to this field. Keep it short, and give a source I can check.");
    const added = dispatch.mock.calls[0][0];
    expect(added.nodes[0].data.origin).toBe("ai");
    expect(added.edges[0]).toMatchObject({ from: "h-1", to: added.nodes[0].id });
  });
  it("is Ask elsewhere, with its own prompt, for a mark that is not a term", () => {
    const { getByRole, queryByRole } = render(<AskElsewhere highlight={mark([])} />);
    expect(getByRole("button", { name: "Ask elsewhere" })).toBeTruthy();
    expect(queryByRole("button", { name: "Look up elsewhere" })).toBeNull();
  });
});
