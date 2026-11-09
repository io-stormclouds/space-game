//! Numeric vectors recorded from the TypeScript domain (`web-game/tools/conformance/record-vectors.ts`).
//! Each section is computed again in Rust and compared with the recorded JSON.

use std::fs;
use std::path::Path;

use game_core::atanor;
use game_core::economy::{EconomyParams, compute_economy, economy_tables};
use game_core::math::asteroid::asteroid_shape;
use game_core::math::bezier::BezierPath;
use game_core::math::footprint::footprint_tiles;
use game_core::math::geodesic::geodesic_sphere;
use game_core::math::goldberg::build_goldberg_grid;
use game_core::math::lead::{LeadOptions, solve_lead_intercept};
use game_core::math::noise::{fbm, hash3};
use game_core::math::orbit::OrbitSolver;
use game_core::math::terrain::{classify_terrain, terrain_aim};
use game_core::math::vec3::Vec3;
use game_core::models::resource::Qty;
use game_core::models::terrain::TerrainBiome;
use game_core::sim::scenarios::{poc_scenario, tau_ceti_scenario};
use game_core::sim::{Rules, Simulation, SimulationOptions, create_world};
use serde::Deserialize;
use serde_json::{Value, json};

use crate::compare::{Diff, Tolerance, compare, report};

#[derive(Deserialize)]
struct GridVector {
    #[serde(rename = "bodyId")]
    body_id: String,
    radius: f64,
    frequency: usize,
    #[serde(rename = "depositSeed")]
    deposit_seed: Option<f64>,
    #[serde(rename = "depositWeights")]
    deposit_weights: Option<indexmap_shim::Map>,
}

/// `indexmap` is not a dependency here; serde_json with `preserve_order` keeps the order for us.
mod indexmap_shim {
    pub type Map = serde_json::Map<String, serde_json::Value>;
}

#[derive(Deserialize)]
struct OrbitVector {
    scenario: String,
    #[serde(rename = "bodyId")]
    body_id: String,
    t: f64,
}

#[derive(Deserialize)]
struct LeadVector {
    scenario: String,
    start: [f64; 3],
    #[serde(rename = "targetId")]
    target_id: String,
    t: f64,
    orbit: bool,
}

/// One Atanor machine case: a level, a solution, an optional board and supply, ticks to run.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct AtanorCase {
    name: String,
    level_id: String,
    solution: atanor::Solution,
    board_radius: Option<i32>,
    supply: Option<Qty>,
    ticks: u64,
}

/// One terrain classification: a recorded grid (`grids[grid]`), its body and a style.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct TerrainVector {
    grid: usize,
    scenario: String,
    body_id: String,
    biome: TerrainBiome,
    seed: f64,
}

#[derive(Deserialize)]
struct FootprintVector {
    grid: usize,
    anchor: usize,
    size: usize,
    rotation: i64,
}

fn v3(v: Vec3) -> Value {
    json!([v.x, v.y, v.z])
}

fn solver_for(scenario: &str) -> OrbitSolver {
    match scenario {
        "tau-ceti" => OrbitSolver::new(&tau_ceti_scenario().bodies),
        _ => OrbitSolver::new(&poc_scenario().bodies),
    }
}

