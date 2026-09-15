# Paper Board: spec and plan

Draft for review. 15 September 2026.

## 1. Purpose

A tool for breaking a CS paper apart so its reasoning can be laid out and understood: what problem the authors are solving, what they claim, how the method works, and how they show it holds. The reader cuts the paper into pieces, lays them out, writes what they understand next to each piece, and draws the connections between them.

The paper stays whole underneath. Every piece links back to where it came from.

**Rule for every feature:** if it does not help break the paper's concepts apart and lay them out simply, it is not in the tool.

## 2. Principles

1. **No reading method is built in.** The board starts as the paper in its own order. Reading linearly means leaving it alone. Reading abstract first, method last, means moving things. Same tool, no modes.
2. **Cutting never destroys.** Pulling a highlight out of a section leaves the section intact. Every piece reopens its source.
3. **One kind of thing on the board.** Sections, highlights, notes, and reference cards are all pieces with the same operations. No special cases.
4. **Plain files.** A paper's board is a folder of JSON and Markdown that can be read, grepped, and versioned without the app.
5. **Borrow, don't build.** Sectioning, PDF handling, and the canvas are existing libraries. We write the data model, the glue, and the small set of interactions.
6. **The reader's understanding is never generated.** No AI in v1. If added later, it writes separate notes with citations and never replaces source text.

## 3. What a paper is

A paper is an argument written so a stranger can check it. Sections are the author's filing system for the parts of that argument. Section names vary; the questions do not.

| Reader's question | Where the answer usually lives | What gets extracted |
|---|---|---|
| Why does this matter? What is wrong now? | Abstract, Introduction, Related Work | problem, gap, motivation |
| What is being claimed? | Abstract, contributions list, Conclusion | claims |
| How does it work? | Method, Model, Algorithm, Theory, Background | assumptions, definitions, steps |
| How do we know it holds? | Experiments, Results, Proofs, Ablations | setup, baselines, hyperparameters, what the evidence shows |
| What is the catch? | Discussion, Limitations, Future Work | open problems, failure cases |

The tool does not impose this table. It keeps the author's real headings. The table informs the small set of roles a highlight can carry (section 4.3).

## 4. The model

### 4.1 Board

One board per paper. A board is a folder:

```
papers/<paper-id>/
  paper.pdf
  source.json      # sections and anchors, generated, never hand-edited
  board.json       # pieces, positions, sizes, collapsed state, edges
  notes/
    <note-id>.md   # one file per note, YAML front matter for id and anchor
concepts/
  <concept-id>.md  # global, shared across all boards
```

### 4.2 Pieces

Everything on the board is a piece. Four kinds:

| Kind | Where it comes from | Anchor |
|---|---|---|
| **section** | created by the tool when the paper is opened | section id in source.json |
| **highlight** | cut by the reader from a section or the PDF | section id, page, bounding box, text hash |
| **note** | written by the reader | optional: any piece, or a concept |
| **reference** | another paper, as a title and URL only | none |

All pieces support the same operations: move, resize, collapse or expand, open source, attach note, connect.

A section piece collapsed shows its heading, its first two lines, and a count of notes and highlights. Expanded, it shows the full extracted text, readable and highlightable in place. Figures and equations inside a section are shown as rendered clips from the PDF, since text extraction is unreliable for them.

### 4.3 Highlight roles

A highlight carries one role from a fixed list. The role says what part the fragment plays in the argument.

`claim` · `evidence` · `assumption` · `definition` · `setup` · `question`

`question` is the "I don't understand this" flag. Start with these six. After two real papers, delete any role that went unused.

### 4.4 Question queue

Every highlight with role `question` is open until it has a note attached. The board has one tray listing all open questions for the paper. Resolving one means writing what you found out. This lets the reader leave a confusing term, keep going, and come back.

### 4.5 Connections

An edge between any two pieces, with an optional short label. Typical labels: "supports", "assumes", "contradicts", "defines". Labels are free text, not a fixed list.

### 4.6 Concept notes

