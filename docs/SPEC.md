# Paper Board: spec and plan

Fifth revision, 23 September 2026. Grounded in RESEARCH.md and TOOLS.md. The fourth revision closed the open items and fixed the design principles. This one writes in fourteen decisions taken after the first code review, D1 to D14 in section 12: any span can be highlighted, a chunk shows its equations and figures as images, a connection ends on the thing itself rather than on the card that holds it, the board comes back exactly as you left it, and an AI answer may be pasted in as a marked note that never answers a question for you.

## 1. Purpose

A tool for taking a CS paper apart so its ideas can be laid out, connected, and understood. Like cutting a printed paper into pieces with scissors, spreading them on a desk, and writing on scraps beside them. Except nothing is destroyed, and every piece remembers where it came from.

There is no right way to read a paper with it. It is a tool for making your own tools around the paper, in your own non-linear order.

## 2. Principles

Every later decision is checked against these eight. If a feature fails one, it is not in the tool.

1. **The reader does the work.** Nothing is generated: no summaries, no explanations, no suggested tags or connections. The measured gains in understanding come from the reader constructing links and explaining in their own words (RESEARCH.md section 5). Anything automatic that does that work removes the gain. Text written elsewhere by an AI may be pasted in as a note marked as AI; it never answers a question for you (section 6).
2. **Nothing is forced.** No reading order, no required pass, no required label or type. Structure is available when the reader wants it and invisible when they do not (Shipman and Marshall).
3. **The paper is never edited, and the source is always one click away.** Every piece cut from the paper keeps a link back to where it came from.
4. **Four primitives, one set of operations.** Anything on the board is a piece, a tag, a connection, or a group. One thing lives on the paper instead: the highlight, which shows through the pieces that contain it. Anything new must be one of those or it is not added.
5. **Plain local files, no account, no cloud.** A board is a folder you can copy.
6. **One board per paper.** Bounded by construction so it never sprawls.
7. **Export is not an afterthought.** The board written out in the paper's order is the literature note. No separate summary is written by hand.
8. **Depend, copy, or write, by how commodity the problem is.** Depend on a library where the problem is commodity, well solved, and actively maintained: rendering, the canvas, layout detection. Copy the algorithm where it is well understood but not packaged: fuzzy quote matching. Write it only where it is specific to this tool: the cut that remembers where it came from.

## 3. What the research says the tool must do

From RESEARCH.md, the effects on understanding that are actually measured come from four acts by the reader. The tool exists to make these four acts easy and to stay out of the way otherwise.

| Act | Evidence | In the tool |
|---|---|---|
| Deciding what connects to what and naming it | concept maps, argument maps | draw a line between any two pieces, tag it if you want |
| Explaining in your own words | self-explanation, generative notes | write a note on anything |
| Arranging things in space | Space to Think, spatial hypertext | move anything anywhere; proximity counts |
| Coming back to it | note review | the board is exactly as you left it |

Everything else in the spec is plumbing for these four.

## 4. Two views of one board

Think of a printed paper, a marker, and a pair of scissors. You mark the paper as you read. You cut it into pieces and spread them on a table. You write on scraps beside the pieces. The tool is that, with nothing destroyed.

A paper is opened in one of two views, and you switch between them at any time. Switching never moves anything: each view keeps its place while the other is showing. Closing and reopening restores everything as you left it: the view you were in, where you were in the paper, where you were on the board, and the tag filter.

**Paper view.** The PDF itself, full width, as the authors laid it out. This is the only place you mark or cut. Select a span, from any start to any end, across headings, columns or pages if you like, or drag a rectangle around a figure, table or equation. Then choose: **highlight** or **cut**. One selection, one choice after it, no modes.

- A **highlight** is the marker. It stays on the paper and paints exactly the words you selected, line by line, however many columns or pages they cross. Tag it, write a note on it, and the note shows in the margin here. Connect it to another mark or to a section heading without leaving the paper; the connection shows in the margin as a chip that jumps to the other end. A highlighted word does not become a piece; it is too small to be one.
- A **cut** is the scissors. The selected region becomes a chunk on the board. Clicking a heading cuts that section. **Split** cuts every section and figure at once. A cut is drawn on the paper as an outline, so you can always see what you have pulled out and what you have not.

**Moving around the paper.** The paper's own links work. "Section 3", "Eq. (2)" and "[12]" scroll the paper view to what they point at, and a web address opens in a new tab. The links belong to the paper, so following one adds nothing the reader did not make. **Find in paper** takes a selected word and lists everywhere else it appears, with page and section; click one to go there. It suggests nothing: what to mark and what to connect stays your decision.

