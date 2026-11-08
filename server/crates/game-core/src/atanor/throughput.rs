//! Throughput metrics of an Atanor machine (`atanor/engine/throughput.ts`, doc §8.4): a machine is
//! deterministic, so once its full state repeats it loops forever; loop length / products per loop
//! = steady-state cycles per product, independent of warm-up and of `target_required`.

use std::collections::HashMap;

use serde::{Deserialize, Serialize};

use super::arm::held_atom_ids;
use super::engine::Engine;
use super::types::{Jam, JamReason};
use crate::models::resource::Qty;

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ThroughputProblem {
    /// The machine jammed before its loop was found.
    Jam,
    /// The machine loops without delivering anything.
    NoOutput,
    /// No repeated state within `max_ticks`.
    NoLoop,
    /// An input ran dry (only with finite supply).
    Starved,
}

impl ThroughputProblem {
    pub fn as_str(&self) -> &'static str {
        match self {
            ThroughputProblem::Jam => "JAM",
            ThroughputProblem::NoOutput => "NO_OUTPUT",
            ThroughputProblem::NoLoop => "NO_LOOP",
            ThroughputProblem::Starved => "STARVED",
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ThroughputMetrics {
    pub ok: bool,
    pub problem: Option<ThroughputProblem>,
    pub jam: Option<Jam>,
    /// Steady-state ticks per delivered product (may be fractional).
    pub cycles_per_output: Option<f64>,
    pub period_ticks: Option<u64>,
    pub outputs_per_period: Option<u64>,
    pub warmup_ticks: Option<u64>,
    pub first_output_tick: Option<u64>,
    /// Tick on which `target_required` products were delivered.
    pub ticks_to_target: Option<u64>,
    /// Steady-state material units taken from inputs per product.
    pub inputs_per_output: Option<Qty>,
    /// Unique hexes visited by bases, grippers and atoms, including the swept paths.
    pub area: usize,
    pub arms: usize,
    /// PoC cost points.
    pub cost: u64,
    pub ticks_simulated: u64,
}

/// Canonical machine state without atom ids (ids keep growing). Two states with the same key evolve
/// identically.
pub fn machine_state_key(engine: &Engine) -> String {
    let graph = engine.graph();
    let pos_of = |atom_id: Option<&String>| -> String {
        match atom_id.and_then(|id| graph.atom(id)) {
            Some(a) => a.pos.key(),
            None => "-".to_string(),
        }
    };
    let mut arms: Vec<&_> = engine.arms().iter().collect();
    arms.sort_by(|a, b| a.id.cmp(&b.id));
    let arms: Vec<String> = arms
        .iter()
        .map(|a| {
            let held: Vec<String> = held_atom_ids(a).iter().map(|id| pos_of(id.as_ref())).collect();
            format!(
                "{}@{}/{}/{}/{}/{}",
                a.id,
                a.base_pos.key(),
                a.rotation,
                a.length,
                a.track_index.map(|i| i.to_string()).unwrap_or_default(),
                held.join(",")
            )
        })
        .collect();
    let mut atoms: Vec<String> = graph.atoms().map(|a| format!("{}:{}", a.pos.key(), a.element)).collect();
    atoms.sort();
    let mut bonds: Vec<String> = graph
        .bonds()
        .map(|b| {
            let p1 = pos_of(Some(&b.atom1_id));
            let p2 = pos_of(Some(&b.atom2_id));
            if p1 < p2 { format!("{p1}~{p2}") } else { format!("{p2}~{p1}") }
        })
        .collect();
    bonds.sort();
    format!("{}|{}|{}|{}", engine.current_cycle, arms.join(";"), atoms.join(";"), bonds.join(";"))
}

fn diff_per_output(now: &Qty, before: &Qty, outputs: u64) -> Qty {
    let mut result = Qty::new();
    for (material, units) in now {
        let delta = units - before.get(material).copied().unwrap_or(0.0);
        if delta != 0.0 {
            result.insert(material.clone(), delta / outputs as f64);
        }
    }
    result
}

struct Seen {
    tick: u64,
    delivered: u64,
    consumed: Qty,
}

struct Loop {
    start: u64,
    period: u64,
    outputs: u64,
    inputs: Option<Qty>,
}

/// Resets `engine` and runs it until its loop is found and the target is reached (or it jams,
/// starves or hits `max_ticks`). Use an engine with unlimited inputs.
pub fn measure_throughput(engine: &mut Engine, max_ticks: u64) -> ThroughputMetrics {
    engine.reset();
    let mut seen: HashMap<String, Seen> = HashMap::new();
    seen.insert(machine_state_key(engine), Seen { tick: 0, delivered: 0, consumed: engine.consumed().clone() });

    let mut found: Option<Loop> = None;
    let mut problem: Option<ThroughputProblem> = None;

    while engine.ticks_executed < max_ticks {
        let result = engine.step();
        if result.starved {
            problem = Some(ThroughputProblem::Starved);
            break;
        }
        if engine.has_crashed {
            problem = Some(ThroughputProblem::Jam);
            break;
        }
        if found.is_none() {
            let key = machine_state_key(engine);
            match seen.get(&key) {
                Some(previous) => {
                    let outputs = engine.products_delivered - previous.delivered;
                    found = Some(Loop {
                        start: previous.tick,
                        period: engine.ticks_executed - previous.tick,
                        outputs,
                        inputs: if outputs > 0 { Some(diff_per_output(engine.consumed(), &previous.consumed, outputs)) } else { None },
                    });
                    if outputs == 0 {
                        problem = Some(ThroughputProblem::NoOutput);
                        break;
                    }
                }
                None => {
                    seen.insert(
                        key,
                        Seen { tick: engine.ticks_executed, delivered: engine.products_delivered, consumed: engine.consumed().clone() },
                    );
                }
            }
        }
        if found.is_some() && engine.is_completed {
            break;
        }
    }
    if found.is_none() && problem.is_none() {
        problem = Some(ThroughputProblem::NoLoop);
    }

    let stats = engine.stats();
    let deliveries = engine.delivery_ticks();
    let productive = found.as_ref().is_some_and(|l| l.outputs > 0);
    ThroughputMetrics {
        ok: problem.is_none(),
        problem,
        jam: if engine.has_crashed {
            Some(Jam {
                reason: engine.jam_reason.unwrap_or(JamReason::AtomCollision),
                message: engine.crash_message.clone().unwrap_or_default(),
                detail: engine.jam_detail.clone(),
            })
        } else {
            None
        },
        cycles_per_output: if productive { found.as_ref().map(|l| l.period as f64 / l.outputs as f64) } else { None },
        period_ticks: found.as_ref().map(|l| l.period),
        outputs_per_period: found.as_ref().map(|l| l.outputs),
        warmup_ticks: found.as_ref().map(|l| l.start),
        first_output_tick: deliveries.first().copied(),
        ticks_to_target: engine.completed_at_tick,
        inputs_per_output: if productive { found.as_ref().and_then(|l| l.inputs.clone()) } else { None },
        area: stats.area,
        arms: stats.arms,
        cost: stats.cost,
        ticks_simulated: engine.ticks_executed,
    }
}
