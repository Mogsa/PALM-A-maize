# How people read papers, and what the tool should take from it

Research note, 16 September 2026, corrected 23 September 2026. Companion to SPEC.md.

The correction came from a second pass that fetched and read the primary sources. It fixed
four overstatements in section 1, marked one source in section 5 as design experience
rather than a study, and added section 6.

Method: the Georgia Tech OMSCS guide you linked, the standard "how to read a paper" guides used in CS courses, one survey study of reading strategies, the note-taking systems researchers actually use, and the recent HCI reading tools. Several pages were only reachable as search excerpts from this environment, so quotes are paraphrased where noted.

## 1. Is there a consensus on how to read a paper?

On what you should be able to answer at the end, yes, and strongly. On how to get there, less than the first draft of this note claimed.

1. **Do not read front to back.** Keshav and Ng say this plainly, and the Georgia Tech guide calls linear reading "the far right side of the curve of diminishing returns." Not every guide agrees. The PLOS "Ten simple rules" says "There is no correct or incorrect approach" (Rule 4). Pacheco-Vega writes "I absolutely do NOT recommend skipping the middle of the paper"; his AIC method is a first look, not a way of avoiding the body.
2. **Read in passes, coarse to fine.** Keshav, Ng and Georgia Tech structure reading as passes, each with a purpose and a stopping decision: is this worth another pass? PLOS and Pacheco-Vega do not frame reading as passes.
3. **The first pass is a skim of the summary parts, and what counts as one varies.** Keshav's first pass is title, abstract, introduction, headings, conclusion and references, and leaves the figures to pass 2. Ng's is title, abstract and figures. Georgia Tech's is abstract, then introduction, then conclusion, and its page does not mention figures.
4. **You are done when you can answer a fixed set of questions**, not when you reach the last page.

### The pass structures side by side

| Guide | Pass 1 | Pass 2 | Pass 3 (and 4) |
|---|---|---|---|
| **Keshav, three-pass** (the most cited in CS courses) | 5 to 10 min. Title, abstract, intro, headings, conclusion, references. Answer the five Cs: category, context, correctness, contributions, clarity. Decide whether to continue. | About an hour. Read with care, skip proofs. Study figures, diagrams, graphs, error bars. Mark unread references worth following. Should be able to summarize the main thrust with evidence to someone else. | Several hours. Virtually re-implement the paper. Challenge every assumption. Identify hidden assumptions, missing citations, weak points. Only for papers you review or build on. |
| **Andrew Ng, CS230** | Title, abstract, figures. In ML the architecture figure often *is* the method. | Intro, conclusion, all figures again, skim the rest. Intro and conclusion are the authors' clearest summary because they were written to persuade reviewers. | Whole paper, skip the math. Then everything, without getting stuck. |
| **Georgia Tech OMSCS 6460** | Abstract, then introduction, then conclusion. | Not re-verified. The first draft put figures and graphs in a later pass; the guide's page does not mention figures. | |

Two guides are not pass structures and are left out of the table rather than forced into it:

- **Pacheco-Vega, AIC.** Read the abstract, introduction and conclusion first, highlighting and annotating, then decide whether and how to read the whole paper. He says plainly not to skip the middle. The extracted notes go into a spreadsheet row per paper (the "conceptual synthesis Excel dump") so they stay searchable across papers.
- **PLOS Ten simple rules.** Rules, not passes. Rule 1: pick your own reading goal first. Rule 2: work out the author's goal. Rule 3: answer six questions (below). Rule 4: "There is no correct or incorrect approach." Then read critically and creatively, and discuss.

Passes are common but not universal, and what goes into the first pass varies, figures included. A tool should therefore make passes available without requiring them, and must not fix the order of sections inside a pass.

### The questions every guide converges on

Collected from Keshav, Griswold's "How to read an engineering research paper," Ng's four questions, the PLOS six questions, and Mitzenmacher and Ramsey. Deduplicated:

| Question | Who asks it |
|---|---|
| What problem is being solved, and why does it matter? | Griswold "motivation", PLOS "what do the authors want to know" |
| What do the authors claim to contribute? | Keshav "contributions", Ng "what did they try to accomplish", Griswold "proposed solution" |
| How does the method work? What are its key elements? | Ng "key elements", Griswold "solution", PLOS "what did they do" |
| Why was it done this way rather than another? | PLOS "why that way" |
| What earlier work and theory is it built on? | Keshav "context" ("Which other papers is it related to? Which theoretical bases were used?") |
| What evidence is given, and does it support the claim? | Griswold "evaluation", PLOS "what do the results show" |
| What do the authors themselves conclude, and what do I conclude? | PLOS "interpretation", Mitzenmacher critical reading |
| What are the assumptions, limitations, and open questions? | Keshav "correctness" ("Do the assumptions appear to be valid?") and pass 3, Georgia Tech "conclusion carries limitations" |
| What can I use, and what references should I follow next? | Ng questions 3 and 4, Keshav pass 2 |
| What are the good ideas here, and where else could they apply? | Mitzenmacher "read creatively" |

Griswold's version of the stopping rule is the cleanest: you are not done reading until you can answer all the questions.

### A finding about who struggles with which section

Hubbard and Dunbar (PLOS ONE, 2017) surveyed 260 readers from undergraduates to faculty. Inexperienced readers found the **methods and results sections the hardest** and **undervalued the results section** relative to senior researchers. Skill at reading results develops slowly over a career. This is one reason to put figures early: they usually carry the results, and Ng puts them in the first pass and Keshav in the second. The guides do not all do it, so it is a reason, not a consensus.

## 2. How people take notes on papers

Three families, and they compose.

**Per-paper templates.** A fixed set of headings answered once per paper. Examples: the widely copied GitHub markdown template (quick look, what, why, how, assumptions, results, limitations, confusing parts, my conclusion, relation to own work), the Rice template (by Janice Hewitt, 2014, hosted on a Rice CAAM course page), and the PaperFlow reading report (one-sentence summary, background, method, results, contributions, limitations, relation to my research, PDF evidence anchors). The headings are the consensus questions from section 1 again.

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

## 4. What sections 1 to 3 changed in the spec (superseded by section 5 where they conflict)

The spec already matches the consensus in its core: cut the paper into pieces, keep source links, lay out and connect, reader's own words. Five things were missing or under-weighted.

1. **Passes as a first-class idea.** Keshav, Ng and Georgia Tech use them, and you asked for a place to write "what I understood in the first pass." The design: the board has a *current pass* (1, 2, 3). Every piece, highlight, and note is stamped with the pass in which it was made. Each pass has one note with a checklist of the consensus questions for that pass. Switching passes never moves anything; it changes the stamp on new things and lets you filter the board to a pass. This gives "what did I get in pass 1" without a second data structure.
2. **Figures are pieces from the start.** Figures usually carry the results, Ng puts them in the first pass and Keshav in the second, and Hubbard and Dunbar found that inexperienced readers undervalue the results. An extractor can find figures with captions and coordinates, imperfectly, so the board should offer figure pieces beside section pieces, not hide them inside sections. The extractor choice is recorded in SPEC.md section 12.
3. **Highlight roles aligned with Scim and the question list.** Replace the six roles in the spec with: `problem`, `claim`, `method`, `evidence`, `assumption`, `question`. `definition` is dropped because a definition is a concept note. `setup` is folded into `method` or `evidence` depending on what it describes.
4. **A reading goal on the board.** PLOS rule 1. One line at the top: why am I reading this. Cheap and it shapes every decision after.
5. **The per-paper summary is generated from the board, not written separately.** The pass notes plus the pieces tagged `claim`, `evidence`, and `assumption` are the literature note. Export it as one Markdown file in the template shape from section 2. Concept notes are the permanent notes. That ties the board to the two note systems people already use without adding a feature.

Things considered and rejected for v1:

- **Automatic role labelling à la Scim.** Real value, but it is AI and it is exactly the step where the reader does the understanding. Later, as a suggestion the reader confirms.
- **Cross-paper table à la Pacheco-Vega.** Easy to derive later from exported summaries. Not a board feature.
- **A fixed order inside a pass.** The guides disagree on it, and you asked for order to stay free.

## 5. Which ways of organizing ideas actually have evidence behind them

The question here is different from section 1. Not "how should I read" but "which ways of laying out and connecting ideas are known to help understanding, and why." The answers below are from meta-analyses and controlled studies where they exist, and from long-running HCI research where they do not.

