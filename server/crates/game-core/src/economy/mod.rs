//! Economy catalog and model (`economy/*.ts`). The catalog data is one JSON file exported from the
//! TypeScript source of truth (`catalog-data.ts`) until the TOML move of plan 02 §5.3.

pub mod catalog;
pub mod model;
pub mod report;

pub use catalog::*;
pub use model::*;
pub use report::*;
