// Pages: one model over several pages, each in its own area of the canvas; drill-down links between pages.
const { test } = require('@playwright/test');
const { expect, openApp, demoSession } = require('./helpers');

const node = (id, x, extra = {}) => ({ id, type: 'process', name: id.toUpperCase(), x, y: 100, width: 240, height: 80, secProps: {}, ...extra });
async function setup(page, elements, extra = {}) {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await openApp(page, { session: demoSession((s) => { s.elements = elements; s.flows = extra.flows || []; s.threats = extra.threats || []; delete s.pages; Object.assign(s, extra); }) });
}
const TWO = { pages: [{ id: 'p1', name: 'Overview', offset: 0 }, { id: 'p2', name: 'Payments', offset: 100000 }] };

test('an old model without pages opens as one page; new shapes are stamped with it', async ({ page }) => {
  await setup(page, [node('a', 0)]);
  expect(await page.evaluate(() => [app.state.pages, app.state.activePageId, app.state.elements[0].pageId])).toEqual([[{ id: 'p1', name: 'Page 1', offset: 0 }], 'p1', 'p1']);
});

test('hostile page data loads safely; unknown pageId and linkedPageId are repaired', async ({ page }) => {
  const many = Array.from({ length: 80 }, (_, i) => ({ id: `q${i}`, name: `Q${i}`, offset: (i + 2) * 100000 }));
  await setup(page, [node('a', 0, { pageId: 'nowhere', linkedPageId: 'ghost' }), node('b', 100000, { pageId: 'p2', linkedPageId: 'x' })], {
    pages: [{ id: 'x', name: '<img src=x onerror=alert(1)>', offset: 0 }, { id: 'x', name: 'dup', offset: 5 }, { id: 'p2', name: 'Two', offset: 'NaN' }, { id: 'bad id', name: 'B' }, ...many],
  });
  const r = await page.evaluate(() => ({
    n: app.state.pages.length, first: app.state.pages[0], p2: app.state.pages.find((p) => p.id === 'p2'),
    a: [app.state.elements[0].pageId, app.state.elements[0].linkedPageId], b: [app.state.elements[1].pageId, app.state.elements[1].linkedPageId],
    offsets: new Set(app.state.pages.map((p) => p.offset)).size === app.state.pages.length,
  }));
  expect(r.n).toBe(50);
  expect(r.first).toEqual({ id: 'x', name: '<img src=x onerror=alert(1)>', offset: 0 });
  expect(r.p2.offset % 100000).toBe(0);
  expect(r.p2.offset).toBeGreaterThan(0);
  expect(r.a).toEqual(['x', undefined]);
  expect(r.b).toEqual(['p2', 'x']);
  expect(r.offsets).toBe(true);
});

test('pages round-trip through JSON export and undo', async ({ page }) => {
  await setup(page, [node('a', 0, { pageId: 'p1' }), node('b', 100000, { pageId: 'p2', linkedPageId: 'p1' })], TWO);
  const [download] = await Promise.all([page.waitForEvent('download'), page.evaluate(() => app.exportWorkspaceJsonPayloadFile())]);
  const json = JSON.parse(require('node:fs').readFileSync(await download.path(), 'utf8'));
  expect(json.pages).toEqual([{ id: 'p1', name: 'Overview', offset: 0 }, { id: 'p2', name: 'Payments', offset: 100000 }]);
  expect(json.elements.map((e) => [e.pageId, e.linkedPageId])).toEqual([['p1', undefined], ['p2', 'p1']]);
  await page.evaluate(() => { app.state.pages[1].name = 'Changed'; app.logEvent('CHANGE', 'rename'); app.undo(); });
  expect(await page.evaluate(() => app.state.pages[1].name)).toBe('Payments');
});

// ── Task 2: showing a page, tabs, switching ──
const nodeVisible = (page, id) => page.evaluate((i) => { const n = document.querySelector(`#layers-nodes-group [data-id="${i}"]`); return !!n && getComputedStyle(n).display !== 'none'; }, id);

