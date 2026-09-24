import { forceLink, forceSimulation, type SimulationLinkDatum, type SimulationNodeDatum } from "d3-force";
import { resolveEdges } from "../model/edges";
import type { XY } from "../model/reparent";
import type { Board, BoardNode } from "../model/types";

export const TIDY_TICKS = 300;
export const TIDY_LINK_DISTANCE = 480;
export const TIDY_COLLIDE_PAD = 24;
export const TIDY_SEED = 1;

export type Size = { width: number; height: number };
type Body = SimulationNodeDatum & { id: string; w: number; h: number };

/** d3-force jiggles coincident nodes with its random source; a seeded one keeps Tidy deterministic (addendum 4.7). */
function seeded(seed: number): () => number {
  let s = seed;
  return () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; };
}

/** Pieces collide as the rectangles they are, TIDY_COLLIDE_PAD apart; the moving one of a pair gives way (both halve it
 *  when both move). A circle round a tall tray or a grid of slots would overlap its neighbours from the start and push
 *  them apart on every tick, far across the board. */
function collideRects(): (alpha: number) => void {
  let bodies: Body[] = [];
  const separate = (a: Body, b: Body) => {
    const dx = b.x! - a.x!, dy = b.y! - a.y!;
    const ox = (a.w + b.w) / 2 + TIDY_COLLIDE_PAD - Math.abs(dx);
    const oy = (a.h + b.h) / 2 + TIDY_COLLIDE_PAD - Math.abs(dy);
    if (ox <= 0 || oy <= 0) return;
    const [ka, kb] = a.fx != null ? [0, 1] : b.fx != null ? [1, 0] : [0.5, 0.5];
    if (ox < oy) { const s = dx < 0 ? -1 : 1; a.x! -= s * ox * ka; b.x! += s * ox * kb; }
    else { const s = dy < 0 ? -1 : 1; a.y! -= s * oy * ka; b.y! += s * oy * kb; }
  };
  const force = () => {
    for (let i = 0; i < bodies.length; i++) {
      for (let j = i + 1; j < bodies.length; j++) if (bodies[i].fx == null || bodies[j].fx == null) separate(bodies[i], bodies[j]);
    }
  };
  force.initialize = (next: Body[]) => { bodies = next; };
  return force;
}

export function topLevelOf(nodes: BoardNode[], id: string): string {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  let node = byId.get(id);
  while (node?.parentId && byId.has(node.parentId)) node = byId.get(node.parentId);
  return node?.id ?? id;
}

/** Connections between distinct top-level nodes: an end inside a group is the group's, a mark's end its chunk's. */
export function tidyLinks(board: Board): Array<[string, string]> {
  const seen = new Set<string>();
  const links: Array<[string, string]> = [];
  for (const e of resolveEdges(board)) {
    const a = topLevelOf(board.nodes, e.source);
    const b = topLevelOf(board.nodes, e.target);
    const key = [a, b].sort().join("|");
    if (a === b || seen.has(key)) continue;
    seen.add(key);
    links.push([a, b]);
  }
  return links;
}

/** New positions for the connected top-level nodes only. Everything else is fixed (fx, fy) but still collides. */
export function tidyPositions(board: Board, sizeOf: (id: string) => Size): Map<string, XY> {
  const links = tidyLinks(board);
  const moving = new Set(links.flat());
  if (!moving.size) return new Map();
  const bodies: Body[] = board.nodes.filter((n) => !n.parentId).map((n) => {
    const { width: w, height: h } = sizeOf(n.id);
    const x = n.position.x + w / 2;
    const y = n.position.y + h / 2;
    return { id: n.id, w, h, x, y, ...(moving.has(n.id) ? {} : { fx: x, fy: y }) };
  });
  const simulation = forceSimulation<Body>(bodies).stop().randomSource(seeded(TIDY_SEED))
    .force("link", forceLink<Body, SimulationLinkDatum<Body>>(links.map(([source, target]) => ({ source, target }))).id((b) => b.id).distance(TIDY_LINK_DISTANCE))
    .force("collide", collideRects());
  simulation.tick(TIDY_TICKS);
  return new Map(bodies.filter((b) => moving.has(b.id)).map((b) => [b.id, { x: Math.round(b.x! - b.w / 2), y: Math.round(b.y! - b.h / 2) }]));
}
