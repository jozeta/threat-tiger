#!/usr/bin/env node
// Builds vendor/stencils/<set>.js from an official icon archive that has already been downloaded and extracted.
//
//   node scripts/build-stencils.mjs <set> <extractedDir>      set: aws | azure | entra | gcp | oci | k8s
//
// The archives are untrusted input: every SVG goes through cleanSvg() (no scripts, event handlers, outside links,
// doctypes or foreignObject) and is skipped when it is still too large. Each icon is mapped to a Threat Tiger
// component type and subtypes by classify(), so threat suggestions work for placed icons.
// Sources and terms: vendor/stencils/README.md. The icons are not covered by the repo's MIT licence.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MAX_SVG = 60 * 1024;

export const SETS = {
    aws: { title: 'AWS', source: 'https://aws.amazon.com/architecture/icons/', terms: 'AWS Architecture Icons: customers and partners may use these toolkits and assets to create architecture diagrams.' },
    azure: { title: 'Azure', source: 'https://learn.microsoft.com/en-us/azure/architecture/icons/', terms: 'Microsoft permits the use of these icons in architectural diagrams, training materials, or documentation. Microsoft reserves all other rights.' },
    entra: { title: 'Microsoft Entra', source: 'https://learn.microsoft.com/en-us/entra/architecture/architecture-icons', terms: 'Microsoft permits the use of these icons in architectural diagrams, training materials, or documentation. Microsoft reserves all other rights.' },
    gcp: { title: 'Google Cloud', source: 'https://cloud.google.com/icons', terms: 'Google Cloud product icons from the official icon library, for architecture diagrams.' },
    oci: { title: 'Oracle Cloud', source: 'https://docs.oracle.com/iaas/Content/General/Reference/graphicsfordiagrams.htm', terms: 'Oracle Cloud Infrastructure Architecture Diagram Toolkit icons, for architecture diagrams.' },
    k8s: { title: 'Kubernetes', source: 'https://github.com/kubernetes/community/tree/main/icons', terms: 'Kubernetes icons, licensed under Apache-2.0 or CC-BY-4.0 (your choice).' },
};

