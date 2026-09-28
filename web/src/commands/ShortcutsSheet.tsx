import { useRef } from "react";
import { useDismiss } from "../ui/useDismiss";

/** Every gesture beside its button twin (spec A, "nothing is only a gesture"), and the keys. */
export const SHORTCUTS: [string, string][] = [
  ["⌘K", "All commands"],
  ["?", "This sheet"],
  ["Select text, then a colour", "Highlight with that tag"],
  ["Drag selected text onto the board", "Cut it there (or ✂)"],
  ["Drag selected lines out of a card", "Cut them out (or ✂)"],
  ["Drag from a card's edge onto a card", "Connect (or › Connect)"],
  ["Drag from a card's edge onto empty board", "A connected note"],
  ["Double-click empty board", "New note (or ⌘K)"],
  ["Drag on empty board", "Move around the board"],
  ["Scroll on the board", "Zoom in and out"],
  ["Right-click empty board", "New note or New group there"],
  ["Shift and drag on empty board", "Select several, then Group"],
  ["Shift-click", "Add a card to the selection"],
  ["⌘Z / ⇧⌘Z", "Undo / redo"],
  ["Delete", "Delete what is selected"],
];

export function ShortcutsSheet({ onClose }: { onClose: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  useDismiss(box, onClose);
  return (
    <div className="palette-backdrop">
      <div ref={box} className="palette shortcuts" role="dialog" aria-label="Shortcuts">
        <h3>Shortcuts</h3>
        <dl>{SHORTCUTS.map(([keys, what]) => <div key={keys}><dt>{keys}</dt><dd>{what}</dd></div>)}</dl>
      </div>
    </div>
  );
}
