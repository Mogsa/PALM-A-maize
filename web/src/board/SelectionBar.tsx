import { useEffect, useMemo, useState } from "react";
import { api } from "../api/client";
import type { BoardNode, ChunkNode, JoinResult } from "../model/types";
import { useBoard } from "../state/BoardProvider";
import { setMainTag } from "../tags/mainTag";
import { TagDots } from "../tags/TagDots";
import { joinPlan } from "./recut";

/** For two or more selected pieces: Join when they are chunks that are neighbours in the paper, else Group
 *  (addendum 4.10). Whether they are neighbours is the server's answer, asked once per selection. */
export function SelectionBar({ selected, onGroup }: { selected: BoardNode[]; onGroup: (ids: string[]) => void }) {
  const { dispatch, paperId } = useBoard();
  const key = selected.map((n) => n.id).join(" ");
  const chunks = useMemo(() => selected.filter((n): n is ChunkNode => n.type === "chunk"), [selected]);
  const [answer, setAnswer] = useState<{ key: string; join: JoinResult | null } | null>(null);
  const allChunks = selected.length >= 2 && chunks.length === selected.length;
  useEffect(() => {
    if (!allChunks) return;
    let current = true;
    api.join(paperId, chunks.map((c) => c.data.region))
      .then((join) => { if (current) setAnswer({ key, join }); })
      .catch((failure) => { console.error("could not ask whether these pieces join", failure); if (current) setAnswer({ key, join: null }); });
    return () => { current = false; };
  }, [allChunks, key, paperId]);   // eslint-disable-line react-hooks/exhaustive-deps -- `key` names the selection
  if (selected.length < 2) return null;
  const join = allChunks && answer?.key === key ? answer.join : null;
  return (
    <div className="selection-bar" role="toolbar" aria-label="Selected pieces">
      <span className="tool-note">{selected.length} selected</span>
      <button onClick={() => onGroup(selected.map((n) => n.id))} title="Put these in a new group">Group</button>
      {join && <button onClick={() => dispatch({ type: "reshape", ...joinPlan(chunks, join) })} title="Make these neighbours in the paper one piece again">Join</button>}
      <TagDots onPick={(tagId) => dispatch({ type: "setNodeTags", tags: Object.fromEntries(selected.map((n) => [n.id, setMainTag(n.data.tags, tagId)])) })} />
    </div>
  );
}
