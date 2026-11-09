// Pages: one model over several pages, each in its own area of the canvas; drill-down links between pages.
const { test } = require('@playwright/test');
const { expect, openApp, demoSession } = require('./helpers');

const node = (id, x, extra = {}) => ({ id, type: 'process', name: id.toUpperCase(), x, y: 100, width: 240, height: 80, secProps: {}, ...extra });
async function setup(page, elements, extra = {}) {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await openApp(page, { session: demoSession((s) => { s.elements = elements; s.flows = extra.flows || []; s.threats = extra.threats || []; delete s.pages; Object.assign(s, extra); }) });
}
const TWO = { pages: [{ id: 'p1', name: 'Overview', offset: 0 }, { id: 'p2', name: 'Payments', offset: 100000 }] };

test('an old model without pages opens as one page; new shapes are stamped with it', async ({ page }) => {
  await setup(page, [node('a', 0)]);
  expect(await page.evaluate(() => [app.state.pages, app.state.activePageId, app.state.elements[0].pageId])).toEqual([[{ id: 'p1', name: 'Page 1', offset: 0 }], 'p1', 'p1']);
});

test('hostile page data loads safely; unknown pageId and linkedPageId are repaired', async ({ page }) => {
  const many = Array.from({ length: 80 }, (_, i) => ({ id: `q${i}`, name: `Q${i}`, offset: (i + 2) * 100000 }));
  await setup(page, [node('a', 0, { pageId: 'nowhere', linkedPageId: 'ghost' }), node('b', 100000, { pageId: 'p2', linkedPageId: 'x' })], {
    pages: [{ id: 'x', name: '<img src=x onerror=alert(1)>', offset: 0 }, { id: 'x', name: 'dup', offset: 5 }, { id: 'p2', name: 'Two', offset: 'NaN' }, { id: 'bad id', name: 'B' }, ...many],
  });
  const r = await page.evaluate(() => ({
    n: app.state.pages.length, first: app.state.pages[0], p2: app.state.pages.find((p) => p.id === 'p2'),
    a: [app.state.elements[0].pageId, app.state.elements[0].linkedPageId], b: [app.state.elements[1].pageId, app.state.elements[1].linkedPageId],
    offsets: new Set(app.state.pages.map((p) => p.offset)).size === app.state.pages.length,
  }));
  expect(r.n).toBe(50);
  expect(r.first).toEqual({ id: 'x', name: '<img src=x onerror=alert(1)>', offset: 0 });
  expect(r.p2.offset % 100000).toBe(0);
  expect(r.p2.offset).toBeGreaterThan(0);
  expect(r.a).toEqual(['x', undefined]);
  expect(r.b).toEqual(['p2', 'x']);
  expect(r.offsets).toBe(true);
});

test('pages round-trip through JSON export and undo', async ({ page }) => {
  await setup(page, [node('a', 0, { pageId: 'p1' }), node('b', 100000, { pageId: 'p2', linkedPageId: 'p1' })], TWO);
  const [download] = await Promise.all([page.waitForEvent('download'), page.evaluate(() => app.exportWorkspaceJsonPayloadFile())]);
  const json = JSON.parse(require('node:fs').readFileSync(await download.path(), 'utf8'));
  expect(json.pages).toEqual([{ id: 'p1', name: 'Overview', offset: 0 }, { id: 'p2', name: 'Payments', offset: 100000 }]);
  expect(json.elements.map((e) => [e.pageId, e.linkedPageId])).toEqual([['p1', undefined], ['p2', 'p1']]);
  await page.evaluate(() => { app.state.pages[1].name = 'Changed'; app.logEvent('CHANGE', 'rename'); app.undo(); });
  expect(await page.evaluate(() => app.state.pages[1].name)).toBe('Payments');
});
