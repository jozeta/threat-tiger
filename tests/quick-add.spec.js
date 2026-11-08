// Quick add: hovering an anchor of a flowchart node previews a connected node; clicking adds it.
const { test } = require('@playwright/test');
const { expect, openApp, demoSession } = require('./helpers');

function model(extra = []) {
  return demoSession((s) => {
    s.elements = [
      { id: 'd', type: 'fc_decision', name: 'Approved?', x: 400, y: 300, width: 160, height: 100, fcFillColor: '#dbeafe', fcStrokeColor: '#1d4ed8', fcStrokeWidth: 3 },
      { id: 'p', type: 'process', name: 'API', x: 400, y: 700, width: 240, height: 80, icon: 'bi-server', secProps: {} },
      ...extra,
    ];
    s.flows = []; s.threats = [];
  });
}
async function setup(page, extra) {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await openApp(page, { session: model(extra) });
  await page.evaluate(() => { app.zoomScale = 0.8; app.panX = 100; app.panY = 0; app.applySvgViewportTransformations(); });
}
const anchor = (page, id, a) => page.locator(`#layers-nodes-group [data-id="${id}"] [data-anchor-id="${a}"]`);
async function hoverAnchor(page, id, a) {
  await page.locator(`#layers-nodes-group [data-id="${id}"]`).first().hover();
  await anchor(page, id, a).hover();
}
const added = (page) => page.evaluate(() => {
  const n = app.state.elements.find((e) => !['d', 'p', 'blk'].includes(e.id));
  return { node: n && JSON.parse(JSON.stringify(n)), flows: JSON.parse(JSON.stringify(app.state.flows)), selected: app.state.selectedElementIds };
});

test('hovering an anchor shows a semi-transparent preview; clicking adds a same-type node and a flow (one undo step)', async ({ page }) => {
  await setup(page);
  await hoverAnchor(page, 'd', 'right');
  const ghost = page.locator('#quick-add-ghost-group');
  await expect(ghost.locator('[data-ghost-type="fc_decision"]')).toHaveCount(1);
  await expect(ghost.locator('.quick-add-line')).toHaveCount(1);
  expect(Number(await ghost.evaluate((g) => getComputedStyle(g).opacity))).toBeLessThan(1);
  await anchor(page, 'd', 'right').click();
  await expect(ghost.locator('*')).toHaveCount(0);
  const r = await added(page);
  expect(r.node).toMatchObject({ type: 'fc_decision', name: 'Decision', width: 160, height: 100, fcFillColor: '#dbeafe', fcStrokeColor: '#1d4ed8', fcStrokeWidth: 3, y: 300 });
  expect(r.node.x).toBe(400 + 160 + 80);
  expect(r.flows).toHaveLength(1);
  expect(r.flows[0]).toMatchObject({ sourceId: 'd', sourceAnchor: 'right', targetId: r.node.id, targetAnchor: 'left' });
  expect(r.selected).toEqual([r.node.id]);
  await page.click('#btn-undo');
  expect(await page.evaluate(() => [app.state.elements.length, app.state.flows.length])).toEqual([2, 0]);
});

test('the new node goes in the anchor direction and moves aside when that spot is taken', async ({ page }) => {
  // A blocker exactly where the bottom quick-add would go.
  await setup(page, [{ id: 'blk', type: 'fc_process', name: 'Busy', x: 400, y: 480, width: 160, height: 80 }]);
  await hoverAnchor(page, 'd', 'bottom');
  await anchor(page, 'd', 'bottom').click();
  const { node, flows } = await added(page);
  expect(node.y).toBe(300 + 100 + 80);                     // below the source
  expect(node.x).not.toBe(400);                             // shifted sideways
  const blk = { x: 400, y: 480, w: 160, h: 80 };
  const overlaps = node.x < blk.x + blk.w && node.x + node.width > blk.x && node.y < blk.y + blk.h && node.y + node.height > blk.y;
  expect(overlaps).toBe(false);
  expect(flows[0]).toMatchObject({ sourceAnchor: 'bottom', targetAnchor: 'top' });
});

test('dragging from an anchor into empty space adds nothing; threat-modelling nodes have no quick add', async ({ page }) => {
  await setup(page);
  await hoverAnchor(page, 'd', 'left');
  const box = await anchor(page, 'd', 'left').boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down();
  await page.mouse.move(box.x - 150, box.y + 40, { steps: 5 }); await page.mouse.up();
  expect(await page.evaluate(() => [app.state.elements.length, app.state.flows.length])).toEqual([2, 0]);
  await hoverAnchor(page, 'p', 'right');
  await expect(page.locator('#quick-add-ghost-group *')).toHaveCount(0);
  await anchor(page, 'p', 'right').click();
  expect(await page.evaluate(() => [app.state.elements.length, app.state.flows.length])).toEqual([2, 0]);
});
