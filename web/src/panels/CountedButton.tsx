import type { KeySentenceGroup } from "../ai/keySentences";
import type { Panel } from "../commands/shellCommands";

/** A panel button that shows only when it has something to list, with the count (spec A1). */
export function CountedButton({ panel, open, label, count, onToggle }: { panel: Panel; open: Panel | null; label: string; count: number; onToggle: (p: Panel) => void }) {
  if (count < 1) return null;
  return (
    <button type="button" className="panel-button" aria-pressed={open === panel} title={`${count} to look at`} onClick={() => onToggle(panel)}>
      <span className="count" aria-hidden="true">{count}</span>{label}
    </button>
  );
}

export const sentenceCount = (groups: KeySentenceGroup[]) => groups.reduce((n, g) => n + g.sentences.length, 0);
