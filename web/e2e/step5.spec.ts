import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { putView, viewOf, WRITE } from "./headers";

/** The acceptance checks of the features plan (Task 3D), and SPEC.md section 11's mechanical items 4 and 5
 *  (item 6 is step3.spec.ts). Specs run in file order with one worker and this one runs last, so the specs before it
 *  see only ResNet. Attention is uploaded once, before the first test here, and its first test is the first time any
 *  page opens it (first open, D15). Every other test saves the board it needs first: view state lives in the board (D5). */

// The specs are type-checked with the app's tsconfig, which has no Node types: the little of Node used here is declared.
declare const process: { env: Record<string, string | undefined>; cwd(): string };
type NodeFs = { readFileSync(path: string): Uint8Array };
const readPdf = async (path: string) => ((await import(/* @vite-ignore */ "node:fs" as string)) as NodeFs).readFileSync(path);

const ATTENTION_PDF = process.env.PAPERBOARD_ATTENTION ?? `${process.cwd()}/../tests/fixtures/papers/attention.pdf`;
const UPLOAD_TIMEOUT_MS = 240_000;
/** A whole-word highlight may start a little before the drag point, never at the line's own start. */
const WORD_SLACK_PX = 4;
/** A selection starts and ends on the character boundary nearest the mouse. */
const CHAR_SLACK_PX = 12;
/** Attention's §3.2.1, which holds equation (1) on page 4 (index 3). */
const SCALED_DOT_PRODUCT = "Scaled Dot-Product Attention";
const EQUATION_PAGE = 3;

let attention = "";
let resnet = "";

test.beforeAll(async ({ playwright }, info) => {
  info.setTimeout(UPLOAD_TIMEOUT_MS);
  const request = await playwright.request.newContext({ baseURL: info.project.use.baseURL });
  const before: { paper_id: string }[] = await (await request.get("/api/papers")).json();
  const upload = await request.post("/api/papers", {
    multipart: { file: { name: "attention.pdf", mimeType: "application/pdf", buffer: await readPdf(ATTENTION_PDF) } }, headers: WRITE, timeout: UPLOAD_TIMEOUT_MS,
  });
  expect(upload.ok()).toBeTruthy();
  attention = (await upload.json()).paper_id;
  resnet = before.map((p) => p.paper_id).find((id) => id !== attention)!;
  await request.dispose();
});

// ---- helpers ------------------------------------------------------------------------------------------------

type Json = Record<string, any>;
const boardOf = async (request: APIRequestContext, id: string): Promise<Json> => (await request.get(`/api/papers/${id}/board`)).json();
const sourceOf = async (request: APIRequestContext, id: string): Promise<Json> => (await request.get(`/api/papers/${id}/source`)).json();
/** What split would add to the board as saved; the endpoint writes nothing. */
const splitOf = async (request: APIRequestContext, id: string): Promise<Json[]> => (await (await request.post(`/api/papers/${id}/split`, { headers: WRITE })).json()).nodes;

const paperPicker = (page: Page) => page.getByRole("combobox", { name: "Paper", exact: true });

/** Opens a paper in whichever view its board was left in (D5). */
async function open(page: Page, id: string) {
  await page.goto("/");
  await paperPicker(page).selectOption(id);
  await expect(page.locator(".react-pdf__Page").first()).toBeAttached();
}

/** Saves a board holding exactly these things, in the paper view with no filter, then opens it. */
async function save(request: APIRequestContext, id: string, parts: { nodes?: Json[]; edges?: Json[]; highlights?: Json[] } = {}) {
  const current = await boardOf(request, id);
  const next: Json = { ...current, nodes: parts.nodes ?? [], edges: parts.edges ?? [], highlights: parts.highlights ?? [] };
  const put = await request.put(`/api/papers/${id}/board`, { data: next, headers: { "If-Match": String(current.version), ...WRITE } });
  expect(put.ok()).toBeTruthy();
  await putView(request, id, { viewport: { x: 0, y: 0, zoom: 1 } });
}

async function seed(page: Page, id: string, parts: { nodes?: Json[]; edges?: Json[]; highlights?: Json[] } = {}) {
  await save(page.request, id, parts);
  await open(page, id);
  await expect(page.locator(".react-pdf__Page").first()).toBeVisible();
}

