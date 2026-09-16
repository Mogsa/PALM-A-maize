# Kickoff prompt: execute the API plan, then the two frontend plans

Three plans follow build step 1, in this order, each in its own fresh Claude Code session
opened in this repo. Paste the block below the line, replacing `<PLAN>` with the plan file
for that session:

1. `docs/superpowers/plans/2026-09-16-api-and-storage.md`
2. `docs/superpowers/plans/2026-09-16-frontend-core.md` (after 1 is merged)
3. `docs/superpowers/plans/2026-09-16-frontend-features.md` (after 2 is merged)

---

Execute the implementation plan at `<PLAN>` using the `superpowers:subagent-driven-development` skill. Invoke that skill first and follow it exactly: one fresh subagent per task, tests written before code, the two-stage review between tasks, one commit per task.

Before dispatching anything:

1. Read `docs/SPEC.md` in full and `docs/SPEC-ADDENDUM.md` sections 2, 4, 5, 6, 7, 8. The plan argues from them. Where the plan and the addendum disagree, the plan is newer; its last section lists the differences, and you apply them to the addendum in your final commit.
2. Read `docs/superpowers/plans/2026-09-15-extraction-verification.md` and `docs/superpowers/plans/2026-09-16-frontend-spike-findings.md` if it exists. They record where earlier plans were wrong about a library and why; the rule they teach is that a test derived from a measurement asserts only what was measured, on every fixture it runs over.
3. Use the `superpowers:using-git-worktrees` skill to work on a branch off `claude/serene-albattani-r85tze`. Do not push.
4. Run `python scripts/fetch_fixtures.py` once in the worktree's virtual environment. The fixture papers are not committed.

Rules for every subagent prompt you write:

- Give the subagent the full text of its task from the plan, plus the Global Constraints block and the File Structure block. A subagent sees only what you send it.
- Tell it the exact interfaces it consumes from earlier tasks, copied from the task's Interfaces block, so names and types match across tasks.
- Require the red-green cycle in order: write the failing test, run it and show the failure, write the minimal code, run it and show the pass, commit. A subagent that reports a pass without showing the run has not finished.
- No network during tests. Only the fixture fetch script and the frontend's `npm install` touch the network, once each.
- Nothing generates text, nothing edits the PDF, nothing hand-edits `source.json`, nothing pushes.
- If a plan step names a library call that does not behave as the plan says, stop and measure it in a scratch script before changing either the test or the code, then record what you measured in the commit message. Do not weaken a test to make it pass.

The plan's "Done when" section has checks that a green test suite does not cover. Do those yourself, not through a subagent, and record what you saw in the commit message.

When every task is committed and the suite is green with no network, use the `superpowers:finishing-a-development-branch` skill and report back with: the branch name, the test count, the "Done when" answers, and anything in the plan that turned out wrong.

Do not touch `docs/SPEC.md`. Touch `docs/SPEC-ADDENDUM.md` only to apply the amendments the plan itself lists. If a task cannot be completed as written, stop and say what is wrong instead of improvising around it.
