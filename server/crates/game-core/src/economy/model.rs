//! Parametric economy model (`economy-model.ts`): material values, era multipliers and per-level
//! building data computed from the catalog. Pure; the same arithmetic in the same order as TS.

use std::collections::HashMap;

use indexmap::IndexMap;
use serde::{Deserialize, Serialize};

use super::catalog::{BuildingDef, Catalog, Material, RecipeData, catalog};
use crate::math::js;
use crate::models::resource::Qty;

/// Numbers of a running Atanor solution, measured in the building view.
#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq)]
pub struct AtanorMeasured {
    pub cycles: f64,
    pub area: f64,
    pub arms: f64,
}

/// Model parameters (docs/economy-expansion-design.md, Załącznik A). Changing them recomputes everything.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct EconomyParams {
    /// Price of energy [kr per MW·min].
    pub energy_price: f64,
    /// Machine-time cost [kr per machine-minute].
    pub machine_minute: f64,
    /// Ship-time cost for expeditions [kr per ship-minute].
    pub ship_minute: f64,
    pub cost_growth: f64,
    pub time_growth: f64,
    pub producer_power_growth: f64,
    pub consumer_power_growth: f64,
    pub crew_growth: f64,
    /// Growth of living space (HQ, Habitat): 10 → 17 → 29 → 49 → 84 (doc 4.5).
    pub living_space_growth: f64,
    pub storage_growth: f64,
    /// Target payback of an L1 production building per era [min]; sets the era multiplier k.
    pub payback_target_min: Vec<f64>,
    /// Atanor tick per factory level [min], index = level (0 unused).
    pub atanor_tick: Vec<f64>,
    /// Atanor base power at L1 [MW], ×`atanor_power_growth` per level, plus per hex and per arm.
    pub atanor_base_power: f64,
    pub atanor_power_growth: f64,
    pub atanor_power_per_hex: f64,
    pub atanor_power_per_arm: f64,
    /// Deployment of a machine [min per kr of new elements' materials] (AT4, A19).
    pub atanor_deploy_min_per_kr: f64,
    /// Measured Atanor solutions per recipe (F6, A3) replacing the doc §8.3 numbers.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub atanor: Option<IndexMap<String, AtanorMeasured>>,
}

impl Default for EconomyParams {
    fn default() -> Self {
        EconomyParams {
            energy_price: 0.1,
            machine_minute: 0.1,
            ship_minute: 1.0,
            cost_growth: 2.0,
            time_growth: 1.8,
            producer_power_growth: 1.6,
            consumer_power_growth: 1.45,
            crew_growth: 1.3,
            living_space_growth: 1.7,
            storage_growth: 1.8,
            payback_target_min: vec![8.0, 30.0, 120.0, 240.0, 480.0],
            atanor_tick: vec![0.0, 1.0, 0.9, 0.8, 0.7, 0.6],
            atanor_base_power: 6.0,
            atanor_power_growth: 1.45,
            atanor_power_per_hex: 0.5,
            atanor_power_per_arm: 1.0,
            atanor_deploy_min_per_kr: 0.1,
            atanor: None,
        }
    }
}

/// A recipe with its time and power resolved.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Recipe {
    #[serde(flatten)]
    pub data: RecipeData,
    pub time: f64,
    pub power: f64,
}

impl std::ops::Deref for Recipe {
    type Target = RecipeData;
    fn deref(&self) -> &RecipeData {
        &self.data
    }
}

/// Base value of a material: V [kr], embodied energy E [MW·min], machine time T [min], raw T0 inputs.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct MaterialValue {
    #[serde(rename = "V")]
    pub v: f64,
    #[serde(rename = "E")]
    pub e: f64,
    #[serde(rename = "T")]
    pub t: f64,
    pub raw: Qty,
}

/// Everything derived from the catalog for one set of parameters.
#[derive(Clone, Debug)]
pub struct Economy {
    pub params: EconomyParams,
    pub recipes: Vec<Recipe>,
    /// Base values from the primary process of each material.
    pub values: IndexMap<String, MaterialValue>,
    /// Values via alternative processes, keyed `recipeId:materialId`.
    pub alternatives: IndexMap<String, MaterialValue>,
    /// Era cost multipliers k, index = era.
    pub era_k: Vec<f64>,
    material_index: HashMap<String, usize>,
    recipe_index: HashMap<String, usize>,
    building_index: HashMap<String, (bool, usize)>,
    catalog: &'static Catalog,
}

