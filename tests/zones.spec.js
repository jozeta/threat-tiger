// Trust zones are selected/moved by border or label; clicks inside a zone reach the canvas.
const { test } = require('@playwright/test');
const { expect, openApp, demoSession } = require('./helpers');

function model() {
  return demoSession((s) => {
    s.elements = [
      { id: 'z', type: 'boundary', name: 'Internal network', x: 100, y: 100, width: 700, height: 420 },
      { id: 'a', type: 'process', name: 'A', x: 200, y: 220, width: 200, height: 80, secProps: {} },
      { id: 'b', type: 'datastore', name: 'B', x: 500, y: 330, width: 200, height: 80, secProps: {} },
    ];
    s.flows = []; s.threats = [];
  });
}
const toScreen = (page, x, y) => page.evaluate(([cx, cy]) => {
  const m = document.getElementById('layers-boundaries-group').getScreenCTM();
  return { x: cx * m.a + cy * m.c + m.e, y: cx * m.b + cy * m.d + m.f };
}, [x, y]);

test('clicking empty space inside a zone does not select the zone', async ({ page }) => {
  await openApp(page, { session: model() });
  const p = await toScreen(page, 150, 480);
  await page.mouse.click(p.x, p.y);
  expect(await page.evaluate(() => app.state.selectedElementIds)).toEqual([]);
});

test('box-selecting inside a zone selects the components, not the zone', async ({ page }) => {
  await openApp(page, { session: model() });
  const from = await toScreen(page, 150, 160), to = await toScreen(page, 760, 470);
  await page.mouse.move(from.x, from.y); await page.mouse.down();
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2); await page.mouse.move(to.x, to.y);
  await page.mouse.up();
  expect((await page.evaluate(() => app.state.selectedElementIds)).sort()).toEqual(['a', 'b']);
});

test('clicking the zone border selects it; dragging its label moves it', async ({ page }) => {
  await openApp(page, { session: model() });
  const edge = await toScreen(page, 100, 300);           // left border
  await page.mouse.click(edge.x + 2, edge.y);
  expect(await page.evaluate(() => app.state.selectedElementIds)).toEqual(['z']);
  const label = await toScreen(page, 40 + 100, 118);      // over the zone name
  await page.mouse.move(label.x, label.y); await page.mouse.down();
  for (let i = 1; i <= 6; i++) await page.mouse.move(label.x + i * 10, label.y + i * 5);
  await page.mouse.up();
  const z = await page.evaluate(() => app.state.elements.find((e) => e.id === 'z'));
  expect(z.x).toBeGreaterThan(130);
});

test('a component inside a zone is still clickable', async ({ page }) => {
  await openApp(page, { session: model() });
  const box = await page.locator('#layers-nodes-group [data-id="a"]').first().boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  expect(await page.evaluate(() => app.state.selectedElementIds)).toEqual(['a']);
});

test('box selection: a zone is selected when fully enclosed; boundary lines use their real extent', async ({ page }) => {
  await openApp(page, { session: model() });
  const r = await page.evaluate(() => {
    app.state.elements.push({ id: 'bl', type: 'boundary_line', name: 'Edge', x: 900, y: 50, x2: 900, y2: 600 });
    const out = {};
    app.evaluateBoxSelectionIntersections(50, 50, 800, 520); out.enclosing = [...app.state.selectedElementIds].sort();
    app.evaluateBoxSelectionIntersections(880, 500, 40, 40); out.lineLowerEnd = [...app.state.selectedElementIds];
    return out;
  });
  expect(r.enclosing).toEqual(['a', 'b', 'z']);
  expect(r.lineLowerEnd).toEqual(['bl']);
});
