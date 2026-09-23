import type { BoardNode } from "../../model/types";
import { useBoard } from "../../state/BoardProvider";

/** Collapse or expand a piece; every piece has it (SPEC 5.1). */
export function CollapseToggle({ id, collapsed }: { id: string; collapsed: boolean }) {
  const { state, dispatch } = useBoard();
  const toggle = () => {
    const node = state.board.nodes.find((n) => n.id === id)!;
    dispatch({ type: "replaceNode", node: { ...node, data: { ...node.data, collapsed: !collapsed } } as BoardNode });
  };
  const label = collapsed ? "Expand" : "Collapse";
  return <button className="quiet toggle" onClick={toggle} title={label} aria-label={label}>{collapsed ? "▸" : "▾"}</button>;
}
