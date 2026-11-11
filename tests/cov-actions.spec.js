// Coverage: every toolbar button, canvas dropdown, Properties field and panel filter has an effect that is checked.
const { test } = require('@playwright/test');
const C = require('./cov-helpers');
const { expect } = C;

/** Flat view, zoom 1, no pan, with the given elements, flows and threats on the active page. */
async function setup(page, elements, flows = [], threats = []) {
  await C.openApp(page, { session: C.demoSession() });
  await page.evaluate(([els, fls, ths]) => {
    const a = window.app; a.setViewMode('flat');
    const pid = a.state.activePageId;
    a.state.elements = els.map((e) => Object.assign({ pageId: pid, layerId: 'main', secProps: {}, width: 240, height: 80 }, e));
    a.state.flows = fls.map((f) => Object.assign({ points: [], secProps: {}, sourceAnchor: 'right', targetAnchor: 'left', textOffset: 0.5 }, f));
    a.state.threats = ths.map((t) => Object.assign({ status: 'Open / Unmitigated', category: 'Tampering', likelihood: '3', impact: '3' }, t));
    a.state.mitigations = [];
    a.state.selectedElementIds = []; a.state.selectedFlowId = null;
    a.zoomScale = 1; a.panX = 0; a.panY = 0; a.applySvgViewportTransformations();
    a.refreshAppViewVisualWorkspace(); a.resetUndoHistory();
  }, [elements, flows, threats]);
}
const P = (id, x, y = 100, extra = {}) => ({ id, type: 'process', name: id, x, y, ...extra });
const order = (page) => page.evaluate(() => app.state.elements.map((e) => e.id));
const drawnOrder = (page) => page.locator('#layers-nodes-group > [data-id]').evaluateAll((els) => els.map((e) => e.getAttribute('data-id')));
const flowLine = (page, id) => page.locator(`#layers-flows-paths-group [data-flow-id="${id}"] path.flow-line`);
async function selectFlow(page, id) {
  // A point 30% along the drawn path, in screen coordinates.
  const pt = await page.evaluate((fid) => {
    const p = document.querySelector(`#layers-flows-paths-group [data-flow-id="${fid}"] path.flow-hit-area`);
    const q = p.getPointAtLength(p.getTotalLength() * 0.3).matrixTransform(p.getScreenCTM());
    return { x: q.x, y: q.y };
  }, id);
  await page.mouse.click(pt.x, pt.y);
  await expect.poll(() => page.evaluate(() => app.state.selectedFlowId)).toBe(id);
}

test('Zoom to fit brings every shape into view and updates the zoom label', async ({ page }) => {
  await setup(page, [P('A', 0, 0), P('B', 3000, 2000)]);
  await page.evaluate(() => { app.panX = -5000; app.panY = -5000; app.applySvgViewportTransformations(); });
  await page.click('#btn-canvas-zoom-reset');
  const svg = await page.locator('#canvas-svg').boundingBox();
  for (const id of ['A', 'B']) {
    const b = await page.locator(`#layers-nodes-group [data-id="${id}"]`).first().boundingBox();
    expect(b.x).toBeGreaterThanOrEqual(svg.x); expect(b.y).toBeGreaterThanOrEqual(svg.y);
    expect(b.x + b.width).toBeLessThanOrEqual(svg.x + svg.width + 1); expect(b.y + b.height).toBeLessThanOrEqual(svg.y + svg.height + 1);
  }
  const zoom = await page.evaluate(() => app.zoomScale);
  expect(zoom).toBeLessThan(1);
  await expect(page.locator('#lbl-canvas-zoom')).toHaveText(`${Math.round(zoom * 100)}%`);
});

test('view dropdown: NE and NW isometric and flat change the projection, mark the active item and survive a reload', async ({ page }) => {
  await setup(page, [P('A', 0, 0)]);
  const transform = () => page.locator('#isometric-wrapper').getAttribute('transform');
  await page.click('#btn-canvas-view-dropdown'); await page.click('#opt-view-nw-iso');
  expect(await transform()).toBe('matrix(0.8660254, -0.5, 0.8660254, 0.5, 0, 0)');
  await expect(page.locator('#opt-view-nw-iso')).toHaveClass(/active/);
  await page.click('#btn-canvas-view-dropdown'); await page.click('#opt-view-ne-iso');
  expect(await transform()).toBe('matrix(0.8660254, 0.5, -0.8660254, 0.5, 0, 0)');
  await page.reload(); await page.waitForFunction(() => window.app && window.app.state);
  expect(await transform()).toBe('matrix(0.8660254, 0.5, -0.8660254, 0.5, 0, 0)');
  expect(await page.evaluate(() => [app.viewMode, app.isIsometric])).toEqual(['ne-isometric', true]);
  await page.click('#btn-canvas-view-dropdown'); await page.click('#opt-view-flat');
  expect(await transform()).toBeNull();
  await expect(page.locator('#opt-view-flat')).toHaveClass(/active/);
  await expect(page.locator('#opt-view-ne-iso')).not.toHaveClass(/active/);
});

