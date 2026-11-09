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
