// Table (Text Items) and the swimlane-family containers (Flowchart Diagram Items): pool, vertical lanes,
// group / frame and phases. None of them is a model component; all use the swimlane colour themes.
const { test } = require('@playwright/test');
const { expect, openApp, demoSession, importJson, downloadText } = require('./helpers');

const LANE_TYPES = ['pool', 'vlanes', 'group_frame', 'phases'];

function emptyModel(mutate) {
  return demoSession((s) => { s.elements = []; s.flows = []; s.threats = []; if (mutate) mutate(s); });
}
async function setup(page, mutate) {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await openApp(page, { session: emptyModel(mutate) });
}
const openSection = async (page, id) => {
  const btn = page.locator(`[data-bs-target="#${id}"]`);
  if ((await btn.getAttribute('aria-expanded')) !== 'true') await btn.click();
  await expect(page.locator(`#${id}`)).toHaveClass(/show/);
};
const el = (page, id) => page.evaluate((i) => JSON.parse(JSON.stringify(app.state.elements.find((e) => e.id === i) || null)), id);
const only = (page, type) => page.evaluate((t) => JSON.parse(JSON.stringify(app.state.elements.filter((e) => e.type === t))), type);
const select = (page, id) => page.evaluate((i) => { app.state.selectedElementIds = [i]; app.state.selectedFlowId = null; app.refreshAppViewVisualWorkspace(); }, id);

function tableModel(s) {
  s.elements.push({ id: 'tb', type: 'table', name: 'Assets', x: 100, y: 100, width: 360, height: 150, headerRow: true, headerCol: false, theme: 'blue-strong',
    cells: [['Asset', 'Owner', 'Tier'], ['DB', 'Ops', '1'], ['API', 'Dev', '2']] });
}

test('palette: the table sits at the end of Text Items; lane containers follow the swimlane; click and drag add each', async ({ page }) => {
  await setup(page);
  await openSection(page, 'collapseTextItems');
  const textIds = await page.locator('#collapseTextItems .palette-item').evaluateAll((els) => els.map((e) => e.id));
  expect(textIds[textIds.length - 1]).toBe('pal-table');
  await page.click('#pal-table');
  let tables = await only(page, 'table');
  expect(tables).toHaveLength(1);
  expect(tables[0].cells.length).toBeGreaterThanOrEqual(2);
  expect(tables[0].headerRow).toBe(true);
  await expect(page.locator('#layers-nodes-group g.tt-table-group')).toHaveCount(1);

  await openSection(page, 'collapseFlowchart');
  const fcIds = await page.locator('#collapseFlowchart .palette-item').evaluateAll((els) => els.map((e) => e.id));
  const at = fcIds.indexOf('pal-swimlane');
  expect(fcIds.slice(at, at + 5)).toEqual(['pal-swimlane', 'pal-pool', 'pal-vlanes', 'pal-group-frame', 'pal-phases']);
  for (const t of LANE_TYPES) {
    await page.click(`#pal-${t.replace('_', '-')}`);
    expect(await only(page, t)).toHaveLength(1);
  }
  await expect(page.locator('#layers-swimlanes-group g.tt-lane-group')).toHaveCount(4);

  // Drag and drop onto the canvas adds one where it is dropped; keyboard Enter also adds.
  await page.dragAndDrop('#pal-table', '#canvas-svg', { targetPosition: { x: 400, y: 300 } });
  expect(await only(page, 'table')).toHaveLength(2);
  await page.locator('#pal-phases').focus();
  await page.keyboard.press('Enter');
  expect(await only(page, 'phases')).toHaveLength(2);
  // Every new item has a hover popover like its neighbours.
  for (const id of ['pal-table', 'pal-pool', 'pal-vlanes', 'pal-group-frame', 'pal-phases']) {
    await expect(page.locator(`#${id} + .palette-popover-panel`)).toHaveCount(1);
  }
});