test('grid dropdown: the size changes the pattern and the snap step; Snap to Grid off moves by 10; both are remembered', async ({ page }) => {
  await setup(page, [P('A', 0, 0)]);
  await page.click('#btn-canvas-grid-dropdown'); await page.click('#opt-grid-size-40');
  expect(await page.locator('#grid-pattern').getAttribute('width')).toBe('40');
  await expect(page.locator('#opt-grid-size-40')).toHaveClass(/active/);
  await C.clickNode(page, 'A');
  await page.keyboard.press('ArrowRight');
  expect(await page.evaluate(() => app.state.elements[0].x)).toBe(40);
  await page.click('#btn-canvas-grid-dropdown'); await page.click('#opt-grid-snap-toggle');
  await expect(page.locator('#opt-grid-snap-toggle')).not.toHaveClass(/active/);
  await C.clickNode(page, 'A');
  await page.keyboard.press('ArrowRight');
  expect(await page.evaluate(() => app.state.elements[0].x)).toBe(50);
  await page.reload(); await page.waitForFunction(() => window.app && window.app.state);
  expect(await page.evaluate(() => [app.gridSize, app.isSnappingActive])).toEqual([40, false]);
  expect(await page.locator('#grid-pattern').getAttribute('width')).toBe('40');
  for (const s of [10, 20, 80]) {
    await page.click('#btn-canvas-grid-dropdown'); await page.click(`#opt-grid-size-${s}`);
    expect(await page.locator('#grid-pattern path').getAttribute('d')).toBe(`M ${s} 0 L 0 0 0 ${s}`);
  }
});

test('a broken saved grid size is ignored: new shapes still get real coordinates', async ({ page }) => {
  // BUG: init() parses localStorage canvas_grid_size with parseInt and no validation, so a bad value gives gridSize NaN
  // and snapValue() turns every new or moved shape's x/y into NaN.
  test.fail();
  await setup(page, [P('A', 0, 0)]);
  await page.evaluate(() => localStorage.setItem('canvas_grid_size', 'big'));
  await page.reload(); await page.waitForFunction(() => window.app && window.app.state);
  await page.click('#pal-process');
  const el = await page.evaluate(() => app.state.elements[app.state.elements.length - 1]);
  expect(Number.isFinite(el.x) && Number.isFinite(el.y)).toBe(true);
});

test('canvas theme button switches the canvas to dark and back, changes its label, and is remembered', async ({ page }) => {
  await setup(page, [P('A', 0, 0)]);
  const wrapper = page.locator('.workspace-wrapper');
  await expect(wrapper).not.toHaveClass(/dark-theme-canvas/);
  await page.click('#btn-canvas-theme');
  await expect(wrapper).toHaveClass(/dark-theme-canvas/);
  await expect(page.locator('#btn-canvas-theme')).toHaveAttribute('title', 'Switch to Canvas Light Mode');
  await page.reload(); await page.waitForFunction(() => window.app && window.app.state);
  await expect(page.locator('.workspace-wrapper')).toHaveClass(/dark-theme-canvas/);
  await page.click('#btn-canvas-theme');
  await expect(page.locator('.workspace-wrapper')).not.toHaveClass(/dark-theme-canvas/);
  await expect(page.locator('#btn-canvas-theme')).toHaveAttribute('title', 'Toggle Canvas Dark Mode');
});

test('z-order buttons move the selected shape in the model and in the drawing order; each is one undo step', async ({ page }) => {
  await setup(page, [P('A', 0), P('B', 600), P('C', 1200)]);
  await C.clickNode(page, 'A');
  await page.click('#props-btn-bring-front');
  expect(await order(page)).toEqual(['B', 'C', 'A']);
  expect(await drawnOrder(page)).toEqual(['B', 'C', 'A']);
  await page.click('#props-btn-send-backward');
  expect(await order(page)).toEqual(['B', 'A', 'C']);
  await page.click('#props-btn-send-back');
  expect(await order(page)).toEqual(['A', 'B', 'C']);
  await page.click('#props-btn-bring-forward');
  expect(await order(page)).toEqual(['B', 'A', 'C']);
  expect(await drawnOrder(page)).toEqual(['B', 'A', 'C']);
  await page.click('#btn-undo');
  expect(await order(page)).toEqual(['A', 'B', 'C']);
  // At the back already: Send to Back changes nothing and adds no undo step.
  await C.clickNode(page, 'A');
  const log = await page.evaluate(() => app.state.activityLog.length);
  await page.click('#props-btn-send-back');
  expect(await page.evaluate(() => app.state.activityLog.length)).toBe(log);
});

