// Regression tests for bug group A (data, persistence, dialogs' save), November 2026 bug check.
// Each test asserts the CORRECT behaviour.
const { test } = require('@playwright/test');
const H = require('./helpers');
const { expect } = H;

const P = (id, type, name, x, y, extra = {}) => Object.assign({ id, type, name, x, y, width: 120, height: 60, secProps: {} }, extra);
const sess = (elements, flows = [], threats = [], extra = {}) => Object.assign({ projectTitle: 'T', activeUser: 'Tester', elements, flows, threats }, extra);
const TH = (id, title, extra = {}) => Object.assign({ id, title, category: 'Spoofing', elementId: 'a', status: 'Open / Unmitigated', likelihood: '3', impact: '3' }, extra);
const reload = async (page) => { await page.reload(); await page.waitForFunction(() => window.app && window.app.state); };

// ── #1 a model without shapes survives a reload ────────────────────────────────
test('A1: title, scope, participants and mitigations of a model without shapes survive a reload', async ({ page }) => {
  await H.openApp(page, { session: sess([], [], [], {
    projectTitle: 'Payments review', scopeDefinition: 'Checkout only', participants: 'Alice, Tester',
    mitigations: [{ id: 'M-001', title: 'Use TLS', status: 'Proposed', owner: '', ticketUrl: '' }],
  }) });
  await reload(page);
  const s = await page.evaluate(() => ({ t: app.state.projectTitle, s: app.state.scopeDefinition, p: app.state.participants, m: (app.state.mitigations || []).map(m => m.title) }));
  expect(s).toEqual({ t: 'Payments review', s: 'Checkout only', p: 'Alice, Tester', m: ['Use TLS'] });
});

test('A1b: with nothing stored the app still starts a new model', async ({ page }) => {
  await H.openApp(page);
  const s = await page.evaluate(() => ({ t: app.state.projectTitle, n: app.state.elements.length }));
  expect(s).toEqual({ t: 'New Threat Model Assessment Project', n: 0 });
  await expect.poll(() => page.evaluate(() => !!localStorage.getItem('stride_workbench_session_manifest_v26'))).toBe(true);
});

// ── #3 two tabs on the same model ──────────────────────────────────────────────
test('A3: a second tab does not silently overwrite the first tab\'s saved changes, and offers Reload', async ({ page, context }) => {
  await H.openApp(page, { session: H.demoSession() });
  const other = await context.newPage();
  await other.goto('/threat-tiger.html?test=true');
  await other.waitForFunction(() => window.app && window.app.state && app.state.elements.length > 0);
  await page.evaluate(() => { app.state.projectTitle = 'Title from tab A'; app.saveSessionToLocalStorage(); app.flushSave(); });
  await expect(other.locator('#alert-other-tab')).toBeVisible();
  await other.evaluate(() => { app.state.scopeDefinition = 'Scope from tab B'; app.saveSessionToLocalStorage(); app.flushSave(); });
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('stride_workbench_session_manifest_v26')));
  expect(stored.projectTitle).toBe('Title from tab A');
  expect(stored.scopeDefinition).not.toBe('Scope from tab B');
  // Reload in tab B loads tab A's version and saving works again.
  await other.click('#btn-other-tab-reload');
  await expect(other.locator('#alert-other-tab')).toBeHidden();
  expect(await other.evaluate(() => app.state.projectTitle)).toBe('Title from tab A');
  await other.evaluate(() => { app.state.scopeDefinition = 'Scope after reload'; app.saveSessionToLocalStorage(); app.flushSave(); });
  // Tabs run in separate processes: tab B's write reaches tab A's view of localStorage a moment later, so poll.
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('stride_workbench_session_manifest_v26'))))
    .toMatchObject({ projectTitle: 'Title from tab A', scopeDefinition: 'Scope after reload' });
});

