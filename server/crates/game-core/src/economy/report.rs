//! Rows of the economy document's tables (`report.ts`), for the F6 designer panel and the catalog.

use serde::{Deserialize, Serialize};

use super::model::Economy;
use crate::math::js;

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct MaterialRow {
    pub id: String,
    pub name: String,
    pub tier: String,
    /// Base value [kr], embodied energy [MW·min], machine time [min].
    #[serde(rename = "V")]
    pub v: f64,
    #[serde(rename = "E")]
    pub e: f64,
    #[serde(rename = "T")]
    pub t: f64,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct BuildingRow {
    pub id: String,
    pub name: String,
    pub era: u8,
    /// L1 cost with the era multiplier, valued in kr.
    pub cost_kr: f64,
    /// L1 build time [min].
    pub build_time: f64,
    /// L1 power [MW], positive produces.
    pub power: f64,
    /// L1 crew (negative = living space).
    pub crew: f64,
    /// Gross output value at L1 [kr/min]; 0 for buildings that make nothing.
    pub gross_out: f64,
    /// Payback of the L1 cost from its output [min]; null when it makes nothing.
    pub payback_min: Option<f64>,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AtanorRow {
    pub recipe_id: String,
    /// Minimum level of the Fabryka atanorowa.
    pub level: u32,
    pub product: String,
    pub cycles: f64,
    pub area: f64,
    pub arms: f64,
    /// Minutes per product batch and MW while running.
    pub time: f64,
    pub power: f64,
    /// Base value of the product [kr].
    pub product_value: f64,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct EraRow {
    pub era: u8,
    pub name: String,
    pub k: f64,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct EconomyTables {
    pub eras: Vec<EraRow>,
    pub materials: Vec<MaterialRow>,
    pub buildings: Vec<BuildingRow>,
    pub atanor: Vec<AtanorRow>,
}

/// `Math.round(n × 10^d) / 10^d`
pub fn round_to(n: f64, d: i32) -> f64 {
    let f = 10.0_f64.powi(d);
    js::round(n * f) / f
}

/// Rows of the document's tables for one economy. Pure.
pub fn economy_tables(eco: &Economy) -> EconomyTables {
    let materials = eco
        .materials()
        .iter()
        .map(|m| {
            let v = &eco.values[&m.id];
            MaterialRow {
                id: m.id.clone(),
                name: m.name.clone(),
                tier: m.tier.clone(),
                v: round_to(v.v, 3),
                e: round_to(v.e, 2),
                t: round_to(v.t, 2),
            }
        })
        .collect();
    let buildings = eco
        .buildings()
        .iter()
        .map(|b| {
            let cost_kr = eco.kr(&eco.cost(b, 1));
            let gross_out = eco.gross_out(b);
            BuildingRow {
                id: b.id.clone(),
                name: b.name.clone(),
                era: b.era,
                cost_kr: round_to(cost_kr, 1),
                build_time: round_to(eco.build_time(b, 1), 2),
                power: round_to(eco.power(b, 1), 2),
                crew: round_to(eco.crew(b, 1), 2),
                gross_out: round_to(gross_out, 3),
                payback_min: if gross_out > 0.0 { Some(round_to(cost_kr / gross_out, 1)) } else { None },
            }
        })
        .collect();
    let atanor = eco
        .recipes
        .iter()
        .filter(|r| r.atanor.is_some())
        .map(|r| {
            let product = r.out.keys().next().cloned().unwrap_or_default();
            let a = r.atanor.unwrap();
            AtanorRow {
                recipe_id: r.id.clone(),
                level: a.level,
                product: product.clone(),
                cycles: a.cycles,
                area: a.area,
                arms: a.arms,
                time: r.time,
                power: r.power,
                product_value: round_to(eco.values[&product].v, 3),
            }
        })
        .collect();
    let eras = eco
        .era_k
        .iter()
        .enumerate()
        .map(|(era, &k)| EraRow { era: era as u8, name: eco.catalog().era_names.get(era).cloned().unwrap_or_else(|| format!("E{era}")), k })
        .collect();
    EconomyTables { eras, materials, buildings, atanor }
}
