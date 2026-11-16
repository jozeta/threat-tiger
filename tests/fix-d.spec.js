// Fixes for the 1.16.0 / 1.17.0 features: flow geometry and trust boundaries, review mode, elbow connectors,
// title block and legend (bug check of 16 November 2026, group D: #4, #7–#13, #27–#29, #44, #49).
const { test } = require('@playwright/test');
const { expect, openApp, demoSession, clickControl, trackPageErrors } = require('./helpers');
const { dragNode, clickNode, modalReady } = require('./cov-helpers');

const box = (id, x, y, w = 120, h = 60, extra = {}) => ({ id, type: 'process', name: id, x, y, width: w, height: h, secProps: {}, ...extra });
const elbow = (src, dst, sa, ta, extra = {}) => ({ id: 'f1', name: 'f', sourceId: src, targetId: dst, sourceAnchor: sa, targetAnchor: ta, points: [], secProps: {}, curveStyle: 'orthogonal', ...extra });

async function open(page, mutate, width = 1600) {
  await page.setViewportSize({ width, height: 1000 });
  await openApp(page, { session: demoSession((s) => { s.threats = []; s.mitigations = []; if (mutate) mutate(s); }) });
}
async function canvas(page, elements, flows, extra) {
  await open(page, (s) => { s.elements = elements; s.flows = flows; if (extra) extra(s); });
  await page.evaluate(() => { app.lineJumps = false; app.renderSvgDiagramElements(); });
}
/** The points of the drawn flow-line path (M/L commands only). */
const drawn = (page, id = 'f1') => page.evaluate((id) => {
  const d = document.querySelector(`#layers-flows-paths-group [data-flow-id="${id}"] path.flow-line`).getAttribute('d');
  const n = d.replace(/[ML]/g, ' ').trim().split(/\s+/).map(Number); const pts = [];
  for (let i = 0; i < n.length; i += 2) pts.push([n[i], n[i + 1]]);
  return pts;
}, id);
/** True when a segment of an axis-aligned polyline runs through the inside of the shape. */
const crosses = (pts, r) => pts.slice(1).some((q, i) => { const p = pts[i];
  return Math.min(p[0], q[0]) < r.x + r.width - 0.5 && Math.max(p[0], q[0]) > r.x + 0.5 && Math.min(p[1], q[1]) < r.y + r.height - 0.5 && Math.max(p[1], q[1]) > r.y + 0.5; });
const pathLength = (pts) => pts.slice(1).reduce((n, q, i) => n + Math.hypot(q[0] - pts[i][0], q[1] - pts[i][1]), 0);

// ── #4 trust-boundary crossings follow the drawn line ──────────────────────────

const LINE = (x, y, x2, y2) => ({ id: 'bl', type: 'boundary_line', name: 'Line', x, y, x2, y2, bendX: 0, bendY: 0 });

test('#4 a single-bend flow whose drawn curve crosses a boundary line is reported as crossing', async ({ page }) => {
  await canvas(page, [box('a', 0, 0), box('b', 400, 0), LINE(250, 200, 250, 900)],
    [{ id: 'f1', name: 'F', sourceId: 'a', targetId: 'b', points: [], secProps: {}, bendX: 0, bendY: 600 }]);
  expect(await page.evaluate(() => app.computeTrustAnalysis().crossings.get('f1').crosses)).toBe(true);
});

test('#4 a curve whose bend point lies exactly on the boundary line is reported as crossing', async ({ page }) => {
  // Symmetric shapes: the sampled curve has a vertex at x 250, on the line itself.
  await canvas(page, [box('a', 0, 0, 100), box('b', 400, 0, 100), LINE(250, 200, 250, 900)],
    [{ id: 'f1', name: 'F', sourceId: 'a', targetId: 'b', points: [], secProps: {}, bendX: 0, bendY: 600 }]);
  expect(await page.evaluate(() => app.flowDrawnPolyline(app.state.flows[0]).some((p) => p[0] === 250))).toBe(true);
  expect(await page.evaluate(() => app.computeTrustAnalysis().crossings.get('f1').crosses)).toBe(true);
});

