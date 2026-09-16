# How people read papers, and what the tool should take from it

Research note, 16 September 2026. Companion to SPEC.md.

Method: the Georgia Tech OMSCS guide you linked, the standard "how to read a paper" guides used in CS courses, one survey study of reading strategies, the note-taking systems researchers actually use, and the recent HCI reading tools. Several pages were only reachable as search excerpts from this environment, so quotes are paraphrased where noted.

## 1. Is there a consensus on how to read a paper?

Yes, and it is unusually strong. Every guide surveyed says the same four things in different words.

1. **Do not read front to back.** The Georgia Tech guide calls linear reading "the far right side of the curve of diminishing returns." Keshav, Ng, Pacheco-Vega, and the PLOS "Ten simple rules" all open with this.
2. **Read in passes, coarse to fine.** Each pass has a purpose and a stopping decision: is this worth another pass?
3. **The first pass is the summary sections plus the figures.** Abstract, introduction, conclusion, section headings, and figures. The order of those varies by guide; the set does not.
4. **You are done when you can answer a fixed set of questions**, not when you reach the last page.

### The pass structures side by side

| Guide | Pass 1 | Pass 2 | Pass 3 (and 4) |
|---|---|---|---|
| **Keshav, three-pass** (the most cited in CS courses) | 5 to 10 min. Title, abstract, intro, headings, conclusion, references. Answer the five Cs: category, context, correctness, contributions, clarity. Decide whether to continue. | About an hour. Read with care, skip proofs. Study figures, diagrams, graphs, error bars. Mark unread references worth following. Should be able to summarize the main thrust with evidence to someone else. | Several hours. Virtually re-implement the paper. Challenge every assumption. Identify hidden assumptions, missing citations, weak points. Only for papers you review or build on. |
| **Andrew Ng, CS230** | Title, abstract, figures. In ML the architecture figure often *is* the method. | Intro, conclusion, all figures again, skim the rest. Intro and conclusion are the authors' clearest summary because they were written to persuade reviewers. | Whole paper, skip the math. Then everything, without getting stuck. |
| **Georgia Tech OMSCS 6460** | Abstract. | Conclusion, because it restates the findings and usually carries the limitations. | Figures and graphs alongside results and discussion. Then solution and methodology only if you need them. |
| **Pacheco-Vega, AIC** | Abstract, introduction, conclusion, in that order. Highlight and annotate. | Decide whether a full read is warranted; if so, know what to look for. | Drop the extracted notes into a spreadsheet row per paper ("conceptual synthesis Excel dump") so they stay searchable across papers. |
| **PLOS Ten simple rules** | Rule 1: pick your own reading goal first. Rule 2: work out the author's goal. | Answer six questions (below). | Read critically and creatively, then discuss. |

The pass idea is stable across every source. What varies is only which summary section is read first. A tool should therefore support passes as a first-class idea but must not fix the order of sections inside a pass.

### The questions every guide converges on

Collected from Keshav, Griswold's "How to read an engineering research paper," Ng's four questions, the PLOS six questions, and Mitzenmacher and Ramsey. Deduplicated:

| Question | Who asks it |
|---|---|
| What problem is being solved, and why does it matter? | Griswold "motivation", PLOS "what do the authors want to know", Keshav "context" |
| What do the authors claim to contribute? | Keshav "contributions", Ng "what did they try to accomplish", Griswold "proposed solution" |
| How does the method work? What are its key elements? | Ng "key elements", Griswold "solution", PLOS "what did they do" |
| Why was it done this way rather than another? | PLOS "why that way", Keshav "context" |
| What evidence is given, and does it support the claim? | Griswold "evaluation", Keshav "correctness", PLOS "what do the results show" |
| What do the authors themselves conclude, and what do I conclude? | PLOS "interpretation", Mitzenmacher critical reading |
| What are the assumptions, limitations, and open questions? | Keshav pass 3, Georgia Tech "conclusion carries limitations" |
| What can I use, and what references should I follow next? | Ng questions 3 and 4, Keshav pass 2 |
| What are the good ideas here, and where else could they apply? | Mitzenmacher "read creatively" |

