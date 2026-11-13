//! Recorded vectors of the galaxy generator (task E1-09, P-16 a): `vectors/galaxy-gen.json`.
//!
//! Recorded natively by `conformance galaxy-record <file>` from the request below, and compared
//! byte for byte twice: natively by `conformance galaxy <file>` (`tests/golden.rs`), and on `wasm32`
//! by `web-game/packages/wasm-host/src/galaxy-gen.spec.ts` through the module's `sg_galaxy`. Both
//! sides run the same function, `game_wasm::galaxy::vectors`; the file changes only when the
//! generator changes on purpose, and then it is recorded again.
//!
//! Request: the default parameters with the seed 20261111; 50 cells (25 around Sol: x and y from −2
//! to 2, z = 0; 25 cells x = 2000 … 2024, y = 0, z = 0) and the first 200 systems of the row of
//! cells x = 2000, 2001, … (y = 0, z = 0).

use std::fs;
use std::path::Path;

use serde_json::json;

/// Seed of the recorded galaxy (the seed of the acceptance tests).
pub const SEED: u64 = 20_261_111;

/// Systems in the file.
pub const SYSTEMS: u32 = 200;

/// The request of the recorded file, as JSON (the format of `game_wasm::galaxy::vectors`).
pub fn request() -> String {
    let cell = |x: i32, y: i32| json!({ "x": x, "y": y, "z": 0 });
    let around_sol = (-2..=2).flat_map(|x| (-2..=2).map(move |y| cell(x, y)));
    let far = (2000..=2024).map(|x| cell(x, 0));
    let cells: Vec<_> = around_sol.chain(far).collect();
    json!({ "seed": SEED, "cells": cells, "systems": { "from": cell(2000, 0), "count": SYSTEMS } }).to_string()
}

/// The text of the file, computed now.
pub fn vectors() -> Result<String, String> {
    game_wasm::galaxy::vectors(&request())
}

/// Writes the file; prints its size.
pub fn record(path: &Path) -> bool {
    let text = match vectors() {
        Ok(text) => text,
        Err(error) => {
            eprintln!("{error}");
            return false;
        }
    };
    match fs::write(path, &text) {
        Ok(()) => {
            println!("{}: {} bytes, {} lines", path.display(), text.len(), text.lines().count());
            true
        }
        Err(e) => {
            eprintln!("{}: {e}", path.display());
            false
        }
    }
}

/// Compares the file with the generator byte for byte; prints the first difference.
pub fn run(path: &Path) -> bool {
    let recorded = match fs::read(path) {
        Ok(bytes) => bytes,
        Err(e) => {
            eprintln!("{}: {e}", path.display());
            return false;
        }
    };
    let now = match vectors() {
        Ok(text) => text.into_bytes(),
        Err(error) => {
            eprintln!("{error}");
            return false;
        }
    };
    match first_difference(&recorded, &now) {
        None => {
            println!("galaxy vectors: {} bytes equal", now.len());
            true
        }
        Some(at) => {
            let line = recorded[..at].iter().filter(|&&b| b == b'\n').count() + 1;
            let around = |bytes: &[u8]| {
                let start = at.saturating_sub(60);
                String::from_utf8_lossy(&bytes[start..(at + 60).min(bytes.len())]).into_owned()
            };
            eprintln!(
                "galaxy vectors differ at byte {at} (line {line}; recorded {} bytes, generated {}):\n  recorded:  …{}…\n  generated: …{}…",
                recorded.len(),
                now.len(),
                around(&recorded),
                around(&now),
            );
            false
        }
    }
}

/// Index of the first byte that differs, or the length of the shorter text when one is a prefix of the other.
fn first_difference(a: &[u8], b: &[u8]) -> Option<usize> {
    match a.iter().zip(b).position(|(x, y)| x != y) {
        Some(at) => Some(at),
        None if a.len() != b.len() => Some(a.len().min(b.len())),
        None => None,
    }
}
