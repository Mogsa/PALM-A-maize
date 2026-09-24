import { expect, test, type Page } from "@playwright/test";

/** Every test here starts from a saved, empty board: first open (D15) never runs, and no earlier spec's pieces remain. */
test.beforeEach(async ({ request }) => {
  const [paper] = await (await request.get("/api/papers")).json();
  const path = `/api/papers/${paper.paper_id}/board`;
  const board = await (await request.get(path)).json();
  const empty = { ...board, nodes: [], edges: [], highlights: [], active_tags: [], view: "paper" };
  delete empty.paper_scroll;
  const saved = await request.put(path, { data: empty, headers: { "If-Match": String(board.version) } });
  expect(saved.ok()).toBeTruthy();
});

async function selectSpans(page: Page, pageNo: number, from: number, to: number) {
  const spans = page.locator(`.react-pdf__Page[data-page-number="${pageNo}"] .react-pdf__Page__textContent span`);
  await expect(spans.nth(to)).toBeVisible();
  await spans.nth(from).scrollIntoViewIfNeeded();
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

test("a long chunk fades", async ({ page }) => {
  await page.goto("/");
  await page.locator("select").selectOption({ index: 1 });
  await expect(page.locator(".react-pdf__Page").first()).toBeVisible();
  await page.getByRole("button", { name: "Board", exact: true }).click();
  await page.getByRole("button", { name: "Paper", exact: true }).click();
  // spans 4 to 70 of page 3 sit in one column (step3.spec cuts 50 to 70 there); the rough drag snaps to whole paragraphs
  await selectSpans(page, 3, 4, 70);
  await page.getByRole("button", { name: "Cut" }).click();
  await expect(page.locator(".notice")).toHaveText(/Saved v\d+/);
  await page.getByRole("button", { name: "Board", exact: true }).click();
  const card = page.locator(".node.chunk").first();
  await expect(card.locator(".badge")).toHaveText("p3");
  await expect(card).toHaveClass(/overflowing/);
});
