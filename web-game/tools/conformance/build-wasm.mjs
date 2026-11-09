// Builds the Rust game session for the browser (server/crates/game-wasm, plan 02 B3) and copies the
// module where the app serves it: apps/game/public/wasm/game_wasm.wasm (git-ignored; the TS mock
// stays the default API, so the web build does not need Rust). Usage: npm run wasm:build
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { readFileSync } from 'node:fs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const server = resolve(root, '../server');
const out = join(root, 'apps/game/public/wasm/game_wasm.wasm');

// cargo from PATH, else rustup's default location (installed without touching PATH)
const exe = process.platform === 'win32' ? 'cargo.exe' : 'cargo';
const local = join(homedir(), '.cargo', 'bin', exe);
const cargo = existsSync(local) ? local : 'cargo';

execFileSync(cargo, ['build', '-p', 'game-wasm', '--target', 'wasm32-unknown-unknown', '--profile', 'wasm'], {
  cwd: server,
  stdio: 'inherit',
});
const built = join(server, 'target/wasm32-unknown-unknown/wasm/game_wasm.wasm');
mkdirSync(dirname(out), { recursive: true });
copyFileSync(built, out);
const size = statSync(out).size;
const gz = gzipSync(readFileSync(out)).length;
console.log(`game_wasm.wasm → ${out}: ${(size / 1024).toFixed(0)} kB, ${(gz / 1024).toFixed(0)} kB gzip`);