pub fn add_qty(a: &mut Qty, b: &Qty, k: f64) {
    for (id, q) in b {
        let cur = a.get(id).copied().unwrap_or(0.0);
        a.insert(id.clone(), cur + q * k);
    }
}

fn resolve_recipe(r: &RecipeData, p: &EconomyParams) -> Recipe {
    if let Some(spec) = r.atanor {
        let measured = p.atanor.as_ref().and_then(|m| m.get(&r.id));
        let atanor = match measured {
            Some(m) => super::catalog::AtanorSpec { level: spec.level, cycles: m.cycles, area: m.area, arms: m.arms },
            None => spec,
        };
        let tick = p.atanor_tick.get(atanor.level as usize).copied().unwrap_or(1.0);
        let base = p.atanor_base_power * p.atanor_power_growth.powf(atanor.level as f64 - 1.0);
        let mut data = r.clone();
        data.atanor = Some(atanor);
        return Recipe {
            data,
            time: js::to_fixed_number(atanor.cycles * tick, 2),
            power: js::to_fixed_number(base + p.atanor_power_per_hex * atanor.area + p.atanor_power_per_arm * atanor.arms, 1),
        };
    }
    Recipe { data: r.clone(), time: r.time.unwrap_or(1.0), power: r.power.unwrap_or(0.0) }
}

/// Computes material values, era multipliers and per-level building data from the catalog. Pure.
pub fn compute_economy(params: EconomyParams) -> Economy {
    let cat = catalog();
    let p = &params;
    let recipes: Vec<Recipe> = cat.recipes.iter().map(|r| resolve_recipe(r, p)).collect();
    let mut val: IndexMap<String, MaterialValue> = IndexMap::new();
    let mut alt: IndexMap<String, MaterialValue> = IndexMap::new();

    let eval_recipe = |r: &Recipe, val: &IndexMap<String, MaterialValue>| -> Option<Vec<(String, MaterialValue)>> {
        let empty = Qty::new();
        let by = r.by.as_ref().unwrap_or(&empty);
        for id in r.inp.keys().chain(by.keys()) {
            if !val.contains_key(id) {
                return None;
            }
        }
        let ct = if r.ship_time == Some(true) { p.ship_minute } else { p.machine_minute };
        let mut v = r.power * r.time * p.energy_price + r.time * ct;
        let mut e = r.power * r.time;
        let mut t = r.time;
        let mut raw = Qty::new();
        for (id, q) in &r.inp {
            let mv = &val[id];
            v += q * mv.v;
            e += q * mv.e;
            t += q * mv.t;
            add_qty(&mut raw, &mv.raw, *q);
        }
        let mut shares: Qty = Qty::new();
        if let Some(co) = &r.co {
            for (id, q) in co {
                shares.insert(id.clone(), *q);
            }
        } else {
            let mut s = 0.0;
            for (id, q) in by {
                s += ((q * val[id].v) / v).min(0.9);
            }
            for id in r.out.keys() {
                shares.insert(id.clone(), 1.0 - s);
            }
        }
        let mut res = Vec::new();
        for (id, q) in &r.out {
            let share = shares.get(id).copied().unwrap_or(0.0);
            let mut rq = Qty::new();
            if r.inp.is_empty() {
                rq.insert(id.clone(), 1.0);
            } else {
                add_qty(&mut rq, &raw, share / q);
            }
            res.push((id.clone(), MaterialValue { v: (v * share) / q, e: (e * share) / q, t: (t * share) / q, raw: rq }));
        }
        Some(res)
    };

    let mut pending: Vec<&Recipe> = recipes.iter().filter(|r| r.primary).collect();
    let mut g = 0;
    while !pending.is_empty() && g < 50 {
        let mut next = Vec::new();
        for r in pending {
            match eval_recipe(r, &val) {
                None => next.push(r),
                Some(res) => {
                    for (id, mv) in res {
                        val.insert(id, mv);
                    }
                }
            }
        }
        pending = next;
        g += 1;
    }
    if !pending.is_empty() {
        panic!("unresolved recipes: {}", pending.iter().map(|r| r.id.as_str()).collect::<Vec<_>>().join(", "));
    }
    for r in recipes.iter().filter(|r| !r.primary) {
        for (id, mv) in eval_recipe(r, &val).expect("alternative recipe resolves") {
            alt.insert(format!("{}:{}", r.id, id), mv);
        }
    }

    let material_index = cat.materials.iter().enumerate().map(|(i, m)| (m.id.clone(), i)).collect();
    let recipe_index = recipes.iter().enumerate().map(|(i, r)| (r.id.clone(), i)).collect();
    let mut building_index: HashMap<String, (bool, usize)> = HashMap::new();
    for (i, b) in cat.buildings.iter().enumerate() {
        building_index.insert(b.id.clone(), (false, i));
    }
    for (i, b) in cat.vehicles.iter().enumerate() {
        building_index.insert(b.id.clone(), (true, i));
    }

    let mut eco = Economy {
        params,
        recipes,
        values: val,
        alternatives: alt,
        era_k: Vec::new(),
        material_index,
        recipe_index,
        building_index,
        catalog: cat,
    };

    let nice = |x: f64| -> f64 {
        let steps = [1.0, 1.5, 2.0, 3.0, 4.0, 5.0, 6.0, 8.0, 10.0, 12.0, 15.0, 20.0, 25.0, 30.0, 40.0, 50.0];
        steps.iter().fold(1.0_f64, |a, &s| if (s / x).ln().abs() < (a / x).ln().abs() { s } else { a })
    };
    let mut era_k = Vec::with_capacity(5);
    for e in 0..=4u8 {
        let mut pb: Vec<f64> = cat
            .buildings
            .iter()
            .filter(|b| b.era == e && b.explicit.is_none() && eco.gross_out(b) > 0.0)
            .map(|b| eco.kr(&eco.base_cost(b, 1)) / eco.gross_out(b))
            .collect();
        pb.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
        let med = pb.get(pb.len() / 2).copied().unwrap_or(f64::NAN);
        era_k.push(if e == 0 { 1.0 } else { nice(eco.params.payback_target_min.get(e as usize).copied().unwrap_or(1.0) / med) });
    }
    eco.era_k = era_k;
    eco
}