test('#4 a flow that runs alongside a boundary line without crossing it is not reported', async ({ page }) => {
  await canvas(page, [box('a', 0, 0), box('b', 400, 0), LINE(100, 100, 500, 100)],
    [{ id: 'f1', name: 'F', sourceId: 'a', targetId: 'b', points: [], secProps: {} }]);
  expect(await page.evaluate(() => app.computeTrustAnalysis().crossings.get('f1').crosses)).toBe(false);
});

test('#4 a bent flow that goes around a boundary line is not reported as crossing', async ({ page }) => {
  // The straight centre line would cross the line (y 30 at x 250); the drawn curve passes far below it.
  await canvas(page, [box('a', 0, 0), box('b', 400, 0), LINE(250, -100, 250, 100)],
    [{ id: 'f1', name: 'F', sourceId: 'a', targetId: 'b', points: [], secProps: {}, bendX: 0, bendY: 600 }]);
  expect(await page.evaluate(() => app.computeTrustAnalysis().crossings.get('f1').crosses)).toBe(false);
});

test('#4 an elbow flow routed under a boundary line is reported as crossing', async ({ page }) => {
  await canvas(page, [box('a', 0, 0, 100), box('b', 400, 0, 100), LINE(250, 70, 250, 300)],
    [elbow('a', 'b', 'bottom', 'bottom')]);
  expect(await page.evaluate(() => app.computeTrustAnalysis().crossings.get('f1').crosses)).toBe(true);
});

test('#4 the crossing check and the renderer use the same polyline', async ({ page }) => {
  await canvas(page, [box('a', 0, 0), box('b', 400, 200), box('c', 200, 60)],
    [elbow('a', 'b', 'right', 'left')]);
  const r = await page.evaluate(() => app.flowDrawnPolyline(app.state.flows[0], app.elbowObstacleBoxes()));
  const pts = await drawn(page);
  // The drawn path is the same polyline, its two ends trimmed for the arrowhead.
  expect(r.length).toBe(pts.length);
  r.slice(1, -1).forEach((p, i) => expect(p).toEqual(pts[i + 1]));
  expect(r[0]).toEqual([120, 30]); expect(r[r.length - 1]).toEqual([400, 230]);
});

// ── #7 review mode keeps the layout frozen ─────────────────────────────────────

const RA = box('a', 0, 200), RB = { ...box('b', 400, 0), type: 'datastore' }, RC = { ...box('c', 0, 500), type: 'interactor' };
const RF = { id: 'f1', name: 'orders', sourceId: 'a', targetId: 'b', sourceAnchor: 'right', targetAnchor: 'left', points: [], secProps: {} };
async function reviewSetup(page, mutate) {
  await open(page, (s) => { s.elements = [RA, RB, RC].map((e) => ({ ...e })); s.flows = [{ ...RF }]; if (mutate) mutate(s); });
  await page.evaluate(() => app.zoomToFit && app.zoomToFit());
}
async function reviewOn(page) {
  await clickControl(page, '#btn-menu-view');
  await clickControl(page, '#btn-menu-review-mode');
  await page.keyboard.press('Escape');
  await expect(page.locator('#review-mode-badge')).toBeVisible();
}
const geom = (page) => page.evaluate(() => JSON.stringify([app.state.elements.map((e) => [e.id, e.type, e.x, e.y, e.width, e.height, e.columns, e.rows, e.pageId]),
  app.state.flows.map((f) => [f.id, f.sourceId, f.targetId]), app.state.pages]));
/** Re-enables a control the way a stale page or devtools could, and fires it: the handler itself must refuse. */
const force = (page, sel, how) => page.evaluate(([sel, how]) => {
  const el = document.querySelector(sel); el.disabled = false;
  if (how === 'click') el.click(); else { el.value = how; el.dispatchEvent(new Event('change', { bubbles: true })); }
}, [sel, how]);

