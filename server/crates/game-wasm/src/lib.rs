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
}
