// Suggestions 2.0: researched templates, conditions, subtypes, decisions, references, search, updates.
const { test } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const { expect, openApp, demoSession, downloadText } = require('./helpers');

const TEMPLATES = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'threat_templates.json'), 'utf8'));
const TYPES = ['process', 'datastore', 'interactor', 'infrastructure', 'flow'];

test('template library: ids unique, categories fit the element type, every threat has controls and resolvable references', async ({ page }) => {
  await openApp(page);
  const allowed = { process: 6, infrastructure: 6, datastore: ['Tampering', 'Repudiation', 'Information Disclosure', 'Denial of Service'], interactor: ['Spoofing', 'Repudiation', 'Information Disclosure'], flow: ['Tampering', 'Information Disclosure', 'Denial of Service'] };
  const ids = new Set();
  const refs = [];
  for (const type of TYPES) {
    for (const t of TEMPLATES[type]) {
      expect(ids.has(t.id), `duplicate id ${t.id}`).toBe(false); ids.add(t.id);
      if (Array.isArray(allowed[type])) expect(allowed[type], `${t.id} category`).toContain(t.category);
      expect(t.controls.length, `${t.id} controls`).toBeGreaterThan(0);
      expect(t.refs.length, `${t.id} refs`).toBeGreaterThan(0);
      expect(t.desc.length, `${t.id} desc`).toBeGreaterThan(40);
      refs.push(...t.refs);
    }
  }
  expect(ids.size).toBeGreaterThanOrEqual(80);
  const unresolved = await page.evaluate((list) => list.filter((r) => !refLink(r)), [...new Set(refs)]);
  expect(unresolved).toEqual([]);
});

test('template conditions only use known keys, switches and subtypes', async ({ page }) => {
  await openApp(page);
  const r = await page.evaluate((tpls) => {
    const problems = [];
    const walk = (c, id) => {
      Object.keys(c).forEach((k) => {
        if (!CONDITION_KEYS.includes(k)) problems.push(`${id}: key ${k}`);
        const v = c[k];
        if (['on', 'off', 'anyOn'].includes(k)) [].concat(v).forEach((x) => { if (!SWITCH_LABELS[x]) problems.push(`${id}: switch ${x}`); });
        if (k === 'subtype') [].concat(v).forEach((x) => { if (!SUBTYPE_LABELS[x]) problems.push(`${id}: subtype ${x}`); });
        if (['inbound', 'outbound', 'anyFlow', 'endpoint', 'source', 'target', 'not'].includes(k)) walk(v, id);
        if (['any', 'all'].includes(k)) v.forEach((x) => walk(x, id));
      });
      // {} on a flow key means "any flow"; the sanitizer keeps it inside its parent, so only check non-empty objects.
      if (Object.keys(c).length && JSON.stringify(sanitizeCondition(c)) !== JSON.stringify(c)) problems.push(`${id}: changed by sanitizer`);
    };
    Object.values(tpls).filter(Array.isArray).flat().forEach((t) => {
      if (t.when) walk(t.when, t.id);
      (t.subtypes || []).forEach((x) => { if (!SUBTYPE_LABELS[x]) problems.push(`${t.id}: subtype hint ${x}`); });
    });
    return problems;
  }, TEMPLATES);
  expect(r).toEqual([]);
});

