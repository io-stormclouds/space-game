//! Replays a `SaveFile` recorded by the TypeScript mock server and compares the world and the
//! events with what TS produced (`expected.json`).

use std::fs;
use std::path::Path;

use game_core::economy::{EconomyParams, compute_economy};
use game_core::models::command::Command;
use game_core::models::event::DomainEvent;
use game_core::sim::clock::SECONDS_PER_MODEL_MINUTE;
use game_core::sim::scenarios::start_simulation;
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::compare::{Tolerance, compare, report};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TempoChange {
    pub step: u64,
    pub tempo: f64,
}

#[derive(Deserialize)]
pub struct RecordedCommand {
    pub step: u64,
    pub command: Command,
}

/// `web-game/packages/api` `SaveFile` (v1).
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveFile {
    pub format: String,
    pub version: u32,
    pub scenario_id: String,
    #[serde(default)]
    pub economy: Option<EconomyParams>,
    pub step_seconds: f64,
    pub tempos: Vec<TempoChange>,
    pub step: u64,
    pub world: Value,
    pub commands: Vec<RecordedCommand>,
}

#[derive(Serialize, Deserialize)]
pub struct StepEvents {
    pub step: u64,
    pub events: Vec<Value>,
}

/// What the TS recorder writes next to the save: the final world, events per step, rejected count.
#[derive(Serialize, Deserialize)]
pub struct Expected {
    pub world: Value,
    pub events: Vec<StepEvents>,
    pub rejected: u64,
}

pub struct ReplayOutcome {
    pub world: Value,
    pub events: Vec<StepEvents>,
    pub rejected: u64,
}

/// Mirrors `MockServer.replay`: tempo changes and commands at step s, then one fixed step while s < file.step.
pub fn replay(file: &SaveFile) -> Result<ReplayOutcome, String> {
    if file.format != "space-game-save" || file.version != 1 {
        return Err("not a space-game save file (v1)".to_string());
    }
    let economy = file.economy.clone().map(compute_economy);
    let mut sim = start_simulation(&file.scenario_id, economy).ok_or_else(|| format!("unknown scenario {}", file.scenario_id))?;
    let mut tempo = file.tempos.first().map(|t| t.tempo).unwrap_or(60.0);
    let mut ti = 1;
    let mut ci = 0;
    let mut rejected = 0;
    let mut events: Vec<StepEvents> = Vec::new();
    for s in 0..=file.step {
        let mut at_step: Vec<DomainEvent> = Vec::new();
        while ti < file.tempos.len() && file.tempos[ti].step == s {
            tempo = file.tempos[ti].tempo;
            ti += 1;
        }
        while ci < file.commands.len() && file.commands[ci].step == s {
            let out = sim.dispatch(&file.commands[ci].command);
            if out.iter().any(|e| e.is_rejection()) {
                rejected += 1;
            }
            at_step.extend(out);
            ci += 1;
        }
        if s < file.step {
            let step_minutes = (file.step_seconds * tempo) / SECONDS_PER_MODEL_MINUTE;
            at_step.extend(sim.step(step_minutes));
        }
        if !at_step.is_empty() {
            events
                .push(StepEvents { step: s, events: at_step.iter().map(|e| serde_json::to_value(e).expect("event serialises")).collect() });
        }
    }
    let world = serde_json::to_value(&sim.world).map_err(|e| e.to_string())?;
    Ok(ReplayOutcome { world, events, rejected })
}

pub fn run_dir(dir: &Path) -> bool {
    let mut entries: Vec<_> = match fs::read_dir(dir) {
        Ok(rd) => rd.filter_map(|e| e.ok()).filter(|e| e.path().is_dir()).collect(),
        Err(e) => {
            eprintln!("cannot read {}: {e}", dir.display());
            return false;
        }
    };
    entries.sort_by_key(|e| e.file_name());
    let mut all_ok = true;
    for entry in entries {
        let name = entry.file_name().to_string_lossy().to_string();
        let ok = run_one(&entry.path(), &name);
        all_ok &= ok;
    }
    all_ok
}

fn run_one(dir: &Path, name: &str) -> bool {
    let save: SaveFile = match fs::read_to_string(dir.join("save.json"))
        .map_err(|e| e.to_string())
        .and_then(|s| serde_json::from_str(&s).map_err(|e| e.to_string()))
    {
        Ok(f) => f,
        Err(e) => {
            println!("FAIL {name}: save.json: {e}");
            return false;
        }
    };
    let expected: Expected = match fs::read_to_string(dir.join("expected.json"))
        .map_err(|e| e.to_string())
        .and_then(|s| serde_json::from_str(&s).map_err(|e| e.to_string()))
    {
        Ok(f) => f,
        Err(e) => {
            println!("FAIL {name}: expected.json: {e}");
            return false;
        }
    };
    let started = std::time::Instant::now();
    let outcome = match replay(&save) {
        Ok(o) => o,
        Err(e) => {
            println!("FAIL {name}: {e}");
            return false;
        }
    };
    let elapsed = started.elapsed();
    let tol = Tolerance::default();
    let mut ok = true;
    ok &= report(
        &format!("{name} · world (step {}, {} commands, {:.1} ms)", save.step, save.commands.len(), elapsed.as_secs_f64() * 1000.0),
        &compare(&expected.world, &outcome.world, tol),
        20,
    );
    ok &= report(&format!("{name} · world vs save.world"), &compare(&save.world, &outcome.world, tol), 5);
    let exp_events = serde_json::to_value(&expected.events).expect("events serialise");
    let act_events = serde_json::to_value(&outcome.events).expect("events serialise");
    ok &= report(&format!("{name} · events ({} steps with events)", outcome.events.len()), &compare(&exp_events, &act_events, tol), 20);
    if expected.rejected != outcome.rejected {
        println!("FAIL {name} · rejected: TS {} vs Rust {}", expected.rejected, outcome.rejected);
        ok = false;
    } else {
        println!("OK   {name} · rejected {}", outcome.rejected);
    }
    ok
}
