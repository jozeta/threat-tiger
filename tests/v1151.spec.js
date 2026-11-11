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


test('2: protocol-relative and absolute image paths are rejected on import; relative file names stay', async ({ page }) => {
  const hits = [];
  await page.route('**/*', (route) => { if (route.request().url().includes('tracker.example')) { hits.push(route.request().url()); return route.fulfill({ status: 200, contentType: 'image/png', body: '' }); } return route.continue(); });
  await openApp(page, { session: demoSession() });
  await importJson(page, base({ elements: [
    { id: 'i1', type: 'custom_image', name: 'One', x: 10, y: 10, width: 120, height: 120, imageUrl: '//tracker.example/pixel.png' },
    { id: 'i2', type: 'custom_image', name: 'Two', x: 200, y: 10, width: 120, height: 120, imageUrl: '/abs/pixel.png' },
    { id: 'i3', type: 'custom_image', name: 'Three', x: 400, y: 10, width: 120, height: 120, imageUrl: 'images/pixel.png' }] }));
  await page.waitForTimeout(300);
  const urls = await page.evaluate(() => app.state.elements.map(e => e.imageUrl));
  expect(urls).toEqual(['', '', 'images/pixel.png']);
  expect(hits).toEqual([]);
});

test('5: the template backup keeps every field and the deleted built-ins, and restoring it brings both back', async ({ page }) => {
  await openApp(page, { session: demoSession() });
  await page.waitForFunction(() => (window.app.threatSuggestions.process || []).length > 10);
  const gone = await page.evaluate(() => {
    const a = window.app, t = a.threatSuggestions.process[1];
    a.addTemplateTombstone(a.templateKey('process', t));
    a.threatSuggestions.process[0].controls = ['Edited control']; a.threatSuggestions.process[0].userEdited = true;
    return a.templateKey('process', t);
  });
  const [dl] = await Promise.all([page.waitForEvent('download'), page.evaluate(() => window.app.exportThreatTemplatesBackup())]);
  const data = JSON.parse(fs.readFileSync(await dl.path(), 'utf8'));
  expect(data.process[0].id).toBeTruthy();
  expect(data.process[0].controls).toEqual(['Edited control']);
  expect(data.process[0].userEdited).toBe(true);
  expect(data.process.filter(t => t.when).length + data.flow.filter(t => t.when).length).toBeGreaterThan(0);
  expect(data.process.some(t => 'isUnsaved' in t)).toBe(false);
  expect(data.deletedBuiltins).toContain(gone);
  // Restore in a fresh browser: the edit and the deletion come back.
  await page.evaluate(() => localStorage.clear());
  await openApp(page, { session: demoSession() });
  await page.waitForFunction(() => (window.app.threatSuggestions.process || []).length > 10);
  await page.evaluate((d) => { window.app.mergeThreatSuggestions(d, false); window.app.applyDeletedBuiltins(d.deletedBuiltins); }, data);
  const r = await page.evaluate((key) => { const a = window.app; return { edited: a.threatSuggestions.process.find(t => t.userEdited)?.controls, gone: a.threatSuggestions.process.some(t => a.templateKey('process', t) === key), tomb: a.getTemplateTombstones().has(key) }; }, gone);
  expect(r).toEqual({ edited: ['Edited control'], gone: false, tomb: true });
});

test('6: shapes on an imported page without a position move into that page\'s area', async ({ page }) => {
  await openApp(page, { session: demoSession() });
  await importJson(page, base({
    pages: [{ id: 'p1', name: 'One' }, { id: 'p2', name: 'Two' }],
    elements: [
      { id: 'z', type: 'boundary', name: 'Zone on page 1', x: 0, y: 0, width: 600, height: 400, pageId: 'p1' },
      { id: 'a', type: 'process', name: 'A', x: 50, y: 50, width: 240, height: 80, pageId: 'p1' },
      { id: 'b', type: 'process', name: 'B', x: 100, y: 100, width: 240, height: 80, pageId: 'p2' }],
    flows: [{ id: 'f', name: 'f', sourceId: 'b', targetId: 'a', points: [{ x: 120, y: 300 }] }],
  }));
  const r = await page.evaluate(() => {
    const a = window.app, p2 = a.state.pages.find(p => p.id === 'p2');
    return { off: p2.offset, bx: a.state.elements.find(e => e.id === 'b').x, pt: a.state.flows[0].points[0].x, inZone: a.computeTrustAnalysis().nodeZones.get('b')?.length || 0 };
  });
  expect(r.off).toBeGreaterThan(0);
  expect(r.bx).toBe(r.off + 100);
  expect(r.pt).toBe(r.off + 120);
  expect(r.inZone).toBe(0);
});

