// Help guide (☰ → Help, F1 / ?): table of contents, search, deep links, images and illustrations, phone layout;
// and the About & License dialog, which keeps only the version, licence and credits.
const { test } = require('@playwright/test');
const C = require('./cov-helpers');
const { expect } = C;

const GUIDE = '#modal-help-guide';
const openGuide = async (page) => { await C.clickControl(page, '#btn-help-guide'); await C.modalReady(page, 'modal-help-guide'); };
const sectionIds = (page) => page.$$eval(`${GUIDE} .tt-help-section`, (s) => s.map((x) => x.id.replace(/^help-/, '')));
/** The section starts at the top of the guide's scroll area (its heading is in view). */
const atTop = (page, id) => page.evaluate((i) => {
  const c = document.getElementById('help-content').getBoundingClientRect();
  const s = document.getElementById(`help-${i}`).getBoundingClientRect();
  const h = document.querySelector(`#help-${i} h3`).getBoundingClientRect();
  return s.top >= c.top - 2 && s.top < c.top + 60 && h.bottom <= c.bottom;
}, id);

test('☰ → Help opens the guide; its contents list every section, in order', async ({ page }) => {
  const errors = C.trackAllErrors(page);
  await C.openApp(page, { session: C.demoSession() });
  await openGuide(page);
  await expect(page.locator(GUIDE)).toBeVisible();
  await expect(page.locator('#modal-help-guide-title')).toContainText('Help guide');
  const ids = await sectionIds(page);
  expect(ids.length).toBeGreaterThanOrEqual(30);
  expect(await page.$$eval(`${GUIDE} [data-help-toc]`, (a) => a.map((x) => x.dataset.helpToc))).toEqual(ids);
  for (const must of ['getting-started', 'screen', 'palette-threat', 'palette-attack', 'palette-text', 'palette-data-nodes', 'palette-flowchart', 'palette-diagrams',
    'canvas', 'flows', 'properties', 'pages-layers', 'isometric-3d', 'threats', 'register', 'mitigations', 'insights', 'review-mode', 'legend', 'profiles', 'settings',
    'live-status', 'status-file', 'traffic', 'import-export', 'git-sync', 'history', 'shortcuts', 'privacy', 'troubleshooting']) expect(ids, must).toContain(must);
  expect(errors).toEqual([]);
});

test('About & License keeps the version, licence and credits but no longer the how-to content', async ({ page }) => {
  await C.openApp(page, { session: C.demoSession() });
  await expect(page.locator('#btn-help-trigger')).toHaveText(/About & License/);
  await C.clickControl(page, '#btn-help-trigger');
  await C.modalReady(page, 'modal-help');
  const about = page.locator('#modal-help');
  await expect(page.locator('#modal-help-title')).toContainText('About & License');
  await expect(about).toContainText(C.PKG.version);
  await expect(about).toContainText('MIT License');
  await expect(about).toContainText('Third-party icons');
  await expect(about).toContainText('github.com/jozeta/threat-tiger');
  for (const howTo of ['How Threat Tiger works', 'Quick add:', 'Format painter:', 'Swimlanes:', 'Attack paths:', 'Spoofing']) await expect(about).not.toContainText(howTo);
  // …and it points to the guide.
  await page.click('#btn-about-open-help');
  await C.modalReady(page, 'modal-help-guide');
  await expect(page.locator('#modal-help')).toBeHidden();
  expect(await atTop(page, 'getting-started')).toBe(true);
});

test('every contents entry scrolls to its section and marks itself current', async ({ page }) => {
  await C.openApp(page, { session: C.demoSession() });
  await openGuide(page);
  const ids = await sectionIds(page);
  for (const id of [...ids].reverse()) {   // bottom-up, so each jump really moves the view
    await page.click(`${GUIDE} [data-help-toc="${id}"]`);
    await expect.poll(() => atTop(page, id), id).toBe(true);
    await expect(page.locator(`${GUIDE} [data-help-toc="${id}"]`)).toHaveAttribute('aria-current', 'true');
  }
  expect(await page.evaluate(() => location.hash)).toBe('');   // contents links don't change the address
});

test('search filters sections and the contents, marks matches, and Escape clears it', async ({ page }) => {
  await C.openApp(page, { session: C.demoSession() });
  await openGuide(page);
  const all = (await sectionIds(page)).length;
  await page.fill('#help-search', 'elbow');
  const visible = () => page.$$eval(`${GUIDE} .tt-help-section:not([hidden])`, (s) => s.map((x) => x.id));
  const shown = await visible();
  expect(shown).toContain('help-flows');
  expect(shown.length).toBeLessThan(all);
  await expect(page.locator(`${GUIDE} [data-help-toc="getting-started"]`)).toBeHidden();
  await expect(page.locator(`${GUIDE} [data-help-toc="flows"]`)).toBeVisible();
  await expect(page.locator('#help-search-status')).toContainText('match');
  expect(await page.locator(`${GUIDE} mark.tt-help-hit`).count()).toBeGreaterThan(0);
  // Several words: every word must be in the section.
  await page.fill('#help-search', 'google sheet redirect');
  expect(await visible()).toEqual(expect.arrayContaining(['help-live-status']));
  await page.fill('#help-search', 'zzqxqzz');
  await expect(page.locator('#help-no-results')).toBeVisible();
  expect(await visible()).toEqual([]);
  await page.locator('#help-search').press('Escape');
  await expect(page.locator('#help-search')).toHaveValue('');
  await expect(page.locator(GUIDE)).toBeVisible();   // the first Escape only clears the search
  expect((await visible()).length).toBe(all);
  expect(await page.locator(`${GUIDE} mark.tt-help-hit`).count()).toBe(0);
});

