# UI Restyle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Tasks 2 and 3 touch disjoint files and are meant to run in parallel, each in its own worktree, after Task 1 has landed.

**Goal:** The existing web app, unchanged in behaviour, restyled as a minimalist, modern, intuitive reading tool: a calm paper view, a board of readable cards, and controls that explain themselves, built on design tokens the features plan will inherit.

**Architecture:** One stylesheet becomes four: `tokens.css` (the only place a colour, font, radius or shadow is defined), `shell.css` (top bar, start screen, status), `paper.css` (pages, marks, outlines, popover), `board.css` (cards, groups, handles, toolbar). Components change only where the skin needs a hook: a page badge and overflow fade on chunks, a text preview and Escape on the popover, a name pill on groups, an empty-board hint. Every selector the end-to-end specs use is kept.

**Tech Stack:** As the core plan: React 19, TypeScript, Vite, `@xyflow/react` 12, `react-pdf` 11, vitest, Playwright. No new dependencies. No web fonts: the app loads nothing from the network, so type is the system stack and a system serif.

**Spec:** `docs/SPEC.md` sections 4 and 5 for what each view is; `docs/superpowers/plans/2026-09-16-frontend-core.md` for the components; the design brief in the "Design" section below.

## Global Constraints

- **Behaviour does not change.** Every unit test and every end-to-end spec passes unmodified, except where a task below adds a test. Selectors the specs use and must survive: `select`, `.notice` with text `Saved v<n>`, `.popover`, buttons named `Highlight`, `Cut`, `Board`, `Paper`, `.overlay .mark`, `.overlay .outline[data-node-id]`, `.outline-tab`, `.node.chunk`, `.node-body`, `.title`, `[data-testid=open-source]`, titles `Expand` and `Collapse`, `mark`.
- **Local only.** No external stylesheet, font, script or image. Icons are inline SVG or text glyphs.
- **Tokens only.** No colour, font, radius or shadow literal outside `tokens.css`. A reviewer greps `#[0-9a-f]{3,6}` and `rgba(` in the other CSS files and finds nothing.
- **Nothing is forced.** No new dialogs, no onboarding, no tour. One hint line on an empty board, nothing else that talks.
- **Files stay under 300 lines**, and each task modifies only the files it lists, so Tasks 2 and 3 merge without conflicts.

## Design

The brief is minimalist, functional, modern, intuitive. Concretely:

- **Two grounds, so the view is always obvious.** Paper view sits on a warm off-white like a desk; the board on a cool light grey with a faint dot grid. Cards and pages are white.
- **Two typefaces, so the paper's words are always distinguishable from the tool's.** The tool speaks in the system sans. Text that came from the paper, inside chunks, is set in a system serif at a reading size.
- **Colour means something or is absent.** Yellow is a highlight. Blue is a cut region and its card. Amber is a piece that moved; red is a piece that is lost. Nothing else is coloured; tags bring their own colours later.
- **Controls are quiet until needed.** Handles, the open-in-paper arrow and the resize corners appear on hover. The save state is a dot that reads at a glance and a word for those who look.
- **Density suits reading.** Cards show a page badge, a first-line title, and the text, with a fade where there is more.

---

## File Structure

```
web/src/styles.css                 # four @imports, nothing else
web/src/styles/tokens.css          # :root custom properties; the only literals
web/src/styles/shell.css           # .app, .topbar, .start, .segmented, .notice
web/src/styles/paper.css           # .paper, .page-wrap, .overlay, .mark, .outline, .popover, .selection-error
web/src/styles/board.css           # .board, .node*, .group*, handles, resizer, .board-tools, .empty-hint
web/src/App.tsx                    # Task 1: top bar and start screen markup
web/src/paper/SelectionPopover.tsx # Task 2: preview line, Escape
web/src/PaperScreen.tsx            # Task 2: passes the selected text to the popover
web/src/paper/PageOverlay.tsx      # Task 2: outline tab becomes a labelled button
web/src/paper/PaperView.tsx        # Task 2: loading state markup
web/src/paper/preview.ts           # Task 2: previewText()
web/src/paper/preview.test.ts
web/src/board/nodes/ChunkNode.tsx  # Task 3: page badge, overflow fade
web/src/board/nodes/FigureNode.tsx # Task 3: page badge
web/src/board/nodes/NoteNode.tsx   # Task 3: head styling hooks
web/src/board/nodes/GroupNode.tsx  # Task 3: name pill
web/src/board/BoardView.tsx        # Task 3: toolbar, empty hint
web/src/board/overflow.ts          # Task 3: useOverflow()
web/src/board/overflow.test.ts
web/e2e/restyle.spec.ts            # Task 4: the new behaviour, end to end
```

---

### Task 1: Tokens, the stylesheet split, and the shell

**Files:**
- Create: `web/src/styles/tokens.css`, `web/src/styles/shell.css`, `web/src/styles/paper.css`, `web/src/styles/board.css`
- Modify: `web/src/styles.css`, `web/src/App.tsx`

**Interfaces:**
- Produces: the token names below, which Tasks 2 and 3 use and never redefine. `paper.css` and `board.css` are created here holding the current rules moved verbatim, so Tasks 2 and 3 each rewrite one file they own.

- [ ] **Step 1: Write `web/src/styles/tokens.css`**

