import { newId } from "./ids";
import type { XY } from "./reparent";
import type { NoteNode, NoteOrigin } from "./types";

export const NOTE_WIDTH = 280;
export const FIRST_LINE_CHARS = 60;

/** An empty note. Its text lives in notes/<id>.md, written on first save; a missing file reads as empty. */
export function newNote({ position, parentId, origin }: { position: XY; parentId?: string; origin: NoteOrigin }): NoteNode {
  const id = newId("n");
  return {
    id, type: "note", position, ...(parentId ? { parentId } : {}), initialWidth: NOTE_WIDTH,
    data: { tags: [], collapsed: false, note: `notes/${id}.md`, origin },
  };
}

/** A note's title: its first non-empty line, without heading marks, cut at `max` characters. */
export function firstLine(markdown: string, max = FIRST_LINE_CHARS): string {
  const line = markdown.split("\n").map((l) => l.replace(/^\s*#+\s*/, "").trim()).find(Boolean) ?? "";
  return line.length <= max ? line : `${line.slice(0, max - 1)}…`;
}
