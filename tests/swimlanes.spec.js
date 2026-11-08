// Swimlanes: nodes drop into the cell under them (real column/row sizes), cells grow around their nodes with
// padding, and nodes in later cells move along when an earlier cell grows.
const { test } = require('@playwright/test');
const { expect, openApp, demoSession } = require('./helpers');

const PAD = 30;
function model() {
  return demoSession((s) => {
    s.elements = [
      { id: 'lane', type: 'swimlane', name: 'Lanes', x: 0, y: 0, width: 760, height: 515, columns: ['Team A', 'Team B'], rows: ['Plan', 'Do'] },
      { id: 'a', type: 'fc_process', name: 'A', x: 0, y: 700, width: 160, height: 60 },
      { id: 'b', type: 'fc_process', name: 'B', x: 200, y: 700, width: 160, height: 60 },
      { id: 'c', type: 'fc_process', name: 'C', x: 400, y: 700, width: 160, height: 60 },
      { id: 'd', type: 'fc_process', name: 'D', x: 600, y: 700, width: 160, height: 60 },
    ];
    s.flows = []; s.threats = [];
  });
}

async function setup(page) {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await openApp(page, { session: model() });
  await page.evaluate(() => { app.zoomScale = 0.6; app.panX = 40; app.panY = 40; app.applySvgViewportTransformations(); });
}
const toScreen = (page, x, y) => page.evaluate(([cx, cy]) => {
  const m = document.getElementById('layers-nodes-group').getScreenCTM();
  return { x: cx * m.a + cy * m.c + m.e, y: cx * m.b + cy * m.d + m.f };
}, [x, y]);
const node = (page, id) => page.evaluate((i) => { const e = app.state.elements.find((x) => x.id === i); return { x: e.x, y: e.y, w: e.width, h: e.height }; }, id);
// Grid computed from the stored sizes (title 40 px, column headers 35 px, row headers 120 px).
const lane = (page) => page.evaluate(() => {
  const s = app.state.elements.find((x) => x.id === 'lane');
  const colWidths = s.colWidths || s.columns.map(() => 320), rowHeights = s.rowHeights || s.rows.map(() => 220);
  const starts = (x0, sizes) => sizes.map((_, i) => x0 + sizes.slice(0, i).reduce((a, b) => a + b, 0));
  return { cells: s.cellAssignments || [], colWidths, rowHeights, colStarts: starts(s.x + 120, colWidths), rowStarts: starts(s.y + 75, rowHeights) };
});

/** Drags node `id` so that its centre ends at canvas point (x, y); checks the highlight while hovering. */
async function dragTo(page, id, x, y) {
  const n = await node(page, id);
  const from = await toScreen(page, n.x + n.w / 2, n.y + n.h / 2);
  const to = await toScreen(page, x, y);
  await page.mouse.move(from.x, from.y); await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(from.x + (to.x - from.x) * i / 8, from.y + (to.y - from.y) * i / 8);
  await page.waitForTimeout(50);
  const hl = page.locator('.swimlane-drop-highlight');
  const highlight = (await hl.count()) ? await hl.first().getAttribute('data-cell') : null;
  await page.mouse.up();
  return highlight;
}
const cellOf = (cells, id) => { const a = cells.find((x) => x.id === id); return a ? `${a.r}:${a.c}` : null; };

test('three nodes dropped into one cell all stay there; the cell grows with padding and the target is highlighted', async ({ page }) => {
  await setup(page);
  let g = await lane(page);
  // Cell "Plan / Team A" starts at the grid's first column/row.
  const cx = g.colStarts[0] + 100, top = g.rowStarts[0];
  expect(await dragTo(page, 'a', cx, top + 70)).toBe('0:0');
  await expect(page.locator('.swimlane-drop-highlight')).toHaveCount(0);   // gone after the drop
  // Each next node goes just below the previous one, near the bottom edge of the (grown) cell.
  for (const id of ['b', 'c']) {
    g = await lane(page);
    const bottom = g.rowStarts[0] + g.rowHeights[0];
    expect(await dragTo(page, id, cx, bottom - 25)).toBe('0:0');
  }
  g = await lane(page);
  expect(['a', 'b', 'c'].map((id) => cellOf(g.cells, id))).toEqual(['0:0', '0:0', '0:0']);
  // Every node keeps at least the padding to the borders of its cell.
  for (const id of ['a', 'b', 'c']) {
    const n = await node(page, id);
    expect(n.x - g.colStarts[0]).toBeGreaterThanOrEqual(PAD);
    expect(n.y - g.rowStarts[0]).toBeGreaterThanOrEqual(PAD);
    expect(g.colStarts[0] + g.colWidths[0] - (n.x + n.w)).toBeGreaterThanOrEqual(PAD);
    expect(g.rowStarts[0] + g.rowHeights[0] - (n.y + n.h)).toBeGreaterThanOrEqual(PAD);
  }
  expect(g.rowHeights[0]).toBeGreaterThan(220);   // grew beyond the minimum to hold three nodes
});

