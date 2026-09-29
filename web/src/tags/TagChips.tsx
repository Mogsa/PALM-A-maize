import { useTags } from "../state/TagsProvider";

/** The tags on one thing, read-only. An id no tag has any more is skipped (addendum 4.3). */
export function TagChips({ ids }: { ids: string[] }) {
  const { byId } = useTags();
  const known = ids.flatMap((id) => byId.get(id) ?? []);
  if (!known.length) return null;
  return (
    <span className="chips">
      {known.map((t) => <span key={t.id} className="chip" style={{ borderColor: t.colour, color: t.colour }}>{t.name}</span>)}
    </span>
  );
}
