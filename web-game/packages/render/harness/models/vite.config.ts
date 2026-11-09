import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

// Contact sheet of the structure models: `npx vite packages/render/harness/models --port 4432`.
// The KayKit models come from the app's public folder, served at /assets/kaykit/.
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  publicDir: fileURLToPath(new URL('../../../../apps/game/public', import.meta.url)),
  server: { strictPort: true },
});
