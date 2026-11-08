// Exports the economy catalog (catalog-data.ts, the source of truth) as JSON for the Rust crate
// `game-core` (server/crates/game-core/data/catalog.json). Run from web-game/:
//   node --import tsx tools/conformance/export-catalog.ts
// Key order of every object is preserved: the Rust port keeps it too, because it shows in texts and
// in the order of floating-point sums.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BUILDINGS,
  ERA_NAMES,
  FUEL_PER_LY,
  MATERIALS,
  RECIPE_DATA,
  STARSHIP_MODULES,
  STARSHIP_UPGRADES,
  STORAGE_CLASSES,
  VEHICLES,
} from '@space-game/domain';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '../../../server/crates/game-core/data/catalog.json');

const catalog = {
  materials: MATERIALS,
  recipes: RECIPE_DATA,
  storageClasses: STORAGE_CLASSES,
  buildings: BUILDINGS,
  vehicles: VEHICLES,
  eraNames: ERA_NAMES,
  fuelPerLy: FUEL_PER_LY,
  starshipModules: STARSHIP_MODULES,
  starshipUpgrades: STARSHIP_UPGRADES,
};

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(catalog, null, 2) + '\n', 'utf8');
console.log(
  `catalog.json: ${MATERIALS.length} materials, ${RECIPE_DATA.length} recipes, ${BUILDINGS.length} buildings, ${VEHICLES.length} vehicles → ${out}`,
);
