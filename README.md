# Paper Board

A tool for taking a CS paper apart so its ideas can be laid out, connected and understood. It works like
cutting a printed paper into pieces, spreading them on a desk and writing notes beside them, except that
nothing is destroyed and every piece remembers where it came from. Everything runs on your own machine,
and your boards are plain files in a folder.

Why it is built the way it is: `docs/SPEC.md` (the design), `docs/RESEARCH.md` (how people read papers)
and `docs/TOOLS.md` (what other reading tools do well and badly).

## Set up (once)

You need [uv](https://docs.astral.sh/uv/), which also installs the right Python for you:

```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
git clone https://github.com/Mogsa/PALM-A-maize.git
cd PALM-A-maize
uv sync
```

The frontend is already built and included in `web/dist`, so you don't need Node just to read papers.

## Start it

Run this from the repo folder:

```bash
uv run paperboard serve --root ~/PaperBoard
```

Then open **http://127.0.0.1:8765 in Chrome**. Safari isn't supported yet.

`--root` is the folder where your boards live. It's created when you add your first paper. Add a paper with
**Add paper…** in the paper picker, or from the terminal:

```bash
uv run paperboard extract some-paper.pdf --out ~/PaperBoard/papers
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

## AI help (optional, off by default)

Turn it on per paper with **⌘K → AI help**. It underlines jargon with definitions grounded in the paper,
lets you **Define** a word you select, and puts a 📍 on each slot showing where the paper answers it. The
AI marks everything it adds and never writes your notes for you.

It uses the first of these it finds:

1. an Anthropic API key, from `ANTHROPIC_API_KEY` or the file `~/.config/paperboard/anthropic_key`;
2. your **Claude Code** login. Install [Claude Code](https://claude.com/claude-code) and run `claude` once
   to log in. The server runs `claude -p` in an empty folder with no tools, so it uses your own plan.

The first line `serve` prints says which one is in use. Every AI call is logged to
`papers/<id>/ai-log.jsonl`.

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
