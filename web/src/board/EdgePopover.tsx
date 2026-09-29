import { useEffect, useRef } from "react";
import { useDismiss } from "../ui/useDismiss";
import { useBoard } from "../state/BoardProvider";
import { TagPicker } from "../tags/TagPicker";

export const EDGE_POPOVER_WIDTH = 300;
export const EDGE_POPOVER_HEIGHT = 320;
const MARGIN = 8;

/** Tags on a connection, and removing it (SPEC 5.3). A sentence about a connection is a note, not a label. */
export function EdgePopover({ edgeId, at, onClose }: { edgeId: string; at: DOMRect; onClose: () => void }) {
  const { state, dispatch } = useBoard();
  const edge = state.board.edges.find((e) => e.id === edgeId);
  const box = useRef<HTMLDivElement>(null);
  useDismiss(box, onClose);
  useEffect(() => { if (!edge) onClose(); }, [edge, onClose]);   // undone or deleted meanwhile
  if (!edge) return null;
  const left = Math.max(MARGIN, Math.min(at.left + MARGIN, window.innerWidth - EDGE_POPOVER_WIDTH - MARGIN));
  const top = Math.max(MARGIN, Math.min(at.top + MARGIN, window.innerHeight - EDGE_POPOVER_HEIGHT - MARGIN));
  return (
    <div ref={box} className="popover edge-popover" role="dialog" aria-label="Connection" style={{ left, top }}>
      <TagPicker value={edge.data.tags} onChange={(tags) => dispatch({ type: "setTags", target: "edge", id: edge.id, tags })} />
      <div className="popover-actions">
        <button className="action" onClick={() => { dispatch({ type: "remove", edgeIds: [edge.id] }); onClose(); }}>Remove connection</button>
      </div>
    </div>
  );
}
