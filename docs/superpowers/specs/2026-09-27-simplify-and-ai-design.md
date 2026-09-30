# Simplify the UI, and a small AI layer: design

27 September 2026. Agreed with the owner in a brainstorm the same day, after they read real papers with the tool and found it "a bit too cluttery". Two parts. **A** changes how things are done, not what exists: every concept stays. **B** adds optional AI help for jargon and for knowing where to look, in the style of Semantic Reader.

Already merged before this spec (not repeated here): the Paper | Both | Board switch with a draggable divider, view state in `view.json`, six always-visible controls with a More menu, the thin cut ruler in the margin, four tag presets, Tidy removed, numbered headings found inside other regions, and Add paper in the picker.

## Goal, in one sentence each

- **A.** A first-time reader sees only the paper, the board and three controls, and finds every other action where their hand already is.
- **B.** A reader stuck on a word or unsure where the paper answers a question gets help in place within two seconds, grounded in the paper and marked as AI, without the AI doing their thinking.

## A. Simplify: gestures first, the same actions as buttons

Direction: a hybrid of LiquidText and Apple. Every action has a gesture (the fast path) and a visible button in a small contextual bar or in ⌘K (the discoverable path). Nothing is only a gesture.

### A1. Top bar

```
Paper Board  [paper ▾]  [Paper | Both | Board]  Why am I reading this?      ②Questions  ③Glossary  ⌘K
```

- Always visible: the paper picker (with Add paper…), the three-way switch, the reading goal, and the ⌘K button.
- **Questions** and **Glossary** appear only when they have something to list, with a count.
- **⌘K** opens one searchable list of every command. It replaces the More menu. Clicking the ⌘K button opens the same list. The commands are Export, Tags, Template, Add missing sections, New note, Find in paper, AI help on/off (B), and Shortcuts (the cheat sheet, also on `?`).
- New note leaves the bar: a double-click on empty board makes one (A3), and it is in ⌘K.

### A2. Selecting text on the paper, or on a card

Releasing a selection shows one bar beside it:

```
 ● ● ● ● ●  |  ✂  🔍  ›
```

- **Colour dots.** The first is plain yellow: a highlight with no tag. Each other dot is a tag, in the tag's own colour. One tap makes the highlight and gives it that tag as its **main tag**; the colour of the mark is the colour of its main tag.
- **Extra tags.** From ›, "Add tag". An extra tag shows as a small chip on the mark and does not change its colour.
- **✂** cuts, the same as dragging the selection onto the board. On a card's text, ✂ is Cut out.
- **🔍** is Find in paper.
- **›** holds the rest: Add tag, Connect, Add note, Ask elsewhere, and, on card text, Split here. On a mark, right-click opens the same list.
- **Gesture:** drag a selection from the paper onto the board to cut it there, where you drop it. Drag selected lines out of a card to Cut out.

Data: a highlight's `tags` list stays as it is. The **first** tag is the main tag. Tapping a colour sets the first tag; Add tag appends. No schema change.

### A3. The board

- **Select one card** (click it) and a bar appears above it:
  ```
   ● ● ● ● ●  |  ↗  ⤢  ›
  ```
  - Colour dots set the card's main tag, shown as a thin coloured edge.
  - ↗ shows the source: it scrolls the left paper in Both mode, and jumps to Paper view otherwise.
  - ⤢ collapses or expands the card.
  - › holds Add tag, More context, Sketch (notes only) and Delete.
- **Select several cards** (shift-click or a lasso) and the bar reads **Group · Join · ●**. Join shows only when the cards are neighbours in the paper; ● colours them all.
- **Gestures:**
  - drag from a card's edge onto another card to connect; drop on empty board for a connected note (exists today);
  - double-click empty board for a new note;
  - drag a lasso on empty board to select, then Group.
- Nothing shows on a card until it is hovered or selected; that is already done.

### A4. Learning the gestures

- Three hints, each shown once, faintly, at the moment it applies:
  - "Drag selected text onto the board to cut it", on the first text selection in Both mode.
  - "Drag from a card's edge to connect it", on the first card selection.
  - "Double-click to add a note", on the first time the board is empty of notes and shown.
