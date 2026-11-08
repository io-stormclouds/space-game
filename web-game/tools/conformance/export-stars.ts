// Exports the 41 stars of the galaxy PoC (`galaxy/stars.data.ts`) as JSON for game-core
// (`server/crates/game-core/src/galaxy/stars.rs`), like the economy catalog: one source of data
// until the register moves out of TypeScript.
//   node --import tsx tools/conformance/export-stars.ts [out.json]
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { STAR_DATA } from '../../packages/domain/src/galaxy/stars.data';

const here = dirname(fileURLToPath(import.meta.url));
const out = process.argv[2] ?? resolve(here, '../../../server/crates/game-core/data/stars.json');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(STAR_DATA, null, 1) + '\n', 'utf8');
console.log(`stars: ${STAR_DATA.length} → ${out}`);
