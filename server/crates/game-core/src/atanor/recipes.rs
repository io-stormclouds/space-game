//! Economy recipe levels of the Fabryka atanorowa (`atanor/engine/recipes.ts`, W08 A, Z2). Port
//! layouts and reference solutions are provisional (EXP-6), exactly as in the TypeScript source.

use std::sync::LazyLock;

use super::arm::{arm, create_arm};
use super::glyph::{bonder_glyph, input_glyph, output_glyph, pattern, product, transmute_glyph};
use super::hex::hex;
use super::levels::program;
use super::types::{DocReference, LevelConfig, LevelKind, RecipeInfo};

fn recipe(id: &str, level: u32, inputs: &[(&str, f64)], outputs: &[(&str, f64)], cycles: f64, area: f64, arms: f64) -> RecipeInfo {
    RecipeInfo {
        recipe_id: id.to_string(),
        building_level: level,
        inputs: inputs.iter().map(|(k, v)| (k.to_string(), *v)).collect(),
        outputs: outputs.iter().map(|(k, v)| (k.to_string(), *v)).collect(),
        doc_reference: DocReference { cycles, area, arms },
    }
}

/// A_NAD — Nadprzewodnik. MIE 2 + PLA 1 + H2 10 → NAD 1, L1. PLA in the centre, three bonds.
pub static LEVEL_A_NAD: LazyLock<LevelConfig> = LazyLock::new(|| {
    LevelConfig {
    id: "recipe-a-nad".into(),
    kind: Some(LevelKind::Recipe),
    name: "Nadprzewodnik (NAD)".into(),
    description: "Połącz Platynit (PLA) z dwiema porcjami Miedzi (MIE) i porcją Wodoru (H2): PLA w środku, trzy wiązania. Gotową cząsteczkę dostarcz do portu wyjściowego.".into(),
    target_required: 6,
    recipe: Some(recipe("A_NAD", 1, &[("MIE", 2.0), ("PLA", 1.0), ("H2", 10.0)], &[("NAD", 1.0)], 12.0, 9.0, 2.0)),
    glyphs: vec![
        input_glyph("in-pla", hex(0, 0), "PLA", Some(1.0)),
        input_glyph("in-mie", hex(2, -1), "MIE", Some(1.0)),
        input_glyph("in-h2", hex(-2, 0), "H2", Some(10.0)),
        output_glyph(
            "out-nad",
            hex(-1, 2),
            pattern(
                "Nadprzewodnik (NAD)",
                &["PLA", "MIE", "MIE", "H2"],
                &[hex(0, 0), hex(1, 0), hex(0, -1), hex(-1, 1)],
                &[[0, 1], [0, 2], [0, 3]],
            ),
            Some(product("NAD", 1.0)),
        ),
        bonder_glyph("bonder-e", hex(0, 0), hex(1, 0)),
        bonder_glyph("bonder-sw", hex(0, 0), hex(-1, 1)),
        bonder_glyph("bonder-nw", hex(0, 0), hex(0, -1)),
    ],
    tracks: None,
    initial_arms: vec![arm("arm-1", hex(1, -1), 0, 1), arm("arm-2", hex(-1, 0), 3, 1)],
    default_instructions: program(&[
        (
            "arm-1",
            &[
                "GRAB", "ROTATE_CW", "DROP", "ROTATE_CCW", "GRAB", "ROTATE_CCW", "ROTATE_CCW", "ROTATE_CCW", "DROP", "ROTATE_CW", "ROTATE_CW",
                "ROTATE_CW", "REPEAT",
            ],
        ),
        (
            "arm-2",
            &["GRAB", "ROTATE_CCW", "ROTATE_CCW", "EMPTY", "EMPTY", "EMPTY", "EMPTY", "EMPTY", "ROTATE_CW", "ROTATE_CW", "EMPTY", "EMPTY", "REPEAT"],
        ),
    ]),
    board_radius: None,
}
});