pub fn run(file: &Path) -> bool {
    let text = match fs::read_to_string(file) {
        Ok(t) => t,
        Err(e) => {
            eprintln!("cannot read {}: {e}", file.display());
            return false;
        }
    };
    let root: Value = match serde_json::from_str(&text) {
        Ok(v) => v,
        Err(e) => {
            eprintln!("invalid JSON: {e}");
            return false;
        }
    };
    let tol = Tolerance::default();
    let mut ok = true;

    // geodesic(4)
    if let Some(exp) = root.get("geodesic4") {
        let g = geodesic_sphere(4);
        let act = json!({
            "vertices": g.vertices.iter().map(|v| v3(*v)).collect::<Vec<_>>(),
            "faces": g.faces,
        });
        ok &= report("geodesic4", &compare(exp, &act, tol), 10);
    }

    // grids: inputs + expected tiles
    let mut grids = Vec::new();
    if let Some(Value::Array(list)) = root.get("grids") {
        for (i, exp) in list.iter().enumerate() {
            let input: GridVector = serde_json::from_value(exp.clone()).expect("grid vector");
            let weights = input.deposit_weights.map(|m| m.into_iter().map(|(k, v)| (k, v.as_f64().unwrap_or(0.0))).collect());
            let grid = build_goldberg_grid(&input.body_id, input.radius, input.frequency, input.deposit_seed, weights.as_ref());
            let act = json!({
                "bodyId": grid.body_id,
                "radius": grid.radius,
                "frequency": grid.frequency,
                "depositSeed": input.deposit_seed,
                "depositWeights": exp.get("depositWeights").cloned().unwrap_or(Value::Null),
                "tileEdge": grid.tile_edge,
                "tiles": grid.tiles.iter().map(|t| json!({
                    "index": t.index,
                    "kind": t.kind,
                    "center": v3(t.center),
                    "normal": v3(t.normal),
                    "vertices": t.vertices.iter().map(|v| v3(*v)).collect::<Vec<_>>(),
                    "neighbors": t.neighbors,
                    "deposit": t.deposit,
                })).collect::<Vec<_>>(),
            });
            ok &= report(&format!("grid[{i}] {} GP({},0)", input.body_id, input.frequency), &compare(exp, &act, tol), 10);
            grids.push(grid);
        }
    }

    // terrain classes and settlement roads (T8): the aim from the scenario body (libm cos/sin), the
    // classes compared as strings, so they must be equal to the last bit of the noise
    if let Some(Value::Array(list)) = root.get("terrain") {
        let mut act = Vec::new();
        let mut inexact = Vec::new();
        for (i, exp) in list.iter().enumerate() {
            let input: TerrainVector = serde_json::from_value(exp.clone()).expect("terrain vector");
            let bodies = match input.scenario.as_str() {
                "tau-ceti" => tau_ceti_scenario().bodies,
                _ => poc_scenario().bodies,
            };
            let body = bodies.iter().find(|b| b.id == input.body_id).expect("terrain body");
            let aim = terrain_aim(body);
            // the aim feeds the settlement score: bit for bit, not within the tolerance
            let recorded: [f64; 3] = serde_json::from_value(exp["aim"].clone()).expect("terrain aim");
            if recorded != aim.to_array() {
                inexact.push(Diff {
                    path: format!("$[{i}].aim"),
                    message: format!("TS {recorded:?} vs Rust {:?} (not bit-identical)", aim.to_array()),
                });
            }
            let c = grids.get(input.grid).map(|g| classify_terrain(g, input.biome, input.seed, Some(aim)));
            act.push(json!({
                "grid": input.grid,
                "scenario": input.scenario,
                "bodyId": input.body_id,
                "biome": input.biome,
                "seed": input.seed,
                "aim": v3(aim),
                "kinds": c.as_ref().map(|c| c.kinds.clone()),
                "road": c.as_ref().map(|c| c.road.clone()),
                "settlementCenter": c.as_ref().and_then(|c| c.settlement_center),
            }));
        }
        let name = format!("terrain ({} classifications: aim, classes, roads, settlement centre)", list.len());
        let mut diffs = compare(root.get("terrain").unwrap(), &Value::Array(act), tol);
        diffs.extend(inexact);
        ok &= report(&name, &diffs, 10);
    }

    if let Some(Value::Array(list)) = root.get("orbits") {
        let mut act = Vec::new();
        for exp in list {
            let input: OrbitVector = serde_json::from_value(exp.clone()).expect("orbit vector");
            let solver = solver_for(&input.scenario);
            act.push(json!({
                "scenario": input.scenario,
                "bodyId": input.body_id,
                "t": input.t,
                "world": v3(solver.world_position(&input.body_id, input.t)),
                "docking": v3(solver.docking_position(&input.body_id, input.t)),
                "orbit": v3(solver.orbit_position(&input.body_id, input.t)),
                "maxLinearSpeed": solver.max_linear_speed(&input.body_id),
            }));
        }
        ok &= report("orbits", &compare(root.get("orbits").unwrap(), &Value::Array(act), tol), 10);
    }

    if let Some(Value::Array(list)) = root.get("leads") {
        let mut act = Vec::new();
        for exp in list {
            let input: LeadVector = serde_json::from_value(exp.clone()).expect("lead vector");
            let solver = solver_for(&input.scenario);
            let r = solve_lead_intercept(
                Vec3::from_array(input.start),
                &input.target_id,
                input.t,
                150.0,
                &solver,
                LeadOptions { orbit: input.orbit, ..Default::default() },
            );
            act.push(json!({
                "scenario": input.scenario,
                "start": input.start,
                "targetId": input.target_id,
                "t": input.t,
                "orbit": input.orbit,
                "leadPos": v3(r.lead_pos),
                "flightTime": r.flight_time,
                "iterations": r.iterations,
            }));
        }
        ok &= report("leads", &compare(root.get("leads").unwrap(), &Value::Array(act), tol), 10);
    }

    if let Some(exp) = root.get("bezier") {
        let p0 = Vec3::from_array(serde_json::from_value(exp["p0"].clone()).expect("p0"));
        let p2 = Vec3::from_array(serde_json::from_value(exp["p2"].clone()).expect("p2"));
        let lift = exp["lift"].as_f64().unwrap_or(0.2);
        let path = BezierPath::arc(p0, p2, lift);
        let act = json!({
            "p0": v3(p0), "p2": v3(p2), "lift": lift,
            "p1": v3(path.p1),
            "samples": path.sample(48).iter().map(|v| v3(*v)).collect::<Vec<_>>(),
            "length64": path.approx_length(64),
            "tangent0": v3(path.tangent_at(0.0)),
            "tangent1": v3(path.tangent_at(1.0)),
        });
        ok &= report("bezier", &compare(exp, &act, tol), 10);
    }

    if let Some(exp) = root.get("asteroid") {
        let poc = poc_scenario();
        let body = poc.bodies.iter().find(|b| b.id == "asteroid").expect("asteroid");
        let s = asteroid_shape(body, 4);
        let act = json!({
            "seed": s.seed,
            "vertices": s.vertices.iter().map(|v| v3(*v)).collect::<Vec<_>>(),
            "faces": s.faces,
        });
        ok &= report("asteroid", &compare(exp, &act, tol), 10);
    }

    if let Some(exp) = root.get("noise") {
        let mut hashes = Vec::new();
        if let Some(Value::Array(list)) = exp.get("hash3") {
            for h in list {
                let a: [f64; 4] = serde_json::from_value(h["args"].clone()).expect("hash args");
                hashes.push(json!({ "args": a, "value": hash3(a[0], a[1], a[2], a[3]) }));
            }
        }
        let mut fbms = Vec::new();
        if let Some(Value::Array(list)) = exp.get("fbm") {
            for f in list {
                let p: [f64; 3] = serde_json::from_value(f["p"].clone()).expect("fbm p");
                let seed = f["seed"].as_f64().unwrap_or(5.0);
                fbms.push(json!({ "seed": seed, "p": p, "value": fbm(seed, Vec3::from_array(p), 3) }));
            }
        }
        ok &= report("noise", &compare(exp, &json!({ "hash3": hashes, "fbm": fbms }), tol), 10);
    }

    if let Some(Value::Array(list)) = root.get("footprints") {
        let mut act = Vec::new();
        for exp in list {
            let input: FootprintVector = serde_json::from_value(exp.clone()).expect("footprint vector");
            let tiles = grids.get(input.grid).and_then(|g| footprint_tiles(g, input.anchor, input.size, input.rotation));
            act.push(json!({ "grid": input.grid, "anchor": input.anchor, "size": input.size, "rotation": input.rotation, "tiles": tiles }));
        }
        ok &= report("footprints", &compare(root.get("footprints").unwrap(), &Value::Array(act), tol), 10);
    }

    if let Some(exp) = root.get("pocWorld") {
        let sim = Simulation::new(poc_scenario(), SimulationOptions::default());
        let act = serde_json::to_value(&sim.world).expect("world");
        ok &= report("pocWorld (createWorld planeta-matka)", &compare(exp, &act, tol), 10);
    }

    if let Some(exp) = root.get("tauCetiWorld") {
        let scenario = tau_ceti_scenario();
        let rules = Rules::new(None, scenario.overrides.clone());
        let grids = game_core::sim::build_world_grids(&scenario.bodies);
        let act = serde_json::to_value(create_world(&scenario, &grids, &rules)).expect("world");
        ok &= report("tauCetiWorld (createWorld tau-ceti)", &compare(exp, &act, tol), 10);
    }

    if let Some(exp) = root.get("economy") {
        let eco = compute_economy(EconomyParams::default());
        let rules = Rules::new(None, None);
        let mut specs = Vec::new();
        for b in eco.buildings().iter().chain(eco.vehicles().iter()) {
            for l in 1..=b.max_l {
                let s = rules.spec(&b.id, l);
                specs.push(json!({
                    "kind": s.kind, "level": s.level, "cost": s.cost, "buildTime": s.build_time, "power": s.power,
                    "crew": s.crew, "storage": s.storage, "priority": s.priority, "outputFactor": s.output_factor,
                    "footprint": s.footprint,
                }));
            }
        }
        let act = json!({
            "eraK": eco.era_k,
            "values": eco.values,
            "alternatives": eco.alternatives,
            "tables": economy_tables(&eco),
            "specs": specs,
            "buildable": rules.buildable_kinds(),
        });
        ok &= report("economy (values, tables, specs)", &compare(exp, &act, tol), 20);
    }

    // the galaxy register: consistent positions, the farthest star, a few distances
    if let Some(exp) = root.get("stars") {
        let stars = &*game_core::galaxy::STARS;
        let act = json!({
            "stars": stars,
            "maxStarRadius": game_core::galaxy::max_star_radius(),
            "inconsistent": game_core::galaxy::inconsistent_source_stars(0.05).iter().map(|s| s.id).collect::<Vec<_>>(),
            "distances": stars
                .iter()
                .skip(1)
                .take(8)
                .map(|s| json!([stars[0].id, s.id, game_core::galaxy::light_years_between(&stars[0], s)]))
                .collect::<Vec<_>>(),
        });
        ok &= report(&format!("stars ({} stars: positions, distances)", stars.len()), &compare(exp, &act, tol), 10);
    }

    // Atanor engine: measurement, bill of materials, key, building checks, every step, final snapshot
    if let Some(Value::Array(cases)) = root.get("atanor") {
        let mut act = Vec::new();
        let mut ticks = 0;
        for exp in cases {
            let input: AtanorCase = serde_json::from_value(exp.clone()).expect("atanor case");
            let level = atanor::get_level(&input.level_id).expect("known Atanor level");
            let measure = atanor::measure_solution(level, Some(&input.solution), 2000, input.board_radius);
            let options = atanor::CreateOptions {
                solution: Some(input.solution.clone()),
                supply: input.supply.clone(),
                board_radius: input.board_radius,
            };
            let mut engine = atanor::create_simulation(level, options);
            let mut steps = Vec::new();
            for _ in 0..input.ticks {
                let s = engine.step();
                ticks += 1;
                steps.push(json!({
                    "cycle": s.cycle, "tick": s.tick, "commandsExecuted": s.commands_executed, "collisionDetected": s.collision_detected,
                    "collisionMessage": s.collision_message, "jamReason": s.jam_reason, "jamDetail": s.jam_detail, "starved": s.starved,
                    "productsDelivered": s.products_delivered, "isLevelCompleted": s.is_level_completed,
                }));
            }
            let mut stats = serde_json::to_value(engine.stats()).expect("stats");
            if let Value::Object(m) = &mut stats {
                m.entry("crashMessage").or_insert(Value::Null);
            }
            let validate: serde_json::Map<String, Value> = (1..=5u32)
                .map(|l| (l.to_string(), serde_json::to_value(atanor::validate_machine(level, &input.solution, l)).expect("issues")))
                .collect();
            act.push(json!({
                "name": input.name, "levelId": input.level_id, "solution": input.solution, "boardRadius": input.board_radius,
                "supply": input.supply, "ticks": input.ticks,
                "measure": measure, "materials": atanor::machine_materials(&input.solution), "key": atanor::solution_key(&input.solution),
                "validate": validate, "steps": steps, "snapshot": engine.snapshot(), "stats": stats,
            }));
        }
        let name = format!("atanor ({} machines, {ticks} ticks: measure, materials, validate, steps, snapshot)", cases.len());
        ok &= report(&name, &compare(root.get("atanor").unwrap(), &Value::Array(act), tol), 30);
    }

    ok
}