test('nodes in later rows and columns move along when an earlier cell grows, and stay in their cell', async ({ page }) => {
  await setup(page);
  let g = await lane(page);
  await dragTo(page, 'd', g.colStarts[1] + 120, g.rowStarts[1] + 80);     // "Do / Team B"
  await dragTo(page, 'a', g.colStarts[0] + 120, g.rowStarts[0] + 80);     // "Plan / Team A"
  const before = await node(page, 'd');
  // Make cell 0:0 much bigger by dropping a node at its far right / bottom edge.
  g = await lane(page);
  await dragTo(page, 'b', g.colStarts[0] + g.colWidths[0] - 30, g.rowStarts[0] + g.rowHeights[0] - 20);
  g = await lane(page);
  expect(cellOf(g.cells, 'b')).toBe('0:0');
  expect(cellOf(g.cells, 'd')).toBe('1:1');
  const after = await node(page, 'd');
  expect(after.x).toBeGreaterThan(before.x);
  expect(after.y).toBeGreaterThan(before.y);
  // Layout is stable: rendering again moves nothing.
  const snap = await page.evaluate(() => JSON.stringify(app.state.elements.map((e) => [e.id, e.x, e.y, e.width, e.height])));
  await page.evaluate(() => app.renderSvgDiagramElements());
  expect(await page.evaluate(() => JSON.stringify(app.state.elements.map((e) => [e.id, e.x, e.y, e.width, e.height])))).toBe(snap);
});

test('moving a swimlane carries its nodes; deleting a column drops its stored width', async ({ page }) => {
  await setup(page);
  let g = await lane(page);
  await dragTo(page, 'a', g.colStarts[1] + 120, g.rowStarts[0] + 80);
  const before = await node(page, 'a');
  // Drag the swimlane by its title bar.
  const from = await toScreen(page, 300, 20), to = await toScreen(page, 400, 80);
  await page.mouse.move(from.x, from.y); await page.mouse.down();
  for (let i = 1; i <= 5; i++) await page.mouse.move(from.x + (to.x - from.x) * i / 5, from.y + (to.y - from.y) * i / 5);
  await page.mouse.up();
  const after = await node(page, 'a');
  expect([after.x - before.x, after.y - before.y]).toEqual([100, 60]);
  g = await lane(page);
  expect(cellOf(g.cells, 'a')).toBe('0:1');

  await page.evaluate(() => { const s = app.state.elements.find((x) => x.id === 'lane'); s.colWidths = [500, 320]; app.state.selectedElementIds = ['lane']; app.refreshAppViewVisualWorkspace(); });
  await page.locator('.col-delete-btn[data-index="0"]').click();
  const s = await page.evaluate(() => { const l = app.state.elements.find((x) => x.id === 'lane'); return { cols: l.columns, widths: l.colWidths }; });
  expect(s.cols).toEqual(['Team B']);
  expect(s.widths[0]).toBeLessThan(500);
});

/** Drags the resize handle of column/row `index` by (dx, dy) canvas units. */
async function dragHandle(page, axis, index, dx, dy) {
  const box = await page.locator(`.swimlane-resize-${axis}[data-index="${index}"]`).boundingBox();
  // Grab the handle away from the other axis' handles (rows: near the left; columns: in the middle).
  const sx = axis === 'col' ? box.x + box.width / 2 : box.x + 60, sy = axis === 'col' ? box.y + box.height / 2 : box.y + box.height / 2;
  const scale = await page.evaluate(() => app.zoomScale);
  await page.mouse.move(sx, sy); await page.mouse.down();
  for (let i = 1; i <= 6; i++) await page.mouse.move(sx + dx * scale * i / 6, sy + dy * scale * i / 6);
  await page.mouse.up();
}

test('dragging a column border resizes it; later nodes move along; one undo step reverts it', async ({ page }) => {
  await setup(page);
  let g = await lane(page);
  await dragTo(page, 'd', g.colStarts[1] + 120, g.rowStarts[0] + 80);    // "Plan / Team B"
  const before = await node(page, 'd');
  const w0 = (await lane(page)).colWidths[0];
  await dragHandle(page, 'col', 0, 200, 0);
  g = await lane(page);
  expect(g.colWidths[0]).toBe(w0 + 200);
  expect((await node(page, 'd')).x).toBe(before.x + 200);                // moved with its cell
  expect(cellOf(g.cells, 'd')).toBe('0:1');
  expect(await page.evaluate(() => app.state.elements.find((x) => x.id === 'lane').colMins[0])).toBe(w0 + 200);
  await page.click('#btn-undo');
  g = await lane(page);
  expect(g.colWidths[0]).toBe(w0);
  expect((await node(page, 'd')).x).toBe(before.x);
});