function model(mutate) {
  return demoSession((s) => {
    s.elements = [
      { id: 'z', type: 'boundary', name: 'Cloud VPC', x: 400, y: 0, width: 800, height: 500 },
      { id: 'web', type: 'interactor', name: 'Customer', x: 0, y: 150, width: 200, height: 80, icon: 'bi-person-fill', secProps: { unauthAccess: 'true', isPrivilegedUser: 'false', mfaRequired: 'false', vpnRequired: 'false' } },
      { id: 'api', type: 'process', name: 'Orders API', x: 500, y: 150, width: 200, height: 80, icon: 'bi-server', secProps: { runAsAdmin: 'false', loggingEnabled: 'true', handlesSensitiveData: 'true', isCrownJewel: 'false' } },
      { id: 'bkt', type: 'datastore', name: 'Invoices S3 bucket', x: 900, y: 150, width: 200, height: 80, icon: 'bi-database-fill', secProps: { auditLogged: 'true', storesCredentials: 'false', storesPii: 'true', encryptedAtRest: 'true', handlesSensitiveData: 'true', isCrownJewel: 'false' } },
    ];
    s.flows = [
      { id: 'f1', name: 'HTTPS', ports: '443', sourceId: 'web', targetId: 'api', sourceAnchor: 'right', targetAnchor: 'left', secProps: { encrypted: 'true', authenticated: 'false' }, points: [] },
      { id: 'f2', name: 'PutObject', sourceId: 'api', targetId: 'bkt', sourceAnchor: 'right', targetAnchor: 'left', secProps: { encrypted: 'false', authenticated: 'true' }, points: [] },
    ];
    s.threats = [];
    if (mutate) mutate(s);
  });
}
const select = (page, id, isFlow) => page.evaluate(([i, fl]) => { if (fl) { app.state.selectedElementIds = []; app.state.selectedFlowId = i; } else { app.state.selectedElementIds = [i]; app.state.selectedFlowId = null; } app.refreshAppViewVisualWorkspace(); }, [id, isFlow]);
const openTemplates = (page) => page.click('button[data-bs-target="#tab-panel-suggest"]');

test('subtypes from icon and name drive triggered and relevant suggestions, with readable reasons', async ({ page }) => {
  await openApp(page, { session: model() });
  await page.waitForFunction(() => app.threatSuggestions.process.length);   // the threat library loads asynchronously
  const r = await page.evaluate(() => {
    const out = {};
    const by = (id) => app.evaluateRules(app.state.elements.find((e) => e.id === id) || app.state.flows.find((f) => f.id === id));
    out.bkt = by('bkt').map((f) => `${f.rule.id}|${f.reason}`);
    out.api = by('api').map((f) => `${f.rule.id}|${f.reason}`);
    out.f2 = by('f2').map((f) => `${f.rule.id}|${f.reason}`);
    out.subApi = [...app.subtypesOf(app.state.elements.find((e) => e.id === 'api'))].sort();
    out.subBkt = [...app.subtypesOf(app.state.elements.find((e) => e.id === 'bkt'))].sort();
    return out;
  });
  expect(r.subApi).toEqual(['api', 'host']);
  expect(r.subBkt).toEqual(expect.arrayContaining(['object-storage', 'database']));
  expect(r.bkt).toContain('TT-D05|recognised as: object storage bucket');
  expect(r.bkt.find((x) => x.startsWith('D-RETENTION-01'))).toBe('D-RETENTION-01|stores personal data');
  expect(r.api).toContain('TT-P06|handles sensitive data and logging enabled');
  expect(r.api.find((x) => x.startsWith('TT-P07'))).toBe('TT-P07|incoming flow "HTTPS" comes from "Customer" (allows anonymous access)');
  expect(r.api.find((x) => x.startsWith('TT-P03'))).toBe('TT-P03|handles sensitive data; incoming flow "HTTPS" not authenticated');
  // Both ends hold sensitive data; the reason names the first matching end (the source).
  expect(r.f2.find((x) => x.startsWith('TT-F04'))).toBe('TT-F04|not encrypted; connects to "Orders API" (handles sensitive data)');

  await select(page, 'api'); await openTemplates(page);
  await expect(page.locator('#suggest-subtype-hint')).toContainText('API');
  await expect(page.locator('#suggest-section-relevant')).toContainText('Mass assignment lets users change protected fields');
});

