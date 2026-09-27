import { highlightsIn } from "./geometry";
import type { Board, BoardNode, Highlight } from "./types";

/** With no tag active, everything passes; otherwise a thing passes when it carries any active tag (D8). */
export function carriesActive(active: string[], tags: string[]): boolean {
  return active.length === 0 || tags.some((t) => active.includes(t));
}

/** A mark inside a chunk is painted at full strength when it carries an active tag, dimmed otherwise. */
export function markDimmed(active: string[], highlight: Highlight): boolean {
  return active.length > 0 && !carriesActive(active, highlight.tags);
}

/** Nodes the filter hides. Computed at render, never stored (addendum 4.2). A chunk or figure also shows
 *  when a mark inside it carries an active tag, the rule export uses (addendum 6.1). */
export function hiddenNodeIds(board: Board, active: string[]): Set<string> {
  if (!active.length) return new Set();
  const children = new Map<string, BoardNode[]>();
  for (const n of board.nodes) if (n.parentId) children.set(n.parentId, [...(children.get(n.parentId) ?? []), n]);
  const shown = new Map<string, boolean>();
  const isShown = (node: BoardNode): boolean => {
    const known = shown.get(node.id);
    if (known !== undefined) return known;
    shown.set(node.id, false);   // a guard against a parent cycle in a hand-edited file
    let result = carriesActive(active, node.data.tags);
    if (!result && (node.type === "chunk" || node.type === "figure")) {
      result = highlightsIn(board.highlights, node.data.region).some((h) => carriesActive(active, h.tags));
    }
    if (!result && node.type === "group") result = (children.get(node.id) ?? []).some(isShown);
    shown.set(node.id, result);
    return result;
  };
  return new Set(board.nodes.filter((n) => !isShown(n)).map((n) => n.id));
}

/** Whether anything on the board carries a tag: until something does, there is nothing to filter by. */
export function anyTagged(board: Board): boolean {
  return board.nodes.some((n) => n.data.tags.length > 0) || board.highlights.some((h) => h.tags.length > 0)
    || board.edges.some((e) => e.data.tags.length > 0);
}
