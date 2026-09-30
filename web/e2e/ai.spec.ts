import { expect, test } from "@playwright/test";
import { putView, viewOf } from "./headers";

/** Spec B2: AI help turned on through ⌘K on a paper it has never read. The server answers from
 *  e2e/fake-claude.json (PAPERBOARD_FAKE_CLAUDE, set by e2e/server.mjs), so no request leaves the machine. */

let paper = "";

test.afterEach(async ({ request }) => { await putView(request, paper); });

test("turning AI on through ⌘K reads the paper and underlines its terms (B2)", async ({ page, request }) => {
  const papers = (await (await request.get("/api/papers")).json()) as { paper_id: string }[];
  paper = papers.find((p) => p.paper_id.includes("residual"))!.paper_id;
  await putView(request, paper, { view: "paper" });

  // Hold the pass until "AI reading…" has been seen: the canned answer is otherwise instant.
  let release: () => void = () => {};
  const held = new Promise<void>((resolve) => { release = resolve; });
  await page.route(`**/api/papers/${paper}/ai`, async (route) => {
    if (route.request().method() === "POST") await held;
    await route.continue();
  });

  await page.goto("/");
  await page.getByRole("combobox", { name: "Paper", exact: true }).selectOption(paper);
  await page.getByRole("button", { name: "Commands (⌘K)" }).click();
  await page.getByRole("dialog", { name: "Commands" }).getByRole("option", { name: "Turn AI help on" }).click();

  await expect(page.getByRole("status").filter({ hasText: "AI reading…" })).toBeVisible();
  release();
  await expect(page.locator(".ai-term").first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("AI reading…")).toHaveCount(0);
  expect((await viewOf(request, paper)).ai).toBe(true);
});

test("key sentences: highlighted on the paper, listed by slot, a jump each, and Keep makes one of your own", async ({ page, request }) => {
  const papers = (await (await request.get("/api/papers")).json()) as { paper_id: string }[];
  paper = papers.find((p) => p.paper_id.includes("residual"))!.paper_id;
  await putView(request, paper, { view: "paper", ai: true });
  const before = (await (await request.get(`/api/papers/${paper}/board`)).json()).highlights.length;

  await page.goto("/");
  await page.getByRole("combobox", { name: "Paper", exact: true }).selectOption(paper);
  const badge = page.getByRole("button", { name: /Key sentences/ });
  await expect(badge).toBeVisible({ timeout: 15_000 });
  await expect(badge.locator(".count")).toHaveText("6");
  await expect(page.locator(".key-sentence").first()).toBeAttached();

  await badge.click();
  const panel = page.getByRole("region", { name: "Key sentences" });
  await expect(panel.locator(".slot-head").first()).toHaveText("Background");
  const entries = panel.getByRole("listitem");
  await expect(entries).toHaveCount(6);

  // The last entry is deep in the paper: clicking it scrolls the paper there.
  const scroller = page.locator(".paper").first();
  const top = await scroller.evaluate((el) => el.scrollTop);
  await entries.last().locator("button.sentence").click();
  await expect.poll(() => scroller.evaluate((el) => el.scrollTop)).toBeGreaterThan(top);

  await entries.first().getByRole("button", { name: "Keep" }).click();
  await expect(entries.first()).toContainText("Kept");
  await expect.poll(async () => (await (await request.get(`/api/papers/${paper}/board`)).json()).highlights.length)
    .toBe(before + 1);
  await page.reload();
  await expect.poll(async () => (await (await request.get(`/api/papers/${paper}/board`)).json()).highlights.length)
    .toBe(before + 1);
});
