//! One tick of the machine (`atanor/engine/pipeline.ts`): dispatch (GRAB / DROP), kinematics per
//! molecule (holders must agree, else MOLECULE_CONFLICT), collisions at the end of the motion
//! (ATOM_COLLISION) and inside it (TRAJECTORY_COLLISION, ARM_COLLISION, OFF_BOARD on a bounded
//! board), then glyph reactions: bonders, unbonders, transmuters, outputs, inputs.

use std::collections::HashMap;

use indexmap::IndexMap;

use super::arm::{gripper_count, gripper_positions, gripper_rotations, held_atom_ids, set_held_atom_ids};
use super::engine::{Engine, SupplyState};
use super::hex::{Hex, hex, hex_direction, hex_distance, hex_scale, hex_sub};
use super::molecule::{Atom, MoleculeGraph};
use super::trajectory::{
    Motion, Point, TRAJECTORY_CLEARANCE, TRAJECTORY_SUBSTEPS, distance_squared, hex_to_point, motion_end, motion_point, point_to_hex,
};
use super::types::{ArmCommand, ArmState, Glyph, GlyphType, Jam, JamDetail, JamReason, StepResult, TrackSegment};

const ORIGIN: Hex = hex(0, 0);

/// Change of the arm's own state at the end of the tick.
#[derive(Clone, Copy, Debug)]
enum Apply {
    None,
    /// Add to `rotation` (mod 6).
    Rotate(i32),
    /// Add to `length`.
    Length(i32),
    /// Slide the base along its track.
    Track {
        next_idx: i32,
        new_base: Hex,
    },
}

struct ArmMove {
    apply: Apply,
    /// Motion of each gripper's molecule (gripper order); None = it stays where it is.
    grippers: Vec<Option<Motion>>,
    /// False for PIVOT: the molecules turn, the grippers stay.
    grippers_move: bool,
}

fn no_move(arm: &ArmState) -> ArmMove {
    ArmMove { apply: Apply::None, grippers: vec![None; gripper_count(arm) as usize], grippers_move: false }
}

/// Kinematics of one arm command, computed from the pre-tick state.
fn plan_arm_move(arm: &ArmState, cmd: ArmCommand, tracks: &[TrackSegment]) -> ArmMove {
    match cmd {
        ArmCommand::RotateCw | ArmCommand::RotateCcw => {
            let steps = if cmd == ArmCommand::RotateCw { 1 } else { -1 };
            let motion = Motion::Rotate { center: arm.base_pos, steps };
            ArmMove {
                apply: Apply::Rotate(if steps == 1 { 1 } else { 5 }),
                grippers: vec![Some(motion); gripper_count(arm) as usize],
                grippers_move: true,
            }
        }
        ArmCommand::PivotCw | ArmCommand::PivotCcw => {
            // rotates each held molecule around its gripper; the arm itself does not move
            let steps = if cmd == ArmCommand::PivotCw { 1 } else { -1 };
            ArmMove {
                apply: Apply::None,
                grippers: gripper_positions(arm).into_iter().map(|center| Some(Motion::Rotate { center, steps })).collect(),
                grippers_move: false,
            }
        }
        ArmCommand::Extend | ArmCommand::Retract => {
            let sign = if cmd == ArmCommand::Extend { 1 } else { -1 };
            if !arm.is_piston || (if sign == 1 { arm.length >= 3 } else { arm.length <= 1 }) {
                return no_move(arm);
            }
            // every gripper slides along its own direction
            ArmMove {
                apply: Apply::Length(sign),
                grippers: gripper_rotations(arm)
                    .into_iter()
                    .map(|rot| Some(Motion::Translate { delta: hex_scale(hex_direction(rot), sign) }))
                    .collect(),
                grippers_move: true,
            }
        }
        ArmCommand::TrackPos | ArmCommand::TrackNeg => {
            let Some(track_id) = arm.track() else { return no_move(arm) };
            let Some(track) = tracks.iter().find(|t| t.id == track_id).filter(|t| !t.path.is_empty()) else { return no_move(arm) };
            let next_idx = arm.track_index.unwrap_or(0) + if cmd == ArmCommand::TrackPos { 1 } else { -1 };
            if next_idx < 0 || next_idx as usize >= track.path.len() {
                return no_move(arm);
            }
            let new_base = track.path[next_idx as usize];
            let motion = Motion::Translate { delta: hex_sub(new_base, arm.base_pos) };
            ArmMove {
                apply: Apply::Track { next_idx, new_base },
                grippers: vec![Some(motion); gripper_count(arm) as usize],
                grippers_move: true,
            }
        }
        // GRAB, DROP, EMPTY, REPEAT do not cause kinematic motion
        _ => no_move(arm),
    }
}

