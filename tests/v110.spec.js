// 1.10.0: added suggestions leave the list, Ignore, subtype-specific threats, model checks, name autosuggest.
const { test } = require('@playwright/test');
const { expect, openApp, demoSession, downloadText } = require('./helpers');

function model(mutate) {
  return demoSession((s) => {
    s.elements = [
      { id: 'z', type: 'boundary', name: 'Production VPC', x: 400, y: 0, width: 900, height: 500 },
      { id: 'u', type: 'interactor', name: 'Customer', x: 0, y: 150, width: 200, height: 80, icon: 'bi-person-fill', secProps: { unauthAccess: 'false', isPrivilegedUser: 'false', mfaRequired: 'true', vpnRequired: 'false' } },
      { id: 'bot', type: 'process', name: 'Support chatbot (LLM)', x: 500, y: 150, width: 200, height: 80, icon: 'bi-server', secProps: { runAsAdmin: 'false', loggingEnabled: 'true', handlesSensitiveData: 'false', isCrownJewel: 'false' } },
      { id: 'pay', type: 'process', name: 'Checkout service', x: 500, y: 300, width: 200, height: 80, icon: 'bi-server', secProps: { runAsAdmin: 'false', loggingEnabled: 'true', handlesSensitiveData: 'false', isCrownJewel: 'false' } },
      { id: 'db', type: 'datastore', name: 'Customer database', x: 900, y: 150, width: 200, height: 80, icon: 'bi-database-fill', secProps: { auditLogged: 'true', storesCredentials: 'false', storesPii: 'false', encryptedAtRest: 'true', handlesSensitiveData: 'false', isCrownJewel: 'false' } },
    ];
    s.flows = [
      { id: 'f1', name: 'HTTPS', sourceId: 'u', targetId: 'bot', sourceAnchor: 'right', targetAnchor: 'left', secProps: { encrypted: 'true', authenticated: 'true' }, points: [] },
      { id: 'f2', name: 'SQL over TLS', sourceId: 'bot', targetId: 'db', sourceAnchor: 'right', targetAnchor: 'left', secProps: { encrypted: 'true', authenticated: 'true' }, points: [] },
    ];
    s.threats = [];
    if (mutate) mutate(s);
  });
}
const select = (page, id) => page.evaluate((i) => { app.state.selectedElementIds = [i]; app.state.selectedFlowId = null; app.refreshAppViewVisualWorkspace(); }, id);
const openTemplates = (page) => page.click('button[data-bs-target="#tab-panel-suggest"]');
const card = (page, id) => page.locator(`#box-threat-suggestions-list .template-card[data-template-id="${id}"]`);

test('a threat added from the list disappears from the list', async ({ page }) => {
  await openApp(page, { session: model() });
  await select(page, 'bot'); await openTemplates(page);
  await expect(card(page, 'P-LLM-01')).toHaveCount(1);
  await card(page, 'P-LLM-01').locator('.fw-bold.text-dark').first().click();
  await page.click('#btn-modal-threat-save');
  await expect(card(page, 'P-LLM-01')).toHaveCount(0);
  await expect(page.locator('#suggest-added-note')).toContainText('1 suggestion already added');
  expect(await page.evaluate(() => app.state.threats.map((t) => t.templateId))).toEqual(['P-LLM-01']);
});

test('Ignore hides a suggestion; it can be shown again; Insights and the report count it', async ({ page }) => {
  await openApp(page, { session: model() });
  await select(page, 'bot'); await openTemplates(page);
  await card(page, 'P-LLM-05').locator('.btn-ignore-suggestion').click();
  await expect(card(page, 'P-LLM-05')).toHaveCount(0);
  await expect(page.locator('#suggest-section-ignored')).toContainText('System prompt of Support chatbot (LLM) can be extracted');
  expect(await page.evaluate(() => app.state.elements.find((e) => e.id === 'bot').dismissedSuggestions['P-LLM-05'].ignored)).toBe(true);
  const md = await downloadText(page, '#btn-export-markdown');
  expect(md).toContain('| Support chatbot (LLM) | System prompt of Support chatbot (LLM) can be extracted | Ignored (no reason given) |');
  await page.locator('#suggest-section-ignored summary').click();
  await page.locator('#suggest-section-ignored .btn-restore-suggestion').click();
  await expect(card(page, 'P-LLM-05')).toHaveCount(1);
});

