// View profiles: a "what are you modelling?" dropdown left of ☰ that picks a named visibility configuration
// (palette sections, icon sets, icon-picker groups, right/bottom panel tabs, the panels themselves), edited in
// Settings → Profiles and by the View menu. Stored in this browser only (view_profiles + active_view_profile).
const { test } = require('@playwright/test');
const H = require('./helpers');
const { expect } = H;

const FOUR = ['attack', 'data-nodes', 'flowchart', 'diagrams'];
const fresh = (page, opts = {}) => H.openApp(page, { viewProfiles: null, ...opts });
const hidden = (page, sel) => page.locator(sel).first().evaluate(e => e.classList.contains('d-none') || !!e.closest('.d-none'));
const stored = (page) => page.evaluate(() => ({ profiles: JSON.parse(localStorage.getItem('view_profiles') || 'null'), active: localStorage.getItem('active_view_profile') }));
const activeProfile = async (page) => { const s = await stored(page); return s.profiles.profiles.find(p => p.id === s.active); };
const reload = async (page) => { await page.reload(); await page.waitForFunction(() => window.app && window.app.state && window.app.viewProfiles); };
const openSettings = async (page) => { await H.clickControl(page, '#btn-settings'); await expect(page.locator('#modal-settings')).toBeVisible(); };
const chooseProfile = async (page, id) => {
  await page.click('#btn-view-profile');
  await page.click(`#menu-view-profiles [data-view-profile="${id}"]`);
};

test('by default Threat Modeling is active and hides attack paths, data nodes, flowcharts and diagrams', async ({ page }) => {
  await fresh(page);
  await expect(page.locator('#view-profile-label')).toHaveText('Threat Modeling');
  await expect(page.locator('#btn-view-profile')).toHaveAttribute('aria-label', /Threat Modeling/);
  for (const g of FOUR) expect(await hidden(page, `#paletteAccordion [data-palette-group="${g}"]`), g).toBe(true);
  expect(await hidden(page, '#paletteAccordion [data-palette-group="threat"]')).toBe(false);
  expect(await hidden(page, '#paletteAccordion [data-palette-group="text"]')).toBe(false);
  await expect(page.locator('#tab-notes-trigger')).toBeHidden();
  await expect(page.locator('#tab-register-trigger')).toBeVisible();
});

test('the built-in profiles exist and every one hides the Activity Log', async ({ page }) => {
  await fresh(page);
  const list = await page.evaluate(() => builtinViewProfiles().map(p => ({ id: p.id, name: p.name, tabs: p.hidden.tabs })));
  const names = list.map(p => p.name);
  for (const n of ['Threat Modeling', 'Attack Path Modeling', 'Architecture & Process Modeling', 'Infrastructure & Network Modeling', 'Show All']) expect(names).toContain(n);
  for (const p of list) expect(p.tabs, p.name).toContain('tab-notes-trigger');
  // the dropdown offers each of them, plus "Edit profiles…"
  await page.click('#btn-view-profile');
  await expect(page.locator('#menu-view-profiles [data-view-profile]')).toHaveCount(list.length);
  await expect(page.locator('#btn-edit-profiles')).toBeVisible();
  await expect(page.locator('#menu-view-profiles [data-view-profile="threat"]')).toHaveAttribute('aria-current', 'true');
});

test('choosing a profile applies it at once and is remembered across visits', async ({ page }) => {
  await fresh(page);
  await chooseProfile(page, 'all');
  for (const g of FOUR) expect(await hidden(page, `#paletteAccordion [data-palette-group="${g}"]`), g).toBe(false);
  await expect(page.locator('#view-profile-label')).toHaveText('Show All');
  await expect(page.locator('#tab-notes-trigger')).toBeHidden();
  await reload(page);
  await expect(page.locator('#view-profile-label')).toHaveText('Show All');
  expect(await hidden(page, '#paletteAccordion [data-palette-group="flowchart"]')).toBe(false);
  // Infrastructure shows data nodes, ready-made nodes and the cloud icon sets; hides flowcharts
  await chooseProfile(page, 'infrastructure');
  expect(await hidden(page, '#paletteAccordion [data-palette-group="data-nodes"]')).toBe(false);
  expect(await hidden(page, '#paletteAccordion [data-palette-group="ready-nodes"]')).toBe(false);
  expect(await hidden(page, '.stencil-set[data-stencil-set="aws"]')).toBe(false);
  expect(await hidden(page, '#paletteAccordion [data-palette-group="flowchart"]')).toBe(true);
  // Review & presentation hides the left panel
  await chooseProfile(page, 'review');
  await expect(page.locator('.sidebar-left')).toBeHidden();
  await chooseProfile(page, 'threat');
  await expect(page.locator('.sidebar-left')).toBeVisible();
});