/// A_KAT — Katalizator. PLA 1 + KRZ 1 → KAT 1, L2 (transmutation PLA → PLA*).
pub static LEVEL_A_KAT: LazyLock<LevelConfig> = LazyLock::new(|| {
    LevelConfig {
    id: "recipe-a-kat".into(),
    kind: Some(LevelKind::Recipe),
    name: "Katalizator (KAT)".into(),
    description: "Przeprowadź Platynit (PLA) przez glif transmutacji (PLA → PLA*), połącz go z Krzemem (KRZ) i dostarcz parę PLA*–KRZ do portu wyjściowego.".into(),
    target_required: 6,
    recipe: Some(recipe("A_KAT", 2, &[("PLA", 1.0), ("KRZ", 1.0)], &[("KAT", 1.0)], 10.0, 8.0, 2.0)),
    glyphs: vec![
        input_glyph("in-pla", hex(-2, 1), "PLA", Some(1.0)),
        input_glyph("in-krz", hex(2, -1), "KRZ", Some(1.0)),
        output_glyph(
            "out-kat",
            hex(0, 1),
            pattern("Katalizator (KAT)", &["PLA*", "KRZ"], &[hex(0, 0), hex(1, 0)], &[[0, 1]]),
            Some(product("KAT", 1.0)),
        ),
        transmute_glyph("transmute-pla", hex(-1, 0), "PLA", "PLA*"),
        bonder_glyph("bonder-1", hex(0, 0), hex(1, 0)),
    ],
    tracks: None,
    initial_arms: vec![arm("arm-1", hex(-1, 1), 3, 1), arm("arm-2", hex(1, -1), 0, 1)],
    default_instructions: program(&[
        ("arm-1", &["GRAB", "ROTATE_CW", "ROTATE_CW", "DROP", "ROTATE_CCW", "ROTATE_CCW", "REPEAT"]),
        ("arm-2", &["GRAB", "ROTATE_CW", "EMPTY", "PIVOT_CCW", "ROTATE_CCW", "EMPTY", "REPEAT"]),
    ]),
    board_radius: None,
}
});

/// A_MET — Metamateriał osłonowy. STP 1 + KOM 1 + BET 2 → MET 1, L2. A rhombus STP–BET–KOM–BET.
pub static LEVEL_A_MET: LazyLock<LevelConfig> = LazyLock::new(|| {
    LevelConfig {
    id: "recipe-a-met".into(),
    kind: Some(LevelKind::Recipe),
    name: "Metamateriał osłonowy (MET)".into(),
    description: "Zamknij pierścień czterech atomów: Stop tytanowy (STP), Beton (BET), Kompozyt (KOM), Beton (BET). STP i KOM leżą naprzeciw siebie, dwa atomy BET stykają się, ale nie są związane.".into(),
    target_required: 6,
    recipe: Some(recipe("A_MET", 2, &[("STP", 1.0), ("KOM", 1.0), ("BET", 2.0)], &[("MET", 1.0)], 16.0, 14.0, 3.0)),
    glyphs: vec![
        input_glyph("in-stp", hex(0, 0), "STP", Some(1.0)),
        input_glyph("in-bet", hex(1, -1), "BET", Some(1.0)),
        input_glyph("in-kom", hex(0, 2), "KOM", Some(1.0)),
        output_glyph(
            "out-met",
            hex(1, 1),
            pattern(
                "Metamateriał osłonowy (MET)",
                &["STP", "BET", "KOM", "BET"],
                &[hex(0, 0), hex(1, 0), hex(1, 1), hex(0, 1)],
                &[[0, 1], [1, 2], [2, 3], [3, 0]],
            ),
            Some(product("MET", 1.0)),
        ),
        bonder_glyph("bonder-stp-bet", hex(0, 0), hex(1, 0)),
        bonder_glyph("bonder-bet-kom", hex(1, 0), hex(1, 1)),
        bonder_glyph("bonder-kom-bet", hex(0, 1), hex(1, 1)),
    ],
    tracks: None,
    initial_arms: vec![arm("arm-1", hex(-1, 0), 0, 1), arm("arm-2", hex(2, -1), 3, 1), arm("arm-3", hex(1, 2), 3, 1)],
    default_instructions: program(&[
        ("arm-1", &["GRAB", "EMPTY", "PIVOT_CW", "EMPTY", "EMPTY", "EMPTY", "EMPTY", "REPEAT"]),
        ("arm-2", &["GRAB", "ROTATE_CCW", "DROP", "ROTATE_CW", "GRAB", "ROTATE_CCW", "ROTATE_CW", "REPEAT"]),
        ("arm-3", &["EMPTY", "EMPTY", "EMPTY", "EMPTY", "GRAB", "ROTATE_CW", "ROTATE_CCW", "REPEAT"]),
    ]),
    board_radius: None,
}
});

