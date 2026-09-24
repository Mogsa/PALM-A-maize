import type { Highlight } from "../model/types";

/** The preset tag a reader puts on a word they want defined (D27), as `t-question` marks a question. */
export const TERM_TAG_ID = "t-term";

export const isTerm = (highlight: Highlight) => highlight.tags.includes(TERM_TAG_ID);
