// 1.15.1: fixes from the November 2026 bug check (numbers refer to that list).
const { test } = require('@playwright/test');
const fs = require('node:fs');
const { expect, openApp, demoSession, importJson, trackPageErrors } = require('./helpers');

const ICON = 'data:image/svg+xml;base64,' + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="#f80"/></svg>').toString('base64');
const base = (extra) => JSON.stringify(Object.assign({ projectTitle: 'T', activeUser: 'Tester', elements: [], flows: [], threats: [] }, extra));

/** Flat view, zoom 1, no pan, with the given elements and flows on the active page. */
async function setup(page, elements, flows = []) {
  await openApp(page, { session: demoSession() });
  await page.evaluate(([els, fls]) => {
    const a = window.app; a.setViewMode('flat');
    const pid = a.state.activePageId;
    a.state.elements = els.map(e => Object.assign({ pageId: pid, layerId: 'main', secProps: {} }, e));
    a.state.flows = fls.map(f => Object.assign({ points: [], secProps: {} }, f));
    a.state.threats = [];
    a.zoomScale = 1; a.panX = 0; a.panY = 0; a.applySvgViewportTransformations();
    a.refreshAppViewVisualWorkspace();
  }, [elements, flows]);
}
const toClient = (page, x, y) => page.evaluate(([x, y]) => {
  const a = window.app, r = a.dom.svg.getBoundingClientRect();
  return { x: r.left + a.panX + x * a.zoomScale, y: r.top + a.panY + y * a.zoomScale };
}, [x, y]);
const box = (w, h) => ({ width: w, height: h });

test('1: a placed icon drags with press-move-release and does not stick to the pointer', async ({ page }) => {
  await setup(page, [{ id: 'I', type: 'datastore', name: 'Icon', x: 300, y: 300, ...box(120, 100), stencil: 'aws:x', stencilIcon: ICON }]);
  const img = page.locator('#layers-nodes-group [data-id="I"] img.stencil-icon');
  await expect(img).toHaveCount(1);
  expect(await img.getAttribute('draggable')).toBe('false');
  const b = await img.boundingBox();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2 + 100, b.y + b.height / 2 + 60, { steps: 6 });
  await page.mouse.up();
  const after = await page.evaluate(() => app.state.elements.find(e => e.id === 'I').x);
  expect(after).toBeGreaterThan(330);
  await page.mouse.move(b.x + 400, b.y + 300, { steps: 4 });
  expect(await page.evaluate(() => app.state.elements.find(e => e.id === 'I').x)).toBe(after);
});

test('3: an icon from an icon set can be dragged from the palette onto the canvas', async ({ page }) => {
  await setup(page, [{ id: 'z', type: 'process', name: 'Z', x: 2000, y: 2000, ...box(240, 80) }]);
  await page.evaluate(() => document.getElementById('collapseDataNodes').classList.add('show'));
  const set = page.locator('[data-stencil-set="aws"]');
  await set.locator('.stencil-set-toggle').click();
  const item = set.locator('.stencil-item').first();
  await expect(item).toBeVisible();
  expect(await item.getAttribute('draggable')).toBe('true');
  const drop = await toClient(page, 500, 400);
  await page.evaluate(([sel, x, y]) => {
    const dt = new DataTransfer();
    const src = document.querySelector(sel);
    src.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: dt }));
    const svg = window.app.dom.svg;
    svg.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt, clientX: x, clientY: y }));
    svg.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt, clientX: x, clientY: y }));
  }, ['[data-stencil-set="aws"] .stencil-item', drop.x, drop.y]);
  const el = await page.evaluate(() => JSON.parse(JSON.stringify(app.state.elements.find(e => e.id !== 'z'))));
  expect(el.stencil).toMatch(/^aws:/);
  expect(el.stencilIcon).toMatch(/^data:image\/svg\+xml;base64,/);
  expect(Math.abs(el.x + el.width / 2 - 500)).toBeLessThan(40);
  expect(Math.abs(el.y + el.height / 2 - 400)).toBeLessThan(40);
});

test('4: zoom buttons and the mouse wheel keep the centre of the view in place', async ({ page }) => {
  await setup(page, [{ id: 'A', type: 'process', name: 'A', x: 100, y: 100, ...box(240, 80) }]);
  const centre = () => page.evaluate(() => {
    const a = window.app, r = a.dom.svg.getBoundingClientRect();
    return { x: (r.width / 2 - a.panX) / a.zoomScale, y: (r.height / 2 - a.panY) / a.zoomScale };
  });
  await page.evaluate(() => { app.panX = -300; app.panY = -200; app.applySvgViewportTransformations(); });
  const c0 = await centre();
  await page.click('#btn-canvas-zoom-in');
  await page.click('#btn-canvas-zoom-in');
  let c = await centre();
  expect(Math.abs(c.x - c0.x)).toBeLessThan(1); expect(Math.abs(c.y - c0.y)).toBeLessThan(1);
  await page.click('#btn-canvas-zoom-out');
  c = await centre();
  expect(Math.abs(c.x - c0.x)).toBeLessThan(1); expect(Math.abs(c.y - c0.y)).toBeLessThan(1);
  const r = await page.evaluate(() => { const b = app.dom.svg.getBoundingClientRect(); return { x: b.left + 50, y: b.top + 50 }; });
  await page.mouse.move(r.x, r.y);
  await page.mouse.wheel(0, -100);
  await page.waitForTimeout(100);
  c = await centre();
  expect(await page.evaluate(() => app.zoomScale)).not.toBe(1);
  expect(Math.abs(c.x - c0.x)).toBeLessThan(1); expect(Math.abs(c.y - c0.y)).toBeLessThan(1);
});

