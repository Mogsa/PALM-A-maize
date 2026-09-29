import { useState } from "react";
import { useTags } from "../state/TagsProvider";

/** Toggle tags on one thing. The list is the global list; a tag added here is added for every board.
 *  `nodrag` and the stopped mousedown keep React Flow from dragging the card under the picker. */
export function TagPicker({ value, onChange }: { value: string[]; onChange: (ids: string[]) => void }) {
  const { tags, add, error } = useTags();
  const [draft, setDraft] = useState("");
  const toggle = (id: string) => onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);
  const create = async () => {
    const name = draft.trim();
    if (!name) return;
    let tag;
    try {
      tag = await add(name);
    } catch {
      return;   // the tags could not be read; the provider already shows why
    }
    onChange([...value, tag.id]);
    setDraft("");
  };
  return (
    <div className="tag-picker nodrag" onMouseDown={(e) => e.stopPropagation()}>
      {tags.map((t) => (
        <label key={t.id}>
          <input type="checkbox" checked={value.includes(t.id)} onChange={() => toggle(t.id)} />
          <span style={{ color: t.colour }}>{t.name}</span>
        </label>
      ))}
      <div className="new-tag">
        <input type="text" value={draft} placeholder="new tag" aria-label="New tag"
               onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void create(); }} />
        <button type="button" onClick={() => void create()}>Add</button>
      </div>
      {error && <p className="tag-error" role="alert">{error}</p>}
    </div>
  );
}
