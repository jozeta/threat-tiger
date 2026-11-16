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
- To allow self-hosted servers, the page's Content-Security-Policy permits `connect-src https:`. The app itself
  only connects to the server in your sync settings; the wider policy means a script injection bug could reach any
  https host, so reports about escaping bugs are especially welcome.
- Use a token limited to the one repository (GitHub fine-grained token with Contents: Read and write; GitLab
  project access token), and keep the repository private.

## Supported versions

Only the latest version on the `main` branch receives security fixes.