fn apply_move(arm: &mut ArmState, apply: Apply) {
    match apply {
        Apply::None => {}
        Apply::Rotate(d) => arm.rotation = (arm.rotation + d) % 6,
        Apply::Length(d) => arm.length += d,
        Apply::Track { next_idx, new_base } => {
            arm.track_index = Some(next_idx);
            arm.base_pos = new_base;
        }
    }
}

fn build_result(e: &Engine, cycle: usize, tick: u64, commands_executed: IndexMap<String, ArmCommand>, jam: Option<Jam>) -> StepResult {
    StepResult {
        cycle,
        tick,
        commands_executed,
        collision_detected: jam.is_some(),
        collision_message: jam.as_ref().map(|j| j.message.clone()),
        jam_reason: jam.as_ref().map(|j| j.reason),
        jam_detail: jam.and_then(|j| j.detail),
        starved: false,
        products_delivered: e.products_delivered,
        is_level_completed: e.products_delivered >= e.level.target_required,
    }
}

fn crash(e: &mut Engine, reason: JamReason, message: String, detail: JamDetail) -> Jam {
    e.has_crashed = true;
    e.crash_message = Some(message.clone());
    e.jam_reason = Some(reason);
    e.jam_detail = Some(detail.clone());
    Jam { reason, message, detail: Some(detail) }
}

fn atom_name(element: &str, id: &str) -> String {
    format!("{element} (#{id})")
}

struct AtomMotion {
    start: Hex,
    motion: Motion,
    end: Hex,
}

struct GripperPath {
    arm_id: String,
    start: Hex,
    /// None when the gripper does not move this tick.
    motion: Option<Motion>,
}

struct Component {
    atoms: Vec<Atom>,
    holders: Vec<(String, Option<Motion>)>,
}