const flowSetup = (page) => setup(page, [
  { id: 'A', type: 'process', name: 'A', x: 100, y: 100, ...box(240, 80) },
  { id: 'B', type: 'process', name: 'B', x: 600, y: 100, ...box(240, 80) },
  { id: 'C', type: 'process', name: 'C', x: 600, y: 400, ...box(240, 80) },
], [{ id: 'F', name: 'f', sourceId: 'A', targetId: 'B', sourceAnchor: 'right', targetAnchor: 'left' }]);
const armTargetDrag = (page) => page.evaluate(() => {
  const a = window.app;
  a.activeFlowDragMode = 'flow_target'; a.activeFlowDragId = 'F';
  a.flowDragInitialState = { sourceId: 'A', sourceAnchor: 'right', targetId: 'B', targetAnchor: 'left' };
});

test('7: dragging a flow end ignores shapes on hidden layers and the flow\'s own other end', async ({ page }) => {
  await flowSetup(page);
  await page.evaluate(() => { const a = window.app; const id = a.addLayer(); a.state.elements.find(e => e.id === 'C').layerId = id; a.setLayerVisible(id, false); });
  await armTargetDrag(page);
  let p = await toClient(page, 700, 440);
  await page.mouse.move(p.x, p.y); await page.mouse.up();
  expect(await page.evaluate(() => app.state.flows[0].targetId)).toBe('B');
  await armTargetDrag(page);
  p = await toClient(page, 200, 140);
  await page.mouse.move(p.x, p.y); await page.mouse.up();
  expect(await page.evaluate(() => app.state.flows[0].targetId)).toBe('B');
});

test('7: the flow source and destination lists leave out the other end and other pages', async ({ page }) => {
  await flowSetup(page);
  await page.evaluate(() => { const a = window.app; const first = a.state.activePageId; a.addPage(); const other = a.state.pages.find(p => p.id !== first); a.setActivePage(first); const c = a.state.elements.find(e => e.id === 'C'); c.pageId = other.id; c.x += other.offset; a.handleFlowSelectionEvent('F'); });
  const src = await page.$$eval('#props-flow-src-select option', os => os.map(o => o.value));
  const dst = await page.$$eval('#props-flow-dst-select option', os => os.map(o => o.value));
  expect(src).toContain('A'); expect(src).not.toContain('B'); expect(src).not.toContain('C');
  expect(dst).toContain('B'); expect(dst).not.toContain('A'); expect(dst).not.toContain('C');
});

test('9: Ctrl/Cmd+C and +V are left to the browser when no shape is selected', async ({ page }) => {
  await flowSetup(page);
  const r = await page.evaluate(() => {
    window.app.state.selectedElementIds = [];
    const range = document.createRange(); range.selectNodeContents(document.querySelector('h1, h2, h3, h4, h5, .navbar-brand') || document.body);
    getSelection().removeAllRanges(); getSelection().addRange(range);
    const c = new KeyboardEvent('keydown', { key: 'c', ctrlKey: true, bubbles: true, cancelable: true }); document.body.dispatchEvent(c);
    const v = new KeyboardEvent('keydown', { key: 'v', ctrlKey: true, bubbles: true, cancelable: true }); document.body.dispatchEvent(v);
    return { c: c.defaultPrevented, v: v.defaultPrevented };
  });
  expect(r).toEqual({ c: false, v: false });
  // With a shape selected and no text selected, copy and paste still work on the canvas.
  const n = await page.evaluate(() => {
    getSelection().removeAllRanges();
    window.app.state.selectedElementIds = ['A'];
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'c', ctrlKey: true, bubbles: true, cancelable: true }));
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'v', ctrlKey: true, bubbles: true, cancelable: true }));
    return window.app.state.elements.length;
  });
  expect(n).toBe(4);
});

test('16: the threat pop-up closes when the canvas is redrawn', async ({ page }) => {
  await openApp(page, { session: demoSession() });
  const id = await page.evaluate(() => window.app.state.threats[0].elementId);
  await page.locator(`g[data-id="${id}"] .threat-bug-badge`).first().hover();
  await expect(page.locator('#threat-bug-popover')).toBeVisible();
  await page.evaluate((id) => { window.app.state.selectedElementIds = [id]; window.app.applySelectionRemoval(window.app.planSelectionRemoval()); }, id);
  await expect(page.locator('#threat-bug-popover')).toBeHidden();
});

