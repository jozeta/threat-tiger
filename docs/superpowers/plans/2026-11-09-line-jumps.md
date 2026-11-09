# Line Jumps and Bend Point Discoverability (feature 15) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Where two flow lines cross, the flow drawn later makes a small semicircular hop. A ☰ menu switch turns jumps off. The flow Properties panel explains bend points and can clear them.

**Architecture:**
- Three pure top-level helpers:
  - `flowPolyline` samples a flow's drawn path into points, using the same Catmull-Rom curve the renderer uses.
  - `findLineJumps` finds where a polyline crosses earlier polylines.
  - `jumpPathD` builds an SVG path with arcs at those points.
- The flow render loop keeps the polylines of flows it has already drawn. When a flow crosses any of them, its path `d` (and its hit area) is replaced by the jump path.
- The setting lives in `localStorage.line_jumps` (default on) and shows as a View item in the ☰ menu, next to Show minimap.

**Tech Stack:** Vanilla JS in `threat-tiger.html`; Playwright tests in Edge.

**Spec:** `docs/superpowers/specs/2026-11-09-diagramming-and-attack-paths-design.md` (section "15. Connectors")

## Global Constraints

- Hop radius 6 px (canvas units). Only the flow drawn later hops. Jumps are visual only and appear in PNG export (they are part of the path).
- Must stay fast: no extra work when jumps are off. Do a bounding-box pre-check per flow pair. The existing `tests/perf.spec.js` must still pass.
- Single file, `npm run sync` after inline-script edits, no new `innerHTML`, one undo step for "Clear bend points", no undo step for the view setting. Lint and full suite green. Update CHANGELOG, Help and README in the task that adds the feature. No version bump, no push.

## Review Focus

1. **Flows that share an end:** two flows leaving the same node anchor touch at their start; that is not a crossing and must not hop. Ignore crossings within 2 × radius of either flow's own start or end. Test in Task 1.
2. **Crossings close together:** two crossings closer than 2 × radius on the same flow would make overlapping arcs; keep the first and skip the next. Test in Task 1.
3. **Smooth curves:** a curved flow crossing a straight one must hop at the curve's real crossing (within a few pixels), not at the straight chord between control points. Test in Task 1.
4. **Selected flow:** a selected flow is drawn thicker and shows bend handles; its jump path must still be clickable (the hit area uses the same `d`), and clicking it to add a bend point must still work. Test in Task 2.
5. **Switch off:** with jumps off, every flow path is exactly what it was before this feature (no arcs). Test in Task 2.

---

### Task 1: Geometry helpers

**Files:** Modify `threat-tiger.html` (top-level, next to `computeAlignment`). Test: `tests/line-jumps.spec.js` (create).

**Interfaces — Produces:**
- `LINE_JUMP_RADIUS = 6`.
- `flowPolyline(startPt, controlPoints, endPt, smooth) -> [[x, y], …]`:
  - Points are `[x, y]` arrays.
  - With no control points, or with `smooth` false: the straight polyline through start, controls and end.
  - With `smooth` true: the same Catmull-Rom → cubic Bézier the renderer uses (tension 0.85, see the `const tension = 0.85` block), each cubic sampled at 12 steps.
  - Refactor the renderer to build its smooth `C` segments from one shared helper, `catmullRomBeziers(allPts) -> [[p1, cp1, cp2, p2], …]`, so the drawing and the sampling cannot drift apart.
- `findLineJumps(poly, earlierPolys, r = LINE_JUMP_RADIUS) -> [{ seg, x, y }]`:
  - `seg` is the index of the segment in `poly` that holds the crossing.
  - Ordered along `poly`.
  - Skips crossings within 2r of `poly`'s first or last point, or of the other polyline's first or last point.
  - Skips a crossing within 2r of the previous kept one.
  - Treats parallel and collinear segments as not crossing.
- `jumpPathD(poly, jumps, r = LINE_JUMP_RADIUS) -> string`:
  - `M` to the first point, then `L` segments.
  - At each jump: `L` to the point r before the crossing along the segment, `A r r 0 0 1` to the point r after it, then continue.

- [ ] **Step 1: Write the failing tests**:

```js
test('findLineJumps finds a crossing and ignores shared ends', async ({ page }) => {
  await setup(page);
  const r = await page.evaluate(() => ({
    cross: findLineJumps([[0, 50], [100, 50]], [[[50, 0], [50, 100]]]),
    sharedStart: findLineJumps([[0, 0], [100, 100]], [[[0, 0], [100, 0]]]),
    nearEnd: findLineJumps([[0, 50], [100, 50]], [[[95, 0], [95, 100]]]),
    parallel: findLineJumps([[0, 50], [100, 50]], [[[0, 60], [100, 60]]]),
  }));
  expect(r.cross).toEqual([{ seg: 0, x: 50, y: 50 }]);
  expect(r.sharedStart).toEqual([]);
  expect(r.nearEnd).toEqual([]);          // 5px from the end: within 2r
  expect(r.parallel).toEqual([]);
});

test('findLineJumps keeps crossings in path order and drops one too close to the previous', async ({ page }) => {
  await setup(page);
  const j = await page.evaluate(() => findLineJumps([[0, 50], [200, 50]], [[[150, 0], [150, 100]], [[60, 0], [60, 100]], [[66, 0], [66, 100]]]));
  expect(j.map((p) => p.x)).toEqual([60, 150]);
});

test('jumpPathD draws an arc of radius 6 at each jump', async ({ page }) => {
  await setup(page);
  const d = await page.evaluate(() => jumpPathD([[0, 50], [100, 50]], [{ seg: 0, x: 50, y: 50 }]));
  expect(d).toBe('M 0 50 L 44 50 A 6 6 0 0 1 56 50 L 100 50');
});

test('flowPolyline follows the renderer\\'s smooth curve', async ({ page }) => {
  await setup(page);
  const r = await page.evaluate(() => {
    const poly = flowPolyline([0, 0], [[100, 100]], [200, 0], true);
    const j = findLineJumps(poly, [[[0, 60], [200, 60]]]);
    return { n: poly.length, first: poly[0], last: poly[poly.length - 1], j };
  });
  expect(r.n).toBe(25);                    // 2 cubics x 12 steps + 1
  expect(r.first).toEqual([0, 0]);
  expect(r.last).toEqual([200, 0]);
  expect(r.j.length).toBe(2);              // the curve crosses y=60 on the way down and back up
  r.j.forEach((p) => expect(Math.abs(p.y - 60)).toBeLessThan(0.001));
});
```

(`setup` is the same as in `tests/align.spec.js`.)

- [ ] **Step 2: Run, expect FAIL.** Run: `npx playwright test tests/line-jumps.spec.js`. Expected: 4 failed (`findLineJumps is not defined`).
- [ ] **Step 3: Implement** `LINE_JUMP_RADIUS`, `catmullRomBeziers`, `flowPolyline`, `findLineJumps` and `jumpPathD`. Switch the renderer's smooth branch to `catmullRomBeziers`, keeping its output unchanged. Then run `npm run sync`.
- [ ] **Step 4: Run, expect PASS** (4 passed). Also run `npx playwright test tests/smoke.spec.js tests/perf.spec.js`; it must pass, which shows the renderer refactor changed nothing.

### Task 2: Render jumps, the ☰ switch, Clear bend points, docs

**Files:** Modify `threat-tiger.html` (the flow render loop, the ☰ menu View section, `#box-props-flow-routing`). Test: `tests/line-jumps.spec.js`. Docs: `CHANGELOG.md`, `README.md`.

**Interfaces:**
- **Consumes:** Task 1 helpers.
- **Produces:**
  - `app.lineJumps`: a boolean, from `localStorage.line_jumps !== 'false'` (default on).
  - `app.toggleLineJumps()`: flips the setting, stores it, sets `aria-checked` on `#btn-menu-line-jumps`, and re-renders.
  - The menu item `#btn-menu-line-jumps` (`role="menuitemcheckbox"`, label "Line jumps where flows cross", same markup as `#btn-menu-minimap`).
  - The flow render loop:
    - With `lineJumps` on, builds `flowPolyline(startPt, controlPoints, endPt, smooth)` for each flow.
    - Computes `findLineJumps(poly, drawnPolys)` against the polylines of flows already drawn in this render. Use a bounding-box pre-check: only polylines whose box overlaps this one's go in.
    - When there are jumps, sets the `d` of both `line` and `hitArea` to `jumpPathD(poly, jumps)`.
    - Then pushes `poly` onto `drawnPolys`.
    - Skips disabled flows neither as hoppers nor as obstacles. They are drawn, so they count.
  - `#btn-flow-clear-points` ("Clear bend points") in `#box-props-flow-routing`:
    - Disabled when the flow has no `points` and no `bendX`/`bendY`.
    - On click: sets `points = []` and `bendX = bendY = 0`, then logs `CHANGE` once.
  - A muted hint text right above it: "Click the line to add a bend point; drag it to move; click a point to remove it."

