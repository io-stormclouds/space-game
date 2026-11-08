//! Arms and grippers (`atanor/engine/arm.ts`), with the AT5 multi-gripper arms of the Fabryka
//! atanorowa L4: 2, 3 or 6 grippers spaced evenly on the 6 hex directions.

use super::hex::{Hex, hex_add, hex_direction, hex_scale};
use super::types::ArmState;

/// Allowed gripper counts.
pub const GRIPPER_COUNTS: [i32; 4] = [1, 2, 3, 6];

/// PoC cost points of each gripper beyond the first.
pub const EXTRA_GRIPPER_COST: u64 = 10;

/// Number of grippers (1 when `grippers` is missing or not one of 1, 2, 3, 6).
pub fn gripper_count(arm: &ArmState) -> i32 {
    let n = arm.grippers.unwrap_or(1);
    if GRIPPER_COUNTS.contains(&n) { n } else { 1 }
}

/// Direction index (0..5) of each gripper; index 0 is the main gripper at `rotation`.
pub fn gripper_rotations(arm: &ArmState) -> Vec<i32> {
    let n = gripper_count(arm);
    let spacing = 6 / n;
    (0..n).map(|i| (((arm.rotation + i * spacing) % 6) + 6) % 6).collect()
}

/// Position of the main gripper (index 0).
pub fn gripper_position(arm: &ArmState) -> Hex {
    hex_add(arm.base_pos, hex_scale(hex_direction(arm.rotation), arm.length))
}

/// Positions of all grippers, in gripper order.
pub fn gripper_positions(arm: &ArmState) -> Vec<Hex> {
    gripper_rotations(arm).into_iter().map(|rot| hex_add(arm.base_pos, hex_scale(hex_direction(rot), arm.length))).collect()
}

/// Atom held by each gripper (None = empty), in gripper order.
pub fn held_atom_ids(arm: &ArmState) -> Vec<Option<String>> {
    let n = gripper_count(arm) as usize;
    if n == 1 {
        return vec![if arm.is_holding { arm.held_atom_id.clone() } else { None }];
    }
    let ids = arm.held_atom_ids.as_deref().unwrap_or(&[]);
    (0..n).map(|i| ids.get(i).cloned().flatten()).collect()
}

/// Sets the atoms held by each gripper and keeps `is_holding` / `held_atom_id` consistent.
pub fn set_held_atom_ids(arm: &mut ArmState, ids: &[Option<String>]) {
    let n = gripper_count(arm) as usize;
    let held: Vec<Option<String>> = (0..n).map(|i| ids.get(i).cloned().flatten()).collect();
    let first = held.iter().find(|id| id.is_some()).cloned().flatten();
    arm.is_holding = first.is_some();
    arm.held_atom_id = first;
    if n > 1 {
        arm.held_atom_ids = Some(held);
    }
}

/// `createArm`: a new arm with empty grippers. `grippers` must be 1, 2, 3 or 6.
pub fn create_arm(id: &str, base_pos: Hex, rotation: i32, length: i32, is_piston: bool, grippers: i32) -> ArmState {
    assert!(GRIPPER_COUNTS.contains(&grippers), "Arm grippers must be one of 1, 2, 3, 6: {grippers}");
    ArmState {
        id: id.to_string(),
        base_pos,
        rotation: rotation.rem_euclid(6),
        length,
        is_piston,
        is_holding: false,
        held_atom_id: None,
        track_id: None,
        track_index: None,
        grippers: if grippers > 1 { Some(grippers) } else { None },
        held_atom_ids: if grippers > 1 { Some(vec![None; grippers as usize]) } else { None },
    }
}

/// A standard arm: length 1, no piston, one gripper (the common case of the level data).
pub fn arm(id: &str, base_pos: Hex, rotation: i32, length: i32) -> ArmState {
    create_arm(id, base_pos, rotation, length, false, 1)
}

/// PoC cost points of an arm: 20, +10 for length 2, +20 for length 3, +10 piston, +10 per extra gripper.
pub fn arm_cost(arm: &ArmState) -> u64 {
    let mut cost = 20;
    if arm.length == 2 {
        cost += 10;
    }
    if arm.length == 3 {
        cost += 20;
    }
    if arm.is_piston {
        cost += 10;
    }
    cost + (gripper_count(arm) as u64 - 1) * EXTRA_GRIPPER_COST
}
