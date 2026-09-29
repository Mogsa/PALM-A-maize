import type { EdgeChange } from "@xyflow/react";
import { resolveEdges, type FlowEdge } from "../model/edges";
import type { Board } from "../model/types";

export type { FlowEdge };

/** A card's own handles. An edge end with no handle is the card itself (addendum 4.0); React Flow still needs a handle
 *  id on both ends, and in Loose mode a target may be any handle. */
export const inHandle = (nodeId: string) => `${nodeId}-in`;
export const outHandle = (nodeId: string) => `${nodeId}-out`;

/** What a handle stands for when a line is drawn from it: a mark's handle is the highlight, a card's own is the card. */
export function endOf(nodeId: string, handleId: string | null | undefined): string {
  return handleId && handleId.startsWith("h-") ? handleId : nodeId;
}

/** The board's edges as React Flow draws them (addendum 4.0): resolved to cards, a handle on every end, hidden while
 *  either end is hidden (D8), coloured by the first of their tags that still exists (SPEC 5.2). */
export function flowEdges(board: Board, hidden: ReadonlySet<string>, selected: ReadonlySet<string>, colourOf: (tagId: string) => string | undefined): FlowEdge[] {
  return resolveEdges(board).map((e) => {
    const colour = (e.data?.tags ?? []).map(colourOf).find(Boolean);
    return {
      id: e.id, source: e.source, target: e.target,
      sourceHandle: e.sourceHandle ?? outHandle(e.source), targetHandle: e.targetHandle ?? inHandle(e.target),
      data: e.data, selected: selected.has(e.id), hidden: hidden.has(e.source) || hidden.has(e.target),
      ...(colour ? { style: { stroke: colour } } : {}),
    };
  });
}

/** Edge selection is the board's own state: schema 2 edges are not React Flow's, so it is not in the file. */
export function applySelection(current: ReadonlySet<string>, changes: EdgeChange<FlowEdge>[]): ReadonlySet<string> {
  const next = new Set(current);
  for (const c of changes) if (c.type === "select") { if (c.selected) next.add(c.id); else next.delete(c.id); }
  return next;
}
