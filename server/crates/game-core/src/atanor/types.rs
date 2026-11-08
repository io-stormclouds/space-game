//! Data of the Atanor engine (`atanor/engine/types.ts`): arm commands and state, glyphs, tracks,
//! levels, solutions, jams, step results and snapshots. Serialised to the same JSON as TypeScript;
//! optional fields are absent when the source leaves them `undefined`.

use indexmap::IndexMap;
use serde::{Deserialize, Serialize};

use super::hex::Hex;
use super::molecule::{Atom, Bond};
use crate::models::resource::Qty;
use crate::models::serde_util::double_option;

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq, Hash)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ArmCommand {
    Grab,
    Drop,
    RotateCw,
    RotateCcw,
    PivotCw,
    PivotCcw,
    Extend,
    Retract,
    TrackPos,
    TrackNeg,
    Repeat,
    Empty,
}

impl ArmCommand {
    pub fn as_str(&self) -> &'static str {
        match self {
            ArmCommand::Grab => "GRAB",
            ArmCommand::Drop => "DROP",
            ArmCommand::RotateCw => "ROTATE_CW",
            ArmCommand::RotateCcw => "ROTATE_CCW",
            ArmCommand::PivotCw => "PIVOT_CW",
            ArmCommand::PivotCcw => "PIVOT_CCW",
            ArmCommand::Extend => "EXTEND",
            ArmCommand::Retract => "RETRACT",
            ArmCommand::TrackPos => "TRACK_POS",
            ArmCommand::TrackNeg => "TRACK_NEG",
            ArmCommand::Repeat => "REPEAT",
            ArmCommand::Empty => "EMPTY",
        }
    }

    pub fn parse(s: &str) -> Option<ArmCommand> {
        Some(match s {
            "GRAB" => ArmCommand::Grab,
            "DROP" => ArmCommand::Drop,
            "ROTATE_CW" => ArmCommand::RotateCw,
            "ROTATE_CCW" => ArmCommand::RotateCcw,
            "PIVOT_CW" => ArmCommand::PivotCw,
            "PIVOT_CCW" => ArmCommand::PivotCcw,
            "EXTEND" => ArmCommand::Extend,
            "RETRACT" => ArmCommand::Retract,
            "TRACK_POS" => ArmCommand::TrackPos,
            "TRACK_NEG" => ArmCommand::TrackNeg,
            "REPEAT" => ArmCommand::Repeat,
            "EMPTY" => ArmCommand::Empty,
            _ => return None,
        })
    }
}

/// One arm's program: a command per timeline slot, `None` = empty slot (acts as EMPTY).
pub type Tape = Vec<Option<ArmCommand>>;
/// armId → tape.
pub type Program = IndexMap<String, Tape>;

/// Builds a tape from command names (level data); unknown names become empty slots.
pub fn tape(cmds: &[&str]) -> Tape {
    cmds.iter().map(|c| ArmCommand::parse(c)).collect()
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ArmState {
    pub id: String,
    pub base_pos: Hex,
    /// 0..5, index into `HEX_DIRECTIONS`; direction of the main gripper (index 0).
    pub rotation: i32,
    /// 1, 2, 3
    pub length: i32,
    pub is_piston: bool,
    /// True when at least one gripper holds an atom.
    pub is_holding: bool,
    /// Atom held by the main gripper; on a multi-gripper arm the first held atom in gripper order.
    #[serde(default)]
    pub held_atom_id: Option<String>,
    /// Track the base may slide along (`trackId?: string | null`).
    #[serde(default, skip_serializing_if = "Option::is_none", with = "double_option")]
    pub track_id: Option<Option<String>>,
    /// Current index on the track path.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub track_index: Option<i32>,
    /// Multi-gripper arm (L4, §8.1): 2, 3 or 6 grippers spaced evenly. Missing = 1 gripper.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub grippers: Option<i32>,
    /// Atom held by each gripper (index 0 = main), null = empty. Only on arms with more than one gripper.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub held_atom_ids: Option<Vec<Option<String>>>,
}

impl ArmState {
    /// The track id when the arm rides one (`arm.trackId` truthy in the source).
    pub fn track(&self) -> Option<&str> {
        self.track_id.as_ref().and_then(|t| t.as_deref()).filter(|t| !t.is_empty())
    }
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq, Hash)]
#[serde(rename_all = "UPPERCASE")]
pub enum GlyphType {
    Bonder,
    Unbonder,
    Input,
    Output,
    Transmute,
}

impl GlyphType {
    pub fn as_str(&self) -> &'static str {
        match self {
            GlyphType::Bonder => "BONDER",
            GlyphType::Unbonder => "UNBONDER",
            GlyphType::Input => "INPUT",
            GlyphType::Output => "OUTPUT",
            GlyphType::Transmute => "TRANSMUTE",
        }
    }
}