**Board view.** The table. Every chunk is a jigsaw piece here: move it, resize it, put it beside anything, collapse it out of the way. The highlights inside a chunk are painted on it. Notes, tags, connections, and groups live here. Clicking any chunk or mark jumps the paper view to where it came from.

The two views are mirrors. A chunk on the board is an outline on the paper. A mark on the paper shows through whichever chunk contains it. A note is in both. A highlight made in a part of the paper with no chunk stays on the paper until you cut something around it, and its connections show only as margin chips until then: mark and connect everything first and cut afterwards if that is how you read.

**First open.** The paper view, with an empty board behind it. One line on the empty board says: highlight anything, cut anything, or split the paper into the authors' sections.

**Why chunks, not excerpts.** A paper is written in the order that persuades a reviewer. Its argument is scattered across that order: the claim in the introduction, the mechanism in section 3, the assumption in 4.1, the evidence in a figure in section 5. Reading is reassembling the argument, and the unit you move is the region that carries one idea. Sometimes that is a section, often a paragraph, a figure with its caption, or a span that runs from the end of 3.2 into 3.3. The authors' sections only approximate it, so split is a starting point and the reader chooses the regions. Ten pieces on a table can be played with. A hundred sentences cannot.

## 5. The four primitives

Each does several jobs so that there are only four.

### 5.1 Piece

Anything on the board.

| Comes from | What it is | Source link |
|---|---|---|
| cutting in the paper view | a chunk: any region of the paper, from a sentence to several sections | yes |
| the split command | one chunk per section, one per figure or table | yes |
| writing | a note, any length, Markdown, URLs inside if you have a source | no |

Every piece has the same operations: move, resize, collapse or expand, open source, tag, connect, group, delete. There are no piece-specific operations.

Delete or Backspace removes whatever is selected: pieces, marks or connections. Every board and highlight action in a session can be undone and redone, with Cmd-Z and Shift-Cmd-Z, so nothing is lost by trying something. Deleting a group lifts what was inside it out rather than deleting it.

A chunk collapsed shows its first line and a count of the marks and notes on it. Expanded, it shows the full region in the paper's own words with your highlights painted on it, so one section can be read closely and annotated with everything else collapsed.

An expanded chunk is mixed, the way the page is: its paragraphs, lists and headings are text, and its displayed equations, figures and tables are images of the paper as printed, all in reading order. Maths inside a sentence stays text. Figures and equations are rectangles rendered from the PDF, never LaTeX, never re-typeset. A figure piece keeps its PNG clip in the board folder; the images inside a chunk are rendered when shown and never stored, because nothing else refers to them. Text in a chunk is read, not selected; to mark or cut again, open the source and do it in the paper.

**Highlights are not pieces.** They live on the paper and show through chunks. A highlight takes tags, notes, and connections, but it does not move, resize, or group, because it is not on the table. A chunk finds its highlights by geometry: every mark with a line inside the chunk's region is shown on it, including marks made before the chunk was cut, and only the lines inside are painted. A highlight paints exactly the words selected, line by line, on the paper and in every chunk that holds one of its lines. Overlapping chunks are allowed and share their marks.

Selection is deliberately forgiving: a rough drag across a paragraph selects the whole paragraph, and holding a modifier key keeps exactly what you selected. A rough rectangle snaps the same way to the figure, table or equation it mostly covers, taking a figure's or table's caption with it, and the same modifier keeps the exact rectangle. The image is rendered sharp, at three times the page's own resolution. Cutting never changes the paper.

A chunk is anchored by its region, one rectangle per page it crosses, plus the quoted text at its start and end. A highlight is anchored by one rectangle per line, each with its page, plus the quoted text with a few words either side. Both re-anchor by quote first, rectangle second, and are flagged if neither matches. The shapes are in SPEC-ADDENDUM.md section 5.

### 5.2 Tag

A word with a colour. Attached to any piece, highlight, or connection. Filter the board by tag: the board shows anything carrying any of the active tags and hides the rest, a group stays visible while any of its children is, and marks inside a chunk dim by the same rule. With no tag active, nothing is filtered.

Tags do the jobs the earlier drafts gave to four separate things:

- **Reading role.** `problem`, `claim`, `method`, `evidence`, `assumption` are presets because those are the questions every reading guide converges on (RESEARCH.md section 1).
- **Pass.** `pass 1`, `pass 2` are presets. Add `pass 3`, `pass 7`, or none. Filter to `pass 1` to see what you knew after pass 1.
- **Connection kind.** `supports`, `contradicts` are presets. A tag on a connection colours the line.
- **Not yet understood.** `question` is a preset. The board lists every `question`-tagged highlight or piece with no note of yours connected to it. That list is the queue of things to go look up. Connecting a note you wrote clears it. A note marked as AI does not (section 6).

Presets can be renamed, recoloured, or deleted. New tags are one click. No piece or connection needs a tag. Tags are global across all boards, never per paper.

### 5.3 Connection

A line between two things: two pieces, a piece and a highlight, or two highlights, including a highlight that no chunk holds. The connection is stored between the two things themselves, never between the cards that happen to hold them, so re-cutting or deleting a chunk never breaks one.

On the board it is a line, and a line to a highlight ends at the mark inside the chunk that holds it. A highlight in no chunk has no line yet; its line appears the moment you cut a chunk around it. On the paper, every connection with a marked end shows in the margin beside that mark as a chip that jumps to the other end.

Connect on the board by dragging from one piece or mark to another. Connect on the paper from a mark's popover: choose Connect, then click another mark or a section heading. Connecting to a heading highlights the heading and connects to that.

Tag it or leave it plain. There is no other label on a line. If you want to say something about a connection, that is a note piece connected to the same pieces.

A note that belongs to several marks is a note with a connection to each. There is no separate "attach to many" feature because connections already do that.

### 5.4 Group

A rectangle, with a name if you want one. Anything inside it is together. Move the group, everything moves. Groups nest.

Groups are the cheap way to say "these belong together" before deciding how. They cover: a pile of pieces for one idea, everything gathered in one pass, three sections you want to read as a unit, a note plus the marks it explains.

Proximity without a group also counts. Readers use position as meaning long before they can name it. The tool never asks them to.

## 6. Things that are not primitives

**Reading goal.** One optional line at the top of the board: why am I reading this. It is a note pinned to the header.

**Split.** A command, described in section 4. It adds pieces; it is not a kind of piece.

**Question list.** A filter over pieces, described in section 5.2.

**Tidy.** A command that runs only when you ask. It lays out the top-level pieces and groups that have connections, so connected things sit near each other. It leaves everything unconnected, and everything inside a group, exactly where it is, and it is one undo step. This is in tension with section 3. Arranging things in space is one of the four acts the evidence supports, and section 12's first-open row says the tool must not decide the layout. Tidy does that act for you and may move pieces whose positions you remember. It is in by the owner's choice, and its limits are its whole design: it runs only on request, one Cmd-Z puts everything back, and it never touches what you have not connected or what you have grouped.

**Ask elsewhere.** For a term or step you do not understand. A mark's popover offers Ask elsewhere, which copies a prompt to the clipboard: the marked words, their sentence, the text of their section, and your reading goal. Paste it into whatever AI you use, then paste the answer back into a new note marked as AI. The tool makes no network call and generates nothing itself; TOOLS.md section 2 anticipated exactly this, a separate note clearly marked as generated. Three rules keep the work with the reader. An AI note is visibly marked. It never clears a question: only a note you wrote does, because the gain comes from explaining it yourself (RESEARCH.md section 5). Export labels it as AI.

**Export.** One command writes the board to a single Markdown file in the paper's own order, with figure clips as images, not placeholders. First the goal. Then each chunk, as a heading with its page, followed by each highlight inside it as a quote with its tags, and the notes connected to the chunk or to its highlights. Then highlights outside any chunk, then any notes connected to nothing. The chunk's full text is left out: the paper already holds it, and the note is what you marked and wrote. A note marked as AI is labelled as AI. Export saves any pending change first, so it writes what is on screen. Filtered by tag if you want, so "export pass 1" or "export claims and evidence" is the same command. This is the literature note.

## 7. Files

```
tags.json            # global tags: name, colour
papers/<paper-id>/
  paper.pdf
  source.json        # sections, figures, anchors. Generated. Never hand-edited.
  board.json         # pieces, positions, sizes, anchors, tags, connections, groups, goal
  notes/<id>.md      # one file per note, front matter holds id
```

Re-running extraction rewrites `source.json` only. Excerpts re-anchor as described in 5.1. Notes, tags, connections, groups, and positions are never touched by extraction.

## 8. Architecture

Standalone. Python backend, browser front end, runs locally. The tool is open source under an AGPL-compatible licence, which PyMuPDF requires.

