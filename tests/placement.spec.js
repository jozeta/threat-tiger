// A clicked palette item goes to the middle of the visible canvas, or the nearest free spot in view when that is taken.
const { test } = require('@playwright/test');
const { expect, openApp } = require('./helpers');

const P = (id, type, name, x, y, extra = {}) => Object.assign({ id, type, name, x, y, width: 120, height: 60, secProps: {} }, extra);
const empty = (elements = []) => ({ projectTitle: 'T', activeUser: 'Tester', elements, flows: [], threats: [] });
/** Adds a shape like a palette click and returns its box and every other shape's box. */
const add = (page, type) => page.evaluate((t) => {
  const id = app.instantiateNewCanvasElementNode(t);
  const box = (e) => { const d = app.elementDefaults(e.type); return { id: e.id, type: e.type, x: e.x, y: e.y, w: e.width || d.width, h: e.height || d.height }; };
  return { me: box(app.state.elements.find((e) => e.id === id)), others: app.state.elements.filter((e) => e.id !== id).map(box) };
}, type);
const overlaps = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const viewBox = (page) => page.evaluate(() => {
  const r = app.dom.svg.getBoundingClientRect();
  const a = app.convertClientScreenCoordinatesToCanvasSpace(r.left, r.top), b = app.convertClientScreenCoordinatesToCanvasSpace(r.right, r.bottom);
  return { x: a.x, y: a.y, w: b.x - a.x, h: b.y - a.y };
});
const inside = (a, v) => a.x >= v.x && a.y >= v.y && a.x + a.w <= v.x + v.w && a.y + a.h <= v.y + v.h;

test('on an empty canvas a new shape goes to the middle of the view, as before', async ({ page }) => {
  await openApp(page, { session: empty() });
  const v = await viewBox(page);
  const { me } = await add(page, 'process');
  expect(Math.abs(me.x + me.w / 2 - (v.x + v.w / 2))).toBeLessThanOrEqual(20);
  expect(Math.abs(me.y + me.h / 2 - (v.y + v.h / 2))).toBeLessThanOrEqual(20);
});

test('a new shape never lands on top of an existing one, and stays in view', async ({ page }) => {
  await openApp(page, { session: empty() });
  for (let i = 0; i < 6; i++) await add(page, i % 2 ? 'datastore' : 'process');
  const { me, others } = await add(page, 'interactor');
  for (const o of others) expect(overlaps(me, o), `${me.id} on ${o.id}`).toBe(false);
  expect(inside(me, await viewBox(page))).toBe(true);
});

test('icons, ready-made nodes and stencils avoid other shapes too', async ({ page }) => {
  await openApp(page, { session: empty() });
  await add(page, 'process');
  const r = await page.evaluate(() => {
    const ids = [app.addReadyNode(READY_NODES[0].id), app.addAttackPreset(Object.keys(ATTACK_PRESETS)[0])];
    return app.state.elements.map((e) => { const d = app.elementDefaults(e.type); return { id: e.id, x: e.x, y: e.y, w: e.width || d.width, h: e.height || d.height }; }).concat([{ ids }]);
  });
  const boxes = r.slice(0, -1);
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) expect(overlaps(boxes[i], boxes[j])).toBe(false);
});

test('a new trust zone does not swallow existing shapes; a shape may still go inside a zone', async ({ page }) => {
  await openApp(page, { session: empty() });
  await add(page, 'process');
  const zone = await add(page, 'boundary');
  for (const o of zone.others) expect(overlaps(zone.me, o)).toBe(false);
});

test('a shape inside a big zone that fills the view still gets placed (zones are not obstacles for shapes)', async ({ page }) => {
  await openApp(page, { session: empty() });
  const v = await viewBox(page);
  await page.evaluate((vb) => { app.state.elements.push({ id: 'z', type: 'boundary', name: 'Z', x: vb.x - 50, y: vb.y - 50, width: vb.w + 100, height: vb.h + 100, secProps: {}, pageId: app.state.activePageId }); app.refreshAppViewVisualWorkspace(); }, v);
  const { me } = await add(page, 'process');
  expect(Math.abs(me.x + me.w / 2 - (v.x + v.w / 2))).toBeLessThanOrEqual(20);
});

test('a drop still puts the shape exactly where it was dropped, even on top of another', async ({ page }) => {
  await openApp(page, { session: empty([P('a', 'process', 'A', 400, 300)]) });
  const id = await page.evaluate(() => app.instantiateNewCanvasElementNode('process', 460, 330));
  const r = await page.evaluate((i) => { const e = app.state.elements.find((x) => x.id === i), d = app.elementDefaults('process'); return [e.x, e.y, app.snapValue(460 - d.width / 2), app.snapValue(330 - d.height / 2)]; }, id);
  expect(r.slice(0, 2)).toEqual(r.slice(2));   // centred on the drop point, the old rule
});
