import { expect, test, type Page } from '@playwright/test';
import { putView, viewOf, WRITE } from './headers';

test.afterEach(async ({request}) => {
  const papers = await (await request.get(`/api/papers`)).json();
  const path = `/api/papers/${papers[0].paper_id}/board`;
  const board = await (await request.get(path)).json();
  board.nodes = []; board.edges = []; board.highlights = [];
  await request.put(path, {data: board, headers: {'If-Match': String(board.version), ...WRITE}});
  await putView(request, papers[0].paper_id);   // view state is saved (D5): don't leak it into the next test
});
const quote = { exact: 'Review chunk', prefix: '', suffix: '' };
const region = { rects: [{ page: 0, rect: [50, 130, 280, 300] }], start: quote, end: quote, position: 0, state: 'anchored' };
const chunk = (id: string, x: number, y: number, text: string, where = region) => ({ id, type: 'chunk', position: { x, y }, width: 320,
  data: { tags: [], collapsed: false, user_sized: false, source_id: null, region: where,
          blocks: [{ kind: 'text', page: where.rects[0].page, rect: where.rects[0].rect, text }] } });

async function seed(page: Page, x = 40) {
  return seedBoard(page, { nodes: [chunk('n-review', x, 100, Array.from({length: 60}, (_, i) => `Line ${i}: text inside this chunk.`).join('\n'))] });
}

