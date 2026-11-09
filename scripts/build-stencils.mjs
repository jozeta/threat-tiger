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
    devicon: { title: 'Tech & OS logos', source: 'https://github.com/devicons/devicon', terms: 'Devicon, MIT licence (Copyright (c) 2015 konpa). Logos are trademarks of their owners.' },
    brands: { title: 'Security & DevOps brands', source: 'https://github.com/simple-icons/simple-icons', terms: 'Simple Icons, CC0-1.0. Logos are trademarks of their owners; use them only to refer to the product.' },
    fluent: { title: 'Devices & security', source: 'https://github.com/microsoft/fluentui-system-icons', terms: 'Microsoft Fluent UI System Icons, MIT licence (Copyright (c) Microsoft Corporation).' },
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

// Known misfits of the general rules, by name (checked first).
const OVERRIDES = [
    [/\b(cloud ?hsm|hsm|disk encryption)/i, 'datastore', ['secrets']],
    [/\b(migration|data factor(y|ies)|job agents?|data ?box|snowball|snowcone|storage gateway|disaster recovery|datasync|transfer family|data transfer)/i, 'process', ['integration']],
    [/^defender\b/i, 'process', ['iot']],
    [/\b(notification hubs?|user notifications|notifications?)\b/i, 'process', ['messaging']],
    [/\b(app services?|app service plans?|amplify|static web apps?|web apps?)\b/i, 'process', ['web']],
    [/\b(workspaces|virtual desktop|appstream)\b/i, 'process', ['workstation']],
    [/\b(mobile networks?|private 5g)\b/i, 'infrastructure', ['network-device']],
    [/\b(disks?|snapshots?|ebs|managed disks?)\b/i, 'datastore', ['local-disk']],
    [/\b(device farm|location service|power platform|user (settings|subscriptions|privacy)|subscriptions?)\b/i, 'process', []],
];

// [pattern, type, tags]; the name is tried first, then the category. First match wins.
const RULES = [
    [/\b(api gateway|api management|apigee|endpoints)\b/i, 'process', ['api']],
    [/\b(dynamo|cosmos|firestore|bigtable|documentdb|nosql|opensearch|elasticsearch|keyspaces|neptune|search)/i, 'datastore', ['nosql']],
    [/\b(rds|aurora|\w*sql|database|databases|db|spanner|alloydb|postgre\w*|maria\w*|autonomous|timestream)\b/i, 'datastore', ['database']],
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
    [/\b(load balanc\w*|gateways?|nat|vpc|virtual networks?|vnet|subnets?|network|networking|private link|transit)\b/i, 'infrastructure', ['network-device']],
    [/\b(jenkins|github actions|gitlab|circleci|travis( ci)?|argo( ?cd)?|teamcity|bamboo|tekton|spinnaker|azure devops|terraform|ansible|puppet|chef|packer|vagrant|pulumi|ci ?\/ ?cd|pipelines?)\b/i, 'process', ['ci-cd']],
    [/\b(nginx|apache|httpd|tomcat|caddy|iis|web servers?)\b/i, 'process', ['web']],
    [/\b(lambda|functions?|cloud run|app engine|serverless)\b/i, 'process', ['serverless']],
    [/\b(kubernetes|eks|aks|gke|containers?|ecs|fargate|openshift|pods?|registry|docker|podman)\b/i, 'process', ['container']],
    [/\b(sqs|sns|queues?|service bus|event ?(hubs?|grid|bridge)|pub ?\/? ?sub|kafka|mq|messaging)\b/i, 'process', ['queue', 'messaging']],
    [/\b(sagemaker|bedrock|openai|vertex|ai|machine learning|cognitive|gemini|foundry)\b/i, 'process', ['llm']],
    [/\b(ec2|virtual machines?|vms?|compute|instances?|servers?)\b/i, 'process', ['cloud-host']],
    [/\b(iot)\b/i, 'process', ['iot']],
];
// External entities only by name (a "mobile" or "user" category holds many internal services).
const INTERACTOR = /^(users?|clients?|mobile (client|device|app)s?|browsers?|customers?)$|\b(end users?|external users?)\b/i;

