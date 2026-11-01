# Threat templates

`threat_templates.json` is Threat Tiger's threat library. Each component type has its own list: `process`, `datastore`, `interactor` (external entity), `infrastructure` and `flow` (data flow). The Threat Templates panel shows a component's list in three groups:

1. **Triggered by this model**: templates whose `when` condition holds for the component, shown with the reason ("not encrypted; crosses "DMZ"").
2. **Relevant for this component**: templates whose `subtypes` match what the component was recognised as from its icon and name (e.g. *API*, *object storage bucket*, *administrator*).
3. **More threats**: everything else for that component type.

Every suggestion should end in a decision: add it to the register, or mark it **Not applicable** with a reason. Reasons are stored in the model and listed in the Markdown report.

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
| `refs` | recommended | `CWE-n`, `CAPEC-n`, `ATT&CK Tnnnn[.nnn]` / `ATT&CK TAnnnn`, `OWASP APIn:2023`, `OWASP Ann:2021`, `GDPR Art. 5…`. These become links. |
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
| `subtype: "name"` or `[...]` | component / flow | The item was recognised as one of these subtypes |
| `inbound` / `outbound` / `anyFlow: {…}` | component | At least one connected flow (incoming / outgoing / any) satisfies the inner condition |
| `endpoint` / `source` / `target: {…}` | flow | Either end / the source / the target component satisfies the inner condition |
| `any: [ … ]`, `all: [ … ]`, `not: { … }` | any | Logical combinations |

**Switches:** `encrypted`, `authenticated` (flows) · `runAsAdmin`, `loggingEnabled`, `handlesSensitiveData`, `isCrownJewel` (processes) · `auditLogged`, `storesCredentials`, `storesPii`, `encryptedAtRest`, `handlesSensitiveData`, `isCrownJewel` (data stores) · `unauthAccess`, `isPrivilegedUser`, `mfaRequired`, `vpnRequired` (external entities).

**Subtypes** are inferred from the icon and from keywords in the name and notes:
- **Components:** `web`, `api`, `identity`, `ci-cd`, `serverless`, `container`, `database`, `nosql`, `object-storage`, `cache`, `queue`, `file-share`, `secrets`, `logs`, `human`, `admin`, `partner-system`, `mobile`, `iot`, `cloud-host`, `host`, `network-device`, `email`.
- **Flows**, from the name and ports: `webhook`, `messaging`, `http`, `remote-admin`.

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
