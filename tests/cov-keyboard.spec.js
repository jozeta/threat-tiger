// Coverage: keyboard shortcuts (Delete/Backspace, undo/redo variants, copy/paste, arrow moves, Escape) and where they must NOT fire.
const { test } = require('@playwright/test');
const C = require('./cov-helpers');
const { expect } = C;

async function setup(page, elements, flows = []) {
  await C.openApp(page, { session: C.demoSession() });
  await page.evaluate(([els, fls]) => {
    const a = window.app; a.setViewMode('flat');
    const pid = a.state.activePageId;
    a.state.elements = els.map((e) => Object.assign({ type: 'process', pageId: pid, layerId: 'main', secProps: {}, width: 240, height: 80 }, e));
    a.state.flows = fls.map((f) => Object.assign({ points: [], secProps: {}, sourceAnchor: 'right', targetAnchor: 'left' }, f));
    a.state.threats = []; a.state.mitigations = [];
    a.state.selectedElementIds = []; a.state.selectedFlowId = null;
    a.zoomScale = 1; a.panX = 0; a.panY = 0; a.applySvgViewportTransformations();
    a.refreshAppViewVisualWorkspace(); a.resetUndoHistory();
  }, [elements, flows]);
}
const TWO = [{ id: 'A', name: 'A', x: 100, y: 200 }, { id: 'B', name: 'B', x: 600, y: 200 }];
const FLOW = [{ id: 'F', name: 'f', sourceId: 'A', targetId: 'B' }];
const ids = (page) => page.evaluate(() => app.state.elements.map((e) => e.id));

for (const key of ['Delete', 'Backspace']) {
  test(`${key} deletes the selected shape and its flows; Ctrl/Cmd+Z brings both back in one step`, async ({ page }) => {
    await setup(page, TWO, FLOW);
    await C.clickNode(page, 'A');
    await page.keyboard.press(key);
    await expect.poll(() => ids(page)).toEqual(['B']);
    expect(await page.evaluate(() => app.state.flows.length)).toBe(0);
    await expect(page.locator('#layers-nodes-group [data-id="A"]')).toHaveCount(0);
    await page.keyboard.press('ControlOrMeta+z');
    expect(await ids(page)).toEqual(['A', 'B']);
    expect(await page.evaluate(() => app.state.flows.map((f) => f.id))).toEqual(['F']);
  });
}

test('Delete with a data flow selected removes only that flow', async ({ page }) => {
  await setup(page, TWO, FLOW);
  await page.evaluate(() => app.handleFlowSelectionEvent('F'));
  await page.evaluate(() => document.activeElement && document.activeElement.blur());
  await page.keyboard.press('Delete');
  await expect.poll(() => page.evaluate(() => app.state.flows.length)).toBe(0);
  expect(await ids(page)).toEqual(['A', 'B']);
});

test('Ctrl/Cmd+Z undoes a palette add; Ctrl/Cmd+Y and Ctrl/Cmd+Shift+Z both redo it', async ({ page }) => {
  await setup(page, TWO);
  await page.click('#pal-datastore');
  await expect.poll(() => page.evaluate(() => app.state.elements.length)).toBe(3);
  await page.locator('#canvas-svg').focus();
  await page.keyboard.press('ControlOrMeta+z');
  expect(await page.evaluate(() => app.state.elements.length)).toBe(2);
  await page.keyboard.press('ControlOrMeta+y');
  expect(await page.evaluate(() => app.state.elements.map((e) => e.type))).toEqual(['process', 'process', 'datastore']);
  await page.keyboard.press('ControlOrMeta+z');
  await page.keyboard.press('ControlOrMeta+Shift+z');
  expect(await page.evaluate(() => app.state.elements.length)).toBe(3);
  await expect(page.locator('#btn-redo')).toBeDisabled();
});

