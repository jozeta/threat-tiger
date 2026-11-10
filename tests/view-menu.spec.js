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

test('View → panel tabs hides a tab; hiding the active one switches to the next; it is remembered', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await openApp(page, { session: demoSession() });
  await openView(page);
  const item = page.locator('#btn-menu-tab-tab-props-trigger');
  await expect(item).toHaveAttribute('aria-checked', 'true');
  await item.click();
  await expect(page.locator('#tab-props-trigger')).toBeHidden();
  await expect(page.locator('#tab-suggest-trigger')).toHaveClass(/active/);
  await page.reload();
  await expect(page.locator('#tab-props-trigger')).toBeHidden();
  await openView(page);
  await page.locator('#btn-menu-tab-tab-props-trigger').click();
  await expect(page.locator('#tab-props-trigger')).toBeVisible();
});

// ── Deferred minors (1.15.1) ──
test('hiding every tab of a panel hides its content too; showing one tab brings it back', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await openApp(page, { session: demoSession() });
  await page.evaluate(() => ['tab-props-trigger', 'tab-suggest-trigger', 'tab-layers-trigger'].forEach((id) => app.setTabVisible(id, false)));
  for (const pane of ['#tab-panel-props', '#tab-panel-suggest', '#tab-panel-layers']) await expect(page.locator(pane)).toBeHidden();
  await page.evaluate(() => app.setTabVisible('tab-layers-trigger', true));
  await expect(page.locator('#tab-panel-layers')).toBeVisible();
  await expect(page.locator('#tab-layers-trigger')).toHaveClass(/active/);
});