test('A3c: a late storage event carrying the version this tab just loaded is not a new change', async ({ page, context }) => {
  // Tab A may write twice (start-up autosave, then an edit). Tab B shows the notice on the first event; if the second
  // event arrives after Reload, it carries exactly the version B loaded, and B must not treat it as a conflict.
  await H.openApp(page, { session: H.demoSession() });
  const other = await context.newPage();
  await other.goto('/threat-tiger.html?test=true');
  await other.waitForFunction(() => window.app && window.app.state && app.state.elements.length > 0);
  await page.evaluate(() => { app.state.projectTitle = 'Title from tab A'; app.saveSessionToLocalStorage(); app.flushSave(); });
  await expect(other.locator('#alert-other-tab')).toBeVisible();
  await other.click('#btn-other-tab-reload');
  await expect(other.locator('#alert-other-tab')).toBeHidden();
  await other.evaluate(() => {
    const key = 'stride_workbench_session_manifest_v26';
    window.dispatchEvent(new StorageEvent('storage', { key, newValue: localStorage.getItem(key), storageArea: localStorage }));
  });
  await expect(other.locator('#alert-other-tab')).toBeHidden();
  await other.evaluate(() => { app.state.scopeDefinition = 'Scope after reload'; app.saveSessionToLocalStorage(); app.flushSave(); });
  // Tabs run in separate processes: tab B's write reaches tab A's view of localStorage a moment later, so poll.
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('stride_workbench_session_manifest_v26'))))
    .toMatchObject({ projectTitle: 'Title from tab A', scopeDefinition: 'Scope after reload' });
});

test('A3d: a storage event with a version this tab has not seen still raises the notice', async ({ page }) => {
  await H.openApp(page, { session: H.demoSession() });
  await page.evaluate(() => {
    window.dispatchEvent(new StorageEvent('storage', { key: 'stride_workbench_session_manifest_v26', newValue: '{"projectTitle":"elsewhere"}', storageArea: localStorage }));
  });
  await expect(page.locator('#alert-other-tab')).toBeVisible();
});

test('A3b: "Keep this tab\'s version" saves this tab again', async ({ page, context }) => {
  await H.openApp(page, { session: H.demoSession() });
  const other = await context.newPage();
  await other.goto('/threat-tiger.html?test=true');
  await other.waitForFunction(() => window.app && window.app.state && app.state.elements.length > 0);
  await page.evaluate(() => { app.state.projectTitle = 'Title from tab A'; app.saveSessionToLocalStorage(); app.flushSave(); });
  await expect(other.locator('#alert-other-tab')).toBeVisible();
  await other.evaluate(() => { app.state.scopeDefinition = 'Scope from tab B'; app.saveSessionToLocalStorage(); });
  await other.click('#btn-other-tab-keep');
  await expect(other.locator('#alert-other-tab')).toBeHidden();
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('stride_workbench_session_manifest_v26')));
  expect(stored.scopeDefinition).toBe('Scope from tab B');
});

// ── #13 storage-full banner ─────────────────────────────────────────────────────
test('A13: the storage-full banner stays while the model itself is still unsaved', async ({ page }) => {
  await H.openApp(page, { session: sess([P('a', 'process', 'A', 0, 0)]) });
  const r = await page.evaluate(() => {
    const orig = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) { if (k === 'stride_workbench_session_manifest_v26') { const e = new Error('full'); e.name = 'QuotaExceededError'; throw e; } return orig.call(this, k, v); };
    app.state.projectTitle = 'changed'; app.saveSessionToLocalStorage(); app.flushSave();
    const shown1 = !document.getElementById('alert-storage-failure').classList.contains('d-none');
    app.safeSetItem('threat_tiger_template_tombstones', '[]');   // an unrelated small write succeeds
    const shown2 = !document.getElementById('alert-storage-failure').classList.contains('d-none');
    Storage.prototype.setItem = orig;
    app.saveSessionToLocalStorage(); app.flushSave();             // the model saves again
    const shown3 = !document.getElementById('alert-storage-failure').classList.contains('d-none');
    return { shown1, shown2, shown3 };
  });
  expect(r).toEqual({ shown1: true, shown2: true, shown3: false });
});

