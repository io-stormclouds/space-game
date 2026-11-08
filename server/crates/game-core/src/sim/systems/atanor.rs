//! Production of the Fabryka atanorowa from the player's machine (`atanor-system.ts`, AT4, A17,
//! doc §3.2–3.3). Each deployed program runs on the real Atanor engine: one tick every
//! `atanor_tick[level]` minutes × power efficiency (Z4) × 50 % while upgrading. A tick runs only when
//! the body's storage holds a portion for every input port of each material (the ports refill at the
//! end of a tick) and the product fits (Z3); otherwise the machine waits. Waiting skips time, not
//! commands, so the engine state is a function of the ticks run: the same as the trial's, and rebuilt
//! by replaying them after a load. Atoms entering the machine leave storage; delivered molecules
//! arrive as products.

use std::collections::HashMap;

use crate::atanor::{
    CreateOptions, Engine, GlyphType, LevelConfig, Solution, ThroughputMetrics, building_level, create_simulation, find_recipe_level,
    level_ports, machine_materials, measure_solution, program_issues, solution_key, validate_machine,
};
use crate::math::js;
use crate::models::atanor_machine::{AtanorMachine, Deployment, MachineState, ProgramMetrics};
use crate::models::event::{DomainEvent, RejectReason};
use crate::models::resource::{Cost, Qty, Stockpile, can_afford};
use crate::models::structure::{Structure, StructureState};
use crate::sim::colony::{fits_pool, power_balance};
use crate::sim::reducer::WorldState;
use crate::sim::rules::Rules;

/// The Fabryka atanorowa (building kind of the Atanor machines).
pub const ATANOR_KIND: &str = "ATN";
/// At most this many engine ticks per machine in one simulation step (against long frames).
const MAX_TICKS_PER_STEP: usize = 240;

struct CachedEngine {
    key: String,
    engine: Engine,
}

/// Engines of the deployed programs, cached between steps (rebuilt from `ticks` after a load).
#[derive(Default)]
pub struct AtanorSystem {
    engines: HashMap<String, CachedEngine>,
}

fn round(n: f64) -> f64 {
    js::round(n * 1000.0) / 1000.0
}

/// Positive part of a − b per material.
fn minus(a: &Qty, b: &Qty) -> Cost {
    let mut out = Qty::new();
    for (k, v) in a {
        let d = round(v - b.get(k).copied().unwrap_or(0.0));
        if d > 0.0 {
            out.insert(k.clone(), d);
        }
    }
    out
}

fn non_empty(s: &Qty) -> bool {
    s.values().any(|v| *v > 0.0)
}

/// Board of a building level (§8.1).
fn board_radius(level: u32) -> Option<i32> {
    building_level(level).map(|l| l.board_radius)
}

/// Extra power of a program (§8.1: 0.5 MW per hex of area, 1 MW per arm on top of the building).
fn metrics_of(rules: &Rules, m: &ThroughputMetrics) -> ProgramMetrics {
    let p = &rules.economy.params;
    ProgramMetrics {
        cycles_per_output: m.cycles_per_output.unwrap_or(0.0),
        area: m.area as f64,
        arms: m.arms as f64,
        extra_power: round(p.atanor_power_per_hex * m.area as f64 + p.atanor_power_per_arm * m.arms as f64),
    }
}

/// Value of materials [kr] at the base values of the economy model.
fn value_of(rules: &Rules, cost: &Cost) -> f64 {
    cost.iter().fold(0.0, |s, (code, q)| s + q * rules.economy.values.get(code).map(|v| v.v).unwrap_or(0.0))
}

fn recipe_of(s: &Structure) -> String {
    s.recipe.clone().unwrap_or_else(|| "A_NAD".to_string())
}

pub fn save_draft(world: &WorldState, structure_id: &str, solution: &Solution) -> DomainEvent {
    let Some(s) = world.structure(structure_id).filter(|s| s.kind == ATANOR_KIND) else {
        return DomainEvent::rejected(RejectReason::NoStructure);
    };
    DomainEvent::AtanorDraftSaved { structure_id: structure_id.to_string(), recipe: recipe_of(s), solution: solution.clone() }
}

