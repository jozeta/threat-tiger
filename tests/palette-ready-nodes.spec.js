// Palette → Data Nodes & Icons → Ready-made nodes, and the extra icon-picker groups.
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('@playwright/test');
const H = require('./helpers');
const { expect } = H;

const CSS = fs.readFileSync(path.join(__dirname, '..', 'vendor/bootstrap-icons-1.13.2/bootstrap-icons.min.css'), 'utf8');
const EMPTY = { projectTitle: 'T', activeUser: 'Tester', flows: [], threats: [], elements: [] };

// Opens the Data Nodes section and the Ready-made nodes box.
async function openReadyNodes(page) {
  await page.click('#headingDataNodes button');
  await expect(page.locator('#collapseDataNodes')).toHaveClass(/show/);
  const toggle = page.locator('#palette-ready-nodes .ready-nodes-toggle');
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
  await expect(page.locator('#palette-ready-nodes .ready-node-item').first()).toBeVisible();
}

test('the palette lists about 30 ready-made nodes, built from READY_NODES', async ({ page }) => {
  await H.openApp(page, { session: EMPTY });
  const r = await page.evaluate(() => ({
    list: READY_NODES.map(n => n.id),
    buttons: [...document.querySelectorAll('#palette-ready-nodes .ready-node-item')].map(b => b.dataset.readyNode),
  }));
  expect(r.list.length).toBeGreaterThanOrEqual(30);
  expect(new Set(r.list).size).toBe(r.list.length);
  expect(r.buttons).toEqual(r.list);
  for (const want of ['firewall', 'waf', 'load-balancer', 'api-gateway', 'vpn-gateway', 'ids-ips', 'reverse-proxy', 'dns', 'cdn', 'switch', 'router', 'wifi-ap',
    'siem', 'edr', 'secrets-vault', 'hsm', 'idp', 'pam',
    'message-queue', 'cache', 'object-storage', 'backup', 'container', 'kubernetes', 'serverless', 'llm', 'ci-cd', 'git-repo', 'mail-server', 'workstation', 'mobile-app', 'iot-device']) {
    expect(r.list).toContain(want);
  }
});

test('every ready-made node adds the expected type, name and icon by click', async ({ page }) => {
  const errors = H.trackPageErrors(page);
  await H.openApp(page, { session: EMPTY });
  await openReadyNodes(page);
  const presets = await page.evaluate(() => READY_NODES.map(n => ({ id: n.id, type: n.type, name: n.name, icon: n.icon })));
  for (const p of presets) {
    expect(['process', 'datastore', 'interactor', 'infrastructure']).toContain(p.type);
    expect(CSS.includes(`.${p.icon}::before`), `${p.icon} exists`).toBe(true);
    const before = await page.evaluate(() => app.state.elements.length);
    await page.click(`#palette-ready-nodes [data-ready-node="${p.id}"]`);
    const added = await page.evaluate((n) => { const e = app.state.elements[n]; return e && { type: e.type, name: e.name, icon: e.icon, selected: app.state.selectedElementIds[0] === e.id }; }, before);
    expect(added, p.id).toEqual({ type: p.type, name: p.name, icon: p.icon, selected: true });
    // Same time stamp-based ids: wait a tick so the next element gets a new id.
    await page.waitForTimeout(2);
  }
  expect(await page.evaluate(() => app.state.elements.length)).toBe(presets.length);
  expect(errors).toEqual([]);
});

