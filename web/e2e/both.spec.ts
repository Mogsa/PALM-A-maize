import { expect, test, type Page } from "@playwright/test";
import { putView, viewOf, WRITE } from "./headers";

/** Paper | Both | Board: in "both" the paper is on the left and the board on the right, with a saved divider. */

type Json = Record<string, any>;
const quote = (exact: string) => ({ exact, prefix: "", suffix: "" });
const AREA = [50, 130, 280, 300];
const chunk = (id: string, x: number, y: number, text: string) => ({
  id, type: "chunk", position: { x, y }, width: 320,
  data: { tags: [], collapsed: false, user_sized: false, source_id: null,
    region: { rects: [{ page: 0, rect: AREA }], start: quote(text), end: quote(text), position: 0, state: "anchored" },
    blocks: [{ kind: "text", page: 0, rect: AREA, text }] },
});

let resnet = "";

async function seedBoth(page: Page, split = 0.5) {
  resnet = ((await (await page.request.get("/api/papers")).json()) as { paper_id: string }[])[0].paper_id;
  const current: Json = await (await page.request.get(`/api/papers/${resnet}/board`)).json();
  const next = { ...current, nodes: [chunk("n-a", 40, 100, "A piece of the first page.")], edges: [], highlights: [] };
  const put = await page.request.put(`/api/papers/${resnet}/board`, { data: next, headers: { "If-Match": String(current.version), ...WRITE } });
  expect(put.ok()).toBeTruthy();
  await putView(page.request, resnet, { view: "both", split, viewport: { x: 0, y: 0, zoom: 1 } });
  await page.goto("/");
  await page.getByRole("combobox", { name: "Paper", exact: true }).selectOption(resnet);
  await expect(page.locator(".react-pdf__Page").first()).toBeVisible();
}

const both = (page: Page) => page.getByRole("button", { name: "Both", exact: true });
const paneShare = (page: Page) => page.evaluate(() => {
  const paper = document.querySelector(".paper-pane")!.getBoundingClientRect();
  const views = document.querySelector(".views")!.getBoundingClientRect();
  return paper.width / views.width;
});

test("both shows the paper on the left and the board on the right, and the divider is saved and restored", async ({ page }) => {
  await seedBoth(page, 0.5);
  await expect(both(page)).toHaveAttribute("aria-pressed", "true");
  const paper = (await page.locator(".paper").boundingBox())!;
  const board = (await page.locator(".react-flow__pane").boundingBox())!;
  expect(paper.x + paper.width).toBeLessThanOrEqual(board.x + 1);
  await expect(page.locator('.react-flow__node[data-id="n-a"]')).toBeVisible();

  const divider = (await page.getByRole("separator").boundingBox())!;
  const views = (await page.locator(".views").boundingBox())!;
  await page.mouse.move(divider.x + divider.width / 2, divider.y + 200);
  await page.mouse.down();
  await page.mouse.move(views.x + views.width * 0.3, divider.y + 200, { steps: 6 });
  await page.mouse.up();
  await expect.poll(async () => (await viewOf(page.request, resnet)).split).toBeCloseTo(0.3, 1);

  // dragged past the edge, it stops at 0.15
  const moved = (await page.getByRole("separator").boundingBox())!;
  await page.mouse.move(moved.x + moved.width / 2, moved.y + 200);
  await page.mouse.down();
  await page.mouse.move(views.x + 2, moved.y + 200, { steps: 6 });
  await page.mouse.up();
  await expect.poll(async () => (await viewOf(page.request, resnet)).split).toBeCloseTo(0.15, 2);

  await page.reload();
  await page.getByRole("combobox", { name: "Paper", exact: true }).selectOption(resnet);
  await expect(both(page)).toHaveAttribute("aria-pressed", "true");
  await expect.poll(() => paneShare(page)).toBeLessThan(0.2);
});

test("in both, clicking a piece on the board scrolls the paper to it and flashes it, without switching view", async ({ page }) => {
  await seedBoth(page);
  const paper = page.locator(".paper");
  await expect(page.locator('.react-pdf__Page[data-page-number="6"] canvas')).toBeAttached();
  await paper.evaluate((el) => el.scrollTo(0, 4000));
  await page.locator('.react-flow__node[data-id="n-a"] .block-text').click();
  await expect(page.locator(".focus-flash")).toBeVisible();
  await expect.poll(() => paper.evaluate((el) => el.scrollTop)).toBeLessThan(400);
  await expect(both(page)).toHaveAttribute("aria-pressed", "true");
});

test("in both, a cut on the paper lands on the board at once", async ({ page }) => {
  await seedBoth(page);
  const spans = page.locator('.react-pdf__Page[data-page-number="1"] .react-pdf__Page__textContent span');
  await expect(spans.nth(12)).toBeVisible();
  const a = (await spans.nth(10).boundingBox())!;
  const b = (await spans.nth(12).boundingBox())!;
  await page.mouse.move(a.x + 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width - 2, b.y + b.height / 2, { steps: 8 });
  await page.mouse.up();
  await page.getByRole("button", { name: "Cut", exact: true }).click();
  await expect(page.locator(".react-flow__node")).toHaveCount(2);
  await expect(both(page)).toHaveAttribute("aria-pressed", "true");
});
