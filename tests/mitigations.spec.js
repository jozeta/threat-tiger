// FEAT-003: reusable mitigations linked many-to-many with threats.
const { test } = require('@playwright/test');
const { expect, openApp, demoSession, importJson, downloadText } = require('./helpers');

function model(mutate) {
  return demoSession((s) => {
    s.threats = s.threats.slice(0, 3).map((t, i) => ({ ...t, id: `th-00${i + 1}`, mitigationIds: [] }));
    s.mitigations = [];
    if (mutate) mutate(s);
  });
}

test('create a mitigation in the Mitigations tab and link it to several threats', async ({ page }) => {
  await openApp(page, { session: model() });
  await page.click('#tab-mitigations-trigger');
  await page.click('#btn-mitigation-new');
  await page.fill('#mitigation-input-title', 'Enforce MFA for all admin accounts');
  await page.selectOption('#mitigation-input-status', 'In progress');
  await page.fill('#mitigation-input-owner', 'Identity team');
  await page.fill('#mitigation-input-ticket', 'https://jira.example.com/browse/SEC-12');
  await page.locator('#mitigation-threat-list input[value="th-001"]').check();
  await page.locator('#mitigation-threat-list input[value="th-002"]').check();
  await page.click('#btn-mitigation-save');
  const r = await page.evaluate(() => ({ m: app.state.mitigations, links: app.state.threats.map((t) => [t.id, t.mitigationIds]) }));
  expect(r.m).toEqual([{ id: 'mi-001', title: 'Enforce MFA for all admin accounts', desc: '', status: 'In progress', owner: 'Identity team', ticketUrl: 'https://jira.example.com/browse/SEC-12' }]);
  expect(r.links).toEqual([['th-001', ['mi-001']], ['th-002', ['mi-001']], ['th-003', []]]);
  await expect(page.locator('#mitigation-tbody tr[data-mitigation-id="mi-001"]')).toContainText('th-001');
  await expect(page.locator('#badge-mitigation-count')).toHaveText('1');
  await page.click('#tab-register-trigger');
  await expect(page.locator('#threat-register-tbody tr').first()).toContainText('0/1 done');
});

test('threat dialog links existing mitigations, creates new ones, and turns template controls into mitigations (reused by title)', async ({ page }) => {
  await openApp(page, { session: model((s) => { s.mitigations = [{ id: 'mi-001', title: 'Rate-limit and monitor failed logins', status: 'Implemented' }]; }) });
  const el = await page.evaluate(() => { const e = app.state.elements.find((x) => x.type === 'process'); app.state.selectedElementIds = [e.id]; app.refreshAppViewVisualWorkspace(); return e.id; });
  await page.click('button[data-bs-target="#tab-panel-suggest"]');
  await page.locator('.template-card[data-template-id="P-AUTH-01"] .fw-bold.text-dark').first().click();
  await expect(page.locator('#threat-mitigation-suggested .threat-control-suggestion')).toHaveCount(4);
  await page.click('#btn-threat-use-all-controls');
  await page.fill('#threat-mitigation-input', 'Pen test the login flow');
  await page.keyboard.press('Enter');
  await page.click('#btn-modal-threat-save');
  const r = await page.evaluate(() => {
    const t = app.state.threats.find((x) => x.templateId === 'P-AUTH-01');
    return { ids: t.mitigationIds, titles: t.mitigationIds.map((id) => app.mitigationById(id).title), total: app.state.mitigations.length };
  });
  expect(r.ids).toContain('mi-001');                                   // existing one reused, not duplicated
  expect(r.titles).toEqual(expect.arrayContaining(['Pen test the login flow', 'Secure, single-use password-reset tokens']));
  expect(r.total).toBe(5);                                             // 1 existing + 3 new controls + 1 typed
  expect(new Set(await page.evaluate(() => app.state.mitigations.map((m) => m.title.toLowerCase()))).size).toBe(5);
  await page.click('#btn-undo');
  expect(await page.evaluate(() => app.state.mitigations.length)).toBe(1);   // one undo step
});

