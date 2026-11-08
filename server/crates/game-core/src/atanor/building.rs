//! Fabryka atanorowa: what each building level allows (doc §8.1), machine validation (§8.5 p. 5)
//! and the machine's bill of materials (§8.2). (`atanor/engine/building.ts`)

use serde::{Deserialize, Serialize};

use super::arm::{GRIPPER_COUNTS, gripper_count, gripper_positions};
use super::glyph::{glyph_cells, is_port_glyph};
use super::hex::{Hex, hex, hex_distance};
use super::types::{GlyphType, LevelConfig, Solution};
use crate::models::resource::Qty;

#[derive(Clone, Debug, PartialEq)]
pub struct BuildingLevel {
    pub level: u32,
    /// Board = hexes within this distance of (0,0).
    pub board_radius: i32,
    pub board_hexes: u32,
    pub max_arms: usize,
    pub max_arm_length: i32,
    pub pistons: bool,
    pub glyphs: &'static [GlyphType],
    pub tracks: bool,
    /// L4+: multi-gripper arms.
    pub multi_arms: bool,
    /// L5: second board with its own program (not implemented by the engine yet).
    pub boards: u32,
}

const L1_GLYPHS: &[GlyphType] = &[GlyphType::Bonder, GlyphType::Unbonder];
const L2_GLYPHS: &[GlyphType] = &[GlyphType::Bonder, GlyphType::Unbonder, GlyphType::Transmute];

/// §8.1 table "Poziomy budynku = możliwości maszyny".
pub const ATANOR_BUILDING_LEVELS: [BuildingLevel; 5] = [
    BuildingLevel {
        level: 1,
        board_radius: 2,
        board_hexes: 19,
        max_arms: 3,
        max_arm_length: 2,
        pistons: true,
        glyphs: L1_GLYPHS,
        tracks: false,
        multi_arms: false,
        boards: 1,
    },
    BuildingLevel {
        level: 2,
        board_radius: 3,
        board_hexes: 37,
        max_arms: 4,
        max_arm_length: 2,
        pistons: true,
        glyphs: L2_GLYPHS,
        tracks: false,
        multi_arms: false,
        boards: 1,
    },
    BuildingLevel {
        level: 3,
        board_radius: 4,
        board_hexes: 61,
        max_arms: 6,
        max_arm_length: 3,
        pistons: true,
        glyphs: L2_GLYPHS,
        tracks: true,
        multi_arms: false,
        boards: 1,
    },
    BuildingLevel {
        level: 4,
        board_radius: 5,
        board_hexes: 91,
        max_arms: 8,
        max_arm_length: 3,
        pistons: true,
        glyphs: L2_GLYPHS,
        tracks: true,
        multi_arms: true,
        boards: 1,
    },
    BuildingLevel {
        level: 5,
        board_radius: 6,
        board_hexes: 127,
        max_arms: 10,
        max_arm_length: 3,
        pistons: true,
        glyphs: L2_GLYPHS,
        tracks: true,
        multi_arms: true,
        boards: 2,
    },
];

