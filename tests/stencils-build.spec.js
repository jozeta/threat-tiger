// Stencil packs: the build script cleans every SVG and maps icons to component types; generated packs are clean.
const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ROOT = path.resolve(__dirname, '..');

test('cleanSvg strips scripts, handlers, outside links and doctypes', async () => {
  const { cleanSvg } = await import('../scripts/build-stencils.mjs');
  const out = cleanSvg('<!DOCTYPE svg [<!ENTITY x "y">]><svg onload="a()"><script>b()</script><a href="https://evil"><rect/></a><use href="#i"/><foreignObject><p/></foreignObject></svg>');
  expect(out).not.toMatch(/script|onload|DOCTYPE|ENTITY|https:\/\/evil|foreignObject/i);
  expect(out).toContain('href="#i"');
});

test('classify maps databases, secrets, network and users', async () => {
  const { classify } = await import('../scripts/build-stencils.mjs');
  expect(classify('Amazon RDS', 'Database')).toEqual({ type: 'datastore', tags: ['database'] });
  expect(classify('Key Vaults', 'security')).toEqual({ type: 'datastore', tags: ['secrets'] });
  expect(classify('Application Load Balancer', 'Networking')).toEqual({ type: 'infrastructure', tags: ['network-device'] });
  expect(classify('Users', 'General')).toEqual({ type: 'interactor', tags: [] });
  expect(classify('Arc PostgreSQL', 'arc')).toEqual({ type: 'datastore', tags: ['database'] });
  // Review fixes: internal services are never external entities; HSM is a secrets store; transfer tools are processes.
  expect(classify('App Services', 'mobile').type).toBe('process');
  expect(classify('AWS Amplify', 'Front End Web Mobile').type).toBe('process');
  expect(classify('Notification Hubs', 'mobile').type).toBe('process');
  expect(classify('User Notifications', 'Management').type).toBe('process');
  expect(classify('AWS CloudHSM', 'Security Identity Compliance')).toEqual({ type: 'datastore', tags: ['secrets'] });
  expect(classify('Database Migration Service', 'Database').type).toBe('process');
  expect(classify('AWS Snowball', 'Storage').type).toBe('process');
  expect(classify('Defender Industrial Robot', 'iot')).toEqual({ type: 'process', tags: ['iot'] });
  expect(classify('Cloud Load Balancing', 'Product')).toEqual({ type: 'infrastructure', tags: ['network-device'] });
  expect(classify('Jenkins', 'server ci')).toEqual({ type: 'process', tags: ['ci-cd'] });
  expect(classify('Terraform', 'iac')).toEqual({ type: 'process', tags: ['ci-cd'] });
  expect(classify('Nginx', 'server')).toEqual({ type: 'process', tags: ['web'] });
  expect(classify('Docker', 'containers')).toEqual({ type: 'process', tags: ['container'] });
  expect(classify('Azure Cosmos DB', 'databases')).toEqual({ type: 'datastore', tags: ['nosql'] });
});

test('every generated pack loads, has icons, and every icon is clean', async () => {
  for (const set of ['aws', 'azure', 'entra', 'gcp', 'k8s', 'devicon', 'brands', 'fluent']) {
    const ctx = { window: {} };
    vm.runInNewContext(fs.readFileSync(path.join(ROOT, `vendor/stencils/${set}.js`), 'utf8'), ctx);
    const pack = ctx.window.TT_STENCILS[set];
    expect(pack.icons.length, set).toBeGreaterThan(set === 'entra' ? 5 : 30);
    for (const [id, name, , type, , b64] of pack.icons) {
      expect(id).toMatch(/^[\w.-]{1,120}$/);
      expect(['process', 'datastore', 'interactor', 'infrastructure']).toContain(type);
      const svg = Buffer.from(b64, 'base64').toString('utf8');
      expect(svg, `${set}:${name}`).not.toMatch(/<script|\son\w+=|<foreignObject|<!DOCTYPE/i);
    }
  }
});

test('no pack shows two icons with the same name', () => {
  for (const set of ['aws', 'azure', 'entra', 'gcp', 'k8s', 'devicon', 'brands', 'fluent']) {
    const ctx = { window: {} };
    vm.runInNewContext(fs.readFileSync(path.join(ROOT, `vendor/stencils/${set}.js`), 'utf8'), ctx);
    const names = ctx.window.TT_STENCILS[set].icons.map((i) => i[1].toLowerCase());
    expect(names.length - new Set(names).size, set).toBe(0);
  }
});

test('the key OS, security and device icons are present', () => {
  const load = (set) => { const ctx = { window: {} }; vm.runInNewContext(fs.readFileSync(path.join(ROOT, `vendor/stencils/${set}.js`), 'utf8'), ctx); return ctx.window.TT_STENCILS[set].icons.map((i) => i[1]); };
  const devicon = load('devicon'), brands = load('brands'), fluent = load('fluent'), gcp = load('gcp');
  for (const n of ['Linux', 'Windows', 'Windows 11', 'Apple', 'Ubuntu', 'Docker', 'Jenkins', 'Python']) expect(devicon, n).toContain(n);
  for (const n of ['Kali Linux', 'Metasploit', 'Wireshark', 'Burp Suite', 'VirusTotal', 'Splunk', 'Snyk', 'Okta', 'Vault']) expect(brands, n).toContain(n);
  for (const n of ['Laptop', 'Server', 'Bug / malware', 'Incident', 'Firewall / protection', 'Code']) expect(fluent, n).toContain(n);
  for (const n of ['Secret Manager', 'Key Management Service', 'Cloud Armor', 'Cloud Load Balancing']) expect(gcp, n).toContain(n);
});