const quote = (exact: string) => ({ exact, prefix: "", suffix: "" });
const AREA = [50, 130, 280, 300];
const chunk = (id: string, x: number, y: number, text: string, extra: Json = {}) => ({
  id, type: "chunk", position: { x, y }, width: 320, ...extra,
  data: { tags: [], collapsed: false, user_sized: false, source_id: null,
    region: { rects: [{ page: 0, rect: AREA }], start: quote(text), end: quote(text), position: 0, state: "anchored" },
    blocks: [{ kind: "text", page: 0, rect: AREA, text }] },
});
const group = (id: string, x: number, y: number, width: number, height: number, data: Json = {}) =>
  ({ id, type: "group", position: { x, y }, width, height, data: { tags: [], ...data } });

const showBoard = (page: Page) => page.getByRole("button", { name: "Board", exact: true }).click();
const showPaper = (page: Page) => page.getByRole("button", { name: "Paper", exact: true }).click();
const node = (page: Page, id: string) => page.locator(`.react-flow__node[data-id="${id}"]`);

async function markIds(page: Page): Promise<string[]> {
  const ids = await page.locator(".overlay .mark").evaluateAll((els) => els.map((el) => el.getAttribute("data-highlight-id") ?? ""));
  return [...new Set(ids)].filter(Boolean);
}

/** A drag from one text span to another on a page; Alt keeps exactly what was selected (addendum 5.3). */
async function drag(page: Page, pageNo: number, from: number, to: number, exact = true) {
  const spans = page.locator(`.react-pdf__Page[data-page-number="${pageNo}"] .react-pdf__Page__textContent span`);
  await expect(spans.nth(to)).toBeVisible();
  await spans.nth(from).scrollIntoViewIfNeeded();
  const a = (await spans.nth(from).boundingBox())!;
  const b = (await spans.nth(to).boundingBox())!;
  if (exact) await page.keyboard.down("Alt");
  await page.mouse.move(a.x + 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width - 2, b.y + b.height / 2, { steps: 8 });
  await page.mouse.up();
  if (exact) await page.keyboard.up("Alt");
  await expect(page.getByRole("button", { name: "Highlight", exact: true })).toBeVisible();
}

async function highlight(page: Page, pageNo: number, from: number, to: number): Promise<string> {
  const before = await markIds(page);
  await drag(page, pageNo, from, to);
  await page.getByRole("button", { name: "Highlight", exact: true }).click();
  await expect.poll(async () => (await markIds(page)).length).toBe(before.length + 1);
  return (await markIds(page)).find((id) => !before.includes(id))!;
}

async function cut(page: Page, pageNo: number, from: number, to: number) {
  await drag(page, pageNo, from, to, false);
  await page.getByRole("button", { name: "Cut", exact: true }).click();
  await expect(page.getByRole("button", { name: "Cut", exact: true })).toBeHidden();
}

