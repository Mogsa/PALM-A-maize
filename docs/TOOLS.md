# Tool review: what to take, what to avoid

16 September 2026. Companion to SPEC.md and RESEARCH.md. Each tool is judged on one question: what is the single most effective thing in it, and what does it get wrong that we must not copy.

## 1. Tools that take a paper apart visually

### LiquidText
- **Good.** The excerpt with a line back to its source is the interaction this whole project is built on. Tap the excerpt, the document scrolls to where it came from. Pinch to collapse pages you are not reading so two distant passages sit side by side.
- **Bad.** Reviewers consistently report the workspace becomes cluttered as excerpts pile up. Export is weak: sections come out of order and images become placeholders. Tags are per project, so you recreate them every time. Proprietary, subscription, iPad-first.
- **Take.** Excerpt-to-source link. Collapse what you are not reading. **Avoid.** Unbounded workspaces with no way to pile things. Export as an afterthought. Per-board tags.

### MarginNote 4
- **Good.** One excerpt is simultaneously a highlight in the PDF, a node in the map, and a flashcard. One capture, three uses. This is the multi-purpose principle done right.
- **Bad.** Every review says the same thing: steep learning curve, overwhelming feature count, hard-to-follow documentation. The map is a mind map with a single root, which fits a paper badly. Manual backup of documents.
- **Take.** One capture serving several views. **Avoid.** Feature count. Modes. A single-root map.

### Heptabase
- **Good.** PDF highlights automatically become cards. A card has one identity and can sit on many whiteboards, so the same concept on two boards is the same card. Polished and stable.
- **Bad.** Boards with hundreds of cards lag badly and users report losing the overview. No free tier and the lifetime licence was withdrawn. Reviewers say it takes time to find a workflow, which means the tool does not suggest one.
- **Take.** Card identity across boards. Highlight becomes card with no extra step. **Avoid.** Boards that grow without limit. One board per paper keeps ours small by construction.

### Noteey
- **Good.** Highlight anything and it becomes a canvas object with a link back. Local-first, works offline without an account, boards are files you can copy. Arrows can point at a spot, not only at an object. Boards nest.
- **Bad.** Younger and less polished. Feature surface is growing toward Heptabase's, including drawing, video, and audio annotation, which is the wrong direction for us.
- **Take.** Local files, no account. Highlight-to-object as one gesture. **Avoid.** Media breadth.

## 2. Tools that explain content

### TreeReader
- **Good.** The paper as a tree of sections, subsections, paragraphs, figures, and tables. Collapsed nodes show a little, expanded nodes show everything. Every summary can be checked against the source text one click away.
- **Bad.** The collapsed view is a language-model summary, so the first thing you read is an interpretation. The evaluation is five participants with self-reported gains.
- **Take.** Collapsed shows little, expanded shows all. Source always one click away. **Avoid.** Generated text as the default view. Collapsed cards in our tool show the paper's own first lines.

### SciSpace, Explainpaper, NotebookLM
- **Good.** Select a passage and get an explanation in place, then ask follow-ups. Useful when stuck on one dense step.
- **Bad.** An explanation is an interpretation, and accuracy varies by tool and by passage. More important for us: the research in RESEARCH.md section 5 shows the gain in understanding comes from the reader producing the explanation. A tool that produces it removes the gain. NotebookLM's mind map has the single-root problem again.
- **Take.** Nothing for v1. Later, an optional "ask" that writes a separate note, clearly marked as generated, next to the reader's own. Never in place of the source.

### ScholarPhi
- **Good.** Definitions of terms and symbols where you meet them, drawn from the paper itself. Well evaluated.
- **Bad.** Requires symbol and definition extraction that is its own research project.
- **Take.** For v1, tagging a symbol `question` and resolving it with a concept note covers the need by hand. Definition peek is a later feature.

## 3. Research prototypes

### GatherReader
- **Good.** The "Pocket": a floating tray where you drop things during reading and decide what to do with them later. Two design rules behind it: relaxed precision (a rough selection is fine) and deferred action (collect now, organise after). The measured benefit is lower cost for side tasks so reading is not interrupted.
- **Bad.** Pen-and-touch tablet prototype, never a product.
- **Take.** Both rules. A highlight does not need to be exact to become an excerpt. The `question` tag with the open-questions list is the Pocket: drop it, keep reading, come back.

### LMCanvas
- **Good.** Drag a selection out of text into its own block, join blocks, connect them. The scissors gesture, demonstrated.
- **Bad.** A writing-interface workshop paper, built around language-model operations on the blocks.
- **Take.** The gesture only.

### Garden of Papers
- **Good.** Spatial memory works for organising many papers; two user studies.
- **Bad.** It is a literature-review tool, one node per paper. Wrong grain for reading one paper.
- **Take.** Confirms spatial layout. Cross-paper is a later stage.