const SWIM = { id: 'sw', type: 'swimlane', name: 'Lanes', x: 0, y: 800, columns: ['One', 'Two'], rows: ['R1', 'R2'], secProps: {} };

test('#7 review mode: swimlane columns and rows cannot be added or removed in Properties', async ({ page }) => {
  await reviewSetup(page, (s) => s.elements.push({ ...SWIM }));
  await reviewOn(page);
  await page.evaluate(() => app.handleElementSelectionEvent('sw'));
  for (const sel of ['#props-swimlane-add-col', '#props-swimlane-add-row', '.col-delete-btn', '.row-delete-btn']) await expect(page.locator(sel).first()).toBeDisabled();
  const before = await geom(page);
  for (const sel of ['#props-swimlane-add-col', '#props-swimlane-add-row', '.col-delete-btn', '.row-delete-btn']) await force(page, sel, 'click');
  expect(await geom(page)).toBe(before);
  // Renaming a column is not a layout change and still works.
  await page.locator('.col-rename-input').first().fill('Renamed');
  await page.locator('.col-rename-input').first().dispatchEvent('change');
  expect(await page.evaluate(() => app.state.elements.find((e) => e.id === 'sw').columns[0])).toBe('Renamed');
});

test('#7 review mode: the node type cannot be changed (it resizes and moves the shape)', async ({ page }) => {
  await reviewSetup(page);
  await reviewOn(page);
  await clickNode(page, 'a');
  await expect(page.locator('#props-node-type')).toBeDisabled();
  const before = await geom(page);
  await force(page, '#props-node-type', 'datastore');
  expect(await page.evaluate(() => app.changeNodeType('a', 'interactor'))).toBe(false);
  expect(await geom(page)).toBe(before);
  // Off again: the control works.
  await page.evaluate(() => app.toggleReviewMode(false));
  await clickNode(page, 'a');
  await expect(page.locator('#props-node-type')).toBeEnabled();
});

test('#7 review mode: a page cannot be deleted, and the tab has no delete button', async ({ page }) => {
  await reviewSetup(page, (s) => {
    s.pages = [{ id: 'p1', name: 'Page 1', offset: 0 }, { id: 'p2', name: 'Page 2', offset: 100000 }];
    s.elements.forEach((e) => { e.pageId = 'p1'; });
    s.elements.push({ ...box('d', 100000, 0), pageId: 'p2' });
  });
  await reviewOn(page);
  await page.evaluate(() => app.deletePage('p2'));
  expect(await page.locator('#modal-confirm-delete.show').count()).toBe(0);
  expect(await page.evaluate(() => app.state.pages.length)).toBe(2);
  await page.locator('#page-tabs .page-tab[data-page-id="p1"]').dblclick();
  await expect(page.locator('#page-tabs .page-rename input')).toBeVisible();
  expect(await page.locator('#page-tabs .page-tab-delete').count()).toBe(0);
});

test('#7 review mode: a Mermaid import adds no shapes', async ({ page }) => {
  await reviewSetup(page);
  await reviewOn(page);
  await clickControl(page, '#btn-import-mermaid');
  await modalReady(page, 'modal-mermaid-import');
  await page.fill('#mermaid-import-text', 'flowchart LR\n  X[New] --> Y[Other]');
  await page.check('#mermaid-mode-add');
  await page.click('#btn-mermaid-import-go');
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => app.state.elements.length)).toBe(3);
  expect(await page.evaluate(() => { try { app.importMermaidFlowchart('flowchart LR\n  P --> Q', 'replace'); return 'imported'; } catch (e) { return e.message; } })).toMatch(/Review mode/);
  expect(await page.evaluate(() => app.state.elements.length)).toBe(3);
});

