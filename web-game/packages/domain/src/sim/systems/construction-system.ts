import { BodyId } from '../../shared/ids';
import { DomainEvent } from '../models/domain-event.model';
import { Structure, isSite } from '../models/structure.model';
import { WorldState, patchStructure } from '../reducer';
import { Rules } from '../rules';
import { RoverSystem, tileIndexOf } from './rover-system';

export interface ConstructionUpdate {
  /** World with construction progress advanced (no events for progress). */
  world: WorldState;
  events: DomainEvent[];
}

/**
 * Construction by rovers (doc 5.1): an idle rover takes the oldest site nobody works on, drives to
 * it (BFS over tiles) and builds for the build time. Rovers on the same site add up their speed
 * (canvas: "Dodaj łazik — skraca czas budowy"). Progress is state, so a saved game continues.
 */
export class ConstructionSystem {
  constructor(
    private readonly rules: Rules,
    private readonly rovers: RoverSystem,
  ) {}

  /** Orders that put idle rovers to work. Starts their drives as a side effect on RoverSystem. */
  assign(world: WorldState): DomainEvent[] {
    const events: DomainEvent[] = [];
    const taken = new Set(world.rovers.map((r) => r.job).filter((j): j is string => !!j));
    for (const rover of world.rovers) {
      if (rover.state !== 'IDLE' || rover.job) continue;
      const site = world.structures.find((s) => s.bodyId === rover.bodyId && isSite(s) && !taken.has(s.id));
      if (!site) continue;
      const order = this.sendTo(world, rover.id, site);
      if (!order.length) continue;
      taken.add(site.id);
      events.push(...order);
    }
    return events;
  }

  /** Assignment and drive for one rover; empty when the site is unreachable. */
  sendTo(world: WorldState, roverId: string, site: Structure): DomainEvent[] {
    const rover = world.rovers.find((r) => r.id === roverId);
    if (!rover || rover.bodyId !== site.bodyId) return [];
    const target = tileIndexOf(site.tileId);
    const allow = new Set(site.tiles.map(tileIndexOf));
    const path = this.rovers.findPath(site.bodyId, rover.tileIndex, target, world.structures, allow);
    if (!path) return [];
    const events: DomainEvent[] = [{ type: 'ROVER_ASSIGNED', roverId: rover.id, structureId: site.id }];
    if (path.length === 0) {
      events.push({ type: 'ROVER_ARRIVED', roverId: rover.id, tileIndex: rover.tileIndex });
    } else {
      this.rovers.start(rover, path);
      events.push({ type: 'ROVER_MOVE_ORDERED', roverId: rover.id, path });
    }
    return events;
  }

  /** Advances every site with building rovers; emits STARTED / BUILT / UPGRADED. */
  progress(world: WorldState, dt: number): ConstructionUpdate {
    const events: DomainEvent[] = [];
    let next = world;
    const crews = new Map<string, number>();
    for (const r of world.rovers) if (r.job && r.state === 'BUILDING') crews.set(r.job, (crews.get(r.job) ?? 0) + 1);

    for (const site of world.structures) {
      if (!isSite(site)) continue;
      const crew = crews.get(site.id) ?? 0;
      if (crew === 0) continue;
      if (site.state === 'PLANNED') {
        const roverId = world.rovers.find((r) => r.job === site.id && r.state === 'BUILDING')!.id;
        events.push({ type: 'CONSTRUCTION_STARTED', structureId: site.id, roverId });
      }
      const base = this.rules.spec(site.kind, site.targetLevel).buildTime;
      // terrain under a new building (T8); upgrades take the catalog time
      const time = site.level === 0 && site.timePct !== undefined ? (base * site.timePct) / 100 : base;
      const progress = time <= 0 ? 1 : Math.min(1, site.progress + (dt * crew) / time);
      if (progress >= 1) {
        events.push(this.finished(site));
      } else {
        next = patchStructure(next, site.id, (s) => ({ ...s, progress }));
      }
    }
    return { world: next, events };
  }

  private finished(site: Structure): DomainEvent {
    if (site.level > 0) return { type: 'STRUCTURE_UPGRADED', structureId: site.id, level: site.targetLevel };
    // the terrain time applies to the first construction only
    const { timePct: _, ...built } = site;
    return {
      type: 'STRUCTURE_BUILT',
      structure: { ...built, state: 'ACTIVE', level: site.targetLevel, progress: 0, paid: {} },
      cost: site.paid,
    };
  }

  /** Sites of a body and the rovers on them, for the UI. */
  sitesOn(world: WorldState, bodyId: BodyId): Array<{ site: Structure; rovers: number }> {
    return world.structures
      .filter((s) => s.bodyId === bodyId && isSite(s))
      .map((site) => ({ site, rovers: world.rovers.filter((r) => r.job === site.id).length }));
  }
}
