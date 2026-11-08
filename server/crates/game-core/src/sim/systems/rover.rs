//! Moves rovers tile to tile over the Goldberg grid (`rover-system.ts`). Paths are BFS over
//! `neighbors`; each segment is a great-circle arc between tile centres. Continuous positions go to
//! the snapshot, never to state.

use std::collections::{HashMap, HashSet};

use crate::ids::{BodyId, RoverId, tile_index_of};
use crate::math::vec3::{Vec3, vec3};
use crate::models::event::DomainEvent;
use crate::models::grid::{PlanetGrid, Tile};
use crate::models::rover::{Rover, RoverState};
use crate::models::structure::Structure;
use crate::sim::constants::GameConstants;
use crate::sim::frame::FrameSnapshot;
use crate::sim::scenario::Grids;

#[derive(Clone, Debug)]
struct ActiveDrive {
    /// Tiles still to pass, destination last.
    path: Vec<usize>,
    from: usize,
    /// 0..1 along the current segment.
    u: f64,
}

/// Height of the rover's pivot above the tile surface, as a fraction of the body radius.
const ROVER_LIFT: f64 = 0.005;

/// Rovers drive over landing pads and the port (centrum dowodzenia i lądowisko).
const PASSABLE_KINDS: [&str; 2] = ["LAND", "HQ"];

#[derive(Clone, Debug, Default)]
pub struct RoverSystem {
    active: HashMap<RoverId, ActiveDrive>,
}

impl RoverSystem {
    pub fn new() -> RoverSystem {
        RoverSystem::default()
    }

    /// Shortest tile path (excluding `from`, including `to`). Tiles with structures block, except
    /// landing pads (LAND, the port) and the tiles in `allow` (the construction site it drives to).
    pub fn find_path(
        &self,
        grids: &Grids,
        body_id: &BodyId,
        from: usize,
        to: usize,
        structures: &[Structure],
        allow: &HashSet<usize>,
    ) -> Option<Vec<usize>> {
        let grid = grids.get(body_id)?;
        if from == to {
            return Some(Vec::new());
        }
        let mut blocked: HashSet<usize> = HashSet::new();
        for s in structures {
            if &s.body_id != body_id || PASSABLE_KINDS.contains(&s.kind.as_str()) {
                continue;
            }
            for t in &s.tiles {
                let idx = tile_index_of(t);
                if !allow.contains(&idx) {
                    blocked.insert(idx);
                }
            }
        }
        if blocked.contains(&to) {
            return None;
        }
        let n = grid.tiles.len();
        let mut prev: Vec<i64> = vec![-1; n];
        let mut seen = vec![false; n];
        let mut queue = vec![from];
        seen[from] = true;
        let mut q = 0;
        while q < queue.len() {
            let cur = queue[q];
            q += 1;
            if cur == to {
                break;
            }
            for &nb in &grid.tiles[cur].neighbors {
                if seen[nb] || (blocked.contains(&nb) && nb != to) {
                    continue;
                }
                seen[nb] = true;
                prev[nb] = cur as i64;
                queue.push(nb);
            }
        }
        if !seen[to] {
            return None;
        }
        let mut path = Vec::new();
        let mut cur = to;
        while cur != from {
            path.push(cur);
            cur = prev[cur] as usize;
        }
        path.reverse();
        Some(path)
    }

    /// Registers a drive along `path` for a rover standing on `rover.tile_index`.
    pub fn start(&mut self, grids: &Grids, rover: &Rover, path: &[usize]) {
        if grids.get(&rover.body_id).is_none() || path.is_empty() {
            return;
        }
        self.active.insert(rover.id.clone(), ActiveDrive { path: path.to_vec(), from: rover.tile_index, u: 0.0 });
    }

    pub fn is_active(&self, id: &str) -> bool {
        self.active.contains_key(id)
    }

    /// Advances drives and writes every rover's local position into the snapshot.
    pub fn update(&mut self, rovers: &[Rover], dt: f64, grids: &Grids, cfg: &GameConstants, snap: &mut FrameSnapshot) -> Vec<DomainEvent> {
        let mut events = Vec::new();
        for rover in rovers {
            let Some(grid) = grids.get(&rover.body_id) else { continue };
            snap.rover_local_pos.entry(rover.id.clone()).or_insert(Vec3::ZERO);
            snap.rover_forward.entry(rover.id.clone()).or_insert(vec3(0.0, 0.0, 1.0));

            // A loaded game has MOVING rovers without a drive: restart from the tile they left.
            if rover.state == RoverState::Moving && !self.active.contains_key(&rover.id) && !rover.path.is_empty() {
                self.start(grids, rover, &rover.path);
            }
            let drive = if rover.state == RoverState::Moving { self.active.get_mut(&rover.id) } else { None };
            let Some(drive) = drive else {
                let tile = &grid.tiles[rover.tile_index];
                snap.rover_local_pos.insert(rover.id.clone(), place_at(tile, grid));
                snap.rover_forward.insert(rover.id.clone(), tangent_towards(tile, &grid.tiles[tile.neighbors[0]], 0.0));
                continue;
            };

            let mut remaining = cfg.rover_speed * dt;
            while remaining > 0.0 && !drive.path.is_empty() {
                let a = &grid.tiles[drive.from];
                let b = &grid.tiles[drive.path[0]];
                let seg_len = arc_length(a, b, grid.radius);
                let left = (1.0 - drive.u) * seg_len;
                if remaining >= left {
                    remaining -= left;
                    drive.from = drive.path.remove(0);
                    drive.u = 0.0;
                } else {
                    drive.u += remaining / seg_len;
                    remaining = 0.0;
                }
            }

            if drive.path.is_empty() {
                let from = drive.from;
                snap.rover_local_pos.insert(rover.id.clone(), place_at(&grid.tiles[from], grid));
                self.active.remove(&rover.id);
                events.push(DomainEvent::RoverArrived { rover_id: rover.id.clone(), tile_index: from });
            } else {
                let a = &grid.tiles[drive.from];
                let b = &grid.tiles[drive.path[0]];
                snap.rover_local_pos.insert(rover.id.clone(), slerp_surface(a, b, drive.u, grid));
                snap.rover_forward.insert(rover.id.clone(), tangent_towards(a, b, drive.u));
            }
        }
        events
    }
}

/// Surface point on the great-circle arc between two tile centres, lifted off the surface.
fn slerp_surface(a: &Tile, b: &Tile, u: f64, grid: &PlanetGrid) -> Vec3 {
    a.normal.lerp(b.normal, u).normalize().scale(grid.radius * (1.0 + ROVER_LIFT))
}

fn place_at(tile: &Tile, grid: &PlanetGrid) -> Vec3 {
    tile.normal.scale(grid.radius * (1.0 + ROVER_LIFT))
}

/// Unit tangent at the current point, pointing from a towards b along the arc.
fn tangent_towards(a: &Tile, b: &Tile, u: f64) -> Vec3 {
    let n = a.normal.lerp(b.normal, u).normalize();
    let d = b.normal - a.normal;
    let dot = d.dot(n);
    (d - n.scale(dot)).normalize()
}

fn arc_length(a: &Tile, b: &Tile, radius: f64) -> f64 {
    let dot = a.normal.dot(b.normal).clamp(-1.0, 1.0);
    (dot.acos() * radius).max(1e-6)
}