test('the dropdown works with the keyboard', async ({ page }) => {
  await fresh(page);
  await page.focus('#btn-view-profile');
  await page.keyboard.press('Enter');
  await expect(page.locator('#menu-view-profiles')).toBeVisible();
  await page.keyboard.press('ArrowDown');
  // move to "Show All" and choose it with Enter
  for (let i = 0; i < 12; i++) {
    const at = await page.evaluate(() => document.activeElement && document.activeElement.dataset.viewProfile);
    if (at === 'all') break;
    await page.keyboard.press('ArrowDown');
  }
  await page.keyboard.press('Enter');
  await expect(page.locator('#view-profile-label')).toHaveText('Show All');
  await expect(page.locator('#menu-view-profiles')).toBeHidden();
});

test('the dropdown fits a 375 px phone with a 44 px touch target', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 740 });
  await fresh(page);
  const btn = page.locator('#btn-view-profile');
  await expect(btn).toBeVisible();
  const box = await btn.boundingBox();
  expect(box.width).toBeGreaterThanOrEqual(44);
  expect(box.height).toBeGreaterThanOrEqual(44);
  expect(box.x + box.width).toBeLessThanOrEqual(375);
  await btn.click();
  const menu = await page.locator('#menu-view-profiles').boundingBox();
  expect(menu.x).toBeGreaterThanOrEqual(0);
  expect(menu.x + menu.width).toBeLessThanOrEqual(375);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  await page.click('#menu-view-profiles [data-view-profile="all"]');
  await expect(btn).toHaveAttribute('aria-label', /Show All/);
});

test('"Edit profiles…" opens Settings at the profile editor, on the active profile', async ({ page }) => {
  await fresh(page);
  await page.click('#btn-view-profile');
  await page.click('#btn-edit-profiles');
  await expect(page.locator('#modal-settings')).toBeVisible();
  await expect(page.locator('#settings-profiles')).toBeInViewport();
  await expect(page.locator('#settings-profile-select')).toHaveValue('threat');
  await expect(page.locator('#settings-profile-name')).toHaveValue('Threat Modeling');
  await expect(page.locator('#settings-palette-groups input[data-palette-group="flowchart"]')).not.toBeChecked();
  await expect(page.locator('#settings-tabs-bottom input[data-settings-tab="tab-notes-trigger"]')).not.toBeChecked();
});

