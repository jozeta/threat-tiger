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

test('the Layers panel adds, renames, hides, locks, moves the selection and deletes, each one undo step', async ({ page }) => {
  await setup(page, two.map((e) => ({ ...e, layerId: 'main' })));
  await page.click('#tab-layers-trigger');
  await expect(page.locator('.sidebar-right #layers-panel')).toBeVisible();
  await page.click('#btn-layer-add');
  const row = page.locator('.layer-row').nth(1);
  await expect(row.locator('.layer-name')).toHaveText('Layer 2');
  await row.locator('.layer-name').dblclick();
  await row.locator('input').fill('Network'); await row.locator('input').press('Enter');
  await expect(page.locator('.layer-row').nth(1).locator('.layer-name')).toHaveText('Network');
  const netId = await page.locator('.layer-row').nth(1).getAttribute('data-layer-id');
  await page.evaluate(() => { app.state.selectedElementIds = ['b']; app.refreshAppViewVisualWorkspace(); });
  await page.locator('.layer-row').nth(1).locator('.layer-move-here').click();
  expect(await page.evaluate(() => app.state.elements.find((e) => e.id === 'b').layerId)).toBe(netId);
  await page.locator('.layer-row').nth(1).locator('.layer-visible').click();
  await expect(page.locator('.layer-row').nth(1).locator('.layer-visible')).toHaveAttribute('aria-pressed', 'false');
  await page.click('#btn-undo');
  await expect(page.locator('.layer-row').nth(1).locator('.layer-visible')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('.layer-row').nth(1).locator('.layer-lock').click();
  await expect(page.locator('.layer-row').nth(1).locator('.layer-lock')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('.layer-row').nth(1).locator('.layer-name').click();                // make it active
  await expect(page.locator('.layer-row').nth(1)).toHaveAttribute('aria-current', 'true');
  await page.locator('.layer-row').nth(1).locator('.layer-delete').click();
  expect(await page.evaluate(() => [app.state.layers.length, app.state.activeLayerId, app.state.elements.find((e) => e.id === 'b').layerId])).toEqual([1, 'main', 'main']);
  await page.click('#btn-undo');
  expect(await page.evaluate((n) => app.state.elements.find((e) => e.id === 'b').layerId === n, netId)).toBe(true);
  await expect(page.locator('.layer-row').first().locator('.layer-delete')).toHaveCount(0);   // Main cannot be deleted
});

test('hiding or locking the active layer moves "active" to a visible, unlocked layer, so new shapes stay visible', async ({ page }) => {
  await setup(page, [two[0]], { layers: [{ id: 'main', name: 'Main' }, { id: 'net', name: 'Network' }], activeLayerId: 'net' });
  expect(await page.evaluate(() => app.state.activeLayerId)).toBe('net');
  await page.evaluate(() => app.setLayerVisible('net', false));
  expect(await page.evaluate(() => app.state.activeLayerId)).toBe('main');
  await page.evaluate(() => { app.setLayerVisible('net', true); app.setActiveLayer('net'); app.setLayerLocked('net', true); });
  expect(await page.evaluate(() => app.state.activeLayerId)).toBe('main');
});

// ── Review fixes ──
const fc = (id, x, layerId, extra = {}) => ({ id, type: 'fc_process', name: id, x, y: 100, width: 160, height: 80, fcFillColor: '#ffffff', fcStrokeColor: '#000000', fcStrokeWidth: 2, layerId, ...extra });
const lockedNet = { layers: [{ id: 'main', name: 'Main' }, { id: 'net', name: 'Network', locked: true }] };
async function view(page) { await page.evaluate(() => { app.zoomScale = 1; app.panX = 100; app.panY = 100; app.applySvgViewportTransformations(); }); }

test('the format painter never repaints a shape on a locked layer', async ({ page }) => {
  await setup(page, [fc('s', 0, 'main', { fcFillColor: '#fee2e2' }), fc('t', 400, 'net')], lockedNet);
  await view(page);
  await page.evaluate(() => { app.state.selectedElementIds = ['s']; app.refreshAppViewVisualWorkspace(); app.armFormatPainter(false); });
  await page.locator('#layers-nodes-group [data-id="t"]').first().click();
  expect(await page.evaluate(() => app.state.elements.find((e) => e.id === 't').fcFillColor)).toBe('#ffffff');
});

test('locked swimlanes and locked shapes show no resize handles or connection dots', async ({ page }) => {
  await setup(page, [{ id: 'sw', type: 'swimlane', name: 'S', x: 0, y: 400, columns: ['A', 'B'], rows: ['R'], layerId: 'net' }, fc('t', 400, 'net')], lockedNet);
  await view(page);
  await expect(page.locator('[data-id="sw"] .swimlane-resize-handle')).toHaveCount(0);
  await page.locator('#layers-nodes-group [data-id="t"]').first().hover({ force: true });
  await expect(page.locator('#layers-nodes-group [data-id="t"] [data-anchor-id]')).toHaveCount(0);
});

test('paste puts the copies on the active layer', async ({ page }) => {
  await setup(page, [fc('s', 0, 'main')], { layers: [{ id: 'main', name: 'Main' }, { id: 'net', name: 'Network' }] });
  await page.evaluate(() => { app.state.selectedElementIds = ['s']; app.refreshAppViewVisualWorkspace(); app.copySelection(); app.setActiveLayer('net'); app.pasteSelection(); });
  expect(await page.evaluate(() => app.state.elements.filter((e) => e.id !== 's').map((e) => e.layerId))).toEqual(['net']);
});

test('a wire released over a hidden shape does not connect to it', async ({ page }) => {
  await setup(page, [fc('s', 0, 'main'), fc('h', 400, 'net')], { layers: [{ id: 'main', name: 'Main' }, { id: 'net', name: 'Network', visible: false }] });
  await view(page);
  await page.locator('#layers-nodes-group [data-id="s"]').first().hover();
  const dot = page.locator('#layers-nodes-group [data-id="s"] [data-anchor-id="right"]');
  const b = await dot.boundingBox();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.mouse.down();
  await page.mouse.move(b.x + 200, b.y + 5, { steps: 5 }); await page.mouse.move(b.x + 320, b.y + b.height / 2, { steps: 5 }); await page.mouse.up();   // centre of h (canvas x 480)
  expect(await page.evaluate(() => app.state.flows.filter((f) => f.targetId === 'h').length)).toBe(0);
});

test('keyboard: F2 renames a layer, and focus stays on the layer after panel actions', async ({ page }) => {
  await setup(page, [fc('s', 0, 'main')], { layers: [{ id: 'main', name: 'Main' }, { id: 'net', name: 'Network' }] });
  await page.click('#tab-layers-trigger');
  await page.locator('.layer-row').nth(1).locator('.layer-name').focus();
  await page.keyboard.press('F2');
  await page.keyboard.type('Servers'); await page.keyboard.press('Enter');
  await expect(page.locator('.layer-row').nth(1).locator('.layer-name')).toHaveText('Servers');
  expect(await page.evaluate(() => document.activeElement.closest('.layer-row')?.dataset.layerId)).toBe('net');
  await page.locator('.layer-row').nth(1).locator('.layer-visible').focus();
  await page.keyboard.press('Enter');
  expect(await page.evaluate(() => [document.activeElement.classList.contains('layer-visible'), document.activeElement.closest('.layer-row')?.dataset.layerId])).toEqual([true, 'net']);
});

test('a hidden Main layer is never left active (new shapes would vanish)', async ({ page }) => {
  await setup(page, [fc('s', 0, 'net')], { layers: [{ id: 'main', name: 'Main', visible: false }, { id: 'net', name: 'Network' }], activeLayerId: 'main' });
  expect(await page.evaluate(() => app.state.activeLayerId)).toBe('net');
});