test('table: rows, columns, cells, header toggles, theme; each edit is one logged undo step', async ({ page }) => {
  await setup(page, tableModel);
  await select(page, 'tb');
  await expect(page.locator('#box-props-table')).toBeVisible();
  await expect(page.locator('#props-table-cells input.tt-table-cell-input')).toHaveCount(9);
  const logLen = () => page.evaluate(() => app.state.activityLog.length);
  const before = await logLen();

  await page.click('#props-table-add-row');
  expect((await el(page, 'tb')).cells).toHaveLength(4);
  expect((await el(page, 'tb')).cells[3]).toEqual(['', '', '']);
  await page.click('#props-table-add-col');
  expect((await el(page, 'tb')).cells.every((r) => r.length === 4)).toBe(true);
  await expect(page.locator('#layers-nodes-group [data-id="tb"] .tt-table-cell')).toHaveCount(16);

  await page.locator('#props-table-cells input[data-r="1"][data-c="0"]').fill('Database');
  await page.locator('#props-table-cells input[data-r="1"][data-c="0"]').press('Tab');
  expect((await el(page, 'tb')).cells[1][0]).toBe('Database');
  await expect(page.locator('[data-id="tb"] .tt-table-text', { hasText: 'Database' })).toHaveCount(1);

  await page.click('#props-table-header-col');
  expect((await el(page, 'tb')).headerCol).toBe(true);
  await expect(page.locator('[data-id="tb"] .tt-table-cell.tt-table-rowhead')).toHaveCount(3);   // rows 1..3 of column 0
  await page.click('#props-table-header-row');
  expect((await el(page, 'tb')).headerRow).toBe(false);
  await expect(page.locator('[data-id="tb"] .tt-table-cell.tt-table-head')).toHaveCount(0);

  await page.locator('#props-table-theme [data-theme="red"]').click();
  expect((await el(page, 'tb')).theme).toBe('red');
  await expect(page.locator('[data-id="tb"].sl-theme-red')).toHaveCount(1);
  const bodyFill = await page.evaluate(() => getComputedStyle(document.querySelector('[data-id="tb"] .tt-table-cell:not(.tt-table-head):not(.tt-table-rowhead)')).fill);
  expect(bodyFill).toBe('rgb(246, 244, 244)');   // --sl-bg of the red theme (#f6f4f4)

  await page.locator('#props-table-title').fill('Crown jewels');
  await page.locator('#props-table-title').press('Enter');
  expect((await el(page, 'tb')).name).toBe('Crown jewels');
  await expect(page.locator('[data-id="tb"] .tt-table-title', { hasText: 'Crown jewels' })).toHaveCount(1);

  await page.click('#props-table-remove-col');
  await page.click('#props-table-remove-row');
  const t = await el(page, 'tb');
  expect([t.cells.length, t.cells[0].length]).toEqual([3, 3]);
  expect((await logLen()) - before).toBe(9);   // 9 edits, 9 log entries

  // Undo walks back one edit at a time.
  await page.click('#btn-undo');
  expect((await el(page, 'tb')).cells).toHaveLength(4);
  await page.click('#btn-undo');
  expect((await el(page, 'tb')).cells[0]).toHaveLength(4);
  await page.click('#btn-undo');
  expect((await el(page, 'tb')).name).toBe('Assets');
  await page.click('#btn-undo');
  expect((await el(page, 'tb')).theme).toBe('blue-strong');

  // At least one row and column always remain.
  await page.evaluate(() => { const e = app.state.elements.find((x) => x.id === 'tb'); e.cells = [['only']]; app.refreshAppViewVisualWorkspace(); });
  await expect(page.locator('#props-table-remove-row')).toBeDisabled();
  await expect(page.locator('#props-table-remove-col')).toBeDisabled();
});

