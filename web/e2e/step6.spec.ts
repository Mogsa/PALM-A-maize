import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { putView, WRITE } from "./headers";

/** Live text on the board (D20, D21 and a note from a line, addendum 4.10), mechanised. Runs after step5, on ResNet
 *  only: every test saves the board it needs first, opened on the board. ResNet's §3.1 is the chunk: four text blocks
 *  on page 3. */

type Json = Record<string, any>;
const SECTION = "3.1. Residual Learning";
// Ids as the client mints them: a kind and a ULID (addendum 4.5).
const CHUNK = "n-01K0BRDTXTCHNK000000000000";
const MARK = "h-01K0BRDTXTMRK0000000000000";
const OTHER = "n-01K0BRDTXT0THER00000000000";
const GROUP = "n-01K0BRDTXTGR0VP00000000000";
const PIECES = ["n-01K0BRDTXTPC01000000000000", "n-01K0BRDTXTPC02000000000000", "n-01K0BRDTXTPC03000000000000"];
/** Twice the board's 500 ms save debounce: long enough for what the page did to reach the server. */
const SAVED_MS = 1_000;

let resnet = "";

test.beforeAll(async ({ playwright }, info) => {
  const request = await playwright.request.newContext({ baseURL: info.project.use.baseURL });
  const papers: { paper_id: string }[] = await (await request.get("/api/papers")).json();
  resnet = papers.map((p) => p.paper_id).find((id) => id.includes("residual"))!;
  await request.dispose();
});

// ---- helpers ------------------------------------------------------------------------------------------------

const boardOf = async (request: APIRequestContext): Promise<Json> => (await request.get(`/api/papers/${resnet}/board`)).json();
const post = async (request: APIRequestContext, route: string, body: Json): Promise<Json> =>
  (await request.post(`/api/papers/${resnet}/${route}`, { data: body, headers: WRITE })).json();

/** Saves a board holding exactly these things, shown on the board at zoom 1. */
async function save(request: APIRequestContext, parts: { nodes?: Json[]; edges?: Json[]; highlights?: Json[] }) {
  const current = await boardOf(request);
  const next: Json = { ...current, nodes: parts.nodes ?? [], edges: parts.edges ?? [], highlights: parts.highlights ?? [] };
  const put = await request.put(`/api/papers/${resnet}/board`, { data: next, headers: { "If-Match": String(current.version), ...WRITE } });
  expect(put.ok()).toBeTruthy();
  await putView(request, resnet, { view: "board", viewport: { x: 0, y: 0, zoom: 1 } });
}

async function open(page: Page) {
  await page.goto("/");
  await page.getByRole("combobox", { name: "Paper", exact: true }).selectOption(resnet);
  await expect(page.locator(".react-flow__node").first()).toBeVisible();
}

/** A section's chunk data as split makes it (§3.1 unless named), on an empty board. */
async function sectionData(request: APIRequestContext, title = SECTION): Promise<Json> {
  await save(request, {});
  const source: Json = await (await request.get(`/api/papers/${resnet}/source`)).json();
  const id = source.sections.find((s: Json) => s.title === title).id;
  const drafts: Json[] = (await post(request, "split", {})).nodes;
  return { ...drafts.find((d) => d.data.source_id === id)!.data, collapsed: false };
}

/** A chunk tall and wide enough that all its text shows without scrolling the card. */
const chunk = (id: string, data: Json, x = 60) => ({ id, type: "chunk", position: { x, y: 80 }, width: 600, height: 860, data: { ...data, user_sized: true } });
const cardOf = (page: Page, id: string) => page.locator(`.react-flow__node[data-id="${id}"]`);
const text = (data: Json) => data.blocks.filter((b: Json) => b.kind === "text").map((b: Json) => b.text.split(/\s+/).join(" ").trim()).join(" ");

/** The screen box of the first or last character of `words` in a card's text. */
async function charBox(page: Page, nodeId: string, words: string, end: boolean) {
  const box = await page.evaluate(({ nodeId, words, end }) => {
    for (const p of Array.from(document.querySelectorAll(`.react-flow__node[data-id="${nodeId}"] p.block-text`))) {
      const at = (p.textContent ?? "").indexOf(words);
      if (at === -1) continue;
      let target = end ? at + words.length - 1 : at;
      const walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const length = node.textContent!.length;
        if (target < length) {
          const range = document.createRange();
          range.setStart(node, target);
          range.setEnd(node, target + 1);
          const r = range.getBoundingClientRect();
          return { x: r.left, y: r.top, width: r.width, height: r.height };
        }
        target -= length;
      }
    }
    return null;
  }, { nodeId, words, end });
  expect(box, `"${words}" on the card`).not.toBeNull();
  return box!;
}

