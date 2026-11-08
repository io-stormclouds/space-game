//! Power, crew and storage of a body (`economy/colony.ts`).

use std::collections::HashMap;

use indexmap::IndexMap;
use serde::{Deserialize, Serialize};

use super::reducer::WorldState;
use super::rules::{PowerPriority, Rules};
use crate::economy::StorageClass;
use crate::models::body::CelestialBody;
use crate::models::resource::Qty;
use crate::models::structure::Structure;

/// Reference orbit of insolation ×1 (Planeta Matka, doc 4.3).
const REFERENCE_ORBIT: f64 = 900.0;

/// Solar multiplier of a body: explicit, else star luminosity × (900 / orbit of its root planet)².
pub fn insolation_of(bodies: &[CelestialBody], body_id: &str) -> f64 {
    let by_id: HashMap<&str, &CelestialBody> = bodies.iter().map(|b| (b.id.as_str(), b)).collect();
    let Some(mut b) = by_id.get(body_id).copied() else { return 0.0 };
    if let Some(i) = b.insolation {
        return i;
    }
    while let Some(parent) = b.parent_id.as_deref().and_then(|p| by_id.get(p).copied()) {
        if parent.parent_id.is_none() {
            break;
        }
        b = parent;
    }
    let star = match b.parent_id.as_deref() {
        Some(p) => by_id.get(p).copied(),
        None => Some(b),
    };
    let r = if b.parent_id.is_some() { b.orbit_radius } else { REFERENCE_ORBIT };
    star.and_then(|s| s.luminosity).unwrap_or(1.0) * (REFERENCE_ORBIT / r.max(1.0)).powf(2.0)
}

/// Values per power priority 1, 2, 3; serialised as `{ "1": …, "2": …, "3": … }` like the TS record.
#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Default)]
pub struct ByPriority {
    #[serde(rename = "1")]
    pub p1: f64,
    #[serde(rename = "2")]
    pub p2: f64,
    #[serde(rename = "3")]
    pub p3: f64,
}

impl ByPriority {
    pub fn get(&self, p: PowerPriority) -> f64 {
        match p {
            1 => self.p1,
            2 => self.p2,
            _ => self.p3,
        }
    }

    fn add(&mut self, p: PowerPriority, v: f64) {
        match p {
            1 => self.p1 += v,
            2 => self.p2 += v,
            _ => self.p3 += v,
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq)]
pub struct PowerBalance {
    pub produced: f64,
    pub consumed: f64,
    /// produced − consumed.
    pub available: f64,
    /// Demand per priority.
    pub demand: ByPriority,
    /// Share of the demand each priority gets (1 = full power).
    pub efficiency: ByPriority,
}

/// The level a structure counts at. `committed` also counts what is planned or being built (used to
/// validate orders, so two orders cannot spend the same power); otherwise only what works.
fn counted_level(s: &Structure, committed: bool) -> u32 {
    if committed {
        return s.level.max(s.target_level);
    }
    if s.is_working() { s.level } else { 0 }
}

/// Power of one body (doc 4.3): per-body grid, P1 protected, P2 and P3 share what is left.
pub fn power_balance(world: &WorldState, rules: &Rules, body_id: &str, committed: bool) -> PowerBalance {
    let insolation = insolation_of(&world.bodies, body_id);
    let mut produced = 0.0;
    let mut demand = ByPriority::default();
    for s in &world.structures {
        if s.body_id != body_id {
            continue;
        }
        let l = counted_level(s, committed);
        if l == 0 {
            continue;
        }
        let spec = rules.spec(&s.kind, l);
        if spec.power >= 0.0 {
            produced += if spec.is_solar { spec.power * insolation } else { spec.power };
        } else {
            demand.add(spec.priority, -spec.power);
        }
        // a deployed Atanor machine adds its area and arms on top of the building (§8.1, AT4)
        if let Some(m) = world.machine(&s.id)
            && let Some(metrics) = &m.metrics
            && m.program.is_some()
        {
            demand.add(spec.priority, metrics.extra_power);
        }
    }
    let consumed = demand.p1 + demand.p2 + demand.p3;
    let share = |need: f64, supply: f64| if need <= 0.0 { 1.0 } else { (supply / need).clamp(0.0, 1.0) };
    let e1 = share(demand.p1, produced);
    let rest = (produced - demand.p1).max(0.0);
    let e23 = share(demand.p2 + demand.p3, rest);
    PowerBalance { produced, consumed, available: produced - consumed, demand, efficiency: ByPriority { p1: e1, p2: e23, p3: e23 } }
}

/// Power still missing to add `kind` at `level` (committed balance); 0 when it fits or produces.
pub fn power_shortfall(world: &WorldState, rules: &Rules, body_id: &str, kind: &str, level: u32) -> f64 {
    let spec = rules.spec(kind, level);
    let prev = if level > 1 { rules.spec(kind, level - 1).power } else { 0.0 };
    let extra = spec.power - prev;
    if extra >= 0.0 {
        return 0.0;
    }
    (-extra - power_balance(world, rules, body_id, true).available).max(0.0)
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq)]
pub struct CrewBalance {
    /// Living space from the HQ and habitats.
    pub capacity: f64,
    /// Crew the buildings need.
    pub demand: f64,
    pub available: f64,
}

