// UI-003 / UI-008 / TEST-007: keyboard operation, accessible names, responsive layout.
const { test } = require('@playwright/test');
const { expect, openApp, demoSession } = require('./helpers');

test('keyboard: Tab reaches canvas items; Enter selects; arrows move; Escape deselects; focus survives re-renders', async ({ page }) => {
  const demo = demoSession();
  await openApp(page, { session: demo });
  const first = page.locator('#layers-nodes-group g[data-id][tabindex="0"]').first();
  const id = await first.getAttribute('data-id');
  await first.focus();
  await page.keyboard.press('Enter');
  expect(await page.evaluate(() => app.state.selectedElementIds)).toEqual([id]);
  expect(await page.evaluate(() => document.activeElement.getAttribute('data-id'))).toBe(id);   // focus restored after render
  const x0 = await page.evaluate((i) => app.state.elements.find((e) => e.id === i).x, id);
  const grid = await page.evaluate(() => (app.isSnappingActive ? app.gridSize : 10));
  await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight'); await page.keyboard.press('Shift+ArrowDown');
  const moved = await page.evaluate((i) => { const e = app.state.elements.find((x) => x.id === i); return e.x; }, id);
  expect(moved).toBe(x0 + 2 * grid);
  await page.waitForTimeout(800);   // burst is logged as one step
  await page.keyboard.press('Escape');
  expect(await page.evaluate(() => app.state.selectedElementIds)).toEqual([]);
  await page.keyboard.press('ControlOrMeta+z');
  expect(await page.evaluate((i) => app.state.elements.find((e) => e.id === i).x, id)).toBe(x0);   // one undo reverts the burst
});

test('keyboard: data flows can be focused and selected', async ({ page }) => {
  await openApp(page, { session: demoSession() });
  const flow = page.locator('#layers-flows-paths-group g[data-flow-id]').first();
  await expect(flow).toHaveAttribute('aria-label', /^Data flow .+ from .+ to .+/);
  await flow.focus();
  await page.keyboard.press(' ');
  expect(await page.evaluate(() => app.state.selectedFlowId)).toBe(await flow.getAttribute('data-flow-id'));
});

test('keyboard: palette items and template cards work with Enter', async ({ page }) => {
  await openApp(page, { session: demoSession() });
  await page.waitForFunction(() => app.threatSuggestions.process.length);   // the threat library loads asynchronously
  const n0 = await page.evaluate(() => app.state.elements.length);
  await page.locator('#pal-process').focus();
  await page.keyboard.press('Enter');
  expect(await page.evaluate(() => app.state.elements.length)).toBe(n0 + 1);
  await page.click('button[data-bs-target="#tab-panel-suggest"]');
  const card = page.locator('#box-threat-suggestions-list .card.palette-item[role="button"]').first();
  await card.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#modal-edit-threat')).toBeVisible();
});

test('every visible button has an accessible name; images have alt text; canvas items are labelled', async ({ page }) => {
  await openApp(page, { session: demoSession() });
  const r = await page.evaluate(() => {
    const visible = (el) => !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
    const unnamed = [...document.querySelectorAll('button')].filter(visible)
      .filter((b) => !b.textContent.trim() && !b.getAttribute('aria-label') && !b.getAttribute('aria-labelledby'))
      .map((b) => b.id || b.className);
    const noAlt = [...document.querySelectorAll('img')].filter((i) => !i.hasAttribute('alt')).map((i) => i.src);
    const items = [...document.querySelectorAll('#canvas-svg g[tabindex="0"]')];
    return { unnamed, noAlt, items: items.length, unlabeled: items.filter((g) => !g.getAttribute('aria-label')).length };
  });
  expect(r.unnamed).toEqual([]);
  expect(r.noAlt).toEqual([]);
  expect(r.items).toBeGreaterThan(20);
  expect(r.unlabeled).toBe(0);
});

test('responsive: side panels collapse on narrow windows and re-open when wide; no sideways scrolling', async ({ page }) => {
  await openApp(page, { session: demoSession() });
  const state = () => page.evaluate(() => ({ left: !app.isLeftCollapsed, right: !app.isRightCollapsed, overflow: document.documentElement.scrollWidth - window.innerWidth }));
  expect(await state()).toEqual({ left: true, right: true, overflow: 0 });
  await page.setViewportSize({ width: 1000, height: 800 });
  await expect.poll(state).toEqual({ left: true, right: false, overflow: 0 });
  await page.setViewportSize({ width: 700, height: 800 });
  await expect.poll(state).toEqual({ left: false, right: false, overflow: 0 });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(async () => (await state()).overflow).toBe(0);
  await expect(page.locator('#btn-main-menu')).toBeVisible();
  // Canvas toolbar stays on screen, and zoom-to-fit can show the whole demo diagram.
  const tb = await page.locator('#btn-undo').evaluate((b) => b.parentElement.getBoundingClientRect().right);
  expect(tb).toBeLessThanOrEqual(390);
  const fits = await page.evaluate(() => {
    app.zoomToFit();
    const c = document.getElementById('canvas-svg').getBoundingClientRect();
    // Measure the drawn diagram layers (the transform group also holds a very large background grid).
    return ['layers-nodes-group', 'layers-boundaries-group', 'layers-boundary-lines-paths-group', 'layers-flows-paths-group']
      .map((id) => document.getElementById(id).getBoundingClientRect()).filter((r) => r.width)
      .every((r) => r.left >= c.left - 2 && r.right <= c.right + 2);
  });
  expect(fits).toBe(true);
  await page.setViewportSize({ width: 1600, height: 1000 });
  await expect.poll(state).toEqual({ left: true, right: true, overflow: 0 });
});