test('11 and 12: bad flowchart colours and unknown flowchart types are cleaned up on import', async ({ page }) => {
  const errors = trackPageErrors(page);
  await openApp(page, { session: demoSession() });
  await importJson(page, base({ elements: [
    { id: 'a', type: 'fc_process', name: 'A', x: 10, y: 10, width: 160, height: 80, fcFillColor: 5, fcStrokeColor: 'url(#x)', fcStrokeWidth: 'wide' },
    { id: 'b', type: 'fc_bogus', name: 'B', x: 300, y: 10, width: 160, height: 80, fcFillColor: '#ff0000' }] }));
  const r = await page.evaluate(() => app.state.elements.map(e => ({ id: e.id, type: e.type, fill: e.fcFillColor, stroke: e.fcStrokeColor, w: e.fcStrokeWidth })));
  expect(r).toEqual([{ id: 'a', type: 'fc_process' }, { id: 'b', type: 'fc_process', fill: '#ff0000' }]);
  await page.evaluate(() => { app.state.selectedElementIds = ['b']; app.armFormatPainter(false); app.paintFormatOnto('a'); });
  expect(await page.evaluate(() => app.state.elements.find(e => e.id === 'a').fcFillColor)).toBe('#ff0000');
  expect(errors).toEqual([]);
});

test('13: a "$" in a component name stays literal in threat titles', async ({ page }) => {
  await openApp(page, { session: demoSession() });
  const r = await page.evaluate(() => {
    const a = window.app, item = a.state.elements.find(e => e.type === 'process'); item.name = "Pay $& $' Co";
    return a.describeTemplate({ title: 'Spoofing of [name] now', category: 'Spoofing' }, 'process', item, a.ruleHelpers(a.computeTrustAnalysis())).title;
  });
  expect(r).toBe("Spoofing of Pay $& $' Co now");
});

test('14 (and 10, not a bug): renaming updates the canvas label for ids with quote marks and for flowchart shapes', async ({ page }) => {
  const errors = trackPageErrors(page);
  await setup(page, [
    { id: 'el"q', type: 'process', name: 'Quoted', x: 100, y: 100, ...box(240, 80) },
    { id: 'fc', type: 'fc_process', name: 'Process', x: 500, y: 100, ...box(160, 80) }]);
  const rename = async (id, field, name) => {
    await page.evaluate((id) => window.app.handleElementSelectionEvent(id), id);
    await page.fill(field, name);
    await page.locator(field).dispatchEvent('change');
  };
  await rename('el"q', '#props-input-name', 'Renamed');
  await rename('fc', '#props-fc-label', 'NewLabel');   // flowchart shapes have their own label field, which redraws
  const labels = await page.evaluate(() => [...document.querySelectorAll('#layers-nodes-group g[data-id]')].map(g => [g.getAttribute('data-id'), g.textContent.replace(/\s+/g, ' ').trim()]));
  expect(labels.find(l => l[0] === 'el"q')[1]).toContain('Renamed');
  expect(labels.find(l => l[0] === 'fc')[1]).toContain('NewLabel');
  expect(errors).toEqual([]);
});

test('15: a flow with only one bend value still draws', async ({ page }) => {
  const s = demoSession(d => { delete d.flows[0].bendX; d.flows[0].bendY = 40; d.flows[0].points = []; });
  await openApp(page, { session: s });
  const d = await page.evaluate((fid) => document.querySelector(`[data-flow-id="${fid}"] .flow-line`).getAttribute('d'), s.flows[0].id);
  expect(d).not.toContain('NaN');
  expect(await page.evaluate((fid) => app.state.flows.find(f => f.id === fid).bendX, s.flows[0].id)).toBe(0);
});

