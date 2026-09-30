# What makes a paper easier to understand, and what the tool could take from it

Research note, 29 September 2026. Companion to RESEARCH.md, TOOLS.md and the simplify-and-AI spec (docs/superpowers/specs/2026-09-27-simplify-and-ai-design.md).

RESEARCH.md is about how people read and organise. This note is about **comprehension**: what helps a reader, especially a student, actually understand a paper. Four questions:

1. What did the Semantic Reader tools measure, and what did they find?
2. Why do novices struggle: jargon, notation, background, figures?
3. What do 2023–2026 studies of LLM reading and learning aids find about understanding versus over-reliance?
4. What is known about making a reading tool learnable?

Method. Five parallel research passes fetched and read the primary papers: arXiv full text, ACM full-text HTML, PMC and publisher PDFs. **[S]** marks a source seen only as an abstract or snippet. **[P]** marks a preprint. Numbers are copied from the papers; where the full text was blocked, no number is given.

Two labels are used throughout:

- **Measured**: an objective test of comprehension, recall or task accuracy.
- **Self-report**: ratings of ease, confidence or "I understood". This matters because the two diverge, repeatedly (section 5).

## 1. The one-paragraph answer

Almost no reading tool has been shown to improve measured comprehension. Tools reliably make reading feel easier, and they make readers faster and more confident, and they lead readers to read less of the paper. The interventions with measured gains ask the reader to do something:

- fill in a per-figure table (Figure Facts);
- learn to find a paper's argumentative moves (van Lacum);
- write notes (Kreijkes);
- answer first, then get feedback (Fang).

One AI pointing aid has a measured gain: links from text to the paper's own figures (Hwang, a preprint). Supplied explanations help low-knowledge readers but can remove the gain for readers who could have filled the gap themselves (McNamara). The tool's Principle 1 is on the right side of this evidence. Two parts of the AI layer press against it (section 7).

## 2. The Semantic Reader tools: what was measured

| Tool | Readers | Comprehension measured? | Result |
|---|---|---|---|
| **ScholarPhi** (CHI 2021): definitions of terms and symbols, in place | 27, mostly PhD | Yes: 3 timed questions | **Correctness: 0% difference.** Time −45 s, 25 percentage points less of the paper viewed, ease +1.7/5 and confidence +0.8/5 (self-report). On the symbol question readers did *worse*: the list did not show every sense of T and they assumed it did. |
| **Paper Plain** (TOCHI 2023): definitions, plain-language section gists, key-question index | 24 lay readers | Yes: 7 questions written by physicians | **Non-inferior only**: 3.67 vs 3.50 out of 7. Self-reported understanding was much higher (median 3.5 vs 2.0). One reader read only the gists, rated confidence 5/5, and scored 2/7. |
| **Scim** (IUI 2023): highlights coloured by role | 19 lab, 12 diary | Task accuracy only | Accuracy 0.80 vs 0.76, not significant; faster on answers inside highlights. One reader used the highlights "as a summary". The authors warn that highlights may entice readers "to skim" when a deep read is needed. |
| **CiteRead** (IUI 2022): citing papers' comments in the margin | 12 HCI PhD | **Yes** | **62.5% vs 43.3% (p=.029)**, on questions about limitations and follow-on work. The only objective comprehension gain in the whole project. |
| **Qlarify** (UIST 2024): abstracts that expand on demand | 12 lab, 275 field | No | Time in the full paper fell from 539 s to 201 s. 12.5% of expansions had errors, and "no scholars … explicitly noticed any errors". |
| **CiteSee** (CHI 2023), **Threddy** (UIST 2022), **Relatedly** (CHI 2023), **Synergi** (UIST 2023) | 6–15 researchers each | No | These measure discovery, efficiency or expert-rated outline quality. Threddy concedes that the core synthesis "is not helped directly". Synergi says outright that "putting in the work" may be critical for learning. |
| **Semantic Reader overview** (Lo et al. 2023) | none (overview) | none | "Even slight errors in these models can have detrimental effects on the readers." Its systems "may encourage readers to take shortcuts that lead to incorrect understanding". |

Two cautions on citing these papers:

- The overview's summary claims are stronger than the primary papers. It says "All readers" would use ScholarPhi's tooltips often or always; the actual count was 24 of 27.
- RESEARCH.md section 3 says Scim "helped high-level understanding". That is self-report from the diary study, not a measured result.

### Design principles the project converged on (design experience, not measured)

- **Help at the point of need.** ScholarPhi's definitions are *position-sensitive*: they show the most recent definition before this use, and say "Defined here" at the definition itself.
- **Scent without clutter.** A light dotted underline. ScholarPhi's readers did not turn it off.
- **Supplement, never replace.** Every aid links back to the source sentence so the reader can check it.
- **Few, accurate augmentations.**
  - Scim: "too few highlights will present the guise of an inept tool, and too many will slow a reader down."
  - Head et al. on maths, recommendation R11: provide "the right amount of the right kinds of augmentation, rather than attempting to augment as many expressions as it can."
- **Errors are expensive.** A wrong highlight or definition distracts the reader and costs trust.

## 3. Why novices struggle

| Barrier | What studies found | Kind of evidence |
|---|---|---|
| **Jargon** | ScholarPhi: 8 of 9 student readers were confused by a term. Many were coined inside the paper ("symbolic validator"). Readers put off looking terms up "given the anticipated cost", until they understood too little to go on. Paper Plain: 10 of 12 lay readers were blocked by terminology. Howard et al. 2021: jargon was undergraduates' top reason for not understanding (42% of comments). | Observation and self-report |
| **Definitions do not fix jargon's felt cost** | Bullock et al. 2019, N=650, 2×2 design (jargon or not, hover definitions or not). Jargon lowered processing fluency (η²=.11). **Definitions had no effect** (η²=.0005). Comprehension was not measured. | Measured experiment (self-reported fluency) |
| **Notation** | Readers jump back from a symbol to where it was declared. Kohlhase et al. 2018 (eye tracking, 23 students) found this **equally in high- and low-understanding readers**: it is normal reading, not a sign of confusion. The same symbol means different things in different contexts: only 44% of first-year maths students read sin⁻¹x correctly (Chin & Pierce 2019). ScholarPhi: 4 of 9 readers were confused by symbols and wanted their values. | Eye tracking and a survey test |
| **Background knowledge** | McNamara et al. 1996: low-knowledge readers learn more from a coherent text. High-knowledge readers learn more at the level of inference from a *less* coherent one, because they must fill the gaps. McNamara 2001 **[S]**: the gain disappears if the coherent version is read first. The effect is fragile. O'Reilly & McNamara 2007 **[S]** confined it to less-skilled readers with high knowledge. | Controlled experiments, abstracts read **[S]** |
| **Figures and results** | Round & Campbell 2013: at the start, undergraduates chose **false conclusions from figures more often than true ones** (mean −1). After a term of filling in a per-figure table ("Figure Facts": what was done, the result, the conclusion), the mean was +2 (p<.001). Hubbard & Dunbar (RESEARCH.md) found novices undervalue results sections. | Pre/post test, no control class |
| **Finding the argument** | van Lacum et al. 2014: teaching 7 rhetorical moves (motive, objective, conclusion, implication, supports, counterargument, refutation) improved students' identification of them (p<.001). **Only 23–33% could actually find the main conclusion afterwards**, though they rated themselves able to. | Pre/post, counterbalanced articles |
| **Confidence is not competence** | CREATE, a structured method for reading primary literature: in a controlled comparison, no better than traditional discussion on critique or exam scores, but it raised confidence (Segura-Totten & Dalman 2013). Simplified text raises laypeople's confidence in claims (Scharrer et al. 2017 **[S]**; a 2025 replication failed **[S]**). | Controlled course comparison |

No measured study of how CS students read CS papers was found. Fong 2009 is a tutorial. Shaw 2024 is an experience report: complaints from first-year PhD students "subsided" after teaching them to diagram a paper's argument.

## 4. LLM reading and learning aids, 2023–2026

