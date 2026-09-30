# Paper Board: spec and plan

Sixth revision, 23 September 2026. Grounded in RESEARCH.md and TOOLS.md. The fifth revision wrote in nineteen decisions, D1 to D19 in section 12: any span can be highlighted, a chunk shows its equations and figures as images, a connection ends on the thing itself rather than on the card that holds it, the board comes back exactly as you left it, an AI answer may be pasted in as a marked note that never answers a question for you, and a new board opens already split into the paper's sections beside a template of empty groups that each ask one question. This one writes in four more, D20 to D23, taken the same day by the owner after using the board. The board's text is live: words in a chunk can be highlighted where you read them (D20), and a chunk can be split, cut or joined again on the board (D21). A note is shown as Markdown with its maths typeset (D22), and may carry one freehand sketch (D23). And letting go of a new line on empty board makes a note there, already connected. Two more, D24 and D25, were taken by the owner on 24 September: hovering one of the paper's own links shows the words it points at (D24), and Find lists the places that read like a definition first (D25). Both show only the paper's own text. Three more, D26 to D28, were taken the same day, for context on demand: a board card's references show what they point at (D26), a word tagged `term` shows its definitions where it is read and in a Glossary (D27), and a piece can show the paper's lines just around it (D28).

## 1. Purpose

A tool for taking a CS paper apart so its ideas can be laid out, connected, and understood. Like cutting a printed paper into pieces with scissors, spreading them on a desk, and writing on scraps beside them. Except nothing is destroyed, and every piece remembers where it came from.

There is no right way to read a paper with it. It is a tool for making your own tools around the paper, in your own non-linear order.

## 2. Principles

Every later decision is checked against these eight. If a feature fails one, it is not in the tool.

1. **The reader does the work.** AI may point and explain, visibly marked, and only when the reader has turned it on. It never writes the reader's notes, answers a slot, clears a question, connects, tags, groups or places anything. The measured gains in understanding come from the reader constructing links and explaining in their own words (RESEARCH.md section 5). Text written elsewhere by an AI may be pasted in as a note marked as AI; it never answers a question for you (section 6). A template's questions are fixed questions about papers in general, written once, never text generated about this paper.
2. **Nothing is forced.** No reading order, no required pass, no required label or type. Structure may be offered, empty and deletable; it is never required. Nothing has to be sorted, labelled or filled in before the reader is ready (Shipman and Marshall).
3. **The paper is never edited, and the source is always one click away.** Every piece cut from the paper keeps a link back to where it came from.
4. **Four primitives, one set of operations.** Anything on the board is a piece, a tag, a connection, or a group. One thing lives on the paper instead: the highlight, which shows through the pieces that contain it. Anything new must be one of those or it is not added.
5. **Plain local files, no account.** Nothing leaves the machine unless AI help is turned on. A board is a folder you can copy.
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

**The top bar.** The paper picker, the three-way switch, the reading goal, and **⌘K** are always there. ⌘K opens one searchable list of every command: export, tags, template, add missing sections, new note, find in paper, AI help on or off (section 9), and the shortcut list. It replaces the old More menu. **Questions** and **Glossary** appear only when they have something to list, each with a count. New note is not a permanent button: double-click empty board makes one, and it is in ⌘K too.

**Paper view.** The PDF itself, full width, as the authors laid it out. This is where you mark and cut as you first read; a chunk's text on the board takes the same marker and scissors (below). Select a span, from any start to any end, across headings, columns or pages if you like, or drag a rectangle around a figure, table or equation. Then choose: **highlight** or **cut**. One selection, one choice after it, no modes.

- A **highlight** is the marker. It stays on the paper and paints exactly the words you selected, line by line, however many columns or pages they cross. Tag it, write a note on it, and the note shows in the margin here. Connect it to another mark or to a section heading without leaving the paper; the connection shows in the margin as a chip that jumps to the other end. A highlighted word does not become a piece; it is too small to be one.
- A **cut** is the scissors. The selected region becomes a chunk on the board. Clicking a heading cuts that section. **Split** cuts every section and figure the board does not have yet, into the tray (section 6). A cut is drawn on the paper as an outline, so you can always see what you have pulled out and what you have not.