/// Deploys a program (§3.2): checked against the building level and measured (it must reach a
/// repeating cycle with deliveries); the materials of new elements are paid now, removed ones return
/// when it is ready (A18), and the time grows with the value of the machine (A19).
pub fn deploy(world: &WorldState, rules: &Rules, structure_id: &str, solution: &Solution) -> DomainEvent {
    let Some(s) = world.structure(structure_id).filter(|s| s.kind == ATANOR_KIND && s.is_working()) else {
        return DomainEvent::rejected(RejectReason::NoStructure);
    };
    let recipe = recipe_of(s);
    let Some(level) = find_recipe_level(&recipe) else { return DomainEvent::rejected_with(RejectReason::NoRecipe, recipe) };
    let m = world.machine_of(&s.id, &recipe);
    if m.deploy.is_some() {
        return DomainEvent::rejected(RejectReason::Busy);
    }
    let issues = validate_machine(level, solution, s.level);
    if let Some(first) = issues.first() {
        return DomainEvent::rejected_with(RejectReason::MachineInvalid, first.message.clone());
    }
    let program = program_issues(solution);
    if let Some(first) = program.first() {
        return DomainEvent::rejected_with(
            RejectReason::MachineInvalid,
            format!("{} @{}: {}", first.arm_id, first.column, first.code.as_str()),
        );
    }
    let measured = measure_solution(level, Some(solution), 2000, board_radius(s.level));
    if !measured.ok || measured.cycles_per_output.is_none() {
        return match measured.problem {
            Some(p) => DomainEvent::rejected_with(RejectReason::MachineNotProducing, p.as_str()),
            None => DomainEvent::rejected(RejectReason::MachineNotProducing),
        };
    }

    let before = m.program.as_ref().map(machine_materials).unwrap_or_default();
    let after = machine_materials(solution);
    let cost = minus(&after, &before);
    let refund = minus(&before, &after);
    let pool = world.storage_of(&s.body_id);
    if !can_afford(&pool, &cost) {
        let short: Vec<String> = cost
            .iter()
            .filter(|(k, q)| pool.get(*k).copied().unwrap_or(0.0) < **q)
            .map(|(k, q)| format!("{k} {}", js::number_to_string(round(q - pool.get(k).copied().unwrap_or(0.0)))))
            .collect();
        return DomainEvent::rejected_with(RejectReason::NoResources, format!("brakuje {}", short.join(" · ")));
    }
    let minutes = round(value_of(rules, &cost) * rules.economy.params.atanor_deploy_min_per_kr).max(1.0);
    DomainEvent::AtanorDeployStarted {
        structure_id: s.id.clone(),
        recipe,
        cost,
        deployment: Deployment {
            solution: solution.clone(),
            metrics: metrics_of(rules, &measured),
            remaining: minutes,
            total: minutes,
            refund,
        },
    }
}

impl AtanorSystem {
    pub fn new() -> AtanorSystem {
        AtanorSystem::default()
    }

    /// Advances every working factory's machine; the deployment timer and the ticks run go into the
    /// world, storage changes go out as events (applied by the reducer).
    pub fn update(&mut self, world: &mut WorldState, rules: &Rules, dt: f64) -> Vec<DomainEvent> {
        let mut events: Vec<DomainEvent> = Vec::new();
        let mut pools: HashMap<String, Stockpile> = HashMap::new();
        let factories: Vec<Structure> = world.structures.iter().filter(|s| s.kind == ATANOR_KIND && s.is_working()).cloned().collect();
        for s in factories {
            let Some(m) = world.machine(&s.id).cloned() else { continue };
            let efficiency = power_balance(world, rules, &s.body_id, false).efficiency.get(rules.spec(&s.kind, s.level).priority);
            let speed = efficiency * if s.state == StructureState::Upgrading { 0.5 } else { 1.0 };
            let mut machine = m.clone();

            // deployment in progress: the old program keeps working (§3.2)
            if let Some(d) = machine.deploy.as_mut() {
                let remaining = round(d.remaining - dt);
                if remaining <= 0.0 {
                    let returned = returned(&machine);
                    events.push(DomainEvent::AtanorDeployed { structure_id: s.id.clone(), returned });
                    self.engines.remove(&s.id);
                    continue; // the new program starts in the next step
                }
                d.remaining = remaining;
            }

            if machine.program.is_some() && machine.state != MachineState::Jam {
                let start = pools.get(&s.body_id).cloned().unwrap_or_else(|| world.storage_of(&s.body_id));
                machine = self.work(&s, &machine, dt * speed, start, world, rules, &mut events, &mut pools);
            }
            if machine != m {
                let recipe = machine.recipe.clone();
                world.patch_machine(&s.id, &recipe, |x| *x = machine);
            }
        }
        events
    }

