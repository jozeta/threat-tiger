// Dev-only test configuration. The app itself has no build step.
// Uses the locally installed Microsoft Edge, so no browser download is needed.
const { defineConfig } = require('@playwright/test');

const PORT = 4173;
// Set PW_BASE_URL to test a running deployment instead (e.g. the Docker container): PW_BASE_URL=http://127.0.0.1:8080 npm test
const EXTERNAL = process.env.PW_BASE_URL;

module.exports = defineConfig({
  testDir: './tests',
  fullyParallel: true,
  reporter: [['list']],
  use: {
    baseURL: EXTERNAL || `http://127.0.0.1:${PORT}`,
    channel: process.env.PW_CHANNEL || 'msedge',
    headless: true,
    viewport: { width: 1600, height: 1000 },
    acceptDownloads: true,
  },
  webServer: EXTERNAL ? undefined : {
    command: `node scripts/serve.mjs`,
    env: { PORT: String(PORT) },
    url: `http://127.0.0.1:${PORT}/threat-tiger.html`,
    reuseExistingServer: true,
    stdout: 'ignore',
  },
});
