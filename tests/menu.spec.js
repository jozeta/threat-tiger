// ☰ menu: sub-menus open as flyout windows beside the menu (left or right, whichever fits), like a desktop menu.
const { test } = require('@playwright/test');
const { expect, openApp, demoSession } = require('./helpers');

const box = (page, sel) => page.locator(sel).boundingBox();
/** Every item of an open flyout is really on top where it is drawn (not clipped or covered). */
const reachable = (page, menuSel) => page.evaluate((sel) => [...document.querySelectorAll(`${sel} > li > .dropdown-item`)].every((el) => {
  const r = el.getBoundingClientRect(), hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
  return hit && (hit === el || el.contains(hit));
}), menuSel);

async function open(page, width = 1600) {
  await page.setViewportSize({ width, height: 1000 });
  await openApp(page, { session: demoSession() });
  await page.click('#btn-main-menu');
}

test('View opens a flyout beside the menu instead of expanding inside it', async ({ page }) => {
  await open(page);
  const before = await box(page, '.dropdown-menu[aria-labelledby="btn-main-menu"]');
  await page.click('#btn-menu-view');
  await expect(page.locator('#menu-view-items')).toBeVisible();
  await expect(page.locator('#btn-menu-view')).toHaveAttribute('aria-expanded', 'true');
  const menu = await box(page, '.dropdown-menu[aria-labelledby="btn-main-menu"]');
  const fly = await box(page, '#menu-view-items');
  expect(menu.height).toBe(before.height);                 // the main menu does not grow
  expect(fly.x + fly.width).toBeLessThanOrEqual(menu.x + 2); // no room on the right (menu is at the edge): opens to the left
  expect(fly.x).toBeGreaterThanOrEqual(0);
  // The trigger shows it leads to a sub-menu.
  await expect(page.locator('#btn-menu-view')).toHaveAttribute('aria-haspopup', 'true');
});

test('Icon sets and Panel tabs are their own flyouts; opening one closes the other', async ({ page }) => {
  await open(page);
  await page.click('#btn-menu-view');
  await expect(page.locator('#btn-menu-stencil-aws')).toBeHidden();
  await expect(page.locator('#btn-menu-tab-tab-props-trigger')).toBeHidden();
  await page.click('#btn-menu-icon-sets');
  await expect(page.locator('#menu-icon-sets')).toBeVisible();
  await expect(page.locator('#btn-menu-stencil-aws')).toBeVisible();
  expect(await reachable(page, '#menu-icon-sets')).toBe(true);
  const view = await box(page, '#menu-view-items'), sets = await box(page, '#menu-icon-sets');
  expect(sets.x + sets.width).toBeLessThanOrEqual(view.x + 2);
  await page.click('#btn-menu-panel-tabs');
  await expect(page.locator('#menu-panel-tabs')).toBeVisible();
  expect(await reachable(page, '#menu-panel-tabs')).toBe(true);
  expect(await reachable(page, '#menu-view-items')).toBe(true);
  await expect(page.locator('#menu-icon-sets')).toBeHidden();
  // Toggling an item keeps every level open.
  await page.click('#btn-menu-tab-tab-layers-trigger');
  await expect(page.locator('#btn-menu-tab-tab-layers-trigger')).toHaveAttribute('aria-checked', 'false');
  await expect(page.locator('#menu-panel-tabs')).toBeVisible();
  await expect(page.locator('#menu-view-items')).toBeVisible();
});

test('hovering opens a flyout; hovering another item closes it', async ({ page }) => {
  await open(page);
  await page.hover('#btn-menu-view');
  await expect(page.locator('#menu-view-items')).toBeVisible();
  await page.hover('#btn-menu-icon-sets');
  await expect(page.locator('#menu-icon-sets')).toBeVisible();
  await page.hover('#btn-menu-minimap');
  await expect(page.locator('#menu-icon-sets')).toBeHidden();
  await expect(page.locator('#menu-view-items')).toBeVisible();
  await page.hover('#btn-help-trigger');
  await expect(page.locator('#menu-view-items')).toBeHidden();
});