test('only the current page is shown; switching moves the view; zoom-to-fit uses the current page', async ({ page }) => {
  await setup(page, [node('a', 0, { pageId: 'p1' }), node('b', 100000, { pageId: 'p2' })], TWO);
  await expect(page.locator('#page-tabs [role="tab"]')).toHaveCount(2);
  expect(await nodeVisible(page, 'a')).toBe(true);
  expect(await nodeVisible(page, 'b')).toBe(false);
  await page.locator('#page-tabs [role="tab"]', { hasText: 'Payments' }).click();
  await expect(page.locator('#page-tabs [role="tab"]', { hasText: 'Payments' })).toHaveAttribute('aria-selected', 'true');
  expect(await nodeVisible(page, 'b')).toBe(true);
  expect(await nodeVisible(page, 'a')).toBe(false);
  const bb = await page.evaluate(() => app.getIsometricBoundingBox());
  expect(bb.minX).toBeGreaterThan(90000);
  const onScreen = await page.evaluate(() => { const r = document.querySelector('#layers-nodes-group [data-id="b"]').getBoundingClientRect(); const c = document.getElementById('canvas-svg').getBoundingClientRect(); return r.left >= c.left && r.right <= c.right && r.top >= c.top && r.bottom <= c.bottom; });
  expect(onScreen).toBe(true);
  expect(await page.evaluate(() => app.undoStack.length)).toBe(0);
});

test('new, pasted and imported shapes on page 2 land in page 2\'s area', async ({ page }) => {
  await setup(page, [node('a', 0, { pageId: 'p1' }), node('b', 100000, { pageId: 'p2' })], TWO);
  await page.evaluate(() => { app.state.selectedElementIds = ['a']; app.refreshAppViewVisualWorkspace(); app.copySelection(); app.setActivePage('p2'); app.pasteSelection(); });
  const pasted = await page.evaluate(() => app.state.elements.filter((e) => !['a', 'b'].includes(e.id)).map((e) => [e.pageId, e.x]));
  expect(pasted.length).toBe(1);
  expect(pasted[0][0]).toBe('p2');
  expect(pasted[0][1]).toBeGreaterThan(90000);
  const added = await page.evaluate(() => { const id = app.instantiateNewCanvasElementNode('process'); const e = app.state.elements.find((x) => x.id === id); return [e.pageId, e.x]; });
  expect(added[0]).toBe('p2');
  expect(added[1]).toBeGreaterThan(90000);
  await page.evaluate(() => app.importMermaidFlowchart('flowchart LR\n  X --> Y', 'add'));
  const imported = await page.evaluate(() => app.state.elements.filter((e) => ['X', 'Y'].includes(e.name)).map((e) => [e.pageId, e.x > 90000]));
  expect(imported).toEqual([['p2', true], ['p2', true]]);
});

test('jumping to a component on another page switches to that page', async ({ page }) => {
  await setup(page, [node('a', 0, { pageId: 'p1' }), node('b', 100000, { pageId: 'p2' })], TWO);
  await page.evaluate(() => app.focusCanvasItem('b'));
  expect(await page.evaluate(() => app.state.activePageId)).toBe('p2');
  expect(await nodeVisible(page, 'b')).toBe(true);
});

// ── Task 3: delete, move, drill-down, register, exports ──
const flowAB = { id: 'f', name: 'AB', sourceId: 'a', targetId: 'b', sourceAnchor: 'right-2', targetAnchor: 'left-2', points: [], secProps: {} };

test('deleting a page asks first, deletes its shapes, flows and threats, and undo brings them back; the only page cannot be deleted', async ({ page }) => {
  await setup(page, [node('a', 0, { pageId: 'p1' }), node('b', 100000, { pageId: 'p2' }), node('c', 100400, { pageId: 'p2', linkedPageId: 'p1' }), node('l', 400, { pageId: 'p1', linkedPageId: 'p2' })], {
    ...TWO, flows: [{ ...flowAB, id: 'g', sourceId: 'b', targetId: 'c' }], threats: [{ id: 'th-001', title: 'T', category: 'Spoofing', status: 'Open / Unmitigated', likelihood: 3, impact: 3, elementId: 'b' }],
  });
  await page.evaluate(() => app.setActivePage('p2'));
  await expect(page.locator('#btn-page-delete')).toHaveCount(0);                     // no separate delete button
  await page.locator('#page-tabs [role="tab"]', { hasText: 'Payments' }).dblclick();
  const x = await page.locator('#page-tabs .page-tab-delete').boundingBox();
  await page.mouse.click(x.x + x.width / 2, x.y + x.height / 2);   // a real click at the × (it pokes out of the tab's corner)
  await expect(page.locator('#modal-confirm-delete')).toBeVisible();
  await page.click('#btn-confirm-delete');
  await expect(page.locator('#modal-confirm-delete')).toBeHidden();
  const r = await page.evaluate(() => ({ pages: app.state.pages.map((p) => p.id), active: app.state.activePageId, els: app.state.elements.map((e) => e.id), flows: app.state.flows.length, threats: app.state.threats.length, link: app.state.elements.find((e) => e.id === 'l').linkedPageId }));
  expect(r).toEqual({ pages: ['p1'], active: 'p1', els: ['a', 'l'], flows: 0, threats: 0, link: undefined });
  await page.locator('#page-tabs [role="tab"]').first().dblclick();
  await expect(page.locator('#page-tabs .page-tab-delete')).toHaveCount(0);        // the only page cannot be deleted
  await page.keyboard.press('Escape');
  await page.click('#btn-undo');
  expect(await page.evaluate(() => [app.state.pages.length, app.state.elements.length, app.state.threats.length, app.state.elements.find((e) => e.id === 'l').linkedPageId])).toEqual([2, 4, 1, 'p2']);
});

