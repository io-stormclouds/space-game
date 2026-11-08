//! The machine simulation (`atanor/engine/simulation.ts` `SimulationEngine`): arms, atoms, the
//! timeline playhead, finite input supply, delivery and area bookkeeping.

use indexmap::IndexSet;
use serde::{Deserialize, Serialize};

use super::arm::{arm_cost, gripper_positions, set_held_atom_ids};
use super::glyph::glyph_cost;
use super::molecule::MoleculeGraph;
use super::pipeline::{execute_tick, spawn_at_input};
use super::types::{
    ArmCommand, ArmState, Glyph, GlyphType, Jam, JamDetail, JamReason, LevelConfig, MoleculeView, Program, Snapshot, StepResult,
};
use crate::models::resource::Qty;

#[derive(Clone, Debug, Default)]
pub struct EngineOptions {
    /// Finite input buffers in material units per element, shared by all ports of the element.
    /// None = unlimited inputs (PoC behaviour).
    pub supply: Option<Qty>,
    /// Board = hexes within this distance of (0,0): a moving atom or gripper outside it jams with
    /// OFF_BOARD. Overrides `LevelConfig::board_radius`; both missing = unlimited board.
    pub board_radius: Option<i32>,
}

/// Input buffers and the consumed counters (the `takeInput` callback of the source).
#[derive(Clone, Debug, Default)]
pub struct SupplyState {
    pub buffers: Option<Qty>,
    pub consumed: Qty,
}

impl SupplyState {
    /// Takes one portion for a dispensed atom; false when the buffer lacks it.
    pub fn take(&mut self, glyph: &Glyph) -> bool {
        let portion = glyph.portion.unwrap_or(1.0);
        let element = glyph.element.clone().unwrap_or_default();
        if let Some(buffers) = &mut self.buffers {
            let available = buffers.get(&element).copied().unwrap_or(0.0);
            if available < portion {
                return false;
            }
            buffers.insert(element.clone(), available - portion);
        }
        *self.consumed.entry(element).or_insert(0.0) += portion;
        true
    }
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Stats {
    /// Ticks executed since reset (the CYKLE counter).
    pub cycles: u64,
    /// Timeline slot the next tick will execute.
    pub timeline_position: usize,
    pub completed_at_tick: Option<u64>,
    /// PoC cost points of the machine as built.
    pub cost: u64,
    /// Unique hexes visited by arm bases, grippers and atoms, including the swept paths.
    pub area: usize,
    pub arms: usize,
    pub track_hexes: usize,
    pub products_delivered: u64,
    pub target_required: u64,
    pub has_crashed: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub crash_message: Option<String>,
    pub jam_reason: Option<JamReason>,
    pub is_completed: bool,
    pub starved_steps: u64,
}

#[derive(Clone, Debug)]
pub struct Engine {
    pub level: LevelConfig,
    pub instructions: Program,
    /// Timeline slot (playhead) the next tick will execute. Wraps to 0 on REPEAT — not a counter.
    pub current_cycle: usize,
    pub max_timeline_length: usize,
    pub products_delivered: u64,
    pub has_crashed: bool,
    pub crash_message: Option<String>,
    pub jam_reason: Option<JamReason>,
    pub jam_detail: Option<JamDetail>,
    pub is_completed: bool,
    /// Ticks executed since reset. Never wraps.
    pub ticks_executed: u64,
    pub completed_at_tick: Option<u64>,
    /// True when the last `step()` did not run because an input was empty.
    pub is_starved: bool,
    pub starved_steps: u64,
    pub board_radius: Option<i32>,
    pub(crate) graph: MoleculeGraph,
    pub(crate) arms: Vec<ArmState>,
    pub(crate) atom_counter: u64,
    pub(crate) visited: IndexSet<String>,
    pub(crate) delivery_ticks: Vec<u64>,
    pub(crate) supply: SupplyState,
    pub(crate) produced: Qty,
    initial_supply: Option<Qty>,
}

impl Engine {
    pub fn new(level: &LevelConfig, options: EngineOptions) -> Engine {
        let mut e = Engine {
            level: level.clone(),
            instructions: level.default_instructions.clone(),
            current_cycle: 0,
            max_timeline_length: 16,
            products_delivered: 0,
            has_crashed: false,
            crash_message: None,
            jam_reason: None,
            jam_detail: None,
            is_completed: false,
            ticks_executed: 0,
            completed_at_tick: None,
            is_starved: false,
            starved_steps: 0,
            board_radius: options.board_radius.or(level.board_radius),
            graph: MoleculeGraph::new(),
            arms: Vec::new(),
            atom_counter: 0,
            visited: IndexSet::new(),
            delivery_ticks: Vec::new(),
            supply: SupplyState::default(),
            produced: Qty::new(),
            initial_supply: options.supply,
        };
        e.reset();
        e
    }