// ── #15 double-clicking Save ────────────────────────────────────────────────────
test('A15: double-clicking Save in the threat, mitigation and template dialogs adds one each', async ({ page }) => {
  await H.openApp(page, { session: sess([P('a', 'process', 'A', 100, 200)]) });
  await page.waitForFunction(() => (app.threatSuggestions.process || []).length > 10);
  await page.evaluate(() => app.openThreatModalForCreation());
  await expect(page.locator('#modal-edit-threat')).toBeVisible();
  await page.fill('#modal-threat-title', 'Dup check');
  await page.locator('#btn-modal-threat-save').dblclick();
  await expect(page.locator('#modal-edit-threat')).toBeHidden();
  await page.evaluate(() => app.openMitigationModal());
  await expect(page.locator('#modal-mitigation')).toBeVisible();
  await page.fill('#mitigation-input-title', 'Dup mit');
  await page.locator('#btn-mitigation-save').dblclick();
  await expect(page.locator('#modal-mitigation')).toBeHidden();
  await page.evaluate(() => app.openEditTemplateModal(null, 'process'));
  await expect(page.locator('#modal-edit-template')).toBeVisible();
  await page.fill('#modal-template-title', 'Dup template');
  await page.fill('#modal-template-desc', 'Dup description');
  await page.locator('#btn-modal-template-save').dblclick();
  await expect(page.locator('#modal-edit-template')).toBeHidden();
  const r = await page.evaluate(() => ({
    threats: app.state.threats.filter(t => t.title === 'Dup check').length,
    mits: (app.state.mitigations || []).filter(m => m.title === 'Dup mit').length,
    tpls: app.threatSuggestions.process.filter(t => t.title === 'Dup template').length,
  }));
  expect(r).toEqual({ threats: 1, mits: 1, tpls: 1 });
  // The dialogs still save normally when opened again.
  await page.evaluate(() => app.openThreatModalForCreation());
  await expect(page.locator('#modal-edit-threat')).toBeVisible();
  await page.fill('#modal-threat-title', 'Second');
  await page.click('#btn-modal-threat-save');
  await expect(page.locator('#modal-edit-threat')).toBeHidden();
  expect(await page.evaluate(() => app.state.threats.filter(t => t.title === 'Second').length)).toBe(1);
});

// ── #16 "Added N threats" toast Undo ────────────────────────────────────────────
test('A16: Undo on the "Added N threats" toast removes exactly those threats, once', async ({ page }) => {
  await H.openApp(page, { session: sess([P('a', 'process', 'Billing API', 100, 200)], [], [TH('th-001', 'Existing')]) });
  await page.waitForFunction(() => (app.threatSuggestions.process || []).length > 10);
  await page.evaluate(() => { app.resetUndoHistory(); app.state.projectTitle = 'Unrelated rename'; app.logEvent('CHANGE', 'rename'); });
  await page.evaluate(() => {
    const item = app.state.elements[0], tpl = app.threatSuggestions.process[0];
    app.addRuleThreats([{ rule: Object.assign({}, tpl), reason: 'x', title: 'Added one', added: false, dismissed: null, item }]);
    app.state.scopeDefinition = 'Later change'; app.logEvent('CHANGE', 'scope');
  });
  const btn = page.locator('#app-toast-container .toast', { hasText: 'Added 1 threat' }).getByRole('button', { name: 'Undo' });
  const h = await btn.elementHandle();
  await h.click();
  await h.evaluate((b) => b.click());   // a second click on the same toast button, even if it is closing
  const r = await page.evaluate(() => ({ title: app.state.projectTitle, scope: app.state.scopeDefinition, threats: app.state.threats.map(t => t.title) }));
  expect(r).toEqual({ title: 'Unrelated rename', scope: 'Later change', threats: ['Existing'] });
});

// ── #31 paste across models ─────────────────────────────────────────────────────
test('A31: pasted threats drop mitigation ids the model does not have', async ({ page }) => {
  await H.openApp(page, { session: sess([P('a', 'process', 'A', 0, 0)], [], [TH('th-001', 'T', { mitigationIds: ['M-001', 'M-002'] })],
    { mitigations: [{ id: 'M-001', title: 'm', status: 'Proposed', owner: '', ticketUrl: '' }, { id: 'M-002', title: 'n', status: 'Proposed', owner: '', ticketUrl: '' }] }) });
  const r = await page.evaluate(() => {
    app.state.selectedElementIds = ['a']; app.copySelection();
    app.state.mitigations = app.state.mitigations.filter(m => m.id === 'M-002');
    app.pasteSelection();
    return app.state.threats.filter(t => t.id !== 'th-001').map(t => t.mitigationIds);
  });
  expect(r).toEqual([['M-002']]);
});