/** Removes everything that could run code or reach the network; null when the result is not a usable SVG. */
export function cleanSvg(text) {
    let s = String(text);
    s = s.replace(/<\?xml[\s\S]*?\?>/gi, '')
        .replace(/<!DOCTYPE[^[>]*(\[[\s\S]*?\])?\s*>/gi, '')
        .replace(/<!ENTITY[\s\S]*?>/gi, '')
        .replace(/<!--[\s\S]*?-->/g, '')
        .replace(/<script[\s\S]*?<\/script\s*>/gi, '').replace(/<script\b[^>]*\/>/gi, '')
        .replace(/<foreignObject[\s\S]*?<\/foreignObject\s*>/gi, '').replace(/<foreignObject\b[^>]*\/>/gi, '')
        .replace(/<metadata[\s\S]*?<\/metadata\s*>/gi, '')
        .replace(/\s(on[a-z]+)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
        .replace(/\s((?:xlink:)?href)\s*=\s*("([^"]*)"|'([^']*)')/gi, (m, attr, _q, a, b) => {
            const v = (a !== undefined ? a : b).trim();
            return v.startsWith('#') || /^data:image\/(png|jpeg|gif|webp);base64,/i.test(v) ? ` ${attr}="${v}"` : '';
        })
        .replace(/url\(\s*(['"]?)(?!#)[^)]*\1\s*\)/gi, 'none')
        .replace(/@import[^;]*;?/gi, '')
        .replace(/>\s+</g, '><').replace(/\s{2,}/g, ' ').trim();
    if (!/^<svg[\s>]/i.test(s) || /<script|\son[a-z]+\s*=|<foreignObject|<!DOCTYPE|<!ENTITY|javascript:/i.test(s)) return null;
    if (!/^<svg[^>]*\sxmlns=/i.test(s)) s = s.replace(/^<svg/i, '<svg xmlns="http://www.w3.org/2000/svg"');
    return Buffer.byteLength(s) <= MAX_SVG ? s : null;
}

// [pattern, type, tags]; the name is tried first, then the category. First match wins.
const RULES = [
    [/\b(api gateway|api management|apigee|endpoints)\b/i, 'process', ['api']],
    [/\b(dynamo|cosmos|firestore|bigtable|documentdb|nosql|opensearch|elasticsearch|keyspaces|neptune|search)/i, 'datastore', ['nosql']],
    [/\b(rds|aurora|sql|database|databases|db|spanner|alloydb|postgres|mysql|maria|autonomous|timestream)\b/i, 'datastore', ['database']],
    [/\b(s3|bucket|buckets|blob|object storage|cloud storage|storage|storage accounts?|glacier|backup)\b/i, 'datastore', ['object-storage']],
    [/\b(cache|redis|memcached?|elasticache|memorystore)/i, 'datastore', ['cache']],
    [/\b(efs|fsx|file shares?|files|filestore|netapp)\b/i, 'datastore', ['file-share']],
    [/\b(kms|key vaults?|secrets?|hsm|certificates?|key management)\b/i, 'datastore', ['secrets']],
    [/\b(redshift|bigquery|synapse|data ?warehouse|athena|emr|glue|databricks|data ?lake|analytics)\b/i, 'process', ['analytics']],
    [/\b(logs?|logging|cloudtrail|monitor|monitoring|sentinel|siem|cloudwatch|operations|observability|insights)\b/i, 'process', ['monitoring', 'logs']],
    [/\b(entra|active directory|cognito|iam|identity|sso|login|auth|directory)\b/i, 'process', ['identity']],
    [/\b(waf|firewall|firewalls|shield|ddos|guardduty|defender|security|armor|sentinel|inspector|macie|threat)\b/i, 'infrastructure', ['security-control']],
    [/\b(cdn|cloudfront|front ?door)\b/i, 'infrastructure', ['network-device', 'cdn']],
    [/\b(dns|route ?53)\b/i, 'infrastructure', ['network-device', 'dns']],
    [/\b(vpn|express ?route|direct connect|interconnect)\b/i, 'infrastructure', ['network-device', 'vpn']],
    [/\b(load balancers?|gateways?|nat|vpc|virtual networks?|vnet|subnets?|network|networking|private link|transit)\b/i, 'infrastructure', ['network-device']],
    [/\b(lambda|functions?|cloud run|app engine|serverless)\b/i, 'process', ['serverless']],
    [/\b(kubernetes|eks|aks|gke|containers?|ecs|fargate|openshift|pods?|registry)\b/i, 'process', ['container']],
    [/\b(sqs|sns|queues?|service bus|event ?(hubs?|grid|bridge)|pub ?\/? ?sub|kafka|mq|messaging)\b/i, 'process', ['queue', 'messaging']],
    [/\b(sagemaker|bedrock|openai|vertex|ai|machine learning|cognitive|gemini|foundry)\b/i, 'process', ['llm']],
    [/\b(ec2|virtual machines?|vms?|compute|instances?|servers?)\b/i, 'process', ['cloud-host']],
    [/\b(iot)\b/i, 'process', ['iot']],
    [/\b(users?|clients?|mobile)\b/i, 'interactor', []],
];

/** Component type and subtypes for an icon, from its name (preferred) and category. */
export function classify(name, category = '') {
    for (const text of [name, category]) {
        for (const [re, type, tags] of RULES) if (re.test(text)) return { type, tags: [...tags] };
    }
    return { type: 'process', tags: [] };
}

const K8S_NAMES = {
    api: 'API server', 'c-c-m': 'Cloud controller manager', 'c-m': 'Controller manager', 'k-proxy': 'kube-proxy', kubelet: 'kubelet',
    sched: 'Scheduler', 'control-plane': 'Control plane', node: 'Node', etcd: 'etcd', 'c-role': 'Cluster role', cm: 'ConfigMap',
    crb: 'Cluster role binding', crd: 'Custom resource definition', cronjob: 'CronJob', deploy: 'Deployment', ds: 'DaemonSet',
    ep: 'Endpoints', group: 'Group', hpa: 'Horizontal pod autoscaler', ing: 'Ingress', job: 'Job', limits: 'Limit range',
    netpol: 'Network policy', ns: 'Namespace', pod: 'Pod', psp: 'Pod security policy', pv: 'Persistent volume',
    pvc: 'Persistent volume claim', quota: 'Resource quota', rb: 'Role binding', role: 'Role', rs: 'ReplicaSet', sa: 'Service account',
    sc: 'Storage class', secret: 'Secret', sts: 'StatefulSet', svc: 'Service', user: 'User', vol: 'Volume',
};
const K8S_CLASS = {
    secret: ['datastore', ['secrets']], pv: ['datastore', ['file-share']], pvc: ['datastore', ['file-share']], vol: ['datastore', ['file-share']],
    etcd: ['datastore', ['database']], ing: ['infrastructure', ['network-device']], svc: ['infrastructure', ['network-device']],
    netpol: ['infrastructure', ['network-device', 'security-control']], user: ['interactor', []], group: ['interactor', []],
    api: ['process', ['api', 'container']], sa: ['process', ['identity']], role: ['process', ['identity']], 'c-role': ['process', ['identity']],
    rb: ['process', ['identity']], crb: ['process', ['identity']], psp: ['process', ['security-control']], cm: ['datastore', ['config']],
};

function walk(dir, out = []) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p, out); else out.push(p);
    }
    return out;
}

const pretty = (s) => s.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();

/** [{ name, category, svgText, type?, tags? }] for one extracted archive. */
function collect(set, dir) {
    const files = walk(dir).filter(f => f.toLowerCase().endsWith('.svg') && !f.includes('__MACOSX'));
    if (set === 'aws') {
        return files.filter(f => /Architecture-Service-Icons_[^/]+\/Arch_[^/]+\/48\/Arch_.+_48\.svg$/.test(f)).map(f => ({
            name: pretty(path.basename(f).replace(/^Arch_/, '').replace(/_48\.svg$/, '')),
            category: pretty(path.basename(path.dirname(path.dirname(f))).replace(/^Arch_/, '')),
            svgText: fs.readFileSync(f, 'utf8'),
        }));
    }
    if (set === 'azure') {
        return files.filter(f => /\/Icons\/[^/]+\/[^/]+\.svg$/.test(f) && !/\/Icons\/menu\//.test(f)).map(f => ({
            name: pretty(path.basename(f, '.svg').replace(/^\d+-icon-service-/, '')),
            category: path.basename(path.dirname(f)),
            svgText: fs.readFileSync(f, 'utf8'),
        }));
    }
    if (set === 'entra') {
        return files.filter(f => /color icons SVG/i.test(f)).map(f => ({
            name: path.basename(f, '.svg').replace(/\s*color icon$/i, ''), category: 'Identity', svgText: fs.readFileSync(f, 'utf8'),
            type: 'process', tags: ['identity'],
        }));
    }
    if (set === 'gcp') {
        const byFolder = new Map();
        files.forEach(f => {
            const rel = path.relative(dir, f).split(path.sep);
            const key = `${rel[0]}/${rel[1]}`;
            const prev = byFolder.get(key);
            const score = (/color/i.test(f) ? 2 : 0) + (/rgb/i.test(f) ? 1 : 0);
            if (!prev || score > prev.score) byFolder.set(key, { f, score, group: rel[0], product: rel[1] });
        });
        return [...byFolder.values()].map(({ f, group, product }) => ({
            name: product.replace(/\s*_\s*/g, ' & '), category: group === 'Category Icons' ? 'Category' : 'Product', svgText: fs.readFileSync(f, 'utf8'),
        }));
    }
    if (set === 'k8s') {
        return files.map(f => {
            const key = path.basename(f, '.svg').replace(/^.*__/, '');
            const [type, tags] = K8S_CLASS[key] || ['process', ['container']];
            return { name: K8S_NAMES[key] || pretty(key), category: path.basename(f).split('__')[0], svgText: fs.readFileSync(f, 'utf8'), type, tags: [...tags] };
        });
    }
    if (set === 'oci') {
        const lib = walk(dir).find(f => /OCI Library\.xml$/i.test(f));
        const json = fs.readFileSync(lib, 'utf8').replace(/^\s*<mxlibrary>/, '').replace(/<\/mxlibrary>\s*$/, '');
        const out = [];
        JSON.parse(json).forEach(entry => {
            let xml = entry.xml || '';
            if (!xml.trim().startsWith('<')) {
                try { xml = decodeURIComponent(zlib.inflateRawSync(Buffer.from(xml, 'base64')).toString('utf8')); } catch { return; }
            }
            const m = /image=data:image\/svg\+xml,([A-Za-z0-9+/=]+)/.exec(xml);
            if (!m || !entry.title) return;
            out.push({ name: pretty(String(entry.title)), category: 'Oracle Cloud', svgText: Buffer.from(m[1], 'base64').toString('utf8') });
        });
        return out;
    }
    throw new Error(`Unknown set "${set}"`);
}