```css
/* The only file with literal colours, fonts, radii or shadows. Everything else uses these names. */
:root {
  /* grounds and surfaces */
  --bg-paper: #f3f1ec;          /* the desk the paper lies on: warm */
  --bg-board: #f6f7f9;          /* the board: cool */
  --bg-board-dot: #d9dde3;
  --surface: #ffffff;
  --surface-muted: #f4f5f7;
  --border: #e3e5e9;
  --border-strong: #c9cdd3;

  /* text */
  --ink: #1b1f24;
  --ink-muted: #6b7280;
  --ink-faint: #9aa1ab;

  /* meaning */
  --hl: rgba(255, 224, 76, 0.55);        /* a highlight on the paper and in a card */
  --hl-solid: #f5d445;
  --cut: #2f6fed;                        /* a cut region and its card */
  --cut-tint: rgba(47, 111, 237, 0.07);
  --cut-edge: rgba(47, 111, 237, 0.6);
  --moved: #b7791f;                      /* a piece the paper's text moved under */
  --lost: #c53030;                       /* a piece whose text is gone */
  --ok: #2f855a;
  --focus: rgba(47, 111, 237, 0.35);

  /* type */
  --font-ui: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  --font-read: Charter, "Iowan Old Style", "Palatino Linotype", Georgia, "Times New Roman", serif;
  --font-mono: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
  --text-ui: 13px;
  --text-ui-small: 11.5px;
  --text-read: 13.5px;
  --leading-read: 1.5;

  /* shape */
  --radius: 8px;
  --radius-small: 5px;
  --radius-pill: 999px;
  --shadow-card: 0 1px 2px rgba(20, 24, 31, 0.06), 0 1px 1px rgba(20, 24, 31, 0.04);
  --shadow-raised: 0 4px 16px rgba(20, 24, 31, 0.12), 0 1px 3px rgba(20, 24, 31, 0.08);
  --shadow-page: 0 1px 3px rgba(20, 24, 31, 0.10), 0 8px 24px rgba(20, 24, 31, 0.06);

  /* layout */
  --topbar-height: 48px;
  --page-width: 760px;
}
```

- [ ] **Step 2: Write `web/src/styles/shell.css`**

```css
* { box-sizing: border-box; }
html, body, #root { height: 100%; }
body { margin: 0; font-family: var(--font-ui); font-size: var(--text-ui); color: var(--ink); background: var(--bg-board); -webkit-font-smoothing: antialiased; }
button, select, input, textarea { font: inherit; color: inherit; }
button { cursor: pointer; }
:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }

.app { display: grid; grid-template-rows: var(--topbar-height) 1fr; height: 100%; }

/* top bar: wordmark, paper title (a select in disguise), view switch, save state */
.topbar { display: flex; align-items: center; gap: 16px; padding: 0 16px; background: var(--surface); border-bottom: 1px solid var(--border); }
.wordmark { font-weight: 600; letter-spacing: 0.01em; color: var(--ink-muted); white-space: nowrap; }
.paper-title { flex: 1; min-width: 0; display: flex; align-items: center; gap: 6px; }
.paper-title select {
  appearance: none; -webkit-appearance: none; max-width: 100%; padding: 6px 28px 6px 8px; margin-left: -8px;
  border: 1px solid transparent; border-radius: var(--radius-small); background: transparent;
  font-weight: 600; font-size: 14px; text-overflow: ellipsis; cursor: pointer;
  background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'><path d='M3 4.5l3 3 3-3' fill='none' stroke='%236b7280' stroke-width='1.5' stroke-linecap='round'/></svg>");
  background-repeat: no-repeat; background-position: right 8px center;
}
.paper-title select:hover { border-color: var(--border); background-color: var(--surface-muted); }

.segmented { display: inline-flex; padding: 2px; border: 1px solid var(--border); border-radius: var(--radius-pill); background: var(--surface-muted); }
.segmented button { padding: 4px 12px; border: 0; border-radius: var(--radius-pill); background: transparent; color: var(--ink-muted); font-weight: 500; }
.segmented button[aria-pressed="true"] { background: var(--surface); color: var(--ink); box-shadow: var(--shadow-card); }

.notice { display: inline-flex; align-items: center; gap: 6px; font-size: var(--text-ui-small); color: var(--ink-muted); white-space: nowrap; }
.notice::before { content: ""; width: 7px; height: 7px; border-radius: 50%; background: var(--ok); }
.notice.unsaved::before { background: var(--ink-faint); }
.notice.warn::before { background: var(--moved); }

/* start screen: no paper chosen yet */
.start { display: grid; place-content: center; height: 100%; text-align: center; gap: 12px; }
.start h1 { margin: 0; font-size: 22px; font-weight: 600; }
.start p { margin: 0; color: var(--ink-muted); }
.start select { padding: 8px 12px; border: 1px solid var(--border-strong); border-radius: var(--radius-small); background: var(--surface); min-width: 320px; }
.start .how { margin-top: 12px; font-size: var(--text-ui-small); color: var(--ink-faint); }
.start .how code { font-family: var(--font-mono); }

.loading { display: grid; place-content: center; height: 100%; color: var(--ink-muted); }
```

- [ ] **Step 3: Create `paper.css` and `board.css` by moving the current rules**

