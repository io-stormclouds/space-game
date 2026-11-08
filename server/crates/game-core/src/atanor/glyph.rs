//! Glyph constructors and helpers (`atanor/engine/glyph.ts`).

use super::hex::{Hex, hex_distance};
use super::types::{Glyph, GlyphType, OutputProduct, TargetPattern};

fn base(id: &str, kind: GlyphType, pos: Hex) -> Glyph {
    Glyph {
        id: id.to_string(),
        kind,
        pos,
        pos2: None,
        element: None,
        portion: None,
        target_pattern: None,
        product: None,
        from_element: None,
        to_element: None,
    }
}

pub fn input_glyph(id: &str, pos: Hex, element: &str, portion: Option<f64>) -> Glyph {
    if let Some(p) = portion {
        assert!(p > 0.0, "Input portion must be positive: {p}");
    }
    Glyph { element: Some(element.to_string()), portion, ..base(id, GlyphType::Input, pos) }
}

pub fn output_glyph(id: &str, pos: Hex, target: TargetPattern, product: Option<OutputProduct>) -> Glyph {
    Glyph { target_pattern: Some(target), product, ..base(id, GlyphType::Output, pos) }
}

pub fn bonder_glyph(id: &str, pos1: Hex, pos2: Hex) -> Glyph {
    assert_eq!(hex_distance(pos1, pos2), 1, "Bonder glyph positions must be adjacent hexes: {pos1:?} and {pos2:?}");
    Glyph { pos2: Some(pos2), ..base(id, GlyphType::Bonder, pos1) }
}

pub fn unbonder_glyph(id: &str, pos1: Hex, pos2: Hex) -> Glyph {
    assert_eq!(hex_distance(pos1, pos2), 1, "Unbonder glyph positions must be adjacent hexes: {pos1:?} and {pos2:?}");
    Glyph { pos2: Some(pos2), ..base(id, GlyphType::Unbonder, pos1) }
}

pub fn transmute_glyph(id: &str, pos: Hex, from: &str, to: &str) -> Glyph {
    Glyph { from_element: Some(from.to_string()), to_element: Some(to.to_string()), ..base(id, GlyphType::Transmute, pos) }
}

/// A target molecule: `pattern("name", &["A", "B"], &[hex(0,0), hex(-1,1)], &[[0, 1]])`.
pub fn pattern(name: &str, elements: &[&str], offsets: &[Hex], bonds: &[[usize; 2]]) -> TargetPattern {
    TargetPattern {
        name: name.to_string(),
        elements: elements.iter().map(|e| e.to_string()).collect(),
        relative_hex_offsets: offsets.to_vec(),
        bonds: bonds.to_vec(),
    }
}

pub fn product(material: &str, quantity: f64) -> OutputProduct {
    OutputProduct { material: material.to_string(), quantity }
}

/// INPUT and OUTPUT glyphs belong to the level (building ports), the rest to the player.
pub fn is_port_glyph(glyph: &Glyph) -> bool {
    matches!(glyph.kind, GlyphType::Input | GlyphType::Output)
}

/// Hexes covered by a glyph (two for bonders/unbonders).
pub fn glyph_cells(glyph: &Glyph) -> Vec<Hex> {
    match (glyph.kind, glyph.pos2) {
        (GlyphType::Bonder | GlyphType::Unbonder, Some(p2)) => vec![glyph.pos, p2],
        _ => vec![glyph.pos],
    }
}

/// PoC cost points: bonder / unbonder 10, transmuter 20, ports free.
pub fn glyph_cost(glyph: &Glyph) -> u64 {
    match glyph.kind {
        GlyphType::Bonder | GlyphType::Unbonder => 10,
        GlyphType::Transmute => 20,
        GlyphType::Input | GlyphType::Output => 0,
    }
}
