//! The game session for the browser worker: `GameApi` on WebAssembly (plan 02 B3).
//!
//! A plain C ABI instead of `wasm-bindgen`, so the build needs only `cargo` (no glue generator):
//! JSON messages of `api/src/protocol.ts` go in and out through two byte buffers in linear memory.
//! The JS side (`web-game/packages/wasm-host`) writes a request into the input buffer
//! (`sg_input(len)` returns where), calls `sg_handle(len, now_ms)` and reads the JSON array of
//! outgoing messages (replies and pushes) from `sg_output_ptr()` / the returned length. `sg_tick`
//! runs the fixed-step loop like the mock's `ServerHost.tick`.
//!
//! Imports from the module `env`: `sg_now() -> f64` (performance.now, for the step statistics) and
//! `sg_panic(ptr, len)` (UTF-8 panic message before the trap).
//!
//! `sg_galaxy` is a test hook outside `GameApi` (P-16 a, task E1-09): the galaxy generator's
//! vectors as text, compared byte for byte with the natively recorded
//! `server/conformance/vectors/galaxy-gen.json` (`web-game/packages/wasm-host/src/galaxy-gen.spec.ts`).

// `#[no_mangle]` exports and the two imports are the only unsafe parts; no raw pointer is dereferenced.
#![allow(unsafe_code)]

use std::cell::RefCell;

use game_session::{Host, HostOptions, Outgoing, SessionOptions, SyncMessage};

#[cfg(target_arch = "wasm32")]
mod js {
    #[link(wasm_import_module = "env")]
    unsafe extern "C" {
        fn sg_now() -> f64;
        fn sg_panic(ptr: *const u8, len: usize);
    }

    pub fn now() -> f64 {
        // SAFETY: imported function without arguments, returns a number.
        unsafe { sg_now() }
    }

    pub fn panic(msg: &str) {
        // SAFETY: the host reads `len` bytes at `ptr` from linear memory before the trap.
        unsafe { sg_panic(msg.as_ptr(), msg.len()) }
    }
}

#[cfg(not(target_arch = "wasm32"))]
mod js {
    pub fn now() -> f64 {
        0.0
    }

    pub fn panic(_msg: &str) {}
}

struct State {
    host: Host,
    input: Vec<u8>,
    output: Vec<u8>,
}

thread_local! {
    static STATE: RefCell<Option<State>> = const { RefCell::new(None) };
}

fn with<R>(f: impl FnOnce(&mut State) -> R) -> R {
    STATE.with(|cell| {
        let mut slot = cell.borrow_mut();
        let state = slot.get_or_insert_with(|| {
            std::panic::set_hook(Box::new(|info| js::panic(&info.to_string())));
            State {
                host: Host::new(HostOptions {
                    session: SessionOptions { clock: js::now, ..SessionOptions::default() },
                    ..HostOptions::default()
                }),
                input: Vec::new(),
                output: Vec::new(),
            }
        });
        f(state)
    })
}

fn write_output(state: &mut State, messages: &[Outgoing]) -> usize {
    state.output.clear();
    serde_json::to_writer(&mut state.output, messages).expect("messages serialise");
    state.output.len()
}

/// Crate version (major × 10000 + minor × 100 + patch), to check the loaded module.
#[unsafe(no_mangle)]
pub extern "C" fn sg_version() -> u32 {
    let v = |s: &str| s.parse::<u32>().unwrap_or(0);
    v(env!("CARGO_PKG_VERSION_MAJOR")) * 10_000 + v(env!("CARGO_PKG_VERSION_MINOR")) * 100 + v(env!("CARGO_PKG_VERSION_PATCH"))
}

/// Makes room for a request of `len` bytes; returns where to write it.
#[unsafe(no_mangle)]
pub extern "C" fn sg_input(len: usize) -> *mut u8 {
    with(|s| {
        s.input.resize(len, 0);
        s.input.as_mut_ptr()
    })
}

/// Where the last result (JSON array of outgoing messages) lies.
#[unsafe(no_mangle)]
pub extern "C" fn sg_output_ptr() -> *const u8 {
    with(|s| s.output.as_ptr())
}

/// Handles the request in the input buffer (`len` bytes of JSON `RequestMessage`); returns the result length.
#[unsafe(no_mangle)]
pub extern "C" fn sg_handle(len: usize, now_ms: f64) -> usize {
    with(|s| {
        let text = String::from_utf8_lossy(&s.input[..len.min(s.input.len())]).into_owned();
        let out = s.host.handle_json(&text, now_ms);
        write_output(s, &out)
    })
}

/// One loop tick (events, frame, snapshot when due); returns the result length.
#[unsafe(no_mangle)]
pub extern "C" fn sg_tick(now_ms: f64) -> usize {
    with(|s| {
        let out = s.host.tick(now_ms);
        write_output(s, &out)
    })
}