`web/src/styles/paper.css` gets these rules from the current `styles.css`, verbatim: `.paper`, `.page-wrap`, `.overlay`, `.overlay .mark` and its variants, `.overlay .outline` and its variants, `.overlay .outline-tab` and its variant, `.popover` and its two sub-rules, `.selection-error`. Replace the literal colours in them with tokens as you move them: `#e9e9e6` becomes `var(--bg-paper)`, `#1d4ed8` becomes `var(--cut)`, `#a16207` becomes `var(--moved)`, `#b91c1c` becomes `var(--lost)`, `rgba(185, 28, 28, 0.25)` becomes `var(--lost)` at `opacity: .25` on the element, `#fff` becomes `var(--surface)`, `#bbb` becomes `var(--border-strong)`, `rgba(0,0,0,.2)` shadows become `var(--shadow-raised)`.

`web/src/styles/board.css` gets `.board`, `.board-tools`, `.node` and everything beginning `.node`, `.react-flow .react-flow__node-group`, `.group-name`, `button.quiet`, with the same token substitutions: `#999` becomes `var(--border-strong)`, `#eee` becomes `var(--border)`, `#666` becomes `var(--ink-muted)`, `rgba(0,0,0,.03)` becomes `var(--surface-muted)`.

`web/src/styles.css` becomes exactly:

```css
@import "./styles/tokens.css";
@import "./styles/shell.css";
@import "./styles/paper.css";
@import "./styles/board.css";
```

Delete the `:root`, `body`, `.app`, `.topbar`, `.notice` rules from the old file; `shell.css` replaces them.

- [ ] **Step 4: Rewrite the shell markup in `web/src/App.tsx`**

```tsx
import { useEffect, useState } from "react";
import { api } from "./api/client";
import { BoardView } from "./board/BoardView";
import { PaperScreen } from "./PaperScreen";
import { BoardProvider, useBoard } from "./state/BoardProvider";
import type { PageRect, PaperSummary } from "./model/types";
import "./styles.css";

function Notice() {
  const { notice, state } = useBoard();
  const tone = notice ? "warn" : state.dirty ? "unsaved" : "";
  return <span className={`notice ${tone}`}>{notice ?? (state.dirty ? "Unsaved" : `Saved v${state.board.version}`)}</span>;
}

function PaperPicker({ papers, value, onChange }: { papers: PaperSummary[]; value: string; onChange: (id: string) => void }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} aria-label="Paper">
      {value === "" && <option value="">Choose a paper</option>}
      {papers.map((p) => <option key={p.paper_id} value={p.paper_id}>{p.title}</option>)}
    </select>
  );
}

export default function App() {
  const [papers, setPapers] = useState<PaperSummary[]>([]);
  const [paperId, setPaperId] = useState<string | null>(null);
  const [view, setView] = useState<"paper" | "board">("paper");
  const [focusNode, setFocusNode] = useState<string | null>(null);
  const [focusRect, setFocusRect] = useState<PageRect | null>(null);
  useEffect(() => { api.listPapers().then(setPapers); }, []);

  const choose = (id: string) => { setFocusRect(null); setFocusNode(null); setPaperId(id || null); };

  if (!paperId) {
    return (
      <div className="app">
        <div className="topbar"><span className="wordmark">Paper Board</span></div>
        <div className="start">
          <h1>Choose a paper</h1>
          <p>Read it, mark it, cut it into pieces, and lay the pieces out.</p>
          <PaperPicker papers={papers} value="" onChange={choose} />
          <p className="how">Add a paper with <code>paperboard extract paper.pdf --out ~/paperboard-data/papers</code></p>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <BoardProvider key={paperId} paperId={paperId}>
        <div className="topbar">
          <span className="wordmark">Paper Board</span>
          <div className="paper-title"><PaperPicker papers={papers} value={paperId} onChange={choose} /></div>
          <div className="segmented" role="group" aria-label="View">
            <button aria-pressed={view === "paper"} onClick={() => setView("paper")}>Paper</button>
            <button aria-pressed={view === "board"} onClick={() => setView("board")}>Board</button>
          </div>
          <Notice />
        </div>
        {/* A fresh focusRect every time, so the paper view scrolls again even for the same chunk. */}
        {view === "paper"
          ? <PaperScreen focus={focusRect} onOpenOnBoard={(id) => { setFocusNode(id); setView("board"); }} />
          : <BoardView focusNode={focusNode} onFocusHandled={() => setFocusNode(null)} onOpenInPaper={(rect) => { setFocusRect({ ...rect }); setView("paper"); }} />}
      </BoardProvider>
    </div>
  );
}
```

The view switch is now two always-visible buttons, `Paper` and `Board`, with `aria-pressed`. The specs click `Board` by name; clicking it while already on the board is a no-op, which is what they expect.

- [ ] **Step 5: Run everything**

```bash
cd web && npx tsc -b && npm test && npm run build && PAPERBOARD_API_PORT=8790 PAPERBOARD_WEB_PORT=4190 npm run e2e
```

Expected: types clean, 69 unit tests, 4 e2e specs, all passing. Then grep for literals outside tokens:

```bash
grep -nE "#[0-9a-fA-F]{3,6}\b|rgba?\(" web/src/styles/shell.css web/src/styles/paper.css web/src/styles/board.css
```

Expected: no output.

- [ ] **Step 6: Commit**

```bash
git add web/src/styles.css web/src/styles web/src/App.tsx
git commit -m "style(web): design tokens, stylesheet split, and a quieter shell"
```

---

### Task 2: The paper view

