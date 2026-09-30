import { expect, test, type APIRequestContext } from "@playwright/test";
import { putView, WRITE } from "./headers";

/** Bring your own agent (spec 2026-09-30): an agent writes a note into papers/<id>/agent/ on disk, as any agent
 *  opened on the library folder would; the app shows it, and Put on board makes an AI note connected to its highlight. */

// The specs are type-checked with the app's tsconfig, which has no Node types: the little of Node used here is declared.
declare const process: { env: Record<string, string | undefined> };
type NodeFs = {
  existsSync(path: string): boolean; mkdirSync(path: string, options: { recursive: boolean }): void;
  readFileSync(path: string, encoding: "utf-8"): string; writeFileSync(path: string, text: string): void;
  rmSync(path: string, options: { recursive: boolean; force: boolean }): void;
};
const fs = async () => (await import(/* @vite-ignore */ "node:fs" as string)) as NodeFs;
const tmpdir = async () => ((await import(/* @vite-ignore */ "node:os" as string)) as { tmpdir(): string }).tmpdir();

/** The e2e server's data folder: e2e/server.mjs writes where it is to this file. */
const dataRoot = async () =>
  (await fs()).readFileSync(`${await tmpdir()}/pb-e2e-root-${process.env.PAPERBOARD_API_PORT ?? "8765"}`, "utf-8");
const MARK = "h-01J8Z3QABCDEFGHJKMNPQRSTVW";
const highlight = {
  id: MARK, tags: [],
  anchor: { rects: [{ page: 0, rect: [60, 300, 280, 312] }], quote: { exact: "Deeper neural networks", prefix: "", suffix: "" },
            position: 0, state: "anchored" },
};

let paper = "";
const paperDir = async () => `${await dataRoot()}/papers/${paper}`;

async function setBoard(request: APIRequestContext, highlights: object[]) {
  const board = await (await request.get(`/api/papers/${paper}/board`)).json();
  board.nodes = []; board.edges = []; board.highlights = highlights;
  expect((await request.put(`/api/papers/${paper}/board`, { data: board, headers: { "If-Match": String(board.version), ...WRITE } })).ok()).toBeTruthy();
}

test.afterEach(async ({ request }) => {
  await setBoard(request, []);
  await putView(request, paper);
  (await fs()).rmSync(`${await paperDir()}/agent`, { recursive: true, force: true });
});

test("a note an agent writes to disk is shown marked AI, and Put on board connects it to its highlight", async ({ page, request }) => {
  const papers = (await (await request.get("/api/papers")).json()) as { paper_id: string }[];
  paper = papers.find((p) => p.paper_id.includes("residual"))!.paper_id;
  const { existsSync, mkdirSync, readFileSync, writeFileSync } = await fs();
  const folder = await paperDir();
  expect(existsSync(`${await dataRoot()}/AGENTS.md`)).toBe(true);
  expect(readFileSync(`${folder}/paper.md`, "utf-8")).toContain("# Deep Residual Learning");
  await setBoard(request, [highlight]);
  expect(readFileSync(`${folder}/board.md`, "utf-8")).toContain(`<!-- id: ${MARK} -->`);
  await putView(request, paper, { view: "both" });

  mkdirSync(`${folder}/agent`, { recursive: true });
  writeFileSync(`${folder}/agent/why-deeper.md`,
    `---\non: ${MARK}\ntitle: Why deeper is harder\n---\nThe paper calls it the degradation problem (p. 1, §1).\n`);

  await page.goto("/");
  await page.getByRole("combobox", { name: "Paper", exact: true }).selectOption(paper);
  const badge = page.getByRole("button", { name: /Agent notes/ });
  await expect(badge).toBeVisible();
  await expect(badge.locator(".count")).toHaveText("1");

  await badge.click();
  const panel = page.getByRole("region", { name: "Agent notes" });
  const entry = panel.getByRole("listitem");
  await expect(entry).toContainText("Why deeper is harder");
  await expect(entry.locator(".ai-label")).toHaveText("AI");
  await entry.getByRole("button", { name: "Put on board" }).click();

  await expect(badge).toHaveCount(0);   // nothing waits in agent/ any more
  expect(existsSync(`${folder}/agent/placed/why-deeper.md`)).toBe(true);
  await expect.poll(async () => {
    const board = await (await request.get(`/api/papers/${paper}/board`)).json();
    const note = board.nodes.find((n: { type: string }) => n.type === "note");
    return note && { origin: note.data.origin, edge: board.edges.some((e: { from: string; to: string }) => e.from === MARK && e.to === note.id) };
  }).toEqual({ origin: "ai", edge: true });
  const card = page.locator(".react-flow__node-note");
  await expect(card).toContainText("Why deeper is harder");
});
