// Title block & legend settings: the ☰ → View dialog, per-item visibility and labels, title, columns,
// corner or free-floating position (drag, lock, review mode), PNG / print, model round trip and validation.
const { test } = require('@playwright/test');
const { expect, openApp, demoSession, trackPageErrors, importJson, downloadText, clickControl } = require('./helpers');

const A = { id: 'a', type: 'process', name: 'Web app', x: 0, y: 200, width: 120, height: 60, secProps: {}, icon: 'bi-globe' };
const B = { id: 'b', type: 'datastore', name: 'Orders DB', x: 400, y: 0, width: 120, height: 60, secProps: { isCrownJewel: 'true' } };
const C = { id: 'c', type: 'interactor', name: 'Customer', x: 0, y: 500, width: 120, height: 60, secProps: {} };
const F1 = { id: 'f1', name: 'orders', sourceId: 'a', targetId: 'b', sourceAnchor: 'right-2', targetAnchor: 'left-2', points: [], secProps: {}, isDashed: true };

async function setup(page, mutate, width = 1600) {
  await page.setViewportSize({ width, height: 1000 });
  await openApp(page, { session: demoSession((s) => {
    s.elements = [A, B, C].map((e) => JSON.parse(JSON.stringify(e))); s.flows = [{ ...F1 }]; s.threats = []; s.mitigations = []; s.reviewMode = false;
    if (mutate) mutate(s);
  }) });
  await page.evaluate(() => { if (app.viewMode !== 'flat') app.setViewMode('flat'); app.zoomToFit(); });
}
const setLegend = (page, patch) => page.evaluate((p) => { app.state.legend = normalizeLegend({ ...app.state.legend, ...p }); app.refreshAppViewVisualWorkspace(); app.saveSessionToLocalStorage(); }, patch);
const keys = (page) => page.evaluate(() => app.legendEntries().map((e) => e.key));
const shownLabels = (page) => page.evaluate(() => [...document.querySelectorAll('#canvas-title-block:not(.d-none) .legend-label, #canvas-legend-float:not(.d-none) .legend-label')].map((t) => t.textContent));

async function openDialog(page) {
  await clickControl(page, '#btn-menu-title-block');
  await expect(page.locator('#modal-legend')).toBeVisible();
}

// ── The ☰ menu item and the dialog ─────────────────────────────────────────────

test('the View menu item opens the Title block & legend dialog instead of toggling', async ({ page }) => {
  await setup(page);
  await clickControl(page, '#btn-menu-view');
  const item = page.locator('#btn-menu-title-block');
  await expect(item).toContainText('Title block & legend…');
  expect(await item.getAttribute('role')).not.toBe('menuitemcheckbox');
  expect(await item.getAttribute('aria-checked')).toBeNull();
  await item.click();
  await expect(page.locator('#modal-legend')).toBeVisible();
  // Opening the dialog changes nothing by itself.
  await expect(page.locator('#canvas-title-block')).toBeHidden();
  await page.check('#legend-show-title-block');
  await page.check('#legend-show-legend');
  const block = page.locator('#canvas-title-block');
  await expect(block).toBeVisible();
  await expect(block).toContainText(await page.evaluate(() => app.state.projectTitle));
  await expect(block).toContainText('Dashed flow');
  expect(await page.evaluate(() => [app.state.legend.showTitleBlock, app.state.legend.showLegend])).toEqual([true, true]);
  // Closing the dialog makes the changes one undo step.
  await page.click('#modal-legend .btn-close');
  await expect(page.locator('#modal-legend')).toBeHidden();
  await page.evaluate(() => app.undo());
  await expect(block).toBeHidden();
  await page.evaluate(() => app.redo());
  await expect(block).toBeVisible();
});