**Files:**
- Create: `web/src/paper/preview.ts`, `web/src/paper/preview.test.ts`
- Modify: `web/src/styles/paper.css` (rewrite), `web/src/paper/SelectionPopover.tsx`, `web/src/PaperScreen.tsx`, `web/src/paper/PageOverlay.tsx`, `web/src/paper/PaperView.tsx`

**Interfaces:**
- Consumes: the tokens from Task 1.
- Produces: `previewText(text: string, max?: number): string`; `SelectionPopover` gains a required `preview: string` prop and dismisses on Escape; `PageOverlay`'s tab is a `<button class="outline-tab">` with an accessible name.

The paper view is "the PDF as printed" (SPEC.md section 4). The restyle keeps it that way: the page is untouched, and everything the reader added sits on it as a light wash or a thin edge.

- [ ] **Step 1: Write the failing test**

`web/src/paper/preview.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { previewText } from "./preview";

describe("previewText", () => {
  it("collapses whitespace and line breaks to single spaces", () => {
    expect(previewText("a  b\nc\n\nd")).toBe("a b c d");
  });
  it("cuts at a word boundary and adds an ellipsis when too long", () => {
    const out = previewText("the quick brown fox jumps over the lazy dog", 20);
    expect(out.length).toBeLessThanOrEqual(21);
    expect(out.endsWith("…")).toBe(true);
    expect(out).not.toContain("jum");
  });
  it("returns short text unchanged", () => {
    expect(previewText("short", 20)).toBe("short");
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd web && npm test -- preview`
Expected: FAIL, cannot resolve `./preview`.

- [ ] **Step 3: Write `web/src/paper/preview.ts`**

```ts
export const PREVIEW_CHARS = 90;

/** One line of the selected text for the popover, so the reader sees what a cut or
 *  highlight will hold before choosing. Browser selections follow the PDF's internal
 *  order, which on some papers pulls in a footer between two columns; seeing it here
 *  is how the reader notices. */
export function previewText(text: string, max: number = PREVIEW_CHARS): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max);
  const at = cut.lastIndexOf(" ");
  return (at > max / 2 ? cut.slice(0, at) : cut).trimEnd() + "…";
}
```

- [ ] **Step 4: Run the test**

Run: `cd web && npm test -- preview`
Expected: 3 passed.

- [ ] **Step 5: The popover and its callers**

`web/src/paper/SelectionPopover.tsx`:

```tsx
import { useEffect } from "react";

type Props = { at: DOMRect; preview: string; busy: boolean; canHighlight: boolean; onHighlight: () => void; onCut: () => void; onDismiss: () => void };

export const ONE_COLUMN_HINT = "A highlight covers one column on one page. Cut this, or highlight each column.";

const POPOVER_WIDTH = 300;

/** One selection, then a choice. No modes (SPEC.md section 4). A selection that crosses a column
 *  or a page is several rects, and a highlight anchor holds one, so Highlight is not offered. */
export function SelectionPopover({ at, preview, busy, canHighlight, onHighlight, onCut, onDismiss }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onDismiss(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onDismiss]);
  // Keep the popover on screen: below the selection's last line, never past the right edge.
  const left = Math.max(8, Math.min(at.right + 8, window.innerWidth - POPOVER_WIDTH - 8));
  return (
    <div className="popover" role="dialog" aria-label="Selection" style={{ left, top: at.bottom + 6 }} onMouseDown={(e) => e.stopPropagation()}>
      <div className="popover-preview" title={preview}>{preview}</div>
      <div className="popover-actions">
        <button className="action highlight" disabled={busy || !canHighlight} title={canHighlight ? "Mark this on the paper" : ONE_COLUMN_HINT} onClick={onHighlight}>
          <span className="swatch" aria-hidden="true" />Highlight
        </button>
        <button className="action cut" disabled={busy} title="Cut this out as a piece on the board" onClick={onCut}>
          <span className="glyph" aria-hidden="true">✂</span>Cut
        </button>
        <button className="quiet close" aria-label="Dismiss" onClick={onDismiss}>×</button>
      </div>
    </div>
  );
}
```

`web/src/PaperScreen.tsx`: the pending selection carries its text. Change the `Pending` type and the two places it is built:

```tsx
import { previewText } from "./paper/preview";

type Pending = { rects: PageRect[]; at: DOMRect; exact: boolean; preview: string };
```

```tsx
                 onSelect={(rects, at, exact) => {
                   setError(null);
                   setPending({ rects, at, exact, preview: previewText(window.getSelection()?.toString() ?? "") });
                 }}
```

```tsx
      {pending && <SelectionPopover at={pending.at} preview={pending.preview} busy={busy} canHighlight={pending.rects.length === 1} onHighlight={() => choose("highlight")} onCut={() => choose("cut")} onDismiss={() => setPending(null)} />}
```

`web/src/paper/PageOverlay.tsx`: the tab becomes a real button with a label, so it is findable and readable:

```tsx
          <button type="button" className="outline-tab" onClick={() => onOutlineClick(node.id)}
                  title={`Open on the board: ${node.data.region.start.exact.slice(0, 60)}`} aria-label="Open on the board">
            <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M2 8l6-6M4 2h4v4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
```

replacing the current `<div className="outline-tab" .../>`. Keep `data-node-id` on the outline.

`web/src/paper/PaperView.tsx`: replace `loading={<p>Loading paper</p>}` with `loading={<div className="loading">Loading the paper</div>}`.