test('#7 review mode: the flow Source and Destination selects cannot rewire a flow', async ({ page }) => {
  await reviewSetup(page);
  await reviewOn(page);
  await page.evaluate(() => app.handleFlowSelectionEvent('f1'));
  await expect(page.locator('#props-flow-src-select')).toBeDisabled();
  await expect(page.locator('#props-flow-dst-select')).toBeDisabled();
  await force(page, '#props-flow-src-select', 'c');
  await force(page, '#props-flow-dst-select', 'c');
  expect(await page.evaluate(() => [app.state.flows[0].sourceId, app.state.flows[0].targetId])).toEqual(['a', 'b']);
});

// ── #8 undo / redo in review mode ──────────────────────────────────────────────

test('#8 review mode: undo refuses to move a shape back, but still undoes a rename', async ({ page }) => {
  await reviewSetup(page);
  await dragNode(page, 'a', 100, 0);
  const moved = await page.evaluate(() => app.state.elements.find((e) => e.id === 'a').x);
  expect(moved).not.toBe(0);
  await reviewOn(page);
  await page.click('#btn-undo');
  expect(await page.evaluate(() => app.state.elements.find((e) => e.id === 'a').x)).toBe(moved);
  // A non-layout change made in review mode can be undone and redone.
  await page.evaluate(() => { app.state.elements.find((e) => e.id === 'b').name = 'Renamed'; app.logEvent('CHANGE', 'rename'); });
  await page.click('#btn-undo');
  expect(await page.evaluate(() => app.state.elements.find((e) => e.id === 'b').name)).toBe('b');
  await page.click('#btn-redo');
  expect(await page.evaluate(() => app.state.elements.find((e) => e.id === 'b').name)).toBe('Renamed');
  await page.click('#btn-undo');
  // The move is still refused, and the shape stays put.
  await page.click('#btn-undo');
  expect(await page.evaluate(() => app.state.elements.find((e) => e.id === 'a').x)).toBe(moved);
  await expect(page.locator('#app-toast-container .toast').filter({ hasText: 'Review mode' }).first()).toBeVisible();
});

test('#8 review mode: redo refuses a step that moves shapes', async ({ page }) => {
  await reviewSetup(page);
  await dragNode(page, 'a', 100, 0);
  const moved = await page.evaluate(() => app.state.elements.find((e) => e.id === 'a').x);
  await page.click('#btn-undo');
  expect(await page.evaluate(() => app.state.elements.find((e) => e.id === 'a').x)).toBe(0);
  await reviewOn(page);
  await page.click('#btn-redo');
  expect(await page.evaluate(() => app.state.elements.find((e) => e.id === 'a').x)).toBe(0);
  await page.evaluate(() => app.toggleReviewMode(false));
  await page.click('#btn-redo');
  expect(await page.evaluate(() => app.state.elements.find((e) => e.id === 'a').x)).toBe(moved);
});

// ── #9 thick elbow flows keep their arrowheads the right way round ──────────────

test('#9 thick elbow flow: the last segment still points into the target', async ({ page }) => {
  await canvas(page, [box('a', 0, 0), box('b', 216, -37)], [elbow('a', 'b', 'top', 'right', { thickness: 6 })]);
  const [p, q] = (await drawn(page)).slice(-2);
  expect(q[0] - p[0]).toBeLessThan(0);   // b's right side: arrives moving left
});

test('#9 thick two-way elbow flow: the first segment still leaves the source', async ({ page }) => {
  await canvas(page, [box('a', 0, 0), box('b', -300, -21)], [elbow('a', 'b', 'right', 'left', { thickness: 6, isBidirectional: true })]);
  const pts = await drawn(page);
  expect(pts[1][0] - pts[0][0]).toBeGreaterThan(0);   // a's right side: leaves moving right
});