A note can be promoted to a concept. Concepts live outside any board and are shared. Placing the concept "attention" on paper A and paper B references the same file. This is the only cross-paper mechanism in v1.

### 4.7 Initial layout

Sections are laid out in the paper's own order, top to bottom, all collapsed. That is the un-cut paper. Everything after is the reader's.

## 5. Architecture

Standalone. Python backend, browser front end, runs locally.

| Job | Component | License |
|---|---|---|
| Section and paragraph detection with PDF coordinates | GROBID (Docker) via `grobid_client_python` | Apache 2.0 |
| Text under a rectangle, rendering figure and equation clips, page geometry | PyMuPDF | AGPL 3.0 (see open questions) |
| API and file storage | FastAPI, plain files | MIT |
| Movable cards and edges | React Flow | MIT |
| PDF panel with highlight selection | `react-pdf-highlighter` or PDF.js directly | MIT / Apache 2.0 |

Data flow:

1. `paper.pdf` in. GROBID produces TEI. A Python module turns TEI into `source.json`: ordered sections, each with heading, paragraphs, and per-paragraph page and bounding boxes.
2. Opening a board with no `board.json` creates one section piece per section in initial layout.
3. The front end reads and writes `board.json` and `notes/` through the API. `source.json` is read only.
4. Re-running extraction rewrites `source.json` only. Highlights re-resolve by text hash first, bounding box second, and are flagged if neither matches.

The API is small: get paper, get source, get and put board, get and put note, get clip image for a page and rectangle, list open questions.

## 6. Not in v1

Cut by the rule in section 1:

- AI summaries, explanations, or role labelling
- Citation graphs, paper discovery, library management
- Multi-paper canvases
- Tags, folders, themes, templates, reading-order guides
- Editing source text
- A second PDF reader drawn on the canvas beyond the expanded section text

## 7. Build plan

Each step produces something that can be tested on a real paper before the next begins.

| Step | Deliverable | Test |
|---|---|---|
| 1 | `paperboard extract paper.pdf` writes `source.json`. Python only, no UI. | Run on three real papers, one with heavy math. Inspect section boundaries by hand. Decide whether GROBID is good enough or needs a fallback heading heuristic on PyMuPDF text. |
| 2 | FastAPI serving source, board, notes, and clip images. | curl the endpoints. |
| 3 | React Flow board with collapsed and expanded section pieces, initial layout, drag, resize, persistence. | Open, move things, close, reopen. Same board. |
| 4 | Highlight in an expanded section or the PDF panel, with role. Highlight becomes a piece. | Cut a claim from the abstract and a result from the experiments, put them side by side. |
| 5 | Notes, concept promotion, connections, question tray. | Reconstruct one paper's argument on the board. |
| 6 | Reading test (section 8). | Pass or revise. |

Step 1 carries most of the risk and none of the UI. It starts first.

## 8. Acceptance test

Take one paper you actually need to read. Using only the board, answer:

1. What problem are they solving and why does it matter?
2. What exactly do they claim?
3. How does the method work, and what does it assume?
4. What evidence supports the claim, and what does it actually establish?
5. What is one open question you had, and how did you resolve it?

Then close the app, reopen, and check that every piece, note, edge, and source link is intact. If any question cannot be answered from the board, or anything is lost on reopen, the tool is not done.

## 9. Open questions for review

1. **PyMuPDF is AGPL.** Fine for a personal or open-source tool. If that matters, `pypdfium2` (Apache/BSD) covers rendering and text under a rectangle.
2. **Reading in the card or in the PDF panel.** The spec assumes expanded sections are readable enough that the PDF panel is mostly for figures. If extracted text is too rough, the PDF panel becomes the primary reading surface and cards stay small. Step 3 will tell.
3. **Six roles or three.** `claim`, `evidence`, `question` may be enough, with `assumption`, `definition`, `setup` folded into notes. Starting with six and pruning.
4. **Section granularity.** Top-level sections only, or subsections as their own pieces? Proposed: top level by default, with "split at subsection" as an action on a section piece.
5. **Name.** "Paper Board" is a placeholder.
