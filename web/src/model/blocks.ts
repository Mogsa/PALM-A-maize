import type { Block } from "./types";

/** A chunk's text: its text blocks in order, each keeping the paper's line breaks, joined by a line
 *  break as schema 1's `text` joined its runs, so reflow reads them the same way. Clip blocks add
 *  nothing here; the card renders them itself once mixed blocks land. */
export function blocksText(blocks: Block[]): string {
  return blocks.flatMap((b) => (b.kind === "text" ? [b.text] : [])).join("\n");
}