test('dragging a ready-made node onto the canvas adds one at the drop point; a forged payload adds nothing', async ({ page }) => {
  await H.openApp(page, { session: EMPTY });
  await openReadyNodes(page);
  // The button puts its own id in the drag data.
  const payload = await page.evaluate(() => {
    const b = document.querySelector('#palette-ready-nodes [data-ready-node="firewall"]');
    const dt = new DataTransfer();
    b.dispatchEvent(new DragEvent('dragstart', { dataTransfer: dt, bubbles: true }));
    return dt.getData(READY_NODE_DRAG_TYPE);
  });
  expect(payload).toBe('firewall');
  const r = await page.evaluate(() => {
    const drop = (value) => {
      const dt = new DataTransfer(); dt.setData(READY_NODE_DRAG_TYPE, value);
      const rect = app.dom.svg.getBoundingClientRect();
      app.dom.svg.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, clientX: rect.left + 300, clientY: rect.top + 200, bubbles: true, cancelable: true }));
      return app.state.elements.length;
    };
    const n0 = app.state.elements.length;
    const out = { ok: drop('firewall') - n0 };
    const el = app.state.elements[app.state.elements.length - 1];
    const rect = app.dom.svg.getBoundingClientRect();
    const c = app.convertClientScreenCoordinatesToCanvasSpace(rect.left + 300, rect.top + 200);
    out.centred = Math.abs(el.x + el.width / 2 - c.x) <= app.gridSize && Math.abs(el.y + el.height / 2 - c.y) <= app.gridSize;
    out.name = el.name;
    const n1 = app.state.elements.length;
    out.forged = ['constructor', '__proto__', 'process', '<img src=x onerror=alert(1)>', 'firewall ', ''].map(v => drop(v) - n1);
    return out;
  });
  expect(r).toEqual({ ok: 1, centred: true, name: 'Firewall', forged: [0, 0, 0, 0, 0, 0] });
});

test('hiding "Ready-made nodes" in Settings hides them', async ({ page }) => {
  await H.openApp(page, { session: EMPTY });
  await H.openSettingsTab(page, 'profiles');
  await expect(page.locator('#modal-settings')).toBeVisible();
  await page.locator('#settings-palette-groups input[data-palette-group="ready-nodes"]').uncheck();
  await page.keyboard.press('Escape');
  await expect(page.locator('#modal-settings')).toBeHidden();
  await page.click('#headingDataNodes button');
  await expect(page.locator('#collapseDataNodes')).toHaveClass(/show/);
  await expect(page.locator('#palette-ready-nodes')).toBeHidden();
  await expect(page.locator('#pal-infrastructure')).toBeVisible();
});

test('presets are recognised as their subtype, so they get tailored threats', async ({ page }) => {
  await H.openApp(page, { session: EMPTY });
  const r = await page.evaluate(() => {
    const out = {};
    for (const id of ['firewall', 'secrets-vault', 'siem', 'idp', 'hsm', 'mobile-app']) {
      const elId = app.addReadyNode(id);
      const el = app.state.elements.find(e => e.id === elId);
      el.name = 'Renamed';   // the subtype does not depend on the name
      out[id] = { subs: [...app.subtypesOf(el)], recognised: app.evaluateRules(el).filter(s => s.source === 'recognised').length };
    }
    return out;
  });
  expect(r.firewall.subs).toEqual(expect.arrayContaining(['network-device', 'security-control']));
  expect(r['secrets-vault'].subs).toContain('secrets');
  expect(r.siem.subs).toContain('logs');
  expect(r.idp.subs).toContain('identity');
  expect(r.hsm.subs).toContain('secrets');
  expect(r['mobile-app'].subs).toContain('mobile');
  for (const [id, v] of Object.entries(r)) expect(v.recognised, id).toBeGreaterThan(0);
});

test('review mode blocks adding a ready-made node', async ({ page }) => {
  await H.openApp(page, { session: EMPTY });
  await page.evaluate(() => app.toggleReviewMode(true));
  await openReadyNodes(page);
  await page.click('#palette-ready-nodes [data-ready-node="router"]');
  expect(await page.evaluate(() => app.state.elements.length)).toBe(0);
});

test('ready-made nodes are keyboard-reachable; Delete and arrows act on the shape added by keyboard', async ({ page }) => {
  await H.openApp(page, { session: EMPTY });
  await openReadyNodes(page);
  const item = page.locator('#palette-ready-nodes [data-ready-node="secrets-vault"]');
  await item.focus();
  await expect(item).toBeFocused();
  expect(await item.evaluate(b => b.tagName === 'BUTTON' && !!b.getAttribute('aria-label'))).toBe(true);
  await page.keyboard.press('Enter');
  const added = await page.evaluate(() => { const e = app.state.elements[0]; return e && { id: e.id, x: e.x, name: e.name }; });
  expect(added.name).toBe('Secrets Vault');
  await expect(item).toBeFocused();
  await page.keyboard.press('ArrowRight');
  expect(await page.evaluate(() => app.state.elements[0].x)).toBeGreaterThan(added.x);
  await page.keyboard.press('Delete');
  expect(await page.evaluate(() => app.state.elements.length)).toBe(0);
  // Tab moves on through the grid.
  await item.focus();
  await page.keyboard.press('Tab');
  expect(await page.evaluate(() => document.activeElement.dataset.readyNode)).toBeTruthy();
});