test('table: double-clicking a cell focuses its input; corner resize keeps a minimum size', async ({ page }) => {
  await setup(page, tableModel);
  await select(page, 'tb');
  await page.locator('[data-id="tb"] .tt-table-cell[data-cell="2:1"]').dblclick();
  await expect(page.locator('#props-table-cells input[data-r="2"][data-c="1"]')).toBeFocused();
  const handle = page.locator('[data-id="tb"] .canvas-resize-handle');
  await expect(handle).toHaveCount(1);
  const box = await handle.boundingBox();
  await page.mouse.move(box.x + 5, box.y + 5); await page.mouse.down();
  await page.mouse.move(box.x - 600, box.y - 400, { steps: 6 }); await page.mouse.up();
  const t = await el(page, 'tb');
  expect(t.width).toBeGreaterThanOrEqual(3 * 40);
  expect(t.height).toBeGreaterThanOrEqual(3 * 20);
});

test('lane containers: rename, add and remove lanes, theme; drawn behind shapes; carry their contents', async ({ page }) => {
  await setup(page, (s) => {
    s.elements.push({ id: 'pl', type: 'pool', name: 'Order process', x: 0, y: 0, width: 800, height: 400, lanes: ['Customer', 'Shop'], theme: 'green' });
    s.elements.push({ id: 'vl', type: 'vlanes', name: 'Teams', x: 0, y: 600, width: 600, height: 300, lanes: ['A', 'B', 'C'] });
    s.elements.push({ id: 'gf', type: 'group_frame', name: 'Payments', x: 1000, y: 0, width: 400, height: 300 });
    s.elements.push({ id: 'ph', type: 'phases', name: 'Roadmap', x: 1000, y: 600, width: 600, height: 300, lanes: ['Plan', 'Build', 'Run'] });
    s.elements.push({ id: 'n1', type: 'fc_process', name: 'Inside', x: 1100, y: 100, width: 160, height: 60 });
  });
  // Behind shapes: the containers live in the swimlane layer, which comes before the nodes layer.
  const order = await page.evaluate(() => {
    const lanes = document.getElementById('layers-swimlanes-group'), nodes = document.getElementById('layers-nodes-group');
    return { inLanes: ['pl', 'vl', 'gf', 'ph'].every((i) => lanes.querySelector(`[data-id="${i}"]`)), before: !!(lanes.compareDocumentPosition(nodes) & Node.DOCUMENT_POSITION_FOLLOWING) };
  });
  expect(order).toEqual({ inLanes: true, before: true });
  await expect(page.locator('[data-id="ph"] .tt-phase-chevron')).toHaveCount(3);
  await expect(page.locator('[data-id="pl"] .tt-lane-title-band')).toHaveCount(1);
  await expect(page.locator('[data-id="pl"].sl-theme-green')).toHaveCount(1);

  await select(page, 'pl');
  await expect(page.locator('#box-props-lanes')).toBeVisible();
  await expect(page.locator('#props-lanes-list .tt-lane-rename-input')).toHaveCount(2);
  await page.click('#props-lanes-add');
  expect((await el(page, 'pl')).lanes).toHaveLength(3);
  await page.locator('#props-lanes-list .tt-lane-rename-input').nth(2).fill('Warehouse');
  await page.locator('#props-lanes-list .tt-lane-rename-input').nth(2).press('Enter');
  expect((await el(page, 'pl')).lanes[2]).toBe('Warehouse');
  await page.locator('#props-lanes-list .tt-lane-delete-btn').first().click();
  expect((await el(page, 'pl')).lanes).toEqual(['Shop', 'Warehouse']);
  await page.locator('#props-lanes-theme [data-theme="black-strong"]').click();
  expect((await el(page, 'pl')).theme).toBe('black-strong');
  await page.click('#btn-undo');
  expect((await el(page, 'pl')).theme).toBe('green');
  await page.click('#btn-undo');
  expect((await el(page, 'pl')).lanes).toEqual(['Customer', 'Shop', 'Warehouse']);

  // The group frame has no lanes to edit.
  await select(page, 'gf');
  await expect(page.locator('#props-lanes-lanes-box')).toBeHidden();

  // Moving a container carries the shapes whose centre is inside it.
  await page.evaluate(() => { app.zoomScale = 0.5; app.panX = 20; app.panY = 20; app.applySvgViewportTransformations(); });
  const title = page.locator('[data-id="gf"] .tt-lane-title-band');
  const b = await title.boundingBox();
  await page.mouse.move(b.x + 40, b.y + 5); await page.mouse.down();
  await page.mouse.move(b.x + 140, b.y + 5, { steps: 5 }); await page.mouse.up();
  const gf = await el(page, 'gf'), n1 = await el(page, 'n1');
  expect(gf.x).toBeGreaterThan(1000);
  expect(n1.x - gf.x).toBe(100);
});

