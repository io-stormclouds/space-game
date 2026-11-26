//! Conformance of `game-core` with the TypeScript domain (plan 02 §5): golden replays and numeric
//! vectors recorded by `web-game/tools/conformance/*.ts`, replayed here and compared.
//!
//! The binary (`conformance replay <dir>`, `conformance vectors <file>`) prints a report; the
//! integration tests in `tests/` run the same checks under `cargo test`.
//!
//! `galaxy` is Rust against Rust: the text of the galaxy generator recorded natively, which the
//! `wasm32` build has to repeat byte for byte (plan 08 E1-09).

pub mod bench;
pub mod compare;
pub mod galaxy;
pub mod replay;
pub mod vectors;
