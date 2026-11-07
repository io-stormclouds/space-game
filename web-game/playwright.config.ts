import { defineConfig, devices } from '@playwright/test';

const PORT = 4420;
const CI = Boolean(process.env['CI']);

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: CI,
  retries: 0,
  // Every test renders WebGL in software (SwiftShader) on the CPU: more than ~6 browsers at once
  // starve each other and the frame-based view tests time out (12 workers did on 24 cores).
  workers: CI ? 2 : 6,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
        // WebGL in headless Chromium without a GPU (CI): software rasteriser.
        launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] },
      },
    },
  ],
  webServer: {
    command: `npx ng serve --port ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !CI,
    timeout: 120_000,
  },
});