Griswold's version of the stopping rule is the cleanest: you are not done reading until you can answer all the questions.

### A finding about who struggles with which section

Hubbard and Dunbar (PLOS ONE, 2017) surveyed 260 readers from undergraduates to faculty. Inexperienced readers found the **methods and results sections the hardest** and **undervalued the results section** relative to senior researchers. Skill at reading results develops slowly over a career. This is why the guides push figures into the first pass: the figures are the results, and forcing them early counteracts the tendency to skip them.

## 2. How people take notes on papers

Three families, and they compose.

**Per-paper templates.** A fixed set of headings answered once per paper. Examples: the widely copied GitHub markdown template (quick look, what, why, how, assumptions, results, limitations, confusing parts, my conclusion, relation to own work), the Rice CAAM template, and the PaperFlow reading report (one-sentence summary, background, method, results, contributions, limitations, relation to my research, PDF evidence anchors). The headings are the consensus questions from section 1 again.

**Zettelkasten-style layered notes.** Fleeting notes while reading, a literature note that summarizes the source in your own words, permanent notes that each hold one idea and link to others. The literature note is per paper. The permanent notes are the concepts that outlive any one paper. This split is exactly the board-versus-concept-note split already in the spec.

**Cross-paper tables.** Pacheco-Vega's spreadsheet with one row per paper and one column per question, so a literature review is a filter over rows. Cheap and durable.

What they share: the note answers questions, it is written in the reader's own words, and every point should point back to where in the source it came from.

## 3. What recent reading tools have learned

| Tool | What it does | Evidence | What to take |
|---|---|---|---|
| **Scim** (Allen AI, 2023) | Automatically highlights passages by rhetorical role: objective, novelty, method, result. Density is adjustable. Built for multi-pass skimming. | 31 participants across two studies. Helped high-level understanding and drew attention to details readers would have skipped. Readers wanted highlights spread across the paper, not clumped, and a solid background highlight over underlines. | The role vocabulary. Objective, novelty, method, result maps almost exactly onto the consensus questions. Our highlight roles should match. |
| **ScholarPhi** (CHI 2021) | Definitions of terms and symbols shown in place where they are used. | Usability study across experience levels. | Definitions are a concept-note problem, not a board problem. Peek in place, promote to a concept note when it matters. |
| **Semantic Reader** (Allen AI) | The umbrella project for Scim, ScholarPhi, and CiteSee, deployed to real users. | Large-scale deployment. | The pattern: augment the PDF, never replace it. |
| **Garden of Papers** (UIST 2025) | Canvas of paper nodes and citation links, read and annotate from the canvas. | Two user studies, nine usage patterns. Spatial placement and annotation helped people keep track of a review. | Spatial memory is real and useful. It is a cross-paper tool, so a later stage for us. |
| **Open Paper** (khoj-ai) | Open source reading workbench: upload, highlight, annotate, AI assistant with citations. | Product, no study. | An open-source reference for highlight and annotation plumbing in a Python and web stack. Not a canvas. |
| **LiquidText** | Excerpts pulled onto a workspace with lines back to the source. | Product. | The pull-out interaction. |

## 4. What this changes in the spec

The spec already matches the consensus in its core: cut the paper into pieces, keep source links, lay out and connect, reader's own words. Five things were missing or under-weighted.

1. **Passes as a first-class idea.** Every guide uses them and you asked for a place to write "what I understood in the first pass." The design: the board has a *current pass* (1, 2, 3). Every piece, highlight, and note is stamped with the pass in which it was made. Each pass has one note with a checklist of the consensus questions for that pass. Switching passes never moves anything; it changes the stamp on new things and lets you filter the board to a pass. This gives "what did I get in pass 1" without a second data structure.
2. **Figures are pieces from the start.** Ng, Georgia Tech, and Hubbard and Dunbar all say figures carry the results and readers skip them. GROBID extracts figures with captions and coordinates, so the initial board should contain figure pieces beside section pieces, not hide them inside sections.
3. **Highlight roles aligned with Scim and the question list.** Replace the six roles in the spec with: `problem`, `claim`, `method`, `evidence`, `assumption`, `question`. `definition` is dropped because a definition is a concept note. `setup` is folded into `method` or `evidence` depending on what it describes.
4. **A reading goal on the board.** PLOS rule 1. One line at the top: why am I reading this. Cheap and it shapes every decision after.
5. **The per-paper summary is generated from the board, not written separately.** The pass notes plus the pieces tagged `claim`, `evidence`, and `assumption` are the literature note. Export it as one Markdown file in the template shape from section 2. Concept notes are the permanent notes. That ties the board to the two note systems people already use without adding a feature.

