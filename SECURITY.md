# Security Policy

## Reporting a vulnerability

Please **do not open a public issue** for security problems.

Report it privately through GitHub instead: go to the **Security** tab of this repository and click
**Report a vulnerability** ([direct link](https://github.com/jozeta/threat-tiger/security/advisories/new)).
Include what you found, how to reproduce it, and the impact you expect.

This is a personal project maintained in spare time. You can expect an acknowledgement within a
week. Fixes are released as soon as practical, and you'll be credited in the advisory unless you
prefer otherwise.

## Scope

Threat models describe weaknesses of real systems, so of particular interest are: script execution
through imported models, templates or images (XSS / CSP bypass), any data leaving the browser without
the user's consent, and weaknesses in the Docker image or nginx configuration in `deploy/`.

## Git sync (GitHub / GitLab)

Git sync is off until you set it up under **☰ → Settings…**. Then, and only when you press the sync button,
the model is sent to and loaded from the server you entered (GitHub, GitLab, or a self-hosted instance).

- The access token is stored in this browser's localStorage **encrypted** with AES-GCM; the key is derived
  from your passphrase with PBKDF2-SHA-256 (310,000 iterations) and bound to the server address. The
  passphrase is never stored; the unlocked token is kept in memory only until the page is closed.
- The model and its exports contain the sync settings (service, server, repository, branch, file), never the token.
- A loaded repository file is treated like any imported model (validated, never rendered as markup).
- A model can name a sync target, but nothing is sent until you confirm that exact target (server, repository,
  branch, file) with **Connect** in this browser; loading the repository copy never changes the target.
- To allow self-hosted servers, the page's Content-Security-Policy permits `connect-src https:`. The app itself
  only connects to the server in your sync settings; the wider policy means a script injection bug could reach any
  https host, so reports about escaping bugs are especially welcome.
- Use a token limited to the one repository (GitHub fine-grained token with Contents: Read and write; GitLab
  project access token), and keep the repository private.

## Live status

Live status is off until you turn it on (**☰ → View → Live status**, or **Settings → Live status**); the switch,
the refresh interval and the hosts you allowed are kept in this browser only. When it is on, the browser contacts:

- each **status source** in the model (a Google Sheet, CSV or JSON address): a `GET` request for that address;
- for a **Web** check, the address you entered (`GET`; if the server does not allow CORS, a second `no-cors` `GET`
  that only tells whether it answered); for a **Reachability** check, a `HEAD` request to it;
- for a **DNS** check, the DNS-over-HTTPS service you chose (Cloudflare `cloudflare-dns.com` or Google `dns.google`),
  which receives the **host name** being looked up.

Requests carry no cookies or credentials (`credentials: 'omit'`), no referrer, and are not cached; the browser's IP
address and user agent are visible to each host, as with any request. Redirects are followed (Google's "Publish to
web" CSV links redirect to `googleusercontent.com`). Addresses must be `https://` without a user name or password;
plain `http://` stays blocked by the Content-Security-Policy, which is unchanged (`connect-src https:`).

- **Nothing is contacted before you allow its host in this browser.** The first time a host is needed, Settings →
  Live status lists it and asks; allowed hosts are stored under `threat_tiger_live_approved` and removed by
  "Forget all allowed hosts" or "Clear all data in this browser". A model from someone else can name any host,
  but it cannot make the browser contact one you have not allowed; until then its shapes show a grey "waiting
  for approval" dot.
- Sources and rules are part of the model and its exports; **results are not**: they stay in memory in the open
  tab and never reach the model, undo history, History snapshots or JSON exports. A PNG export or print shows
  the colours on screen at that moment. A change of state (for example up → down) is written to the activity log.
- Everything read from a source is untrusted: CSV and JSON are parsed as data, values are only shown as text,
  replies over 2 MB are refused, and every model field (addresses, columns, rule values, colours `#rrggbb` only,
  icons as Bootstrap icon names, labels) is validated on import.
- Review mode freezes the layout only, so status rules and sources stay editable in it (like other properties
  and the git sync settings).

## Supported versions

Only the latest version on the `main` branch receives security fixes.