test('"Not applicable" records a reason, moves the card, counts in Insights, appears in the report, and can be restored or undone', async ({ page }) => {
  await openApp(page, { session: model() });
  await select(page, 'bkt'); await openTemplates(page);
  const card = page.locator('#suggest-section-triggered .template-card[data-template-id="TT-D05"]');
  await card.locator('.btn-dismiss-suggestion').click();
  await page.fill('#input-dismiss-reason', 'Bucket policy blocks public access; checked by AWS Config rule');
  await page.click('#btn-dismiss-save');
  await expect(page.locator('#suggest-section-triggered .template-card[data-template-id="TT-D05"]')).toHaveCount(0);
  await expect(page.locator('#suggest-section-dismissed')).toContainText('Bucket policy blocks public access');
  const stored = await page.evaluate(() => app.state.elements.find((e) => e.id === 'bkt').dismissedSuggestions['TT-D05']);
  expect(stored.reason).toBe('Bucket policy blocks public access; checked by AWS Config rule');
  expect(stored.by).toBe('Tester');

  await page.click('#tab-insights-trigger');
  await expect(page.locator('.insight-tile', { hasText: 'Marked not applicable' })).toContainText('1');
  const md = await test.step('export markdown', () => downloadText(page, '#btn-export-markdown'));
  expect(md).toContain('## Suggestions marked not applicable');
  expect(md).toContain('| Invoices S3 bucket | Storage bucket Invoices S3 bucket is publicly accessible | Bucket policy blocks public access; checked by AWS Config rule | Tester |');

  await test.step('undo', () => page.click('#btn-undo'));
  expect(await page.evaluate(() => Object.keys(app.state.elements.find((e) => e.id === 'bkt').dismissedSuggestions || {}))).toEqual([]);
  await test.step('redo', () => page.click('#btn-redo'));
  await test.step('open templates', () => page.click('button[data-bs-target="#tab-panel-suggest"]'));
  await test.step('open dismissed', () => page.locator('#suggest-section-dismissed summary').click());
  await test.step('restore', () => page.locator('#suggest-section-dismissed .btn-restore-suggestion').click());
  await expect(page.locator('#suggest-section-triggered .template-card[data-template-id="TT-D05"]')).toHaveCount(1);
});

test('added suggestions carry controls, references and the reason; references link to their sources', async ({ page }) => {
  await openApp(page, { session: model() });
  await select(page, 'api'); await openTemplates(page);
  const chip = page.locator('.template-card[data-template-id="TT-P05"] a.template-ref', { hasText: 'CWE-639' });
  await expect(chip).toHaveAttribute('href', 'https://cwe.mitre.org/data/definitions/639.html');
  await expect(chip).toHaveAttribute('target', '_blank');
  await expect(chip).toHaveAttribute('rel', 'noopener noreferrer');
  await expect(page.locator('.template-card[data-template-id="TT-P07"] a.template-ref', { hasText: 'OWASP API4:2023' })).toHaveAttribute('href', 'https://owasp.org/API-Security/');
  await page.click('#btn-add-triggered');
  const t = await page.evaluate(() => app.state.threats.find((x) => x.templateId === 'TT-P05'));
  expect(t.refs).toEqual(['CWE-639', 'OWASP API1:2023', 'OWASP A01:2021']);
  expect(t.desc).toContain('Typical controls:\n- Check ownership/permission for every object access, server-side');
  expect(t.desc).toContain('Real-world example: First American Financial (2019)');
  expect(t.desc).toContain('Why suggested: handles sensitive data; incoming flow "HTTPS" crosses "Cloud VPC".');
  const csv = await downloadText(page, '#btn-register-export-csv');
  expect(csv.split('\r\n')[0]).toContain('"References"');
  expect(csv).toContain('"CWE-639, OWASP API1:2023, OWASP A01:2021"');
});

test('search filters suggestions by title, control or reference', async ({ page }) => {
  await openApp(page, { session: model() });
  await select(page, 'api'); await openTemplates(page);
  await page.fill('#input-templates-search', 'CWE-918');
  await expect(page.locator('#box-threat-suggestions-list .template-card')).toHaveCount(1);
  await expect(page.locator('#box-threat-suggestions-list .template-card')).toContainText('Server-side request forgery');
  await page.fill('#input-templates-search', 'idempotency');
  const titles = await page.locator('#box-threat-suggestions-list .template-card .fw-bold.text-dark').allTextContents();
  expect(titles).toContain('Race conditions in business transactions');
  await page.fill('#input-templates-search', 'zzzz-no-match');
  await expect(page.locator('#box-threat-suggestions-list')).toContainText('No templates match your search.');
});

