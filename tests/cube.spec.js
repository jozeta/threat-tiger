// Flowchart cube (3D box): palette item, shape, anchors on the visible faces, Type dropdown and quick add.
const { test } = require('@playwright/test');
const { expect, openApp, demoSession } = require('./helpers');

async function setup(page, elements = []) {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await openApp(page, { session: demoSession((s) => { s.elements = elements; s.flows = []; s.threats = []; }) });
}

test('the palette adds a cube: three faces, label on the front face, default size and colours', async ({ page }) => {
  await setup(page);
  await page.locator('#headingFlowchart button').click();
  await page.locator('#pal-fc-cube').click();
  const n = await page.evaluate(() => JSON.parse(JSON.stringify(app.state.elements.find((e) => e.type === 'fc_cube'))));
  expect(n).toMatchObject({ name: 'Cube', width: 140, height: 100, fcFillColor: '#e0e7ff', fcStrokeColor: '#4f46e5' });
  const g = page.locator(`#layers-nodes-group [data-id="${n.id}"]`);
  // Front, top and right faces (plus two shading overlays on the side faces).
  await expect(g.locator('polygon[stroke="#4f46e5"]')).toHaveCount(3);
  await expect(g.locator('polygon[fill-opacity]')).toHaveCount(2);
  // d = 20% of the shorter side = 20: the label sits in the middle of the front face.
  const lbl = g.locator('text').first();
  await expect(lbl).toHaveAttribute('x', '60');
  await expect(lbl).toHaveAttribute('y', '60');
});

test('cube anchors sit on the visible faces, and the Type dropdown and quick add know the cube', async ({ page }) => {
  await setup(page, [{ id: 'c', type: 'fc_cube', name: 'Server', x: 400, y: 300, width: 140, height: 100, fcFillColor: '#e0e7ff', fcStrokeColor: '#4f46e5' }]);
  const anchors = await page.evaluate(() => app.getFcAnchorPoints('fc_cube', 140, 100));
  expect(anchors).toEqual([
    { id: 'top', cx: 70, cy: 10 }, { id: 'bottom', cx: 60, cy: 100 },
    { id: 'left', cx: 0, cy: 60 }, { id: 'right', cx: 130, cy: 50 },
  ]);
  await page.evaluate(() => { app.state.selectedElementIds = ['c']; app.refreshAppViewVisualWorkspace(); });
  await expect(page.locator('#props-node-type option[value="fc_cube"]')).toHaveCount(1);
  await expect(page.locator('#props-node-type')).toHaveValue('fc_cube');
  // Quick add from the right anchor gives another cube.
  await page.locator('#layers-nodes-group [data-id="c"]').first().hover();
  const right = page.locator('#layers-nodes-group [data-id="c"] [data-anchor-id="right"]');
  await right.hover();
  await expect(page.locator('#quick-add-ghost-group [data-ghost-type="fc_cube"]')).toHaveCount(1);
  await right.click();
  expect(await page.evaluate(() => app.state.elements.filter((e) => e.type === 'fc_cube').length)).toBe(2);
});
