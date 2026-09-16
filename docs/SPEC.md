# Paper Board: spec and plan

Draft for review. Fourth revision, 16 September 2026: highlights now live inside chunks. Grounded in RESEARCH.md and TOOLS.md.

## 1. Purpose

A tool for taking a CS paper apart so its ideas can be laid out, connected, and understood. Like cutting a printed paper into pieces with scissors, spreading them on a desk, and writing on scraps beside them. Except nothing is destroyed, and every piece remembers where it came from.

**The one rule.** If a feature does not help break the paper's ideas apart and lay them out simply, it is not in the tool.

**The second rule, from the research.** Nothing is forced. No reading order, no required pass, no required label. Structure is available when the reader wants it and invisible when they do not. (Shipman and Marshall, RESEARCH.md section 5.)

## 2. What the research says the tool must do

From RESEARCH.md, the effects on understanding that are actually measured come from four acts by the reader. The tool exists to make these four acts easy and to stay out of the way otherwise.

| Act | Evidence | In the tool |
|---|---|---|
| Deciding what connects to what and naming it | concept maps, argument maps | draw a line between any two chunks or highlights, label it if you want |
| Explaining in your own words | self-explanation, generative notes | write a note on anything |
| Arranging things in space | Space to Think, spatial hypertext | move anything anywhere; proximity counts |
| Coming back to it | note review | the board is exactly as you left it |

Everything else in the spec is plumbing for these four.

## 3. The four primitives

The whole tool is built from four things on the board, plus highlights inside them. Each does several jobs so that there are only four.

### 3.1 Chunk

A chunk is a piece of the paper big enough to be worth cutting out: a section, a subsection, a figure, or a table. Chunks are the things on the board. There are few of them, typically five to fifteen for a paper, and the reader can see all of them at once.

| Chunk | Comes from | Source link |
|---|---|---|
| section or subsection | the tool, on open, one per top-level section; the reader can split a chunk at any subsection or paragraph, or merge two neighbours | yes |
| figure or table, with its caption | the tool, on open | yes |
| note | the reader, any length, Markdown | no, unless connected |
| reference to another paper | the reader, a title and URL | the URL |

Every chunk has the same operations: move, resize, collapse or expand, open source, tag, connect, group. There are no chunk-specific operations.

Collapsed, a chunk shows its heading, the paper's own first line or two, and a count of what is inside it. Expanded, it shows the full text, and that text can be highlighted in place. Figures and equations are rendered clips from the PDF. The PDF itself opens in a side panel from any chunk with a source link.

Splitting and merging chunks is how the reader chooses the grain. The tool starts at section level because that is what every reading guide works in. A reader who wants "Method 3.2" on its own splits it off. A reader who wants the whole related-work section as one thing leaves it. The paper itself is never edited.

### 3.1a Highlight

A highlight is a mark inside a chunk. It is not on the board by itself. It is where most of the reader's work happens, and there can be many of them without the board getting crowded, because they live inside the chunk they belong to.

A highlight can carry everything a chunk can: a tag, a note, a connection to another highlight or chunk. A connection drawn from a highlight in one expanded chunk to a highlight in another shows as a line between the two chunks on the board, with the exact spots shown when either chunk is expanded. So "this sentence in the abstract is supported by this row in Table 2" is one line, and it lands on the two chunks, not on two new scraps.

Highlighting is forgiving: a rough drag across a paragraph highlights the paragraph, and exact selection is there when you want it. A highlight can be made in any pass over text that is already highlighted, with a different tag if you like.

Only when the reader wants a highlight to stand on its own, next to something far away on the board, do they pull it out. Pulling out makes a small chunk with the same source link, and leaves the highlight in place in its parent. This is rare by design. The board holds ideas the size of a section; the highlights hold the detail.

### 3.2 Tag

A word with a colour. Attached to any chunk, highlight, or connection. Filter the board by tag.

Tags are one thing doing the jobs the previous drafts gave to three:

- **Reading role.** `problem`, `claim`, `method`, `evidence`, `assumption` are preset tags because those are the questions every reading guide converges on (RESEARCH.md section 1) and the facets Scim found useful.
- **Pass.** `pass 1`, `pass 2` are preset tags. Add `pass 3`, `pass 7`, or none. A highlight made in the second pass over a section already highlighted in the first is just a highlight with a different tag. Filter to `pass 1` to see what you knew after pass 1.
- **Not yet understood.** `question` is a preset tag. The board lists every `question`-tagged highlight or chunk that has no note attached. That list is the queue of things to go look up. Attaching a note clears it.

Presets can be renamed, recoloured, or deleted. New tags are one click. Nothing needs a tag. Tags are global across all boards, never per paper.

### 3.3 Connection

A line between two chunks, two highlights, or a highlight and a chunk, with an optional label. `supports`, `contradicts`, `assumes`, `defines`, or anything typed. Or no label.

A note that belongs to several sections is a note chunk with a connection to each. There is no separate "attach to many" feature because connections already do that.

