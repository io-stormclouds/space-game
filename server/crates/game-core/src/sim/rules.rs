//! Game-facing view of the economy catalog (`rules.ts`). Pure; one instance per simulation.

use std::borrow::Cow;
use std::collections::HashMap;

use indexmap::IndexMap;
use serde::{Deserialize, Serialize};

use crate::economy::{BuildingDef, Economy, EconomyParams, Recipe, StorageClass, StorageClassInfo, compute_economy};
use crate::ids::StructureKind;
use crate::models::resource::Cost;

/// Highest era whose buildings the player can build (W07 B: E0–E1 playable, the rest is data).
pub const PLAYABLE_ERA: u8 = 1;

/// Living-space/storage provided by the HQ (Port kosmiczny) at L1; the canvas shows 3600 at L2 = 2000 × 1.8.
pub const HQ_STORAGE_L1: f64 = 2000.0;
const HQ_STORAGE_CLASSES: [&str; 2] = ["sypkie", "sztukowe"];

/// P1: life support, cryogenics, magnetic traps. P3: logistics. Everything else P2 (doc 4.3).
const P1_KINDS: [&str; 3] = ["HAB", "CRY", "TRAP"];

/// 1, 2 or 3.
pub type PowerPriority = u8;

#[derive(Clone, Debug, PartialEq)]
pub struct Extraction {
    pub material: String,
    /// Units per minute at L1.
    pub rate: f64,
    pub recipe_id: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct StructureSpec {
    pub kind: StructureKind,
    pub name: String,
    pub era: u8,
    /// Tiles on the surface (1, 3, 7); 0 for orbital or vehicles.
    pub footprint: usize,
    pub max_level: u32,
    pub level: u32,
    pub cost: Cost,
    /// Minutes.
    pub build_time: f64,
    /// MW, positive produces. Solar is before insolation.
    pub power: f64,
    /// Crew it needs (positive) or living space it provides (negative).
    pub crew: f64,
    pub priority: PowerPriority,
    /// Output multiplier of this level (×1.6 per level).
    pub output_factor: f64,
    pub storage: IndexMap<StorageClass, f64>,
    pub is_solar: bool,
    pub needs_atmosphere: bool,
    pub is_landing_pad: bool,
    pub is_hq: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Default)]
pub struct LevelOverride {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cost: Option<Cost>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub time: Option<f64>,
}

/// Per-scenario changes of single levels, e.g. the Tau Ceti port L1 costs what the canvas shows.
pub type RuleOverrides = IndexMap<StructureKind, IndexMap<u32, LevelOverride>>;

#[derive(Clone, Debug)]
pub struct Rules {
    pub economy: Economy,
    overrides: RuleOverrides,
    /// Specs of every building and vehicle for levels 1..=max_l, computed once (the systems ask
    /// for them thousands of times per step on a large world).
    specs: HashMap<StructureKind, Vec<StructureSpec>>,
    classes: HashMap<String, StorageClass>,
    storage_by_building: HashMap<String, StorageClassInfo>,
    extraction: HashMap<StructureKind, Vec<Extraction>>,
    processes: HashMap<StructureKind, Vec<usize>>,
}

impl Default for Rules {
    fn default() -> Self {
        Rules::new(None, None)
    }
}

impl Rules {
    pub fn new(economy: Option<Economy>, overrides: Option<RuleOverrides>) -> Rules {
        let economy = economy.unwrap_or_else(|| compute_economy(EconomyParams::default()));
        let classes = economy.materials().iter().map(|m| (m.id.clone(), m.cls.clone())).collect();
        let storage_by_building = economy.catalog().storage_classes.iter().map(|s| (s.building.clone(), s.clone())).collect();
        let mut extraction = HashMap::new();
        let mut processes = HashMap::new();
        for b in economy.buildings().iter().chain(economy.vehicles().iter()) {
            let list: Vec<Extraction> = economy
                .recipes
                .iter()
                .filter(|r| r.building == b.name && r.inp.is_empty() && r.ship_time != Some(true))
                .flat_map(|r| {
                    r.out.iter().map(move |(material, q)| Extraction {
                        material: material.clone(),
                        rate: q / r.time,
                        recipe_id: r.id.clone(),
                    })
                })
                .collect();
            extraction.insert(b.id.clone(), list);
            let procs: Vec<usize> =
                economy.recipes.iter().enumerate().filter(|(_, r)| r.building == b.name && !r.inp.is_empty()).map(|(i, _)| i).collect();
            processes.insert(b.id.clone(), procs);
        }
        let mut rules = Rules {
            economy,
            overrides: overrides.unwrap_or_default(),
            specs: HashMap::new(),
            classes,
            storage_by_building,
            extraction,
            processes,
        };
        let mut specs = HashMap::new();
        for b in rules.economy.buildings().iter().chain(rules.economy.vehicles().iter()) {
            let list: Vec<StructureSpec> = (1..=b.max_l.max(1)).map(|l| rules.compute_spec(&b.id, l)).collect();
            specs.insert(b.id.clone(), list);
        }
        rules.specs = specs;
        rules
    }