/// Executes timeline slot `cycle` as tick number `tick`.
pub(crate) fn execute_tick(e: &mut Engine, cycle: usize, tick: u64) -> StepResult {
    if e.has_crashed {
        let message = e.crash_message.clone().unwrap_or_else(|| "CRASH / JAM".to_string());
        let detail = e.jam_detail.clone().unwrap_or(JamDetail { atom_ids: vec![], arm_ids: vec![], hex: None, t: 1.0 });
        let jam = Jam { reason: e.jam_reason.unwrap_or(JamReason::AtomCollision), message, detail: Some(detail) };
        return build_result(e, cycle, tick - 1, IndexMap::new(), Some(jam));
    }

    // PHASE 1: DISPATCH. GRAB closes every gripper on the atom under it; DROP opens all grippers.
    let mut executed: IndexMap<String, ArmCommand> = IndexMap::new();
    for i in 0..e.arms.len() {
        let id = e.arms[i].id.clone();
        let cmd = e.instructions.get(&id).and_then(|t| t.get(cycle).copied().flatten()).unwrap_or(ArmCommand::Empty);
        executed.insert(id, cmd);
        match cmd {
            ArmCommand::Grab => {
                let mut held = held_atom_ids(&e.arms[i]);
                for (gi, pos) in gripper_positions(&e.arms[i]).into_iter().enumerate() {
                    if let Some(a) = e.graph.atom_at(pos) {
                        held[gi] = Some(a.id.clone());
                    }
                }
                set_held_atom_ids(&mut e.arms[i], &held);
            }
            ArmCommand::Drop => set_held_atom_ids(&mut e.arms[i], &[]),
            _ => {}
        }
    }

    // PHASE 2: KINEMATICS. Planned from the pre-tick state; a molecule moves at most once per tick
    // and every gripper holding one of its atoms must produce the same end positions.
    let tracks: &[TrackSegment] = e.level.tracks.as_deref().unwrap_or(&[]);
    let moves: Vec<ArmMove> = e.arms.iter().map(|a| plan_arm_move(a, executed[&a.id], tracks)).collect();

    let mut component_of: HashMap<String, usize> = HashMap::new();
    let mut components: Vec<Component> = Vec::new();
    for (ai, arm) in e.arms.iter().enumerate() {
        for (gi, atom_id) in held_atom_ids(arm).into_iter().enumerate() {
            let Some(atom_id) = atom_id else { continue };
            if !e.graph.has_atom(&atom_id) {
                continue;
            }
            let idx = match component_of.get(&atom_id) {
                Some(i) => *i,
                None => {
                    let (atoms, _) = e.graph.connected_component(&atom_id);
                    let idx = components.len();
                    for a in &atoms {
                        component_of.insert(a.id.clone(), idx);
                    }
                    components.push(Component { atoms, holders: Vec::new() });
                    idx
                }
            };
            components[idx].holders.push((arm.id.clone(), moves[ai].grippers.get(gi).copied().flatten()));
        }
    }

    // moving atoms: start hex, motion (from the first moving holder) and end hex
    let mut atom_motions: IndexMap<String, AtomMotion> = IndexMap::new();
    let mut conflict: Option<(Vec<String>, Vec<Atom>)> = None;
    for comp in &components {
        let Some(motion) = comp.holders.iter().find_map(|(_, m)| *m) else { continue };
        let outcomes: Vec<Vec<Hex>> =
            comp.holders.iter().map(|(_, m)| comp.atoms.iter().map(|a| motion_end(m.as_ref(), a.pos)).collect()).collect();
        let first = &outcomes[0];
        if !outcomes.iter().all(|o| o == first) {
            if conflict.is_none() {
                let mut ids: Vec<String> = Vec::new();
                for (id, _) in &comp.holders {
                    if !ids.contains(id) {
                        ids.push(id.clone());
                    }
                }
                conflict = Some((ids, comp.atoms.clone()));
            }
            continue; // a conflicting molecule stays where it was
        }
        for (i, a) in comp.atoms.iter().enumerate() {
            atom_motions.insert(a.id.clone(), AtomMotion { start: a.pos, motion, end: first[i] });
        }
    }

    // gripper paths (pre-tick positions; PIVOT turns the molecules, not the grippers)
    let mut gripper_paths: Vec<GripperPath> = Vec::new();
    for (ai, arm) in e.arms.iter().enumerate() {
        for (gi, start) in gripper_positions(arm).into_iter().enumerate() {
            let motion = if moves[ai].grippers_move { moves[ai].grippers.get(gi).copied().flatten() } else { None };
            gripper_paths.push(GripperPath { arm_id: arm.id.clone(), start, motion });
        }
    }

    for (ai, mv) in moves.iter().enumerate() {
        apply_move(&mut e.arms[ai], mv.apply);
    }
    for (id, m) in &atom_motions {
        e.graph.move_atom(id, m.end);
    }
    // atoms reach these hexes even if an output consumes them later in this tick
    for a in e.graph.atoms() {
        e.visited.insert(a.pos.key());
    }

    if let Some((arm_ids, atoms)) = conflict {
        let names: Vec<String> = atoms.iter().map(|a| atom_name(&a.element, &a.id)).collect();
        let jam = crash(
            e,
            JamReason::MoleculeConflict,
            format!(
                "CRASH / JAM: arms {} hold the same molecule [{}] and move it in different ways!",
                arm_ids.join(", "),
                names.join(", ")
            ),
            JamDetail { atom_ids: atoms.iter().map(|a| a.id.clone()).collect(), arm_ids, hex: None, t: 0.0 },
        );
        return build_result(e, cycle, tick, executed, Some(jam));
    }

    // PHASE 3a: two atoms on one hex at the end of the motion (PoC rule; checked first)
    if let Some((key, colliding)) = e.graph.collisions().into_iter().next() {
        let names: Vec<String> = colliding.iter().map(|a| atom_name(&a.element, &a.id)).collect();
        let jam = crash(
            e,
            JamReason::AtomCollision,
            format!("CRASH / JAM at hex [{key}]: Atoms {} collided!", names.join(" and ")),
            JamDetail { atom_ids: colliding.iter().map(|a| a.id.clone()).collect(), arm_ids: vec![], hex: Some(colliding[0].pos), t: 1.0 },
        );
        return build_result(e, cycle, tick, executed, Some(jam));
    }

    // PHASE 3b: inside the tick (sampled sub-steps)
    if let Some(jam) = sweep_tick(e, &atom_motions, &gripper_paths) {
        return build_result(e, cycle, tick, executed, Some(jam));
    }

    // PHASE 4a: bonder, unbonder and transmute glyphs, in glyph order
    let glyphs = &e.level.glyphs;
    for glyph in glyphs {
        match glyph.kind {
            GlyphType::Bonder | GlyphType::Unbonder => {
                let Some(pos2) = glyph.pos2 else { continue };
                let a1 = e.graph.atom_at(glyph.pos).map(|a| a.id.clone());
                let a2 = e.graph.atom_at(pos2).map(|a| a.id.clone());
                if let (Some(a1), Some(a2)) = (a1, a2) {
                    if glyph.kind == GlyphType::Bonder {
                        e.graph.add_bond(&a1, &a2, 1);
                    } else {
                        e.graph.remove_bond_between(&a1, &a2);
                    }
                }
            }
            GlyphType::Transmute => {
                let hit = e.graph.atom_at(glyph.pos).filter(|a| Some(&a.element) == glyph.from_element.as_ref()).map(|a| a.id.clone());
                if let (Some(id), Some(to)) = (hit, glyph.to_element.as_deref()) {
                    e.graph.transmute_atom(&id, to);
                }
            }
            GlyphType::Input | GlyphType::Output => {}
        }
    }

    // PHASE 4b: output product glyphs (sinks)
    for glyph in glyphs {
        if glyph.kind != GlyphType::Output {
            continue;
        }
        let Some(target) = &glyph.target_pattern else { continue };
        let Some(root) = e.graph.atom_at(glyph.pos).map(|a| a.id.clone()) else { continue };
        let (atoms, bonds) = e.graph.connected_component(&root);
        if !e.graph.matches_target(&atoms, &bonds, &target.elements, &target.relative_hex_offsets, &target.bonds) {
            continue;
        }
        // release every gripper holding an atom of this consumed molecule
        let consumed: Vec<&str> = atoms.iter().map(|a| a.id.as_str()).collect();
        for arm in e.arms.iter_mut() {
            let held = held_atom_ids(arm);
            if held.iter().any(|id| id.as_deref().is_some_and(|id| consumed.contains(&id))) {
                let kept: Vec<Option<String>> = held.into_iter().map(|id| id.filter(|id| !consumed.contains(&id.as_str()))).collect();
                set_held_atom_ids(arm, &kept);
            }
        }
        for a in &atoms {
            e.graph.remove_atom(&a.id);
        }
        e.products_delivered += 1;
        if let Some(p) = &glyph.product {
            *e.produced.entry(p.material.clone()).or_insert(0.0) += p.quantity;
        }
    }

    // PHASE 4c: input reagent glyphs (generators): a vacant input hex gets a fresh atom
    for glyph in glyphs {
        if glyph.kind == GlyphType::Input {
            spawn_at_input(&mut e.graph, &mut e.atom_counter, &mut e.supply, glyph);
        }
    }

    build_result(e, cycle, tick, executed, None)
}

