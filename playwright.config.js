// Dev-only test configuration. The app itself has no build step.
// Uses the locally installed Microsoft Edge, so no browser download is needed.
const { defineConfig } = require('@playwright/test');

const PORT = 4173;

module.exports = defineConfig({
  testDir: './tests',
  fullyParallel: true,
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    channel: process.env.PW_CHANNEL || 'msedge',
    headless: true,
    viewport: { width: 1600, height: 1000 },
    acceptDownloads: true,
  },
  webServer: {
    command: `node scripts/serve.mjs`,
    env: { PORT: String(PORT) },
    url: `http://127.0.0.1:${PORT}/threat-tiger.html`,
    reuseExistingServer: true,
    stdout: 'ignore',
  },
});
