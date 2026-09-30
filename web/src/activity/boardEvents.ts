import type { Dispatch } from "react";
import { boardReducer, type BoardAction, type BoardState, type Reshape } from "../model/boardReducer";
import type { Board, BoardNode } from "../model/types";
import type { LogFn } from "./logger";
import type { ActivityDetail } from "./types";

/** A board event, before the logger stamps its time. */
export type BoardEvent = { kind: "build"; action: string; detail: ActivityDetail };

/** Moves and resizes are noise in v1; the rest are not the reader's building. */
const NOT_LOGGED = new Set<BoardAction["type"]>(["nodes", "load", "saved", "setFigureClip", "setGoal"]);
/** A cut's text in the log: the start of it is enough to tell which one. */
export const CUT_TEXT_CHARS = 200;

const build = (action: string, detail: ActivityDetail = {}): BoardEvent => ({ kind: "build", action, detail });
const byId = <T extends { id: string }>(items: T[]) => new Map(items.map((item) => [item.id, item]));
const sameTags = (a: string[] = [], b: string[] = []) => a.length === b.length && a.every((t, i) => t === b[i]);

function cutText(node: BoardNode): string {
  if (node.type === "figure") return node.data.caption.slice(0, CUT_TEXT_CHARS);
  if (node.type !== "chunk") return "";
  const text = node.data.blocks.map((b) => (b.kind === "text" ? b.text : "")).join(" ");
  return text.replace(/\s+/g, " ").trim().slice(0, CUT_TEXT_CHARS);
}

/** Groups made, or joined by a piece already on the board: a new piece placed inside a group is not grouping. */
function groupsChanged(before: Board, after: Board): BoardEvent[] {
  const was = byId(before.nodes);
  const touched = new Set<string>();
  for (const n of after.nodes) {
    if (n.type === "group" && !was.has(n.id)) touched.add(n.id);
    const old = was.get(n.id);
    if (old && n.parentId && n.parentId !== old.parentId) touched.add(n.parentId);
  }
  return after.nodes.filter((g) => g.type === "group" && touched.has(g.id)).map((g) => build("group", {
    id: g.id, name: g.type === "group" ? (g.data.name ?? null) : null,
    members: after.nodes.filter((n) => n.parentId === g.id).map((n) => n.id),
  }));
}

function tagsChanged(before: Board, after: Board): BoardEvent[] {
  const tags = (items: { id: string; tags?: string[] }[]) => new Map(items.map((i) => [i.id, i.tags ?? []]));
  const was = tags([...before.nodes.map((n) => ({ id: n.id, tags: n.data.tags })), ...before.highlights, ...before.edges.map((e) => ({ id: e.id, tags: e.data.tags }))]);
  const now = [...after.nodes.map((n) => ({ id: n.id, tags: n.data.tags })), ...after.highlights, ...after.edges.map((e) => ({ id: e.id, tags: e.data.tags }))];
  return now.filter((i) => was.has(i.id) && !sameTags(was.get(i.id), i.tags)).map((i) => build("tag", { id: i.id, tags: i.tags }));
}

/** What changed between two boards, named as the spec's build events. */
function diff(before: Board, after: Board): BoardEvent[] {
  /** Keeps the things whose id is not in `others`. */
  const notIn = <T extends { id: string }>(others: { id: string }[]) => { const ids = new Set(others.map((x) => x.id)); return (x: T) => !ids.has(x.id); };
  const removed = [...before.nodes.filter(notIn(after.nodes)), ...before.edges.filter(notIn(after.edges)), ...before.highlights.filter(notIn(after.highlights))];
  const cuts = after.nodes.filter(notIn(before.nodes)).filter((n) => n.type === "chunk" || n.type === "figure");
  return [
    ...after.highlights.filter(notIn(before.highlights)).map((h) => build("highlight", { id: h.id, text: h.anchor.quote.exact, tags: h.tags })),
    ...cuts.map((n) => build("cut", { id: n.id, text: cutText(n) })),
    ...after.edges.filter(notIn(before.edges)).map((e) => build("connect", { id: e.id, from: e.from, to: e.to, tags: e.data.tags })),
    ...groupsChanged(before, after),
    ...tagsChanged(before, after),
    ...(removed.length ? [build("remove", { ids: removed.map((x) => x.id) })] : []),
  ];
}

function reshapeEvent({ op, keep, add = [], removeIds = [] }: Reshape): BoardEvent {
  const name = op ?? (removeIds.length ? "join" : "split");
  return build(name, { ids: [keep.id, ...add.map((n) => n.id), ...removeIds] });
}

/** The build events of one dispatched action, from the board before and after it (activity log spec).
 *  Diff-based: whatever path an action takes through the reducer, what it added, retagged, grouped or removed is what
 *  is logged, and an action the reducer refuses logs nothing. Only undo/redo and reshapes are named by their action,
 *  since a diff cannot tell an undo from an edit, nor a split from a cut out. */
export function boardEvents(before: Board, after: Board, action: BoardAction): BoardEvent[] {
  if (NOT_LOGGED.has(action.type) || before === after) return [];
  if (action.type === "undo" || action.type === "redo") return [build(action.type)];
  if (action.type === "reshape") return [reshapeEvent(action)];
  return diff(before, after);
}

/** `dispatch` that first logs the action's board events: the one place the board is logged from. The board after is
 *  worked out by running the pure reducer here too. `current` is the state React last rendered; a second dispatch in
 *  the same tick meets the state the first one made, not that. */
export function loggedDispatch(dispatch: Dispatch<BoardAction>, current: () => BoardState, log: LogFn): Dispatch<BoardAction> {
  let last: { from: BoardState; to: BoardState } | null = null;
  return (action) => {
    if (!NOT_LOGGED.has(action.type)) {
      try {
        const rendered = current();
        const before = last && last.from === rendered ? last.to : rendered;
        const after = boardReducer(before, action);
        last = { from: rendered, to: after };
        for (const e of boardEvents(before.board, after.board, action)) log(e.kind, e.action, e.detail);
      } catch (error) {
        console.error("Could not log a board change", error);
      }
    }
    dispatch(action);
  };
}
