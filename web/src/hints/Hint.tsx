import { closeHint, HINT_TEXT, useHint, type HintId } from "./hints";

/** A faint one-time hint at the moment it applies (spec A4). It never blocks a click under it. */
export function Hint({ id, when }: { id: HintId; when: boolean }) {
  if (!useHint(id, when)) return null;
  return (
    <p className="gesture-hint" role="note">
      {HINT_TEXT[id]}
      <button type="button" className="quiet" aria-label="Dismiss hint" onClick={() => closeHint(id)}>×</button>
    </p>
  );
}
