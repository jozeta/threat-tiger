// Coverage: whole user workflows driven through the UI (palette clicks, mouse drags, dialogs, real downloads).
const { test } = require('@playwright/test');
const C = require('./cov-helpers');
const { expect } = C;

/** Builds User -> Orders API -> Orders DB by clicking and dragging; returns the ids. */
async function buildModel(page) {
  const user = await C.addFromPalette(page, 'pal-interactor');
  await C.rename(page, 'Customer');
  await C.dragNode(page, user, -400, 0);
  const api = await C.addFromPalette(page, 'pal-process');
  await C.rename(page, 'Orders API');
  const db = await C.addFromPalette(page, 'pal-datastore');
  await C.rename(page, 'Orders DB');
  await C.dragNode(page, db, 400, 0);
  const f1 = await C.connect(page, user, api);
  await C.rename(page, 'HTTPS order');
  const f2 = await C.connect(page, api, db);
  await C.rename(page, 'SQL');
  return { user, api, db, f1, f2 };
}

test('workflow: build a model by clicking, wire flows with the mouse, rename in Properties', async ({ page }) => {
  const errors = C.trackAllErrors(page);
  await C.emptyApp(page);
  const ids = await buildModel(page);
  const m = await C.model(page);
  expect(m.elements.map((e) => [e.type, e.name])).toEqual([['interactor', 'Customer'], ['process', 'Orders API'], ['datastore', 'Orders DB']]);
  expect(m.flows.map((f) => [f.name, f.sourceId, f.targetId])).toEqual([['HTTPS order', ids.user, ids.api], ['SQL', ids.api, ids.db]]);
  // The shapes no longer overlap: the drags really moved them.
  const xs = m.elements.map((e) => e.x);
  expect(xs[1] - xs[0]).toBeGreaterThanOrEqual(300);
  expect(xs[2] - xs[1]).toBeGreaterThanOrEqual(300);
  // Canvas shows the names and two flow paths.
  await expect(page.locator(`#layers-nodes-group [data-id="${ids.api}"]`).first()).toContainText('Orders API');
  await expect(page.locator('#layers-flows-texts-group')).toContainText('HTTPS order');
  expect(await page.locator('#layers-flows-paths-group [data-flow-id]').evaluateAll((els) => new Set(els.map((e) => e.getAttribute('data-flow-id'))).size)).toBe(2);
  // Each step was logged.
  await page.click('#tab-notes-trigger');
  await expect(page.locator('#activity-ledger-tbody')).toContainText('Connected "Orders API" to "Orders DB"');
  expect(errors).toEqual([]);
});

/** Adds a suggestion for the selected component through its card and the threat dialog. */
async function addSuggestion(page, nth, { status, mitigation, notes } = {}) {
  await page.click('#tab-suggest-trigger');
  const card = page.locator('#box-threat-suggestions-list .template-card:not(.opacity-75)').nth(nth);
  const title = (await card.locator('.fw-bold.text-dark').first().textContent()).trim();
  await card.locator('.fw-bold.text-dark').first().click();
  await expect(page.locator('#modal-edit-threat')).toBeVisible();
  await expect(page.locator('#modal-threat-title')).toHaveValue(title);
  if (status) await page.selectOption('#modal-threat-status', status);
  if (notes) await page.fill('#modal-threat-mitigation-explanation', notes);
  if (mitigation) { await page.fill('#threat-mitigation-input', mitigation); await page.locator('#threat-mitigation-input').press('Enter'); }
  await page.click('#btn-modal-threat-save');
  await expect(page.locator('#modal-edit-threat')).toBeHidden();
  return title;
}

/** Builds the model and adds two threats (one mitigated with a new mitigation). */
async function buildFull(page) {
  const ids = await buildModel(page);
  await C.clickNode(page, ids.api);
  const t1 = await addSuggestion(page, 0, { status: 'Mitigated / Resolved', mitigation: 'Parameterised queries everywhere', notes: 'Done in sprint 4' });
  const t2 = await addSuggestion(page, 0);
  return { ...ids, t1, t2 };
}

