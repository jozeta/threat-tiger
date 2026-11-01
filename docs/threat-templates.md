# Threat templates

`threat_templates.json` is Threat Tiger's threat library. Each component type has its own list: `process`, `datastore`, `interactor` (external entity), `infrastructure` and `flow` (data flow). The Threat Templates panel shows a component's list in three groups:

1. **Triggered by this model**: templates whose `when` condition holds for the component, shown with the reason ("not encrypted; crosses "DMZ"", "incoming flow "HTTPS" comes from "Customer" (external entity)").
2. **Relevant for this component**: templates whose `subtypes` match what the component was recognised as from its icon and name (e.g. *API*, *object storage bucket*, *administrator*).
3. **More threats**: everything else for that component type.

The **Insights** tab collects open suggestions for the whole model from groups 1 and 2. Each row shows why it is suggested: the condition's reason, or "recognised as: …" when the icon or name matched. Filters narrow the list by component, STRIDE category and reason ("from switches, flows and boundaries" or "from the icon or name"). **Add all** / **Add N shown** adds what the filters show. Long lists show the first 150 rows until you choose **Show all**. The Markdown report lists model-triggered findings one by one and summarises the recognised ones per component.

Every suggestion should end in a decision:
- **Add** it to the register. Added suggestions leave the list; a note shows how many were added.
- **Ignore** it. This hides it for that component without a reason. It appears under "Hidden" with **Show again**, and as "Ignored" in Insights and the report.
- Mark it **Not applicable** with a reason. The reason is stored in the model and listed in the Markdown report.

## Template fields

```json
{
  "id": "TT-P05",
  "category": "Information Disclosure",
  "title": "Broken object-level authorization (IDOR) in [name]",
  "desc": "What the attacker does and what it leads to.",
  "controls": ["Concrete control 1", "Concrete control 2"],
  "refs": ["CWE-639", "OWASP API1:2023", "OWASP A01:2021"],
  "example": "First American Financial (2019): …",
  "likelihood": 4,
  "impact": 5,
  "subtypes": ["api", "web"],
  "when": { "on": "handlesSensitiveData", "inbound": { "crossesBoundary": true } }
}
```

| Field | Required | Meaning |
|---|---|---|
| `id` | yes for built-ins | Stable identifier. Built-in templates with an id update automatically in users' browsers unless the user edited their copy. Threats created from a template remember it (`templateId`), so the same suggestion is not offered twice. |
| `category` | yes | STRIDE category. It must fit the element type (data stores: T, R, I, D · external entities: S, R, I · data flows: T, I, D). |
| `title` | yes | Short and concrete. `[name]` is replaced with the component's name. |
| `desc` | yes | What happens and why it matters, in plain language. |
| `controls` | recommended | Concrete, checkable controls. They are copied into the threat's description. |
| `refs` | recommended | `CWE-n`, `CAPEC-n`, `ATT&CK Tnnnn[.nnn]` / `ATT&CK TAnnnn`, `OWASP APIn:2023`, `OWASP Ann:2021`, `OWASP LLMnn:2025`, `OWASP Mn:2024`, `OWASP CICD-SEC-n`, `OWASP Knn:2022`, `RFC n`, `PCI DSS …`, `GDPR Art. 5…`. These become links. |
| `example` | optional | A **publicly documented** incident, with year. Leave it out rather than guess. |
| `likelihood`, `impact` | optional | 1–5. These pre-fill the threat dialog and "Add all". |
| `subtypes` | optional | Relevance hints (see the list below). |
| `when` | optional | Condition that makes the template "triggered" (see below). |

## Conditions (`when`)

All keys inside one object must hold.

| Key | Applies to | Holds when |
|---|---|---|
| `on: "key"` or `["k1","k2"]` | component / flow | All listed security switches are on |
| `off: "key"` | component / flow | The switch exists and is off |
| `anyOn: ["k1","k2"]` | component / flow | At least one is on |
| `crossesBoundary: true` | flow | The flow crosses a trust zone edge or a trust boundary line |
| `type: "datastore"` or `[...]` | component (usually inside `source` / `target` / `endpoint`) | The component is of this type: `process`, `datastore`, `interactor`, `infrastructure` |
| `zoned: true` / `false` | component | The component is (not) drawn inside a trust boundary |
| `subtype: "name"` or `[...]` | component / flow | The item was recognised as one of these subtypes |
| `inbound` / `outbound` / `anyFlow: {…}` | component | At least one connected flow (incoming / outgoing / any) satisfies the inner condition; `{}` means any such flow |
| `endpoint` / `source` / `target: {…}` | flow | Either end / the source / the target component satisfies the inner condition |
| `any: [ … ]`, `all: [ … ]`, `not: { … }` | any | Logical combinations |

