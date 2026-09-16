# Frontend core plan: spike findings

16 September 2026. Task 1 of `2026-09-16-frontend-core.md`. The spike code from the plan
ran against `npm run dev` in Playwright's Chromium (Chrome Headless Shell 153), driven by
throwaway scripts with real mouse input (`page.mouse.move/down/up`, 20 to 25 steps per
drag) and every `console` event captured. Nothing below is read from documentation. The
spike code, the driver scripts and `web/public/resnet.pdf` were deleted afterwards.

Installed (`npm ls --depth=0`): `react 19.3.0`, `react-dom 19.3.0`, `@xyflow/react 12.11.6`,
`react-pdf 11.0.0` (over `pdfjs-dist 6.3.289`), `ulid 3.0.2`, `typescript 7.0.2`,
`vite 8.3.0`, `@vitejs/plugin-react 6.1.1`, `@types/react 19.3.0`, `@types/react-dom 19.3.0`,
`vitest 5.0.1`, `jsdom 30.0.1`, `@testing-library/react 16.3.3`, `@playwright/test 1.63.0`.
Node is v25.9.0: `npm install` warns `EBADENGINE` for `jsdom` (wants `^22.22.2 || ^24.15.0 || >=26.0.0`)
and `vitest` (wants `^22.12.0 || ^24.0.0 || >=26.0.0`). No request left `localhost:5173` during any run.

## Contradictions with the plan

1. **The page box is not the page.** `.react-pdf__Page` is a block element and fills its
   container. With `<Page width={700}>` in a 1000 px viewport it measured 944 px wide while
   the canvas and the text layer measured 700 px. The spike's `scale = pageBox.width / 612`
   came out 1.5425 instead of 1.1438 and logged the heading as `[37.2, 93.8, 115.6, 103.5]`,
   off by up to 40 pt. Task 4's `pageFrames` uses the same element and has the same bug.
   At a 756 px viewport (container exactly 700 px) the same code logs `[50.1, 126.5, 155.9, 139.6]`.
2. **The top edge misses the 3 pt tolerance by 0.5 pt.** With the right scale, the
   Range rect for the heading is `[50.12, 126.50, 155.91, 139.61]`. Against the plan's
   `[50, 130, 156, 139]` the deltas are `+0.12, -3.50, -0.09, +0.61`. Against PyMuPDF's
   `search_for` `[50.11, 128.76, 155.90, 139.72]` they are `+0.01, -2.26, +0.01, -0.11`.
   The text node's rect is the font's content area, taller than the span box
   (`[50.12, 128.25, 155.91, 139.20]`, deltas vs PyMuPDF `+0.01, -0.51, +0.01, -0.52`).
3. **Re-parenting does not always keep the node where it was.** When the node's box is
   not inside the new parent, `extent: "parent"` clamps it at once. `free` at absolute
   x 800 re-parented into `g2` (480 wide) jumped 274.3 flow units left, to relative x 360.
4. **`getClientRects()` is not one rect per line.** Three lines gave 28 rects, a two-column
   selection of 34 lines gave 291 (details below).

Finding 1 is a real defect in Task 4. Finding 2 is sub-point and has a direct cause.
Findings 3 and 4 change what Tasks 4 to 6 must handle.

## 1. Nesting depth

Done: loaded the plan's four-deep tree (`g1 > g2 > g3 > g4 > leaf`), viewport zoom 1.4318,
and dragged `g1` by grabbing its strip outside `g2`. The mouse moved 143.2 px (100 flow
units). The node moved 137 px, 95.68 units, because React Flow starts the drag after the
first 5.7 px step.

Seen: `g1` absolute x 40 → 135.68 (+95.68). `leaf` absolute `{150, 150}` → `{245.68, 150}`
(+95.68, the same to every printed digit), `leaf` relative `{20, 20}` → `{20, 20}`.

Consequence: four levels of nesting work with relative positions alone. Task 3's
`toAbsolute`/`toRelative` model is right. Tasks 6 and 7 should not expect a drag to move a
node by exactly the mouse distance; assert that parent and child moved by the same amount.

## 2. Re-parenting

Done, two cases, using the plan's `reparentFree`.

a. The plan's case: `free` at absolute `{800, 100}`, outside `g2` (absolute `{165.68, 70}`
after item 1, 480 × 480). After the click, `free` relative was stored as `{634.32, 30}`,
but `positionAbsolute` was `{525.68, 100}` and its DOM box moved from x 1158.18 px to
765.41 px. It was clamped to relative x 360 = 480 − 120 at once. The stored `position`
stayed at 634.32 until the next drag wrote 360. Dragging `g2` down 48.19 units moved `free`
by 48.19 (`y 100 → 148.19`). Dragging `free` +400 units right left it at relative x 360;
dragging it −2000 units stopped it at relative x 0.

b. The realistic case: `free` first dragged onto `g2`'s lower strip, absolute
`{109.27, 474.35}`, then re-parented. Its DOM box was identical before and after,
`(169.18, 721.36)` px, and `positionAbsolute` did not change. Relative was `{39.27, 404.35}`.
Dragging `g2` by `(57.97, 38.41)` moved `free` by exactly `(57.97, 38.41)`. Dragging `free`
+1000 right stopped it at relative x 360 (= 480 − 120); +1000 down stopped it at
relative y 440 (= 480 − 40).

