// Writes src/tokens/tokens.generated.css from src/tokens/design-tokens.ts.
// `--check` exits with 1 when the file on disk differs (use in CI and `npm run build`).
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cssVariables } from '../src/tokens/design-tokens';

const target = resolve(dirname(fileURLToPath(import.meta.url)), '../src/tokens/tokens.generated.css');
const header = '/* GENERATED from src/tokens/design-tokens.ts by `npm run tokens` — do not edit by hand. */\n';
const css = header + cssVariables();

if (process.argv.includes('--check')) {
  let current = '';
  try {
    current = readFileSync(target, 'utf8');
  } catch {
    /* missing file counts as out of date */
  }
  if (current !== css) {
    console.error('tokens.generated.css is out of date — run `npm run tokens`.');
    process.exit(1);
  }
  console.log('tokens.generated.css is up to date.');
} else {
  writeFileSync(target, css, 'utf8');
  console.log(`wrote ${target}`);
}