test('Properties Delete removes the shape and its flows; with threats it asks first and Cancel keeps everything', async ({ page }) => {
  await setup(page, [P('A', 0), P('B', 600)], [{ id: 'F', name: 'f', sourceId: 'A', targetId: 'B' }], [{ id: 'th-001', title: 'T', elementId: 'B' }]);
  await C.clickNode(page, 'B');
  await page.click('#props-btn-delete');
  await expect(page.locator('#modal-confirm-delete')).toBeVisible();
  await page.click('#btn-confirm-cancel');
  await expect(page.locator('#modal-confirm-delete')).toBeHidden();
  expect(await page.evaluate(() => [app.state.elements.length, app.state.flows.length, app.state.threats.length])).toEqual([2, 1, 1]);
  await page.click('#props-btn-delete');
  await page.click('#btn-confirm-delete');
  await expect.poll(() => page.evaluate(() => [app.state.elements.map((e) => e.id), app.state.flows.length, app.state.threats.length])).toEqual([['A'], 0, 0]);
  await expect(page.locator('#layers-nodes-group [data-id="B"]')).toHaveCount(0);
  await page.click('#btn-undo');
  expect(await page.evaluate(() => [app.state.elements.length, app.state.flows.length, app.state.threats.length])).toEqual([2, 1, 1]);
});

test('the Disabled switch greys a component, is saved in the export, and undoes', async ({ page }) => {
  await setup(page, [P('A', 0), P('B', 600)], [{ id: 'F', name: 'f', sourceId: 'A', targetId: 'B' }]);
  await C.clickNode(page, 'A');
  await page.check('#props-input-disabled');
  expect(await page.evaluate(() => app.state.elements[0].isDisabled)).toBe(true);
  await expect(page.locator('#layers-nodes-group [data-id="A"]').first()).toHaveClass(/disabled/);
  const json = JSON.parse(await C.downloadText(page, '#btn-export'));
  expect(json.elements.find((e) => e.id === 'A').isDisabled).toBe(true);
  await page.click('#btn-undo');
  expect(await page.evaluate(() => app.state.elements[0].isDisabled)).toBeFalsy();
  await expect(page.locator('#layers-nodes-group [data-id="A"]').first()).not.toHaveClass(/disabled/);
});

test('a disabled data flow can be re-enabled from Properties', async ({ page }) => {
  // BUG: the 'Disabled' switch handler supports flows (bindUiEvents, props-input-disabled 'change' → flow.isDisabled), but
  // updatePropertiesInspectorView never shows #box-props-status-state for a flow, so a flow that arrives disabled
  // (import, older model) is drawn grey and left out of attack paths with no way to turn it back on in the UI.
  test.fail();
  await setup(page, [P('A', 0), P('B', 600)], [{ id: 'F', name: 'f', sourceId: 'A', targetId: 'B', isDisabled: true }]);
  await expect(flowLine(page, 'F')).toHaveClass(/disabled/);
  await selectFlow(page, 'F');
  await expect(page.locator('#props-input-disabled')).toBeVisible({ timeout: 2000 });
  await page.uncheck('#props-input-disabled');
  expect(await page.evaluate(() => app.state.flows[0].isDisabled)).toBe(false);
});

