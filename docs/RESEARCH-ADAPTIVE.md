# Inferring understanding, feedback on the reader's explanations, and AI help with connections

Research note, 29 September 2026. Companion to SPEC.md, RESEARCH.md and RESEARCH-COMPREHENSION.md.

It asks three questions the owner is designing a study and features around:

1. Can a system infer what a reader understands, or where they are confused, from what they do: dwell, scroll, re-reading, lookups, highlights, notes? And what did the studies that tried use as ground truth for "understood"?
2. Does explaining in your own words and getting corrective feedback help more than reading an AI's explanation?
3. Does an AI that suggests connections, in a concept map, an argument map or across papers, help or hurt compared with prompting the reader to find them?

Method. Primary sources were fetched and read where they were open: full text for most arXiv, ERIC, NSF and Nature papers, and abstracts from Europe PMC or ERIC for the rest. **[S]** marks a source seen only as a search snippet, a secondary summary or another paper's citation. **[A]** marks a source whose abstract was read but not its full text. Each finding says whether it was **measured** or is **design opinion**. RESEARCH-COMPREHENSION.md already covers Bastani et al., Buçinca et al. and the general over-reliance literature on LLM reading aids. They appear here only where they bear on these three questions.

## 1. The short answer

1. **Inferring understanding from logs: weakly, and not for one reader on one paper.** Scrolling, dwell time and gaze correlate with comprehension at about r = .2 to .35. Highlights explain about 13% of the variance in quiz scores. Models built on these signals fail on new readers or new questions. The strongest signal in these studies is what the reader writes: human-scored self-explanations were the ground truth that gaze models were trained on. Readers are also poor judges of their own understanding: the correlation between judged and tested comprehension is about 0.18 across 115 studies. So "the reader said they understood" is weak ground truth too.
2. **Feedback on your own explanation: measured and positive, but modest.** The cleanest recent test, an LLM giving feedback on open-ended self-explanations, improved the quality of explanations on transfer problems (d = .44) but not ordinary test scores. The learners also did a quarter as much practice. LLM feedback on open responses helped only the learners who chose to use it (0.28 and 0.33 SD in 2 of 7 lessons). Tutorial dialogue beats reading only when the text is too hard for the reader. No study was found that compares "critique my explanation" with "read the AI's explanation" for research papers.
3. **Suggested connections: the evidence is split, and the split is informative.** Building a concept map beats its comparison conditions by more than studying a finished map does (g = .72 against .43). But studying a correct expert map, or correcting a flawed one, sometimes beats building from scratch, especially for novices. Cross-paper tools (Relatedly, Threddy, CiteSee, Synergi) measured outline quality, paper discovery and flow. None measured understanding. No experiment was found that directly compares AI-suggested links with Socratic prompts to find the link.

## 2. Can a system infer what a reader understands?

### 2.1 What has been tried

