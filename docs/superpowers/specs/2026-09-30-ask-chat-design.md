# Ask: a small chat about the paper, grounded in it and in the reader's own marks

30 September 2026. Asked for by the owner the same day (issue #9, "Ask as a grounded conversation").

## Goal, in one sentence

With AI help on, the reader can ask questions about the paper in a short chat, and every answer is tied to
the lines of the paper it rests on, with the reader's own highlights, notes and connections given to the
model as context so it answers in terms of how *they* are reading it.

## What the reader sees

- ⌘K → **Ask** opens an **Ask** panel (marked AI). A text box, the conversation above it.
- From a selection's › menu, **Ask about this** opens the panel with the selected words quoted as the
  question's subject.
- Each answer streams in. Below it, **based on** chips (`p3`, `p5`…) for its grounds; a chip scrolls the
  paper to that span. An answer whose grounds all fail the grounding rule is shown with a plain line
  "Not found in the paper: treat with care" instead of chips.
- An answer can also point at the reader's own note ("your note on §3"): such a ground is a chip that
  opens that note.
- **New chat** clears the conversation on screen (the file keeps it).
- AI help off: no Ask command, no panel, nothing sent.

## Principle 1

The chat explains and points. It never writes to the board: no notes, marks, tags or connections. The
system prompt tells the model to explain rather than hand over answers to the template's questions, and to
point back to the paper.

## Context sent with every question

1. The paper as spans, as the whole-paper pass sends it (`spans_block`).
2. The reader's layer, compact and labelled as the reader's: the reading goal; each highlight
   (`h-…`, its quote, its tags); each note (`n-…`, its text, what it is connected to); each connection
   (from, to, tags); group names with their members' ids. Card positions are not sent.
3. The chat so far (question/answer pairs, answers without their grounds), at most the last 10 turns.
4. The question, and the selected words if it came from Ask about this.

Everything in 1 and 2 is wrapped in tags and the system prompt says tag content is data, never
instructions (as the other prompts do).

## Model and routes

- A new constant `ASK_MODEL` (Sonnet 5, effort `medium`) in `ai_client.py`, beside the reader and definer.
- A new `ClaudeClient.ask(system, prompt, schema) -> Iterator[str]` streaming the JSON as Define does,
  implemented for the API route, the Claude Code route (`claude -p`, no tools, empty folder, as Define) and
  the canned test client.
- Output schema: `{"answer": string, "grounds": [{"span": string, "quote": string}], "notes": [string]}`
  (`notes`: ids of the reader's notes the answer relies on; unknown ids are dropped).
- Grounding: `ground_all` for spans; notes filtered to ids that exist.

## Server

- `POST /api/papers/{id}/ai/ask` `{question, selection?: string, history: [{question, answer}]}` →
  NDJSON stream like Define: `{"delta": …}` lines then `{"done": {answer, grounds, notes}}` or
  `{"error": …}`. Refused when AI help is off (same check as Define).
- Every call appended to `ai-log.jsonl` as kind `"ask"`.
- Each finished turn appended to `papers/<id>/chat.jsonl`
  (`{t, question, selection, answer, grounds, notes}`), for transparency and later study.

## Testing

- pytest: the reader-layer block (highlights, notes with connections, groups) from a board; prompt
  contains spans, reader layer, history cap 10 and the data-not-instructions line; grounding drops bad
  spans and unknown note ids; refused when AI is off; chat.jsonl and ai-log get one line per turn; the
  Claude Code route builds a no-tools argv for ask.
- vitest: panel streams deltas, shows chips for grounds and the "Not found" line when none, chips scroll
  or open notes, Ask about this pre-fills the selection, hidden when AI is off.
- e2e with the canned Claude: ask a question, see the answer and a chip, click the chip, the paper scrolls.