test('flow Properties: curve, dashed, bidirectional, thickness, colour and ports change the drawn line', async ({ page }) => {
  await setup(page, [P('A', 0), P('B', 600, 400)], [{ id: 'F', name: 'f', sourceId: 'A', targetId: 'B', points: [{ x: 450, y: 140 }] }]);
  await selectFlow(page, 'F');
  await page.selectOption('#props-flow-curve-select', 'sharp');
  await page.check('#props-flow-dashed-switch');
  await page.check('#props-flow-bidirectional-switch');
  await page.locator('#props-flow-thickness-slider').fill('6');
  await page.locator('#props-flow-color-grid .color-swatch-btn[data-color="red"]').click();
  await page.fill('#props-flow-ports-input', '443, 8443');
  await page.locator('#props-flow-ports-input').press('Tab');
  const f = await page.evaluate(() => app.state.flows[0]);
  expect(f).toMatchObject({ curveStyle: 'sharp', isDashed: true, isBidirectional: true, thickness: 6, color: 'red', ports: '443, 8443' });
  await expect(page.locator('#props-flow-thickness-lbl')).toHaveText('6');
  await page.evaluate(() => document.activeElement.blur());
  await page.keyboard.press('Escape');   // deselect so the line shows its own colour
  await expect.poll(() => page.evaluate(() => app.state.selectedFlowId)).toBeNull();
  const line = flowLine(page, 'F');
  await expect(line).toHaveAttribute('stroke-dasharray', '6,4');
  await expect(line).toHaveAttribute('stroke-width', '6');
  await expect(line).toHaveAttribute('marker-start', /url\(#/);
  expect(await line.getAttribute('d')).not.toContain('C');   // sharp: straight segments only
  expect(await line.getAttribute('stroke')).toBe('#dc3545');
  await expect(page.locator('#layers-flows-texts-group')).toContainText('443, 8443');
  const mmd = await page.evaluate(() => app.buildMermaidDiagram());
  expect(mmd).toContain('<-.->');
});

test('Clear bend points removes the bends of a flow as one undo step', async ({ page }) => {
  await setup(page, [P('A', 0), P('B', 600, 400)], [{ id: 'F', name: 'f', sourceId: 'A', targetId: 'B', points: [{ x: 450, y: 140 }, { x: 500, y: 300 }] }]);
  await selectFlow(page, 'F');
  await page.click('#btn-flow-clear-points');
  expect(await page.evaluate(() => app.state.flows[0].points)).toEqual([]);
  await page.click('#btn-undo');
  expect(await page.evaluate(() => app.state.flows[0].points.length)).toBe(2);
});

test('step activity: + and − change the number on the canvas, never below 1; colour and hide-details apply', async ({ page }) => {
  await setup(page, [{ id: 'S', type: 'step_activity', name: 'Login', x: 0, y: 200, width: 260, height: 50, stepNumber: 1 }]);
  await C.clickNode(page, 'S');
  await page.click('#btn-step-increment'); await page.click('#btn-step-increment');
  await expect(page.locator('#props-step-number')).toHaveValue('3');
  await expect(page.locator('#layers-nodes-group [data-id="S"]').first()).toContainText('3');
  for (let i = 0; i < 4; i++) await page.click('#btn-step-decrement');
  expect(await page.evaluate(() => app.state.elements[0].stepNumber)).toBe(1);
  await page.fill('#props-step-number', '7'); await page.locator('#props-step-number').press('Tab');
  expect(await page.evaluate(() => app.state.elements[0].stepNumber)).toBe(7);
  await page.locator('#props-step-color-grid .color-swatch-btn[data-color="green"]').click();
  expect(await page.evaluate(() => app.state.elements[0].circleColor)).toBe('green');
  await page.check('#props-step-hide-details');
  expect(await page.evaluate(() => app.state.elements[0].hideTextAndBox)).toBe(true);
  await expect(page.locator('#props-input-text-content')).toBeDisabled();
  await expect(page.locator('#layers-nodes-group [data-id="S"]').first()).not.toContainText('Login');
});

test('headline and textbox: text, orientation and font size change what is drawn', async ({ page }) => {
  await setup(page, [{ id: 'H', type: 'headline', name: 'DMZ', x: 0, y: 0, orientation: 'horizontal', fontSize: '24' }, { id: 'T', type: 'textbox', name: 'note', x: 600, y: 0 }]);
  await C.clickNode(page, 'H');
  await page.selectOption('#props-input-fontsize', '48');
  await page.selectOption('#props-input-orientation', 'vertical');
  expect(await page.evaluate(() => [app.state.elements[0].fontSize, app.state.elements[0].orientation])).toEqual(['48', 'vertical']);
  const html = await page.locator('#layers-nodes-group [data-id="H"]').first().innerHTML();
  expect(html).toContain('48px');
  expect(html).toMatch(/vertical|rotate/);
  await C.clickNode(page, 'T');
  await page.fill('#props-input-text-content', 'Reviewed by the CISO');
  await page.locator('#props-input-text-content').press('Tab');
  await expect(page.locator('#layers-nodes-group [data-id="T"]').first()).toContainText('Reviewed by the CISO');
  await page.click('#btn-undo');
  await expect(page.locator('#layers-nodes-group [data-id="T"]').first()).toContainText('note');
});

test('notes field saves on components and flows and shows in the Markdown report', async ({ page }) => {
  await setup(page, [P('A', 0), P('B', 600)], [{ id: 'F', name: 'f', sourceId: 'A', targetId: 'B' }]);
  await C.clickNode(page, 'A');
  await page.fill('#props-input-notes', 'Runs in the EU region');
  await page.locator('#props-input-notes').press('Tab');
  await selectFlow(page, 'F');
  await page.fill('#props-input-notes', 'Batch, nightly');
  await page.locator('#props-input-notes').press('Tab');
  expect(await page.evaluate(() => [app.state.elements[0].notes, app.state.flows[0].notes])).toEqual(['Runs in the EU region', 'Batch, nightly']);
  const md = await page.evaluate(() => app.buildMarkdownReport());
  expect(md).toContain('Runs in the EU region');
});

test('register: every column header sorts, and a second click reverses', async ({ page }) => {
  const threats = [
    { id: 'th-001', title: 'Bravo', category: 'Tampering', elementId: 'B', likelihood: '1', impact: '2', status: 'Open / Unmitigated' },
    { id: 'th-002', title: 'Alpha', category: 'Spoofing', elementId: 'A', likelihood: '5', impact: '5', status: 'Mitigated / Resolved' },
    { id: 'th-003', title: 'Charlie', category: 'Repudiation', elementId: 'C', likelihood: '3', impact: '3', status: 'Partially mitigated' },
  ];
  await setup(page, [P('Zed', 0, 0, { id: 'A', name: 'Zed' }), P('B', 600, 0, { name: 'Mid' }), P('C', 1200, 0, { name: 'Ant' })], [], threats);
  const ids = () => page.locator('#threat-register-tbody tr td:first-child').allInnerTexts().then((a) => a.map((s) => s.trim()));
  const cases = [['#th-sort-title', ['th-002', 'th-001', 'th-003']], ['#th-sort-category', ['th-003', 'th-002', 'th-001']],
    ['#th-sort-score', ['th-001', 'th-003', 'th-002']], ['#th-sort-component', ['th-003', 'th-001', 'th-002']],
    ['#th-sort-status', ['th-002', 'th-001', 'th-003']], ['#th-sort-id', ['th-001', 'th-002', 'th-003']]];
  for (const [th, asc] of cases) {
    await page.click(th);
    expect(await ids(), th + ' asc').toEqual(asc);
    await page.click(th);
    expect(await ids(), th + ' desc').toEqual([...asc].reverse());
  }
});

test('register: sorting by Severity orders by severity, not alphabetically', async ({ page }) => {
  // BUG: the Severity header sorts on the riskLabel text (threat-tiger.html renderThreatRegisterTableGrid, String compare),
  // so ascending gives Critical, High, Low, Medium instead of Low, Medium, High, Critical.
  test.fail();
  const mk = (n, l, i) => ({ id: `th-00${n}`, title: 'T' + n, elementId: 'A', likelihood: String(l), impact: String(i), riskLabel: ThreatLabel(l * i) });
  function ThreatLabel(s) { return s >= 15 ? 'Critical' : s >= 10 ? 'High' : s >= 5 ? 'Medium' : 'Low'; }
  await setup(page, [P('A', 0)], [], [mk(1, 5, 5), mk(2, 1, 1), mk(3, 3, 2), mk(4, 4, 3)]);
  const labels = await page.evaluate(() => app.state.threats.map((t) => app.constructor && ThreatModelSession.calculateRisk(t.likelihood, t.impact).label));
  expect(labels).toEqual(['Critical', 'Low', 'Medium', 'High']);
  await page.click('#th-sort-severity');
  const ids = await page.locator('#threat-register-tbody tr td:first-child').allInnerTexts();
  expect(ids.map((s) => s.trim())).toEqual(['th-002', 'th-003', 'th-004', 'th-001']);
});

test('register: severity filter, status filters (incl. Needs review) and search narrow the rows', async ({ page }) => {
  const threats = [
    { id: 'th-001', title: 'SQL injection', elementId: 'A', likelihood: '5', impact: '5' },
    { id: 'th-002', title: 'Weak TLS', elementId: 'A', likelihood: '1', impact: '1', status: 'Partially mitigated' },
    { id: 'th-003', title: 'No audit log', elementId: 'gone', likelihood: '3', impact: '3', status: 'Mitigated / Resolved' },
  ];
  await setup(page, [P('A', 0, 0, { name: 'Billing' })], [], threats);
  await C.importJson(page, await page.evaluate(() => JSON.stringify(app.state)));   // the import flags th-003 for review
  const rows = await C.registerRows(page);
  await page.selectOption('#filter-threat-severity', 'Critical');
  await expect(rows).toHaveCount(1); await expect(rows.first()).toContainText('th-001');
  await page.selectOption('#filter-threat-severity', 'Low');
  await expect(rows).toHaveCount(1); await expect(rows.first()).toContainText('th-002');
  await page.selectOption('#filter-threat-severity', '');
  await page.selectOption('#filter-threat-status', 'Partially mitigated');
  await expect(rows).toHaveCount(1);
  await page.selectOption('#filter-threat-status', '__review');
  await expect(rows).toHaveCount(1); await expect(rows.first()).toContainText('th-003');
  await page.selectOption('#filter-threat-status', '');
  await page.fill('#filter-threat-search', 'billing');
  await expect(rows).toHaveCount(2);
  await page.fill('#filter-threat-search', 'nothing matches this');
  await expect(rows).toHaveCount(0);
  await expect(page.locator('#threat-register-tbody')).toContainText('No threats match');
  await expect(page.locator('#badge-threat-count')).toHaveText('3');
});

test('mitigations tab: search and the status filter (incl. "Not done yet") narrow the rows', async ({ page }) => {
  await setup(page, [P('A', 0)]);
  await page.evaluate(() => {
    app.state.mitigations = [
      { id: 'mi-001', title: 'WAF rules', status: 'Implemented', owner: 'Net team' },
      { id: 'mi-002', title: 'MFA for admins', status: 'Proposed', owner: 'IAM' },
      { id: 'mi-003', title: 'Pen test', status: 'Not applicable' },
      { id: 'mi-004', title: 'Key rotation', status: 'In progress', desc: 'quarterly' },
    ];
    app.refreshAppViewVisualWorkspace();
  });
  await page.click('#tab-mitigations-trigger');
  const rows = page.locator('#mitigation-tbody tr[data-mitigation-id]');
  await expect(rows).toHaveCount(4);
  await page.selectOption('#filter-mitigation-status', '__open');
  await expect(rows).toHaveCount(2);
  expect(await rows.evaluateAll((r) => r.map((x) => x.dataset.mitigationId))).toEqual(['mi-002', 'mi-004']);
  await page.selectOption('#filter-mitigation-status', 'Implemented');
  await expect(rows).toHaveCount(1);
  await page.selectOption('#filter-mitigation-status', '');
  await page.fill('#filter-mitigation-search', 'iam');
  await expect(rows).toHaveCount(1); await expect(rows.first()).toContainText('MFA for admins');
  await page.fill('#filter-mitigation-search', 'quarterly');
  await expect(rows).toHaveCount(1); await expect(rows.first()).toContainText('Key rotation');
  await page.fill('#filter-mitigation-search', 'zzz');
  await expect(page.locator('#mitigation-tbody')).toContainText('No mitigations match');
});

test('threat templates: add, edit and delete a template from the Suggestions tab', async ({ page }) => {
  await setup(page, [P('A', 0, 0, { name: 'Billing' })]);
  await C.clickNode(page, 'A');
  await page.click('#tab-suggest-trigger');
  await page.click('#btn-add-template');
  await expect(page.locator('#modal-edit-template')).toBeVisible();
  await page.fill('#modal-template-title', 'Coverage custom threat on [name]');
  await page.selectOption('#modal-template-category', 'Elevation of Privilege');
  await page.fill('#modal-template-desc', 'A custom description long enough to be a template.');
  await page.fill('#modal-template-controls', 'Control one\nControl two');
  await page.fill('#modal-template-refs', 'CWE-269');
  await page.click('#btn-modal-template-save');
  await expect(page.locator('#modal-edit-template')).toBeHidden();
  const saved = await page.evaluate(() => app.threatSuggestions.process.find((t) => t.title.startsWith('Coverage custom')));
  expect(saved).toMatchObject({ category: 'Elevation of Privilege', controls: ['Control one', 'Control two'], refs: ['CWE-269'], userEdited: true });
  await page.fill('#input-templates-search', 'Coverage custom');
  const card = page.locator('#box-threat-suggestions-list .template-card', { hasText: 'Coverage custom' });
  await expect(card).toHaveCount(1);
  await expect(card).toContainText('Billing');   // [name] is filled in
  // Edit
  await card.locator('.btn-template-edit').click();
  await expect(page.locator('#modal-template-title')).toHaveValue('Coverage custom threat on [name]');
  await page.fill('#modal-template-title', 'Coverage edited threat on [name]');
  await page.click('#btn-modal-template-save');
  await page.fill('#input-templates-search', 'Coverage');
  await expect(page.locator('#box-threat-suggestions-list .template-card', { hasText: 'Coverage edited' })).toHaveCount(1);
  await expect(page.locator('#box-threat-suggestions-list .template-card', { hasText: 'Coverage custom' })).toHaveCount(0);
  // Delete (asks first), survives a reload
  await page.locator('#box-threat-suggestions-list .template-card', { hasText: 'Coverage edited' }).locator('.btn-template-delete').click();
  await page.click('#btn-confirm-delete');
  await expect(page.locator('#box-threat-suggestions-list .template-card', { hasText: 'Coverage' })).toHaveCount(0);
  await page.reload(); await page.waitForFunction(() => (window.app.threatSuggestions.process || []).length > 10);
  expect(await page.evaluate(() => app.threatSuggestions.process.some((t) => t.title.startsWith('Coverage')))).toBe(false);
});

test('threat templates: Save downloads the library and Load restores a custom template from that file', async ({ page }) => {
  await setup(page, [P('A', 0)]);
  await page.evaluate(() => { app.threatSuggestions.process.push({ category: 'Spoofing', title: 'Restorable template', desc: 'Kept in the backup file for this test.', controls: ['c'], refs: [], userEdited: true }); app.saveThreatTemplatesToLocalStorage(); });
  await C.clickNode(page, 'A');
  await page.click('#tab-suggest-trigger');
  const file = await C.downloadFile(page, () => page.click('#btn-export-templates'));
  expect(file.name).toBe('threat_templates.json');
  const data = JSON.parse(file.buffer.toString('utf8'));
  expect(data.process.some((t) => t.title === 'Restorable template')).toBe(true);
  await page.evaluate(() => { app.threatSuggestions.process = app.threatSuggestions.process.filter((t) => t.title !== 'Restorable template'); app.saveThreatTemplatesToLocalStorage(); });
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click('#btn-import-templates')]);
  await chooser.setFiles({ name: 'threat_templates.json', mimeType: 'application/json', buffer: file.buffer });
  await expect.poll(() => page.evaluate(() => app.threatSuggestions.process.filter((t) => t.title === 'Restorable template').length)).toBe(1);
  await page.fill('#input-templates-search', 'Restorable');
  await expect(page.locator('#box-threat-suggestions-list .template-card', { hasText: 'Restorable template' })).toHaveCount(1);
});