| Job | Component | Licence |
|---|---|---|
| sections and figures with page coordinates, for split and export | `pymupdf-layout`, behind an `extract()` interface. Docling is the MIT drop-in if figure matching disappoints. | AGPL 3.0 |
| text under a rectangle, rendered clips, page geometry | PyMuPDF | AGPL 3.0 |
| API and file storage | FastAPI over plain files | MIT |
| pieces, connections, groups on a canvas | React Flow | MIT |
| paper view: rendering and text layer | `react-pdf` over PDF.js, plus our own selection layer | MIT / Apache 2.0 |

Model weights ship inside the `pymupdf-layout` wheel, so the tool needs no network access at any point, including first run.

API: get source, get and put board, get and put note, get text under a rectangle, get clip for a page and rectangle, render a region on request, list questions, export. Routes, file schemas, and the anchoring rules are in SPEC-ADDENDUM.md.

## 9. Not in v1

- Any generated text: summaries, explanations, suggested tags, suggested connections. Principle 1. The tool generates none; an AI answer you paste in yourself is a marked note (section 6).
- Calling an AI directly from the tool. Copying a prompt keeps the tool free of network access, keys and cost (principle 5). Revisit only if copy and paste proves to be the bottleneck.
- Linking terms automatically. That would generate connections. Principle 1. Find in paper shows where a word appears; connecting the occurrences is yours.
- Back and Forward in the paper view. Following a link does lose your place. If that becomes a nuisance, Back is the first thing to add.
- A section outline. The paper's own links, find in paper, and split already move you around the paper; an outline would be a second way to do the same thing.
- Citation peek. Following the paper's own link to its reference list does the same job with one more click.
- A fixed number of passes, a fixed reading order, or any required label. Principle 2.
- Marking or cutting from the board. The paper is the only place you highlight or cut.
- Free-text labels on connections. Tags only.
- Concept notes shared across boards. A note is a note. Cross-paper arrives with multi-paper, if it arrives.
- Citation graphs, paper discovery, library management, multi-paper canvases.
- Templates, themes, folders.
- Editing source text.

## 10. Build plan

| Step | Deliverable | Test on a real paper |
|---|---|---|
| 1 | Validate `pymupdf-layout` on three papers, one with heavy math, behind the `extract()` interface. `paperboard extract paper.pdf` writes `source.json` with sections and figures. Python only. | Are the section boundaries right? Are the figures found and paired with their captions? |
| 2 | FastAPI serving source, board, notes, text under a rectangle, clips. | curl. |
| 3 | Paper view with select, highlight, and cut. A cut becomes a chunk, persisted with its anchor; highlights inside it show on it. Board view shows chunks: move, resize, switch between views. | Cut three regions and highlight five spans, close, reopen. Same outlines and marks in the paper, same chunks on the board with the same marks. |
| 4 | Split command, figure clips, groups, collapse and expand. | Split, pile things up, close, reopen. |
| 5 | Tags, connections, notes, question list, export. | Reconstruct one paper's argument. Export it. |
| 6 | Acceptance test. | Below. |

Step 1 starts first because it is the validation and needs no UI. Step 3 is where the tool either works or does not: a cut in the paper must become a piece on the board and survive reopening.

## 11. Acceptance test

Take a paper you need to read. Using only the board:

1. Say what problem it solves, what it claims, how it works, and what the evidence is.
2. Show one thing you did not understand, and the note that resolved it.
3. Show one connection you drew that the paper does not state.
4. Filter to your first-pass tag. Does it match what you knew after ten minutes?
5. Close, reopen. Everything is where it was.
6. Switch views. Every outline on the paper is a chunk on the board, every mark shows through its chunk, and every chunk jumps to its outline.

If any step fails, the tool is not done.

## 12. Decisions taken in this revision

Recorded so the reasoning is not lost. Rows marked D1 to D14 were taken on 23 September 2026, after the first code review; SPEC-ADDENDUM.md section 12 holds their shapes.