test('moving shapes to another page shifts them into its area, and is refused when a flow would cross pages', async ({ page }) => {
  await setup(page, [node('a', 0, { pageId: 'p1' }), node('b', 400, { pageId: 'p1' }), node('c', 800, { pageId: 'p1' })], { ...TWO, flows: [flowAB] });
  await page.evaluate(() => { app.state.selectedElementIds = ['a']; app.refreshAppViewVisualWorkspace(); });
  expect(await page.evaluate(() => app.moveSelectionToPage('p2'))).toBe(false);
  expect(await page.evaluate(() => app.state.elements.find((e) => e.id === 'a').pageId)).toBe('p1');
  await page.evaluate(() => { app.state.selectedElementIds = ['a', 'b']; app.refreshAppViewVisualWorkspace(); });
  await page.locator('#page-move-select').selectOption('p2');
  expect(await page.evaluate(() => app.state.elements.filter((e) => ['a', 'b'].includes(e.id)).map((e) => [e.pageId, e.x]))).toEqual([['p2', 100000], ['p2', 100400]]);
  await page.evaluate(() => { app.state.selectedElementIds = ['c']; app.refreshAppViewVisualWorkspace(); });
  expect(await page.evaluate(() => app.moveSelectionToPage('p2'))).toBe(true);
});

test('a shape links to a detail page: Properties picker, badge opens it, Back returns', async ({ page }) => {
  await setup(page, [node('a', 0, { pageId: 'p1' }), node('b', 100000, { pageId: 'p2' })], TWO);
  await page.evaluate(() => { app.state.selectedElementIds = ['a']; app.refreshAppViewVisualWorkspace(); });
  await page.locator('#props-linked-page').selectOption('p2');
  expect(await page.evaluate(() => app.state.elements.find((e) => e.id === 'a').linkedPageId)).toBe('p2');
  await page.locator('[data-owner-id="a"].page-link-badge').click();
  expect(await page.evaluate(() => app.state.activePageId)).toBe('p2');
  await page.click('#btn-page-back');
  expect(await page.evaluate(() => app.state.activePageId)).toBe('p1');
});