test('table and lanes survive reload, JSON export and import', async ({ page }) => {
  await setup(page, (s) => {
    tableModel(s);
    s.elements.push({ id: 'ph', type: 'phases', name: 'Roadmap', x: 1000, y: 600, width: 600, height: 300, lanes: ['Plan', 'Build'], theme: 'yellow' });
  });
  await page.evaluate(() => app.saveSessionToLocalStorage());
  await page.reload();
  await page.waitForFunction(() => window.app && window.app.state);
  const pick = (e) => e && { type: e.type, name: e.name, cells: e.cells, headerRow: e.headerRow, headerCol: e.headerCol, theme: e.theme, lanes: e.lanes, width: e.width, height: e.height };
  expect(pick(await el(page, 'tb'))).toEqual({ type: 'table', name: 'Assets', cells: [['Asset', 'Owner', 'Tier'], ['DB', 'Ops', '1'], ['API', 'Dev', '2']], headerRow: true, headerCol: false, theme: 'blue-strong', lanes: undefined, width: 360, height: 150 });
  expect((await el(page, 'ph')).lanes).toEqual(['Plan', 'Build']);
  const json = await downloadText(page, '#btn-export');
  await page.evaluate(() => { app.state.elements = []; app.refreshAppViewVisualWorkspace(); });
  await importJson(page, json);
  expect(pick(await el(page, 'tb')).cells[2]).toEqual(['API', 'Dev', '2']);
  expect((await el(page, 'ph')).theme).toBe('yellow');
  await expect(page.locator('[data-id="tb"] .tt-table-text', { hasText: 'Owner' })).toHaveCount(1);
});

test('the normaliser clamps tables and lanes and rejects bad cells, themes and lane names', async ({ page }) => {
  const huge = Array.from({ length: 50 }, (_, r) => Array.from({ length: 20 }, (_, c) => `${r}:${c}`));
  await setup(page, (s) => {
    s.elements.push({ id: 't1', type: 'table', name: 7, x: 0, y: 0, cells: huge, headerRow: 'yes', headerCol: 1, theme: 'x" onload="alert(1)' });
    s.elements.push({ id: 't2', type: 'table', name: 'Ragged', x: 0, y: 0, cells: [['a'], ['b', 'c', { evil: 1 }], 'not a row', [null, 5, 'x'.repeat(900)]] });
    s.elements.push({ id: 't3', type: 'table', name: 'Empty', x: 0, y: 0, cells: 'nope' });
    s.elements.push({ id: 'p1', type: 'pool', name: 'P', x: 0, y: 0, lanes: Array.from({ length: 40 }, (_, i) => i), theme: 'purple' });
    s.elements.push({ id: 'p2', type: 'phases', name: 'Q', x: 0, y: 0, lanes: 'bad' });
  });
  const t1 = await el(page, 't1');
  expect(t1.cells.length).toBe(30);
  expect(t1.cells.every((r) => r.length === 12)).toBe(true);
  expect(t1.headerRow).toBe(false);   // only real booleans count
  expect(t1.headerCol).toBe(false);
  expect(t1.theme).toBe('');
  expect(t1.name).toBe('7');
  const t2 = await el(page, 't2');
  expect(t2.cells.length).toBe(3);          // the non-array row is dropped
  expect(t2.cells.every((r) => r.length === 3)).toBe(true);   // padded to the widest row
  expect(t2.cells[1][2]).toBe('');          // objects are not text
  expect(t2.cells[2][0]).toBe('');
  expect(t2.cells[2][1]).toBe('5');
  expect(t2.cells[2][2]).toHaveLength(500);
  expect((await el(page, 't3')).cells).toEqual([['']]);
  const p1 = await el(page, 'p1');
  expect(p1.lanes).toHaveLength(20);
  expect(p1.lanes[3]).toBe('3');
  expect(p1.theme).toBe('');
  expect((await el(page, 'p2')).lanes.length).toBeGreaterThanOrEqual(1);
});

