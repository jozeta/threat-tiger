# Attack Paths (feature 7) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Find and rank routes from entry points to crown jewels through the data flows, show them in Insights, highlight one on the canvas, and add the top 10 to the Markdown report.

**Architecture:** A pure top-level function, `computeAttackPaths(model, opts)`, does a breadth-first search for simple paths, shortest first, with a hop limit and a cap on the number of paths, then scores and ranks them. The app adds three things on top:
- an "Attack paths" card in Insights, with start and target pickers, a ranked list and the reasons for each score;
- a view-only canvas highlight, applied after each render (never saved);
- a Markdown report section.

**Tech Stack:** Vanilla JS in `threat-tiger.html`; Playwright in Edge.

**Spec:** `docs/superpowers/specs/2026-11-09-diagramming-and-attack-paths-design.md` (section "7. Attack paths", including the builder-check rulings recorded there).

## Global Constraints

- **Nodes:** `process`, `datastore`, `interactor`, `infrastructure`, `custom_image` and every `fc_*` type. Zones, boundary lines, swimlanes, text, headlines and steps are not nodes.
- **Edges:** flows that are not disabled, in their direction. Bidirectional flows count both ways. Hidden layers still count.
- **Entry points (auto):** every `interactor`. In addition, only when the model has at least one trust zone, every component that sits in no zone. Crown jewels (`secProps.isCrownJewel === 'true'`) are never entry points. Zero-hop paths don't count.
- **Targets (auto):** crown jewels. A user-chosen start and/or target replaces the automatic set.
- **Search limits:** hop limit 8; stop after 200 paths, then rank. When the search stops early, set `truncated: true`; the UI then says "More paths exist; showing the 200 shortest". The search also stops after 50 000 partial-path expansions and sets `truncated` then too.
- **Score** (higher means more dangerous; rounded to one decimal):
  - each hop over a flow that is not encrypted: +2;
  - each hop over a flow that is not authenticated: +2;
  - each threat on a node or flow of the path: likelihood × impact / 5, counted fully when "Open / Unmitigated", half when "Partially mitigated", and not at all when "Mitigated / Resolved";
  - shortness: + (8 − hops) × 1.5.
- **Explanations:** each path carries `reasons: { unencrypted, unauthenticated, openThreats, hops }`, and the UI shows them as text. The Help modal explains the score in one sentence.
- No new `innerHTML` (use `createElement` and `textContent`). The highlight is a view state with no undo step. `npm run sync`, lint and the full suite stay green. CHANGELOG, README and Help are updated. No version bump, no push.

## Review Focus

1. **Cycles:** a loop between two processes must not create endless or repeated paths, because paths are simple, with no node visited twice. Test in Task 1.
2. **No zones:** only external entities are entry points, so a model without zones does not get a path from every component. Test in Task 1.
3. **Dense graphs:** 150 nodes and 600 flows finish in under 500 ms and set `truncated` (the spec says about 200 ms; this test allows for machine load). Test in Task 1.
4. **Picked start or target removed:** if the chosen start or target is deleted, the pickers fall back to Auto and nothing throws. Test in Task 2.
5. **Highlight and other view states:** the highlight survives a re-render, and is cleared when a path's node is deleted or the user clicks Clear. Hidden-layer items stay hidden. Test in Task 2.

---

### Task 1: `computeAttackPaths`

**Files:** Modify `threat-tiger.html` (top level, near `computeAlignment`). Test: `tests/attack-paths.spec.js` (create).

**Interfaces — Produces:**
- `ATTACK_PATH_LIMITS = { hops: 8, paths: 200, expansions: 50000 }`.
- `computeAttackPaths({ elements, flows, threats, nodeZones, zoneCount }, { start, target } = {})` returns `{ paths, entries, targets, truncated }`:
  - `nodeZones` is a `Map(id -> zones[])`, as `computeTrustAnalysis()` returns it.
  - Each path is `{ nodes: [ids], flows: [ids], score, reasons }`, and `paths` is sorted by score descending, then by hops ascending.

- [ ] **Step 1: Failing tests:**

