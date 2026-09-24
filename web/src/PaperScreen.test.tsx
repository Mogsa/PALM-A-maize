import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { emptyBoard, type Board, type Highlight, type View } from "./model/types";
import type { PaperHit } from "./paper/hit";

const dispatch = vi.fn();
let board: Board;
let clickPaper: ((hit: PaperHit) => void) | null = null;
vi.mock("./state/BoardProvider", () => ({
  useBoard: () => ({ state: { board }, dispatch, paperId: "p", source: { sections: [], figures: [], page_text: [], pages: [] } }),
  useNote: () => ({ text: "", error: null, loadFailed: false, edit: vi.fn(), commit: vi.fn(), retry: vi.fn() }),
}));
vi.mock("./paper/PaperView", () => ({ PaperView: (props: { onClickPaper: (hit: PaperHit) => void }) => { clickPaper = props.onClickPaper; return null; } }));
vi.mock("./tags/TagPicker", () => ({ TagPicker: () => null }));
vi.mock("./api/client", () => ({ api: {} }));
import { PaperScreen } from "./PaperScreen";

const mark: Highlight = { id: "h-1", tags: [], anchor: { rects: [{ page: 0, rect: [0, 0, 10, 10] }], quote: { exact: "x", prefix: "", suffix: "" }, position: 0, state: "anchored" } };
const withView = (view: View): Board => ({ ...emptyBoard("p"), view, highlights: [mark] });
const screen = () => <PaperScreen focus={null} onFocusHandled={() => undefined} onOpenOnBoard={() => undefined} />;

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("PaperScreen while the board is shown", () => {
  it("closes the mark popover, so Delete on the board does not also remove the mark", () => {
    board = withView("paper");
    const { queryByRole, rerender } = render(screen());
    act(() => clickPaper!({ mark, heading: null, at: new DOMRect(10, 10, 0, 0) }));
    expect(queryByRole("dialog", { name: "Mark" })).not.toBeNull();
    board = withView("board");   // the shell hides the paper but keeps it mounted
    rerender(screen());
    expect(queryByRole("dialog", { name: "Mark" })).toBeNull();
    fireEvent.keyDown(window, { key: "Delete" });
    expect(dispatch).not.toHaveBeenCalledWith(expect.objectContaining({ type: "remove" }));
  });
});
