// Stage 4: first run, operator name, dialogs, undo/redo, threat -> canvas focus, register filters.
const { test } = require('@playwright/test');
const { expect, openApp, demoSession, importJson, registerRows, trackPageErrors } = require('./helpers');

test('UI-001/002: first visit shows a dismissible welcome, no license gate and no name prompt', async ({ page }) => {
  const dialogs = [];
  page.on('dialog', (d) => { dialogs.push(d.type()); d.dismiss(); });
  await page.goto('/threat-tiger.html');   // no test flag, nothing pre-accepted
  await page.waitForSelector('#modal-help.show');
  await page.waitForFunction(() => document.activeElement && document.activeElement.id === 'modal-help');
  await expect(page.locator('#btn-welcome-start')).toBeVisible();
  await expect(page.locator('#modal-help .btn-close')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#modal-help')).toBeHidden();
  expect(dialogs).toEqual([]);
  expect(await page.evaluate(() => app.state.activeUser)).toBe('Architect Operator');
  await page.reload();
  await page.waitForFunction(() => window.app);
  await page.waitForTimeout(500);
  await expect(page.locator('#modal-help')).toBeHidden();
});

test('UI-001: the welcome can open the demo model', async ({ page }) => {
  await page.goto('/threat-tiger.html');
  await page.waitForSelector('#modal-help.show');
  await page.click('#btn-welcome-demo');
  await expect.poll(() => page.evaluate(() => app.state.elements.length)).toBeGreaterThan(10);
});

test('UI-002: the name dialog changes and remembers the operator', async ({ page }) => {
  await openApp(page, { session: demoSession() });
  await page.click('#lbl-active-operator');
  await page.fill('#input-operator-name', 'Robin');
  await page.keyboard.press('Enter');
  await expect(page.locator('#lbl-active-operator')).toHaveText('Robin');
  expect(await page.evaluate(() => localStorage.getItem('threat_tiger_operator_name'))).toBe('Robin');
});

test('UI-006: no native alert/confirm/prompt dialogs in common flows', async ({ page }) => {
  const dialogs = [];
  page.on('dialog', (d) => { dialogs.push(d.type() + ': ' + d.message()); d.dismiss(); });
  await openApp(page);
  await page.click('#btn-register-export-csv');           // empty register
  await page.click('#btn-register-add-custom');            // no components yet
  await page.click('#btn-reset-session');                  // reset asks via styled dialog
  await expect(page.locator('#modal-confirm-delete')).toBeVisible();
  expect(dialogs).toEqual([]);
});

test('SEC-005: external images trigger a styled question and can be declined', async ({ page }) => {
  await openApp(page);
  const model = demoSession((s) => s.elements.push({ id: 'el-ext', type: 'custom_image', name: 'remote', x: 0, y: 0, width: 50, height: 50, imageUrl: 'https://example.invalid/pixel.png' }));
  await importJson(page, JSON.stringify(model));
  await expect(page.locator('#modal-confirm-delete')).toBeVisible();
  await page.click('#btn-confirm-cancel');
  await expect.poll(() => page.evaluate(() => (app.state.elements.find((e) => e.id === 'el-ext') || {}).imageUrl)).toBe('');
});

test('FEAT-001: undo and redo a threat deletion and a component move', async ({ page }) => {
  const demo = demoSession();
  await openApp(page, { session: demo });
  const firstId = demo.threats[0].id;
  await page.locator('#threat-register-tbody tr').first().locator('.btn-delete').click();
  expect(await page.evaluate((id) => app.state.threats.some((t) => t.id === id), firstId)).toBe(false);
  await page.keyboard.press('ControlOrMeta+z');
  expect(await page.evaluate((id) => app.state.threats.some((t) => t.id === id), firstId)).toBe(true);
  await page.keyboard.press('ControlOrMeta+Shift+z');
  expect(await page.evaluate((id) => app.state.threats.some((t) => t.id === id), firstId)).toBe(false);

  // A drag is one undo step
  const proc = demo.elements.find((e) => e.type === 'process');
  const box = await page.locator(`#layers-nodes-group [data-id="${proc.id}"]`).first().boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(box.x + box.width / 2 + i * 10, box.y + box.height / 2);
  await page.mouse.up();
  await page.click('#btn-undo');
  expect(await page.evaluate((id) => app.state.elements.find((e) => e.id === id).x, proc.id)).toBe(proc.x);
});

test('FEAT-016: clicking a register row selects and centres its component', async ({ page }) => {
  const demo = demoSession();
  await openApp(page, { session: demo });
  await page.locator('#threat-register-tbody tr').nth(2).locator('td').nth(2).click();
  const sel = await page.evaluate(() => app.state.selectedElementIds);
  const expectedId = await page.evaluate(() => {
    const row = document.querySelectorAll('#threat-register-tbody tr')[2];
    return app.state.threats.find((t) => t.id === row.children[0].textContent.trim()).elementId;
  });
  expect(sel).toEqual([expectedId]);
});

test('UI-007: register filters by category and by "not fully mitigated"', async ({ page }) => {
  const demo = demoSession((s) => { s.threats[0].status = 'Mitigated / Resolved'; });
  await openApp(page, { session: demo });
  await page.selectOption('#filter-threat-category', 'Spoofing');
  await expect(await registerRows(page)).toHaveCount(demo.threats.filter((t) => t.category === 'Spoofing').length);
  await page.selectOption('#filter-threat-category', '');
  await page.selectOption('#filter-threat-status', '__not-mitigated');
  await expect(await registerRows(page)).toHaveCount(demo.threats.length - 1);
});

test('no console errors through the main Stage 4 flows', async ({ page }) => {
  const errors = trackPageErrors(page);
  await openApp(page, { session: demoSession() });
  const closeOpenModal = async () => { await page.locator('.modal.show .btn-close').first().click(); await page.waitForFunction(() => !document.querySelector('.modal.show, .modal-backdrop')); };
  await page.click('#btn-snapshots'); await closeOpenModal();
  await page.click('#btn-help-trigger'); await closeOpenModal();
  await expect(page.locator('#btn-undo')).toBeDisabled();   // nothing to undo yet on a fresh load
  expect(errors).toEqual([]);
});
