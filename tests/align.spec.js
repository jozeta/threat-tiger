// Align and distribute: geometry helpers and the toolbar shown for 2+ selected shapes.
const { test } = require('@playwright/test');
const { expect, openApp, demoSession } = require('./helpers');

async function setup(page, elements = []) {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await openApp(page, { session: demoSession((s) => { s.elements = elements; s.flows = []; s.threats = []; }) });
}
const select = (page, ids) => page.evaluate((sel) => { app.state.selectedElementIds = sel; app.refreshAppViewVisualWorkspace(); }, ids);
const ys = (page) => page.evaluate(() => Object.fromEntries(app.state.elements.map((e) => [e.id, e.y])));

test('computeAlignment aligns edges and centres using each box size', async ({ page }) => {
  await setup(page);
  const r = await page.evaluate(() => {
    const boxes = [{ id: 'a', x: 100, y: 100, w: 240, h: 80 }, { id: 'b', x: 400, y: 160, w: 80, h: 70 }, { id: 'c', x: 250, y: 300, w: 160, h: 100 }];
    const o = (m) => Object.fromEntries(computeAlignment(boxes, m));
    return { left: o('left'), right: o('right'), center: o('center'), bottom: o('bottom'), middle: o('middle') };
  });
  expect(r.left).toEqual({ b: { x: 100, y: 160 }, c: { x: 100, y: 300 } });
  expect(r.right).toEqual({ a: { x: 240, y: 100 }, c: { x: 320, y: 300 } });   // max right edge 480
  expect(r.center).toEqual({ a: { x: 170, y: 100 }, b: { x: 250, y: 160 }, c: { x: 210, y: 300 } }); // centre 290
  expect(r.bottom).toEqual({ a: { x: 100, y: 320 }, b: { x: 400, y: 330 } });  // bottom 400
  expect(r.middle).toEqual({ a: { x: 100, y: 210 }, b: { x: 400, y: 215 }, c: { x: 250, y: 200 } }); // middle 250
});

test('computeAlignment distributes unsorted, overlapping boxes with equal gaps and fixed ends', async ({ page }) => {
  await setup(page);
  const r = await page.evaluate(() => {
    const boxes = [{ id: 'z', x: 600, y: 0, w: 100, h: 50 }, { id: 'a', x: 0, y: 0, w: 100, h: 50 }, { id: 'm', x: 80, y: 0, w: 200, h: 50 }];
    return { h: Object.fromEntries(computeAlignment(boxes, 'hspace')), two: computeAlignment(boxes.slice(0, 2), 'hspace').size };
  });
  expect(r.h).toEqual({ m: { x: 250, y: 0 } });   // gap = (700 - 400) / 2 = 150
  expect(r.two).toBe(0);
});

test('alignableBox uses type default sizes and ignores non-alignable types', async ({ page }) => {
  await setup(page);
  const r = await page.evaluate(() => [
    alignableBox({ id: 'i', type: 'infrastructure', x: 1, y: 2 }),
    alignableBox({ id: 'f', type: 'fc_cube', x: 0, y: 0, width: 140, height: 100 }),
    alignableBox({ id: 's', type: 'swimlane', x: 0, y: 0 }),
    alignableBox({ id: 't', type: 'textbox', x: 0, y: 0 }),
  ]);
  expect(r).toEqual([{ id: 'i', x: 1, y: 2, w: 80, h: 70 }, { id: 'f', x: 0, y: 0, w: 140, h: 100 }, null, null]);
});

test('toolbar shows for 2+ alignable nodes, aligns in one undo step, ignores flows and swimlanes', async ({ page }) => {
  await setup(page, [
    { id: 'a', type: 'process', name: 'A', x: 100, y: 100, width: 240, height: 80, secProps: {} },
    { id: 'b', type: 'datastore', name: 'B', x: 400, y: 260, width: 240, height: 80, secProps: {} },
    { id: 'c', type: 'fc_decision', name: 'C', x: 700, y: 180, width: 160, height: 100 },
    { id: 's', type: 'swimlane', name: 'S', x: 0, y: 600, columns: ['A'], rows: ['R'] },
  ]);
  const bar = page.locator('#align-toolbar');
  await select(page, ['a']);                       await expect(bar).toBeHidden();
  await select(page, ['a', 's']);                  await expect(bar).toBeHidden();      // swimlane does not count
  await select(page, ['a', 'b']);                  await expect(bar).toBeVisible();
  await expect(bar.locator('[data-align="hspace"]')).toBeDisabled();
  await select(page, ['a', 'b', 'c', 's']);
  await expect(bar.locator('[data-align="hspace"]')).toBeEnabled();
  await bar.locator('[data-align="top"]').click();
  expect(await ys(page)).toEqual({ a: 100, b: 100, c: 100, s: 600 });
  await page.click('#btn-undo');
  expect(await ys(page)).toEqual({ a: 100, b: 260, c: 180, s: 600 });
});

