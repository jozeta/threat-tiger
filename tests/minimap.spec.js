// Minimap: an overview of the whole diagram in the canvas corner; click or drag in it to pan.
const { test } = require('@playwright/test');
const { expect, openApp, demoSession } = require('./helpers');

async function setup(page, elements = []) {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await openApp(page, { session: demoSession((s) => { s.elements = elements; s.flows = []; s.threats = []; }) });
}

test('minimap shows one item per element and a viewport; hidden when empty; toggle persists', async ({ page }) => {
  await setup(page, [
    { id: 'a', type: 'process', name: 'A', x: 0, y: 0, width: 240, height: 80, secProps: {} },
    { id: 'b', type: 'datastore', name: 'B', x: 2000, y: 1200, width: 240, height: 80, secProps: {} },
  ]);
  const map = page.locator('#minimap');
  await expect(map).toBeVisible();
  await expect(map.locator('.minimap-item')).toHaveCount(2);
  await expect(map.locator('.minimap-viewport')).toHaveCount(1);
  await page.click('#btn-canvas-minimap');
  await expect(map).toBeHidden();
  await expect(page.locator('#btn-canvas-minimap')).toHaveAttribute('aria-pressed', 'false');
  expect(await page.evaluate(() => localStorage.getItem('minimap_visible'))).toBe('false');
  await page.click('#btn-canvas-minimap');
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