test('create, rename, duplicate, delete and restore profiles', async ({ page }) => {
  await fresh(page);
  await openSettings(page);
  const select = page.locator('#settings-profile-select');
  const count = async () => (await stored(page)).profiles.profiles.length;
  const before = await page.evaluate(() => app.viewProfiles.length);
  // New copies the current view
  await page.click('#btn-profile-new');
  expect(await count()).toBe(before + 1);
  const newId = await select.inputValue();
  expect(newId).not.toBe('threat');
  await expect(page.locator('#settings-profile-name')).toHaveValue('New profile');
  expect((await stored(page)).profiles.profiles.find(p => p.id === newId).hidden.palette).toEqual(expect.arrayContaining(FOUR));
  // Rename: trimmed; empty or duplicate names are refused
  await page.fill('#settings-profile-name', '   ');
  await page.click('#btn-profile-rename');
  await expect(page.locator('#settings-profile-name-error')).not.toBeEmpty();
  await page.fill('#settings-profile-name', 'show all');
  await page.click('#btn-profile-rename');
  await expect(page.locator('#settings-profile-name-error')).toContainText(/already/i);
  await page.fill('#settings-profile-name', '  Cloud review  ');
  await page.press('#settings-profile-name', 'Enter');
  await expect(page.locator('#settings-profile-name-error')).toBeEmpty();
  expect((await stored(page)).profiles.profiles.find(p => p.id === newId).name).toBe('Cloud review');
  await expect(page.locator('#settings-profile-name')).toHaveAttribute('maxlength', '40');
  // Use it: it becomes the active one in the dropdown
  await page.click('#btn-profile-activate');
  await expect(page.locator('#view-profile-label')).toHaveText('Cloud review');
  // Duplicate
  await page.click('#btn-profile-duplicate');
  expect(await count()).toBe(before + 2);
  await expect(page.locator('#settings-profile-name')).toHaveValue('Cloud review copy');
  // Delete the active one (with confirm): another profile becomes active
  await select.selectOption(newId);
  await page.click('#btn-profile-delete');
  await expect(page.locator('#settings-profile-confirm')).toBeVisible();
  await page.click('#btn-profile-confirm-yes');
  expect(await count()).toBe(before + 1);
  const s = await stored(page);
  expect(s.profiles.profiles.some(p => p.id === newId)).toBe(false);
  expect(s.profiles.profiles.some(p => p.id === s.active)).toBe(true);
  await expect(page.locator('#view-profile-label')).not.toHaveText('Cloud review');
  // Delete a built-in, then restore the defaults: built-ins return, the custom copy stays
  await select.selectOption('attack');
  await page.click('#btn-profile-delete');
  await page.click('#btn-profile-confirm-yes');
  expect((await stored(page)).profiles.profiles.some(p => p.id === 'attack')).toBe(false);
  await page.click('#btn-profile-restore');
  await page.click('#btn-profile-confirm-yes');
  const after = (await stored(page)).profiles.profiles;
  expect(after.some(p => p.id === 'attack')).toBe(true);
  expect(after.some(p => p.name === 'Cloud review copy')).toBe(true);
  // reload keeps all of it
  await reload(page);
  expect(await page.evaluate(() => app.viewProfiles.map(p => p.name))).toContain('Cloud review copy');
});

test('the last profile cannot be deleted', async ({ page }) => {
  await fresh(page, { viewProfiles: { active: 'only', profiles: [{ id: 'only', name: 'Only', hidden: {}, panels: {} }] } });
  await openSettings(page);
  await expect(page.locator('#btn-profile-delete')).toBeDisabled();
});

test('editing each category of switches applies live to the active profile', async ({ page }) => {
  await fresh(page);
  await openSettings(page);
  await page.locator('#settings-palette-groups input[data-palette-group="flowchart"]').check();
  expect(await hidden(page, '#paletteAccordion [data-palette-group="flowchart"]')).toBe(false);
  await page.locator('#settings-palette-groups input[data-palette-group="text"]').uncheck();
  expect(await hidden(page, '#paletteAccordion [data-palette-group="text"]')).toBe(true);
  await page.locator('#settings-stencil-sets input[data-settings-stencil="aws"]').uncheck();
  expect(await hidden(page, '.stencil-set[data-stencil-set="aws"]')).toBe(true);
  await page.locator('#settings-icon-groups input[data-icon-group="Databases & storage"]').uncheck();
  expect(await page.evaluate(() => app.hiddenIconGroups.has('Databases & storage'))).toBe(true);
  await page.locator('#settings-tabs-right input[data-settings-tab="tab-layers-trigger"]').uncheck();
  await expect(page.locator('#tab-layers-trigger')).toBeHidden();
  await page.locator('#settings-tabs-bottom input[data-settings-tab="tab-notes-trigger"]').check();
  await expect(page.locator('#tab-notes-trigger')).toBeAttached();
  expect(await hidden(page, '#tab-notes-trigger')).toBe(false);
  for (const [side, sel] of [['left', '.sidebar-left'], ['right', '.sidebar-right'], ['bottom', '.bottom-panel']]) {
    await page.locator(`#settings-panels input[data-settings-panel="${side}"]`).uncheck();
    expect(await hidden(page, sel), side).toBe(true);
  }
  const p = await activeProfile(page);
  expect(p.id).toBe('threat');
  expect(p.hidden.palette).toContain('text');
  expect(p.hidden.palette).not.toContain('flowchart');
  expect(p.hidden.stencils).toEqual(['aws']);
  expect(p.hidden.icons).toEqual(['Databases & storage']);
  expect(p.hidden.tabs).toEqual(['tab-layers-trigger']);
  expect(p.panels).toEqual({ left: false, right: false, bottom: false });
  // editing a profile that is not active changes nothing on screen
  await page.locator('#settings-profile-select').selectOption('all');
  await page.locator('#settings-palette-groups input[data-palette-group="erd"]').uncheck();
  expect((await stored(page)).profiles.profiles.find(x => x.id === 'all').hidden.palette).toContain('erd');
  expect(await page.evaluate(() => app.hiddenPaletteGroups.has('erd'))).toBe(false);
});