test('name-based subtypes bring tailored threats (LLM, payment, GraphQL, CDN, VPN, DNS, CI/CD)', async ({ page }) => {
  await openApp(page, { session: model() });
  const r = await page.evaluate(() => {
    const probe = (type, name, notes) => [...app.subtypesOf({ id: 'p', type, name, notes })].sort();
    return {
      llm: probe('process', 'Support chatbot (LLM)'), pay: probe('process', 'Checkout service'), gql: probe('process', 'GraphQL API'),
      cdn: probe('infrastructure', 'CDN (CloudFront)'), vpn: probe('infrastructure', 'VPN gateway'), dns: probe('infrastructure', 'DNS (Route 53)'),
      ci: probe('process', 'GitHub Actions workflow'), rag: probe('datastore', 'Vector database (RAG)'),
      flowSql: [...app.subtypesOf({ id: 'f', name: 'SQL over TLS', sourceId: '', targetId: '' })],
      auth: probe('process', 'Authentication service'), payProc: probe('process', 'Payment service'),
      weblogic: probe('process', 'Application Server', 'Oracle WebLogic'),
    };
  });
  expect(r.llm).toContain('llm'); expect(r.pay).toContain('payment'); expect(r.gql).toEqual(expect.arrayContaining(['graphql', 'api']));
  expect(r.cdn).toContain('cdn'); expect(r.vpn).toContain('vpn'); expect(r.dns).toContain('dns'); expect(r.ci).toContain('ci-cd');
  expect(r.rag).toEqual(expect.arrayContaining(['llm', 'database'])); expect(r.flowSql).toContain('database');
  expect(r.auth).toContain('identity'); expect(r.payProc).toEqual(['payment']); expect(r.weblogic).not.toContain('database');

  await select(page, 'pay'); await openTemplates(page);
  for (const id of ['P-PAY-01', 'P-PAY-02', 'P-PAY-03']) await expect(page.locator(`#suggest-section-relevant .template-card[data-template-id="${id}"]`)).toHaveCount(1);
  await select(page, 'bot');
  for (const id of ['P-LLM-01', 'P-LLM-03', 'P-LLM-06']) await expect(page.locator(`#suggest-section-relevant .template-card[data-template-id="${id}"]`)).toHaveCount(1);
});

test('new model checks find structural problems', async ({ page }) => {
  await openApp(page, { session: model((s) => {
    s.elements.push({ id: 'z2', type: 'boundary', name: 'Empty zone', x: 2000, y: 2000, width: 200, height: 200 });
    s.elements.push({ id: 'cj', type: 'datastore', name: 'Relational Database Store', x: 900, y: 320, width: 200, height: 80, secProps: { isCrownJewel: 'true', storesPii: 'true', handlesSensitiveData: 'false' } });
    s.flows.push({ id: 'f3', name: 'Direct', sourceId: 'u', targetId: 'cj', secProps: {}, points: [] });
    s.flows.push({ id: 'f4', name: 'Loop', sourceId: 'pay', targetId: 'pay', secProps: {}, points: [] });
    s.flows.push({ id: 'f5', name: 'HTTPS again', sourceId: 'u', targetId: 'bot', secProps: {}, points: [] });
    s.threats = [{ id: 'th-001', title: 'Done', category: 'Tampering', elementId: 'bot', status: 'Mitigated / Resolved', likelihood: '2', impact: '2', desc: '' }];
  }) });
  const codes = await page.evaluate(() => [...new Set(app.computeModelWarnings().map((w) => w.code).filter(Boolean))].sort());
  expect(codes).toEqual(expect.arrayContaining(['MC-DFD-01', 'MC-LOOP', 'MC-DUP-FLOW', 'MC-NAME', 'MC-CROWN', 'MC-MITIGATION', 'MC-THREAT-DESC', 'MC-CONSISTENCY', 'MC-EMPTY-ZONE', 'MC-WRITE-ONLY']));
  const none = await page.evaluate(() => { app.state.elements = app.state.elements.filter((e) => e.type !== 'boundary'); return app.computeModelWarnings().some((w) => w.code === 'MC-NO-BOUNDARY'); });
  expect(none).toBe(true);
  await page.evaluate(() => app.refreshAppViewVisualWorkspace());
  await page.click('#tab-insights-trigger');
  await expect(page.locator('#insights-content')).toContainText('connects external entity and data store directly');
});

