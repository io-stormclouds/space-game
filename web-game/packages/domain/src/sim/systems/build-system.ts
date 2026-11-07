import { BodyId } from '../../shared/ids';
import { powerBalance, powerShortfall } from '../economy/power';
import { DomainEvent, RejectReason } from '../models/domain-event.model';
import { PlanetGrid, Tile, TileId } from '../models/planet-grid.model';
import { RESOURCE_INFO, canAfford, formatCost, missingFor } from '../models/resource.model';
import { STRUCTURE_INFO, Structure, StructureKind } from '../models/structure.model';
import { WorldState } from '../reducer';

export type BuildCheck = { ok: true } | { ok: false; reason: RejectReason; detail?: string };

/** Validates and issues construction orders on surface tiles. Pure TypeScript. */
export class BuildSystem {
  constructor(private readonly grids: ReadonlyMap<BodyId, PlanetGrid>) {}

  grid(bodyId: BodyId): PlanetGrid | undefined {
    return this.grids.get(bodyId);
  }

  tile(bodyId: BodyId, tileId: TileId): Tile | undefined {
    return this.grids.get(bodyId)?.tiles.find((t) => t.id === tileId);
  }

  /** Checks that do not depend on the tile: resources and power. Drives the build menu cards. */
  availability(world: WorldState, bodyId: BodyId, kind: StructureKind): BuildCheck {
    const info = STRUCTURE_INFO[kind];
    if (!canAfford(world.stockpile, info.cost)) {
      return { ok: false, reason: 'NO_RESOURCES', detail: `brakuje ${formatCost(missingFor(world.stockpile, info.cost))}` };
    }
    const shortfall = powerShortfall(powerBalance(world.structures, bodyId), kind);
    if (shortfall > 0) return { ok: false, reason: 'NO_POWER', detail: `brakuje ${shortfall} mocy` };
    return { ok: true };
  }

  /** Full check for one tile. */
  check(world: WorldState, bodyId: BodyId, tileId: TileId, kind: StructureKind): BuildCheck {
    const tile = this.tile(bodyId, tileId);
    if (!tile) return { ok: false, reason: 'NO_GRID' };
    if (world.structures.some((s) => s.tileId === tileId)) return { ok: false, reason: 'TILE_OCCUPIED' };
    const info = STRUCTURE_INFO[kind];
    if (info.extracts) {
      const remaining = world.deposits[tileId] ?? 0;
      if (!tile.deposit || tile.deposit.resource !== info.extracts || remaining <= 0) {
        return { ok: false, reason: 'NO_DEPOSIT', detail: `wymaga złoża: ${RESOURCE_INFO[info.extracts].name}` };
      }
    }
    return this.availability(world, bodyId, kind);
  }

  /** Returns the STRUCTURE_BUILT event, or COMMAND_REJECTED when the check fails. */
  build(world: WorldState, bodyId: BodyId, tileId: TileId, kind: StructureKind, time: number): DomainEvent {
    const check = this.check(world, bodyId, tileId, kind);
    if (!check.ok) return { type: 'COMMAND_REJECTED', reason: check.reason, detail: check.detail };
    const structure: Structure = { id: `${kind}@${tileId}`, kind, bodyId, tileId, builtAt: time };
    return { type: 'STRUCTURE_BUILT', structure, cost: STRUCTURE_INFO[kind].cost };
  }
}
