import type { PageRect, QuoteSelector } from "../model/types";
import type { useBoard } from "../state/BoardProvider";

/** One action in a `›` list or in ⌘K. */
export type MenuItem = { id: string; label: string; title?: string; run: () => void };
/** A ⌘K command: `keywords` are extra words it is found by. */
export type Command = MenuItem & { keywords?: string };
export type BoardHandle = ReturnType<typeof useBoard>;
/** Words selected on the paper or on a card: what a selection's `›` list is about.
 *  `openDefine`, when the caller can show an AI term card, opens one for a word or short phrase found here
 *  (Part B, Task 12): only the paper wires this today, since only it holds a hover card to open. */
export type SelectionTarget =
  | { on: "paper"; text: string; rects: PageRect[]; at: DOMRect; openDefine?: (term: string, at: PageRect) => void }
  | { on: "card"; text: string; nodeId: string; quote: QuoteSelector; at: DOMRect; openDefine?: (term: string, at: PageRect) => void };
export type CommandSource = (board: BoardHandle) => Command[];
export type SelectionSource = (target: SelectionTarget, board: BoardHandle) => MenuItem[];

// Other features add to ⌘K and to a selection's › here, without editing the lists that show them (Part B: AI help, Define).
const commandSources = new Set<CommandSource>();
const selectionSources = new Set<SelectionSource>();

/** Adds commands to ⌘K; the source is asked again every time the list is shown. Returns the undo. */
export function registerCommands(source: CommandSource): () => void {
  commandSources.add(source);
  return () => { commandSources.delete(source); };
}

/** Adds items to every selection's `›`, after the built-in ones. Returns the undo. */
export function registerSelectionItems(source: SelectionSource): () => void {
  selectionSources.add(source);
  return () => { selectionSources.delete(source); };
}

export function extraCommands(board: BoardHandle): Command[] {
  return [...commandSources].flatMap((source) => source(board));
}

export function extraSelectionItems(target: SelectionTarget, board: BoardHandle): MenuItem[] {
  return [...selectionSources].flatMap((source) => source(target, board));
}

/** The commands whose label or keywords hold every word typed, ignoring case, in their own order. */
export function filterCommands(commands: Command[], query: string): Command[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  return commands.filter((c) => {
    const text = `${c.label} ${c.keywords ?? ""}`.toLowerCase();
    return words.every((w) => text.includes(w));
  });
}