/** Saves a board with these nodes and highlights, and opens it in the paper view. */
async function seedBoard(page: Page, { nodes = [], highlights = [], activeTags = [] }: { nodes?: object[]; highlights?: object[]; activeTags?: string[] }) {
  const papers = await (await page.request.get(`/api/papers`)).json();
  const id = papers[0].paper_id;
  const board = await (await page.request.get(`/api/papers/${id}/board`)).json();
  board.nodes = nodes;
  board.edges = []; board.highlights = highlights;
  const saved = await page.request.put(`/api/papers/${id}/board`, {data: board, headers: {'If-Match': String(board.version), ...WRITE}});
  expect(saved.ok()).toBeTruthy();
  await putView(page.request, id, { active_tags: activeTags });
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

test('opening a cut ruler brings its offscreen chunk into view', async ({page}) => {
  await seed(page, 4000);
  await expect(page.locator('.cut-stretch')).toBeVisible();
  await page.locator('.cut-stretch').click();
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
  await expect.poll(async () => (await viewOf(page.request, id)).viewport?.zoom ?? 0).toBeGreaterThan(1);
  expect((await viewOf(page.request, id)).viewport.x).not.toBe(0);
  const viewport = page.locator('.react-flow__viewport');
  const transform = await viewport.evaluate(el => (el as HTMLElement).style.transform);
  await page.reload();
  await page.locator('select').selectOption(id);
  await page.getByRole('button', {name: 'Board', exact: true}).click();
  await expect.poll(() => viewport.evaluate(el => (el as HTMLElement).style.transform)).toBe(transform);
});

test('a chunk counts only the marks it paints, and keeps a handle for every mark inside it', async ({page}) => {
  const mark = (id: string, exact: string) => ({ id, tags: [],
    anchor: { rects: [{ page: 0, rect: [60, 140, 200, 150] }], quote: { exact, prefix: '', suffix: '' }, position: 0, state: 'anchored' } });
  await seedBoard(page, { nodes: [chunk('n-marks', 40, 100, 'Line 1: first.\nLine 2: second.')],
    highlights: [mark('h-found', 'Line 2: second'), mark('h-lost', 'words this chunk does not have')] });
  await page.getByRole('button', {name: 'Board', exact: true}).click();
  const card = page.locator('.react-flow__node[data-id="n-marks"]');
  await expect(card.locator('mark')).toHaveCount(1);
  await expect(card.locator('.count')).toHaveText('1');
  await expect(card.locator('.react-flow__handle[data-handleid^="h-"]')).toHaveCount(2);
});

test('a chunk shows its text and clip blocks in reading order, painting a mark only in its own block', async ({page}) => {
  const block = (rect: number[], text: string) => ({ kind: 'text', page: 0, rect, text });
  const base = chunk('n-mixed', 40, 100, '');
  const mixed = { ...base, data: { ...base.data,
    blocks: [block([50, 130, 280, 180], 'Before the formula.'), { kind: 'clip', page: 0, rect: [50, 190, 280, 230], label: 'formula' },
             block([50, 240, 280, 300], 'After the formula.')] } };
  const mark = { id: 'h-after', tags: [],
    anchor: { rects: [{ page: 0, rect: [60, 250, 200, 260] }], quote: { exact: 'After the formula', prefix: '', suffix: '' }, position: 0, state: 'anchored' } };
  await seedBoard(page, { nodes: [mixed], highlights: [mark] });
  await page.getByRole('button', {name: 'Board', exact: true}).click();
  const body = page.locator('.react-flow__node[data-id="n-mixed"] .node-body');
  await expect(body.locator(':scope > *')).toHaveCount(3);
  await expect(body.locator(':scope > :nth-child(2)')).toHaveClass('block-clip');
  const clip = body.locator('img.block-clip');
  await expect(clip).toHaveAttribute('src', /\/render\?page=0&x0=50&y0=190&x1=280&y1=230&dpi=216$/);
  await expect(clip).toHaveAttribute('alt', 'formula');
  await expect.poll(() => clip.evaluate((img) => (img as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await expect(body.locator('p.block-text').nth(0).locator('mark')).toHaveCount(0);
  await expect(body.locator('p.block-text').nth(1).locator('mark[data-highlight-id="h-after"]')).toHaveText('After the formula');
});

test('a jump to the paper happens once, not again on every return to the paper', async ({page}) => {
  const onPageFour = { ...region, rects: [{ page: 3, rect: [50, 100, 280, 300] }] };
  await seedBoard(page, { nodes: [chunk('n-far', 40, 100, 'Far text.', onPageFour)] });
  await page.getByRole('button', {name: 'Board', exact: true}).click();
  await page.locator('.react-flow__node[data-id="n-far"] [data-testid=open-source]').click();
  const pageOne = page.locator('.react-pdf__Page[data-page-number="1"]');
  const pageFour = page.locator('.react-pdf__Page[data-page-number="4"]');
  await expect(pageFour.locator('.react-pdf__Page__canvas')).toBeInViewport();
  await page.locator('.paper').evaluate((el) => el.scrollTo(0, 0));
  await expect(pageOne).toBeInViewport();

  await page.getByRole('button', {name: 'Board', exact: true}).click();
  await page.getByRole('button', {name: 'Paper', exact: true}).click();
  await expect(pageFour.locator('.react-pdf__Page__canvas')).toBeVisible();
  await page.waitForTimeout(500);   // a stale jump would land here
  await expect(pageOne).toBeInViewport();
  await expect(pageFour).not.toBeInViewport();
});

test('switching views moves nothing: the paper keeps its place and the board its size', async ({page}) => {
  await seed(page);
  const paper = page.locator('.paper');
  await expect(page.locator('.react-pdf__Page[data-page-number="5"] .react-pdf__Page__canvas')).toBeAttached();
  await paper.evaluate((el) => el.scrollTo(0, 4000));
  const scrolled = await paper.evaluate((el) => el.scrollTop);
  expect(scrolled).toBeGreaterThan(3000);

  const card = page.locator('.react-flow__node[data-id="n-review"]');
  for (let round = 0; round < 2; round++) {
    await page.getByRole('button', {name: 'Board', exact: true}).click();
    await expect(card).toBeInViewport();
    const pane = (await page.locator('.react-flow').boundingBox())!;
    expect(pane.width).toBeGreaterThan(1000);
    expect(pane.height).toBeGreaterThan(800);
    await card.locator('.title').click();   // selected, so the delete key would remove it if the board still listened
    await page.getByRole('button', {name: 'Paper', exact: true}).click();
    await expect(paper).toBeVisible();
    await expect.poll(() => paper.evaluate((el) => el.scrollTop)).toBe(scrolled);
  }
  await page.keyboard.press('Delete');
  await page.getByRole('button', {name: 'Board', exact: true}).click();
  await expect(card).toBeVisible();
});

/** A big group on the right and two short chunks on the left, outside it. */
async function seedGroupAndTwo(page: Page) {
  const group = { id: 'n-g', type: 'group', position: { x: 450, y: 40 }, width: 700, height: 560, data: { tags: [], name: null } };
  const id = await seedBoard(page, { nodes: [group, chunk('n-a', 40, 100, 'First.'), chunk('n-b', 40, 300, 'Second.')] });
  await page.getByRole('button', {name: 'Board', exact: true}).click();
  return id;
}

async function dragBy(page: Page, target: { boundingBox(): Promise<{ x: number; y: number; width: number; height: number } | null> }, dx: number) {
  const box = (await target.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + dx, box.y + box.height / 2, {steps: 15});
  await page.mouse.up();
}

async function parentsAfterSave(page: Page, id: string) {
  await expect(page.locator('.notice')).toHaveText(/Saved/);
  const board = await (await page.request.get(`/api/papers/${id}/board`)).json();
  return Object.fromEntries(board.nodes.map((n: { id: string; parentId?: string }) => [n.id, n.parentId ?? null]));
}

test('dropping a multi-selection into a group re-parents every dragged node', async ({page}) => {
  const id = await seedGroupAndTwo(page);
  const title = (nodeId: string) => page.locator(`.react-flow__node[data-id="${nodeId}"] .title`);
  await title('n-a').click();
  await title('n-b').click({modifiers: ['ControlOrMeta']});
  await expect(page.locator('.react-flow__node.selected')).toHaveCount(2);
  await dragBy(page, title('n-a'), 480);
  await expect.poll(() => parentsAfterSave(page, id)).toEqual({ 'n-g': null, 'n-a': 'n-g', 'n-b': 'n-g' });
});

test('dropping a box selection into a group re-parents every node in it', async ({page}) => {
  const id = await seedGroupAndTwo(page);
  const pane = (await page.locator('.react-flow__pane').boundingBox())!;
  await page.keyboard.down('Shift');
  await page.mouse.move(pane.x + 20, pane.y + 70);
  await page.mouse.down();
  await page.mouse.move(pane.x + 400, pane.y + 440, {steps: 10});
  await page.mouse.up();
  await page.keyboard.up('Shift');
  await expect(page.locator('.react-flow__node.selected')).toHaveCount(2);
  await dragBy(page, page.locator('.react-flow__nodesselection-rect'), 480);
  await expect.poll(() => parentsAfterSave(page, id)).toEqual({ 'n-g': null, 'n-a': 'n-g', 'n-b': 'n-g' });
});

test('a figure and a note collapse and expand like a chunk', async ({page}) => {
  const figure = { id: 'n-fig', type: 'figure', position: { x: 40, y: 100 }, width: 320, height: 220,
    data: { tags: [], collapsed: false, region, caption: 'Figure 2. Residual learning: a building block.' } };
  const note = { id: 'n-note', type: 'note', position: { x: 440, y: 100 }, width: 280, height: 220,
    data: { tags: [], collapsed: false, note: 'notes/n-note.md' } };
  await seedBoard(page, { nodes: [figure, note] });
  await page.getByRole('button', {name: 'Board', exact: true}).click();
  for (const id of ['n-fig', 'n-note']) {
    const outer = page.locator(`.react-flow__node[data-id="${id}"]`);
    await expect.poll(async () => (await outer.boundingBox())!.height).toBeGreaterThan(200);
    await outer.getByTitle('Collapse', {exact: true}).click();
    await expect(outer.locator('.node-body')).toHaveCount(0);
    await expect.poll(async () => (await outer.boundingBox())!.height).toBeLessThan(60);
    await outer.getByTitle('Expand', {exact: true}).click();
    await expect(outer.locator('.node-body')).toHaveCount(1);
    await expect.poll(async () => (await outer.boundingBox())!.height).toBeGreaterThan(200);
  }
});

test('New note and a slot\'s question each open a note ready for typing', async ({page}) => {
  const slot = { id: 'n-slot', type: 'group', position: { x: 40, y: 400 }, width: 400, height: 300,
    data: { tags: [], name: 'Main point', prompt: 'What is the one thing?' } };
  const id = await seedBoard(page, { nodes: [slot] });
  await page.getByRole('button', {name: 'Board', exact: true}).click();
  await page.getByRole('button', {name: 'New note'}).click();
  await expect(page.locator('textarea.note-text')).toBeFocused();
  await page.keyboard.type('In my own words');
  await page.locator('.react-flow__pane').click({ position: { x: 1200, y: 900 } });
  await page.locator('.slot-prompt').click();
  const answer = page.locator('textarea.note-text');
  await expect(answer).toBeFocused();
  await expect(answer).toHaveAttribute('placeholder', 'What is the one thing?');
  await page.keyboard.type('The answer');
  await page.locator('.react-flow__pane').click({ position: { x: 1200, y: 900 } });
  await expect(page.locator('.slot-prompt')).toHaveCount(0);
  await expect(page.locator('.notice')).toHaveText(/Saved/);
  const board = await (await page.request.get(`/api/papers/${id}/board`)).json();
  const notes = board.nodes.filter((n: { type: string }) => n.type === 'note');
  const texts = await Promise.all(notes.map(async (n: { id: string }) => (await (await page.request.get(`/api/papers/${id}/notes/${n.id}`)).json()).markdown));
  expect(texts.sort()).toEqual(['In my own words', 'The answer']);
});

test('a ghost row or a slot question does not select the group it sits in', async ({page}) => {
  const papers = await (await page.request.get('/api/papers')).json();
  const source = await (await page.request.get(`/api/papers/${papers[0].paper_id}/source`)).json();
  const tray = { id: 'n-tray', type: 'group', position: { x: 0, y: 0 }, width: 360, height: 400, data: { tags: [], name: 'Paper', tray: true } };
  const slot = { id: 'n-slot', type: 'group', position: { x: 1000, y: 0 }, width: 400, height: 300, data: { tags: [], name: 'Main point', prompt: 'What is the one thing?' } };
  const base = chunk('n-out', 500, 0, 'Moved out.');
  const out = { ...base, data: { ...base.data, source_id: source.sections[0].id, collapsed: true } };
  await seedBoard(page, { nodes: [tray, slot, out] });
  await page.getByRole('button', {name: 'Board', exact: true}).click();
  await page.locator('.ghost-row', { hasText: '→ on the board' }).click();
  await expect(page.locator('.react-flow__node.selected')).toHaveCount(1);
  await expect(page.locator('.react-flow__node.selected')).toHaveAttribute('data-id', 'n-out');
  await page.locator('.slot-prompt').click();
  await expect(page.locator('.react-flow__node[data-id="n-slot"].selected')).toHaveCount(0);
});

test('a note made while a tag filter is on stays in sight, ready for typing', async ({page}) => {
  const base = chunk('n-tagged', 40, 100, 'Tagged.');
  await seedBoard(page, { nodes: [{ ...base, data: { ...base.data, tags: ['t-shown'] } }], activeTags: ['t-shown'] });
  await page.getByRole('button', {name: 'Board', exact: true}).click();
  await expect(page.locator('.react-flow__node[data-id="n-tagged"]')).toBeVisible();
  await page.getByRole('button', {name: 'New note'}).click();
  await expect(page.locator('textarea.note-text')).toBeFocused();
});

test('the top bar keeps six controls; New group is on the empty board\'s right-click; the filter shows once a tag is used', async ({page}) => {
  await seedBoard(page, { nodes: [] });
  const bar = page.locator('.topbar');
  await expect(bar.getByRole('combobox', {name: 'Paper', exact: true})).toBeVisible();
  for (const name of ['Paper', 'Both', 'Board', 'Questions', 'New note', 'More']) await expect(bar.getByRole('button', {name, exact: true})).toBeVisible();
  await expect(bar.getByRole('textbox', {name: 'Reading goal'})).toBeVisible();
  for (const name of ['Glossary', 'Export', 'Tags', 'Template', 'Split', 'New group']) await expect(page.getByRole('button', {name, exact: true})).toHaveCount(0);
  await expect(page.locator('.filter-bar')).toHaveCount(0);

  await page.getByRole('button', {name: 'Board', exact: true}).click();
  await page.locator('.react-flow__pane').click({ position: { x: 600, y: 400 }, button: 'right' });
  await page.getByRole('menu', {name: 'Board'}).getByRole('menuitem', {name: /New group/}).click();
  await expect(page.locator('.node.group')).toHaveCount(1);
  await expect(page.getByRole('menu', {name: 'Board'})).toHaveCount(0);

  // from the keyboard: the menu key on the board
  await page.locator('.board').focus();
  await page.keyboard.press('Shift+F10');
  await expect(page.getByRole('menuitem', {name: /New group/})).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('.node.group')).toHaveCount(2);

  const group = page.locator('.react-flow__node-group').first();
  await group.getByRole('button', {name: 'Tags', exact: true}).click();
  await group.getByLabel('question', {exact: true}).check();
  await expect(page.locator('.filter-bar')).toBeVisible();
});
