// Trust boundaries in the Mermaid diagram (Export Mermaid diagram, Markdown report, git sync readable copy).
const { test } = require('@playwright/test');
const { expect, openApp } = require('./helpers');

const P = (id, type, name, x, y, extra = {}) => Object.assign({ id, type, name, x, y, width: 120, height: 60, secProps: {} }, extra);
const LINE = { id: 'bl', type: 'boundary_line', name: 'Internet edge', x: 400, y: 0, x2: 400, y2: 600, bendX: 0, bendY: 0 };
const session = () => ({
  projectTitle: 'T', activeUser: 'Tester', threats: [],
  elements: [P('a', 'interactor', 'Browser', 100, 200), P('b', 'process', 'Web', 600, 200), P('c', 'datastore', 'DB', 600, 450), LINE,
    { id: 'z', type: 'boundary', name: 'Internal', x: 550, y: 150, width: 300, height: 420, secProps: {} }],
  flows: [{ id: 'f1', sourceId: 'a', targetId: 'b', name: 'HTTPS', sourceAnchor: 'right', targetAnchor: 'left' },
    { id: 'f2', sourceId: 'b', targetId: 'c', name: 'SQL', sourceAnchor: 'bottom', targetAnchor: 'top' }],
});

test('flows that cross a trust boundary line are drawn red and say which boundary they cross', async ({ page }) => {
  await openApp(page, { session: session() });
  const mmd = await page.evaluate(() => app.buildMermaidDiagram());
  const edges = mmd.split('\n').filter((l) => /-->|-\.->/.test(l));
  expect(edges).toHaveLength(2);
  expect(edges[0]).toContain('crosses Internal, Internet edge');   // the zone and the line
  expect(edges[1]).not.toContain('crosses');
  expect(mmd).toMatch(/^ {4}linkStyle 0 stroke:#dc3545,stroke-width:3px/m);   // only the crossing edge (index 0)
  expect(mmd).not.toContain('not representable');
  expect(mmd).toMatch(/subgraph z1\["Internal"\]/);
});

test('the readable copy has no attack paths section; Export Markdown report keeps it', async ({ page }) => {
  await openApp(page, { session: session() });
  const [readable, report] = await page.evaluate(() => [app.buildGitReadableMarkdown('report', 'm.json'), app.buildMarkdownReport()]);
  expect(readable).not.toContain('## Attack paths');
  expect(readable).toMatch(/crosses [^"]*Internet edge/);
  expect(report).toContain('## Attack paths');
  expect(report).toMatch(/crosses [^"]*Internet edge/);
});