test('View menu toggles edit the active profile and persist', async ({ page }) => {
  await fresh(page);
  await H.clickControl(page, '#btn-menu-palette-flowchart');
  expect(await hidden(page, '#paletteAccordion [data-palette-group="flowchart"]')).toBe(false);
  await expect(page.locator('#btn-menu-palette-flowchart')).toHaveAttribute('aria-checked', 'true');
  await H.clickControl(page, '#btn-menu-stencil-gcp');
  await H.clickControl(page, '#btn-menu-tab-tab-notes-trigger');
  await H.clickControl(page, '#btn-menu-panel-bottom');
  const p = await activeProfile(page);
  expect(p.id).toBe('threat');
  expect(p.hidden.palette).not.toContain('flowchart');
  expect(p.hidden.stencils).toContain('gcp');
  expect(p.hidden.tabs).not.toContain('tab-notes-trigger');
  expect(p.panels.bottom).toBe(false);
  await reload(page);
  expect(await hidden(page, '#paletteAccordion [data-palette-group="flowchart"]')).toBe(false);
  expect(await hidden(page, '.stencil-set[data-stencil-set="gcp"]')).toBe(true);
  expect(await page.locator('#tab-notes-trigger').evaluate(e => e.closest('li').classList.contains('d-none'))).toBe(false);
  await expect(page.locator('.bottom-panel')).toBeHidden();
});

test('every palette section and sub-group has a View item', async ({ page }) => {
  await fresh(page);
  const r = await page.evaluate(() => ({
    groups: PALETTE_GROUPS.map(g => g[0]),
    dom: [...new Set([...document.querySelectorAll('#paletteAccordion [data-palette-group]')].map(e => e.dataset.paletteGroup))],
    menu: [...document.querySelectorAll('#menu-palette-sections [data-palette-toggle]')].map(e => e.dataset.paletteToggle),
    settings: (app.renderPaletteSettings(), [...document.querySelectorAll('#settings-palette-groups input')].map(i => i.dataset.paletteGroup)),
  }));
  expect(r.groups).toContain('threat');
  expect(r.dom.sort()).toEqual([...r.groups].sort());
  expect(r.menu).toEqual(r.groups);
  expect(r.settings).toEqual(r.groups);
});

