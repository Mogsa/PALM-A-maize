import { useState } from "react";
import { NodeToolbar, Position } from "@xyflow/react";
import type { MenuItem } from "../commands/registry";
import type { BoardNode, PageRect } from "../model/types";
import { SketchEditor } from "../notes/SketchEditor";
import type { Peek } from "../paper/PeekLines";
import { useBoard } from "../state/BoardProvider";
import { useTags } from "../state/TagsProvider";
import { mainTagColour, setMainTag } from "../tags/mainTag";
import { TagDots } from "../tags/TagDots";
import { TagPicker } from "../tags/TagPicker";
import { ActionMenu } from "../ui/ActionMenu";
import { useBoardActions } from "./BoardActions";

type Props = { id: string; tags: string[]; collapsed?: boolean; source?: PageRect; peek?: Peek; sketch?: boolean };

/** A card's main tag as a thin coloured edge (spec A3). */
export function useMainTagStyle(tags: string[]): { className: string; style?: React.CSSProperties } {
  const colour = mainTagColour(tags, useTags().byId);
  return colour ? { className: "tagged", style: { "--main-tag": colour } as React.CSSProperties } : { className: "" };
}

/** The bar over one selected card (spec A3): colour dots | ↗ ⤢ ›. React Flow shows a NodeToolbar only while its node is
 *  the one node selected. */
export function CardBar({ id, tags, collapsed, source, peek, sketch = false }: Props) {
  const { state, dispatch } = useBoard();
  const { openInPaper } = useBoardActions();
  const [adding, setAdding] = useState(false);
  const [sketching, setSketching] = useState(false);
  const setTags = (next: string[]) => dispatch({ type: "setTags", target: "node", id, tags: next });
  const toggle = () => {
    const node = state.board.nodes.find((n) => n.id === id);
    if (node) dispatch({ type: "replaceNode", node: { ...node, data: { ...node.data, collapsed: !collapsed } } as BoardNode });
  };
  const items: MenuItem[] = [
    { id: "add-tag", label: "Add tag", run: () => setAdding(true) },
    ...(peek ? [{ id: "context", label: peek.open ? "Less context" : "More context", run: peek.toggle }] : []),
    ...(sketch ? [{ id: "sketch", label: "Sketch", run: () => setSketching(true) }] : []),
    { id: "delete", label: "Delete", run: () => dispatch({ type: "remove", nodeIds: [id] }) },
  ];
  return (
    <NodeToolbar position={Position.Top}>
      <div className="card-bar nodrag" role="toolbar" aria-label="Card" onMouseDown={(e) => e.stopPropagation()}>
        <TagDots current={tags[0] ?? null} onPick={(tagId) => setTags(setMainTag(tags, tagId))} />
        <span className="bar-sep" aria-hidden="true" />
        {source && <button type="button" className="quiet" aria-label="Show in paper" title="Show where this is in the paper" onClick={() => openInPaper(source)}>↗</button>}
        {collapsed !== undefined && (
          <button type="button" className="quiet" aria-label={collapsed ? "Expand card" : "Collapse card"} onClick={toggle}>⤢</button>
        )}
        <ActionMenu items={items} />
      </div>
      {adding && <div className="node-tags-picker nodrag nowheel"><TagPicker value={tags} onChange={setTags} /></div>}
      {sketching && <SketchEditor noteId={id} onClose={() => setSketching(false)} />}
    </NodeToolbar>
  );
}