**Switches:** `encrypted`, `authenticated` (flows) · `runAsAdmin`, `loggingEnabled`, `handlesSensitiveData`, `isCrownJewel` (processes) · `auditLogged`, `storesCredentials`, `storesPii`, `encryptedAtRest`, `handlesSensitiveData`, `isCrownJewel` (data stores) · `unauthAccess`, `isPrivilegedUser`, `mfaRequired`, `vpnRequired` (external entities).

**Subtypes** are inferred from the icon and from keywords in the name and notes:
- **Components:** `web`, `api`, `graphql`, `identity`, `ci-cd`, `serverless`, `container`, `database`, `nosql`, `object-storage`, `cache`, `queue`, `file-share`, `secrets`, `logs`, `llm`, `payment`, `human`, `admin`, `partner-system`, `mobile`, `iot`, `cloud-host`, `host`, `network-device`, `email`, `dns`, `cdn`, `vpn`.
- **Added in 1.13.0:** `config`, `ledger`, `removable-media`, `local-disk`, `supply-chain`, `scheduler`, `ml-compute`, `kiosk`, `workstation`, `app-code`, `script`, `non-prod`, `integration`, `monitoring`, `analytics`, `security-control`, `open-access`, `biometric`, `threat-actor`, `bot`, `documents`, `health-data`, `executable`, `social`, `cms`, `ecommerce`, `qr`.
- **Flows**, from the name and ports: `webhook`, `messaging`, `http`, `remote-admin`, `identity`, `email`, `database`.

The **Component Label** field suggests names per component type (`NAME_SUGGESTIONS` in `threat-tiger.html`). They are chosen so that the engine recognises them; each suggestion shows the subtype it maps to.

Conditions from imported template files are sanitised: unknown keys are dropped, and nothing is ever executed.

## How the built-in library was curated (1.9.0)

The threats were chosen to be **concrete, current and actionable**. Each one says what the attacker does, comes with controls you can verify, and references an authoritative catalogue. Sources:

- **OWASP API Security Top 10 (2023)** and **OWASP Top 10 (2021; 2025 confirms broken access control at #1 and adds software supply chain failures)**: object-level and function-level authorization, mass assignment, resource consumption, SSRF, unsafe consumption of third-party APIs.
- **OWASP pytm threat library**: the idea of attaching *conditions* to threats, so that suggestions follow from the model.
- **Elevation of Privilege card game** (Adam Shostack / Microsoft): concrete phrasings such as "spend our cloud budget", "write to a data store your code relies on", "compromised a key technology supplier", "escape from a container", "no logs".
- **MITRE CWE, CAPEC and ATT&CK**: identifiers for every threat.
- **Publicly documented incidents**, used as examples only where the facts are well established: Capital One 2019 (SSRF and instance metadata), Uber 2022 (MFA fatigue, credentials in a script), Optus 2022 (an unauthenticated API), First American 2019 (IDOR), MOVEit 2023 (SQL injection), Storm-0558 2023 (token validation, a key in a crash dump), Okta 2023 (session tokens in HAR files), Code Spaces 2014 (backups deleted from the same account), HTTP/2 Rapid Reset 2023, SolarWinds 2020 and xz Utils 2024 (supply chain), Equifax 2017 and Log4Shell 2021 (vulnerable components), Mirai 2016 (default credentials), Target 2013 (vendor access, lateral movement), LastPass 2022 (malware on an engineer's device), Snowflake customer accounts 2024 (credential stuffing without MFA), Change Healthcare 2024 (remote access without MFA), Toyota 2022 (a key in a public repository), Steam 2015 (personalised pages cached for other users), and the "Meow" attacks 2020 (exposed databases wiped).

**Deliberately left out or removed:**
- **Threats on the wrong element.** For example, XSS was listed under external entities; it is a flaw in the web application, so it is now a process threat.
- **Obsolete attacks.** TLS renegotiation DoS: TLS 1.3 removed renegotiation, and modern servers disable client-initiated renegotiation.
- **Out of scope for most application teams.** BGP route hijacking: the relevant control, TLS certificate validation, is covered by its own flow threat.
- **Duplicates.** Two separate SQL injection and two separate command injection entries were merged.
- **Too generic to act on.** Text that restated a STRIDE category without a concrete attack or control.

## 1.10.0 additions

The library grew from 86 to 148 threats, mostly tied to specific kinds of components:
- **AI / LLM services and RAG stores:** OWASP Top 10 for LLM Applications 2025 — prompt injection, sensitive information disclosure, excessive agency, improper output handling, system prompt leakage, unbounded consumption, and vector/RAG poisoning.
- **Payments:** client-side price tampering, card data in logs or storage (PCI DSS), and card testing.
- **GraphQL:** query depth and complexity DoS, and introspection.
- **Web:** CORS, open redirects, clickjacking, WebSocket hijacking, and HTTP request smuggling.
- **Identity:** OAuth/OIDC (RFC 9700), forged SAML assertions, help-desk social engineering, consent phishing, and Kerberoasting.
- **CI/CD:** OWASP Top 10 CI/CD Security Risks — poisoned pipeline execution, secrets in pipelines, and dependency confusion.
- **Mobile:** OWASP Mobile Top 10 2024. **IoT:** cloned device identities, unsigned firmware, and debug ports. **Kubernetes:** OWASP Kubernetes Top 10 — RBAC and secrets.
- **Edge and cloud:** exploited VPN appliances, DNS hijacking and subdomain takeover, CDN cache deception, leaked cloud keys, public snapshots, and DDoS amplification.
- **Data:** queues, secrets stores, log stores, search indexes and file shares.

New verified examples: tj-actions/changed-files 2025, CircleCI 2023, MGM Resorts 2023, Ivanti Connect Secure 2024, Citrix Bleed 2023, GitHub memcached DDoS 2018, Bing Chat system prompt 2023, Exchange ProxyLogon 2021, Golden SAML (SolarWinds campaign), and dependency confusion 2021.

## 1.11.0 coverage

New threats were added wherever the library was thin. The aim was **at least 5 per element type × applicable STRIDE category** (enforced by a test) and **at least 3 per recognised kind of component**. Highlights:
- **Repudiation**, previously the weakest category everywhere: admin audit trails, correlation IDs, clock sync, deleted records, shared database and admin accounts, log retention, cloud control-plane logs, flow logs, and chargeback evidence.
- **Containers, admin portals, mobile backends, legacy hosts and CDNs.**
- **Directory services** (DCSync, too many domain admins), **VPN** (no MFA, flat access) and **mail servers** (open relay, legacy protocols).
- **Data flows:** timeouts, retry storms, backlogs, oversized payloads, webhook replay, token audience, LDAP binds, phishing and forwarding rules, RDP session hijacking, and database connection strings.

| Type | Total | S | T | R | I | D | E |
|---|---:|---:|---:|---:|---:|---:|---:|
| process | 80 | 13 | 19 | 7 | 17 | 11 | 13 |
| infrastructure | 47 | 8 | 8 | 5 | 9 | 5 | 12 |
| datastore | 46 | — | 11 | 8 | 18 | 9 | — |
| interactor | 36 | 17 | — | 8 | 11 | — | — |
| flow | 35 | — | 13 | — | 14 | 8 | — |

## 1.13.0: per-component baselines and icon threats

**Baselines per component type.** Generic threats now trigger from how a component is connected, so every connected component gets suggestions without any switches being set. For example: a process receiving flows from users (injection, error leakage, client-side-only rules, ReDoS); a process calling data stores (over-privileged identity, secrets in code); a process with outgoing calls (no timeouts); a data store written by an external entity directly; sensitive data leaving its zone; an infrastructure node outside every trust boundary (flat network); and flows into data stores (stored injection), to external entities (data leaving your control) or between services without authentication.

**Every icon means something.** Each icon offered for a component type is recognised as a kind of component with at least two tailored threats; only four decorative infrastructure icons (trash, award, columns, P) are not. The icon picker groups icons by that kind ("Database — tailored threats", …). Where a kind already had curated threats for another component type, they are reused (same text, id prefixed with the new type), for example database threats for a database server drawn as infrastructure. New suggested names (batch job, Jupyter server, .env file, package registry, attacker, GPU server, WordPress server, …) pick a matching icon.

New verified examples, each checked against at least two independent reports: exposed .env files (Unit 42, 2024), Ronin bridge (2022), Poly Network (2021), Raspberry Robin (2022), xz utils (2024), Codecov (2021), malicious Hugging Face models (JFrog, 2024), ShadowRay (2024), LeftoverLocals (2024), Uber (2016), Midnight Blizzard via a test tenant (2024), Salesloft Drift OAuth tokens (2025), Dropbox Sign (2024), Grafana CVE-2021-43798, Snowflake customer accounts (2024), CrowdStrike content update (2024), Suprema BioStar 2 (2019), 23andMe (2023), Facebook scraping (2021), Follina (2022), Change Healthcare (2024), 3CX (2023), Twitter (2020), WordPress File Manager (2020), British Airways (2018) and MyEtherWallet BGP hijack (2018).

| Type | Total | S | T | R | I | D | E | Triggered by conditions |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| process | 186 | 24 | 43 | 19 | 43 | 28 | 29 | 22 |
| infrastructure | 210 | 24 | 43 | 24 | 57 | 27 | 35 | 7 |
| datastore | 103 | — | 27 | 21 | 39 | 16 | — | 13 |
| interactor | 63 | 30 | — | 13 | 20 | — | — | 6 |
| flow | 39 | — | 15 | — | 15 | 9 | — | 14 |

601 threats in total, 100 with a real incident example.