test('aligning already-aligned nodes adds no undo step; works the same in isometric view', async ({ page }) => {
  await setup(page, [
    { id: 'a', type: 'process', name: 'A', x: 100, y: 100, width: 240, height: 80, secProps: {} },
    { id: 'b', type: 'process', name: 'B', x: 100, y: 300, width: 240, height: 80, secProps: {} },
  ]);
  await page.evaluate(() => app.setViewMode('ne-isometric'));
  await select(page, ['a', 'b']);
  const before = await page.evaluate(() => app.undoStack.length);
  expect(await page.evaluate(() => app.alignSelection('left'))).toBe(0);
  expect(await page.evaluate(() => app.undoStack.length)).toBe(before);
  expect(await page.evaluate(() => app.alignSelection('right'))).toBe(0);  // equal widths: nothing moves
  expect(await page.evaluate(() => app.alignSelection('top'))).toBe(1);
  expect(await page.evaluate(() => app.undoStack.length)).toBe(before + 1);
});

test('distribute leaves out a box that encloses other selected boxes (a zone with its contents)', async ({ page }) => {
  await setup(page);
  const r = await page.evaluate(() => {
    const boxes = [{ id: 'zone', x: 0, y: 0, w: 600, h: 300 }, { id: 'a', x: 50, y: 50, w: 100, h: 50 },
      { id: 'b', x: 120, y: 50, w: 100, h: 50 }, { id: 'c', x: 450, y: 50, w: 100, h: 50 }];
    return Object.fromEntries(computeAlignment(boxes, 'hspace'));
  });
  expect(r).toEqual({ b: { x: 250, y: 50 } });   // a and c fixed, gap (500 - 300) / 2 = 100; the zone does not move
});

// ── Deferred minors (1.15.1) ──
test('a trust zone without a size aligns as 320 x 240, like the rest of the app', async ({ page }) => {
  await setup(page);
  expect(await page.evaluate(() => alignableBox({ id: 'z', type: 'boundary', x: 0, y: 0 }))).toEqual({ id: 'z', x: 0, y: 0, w: 320, h: 240 });
});

test('aligning shapes in a swimlane is one undo step, including the lane\'s own adjustment', async ({ page }) => {
  await setup(page, [
    { id: 'l', type: 'swimlane', name: 'Lane', x: 0, y: 0, columns: ['A', 'B'], rows: ['R'] },
    { id: 'a', type: 'process', name: 'A', x: 40, y: 100, width: 240, height: 80, secProps: {} },
    { id: 'b', type: 'process', name: 'B', x: 360, y: 160, width: 240, height: 80, secProps: {} },
  ]);
  await page.evaluate(() => { app.layoutSwimlanes(); app.refreshAppViewVisualWorkspace(); app.resetUndoHistory(); });
  const before = await page.evaluate(() => JSON.stringify(app.state.elements.map((e) => [e.id, e.x, e.y])));
  await select(page, ['a', 'b']);
  await page.evaluate(() => app.alignSelection('left'));   // b moves left, into column A, where the lane re-pads it
  await page.evaluate(() => app.undo());
  expect(await page.evaluate(() => JSON.stringify(app.state.elements.map((e) => [e.id, e.x, e.y])))).toBe(before);
});

test('the align toolbar works with arrow keys and has one tab stop', async ({ page }) => {
  await setup(page, [
    { id: 'a', type: 'process', name: 'A', x: 0, y: 0, width: 240, height: 80, secProps: {} },
    { id: 'b', type: 'process', name: 'B', x: 300, y: 100, width: 240, height: 80, secProps: {} },
  ]);
  await select(page, ['a', 'b']);
  const bar = page.locator('#align-toolbar');
  expect(await bar.locator('button[tabindex="0"]').count()).toBe(1);
  await bar.locator('[data-align="left"]').focus();
  await page.keyboard.press('ArrowRight');
  await expect(bar.locator('[data-align="center"]')).toBeFocused();
  await page.keyboard.press('End');
  await expect(bar.locator('[data-align="bottom"]')).toBeFocused();   // distribute buttons are disabled with 2 shapes
  await page.keyboard.press('Home');
  await expect(bar.locator('[data-align="left"]')).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await expect(bar.locator('[data-align="bottom"]')).toBeFocused();   // wraps
});

test('on a narrow screen the align toolbar sits above the canvas controls', async ({ page }) => {
  await setup(page, [
    { id: 'a', type: 'process', name: 'A', x: 0, y: 0, width: 240, height: 80, secProps: {} },
    { id: 'b', type: 'process', name: 'B', x: 300, y: 100, width: 240, height: 80, secProps: {} },
  ]);
  await page.setViewportSize({ width: 420, height: 900 });
  await select(page, ['a', 'b']);
  const bar = await page.locator('#align-toolbar').boundingBox();
  const controls = await page.locator('#btn-undo').locator('xpath=..').boundingBox();
  expect(bar.y + bar.height).toBeLessThanOrEqual(controls.y + 1);
});
