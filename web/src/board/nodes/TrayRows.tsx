import { useMemo } from "react";
import { TRAY_PAD, TRAY_PIECE_WIDTH } from "../../model/tray";
import { useBoard } from "../../state/BoardProvider";
import { useBoardActions } from "../BoardActions";
import { ghostRows } from "../ghostRows";

/** Where the tray's missing sections went, each in its own place (D18). */
export function TrayRows({ trayId }: { trayId: string }) {
  const { state, source } = useBoard();
  const { focusNode, openInPaper } = useBoardActions();
  const rows = useMemo(() => ghostRows(state.board, source, trayId), [state.board, source, trayId]);
  return (
    <>
      {rows.map((row) => (
        <button key={row.sectionId} type="button" className="ghost-row nodrag" style={{ top: row.y, left: TRAY_PAD, width: TRAY_PIECE_WIDTH }}
                onClick={(event) => {
                  event.stopPropagation();   // a click on the row is not a click on the tray: it must not select it
                  if (row.nodeId) focusNode(row.nodeId); else openInPaper(row.headingRect);
                }}
                title={row.nodeId ? "Show this section's piece" : "Show this section in the paper"}>
          {row.text}
        </button>
      ))}
    </>
  );
}
