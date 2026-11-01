// Menu, print report, Mermaid export, icon library, selection hit areas.
const { test } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const { clickControl, expect, openApp, demoSession, downloadText } = require('./helpers');

test('header actions live in the hamburger menu; canvas print button is gone', async ({ page }) => {
  await openApp(page, { session: demoSession() });
  for (const id of ['#btn-import', '#btn-export', '#btn-snapshots', '#btn-print-report', '#btn-export-mermaid', '#btn-help-trigger', '#btn-reset-session']) {
    await expect(page.locator(`.dropdown-menu ${id}`)).toHaveCount(1);
  }
  await expect(page.locator('#btn-import')).toBeHidden();
  await expect(page.locator('#btn-canvas-print')).toHaveCount(0);
  await page.click('#btn-main-menu');
  await expect(page.locator('#btn-import')).toBeVisible();
});

test('Print report triggers the browser print dialog', async ({ page }) => {
  await openApp(page, { session: demoSession() });
  await page.evaluate(() => { window.__printed = 0; window.print = () => { window.__printed++; }; });
  await clickControl(page, '#btn-print-report');
  expect(await page.evaluate(() => window.__printed)).toBe(1);
});

test('Mermaid export: shapes, zones, flows, escaping', async ({ page }) => {
  const demo = demoSession((s) => { s.elements.find((e) => e.type === 'process').name = 'Say "hi" <b>'; });
  await openApp(page, { session: demo });
  const mmd = await downloadText(page, '#btn-export-mermaid');
  expect(mmd.startsWith('flowchart LR')).toBe(true);
  expect(mmd).toContain('#quot;hi#quot; #lt;b#gt;');
  expect(mmd).not.toMatch(/<b>/);
  expect(mmd).toMatch(/subgraph z1\[/);
  expect(mmd).toMatch(/\[\("[^"]+"\)\]/);                          // a data store cylinder
  const edges = mmd.split('\n').filter((l) => /-->|<-->|-\.->/.test(l)).length;
  expect(edges).toBe(demo.flows.length);
});

test('every icon in the library exists in the bundled Bootstrap Icons font', async ({ page }) => {
  const css = fs.readFileSync(path.join(__dirname, '..', 'vendor/bootstrap-icons-1.13.2/bootstrap-icons.min.css'), 'utf8');
  await openApp(page);
  const icons = await page.evaluate(() => {
    // Collect every icon offered by the inspector for each component type.
    const out = new Set();
    for (const type of ['process', 'datastore', 'interactor', 'infrastructure']) {
      const sel = document.createElement('select');
      const item = { type, icon: '' };
      app.populateIconSelect(sel, item, []);
      [...sel.options].forEach((o) => out.add(o.value));
    }
    document.querySelectorAll('#props-input-icon option').forEach((o) => out.add(o.value));
    return [...out];
  });
  expect(icons.length).toBeGreaterThan(80);
  const missing = icons.filter((i) => !css.includes(`.${i}::before`));
  expect(missing).toEqual([]);
});

test('icon dropdown offers grouped extra icons and applies the choice', async ({ page }) => {
  const demo = demoSession();
  await openApp(page, { session: demo });
  const ds = demo.elements.find((e) => e.type === 'datastore');
  await page.evaluate((id) => { app.state.selectedElementIds = [id]; app.refreshAppViewVisualWorkspace(); }, ds.id);
  const groups = await page.locator('#props-input-icon optgroup').evaluateAll((g) => g.map((x) => x.label));
  expect(groups).toEqual(expect.arrayContaining(['Typical', 'Databases & storage', 'Security & identity']));
  await page.selectOption('#props-input-icon', 'bi-database-lock');
  expect(await page.evaluate((id) => app.state.elements.find((e) => e.id === id).icon, ds.id)).toBe('bi-database-lock');
});

test('selection: clicking the middle of a data flow line selects it', async ({ page }) => {
  const demo = demoSession();
  await openApp(page, { session: demo });
  // Pick a flow whose midpoint is on screen and not covered by its own label.
  const target = await page.evaluate(() => {
    const svg = document.getElementById('canvas-svg').getBoundingClientRect();
    for (const g of document.querySelectorAll('#layers-flows-paths-group > g')) {
      const p = g.querySelector('path.flow-line'); const L = p.getTotalLength();
      for (const f of [0.3, 0.7]) {
        const pt = p.getPointAtLength(L * f); const m = p.getScreenCTM();
        const x = pt.x * m.a + pt.y * m.c + m.e, y = pt.x * m.b + pt.y * m.d + m.f;
        if (x < svg.left + 5 || x > svg.right - 5 || y < svg.top + 5 || y > svg.bottom - 60) continue;
        const hit = document.elementFromPoint(x + 4, y + 4);   // 4px off the line: needs the wide hit area
        if (hit && hit.closest('#layers-flows-paths-group')) {
          const idx = [...document.querySelectorAll('#layers-flows-paths-group > g')].indexOf(g);
          return { x: x + 4, y: y + 4, idx };
        }
      }
    }
    return null;
  });
  expect(target).not.toBeNull();
  await page.mouse.click(target.x, target.y);
  const selected = await page.evaluate(() => app.state.selectedFlowId);
  expect(selected).toBeTruthy();
});

test('selection: invisible connection dots and label boxes do not capture clicks', async ({ page }) => {
  await openApp(page, { session: demoSession() });
  const r = await page.evaluate(() => {
    const cs = (sel) => { const el = document.querySelector(sel); return el ? getComputedStyle(el).pointerEvents : 'n/a'; };
    return { dot: cs('.node-connect-indicator'), label: cs('.flow-label-fo'), badgeFo: cs('.badge-fo') };
  });
  expect(r.dot).toBe('none');
  expect(r.label).toBe('none');
  expect(['none', 'n/a']).toContain(r.badgeFo);
});

test('SEC-006: "Clear all data in this browser" removes the model, snapshots and preferences', async ({ page }) => {
  await openApp(page, { session: demoSession() });
  await page.evaluate(async () => { app.takeSnapshot('test', true); localStorage.setItem('threat_tiger_operator_name', 'X'); await new Promise((r) => setTimeout(r, 300)); });
  expect(await page.evaluate(async () => (await SnapshotStore.list()).length)).toBeGreaterThan(0);
  await clickControl(page, '#btn-clear-local-data');
  await Promise.all([page.waitForEvent('load'), page.click('#btn-confirm-delete')]);
  await page.waitForFunction(() => window.app && window.app.state);
  const r = await page.evaluate(async () => ({
    elements: app.state.elements.length,
    keys: Object.keys(localStorage).filter((k) => /^(stride_workbench_session|threat_tiger_operator|threat_tiger_template)/.test(k)),
    snapshots: (await SnapshotStore.list()).length,
  }));
  expect(r).toEqual({ elements: 0, keys: [], snapshots: 0 });
});

test('SEC-008: the activity log says it is not a tamper-proof audit trail', async ({ page }) => {
  await openApp(page, { session: demoSession() });
  await page.click('#tab-notes-trigger');
  await expect(page.locator('#activity-log-note')).toContainText('not a tamper-proof audit trail');
});
