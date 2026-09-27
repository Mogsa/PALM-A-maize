import { useEffect, useRef, type ReactNode } from "react";
import { popoverPlace } from "../paper/place";
import { useDismiss } from "./useDismiss";

const MENU_WIDTH = 220;
const MENU_HEIGHT = 120;

/** A small right-click menu at `at`. Its first button takes focus, so it works from the keyboard too; Escape or a
 *  press outside closes it. */
export function ContextMenu({ at, label, onClose, children }: { at: DOMRect; label: string; onClose: () => void; children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  useDismiss(box, onClose);
  useEffect(() => { box.current?.querySelector<HTMLButtonElement>("button")?.focus(); }, []);
  const { left, top } = popoverPlace(at, MENU_WIDTH, MENU_HEIGHT);
  return (
    <div ref={box} className="popover context-menu" role="menu" aria-label={label} style={{ left, top }}
         onMouseDown={(e) => e.stopPropagation()} onMouseUp={(e) => e.stopPropagation()} onContextMenu={(e) => e.preventDefault()}>
      {children}
    </div>
  );
}
