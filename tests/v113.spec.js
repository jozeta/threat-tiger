// 1.13.0: baseline threats per component type, threats for every icon subtype, Insights filters.
const { test } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const { expect, openApp, demoSession, downloadText } = require('./helpers');

const TEMPLATES = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'threat_templates.json'), 'utf8'));
const proc = (id, name, icon, x, y, extra = {}) => ({ id, type: 'process', name, icon, x, y, width: 200, height: 80, secProps: { runAsAdmin: 'false', loggingEnabled: 'true', handlesSensitiveData: 'false', isCrownJewel: 'false', ...extra } });

function model(mutate) {
  return demoSession((s) => {
    s.elements = [
      { id: 'z', type: 'boundary', name: 'Production VPC', x: 400, y: 0, width: 900, height: 500 },
      { id: 'u', type: 'interactor', name: 'Customer', x: 0, y: 150, width: 200, height: 80, icon: 'bi-person-fill', secProps: { unauthAccess: 'false', isPrivilegedUser: 'false', mfaRequired: 'false', vpnRequired: 'false' } },
      proc('api', 'Orders API', 'bi-server', 500, 150),
      proc('job', 'Nightly batch job', 'bi-calendar-check', 500, 320),
      { id: 'db', type: 'datastore', name: 'Customer database', x: 900, y: 150, width: 200, height: 80, icon: 'bi-database-fill', secProps: { auditLogged: 'true', storesCredentials: 'false', storesPii: 'true', encryptedAtRest: 'true', handlesSensitiveData: 'true', isCrownJewel: 'false' } },
      { id: 'gpu', type: 'infrastructure', name: 'GPU server', x: 1500, y: 150, width: 120, height: 120, icon: 'bi-gpu-card', secProps: {} },
    ];
    s.flows = [
      { id: 'f1', name: 'HTTPS', sourceId: 'u', targetId: 'api', sourceAnchor: 'right', targetAnchor: 'left', secProps: { encrypted: 'true', authenticated: 'true' }, points: [] },
      { id: 'f2', name: 'SQL over TLS', sourceId: 'api', targetId: 'db', sourceAnchor: 'right', targetAnchor: 'left', secProps: { encrypted: 'true', authenticated: 'true' }, points: [] },
      { id: 'f3', name: 'Jobs', sourceId: 'job', targetId: 'gpu', sourceAnchor: 'right', targetAnchor: 'left', secProps: { encrypted: 'true', authenticated: 'true' }, points: [] },
    ];
    s.threats = [];
    if (mutate) mutate(s);
  });
}

test('new condition keys: type and zoned give readable reasons; empty flow conditions mean "any flow"', async ({ page }) => {
  await openApp(page, { session: model() });
  const r = await page.evaluate(() => {
    const m = app.ruleHelpers(app.computeTrustAnalysis());
    const el = (id) => app.state.elements.find((e) => e.id === id);
    const fl = (id) => app.state.flows.find((f) => f.id === id);
    const ev = (c, it) => { const x = app.evaluateCondition(c, it, m); return x.ok ? x.reasons.join('; ') : null; };
    return {
      fromUser: ev({ inbound: { source: { type: 'interactor' } } }, el('api')),
      notFromUser: ev({ inbound: { source: { type: 'interactor' } } }, el('db')),
      anyInbound: ev({ inbound: {} }, el('db')),
      noInbound: ev({ inbound: {} }, el('u')),
      zoned: ev({ zoned: true }, el('api')),
      outside: ev({ zoned: false }, el('gpu')),
      flowToStore: ev({ target: { type: 'datastore' } }, fl('f2')),
      zonedOnFlow: ev({ zoned: true }, fl('f2')),
      sanitized: sanitizeCondition({ inbound: {}, type: ['process', 'bad name!'], zoned: false, not: {} }),
    };
  });
  expect(r.fromUser).toBe('incoming flow "HTTPS" comes from "Customer" (external entity)');
  expect(r.notFromUser).toBeNull();
  expect(r.anyInbound).toBe('incoming flow "SQL over TLS"');
  expect(r.noInbound).toBeNull();
  expect(r.zoned).toBe('inside "Production VPC"');
  expect(r.outside).toBe('not inside any trust boundary');
  expect(r.flowToStore).toBe('goes to "Customer database" (data store)');
  expect(r.zonedOnFlow).toBeNull();
  expect(r.sanitized).toEqual({ inbound: {}, type: ['process'], zoned: false });
});

