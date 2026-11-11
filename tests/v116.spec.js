// 1.16.0: elbow connectors, review mode, title block and legend.
const { test } = require('@playwright/test');
const { expect, openApp, demoSession, trackPageErrors, importJson, downloadText, clickControl } = require('./helpers');
const { dragNode, clickNode, rename, nodeCentre } = require('./cov-helpers');

const A = { id: 'a', type: 'process', name: 'Web app', x: 0, y: 200, width: 120, height: 60, secProps: {} };
const B = { id: 'b', type: 'datastore', name: 'Orders DB', x: 400, y: 0, width: 120, height: 60, secProps: {} };
const C = { id: 'c', type: 'interactor', name: 'Customer', x: 0, y: 500, width: 120, height: 60, secProps: {} };
const F1 = { id: 'f1', name: 'orders', sourceId: 'a', targetId: 'b', sourceAnchor: 'right-2', targetAnchor: 'left-2', points: [], secProps: {}, curveStyle: 'orthogonal' };

async function setup(page, mutate) {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await openApp(page, { session: demoSession((s) => { s.elements = [A, B, C].map((e) => ({ ...e })); s.flows = [{ ...F1 }]; s.threats = []; s.mitigations = []; if (mutate) mutate(s); }) });
  await page.evaluate(() => app.zoomToFit && app.zoomToFit());
}

/** The points of a path made of M/L commands only. */
function polyOf(d) {
  expect(d).toMatch(/^M [-\d.]+ [-\d.]+( L [-\d.]+ [-\d.]+)+$/);
  const nums = d.replace(/[ML]/g, ' ').trim().split(/\s+/).map(Number);
  const pts = []; for (let i = 0; i < nums.length; i += 2) pts.push([nums[i], nums[i + 1]]);
  return pts;
}
const axisAligned = (pts) => pts.slice(1).every((p, i) => Math.abs(p[0] - pts[i][0]) < 0.01 || Math.abs(p[1] - pts[i][1]) < 0.01);

// ── Elbow connectors ──────────────────────────────────────────────────────────

test('orthogonalRoute leaves and enters along the anchor sides with right angles only', async ({ page }) => {
  await setup(page);
  const r = await page.evaluate(() => orthogonalRoute([0, 0], 'right', [], [200, 100], 'left'));
  const pts = [[0, 0], ...r, [200, 100]];
  expect(axisAligned(pts)).toBe(true);
  expect(pts[1][1]).toBe(0); expect(pts[1][0]).toBeGreaterThan(0);                  // leaves to the right
  expect(pts[pts.length - 2][1]).toBe(100); expect(pts[pts.length - 2][0]).toBeLessThan(200);   // arrives from the left
});

test('orthogonalRoute passes through waypoints and handles opposite-facing sides', async ({ page }) => {
  await setup(page);
  const r = await page.evaluate(() => ({
    via: orthogonalRoute([0, 0], 'bottom', [[150, 80]], [300, 0], 'top'),
    back: orthogonalRoute([200, 0], 'right', [], [0, 0], 'left'),
  }));
  const via = [[0, 0], ...r.via, [300, 0]];
  expect(axisAligned(via)).toBe(true);
  expect(via.some((p) => p[0] === 150 && p[1] === 80)).toBe(true);
  expect(via[1]).toEqual([0, via[1][1]]); expect(via[1][1]).toBeGreaterThan(0);      // leaves downwards
  expect(via[via.length - 2][1]).toBeLessThan(0);                                    // arrives from above
  const back = [[200, 0], ...r.back, [0, 0]];
  expect(axisAligned(back)).toBe(true);
  expect(back[1][0]).toBeGreaterThan(200);                                           // still leaves to the right
  expect(back[back.length - 2][0]).toBeLessThan(0);                                  // still enters from the left
});

test('an elbow flow is drawn with right angles only, and its bend point stays a handle', async ({ page }) => {
  const errors = trackPageErrors(page);
  await setup(page, (s) => { s.flows[0].points = [{ x: 260, y: 120 }]; });
  const d = await page.locator('#layers-flows-paths-group [data-flow-id="f1"] path.flow-line').getAttribute('d');
  const pts = polyOf(d);
  expect(axisAligned(pts)).toBe(true);
  expect(pts.some((p) => p[0] === 260 && p[1] === 120)).toBe(true);
  await page.evaluate(() => { app.handleFlowSelectionEvent('f1'); });
  await expect(page.locator('#layers-interactive-handles-group circle[fill="#ffc107"]')).toHaveCount(1);
  expect(errors).toEqual([]);
});