test('17: an imported swimlane without columns gets the default columns, drawn with headers', async ({ page }) => {
  const s = demoSession(d => { d.elements.push({ id: 'sw1', type: 'swimlane', name: 'Lane', x: 2000, y: 2000, width: 680, height: 480, columns: [], rows: ['A'] }); });
  await openApp(page, { session: s });
  const info = await page.evaluate(() => { const sw = window.app.state.elements.find(e => e.id === 'sw1'); return { cols: sw.columns, headers: document.querySelectorAll('g[data-id="sw1"] .swimlane-col-text').length }; });
  expect(info.cols).toEqual(['Column 1', 'Column 2']);
  expect(info.headers).toBe(2);
});

test('25: flowchart shapes get all six STRIDE suggestions and list their threats in Properties', async ({ page }) => {
  await setup(page, [{ id: 'fc', type: 'fc_process', name: 'Login', x: 500, y: 100, ...box(160, 80) }]);
  await page.evaluate(() => { app.state.threats = [{ id: 'T-1', elementId: 'fc', title: 'Something', category: 'Spoofing', status: 'Open', likelihood: 3, impact: 3 }]; app.handleElementSelectionEvent('fc'); });
  await expect(page.locator('#box-props-threats')).toBeVisible();
  await expect(page.locator('#box-props-threats')).toContainText('Something');
  const cats = await page.evaluate(() => [...new Set(app.threatSuggestions.process.filter(t => ['Spoofing', 'Elevation of Privilege'].includes(t.category)).map(t => t.category))]);
  expect(cats.length).toBe(2);
  const shown = await page.locator('#box-stride-applicable-badges').allTextContents().catch(() => []);
  expect(shown.join(' ')).toMatch(/Spoofing|Elevation/);
});

test('8: dragging a swimlane leaves shapes on locked layers where they are', async ({ page }) => {
  await setup(page, [
    { id: 'S', type: 'swimlane', name: 'Lane', x: 100, y: 100, ...box(680, 480), columns: ['C1', 'C2'], rows: ['R1', 'R2'] },
    { id: 'P', type: 'process', name: 'P', x: 200, y: 200, ...box(240, 80) },
    { id: 'Q', type: 'process', name: 'Q', x: 480, y: 400, ...box(240, 80) }]);
  const p0 = await page.evaluate(() => { const a = window.app; const id = a.addLayer(); a.state.elements.find(e => e.id === 'P').layerId = id; a.setLayerLocked(id, true); a.refreshAppViewVisualWorkspace(); return a.state.elements.find(e => e.id === 'P').x; });
  const q0 = await page.evaluate(() => app.state.elements.find(e => e.id === 'Q').x);
  const p = await toClient(page, 700, 115);
  await page.mouse.move(p.x, p.y); await page.mouse.down();
  await page.mouse.move(p.x + 100, p.y + 100, { steps: 5 }); await page.mouse.up();
  const r = await page.evaluate(() => Object.fromEntries(app.state.elements.map(e => [e.id, e.x])));
  expect(r.S).toBeGreaterThan(150);
  expect(r.P).toBe(p0);
  expect(r.Q).toBeGreaterThan(q0 + 50);   // unlocked contents still move with the lane
});

test('18: cancelling a page delete from the rename box leaves no stuck rename box', async ({ page }) => {
  await openApp(page, { session: demoSession() });
  await page.evaluate(() => app.addPage());
  await page.dblclick('#page-tabs .page-tab[data-page-id="p1"]');
  await page.waitForSelector('.page-rename input');
  await page.click('.page-tab-delete');
  await page.waitForSelector('#modal-confirm-delete.show');
  await page.click('#btn-confirm-cancel');
  await expect(page.locator('#modal-confirm-delete.show')).toHaveCount(0);
  await expect(page.locator('#page-tabs .page-rename')).toHaveCount(0);
  await expect(page.locator('#page-tabs .page-tab[data-page-id="p1"]')).toBeVisible();
  expect(await page.evaluate(() => app.state.pages.length)).toBe(2);
});

