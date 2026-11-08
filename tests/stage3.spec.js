// Regression tests for Stage 3: record policy, logging, paste, templates, validation.
const { test } = require('@playwright/test');
const { expect, openApp, demoSession, importJson, registerRows } = require('./helpers');

test('policy: broken threat records are repaired, flagged, and never shown as mitigated', async ({ page }) => {
  const model = demoSession((s) => {
    const el = s.elements[0].id;
    s.threats = [
      { id: 'th-001', elementId: el, category: 'spoofing', status: 'mitigated / resolved', title: 'Case only' },
      { id: 'th-002', elementId: el, category: 'Bogus', status: 'Done?', title: '' },
      { id: 'th-003', elementId: 'missing', category: 'Tampering', status: 'Open / Unmitigated', title: 'Orphan' },
    ];
  });
  await openApp(page);
  await importJson(page, JSON.stringify(model));
  const t = await page.evaluate(() => app.state.threats.map(({ id, title, category, status, needsReview }) => ({ id, title, category, status, needsReview: !!needsReview })));
  expect(t).toEqual([
    { id: 'th-001', title: 'Case only', category: 'Spoofing', status: 'Mitigated / Resolved', needsReview: false },
    { id: 'th-002', title: 'Untitled threat', category: 'Bogus', status: 'Open / Unmitigated', needsReview: true },
    { id: 'th-003', title: 'Orphan', category: 'Tampering', status: 'Open / Unmitigated', needsReview: true },
  ]);
  await expect(page.locator('#threat-register-tbody .badge', { hasText: 'Review' })).toHaveCount(2);
});

test('BUG-012: theme and zoom changes are not logged as model changes', async ({ page }) => {
  await openApp(page, { session: demoSession() });
  const before = await page.evaluate(() => app.state.activityLog.length);
  await page.evaluate(() => { app.toggleCanvasTheme(); app.zoomToFit(); app.toggleCanvasTheme(); });
  expect(await page.evaluate(() => app.state.activityLog.length)).toBe(before);
});

test('BUG-013: paste copies internal flows and offsets each paste further', async ({ page }) => {
  const demo = demoSession();
  await openApp(page, { session: demo });
  const r = await page.evaluate((flow) => {
    app.state.selectedElementIds = [flow.sourceId, flow.targetId]; app.state.selectedFlowId = null;
    app.copySelection(); app.pasteSelection(); app.pasteSelection();
    const copies = app.state.elements.filter((e) => e.name.endsWith(' - copy'));
    const src = app.state.elements.find((e) => e.id === flow.sourceId);
    const newIds = new Set(copies.map((e) => e.id));
    return {
      copies: copies.length,
      pastedFlows: app.state.flows.filter((f) => newIds.has(f.sourceId) && newIds.has(f.targetId)).length,
      offsets: copies.filter((c) => c.name === src.name + ' - copy').map((c) => c.x - src.x),
    };
  }, demo.flows[0]);
  expect(r.copies).toBe(4);
  expect(r.pastedFlows).toBeGreaterThanOrEqual(2);
  expect(r.offsets).toEqual([30, 60]);
});

test('BUG-014: new activity entries use ISO timestamps and display in local time', async ({ page }) => {
  await openApp(page, { session: demoSession() });
  const ts = await page.evaluate(() => { app.logEvent('CHANGE', 'probe'); return app.state.activityLog[0].timestamp; });
  expect(ts).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  const shown = await page.locator('#activity-ledger-tbody tr td').first().textContent();
  expect(shown).not.toMatch(/\d{4}-\d{2}-\d{2}T/);   // raw ISO is not shown; local format is
});

test('BUG-015: saving a threat without a title shows a validation message', async ({ page }) => {
  await openApp(page, { session: demoSession() });
  await page.click('#btn-register-add-custom');
  await page.click('#btn-modal-threat-save');
  await expect(page.locator('#modal-threat-title')).toHaveClass(/is-invalid/);
  await expect(page.locator('#modal-threat-title-feedback')).toBeVisible();
});

test('BUG-005: a renamed built-in template does not come back as a duplicate', async ({ page }) => {
  await openApp(page);
  await page.waitForFunction(() => app.threatSuggestions && (app.threatSuggestions.process || []).length);   // library loads async
  const original = await page.evaluate(() => {
    const t = app.threatSuggestions.process[0];
    app.openEditTemplateModal(t, 'process');
    document.getElementById('modal-template-title').value = 'Renamed by test';
    app.saveTemplate();
    return t.title;
  });
  await page.reload();
  await page.waitForFunction(() => window.app && window.app.state);
  await page.waitForTimeout(300);
  const titles = await page.evaluate(() => app.threatSuggestions.process.map((t) => t.title));
  expect(titles).toContain('Renamed by test');
  expect(titles).not.toContain(original);
});

test('PERF-003: the ledger renders a bounded page with a "show older" button', async ({ page }) => {
  const s = demoSession((m) => { m.activityLog = Array.from({ length: 1200 }, (_, i) => ({ timestamp: 't', operator: 'o', type: 'CHANGE', message: 'm' + i })); });
  await openApp(page, { session: s });
  await expect(page.locator('#activity-ledger-tbody tr.ledger-row')).toHaveCount(200);
  await page.evaluate(() => document.querySelector('#ledger-more-row button').click());
  await expect(page.locator('#activity-ledger-tbody tr.ledger-row')).toHaveCount(400);
});

test('register search also matches description text', async ({ page }) => {
  const demo = demoSession((s) => { s.threats[0].desc = 'needle-in-description'; });
  await openApp(page, { session: demo });
  await page.fill('#filter-threat-search', 'needle-in-description');
  await expect(await registerRows(page)).toHaveCount(1);
});

test('PERF-004: dragging a component with the mouse still moves it and saves the position', async ({ page }) => {
  const demo = demoSession();
  await openApp(page, { session: demo });
  const proc = demo.elements.find((e) => e.type === 'process');
  const node = page.locator(`#layers-nodes-group [data-id="${proc.id}"]`).first();
  const box = await node.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) await page.mouse.move(box.x + box.width / 2 + i * 12, box.y + box.height / 2 + i * 6);
  await page.mouse.up();
  const after = await page.evaluate((id) => app.state.elements.find((e) => e.id === id), proc.id);
  expect(after.x).toBeGreaterThan(proc.x + 60);
  await page.waitForTimeout(400); // debounced save
  const stored = await page.evaluate((id) => JSON.parse(localStorage.getItem('stride_workbench_session_manifest_v26')).elements.find((e) => e.id === id).x, proc.id);
  expect(stored).toBe(after.x);
});
