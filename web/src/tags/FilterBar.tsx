import { useEffect } from "react";
import { useBoard } from "../state/BoardProvider";
import { useTags } from "../state/TagsProvider";

/** The tag filter (D8): the board shows what carries any active tag. It is view state, saved but never undone. */
export function FilterBar() {
  const { state, dispatch } = useBoard();
  const { tags, byId } = useTags();
  const active = state.board.active_tags;
  const set = (next: string[]) => dispatch({ type: "setActiveTags", tags: next });
  // A tag deleted while another paper was open is still in this board's filter: drop it, or the board and the export
  // would filter by a tag with no chip to clear (addendum 4.3). Only once the tags have loaded: an empty list would wipe it.
  useEffect(() => {
    if (tags.length > 0 && active.some((id) => !byId.has(id))) dispatch({ type: "setActiveTags", tags: active.filter((id) => byId.has(id)) });
  }, [tags, byId, active, dispatch]);
  const toggle = (id: string) => set(active.includes(id) ? active.filter((t) => t !== id) : [...active, id]);
  return (
    <div className="filter-bar" role="group" aria-label="Filter by tag">
      {tags.map((t) => (
        <button key={t.id} type="button" className={`chip ${active.includes(t.id) ? "on" : ""}`} aria-pressed={active.includes(t.id)}
                style={{ borderColor: t.colour, color: t.colour }} onClick={() => toggle(t.id)}>{t.name}</button>
      ))}
      {active.length > 0 && <button type="button" className="quiet clear" onClick={() => set([])}>clear</button>}
    </div>
  );
}
