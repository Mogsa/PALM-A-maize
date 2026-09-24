import { useBoard } from "../state/BoardProvider";
import { useTags } from "../state/TagsProvider";

/** The tag filter (D8): the board shows what carries any active tag. It is view state, saved but never undone. */
export function FilterBar() {
  const { state, dispatch } = useBoard();
  const { tags } = useTags();
  const active = state.board.active_tags;
  const set = (next: string[]) => dispatch({ type: "setActiveTags", tags: next });
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