test('A31b: a pasted shape keeps its page link only within the same model', async ({ page }) => {
  const pages = [{ id: 'p1', name: 'Page 1', offset: 0 }, { id: 'p2', name: 'Page 2', offset: 100000 }];
  const s = sess([P('a', 'process', 'A', 0, 0, { pageId: 'p1', linkedPageId: 'p2' })], [], [], { pages, activePageId: 'p1' });
  await H.openApp(page, { session: s });
  const r = await page.evaluate((other) => {
    app.state.selectedElementIds = ['a']; app.copySelection();
    app.pasteSelection();
    const same = app.state.elements.filter(e => e.id !== 'a').map(e => e.linkedPageId);
    // Load a different model that also has a page "p2", then paste.
    localStorage.setItem('stride_workbench_session_manifest_v26', JSON.stringify(other));
    app.loadSessionFromLocalStorage(); app.refreshAppViewVisualWorkspace();
    app.pasteSelection();
    const pasted = app.state.elements.filter(e => e.id !== 'b');
    return { same, other: pasted.map(e => e.linkedPageId === undefined ? null : e.linkedPageId) };
  }, sess([P('b', 'process', 'B', 0, 0, { pageId: 'p1' })], [], [], { pages, activePageId: 'p1' }));
  expect(r).toEqual({ same: ['p2'], other: [null] });
});

// ── #32 restore a deleted threat whose id was reused ───────────────────────────
test('A32: deleted-threat Undo restores the threat under a fresh id when its id was reused', async ({ page }) => {
  await H.openApp(page, { session: sess([P('a', 'process', 'A', 0, 0)], [], [TH('th-001', 'One'), TH('th-002', 'Two')]) });
  await page.evaluate(() => {
    app.deleteThreatWithUndo('th-002');
    const id = app.generateNextThreatId();
    app.state.threats.push({ id, title: 'New', category: 'Spoofing', elementId: 'a', status: 'Open / Unmitigated', likelihood: '3', impact: '3' });
  });
  await page.locator('#app-toast-container .toast', { hasText: 'Deleted threat th-002' }).getByRole('button', { name: 'Undo' }).click();
  const all = await page.evaluate(() => app.state.threats.map(t => `${t.id}:${t.title}`).sort());
  expect(all).toEqual(['th-001:One', 'th-002:New', 'th-003:Two']);
  await expect(page.locator('#app-toast-container .toast', { hasText: 'th-003' })).toBeVisible();
});

test('A32b: deleted-threat Undo does not restore twice', async ({ page }) => {
  await H.openApp(page, { session: sess([P('a', 'process', 'A', 0, 0)], [], [TH('th-001', 'One'), TH('th-002', 'Two')]) });
  await page.evaluate(() => app.deleteThreatWithUndo('th-002'));
  const btn = page.locator('#app-toast-container .toast', { hasText: 'Deleted threat th-002' }).getByRole('button', { name: 'Undo' });
  const h = await btn.elementHandle();
  await h.click();
  await h.evaluate((b) => b.click());   // a second click on the same toast button, even if it is closing
  expect(await page.evaluate(() => app.state.threats.map(t => t.title))).toEqual(['One', 'Two']);
});

// ── #33 element type whitelist ──────────────────────────────────────────────────
test('A33: unknown element types load as a process with a warning', async ({ page }) => {
  await H.openApp(page);
  const r = await page.evaluate(() => {
    const { session, warnings } = normalizeSession({ elements: [
      { id: 'x', type: 'constructor', name: 'W' }, { id: 'y', type: '__proto__', name: 'W2' }, { id: 'z', type: 'datastore', name: 'D' }, { id: 'f', type: 'fc_decision', name: 'F' }] });
    return { types: session.elements.map(e => e.type), warned: warnings.some(w => w.includes('constructor')) };
  });
  expect(r).toEqual({ types: ['process', 'process', 'datastore', 'fc_decision'], warned: true });
});

test('A33b: dropping arbitrary text on the canvas adds no shape; a palette type still does', async ({ page }) => {
  await H.openApp(page, { session: sess([P('p', 'process', 'Svc', 0, 0)]) });
  const r = await page.evaluate(() => {
    const drop = (text) => {
      const dt = new DataTransfer(); dt.setData('text/plain', text);
      const rect = app.dom.svg.getBoundingClientRect();
      app.dom.svg.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, clientX: rect.left + 300, clientY: rect.top + 300, bubbles: true, cancelable: true }));
      return app.state.elements.length;
    };
    const n0 = app.state.elements.length;
    return { text: drop('hello world') - n0, ctor: drop('constructor') - n0, ds: drop('datastore') - n0 };
  });
  expect(r).toEqual({ text: 0, ctor: 0, ds: 1 });
});

