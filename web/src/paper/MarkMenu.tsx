import type { Highlight } from "../model/types";
import { AskElsewhere } from "./AskElsewhere";

type Props = { highlight: Highlight; onAddTag: () => void; onConnect: () => void; onAddNote: () => void };

/** The same list as a selection's ›, for a mark: its right-click (spec A2). */
export function MarkMenu({ highlight, onAddTag, onConnect, onAddNote }: Props) {
  return (
    <>
      <button type="button" className="action" role="menuitem" onClick={onAddTag}>Add tag</button>
      <button type="button" className="action" role="menuitem" onClick={onConnect} title="Then click another mark or a section heading">Connect</button>
      <button type="button" className="action" role="menuitem" onClick={onAddNote}>Add note</button>
      <AskElsewhere highlight={highlight} />
    </>
  );
}