| Study | Signal | Ground truth for "understood" | Result (measured) |
|---|---|---|---|
| **Corbett and Anderson 1994**, Bayesian knowledge tracing [S] | Right or wrong on each problem step in a tutor | Correctness of the next step; post-tests | The standard learner model. It needs a task with right answers, one step per skill. Reading a paper has neither. |
| **Piech et al. 2015**, deep knowledge tracing | Same, fed to an LSTM | Next-answer correctness | AUC 0.85 against BKT's 0.68 on Khan Academy data. Khajah, Lindsey and Mozer 2016 [A] found that extended shallow models match it. |
| **Bhattacharyya et al. 2026**, specialised KT against LLMs | 50 answers per student | Next-answer correctness | A fine-tuned LLM 72.8%, SAKT 72.7%, DKT 71.8%. GPT-4o-mini 58.6%, **below the 66.5% of simply predicting each question's average**. Several LLMs failed that naive baseline. |
| **Gooding et al. 2021**, scrolling | Scroll speed, acceleration, read time, revisits (518 readers, phone) | Three comprehension questions per article | Readers scroll differently on hard and easy texts, so text level is predictable from averaged behaviour. Correlation with a reader's own score: at most r = −.35 (average speed, easy texts), −.26 on hard texts. |
| **Winchell et al. 2018** [S]; **Kim et al. 2020** [A]; **Kim et al. 2021** | Highlights (198 lab readers; OpenStax classes) | Quiz questions after reading | The amount highlighted was unrelated to quiz scores. Highlight patterns explained about 13% of the variance in quiz scores. Semantic highlight features improved per-question prediction and generalised to new students, **but not to new questions**. |
| **Ahn et al. 2020** [S] | Gaze fixations and pupil size | Comprehension questions | 65% against a 54% base rate; 41% on new readers. "Substantial individual differences." |
| **Shubi et al. 2024** [A] | Gaze, per question | Answer to each question | "The task is highly challenging", though gaze carries some signal. |
| **Southwell, Mills, Caruso and D'Mello 2022** | Gaze (247 readers, a 6,500-word text) | **Self-explanations written during and after reading, scored by human raters** | Model agreed with the scored explanations at r = .32 and .35. It predicted inference-level post-tests at r = .29 and .35, including a week later, and generalised to new readers. |
| **Faber, Bixler and D'Mello 2018** [A] | Gaze (132 readers) | Self-caught mind-wandering reports | Model and self-report agreed at r = .40 per person. The model predicted comprehension (r = −.37) **better than the self-reports it was trained on** (r = −.21). |
| **D'Mello et al. 2017**, "Zone out no more" | Gaze-detected mind wandering, then a question and a re-read prompt (104 readers) | Post-reading comprehension test | No overall difference: 57.6% against 58.1%. It closed the gap only when mind wandering was high (d = .47). The authors call the intervention remedial. |
| **Hijazi et al. 2024** | Wristband pulse and skin conductance plus a cheap eye tracker (40 readers) | **The readers' own highlights: red for difficult, yellow for uncertain**, combined with wrong answers per region | 72% accuracy at flagging a paragraph as difficult. The ground truth was mostly the reader telling the system. |
| **"Says Who?", EDM 2024** | Game logs (124 students) | Self-report pop-ups against trained classroom observers (BROMP) | Observers recorded confusion about 5% of the time and "focused" over 80%. Self-reports gave 28.9% focused and 31.7% bored. Detectors trained on each did about equally well (AUC about .67 to .80) but used different features. The authors say the two measure different things. |
| **Graesser, D'Mello et al.** [S] | Retrospective video judgments of affect | Learner, peer and two trained judges | Agreement: self against peer κ = .08, trained judges with each other κ = .36. |

### 2.2 Ground-truth options and their trade-offs

This is the part the study design depends on. Every option below has been used, and each measures something slightly different.

