//! Recorded vectors of the galaxy generator (plan 08 E1-09, P-16 a).
//!
//! `vectors/galaxy-gen.json` is the text `game_wasm::galaxy_vectors` gives natively for [`request`]:
//! the default parameters with the seed 20261111, the stars of 50 cells (25 around Sol, 25 far from
//! every register star) and the first 200 planetary systems of the far cells. It is compared as
//! text, byte for byte and without a tolerance: the generator promises the same bytes on every
//! platform. The module built for `wasm32` answers the same request through `sg_galaxy`, and
//! `web-game/packages/wasm-host/src/galaxy-gen.spec.ts` compares its bytes with the same file.
//!
//! `conformance galaxy-record <file>` writes the file; `conformance galaxy <file>` and
//! `tests/golden.rs` compare it.

use std::fs;
use std::path::Path;

use game_core::galaxy::generator::{CellCoord, GalaxyParams};
use serde_json::{Value, json};

/// Seed of the recorded galaxy (the seed of the acceptance tests).
pub const SEED: u64 = 20_261_111;

/// Cells from this x on are thousands of light years from every register star.
const FAR_X: i32 = 2_000;
/// Far cells whose stars are recorded: x = 2000 ..= 2024.
const FAR_CELLS: i32 = 25;
/// Far cells searched for the systems. About three stars a cell: the first 200 systems end long
/// before the last of these cells, and [`document`] refuses vectors with fewer.
const SYSTEM_CELLS: i32 = 100;

const CELLS: usize = 50;
const SYSTEMS: u32 = 200;

fn cell(x: i32, y: i32) -> CellCoord {
    CellCoord { x, y, z: 0 }
}

/// The request of the recorded vectors: the defaults with [`SEED`]; the cells x, y = −2 ..= 2 around
/// Sol and x = 2000 ..= 2024 (y = 0), all with z = 0; the first 200 systems of the cells x ≥ 2000
/// (y = 0, z = 0).
pub fn request() -> String {
    let near = (-2..=2).flat_map(|x| (-2..=2).map(move |y| cell(x, y)));
    let far = (FAR_X..FAR_X + FAR_CELLS).map(|x| cell(x, 0));
    json!({
        "params": GalaxyParams { seed: SEED, ..GalaxyParams::default() },
        "cells": near.chain(far).collect::<Vec<_>>(),
        "systemCells": (FAR_X..FAR_X + SYSTEM_CELLS).map(|x| cell(x, 0)).collect::<Vec<_>>(),
        "systems": SYSTEMS,
    })
    .to_string()
}

/// The vectors as the generator gives them now, and what they hold (for the report line). An error
/// when they are not the 50 cells and 200 systems the file is meant to hold.
fn document() -> Result<(String, String), String> {
    let text = game_wasm::galaxy_vectors(&request())?;
    let doc: Value = serde_json::from_str(&text).map_err(|e| format!("the galaxy vectors are not JSON: {e}"))?;
    let list = |name: &str| doc[name].as_array().map_or(&[][..], Vec::as_slice);
    let (cells, systems) = (list("cells"), list("systems"));
    if cells.len() != CELLS || systems.len() != SYSTEMS as usize {
        return Err(format!("galaxy vectors: expected {CELLS} cells and {SYSTEMS} systems, got {} and {}", cells.len(), systems.len()));
    }
    let stars: usize = cells.iter().map(|c| c["stars"].as_array().map_or(0, Vec::len)).sum();
    let last_x = systems.last().and_then(|s| s["star"]["key"]["cell"]["x"].as_i64()).unwrap_or_default();
    let holds = format!("{CELLS} cells with {stars} stars, {SYSTEMS} systems of the cells x = {FAR_X} ..= {last_x}, {} bytes", text.len());
    Ok((text, holds))
}

/// Where the recorded text and the generator's part: the byte, its line (an entry per line) and both texts around it.
fn first_difference(recorded: &[u8], generated: &[u8]) -> String {
    let at = recorded.iter().zip(generated).take_while(|(a, b)| a == b).count();
    let line = recorded[..at].iter().filter(|&&b| b == b'\n').count() + 1;
    let around = |text: &[u8]| String::from_utf8_lossy(&text[at.saturating_sub(60)..(at + 60).min(text.len())]).into_owned();
    format!(
        "byte {at} (line {line}); {} bytes recorded, {} generated\n     recorded:  {}\n     generated: {}",
        recorded.len(),
        generated.len(),
        around(recorded),
        around(generated)
    )
}

/// Compares recorded bytes with the generator's text: what the vectors hold, or where they differ.
fn check(recorded: &[u8]) -> Result<String, String> {
    let (text, holds) = document()?;
    if recorded == text.as_bytes() { Ok(holds) } else { Err(first_difference(recorded, text.as_bytes())) }
}

/// `conformance galaxy <file>`: the generator must give the recorded text, byte for byte.
pub fn run(file: &Path) -> bool {
    let recorded = match fs::read(file) {
        Ok(bytes) => bytes,
        Err(e) => {
            eprintln!("cannot read {}: {e}", file.display());
            return false;
        }
    };
    match check(&recorded) {
        Ok(holds) => {
            println!("OK   galaxy-gen ({holds}: the same text)");
            true
        }
        Err(difference) => {
            println!("FAIL galaxy-gen: the generator's text is not {}", file.display());
            println!("     {difference}");
            false
        }
    }
}

/// `conformance galaxy-record <file>`: writes the vectors as the native build gives them.
pub fn record(file: &Path) -> bool {
    let written = document().and_then(|(text, holds)| fs::write(file, text).map(|()| holds).map_err(|e| format!("cannot write: {e}")));
    match written {
        Ok(holds) => {
            println!("recorded {}: {holds}", file.display());
            true
        }
        Err(e) => {
            eprintln!("{}: {e}", file.display());
            false
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_changed_or_missing_byte_is_a_difference() {
        let (text, _) = document().expect("vectors");
        assert!(check(text.as_bytes()).is_ok());

        // one digit of the last system: the difference names its byte and its line
        let mut changed = text.clone().into_bytes();
        let at = changed.iter().rposition(u8::is_ascii_digit).expect("a digit");
        changed[at] = if changed[at] == b'7' { b'8' } else { b'7' };
        let lines = text.lines().count();
        let difference = check(&changed).expect_err("a changed digit");
        assert!(difference.starts_with(&format!("byte {at} (line {})", lines - 1)), "{difference}");

        // a text cut short, and one with something after the end
        assert!(check(&text.as_bytes()[..text.len() - 1]).is_err());
        assert!(check(format!("{text}\n").as_bytes()).is_err());
    }
}