async function clickMark(page: Page, id: string) {
  const mark = page.locator(`.overlay .mark[data-highlight-id="${id}"]`).first();
  await mark.scrollIntoViewIfNeeded();
  const box = (await mark.boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}

/** Writes the export in this order and returns the Markdown the dialog shows: what the server wrote to the file it names. */
async function writeExport(page: Page, order: "paper" | "template"): Promise<string> {
  const dialog = page.locator(".export-dialog");
  await dialog.getByLabel("Order").selectOption(order);
  const exported = page.waitForResponse((r) => r.url().endsWith("/export") && r.request().method() === "POST");
  await dialog.getByRole("button", { name: "Write export", exact: true }).click();
  const body: Json = await (await exported).json();
  await expect(dialog.locator("code")).toHaveText(body.path);
  expect(body.path).toMatch(/export\.md$/);
  await expect(dialog.locator("pre")).toHaveText(body.markdown);
  return body.markdown;
}

// ---- Attention: first open, the template, blocks, links ---------------------------------------------------------

test("first open shows the tray filled by split and nine slots, and one Cmd-Z takes the whole layout back", async ({ page }) => {
  expect((await boardOf(page.request, attention)).version).toBe(0);
  const drafts = await splitOf(page.request, attention);
  const template: Json = await (await page.request.get("/api/template")).json();
  expect(template.slots).toHaveLength(9);
  await open(page, attention);
  await showBoard(page);
  const tray = page.locator(".node.group.tray");
  await expect(tray).toHaveCount(1);
  await expect(tray.locator(".group-name")).toHaveText("Paper");
  await expect(page.locator(".node.group.slot")).toHaveCount(9);
  await expect(page.locator(".slot-prompt")).toHaveCount(9);
  expect(drafts.length).toBeGreaterThan(0);
  await expect(page.locator(".node.chunk")).toHaveCount(drafts.filter((d) => d.type === "chunk").length);
  await expect(page.locator(".node.figure")).toHaveCount(drafts.filter((d) => d.type === "figure").length);
  await expect.poll(async () => (await boardOf(page.request, attention)).version).toBeGreaterThan(0);
  const saved = await boardOf(page.request, attention);
  const trayId = saved.nodes.find((n: Json) => n.data.tray).id;
  expect(saved.nodes.filter((n: Json) => n.parentId === trayId)).toHaveLength(drafts.length);

  await page.keyboard.press("ControlOrMeta+z");
  await expect(page.locator(".react-flow__node")).toHaveCount(0);
  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect(page.locator(".node.group.slot")).toHaveCount(9);
  await expect.poll(async () => (await boardOf(page.request, attention)).nodes.length).toBe(1 + drafts.length + 9);
});

test("export in the template's order lists the nine slot names, in the template's order", async ({ page }) => {
  const template: Json = await (await page.request.get("/api/template")).json();
  const names: string[] = template.slots.map((s: Json) => s.name);
  expect((await boardOf(page.request, attention)).nodes.filter((n: Json) => n.type === "group" && n.data.prompt)).toHaveLength(9);
  await open(page, attention);
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const markdown = await writeExport(page, "template");
  const headings = markdown.split("\n").filter((line: string) => line.startsWith("## ")).map((line: string) => line.slice(3));
  expect(headings.filter((h) => names.includes(h))).toEqual(names);
});

test("in the paper view the hidden board's tray and slots neither show nor take the paper's clicks", async ({ page }) => {
  // The laid-out board of first open, saved in the paper view at zoom 1, so the slots sit over the paper's first page.
  const laidOut = await boardOf(page.request, attention);
  expect(laidOut.nodes.filter((n: Json) => n.type === "group" && n.data.prompt)).toHaveLength(9);
  expect(laidOut.nodes.some((n: Json) => n.data.tray)).toBe(true);
  const put = await page.request.put(`/api/papers/${attention}/board`, {
    data: laidOut, headers: { "If-Match": String(laidOut.version), ...WRITE },
  });
  expect(put.ok()).toBeTruthy();
  await putView(page.request, attention, { viewport: { x: 0, y: 0, zoom: 1 } });
  await open(page, attention);
  const slots = page.locator(".react-flow__node:has(.node.group.slot)");
  await expect(slots).toHaveCount(9);
  await expect(slots.first()).toBeHidden();
  const boxes = (els: Element[]) => els.map((el) => { const r = el.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom }; });
  const slotBoxes = await slots.evaluateAll(boxes);
  const spans = page.locator('.react-pdf__Page[data-page-number="1"] .react-pdf__Page__textContent span');
  await expect(spans.first()).toBeAttached();
  const spanBoxes = await spans.evaluateAll(boxes);
  const inSlot = (x: number, y: number) => slotBoxes.some((s) => s.left < x && x < s.right && s.top < y && y < s.bottom);
  const under = spanBoxes.find((b) => b.right - b.left > 60 && inSlot(b.left + 2, (b.top + b.bottom) / 2) && inSlot(b.right - 2, (b.top + b.bottom) / 2))!;
  expect(under).toBeTruthy();
  const y = (under.top + under.bottom) / 2;
  const hit = await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.closest(".paper, .react-flow__node")?.className ?? "", [under.left + 4, y]);
  expect(hit).toContain("paper");
  await page.mouse.move(under.left + 2, y);
  await page.mouse.down();
  await page.mouse.move(under.right - 2, y, { steps: 6 });
  await page.mouse.up();
  expect((await page.evaluate(() => window.getSelection()?.toString() ?? "")).trim()).not.toBe("");
  await expect(page.getByRole("button", { name: "Highlight", exact: true })).toBeVisible();
});