```js
const M = (extra = {}) => ({
  elements: [
    { id: 'u', type: 'interactor', name: 'User' }, { id: 'w', type: 'process', name: 'Web' },
    { id: 'a', type: 'process', name: 'API' }, { id: 'd', type: 'datastore', name: 'DB', secProps: { isCrownJewel: 'true' } },
    { id: 'z', type: 'boundary', name: 'Zone' },
  ],
  flows: [
    { id: 'f1', sourceId: 'u', targetId: 'w', secProps: { encrypted: 'true', authenticated: 'true' } },
    { id: 'f2', sourceId: 'w', targetId: 'a', secProps: {} },
    { id: 'f3', sourceId: 'a', targetId: 'd', secProps: {} },
    { id: 'f4', sourceId: 'w', targetId: 'd', secProps: { encrypted: 'true' } },
    { id: 'f5', sourceId: 'a', targetId: 'w', secProps: {} },            // a cycle w <-> a
  ],
  threats: [], zoneCount: 1, ...extra,
});
const zonesAll = (ids) => ({ nodeZones: new Map(ids.map((id) => [id, [{ id: 'z' }]])) });

test('paths run from the entry to the crown jewel, shortest first, no cycles, ranked by score', async ({ page }) => {
  await setup(page);
  const r = await page.evaluate(([m, z]) => computeAttackPaths({ ...m, nodeZones: new Map(z) }), [M(), [['w', [{ id: 'z' }]], ['a', [{ id: 'z' }]], ['d', [{ id: 'z' }]]]]);
  expect(r.entries).toEqual(['u']);                       // u is outside every zone and an interactor; d is a crown jewel
  expect(r.targets).toEqual(['d']);
  expect(r.paths.map((p) => p.nodes.join('>'))).toEqual(['u>w>a>d', 'u>w>d']);   // the longer one has two weak hops
  expect(r.paths[0].reasons).toEqual({ unencrypted: 2, unauthenticated: 2, openThreats: 0, hops: 3 });
  expect(r.paths[0].score).toBe(15.5);                     // 2*2 + 2*2 + 0 + (8-3)*1.5
  expect(r.paths[1].score).toBe(11);                       // 0 + 2 (f4 not authenticated) + 0 + (8-2)*1.5 = 11
  expect(r.truncated).toBe(false);
});

test('without zones only external entities are entries; open threats count fully, partial half', async ({ page }) => {
  await setup(page);
  const r = await page.evaluate((m) => computeAttackPaths({ ...m, nodeZones: new Map() }), M({
    zoneCount: 0,
    threats: [{ elementId: 'a', likelihood: 5, impact: 5, status: 'Open / Unmitigated' }, { elementId: 'f3', likelihood: 2, impact: 5, status: 'Partially mitigated' }, { elementId: 'w', likelihood: 5, impact: 5, status: 'Mitigated / Resolved' }],
  }));
  expect(r.entries).toEqual(['u']);
  const p = r.paths.find((x) => x.nodes.join('>') === 'u>w>a>d');
  expect(p.reasons.openThreats).toBe(2);
  expect(p.score).toBe(15.5 + 5 + 1);                      // 25/5 open + 10/5 * 0.5 partial
});

test('a picked start and target replace the automatic ones; disabled flows are ignored; bidirectional flows go both ways', async ({ page }) => {
  await setup(page);
  const r = await page.evaluate((m) => {
    m.flows.find((f) => f.id === 'f4').isDisabled = true;
    m.flows.push({ id: 'f6', sourceId: 'd', targetId: 'u', isBidirectional: true, secProps: {} });
    return computeAttackPaths({ ...m, nodeZones: new Map() }, { start: 'a', target: 'u' });
  }, M({ zoneCount: 0 }));
  expect(r.paths.map((p) => p.nodes.join('>'))).toEqual(['a>d>u', 'a>w>u'].filter((x) => x !== 'a>w>u'));  // f1 is u->w only
  expect(r.paths.some((p) => p.flows.includes('f4'))).toBe(false);
});

test('a dense model stays fast and reports truncation', async ({ page }) => {
  await setup(page);
  const r = await page.evaluate(() => {
    let seed = 3; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const elements = []; for (let i = 0; i < 150; i++) elements.push({ id: 'n' + i, type: i < 5 ? 'interactor' : 'process', name: 'N' + i, secProps: i >= 145 ? { isCrownJewel: 'true' } : {} });
    const flows = []; for (let i = 0; i < 600; i++) flows.push({ id: 'f' + i, sourceId: 'n' + Math.floor(rnd() * 150), targetId: 'n' + Math.floor(rnd() * 150), secProps: {} });
    const t0 = performance.now(); const out = computeAttackPaths({ elements, flows, threats: [], nodeZones: new Map(), zoneCount: 0 }); return { ms: performance.now() - t0, n: out.paths.length, truncated: out.truncated };
  });
  expect(r.ms).toBeLessThan(500);
  expect(r.n).toBe(200);
  expect(r.truncated).toBe(true);
});
```

(`setup` opens the app as in the other specs.)

- [ ] **Step 2: Run, expect FAIL.** **Step 3: Implement**, then `npm run sync`. **Step 4: Run, expect PASS** (4 passed).
- [ ] **Step 5: Commit** "Attack paths: search and scoring".

### Task 2: Insights card, highlight, report, docs

**Files:** Modify `threat-tiger.html` (`renderInsights`, the render pass, `buildMarkdownReport`, Help). Also modify `CHANGELOG.md` and `README.md`. Test: `tests/attack-paths.spec.js`.

