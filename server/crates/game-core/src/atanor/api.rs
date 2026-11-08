//! Game-facing API of the engine (`atanor/api.ts`) plus the two editor checks the server repeats
//! on deployment (`atanor/editor/solution-edit.ts`: `programIssues`, `solutionKey`).

use std::sync::LazyLock;

use serde::{Deserialize, Serialize};

use super::engine::{Engine, EngineOptions};
use super::glyph::{glyph_cells, is_port_glyph};
use super::levels::poc_levels;
use super::recipes::recipe_levels;
use super::throughput::{ThroughputMetrics, measure_throughput};
use super::types::{ArmCommand, Glyph, LevelConfig, LevelKind, Snapshot, Solution};
use crate::economy::AtanorSpec;
use crate::models::resource::Qty;

/// All levels: the 4 PoC teaching levels, then the economy recipes.
pub static ATANOR_LEVELS: LazyLock<Vec<&'static LevelConfig>> = LazyLock::new(|| poc_levels().into_iter().chain(recipe_levels()).collect());

pub fn level_kind(level: &LevelConfig) -> LevelKind {
    level.kind.unwrap_or(LevelKind::Poc)
}

pub fn list_levels(kind: Option<LevelKind>) -> Vec<&'static LevelConfig> {
    ATANOR_LEVELS.iter().copied().filter(|l| kind.is_none_or(|k| level_kind(l) == k)).collect()
}

pub fn get_level(id: &str) -> Option<&'static LevelConfig> {
    ATANOR_LEVELS.iter().copied().find(|l| l.id == id)
}

/// Level for an economy recipe id, e.g. `A_NAD`.
pub fn find_recipe_level(recipe_id: &str) -> Option<&'static LevelConfig> {
    recipe_levels().into_iter().find(|l| l.recipe.as_ref().is_some_and(|r| r.recipe_id == recipe_id))
}

/// Input and output ports of a level (fixed; the player builds around them).
pub fn level_ports(level: &LevelConfig) -> Vec<&Glyph> {
    level.glyphs.iter().filter(|g| is_port_glyph(g)).collect()
}

/// The machine shipped with the level (PoC default solution / recipe reference solution).
pub fn reference_solution(level: &LevelConfig) -> Solution {
    Solution {
        arms: level.initial_arms.clone(),
        glyphs: level.glyphs.iter().filter(|g| !is_port_glyph(g)).cloned().collect(),
        tracks: level.tracks.clone().unwrap_or_default(),
        program: level.default_instructions.clone(),
    }
}

/// Nothing built yet: no arms, glyphs, tracks or program.
pub fn empty_solution() -> Solution {
    Solution::default()
}

/// Level ports + player solution as one engine config. Port glyphs in the solution are ignored.
pub fn compose_level(level: &LevelConfig, solution: &Solution) -> LevelConfig {
    LevelConfig {
        glyphs: level_ports(level).into_iter().cloned().chain(solution.glyphs.iter().filter(|g| !is_port_glyph(g)).cloned()).collect(),
        tracks: Some(solution.tracks.clone()),
        initial_arms: solution.arms.clone(),
        default_instructions: solution.program.clone(),
        ..level.clone()
    }
}

#[derive(Clone, Debug, Default)]
pub struct CreateOptions {
    /// Player machine; default = the level's reference solution.
    pub solution: Option<Solution>,
    pub supply: Option<Qty>,
    /// e.g. `building_level(n).board_radius`; without it the board is unlimited, as in the PoC.
    pub board_radius: Option<i32>,
}

/// New simulation of `level` running `options.solution` (default: the reference solution).
pub fn create_simulation(level: &LevelConfig, options: CreateOptions) -> Engine {
    let solution = options.solution.unwrap_or_else(|| reference_solution(level));
    Engine::new(&compose_level(level, &solution), EngineOptions { supply: options.supply, board_radius: options.board_radius })
}

/// Steps until the target is reached, the machine jams or starves, or `max_ticks` ticks ran.
pub fn run_simulation(engine: &mut Engine, max_ticks: u64) -> Snapshot {
    while engine.ticks_executed < max_ticks && !engine.is_completed && !engine.has_crashed {
        if engine.step().starved {
            break;
        }
    }
    engine.snapshot()
}

/// Steady-state throughput of a solution, measured with unlimited inputs on a board of
/// `board_radius` (None = unlimited).
pub fn measure_solution(level: &LevelConfig, solution: Option<&Solution>, max_ticks: u64, board_radius: Option<i32>) -> ThroughputMetrics {
    let mut engine = create_simulation(level, CreateOptions { solution: solution.cloned(), supply: None, board_radius });
    measure_throughput(&mut engine, max_ticks)
}

