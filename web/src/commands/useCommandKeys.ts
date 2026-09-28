import { useEffect } from "react";
import { isTextField } from "../state/keys";

/** ⌘K or Ctrl-K opens the palette from anywhere; `?` opens the shortcuts, except while typing (Review Focus 5). */
export function useCommandKeys({ onPalette, onShortcuts }: { onPalette: () => void; onShortcuts: () => void }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === "k") { event.preventDefault(); onPalette(); return; }
      if (event.key === "?" && !event.metaKey && !event.ctrlKey && !isTextField(event.target)) { event.preventDefault(); onShortcuts(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onPalette, onShortcuts]);
}