test('#9 every thickness keeps the elbow arrowheads pointing the right way', async ({ page }) => {
  await canvas(page, [box('a', 0, 0), box('b', 216, -37)], [elbow('a', 'b', 'top', 'right')]);
  for (const t of [1, 2, 3, 4, 5, 6, 8, 10]) {
    const pts = await page.evaluate((t) => { app.state.flows[0].thickness = t; app.state.flows[0].isBidirectional = true; app.renderSvgDiagramElements(); }, t).then(() => drawn(page));
    const [p, q] = pts.slice(-2);
    expect(q[0] - p[0], `thickness ${t} end`).toBeLessThan(0);
    expect(pts[0][1] - pts[1][1], `thickness ${t} start`).toBeGreaterThan(0);   // a's top side: leaves moving up
  }
});

// ── #10 routing with many shapes nearby ────────────────────────────────────────

test('#10 an elbow flow still routes around shapes when more than 80 shapes are nearby', async ({ page }) => {
  const els = [];
  for (let i = 0; i < 9; i++) for (let j = 0; j < 9; j++) els.push(box(`e${i}_${j}`, i * 170, j * 110));
  await canvas(page, els, [elbow('e0_0', 'e8_8', 'right', 'left')]);
  const pts = await drawn(page);
  expect(els.filter((r) => r.id !== 'e0_0' && r.id !== 'e8_8' && crosses(pts, r)).map((r) => r.id)).toEqual([]);
});

test('#10 beyond the obstacle limit the nearest shapes are kept, so the route still avoids its neighbours', async ({ page }) => {
  // 400 shapes in the routing window: more than the limit. The ones next to the route still count.
  const els = [box('a', 0, 0), box('b', 900, 0), box('mid', 450, -10, 60, 80)];
  for (let i = 0; i < 20; i++) for (let j = 0; j < 20; j++) els.push(box(`far${i}_${j}`, -1300 + i * 40, 300 + j * 30, 20, 10));
  await canvas(page, els, [elbow('a', 'b', 'right', 'left')]);
  const r = await page.evaluate(() => { const o = app.elbowObstacleBoxes(); const t = performance.now(); app.flowDrawnPolyline(app.state.flows[0], o.map((b) => ({ ...b, x: b.x + 0.001 }))); return { limit: ELBOW_MAX_OBSTACLES, n: o.length, ms: performance.now() - t }; });
  expect(r.limit).toBeGreaterThanOrEqual(250);
  expect(r.n).toBeGreaterThan(r.limit);
  expect(crosses(await drawn(page), els[2])).toBe(false);
  expect(r.ms).toBeLessThan(500);
});

// ── #11 a neighbour close to an anchor is still an obstacle ────────────────────

test('#11 an elbow flow does not run through a shape within 34 px of its anchor', async ({ page }) => {
  const n = box('n', 148, 0);   // 28 px right of a, in line with a's right anchor
  await canvas(page, [box('a', 0, 0), n, box('b', 600, 0)], [elbow('a', 'b', 'right', 'left')]);
  expect(crosses(await drawn(page), n)).toBe(false);
});

test('#11 a shape just in front of the target anchor is not crossed either', async ({ page }) => {
  const n = box('n', 452, 0);   // 28 px left of b
  await canvas(page, [box('a', 0, 0), n, box('b', 600, 0)], [elbow('a', 'b', 'right', 'left')]);
  expect(crosses(await drawn(page), n)).toBe(false);
});

// ── #27 shapes closer than two stubs ───────────────────────────────────────────

test('#27 an elbow flow between facing shapes 20 px apart is a straight line, not a loop', async ({ page }) => {
  await canvas(page, [box('a', 0, 0), box('b', 140, 0)], [elbow('a', 'b', 'right', 'left')]);
  expect(pathLength(await drawn(page))).toBeLessThanOrEqual(20);
});

test('#27 close facing shapes that do not line up get a short Z, not a hook around the target', async ({ page }) => {
  await canvas(page, [box('a', 0, 0), box('b', 150, 24)], [elbow('a', 'b', 'right', 'left')]);
  const pts = await drawn(page);
  expect(pts.every((p) => p[0] >= 120 - 0.01 && p[0] <= 150 + 0.01)).toBe(true);   // stays in the 30 px gap
  expect(pathLength(pts)).toBeLessThan(60);
});

