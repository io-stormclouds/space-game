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
//! `sg_galaxy(len)` is a test export outside `GameApi` (plan 08 E1-09, P-16 a): the galaxy generator
//! as text through the same two buffers, so that a test can compare the bytes of `wasm32` with the
//! vectors recorded natively ([`galaxy_vectors`]).

// `#[no_mangle]` exports and the two imports are the only unsafe parts; no raw pointer is dereferenced.
#![allow(unsafe_code)]

use std::cell::RefCell;

use game_core::galaxy::generator::{CellCoord, GalaxyParams, generate_system, stars_in_cell};
use game_session::{Host, HostOptions, Outgoing, SessionOptions, SyncMessage};
use serde_json::Value;

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

/// The galaxy generator as text (plan 08 E1-09): what `sg_galaxy` answers and what
/// `server/conformance` records natively as `vectors/galaxy-gen.json`.
///
/// Request: `{"params": GalaxyParams, "cells": [CellCoord], "systemCells": [CellCoord], "systems": n}`.
/// The text is one JSON document with one entry per line: the request as it was read, the stars of
/// every cell of `cells`, and the first `n` planetary systems of the stars of `systemCells` (cells in
/// the order given, stars by index; fewer when those cells hold fewer). Every entry is what
/// `serde_json::to_string` gives for the generator's value, so equal text means equal values.
pub fn galaxy_vectors(request: &str) -> Result<String, String> {
    let request: Value = serde_json::from_str(request).map_err(|e| format!("bad galaxy request: {e}"))?;
    let field = |name: &str| request.get(name).cloned().unwrap_or(Value::Null);
    let bad = |name: &str, e: serde_json::Error| format!("bad galaxy request, `{name}`: {e}");
    let params: GalaxyParams = serde_json::from_value(field("params")).map_err(|e| bad("params", e))?;
    let cells: Vec<CellCoord> = serde_json::from_value(field("cells")).map_err(|e| bad("cells", e))?;
    let system_cells: Vec<CellCoord> = serde_json::from_value(field("systemCells")).map_err(|e| bad("systemCells", e))?;
    let systems: u32 = serde_json::from_value(field("systems")).map_err(|e| bad("systems", e))?;

    let unwritable = |e: serde_json::Error| format!("galaxy vectors do not serialise: {e}");
    let request = format!(
        "{{\"params\":{},\"cells\":{},\"systemCells\":{},\"systems\":{systems}}}",
        serde_json::to_string(&params).map_err(unwritable)?,
        serde_json::to_string(&cells).map_err(unwritable)?,
        serde_json::to_string(&system_cells).map_err(unwritable)?,
    );

    let mut cell_lines = Vec::with_capacity(cells.len());
    for &cell in &cells {
        let stars = serde_json::to_string(&stars_in_cell(&params, cell)).map_err(unwritable)?;
        let cell = serde_json::to_string(&cell).map_err(unwritable)?;
        cell_lines.push(format!("{{\"cell\":{cell},\"stars\":{stars}}}"));
    }

    let mut system_lines = Vec::new();
    let mut left = systems;
    'cells: for &cell in &system_cells {
        for star in stars_in_cell(&params, cell) {
            if left == 0 {
                break 'cells;
            }
            // a register star has no generated system
            if let Some(system) = generate_system(&params, star.key) {
                system_lines.push(serde_json::to_string(&system).map_err(unwritable)?);
                left -= 1;
            }
        }
    }

    Ok(format!("{{\"request\":{request},\n\"cells\":[\n{}\n],\n\"systems\":[\n{}\n]}}\n", cell_lines.join(",\n"), system_lines.join(",\n")))
}

/// The galaxy generator for the conformance test of `wasm32` (plan 08 E1-09, P-16 a); not part of
/// `GameApi`, reads no game state. Takes the request in the input buffer (`len` bytes of JSON, see
/// [`galaxy_vectors`]); the result is the text of the vectors, or `{"error": …}` for a request that
/// cannot be read. Returns the result length.
#[unsafe(no_mangle)]
pub extern "C" fn sg_galaxy(len: usize) -> usize {
    with(|s| {
        let text = std::str::from_utf8(&s.input[..len.min(s.input.len())])
            .map_err(|e| format!("bad galaxy request: {e}"))
            .and_then(galaxy_vectors)
            .unwrap_or_else(|error| serde_json::json!({ "error": error }).to_string());
        s.output.clear();
        s.output.extend_from_slice(text.as_bytes());
        s.output.len()
    })
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

    #[test]
    fn galaxy_vectors_through_the_buffers() {
        let ask = |json: &str| {
            let _ = sg_input(json.len());
            with(|s| s.input.copy_from_slice(json.as_bytes()));
            let len = sg_galaxy(json.len());
            with(|s| String::from_utf8(s.output[..len].to_vec()).expect("utf-8"))
        };
        let far: Vec<CellCoord> = (2000..2008).map(|x| CellCoord { x, y: 0, z: 0 }).collect();
        let request = serde_json::json!({
            "params": GalaxyParams { seed: 7, ..GalaxyParams::default() },
            "cells": [{ "x": 0, "y": 0, "z": 0 }, far[0]],
            "systemCells": far,
            "systems": 3,
        })
        .to_string();

        // the export answers what the function gives: one document, an entry per line
        let text = ask(&request);
        assert_eq!(text, galaxy_vectors(&request).expect("vectors"));
        assert_eq!(text.lines().count(), 1 + 1 + 2 + 2 + 3 + 1);
        assert!(text.ends_with("]}\n"));
        let doc: Value = serde_json::from_str(&text).expect("json");
        // the request comes back as it was read, so the text names what it holds
        assert_eq!(doc["request"], serde_json::from_str::<Value>(&request).expect("json"));
        // Sol's cell starts with register stars; the far cells have generated stars only, each with a system
        assert!(doc["cells"][0]["stars"][0]["origin"]["real"].is_object());
        assert_eq!(doc["cells"][1]["cell"]["x"], 2000);
        let systems = doc["systems"].as_array().expect("systems");
        assert_eq!(systems.len(), 3);
        assert!(systems.iter().all(|s| s["star"]["origin"] == "generated" && s["star"]["key"]["cell"]["x"].as_i64() >= Some(2000)));

        // fewer systems than asked for when the cells hold fewer; none from register stars
        let few = galaxy_vectors(&request.replace("\"systems\":3", "\"systems\":100000")).expect("vectors");
        let few: Value = serde_json::from_str(&few).expect("json");
        let stars: usize = (2000..2008)
            .map(|x| stars_in_cell(&GalaxyParams { seed: 7, ..GalaxyParams::default() }, CellCoord { x, y: 0, z: 0 }).len())
            .sum();
        assert_eq!(few["systems"].as_array().map(Vec::len), Some(stars));

        // a request that cannot be read is an error text, not a panic
        for bad in ["", "{}", r#"{"params":1,"cells":[],"systemCells":[],"systems":0}"#] {
            let out: Value = serde_json::from_str(&ask(bad)).expect("json");
            assert!(out["error"].as_str().is_some_and(|e| e.starts_with("bad galaxy request")), "{out}");
        }
    }
}