- [ ] **Step 6: Rewrite `web/src/styles/paper.css`**

```css
/* the paper view: the PDF as printed, on a desk, with the reader's marks laid over it */
.paper { overflow: auto; height: 100%; background: var(--bg-paper); padding: 24px 0 48px; }
.page-wrap { position: relative; width: var(--page-width); margin: 0 auto 20px; background: var(--surface); box-shadow: var(--shadow-page); border-radius: 2px; }
.page-wrap .react-pdf__Page__textContent ::selection { background: var(--cut-tint); }

.overlay { position: absolute; inset: 0; pointer-events: none; }

/* a highlight: a soft wash that lets the print through */
.overlay .mark { position: absolute; background: var(--hl); mix-blend-mode: multiply; border-radius: 2px; }
.overlay .mark.relocated { outline: 1px dashed var(--moved); outline-offset: 1px; }
.overlay .mark.orphaned { background: var(--lost); opacity: 0.22; }

/* a cut region: a faint tint and a thin edge, with one small button to open it on the board */
.overlay .outline { position: absolute; border: 1px solid var(--cut-edge); background: var(--cut-tint); border-radius: 3px; pointer-events: none; }
.overlay .outline.relocated { border-color: var(--moved); }
.overlay .outline.orphaned { border-color: var(--lost); background: transparent; }
.overlay .outline-tab {
  position: absolute; top: -1px; left: -1px; width: 18px; height: 18px; padding: 0;
  display: grid; place-content: center; pointer-events: auto; cursor: pointer;
  border: 0; border-radius: 3px 0 var(--radius-small) 0; background: var(--cut); color: var(--surface); opacity: 0.8;
}
.overlay .outline-tab:hover { opacity: 1; }
.overlay .outline.relocated .outline-tab { background: var(--moved); }
.overlay .outline.orphaned .outline-tab { background: var(--lost); }

/* the choice after a selection */
.popover { position: fixed; z-index: 10; width: 300px; padding: 8px; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); box-shadow: var(--shadow-raised); }
.popover-preview { font-family: var(--font-read); font-size: 12.5px; color: var(--ink-muted); line-height: 1.4; margin: 2px 4px 8px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.popover-actions { display: flex; align-items: center; gap: 6px; }
.popover .action { display: inline-flex; align-items: center; gap: 6px; padding: 6px 10px; border: 1px solid var(--border); border-radius: var(--radius-small); background: var(--surface); font-weight: 500; }
.popover .action:hover:not(:disabled) { background: var(--surface-muted); border-color: var(--border-strong); }
.popover .action:disabled { opacity: 0.45; cursor: not-allowed; }
.popover .action .swatch { width: 12px; height: 12px; border-radius: 3px; background: var(--hl-solid); }
.popover .action .glyph { color: var(--cut); }
.popover .close { margin-left: auto; width: 26px; height: 26px; border: 0; border-radius: var(--radius-small); background: transparent; color: var(--ink-faint); font-size: 16px; }
.popover .close:hover { background: var(--surface-muted); color: var(--ink); }

.selection-error { position: fixed; bottom: 16px; left: 50%; transform: translateX(-50%); margin: 0; padding: 8px 14px; background: var(--surface); border: 1px solid var(--lost); border-radius: var(--radius-small); color: var(--lost); box-shadow: var(--shadow-raised); z-index: 10; cursor: pointer; }
```

- [ ] **Step 7: Run everything**

```bash
cd web && npx tsc -b && npm test && npm run build && PAPERBOARD_API_PORT=8791 PAPERBOARD_WEB_PORT=4191 npm run e2e
grep -nE "#[0-9a-fA-F]{3,6}\b|rgba?\(" web/src/styles/paper.css
```

Expected: all green; the grep prints nothing.

- [ ] **Step 8: Commit**

```bash
git add web/src/styles/paper.css web/src/paper web/src/PaperScreen.tsx
git commit -m "style(web): paper view with soft marks, tinted cuts, and a popover that shows the selection"
```

---

### Task 3: The board

**Files:**
- Create: `web/src/board/overflow.ts`, `web/src/board/overflow.test.ts`
- Modify: `web/src/styles/board.css` (rewrite), `web/src/board/nodes/ChunkNode.tsx`, `web/src/board/nodes/FigureNode.tsx`, `web/src/board/nodes/NoteNode.tsx`, `web/src/board/nodes/GroupNode.tsx`, `web/src/board/BoardView.tsx`

**Interfaces:**
- Consumes: the tokens from Task 1.
- Produces: `useOverflow(): [ref, overflowing]`, a hook that reports whether an element's content is taller than its box; `isOverflowing(scrollHeight: number, clientHeight: number): boolean`; chunk cards carry class `overflowing` when the fade should show; every card head has a `.badge` with the page number.

The board is the table (SPEC.md section 4). Cards should read like paper cuttings: quiet edges, the paper's words in a serif, and nothing competing with them.

- [ ] **Step 1: Write the failing test**

`web/src/board/overflow.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { isOverflowing, OVERFLOW_SLACK_PX } from "./overflow";

describe("isOverflowing", () => {
  it("is false when content fits, with a little slack for rounding", () => {
    expect(isOverflowing(100, 100)).toBe(false);
    expect(isOverflowing(100 + OVERFLOW_SLACK_PX, 100)).toBe(false);
  });
  it("is true when content is taller than the box", () => {
    expect(isOverflowing(320, 200)).toBe(true);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd web && npm test -- overflow`
