// Group C fixes: threat rules, analysis, reports and Mermaid (bug check of 16 November 2026).
const { test } = require('@playwright/test');
const { openApp, expect } = require('./helpers');

const P = (id, type, name, x, y, extra = {}) => Object.assign({ id, type, name, x, y, width: 100, height: 60, secProps: {} }, extra);
const sess = (elements, flows = [], threats = [], extra = {}) => Object.assign({ projectTitle: 'T', activeUser: 'Tester', elements, flows, threats }, extra);

test('#5 two-way flows: "source" of an inbound flow is the other end, never the component itself', async ({ page }) => {
  await openApp(page, { session: sess([P('p', 'process', 'Svc', 0, 0), P('e', 'interactor', 'User', 400, 0)],
    [{ id: 'f', sourceId: 'p', targetId: 'e', name: 'F', isBidirectional: true }]) });
  const r = await page.evaluate(() => {
    const p = app.state.elements.find(e => e.id === 'p'), u = app.state.elements.find(e => e.id === 'e');
    const m = app.ruleHelpers(app.computeTrustAnalysis()), ok = (c, item) => app.evaluateCondition(c, item, m).ok;
    return {
      inFromUser: ok({ inbound: { source: { type: 'interactor' } } }, p),
      inFromSelf: ok({ inbound: { source: { type: 'process' } } }, p),
      inTargetSelf: ok({ inbound: { target: { type: 'process' } } }, p),
      outToUser: ok({ outbound: { target: { type: 'interactor' } } }, p),
      userInFromP: ok({ inbound: { source: { type: 'process' } } }, u),
      userOutToP: ok({ outbound: { target: { type: 'process' } } }, u),
      userOutToSelf: ok({ outbound: { target: { type: 'interactor' } } }, u),
    };
  });
  expect(r).toEqual({ inFromUser: true, inFromSelf: false, inTargetSelf: true, outToUser: true, userInFromP: true, userOutToP: true, userOutToSelf: false });
});

test('#5 one-way flows keep their direction', async ({ page }) => {
  await openApp(page, { session: sess([P('p', 'process', 'Svc', 0, 0), P('e', 'interactor', 'User', 400, 0)],
    [{ id: 'f', sourceId: 'e', targetId: 'p', name: 'F' }]) });
  const r = await page.evaluate(() => {
    const p = app.state.elements.find(e => e.id === 'p');
    const m = app.ruleHelpers(app.computeTrustAnalysis()), ok = (c) => app.evaluateCondition(c, p, m).ok;
    return [ok({ inbound: { source: { type: 'interactor' } } }), ok({ outbound: { target: { type: 'interactor' } } })];
  });
  expect(r).toEqual([true, false]);
});