/// What one delivered molecule is worth in the economy (e.g. 1 NAD).
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct OutputProduct {
    pub material: String,
    pub quantity: f64,
}

/// The molecule an output accepts: elements, their relative hexes and bonds between indices.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct TargetPattern {
    pub name: String,
    pub elements: Vec<String>,
    pub relative_hex_offsets: Vec<Hex>,
    pub bonds: Vec<[usize; 2]>,
}

/// One glyph of any type (the source is a discriminated union; one struct keeps the key order
/// `id, type, pos, …` of the constructors). Fields of other types are absent.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Glyph {
    pub id: String,
    #[serde(rename = "type")]
    pub kind: GlyphType,
    pub pos: Hex,
    /// BONDER / UNBONDER: the adjacent hex the bond is formed between.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub pos2: Option<Hex>,
    /// INPUT: element dispensed.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub element: Option<String>,
    /// INPUT: material units per dispensed atom (default 1).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub portion: Option<f64>,
    /// OUTPUT: accepted molecule.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub target_pattern: Option<TargetPattern>,
    /// OUTPUT: economy product per delivered molecule (recipe levels only).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub product: Option<OutputProduct>,
    /// TRANSMUTE: element converted …
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub from_element: Option<String>,
    /// … into this one.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub to_element: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct TrackSegment {
    pub id: String,
    /// Sequence of connected hexes.
    pub path: Vec<Hex>,
}

/// `poc` = alchemical teaching levels; `recipe` = economy recipe of the Fabryka atanorowa.
#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum LevelKind {
    Poc,
    Recipe,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct DocReference {
    pub cycles: f64,
    pub area: f64,
    pub arms: f64,
}

/// Economy metadata of a recipe level.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RecipeInfo {
    pub recipe_id: String,
    pub building_level: u32,
    pub inputs: Qty,
    pub outputs: Qty,
    pub doc_reference: DocReference,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct LevelConfig {
    pub id: String,
    pub name: String,
    pub description: String,
    pub target_required: u64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub kind: Option<LevelKind>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub recipe: Option<RecipeInfo>,
    pub glyphs: Vec<Glyph>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tracks: Option<Vec<TrackSegment>>,
    pub initial_arms: Vec<ArmState>,
    pub default_instructions: Program,
    /// Board = hexes within this distance of (0,0); missing = unlimited (PoC).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub board_radius: Option<i32>,
}

/// Why the simulation stopped with a JAM.
#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum JamReason {
    AtomCollision,
    MoleculeConflict,
    TrajectoryCollision,
    ArmCollision,
    OffBoard,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct JamDetail {
    pub atom_ids: Vec<String>,
    pub arm_ids: Vec<String>,
    /// Hex of the event; null for MOLECULE_CONFLICT.
    pub hex: Option<Hex>,
    /// Fraction of the tick's motion (0..1) at which it happened.
    pub t: f64,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct Jam {
    pub reason: JamReason,
    pub message: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub detail: Option<JamDetail>,
}

/// What `step()` reports (`SimulationStepResult` without the atom/bond/arm copies, which the
/// snapshot provides).
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct StepResult {
    /// Timeline slot executed (wraps on REPEAT).
    pub cycle: usize,
    /// Ticks executed since reset, this one included.
    pub tick: u64,
    pub commands_executed: IndexMap<String, ArmCommand>,
    pub collision_detected: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub collision_message: Option<String>,
    pub jam_reason: Option<JamReason>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub jam_detail: Option<JamDetail>,
    /// True when the step did not run because an input port was empty (finite supply).
    pub starved: bool,
    pub products_delivered: u64,
    pub is_level_completed: bool,
}

/// What the player builds: arms, own glyphs, tracks and the program. Ports come from the level.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Default)]
pub struct Solution {
    pub arms: Vec<ArmState>,
    pub glyphs: Vec<Glyph>,
    pub tracks: Vec<TrackSegment>,
    pub program: Program,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct MoleculeView {
    pub atom_ids: Vec<String>,
    pub bond_ids: Vec<String>,
}

/// Read-only view of a running simulation (`AtanorSnapshot`).
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    pub level_id: String,
    pub ticks: u64,
    pub timeline_position: usize,
    pub atoms: Vec<Atom>,
    pub bonds: Vec<Bond>,
    pub molecules: Vec<MoleculeView>,
    pub arms: Vec<ArmState>,
    pub delivered: u64,
    pub target: u64,
    pub completed: bool,
    pub completed_at_tick: Option<u64>,
    pub jam: Option<Jam>,
    pub starved: bool,
    pub starved_steps: u64,
    pub supply: Option<Qty>,
    pub consumed: Qty,
    pub produced: Qty,
}
