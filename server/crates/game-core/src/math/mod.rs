//! Deterministic geometry and numerics of the game (`sim/math/*.ts`).

pub mod asteroid;
pub mod bezier;
pub mod deposits;
pub mod footprint;
pub mod geodesic;
pub mod goldberg;
pub mod js;
pub mod lead;
pub mod noise;
pub mod orbit;
pub mod vec3;

pub use asteroid::*;
pub use bezier::*;
pub use deposits::*;
pub use footprint::*;
pub use geodesic::*;
pub use goldberg::*;
pub use lead::*;
pub use noise::*;
pub use orbit::*;
pub use vec3::*;