test('the dialog lists every item the page uses, and follows shapes being added and removed', async ({ page }) => {
  await setup(page, (s) => {
    s.elements.push({ id: 'd', type: 'fc_decision', name: 'Ok?', x: 700, y: 0, width: 160, height: 100 });
    s.elements.push({ id: 'z', type: 'boundary', name: 'DMZ', x: -50, y: -50, width: 800, height: 400 });
    s.elements.push({ id: 'st', type: 'infrastructure', name: 'EC2', x: 900, y: 300, width: 80, height: 70, stencil: 'aws:Amazon-EC2', stencilIcon: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciLz4=' });
    s.elements.push({ id: 'cube', type: 'fc_process', threeD: true, name: 'Box', x: 900, y: 600, width: 120, height: 100 });
    s.elements.push({ id: 'goal', type: 'at_goal', name: 'Steal data', x: 1200, y: 0, width: 200, height: 80 });
    s.elements.push({ id: 'c4', type: 'c4_container', name: 'API', x: 1200, y: 300, width: 200, height: 120 });
    s.elements.push({ id: 'tbl', type: 'table', name: 'T', x: 1200, y: 600, width: 300, height: 120, cells: [['a']] });
    s.flows[0].color = 'red';
    s.flows.push({ id: 'f2', name: 'enc', sourceId: 'c', targetId: 'a', points: [], secProps: { encrypted: 'true', authenticated: 'true' }, isBidirectional: true });
    s.threats = [{ id: 'th-001', elementId: 'a', title: 'T', category: 'Spoofing', status: 'Open / Unmitigated', likelihood: 3, impact: 3 }];
  });
  const k = await keys(page);
  for (const want of ['type:process', 'type:datastore', 'type:interactor', 'type:fc_decision', 'type:boundary', 'type:fc_process+3d',
    'type:at_goal', 'type:c4_container', 'type:table', 'icon:bi-globe', 'stencil:aws:Amazon-EC2', 'flow', 'dashed', 'twoway', 'encrypted', 'auth', 'colour:red', 'threat', 'crown']) {
    expect(k, want).toContain(want);
  }
  expect(k).not.toContain('type:boundary_line');
  expect(k).not.toContain('type:fc_process');   // only the 3D variant is used
  await openDialog(page);
  const rows = page.locator('#legend-items .legend-item-row');
  expect(await rows.evaluateAll((r) => r.map((x) => x.dataset.key))).toEqual(k);
  // Each row has a checkbox and an editable label; the stencil row shows the stencil's icon.
  await expect(rows.first().locator('input[type="checkbox"]')).toBeChecked();
  await expect(page.locator('#legend-items .legend-item-row[data-key="stencil:aws:Amazon-EC2"] input.legend-item-label')).toHaveValue('Amazon EC2');
  // A shape type added while the dialog is open shows up; one removed goes away.
  await page.evaluate(() => { app.state.elements.push({ id: 'bl', type: 'boundary_line', name: 'L', x: 0, y: 900, x2: 600, y2: 900, bendX: 0, bendY: 0, layerId: 'main', pageId: 'p1' }); app.refreshAppViewVisualWorkspace(); });
  await expect(page.locator('#legend-items .legend-item-row[data-key="type:boundary_line"]')).toHaveCount(1);
  await page.evaluate(() => { app.state.elements = app.state.elements.filter((e) => e.id !== 'd'); app.refreshAppViewVisualWorkspace(); });
  await expect(page.locator('#legend-items .legend-item-row[data-key="type:fc_decision"]')).toHaveCount(0);
});

test('unchecking an item hides it on the legend, and a custom label replaces the automatic one', async ({ page }) => {
  await setup(page);
  await setLegend(page, { showLegend: true });
  expect(await shownLabels(page)).toContain('Data store');
  await openDialog(page);
  await page.uncheck('#legend-items .legend-item-row[data-key="type:datastore"] input[type="checkbox"]');
  expect(await shownLabels(page)).not.toContain('Data store');
  expect(await page.evaluate(() => app.state.legend.items['type:datastore'])).toEqual({ show: false, label: '' });
  const label = page.locator('#legend-items .legend-item-row[data-key="type:process"] input.legend-item-label');
  await label.fill('Microservice');
  expect(await shownLabels(page)).toContain('Microservice');
  expect(await shownLabels(page)).not.toContain('Process');
  // Reset brings the automatic label back; the item list itself is unchanged.
  await page.click('#legend-items .legend-item-row[data-key="type:process"] .legend-item-reset');
  await expect(label).toHaveValue('Process');
  expect(await shownLabels(page)).toContain('Process');
  // Hide all / show all / reset all.
  await page.click('#legend-items-hide-all');
  expect(await shownLabels(page)).toEqual([]);
  await page.click('#legend-items-show-all');
  expect(await shownLabels(page)).toContain('Data store');
  await label.fill('Svc');
  await page.click('#legend-items-reset-labels');
  await expect(label).toHaveValue('Process');
  expect(await page.evaluate(() => app.state.legend.items)).toEqual({});
});

test('the legend title and one or two columns render as chosen', async ({ page }) => {
  await setup(page);
  await setLegend(page, { showLegend: true });
  await expect(page.locator('#canvas-title-block .legend-title')).toHaveText('Legend');
  await openDialog(page);
  await page.fill('#legend-title', 'Key to symbols');
  await expect(page.locator('#canvas-title-block .legend-title')).toHaveText('Key to symbols');
  const xs = () => page.evaluate(() => [...new Set([...document.querySelectorAll('#canvas-title-block .legend-row')].map((r) => r.getAttribute('data-col')))]);
  expect(await page.evaluate(() => app.state.legend.columns)).toBe(2);
  expect((await xs()).sort()).toEqual(['0', '1']);
  const wide = await page.evaluate(() => +document.getElementById('canvas-title-block').getAttribute('width'));
  await page.click('label[for="legend-columns-1"]');
  expect(await xs()).toEqual(['0']);
  expect(await page.evaluate(() => app.state.legend.columns)).toBe(1);
  expect(await page.evaluate(() => +document.getElementById('canvas-title-block').getAttribute('width'))).toBeLessThan(wide);
  // An empty title leaves the heading out.
  await page.fill('#legend-title', '');
  await expect(page.locator('#canvas-title-block .legend-title')).toHaveCount(0);
});

test('each corner position places the block in that corner of the canvas', async ({ page }) => {
  await setup(page);
  await setLegend(page, { showTitleBlock: true, showLegend: true });
  await openDialog(page);
  for (const pos of ['top-left', 'top-right', 'bottom-left', 'bottom-right']) {
    await page.selectOption('#legend-position', pos);
    const r = await page.evaluate(() => {
      const b = document.getElementById('canvas-title-block').getBoundingClientRect(), c = document.getElementById('canvas-svg').getBoundingClientRect();
      return { left: b.left - c.left, right: c.right - b.right, top: b.top - c.top, bottom: c.bottom - b.bottom };
    });
    const [v, h] = pos.split('-');
    expect(r[v], pos).toBeLessThan(r[v === 'top' ? 'bottom' : 'top']);
    expect(r[h], pos).toBeLessThan(r[h === 'left' ? 'right' : 'left']);
    expect(await page.evaluate(() => app.state.legend.position)).toBe(pos);
  }
  await expect(page.locator('#legend-locked')).toBeDisabled();
});

// ── Free-floating ──────────────────────────────────────────────────────────────

async function floating(page) {
  await setLegend(page, { showTitleBlock: true, showLegend: true, position: 'free', x: 100, y: 100, locked: false });
  await expect(page.locator('#canvas-legend-float')).toBeVisible();
  await expect(page.locator('#canvas-title-block')).toBeHidden();
}
async function dragLegend(page, dx, dy) {
  const b = await page.locator('#canvas-legend-float').boundingBox();
  await page.mouse.move(b.x + 30, b.y + 15);
  await page.mouse.down();
  await page.mouse.move(b.x + 30 + dx / 2, b.y + 15 + dy / 2, { steps: 3 });
  await page.mouse.move(b.x + 30 + dx, b.y + 15 + dy, { steps: 3 });
  await page.mouse.up();
}

test('a free-floating legend sits on the canvas, pans and zooms with it, and is dragged to a new place that persists', async ({ page }) => {
  await setup(page);
  await floating(page);
  // In model coordinates: zooming scales it.
  const w1 = (await page.locator('#canvas-legend-float').boundingBox()).width;
  await page.evaluate(() => { app.zoomScale *= 2; app.applySvgViewportTransformations(); });
  expect((await page.locator('#canvas-legend-float').boundingBox()).width).toBeCloseTo(w1 * 2, 0);
  await page.evaluate(() => { app.zoomScale = 1; app.panX = 200; app.panY = 100; app.applySvgViewportTransformations(); });
  await dragLegend(page, 120, 60);
  const L = await page.evaluate(() => app.state.legend);
  expect(L.x).toBeCloseTo(220, -1); expect(L.y).toBeCloseTo(160, -1);
  // It is not a shape: nothing got selected, no element or flow was added.
  expect(await page.evaluate(() => [app.state.selectedElementIds.length, app.state.elements.length])).toEqual([0, 3]);
  // One undo step, and kept across a reload.
  await page.evaluate(() => app.flushSave());
  await page.reload();
  await page.waitForFunction(() => window.app && window.app.state);
  expect(await page.evaluate(() => [app.state.legend.position, Math.round(app.state.legend.x), Math.round(app.state.legend.y)])).toEqual(['free', L.x, L.y].map((v) => (typeof v === 'number' ? Math.round(v) : v)));
  await expect(page.locator('#canvas-legend-float')).toBeVisible();
});

test('the arrow keys move a focused free-floating legend', async ({ page }) => {
  await setup(page);
  await floating(page);
  await page.focus('#canvas-legend-float');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Shift+ArrowDown');
  expect(await page.evaluate(() => [app.state.legend.x, app.state.legend.y])).toEqual([110, 150]);
});

test('a locked or review-mode legend cannot be dragged, and lets clicks through to the canvas', async ({ page }) => {
  await setup(page);
  await floating(page);
  await openDialog(page);
  await expect(page.locator('#legend-locked')).toBeEnabled();
  await page.check('#legend-locked');
  await page.click('#modal-legend .btn-close');
  await expect(page.locator('#modal-legend')).toBeHidden();
  expect(await page.evaluate(() => getComputedStyle(document.getElementById('canvas-legend-float')).pointerEvents)).toBe('none');
  await dragLegend(page, 150, 80);
  expect(await page.evaluate(() => [app.state.legend.x, app.state.legend.y])).toEqual([100, 100]);
  // Unlocked but in review mode: frozen too.
  await setLegend(page, { locked: false });
  await page.evaluate(() => app.toggleReviewMode(true));
  await dragLegend(page, 150, 80);
  expect(await page.evaluate(() => [app.state.legend.x, app.state.legend.y])).toEqual([100, 100]);
  await page.focus('#canvas-legend-float').catch(() => {});
  await page.keyboard.press('ArrowRight');
  expect(await page.evaluate(() => app.state.legend.x)).toBe(100);
});

test('switching to free-floating starts where the corner block was on screen', async ({ page }) => {
  await setup(page);
  await setLegend(page, { showLegend: true, position: 'bottom-right' });
  const before = await page.locator('#canvas-title-block').boundingBox();
  await openDialog(page);
  await page.selectOption('#legend-position', 'free');
  await expect(page.locator('#legend-locked')).toBeEnabled();
  const after = await page.locator('#canvas-legend-float').boundingBox();
  expect(Math.abs(after.x - before.x)).toBeLessThan(25);
  expect(Math.abs(after.y - before.y)).toBeLessThan(25);
});

// ── PNG and print ──────────────────────────────────────────────────────────────

async function exportedSvg(page) {
  return page.evaluate(async () => {
    let captured = '';
    const orig = XMLSerializer.prototype.serializeToString;
    XMLSerializer.prototype.serializeToString = function (n) { const s = orig.call(this, n); if (n.id === 'canvas-svg') captured = s; return s; };
    const click = HTMLAnchorElement.prototype.click; HTMLAnchorElement.prototype.click = function () {};
    try { await app.exportCanvasAsPng(); } finally { XMLSerializer.prototype.serializeToString = orig; HTMLAnchorElement.prototype.click = click; }
    const doc = new DOMParser().parseFromString(captured, 'image/svg+xml'), svg = doc.documentElement;
    const vb = svg.getAttribute('viewBox').split(' ').map(Number);
    const tb = svg.querySelector('.export-title-block'), fl = svg.querySelector('#canvas-legend-float');
    const tr = (n) => { const m = n && /translate\(([-\d.e]+),? ?([-\d.e]+)\)/.exec(n.getAttribute('transform') || ''); return m ? m.slice(1).map(Number) : null; };
    return { vb, tb: tr(tb), float: tr(fl), floatHidden: fl ? fl.classList.contains('d-none') : null, text: (tb || fl || svg).textContent, labels: [...svg.querySelectorAll('.legend-label')].map((t) => t.textContent) };
  });
}

test('the PNG export puts the block in the chosen corner, with the chosen items and labels', async ({ page }) => {
  await setup(page);
  await setLegend(page, { showTitleBlock: true, showLegend: true, items: { 'type:interactor': { show: false, label: '' }, 'type:process': { show: true, label: 'Service' } } });
  const size = await page.evaluate(() => { const t = app.buildTitleBlockSvg(); return [t.width, t.height]; });
  for (const pos of ['top-left', 'top-right', 'bottom-left', 'bottom-right']) {
    await setLegend(page, { position: pos });
    const r = await exportedSvg(page);
    const [vx, vy, vw, vh] = r.vb, [tx, ty] = r.tb;
    if (pos.endsWith('left')) expect(tx, pos).toBeCloseTo(vx + 20, 0); else expect(tx + size[0], pos).toBeCloseTo(vx + vw - 20, 0);
    if (pos.startsWith('top')) expect(ty, pos).toBeCloseTo(vy + 20, 0); else expect(ty + size[1], pos).toBeCloseTo(vy + vh - 20, 0);
    expect(r.labels).toContain('Service');
    expect(r.labels).not.toContain('External entity');
  }
});

test('the PNG export and print include a free-floating legend at its place', async ({ page }) => {
  await setup(page);
  await setLegend(page, { showTitleBlock: true, showLegend: true, position: 'free', x: 1500, y: 900 });
  const r = await exportedSvg(page);
  expect(r.tb).toBeNull();
  expect(r.floatHidden).toBe(false);
  expect(r.float).toEqual([1500, 900]);
  const size = await page.evaluate(() => { const t = app.buildTitleBlockSvg(); return [t.width, t.height]; });
  // The image is big enough to hold it.
  expect(r.vb[0] + r.vb[2]).toBeGreaterThanOrEqual(1500 + size[0]);
  expect(r.vb[1] + r.vb[3]).toBeGreaterThanOrEqual(900 + size[1]);
  // Print fits the diagram and the legend on the page.
  const vb = await page.evaluate(() => { window.dispatchEvent(new Event('beforeprint')); const v = app.dom.svg.getAttribute('viewBox').split(' ').map(Number); window.dispatchEvent(new Event('afterprint')); return v; });
  expect(vb[0] + vb[2]).toBeGreaterThanOrEqual(1500 + size[0]);
  expect(vb[1] + vb[3]).toBeGreaterThanOrEqual(900 + size[1]);
});

test('print shows a corner block in its corner', async ({ page }) => {
  await setup(page);
  await setLegend(page, { showTitleBlock: true, showLegend: true, position: 'top-left' });
  await page.emulateMedia({ media: 'print' });
  const r = await page.evaluate(() => {
    const el = document.getElementById('canvas-title-block'), b = el.getBoundingClientRect(), c = el.parentElement.getBoundingClientRect();
    return [getComputedStyle(el).display, b.left - c.left < c.right - b.right, b.top - c.top < c.bottom - b.bottom];
  });
  expect(r).toEqual(['block', true, true]);
});

test('the dark canvas keeps the legend readable (dark text on its white box)', async ({ page }) => {
  await setup(page);
  await setLegend(page, { showLegend: true, position: 'free', x: 0, y: 0 });
  await page.evaluate(() => { if (app.canvasTheme !== 'dark') app.toggleCanvasTheme(); });
  const fills = await page.evaluate(() => [...document.querySelectorAll('#canvas-legend-float text')].map((t) => getComputedStyle(t).fill));
  expect(fills.length).toBeGreaterThan(2);
  expect(fills.every((f) => f !== 'rgb(203, 213, 225)')).toBe(true);
});

// ── Model: export, import, validation, migration ───────────────────────────────

test('the legend settings are saved in the model, exported and imported', async ({ page }) => {
  await setup(page);
  const L = { showTitleBlock: true, showLegend: true, title: 'Key', columns: 1, position: 'free', x: 321, y: -45, locked: true, items: { 'type:process': { show: false, label: 'Svc' } } };
  await setLegend(page, L);
  const json = JSON.parse(await downloadText(page, '#btn-export'));
  expect(json.legend).toEqual(L);
  await setLegend(page, { showTitleBlock: false, showLegend: false, title: 'x', items: {} });
  await importJson(page, JSON.stringify(json));
  expect(await page.evaluate(() => app.state.legend)).toEqual(L);
  // A model from before this feature gets the defaults.
  delete json.legend;
  await importJson(page, JSON.stringify(json));
  expect(await page.evaluate(() => app.state.legend)).toEqual({ showTitleBlock: false, showLegend: false, title: 'Legend', columns: 2, position: 'bottom-right', x: 0, y: 0, locked: false, items: {} });
});

test('the normaliser rejects bad legend values', async ({ page }) => {
  await setup(page);
  const r = await page.evaluate(() => normalizeSession({ legend: {
    showTitleBlock: 'true', showLegend: 1, title: '  Key\n\tto   it  ' + 'x'.repeat(200), columns: 3, position: 'middle', x: 'abc', y: 1e12, locked: 'yes', extra: '<b>',
    items: { 'type:process': { show: false, label: 'y'.repeat(500) }, 'bad key<script>': { show: false }, __proto__: { show: false }, 'flow': { show: 'no', label: 7 }, 'dashed': 'x', 'twoway': { show: true, label: '' } },
  } }).session.legend);
  expect(r.showTitleBlock).toBe(false); expect(r.showLegend).toBe(false);
  expect(r.title.startsWith('Key to it')).toBe(true); expect(r.title.length).toBe(60);
  expect(r.columns).toBe(2); expect(r.position).toBe('bottom-right');
  expect(r.x).toBe(0); expect(r.y).toBe(1e6); expect(r.locked).toBe(false);
  expect(r.extra).toBeUndefined();
  expect(Object.keys(r.items)).toEqual(['type:process', 'flow']);
  expect(r.items['type:process']).toEqual({ show: false, label: 'y'.repeat(80) });
  expect(r.items.flow).toEqual({ show: true, label: '7' });
  // Not an object at all: defaults. Too many items: capped.
  expect(await page.evaluate(() => normalizeLegend('x').position)).toBe('bottom-right');
  expect(await page.evaluate(() => Object.keys(normalizeLegend({ items: Object.fromEntries(Array.from({ length: 900 }, (_, i) => [`icon:bi-x${i}`, { show: false }])) }).items).length)).toBe(500);
});

test('the old "show title block and legend" view setting moves into the model once', async ({ page }) => {
  await setup(page, (s) => { delete s.legend; });
  await page.addInitScript(() => { if (!sessionStorage.getItem('__migr')) { sessionStorage.setItem('__migr', '1'); localStorage.setItem('title_block', 'true'); } });
  await page.reload();
  await page.waitForFunction(() => window.app && window.app.state);
  expect(await page.evaluate(() => [app.state.legend.showTitleBlock, app.state.legend.showLegend])).toEqual([true, true]);
  expect(await page.evaluate(() => localStorage.getItem('title_block'))).toBeNull();
  await expect(page.locator('#canvas-title-block')).toBeVisible();
  // Turning it off afterwards sticks across a reload.
  await setLegend(page, { showTitleBlock: false, showLegend: false });
  await page.evaluate(() => app.flushSave());
  await page.reload();
  await page.waitForFunction(() => window.app && window.app.state);
  await expect(page.locator('#canvas-title-block')).toBeHidden();
});

test('the dialog works at phone width without sideways scrolling', async ({ page }) => {
  await setup(page, null, 375);
  await page.evaluate(() => app.openLegendDialog());
  await expect(page.locator('#modal-legend')).toBeVisible();
  const r = await page.evaluate(() => { const d = document.querySelector('#modal-legend .modal-dialog').getBoundingClientRect(); return [d.left >= 0, d.right <= window.innerWidth, document.documentElement.scrollWidth <= window.innerWidth]; });
  expect(r).toEqual([true, true, true]);
});

test('custom title and labels are drawn as text, never markup', async ({ page }) => {
  const errors = trackPageErrors(page);
  const evil = '<img src=x onerror="window.__pwned=1">';
  await setup(page);
  await setLegend(page, { showLegend: true, title: evil, items: { 'type:process': { show: true, label: evil } } });
  await expect(page.locator('#canvas-title-block')).toContainText('<img');
  await openDialog(page);
  await expect(page.locator('#legend-items .legend-item-row[data-key="type:process"] input.legend-item-label')).toHaveValue(evil);
  expect(await page.locator('#canvas-title-block img, #modal-legend img').count()).toBe(0);
  expect(await page.evaluate(() => window.__pwned)).toBeUndefined();
  expect(errors).toEqual([]);
});

test('legend: no page errors while configuring and dragging', async ({ page }) => {
  const errors = trackPageErrors(page);
  await setup(page);
  await openDialog(page);
  await page.check('#legend-show-legend');
  await page.selectOption('#legend-position', 'free');
  await page.click('#modal-legend .btn-close');
  await dragLegend(page, 40, 40);
  await page.evaluate(() => { app.setViewMode('ne-isometric'); });
  await dragLegend(page, -40, 20);
  await exportedSvg(page);
  expect(errors).toEqual([]);
});
