//! The 4 alchemical teaching levels of the PoC (`atanor/engine/levels.ts`, kind `poc`).

use std::sync::LazyLock;

use super::arm::arm;
use super::glyph::{bonder_glyph, input_glyph, output_glyph, pattern, transmute_glyph};
use super::hex::hex;
use super::types::{ArmState, LevelConfig, LevelKind, Program, TrackSegment, tape};

/// armId → tape, from command names.
pub fn program(entries: &[(&str, &[&str])]) -> Program {
    entries.iter().map(|(id, cmds)| (id.to_string(), tape(cmds))).collect()
}

pub static LEVEL_1_DIMER: LazyLock<LevelConfig> = LazyLock::new(|| {
    LevelConfig {
    id: "level-1-dimer".into(),
    kind: Some(LevelKind::Poc),
    name: "Lekcja 1: Synteza Dimeru Alchemicznego (A-B)".into(),
    description: "Podstawowy poziom szkoleniowy. Skonfiguruj ramiona tak, aby pobrać atom Cynobru (A) oraz Rtęci (B), połączyć je na glifie wiązania i przekazać gotową cząsteczkę do Ujścia.".into(),
    target_required: 6,
    recipe: None,
    glyphs: vec![
        input_glyph("input-a", hex(-3, 0), "A", None),
        input_glyph("input-b", hex(2, 0), "B", None),
        bonder_glyph("bonder-1", hex(-1, 0), hex(0, 0)),
        output_glyph("output-1", hex(0, 1), pattern("Dimer A-B", &["B", "A"], &[hex(0, 0), hex(-1, 1)], &[[0, 1]]), None),
    ],
    tracks: None,
    initial_arms: vec![arm("arm-1", hex(-2, 0), 3, 1), arm("arm-2", hex(1, 0), 0, 1)],
    default_instructions: program(&[
        ("arm-1", &["GRAB", "ROTATE_CW", "ROTATE_CW", "ROTATE_CW", "DROP", "ROTATE_CCW", "ROTATE_CCW", "ROTATE_CCW", "EMPTY", "REPEAT"]),
        ("arm-2", &["GRAB", "ROTATE_CCW", "ROTATE_CCW", "ROTATE_CCW", "ROTATE_CCW", "ROTATE_CW", "ROTATE_CW", "ROTATE_CW", "ROTATE_CW", "REPEAT"]),
    ]),
    board_radius: None,
}
});

/// Default program of LEVEL_2_WATER as shipped in the PoC: it jams after 9 ticks with 0/6 products.
pub fn level_2_poc_broken_program() -> Program {
    program(&[
        ("arm-1", &["GRAB", "ROTATE_CW", "ROTATE_CW", "DROP", "ROTATE_CCW", "ROTATE_CCW", "REPEAT"]),
        ("arm-2", &["GRAB", "ROTATE_CCW", "ROTATE_CCW", "DROP", "ROTATE_CW", "ROTATE_CW", "REPEAT"]),
    ])
}

pub static LEVEL_2_WATER: LazyLock<LevelConfig> = LazyLock::new(|| LevelConfig {
    id: "level-2-salt-water".into(),
    kind: Some(LevelKind::Poc),
    name: "Lekcja 2: Kinematyka Płynów (Woda i Sól)".into(),
    description: "Zbuduj aparat transmutujący żywioły w cząsteczkę Soli z Wodą. Wykorzystaj rotacje kątowe i koordynację wielu ramion."
        .into(),
    target_required: 6,
    recipe: None,
    glyphs: vec![
        input_glyph("input-water", hex(-2, 1), "WATER", None),
        input_glyph("input-salt", hex(2, -1), "SALT", None),
        bonder_glyph("bonder-w", hex(-1, 0), hex(0, 0)),
        output_glyph("output-w", hex(0, -1), pattern("Aqua Salis", &["SALT", "WATER"], &[hex(0, 0), hex(-1, 0)], &[[0, 1]]), None),
    ],
    tracks: None,
    initial_arms: vec![arm("arm-1", hex(-1, 1), 3, 1), arm("arm-2", hex(1, -1), 0, 1)],
    default_instructions: program(&[
        ("arm-1", &["GRAB", "ROTATE_CW", "DROP", "ROTATE_CCW", "EMPTY", "EMPTY", "EMPTY", "REPEAT"]),
        ("arm-2", &["GRAB", "ROTATE_CW", "ROTATE_CW", "ROTATE_CW", "ROTATE_CCW", "ROTATE_CCW", "ROTATE_CCW", "REPEAT"]),
    ]),
    board_radius: None,
});

