import { useEffect, type RefObject } from "react";

/** Closes a popover or menu on a press outside it and, unless `escape` is false (the owner handles its own Escape),
 *  on Escape. Listened for in the capture phase, so a popover that stops its own mousedown still sees outside presses. */
export function useDismiss(box: RefObject<HTMLElement | null>, onClose: () => void, { escape = true } = {}) {
  useEffect(() => {
    const onPress = (event: PointerEvent) => {
      // Only the main button: a right-click is how a menu opens, and must not close what it reads (the selection).
      // A modal opened from inside (the sketch editor, portalled to the body) is still inside.
      const target = event.target as Element;
      if (target.closest?.(".sketch-backdrop, [aria-modal='true']")) return;
      if (event.button === 0 && box.current && !box.current.contains(target)) onClose();
    };
    const onKey = (event: KeyboardEvent) => { if (escape && event.key === "Escape") onClose(); };
    document.addEventListener("pointerdown", onPress, true);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPress, true);
      window.removeEventListener("keydown", onKey);
    };
  }, [box, onClose, escape]);
}
