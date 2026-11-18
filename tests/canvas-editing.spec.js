// Canvas editing basics: select all, duplicate, group, z-order, find and the right-click menu.
const { test } = require('@playwright/test');
const { expect, openApp, importJson, downloadText } = require('./helpers');

const P = (id, name, x, y, extra = {}) => Object.assign({ id, type: 'process', name, x, y, width: 120, height: 60, secProps: {} }, extra);
const model = () => ({
  projectTitle: 'Edit', activeUser: 'Tester', threats: [{ id: 'th-001', elementId: 'a', category: 'Spoofing', title: 'T', likelihood: 2, impact: 2, status: 'Open' }],
  pages: [{ id: 'p1', name: 'One', offset: 0 }, { id: 'p2', name: 'Two', offset: 100000 }], activePageId: 'p1',
  elements: [P('a', 'Alpha', 100, 100, { pageId: 'p1' }), P('b', 'Beta', 400, 100, { pageId: 'p1' }), P('c', 'Gamma', 100, 400, { pageId: 'p1' }),
    P('d', 'Delta on two', 100000 + 100, 100, { pageId: 'p2' })],
  flows: [{ id: 'f1', sourceId: 'a', targetId: 'b', name: 'Alpha to Beta', sourceAnchor: 'right', targetAnchor: 'left' }],
});
const sel = (page) => page.evaluate(() => [...app.state.selectedElementIds].sort());
const ids = (page) => page.evaluate(() => app.state.elements.map((e) => e.id));
const select = (page, list) => page.evaluate((l) => { app.state.selectedElementIds = l; app.state.selectedFlowId = null; app.refreshAppViewVisualWorkspace(); }, list);
const mod = process.platform === 'darwin' ? 'Meta' : 'Control';

test('Ctrl/⌘+A selects every visible shape on the current page only', async ({ page }) => {
  await openApp(page, { session: model() });
  await page.keyboard.press(`${mod}+a`);
  expect(await sel(page)).toEqual(['a', 'b', 'c']);
});

test('Ctrl/⌘+D duplicates the selection with the flows and threats between them, and leaves the clipboard alone', async ({ page }) => {
  await openApp(page, { session: model() });
  await select(page, ['c']);
  await page.keyboard.press(`${mod}+c`);
  await select(page, ['a', 'b']);
  const undoBefore = await page.evaluate(() => app.undoStack.length);
  await page.keyboard.press(`${mod}+d`);
  const s = await page.evaluate(() => ({ n: app.state.elements.length, flows: app.state.flows.length, threats: app.state.threats.length,
    names: app.state.selectedElementIds.map((i) => app.state.elements.find((e) => e.id === i).name).sort(), undo: app.undoStack.length }));
  expect(s).toMatchObject({ n: 6, flows: 2, threats: 2, names: ['Alpha - copy', 'Beta - copy'] });
  expect(s.undo).toBe(undoBefore + 1);
  await page.keyboard.press(`${mod}+v`);   // the clipboard still holds Gamma
  expect(await page.evaluate(() => app.state.selectedElementIds.map((i) => app.state.elements.find((e) => e.id === i).name))).toEqual(['Gamma - copy']);
});

test('group: one click selects the whole group; ungroup splits it; groups survive export and import, bad ones are dropped', async ({ page }) => {
  await openApp(page, { session: model() });
  await select(page, ['a', 'b']);
  await page.keyboard.press(`${mod}+g`);
  const gid = await page.evaluate(() => app.state.elements.find((e) => e.id === 'a').groupId);
  expect(gid).toMatch(/^g-[\w-]+$/);
  expect(await page.evaluate(() => app.state.elements.find((e) => e.id === 'b').groupId)).toBe(gid);
  await page.evaluate(() => app.clearActiveSelectionPointers());
  await page.locator('#layers-nodes-group [data-id="a"]').click();
  expect(await sel(page)).toEqual(['a', 'b']);
  // A copy of a group is a new group.
  await page.keyboard.press(`${mod}+d`);
  const copies = await page.evaluate(() => app.state.selectedElementIds.map((i) => app.state.elements.find((e) => e.id === i).groupId));
  expect(copies[0]).toBe(copies[1]);
  expect(copies[0]).not.toBe(gid);
  // Export and import keep the group.
  const json = await downloadText(page, '#btn-export');
  const data = JSON.parse(json);
  expect(data.elements.find((e) => e.id === 'a').groupId).toBe(gid);
  data.elements.find((e) => e.id === 'c').groupId = '<img src=x>';       // invalid: dropped
  data.elements.find((e) => e.id === 'd').groupId = 'g-lonely';          // a group of one: dropped
  await importJson(page, JSON.stringify(data));
  expect(await page.evaluate(() => ['a', 'c', 'd'].map((i) => app.state.elements.find((e) => e.id === i).groupId))).toEqual([gid, undefined, undefined]);
  await select(page, ['a', 'b']);
  await page.keyboard.press(`${mod}+Shift+g`);
  expect(await page.evaluate(() => ['a', 'b'].map((i) => app.state.elements.find((e) => e.id === i).groupId))).toEqual([undefined, undefined]);
});

