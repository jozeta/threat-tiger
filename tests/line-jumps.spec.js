// Line jumps: where two flows cross, the later one hops over the other; bend point help and Clear bend points.
const { test } = require('@playwright/test');
const { expect, openApp, demoSession } = require('./helpers');

async function setup(page, elements = []) {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await openApp(page, { session: demoSession((s) => { s.elements = elements; s.flows = []; s.threats = []; }) });
}

test('findLineJumps finds a crossing and ignores shared ends', async ({ page }) => {
  await setup(page);
  const r = await page.evaluate(() => ({
    cross: findLineJumps([[0, 50], [100, 50]], [[[50, 0], [50, 100]]]),
    sharedStart: findLineJumps([[0, 0], [100, 100]], [[[0, 0], [100, 0]]]),
    nearEnd: findLineJumps([[0, 50], [100, 50]], [[[95, 0], [95, 100]]]),
    parallel: findLineJumps([[0, 50], [100, 50]], [[[0, 60], [100, 60]]]),
  }));
  expect(r.cross).toEqual([{ seg: 0, x: 50, y: 50 }]);
  expect(r.sharedStart).toEqual([]);
  expect(r.nearEnd).toEqual([]);          // 5px from the end: within 2r
  expect(r.parallel).toEqual([]);
});

test('findLineJumps keeps crossings in path order and drops one too close to the previous', async ({ page }) => {
  await setup(page);
  const j = await page.evaluate(() => findLineJumps([[0, 50], [200, 50]], [[[150, 0], [150, 100]], [[60, 0], [60, 100]], [[66, 0], [66, 100]]]));
  expect(j.map((p) => p.x)).toEqual([60, 150]);
});

test('jumpPathD draws an arc of radius 6 at each jump', async ({ page }) => {
  await setup(page);
  const d = await page.evaluate(() => jumpPathD([[0, 50], [100, 50]], [{ seg: 0, x: 50, y: 50 }]));
  expect(d).toBe('M 0 50 L 44 50 A 6 6 0 0 1 56 50 L 100 50');
});

test('flowPolyline follows the renderer\'s smooth curve', async ({ page }) => {
  await setup(page);
  const r = await page.evaluate(() => {
    const poly = flowPolyline([0, 0], [[100, 100]], [200, 0], true);
    const j = findLineJumps(poly, [[[0, 60], [200, 60]]]);
    return { n: poly.length, first: poly[0], last: poly[poly.length - 1], j };
  });
  expect(r.n).toBe(25);                    // 2 cubics x 12 steps + 1
  expect(r.first).toEqual([0, 0]);
  expect(r.last).toEqual([200, 0]);
  expect(r.j.length).toBe(2);              // the curve crosses y=60 on the way down and back up
  r.j.forEach((p) => expect(Math.abs(p.y - 60)).toBeLessThan(0.001));
});

const crossing = [
  { id: 'a', type: 'process', name: 'A', x: 0, y: 200, width: 120, height: 60, secProps: {} },
  { id: 'b', type: 'process', name: 'B', x: 600, y: 200, width: 120, height: 60, secProps: {} },
  { id: 'c', type: 'process', name: 'C', x: 300, y: 0, width: 120, height: 60, secProps: {} },
  { id: 'd', type: 'process', name: 'D', x: 300, y: 500, width: 120, height: 60, secProps: {} },
];
const flows = [
  { id: 'f1', name: 'across', sourceId: 'a', targetId: 'b', sourceAnchor: 'right-2', targetAnchor: 'left-2', points: [], secProps: {} },
  { id: 'f2', name: 'down', sourceId: 'c', targetId: 'd', sourceAnchor: 'bottom-2', targetAnchor: 'top-2', points: [], secProps: {} },
];
async function setupFlows(page) {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await openApp(page, { session: demoSession((s) => { s.elements = crossing; s.flows = flows; s.threats = []; }) });
}
const d = (page, id) => page.locator(`[data-flow-id="${id}"] path.flow-line`).getAttribute('d');