test('a row can be made smaller than the default, but never smaller than its nodes need', async ({ page }) => {
  await setup(page);
  // Empty row 1 ("Do"): shrink it well below the default height.
  const h1 = (await lane(page)).rowHeights[1];
  await dragHandle(page, 'row', 1, 0, -100);
  expect((await lane(page)).rowHeights[1]).toBe(h1 - 100);
  // Row 0 holds a node: shrinking it hard stops at node height + padding.
  let g = await lane(page);
  await dragTo(page, 'a', g.colStarts[0] + 120, g.rowStarts[0] + 40);
  await dragHandle(page, 'row', 0, 0, -400);
  g = await lane(page);
  const a = await node(page, 'a');
  expect(g.rowHeights[0]).toBeGreaterThanOrEqual(a.h + 2 * PAD);
  expect(g.rowStarts[0] + g.rowHeights[0] - (a.y + a.h)).toBeGreaterThanOrEqual(PAD);
  expect(cellOf(g.cells, 'a')).toBe('0:0');
  // Double-click returns the row to its automatic size.
  await page.locator('.swimlane-resize-row[data-index="1"]').dblclick({ position: { x: 60, y: 5 } });
  expect((await lane(page)).rowHeights[1]).toBe(220);
});

test('imported manual sizes are sanitised', async ({ page }) => {
  await openApp(page, { session: demoSession((s) => {
    s.elements = [{ id: 'lane', type: 'swimlane', name: 'L', x: 0, y: 0, columns: ['A', 'B', 'C'], rows: ['R'], colMins: [5, 'x', 99999], rowMins: '<b>' }];
    s.flows = []; s.threats = [];
  }) });
  const l = await page.evaluate(() => { const e = app.state.elements.find((x) => x.id === 'lane'); return { colMins: e.colMins, rowMins: e.rowMins, colWidths: e.colWidths }; });
  expect(l.colMins).toEqual([100, 0, 5000]);
  expect(l.rowMins).toBeUndefined();
  expect(l.colWidths).toEqual([100, 320, 5000]);
});

test('swimlane colour themes: picker, colours, dark canvas, undo, sanitised import', async ({ page }) => {
  await setup(page);
  const fill = (sel) => page.evaluate((s) => getComputedStyle(document.querySelector(`[data-id="lane"] ${s}`)).fill, sel);
  const defaultTitle = await fill('.swimlane-title-bg');
  await page.evaluate(() => { app.state.selectedElementIds = ['lane']; app.refreshAppViewVisualWorkspace(); });
  const swatches = page.locator('#props-swimlane-theme .swimlane-theme-swatch');
  expect(await swatches.count()).toBe(13);                                   // default + 6 colours x 2
  await expect(swatches.first()).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#props-swimlane-theme [data-theme="green-strong"]').click();
  expect(await page.evaluate(() => app.state.elements.find((x) => x.id === 'lane').theme)).toBe('green-strong');
  await expect.poll(() => fill('.swimlane-title-bg')).toBe('rgb(88, 106, 93)');          // #586a5d
  await expect.poll(() => fill('.swimlane-bg')).toBe('rgb(222, 227, 223)');             // #dee3df
  await expect(page.locator('#props-swimlane-theme [data-theme="green-strong"]')).toHaveAttribute('aria-pressed', 'true');
  // A chosen theme keeps its colours on the dark canvas; the default one switches to dark.
  await page.evaluate(() => { app.canvasTheme = 'dark'; app.applyCanvasTheme(); });
  await expect.poll(() => fill('.swimlane-title-bg')).toBe('rgb(88, 106, 93)');
  await page.click('#btn-undo');
  expect(await page.evaluate(() => app.state.elements.find((x) => x.id === 'lane').theme || '')).toBe('');
  await expect.poll(() => fill('.swimlane-title-bg')).toBe('rgb(30, 41, 59)');          // dark default #1e293b
  await page.evaluate(() => { app.canvasTheme = 'light'; app.applyCanvasTheme(); });
  await expect.poll(() => fill('.swimlane-title-bg')).toBe(defaultTitle);
});

test('an unknown imported swimlane theme falls back to the default', async ({ page }) => {
  await openApp(page, { session: demoSession((s) => {
    s.elements = [
      { id: 'l1', type: 'swimlane', name: 'A', x: 0, y: 0, columns: ['A'], rows: ['R'], theme: 'red' },
      { id: 'l2', type: 'swimlane', name: 'B', x: 0, y: 600, columns: ['A'], rows: ['R'], theme: 'x" onload="alert(1)' },
    ];
    s.flows = []; s.threats = [];
  }) });
  const t = await page.evaluate(() => app.state.elements.map((e) => e.theme));
  expect(t).toEqual(['red', '']);
  await expect(page.locator('[data-id="l1"].sl-theme-red')).toHaveCount(1);
  expect(await page.locator('[data-id="l2"]').getAttribute('class')).not.toContain('sl-theme');
});