test('bad stored profiles are ignored or cleaned', async ({ page }) => {
  await fresh(page);
  await page.evaluate(() => { localStorage.setItem('view_profiles', '{not json'); localStorage.setItem('active_view_profile', 'nope'); });
  await reload(page);
  await expect(page.locator('#view-profile-label')).toHaveText('Threat Modeling');
  // a mixed list: invalid entries dropped, unknown ids dropped, markup in a name stays text
  await page.evaluate(() => {
    localStorage.setItem('view_profiles', JSON.stringify({ version: 1, profiles: [
      { id: '__proto__', name: 'x' }, { id: 'ok', name: '<img src=x onerror="window.__pwned=1">', icon: 'javascript:alert(1)',
        hidden: { palette: ['flowchart', 'nope', 7], stencils: ['aws', 'zz'], icons: ['nope'], tabs: ['tab-notes-trigger', 'evil'] }, panels: { left: 'yes' } },
      'junk', { id: 'ok', name: 'dup id' }, { id: 'n2', name: '' }, { id: 'n3', name: 'X'.repeat(80) }] }));
    localStorage.setItem('active_view_profile', 'ok');
  });
  await reload(page);
  const v = await page.evaluate(() => app.viewProfiles.map(p => ({ id: p.id, name: p.name, icon: p.icon, hidden: p.hidden, panels: p.panels })));
  expect(v.map(p => p.id)).toEqual(['ok', 'n3']);
  expect(v[0].hidden).toEqual({ palette: ['flowchart'], stencils: ['aws'], icons: [], tabs: ['tab-notes-trigger'] });
  expect(v[0].panels).toEqual({ left: true, right: true, bottom: true });
  expect(v[0].icon).toMatch(/^bi-[a-z0-9-]+$/);
  expect(v[1].name.length).toBe(40);
  await expect(page.locator('#view-profile-label')).toHaveText('<img src=x onerror="window.__pwned=1">');
  await page.click('#btn-view-profile');
  expect(await page.locator('#menu-view-profiles img').count()).toBe(0);
  expect(await page.evaluate(() => window.__pwned)).toBeUndefined();
});

test('old hidden_* settings are migrated once into a profile of their own', async ({ page }) => {
  // an upgrade from 1.19.0: no profiles stored yet, only the old keys
  await fresh(page);
  await page.evaluate(() => {
    localStorage.removeItem('view_profiles'); localStorage.removeItem('active_view_profile');
    localStorage.setItem('hidden_tabs', JSON.stringify(['tab-layers-trigger']));
    localStorage.setItem('hidden_stencil_sets', JSON.stringify(['aws']));
    localStorage.setItem('hidden_palette_groups', JSON.stringify(['erd']));
    localStorage.setItem('hidden_icon_groups', JSON.stringify(['Web & network']));
  });
  await reload(page);
  const p = await activeProfile(page);
  expect(p.name).toBe('My previous view');
  expect(p.hidden).toEqual({ palette: ['erd'], stencils: ['aws'], icons: ['Web & network'], tabs: expect.arrayContaining(['tab-layers-trigger', 'tab-notes-trigger']) });
  await expect(page.locator('#tab-layers-trigger')).toBeHidden();
  expect(await hidden(page, '.stencil-set[data-stencil-set="aws"]')).toBe(true);
  expect(await hidden(page, '#paletteAccordion [data-palette-group="flowchart"]')).toBe(false);   // it was shown before
  expect(await page.evaluate(() => ['hidden_tabs', 'hidden_stencil_sets', 'hidden_palette_groups', 'hidden_icon_groups'].map(k => localStorage.getItem(k)))).toEqual([null, null, null, null]);
  expect((await stored(page)).profiles.profiles.some(x => x.id === 'threat')).toBe(true);    // the built-ins are there too
});

test('Session Meta & Context can be collapsed, and it is remembered', async ({ page }) => {
  await fresh(page);
  const btn = page.locator('#btn-toggle-session-meta');
  await expect(btn).toHaveAttribute('aria-expanded', 'true');
  await expect(btn).toHaveAttribute('aria-controls', 'session-meta-body');
  await expect(page.locator('#btn-open-session-meta')).toBeVisible();
  await btn.click();
  await expect(btn).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('#session-meta-body')).toBeHidden();
  await reload(page);
  await expect(page.locator('#btn-toggle-session-meta')).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('#session-meta-body')).toBeHidden();
  await page.focus('#btn-toggle-session-meta');
  await page.keyboard.press('Enter');
  await expect(page.locator('#session-meta-body')).toBeVisible();
});

