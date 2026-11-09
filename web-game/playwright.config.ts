import { defineConfig, devices } from '@playwright/test';

// E2E_PORT: another port when a dev server already runs on 4420 (it would be reused as is).
const PORT = Number(process.env['E2E_PORT'] ?? 4420);
const CI = Boolean(process.env['CI']);

// E2E_REMOTE=1 (npm run e2e:remote): also the game server in DEV_MODE and the project that plays through it.
const REMOTE = process.env['E2E_REMOTE'] === '1';
const SERVER_PORT = Number(process.env['E2E_SERVER_PORT'] ?? 8090);
const SERVER_BIN = process.env['E2E_SERVER_BIN'] ?? '../server/target/release/game-server';

const browser = {
  ...devices['Desktop Chrome'],
  viewport: { width: 1440, height: 900 },
  // E2E_CHANNEL=chrome runs an installed Chrome instead of the bundled Chromium (no browser download).
  ...(process.env['E2E_CHANNEL'] ? { channel: process.env['E2E_CHANNEL'] } : {}),
  // WebGL in headless Chromium without a GPU (CI): software rasteriser.
  launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] },
};

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
      use: browser,
    },
    {
      // Plan 02 B3: the same tests on the Rust game session (WebAssembly) instead of the TS mock.
      // `npm run e2e:wasm` builds the module first; the app picks the API from localStorage `sg.api`.
      name: 'chromium-wasm',
      use: {
        ...browser,
        storageState: { cookies: [], origins: [{ origin: `http://localhost:${PORT}`, localStorage: [{ name: 'sg.api', value: 'wasm' }] }] },
      },
    },
    ...(REMOTE
      ? [
          {
            // Plan 02 B4: the same tests through the network server (WebSocket); each test is a new guest account.
            name: 'chromium-remote',
            use: {
              ...browser,
              storageState: {
                cookies: [],
                origins: [
                  {
                    origin: `http://localhost:${PORT}`,
                    localStorage: [
                      { name: 'sg.api', value: 'remote' },
                      { name: 'sg.server', value: `ws://127.0.0.1:${SERVER_PORT}/ws` },
                    ],
                  },
                ],
              },
            },
          },
        ]
      : []),
  ],
  webServer: [
    {
      command: `npx ng serve --port ${PORT}`,
      url: `http://localhost:${PORT}`,
      reuseExistingServer: !CI,
      timeout: 120_000,
    },
    ...(REMOTE
      ? [
          {
            command: SERVER_BIN,
            url: `http://127.0.0.1:${SERVER_PORT}/health`,
            reuseExistingServer: false,
            timeout: 60_000,
            env: { DEV_MODE: 'true', ADDR: `127.0.0.1:${SERVER_PORT}`, DATA_DIR: '../server/target/e2e-data' },
          },
        ]
      : []),
  ],
});