    pub fn def(&self, kind: &str) -> &BuildingDef {
        self.economy.building(kind)
    }

    pub fn has(&self, kind: &str) -> bool {
        self.economy.try_building(kind).is_some()
    }

    pub fn class_of(&self, material: &str) -> StorageClass {
        self.classes.get(material).cloned().unwrap_or_else(|| "sztukowe".to_string())
    }

    pub fn material_name(&self, code: &str) -> String {
        self.economy.material(code).name.clone()
    }

    /// Spec of a building at a level (level 0 reads as 1): borrowed from the table, computed for
    /// levels beyond it.
    pub fn spec(&self, kind: &str, level: u32) -> Cow<'_, StructureSpec> {
        let l = level.max(1);
        match self.specs.get(kind).and_then(|v| v.get((l - 1) as usize)) {
            Some(s) => Cow::Borrowed(s),
            None => Cow::Owned(self.compute_spec(kind, level)),
        }
    }

    fn compute_spec(&self, kind: &str, level: u32) -> StructureSpec {
        let b = self.def(kind);
        let l = level.max(1);
        let o = self.overrides.get(kind).and_then(|m| m.get(&l));
        let fp: f64 = b.fp.parse().unwrap_or(f64::NAN);
        let p = &self.economy.params;
        let mut storage: IndexMap<StorageClass, f64> = IndexMap::new();
        let grow = p.storage_growth.powf(l as f64 - 1.0);
        if let Some(store) = self.storage_by_building.get(&b.name) {
            storage.insert(store.cls.clone(), store.cap * grow);
        }
        if kind == "HQ" {
            for c in HQ_STORAGE_CLASSES {
                storage.insert(c.to_string(), HQ_STORAGE_L1 * grow);
            }
        }
        StructureSpec {
            kind: kind.to_string(),
            name: b.name.clone(),
            era: b.era,
            footprint: if fp.is_finite() { fp as usize } else { 0 },
            max_level: b.max_l,
            level: l,
            cost: o.and_then(|o| o.cost.clone()).unwrap_or_else(|| self.economy.cost(b, l)),
            build_time: o.and_then(|o| o.time).unwrap_or_else(|| self.economy.build_time(b, l)),
            power: self.economy.power(b, l),
            crew: self.economy.crew(b, l),
            priority: if P1_KINDS.contains(&kind) {
                1
            } else if b.cat == "L" {
                3
            } else {
                2
            },
            output_factor: p.producer_power_growth.powf(l as f64 - 1.0),
            storage,
            is_solar: kind == "SOL",
            needs_atmosphere: kind == "WND",
            is_landing_pad: kind == "LAND" || kind == "HQ",
            is_hq: kind == "HQ",
        }
    }

    /// Surface building the player may order with BUILD (the HQ comes from PLACE_SPACEPORT).
    pub fn is_buildable(&self, kind: &str) -> bool {
        if !self.economy.buildings().iter().any(|b| b.id == kind) {
            return false;
        }
        let s = self.spec(kind, 1);
        s.footprint > 0 && s.era <= PLAYABLE_ERA && !s.is_hq
    }

    pub fn buildable_kinds(&self) -> Vec<StructureKind> {
        self.economy.buildings().iter().filter(|b| self.is_buildable(&b.id)).map(|b| b.id.clone()).collect()
    }

    /// Deposit materials an extractor can work, with L1 rates (Kopalnia: FER, KAR, KUP, TYT, URA).
    pub fn extraction(&self, kind: &str) -> &[Extraction] {
        self.extraction.get(kind).map(|v| v.as_slice()).unwrap_or(&[])
    }

    /// Regolith excavators work any tile without a deposit.
    pub fn extracts_anywhere(&self, kind: &str) -> Option<&Extraction> {
        self.extraction(kind).iter().find(|e| e.material == "REG")
    }

    /// Recipes with inputs the building runs at L1 (Huta: R_STA, R_MIE).
    pub fn processes(&self, kind: &str) -> Vec<&Recipe> {
        self.processes.get(kind).map(|v| v.iter().map(|&i| &self.economy.recipes[i]).collect()).unwrap_or_default()
    }

    pub fn recipe(&self, id: &str) -> &Recipe {
        self.economy.recipe(id)
    }

    /// Construction rover (ROV) or another vehicle at L1: (cost, build time).
    pub fn vehicle(&self, kind: &str) -> (Cost, f64) {
        let b = self.economy.building(kind);
        (self.economy.cost(b, 1), self.economy.build_time(b, 1))
    }
}