test('tables and lane containers get no threats, suggestions, Insights coverage or attack paths', async ({ page }) => {
  await setup(page, (s) => {
    tableModel(s);
    s.elements.push({ id: 'gf', type: 'group_frame', name: 'Frame', x: 600, y: 0, width: 300, height: 200 });
    s.elements.push({ id: 'p', type: 'process', name: 'Web', x: 1200, y: 0, width: 240, height: 80, secProps: {} });
  });
  const r = await page.evaluate(() => {
    const comp = ['tb', 'gf'].map((id) => MODEL_COMPONENT_TYPES.has(app.state.elements.find((e) => e.id === id).type));
    app.state.selectedElementIds = ['tb']; app.refreshAppViewVisualWorkspace();
    const suggestHidden = document.getElementById('suggest-view-content') ? document.getElementById('suggest-view-content').classList.contains('d-none') : true;
    app.repopulateThreatModalDropdownTargets();
    const options = [...document.querySelectorAll('#modal-threat-link-element option')].map((o) => o.value);
    return { comp, suggestHidden, options };
  });
  expect(r.comp).toEqual([false, false]);
  expect(r.suggestHidden).toBe(true);
  expect(r.options).not.toContain('tb');
  expect(r.options).not.toContain('gf');
  expect(r.options).toContain('p');
  // Mermaid export leaves them out.
  const mmd = await downloadText(page, '#btn-export-mermaid');
  expect(mmd).toContain('Web');
  expect(mmd).not.toContain('Assets');
  expect(mmd).not.toContain('Frame');
});

test('review mode blocks table and lane edits', async ({ page }) => {
  await setup(page, (s) => {
    tableModel(s);
    s.elements.push({ id: 'pl', type: 'pool', name: 'P', x: 0, y: 600, width: 800, height: 300, lanes: ['A', 'B'] });
  });
  await select(page, 'tb');
  await page.evaluate(() => app.toggleReviewMode(true));
  await select(page, 'tb');
  for (const id of ['#props-table-add-row', '#props-table-remove-row', '#props-table-add-col', '#props-table-remove-col', '#props-table-header-row', '#props-table-header-col']) {
    await expect(page.locator(id)).toBeDisabled();
  }
  const blocked = await page.evaluate(() => { app.ttTableEdit('tb', 'add-row'); return app.state.elements.find((e) => e.id === 'tb').cells.length; });
  expect(blocked).toBe(3);
  await select(page, 'pl');
  await expect(page.locator('#props-lanes-add')).toBeDisabled();
  await expect(page.locator('#props-lanes-list .tt-lane-delete-btn').first()).toBeDisabled();
});