test('Component Label: full list on click, filtered while typing, matches the selected type, picking applies it', async ({ page }) => {
  await openApp(page, { session: model() });
  const menu = page.locator('#name-suggest-menu');
  const counts = await page.evaluate(() => Object.fromEntries(Object.entries(NAME_SUGGESTIONS).map(([k, v]) => [k, v.length])));

  await select(page, 'db');
  await page.click('#props-input-name');
  await expect(menu).toBeVisible();
  await expect(menu.locator('[role="option"]')).toHaveCount(counts.datastore);
  await expect(page.locator('#props-input-name')).toHaveAttribute('aria-expanded', 'true');
  await page.fill('#props-input-name', 's3');
  await expect(menu.locator('[role="option"]')).toHaveCount(1);
  await expect(menu).toContainText('S3 bucket');
  await expect(menu).toContainText('object storage bucket');            // shows what it will be recognised as
  await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter');
  await expect(menu).toBeHidden();
  expect(await page.evaluate(() => app.state.elements.find((e) => e.id === 'db').name)).toBe('S3 bucket');
  expect(await page.evaluate(() => app.evaluateRules(app.state.elements.find((e) => e.id === 'db')).map((f) => f.rule.id))).toContain('TT-D05');

  await select(page, 'u');
  await page.click('#props-input-name');
  await expect(menu.locator('[role="option"]')).toHaveCount(counts.interactor);
  await expect(menu).toContainText('Administrator');
  await page.locator('#name-suggest-menu [role="option"]', { hasText: 'Payment provider (PSP)' }).click();
  expect(await page.evaluate(() => app.state.elements.find((e) => e.id === 'u').name)).toBe('Payment provider (PSP)');

  await page.evaluate(() => { app.state.selectedElementIds = []; app.state.selectedFlowId = 'f1'; app.refreshAppViewVisualWorkspace(); });
  await page.click('#props-input-name');
  await expect(menu.locator('[role="option"]')).toHaveCount(counts.flow);
  await expect(menu).toContainText('gRPC (TLS)');
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();

  // Typing a custom name still works and is saved on blur.
  await page.fill('#props-input-name', 'My custom link');
  await page.click('#tab-notes-trigger');
  expect(await page.evaluate(() => app.state.flows.find((f) => f.id === 'f1').name)).toBe('My custom link');
});

test('picking a suggested name is one undo step', async ({ page }) => {
  await openApp(page, { session: model() });
  await select(page, 'db');
  await page.click('#props-input-name');
  await page.locator('#name-suggest-menu [role="option"]', { hasText: 'Redis cache' }).click();
  expect(await page.evaluate(() => app.state.elements.find((e) => e.id === 'db').name)).toBe('Redis cache');
  await page.click('#btn-undo');
  expect(await page.evaluate(() => app.state.elements.find((e) => e.id === 'db').name)).toBe('Customer database');
});