Things considered and rejected for v1:

- **Automatic role labelling à la Scim.** Real value, but it is AI and it is exactly the step where the reader does the understanding. Later, as a suggestion the reader confirms.
- **Cross-paper table à la Pacheco-Vega.** Easy to derive later from exported summaries. Not a board feature.
- **A fixed order inside a pass.** The guides disagree on it, and you asked for order to stay free.

## Sources

Reading guides
- Georgia Tech OMSCS 6460, [How To: Read an Academic Paper](https://omscs6460.gatech.edu/research-guide/how-to-read-an-academic-paper/)
- S. Keshav, How to Read a Paper, three-pass method. Mirror: [Missouri copy](https://dslsrv1.rnet.missouri.edu/resources/HowToReadAPaper.pdf), summary at [HKU Researcher Connect](https://blog-sc.hku.hk/reading-papers-efficiently-with-the-three-pass-approach/)
- Andrew Ng, CS230 lecture on reading papers. Summaries: [BioErrorLog](https://en.bioerrorlog.work/entry/reading-research-papers-andrew-ng), [KDnuggets](https://www.kdnuggets.com/2019/09/advice-building-machine-learning-career-research-papers-andrew-ng.html)
- W. Griswold, [How to Read an Engineering Research Paper](https://cseweb.ucsd.edu/~wgg/CSE210/howtoread.html)
- R. Pacheco-Vega, [AIC method](https://www.raulpacheco.org/2017/01/finding-the-most-relevant-information-in-a-paper-when-reading-a-three-step-method/) and [AIC plus conceptual synthesis Excel dump](https://www.raulpacheco.org/2017/12/carving-time-to-read-the-aic-and-conceptual-synthesis-excel-dump-combination-method/)
- Carey et al., [Ten simple rules for reading a scientific paper](https://journals.plos.org/ploscompbiol/article?id=10.1371%2Fjournal.pcbi.1008032), PLOS Computational Biology 2020
- M. Mitzenmacher and N. Ramsey, [How to read a research paper](https://www.cs.tufts.edu/comp/150PLD/ReadingPapers.pdf)
- M. Hanson, [Efficient reading of papers](https://www.cs.columbia.edu/~hgs/netbib/efficientReading.pdf)

Studies
- Hubbard and Dunbar, [Perceptions of scientific research literature and strategies for reading papers depend on academic career stage](https://journals.plos.org/plosone/article?id=10.1371%2Fjournal.pone.0189753), PLOS ONE 2017

Note-taking
- [Research-Paper-Reading-Template](https://github.com/KaleabTessera/Research-Paper-Reading-Template) (markdown)
- Rice CAAM 600, [Template for taking notes on research articles](https://www.cmor-faculty.rice.edu/~symes/CAAM600/TakingNotes.pdf)
- [From literature notes to permanent notes in Obsidian](https://martinezponciano.es/2021/04/05/from-literature-notes-to-permanent-notes-obsidian/)

Tools
- Fok et al., [Scim: Intelligent Skimming Support for Scientific Papers](https://dl.acm.org/doi/fullHtml/10.1145/3581641.3584034), IUI 2023; [Ai2 design case study](https://blog.allenai.org/case-study-iterative-design-for-skimming-support-5563dbe0899e)
- Head et al., [ScholarPhi](https://scholarphi.org/assets/pdf/scholarphi-chi-2021.pdf), CHI 2021
- Lo et al., [The Semantic Reader Project](https://arxiv.org/abs/2303.14334)
- Ma et al., [Garden of Papers](http://sketch.kaist.ac.kr/pdf/publications/2025_uist_garden_of_papers.pdf), UIST 2025
- [Open Paper](https://github.com/khoj-ai/openpaper)