test("a chunk over Attention's §3.2.1 shows equation (1) as an image of the page", async ({ page }) => {
  // Its own board: the section's piece as split makes it, so the test does not lean on the first-open test.
  const sections: Json[] = (await sourceOf(page.request, attention)).sections;
  const section = sections.find((s) => s.title.includes(SCALED_DOT_PRODUCT))!;
  await save(page.request, attention);
  const draft = (await splitOf(page.request, attention)).find((d) => d.data.source_id === section.id)!;
  expect(draft).toBeTruthy();
  expect(draft.data.blocks.some((b: Json) => b.kind === "clip" && b.page === EQUATION_PAGE)).toBe(true);
  await seed(page, attention, { nodes: [{ ...draft, id: "n-sdpa", position: { x: 40, y: 40 }, width: 520, data: { ...draft.data, collapsed: false } }] });
  await showBoard(page);
  const card = node(page, "n-sdpa");
  await expect(card.locator(".title")).toContainText(SCALED_DOT_PRODUCT);
  const clip = card.locator(".node-body img.block-clip").first();
  await expect(clip).toBeVisible();
  expect(new URL((await clip.getAttribute("src"))!, "http://local").searchParams.get("page")).toBe(String(EQUATION_PAGE));
  await expect.poll(() => clip.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
  await expect(card.locator(".node-body p.block-text").first()).toBeVisible();   // mixed: text stays text around it (D2)
});

test("the paper's own link to section 3.2 scrolls the paper to §3.2", async ({ page }) => {
  // Attention p.2, "as described in section 3.2": the link covers [188.6, 476.5, 203.1, 485.3]; its destination,
  // the heading "3.2 Attention", is at y 681 on page 3.
  const source = await sourceOf(page.request, attention);
  await seed(page, attention);
  const paper = page.locator(".paper");
  const two = page.locator('.react-pdf__Page[data-page-number="2"]');
  await expect(two.locator(".annotationLayer a").first()).toBeAttached();
  const scale = (await two.locator("canvas").boundingBox())!.width / source.pages[1].width;
  await two.evaluate((el) => el.scrollIntoView({ block: "start" }));
  await paper.evaluate((el, dy) => el.scrollBy(0, dy), 481 * scale - 400);
  const three = page.locator('.react-pdf__Page[data-page-number="3"] canvas');
  const headingInView = async () => {
    const b = (await three.boundingBox())!;
    const view = (await paper.boundingBox())!;
    const heading = b.y + 681 * scale;
    return heading > view.y && heading < view.y + view.height;
  };
  expect(await headingInView()).toBe(false);
  const box = (await two.locator("canvas").boundingBox())!;
  await page.mouse.click(box.x + 195 * scale, box.y + 481 * scale);
  await expect.poll(headingInView).toBe(true);
});

// ---- ResNet: marks, connections, undo, the view ---------------------------------------------------------------

type Box = { left: number; right: number; top: number; bottom: number };

/** An exact (Alt) drag from the middle of a wide line in the lower left column of ResNet's page 3 to the middle of one
 *  in the upper right column. Returns the lines dragged from and to, the page's middle, the new mark's lines, and the
 *  `lines` the client sent with the selection (contract 1), all in CSS pixels. */
async function twoColumnHighlight(page: Page): Promise<{ a: Box; b: Box; mid: number; lines: Box[]; sent: Box[] }> {
  const pageWidthPt: number = (await sourceOf(page.request, resnet)).pages[2].width;
  await seed(page, resnet);
  const pageEl = page.locator('.react-pdf__Page[data-page-number="3"]');
  await expect(pageEl.locator(".react-pdf__Page__textContent span").first()).toBeAttached();
  await pageEl.evaluate((el) => el.scrollIntoView({ block: "start" }));
  const canvas = (await pageEl.locator("canvas").boundingBox())!;
  const mid = canvas.x + canvas.width / 2;
  const boxes = await pageEl.locator(".react-pdf__Page__textContent span").evaluateAll((els) =>
    els.map((el) => { const r = el.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom }; }));
  const wide = (b: Box) => b.right - b.left > 120;
  const at = (fraction: number) => canvas.y + canvas.height * fraction;
  const start = boxes.findIndex((b) => b.right < mid && b.top > at(0.55) && b.bottom < at(0.8) && wide(b));
  const end = boxes.findIndex((b, i) => i > start && b.left > mid && b.top > at(0.1) && b.bottom < at(0.35) && wide(b));
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  const a = boxes[start];
  const b = boxes[end];

  const before = await markIds(page);
  await page.keyboard.down("Alt");
  await page.mouse.move((a.left + a.right) / 2, (a.top + a.bottom) / 2);
  await page.mouse.down();
  await page.mouse.move((b.left + b.right) / 2, (b.top + b.bottom) / 2, { steps: 12 });
  await page.mouse.up();
  await page.keyboard.up("Alt");
  const posted = page.waitForRequest((r) => r.url().endsWith("/text") && r.method() === "POST");
  await page.getByRole("button", { name: "Highlight", exact: true }).click();
  const scale = canvas.width / pageWidthPt;
  const sent: Box[] = ((await posted).postDataJSON().lines ?? []).map(({ rect: [x0, y0, x1, y1] }: { rect: number[] }) =>
    ({ left: canvas.x + x0 * scale, top: canvas.y + y0 * scale, right: canvas.x + x1 * scale, bottom: canvas.y + y1 * scale }));
  await expect.poll(async () => (await markIds(page)).length).toBe(before.length + 1);
  const id = (await markIds(page)).find((m) => !before.includes(m))!;
  const lines = await page.locator(`.overlay .mark[data-highlight-id="${id}"]`).evaluateAll((els) =>
    els.map((el) => { const r = el.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom }; }));
  return { a, b, mid, lines, sent };
}

