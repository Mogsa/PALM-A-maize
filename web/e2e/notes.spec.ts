import { expect, test, type Page } from '@playwright/test';
import { WRITE } from './headers';

/** Notes render Markdown with maths (D22) and carry a freehand sketch (D23). */

// A node id as the client mints it (addendum 4.5): the server refuses any other as a note's file name.
const NOTE = 'n-01J8Z3QABCDEFGHJKMNPQRSTVW';
const note = { id: NOTE, type: 'note', position: { x: 60, y: 80 }, width: 280,
  data: { tags: [], collapsed: false, note: `notes/${NOTE}.md`, origin: 'reader' } };

async function paperId(page: Page): Promise<string> {
  return (await (await page.request.get('/api/papers')).json())[0].paper_id;
}

test.afterEach(async ({request}) => {
  const papers = await (await request.get('/api/papers')).json();
  const path = `/api/papers/${papers[0].paper_id}/board`;
  const board = await (await request.get(path)).json();
  board.nodes = []; board.edges = []; board.highlights = [];
  board.viewport = {x: 0, y: 0, zoom: 1}; board.active_tags = [];
  board.view = 'paper'; delete board.paper_scroll;   // view state is saved (D5): don't leak it into the next test
  await request.put(path, {data: board, headers: {'If-Match': String(board.version), ...WRITE}});
  await request.delete(`/api/papers/${papers[0].paper_id}/notes/${NOTE}/sketch`, {headers: WRITE});
});

/** Saves a board holding one note with this text, and opens the board view. */
async function seedNote(page: Page, markdown: string, shape: object = note): Promise<string> {
  const id = await paperId(page);
  const board = await (await page.request.get(`/api/papers/${id}/board`)).json();
  board.nodes = [shape]; board.edges = []; board.highlights = [];
  board.viewport = { x: 0, y: 0, zoom: 1 }; board.active_tags = []; board.view = 'paper'; delete board.paper_scroll;
  expect((await page.request.put(`/api/papers/${id}/board`, {data: board, headers: {'If-Match': String(board.version), ...WRITE}})).ok()).toBeTruthy();
  expect((await page.request.put(`/api/papers/${id}/notes/${NOTE}`, {data: { markdown }, headers: WRITE})).ok()).toBeTruthy();
  await page.goto('/');
  await page.locator('select').selectOption(id);
  await page.getByRole('button', {name: 'Board', exact: true}).click();
  await expect(card(page)).toBeVisible();
  return id;
}

const card = (page: Page) => page.locator(`.react-flow__node[data-id="${NOTE}"]`);

async function stroke(page: Page, surface: { x: number; y: number }, from: [number, number], to: [number, number]) {
  await page.mouse.move(surface.x + from[0], surface.y + from[1]);
  await page.mouse.down();
  await page.mouse.move(surface.x + to[0], surface.y + to[1], {steps: 12});
  await page.mouse.up();
}

test('a note with maths shows it typeset by KaTeX, and edits as its plain text', async ({page}) => {
  await seedNote(page, 'The area is $x^2$.');
  await expect(card(page).locator('.note-body .katex')).toBeVisible();
  await expect(card(page).locator('.note-body')).not.toContainText('$x^2$');
  await card(page).locator('.note-body').dblclick();
  await expect(card(page).locator('textarea.note-text')).toHaveValue('The area is $x^2$.');
  await page.keyboard.press('Escape');
  await expect(card(page).locator('.note-body .katex')).toBeVisible();
});

test('two strokes drawn on a note are there after a reload, and in the export', async ({page}) => {
  const id = await seedNote(page, 'A drawing of the block.');
  const before = (await card(page).boundingBox())!;
  await card(page).getByRole('button', {name: 'Sketch', exact: true}).click();
  const dialog = page.getByRole('dialog', {name: 'Sketch'});
  const surface = (await dialog.locator('.sketch-surface').boundingBox())!;
  await stroke(page, surface, [40, 40], [200, 160]);
  await stroke(page, surface, [300, 60], [420, 300]);
  await expect(dialog.locator('.sketch-surface path')).toHaveCount(2);
  const cardAfterDrawing = (await card(page).boundingBox())!;
  expect(cardAfterDrawing.x).toBeCloseTo(before.x, 0);   // drawing never dragged the card
  await dialog.getByRole('button', {name: 'Done'}).click();
  await expect(dialog).toBeHidden();
  const image = card(page).getByRole('img', {name: 'Sketch'});
  await expect(image).toBeVisible();
  expect((await card(page).boundingBox())!.height).toBeGreaterThan(before.height + 100);   // the card grew to show it

  const svg = await page.request.get(`/api/papers/${id}/notes/${NOTE}/sketch.svg`);
  expect(svg.ok()).toBeTruthy();
  expect(svg.headers()['content-type']).toContain('image/svg+xml');
  expect(((await svg.text()).match(/<path /g) ?? []).length).toBe(2);

  await page.reload();
  await page.locator('select').selectOption(id);
  await page.getByRole('button', {name: 'Board', exact: true}).click();
  await expect(card(page).getByRole('img', {name: 'Sketch'})).toBeVisible();
  await expect.poll(() => card(page).getByRole('img', {name: 'Sketch'}).evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);

  const exported = await (await page.request.post(`/api/papers/${id}/export`, {data: { tags: [] }, headers: WRITE})).json();
  expect(exported.markdown).toContain(`![sketch](notes/${NOTE}.svg)\n\nA drawing of the block.`);
});

test('a note the reader sized keeps its size, and its sketch fits inside it', async ({page}) => {
  const id = await paperId(page);
  const sketch = { width: 600, height: 400, strokes: [{ points: [[10, 10, 0.5], [590, 390, 0.5]], size: 4 }], paths: ['M10 10 L590 390 L588 392 Z'] };
  expect((await page.request.put(`/api/papers/${id}/notes/${NOTE}/sketch`, {data: sketch, headers: WRITE})).ok()).toBeTruthy();
  await seedNote(page, 'Sized.', { ...note, width: 280, height: 150, data: { ...note.data, user_sized: true } });
  const image = card(page).getByRole('img', {name: 'Sketch'});
  await expect(image).toBeVisible();
  const box = (await card(page).boundingBox())!;
  expect(box.height).toBeCloseTo(150, -1);
  expect((await image.boundingBox())!.y + (await image.boundingBox())!.height).toBeLessThanOrEqual(box.y + box.height);
});