test('Insights list: added suggestions leave it, Ignore hides one, and a summary counts what was handled', async ({ page }) => {
  await openApp(page, { session: model((s) => { s.elements.find((e) => e.id === 'bot').secProps.loggingEnabled = 'false'; s.elements.find((e) => e.id === 'bot').secProps.runAsAdmin = 'true'; }) });
  await page.click('#tab-insights-trigger');
  const rows = page.locator('#insights-suggestion-list .list-group-item');
  const n0 = await rows.count();
  expect(n0).toBeGreaterThanOrEqual(2);
  const firstId = await rows.first().getAttribute('data-template-id');
  await rows.first().locator('.btn-insights-add').click();
  await expect(page.locator(`#insights-suggestion-list [data-template-id="${firstId}"]`)).toHaveCount(0);
  await expect(page.locator('#insights-handled-note')).toContainText('1 added to the register');
  const secondId = await rows.first().getAttribute('data-template-id');
  await rows.first().locator('.btn-ignore-suggestion').click();
  await expect(page.locator(`#insights-suggestion-list [data-template-id="${secondId}"]`)).toHaveCount(0);
  await expect(page.locator('#insights-handled-note')).toContainText('1 ignored');
  await expect(rows).toHaveCount(n0 - 2);
});

test('picking a suggested name also sets a matching icon (one undo step); every mapped icon exists', async ({ page }) => {
  const fs = require('node:fs'); const path = require('node:path');
  const css = fs.readFileSync(path.join(__dirname, '..', 'vendor/bootstrap-icons-1.13.2/bootstrap-icons.min.css'), 'utf8');
  await openApp(page, { session: model() });
  const map = await page.evaluate(() => NAME_ICONS);
  const missing = Object.values(map).flatMap((m) => Object.values(m)).filter((i) => !css.includes(`.${i}::before`));
  expect(missing).toEqual([]);
  const unmapped = await page.evaluate(() => ['process', 'datastore', 'interactor', 'infrastructure'].flatMap((k) => NAME_SUGGESTIONS[k].filter((n) => !NAME_ICONS[k][n]).map((n) => `${k}:${n}`)));
  expect(unmapped).toEqual([]);
  // Icons agree with what the name is recognised as (no conflicting subtype from the icon).
  const conflicts = await page.evaluate(() => ['process', 'datastore', 'interactor', 'infrastructure'].flatMap((k) => Object.entries(NAME_ICONS[k]).filter(([n, i]) => {
    const byName = app.subtypesOf({ id: 'p', type: k, name: n, icon: '' });
    if (k !== 'interactor') byName.delete('human');   // "User profile service" is not a person
    const byIcon = iconSubtypesFor(i, k);
    return byName.size && byIcon.length && !byIcon.some((x) => byName.has(x)) && !(k === 'interactor' && byIcon.includes('human'));
  }).map(([n, i]) => `${k}:${n}->${i}`)));
  expect(conflicts).toEqual([]);

  await select(page, 'db');
  await page.click('#props-input-name');
  await page.locator('#name-suggest-menu [role="option"]', { hasText: 'S3 bucket' }).click();
  expect(await page.evaluate(() => { const e = app.state.elements.find((x) => x.id === 'db'); return [e.name, e.icon]; })).toEqual(['S3 bucket', 'bi-bucket']);
  await expect(page.locator('#props-input-icon')).toHaveValue('bi-bucket');
  await expect(page.locator('#layers-nodes-group [data-id="db"] .bi-bucket')).toHaveCount(1);
  await page.click('#btn-undo');
  expect(await page.evaluate(() => { const e = app.state.elements.find((x) => x.id === 'db'); return [e.name, e.icon]; })).toEqual(['Customer database', 'bi-database-fill']);

  // Typing a free-text name leaves the icon alone.
  await page.fill('#props-input-name', 'Billing archive');
  await page.click('#tab-notes-trigger');
  expect(await page.evaluate(() => app.state.elements.find((x) => x.id === 'db').icon)).toBe('bi-database-fill');
});