// ── #49 isometric obstacle boxes ───────────────────────────────────────────────

test('#49 in an isometric view an upright (disableIso) shape is an obstacle where it is drawn', async ({ page }) => {
  await canvas(page, [box('a', 0, 0), { id: 'img', type: 'custom_image', name: 'img', x: 300, y: 300, width: 120, height: 120, disableIso: true, secProps: {} }], []);
  const r = await page.evaluate(() => {
    app.setViewMode('ne-isometric');
    const img = app.elbowObstacleBoxes()[1];
    const el = document.querySelector('#layers-nodes-group [data-id="img"]');
    const bb = { x: 0, y: 0, width: 120, height: 120 }, m = el.getCTM(), wrap = document.getElementById('isometric-wrapper').getCTM();
    // The corners of the drawn 120 x 120 shape in model space (the iso wrapper's own transform taken out).
    const toModel = wrap.inverse().multiply(m);
    const corners = [[bb.x, bb.y], [bb.x + bb.width, bb.y], [bb.x, bb.y + bb.height], [bb.x + bb.width, bb.y + bb.height]].map(([x, y]) => new DOMPoint(x, y).matrixTransform(toModel));
    const xs = corners.map((p) => p.x), ys = corners.map((p) => p.y);
    app.setViewMode('flat');
    return { img, drawn: { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) } };
  });
  expect(r.img.x).toBeLessThanOrEqual(r.drawn.x + 1); expect(r.img.y).toBeLessThanOrEqual(r.drawn.y + 1);
  expect(r.img.x + r.img.w).toBeGreaterThanOrEqual(r.drawn.x + r.drawn.w - 1);
  expect(r.img.y + r.img.h).toBeGreaterThanOrEqual(r.drawn.y + r.drawn.h - 1);
});

// ── #12, #13, #28, #29, #44 title block and legend ─────────────────────────────

async function titleBlock(page, mutate, width = 1600) {
  await open(page, mutate, width);
  await page.evaluate(() => { if (!app.titleBlockVisible) app.toggleTitleBlock(); });
}
const legend = (page) => page.evaluate(() => app.legendEntries().map((e) => e.label));

test('#12 the title block text stays dark on its white box on a dark canvas', async ({ page }) => {
  await titleBlock(page);
  await page.evaluate(() => { if (app.canvasTheme !== 'dark') app.toggleCanvasTheme(); });
  const fills = await page.evaluate(() => [...document.querySelectorAll('#canvas-title-block text')].map((t) => getComputedStyle(t).fill));
  expect(fills[0]).toBe('rgb(33, 37, 41)');
  expect(fills.every((f) => f !== 'rgb(203, 213, 225)')).toBe(true);
  // Other canvas text still turns light.
  expect(await page.evaluate(() => { const t = document.createElementNS('http://www.w3.org/2000/svg', 'text'); t.setAttribute('fill', '#212529'); document.getElementById('canvas-svg').appendChild(t); const f = getComputedStyle(t).fill; t.remove(); return f; })).toBe('rgb(203, 213, 225)');
});