Expected: FAIL, cannot resolve `./overflow`.

- [ ] **Step 3: Write `web/src/board/overflow.ts`**

```ts
import { useEffect, useRef, useState } from "react";

export const OVERFLOW_SLACK_PX = 2;

export function isOverflowing(scrollHeight: number, clientHeight: number): boolean {
  return scrollHeight - clientHeight > OVERFLOW_SLACK_PX;
}

/** Whether an element's content is taller than its box, kept current as the box resizes. */
export function useOverflow<T extends HTMLElement>(): [React.RefObject<T | null>, boolean] {
  const ref = useRef<T>(null);
  const [overflowing, setOverflowing] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => setOverflowing(isOverflowing(el.scrollHeight, el.clientHeight));
    check();
    const observer = new ResizeObserver(check);
    observer.observe(el);
    return () => observer.disconnect();
  });
  return [ref, overflowing];
}
```

- [ ] **Step 4: Run the test**

Run: `cd web && npm test -- overflow`
Expected: 2 passed.

- [ ] **Step 5: The node components**

`web/src/board/nodes/ChunkNode.tsx`:

```tsx
import { Handle, NodeResizer, Position, type NodeProps } from "@xyflow/react";
import { highlightsIn } from "../../model/geometry";
import type { ChunkNode as ChunkNodeType } from "../../model/types";
import { useBoard } from "../../state/BoardProvider";
import { paintMarks } from "../marks";
import { useOverflow } from "../overflow";

export function ChunkNode({ id, data, selected }: NodeProps<ChunkNodeType>) {
  const { state, dispatch } = useBoard();
  // NodeProps.height also includes automatic measurements; only a stored height fixes the box size.
  const height = state.board.nodes.find((node) => node.id === id)?.height;
  const marks = highlightsIn(state.board.highlights, data.region);
  const title = data.region.start.exact.split("\n")[0].slice(0, 80);
  const page = data.region.rects[0].page + 1;
  const [bodyRef, overflowing] = useOverflow<HTMLDivElement>();
  const toggle = () => {
    const node = state.board.nodes.find((n) => n.id === id)!;
    dispatch({ type: "replaceNode", node: { ...node, data: { ...data, collapsed: !data.collapsed } } as ChunkNodeType });
  };
  const classes = ["node", "chunk", data.region.state, height !== undefined && !data.collapsed ? "sized" : "", overflowing ? "overflowing" : ""].filter(Boolean).join(" ");
  return (
    <div className={classes}>
      <NodeResizer isVisible={selected && !data.collapsed} minWidth={200} minHeight={60} />
      <div className="node-head">
        <button className="quiet toggle" onClick={toggle} title={data.collapsed ? "Expand" : "Collapse"} aria-label={data.collapsed ? "Expand" : "Collapse"}>{data.collapsed ? "▸" : "▾"}</button>
        <span className="badge" title={`Page ${page}`}>p{page}</span>
        <span className="title">{title}</span>
        {marks.length > 0 && <span className="count" title={`${marks.length} highlight${marks.length === 1 ? "" : "s"} inside`}>{marks.length}</span>}
        <button className="quiet open-source" data-testid="open-source" title="Open in paper" aria-label="Open in paper">↗</button>
      </div>
      {!data.collapsed && (
        <div className="node-body" ref={bodyRef}>
          {paintMarks(data.text, marks).map((run, i) => run.highlightId ? <mark key={i}>{run.text}</mark> : <span key={i}>{run.text}</span>)}
        </div>
      )}
      {marks.map((h, i) => (
        <Handle key={h.id} id={h.id} type="source" position={Position.Right} style={{ top: 36 + i * 14 }} title={h.anchor.quote.exact.slice(0, 60)} />
      ))}
      <Handle id={`${id}-in`} type="target" position={Position.Left} />
    </div>
  );
}
```

`web/src/board/nodes/FigureNode.tsx`: add the badge after the resizer, with the same markup as the chunk: `<span className="badge" title={\`Page ${data.region.rects[0].page + 1}\`}>p{data.region.rects[0].page + 1}</span>` as the first child of `.node-head`, and give the `<img>` `className="clip"` in place of its inline style (the style moves to CSS).

`web/src/board/nodes/NoteNode.tsx`: the head becomes `<div className="node-head"><span className="badge note-badge">note</span><span className="title">Note</span></div>`. Nothing else changes; editing arrives in the features plan.

`web/src/board/nodes/GroupNode.tsx`:

```tsx
import { NodeResizer, type NodeProps } from "@xyflow/react";
import type { GroupNode as GroupNodeType } from "../../model/types";

export function GroupNode({ data, selected }: NodeProps<GroupNodeType>) {
  return (
    <div className={`node group ${selected ? "selected" : ""}`}>
      <NodeResizer isVisible={selected} minWidth={160} minHeight={120} />
      <div className={`group-name ${data.name ? "" : "unnamed"}`}>{data.name ?? "Group"}</div>
    </div>
  );
}
```

`web/src/board/BoardView.tsx`: the toolbar becomes a small floating strip, and an empty board says one line. Replace the `<div className="board-tools">...</div>` with:

```tsx
      <div className="board-tools">
        <button onClick={addGroup} title="A rectangle to pile pieces in. Drag pieces wholly inside it."><span aria-hidden="true">▢</span> New group</button>
      </div>
      {state.board.nodes.length === 0 && (
        <div className="empty-hint"><p>Nothing here yet. In the paper, select some text and choose <b>Cut</b> to place it on the board.</p></div>
      )}
```

- [ ] **Step 6: Rewrite `web/src/styles/board.css`**

```css
/* the board: pieces of the paper laid out on a table */
.board { height: 100%; position: relative; background: var(--bg-board); }
.board .react-flow__background { color: var(--bg-board-dot); }
.board-tools { position: absolute; z-index: 5; top: 12px; left: 12px; display: flex; gap: 6px; padding: 4px; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); box-shadow: var(--shadow-card); }
.board-tools button { display: inline-flex; align-items: center; gap: 6px; padding: 5px 10px; border: 0; border-radius: var(--radius-small); background: transparent; font-weight: 500; }
.board-tools button:hover { background: var(--surface-muted); }
.empty-hint { position: absolute; inset: 0; display: grid; place-content: center; text-align: center; pointer-events: none; color: var(--ink-muted); }
.empty-hint p { max-width: 36ch; margin: 0; font-size: 14px; line-height: 1.5; }

/* cards */
.node { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); box-shadow: var(--shadow-card); font-size: var(--text-ui); min-width: 200px; transition: box-shadow 120ms ease, border-color 120ms ease; }
.node:hover { border-color: var(--border-strong); }
.react-flow__node.selected .node { border-color: var(--cut); box-shadow: 0 0 0 3px var(--cut-tint), var(--shadow-raised); }
.node.chunk { border-left: 3px solid var(--cut); }
.node.chunk.relocated { border-left-color: var(--moved); }
.node.chunk.orphaned { border-left-color: var(--lost); }
.node.figure { border-left: 3px solid var(--cut); }
.node.note { border-left: 3px solid var(--hl-solid); }

.node-head { display: flex; align-items: center; gap: 6px; padding: 6px 8px; border-bottom: 1px solid var(--border); border-radius: var(--radius) var(--radius) 0 0; background: var(--surface); }
.node-head .title { flex: 1; min-width: 0; font-weight: 600; font-size: 12.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.node-head .badge { flex: none; padding: 1px 6px; border-radius: var(--radius-pill); background: var(--surface-muted); color: var(--ink-muted); font-family: var(--font-mono); font-size: 10.5px; }
.node-head .note-badge { text-transform: uppercase; letter-spacing: 0.04em; font-family: var(--font-ui); }
.node-head .count { flex: none; padding: 1px 6px; border-radius: var(--radius-pill); background: var(--hl); color: var(--ink); font-size: 10.5px; font-weight: 600; }
.node-head .toggle { width: 18px; color: var(--ink-muted); }
.node-head .open-source { color: var(--ink-faint); opacity: 0; transition: opacity 120ms ease; }
.node:hover .node-head .open-source, .react-flow__node.selected .open-source { opacity: 1; }
.node-head .open-source:hover { color: var(--cut); }

.node-body { position: relative; padding: 8px 10px 10px; font-family: var(--font-read); font-size: var(--text-read); line-height: var(--leading-read); white-space: pre-wrap; max-height: 320px; overflow: auto; user-select: none; }
.node-body mark { background: var(--hl); color: inherit; border-radius: 2px; padding: 0 1px; }
.node.chunk.overflowing::after { content: ""; position: absolute; left: 0; right: 0; bottom: 0; height: 28px; pointer-events: none; border-radius: 0 0 var(--radius) var(--radius); background: linear-gradient(to bottom, transparent, var(--surface)); }
.node-body .clip { max-width: 100%; height: auto; display: block; border-radius: var(--radius-small); }

/* a resized chunk fills React Flow's box; its body gets the remaining reading space */
.node.chunk.sized { height: 100%; display: flex; flex-direction: column; }
.node.chunk.sized .node-head { flex-shrink: 0; }
.node.chunk.sized .node-body { flex: 1; min-height: 0; max-height: none; }

/* groups: a tinted region with a name */
.node.group { width: 100%; height: 100%; background: var(--surface-muted); border: 1px solid var(--border-strong); border-radius: 12px; box-shadow: none; }
.node.group.selected { border-color: var(--cut); }
/* React Flow's style.css pads, borders and fills its "group" wrapper; the dashed .node.group draws the group.
   Two classes so this wins whatever order the stylesheets load in. The wrapper's box stays the node's width/height. */
.react-flow .react-flow__node-group { padding: 0; border: 0; background: none; }
.group-name { display: inline-block; margin: 8px; padding: 2px 10px; border-radius: var(--radius-pill); background: var(--surface); border: 1px solid var(--border); font-weight: 600; font-size: 12px; }
.group-name.unnamed { color: var(--ink-faint); font-weight: 500; }

/* handles and resize corners: present, quiet, visible on hover */
.node .react-flow__handle { width: 9px; height: 9px; background: var(--surface); border: 1.5px solid var(--cut); opacity: 0; transition: opacity 120ms ease; }
.node:hover .react-flow__handle, .react-flow__node.selected .react-flow__handle { opacity: 1; }
.react-flow__resize-control.line { border-color: var(--cut-edge); }
.react-flow__resize-control.handle { width: 8px; height: 8px; background: var(--surface); border: 1.5px solid var(--cut); border-radius: 2px; }
.react-flow__controls { box-shadow: var(--shadow-card); border: 1px solid var(--border); border-radius: var(--radius-small); overflow: hidden; }
.react-flow__controls button { background: var(--surface); border-bottom: 1px solid var(--border); }
.react-flow__attribution { display: none; }

button.quiet { border: 0; background: none; cursor: pointer; font: inherit; }
```

