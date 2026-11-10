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

test('Insights lists ranked paths; picking a start filters; clicking highlights; Markdown has the section', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await openApp(page, { session: demoSession((s) => {
    s.elements = [
      { id: 'u', type: 'interactor', name: 'User', x: 0, y: 0, width: 240, height: 80, secProps: {} },
      { id: 'w', type: 'process', name: 'Web', x: 400, y: 0, width: 240, height: 80, secProps: {} },
      { id: 'd', type: 'datastore', name: 'DB', x: 800, y: 0, width: 240, height: 80, secProps: { isCrownJewel: 'true' } },
      { id: 'x', type: 'process', name: 'Other', x: 400, y: 400, width: 240, height: 80, secProps: {} },
    ];
    s.flows = [
      { id: 'f1', name: 'req', sourceId: 'u', targetId: 'w', sourceAnchor: 'right-2', targetAnchor: 'left-2', points: [], secProps: {} },
      { id: 'f2', name: 'sql', sourceId: 'w', targetId: 'd', sourceAnchor: 'right-2', targetAnchor: 'left-2', points: [], secProps: {} },
    ];
    s.threats = [];
  }) });
  await page.click('#tab-insights-trigger');
  const card = page.locator('#insights-attack-paths');
  await expect(card.locator('.attack-path-row')).toHaveCount(1);
  await expect(card.locator('.attack-path-row').first()).toContainText('User → Web → DB');
  await card.locator('.attack-path-row').first().click();
  await expect(page.locator('#layers-nodes-group [data-id="x"]').first()).toHaveClass(/ap-dim/);
  await expect(page.locator('[data-flow-id="f2"]')).toHaveClass(/ap-on/);
  await card.locator('#attack-path-start').selectOption('w');
  await expect(card.locator('.attack-path-row').first()).toContainText('Web → DB');
  await page.evaluate(() => { app.state.elements = app.state.elements.filter((e) => e.id !== 'w'); app.state.flows = app.state.flows.filter((f) => f.sourceId !== 'w' && f.targetId !== 'w'); app.refreshAppViewVisualWorkspace(); app.renderInsights(); });
  await expect(card.locator('#attack-path-start')).toHaveValue('');
  expect(await page.evaluate(() => app.attackPathHighlight)).toBeNull();
  await card.locator('#attack-path-start').selectOption('');
  const md = await page.evaluate(() => { app.state.flows.push({ id: 'f3', name: 'x', sourceId: 'u', targetId: 'd', points: [], secProps: {} }); return app.buildMarkdownReport(); });
  expect(md).toContain('## Attack paths');
  expect(md).toMatch(/1\. User → DB \(score [\d.]+/);
});

// ── Review fixes ──
test('an unreachable crown jewel stops the search at once and is not reported as truncated', async ({ page }) => {
  await setup(page);
  const r = await page.evaluate(() => {
    let seed = 9; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const elements = [{ id: 'u', type: 'interactor', name: 'U' }, { id: 'j', type: 'datastore', name: 'J', secProps: { isCrownJewel: 'true' } }];
    for (let i = 0; i < 80; i++) elements.push({ id: 'n' + i, type: 'process', name: 'N' + i });
    const flows = [{ id: 'fu', sourceId: 'u', targetId: 'n0', secProps: {} }, { id: 'fj', sourceId: 'j', targetId: 'n1', secProps: {} }];   // the jewel only sends data out
    for (let i = 0; i < 300; i++) flows.push({ id: 'f' + i, sourceId: 'n' + Math.floor(rnd() * 80), targetId: 'n' + Math.floor(rnd() * 80), isBidirectional: true, secProps: {} });
    const t0 = performance.now(); const out = computeAttackPaths({ elements, flows, threats: [], nodeZones: new Map(), zoneCount: 0 });
    return { ms: performance.now() - t0, n: out.paths.length, truncated: out.truncated };
  });
  expect(r).toMatchObject({ n: 0, truncated: false });
  expect(r.ms).toBeLessThan(20);
});

test('keyboard focus stays on the picker after it changes the list; a highlighted path is not exported to PNG', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await openApp(page, { session: demoSession((s) => {
    s.elements = [
      { id: 'u', type: 'interactor', name: 'User', x: 0, y: 0, width: 240, height: 80, secProps: {} },
      { id: 'w', type: 'process', name: 'Web', x: 400, y: 0, width: 240, height: 80, secProps: {} },
      { id: 'd', type: 'datastore', name: 'DB', x: 800, y: 0, width: 240, height: 80, secProps: { isCrownJewel: 'true' } },
    ];
    s.flows = [
      { id: 'f1', name: 'req', sourceId: 'u', targetId: 'w', sourceAnchor: 'right-2', targetAnchor: 'left-2', points: [], secProps: {} },
      { id: 'f2', name: 'sql', sourceId: 'w', targetId: 'd', sourceAnchor: 'right-2', targetAnchor: 'left-2', points: [], secProps: {} },
    ];
    s.threats = [];
  }) });
  await page.click('#tab-insights-trigger');
  await page.locator('#attack-path-start').selectOption('w');
  expect(await page.evaluate(() => document.activeElement && document.activeElement.id)).toBe('attack-path-start');
  await page.locator('#insights-attack-paths .attack-path-row').first().click();
  expect(await page.evaluate(() => document.activeElement && document.activeElement.classList.contains('attack-path-row'))).toBe(true);
  const svgText = await page.evaluate(async () => {
    let captured = '';
    const orig = XMLSerializer.prototype.serializeToString;
    XMLSerializer.prototype.serializeToString = function (n) { const s = orig.call(this, n); if (n && n.id === 'canvas-svg') captured = s; return s; };
    app.downloadBlob = () => {};
    try { await app.exportCanvasAsPng(); } catch (e) { /* the canvas step may fail headless; the serialised SVG is what matters */ }
    XMLSerializer.prototype.serializeToString = orig;
    return captured;
  });
  expect(svgText.length).toBeGreaterThan(100);
  expect(svgText).not.toMatch(/class="[^"]*\bap-(dim|on)\b/);   // the stylesheet text may mention the classes; no element may carry them
});

