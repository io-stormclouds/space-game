import { defineConfig } from 'vitest/config';

// Plain vitest for framework-free packages (domain, api, mock-server from F1/F2 on).
// Angular components (apps/game, packages/ui) run under `ng test`, which compiles them AOT.
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['packages/*/src/**/*.spec.ts', 'tools/*/src/**/*.spec.ts'],
    exclude: ['packages/ui/**', '**/node_modules/**'],
    passWithNoTests: true,
  },
});
