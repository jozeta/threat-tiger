// Mermaid flowchart import: parser, layout, dialog (add / replace, asked each time), undo, hostile input.
const { test } = require('@playwright/test');
const { expect, openApp, demoSession, clickControl, trackPageErrors } = require('./helpers');

const empty = () => demoSession((s) => { s.elements = []; s.flows = []; s.threats = []; s.mitigations = []; });
const parse = (page, src) => page.evaluate((t) => {
  try {
    const g = parseMermaidFlowchart(t);
    return { direction: g.direction, nodes: Object.fromEntries([...g.nodes].map(([k, v]) => [k, { label: v.label, type: v.type, sub: v.sub }])), edges: g.edges, subgraphs: g.subgraphs, warnings: g.warnings };
  } catch (e) { return { error: e.message }; }
}, src);

test('parser: shapes, labels, edge syntaxes, chains, & groups, comments and fences', async ({ page }) => {
  await openApp(page, { session: empty() });
  const g = await parse(page, [
    'Some text before', '```mermaid', '%%{init: {"theme": "dark"}}%%', 'graph LR;',
    '  %% a comment',
    '  A[Rect] --> B(Round) & C([Stadium])',
    '  B -->|yes| D{Is it?}; C -- "a label" --> E[(DB)]',
    '  D -.-> F((Circle)) ==> G{{Hex}}',
    '  G --- H[/Lean/] <--> I[/Trap\\]',
    '  I --o J>Flag] --x K[["Sub #quot;q#quot; <br/> two"]]',
    '  K ~~~ L',
    '  M@{ shape: cyl, label: "New syntax" }',
    '  N:::warn --> A',
    '  classDef warn fill:#f00', '  style A fill:#0f0', '  click A "https://example.com" _blank',
    '```', 'Some text after'].join('\n'));
  expect(g.error).toBeUndefined();
  expect(g.direction).toBe('LR');
  const t = (id) => g.nodes[id].type, l = (id) => g.nodes[id].label;
  expect([t('A'), t('B'), t('C'), t('D'), t('E'), t('F'), t('G'), t('H'), t('I'), t('J'), t('K'), t('M')]).toEqual(
    ['fc_process', 'fc_process', 'fc_terminator', 'fc_decision', 'fc_database', 'fc_connector', 'fc_preparation', 'fc_data', 'fc_manual_input', 'fc_document', 'fc_process', 'fc_database']);
  expect([l('A'), l('D'), l('K'), l('L'), l('M')]).toEqual(['Rect', 'Is it?', 'Sub "q" two', 'L', 'New syntax']);
  const e = (a, b) => g.edges.find((x) => x.from === a && x.to === b);
  expect(e('A', 'B')).toBeTruthy(); expect(e('A', 'C')).toBeTruthy();
  expect(e('B', 'D').label).toBe('yes');
  expect(e('C', 'E').label).toBe('a label');
  expect(e('D', 'F').dashed).toBe(true);
  expect(e('H', 'I').bidirectional).toBe(true);
  expect(e('K', 'L')).toBeUndefined();                    // ~~~ is an invisible link
  expect(e('N', 'A')).toBeTruthy();
  expect(g.edges).toHaveLength(11);
  expect(g.warnings.join(' ')).toMatch(/click actions/);
  expect(g.warnings.join(' ')).toMatch(/styling/);
});

test('parser: subgraphs (nested, labelled), TD default, errors for other diagram types', async ({ page }) => {
  await openApp(page, { session: empty() });
  const g = await parse(page, 'flowchart\n subgraph cloud [Cloud]\n  api --> db\n  subgraph "Private net"\n   db\n   worker\n  end\n end\n client --> api\n api --> cloud');
  expect(g.direction).toBe('TD');
  expect(g.subgraphs.map((s) => [s.label, s.parent])).toEqual([['Cloud', -1], ['Private net', 0]]);
  expect([g.nodes.api.sub, g.nodes.db.sub, g.nodes.worker.sub, g.nodes.client.sub]).toEqual([0, 1, 1, -1]);   // db is mentioned in "Private net" too, so it moves there
  expect(g.nodes.cloud).toBeUndefined();                  // connection to a whole subgraph is skipped
  expect(g.warnings.join(' ')).toMatch(/whole subgraph/);
  expect((await parse(page, 'sequenceDiagram\n A->>B: hi')).error).toMatch(/Only Mermaid flowcharts/);
  expect((await parse(page, 'flowchart TD\n %% nothing')).error).toMatch(/No nodes/);
  expect((await parse(page, 'x'.repeat(200001))).error).toMatch(/too large/);
  expect((await parse(page, 'flowchart TD\n' + Array.from({ length: 501 }, (_, i) => `n${i}`).join('\n'))).error).toMatch(/more than 500 nodes/);
});

