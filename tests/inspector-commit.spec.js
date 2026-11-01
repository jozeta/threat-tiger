// Bug report: text typed into a component/flow field was lost when the user clicked the canvas
// instead of pressing Tab. Every inspector field must save when focus leaves it in any way.
const { test } = require('@playwright/test');
const { expect, openApp, demoSession } = require('./helpers');

/** Clicks an empty spot of the canvas (no component, flow or label under the pointer). */
async function clickEmptyCanvas(page) {
  const pt = await page.evaluate(() => {
    const r = document.getElementById('canvas-svg').getBoundingClientRect();
    for (let y = r.top + 20; y < r.bottom - 80; y += 15) for (let x = r.left + 20; x < r.right - 20; x += 15) {
      const el = document.elementFromPoint(x, y);
      if (el && (el.id === 'canvas-svg' || el.closest('#canvas-svg') && !el.closest('[data-id]') && !el.closest('#layers-flows-paths-group') && !el.closest('#layers-flows-texts-group') && !el.closest('.dropdown,.btn'))) return { x, y };
    }
    return null;
  });
  if (!pt) throw new Error('no empty canvas spot found');
  await page.mouse.click(pt.x, pt.y);
}

async function selectNode(page, type) {
  const id = await page.evaluate((t) => app.state.elements.find((e) => e.type === t).id, type);
  await page.evaluate((i) => { app.state.selectedElementIds = [i]; app.state.selectedFlowId = null; app.refreshAppViewVisualWorkspace(); }, id);
  return id;
}

const cases = [
  { name: 'component name', field: '#props-input-name', select: (p) => selectNode(p, 'process'), read: (id) => `app.state.elements.find(e => e.id === '${id}').name` },
  { name: 'component notes', field: '#props-input-notes', select: (p) => selectNode(p, 'datastore'), read: (id) => `app.state.elements.find(e => e.id === '${id}').notes` },
];

for (const c of cases) {
  for (const how of ['click on empty canvas', 'click on another component']) {
    test(`${c.name} is saved after "${how}"`, async ({ page }) => {
      await openApp(page, { session: demoSession() });
      const id = await c.select(page);
      await page.click(c.field);
      await page.fill(c.field, `Typed ${c.name}`);
      if (how === 'click on empty canvas') await clickEmptyCanvas(page);
      else {
        const other = await page.evaluate((i) => app.state.elements.find((e) => e.type === 'interactor' && e.id !== i).id, id);
        const box = await page.locator(`#layers-nodes-group [data-id="${other}"]`).first().boundingBox();
        await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
        // The click must still select the other component (saving re-renders the canvas).
        expect(await page.evaluate(() => app.state.selectedElementIds)).toEqual([other]);
      }
      expect(await page.evaluate(c.read(id))).toBe(`Typed ${c.name}`);
    });
  }
}

test('data flow name and ports are saved after clicking the canvas', async ({ page }) => {
  await openApp(page, { session: demoSession() });
  const fid = await page.evaluate(() => { const f = app.state.flows[0]; app.state.selectedElementIds = []; app.state.selectedFlowId = f.id; app.refreshAppViewVisualWorkspace(); return f.id; });
  await page.fill('#props-input-name', 'Renamed flow');
  await clickEmptyCanvas(page);
  await page.evaluate((i) => { app.state.selectedFlowId = i; app.refreshAppViewVisualWorkspace(); }, fid);
  await page.fill('#props-flow-ports-input', '8443');
  await clickEmptyCanvas(page);
  expect(await page.evaluate((i) => { const f = app.state.flows.find((x) => x.id === i); return [f.name, f.ports]; }, fid)).toEqual(['Renamed flow', '8443']);
});

test('text typed into a field is saved when the page is closed without leaving the field', async ({ page }) => {
  await openApp(page, { session: demoSession() });
  const id = await selectNode(page, 'process');
  await page.fill('#props-input-name', 'Closed while typing');
  await page.reload();
  await page.waitForFunction(() => window.app && window.app.state);
  expect(await page.evaluate((i) => app.state.elements.find((e) => e.id === i).name, id)).toBe('Closed while typing');
});

test('a register row click right after editing still selects that threat\'s component', async ({ page }) => {
  await openApp(page, { session: demoSession() });
  const id = await selectNode(page, 'datastore');
  await page.fill('#props-input-notes', 'Edited notes');
  const row = page.locator('#threat-register-tbody tr').first();
  const target = await page.evaluate(() => {
    const r = document.querySelector('#threat-register-tbody tr'); return app.state.threats.find((t) => t.id === r.children[0].textContent.trim()).elementId;
  });
  await row.locator('td').nth(2).click();
  expect(await page.evaluate((i) => app.state.elements.find((e) => e.id === i).notes, id)).toBe('Edited notes');
  expect(await page.evaluate(() => app.state.selectedElementIds)).toEqual([target]);
});

test('editing fields in the threat dialog and other panels is unaffected', async ({ page }) => {
  await openApp(page, { session: demoSession() });
  await page.click('#btn-register-add-custom');
  await page.fill('#modal-threat-title', 'Dialog threat');
  await page.click('#modal-threat-desc');            // moving between fields inside the dialog
  await page.fill('#modal-threat-desc', 'Some description');
  await page.click('#btn-modal-threat-save');
  expect(await page.evaluate(() => app.state.threats.some((t) => t.title === 'Dialog threat' && t.desc === 'Some description'))).toBe(true);
});
