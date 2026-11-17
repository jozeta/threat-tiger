// Traffic animation: per-flow moving dashes or dots along a data flow, from source to target.
const { test } = require('@playwright/test');
const { expect, openApp, demoSession, downloadText } = require('./helpers');

const nodes = [
  { id: 'a', type: 'process', name: 'A', x: 0, y: 200, width: 120, height: 60, secProps: {} },
  { id: 'b', type: 'process', name: 'B', x: 600, y: 200, width: 120, height: 60, secProps: {} },
  { id: 'c', type: 'process', name: 'C', x: 300, y: 0, width: 120, height: 60, secProps: {} },
  { id: 'd', type: 'process', name: 'D', x: 300, y: 500, width: 120, height: 60, secProps: {} },
];
const baseFlows = () => [
  { id: 'f1', name: 'across', sourceId: 'a', targetId: 'b', sourceAnchor: 'right-2', targetAnchor: 'left-2', points: [], secProps: {} },
  { id: 'f2', name: 'down', sourceId: 'c', targetId: 'd', sourceAnchor: 'bottom-2', targetAnchor: 'top-2', points: [], secProps: {} },
];

async function setup(page, mutateFlows) {
  await page.setViewportSize({ width: 1600, height: 1000 });
  const flows = baseFlows();
  if (mutateFlows) mutateFlows(flows);
  await openApp(page, { session: demoSession((s) => { s.elements = nodes; s.flows = flows; s.threats = []; }) });
}
const overlays = (page, id) => page.locator(`[data-flow-id="${id}"] path.flow-traffic`);
const selectFlow = (page, id) => page.evaluate((fid) => { app.state.selectedElementIds = []; app.handleFlowSelectionEvent(fid); }, id);

test('the Properties switch adds the overlay to that flow only, one undo step per change', async ({ page }) => {
  await setup(page);
  await expect(page.locator('path.flow-traffic')).toHaveCount(0);
  await selectFlow(page, 'f1');
  await expect(page.locator('#box-props-flow-traffic')).toBeVisible();
  await expect(page.locator('#props-flow-traffic-speed')).toBeDisabled();   // nothing to tune until it's on
  const before = await page.evaluate(() => app.undoStack.length);
  await page.check('#props-flow-traffic-switch');
  await expect(overlays(page, 'f1')).toHaveCount(1);
  await expect(overlays(page, 'f2')).toHaveCount(0);
  await expect(page.locator('#props-flow-traffic-speed')).toBeEnabled();
  expect(await page.evaluate(() => app.state.flows.find((f) => f.id === 'f1').traffic)).toEqual({ on: true, speed: 'normal', style: 'dashes' });
  expect(await page.evaluate(() => app.undoStack.length)).toBe(before + 1);
  await page.selectOption('#props-flow-traffic-speed', 'fast');
  expect(await page.evaluate(() => app.undoStack.length)).toBe(before + 2);
  await page.uncheck('#props-flow-traffic-switch');
  await expect(overlays(page, 'f1')).toHaveCount(0);
  expect(await page.evaluate(() => app.undoStack.length)).toBe(before + 3);
  await page.evaluate(() => app.undo());
  await expect(overlays(page, 'f1')).toHaveCount(1);
  await expect(overlays(page, 'f1')).toHaveClass(/tt-traffic-fast/);
  // The box is for flows only.
  await page.evaluate(() => { app.state.selectedFlowId = null; app.handleElementSelectionEvent('a'); });
  await expect(page.locator('#box-props-flow-traffic')).toBeHidden();
});

test('speed and style map to the animation duration and dash pattern', async ({ page }) => {
  await setup(page, (fl) => { fl[0].traffic = { on: true, speed: 'slow', style: 'dots' }; fl[1].traffic = { on: true, speed: 'fast', style: 'dashes' }; });
  const r = await page.evaluate(() => [...document.querySelectorAll('path.flow-traffic')].map((p) => {
    const cs = getComputedStyle(p);
    return { id: p.closest('[data-flow-id]').dataset.flowId, cls: p.getAttribute('class'), dur: cs.animationDuration, name: cs.animationName, dash: cs.strokeDasharray, cap: cs.strokeLinecap, events: cs.pointerEvents };
  }));
  const f1 = r.find((x) => x.id === 'f1'), f2 = r.find((x) => x.id === 'f2');
  expect(f1.cls).toContain('tt-traffic-dots'); expect(f1.cls).toContain('tt-traffic-slow');
  expect(f1.dur).toBe('1.6s'); expect(f1.dash).toMatch(/^0(px)?,? 12(px)?$/); expect(f1.cap).toBe('round');
  expect(f2.dur).toBe('0.4s'); expect(f2.dash).toMatch(/^10(px)?,? 14(px)?$/);
  expect(f1.name).toBe('tt-traffic-run'); expect(f2.name).toBe('tt-traffic-run');
  expect(f1.events).toBe('none');
  await selectFlow(page, 'f1');
  await expect(page.locator('#props-flow-traffic-speed')).toHaveValue('slow');
  await expect(page.locator('#props-flow-traffic-style')).toHaveValue('dots');
});