| Question | Decision | Why |
|---|---|---|
| Groups: keep or drop? | Keep, name optional | Readers want piles before links. A pile you cannot name yet is the normal case. |
| Preset tags? | Ship ten, all deletable | Structure that is available, not forced. They encode the reading guides. |
| PyMuPDF licence | Keep PyMuPDF; tool is AGPL-compatible open source | Decided by the tool being open source. |
| Concept notes | Deferred | No visible payoff with one board per paper. Cannot pass the acceptance test. |
| Reference piece | Folded into notes | A reference is a note with a URL in it. |
| Connection labels | Tags only | Two vocabularies for one thing. A sentence about a connection is a note. |
| Where you cut | Paper view only | One gesture, one anchoring path. The board is where you arrange. |
| First open | Empty board, split on request | The tool must not decide the layout before the reader has read a word. |
| Extractor | `pymupdf-layout` | The hierarchy and figure-quality advantages the heavier tools are bought for did not survive measurement. Same project and licence as PyMuPDF, 43 MB, no downloads. |
| Paper view | `react-pdf` plus our own selection layer | The library first named was abandoned in 2024 and stores no quote text, so it could not re-anchor. |
| Equations | Rendered clips, never LaTeX | A cut equation is a rectangle like any chunk. Extracting equations separately serves no command. |
| Captions to figures | Proximity matching | Only split needs it. A miss costs one figure piece, which the reader cuts by hand in seconds. |
| Forgiving highlight | Snap to the layout region at 60 percent coverage | A guess, in one named constant, to be tuned after a day of reading. |
| Anchoring | Server side, in Python | One implementation, testable without a browser. |
| Grain | Chunks on the board, highlights on the paper | A paper cut into ten pieces can be played with; a hundred sentences cannot. The reader chooses the regions. |
| Gesture | One selection, then highlight or cut | Collect first, decide after. A mode is what MarginNote gets wrong. |
| Name | Still a placeholder | Decides nothing. |
| Highlight across columns and pages (D1) | One rectangle per line, computed from the words selected | Section 4 promised any span, but the anchor held one rectangle, and a two-line mark painted as one box. Lines rather than column runs, because a run still paints the unselected ends of its first and last lines. |
| Equations and figures inside a chunk (D2) | Mixed blocks: text regions as text; formulas, figures and tables as images; in reading order | They came out garbled or were dropped. Maths inside a sentence stays text. |
| Cutting figures and equations cleanly (D3) | A rough rectangle snaps to the figure, table or equation it mostly covers, with its caption; the modifier keeps it exact; images at three times resolution | The forgiving rule again, for rectangles. Reverses addendum section 11's removal of formulas as unused: formula regions were in `source.json` all along, and now the rectangle snap and chunk blocks read them. Not chosen: click-to-cut on figures, which fights text selection, and equations in split, which would make 30 pieces on Adam. |
| Delete and undo (D4) | An undo stack for the session; Delete removes the selection; a deleted note's file stays on disk | Nothing could be taken back, which made every gesture a commitment. Keeping the file is what lets undo restore a note. |
| Coming back to it (D5) | Restore the view, the paper's scroll position, the board viewport and the tag filter, all kept in `board.json` | Section 3's fourth act. In the file beside the viewport, rather than per browser. |
| What export contains (D6) | Per chunk in paper order: heading and page, highlights as quotes with tags, connected notes; figure clips embedded; the chunk's text left out | The literature note is what you marked and wrote. The paper already holds the text. |
| A highlight's note cache (D7) | Deleted; the question list and the margins walk the connections | The cache caused three bugs, and walking the connections of one paper is cheap. Supersedes the `highlights[].note` cache in addendum section 4.0. |
| Filter semantics (D8) | Any active tag shows; a group shows while any child does; marks dim | The features plan's rule, written down. |
| Re-uploading a paper that exists (D9) | Replace the PDF, re-extract, re-anchor, report what changed | Keeping the old PDF anchored everything against the wrong text. |
| Moving around the paper (D10) | The paper's own links are followable | The links belong to the paper, so they add no generated connection. Back, outline and citation peek declined (section 9). |
| Tidying the board (D11) | A force layout of connected top-level pieces, on request only, one undo step | The owner's choice, against the grain of section 3; section 6 states the tension and the limits. |
| Connections to marks outside any chunk (D12) | A connection is stored between the two things themselves and drawn on whichever card holds them; connect from the paper; margin chips | Mark first, cut later broke the moment you wanted to connect two marks. Supersedes addendum section 4.0's rule that an edge ends on a highlight through its chunk. |
| Finding a term elsewhere in the paper (D13) | Find in paper, suggesting nothing | Linking terms automatically would generate connections (principle 1). |
| Not understanding a concept (D14) | Ask elsewhere: copy a prompt, paste the answer into a note marked as AI, which never clears a question | Reverses principle 1 as written through the fourth revision, where nothing generated could enter the board at all. The tool still generates nothing; pasted AI text is allowed as a marked note. Only a note you wrote clears a question, so the self-explanation step stays with the reader. |