test('the left panel headings are not numbered', async ({ page }) => {
  await fresh(page);
  const text = await page.locator('.sidebar-left').innerText();
  expect(text).toMatch(/Session Meta & Context/i);
  expect(text).toMatch(/Diagram Component Palette/i);
  expect(text).not.toMatch(/1\.\s*Session Meta/i);
  expect(text).not.toMatch(/2\.\s*Diagram Component Palette/i);
});

test('Clear all data forgets the profiles and the panel state', async ({ page }) => {
  await fresh(page);
  const keys = await page.evaluate(() => document.querySelector('script:not([src]):not([type])').textContent.match(/const prefs = \[[^\]]*\]/)[0]);
  for (const k of ['view_profiles', 'active_view_profile', 'session_meta_collapsed']) expect(keys).toContain(k);
});

// ── per-profile palette and panels, and the section each profile opens ─────────────────
const isOpen = (page, group) => page.locator(`#paletteAccordion [data-palette-group="${group}"] .accordion-collapse`).first().evaluate(e => e.classList.contains('show'));
const tabHidden = (page, id) => page.locator(`#${id}`).evaluate(e => e.classList.contains('d-none') || !!e.closest('.d-none'));

test('Attack Path Modeling hides Threat Modeling, templates, mitigations and insights, and opens Attack Paths', async ({ page }) => {
  await fresh(page);
  await chooseProfile(page, 'attack');
  expect(await hidden(page, '#paletteAccordion [data-palette-group="threat"]')).toBe(true);
  expect(await hidden(page, '#paletteAccordion [data-palette-group="attack"]')).toBe(false);
  await expect.poll(() => isOpen(page, 'attack')).toBe(true);
  for (const t of ['tab-suggest-trigger', 'tab-mitigations-trigger', 'tab-insights-trigger']) expect(await tabHidden(page, t), t).toBe(true);
  expect((await activeProfile(page)).hidden.tabs).not.toContain('tab-register-trigger');   // the register stays (its panel is closed)
});

test('Architecture & Process hides Threat Modeling and opens Architecture & Process Diagrams', async ({ page }) => {
  await fresh(page);
  await chooseProfile(page, 'architecture');
  expect(await hidden(page, '#paletteAccordion [data-palette-group="threat"]')).toBe(true);
  await expect.poll(() => isOpen(page, 'diagrams')).toBe(true);
});

test('Infrastructure & Network hides Threat Modeling, templates, mitigations and insights, and opens Data Nodes', async ({ page }) => {
  await fresh(page);
  await chooseProfile(page, 'infrastructure');
  expect(await hidden(page, '#paletteAccordion [data-palette-group="threat"]')).toBe(true);
  for (const t of ['tab-suggest-trigger', 'tab-mitigations-trigger', 'tab-insights-trigger']) expect(await tabHidden(page, t), t).toBe(true);
  await expect.poll(() => isOpen(page, 'data-nodes')).toBe(true);
});

test('Flowcharts opens Flowchart Diagram Items', async ({ page }) => {
  await fresh(page);
  await chooseProfile(page, 'flowchart');
  await expect.poll(() => isOpen(page, 'flowchart')).toBe(true);
});

test('Review & Presentation hides the left, right and bottom panels', async ({ page }) => {
  await fresh(page);
  await chooseProfile(page, 'review');
  await expect.poll(() => page.evaluate(() => [app.isLeftCollapsed, app.isRightCollapsed, app.isBottomCollapsed])).toEqual([true, true, true]);
});

test('the section a profile opens is editable in Settings and is applied when the profile is chosen', async ({ page }) => {
  await fresh(page);
  await openSettings(page);
  const sel = page.locator('#settings-profile-expand');
  await expect(sel).toBeVisible();
  await expect(sel).toHaveValue('threat');
  await sel.selectOption('text');
  await page.click('#modal-settings .btn-close');
  await expect(page.locator('#modal-settings')).toBeHidden();
  expect((await activeProfile(page)).expand).toBe('text');
  await chooseProfile(page, 'all'); await chooseProfile(page, 'threat');
  await expect.poll(() => isOpen(page, 'text')).toBe(true);
});