test('the register names the page; the Markdown report has one diagram per page; Mermaid export is the current page', async ({ page }) => {
  await setup(page, [node('a', 0, { pageId: 'p1' }), node('b', 100000, { pageId: 'p2' })], {
    ...TWO, threats: [{ id: 'th-001', title: 'T', category: 'Spoofing', status: 'Open / Unmitigated', likelihood: 3, impact: 3, elementId: 'b' }],
  });
  await expect(page.locator('#threat-register-tbody')).toContainText('B (Payments)');
  const md = await page.evaluate(() => app.buildMarkdownReport());
  expect(md).toContain('### Overview');
  expect(md).toContain('### Payments');
  expect((md.match(/```mermaid/g) || []).length).toBe(2);
  const mer = await page.evaluate(() => app.buildMermaidDiagram());
  expect(mer).toContain('"A"');
  expect(mer).not.toContain('"B"');
});

// ── Review fixes ──
const onScreen = (page, id) => page.evaluate((i) => { const n = document.querySelector(`#layers-nodes-group [data-id="${i}"]`); if (!n || getComputedStyle(n).display === 'none') return false; const r = n.getBoundingClientRect(), c = document.getElementById('canvas-svg').getBoundingClientRect(); return r.right > c.left && r.left < c.right && r.bottom > c.top && r.top < c.bottom; }, id);

test('undoing "add page" returns to a page that is actually shown', async ({ page }) => {
  await setup(page, [node('a', 0, { pageId: 'p1' })]);
  await page.evaluate(() => app.zoomToFit());
  await page.click('#btn-page-add');
  expect(await page.evaluate(() => app.state.activePageId)).not.toBe('p1');
  await page.click('#btn-undo');
  expect(await page.evaluate(() => [app.state.pages.length, app.state.activePageId])).toEqual([1, 'p1']);
  expect(await onScreen(page, 'a')).toBe(true);
});

test('Mermaid "add" on page 1 places shapes beside page 1\'s content, not over it', async ({ page }) => {
  await setup(page, [node('a', 0, { pageId: 'p1' }), node('a2', 4000, { pageId: 'p1' }), node('b', 100000, { pageId: 'p2' })], TWO);
  await page.evaluate(() => app.importMermaidFlowchart('flowchart LR\n  X --> Y', 'add'));
  const xs = await page.evaluate(() => app.state.elements.filter((e) => ['X', 'Y'].includes(e.name)).map((e) => [e.pageId, e.x]));
  expect(xs.map((x) => x[0])).toEqual(['p1', 'p1']);
  xs.forEach(([, x]) => { expect(x).toBeGreaterThan(4240); expect(x).toBeLessThan(50000); });
});

test('clicking an attack path on another page switches to that page', async ({ page }) => {
  await setup(page, [node('u', 100000, { pageId: 'p2', type: 'interactor' }), node('d', 100400, { pageId: 'p2', type: 'datastore', secProps: { isCrownJewel: 'true' } }), node('a', 0, { pageId: 'p1' })],
    { ...TWO, flows: [{ ...flowAB, id: 'ud', sourceId: 'u', targetId: 'd' }] });
  await page.click('#tab-insights-trigger');
  await page.locator('#insights-attack-paths .attack-path-row').first().click();
  expect(await page.evaluate(() => app.state.activePageId)).toBe('p2');
  expect(await onScreen(page, 'd')).toBe(true);
});

test('the selected page tab stands out on the dark canvas', async ({ page }) => {
  await setup(page, [node('a', 0, { pageId: 'p1' })], TWO);
  await page.evaluate(() => { app.canvasTheme = 'dark'; app.applyCanvasTheme(); });
  const [sel, other] = await page.evaluate(() => [...document.querySelectorAll('#page-tabs [role="tab"]')].map((t) => getComputedStyle(t).backgroundColor));
  expect(sel).not.toBe(other);
});

// ── Deferred minors (1.15.1) ──
test('a shape added far from the page origin stays on the current page', async ({ page }) => {
  await setup(page, [node('a', 0, { pageId: 'p1' }), node('b', 100000, { pageId: 'p2' })], TWO);
  const r = await page.evaluate(() => {
    const id = app.instantiateNewCanvasElementNode('process', 70000, 300);   // nearer page 2's area than page 1's
    const e = app.state.elements.find((x) => x.id === id); return [e.pageId, e.x];
  });
  expect(r[0]).toBe('p1');
  expect(Math.abs(r[1] - 70000)).toBeLessThan(200);
});

test('pasting on the same page far from the origin does not jump to another page', async ({ page }) => {
  await setup(page, [node('a', 60000, { pageId: 'p1' }), node('b', 100000, { pageId: 'p2' })], TWO);
  const r = await page.evaluate(() => { app.state.selectedElementIds = ['a']; app.refreshAppViewVisualWorkspace(); app.copySelection(); app.pasteSelection(); const e = app.state.elements.find((x) => !['a', 'b'].includes(x.id)); return [e.pageId, e.x]; });
  expect(r).toEqual(['p1', 60030]);
});

test('an imported file with page-less shapes in page 2\'s area puts them on page 2', async ({ page }) => {
  await setup(page, [node('a', 0), node('b', 100200)], TWO);
  expect(await page.evaluate(() => app.state.elements.map((e) => [e.id, e.pageId, e.x]))).toEqual([['a', 'p1', 0], ['b', 'p2', 100200]]);
});

test('Mermaid "add" on an empty page 2 lands on page 2; "replace" leaves a single page', async ({ page }) => {
  await setup(page, [node('a', 0, { pageId: 'p1' })], TWO);
  await page.evaluate(() => { app.setActivePage('p2'); app.importMermaidFlowchart('flowchart LR\n  X --> Y', 'add'); });
  expect(await page.evaluate(() => app.state.elements.filter((e) => ['X', 'Y'].includes(e.name)).map((e) => [e.pageId, e.x >= 100000]))).toEqual([['p2', true], ['p2', true]]);
  await page.evaluate(() => app.importMermaidFlowchart('flowchart LR\n  M --> N', 'replace'));
  const r = await page.evaluate(() => ({ pages: app.state.pages.map((p) => p.id), active: app.state.activePageId, on: app.state.elements.map((e) => e.pageId), xs: app.state.elements.map((e) => e.x < 50000) }));
  expect(r.pages).toHaveLength(1);
  expect(r.on.every((p) => p === r.active)).toBe(true);
  expect(r.xs.every(Boolean)).toBe(true);
  await expect(page.locator('#page-tabs .page-tab[data-page-id]')).toHaveCount(1);
});

test('opening a different model forgets the remembered page views and the Back trail', async ({ page }) => {
  await setup(page, [node('a', 0, { pageId: 'p1' }), node('b', 100000, { pageId: 'p2' })], TWO);
  await page.evaluate(() => { app.setActivePage('p2'); app.setActivePage('p1'); app.pageTrail = ['p2']; });
  expect(await page.evaluate(() => Object.keys(app.pageViews).length)).toBeGreaterThan(0);
  await page.evaluate(() => app.importWorkspaceJsonText(JSON.stringify({ elements: [{ id: 'z', type: 'process', name: 'Z', x: 0, y: 0 }], flows: [], threats: [], pages: [{ id: 'p1', name: 'One', offset: 0 }, { id: 'p2', name: 'Two', offset: 100000 }] }), 'other.json'));
  expect(await page.evaluate(() => [app.pageViews, app.pageTrail])).toEqual([{}, []]);
});

test('zoom-to-fit on an empty page keeps a normal zoom at the page origin', async ({ page }) => {
  await setup(page, [node('a', 0, { pageId: 'p1' })], TWO);
  await page.evaluate(() => { app.setActivePage('p2'); app.zoomToFit(); });
  expect(await page.evaluate(() => app.zoomScale)).toBe(1);
});

test('the page tabs work from the keyboard: arrows move, F2 renames', async ({ page }) => {
  await setup(page, [node('a', 0, { pageId: 'p1' }), node('b', 100000, { pageId: 'p2' })], TWO);
  await page.locator('#page-tabs .page-tab[data-page-id="p1"]').focus();
  await page.keyboard.press('ArrowRight');
  expect(await page.evaluate(() => [app.state.activePageId, document.activeElement.dataset.pageId])).toEqual(['p2', 'p2']);
  await page.keyboard.press('ArrowLeft');
  expect(await page.evaluate(() => app.state.activePageId)).toBe('p1');
  await page.keyboard.press('F2');
  await expect(page.locator('#page-tabs .page-rename input')).toBeFocused();
  await page.keyboard.type('Home');
  await page.keyboard.press('Enter');
  expect(await page.evaluate(() => app.state.pages[0].name)).toBe('Home');
  expect(await page.locator('#page-tabs .page-tab[data-page-id="p1"]').getAttribute('tabindex')).toBe('0');
  expect(await page.locator('#page-tabs .page-tab[data-page-id="p2"]').getAttribute('tabindex')).toBe('-1');
});

test('a page name with line breaks is stored on one line', async ({ page }) => {
  await setup(page, [node('a', 0)], { pages: [{ id: 'p1', name: 'Over\nview\r\n# Not a heading', offset: 0 }] });
  expect(await page.evaluate(() => app.state.pages[0].name)).toBe('Over view # Not a heading');
});

test('drill-down badges stay out of the exported PNG', async ({ page }) => {
  await setup(page, [node('a', 0, { pageId: 'p1', linkedPageId: 'p2' }), node('b', 100000, { pageId: 'p2' })], TWO);
  await expect(page.locator('.page-link-badge')).toHaveCount(1);
  const svg = await page.evaluate(async () => {
    let captured = '';
    const orig = XMLSerializer.prototype.serializeToString;
    XMLSerializer.prototype.serializeToString = function (n) { const s = orig.call(this, n); if (n && n.id === 'canvas-svg') captured = s; return s; };
    app.downloadBlob = () => {};
    try { await app.exportCanvasAsPng(); } catch (e) { /* the canvas step may fail headless */ }
    XMLSerializer.prototype.serializeToString = orig;
    return captured;
  });
  expect(svg).toContain('data-id="a"');
  expect(svg).not.toContain('class="page-link-badge"');
});
