// TEST-005 (ARCH-002): malformed or legacy model files must load safely or be rejected cleanly.
const { test } = require('@playwright/test');
const { expect, openApp, demoSession, importJson, trackPageErrors, DEMO } = require('./helpers');

const fixtures = {
  'missing arrays': { projectTitle: 'Only a title' },
  'null arrays': { elements: null, flows: null, threats: null, activityLog: null },
  'threat without title/category/status': { elements: [{ id: 'el-1', type: 'process', name: 'A', x: 0, y: 0, width: 200, height: 80, secProps: {} }], threats: [{ id: 'th-001', elementId: 'el-1' }] },
  'wrong types': { elements: 'nope', flows: {}, threats: 42, participants: ['a'], projectTitle: 7 },
  'element without id': { elements: [{ type: 'process', name: 'no id', x: 0, y: 0 }] },
  'flow pointing to missing nodes': { elements: [], flows: [{ id: 'fl-1', sourceId: 'x', targetId: 'y', name: 'dangling' }] },
  'future schema version': { schemaVersion: 999, elements: [], flows: [], threats: [] },
  'array instead of object': [1, 2, 3],
};

for (const [name, fixture] of Object.entries(fixtures)) {
  test(`import fixture: ${name}`, async ({ page }) => {
    await openApp(page, { session: demoSession() });
    const errors = trackPageErrors(page);
    await importJson(page, JSON.stringify(fixture));
    expect(errors).toEqual([]);
    // The app must still be fully usable and survive a reload.
    const state = await page.evaluate(() => ({
      arrays: ['elements', 'flows', 'threats', 'activityLog'].every((k) => Array.isArray(app.state[k])),
      titles: app.state.threats.every((t) => typeof t.title === 'string'),
    }));
    expect(state).toEqual({ arrays: true, titles: true });
    await page.reload();
    await page.waitForFunction(() => window.app && window.app.state);
    expect(errors).toEqual([]);
  });
}

test('legacy demo.json (old anchor ids) imports with all flows', async ({ page }) => {
  await openApp(page);
  const errors = trackPageErrors(page);
  await importJson(page, JSON.stringify(DEMO));
  expect(errors).toEqual([]);
  expect(await page.evaluate(() => app.state.flows.length)).toBe(DEMO.flows.length);
  expect(await page.evaluate(() => app.state.flows.every((f) => ['top', 'bottom', 'left', 'right'].includes(f.sourceAnchor.split('-')[0])))).toBe(true);
});

test('stored risk label is recomputed from likelihood x impact (BUG-011)', async ({ page }) => {
  const demo = demoSession((s) => { Object.assign(s.threats[0], { likelihood: '5', impact: '5', riskScore: 1, riskLabel: 'Low' }); });
  await openApp(page);
  await importJson(page, JSON.stringify(demo));
  const t = await page.evaluate((id) => app.state.threats.find((x) => x.id === id), demo.threats[0].id);
  expect({ score: t.riskScore, label: t.riskLabel }).toEqual({ score: 25, label: 'Critical' });
});
