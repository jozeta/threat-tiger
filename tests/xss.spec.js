// TEST-003 (SEC-001, SEC-002): payloads in every user-controlled field must never execute.
// Each payload only pushes a marker into window.__xss — nothing leaves the page.
const { test } = require('@playwright/test');
const { expect, openApp, demoSession, importJson } = require('./helpers');

const P = (tag) => [
  `<img src=x onerror="__xss.push('${tag}')">`,
  `"><svg onload="__xss.push('${tag}')">`,
  `x' onmouseover='__xss.push("${tag}")`,
];

function poisonedModel() {
  return demoSession((s) => {
    const byType = (t) => s.elements.find((e) => e.type === t);
    s.projectTitle = P('projectTitle')[0];
    s.scopeDefinition = P('scope')[0];
    s.participants = 'Alice, ' + P('participants')[0];
    s.activeUser = P('operator')[1];
    s.activityLog.unshift({ timestamp: P('ts')[0], operator: P('logop')[0], type: P('logtype')[0], message: P('logmsg')[0] });
    byType('process').name = P('process')[0];
    byType('process').notes = P('notes')[0];
    byType('datastore').name = P('datastore')[1];
    byType('interactor').name = P('interactor')[0];
    if (byType('infrastructure')) {
      byType('infrastructure').name = P('infra')[0];
      byType('infrastructure').icon = `bi-server" onmouseover="__xss.push('icon')`;
      byType('infrastructure').iconColor = `red;" onmouseover="__xss.push('color')`;
    }
    if (byType('textbox')) byType('textbox').content = P('textbox')[0];
    if (byType('headline')) byType('headline').name = P('headline')[0];
    if (byType('boundary')) byType('boundary').name = P('boundary')[0];
    if (byType('boundary_line')) byType('boundary_line').name = P('bline')[0];
    if (byType('step_activity')) byType('step_activity').name = P('step')[0];
    s.flows[0].name = P('flow')[0];
    s.flows[0].ports = P('ports')[0];
    s.threats[0].title = P('threatTitle')[0];
    s.threats[0].category = P('threatCat')[0];
    s.threats[0].status = P('threatStatus')[0];
    s.threats[0].desc = P('threatDesc')[0];
    s.threats[0].id = P('threatId')[0];
    s.elements.push({ id: 'el-img', type: 'custom_image', name: P('imgname')[0], x: 0, y: 0, width: 80, height: 80, imageUrl: 'javascript:__xss.push("imageUrl")' });
    s.elements.push({ id: 'el-swim', type: 'swimlane', name: P('swim')[0], x: 2000, y: 2000, width: 700, height: 500, columns: [P('col')[0], 'b'], rows: [P('row')[0], 'd'] });
  });
}

async function exerciseUi(page) {
  // Touch every view that renders user data.
  await page.evaluate(async () => {
    const ids = app.state.elements.map((e) => e.id).concat(app.state.flows.map((f) => '__flow:' + f.id));
    for (const id of ids) {
      if (id.startsWith('__flow:')) { app.state.selectedElementIds = []; app.state.selectedFlowId = id.slice(7); }
      else { app.state.selectedElementIds = [id]; app.state.selectedFlowId = null; }
      app.refreshAppViewVisualWorkspace();
    }
    app.repopulateThreatModalDropdownTargets();
    app.buildPrintThreatReport && app.buildPrintThreatReport();
  });
  // Hover every element so mouseover payloads would fire.
  const targets = page.locator('#canvas-svg [data-id], .threat-bug-badge, #threat-register-tbody td');
  const n = Math.min(await targets.count(), 80);
  for (let i = 0; i < n; i++) await targets.nth(i).hover({ force: true, timeout: 500 }).catch(() => {});
  await page.waitForTimeout(200);
}

test('stored payloads in a persisted model never execute', async ({ page }) => {
  await page.addInitScript(() => { window.__xss = []; });
  await openApp(page, { session: poisonedModel() });
  await exerciseUi(page);
  expect(await page.evaluate(() => [...new Set(window.__xss)])).toEqual([]);
});

test('payloads in an imported model never execute', async ({ page }) => {
  await page.addInitScript(() => { window.__xss = []; });
  await openApp(page, { session: demoSession() });
  await importJson(page, JSON.stringify(poisonedModel()));
  await exerciseUi(page);
  expect(await page.evaluate(() => [...new Set(window.__xss)])).toEqual([]);
});

test('payloads in imported templates never execute', async ({ page }) => {
  await page.addInitScript(() => { window.__xss = []; });
  await openApp(page, { session: demoSession() });
  const templates = { process: [{ category: 'Spoofing', title: P('tplTitle')[0], desc: P('tplDesc')[0] }], datastore: [], interactor: [], infrastructure: [], flow: [] };
  // The button lives in a non-active tab, so trigger the same handler directly.
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.evaluate(() => app.triggerThreatTemplatesImport())]);
  await chooser.setFiles({ name: 't.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(templates)) });
  await page.waitForTimeout(300);
  await exerciseUi(page);
  expect(await page.evaluate(() => [...new Set(window.__xss)])).toEqual([]);
});
