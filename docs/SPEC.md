# Paper Board: spec and plan

Draft for review. Third revision, 16 September 2026. Grounded in RESEARCH.md and TOOLS.md.

## 1. Purpose

A tool for taking a CS paper apart so its ideas can be laid out, connected, and understood. Like cutting a printed paper into pieces with scissors, spreading them on a desk, and writing on scraps beside them. Except nothing is destroyed, and every piece remembers where it came from.

**The one rule.** If a feature does not help break the paper's ideas apart and lay them out simply, it is not in the tool.

**The second rule, from the research.** Nothing is forced. No reading order, no required pass, no required label. Structure is available when the reader wants it and invisible when they do not. (Shipman and Marshall, RESEARCH.md section 5.)

## 2. What the research says the tool must do

From RESEARCH.md, the effects on understanding that are actually measured come from four acts by the reader. The tool exists to make these four acts easy and to stay out of the way otherwise.

| Act | Evidence | In the tool |
|---|---|---|
| Deciding what connects to what and naming it | concept maps, argument maps | draw a line between any two pieces, label it if you want |
| Explaining in your own words | self-explanation, generative notes | write a note on anything |
| Arranging things in space | Space to Think, spatial hypertext | move anything anywhere; proximity counts |
| Coming back to it | note review | the board is exactly as you left it |

Everything else in the spec is plumbing for these four.

## 3. The four primitives

The whole tool is built from four things. Each does several jobs so that there are only four.

### 3.1 Piece

Anything on the board. Created by the tool or by the reader.

| Comes from | What it is | Source link |
|---|---|---|
| the tool, on open | one piece per section, one per figure or table | yes |
| the reader, by highlighting | an excerpt cut from a section, figure, or another excerpt | yes |
| the reader, by writing | a note, any length, Markdown | no, unless attached |
| the reader, by pasting a title and URL | a reference to another paper | the URL |

Every piece has the same operations: move, resize, collapse or expand, open source, tag, connect, group. There are no piece-specific operations.

A section piece collapsed shows its heading, a line or two, and a count of what has been attached to it. Expanded, it shows the full text and can be highlighted in place, as many times as you like, in as many passes as you like. Figures and equations are rendered clips from the PDF. The PDF itself opens in a side panel from any piece with a source link.

Highlighting is deliberately forgiving: a rough drag across a paragraph excerpts the whole paragraph, and exact selection is there when you want it. Cutting an excerpt never changes the section. Cutting from an excerpt never changes the excerpt. The paper is never edited.

### 3.2 Tag

A word with a colour. Attached to any piece or connection. Filter the board by tag.

Tags are one thing doing the jobs the previous drafts gave to three:

- **Reading role.** `problem`, `claim`, `method`, `evidence`, `assumption` are preset tags because those are the questions every reading guide converges on (RESEARCH.md section 1) and the facets Scim found useful.
- **Pass.** `pass 1`, `pass 2` are preset tags. Add `pass 3`, `pass 7`, or none. A highlight made in the second pass over a section already highlighted in the first is just a highlight with a different tag. Filter to `pass 1` to see what you knew after pass 1.
- **Not yet understood.** `question` is a preset tag. The board lists every `question`-tagged piece that has no note attached. That list is the queue of things to go look up. Attaching a note clears it.

Presets can be renamed, recoloured, or deleted. New tags are one click. No piece needs a tag. Tags are global across all boards, never per paper.

### 3.3 Connection

A line between two pieces, with an optional label. `supports`, `contradicts`, `assumes`, `defines`, or anything typed. Or no label.

A note that belongs to several sections is a note piece with a connection to each. There is no separate "attach to many" feature because connections already do that.

### 3.4 Group

A named rectangle. Anything inside it is together. Move the group, everything moves.

Groups are the cheap way to say "these belong together" without deciding how. They cover: a pile of pieces for one idea, everything gathered in one pass, three sections you want to read as a unit, a note plus the excerpts it explains. Groups can nest.

Proximity without a group also counts. The research says readers use position as meaning long before they can name it. The tool never asks them to.

## 4. Things that are not primitives

**Concept notes.** A note can be promoted to a concept. Concepts live outside any board and are shared. The same concept placed on two boards is the same file. This is the only cross-paper mechanism in v1, and it is a note with a different home, not a new kind of thing.

**Reading goal.** One optional line at the top of the board: why am I reading this. It is a note pinned to the header.

**Summary export.** One command writes the board to a single Markdown file in the paper's own order, with figure clips as images, not placeholders: the goal, then each section with its excerpts and notes, then the concept links and references. Filtered by tag if you want, so "export pass 1" or "export claims and evidence" is the same command. This is the literature note. No separate summary is ever written by hand.

**Initial layout.** On open, sections in the paper's order down the left, figures in a column beside them, all collapsed. That is the uncut paper. Everything after is the reader's, and the tool never rearranges anything.

## 5. Files

```
papers/<paper-id>/
  paper.pdf
  source.json      # sections, figures, anchors. Generated. Never hand-edited.
  board.json       # pieces, positions, sizes, tags, connections, groups, goal
  notes/<id>.md    # one file per note, front matter holds id and anchors
concepts/<id>.md   # shared across boards
```

Re-running extraction rewrites `source.json` only. Excerpts re-anchor by text hash first, bounding box second, and are flagged if neither matches. Notes, tags, connections, groups, and positions are never touched by extraction.

## 6. Architecture

Standalone. Python backend, browser front end, runs locally.

| Job | Component | License |
|---|---|---|
| sections, paragraphs, figures, with PDF coordinates | GROBID via `grobid_client_python` | Apache 2.0 |
| text under a rectangle, rendered clips, page geometry | PyMuPDF (or `pypdfium2` if AGPL matters) | AGPL 3.0 / Apache 2.0 |
| API and file storage | FastAPI over plain files | MIT |
| pieces, connections, groups on a canvas | React Flow | MIT |
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
| 3 | Board: section and figure pieces, initial layout, move, resize, collapse, groups, persistence. | Cut it up, arrange it, close, reopen. Same board. |
| 4 | Highlight in an expanded section or the PDF panel. Excerpt becomes a piece. Tags. | Highlight the abstract in one colour, then again in another. Filter by each. |
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
2. **Preset tags.** Ship with `problem`, `claim`, `method`, `evidence`, `assumption`, `question`, `pass 1`, `pass 2`. Or ship with none and let them grow. Proposed: ship the presets, since they encode the reading guides, but make them deletable.
3. **PyMuPDF licence.** AGPL is fine for an open-source tool. Otherwise `pypdfium2`.
4. **Name.** "Paper Board" is a placeholder.
