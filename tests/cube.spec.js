// Flowchart cube (now a process with the 3D option): shape, anchors on the visible faces, Type dropdown and quick add.
const { test } = require('@playwright/test');
const { expect, openApp, demoSession } = require('./helpers');

async function setup(page, elements = []) {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await openApp(page, { session: demoSession((s) => { s.elements = elements; s.flows = []; s.threats = []; }) });
}

test('a 3D process is the cube: three faces, label on the front face, size and colours kept', async ({ page }) => {
  await setup(page, [{ id: 'c', type: 'fc_process', threeD: true, name: 'Cube', x: 400, y: 300, width: 140, height: 100, fcFillColor: '#e0e7ff', fcStrokeColor: '#4f46e5' }]);
  const n = await page.evaluate(() => JSON.parse(JSON.stringify(app.state.elements.find((e) => e.id === 'c'))));
  expect(n).toMatchObject({ name: 'Cube', width: 140, height: 100, fcFillColor: '#e0e7ff', fcStrokeColor: '#4f46e5', threeD: true });
  const g = page.locator(`#layers-nodes-group [data-id="${n.id}"]`);
  // Front face plus the shaded top and right faces.
  await expect(g.locator('[data-fc3d="cap"][stroke="#4f46e5"]')).toHaveCount(1);
  await expect(g.locator('[data-fc3d="wall"]')).toHaveCount(2);
  // d = 20% of the shorter side = 20: the label sits in the middle of the front face.
  const lbl = g.locator('text').first();
  await expect(lbl).toHaveAttribute('x', '60');
  await expect(lbl).toHaveAttribute('y', '60');
});

test('cube anchors sit on the visible faces, and the Type dropdown and quick add keep the 3D look', async ({ page }) => {
  await setup(page, [{ id: 'c', type: 'fc_process', threeD: true, name: 'Server', x: 400, y: 300, width: 140, height: 100, fcFillColor: '#e0e7ff', fcStrokeColor: '#4f46e5' }]);
  const anchors = await page.evaluate(() => app.getFcAnchorPoints('fc_process', 140, 100, true));
  expect(anchors).toEqual([
    { id: 'top', cx: 70, cy: 10 }, { id: 'bottom', cx: 60, cy: 100 },
    { id: 'left', cx: 0, cy: 60 }, { id: 'right', cx: 130, cy: 50 },
  ]);
  await page.evaluate(() => { app.state.selectedElementIds = ['c']; app.refreshAppViewVisualWorkspace(); });
  await expect(page.locator('#props-node-type')).toHaveValue('fc_process');
  await expect(page.locator('#props-fc-3d')).toBeChecked();
  // Quick add from the right anchor gives another 3D process (the preview is drawn in 3D too).
  await page.locator('#layers-nodes-group [data-id="c"]').first().hover();
  const right = page.locator('#layers-nodes-group [data-id="c"] [data-anchor-id="right"]');
  await right.hover();
  await expect(page.locator('#quick-add-ghost-group [data-ghost-type="fc_process"] [data-fc3d="wall"]')).toHaveCount(2);
  await right.click();
  expect(await page.evaluate(() => app.state.elements.filter((e) => e.type === 'fc_process' && e.threeD).length)).toBe(2);
});
