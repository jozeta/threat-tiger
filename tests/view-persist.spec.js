// The canvas zoom and position (and each page's view) are remembered between reloads.
const { test } = require('@playwright/test');
const { expect, openApp, demoSession } = require('./helpers');

test('zoom and pan survive a reload', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await openApp(page, { session: demoSession() });
  await page.evaluate(() => { app.zoomScale = 1.7; app.panX = 123; app.panY = -45; app.applySvgViewportTransformations(); });
  await page.waitForTimeout(500);
  await page.reload();
  await page.waitForFunction(() => window.app);
  const v = await page.evaluate(() => [app.zoomScale, app.panX, app.panY, app.dom.transformGroup.getAttribute('transform')]);
  expect(v.slice(0, 3)).toEqual([1.7, 123, -45]);
  expect(v[3]).toBe('translate(123, -45) scale(1.7)');
  await expect(page.locator('#lbl-canvas-zoom')).toHaveText('170%');
});

test('a broken saved view is ignored', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await openApp(page, { session: demoSession() });
  await page.evaluate(() => localStorage.setItem('canvas_view', JSON.stringify({ zoom: 'x', panX: 1e400, panY: null })));
  await page.reload();
  await page.waitForFunction(() => window.app);
  const v = await page.evaluate(() => [app.zoomScale, app.panX, app.panY].every(Number.isFinite));
  expect(v).toBe(true);
});
