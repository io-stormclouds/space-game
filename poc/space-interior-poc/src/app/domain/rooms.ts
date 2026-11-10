import type { RoomTypeId } from './catalog/catalog.types';
import { CELL, cellKey, cellSides, edgeKey, frontOf, parseCellKey, type EdgeRef, type XZ } from './grid';
import type { LayoutIndex } from './layout-index';

export interface RoomTypeInfo {
  readonly label: string;
  /** What makes a room this type (shown in the inspector). */
  readonly hint: string;
}

/** Order also breaks ties between equal scores. */
export const ROOM_TYPES: Readonly<Record<RoomTypeId, RoomTypeInfo>> = {
  bridge: { label: 'Mostek', hint: 'Konsola dowodzenia, hologram układu, monitory' },
  engineering: { label: 'Maszynownia', hint: 'Reaktor lub stosy zasilające' },
  quarters: { label: 'Kwatery', hint: 'Koje, kapsuły snu' },
  medbay: { label: 'Ambulatorium', hint: 'Biomonitory, komory kriogeniczne' },
  hydroponics: { label: 'Hydroponika', hint: 'Grządki i lampy wzrostowe' },
  mess: { label: 'Mesa', hint: 'Stoły mesy i krzesła' },
  briefing: { label: 'Sala odpraw', hint: 'Stół konferencyjny, ekran odpraw' },
  storage: { label: 'Magazyn energii', hint: 'Akumulatory' },
  stairwell: { label: 'Klatka schodowa', hint: 'Schody na pokład wyżej' },
  lift: { label: 'Winda', hint: 'Przystanek windy' },
  corridor: { label: 'Korytarz', hint: 'Pusty pas szerokości jednego pola' },
  generic: { label: 'Pomieszczenie', hint: 'Bez wyposażenia określającego funkcję' },
};

const TYPE_ORDER = Object.keys(ROOM_TYPES) as RoomTypeId[];
/** Minimum vote to give a room a function (one bed = 3, one chair = 1). */
const TYPE_THRESHOLD = 2.5;

export interface Room {
  /** Stable while the room keeps its smallest cell: "r<level>:<x>:<z>". */
  readonly id: string;
  readonly level: number;
  readonly cells: readonly XZ[];
  /** m² */
  readonly area: number;
  readonly doors: readonly EdgeRef[];
  /** Floor edges open to vacuum: no airtight element and nothing beyond. */
  readonly breaches: readonly EdgeRef[];
  /** Floor edges open to the deck below without a railing. */
  readonly drops: readonly EdgeRef[];
  readonly type: RoomTypeId;
  readonly scores: Readonly<Partial<Record<RoomTypeId, number>>>;
  /** Object pieces inside (floor, surface, ceiling, wall items facing in). */
  readonly pieces: readonly string[];
  /** Centre of the cells, metres. */
  readonly center: XZ;
}

/**
 * Rooms are flood fills of walkable cells; any edge element with `boundary` (wall, door, glass)
 * separates them, railings and empty edges do not. Computed per level from the index.
 */
export function computeRooms(index: LayoutIndex): Room[] {
  const floored = new Map<number, Set<string>>();
  const addCell = (key: string) => {
    const c = parseCellKey(key);
    if (!index.isFloored(c.level, c.x, c.z)) return;
    let set = floored.get(c.level);
    if (!set) floored.set(c.level, (set = new Set()));
    set.add(key);
  };
  for (const key of index.floors.keys()) addCell(key);
  for (const key of index.raised) addCell(key);

  const anchorOf = buildObjectAnchors(index);
  const rooms: Room[] = [];
  for (const [level, cells] of [...floored].sort((a, b) => a[0] - b[0])) {
    const seen = new Set<string>();
    const sorted = [...cells].sort();
    for (const start of sorted) {
      if (seen.has(start)) continue;
      const roomCells: XZ[] = [];
      const doors = new Map<string, EdgeRef>();
      const breaches: EdgeRef[] = [];
      const drops: EdgeRef[] = [];
      const queue = [start];
      seen.add(start);
      while (queue.length) {
        const key = queue.pop()!;
        const c = parseCellKey(key);
        roomCells.push({ x: c.x, z: c.z });
        for (const { edge, neighbor } of cellSides(level, c.x, c.z)) {
          const nKey = cellKey(level, neighbor.x, neighbor.z);
          const kind = index.edgeKindAt(edge);
          if (kind === 'door') doors.set(`${edge.axis}|${edge.x}|${edge.z}`, edge);
          if (cells.has(nKey)) {
            if (!index.isBoundary(edge) && !seen.has(nKey)) {
              seen.add(nKey);
              queue.push(nKey);
            }
            continue;
          }
          if (index.isSolid(level, neighbor.x, neighbor.z) || index.isAirtight(edge)) continue;
          if (index.stairTops.has(edgeKey(edge))) continue; // top of stairs: open on purpose
          if (level > 0 && index.isFloored(level - 1, neighbor.x, neighbor.z)) {
            if (kind !== 'railing') drops.push(edge);
            continue;
          }
          breaches.push(edge);
        }
      }
      rooms.push(finishRoom(index, level, roomCells, [...doors.values()], breaches, drops, anchorOf));
    }
  }
  return rooms;
}

