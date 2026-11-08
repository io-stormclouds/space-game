//! What happens the moment a ship arrives at a body (`docking-system.ts`). Transport ships unload
//! into the home base's storage (as much as fits, Z3) and refuel. The mothership keeps its hold: it
//! unloads by shuttle.

use crate::models::body::CelestialBody;
use crate::models::event::DomainEvent;
use crate::models::resource::{Stockpile, is_empty_stock};
use crate::models::ship::{ShipRole, Spacecraft};

pub fn on_arrival(ship: &Spacecraft, body: &CelestialBody, fit: impl Fn(&Stockpile) -> Stockpile) -> Vec<DomainEvent> {
    let mut events = Vec::new();
    if !body.is_home_base || ship.role != ShipRole::Ship {
        return events;
    }
    let cargo = fit(&ship.cargo);
    if !is_empty_stock(&cargo) {
        events.push(DomainEvent::CargoUnloaded { ship_id: ship.id.clone(), body_id: body.id.clone(), cargo });
    }
    if ship.fuel < ship.max_fuel {
        events.push(DomainEvent::Refueled { ship_id: ship.id.clone() });
    }
    events
}