test('Suggestions sort menu orders the cards by title A-Z and Z-A', async ({ page }) => {
  await setup(page, [P('A', 0)]);
  await C.clickNode(page, 'A');
  await page.click('#tab-suggest-trigger');
  const titles = () => page.locator('#box-threat-suggestions-list .template-card .fw-bold.text-dark').allInnerTexts();
  await page.selectOption('#select-templates-sort', 'title-asc');
  const asc = await titles();
  expect(asc.length).toBeGreaterThan(3);
  const sorted = (a) => [...a].sort((x, y) => x.localeCompare(y, undefined, { sensitivity: 'base' }));
  // Sorted within each group (triggered / relevant / others), so check a run of the first group only.
  const firstRun = asc.slice(0, 3);
  expect(firstRun).toEqual(sorted(firstRun));
  await page.selectOption('#select-templates-sort', 'title-desc');
  const desc = await titles();
  expect(desc.slice(0, 3)).toEqual(sorted(desc.slice(0, 3)).reverse());
  expect(desc).not.toEqual(asc);
});

test('the storage-failure banner offers an export that downloads the current model', async ({ page }) => {
  await setup(page, [P('A', 0, 0, { name: 'Unsaved work' })]);
  await page.evaluate(() => { Storage.prototype.setItem = function () { throw new DOMException('full', 'QuotaExceededError'); }; app.saveSessionToLocalStorage(); });
  await expect(page.locator('#alert-storage-failure')).toBeVisible();
  const file = await C.downloadFile(page, () => page.click('#btn-storage-failure-export'));
  const json = JSON.parse(file.buffer.toString('utf8'));
  expect(json.elements.map((e) => e.name)).toEqual(['Unsaved work']);
});