/// Measured metrics in the shape of the economy catalog's `AtanorSpec`; None when not producing.
pub fn to_atanor_spec(building_level: u32, metrics: &ThroughputMetrics) -> Option<AtanorSpec> {
    if !metrics.ok {
        return None;
    }
    metrics.cycles_per_output.map(|cycles| AtanorSpec {
        level: building_level,
        cycles,
        area: metrics.area as f64,
        arms: metrics.arms as f64,
    })
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ProgramIssueCode {
    /// EXTEND / RETRACT on an arm without a piston.
    NoPiston,
    /// TRACK_* on an arm that does not ride a track.
    NoTrack,
}

impl ProgramIssueCode {
    pub fn as_str(&self) -> &'static str {
        match self {
            ProgramIssueCode::NoPiston => "NO_PISTON",
            ProgramIssueCode::NoTrack => "NO_TRACK",
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ProgramIssue {
    pub arm_id: String,
    pub column: usize,
    pub code: ProgramIssueCode,
}

/// Commands the arm cannot execute, found before the run (§5.2).
pub fn program_issues(solution: &Solution) -> Vec<ProgramIssue> {
    let mut out = Vec::new();
    for arm in &solution.arms {
        let tape = solution.program.get(&arm.id).map(|t| t.as_slice()).unwrap_or(&[]);
        for (column, cmd) in tape.iter().enumerate() {
            if matches!(cmd, Some(ArmCommand::Extend | ArmCommand::Retract)) && !arm.is_piston {
                out.push(ProgramIssue { arm_id: arm.id.clone(), column, code: ProgramIssueCode::NoPiston });
            }
            if matches!(cmd, Some(ArmCommand::TrackPos | ArmCommand::TrackNeg)) && arm.track().is_none() {
                out.push(ProgramIssue { arm_id: arm.id.clone(), column, code: ProgramIssueCode::NoTrack });
            }
        }
    }
    out
}

/// Stable key of a solution (drafts, caches, "changed since the trial").
pub fn solution_key(solution: &Solution) -> String {
    let arms: Vec<String> = solution
        .arms
        .iter()
        .map(|a| {
            format!(
                "{}@{}r{}l{}{}{}{}",
                a.id,
                a.base_pos.key(),
                a.rotation,
                a.length,
                if a.is_piston { "p" } else { "" },
                a.grippers.unwrap_or(1),
                a.track_id.as_ref().and_then(|t| t.as_deref()).unwrap_or("")
            )
        })
        .collect();
    let glyphs: Vec<String> = solution
        .glyphs
        .iter()
        .map(|g| format!("{}:{}", g.kind.as_str(), glyph_cells(g).iter().map(|c| c.key()).collect::<Vec<_>>().join("-")))
        .collect();
    let tracks: Vec<String> =
        solution.tracks.iter().map(|t| format!("{}:{}", t.id, t.path.iter().map(|c| c.key()).collect::<Vec<_>>().join("-"))).collect();
    let mut keys: Vec<&String> = solution.program.keys().collect();
    keys.sort();
    let program: Vec<String> = keys
        .into_iter()
        .map(|k| {
            let tape: Vec<&str> = solution.program[k].iter().map(|c| c.map(|c| c.as_str()).unwrap_or("_")).collect();
            format!("{k}={}", tape.join(","))
        })
        .collect();
    [arms.join(";"), glyphs.join(";"), tracks.join(";"), program.join(";")].join("|")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::atanor::levels::{LEVEL_1_DIMER, LEVEL_2_WATER, LEVEL_4_TRACK, level_2_poc_broken_program};
    use crate::atanor::recipes::{LEVEL_A_KAT, LEVEL_A_MET, LEVEL_A_NAD, LEVEL_A_PRO};
    use crate::atanor::throughput::ThroughputProblem;
    use crate::atanor::types::JamReason;

    #[test]
    fn reference_machines_produce_in_their_documented_cycles() {
        // the comments of recipes.ts: NAD 12 ticks per product, KAT 6, MET 7, PRO 6
        let nad = measure_solution(&LEVEL_A_NAD, None, 2000, Some(2));
        assert!(nad.ok, "{:?}", nad.problem);
        assert_eq!(nad.cycles_per_output, Some(12.0));
        assert_eq!(nad.inputs_per_output.as_ref().and_then(|q| q.get("H2")), Some(&10.0));
        let kat = measure_solution(&LEVEL_A_KAT, None, 2000, Some(3));
        assert_eq!((kat.ok, kat.cycles_per_output), (true, Some(6.0)));
        let met = measure_solution(&LEVEL_A_MET, None, 2000, Some(3));
        assert_eq!((met.ok, met.cycles_per_output), (true, Some(7.0)));
        let pro = measure_solution(&LEVEL_A_PRO, None, 2000, Some(5));
        assert_eq!((pro.ok, pro.cycles_per_output), (true, Some(6.0)));
    }

    #[test]
    fn poc_levels_complete_and_the_broken_program_jams() {
        for level in [&*LEVEL_1_DIMER, &*LEVEL_2_WATER, &*LEVEL_4_TRACK] {
            let mut e = create_simulation(level, CreateOptions::default());
            let snap = run_simulation(&mut e, 1000);
            assert!(snap.completed, "{} did not complete: {:?}", level.id, snap.jam);
        }
        let broken = Solution { program: level_2_poc_broken_program(), ..reference_solution(&LEVEL_2_WATER) };
        let m = measure_solution(&LEVEL_2_WATER, Some(&broken), 2000, None);
        assert_eq!(m.problem, Some(ThroughputProblem::Jam));
        assert_eq!(m.jam.as_ref().map(|j| j.reason), Some(JamReason::AtomCollision));
        assert_eq!(m.ticks_simulated, 9);
    }

    #[test]
    fn keys_and_program_checks() {
        let s = reference_solution(&LEVEL_A_NAD);
        assert!(solution_key(&s).starts_with("arm-1@1,-1r0l11;arm-2@-1,0r3l11|BONDER:0,0-1,0;"));
        assert!(program_issues(&s).is_empty());
        let mut bad = s.clone();
        bad.program.get_mut("arm-1").unwrap()[0] = Some(ArmCommand::Extend);
        assert_eq!(program_issues(&bad)[0].code, ProgramIssueCode::NoPiston);
    }
}