/** Imports through the real dialog. `mode` is 'add' | 'replace' | null (no choice). */
async function importViaDialog(page, src, mode) {
  await clickControl(page, '#btn-import-mermaid');
  await expect(page.locator('#modal-mermaid-import')).toBeVisible();
  await page.fill('#mermaid-import-text', src);
  if (mode) await page.check(`#mermaid-mode-${mode}`);
  await page.click('#btn-mermaid-import-go');
}
const overlap = (a, b) => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
const inside = (n, z) => n.x >= z.x && n.y >= z.y && n.x + n.width <= z.x + z.width && n.y + n.height <= z.y + z.height;
const SAMPLE = 'flowchart TD\n start([Start]) --> check{Valid?}\n check -->|yes| save[Save]\n check -->|no| err[Show error]\n err --> start\n subgraph backend [Backend]\n  save --> db[(Orders DB)]\n  save --> audit[Audit log]\n end\n subgraph ext [Partners]\n  mail[Mailer]\n end\n save -.-> mail';

for (const dir of ['TD', 'LR', 'BT', 'RL']) {
  test(`layout ${dir}: edges follow the direction, nodes never overlap, zones hold exactly their nodes`, async ({ page }) => {
    await openApp(page, { session: empty() });
    await importViaDialog(page, SAMPLE.replace('flowchart TD', `flowchart ${dir}`), null);
    await expect(page.locator('#modal-mermaid-import')).toBeHidden();
    const els = await page.evaluate(() => JSON.parse(JSON.stringify(app.state.elements)));
    const nodes = els.filter((e) => e.type.startsWith('fc_')), zones = els.filter((e) => e.type === 'boundary');
    expect(nodes).toHaveLength(7); expect(zones.map((z) => z.name).sort()).toEqual(['Backend', 'Partners']);
    for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) expect(overlap(nodes[i], nodes[j]), `${nodes[i].name} / ${nodes[j].name}`).toBe(false);
    const by = (n) => nodes.find((x) => x.name === n);
    const members = { Backend: ['Save', 'Orders DB', 'Audit log'], Partners: ['Mailer'] };
    zones.forEach((z) => nodes.forEach((n) => expect(inside(n, z), `${n.name} in ${z.name}`).toBe(members[z.name].includes(n.name))));
    expect(overlap(zones[0], zones[1])).toBe(false);
    const c = (n) => ({ x: by(n).x + by(n).width / 2, y: by(n).y + by(n).height / 2 });
    const after = { TD: (a, b) => c(b).y > c(a).y, BT: (a, b) => c(b).y < c(a).y, LR: (a, b) => c(b).x > c(a).x, RL: (a, b) => c(b).x < c(a).x }[dir];
    expect(after('Start', 'Valid?')).toBe(true); expect(after('Valid?', 'Save')).toBe(true); expect(after('Save', 'Orders DB')).toBe(true);
    const flows = await page.evaluate(() => app.state.flows.map((f) => [f.name, f.isDashed]));
    expect(flows).toHaveLength(7);
    expect(flows).toContainEqual(['yes', false]);
    expect(flows.filter((f) => f[1])).toHaveLength(1);
    // The loop back from "Show error" to "Start" leaves and enters from the side.
    const loop = await page.evaluate(() => { const by = (n) => app.state.elements.find((e) => e.name === n).id; return app.state.flows.find((f) => f.sourceId === by('Show error') && f.targetId === by('Start')); });
    const side = dir === 'LR' || dir === 'RL' ? 'bottom' : 'right';
    expect([loop.sourceAnchor, loop.targetAnchor]).toEqual([side, side]);
  });
}

test('non-empty model: asks add or replace every time; add keeps the model; replace clears it; each is one undo step', async ({ page }) => {
  await openApp(page, { session: demoSession() });
  const before = await page.evaluate(() => ({ els: app.state.elements.length, flows: app.state.flows.length, threats: app.state.threats.length }));
  expect(before.els).toBeGreaterThan(0);
  await importViaDialog(page, 'graph TD\n a --> b', null);
  await expect(page.locator('#mermaid-import-error')).toContainText('add the diagram to the current model or replace it');
  await page.check('#mermaid-mode-add'); await page.click('#btn-mermaid-import-go');
  await expect(page.locator('#modal-mermaid-import')).toBeHidden();
  const added = await page.evaluate(() => app.state.elements.filter((e) => e.id.startsWith('el-mm')));
  expect(added).toHaveLength(2);
  const maxRight = await page.evaluate(() => Math.max(...app.state.elements.filter((e) => !e.id.startsWith('el-mm') && e.type !== 'boundary_line').map((e) => e.x + (e.width || 240))));
  expect(Math.min(...added.map((e) => e.x))).toBeGreaterThan(maxRight);
  expect(await page.evaluate(() => app.state.elements.length)).toBe(before.els + 2);
  // Opening again: the choice is not remembered.
  await importViaDialog(page, 'graph TD\n x --> y', null);
  await expect(page.locator('#mermaid-import-error')).toBeVisible();
  await page.check('#mermaid-mode-replace'); await page.click('#btn-mermaid-import-go');
  expect(await page.evaluate(() => [app.state.elements.length, app.state.flows.length, app.state.threats.length])).toEqual([2, 1, 0]);
  await page.click('#btn-undo');
  expect(await page.evaluate(() => [app.state.elements.length, app.state.threats.length])).toEqual([before.els + 2, before.threats]);
  await page.click('#btn-undo');
  expect(await page.evaluate(() => app.state.elements.length)).toBe(before.els);
});

