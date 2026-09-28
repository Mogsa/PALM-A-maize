import { useMemo } from "react";
import { Handle, NodeResizer, Position, type NodeProps } from "@xyflow/react";
import { markDimmed } from "../../model/filter";
import { highlightsIn } from "../../model/geometry";
import { notesConnectedTo } from "../../model/links";
import type { ChunkNode as ChunkNodeType } from "../../model/types";
import { PeekButton, PeekText, usePeek } from "../../paper/PeekLines";
import { useBoard } from "../../state/BoardProvider";
import { inHandle, outHandle } from "../handles";
import { HEAD_MIDDLE_PX, useMarkOffsets } from "../markOffsets";
import { paintBlocks, paintedIds, reflow } from "../marks";
import { useOverflow } from "../overflow";
import { ChunkBody } from "./ChunkBody";
import { CollapseToggle } from "./CollapseToggle";
import { Counts } from "./Counts";
import { NodeTags } from "./NodeTags";

export function ChunkNode({ id, data, selected }: NodeProps<ChunkNodeType>) {
  const { state, words, view } = useBoard();
  const { highlights } = state.board;
  const active = view.active_tags;
  // NodeProps.height also includes automatic measurements; only a stored height fixes the box size.
  const height = state.board.nodes.find((node) => node.id === id)?.height;
  const marks = useMemo(() => highlightsIn(highlights, data.region), [highlights, data.region]);
  const painted = useMemo(() => paintBlocks(data.blocks, marks, words), [data.blocks, marks, words]);
  const shown = paintedIds(painted).size;
  const notes = notesConnectedTo(state.board, [id, ...marks.map((m) => m.id)]).length;
  const [bodyRef, overflowing] = useOverflow<HTMLDivElement>();
  const peek = usePeek(data.region.rects);
  // The peek's lines move the marks down the body, so their handles follow them.
  const bodyContent = useMemo(() => ({ painted, open: peek.open, lines: peek.lines }), [painted, peek.open, peek.lines]);
  const offsets = useMarkOffsets(bodyRef, id, data.collapsed, bodyContent);
  const dimmed = (highlightId: string) => { const h = marks.find((m) => m.id === highlightId); return h ? markDimmed(active, h) : false; };
  const tagsOf = (highlightId: string) => marks.find((m) => m.id === highlightId)?.tags ?? [];
  const title = reflow(data.region.start.exact, words).slice(0, 80);
  const page = data.region.rects[0].page + 1;
  const classes = ["node", "chunk", data.region.state, height !== undefined && !data.collapsed ? "sized" : "", overflowing ? "overflowing" : ""].filter(Boolean).join(" ");
  return (
    <div className={classes}>
      <NodeResizer isVisible={selected && !data.collapsed} minWidth={200} minHeight={60} />
      <div className="node-head">
        <CollapseToggle id={id} collapsed={data.collapsed} />
        <span className="badge" title={`Page ${page}`}>p{page}</span>
        <span className="title">{title}</span>
        <Counts marks={shown} unplaced={marks.length - shown} notes={notes} />
        <NodeTags id={id} tags={data.tags} />
        {!data.collapsed && <PeekButton peek={peek} />}
        <button className="quiet open-source" data-testid="open-source" title="Open in paper" aria-label="Open in paper">↗</button>
      </div>
      {!data.collapsed && <div className="node-body" ref={bodyRef}>
        <PeekText peek={peek} side="before" /><ChunkBody painted={painted} dimmed={dimmed} tagsOf={tagsOf} /><PeekText peek={peek} side="after" />
      </div>}
      {/* Every mark inside keeps a handle, painted or not, since an edge may end on it. */}
      {marks.map((h) => (data.collapsed
        ? <Handle key={h.id} id={h.id} type="source" position={Position.Top} title={h.anchor.quote.exact.slice(0, 60)} />
        : <Handle key={h.id} id={h.id} type="source" position={Position.Right} style={{ top: offsets.get(h.id) ?? HEAD_MIDDLE_PX }} title={h.anchor.quote.exact.slice(0, 60)} />))}
      <Handle id={inHandle(id)} type="target" position={Position.Left} />
      <Handle id={outHandle(id)} type="source" position={Position.Right} />
    </div>
  );
}