pub fn building_level(level: u32) -> Option<&'static BuildingLevel> {
    ATANOR_BUILDING_LEVELS.iter().find(|l| l.level == level)
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum MachineIssueCode {
    UnknownBuildingLevel,
    RecipeLocked,
    TooManyArms,
    ArmTooLong,
    PistonLocked,
    GlyphLocked,
    TracksLocked,
    OffBoard,
    /// An arm with more than one gripper below the level with `multi_arms` (L4).
    MultiGripperLocked,
    /// `grippers` is not 1, 2, 3 or 6.
    GripperCountInvalid,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct MachineIssue {
    pub code: MachineIssueCode,
    pub message: String,
    /// Arm, glyph or track id the issue refers to.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub element_id: Option<String>,
}

const ORIGIN: Hex = hex(0, 0);

fn issue(code: MachineIssueCode, message: String, element_id: Option<&str>) -> MachineIssue {
    MachineIssue { code, message, element_id: element_id.map(str::to_string) }
}

/// Checks a machine (level ports + player solution) against the limits of a building level.
/// Static placement only: arm bases, grippers at the start, glyphs and tracks must be on the board;
/// what leaves the board while moving jams in the engine (OFF_BOARD with a board radius).
pub fn validate_machine(level: &LevelConfig, solution: &Solution, building_level_no: u32) -> Vec<MachineIssue> {
    let Some(limits) = building_level(building_level_no) else {
        return vec![issue(MachineIssueCode::UnknownBuildingLevel, format!("Unknown Fabryka atanorowa level {building_level_no}"), None)];
    };
    let mut issues = Vec::new();
    let off_board = |pos: Hex| hex_distance(pos, ORIGIN) > limits.board_radius;

    if let Some(r) = &level.recipe
        && r.building_level > building_level_no
    {
        issues.push(issue(
            MachineIssueCode::RecipeLocked,
            format!("Recipe {} needs building level {}", r.recipe_id, r.building_level),
            None,
        ));
    }
    if solution.arms.len() > limits.max_arms {
        issues.push(issue(MachineIssueCode::TooManyArms, format!("{} arms, max {}", solution.arms.len(), limits.max_arms), None));
    }
    for arm in &solution.arms {
        if arm.length > limits.max_arm_length {
            issues.push(issue(
                MachineIssueCode::ArmTooLong,
                format!("Arm length {}, max {}", arm.length, limits.max_arm_length),
                Some(&arm.id),
            ));
        }
        if arm.is_piston && !limits.pistons {
            issues.push(issue(MachineIssueCode::PistonLocked, "Pistons are not available".into(), Some(&arm.id)));
        }
        if arm.track().is_some() && !limits.tracks {
            issues.push(issue(MachineIssueCode::TracksLocked, "Tracks are not available".into(), Some(&arm.id)));
        }
        if let Some(g) = arm.grippers.filter(|g| !GRIPPER_COUNTS.contains(g)) {
            issues.push(issue(MachineIssueCode::GripperCountInvalid, format!("{g} grippers; allowed 1, 2, 3, 6"), Some(&arm.id)));
        } else if gripper_count(arm) > 1 && !limits.multi_arms {
            issues.push(issue(MachineIssueCode::MultiGripperLocked, "Multi-gripper arms are not available".into(), Some(&arm.id)));
        }
        if off_board(arm.base_pos) {
            issues.push(issue(MachineIssueCode::OffBoard, format!("Arm base {} is off the board", arm.base_pos.key()), Some(&arm.id)));
        } else if let Some(g) = gripper_positions(arm).into_iter().find(|p| off_board(*p)) {
            issues.push(issue(MachineIssueCode::OffBoard, format!("Gripper {} is off the board", g.key()), Some(&arm.id)));
        }
    }
    for glyph in level.glyphs.iter().filter(|g| is_port_glyph(g)).chain(solution.glyphs.iter()) {
        if !is_port_glyph(glyph) && !limits.glyphs.contains(&glyph.kind) {
            issues.push(issue(MachineIssueCode::GlyphLocked, format!("{} is not available", glyph.kind.as_str()), Some(&glyph.id)));
        }
        if let Some(outside) = glyph_cells(glyph).into_iter().find(|c| off_board(*c)) {
            issues.push(issue(MachineIssueCode::OffBoard, format!("Glyph cell {} is off the board", outside.key()), Some(&glyph.id)));
        }
    }
    for track in &solution.tracks {
        if !limits.tracks {
            issues.push(issue(MachineIssueCode::TracksLocked, "Tracks are not available".into(), Some(&track.id)));
        }
        if let Some(outside) = track.path.iter().find(|c| off_board(**c)) {
            issues.push(issue(MachineIssueCode::OffBoard, format!("Track cell {} is off the board", outside.key()), Some(&track.id)));
        }
    }
    issues
}

fn add(bill: &mut Qty, material: &str, units: f64) {
    let cur = bill.get(material).copied().unwrap_or(0.0);
    bill.insert(material.to_string(), cur + units);
}

/// Materials of each gripper beyond the first (AT5 proposal, not in §8.2; = 10 PoC points).
pub const EXTRA_GRIPPER_MATERIALS: [(&str, f64); 1] = [("STA", 2.0)];

/// Materials needed to build the machine (§8.2): arm L1 = 4 STA + 1 SLN; length 2 +2 STA; length 3
/// +4 STA + 1 STP; piston +1 SLN; bonder / unbonder 2 PRZ + 1 UKL; transmutation 1 NAD + 1 UKL;
/// track 1 STA per hex; each extra gripper +2 STA. Ports are free.
pub fn machine_materials(solution: &Solution) -> Qty {
    let mut bill = Qty::new();
    for arm in &solution.arms {
        add(&mut bill, "STA", 4.0);
        add(&mut bill, "SLN", 1.0);
        if arm.length == 2 {
            add(&mut bill, "STA", 2.0);
        }
        if arm.length == 3 {
            add(&mut bill, "STA", 4.0);
            add(&mut bill, "STP", 1.0);
        }
        if arm.is_piston {
            add(&mut bill, "SLN", 1.0);
        }
        for _ in 1..gripper_count(arm) {
            for (material, units) in EXTRA_GRIPPER_MATERIALS {
                add(&mut bill, material, units);
            }
        }
    }
    for glyph in &solution.glyphs {
        match glyph.kind {
            GlyphType::Bonder | GlyphType::Unbonder => {
                add(&mut bill, "PRZ", 2.0);
                add(&mut bill, "UKL", 1.0);
            }
            GlyphType::Transmute => {
                add(&mut bill, "NAD", 1.0);
                add(&mut bill, "UKL", 1.0);
            }
            GlyphType::Input | GlyphType::Output => {}
        }
    }
    let mut track_hexes: Vec<String> = Vec::new();
    for t in &solution.tracks {
        for p in &t.path {
            let k = p.key();
            if !track_hexes.contains(&k) {
                track_hexes.push(k);
            }
        }
    }
    if !track_hexes.is_empty() {
        add(&mut bill, "STA", track_hexes.len() as f64);
    }
    bill
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::atanor::api::reference_solution;
    use crate::atanor::recipes::{LEVEL_A_NAD, LEVEL_A_PRO};
    use crate::models::resource::qty;

    #[test]
    fn reference_machines_fit_their_levels() {
        let nad = reference_solution(&LEVEL_A_NAD);
        assert!(validate_machine(&LEVEL_A_NAD, &nad, 1).is_empty());
        assert_eq!(machine_materials(&nad), qty([("STA", 8.0), ("SLN", 2.0), ("PRZ", 6.0), ("UKL", 3.0)]));
        let pro = reference_solution(&LEVEL_A_PRO);
        let at_l1 = validate_machine(&LEVEL_A_PRO, &pro, 1);
        assert_eq!(at_l1[0].code, MachineIssueCode::RecipeLocked);
        assert!(validate_machine(&LEVEL_A_PRO, &pro, 4).is_empty());
        assert_eq!(validate_machine(&LEVEL_A_PRO, &pro, 9)[0].code, MachineIssueCode::UnknownBuildingLevel);
    }
}