export function build(set, dir) {
    const meta = SETS[set];
    if (!meta) throw new Error(`Unknown set "${set}". Sets: ${Object.keys(SETS).join(', ')}`);
    const ids = new Set();
    let skipped = 0;
    const icons = [];
    collect(set, dir).sort((a, b) => a.name.localeCompare(b.name)).forEach(it => {
        const svg = cleanSvg(it.svgText);
        if (!svg || !it.name) { skipped++; return; }
        let id = it.name.replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 110) || 'icon';
        for (let n = 2; ids.has(id); n++) id = `${id.replace(/-\d+$/, '')}-${n}`;
        ids.add(id);
        const { type, tags } = it.type ? { type: it.type, tags: it.tags } : classify(it.name, it.category);
        icons.push([id, it.name.slice(0, 120), it.category, type, tags, Buffer.from(svg).toString('base64')]);
    });
    const pack = { title: meta.title, source: meta.source, version: new Date().toISOString().slice(0, 10), terms: meta.terms, icons };
    const file = path.join(ROOT, 'vendor', 'stencils', `${set}.js`);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, `// ${meta.title} icons for Threat Tiger, generated by scripts/build-stencils.mjs. Not MIT: see vendor/stencils/README.md.\n`
        + `// Source: ${meta.source}\n(window.TT_STENCILS = window.TT_STENCILS || {})[${JSON.stringify(set)}] = ${JSON.stringify(pack)};\n`);
    return { set, icons: icons.length, skipped, bytes: fs.statSync(file).size };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
    const [set, dir] = process.argv.slice(2);
    if (!set || !dir) { console.error('Usage: node scripts/build-stencils.mjs <set> <extractedDir>'); process.exit(2); }
    console.log(JSON.stringify(build(set, path.resolve(dir))));
}
