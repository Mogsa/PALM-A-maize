import { newId } from "./ids";
import { trayOrder } from "./paperOrder";
import type { XY } from "./reparent";
import type { Board, BoardNode, GroupNode, Source, SplitDraft, TemplateFile } from "./types";

export const TRAY_NAME = "Paper";
export const TRAY_PAD = 20;
export const TRAY_TOP = 48;                // below the group's name
export const TRAY_STEP = 44;               // a collapsed piece and a gap
export const TRAY_PIECE_WIDTH = 320;
export const TRAY_WIDTH = TRAY_PIECE_WIDTH + 2 * TRAY_PAD;
export const SLOT_WIDTH = 400;
export const SLOT_HEIGHT = 300;
export const SLOT_GAP = 24;
export const SLOT_COLUMNS = 3;
export const SLOTS_OFFSET = 60;            // between the tray and the first column of slots

/** A row of the tray, relative to the tray: one column in paper order, each piece at its own index (addendum 6). */
export const trayRow = (index: number): XY => ({ x: TRAY_PAD, y: TRAY_TOP + index * TRAY_STEP });
export const trayHeight = (rows: number): number => TRAY_TOP + rows * TRAY_STEP + TRAY_PAD;

export function findTray(nodes: BoardNode[]): GroupNode | undefined {
  return nodes.find((n): n is GroupNode => n.type === "group" && n.data.tray === true);
}

function newGroup(position: XY, width: number, height: number, data: GroupNode["data"]): GroupNode {
  return { id: newId("n"), type: "group", position, width, height, data };
}

/** Split drafts become the tray's children at their paper-order rows. Drafts carry no id; the client mints them. */
function placeInTray(drafts: SplitDraft[], order: string[], trayId: string): BoardNode[] {
  return drafts.map((draft, i) => {
    const at = order.indexOf(draft.data.source_id ?? "");
    const row = at === -1 ? order.length + i : at;
    return { ...draft, id: newId("n"), parentId: trayId, position: trayRow(row), width: TRAY_PIECE_WIDTH } as BoardNode;
  });
}

function slotGroups(template: TemplateFile, left: number): GroupNode[] {
  return template.slots.map((slot, i) => newGroup(
    { x: left + (i % SLOT_COLUMNS) * (SLOT_WIDTH + SLOT_GAP), y: Math.floor(i / SLOT_COLUMNS) * (SLOT_HEIGHT + SLOT_GAP) },
    SLOT_WIDTH, SLOT_HEIGHT, { tags: [], name: slot.name, prompt: slot.prompt }));
}

/** First open with the tray off: the template's slots alone, from the board's origin. */
export function templateLayout(template: TemplateFile): GroupNode[] {
  return slotGroups(template, 0);
}

/** First open (D15): the tray on the left holding every piece, the template's slots in a grid to its right. */
export function firstLayout(drafts: SplitDraft[], template: TemplateFile, source: Source): BoardNode[] {
  const order = trayOrder(source);
  const tray = newGroup({ x: 0, y: 0 }, TRAY_WIDTH, trayHeight(order.length), { tags: [], name: TRAY_NAME, tray: true });
  return [tray, ...placeInTray(drafts, order, tray.id), ...slotGroups(template, TRAY_WIDTH + SLOTS_OFFSET)];
}

function leftOfEverything(nodes: BoardNode[]): XY {
  const top = nodes.filter((n) => !n.parentId);
  if (!top.length) return { x: 0, y: 0 };
  return { x: Math.min(...top.map((n) => n.position.x)) - TRAY_WIDTH - SLOTS_OFFSET, y: Math.min(...top.map((n) => n.position.y)) };
}

/** Split (D16): the tray grown to hold every row (never shrunk), or a new one left of everything, then the new pieces in it. */
export function splitIntoTray(board: Board, drafts: SplitDraft[], source: Source): BoardNode[] {
  const order = trayOrder(source);
  const needed = trayHeight(order.length);
  const existing = findTray(board.nodes);
  const tray = existing
    ? { ...existing, height: Math.max(existing.height ?? 0, needed) }
    : newGroup(leftOfEverything(board.nodes), TRAY_WIDTH, needed, { tags: [], name: TRAY_NAME, tray: true });
  return [tray, ...placeInTray(drafts, order, tray.id)];
}
