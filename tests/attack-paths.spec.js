// Attack paths: routes from entry points to crown jewels through the data flows, ranked by risk.
const { test } = require('@playwright/test');
const { expect, openApp, demoSession } = require('./helpers');

async function setup(page) {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await openApp(page, { session: demoSession() });
}

const M = (extra = {}) => ({
  elements: [
    { id: 'u', type: 'interactor', name: 'User' }, { id: 'w', type: 'process', name: 'Web' },
    { id: 'a', type: 'process', name: 'API' }, { id: 'd', type: 'datastore', name: 'DB', secProps: { isCrownJewel: 'true' } },
    { id: 'z', type: 'boundary', name: 'Zone' },
  ],
  flows: [
    { id: 'f1', sourceId: 'u', targetId: 'w', secProps: { encrypted: 'true', authenticated: 'true' } },
    { id: 'f2', sourceId: 'w', targetId: 'a', secProps: {} },
    { id: 'f3', sourceId: 'a', targetId: 'd', secProps: {} },
    { id: 'f4', sourceId: 'w', targetId: 'd', secProps: { encrypted: 'true' } },
    { id: 'f5', sourceId: 'a', targetId: 'w', secProps: {} },            // a cycle w <-> a
  ],
  threats: [], zoneCount: 1, ...extra,
});
const zonesAll = (ids) => ({ nodeZones: new Map(ids.map((id) => [id, [{ id: 'z' }]])) });

test('paths run from the entry to the crown jewel, shortest first, no cycles, ranked by score', async ({ page }) => {
  await setup(page);
  const r = await page.evaluate(([m, z]) => computeAttackPaths({ ...m, nodeZones: new Map(z) }), [M(), [['w', [{ id: 'z' }]], ['a', [{ id: 'z' }]], ['d', [{ id: 'z' }]]]]);
  expect(r.entries).toEqual(['u']);                       // u is outside every zone and an interactor; d is a crown jewel
  expect(r.targets).toEqual(['d']);
  expect(r.paths.map((p) => p.nodes.join('>'))).toEqual(['u>w>a>d', 'u>w>d']);   // the longer one has two weak hops
  expect(r.paths[0].reasons).toEqual({ unencrypted: 2, unauthenticated: 2, openThreats: 0, hops: 3 });
  expect(r.paths[0].score).toBe(15.5);                     // 2*2 + 2*2 + 0 + (8-3)*1.5
  expect(r.paths[1].score).toBe(11);                       // 0 + 2 (f4 not authenticated) + 0 + (8-2)*1.5 = 11
  expect(r.truncated).toBe(false);
});

test('without zones only external entities are entries; open threats count fully, partial half', async ({ page }) => {
  await setup(page);
  const r = await page.evaluate((m) => computeAttackPaths({ ...m, nodeZones: new Map() }), M({
    zoneCount: 0,
    threats: [{ elementId: 'a', likelihood: 5, impact: 5, status: 'Open / Unmitigated' }, { elementId: 'f3', likelihood: 2, impact: 5, status: 'Partially mitigated' }, { elementId: 'w', likelihood: 5, impact: 5, status: 'Mitigated / Resolved' }],
  }));
  expect(r.entries).toEqual(['u']);
  const p = r.paths.find((x) => x.nodes.join('>') === 'u>w>a>d');
  expect(p.reasons.openThreats).toBe(2);
  expect(p.score).toBe(15.5 + 5 + 1);                      // 25/5 open + 10/5 * 0.5 partial
});

test('a picked start and target replace the automatic ones; disabled flows are ignored; bidirectional flows go both ways', async ({ page }) => {
  await setup(page);
  const r = await page.evaluate((m) => {
    m.flows.find((f) => f.id === 'f4').isDisabled = true;
    m.flows.push({ id: 'f6', sourceId: 'd', targetId: 'u', isBidirectional: true, secProps: {} });
    return computeAttackPaths({ ...m, nodeZones: new Map() }, { start: 'a', target: 'u' });
  }, M({ zoneCount: 0 }));
  expect(r.paths.map((p) => p.nodes.join('>'))).toEqual(['a>d>u', 'a>w>u'].filter((x) => x !== 'a>w>u'));  // f1 is u->w only
  expect(r.paths.some((p) => p.flows.includes('f4'))).toBe(false);
});

test('a dense model stays fast and reports truncation', async ({ page }) => {
  await setup(page);
  const r = await page.evaluate(() => {
    let seed = 3; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const elements = []; for (let i = 0; i < 150; i++) elements.push({ id: 'n' + i, type: i < 5 ? 'interactor' : 'process', name: 'N' + i, secProps: i >= 145 ? { isCrownJewel: 'true' } : {} });
    const flows = []; for (let i = 0; i < 600; i++) flows.push({ id: 'f' + i, sourceId: 'n' + Math.floor(rnd() * 150), targetId: 'n' + Math.floor(rnd() * 150), secProps: {} });
    const t0 = performance.now(); const out = computeAttackPaths({ elements, flows, threats: [], nodeZones: new Map(), zoneCount: 0 }); return { ms: performance.now() - t0, n: out.paths.length, truncated: out.truncated };
  });
  expect(r.ms).toBeLessThan(500);
  expect(r.n).toBe(200);
  expect(r.truncated).toBe(true);
});
