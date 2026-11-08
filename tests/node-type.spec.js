// The Type dropdown switches a node between threat-modelling and flowchart types.
const { test } = require('@playwright/test');
const { expect, openApp, demoSession } = require('./helpers');

function model() {
  return demoSession((s) => {
    s.elements = [
      { id: 'p', type: 'process', name: 'Billing API', x: 100, y: 100, width: 240, height: 80, icon: 'bi-server', notes: 'keep me',
        secProps: { runAsAdmin: 'true', loggingEnabled: 'false', handlesSensitiveData: 'true', isCrownJewel: 'true' } },
      { id: 'u', type: 'interactor', name: 'Customer', x: 500, y: 100, width: 240, height: 80, icon: 'bi-person-fill', secProps: {} },
      { id: 'z', type: 'boundary', name: 'Zone', x: 0, y: 400, width: 300, height: 200 },
    ];
    s.flows = [{ id: 'f1', name: 'calls', sourceId: 'u', targetId: 'p', sourceAnchor: 'left', targetAnchor: 'right', secProps: {} }];
    s.threats = [{ id: 'th-001', title: 'Spoofed caller', category: 'Spoofing', elementId: 'p', status: 'Open / Unmitigated', likelihood: '3', impact: '3', desc: '' }];
  });
}
const el = (page, id) => page.evaluate((i) => JSON.parse(JSON.stringify(app.state.elements.find((e) => e.id === i))), id);
const select = (page, id) => page.evaluate((i) => { app.state.selectedElementIds = [i]; app.state.selectedFlowId = null; app.refreshAppViewVisualWorkspace(); }, id);

test('changing process to data store keeps name, notes, centre, flows, threats and shared switches; one undo step', async ({ page }) => {
  await openApp(page, { session: model() });
  await select(page, 'p');
  await expect(page.locator('#props-node-type')).toBeVisible();
  await expect(page.locator('#props-node-type')).toHaveValue('process');
  expect(await page.locator('#props-node-type optgroup').evaluateAll((g) => g.map((x) => x.label))).toEqual(['Threat modelling', 'Flowchart']);
  await page.selectOption('#props-node-type', 'datastore');
  const d = await el(page, 'p');
  expect(d.type).toBe('datastore');
  expect([d.name, d.notes, d.x + d.width / 2, d.y + d.height / 2]).toEqual(['Billing API', 'keep me', 220, 140]);
  expect(d.secProps).toEqual({ auditLogged: 'false', storesCredentials: 'false', storesPii: 'false', encryptedAtRest: 'false', handlesSensitiveData: 'true', isCrownJewel: 'true' });
  expect(d.icon).toBe('bi-database-fill');                        // default icon follows the type
  expect(await page.evaluate(() => [app.state.flows[0].targetId, app.state.threats[0].elementId])).toEqual(['p', 'p']);
  await expect(page.locator('#layers-nodes-group [data-id="p"]')).toHaveCount(1);
  // Spoofing does not fit a data store: flagged in model checks.
  expect(await page.evaluate(() => app.computeModelWarnings().filter((w) => w.code === 'MC-STRIDE-FIT').map((w) => w.id))).toEqual(['p']);
  await page.click('#btn-undo');
  const back = await el(page, 'p');
  expect(back.type).toBe('process');
  expect(back.secProps.runAsAdmin).toBe('true');
  expect(await page.evaluate(() => app.computeModelWarnings().filter((w) => w.code === 'MC-STRIDE-FIT'))).toEqual([]);
});

test('switching to a flowchart shape and back; a customised icon is kept between model types', async ({ page }) => {
  await openApp(page, { session: model() });
  await page.evaluate(() => { app.state.elements.find((e) => e.id === 'p').icon = 'bi-cloud'; });
  await select(page, 'p');
  await page.selectOption('#props-node-type', 'infrastructure');
  expect((await el(page, 'p')).icon).toBe('bi-cloud');                // customised icon kept between model types
  await page.selectOption('#props-node-type', 'fc_decision');
  let n = await el(page, 'p');
  expect([n.type, n.width, n.height, n.fcFillColor, n.fcStrokeColor, n.secProps, n.icon, n.iconColor]).toEqual(['fc_decision', 160, 100, '#fef3c7', '#92400e', undefined, undefined, undefined]);
  await expect(page.locator('#props-node-type')).toHaveValue('fc_decision');
  await expect(page.locator('#box-props-flowchart')).toBeVisible();
  await page.selectOption('#props-node-type', 'interactor');
  n = await el(page, 'p');
  expect([n.type, n.icon, Object.keys(n.secProps).sort()]).toEqual(['interactor', 'bi-person-fill', ['isPrivilegedUser', 'mfaRequired', 'unauthAccess', 'vpnRequired']]);
});

test('the Type dropdown is not shown for zones, and a bad type change is refused', async ({ page }) => {
  await openApp(page, { session: model() });
  await select(page, 'z');
  await expect(page.locator('#box-props-node-type')).toBeHidden();
  expect(await page.evaluate(() => [app.changeNodeType('z', 'process'), app.changeNodeType('p', 'boundary'), app.changeNodeType('p', '__proto__')])).toEqual([false, false, false]);
  expect((await el(page, 'p')).type).toBe('process');
});
