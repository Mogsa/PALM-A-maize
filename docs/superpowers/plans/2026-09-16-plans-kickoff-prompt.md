# Kickoff prompts: four sessions for the three remaining plans

Four fresh Claude Code sessions, each opened in this repo. At most two run at once:

| Session | Runs | Starts when |
|---|---|---|
| A | API and storage plan, all tasks | now |
| B | Frontend core, Tasks 1 to 3 only | now, beside A |
| C | Frontend core, Tasks 4 to 7, on B's branch | A is merged |
| D | Frontend features, all tasks | C is merged |

The rules block at the end is shared. Each session prompt tells the session to read it.

## Session A

```
Execute docs/superpowers/plans/2026-09-16-api-and-storage.md, all nine tasks, using the
superpowers:subagent-driven-development skill. First read the "Shared rules" section of
docs/superpowers/plans/2026-09-16-plans-kickoff-prompt.md and follow every rule in it.
Work in a worktree on a branch named api off claude/serene-albattani-r85tze. Do not push.
When finished, use superpowers:finishing-a-development-branch and merge locally.
```

## Session B

```
Execute Tasks 1, 2 and 3 only of docs/superpowers/plans/2026-09-16-frontend-core.md, using
the superpowers:subagent-driven-development skill. First read the "Shared rules" section of
docs/superpowers/plans/2026-09-16-plans-kickoff-prompt.md and follow every rule in it.
Work in a worktree on a branch named frontend-core off claude/serene-albattani-r85tze.
These three tasks need no server; do not start Task 4. Stop after Task 3 is committed and
reviewed, keep the branch unmerged, and report the spike findings file in full. Do not push.
```

## Session C

```
The branch frontend-core has Tasks 1 to 3 of docs/superpowers/plans/2026-09-16-frontend-core.md
committed, and the API plan is now merged into claude/serene-albattani-r85tze. Check out
frontend-core in a worktree, rebase it onto claude/serene-albattani-r85tze, and execute
Tasks 4, 5, 6 and 7 using the superpowers:subagent-driven-development skill. First read the
"Shared rules" section of docs/superpowers/plans/2026-09-16-plans-kickoff-prompt.md and
follow every rule in it, and read docs/superpowers/plans/2026-09-16-frontend-spike-findings.md
before Task 4: if it contradicts the plan, stop and say so. Do not push. When finished, use
superpowers:finishing-a-development-branch and merge locally.
```

## Session D

```
Execute docs/superpowers/plans/2026-09-16-frontend-features.md, all six tasks, using the
superpowers:subagent-driven-development skill. First read the "Shared rules" section of
docs/superpowers/plans/2026-09-16-plans-kickoff-prompt.md and follow every rule in it.
Work in a worktree on a branch named frontend-features off claude/serene-albattani-r85tze.
Do not push. When finished, use superpowers:finishing-a-development-branch, run SPEC.md
section 11 by hand on a paper of the reader's choosing, and merge locally.
```

## Shared rules

Invoke `superpowers:subagent-driven-development` first and follow it exactly: one fresh subagent per task, tests written before code, the two-stage review between tasks, one commit per task.

Before dispatching anything:

1. Read `docs/SPEC.md` in full and `docs/SPEC-ADDENDUM.md` sections 2, 4, 5, 6, 7, 8. The plan argues from them. Where the plan and the addendum disagree, the plan is newer; its last section lists the differences, and you apply them to the addendum in your final commit.
2. Read `docs/superpowers/plans/2026-09-15-extraction-verification.md` and `docs/superpowers/plans/2026-09-16-frontend-spike-findings.md` if it exists. They record where earlier plans were wrong about a library and why; the rule they teach is that a test derived from a measurement asserts only what was measured, on every fixture it runs over.
3. Use the `superpowers:using-git-worktrees` skill for the worktree and branch your session prompt names. Do not push.
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
