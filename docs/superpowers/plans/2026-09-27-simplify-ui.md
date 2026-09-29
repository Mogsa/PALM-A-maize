# Simpler UI (Part A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A first-time reader sees only the paper, the board and three controls, and finds every other action where their hand already is: colour dots and a small bar beside a selection or a selected card, ⌘K for everything else, and gestures (drag to cut, double-click for a note, lasso to select) with a visible button for each.

**Architecture:** Surgical changes to the existing React components. Four small new building blocks carry the design: `tags/mainTag.ts` (the first tag is the main tag), `tags/TagDots.tsx` (the colour row), `ui/ActionMenu.tsx` (the `›` list) and `commands/registry.ts` (the ⌘K commands and `›` items that Part B adds to without touching Part A's files). The More menu and the New note button are removed. Hints are a browser-storage convenience in `hints/`.

**Tech Stack:** React 19 + TypeScript, @xyflow/react 12 (`NodeToolbar`, `selectionOnDrag`), Vitest + Testing Library (jsdom), Playwright e2e.

**Spec:** `docs/superpowers/specs/2026-09-27-simplify-and-ai-design.md`, sections A1–A5 only. Part B (the AI layer) is a separate plan; this plan only leaves the registry hook for it (Task 3).

## Global Constraints

- Every concept stays: this changes how things are done, not what exists (spec, A intro).
- Nothing is only a gesture: every gesture has a visible button in a contextual bar or in ⌘K (spec, A intro).
- Main tag = a highlight's or piece's **first** `tags` entry. Tapping a colour sets the first tag; Add tag appends. **No schema change** (A2, "Data").
- The first colour dot is plain yellow: a highlight with no tag (A2).
- ⌘K commands: Export, Tags, Template, Add missing sections, New note, Find in paper, Shortcuts (also on `?`), plus whatever Part B registers (AI help on/off) (A1).
- Questions and Glossary appear in the top bar only when they have something to list, with a count (A1).
- Which hints have been seen is kept in browser storage; every read and write is wrapped in try/catch (A4).
- Literal colours only in `web/src/styles/tokens.css` (its own header rule); tag colours come from `tags.json` as data.
- Files under 800 lines, functions under 50 lines, no deep nesting (user coding style).
- Commands: `cd web && npx vitest run`, `cd web && npx tsc --noEmit`, e2e `cd web && PAPERBOARD_API_PORT=8781 PAPERBOARD_WEB_PORT=4181 npx playwright test`.
- Commits: `<type>: <description>`, imperative mood, ending with the session's Co-Authored-By / Claude-Session lines.

## Review Focus

1. **A tag deleted while it is still a highlight's main tag.** The mark falls back to plain yellow, no dot shows pressed, and nothing crashes. Test in Task 1 (`mainTagColour` with an unknown id).
2. **Tapping the colour a thing already has, or tapping a colour that is one of its extra tags.** No tag appears twice; the extra is promoted to main and the old main is dropped. Test in Task 1 (`setMainTag`).
3. **Browser storage that throws (a private window, blocked site data).** Hints still show once in the session and nothing crashes. Test in Task 10.
4. **A drag from the paper dropped on a card, or dropped after the server fails.** Nothing is added. A later, unrelated drop never replays an old offer. Tests in Task 9 (`takeCut` is consumed once; `emptyPaneAt` rejects cards and edges).
5. **`?` typed into the reading goal or a note.** It types a `?` and does not open the cheat sheet. ⌘K opens the palette even from a text field. Test in Task 8.

---

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `web/src/tags/mainTag.ts` (new) | pure: `setMainTag`, `addTag`, `mainTagColour` | 1 |
| `web/src/tags/TagDots.tsx` (new) | the colour row: plain yellow + one dot per tag | 1 |
| `web/src/styles/tags.css` | `.tag-dots`, `.tag-dot`, and mark colour rules | 1, 2 |
| `web/src/paper/PageOverlay.tsx`, `web/src/board/nodes/ChunkBody.tsx` | paint a mark in its main tag's colour; extras as chips | 2 |
| `web/src/commands/registry.ts` (new) | `Command`, `MenuItem`, `SelectionTarget`; `registerCommands`, `registerSelectionItems` (Part B's hook); `filterCommands` | 3 |
| `web/src/ui/ActionMenu.tsx` (new) | the `›` button and its list | 3 |
| `web/src/App.tsx`, `web/src/PaperScreen.tsx`, `web/src/paper/FindPanel.tsx`, `web/src/board/BoardActions.tsx`, `web/src/board/BoardView.tsx` | Find in paper from anywhere (a request passed down) | 4 |
| `web/src/paper/SelectionPopover.tsx`, `web/src/PaperScreen.tsx`, `web/src/paper/MarkPopover.tsx`, `web/src/paper/MarkMenu.tsx` (new) | the selection bar on the paper; a mark's right-click list | 5 |
| `web/src/board/TextPopover.tsx`, `web/src/board/BoardView.tsx` | the selection bar on a card's text | 6 |
| `web/src/board/CardBar.tsx` (new), `web/src/board/nodes/*Node.tsx`, `web/src/board/SelectionBar.tsx`, `web/src/model/boardReducer.ts`, `web/src/styles/board.css` | the one-card bar, the main-tag edge, Group · Join · ● | 7 |
| `web/src/commands/CommandPalette.tsx`, `shellCommands.ts`, `useSplit.ts`, `useCommandKeys.ts`, `ShortcutsSheet.tsx` (new), `web/src/panels/useQuestions.ts` (new), `web/src/App.tsx`, `web/src/styles/shell.css`; delete `web/src/MoreMenu.tsx` and its test | ⌘K and the top bar | 8 |
| `web/src/board/cutDrag.ts` (new), `web/src/board/dropNote.ts`, `web/src/board/recut.ts`, `web/src/paper/cut.ts`, `web/src/paper/usePaperMouse.ts`, `web/src/paper/PaperView.tsx`, `web/src/PaperScreen.tsx`, `web/src/board/BoardView.tsx` | gestures: drag to cut, double-click note, lasso | 9 |
| `web/src/hints/hints.ts`, `web/src/hints/Hint.tsx` (new), `web/src/PaperScreen.tsx`, `web/src/board/BoardView.tsx` | the three one-time hints | 10 |
| `web/e2e/*.spec.ts`, `web/e2e/simplify.spec.ts` (new) | existing specs moved to the new controls; gesture and button-twin specs | 11 |

## Order and parallelism

- **Wave 1 (parallel):** Tasks 1, 3, 4. Their files do not overlap.
- **Wave 2 (parallel):** Tasks 2, 5, 6, 7, 8.
  - Task 2 needs 1.
  - Task 5 needs 1, 3 and 4, and shares `PaperScreen.tsx` with 4.
  - Task 6 needs 1, 3 and 4, and shares `BoardView.tsx` with 4.
  - Task 7 needs 1 and 3.
  - Task 8 needs 3 and 4, and shares `App.tsx` with 4.
  - Within the wave no two tasks share a file: 2 touches `tags.css`, 7 touches `board.css`, 8 touches `shell.css`.
- **Wave 3 (sequential):**
  - Task 9 edits `PaperScreen.tsx` (after 5) and `BoardView.tsx` (after 6).
  - Task 10 then edits both files again.
  - Task 11 runs last: e2e shares one server and port pair, so only one agent may run Playwright at a time.
- Tasks 1–10 verify with Vitest and tsc only. Each lists the existing e2e lines it breaks, and Task 11 fixes them all and runs the full e2e suite.

---

### Task 1: Main tag helpers and the colour dots

**Files:**
- Create: `web/src/tags/mainTag.ts`
- Create: `web/src/tags/mainTag.test.ts`
- Create: `web/src/tags/TagDots.tsx`
- Create: `web/src/tags/TagDots.test.tsx`
- Modify: `web/src/styles/tags.css` (append)

**Interfaces:**
- Consumes: `Tag` from `web/src/model/types.ts`; `useTags()` from `web/src/state/TagsProvider.tsx`.
- Produces:
  - `setMainTag(tags: string[], tagId: string | null): string[]`
  - `addTag(tags: string[], tagId: string): string[]`
  - `mainTagColour(tags: string[], byId: ReadonlyMap<string, Tag>): string | undefined`
  - `<TagDots current?: string | null; onPick: (tagId: string | null) => void; disabled?: boolean; plainLabel?: string />`. `current` undefined means nothing chosen yet (a fresh selection), and `null` means plain.

- [ ] **Step 1: Write the failing tests**

`web/src/tags/mainTag.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import type { Tag } from "../model/types";
import { addTag, mainTagColour, setMainTag } from "./mainTag";

const byId = new Map<string, Tag>([["t-q", { id: "t-q", name: "question", colour: "#7C3AED" }]]);

describe("the main tag is the first tag (spec A2)", () => {
  it("a colour on an untagged thing makes it the only tag", () => {
    expect(setMainTag([], "t-q")).toEqual(["t-q"]);
  });
  it("a colour replaces the main tag and keeps the extras", () => {
    expect(setMainTag(["t-a", "t-b"], "t-q")).toEqual(["t-q", "t-b"]);
  });
  it("a colour that is already an extra is promoted, never duplicated (Review Focus 2)", () => {
    expect(setMainTag(["t-a", "t-q", "t-b"], "t-q")).toEqual(["t-q", "t-b"]);
  });
  it("the same colour again changes nothing", () => {
    expect(setMainTag(["t-q", "t-b"], "t-q")).toEqual(["t-q", "t-b"]);
  });
  it("plain yellow drops the main tag and keeps the extras", () => {
    expect(setMainTag(["t-a", "t-b"], null)).toEqual(["t-b"]);
  });
  it("Add tag appends, once", () => {
    expect(addTag(["t-a"], "t-b")).toEqual(["t-a", "t-b"]);
    expect(addTag(["t-a"], "t-a")).toEqual(["t-a"]);
  });
  it("the colour is the main tag's, and none for no tag or a deleted tag (Review Focus 1)", () => {
    expect(mainTagColour(["t-q", "t-x"], byId)).toBe("#7C3AED");
    expect(mainTagColour([], byId)).toBeUndefined();
    expect(mainTagColour(["t-gone"], byId)).toBeUndefined();
  });
});
```

`web/src/tags/TagDots.test.tsx`:
```tsx
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../state/TagsProvider", () => ({
  useTags: () => ({ tags: [{ id: "t-s", name: "supports", colour: "#15803D" }, { id: "t-q", name: "question", colour: "#7C3AED" }] }),
}));
import { TagDots } from "./TagDots";

afterEach(cleanup);

describe("TagDots (spec A2)", () => {
  it("shows plain yellow first, then one dot per tag in its own colour", () => {
    const { getAllByRole } = render(<TagDots onPick={vi.fn()} plainLabel="Highlight" />);
    const dots = getAllByRole("button");
    expect(dots.map((d) => d.getAttribute("aria-label"))).toEqual(["Highlight", "supports", "question"]);
    expect(dots[2].style.background).toBe("rgb(124, 58, 237)");
  });
  it("passes the tag picked, or null for plain", () => {
    const onPick = vi.fn();
    const { getByRole } = render(<TagDots onPick={onPick} />);
    fireEvent.click(getByRole("button", { name: "question" }));
    fireEvent.click(getByRole("button", { name: "No colour" }));
    expect(onPick.mock.calls).toEqual([["t-q"], [null]]);
  });
  it("presses the current main tag, and none on a fresh selection", () => {
    const { getByRole, rerender } = render(<TagDots current="t-s" onPick={vi.fn()} />);
    expect(getByRole("button", { name: "supports" }).getAttribute("aria-pressed")).toBe("true");
    rerender(<TagDots onPick={vi.fn()} />);
    expect(getByRole("button", { name: "No colour" }).getAttribute("aria-pressed")).toBe("false");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd web && npx vitest run src/tags/mainTag.test.ts src/tags/TagDots.test.tsx`
Expected: FAIL with "Failed to resolve import "./mainTag"" and "./TagDots".

- [ ] **Step 3: Write the minimal implementation**

`web/src/tags/mainTag.ts`:
```ts
import type { Tag } from "../model/types";

/** The first tag is the main tag (spec A2): it sets a mark's colour and a card's edge. The others are extras.
 *  A colour replaces the main tag; plain (null) drops it. A tag is never listed twice. */
export function setMainTag(tags: string[], tagId: string | null): string[] {
  const extras = tags.slice(1).filter((t) => t !== tagId);
  return tagId ? [tagId, ...extras] : extras;
}

/** Add tag (spec A2): appended as an extra, or the main tag when there is none yet. */
export function addTag(tags: string[], tagId: string): string[] {
  return tags.includes(tagId) ? tags : [...tags, tagId];
}

/** The main tag's colour; none when there is no tag or the tag was deleted (addendum 4.3: a deleted id is ignored). */
export function mainTagColour(tags: string[], byId: ReadonlyMap<string, Tag>): string | undefined {
  return tags.length ? byId.get(tags[0])?.colour : undefined;
}
```

`web/src/tags/TagDots.tsx`:
```tsx
import { useTags } from "../state/TagsProvider";

type Props = {
  /** The main tag now: undefined when nothing is chosen yet (a fresh selection), null when plain. */
  current?: string | null;
  onPick: (tagId: string | null) => void;
  disabled?: boolean;
  /** The plain dot's name: "Highlight" where it makes a highlight. */
  plainLabel?: string;
};

/** The colour row (spec A2): plain yellow first, then one dot per tag in the tag's own colour. `nodrag` and the stopped
 *  mousedown keep React Flow from dragging a card under it. */
export function TagDots({ current, onPick, disabled = false, plainLabel = "No colour" }: Props) {
  const { tags } = useTags();
  return (
    <span className="tag-dots nodrag" role="group" aria-label="Colour" onMouseDown={(e) => e.stopPropagation()}>
      <button type="button" className="tag-dot plain" aria-label={plainLabel} title={plainLabel}
              aria-pressed={current === null} disabled={disabled} onClick={() => onPick(null)} />
      {tags.map((t) => (
        <button key={t.id} type="button" className="tag-dot" style={{ background: t.colour }} aria-label={t.name} title={t.name}
                aria-pressed={current === t.id} disabled={disabled} onClick={() => onPick(t.id)} />
      ))}
    </span>
  );
}
```

Append to `web/src/styles/tags.css`:
```css
/* the colour row: plain yellow, then each tag's own colour (spec A2) */
.tag-dots { display: inline-flex; align-items: center; gap: 6px; }
.tag-dot { width: 16px; height: 16px; padding: 0; border-radius: var(--radius-pill); border: 2px solid var(--surface); box-shadow: 0 0 0 1px var(--border-strong); cursor: pointer; }
.tag-dot.plain { background: var(--hl-solid); }
.tag-dot[aria-pressed="true"] { box-shadow: 0 0 0 2px var(--ink); }
.tag-dot:disabled { opacity: 0.45; cursor: not-allowed; }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd web && npx vitest run src/tags && npx tsc --noEmit`
Expected: PASS, no type errors.

- [ ] **Step 5: Commit**

```bash
git add web/src/tags/mainTag.ts web/src/tags/mainTag.test.ts web/src/tags/TagDots.tsx web/src/tags/TagDots.test.tsx web/src/styles/tags.css
git commit -m "feat: main tag helpers and the colour dots"
```

---

### Task 2: A mark takes its main tag's colour; extras show as chips

**Files:**
- Modify: `web/src/paper/PageOverlay.tsx`
- Modify: `web/src/paper/PageOverlay.test.tsx`
- Modify: `web/src/board/nodes/ChunkBody.tsx`
- Modify: `web/src/board/nodes/ChunkBody.test.tsx`
- Modify: `web/src/board/nodes/ChunkNode.tsx` (pass the highlights' tags down)
- Modify: `web/src/styles/tags.css`

**Interfaces:**
- Consumes: `mainTagColour` (Task 1), `useTags()`.
- Produces: `.overlay .mark` and `.node mark` carry an inline `--mark-colour` custom property when the mark has a main tag. A paper mark with extras draws `.mark-extras` dots after its first rect. `ChunkBody` takes a new prop `tagsOf: (highlightId: string) => string[]`.

- [ ] **Step 1: Write the failing tests**

Add to `web/src/paper/PageOverlay.test.tsx`, after the existing `vi.mock("./PageMargin", ...)`:
```tsx
vi.mock("../state/TagsProvider", () => ({
  useTags: () => ({ byId: new Map([["t-q", { id: "t-q", name: "question", colour: "#7C3AED" }], ["t-s", { id: "t-s", name: "supports", colour: "#15803D" }]]) }),
}));
```
and a new describe block at the end:
```tsx
describe("PageOverlay marks (spec A2)", () => {
  const mark = (tags: string[]) => ({ id: "h-1", tags, anchor: { rects: [{ page: 0, rect: [0, 0, 10, 10] as [number, number, number, number] }], quote: q, position: 0, state: "anchored" as const } });
  const drawMark = (tags: string[]) => render(<PageOverlay page={0} scale={1} board={{ ...emptyBoard("p"), highlights: [mark(tags)] }} source={source}
    onOutlineClick={vi.fn()} onJump={() => undefined} onOpenNote={() => undefined} />);
  it("paints a mark in its main tag's colour, and plain yellow with no tag", () => {
    const { container, unmount } = drawMark(["t-q"]);
    expect((container.querySelector(".mark") as HTMLElement).style.getPropertyValue("--mark-colour")).toBe("#7C3AED");
    unmount();
    const plain = drawMark([]);
    expect((plain.container.querySelector(".mark") as HTMLElement).style.getPropertyValue("--mark-colour")).toBe("");
  });
  it("shows each extra tag as a small chip and leaves the colour alone", () => {
    const { container } = drawMark(["t-q", "t-s"]);
    const chips = container.querySelectorAll(".mark-extras .mark-extra");
    expect(chips).toHaveLength(1);
    expect((chips[0] as HTMLElement).title).toBe("supports");
  });
});
```

Add to `web/src/board/nodes/ChunkBody.test.tsx`: mock the tags (after the BoardProvider mock), pass `tagsOf` to every existing `render(<ChunkBody ... />)`, and add one test:
```tsx
vi.mock("../../state/TagsProvider", () => ({ useTags: () => ({ byId: new Map([["t-q", { id: "t-q", name: "question", colour: "#7C3AED" }]]) }) }));
```
```tsx
it("paints a mark on a card in its main tag's colour (spec A2)", () => {
  const painted = [{ block, runs: [{ text: "marked", highlightId: "h-1" }] }];
  const { container } = render(<ChunkBody painted={painted} dimmed={() => false} tagsOf={() => ["t-q"]} />);
  expect((container.querySelector("mark") as HTMLElement).style.getPropertyValue("--mark-colour")).toBe("#7C3AED");
});
```
In the existing tests, change each `<ChunkBody painted={...} dimmed={...} />` to add `tagsOf={() => []}`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd web && npx vitest run src/paper/PageOverlay.test.tsx src/board/nodes/ChunkBody.test.tsx`
Expected: FAIL. `--mark-colour` is `""` and `.mark-extras` is missing.

- [ ] **Step 3: Implement**

In `web/src/paper/PageOverlay.tsx`, add the imports:
```tsx
import { mainTagColour } from "../tags/mainTag";
import { useTags } from "../state/TagsProvider";
```
Replace the highlights `flatMap` with:
```tsx
      {/* A highlight is painted line by line, each of its rects on this page (addendum 5.1), in its main tag's colour;
          its extra tags are small chips after its first line (spec A2). */}
      {board.highlights.flatMap((h) => h.anchor.rects.filter((r) => r.page === page).map((r, i) => (
        <div key={`${h.id}-${i}`} className={`mark ${h.anchor.state}`} data-highlight-id={h.id} title={h.anchor.quote.exact.slice(0, 80)}
             style={{ ...px(r.rect, scale), ...markColour(h.tags, byId) }}>
          {i === 0 && h.tags.length > 1 && <MarkExtras ids={h.tags.slice(1)} />}
        </div>
      )))}
```
Add `const { byId } = useTags();` as the first line of `PageOverlay`, and add these above it:
```tsx
/** The inline colour of a mark with a main tag; none leaves the stylesheet's plain yellow. */
export const markColour = (tags: string[], byId: ReadonlyMap<string, Tag>): React.CSSProperties => {
  const colour = mainTagColour(tags, byId);
  return colour ? ({ "--mark-colour": colour } as React.CSSProperties) : {};
};

/** A mark's extra tags: one small dot each, named on hover. A deleted tag is skipped. */
function MarkExtras({ ids }: { ids: string[] }) {
  const { byId } = useTags();
  const known = ids.flatMap((id) => byId.get(id) ?? []);
  return <span className="mark-extras">{known.map((t) => <span key={t.id} className="mark-extra" title={t.name} style={{ background: t.colour }} />)}</span>;
}
```
Change the model import to `import type { Board, Rect, Source, Tag } from "../model/types";`.

In `web/src/board/nodes/ChunkBody.tsx`:
- import `markColour` from `../../paper/PageOverlay` and `useTags` from `../../state/TagsProvider`;
- change the signature to `export function ChunkBody({ painted, dimmed, tagsOf }: { painted: PaintedBlock[]; dimmed: (highlightId: string) => boolean; tagsOf: (highlightId: string) => string[] })`;
- add `const { byId } = useTags();`;
- change the `<mark>` to:
```tsx
<mark key={j} data-highlight-id={run.highlightId} className={dimmed(run.highlightId) ? "dim" : undefined}
      style={markColour(tagsOf(run.highlightId), byId)}>{run.text}</mark>
```

In `web/src/board/nodes/ChunkNode.tsx`, next to `dimmed`:
```tsx
const tagsOf = (highlightId: string) => marks.find((m) => m.id === highlightId)?.tags ?? [];
```
and render `<ChunkBody painted={painted} dimmed={dimmed} tagsOf={tagsOf} />`.

Append to `web/src/styles/tags.css`:
```css
/* a mark in its main tag's colour (spec A2): the tag's colour as a light wash, plain yellow with no tag */
.overlay .mark[style*="--mark-colour"], .node mark[style*="--mark-colour"] { background: color-mix(in srgb, var(--mark-colour) 28%, transparent); }
.overlay .mark .mark-extras { position: absolute; top: -5px; right: -4px; display: inline-flex; gap: 2px; }
.overlay .mark .mark-extra { width: 7px; height: 7px; border-radius: var(--radius-pill); border: 1px solid var(--surface); }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd web && npx vitest run src/paper src/board && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/paper/PageOverlay.tsx web/src/paper/PageOverlay.test.tsx web/src/board/nodes/ChunkBody.tsx web/src/board/nodes/ChunkBody.test.tsx web/src/board/nodes/ChunkNode.tsx web/src/styles/tags.css
git commit -m "feat: paint a mark in its main tag's colour, extras as chips"
```

---

### Task 3: The command registry and the `›` menu

**Files:**
- Create: `web/src/commands/registry.ts`
- Create: `web/src/commands/registry.test.ts`
- Create: `web/src/ui/ActionMenu.tsx`
- Create: `web/src/ui/ActionMenu.test.tsx`
- Modify: `web/src/styles/shell.css` (append)

**Interfaces:**
- Consumes: `useBoard` (type only), `PageRect`, `QuoteSelector`, `useDismiss`.
- Produces (Part B builds on these; do not rename):
```ts
export type MenuItem = { id: string; label: string; title?: string; run: () => void };
export type Command = MenuItem & { keywords?: string };
export type BoardHandle = ReturnType<typeof useBoard>;
export type SelectionTarget =
  | { on: "paper"; text: string; rects: PageRect[]; at: DOMRect }
  | { on: "card"; text: string; nodeId: string; quote: QuoteSelector; at: DOMRect };
export type CommandSource = (board: BoardHandle) => Command[];
export type SelectionSource = (target: SelectionTarget, board: BoardHandle) => MenuItem[];
export function registerCommands(source: CommandSource): () => void;
export function registerSelectionItems(source: SelectionSource): () => void;
export function extraCommands(board: BoardHandle): Command[];
export function extraSelectionItems(target: SelectionTarget, board: BoardHandle): MenuItem[];
export function filterCommands(commands: Command[], query: string): Command[];
```
- `<ActionMenu items: MenuItem[]; initiallyOpen?: boolean />`: a `›` button (aria-label "More actions") and a `role="menu"` list of `role="menuitem"` buttons. Picking an item closes the list, then runs the item.

- [ ] **Step 1: Write the failing tests**

`web/src/commands/registry.test.ts`:
```ts
import { afterEach, describe, expect, it } from "vitest";
import { extraCommands, extraSelectionItems, filterCommands, registerCommands, registerSelectionItems, type BoardHandle, type Command } from "./registry";

const board = {} as BoardHandle;
const cmd = (id: string, label: string, keywords?: string): Command => ({ id, label, keywords, run: () => undefined });
const undo: (() => void)[] = [];
afterEach(() => { undo.splice(0).forEach((u) => u()); });

describe("the command registry (Part B's hook)", () => {
  it("lists what a source registers, and forgets it when unregistered", () => {
    undo.push(registerCommands(() => [cmd("ai", "AI help: off")]));
    expect(extraCommands(board).map((c) => c.id)).toEqual(["ai"]);
    undo.pop()!();
    expect(extraCommands(board)).toEqual([]);
  });
  it("gives each selection source the selection it is about", () => {
    undo.push(registerSelectionItems((target) => (target.text ? [{ id: "define", label: `Define ${target.text}`, run: () => undefined }] : [])));
    const at = new DOMRect();
    expect(extraSelectionItems({ on: "paper", text: "ResNet", rects: [], at }, board).map((i) => i.label)).toEqual(["Define ResNet"]);
    expect(extraSelectionItems({ on: "paper", text: "", rects: [], at }, board)).toEqual([]);
  });
});

describe("filterCommands", () => {
  const all = [cmd("export", "Export"), cmd("split", "Add missing sections", "split tray"), cmd("find", "Find in paper", "search")];
  it("keeps every command for an empty query", () => { expect(filterCommands(all, "  ")).toEqual(all); });
  it("matches every word, in the label or the keywords, ignoring case", () => {
    expect(filterCommands(all, "SPLIT").map((c) => c.id)).toEqual(["split"]);
    expect(filterCommands(all, "find pap").map((c) => c.id)).toEqual(["find"]);
    expect(filterCommands(all, "export tray")).toEqual([]);
  });
});
```

`web/src/ui/ActionMenu.test.tsx`:
```tsx
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ActionMenu } from "./ActionMenu";

afterEach(cleanup);

describe("ActionMenu (the › list)", () => {
  it("is closed until › is pressed, then runs the item picked and closes", () => {
    const run = vi.fn();
    const { getByRole, queryByRole } = render(<ActionMenu items={[{ id: "a", label: "Add tag", run }]} />);
    expect(queryByRole("menu")).toBeNull();
    fireEvent.click(getByRole("button", { name: "More actions" }));
    fireEvent.click(getByRole("menuitem", { name: "Add tag" }));
    expect(run).toHaveBeenCalledTimes(1);
    expect(queryByRole("menu")).toBeNull();
  });
  it("can open already (a right-click)", () => {
    const { getByRole } = render(<ActionMenu initiallyOpen items={[{ id: "a", label: "Split here", run: vi.fn() }]} />);
    expect(getByRole("menuitem", { name: "Split here" })).toBeTruthy();
  });
  it("shows nothing when there is nothing to offer", () => {
    const { container } = render(<ActionMenu items={[]} />);
    expect(container.innerHTML).toBe("");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd web && npx vitest run src/commands src/ui/ActionMenu.test.tsx`
Expected: FAIL with unresolved imports.

- [ ] **Step 3: Implement**

`web/src/commands/registry.ts`:
```ts
import type { PageRect, QuoteSelector } from "../model/types";
import type { useBoard } from "../state/BoardProvider";

/** One action in a `›` list or in ⌘K. */
export type MenuItem = { id: string; label: string; title?: string; run: () => void };
/** A ⌘K command: `keywords` are extra words it is found by. */
export type Command = MenuItem & { keywords?: string };
export type BoardHandle = ReturnType<typeof useBoard>;
/** Words selected on the paper or on a card: what a selection's `›` list is about. */
export type SelectionTarget =
  | { on: "paper"; text: string; rects: PageRect[]; at: DOMRect }
  | { on: "card"; text: string; nodeId: string; quote: QuoteSelector; at: DOMRect };
export type CommandSource = (board: BoardHandle) => Command[];
export type SelectionSource = (target: SelectionTarget, board: BoardHandle) => MenuItem[];

// Other features add to ⌘K and to a selection's › here, without editing the lists that show them (Part B: AI help, Define).
const commandSources = new Set<CommandSource>();
const selectionSources = new Set<SelectionSource>();

/** Adds commands to ⌘K; the source is asked again every time the list is shown. Returns the undo. */
export function registerCommands(source: CommandSource): () => void {
  commandSources.add(source);
  return () => { commandSources.delete(source); };
}

/** Adds items to every selection's `›`, after the built-in ones. Returns the undo. */
export function registerSelectionItems(source: SelectionSource): () => void {
  selectionSources.add(source);
  return () => { selectionSources.delete(source); };
}

export function extraCommands(board: BoardHandle): Command[] {
  return [...commandSources].flatMap((source) => source(board));
}

export function extraSelectionItems(target: SelectionTarget, board: BoardHandle): MenuItem[] {
  return [...selectionSources].flatMap((source) => source(target, board));
}

/** The commands whose label or keywords hold every word typed, ignoring case, in their own order. */
export function filterCommands(commands: Command[], query: string): Command[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  return commands.filter((c) => {
    const text = `${c.label} ${c.keywords ?? ""}`.toLowerCase();
    return words.every((w) => text.includes(w));
  });
}
```

`web/src/ui/ActionMenu.tsx`:
```tsx
import { useCallback, useRef, useState } from "react";
import type { MenuItem } from "../commands/registry";
import { useDismiss } from "./useDismiss";

/** The `›` in a bar: everything used now and then, one list. Escape or a press outside closes it. */
export function ActionMenu({ items, initiallyOpen = false }: { items: MenuItem[]; initiallyOpen?: boolean }) {
  const [open, setOpen] = useState(initiallyOpen);
  const box = useRef<HTMLSpanElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(box, close);
  if (!items.length) return null;
  const pick = (item: MenuItem) => { setOpen(false); item.run(); };
  return (
    <span className="action-menu nodrag" ref={box} onMouseDown={(e) => e.stopPropagation()}>
      <button type="button" className="quiet action-more" aria-label="More actions" aria-haspopup="menu" aria-expanded={open}
              onClick={() => setOpen((o) => !o)}>›</button>
      {open && (
        <span className="action-list" role="menu" aria-label="More actions">
          {items.map((item) => (
            <button key={item.id} type="button" role="menuitem" title={item.title} onClick={() => pick(item)}>{item.label}</button>
          ))}
        </span>
      )}
    </span>
  );
}
```

Append to `web/src/styles/shell.css`:
```css
/* the › list in a bar */
.action-menu { position: relative; display: inline-flex; }
.action-more { padding: 2px 8px; font-size: 16px; color: var(--ink-muted); }
.action-list { position: absolute; top: calc(100% + 4px); right: 0; z-index: 30; min-width: 160px; display: flex; flex-direction: column; padding: 4px; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); box-shadow: var(--shadow-raised); }
.action-list button { padding: 6px 10px; border: 0; border-radius: var(--radius-small); background: none; text-align: left; white-space: nowrap; }
.action-list button:hover, .action-list button:focus-visible { background: var(--surface-muted); }
.bar-sep { width: 1px; align-self: stretch; background: var(--border); margin: 0 2px; }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd web && npx vitest run src/commands src/ui && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/commands web/src/ui/ActionMenu.tsx web/src/ui/ActionMenu.test.tsx web/src/styles/shell.css
git commit -m "feat: a command registry and the › menu, for ⌘K and the bars"
```

---

### Task 4: Find in paper from anywhere

Today Find opens only from a paper selection, and only with words already chosen. ⌘K (Task 8) and a card's 🔍 (Task 6) need it too, so the Find panel takes a typed query.

**Files:**
- Modify: `web/src/paper/FindPanel.tsx`
- Modify: `web/src/paper/FindPanel.test.tsx`
- Modify: `web/src/PaperScreen.tsx`
- Modify: `web/src/board/BoardActions.tsx`
- Modify: `web/src/board/BoardView.tsx`
- Modify: `web/src/App.tsx`

**Interfaces:**
- Produces:
  - `FindPanel` gains `onQuery: (text: string) => void` and shows the query in a text field labelled "Find words".
  - `useFind` returns `edit(text: string)` too, and `query: string | null`, where `""` means open and empty.
  - `PaperScreen` props gain `findRequest: { text: string } | null; onFindHandled: () => void`.
  - `BoardView` props gain `onFind?: (text: string) => void`, and `BoardActions` gains `find: (text: string) => void`.
  - `App`'s `Shell` has `requestFind(text: string)`. It shows the paper when the board alone is shown.

- [ ] **Step 1: Write the failing test**

Add to `web/src/paper/FindPanel.test.tsx`:
```tsx
it("shows the words in a field that can be typed into, and an empty query lists nothing", () => {
  const onQuery = vi.fn();
  const { getByRole, queryAllByRole } = render(<FindPanel query="" onQuery={onQuery} onPick={vi.fn()} onClose={() => undefined} />);
  expect(queryAllByRole("listitem")).toHaveLength(0);
  fireEvent.change(getByRole("textbox", { name: "Find words" }), { target: { value: "residual" } });
  expect(onQuery).toHaveBeenCalledWith("residual");
});
```
Add `onQuery={vi.fn()}` to the existing test's render.

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd web && npx vitest run src/paper/FindPanel.test.tsx`
Expected: FAIL. There is no textbox named "Find words".

- [ ] **Step 3: Implement**

In `web/src/paper/FindPanel.tsx`:
- add `edit: (text: string) => setQuery(text.slice(0, FIND_QUERY_MAX)),` to the object `useFind` returns;
- change the signature to `export function FindPanel({ query, onQuery, onPick, onClose }: { query: string; onQuery: (text: string) => void; onPick: (hit: FindHit, nth: number) => void; onClose: () => void })`;
- replace the header's `<b>“{query}”</b>` with:
```tsx
<input className="find-query" type="search" aria-label="Find words" value={query} autoFocus placeholder="Words to find"
       onChange={(e) => onQuery(e.target.value)} />
```

In `web/src/PaperScreen.tsx`:
- extend `Props` with `findRequest: { text: string } | null; onFindHandled: () => void`, and destructure them;
- add after `const find = useFind(setJump);`:
```tsx
  // Find in paper asked for from ⌘K or a card: a fresh object each time, consumed once.
  const openFind = find.open;
  useEffect(() => {
    if (!findRequest) return;
    openFind(findRequest.text);
    onFindHandled();
  }, [findRequest, openFind, onFindHandled]);
```
- `useFind`'s `open` is recreated every render, so wrap it: in `FindPanel.tsx` change `useFind` to build `open` with `useCallback((text: string) => setQuery(...), [])` (import `useCallback`);
- change `{find.query && <FindPanel query={find.query} ...` to `{find.query !== null && <FindPanel query={find.query} onQuery={find.edit} onPick={find.pick} onClose={find.close} />}`.

In `web/src/board/BoardActions.tsx`, add `find: (text: string) => void;` to `BoardActions`.

In `web/src/board/BoardView.tsx`:
- add `onFind?: (text: string) => void;` to `Props` and destructure `onFind`;
- make `actions`:
```tsx
const find = useCallback((text: string) => onFind?.(text), [onFind]);
const actions = useMemo(() => ({ focusNode: focusOn, openInPaper: onOpenInPaper, editing, setEditing, find }), [focusOn, onOpenInPaper, editing, find]);
```

In `web/src/App.tsx` (`Shell`):
```tsx
  const [findRequest, setFindRequest] = useState<{ text: string } | null>(null);
  /** Find in paper from anywhere: the paper is shown first when the board alone is. */
  const requestFind = useCallback((text: string) => { setFindRequest({ text }); if (view === "board") show("paper"); }, [view]);   // eslint-disable-line react-hooks/exhaustive-deps -- show only calls setView
  const findHandled = useCallback(() => setFindRequest(null), []);
```
Import `useCallback`. Pass `findRequest={findRequest} onFindHandled={findHandled}` to `<PaperScreen>` and `onFind={requestFind}` to `<BoardView>`.

In `web/src/board/nodes/NoteNode.test.tsx`, add `find: vi.fn()` to the mocked `actions` object so its type still matches.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd web && npx vitest run && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/paper/FindPanel.tsx web/src/paper/FindPanel.test.tsx web/src/PaperScreen.tsx web/src/board/BoardActions.tsx web/src/board/BoardView.tsx web/src/App.tsx web/src/board/nodes/NoteNode.test.tsx
git commit -m "feat: open Find in paper from anywhere, with a query that can be typed"
```

---

### Task 5: The selection bar on the paper, and a mark's list

**Files:**
- Modify: `web/src/paper/SelectionPopover.tsx`
- Create: `web/src/paper/SelectionPopover.test.tsx`
- Modify: `web/src/PaperScreen.tsx`
- Create: `web/src/paper/MarkMenu.tsx`
- Modify: `web/src/paper/MarkPopover.tsx`
- Modify: `web/src/paper/popovers.test.tsx`

**Interfaces:**
- Consumes: `TagDots`, `setMainTag`, `addTag` (Task 1); `ActionMenu`, `MenuItem`, `extraSelectionItems` (Task 3); `find.open` (Task 4).
- Produces:
  - `SelectionPopover` props: `{ at; preview; busy; canHighlight; onHighlight: (tagId: string | null) => void; onCut; onDismiss; onOpen?; onFind?; menu: MenuItem[] }`. The dialog is still named "Selection". Its buttons: the plain dot "Highlight", tag dots named by tag, "Cut" (✂), "Find" (🔍), "More actions" (›).
  - `PaperScreen`'s `choose` becomes `chooseFor(p: Pending, kind, tagId?: string | null): Promise<Highlight | null>`. Task 9 adds a fourth argument, `at?: XY`.
  - `MarkMenu`: `{ highlight: Highlight; onAddTag: () => void; onConnect: () => void; onAddNote: () => void }`. It holds the right-click list's contents: the buttons "Add tag", "Connect", "Add note" and the existing `AskElsewhere`.
  - `MarkPopover` props gain `addTag?: boolean`, which opens with the tag list shown.

- [ ] **Step 1: Write the failing tests**

`web/src/paper/SelectionPopover.test.tsx`:
```tsx
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../state/TagsProvider", () => ({ useTags: () => ({ tags: [{ id: "t-q", name: "question", colour: "#7C3AED" }] }) }));
import { SelectionPopover } from "./SelectionPopover";

afterEach(cleanup);
const base = { at: new DOMRect(100, 100, 0, 0), preview: "residual learning", busy: false, canHighlight: true, onCut: vi.fn(), onDismiss: vi.fn(), menu: [] };

describe("SelectionPopover (spec A2)", () => {
  it("reads: colour dots | ✂ 🔍 ›", () => {
    const { getByRole } = render(<SelectionPopover {...base} onHighlight={vi.fn()} onFind={vi.fn()}
      menu={[{ id: "add-tag", label: "Add tag", run: vi.fn() }]} />);
    const names = Array.from(getByRole("dialog", { name: "Selection" }).querySelectorAll("button")).map((b) => b.getAttribute("aria-label"));
    expect(names).toEqual(["Highlight", "question", "Cut", "Find", "More actions"]);
  });
  it("one tap on a colour highlights with that main tag; plain highlights with none", () => {
    const onHighlight = vi.fn();
    const { getByRole } = render(<SelectionPopover {...base} onHighlight={onHighlight} />);
    fireEvent.click(getByRole("button", { name: "question" }));
    fireEvent.click(getByRole("button", { name: "Highlight" }));
    expect(onHighlight.mock.calls).toEqual([["t-q"], [null]]);
  });
  it("a heading cannot be highlighted, only cut", () => {
    const { getByRole } = render(<SelectionPopover {...base} canHighlight={false} onHighlight={vi.fn()} />);
    expect((getByRole("button", { name: "question" }) as HTMLButtonElement).disabled).toBe(true);
    expect((getByRole("button", { name: "Cut" }) as HTMLButtonElement).disabled).toBe(false);
  });
});
```

In `web/src/paper/popovers.test.tsx`:
- change the TagsProvider mock to `vi.mock("../state/TagsProvider", () => ({ useTags: () => ({ tags: [{ id: "t-q", name: "question", colour: "#7C3AED" }], byId: new Map() }) }));`;
- change the first MarkPopover test to open the tag list first:
```tsx
  it("Delete typed into a text field is the field's; Delete elsewhere removes the mark once", () => {
    const { getByLabelText } = render(<MarkPopover highlight={board.highlights[0]} at={at} addTag onClose={() => undefined} onConnect={() => undefined} />);
    fireEvent.keyDown(getByLabelText("New tag"), { key: "Backspace" });
    expect(dispatch).not.toHaveBeenCalled();
    fireEvent.keyDown(window, { key: "Delete" });
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith({ type: "remove", highlightIds: ["h-1"] });
  });
```
- add:
```tsx
  it("a colour sets the mark's main tag; the tag list waits behind Add tag (spec A2, A5)", () => {
    const h = { ...board.highlights[0], tags: ["t-a", "t-b"] };
    const { getByRole, queryByLabelText } = render(<MarkPopover highlight={h} at={at} onClose={() => undefined} onConnect={() => undefined} />);
    expect(queryByLabelText("New tag")).toBeNull();
    fireEvent.click(getByRole("button", { name: "question" }));
    expect(dispatch).toHaveBeenCalledWith({ type: "setTags", target: "highlight", id: "h-1", tags: ["t-q", "t-b"] });
    fireEvent.click(getByRole("button", { name: "Add tag" }));
    expect(queryByLabelText("New tag")).not.toBeNull();
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd web && npx vitest run src/paper/SelectionPopover.test.tsx src/paper/popovers.test.tsx`
Expected: FAIL. The buttons are still "Highlight"/"Cut", and there is no `addTag` prop.

- [ ] **Step 3: Implement the selection bar**

Replace `web/src/paper/SelectionPopover.tsx` with:
```tsx
import { useRef } from "react";
import type { MenuItem } from "../commands/registry";
import { TagDots } from "../tags/TagDots";
import { ActionMenu } from "../ui/ActionMenu";
import { useDismiss } from "../ui/useDismiss";
import { popoverPlace } from "./place";

type Props = {
  at: DOMRect; preview: string; busy: boolean; canHighlight: boolean;
  onHighlight: (tagId: string | null) => void; onCut: () => void; onDismiss: () => void; onOpen?: () => void; onFind?: () => void;
  menu: MenuItem[];
};

const POPOVER_WIDTH = 300;
const POPOVER_HEIGHT = 92;   // preview line plus the action row, measured at the default zoom

/** One selection, then one bar (spec A2): a colour highlights with that main tag, ✂ cuts, 🔍 finds, › holds the rest.
 *  A selection that crosses a column or a page is several rects; a highlight holds them all (D1). */
export function SelectionPopover({ at, preview, busy, canHighlight, onHighlight, onCut, onDismiss, onOpen, onFind, menu }: Props) {
  const box = useRef<HTMLDivElement>(null);
  useDismiss(box, onDismiss);
  const { left, top } = popoverPlace(at, POPOVER_WIDTH, POPOVER_HEIGHT);
  return (
    <div ref={box} className="popover selection-popover" role="dialog" aria-label="Selection" style={{ left, top }} onMouseDown={(e) => e.stopPropagation()}>
      <div className="popover-preview" title={preview}>{preview}</div>
      <div className="popover-actions">
        <TagDots onPick={onHighlight} disabled={busy || !canHighlight} plainLabel="Highlight" />
        <span className="bar-sep" aria-hidden="true" />
        <button className="quiet glyph" aria-label="Cut" title="Cut this out as a piece on the board" disabled={busy} onClick={onCut}>✂</button>
        {onFind && <button className="quiet glyph" aria-label="Find" title="Every place these words appear in the paper" onClick={onFind}>🔍</button>}
        {onOpen && <button className="action" onClick={onOpen} title="This section is already a piece">Open on board</button>}
        <ActionMenu items={menu} />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Implement the mark's list and the mark popover**

`web/src/paper/MarkMenu.tsx`:
```tsx
import type { Highlight } from "../model/types";
import { AskElsewhere } from "./AskElsewhere";

type Props = { highlight: Highlight; onAddTag: () => void; onConnect: () => void; onAddNote: () => void };

/** The same list as a selection's ›, for a mark: its right-click (spec A2). */
export function MarkMenu({ highlight, onAddTag, onConnect, onAddNote }: Props) {
  return (
    <>
      <button type="button" className="action" role="menuitem" onClick={onAddTag}>Add tag</button>
      <button type="button" className="action" role="menuitem" onClick={onConnect} title="Then click another mark or a section heading">Connect</button>
      <button type="button" className="action" role="menuitem" onClick={onAddNote}>Add note</button>
      <AskElsewhere highlight={highlight} />
    </>
  );
}
```

In `web/src/paper/MarkPopover.tsx`:
- import `TagDots` from `../tags/TagDots`, `TagChips` from `../tags/TagChips`, and `addTag`, `setMainTag` from `../tags/mainTag`;
- change `Props` to `{ highlight: Highlight; at: DOMRect; addTag?: boolean; onClose: () => void; onConnect: () => void }`;
- change the signature to `export function MarkPopover({ highlight, at, addTag: startAdding = false, onClose, onConnect }: Props)`;
- add `const [adding, setAdding] = useState(startAdding);` and `const setTags = (tags: string[]) => dispatch({ type: "setTags", target: "highlight", id: highlight.id, tags });`;
- replace the `<TagPicker ... />` line with:
```tsx
      <div className="mark-tags">
        <TagDots current={highlight.tags[0] ?? null} onPick={(id) => setTags(setMainTag(highlight.tags, id))} />
        <TagChips ids={highlight.tags.slice(1)} />
      </div>
      {adding && <TagPicker value={highlight.tags} onChange={setTags} />}
```
- add `{!adding && <button className="action" onClick={() => setAdding(true)}>Add tag</button>}` as the first button in `.popover-actions`.

`addTag` is imported for Step 5's use in `PaperScreen`. If it is unused here, import it only in `PaperScreen`.

- [ ] **Step 5: Wire the bar and the list in PaperScreen**

In `web/src/PaperScreen.tsx`:
- import `type Highlight` (from model/types), `newEdge` (`./model/links`), `newNote` (`./model/notes`), `spotForNoteOn` (`./model/placement`), `extraSelectionItems` and `type MenuItem` (`./commands/registry`), and `MarkMenu` (`./paper/MarkMenu`);
- change `type OpenMark = { id: string; at: DOMRect; addTag?: boolean };`;
- `useBoard()` returns the whole handle, so keep `const board = useBoard();` alongside the existing destructure, to pass to `extraSelectionItems`;
- replace `choose` with:
```tsx
  /** Highlight (with a main tag, or plain) or cut the selection `p`. Resolves to the highlight made, if one was. */
  const chooseFor = async (p: Pending, kind: "highlight" | "cut", tagId: string | null = null): Promise<Highlight | null> => {
    setBusy(true);
    setError(null);
    let made: Highlight | null = null;
    try {
      const selection = await api.postText(paperId, p.rects, !p.exact, p.mode, p.lines);
      if (kind === "highlight") {
        made = { id: newId("h"), tags: tagId ? [tagId] : [], anchor: selection.highlight };
        dispatch({ type: "addHighlight", highlight: made });
      } else dispatch({ type: "addNode", node: await makeCut(paperId, source, state.board, selection, { mode: p.mode, sectionId: p.section?.id }) });
    } catch (failure) {
      console.error(SELECTION_FAILED_MESSAGE, failure);
      setError(SELECTION_FAILED_MESSAGE);
    } finally {
      setBusy(false);
      setPending(null);
      window.getSelection()?.removeAllRanges();
    }
    return made;
  };
  const choose = (kind: "highlight" | "cut", tagId: string | null = null) => (pending ? chooseFor(pending, kind, tagId) : Promise.resolve(null));
```
- add the note and menu helpers:
```tsx
  /** A note of the reader's own, connected to the mark: one undo step (SPEC 5.1). */
  const addNoteOn = (h: Highlight) => {
    const note = newNote({ ...spotForNoteOn({ ...state.board, highlights: [...state.board.highlights, h] }, h.id), origin: "reader" });
    dispatch({ type: "add", nodes: [note], edges: [newEdge(h.id, note.id)] });
  };
  /** A selection's ›: each item first makes a plain highlight, then acts on it (a mark is what these act on). */
  const selectionMenu = (p: Pending): MenuItem[] => {
    if (p.section) return [];
    const markThen = (then: (h: Highlight) => void) => () => { void chooseFor(p, "highlight").then((h) => { if (h) then(h); }); };
    return [
      { id: "add-tag", label: "Add tag", run: markThen((h) => setOpenMark({ id: h.id, at: p.at, addTag: true })) },
      { id: "connect", label: "Connect", run: markThen((h) => connect.start(h.id)) },
      { id: "add-note", label: "Add note", run: markThen(addNoteOn) },
      { id: "ask", label: "Ask elsewhere", run: markThen((h) => setMarkMenu({ id: h.id, at: p.at })) },
      ...extraSelectionItems({ on: "paper", text: p.text, rects: p.rects, at: p.at }, board),
    ];
  };
```
- in `selectionPopover`, pass `onHighlight={(tagId) => void choose("highlight", tagId)}` and `menu={selectionMenu(p)}`;
- give `<MarkPopover>` the prop `addTag={openMark.addTag}`;
- replace the mark's `ContextMenu` children:
```tsx
        <ContextMenu at={markMenu.at} label="Mark" onClose={closeMarkMenu}>
          <MarkMenu highlight={menuMark}
                    onAddTag={() => { setMarkMenu(null); setOpenMark({ id: menuMark.id, at: markMenu.at, addTag: true }); }}
                    onConnect={() => { setMarkMenu(null); connect.start(menuMark.id); }}
                    onAddNote={() => { setMarkMenu(null); addNoteOn(menuMark); }} />
        </ContextMenu>
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd web && npx vitest run && npx tsc --noEmit`
Expected: PASS.

E2e this task breaks (Task 11 fixes them):
- `step5.spec.ts:373`: `popover.getByLabel("question").check()` becomes a dot click.
- `step5.spec.ts:473`: the group Tags checkbox is unchanged (NodeTags stays), so it should still pass. Verify.

- [ ] **Step 7: Commit**

```bash
git add web/src/paper/SelectionPopover.tsx web/src/paper/SelectionPopover.test.tsx web/src/paper/MarkMenu.tsx web/src/paper/MarkPopover.tsx web/src/paper/popovers.test.tsx web/src/PaperScreen.tsx
git commit -m "feat: colour dots, cut, find and › beside a selection on the paper"
```

---

### Task 6: The selection bar on a card's text

**Files:**
- Modify: `web/src/board/TextPopover.tsx`
- Modify: `web/src/board/TextPopover.test.tsx`
- Modify: `web/src/board/BoardView.tsx`

**Interfaces:**
- Consumes: `TagDots` (Task 1); `ActionMenu`, `extraSelectionItems` (Task 3); `useBoardActions().find` (Task 4).
- Produces:
  - `TextPopover` props become `{ selection: CardSelection; menuOpen?: boolean; onClose: () => void }`. The row holds dots (plain "Highlight"), "Cut out" (✂), "Find" (🔍) and "More actions" (›).
  - The › items are Add tag, Add note, Ask elsewhere, Split here, then extensions.
  - `BoardView`'s `textMenu` state loses `actions` and gains `menuOpen: boolean`.
  - The `TextActions` type is deleted.

- [ ] **Step 1: Write the failing tests**

In `web/src/board/TextPopover.test.tsx`:
- add the mocks:
```tsx
vi.mock("./BoardActions", () => ({ useBoardActions: () => ({ find }) }));
vi.mock("../state/TagsProvider", () => ({ useTags: () => ({ tags: [{ id: "t-q", name: "question", colour: "#7C3AED" }], byId: new Map() }) }));
```
- declare `const find = vi.fn();` next to `dispatch`;
- replace the first test with:
```tsx
  it("reads: colour dots | ✂ 🔍 ›, with Split here in the › (spec A2)", () => {
    const { getByRole, queryByRole } = render(<TextPopover selection={selection} onClose={vi.fn()} />);
    expect(getByRole("button", { name: "Highlight" })).toBeTruthy();
    expect(getByRole("button", { name: "Cut out" })).toBeTruthy();
    expect(queryByRole("menuitem", { name: "Split here" })).toBeNull();
    fireEvent.click(getByRole("button", { name: "More actions" }));
    expect(getByRole("menuitem", { name: "Split here" })).toBeTruthy();
  });
  it("opens with the › list shown on a right-click", () => {
    const { getByRole } = render(<TextPopover selection={selection} menuOpen onClose={vi.fn()} />);
    expect(getByRole("menuitem", { name: "Split here" })).toBeTruthy();
  });
  it("a colour highlights with that main tag; 🔍 finds the words in the paper", async () => {
    const anchor = { rects: region.rects, quote: q("residual learning"), position: 9, state: "anchored" as const };
    vi.mocked(api.highlightInChunk).mockResolvedValue(anchor);
    const { getByRole } = render(<TextPopover selection={selection} onClose={vi.fn()} />);
    fireEvent.click(getByRole("button", { name: "Find" }));
    expect(find).toHaveBeenCalledWith("residual learning");
    fireEvent.click(getByRole("button", { name: "question" }));
    await waitFor(() => expect(dispatch).toHaveBeenCalledWith({ type: "addHighlight", highlight: { id: expect.stringMatching(/^h-/), tags: ["t-q"], anchor } }));
  });
```
- in the "Cut out" and "Split here" tests, replace `actions="recut"` with `menuOpen`. The "Split here" button is now `getByRole("menuitem", { name: "Split here" })`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd web && npx vitest run src/board/TextPopover.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement**

In `web/src/board/TextPopover.tsx`:
- delete `export type TextActions` and the `actions` prop;
- import `type Highlight` and `type MenuItem`/`extraSelectionItems` (`../commands/registry`), `newEdge` (`../model/links`), `newNote` (`../model/notes`), `spotForNoteOn` (`../model/placement`), `AskElsewhere` (`../paper/AskElsewhere`), `TagDots` (`../tags/TagDots`), `TagPicker` (`../tags/TagPicker`), `ActionMenu` (`../ui/ActionMenu`) and `useBoardActions` (`./BoardActions`);
- make the signature `export function TextPopover({ selection, menuOpen = false, onClose }: { selection: CardSelection; menuOpen?: boolean; onClose: () => void })`;
- take the whole handle: `const board = useBoard(); const { state, dispatch, paperId } = board; const { find } = useBoardActions();`;
- add `const [made, setMade] = useState<{ about: CardSelection; mark: Highlight; then: "tag" | "ask" } | null>(null);`.

`run(act)` closes the popover when `act` resolves to `null`. Keep it, and add a `mark` helper that returns the highlight so the › items can build on it:
```tsx
  const mark = async (tagId: string | null): Promise<Highlight> => {
    const anchor = await api.highlightInChunk(paperId, chunk.data.region, selection.quote);
    return { id: newId("h"), tags: tagId ? [tagId] : [], anchor };
  };
  const highlight = (tagId: string | null) => run(async () => {
    dispatch({ type: "addHighlight", highlight: await mark(tagId) });
    return null;
  });
  /** Add note: the mark and a note of the reader's own connected to it, one undo step. */
  const addNote = () => run(async () => {
    const h = await mark(null);
    const note = newNote({ ...spotForNoteOn({ ...state.board, highlights: [...state.board.highlights, h] }, h.id), origin: "reader" });
    dispatch({ type: "add", highlights: [h], nodes: [note], edges: [newEdge(h.id, note.id)] });
    return null;
  });
  /** Add tag and Ask elsewhere: the mark first; the popover stays open to show what comes next. */
  const markThen = (then: "tag" | "ask") => void (async () => {
    setBusy(true);
    try {
      const h = await mark(null);
      dispatch({ type: "addHighlight", highlight: h });
      setMade({ about: selection, mark: h, then });
    } catch (failure) {
      console.error("board text action failed", failure);
      setSaid({ about: selection, text: (failure as { code?: string }).code === "quote_not_found" ? NOT_FOUND_MESSAGE : FAILED_MESSAGE });
    } finally {
      setBusy(false);
    }
  })();
  const menu: MenuItem[] = [
    { id: "add-tag", label: "Add tag", run: () => markThen("tag") },
    { id: "add-note", label: "Add note", run: () => void addNote() },
    { id: "ask", label: "Ask elsewhere", run: () => markThen("ask") },
    { id: "split", label: "Split here", title: "Divide this piece where the selection starts", run: () => void recut("split") },
    ...extraSelectionItems({ on: "card", text: selection.quote.exact, nodeId: chunk.id, quote: selection.quote, at: selection.at }, board),
  ];
  const shown = made?.about === selection ? made : null;
  const liveMark = shown && state.board.highlights.find((h) => h.id === shown.mark.id);
```
Replace the `popover-actions` contents with:
```tsx
        <TagDots onPick={(tagId) => void highlight(tagId)} disabled={busy} plainLabel="Highlight" />
        <span className="bar-sep" aria-hidden="true" />
        <button className="quiet glyph" aria-label="Cut out" title="Make the selected lines a piece of their own" disabled={busy} onClick={() => void recut("cut")}>✂</button>
        <button className="quiet glyph" aria-label="Find" title="Every place these words appear in the paper" onClick={() => find(selection.quote.exact)}>🔍</button>
        <ActionMenu items={menu} initiallyOpen={menuOpen} />
```
and after the `popover-actions` div:
```tsx
      {liveMark && shown?.then === "tag" && (
        <TagPicker value={liveMark.tags} onChange={(tags) => dispatch({ type: "setTags", target: "highlight", id: liveMark.id, tags })} />
      )}
      {liveMark && shown?.then === "ask" && <AskElsewhere highlight={liveMark} />}
```

Connect is left out on card text: see Ambiguity 3 at the end of this plan.

In `web/src/board/BoardView.tsx`:
- import only `TextPopover`;
- change the state to `useState<(CardSelection & { menuOpen: boolean }) | null>(null)`;
- in `openMenu`: `setTextMenu({ ...words, at: new DOMRect(point.x, point.y, 0, 0), menuOpen: true });`;
- in `onBoardMouseUp`: `if (next !== undefined) setTextMenu(next && { ...next, menuOpen: false });`;
- render `{textMenu && <TextPopover selection={textMenu} menuOpen={textMenu.menuOpen} onClose={closeTextMenu} />}`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd web && npx vitest run && npx tsc --noEmit`
Expected: PASS.

E2e this task breaks (fixed in Task 11):
- `step6.spec.ts:152`: "Cut out" is now visible on a plain selection.
- `step6.spec.ts:209,216`: "Split here" is now a `menuitem`.

- [ ] **Step 5: Commit**

```bash
git add web/src/board/TextPopover.tsx web/src/board/TextPopover.test.tsx web/src/board/BoardView.tsx
git commit -m "feat: colour dots, cut out, find and › beside words selected on a card"
```

---

### Task 7: The bar over a selected card; Group · Join · ● over several

**Files:**
- Create: `web/src/board/CardBar.tsx`
- Create: `web/src/board/CardBar.test.tsx`
- Modify: `web/src/board/nodes/ChunkNode.tsx`, `FigureNode.tsx`, `NoteNode.tsx`, `GroupNode.tsx`
- Modify: `web/src/board/nodes/NoteNode.test.tsx`
- Modify: `web/src/board/SelectionBar.tsx`
- Modify: `web/src/board/SelectionBar.test.tsx`
- Modify: `web/src/model/boardReducer.ts`
- Modify: `web/src/model/boardReducer.test.ts`
- Modify: `web/src/styles/board.css`

**Interfaces:**
- Consumes: `TagDots`, `setMainTag`, `mainTagColour` (Task 1); `ActionMenu`, `MenuItem` (Task 3); `useBoardActions().openInPaper`; `Peek` from `web/src/paper/PeekLines.tsx`; `SketchEditor` from `web/src/notes/SketchEditor.tsx`.
- Produces:
  - `<CardBar id: string; tags: string[]; collapsed?: boolean; source?: PageRect; peek?: Peek; sketch?: boolean />`. It renders in a React Flow `NodeToolbar`, which by default shows only when this node is the only one selected. It is a toolbar named "Card" with buttons: the dots (plain "No colour"), "Show in paper" (↗), "Collapse card"/"Expand card" (⤢), and "More actions" (›: Add tag, More context/Less context, Sketch, Delete).
  - `useMainTagStyle(tags: string[]): { className: string; style?: React.CSSProperties }`.
  - Reducer action `{ type: "setNodeTags"; tags: Record<string, string[]> }`: one undo step for many nodes.

- [ ] **Step 1: Write the failing tests**

Add to `web/src/model/boardReducer.test.ts`:
```ts
  it("setNodeTags retags several nodes as one undo step (spec A3, ● on a multi-selection)", () => {
    const other: BoardNode = { ...note, id: "n-2" };
    let s = boardReducer(initialBoardState, { type: "load", board: { ...emptyBoard("p"), nodes: [note, other] } });
    s = boardReducer(s, { type: "setNodeTags", tags: { "n-1": ["t-q"], "n-2": ["t-q", "t-s"] } });
    expect(s.board.nodes.map((n) => n.data.tags)).toEqual([["t-q"], ["t-q", "t-s"]]);
    s = boardReducer(s, { type: "undo" });
    expect(s.board.nodes.map((n) => n.data.tags)).toEqual([[], []]);
  });
```

`web/src/board/CardBar.test.tsx`:
```tsx
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { emptyBoard, type BoardNode } from "../model/types";

const dispatch = vi.fn();
const openInPaper = vi.fn();
const note: BoardNode = { id: "n-1", type: "note", position: { x: 0, y: 0 }, data: { tags: ["t-a", "t-b"], collapsed: false, note: "notes/n-1.md" } };
vi.mock("@xyflow/react", () => ({ NodeToolbar: ({ children }: { children: React.ReactNode }) => <div>{children}</div>, Position: { Top: "top" } }));
vi.mock("../state/BoardProvider", () => ({ useBoard: () => ({ state: { board: { ...emptyBoard("p"), nodes: [note] } }, dispatch }) }));
vi.mock("../state/TagsProvider", () => ({ useTags: () => ({ tags: [{ id: "t-q", name: "question", colour: "#7C3AED" }], byId: new Map() }) }));
vi.mock("./BoardActions", () => ({ useBoardActions: () => ({ openInPaper }) }));
vi.mock("../notes/SketchEditor", () => ({ SketchEditor: () => <div role="dialog" aria-label="Sketch" /> }));
vi.mock("../tags/TagPicker", () => ({ TagPicker: () => <input aria-label="New tag" /> }));
import { CardBar } from "./CardBar";

afterEach(() => { cleanup(); vi.clearAllMocks(); });
const rect = { page: 2, rect: [0, 0, 1, 1] as [number, number, number, number] };

describe("CardBar (spec A3)", () => {
  it("reads: colour dots | ↗ ⤢ › for a piece", () => {
    const { getByRole } = render(<CardBar id="n-1" tags={[]} collapsed={false} source={rect} />);
    const names = Array.from(getByRole("toolbar", { name: "Card" }).querySelectorAll("button")).map((b) => b.getAttribute("aria-label"));
    expect(names).toEqual(["No colour", "question", "Show in paper", "Collapse card", "More actions"]);
  });
  it("a colour sets the card's main tag, keeping its extras", () => {
    const { getByRole } = render(<CardBar id="n-1" tags={["t-a", "t-b"]} collapsed={false} />);
    fireEvent.click(getByRole("button", { name: "question" }));
    expect(dispatch).toHaveBeenCalledWith({ type: "setTags", target: "node", id: "n-1", tags: ["t-q", "t-b"] });
  });
  it("↗ shows the source; ⤢ collapses", () => {
    const { getByRole } = render(<CardBar id="n-1" tags={[]} collapsed={false} source={rect} />);
    fireEvent.click(getByRole("button", { name: "Show in paper" }));
    expect(openInPaper).toHaveBeenCalledWith(rect);
    fireEvent.click(getByRole("button", { name: "Collapse card" }));
    expect(dispatch).toHaveBeenCalledWith({ type: "replaceNode", node: { ...note, data: { ...note.data, collapsed: true } } });
  });
  it("› holds Add tag, Sketch (a note only) and Delete", () => {
    const { getByRole, getAllByRole } = render(<CardBar id="n-1" tags={[]} collapsed={false} sketch />);
    fireEvent.click(getByRole("button", { name: "More actions" }));
    expect(getAllByRole("menuitem").map((b) => b.textContent)).toEqual(["Add tag", "Sketch", "Delete"]);
    fireEvent.click(getByRole("menuitem", { name: "Delete" }));
    expect(dispatch).toHaveBeenCalledWith({ type: "remove", nodeIds: ["n-1"] });
  });
});
```

In `web/src/board/SelectionBar.test.tsx`:
- add `vi.mock("../state/TagsProvider", () => ({ useTags: () => ({ tags: [{ id: "t-q", name: "question", colour: "#7C3AED" }] }) }));`;
- in the first test, replace `expect(queryByRole("button", { name: "Group" })).toBeNull();` with `expect(queryByRole("button", { name: "Group" })).not.toBeNull();`;
- add:
```tsx
  it("● colours every selected piece as one step", () => {
    const a = chunk("n-a", 0), b = { ...chunk("n-b", 300), data: { ...chunk("n-b", 300).data, tags: ["t-x", "t-y"] } };
    vi.mocked(api.join).mockResolvedValue(null);
    const { getByRole } = render(<SelectionBar selected={[a, b]} onGroup={vi.fn()} />);
    fireEvent.click(getByRole("button", { name: "question" }));
    expect(dispatch).toHaveBeenCalledWith({ type: "setNodeTags", tags: { "n-a": ["t-q"], "n-b": ["t-q", "t-y"] } });
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd web && npx vitest run src/model/boardReducer.test.ts src/board/CardBar.test.tsx src/board/SelectionBar.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement the reducer action**

In `web/src/model/boardReducer.ts`:
- add `| { type: "setNodeTags"; tags: Record<string, string[]> }` to `EditAction`;
- add `case "setNodeTags": return setNodeTags(board, action.tags);` to `applyEdit`;
- add:
```ts
/** Several nodes retagged at once (● on a multi-selection): one undo step. */
function setNodeTags(board: Board, tags: Record<string, string[]>): Board {
  return { ...board, nodes: board.nodes.map((n) => (n.id in tags ? ({ ...n, data: { ...n.data, tags: tags[n.id] } } as BoardNode) : n)) };
}
```

- [ ] **Step 4: Implement CardBar**

`web/src/board/CardBar.tsx`:
```tsx
import { useState } from "react";
import { NodeToolbar, Position } from "@xyflow/react";
import type { MenuItem } from "../commands/registry";
import type { BoardNode, PageRect } from "../model/types";
import { SketchEditor } from "../notes/SketchEditor";
import type { Peek } from "../paper/PeekLines";
import { useBoard } from "../state/BoardProvider";
import { useTags } from "../state/TagsProvider";
import { mainTagColour, setMainTag } from "../tags/mainTag";
import { TagDots } from "../tags/TagDots";
import { TagPicker } from "../tags/TagPicker";
import { ActionMenu } from "../ui/ActionMenu";
import { useBoardActions } from "./BoardActions";

type Props = { id: string; tags: string[]; collapsed?: boolean; source?: PageRect; peek?: Peek; sketch?: boolean };

/** A card's main tag as a thin coloured edge (spec A3). */
export function useMainTagStyle(tags: string[]): { className: string; style?: React.CSSProperties } {
  const colour = mainTagColour(tags, useTags().byId);
  return colour ? { className: "tagged", style: { "--main-tag": colour } as React.CSSProperties } : { className: "" };
}

/** The bar over one selected card (spec A3): colour dots | ↗ ⤢ ›. React Flow shows a NodeToolbar only while its node is
 *  the one node selected. */
export function CardBar({ id, tags, collapsed, source, peek, sketch = false }: Props) {
  const { state, dispatch } = useBoard();
  const { openInPaper } = useBoardActions();
  const [adding, setAdding] = useState(false);
  const [sketching, setSketching] = useState(false);
  const setTags = (next: string[]) => dispatch({ type: "setTags", target: "node", id, tags: next });
  const toggle = () => {
    const node = state.board.nodes.find((n) => n.id === id);
    if (node) dispatch({ type: "replaceNode", node: { ...node, data: { ...node.data, collapsed: !collapsed } } as BoardNode });
  };
  const items: MenuItem[] = [
    { id: "add-tag", label: "Add tag", run: () => setAdding(true) },
    ...(peek ? [{ id: "context", label: peek.open ? "Less context" : "More context", run: peek.toggle }] : []),
    ...(sketch ? [{ id: "sketch", label: "Sketch", run: () => setSketching(true) }] : []),
    { id: "delete", label: "Delete", run: () => dispatch({ type: "remove", nodeIds: [id] }) },
  ];
  return (
    <NodeToolbar position={Position.Top}>
      <div className="card-bar nodrag" role="toolbar" aria-label="Card" onMouseDown={(e) => e.stopPropagation()}>
        <TagDots current={tags[0] ?? null} onPick={(tagId) => setTags(setMainTag(tags, tagId))} />
        <span className="bar-sep" aria-hidden="true" />
        {source && <button type="button" className="quiet" aria-label="Show in paper" title="Show where this is in the paper" onClick={() => openInPaper(source)}>↗</button>}
        {collapsed !== undefined && (
          <button type="button" className="quiet" aria-label={collapsed ? "Expand card" : "Collapse card"} onClick={toggle}>⤢</button>
        )}
        <ActionMenu items={items} />
      </div>
      {adding && <div className="node-tags-picker nodrag nowheel"><TagPicker value={tags} onChange={setTags} /></div>}
      {sketching && <SketchEditor noteId={id} onClose={() => setSketching(false)} />}
    </NodeToolbar>
  );
}
```

- [ ] **Step 5: Put the bar and the edge on each card**

- `ChunkNode.tsx`:
  - add `const main = useMainTagStyle(data.tags);`;
  - give the outer div `className={[classes, main.className].join(" ")} style={main.style}`;
  - render `<CardBar id={id} tags={data.tags} collapsed={data.collapsed} source={data.region.rects[0]} peek={peek} />` as its first child.
- `FigureNode.tsx`: the same, with `<CardBar id={id} tags={data.tags} collapsed={data.collapsed} source={data.region.rects[0]} />`.
- `NoteNode.tsx`: the same, with `<CardBar id={id} tags={data.tags} collapsed={data.collapsed} sketch />`.
- `GroupNode.tsx`: the same, with `<CardBar id={id} tags={data.tags} />` (no collapse, no source).
- `NoteNode.test.tsx`: add `vi.mock("../CardBar", () => ({ CardBar: () => null, useMainTagStyle: () => ({ className: "" }) }));`.

The existing head controls (CollapseToggle, ↗, more context, Sketch, the ⋯ tags toggle) stay: they are hover-only already (spec A3, last line). See Ambiguity 5 at the end of this plan.

- [ ] **Step 6: Group · Join · ● over several**

In `web/src/board/SelectionBar.tsx`:
- import `setMainTag` and `TagDots`;
- replace the returned JSX with:
```tsx
    <div className="selection-bar" role="toolbar" aria-label="Selected pieces">
      <span className="tool-note">{selected.length} selected</span>
      <button onClick={() => onGroup(selected.map((n) => n.id))} title="Put these in a new group">Group</button>
      {join && <button onClick={() => dispatch({ type: "reshape", ...joinPlan(chunks, join) })} title="Make these neighbours in the paper one piece again">Join</button>}
      <TagDots onPick={(tagId) => dispatch({ type: "setNodeTags", tags: Object.fromEntries(selected.map((n) => [n.id, setMainTag(n.data.tags, tagId)])) })} />
    </div>
```
- delete the now-unused `waiting`.

Append to `web/src/styles/board.css`:
```css
/* a card's main tag: a thin coloured edge (spec A3) */
.node.tagged { box-shadow: inset 3px 0 0 var(--main-tag), var(--shadow-card); }
/* the bar over one selected card */
.card-bar { display: flex; align-items: center; gap: 6px; padding: 4px 6px; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); box-shadow: var(--shadow-raised); }
.card-bar button.quiet { padding: 2px 6px; font-size: 14px; }
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `cd web && npx vitest run && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add web/src/board/CardBar.tsx web/src/board/CardBar.test.tsx web/src/board/nodes web/src/board/SelectionBar.tsx web/src/board/SelectionBar.test.tsx web/src/model/boardReducer.ts web/src/model/boardReducer.test.ts web/src/styles/board.css
git commit -m "feat: a bar over a selected card, and Group · Join · ● over several"
```

---

### Task 8: ⌘K and the top bar

**Files:**
- Create: `web/src/commands/useSplit.ts`
- Create: `web/src/commands/useSplit.test.tsx`
- Create: `web/src/commands/shellCommands.ts`
- Create: `web/src/commands/CommandPalette.tsx`
- Create: `web/src/commands/CommandPalette.test.tsx`
- Create: `web/src/commands/useCommandKeys.ts`
- Create: `web/src/commands/useCommandKeys.test.ts`
- Create: `web/src/commands/ShortcutsSheet.tsx`
- Create: `web/src/panels/useQuestions.ts`
- Modify: `web/src/panels/QuestionList.tsx`
- Modify: `web/src/App.tsx`
- Modify: `web/src/styles/shell.css`
- Delete: `web/src/MoreMenu.tsx`, `web/src/MoreMenu.test.tsx`

**Interfaces:**
- Consumes: `Command`, `filterCommands`, `extraCommands` (Task 3); `requestFind` (Task 4); `isTextField` from `web/src/state/keys.ts`.
- Produces:
  - `export type Panel = "questions" | "glossary" | "export" | "tags" | "template"` (moved from MoreMenu into `shellCommands.ts`).
  - `shellCommands(d: ShellDeps): Command[]`.
  - `useSplit(): { busy; said; run }` and `SPLIT_FAILED_MESSAGE` (moved).
  - `<CommandPalette commands onClose />`: a dialog named "Commands" with a field "Search commands" and a listbox of options.
  - `useCommandKeys({ onPalette, onShortcuts })`.
  - `useQuestions(): { questions: Question[] | null; error: string | null }`.
  - The top-bar button is named "Commands (⌘K)". Questions and Glossary show only when their count is above 0, with the count in an `aria-hidden` badge, so their accessible names stay "Questions" and "Glossary".

- [ ] **Step 1: Write the failing tests**

`web/src/commands/useSplit.test.tsx` holds the four split tests from `MoreMenu.test.tsx`, moved onto the hook:
```tsx
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const split = vi.fn<() => Promise<number>>();
vi.mock("../state/BoardProvider", () => ({
  FLUSH_FAILED_MESSAGE: "Some changes could not be saved yet, so this was not done. Try again once saving works.",
  useBoard: () => ({ split }),
}));
import { FLUSH_FAILED_MESSAGE } from "../state/BoardProvider";
import { SPLIT_FAILED_MESSAGE, useSplit } from "./useSplit";

afterEach(() => { cleanup(); vi.restoreAllMocks(); split.mockReset(); });

async function said(): Promise<string | null> {
  const { result } = renderHook(() => useSplit());
  await act(() => result.current.run());
  return result.current.said;
}

describe("Add missing sections (split, D16)", () => {
  it("says how many pieces went into the tray", async () => { split.mockResolvedValueOnce(1); expect(await said()).toBe("Added 1 piece to the tray"); });
  it("says so when nothing was missing", async () => { split.mockResolvedValueOnce(0); expect(await said()).toBe("Every section and figure is already on the board"); });
  it("says a pending change could not be saved, when that stopped it", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    split.mockRejectedValueOnce(new Error(FLUSH_FAILED_MESSAGE));
    expect(await said()).toBe(FLUSH_FAILED_MESSAGE);
  });
  it("says the split failed otherwise", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    split.mockRejectedValueOnce(new Error("500"));
    expect(await said()).toBe(SPLIT_FAILED_MESSAGE);
  });
});
```

`web/src/commands/CommandPalette.test.tsx`:
```tsx
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CommandPalette } from "./CommandPalette";
import { shellCommands } from "./shellCommands";

afterEach(cleanup);
const deps = () => ({ openPanel: vi.fn(), newNote: vi.fn(), find: vi.fn(), split: vi.fn(), shortcuts: vi.fn() });

describe("⌘K (spec A1)", () => {
  it("lists every command", () => {
    const { getAllByRole } = render(<CommandPalette commands={shellCommands(deps())} onClose={vi.fn()} />);
    expect(getAllByRole("option").map((o) => o.textContent)).toEqual(
      ["Export", "Tags", "Template", "Add missing sections", "New note", "Find in paper", "Shortcuts"]);
  });
  it("filters as you type, and Enter runs the first match and closes", () => {
    const d = deps();
    const onClose = vi.fn();
    const { getByRole, getAllByRole } = render(<CommandPalette commands={shellCommands(d)} onClose={onClose} />);
    const field = getByRole("textbox", { name: "Search commands" });
    fireEvent.change(field, { target: { value: "tag" } });
    expect(getAllByRole("option").map((o) => o.textContent)).toEqual(["Tags"]);
    fireEvent.keyDown(field, { key: "Enter" });
    expect(d.openPanel).toHaveBeenCalledWith("tags");
    expect(onClose).toHaveBeenCalled();
  });
  it("arrows move the choice", () => {
    const d = deps();
    const { getByRole } = render(<CommandPalette commands={shellCommands(d)} onClose={vi.fn()} />);
    const field = getByRole("textbox", { name: "Search commands" });
    fireEvent.keyDown(field, { key: "ArrowDown" });
    fireEvent.keyDown(field, { key: "Enter" });
    expect(d.openPanel).toHaveBeenCalledWith("tags");
  });
  it("says so when nothing matches", () => {
    const { getByRole, getByText } = render(<CommandPalette commands={shellCommands(deps())} onClose={vi.fn()} />);
    fireEvent.change(getByRole("textbox", { name: "Search commands" }), { target: { value: "zzz" } });
    expect(getByText("No command matches.")).toBeTruthy();
  });
});
```

`web/src/commands/useCommandKeys.test.ts`:
```ts
import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useCommandKeys } from "./useCommandKeys";

afterEach(cleanup);

describe("useCommandKeys (Review Focus 5)", () => {
  it("⌘K and Ctrl-K open the palette, even from a text field", () => {
    const onPalette = vi.fn();
    renderHook(() => useCommandKeys({ onPalette, onShortcuts: vi.fn() }));
    const field = document.body.appendChild(document.createElement("input"));
    field.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true, bubbles: true }));
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "K", ctrlKey: true }));
    expect(onPalette).toHaveBeenCalledTimes(2);
    field.remove();
  });
  it("? opens the shortcuts, but not while typing", () => {
    const onShortcuts = vi.fn();
    renderHook(() => useCommandKeys({ onPalette: vi.fn(), onShortcuts }));
    const field = document.body.appendChild(document.createElement("textarea"));
    field.dispatchEvent(new KeyboardEvent("keydown", { key: "?", bubbles: true }));
    expect(onShortcuts).not.toHaveBeenCalled();
    document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "?", bubbles: true }));
    expect(onShortcuts).toHaveBeenCalledTimes(1);
    field.remove();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd web && npx vitest run src/commands`
Expected: FAIL with unresolved imports.

- [ ] **Step 3: Move split into a hook**

`web/src/commands/useSplit.ts`. The code is moved unchanged from `MoreMenu.tsx`:
```ts
import { useState } from "react";
import { FLUSH_FAILED_MESSAGE, useBoard } from "../state/BoardProvider";

export const SPLIT_FAILED_MESSAGE = "Could not add the missing sections. Nothing was added.";
const splitDone = (added: number) => (added ? `Added ${added} piece${added === 1 ? "" : "s"} to the tray` : "Every section and figure is already on the board");
/** A failed save before the split says why in its own words; anything else is the split's own failure. */
const splitFailed = (failure: unknown) => (failure instanceof Error && failure.message === FLUSH_FAILED_MESSAGE ? FLUSH_FAILED_MESSAGE : SPLIT_FAILED_MESSAGE);

/** "Add missing sections" (split, D16): every section and figure the board lacks, into the tray. */
export function useSplit() {
  const { split } = useBoard();
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<string | null>(null);
  const run = async () => {
    setBusy(true);
    try {
      setSaid(splitDone(await split()));
    } catch (failure) {
      console.error(SPLIT_FAILED_MESSAGE, failure);
      setSaid(splitFailed(failure));
    } finally {
      setBusy(false);
    }
  };
  return { busy, said, run };
}
```

- [ ] **Step 4: The commands, the palette, the keys, the sheet**

`web/src/commands/shellCommands.ts`:
```ts
import type { Command } from "./registry";

export type Panel = "questions" | "glossary" | "export" | "tags" | "template";
export type ShellDeps = { openPanel: (panel: Panel) => void; newNote: () => void; find: () => void; split: () => void; shortcuts: () => void };

/** Every command ⌘K lists (spec A1), in this order; features such as AI help add theirs through the registry. */
export function shellCommands(d: ShellDeps): Command[] {
  return [
    { id: "export", label: "Export", run: () => d.openPanel("export") },
    { id: "tags", label: "Tags", keywords: "colours", run: () => d.openPanel("tags") },
    { id: "template", label: "Template", keywords: "slots questions", run: () => d.openPanel("template") },
    { id: "split", label: "Add missing sections", keywords: "split tray", title: "Add every section and figure the board does not have yet, into the tray", run: d.split },
    { id: "new-note", label: "New note", keywords: "write", run: d.newNote },
    { id: "find", label: "Find in paper", keywords: "search", run: d.find },
    { id: "shortcuts", label: "Shortcuts", keywords: "keys gestures help ?", run: d.shortcuts },
  ];
}
```

`web/src/commands/CommandPalette.tsx`:
```tsx
import { useRef, useState } from "react";
import { useDismiss } from "../ui/useDismiss";
import { filterCommands, type Command } from "./registry";

/** ⌘K (spec A1): one searchable list of every command. Arrows choose, Enter runs, Escape or a press outside closes. */
export function CommandPalette({ commands, onClose }: { commands: Command[]; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  useDismiss(box, onClose);
  const shown = filterCommands(commands, query);
  const run = (command: Command | undefined) => { if (!command) return; onClose(); command.run(); };
  const onKey = (event: React.KeyboardEvent) => {
    if (event.key === "ArrowDown") { event.preventDefault(); setActive((a) => Math.min(a + 1, shown.length - 1)); }
    if (event.key === "ArrowUp") { event.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    if (event.key === "Enter") { event.preventDefault(); run(shown[active]); }
  };
  return (
    <div className="palette-backdrop">
      <div ref={box} className="palette" role="dialog" aria-label="Commands">
        <input autoFocus aria-label="Search commands" placeholder="Type a command" value={query} onKeyDown={onKey}
               onChange={(e) => { setQuery(e.target.value); setActive(0); }} />
        <ul role="listbox" aria-label="Commands">
          {shown.map((c, i) => (
            <li key={c.id}>
              <button type="button" role="option" aria-selected={i === active} title={c.title} onMouseEnter={() => setActive(i)} onClick={() => run(c)}>{c.label}</button>
            </li>
          ))}
        </ul>
        {!shown.length && <p className="hint">No command matches.</p>}
      </div>
    </div>
  );
}
```

`web/src/commands/useCommandKeys.ts`:
```ts
import { useEffect } from "react";
import { isTextField } from "../state/keys";

/** ⌘K or Ctrl-K opens the palette from anywhere; `?` opens the shortcuts, except while typing (Review Focus 5). */
export function useCommandKeys({ onPalette, onShortcuts }: { onPalette: () => void; onShortcuts: () => void }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === "k") { event.preventDefault(); onPalette(); return; }
      if (event.key === "?" && !event.metaKey && !event.ctrlKey && !isTextField(event.target)) { event.preventDefault(); onShortcuts(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onPalette, onShortcuts]);
}
```

`web/src/commands/ShortcutsSheet.tsx`:
```tsx
import { useRef } from "react";
import { useDismiss } from "../ui/useDismiss";

/** Every gesture beside its button twin (spec A, "nothing is only a gesture"), and the keys. */
export const SHORTCUTS: [string, string][] = [
  ["⌘K", "All commands"],
  ["?", "This sheet"],
  ["Select text, then a colour", "Highlight with that tag"],
  ["Drag selected text onto the board", "Cut it there (or ✂)"],
  ["Drag selected lines out of a card", "Cut them out (or ✂)"],
  ["Drag from a card's edge onto a card", "Connect (or › Connect)"],
  ["Drag from a card's edge onto empty board", "A connected note"],
  ["Double-click empty board", "New note (or ⌘K)"],
  ["Drag on empty board", "Select several, then Group"],
  ["Shift-click", "Add a card to the selection"],
  ["⌘Z / ⇧⌘Z", "Undo / redo"],
  ["Delete", "Delete what is selected"],
];

export function ShortcutsSheet({ onClose }: { onClose: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  useDismiss(box, onClose);
  return (
    <div className="palette-backdrop">
      <div ref={box} className="palette shortcuts" role="dialog" aria-label="Shortcuts">
        <h3>Shortcuts</h3>
        <dl>{SHORTCUTS.map(([keys, what]) => <div key={keys}><dt>{keys}</dt><dd>{what}</dd></div>)}</dl>
      </div>
    </div>
  );
}
```

`web/src/panels/useQuestions.ts` is moved out of `QuestionList.tsx` unchanged:
```ts
import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { Question } from "../model/types";
import { useBoard } from "../state/BoardProvider";

export const QUESTIONS_FAILED_MESSAGE = "Could not load the question list.";

/** The server's question list (SPEC 5.2), fetched again whenever the board is saved. */
export function useQuestions() {
  const { paperId, state } = useBoard();
  const version = state.board.version;
  const [questions, setQuestions] = useState<Question[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    api.getQuestions(paperId).then(
      (list) => { if (live) { setQuestions(list); setError(null); } },
      (failure: unknown) => { console.error(QUESTIONS_FAILED_MESSAGE, failure); if (live) setError(QUESTIONS_FAILED_MESSAGE); });
    return () => { live = false; };
  }, [paperId, version]);
  return { questions, error };
}
```
In `web/src/panels/QuestionList.tsx`:
- replace the state and effect with `const { questions, error } = useQuestions();`;
- change the message export to `export { QUESTIONS_FAILED_MESSAGE } from "./useQuestions";`;
- drop the now-unused imports.

- [ ] **Step 5: The top bar**

In `web/src/App.tsx`:
- remove the `MoreMenu` import;
- import `type Panel`, `shellCommands` (`./commands/shellCommands`), `CommandPalette`, `ShortcutsSheet`, `useCommandKeys`, `useSplit`, `extraCommands` (`./commands/registry`), `useQuestions` (`./panels/useQuestions`), `glossary`, `termTagIds` (`./paper/term`), `useTags` (`./state/TagsProvider`) and `useMemo`.

Replace `PanelButton` with a counted version:
```tsx
/** A panel button that shows only when it has something to list, with the count (spec A1). */
function CountedButton({ panel, open, label, count, onToggle }: { panel: Panel; open: Panel | null; label: string; count: number; onToggle: (p: Panel) => void }) {
  if (count < 1) return null;
  return (
    <button type="button" className="panel-button" aria-pressed={open === panel} title={`${count} to look at`} onClick={() => onToggle(panel)}>
      <span className="count" aria-hidden="true">{count}</span>{label}
    </button>
  );
}
```
In `Shell`, add:
```tsx
  const board = useBoard();
  const { tags } = useTags();
  const { questions } = useQuestions();
  const terms = useMemo(() => glossary(state.board, termTagIds(tags)).length, [state.board, tags]);
  const [palette, setPalette] = useState(false);
  const [shortcuts, setShortcuts] = useState(false);
  const split = useSplit();
  const openPalette = useCallback(() => setPalette(true), []);
  const openShortcuts = useCallback(() => setShortcuts(true), []);
  useCommandKeys({ onPalette: openPalette, onShortcuts: openShortcuts });
  const commands = [
    ...shellCommands({ openPanel: (p) => setPanel(p), newNote, find: () => requestFind(""), split: () => void split.run(), shortcuts: openShortcuts }),
    ...extraCommands(board),
  ];
```
Replace the `.panel-buttons` div with:
```tsx
        <div className="panel-buttons">
          <CountedButton panel="questions" open={panel} label="Questions" count={questions?.length ?? 0} onToggle={toggle} />
          <CountedButton panel="glossary" open={panel} label="Glossary" count={terms} onToggle={toggle} />
          <button type="button" className="panel-button kbd" aria-label="Commands (⌘K)" title="All commands" onClick={openPalette}>⌘K</button>
          {split.said && <span className="tool-note" role="status">{split.said}</span>}
        </div>
```
and just before `</>` at the end of Shell:
```tsx
      {palette && <CommandPalette commands={commands} onClose={() => setPalette(false)} />}
      {shortcuts && <ShortcutsSheet onClose={() => setShortcuts(false)} />}
```
Leave `newNote` and `noteRequests` as they are: ⌘K's New note uses them.

Delete `web/src/MoreMenu.tsx` and `web/src/MoreMenu.test.tsx`. In `web/src/styles/shell.css`, delete the `.more`, `.more-menu` and `.more .tool-note` rules and append:
```css
.panel-button .count { display: inline-block; min-width: 16px; margin-right: 6px; padding: 0 4px; border-radius: var(--radius-pill); background: var(--surface-muted); color: var(--ink); font-size: var(--text-ui-small); text-align: center; }
.panel-buttons .tool-note { font-size: var(--text-ui-small); color: var(--ink-muted); white-space: nowrap; }
.panel-button.kbd { font-family: var(--font-mono); }
/* ⌘K and the shortcuts sheet */
.palette-backdrop { position: fixed; inset: 0; z-index: 50; display: flex; justify-content: center; align-items: flex-start; padding-top: 12vh; background: rgba(20, 24, 31, 0.12); }
.palette { width: min(520px, calc(100vw - 32px)); max-height: 60vh; overflow: auto; padding: 8px; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); box-shadow: var(--shadow-raised); }
.palette input { width: 100%; padding: 8px 10px; border: 1px solid var(--border); border-radius: var(--radius-small); font: inherit; }
.palette ul { list-style: none; margin: 6px 0 0; padding: 0; }
.palette [role="option"] { width: 100%; padding: 7px 10px; border: 0; border-radius: var(--radius-small); background: none; text-align: left; }
.palette [role="option"][aria-selected="true"] { background: var(--surface-muted); }
.shortcuts dl { display: grid; gap: 4px; margin: 0; }
.shortcuts dl div { display: flex; justify-content: space-between; gap: 16px; }
.shortcuts dt { font-family: var(--font-mono); color: var(--ink); }
.shortcuts dd { margin: 0; color: var(--ink-muted); }
```
The backdrop colour repeats `--shadow-raised`'s rgb. If the tokens rule is read strictly, add `--backdrop: rgba(20, 24, 31, 0.12);` to `tokens.css` and use `var(--backdrop)` here.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd web && npx vitest run && npx tsc --noEmit`
Expected: PASS. QuestionList's own test still passes, because it imports `QUESTIONS_FAILED_MESSAGE` from `./QuestionList`.

E2e this task breaks (Task 11 fixes them):
- `board.spec.ts:246,285` (New note);
- `board.spec.ts:293-295` (the top bar);
- `context.spec.ts:138-139` (More → Glossary);
- `step5.spec.ts:130-133` (`openPanel`).

- [ ] **Step 7: Commit**

```bash
git add -A web/src/commands web/src/panels/useQuestions.ts web/src/panels/QuestionList.tsx web/src/App.tsx web/src/styles/shell.css web/src/MoreMenu.tsx web/src/MoreMenu.test.tsx
git commit -m "feat: ⌘K lists every command; Questions and Glossary show only with a count"
```

---

### Task 9: Gestures — drag to cut, double-click for a note, lasso

**Files:**
- Create: `web/src/board/cutDrag.ts`
- Create: `web/src/board/cutDrag.test.ts`
- Modify: `web/src/board/dropNote.ts`
- Modify: `web/src/board/dropNote.test.ts`
- Modify: `web/src/board/recut.ts`
- Modify: `web/src/board/recut.test.ts`
- Modify: `web/src/paper/cut.ts`
- Modify: `web/src/paper/cut.test.ts`
- Modify: `web/src/paper/usePaperMouse.ts`
- Modify: `web/src/paper/PaperView.tsx`
- Modify: `web/src/PaperScreen.tsx`
- Modify: `web/src/board/BoardView.tsx`

**Interfaces:**
- Consumes: `chooseFor` (Task 5), `readCardSelection`, `recutPlan`, `api.recut`.
- Produces:
  - `CUT_DRAG_TYPE`, `offerCut(drop: CutDrop)`, `takeCut(): CutDrop | null`, `withdrawCut()`, `isCutDrag(types: readonly string[])`, where `type CutDrop = (at: XY) => Promise<void>`.
  - `emptyPaneAt(element: Element | null): boolean`.
  - `pieceIndexOf(pieces: Piece[], quote: QuoteSelector): number` and `placePiece(plan: Reshape, index: number, at: XY): Reshape`.
  - `CutRequest` gains `at?: XY`.
  - `chooseFor(p, kind, tagId?, at?: XY)`.
  - `PaperView`/`usePaperMouse` gain `onDragSelection?: (event: React.DragEvent, rects: PageRect[], lines?: PageRect[]) => void`.

- [ ] **Step 1: Write the failing tests**

`web/src/board/cutDrag.test.ts`:
```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { CUT_DRAG_TYPE, isCutDrag, offerCut, takeCut, withdrawCut } from "./cutDrag";

afterEach(withdrawCut);

describe("a cut carried from the paper or a card to the board (Review Focus 4)", () => {
  it("is taken once: a later drop never replays it", () => {
    const drop = vi.fn(async () => undefined);
    offerCut(drop);
    expect(takeCut()).toBe(drop);
    expect(takeCut()).toBeNull();
  });
  it("a drag that ends elsewhere withdraws it", () => {
    offerCut(vi.fn(async () => undefined));
    withdrawCut();
    expect(takeCut()).toBeNull();
  });
  it("only a drag of ours is a cut", () => {
    expect(isCutDrag([CUT_DRAG_TYPE, "text/plain"])).toBe(true);
    expect(isCutDrag(["text/plain"])).toBe(false);
  });
});
```

Add to `web/src/board/dropNote.test.ts`:
```ts
describe("emptyPaneAt (double-click and drop, spec A3)", () => {
  const inPane = (className: string) => {
    const pane = document.createElement("div"); pane.className = "react-flow__pane";
    const child = document.createElement("div"); child.className = className;
    pane.appendChild(child);
    return child;
  };
  it("is the empty board, not a card, an edge or anything outside the board", () => {
    expect(emptyPaneAt(inPane("react-flow__viewport"))).toBe(true);
    expect(emptyPaneAt(inPane("react-flow__node"))).toBe(false);
    expect(emptyPaneAt(inPane("react-flow__edge"))).toBe(false);
    expect(emptyPaneAt(document.createElement("div"))).toBe(false);
    expect(emptyPaneAt(null)).toBe(false);
  });
});
```
and add `emptyPaneAt` to that file's import from `./dropNote`.

Add to `web/src/board/recut.test.ts`. It reuses the file's existing chunk and piece helpers, so read its top first and use its names for a chunk (`chunk`) and a piece builder. If the file has no piece builder, add this one:
```ts
const pieceWith = (text: string): Piece => ({ type: "chunk", data: { ...chunk.data, blocks: [{ kind: "text", page: 0, rect: [0, 0, 1, 1], text }] } });
```
```ts
describe("a piece cut out by a drag lands where it is dropped (spec A2)", () => {
  const pieces = [pieceWith("Before it."), pieceWith("The chosen\nwords here."), pieceWith("After it.")];
  it("finds the piece holding the selected words, whitespace aside", () => {
    expect(pieceIndexOf(pieces, { exact: "chosen words", prefix: "", suffix: "" })).toBe(1);
  });
  it("falls back to the middle of three, else the first", () => {
    expect(pieceIndexOf(pieces, { exact: "not there", prefix: "", suffix: "" })).toBe(1);
    expect(pieceIndexOf(pieces.slice(0, 2), { exact: "not there", prefix: "", suffix: "" })).toBe(0);
  });
  it("moves only that piece, out of any group, to the drop point", () => {
    const plan = recutPlan({ ...chunk, parentId: "n-g" }, pieces)!;
    const placed = placePiece(plan, 1, { x: 900, y: 40 });
    expect(placed.add![0].position).toEqual({ x: 900, y: 40 });
    expect(placed.add![0].parentId).toBeUndefined();
    expect(placed.keep).toEqual(plan.keep);
    expect(placePiece(plan, 0, { x: 5, y: 6 }).keep.position).toEqual({ x: 5, y: 6 });
  });
});
```

Add to `web/src/paper/cut.test.ts`, following its existing `makeCut` call:
```ts
it("a cut dropped on the board is placed where it was dropped", async () => {
  const node = await makeCut("p", source, board, selection, { mode: "text", at: { x: 700, y: 20 } });
  expect(node.position).toEqual({ x: 700, y: 20 });
});
```
Use the names the file already has for `source`, `board` and `selection`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd web && npx vitest run src/board/cutDrag.test.ts src/board/dropNote.test.ts src/board/recut.test.ts src/paper/cut.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement the pure parts**

`web/src/board/cutDrag.ts`:
```ts
import type { XY } from "../model/reparent";

/** The drag's own type: only a drag begun on selected words of ours is a cut. */
export const CUT_DRAG_TYPE = "application/x-paperboard-cut";
/** What a drop does: cut the dragged words and place the piece at `at`, in board coordinates. */
export type CutDrop = (at: XY) => Promise<void>;

// The paper and the board are separate components that share nothing but this: the drag's start offers a cut, and the
// board's drop takes it. Taken once, so a later drop can never replay it (Review Focus 4).
let offered: CutDrop | null = null;

export function offerCut(drop: CutDrop): void { offered = drop; }
export function withdrawCut(): void { offered = null; }
export function takeCut(): CutDrop | null {
  const drop = offered;
  offered = null;
  return drop;
}
export function isCutDrag(types: readonly string[]): boolean { return types.includes(CUT_DRAG_TYPE); }
```

In `web/src/board/dropNote.ts`, add:
```ts
/** True on the empty board: the pane, and on no card and no line. What a double-click or a drop there acts on (spec A3). */
export function emptyPaneAt(element: Element | null): boolean {
  return Boolean(element?.closest(".react-flow__pane")) && !element?.closest(".react-flow__node, .react-flow__edge");
}
```

In `web/src/board/recut.ts`, add, importing `type QuoteSelector` and `type XY` (`../model/reparent`):
```ts
const squeeze = (text: string) => text.replace(/\s+/g, " ").trim();
/** How much of the selection is matched against a piece's text: enough to tell pieces apart. */
const MATCH_CHARS = 40;

/** Which of Cut out's pieces holds the selected words: the one whose text holds them, else the middle of three
 *  (before, selection, after), else the first (a selection at the chunk's start or end). */
export function pieceIndexOf(pieces: Piece[], quote: QuoteSelector): number {
  const needle = squeeze(quote.exact).slice(0, MATCH_CHARS);
  const found = pieces.findIndex((p) => squeeze(p.data.blocks.map((b) => (b.kind === "text" ? b.text : "")).join(" ")).includes(needle));
  if (found >= 0) return found;
  return pieces.length === 3 ? 1 : 0;
}

/** The plan with piece `index` moved to `at` (board coordinates), out of any group: a drop lands where it is let go. */
export function placePiece(plan: Reshape, index: number, at: XY): Reshape {
  const moved = (node: ChunkNode): ChunkNode => {
    const { parentId: _parent, ...rest } = node;   // eslint-disable-line @typescript-eslint/no-unused-vars
    return { ...rest, position: at };
  };
  if (index === 0) return { ...plan, keep: moved(plan.keep) };
  return { ...plan, add: (plan.add ?? []).map((n, i) => (i === index - 1 ? moved(n) : n)) };
}
```

In `web/src/paper/cut.ts`, change `CutRequest` to `{ mode: SelectionMode; sectionId?: string; at?: XY }` (import `type XY` from `../model/reparent`), and set `const position = request.at ?? nextChunkPosition(board.nodes);`.

- [ ] **Step 4: Run the pure tests to verify they pass**

Run: `cd web && npx vitest run src/board src/paper/cut.test.ts`
Expected: PASS.

- [ ] **Step 5: Drag from the paper**

In `web/src/paper/usePaperMouse.ts`:
- add `onDragSelection?: (event: React.DragEvent, rects: PageRect[], lines?: PageRect[]) => void;` to `Handlers`, and destructure it;
- add before the `return`:
```ts
  /** Dragging selected words starts the browser's own drag; the words go with it as a cut (spec A2). */
  const onDragStart = (event: React.DragEvent) => {
    if (!container.current || !onDragSelection) return;
    const selection = readSelection(container.current, source);
    if (selection) onDragSelection(event, selection.rects, selection.lines);
  };
```
- return `{ onMouseDown, onMouseUp, onContextMenu, onDragStart, band: rectangle.band }`.

In `web/src/paper/PaperView.tsx`:
- add `onDragSelection?: (event: React.DragEvent, rects: PageRect[], lines?: PageRect[]) => void;` to `Props`;
- add `onDragStart={mouse.onDragStart}` to the `.paper` div. `usePaperMouse` already receives `props`.

In `web/src/PaperScreen.tsx`:
- import `CUT_DRAG_TYPE`, `offerCut` and `withdrawCut` from `./board/cutDrag`, and `type XY` from `./model/reparent`;
- give `chooseFor` a fourth parameter `at?: XY` and pass it into `makeCut(..., { mode: p.mode, sectionId: p.section?.id, at })`;
- add:
```tsx
  /** Selected words dragged onto the board are cut there (spec A2). The popover goes; the drop does the rest. */
  const onDragSelection = (event: React.DragEvent, rects: PageRect[], lines?: PageRect[]) => {
    event.dataTransfer.setData(CUT_DRAG_TYPE, "paper");
    event.dataTransfer.effectAllowed = "copy";
    const p: Pending = { rects, lines, at: new DOMRect(), exact: false, mode: "text", text: "", preview: "" };
    setPending(null);
    offerCut(async (at) => { await chooseFor(p, "cut", null, at); });
  };
```
- pass `onDragSelection={onDragSelection}` to `<PaperView>`;
- add `useEffect(() => { const end = () => withdrawCut(); window.addEventListener("dragend", end); return () => window.removeEventListener("dragend", end); }, []);`. A drag let go of anywhere but the board leaves nothing offered. The drop fires before `dragend`, so a real drop is already consumed.

- [ ] **Step 6: The board: drop, drag out of a card, double-click, lasso**

In `web/src/board/BoardView.tsx`:
- import `SelectionMode` from `@xyflow/react`; `CUT_DRAG_TYPE`, `isCutDrag`, `offerCut` and `takeCut` from `./cutDrag`; `emptyPaneAt` from `./dropNote`; `api` from `../api/client`; `pieceIndexOf`, `placePiece` and `recutPlan` from `./recut`; and `type ChunkNode as ChunkNodeType` from `../model/types`;
- add inside `Inner`:
```tsx
  const [dropError, setDropError] = useState<string | null>(null);
  /** Lines selected on a card and dragged onto empty board are cut out there (spec A2): the piece holding them lands at the drop. */
  const onDragStart = (event: React.DragEvent) => {
    const words = readCardSelection(boardRef.current!);
    const chunk = words && state.board.nodes.find((n): n is ChunkNodeType => n.id === words.nodeId && n.type === "chunk");
    if (!words || !chunk) return;
    event.dataTransfer.setData(CUT_DRAG_TYPE, "card");
    event.dataTransfer.effectAllowed = "move";
    offerCut(async (at) => {
      const pieces = await api.recut(paperId, chunk.data.region, words.quote, "cut");
      const plan = recutPlan(chunk, pieces);
      if (plan) dispatch({ type: "reshape", ...placePiece(plan, pieceIndexOf(pieces, words.quote), at) });
    });
  };
  const onDragOver = (event: React.DragEvent) => { if (isCutDrag(event.dataTransfer.types)) event.preventDefault(); };
  /** A cut carried from the paper or a card, let go of on empty board. Anywhere else nothing happens (Review Focus 4). */
  const onDrop = (event: React.DragEvent) => {
    if (!isCutDrag(event.dataTransfer.types)) return;
    event.preventDefault();
    const drop = takeCut();
    if (!drop || !emptyPaneAt(event.target as Element)) return;
    setDropError(null);
    drop(screenToFlowPosition({ x: event.clientX, y: event.clientY })).catch((failure: unknown) => {
      console.error("drop to cut failed", failure);
      setDropError("That could not be cut. Nothing was added.");
    });
  };
  /** A double-click on empty board makes a note there, ready for typing (spec A3). */
  const onDoubleClick = (event: React.MouseEvent) => {
    if (!emptyPaneAt(event.target as Element)) return;
    const note = newNote({ position: screenToFlowPosition({ x: event.clientX, y: event.clientY }), origin: "reader" });
    dispatch({ type: "add", nodes: [note] });
    setEditing(note.id);
  };
```
- add `onDragStart={onDragStart} onDragOver={onDragOver} onDrop={onDrop} onDoubleClick={onDoubleClick}` to the `.board` div;
- add to `<ReactFlow>`:
```tsx
        zoomOnDoubleClick={false} selectionOnDrag panOnDrag={[1]} panOnScroll selectionMode={SelectionMode.Partial}
        multiSelectionKeyCode={["Shift", "Meta", "Control"]}
```
- render `{dropError && <p className="selection-error" role="alert" onClick={() => setDropError(null)}>{dropError}</p>}` after the ContextCard line.

The lasso takes the left-button drag on empty board. Panning moves to two-finger scroll, a middle-button drag, or Space and drag (React Flow's default pan key). See Ambiguity 6 at the end of this plan.

- [ ] **Step 7: Run all tests**

Run: `cd web && npx vitest run && npx tsc --noEmit`
Expected: PASS.

Any e2e that pans the board by a left drag on the pane will break. Search with `grep -n "react-flow__pane" web/e2e/*.ts` and note any hit for Task 11. The known pane uses are clicks and right-clicks, which still work.

- [ ] **Step 8: Commit**

```bash
git add web/src/board/cutDrag.ts web/src/board/cutDrag.test.ts web/src/board/dropNote.ts web/src/board/dropNote.test.ts web/src/board/recut.ts web/src/board/recut.test.ts web/src/paper/cut.ts web/src/paper/cut.test.ts web/src/paper/usePaperMouse.ts web/src/paper/PaperView.tsx web/src/PaperScreen.tsx web/src/board/BoardView.tsx
git commit -m "feat: drag words onto the board to cut, double-click for a note, lasso to select"
```

---

### Task 10: The three one-time hints

**Files:**
- Create: `web/src/hints/hints.ts`
- Create: `web/src/hints/Hint.tsx`
- Create: `web/src/hints/hints.test.tsx`
- Modify: `web/src/PaperScreen.tsx`
- Modify: `web/src/board/BoardView.tsx`
- Modify: `web/src/styles/shell.css`

**Interfaces:**
- Consumes: the gesture sites from Task 9, and `onConnect`/`onConnectEnd` in `BoardView`.
- Produces:
  - `type HintId = "drag-cut" | "connect" | "dblclick-note"`;
  - `HINT_TEXT`;
  - `useHint(id, when): boolean`;
  - `closeHint(id)`, called when the gesture is done or the hint is dismissed;
  - `resetHintsForTest()`;
  - `<Hint id when />`.

- [ ] **Step 1: Write the failing tests**

`web/src/hints/hints.test.tsx`:
```tsx
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Hint } from "./Hint";
import { closeHint, HINT_TEXT, resetHintsForTest } from "./hints";

beforeEach(() => { window.localStorage.clear(); resetHintsForTest(); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("hints (spec A4)", () => {
  it("shows when it applies, and not before", () => {
    const { queryByRole, rerender } = render(<Hint id="connect" when={false} />);
    expect(queryByRole("note")).toBeNull();
    rerender(<Hint id="connect" when />);
    expect(queryByRole("note")?.textContent).toContain(HINT_TEXT.connect);
  });
  it("is shown once: once it has gone, it never comes back, even after a reload", () => {
    const { queryByRole, rerender, unmount } = render(<Hint id="connect" when />);
    rerender(<Hint id="connect" when={false} />);
    rerender(<Hint id="connect" when />);
    expect(queryByRole("note")).toBeNull();
    unmount();
    resetHintsForTest();   // a reload: only browser storage is left
    expect(render(<Hint id="connect" when />).queryByRole("note")).toBeNull();
  });
  it("goes when its gesture is done, or when dismissed", () => {
    const first = render(<Hint id="dblclick-note" when />);
    act(() => closeHint("dblclick-note"));
    expect(first.queryByRole("note")).toBeNull();
    const second = render(<Hint id="drag-cut" when />);
    fireEvent.click(second.getByRole("button", { name: "Dismiss hint" }));
    expect(second.queryByRole("note")).toBeNull();
  });
  it("still works, for this session, when browser storage throws (Review Focus 3)", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
    resetHintsForTest();
    const { queryByRole, rerender } = render(<Hint id="connect" when />);
    expect(queryByRole("note")).not.toBeNull();
    rerender(<Hint id="connect" when={false} />);
    rerender(<Hint id="connect" when />);
    expect(queryByRole("note")).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd web && npx vitest run src/hints`
Expected: FAIL with unresolved imports.

- [ ] **Step 3: Implement**

`web/src/hints/hints.ts`:
```ts
import { useEffect, useState, useSyncExternalStore } from "react";

export type HintId = "drag-cut" | "connect" | "dblclick-note";
export const HINT_TEXT: Record<HintId, string> = {
  "drag-cut": "Drag selected text onto the board to cut it",
  connect: "Drag from a card's edge to connect it",
  "dblclick-note": "Double-click to add a note",
};
/** Which hints were ever shown: a convenience of this browser, not the reader's work (spec A4). */
const STORAGE_KEY = "paperboard.hints.seen";

type Snapshot = { seen: ReadonlySet<string>; closed: ReadonlySet<string> };
const listeners = new Set<() => void>();

function readSeen(): Set<string> {
  try {
    const list: unknown = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "[]");
    return new Set(Array.isArray(list) ? list.filter((x): x is string => typeof x === "string") : []);
  } catch (failure) {
    console.warn("Could not read which hints were seen; showing them this session only", failure);
    return new Set();
  }
}

let snapshot: Snapshot = { seen: readSeen(), closed: new Set() };

function update(next: Snapshot) {
  snapshot = next;
  listeners.forEach((l) => l());
}

function markSeen(id: HintId) {
  if (snapshot.seen.has(id)) return;
  const seen = new Set(snapshot.seen).add(id);
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...seen])); }
  catch (failure) { console.warn("Could not save that a hint was seen", failure); }
  update({ ...snapshot, seen });
}

/** The hint's gesture was done, or it was dismissed: it goes, and is never shown again. */
export function closeHint(id: HintId) {
  markSeen(id);
  if (!snapshot.closed.has(id)) update({ ...snapshot, closed: new Set(snapshot.closed).add(id) });
}

export function resetHintsForTest() { update({ seen: readSeen(), closed: new Set() }); }

const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };

/** Whether hint `id` shows now: when it applies, if it was never shown before. Once shown, it is recorded as seen,
 *  and it stays until its moment passes, its gesture is done, or it is dismissed. */
export function useHint(id: HintId, when: boolean): boolean {
  const { seen, closed } = useSyncExternalStore(subscribe, () => snapshot);
  const [shownHere, setShownHere] = useState(false);
  const visible = when && !closed.has(id) && (shownHere || !seen.has(id));
  useEffect(() => {
    if (visible && !shownHere) { setShownHere(true); markSeen(id); }
    if (shownHere && !when) closeHint(id);
  }, [visible, shownHere, when, id]);
  return visible;
}
```

`web/src/hints/Hint.tsx`:
```tsx
import { closeHint, HINT_TEXT, useHint, type HintId } from "./hints";

/** A faint one-time hint at the moment it applies (spec A4). It never blocks a click under it. */
export function Hint({ id, when }: { id: HintId; when: boolean }) {
  if (!useHint(id, when)) return null;
  return (
    <p className="gesture-hint" role="note">
      {HINT_TEXT[id]}
      <button type="button" className="quiet" aria-label="Dismiss hint" onClick={() => closeHint(id)}>×</button>
    </p>
  );
}
```

Append to `web/src/styles/shell.css`:
```css
/* a one-time gesture hint: faint, out of the way, never in the way of a click */
.gesture-hint { position: absolute; bottom: 16px; left: 50%; transform: translateX(-50%); z-index: 15; margin: 0; padding: 5px 10px; pointer-events: none; color: var(--ink-muted); font-size: var(--text-ui-small); background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-pill); box-shadow: var(--shadow-card); opacity: 0.9; }
.gesture-hint button { pointer-events: auto; margin-left: 6px; color: var(--ink-faint); }
```

- [ ] **Step 4: Place the hints and close them on their gestures**

`web/src/PaperScreen.tsx`:
- import `Hint` and `closeHint`;
- render `<Hint id="drag-cut" when={Boolean(pending && !pending.section && pending.mode === "text") && view.view === "both"} />` after the FindPanel line;
- the `.paper-pane` is the positioned parent. If it is not `position: relative`, add `.paper-pane { position: relative; }` to `shell.css`.

`web/src/board/BoardView.tsx`:
- import `Hint` and `closeHint`;
- in `onDrop`, after `const drop = takeCut();` and its guard, add `closeHint("drag-cut");`;
- in `onDoubleClick`, after `setEditing(note.id);`, add `closeHint("dblclick-note");`;
- in `onConnect`, after the dispatch, and in `onConnectEnd`, after its dispatch, add `closeHint("connect");`;
- render inside `.board`:
```tsx
      <Hint id="connect" when={active && selectedNodes.length === 1} />
      <Hint id="dblclick-note" when={active && !state.board.nodes.some((n) => n.type === "note")} />
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd web && npx vitest run && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add web/src/hints web/src/PaperScreen.tsx web/src/board/BoardView.tsx web/src/styles/shell.css
git commit -m "feat: three one-time hints, each at the moment its gesture applies"
```

---

### Task 11: End-to-end — move the specs to the new controls, and test each gesture with its button twin

**Files:**
- Modify: `web/e2e/board.spec.ts`
- Modify: `web/e2e/context.spec.ts`
- Modify: `web/e2e/step5.spec.ts`
- Modify: `web/e2e/step6.spec.ts`
- Create: `web/e2e/simplify.spec.ts`

**Interfaces:**
- Consumes: every accessible name fixed in Tasks 1–10:
  - "Highlight" (the plain dot), tag names ("question") as dots, "Cut", "Cut out", "Find", "More actions";
  - `menuitem` "Split here", "Add tag";
  - toolbar "Card" with "Show in paper", "Collapse card", "No colour";
  - "Commands (⌘K)", dialog "Commands", option names, dialog "Shortcuts";
  - `role="note"` hints.

- [ ] **Step 1: Move the existing specs**

`web/e2e/board.spec.ts`:
- lines 246 and 285, `page.getByRole('button', {name: 'New note'}).click();` become:
```ts
  await page.getByRole('button', {name: 'Commands (⌘K)'}).click();
  await page.getByRole('option', {name: 'New note'}).click();
```
- lines 293–295, the top-bar test, become:
```ts
  for (const name of ['Paper', 'Both', 'Board', 'Commands (⌘K)']) await expect(bar.getByRole('button', {name, exact: true})).toBeVisible();
  await expect(bar.getByRole('textbox', {name: 'Reading goal'})).toBeVisible();
  // nothing to list yet: no Questions, no Glossary; More and New note are gone (spec A1, A5)
  for (const name of ['Questions', 'Glossary', 'More', 'New note', 'Export', 'Tags', 'Template', 'Split', 'New group']) await expect(page.getByRole('button', {name, exact: true})).toHaveCount(0);
```
and rename the test to `'the top bar keeps the paper, the switch, the goal and ⌘K; New group is on the empty board\'s right-click; the filter shows once a tag is used'`.

`web/e2e/context.spec.ts`, lines 138–139, become:
```ts
  await page.locator(".topbar").getByRole("button", { name: "Glossary", exact: true }).click();
```
The term is tagged earlier in that test, so the Glossary shows with a count.

`web/e2e/step5.spec.ts`:
- `openPanel` (lines 130–133) becomes:
```ts
/** Opens one of the panels from ⌘K. */
async function openPanel(page: Page, name: string) {
  await page.keyboard.press("ControlOrMeta+k");
  await page.getByRole("dialog", { name: "Commands" }).getByRole("option", { name, exact: true }).click();
}
```
- line 373, `await popover.getByLabel("question", { exact: true }).check();`, becomes `await popover.getByRole("button", { name: "question", exact: true }).click();`;
- line 374: the Questions button appears only once the save has landed and the question list is fetched again, so keep `toBeVisible` implicit in the `click()` and give it time: `await expect(questions).toBeVisible({ timeout: 10_000 });` before `questions.click()`.

`web/e2e/step6.spec.ts`:
- line 152 becomes `await expect(page.getByRole("button", { name: "Cut out", exact: true })).toBeVisible();   // ✂ is in the bar (spec A2)`;
- lines 209 and 216, `page.getByRole("button", { name: "Split here", exact: true })`, become `page.getByRole("menuitem", { name: "Split here", exact: true })`.

- [ ] **Step 2: Write the new gesture spec**

`web/e2e/simplify.spec.ts`:
```ts
import { expect, test, type Page } from "@playwright/test";
import { putView, WRITE } from "./headers";

/** Spec A: every gesture and its button twin, the colour dots, ⌘K and the hints. */

type Json = Record<string, any>;
const quote = (exact: string) => ({ exact, prefix: "", suffix: "" });
const AREA = [50, 130, 280, 300];
const chunk = (id: string, x: number, y: number, text: string) => ({
  id, type: "chunk", position: { x, y }, width: 320,
  data: { tags: [], collapsed: false, user_sized: false, source_id: null,
    region: { rects: [{ page: 0, rect: AREA }], start: quote(text), end: quote(text), position: 0, state: "anchored" },
    blocks: [{ kind: "text", page: 0, rect: AREA, text }] },
});

let paper = "";
const boardOf = async (page: Page): Promise<Json> => (await page.request.get(`/api/papers/${paper}/board`)).json();

async function seed(page: Page, view: "paper" | "both" | "board", nodes: Json[] = []) {
  paper = ((await (await page.request.get("/api/papers")).json()) as { paper_id: string }[])[0].paper_id;
  const current: Json = await boardOf(page);
  const put = await page.request.put(`/api/papers/${paper}/board`, {
    data: { ...current, nodes, edges: [], highlights: [] }, headers: { "If-Match": String(current.version), ...WRITE } });
  expect(put.ok()).toBeTruthy();
  await putView(page.request, paper, { view, split: 0.5, viewport: { x: 0, y: 0, zoom: 1 } });
  await page.goto("/");
  await page.getByRole("combobox", { name: "Paper", exact: true }).selectOption(paper);
}

test.afterEach(async ({ request }) => {
  const current: Json = await (await request.get(`/api/papers/${paper}/board`)).json();
  await request.put(`/api/papers/${paper}/board`, { data: { ...current, nodes: [], edges: [], highlights: [] }, headers: { "If-Match": String(current.version), ...WRITE } });
  await putView(request, paper);
});

/** Selects words 10 to 12 on the first page by dragging, and returns their box. */
async function selectOnPaper(page: Page) {
  const spans = page.locator('.react-pdf__Page[data-page-number="1"] .react-pdf__Page__textContent span');
  await expect(spans.nth(12)).toBeVisible();
  const a = (await spans.nth(10).boundingBox())!;
  const b = (await spans.nth(12).boundingBox())!;
  await page.mouse.move(a.x + 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width - 2, b.y + b.height / 2, { steps: 8 });
  await page.mouse.up();
  await expect(page.getByRole("dialog", { name: "Selection" })).toBeVisible();
  return { a, b };
}

test("one tap on a colour highlights with that main tag; plain yellow has none (A2)", async ({ page }) => {
  await seed(page, "paper");
  await selectOnPaper(page);
  await page.getByRole("dialog", { name: "Selection" }).getByRole("button", { name: "question", exact: true }).click();
  await expect.poll(async () => (await boardOf(page)).highlights.map((h: Json) => h.tags)).toEqual([["t-question"]]);
  await selectOnPaper(page);
  await page.getByRole("dialog", { name: "Selection" }).getByRole("button", { name: "Highlight", exact: true }).click();
  await expect.poll(async () => (await boardOf(page)).highlights.length).toBe(2);
});

test("cut by ✂ and by dragging the selection onto the board, where it is dropped (A2)", async ({ page }) => {
  await seed(page, "both");
  await selectOnPaper(page);
  await page.getByRole("button", { name: "Cut", exact: true }).click();
  await expect(page.locator(".react-flow__node")).toHaveCount(1);

  const { a } = await selectOnPaper(page);
  await page.keyboard.press("Escape");   // the bar goes; the words stay selected
  const board = (await page.locator(".board").boundingBox())!;
  const drop = { x: board.x + board.width - 200, y: board.y + board.height - 150 };
  await page.mouse.move(a.x + 6, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(drop.x, drop.y, { steps: 12 });
  await page.mouse.up();
  await expect(page.locator(".react-flow__node")).toHaveCount(2);
  const placed = (await boardOf(page)).nodes.map((n: Json) => n.position.x);
  expect(Math.max(...placed)).toBeGreaterThan(200);   // at the drop, not the next free place
});

test("a note by double-click on empty board, and by ⌘K (A3)", async ({ page }) => {
  await seed(page, "board");
  await page.locator(".react-flow__pane").dblclick({ position: { x: 500, y: 300 } });
  await expect(page.locator("textarea.note-text")).toBeFocused();
  await page.keyboard.type("By double-click");
  await page.locator(".react-flow__pane").click({ position: { x: 1200, y: 900 } });
  await page.keyboard.press("ControlOrMeta+k");
  await page.getByRole("option", { name: "New note" }).click();
  await expect(page.locator("textarea.note-text")).toBeFocused();
  await expect.poll(async () => (await boardOf(page)).nodes.filter((n: Json) => n.type === "note").length).toBe(2);
});

test("a lasso selects, then Group; shift-click selects, then ● colours them all (A3)", async ({ page }) => {
  await seed(page, "board", [chunk("n-a", 40, 60, "First."), chunk("n-b", 420, 60, "Second.")]);
  const pane = (await page.locator(".react-flow__pane").boundingBox())!;
  await page.mouse.move(pane.x + 10, pane.y + 10);
  await page.mouse.down();
  await page.mouse.move(pane.x + 900, pane.y + 400, { steps: 10 });
  await page.mouse.up();
  await expect(page.locator(".react-flow__node.selected")).toHaveCount(2);
  const bar = page.getByRole("toolbar", { name: "Selected pieces" });
  await bar.getByRole("button", { name: "question", exact: true }).click();
  await expect.poll(async () => (await boardOf(page)).nodes.map((n: Json) => n.data.tags[0])).toEqual(["t-question", "t-question"]);
  await bar.getByRole("button", { name: "Group", exact: true }).click();
  await expect(page.locator(".node.group")).toHaveCount(1);
});

test("one selected card shows colour dots | ↗ ⤢ ›, and its colour is its main tag (A3)", async ({ page }) => {
  await seed(page, "board", [chunk("n-a", 40, 60, "First.")]);
  await page.locator('.react-flow__node[data-id="n-a"] .title').click();
  const bar = page.getByRole("toolbar", { name: "Card" });
  await expect(bar).toBeVisible();
  await bar.getByRole("button", { name: "supports", exact: true }).click();
  await expect(page.locator('.react-flow__node[data-id="n-a"] .node.tagged')).toBeVisible();
  await bar.getByRole("button", { name: "Collapse card" }).click();
  await expect(page.locator('.react-flow__node[data-id="n-a"] .node-body')).toHaveCount(0);
  await bar.getByRole("button", { name: "Show in paper" }).click();
  await expect(page.getByRole("button", { name: "Paper", exact: true })).toHaveAttribute("aria-pressed", "true");
});

test("⌘K lists every command, and ? opens the shortcuts (A1)", async ({ page }) => {
  await seed(page, "paper");
  await page.getByRole("button", { name: "Commands (⌘K)" }).click();
  const options = page.getByRole("dialog", { name: "Commands" }).getByRole("option");
  await expect(options).toHaveText(["Export", "Tags", "Template", "Add missing sections", "New note", "Find in paper", "Shortcuts"]);
  await page.keyboard.press("Escape");
  await page.locator("body").press("?");
  await expect(page.getByRole("dialog", { name: "Shortcuts" })).toBeVisible();
});

test("a hint shows once, faintly, and not again after it is done (A4)", async ({ page }) => {
  await seed(page, "board");
  await expect(page.getByRole("note")).toHaveText(/Double-click to add a note/);
  await page.locator(".react-flow__pane").dblclick({ position: { x: 500, y: 300 } });
  await expect(page.getByRole("note")).toHaveCount(0);
  await page.reload();
  await page.getByRole("combobox", { name: "Paper", exact: true }).selectOption(paper);
  await page.evaluate(async (id) => {   // empty the board of notes again: the hint's moment comes back
    const board = await (await fetch(`/api/papers/${id}/board`)).json();
    await fetch(`/api/papers/${id}/board`, { method: "PUT", headers: { "Content-Type": "application/json", "If-Match": String(board.version), "X-Paperboard": "1" },
      body: JSON.stringify({ ...board, nodes: [] }) });
  }, paper);
  await page.reload();
  await page.getByRole("combobox", { name: "Paper", exact: true }).selectOption(paper);
  await expect(page.getByRole("note")).toHaveCount(0);
});
```
Connecting by drag from a card's edge is already covered, by `step6.spec.ts`'s `drawLineFrom` tests and the board spec's connect tests. Its button twin is the mark's › Connect, covered by `step5`'s connect flow.

The paper-drag test depends on Chromium starting a native drag from selected text in the pdf.js text layer. If Playwright's mouse does not start it, replace the mouse moves with `page.locator('.react-pdf__Page[data-page-number="1"] .react-pdf__Page__textContent span').nth(11).dragTo(page.locator(".react-flow__pane"), { targetPosition: { x: 600, y: 400 } })` after selecting. `dragTo` dispatches the HTML5 drag events.

- [ ] **Step 3: Run the whole e2e suite**

Run: `cd web && PAPERBOARD_API_PORT=8781 PAPERBOARD_WEB_PORT=4181 npx playwright test`
Expected: every spec passes.

For any other failure:
- Read the failing locator first.
- If it names a control this plan renamed or moved, move the spec to the new name, using the names from the Interfaces lists above.
- If the app misbehaves, fix the app, not the spec (user testing rule).

- [ ] **Step 4: Run the unit tests and types once more**

Run: `cd web && npx vitest run && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/e2e
git commit -m "test: e2e for each gesture and its button twin, and the specs moved to the new controls"
```

---

## Spec ambiguities resolved in this plan

1. **Plain yellow on something that already has tags.** The spec says the plain dot is "a highlight with no tag" (for a new selection). On an existing mark or card, plain drops only the main tag and keeps the extras (`setMainTag(tags, null)`). The first extra then becomes the main tag, and so its colour. The alternative, clearing every tag, would silently delete extras.
2. **The dots show every tag, not only the four presets.** A user-made tag is a tag, and the row wraps.
3. **Connect on a card's text is left out of the ›.** On the board, connecting is the handle drag, which already exists and is taught by a hint. A "click the other end" mode like the paper's has no board equivalent today. Add tag, Add note, Ask elsewhere and Split here are there.
4. **The › items on a fresh paper selection first make a plain highlight.** Add tag, Connect, Add note and Ask elsewhere all act on a mark, and a selection is not one yet.
5. **The card head's existing hover-only controls stay** (▾, ↗, more context, Sketch, ⋯ tags). A5 removes only the More menu, New note and the tag-picker step, and A3 says hover-only is "already done". Removing the duplicates is a cleanup for later.
6. **The lasso takes the left drag on empty board.** Panning moves to two-finger scroll, middle drag, or Space and drag. Shift-click (with ⌘/Ctrl) adds to a selection.
7. **Find in paper from ⌘K opens an empty Find panel whose query can be typed.** Today's panel has no field. The alternative, prompting for words, is a new modal.
8. **Hints.** "Shown once" means once a hint has appeared and its moment has passed (or it was done or dismissed), it never returns. It is recorded as seen when first shown.
9. **Questions and Glossary counts.** Questions are the server's list, fetched with the board version (the same fetch as the panel). Glossary is the reader's `term` marks. When Part B adds AI terms to the Glossary, Part B updates this count.
10. **The hook for Part B** is `commands/registry.ts`: `registerCommands` for "AI help" and "Redo AI pass" in ⌘K, and `registerSelectionItems` for "Define" in both selection bars' ›. Part B registers from its own module (for example, imported once in `main.tsx`), and edits no Part A file.

## Self-review

- **Spec coverage:**

  | Spec | Where |
  |---|---|
  | A1, the top bar | Task 8 |
  | A1, Questions/Glossary counts | Task 8 |
  | A1, ⌘K and its commands, Shortcuts on `?` | Tasks 8 and 3 |
  | A1, New note out of the bar | Task 8, with the double-click in Task 9 |
  | A2, colour dots | Tasks 1, 5, 6 |
  | A2, main tag and extras as chips | Tasks 1, 2 |
  | A2, ✂ 🔍 › on the paper | Task 5 |
  | A2, ✂ 🔍 › on a card | Task 6 |
  | A2, a mark's right-click list | Task 5 |
  | A2, drag to cut from the paper and from a card | Task 9 |
  | A3, one-card bar | Task 7 |
  | A3, Group · Join · ● | Task 7 |
  | A3, double-click note and lasso | Task 9 |
  | A3, connect by drag | exists; its hint is in Task 10 |
  | A4 | Task 10 |
  | A5 | Tasks 8 and 5 |
  | Testing, unit tests per bar and helper | in each task |
  | Testing, e2e per gesture and twin | Task 11 |

- **Placeholder scan:** no TBD or "similar to" steps. Task 9's recut test says to reuse the file's existing helper names. It also defines `pieceWith` in case there is none.
- **Type consistency:**
  - `MenuItem`/`Command`/`SelectionTarget` (Task 3) are used unchanged in Tasks 5, 6, 7 and 8.
  - `chooseFor(p, kind, tagId?, at?)` is built in Task 5 and extended in Task 9.
  - `CutRequest.at` is used by Task 9's `chooseFor`.
  - `setNodeTags` is defined and used in Task 7.
  - `useMainTagStyle` returns `{ className, style? }` in both CardBar and its mock.
  - `TextPopover`'s `menuOpen` replaces `actions` in both TextPopover and BoardView.
  - `Panel` moves to `shellCommands.ts`, and `App` imports it from there.
- **Review Focus:**
  - 1 and 2 are in Task 1's tests.
  - 3 is in Task 10.
  - 4 is in Task 9 (`cutDrag`, `emptyPaneAt`).
  - 5 is in Task 8 (`useCommandKeys`).
