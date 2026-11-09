// ☰ menu → View: a sub-menu with the minimap, line jumps and a switch per panel.
const { test } = require('@playwright/test');
const { expect, openApp, demoSession } = require('./helpers');

async function openView(page) {
  await page.click('#btn-main-menu');
  await page.click('#btn-menu-view');
}

test('View opens in place with its switches and keeps the menu open', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await openApp(page, { session: demoSession() });
  await page.click('#btn-main-menu');
  await expect(page.locator('#btn-menu-minimap')).toBeHidden();
  await page.click('#btn-menu-view');
  await expect(page.locator('#btn-menu-view')).toHaveAttribute('aria-expanded', 'true');
  for (const id of ['#btn-menu-minimap', '#btn-menu-line-jumps', '#btn-menu-panel-left', '#btn-menu-panel-right', '#btn-menu-panel-bottom']) {
    await expect(page.locator(id)).toBeVisible();
  }
});

for (const [side, sel] of [['left', '.sidebar-left'], ['right', '.sidebar-right'], ['bottom', '.bottom-panel']]) {
  test(`View → ${side} panel hides and shows it, in step with the panel's own handle`, async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 1000 });
    await openApp(page, { session: demoSession() });
    await openView(page);
    const item = page.locator(`#btn-menu-panel-${side}`);
    await expect(item).toHaveAttribute('aria-checked', 'true');
    await item.click();
    await expect(page.locator(sel)).toBeHidden();
    await expect(item).toHaveAttribute('aria-checked', 'false');      // the menu stays open
    await item.click();
    await expect(page.locator(sel)).toBeVisible();
    await page.keyboard.press('Escape');
    await page.click(`#handle-${side}`);
    await openView(page);
    await expect(item).toHaveAttribute('aria-checked', 'false');
  });
}