test('keyboard: Right opens and enters a flyout, Up/Down stay inside it, Left and Escape close one level', async ({ page }) => {
  await open(page);
  await page.locator('#btn-menu-view').focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#menu-view-items')).toBeVisible();
  await expect(page.locator('#btn-menu-review-mode')).toBeFocused();
  await page.keyboard.press('ArrowUp');                     // wraps to the last item of this flyout
  await expect(page.locator('#btn-menu-panel-tabs')).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#btn-menu-tab-tab-props-trigger')).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('#btn-menu-tab-tab-suggest-trigger')).toBeFocused();
  await page.keyboard.press('Escape');                      // closes Panel tabs only
  await expect(page.locator('#menu-panel-tabs')).toBeHidden();
  await expect(page.locator('#btn-menu-panel-tabs')).toBeFocused();
  await page.keyboard.press('ArrowLeft');                   // closes View
  await expect(page.locator('#menu-view-items')).toBeHidden();
  await expect(page.locator('#btn-menu-view')).toBeFocused();
  await expect(page.locator('.dropdown-menu[aria-labelledby="btn-main-menu"]')).toBeVisible();
  await page.keyboard.press('Enter');                       // Enter opens too
  await expect(page.locator('#menu-view-items')).toBeVisible();
});

test('closing the menu closes every flyout; they reopen closed', async ({ page }) => {
  await open(page);
  await page.click('#btn-menu-view');
  await page.click('#btn-menu-icon-sets');
  await page.keyboard.press('Escape'); await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
  await expect(page.locator('.dropdown-menu[aria-labelledby="btn-main-menu"]')).toBeHidden();
  await page.click('#btn-main-menu');
  await expect(page.locator('#menu-view-items')).toBeHidden();
  await expect(page.locator('#menu-icon-sets')).toBeHidden();
  await expect(page.locator('#btn-menu-view')).toHaveAttribute('aria-expanded', 'false');
});

for (const h of [1000, 667]) test(`on a ${h} px tall phone the flyouts stay on screen and never cover their own trigger`, async ({ page }) => {
  await page.setViewportSize({ width: 375, height: h });
  await openApp(page, { session: demoSession() });
  await page.click('#btn-main-menu');
  await page.click('#btn-menu-view');
  await page.click('#btn-menu-icon-sets');
  for (const sel of ['#menu-view-items', '#menu-icon-sets']) {
    const b = await box(page, sel);
    expect(b.x).toBeGreaterThanOrEqual(0);
    expect(b.x + b.width).toBeLessThanOrEqual(375);
    expect(b.y + b.height).toBeLessThanOrEqual(h);
  }
  for (const [trigger, sub] of [['#btn-menu-view', '#menu-view-items'], ['#btn-menu-icon-sets', '#menu-icon-sets']]) {
    const t = await box(page, trigger), b = await box(page, sub);
    expect(t.y + t.height <= b.y + 1 || b.y + b.height <= t.y + 1).toBe(true);
  }
  await page.click('#btn-menu-stencil-k8s');
  await expect(page.locator('#btn-menu-stencil-k8s')).toHaveAttribute('aria-checked', 'false');
});

test('a flyout opens to the right when there is room there', async ({ page }) => {
  await open(page);
  // Move the menu to the left edge, as it would be in a left-aligned layout.
  await page.evaluate(() => { const m = document.querySelector('.dropdown-menu[aria-labelledby="btn-main-menu"]'); m.style.setProperty('position', 'fixed', 'important'); m.style.setProperty('inset', '60px auto auto 10px', 'important'); m.style.setProperty('transform', 'none', 'important'); });
  await page.click('#btn-menu-view');
  const menu = await box(page, '.dropdown-menu[aria-labelledby="btn-main-menu"]'), fly = await box(page, '#menu-view-items');
  expect(fly.x).toBeGreaterThanOrEqual(menu.x + menu.width - 2);
});
