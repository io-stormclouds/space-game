import { describe, expect, it } from 'vitest';
import { MoleculeGraph } from '../core/graph/molecule';

describe('MoleculeGraph and Affine Transformations', () => {
  it('should find connected components correctly', () => {
    const graph = new MoleculeGraph();

    graph.addAtom({ id: 'a1', element: 'A', pos: { q: 0, r: 0 } });
    graph.addAtom({ id: 'a2', element: 'B', pos: { q: 1, r: 0 } });
    graph.addAtom({ id: 'a3', element: 'SALT', pos: { q: 5, r: 5 } });

    // Without bonds, each atom is its own component
    expect(graph.getConnectedComponent('a1').atoms.length).toBe(1);

    // Bond a1 and a2
    graph.addBond('a1', 'a2', 1);

    const comp1 = graph.getConnectedComponent('a1');
    expect(comp1.atoms.length).toBe(2);
    expect(comp1.bonds.length).toBe(1);

    const comp3 = graph.getConnectedComponent('a3');
    expect(comp3.atoms.length).toBe(1);
    expect(comp3.bonds.length).toBe(0);
  });

  it('should rotate entire connected component rigidly around a center', () => {
    const graph = new MoleculeGraph();
    graph.addAtom({ id: 'a1', element: 'A', pos: { q: 1, r: 0 } });
    graph.addAtom({ id: 'a2', element: 'B', pos: { q: 2, r: 0 } });
    graph.addBond('a1', 'a2', 1);

    // Rotate molecule around (0, 0) by 60 degrees CW (1 step)
    graph.rotateMoleculeAround('a1', { q: 0, r: 0 }, 1);

    const atom1 = graph.getAtom('a1')!;
    const atom2 = graph.getAtom('a2')!;

    expect(atom1.pos).toEqual({ q: 0, r: 1 });
    expect(atom2.pos).toEqual({ q: 0, r: 2 });
  });

  it('should translate entire molecule rigidly', () => {
    const graph = new MoleculeGraph();
    graph.addAtom({ id: 'a1', element: 'A', pos: { q: 0, r: 0 } });
    graph.addAtom({ id: 'a2', element: 'B', pos: { q: 1, r: 0 } });
    graph.addBond('a1', 'a2', 1);

    graph.translateMolecule('a1', { q: 2, r: -1 });

    expect(graph.getAtom('a1')!.pos).toEqual({ q: 2, r: -1 });
    expect(graph.getAtom('a2')!.pos).toEqual({ q: 3, r: -1 });
  });
});