test('Mermaid import: "Choose file" loads the file into the box and shows its name', async ({ page }) => {
  await C.emptyApp(page);
  await C.clickControl(page, '#btn-import-mermaid');
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click('#btn-mermaid-file')]);
  await chooser.setFiles({ name: 'shop.mmd', mimeType: 'text/plain', buffer: Buffer.from('flowchart LR\n  a[Shop] --> b[(Orders)]\n') });
  await expect(page.locator('#mermaid-import-text')).toHaveValue(/a\[Shop\]/);
  await expect(page.locator('#mermaid-import-filename')).toHaveText('shop.mmd');
  await expect(page.locator('#mermaid-import-mode')).toBeHidden();   // empty model: no add/replace question
  await page.click('#btn-mermaid-import-go');
  await expect.poll(() => page.evaluate(() => app.state.elements.map((e) => e.name).sort())).toEqual(['Orders', 'Shop']);
});

test('Help & License shows the same version as package.json, and the header shows it too', async ({ page }) => {
  await C.emptyApp(page);
  await C.clickControl(page, '#btn-help-trigger');
  await expect(page.locator('#modal-help')).toBeVisible();
  await expect(page.locator('#modal-help')).toContainText(C.PKG.version);
  await C.modalReady(page, 'modal-help');
  await page.keyboard.press('Escape');
  await C.noModal(page);
  const versions = await page.locator('[data-app-version]').allInnerTexts();
  expect(versions.length).toBeGreaterThan(0);
  expect(new Set(versions)).toEqual(new Set([C.PKG.version]));
  const json = JSON.parse(await C.downloadText(page, '#btn-export'));
  expect(json.appVersion).toBe(C.PKG.version);
});