test("a highlight across two columns paints the lines selected, one by one, and none outside them (D1)", async ({ page }) => {
  const { a, b, mid, lines } = await twoColumnHighlight(page);
  const left = lines.filter((l) => l.right < mid);
  const right = lines.filter((l) => l.left > mid);
  expect(left.length).toBeGreaterThan(1);
  expect(right.length).toBeGreaterThan(0);
  expect(lines.length).toBe(left.length + right.length);   // no line straddles the gutter: never one box over both columns
  for (const line of lines) expect(line.bottom - line.top).toBeLessThan(2 * (a.bottom - a.top));   // a line each, not a column box
  for (const line of left) expect(line.top).toBeGreaterThan(a.top - WORD_SLACK_PX);        // nothing above the first line
  for (const line of right) expect(line.bottom).toBeLessThan(b.bottom + WORD_SLACK_PX);    // nothing below the last
});

test("a text selection is sent with its own lines, from where the drag starts to where it ends (contract 1)", async ({ page }) => {
  const { a, b, mid, sent } = await twoColumnHighlight(page);
  const left = sent.filter((l) => l.right < mid);
  const right = sent.filter((l) => l.left > mid);
  expect(left.length).toBeGreaterThan(1);
  expect(right.length).toBeGreaterThan(0);
  expect(sent.length).toBe(left.length + right.length);   // no line over the gutter
  for (const line of sent) expect(line.bottom - line.top).toBeLessThan(2 * (a.bottom - a.top));   // one printed line each
  const first = left.reduce((x, y) => (y.top < x.top ? y : x));
  const last = right.reduce((x, y) => (y.top > x.top ? y : x));
  expect(Math.abs(first.left - (a.left + a.right) / 2)).toBeLessThan(CHAR_SLACK_PX);   // starts at the drag, not the line's start
  expect(Math.abs(last.right - (b.left + b.right) / 2)).toBeLessThan(CHAR_SLACK_PX);   // ends at the drop, not the line's end
});

// Contract 1: the client sends the selection's own lines (the test above) and POST /text builds the highlight from
// them, so it paints only what they cover, never the whole first and last lines.
test("a highlight across two columns leaves the unselected ends of its first and last lines unpainted", async ({ page }) => {
  const { a, b, mid, lines } = await twoColumnHighlight(page);
  const first = lines.filter((l) => l.right < mid).reduce((x, y) => (y.top < x.top ? y : x));
  const last = lines.filter((l) => l.left > mid).reduce((x, y) => (y.top > x.top ? y : x));
  expect(first.left).toBeGreaterThan(a.left + WORD_SLACK_PX);    // the unselected start of the first line is not painted
  expect(last.right).toBeLessThan(b.right - WORD_SLACK_PX);      // nor the unselected end of the last
});

