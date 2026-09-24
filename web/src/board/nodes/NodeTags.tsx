import { useState } from "react";
import { useBoard } from "../../state/BoardProvider";
import { TagChips } from "../../tags/TagChips";
import { TagPicker } from "../../tags/TagPicker";

/** Tag, the same on every piece and group (SPEC 5.1): chips, and a button that opens the global picker. */
export function NodeTags({ id, tags }: { id: string; tags: string[] }) {
  const { dispatch } = useBoard();
  const [open, setOpen] = useState(false);
  return (
    <>
      <TagChips ids={tags} />
      <button className="quiet tags-toggle nodrag" title="Tags" aria-label="Tags" aria-expanded={open} onClick={() => setOpen((o) => !o)}>⋯</button>
      {open && (
        <div className="node-tags-picker nodrag nowheel">
          <TagPicker value={tags} onChange={(next) => dispatch({ type: "setTags", target: "node", id, tags: next })} />
        </div>
      )}
    </>
  );
}