test('View menu: every panel-tab switch hides and shows its own tab', async ({ page }) => {
  await C.openApp(page, { session: C.demoSession() });
  const tabs = ['tab-props-trigger', 'tab-suggest-trigger', 'tab-layers-trigger', 'tab-register-trigger', 'tab-mitigations-trigger', 'tab-insights-trigger', 'tab-notes-trigger'];
  await page.click('#btn-main-menu'); await page.click('#btn-menu-view');
  for (const t of tabs) {
    const item = page.locator(`#btn-menu-tab-${t}`);
    await item.click();
    await expect(page.locator('#' + t)).toBeHidden();
    await expect(item).toHaveAttribute('aria-checked', 'false');
    await item.click();
    await expect(page.locator('#' + t)).toBeVisible();
    await expect(item).toHaveAttribute('aria-checked', 'true');
  }
});

test('View menu: every icon-set switch hides and shows its set in the palette', async ({ page }) => {
  await C.openApp(page, { session: C.demoSession() });
  await page.evaluate(() => document.getElementById('collapseDataNodes').classList.add('show'));
  const sets = await page.locator('[data-stencil-toggle]').evaluateAll((els) => els.map((e) => e.dataset.stencilToggle));
  expect(sets.length).toBe(8);
  await page.click('#btn-main-menu'); await page.click('#btn-menu-view');
  for (const s of sets) {
    await expect(page.locator(`[data-stencil-set="${s}"]`)).toBeVisible();
    await page.click(`#btn-menu-stencil-${s}`);
    await expect(page.locator(`[data-stencil-set="${s}"]`)).toBeHidden();
    await expect(page.locator(`#btn-menu-stencil-${s}`)).toHaveAttribute('aria-checked', 'false');
    await page.click(`#btn-menu-stencil-${s}`);
    await expect(page.locator(`[data-stencil-set="${s}"]`)).toBeVisible();
  }
});

