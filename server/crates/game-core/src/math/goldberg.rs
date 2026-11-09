//! Goldberg polyhedron GP(n,0): the dual of the frequency-n geodesic sphere (`goldberg-grid.ts`).

use indexmap::IndexMap;

use super::deposits::{DEFAULT_DEPOSIT_OPTIONS, generate_deposits, poc_deposit_weights};
use super::geodesic::geodesic_sphere;
use super::js::hypot3;
use super::vec3::{Vec3, vec3};
use crate::ids::tile_id;
use crate::models::grid::{PlanetGrid, Tile, TileKind};

/// Builds the grid of a body. Tiles correspond to geodesic vertices; tile corners are the
/// (projected) centroids of the geodesic faces around that vertex. Deterministic.
pub fn build_goldberg_grid(
    body_id: &str,
    radius: f64,
    frequency: usize,
    deposit_seed: Option<f64>,
    deposit_weights: Option<&IndexMap<String, f64>>,
) -> PlanetGrid {
    let geo = geodesic_sphere(frequency);
    let vertex_count = geo.vertices.len();

    // faces around each vertex, and neighbour vertex lists in first-seen order (JS Set semantics)
    let mut faces_at: Vec<Vec<usize>> = vec![Vec::new(); vertex_count];
    let mut neighbors_at: Vec<Vec<usize>> = vec![Vec::new(); vertex_count];
    for (fi, f) in geo.faces.iter().enumerate() {
        for k in 0..3 {
            let a = f[k];
            faces_at[a].push(fi);
            for other in [f[(k + 1) % 3], f[(k + 2) % 3]] {
                if !neighbors_at[a].contains(&other) {
                    neighbors_at[a].push(other);
                }
            }
        }
    }

    // centroids of faces projected to the sphere → tile corners
    let corners: Vec<Vec3> = geo
        .faces
        .iter()
        .map(|&[a, b, c]| {
            let va = geo.vertices[a];
            let vb = geo.vertices[b];
            let vc = geo.vertices[c];
            let m = vec3((va.x + vb.x + vc.x) / 3.0, (va.y + vb.y + vc.y) / 3.0, (va.z + vb.z + vc.z) / 3.0);
            m.normalize().scale(radius)
        })
        .collect();

    let default_weights = poc_deposit_weights();
    let deposits = match deposit_seed {
        None => Default::default(),
        Some(seed) => generate_deposits(&neighbors_at, seed, DEFAULT_DEPOSIT_OPTIONS, deposit_weights.unwrap_or(&default_weights)),
    };

    let mut tiles: Vec<Tile> = Vec::with_capacity(vertex_count);
    for i in 0..vertex_count {
        let normal = geo.vertices[i];
        let center = normal.scale(radius);
        let (u, v) = tangent_basis(normal);
        let angle_of = |p: Vec3| -> f64 {
            let (dx, dy, dz) = (p.x - center.x, p.y - center.y, p.z - center.z);
            (dx * v.x + dy * v.y + dz * v.z).atan2(dx * u.x + dy * u.y + dz * u.z)
        };
        let mut vertices: Vec<Vec3> = faces_at[i].iter().map(|&fi| corners[fi]).collect();
        vertices.sort_by(|p, q| angle_of(*p).partial_cmp(&angle_of(*q)).unwrap_or(std::cmp::Ordering::Equal));
        let mut neighbors = neighbors_at[i].clone();
        neighbors.sort_by(|&p, &q| angle_of(geo.vertices[p]).partial_cmp(&angle_of(geo.vertices[q])).unwrap_or(std::cmp::Ordering::Equal));
        tiles.push(Tile {
            id: tile_id(body_id, i),
            index: i,
            kind: if vertices.len() == 5 { TileKind::Pent } else { TileKind::Hex },
            center,
            normal,
            vertices,
            neighbors,
            deposit: deposits.get(&i).cloned(),
            terrain: None,
            road: false,
        });
    }

    let area = (4.0 * std::f64::consts::PI * radius * radius) / vertex_count as f64;
    let tile_edge = (area / ((3.0 * 3.0_f64.sqrt()) / 2.0)).sqrt();
    PlanetGrid { body_id: body_id.to_string(), frequency: geo.frequency, radius, tiles, tile_edge, terrain: None }
}