| Option | What it actually measures | Who used it | Cost | Trade-offs |
|---|---|---|---|---|
| **Post-test questions per section** (after reading, and again after a delay) | Whether the reader can answer questions someone chose | Gooding, Winchell, Kim, Ahn, Shubi, Zone out, Southwell | Someone must write questions for every paper; that means you, for each study paper | Objective and comparable. Measured once at the end, not in the moment. Mostly factual unless you write inference questions (Southwell did). Models trained on one set of questions did not transfer to new ones (Kim 2021). In a 1-to-3-paper study it is feasible; inside the tool on arbitrary papers it is not. |
| **Self-report during reading** (probes, a "confused" button, marking hard passages) | What the reader *thinks* they do not understand | Faber, Hijazi, "Says Who?" | Cheap; already in the tool as the `question` flag | In the moment and local to a passage. But metacomprehension accuracy is poor: a mean correlation of 0.18 between judged and tested comprehension across 115 studies (Yang et al. 2023), and 0.27 in Dunlosky and Lipko 2007 [S]. Readers miss what they do not know they missed. Probes interrupt. Self-caught reports miss unaware lapses, which is why Faber's model beat its own labels. |
| **Think-aloud** | The reader's ongoing thoughts, coded later | Classic reading research | Lab only; hours of coding per session | Pure think-aloud does not change performance (Fox, Ericsson and Best 2011 [A]: 94 studies, about 3,500 people, effect near zero). **Asking readers to explain while they read does change their thinking**, and every form of verbal report slows the task. Good for a small qualitative study. It cannot run inside the tool. |
| **Expert-scored explanations** (the reader explains, raters score against a rubric) | Depth of understanding, including inference | Southwell (human raters), Chen et al. 2026 (humans, then an LLM) | Rubric per question; two raters, or one rater checked against an LLM | The best-validated deep-comprehension label here. Chen's LLM grader agreed with the human consensus at κ = .78; the two humans agreed with each other at κ = .70. **The catch: explaining is itself an intervention** (self-explanation, section 3), so measuring and teaching are confounded. It also only scores what the reader chose to write. |
| **Observer protocols** (BROMP, retrospective video) | Visible affect: confused, bored, focused | Baker's classroom work, AutoTutor studies | Trained observers | Built for classrooms and for affect, not comprehension. Agreement between observers and learners is low. Not applicable to a solo reader at a desk. |
| **Map comparison** (the reader's map against an expert map) | Which links the reader got | Kit-Build (Hirashima et al.) [S] | An expert map per paper | Automatic once the expert map exists. Only as good as that one map, and it penalises valid links the expert did not draw. |

**What this means for the study.** No single option is clean, so combine two that fail differently.

1. **The criterion is a short post-test per section, written by you for the study papers**, with at least one "why" or "what would break if" question per section so it reaches inference. Repeat it after a delay.
2. **In the moment, log the reader's own flags** (`question` marks, lookups) as self-report. Treat them as *what the reader noticed*, not as truth. The gap between flags and post-test errors is itself a finding: it is metacomprehension, and it is what an adaptive feature would try to close.
3. **Score the reader's notes with a rubric**, by two people or by one person checked against an LLM, as the explanation measure. Record that writing the notes is part of the treatment.

Dwell, scroll and re-reading are worth logging as predictors to test against those criteria. The evidence says not to use them as the criterion.

### 2.3 Findings for question 1

| Finding | Evidence strength | What the tool could take |
|---|---|---|
| Scroll, dwell and gaze predict understanding only weakly (about r ≤ .35) and generalise poorly to new readers | Moderate: several measured studies, consistent. Mostly short texts, not research papers | Do not infer "understood" from behaviour. At most, show the reader their own traces (the passages they re-read most) and let them decide what they mean. |
| Highlights explain about 13% of the variance in quiz scores; the amount highlighted predicts nothing | Moderate: two classroom datasets and one lab study, all from one group | A highlight is not evidence of understanding. Do not score or nudge by highlight count. |
| What the reader writes is the strongest signal, and an LLM can score it close to human agreement | Moderate: Southwell (measured), Chen (κ = .78, one domain) | If the tool ever estimates understanding, estimate it from the reader's own notes, on request, not from logs. |
| Readers are poor judges of their own understanding (about 0.18) | Strong: a meta-analysis of 115 studies | A `question` flag means "I noticed a gap", not "everything else is understood". Nothing should treat an unflagged passage as understood. |
| Writing a delayed summary, self-explaining and concept mapping each make readers better judges of their own understanding | Strong: the same meta-analysis (improvements of about 0.18 to 0.20 in the correlation) | The note-writing and connecting the board already asks for also improves the reader's calibration. This supports the board as it is. |
| Acting on a detected lapse helps only when the lapse is real and frequent | Moderate: Zone out (104 readers; the overall effect was null) | Any adaptive prompt should be something the reader invokes, not something pushed on an estimate. |
| LLMs are worse than simple models at predicting a learner's next answer unless fine-tuned | Moderate: one benchmark on maths answers | Do not hand interaction logs to a general LLM and ask what the reader understands. |

## 3. Feedback on the reader's own explanations

### 3.1 What was measured

- **Self-explanation works; its edge can vanish when time is held equal and there is no feedback.** RESEARCH.md section 5 covers the meta-analysis. Chen et al. 2026 cite Matthews and Rittle-Johnson, and McEldoon et al. [S]: when control groups used the same time to practise more, the self-explanation advantage disappeared. Both of those studies gave no feedback on explanation quality.
- **Aleven and Koedinger 2002** [S]. In a geometry Cognitive Tutor, students who explained steps, by naming the rule, and got feedback on the explanation learned with more understanding and did better on transfer. Later versions accepted free-text explanations with corrective feedback. They reached equal learning with fewer problems but needed hundreds of hand-written rules.
- **Chen et al. 2026**, "Practice less, explain more". 92 adults, calculus, 60 minutes fixed. Three conditions: no explanation, picking an explanation from a menu, and writing an explanation with LLM feedback (red, yellow or green; a reference explanation after two failed tries). Post-test scores did not differ. On "not enough information" transfer problems, the written-explanation group wrote better explanations (+11.9 points, d = .44, p = .03). Its multiple-choice advantage was not significant (p = .18). It solved 16.9 practice problems against the control's 58.9 and learned as much. Menu-based explanation did nothing.
- **Thomas et al. 2025.** 885 tutor trainees, 7 lessons, on-demand GPT-3.5 feedback on their open responses. Learners who chose the feedback scored higher, but so did learners who were *likely* to choose it. After adjusting for that, 2 of 7 lessons showed gains (0.28 and 0.33 SD). Having it available did not help on its own (intent-to-treat not significant).
- **iSTART, McNamara et al. 2004** [S]. Students type self-explanations of science-text sentences and get automated feedback on their quality. It improved comprehension against untrained controls, for high- and low-knowledge students.
- **VanLehn et al. 2007** [A]. 7 experiments: human tutors and the natural-language tutors Why2-Atlas and AutoTutor against reading a text on the same content. **Dialogue beat reading only when novices studied material written for intermediates.** When the text matched the reader's level, tutoring was not reliably better. VanLehn 2011 [S]: step-based tutoring systems d = .76, human tutoring d = .79, against no tutoring.
- **Kestin et al. 2025.** 194 Harvard physics students. An AI tutor built on pedagogy (prompted to scaffold, manage load, and given step-by-step solutions) against an active-learning class. Effect 0.63 SD, 0.73 to 1.3 after correcting for a ceiling, in less time. The comparison is a class, not reading, and the tutor explains.
- **Learning by teaching.** Roscoe and Chi 2007 [S]: peer tutors mostly "knowledge-tell" (repeat what they know), and the learning comes from "knowledge-building": reflecting, and answering deep tutee questions. Fiorella and Mayer 2013 [S]: actually teaching to a camera beat only expecting to teach on a delayed test. **AlgoBo, Jin et al. 2024**: an LLM tutee held to a restricted knowledge level that asks "why" and "how". Its questions made conversations more knowledge-dense (d = .71, 40 novices). There was no pre/post test, and the authors note that an LLM's "expansive knowledge as tutees discourages learners from teaching". **Betty's Brain, Biswas et al. 2005**: 5th graders teach an agent by building a causal concept map, 15 per condition. The version with generic self-regulation feedback beat content-corrective tutoring on a transfer task. With corrective hints, students fixed links to pass quizzes and "very little time (if any) was spent on re-reading the resources".
- **Risks.** Lehmann, Cornelius and Sting 2025: in two pre-registered lab experiments, LLM access had no overall effect on learning. Students who *substituted* (had it solve exercises) covered more topics but understood each less. Students who *complemented* (asked for explanations) understood more. It widened the gap between high and low prior knowledge. Perceived benefit exceeded actual benefit. Fan et al. 2024 [S]: ChatGPT support raised essay scores but not knowledge gain or transfer, and students with AI or human help went back to the readings less. Bastani and Buçinca: see RESEARCH-COMPREHENSION.md section 4.

### 3.2 Measured versus design opinion

- **Measured:** feedback on your own explanation improves explanation quality, but only modestly, and mostly on transfer, not ordinary tests (Chen). Feedback helps those who use it (Thomas). Dialogue beats reading only when the text is too hard (VanLehn). Substituting AI for your own work lowers understanding (Lehmann, Bastani).
- **Design opinion or untested here:** that "an LLM that critiques rather than tells" is better than "an LLM that explains" *for reading research papers*. The evidence is in maths, physics and tutor training, with short answers. **No head-to-head test was found** of "write your explanation, get critique" against "read the AI's explanation" on papers. Kestin's tutor explained step by step and still did well, so "never explain" is not what the data says. What the data says is: the learner must still generate something.

### 3.3 Findings for question 2

| Finding | Evidence strength | What the tool could take |
|---|---|---|
| Writing your own explanation with LLM feedback improves the quality of later explanations on transfer problems (d = .44), but not ordinary test scores | Moderate: one randomised experiment, 92 people, calculus, one session | A reader-invoked "check my note" that critiques a note the reader wrote against the paper's own quotes. It never rewrites the note. |
| Menu-based (pick an explanation) did nothing; open writing did | Moderate: the same study | The reader writes; no multiple-choice explanations. |
| Feedback helps those who ask for it; being available alone did not help | Moderate: 885 learners, propensity-adjusted | Opt-in is right. Do not expect the feature to lift readers who never press it. |
| Dialogue beats reading only when the text is above the reader's level | Strong for its domain: 7 experiments | Research papers usually *are* above a student's level, which is the case where interaction pays. Keep the critique for the passages the reader has flagged. |
| Corrective feedback invites fix-to-pass behaviour without re-reading | Weak to moderate: Betty's Brain, 45 students; consistent with Lehmann | Critique should point back to the paper's own passage ("see §3.2, where …"), not state the corrected claim, so the fix requires re-reading. |
| A tutee that asks "why" and "how" produces more knowledge-building talk; an all-knowing tutee discourages teaching | Weak: 40 people, process measures only | A "why?" question about the reader's own note is closer to the evidence than an explanation of the passage. |
| Substituting AI for your own work lowers understanding; complementing it raises it; the gap widens with low prior knowledge | Moderate: two pre-registered experiments plus a field study | Principle 1 as it stands. |

## 4. AI support for connecting ideas

### 4.1 What was measured

- **Constructing against studying maps.** Schroeder et al. 2018 [A], 142 effect sizes and 11,814 learners: creating maps g = .72 and studying maps g = .43, *each against its own comparison condition*. That is a moderator analysis, not a head-to-head test. RESEARCH.md section 5 says constructing "beats" studying; the more careful reading is that both help, and constructing helps more against its usual comparisons.
- **Worked-out maps.** Hilbert and Renkl [S]: studying a correct expert map beat constructing one when learning from text, a "worked-out-map effect" parallel to worked examples.
- **Correcting and completing maps.** Chang, Sung and Chen 2002 [A], 126 fifth graders: **map correction** (fix an expert map seeded with errors) improved comprehension and summarisation. Scaffold fading improved summarisation. Generating from scratch did less. Soleimani and Nabizadeh 2012, 90 EFL students: fill-in-the-map beat summarising; learner-constructed and fill-in did not differ significantly. Weak design. Kit-Build [S]: learners assemble a map from given concepts and link labels; the same immediate comprehension as building from scratch and better two-week retention in small EFL studies.
- **Expert example plus reflection.** "Supporting reflection to improve learning from self-generated concept maps", 2022 [S]: adding an expert map with reflection prompts to students' own maps raised gains only when followed by a teacher-led discussion.
- **Concept mapping and calibration.** Yang et al. 2023: mapping and diagramming improved metacomprehension accuracy by about 0.20, among the largest single interventions.
- **LLM-generated concept maps.** Zhai's 2025 systematic review of 28 studies: validation is by precision, recall and expert review of the map. It found few rigorous tests of learning outcomes and calls for classroom trials. **No evidence yet that an LLM map helps a learner understand.**
- **Cross-paper tools.** None measured understanding:
  - **Relatedly** (n = 15): outlines judged more coherent and comprehensive than with a paper list.
  - **Threddy** (n = 9): flow and workload.
  - **CiteSee**: a lab study (n = 10) and a field study (n = 6) measured paper discovery, 2.7 times the previously reported rate.
  - **Synergi** (n = 12): outlines were rated 1.6 points higher (of 7) than ChatGPT-4's and 2.6 higher than the Threddy baseline. Judges found the GPT outlines "too generic". Synergi's framing that bottom-up work gives "learning by doing" and top-down gives overview is a design argument, not a measured learning effect.
- **Suggestion against prompt.** **No experiment was found that compares AI-suggested links with prompts to find them, on learning.** The nearest evidence:
  - Chang: correcting a given, imperfect map works.
  - Buçinca 2021 (n = 199): forcing people to think before seeing AI advice cut over-reliance and was the least liked.
  - Drosos et al. 2025 (n = 24): "provocations", short critiques attached to AI suggestions, induced critical and metacognitive thinking. The evidence is qualitative.
  - Betty's Brain: showing the agent's reasoning ("query") produced as many valid causal links as quiz feedback.

### 4.2 Findings for question 3

| Finding | Evidence strength | What the tool could take |
|---|---|---|
| Building a map helps; studying a finished one also helps, less so on average | Strong: two meta-analyses (a moderator, not a head-to-head) | The reader draws the edges, as now. |
| Correcting a flawed map or completing a partial one can beat building from scratch, especially for novices | Weak to moderate: small studies, children and EFL learners, mostly abstracts | The one form of "AI suggests a connection" with learning evidence: a proposal the reader must judge (accept, reject, relabel), ideally with some wrong proposals. Only if the owner chooses to relax Principle 1 (section 5). |
| Given parts assembled by the learner (Kit-Build) match building for comprehension and may retain better | Weak: small EFL studies [S] | A middle path: the tool offers *the pieces* (the reader's own cards) and a prompt such as "What connects these two?". The link and its label stay the reader's. |
| Mapping improves the reader's sense of what they do not understand | Strong: meta-analysis | Connecting is a calibration tool as well as a learning one. An unconnected card is a cue worth showing. |
| AI-generated concept maps are validated against expert maps, not against learning | Strong as a statement about the literature: a 28-study review | Do not assume an LLM map teaches. |
| Cross-paper tools improve discovery and outline quality; learning is unmeasured | Moderate for what they measured | Cross-paper linking may help productivity. Nothing here says it helps understanding. It is a later stage anyway (RESEARCH.md section 3). |
| No direct test of "suggest the link" against "prompt the reader to find it" | Gap | This is a study the owner could run: the same paper, the same reader pool, suggested edges against Socratic prompts, then a post-test on the relations. |

## 5. Where the findings conflict with Principle 1

Principle 1: "The reader does the work: AI may point and explain, never writes notes, connects, tags, groups."

Most of the evidence supports it. Substituting AI lowers understanding (Lehmann, Bastani). Menu-picked explanations do nothing and written ones help (Chen). Corrective hints produce fix-to-pass behaviour (Betty's Brain). Constructing maps is the stronger effect (Schroeder). Generated syntheses read as generic (Synergi). Four findings pull against it or sit outside it.

- **C1. Worked-out and correctable maps.** Showing a correct map (Hilbert and Renkl) or a flawed one to correct (Chang) helped, especially novices. That is the tool drawing connections. The version closest to the principle is the correction task: the AI proposes and the reader must decide, with nothing entering the board until the reader redraws or accepts it. It still means "AI connects" in a weak sense. **The owner decides.** The evidence is small and mostly from children.
- **C2. Feedback on notes.** Critiquing a note does not write it, so it fits "point and explain". Chen's design, though, shows a *reference explanation* after two failed attempts, and that is the AI writing the answer. D14 already says only a note the reader wrote clears a question. To stay inside the principle, the critique points back to quotes in the paper and never supplies the corrected sentence. That departs from the tested design, so it would be a variation to test, not a known effect.
- **C3. Proactive inference.** A system that detects confusion from logs and intervenes (Zone out) acts without being asked. The principle says AI acts "only when the reader has turned it on". The evidence also says such inference is weak for a single reader. Both point the same way: keep adaptation reader-invoked.
- **C4. Explaining AI can work.** Kestin's tutor explained step by step and beat an active-learning class. The principle already allows "explain". What the evidence adds is that the explanation should be scaffolded and interleaved with the learner producing something, not delivered as a finished paragraph.

## Sources

Question 1: learner modelling and inferring understanding
- Corbett and Anderson, [Knowledge tracing: modeling the acquisition of procedural knowledge](https://link.springer.com/article/10.1007/BF01099821), UMUAI 1994 [S]
- Piech et al., [Deep Knowledge Tracing](https://arxiv.org/abs/1506.05908), NeurIPS 2015
- Khajah, Lindsey and Mozer, [How deep is knowledge tracing?](https://arxiv.org/abs/1604.02416), EDM 2016 [A]
- Bhattacharyya et al., [Faster, Cheaper, More Accurate: Specialised Knowledge Tracing Models Outperform LLMs](https://arxiv.org/abs/2603.02830), 2026
- Gooding et al., [Predicting Text Readability from Scrolling Interactions](https://arxiv.org/abs/2105.06354), CoNLL 2021
- Winchell et al., Can textbook annotations serve as an early predictor of student learning?, EDM 2018 [S] ([Semantic Scholar](https://www.semanticscholar.org/paper/Textbook-annotations-as-an-early-predictor-of-Winchell-Mozer/ca4fc807db45e6feb2560443de3e2df4b6a61b0e))
- Kim et al., [Inferring student comprehension from highlighting patterns in digital textbooks](https://par.nsf.gov/biblio/10197702-inferring-student-comprehension-from-highlighting-patterns-digital-textbooks-exploration-authentic-learning-platform), Intelligent Textbooks 2020 [A]
- Kim, Scott, Basu Mallick and Mozer, [Using Semantics of Textbook Highlights to Predict Student Comprehension and Knowledge Retention](https://par.nsf.gov/servlets/purl/10292803), 2021
- Ahn et al., [Towards Predicting Reading Comprehension From Gaze Behavior](https://dl.acm.org/doi/10.1145/3379156.3391335), ETRA 2020 [S]
- Shubi et al., [Fine-Grained Prediction of Reading Comprehension from Eye Movements](https://arxiv.org/abs/2410.04484), EMNLP 2024 [A]
- Southwell, Mills, Caruso and D'Mello, [Gaze-based predictive models of deep reading comprehension](https://par.nsf.gov/servlets/purl/10443678), UMUAI 2022
- Faber, Bixler and D'Mello, [An automated behavioral measure of mind wandering during computerized reading](https://link.springer.com/article/10.3758/s13428-017-0857-y), Behavior Research Methods 2018 [A]
- D'Mello, Mills, Bixler and Bosch, [Zone out no more: Mitigating mind wandering during computerized reading](https://files.eric.ed.gov/fulltext/ED596617.pdf), EDM 2017
- Hijazi et al., [Dynamically predicting comprehension difficulties through physiological data and intelligent wearables](https://www.nature.com/articles/s41598-024-63654-z), Scientific Reports 2024
- [Says Who? How different ground truth measures of emotion impact student affective modeling](https://educationaldatamining.org/edm2024/proceedings/2024.EDM-long-papers.18/index.html), EDM 2024
- D'Mello, Graesser et al., [Multi-method assessment of affective experience and expression during deep learning](https://www.researchgate.net/publication/220497442_Multi-method_assessment_of_affective_experience_and_expression_during_deep_learning) [S]
- Yang, Zhao, Yuan, Luo and Shanks, [Mind the Gap between Comprehension and Metacomprehension: Meta-Analysis of Metacomprehension Accuracy and Intervention Effectiveness](https://discovery.ucl.ac.uk/id/eprint/10150804/) (author manuscript), 2023
- Dunlosky and Lipko, [Metacomprehension: A Brief History and How to Improve Its Accuracy](https://www.researchgate.net/publication/238069758_MetacomprehensionA_Brief_History_and_How_to_Improve_Its_Accuracy), 2007 [S]
- Fox, Ericsson and Best, [Do procedures for verbal reporting of thinking have to be reactive?](https://eric.ed.gov/?id=EJ933832), Psychological Bulletin 2011 [A]

Question 2: feedback on the learner's explanations
- Chen et al., [Practice Less, Explain More: LLM-Supported Self-Explanation Improves Explanation Quality on Transfer Problems in Calculus](https://arxiv.org/abs/2604.00142), 2026
- Thomas et al., [LLM-Generated Feedback Supports Learning If Learners Choose to Use It](https://arxiv.org/abs/2506.17006), 2025
- Aleven and Koedinger, [An effective metacognitive strategy: learning by doing and explaining with a computer-based Cognitive Tutor](https://onlinelibrary.wiley.com/doi/abs/10.1207/s15516709cog2602_1), Cognitive Science 2002 [S]
- McNamara, Levinstein and Boonthum, [iSTART: Interactive strategy training for active reading and thinking](https://link.springer.com/content/pdf/10.3758/BF03195567.pdf), 2004 [S]
- VanLehn et al., [When are tutorial dialogues more effective than reading?](https://onlinelibrary.wiley.com/doi/abs/10.1080/03640210709336984), Cognitive Science 2007 [A]
- VanLehn, [The relative effectiveness of human tutoring, intelligent tutoring systems, and other tutoring systems](https://www.tandfonline.com/doi/abs/10.1080/00461520.2011.611369), Educational Psychologist 2011 [S]
- Kestin et al., [AI tutoring outperforms in-class active learning](https://www.nature.com/articles/s41598-025-97652-6), Scientific Reports 2025
- Roscoe and Chi, [Understanding Tutor Learning: Knowledge-Building and Knowledge-Telling](https://eric.ed.gov/?id=EJ782047), Review of Educational Research 2007 [S]
- Fiorella and Mayer, [The relative benefits of learning by teaching and teaching expectancy](https://www.researchgate.net/publication/247768656_The_relative_benefits_of_learning_by_teaching_and_teaching_expectancy), 2013 [S]
- Jin et al., [Teach AI How to Code: Using Large Language Models as Teachable Agents for Programming Education](https://arxiv.org/abs/2309.14534), CHI 2024
- Biswas, Leelawong, Schwartz, Vye and TAG-V, [Learning by teaching: a new agent paradigm for educational software](https://aaalab.stanford.edu/assets/papers/2005/Learning_by_teaching_a_new_agent_paradigm.pdf), Applied AI 2005
- Lehmann, Cornelius and Sting, [AI Meets the Classroom: When Do Large Language Models Harm Learning?](https://arxiv.org/abs/2409.09047), 2025
- Fan et al., [Beware of metacognitive laziness](https://research.monash.edu/en/publications/beware-of-metacognitive-laziness-effects-of-generative-artificial/), BJET 2024 [S]
- Bastani et al., [Generative AI without guardrails can harm learning](https://www.pnas.org/doi/10.1073/pnas.2422633122), PNAS 2025 [A] (covered in RESEARCH-COMPREHENSION.md)

Question 3: connecting ideas
- Schroeder, Nesbit, Anguiano and Adesope, [Studying and Constructing Concept Maps: a Meta-Analysis](https://link.springer.com/article/10.1007/s10648-017-9403-9), Educational Psychology Review 2018 [A]
- Hilbert and Renkl, [Concept mapping for learning from text: Evidence for a worked-out-map effect](https://www.researchgate.net/publication/220934647_Concept_mapping_for_learning_from_text_Evidence_for_a_worked-out-map-_effect) [S]
- Chang, Sung and Chen, [The Effect of Concept Mapping to Enhance Text Comprehension and Summarization](https://eric.ed.gov/?id=EJ660226), Journal of Experimental Education 2002 [A]
- Soleimani and Nabizadeh, [The Effect of Learner Constructed, Fill in the Map Concept Map Technique, and Summarizing Strategy on Reading Comprehension](https://files.eric.ed.gov/fulltext/EJ1079947.pdf), 2012
- Kit-Build: [Comparison between Kit-Build and Scratch-Build Concept Mapping Methods in Supporting EFL Reading Comprehension](https://www.researchgate.net/publication/275721601_Comparison_between_Kit-Build_and_Scratch-Build_Concept_Mapping_Methods_in_Supporting_EFL_Reading_Comprehension) [S]
- [Supporting reflection to improve learning from self-generated concept maps](https://link.springer.com/article/10.1007/s11409-022-09299-7), Metacognition and Learning 2022 [S]
- Zhai, [Generative Large Language Models for Knowledge Representation: A Systematic Review of Concept Map Generation](https://arxiv.org/abs/2509.14554), 2025
- Palani et al., [Relatedly: Scaffolding Literature Reviews with Existing Related Work Sections](https://arxiv.org/abs/2302.06754), CHI 2023
- Kang et al., [Threddy: An Interactive System for Personalized Thread-based Exploration and Organization of Scientific Literature](https://arxiv.org/abs/2208.03455), UIST 2022
- Chang et al., [CiteSee: Augmenting Citations in Scientific Papers with Persistent and Personalized Historical Context](https://arxiv.org/abs/2302.07302), CHI 2023
- Kang et al., [Synergi: A Mixed-Initiative System for Scholarly Synthesis and Sensemaking](https://arxiv.org/abs/2308.07517), UIST 2023
- Buçinca, Malaya and Gajos, [To Trust or to Think: Cognitive Forcing Functions Can Reduce Overreliance on AI](https://arxiv.org/abs/2102.09692), CSCW 2021
- Drosos et al., ["It makes you think": Provocations Help Restore Critical Thinking to AI-Assisted Knowledge Work](https://arxiv.org/abs/2501.17247), 2025
- Scheuer, Loll, Pinkwart and McLaren, [Computer-supported argumentation: A review of the state of the art](https://link.springer.com/article/10.1007/s11412-009-9080-x), ijCSCL 2010 (not read; listed for the argument-mapping tools it surveys)
