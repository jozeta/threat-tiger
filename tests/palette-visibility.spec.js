// Settings → Profiles: hide palette sections, icon sets and icon-picker groups in the active view profile (a view setting in this browser).
const { test } = require('@playwright/test');
const H = require('./helpers');
const { expect } = H;

// What the active view profile hides, as stored in localStorage.
const activeHidden = (page, key) => page.evaluate((k) => {
  const all = JSON.parse(localStorage.getItem('view_profiles')), id = localStorage.getItem('active_view_profile');
  return all.profiles.find(p => p.id === id).hidden[k];
}, key);

const openSettings = async (page) => {
  await H.openSettingsTab(page, 'profiles');
  await expect(page.locator('#modal-settings')).toBeVisible();
};

test('every palette section, icon set and icon-picker group has a switch in Settings', async ({ page }) => {
  await H.openApp(page);
  await openSettings(page);
  const ids = await page.evaluate(() => ({
    groups: [...document.querySelectorAll('#settings-palette-groups input')].map(i => i.dataset.paletteGroup),
    sets: [...document.querySelectorAll('#settings-stencil-sets input')].map(i => i.dataset.settingsStencil),
    icons: [...document.querySelectorAll('#settings-icon-groups input')].map(i => i.dataset.iconGroup),
  }));
  expect(ids.groups).toEqual(await page.evaluate(() => PALETTE_GROUPS.map(g => g[0])));
  expect(ids.sets).toEqual(await page.evaluate(() => STENCIL_SETS.map(g => g[0])));
  expect(ids.icons).toEqual(await page.evaluate(() => Object.keys(ICON_LIBRARY)));
  // every group listed in Settings exists in the palette
  for (const g of ids.groups) await expect(page.locator(`#paletteAccordion [data-palette-group="${g}"]`).first()).toHaveCount(1);
});

test('hiding a palette section hides it at once and after a reload; showing it brings it back', async ({ page }) => {
  await H.openApp(page);
  await openSettings(page);
  const sw = page.locator('#settings-palette-groups input[data-palette-group="flowchart"]');
  await expect(sw).toBeChecked();
  await sw.uncheck();
  await expect(page.locator('[data-palette-group="flowchart"]').first()).toBeHidden();
  await page.reload(); await page.waitForFunction(() => window.app && window.app.state);
  await expect(page.locator('[data-palette-group="flowchart"]').first()).toBeHidden();
  await openSettings(page);
  await expect(sw).not.toBeChecked();
  await sw.check();
  await expect(page.locator('[data-palette-group="flowchart"]').first()).toBeAttached();
  expect(await page.locator('[data-palette-group="flowchart"]').first().evaluate(e => e.classList.contains('d-none'))).toBe(false);
});

test('the icon-set switch in Settings and the View menu stay in step', async ({ page }) => {
  await H.openApp(page);
  await openSettings(page);
  await page.locator('#settings-stencil-sets input[data-settings-stencil="aws"]').uncheck();
  expect(await page.locator('[data-stencil-set="aws"].stencil-set').evaluate(e => e.classList.contains('d-none'))).toBe(true);
  await expect(page.locator('#btn-menu-stencil-aws')).toHaveAttribute('aria-checked', 'false');
  expect(await activeHidden(page, 'stencils')).toEqual(['aws']);
});

test('a hidden icon group is left out of the icon picker, but a shape keeps its current icon', async ({ page }) => {
  await H.openApp(page, { session: { projectTitle: 'T', activeUser: 'Tester', flows: [], threats: [],
    elements: [{ id: 'n1', type: 'infrastructure', name: 'DB', x: 100, y: 100, icon: 'bi-database', secProps: {} }] } });
  await openSettings(page);
  await page.locator('#settings-icon-groups input[data-icon-group="Databases & storage"]').uncheck();
  await page.keyboard.press('Escape');
  await expect(page.locator('#modal-settings')).toBeHidden();
  expect(await activeHidden(page, 'icons')).toEqual(['Databases & storage']);
  await page.evaluate(() => app.handleElementSelectionEvent('n1'));
  const pick = await page.evaluate(() => {
    const sel = document.getElementById('props-input-icon');
    return { groups: [...sel.querySelectorAll('optgroup')].map(g => g.label), values: [...sel.options].map(o => o.value), value: sel.value };
  });
  expect(pick.groups).not.toContain('Databases & storage');
  expect(pick.values).not.toContain('bi-bucket');     // only in the hidden group
  expect(pick.values).toContain('bi-hdd-rack');       // a visible group still offers its icons
  expect(pick.value).toBe('bi-database');             // the shape's own icon is still selected
  expect(await page.evaluate(() => app.state.elements[0].icon)).toBe('bi-database');
});

test('Clear all data forgets the hidden palette settings', async ({ page }) => {
  await H.openApp(page);
  await page.evaluate(() => { localStorage.setItem('hidden_palette_groups', '["flowchart"]'); localStorage.setItem('hidden_icon_groups', '["Web & network"]'); });
  const keys = await page.evaluate(() => document.querySelector('script:not([src]):not([type])').textContent.match(/const prefs = \[[^\]]*\]/)[0]);
  expect(keys).toContain('hidden_palette_groups');
  expect(keys).toContain('hidden_icon_groups');
});