| Method | Evidence | Why it works | What it means for the tool |
|---|---|---|---|
| **Concept maps** (nodes, labelled links) | Nesbit and Adesope 2006 meta-analysis: 55 studies, 5,818 participants. Constructing node-link diagrams beat outlines and plain passages for retention, with moderate effects. A 2017 follow-up meta-analysis found *constructing* maps beats *studying* ready-made ones. | The reader has to decide what connects to what and name the connection. That decision is the learning. | Edges with optional labels between any two pieces. The reader draws them; the tool never generates them. |
| **Argument maps** (claim, supports, objects) | van Gelder 2015 meta-analysis: high-intensity argument-mapping courses raised critical-thinking scores by about 0.8 standard deviations, roughly twice a normal critical-thinking course. | Making the support structure of an argument explicit exposes gaps. A paper is an argument. | Edge labels like "supports" and "contradicts" are cheap and match this. Still optional. |
| **Self-explanation** | Chi and colleagues, and the Bisra et al. 2018 meta-analysis: prompting learners to explain material to themselves in their own words improves comprehension and transfer. | Generating an explanation forces integration with what you already know and reveals what you do not. | Notes in the reader's own words are the core act. The "don't understand" flag resolved by writing an explanation is self-explanation with a queue. |
| **Generative note-taking** | Kiewra's work: paraphrased and summarized notes beat verbatim copying. Reviewing notes later adds a large further gain. | Same mechanism: transformation over transcription. | Highlights alone are verbatim. A highlight should invite a note. Restoring the board tomorrow is the review. |
| **Spatial arrangement** | Andrews, Endert, and North 2010, "Space to Think": people given room to lay documents out formed clusters, used position as external memory, and understood the material better. Marshall and Shipman's spatial hypertext work over two decades found the same in practice. | Position and proximity carry meaning without the reader having to say what the meaning is. | Free placement is a feature, not just a canvas. Proximity is a valid connection. Do not demand an edge for every relationship. |
| **Incremental formalization** | Shipman and Marshall 1999, "Formality Considered Harmful". **A design-experience review, not a controlled study**: unlike the meta-analyses above, it reports what the authors saw across the systems they built and studied. Users reject or work around systems that demand explicit structure (types, link kinds, categories) before they know what they think, because it costs cognitive overhead, conflicts with tacit knowledge, and forces premature structure. Systems that let structure stay implicit and be named later are used more. | Asking for a category too early is asking for a decision the reader cannot yet make. | **Every label in the tool is optional.** Roles, pass numbers, edge labels, groups: all can be added later or never. Nothing is required to place, cut, or connect. |
| **Mind maps** (one center, radial branches) | Mixed. Some gains in delayed recall, no consistent advantage over concept maps, and the single-center shape fits a paper badly. | | Not adopted. A paper has several centers. |
| **Outlines** | Consistently the comparison condition that concept maps beat. | Linear, one parent per item. | The paper's own section list is already the outline. The board exists to escape it. |

Two consequences stand out.

First, the strong effects come from what the reader *does* (constructing links, explaining in their own words), not from what the tool shows. Anything automatic that does that work for the reader removes the effect.

Second, Shipman and Marshall's design experience is a direct instruction for this project: do not force structure. That reverses the previous draft's fixed pass count and required roles. The right design is one where a tag, a label, or a group can be added when the reader is ready and left off when they are not.

### Sources for this section