test('deep links: app.openHelp(id), #help/<id> in the address, and "?" links next to settings', async ({ page }) => {
  const errors = C.trackAllErrors(page);
  await C.openApp(page, { session: C.demoSession() });
  expect(await page.evaluate(() => app.openHelp('live-status'))).toBe(true);
  await C.modalReady(page, 'modal-help-guide');
  await expect.poll(() => atTop(page, 'live-status')).toBe(true);
  await expect(page.locator(`${GUIDE} [data-help-toc="live-status"]`)).toHaveAttribute('aria-current', 'true');
  // Already open: jumps to the next section.
  await page.evaluate(() => app.openHelp('git-sync'));
  await expect.poll(() => atTop(page, 'git-sync')).toBe(true);
  // An unknown id just opens the guide where it is; nothing is injected.
  await page.evaluate(() => app.openHelp('<img src=x onerror=alert(1)>'));
  await page.locator(`${GUIDE} .btn-close`).click();
  await C.noModal(page);
  // A "?" link inside Settings closes Settings and opens the guide at that section.
  await C.clickControl(page, '#btn-settings');
  await C.modalReady(page, 'modal-settings');
  await page.click('#settings-tab-profiles');
  await page.click('#modal-settings [data-help-open="profiles"]');
  await C.modalReady(page, 'modal-help-guide');
  await expect(page.locator('#modal-settings')).toBeHidden();
  await expect.poll(() => atTop(page, 'profiles')).toBe(true);
  // Every "?" link names an existing section.
  const targets = await page.$$eval('[data-help-open]', (l) => l.map((x) => x.dataset.helpOpen));
  expect(targets.length).toBeGreaterThanOrEqual(6);
  const ids = await sectionIds(page);
  targets.forEach((t) => expect(ids).toContain(t));
  // #help/<id> in the address opens the guide at that section on load.
  await page.goto('/threat-tiger.html?test=true#help/shortcuts');
  await page.waitForFunction(() => window.app && window.app.state);
  await C.modalReady(page, 'modal-help-guide');
  await expect.poll(() => atTop(page, 'shortcuts')).toBe(true);
  expect(errors).toEqual([]);
});

test('every image in the guide loads from the server and has alt text; optional screenshots wait for their feature', async ({ page, request }) => {
  await C.openApp(page, { session: C.demoSession() });
  await openGuide(page);
  const imgs = await page.$$eval(`${GUIDE} img`, (list) => list.map((i) => ({ src: i.getAttribute('src'), dataSrc: i.getAttribute('data-src'), alt: i.getAttribute('alt'),
    decorative: !!i.closest('.modal-header, .tt-help-hero'), optional: !!i.closest('figure[data-help-requires]'), lazy: i.getAttribute('loading') })));
  expect(imgs.length).toBeGreaterThanOrEqual(20);
  for (const i of imgs) {
    if (!i.decorative) expect(i.alt, i.src || i.dataSrc).toBeTruthy();
    if (i.optional) continue;
    expect(i.src).toBeTruthy();
    const res = await request.get('/' + i.src);
    expect(res.status(), i.src).toBe(200);
    if (i.src.startsWith('docs/')) expect(i.lazy, i.src).toBe('lazy');
  }
  // The screenshot of a feature this build lacks stays hidden and is never requested.
  const optional = await page.$$eval(`${GUIDE} figure[data-help-requires]`, (f) => f.map((x) => ({ need: x.dataset.helpRequires, hidden: x.hidden, src: x.querySelector('img').getAttribute('src') })));
  expect(optional.length).toBeGreaterThanOrEqual(2);
  for (const o of optional) {
    const present = await page.locator(o.need).count();
    if (!present) expect(o).toMatchObject({ hidden: true, src: null });
  }
  // Sample files are offered for download by their fixed paths.
  await expect(page.locator(`${GUIDE} a[download][href="samples/status-servers.csv"]`)).toHaveCount(1);
  await expect(page.locator(`${GUIDE} a[download][href="samples/status-servers.json"]`)).toHaveCount(1);
  const hasDialog = await page.evaluate(() => typeof app.openStatusFileDialog === 'function');
  await expect(page.locator(`${GUIDE} [data-help-action="load-sample"]`)).toBeVisible({ visible: hasDialog });
});