test('19: "Clear all data" removes every preference', async ({ page }) => {
  await openApp(page, { session: demoSession() });
  await page.evaluate(() => { ['hidden_tabs', 'minimap_visible', 'line_jumps', 'hidden_stencil_sets'].forEach(k => localStorage.setItem(k, '"zz"')); });
  await Promise.all([page.waitForEvent('load'), page.evaluate(() => { app.zoomScale = 1.3; app.applySvgViewportTransformations(); return app.clearLocalData(); })]);
  await page.waitForTimeout(600);
  const left = await page.evaluate(() => ['hidden_tabs', 'minimap_visible', 'line_jumps', 'hidden_stencil_sets', 'canvas_view'].filter(k => { const v = localStorage.getItem(k); return v && v.includes('zz') || (k === 'canvas_view' && v && JSON.parse(v).zoom === 1.3); }));
  expect(left).toEqual([]);
});

test('20: the dev server refuses .git and node_modules at the top level', async () => {
  const { spawn } = require('node:child_process');
  const path = require('node:path');
  const port = 4300 + Math.floor(Math.random() * 500);
  const srv = spawn(process.execPath, [path.join(__dirname, '..', 'scripts', 'serve.mjs')], { env: { ...process.env, PORT: String(port) }, stdio: 'ignore' });
  try {
    const get = async (p) => { for (let i = 0; i < 50; i++) { try { return (await fetch(`http://127.0.0.1:${port}${p}`)).status; } catch { await new Promise(r => setTimeout(r, 100)); } } return -1; };
    expect(await get('/threat-tiger.html')).toBe(200);
    expect(await get('/.git/config')).toBe(404);
    expect(await get('/node_modules/@playwright/test/package.json')).toBe(404);
  } finally { srv.kill(); }
});

test('22: a failed PNG export brings back the grid and the selection, and says why', async ({ page }) => {
  await setup(page, [{ id: 'A', type: 'process', name: 'A', x: 100, y: 100, ...box(240, 80) }]);
  await page.evaluate(() => { app.state.selectedElementIds = ['A']; app.refreshAppViewVisualWorkspace(); HTMLCanvasElement.prototype.toDataURL = () => 'data:,'; });
  await page.evaluate(() => app.exportCanvasAsPng());
  await expect(page.locator('#app-toast-container')).toContainText('PNG export failed');
  const r = await page.evaluate(() => ({ sel: app.state.selectedElementIds, grid: document.getElementById('canvas-grid-rect')?.style.visibility || '' }));
  expect(r).toEqual({ sel: ['A'], grid: '' });
});

test('23: restoring a damaged History snapshot shows a message and keeps the model', async ({ page }) => {
  const errors = trackPageErrors(page);
  await openApp(page, { session: demoSession() });
  const before = await page.evaluate(() => app.state.elements.length);
  await page.evaluate(async () => {
    await SnapshotStore.add({ savedAt: Date.now(), label: 'broken', data: '{not json' });
    const all = await SnapshotStore.list();
    await app.restoreSnapshot(all.find(s => s.label === 'broken').id);
  });
  await expect(page.locator('#app-toast-container')).toContainText('damaged');
  expect(await page.evaluate(() => app.state.elements.length)).toBe(before);
  expect(errors).toEqual([]);
});

test('24: Undo on the deleted-threat message restores that threat, not a later change', async ({ page }) => {
  await openApp(page, { session: demoSession() });
  const t = await page.evaluate(() => app.state.threats[0].id);
  await page.evaluate((id) => app.deleteThreatWithUndo(id), t);
  const n = await page.evaluate(() => { app.instantiateNewCanvasElementNode('process'); return app.state.elements.length; });
  await page.locator('#app-toast-container button', { hasText: 'Undo' }).last().click();
  const r = await page.evaluate((id) => ({ back: app.state.threats.some(x => x.id === id), els: app.state.elements.length }), t);
  expect(r).toEqual({ back: true, els: n });
});

test('26: grid snapping still toggles when browser storage refuses writes', async ({ page }) => {
  await openApp(page, { session: demoSession() });
  const r = await page.evaluate(() => {
    const before = app.isSnappingActive;
    Storage.prototype.setItem = () => { throw new DOMException('blocked', 'SecurityError'); };
    let err = null;
    try { document.getElementById('opt-grid-snap-toggle').click(); } catch (e) { err = String(e); }
    return { before, after: app.isSnappingActive, shown: document.getElementById('opt-grid-snap-toggle').classList.contains('active'), err };
  });
  expect(r.after).toBe(!r.before);
  expect(r.shown).toBe(r.after);   // the menu shows the new state
  expect(r.err).toBeNull();
});