test("two marks in no chunk, connected, show jump chips both ways, and a line once a chunk holds each", async ({ page }) => {
  await seed(page, resnet);
  const one = await highlight(page, 3, 4, 6);
  const two = await highlight(page, 4, 138, 140);
  await clickMark(page, one);
  await page.locator(".mark-popover").getByRole("button", { name: "Connect", exact: true }).click();
  await expect(page.locator(".paper.connecting")).toBeVisible();
  await clickMark(page, two);
  await expect(page.locator(".paper.connecting")).toHaveCount(0);
  await expect(page.locator(".margin-chip")).toHaveCount(2);
  await expect(page.locator(".page-wrap").nth(2).locator(".margin-chip")).toHaveCount(1);
  await expect(page.locator(".page-wrap").nth(3).locator(".margin-chip")).toHaveCount(1);

  await page.locator(".page-wrap").nth(2).locator(".margin-chip").click();
  await expect(page.locator(`.overlay .mark[data-highlight-id="${two}"]`).first()).toBeInViewport();
  await page.locator(".page-wrap").nth(3).locator(".margin-chip").click();
  await expect(page.locator(`.overlay .mark[data-highlight-id="${one}"]`).first()).toBeInViewport();

  await showBoard(page);
  await expect(page.locator(".react-flow__edge")).toHaveCount(0);   // neither end is in a chunk (D12)
  await showPaper(page);
  await cut(page, 3, 2, 8);
  await showBoard(page);
  await expect(page.locator(".node.chunk")).toHaveCount(1);
  await expect(page.locator(".react-flow__edge")).toHaveCount(0);   // one end is still in no chunk: addendum 4.0 draws nothing
  await showPaper(page);
  await cut(page, 4, 136, 142);
  await showBoard(page);
  await expect(page.locator(".node.chunk")).toHaveCount(2);
  await expect(page.locator(".react-flow__edge")).toHaveCount(1);   // both ends held: the line appears
});

test("a question with only an AI note stays on the list, and a note of your own clears it", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await seed(page, resnet);
  const id = await highlight(page, 3, 20, 22);
  await clickMark(page, id);
  const popover = page.locator(".mark-popover");
  await popover.getByLabel("question", { exact: true }).check();
  const questions = page.getByRole("button", { name: "Questions", exact: true });
  await questions.click();
  await expect(page.locator(".question-list li")).toHaveCount(1);

  await popover.getByRole("button", { name: "Ask elsewhere", exact: true }).click();
  await expect(page.locator(".node.note.ai")).toHaveCount(1);
  await expect.poll(async () => (await boardOf(page.request, resnet)).nodes.filter((n: Json) => n.type === "note").length).toBe(1);
  const marked = (await boardOf(page.request, resnet)).highlights.find((h: Json) => h.id === id).anchor.quote.exact.split(/\s+/)[0];
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain(marked);
  await popover.locator(".note-editor.ai textarea").fill("It means the block learns a residual.");
  await popover.locator(".note-editor.ai textarea").blur();
  await questions.click();
  await questions.click();   // reopened: a fresh fetch from the server
  await expect(page.locator(".question-list li")).toHaveCount(1);

  await popover.getByRole("button", { name: "Add note", exact: true }).click();
  const mine = popover.locator(".note-editor.reader textarea");
  await mine.fill("The block learns what to add to its input, not the whole mapping.");
  await mine.blur();
  await expect(page.locator(".question-list li")).toHaveCount(0);
});

test("a note typed into and never left is saved as it is typed, and is there after a reload (I1)", async ({ page }) => {
  await seed(page, resnet);
  const id = await highlight(page, 3, 20, 22);
  await clickMark(page, id);
  await page.locator(".mark-popover").getByRole("button", { name: "Add note", exact: true }).click();
  const field = page.locator(".mark-popover .note-editor.reader textarea");
  const words = "Typed and never left: the field keeps its focus.";
  await field.click();
  await page.keyboard.type(words);
  await expect(field).toBeFocused();
  await expect.poll(async () => (await boardOf(page.request, resnet)).nodes.filter((n: Json) => n.type === "note").length).toBe(1);
  const noteId = (await boardOf(page.request, resnet)).nodes.find((n: Json) => n.type === "note").id;
  await expect.poll(async () => (await (await page.request.get(`/api/papers/${resnet}/notes/${noteId}`)).json()).markdown).toBe(words);
  await expect(field).toBeFocused();   // saved while typing, not because the field lost focus

  await page.reload();
  await paperPicker(page).selectOption(resnet);
  await clickMark(page, id);
  // A written note shows rendered (D22); a click edits its plain text.
  await expect(page.locator(".mark-popover .note-editor.reader .note-rendered")).toContainText(words);
  await page.locator(".mark-popover .note-editor.reader .note-rendered").click();
  await expect(page.locator(".mark-popover .note-editor.reader textarea")).toHaveValue(words);
});