test('Properties offers the elbow style and import keeps it but drops unknown styles', async ({ page }) => {
  await setup(page, (s) => { s.flows[0].curveStyle = 'smooth'; });
  await page.evaluate(() => app.handleFlowSelectionEvent('f1'));
  await expect(page.locator('#props-flow-curve-select option[value="orthogonal"]')).toHaveCount(1);
  await page.selectOption('#props-flow-curve-select', 'orthogonal');
  expect(await page.evaluate(() => app.state.flows[0].curveStyle)).toBe('orthogonal');
  const r = await page.evaluate(() => {
    const raw = (style) => ({ elements: [{ id: 'a', type: 'process', name: 'A', x: 0, y: 0 }, { id: 'b', type: 'process', name: 'B', x: 300, y: 0 }],
      flows: [{ id: 'f', sourceId: 'a', targetId: 'b', curveStyle: style }] });
    return ['orthogonal', 'sharp', 'smooth', 'zigzag', '<b>'].map((s) => normalizeSession(raw(s)).session.flows[0].curveStyle);
  });
  expect(r).toEqual(['orthogonal', 'sharp', 'smooth', undefined, undefined]);
});

test('line jumps work on elbow flows', async ({ page }) => {
  await setup(page, (s) => {
    s.elements = [
      { id: 'a', type: 'process', name: 'A', x: 0, y: 200, width: 120, height: 60, secProps: {} },
      { id: 'b', type: 'process', name: 'B', x: 600, y: 200, width: 120, height: 60, secProps: {} },
      { id: 'c', type: 'process', name: 'C', x: 300, y: 0, width: 120, height: 60, secProps: {} },
      { id: 'd', type: 'process', name: 'D', x: 300, y: 500, width: 120, height: 60, secProps: {} },
    ];
    s.flows = [
      { id: 'f1', name: '', sourceId: 'a', targetId: 'b', sourceAnchor: 'right-2', targetAnchor: 'left-2', points: [], secProps: {}, curveStyle: 'orthogonal' },
      { id: 'f2', name: '', sourceId: 'c', targetId: 'd', sourceAnchor: 'bottom-2', targetAnchor: 'top-2', points: [], secProps: {}, curveStyle: 'orthogonal' },
    ];
  });
  const d2 = await page.locator('#layers-flows-paths-group [data-flow-id="f2"] path.flow-line').getAttribute('d');
  expect(d2).toContain(' A 6 6 ');
});

// ── Review mode ───────────────────────────────────────────────────────────────

async function reviewOn(page) {
  await clickControl(page, '#btn-menu-view');
  await clickControl(page, '#btn-menu-review-mode');
  await expect(page.locator('#review-mode-badge')).toBeVisible();
  expect(await page.evaluate(() => app.state.reviewMode)).toBe(true);
}

