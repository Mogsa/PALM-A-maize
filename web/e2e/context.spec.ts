import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { WRITE } from "./headers";

/** Context on demand (D26, D27, D28), mechanised on ResNet. Runs before step5 uploads Attention, so ResNet is the only
 *  paper; every test saves the board it needs first, view included. */

type Json = Record<string, any>;
// Ids as the client mints them: a kind and a ULID (addendum 4.5).
const CHUNK = "n-01K0C0NTEXTCHNK0000000000";
const MARK = "h-01K0C0NTEXTMRK00000000000";
const NOTE = "n-01K0C0NTEXTN0TE0000000000";

let resnet = "";

test.beforeAll(async ({ playwright }, info) => {
  const request = await playwright.request.newContext({ baseURL: info.project.use.baseURL });
  const papers: { paper_id: string }[] = await (await request.get("/api/papers")).json();
  resnet = papers.map((p) => p.paper_id).find((id) => id.includes("residual"))!;
  await request.dispose();
});

const boardOf = async (request: APIRequestContext): Promise<Json> => (await request.get(`/api/papers/${resnet}/board`)).json();

/** Saves a board holding exactly these things, open in `view`, at zoom 1 on the board. */
async function save(request: APIRequestContext, parts: { nodes?: Json[]; edges?: Json[]; highlights?: Json[] }, view = "board") {
  const current = await boardOf(request);
  const next: Json = { ...current, nodes: parts.nodes ?? [], edges: parts.edges ?? [], highlights: parts.highlights ?? [],
    active_tags: [], view, viewport: { x: 0, y: 0, zoom: 1 } };
  delete next.paper_scroll;
  const put = await request.put(`/api/papers/${resnet}/board`, { data: next, headers: { "If-Match": String(current.version), ...WRITE } });
  expect(put.ok()).toBeTruthy();
}

/** A section's chunk data as split makes it, expanded. */
async function sectionData(request: APIRequestContext, title: string): Promise<Json> {
  await save(request, {});
  const source: Json = await (await request.get(`/api/papers/${resnet}/source`)).json();
  const id = source.sections.find((s: Json) => s.title === title).id;
  const drafts: Json[] = (await (await request.post(`/api/papers/${resnet}/split`, { data: {}, headers: WRITE })).json()).nodes;
  return { ...drafts.find((d) => d.data.source_id === id)!.data, collapsed: false };
}

/** A chunk tall and wide enough that all its text shows without scrolling the card. */
const chunk = (data: Json) => ({ id: CHUNK, type: "chunk", position: { x: 60, y: 80 }, width: 600, height: 860, data: { ...data, user_sized: true } });
const cardOf = (page: Page) => page.locator(`.react-flow__node[data-id="${CHUNK}"]`);

async function open(page: Page) {
  await page.goto("/");
  await page.getByRole("combobox", { name: "Paper", exact: true }).selectOption(resnet);
}

test("hovering a figure reference on a board card shows that figure's clip and caption (D26)", async ({ page, request }) => {
  await save(request, { nodes: [chunk(await sectionData(request, "3.3. Network Architectures"))] });
  await open(page);
  const ref = cardOf(page).locator('.ref[data-ref-kind="figure"]', { hasText: "Fig. 3" }).first();
  await ref.hover();
  const card = page.getByRole("dialog", { name: "In this paper" });
  await expect(card).toContainText("Figure 3.");
  await expect(card.getByRole("img")).toHaveAttribute("src", /\/render\?page=3&/);
  // Unmatched: ResNet's Figure 2 was not found by the extractor, so "Fig. 2" stays plain text.
  await expect(cardOf(page).locator(".ref", { hasText: "Fig. 2" })).toHaveCount(0);
  await page.mouse.move(5, 500);
  await expect(card).toHaveCount(0);
});

test("an equation reference shows the formula carrying its number, and a citation its entry (D26)", async ({ page, request }) => {
  await save(request, { nodes: [chunk(await sectionData(request, "3.2. Identity Mapping by Shortcuts"))] });
  await open(page);
  const card = page.getByRole("dialog", { name: "In this paper" });
  await cardOf(page).locator('.ref[data-ref-kind="equation"]', { hasText: "Eqn.(1)" }).first().hover();
  // Eqn. (1) is the formula region at [123, 626, 287, 637] on page 3.
  await expect(card.getByRole("img")).toHaveAttribute("src", /page=2&x0=123&y0=626&x1=287&y1=637&/);
  await page.mouse.move(5, 500);
  await expect(card).toHaveCount(0);
  await cardOf(page).locator('.ref[data-ref-kind="citation"]', { hasText: "29" }).first().hover();
  await expect(card).toContainText("[29] V. Nair and G. E. Hinton. Rectiﬁed linear units improve restricted boltzmann machines. In ICML, 2010.");
  await expect(card).not.toContainText("[30]");
});
