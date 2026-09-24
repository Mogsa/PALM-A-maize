import { expect, test, type Page } from "@playwright/test";
import { WRITE } from "./headers";

/** Every test here starts from a saved, empty board: first open (D15) never runs, and no earlier spec's pieces remain. */
test.beforeEach(async ({ request }) => {
  const [paper] = await (await request.get("/api/papers")).json();
  const path = `/api/papers/${paper.paper_id}/board`;
  const board = await (await request.get(path)).json();
  const empty = { ...board, nodes: [], edges: [], highlights: [], active_tags: [], view: "paper" };
  delete empty.paper_scroll;
  const saved = await request.put(path, { data: empty, headers: { "If-Match": String(board.version), ...WRITE } });
  expect(saved.ok()).toBeTruthy();
});

async function selectSpan(page: Page, pageIndex: number, fromSpan: number, toSpan: number) {
  const spans = page.locator(`.react-pdf__Page[data-page-number="${pageIndex + 1}"] .react-pdf__Page__textContent span`);
  await expect(spans.nth(toSpan)).toBeVisible();
  await spans.nth(fromSpan).scrollIntoViewIfNeeded();
  const a = (await spans.nth(fromSpan).boundingBox())!;
  const b = (await spans.nth(toSpan).boundingBox())!;
  await page.mouse.move(a.x + 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width - 2, b.y + b.height / 2, { steps: 8 });
  await page.mouse.up();
  await expect(page.locator(".popover")).toBeVisible();
}

test("highlights and cuts survive a reload and the views mirror each other", async ({ page }) => {
  await page.goto("/");
  await page.locator("select").selectOption({ index: 1 });
  await expect(page.locator(".react-pdf__Page").first()).toBeVisible();

  // five highlights on page 3 (index 2), three cuts on pages 3 and 4, each within one column.
  // The last highlight (spans 55-57) lies inside the first cut (spans 50-70), so it must show through that chunk.
  for (const [from, to] of [[4, 6], [10, 12], [20, 22], [30, 31], [55, 57]]) {
    await selectSpan(page, 2, from, to);
    await page.getByRole("button", { name: "Highlight" }).click();
    await expect(page.locator(".popover")).toBeHidden();
  }
  for (const [pageIndex, from, to] of [[2, 50, 70], [3, 138, 144], [3, 167, 173]]) {
    await selectSpan(page, pageIndex, from, to);
    await page.getByRole("button", { name: "Cut" }).click();
    await expect(page.locator(".popover")).toBeHidden();
  }
  const highlights = async () => new Set(await page.locator(".overlay .mark").evaluateAll(
    (marks) => marks.map((m) => m.getAttribute("data-highlight-id")))).size;   // a mark per line since D1
  await expect.poll(highlights).toBe(5);
  await expect(page.locator(".overlay .outline")).toHaveCount(3);
  await expect(page.locator(".notice")).toHaveText(/Saved v\d+/);

  await page.reload();
  await page.locator("select").selectOption({ index: 1 });
  await expect.poll(highlights).toBe(5);
  await expect(page.locator(".overlay .outline")).toHaveCount(3);

  await page.getByRole("button", { name: "Board" }).click();
  await expect(page.locator(".node.chunk")).toHaveCount(3);

  // text of the cut over page index 2, spans 50-70 (its stored quote starts "( )\n" before it, so match by containment)
  const cutText = "explicitly let these layers approximate a residual";
  const pageThreeChunk = page.locator(".node.chunk", { hasText: cutText });
  await expect(pageThreeChunk).toHaveCount(1);
  await expect(pageThreeChunk.locator("mark")).toHaveCount(1);   // SPEC 11.6: every mark shows through its chunk
  const nodeId = await page.locator(".react-flow__node", { has: pageThreeChunk }).getAttribute("data-id");
  expect(nodeId).toMatch(/^n-/);
  await pageThreeChunk.locator("[data-testid=open-source]").click();

  // Only a real jump satisfies these once the pages have rendered: page 1 has scrolled away and
  // the clicked chunk's own outline on page 3 is on screen.
  await expect(page.locator(".react-pdf__Page")).toHaveCount(12);
  const pageThree = page.locator(`.react-pdf__Page[data-page-number="3"]`);
  await expect(pageThree.locator(".react-pdf__Page__canvas")).toBeVisible();
  await expect(page.locator(`.react-pdf__Page[data-page-number="1"]`)).not.toBeInViewport();
  await expect(page.locator(`.overlay .outline[data-node-id="${nodeId}"]`).first()).toBeInViewport();
});