Consequence: re-parenting keeps a node in place only when its whole box is inside the new
parent. Otherwise `extent: "parent"` makes it jump, and the stored position (the one
`toBoardJson` would save) disagrees with the drawn one until the next drag. Task 6's
`onNodeDragStop` should re-parent only when the node's whole rect is inside the target
group, or clamp the relative position itself before dispatching. A test in Task 3 or 6
should pin down which one. Following the parent and clamping at the edges both work.

## 3. Parent order

Done: loaded variants of `initial` in which a child comes before its parent, and compared
them with the correctly ordered array. The controller asked for this in place of "edit
`reparentFree` and reload", because a reload resets to `initial`.

- `free` parented to `g2` at relative `{100, 100}`, listed after `g2`: no warning,
  absolute `{170, 170}` (= g2 `{70, 70}` + `{100, 100}`).
- The same node listed before `g2`: 3 warnings on load, each exactly
  `Parent node g2 not found. Please make sure that parent nodes are in front of their child nodes in the nodes array.`
  Absolute `{100, 100}`: the relative position was drawn as absolute, 70 units off in each
  axis. Dragging `g1` +95.60 left `free` at `{100, 100}` while `g2` moved, and logged 26
  more of the same warning.
- `leaf` listed before `g4`: 3 warnings `Parent node g4 not found. …` on load, absolute
  `{20, 20}` instead of `{150, 150}` (130 off in each axis). Dragging `g1` did not move it.
  26 more warnings.

Consequence: the plan's claim holds. React Flow 12.11.6 warns and misplaces, so the sort
is load-bearing. The spike's comparator (all parented nodes after all root nodes, stable)
is not enough for nesting deeper than one level. Task 3's topological `parentsFirst` is,
and every path that hands nodes to `<ReactFlow>`, not only `toBoardJson`, must go through it.

## 4. Selection geometry

Done: rendered page index 2 of `resnet.pdf` at `width={700}`, found the text-layer span
`"3.1. Residual Learning"` (a single span, 334 spans on the page), and dragged the mouse
along its vertical middle from 0.5 px inside its left edge to 0.5 px inside its right
edge. `sel.toString()` was exactly `"3.1. Residual Learning"` and the Range had one client rect.
A second drag starting 2 px outside the span, in the text layer's empty space, selected
nothing (`toString() === ""`, no log). No Range was built by hand.

Seen (page 792 pt tall, so a bottom-left flip would put the top near 652):

| source | x0 | y0 | x1 | y1 |
|---|---|---|---|---|
| plan's formula, 1000 px viewport (page box 944 px) | 37.2 | 93.8 | 115.6 | 103.5 |
| plan's formula, 756 px viewport (page box 700 px) | 50.1 | 126.5 | 155.9 | 139.6 |
| same Range against the canvas box (700 px), both viewports | 50.12 | 126.50 | 155.91 | 139.61 |
| text-layer span element box | 50.12 | 128.25 | 155.91 | 139.20 |
| plan | 50 | 130 | 156 | 139 |
| PyMuPDF `search_for` | 50.11 | 128.76 | 155.90 | 139.72 |

No flip is needed: y is top-left and off by under 3.5 pt, not by `pageHeight − y`.
The x edges agree with PyMuPDF within 0.01 pt. The Range's top sits 1.75 pt above the
span's top because a text node's rect is the fallback font's content area. That height
depends on the local fonts, so expect a pt or two of vertical slack on other machines.

**Two-column reading order.** A drag from the start of the line "In real cases, it is
unlikely that identity mappings are op-" in the left column to the end of "shortcut
connections to match the dimensions:" in the right column gave a `toString()` of
34 lines, in reading order: the rest of the left column (including the `3.2.` heading,
equation (1), and the footnote `2This hypothesis, …`), then the right column from its top.
It is content-stream order, not visual row order; no line interleaves the two columns.

**Rects per line.** Not one per line.
- Three lines of one column: 28 rects, 2 of them zero-width (one per `<br>` in the
  range), 26 non-zero with 5 distinct bottoms. The text layer has 8, 1 and 5 spans on those
  lines. Each fully selected span returns two rects, its element box and its text box, the
  second 1.75 pt taller.
- The two-column selection: 291 rects, 33 zero-width (33 `<br>`), 258 non-zero,
  130 spans in the range, 34 text lines.
- The zero-width `<br>` rects carry unrelated y values (a line at y 145 pt produced
  a `<br>` rect at y 55 to 71 pt, x 0).
- Unioned per page as Task 4 does, the two-column selection's non-zero rects cover
  `[50.12, 72.14, 545.13, 711.91]`: both columns, most of the page.

Consequence for Tasks 4 to 6:
- `pageFrames` must measure `.react-pdf__Page__canvas` (or
  `.react-pdf__Page__textContent`), or the page element must be styled
  `width: fit-content`. Otherwise every rect is wrong by the container's width.
- Task 4's `MIN_LINE_PX` width filter drops the `<br>` rects. It is needed for x as well
  as y, and must stay.
- The acceptance check against `[50, 130, 156, 139]` with 3 pt tolerance will fail on the
  top edge by 0.5 pt through a Range. Compare against PyMuPDF's `[50.11, 128.76, 155.90, 139.72]`
  (worst edge 2.26 pt), or widen the tolerance to 4 pt on y.
- A single merged rect per page turns a two-column selection into a block covering both
  columns. If highlights should follow the text, keep one rect per line (group rects that
  overlap vertically and union within a group; rounded bottoms alone split each line in
  two, since the element and text boxes differ by up to 0.5 pt) instead of one per page.
- `toString()` can be used as the quote in reading order, but it includes footnotes and
  headings that fall between the endpoints in the content stream.