test('untrusted template files are sanitised (unknown condition keys, bad ids, oversized lists)', async ({ page }) => {
  await openApp(page);
  const t = await page.evaluate(() => sanitizeTemplate({
    id: 'bad id with spaces <script>', category: 'Tampering', title: 'X', desc: 'Y',
    refs: Array.from({ length: 50 }, (_, i) => `CWE-${i}`), controls: ['a', { evil: 1 }, ''],
    when: { on: ['encrypted', 'x"); alert(1); //'], eval: 'alert(1)', inbound: { crossesBoundary: 'yes', __proto__: { polluted: true } }, any: 'not-an-array' },
    likelihood: 99, impact: -3,
  }, false));
  expect(t.id).toBeUndefined();
  expect(t.refs).toHaveLength(12);
  expect(t.controls).toEqual(['a']);
  expect(t.when).toEqual({ on: ['encrypted'], inbound: { crossesBoundary: false } });
  expect([t.likelihood, t.impact]).toEqual([5, 1]);
  expect(await page.evaluate(() => ({}).polluted)).toBeUndefined();
});

test('built-in templates update automatically unless the user edited them', async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => {
    const lib = app.getDefaultThreatSuggestions();
    lib.process = [
      { id: 'P-SSRF-01', category: 'Elevation of Privilege', title: 'Old SSRF wording', desc: 'old', isUnsaved: false },
      { id: 'P-XSS-01', category: 'Elevation of Privilege', title: 'My own XSS wording', desc: 'mine', isUnsaved: false, userEdited: true },
    ];
    localStorage.setItem('stride_workbench_threat_templates', JSON.stringify(lib));
  });
  await page.reload();
  await page.waitForFunction(() => window.app && window.app.state);
  await page.waitForTimeout(300);
  const r = await page.evaluate(() => Object.fromEntries(app.threatSuggestions.process.filter((t) => ['P-SSRF-01', 'P-XSS-01'].includes(t.id)).map((t) => [t.id, t.title])));
  expect(r).toEqual({ 'P-SSRF-01': 'Server-side request forgery (SSRF) in [name]', 'P-XSS-01': 'My own XSS wording' });
});

test('templates editor keeps references, controls and conditions when the text is edited', async ({ page }) => {
  await openApp(page);
  const r = await page.evaluate(() => {
    const t = app.threatSuggestions.datastore.find((x) => x.id === 'TT-D05');
    app.openEditTemplateModal(t, 'datastore');
    document.getElementById('modal-template-desc').value = 'Edited description';
    document.getElementById('modal-template-refs').value = 'CWE-552, ATT&CK T1530, CAPEC-1';
    app.saveTemplate();
    const after = app.threatSuggestions.datastore.find((x) => x.id === 'TT-D05');
    return { desc: after.desc, refs: after.refs, when: after.when, edited: after.userEdited, controls: after.controls.length };
  });
  expect(r).toEqual({ desc: 'Edited description', refs: ['CWE-552', 'ATT&CK T1530', 'CAPEC-1'], when: { subtype: 'object-storage' }, edited: true, controls: 3 });
});

