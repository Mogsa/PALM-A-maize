# Bring your own agent: the library folder as a workspace for any AI agent

30 September 2026. Chosen by the owner the same day, instead of wiring each AI provider into the app.

## Goal, in one sentence

Anyone can open their `~/PaperBoard` folder in the agent they already use (Antigravity, Claude Code, Cursor,
Codex) and have it read the paper and their own notes and write AI notes back, with git showing every change
as a diff and the app showing the agent's notes marked AI, placed only when the reader chooses.

## Why

- Paper Board already keeps everything as plain files: an agent can read them like a code repo.
- No code per provider; each person uses their own subscription the normal way.
- Git in the library folder gives a diff of everything an agent changes.

## What is added

1. **Instructions at the library root.** `AGENTS.md`, plus `GEMINI.md` and `CLAUDE.md` that each say
   "Read AGENTS.md", written by the server when it opens a library that has none. An existing file is never
   overwritten. `AGENTS.md` says, in plain words:
   - what each file in `papers/<id>/` is (paper.pdf, paper.md, board.md, notes/, activity.jsonl, ai.json…);
   - **read freely; write only into `papers/<id>/agent/`**; never edit `board.json`, `notes/`, `view.json`,
     `source.json`, `ai.json` or any log;
   - how to write an agent note (below); keep the reader's own words and thinking theirs: explain, point to
     the paper, suggest; don't write their answers;
   - quote the paper exactly and say where (page and section), so the reader can check.
2. **`papers/<id>/paper.md`**: the paper's text by section, from `source.json`, written when a paper is
   extracted and, for older papers, when the server first serves them. Rewritten when the source changes.
3. **`papers/<id>/board.md`**: the reader's own layer in reading order, the same text Export makes, rewritten
   after every save of the board or of a note. Only the reader's things (no AI notes, nothing from ai.json).
4. **Agent notes**: an agent writes Markdown files into `papers/<id>/agent/`, each with optional front
   matter:
   ```markdown
   ---
   on: h-01ABC…        # optional: a highlight, note or piece id from board.md this note is about
   title: Why lava is avoided
   ---
   The designer's reward says nothing about lava … (p. 2, §1)
   ```
5. **An Agent notes panel** in the app (⌘K → "Agent notes", and a top-bar badge with a count, shown only
   when there are any): the notes, newest first, each marked AI with its title, text, file name and the thing
   it is `on` as a chip (click to jump). Each has **Put on board**: it becomes a note on the board with
   `origin: "ai"`, connected to its `on` target if any, and the file is marked placed (moved to
   `agent/placed/`). The panel re-reads the folder when opened and every 5 s while open.

## Rules kept

- Principle 1: nothing an agent writes reaches the board unless the reader puts it there, and it stays marked
  AI. The reader's notes are never edited.
- Principle 5: files stay local; git is the reader's choice.

## Server

- `GET /api/papers/{id}/agent-notes` → `[{file, title, on, text, modified}]`, newest first; unknown or
  malformed front matter is treated as none.
- `POST /api/papers/{id}/agent-notes/{file}/placed` → moves it to `agent/placed/`. File names are checked
  (no path separators, `.md` only).
- `paper.md` / `board.md` writers in one module; board.md written after PUT board and PUT note.
- Library-root instruction files written on startup if missing.

## Testing

- pytest: instruction files created once and never overwritten; paper.md sections in order; board.md after a
  board save and a note save, reader-only; agent notes listed newest first with front matter parsed, bad names
  refused, placed moves the file.
- vitest: panel lists, marks AI, chip jumps, Put on board dispatches one AI note (connected when `on` is set)
  and calls placed; badge count.
- e2e: write a file into `agent/` on disk, the badge appears, Put on board makes an AI note connected to its
  highlight.
