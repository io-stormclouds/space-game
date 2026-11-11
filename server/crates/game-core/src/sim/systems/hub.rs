//! The bridge between a world and the hubs of the galaxy (B6, plan 05-SOCIAL §3.2). `SHIP_TO_HUB` is a
//! player's order: the cargo leaves the body's storage at once and becomes a shipment that the galaxy
//! service carries to the hub. `HUB_DELIVERY` is a system command the server writes into the world's
//! log when a shipment from a hub arrives: the cargo lands in the body's storage. Both are logged
//! with their step like every command, so the replay stays exact; the world knows no hubs, prices or
//! credits.

use crate::models::body::BodyKind;
use crate::models::event::{DomainEvent, RejectReason};
use crate::models::resource::{Cost, can_afford, format_cost, missing_for, stock_total};
use crate::sim::reducer::WorldState;

/// Star the world's colonies are at (the origin of its shipments): its star body when the world has one.
pub fn home_star(world: &WorldState) -> Option<&str> {
    world.bodies.iter().find(|b| b.kind == BodyKind::Star).map(|b| b.name.as_str())
}

/// Amounts must be positive and finite; at least one.
fn valid_cargo(cargo: &Cost) -> bool {
    !cargo.is_empty() && cargo.values().all(|q| q.is_finite() && *q > 0.0) && stock_total(cargo) > 0.0
}

pub fn ship_to_hub(world: &WorldState, body_id: &str, hub_id: &str, cargo: &Cost) -> DomainEvent {
    if !world.structures.iter().any(|s| s.kind == "HQ" && s.body_id == body_id && s.is_working()) {
        return DomainEvent::rejected_with(RejectReason::NoColony, "wysyłka wymaga portu kosmicznego");
    }
    if hub_id.is_empty() || !valid_cargo(cargo) {
        return DomainEvent::rejected(RejectReason::NoResources);
    }
    let storage = world.storage_of(body_id);
    if !can_afford(&storage, cargo) {
        return DomainEvent::rejected_with(
            RejectReason::NoResources,
            format!("w magazynie brakuje {}", format_cost(&missing_for(&storage, cargo))),
        );
    }
    DomainEvent::ShipmentDeparted {
        shipment_id: format!("cargo-{}", world.next_id + 1),
        body_id: body_id.to_string(),
        hub_id: hub_id.to_string(),
        cargo: cargo.clone(),
    }
}

/// Whether a delivery can land on the body (the server checks this before it logs the command, and
/// gives the goods back to the hub when not).
pub fn can_deliver(world: &WorldState, body_id: &str, cargo: &Cost) -> bool {
    world.body(body_id).is_some() && valid_cargo(cargo)
}

pub fn hub_delivery(world: &WorldState, shipment_id: &str, body_id: &str, cargo: &Cost) -> DomainEvent {
    if !can_deliver(world, body_id, cargo) {
        return DomainEvent::rejected(RejectReason::NoColony);
    }
    DomainEvent::HubDelivered { shipment_id: shipment_id.to_string(), body_id: body_id.to_string(), cargo: cargo.clone() }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::command::Command;
    use crate::models::resource::qty;
    use crate::sim::scenarios::start_simulation;

    /// The canvas until the port stands (as the conformance replay `kanwa-pierwsza-sesja`).
    fn colony() -> crate::sim::simulation::Simulation {
        let mut sim = start_simulation("planeta-matka", None).unwrap();
        // the PoC preset has a working port on its planet from the start
        assert!(sim.world.structures.iter().any(|s| s.kind == "HQ" && s.is_working()), "preset has a port");
        sim.step(1.0);
        sim
    }

    #[test]
    fn cargo_leaves_for_the_hub_and_comes_back() {
        let mut sim = colony();
        let body = sim.world.structures.iter().find(|s| s.kind == "HQ").unwrap().body_id.clone();
        let have = sim.world.storage_of(&body);
        let (mat, q) = have.iter().find(|(_, q)| **q >= 10.0).map(|(m, q)| (m.clone(), *q)).expect("some stock");
        let cargo = qty([(mat.as_str(), 10.0)]);

        let out = sim.dispatch(&Command::ShipToHub { body_id: body.clone(), hub_id: "hub-sirius".into(), cargo: cargo.clone() });
        let DomainEvent::ShipmentDeparted { shipment_id, .. } = &out[0] else { panic!("{out:?}") };
        assert!(shipment_id.starts_with("cargo-"));
        assert_eq!(sim.world.storage_of(&body)[&mat], q - 10.0);

        let too_much = qty([(mat.as_str(), q * 10.0)]);
        let out = sim.dispatch(&Command::ShipToHub { body_id: body.clone(), hub_id: "hub-sirius".into(), cargo: too_much });
        assert!(
            matches!(&out[0], DomainEvent::CommandRejected { reason: RejectReason::NoResources, detail: Some(d), .. } if d.starts_with("w magazynie brakuje"))
        );
        let out =
            sim.dispatch(&Command::ShipToHub { body_id: body.clone(), hub_id: "hub-sirius".into(), cargo: qty([(mat.as_str(), -1.0)]) });
        assert!(out[0].is_rejection());

        let out = sim.dispatch(&Command::HubDelivery { shipment_id: "hub-1".into(), body_id: body.clone(), cargo: qty([("XYZ", 5.0)]) });
        assert!(matches!(out[0], DomainEvent::HubDelivered { .. }));
        assert_eq!(sim.world.storage_of(&body)["XYZ"], 5.0);
        let out = sim.dispatch(&Command::HubDelivery { shipment_id: "hub-2".into(), body_id: "nowhere".into(), cargo: cargo.clone() });
        assert!(out[0].is_rejection());
    }

    #[test]
    fn no_port_no_shipment() {
        let mut sim = start_simulation("tau-ceti", None).unwrap();
        let out = sim.dispatch(&Command::ShipToHub { body_id: "tc-e".into(), hub_id: "hub-sirius".into(), cargo: qty([("FER", 1.0)]) });
        assert!(matches!(&out[0], DomainEvent::CommandRejected { reason: RejectReason::NoColony, .. }));
        assert_eq!(home_star(&sim.world), Some("Tau Ceti"));
    }
}
