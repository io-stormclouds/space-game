// Ported from poc/space-atanor/src/core/graph/molecule.ts.
// Changes: AtomType moved to atom-types.ts (adds economy material atoms), new moveAtom() and getMolecules().
import { HexCoord, hexAdd, hexDistance, hexEquals, hexKey, hexRotateAround } from '../grid/hex';
import { AtomType } from './atom-types';

export type { AtomType } from './atom-types';

export interface Atom {
  readonly id: string;
  element: AtomType;
  pos: HexCoord;
}

export interface Bond {
  readonly id: string;
  readonly atom1Id: string;
  readonly atom2Id: string;
  readonly order: 1 | 2 | 3;
}

export interface Molecule {
  readonly id: string;
  readonly atomIds: ReadonlySet<string>;
  readonly bondIds: ReadonlySet<string>;
}

export function createBondKey(atomId1: string, atomId2: string): string {
  return atomId1 < atomId2 ? `${atomId1}--${atomId2}` : `${atomId2}--${atomId1}`;
}

export class MoleculeGraph {
  private atoms = new Map<string, Atom>();
  private bonds = new Map<string, Bond>();
  private adjacency = new Map<string, Set<string>>();

  constructor() {}

  public clone(): MoleculeGraph {
    const copy = new MoleculeGraph();
    for (const [id, atom] of this.atoms.entries()) {
      copy.atoms.set(id, { ...atom, pos: { ...atom.pos } });
    }
    for (const [id, bond] of this.bonds.entries()) {
      copy.bonds.set(id, { ...bond });
    }
    for (const [atomId, neighbors] of this.adjacency.entries()) {
      copy.adjacency.set(atomId, new Set(neighbors));
    }
    return copy;
  }

  public getAtoms(): Atom[] {
    return Array.from(this.atoms.values());
  }

  public getAtom(id: string): Atom | undefined {
    return this.atoms.get(id);
  }

  public getAtomAt(pos: HexCoord): Atom | undefined {
    for (const atom of this.atoms.values()) {
      if (hexEquals(atom.pos, pos)) {
        return atom;
      }
    }
    return undefined;
  }

  public addAtom(atom: Atom): void {
    this.atoms.set(atom.id, { ...atom, pos: { ...atom.pos } });
    if (!this.adjacency.has(atom.id)) {
      this.adjacency.set(atom.id, new Set());
    }
  }

  public removeAtom(atomId: string): void {
    // Remove connected bonds
    const toRemoveBonds: string[] = [];
    for (const bond of this.bonds.values()) {
      if (bond.atom1Id === atomId || bond.atom2Id === atomId) {
        toRemoveBonds.push(bond.id);
      }
    }
    for (const bId of toRemoveBonds) {
      this.removeBond(bId);
    }
    this.atoms.delete(atomId);
    this.adjacency.delete(atomId);
  }

  /**
   * Transmute an atom in place: change its element while keeping its ID,
   * position and all connected bonds intact.
   */
  public transmuteAtom(atomId: string, newElement: AtomType): boolean {
    const atom = this.atoms.get(atomId);
    if (!atom) return false;
    atom.element = newElement;
    return true;
  }

  public getBonds(): Bond[] {
    return Array.from(this.bonds.values());
  }

  public getBond(id: string): Bond | undefined {
    return this.bonds.get(id);
  }

  public getBondBetween(atom1Id: string, atom2Id: string): Bond | undefined {
    const key = createBondKey(atom1Id, atom2Id);
    return this.bonds.get(key);
  }

  public addBond(atom1Id: string, atom2Id: string, order: 1 | 2 | 3 = 1): Bond | null {
    if (!this.atoms.has(atom1Id) || !this.atoms.has(atom2Id) || atom1Id === atom2Id) {
      return null;
    }
    const key = createBondKey(atom1Id, atom2Id);
    const existing = this.bonds.get(key);
    if (existing) {
      return existing;
    }

    const bond: Bond = {
      id: key,
      atom1Id,
      atom2Id,
      order,
    };
    this.bonds.set(key, bond);

    let adj1 = this.adjacency.get(atom1Id);
    if (!adj1) {
      adj1 = new Set();
      this.adjacency.set(atom1Id, adj1);
    }
    adj1.add(atom2Id);

    let adj2 = this.adjacency.get(atom2Id);
    if (!adj2) {
      adj2 = new Set();
      this.adjacency.set(atom2Id, adj2);
    }
    adj2.add(atom1Id);

    return bond;
  }

  public removeBond(bondId: string): void {
    const bond = this.bonds.get(bondId);
    if (!bond) return;

    this.bonds.delete(bondId);
    this.adjacency.get(bond.atom1Id)?.delete(bond.atom2Id);
    this.adjacency.get(bond.atom2Id)?.delete(bond.atom1Id);
  }

  public removeBondBetween(atom1Id: string, atom2Id: string): void {
    const key = createBondKey(atom1Id, atom2Id);
    this.removeBond(key);
  }

