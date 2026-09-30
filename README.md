# Paper Board

A tool for taking a CS paper apart so its ideas can be laid out, connected and understood. It works like
cutting a printed paper into pieces, spreading them on a desk and writing notes beside them, except that
nothing is destroyed and every piece remembers where it came from. Everything runs on your own machine,
and your boards are plain files in a folder.

Why it is built the way it is: `docs/SPEC.md` (the design), `docs/RESEARCH.md` (how people read papers)
and `docs/TOOLS.md` (what other reading tools do well and badly).

## Set up (once, about 5 minutes)

Works on macOS, Linux and Windows. Use **Chrome**; Safari is not supported yet.

**1. Install uv** (it installs the right Python for you):

```bash
# macOS / Linux
curl -LsSf https://astral.sh/uv/install.sh | sh
# Windows (PowerShell)
powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"
```

Close and reopen the terminal afterwards.

**2. Get the code:**

```bash
git clone https://github.com/Mogsa/PALM-A-maize.git
cd PALM-A-maize
uv sync
```

The frontend is already built into `web/dist`, so you don't need Node to read papers.

## Start it

From the `PALM-A-maize` folder:

```bash
uv run paperboard serve --root ~/PaperBoard
```

Open **http://127.0.0.1:8765** in Chrome, and choose **Add paper…** in the paper picker to open a PDF.
`~/PaperBoard` is where your boards are kept (it's made when you add your first paper). Stop the server
with Ctrl+C; your work is already saved.

## AI help (optional)

Everything works without AI. With it, you get jargon explained in place, **Define** on any word, and
**Key sentences**: the paper's own key sentences highlighted and listed by what they do (problem, main point,
evidence…), each a click away. The AI never writes your notes, and everything it shows is marked AI.

Paper Board uses your own Claude access. Pick **one** of these:

**Option A: you have a Claude Pro or Max subscription.** Install Claude Code and log in once:

```bash
# macOS / Linux
curl -fsSL https://claude.ai/install.sh | bash
# or, with Node installed, on any system:
npm install -g @anthropic-ai/claude-code

claude        # log in when it asks, then type /exit
```

Paper Board then uses your subscription. It runs Claude in an empty folder with no tools, so it can't see
or touch anything else on your computer.

**Option B: an API key** (pay per use). Create a key at https://console.anthropic.com, then save it:

```bash
mkdir -p ~/.config/paperboard
echo "sk-ant-...your key..." > ~/.config/paperboard/anthropic_key
chmod 600 ~/.config/paperboard/anthropic_key
```

(Or set `ANTHROPIC_API_KEY` in your environment.) Each paper costs one larger call the first time AI help is
turned on for it, plus a small one per **Define**.

**Check it worked:** the second line `serve` prints says which one it found, for example
`AI help: your Claude Code login`. Then, in the app, press **⌘K** (Ctrl+K on Windows) → **Turn AI help on**.
AI help is off by default and set per paper. Every AI call is logged to `papers/<id>/ai-log.jsonl`.

## Using your own AI agent

Your library is plain files, so the AI agent you already use can read it. Open `~/PaperBoard` as a folder in
Antigravity, Claude Code, Cursor or Codex, and ask it about a paper ("what problem does the residual paper
solve?"). It finds `AGENTS.md` at the top, which tells it where things are: `paper.md` (the paper's text by
section) and `board.md` (your highlights and notes) in each paper's folder. It writes its notes only into that
paper's `agent/` folder.

In the app, an **Agent notes** button appears with a count when there are any (also **⌘K → Agent notes**). Each
note is marked AI; **Put on board** makes it a note on your board, connected to the highlight it is about. Nothing
an agent writes reaches your board unless you put it there.

To see every change an agent makes as a diff, make the library a git repository once:

```bash
cd ~/PaperBoard && git init && git add -A && git commit -m "before the agent"
```

## Using it

- **Paper | Both | Board** at the top switches views. **Both** shows the paper and the board side by side.
- **Select text** on the paper to get a bar: a colour dot highlights it (the colour is its tag), ✂ cuts it
  onto the board, and 🔍 finds the word elsewhere in the paper. You can also drag the selection onto the board.
- **Drag a rectangle** around a figure, table or equation to cut it.
- **On the board:** double-click empty space for a note, drag from a card's edge to connect it, Shift+drag
  to lasso-select, and drag empty space to pan. Scrolling zooms.
- **⌘K** lists every other command, including Export, Tags, Template and AI help. **?** shows the shortcuts.
- A new board opens with a set of empty question slots (the template). Fill them, rename them or delete them.

## Working on the code

```bash
uv sync --extra dev                   # Python tests and linter
uv run pytest && uv run ruff check .
cd web && npm install
npm test                              # unit tests (vitest)
npm run e2e                           # browser tests (Playwright); needs 8765 and 4173 free
npm run build                         # rebuild web/dist, and commit it with your change
```

To run the e2e tests while your own server is using the default ports, set
`PAPERBOARD_API_PORT=8781 PAPERBOARD_WEB_PORT=4181`.

Backend: `src/paperboard/` (FastAPI and PDF extraction with PyMuPDF). Frontend: `web/src/` (React,
React Flow and react-pdf). Design notes and plans are in `docs/superpowers/`.

## Licence

AGPL-3.0 (see `LICENSE`), as required by PyMuPDF, which Paper Board uses to read PDFs.