test('workflow: threats from suggestions, a mitigation and a status land in the register, Properties and the badge', async ({ page }) => {
  const errors = C.trackAllErrors(page);
  await C.emptyApp(page);
  const r = await buildFull(page);
  const threats = await page.evaluate(() => app.state.threats.map(({ id, title, elementId, status, mitigationIds, mitigationExplanation, templateId }) => ({ id, title, elementId, status, mitigationIds, mitigationExplanation, templateId })));
  expect(threats).toHaveLength(2);
  expect(threats.map((t) => t.title)).toEqual([r.t1, r.t2]);
  expect(threats.every((t) => t.elementId === r.api && /^[A-Z]+-[A-Z0-9]+-\d+$|^TT-/.test(t.templateId))).toBe(true);
  expect(threats[0]).toMatchObject({ status: 'Mitigated / Resolved', mitigationExplanation: 'Done in sprint 4' });
  expect(threats[1].status).toBe('Open / Unmitigated');
  const mits = await page.evaluate(() => app.state.mitigations.map((m) => m.title));
  expect(mits).toContain('Parameterised queries everywhere');
  expect(threats[0].mitigationIds.length).toBe(1);
  // Register, badge and Properties agree.
  await page.click('#tab-register-trigger');
  await expect(await C.registerRows(page)).toHaveCount(2);
  await expect(page.locator('#badge-threat-count')).toHaveText('2');
  await expect(page.locator('#threat-register-tbody')).toContainText('Orders API');
  await page.click('#tab-props-trigger');
  await expect(page.locator('#props-threats-container')).toContainText(r.t1);
  await expect(page.locator('#props-threats-container')).toContainText(r.t2);
  // The added suggestions leave the suggestion list; others stay.
  await page.click('#tab-suggest-trigger');
  await expect(page.locator('#box-threat-suggestions-list .template-card:not(.opacity-75)').first()).toBeVisible();
  for (const t of [r.t1, r.t2]) await expect(page.locator('#box-threat-suggestions-list .template-card:not(.opacity-75)', { hasText: t })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('workflow: JSON export, Reset canvas, Import JSON gives back the same model', async ({ page }) => {
  await C.emptyApp(page);
  await buildFull(page);
  const before = await C.model(page);
  const file = await C.downloadFile(page, () => C.clickControl(page, '#btn-export'));
  expect(file.name).toBe('STRIDE-Threat-Model-Export.json');
  const json = JSON.parse(file.buffer.toString('utf8'));
  expect(json.appVersion).toBe(C.PKG.version);
  expect(json.activityLog.length).toBeGreaterThan(5);
  await C.clickControl(page, '#btn-reset-session');
  await page.click('#btn-confirm-delete');
  await expect.poll(() => page.evaluate(() => app.state.elements.length + app.state.flows.length + app.state.threats.length)).toBe(0);
  await expect(await C.registerRows(page)).toHaveCount(0);
  await C.importJson(page, file.buffer.toString('utf8'));
  await expect.poll(() => page.evaluate(() => app.state.elements.length)).toBe(3);
  const after = await C.model(page);
  const strip = (m) => JSON.parse(JSON.stringify(m, (k, v) => (['x', 'y', 'width', 'height', 'bendX', 'bendY'].includes(k) && typeof v === 'number' ? Math.round(v) : v)));
  expect(strip(after)).toEqual(strip(before));
  await expect(await C.registerRows(page)).toHaveCount(2);
});

test('workflow: the git export has no log, is deterministic, and re-imports to the same model', async ({ page }) => {
  await C.emptyApp(page);
  await buildFull(page);
  const a = await C.downloadFile(page, () => C.clickControl(page, '#btn-export-no-log'));
  const b = await C.downloadFile(page, () => C.clickControl(page, '#btn-export-no-log'));
  expect(a.name).toBe('Coverage.threat-model.json');
  expect(a.buffer.equals(b.buffer)).toBe(true);
  const json = JSON.parse(a.buffer.toString('utf8'));
  expect(json.activityLog).toBeUndefined();
  expect(Object.keys(json.elements[0])).toEqual([...Object.keys(json.elements[0])].sort());
  const before = await C.model(page);
  await page.evaluate(() => { app.state.elements = []; app.state.flows = []; app.state.threats = []; app.refreshAppViewVisualWorkspace(); });
  await C.importJson(page, a.buffer.toString('utf8'));
  await expect.poll(() => page.evaluate(() => app.state.threats.length)).toBe(2);
  const after = await C.model(page);
  expect(after.flows.map((f) => [f.name, f.sourceId, f.targetId])).toEqual(before.flows.map((f) => [f.name, f.sourceId, f.targetId]));
  expect(after.threats.map((t) => [t.id, t.title, t.status, t.mitigationIds])).toEqual(before.threats.map((t) => [t.id, t.title, t.status, t.mitigationIds]));
  expect(after.mitigations.map((m) => m.title)).toEqual(before.mitigations.map((m) => m.title));
});

test('workflow: undo every step back to an empty canvas, then redo every step back to the finished model', async ({ page }) => {
  await C.emptyApp(page);
  await buildFull(page);
  const finished = await C.model(page);
  let undos = 0;
  while (await page.locator('#btn-undo').isEnabled()) { await page.click('#btn-undo'); undos++; if (undos > 60) break; }
  expect(undos).toBeGreaterThanOrEqual(12);   // 3 shapes, 3 renames, 2 drags, 2 flows, 2 flow names, 2 threats …
  expect(await page.evaluate(() => [app.state.elements.length, app.state.flows.length, app.state.threats.length, (app.state.mitigations || []).length])).toEqual([0, 0, 0, 0]);
  await expect(page.locator('#layers-nodes-group [data-id]')).toHaveCount(0);
  await expect(await C.registerRows(page)).toHaveCount(0);
  let redos = 0;
  while (await page.locator('#btn-redo').isEnabled()) { await page.click('#btn-redo'); redos++; if (redos > 60) break; }
  expect(redos).toBe(undos);
  expect(await C.model(page)).toEqual(finished);
  await expect(await C.registerRows(page)).toHaveCount(2);
});

test('workflow: Mermaid export, then Mermaid import (replace) rebuilds the same shapes and connections', async ({ page }) => {
  await C.emptyApp(page);
  await buildModel(page);
  const file = await C.downloadFile(page, () => C.clickControl(page, '#btn-export-mermaid'));
  expect(file.name).toBe('Coverage.mmd');
  const text = file.buffer.toString('utf8');
  expect(text).toMatch(/^flowchart LR/);
  for (const n of ['Customer', 'Orders API', 'Orders DB', 'HTTPS order', 'SQL']) expect(text).toContain(n);
  await C.clickControl(page, '#btn-import-mermaid');
  await expect(page.locator('#modal-mermaid-import')).toBeVisible();
  await page.fill('#mermaid-import-text', text);
  await page.check('#mermaid-mode-replace');
  await page.click('#btn-mermaid-import-go');
  await expect(page.locator('#modal-mermaid-import')).toBeHidden();
  const m = await C.model(page);
  const name = (id) => m.elements.find((e) => e.id === id).name;
  expect(m.elements.map((e) => e.name).sort()).toEqual(['Customer', 'Orders API', 'Orders DB']);
  expect(m.flows.map((f) => `${name(f.sourceId)}>${f.name}>${name(f.targetId)}`).sort()).toEqual(['Customer>HTTPS order>Orders API', 'Orders API>SQL>Orders DB']);
  // Documented: Mermaid import makes flowchart shapes; the data store's cylinder becomes a database shape.
  expect(Object.fromEntries(m.elements.map((e) => [e.name, e.type]))).toEqual({ Customer: 'fc_process', 'Orders API': 'fc_process', 'Orders DB': 'fc_database' });
  await expect(page.locator('#layers-nodes-group [data-id]').filter({ hasText: 'Orders DB' }).first()).toBeVisible();
});

test('workflow: CSV export has one correct row per threat (component, risk score, severity, status, mitigation)', async ({ page }) => {
  await C.emptyApp(page);
  const r = await buildFull(page);
  await page.click('#tab-register-trigger');
  const file = await C.downloadFile(page, () => page.click('#btn-register-export-csv'));
  expect(file.name).toBe('STRIDE-Threat-Register.csv');
  const text = file.buffer.toString('utf8').replace(/^\uFEFF/, '');
  const rows = text.split('\r\n').map((line) => line.slice(1, -1).split('","'));
  expect(rows[0]).toEqual(['Threat ID', 'STRIDE Category', 'Title', 'Component', 'Component ID', 'Likelihood', 'Impact', 'Risk Score', 'Severity', 'Status', 'Description', 'Mitigation', 'References', 'Mitigations']);
  expect(rows).toHaveLength(3);
  const threats = await page.evaluate(() => app.state.threats);
  rows.slice(1).forEach((row, i) => {
    const t = threats[i];
    expect(row[0]).toBe(t.id);
    expect(row[2]).toBe(t.title.replace(/"/g, '""'));
    expect(row[3]).toBe('Orders API');
    expect(row[4]).toBe(r.api);
    expect(Number(row[7])).toBe(Number(t.likelihood) * Number(t.impact));
    expect(['Low', 'Medium', 'High', 'Critical']).toContain(row[8]);
    expect(row[9]).toBe(t.status);
  });
  expect(rows[1][11]).toBe('Done in sprint 4');
  expect(rows[1][13]).toContain('Parameterised queries everywhere');
});

test('workflow: Markdown report names the project, every threat, flow, component and mitigation', async ({ page }) => {
  await C.emptyApp(page);
  const r = await buildFull(page);
  const file = await C.downloadFile(page, () => C.clickControl(page, '#btn-export-markdown'));
  expect(file.name).toMatch(/\.md$/);
  const md = file.buffer.toString('utf8');
  expect(md).toMatch(/^# Coverage\n/);
  expect(md).toContain('| Components | 3 |');
  expect(md).toContain('| Data flows | 2 |');
  expect(md).toContain('| Threats | 2 |');
  expect(md).toContain('```mermaid\nflowchart');
  const threats = await page.evaluate(() => app.state.threats);
  for (const t of threats) expect(md).toContain(`**${t.id} — ${t.title}**`);
  expect(md).toContain('### Orders API (process)');
  expect(md).toContain('| HTTPS order | Customer | Orders API |');
  expect(md).toContain('| SQL | Orders API | Orders DB |');
  expect(md).toContain('## Mitigations');
  expect(md).toContain('Parameterised queries everywhere');
  // The risk summary counts one mitigated and one open threat.
  const summary = md.split('## Risk summary')[1].split('##')[0];
  const totals = summary.split('\n').filter((l) => /^\| (Critical|High|Medium|Low) \|/.test(l)).map((l) => l.split('|').map((c) => c.trim()).slice(2, 6).map(Number));
  expect(totals.reduce((s, c) => s + c[0], 0)).toBe(1);
  expect(totals.reduce((s, c) => s + c[2], 0)).toBe(1);
  expect(totals.reduce((s, c) => s + c[3], 0)).toBe(2);
  expect(r.t1.length).toBeGreaterThan(0);
});

test('workflow: Save as PNG downloads a real PNG that covers the whole diagram', async ({ page }) => {
  await C.emptyApp(page);
  await buildModel(page);
  const bbox = await page.evaluate(() => app.getIsometricBoundingBox());
  const file = await C.downloadFile(page, () => page.click('#btn-canvas-save-png'));
  expect(file.name).toMatch(/\.png$/);
  expect(file.buffer.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
  const w = file.buffer.readUInt32BE(16), h = file.buffer.readUInt32BE(20);
  expect(w).toBeGreaterThanOrEqual(Math.round(bbox.maxX - bbox.minX));
  expect(h).toBeGreaterThanOrEqual(Math.round(bbox.maxY - bbox.minY));
  // The button comes back and the grid is visible again.
  await expect(page.locator('#btn-canvas-save-png')).toBeEnabled();
  await expect(page.locator('#btn-canvas-save-png i.bi-filetype-png')).toHaveCount(1);
});

test('workflow: Session metadata dialog sets title, scope and participants everywhere, and undo reverts it', async ({ page }) => {
  await C.emptyApp(page);
  await page.click('#btn-open-session-meta');
  await expect(page.locator('#modal-session-context')).toBeVisible();
  await expect(page.locator('#modal-meta-project-title')).toHaveValue('Coverage');
  await page.fill('#modal-meta-project-title', 'Payments platform');
  await page.fill('#modal-meta-scope', 'Checkout and refunds');
  await page.fill('#modal-meta-participants', 'Ana, Bo');
  await page.click('#btn-modal-session-save');
  await expect(page.locator('#modal-session-context')).toBeHidden();
  await expect(page.locator('#project-title-badge')).toHaveText('Payments platform');
  await expect(page.locator('#lbl-summary-scope')).toHaveText('Checkout and refunds');
  await expect(page.locator('#lbl-summary-parts')).toContainText('Ana');
  await expect(page.locator('#lbl-summary-parts')).toContainText('Bo');
  const md = await C.downloadText(page, '#btn-export-markdown');
  expect(md).toMatch(/^# Payments platform\n/);
  expect(md).toContain('| Scope | Checkout and refunds |');
  const json = JSON.parse(await C.downloadText(page, '#btn-export'));
  expect([json.projectTitle, json.scopeDefinition, json.participants]).toEqual(['Payments platform', 'Checkout and refunds', 'Ana, Bo']);
  await page.click('#btn-undo');
  await expect(page.locator('#project-title-badge')).toHaveText('Coverage');
  expect(await page.evaluate(() => app.state.scopeDefinition)).not.toBe('Checkout and refunds');
});

test('workflow: Reset canvas saves a History snapshot, and Restore brings the model back', async ({ page }) => {
  await C.emptyApp(page);
  await buildModel(page);
  const before = await C.model(page);
  await C.clickControl(page, '#btn-reset-session');
  await expect(page.locator('#modal-confirm-delete')).toContainText('Start a new, empty model?');
  await page.click('#btn-confirm-delete');
  await expect.poll(() => page.evaluate(() => app.state.elements.length)).toBe(0);
  await expect(page.locator('#btn-undo')).toBeDisabled();
  await C.noModal(page);
  await C.clickControl(page, '#btn-snapshots');
  const item = page.locator('#snapshot-list .list-group-item', { hasText: 'Before reset' }).first();
  await expect(item).toContainText('3 components, 2 flows, 0 threats');
  await item.locator('button', { hasText: 'Restore' }).click();
  await expect.poll(() => page.evaluate(() => app.state.elements.length)).toBe(3);
  const after = await C.model(page);
  expect(after.elements.map((e) => e.name)).toEqual(before.elements.map((e) => e.name));
  expect(after.flows.map((f) => f.name)).toEqual(before.flows.map((f) => f.name));
});