    /// Runs the ticks due in this step; storage changes go out as ATANOR_CONSUMED / ATANOR_DELIVERED.
    #[allow(clippy::too_many_arguments)]
    fn work(
        &mut self,
        s: &Structure,
        m: &AtanorMachine,
        work: f64,
        start: Stockpile,
        world: &WorldState,
        rules: &Rules,
        events: &mut Vec<DomainEvent>,
        pools: &mut HashMap<String, Stockpile>,
    ) -> AtanorMachine {
        let (Some(level), Some(program), Some(_)) = (find_recipe_level(&m.recipe), m.program.as_ref(), m.metrics.as_ref()) else {
            return m.clone();
        };
        let key = format!("{}|{}", m.recipe, solution_key(program));
        let tick = rules.economy.params.atanor_tick.get(s.level.max(1) as usize).copied().unwrap_or(1.0);
        let mut progress = m.progress + work / tick;
        // the most one tick can take: a portion for every input port of a material (they refill together)
        let mut refill: Qty = Qty::new();
        // room for what all outputs can deliver in one tick; each delivery credits the recipe's output
        let mut product: Qty = Qty::new();
        for g in level_ports(level) {
            match g.kind {
                GlyphType::Input => {
                    *refill.entry(g.element.clone().unwrap_or_default()).or_insert(0.0) += g.portion.unwrap_or(1.0);
                }
                GlyphType::Output => {
                    if let Some(p) = &g.product {
                        *product.entry(p.material.clone()).or_insert(0.0) += p.quantity;
                    }
                }
                _ => {}
            }
        }
        let per_delivery: Qty = level.recipe.as_ref().map(|r| r.outputs.clone()).unwrap_or_else(|| product.clone());

        let engine = self.engine(s, m, level, program, &key);
        let mut pool_now: Qty = start;
        let mut charged: Qty = m.consumed.clone();
        let mut state = MachineState::Running;
        let mut ticks = m.ticks;
        let mut delivered: u64 = 0;
        let delivered_before = engine.products_delivered;
        let mut consumed_now: Qty = Qty::new();
        let mut n = 0;
        while progress >= 1.0 && n < MAX_TICKS_PER_STEP {
            n += 1;
            // atoms already on the ports, not yet paid, plus a refill of every port
            let mut need = minus(engine.consumed(), &charged);
            for (k, q) in &refill {
                let cur = need.get(k).copied().unwrap_or(0.0);
                need.insert(k.clone(), round(cur + q));
            }
            if !can_afford(&pool_now, &need) {
                state = MachineState::Waiting;
                break;
            }
            if !fits_pool(world, rules, &s.body_id, &pool_now, &product) {
                state = MachineState::Full;
                break;
            }
            let step = engine.step();
            ticks += 1;
            progress -= 1.0;
            // pay for the atoms that entered (initial ones included), credit the delivered products
            let paid = minus(engine.consumed(), &charged);
            pool_now = pool_now.iter().map(|(k, v)| (k.clone(), round(v - paid.get(k).copied().unwrap_or(0.0)))).collect();
            for (k, q) in &paid {
                let cur = consumed_now.get(k).copied().unwrap_or(0.0);
                consumed_now.insert(k.clone(), round(cur + q));
            }
            charged = engine.consumed().clone();
            let made = engine.products_delivered - delivered_before - delivered;
            if made > 0 {
                delivered += made;
                for (k, q) in &per_delivery {
                    let cur = pool_now.get(k).copied().unwrap_or(0.0);
                    pool_now.insert(k.clone(), round(cur + q * made as f64));
                }
            }
            if step.collision_detected || engine.has_crashed {
                state = MachineState::Jam;
                break;
            }
        }
        if state != MachineState::Running {
            progress = progress.min(1.0);
        }
        pools.insert(s.body_id.clone(), pool_now);
        if non_empty(&consumed_now) {
            events.push(DomainEvent::AtanorConsumed { structure_id: s.id.clone(), consumed: consumed_now });
        }
        if delivered > 0 {
            let produced: Qty = per_delivery.iter().map(|(k, q)| (k.clone(), round(q * delivered as f64))).collect();
            events.push(DomainEvent::AtanorDelivered { structure_id: s.id.clone(), produced, count: delivered });
        }
        // consumed and delivered totals are applied by the reducer from the events above
        AtanorMachine { ticks, progress: round(progress), state, ..m.clone() }
    }

    /// The machine's engine at `m.ticks`: cached, or rebuilt by replaying the ticks (after a load).
    fn engine(&mut self, s: &Structure, m: &AtanorMachine, level: &LevelConfig, program: &Solution, key: &str) -> &mut Engine {
        let fresh = match self.engines.get(&s.id) {
            Some(c) => !(c.key == key && c.engine.ticks_executed == m.ticks),
            None => true,
        };
        if fresh {
            let mut engine = create_simulation(
                level,
                CreateOptions { solution: Some(program.clone()), supply: None, board_radius: board_radius(s.level) },
            );
            for _ in 0..m.ticks {
                engine.step();
            }
            self.engines.insert(s.id.clone(), CachedEngine { key: key.to_string(), engine });
        }
        &mut self.engines.get_mut(&s.id).expect("inserted above").engine
    }
}

/// Atoms inside the machine go back to storage (A23) with the refund of removed elements (A18).
fn returned(m: &AtanorMachine) -> Stockpile {
    let per_product: Qty = find_recipe_level(&m.recipe).and_then(|l| l.recipe.as_ref()).map(|r| r.inputs.clone()).unwrap_or_default();
    let mut out = Qty::new();
    for (code, q) in &m.consumed {
        let left = round(q - per_product.get(code).copied().unwrap_or(0.0) * m.delivered as f64);
        if left > 0.0 {
            out.insert(code.clone(), left);
        }
    }
    if let Some(d) = &m.deploy {
        for (code, q) in &d.refund {
            let cur = out.get(code).copied().unwrap_or(0.0);
            out.insert(code.clone(), round(cur + q));
        }
    }
    out
}