test('deleting a mitigation unlinks it everywhere; Insights, model checks, report and CSV show coverage', async ({ page }) => {
  await openApp(page, { session: model((s) => {
    s.mitigations = [{ id: 'mi-001', title: 'WAF rules', status: 'Implemented' }, { id: 'mi-002', title: 'Unused control', status: 'Proposed' }];
    s.threats[0].mitigationIds = ['mi-001']; s.threats[0].status = 'Open / Unmitigated';
    s.threats[1].mitigationIds = ['mi-002']; s.threats[1].status = 'Mitigated / Resolved';
  }) });
  const codes = await page.evaluate(() => app.computeModelWarnings().map((w) => w.code));
  expect(codes).toEqual(expect.arrayContaining(['MC-MIT-DONE', 'MC-MIT-STATUS']));
  await page.click('#tab-insights-trigger');
  await expect(page.locator('.insight-tile', { hasText: 'Mitigations done' })).toContainText('1/2');
  const md = await downloadText(page, '#btn-export-markdown');
  expect(md).toContain('## Mitigations');
  expect(md).toContain('| mi-001 | WAF rules | Implemented |');
  expect(md).toContain('_Mitigations:_ mi-001 WAF rules (Implemented)');
  await page.click('#tab-register-trigger');   // the CSV button lives in the register tab
  const csv = await downloadText(page, '#btn-register-export-csv');
  expect(csv).toContain('"mi-001 WAF rules (Implemented)"');

  await page.click('#tab-mitigations-trigger');
  await page.locator('#mitigation-tbody tr[data-mitigation-id="mi-001"]').click();
  await page.click('#btn-mitigation-delete');
  await page.click('#btn-confirm-delete');
  expect(await page.evaluate(() => [app.state.mitigations.map((m) => m.id), app.state.threats[0].mitigationIds])).toEqual([['mi-002'], []]);
  const orphan = await page.evaluate(() => app.computeModelWarnings().some((w) => w.code === 'MC-MIT-ORPHAN'));
  expect(orphan).toBe(false);   // mi-002 is still linked to th-002
});

test('imported mitigations are sanitised: bad links dropped, unknown ids removed, ids renumbered, no script', async ({ page }) => {
  await page.addInitScript(() => { window.__xss = []; });
  await openApp(page);
  const m = model((s) => {
    s.mitigations = [
      { id: 'mi-001', title: '<img src=x onerror="__xss.push(1)">', status: 'Hacked', ticketUrl: 'javascript:alert(1)' },
      { id: 'mi-001', title: 'Duplicate id', status: 'Verified', ticketUrl: 'https://ok.example/1' },
      { title: '' },
    ];
    s.threats[0].mitigationIds = ['mi-001', 'mi-999', 'mi-001'];
  });
  await importJson(page, JSON.stringify(m));
  const r = await page.evaluate(() => ({ m: app.state.mitigations.map((x) => [x.id, x.status, x.ticketUrl]), links: app.state.threats[0].mitigationIds }));
  expect(r.m).toEqual([['mi-001', 'Proposed', ''], ['mi-002', 'Verified', 'https://ok.example/1']]);
  expect(r.links).toEqual(['mi-001']);
  await page.click('#tab-mitigations-trigger');
  await page.locator('#mitigation-tbody tr').first().click();
  await expect(page.locator('#modal-mitigation')).toBeVisible();
  await page.locator('#modal-mitigation .btn-close').click();
  await expect(page.locator('#modal-mitigation')).toBeHidden();
  await page.click('#tab-register-trigger');
  await page.locator('#threat-register-tbody tr').first().locator('.btn-edit').click();
  await page.waitForTimeout(200);
  expect(await page.evaluate(() => window.__xss)).toEqual([]);
  await expect(page.locator('#threat-mitigation-chips')).toContainText('<img src=x');
});