test('exports include tables and lanes; dark canvas and isometric views render them', async ({ page }) => {
  await setup(page, (s) => {
    tableModel(s);
    s.elements.push({ id: 'vl', type: 'vlanes', name: 'Teams', x: 600, y: 0, width: 600, height: 300, lanes: ['Red team', 'Blue team'] });
  });
  const svgText = await page.evaluate(async () => {
    let captured = '';
    const orig = XMLSerializer.prototype.serializeToString;
    XMLSerializer.prototype.serializeToString = function (n) { const s = orig.call(this, n); if (n && n.id === 'canvas-svg') captured = s; return s; };
    app.downloadBlob = () => {};
    const click = HTMLAnchorElement.prototype.click; HTMLAnchorElement.prototype.click = () => {};
    try { await app.exportCanvasAsPng(); } catch (e) { /* the canvas step may fail headless */ } finally { XMLSerializer.prototype.serializeToString = orig; HTMLAnchorElement.prototype.click = click; }
    return captured;
  });
  expect(svgText).toContain('tt-table-group');
  expect(svgText).toContain('Owner');
  expect(svgText).toContain('RED TEAM');
  // Dark canvas: the default theme switches to the dark swimlane colours.
  await page.evaluate(() => app.toggleCanvasTheme());
  const darkBg = await page.evaluate(() => getComputedStyle(document.querySelector('[data-id="vl"] .tt-lane-bg')).fill);
  expect(darkBg).toBe('rgba(30, 30, 42, 0.6)');
  // Themed text keeps its theme colour on the dark canvas (all other SVG text turns light there).
  const darkText = await page.evaluate(() => getComputedStyle(document.querySelector('[data-id="tb"] .tt-table-text:not(.tt-head-text)')).fill);
  expect(darkText).toBe('rgb(49, 55, 63)');   // --sl-rowhead-text of blue-strong (#31373f)
  await page.evaluate(() => app.setViewMode('ne-isometric'));
  await expect(page.locator('#isometric-wrapper [data-id="tb"]')).toHaveCount(1);
  await expect(page.locator('#isometric-wrapper [data-id="vl"]')).toHaveCount(1);
  // Minimap, align and format painter know the new shapes.
  const r = await page.evaluate(() => ({ align: ALIGNABLE_TYPES.has('table') && ALIGNABLE_TYPES.has('pool'), painter: styleFamily({ type: 'table' }) === styleFamily({ type: 'phases' }) && !!styleFamily({ type: 'table' }), swimPainter: styleFamily({ type: 'swimlane' }) }));
  expect(r).toEqual({ align: true, painter: true, swimPainter: null });
});

test('copy and paste and format painter carry the table and its theme', async ({ page }) => {
  await setup(page, (s) => {
    tableModel(s);
    s.elements.push({ id: 'ph', type: 'phases', name: 'Roadmap', x: 1000, y: 600, width: 600, height: 300, lanes: ['Plan', 'Build'] });
  });
  await page.evaluate(() => { app.state.selectedElementIds = ['tb']; app.copySelection(); app.pasteSelection(); });
  const tables = await only(page, 'table');
  expect(tables).toHaveLength(2);
  expect(tables[1].cells).toEqual(tables[0].cells);
  const theme = await page.evaluate(() => { const src = app.state.elements.find((e) => e.id === 'tb'), dst = app.state.elements.find((e) => e.id === 'ph'); return paintableStyle(src, dst); });
  expect(theme).toEqual({ theme: 'blue-strong' });
});

test('dragging a shape over a lane container highlights the lane it will land in', async ({ page }) => {
  await setup(page, (s) => {
    s.elements.push({ id: 'vl', type: 'vlanes', name: 'Teams', x: 0, y: 0, width: 600, height: 400, lanes: ['A', 'B', 'C'] });
    s.elements.push({ id: 'n1', type: 'fc_process', name: 'Mover', x: 0, y: 600, width: 160, height: 60 });
  });
  await page.evaluate(() => { app.zoomScale = 0.6; app.panX = 40; app.panY = 40; app.applySvgViewportTransformations(); });
  const toScreen = (x, y) => page.evaluate(([cx, cy]) => { const m = document.getElementById('layers-nodes-group').getScreenCTM(); return { x: cx * m.a + cy * m.c + m.e, y: cx * m.b + cy * m.d + m.f }; }, [x, y]);
  const from = await toScreen(80, 630), to = await toScreen(500, 250);   // into lane "C" (x 400–600)
  await page.mouse.move(from.x, from.y); await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 8 });
  await expect(page.locator('[data-id="vl"] .tt-lane-drop')).toHaveAttribute('data-lane', '2');
  await page.mouse.up();
  await expect(page.locator('.tt-lane-drop')).toHaveCount(0);
});