test('icon dropdown lists icons with tailored threat suggestions first', async ({ page }) => {
  const demo = demoSession();
  await openApp(page, { session: demo });
  const check = async (type) => {
    const id = demo.elements.find((e) => e.type === type).id;
    await page.evaluate((i) => { app.state.selectedElementIds = [i]; app.state.selectedFlowId = null; app.refreshAppViewVisualWorkspace(); }, id);
    return page.evaluate((libraryKey) => {
      const groups = [...document.querySelectorAll('#props-input-icon optgroup')].map((g) => g.label);
      const mapped = [...document.querySelectorAll('#props-input-icon optgroup[data-tailored] option')].map((o) => o.value);
      const wanted = app.templateSubtypesFor(libraryKey);
      const type = app.state.elements.find((e) => e.id === app.state.selectedElementIds[0]).type;
      const groupsOk = [...document.querySelectorAll('#props-input-icon optgroup[data-tailored]')].every((g) => [...g.children].every((o) => iconSubtypesFor(o.value, type).includes(g.dataset.tailored)));
      const allMapped = mapped.every((v) => iconSubtypesFor(v, type).some((s) => wanted.has(s)));
      const notMappedLater = [...document.querySelectorAll('#props-input-icon optgroup:not([data-tailored]) option')]
        .every((o) => !iconSubtypesFor(o.value, type).some((s) => wanted.has(s)));
      return { first: groups[0] === 'Current' ? groups[1] : groups[0], mapped, allMapped, notMappedLater, groupsOk };
    }, type);
  };
  const ds = await check('datastore');
  expect(ds.first).toMatch(/— tailored threats$/);
  expect(ds.mapped).toEqual(expect.arrayContaining(['bi-bucket', 'bi-database', 'bi-memory', 'bi-inboxes']));
  expect(ds.mapped).toContain('bi-sd-card');   // 1.13.0: removable media has its own threats
  expect(ds.allMapped && ds.notMappedLater && ds.groupsOk).toBe(true);
  const proc = await check('process');
  expect(proc.mapped).toEqual(expect.arrayContaining(['bi-globe', 'bi-git']));
  expect(proc.mapped).toContain('bi-wifi');   // 1.13.0: network-device threats reused for processes (gateways, proxies)
  expect(proc.allMapped && proc.notMappedLater && proc.groupsOk).toBe(true);
  const ent = await check('interactor');
  expect(ent.mapped).toEqual(expect.arrayContaining(['bi-person-gear', 'bi-building', 'bi-phone']));
  expect(ent.allMapped && ent.notMappedLater && ent.groupsOk).toBe(true);
});

test('icon recognition: variants match, look-alike names do not, and per-type meanings apply', async ({ page }) => {
  await openApp(page);
  const r = await page.evaluate(() => ({
    windowsOs: iconSubtypesFor('bi-windows', 'infrastructure'),
    windowStack: iconSubtypesFor('bi-window-stack', 'process'),
    sdk: iconSubtypesFor('bi-braces-asterisk', 'process'),
    dbLock: iconSubtypesFor('bi-database-lock', 'datastore'),
    dns: iconSubtypesFor('bi-globe2', 'process'),
    cpuHost: iconSubtypesFor('bi-cpu', 'infrastructure'),
    cpuIot: iconSubtypesFor('bi-cpu', 'interactor'),
    objectStore: iconSubtypesFor('bi-archive-fill', 'datastore'),
    partner: iconSubtypesFor('bi-cloud-arrow-up-fill', 'interactor'),
    cpuProcess: iconSubtypesFor('bi-cpu-fill', 'process'),
  }));
  expect(r).toEqual({
    windowsOs: ['host'], windowStack: ['web'], sdk: ['api'], dbLock: ['database'], dns: ['dns', 'network-device'],
    cpuHost: ['host'], cpuIot: ['iot'], objectStore: ['object-storage'], partner: ['partner-system'],
    cpuProcess: ['host'],   // a CPU icon alone does not make a process an AI service
  });
});

test('library coverage: at least 5 threats for every element type × applicable STRIDE category', () => {
  const allowed = {
    process: ['Spoofing', 'Tampering', 'Repudiation', 'Information Disclosure', 'Denial of Service', 'Elevation of Privilege'],
    infrastructure: ['Spoofing', 'Tampering', 'Repudiation', 'Information Disclosure', 'Denial of Service', 'Elevation of Privilege'],
    datastore: ['Tampering', 'Repudiation', 'Information Disclosure', 'Denial of Service'],
    interactor: ['Spoofing', 'Repudiation', 'Information Disclosure'],
    flow: ['Tampering', 'Information Disclosure', 'Denial of Service'],
  };
  const thin = [];
  for (const [type, cats] of Object.entries(allowed)) for (const c of cats) {
    const n = TEMPLATES[type].filter((t) => t.category === c).length;
    if (n < 5) thin.push(`${type}/${c}=${n}`);
  }
  expect(thin).toEqual([]);
});
