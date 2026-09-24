import { useEffect, useState } from "react";
import type { Tag } from "../model/types";
import { useBoard } from "../state/BoardProvider";
import { useTags } from "../state/TagsProvider";

function TagRow({ tag, onChange, onDelete }: { tag: Tag; onChange: (tag: Tag) => void; onDelete: () => void }) {
  const [name, setName] = useState(tag.name);
  // The picker fires on every step of a drag; saving each one would race whole-file PUTs. Held here, saved on leaving.
  const [colour, setColour] = useState(tag.colour.toLowerCase());
  useEffect(() => setName(tag.name), [tag.name]);
  useEffect(() => setColour(tag.colour.toLowerCase()), [tag.colour]);
  const commit = () => {
    const next = name.trim();
    if (next && next !== tag.name) onChange({ ...tag, name: next });
    else setName(tag.name);
  };
  const commitColour = () => { if (colour !== tag.colour.toLowerCase()) onChange({ ...tag, colour }); };
  return (
    <li>
      <input type="color" value={colour} aria-label={`Colour of ${tag.name}`} onChange={(e) => setColour(e.target.value)} onBlur={commitColour} />
      <input type="text" value={name} aria-label={`Name of ${tag.name}`} onChange={(e) => setName(e.target.value)} onBlur={commit}
             onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }} />
      <button type="button" className="quiet" aria-label={`Delete ${tag.name}`} onClick={onDelete}>×</button>
    </li>
  );
}

/** The provider has already shown the reader its own message (`error`); this keeps the rejection out of the console's
 *  "uncaught" list while still logging it. */
const logFailure = (failure: unknown) => console.error("A change to the tags was not saved", failure);

/** Rename, recolour, delete (SPEC 5.2). Tags are global; a deleted tag's id is ignored wherever it remains (addendum 4.3).
 *  No confirmation: re-adding a tag is one click in any picker. */
export function TagManager() {
  const { tags, update, remove, error } = useTags();
  const { state, dispatch } = useBoard();
  const drop = (id: string) => {
    const active = state.board.active_tags;
    if (active.includes(id)) dispatch({ type: "setActiveTags", tags: active.filter((t) => t !== id) });
    remove(id).catch(logFailure);
  };
  return (
    <section className="tag-manager" aria-label="Tags">
      <h3>Tags</h3>
      <p className="hint">Shared by every paper. Renaming a tag renames it everywhere.</p>
      <ul>{tags.map((t) => <TagRow key={t.id} tag={t} onChange={(next) => update(next).catch(logFailure)} onDelete={() => drop(t.id)} />)}</ul>
      {error && <p className="panel-error" role="alert">{error}</p>}
    </section>
  );
}
