// Plan 02 B4: the e2e tests played through the network game server. Builds `game-server` (release),
// then runs Playwright with E2E_REMOTE=1: the server starts in DEV_MODE on port 8090 with its data in
// server/target/e2e-data, and the `chromium-remote` project plays through it. Extra arguments go
// to Playwright (e.g. a test file).
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const server = resolve(root, '../server');
const exe = process.platform === 'win32' ? '.exe' : '';
const local = join(homedir(), '.cargo', 'bin', `cargo${exe}`);
const cargo = existsSync(local) ? local : 'cargo';
execFileSync(cargo, ['build', '--release', '-p', 'game-server'], { cwd: server, stdio: 'inherit' });
rmSync(join(server, 'target/e2e-data'), { recursive: true, force: true });
const bin = join(server, 'target/release', `game-server${exe}`);
const r = spawnSync('npx', ['playwright', 'test', '--project=chromium-remote', ...process.argv.slice(2)], {
  cwd: root,
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, E2E_REMOTE: '1', E2E_SERVER_BIN: bin },
});
process.exit(r.status ?? 1);
