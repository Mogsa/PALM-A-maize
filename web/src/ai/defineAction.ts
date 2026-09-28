import type { Command } from "../commands/registry";
import type { PageRect } from "../model/types";

/** A word or a short phrase: no "explain this paragraph" (spec, out of scope). */
export const MAX_DEFINE_WORDS = 4;

export function defineAction({ on, text, at, open }: { on: boolean; text: string; at: PageRect | null; open: (term: string, at: PageRect) => void }): Command | null {
  const term = text.replace(/\s+/g, " ").trim();
  if (!on || !at || !term || term.split(" ").length > MAX_DEFINE_WORDS) return null;
  return { id: "ai-define", label: "Define", run: () => open(term, at) };
}