pub static LEVEL_3_TRANSMUTE: LazyLock<LevelConfig> = LazyLock::new(|| {
    LevelConfig {
    id: "level-3-transmute".into(),
    kind: Some(LevelKind::Poc),
    name: "Lekcja 3: Transmutacja Ołowiu w Złoto (Pb → Au)".into(),
    description: "Przenieś atom Ołowiu (Pb) z źródła na Glif Transmutacji, gdzie zamieni się w Złoto (Au), a następnie dostarcz go do Ujścia. Glif TRANSMUTE modyfikuje pierwiastek atomu w miejscu, zachowując jego wiązania.".into(),
    target_required: 5,
    recipe: None,
    glyphs: vec![
        input_glyph("input-lead", hex(-2, 0), "LEAD", None),
        transmute_glyph("transmute-1", hex(0, 0), "LEAD", "GOLD"),
        output_glyph("output-gold", hex(-1, 1), pattern("Złoto (Au)", &["GOLD"], &[hex(0, 0)], &[]), None),
    ],
    tracks: None,
    initial_arms: vec![arm("arm-1", hex(-1, 0), 3, 1)],
    default_instructions: program(&[(
        "arm-1",
        &["GRAB", "ROTATE_CW", "ROTATE_CW", "ROTATE_CW", "ROTATE_CW", "DROP", "ROTATE_CCW", "ROTATE_CCW", "ROTATE_CCW", "ROTATE_CCW", "REPEAT"],
    )]),
    board_radius: None,
}
});

pub static LEVEL_4_TRACK: LazyLock<LevelConfig> = LazyLock::new(|| {
    LevelConfig {
    id: "level-4-track".into(),
    kind: Some(LevelKind::Poc),
    name: "Lekcja 4: Szyny Transportowe (Sliding Rail)".into(),
    description: "Ramię porusza się po szynie (TRACK_POS / TRACK_NEG). Chwyć atom Ołowiu na jednym końcu szyny, a następnie przesuń podstawę ramienia, aby dostarczyć atom do ujścia.".into(),
    target_required: 5,
    recipe: None,
    glyphs: vec![
        input_glyph("input-lead", hex(-2, 0), "LEAD", None),
        output_glyph("output-lead", hex(2, 0), pattern("Ołów (Pb)", &["LEAD"], &[hex(0, 0)], &[]), None),
    ],
    tracks: Some(vec![TrackSegment {
        id: "track-main".into(),
        path: vec![hex(-1, 0), hex(0, 0), hex(1, 0), hex(2, 0), hex(3, 0)],
    }]),
    initial_arms: vec![ArmState { track_id: Some(Some("track-main".into())), track_index: Some(0), ..arm("arm-1", hex(-1, 0), 3, 1) }],
    default_instructions: program(&[(
        "arm-1",
        &["GRAB", "TRACK_POS", "TRACK_POS", "TRACK_POS", "TRACK_POS", "DROP", "TRACK_NEG", "TRACK_NEG", "TRACK_NEG", "TRACK_NEG", "REPEAT"],
    )]),
    board_radius: None,
}
});

/// The 4 alchemical PoC levels (teaching levels, not economy recipes).
pub fn poc_levels() -> [&'static LevelConfig; 4] {
    [&LEVEL_1_DIMER, &LEVEL_2_WATER, &LEVEL_3_TRANSMUTE, &LEVEL_4_TRACK]
}