test('the dashes move from source to target: the overlay starts at the source and its offset decreases', async ({ page }) => {
  await setup(page, (fl) => { fl[0].traffic = { on: true, speed: 'normal', style: 'dashes' }; fl[0].sourceId = 'b'; fl[0].targetId = 'a'; fl[0].sourceAnchor = 'left-2'; fl[0].targetAnchor = 'right-2'; });
  const r = await page.evaluate(() => {
    const p = document.querySelector('[data-flow-id="f1"] path.flow-traffic');
    const start = p.getPointAtLength(0), end = p.getPointAtLength(p.getTotalLength());
    const anim = p.getAnimations()[0]; anim.pause();
    anim.currentTime = 0; const o0 = parseFloat(getComputedStyle(p).strokeDashoffset);
    anim.currentTime = 400; const o1 = parseFloat(getComputedStyle(p).strokeDashoffset);
    return { start: start.x, end: end.x, o0, o1, sameD: p.getAttribute('d') === document.querySelector('[data-flow-id="f1"] path.flow-line').getAttribute('d') };
  });
  expect(r.start).toBeGreaterThan(r.end);   // B (right) is the source here
  expect(r.sameD).toBe(true);
  expect(r.o0).toBe(0);
  expect(r.o1).toBeCloseTo(-12, 0);          // half way through 0.8 s: half of the 24 px period, forwards
});

test('bend points, elbow and curved routes (and line jumps) animate along the drawn geometry', async ({ page }) => {
  await setup(page, (fl) => {
    fl[0].traffic = { on: true, speed: 'normal', style: 'dashes' }; fl[0].points = [{ x: 300, y: 380 }, { x: 450, y: 120 }]; fl[0].curveStyle = 'smooth';
    fl[1].traffic = { on: true, speed: 'normal', style: 'dots' }; fl[1].curveStyle = 'orthogonal';
  });
  for (const style of ['smooth', 'sharp', 'orthogonal']) {
    await page.evaluate((s) => { app.state.flows[0].curveStyle = s; app.renderSvgDiagramElements(); }, style);
    for (const id of ['f1', 'f2']) {
      const same = await page.evaluate((fid) => document.querySelector(`[data-flow-id="${fid}"] path.flow-traffic`).getAttribute('d') === document.querySelector(`[data-flow-id="${fid}"] path.flow-line`).getAttribute('d'), id);
      expect(same, `${id} ${style}`).toBe(true);
    }
  }
  // f2 crosses f1 and hops over it: the overlay hops too.
  await page.evaluate(() => { app.state.flows[0].points = []; app.state.flows[0].curveStyle = 'sharp'; app.state.flows[1].curveStyle = 'sharp'; app.renderSvgDiagramElements(); });
  expect(await overlays(page, 'f2').getAttribute('d')).toContain(' A 6 6 0 0 1 ');
});

test('a two-way flow animates both ways; a disabled flow does not animate', async ({ page }) => {
  await setup(page, (fl) => { fl[0].traffic = { on: true, speed: 'normal', style: 'dashes' }; fl[0].isBidirectional = true; fl[1].traffic = { on: true, speed: 'normal', style: 'dashes' }; fl[1].isDisabled = true; });
  await expect(overlays(page, 'f1')).toHaveCount(2);
  const dirs = await overlays(page, 'f1').evaluateAll((ps) => ps.map((p) => getComputedStyle(p).animationDirection));
  expect(dirs.sort()).toEqual(['normal', 'reverse']);
  await expect(overlays(page, 'f2')).toHaveCount(0);
});

