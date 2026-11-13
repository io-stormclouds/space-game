//! Deterministic galaxy generator: stars of a cell, the planetary system of a star, the habitable
//! zone, conversion to world bodies and the placement of new accounts (plan 08, stage E1; plan 07 §5).
//!
//! STATUS: the contract of the pilot. The types, signatures and documented behaviour of this module
//! are fixed by task E1-01 and are the same for every team; the bodies are written by E1-03 … E1-08.
//! The acceptance tests are `tests/galaxy_gen.rs`.
//!
//! Rules for every function here:
//! - pure: the result depends on the arguments only (no globals, caches that change results, clock,
//!   I/O, thread or address dependent order); calls can come in any order and from any thread;
//! - randomness only through [`Rng`], keyed by the galaxy seed and the cell;
//! - integers of fixed width in everything that reaches a result (`usize` only for indexing);
//! - floating point: `+ - × ÷` and `sqrt` are exact in IEEE 754 and may be used directly; every
//!   other function (`ln`, `exp`, `pow`, `sin`, `cos`, …) comes from the `libm` crate, never from
//!   the `f64` methods, whose results differ between platforms (R-10). The same bytes must come out
//!   natively and on `wasm32`;
//! - maps in results keep insertion order (`IndexMap`); never iterate a `HashMap` into a result.
//!
//! Units: galaxy positions in light years with Sol at the origin (the register's parsecs ×
//! [`LY_PER_PARSEC`]); inside a system the game units of the existing worlds, where an orbit of 900
//! around a star of 1 L☉ has insolation 1; angles in radians; time in model minutes.
//!
//! Out of scope of the pilot: terrain and biomes of generated planets, identifiers of stars for the
//! market and the server (E3-01), start criteria beyond "has a landable planet" (E4-02), gas giants
//! as world bodies (E6-01), moons of rocky planets as world bodies (P-19 a: data of the spec only).
//!
//! [`LY_PER_PARSEC`]: crate::galaxy::stars::LY_PER_PARSEC

pub mod params;
pub mod rng;

use indexmap::IndexMap;
use serde::{Deserialize, Serialize};

pub use params::*;
pub use rng::Rng;

use crate::models::body::{Atmosphere, BodyProfile, CelestialBody};

/// A cubic cell of the galaxy; see [`GalaxyParams::cell_ly`].
#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub struct CellCoord {
    pub x: i32,
    pub y: i32,
    pub z: i32,
}

/// A star: its cell and its position in [`stars_in_cell`] of that cell.
#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub struct StarKey {
    pub cell: CellCoord,
    pub index: u16,
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum StarOrigin {
    /// One of the 41 stars of the register (`galaxy::stars::STARS`), by its `id`.
    Real {
        id: u32,
    },
    Generated,
}

/// A star of the galaxy.
///
/// A register star repeats the register: `name`, `luminosity`, `mass`, `radius` and `temperature`
/// unchanged, `pos_ly` = `Star::pos` × `LY_PER_PARSEC` per axis, `color` = the register's `#RRGGBB`,
/// `class` = the first letter of the register's spectral class when it is one of O B A F G K M,
/// otherwise `None` (brown and white dwarfs).
///
/// A generated star has `class` = one of [`GalaxyParams::classes`] with a positive share, its four
/// parameters inside that class's bounds, the class's colour, a position inside its cell and a
/// non-empty `name` (a catalogue designation that depends on the key only; its format is provisional
/// until E3-01).
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct StarSpec {
    pub key: StarKey,
    pub origin: StarOrigin,
    pub name: String,
    /// Light years from Sol.
    pub pos_ly: [f64; 3],
    pub class: Option<SpectralClass>,
    /// Solar luminosities.
    pub luminosity: f64,
    /// Solar masses.
    pub mass: f64,
    /// Solar radii.
    pub radius: f64,
    /// Kelvin.
    pub temperature: f64,
    /// 0xRRGGBB.
    pub color: u32,
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum PlanetKind {
    /// Has a surface: can be landed on and built on.
    Rocky,
    /// No surface, no landing (Q23 c).
    GasGiant,
}

/// The surface of a landable body: what `SurfaceGrid` needs.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SurfaceSpec {
    /// Goldberg frequency n; tiles = 10·n² + 2.
    pub grid_frequency: u32,
    /// A whole number in 0 ..= 2^31 − 1 (`math::noise::hash3` reads the seed as an `i32`).
    pub deposit_seed: f64,
    /// Relative weights of the deposit materials: at least one entry, every weight positive.
    pub deposit_weights: IndexMap<String, f64>,
}

/// A moon of a planet: of a gas giant, or the bonus moon of a rocky planet. Orbit values are relative
/// to the planet.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct MoonSpec {
    pub orbit_radius: f64,
    /// Radians per model minute, positive.
    pub orbit_speed: f64,
    /// In [0, 2π).
    pub initial_angle: f64,
    pub radius: f64,
    pub atmosphere: Atmosphere,
    /// 0xRRGGBB.
    pub color: u32,
    /// `Some` when the moon can be landed on; then `grid_frequency` is in 1 ..= `grid_frequency.max`.
    /// Always `None` for the moon of a rocky planet (no grid in the pilot).
    pub surface: Option<SurfaceSpec>,
    pub profile: BodyProfile,
}