**Moving around the paper.** The paper's own links work. "Section 3", "Eq. (2)" and "[12]" scroll the paper view to what they point at, and a web address opens in a new tab. The links belong to the paper, so following one adds nothing the reader did not make. **Find in paper** takes a selected word and lists everywhere else it appears, with page and section; click one to go there. It suggests nothing: what to mark and what to connect stays your decision.

**The paper's own words, in place** (D24, D25). Hover or focus one of the paper's links, "[12]", "Ross et al., 2010", "Figure 3", and a small card labelled *In this paper* shows the words at the other end: the reference entry, the caption, the first lines of the section. The paper does not move; **Go there** follows the link, as clicking it always did. Find does the same for a term: a place whose sentence reads like a definition, "we call", "is defined as", "denoted by", a term with its abbreviation in brackets, is listed first with a small *likely definition* badge, and the rest follow in the paper's order. Both only show and reorder the paper's own text; nothing is written for you.

**Context on demand** (D26, D27, D28). The same card works everywhere, in both views. A link that lands on a figure, table or equation shows it as printed, with a figure's caption. On a board card, where the text has no links, "Figure 2", "Eq. (3)", "Sec. 4.1" and "[12]" are found by simple named patterns and lightly underlined when the paper has the thing they name; hovering one shows the figure, the formula, the section's first lines or the bibliography entry, and one the paper cannot show stays plain text. A word tagged `term` shows, on hover, your own definition first (a note connected to it), then the sentence the paper most likely defines it in (D25's rules), then **Look up elsewhere**, which is Ask elsewhere with a prompt for jargon, and its answer is marked AI. The **Glossary**, beside Questions, lists every `term` in the paper alphabetically with the first line of your definition. **More context** on a card or a mark shows the paper's few lines just before and after it, dimmed, and hides them again; the piece itself never changes. Everything shown is the paper's own text or your own notes, except the AI answer, which says so.

**Board view.** The table. Every chunk is a jigsaw piece here: move it, resize it, put it beside anything, collapse it out of the way. The highlights inside a chunk are painted on it. Notes, tags, connections, and groups live here. Clicking any chunk or mark jumps the paper view to where it came from.

Every gesture on the board has a button twin, so nothing is only a gesture. Click a card to select it and a bar appears above it: colour dots for its main tag, a button to show its source, collapse or expand, and a `›` for the rest. Shift-click cards, or hold Shift and drag a lasso on empty board, to select several at once; the bar then reads Group, Join (when the cards are neighbours in the paper) and the colour dots. Drag from a card's edge to another card to connect them, or drop on empty board for a connected note; double-click empty board, or right-click it and choose New note, for a plain one; the same right-click menu has New group. Drag on empty board to move around it; scroll or pinch to zoom. On the paper, scrolling moves up and down the pages.

A few gestures are shown once, faintly, the first time they apply, and go away once used or dismissed: dragging text onto the board, dragging from a card's edge to connect, and double-clicking to add a note. Which have been seen is kept in browser storage, since it is a convenience, not the reader's work.

**The board's text is live** (D20, D21). The board is an exact copy of the paper, so you can mark it where you are reading it. Select words in a chunk's text and choose:

- **Highlight.** The same highlight the paper view makes, the same object, shown in both views. It is found in the paper by the words you selected, inside that chunk's region, so it paints the same lines on the paper as on the card. Connect it to a note by dragging from its mark.
- **Split here.** The chunk becomes two, divided at the line where the selection starts.
- **Cut out.** The chunk becomes up to three: what comes before the selection, the lines selected, and what comes after. A part with nothing in it is left out.

The scissors on the board cut between printed lines, so a selection that starts or ends mid-line takes its whole first and last lines. A cut in the paper view of more than one line already does the same, because its region is a rectangle per column.

The new pieces take the chunk's place on the board, in the paper's order. The paper is untouched: a chunk is only ever a region of it, so splitting one changes which regions you hold, not the paper. Marks follow by geometry, as they always do: each mark shows on whichever piece now holds its lines. A connection that ended on the chunk itself stays with the piece that begins where the chunk began.

**Join** is the other direction. Select two or more chunks that are neighbours in the paper, each ending where the next begins, and Join makes them one chunk again, their region together, their text in the paper's order. Chunks that are not neighbours cannot be joined, and Group is offered instead. The rule behind all three: **the paper's order lives inside a chunk; your order lives between chunks.** A chunk always reads in the paper's order, which is why only neighbours join; to put pieces from different places together in your own order, group them.

Each of these is one undo step.

The two views are mirrors. A chunk on the board is an outline on the paper. A mark on the paper shows through whichever chunk contains it. A note is in both. A highlight made in a part of the paper with no chunk stays on the paper until you cut something around it, and its connections show only as margin chips until then: mark and connect everything first and cut afterwards if that is how you read.

**First open.** *30 September 2026: a new board opens with the Paper group of pre-cut sections and without the template's grid of slots (`TRAYS_ENABLED` on and `TEMPLATE_ON_FIRST_OPEN` off, in `web/src/model/tray.ts`). The template file stays, for Key sentences' slot names and order. The rest of this paragraph describes the grid as it was.* The paper view, with the board behind it already laid out. On the left is a group named **Paper**, the tray: every section and figure of the paper, collapsed, in the paper's order. To its right is the template: a grid of empty groups, each named for one question a reader of a paper should be able to answer, with the question itself shown faintly inside it. The whole first layout is one undo step.

The reason is speed: the reader starts building their own map of the paper at once, instead of cutting it up first. Section headings in CS papers are numbered and bold, so the sections found are reliable. This reverses the earlier rule that the tool must not decide the layout before the reader has read a word (section 12). The answer to that rule is what gets placed: the paper's own sections, and empty groups that can be renamed, deleted or ignored. Nothing is generated, and nothing has to be sorted. A piece can stay in the tray for good.

**Why chunks, not excerpts.** A paper is written in the order that persuades a reviewer. Its argument is scattered across that order: the claim in the introduction, the mechanism in section 3, the assumption in 4.1, the evidence in a figure in section 5. Reading is reassembling the argument, and the unit you move is the region that carries one idea. Sometimes that is a section, often a paragraph, a figure with its caption, or a span that runs from the end of 3.2 into 3.3. The authors' sections only approximate it, so split is a starting point and the reader chooses the regions. Ten pieces on a table can be played with. A hundred sentences cannot.

## 5. The four primitives

Each does several jobs so that there are only four.

### 5.1 Piece

Anything on the board.

| Comes from | What it is | Source link |
|---|---|---|
| cutting in the paper view | a chunk: any region of the paper, from a sentence to several sections | yes |
| the split command | one chunk per section, one per figure or table | yes |
| writing | a note, any length, in Markdown with maths, shown rendered and edited as plain text; it may carry one freehand sketch (D22, D23) | no |

Every piece has the same operations: move, resize, collapse or expand, open source, tag, connect, group, delete. The one exception is the scissors: a chunk's text can be highlighted, split, cut and joined on the board (section 4, D20 and D21), because those are the paper view's own marker and cut, done where you are reading. They make highlights and chunks, which already exist; they add no kind of thing.

Delete or Backspace removes whatever is selected: pieces, marks or connections. Every board and highlight action in a session can be undone and redone, with Cmd-Z and Shift-Cmd-Z, so nothing is lost by trying something. Deleting a group lifts what was inside it out rather than deleting it.

A chunk's text points where the paper points: its references to figures, tables, equations, sections and the bibliography open the context card (D26), and a mark tagged `term` opens its definitions (D27). **More context** on a chunk shows the paper's lines just above and below its region, in place and dimmed, without moving the region (D28).

A chunk collapsed shows its first line and a count of the marks and notes on it. Expanded, it shows the full region in the paper's own words with your highlights painted on it, so one section can be read closely and annotated with everything else collapsed.

An expanded chunk is mixed, the way the page is: its paragraphs, lists and headings are text, and its displayed equations, figures and tables are images of the paper as printed, all in reading order. Maths inside a sentence stays text. Figures and equations are rectangles rendered from the PDF, never LaTeX, never re-typeset. A figure piece keeps its PNG clip in the board folder; the images inside a chunk are rendered when shown and never stored, because nothing else refers to them. Text in a chunk can be selected, and a selection offers Highlight, Split here and Cut out (section 4). Selecting text never moves the card: a drag that starts on its text selects, and a drag that starts anywhere else on the card moves it. This reverses the fifth revision's "text in a chunk is read, not selected" (D20).

**Highlights are not pieces.** They live on the paper and show through chunks. A highlight takes tags, notes, and connections, but it does not move, resize, or group, because it is not on the table. A chunk finds its highlights by geometry: every mark with a line inside the chunk's region is shown on it, including marks made before the chunk was cut, and only the lines inside are painted. A highlight paints exactly the words selected, line by line, on the paper and in every chunk that holds one of its lines. Overlapping chunks are allowed and share their marks.

Selection is deliberately forgiving: a rough drag across a paragraph selects the whole paragraph, and holding a modifier key keeps exactly what you selected. A rough rectangle snaps the same way to the figure, table or equation it mostly covers, taking a figure's or table's caption with it, and the same modifier keeps the exact rectangle. The image is rendered sharp, at three times the page's own resolution. Cutting never changes the paper.

A chunk is anchored by its region, one rectangle per page it crosses, plus the quoted text at its start and end. A highlight is anchored by one rectangle per line, each with its page, plus the quoted text with a few words either side. Both re-anchor by quote first, rectangle second, and are flagged if neither matches. The shapes are in SPEC-ADDENDUM.md section 5.

### 5.2 Tag

A word with a colour. Attached to any piece, highlight, or connection. Filter the board by tag: the board shows anything carrying any of the active tags and hides the rest, a group stays visible while any of its children is, and marks inside a chunk dim by the same rule. With no tag active, nothing is filtered.

A mark or a card can carry several tags, but only one colour: its **main tag**, the first tag in its list. Releasing a selection on the paper or on a card's text shows a row of colour dots, one per tag and one plain; tapping a dot makes the highlight and sets that tag as the first, so the mark is painted in that colour. Adding another tag from `›` appends it and never changes the colour. The same dots, on a selected card's bar, set the card's main tag, shown as a thin coloured edge.

Tags do the jobs the earlier drafts gave to four separate things:

- **Reading role.** `problem`, `claim`, `method`, `evidence`, `assumption` are presets because those are the questions every reading guide converges on (RESEARCH.md section 1).
- **Pass.** `pass 1`, `pass 2` are presets. Add `pass 3`, `pass 7`, or none. Filter to `pass 1` to see what you knew after pass 1.
- **Connection kind.** `supports`, `contradicts` are presets. A tag on a connection colours the line.
- **Not yet understood.** `question` is a preset. The board lists every `question`-tagged highlight or piece with no note of yours connected to it. That list is the queue of things to go look up. Connecting a note you wrote clears it. A note marked as AI does not (section 6).
- **Jargon.** `term` is a preset (D27). A marked word tagged `term` shows its definitions on hover and is listed in the Glossary.

Presets can be renamed, recoloured, or deleted. New tags are one click. No piece or connection needs a tag. Tags are global across all boards, never per paper.

### 5.3 Connection

A line between two things: two pieces, a piece and a highlight, or two highlights, including a highlight that no chunk holds. The connection is stored between the two things themselves, never between the cards that happen to hold them, so re-cutting or deleting a chunk never breaks one.

On the board it is a line, and a line to a highlight ends at the mark inside the chunk that holds it. A highlight in no chunk has no line yet; its line appears the moment you cut a chunk around it. On the paper, every connection with a marked end shows in the margin beside that mark as a chip that jumps to the other end.

Connect on the board by dragging from one piece or mark to another. Let go on empty board instead and a note of yours appears there, already connected, ready to write in. Connect on the paper from a mark's popover: choose Connect, then click another mark or a section heading. Connecting to a heading highlights the heading and connects to that.

Tag it or leave it plain. There is no other label on a line. If you want to say something about a connection, that is a note piece connected to the same pieces.

A note that belongs to several marks is a note with a connection to each. There is no separate "attach to many" feature because connections already do that.

### 5.4 Group

A rectangle, with a name if you want one. Anything inside it is together. Move the group, everything moves. Groups nest.

Groups are the cheap way to say "these belong together" before deciding how. They cover: a pile of pieces for one idea, everything gathered in one pass, three sections you want to read as a unit, a note plus the marks it explains.

Proximity without a group also counts. Readers use position as meaning long before they can name it. The tool never asks them to.

**A slot is a group with a question.** Any group may carry a prompt, a guiding question shown faintly inside it until it holds a note. Clicking the question starts a note of your own inside the group, with the question as the empty note's placeholder. A slot is still just a group: rename it, delete it, add another, nest it. Putting a piece in a slot does not tag it; slots and tags are independent. The template's slots are the default set a new board starts with (section 6); a slot is not a new primitive.

## 6. Things that are not primitives

**Reading goal.** One optional line at the top of the board: why am I reading this. It is a note pinned to the header.

**Split.** A command, described in section 4. It adds pieces; it is not a kind of piece. It adds, into the tray, every section and figure piece the board does not have yet, so running it twice adds nothing. A new board runs it once on first open. It has one implementation, on the server.

**Split here, Cut out, Join.** Commands on a chunk's text and on a selection of chunks, described in section 4 (D21). Like split, they add and remove chunks and are not a kind of piece, and the regions and text they make have one implementation, on the server.

**The tray.** The group named Paper that a new board opens with. It lists every section of the paper in order. When a section's piece has been moved out of the tray, the tray keeps a faint ghost row in its place, such as "§3 Model → in Method · 4 marks · 2 notes"; clicking it jumps to the piece. The counts are worked out from the section's region, the same way a chunk finds its marks. So the tray is also where you find the notes for each section. It is the place for anything the template did not anticipate, which is why the template has no slot for what surprised you.

**Template.** The slots a new board starts with, kept in one global file and edited like the tags. Editing it changes future boards only. The default is nine questions, three to a row:

| Slot | Question |
|---|---|
| Background | What do you need to know first: terms, notation, setup? |
| Problem | What problem is this solving, and why should anyone care? |
| Prior work & gap | What did earlier work do, and what did it miss? |
| Main point | In your own words: what is the one thing this paper shows? |
| How it works | What are the key parts of the approach? |
| Evidence | Does the evidence actually support the claim? |
| Limits | What does it assume, and where does it stop holding? |
| My take | What do the authors conclude, and do you agree? |
| Open questions | What is still open? What would you ask the authors? |

They are questions, not labels, because the gain comes from the reader writing the answer (RESEARCH.md section 6). Every one is optional and deletable, and a piece need not go in any of them.

**Question list.** A filter over pieces, described in section 5.2.

**Tidy.** A command that runs only when you ask. It lays out the top-level pieces and groups that have connections, so connected things sit near each other. It leaves everything unconnected, and everything inside a group, exactly where it is, and it is one undo step. This is in tension with section 3. Arranging things in space is one of the four acts the evidence supports, and section 12's first-open row says the tool must not decide the layout. Tidy does that act for you and may move pieces whose positions you remember. It is in by the owner's choice, and its limits are its whole design: it runs only on request, one Cmd-Z puts everything back, and it never touches what you have not connected or what you have grouped.

**Ask elsewhere.** For a term or step you do not understand. A mark's popover offers Ask elsewhere, which copies a prompt to the clipboard: the marked words, their sentence, the text of their section, and your reading goal. Paste it into whatever AI you use, then paste the answer back into a new note marked as AI. The tool makes no network call and generates nothing itself; TOOLS.md section 2 anticipated exactly this, a separate note clearly marked as generated. Three rules keep the work with the reader. An AI note is visibly marked. It never clears a question: only a note you wrote does, because the gain comes from explaining it yourself (RESEARCH.md section 5). Export labels it as AI.

**Export.** One command writes the board to a single Markdown file in the paper's own order, with figure clips as images, not placeholders. First the goal. Then each chunk, as a heading with its page, followed by each highlight inside it as a quote with its tags, and the notes connected to the chunk or to its highlights. Then highlights outside any chunk, then any notes connected to nothing. The chunk's full text is left out: the paper already holds it, and the note is what you marked and wrote. A note marked as AI is labelled as AI, and a note's sketch is written as an image above its text. Export saves any pending change first, so it writes what is on screen. Filtered by tag if you want, so "export pass 1" or "export claims and evidence" is the same command. It can also be written in template order: each slot with its question, the notes and pieces inside it, and then everything not in a slot, in the paper's order. This is the literature note.

## 7. Files

```
tags.json            # global tags: name, colour
template.json        # global template: the slots a new board starts with
papers/<paper-id>/
  paper.pdf
  source.json        # sections, figures, anchors. Generated. Never hand-edited.
  board.json         # pieces, positions, sizes, anchors, tags, connections, groups, goal
  notes/<id>.md      # one file per note, front matter holds id
  notes/<id>.sketch.json  # a note's sketch, as its strokes, for re-editing (D23)
  notes/<id>.svg     # the same sketch as an image, built by the server
```

Re-running extraction rewrites `source.json` only. Excerpts re-anchor as described in 5.1. Notes, tags, connections, groups, and positions are never touched by extraction.

## 8. Architecture

Standalone. Python backend, browser front end, runs locally. The tool is open source under an AGPL-compatible licence, which PyMuPDF requires.

| Job | Component | Licence |
|---|---|---|
| sections and figures with page coordinates, for split and export | `pymupdf-layout`, behind an `extract()` interface. Docling is the MIT drop-in if figure matching disappoints. | AGPL 3.0 |
| text under a rectangle, rendered clips, page geometry | PyMuPDF | AGPL 3.0 |
| API and file storage | FastAPI over plain files | MIT |
| a note's Markdown and maths | `react-markdown`, `remark-math`, `rehype-katex` and KaTeX, bundled | MIT |
| a note's sketch | `perfect-freehand` | MIT |
| pieces, connections, groups on a canvas | React Flow | MIT |
| paper view: rendering and text layer | `react-pdf` over PDF.js, plus our own selection layer | MIT / Apache 2.0 |

Model weights ship inside the `pymupdf-layout` wheel, so the tool needs no network access at any point, including first run.

API: get source, get and put board, get and put note, get, put and delete a note's sketch, get text under a rectangle, get clip for a page and rectangle, render a region on request, split, highlight words in a chunk, split or cut a chunk, join chunks, get and put the template, list questions, export. Routes, file schemas, and the anchoring rules are in SPEC-ADDENDUM.md.

## 9. Not in v1

- Generated text inside the reader's work: summaries, notes, suggested tags, suggested connections or placement. Principle 1. AI help (D29) only points and explains, marked AI, when turned on; it is never exported.
- Calling an AI directly from the tool. Copying a prompt keeps the tool free of network access, keys and cost (principle 5). Revisit only if copy and paste proves to be the bottleneck.
- Linking terms automatically. That would generate connections. Principle 1. Find in paper shows where a word appears; connecting the occurrences is yours.
- Back and Forward in the paper view. Following a link does lose your place. If that becomes a nuisance, Back is the first thing to add.
- A section outline. The paper's own links, find in paper, and split already move you around the paper; an outline would be a second way to do the same thing.
- A fixed number of passes, a fixed reading order, or any required label. Principle 2.
- Free-text labels on connections. Tags only.
- Concept notes shared across boards. A note is a note. Cross-paper arrives with multi-paper, if it arrives.
- Citation graphs, paper discovery, library management, multi-paper canvases.
- Themes, folders. Templates were listed here until D17; a template is now a set of groups with questions (section 6), not a new kind of thing.
- Editing source text.
- Drawing directly on the paper. Later: ink anchored the way a highlight is. The drawing that exists now is a note's sketch (D23), which lives on the board.
- Using the tool from an iPad over Wi-Fi. Later: an opt-in `serve --lan` with a pairing token, and touch toggles for the rectangle drag and for exact selection. Until then the server answers this machine only.
- Predicting what a chunk says before expanding it, and a recall view. Proposed, not decided.
- Jupyter-style runnable cells. Declined.

## 10. Build plan

| Step | Deliverable | Test on a real paper |
|---|---|---|
| 1 | Validate `pymupdf-layout` on three papers, one with heavy math, behind the `extract()` interface. `paperboard extract paper.pdf` writes `source.json` with sections and figures. Python only. | Are the section boundaries right? Are the figures found and paired with their captions? |
| 2 | FastAPI serving source, board, notes, text under a rectangle, clips. | curl. |
| 3 | Paper view with select, highlight, and cut. A cut becomes a chunk, persisted with its anchor; highlights inside it show on it. Board view shows chunks: move, resize, switch between views. | Cut three regions and highlight five spans, close, reopen. Same outlines and marks in the paper, same chunks on the board with the same marks. |
| 4 | Split command, figure clips, groups, collapse and expand. | Split, pile things up, close, reopen. |
| 5 | Tags, connections, notes, question list, export. | Reconstruct one paper's argument. Export it. |
| 6 | Acceptance test. | Below. |
| 7 | The board's text is live: highlight, split here, cut out and join on the board (D20, D21); a note from a line let go on empty board; notes in Markdown with maths (D22); a sketch on a note (D23). Decided after using the board, so it comes after the acceptance test. | Highlight a sentence on a card and find it on the paper. Cut it out, connect a note to it, write a formula and draw a sketch in the note, join the pieces back. |

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

Recorded so the reasoning is not lost. Rows marked D1 to D23 were taken on 23 September 2026: D1 to D14 after the first code review, D15 to D19 after the research in RESEARCH.md section 6, and D20 to D23 by the owner after using the board. D24 to D28 were taken by the owner on 24 September 2026. SPEC-ADDENDUM.md section 12 holds their shapes.

| Question | Decision | Why |
|---|---|---|
| Groups: keep or drop? | Keep, name optional | Readers want piles before links. A pile you cannot name yet is the normal case. |
| Preset tags? | Ship ten, all deletable | Structure that is available, not forced. They encode the reading guides. |
| PyMuPDF licence | Keep PyMuPDF; tool is AGPL-compatible open source | Decided by the tool being open source. |
| Concept notes | Deferred | No visible payoff with one board per paper. Cannot pass the acceptance test. |
| Reference piece | Folded into notes | A reference is a note with a URL in it. |
| Connection labels | Tags only | Two vocabularies for one thing. A sentence about a connection is a note. |
| Where you cut | Paper view only. Superseded by D20 and D21. | One gesture, one anchoring path. The board is where you arrange. |
| First open | Empty board, split on request. Superseded by D15. | The tool must not decide the layout before the reader has read a word. |
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
| Moving around the paper (D10) | The paper's own links are followable | The links belong to the paper, so they add no generated connection. Back, outline and citation peek declined (section 9); citation peek reversed by D24. |
| Tidying the board (D11) | A force layout of connected top-level pieces, on request only, one undo step | The owner's choice, against the grain of section 3; section 6 states the tension and the limits. |
| Connections to marks outside any chunk (D12) | A connection is stored between the two things themselves and drawn on whichever card holds them; connect from the paper; margin chips | Mark first, cut later broke the moment you wanted to connect two marks. Supersedes addendum section 4.0's rule that an edge ends on a highlight through its chunk. |
| Finding a term elsewhere in the paper (D13) | Find in paper, suggesting nothing | Linking terms automatically would generate connections (principle 1). |
| Not understanding a concept (D14) | Ask elsewhere: copy a prompt, paste the answer into a note marked as AI, which never clears a question | Reverses principle 1 as written through the fourth revision, where nothing generated could enter the board at all. The tool still generates nothing; pasted AI text is allowed as a marked note. Only a note you wrote clears a question, so the self-explanation step stays with the reader. |
| First open (D15) | The board opens already split: every section and figure, collapsed, in a tray group named Paper, beside the template's empty slots; one undo step | Reverses the first-open row above. The owner's reason is speed: building your own map of the paper should start at once. What is placed is the paper's own sections and empty, deletable groups, so nothing is generated and nothing is required. |
| Where split runs (D16) | On the server, one route, used by first open and the Split button; it adds only what the board is missing, and the client adds it so it can be undone | The server already builds anchors and blocks, so there is one path, tested with pytest. |
| Templates (D17) | A slot is a group with an optional question; a global template holds the default nine | Reverses section 9's "templates not in v1". No new primitive: a slot is a group. Questions rather than labels, because the reader writing the answer is the gain (RESEARCH.md section 6). Slots and tags stay independent. |
| Notes per section (D18) | The tray keeps a ghost row for each section whose piece has moved out, with its marks and notes counted | The place to find what you wrote about each section, derived at render and never stored. |
| Export by template (D19) | Export can be written in template order as well as paper order | The literature note in the shape of the questions you answered. AI notes stay labelled. |
| Highlighting on the board (D20) | Words selected in a chunk's text become a highlight, the same object the paper view makes, found in the paper by the words selected inside that chunk's region | Reverses section 9's "marking or cutting from the board" and section 5.1's "text in a chunk is read, not selected". The owner's reason: the board is an exact copy of the paper, so you should be able to mark it where you are reading it and connect the mark to a note. Anchoring by the quoted words, on the server, keeps one path: the paper's own quote matcher finds them, and the paper's own line rule paints them. |
| Cutting and joining on the board (D21) | Split here, Cut out, and Join for neighbours in the paper; Group for anything else; each one undo step | Also reverses section 9's "marking or cutting from the board", and the "where you cut" row above. The principle: the paper's order lives inside a chunk, your order lives between chunks. A connection to the chunk itself stays with the piece that begins where it began, rather than being copied to every piece or dropped. |
| Notes in Markdown with maths (D22) | A note is shown rendered: Markdown, with maths typeset by KaTeX; links open in a new tab; raw HTML is never rendered; editing stays plain text and the file is unchanged | CS notes need formulas. Reverses the features plan's deferral of Markdown rendering, and the links-only rendering first proposed for this revision, which never shipped. The four libraries are MIT and bundled, so the tool still needs no network. |
| Sketch notes (D23) | A note may carry one freehand sketch, kept as its strokes for re-editing and as an SVG the server builds; export writes it above the note's text | No new primitive: a sketch belongs to a note, as its text does. The browser sends path data, never markup, and the server builds the image, so nothing it serves was written as SVG by a page. |
| Citation cards (D24) | Hovering or focusing one of the paper's internal links shows, in a small card labelled "In this paper", the words at its destination, trimmed to the first reference entry; Go there follows the link; the paper does not move | Reverses section 9's "citation peek" and D10's decline of it. Principle 1 holds: the card is the paper's own words, read from the page where the link lands, nothing generated. The words are read through the existing `POST /text`, so there is no new route, no network and no new dependency. |
| Where a term is defined (D25) | Find lists the places whose sentence reads like a definition first, badged "likely definition", by simple named rules; the rest in the paper's order | ScholarPhi's question, answered by hand. Principle 1 holds: the rules only reorder and label the paper's own occurrences; nothing is linked or written. Linking terms automatically stays out (section 9). |
| References on board cards (D26) | A chunk's "Figure 2", "Eq. (3)", "Sec. 4.1" and "[12]" are found by named patterns and matched to the paper's own figures, sections, formulas and bibliography; a match is underlined and opens the same card; a paper link landing on a figure, table or formula shows its clip | The owner's words: context on demand, only the essentials. A card's text has no PDF links, so the pointers are found in its words. Principle 1 holds: a match only shows the paper's own figure, words or entry; an unmatched pattern stays plain text rather than guessing. No new route: a formula is found by reading candidate regions through `POST /text`. |
| Definitions in place (D27) | A preset tag `term`; hovering a term shows the reader's own definition first, then the paper's likely one (D25), then Look up elsewhere with a jargon prompt; a Glossary panel lists every term | The owner struggles with jargon. The order puts the reader's own words first, as the notes do everywhere else; the paper's sentence is the D25 ranking, not a new one. Look up elsewhere is D14's Ask elsewhere with another fixed prompt, and its answer stays marked AI and answers nothing. |
| Peek before and after (D28) | "More context" on a chunk card or a mark's popover shows the paper's few lines just before and after, dimmed, until clicked again or Escape | Context without changing the cut: the region, the board and its file are untouched, so a peek costs nothing to undo. The lines are read through `POST /text`, so it is the paper's own text. |
| AI help (D29) | Off by default, per paper (`view.json` `ai`). On: one whole-paper pass (`claude-opus-5-5`, effort high) finds jargon and where each slot is answered; a quick definition (`claude-sonnet-5`, effort low) covers a word it missed. Every claim is a quote the server has found in a span of the paper; the rest is dropped. Saved to `ai.json`, never exported, never a mark until the reader keeps it. Claude is reached with an API key (`ANTHROPIC_API_KEY` or `~/.config/paperboard/anthropic_key`) or, with no key, through your own Claude Code login (`claude -p`) | The owner's brainstorm of 27 September 2026 (docs/superpowers/specs/2026-09-27-simplify-and-ai-design.md, part B). Principle 1 is restated for it: AI may point and explain, visibly, only when turned on. |
| A note from a line | Dragging a new line from a piece or mark and letting go on empty board makes a note there, connected | Writing about a mark was two gestures, a new note and then a line; the act the research measures is the note, so it should cost one. A small change, with no decision number. |
