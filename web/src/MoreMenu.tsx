import { useCallback, useRef, useState } from "react";
import { FLUSH_FAILED_MESSAGE, useBoard } from "./state/BoardProvider";
import { useDismiss } from "./ui/useDismiss";

export type Panel = "questions" | "glossary" | "export" | "tags" | "template";

export const SPLIT_FAILED_MESSAGE = "Could not add the missing sections. Nothing was added.";
const splitDone = (added: number) => (added ? `Added ${added} piece${added === 1 ? "" : "s"} to the tray` : "Every section and figure is already on the board");
/** A failed save before the split says why in its own words; anything else is the split's own failure. */
const splitFailed = (failure: unknown) => (failure instanceof Error && failure.message === FLUSH_FAILED_MESSAGE ? FLUSH_FAILED_MESSAGE : SPLIT_FAILED_MESSAGE);

/** The panels kept out of sight until asked for, in the order the menu lists them. */
const PANELS: { panel: Panel; label: string }[] = [
  { panel: "glossary", label: "Glossary" }, { panel: "export", label: "Export" },
  { panel: "tags", label: "Tags" }, { panel: "template", label: "Template" },
];

/** "Add missing sections" (split, D16): every section and figure the board lacks, into the tray. */
function useSplit() {
  const { split } = useBoard();
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<string | null>(null);
  const run = async () => {
    setBusy(true);
    try {
      setSaid(splitDone(await split()));
    } catch (failure) {
      console.error(SPLIT_FAILED_MESSAGE, failure);
      setSaid(splitFailed(failure));
    } finally {
      setBusy(false);
    }
  };
  return { busy, said, run };
}

/** Everything used now and then, behind one button: the side panels and Add missing sections. */
export function MoreMenu({ onPanel }: { onPanel: (panel: Panel) => void }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(box, close);
  const split = useSplit();
  const pick = (act: () => void) => { setOpen(false); act(); };
  return (
    <div className="more" ref={box}>
      <button type="button" className="panel-button" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>More</button>
      {open && (
        <div className="more-menu" role="menu" aria-label="More">
          {PANELS.map(({ panel, label }) => <button key={panel} type="button" role="menuitem" onClick={() => pick(() => onPanel(panel))}>{label}</button>)}
          <button type="button" role="menuitem" disabled={split.busy} onClick={() => pick(() => void split.run())}
                  title="Add every section and figure the board does not have yet, into the tray">Add missing sections</button>
        </div>
      )}
      {split.said && <span className="tool-note" role="status">{split.said}</span>}
    </div>
  );
}