/** A mouse drag across a card's text, from the first character of `from` to the last of `to`. */
async function selectOnCard(page: Page, nodeId: string, from: string, to: string) {
  const a = await charBox(page, nodeId, from, false);
  const b = await charBox(page, nodeId, to, true);
  await page.mouse.move(a.x + 1, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width - 1, b.y + b.height / 2, { steps: 8 });
  await page.mouse.up();
  await expect(page.getByRole("dialog", { name: "Words on the card" })).toBeVisible();
}

/** Right-clicks the words selected on a card: the menu with Split here and Cut out (D21). */
async function rightClickSelection(page: Page) {
  const r = await page.evaluate(() => {
    const box = window.getSelection()!.getRangeAt(0).getClientRects()[0];
    return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
  });
  await page.mouse.click(r.x, r.y, { button: "right" });
}

const chunksOf = (board: Json) => board.nodes.filter((n: Json) => n.type === "chunk");

/** A line drawn from a mark's handle on a card and let go of at a screen point. */
async function drawLineFrom(page: Page, nodeId: string, markId: string, to: { x: number; y: number }) {
  const handle = (await cardOf(page, nodeId).locator(`.react-flow__handle[data-handleid="${markId}"]`).boundingBox())!;
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 10 });
  await page.mouse.up();
}