test("Cmd-Z undoes a group dissolve in one step", async ({ page }) => {
  await seed(page, resnet, { nodes: [
    group("n-g", 450, 40, 700, 560, { name: "Pile" }),
    chunk("n-a", 24, 60, "First.", { parentId: "n-g" }),
    chunk("n-b", 24, 300, "Second.", { parentId: "n-g" }),
  ] });
  await showBoard(page);
  await node(page, "n-g").locator(".group-name").click();
  await page.keyboard.press("Delete");
  await expect(node(page, "n-g")).toHaveCount(0);
  await expect(node(page, "n-a")).toBeVisible();
  await expect(node(page, "n-b")).toBeVisible();
  await expect.poll(async () => (await boardOf(page.request, resnet)).nodes.map((n: Json) => n.id).sort()).toEqual(["n-a", "n-b"]);

  await page.keyboard.press("ControlOrMeta+z");
  await expect(node(page, "n-g")).toHaveCount(1);
  await expect.poll(async () => (await boardOf(page.request, resnet)).nodes.filter((n: Json) => n.parentId === "n-g").map((n: Json) => n.id).sort())
    .toEqual(["n-a", "n-b"]);
});

test("a reload returns to the same view and the same place in the paper (SPEC 11.5)", async ({ page }) => {
  await seed(page, resnet);
  const paper = page.locator(".paper");
  await expect(page.locator('.react-pdf__Page[data-page-number="6"] canvas')).toBeAttached();
  await paper.evaluate((el) => el.scrollTo(0, 3000));
  await expect.poll(async () => (await viewOf(page.request, resnet)).paper_scroll?.page ?? -1).toBeGreaterThan(0);
  const top = await paper.evaluate((el) => el.scrollTop);
  await page.reload();
  await paperPicker(page).selectOption(resnet);
  await expect(page.getByRole("button", { name: "Paper", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect.poll(async () => Math.abs((await paper.evaluate((el) => el.scrollTop)) - top)).toBeLessThan(3);

  await showBoard(page);
  await expect.poll(async () => (await viewOf(page.request, resnet)).view).toBe("board");
  await page.reload();
  await paperPicker(page).selectOption(resnet);
  await expect(page.getByRole("button", { name: "Board", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".react-flow__pane")).toBeVisible();
  await showPaper(page);
  await expect.poll(async () => Math.abs((await paper.evaluate((el) => el.scrollTop)) - top)).toBeLessThan(3);
});

test("filtering to a first-pass tag shows only its pieces, and export writes them in either order (SPEC 11.4)", async ({ page }) => {
  await seed(page, resnet, { nodes: [chunk("n-alpha", 40, 100, "Alpha claim text."), chunk("n-beta", 40, 500, "Beta other text.")] });
  await showBoard(page);
  const alpha = node(page, "n-alpha");
  await alpha.getByRole("button", { name: "Tags", exact: true }).click();
  await alpha.getByLabel("pass 1", { exact: true }).check();
  await page.locator(".filter-bar .chip", { hasText: "pass 1" }).click();
  await expect(node(page, "n-beta")).toBeHidden();
  await expect(alpha).toBeVisible();

  await page.getByRole("button", { name: "Export", exact: true }).click();
  const inPaperOrder = await writeExport(page, "paper");
  expect(inPaperOrder).toContain("Alpha claim");
  expect(inPaperOrder).not.toContain("Beta other");
  const inTemplateOrder = await writeExport(page, "template");
  expect(inTemplateOrder).toContain("## Not in a slot");
  expect(inTemplateOrder).toContain("Alpha claim");
  expect(inTemplateOrder).not.toContain("Beta other");
});