/** Cell each object belongs to (wall items: the cell they face). */
function buildObjectAnchors(index: LayoutIndex): Map<string, string[]> {
  const map = new Map<string, string[]>();
  const add = (key: string, id: string) => {
    const list = map.get(key);
    if (list) list.push(id);
    else map.set(key, [id]);
  };
  for (const ip of index.pieces.values()) {
    const s = ip.shape;
    const { level, x, z, rot } = ip.piece;
    if (s.kind === 'object') {
      const cx = (s.rect.minX + s.rect.maxX) / 2;
      const cz = (s.rect.minZ + s.rect.maxZ) / 2;
      add(cellKey(level, Math.floor(cx / CELL), Math.floor(cz / CELL)), ip.piece.id);
    } else if (s.kind === 'wall-object') {
      const f = frontOf(rot);
      add(cellKey(level, Math.floor((x + f.x) / CELL), Math.floor((z + f.z) / CELL)), ip.piece.id);
    }
  }
  return map;
}

function finishRoom(
  index: LayoutIndex,
  level: number,
  cells: XZ[],
  doors: EdgeRef[],
  breaches: EdgeRef[],
  drops: EdgeRef[],
  anchorOf: Map<string, string[]>,
): Room {
  cells.sort((a, b) => a.x - b.x || a.z - b.z);
  const scores: Partial<Record<RoomTypeId, number>> = {};
  const vote = (tags: Partial<Record<RoomTypeId, number>> | undefined, w = 1) => {
    for (const [t, v] of Object.entries(tags ?? {}) as [RoomTypeId, number][]) scores[t] = (scores[t] ?? 0) + v * w;
  };
  const pieces: string[] = [];
  let sx = 0;
  let sz = 0;
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const c of cells) {
    sx += c.x;
    sz += c.z;
    minX = Math.min(minX, c.x);
    maxX = Math.max(maxX, c.x);
    minZ = Math.min(minZ, c.z);
    maxZ = Math.max(maxZ, c.z);
    vote(index.floorAt(level, c.x, c.z)?.item.entry.tags);
    for (const id of anchorOf.get(cellKey(level, c.x, c.z)) ?? []) {
      pieces.push(id);
      vote(index.get(id)?.item.entry.tags);
    }
  }
  let type: RoomTypeId = 'generic';
  let best = TYPE_THRESHOLD - 1e-9;
  for (const t of TYPE_ORDER) {
    const s = scores[t] ?? 0;
    if (s > best) {
      best = s;
      type = t;
    }
  }
  const narrow = Math.min(maxX - minX, maxZ - minZ) === 0 && cells.length >= 2;
  if (type === 'generic' && narrow) type = 'corridor';
  return {
    id: `r${level}:${cells[0].x}:${cells[0].z}`,
    level,
    cells,
    area: cells.length * CELL * CELL,
    doors,
    breaches,
    drops,
    type,
    scores,
    pieces,
    center: { x: (sx / cells.length + 0.5) * CELL, z: (sz / cells.length + 0.5) * CELL },
  };
}

/** How two rooms are joined. */
export type RoomLinkKind = 'door' | 'stairs' | 'lift';

/**
 * Rooms joined through doors, up and down stairs (when nothing closes the top) and along lift
 * shafts (stops in the same cell on adjacent decks). Open edges never split rooms anyway.
 */
export function roomGraph(index: LayoutIndex, rooms: readonly Room[]): Map<string, Set<string>> {
  const graph = new Map<string, Set<string>>(rooms.map((r) => [r.id, new Set<string>()]));
  for (const { a, b } of roomLinks(index, rooms)) {
    graph.get(a)!.add(b);
    graph.get(b)!.add(a);
  }
  return graph;
}

export function roomLinks(index: LayoutIndex, rooms: readonly Room[]): { a: string; b: string; kind: RoomLinkKind }[] {
  const roomOfCell = new Map<string, string>();
  for (const r of rooms) for (const c of r.cells) roomOfCell.set(cellKey(r.level, c.x, c.z), r.id);
  const at = (level: number, x: number, z: number) => roomOfCell.get(cellKey(level, x, z));
  const out: { a: string; b: string; kind: RoomLinkKind }[] = [];
  const link = (a: string | undefined, b: string | undefined, kind: RoomLinkKind) => {
    if (a && b && a !== b) out.push({ a, b, kind });
  };
  for (const r of rooms) {
    for (const d of r.doors) {
      const a = d.axis === 'x' ? { x: d.x, z: d.z - 1 } : { x: d.x - 1, z: d.z };
      // Each door is seen from both rooms; keep it once (from the room on its negative side).
      if (at(r.level, a.x, a.z) === r.id) link(r.id, at(r.level, d.x, d.z), 'door');
    }
  }
  for (const { link: s } of index.stairs) {
    if (!index.isPassable(s.topEdge) || !index.isPassable(s.bottomEdge)) continue;
    link(at(s.foot.level, s.foot.x, s.foot.z), at(s.landing.level, s.landing.x, s.landing.z), 'stairs');
  }
  for (const key of index.lifts.keys()) {
    const c = parseCellKey(key);
    if (index.lifts.has(cellKey(c.level + 1, c.x, c.z))) link(at(c.level, c.x, c.z), at(c.level + 1, c.x, c.z), 'lift');
  }
  return out;
}
