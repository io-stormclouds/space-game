//! Atoms, bonds and the molecule graph (`atanor/graph/molecule.ts`). Insertion order of atoms and
//! bonds is kept (JavaScript `Map`): it decides the first collision reported, the order of molecules
//! in a snapshot and the order of atoms in a connected component.

use indexmap::{IndexMap, IndexSet};
use serde::{Deserialize, Serialize};

use super::hex::{Hex, hex_add, hex_distance, hex_rotate_around};

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct Atom {
    pub id: String,
    pub element: String,
    pub pos: Hex,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Bond {
    pub id: String,
    pub atom1_id: String,
    pub atom2_id: String,
    /// 1, 2 or 3
    pub order: u8,
}

/// `a--b` with the ids in string order, so a pair has one key.
pub fn bond_key(atom_id1: &str, atom_id2: &str) -> String {
    if atom_id1 < atom_id2 { format!("{atom_id1}--{atom_id2}") } else { format!("{atom_id2}--{atom_id1}") }
}

#[derive(Clone, Debug, Default)]
pub struct MoleculeGraph {
    atoms: IndexMap<String, Atom>,
    bonds: IndexMap<String, Bond>,
    adjacency: IndexMap<String, IndexSet<String>>,
}

impl MoleculeGraph {
    pub fn new() -> MoleculeGraph {
        MoleculeGraph::default()
    }

    pub fn atoms(&self) -> impl Iterator<Item = &Atom> {
        self.atoms.values()
    }

    pub fn atom_count(&self) -> usize {
        self.atoms.len()
    }

    pub fn atom(&self, id: &str) -> Option<&Atom> {
        self.atoms.get(id)
    }

    pub fn has_atom(&self, id: &str) -> bool {
        self.atoms.contains_key(id)
    }

    /// First atom (insertion order) standing on `pos`.
    pub fn atom_at(&self, pos: Hex) -> Option<&Atom> {
        self.atoms.values().find(|a| a.pos == pos)
    }

    pub fn add_atom(&mut self, atom: Atom) {
        let id = atom.id.clone();
        self.atoms.insert(id.clone(), atom);
        self.adjacency.entry(id).or_default();
    }

    /// Removes an atom and every bond it takes part in.
    pub fn remove_atom(&mut self, atom_id: &str) {
        let gone: Vec<String> =
            self.bonds.values().filter(|b| b.atom1_id == atom_id || b.atom2_id == atom_id).map(|b| b.id.clone()).collect();
        for id in gone {
            self.remove_bond(&id);
        }
        self.atoms.shift_remove(atom_id);
        self.adjacency.shift_remove(atom_id);
    }

    /// Changes an atom's element in place, keeping id, position and bonds.
    pub fn transmute_atom(&mut self, atom_id: &str, element: &str) -> bool {
        match self.atoms.get_mut(atom_id) {
            Some(a) => {
                a.element = element.to_string();
                true
            }
            None => false,
        }
    }

    pub fn bonds(&self) -> impl Iterator<Item = &Bond> {
        self.bonds.values()
    }

    pub fn bond(&self, id: &str) -> Option<&Bond> {
        self.bonds.get(id)
    }

    pub fn bond_between(&self, atom1_id: &str, atom2_id: &str) -> Option<&Bond> {
        self.bonds.get(&bond_key(atom1_id, atom2_id))
    }

    /// Adds a bond (or returns the existing one); none between an atom and itself or unknown atoms.
    pub fn add_bond(&mut self, atom1_id: &str, atom2_id: &str, order: u8) -> Option<&Bond> {
        if !self.atoms.contains_key(atom1_id) || !self.atoms.contains_key(atom2_id) || atom1_id == atom2_id {
            return None;
        }
        let key = bond_key(atom1_id, atom2_id);
        if !self.bonds.contains_key(&key) {
            self.bonds.insert(key.clone(), Bond { id: key.clone(), atom1_id: atom1_id.to_string(), atom2_id: atom2_id.to_string(), order });
            self.adjacency.entry(atom1_id.to_string()).or_default().insert(atom2_id.to_string());
            self.adjacency.entry(atom2_id.to_string()).or_default().insert(atom1_id.to_string());
        }
        self.bonds.get(&key)
    }

    pub fn remove_bond(&mut self, bond_id: &str) {
        let Some(bond) = self.bonds.shift_remove(bond_id) else { return };
        if let Some(adj) = self.adjacency.get_mut(&bond.atom1_id) {
            adj.shift_remove(&bond.atom2_id);
        }
        if let Some(adj) = self.adjacency.get_mut(&bond.atom2_id) {
            adj.shift_remove(&bond.atom1_id);
        }
    }

    pub fn remove_bond_between(&mut self, atom1_id: &str, atom2_id: &str) {
        self.remove_bond(&bond_key(atom1_id, atom2_id));
    }

    /// Connected component of an atom: its atoms in BFS order, then every bond inside the component.
    pub fn connected_component(&self, atom_id: &str) -> (Vec<Atom>, Vec<Bond>) {
        if !self.atoms.contains_key(atom_id) {
            return (Vec::new(), Vec::new());
        }
        let mut visited: IndexSet<String> = IndexSet::new();
        let mut atoms: Vec<Atom> = Vec::new();
        let mut queue: std::collections::VecDeque<String> = std::collections::VecDeque::new();
        queue.push_back(atom_id.to_string());
        visited.insert(atom_id.to_string());
        while let Some(current) = queue.pop_front() {
            atoms.push(self.atoms[&current].clone());
            if let Some(neighbors) = self.adjacency.get(&current) {
                for n in neighbors {
                    if !visited.contains(n) && self.atoms.contains_key(n) {
                        visited.insert(n.clone());
                        queue.push_back(n.clone());
                    }
                }
            }
        }
        let bonds = self.bonds.values().filter(|b| visited.contains(&b.atom1_id) && visited.contains(&b.atom2_id)).cloned().collect();
        (atoms, bonds)
    }

    /// All molecules (connected components) by the first atom in insertion order.
    pub fn molecules(&self) -> Vec<(Vec<String>, Vec<String>)> {
        let mut seen: IndexSet<String> = IndexSet::new();
        let mut out = Vec::new();
        for id in self.atoms.keys() {
            if seen.contains(id) {
                continue;
            }
            let (atoms, bonds) = self.connected_component(id);
            for a in &atoms {
                seen.insert(a.id.clone());
            }
            out.push((atoms.into_iter().map(|a| a.id).collect(), bonds.into_iter().map(|b| b.id).collect()));
        }
        out
    }

    /// Moves a single atom (no collision check).
    pub fn move_atom(&mut self, atom_id: &str, pos: Hex) {
        if let Some(a) = self.atoms.get_mut(atom_id) {
            a.pos = pos;
        }
    }

    pub fn rotate_molecule_around(&mut self, atom_id: &str, center: Hex, steps: i32) {
        let (atoms, _) = self.connected_component(atom_id);
        for a in atoms {
            let p = hex_rotate_around(a.pos, center, steps);
            self.move_atom(&a.id, p);
        }
    }

    pub fn translate_molecule(&mut self, atom_id: &str, delta: Hex) {
        let (atoms, _) = self.connected_component(atom_id);
        for a in atoms {
            let p = hex_add(a.pos, delta);
            self.move_atom(&a.id, p);
        }
    }

    /// Hexes with more than one atom, in the order of the first atom on each.
    pub fn collisions(&self) -> IndexMap<String, Vec<Atom>> {
        let mut by_hex: IndexMap<String, Vec<Atom>> = IndexMap::new();
        for a in self.atoms.values() {
            by_hex.entry(a.pos.key()).or_default().push(a.clone());
        }
        by_hex.into_iter().filter(|(_, list)| list.len() > 1).collect()
    }

    /// Whether a component matches a target molecule: same element multiset, same bonds between the
    /// matched atoms and the same pairwise hex distances (any rotation or reflection).
    pub fn matches_target(
        &self,
        atoms: &[Atom],
        bonds: &[Bond],
        elements: &[String],
        offsets: &[Hex],
        target_bonds: &[[usize; 2]],
    ) -> bool {
        if atoms.len() != elements.len() || bonds.len() != target_bonds.len() {
            return false;
        }
        let n = atoms.len();
        let mut used = vec![false; n];
        let mut mapping = vec![usize::MAX; n];
        self.check_permutation(0, n, atoms, elements, offsets, target_bonds, &mut used, &mut mapping)
    }

    #[allow(clippy::too_many_arguments)]
    fn check_permutation(
        &self,
        index: usize,
        n: usize,
        atoms: &[Atom],
        elements: &[String],
        offsets: &[Hex],
        target_bonds: &[[usize; 2]],
        used: &mut [bool],
        mapping: &mut [usize],
    ) -> bool {
        if index == n {
            for [t1, t2] in target_bonds {
                let a1 = &atoms[mapping[*t1]];
                let a2 = &atoms[mapping[*t2]];
                if self.bond_between(&a1.id, &a2.id).is_none() {
                    return false;
                }
            }
            for i in 0..n {
                for j in (i + 1)..n {
                    let expected = hex_distance(offsets[i], offsets[j]);
                    let actual = hex_distance(atoms[mapping[i]].pos, atoms[mapping[j]].pos);
                    if expected != actual {
                        return false;
                    }
                }
            }
            return true;
        }
        for i in 0..n {
            if !used[i] && atoms[i].element == elements[index] {
                used[i] = true;
                mapping[index] = i;
                if self.check_permutation(index + 1, n, atoms, elements, offsets, target_bonds, used, mapping) {
                    return true;
                }
                used[i] = false;
            }
        }
        false
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::atanor::hex::hex;

    fn atom(id: &str, element: &str, q: i32, r: i32) -> Atom {
        Atom { id: id.to_string(), element: element.to_string(), pos: hex(q, r) }
    }

    #[test]
    fn components_bonds_and_targets() {
        let mut g = MoleculeGraph::new();
        g.add_atom(atom("atom_1", "A", 0, 0));
        g.add_atom(atom("atom_2", "B", 1, 0));
        g.add_atom(atom("atom_3", "A", 5, 5));
        assert!(g.add_bond("atom_1", "atom_2", 1).is_some());
        assert_eq!(g.bond_between("atom_2", "atom_1").map(|b| b.id.as_str()), Some("atom_1--atom_2"));
        let (atoms, bonds) = g.connected_component("atom_2");
        assert_eq!(atoms.iter().map(|a| a.id.as_str()).collect::<Vec<_>>(), ["atom_2", "atom_1"]);
        assert_eq!(bonds.len(), 1);
        let elements = vec!["B".to_string(), "A".to_string()];
        assert!(g.matches_target(&atoms, &bonds, &elements, &[hex(0, 0), hex(-1, 1)], &[[0, 1]]));
        assert!(!g.matches_target(&atoms, &bonds, &elements, &[hex(0, 0), hex(-2, 2)], &[[0, 1]]));
        g.rotate_molecule_around("atom_1", hex(0, 0), 1);
        assert_eq!(g.atom("atom_2").unwrap().pos, hex(0, 1));
        assert_eq!(g.molecules().len(), 2);
        g.remove_atom("atom_1");
        assert_eq!(g.bonds().count(), 0);
        assert_eq!(g.atoms().map(|a| a.id.as_str()).collect::<Vec<_>>(), ["atom_2", "atom_3"]);
    }
}