  /**
   * Find connected component containing a specific atom ID.
   */
  public getConnectedComponent(atomId: string): { atoms: Atom[]; bonds: Bond[] } {
    const rootAtom = this.atoms.get(atomId);
    if (!rootAtom) {
      return { atoms: [], bonds: [] };
    }

    const visitedAtoms = new Set<string>();
    const componentAtoms: Atom[] = [];
    const queue = [atomId];
    visitedAtoms.add(atomId);

    while (queue.length > 0) {
      const currentId = queue.shift()!;
      const currentAtom = this.atoms.get(currentId)!;
      componentAtoms.push(currentAtom);

      const neighbors = this.adjacency.get(currentId) || new Set();
      for (const neighborId of neighbors) {
        if (!visitedAtoms.has(neighborId) && this.atoms.has(neighborId)) {
          visitedAtoms.add(neighborId);
          queue.push(neighborId);
        }
      }
    }

    // Collect all bonds whose both endpoints are in this component
    const componentBonds: Bond[] = [];
    for (const bond of this.bonds.values()) {
      if (visitedAtoms.has(bond.atom1Id) && visitedAtoms.has(bond.atom2Id)) {
        componentBonds.push(bond);
      }
    }

    return { atoms: componentAtoms, bonds: componentBonds };
  }

  /**
   * All molecules (connected components) in a deterministic order: by the first atom in
   * insertion order. Single unbonded atoms are molecules of size 1.
   */
  public getMolecules(): { atomIds: string[]; bondIds: string[] }[] {
    const seen = new Set<string>();
    const result: { atomIds: string[]; bondIds: string[] }[] = [];
    for (const atomId of this.atoms.keys()) {
      if (seen.has(atomId)) continue;
      const { atoms, bonds } = this.getConnectedComponent(atomId);
      for (const a of atoms) seen.add(a.id);
      result.push({ atomIds: atoms.map(a => a.id), bondIds: bonds.map(b => b.id) });
    }
    return result;
  }

  /** Move a single atom to a new position (no collision check). */
  public moveAtom(atomId: string, pos: HexCoord): void {
    const atom = this.atoms.get(atomId);
    if (atom) {
      atom.pos = { ...pos };
    }
  }

  /**
   * Rotate entire connected component containing atomId around a center point by steps * 60°.
   */
  public rotateMoleculeAround(atomId: string, center: HexCoord, steps: number): void {
    const { atoms } = this.getConnectedComponent(atomId);
    for (const atom of atoms) {
      atom.pos = hexRotateAround(atom.pos, center, steps);
    }
  }

  /**
   * Translate entire connected component containing atomId by delta hex vector.
   */
  public translateMolecule(atomId: string, delta: HexCoord): void {
    const { atoms } = this.getConnectedComponent(atomId);
    for (const atom of atoms) {
      atom.pos = hexAdd(atom.pos, delta);
    }
  }

  /**
   * Check if any atoms in the graph overlap the same hex cell.
   * Returns list of pairs/clusters of colliding atoms.
   */
  public getCollisions(): Map<string, Atom[]> {
    const hexMap = new Map<string, Atom[]>();
    for (const atom of this.atoms.values()) {
      const key = hexKey(atom.pos);
      const list = hexMap.get(key) || [];
      list.push(atom);
      hexMap.set(key, list);
    }

    const collisions = new Map<string, Atom[]>();
    for (const [key, list] of hexMap.entries()) {
      if (list.length > 1) {
        collisions.set(key, list);
      }
    }
    return collisions;
  }

  /**
   * Check if a component matches a target molecule specification.
   * Target template defined by list of { relPos, element } and relative bonds.
   */
  public matchesTarget(
    componentAtoms: Atom[],
    componentBonds: Bond[],
    targetPattern: { elements: AtomType[]; relativeHexOffsets: HexCoord[]; bonds: [number, number][] }
  ): boolean {
    if (componentAtoms.length !== targetPattern.elements.length) {
      return false;
    }
    if (componentBonds.length !== targetPattern.bonds.length) {
      return false;
    }

    // For a small target molecule (e.g. dimer A-B or trimer), we can check permutations
    // or test all 6 possible rotations around the first atom.
    const n = componentAtoms.length;

    // Generate permutation matching
    const used = new Array(n).fill(false);
    const mapping: number[] = new Array(n).fill(-1);

    const checkPermutation = (index: number): boolean => {
      if (index === n) {
        // Validate bonds
        for (const [t1, t2] of targetPattern.bonds) {
          const a1 = componentAtoms[mapping[t1]];
          const a2 = componentAtoms[mapping[t2]];
          const bond = this.getBondBetween(a1.id, a2.id);
          if (!bond) return false;
        }

        // Validate geometry (distances between all pairs must match target relative distances)
        for (let i = 0; i < n; i++) {
          for (let j = i + 1; j < n; j++) {
            const expectedDist = hexDistance(targetPattern.relativeHexOffsets[i], targetPattern.relativeHexOffsets[j]);
            const actualDist = hexDistance(componentAtoms[mapping[i]].pos, componentAtoms[mapping[j]].pos);
            if (expectedDist !== actualDist) return false;
          }
        }
        return true;
      }

      for (let i = 0; i < n; i++) {
        if (!used[i] && componentAtoms[i].element === targetPattern.elements[index]) {
          used[i] = true;
          mapping[index] = i;
          if (checkPermutation(index + 1)) return true;
          used[i] = false;
        }
      }
      return false;
    };

    return checkPermutation(0);
  }
}
