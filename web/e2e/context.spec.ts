import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { WRITE } from "./headers";

/** Context on demand (D26, D27, D28), mechanised on ResNet. Runs before step5 uploads Attention, so ResNet is the only
 *  paper; every test saves the board it needs first, view included. */

type Json = Record<string, any>;
// Ids as the client mints them: a kind and a ULID (addendum 4.5).
const CHUNK = "n-01K0CTXCHNK000000000000000";
const MARK = "h-01K0CTXMRK0000000000000000";
const NOTE = "n-01K0CTXN0TE000000000000000";

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

/** The paper's own internal link at a point given in page space (points from the page's top-left). */
async function linkAt(page: Page, pageNo: number, x: number, y: number) {
  const index = await page.evaluate(({ pageNo, x, y }) => {
    const pageEl = document.querySelector(`.react-pdf__Page[data-page-number="${pageNo}"]`)!;
    const frame = pageEl.getBoundingClientRect();
    const scale = frame.width / 612;
    const links = Array.from(pageEl.querySelectorAll(".annotationLayer section.linkAnnotation[data-internal-link]"));
    const distance = (el: Element) => {
      const r = el.getBoundingClientRect();
      return Math.hypot((r.left - frame.left) / scale - x, (r.top - frame.top) / scale - y);
    };
    return links.reduce((best, el, i) => (distance(el) < distance(links[best]) ? i : best), 0);
  }, { pageNo, x, y });
  return page.locator(`.react-pdf__Page[data-page-number="${pageNo}"] .annotationLayer section.linkAnnotation[data-internal-link]`).nth(index);
}

test("in the paper view, a link to a figure or an equation shows its clip (D26)", async ({ page, request }) => {
  await save(request, {}, "paper");
  await open(page);
  await expect(page.locator('.react-pdf__Page[data-page-number="3"] .annotationLayer section.linkAnnotation').first()).toBeAttached();
  const card = page.getByRole("dialog", { name: "In this paper" });
  // p1: "... presented in Fig. 4." links to figure.4 on p5.
  const figure = await linkAt(page, 1, 427.2, 337.5);
  await figure.scrollIntoViewIfNeeded();
  await figure.hover();
  await expect(card).toContainText("Figure 4. Training on ImageNet.");
  await expect(card.getByRole("img")).toHaveAttribute("src", /\/render\?page=4&x0=80&y0=247&x1=515&y1=394&/);
  await page.mouse.move(5, 500);
  await expect(card).toHaveCount(0);
  // p3: "Eqn.(1)" links to equation.3.1, the formula region on the same page.
  const equation = await linkAt(page, 3, 452.2, 122.2);
  await equation.scrollIntoViewIfNeeded();
  await equation.hover();
  await expect(card.getByRole("img")).toHaveAttribute("src", /\/render\?page=2&x0=123&y0=626&x1=287&y1=637&/);
});

/** §3.1 on the board with "underlying mapping" marked as a term, and the reader's definition connected to it. */
async function seedTerm(request: APIRequestContext) {
  const data = await sectionData(request, "3.1. Residual Learning");
  const anchor = (await (await request.post(`/api/papers/${resnet}/chunks/highlight`, {
    data: { region: data.region, quote: { exact: "underlying mapping" } }, headers: WRITE })).json()).highlight;
  const note = { id: NOTE, type: "note", position: { x: 720, y: 80 }, data: { tags: [], collapsed: false, note: `notes/${NOTE}.md`, origin: "reader" } };
  await save(request, { nodes: [chunk(data), note], highlights: [{ id: MARK, tags: ["t-term"], anchor }],
    edges: [{ id: "e-01K0CTXEDGE000000000000000", from: MARK, to: NOTE, data: { tags: [] } }] });
  const put = await request.put(`/api/papers/${resnet}/notes/${NOTE}`, { data: { markdown: "The mapping **we want** the layers to fit.\nMore." }, headers: WRITE });
  expect(put.ok()).toBeTruthy();
}

test("hovering a term shows the reader's definition first, on a card and on the paper, and the Glossary lists it (D27)", async ({ page, request }) => {
  await seedTerm(request);
  await open(page);
  await cardOf(page).locator(`mark[data-highlight-id="${MARK}"]`).first().hover();
  const card = page.getByRole("dialog", { name: "underlying mapping" });
  await expect(card).toContainText("Your definition");
  await expect(card.locator("strong")).toHaveText("we want");
  await expect(card.getByRole("button", { name: "Look up elsewhere" })).toBeVisible();
  const text = await card.textContent();
  expect(text!.indexOf("Your definition")).toBeLessThan(text!.indexOf("Look up elsewhere"));
  await page.mouse.move(5, 500);
  await expect(card).toHaveCount(0);

  await page.getByRole("button", { name: "Glossary" }).click();
  const glossary = page.getByRole("region", { name: "Glossary" });
  await expect(glossary.getByRole("listitem")).toHaveCount(1);
  await expect(glossary.getByRole("listitem")).toContainText("The mapping we want the layers to fit.");
  await expect(glossary.getByRole("listitem")).not.toContainText("More.");
  // Its jump opens the paper where the term is used; there, hovering the mark shows the same card.
  await glossary.getByRole("button", { name: "underlying mapping" }).click();
  const onPaper = page.locator(`.overlay .mark[data-highlight-id="${MARK}"]`).first();
  await expect(onPaper).toBeInViewport();
  const box = (await onPaper.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 4 });
  await expect(card).toContainText("Your definition");
});

test("more context on a card shows the paper's lines around it, and collapses again, changing nothing (D28)", async ({ page, request }) => {
  await save(request, { nodes: [chunk(await sectionData(request, "3.1. Residual Learning"))] });
  const version = (await boardOf(request)).version;
  await open(page);
  const body = cardOf(page).locator(".node-body");
  const before = await body.textContent();
  await cardOf(page).getByRole("button", { name: "More context" }).click();
  // Just above §3.1's text is its own heading; just below it, the start of §3.2.
  await expect(body.locator(".peek.before")).toContainText("Residual Learning");
  await expect(body.locator(".peek.after")).not.toBeEmpty();
  await cardOf(page).getByRole("button", { name: "Less context" }).click();
  await expect(body.locator(".peek")).toHaveCount(0);
  expect(await body.textContent()).toBe(before);
  await cardOf(page).getByRole("button", { name: "More context" }).click();
  await expect(body.locator(".peek.before")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(body.locator(".peek")).toHaveCount(0);
  await page.waitForTimeout(1_000);   // twice the board's save debounce
  expect((await boardOf(request)).version).toBe(version);
});
