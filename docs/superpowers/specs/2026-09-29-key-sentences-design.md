# Key sentences: a grounded summary in the author's own words

29 September 2026. Agreed with the owner the same day, after a long brainstorm (tray off, Scim, inverse
reading, graph maps). It replaces spec B5 ("Where to look", the 📍 pins).

## Goal, in one sentence

When AI help is on, the reader sees the paper's own key sentences highlighted and labelled by what they do
(Background, Problem, Main point…), and a list of them that works as a summary where every line is the
author's own words and jumps to where it is.

## Why this and not a summary

- An AI summary is the AI's words. Readers must trust it or check it by hunting (the owner's "can I get a quote?").
- Scim (Semantic Reader) never writes. It picks and labels the paper's own sentences, so nothing can be
  invented and nothing needs verifying. We do the same.
- The AI pass already finds, per template slot, up to three spans where the paper answers it, checked word
  for word (`ai.json` `where_to_look`). Today it only outlines whole paragraphs behind a 📍. This spec shows
  that same data properly: sentences, not paragraphs, and visible, not hidden.

## What the reader sees

1. **On the paper**, with AI help on: each key sentence is highlighted line by line in its slot's colour,
   fainter than a reader's own highlight and with a thin dashed underline, so AI marks never look like
   yours. Hovering shows "AI · <slot name>". Nothing shows with AI help off.
2. **In the top bar**, a **Key sentences** badge with a count, beside Questions and Glossary, shown only when
   there are any. It opens a side panel.
3. **The panel** lists the key sentences grouped by slot, in the template's slot order, each group led by its
   slot name and colour. Each entry is the sentence (the quote) and its page. Clicking an entry scrolls the
   paper to it. Each entry has **Keep**: it becomes an ordinary highlight of the reader's own on the same
   lines (no tag), so the reader can note, tag and connect it like any other. Keep writes to the board; the
   AI layer itself never does.
4. **The 📍 pins are removed**, with the outline state behind them.

Connections between key sentences ("threads") are out of scope: the grouped list shows the structure; the
reader draws connections on top.

## Data and interfaces

- `Ground` gains `lines: list[PageRect] = []`: one rect per printed line of the quote, in reading order,
  computed by the server with the anchoring code highlights already use (find the quote near its span's
  page, then the matched line rects). A quote whose lines cannot be found keeps `lines` empty; the client
  then falls back to `at` (the span's rect) for scrolling and draws no highlight for it.
- `run_pass` fills `lines` for every `where_to_look` ground before saving.
- `GET /api/papers/{id}/ai` fills missing `lines` on the way out for files written before this change
  (no model call, nothing written), so existing passes show highlights at once.
- The reader prompt asks, for `where_to_look`, that each quote be **the one complete sentence in that span
  that best answers the slot, copied exactly**. Up to three per slot, as now (`MAX_SLOT_SPANS`).
- `ai.json` schema version is unchanged: `lines` is an optional addition.
- Slot colours: a fixed palette in the client, by the slot's index in the template.

## Testing

- pytest: `lines` is filled for a quote that spans one line and one that wraps; empty for a quote the page
  does not have; GET fills lines for a pass saved without them; the prompt names the one-sentence rule.
- vitest: overlay draws one AI rect per line only on its page and only with AI on; the panel groups by slot
  in template order, jumps on click, and Keep dispatches one `addHighlight` with the same rects and quote;
  the badge shows the count and hides at zero; SlotPin is gone.
- e2e (canned Claude): turn AI on, the badge appears, the panel lists the canned sentences, clicking one
  scrolls the paper, Keep makes a reader highlight that survives a reload.

## Out of scope

Threads between sentences, Ask as a conversation, a separate facet vocabulary (the template slots are the
labels), density settings.
