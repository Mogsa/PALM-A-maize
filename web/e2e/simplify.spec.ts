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

  await selectOnPaper(page);
  await page.keyboard.press("Escape");   // the bar goes; the words stay selected
  const board = (await page.locator(".board").boundingBox())!;
  const drop = { x: board.x + board.width - 200, y: board.y + board.height - 150 };
  // Playwright's simulated mouse cannot reliably start Chromium's native "drag selected text" gesture in headless
  // mode, so the HTML5 drag sequence is dispatched directly, sharing one DataTransfer across dragstart/dragover/drop
  // the way a real drag would; the selection itself (made by a real mouse drag above) is still what the app reads.
  await page.evaluate(({ dropX, dropY }) => {
    const source = document.querySelectorAll('.react-pdf__Page[data-page-number="1"] .react-pdf__Page__textContent span')[11]!;
    const target = document.querySelector(".react-flow__pane")!;
    const dataTransfer = new DataTransfer();
    const at = source.getBoundingClientRect();
    const fire = (el: Element, type: string, x: number, y: number) =>
      el.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, dataTransfer }));
    fire(source, "dragstart", at.x + 2, at.y + at.height / 2);
    fire(target, "dragover", dropX, dropY);
    fire(target, "drop", dropX, dropY);
    fire(source, "dragend", dropX, dropY);
  }, { dropX: drop.x, dropY: drop.y });
  await expect(page.locator(".react-flow__node")).toHaveCount(2);
  await expect.poll(async () => (await boardOf(page)).nodes.length).toBe(2);
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

test("Shift and drag draws a lasso that selects, then Group; ● colours them all (A3)", async ({ page }) => {
  await seed(page, "board", [chunk("n-a", 40, 60, "First."), chunk("n-b", 420, 60, "Second.")]);
  const pane = (await page.locator(".react-flow__pane").boundingBox())!;
  await page.keyboard.down("Shift");
  await page.mouse.move(pane.x + 10, pane.y + 10);
  await page.mouse.down();
  await page.mouse.move(pane.x + 900, pane.y + 400, { steps: 10 });
  await page.mouse.up();
  await page.keyboard.up("Shift");
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
  // "Turn AI help on" is Part B's ⌘K entry (spec B2, B3a), merged in after this plan was written; AI itself stays off.
  // No "Add missing sections": trays are off (TRAYS_ENABLED).
  await expect(options).toHaveText(["Export", "Tags", "Template", "New note", "Find in paper", "Shortcuts", "Turn AI help on"]);
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

test("a plain drag on empty board pans it", async ({ page }) => {
  await seed(page, "board", [chunk("n-a", 40, 60, "First.")]);
  const pane = (await page.locator(".react-flow__pane").boundingBox())!;
  const before = (await page.locator('.react-flow__node[data-id="n-a"]').boundingBox())!;
  await page.mouse.move(pane.x + 400, pane.y + 300);
  await page.mouse.down();
  await page.mouse.move(pane.x + 150, pane.y + 100, { steps: 10 });
  await page.mouse.up();
  const after = (await page.locator('.react-flow__node[data-id="n-a"]').boundingBox())!;
  expect(Math.abs(after.x - before.x)).toBeGreaterThan(50);
  await expect(page.locator(".react-flow__node.selected")).toHaveCount(0);   // it panned, it did not lasso-select
});

test("scrolling zooms the board, and scrolls the paper up and down", async ({ page }) => {
  await seed(page, "both", [chunk("n-a", 40, 60, "First.")]);
  const card = page.locator('.react-flow__node[data-id="n-a"]');
  const before = (await card.boundingBox())!;
  const pane = (await page.locator(".react-flow__pane").boundingBox())!;
  await page.mouse.move(pane.x + pane.width / 2, pane.y + pane.height / 2);
  await page.mouse.wheel(0, -400);
  await expect.poll(async () => (await card.boundingBox())!.width).toBeGreaterThan(before.width * 1.1);   // it zoomed in

  const paperPane = page.locator(".paper");
  const box = (await paperPane.boundingBox())!;
  const top = await paperPane.evaluate((el) => el.scrollTop);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, 600);
  await expect.poll(() => paperPane.evaluate((el) => el.scrollTop)).toBeGreaterThan(top + 100);   // the paper moved down
});

test("right-click on empty board makes a free note there, with nothing highlighted", async ({ page }) => {
  await seed(page, "board");
  await page.locator(".react-flow__pane").click({ position: { x: 500, y: 300 }, button: "right" });
  await page.getByRole("menu", { name: "Board" }).getByRole("menuitem", { name: /New note/ }).click();
  await expect(page.locator("textarea.note-text")).toBeFocused();
  await page.keyboard.type("My own idea.");
  await expect.poll(async () => (await boardOf(page)).nodes.filter((n: Json) => n.type === "note").length).toBe(1);
  await expect(page.getByRole("menu", { name: "Board" })).toHaveCount(0);
});
