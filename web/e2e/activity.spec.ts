import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { putView } from "./headers";

/** Activity log spec: what the reader does is recorded, shown in plain words, and stops when switched off. */

let paper = "";
const activity = async (request: APIRequestContext) =>
  ((await (await request.get(`/api/papers/${paper}/activity?limit=5000`)).json()) as { events: { kind: string; action: string; detail: Record<string, unknown> }[] }).events;
const command = async (page: Page, name: string) => {
  await page.getByRole("button", { name: "Commands (⌘K)" }).click();
  await page.getByRole("dialog", { name: "Commands" }).getByRole("option", { name, exact: true }).click();
};

test.afterEach(async ({ request }) => { await putView(request, paper); });

test("a note and a view switch are recorded, shown in the Activity panel, and nothing is added once it is off", async ({ page, request }) => {
  const papers = (await (await request.get("/api/papers")).json()) as { paper_id: string }[];
  paper = papers.find((p) => p.paper_id.includes("residual"))!.paper_id;
  await putView(request, paper, { view: "paper", log: true });
  const before = (await activity(request)).length;

  await page.goto("/");
  await page.getByRole("combobox", { name: "Paper", exact: true }).selectOption(paper);
  await page.getByRole("button", { name: "Board", exact: true }).click();
  await page.locator(".react-flow__pane").dblclick({ position: { x: 500, y: 300 } });
  const note = page.locator("textarea.note-text");
  await expect(note).toBeFocused();
  await note.fill("the encoder attends to every word at once");
  await page.locator(".react-flow__pane").click({ position: { x: 900, y: 600 } });   // editing ends

  await command(page, "Activity");
  const panel = page.getByRole("region", { name: "Activity" });
  await expect(panel).toContainText("Wrote a note: “the encoder attends to every word at once”");
  await expect(panel).toContainText("Switched to the board");
  await expect(panel).toContainText("Recording what you do in this paper");
  await expect.poll(async () => (await activity(request)).length).toBeGreaterThan(before);
  const recorded = (await activity(request)).slice(before);
  expect(recorded.map((e) => `${e.kind}:${e.action}`)).toEqual(expect.arrayContaining(["session:open", "read:view", "build:note"]));

  await command(page, "Turn activity log off");
  await page.waitForTimeout(500);
  const off = (await activity(request)).length;
  await page.getByRole("button", { name: "Paper", exact: true }).click();
  await page.getByRole("button", { name: "Board", exact: true }).click();
  await page.waitForTimeout(6000);   // longer than the 5 s flush
  expect((await activity(request)).length).toBe(off);
});