test('Insights lists threats recognised from icon and name, and filters by component, category and reason', async ({ page }) => {
  await openApp(page, { session: model() });
  await page.click('#tab-insights-trigger');
  const rows = page.locator('#insights-suggestion-list .list-group-item');
  const all = await page.evaluate(() => app.evaluateAllRules().filter((f) => !f.added && !f.dismissed));
  expect(all.some((f) => f.source === 'recognised' && f.item.id === 'gpu' && /recognised as: AI \/ ML compute/.test(f.reason))).toBe(true);
  expect(all.some((f) => f.source === 'recognised' && f.item.id === 'job' && f.rule.id === 'P-JOB-01')).toBe(true);
  expect(all.some((f) => f.source === 'model' && f.item.id === 'api' && f.rule.id === 'P-BASE-03')).toBe(true);
  await expect(rows).toHaveCount(all.length);
  // Model-driven suggestions come first.
  const firstReasons = await rows.locator('.text-muted').allTextContents();
  const firstRecognised = firstReasons.findIndex((t) => t.includes('recognised as'));
  expect(firstReasons.slice(firstRecognised).every((t) => t.includes('recognised as'))).toBe(true);

  await page.selectOption('#insights-filter-item', 'gpu');
  await expect(page.locator('#insights-filter-item')).toBeFocused();
  const gpuCount = all.filter((f) => f.item.id === 'gpu').length;
  await expect(rows).toHaveCount(gpuCount);
  await page.selectOption('#insights-filter-category', 'Elevation of Privilege');
  const gpuEop = all.filter((f) => f.item.id === 'gpu' && f.rule.category === 'Elevation of Privilege').length;
  expect(gpuEop).toBeGreaterThan(0);
  await expect(rows).toHaveCount(gpuEop);
  await expect(page.locator('#btn-insights-add-all')).toHaveText(`Add ${gpuEop} shown`);
  await page.click('#btn-insights-add-all');
  const added = await page.evaluate(() => app.state.threats.map((t) => [t.elementId, t.category]));
  expect(added.length).toBe(gpuEop);
  expect(added.every(([id, c]) => id === 'gpu' && c === 'Elevation of Privilege')).toBe(true);

  // The component filter resets when that component has nothing left; the reason filter separates the two sources.
  await page.selectOption('#insights-filter-category', '');
  await page.selectOption('#insights-filter-source', 'model');
  const modelRows = await rows.locator('.text-muted').allTextContents();
  expect(modelRows.length).toBeGreaterThan(0);
  expect(modelRows.every((t) => !t.includes('recognised as'))).toBe(true);
});

test('every icon offered for a component type brings tailored threats (except purely decorative ones)', async ({ page }) => {
  const s = model((m) => { m.elements.push({ id: 'ent2', type: 'interactor', name: 'Partner', x: 0, y: 600, width: 200, height: 80, icon: 'bi-building', secProps: {} }); });
  await openApp(page, { session: s });
  const decorative = ['bi-trash', 'bi-award-fill', 'bi-columns-gap', 'bi-p-circle'];
  for (const [type, id] of [['process', 'api'], ['datastore', 'db'], ['interactor', 'u'], ['infrastructure', 'gpu']]) {
    const r = await page.evaluate(({ id, type }) => {
      app.state.selectedElementIds = [id]; app.state.selectedFlowId = null; app.refreshAppViewVisualWorkspace();
      const wanted = app.templateSubtypesFor(app.libraryKeyFor({ type }));
      const lib = app.threatSuggestions[app.libraryKeyFor({ type })];
      const icons = [...document.querySelectorAll('#props-input-icon option')].map((o) => o.value).filter(Boolean);
      const untailored = icons.filter((v) => !iconSubtypesFor(v, type).some((x) => wanted.has(x)));
      // At least two threats for every subtype an offered icon is recognised as.
      const thin = [...new Set(icons.flatMap((v) => iconSubtypesFor(v, type)))].filter((sub) => wanted.has(sub))
        .filter((sub) => lib.filter((t) => (t.subtypes || []).includes(sub) || JSON.stringify(t.when || {}).includes(`"${sub}"`)).length < 2);
      return { untailored, thin };
    }, { id, type });
    expect(r.untailored.filter((v) => !decorative.includes(v)), `${type}: icons without tailored threats`).toEqual([]);
    expect(r.thin, `${type}: subtypes with fewer than 2 threats`).toEqual([]);
  }
});

