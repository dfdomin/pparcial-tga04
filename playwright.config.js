// @ts-check
const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  timeout: 60000,
  expect: { timeout: 10000 },
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: 'http://localhost:8765',
        viewport: { width: 1280, height: 800 },
        actionTimeout: 10000,
      },
    },
  ],
  webServer: {
    command: 'python3 -m http.server 8765',
    url: 'http://localhost:8765/',
    reuseExistingServer: true,
    timeout: 10000,
  },
});
