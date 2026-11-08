//! Triangulated unit sphere: class-I subdivision of the icosahedron (`geodesic.ts`).

use std::collections::HashMap;

use super::js::to_fixed;
use super::vec3::{Vec3, vec3};

#[derive(Clone, Debug, PartialEq)]
pub struct GeodesicSphere {
    pub frequency: usize,
    /// Unit vectors, 10·n² + 2 of them.
    pub vertices: Vec<Vec3>,
    /// Vertex index triples, counter-clockwise seen from outside, 20·n² of them.
    pub faces: Vec<[usize; 3]>,
}

fn ico_vertices() -> [Vec3; 12] {
    let t = (1.0 + 5.0_f64.sqrt()) / 2.0;
    [
        vec3(-1.0, t, 0.0),
        vec3(1.0, t, 0.0),
        vec3(-1.0, -t, 0.0),
        vec3(1.0, -t, 0.0),
        vec3(0.0, -1.0, t),
        vec3(0.0, 1.0, t),
        vec3(0.0, -1.0, -t),
        vec3(0.0, 1.0, -t),
        vec3(t, 0.0, -1.0),
        vec3(t, 0.0, 1.0),
        vec3(-t, 0.0, -1.0),
        vec3(-t, 0.0, 1.0),
    ]
}

const ICO_FACES: [[usize; 3]; 20] = [
    [0, 11, 5],
    [0, 5, 1],
    [0, 1, 7],
    [0, 7, 10],
    [0, 10, 11],
    [1, 5, 9],
    [5, 11, 4],
    [11, 10, 2],
    [10, 7, 6],
    [7, 1, 8],
    [3, 9, 4],
    [3, 4, 2],
    [3, 2, 6],
    [3, 6, 8],
    [3, 8, 9],
    [4, 9, 5],
    [2, 4, 11],
    [6, 2, 10],
    [8, 6, 7],
    [9, 8, 1],
];

/// Vertex key as TS builds it: `${x.toFixed(6)},${y.toFixed(6)},${z.toFixed(6)}`.
fn key_of(p: Vec3) -> String {
    format!("{},{},{}", to_fixed(p.x, 6), to_fixed(p.y, 6), to_fixed(p.z, 6))
}

/// Builds the geodesic sphere of frequency n ≥ 1. Deterministic: the same n always yields the same
/// vertex order, which is what makes tile ids stable.
pub fn geodesic_sphere(frequency: usize) -> GeodesicSphere {
    let n = frequency.max(1);
    let nf = n as f64;
    let ico = ico_vertices();
    let mut vertices: Vec<Vec3> = Vec::new();
    let mut faces: Vec<[usize; 3]> = Vec::new();
    let mut index: HashMap<String, usize> = HashMap::new();

    let mut vertex_for = |p: Vec3, vertices: &mut Vec<Vec3>| -> usize {
        let key = key_of(p);
        if let Some(&i) = index.get(&key) {
            return i;
        }
        let i = vertices.len();
        index.insert(key, i);
        vertices.push(p);
        i
    };

    for [ia, ib, ic] in ICO_FACES {
        let a = ico[ia];
        let b = ico[ib];
        let c = ico[ic];
        // grid[i][j] for i + j ≤ n, barycentric (n − i − j, i, j) / n
        let mut grid: Vec<Vec<usize>> = Vec::with_capacity(n + 1);
        for i in 0..=n {
            let mut row = Vec::with_capacity(n + 1 - i);
            for j in 0..=(n - i) {
                let wa = (nf - i as f64 - j as f64) / nf;
                let wb = i as f64 / nf;
                let wc = j as f64 / nf;
                let tmp = vec3(a.x * wa + b.x * wb + c.x * wc, a.y * wa + b.y * wb + c.y * wc, a.z * wa + b.z * wb + c.z * wc);
                row.push(vertex_for(tmp.normalize(), &mut vertices));
            }
            grid.push(row);
        }
        for i in 0..n {
            for j in 0..(n - i) {
                faces.push(orient([grid[i][j], grid[i + 1][j], grid[i][j + 1]], &vertices));
                if i + j + 1 < n {
                    faces.push(orient([grid[i + 1][j], grid[i + 1][j + 1], grid[i][j + 1]], &vertices));
                }
            }
        }
    }
    GeodesicSphere { frequency: n, vertices, faces }
}

/// Ensures the face normal points away from the origin (CCW seen from outside).
fn orient(f: [usize; 3], v: &[Vec3]) -> [usize; 3] {
    let a = v[f[0]];
    let b = v[f[1]];
    let c = v[f[2]];
    let (abx, aby, abz) = (b.x - a.x, b.y - a.y, b.z - a.z);
    let (acx, acy, acz) = (c.x - a.x, c.y - a.y, c.z - a.z);
    let nx = aby * acz - abz * acy;
    let ny = abz * acx - abx * acz;
    let nz = abx * acy - aby * acx;
    let outward = nx * (a.x + b.x + c.x) + ny * (a.y + b.y + c.y) + nz * (a.z + b.z + c.z);
    if outward >= 0.0 { f } else { [f[0], f[2], f[1]] }
}

/// Signed volume-like test used by the TS specs: positive when (a, b, c) faces outward.
pub fn outward(a: Vec3, b: Vec3, c: Vec3) -> f64 {
    let (abx, aby, abz) = (b.x - a.x, b.y - a.y, b.z - a.z);
    let (acx, acy, acz) = (c.x - a.x, c.y - a.y, c.z - a.z);
    let nx = aby * acz - abz * acy;
    let ny = abz * acx - abx * acz;
    let nz = abx * acy - aby * acx;
    nx * a.x + ny * a.y + nz * a.z
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    #[test]
    fn counts_and_unit_vertices() {
        for n in [1usize, 2, 4, 8] {
            let g = geodesic_sphere(n);
            assert_eq!(g.vertices.len(), 10 * n * n + 2);
            assert_eq!(g.faces.len(), 20 * n * n);
            for v in &g.vertices {
                assert!((v.length() - 1.0).abs() < 1e-9);
            }
            for f in &g.faces {
                assert!(outward(g.vertices[f[0]], g.vertices[f[1]], g.vertices[f[2]]) > 0.0);
            }
        }
    }

    #[test]
    fn closed_mesh_euler() {
        let g = geodesic_sphere(4);
        let mut edges: HashMap<(usize, usize), usize> = HashMap::new();
        for [a, b, c] in &g.faces {
            for (p, q) in [(a, b), (b, c), (c, a)] {
                let key = if p < q { (*p, *q) } else { (*q, *p) };
                *edges.entry(key).or_insert(0) += 1;
            }
        }
        assert!(edges.values().all(|&n| n == 2));
        assert_eq!(g.vertices.len() as i64 - edges.len() as i64 + g.faces.len() as i64, 2);
    }
}