test('#12 the dark-mode PNG keeps the title block text dark', async ({ page }) => {
  await titleBlock(page);
  await page.evaluate(() => { if (app.canvasTheme !== 'dark') app.toggleCanvasTheme(); });
  const darkest = await page.evaluate(async () => {
    let captured = '';
    const orig = XMLSerializer.prototype.serializeToString;
    XMLSerializer.prototype.serializeToString = function (n) { const s = orig.call(this, n); if (n.id === 'canvas-svg') captured = s; return s; };
    const click = HTMLAnchorElement.prototype.click; HTMLAnchorElement.prototype.click = function () {};
    try { await app.exportCanvasAsPng(); } finally { XMLSerializer.prototype.serializeToString = orig; HTMLAnchorElement.prototype.click = click; }
    // Render only the exported title block (with the exported styles and the dark class) and find its darkest pixel.
    const doc = new DOMParser().parseFromString(captured, 'image/svg+xml');
    const svg = doc.documentElement, tb = svg.querySelector('.export-title-block');
    const tbSize = app.buildTitleBlockSvg();
    [...svg.childNodes].forEach((n) => { if (n.nodeName !== 'style') svg.removeChild(n); });
    tb.removeAttribute('transform'); svg.appendChild(tb);
    svg.setAttribute('width', tbSize.width); svg.setAttribute('height', tbSize.height); svg.setAttribute('viewBox', `0 0 ${tbSize.width} ${tbSize.height}`);
    const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(svg)); });
    const c = document.createElement('canvas'); c.width = tbSize.width; c.height = tbSize.height;
    const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, 30).data;   // the title row
    let min = 255; for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 200) min = Math.min(min, (d[i] + d[i + 1] + d[i + 2]) / 3);
    return { min, dark: svg.classList.contains('dark-theme-canvas') };
  });
  expect(darkest.dark).toBe(true);
  expect(darkest.min).toBeLessThan(90);   // #212529 text; the old light-grey fill was ~210
});

test('#13 the legend updates when a flow is made dashed or two-way in Properties', async ({ page }) => {
  await titleBlock(page, (s) => { s.flows.forEach((f) => { f.isDashed = false; f.isBidirectional = false; }); });
  const fid = await page.evaluate(() => app.state.flows[0].id);
  await page.evaluate((id) => app.handleFlowSelectionEvent(id), fid);
  await page.locator('#props-flow-dashed-switch').check();
  await expect(page.locator('#canvas-title-block')).toContainText('Dashed flow');
  await page.locator('#props-flow-bidirectional-switch').check();
  await expect(page.locator('#canvas-title-block')).toContainText('Two-way flow');
});

test('#13 the legend is not rebuilt on every mouse move of a drag (and a rebuild is cheap)', async ({ page }) => {
  await titleBlock(page);
  const r = await page.evaluate(() => {
    let n = 0; const orig = app.renderTitleBlock.bind(app); app.renderTitleBlock = () => { n++; orig(); };
    app.isDraggingElements = true; for (let i = 0; i < 5; i++) app.renderSvgDiagramElements(); app.isDraggingElements = false;
    const during = n;
    const t = performance.now(); for (let i = 0; i < 20; i++) orig(); const ms = (performance.now() - t) / 20;
    app.renderSvgDiagramElements();
    return { during, after: n - during, ms };
  });
  expect(r.during).toBe(0);
  expect(r.after).toBe(1);
  expect(r.ms).toBeLessThan(10);
});

test('#28 a long project title and details fit inside the title block', async ({ page }) => {
  await titleBlock(page, (s) => { s.projectTitle = 'Customer Identity and Access Management Platform for Retail Banking Partners'; s.diagramInfo = { level: 'level-2', version: '2026.11-rc3', status: 'in-review', author: 'Application Security Team of the Platform Group', date: '2026-11-16' }; });
  const r = await page.evaluate(() => [...document.querySelectorAll('#canvas-title-block text')].map((t) => { const b = t.getBBox(); return [t.textContent, Math.round(b.x + b.width)]; }));
  expect(r.filter(([, right]) => right > 270)).toEqual([]);
  // The title wraps to two lines (ending in an ellipsis when it is still too long).
  expect(r[0][0].startsWith('Customer Identity')).toBe(true);
  expect(r[1][0]).toMatch(/…$/);
  // The box grew to hold the second line: its last row stays inside.
  const inside = await page.evaluate(() => { const svg = document.getElementById('canvas-title-block'); const h = +svg.getAttribute('height'); return [...svg.querySelectorAll('text')].every((t) => { const b = t.getBBox(); return b.y + b.height <= h; }); });
  expect(inside).toBe(true);
});

