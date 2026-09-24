import { newEdge } from "../model/links";
import { newNote } from "../model/notes";
import type { XY } from "../model/reparent";
import type { BoardEdge, NoteNode } from "../model/types";
import { endOf } from "./handles";

/** True where a line let go of makes a note (addendum 4.10): on the board, and on no card. A group is a card. */
export function onEmptyBoard(element: Element | null): boolean {
  return Boolean(element?.closest(".react-flow")) && !element?.closest(".react-flow__node");
}

/** A reader's note at `at`, the top-left corner, and the line from what the drag began on: a mark's handle is the
 *  highlight, a card's own handle the card (addendum 4.10). Added together, as one undo step. */
export function noteAtDrop(fromNode: string, fromHandle: string | null | undefined, at: XY): { note: NoteNode; edge: BoardEdge } {
  const note = newNote({ position: at, origin: "reader" });
  return { note, edge: newEdge(endOf(fromNode, fromHandle), note.id) };
}
