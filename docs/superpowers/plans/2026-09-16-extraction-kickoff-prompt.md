# Kickoff prompt: execute the extraction plan

Paste everything below the line into a fresh Claude Code session opened in this repo.

---

Execute the implementation plan at `docs/superpowers/plans/2026-09-15-extraction.md` using the `superpowers:subagent-driven-development` skill. Invoke that skill first and follow it exactly: one fresh subagent per task, tests written before code, the two-stage review between tasks, one commit per task.

Before dispatching anything:

1. Read `docs/SPEC.md` in full and `docs/SPEC-ADDENDUM.md` sections 2, 3, and 8. The plan argues from them. Where the plan and the addendum disagree, the addendum wins.
2. Read `docs/superpowers/plans/2026-09-15-extraction-verification.md`. Its five fixes are already folded into the plan; read it so you know why the plan says what it says and which lines are load-bearing.
3. Use the `superpowers:using-git-worktrees` skill to work on a branch off `claude/serene-albattani-r85tze`. Do not push.

Rules for every subagent prompt you write:

- Give the subagent the full text of its task from the plan, plus the Global Constraints block and the File Structure block. A subagent sees only what you send it.
- Tell it the exact interfaces it consumes from earlier tasks, copied from the task's Interfaces block, so names and types match across tasks.
- Require the red-green cycle in order: write the failing test, run it and show the failure, write the minimal code, run it and show the pass, commit. A subagent that reports a pass without showing the run has not finished.
- No network during tests. Task 1 downloads three fixture PDFs from arXiv once; nothing else touches the network.
- Python 3.12. The pinned triplet `pymupdf == pymupdf4llm == pymupdf-layout == 1.28.2` is exact; a mismatch raises on import.
- Nothing generates text, nothing edits the PDF, nothing hand-edits `source.json`.

Two places the plan tells you to stop and look rather than trust a green test. Do both yourself, not through a subagent, and record what you saw in the commit message:

- After Task 8: run `paperboard extract` on `adam.pdf` and read the section titles. Are the boundaries right?
- After Task 9: run `scripts/render_clips.py` on `resnet.pdf` and open the PNGs. Are the figures found and paired with their captions?

When every task is committed and `pytest` is green with no network, use the `superpowers:finishing-a-development-branch` skill and report back with: the branch name, the test count, the answers to the two questions above, and anything in the plan that turned out wrong.

Do not touch `docs/SPEC.md` or `docs/SPEC-ADDENDUM.md`. If a task cannot be completed as written, stop and say what is wrong instead of improvising around it.