test('errors are shown in the dialog and change nothing', async ({ page }) => {
  await openApp(page, { session: empty() });
  await importViaDialog(page, 'pie title Pets\n "Dogs" : 386', null);
  await expect(page.locator('#mermaid-import-error')).toContainText('Only Mermaid flowcharts');
  await expect(page.locator('#modal-mermaid-import')).toBeVisible();
  expect(await page.evaluate(() => app.state.elements.length)).toBe(0);
});

test('hostile labels stay text; click callbacks and links are never imported', async ({ page }) => {
  const errors = trackPageErrors(page);
  let dialogs = 0; page.on('dialog', (d) => { dialogs++; d.dismiss(); });
  await openApp(page, { session: empty() });
  const src = [
    'flowchart TD',
    '  a["<img src=x onerror=window.__pwned=1>"] --> b["#lt;img src=x onerror=window.__pwned=2#gt;"]',
    '  b -->|"<script>window.__pwned=3</script>"| c["#quot;><svg onload=window.__pwned=4>"]',
    '  c --> d[javascript:window.__pwned=5]',
    '  d --> __proto__[proto] --> constructor',
    '  click a call alert(1)', '  click b href "javascript:alert(2)"',
    '  subgraph s1 ["<b onmouseover=alert(3)>zone</b>"]', '   d', '  end',
  ].join('\n');
  await importViaDialog(page, src, null);
  await expect(page.locator('#modal-mermaid-import')).toBeHidden();
  await page.waitForTimeout(300);
  const names = await page.evaluate(() => app.state.elements.map((e) => e.name));
  expect(names).toContain('<img src=x onerror=window.__pwned=2>');   // decoded entity stays literal text
  expect(names).toContain('zone');
  expect(await page.evaluate(() => [window.__pwned, Object.prototype.polluted, ({}).label])).toEqual([undefined, undefined, undefined]);
  expect(await page.locator('#canvas-svg img, #canvas-svg script, #canvas-svg [onerror], #canvas-svg [onload]').count()).toBe(0);
  expect(dialogs).toBe(0);
  expect(errors).toEqual([]);
});

test('fuzz: random Mermaid-like input either imports cleanly or fails with a readable error', async ({ page }) => {
  const errors = trackPageErrors(page);
  await openApp(page, { session: empty() });
  const r = await page.evaluate(() => {
    let seed = 1234567;
    const rnd = (n) => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };
    const parts = ['A', 'B', 'c1', 'node_x', 'é', '-->', '---', '-.->', '==>', '<-->', '--o', '~~~', '-- t -->', '|x|', '[', ']', '(', ')', '{', '}', '((', '))', '[/', '/]', '[\\', '\\]',
      '"', '#quot;', '#9999999;', '&', ';', ':::', 'subgraph', 'end', 'subgraph s [S]', 'click', 'style', '\n', ' ', '@{', 'shape: cyl', '}', '%%', '<b>', '`', 'direction LR', '__proto__'];
    const out = { ok: 0, errors: 0, bad: [] };
    for (let i = 0; i < 400; i++) {
      let t = ['flowchart TD\n', 'graph LR\n', 'flowchart\n', ''][rnd(4)];
      const n = 1 + rnd(40);
      for (let k = 0; k < n; k++) t += parts[rnd(parts.length)] + (rnd(3) ? ' ' : '');
      try {
        const g = parseMermaidFlowchart(t);
        const lay = layoutMermaidGraph(g);
        const nums = [...lay.nodes.values(), ...lay.zones].flatMap((b) => [b.x, b.y, b.w, b.h]);
        if (!nums.every(Number.isFinite) || lay.nodes.size !== g.nodes.size) out.bad.push(t);
        out.ok++;
      } catch (e) {
        if (!(e instanceof Error) || e instanceof TypeError || e instanceof RangeError) out.bad.push(`${e}: ${t}`);
        out.errors++;
      }
    }
    return out;
  });
  expect(r.bad).toEqual([]);
  expect(r.ok).toBeGreaterThan(50);
  expect(errors).toEqual([]);
});

test('a large flowchart (500 nodes) imports quickly', async ({ page }) => {
  await openApp(page, { session: empty() });
  const ms = await page.evaluate(() => {
    const lines = ['flowchart LR'];
    for (let i = 0; i < 499; i++) lines.push(`n${i}[Step ${i}] --> n${i + 1}`);
    const t0 = performance.now(); app.importMermaidFlowchart(lines.join('\n'), 'add'); return performance.now() - t0;
  });
  expect(await page.evaluate(() => app.state.elements.length)).toBe(500);
  expect(ms).toBeLessThan(5000);
});
