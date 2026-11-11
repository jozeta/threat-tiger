// Coverage: a no-errors pass over every panel and dialog, and accessibility basics of every dialog
// (focus moves in, the dialog has a name, Escape closes it, focus returns to where it was).
const { test } = require('@playwright/test');
const C = require('./cov-helpers');
const { expect } = C;

const firstProcess = (page) => page.evaluate(() => { const e = app.state.elements.find((x) => x.type === 'process'); app.state.selectedElementIds = [e.id]; app.state.selectedFlowId = null; app.refreshAppViewVisualWorkspace(); return e.id; });

/** Every dialog, how a user opens it, and the control that should get focus back when it closes. */
const DIALOGS = [
  { id: 'modal-help', open: (p) => C.clickControl(p, '#btn-help-trigger'), back: '#btn-main-menu' },
  { id: 'modal-session-context', open: (p) => p.click('#btn-open-session-meta'), back: '#btn-open-session-meta' },
  { id: 'modal-edit-threat', open: async (p) => { await p.click('#tab-register-trigger'); await p.click('#btn-register-add-custom'); }, back: '#btn-register-add-custom' },
  { id: 'modal-edit-template', open: async (p) => { await firstProcess(p); await p.click('#tab-suggest-trigger'); await p.click('#btn-add-template'); }, back: '#btn-add-template' },
  { id: 'modal-mitigation', open: async (p) => { await p.click('#tab-mitigations-trigger'); await p.click('#btn-mitigation-new'); }, back: '#btn-mitigation-new' },
  { id: 'modal-mermaid-import', open: (p) => C.clickControl(p, '#btn-import-mermaid'), back: '#btn-main-menu' },
  { id: 'modal-operator', open: (p) => p.click('#lbl-active-operator'), back: '#lbl-active-operator' },
  { id: 'modal-snapshots', open: (p) => C.clickControl(p, '#btn-snapshots'), back: '#btn-main-menu' },
  { id: 'modal-confirm-delete', open: (p) => C.clickControl(p, '#btn-reset-session'), back: '#btn-main-menu' },
  { id: 'modal-dismiss-suggestion', open: async (p) => { await firstProcess(p); await p.click('#tab-suggest-trigger'); await p.locator('.template-card .btn-dismiss-suggestion').first().click(); }, back: null },
];

test('no page or console errors while opening every panel tab and every dialog on the demo model', async ({ page }) => {
  const errors = C.trackAllErrors(page);
  await C.openApp(page, { session: C.demoSession() });
  for (const tab of ['#tab-suggest-trigger', '#tab-layers-trigger', '#tab-props-trigger', '#tab-register-trigger', '#tab-mitigations-trigger', '#tab-insights-trigger', '#tab-notes-trigger']) {
    await page.click(tab);
    const pane = await page.locator(tab).getAttribute('data-bs-target');
    await expect(page.locator(pane)).toBeVisible();
    expect((await page.locator(pane).innerText()).trim().length, pane).toBeGreaterThan(10);
  }
  await firstProcess(page);
  for (const tab of ['#tab-props-trigger', '#tab-suggest-trigger']) {
    await page.click(tab);
    expect((await page.locator(await page.locator(tab).getAttribute('data-bs-target')).innerText()).length).toBeGreaterThan(100);
  }
  for (const d of DIALOGS) {
    await d.open(page);
    await expect(page.locator('#' + d.id), d.id).toBeVisible();
    await page.locator(`#${d.id} [data-bs-dismiss="modal"]`).first().click();
    await expect(page.locator('#' + d.id), d.id).toBeHidden();
    await C.noModal(page);
  }
  // Each view mode and the dark canvas render without errors too.
  for (const m of ['ne-isometric', 'nw-isometric', 'flat']) await page.evaluate((v) => app.setViewMode(v), m);
  await page.click('#btn-canvas-theme'); await page.click('#btn-canvas-theme');
  expect(errors).toEqual([]);
});

const dialogInfo = (page, id) => page.evaluate((i) => {
  const m = document.getElementById(i);
  const by = m.getAttribute('aria-labelledby');
  const name = (m.getAttribute('aria-label') || (by && document.getElementById(by) ? document.getElementById(by).textContent : '')).trim();
  return { role: m.getAttribute('role'), modal: m.getAttribute('aria-modal'), name, closeLabelled: [...m.querySelectorAll('.btn-close')].every((b) => b.getAttribute('aria-label')) };
}, id);

for (const d of DIALOGS) {
  test(`dialog ${d.id}: focus moves into it, it is a labelled modal dialog, Tab stays inside, Escape closes it`, async ({ page }) => {
    const errors = C.trackAllErrors(page);
    await C.openApp(page, { session: C.demoSession() });
    await d.open(page);
    await C.modalReady(page, d.id);   // focus is inside the dialog once it is shown
    const info = await dialogInfo(page, d.id);
    expect(info).toMatchObject({ role: 'dialog', modal: 'true', closeLabelled: true });
    // Focus is trapped: 20 Tabs never land on a page control behind the dialog (focus may pass through the
    // browser's own UI, where activeElement is <body>, before it wraps back in).
    let inside = 0;
    for (let i = 0; i < 20; i++) {
      await page.keyboard.press('Tab');
      const where = await page.evaluate((id) => { const e = document.activeElement; return !e || e === document.body ? 'none' : document.getElementById(id).contains(e) ? 'in' : 'out:' + (e.id || e.className); }, d.id);
      expect(where).not.toMatch(/^out/);
      if (where === 'in') inside++;
    }
    expect(inside).toBeGreaterThanOrEqual(10);
    await page.locator(`#${d.id} .btn-close`).first().focus();
    await page.keyboard.press('Escape');
    await expect(page.locator('#' + d.id)).toBeHidden();
    await C.noModal(page);
    expect(errors).toEqual([]);
  });
}

test('every dialog has an accessible name', async ({ page }) => {
  // BUG: #modal-edit-threat, #modal-edit-template and #modal-session-context have no aria-labelledby or aria-label
  // (threat-tiger.html markup), so screen readers announce them only as "dialog". The other seven dialogs are labelled.
  test.fail();
  await C.openApp(page, { session: C.demoSession() });
  const unnamed = [];
  for (const d of DIALOGS) if (!(await dialogInfo(page, d.id)).name) unnamed.push(d.id);
  expect(unnamed).toEqual([]);
});

test('closing a dialog returns keyboard focus to the control that opened it', async ({ page }) => {
  // BUG: the app opens every dialog with bootstrap.Modal#show() from its own click handlers, and Bootstrap only restores
  // focus for data-bs-toggle triggers, so after Escape/Close focus falls to <body> (WCAG 2.4.3). Keyboard users must
  // Tab from the top of the page again. Checked here for dialogs whose opener stays visible.
  test.fail();
  await C.openApp(page, { session: C.demoSession() });
  const lost = [];
  for (const d of DIALOGS.filter((x) => x.back && x.back !== '#btn-main-menu')) {
    await d.open(page);
    await C.modalReady(page, d.id);
    await page.keyboard.press('Escape');
    await C.noModal(page);
    const ok = await page.waitForFunction((sel) => document.activeElement === document.querySelector(sel), d.back, { timeout: 1000 }).then(() => true, () => false);
    if (!ok) lost.push(d.id);
  }
  expect(lost).toEqual([]);
});