/** The centre of an element's box on screen. */
async function centreOf(locator: ReturnType<Page["locator"]>) {
  const box = (await locator.boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

// ---- tests --------------------------------------------------------------------------------------------------

test("words highlighted on a card are marked on the paper too, and selecting them does not move the card (D20)", async ({ page }) => {
  await save(page.request, { nodes: [chunk(CHUNK, await sectionData(page.request))] });
  await open(page);
  const before = await cardOf(page, CHUNK).boundingBox();
  await selectOnCard(page, CHUNK, "counterintuitive", "phenomena");
  expect(await cardOf(page, CHUNK).boundingBox()).toEqual(before);           // Review Focus 3
  await page.getByRole("button", { name: "Highlight", exact: true }).click();
  const mark = cardOf(page, CHUNK).locator(".node-body mark[data-highlight-id]");
  await expect(mark).toHaveText(/counterintuitive\s+phenomena/);
  const id = await mark.getAttribute("data-highlight-id");
  await page.getByRole("button", { name: "Paper", exact: true }).click();
  await expect(page.locator(`.overlay .mark[data-highlight-id="${id}"]`).first()).toBeAttached();
  await page.waitForTimeout(SAVED_MS);
  const saved = await boardOf(page.request);
  expect(saved.highlights.map((h: Json) => h.id)).toEqual([id]);
  expect(saved.highlights[0].anchor.quote.exact).toMatch(/^counterintuitive\s+phenomena$/);
});

test("Cut out makes three pieces whose text is the chunk's in paper order, and each mark stays with its piece (D21)", async ({ page }) => {
  const data = await sectionData(page.request);
  const anchor = (await post(page.request, "chunks/highlight", { region: data.region, quote: { exact: "underlying mapping" } })).highlight;
  await save(page.request, { nodes: [chunk(CHUNK, data)], highlights: [{ id: MARK, tags: [], anchor }] });
  await open(page);
  await selectOnCard(page, CHUNK, "As we discussed", "shallower counterpart.");
  await expect(page.getByRole("button", { name: "Cut out", exact: true })).toBeVisible();   // ✂ is in the bar (spec A2)
  await rightClickSelection(page);
  await page.getByRole("button", { name: "Cut out", exact: true }).click();
  await expect(page.locator(".node.chunk")).toHaveCount(3);
  await page.waitForTimeout(SAVED_MS);
  const pieces = chunksOf(await boardOf(page.request)).sort((a: Json, b: Json) => a.position.x - b.position.x);
  expect(pieces[0].id).toBe(CHUNK);                                           // the first piece is the chunk itself
  expect(pieces.map((p: Json) => text(p.data)).join(" ")).toBe(text(data));
  // Whole printed lines: the selection ends mid-line, at "counterpart.", and the piece takes the rest of that line.
  expect(text(pieces[1].data)).toMatch(/^phenomena about the degradation problem .* counterpart\. The degradation problem suggests that the solvers$/);
  await expect(cardOf(page, CHUNK).locator("mark[data-highlight-id]")).toHaveCount(1);
  await expect(cardOf(page, pieces[1].id).locator("mark[data-highlight-id]")).toHaveCount(0);
  await page.keyboard.press("ControlOrMeta+z");
  await expect(page.locator(".node.chunk")).toHaveCount(1);                   // one undo step
});

test("Join makes neighbours one chunk again, and pieces that are not neighbours offer Group instead (D21)", async ({ page }) => {
  const data = await sectionData(page.request);
  const at = { exact: "As we discussed in the introduction" };
  const drafts: Json[] = (await post(page.request, "chunks/split", { region: data.region, at, mode: "cut" })).nodes;
  await save(page.request, { nodes: drafts.map((d, i) => ({ ...chunk(PIECES[i], { ...d.data, collapsed: true }, 60 + i * 420), height: undefined, width: 380 })) });
  await open(page);
  const head = (id: string) => cardOf(page, id).locator(".node-head .title");
  await head(PIECES[0]).click();
  await head(PIECES[2]).click({ modifiers: ["ControlOrMeta"] });
  await expect(page.getByRole("button", { name: "Group", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Join", exact: true })).toHaveCount(0);
  await head(PIECES[1]).click({ modifiers: ["ControlOrMeta"] });
  await page.getByRole("button", { name: "Join", exact: true }).click();
  await expect(page.locator(".node.chunk")).toHaveCount(1);
  await page.waitForTimeout(SAVED_MS);
  const [joined] = chunksOf(await boardOf(page.request));
  expect(joined.id).toBe(PIECES[0]);
  expect(text(joined.data)).toBe(text(data));
  expect(joined.data.region.rects).toEqual(data.region.rects);
});

test("a line drawn from a mark and let go on empty board makes a note connected to the mark", async ({ page }) => {
  const data = await sectionData(page.request);
  const anchor = (await post(page.request, "chunks/highlight", { region: data.region, quote: { exact: "underlying mapping" } })).highlight;
  await save(page.request, { nodes: [chunk(CHUNK, data)], highlights: [{ id: MARK, tags: [], anchor }] });
  await open(page);
  await drawLineFrom(page, CHUNK, MARK, { x: 1000, y: 700 });
  await expect(page.locator(".node.note textarea")).toBeFocused();
  await page.waitForTimeout(SAVED_MS);
  const saved = await boardOf(page.request);
  const note = saved.nodes.find((n: Json) => n.type === "note");
  expect(saved.edges).toEqual([expect.objectContaining({ from: MARK, to: note.id })]);
});

test("Split here on the chunk's first line changes nothing and says so; lower down it makes two pieces (D21)", async ({ page }) => {
  const data = await sectionData(page.request);
  await save(page.request, { nodes: [chunk(CHUNK, data)] });
  await open(page);
  const opening = data.blocks.find((b: Json) => b.kind === "text").text.split(/\s+/).slice(0, 3).join(" ");
  await selectOnCard(page, CHUNK, opening, opening);
  await rightClickSelection(page);
  await page.getByRole("menuitem", { name: "Split here", exact: true }).click();
  await expect(page.locator(".text-popover .popover-note")).toHaveText("This is already where the piece starts.");   // Review Focus 4
  await expect(page.locator(".node.chunk")).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Words on the card" })).toHaveCount(0);
  await selectOnCard(page, CHUNK, "As we discussed", "shallower counterpart.");
  await rightClickSelection(page);
  await page.getByRole("menuitem", { name: "Split here", exact: true }).click();
  await expect(page.locator(".node.chunk")).toHaveCount(2);
  await page.waitForTimeout(SAVED_MS);
  const pieces = chunksOf(await boardOf(page.request)).sort((a: Json, b: Json) => a.position.x - b.position.x);
  expect(pieces[0].id).toBe(CHUNK);                                           // the first piece is the chunk itself
  expect(pieces.map((p: Json) => text(p.data)).join(" ")).toBe(text(data));
  expect(text(pieces[1].data)).toMatch(/^phenomena about the degradation problem /);
});

test("a line let go of on a group makes nothing, and a line that reaches a card connects to it without a note", async ({ page }) => {
  const other = { ...(await sectionData(page.request, "3.2. Identity Mapping by Shortcuts")), collapsed: true };
  const data = await sectionData(page.request);
  const anchor = (await post(page.request, "chunks/highlight", { region: data.region, quote: { exact: "underlying mapping" } })).highlight;
  const group = { id: GROUP, type: "group", position: { x: 780, y: 80 }, width: 520, height: 300, data: { tags: [], name: null } };
  const below = { ...chunk(OTHER, other, 780), position: { x: 780, y: 520 }, width: 380, height: undefined };
  await save(page.request, { nodes: [chunk(CHUNK, data), group, below], highlights: [{ id: MARK, tags: [], anchor }] });
  await open(page);
  await drawLineFrom(page, CHUNK, MARK, await centreOf(cardOf(page, GROUP)));
  await page.waitForTimeout(SAVED_MS);
  await expect(page.locator(".node.note")).toHaveCount(0);
  expect((await boardOf(page.request)).edges).toEqual([]);
  await drawLineFrom(page, CHUNK, MARK, await centreOf(cardOf(page, OTHER).locator(`.react-flow__handle[data-handleid="${OTHER}-in"]`)));
  await page.waitForTimeout(SAVED_MS);
  await expect(page.locator(".node.note")).toHaveCount(0);
  const saved = await boardOf(page.request);
  expect(saved.nodes.filter((n: Json) => n.type === "note")).toEqual([]);
  expect(saved.edges).toEqual([expect.objectContaining({ from: MARK, to: OTHER })]);
});