    pub fn reset(&mut self) {
        self.current_cycle = 0;
        self.products_delivered = 0;
        self.has_crashed = false;
        self.crash_message = None;
        self.jam_reason = None;
        self.jam_detail = None;
        self.is_completed = false;
        self.ticks_executed = 0;
        self.completed_at_tick = None;
        self.is_starved = false;
        self.starved_steps = 0;
        self.atom_counter = 0;
        self.visited.clear();
        self.delivery_ticks.clear();
        self.supply = SupplyState { buffers: self.initial_supply.clone(), consumed: Qty::new() };
        self.produced = Qty::new();

        // arms back to their initial positions with empty grippers; a tracked arm's index from its base
        self.arms = self.level.initial_arms.clone();
        for arm in self.arms.iter_mut() {
            set_held_atom_ids(arm, &[]);
            if let Some(track_id) = arm.track().map(str::to_string)
                && let Some(track) = self.level.tracks.as_ref().and_then(|ts| ts.iter().find(|t| t.id == track_id))
            {
                let idx = track.path.iter().position(|p| *p == arm.base_pos);
                arm.track_index = Some(idx.map(|i| i as i32).unwrap_or(0));
                if let Some(i) = idx {
                    arm.base_pos = track.path[i];
                }
            }
        }
        self.graph = MoleculeGraph::new();
        self.fill_inputs();
        self.record_visited_area();
    }

    pub fn set_instruction(&mut self, arm_id: &str, cycle: usize, cmd: Option<ArmCommand>) {
        let tape = self.instructions.entry(arm_id.to_string()).or_default();
        while tape.len() <= cycle {
            tape.push(None);
        }
        tape[cycle] = cmd;
    }

    pub fn instruction(&self, arm_id: &str, cycle: usize) -> Option<ArmCommand> {
        self.instructions.get(arm_id).and_then(|t| t.get(cycle).copied().flatten())
    }

    /// Runs one tick (or reports why it did not: a crash, or an empty input with finite supply).
    pub fn step(&mut self) -> StepResult {
        if self.has_crashed {
            return self.current_step_result();
        }
        // finite supply: a tick runs only when every input port presents an atom
        if self.supply.buffers.is_some() && !self.fill_inputs() {
            self.is_starved = true;
            self.starved_steps += 1;
            let mut r = self.current_step_result();
            r.starved = true;
            return r;
        }
        self.is_starved = false;

        let should_repeat = self.arms.iter().any(|a| self.instruction(&a.id, self.current_cycle) == Some(ArmCommand::Repeat));
        if should_repeat || self.current_cycle >= self.max_timeline_length {
            self.current_cycle = 0;
        }

        let delivered_before = self.products_delivered;
        let cycle = self.current_cycle;
        let tick = self.ticks_executed + 1;
        let result = execute_tick(self, cycle, tick);

        self.ticks_executed += 1;
        self.is_completed = result.is_level_completed;
        for _ in delivered_before..self.products_delivered {
            self.delivery_ticks.push(self.ticks_executed);
        }
        if self.is_completed && self.completed_at_tick.is_none() {
            self.completed_at_tick = Some(self.ticks_executed);
        }
        self.record_visited_area();
        self.current_cycle += 1;
        result
    }

    /// Adds material to an input buffer (finite supply only).
    pub fn add_supply(&mut self, material: &str, units: f64) {
        if units <= 0.0 {
            return;
        }
        if let Some(b) = &mut self.supply.buffers {
            *b.entry(material.to_string()).or_insert(0.0) += units;
        }
    }

    /// Remaining input buffers, or None for unlimited inputs.
    pub fn supply(&self) -> Option<&Qty> {
        self.supply.buffers.as_ref()
    }

    /// Material units taken from inputs since reset.
    pub fn consumed(&self) -> &Qty {
        &self.supply.consumed
    }