- A hint goes away when its gesture is done once, or when it is dismissed. Which hints have been seen is kept in browser storage (it is a convenience, not the reader's work).

### A5. What is removed

- The More menu (its items move into ⌘K).
- The permanent New note button.
- The tag picker as a separate step for highlights (the colour dots replace it).

## B. The AI layer

### B1. Principle 1, restated

Replace section 2's principle 1 with:

> **The reader does the work.** AI may point and explain, visibly marked, and only when the reader has turned it on. It never writes the reader's notes, answers a slot, clears a question, connects, tags, groups or places anything.

Principle 5 becomes: "Plain local files, no account. Nothing leaves the machine unless AI help is turned on."

### B2. On and off

- One switch, *AI help*, in ⌘K. It is **off** by default and kept per paper in `view.json` as `ai: boolean`.
- **Off:** the tool is exactly what it was without B. Nothing is sent, and no AI mark, badge or button is shown.
- **On:** if the paper has no `ai.json`, the server makes one pass (B3). The switch's state never changes the board.

### B3. Two tiers: a whole-paper read, and quick definitions

Two kinds of call, both from the server, both grounded by the same rule:

| | Reader (the big pass) | Quick definition (the small call) |
|---|---|---|
| Model | `claude-opus-5-5`, effort `high` set explicitly | `claude-sonnet-5`, effort `low` |
| Reads | the whole paper, as spans | one word, its sentence, its section's text, and the paper's likely definition (D25) |
| When | once, in the background, when AI is turned on | when the reader hovers or selects a word the big pass did not cover and chooses **Define** |
| Gives | terms with definitions and explanations, and where to look for every slot | 1–2 plain sentences, with the quote from the given text it rests on |
| Speed | about a minute; nothing waits on it | starts streaming within a second or two |

The model ids are held in two constants.

**Why two tiers.** The reader's pass sees the whole argument, so it finds the jargon that matters and knows where each slot is answered. The quick call covers what it missed, at hover speed, looking only at the lines around the word. The reader keeps reading throughout: nothing blocks on either.

### B3a. The big pass

- **When:** the first time AI help is turned on for a paper, in the background, and again only when the reader asks (⌘K: "Redo AI pass"). Never on its own. While it runs, a small "AI reading…" note shows in the top bar. The quick call works meanwhile.
- **Input:** the paper's text as **spans**. A span is one non-furniture layout region, in reading order, with the id `p{page}-r{n}` (n counts regions on that page in reading order) and its text. Span ids are computed from `source.json` by one function; re-extraction may change them, which is why `ai.json` records the extraction time it was built from and is marked stale if `source.json` is newer.
- **Call:** one Claude Messages API call from the server.
  - Model `claude-opus-5-5`, with effort set explicitly (its default is `medium`).
  - Streamed, with structured output (`output_config.format`) against the schema below.
  - A 15-page paper is about 15–25k input tokens, well inside the context window. There is no caching, because there is one call per paper.
- **Output schema:**
  ```json
  {
    "terms": [{
      "term": "string, as printed",
      "defined_in": [{"span": "p3-r2", "quote": "exact words from that span"}],
      "explanation": "1-2 plain sentences",
      "grounds": [{"span": "p3-r2", "quote": "exact words"}]
    }],
    "where_to_look": [{
      "slot": "Problem | Evidence | ... (the template slot names)",
      "spans": [{"span": "p1-r4", "quote": "exact words"}]
    }]
  }
  ```
- **Grounding rule, enforced on the server:**
  - Every `{span, quote}` must name a span that exists, and its quote must appear in that span's text after whitespace is normalised.
  - The quote must be whole words, at least three of them (`MIN_QUOTE_WORDS`): it may not start or end inside a longer word, so "cause" is not a quote of "because" and "we" grounds nothing (tightened 30 September 2026 after review).
  - Anything that fails is dropped.
  - A term with no surviving `grounds` keeps only its `defined_in` and loses its explanation.
  - A slot keeps at most three spans.
  - The AI cannot point at text the paper does not have.
- **Saved** to `papers/<id>/ai.json`: generated, never hand-edited, holding the model id, the time, the extraction time, and the validated output. Hovering reads this file and needs no network.
- **Key:** there are two ways to reach Claude, and `serve` says in one line which one it uses.
  - **An API key**, from `ANTHROPIC_API_KEY` or the file `~/.config/paperboard/anthropic_key`. This goes through the API.
  - **Your Claude Code login**, when there is no key and `claude` is installed. The server runs `claude -p` itself, so no key is needed. It runs in an empty temporary folder, with no tools, no settings files and the API key variables removed, so it uses your plan and nothing from any project.
  - With neither, AI help says so plainly: log in to Claude Code, or save an API key.
  - The key is never logged, and never written to a board folder.
- **Errors:** no key, a network error, a refusal after the fallback, or invalid output each give one plain line ("AI help could not run: …") and leave AI off for that paper. The tool works exactly as without AI.

### B3b. The quick definition

- **Trigger:** "Define" in the selection bar's › (and on the context card of an underlined word whose AI part is empty).
- **Server route:** `POST /api/papers/{id}/ai/define` with `{word, page, rect}`. The server gathers the context itself: the sentence, the section's text, and D25's likely definition. The client never sends free text to the model.
- **Result:** `{explanation, grounds: [{span, quote}]}`, checked by the same grounding rule. It is streamed to the card, then appended to `ai.json` under `defined`, keyed by the normalised word. The next hover of that word anywhere is instant and makes no call.
- **Not a mark:** a quick definition is not a mark, is never exported, and needs Keep to become a `term` mark, as in B4.
- **Errors:** errors give one plain line on the card. There are no retries beyond the SDK's own.

### B4. Jargon on the paper (Semantic Reader style)

- With AI on, every occurrence of each AI term in the paper's text gets a **faint dotted underline**. Terms the reader tagged `term` keep their solid underline, and the reader's own tag wins where they meet.
- Occurrences are found by whole-word, case-insensitive matching over the page words the tool already has. On a board card's text the same underline shows.
- Hovering or focusing one opens the existing context card (D26/D27) with up to three parts, in this order:
  1. **Your definition:** a note of yours connected to a `term` mark of this word.
  2. **In this paper:** the `defined_in` sentence, or D25's likely definition if the AI gave none.
  3. **AI:** the plain explanation, with an AI badge and "based on p3 ↗" links that scroll to each ground.
- **Keep** on the card makes a `term` mark of the reader's own on that occurrence. It copies no AI text; the reader writes their definition in a note as before.
- The Glossary lists the reader's `term` marks as today. With AI on, AI terms the reader has not kept are listed after them, in a lighter style and badged AI.

### B5. Where to look

- With AI on, each template slot that has spans in `ai.json` shows a small **📍** beside its question.
- Clicking 📍 faintly outlines those spans on the paper, dashed and badged AI, and scrolls the paper to the first one (the left pane in Both mode). A second click hides them. Clicking an outline scrolls to it.
- It writes nothing, places nothing and tags nothing. A slot the AI had nothing for shows no 📍.

### B6. Export and the question list

- AI explanations and outlines are never exported: they are not the reader's work. A `term` mark the reader kept exports like any mark.
- An AI item never clears a `question`, as today's AI notes do not.

## Data and interfaces, in one place

| Thing | Where | New or changed |
|---|---|---|
| main tag | a highlight's or piece's first `tags` entry | meaning only, no schema change |
| `ai` switch | `view.json` | new field, default false |
| AI output | `papers/<id>/ai.json` | new file, generated |
| span ids | computed from `source.json` regions | new function, not stored in `source.json` |
| `POST /api/papers/{id}/ai` | runs the pass, returns the validated `ai.json` | new route |
| `GET /api/papers/{id}/ai` | returns `ai.json` with the pass's status (`none`, `running`, `done`, `failed`), or 404 if there is none | new route |
| `POST /api/papers/{id}/ai/define` | one quick definition, streamed; saved under `defined` in `ai.json` | new route |

## Testing

- **A:**
  - unit tests for each bar's contents per selection;
  - the main tag set by a colour and extra tags appended;
  - ⌘K lists every command;
  - badges hidden when empty;
  - each hint shown once;
  - e2e for each gesture and its button twin (cut by drag and by ✂, connect by drag, note by double-click, group by lasso).
- **B, server:**
  - span ids are stable for a fixed `source.json`;
  - the grounding rule (a quote not in its span is dropped, an unknown span is dropped, at most three spans a slot);
  - stale detection;
  - every error path, with the Claude client **faked**, so no test calls the network;
  - one opt-in live test, skipped unless a key and a flag are set.
- **B, client:**
  - AI off shows nothing AI and makes no request;
  - dotted vs solid underline precedence;
  - the order of the context card's parts;
  - Keep makes a `term` mark with no AI text;
  - 📍 toggles outlines.

## Out of scope

- The study (the event log, participant roots, where objects came from).
- A local model, and a pluggable model interface.
- Quick definitions for anything but a word or short phrase: no "explain this paragraph".
- Suggested connections or placement.
- Explaining a selection on demand (Ask elsewhere stays for that).
- Any AI text inside a note.