/** Component type and subtypes for an icon, from its name (preferred) and category. */
export function classify(name, category = '') {
    for (const [re, type, tags] of OVERRIDES) if (re.test(name)) return { type, tags: [...tags] };
    if (INTERACTOR.test(name.trim())) return { type: 'interactor', tags: [] };
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

// Devicon: operating systems and code are recognised by name; the rest goes through classify().
const OS_NAMES = /^(linux|windows8|windows11|apple|macos|ubuntu|debian|redhat|fedora|centos|android|ios|freebsd|archlinux|opensuse|alpinelinux|rockylinux|almalinux|kalilinux|raspberrypi|chrome ?os)$/i;
const DEVICON_LABELS = { windows8: 'Windows', windows11: 'Windows 11', redhat: 'Red Hat', githubactions: 'GitHub Actions', gitlab: 'GitLab', github: 'GitHub', nodejs: 'Node.js', javascript: 'JavaScript', typescript: 'TypeScript', postgresql: 'PostgreSQL', mysql: 'MySQL', mongodb: 'MongoDB', sonarqube: 'SonarQube', argocd: 'Argo CD', azuredevops: 'Azure DevOps', powershell: 'PowerShell', bash: 'Bash', csharp: 'C#', cplusplus: 'C++', dotnetcore: '.NET Core', vscode: 'VS Code', kalilinux: 'Kali Linux', macos: 'macOS', ios: 'iOS' };

// Simple Icons: a curated security / hacking / incident response / DevSecOps / identity / OS / code subset.
// [group, type, tags, slugs]
const BRAND_GROUPS = [
    ['Operating systems', 'process', ['host'], 'linux apple macos ios android ubuntu debian redhat fedora centos kalilinux parrotsecurity archlinux freebsd opensuse alpinelinux rockylinux almalinux qubesos tails'],
    ['Pentest & hacking', 'interactor', ['threat-actor'], 'kalilinux parrotsecurity metasploit burpsuite wireshark hackthebox tryhackme offsec portswigger owasp zap hashcat ghidra radare2 nmap kismet aircrack'],
    ['Incident response & SIEM', 'process', ['monitoring', 'logs'], 'splunk elastic elasticsearch kibana logstash graylog sumologic datadog newrelic pagerduty opsgenie grafana prometheus wazuh velociraptor thehive misp securityonion sentry'],
    ['Malware & threat intel', 'process', ['security-control'], 'virustotal abuseipdb malwarebytes sentinelone sophos eset kaspersky avast avira bitdefender mcafee norton trendmicro recordedfuture shodan censys greynoise alienvault'],
    ['Network security', 'infrastructure', ['security-control', 'network-device'], 'fortinet paloaltonetworks checkpoint cisco zscaler cloudflare akamai f5 pfsense opnsense wireguard openvpn tailscale zerotier netbird crowdsec suricata snort'],
    ['DevSecOps', 'process', ['ci-cd', 'security-control'], 'snyk sonarqube sonarcloud checkmarx trivy falco aqua semgrep dependabot renovatebot sigstore openpolicyagent kyverno gitguardian trufflehog mend veracode sonatype jfrog harbor anchore grype syft'],
    ['DevOps & CI/CD', 'process', ['ci-cd'], 'githubactions gitlab jenkins circleci travisci argo buildkite teamcity bamboo azuredevops drone tekton spinnaker octopusdeploy terraform ansible pulumi puppet chef saltproject vagrant packer docker podman kubernetes helm rancher openshift'],
    ['Secrets & identity', 'process', ['identity'], 'okta auth0 keycloak authelia authentik openid fido yubico duo onelogin pingidentity jumpcloud letsencrypt'],
    ['Password & secrets stores', 'datastore', ['secrets'], 'vault hashicorp 1password bitwarden lastpass keepassxc dashlane keeper doppler infisical'],
    ['Code & repositories', 'process', ['app-code'], 'git github gitlab bitbucket gitea codeberg visualstudiocode jetbrains python javascript typescript go rust openjdk dotnet php nodedotjs gnubash powershell'],
    ['Messaging & collaboration', 'process', ['messaging'], 'discord signal telegram mattermost element matrix zulip rocketdotchat jira confluence'],
];

// Fluent: curated generic devices, servers, security and incident-response symbols. [name, label, type, tags]
const FLUENT_ICONS = [
    ['laptop', 'Laptop', 'interactor', ['workstation']], ['desktop', 'Desktop', 'interactor', ['workstation']],
    ['phone', 'Phone', 'interactor', ['mobile']], ['tablet', 'Tablet', 'interactor', ['mobile']],
    ['person', 'Person', 'interactor', ['human']], ['people', 'People', 'interactor', ['human']], ['people_team', 'Team', 'interactor', ['human']],
    ['bot', 'Bot', 'interactor', ['bot']], ['building', 'Office / site', 'interactor', []],
    ['server', 'Server', 'process', ['host']], ['database', 'Database', 'datastore', ['database']],
    ['storage', 'Storage', 'datastore', ['object-storage']], ['hard_drive', 'Hard drive', 'datastore', ['local-disk']],
    ['folder', 'Folder / file share', 'datastore', ['file-share']], ['document', 'Document', 'datastore', ['documents']],
    ['document_lock', 'Protected document', 'datastore', ['documents']], ['cloud', 'Cloud', 'process', ['cloud-host']],
    ['router', 'Router', 'infrastructure', ['network-device']], ['virtual_network', 'Virtual network', 'infrastructure', ['network-device']],
    ['wifi_1', 'Wi-Fi', 'infrastructure', ['network-device']], ['globe', 'Internet', 'interactor', []],
    ['plug_connected', 'Connector', 'process', ['integration']], ['mail', 'Email', 'process', ['email']],
    ['shield', 'Shield', 'infrastructure', ['security-control']], ['shield_lock', 'Firewall / protection', 'infrastructure', ['security-control']],
    ['shield_checkmark', 'Security check passed', 'infrastructure', ['security-control']], ['shield_error', 'Security alert', 'process', ['monitoring']],
    ['shield_task', 'Security task', 'process', ['security-control']], ['lock_shield', 'Encryption', 'infrastructure', ['security-control']],
    ['lock_closed', 'Lock', 'infrastructure', ['security-control']], ['key', 'Key', 'datastore', ['secrets']],
    ['key_multiple', 'Keys / secrets', 'datastore', ['secrets']], ['password', 'Password', 'datastore', ['secrets']],
    ['certificate', 'Certificate', 'datastore', ['secrets']], ['fingerprint', 'Biometric', 'process', ['biometric']],
    ['bug', 'Bug / malware', 'interactor', ['threat-actor']], ['warning', 'Warning', 'process', ['monitoring']],
    ['alert', 'Alert', 'process', ['monitoring']], ['error_circle', 'Incident', 'process', ['monitoring']],
    ['fire', 'Incident (critical)', 'process', ['monitoring']], ['eye', 'Monitoring', 'process', ['monitoring']],
    ['search', 'Investigation', 'process', ['monitoring']], ['beaker', 'Sandbox / test', 'process', ['non-prod']],
    ['code', 'Code', 'process', ['app-code']], ['code_block', 'Code block', 'process', ['app-code']],
    ['window_console', 'Terminal', 'process', ['script']], ['window_dev_tools', 'Developer tools', 'process', ['app-code']],
    ['branch', 'Branch', 'process', ['ci-cd']], ['branch_fork', 'Fork', 'process', ['ci-cd']], ['pipeline', 'Pipeline', 'process', ['ci-cd']],
    ['box', 'Package', 'process', ['supply-chain']], ['cube', 'Container', 'process', ['container']], ['apps', 'Applications', 'process', ['web']],
    ['data_usage', 'Analytics', 'process', ['analytics']], ['calendar', 'Scheduled job', 'process', ['scheduler']],
    ['server_multiple', 'Server cluster', 'process', ['host']],
    ['server_surface', 'Rack server', 'process', ['host']],
    ['server_surface_multiple', 'Server rack', 'process', ['host']],
    ['server_link', 'Linked server', 'process', ['host']],
    ['server_play', 'Application server', 'process', ['host', 'web']],
    ['developer_board', 'Embedded board', 'process', ['iot']],
    ['developer_board_lightning', 'Firmware', 'process', ['iot']],
    ['memory', 'Memory', 'datastore', ['local-disk']],
    ['network_adapter', 'Network adapter', 'infrastructure', ['network-device']],
    ['network_check', 'Network check', 'infrastructure', ['network-device']],
    ['virtual_network_toolbox', 'Network management', 'infrastructure', ['network-device']],
    ['wifi_lock', 'Secured Wi-Fi', 'infrastructure', ['network-device']],
    ['wifi_warning', 'Open Wi-Fi', 'infrastructure', ['network-device', 'open-access']],
    ['bluetooth', 'Bluetooth', 'infrastructure', ['network-device']],
    ['sim', 'SIM / cellular', 'infrastructure', ['network-device']],
    ['link', 'Link', 'process', ['integration']],
    ['plug_disconnected', 'Disconnected link', 'process', ['integration']],
    ['usb_stick', 'USB stick', 'datastore', ['removable-media']],
    ['usb_plug', 'USB device', 'interactor', ['removable-media']],
    ['database_multiple', 'Databases', 'datastore', ['database']],
    ['database_stack', 'Database cluster', 'datastore', ['database']],
    ['database_link', 'Linked database', 'datastore', ['database']],
    ['database_search', 'Search index', 'datastore', ['nosql']],
    ['table', 'Table', 'datastore', ['database']],
    ['table_lock', 'Protected table', 'datastore', ['database']],
    ['archive', 'Archive', 'datastore', ['object-storage']],
    ['archive_multiple', 'Archives', 'datastore', ['object-storage']],
    ['archive_settings', 'Backup', 'datastore', ['object-storage']],
    ['folder_zip', 'Compressed files', 'datastore', ['file-share']],
    ['folder_link', 'Shared folder', 'datastore', ['file-share']],
    ['document_key', 'Key file', 'datastore', ['secrets']],
    ['document_search', 'Document search', 'process', ['documents']],
    ['document_error', 'Corrupt document', 'datastore', ['documents']],
    ['data_bar_vertical', 'Report', 'process', ['analytics']],
    ['data_trending', 'Metrics', 'process', ['monitoring']],
    ['laptop_shield', 'Managed laptop', 'interactor', ['workstation']],
    ['laptop_settings', 'Admin laptop', 'interactor', ['workstation', 'admin']],
    ['desktop_mac', 'Mac', 'interactor', ['workstation']],
    ['desktop_tower', 'Tower PC', 'interactor', ['workstation']],
    ['desktop_keyboard', 'Workstation', 'interactor', ['workstation']],
    ['desktop_signal', 'Remote desktop', 'process', ['remote-admin']],
    ['desktop_cursor', 'Kiosk', 'interactor', ['kiosk']],
    ['phone_desktop', 'Phone and desktop', 'interactor', ['mobile']],
    ['phone_laptop', 'Phone and laptop', 'interactor', ['mobile']],
    ['phone_lock', 'Locked phone', 'interactor', ['mobile']],
    ['phone_key', 'Phone authenticator', 'process', ['identity']],
    ['tablet_laptop', 'Tablet and laptop', 'interactor', ['mobile']],
    ['device_meeting_room', 'Meeting room device', 'interactor', ['iot']],
    ['tv', 'Smart TV', 'interactor', ['iot']],
    ['xbox_console', 'Game console', 'interactor', ['iot']],
    ['keyboard', 'Keyboard', 'interactor', []],
    ['scan_qr_code', 'QR code', 'process', ['qr']],
    ['scan_camera', 'Camera / scanner', 'interactor', ['iot']],
    ['iot', 'IoT device', 'interactor', ['iot']],
    ['iot_alert', 'IoT alert', 'process', ['iot', 'monitoring']],
    ['person_available', 'User online', 'interactor', ['human']],
    ['person_question_mark', 'Unknown user', 'interactor', ['human']],
    ['guest', 'Guest', 'interactor', ['human']],
    ['people_audience', 'Public users', 'interactor', ['human']],
    ['people_team_toolbox', 'Ops team', 'interactor', ['admin']],
    ['people_settings', 'Administrators', 'interactor', ['admin']],
    ['app_generic', 'Application', 'process', ['web']],
    ['app_store', 'App store', 'process', ['supply-chain']],
    ['apps_list', 'App catalogue', 'process', ['web']],
    ['apps_settings', 'App settings', 'datastore', ['config']],
    ['apps_shield', 'Protected apps', 'process', ['security-control']],
    ['app_title', 'App window', 'process', ['web']],
    ['window', 'Window', 'process', ['web']],
    ['window_apps', 'Web portal', 'process', ['web']],
    ['window_new', 'New window', 'process', ['web']],
    ['window_settings', 'Configuration', 'datastore', ['config']],
    ['window_wrench', 'Admin console', 'process', ['admin']],
    ['window_shield', 'Protected app', 'process', ['security-control']],
    ['web_asset', 'Web asset', 'process', ['web']],
    ['globe_desktop', 'Website', 'process', ['web']],
    ['globe_search', 'Web search', 'process', ['web']],
    ['globe_person', 'Public website', 'process', ['web']],
    ['globe_shield', 'Web protection', 'infrastructure', ['security-control']],
    ['mail_shield', 'Mail gateway', 'infrastructure', ['email', 'security-control']],
    ['chat_lock', 'Secure chat', 'process', ['messaging']],
    ['video_security', 'Security camera', 'interactor', ['iot']],
    ['settings', 'Settings', 'datastore', ['config']],
    ['toolbox', 'Toolbox', 'process', []],
    ['wrench', 'Maintenance', 'process', ['admin']],
    ['cloud_database', 'Cloud database', 'datastore', ['database']],
    ['cloud_desktop', 'Cloud desktop', 'process', ['cloud-host']],
    ['cloud_cube', 'Cloud container', 'process', ['container']],
    ['cloud_flow', 'Cloud workflow', 'process', ['integration']],
    ['cloud_link', 'Cloud connection', 'process', ['integration']],
    ['cloud_sync', 'Cloud sync', 'process', ['integration']],
    ['cloud_archive', 'Cloud backup', 'datastore', ['object-storage']],
    ['cloud_checkmark', 'Cloud healthy', 'process', ['monitoring']],
    ['cloud_error', 'Cloud outage', 'process', ['monitoring']],
    ['cloud_off', 'Offline', 'process', []],
    ['cloud_bidirectional', 'Hybrid cloud', 'process', ['cloud-host']],
    ['cloud_swap', 'Cloud migration', 'process', ['integration']],
    ['cloud_add', 'New cloud resource', 'process', ['cloud-host']],
    ['shield_keyhole', 'Access control', 'infrastructure', ['security-control']],
    ['shield_person', 'Identity protection', 'process', ['identity']],
    ['shield_dismiss', 'Security failure', 'process', ['monitoring']],
    ['shield_prohibited', 'Blocked', 'infrastructure', ['security-control']],
    ['shield_globe', 'Network protection', 'infrastructure', ['security-control', 'network-device']],
    ['shield_badge', 'Compliance', 'process', ['security-control']],
    ['shield_question', 'Security review', 'process', ['security-control']],
    ['warning_shield', 'Threat warning', 'process', ['monitoring']],
    ['lock_open', 'Unlocked', 'process', ['open-access']],
    ['lock_multiple', 'Encryption keys', 'datastore', ['secrets']],
    ['key_reset', 'Key rotation', 'process', ['secrets']],
    ['key_command', 'Signing key', 'datastore', ['secrets']],
    ['person_lock', 'Locked account', 'interactor', ['human']],
    ['person_key', 'User credentials', 'datastore', ['secrets']],
    ['person_shield', 'Protected user', 'interactor', ['human']],
    ['person_warning', 'Compromised user', 'interactor', ['threat-actor']],
    ['people_lock', 'Private group', 'interactor', ['human']],
    ['incognito', 'Anonymous attacker', 'interactor', ['threat-actor']],
    ['eye_off', 'Hidden / stealth', 'interactor', ['threat-actor']],
    ['bug_prohibited', 'Malware blocked', 'infrastructure', ['security-control']],
    ['bug_arrow_counterclockwise', 'Malware recurring', 'interactor', ['threat-actor']],
    ['alert_urgent', 'Urgent alert', 'process', ['monitoring']],
    ['alert_badge', 'Alert badge', 'process', ['monitoring']],
    ['prohibited', 'Denied', 'infrastructure', ['security-control']],
    ['radar', 'Detection', 'process', ['monitoring']],
    ['target_arrow', 'Target', 'process', []],
    ['gauge', 'Risk gauge', 'process', ['monitoring']],
    ['timer', 'Timer', 'process', ['scheduler']],
    ['clock_lock', 'Session timeout', 'process', ['identity']],
    ['history', 'Audit history', 'datastore', ['logs']],
    ['box_search', 'Package scan', 'process', ['supply-chain', 'security-control']],
    ['box_toolbox', 'Build tools', 'process', ['ci-cd']],
    ['code_cs', 'C#', 'process', ['app-code']],
    ['code_js', 'JavaScript', 'process', ['app-code']],
    ['code_py', 'Python', 'process', ['app-code']],
    ['code_ts', 'TypeScript', 'process', ['app-code']],
    ['code_text', 'Source file', 'process', ['app-code']],
    ['braces', 'JSON / API payload', 'process', ['api']],
    ['braces_variable', 'Variables', 'datastore', ['config']],
    ['branch_compare', 'Code review', 'process', ['ci-cd']],
    ['branch_request', 'Pull request', 'process', ['ci-cd']],
    ['flow', 'Workflow', 'process', ['integration']],
    ['cube_tree', 'Dependency tree', 'process', ['supply-chain']],
    ['cube_link', 'Linked module', 'process', ['supply-chain']],
    ['brain_circuit', 'AI model', 'process', ['llm']],
    ['bot_sparkle', 'AI assistant', 'process', ['llm']],
    ['arrow_sync', 'Sync job', 'process', ['scheduler']],
    ['arrow_download', 'Download', 'process', []],
    ['arrow_upload', 'Upload', 'process', []],
];

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
            name: group === 'Legacy'
                ? product.replace(/[_-]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase()).replace(/\b(Gke|Iam|Kms|Vpc|Dns|Api|Sql|Cdn|Nat|Vpn|Ai|Ml|Iot)\b/g, w => w.toUpperCase())
                : product.replace(/\s*_\s*/g, ' & '),
            category: group === 'Category Icons' ? 'Category' : 'Product', svgText: fs.readFileSync(f, 'utf8'),
        }));
    }
    if (set === 'devicon') {
        const index = JSON.parse(fs.readFileSync(path.join(dir, 'devicon.json'), 'utf8'));
        const byName = new Map(index.map(e => [e.name, e]));
        return files.map(f => {
            const key = path.basename(f, '.svg').replace(/-(original|plain|line)(-wordmark)?$/, '');
            const e = byName.get(key) || { name: key, tags: [] };
            const label = DEVICON_LABELS[key] || key.charAt(0).toUpperCase() + key.slice(1);
            const tags = Array.isArray(e.tags) ? e.tags : [];
            if (OS_NAMES.test(key)) return { name: label, category: 'Operating system', svgText: fs.readFileSync(f, 'utf8'), type: 'process', tags: ['host'] };
            if (tags.includes('language')) return { name: label, category: 'Language', svgText: fs.readFileSync(f, 'utf8'), type: 'process', tags: ['app-code'] };
            return { name: label, category: tags.join(' ') || 'Technology', svgText: fs.readFileSync(f, 'utf8') };
        });
    }
    if (set === 'brands') {
        const data = JSON.parse(fs.readFileSync(path.join(dir, 'data', 'simple-icons.json'), 'utf8'));
        const bySlug = new Map(data.map(d => [d.slug, d]));
        const permissive = (d) => !d.license || ['CC0-1.0', 'MIT', 'Apache-2.0', 'CC-BY-4.0', 'CC-BY-SA-4.0'].includes(d.license.type);
        const out = [];
        BRAND_GROUPS.forEach(([group, type, tags, slugs]) => slugs.split(/\s+/).forEach(slug => {
            const d = bySlug.get(slug);
            const file = path.join(dir, 'icons', `${slug}.svg`);
            if (!d || !permissive(d) || !fs.existsSync(file)) return;
            const hex = /^[0-9A-F]{6}$/i.test(d.hex) ? d.hex : '333333';
            out.push({ name: d.title, category: group, type, tags: [...tags],
                svgText: fs.readFileSync(file, 'utf8').replace(/^<svg/i, `<svg fill="#${hex}"`) });
        }));
        return out;
    }
    if (set === 'fluent') {
        const icons = path.join(dir, 'icons');
        return FLUENT_ICONS.map(([name, label, type, tags]) => {
            const file = [`${name}_color.svg`, `${name}_32_regular.svg`, `${name}_28_regular.svg`, `${name}_24_regular.svg`, `${name}_20_regular.svg`, `${name}_16_regular.svg`, `${name}_12_regular.svg`]
                .map(n => path.join(icons, n)).find(fs.existsSync);
            return file ? { name: label, category: 'Fluent', type, tags: [...tags], svgText: fs.readFileSync(file, 'utf8') } : null;
        }).filter(Boolean);
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
    const ids = new Set(), names = new Set();
    let skipped = 0, duplicates = 0;
    const icons = [];
    const catchAll = (c) => /^(other|new icons|general|mobile|menu|azure ecosystem)$/i.test(c) ? 1 : 0;
    collect(set, dir).sort((a, b) => a.name.localeCompare(b.name) || catchAll(a.category) - catchAll(b.category) || a.category.localeCompare(b.category)).forEach(it => {
        const key = it.name.toLowerCase();
        if (names.has(key)) { duplicates++; return; }   // one tile per name (Azure ships some icons in several folders)
        const svg = cleanSvg(it.svgText);
        if (!svg || !it.name) { skipped++; return; }
        names.add(key);
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
    return { set, icons: icons.length, skipped, duplicates, bytes: fs.statSync(file).size };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
    const [set, dir] = process.argv.slice(2);
    if (!set || !dir) { console.error('Usage: node scripts/build-stencils.mjs <set> <extractedDir>'); process.exit(2); }
    console.log(JSON.stringify(build(set, path.resolve(dir))));
}