- [ ] **Step 1: Write the failing tests** (append):

```js
const crossing = [
  { id: 'a', type: 'process', name: 'A', x: 0, y: 200, width: 120, height: 60, secProps: {} },
  { id: 'b', type: 'process', name: 'B', x: 600, y: 200, width: 120, height: 60, secProps: {} },
  { id: 'c', type: 'process', name: 'C', x: 300, y: 0, width: 120, height: 60, secProps: {} },
  { id: 'd', type: 'process', name: 'D', x: 300, y: 500, width: 120, height: 60, secProps: {} },
];
const flows = [
  { id: 'f1', name: 'across', sourceId: 'a', targetId: 'b', sourceAnchor: 'right-2', targetAnchor: 'left-2', points: [], secProps: {} },
  { id: 'f2', name: 'down', sourceId: 'c', targetId: 'd', sourceAnchor: 'bottom-2', targetAnchor: 'top-2', points: [], secProps: {} },
];
async function setupFlows(page) {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await openApp(page, { session: demoSession((s) => { s.elements = crossing; s.flows = flows; s.threats = []; }) });
}
const d = (page, id) => page.locator(`[data-flow-id="${id}"] path.flow-line`).getAttribute('d');

test('the later flow hops over the earlier one; the hit area matches; the ☰ switch turns jumps off', async ({ page }) => {
  await setupFlows(page);
  expect(await d(page, 'f1')).not.toContain(' A ');
  expect(await d(page, 'f2')).toContain(' A 6 6 0 0 1 ');
  expect(await page.locator('[data-flow-id="f2"] path.flow-hit-area').getAttribute('d')).toBe(await d(page, 'f2'));
  await page.click('#btn-main-menu');
  await expect(page.locator('#btn-menu-line-jumps')).toHaveAttribute('aria-checked', 'true');
  await page.click('#btn-menu-line-jumps');
  expect(await d(page, 'f2')).not.toContain(' A ');
  expect(await page.evaluate(() => localStorage.getItem('line_jumps'))).toBe('false');
  expect(await page.evaluate(() => app.undoStack.length)).toBe(0);
});

test('a selected flow with a jump can still be clicked to add a bend point; Clear bend points removes them in one undo step', async ({ page }) => {
  await setupFlows(page);
  await page.evaluate(() => { app.zoomScale = 1; app.panX = 100; app.panY = 100; app.applySvgViewportTransformations(); app.handleFlowSelectionEvent('f2'); });
  const clear = page.locator('#btn-flow-clear-points');
  await expect(clear).toBeDisabled();
  const box = await page.locator('[data-flow-id="f2"] path.flow-hit-area').boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height * 0.8);
  expect(await page.evaluate(() => app.state.flows.find((f) => f.id === 'f2').points.length)).toBe(1);
  await expect(clear).toBeEnabled();
  const before = await page.evaluate(() => app.undoStack.length);
  await clear.click();
  expect(await page.evaluate(() => app.state.flows.find((f) => f.id === 'f2').points.length)).toBe(0);
  expect(await page.evaluate(() => app.undoStack.length)).toBe(before + 1);
  await expect(clear).toBeDisabled();
});
```

- [ ] **Step 2: Run, expect FAIL.** The 2 new tests fail: there is no `A` in the path, and `#btn-menu-line-jumps` is missing.
- [ ] **Step 3: Implement** the render change, the setting, the menu item, the hint and the button (wired where the other `props-flow-*` controls are wired). Then run `npm run sync`.
- [ ] **Step 4: Run, expect PASS** (6 passed).
- [ ] **Step 5: Docs.**
  - Help list: "**Line jumps:** where two flows cross, the later one hops over the other; switch it off in ☰ menu → Line jumps. **Bend points:** click a selected flow to add one, drag to move, click to remove, or use Clear bend points in Properties."
  - README canvas bullet: add "line jumps where flows cross".
  - CHANGELOG `### Added`: "Line jumps: where two flows cross, the later one hops over the other (☰ menu to switch off); flow Properties explain bend points and can clear them".
- [ ] **Step 6: Verify.** Run: `npm run sync -- --check && npm run lint && npm test`. Expected: up to date, lint clean, 176 passed.
- [ ] **Step 7: Commit** with the message "Line jumps where flows cross; Clear bend points".