test('every illustration is a titled, captioned figure; palette thumbnails are copies of the palette previews', async ({ page }) => {
  await C.openApp(page, { session: C.demoSession() });
  await openGuide(page);
  const svgs = await page.$$eval(`${GUIDE} .tt-help-content svg[role="img"]`, (list) => list.map((s) => {
    const ids = (s.getAttribute('aria-labelledby') || '').split(/\s+/).filter(Boolean);
    return { title: (s.querySelector('title') || {}).textContent || '', named: ids.every((i) => document.getElementById(i) && s.contains(document.getElementById(i))) && ids.length > 0,
      caption: ((s.closest('figure') || document.createElement('i')).querySelector('figcaption') || {}).textContent || '' };
  }));
  expect(svgs.length).toBeGreaterThanOrEqual(8);
  svgs.forEach((s) => { expect(s.title.length).toBeGreaterThan(10); expect(s.named).toBe(true); expect(s.caption.length).toBeGreaterThan(10); });
  // Thumbnails: each slot got a copy of its palette item's preview, without duplicate ids.
  const thumbs = await page.$$eval(`${GUIDE} [data-help-thumb]`, (l) => l.map((t) => ({ id: t.dataset.helpThumb, filled: t.children.length, ids: t.querySelectorAll('[id]').length, exists: !!document.getElementById(t.dataset.helpThumb) })));
  expect(thumbs.length).toBeGreaterThanOrEqual(50);
  thumbs.forEach((t) => expect(t, t.id).toEqual({ id: t.id, filled: 1, ids: 0, exists: true }));
});

test('F1 and ? open the guide, but not while typing or over another dialog', async ({ page }) => {
  await C.openApp(page, { session: C.demoSession() });
  await page.locator('body').click({ position: { x: 5, y: 300 } }).catch(() => {});
  await page.evaluate(() => document.activeElement && document.activeElement.blur());
  await page.keyboard.press('F1');
  await C.modalReady(page, 'modal-help-guide');
  await page.keyboard.press('Escape');
  await C.noModal(page);
  await page.evaluate(() => document.activeElement && document.activeElement.blur());
  await page.keyboard.press('Shift+?');
  await C.modalReady(page, 'modal-help-guide');
  await page.keyboard.press('Escape');
  await C.noModal(page);
  // Typing a ? in a field types it.
  await page.click('#tab-register-trigger');
  await page.locator('#filter-threat-search').fill('');
  await page.locator('#filter-threat-search').press('Shift+?');
  await expect(page.locator('#filter-threat-search')).toHaveValue('?');
  await expect(page.locator(GUIDE)).toBeHidden();
  // Over another dialog F1 does nothing (it would close that dialog and lose its input).
  await C.clickControl(page, '#btn-snapshots');
  await C.modalReady(page, 'modal-snapshots');
  await page.keyboard.press('F1');
  await page.waitForTimeout(400);
  await expect(page.locator(GUIDE)).toBeHidden();
  await expect(page.locator('#modal-snapshots')).toBeVisible();
});

test('the guide fits a 375 px phone: no sideways scrolling, a section picker instead of the side contents', async ({ page }) => {
  const errors = C.trackAllErrors(page);
  await page.setViewportSize({ width: 375, height: 760 });
  await C.openApp(page, { session: C.demoSession() });
  await page.evaluate(() => app.openHelp());
  await C.modalReady(page, 'modal-help-guide');
  await expect(page.locator(`${GUIDE} .tt-help-toc`)).toBeHidden();
  await expect(page.locator('#help-mobile-select')).toBeVisible();
  await expect(page.locator('#help-search-mobile')).toBeVisible();
  const ids = await sectionIds(page);
  for (const id of [...ids.slice(1), ids[0]]) {   // the first is selected already: visit it last
    await page.selectOption('#help-mobile-select', id);
    await expect.poll(() => atTop(page, id), id).toBe(true);
    const w = await page.evaluate(() => { const c = document.getElementById('help-content'); return { doc: document.documentElement.scrollWidth, content: c.scrollWidth, client: c.clientWidth }; });
    expect(w.doc, id).toBeLessThanOrEqual(375);
    expect(w.content, id).toBeLessThanOrEqual(w.client);
  }
  // The phone search box filters too.
  await page.fill('#help-search-mobile', 'mermaid');
  expect(await page.$$eval(`${GUIDE} .tt-help-section:not([hidden])`, (s) => s.map((x) => x.id))).toContain('help-import-export');
  expect(errors).toEqual([]);
});

test('the guide opens the demo model from Getting started', async ({ page }) => {
  await C.openApp(page);
  await page.evaluate(() => app.openHelp('getting-started'));
  await C.modalReady(page, 'modal-help-guide');
  await page.click(`${GUIDE} [data-help-action="demo"]`);
  await expect(page.locator(GUIDE)).toBeHidden();
  await expect.poll(() => page.evaluate(() => app.state.elements.length)).toBeGreaterThan(5);
});
