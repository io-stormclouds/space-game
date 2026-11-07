import { BodyId } from '../../shared/ids';
import { crewShortfall, levelCeiling, powerShortfall } from '../economy/colony';
import { footprintTiles } from '../math/footprint';
import { DomainEvent, RejectReason } from '../models/domain-event.model';
import { PlanetGrid, Tile, TileId, tileId } from '../models/planet-grid.model';
import { Cost, addStock, canAfford, formatCost, missingFor, scaleStock } from '../models/resource.model';
import { Structure, StructureKind } from '../models/structure.model';
import { WorldState, storageOf } from '../reducer';
import { Rules } from '../rules';

export type BuildCheck = { ok: true; tiles: TileId[] } | { ok: false; reason: RejectReason; detail?: string };
type Fail = { ok: false; reason: RejectReason; detail?: string };

/** Share of the paid materials returned (doc 5.1): cancelled construction 75%, demolition 50%. */
export const CANCEL_REFUND = 0.75;
export const DEMOLISH_REFUND = 0.5;

const fmt = (n: number) => (Math.round(n * 10) / 10).toString().replace('.', ',');

/**
 * Validates and issues construction orders on surface tiles. The only place build rules live.
 * Unified rules (doc 5.1, Z3, Z4): materials come from the body's own storage; a rover builds it
 * over the build time (ConstructionSystem); power and crew are reserved at the order; no level
 * above the port (HQ).
 */
export class BuildSystem {
  constructor(
    private readonly grids: ReadonlyMap<BodyId, PlanetGrid>,
    private readonly rules: Rules,
  ) {}

  grid(bodyId: BodyId): PlanetGrid | undefined {
    return this.grids.get(bodyId);
  }

  tile(bodyId: BodyId, id: TileId): Tile | undefined {
    return this.grids.get(bodyId)?.tiles.find((t) => t.id === id);
  }

  /** Checks that do not depend on the tile: era, level cap, materials, power, crew, rover. Drives menu cards. */
  availability(world: WorldState, bodyId: BodyId, kind: StructureKind, level = 1): { ok: true } | Fail {
    if (!this.rules.has(kind)) return { ok: false, reason: 'NOT_BUILDABLE' };
    const spec = this.rules.spec(kind, level);
    if (level === 1 && !this.rules.isBuildable(kind)) return { ok: false, reason: 'NOT_BUILDABLE' };
    if (level > spec.maxLevel) return { ok: false, reason: 'MAX_LEVEL', detail: `L${spec.maxLevel}` };
    const cap = levelCeiling(world, bodyId);
    if (level > cap && kind !== 'HQ') return { ok: false, reason: 'LEVEL_CAP', detail: `port L${cap}` };
    if (!world.rovers.some((r) => r.bodyId === bodyId)) return { ok: false, reason: 'NO_ROVER' };
    const store = storageOf(world, bodyId);
    if (!canAfford(store, spec.cost)) {
      return { ok: false, reason: 'NO_RESOURCES', detail: `brakuje ${formatCost(missingFor(store, spec.cost))}` };
    }
    const power = powerShortfall(world, this.rules, bodyId, kind, level);
    if (power > 0) return { ok: false, reason: 'NO_POWER', detail: `brakuje ${fmt(power)} MW` };
    const crew = crewShortfall(world, this.rules, bodyId, kind, level);
    if (crew > 0) return { ok: false, reason: 'NO_CREW', detail: `brakuje ${Math.ceil(crew)} os.` };
    return { ok: true };
  }

  /** Full check for one anchor tile. */
  check(world: WorldState, bodyId: BodyId, anchor: TileId, kind: StructureKind, rotation = 0): BuildCheck {
    const grid = this.grids.get(bodyId);
    const tile = grid?.tiles.find((t) => t.id === anchor);
    if (!grid || !tile) return { ok: false, reason: 'NO_GRID' };
    if (!this.rules.has(kind) || !this.rules.isBuildable(kind)) return { ok: false, reason: 'NOT_BUILDABLE' };
    const spec = this.rules.spec(kind, 1);
    const indices = footprintTiles(grid, tile.index, spec.footprint, rotation);
    if (!indices) return { ok: false, reason: 'NO_FOOTPRINT', detail: `${spec.footprint} pól` };
    const tiles = indices.map((i) => tileId(bodyId, i));
    const occupied = new Set(world.structures.filter((s) => s.bodyId === bodyId).flatMap((s) => s.tiles));
    if (tiles.some((t) => occupied.has(t))) return { ok: false, reason: 'TILE_OCCUPIED' };
    const deposit = this.depositCheck(world, tile, kind);
    if (deposit) return deposit;
    if (spec.needsAtmosphere) {
      const body = world.bodies.find((b) => b.id === bodyId);
      if (body?.atmosphere !== 'dense') return { ok: false, reason: 'NO_ATMOSPHERE' };
    }
    const avail = this.availability(world, bodyId, kind);
    return avail.ok ? { ok: true, tiles } : avail;
  }