test('built-in profiles saved in format 1 get the new defaults unless the user changed them', async ({ page }) => {
  await H.openApp(page, { viewProfiles: null });
  await page.evaluate(() => {
    // what format 1 stored: the old built-ins, with Attack Path renamed by the user
    const v1 = [
      { id: 'attack', name: 'My attacks', icon: 'bi-diagram-2', hidden: { palette: ['data-nodes', 'flowchart', 'diagrams'], stencils: [], icons: [], tabs: ['tab-notes-trigger'] }, panels: { left: true, right: true, bottom: true } },
      { id: 'infrastructure', name: 'Infrastructure & Network Modeling', icon: 'bi-hdd-network', hidden: { palette: ['attack', 'flowchart', 'diagrams'], stencils: [], icons: [], tabs: ['tab-notes-trigger'] }, panels: { left: true, right: true, bottom: true } },
      { id: 'review', name: 'Review & Presentation', icon: 'bi-easel', hidden: { palette: [], stencils: [], icons: [], tabs: ['tab-notes-trigger'] }, panels: { left: false, right: true, bottom: true } },
    ];
    localStorage.setItem('view_profiles', JSON.stringify({ version: 1, profiles: v1 }));
    localStorage.setItem('active_view_profile', 'infrastructure');
  });
  await reload(page);
  const s = await stored(page);
  const by = Object.fromEntries(s.profiles.profiles.map(p => [p.id, p]));
  expect(s.profiles.version).toBe(3);
  expect(by.infrastructure.hidden.palette).toContain('threat');            // unchanged → new default
  expect(by.infrastructure.expand).toBe('data-nodes');
  expect(by.review.panels).toEqual({ left: false, right: false, bottom: false });
  expect(by.attack.name).toBe('My attacks');                              // edited → kept as it was
  expect(by.attack.hidden.palette).not.toContain('threat');
  expect(by.attack.expand).toBe('attack');                                // but it does learn which section to open
});

test('Attack Path and Infrastructure & Network also hide the bottom panel', async ({ page }) => {
  await fresh(page);
  for (const id of ['attack', 'infrastructure']) {
    await chooseProfile(page, id);
    await expect.poll(() => page.evaluate(() => app.isBottomCollapsed), id).toBe(true);
    await chooseProfile(page, 'threat');
    await expect.poll(() => page.evaluate(() => app.isBottomCollapsed)).toBe(false);
  }
});

test('built-in profiles saved in format 2 get the new defaults unless the user changed them', async ({ page }) => {
  await H.openApp(page, { viewProfiles: null });
  await page.evaluate(() => {
    const noThreat = ['tab-notes-trigger', 'tab-suggest-trigger', 'tab-mitigations-trigger', 'tab-insights-trigger'];
    const v2 = [
      { id: 'attack', name: 'Attack Path Modeling', icon: 'bi-diagram-2', expand: 'attack', hidden: { palette: ['threat', 'data-nodes', 'flowchart', 'diagrams'], stencils: [], icons: [], tabs: noThreat }, panels: { left: true, right: true, bottom: true } },
      { id: 'infrastructure', name: 'Infrastructure & Network Modeling', icon: 'bi-hdd-network', expand: 'data-nodes', hidden: { palette: ['threat', 'attack', 'flowchart', 'diagrams'], stencils: ['aws'], icons: [], tabs: noThreat }, panels: { left: true, right: true, bottom: true } },
    ];
    localStorage.setItem('view_profiles', JSON.stringify({ version: 2, profiles: v2 }));
    localStorage.setItem('active_view_profile', 'attack');
  });
  await reload(page);
  const s = await stored(page);
  const by = Object.fromEntries(s.profiles.profiles.map(p => [p.id, p]));
  expect(s.profiles.version).toBe(3);
  expect(by.attack.panels.bottom).toBe(false);            // untouched → new default
  expect(by.infrastructure.panels.bottom).toBe(true);     // the user hid AWS → kept as it was
  expect(by.infrastructure.hidden.stencils).toEqual(['aws']);
});
