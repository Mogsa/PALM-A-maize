import { useTags } from "../state/TagsProvider";

type Props = {
  /** The main tag now: undefined when nothing is chosen yet (a fresh selection), null when plain. */
  current?: string | null;
  onPick: (tagId: string | null) => void;
  disabled?: boolean;
  /** The plain dot's name: "Highlight" where it makes a highlight. */
  plainLabel?: string;
};

/** The colour row (spec A2): plain yellow first, then one dot per tag in the tag's own colour. `nodrag` and the stopped
 *  mousedown keep React Flow from dragging a card under it. */
export function TagDots({ current, onPick, disabled = false, plainLabel = "No colour" }: Props) {
  const { tags } = useTags();
  return (
    <span className="tag-dots nodrag" role="group" aria-label="Colour" onMouseDown={(e) => e.stopPropagation()}>
      <button type="button" className="tag-dot plain" aria-label={plainLabel} title={plainLabel}
              aria-pressed={current === null} disabled={disabled} onClick={() => onPick(null)} />
      {tags.map((t) => (
        <button key={t.id} type="button" className="tag-dot" style={{ background: t.colour }} aria-label={t.name} title={t.name}
                aria-pressed={current === t.id} disabled={disabled} onClick={() => onPick(t.id)} />
      ))}
    </span>
  );
}
