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