- Nesbit and Adesope, [Learning With Concept and Knowledge Maps: A Meta-Analysis](https://journals.sagepub.com/doi/10.3102/00346543076003413), Review of Educational Research 2006
- Schroeder et al., [Studying and Constructing Concept Maps: a Meta-Analysis](https://www.researchgate.net/publication/315507389_Studying_and_Constructing_Concept_Maps_a_Meta-Analysis), 2017
- van Gelder, [Using Argument Mapping to Improve Critical Thinking Skills](https://thinkeranalytix.org/wp-content/uploads/2018/09/TvG-Using-argument-mapping-to-improve-critical-thinking-skills-2015.pdf), 2015
- Bisra et al., [Inducing Self-Explanation: a Meta-Analysis](https://gwern.net/doc/psychology/spaced-repetition/2018-bisra.pdf), Educational Psychology Review 2018
- Kiewra, [Combined effects of note-taking and reviewing](https://www.researchgate.net/publication/247513702_Combined_Effects_of_Note-Taking-Reviewing_on_Learning_and_the_Enhancement_through_Interventions_A_meta-analytic_review)
- Andrews, Endert, and North, [Space to Think: Large High-Resolution Displays for Sensemaking](https://dl.acm.org/doi/10.1145/1753326.1753336), CHI 2010
- Shipman and Marshall, [Formality Considered Harmful](https://people.engr.tamu.edu/shipman/formality-paper/harmful.html), CSCW 1999; [Spatial hypertext: designing for change](https://dl.acm.org/doi/10.1145/208344.208350), CACM 1995

## Sources for sections 1 to 4

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
- J. Hewitt, [Template for taking notes on research articles](https://www.cmor-faculty.rice.edu/~symes/CAAM600/TakingNotes.pdf), 2014, hosted on the Rice CAAM 600 course page
- [From literature notes to permanent notes in Obsidian](https://martinezponciano.es/2021/04/05/from-literature-notes-to-permanent-notes-obsidian/)

Tools
- Fok et al., [Scim: Intelligent Skimming Support for Scientific Papers](https://dl.acm.org/doi/fullHtml/10.1145/3581641.3584034), IUI 2023; [Ai2 design case study](https://blog.allenai.org/case-study-iterative-design-for-skimming-support-5563dbe0899e)
- Head et al., [ScholarPhi](https://scholarphi.org/assets/pdf/scholarphi-chi-2021.pdf), CHI 2021
- Lo et al., [The Semantic Reader Project](https://arxiv.org/abs/2303.14334)
- Ma et al., [Garden of Papers](http://sketch.kaist.ac.kr/pdf/publications/2025_uist_garden_of_papers.pdf), UIST 2025
- [Open Paper](https://github.com/khoj-ai/openpaper)

## 6. What a CS paper must answer, and when structure helps

Research pass, 23 September 2026. Primary sources were fetched and read; **[S]** marks a source seen only as a search snippet or a secondary summary. It asks two questions: what questions a reader of a CS paper should be able to answer, and whether giving the reader a structure to fill in helps or hurts.

### 6.1 The questions, from three directions

Writing guides say what a paper must tell its reader. Reading guides say what a reader should get out of it. Reviewer forms say what a reader is checked on. They converge.

- **Writing guides.** Widom's introduction answers, verbatim: "What is the problem?"; "Why is it interesting and important?"; "Why is it hard? (E.g., why do naive approaches fail?)"; "Why hasn't it been solved before?"; "What are the key components of my approach and results? Also include any specific limitations." Peyton Jones: one "ping", one clear sharp idea, and a narrative of problem, interest, unsolved, my idea, it works, comparison; contributions "should be refutable", and "Acknowledge weaknesses." The Heilmeier Catechism: what are you trying to do, how is it done today and what are the limits of current practice, what is new, who cares, what are the risks.
- **Reading guides.** Keshav's five Cs: category, context (related papers and theory), correctness (are the assumptions valid), contributions, clarity. Griswold: motivation, solution, evaluation, your analysis, contributions, future directions, "questions you are left with". Ng [S]: what the authors tried to accomplish, the key elements, what you can use, what to read next. PLOS Rule 3's six questions.
- **Reviewer forms.** NeurIPS 2025: summary, strengths and weaknesses, quality, clarity, significance, originality, questions, limitations; its checklist asks whether the abstract's and introduction's claims "accurately reflect the paper's contributions and scope". ICML 2025: summary, claims and evidence, proofs, experimental soundness, relation to prior work, missing references, questions for authors. ACL ARR: summary, strengths, weaknesses, soundness, excitement, limitations, reproducibility. CHI 2025's primary criterion is "a strong contribution to HCI" [S].
- **Rhetorical models.** Teufel's argumentative zoning labels a paper's sentences AIM, BAS (basis), CTR (contrast with other work's weaknesses), OWN, BKG (background), OTH and TXT, built on computational-linguistics papers [S]. CoreSC has eleven categories, from background and hypothesis to result and conclusion, built on chemistry papers [S]. Toulmin's argument model: claim, grounds, warrant, backing, qualifier, rebuttal [S].

The synthesis. Questions 1 to 6 are answered by the paper; 7 to 9 by the reader.

| # | Reader's question | Supported by | Where a CS paper usually answers it |
|---|---|---|---|
| 1 | What problem are they solving, and why should anyone care? | Widom 1 and 2, Peyton Jones, Heilmeier 1 and 4, Griswold, PLOS Q1, AZ AIM and BKG, Scim objective, reviewer significance | Abstract; first paragraphs of the introduction |
| 2 | What exactly do they claim is new: the one main idea, and the contributions? | Peyton Jones's ping and refutable contributions, Keshav contributions, Griswold, Widom 5, the Rice template, Toulmin claim, reviewer summary | Abstract; the contribution list at the end of the introduction; conclusion |
| 3 | Why is it hard, and what did earlier work get wrong or leave out? | Widom 3 and 4, Heilmeier 2 and 3, Peyton Jones, Keshav context, AZ CTR and BAS, Scim novelty, NeurIPS originality, ICML prior work | Introduction; related work; background |
| 4 | How does it work: what are the key parts of the approach? | Widom 5, Peyton Jones, Ng Q2, Griswold, PLOS Q2, AZ OWN, Scim method | Overview figure; the design, method or system section |
| 5 | What evidence is there, and does it actually support the claims? | Peyton Jones, Keshav pass 2, Griswold evaluation, PLOS Q4, ICML claims and evidence, ARR soundness, Toulmin grounds and warrant, Scim result | Evaluation and experiments; figures and tables; theorems and proofs |
| 6 | What does it assume, and where does it stop holding? | Keshav correctness and pass 3's hidden assumptions, Widom limitations, Heilmeier risks, NeurIPS and ARR limitations, Toulmin qualifier and rebuttal, the GitHub template | A limitations section (ML and NLP); threats to validity (software engineering, not re-verified); discussion and conclusion; the problem setting in the method |
| 7 | What do the authors conclude, and do I agree? | PLOS Q5, Griswold's analysis and take-away, the GitHub template's author's versus my conclusion, reviewer strengths and weaknesses | Conclusion and discussion; the reader |
| 8 | What is still open, and what would I ask the authors? | Griswold's future directions and questions left with, PLOS Q6, Widom future work, Keshav pass 3, reviewer questions | Future work; conclusion |
| 9 | What can I use, and what should I read next? | Ng Q3 and Q4, Keshav's unread references, the Rice template's context and relationships, the GitHub template's relation to own work | Not in the paper, except its references |

What is specific to CS. Question 3's framing, novelty against prior work, is heavy in CS review culture. Refutable contribution lists (question 2) are a CS convention. Separate evaluation and limitations sections (questions 5 and 6) are close to mandatory in ML and NLP. Keshav's category, whether a paper is a measurement, a system or a prototype, changes what counts as evidence. Questions 1, 4, 5, 7 and 8 hold for science generally; science tends to phrase question 2 as a hypothesis (CoreSC's HYP), which is rare in CS.

Existing templates cover the same ground at very different sizes: the GitHub template has 26 fields, the Rice template about a dozen, and Scim caps itself at four facets (objective, novelty, method, result) "to promote memorability". Elicit offers 30 or more predefined columns [S]. No canonical built-in paper template was found in Heptabase, LiquidText or the Obsidian and Zotero combination [S]; that means not found, not nonexistent.

### 6.2 Does giving the reader a structure help?

It depends on who writes the answer, and on what the structure asks.

| Structure | Evidence | What it says |
|---|---|---|
| **Guided notes** | Konrad, Joseph and Eveleigh 2009, *Education and Treatment of Children* 32(3) [S] | A small positive effect over complete notes, d ≈ 0.27. |
| **Partial versus complete notes** | Katayama and Robinson 2000 [S] | Partial outlines and organisers beat complete ones on transfer: the learner has to encode the missing parts. |
| **Adjunct questions** | Hamaker 1986 (abstract read); Rothkopf's "mathemagenic" activities [S] | "Higher order adjunct questions may have a more general facilitative effect." Factual prequestions hurt learning of unrelated material when study time is fixed [S]. Questions shape what the reader attends to. |
| **Prequestions** | Pan and Carpenter 2023 (abstract read); King-Shepard et al. 2025 meta-analysis [S] | Prequestioning "can often enhance learning, but the extent … may vary." The meta-analysis found g = .66 for the material the prequestions targeted and g = .01 for everything else: questions steer attention, and give no gain across the board. |
| **Structured abstracts** | Hartley and Sydes 1997 (abstract read) | Rated more readable, and in other studies more informative; they "may be easier to read than traditional ones – sometimes!" |
| **Graphic organisers** | Ponce, Mayer and Méndez 2025 [S] | Both help: learner-constructed (g ≈ .59 for memory, .63 for comprehension) and instructor-provided (.70 and .53). |
| **Expertise reversal** | Kalyuga [S] | Guidance that helps novices can hurt experts. |
| **Forced structure** | Shipman and Marshall 1999 (read) | Forcing structure early costs cognitive overhead, conflicts with tacit knowledge, and produces premature structure; they recommend formalising incrementally. Design experience, not experiments (section 5). |

Structure helps when the reader still generates the answer, so a slot is a question rather than a pre-filled label; when the questions are higher-order; and when the reader is new to the field or the genre. It hurts when it replaces the reader's writing, when it narrows attention to what the slots ask and away from everything else, when it demands classification before understanding, and when the reader is an expert.

### 6.3 What the tool takes from this

The template decisions in SPEC.md section 12, D15 to D19, follow from sections 6.1 and 6.2.

- **Questions, not labels.** A slot asks a question and the reader writes the answer, because the gain comes from generating it (partial notes, higher-order adjunct questions, self-explanation in section 5). A slot is never a category a piece has to be classified into.
- **The reader writes the answer.** Nothing fills a slot. A slot's question disappears as soon as it holds a note of the reader's own. An AI note never answers a question (D14).
- **Optional and deletable.** Every slot can be renamed, deleted or ignored, and more can be added, for the expert whom a fixed structure would slow down (expertise reversal) and for the reader who is not ready to formalise (Shipman and Marshall).
- **Unsorted is allowed.** The pieces start in the paper's own tray and may stay there. The tray is the place for whatever the questions did not anticipate, which is the answer to the prequestion finding: questions steer attention towards what they ask, so something has to hold everything else.
- **The default nine.** Questions 1 to 8 above, plus a Background slot for what the reader needs to know first. Question 9, what to use and what to read next, is answered outside the paper; a reader who wants it adds a slot.

### Sources for section 6

Writing guides
- J. Widom, [Tips for Writing Technical Papers](https://cs.stanford.edu/people/widom/paper-writing.html)
- S. Peyton Jones, How to write a great research paper, Microsoft Research slides (PDF)
- The Heilmeier Catechism, DARPA (darpa.mil)

Reading guides
- S. Keshav, How to Read a Paper (section 1's sources)
- W. Griswold, [How to Read an Engineering Research Paper](https://cseweb.ucsd.edu/~wgg/CSE210/howtoread.html)
- Andrew Ng, CS230 [S], through the secondary notes in section 1's sources
- Carey et al., Ten simple rules for reading a scientific paper, PLOS Computational Biology 2020 (section 1's sources)

Reviewer forms
- NeurIPS 2025 reviewer form and paper checklist
- ICML 2025 reviewer form
- ACL Rolling Review reviewer form
- CHI 2025 review criteria [S]

Rhetorical models
- S. Teufel, [Argumentative Zoning](https://www.cl.cam.ac.uk/~sht25/az.html) [S for the corpus]
- CoreSC [S]
- Toulmin's model of argument [S]

Structure and learning
- Konrad, Joseph and Eveleigh 2009, guided notes, *Education and Treatment of Children* 32(3) [S]
- Katayama and Robinson 2000, partial and complete notes [S]
- Hamaker 1986, adjunct questions
- Rothkopf, mathemagenic activities [S]
- Pan and Carpenter 2023, prequestioning
- King-Shepard et al. 2025, prequestion meta-analysis [S]
- Hartley and Sydes 1997, structured abstracts
- Ponce, Mayer and Méndez 2025, graphic organisers [S]
- Kalyuga, the expertise reversal effect [S]
- Shipman and Marshall, [Formality Considered Harmful](https://people.engr.tamu.edu/shipman/formality-paper/harmful.html), CSCW 1999

Templates
- [Research-Paper-Reading-Template](https://github.com/KaleabTessera/Research-Paper-Reading-Template)
- J. Hewitt, Rice template (section 2's sources)
- Scim (section 3's sources)
- Elicit [S]
