//! Construction by rovers (`construction-system.ts`, doc 5.1): an idle rover takes the oldest site
//! nobody works on, drives to it (BFS over tiles) and builds for the build time. Rovers on the same
//! site add up their speed. Progress is state, so a saved game continues.

use std::collections::{HashMap, HashSet};

use super::rover::RoverSystem;
use crate::ids::tile_index_of;
use crate::models::event::DomainEvent;
use crate::models::resource::empty_stockpile;
use crate::models::rover::RoverState;
use crate::models::structure::{Structure, StructureState};
use crate::sim::reducer::WorldState;
use crate::sim::rules::Rules;
use crate::sim::scenario::Grids;

/// Orders that put idle rovers to work. Starts their drives as a side effect on the rover system.
pub fn assign(world: &WorldState, grids: &Grids, rovers: &mut RoverSystem) -> Vec<DomainEvent> {
    let mut events = Vec::new();
    let mut taken: HashSet<String> = world.rovers.iter().filter_map(|r| r.job.clone()).collect();
    for rover in &world.rovers {
        if rover.state != RoverState::Idle || rover.job.is_some() {
            continue;
        }
        let Some(site) = world.structures.iter().find(|s| s.body_id == rover.body_id && s.is_site() && !taken.contains(&s.id)) else {
            continue;
        };
        let order = send_to(world, grids, rovers, &rover.id, site);
        if order.is_empty() {
            continue;
        }
        taken.insert(site.id.clone());
        events.extend(order);
    }
    events
}

/// Assignment and drive for one rover; empty when the site is unreachable.
pub fn send_to(world: &WorldState, grids: &Grids, rovers: &mut RoverSystem, rover_id: &str, site: &Structure) -> Vec<DomainEvent> {
    let Some(rover) = world.rover(rover_id) else { return Vec::new() };
    if rover.body_id != site.body_id {
        return Vec::new();
    }
    let target = tile_index_of(&site.tile_id);
    let allow: HashSet<usize> = site.tiles.iter().map(|t| tile_index_of(t)).collect();
    let Some(path) = rovers.find_path(grids, &site.body_id, rover.tile_index, target, &world.structures, &allow) else { return Vec::new() };
    let mut events = vec![DomainEvent::RoverAssigned { rover_id: rover.id.clone(), structure_id: site.id.clone() }];
    if path.is_empty() {
        events.push(DomainEvent::RoverArrived { rover_id: rover.id.clone(), tile_index: rover.tile_index });
    } else {
        rovers.start(grids, rover, &path);
        events.push(DomainEvent::RoverMoveOrdered { rover_id: rover.id.clone(), path });
    }
    events
}

/// Advances every site with building rovers (progress written into the world); emits STARTED / BUILT / UPGRADED.
pub fn progress(world: &mut WorldState, rules: &Rules, dt: f64) -> Vec<DomainEvent> {
    let mut events = Vec::new();
    let mut crews: HashMap<String, usize> = HashMap::new();
    for r in &world.rovers {
        if let Some(job) = &r.job
            && r.state == RoverState::Building
        {
            *crews.entry(job.clone()).or_insert(0) += 1;
        }
    }
    for i in 0..world.structures.len() {
        let site = &world.structures[i];
        if !site.is_site() {
            continue;
        }
        let crew = crews.get(&site.id).copied().unwrap_or(0);
        if crew == 0 {
            continue;
        }
        if site.state == StructureState::Planned {
            let rover_id = world
                .rovers
                .iter()
                .find(|r| r.job.as_deref() == Some(site.id.as_str()) && r.state == RoverState::Building)
                .map(|r| r.id.clone())
                .unwrap_or_default();
            events.push(DomainEvent::ConstructionStarted { structure_id: site.id.clone(), rover_id });
        }
        let time = rules.spec(&site.kind, site.target_level).build_time;
        let progress = if time <= 0.0 { 1.0 } else { (site.progress + (dt * crew as f64) / time).min(1.0) };
        if progress >= 1.0 {
            events.push(finished(site));
        } else {
            world.structures[i].progress = progress;
        }
    }
    events
}

fn finished(site: &Structure) -> DomainEvent {
    if site.level > 0 {
        return DomainEvent::StructureUpgraded { structure_id: site.id.clone(), level: site.target_level };
    }
    let mut built = site.clone();
    built.state = StructureState::Active;
    built.level = site.target_level;
    built.progress = 0.0;
    built.paid = empty_stockpile();
    DomainEvent::StructureBuilt { structure: built, cost: site.paid.clone() }
}

/// Sites of a body and the rovers on them, for the UI.
pub fn sites_on<'a>(world: &'a WorldState, body_id: &str) -> Vec<(&'a Structure, usize)> {
    world
        .structures
        .iter()
        .filter(|s| s.body_id == body_id && s.is_site())
        .map(|site| (site, world.rovers.iter().filter(|r| r.job.as_deref() == Some(site.id.as_str())).count()))
        .collect()
}