// ── #35 broken saved grid size ──────────────────────────────────────────────────
for (const bad of ['big', '7', '-20', '1e9']) {
  test(`A35: a saved grid size of "${bad}" falls back to 20 and new shapes get real coordinates`, async ({ page }) => {
    await H.openApp(page, { session: sess([P('a', 'process', 'A', 0, 0)]) });
    await page.evaluate((v) => localStorage.setItem('canvas_grid_size', v), bad);
    await reload(page);
    const r = await page.evaluate(() => {
      const id = app.instantiateNewCanvasElementNode('process', 333, 222);
      const el = app.state.elements.find(e => e.id === id) || app.state.elements[app.state.elements.length - 1];
      return { grid: app.gridSize, finite: Number.isFinite(el.x) && Number.isFinite(el.y) };
    });
    expect(r).toEqual({ grid: 20, finite: true });
  });
}

test('A35b: a valid saved grid size is kept', async ({ page }) => {
  await H.openApp(page, { session: sess([P('a', 'process', 'A', 0, 0)]) });
  await page.evaluate(() => localStorage.setItem('canvas_grid_size', '40'));
  await reload(page);
  expect(await page.evaluate(() => app.gridSize)).toBe(40);
});

// ── #43 impossible dates ────────────────────────────────────────────────────────
test('A43: diagram details reject impossible dates and keep real ones', async ({ page }) => {
  await H.openApp(page);
  const r = await page.evaluate(() => ['2026-99-99', '2026-02-30', '2026-13-01', '2026-00-10', '2024-02-29', '2026-11-17'].map(d => normalizeDiagramInfo({ date: d }).date));
  expect(r).toEqual(['', '', '', '', '2024-02-29', '2026-11-17']);
});

// ── #47 participants ────────────────────────────────────────────────────────────
test('A47: adding the operator to participants never splits or rewrites names', async ({ page }) => {
  await H.openApp(page, { session: sess([P('a', 'process', 'A', 0, 0)], [], [], { participants: 'Smith, John' }) });
  const r = await page.evaluate(() => {
    const run = (participants, op) => { app.state.participants = participants; app.addOperatorToParticipantsIfNeeded(op); return app.state.participants; };
    return [run('Smith, John', 'Smith, John'), run('Alice; Bob', 'Bob'), run('Alice; Bob', 'Carol'), run('', 'Smith, John'), run('Alice', 'smith, john'), run('Smith, John', 'john')];
  });
  expect(r).toEqual(['Smith, John', 'Alice; Bob', 'Alice; Bob, Carol', 'Smith, John', 'Alice, smith, john', 'Smith, John']);
});

test('A47b: reloading a model whose operator is "Smith, John" keeps the participants as they were', async ({ page }) => {
  await H.openApp(page, { session: sess([P('a', 'process', 'A', 0, 0)], [], [], { activeUser: 'Smith, John', participants: 'Smith, John' }) });
  await reload(page);
  expect(await page.evaluate(() => app.state.participants)).toBe('Smith, John');
});

// ── #48 page names after a delete ───────────────────────────────────────────────
test('A48: a new page never repeats an existing page name after a delete', async ({ page }) => {
  await H.openApp(page, { session: sess([P('a', 'process', 'A', 0, 0)]) });
  const names = await page.evaluate(() => {
    app.addPage(); app.addPage();
    const p2 = app.state.pages[1];
    app.state.pages = app.state.pages.filter(p => p.id !== p2.id);
    app.addPage();
    return app.state.pages.map(p => p.name);
  });
  expect(names).toEqual(['Page 1', 'Page 3', 'Page 2']);
});

test('A40: saving the threat dialog while it is still fading in closes it once it has opened', async ({ page }) => {
  await H.openApp(page, { session: H.demoSession() });
  // Open and save in the same tick: the dialog is mid fade-in, when Bootstrap ignores hide().
  const state = await page.evaluate(() => new Promise((resolve) => {
    const el = document.getElementById('modal-edit-threat');
    let shown = false; el.addEventListener('shown.bs.modal', () => { shown = true; }, { once: true });
    app.openThreatModalForCreation();
    const tick = () => {
      if (!el.classList.contains('show')) return requestAnimationFrame(tick);   // fading in: visible, not yet "shown"
      document.getElementById('modal-threat-title').value = 'Saved during fade-in';
      app.commitThreatModalFormEditorData();
      resolve({ shownBeforeSave: shown });
    };
    tick();
  }));
  expect(state.shownBeforeSave).toBe(false);   // the save really happened mid fade-in
  await expect(page.locator('#modal-edit-threat')).toBeHidden();
  expect(await page.evaluate(() => app.state.threats.filter(t => t.title === 'Saved during fade-in').length)).toBe(1);
});