test('new subtypes are recognised from names as well as icons', async ({ page }) => {
  await openApp(page);
  const r = await page.evaluate(() => {
    const sub = (type, name, icon = '') => [...app.subtypesOf({ id: 'x', type, name, icon })].sort();
    return {
      env: sub('datastore', 'Configuration file (.env)'),
      ledger: sub('datastore', 'Blockchain ledger'),
      grafana: sub('process', 'Grafana dashboards'),
      warehouse: sub('datastore', 'Snowflake data warehouse'),
      staging: sub('process', 'Staging API'),
      ehr: sub('datastore', 'Patient records (EHR)'),
      healthCheck: sub('process', 'Health check endpoint'),
      apiEndpoints: sub('process', 'API endpoints'),
      attacker: sub('interactor', 'Attacker'),
      wordpress: sub('infrastructure', 'WordPress server'),
      sdCard: iconSubtypesFor('bi-sd-card', 'datastore'),
      gearCiCd: iconSubtypesFor('bi-gear-wide-connected', 'process'),
      gear: iconSubtypesFor('bi-gear', 'infrastructure'),
      ledgerIcon: iconSubtypesFor('bi-link-45deg', 'datastore'),
      linkIcon: iconSubtypesFor('bi-link-45deg', 'process'),
    };
  });
  expect(r.env).toContain('config');
  expect(r.ledger).toContain('ledger');
  expect(r.grafana).toContain('monitoring');
  expect(r.warehouse).toContain('analytics');
  expect(r.staging).toEqual(expect.arrayContaining(['non-prod', 'api']));
  expect(r.ehr).toContain('health-data');
  expect(r.healthCheck).not.toContain('health-data');   // look-alike words do not match
  expect(r.apiEndpoints).not.toContain('workstation');
  expect(r.attacker).toContain('threat-actor');
  expect(r.wordpress).toEqual(expect.arrayContaining(['cms', 'web']));
  expect(r.sdCard).toEqual(['removable-media']);
  expect(r.gearCiCd).toEqual(['ci-cd']);   // the specific older entry still wins over the new "bi-gear" prefix
  expect(r.gear).toEqual(['config']);
  expect(r.ledgerIcon).toEqual(['ledger']);
  expect(r.linkIcon).toEqual(['integration']);
});

test('library: every incident example names a year, reused templates keep their text, and baselines trigger', async () => {
  const all = Object.values(TEMPLATES).filter(Array.isArray).flat();
  expect(all.length).toBeGreaterThanOrEqual(550);
  const examples = all.filter((t) => t.example);
  expect(examples.every((t) => /\b(19|20)\d\d\b/.test(t.example)), 'examples carry a year').toBe(true);
  for (const type of ['process', 'datastore', 'interactor', 'infrastructure', 'flow']) {
    const base = TEMPLATES[type].filter((t) => /-BASE-\d\d$/.test(t.id));
    expect(base.length, `${type} baselines`).toBeGreaterThanOrEqual(type === 'infrastructure' ? 1 : 2);
    expect(base.every((t) => t.when), `${type} baselines have conditions`).toBe(true);
  }
  const src = TEMPLATES.datastore.find((t) => t.id === 'D-SECRETS-01');
  const copy = TEMPLATES.infrastructure.find((t) => t.id === 'I-SECRETS-01');
  expect(copy.title).toBe(src.title);
  expect(copy.subtypes).toEqual(['secrets']);
  expect(copy.when).toBeUndefined();
});

test('Markdown report lists model findings in full and summarises recognised ones per component', async ({ page }) => {
  await openApp(page, { session: model() });
  const md = await downloadText(page, '#btn-export-markdown');
  expect(md).toContain('### Suggested by model rules (not yet in the register)');
  expect(md).toMatch(/### Suggested for the kind of component \(\d+, not yet in the register\)/);
  expect(md).toMatch(/- \*\*GPU server\*\* \(recognised as: AI \/ ML compute\): .*I-ML-01/);
});

test('a very large suggestion list is capped until the user asks for all of it', async ({ page }) => {
  const big = model((s) => { for (let i = 0; i < 40; i++) s.elements.push({ id: 'g' + i, type: 'infrastructure', name: 'GPU ' + i, x: 2000 + i * 10, y: 0, width: 120, height: 120, icon: 'bi-gpu-card', secProps: {} }); });
  await openApp(page, { session: big });
  await page.click('#tab-insights-trigger');
  const rows = page.locator('#insights-suggestion-list .list-group-item');
  await expect(rows).toHaveCount(150);
  await page.click('#btn-insights-show-all');
  const total = await page.evaluate(() => app.evaluateAllRules().filter((f) => !f.added && !f.dismissed).length);
  expect(total).toBeGreaterThan(150);
  await expect(rows).toHaveCount(total);
});
