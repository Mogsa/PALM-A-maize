import { cleanup, fireEvent, render } from "@testing-library/react";
import type { NodeProps } from "@xyflow/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { emptyBoard, type NoteNode as NoteNodeType } from "../../model/types";

const note = {
  text: undefined as string | undefined, error: null as string | null, loadFailed: false,
  edit: vi.fn(), commit: vi.fn(async () => undefined), retry: vi.fn(),
};
vi.mock("../../state/BoardProvider", () => ({ useBoard: () => ({ state: { board: emptyBoard("p") } }), useNote: () => note }));
vi.mock("../BoardActions", () => ({ useBoardActions: () => ({ editing: "n-1", setEditing: vi.fn() }) }));
vi.mock("@xyflow/react", () => ({ Handle: () => null, NodeResizer: () => null, Position: { Left: "left", Right: "right" } }));
vi.mock("./NodeTags", () => ({ NodeTags: () => null }));
vi.mock("./CollapseToggle", () => ({ CollapseToggle: () => null }));
import { NoteNode } from "./NoteNode";

const props = { id: "n-1", data: { tags: [], collapsed: false, note: "notes/n-1.md" }, selected: false, width: 240, height: 120 } as unknown as NodeProps<NoteNodeType>;

beforeEach(() => { Object.assign(note, { text: undefined, error: null, loadFailed: false }); });
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("NoteNode (M3)", () => {
  it("cannot be typed into until the note's saved text has loaded", () => {
    const { getByRole, rerender } = render(<NoteNode {...props} />);
    expect((getByRole("textbox", { name: "Note" }) as HTMLTextAreaElement).readOnly).toBe(true);
    note.text = "saved";
    rerender(<NoteNode {...props} />);
    expect((getByRole("textbox", { name: "Note" }) as HTMLTextAreaElement).readOnly).toBe(false);
  });

  it("a note that failed to load shows the error and Retry, not an empty field to type over", () => {
    Object.assign(note, { error: "Could not load this note.", loadFailed: true });
    const { queryByRole, getByRole } = render(<NoteNode {...props} />);
    expect(queryByRole("textbox")).toBeNull();
    expect(getByRole("alert").textContent).toContain("Could not load this note.");
    fireEvent.click(getByRole("button", { name: "Retry" }));
    expect(note.retry).toHaveBeenCalledTimes(1);
  });
});
