import { useEffect, type Dispatch } from "react";
import type { BoardAction } from "../model/boardReducer";
import { isTextField } from "../state/keys";

export type KeyLike = Pick<KeyboardEvent, "key" | "metaKey" | "ctrlKey" | "shiftKey" | "altKey" | "target">;

/** Cmd-Z undoes, Shift-Cmd-Z redoes, Ctrl on other systems. Keys typed into a text field are the field's own:
 *  a note's text is not in an undo step (addendum 4.7). */
export function undoKeyAction(event: KeyLike): "undo" | "redo" | null {
  if (isTextField(event.target)) return null;
  if (!(event.metaKey || event.ctrlKey) || event.altKey || event.key.toLowerCase() !== "z") return null;
  return event.shiftKey ? "redo" : "undo";
}

/** One listener for the whole app: every board and highlight action, in either view, undoes the same way. */
export function useUndoKeys(dispatch: Dispatch<BoardAction>): void {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const action = undoKeyAction(event);
      if (!action) return;
      event.preventDefault();
      dispatch({ type: action });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dispatch]);
}