The attribution watermark is hidden; React Flow's MIT licence does not require it, and the tool is itself open source.

- [ ] **Step 7: Run everything**

```bash
cd web && npx tsc -b && npm test && npm run build && PAPERBOARD_API_PORT=8792 PAPERBOARD_WEB_PORT=4192 npm run e2e
grep -nE "#[0-9a-fA-F]{3,6}\b|rgba?\(" web/src/styles/board.css
```

Expected: all green; the grep prints nothing. `board.spec.ts` resizes a chunk and reads `.node-body`; the fade is a pseudo-element and does not change any measured height.

- [ ] **Step 8: Commit**

```bash
git add web/src/styles/board.css web/src/board
git commit -m "style(web): board cards with page badges, overflow fades, quiet handles, and named groups"
```

---

### Task 4: See it, then pin the new behaviour

**Files:**
- Create: `web/e2e/restyle.spec.ts`

**Interfaces:**
- Consumes: Tasks 1 to 3, merged.

- [ ] **Step 1: Write the spec**

`web/e2e/restyle.spec.ts`:

```ts
import { expect, test, type Page } from "@playwright/test";

async function selectSpans(page: Page, pageNo: number, from: number, to: number) {
  const spans = page.locator(`.react-pdf__Page[data-page-number="${pageNo}"] .react-pdf__Page__textContent span`);
  await expect(spans.nth(to)).toBeVisible();
  const a = (await spans.nth(from).boundingBox())!;
  const b = (await spans.nth(to).boundingBox())!;
  await page.mouse.move(a.x + 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width - 2, b.y + b.height / 2, { steps: 8 });
  await page.mouse.up();
}

test("the popover previews the selection and Escape dismisses it", async ({ page }) => {
  await page.goto("/");
  await page.locator("select").selectOption({ index: 1 });
  await expect(page.locator(".react-pdf__Page").first()).toBeVisible();
  await selectSpans(page, 3, 4, 8);
  const popover = page.locator(".popover");
  await expect(popover).toBeVisible();
  await expect(popover.locator(".popover-preview")).not.toHaveText("");
  await page.keyboard.press("Escape");
  await expect(popover).toHaveCount(0);
});

test("an empty board shows one hint, and a long chunk fades", async ({ page }) => {
  await page.goto("/");
  await page.locator("select").selectOption({ index: 1 });
  await expect(page.locator(".react-pdf__Page").first()).toBeVisible();
  await page.getByRole("button", { name: "Board", exact: true }).click();
  await expect(page.locator(".empty-hint")).toBeVisible();
  await page.getByRole("button", { name: "Paper", exact: true }).click();
  await selectSpans(page, 3, 30, 120);
  await page.getByRole("button", { name: "Cut" }).click();
  await expect(page.locator(".notice")).toHaveText(/Saved v\d+/);
  await page.getByRole("button", { name: "Board", exact: true }).click();
  await expect(page.locator(".empty-hint")).toHaveCount(0);
  const card = page.locator(".node.chunk").first();
  await expect(card.locator(".badge")).toHaveText("p3");
  await expect(card).toHaveClass(/overflowing/);
});
```

- [ ] **Step 2: Run all specs**

```bash
cd web && PAPERBOARD_API_PORT=8793 PAPERBOARD_WEB_PORT=4193 npm run e2e
```

Expected: 6 passed.

- [ ] **Step 3: Look**

Start the real server on a copy of the data and take screenshots of: the start screen, the paper view with a highlight and a cut, the popover open, the board with three cards and a group, one card selected. Read each one. The checks are written down so a screenshot can pass or fail them:

- The paper view's ground is visibly warmer than the board's.
- A highlight reads as a highlight, not a box; a cut region reads as a region, with one small blue tab at its corner.
- The popover shows the selected words above two clearly different actions.
- Cards show `p<n>`, a title, and serif text; a long card fades at the bottom; handles are invisible until hover.
- The top bar shows the paper's title as a title, the view switch shows which view is active, and the status dot is green when saved.

Fix what fails, rerun the six specs, and take the screenshots again once.

- [ ] **Step 4: Commit**

```bash
git add web/e2e/restyle.spec.ts
git commit -m "test(web): pin the popover preview, empty-board hint, page badge and overflow fade"
```

---

## Done when

- `cd web && npx tsc -b && npm test && npm run build && npm run e2e` is green: 74 unit tests, 6 specs.
- The five screenshot checks in Task 4 pass by eye.
- No colour, font, radius or shadow literal exists outside `tokens.css`.
- `docs/superpowers/plans/2026-09-16-frontend-features.md` is amended so its CSS snippets use these tokens and class names: `.chip` and `.tag-picker` use `var(--radius-pill)`, `var(--border)`, `var(--surface)`; `.panel` and `.dialog` use `var(--surface)`, `var(--border)`, `var(--shadow-raised)`; the `.popover.column` variant keeps `.popover` as its base.

## Not in this plan

Tags, notes, connections, split, export and the question queue. Their panels and chips are styled by the same tokens when the features plan runs.