### AuraScholar
- **Good.** Open source, and its canvas already has excerpt nodes, idea notes, groups, and a split PDF reader with source anchors. Worth reading the excerpt-anchoring code before writing ours.
- **Bad.** Alpha with breaking changes expected, Chinese-first, AGPL, and its centre of gravity is AI synthesis over several papers. Forking it means carrying all of that.
- **Take.** As a reference implementation for excerpt anchoring and canvas groups, not as a base.

## 4. The most effective part of each, in one table

| From | The one thing | Where it lives in our four primitives |
|---|---|---|
| LiquidText | excerpt with a line back to source | piece, source link |
| LiquidText | collapse what you are not reading | piece, collapse |
| MarginNote | one capture, many uses | piece: an excerpt is a highlight in the PDF, a card on the board, and a line in the export |
| Heptabase | card identity across boards | concept note |
| Heptabase | highlight becomes card, no extra step | piece, from highlight |
| Noteey | local files, no account, offline | files section of the spec |
| TreeReader | collapsed shows the paper's own first lines, expanded shows all | piece, collapse and expand |
| TreeReader | source one click away, always | piece, open source |
| GatherReader | rough selection is enough | highlight precision |
| GatherReader | collect now, decide later | `question` tag and its list |
| LMCanvas | drag text out into a block | excerpt gesture |
| Garden of Papers | position is memory | free placement, groups |
| AuraScholar | excerpt anchoring code | reference for step 1 and step 4 |

## 5. The failures to design against

| Failure | Seen in | Our rule |
|---|---|---|
| Workspace clutter | LiquidText, Heptabase | one board per paper; groups; collapse |
| Feature overload and modes | MarginNote | four primitives, one set of operations |
| Export as afterthought, out of order | LiquidText | export is in the build plan and follows the paper's order |
| Tags per project | LiquidText | tags are global |
| Generated text as the default view | TreeReader, NotebookLM | the paper's own words first; nothing generated in v1 |
| Explanation done for the reader | SciSpace, Explainpaper | the reader writes the note |
| Single-root maps | MarginNote, NotebookLM | free graph; a paper has many centres |
| Subscription, account, cloud | Heptabase, LiquidText | plain local files |
| "Takes time to find a workflow" | Heptabase | the initial layout is the uncut paper; the first gesture is highlight |

## 6. What this changes in the spec

Three small things. Everything else was already there.

1. **Tags are global**, not per board. (LiquidText.)
2. **Export follows the paper's order** and includes rendered figure clips, not placeholders. (LiquidText.)
3. **Highlights are deliberately imprecise.** A rough drag over a paragraph produces an excerpt of the whole paragraph. Exact selection is available but not needed. (GatherReader.)

And one confirmation: the four-primitive design is the multi-purpose principle MarginNote gets right, with the feature count MarginNote gets wrong removed.

## Sources
- LiquidText: [features](https://www.liquidtext.net/liquidtextadeeperdive), [Capterra reviews](https://www.capterra.com/p/264823/Liquid-Text/reviews/), [Paperless X review](https://beingpaperless.com/liquidtext/)
- MarginNote 4: [manual](https://manual.marginnote.com.cn/mn4/en/), [Paperlike comparison](https://paperlike.com/blogs/paperlikers-insights/liquidtext-vs-marginnote), [Bristol study-skills account](https://studyskills.blogs.bristol.ac.uk/2023/12/14/my-journey-with-margin-note-mind-maps/)
- Heptabase: [elements](https://wiki.heptabase.com/fundamental-elements), [MakerStack review](https://makerstack.co/reviews/heptabase-review/), [Product Hunt reviews](https://www.producthunt.com/products/heptabase/reviews)
- Noteey: [PDF highlight docs](https://wiki.noteey.com/element/Highlight/pdf%20highlight/), [Noteey vs Heptabase](https://productivematters.substack.com/p/noteey-vs-heptabase-why-choose-one)
- TreeReader: [paper](https://arxiv.org/html/2507.18945v1)
- SciSpace: [chat with PDF](https://scispace.com/chat-pdf); Explainpaper: [site](https://www.explainpaper.com/); NotebookLM: [mind maps](https://support.google.com/gemininotebook/answer/16212283?hl=en)
- ScholarPhi: [code](https://github.com/allenai/scholarphi)
- GatherReader: [Microsoft Research](https://www.microsoft.com/en-us/research/publication/informal-information-gathering-techniques-active-reading/), [PDF](https://www3.cs.stonybrook.edu/~xiaojun/pdf/ereader.pdf)
- LMCanvas: [workshop paper](https://kixlab.github.io/website-files/2023/chi2023-workshop-lmcanvas-paper.pdf)
- Garden of Papers: [paper](https://sketch.kaist.ac.kr/pdf/publications/2025_uist_garden_of_papers.pdf)
- AuraScholar: [repository](https://github.com/microbluey/AuraScholar)
