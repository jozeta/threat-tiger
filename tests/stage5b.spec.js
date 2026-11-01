// Stage 5: trust-boundary analysis, rule engine, insights, Markdown report, git-friendly export.
const { test } = require('@playwright/test');
const { clickControl, expect, openApp, demoSession, downloadText } = require('./helpers');

// A small model: user (outside) -> API (inside zone "DMZ") -> DB (inside), plus an unconnected cache.
function smallModel(mutate) {
  return demoSession((s) => {
    s.elements = [
      { id: 'z1', type: 'boundary', name: 'DMZ', x: 300, y: 0, width: 600, height: 400 },
      { id: 'u', type: 'interactor', name: 'Admin', x: 0, y: 100, width: 200, height: 80, secProps: { unauthAccess: 'false', isPrivilegedUser: 'true', mfaRequired: 'false', vpnRequired: 'false' } },
      { id: 'api', type: 'process', name: 'API', x: 400, y: 100, width: 200, height: 80, secProps: { runAsAdmin: 'true', loggingEnabled: 'false', handlesSensitiveData: 'true', isCrownJewel: 'true' } },
      { id: 'db', type: 'datastore', name: 'Customers', x: 650, y: 250, width: 200, height: 80, secProps: { auditLogged: 'false', storesCredentials: 'true', storesPii: 'true', encryptedAtRest: 'false', handlesSensitiveData: 'true', isCrownJewel: 'true' } },
      { id: 'cache', type: 'datastore', name: 'Cache', x: 1200, y: 600, width: 200, height: 80, secProps: {} },
    ];
    s.flows = [
      { id: 'f1', name: 'Admin HTTP', sourceId: 'u', targetId: 'api', sourceAnchor: 'right', targetAnchor: 'left', secProps: { encrypted: 'false', authenticated: 'false' }, points: [] },
      { id: 'f2', name: 'SQL', sourceId: 'api', targetId: 'db', sourceAnchor: 'right', targetAnchor: 'left', secProps: { encrypted: 'true', authenticated: 'true' }, points: [] },
    ];
    s.threats = [];
    if (mutate) mutate(s);
  });
}

test('FEAT-006: flows crossing a trust zone are detected and update when a component moves', async ({ page }) => {
  await openApp(page, { session: smallModel() });
  const r1 = await page.evaluate(() => { const a = app.computeTrustAnalysis(); return { f1: a.crossings.get('f1'), f2: a.crossings.get('f2').crosses }; });
  expect(r1.f1).toEqual({ crosses: true, names: ['"DMZ"'] });
  expect(r1.f2).toBe(false);
  await expect(page.locator('#layers-flows-texts-group')).toContainText('crosses boundary');
  const r2 = await page.evaluate(() => { app.state.elements.find((e) => e.id === 'u').x = 450; app.state.elements.find((e) => e.id === 'u').y = 300; return app.computeTrustAnalysis().crossings.get('f1').crosses; });
  expect(r2).toBe(false);
});

test('FEAT-006: a curved trust boundary line between two components is detected', async ({ page }) => {
  await openApp(page, { session: smallModel((s) => {
    s.elements = s.elements.filter((e) => e.type !== 'boundary');
    s.elements.push({ id: 'bl', type: 'boundary_line', name: 'Internet edge', x: 300, y: -50, x2: 300, y2: 500, bendX: 40, bendY: 0 });
  }) });
  const c = await page.evaluate(() => app.computeTrustAnalysis().crossings.get('f1'));
  expect(c).toEqual({ crosses: true, names: ['"Internet edge"'] });
});

test('FEAT-002: rules fire from security switches and boundary crossings', async ({ page }) => {
  await openApp(page, { session: smallModel() });
  const ids = await page.evaluate(() => app.evaluateAllRules().map((f) => `${f.rule.id}:${f.item.id}`).sort());
  expect(ids).toEqual(expect.arrayContaining([
    'TT-F01:f1', 'TT-F02:f1', 'TT-F03:f1', 'TT-I01:u', 'TT-I03:u', 'TT-I04:u',
    'TT-P01:api', 'TT-P02:api', 'TT-P03:api', 'TT-P04:api', 'TT-D01:db', 'TT-D02:db', 'TT-D03:db',
  ]));
  expect(ids).not.toContain('TT-F01:f2');           // encrypted and inside one zone
  // Turning encryption on removes the encryption findings live.
  const after = await page.evaluate(() => { app.state.flows[0].secProps.encrypted = 'true'; return app.evaluateAllRules().map((f) => f.rule.id); });
  expect(after).not.toContain('TT-F01');
});

