# Threat Tiger — static site served by unprivileged nginx (audit finding SEC-007).
#   docker build -t threat-tiger .
#   docker run -d --name threat-tiger -p 8080:8080 threat-tiger
#   open http://localhost:8080/
#
# Builds from the files in this folder (not from GitHub), pins the base image by digest,
# runs as a non-root user, ships no git or other tooling, and sets security headers (deploy/nginx.conf).
FROM nginxinc/nginx-unprivileged:1.30.5-alpine@sha256:56b8272e43a0525f67aed68d1e0794a712d10e3e45a563e118e9a77c817e6f86

# Files are owned by root and read-only for the nginx user.
COPY --chown=root:root deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --chown=root:root threat-tiger.html threat_templates.json demo.json favicon.ico Threat_tigerS.png Threat_tiger_840.webp /usr/share/nginx/html/
COPY --chown=root:root vendor/ /usr/share/nginx/html/vendor/

EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --retries=3 CMD wget -q -O /dev/null http://127.0.0.1:8080/threat-tiger.html || exit 1