test('the later flow hops over the earlier one; the hit area matches; the ☰ switch turns jumps off', async ({ page }) => {
  await setupFlows(page);
  expect(await d(page, 'f1')).not.toContain(' A ');
  expect(await d(page, 'f2')).toContain(' A 6 6 0 0 1 ');
  expect(await page.locator('[data-flow-id="f2"] path.flow-hit-area').getAttribute('d')).toBe(await d(page, 'f2'));
  await page.click('#btn-main-menu'); await page.click('#btn-menu-view');
  await expect(page.locator('#btn-menu-line-jumps')).toHaveAttribute('aria-checked', 'true');
  await page.click('#btn-menu-line-jumps');
  expect(await d(page, 'f2')).not.toContain(' A ');
  expect(await page.evaluate(() => localStorage.getItem('line_jumps'))).toBe('false');
  expect(await page.evaluate(() => app.undoStack.length)).toBe(0);
});

test('a selected flow with a jump can still be clicked to add a bend point; Clear bend points removes them in one undo step', async ({ page }) => {
  await setupFlows(page);
  await page.evaluate(() => { app.zoomScale = 1; app.panX = 100; app.panY = 100; app.applySvgViewportTransformations(); app.handleFlowSelectionEvent('f2'); });
  const clear = page.locator('#btn-flow-clear-points');
  await expect(clear).toBeDisabled();
  const box = await page.locator('[data-flow-id="f2"] path.flow-hit-area').boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height * 0.8);
  expect(await page.evaluate(() => app.state.flows.find((f) => f.id === 'f2').points.length)).toBe(1);
  await expect(clear).toBeEnabled();
  const before = await page.evaluate(() => app.undoStack.length);
  await clear.click();
  expect(await page.evaluate(() => app.state.flows.find((f) => f.id === 'f2').points.length)).toBe(0);
  expect(await page.evaluate(() => app.undoStack.length)).toBe(before + 1);
  await expect(clear).toBeDisabled();
});

test('jumpPathD measures the hop along the whole path: no spikes at corners or on short segments', async ({ page }) => {
  await setup(page);
  const r = await page.evaluate(() => ({
    corner: jumpPathD([[0, 0], [100, 0], [100, 100]], [{ seg: 0, x: 97, y: 0 }]),
    short: jumpPathD([[0, 50], [48, 50], [52, 50], [100, 50]], [{ seg: 1, x: 50, y: 50 }]),
  }));
  expect(r.corner).toBe('M 0 0 L 91 0 A 6 6 0 0 1 100 3 L 100 100');
  expect(r.short).toBe('M 0 50 L 44 50 A 6 6 0 0 1 56 50 L 100 50');
});

test('no jumps are computed while dragging; they return when the drag ends', async ({ page }) => {
  await setupFlows(page);
  await page.evaluate(() => { app.isDraggingElements = true; app.renderSvgDiagramElements(); });
  expect(await d(page, 'f2')).not.toContain(' A ');
  await page.evaluate(() => { app.isDraggingElements = false; app.renderSvgDiagramElements(); });
  expect(await d(page, 'f2')).toContain(' A ');
});

test('line jumps stay fast on a dense model (300 long curved flows)', async ({ page }) => {
  await setup(page);
  const ms = await page.evaluate(() => {
    let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const els = []; for (let i = 0; i < 120; i++) els.push({ id: 'n' + i, type: 'process', name: 'N' + i, x: Math.round(rnd() * 4000), y: Math.round(rnd() * 3000), width: 120, height: 60, secProps: {} });
    const flows = []; for (let i = 0; i < 300; i++) flows.push({ id: 'f' + i, name: '', sourceId: 'n' + (i % 120), targetId: 'n' + ((i * 7 + 13) % 120), sourceAnchor: 'right-2', targetAnchor: 'left-2', points: [{ x: Math.round(rnd() * 4000), y: Math.round(rnd() * 3000) }], secProps: {}, curveStyle: 'smooth' });
    app.state.elements = els; app.state.flows = flows; app.renderSvgDiagramElements();
    const t0 = performance.now(); for (let k = 0; k < 3; k++) app.renderSvgDiagramElements(); return (performance.now() - t0) / 3;
  });
  // About 160 ms on an idle machine and about 330 ms under heavy load; the problem this guards against took 0.5–9 s.
  expect(ms).toBeLessThan(800);
});
