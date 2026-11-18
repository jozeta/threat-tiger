// ☰ → Import threat model from git…: paste a GitHub/GitLab link to a JSON file; it is downloaded and opened.
const { test } = require('@playwright/test');
const { expect, openApp, demoSession, clickControl } = require('./helpers');

const TOKEN = 'ghp_IMPORTTOKEN0123456789';   // secret-scan:allow (fake test token)
const model = (title) => JSON.stringify(demoSession((s) => { s.projectTitle = title; }));
const cors = { 'access-control-allow-origin': '*' };

/** GitHub contents API: public.json for anyone, private.json only with the token. */
async function fakeGitHubFiles(page) {
  const calls = [];
  await page.route('https://api.github.com/**', async (route) => {
    const req = route.request(), url = new URL(req.url());
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { ...cors, 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET, OPTIONS' } });
    calls.push({ path: url.pathname, ref: url.searchParams.get('ref'), auth: req.headers()['authorization'] || null });
    const ok = (title) => route.fulfill({ headers: cors, json: { sha: 'a'.repeat(40), encoding: 'base64', content: Buffer.from(model(title)).toString('base64') } });
    if (url.pathname === '/repos/acme/models/contents/docs/public.json') return ok('From GitHub');
    if (url.pathname === '/repos/acme/models/contents/private.json' && req.headers()['authorization'] === `Bearer ${TOKEN}`) return ok('Private model');
    if (url.pathname === '/repos/acme/models/contents/broken.json') return route.fulfill({ headers: cors, json: { sha: 'b'.repeat(40), encoding: 'base64', content: Buffer.from('{not json').toString('base64') } });
    return route.fulfill({ status: 404, headers: cors, json: { message: 'Not Found' } });
  });
  return calls;
}

async function openImport(page, link, token) {
  await clickControl(page, '#btn-import-git');
  await expect(page.locator('#modal-git-import')).toBeVisible();
  await page.fill('#git-import-url', link);
  if (token) await page.fill('#git-import-token', token);
  await page.click('#btn-git-import-go');
}

test('the menu groups Import and Export', async ({ page }) => {
  await openApp(page, { session: demoSession() });
  const items = await page.evaluate(() => [...document.querySelectorAll('[aria-labelledby="btn-main-menu"] > li')].slice(0, 12)
    .map((li) => li.querySelector('.dropdown-header') ? `# ${li.textContent.trim()}` : (li.querySelector('button') ? li.querySelector('button').id : '---')));
  expect(items.slice(0, 11)).toEqual(['# Import', 'btn-import', 'btn-import-git', 'btn-import-mermaid', 'btn-build-from-status', '---',
    '# Export', 'btn-export', 'btn-export-mermaid', '---', '# Reports']);
});

test('links are understood: GitHub and GitLab, web and raw, self-hosted GitLab with groups', async ({ page }) => {
  await openApp(page, { session: demoSession() });
  const r = await page.evaluate(() => [
    'https://github.com/acme/models/blob/main/docs/model.json',
    'https://raw.githubusercontent.com/acme/models/dev/model.json',
    'https://gitlab.com/group/sub/proj/-/blob/main/dir/m.json',
    'https://git.example.com/group/proj/-/raw/release/m.json?ref_type=heads',
    'https://github.com/acme/models/blob/main/README.md',
    'http://github.com/acme/models/blob/main/m.json',
    'not a link',
  ].map((u) => parseGitFileLink(u)));
  expect(r).toEqual([
    { provider: 'github', host: 'https://api.github.com', repo: 'acme/models', branch: 'main', path: 'docs/model.json' },
    { provider: 'github', host: 'https://api.github.com', repo: 'acme/models', branch: 'dev', path: 'model.json' },
    { provider: 'gitlab', host: 'https://gitlab.com', repo: 'group/sub/proj', branch: 'main', path: 'dir/m.json' },
    { provider: 'gitlab', host: 'https://git.example.com', repo: 'group/proj', branch: 'release', path: 'm.json' },
    null, null, null,
  ]);
});

test('a public file opens without a token; the old model goes to History', async ({ page }) => {
  await openApp(page, { session: demoSession((s) => { s.projectTitle = 'Before'; }) });
  const calls = await fakeGitHubFiles(page);
  await openImport(page, 'https://github.com/acme/models/blob/main/docs/public.json');
  await expect(page.locator('#modal-git-import')).toBeHidden();
  await expect.poll(() => page.evaluate(() => app.state.projectTitle)).toBe('From GitHub');
  expect(calls).toEqual([{ path: '/repos/acme/models/contents/docs/public.json', ref: 'main', auth: null }]);
  await expect.poll(() => page.evaluate(async () => (await SnapshotStore.list()).some((s) => /Before/.test(JSON.stringify(s))))).toBe(true);
});

test('a private file needs a token; a token typed in the dialog is used once and never stored', async ({ page }) => {
  await openApp(page, { session: demoSession() });
  await fakeGitHubFiles(page);
  await openImport(page, 'https://github.com/acme/models/blob/main/private.json');
  await expect(page.locator('#git-import-error')).toContainText(/private|not found/i);
  await expect(page.locator('#modal-git-import')).toBeVisible();
  await page.fill('#git-import-token', TOKEN);
  await page.click('#btn-git-import-go');
  await expect(page.locator('#modal-git-import')).toBeHidden();
  await expect.poll(() => page.evaluate(() => app.state.projectTitle)).toBe('Private model');
  const stored = await page.evaluate(() => Object.keys(localStorage).map((k) => localStorage.getItem(k)).join('\n'));
  expect(stored).not.toContain(TOKEN);
  await clickControl(page, '#btn-import-git');
  await expect(page.locator('#git-import-token')).toHaveValue('');
});

test('a bad link or a file that is not a model changes nothing', async ({ page }) => {
  await openApp(page, { session: demoSession((s) => { s.projectTitle = 'Keep me'; }) });
  await fakeGitHubFiles(page);
  await openImport(page, 'https://example.com/whatever.json');
  await expect(page.locator('#git-import-error')).toContainText(/GitHub or GitLab/i);
  await page.fill('#git-import-url', 'https://github.com/acme/models/blob/main/broken.json');
  await page.click('#btn-git-import-go');
  await expect(page.locator('#git-import-error')).toContainText(/not valid JSON/i);
  expect(await page.evaluate(() => app.state.projectTitle)).toBe('Keep me');
});
