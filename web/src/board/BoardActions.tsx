import { createContext, useContext } from "react";
import type { PageRect } from "../model/types";

/** What a card needs from the board around it: nodes are rendered by React Flow, out of reach of BoardView's props. */
export type BoardActions = {
  focusNode: (id: string) => void;
  openInPaper: (rect: PageRect) => void;
  editing: string | null;
  setEditing: (id: string | null) => void;
  find: (text: string) => void;
};

const BoardActionsContext = createContext<BoardActions | null>(null);
export const BoardActionsProvider = BoardActionsContext.Provider;

export function useBoardActions(): BoardActions {
  const ctx = useContext(BoardActionsContext);
  if (!ctx) throw new Error("useBoardActions outside BoardView");
  return ctx;
}