### 3.4 Group

A named rectangle around chunks. Anything inside it is together. Move the group, everything moves.

Groups are the cheap way to say "these belong together" without deciding how. They cover: a pile of chunks for one idea, everything gathered in one pass, three sections you want to read as a unit, a note plus the excerpts it explains. Groups can nest.

Proximity without a group also counts. The research says readers use position as meaning long before they can name it. The tool never asks them to.

## 4. Things that are not primitives

**Concept notes.** A note can be promoted to a concept. Concepts live outside any board and are shared. The same concept placed on two boards is the same file. This is the only cross-paper mechanism in v1, and it is a note with a different home, not a new kind of thing.

**Reading goal.** One optional line at the top of the board: why am I reading this. It is a note pinned to the header.

**Summary export.** One command writes the board to a single Markdown file in the paper's own order, with figure clips as images, not placeholders: the goal, then each section with its excerpts and notes, then the concept links and references. Filtered by tag if you want, so "export pass 1" or "export claims and evidence" is the same command. This is the literature note. No separate summary is ever written by hand.

**Initial layout.** On open, one chunk per top-level section in the paper's order down the left, figure chunks in a column beside them, all collapsed. That is the uncut paper. Everything after is the reader's, and the tool never rearranges anything.

## 5. Files

```
papers/<paper-id>/
  paper.pdf
  source.json      # sections, figures, anchors. Generated. Never hand-edited.
  board.json       # chunks with their split points, positions, sizes, highlights, tags, connections, groups, goal
  notes/<id>.md    # one file per note, front matter holds id and anchors
concepts/<id>.md   # shared across boards
```

Re-running extraction rewrites `source.json` only. Highlights re-anchor by text hash first, bounding box second, and are flagged if neither matches. Notes, tags, connections, groups, and positions are never touched by extraction.

## 6. Architecture

Standalone. Python backend, browser front end, runs locally.

| Job | Component | License |
|---|---|---|
| sections, paragraphs, figures, with PDF coordinates | GROBID via `grobid_client_python` | Apache 2.0 |
| text under a rectangle, rendered clips, page geometry | PyMuPDF (or `pypdfium2` if AGPL matters) | AGPL 3.0 / Apache 2.0 |
| API and file storage | FastAPI over plain files | MIT |
| chunks, connections, groups on a canvas | React Flow | MIT |
| PDF side panel with text selection | `react-pdf-highlighter` or PDF.js | MIT / Apache 2.0 |

API: get source, get and put board, get and put note, get clip for a page and rectangle, list open questions, export.

## 7. Not in v1

- Any generated text: summaries, explanations, suggested tags, suggested connections. The research says the reader doing this work is where the effect comes from.
- A fixed number of passes, a fixed reading order, or any required label.
- Citation graphs, paper discovery, library management, multi-paper canvases.
- Templates, themes, folders.
- Editing source text.

## 8. Build plan

| Step | Deliverable | Test on a real paper |
|---|---|---|
| 1 | `paperboard extract paper.pdf` writes `source.json` with sections and figures. Python only. | Three papers, one with heavy math. Are the boundaries right? Are the figures found? |
| 2 | FastAPI serving source, board, notes, clips. | curl. |
| 3 | Board: section and figure chunks, split and merge, initial layout, move, resize, collapse, groups, persistence. | Cut it up, arrange it, close, reopen. Same board. |
| 4 | Highlight inside an expanded chunk or the PDF panel. Tags. Connections between highlights. Pull-out. | Highlight the abstract in one colour, then again in another. Filter by each. |
| 5 | Notes, connections, concept promotion, question queue, export. | Reconstruct one paper's argument. Export it. |
| 6 | Acceptance test. | Below. |

Step 1 carries the risk and none of the UI. It starts first.

## 9. Acceptance test

Take a paper you need to read. Using only the board:

1. Say what problem it solves, what it claims, how it works, and what the evidence is.
2. Show one thing you did not understand, and the note that resolved it.
3. Show one connection you drew that the paper does not state.
4. Filter to your first-pass tag. Does it match what you knew after ten minutes?
5. Close, reopen. Everything is where it was.

If any step fails, the tool is not done.

## 10. Open for review

1. **Four primitives, or three?** Groups could be dropped if connections plus proximity are enough. The research says people want piles before they want links, so groups stay for now.
5. **Default grain.** Top-level sections on open, split by hand. Or subsections on open for long papers. Proposed: top level always, since a board of thirty chunks is the clutter we are avoiding.
2. **Preset tags.** Ship with `problem`, `claim`, `method`, `evidence`, `assumption`, `question`, `pass 1`, `pass 2`. Or ship with none and let them grow. Proposed: ship the presets, since they encode the reading guides, but make them deletable.
3. **PyMuPDF licence.** AGPL is fine for an open-source tool. Otherwise `pypdfium2`.
4. **Name.** "Paper Board" is a placeholder.
