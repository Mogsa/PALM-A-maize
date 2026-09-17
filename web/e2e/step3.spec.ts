import { expect, test, type Page } from "@playwright/test";

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

  // five highlights on page 3 (index 2), three cuts on pages 3 and 4, each within one column
  for (const [from, to] of [[4, 6], [10, 12], [20, 22], [30, 31], [40, 43]]) {
    await selectSpan(page, 2, from, to);
    await page.getByRole("button", { name: "Highlight" }).click();
    await expect(page.locator(".popover")).toBeHidden();
  }
  for (const [pageIndex, from, to] of [[2, 50, 70], [3, 138, 144], [3, 167, 173]]) {
    await selectSpan(page, pageIndex, from, to);
    await page.getByRole("button", { name: "Cut" }).click();
    await expect(page.locator(".popover")).toBeHidden();
  }
  await expect(page.locator(".overlay .mark")).toHaveCount(5);
  await expect(page.locator(".overlay .outline")).toHaveCount(3);
  await expect(page.locator(".notice")).toHaveText(/Saved v\d+/);

  await page.reload();
  await page.locator("select").selectOption({ index: 1 });
  await expect(page.locator(".overlay .mark")).toHaveCount(5);
  await expect(page.locator(".overlay .outline")).toHaveCount(3);

  await page.getByRole("button", { name: "Board" }).click();
  await expect(page.locator(".node.chunk")).toHaveCount(3);

  const first = page.locator(".node.chunk").first();
  await first.locator("[data-testid=open-source]").click();
  await expect(page.locator(".react-pdf__Page")).toHaveCount(12);
  const target = page.locator(`.react-pdf__Page[data-page-number="3"]`);
  await expect(target).toBeInViewport();
});