test('FEAT-002: suggestions appear in Threat Templates and "Add all" is idempotent and undoable', async ({ page }) => {
  await openApp(page, { session: smallModel() });
  await page.evaluate(() => { app.state.selectedElementIds = ['api']; app.state.selectedFlowId = null; app.refreshAppViewVisualWorkspace(); });
  await page.click('button[data-bs-target="#tab-panel-suggest"]');
  // API: runs as admin (P01), logging off (P02), sensitive + unauthenticated inbound (P03),
  // crown jewel reachable across the DMZ edge (P04), sensitive + inbound crossing -> object-level authorization (P05).
  await expect(page.locator('#suggest-section-triggered')).toContainText('Triggered by this model (5)');
  await page.click('#btn-add-triggered');
  const t = await page.evaluate(() => app.state.threats.map((x) => ({ ruleId: x.ruleId, elementId: x.elementId, status: x.status })));
  expect(t.map((x) => x.ruleId).sort()).toEqual(['TT-P01', 'TT-P02', 'TT-P03', 'TT-P04', 'TT-P05']);
  expect(t.every((x) => x.ruleId && x.elementId === 'api' && x.status === 'Open / Unmitigated')).toBe(true);
  await expect(page.locator('#btn-add-triggered')).toHaveCount(0);   // all added
  await page.click('#btn-undo');
  expect(await page.evaluate(() => app.state.threats.length)).toBe(0);
});

test('FEAT-002: adding one suggestion through the dialog keeps its rule id and risk', async ({ page }) => {
  await openApp(page, { session: smallModel() });
  await page.evaluate(() => { app.state.selectedElementIds = ['db']; app.refreshAppViewVisualWorkspace(); });
  await page.click('button[data-bs-target="#tab-panel-suggest"]');
  await page.locator('.triggered-rule-card', { hasText: 'not encrypted at rest' }).click();
  await expect(page.locator('#modal-threat-impact')).toHaveValue('5');
  await page.click('#btn-modal-threat-save');
  const t = await page.evaluate(() => app.state.threats[0]);
  expect(t.ruleId).toBe('TT-D01');
  expect(t.riskLabel).toBe('Critical');
});

test('FEAT-004/005: Insights shows tiles, heat map, warnings and can add all suggestions', async ({ page }) => {
  await openApp(page, { session: smallModel() });
  await page.click('#tab-insights-trigger');
  await expect(page.locator('#insights-content')).toContainText('Rule suggestions');
  await expect(page.locator('#insights-content')).toContainText('"Cache" is not connected to any data flow.');
  await expect(page.locator('#insights-content')).toContainText('Admin HTTP — crosses "DMZ"');
  await page.click('#btn-insights-add-all');
  const n = await page.evaluate(() => app.state.threats.length);
  expect(n).toBeGreaterThanOrEqual(13);
  // Heat map now has counts; the tile for "Rule suggestions" reaches zero.
  await expect(page.locator('#insights-content table').first()).toContainText(String(1));
  await expect(page.locator('.insight-tile', { hasText: 'Rule suggestions' })).toContainText('0');
});

test('FEAT-008: Markdown report contains summary, Mermaid diagram, threats and escapes table cells', async ({ page }) => {
  await openApp(page, { session: smallModel((s) => {
    s.threats = [{ id: 'th-001', title: 'Pipe | and <b>tag</b>', category: 'Spoofing', elementId: 'api', status: 'Open / Unmitigated', likelihood: '5', impact: '4', desc: 'Line one\nLine two' }];
  }) });
  const md = await downloadText(page, '#btn-export-markdown');
  expect(md).toMatch(/^# /);
  expect(md).toContain('## Risk summary');
  expect(md).toContain('```mermaid\nflowchart LR');
  expect(md).toContain('Pipe \\| and &lt;b&gt;tag&lt;/b&gt;');
  expect(md).not.toContain('<b>');
  expect(md).toContain('> Line one\n> Line two');
  expect(md).toContain('| Admin HTTP | Admin | API |');
  expect(md).toContain('### Suggested by model rules');
});

test('FEAT-009: git export is deterministic; moving one component changes only its x/y lines', async ({ page }) => {
  await openApp(page, { session: smallModel() });
  const a = await downloadText(page, '#btn-export-no-log');
  await page.evaluate(() => { const e = app.state.elements.find((x) => x.id === 'cache'); e.x += 37.4; e.y += 12.6; app.logEvent('CHANGE', 'moved'); });
  const b = await downloadText(page, '#btn-export-no-log');
  expect(JSON.parse(a).activityLog).toBeUndefined();
  const la = a.split('\n'), lb = b.split('\n');
  expect(la.length).toBe(lb.length);
  const changed = la.filter((l, i) => l !== lb[i]);
  expect(changed).toHaveLength(2);
  expect(lb.find((l) => l.includes('"x": 1237'))).toBeTruthy();
});
