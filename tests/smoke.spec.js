// TEST-001: smoke tests for the main workflows.
const { test } = require('@playwright/test');
const { expect, openApp, demoSession, importJson, downloadText, registerRows, trackPageErrors } = require('./helpers');

test('app boots without errors and loads templates', async ({ page }) => {
  const errors = trackPageErrors(page);
  await openApp(page);
  const counts = await page.evaluate(() => Object.fromEntries(Object.entries(app.threatSuggestions).map(([k, v]) => [k, v.length])));
  expect(counts.process).toBeGreaterThan(0);
  expect(counts.datastore).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test('demo model renders all elements and threats', async ({ page }) => {
  const errors = trackPageErrors(page);
  const demo = demoSession();
  await openApp(page, { session: demo });
  const nodeIds = await page.locator('#canvas-svg [data-id]').evaluateAll((els) => new Set(els.map((e) => e.getAttribute('data-id'))).size);
  expect(nodeIds).toBeGreaterThanOrEqual(demo.elements.length);
  await expect(await registerRows(page)).toHaveCount(demo.threats.length);
  expect(errors).toEqual([]);
});

test('a custom threat can be added through the modal', async ({ page }) => {
  await openApp(page, { session: demoSession() });
  await page.click('#btn-register-add-custom');
  await page.fill('#modal-threat-title', 'Smoke test threat');
  await page.click('#btn-modal-threat-save');
  await expect(page.locator('#threat-register-tbody')).toContainText('Smoke test threat');
  const stored = await page.evaluate(() => app.state.threats.map((t) => t.title));
  expect(stored).toContain('Smoke test threat');
});

test('JSON export can be re-imported without losing data', async ({ page }) => {
  const errors = trackPageErrors(page);
  const demo = demoSession();
  await openApp(page, { session: demo });
  const exported = await downloadText(page, '#btn-export');
  const parsed = JSON.parse(exported);
  expect(parsed.elements).toHaveLength(demo.elements.length);
  expect(parsed.threats).toHaveLength(demo.threats.length);

  await page.evaluate(() => { app.state.elements = []; app.state.threats = []; app.refreshAppViewVisualWorkspace(); });
  await importJson(page, exported);
  const after = await page.evaluate(() => ({ e: app.state.elements.length, t: app.state.threats.length, f: app.state.flows.length }));
  expect(after).toEqual({ e: demo.elements.length, t: demo.threats.length, f: demo.flows.length });
  expect(errors).toEqual([]);
});