**Interfaces:**
- **Consumes:** `computeAttackPaths`.
- **Produces:**
  - `app.attackPathModel()`: builds the `computeAttackPaths` input from state and `computeTrustAnalysis()`.
  - `app.attackPathChoice = { start: '', target: '' }`: view state that falls back to Auto when an id no longer exists.
  - In Insights, `#insights-attack-paths`:
    - two `<select>`s, `#attack-path-start` and `#attack-path-target`, with an "Auto" option and the components;
    - a summary line ("N paths from E entry points to T crown jewels", or a hint when there are no crown jewels: "Mark a component as a crown jewel in Properties to find attack paths.");
    - up to 20 rows `.attack-path-row`, each showing the node names joined by " → ", a score badge and a reasons line ("3 hops · 2 unencrypted · 2 unauthenticated · 1 open threat");
    - a "Show all" button when more than 20 paths exist, and the truncation note.
  - Clicking a row runs `app.highlightAttackPath(path)`:
    - it sets `this.attackPathHighlight = { nodes: Set, flows: Set }` and re-renders;
    - a post-render pass, `applyAttackPathHighlight()`, adds class `ap-dim` to every `[data-id]`/`[data-flow-id]`/`[data-owner-id]` item not on the path, and `ap-on` to those on it;
    - CSS: `.ap-dim { opacity: .2 }`, `.ap-on .flow-line { stroke: #dc3545 !important; stroke-width: 4px }`.
  - `#btn-attack-path-clear` clears the highlight.
  - The highlight is dropped automatically when any of its ids no longer exists.
  - `buildMarkdownReport` gets `## Attack paths` with the top 10 as a numbered list: names with →, score and reasons. With no crown jewels it says so.

- [ ] **Step 1: Failing test:**

```js
test('Insights lists ranked paths; picking a start filters; clicking highlights; Markdown has the section', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await openApp(page, { session: demoSession((s) => {
    s.elements = [
      { id: 'u', type: 'interactor', name: 'User', x: 0, y: 0, width: 240, height: 80, secProps: {} },
      { id: 'w', type: 'process', name: 'Web', x: 400, y: 0, width: 240, height: 80, secProps: {} },
      { id: 'd', type: 'datastore', name: 'DB', x: 800, y: 0, width: 240, height: 80, secProps: { isCrownJewel: 'true' } },
      { id: 'x', type: 'process', name: 'Other', x: 400, y: 400, width: 240, height: 80, secProps: {} },
    ];
    s.flows = [
      { id: 'f1', name: 'req', sourceId: 'u', targetId: 'w', sourceAnchor: 'right-2', targetAnchor: 'left-2', points: [], secProps: {} },
      { id: 'f2', name: 'sql', sourceId: 'w', targetId: 'd', sourceAnchor: 'right-2', targetAnchor: 'left-2', points: [], secProps: {} },
    ];
    s.threats = [];
  }) });
  await page.click('#tab-insights-trigger');
  const card = page.locator('#insights-attack-paths');
  await expect(card.locator('.attack-path-row')).toHaveCount(1);
  await expect(card.locator('.attack-path-row').first()).toContainText('User → Web → DB');
  await card.locator('.attack-path-row').first().click();
  await expect(page.locator('#layers-nodes-group [data-id="x"]').first()).toHaveClass(/ap-dim/);
  await expect(page.locator('[data-flow-id="f2"]')).toHaveClass(/ap-on/);
  await card.locator('#attack-path-start').selectOption('w');
  await expect(card.locator('.attack-path-row').first()).toContainText('Web → DB');
  await page.evaluate(() => { app.state.elements = app.state.elements.filter((e) => e.id !== 'w'); app.state.flows = app.state.flows.filter((f) => f.sourceId !== 'w' && f.targetId !== 'w'); app.refreshAppViewVisualWorkspace(); app.renderInsights(); });
  await expect(card.locator('#attack-path-start')).toHaveValue('');
  expect(await page.evaluate(() => app.attackPathHighlight)).toBeNull();
  await card.locator('#attack-path-start').selectOption('');
  const md = await page.evaluate(() => { app.state.flows.push({ id: 'f3', name: 'x', sourceId: 'u', targetId: 'd', points: [], secProps: {} }); return app.buildMarkdownReport(); });
  expect(md).toContain('## Attack paths');
  expect(md).toMatch(/1\. User → DB \(score [\d.]+/);
});
```

- [ ] **Step 2: Run, expect FAIL.** **Step 3: Implement**, then `npm run sync`. **Step 4: Run, expect PASS.**
- [ ] **Step 5: Docs.**
  - Help list: "**Attack paths:** Insights → Attack paths lists routes from entry points (external entities, and components outside every trust zone) to crown jewels, ranked by risk: unencrypted or unauthenticated hops, open threats on the way, and shorter routes score higher. Click one to highlight it."
  - README Insights bullet: add "ranked attack paths to crown jewels".
  - CHANGELOG `### Added`.
- [ ] **Step 6: Verify.** Run `npm run sync -- --check && npm run lint && npm test`; all pass. **Step 7: Commit** "Attack paths in Insights, canvas highlight and report".
