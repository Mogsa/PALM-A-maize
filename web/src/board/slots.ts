import type { BoardNode } from "../model/types";

/** Where a note made by clicking a slot's question lands, inside the slot, below its name. */
export const SLOT_NOTE_AT = { x: 16, y: 48 };

/** The question of the slot a node sits in: a note's placeholder there, never its text (addendum 4.9). */
export function slotPrompt(nodes: BoardNode[], parentId: string | undefined): string | null {
  const parent = parentId ? nodes.find((n) => n.id === parentId) : undefined;
  return parent?.type === "group" && parent.data.prompt ? parent.data.prompt : null;
}

export function hasNote(nodes: BoardNode[], groupId: string): boolean {
  return nodes.some((n) => n.parentId === groupId && n.type === "note");
}