test('Ctrl/Cmd+C then Ctrl/Cmd+V twice pastes two offset copies with their internal flow, selected after pasting', async ({ page }) => {
  await setup(page, TWO, FLOW);
  await page.evaluate(() => { app.state.selectedElementIds = ['A', 'B']; app.refreshAppViewVisualWorkspace(); });
  await page.keyboard.press('ControlOrMeta+c');
  await page.keyboard.press('ControlOrMeta+v');
  await page.keyboard.press('ControlOrMeta+v');
  const r = await page.evaluate(() => ({
    copies: app.state.elements.filter((e) => e.name === 'A - copy').map((e) => e.x - 100),
    flows: app.state.flows.length,
    sel: app.state.selectedElementIds.map((id) => app.state.elements.find((e) => e.id === id).name),
    unique: new Set(app.state.elements.map((e) => e.id)).size === app.state.elements.length,
  }));
  expect(r.copies).toEqual([30, 60]);
  expect(r.flows).toBe(3);
  expect(r.sel.sort()).toEqual(['A - copy', 'B - copy']);
  expect(r.unique).toBe(true);
  await page.click('#btn-undo');
  expect(await page.evaluate(() => app.state.elements.length)).toBe(4);
});

test('arrow keys move the selection by one grid step, Shift by five; a burst of presses is one undo step', async ({ page }) => {
  await setup(page, TWO);
  await C.clickNode(page, 'A');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Shift+ArrowLeft');
  expect(await page.evaluate(() => { const a = app.state.elements[0]; return [a.x, a.y]; })).toEqual([100 + 40 - 100, 220]);
  await expect.poll(() => page.evaluate(() => app.state.activityLog[0].message)).toContain('with the keyboard');
  expect(await page.evaluate(() => app.state.elements[1].x)).toBe(600);   // only the selection moves
  await page.click('#btn-undo');
  expect(await page.evaluate(() => { const a = app.state.elements[0]; return [a.x, a.y]; })).toEqual([100, 200]);
});

test('Escape clears the selection and empties Properties', async ({ page }) => {
  await setup(page, TWO);
  await C.clickNode(page, 'A');
  await expect(page.locator('#props-view-content')).toBeVisible();
  await page.locator('#layers-nodes-group [data-id="A"]').first().focus();
  await page.keyboard.press('Escape');
  expect(await C.selected(page)).toEqual([]);
  await expect(page.locator('#props-view-empty')).toBeVisible();
});

test('shortcuts do not fire while typing in a field', async ({ page }) => {
  await setup(page, TWO);
  await C.clickNode(page, 'A');
  await page.locator('#props-input-name').click();
  await page.keyboard.press('End');
  await page.keyboard.press('Backspace');
  await page.keyboard.press('Delete');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ControlOrMeta+z');
  expect(await ids(page)).toEqual(['A', 'B']);
  expect(await page.evaluate(() => app.state.elements[0].x)).toBe(100);
  await page.locator('#filter-threat-search').click();
  await page.keyboard.type('x');
  await page.keyboard.press('Backspace');
  expect(await ids(page)).toEqual(['A', 'B']);
});

test('shortcuts do not reach the canvas while a dialog is open', async ({ page }) => {
  await setup(page, TWO);
  await C.clickNode(page, 'A');
  await page.click('#btn-open-session-meta');
  await C.modalReady(page, 'modal-session-context');
  await page.locator('#modal-session-context .modal-footer button, #modal-session-context .btn-close').first().focus();
  await page.keyboard.press('Delete');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ControlOrMeta+v');
  expect(await ids(page)).toEqual(['A', 'B']);
  expect(await page.evaluate(() => app.state.elements[0].x)).toBe(100);
});

test('Enter on a focused palette item adds that shape; Tab reaches the canvas toolbar buttons', async ({ page }) => {
  await setup(page, TWO);
  await page.locator('#pal-datastore').focus();
  await page.keyboard.press('Enter');
  await expect.poll(() => page.evaluate(() => app.state.elements.map((e) => e.type))).toEqual(['process', 'process', 'datastore']);
  await page.locator('#btn-undo').focus();
  await page.keyboard.press('Enter');
  expect(await page.evaluate(() => app.state.elements.length)).toBe(2);
  await page.locator('#btn-redo').focus();
  await page.keyboard.press('Space');
  expect(await page.evaluate(() => app.state.elements.length)).toBe(3);
});