/// Crew acts as a second power (doc 4.5).
pub fn crew_balance(world: &WorldState, rules: &Rules, body_id: &str, committed: bool) -> CrewBalance {
    let mut capacity = 0.0;
    let mut demand = 0.0;
    for s in &world.structures {
        if s.body_id != body_id {
            continue;
        }
        let l = counted_level(s, committed);
        if l == 0 {
            continue;
        }
        let crew = rules.spec(&s.kind, l).crew;
        if crew < 0.0 {
            capacity -= crew;
        } else {
            demand += crew;
        }
    }
    CrewBalance { capacity, demand, available: capacity - demand }
}

pub fn crew_shortfall(world: &WorldState, rules: &Rules, body_id: &str, kind: &str, level: u32) -> f64 {
    let crew = rules.spec(kind, level).crew - if level > 1 { rules.spec(kind, level - 1).crew } else { 0.0 };
    if crew <= 0.0 {
        return 0.0;
    }
    (crew - crew_balance(world, rules, body_id, true).available).max(0.0)
}

/// Storage capacity of a body per storage class (working storage buildings and the HQ).
pub fn storage_capacity(world: &WorldState, rules: &Rules, body_id: &str) -> IndexMap<StorageClass, f64> {
    let mut cap: IndexMap<StorageClass, f64> = IndexMap::new();
    for s in &world.structures {
        if s.body_id != body_id || !s.is_working() {
            continue;
        }
        for (cls, q) in &rules.spec(&s.kind, s.level).storage {
            *cap.entry(cls.clone()).or_insert(0.0) += q;
        }
    }
    cap
}

pub fn storage_use(world: &WorldState, rules: &Rules, body_id: &str) -> IndexMap<StorageClass, f64> {
    let mut use_: IndexMap<StorageClass, f64> = IndexMap::new();
    for (code, q) in world.storage_of(body_id) {
        *use_.entry(rules.class_of(&code)).or_insert(0.0) += q;
    }
    use_
}

/// Free space for `material` on a body. Bodies with no storage building at all keep an unlimited
/// pool, so the PoC test world and outposts still work.
pub fn free_space(world: &WorldState, rules: &Rules, body_id: &str, material: &str) -> f64 {
    let cap = storage_capacity(world, rules, body_id);
    if cap.is_empty() {
        return f64::INFINITY;
    }
    let cls = rules.class_of(material);
    (cap.get(&cls).copied().unwrap_or(0.0) - storage_use(world, rules, body_id).get(&cls).copied().unwrap_or(0.0)).max(0.0)
}

/// Whether all of `add` fits into the body's storage.
pub fn fits(world: &WorldState, rules: &Rules, body_id: &str, add: &Qty) -> bool {
    fits_pool(world, rules, body_id, &world.storage_of(body_id), add)
}

/// `fits` with the body's pool replaced by `pool` (the TS `probe` world whose storage differs):
/// capacity comes from the world's structures, use from the given pool.
pub fn fits_pool(world: &WorldState, rules: &Rules, body_id: &str, pool: &Qty, add: &Qty) -> bool {
    let cap = storage_capacity(world, rules, body_id);
    if cap.is_empty() {
        return true;
    }
    let mut use_: IndexMap<StorageClass, f64> = IndexMap::new();
    for (code, q) in pool {
        *use_.entry(rules.class_of(code)).or_insert(0.0) += q;
    }
    let mut need: IndexMap<StorageClass, f64> = IndexMap::new();
    for (code, q) in add {
        *need.entry(rules.class_of(code)).or_insert(0.0) += q;
    }
    need.iter().all(|(cls, q)| use_.get(cls).copied().unwrap_or(0.0) + q <= cap.get(cls).copied().unwrap_or(0.0))
}

/// Highest HQ level on the body, else anywhere (outposts follow the main colony); 1 without any HQ.
pub fn level_ceiling(world: &WorldState, body_id: &str) -> u32 {
    let hq: Vec<&Structure> = world.structures.iter().filter(|s| s.kind == "HQ" && s.level > 0).collect();
    let own: Vec<&Structure> = hq.iter().copied().filter(|s| s.body_id == body_id).collect();
    let pool = if own.is_empty() { &hq } else { &own };
    pool.iter().map(|s| s.level).max().unwrap_or(1)
}
