// The swimlane must not change when other container types are added: its rendered DOM, computed colours and
// laid-out model are compared with a snapshot taken on the commit before the table and lane containers were
// added (fdabf08). Regenerate only when a swimlane change is intended:
//   UPDATE_SWIMLANE_SNAPSHOT=1 npx playwright test swimlane-dom
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('@playwright/test');
const { expect, openApp, demoSession } = require('./helpers');

const FILE = path.join(__dirname, 'fixtures', 'swimlane-dom.json');

function model() {
  return demoSession((s) => {
    s.elements = [
      { id: 'sl-fixed', type: 'swimlane', name: 'Fixed lanes', x: 0, y: 0, width: 760, height: 515, columns: ['Team A', 'Team B'], rows: ['Plan', 'Do'], colMins: [0, 400] },
      { id: 'sl-themed', type: 'swimlane', name: 'Themed', x: 1200, y: 0, theme: 'green-strong', columns: ['', ''], rows: ['One', 'Two', 'Three'] },
      { id: 'in-a', type: 'fc_process', name: 'A', x: 150, y: 110, width: 160, height: 60 },
      { id: 'in-b', type: 'fc_process', name: 'B', x: 500, y: 400, width: 160, height: 60 },
    ];
    s.flows = []; s.threats = [];
  });
}

const capture = (page) => page.evaluate(() => [...document.querySelectorAll('#layers-swimlanes-group > g[data-id^="sl-"]')].map((g) => g.outerHTML));
const fill = (page, id) => page.evaluate((i) => getComputedStyle(document.querySelector(`[data-id="${i}"] .swimlane-bg`)).fill, id);

test('swimlane DOM is byte-identical to the pre-change snapshot (flat, selected, dark, isometric)', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await openApp(page, { session: model() });
  const shots = {};
  shots.flat = await capture(page);
  shots.flatFill = await fill(page, 'sl-fixed');
  shots.themedFill = await fill(page, 'sl-themed');
  await page.evaluate(() => { app.state.selectedElementIds = ['sl-fixed']; app.refreshAppViewVisualWorkspace(); });
  shots.selected = await capture(page);
  await page.evaluate(() => { app.state.selectedElementIds = []; app.toggleCanvasTheme(); });
  shots.dark = await capture(page);
  shots.darkFill = await fill(page, 'sl-fixed');
  await page.evaluate(() => app.setViewMode('ne-isometric'));
  shots.iso = await capture(page);
  shots.model = await page.evaluate(() => JSON.stringify(app.state.elements.filter((e) => e.type === 'swimlane')));
  if (process.env.UPDATE_SWIMLANE_SNAPSHOT) fs.writeFileSync(FILE, JSON.stringify(shots, null, 1) + '\n');
  expect(shots).toEqual(JSON.parse(fs.readFileSync(FILE, 'utf8')));
});
