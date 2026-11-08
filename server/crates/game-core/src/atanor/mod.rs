//! The Atanor puzzle engine (`packages/domain/src/atanor`): hex grid, molecules, arms, glyphs, the
//! tick pipeline with trajectory collisions, throughput measurement, building limits and the recipe
//! levels of the Fabryka atanorowa. Framework-free and deterministic like the TypeScript source:
//! no randomness, no time, every result a function of the level, the solution and the tick count.
//!
//! JavaScript semantics that reach the results are reproduced: `Math.round` in cube rounding,
//! fdlibm `sin`/`cos` (the `libm` crate, as V8) in the trajectory table, insertion order of maps.

pub mod api;
pub mod arm;
pub mod building;
pub mod engine;
pub mod glyph;
pub mod hex;
pub mod levels;
pub mod molecule;
pub mod pipeline;
pub mod recipes;
pub mod throughput;
pub mod trajectory;
pub mod types;

pub use api::*;
pub use arm::*;
pub use building::*;
pub use engine::*;
pub use glyph::*;
pub use hex::*;
pub use levels::*;
pub use molecule::*;
pub use recipes::*;
pub use throughput::*;
pub use trajectory::*;
pub use types::*;
