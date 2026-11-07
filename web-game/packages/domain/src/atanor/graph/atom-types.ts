/**
 * Atom types of the Atanor engine.
 *
 * PoC levels use the alchemical theme (`molecule.ts:3` in poc/space-atanor). Game recipes use
 * economy material codes (decision W08 A, POC-7): one atom is one portion of the material taken
 * from an input port (docs/economy-expansion-design.md §8.3, §8.5 p. 2).
 */

/** Alchemical atom types of the 4 PoC levels. Kept for those levels and the ported tests. */
export const POC_ATOM_TYPES = ['A', 'B', 'FIRE', 'WATER', 'SALT', 'EARTH', 'LEAD', 'GOLD', 'QUICKSILVER'] as const;
export type PocAtomType = (typeof POC_ATOM_TYPES)[number];

/**
 * Material codes (economy catalog, econ-model.ts) that are inputs or outputs of the Atanor
 * recipes A_NAD, A_KAT, A_MET, A_KAP and A_PRO.
 */
export const ATANOR_MATERIAL_CODES = [
  'MIE', 'PLA', 'H2', 'KRZ', 'STP', 'KOM', 'BET', 'HE3', 'DEU', 'KWA', 'UKL',
  'NAD', 'KAT', 'MET', 'KAP', 'PRO',
] as const;
export type AtanorMaterialCode = (typeof ATANOR_MATERIAL_CODES)[number];

/**
 * Activated forms produced by a transmutation glyph (§8.3: Pt → Pt*, Q → Q*),
 * written as the material code with a `*` suffix.
 */
export const ACTIVATED_ATOM_TYPES = ['PLA*', 'KWA*'] as const;
export type ActivatedAtomType = (typeof ACTIVATED_ATOM_TYPES)[number];

export type MaterialAtomType = AtanorMaterialCode | ActivatedAtomType;

export type AtomType = PocAtomType | MaterialAtomType;

const MATERIAL_ATOMS: ReadonlySet<string> = new Set<string>([...ATANOR_MATERIAL_CODES, ...ACTIVATED_ATOM_TYPES]);

/** True for atoms named after economy materials (including activated `*` forms). */
export function isMaterialAtom(type: AtomType): type is MaterialAtomType {
  return MATERIAL_ATOMS.has(type);
}
