// Git sync (GitHub / GitLab): settings, encrypted token, sync button, push / pull / conflict. The APIs are faked with page.route.
const crypto = require('node:crypto');
const { test } = require('@playwright/test');
const { expect, openApp, demoSession, clickControl, importJson, downloadText } = require('./helpers');

const TOKEN = 'ghp_TESTTOKEN0123456789';   // secret-scan:allow (fake test token)
const PASS = 'correct horse battery';
const gitBlobSha = (text) => { const b = Buffer.from(text, 'utf8'); return crypto.createHash('sha1').update(`blob ${b.length}\0`).update(b).digest('hex'); };

/** An in-memory GitHub (api.github.com) with one repository. */
async function fakeGitHub(page, { repo = 'acme/models', token = TOKEN } = {}) {
  const files = new Map(), calls = [];
  await page.route('https://api.github.com/**', async (route) => {
    const req = route.request(), url = new URL(req.url());
    if (req.method() !== 'OPTIONS') calls.push({ method: req.method(), path: url.pathname, search: url.search, auth: req.headers()['authorization'], body: req.method() === 'PUT' ? req.postDataJSON() : null });
    const cors = { 'access-control-allow-origin': '*' };
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { ...cors, 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET, PUT, POST, OPTIONS' } });
    if (req.headers()['authorization'] !== `Bearer ${token}`) return route.fulfill({ status: 401, headers: cors, json: { message: 'Bad credentials' } });
    if (url.pathname === `/repos/${repo}`) return route.fulfill({ headers: cors, json: { full_name: repo, permissions: { push: true } } });
    const m = url.pathname.match(/^\/repos\/([^/]+\/[^/]+)\/contents\/(.+)$/);
    if (!m || m[1] !== repo) return route.fulfill({ status: 404, headers: cors, json: { message: 'Not Found' } });
    const path = decodeURIComponent(m[2]), f = files.get(path);
    if (req.method() === 'GET') return f ? route.fulfill({ headers: cors, json: { sha: f.sha, encoding: 'base64', content: Buffer.from(f.text).toString('base64') } }) : route.fulfill({ status: 404, headers: cors, json: { message: 'Not Found' } });
    if (req.method() === 'PUT') {
      const body = req.postDataJSON();
      if ((f && body.sha !== f.sha) || (!f && body.sha)) return route.fulfill({ status: 409, headers: cors, json: { message: 'is at a different sha' } });
      const text = Buffer.from(body.content, 'base64').toString('utf8');
      files.set(path, { sha: gitBlobSha(text), text });
      return route.fulfill({ status: f ? 200 : 201, headers: cors, json: { content: { sha: gitBlobSha(text) } } });
    }
    return route.fulfill({ status: 405, headers: cors, json: {} });
  });
  return {
    files, calls,
    model: (path = 'threat-model.json') => JSON.parse(files.get(path).text),
    setModel(mutate, path = 'threat-model.json') { const m = JSON.parse(files.get(path).text); mutate(m); const text = JSON.stringify(m, null, 2); files.set(path, { sha: gitBlobSha(text), text }); },
  };
}

/** An in-memory self-hosted GitLab. */
async function fakeGitLab(page, { host = 'https://gitlab.example.com', project = 'group/sub/proj', token = TOKEN } = {}) {
  const files = new Map(), calls = [];
  await page.route(`${host}/api/v4/**`, async (route) => {
    const req = route.request(), url = new URL(req.url());
    if (req.method() !== 'OPTIONS') calls.push({ method: req.method(), path: url.pathname, rawPath: req.url(), token: req.headers()['private-token'], body: ['PUT', 'POST'].includes(req.method()) ? req.postDataJSON() : null });
    const cors = { 'access-control-allow-origin': '*' };
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { ...cors, 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET, PUT, POST, OPTIONS' } });
    if (req.headers()['private-token'] !== token) return route.fulfill({ status: 401, headers: cors, json: { message: '401 Unauthorized' } });
    const enc = encodeURIComponent(project);
    if (req.url().split('?')[0] === `${host}/api/v4/projects/${enc}`) return route.fulfill({ headers: cors, json: { path_with_namespace: project, permissions: { project_access: { access_level: 30 } } } });
    const prefix = `${host}/api/v4/projects/${enc}/repository/files/`;
    const raw = req.url().split('?')[0];
    if (!raw.startsWith(prefix)) return route.fulfill({ status: 404, headers: cors, json: { message: '404 Not Found' } });
    const path = decodeURIComponent(raw.slice(prefix.length)), f = files.get(path);
    if (req.method() === 'GET') return f ? route.fulfill({ headers: cors, json: { blob_id: f.sha, last_commit_id: f.commit, encoding: 'base64', content: Buffer.from(f.text).toString('base64') } }) : route.fulfill({ status: 404, headers: cors, json: { message: '404 File Not Found' } });
    const body = req.postDataJSON();
    if (req.method() === 'POST' && f) return route.fulfill({ status: 400, headers: cors, json: { message: 'A file with this name already exists' } });
    if (req.method() === 'PUT' && (!f || (body.last_commit_id && body.last_commit_id !== f.commit))) return route.fulfill({ status: 400, headers: cors, json: { message: 'You are attempting to update a file that has changed since you started editing it.' } });
    files.set(path, { sha: gitBlobSha(body.content), text: body.content, commit: 'c' + (calls.length) });
    return route.fulfill({ status: f ? 200 : 201, headers: cors, json: { file_path: path, branch: body.branch } });
  });
  return { files, calls, model: (path = 'threat-model.json') => JSON.parse(files.get(path).text) };
}

async function setup(page) {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await openApp(page, { session: demoSession((s) => { s.projectTitle = 'Payments'; }) });
}

async function connect(page, { provider = 'github', host, repo = 'acme/models', branch = 'main', path = 'threat-model.json', token = TOKEN, pass = PASS, readable } = {}) {
  if (!(await page.locator('#modal-settings').isVisible())) await clickControl(page, '#btn-settings');
  await expect(page.locator('#modal-settings')).toBeVisible();
  await page.selectOption('#git-provider', provider);
  if (host) await page.fill('#git-host', host);
  await page.fill('#git-repo', repo);
  await page.fill('#git-branch', branch);
  await page.fill('#git-path', path);
  if (readable) await page.selectOption('#git-readable', readable);
  if (token !== null) await page.fill('#git-token', token);
  if (pass !== null) { await page.fill('#git-passphrase', pass); await page.fill('#git-passphrase2', pass); }
  await page.click('#btn-git-connect');
  await expect(page.locator('#git-status')).toHaveClass(/text-(success|danger)/);   // finished, one way or the other
}

async function sync(page) {
  await page.click('#btn-git-sync');
  await expect(page.locator('#btn-git-sync')).not.toHaveClass(/syncing/);
}

test('connecting stores the settings in the model and only an encrypted token in the browser', async ({ page }) => {
  await setup(page);
  const gh = await fakeGitHub(page);
  await expect(page.locator('#btn-git-sync')).toBeHidden();
  await connect(page);
  await expect(page.locator('#git-status')).toContainText('Connected');
  await expect(page.locator('#modal-settings')).toBeHidden();
  await expect(page.locator('#btn-git-sync')).toBeVisible();
  expect(await page.evaluate(() => app.state.gitSync)).toEqual({ provider: 'github', host: 'https://api.github.com', repo: 'acme/models', branch: 'main', path: 'threat-model.json' });
  expect(gh.calls.some((c) => c.path === '/repos/acme/models')).toBe(true);
  // The token is nowhere in readable form.
  const stored = await page.evaluate(() => Object.keys(localStorage).map((k) => k + '=' + localStorage.getItem(k)).join('\n'));
  expect(stored).not.toContain(TOKEN);
  expect(stored).toContain('git_sync_secrets');
  // The exported model carries the settings (for the next developer) but never the token.
  const json = await downloadText(page, '#btn-export');
  expect(JSON.parse(json).gitSync.repo).toBe('acme/models');
  expect(json).not.toContain(TOKEN);
});

test('a wrong token or an unreadable repository saves nothing', async ({ page }) => {
  await setup(page);
  await fakeGitHub(page);
  await connect(page, { token: 'ghp_wrong' });   // secret-scan:allow
  await expect(page.locator('#git-status')).toContainText(/token/i);
  await expect(page.locator('#modal-settings')).toBeVisible();
  expect(await page.evaluate(() => app.state.gitSync)).toBeNull();
  expect(await page.evaluate(() => localStorage.getItem('git_sync_secrets'))).toBeNull();
  await connect(page, { pass: 'short', token: TOKEN });
  await expect(page.locator('#git-status')).toContainText(/passphrase/i);
});

test('sync pushes the model, does nothing when nothing changed, and pushes again after a change', async ({ page }) => {
  await setup(page);
  const gh = await fakeGitHub(page);
  await connect(page);
  await sync(page);
  expect(gh.model().projectTitle).toBe('Payments');
  expect(gh.model().gitSync.repo).toBe('acme/models');
  expect(gh.model().activityLog).toBeUndefined();          // the git-friendly format
  const put1 = gh.calls.filter((c) => c.method === 'PUT');
  expect(put1).toHaveLength(1);
  expect(put1[0].body.branch).toBe('main');
  expect(put1[0].body.message).toContain('Payments');
  await sync(page);
  expect(gh.calls.filter((c) => c.method === 'PUT')).toHaveLength(1);
  await expect(page.locator('#app-toast-container')).toContainText(/up to date/i);
  const firstSha = gh.files.get('threat-model.json').sha;
  await page.evaluate(() => { app.state.projectTitle = 'Payments v2'; app.logEvent('CHANGE', 'title'); });
  await sync(page);
  const puts = gh.calls.filter((c) => c.method === 'PUT');
  expect(puts).toHaveLength(2);
  expect(puts[1].body.sha).toBe(firstSha);                 // updates exactly the version it last saw
  expect(gh.model().projectTitle).toBe('Payments v2');
});

test('sync loads the repository copy when only it changed, keeping a History snapshot', async ({ page }) => {
  await setup(page);
  const gh = await fakeGitHub(page);
  await connect(page);
  await sync(page);
  gh.setModel((m) => { m.projectTitle = 'Changed by a colleague'; });
  await sync(page);
  expect(await page.evaluate(() => app.state.projectTitle)).toBe('Changed by a colleague');
  expect(gh.calls.filter((c) => c.method === 'PUT')).toHaveLength(1);
  // Nothing changed since: up to date.
  await sync(page);
  expect(gh.calls.filter((c) => c.method === 'PUT')).toHaveLength(1);
});

test('when both copies changed, sync asks: take theirs, or keep mine', async ({ page }) => {
  await setup(page);
  const gh = await fakeGitHub(page);
  await connect(page);
  await sync(page);
  gh.setModel((m) => { m.projectTitle = 'Theirs'; });
  await page.evaluate(() => { app.state.projectTitle = 'Mine'; app.logEvent('CHANGE', 'title'); });
  await page.click('#btn-git-sync');
  await expect(page.locator('#modal-git-conflict')).toBeVisible();
  await page.click('#btn-git-take-theirs');
  await expect(page.locator('#modal-git-conflict')).toBeHidden();
  await expect.poll(() => page.evaluate(() => app.state.projectTitle)).toBe('Theirs');
  // Again, keeping mine this time.
  gh.setModel((m) => { m.projectTitle = 'Theirs 2'; });
  await page.evaluate(() => { app.state.projectTitle = 'Mine 2'; app.logEvent('CHANGE', 'title'); });
  await page.click('#btn-git-sync');
  await expect(page.locator('#modal-git-conflict')).toBeVisible();
  await page.click('#btn-git-keep-mine');
  await expect.poll(() => gh.model().projectTitle).toBe('Mine 2');
  // Cancel changes nothing.
  gh.setModel((m) => { m.projectTitle = 'Theirs 3'; });
  await page.evaluate(() => { app.state.projectTitle = 'Mine 3'; app.logEvent('CHANGE', 'title'); });
  await page.click('#btn-git-sync');
  await page.click('#btn-git-conflict-cancel');
  await expect(page.locator('#modal-git-conflict')).toBeHidden();
  expect(await page.evaluate(() => app.state.projectTitle)).toBe('Mine 3');
  expect(gh.model().projectTitle).toBe('Theirs 3');
});

test('after a reload the passphrase unlocks the stored token; a wrong one does not', async ({ page }) => {
  await setup(page);
  const gh = await fakeGitHub(page);
  await connect(page);
  await page.reload();
  await page.waitForFunction(() => window.app && window.app.state);
  await expect(page.locator('#btn-git-sync')).toBeVisible();
  await page.click('#btn-git-sync');
  await expect(page.locator('#modal-git-unlock')).toBeVisible();
  await page.fill('#git-unlock-passphrase', 'wrong passphrase');
  await page.click('#btn-git-unlock');
  await expect(page.locator('#git-unlock-error')).toContainText(/passphrase/i);
  await page.fill('#git-unlock-passphrase', PASS);
  await page.click('#btn-git-unlock');
  await expect(page.locator('#modal-git-unlock')).toBeHidden();
  await expect.poll(() => gh.calls.filter((c) => c.method === 'PUT').length).toBe(1);
});

test('a model from another developer brings the sync settings; only a token is needed', async ({ page }) => {
  await setup(page);
  const gh = await fakeGitHub(page);
  const model = demoSession((s) => { s.projectTitle = 'Shared'; s.gitSync = { provider: 'github', host: 'https://api.github.com', repo: 'acme/models', branch: 'dev', path: 'models/shared.json' }; });
  await importJson(page, JSON.stringify(model));
  await expect(page.locator('#btn-git-sync')).toBeVisible();
  await page.click('#btn-git-sync');
  await expect(page.locator('#modal-settings')).toBeVisible();
  await expect(page.locator('#git-status')).toContainText(/token/i);
  await expect(page.locator('#git-repo')).toHaveValue('acme/models');
  await expect(page.locator('#git-branch')).toHaveValue('dev');
  await expect(page.locator('#git-path')).toHaveValue('models/shared.json');
  await page.fill('#git-token', TOKEN);
  await page.fill('#git-passphrase', PASS); await page.fill('#git-passphrase2', PASS);
  await page.click('#btn-git-connect');
  await expect(page.locator('#modal-settings')).toBeHidden();
  await sync(page);
  expect(gh.files.has('models/shared.json')).toBe(true);
  expect(gh.calls.find((c) => c.method === 'PUT').body.branch).toBe('dev');
});

test('self-hosted GitLab: project paths with groups, PRIVATE-TOKEN header, push and pull', async ({ page }) => {
  await setup(page);
  const gl = await fakeGitLab(page);
  await connect(page, { provider: 'gitlab', host: 'https://gitlab.example.com', repo: 'group/sub/proj' });
  await expect(page.locator('#btn-git-sync')).toBeVisible();
  await sync(page);
  expect(gl.model().projectTitle).toBe('Payments');
  const post = gl.calls.find((c) => c.method === 'POST');
  expect(post.rawPath).toContain('/projects/group%2Fsub%2Fproj/repository/files/threat-model.json');
  expect(post.token).toBe(TOKEN);
  expect(post.body.branch).toBe('main');
  await page.evaluate(() => { app.state.projectTitle = 'Payments GL'; app.logEvent('CHANGE', 'title'); });
  await sync(page);
  const put = gl.calls.find((c) => c.method === 'PUT');
  expect(put.body.last_commit_id).toBeTruthy();
  expect(gl.model().projectTitle).toBe('Payments GL');
});

test('sync settings are validated on import and in Settings', async ({ page }) => {
  await setup(page);
  const r = await page.evaluate(() => {
    const n = (g) => normalizeGitSync(g);
    const ok = { provider: 'gitlab', host: 'https://gitlab.example.com/', repo: 'a/b/c', branch: 'feature/x', path: 'dir/model.json' };
    return {
      ok: n(ok),
      http: n({ ...ok, host: 'http://gitlab.example.com' }),
      js: n({ ...ok, host: 'javascript:alert(1)' }),
      creds: n({ ...ok, host: 'https://user:pw@gitlab.example.com' }),
      dotdot: n({ ...ok, path: '../secrets.json' }),
      notJson: n({ ...ok, path: 'model.txt' }),
      ghRepo: n({ ...ok, provider: 'github', host: 'https://api.github.com', repo: 'a/b/c' }),
      branch: n({ ...ok, branch: '../main' }),
      provider: n({ ...ok, provider: 'bitbucket' }),
      junk: n('x'),
      fromImport: normalizeSession({ gitSync: { ...ok, token: 'leak' } }).session.gitSync,
    };
  });
  expect(r.ok).toEqual({ provider: 'gitlab', host: 'https://gitlab.example.com', repo: 'a/b/c', branch: 'feature/x', path: 'dir/model.json' });
  for (const k of ['http', 'js', 'creds', 'dotdot', 'notJson', 'ghRepo', 'branch', 'provider', 'junk']) expect(r[k], k).toBeNull();
  expect(r.fromImport).toEqual(r.ok);   // extra fields (like a token) never survive
});

test('the security policy allows https connections for git sync only', async ({ page }) => {
  await setup(page);
  const csp = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
  expect(csp).toContain("connect-src 'self' data: blob: https:");
  expect(csp).not.toMatch(/connect-src[^;]*http:/);
});

test('a model that points sync somewhere new is never synced until that target is approved in Settings', async ({ page }) => {
  await setup(page);
  const gh = await fakeGitHub(page, { repo: 'acme/models' });
  await connect(page);                                     // token saved for api.github.com, acme/models approved
  const evil = demoSession((s) => { s.projectTitle = 'Imported'; s.gitSync = { provider: 'github', host: 'https://api.github.com', repo: 'attacker/loot', branch: 'main', path: 'x.json' }; });
  await importJson(page, JSON.stringify(evil));
  await page.click('#btn-git-sync');
  await expect(page.locator('#modal-settings')).toBeVisible();
  await expect(page.locator('#git-status')).toContainText('attacker/loot');
  expect(gh.calls.filter((c) => c.path.includes('attacker'))).toHaveLength(0);
  expect(gh.calls.filter((c) => c.method === 'PUT')).toHaveLength(0);
});

test('pulling a repository copy never changes where the model syncs to', async ({ page }) => {
  await setup(page);
  const gh = await fakeGitHub(page);
  await connect(page);
  await sync(page);
  gh.setModel((m) => { m.projectTitle = 'Pulled'; m.gitSync = { provider: 'github', host: 'https://api.github.com', repo: 'attacker/loot', branch: 'main', path: 'x.json' }; });
  await sync(page);
  expect(await page.evaluate(() => app.state.projectTitle)).toBe('Pulled');
  expect(await page.evaluate(() => app.state.gitSync.repo)).toBe('acme/models');
});

// ── Readable copy: a Markdown file (diagram, or full report) next to the JSON, regenerated and overwritten on every sync ──

test('readable copy is off by default: only the JSON is written', async ({ page }) => {
  await setup(page);
  const gh = await fakeGitHub(page);
  await connect(page);
  await expect(page.locator('#git-readable')).toHaveValue('off');
  await sync(page);
  expect([...gh.files.keys()]).toEqual(['threat-model.json']);
  expect(gh.model().gitSync.readable).toBeUndefined();
});

test('full report: a Markdown file with the diagram on top and the threats below, never read back into the model', async ({ page }) => {
  await setup(page);
  const gh = await fakeGitHub(page);
  await connect(page, { path: 'models/payments.json', readable: 'report' });
  expect(await page.evaluate(() => app.state.gitSync.readable)).toBe('report');
  await sync(page);
  expect(gh.model('models/payments.json').gitSync.readable).toBe('report');
  const md = gh.files.get('models/payments.md').text;
  expect(md).toMatch(/^# Threat Register Report — Payments/m);
  expect(md).toContain('generated by Threat Tiger from `payments.json`');
  const diagram = md.indexOf('```mermaid'), threats = md.indexOf('## Threats');
  expect(diagram).toBeGreaterThan(0);
  expect(threats).toBeGreaterThan(diagram);
  const firstTitle = await page.evaluate(() => mdText(app.state.threats[0].title));   // model text is Markdown-escaped
  expect(md.slice(threats)).toContain(firstTitle);
  expect(md).toMatch(/\| Severity \| Risk score \| Likelihood \/ impact \| Status \|/);
  expect(md).not.toMatch(/\d{4}-\d{2}-\d{2}/);   // no date: an unchanged model gives an unchanged file
  const puts = () => gh.calls.filter((c) => c.method === 'PUT').length;
  expect(puts()).toBe(2);
  await sync(page);   // nothing changed: no commits at all
  expect(puts()).toBe(2);

  // Someone edits the Markdown in the repository: the next sync overwrites it and never loads it.
  const title = await page.evaluate(() => app.state.projectTitle);
  gh.files.set('models/payments.md', { sha: gitBlobSha('# edited by hand\n'), text: '# edited by hand\n' });
  await sync(page);
  expect(gh.files.get('models/payments.md').text).toBe(md);
  expect(await page.evaluate(() => app.state.projectTitle)).toBe(title);
  expect(gh.calls.filter((c) => c.method === 'PUT' && c.path.endsWith('payments.json'))).toHaveLength(1);

  // A model change rewrites both files.
  await page.evaluate(() => { app.state.projectTitle = 'Payments v2'; app.logEvent('CHANGE', 'title'); });
  await sync(page);
  expect(gh.files.get('models/payments.md').text).toContain('# Threat Register Report — Payments v2');
});

test('diagram only: the Markdown file holds the diagram and no threat register', async ({ page }) => {
  await setup(page);
  const gh = await fakeGitHub(page);
  await connect(page, { readable: 'diagram' });
  await sync(page);
  const md = gh.files.get('threat-model.md').text;
  expect(md).toMatch(/^# Payments/m);
  expect(md).toContain('```mermaid');
  expect(md).not.toContain('## Threats');
});

test('a failed readable copy never undoes the saved model', async ({ page }) => {
  await setup(page);
  const gh = await fakeGitHub(page);
  await connect(page, { readable: 'report' });
  await page.route('https://api.github.com/repos/acme/models/contents/threat-model.md*', (route) =>
    route.request().method() === 'OPTIONS'
      ? route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET, PUT, OPTIONS' } })
      : route.fulfill({ status: 500, headers: { 'access-control-allow-origin': '*' }, json: { message: 'boom' } }));
  await sync(page);
  expect(gh.model().projectTitle).toBe('Payments');
  await expect(page.locator('#app-toast-container')).toContainText(/readable copy/i);
});

test('GitLab gets the readable copy too', async ({ page }) => {
  await setup(page);
  const gl = await fakeGitLab(page);
  await connect(page, { provider: 'gitlab', host: 'https://gitlab.example.com', repo: 'group/sub/proj', readable: 'diagram' });
  await sync(page);
  expect(gl.files.get('threat-model.md').text).toContain('```mermaid');
  const n = gl.calls.filter((c) => c.method !== 'GET').length;
  await sync(page);
  expect(gl.calls.filter((c) => c.method !== 'GET').length).toBe(n);
});

test('an unknown readable value is dropped on import', async ({ page }) => {
  await setup(page);
  const r = await page.evaluate(() => [normalizeGitSync({ provider: 'github', repo: 'a/b', readable: 'report' }).readable,
    'readable' in normalizeGitSync({ provider: 'github', repo: 'a/b', readable: '<img>' }),
    'readable' in normalizeGitSync({ provider: 'github', repo: 'a/b', readable: 'off' })]);
  expect(r).toEqual(['report', false, false]);
});