/// A_KAP — Kapsuła fuzyjna. HE3 5 + DEU 10 + NAD 1 → KAP 1, L3. A star around NAD.
pub static LEVEL_A_KAP: LazyLock<LevelConfig> = LazyLock::new(|| {
    LevelConfig {
    id: "recipe-a-kap".into(),
    kind: Some(LevelKind::Recipe),
    name: "Kapsuła fuzyjna (KAP)".into(),
    description: "Zbuduj gwiazdę: Nadprzewodnik (NAD) w środku, wokół niego porcja Helu-3 (HE3) i dwie porcje Deuteru (DEU), co drugi sąsiad. Gotową cząsteczkę dostarcz do portu wyjściowego.".into(),
    target_required: 6,
    recipe: Some(recipe("A_KAP", 3, &[("HE3", 5.0), ("DEU", 10.0), ("NAD", 1.0)], &[("KAP", 1.0)], 18.0, 16.0, 3.0)),
    glyphs: vec![
        input_glyph("in-nad", hex(0, 0), "NAD", Some(1.0)),
        input_glyph("in-he3", hex(1, -1), "HE3", Some(5.0)),
        input_glyph("in-deu", hex(1, 1), "DEU", Some(5.0)),
        output_glyph(
            "out-kap",
            hex(1, 0),
            pattern(
                "Kapsuła fuzyjna (KAP)",
                &["NAD", "HE3", "DEU", "DEU"],
                &[hex(0, 0), hex(0, -1), hex(1, 0), hex(-1, 1)],
                &[[0, 1], [0, 2], [0, 3]],
            ),
            Some(product("KAP", 1.0)),
        ),
        bonder_glyph("bonder-station", hex(0, 0), hex(1, 0)),
    ],
    tracks: None,
    initial_arms: vec![arm("arm-1", hex(2, -2), 2, 2), arm("arm-2", hex(2, -1), 3, 1), arm("arm-3", hex(2, 0), 2, 1)],
    default_instructions: program(&[
        ("arm-1", &["EMPTY", "GRAB", "PIVOT_CW", "PIVOT_CW", "PIVOT_CW", "PIVOT_CW", "EMPTY", "REPEAT"]),
        ("arm-2", &["GRAB", "ROTATE_CCW", "DROP", "ROTATE_CW", "EMPTY", "EMPTY", "EMPTY", "REPEAT"]),
        ("arm-3", &["ROTATE_CW", "ROTATE_CCW", "GRAB", "ROTATE_CW", "DROP", "ROTATE_CCW", "GRAB", "REPEAT"]),
    ]),
    board_radius: None,
}
});

/// A_PRO — Procesor kwantowy. KWA 1 + UKL 2 + NAD 1 → PRO 1, L4 (a 3-gripper arm and a piston).
pub static LEVEL_A_PRO: LazyLock<LevelConfig> = LazyLock::new(|| {
    LevelConfig {
    id: "recipe-a-pro".into(),
    kind: Some(LevelKind::Recipe),
    name: "Procesor kwantowy (PRO)".into(),
    description: "Przeprowadź Kwantyt (KWA) przez glif transmutacji (KWA → KWA*) do środka i otocz go dwoma Układami scalonymi (UKL) i Nadprzewodnikiem (NAD), co drugi sąsiad. Ramię wielochwytakowe chwyta kilka atomów naraz.".into(),
    target_required: 6,
    recipe: Some(recipe("A_PRO", 4, &[("KWA", 1.0), ("UKL", 2.0), ("NAD", 1.0)], &[("PRO", 1.0)], 24.0, 20.0, 4.0)),
    glyphs: vec![
        input_glyph("in-ukl-1", hex(0, 1), "UKL", Some(1.0)),
        input_glyph("in-ukl-2", hex(-1, 0), "UKL", Some(1.0)),
        input_glyph("in-nad", hex(1, -1), "NAD", Some(1.0)),
        input_glyph("in-kwa", hex(2, -1), "KWA", Some(1.0)),
        output_glyph(
            "out-pro",
            hex(0, -1),
            pattern(
                "Procesor kwantowy (PRO)",
                &["KWA*", "NAD", "UKL", "UKL"],
                &[hex(0, 0), hex(1, 0), hex(-1, 1), hex(0, -1)],
                &[[0, 1], [0, 2], [0, 3]],
            ),
            Some(product("PRO", 1.0)),
        ),
        bonder_glyph("bonder-e", hex(0, 0), hex(1, 0)),
        bonder_glyph("bonder-sw", hex(0, 0), hex(-1, 1)),
        bonder_glyph("bonder-nw", hex(0, 0), hex(0, -1)),
        transmute_glyph("transmute-kwa", hex(1, 0), "KWA", "KWA*"),
    ],
    tracks: None,
    initial_arms: vec![create_arm("arm-1", hex(0, 0), 0, 1, false, 3), create_arm("arm-2", hex(2, 0), 3, 2, true, 1)],
    default_instructions: program(&[
        ("arm-1", &["ROTATE_CW", "GRAB", "EMPTY", "EMPTY", "EMPTY", "ROTATE_CW", "REPEAT"]),
        ("arm-2", &["RETRACT", "ROTATE_CW", "GRAB", "ROTATE_CCW", "EXTEND", "EMPTY", "REPEAT"]),
    ]),
    board_radius: None,
}
});

/// Economy recipe levels (Fabryka atanorowa).
pub fn recipe_levels() -> [&'static LevelConfig; 5] {
    [&LEVEL_A_NAD, &LEVEL_A_KAT, &LEVEL_A_MET, &LEVEL_A_KAP, &LEVEL_A_PRO]
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::resource::qty;

    #[test]
    fn recipe_inputs_match_the_catalog_entries() {
        assert_eq!(LEVEL_A_NAD.recipe.as_ref().unwrap().inputs, qty([("MIE", 2.0), ("PLA", 1.0), ("H2", 10.0)]));
        assert_eq!(recipe_levels().len(), 5);
    }
}
