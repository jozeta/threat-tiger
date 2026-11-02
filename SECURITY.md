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

## Supported versions

Only the latest version on the `main` branch receives security fixes.