// ── Deferred minors (1.15.1) ──
test('parallel flows between the same two shapes give one path, through the weakest flow', async ({ page }) => {
  await setup(page);
  const r = await page.evaluate((m) => {
    m.flows.push({ id: 'f4b', sourceId: 'w', targetId: 'd', secProps: {} });   // a second, weaker w -> d flow
    m.flows.push({ id: 'f4c', sourceId: 'w', targetId: 'd', secProps: { encrypted: 'true', authenticated: 'true' } });
    return computeAttackPaths({ ...m, nodeZones: new Map() });
  }, M({ zoneCount: 0 }));
  const keys = r.paths.map((p) => p.nodes.join('>'));
  expect(keys).toEqual([...new Set(keys)]);
  expect(r.paths.find((p) => p.nodes.join('>') === 'u>w>d').flows).toEqual(['f1', 'f4b']);
});

test('"more paths" is reported only when another path really exists past the limit', async ({ page }) => {
  await setup(page);
  const r = await page.evaluate(() => {
    const build = (n) => {   // exactly n two-hop paths u -> mi -> j
      const elements = [{ id: 'u', type: 'interactor', name: 'U' }, { id: 'j', type: 'datastore', name: 'J', secProps: { isCrownJewel: 'true' } }];
      const flows = [];
      for (let i = 0; i < n; i++) { elements.push({ id: 'm' + i, type: 'process', name: 'M' + i }); flows.push({ id: 'a' + i, sourceId: 'u', targetId: 'm' + i, secProps: {} }, { id: 'b' + i, sourceId: 'm' + i, targetId: 'j', secProps: {} }); }
      elements.push({ id: 'x', type: 'process', name: 'X' }); flows.push({ id: 'ux', sourceId: 'u', targetId: 'x', secProps: {} }, { id: 'xm', sourceId: 'x', targetId: 'm0', secProps: {} });   // x -> m0 -> j would be path 201 only if n < 200
      return computeAttackPaths({ elements, flows, threats: [], nodeZones: new Map(), zoneCount: 0 });
    };
    const exact = build(200);   // 200 two-hop paths plus u>x>m0>j: 201 paths, so truncated
    const elements = [{ id: 'u', type: 'interactor', name: 'U' }, { id: 'j', type: 'datastore', name: 'J', secProps: { isCrownJewel: 'true' } }];
    const flows = [];
    for (let i = 0; i < 200; i++) { elements.push({ id: 'm' + i, type: 'process', name: 'M' + i }); flows.push({ id: 'a' + i, sourceId: 'u', targetId: 'm' + i, secProps: {} }, { id: 'b' + i, sourceId: 'm' + i, targetId: 'j', secProps: {} }); }
    for (let i = 195; i < 200; i++) { elements.push({ id: 'y' + i, type: 'process', name: 'Y' }); flows.push({ id: 'y' + i, sourceId: 'm' + i, targetId: 'y' + i, secProps: {} }, { id: 'yb' + i, sourceId: 'y' + i, targetId: 'm' + i, secProps: {} }); }   // queued after the last path; y only leads back into its own path
    const full = computeAttackPaths({ elements, flows, threats: [], nodeZones: new Map(), zoneCount: 0 });
    return { exactN: exact.paths.length, exactT: exact.truncated, fullN: full.paths.length, fullT: full.truncated };
  });
  expect(r).toEqual({ exactN: 200, exactT: true, fullN: 200, fullT: false });
});

test('disabling a flow on the highlighted path clears the highlight', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await openApp(page, { session: demoSession((s) => {
    s.elements = [
      { id: 'u', type: 'interactor', name: 'User', x: 0, y: 0, width: 240, height: 80, secProps: {} },
      { id: 'd', type: 'datastore', name: 'DB', x: 800, y: 0, width: 240, height: 80, secProps: { isCrownJewel: 'true' } },
    ];
    s.flows = [{ id: 'f1', name: 'req', sourceId: 'u', targetId: 'd', sourceAnchor: 'right-2', targetAnchor: 'left-2', points: [], secProps: {} }];
    s.threats = [];
  }) });
  await page.click('#tab-insights-trigger');
  await page.locator('#insights-attack-paths .attack-path-row').first().click();
  expect(await page.evaluate(() => !!app.attackPathHighlight)).toBe(true);
  await page.evaluate(() => { app.state.flows[0].isDisabled = true; app.refreshAppViewVisualWorkspace(); });
  expect(await page.evaluate(() => app.attackPathHighlight)).toBeNull();
  await expect(page.locator('[data-flow-id="f1"]').first()).not.toHaveClass(/ap-/);
});