/// Area of a tile = sum of the fan triangles from its centre.
pub fn tile_area(tile: &Tile) -> f64 {
    let mut total = 0.0;
    let c = tile.center;
    let n = tile.vertices.len();
    for k in 0..n {
        let p = tile.vertices[k];
        let q = tile.vertices[(k + 1) % n];
        let (ax, ay, az) = (p.x - c.x, p.y - c.y, p.z - c.z);
        let (bx, by, bz) = (q.x - c.x, q.y - c.y, q.z - c.z);
        total += 0.5 * hypot3(ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx);
    }
    total
}

/// Approximate flat-to-flat width of a hexagonal tile.
pub fn tile_width(grid: &PlanetGrid) -> f64 {
    grid.tile_edge * 3.0_f64.sqrt()
}

/// Right-handed tangent basis (u, v) with u × v = n, so increasing angle = CCW seen from outside.
fn tangent_basis(n: Vec3) -> (Vec3, Vec3) {
    let r = if n.y.abs() < 0.9 { vec3(0.0, 1.0, 0.0) } else { vec3(1.0, 0.0, 0.0) };
    // u = normalize(ref × n), v = n × u
    let u = vec3(r.y * n.z - r.z * n.y, r.z * n.x - r.x * n.z, r.x * n.y - r.y * n.x).normalize();
    let v = vec3(n.y * u.z - n.z * u.y, n.z * u.x - n.x * u.z, n.x * u.y - n.y * u.x);
    (u, v)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::math::geodesic::outward;
    use std::collections::HashSet;

    #[test]
    fn tile_counts_and_pentagons() {
        for n in [2usize, 4, 8] {
            let grid = build_goldberg_grid("test-body", 50.0, n, None, None);
            assert_eq!(grid.tiles.len(), 10 * n * n + 2);
            assert_eq!(grid.tiles.iter().filter(|t| t.kind == TileKind::Pent).count(), 12);
        }
    }

    #[test]
    fn euler_characteristic_of_the_dual() {
        let grid = build_goldberg_grid("test-body", 50.0, 4, None, None);
        let f = grid.tiles.len() as f64;
        let e = grid.tiles.iter().map(|t| t.neighbors.len()).sum::<usize>() as f64 / 2.0;
        let v = grid.tiles.iter().map(|t| t.vertices.len()).sum::<usize>() as f64 / 3.0;
        assert_eq!(v - e + f, 2.0);
    }

    #[test]
    fn adjacency_symmetric_and_corners_ccw() {
        let grid = build_goldberg_grid("test-body", 50.0, 4, None, None);
        for t in &grid.tiles {
            assert_eq!(t.neighbors.len(), t.vertices.len());
            assert_eq!(t.neighbors.iter().collect::<HashSet<_>>().len(), t.neighbors.len());
            for &n in &t.neighbors {
                assert!(grid.tiles[n].neighbors.contains(&t.index));
            }
            assert!((t.center.length() - 50.0).abs() < 1e-6);
            let n = t.vertices.len();
            for k in 0..n {
                assert!((t.vertices[k].length() - 50.0).abs() < 1e-6);
                assert!(outward(t.center, t.vertices[k], t.vertices[(k + 1) % n]) > 0.0);
            }
        }
    }

    #[test]
    fn areas_uniform_and_sum_to_sphere() {
        let grid = build_goldberg_grid("test-body", 50.0, 8, None, None);
        let areas: Vec<f64> = grid.tiles.iter().map(tile_area).collect();
        let max = areas.iter().cloned().fold(0.0, f64::max);
        let min_hex = grid.tiles.iter().filter(|t| t.kind == TileKind::Hex).map(tile_area).fold(f64::INFINITY, f64::min);
        let min_pent = grid.tiles.iter().filter(|t| t.kind == TileKind::Pent).map(tile_area).fold(f64::INFINITY, f64::min);
        assert!(min_hex / max >= 0.6);
        assert!(min_pent / max >= 0.4);
        let total: f64 = areas.iter().sum();
        let ratio = total / (4.0 * std::f64::consts::PI * 50.0 * 50.0);
        assert!(ratio > 0.97 && ratio < 1.0);
    }

    #[test]
    fn deterministic_and_ids() {
        let a = build_goldberg_grid("test-body", 50.0, 6, None, None);
        let b = build_goldberg_grid("test-body", 50.0, 6, None, None);
        assert_eq!(a, b);
        assert_eq!(a.tiles[17].id, "test-body:17");
    }
}