test('the operator badge opens the name dialog from the keyboard too', async ({ page }) => {
  await C.emptyApp(page);
  await page.locator('#lbl-active-operator').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#modal-operator')).toBeVisible();
  await page.fill('#input-operator-name', 'Kim');
  await page.click('#btn-operator-save');
  await expect(page.locator('#lbl-active-operator')).toHaveText('Kim');
  await page.click('#pal-process');
  await page.click('#tab-notes-trigger');
  await expect(page.locator('#activity-ledger-tbody tr').first()).toContainText('Kim');
});

test('session title, scope and participants entered before any shape survive a reload', async ({ page }) => {
  // BUG: init() replaces a stored model that has no elements with a new ThreatModelSession (threat-tiger.html, init:
  // "if (!hasStoredSession || this.state.elements.length === 0)"), so metadata, mitigations and threats typed in before the
  // first shape are thrown away on reload.
  test.fail();
  await C.emptyApp(page);
  await page.click('#btn-open-session-meta');
  await page.fill('#modal-meta-project-title', 'Kept title');
  await page.fill('#modal-meta-scope', 'Kept scope');
  await page.click('#btn-modal-session-save');
  await expect(page.locator('#project-title-badge')).toHaveText('Kept title');
  await page.reload(); await page.waitForFunction(() => window.app && window.app.state);
  await expect(page.locator('#project-title-badge')).toHaveText('Kept title', { timeout: 2000 });
});

test('flowchart style: fill, stroke and width change the shape; each change is its own undo step', async ({ page }) => {
  await setup(page, [{ id: 'Q', type: 'fc_process', name: 'Step', x: 0, y: 200, width: 160, height: 70 }]);
  await C.clickNode(page, 'Q');
  await page.locator('#props-fc-fill-grid .color-swatch-btn[data-color="#dcfce7"]').click();
  await page.locator('#props-fc-stroke-grid .color-swatch-btn[data-color="#dc2626"]').click();
  await page.locator('#props-fc-stroke-width').fill('5');
  const q = await page.evaluate(() => app.state.elements[0]);
  expect([q.fcFillColor, q.fcStrokeColor, q.fcStrokeWidth]).toEqual(['#dcfce7', '#dc2626', 5]);
  const html = await page.locator('#layers-nodes-group [data-id="Q"]').first().innerHTML();
  expect(html).toContain('#dcfce7'); expect(html).toContain('#dc2626');
  await page.fill('#props-fc-label', 'Renamed step');
  await page.locator('#props-fc-label').press('Tab');
  // One Undo should take back only the rename.
  // BUG: the fill/stroke/width handlers (bindUiEvents, '#props-fc-fill-grid' etc.) never call logEvent, so those edits
  // get no undo step or activity entry of their own and are folded into the next logged change: Undo of the rename also
  // reverts the colours and width.
  test.fail();
  await page.click('#btn-undo');
  const after = await page.evaluate(() => app.state.elements[0]);
  expect(after.name).toBe('Step');
  expect([after.fcFillColor, after.fcStrokeColor, after.fcStrokeWidth]).toEqual(['#dcfce7', '#dc2626', 5]);
});