test('#6 Markdown report: model values cannot inject headings, links or list items', async ({ page }) => {
  await openApp(page, { session: sess([P('p', 'process', 'Svc', 0, 0)], [], [
    { id: 'th-001', title: 'Ok title\n# INJECTED-TITLE', category: 'Spoofing\n\n# INJECTED-CATEGORY', elementId: 'p', status: 'Open / Unmitigated', likelihood: '3', impact: '3',
      refs: ['GDPR Art. 5](https://evil.example) [x', 'CWE-79'], mitigationIds: ['M-001'], desc: 'line one\n# INJECTED-DESC\n[click](https://evil.example)' },
  ], { mitigations: [{ id: 'M-001', title: 'm\n# INJECTED-MIT', status: 'Proposed', owner: '', ticketUrl: 'https://ok.example/)[click](https://evil.example' },
    { id: 'M-002', title: 'js', status: 'Proposed', owner: '', ticketUrl: 'javascript:alert(1)' }] }) });
  const md = await page.evaluate(() => app.buildMarkdownReport());
  const lines = md.split('\n');
  expect(lines.filter(l => /^\s*#+ INJECTED/.test(l) || /^>\s*#/.test(l))).toEqual([]);
  // An unescaped "](" (an even number of backslashes before "]") pointing at the evil URL would be a live link.
  expect(lines.filter(l => /(^|[^\\])(\\\\)*\]\(<?https:\/\/evil/.test(l))).toEqual([]);
  expect(md).toContain('\\[click\\](https://evil.example)');   // shown as text
  expect(md).not.toContain('javascript:');
  // A real reference still links, and the escaped text survives as text.
  expect(md).toContain('[CWE-79](<https://cwe.mitre.org/data/definitions/79.html>)');
  expect(md).toContain('INJECTED-TITLE');
  // The ticket link is either a strict URL in <…> or no link at all.
  const ticket = lines.find(l => l.startsWith('| M-001 '));
  expect(ticket).not.toMatch(/\[link\]\((?!<)/);
});

test('#6 the reference regexes are anchored at the end', async ({ page }) => {
  await openApp(page, { session: sess([P('p', 'process', 'Svc', 0, 0)]) });
  const r = await page.evaluate(() => ['GDPR Art. 5(1)(c)', 'GDPR Art. 5 evil', 'PCI DSS 4.0 Req. 3', 'PCI DSS 6.4.3', 'PCI DSS', 'PCI DSS](x)', 'HIPAA 45 CFR 164.312(b)', 'HIPAA 45 CFR 164.312 x'].map(refLink).map(Boolean));
  expect(r).toEqual([true, false, true, true, true, false, true, false]);
});

test('#46 backticks in names do not close the Mermaid fence in the Markdown report', async ({ page }) => {
  await openApp(page, { session: sess([P('a', 'process', 'A ``` B', 0, 0), P('b', 'process', 'B', 400, 0)], [{ id: 'f', sourceId: 'a', targetId: 'b', name: 'x`y' }], [], { projectTitle: 'Proj ``` X' }) });
  const r = await page.evaluate(() => ({ md: app.buildMarkdownReport(), mm: app.buildMermaidDiagram() }));
  const block = r.md.split('```mermaid')[1].split('\n```')[0];
  expect(block).not.toContain('`');
  expect(r.mm).not.toContain('`');
  const back = await page.evaluate((t) => [...parseMermaidFlowchart(t).nodes.values()].map(n => n.label), r.mm);
  expect(back).toContain('A ``` B');
});

test('#19 Mermaid export -> import keeps a flow name containing |', async ({ page }) => {
  await openApp(page, { session: sess([P('a', 'process', 'A|1', 0, 0), P('b', 'process', 'B', 400, 0)], [{ id: 'f', sourceId: 'a', targetId: 'b', name: 'read|write' }]) });
  const r = await page.evaluate(() => {
    const g = parseMermaidFlowchart(app.buildMermaidDiagram());
    return { edges: g.edges.map(e => e.label), nodes: [...g.nodes.values()].map(n => n.label) };
  });
  expect(r).toEqual({ edges: ['read|write'], nodes: ['A|1', 'B'] });
});

test('#19 a hand-written quoted edge label may contain |', async ({ page }) => {
  await openApp(page, { session: sess([P('p', 'process', 'Svc', 0, 0)]) });
  const r = await page.evaluate(() => { const g = parseMermaidFlowchart('flowchart LR\n  a --> |"x|y"| b'); return { edges: g.edges.map(e => e.label), nodes: g.nodes.size }; });
  expect(r).toEqual({ edges: ['x|y'], nodes: 2 });
});

test('#34 mermaidLabel on crafted long labels runs in linear time', async ({ page }) => {
  await openApp(page, { session: sess([P('p', 'process', 'Svc', 0, 0)]) });
  const r = await page.evaluate(() => {
    const t = performance.now();
    mermaidLabel('<a'.repeat(50000)); mermaidLabel('<b x'.repeat(50000) + '>'); mermaidLabel('#'.repeat(100000));
    return { ms: performance.now() - t, plain: mermaidLabel('"Hi <b>there</b> #quot;x#quot;"'), long: mermaidLabel('x'.repeat(5000)).length };
  });
  expect(r.ms).toBeLessThan(200);
  expect(r.plain).toBe('Hi there "x"');
  expect(r.long).toBe(200);
});

test('#21 [name] is replaced in every title and description made from a template', async ({ page }) => {
  await openApp(page, { session: sess([P('p', 'process', 'Billing', 0, 0)]) });
  await page.waitForFunction(() => (app.threatSuggestions.process || []).length > 10);
  const r = await page.evaluate(() => {
    const item = app.state.elements[0], m = app.ruleHelpers(app.computeTrustAnalysis());
    const tpl = app.threatSuggestions.process.find(t => (t.desc || '').includes('[name]'));
    app.addRuleThreats([{ rule: Object.assign({}, tpl), reason: 'test', title: 'X', added: false, dismissed: null, item }]);
    const title = app.describeTemplate({ title: '[name] talks to [name]', category: 'Spoofing', desc: 'd' }, 'process', item, m).title;
    const manual = app.composeThreatDescription({ desc: '[name] and [name] $&', controls: ['Harden [name]'] }, '', item);
    return { desc: app.state.threats[0].desc, title, manual };
  });
  expect(r.title).toBe('Billing talks to Billing');
  expect(r.desc).not.toContain('[name]');
  expect(r.desc).toContain('Billing');
  expect(r.manual).toBe('Billing and Billing $&\n\nTypical controls:\n- Harden Billing');
});

test('#21 clicking a suggestion card fills the threat dialog with [name] replaced', async ({ page }) => {
  await openApp(page, { session: sess([P('p', 'process', 'Billing', 0, 0)]) });
  await page.waitForFunction(() => (app.threatSuggestions.process || []).length > 10);
  await page.evaluate(() => app.handleElementSelectionEvent('p'));
  await page.click('#tab-suggest-trigger');
  await page.fill('#input-templates-search', 'hangs or fails when a dependency');
  await page.locator('#box-threat-suggestions-list .template-card').first().click();
  await expect(page.locator('#modal-edit-threat')).toBeVisible();
  const desc = await page.inputValue('#modal-threat-desc');
  expect(desc).not.toContain('[name]');
  expect(desc).toContain('Billing');
});

test('#22 flowchart shapes count as components in the report, Insights and rule evaluation', async ({ page }) => {
  await openApp(page, { session: sess([P('p', 'process', 'Svc', 0, 0), P('fc', 'fc_process', 'FlowStepX', 300, 0)],
    [{ id: 'f', sourceId: 'p', targetId: 'fc', name: 'F' }], [{ id: 'th-001', title: 'T', category: 'Spoofing', elementId: 'fc', status: 'Open / Unmitigated', likelihood: '3', impact: '3' }]) });
  const r = await page.evaluate(() => ({ md: app.buildMarkdownReport(), items: [...new Set(app.evaluateAllRules().map(f => f.item.id))] }));
  expect(r.md).toMatch(/\| Components \| 2 \|/);
  expect(r.md).toMatch(/\| FlowStepX \| fc process \|/);
  expect(r.md).toContain('### FlowStepX (fc process)');
  expect(r.items).toContain('fc');
});

test('#23 attack paths do not run through a disabled component', async ({ page }) => {
  await openApp(page, { session: sess([P('e', 'interactor', 'User', 0, 0), P('p', 'process', 'Svc', 300, 0, { isDisabled: true }), P('d', 'datastore', 'DB', 600, 0, { secProps: { isCrownJewel: 'true' } })],
    [{ id: 'f1', sourceId: 'e', targetId: 'p', name: 'a' }, { id: 'f2', sourceId: 'p', targetId: 'd', name: 'b' }]) });
  const n = await page.evaluate(() => {
    const before = computeAttackPaths(app.attackPathModel()).paths.length;
    app.state.elements.find(e => e.id === 'p').isDisabled = false;
    return [before, computeAttackPaths(app.attackPathModel()).paths.length];
  });
  expect(n).toEqual([0, 1]);
});

test('#24 the register Severity column sorts by severity rank, then score', async ({ page }) => {
  const mk = (n, l, i) => ({ id: `th-00${n}`, title: 'T' + n, category: 'Spoofing', elementId: 'A', status: 'Open / Unmitigated', likelihood: String(l), impact: String(i) });
  await openApp(page, { session: sess([P('A', 'process', 'A', 0, 0)], [], [mk(1, 5, 5), mk(2, 1, 1), mk(3, 3, 2), mk(4, 4, 3), mk(5, 4, 4)]) });
  const ids = () => page.evaluate(() => { app.renderThreatRegisterTableGrid(); return [...document.querySelectorAll('#threat-register-tbody tr td:first-child')].map(td => td.textContent.trim()); });
  await page.evaluate(() => { app.currentSortColumn = 'riskLabel'; app.currentSortOrder = 'asc'; });
  expect(await ids()).toEqual(['th-002', 'th-003', 'th-004', 'th-005', 'th-001']);
  await page.evaluate(() => { app.currentSortOrder = 'desc'; });
  expect(await ids()).toEqual(['th-001', 'th-005', 'th-004', 'th-003', 'th-002']);
});

test('#30 entry points and the outside-zone warning use the zones of the shape\'s own page', async ({ page }) => {
  await openApp(page, { session: sess([P('e', 'interactor', 'User', 0, 0), P('p', 'process', 'Svc', 300, 0), P('o', 'process', 'Outside', 900, 0),
    { id: 'z', type: 'boundary', name: 'Zone', x: 250, y: -50, width: 300, height: 200 }], [{ id: 'f1', sourceId: 'e', targetId: 'p', name: 'a' }]) });
  const r = await page.evaluate(() => {
    app.addPage();
    const pg = app.state.activePageId, off = app.pageById(pg).offset;
    app.state.elements.push({ id: 'q', type: 'process', name: 'OtherPageSvc', x: off + 100, y: 0, width: 100, height: 60, secProps: {}, pageId: pg });
    app.refreshAppViewVisualWorkspace();
    const warn = app.computeModelWarnings().map(w => w.text).filter(t => t.includes('outside every trust zone'));
    return { entries: computeAttackPaths(app.attackPathModel()).entries, warn };
  });
  expect(r.entries).not.toContain('q');
  expect(r.entries).toContain('o');   // same page as the zone, outside it: still an entry point
  expect(r.warn.join(' ')).not.toContain('OtherPageSvc');
  expect(r.warn.join(' ')).toContain('Outside');
});

test('#42 name keywords: no false subtypes, intended matches still work', async ({ page }) => {
  await openApp(page, { session: sess([P('p', 'process', 'Svc', 0, 0)]) });
  const r = await page.evaluate(() => {
    const st = (type, name) => [...app.subtypesOf({ id: 'z' + name, type, name, secProps: {} })];
    const names = [['process', 'Build agent'], ['process', 'Exchange rate service'], ['datastore', 'Land registry records'], ['process', 'Demo booking service'], ['process', 'Client portal API'],
      ['process', 'AI agent'], ['process', 'LLM agent'], ['process', 'Virtual assistant'], ['process', 'Support chat assistant'], ['process', 'MS Exchange'], ['process', 'Exchange server'], ['process', 'Microsoft Exchange Online'],
      ['datastore', 'Container registry'], ['datastore', 'Artifact registry'], ['datastore', 'npm registry'], ['process', 'Demo environment'], ['process', 'Demo instance'], ['interactor', 'Client'], ['process', 'Customer portal']];
    return Object.fromEntries(names.map(([t, n]) => [n, st(t, n)]));
  });
  expect(r['Build agent']).not.toContain('llm');
  expect(r['Build agent']).toContain('ci-cd');
  expect(r['Exchange rate service']).not.toContain('email');
  expect(r['Land registry records']).not.toContain('supply-chain');
  expect(r['Demo booking service']).not.toContain('non-prod');
  expect(r['Client portal API']).not.toContain('human');
  for (const n of ['AI agent', 'LLM agent', 'Virtual assistant', 'Support chat assistant']) expect(r[n], n).toContain('llm');
  for (const n of ['MS Exchange', 'Exchange server', 'Microsoft Exchange Online']) expect(r[n], n).toContain('email');
  for (const n of ['Container registry', 'Artifact registry', 'npm registry']) expect(r[n], n).toContain('supply-chain');
  for (const n of ['Demo environment', 'Demo instance']) expect(r[n], n).toContain('non-prod');
  expect(r.Client).toContain('human');
  expect(r['Customer portal']).toContain('human');
});
