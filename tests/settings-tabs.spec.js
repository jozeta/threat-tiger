// Settings is split into tabs: Visuals (title block & legend), Profiles, Live status, Sync (git).
const { test } = require('@playwright/test');
const { expect, openApp, demoSession, clickControl } = require('./helpers');

const TABS = ['visuals', 'profiles', 'live', 'sync'];
const visibleTab = (page) => page.evaluate(() => document.querySelector('#modal-settings .tab-pane.active').id.replace('settings-pane-', ''));

test('Settings has four tabs, each holding its own section; ☰ → Settings opens Visuals', async ({ page }) => {
  await openApp(page, { session: demoSession() });
  await clickControl(page, '#btn-settings');
  await expect(page.locator('#modal-settings')).toBeVisible();
  await expect(page.locator('#settings-tabs [role="tab"]')).toHaveText(['Visuals', 'Profiles', 'Live status', 'Sync']);
  expect(await visibleTab(page)).toBe('visuals');
  const where = { 'btn-settings-legend': 'visuals', 'settings-profiles': 'profiles', 'settings-live': 'live', 'git-repo': 'sync', 'btn-git-connect': 'sync', 'btn-git-forget': 'sync', 'btn-git-remove': 'sync' };
  for (const [id, tab] of Object.entries(where)) expect(await page.evaluate((i) => document.getElementById(i).closest('.tab-pane').id, id)).toBe(`settings-pane-${tab}`);
  await expect(page.locator('#git-repo')).toBeHidden();
  await page.click('#settings-tab-sync');
  await expect(page.locator('#git-repo')).toBeVisible();
  await expect(page.locator('#btn-settings-legend')).toBeHidden();
  await expect(page.locator('#settings-tab-sync')).toHaveAttribute('aria-selected', 'true');
});

test('opening Settings for a purpose shows the right tab', async ({ page }) => {
  await openApp(page, { session: demoSession() });
  const openWith = async (fn, tab) => {
    await page.evaluate(fn);
    await expect(page.locator('#modal-settings')).toBeVisible();
    await expect.poll(() => visibleTab(page)).toBe(tab);
    await page.click('#modal-settings .modal-footer [data-bs-dismiss="modal"]');
    await expect(page.locator('#modal-settings')).toBeHidden();
  };
  await openWith(() => app.openGitSettings('x'), 'sync');
  await openWith(() => app.openLiveSettings(), 'live');
  await openWith(() => app.openProfileEditor(), 'profiles');
  await openWith(() => app.openSettings('visuals'), 'visuals');
  expect(TABS).toHaveLength(4);
});

test('the tabs fit a phone screen without sideways scrolling of the page', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 740 });
  await openApp(page, { session: demoSession() });
  await clickControl(page, '#btn-settings');
  await expect(page.locator('#modal-settings')).toBeVisible();
  const heights = await page.evaluate(() => [...document.querySelectorAll('#settings-tabs [role="tab"]')].map((b) => Math.round(b.getBoundingClientRect().height)));
  expect(heights.every((h) => h >= 44), `tab heights ${heights}`).toBe(true);
  // measured once the open animation has settled
  await expect.poll(() => page.evaluate(() => `${document.documentElement.scrollWidth}/${window.innerWidth}`)).toBe('375/375');
});