| Study | Design | Measured result |
|---|---|---|
| **Kreijkes et al. 2026**, *Computers & Education*. Pre-registered RCT | 344 students aged 14–15. LLM vs notes vs LLM + notes; tested 3 days later without AI | **Notes beat the LLM** on retention (d≈0.44) and on comprehension. LLM + notes beat the LLM alone, but was still below notes alone. Most students *preferred* the LLM and rated it more helpful. |
| **Bastani et al. 2025**, *PNAS*. Field RCT | About 1,000 high-school maths students | Plain GPT: practice +48%, **exam without AI −17%**. GPT Tutor (hints, not answers, grounded in the teacher's solution): practice +127%, exam no harm and no gain. Students did not perceive the loss. |
| **Fang et al.**, IUI 2026 | 46 junior researchers, two weeks, reading CHI papers | The reader answers section questions **first**; the agent then gives feedback and asks for a revision. Critical-thinking rubric pre to post: d=1.28 (multi-agent) and 1.18 (single agent). The control, static feedback, did not improve. |
| **Hwang et al. 2026 [P]** | 18 students, one HCI paper, open-book quiz | AI-generated links between the paper's text and its **own figures**: better quiz answers (p<.001), with no extra time or workload. The AI points; it does not explain. |
| **Contractor & Reyes 2026 [P]**. RCT | 204 undergraduates; ChatGPT allowed or not while learning a topic | Knowledge +0.27 SD, lasting a week. Self-selected users who had the AI *explain concepts* kept their gains. Users who had it *do the essay* lost them without AI (0.54 → 0.02 SD). |
| **Melumad & Yun 2025**, *PNAS Nexus* | 7 experiments, N=10,462 | Learning from an LLM summary rather than web links led to less time spent, shallower advice and lower self-reported learning. Only 26% clicked the source links offered. There was no knowledge test. |
| **Stadler et al. 2024 [S]** | 91 students, ChatGPT vs Google | Lower cognitive load, **worse reasoning quality** (expert-coded). |
| **Darvishi et al. 2024 [S]** | 1,625 students doing peer review | Students "rely on rather than learn from" AI prompts; quality fell when the prompts were removed. |
| **Buçinca et al. 2021** | 199 people, decisions with AI advice | Deciding *before* seeing the AI's answer cut over-reliance. People liked these designs least. |
| **Vasconcelos et al. 2023** | 731 people | Explanations reduce over-reliance only when they make **checking** the AI cheaper. |
| **Kazemitabaar et al. 2025** | 82 + 42 novice programmers | "Lead-and-reveal", where the learner predicts before the AI reveals, was the most promising technique (+27 points, p=.058). The effects were fragile and every technique cost time. |

Weaker evidence, not used for decisions:

- Lee et al. CHI 2025: survey, self-report only. Readers rated comprehension tasks the most eased by AI (79%).
- Gerlich 2025: correlational **[S]**.
- Kosmyna et al. 2025: EEG, 54 people, essay writing **[P]**.
- Wang & Fan 2025 meta-analysis: **retracted** in April 2026. Do not cite it.

The pattern is consistent. Answer-giving AI raises performance while it is present, and raises felt ease and preference, but lowers learning afterwards. AI that makes the reader attempt first, keeps them writing, or only points into the source is neutral to positive. This is the generation effect and desirable difficulties (Slamecka & Graf, Bjork) again: the mechanism RESEARCH.md section 5 found for concept maps and self-explanation.

## 5. Learnability of reading tools

| Finding | Source | Kind |
|---|---|---|
| The biggest novice gap is **not knowing a feature exists** ("awareness"), and think-aloud testing misses it | Grossman et al. 2009, N=10 | Measured, small |
| In Paper Plain's prototype, 2 of 8 readers missed the sidebar toggle until a researcher pointed it out. The final design opens the sidebar by default. There is a warm-up of about 2 minutes before readers use the features. | August et al. | Observation |
| Every Semantic Reader study ran a tutorial first. No reading-tool study measured whether readers discovered features *unaided*. | all | Gap |
| Up-front tutorials helped only in a complex, unconventional game. Blocking tutorials showed no benefit. Just-in-time instruction beat a manual. | Andersen et al. 2012, >45,000 players | Measured, field A/B |
| Showing a gesture at the control that triggers it: 90.9% of gestures discovered, vs 75% with a cheat sheet. | GestureBar, Bragdon et al. 2009, N=44 | Measured |
| When the novice path rehearses the expert gesture (marking menus), users move to the gesture and fall back to the menu after a break. | Kurtenbach & Buxton 1994, N=2 field | Measured, tiny |
| Users keep the first method that works; shortcuts are rarely adopted on their own. | Cockburn et al. 2014 survey | Review |
| Contextual help at the tool (ToolClips): task completion 10% → 70%. Tooltips were mostly used to *find* tools, not to understand them. | Grossman & Fitzmaurice 2010, N=10 | Measured |
| Readers needed time to trust highlights "that aren't my own", then set density once and left it. | Scim diary | Observation |
| Readers set on reading give little attention to the tool: "I was trying to pay more attention to the paper than the tool." | ScholarPhi pilot | Quote |

## 6. Findings, evidence, and what the tool could take

Evidence strength:

- **Strong**: a pre-registered or large randomised trial, or a replicated experiment.
- **Moderate**: a controlled study with small N, or a single experiment.
- **Weak**: pre/post without a control, observation, or a preprint.
- **Opinion**: design experience or practitioner writing.

| # | Finding | Evidence | What the tool could take |
|---|---|---|---|
| 1 | Reading aids make papers feel easier without measured gains in comprehension | Moderate: ScholarPhi, Paper Plain, Scim all show 0 or non-inferior, N=19–27 | Do not claim the AI layer improves understanding. If the owner's study tests it, use a quiz without AI, not self-report. |
| 2 | Readers prefer and over-rate the aids that help them least | Strong: Bastani, Kreijkes; Moderate: Buçinca, van Lacum, Segura-Totten | The same. Also: the reader's liking the AI layer is not evidence it works. |
| 3 | Writing your own notes beats reading an LLM's; adding notes to the LLM recovers part of the gap | Strong: Kreijkes RCT | Confirms Principle 1 and the slot design. The AI must never make writing the note feel unnecessary. |
| 4 | Answer-giving AI harms learning; hints grounded in a correct source remove the harm | Strong: Bastani | Grounding every claim in a quote (B3a) is the right kind of guardrail. Keep "no explain-this-paragraph" out of scope. |
| 5 | Attempt first, then see the AI, reduces over-reliance and improved critical reading | Moderate: Buçinca, Fang, Kazemitabaar | **Proposed:** 📍 Where to look opens only after the slot holds a note of the reader's own, or after an explicit "I've looked, show me". See conflict C2. |
| 6 | AI that only points into the paper's own figures improved quiz scores | Weak [P]: Hwang, N=18 | Pointing is the safest AI help. A future "which figure is this sentence about" link fits Principle 1 exactly. |
| 7 | Hover definitions do not restore reading fluency | Moderate: Bullock, N=650 (self-reported fluency) | The dotted underline plus explanation (B4) is not a jargon cure. The glossary in the reader's own words stays the core. |
| 8 | Supplied coherence helps low-knowledge readers and can cancel high-knowledge readers' gain from filling gaps | Moderate but fragile: McNamara 1996/2001 [S], O'Reilly 2007 [S] | Keeping AI **off by default and per paper** is right. It is expertise reversal again (RESEARCH.md 6.2). Consider making "Your definition" the empty first part of the card, so the reader is prompted to try first (conflict C1). |
| 9 | Incomplete or wrong AI output misleads, and readers rarely notice | Moderate: ScholarPhi symbol question; Qlarify 12.5% errors unnoticed; August 2022 found 40–60% of generated definitions factually wrong | The grounding rule stops invented quotes, not wrong explanations of real ones. Show every sense a symbol or term is defined with, not just one; say "the paper defines this in 2 places". Keep "based on p3 ↗" visible on every AI line. |
| 10 | Readers rarely click through to sources (14.8% field, 26% in Melumad) | Moderate | "Based on p3 ↗" alone is not enough. Show the paper's own sentence **first** on the card, with the AI line after it. B4 already orders it this way; keep it. |
| 11 | Symbol lookup back to the declaration is normal skilled reading | Moderate: Kohlhase eye tracking, N=23 | Make "where was this symbol declared" one hover, position-sensitive as in ScholarPhi (most recent definition before this point). D25 plus D27 nearly do this; extending the term tag to symbols is the gap. |
| 12 | Novices draw false conclusions from figures; a per-figure table (what was done, result, conclusion) fixed it | Weak: Round & Campbell, pre/post, no control | An optional **figure template**: three questions attached to a figure piece. Reader-written, consistent with the slot design. |
| 13 | Learning to find the paper's argument (motive, conclusion, support, counterargument) is teachable, but most still miss the main conclusion | Moderate: van Lacum | The nine slots already ask these questions. Evidence to keep "What do they claim" and "What do they conclude" as separate slots. |
| 14 | Too many augmentations distract and cost trust | Opinion, consistent across ScholarPhi, Scim, Head et al. 2022 | Cap AI terms per paper, or per page, and prefer the ones the paper itself defines. Not every capitalised noun needs an underline. |
| 15 | Novices do not know features exist; in-context teaching beats tours | Moderate: Grossman 2009, GestureBar, Andersen | The three one-time hints (A4) match the evidence. Make each button show its gesture, e.g. "✂ Cut, or drag to board". Keep the buttons after gestures are learned (Kurtenbach). |
| 16 | A toggle hidden in a menu gets missed | Observation: Paper Plain | "AI help" lives only in ⌘K (B2). A reader who wants it may never find it. That may be acceptable, since off is the safe default, but decide it on purpose (see C3). |

## 7. Conflicts with Principle 1 ("the reader does the work")

Principle 1, as restated in B1: AI may point and explain, visibly marked, and only when the reader has turned it on.

**C1. AI explanations on the term card (B4, part 3).**

- Explaining is doing some of the reader's work.
- The evidence says supplied explanations:
  - do not restore fluency (Bullock);
  - do not raise measured comprehension (Paper Plain);
  - can remove the gain for readers able to bridge the gap themselves (McNamara 2001 [S]).
- They do help low-knowledge readers, and the owner's stated problem is jargon.

This is a real trade-off, not a violation. Principle 1 already allows "explain". The research-backed mitigation is to **order the attempt before the answer**:

- the card shows the paper's sentence first (already the order in B4);
- the AI line is one extra click ("Show AI explanation") rather than always open;
- or the AI line appears only once the reader has kept a term mark or written a definition.

Which of these to use is the owner's decision.

**C2. 📍 Where to look (B5).** This is the clearest tension.

- Finding where a paper answers a question is part of understanding it. Van Lacum: only 23–33% of trained students could find the main conclusion.
- Pointing to it in advance does that locating for the reader.
- It also narrows attention to what the slots ask (the prequestion finding, RESEARCH.md 6.2).
- The effect of such pins on comprehension is unmeasured.
- Every comparable tool made readers read less of the paper:
  - ScholarPhi: 25 percentage points less area viewed;
  - Qlarify: 539 s → 201 s in the full paper;
  - Paper Plain: readers jumped to the answers.

The attempt-first evidence (Buçinca, Fang, Kazemitabaar) suggests showing the 📍 only after the reader has looked, for example once a slot has a note, or behind "I've looked, show me". Then it becomes a check of the reader's own answer rather than a shortcut. The spec as written shows it as soon as the pass is done. **Flag for the owner.**

**C3. Self-report as the success measure.** Not a conflict with the principle, but with how it will be judged. If the owner's study asks readers whether the AI helped, the literature predicts "yes" whether or not it did. A short quiz without AI, a few days after reading, is the measure that has distinguished helpful aids from harmful ones.

**No conflict found:**

- AI off by default.
- Grounding every claim in a quote.
- Never writing notes, slots, tags or connections.
- Never exporting AI text.
- Keep making a reader-owned `term` mark with no AI text.

Each of these is what the evidence would recommend.

## Sources

Semantic Reader
- Lo et al., [The Semantic Reader Project](https://arxiv.org/abs/2303.14334), arXiv 2023 (CACM 2024 version not read)
- Head et al., [ScholarPhi: Augmenting Scientific Papers with Just-in-Time, Position-Sensitive Definitions of Terms and Symbols](https://arxiv.org/abs/2009.14237), CHI 2021
- August et al., [Paper Plain](https://arxiv.org/abs/2203.00130), TOCHI 2023 (preprint read; also [author PDF](https://andrewhead.info/assets/pdf/paper-plain.pdf))
- Fok et al., [Scim](https://arxiv.org/abs/2205.04561), IUI 2023
- Fok et al., [Qlarify](https://arxiv.org/abs/2310.07581), UIST 2024
- Chang et al., [CiteSee](https://arxiv.org/abs/2302.07302), CHI 2023
- Kang et al., [Threddy](https://arxiv.org/abs/2208.03455), UIST 2022
- Rachatasumrit et al., [CiteRead](https://dl.acm.org/doi/fullHtml/10.1145/3490099.3511162), IUI 2022
- Palani et al., [Relatedly](https://arxiv.org/abs/2302.06754), CHI 2023
- Kang et al., [Synergi](https://arxiv.org/abs/2308.07517), UIST 2023
- Palani et al., [CoNotate](https://dl.acm.org/doi/fullHtml/10.1145/3411764.3445618), CHI 2021
- August, Reinecke and Smith, [Generating Scientific Definitions with Controllable Complexity](https://aclanthology.org/2022.acl-long.569.pdf), ACL 2022
- Head, Xie and Hearst, [Math Augmentation](https://andrewhead.info/assets/pdf/augmented-formulas.pdf), CHI 2022

Novice readers
- Bullock et al., [Jargon as a barrier to effective science communication](https://doi.org/10.1177/0963662519865687), Public Understanding of Science 2019
- Shulman et al., [The effects of jargon on processing fluency](https://doi.org/10.1177/0261927X20902177), J Lang Soc Psych 2020 [S]
- Scharrer et al., [When science becomes too easy](https://doi.org/10.1177/0963662516680311), PUS 2017 [S]; failed replication, [Learning and Instruction 2025](https://doi.org/10.1016/j.learninstruc.2025.102121) [S]
- Plavén-Sigray et al., [The readability of scientific texts is decreasing over time](https://elifesciences.org/articles/27725), eLife 2017
- Howard et al., [Insights on biology student motivations and challenges when reading primary literature](https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0251275), PLOS ONE 2021
- Kohlhase, Kohlhase and Ouypornkochagorn, [Discourse Phenomena in Mathematical Documents](https://kwarc.info/kohlhase/papers/cicm18-discourse.pdf), CICM 2018
- Chin and Pierce, [University Students' Conceptions of Mathematical Symbols](https://files.eric.ed.gov/fulltext/EJ1312289.pdf), EURASIA 2019
- McNamara, Kintsch, Songer and Kintsch, [Are Good Texts Always Better?](https://doi.org/10.1207/s1532690xci1401_1), Cognition and Instruction 1996 [S]
- McNamara, [Reading both high-coherence and low-coherence texts](https://doi.org/10.1037/h0087352), Canadian J Exp Psych 2001 [S]
- O'Reilly and McNamara, Reversing the reverse cohesion effect, Discourse Processes 2007 [S]
- Chi et al., Eliciting self-explanations improves understanding, Cognitive Science 1994 [S]
- Round and Campbell, [Figure Facts](https://pmc.ncbi.nlm.nih.gov/articles/PMC3587854/), CBE-LSE 2013
- van Lacum, Ossevoort and Goedhart, [A Teaching Strategy with a Focus on Argumentation](https://pmc.ncbi.nlm.nih.gov/articles/PMC4041503/), CBE-LSE 2014
- Segura-Totten and Dalman, [The CREATE Method Does Not Result in Greater Gains in Critical Thinking](https://pmc.ncbi.nlm.nih.gov/articles/PMC3867753/), JMBE 2013
- Hoskins, Lopatto and Stevens, [The C.R.E.A.T.E. Approach](https://pmc.ncbi.nlm.nih.gov/articles/PMC3228655/), CBE-LSE 2011
- Washburn et al., [Discussion of Annotated Research Articles](https://pmc.ncbi.nlm.nih.gov/articles/PMC10117138/), JMBE 2023
- Shah and Hoeffner, [Review of Graph Comprehension Research](https://doi.org/10.1023/A:1013180410169), Educ Psych Review 2002 [S]
- Shaw, [A Diagramming Technique for Teaching Students to Read Software Engineering Research Papers](https://arxiv.org/abs/2405.02734), 2024

LLM aids and over-reliance
- Kreijkes et al., [Effects of LLM use and note-taking on reading comprehension and memory](https://doi.org/10.1016/j.compedu.2025.105514), Computers & Education 2026
- Bastani et al., [Generative AI without guardrails can harm learning](https://pmc.ncbi.nlm.nih.gov/articles/PMC12232635/), PNAS 2025
- Fang et al., [LLM-based In-situ Thought Exchanges for Critical Paper Reading](https://arxiv.org/abs/2510.15234), IUI 2026
- Hwang et al., [Connecting the Dots: AI-Generated Cross-Modal Links](https://arxiv.org/abs/2602.16895), 2026 [P]
- Contractor and Reyes, [Experimental Evidence on the Learning Impact of Generative AI](https://arxiv.org/abs/2607.08849), 2026 [P]
- Melumad and Yun, [Experimental evidence of the effects of LLMs versus web search on depth of learning](https://pmc.ncbi.nlm.nih.gov/articles/PMC12560091/), PNAS Nexus 2025
- Yang et al., [Easy Come, Easy Go?](https://arxiv.org/abs/2410.01396), 2024 [P]
- Stadler, Bannert and Sailer, [Cognitive ease at a cost](https://doi.org/10.1016/j.chb.2024.108386), Computers in Human Behavior 2024 [S]
- Darvishi et al., [Impact of AI assistance on student agency](https://doi.org/10.1016/j.compedu.2023.104967), Computers & Education 2024 [S]
- Lee et al., [The Impact of Generative AI on Critical Thinking](https://doi.org/10.1145/3706598.3713778), CHI 2025
- Gerlich, [AI Tools in Society](https://doi.org/10.3390/soc15010006), Societies 2025 [S]
- Kosmyna et al., [Your Brain on ChatGPT](https://arxiv.org/abs/2506.08872), 2025 [P]
- Buçinca, Malaya and Gajos, [To Trust or to Think](https://arxiv.org/abs/2102.09692), CSCW 2021
- Vasconcelos et al., [Explanations Can Reduce Overreliance on AI Systems](https://arxiv.org/abs/2212.06823), CSCW 2023
- Kazemitabaar et al., [Cognitive Engagement Techniques with AI-Generated Code](https://arxiv.org/abs/2410.08922), IUI 2025
- Wang and Fan, ChatGPT meta-analysis, HSSC 2025: **retracted 2026**, not used

Learnability
- Grossman, Fitzmaurice and Attar, [A Survey of Software Learnability](https://doi.org/10.1145/1518701.1518803), CHI 2009
- Grossman and Fitzmaurice, [ToolClips](https://www.tovigrossman.com/papers/chi2010toolclips.pdf), CHI 2010
- Kelleher and Pausch, [Stencils-based tutorials](https://doi.org/10.1145/1054972.1055047), CHI 2005
- Carroll and Rosson, [Paradox of the Active User](https://research.cs.vt.edu/ns/cs5724papers/4.mental.mental.carroll.paradox.pdf), 1987
- Bragdon et al., [GestureBar](https://www.cs.ucf.edu/~jjl/pubs/fp1310-bragdon.pdf), CHI 2009
- Bau and Mackay, [OctoPocus](https://www.lri.fr/~mbl/Stanford/CS477/papers/Octopocus-UIST2008.pdf), UIST 2008
- Kurtenbach and Buxton, [User learning and performance with marking menus](https://www.billbuxton.com/MMUserLearn.html), CHI 1994
- Cockburn et al., [Supporting Novice to Expert Transitions in User Interfaces](https://doi.org/10.1145/2659796), ACM Computing Surveys 2014
- Andersen et al., [The impact of tutorials on games of varying complexity](http://grail.cs.washington.edu/projects/game-abtesting/chi2012/chi2012.pdf), CHI 2012
- Froehlich et al., [Is it Better With Onboarding?](https://doi.org/10.1145/3461778.3462047), DIS 2021
- Tashman and Edwards, [LiquidText](https://doi.org/10.1145/1978942.1979430), CHI 2011
- Norman and Nielsen, [Gestural interfaces: a step backwards in usability](https://jnd.org/gestural-interfaces-a-step-backwards-in-usability/), Interactions 2010 (opinion)