test('View → Animate traffic pauses every flow (remembered, no undo step)', async ({ page }) => {
  await setup(page, (fl) => { fl[0].traffic = { on: true, speed: 'normal', style: 'dashes' }; fl[1].traffic = { on: true, speed: 'fast', style: 'dots' }; });
  await page.click('#btn-main-menu'); await page.click('#btn-menu-view'); await page.click('#btn-menu-canvas');
  await expect(page.locator('#btn-menu-traffic')).toHaveAttribute('aria-checked', 'true');
  const names = () => page.locator('path.flow-traffic').evaluateAll((ps) => ps.map((p) => getComputedStyle(p).animationName));
  expect(await names()).toEqual(['tt-traffic-run', 'tt-traffic-run']);
  await page.click('#btn-menu-traffic');
  await expect(page.locator('#btn-menu-traffic')).toHaveAttribute('aria-checked', 'false');
  expect(await names()).toEqual(['none', 'none']);                 // a static dashed / dotted overlay stays
  await expect(page.locator('path.flow-traffic')).toHaveCount(2);
  expect(await page.evaluate(() => localStorage.getItem('traffic_animation'))).toBe('false');
  expect(await page.evaluate(() => app.undoStack.length)).toBe(0);
  await page.reload(); await page.waitForFunction(() => window.app && window.app.state);
  expect(await names()).toEqual(['none', 'none']);
  await page.click('#btn-main-menu'); await page.click('#btn-menu-view'); await page.click('#btn-menu-canvas');
  await expect(page.locator('#btn-menu-traffic')).toHaveAttribute('aria-checked', 'false');
  await page.click('#btn-menu-traffic');
  expect(await names()).toEqual(['tt-traffic-run', 'tt-traffic-run']);
});

test('prefers-reduced-motion shows the static form', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await setup(page, (fl) => { fl[0].traffic = { on: true, speed: 'fast', style: 'dashes' }; });
  await expect(overlays(page, 'f1')).toHaveCount(1);
  const cs = await overlays(page, 'f1').evaluate((p) => ({ name: getComputedStyle(p).animationName, dash: getComputedStyle(p).strokeDasharray, n: p.getAnimations().length }));
  expect(cs.name).toBe('none'); expect(cs.n).toBe(0);
  expect(cs.dash).toMatch(/^10(px)?,? 14(px)?$/);
});

test('isometric views and the dark canvas keep the overlay on the line, in the line colour', async ({ page }) => {
  await setup(page, (fl) => { fl[0].traffic = { on: true, speed: 'normal', style: 'dots' }; fl[0].color = 'red'; });
  for (const mode of ['ne-isometric', 'nw-isometric', 'flat']) {
    await page.evaluate((m) => app.setViewMode(m), mode);
    const r = await page.evaluate(() => {
      const p = document.querySelector('[data-flow-id="f1"] path.flow-traffic'), l = document.querySelector('[data-flow-id="f1"] path.flow-line');
      return { inWrapper: !!p.closest('#isometric-wrapper'), same: p.getAttribute('d') === l.getAttribute('d'), stroke: p.getAttribute('stroke') === l.getAttribute('stroke') };
    });
    expect(r, mode).toEqual({ inWrapper: true, same: true, stroke: true });
  }
  await page.evaluate(() => app.toggleCanvasTheme());
  const dark = await page.evaluate(() => [document.querySelector('[data-flow-id="f1"] path.flow-traffic').getAttribute('stroke'), document.querySelector('[data-flow-id="f1"] path.flow-line').getAttribute('stroke')]);
  expect(dark[0]).toBe(dark[1]);
  expect(dark[0]).toBe('#ff6b6b');
});

test('PNG export leaves the overlay out; print hides it; JSON export keeps the traffic field', async ({ page }) => {
  await setup(page, (fl) => { fl[0].traffic = { on: true, speed: 'slow', style: 'dots' }; });
  await page.evaluate(() => {
    window.__svgDumps = [];
    const orig = XMLSerializer.prototype.serializeToString;
    XMLSerializer.prototype.serializeToString = function (n) { const s = orig.call(this, n); if (n && n.id === 'canvas-svg') window.__svgDumps.push(s); return s; };
  });
  await Promise.all([page.waitForEvent('download'), page.click('#btn-canvas-save-png')]);
  const dump = await page.evaluate(() => window.__svgDumps.join('\n'));
  expect(dump).toContain('flow-line');
  expect(dump).not.toMatch(/<path[^>]*flow-traffic/);
  await expect(overlays(page, 'f1')).toHaveCount(1);   // the canvas itself keeps it
  await page.emulateMedia({ media: 'print' });
  expect(await overlays(page, 'f1').evaluate((p) => getComputedStyle(p).display)).toBe('none');
  await page.emulateMedia({ media: 'screen' });
  const json = JSON.parse(await downloadText(page, '#btn-export'));
  expect(json.flows.find((f) => f.id === 'f1').traffic).toEqual({ on: true, speed: 'slow', style: 'dots' });
  expect(json.flows.find((f) => f.id === 'f2').traffic).toBeUndefined();
});

