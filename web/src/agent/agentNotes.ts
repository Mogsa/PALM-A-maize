import { nextChunkPosition } from "../board/layout";
import type { Command } from "../commands/registry";
import { newEdge } from "../model/links";
import { firstLine, newNote } from "../model/notes";
import { spotBeside, spotForNoteOn } from "../model/placement";
import type { Board, BoardEdge, BoardNode, NoteNode, PageRect } from "../model/types";

/** A note an AI agent wrote into `papers/<id>/agent/` (bring-your-own-agent spec), as the server lists it. */
export type AgentNote = { file: string; title: string | null; on: string | null; text: string; modified: string };

/** What an agent note is `on`, when that is on this board: a highlight opens in the paper, anything else on the board. */
export type AgentTarget =
  | { kind: "highlight"; id: string; label: string; at: PageRect }
  | { kind: "node"; id: string; label: string };

/** How much of the thing a note is on its chip shows. */
export const CHIP_CHARS = 44;

function nodeLabel(node: BoardNode): string {
  switch (node.type) {
    case "chunk": return firstLine(node.data.region.start.exact, CHIP_CHARS) || "Piece";
    case "figure": return firstLine(node.data.caption, CHIP_CHARS) || "Figure";
    case "group": return node.data.name || "Group";
    case "note": return "Note";
  }
}

export function targetOf(board: Board, on: string | null): AgentTarget | null {
  if (!on) return null;
  const mark = board.highlights.find((h) => h.id === on);
  if (mark) return { kind: "highlight", id: on, label: firstLine(mark.anchor.quote.exact, CHIP_CHARS), at: mark.anchor.rects[0] };
  const node = board.nodes.find((n) => n.id === on);
  return node ? { kind: "node", id: on, label: nodeLabel(node) } : null;
}

/** The note's text on the board: its title as a heading (the card's title is a note's first line), then the agent's words. */
export function agentNoteMarkdown(note: AgentNote): string {
  const body = `${note.text.trim()}\n`;
  return note.title ? `# ${note.title}\n\n${body}` : body;
}

/** Put on board: one note marked AI, beside what it is on and connected to it, else under everything (Principle 1:
 *  it stays marked AI). */
export function placedAgentNote(board: Board, agentNote: AgentNote): { note: NoteNode; edges: BoardEdge[] } {
  const target = targetOf(board, agentNote.on);
  const spot = !target ? null
    : target.kind === "highlight" ? spotForNoteOn(board, target.id)
    : spotBeside(board.nodes, target.id);
  const note = newNote({ ...(spot ?? { position: nextChunkPosition(board.nodes) }), origin: "ai" });
  return { note, edges: target ? [newEdge(target.id, note.id)] : [] };
}

/** ⌘K → Agent notes, always listed: the panel says how to get notes when there are none. */
export function agentCommands({ open }: { open: () => void }): Command[] {
  return [{ id: "agent-notes", label: "Agent notes", keywords: "AI agent Claude Gemini Cursor Codex", run: open }];
}
