import { expect, test, type Page } from "@playwright/test";
import { putView, WRITE } from "./headers";

/** The semantic reader, tier 1: citation cards (D24) and likely definitions in Find (D25), on ResNet. Runs before
 *  step5 uploads Attention, so ResNet is the only paper. */

let resnet = "";

/** Every test starts from a saved, empty board open on the paper, at its top. */
test.beforeEach(async ({ request }) => {
  const papers: { paper_id: string }[] = await (await request.get("/api/papers")).json();
  resnet = papers.map((p) => p.paper_id).find((id) => id.includes("residual"))!;
  const path = `/api/papers/${resnet}/board`;
  const board = await (await request.get(path)).json();
  const empty = { ...board, nodes: [], edges: [], highlights: [] };
  const saved = await request.put(path, { data: empty, headers: { "If-Match": String(board.version), ...WRITE } });
  expect(saved.ok()).toBeTruthy();
  await putView(request, resnet);
});

async function open(page: Page) {
  await page.goto("/");
  await page.getByRole("combobox", { name: "Paper", exact: true }).selectOption(resnet);
  await expect(page.locator('.react-pdf__Page[data-page-number="1"] .annotationLayer section.linkAnnotation').first()).toBeAttached();
}

/** The paper's own internal link nearest a point given in page space (points from the page's top-left). */
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

const scrollTop = (page: Page) => page.locator(".paper").evaluate((el) => el.scrollTop);

test("hovering a citation shows its reference from the bibliography, without moving the paper", async ({ page }) => {
  await open(page);
  // ResNet p1: "[22]" in "... gradient descent (SGD) with backpropagation [22]" links to cite.LeCun1989 on p9.
  const link = await linkAt(page, 1, 216.966, 792 - 236.033);
  await link.scrollIntoViewIfNeeded();
  const before = await scrollTop(page);
  await link.hover();
  const card = page.getByRole("dialog", { name: "In this paper" });
  await expect(card).toContainText("LeCun");
  await expect(card).toContainText("Backpropagation applied to hand-written zip code recognition");
  await expect(card).not.toContainText("[23]");
  expect(await scrollTop(page)).toBe(before);

  // Escape closes it; hovering again shows it again, and Go there jumps to the bibliography.
  await page.keyboard.press("Escape");
  await expect(card).toHaveCount(0);
  await page.mouse.move(0, 0);
  await link.hover();
  await expect(card).toContainText("LeCun");
  await card.getByRole("button", { name: "Go there" }).click();
  await expect.poll(() => scrollTop(page)).toBeGreaterThan(before + 1000);
  await expect(card).toHaveCount(0);
});

test("the card closes when the mouse leaves the link", async ({ page }) => {
  await open(page);
  const link = await linkAt(page, 1, 216.966, 792 - 236.033);
  await link.hover();
  const card = page.getByRole("dialog", { name: "In this paper" });
  await expect(card).toContainText("LeCun");
  await page.mouse.move(5, 500);
  await expect(card).toHaveCount(0);
});

/** Selects `words` in a page's text layer, as a drag would, and lets go. */
async function selectWords(page: Page, pageNo: number, words: string) {
  await expect(page.locator(`.react-pdf__Page[data-page-number="${pageNo}"] .react-pdf__Page__textContent`)).toContainText(words);
  await page.evaluate(({ pageNo, words }) => {
    const layer = document.querySelector(`.react-pdf__Page[data-page-number="${pageNo}"] .react-pdf__Page__textContent`)!;
    const nodes: Text[] = [];
    const walker = document.createTreeWalker(layer, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) nodes.push(n as Text);
    const all = nodes.map((n) => n.data).join("");
    const at = all.indexOf(words);
    const place = (offset: number): [Text, number] => {
      for (const n of nodes) { if (offset <= n.data.length) return [n, offset]; offset -= n.data.length; }
      throw new Error("offset past the text");
    };
    const range = document.createRange();
    range.setStart(...place(at));
    range.setEnd(...place(at + words.length));
    window.getSelection()!.removeAllRanges();
    window.getSelection()!.addRange(range);
    range.startContainer.parentElement!.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
  }, { pageNo, words });
}

test("Find lists the likely definition of a term first, badged", async ({ page }) => {
  await open(page);
  // "residual nets" first appears in the abstract (p1); p5 defines it: "18-layer and 34-layer residual nets (ResNets)".
  await selectWords(page, 1, "residual nets");
  await page.getByRole("dialog", { name: "Selection" }).getByRole("button", { name: "Find" }).click();
  const hits = page.getByRole("complementary", { name: "Find in paper" }).getByRole("listitem");
  await expect(hits.first()).toContainText("likely definition");
  await expect(hits.first()).toContainText("p5");
  await expect(hits.first()).toContainText("(ResNets)");
  await expect(hits.nth(1)).not.toContainText("likely definition");
  await expect(hits.nth(1)).toContainText("p1");
});