test('#28 a short title stays on one line, unchanged', async ({ page }) => {
  await titleBlock(page, (s) => { s.projectTitle = 'Shop'; });
  const t = await page.evaluate(() => [...document.querySelectorAll('#canvas-title-block text')].map((x) => x.textContent));
  expect(t[0]).toBe('Shop');
});

test('#29 at 375 px the on-canvas title block is hidden (it stays in PNG and print)', async ({ page }) => {
  await titleBlock(page, null, 375);
  await expect(page.locator('#canvas-title-block')).toBeHidden();
  expect(await page.evaluate(() => app.buildTitleBlockSvg().height)).toBeGreaterThan(40);
  await page.emulateMedia({ media: 'print' });
  expect(await page.evaluate(() => getComputedStyle(document.getElementById('canvas-title-block')).display)).not.toBe('none');
  await page.emulateMedia({ media: 'screen' });
  await page.setViewportSize({ width: 1024, height: 900 });
  await expect(page.locator('#canvas-title-block')).toBeVisible();
});

test('#44 the legend lists only what is visible on the active page', async ({ page }) => {
  await titleBlock(page, (s) => {
    s.pages = [{ id: 'p1', name: 'Page 1', offset: 0 }, { id: 'p2', name: 'Page 2', offset: 100000 }];
    s.layers = [{ id: 'main', name: 'Main', visible: true, locked: false }, { id: 'hid', name: 'Hidden', visible: false, locked: false }];
    s.elements = [box('a', 0, 0, 120, 60, { pageId: 'p1' }), box('b', 300, 0, 120, 60, { pageId: 'p1' }),
      { ...box('ds', 100000, 0, 120, 60, { pageId: 'p2' }), type: 'datastore' },
      { ...box('zone', 0, 200, 300, 200, { pageId: 'p1', layerId: 'hid' }), type: 'boundary' }];
    s.flows = [{ id: 'f1', name: 'f', sourceId: 'a', targetId: 'b', points: [], secProps: {} },
      { id: 'f2', name: 'g', sourceId: 'ds', targetId: 'ds', points: [], secProps: {}, isDashed: true }];
    s.activePageId = 'p1';
  });
  const labels = await legend(page);
  expect(labels).toContain('Process');
  expect(labels).not.toContain('Data store');   // only on page 2
  expect(labels).not.toContain('Trust zone');   // hidden layer
  expect(labels).not.toContain('Dashed flow');  // only on page 2
});

test('#44 the legend skips the default black colour and encrypted flows (always drawn black)', async ({ page }) => {
  await titleBlock(page, (s) => {
    s.elements = [box('a', 0, 0), box('b', 300, 0), box('c', 600, 0)];
    s.flows = [{ id: 'f1', name: 'f', sourceId: 'a', targetId: 'b', points: [], secProps: {}, color: 'black' },
      { id: 'f2', name: 'g', sourceId: 'b', targetId: 'c', points: [], secProps: { encrypted: 'true' }, color: 'green' },
      { id: 'f3', name: 'h', sourceId: 'a', targetId: 'c', points: [], secProps: {}, color: 'red' }];
  });
  const labels = await legend(page);
  expect(labels).not.toContain('Black flow');
  expect(labels).not.toContain('Green flow');
  expect(labels).toContain('Red flow');
});

test('fix-d: no page errors while routing, reviewing and drawing the title block', async ({ page }) => {
  const errors = trackPageErrors(page);
  await canvas(page, [box('a', 0, 0), box('b', 140, 0), box('n', 300, 0)], [elbow('a', 'b', 'right', 'left', { thickness: 8, isBidirectional: true })]);
  await page.evaluate(() => { app.toggleTitleBlock(); app.toggleReviewMode(true); app.undo(); app.redo(); app.toggleReviewMode(false); });
  expect(errors).toEqual([]);
});