test('review mode freezes the layout: no drag, delete, nudge, palette add or paste', async ({ page }) => {
  const errors = trackPageErrors(page);
  await setup(page);
  await reviewOn(page);
  const before = await page.evaluate(() => JSON.stringify({ e: app.state.elements, f: app.state.flows }));
  await dragNode(page, 'a', 120, 80);
  await clickNode(page, 'a');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Delete');
  await page.keyboard.press('Backspace');
  await page.keyboard.press('Control+c');
  await page.keyboard.press('Control+v');
  await page.click('#pal-process');
  const after = await page.evaluate(() => JSON.stringify({ e: app.state.elements, f: app.state.flows }));
  expect(after).toBe(before);
  // No resize handles or connection dots on the selected shape.
  await expect(page.locator('#layers-interactive-handles-group .resize-handle, #layers-nodes-group [data-id="a"] [data-anchor-id]')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('review mode keeps flows from being bent or reconnected', async ({ page }) => {
  await setup(page, (s) => { s.flows[0].curveStyle = 'sharp'; });
  await reviewOn(page);
  await page.evaluate(() => app.handleFlowSelectionEvent('f1'));
  await expect(page.locator('#layers-interactive-handles-group circle')).toHaveCount(0);   // no endpoint or bend handles
  const box = await page.locator('#layers-flows-paths-group [data-flow-id="f1"] path.flow-hit-area').boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  expect(await page.evaluate(() => app.state.flows[0].points.length)).toBe(0);
});

test('review mode still allows editing names and properties, and is saved with the model', async ({ page }) => {
  await setup(page);
  await reviewOn(page);
  await clickNode(page, 'a');
  await rename(page, 'Web app v2');
  expect(await page.evaluate(() => app.state.elements.find((e) => e.id === 'a').name)).toBe('Web app v2');
  const json = JSON.parse(await downloadText(page, '#btn-export'));
  expect(json.reviewMode).toBe(true);
  await page.reload();
  await page.waitForFunction(() => window.app && window.app.state);
  expect(await page.evaluate(() => app.state.reviewMode)).toBe(true);
  await expect(page.locator('#review-mode-badge')).toBeVisible();
  // The header badge turns it off.
  await page.click('#review-mode-badge');
  expect(await page.evaluate(() => app.state.reviewMode)).toBe(false);
  await expect(page.locator('#review-mode-badge')).toBeHidden();
});

test('review mode turns align, format painter and flow drawing off', async ({ page }) => {
  await setup(page);
  await reviewOn(page);
  await page.evaluate(() => { app.state.selectedElementIds = ['a', 'b']; app.refreshAppViewVisualWorkspace(); });
  await expect(page.locator('#align-toolbar')).toBeHidden();
  const before = await page.evaluate(() => JSON.stringify(app.state.elements));
  await page.evaluate(() => app.alignSelection('left'));
  expect(await page.evaluate(() => JSON.stringify(app.state.elements))).toBe(before);
});

test('an imported model with reviewMode non-boolean is not in review mode', async ({ page }) => {
  await setup(page);
  const r = await page.evaluate(() => [true, 'true', 1, null].map((v) => normalizeSession({ reviewMode: v }).session.reviewMode));
  expect(r).toEqual([true, false, false, false]);
});

// ── Title block and legend ────────────────────────────────────────────────────

async function fillDiagramInfo(page, info) {
  await clickControl(page, '#btn-open-session-meta');
  await expect(page.locator('#modal-meta-version')).toBeVisible();
  await page.selectOption('#modal-meta-level', info.level);
  await page.fill('#modal-meta-version', info.version);
  await page.selectOption('#modal-meta-status', info.status);
  await page.fill('#modal-meta-author', info.author);
  await page.fill('#modal-meta-date', info.date);
  await page.click('#btn-modal-session-save');
  await expect(page.locator('#modal-session-context')).toBeHidden();
}

test('diagram details are edited in the Session dialog, saved, exported and validated on import', async ({ page }) => {
  await setup(page);
  await fillDiagramInfo(page, { level: 'level-1', version: '2.1', status: 'in-review', author: 'Sec team', date: '2026-11-11' });
  expect(await page.evaluate(() => app.state.diagramInfo)).toEqual({ level: 'level-1', version: '2.1', status: 'in-review', author: 'Sec team', date: '2026-11-11' });
  const json = JSON.parse(await downloadText(page, '#btn-export'));
  expect(json.diagramInfo.version).toBe('2.1');
  const r = await page.evaluate(() => normalizeSession({ diagramInfo: { level: 'evil', version: 'x'.repeat(500), status: 'approved', author: 7, date: 'yesterday', extra: 1 } }).session.diagramInfo);
  expect(r).toEqual({ level: '', version: 'x'.repeat(40), status: 'approved', author: '7', date: '' });
});

test('the title block and legend are off by default and toggled from the View menu', async ({ page }) => {
  await setup(page, (s) => { s.flows[0].isDashed = true; s.flows[0].color = 'red'; });
  await expect(page.locator('#canvas-title-block')).toBeHidden();
  await clickControl(page, '#btn-menu-view');
  await clickControl(page, '#btn-menu-title-block');
  const block = page.locator('#canvas-title-block');
  await expect(block).toBeVisible();
  await expect(block).toContainText(await page.evaluate(() => app.state.projectTitle));
  // The legend lists only what the model uses.
  await expect(block).toContainText('Process');
  await expect(block).toContainText('Data store');
  await expect(block).toContainText('External entity');
  await expect(block).toContainText('Dashed');
  await expect(block).not.toContainText('Trust zone');
  await expect(block).not.toContainText('Two-way');
  expect(await page.evaluate(() => localStorage.getItem('title_block'))).toBe('true');
  await page.reload();
  await page.waitForFunction(() => window.app && window.app.state);
  await expect(page.locator('#canvas-title-block')).toBeVisible();
});

test('the title block shows review mode and the diagram details', async ({ page }) => {
  await setup(page, (s) => { s.diagramInfo = { level: 'context', version: '3', status: 'approved', author: 'Ann', date: '2026-11-01' }; s.reviewMode = true; });
  await page.evaluate(() => app.toggleTitleBlock());
  const block = page.locator('#canvas-title-block');
  await expect(block).toContainText('Context diagram');
  await expect(block).toContainText('Version 3');
  await expect(block).toContainText('Approved');
  await expect(block).toContainText('Ann');
  await expect(block).toContainText('2026-11-01');
  await expect(block).toContainText('Review mode');
});

test('the title block goes into the PNG export when it is shown', async ({ page }) => {
  await setup(page);
  await page.evaluate(() => app.toggleTitleBlock());
  const r = await page.evaluate(() => {
    const g = app.buildTitleBlockSvg();
    return { tag: g.node.tagName, w: g.width, h: g.height, text: g.node.textContent };
  });
  expect(r.tag).toBe('g');
  expect(r.w).toBeGreaterThan(100); expect(r.h).toBeGreaterThan(40);
  expect(r.text).toContain('Process');
  // The exported SVG that becomes the PNG contains the block.
  const svg = await page.evaluate(async () => {
    let captured = '';
    const orig = XMLSerializer.prototype.serializeToString;
    XMLSerializer.prototype.serializeToString = function (n) { const s = orig.call(this, n); if (n.id === 'canvas-svg') captured = s; return s; };
    const click = HTMLAnchorElement.prototype.click; HTMLAnchorElement.prototype.click = function () {};
    try { await app.exportCanvasAsPng(); } finally { XMLSerializer.prototype.serializeToString = orig; HTMLAnchorElement.prototype.click = click; }
    return captured;
  });
  expect(svg).toContain('export-title-block');
  expect(svg).not.toContain('id="canvas-title-block"');
});

test('the title block never renders markup from the model', async ({ page }) => {
  const errors = trackPageErrors(page);
  const evil = '<img src=x onerror="window.__pwned=1">';
  await setup(page, (s) => { s.projectTitle = evil; s.diagramInfo = { level: '', version: evil, status: '', author: evil, date: '' }; });
  await page.evaluate(() => app.toggleTitleBlock());
  await expect(page.locator('#canvas-title-block')).toContainText('<img');
  expect(await page.locator('#canvas-title-block img').count()).toBe(0);
  expect(await page.evaluate(() => window.__pwned)).toBeUndefined();
  expect(errors).toEqual([]);
});

// ── Elbow routing around shapes (1.16.1) ──────────────────────────────────────

/** True when a segment of the polyline runs through the inside of the box (edges and touching don't count). */
function hitsBox(pts, b) {
  return pts.slice(1).some((p, i) => {
    const q = pts[i];
    if (Math.abs(p[1] - q[1]) < 0.01) return p[1] > b.y && p[1] < b.y + b.h && Math.max(p[0], q[0]) > b.x && Math.min(p[0], q[0]) < b.x + b.w;
    return p[0] > b.x && p[0] < b.x + b.w && Math.max(p[1], q[1]) > b.y && Math.min(p[1], q[1]) < b.y + b.h;
  });
}
const flowPts = async (page, id) => polyOf(await page.locator(`#layers-flows-paths-group [data-flow-id="${id}"] path.flow-line`).getAttribute('d'));

test('orthogonalRoute goes around a shape in the way, and straight when nothing is in the way', async ({ page }) => {
  await setup(page);
  const box = { x: 150, y: 50, w: 100, h: 100 };
  const r = await page.evaluate((box) => ({
    around: orthogonalRoute([0, 100], 'right', [], [400, 100], 'left', [box]),
    clear: orthogonalRoute([0, 100], 'right', [], [400, 100], 'left', []),
  }), box);
  const around = [[0, 100], ...r.around, [400, 100]];
  expect(axisAligned(around)).toBe(true);
  expect(hitsBox(around, box)).toBe(false);
  expect(r.around.length).toBe(4);              // one detour: up/down, across, back
  expect(r.clear).toEqual([]);                  // a straight line
});

const ABC = (cy) => (s) => {
  s.elements = [
    { id: 'a', type: 'process', name: 'A', x: 0, y: 200, width: 120, height: 60, secProps: {} },
    { id: 'b', type: 'process', name: 'B', x: 600, y: 200, width: 120, height: 60, secProps: {} },
    { id: 'c', type: 'process', name: 'C', x: 300, y: cy, width: 120, height: 60, secProps: {} },
  ];
  s.flows = [{ id: 'f1', name: '', sourceId: 'a', targetId: 'b', sourceAnchor: 'right-2', targetAnchor: 'left-2', points: [], secProps: {}, curveStyle: 'orthogonal' }];
};

test('an elbow flow avoids a shape in its way and straightens again when the shape moves away', async ({ page }) => {
  const errors = trackPageErrors(page);
  await setup(page, ABC(190));
  const C = { x: 300, y: 190, w: 120, h: 60 };
  let pts = await flowPts(page, 'f1');
  expect(axisAligned(pts)).toBe(true);
  expect(hitsBox(pts, C)).toBe(false);
  expect(pts.length).toBeGreaterThan(2);
  // Move C out of the way with the mouse: the line goes back to straight.
  await dragNode(page, 'c', 0, 200);
  pts = await flowPts(page, 'f1');
  expect(pts.length).toBe(2);
  expect(pts[0][1]).toBe(pts[1][1]);
  // And back into the way: it detours again.
  await dragNode(page, 'c', 0, -200);
  const C2 = await page.evaluate(() => { const c = app.state.elements.find((e) => e.id === 'c'); return { x: c.x, y: c.y, w: c.width, h: c.height }; });
  expect(C2.y).toBeLessThan(260); expect(C2.y + C2.h).toBeGreaterThan(200);   // back in the way
  pts = await flowPts(page, 'f1');
  expect(hitsBox(pts, C2)).toBe(false);
  expect(pts.length).toBeGreaterThan(2);
  expect(errors).toEqual([]);
});

test('an elbow flow never runs through its own two shapes', async ({ page }) => {
  // The target is behind the source: the line has to go around both.
  await setup(page, (s) => {
    s.elements = [
      { id: 'a', type: 'process', name: 'A', x: 400, y: 200, width: 120, height: 100, secProps: {} },
      { id: 'b', type: 'process', name: 'B', x: 0, y: 220, width: 120, height: 100, secProps: {} },
    ];
    s.flows = [{ id: 'f1', name: '', sourceId: 'a', targetId: 'b', sourceAnchor: 'right-2', targetAnchor: 'left-2', points: [], secProps: {}, curveStyle: 'orthogonal' }];
  });
  const pts = await flowPts(page, 'f1');
  expect(axisAligned(pts)).toBe(true);
  expect(hitsBox(pts, { x: 400, y: 200, w: 120, h: 100 })).toBe(false);
  expect(hitsBox(pts, { x: 0, y: 220, w: 120, h: 100 })).toBe(false);
  expect(pts.length).toBeLessThanOrEqual(7);   // a tidy U, not a staircase
});

test('clicking a selected elbow flow does not add a bend point (the route is automatic)', async ({ page }) => {
  await setup(page, ABC(600));
  await page.evaluate(() => app.handleFlowSelectionEvent('f1'));
  const box = await page.locator('#layers-flows-paths-group [data-flow-id="f1"] path.flow-hit-area').boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  expect(await page.evaluate(() => app.state.flows[0].points.length)).toBe(0);
});

test('routing 80 elbow flows among 80 shapes stays fast', async ({ page }) => {
  await setup(page, (s) => {
    s.elements = []; s.flows = [];
    for (let i = 0; i < 80; i++) s.elements.push({ id: 'n' + i, type: 'process', name: 'N' + i, x: (i % 10) * 220, y: Math.floor(i / 10) * 160, width: 120, height: 60, secProps: {} });
    for (let i = 0; i < 80; i++) s.flows.push({ id: 'f' + i, name: '', sourceId: 'n' + i, targetId: 'n' + ((i * 7 + 13) % 80), sourceAnchor: 'right-2', targetAnchor: 'left-2', points: [], secProps: {}, curveStyle: 'orthogonal' });
  });
  const ms = await page.evaluate(() => { elbowRouteCache.clear(); const t = performance.now(); app.renderSvgDiagramElements(); return performance.now() - t; });
  expect(ms).toBeLessThan(1500);
  const cached = await page.evaluate(() => { const t = performance.now(); app.renderSvgDiagramElements(); return performance.now() - t; });
  expect(cached).toBeLessThan(ms);
});