/// A planet of a generated system.
///
/// Rocky: `surface` is `Some`, with `grid_frequency` inside [`SystemParams::grid_frequency`] and deposit
/// materials from [`SystemParams::deposits`] (weights inside the material's bounds);
/// `radius` = `radius_per_frequency` × `grid_frequency`. Moons (the human's rule, E1-01 question 3 = b):
/// every rocky planet draws on its own, from the key like everything else; with probability
/// [`SystemParams::rocky_moon_share`] it has exactly [`SystemParams::rocky_moon_count`] moons,
/// otherwise none. Such a moon is data only: its `surface` is `None`.
///
/// Gas giant (P-47 a): only around a star whose class is in [`SystemParams::giant_classes`];
/// `insolation` below `snow_line_insolation`; `radius` inside `giant_radius`; `surface` is `None`;
/// the number of moons inside `giant_moons`; never the home of a civilisation.
///
/// `profile` is content data in Polish like the profiles of Tau Ceti: `kind` is not empty, `rating`
/// is one of "zalecana", "średni", "trudny", "wyprawy", `deposits` lists catalog raw materials
/// (for a rocky planet: at least the materials of `surface.deposit_weights`), and
/// `shuttle_launch_fuel` stays `None` (an economy number; the generator does not invent it).
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PlanetSpec {
    pub kind: PlanetKind,
    /// Around the star, inside [`SystemParams::orbit_radius`].
    pub orbit_radius: f64,
    /// Radians per model minute, positive; a farther planet of the same system is slower.
    pub orbit_speed: f64,
    /// In [0, 2π).
    pub initial_angle: f64,
    pub radius: f64,
    /// Star luminosity × (900 / `orbit_radius`)²: what the default rule of `CelestialBody::insolation` gives.
    pub insolation: f64,
    pub atmosphere: Atmosphere,
    /// 0xRRGGBB.
    pub color: u32,
    pub surface: Option<SurfaceSpec>,
    pub profile: BodyProfile,
    /// By growing orbit; the moons' discs neither touch the planet nor each other.
    pub moons: Vec<MoonSpec>,
    /// The planet is the home of a native civilisation (Q36 a: data only). At most one per system, always rocky.
    pub native_civilization: bool,
}

/// The belt of a system: mining expeditions, no building (like Tau Ceti's dust belt).
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct BeltSpec {
    /// Around the star, inside [`SystemParams::orbit_radius`].
    pub orbit_radius: f64,
    /// Radians per model minute, positive.
    pub orbit_speed: f64,
    /// In [0, 2π).
    pub initial_angle: f64,
    /// Radius of the belt's body on the scene, positive.
    pub radius: f64,
    /// Star luminosity × (900 / `orbit_radius`)².
    pub insolation: f64,
    /// 0xRRGGBB.
    pub color: u32,
    /// `deposits` lists materials of [`SystemParams::belt_deposits`]; `shuttle_launch_fuel` is `None`.
    pub profile: BodyProfile,
}

/// The planetary system of a generated star.
///
/// - `planets` are sorted by strictly growing `orbit_radius`, at most `max_planets` of them; the
///   number differs between systems, and some systems have three planets or more;
/// - a system with planets and without a gas giant has a rocky planet (there is no third kind);
/// - at least one system in a hundred has two rocky planets or more (the acceptance test of the moons
///   needs such systems to see that the planets of one system draw independently);
/// - no two bodies touch: with the reach of a planet = its radius, or the largest
///   `orbit_radius + radius` of its moons, `star_body_radius < r₀ − reach₀` and
///   `rᵢ + reachᵢ < rᵢ₊₁ − reachᵢ₊₁`;
/// - the shares of [`SystemParams`] (`empty_share`, `giant_share`, `belt_share`, `civilization_share`)
///   hold over many systems, and `rocky_moon_share` over many rocky planets.
///
/// The spec is complete: [`system_bodies`] needs nothing else.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SystemSpec {
    pub star: StarSpec,
    /// Radius of the star's body on the scene, inside [`SystemParams::star_body_radius`].
    pub star_body_radius: f64,
    pub planets: Vec<PlanetSpec>,
    pub belt: Option<BeltSpec>,
}

/// Orbit radii between which the insolation lies inside [`ZoneLimits`] (game units).
#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq)]
pub struct HabitableZone {
    pub inner: f64,
    pub outer: f64,
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq, Hash)]
#[serde(rename_all = "camelCase")]
pub enum ZoneLabel {
    /// Closer to the star than the zone.
    Hot,
    /// `inner <= orbit <= outer`.
    Habitable,
    /// Farther than the zone.
    Cold,
}