  /** Returns CONSTRUCTION_ORDERED (materials taken from the body's storage) or COMMAND_REJECTED. */
  build(world: WorldState, bodyId: BodyId, anchor: TileId, kind: StructureKind, time: number, rotation = 0): DomainEvent {
    const check = this.check(world, bodyId, anchor, kind, rotation);
    if (!check.ok) return { type: 'COMMAND_REJECTED', reason: check.reason, detail: check.detail };
    const cost = this.rules.spec(kind, 1).cost;
    return { type: 'CONSTRUCTION_ORDERED', structure: this.site(kind, bodyId, check.tiles, cost, time), cost };
  }

  /** A new construction site at level 0. */
  site(kind: StructureKind, bodyId: BodyId, tiles: TileId[], cost: Cost, time: number): Structure {
    const recipe = this.rules.processes(kind)[0]?.id;
    return {
      id: `${kind}@${tiles[0]}`,
      kind,
      bodyId,
      tileId: tiles[0]!,
      tiles,
      level: 0,
      targetLevel: 1,
      state: 'PLANNED',
      progress: 0,
      paid: cost,
      builtAt: time,
      ...(recipe ? { recipe, batch: null } : {}),
    };
  }

  /** Upgrade in place (doc 5.1): it keeps working at 50% while a rover builds the next level. */
  upgrade(world: WorldState, structureId: string): DomainEvent {
    const s = world.structures.find((x) => x.id === structureId);
    if (!s) return { type: 'COMMAND_REJECTED', reason: 'NO_STRUCTURE' };
    if (s.state !== 'ACTIVE') return { type: 'COMMAND_REJECTED', reason: 'BUSY' };
    const next = s.level + 1;
    const avail = this.availability(world, s.bodyId, s.kind, next);
    if (!avail.ok) return { type: 'COMMAND_REJECTED', reason: avail.reason, detail: avail.detail };
    return { type: 'UPGRADE_ORDERED', structureId, cost: this.rules.spec(s.kind, next).cost };
  }

  /** Cancels a construction or an upgrade, returning 75% of what it cost. */
  cancel(world: WorldState, structureId: string): DomainEvent {
    const s = world.structures.find((x) => x.id === structureId);
    if (!s) return { type: 'COMMAND_REJECTED', reason: 'NO_STRUCTURE' };
    if (s.state === 'ACTIVE') return { type: 'COMMAND_REJECTED', reason: 'BUSY' };
    return { type: 'CONSTRUCTION_CANCELLED', structureId, refund: scaleStock(s.paid, CANCEL_REFUND) };
  }

  /** Demolishes a working building, returning 50% of the materials of all its levels. */
  demolish(world: WorldState, structureId: string): DomainEvent {
    const s = world.structures.find((x) => x.id === structureId);
    if (!s) return { type: 'COMMAND_REJECTED', reason: 'NO_STRUCTURE' };
    if (s.state !== 'ACTIVE' || s.kind === 'HQ') return { type: 'COMMAND_REJECTED', reason: 'BUSY' };
    let spent: Cost = {};
    for (let L = 1; L <= s.level; L++) spent = addStock(spent, this.rules.spec(s.kind, L).cost);
    return { type: 'STRUCTURE_DEMOLISHED', structureId, refund: scaleStock(spent, DEMOLISH_REFUND) };
  }

  private depositCheck(world: WorldState, tile: Tile, kind: StructureKind): Fail | null {
    const extraction = this.rules.extraction(kind);
    if (extraction.length === 0) return null;
    const anywhere = this.rules.extractsAnywhere(kind);
    if (anywhere) return tile.deposit ? { ok: false, reason: 'NO_DEPOSIT', detail: 'wymaga pola bez złoża' } : null;
    const remaining = world.deposits[tile.id] ?? 0;
    const matches = tile.deposit && extraction.some((e) => e.material === tile.deposit!.resource);
    if (matches && remaining > 0) return null;
    const names = extraction.map((e) => this.rules.materialName(e.material)).join(', ');
    return { ok: false, reason: 'NO_DEPOSIT', detail: `wymaga złoża: ${names}` };
  }
}
