import { useCallback, useRef, useState } from "react";
import type { MenuItem } from "../commands/registry";
import { useDismiss } from "./useDismiss";

/** The `›` in a bar: everything used now and then, one list. Escape or a press outside closes it. */
export function ActionMenu({ items, initiallyOpen = false }: { items: MenuItem[]; initiallyOpen?: boolean }) {
  const [open, setOpen] = useState(initiallyOpen);
  const box = useRef<HTMLSpanElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(box, close);
  if (!items.length) return null;
  const pick = (item: MenuItem) => { setOpen(false); item.run(); };
  return (
    <span className="action-menu nodrag" ref={box} onMouseDown={(e) => e.stopPropagation()}>
      <button type="button" className="quiet action-more" aria-label="More actions" aria-haspopup="menu" aria-expanded={open}
              onClick={() => setOpen((o) => !o)}>›</button>
      {open && (
        <span className="action-list" role="menu" aria-label="More actions">
          {items.map((item) => (
            <button key={item.id} type="button" role="menuitem" title={item.title} onClick={() => pick(item)}>{item.label}</button>
          ))}
        </span>
      )}
    </span>
  );
}