/// A snapshot push now (worker start); returns the result length.
#[unsafe(no_mangle)]
pub extern "C" fn sg_snapshot(now_ms: f64) -> usize {
    with(|s| {
        let out = [s.host.push_snapshot(now_ms)];
        write_output(s, &out)
    })
}

/// Replica of a server world (plan 02 §6): applies the sync message in the input buffer (`len`
/// bytes of JSON `SyncMessage`). Result: `{"ok":true,"out":[messages]}`, or `{"ok":false,"error"}`
/// when the copy can no longer follow and needs a reset.
#[unsafe(no_mangle)]
pub extern "C" fn sg_sync(len: usize) -> usize {
    with(|s| {
        let result = std::str::from_utf8(&s.input[..len.min(s.input.len())])
            .map_err(|e| format!("bad sync message: {e}"))
            .and_then(SyncMessage::from_json)
            .and_then(|m| s.host.apply_sync(m));
        let value = match result {
            Ok(out) => serde_json::json!({ "ok": true, "out": out }),
            Err(error) => serde_json::json!({ "ok": false, "error": error }),
        };
        s.output.clear();
        serde_json::to_writer(&mut s.output, &value).expect("result serialises");
        s.output.len()
    })
}

/// Replica loop tick: frame after a step, snapshot when changed (≤ every 100 ms); returns the result length.
#[unsafe(no_mangle)]
pub extern "C" fn sg_view(now_ms: f64) -> usize {
    with(|s| {
        let out = s.host.view(now_ms);
        write_output(s, &out)
    })
}

/// Test hook of the galaxy generator, outside `GameApi` (P-16 a): the request in the input buffer
/// (`len` bytes of JSON, see [`galaxy::vectors`]) gives the text of the generator's vectors in the
/// output buffer; a bad request gives `{"error"}`. Returns the result length.
#[unsafe(no_mangle)]
pub extern "C" fn sg_galaxy(len: usize) -> usize {
    with(|s| {
        let text = std::str::from_utf8(&s.input[..len.min(s.input.len())])
            .map_err(|e| format!("bad galaxy request: {e}"))
            .and_then(galaxy::vectors)
            .unwrap_or_else(|error| serde_json::json!({ "error": error }).to_string());
        s.output.clear();
        s.output.extend_from_slice(text.as_bytes());
        s.output.len()
    })
}

/// The galaxy generator's vectors as one text (task E1-09). The same function records
/// `server/conformance/vectors/galaxy-gen.json` natively (`conformance galaxy-record`) and answers
/// `sg_galaxy` on `wasm32`, so the two texts differ only if the platform changes a result.
pub mod galaxy {
    use game_core::galaxy::generator::{CellCoord, GalaxyParams, generate_system, stars_in_cell};
    use serde_json::Value;

    /// How many cells of the row the systems are searched in at most.
    const MAX_ROW_CELLS: i32 = 1_000_000;

