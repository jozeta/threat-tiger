// Minimap: an overview of the whole diagram in the canvas corner; click or drag in it to pan.
const { test } = require('@playwright/test');
const { expect, openApp, demoSession } = require('./helpers');

async function setup(page, elements = [], { show = true } = {}) {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await openApp(page, { session: demoSession((s) => { s.elements = elements; s.flows = []; s.threats = []; }) });
  if (show) await page.evaluate(() => { if (!app.minimapVisible) app.toggleMinimap(); });
}

test('the minimap is hidden by default; the ☰ menu shows and hides it, and the choice is remembered', async ({ page }) => {
  await setup(page, [{ id: 'a', type: 'process', name: 'A', x: 0, y: 0, width: 240, height: 80, secProps: {} }], { show: false });
  const map = page.locator('#minimap'), item = page.locator('#btn-menu-minimap');
  await expect(map).toBeHidden();
  await page.click('#btn-main-menu'); await page.click('#btn-menu-view');
  await expect(item).toHaveAttribute('aria-checked', 'false');
  await item.click();
  await expect(map).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('minimap_visible'))).toBe('true');
  await page.reload();
  await expect(map).toBeVisible();
  await page.click('#btn-main-menu'); await page.click('#btn-menu-view');
  await expect(item).toHaveAttribute('aria-checked', 'true');
  await item.click();
  await expect(map).toBeHidden();
});

test('minimap shows one item per element and a viewport; hidden when empty; toggle persists', async ({ page }) => {
  await setup(page, [
    { id: 'a', type: 'process', name: 'A', x: 0, y: 0, width: 240, height: 80, secProps: {} },
    { id: 'b', type: 'datastore', name: 'B', x: 2000, y: 1200, width: 240, height: 80, secProps: {} },
  ]);
  const map = page.locator('#minimap');
  await expect(map).toBeVisible();
  await expect(map.locator('.minimap-item')).toHaveCount(2);
  await expect(map.locator('.minimap-viewport')).toHaveCount(1);
  await page.click('#btn-main-menu'); await page.click('#btn-menu-view'); await page.click('#btn-menu-minimap'); await page.keyboard.press('Escape');
  await expect(map).toBeHidden();
  expect(await page.evaluate(() => localStorage.getItem('minimap_visible'))).toBe('false');
  await page.click('#btn-main-menu'); await page.click('#btn-menu-view'); await page.click('#btn-menu-minimap'); await page.keyboard.press('Escape');
  await page.evaluate(() => { app.state.elements = []; app.refreshAppViewVisualWorkspace(); });
  await expect(map).toBeHidden();
  await page.evaluate(() => { app.state.elements = [{ id: 'c', type: 'process', name: 'C', x: 0, y: 0, width: 240, height: 80, secProps: {} }]; app.refreshAppViewVisualWorkspace(); });
  await expect(map.locator('.minimap-item')).toHaveCount(1);
});

for (const mode of ['flat', 'ne-isometric']) {
  test(`clicking a node's spot in the minimap centres it (${mode})`, async ({ page }) => {
    await setup(page, [
      { id: 'a', type: 'process', name: 'A', x: 0, y: 0, width: 240, height: 80, secProps: {} },
      { id: 'b', type: 'datastore', name: 'B', x: 3000, y: 2000, width: 240, height: 80, secProps: {} },
    ]);
    await page.evaluate((m) => app.setViewMode(m), mode);
    await page.locator('#minimap .minimap-item[data-minimap-id="b"]').click();
    const off = await page.evaluate(() => {
      const r = document.querySelector('#layers-nodes-group [data-id="b"]').getBoundingClientRect();
      const c = document.getElementById('canvas-svg').getBoundingClientRect();
      return [Math.abs(r.x + r.width / 2 - (c.x + c.width / 2)), Math.abs(r.y + r.height / 2 - (c.y + c.height / 2))];
    });
    expect(off[0]).toBeLessThan(60);
    expect(off[1]).toBeLessThan(60);
    expect(await page.evaluate(() => app.undoStack.length)).toBe(0);
  });
}

test('there is no minimap button on the canvas toolbar (the ☰ menu controls it)', async ({ page }) => {
  await setup(page, [{ id: 'a', type: 'process', name: 'A', x: 0, y: 0, width: 240, height: 80, secProps: {} }]);
  await expect(page.locator('#btn-canvas-minimap')).toHaveCount(0);
});

for (const width of [1280, 1366]) {
  test(`the minimap does not overlap the canvas toolbars at ${width}px`, async ({ page }) => {
    await setup(page, [{ id: 'a', type: 'process', name: 'A', x: 0, y: 0, width: 240, height: 80, secProps: {} }]);
    await page.setViewportSize({ width, height: 800 });
    await page.evaluate(() => { app.state.selectedElementIds = ['a']; app.refreshAppViewVisualWorkspace(); });
    const overlap = await page.evaluate(() => {
      const m = document.getElementById('minimap').getBoundingClientRect();
      const bars = [document.getElementById('btn-undo').parentElement, document.getElementById('align-toolbar')];
      return bars.some((b) => { const r = b.getBoundingClientRect(); return r.width && m.left < r.right && r.left < m.right && m.top < r.bottom && r.top < m.bottom; });
    });
    expect(overlap).toBe(false);
  });
}

// ── Deferred minors (1.15.1) ──
test('the minimap frame follows a canvas resize without a pan or zoom', async ({ page }) => {
  await setup(page, [{ id: 'a', type: 'process', name: 'A', x: 0, y: 0, width: 240, height: 80, secProps: {} }]);
  const w0 = await page.evaluate(() => Number(document.querySelector('#minimap .minimap-viewport').getAttribute('width')));
  await page.setViewportSize({ width: 1100, height: 1000 });
  await expect.poll(() => page.evaluate(() => {
    const vp = Number(document.querySelector('#minimap .minimap-viewport').getAttribute('width'));
    return Math.abs(vp - app.dom.svg.getBoundingClientRect().width / app.zoomScale) < 1;
  })).toBe(true);
  expect(await page.evaluate(() => Number(document.querySelector('#minimap .minimap-viewport').getAttribute('width')))).not.toBe(w0);
});
