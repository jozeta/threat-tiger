// Format painter: copy a shape's look (never its name, type or security settings) onto shapes of the same kind.
const { test } = require('@playwright/test');
const { expect, openApp, demoSession } = require('./helpers');

async function setup(page, elements = []) {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await openApp(page, { session: demoSession((s) => { s.elements = elements; s.flows = []; s.threats = []; }) });
  await page.evaluate(() => { app.zoomScale = 0.8; app.panX = 100; app.panY = 100; app.applySvgViewportTransformations(); });
}
const select = (page, ids) => page.evaluate((sel) => { app.state.selectedElementIds = sel; app.refreshAppViewVisualWorkspace(); }, ids);
const els = [
  { id: 'f1', type: 'fc_process', name: 'Styled', x: 0, y: 0, width: 160, height: 80, fcFillColor: '#fee2e2', fcStrokeColor: '#dc2626', fcStrokeWidth: 4 },
  { id: 'f2', type: 'fc_decision', name: 'Plain', x: 300, y: 0, width: 160, height: 100, fcFillColor: '#ffffff', fcStrokeColor: '#000000', fcStrokeWidth: 2 },
  { id: 'f3', type: 'fc_cube', name: 'Plain 2', x: 600, y: 0, width: 140, height: 100, fcFillColor: '#ffffff', fcStrokeColor: '#000000', fcStrokeWidth: 2 },
  { id: 'p', type: 'process', name: 'API', x: 0, y: 300, width: 240, height: 80, iconColor: '#2563eb', secProps: { encrypted: 'true' } },
];
const get = (page, id) => page.evaluate((i) => JSON.parse(JSON.stringify(app.state.elements.find((e) => e.id === i))), id);
const clickNode = (page, id) => page.locator(`#layers-nodes-group [data-id="${id}"]`).first().click();

test('one-shot painter copies flowchart look only, one undo step, then turns off', async ({ page }) => {
  await setup(page, els);
  await select(page, ['f1']);
  await page.click('#btn-format-painter');
  await expect(page.locator('#btn-format-painter')).toHaveAttribute('aria-pressed', 'true');
  const before = await page.evaluate(() => app.undoStack.length);
  await clickNode(page, 'f2');
  expect(await get(page, 'f2')).toMatchObject({ name: 'Plain', type: 'fc_decision', width: 160, height: 100, fcFillColor: '#fee2e2', fcStrokeColor: '#dc2626', fcStrokeWidth: 4 });
  expect(await page.evaluate(() => app.undoStack.length)).toBe(before + 1);
  expect(await page.evaluate(() => app.formatPainter)).toBeNull();
  await clickNode(page, 'f3');
  expect((await get(page, 'f3')).fcFillColor).toBe('#ffffff');
});

test('painting across kinds changes nothing and adds no undo step; clicking the source keeps it armed', async ({ page }) => {
  await setup(page, els);
  await select(page, ['f1']);
  await page.click('#btn-format-painter');
  await clickNode(page, 'f1');
  expect(await page.evaluate(() => app.formatPainter && app.formatPainter.sourceId)).toBe('f1');
  const before = await page.evaluate(() => app.undoStack.length);
  await clickNode(page, 'p');
  const p = await get(page, 'p');
  expect(p.fcFillColor).toBeUndefined();
  expect(p.iconColor).toBe('#2563eb');
  expect(p.secProps.encrypted).toBe('true');
  expect(await page.evaluate(() => app.undoStack.length)).toBe(before);
});

test('double-click keeps the painter on until Esc; Esc does not also clear the selection', async ({ page }) => {
  await setup(page, els);
  await select(page, ['f1']);
  await page.dblclick('#btn-format-painter');
  await clickNode(page, 'f2');
  await clickNode(page, 'f3');
  expect((await get(page, 'f3')).fcFillColor).toBe('#fee2e2');
  await page.keyboard.press('Escape');
  expect(await page.evaluate(() => app.formatPainter)).toBeNull();
  expect(await page.evaluate(() => app.state.selectedElementIds)).toEqual(['f1']);
  await select(page, ['f1', 'f2']);
  await expect(page.locator('#btn-format-painter')).toBeDisabled();
});

test('a paint that changes nothing does not move the selection to the clicked shape', async ({ page }) => {
  await setup(page, els);
  await select(page, ['f1']);
  await page.click('#btn-format-painter');
  await clickNode(page, 'p');                       // a process: nothing to copy
  expect(await page.evaluate(() => app.state.selectedElementIds)).toEqual(['f1']);
});
