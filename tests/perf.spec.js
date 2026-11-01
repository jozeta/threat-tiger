// TEST-006: performance budgets on a large synthetic model (500 components, 10,000 log entries).
// Budgets are deliberately generous so the test is stable on slower machines; numbers are printed for tracking.
const { test } = require('@playwright/test');
const { expect, openApp } = require('./helpers');

test('large model stays within interaction budgets', async ({ page }) => {
  await openApp(page);
  const r = await page.evaluate(() => {
    const S = app.state.constructor; const s = new S(); s.activeUser = 'Perf';
    const n = 500;
    for (let i = 0; i < n; i++) s.elements.push({ id: 'el-' + i, type: i % 3 ? 'process' : 'datastore', name: 'Node ' + i, x: (i % 20) * 260, y: Math.floor(i / 20) * 160, width: 200, height: 80, secProps: {}, icon: 'bi-gear' });
    for (let i = 1; i < n; i++) s.flows.push({ id: 'fl-' + i, name: 'f' + i, sourceId: 'el-' + (i - 1), targetId: 'el-' + i, sourceAnchor: 'right', targetAnchor: 'left', secProps: {}, bendX: 0, bendY: 0, textOffset: 0.5, points: [] });
    for (let i = 0; i < n; i++) s.threats.push({ id: 'th-' + String(i + 1).padStart(3, '0'), title: 'T' + i, category: 'Tampering', elementId: 'el-' + i, status: 'Open / Unmitigated', likelihood: '3', impact: '3' });
    for (let i = 0; i < 10000; i++) s.activityLog.push({ timestamp: 't', operator: 'P', type: 'CHANGE', message: 'm' + i });
    app.state = s; app.refreshAppViewVisualWorkspace();

    const time = (fn) => { document.body.offsetHeight; const t = performance.now(); fn(); document.body.offsetHeight; return +(performance.now() - t).toFixed(1); };
    const logEvent = time(() => app.logEvent('CHANGE', 'x'));
    const refresh = time(() => app.refreshAppViewVisualWorkspace());
    app.state.selectedElementIds = app.state.elements.slice(0, 20).map((e) => e.id);
    const plan = app.planSelectionRemoval();
    const delete20 = time(() => app.applySelectionRemoval(plan));
    return { logEvent, refresh, delete20, domNodes: document.getElementsByTagName('*').length };
  });
  console.log('[perf]', JSON.stringify(r));
  expect(r.logEvent).toBeLessThan(10);
  expect(r.delete20).toBeLessThan(250);
  expect(r.domNodes).toBeLessThan(40000);
});