test('the normaliser keeps only known values', async ({ page }) => {
  await setup(page);
  const r = await page.evaluate(() => {
    const raw = (traffic) => ({ elements: [{ id: 'a', type: 'process', name: 'A', x: 0, y: 0 }, { id: 'b', type: 'process', name: 'B', x: 300, y: 0 }],
      flows: [{ id: 'f', sourceId: 'a', targetId: 'b', traffic }] });
    const t = (v) => normalizeSession(raw(v)).session.flows[0].traffic;
    return {
      good: t({ on: true, speed: 'fast', style: 'dots' }),
      junk: t({ on: 'yes', speed: '<img src=x onerror=alert(1)>', style: 'constructor', extra: 'x' }),
      off: t({ on: false }),
      str: t('fast'), arr: t([1]), nul: t(null),
      missing: 'traffic' in normalizeSession({ elements: raw().elements, flows: [{ id: 'f', sourceId: 'a', targetId: 'b' }] }).session.flows[0],
    };
  });
  expect(r.good).toEqual({ on: true, speed: 'fast', style: 'dots' });
  expect(r.junk).toEqual({ on: false, speed: 'normal', style: 'dashes' });
  expect(r.off).toEqual({ on: false, speed: 'normal', style: 'dashes' });
  expect(r.str).toBeUndefined(); expect(r.arr).toBeUndefined(); expect(r.nul).toBeUndefined();
  expect(r.missing).toBe(false);
});

test('review mode still lets you turn traffic on (it is a style, not layout)', async ({ page }) => {
  await setup(page);
  await page.evaluate(() => { app.state.reviewMode = true; app.refreshAppViewVisualWorkspace(); });
  await selectFlow(page, 'f2');
  await page.check('#props-flow-traffic-switch');
  await page.selectOption('#props-flow-traffic-style', 'dots');
  await expect(overlays(page, 'f2')).toHaveClass(/tt-traffic-dots/);
});

test('an in-memory override (for live status) changes the animation without touching the model', async ({ page }) => {
  await setup(page, (fl) => { fl[0].traffic = { on: true, speed: 'slow', style: 'dashes' }; });
  await page.evaluate(() => { app.trafficOverride = new Map([['f1', { speed: 'fast' }], ['f2', { on: true }]]); app.renderSvgDiagramElements(); });
  await expect(overlays(page, 'f1')).toHaveClass(/tt-traffic-fast/);
  await expect(overlays(page, 'f2')).toHaveClass(/tt-traffic-normal/);
  expect(await page.evaluate(() => [app.state.flows[0].traffic.speed, 'traffic' in app.state.flows[1]])).toEqual(['slow', false]);
  await page.evaluate(() => { app.trafficOverride = null; app.renderSvgDiagramElements(); });
  await expect(overlays(page, 'f2')).toHaveCount(0);
});

test('300 animated flows render fast', async ({ page }) => {
  await setup(page);
  const ms = await page.evaluate(() => {
    let seed = 11; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const els = []; for (let i = 0; i < 120; i++) els.push({ id: 'n' + i, type: 'process', name: 'N' + i, x: Math.round(rnd() * 4000), y: Math.round(rnd() * 3000), width: 120, height: 60, secProps: {} });
    const flows = []; for (let i = 0; i < 300; i++) flows.push({ id: 'f' + i, name: '', sourceId: 'n' + (i % 120), targetId: 'n' + ((i * 7 + 13) % 120), sourceAnchor: 'right-2', targetAnchor: 'left-2', points: [{ x: Math.round(rnd() * 4000), y: Math.round(rnd() * 3000) }], secProps: {}, curveStyle: 'smooth', traffic: { on: true, speed: ['slow', 'normal', 'fast'][i % 3], style: i % 2 ? 'dots' : 'dashes' } });
    app.state.elements = els; app.state.flows = flows; app.renderSvgDiagramElements();
    const t0 = performance.now(); for (let k = 0; k < 3; k++) app.renderSvgDiagramElements(); return (performance.now() - t0) / 3;
  });
  expect(await page.locator('path.flow-traffic').count()).toBe(300);
  expect(ms).toBeLessThan(process.env.CI ? 1500 : 800);
});