    /// Economy products credited by outputs since reset.
    pub fn produced(&self) -> &Qty {
        &self.produced
    }

    pub fn graph(&self) -> &MoleculeGraph {
        &self.graph
    }

    pub fn arms(&self) -> &[ArmState] {
        &self.arms
    }

    /// Hex keys counted in the area metric, in the order they were first visited.
    pub fn visited_hexes(&self) -> impl Iterator<Item = &String> {
        self.visited.iter()
    }

    /// Tick numbers (1-based) on which each product was delivered.
    pub fn delivery_ticks(&self) -> &[u64] {
        &self.delivery_ticks
    }

    /// Dispenses atoms on vacant input hexes. True when every input hex is occupied.
    fn fill_inputs(&mut self) -> bool {
        let mut all_occupied = true;
        let glyphs = &self.level.glyphs;
        for glyph in glyphs {
            if glyph.kind == GlyphType::Input && !spawn_at_input(&mut self.graph, &mut self.atom_counter, &mut self.supply, glyph) {
                all_occupied = false;
            }
        }
        all_occupied
    }

    fn record_visited_area(&mut self) {
        for arm in &self.arms {
            self.visited.insert(arm.base_pos.key());
            for g in gripper_positions(arm) {
                self.visited.insert(g.key());
            }
        }
        for a in self.graph.atoms() {
            self.visited.insert(a.pos.key());
        }
    }

    pub fn current_step_result(&self) -> StepResult {
        let commands_executed =
            self.arms.iter().map(|a| (a.id.clone(), self.instruction(&a.id, self.current_cycle).unwrap_or(ArmCommand::Empty))).collect();
        StepResult {
            cycle: self.current_cycle,
            tick: self.ticks_executed,
            commands_executed,
            collision_detected: self.has_crashed,
            collision_message: self.crash_message.clone(),
            jam_reason: self.jam_reason,
            jam_detail: self.jam_detail.clone(),
            starved: self.is_starved,
            products_delivered: self.products_delivered,
            is_level_completed: self.is_completed,
        }
    }

    pub fn jam(&self) -> Option<Jam> {
        if !self.has_crashed {
            return None;
        }
        Some(Jam {
            reason: self.jam_reason.unwrap_or(JamReason::AtomCollision),
            message: self.crash_message.clone().unwrap_or_default(),
            detail: self.jam_detail.clone(),
        })
    }

    pub fn snapshot(&self) -> Snapshot {
        Snapshot {
            level_id: self.level.id.clone(),
            ticks: self.ticks_executed,
            timeline_position: self.current_cycle,
            atoms: self.graph.atoms().cloned().collect(),
            bonds: self.graph.bonds().cloned().collect(),
            molecules: self.graph.molecules().into_iter().map(|(atom_ids, bond_ids)| MoleculeView { atom_ids, bond_ids }).collect(),
            arms: self.arms.clone(),
            delivered: self.products_delivered,
            target: self.level.target_required,
            completed: self.is_completed,
            completed_at_tick: self.completed_at_tick,
            jam: self.jam(),
            starved: self.is_starved,
            starved_steps: self.starved_steps,
            supply: self.supply.buffers.clone(),
            consumed: self.supply.consumed.clone(),
            produced: self.produced.clone(),
        }
    }

    pub fn stats(&self) -> Stats {
        // cost of the machine as built (initial arms): a piston's cost does not change as it extends
        let cost = self.level.initial_arms.iter().map(arm_cost).sum::<u64>() + self.level.glyphs.iter().map(glyph_cost).sum::<u64>();
        let mut track_hexes: IndexSet<String> = IndexSet::new();
        for t in self.level.tracks.as_deref().unwrap_or(&[]) {
            for p in &t.path {
                track_hexes.insert(p.key());
            }
        }
        Stats {
            cycles: self.ticks_executed,
            timeline_position: self.current_cycle,
            completed_at_tick: self.completed_at_tick,
            cost,
            area: self.visited.len(),
            arms: self.arms.len(),
            track_hexes: track_hexes.len(),
            products_delivered: self.products_delivered,
            target_required: self.level.target_required,
            has_crashed: self.has_crashed,
            crash_message: self.crash_message.clone(),
            jam_reason: self.jam_reason,
            is_completed: self.is_completed,
            starved_steps: self.starved_steps,
        }
    }
}