/// The cell that holds a position: `floor(pos / cell_ly)` on each axis (task E1-04).
#[expect(unused_variables, reason = "skeleton: E1-04 implements it")]
pub fn cell_of(p: &GalaxyParams, pos_ly: [f64; 3]) -> CellCoord {
    unimplemented!("E1-04")
}

/// Every star of a cell (task E1-04).
///
/// First the register stars whose position lies in the cell, in register order, described as
/// [`StarSpec`] says; then the generated stars. `key.index` of each star is its index in the result.
///
/// The number of generated stars has the mean [`GalaxyParams::stars_per_cell`] in a cell that no
/// register star is near, and each of them takes its class with probability share / Σ shares. A
/// generated star never lies closer than `min_real_separation_ly` to a register star: such a
/// candidate is left out, so cells near register stars hold fewer.
#[expect(unused_variables, reason = "skeleton: E1-04 implements it")]
pub fn stars_in_cell(p: &GalaxyParams, cell: CellCoord) -> Vec<StarSpec> {
    unimplemented!("E1-04")
}

/// The planetary system of a generated star (task E1-05; plan 07 §5: `generate_system(seed, coords)`).
///
/// `None` when the cell has no star with this index, and for register stars: their systems are
/// authored content (Tau Ceti) or do not exist yet (P-17 a keeps the 41 stars as they are).
///
/// The result does not depend on which other stars, cells or systems were generated before.
#[expect(unused_variables, reason = "skeleton: E1-05 implements it")]
pub fn generate_system(p: &GalaxyParams, star: StarKey) -> Option<SystemSpec> {
    unimplemented!("E1-05")
}

/// The habitable zone of a star (task E1-06, G-22): `inner` = 900 × √(L / `inner_insolation`),
/// `outer` = 900 × √(L / `outer_insolation`). A calculation only: no rule and no biome reads it.
#[expect(unused_variables, reason = "skeleton: E1-06 implements it")]
pub fn habitable_zone(limits: &ZoneLimits, luminosity: f64) -> HabitableZone {
    unimplemented!("E1-06")
}

impl HabitableZone {
    /// Where an orbit lies: `Hot` below `inner`, `Cold` above `outer`, `Habitable` between, edges included (task E1-06).
    #[expect(unused_variables, reason = "skeleton: E1-06 implements it")]
    pub fn label(&self, orbit_radius: f64) -> ZoneLabel {
        unimplemented!("E1-06")
    }
}

impl SystemSpec {
    /// The zone label of every planet, in the order of `planets` (task E1-06). Computed on demand, so
    /// a stored system follows a later change of the limits.
    #[expect(unused_variables, reason = "skeleton: E1-06 implements it")]
    pub fn planet_zones(&self, limits: &ZoneLimits) -> Vec<ZoneLabel> {
        unimplemented!("E1-06")
    }
}

/// The world bodies of a system (task E1-07), ready for `OrbitSolver`, `insolation_of` and `build_world_grids`.
///
/// Order: the star, the rocky planets by growing orbit, the belt. Gas giants and their moons are
/// left out until `BodyKind` knows them (E6-01); the moons of rocky planets are left out too (P-19 a:
/// the spec describes them, the pilot's worlds do not hold them).
///
/// - star: `BodyKind::Star`, no parent, `radius` = `star_body_radius`, `luminosity` = the star's,
///   `name` and `color` of the star;
/// - rocky planet: `BodyKind::Planet`, parent = the star, orbit, radius, colour, atmosphere and
///   profile of the spec, `surface_grid` with the spec's frequency, deposit seed and weights and no terrain;
/// - belt: `BodyKind::Belt`, parent = the star, orbit, radius, colour and profile of the spec, no grid;
/// - `id` values are not empty, unique within the system and depend on the spec only; `name` is not empty;
/// - `insolation` may stay `None` (the default rule gives the spec's value) or repeat the spec's value;
/// - `revealed` and `unknown_name` stay `None` (what the start scan hides is decided in E4), and so
///   do `is_home_base` (false), `resources` and `shape`.
#[expect(unused_variables, reason = "skeleton: E1-07 implements it")]
pub fn system_bodies(spec: &SystemSpec) -> Vec<CelestialBody> {
    unimplemented!("E1-07")
}

/// The start star of a new account (task E1-08, P-18 a).
///
/// Offers only generated stars that are not in `occupied` and whose system has a landable planet
/// (a planet with a surface). With no occupied system the star lies within `max_ly` of `origin_ly`;
/// otherwise the distance from the star to the nearest occupied star is at least `min_ly` and at
/// most `max_ly`. `None` when no such star exists.
///
/// The result depends on the set of occupied stars, not on their order. Keys in `occupied` that
/// name no star are ignored.
#[expect(unused_variables, reason = "skeleton: E1-08 implements it")]
pub fn place_account(p: &GalaxyParams, occupied: &[StarKey], rules: &PlacementParams) -> Option<StarKey> {
    unimplemented!("E1-08")
}
