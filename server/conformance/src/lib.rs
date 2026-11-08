//! Conformance of `game-core` with the TypeScript domain (plan 02 §5): golden replays and numeric
//! vectors recorded by `web-game/tools/conformance/*.ts`, replayed here and compared.
//!
//! The binary (`conformance replay <dir>`, `conformance vectors <file>`) prints a report; the
//! integration tests in `tests/` run the same checks under `cargo test`.

pub mod bench;
pub mod compare;
pub mod replay;
pub mod vectors;
