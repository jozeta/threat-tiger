// Layers: user-defined, Visio-style. Hidden layers are not drawn but still count in the analysis.
const { test } = require('@playwright/test');
const { expect, openApp, demoSession } = require('./helpers');

async function setup(page, elements, extra = {}) {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await openApp(page, { session: demoSession((s) => { s.elements = elements; s.flows = extra.flows || []; s.threats = []; Object.assign(s, extra); }) });
}

test('a new model has one Main layer; new elements go to the active layer, and survive undo/redo on their layer', async ({ page }) => {
  await setup(page, []);
  expect(await page.evaluate(() => app.state.layers)).toEqual([{ id: 'main', name: 'Main', visible: true, locked: false }]);
  await page.evaluate(() => { app.state.layers.push({ id: 'net', name: 'Network', visible: true, locked: false }); app.state.activeLayerId = 'net'; });
  await page.evaluate(() => app.instantiateNewCanvasElementNode('process', 100, 100));
  const id = await page.evaluate(() => app.state.elements[0].id);
  expect(await page.evaluate(() => app.state.elements[0].layerId)).toBe('net');
  await page.evaluate(() => { app.undo(); app.state.activeLayerId = 'main'; app.redo(); });
  expect(await page.evaluate((i) => app.state.elements.find((e) => e.id === i).layerId, id)).toBe('net');
});

test('hostile layer data loads safely', async ({ page }) => {
  const many = Array.from({ length: 200 }, (_, i) => ({ id: `l${i}`, name: `L${i}` }));
  await setup(page, [
    { id: 'a', type: 'process', name: 'A', x: 0, y: 0, width: 240, height: 80, secProps: {}, layerId: 'nowhere' },
  ], { layers: [{ id: 'x', name: '<img src=x onerror=alert(1)>' }, { id: 'x', name: 'dup' }, { id: 'bad id!', name: 'Bad' }, ...many] });
  const r = await page.evaluate(() => ({ n: app.state.layers.length, first: app.state.layers[0].id, x: app.state.layers.find((l) => l.id === 'x').name, a: app.state.elements[0].layerId, bad: app.state.layers.some((l) => l.id === 'bad id!') }));
  expect(r).toEqual({ n: 50, first: 'main', x: '<img src=x onerror=alert(1)>', a: 'main', bad: false });
});

test('layers round-trip through JSON export', async ({ page }) => {
  await setup(page, [{ id: 'a', type: 'process', name: 'A', x: 0, y: 0, width: 240, height: 80, secProps: {}, layerId: 'net' }],
    { layers: [{ id: 'main', name: 'Main' }, { id: 'net', name: 'Network', visible: false, locked: true }] });
  const [download] = await Promise.all([page.waitForEvent('download'), page.evaluate(() => app.exportWorkspaceJsonPayloadFile())]);
  const json = JSON.parse(require('node:fs').readFileSync(await download.path(), 'utf8'));
  expect(json.layers).toEqual([{ id: 'main', name: 'Main', visible: true, locked: false }, { id: 'net', name: 'Network', visible: false, locked: true }]);
  expect(json.elements[0].layerId).toBe('net');
});

const two = [
  { id: 'a', type: 'process', name: 'A', x: 0, y: 0, width: 240, height: 80, secProps: {}, layerId: 'main' },
  { id: 'b', type: 'datastore', name: 'B', x: 400, y: 0, width: 240, height: 80, secProps: {}, layerId: 'net' },
];
const flowAB = [{ id: 'f', name: 'AB', sourceId: 'a', targetId: 'b', sourceAnchor: 'right-2', targetAnchor: 'left-2', points: [], secProps: {}, layerId: 'main' }];
const nodeHidden = (page, id) => page.evaluate((i) => getComputedStyle(document.querySelector(`#layers-nodes-group [data-id="${i}"]`)).display === 'none', id);

test('hiding a layer hides its items and flows touching them, keeps them in the analysis, and drops them from the selection', async ({ page }) => {
  await setup(page, two, { flows: flowAB, layers: [{ id: 'main', name: 'Main' }, { id: 'net', name: 'Network' }] });
  await page.evaluate(() => { app.state.selectedElementIds = ['a', 'b']; app.refreshAppViewVisualWorkspace(); });
  const before = await page.evaluate(() => app.computeModelWarnings().length);
  await page.evaluate(() => { app.state.layers[1].visible = false; app.refreshAppViewVisualWorkspace(); });
  expect(await nodeHidden(page, 'b')).toBe(true);
  expect(await nodeHidden(page, 'a')).toBe(false);
  expect(await page.evaluate(() => getComputedStyle(document.querySelector('[data-flow-id="f"]')).display)).toBe('none');
  expect(await page.evaluate(() => app.state.selectedElementIds)).toEqual(['a']);
  expect(await page.evaluate(() => app.computeModelWarnings().length)).toBe(before);
  await page.evaluate(() => { app.state.layers[1].visible = true; app.refreshAppViewVisualWorkspace(); });
  expect(await page.evaluate(() => getComputedStyle(document.querySelector('[data-flow-id="f"]')).display)).not.toBe('none');
});

test('locked items cannot be selected, dragged or deleted from the canvas', async ({ page }) => {
  await setup(page, two, { layers: [{ id: 'main', name: 'Main' }, { id: 'net', name: 'Network', locked: true }] });
  await page.evaluate(() => { app.zoomScale = 1; app.panX = 100; app.panY = 100; app.applySvgViewportTransformations(); });
  const node = page.locator('#layers-nodes-group [data-id="b"]').first();
  const box = await node.boundingBox();
  await page.mouse.move(box.x + 120, box.y + 40); await page.mouse.down(); await page.mouse.move(box.x + 220, box.y + 140); await page.mouse.up();
  expect(await page.evaluate(() => app.state.elements.find((e) => e.id === 'b').x)).toBe(400);
  expect(await page.evaluate(() => app.state.selectedElementIds.includes('b'))).toBe(false);
  await page.evaluate(() => { app.state.selectedElementIds = ['a', 'b']; app.refreshAppViewVisualWorkspace(); });
  await page.keyboard.press('Delete');
  expect(await page.evaluate(() => app.state.elements.map((e) => e.id))).toEqual(['b']);
});
