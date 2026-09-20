import { expect, test, type Page } from '@playwright/test';

test.afterEach(async ({request}) => {
  const papers = await (await request.get(`/api/papers`)).json();
  const path = `/api/papers/${papers[0].paper_id}/board`;
  const board = await (await request.get(path)).json();
  board.nodes = []; board.edges = []; board.highlights = [];
  board.viewport = {x: 0, y: 0, zoom: 1};
  await request.put(path, {data: board, headers: {'If-Match': String(board.version)}});
});
async function seed(page: Page, x = 40) {
  const papers = await (await page.request.get(`/api/papers`)).json();
  const id = papers[0].paper_id;
  const board = await (await page.request.get(`/api/papers/${id}/board`)).json();
  const quote = { exact: 'Review chunk', prefix: '', suffix: '' };
  board.nodes = [{ id: 'n-review', type: 'chunk', position: { x, y: 100 }, width: 320,
    data: { tags: [], collapsed: false, user_sized: false, source_id: null,
      region: { rects: [{ page: 0, rect: [50, 130, 280, 300] }], start: quote, end: quote, position: 0, state: 'anchored' },
      text: Array.from({length: 60}, (_, i) => `Line ${i}: text inside this chunk.`).join('\n') } }];
  board.edges = []; board.highlights = []; board.viewport = { x: 0, y: 0, zoom: 1 };
  const saved = await page.request.put(`/api/papers/${id}/board`, {data: board, headers: {'If-Match': String(board.version)}});
  expect(saved.ok()).toBeTruthy();
  await page.goto('/');
  await page.locator('select').selectOption(id);
  await expect(page.getByRole('button', {name: 'Board', exact: true})).toBeVisible();
  return id;
}

test('vertical resizing grows the visible chunk', async ({page}) => {
  await seed(page);
  await page.getByRole('button', {name: 'Board', exact: true}).click();
  const outer = page.locator('.react-flow__node[data-id="n-review"]');
  const inner = outer.locator('.node.chunk');
  await inner.locator('.title').click();
  const before = (await inner.boundingBox())!;
  const handle = outer.locator('.react-flow__resize-control.bottom.right.handle');
  const box = (await handle.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 180, {steps: 20});
  await page.mouse.up();
  await expect(page.locator('.notice')).toHaveText(/Saved/);
  const after = (await inner.boundingBox())!;
  const wrapper = (await outer.boundingBox())!;
  expect(Math.abs(wrapper.height - after.height)).toBeLessThan(2);
  expect(after.height).toBeGreaterThan(before.height + 140);
  await inner.getByTitle('Collapse', {exact: true}).click();
  await expect(inner.locator('.node-body')).toHaveCount(0);
  await expect.poll(async () => (await outer.boundingBox())!.height).toBeLessThan(60);
  await inner.getByTitle('Expand', {exact: true}).click();
  await expect.poll(async () => (await inner.boundingBox())!.height).toBeCloseTo(after.height, 0);
  await expect(page.locator('.notice')).toHaveText(/Saved/);
  await page.reload();
  await page.locator('select').selectOption({index: 1});
  await page.getByRole('button', {name: 'Board', exact: true}).click();
  await expect.poll(async () => (await inner.boundingBox())!.height).toBeCloseTo(after.height, 0);
});

test('opening an outline brings its offscreen chunk into view', async ({page}) => {
  await seed(page, 4000);
  await expect(page.locator('.outline-tab')).toBeVisible();
  await page.locator('.outline-tab').click();
  const chunk = page.locator('.react-flow__node[data-id="n-review"]');
  await expect(chunk).toBeAttached();

  await expect(chunk).toBeInViewport({timeout: 2000});
});


test('pan and zoom persist without editing a piece', async ({page}) => {
  const id = await seed(page);
  await page.getByRole('button', {name: 'Board', exact: true}).click();
  await page.getByRole('button', {name: 'Zoom In', exact: true}).click();
  const pane = page.locator('.react-flow__pane');
  const box = (await pane.boundingBox())!;
  await page.mouse.move(box.x + 900, box.y + 700);
  await page.mouse.down();
  await page.mouse.move(box.x + 1000, box.y + 760, {steps: 15});
  await page.mouse.up();
  await expect(page.locator('.notice')).toHaveText(/Saved/);
  const board = await (await page.request.get(`/api/papers/${id}/board`)).json();
  expect(board.viewport.zoom).toBeGreaterThan(1);
  expect(board.viewport.x).not.toBe(0);
  const viewport = page.locator('.react-flow__viewport');
  const transform = await viewport.evaluate(el => (el as HTMLElement).style.transform);
  await page.reload();
  await page.locator('select').selectOption(id);
  await page.getByRole('button', {name: 'Board', exact: true}).click();
  await expect.poll(() => viewport.evaluate(el => (el as HTMLElement).style.transform)).toBe(transform);
});
