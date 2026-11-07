import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

// Harness of the planet/system view: `npx vite packages/render/harness/system --port 4431`.
// The KayKit models come from the app's public folder, served at /assets/kaykit/.
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  publicDir: fileURLToPath(new URL('../../../../apps/game/public', import.meta.url)),
  server: { strictPort: true },
});
