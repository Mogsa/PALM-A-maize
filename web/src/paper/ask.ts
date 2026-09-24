/** The one prompt Ask elsewhere copies (addendum 6.2). Fixed text with four slots; the tool sends it nowhere. */
export const ASK_PROMPT = [
  "I am reading a research paper.{goal}",
  "",
  "I do not understand this part:",
  "\"{marked}\"",
  "",
  "It is in this sentence:",
  "\"{sentence}\"",
  "",
  "The section it is in:",
  "{section}",
  "",
  "Explain what the marked part means here, and what I would need to know to understand it.",
].join("\n");
export const GOAL_LINE = " I am reading it to: {goal}";

const SENTENCE_END = /[.!?](?=\s|$)/;

const flatten = (text: string) => text.replace(/\s+/g, " ");

/** Where the marked words start in the flattened page. A term often recurs on its page, so the quote's own prefix and
 *  suffix (addendum 5.1) pick the occurrence that was marked; either alone is tried when the pair runs off the page. */
function markedAt(flat: string, needle: string, context?: { prefix: string; suffix: string }): number {
  const prefix = context ? flatten(context.prefix) : "";
  const suffix = context ? flatten(context.suffix) : "";
  for (const [before, after] of [[prefix, suffix], [prefix, ""], ["", suffix]]) {
    if (!before && !after) continue;
    const found = flat.indexOf(`${before}${needle}${after}`);
    if (found !== -1) return found + before.length;
  }
  return flat.indexOf(needle);
}

/** The sentence holding `quote` in the page text, matched with whitespace flattened (addendum 5.2's spirit). */
export function sentenceAround(pageText: string, quote: string, context?: { prefix: string; suffix: string }): string {
  const flat = flatten(pageText);
  const needle = flatten(quote).trim();
  const at = needle ? markedAt(flat, needle, context) : -1;
  if (at === -1) return needle;
  const before = flat.slice(0, at);
  const start = Math.max(before.lastIndexOf(". "), before.lastIndexOf("? "), before.lastIndexOf("! "));
  const tail = flat.slice(at + needle.length).search(SENTENCE_END);
  const end = tail === -1 ? flat.length : at + needle.length + tail + 1;
  return flat.slice(start === -1 ? 0 : start + 2, end).trim();
}

const SLOT = /\{(goal|marked|sentence|section)\}/g;

/** One pass with a function replacer: a `$` in the paper's text is inserted as itself, and a filled slot is never
 *  searched again, so text that happens to hold "{sentence}" stays as written. */
export function buildAskPrompt({ marked, sentence, section, goal }: { marked: string; sentence: string; section: string; goal: string }): string {
  const values: Record<string, string> = {
    goal: goal.trim() ? GOAL_LINE.replace("{goal}", () => goal.trim()) : "",
    marked: marked.replace(/\s+/g, " ").trim(),
    sentence,
    section,
  };
  return ASK_PROMPT.replace(SLOT, (_, slot: string) => values[slot]);
}