    /// The vectors of a request. Request (JSON):
    ///
    /// ```text
    /// {"seed": u64, "cells": [CellCoord], "systems": {"from": CellCoord, "count": u32}}
    /// ```
    ///
    /// Parameters: `GalaxyParams::default()` with `seed`. Result: one JSON object, one entry per line
    /// (readable diffs when the generator changes on purpose), ending with a newline:
    ///
    /// ```text
    /// {"request":{…the request…},
    /// "params":{…GalaxyParams…},
    /// "cells":[
    /// {"cell":CellCoord,"stars":[StarSpec…]},   one line per requested cell, in request order
    /// …
    /// ],
    /// "systems":[
    /// SystemSpec,                               one line per system
    /// …
    /// ]}
    /// ```
    ///
    /// `systems`: the first `count` systems of the row of cells `from`, `from + (1, 0, 0)`, … (the
    /// stars of each cell in index order; stars without a system, the register's, are skipped).
    /// Every value is `serde_json` of the generator's own type, as the acceptance tests compare it.
    pub fn vectors(request: &str) -> Result<String, String> {
        let request: Value = serde_json::from_str(request).map_err(|e| format!("bad galaxy request: {e}"))?;
        let seed = request["seed"].as_u64().ok_or("galaxy request: `seed` must be an unsigned integer")?;
        let cells: Vec<CellCoord> =
            serde_json::from_value(request["cells"].clone()).map_err(|e| format!("galaxy request: `cells`: {e}"))?;
        let from: CellCoord =
            serde_json::from_value(request["systems"]["from"].clone()).map_err(|e| format!("galaxy request: `systems.from`: {e}"))?;
        let count = request["systems"]["count"]
            .as_u64()
            .and_then(|n| u32::try_from(n).ok())
            .ok_or("galaxy request: `systems.count` must be an unsigned 32-bit integer")?;

        let p = GalaxyParams { seed, ..GalaxyParams::default() };
        let text = |value: Result<String, serde_json::Error>| value.map_err(|e| format!("galaxy vectors: {e}"));

        // the request again, as this function read it: the same text whatever the caller's formatting
        let echo = serde_json::json!({ "seed": seed, "cells": cells, "systems": { "from": from, "count": count } });
        let mut out = format!("{{\"request\":{echo},\n\"params\":{},\n\"cells\":[\n", text(serde_json::to_string(&p))?);
        for (i, cell) in cells.iter().enumerate() {
            let stars = text(serde_json::to_string(&stars_in_cell(&p, *cell)))?;
            let cell = text(serde_json::to_string(cell))?;
            let comma = if i + 1 < cells.len() { "," } else { "" };
            out.push_str(&format!("{{\"cell\":{cell},\"stars\":{stars}}}{comma}\n"));
        }
        out.push_str("],\n\"systems\":[\n");
        let mut found = 0u32;
        let mut row = 0i32;
        while found < count {
            if row == MAX_ROW_CELLS {
                return Err(format!("galaxy vectors: fewer than {count} systems in {MAX_ROW_CELLS} cells"));
            }
            let x = from.x.checked_add(row).ok_or("galaxy vectors: the row of cells leaves the range of i32")?;
            row += 1;
            for star in stars_in_cell(&p, CellCoord { x, ..from }) {
                if found == count {
                    break;
                }
                let Some(system) = generate_system(&p, star.key) else { continue };
                found += 1;
                let comma = if found < count { "," } else { "" };
                out.push_str(&text(serde_json::to_string(&system))?);
                out.push_str(comma);
                out.push('\n');
            }
        }
        out.push_str("]}\n");
        Ok(out)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn output() -> serde_json::Value {
        with(|s| serde_json::from_slice(&s.output).expect("json"))
    }

    fn send(json: &str) -> serde_json::Value {
        let ptr = sg_input(json.len());
        let _ = ptr;
        with(|s| s.input.copy_from_slice(json.as_bytes()));
        sg_handle(json.len(), 0.0);
        output()
    }

    #[test]
    fn request_reply_and_pushes() {
        let out = send(r#"{"id":7,"request":{"kind":"start","scenarioId":"planeta-matka"}}"#);
        assert_eq!(out[0]["type"], "reply");
        assert_eq!(out[0]["id"], 7);
        assert_eq!(out[0]["ok"], true);
        assert_eq!(out[0]["value"]["scenarioId"], "planeta-matka");
        assert_eq!(out[1]["type"], "snapshot");

        let out = send(r#"{"id":8,"request":{"kind":"pause"}}"#);
        assert_eq!(out[0]["value"], serde_json::Value::Null);

        let out = send(r#"{"id":9,"request":{"kind":"nope"}}"#);
        assert_eq!(out[0]["ok"], false);
        assert_eq!(out[0]["id"], 9);

        sg_tick(0.0);
        let out = output();
        assert!(out.as_array().unwrap().iter().any(|m| m["type"] == "frame"));
    }

    fn galaxy_through_buffers(json: &str) -> String {
        sg_input(json.len());
        with(|s| s.input.copy_from_slice(json.as_bytes()));
        let len = sg_galaxy(json.len());
        with(|s| String::from_utf8(s.output[..len].to_vec()).expect("utf-8"))
    }

    #[test]
    fn galaxy_hook_returns_the_vectors_text() {
        let request =
            r#"{"seed":7,"cells":[{"x":0,"y":0,"z":0},{"x":3000,"y":0,"z":0}],"systems":{"from":{"x":3000,"y":0,"z":0},"count":4}}"#;
        let text = galaxy_through_buffers(request);
        assert_eq!(text, galaxy::vectors(request).expect("a good request"));
        let value: serde_json::Value = serde_json::from_str(&text).expect("the vectors are JSON");
        assert_eq!(value["request"], serde_json::from_str::<serde_json::Value>(request).unwrap());
        assert_eq!(value["params"]["seed"], 7);
        assert_eq!(value["cells"].as_array().map(Vec::len), Some(2));
        assert_eq!(value["systems"].as_array().map(Vec::len), Some(4));
        assert_eq!(value["cells"][1]["cell"]["x"], 3000);
        assert!(value["systems"][0]["star"]["key"]["cell"]["x"].as_i64().is_some_and(|x| x >= 3000));

        let bad = galaxy_through_buffers(r#"{"seed":-1}"#);
        let bad: serde_json::Value = serde_json::from_str(&bad).expect("the error is JSON");
        assert!(bad["error"].as_str().is_some_and(|e| e.contains("seed")), "{bad}");
    }
}