/// Samples the tick's motion at TRAJECTORY_SUBSTEPS sub-steps (k = 1..N). At each sub-step, in this
/// order: moving atoms and grippers must stay on the board; two atoms (at least one moving) must keep
/// the clearance (k < N; the end is phase 3a); two grippers of different arms (at least one moving)
/// must keep it too, unless they already overlapped before the tick. Empty grippers pass over atoms,
/// arm bodies are not checked. Sampled positions of moving atoms and grippers feed the area.
fn sweep_tick(e: &mut Engine, atom_motions: &IndexMap<String, AtomMotion>, grippers: &[GripperPath]) -> Option<Jam> {
    let n = TRAJECTORY_SUBSTEPS;
    let clearance2 = TRAJECTORY_CLEARANCE * TRAJECTORY_CLEARANCE;
    struct Moving {
        id: String,
        element: String,
        start: Hex,
        motion: Motion,
    }
    let moving: Vec<Moving> = atom_motions
        .iter()
        .map(|(id, m)| {
            let element = e.graph.atom(id).map(|a| a.element.clone()).unwrap_or_default();
            Moving { id: id.clone(), element, start: m.start, motion: m.motion }
        })
        .collect();
    let moving_grippers: Vec<usize> = grippers.iter().enumerate().filter(|(_, g)| g.motion.is_some()).map(|(i, _)| i).collect();
    if moving.is_empty() && moving_grippers.is_empty() {
        return None;
    }
    let resting: Vec<(Atom, Point)> =
        e.graph.atoms().filter(|a| !atom_motions.contains_key(&a.id)).map(|a| (a.clone(), hex_to_point(a.pos))).collect();

    let mut pairs: Vec<(usize, usize)> = Vec::new();
    for i in 0..grippers.len() {
        for j in (i + 1)..grippers.len() {
            let (a, b) = (&grippers[i], &grippers[j]);
            if a.arm_id == b.arm_id || (a.motion.is_none() && b.motion.is_none()) {
                continue;
            }
            if distance_squared(hex_to_point(a.start), hex_to_point(b.start)) < clearance2 {
                continue;
            }
            pairs.push((i, j));
        }
    }
    let radius = e.board_radius;

    for k in 1..=n {
        let atom_points: Vec<Point> = moving.iter().map(|m| motion_point(Some(&m.motion), m.start, k)).collect();
        let gripper_points: Vec<Point> = grippers.iter().map(|g| motion_point(g.motion.as_ref(), g.start, k)).collect();
        let t = k as f64 / n as f64;

        if k < n {
            for p in &atom_points {
                e.visited.insert(point_to_hex(*p).key());
            }
            for &gi in &moving_grippers {
                e.visited.insert(point_to_hex(gripper_points[gi]).key());
            }
        }

        if let Some(radius) = radius {
            for (i, m) in moving.iter().enumerate() {
                let h = point_to_hex(atom_points[i]);
                if hex_distance(h, ORIGIN) > radius {
                    return Some(crash(
                        e,
                        JamReason::OffBoard,
                        format!(
                            "CRASH / JAM: atom {} left the board at hex [{}] (radius {radius})!",
                            atom_name(&m.element, &m.id),
                            h.key()
                        ),
                        JamDetail { atom_ids: vec![m.id.clone()], arm_ids: vec![], hex: Some(h), t },
                    ));
                }
            }
            for &gi in &moving_grippers {
                let h = point_to_hex(gripper_points[gi]);
                if hex_distance(h, ORIGIN) > radius {
                    let arm_id = grippers[gi].arm_id.clone();
                    return Some(crash(
                        e,
                        JamReason::OffBoard,
                        format!("CRASH / JAM: gripper of arm {arm_id} left the board at hex [{}] (radius {radius})!", h.key()),
                        JamDetail { atom_ids: vec![], arm_ids: vec![arm_id], hex: Some(h), t },
                    ));
                }
            }
        }

        if k < n {
            for i in 0..moving.len() {
                let p = atom_points[i];
                let others = moving[(i + 1)..]
                    .iter()
                    .enumerate()
                    .map(|(j, m)| (m.id.as_str(), m.element.as_str(), atom_points[i + 1 + j]))
                    .chain(resting.iter().map(|(a, pt)| (a.id.as_str(), a.element.as_str(), *pt)));
                for (other_id, other_element, other_point) in others {
                    if distance_squared(p, other_point) < clearance2 {
                        let h = point_to_hex(p);
                        let (id, element) = (moving[i].id.clone(), moving[i].element.clone());
                        let (other_id, other_element) = (other_id.to_string(), other_element.to_string());
                        return Some(crash(
                            e,
                            JamReason::TrajectoryCollision,
                            format!(
                                "CRASH / JAM near hex [{}]: Atoms {} and {} collided while moving!",
                                h.key(),
                                atom_name(&element, &id),
                                atom_name(&other_element, &other_id)
                            ),
                            JamDetail { atom_ids: vec![id, other_id], arm_ids: vec![], hex: Some(h), t },
                        ));
                    }
                }
            }
        }

        for &(a, b) in &pairs {
            let pa = gripper_points[a];
            if distance_squared(pa, gripper_points[b]) < clearance2 {
                let h = point_to_hex(pa);
                let (arm_a, arm_b) = (grippers[a].arm_id.clone(), grippers[b].arm_id.clone());
                return Some(crash(
                    e,
                    JamReason::ArmCollision,
                    format!("CRASH / JAM near hex [{}]: grippers of arms {arm_a} and {arm_b} collided!", h.key()),
                    JamDetail { atom_ids: vec![], arm_ids: vec![arm_a, arm_b], hex: Some(h), t },
                ));
            }
        }
    }
    None
}

/// Dispenses an atom on a vacant input hex. Returns true when the hex is occupied afterwards (it
/// already was, or an atom was dispensed).
pub(crate) fn spawn_at_input(graph: &mut MoleculeGraph, atom_counter: &mut u64, supply: &mut SupplyState, glyph: &Glyph) -> bool {
    if graph.atom_at(glyph.pos).is_some() {
        return true;
    }
    if !supply.take(glyph) {
        return false;
    }
    *atom_counter += 1;
    graph.add_atom(Atom { id: format!("atom_{atom_counter}"), element: glyph.element.clone().unwrap_or_default(), pos: glyph.pos });
    true
}