test('z-order: bring to front, send to back, one step forward and backward', async ({ page }) => {
  await openApp(page, { session: model() });
  await select(page, ['a']);
  await page.evaluate(() => app.reorderSelection('front'));
  expect(await ids(page)).toEqual(['b', 'c', 'd', 'a']);
  const dom = await page.evaluate(() => [...document.querySelectorAll('#layers-nodes-group > g[data-id]')].map((g) => g.dataset.id));
  expect(dom.indexOf('a')).toBe(dom.length - 1);   // drawn last = on top
  // A step swaps with the next shape you can see (d is on page two, so it is skipped).
  await page.evaluate(() => app.reorderSelection('backward'));
  expect(await ids(page)).toEqual(['b', 'a', 'd', 'c']);
  await page.evaluate(() => app.reorderSelection('back'));
  expect(await ids(page)).toEqual(['a', 'b', 'd', 'c']);
  await page.evaluate(() => app.reorderSelection('forward'));
  expect(await ids(page)).toEqual(['b', 'a', 'd', 'c']);
});

test('find: Ctrl/⌘+F searches shapes and flows on every page and jumps to each match', async ({ page }) => {
  await openApp(page, { session: model() });
  await page.keyboard.press(`${mod}+f`);
  await expect(page.locator('#canvas-find')).toBeVisible();
  await expect(page.locator('#canvas-find-input')).toBeFocused();
  await page.fill('#canvas-find-input', 'delta');
  await expect(page.locator('#canvas-find-count')).toHaveText('1 of 1');
  await page.keyboard.press('Enter');
  await expect.poll(() => page.evaluate(() => app.state.activePageId)).toBe('p2');
  expect(await sel(page)).toEqual(['d']);
  await page.fill('#canvas-find-input', 'alpha');
  await expect(page.locator('#canvas-find-count')).toHaveText('1 of 2');   // the shape and the flow "Alpha to Beta"
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await expect.poll(() => page.evaluate(() => app.state.selectedFlowId)).toBe('f1');
  await page.fill('#canvas-find-input', 'zzz');
  await expect(page.locator('#canvas-find-count')).toHaveText('No matches');
  await page.keyboard.press('Escape');
  await expect(page.locator('#canvas-find')).toBeHidden();
});

test('right-click menu on a shape, on empty canvas, by keyboard; a right-drag still pans', async ({ page }) => {
  await openApp(page, { session: model() });
  const shape = page.locator('#layers-nodes-group [data-id="c"]');
  await shape.click({ button: 'right' });
  const menu = page.locator('#canvas-context-menu');
  await expect(menu).toBeVisible();
  await expect(menu.locator('[role="menuitem"]').first()).toBeFocused();
  for (const a of ['duplicate', 'copy', 'delete', 'front', 'back', 'select-all', 'find']) await expect(menu.locator(`[data-action="${a}"]`)).toHaveCount(1);
  expect(await sel(page)).toEqual(['c']);
  await menu.locator('[data-action="duplicate"]').click();
  await expect(menu).toBeHidden();
  expect(await page.evaluate(() => app.state.elements.length)).toBe(5);
  // Empty canvas: only what applies there.
  const box = await page.locator('#canvas-svg').boundingBox();
  await page.mouse.click(box.x + box.width - 30, box.y + box.height - 30, { button: 'right' });
  await expect(menu).toBeVisible();
  await expect(menu.locator('[data-action="delete"]')).toHaveCount(0);
  await expect(menu.locator('[data-action="select-all"]')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
  // A right-drag pans and opens no menu.
  const pan0 = await page.evaluate(() => app.panX);
  await page.mouse.move(box.x + 200, box.y + 200);
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(box.x + 300, box.y + 250, { steps: 5 });
  await page.mouse.up({ button: 'right' });
  expect(await page.evaluate(() => app.panX)).not.toBe(pan0);
  await expect(menu).toBeHidden();
  // Keyboard: Shift+F10 opens it for the selection.
  await select(page, ['a']);
  await page.keyboard.press('Shift+F10');
  await expect(menu).toBeVisible();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
});

test('review mode allows select all and find but blocks duplicate, group and z-order', async ({ page }) => {
  await openApp(page, { session: model() });
  await page.evaluate(() => app.toggleReviewMode(true));
  await page.keyboard.press(`${mod}+a`);
  expect(await sel(page)).toEqual(['a', 'b', 'c']);
  await page.keyboard.press(`${mod}+d`);
  await page.keyboard.press(`${mod}+g`);
  await page.evaluate(() => app.reorderSelection('front'));
  expect(await page.evaluate(() => [app.state.elements.length, app.state.elements.some((e) => e.groupId)])).toEqual([4, false]);
  expect(await ids(page)).toEqual(['a', 'b', 'c', 'd']);
});
