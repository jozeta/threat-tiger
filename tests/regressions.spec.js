// TEST-002: one regression test per confirmed bug from the audit.
// Each test asserts the CORRECT behaviour, so it fails until the bug is fixed.
const { test } = require('@playwright/test');
const { expect, openApp, demoSession, importJson, downloadText, registerRows, trackPageErrors, SESSION_KEY } = require('./helpers');

test('BUG-001: a malformed import does not break the app on reload', async ({ page }) => {
  await openApp(page, { session: demoSession() });
  // Realistic broken file: has components (so startup keeps it) but one threat lacks a title.
  await importJson(page, JSON.stringify({
    elements: [{ id: 'el-1', type: 'process', name: 'A', x: 10, y: 10, width: 200, height: 80, secProps: {} }],
    threats: [{ id: 'th-001', elementId: 'el-1' }],
  }));
  const errors = trackPageErrors(page);
  await page.reload();
  await page.waitForFunction(() => window.app && window.app.state);
  expect(errors).toEqual([]);
  // The app finished booting (init ran to the end and rendered the register).
  await expect(page.locator('#threat-register-tbody tr').first()).toBeVisible();
});

test('BUG-002: CSV export keeps every threat when text contains "#"', async ({ page }) => {
  const demo = demoSession((s) => { s.threats[0].desc = 'Use C# client; see ticket #42'; });
  await openApp(page, { session: demo });
  const csv = await downloadText(page, '#btn-register-export-csv');
  const dataRows = csv.trim().split(/\r?\n/).length - 1;
  expect(dataRows).toBe(demo.threats.length);
  expect(csv).toContain('Use C# client; see ticket #42');
});

test('BUG-003: deleting a node also removes threats on its cascaded flows', async ({ page }) => {
  const demo = demoSession((s) => {
    s.threats.push({ id: 'th-900', title: 'flow threat', category: 'Tampering', elementId: s.flows[0].id, status: 'Open / Unmitigated', likelihood: '3', impact: '3', riskScore: 9, riskLabel: 'Medium' });
  });
  await openApp(page, { session: demo });
  const orphans = await page.evaluate((nodeId) => {
    window.confirm = () => true;
    app.state.selectedElementIds = [nodeId]; app.state.selectedFlowId = null;
    app.executeTargetedActiveSelectionRemovalTask();
    const ids = new Set([...app.state.elements, ...app.state.flows].map((x) => x.id));
    return app.state.threats.filter((t) => !ids.has(t.elementId)).map((t) => t.id);
  }, demo.flows[0].sourceId);
  expect(orphans).toEqual([]);
});

test('BUG-004: a data store only gets data-store templates', async ({ page }) => {
  const demo = demoSession();
  await openApp(page, { session: demo });
  const result = await page.evaluate(() => {
    const ds = app.state.elements.find((e) => e.type === 'datastore');
    app.disabledStrideFilters.clear();
    app.state.selectedElementIds = [ds.id]; app.state.selectedFlowId = null;
    app.updateThreatSuggestionsWizardView();
    return { shown: document.querySelectorAll('#box-threat-suggestions-list .card.palette-item').length, library: app.threatSuggestions.datastore.length };
  });
  expect(result.shown).toBe(result.library);
});

test('BUG-005: a deleted built-in template stays deleted after reload', async ({ page }) => {
  await openApp(page);
  const title = await page.evaluate(() => {
    window.confirm = () => true;
    const victim = app.threatSuggestions.process[0];
    app.deleteTemplate(victim, 'process');
    return victim.title;
  });
  await page.reload();
  await page.waitForFunction(() => window.app && window.app.state);
  await page.waitForTimeout(300);
  const present = await page.evaluate((t) => app.threatSuggestions.process.some((x) => x.title === t), title);
  expect(present).toBe(false);
});

test('BUG-006: a storage quota failure is reported, not thrown', async ({ page }) => {
  await openApp(page, { session: demoSession() });
  const outcome = await page.evaluate(() => {
    app.state.elements.push({ id: 'el-big', type: 'custom_image', name: 'big', x: 0, y: 0, width: 100, height: 100, imageUrl: 'data:image/png;base64,' + 'A'.repeat(6 * 1024 * 1024) });
    try { app.saveSessionToLocalStorage(); return 'no-throw'; } catch (e) { return 'threw ' + e.name; }
  });
  expect(outcome).toBe('no-throw');
  await expect(page.locator('#alert-storage-failure')).toBeVisible();
});

test('BUG-007: names containing markup characters render verbatim', async ({ page }) => {
  const demo = demoSession((s) => { s.elements.find((e) => e.type === 'datastore').name = 'Orders <PII> & Logs'; });
  await openApp(page, { session: demo });
  await expect(page.locator('#layers-nodes-group')).toContainText('Orders <PII> & Logs');
});

test('BUG-008: register search matches component names', async ({ page }) => {
  const demo = demoSession();
  await openApp(page, { session: demo });
  const target = demo.elements.find((e) => e.id === demo.threats[3].elementId);
  const expected = demo.threats.filter((t) => t.elementId === target.id).length;
  await page.fill('#filter-threat-search', target.name);
  await expect(await registerRows(page)).toHaveCount(expected);
});

test('BUG-009: invalid JSON import shows an error and keeps the model', async ({ page }) => {
  const demo = demoSession();
  await openApp(page, { session: demo });
  const errors = trackPageErrors(page);
  await importJson(page, '{ not json');
  expect(errors).toEqual([]);
  await expect(page.locator('#app-toast-container')).toContainText(/could not|invalid|failed/i);
  expect(await page.evaluate(() => app.state.elements.length)).toBe(demo.elements.length);
});

test('BUG-010: deleting a node with threats asks for confirmation', async ({ page }) => {
  const demo = demoSession();
  await openApp(page, { session: demo });
  const nodeId = demo.threats[0].elementId;
  await page.evaluate((id) => { app.state.selectedElementIds = [id]; app.state.selectedFlowId = null; app.refreshAppViewVisualWorkspace(); }, nodeId);
  await page.locator('#canvas-svg').focus();
  await page.keyboard.press('Delete');
  await expect(page.locator('#modal-confirm-delete')).toBeVisible();
  expect(await page.evaluate((id) => app.state.elements.some((e) => e.id === id), nodeId)).toBe(true);
});
