// Regenerates docs/economy-expansion-design.md: econ-model.ts computes every table,
// template.md holds the prose with {{GEN: …}} placeholders.
// `--check` writes nothing and exits with 1 when the document differs from the model.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const docPath = resolve(here, '../../../docs/economy-expansion-design.md');
const check = process.argv.includes('--check');

const tmp = mkdtempSync(join(tmpdir(), 'econ-model-'));
let tables;
try {
  const tablesPath = join(tmp, 'tables.md');
  execFileSync(process.execPath, ['--import', 'tsx', join(here, 'econ-model.ts'), tablesPath], {
    cwd: here,
    stdio: ['ignore', 'ignore', 'inherit'],
  });
  tables = readFileSync(tablesPath, 'utf8');
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

const sections = new Map();
for (const part of tables.split(/\n### /)) {
  const nl = part.indexOf('\n');
  const title = part.slice(0, nl).trim();
  if (title.startsWith('GEN:')) sections.set(title, part.slice(nl + 1).trim());
}

const missing = [];
const used = new Set();
const doc = readFileSync(join(here, 'template.md'), 'utf8').replace(/\{\{(GEN: [^}]+)\}\}/g, (_, key) => {
  if (!sections.has(key)) {
    missing.push(key);
    return `**BRAK SEKCJI: ${key}**`;
  }
  used.add(key);
  return sections.get(key);
});
const unused = [...sections.keys()].filter((k) => !used.has(k));
if (missing.length || unused.length) {
  console.error(`missing sections: ${missing.join('; ') || 'none'} | unused: ${unused.join('; ') || 'none'}`);
  process.exit(1);
}

if (check) {
  let current = '';
  try {
    current = readFileSync(docPath, 'utf8');
  } catch {
    /* a missing document counts as out of date */
  }
  if (current !== doc) {
    console.error('docs/economy-expansion-design.md differs from the model — run `npm run econ:docs`.');
    process.exit(1);
  }
  console.log(`docs/economy-expansion-design.md matches the model (${used.size} generated sections).`);
} else {
  writeFileSync(docPath, doc, 'utf8');
  console.log(`wrote ${docPath} (${used.size} generated sections)`);
}