impl Economy {
    pub fn catalog(&self) -> &'static Catalog {
        self.catalog
    }

    pub fn materials(&self) -> &[Material] {
        &self.catalog.materials
    }

    pub fn buildings(&self) -> &[BuildingDef] {
        &self.catalog.buildings
    }

    pub fn vehicles(&self) -> &[BuildingDef] {
        &self.catalog.vehicles
    }

    pub fn material(&self, id: &str) -> &Material {
        let i = self.material_index.get(id).unwrap_or_else(|| panic!("unknown material {id}"));
        &self.catalog.materials[*i]
    }

    pub fn try_material(&self, id: &str) -> Option<&Material> {
        self.material_index.get(id).map(|&i| &self.catalog.materials[i])
    }

    pub fn recipe(&self, id: &str) -> &Recipe {
        let i = self.recipe_index.get(id).unwrap_or_else(|| panic!("unknown recipe {id}"));
        &self.recipes[*i]
    }

    pub fn try_recipe(&self, id: &str) -> Option<&Recipe> {
        self.recipe_index.get(id).map(|&i| &self.recipes[i])
    }

    /// A building or a vehicle by id.
    pub fn building(&self, id: &str) -> &BuildingDef {
        self.try_building(id).unwrap_or_else(|| panic!("unknown building {id}"))
    }

    pub fn try_building(&self, id: &str) -> Option<&BuildingDef> {
        self.building_index.get(id).map(|&(vehicle, i)| if vehicle { &self.catalog.vehicles[i] } else { &self.catalog.buildings[i] })
    }

    /// Value of an amount of materials [kr].
    pub fn kr(&self, q: &Qty) -> f64 {
        q.iter().fold(0.0, |s, (id, n)| s + n * self.values[id].v)
    }

    /// Cost of level L before the era multiplier.
    pub fn base_cost(&self, b: &BuildingDef, level: u32) -> Qty {
        if let Some(explicit) = &b.explicit {
            return explicit.get(level as usize - 1).cloned().unwrap_or_default();
        }
        let p = &self.params;
        let mut q = Qty::new();
        add_qty(&mut q, &b.c1, p.cost_growth.powf(level as f64 - 1.0));
        for k in 2..=level {
            if let Some(add) = b.extra_at(k) {
                add_qty(&mut q, add, p.cost_growth.powf((level - k) as f64));
            }
        }
        q
    }

    /// Cost of level L (rounded, with the era multiplier).
    pub fn cost(&self, b: &BuildingDef, level: u32) -> Qty {
        let mut q = self.base_cost(b, level);
        let k = if b.explicit.is_some() { 1.0 } else { self.era_k[b.era as usize] };
        for v in q.values_mut() {
            *v = js::round(*v * k);
        }
        q
    }

    /// Build time of level L [min].
    pub fn build_time(&self, b: &BuildingDef, level: u32) -> f64 {
        match &b.explicit_t {
            Some(t) => t[level as usize - 1],
            None => b.t1 * self.params.time_growth.powf(level as f64 - 1.0),
        }
    }

    /// Power of level L [MW], positive produces.
    pub fn power(&self, b: &BuildingDef, level: u32) -> f64 {
        let p = &self.params;
        if b.p1 > 0.0 {
            b.p1 * b.pg.unwrap_or(p.producer_power_growth).powf(level as f64 - 1.0)
        } else {
            b.p1 * p.consumer_power_growth.powf(level as f64 - 1.0)
        }
    }

    /// Crew of level L; negative provides living space.
    pub fn crew(&self, b: &BuildingDef, level: u32) -> f64 {
        let p = &self.params;
        b.crew * (if b.crew < 0.0 { p.living_space_growth } else { p.crew_growth }).powf(level as f64 - 1.0)
    }

    /// Gross output value at L1 [kr/min] (net of reactor fuel).
    pub fn gross_out(&self, b: &BuildingDef) -> f64 {
        let p = &self.params;
        if b.p1 > 0.0 && b.rec.is_none() {
            let mut fuel = 0.0;
            if b.id == "FIS" {
                fuel = self.values["PRE"].v / 120.0;
            }
            if b.id == "FUS" {
                fuel = self.values["KAP"].v / 300.0;
            }
            let ins = if b.id == "SAT" { 0.8 } else { 1.0 }; // beaming loss
            return b.p1 * ins * p.energy_price - fuel;
        }
        let Some(rec) = &b.rec else { return 0.0 };
        let r = self.recipe(rec);
        r.out.iter().fold(0.0, |s, (id, q)| s + q * self.values[id].v) / r.time
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::resource::qty;

    #[test]
    fn full_catalog_and_era_multipliers() {
        let eco = compute_economy(EconomyParams::default());
        assert_eq!(eco.values.len(), 37);
        assert_eq!(eco.era_k, vec![1.0, 4.0, 2.0, 1.5, 2.0]);
    }

    #[test]
    fn poc_values_and_canvas_numbers() {
        let eco = compute_economy(EconomyParams::default());
        let mine = eco.building("MIN");
        assert_eq!(eco.cost(mine, 1), qty([("FER", 15.0)]));
        assert_eq!(eco.power(mine, 1), -3.0);
        assert_eq!(eco.recipe("X_FER").time, 1.0);
        assert_eq!(eco.cost(eco.building("SOL"), 1), qty([("SIL", 10.0)]));
        let hq = eco.building("HQ");
        assert_eq!(eco.cost(hq, 3), qty([("FER", 2400.0), ("SIL", 1200.0), ("STA", 600.0), ("BEL", 300.0), ("UKL", 60.0)]));
        assert_eq!(eco.build_time(hq, 3), 120.0);
        let rov = eco.building("ROV");
        assert_eq!(eco.cost(rov, 1), qty([("FER", 20.0), ("SIL", 5.0)]));
        assert_eq!(eco.build_time(rov, 1), 3.0);
    }

    #[test]
    fn level_growth() {
        let eco = compute_economy(EconomyParams::default());
        let smt = eco.building("SMT");
        assert_eq!(eco.cost(smt, 1), qty([("FER", 160.0), ("SIL", 80.0)]));
        assert!((eco.build_time(smt, 2) - 18.0).abs() < 1e-9);
        assert!((eco.power(eco.building("SOL"), 5) - 41.76).abs() < 1e-2);
        assert!((eco.crew(eco.building("HAB"), 2) + 17.0).abs() < 1e-9);
        assert!((eco.crew(smt, 2) - 4.0 * 1.3).abs() < 1e-9);
    }

    #[test]
    fn atanor_recipes_and_parameter_changes() {
        let eco = compute_economy(EconomyParams::default());
        let nad = eco.recipe("A_NAD");
        assert_eq!(nad.time, 12.0);
        assert_eq!(nad.power, 12.5);
        let cheap = compute_economy(EconomyParams { payback_target_min: vec![8.0, 8.0, 120.0, 240.0, 480.0], ..EconomyParams::default() });
        assert!(cheap.era_k[1] < eco.era_k[1]);
        assert!(cheap.cost(cheap.building("SMT"), 1)["FER"] < 160.0);
    }
}