test('ready-made node buttons meet the touch-target size', async ({ page }) => {
  await H.openApp(page, { session: EMPTY });
  await openReadyNodes(page);
  const sizes = await page.locator('#palette-ready-nodes .ready-node-item').evaluateAll(bs => bs.map(b => { const r = b.getBoundingClientRect(); return Math.min(r.width, r.height); }));
  expect(Math.min(...sizes)).toBeGreaterThanOrEqual(44);
});

test('the new icon-picker groups exist, are offered for the right types, and every icon exists', async ({ page }) => {
  await H.openApp(page, { session: EMPTY });
  const r = await page.evaluate(() => {
    const groups = ['Attack & threat', 'Security artefacts', 'Identity & directory'];
    const out = { lib: {}, offered: {} };
    groups.forEach(g => { out.lib[g] = ICON_LIBRARY[g] || null; });
    for (const type of ['process', 'datastore', 'interactor', 'infrastructure']) {
      const sel = document.createElement('select');
      app.populateIconSelect(sel, { type, icon: '' }, []);
      out.offered[type] = [...sel.options].map(o => o.value);
    }
    out.settings = [...document.querySelectorAll('#settings-icon-groups input')].length;
    return out;
  });
  const wantLabels = {
    'Attack & threat': 14, 'Security artefacts': 14, 'Identity & directory': 15,
  };
  const all = Object.values(r.lib).flat();
  for (const [g, n] of Object.entries(wantLabels)) {
    expect(r.lib[g], g).not.toBeNull();
    expect(r.lib[g].length, g).toBe(n);
    const labels = r.lib[g].map(x => x[1]);
    expect(new Set(labels).size, `${g} labels are distinct`).toBe(labels.length);
    for (const [cls] of r.lib[g]) expect(CSS.includes(`.${cls}::before`), cls).toBe(true);
  }
  // No icon repeats across the whole library: the picker shows each icon once, so a repeat would vanish from a group.
  const every = await page.evaluate(() => Object.values(ICON_LIBRARY).flat().map(x => x[0]));
  expect(new Set(every).size).toBe(every.length);
  // Infrastructure is offered every icon of the new groups; others at least some.
  for (const [cls] of all) expect(r.offered.infrastructure, cls).toContain(cls);
  expect(r.offered.interactor).toContain('bi-mask');
  expect(r.offered.interactor).toContain('bi-person-fill');
  expect(r.offered.datastore).toContain('bi-journal-text');
  expect(r.offered.process).toContain('bi-binoculars');
});

test('icons of the new groups carry a sensible meaning for the threat engine', async ({ page }) => {
  await H.openApp(page, { session: EMPTY });
  const r = await page.evaluate(() => ({
    malware: iconSubtypesFor('bi-virus', 'interactor'),
    insider: iconSubtypesFor('bi-person-fill-exclamation', 'interactor'),
    log: iconSubtypesFor('bi-journal-text', 'datastore'),
    dc: iconSubtypesFor('bi-building-gear', 'infrastructure'),
    phish: iconSubtypesFor('bi-envelope-exclamation', 'process'),
    sbom: iconSubtypesFor('bi-file-earmark-ruled', 'datastore'),
  }));
  expect(r.malware).toContain('threat-actor');
  expect(r.insider).toEqual(expect.arrayContaining(['threat-actor', 'human']));
  expect(r.log).toContain('logs');
  expect(r.dc).toContain('identity');
  expect(r.phish).toContain('email');
  expect(r.sbom).toContain('supply-chain');
});
