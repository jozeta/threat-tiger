// TEST-003 (SEC-001, SEC-002): payloads in every user-controlled field must never execute.
// Each payload only pushes a marker into window.__xss — nothing leaves the page.
const { test } = require('@playwright/test');
const { expect, openApp, demoSession, importJson, trackPageErrors } = require('./helpers');

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
    s.layers = [{ id: 'main', name: 'Main' }, { id: 'evil', name: P('layer')[0] }];
    s.elements.push({ id: 'el-layer', type: 'process', name: 'On evil layer', x: 3000, y: 0, width: 240, height: 80, secProps: {}, layerId: 'evil' });
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

// SEC-DOM-2: the CSP already blocks inline handlers, so "never executes" alone would not notice injected markup.
// These payloads target every value that reaches an innerHTML sink (text, quoted attributes, class, style,
// SVG fill, numbers) and the test asserts that no element or attribute was injected anywhere in the page.
const INJ = [
  '<b data-injected="text">x</b>',
  '"><b data-injected="dq">x</b>',
  "' data-injected='sq",
  'red;" data-injected="style',
];
function attributeContextModel() {
  return demoSession((s) => {
    const byType = (t) => s.elements.find((e) => e.type === t);
    s.projectTitle = INJ[0]; s.scopeDefinition = INJ[1];
    s.activityLog.unshift({ timestamp: INJ[1], operator: INJ[0], type: INJ[2], message: INJ[1] });
    const proc = byType('process');
    proc.name = INJ[1]; proc.notes = INJ[1]; proc.icon = INJ[3];
    proc.secProps = Object.assign({}, proc.secProps, { [INJ[1]]: 'true', toString: 'true', isCrownJewel: 'true' });
    const infra = byType('infrastructure');
    infra.iconColor = INJ[3]; infra.icon = INJ[1]; infra.width = INJ[3]; infra.name = INJ[2];
    const headline = byType('headline');
    headline.fontSize = INJ[3]; headline.orientation = INJ[1]; headline.name = INJ[0];
    byType('textbox').name = INJ[1];
    const step = byType('step_activity');
    step.circleColor = INJ[3]; step.stepNumber = INJ[1]; step.name = INJ[1];
    s.elements.push(Object.assign({}, step, { id: 'el-step-hidden', hideTextAndBox: true, circleColor: 'constructor', y: step.y + 200 }));
    s.elements.push(Object.assign({}, infra, { id: 'el-infra-proto', iconColor: 'constructor' }));
    const bline = byType('boundary_line');
    bline.name = INJ[0]; bline.textOffset = INJ[3]; bline.x2 = INJ[3]; bline.bendX = INJ[1];
    s.elements.push({ id: 'el-swim2', type: 'swimlane', name: INJ[1], x: 3000, y: 3000, width: 700, height: 500, columns: [INJ[1], INJ[2]], rows: [INJ[1], INJ[2]] });
    s.flows.forEach((f) => { f.name = INJ[1]; f.ports = INJ[2]; f.color = INJ[3]; f.thickness = INJ[3]; f.secProps = Object.assign({}, f.secProps, { [INJ[2]]: 'true' }); });
    s.mitigations = [
      { id: 'M-1', title: INJ[1], desc: INJ[2], owner: INJ[0], status: INJ[1], ticketUrl: 'https://example.test/" data-injected="url' },
      { id: 'M-2', title: INJ[0], desc: '', owner: '', status: 'Implemented', ticketUrl: 'javascript:void(0)' },
    ];
    s.threats.forEach((t, i) => {
      t.id = i ? `T-${i}` : INJ[1]; t.title = INJ[1]; t.category = INJ[1]; t.status = INJ[2]; t.desc = INJ[0];
      t.mitigationExplanation = INJ[1]; t.likelihood = INJ[3]; t.impact = INJ[1]; t.mitigationIds = ['M-1', 'M-2'];
    });
    s.threats.push({ id: 'T-proc', title: INJ[2], category: 'Spoofing', status: 'Mitigated / Resolved', elementId: proc.id, desc: INJ[1], mitigationExplanation: INJ[0], likelihood: 4, impact: 4, mitigationIds: ['M-1'] });
  });
}

/** Every injected element or attribute, from the whole document including foreignObject content. */
async function injectedNodes(page) {
  return page.evaluate(() => [...document.querySelectorAll('*')]
    .filter((el) => [...el.attributes].some((a) => a.name === 'data-injected' || a.name.startsWith('on')))
    .map((el) => el.outerHTML.slice(0, 160)));
}

test('payloads in attribute, style and SVG contexts never inject markup (SEC-DOM-2)', async ({ page }) => {
  const errors = trackPageErrors(page);
  await openApp(page, { session: demoSession() });
  await importJson(page, JSON.stringify(attributeContextModel()));
  const templates = { process: [{ category: 'Spoofing', title: INJ[1], desc: INJ[2], likelihood: INJ[3], impact: INJ[1], controls: [INJ[1]], example: INJ[2], refs: [INJ[1]] }], datastore: [], interactor: [], infrastructure: [], flow: [] };
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.evaluate(() => app.triggerThreatTemplatesImport())]);
  await chooser.setFiles({ name: 't.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(templates)) });
  await page.waitForTimeout(300);
  const checked = await page.evaluate(() => {
    // Select every component and flow so the inspector, swimlane editor, security switches, linked threats and
    // template cards render for each, then the register, ledger, mitigations table, report and threat popovers.
    const ids = app.state.elements.map((e) => e.id).concat(app.state.flows.map((f) => '__flow:' + f.id));
    let cards = 0;
    for (const id of ids) {
      if (id.startsWith('__flow:')) { app.state.selectedElementIds = []; app.state.selectedFlowId = id.slice(7); }
      else { app.state.selectedElementIds = [id]; app.state.selectedFlowId = null; }
      app.refreshAppViewVisualWorkspace();
      cards += document.querySelectorAll('#box-threat-suggestions-list .template-card').length;
    }
    app.renderActivityLedgerTable(true);
    app.renderMitigationTable();
    app.buildPrintThreatReport();
    document.querySelectorAll('.threat-bug-badge').forEach((b) => b.dispatchEvent(new MouseEvent('mouseenter', { clientX: 10, clientY: 10 })));
    return { cards, swimInputs: document.querySelectorAll('.col-rename-input').length, mitRows: document.querySelectorAll('#mitigation-tbody tr').length };
  });
  // The views were really rendered (otherwise the assertion below proves nothing).
  expect(checked.cards).toBeGreaterThan(0);
  expect(checked.swimInputs).toBeGreaterThan(0);
  expect(checked.mitRows).toBe(2);
  expect(await injectedNodes(page)).toEqual([]);
  // Invalid ticket addresses were dropped on import, so neither becomes a link.
  await expect(page.locator('#mitigation-tbody a.mitigation-ticket-link')).toHaveCount(0);
  expect(errors).toEqual([]);
});
