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

test('adding a shape while the painter is on does not paint it, and turns the painter off', async ({ page }) => {
  await setup(page, els);
  await select(page, ['f1']);
  await page.dblclick('#btn-format-painter');
  await page.evaluate(() => document.getElementById('collapseFlowchart').classList.add('show'));
  await page.click('#pal-fc-process');
  const added = await page.evaluate(() => JSON.parse(JSON.stringify(app.state.elements.find((e) => !['f1', 'f2', 'f3', 'p'].includes(e.id)))));
  expect(added.fcFillColor).not.toBe('#fee2e2');
  expect(await page.evaluate(() => app.formatPainter)).toBeNull();
  expect(await page.evaluate(() => app.state.selectedElementIds)).toEqual([added.id]);
});

test('the painter turns off when its source shape disappears (delete, undo)', async ({ page }) => {
  await setup(page, els);
  await select(page, ['f1']);
  await page.dblclick('#btn-format-painter');
  await page.evaluate(() => { app.state.elements = app.state.elements.filter((e) => e.id !== 'f1'); app.refreshAppViewVisualWorkspace(); });
  expect(await page.evaluate(() => app.formatPainter)).toBeNull();
  await clickNode(page, 'f2');
  expect(await page.evaluate(() => app.state.selectedElementIds)).toEqual(['f2']);   // clicks select again
});

// ── Deferred minors (1.15.1) ──
test('painting from a shape with the default look gives the target the default look too', async ({ page }) => {
  await setup(page, [
    { id: 'd', type: 'fc_process', name: 'Default', x: 0, y: 0, width: 160, height: 80 },
    { id: 't', type: 'fc_process', name: 'Target', x: 300, y: 0, width: 160, height: 80, fcFillColor: '#000000', fcStrokeColor: '#ff0000', fcStrokeWidth: 6 },
    { id: 'c1', type: 'process', name: 'Plain', x: 0, y: 300, width: 240, height: 80, secProps: {} },
    { id: 'c2', type: 'process', name: 'Red', x: 300, y: 300, width: 240, height: 80, iconColor: '#ff0000', secProps: {} },
  ]);
  await page.evaluate(() => { app.state.selectedElementIds = ['d']; app.armFormatPainter(false); app.paintFormatOnto('t'); app.state.selectedElementIds = ['c1']; app.armFormatPainter(false); app.paintFormatOnto('c2'); });
  const t = await get(page, 't'), c2 = await get(page, 'c2');
  expect([t.fcFillColor, t.fcStrokeColor, t.fcStrokeWidth]).toEqual(['#f5f3ff', '#2563eb', 2]);   // fc_process defaults
  expect(c2.iconColor).toBeUndefined();
});

test('a process and a numbered step are different kinds for the painter', async ({ page }) => {
  await setup(page, [
    { id: 'p', type: 'process', name: 'P', x: 0, y: 0, width: 240, height: 80, iconColor: '#2563eb', secProps: {} },
    { id: 's', type: 'step_activity', name: 'S', x: 0, y: 300, width: 260, height: 50, circleColor: 'red', stepNumber: 1 },
  ]);
  const r = await page.evaluate(() => { const before = app.undoStack.length; app.state.selectedElementIds = ['p']; app.armFormatPainter(false); const done = app.paintFormatOnto('s'); return [done, app.undoStack.length - before]; });
  expect(r).toEqual([false, 0]);
});

test('while painting, trust zones and swimlanes are not dragged', async ({ page }) => {
  await setup(page, [
    { id: 'f1', type: 'fc_process', name: 'Styled', x: 0, y: 0, width: 160, height: 80, fcFillColor: '#fee2e2' },
    { id: 'z', type: 'boundary', name: 'Zone', x: 0, y: 300, width: 400, height: 300 },
    { id: 'l', type: 'swimlane', name: 'Lane', x: 600, y: 300, columns: ['A'], rows: ['R'] },
  ]);
  await select(page, ['f1']);
  await page.click('#btn-format-painter');
  for (const [id, gx, gy] of [['z', 40, 18], ['l', 80, 12]]) {   // the zone's name label; the lane's title bar
    const pt = await page.evaluate(([i, dx, dy]) => { const e = app.state.elements.find((x) => x.id === i), r = app.dom.svg.getBoundingClientRect(); return { x: r.left + app.panX + (e.x + dx) * app.zoomScale, y: r.top + app.panY + (e.y + dy) * app.zoomScale }; }, [id, gx, gy]);
    await page.mouse.move(pt.x, pt.y); await page.mouse.down();
    for (let i = 1; i <= 6; i++) await page.mouse.move(pt.x + i * 15, pt.y + i * 10);
    await page.mouse.up();
    const e = await get(page, id);
    expect([id, e.x, e.y]).toEqual([id, id === 'z' ? 0 : 600, 300]);
    await select(page, ['f1']); await page.evaluate(() => { if (!app.formatPainter) app.armFormatPainter(false); });
  }
  await page.evaluate(() => app.disarmFormatPainter());   // control: the same drag without the painter does move the zone
  const pt = await page.evaluate(() => { const r = app.dom.svg.getBoundingClientRect(); return { x: r.left + app.panX + 40 * app.zoomScale, y: r.top + app.panY + 318 * app.zoomScale }; });
  await page.mouse.move(pt.x, pt.y); await page.mouse.down();
  for (let i = 1; i <= 6; i++) await page.mouse.move(pt.x + i * 15, pt.y + i * 10);
  await page.mouse.up();
  expect((await get(page, 'z')).x).toBeGreaterThan(20);
});
