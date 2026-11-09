import { cellKey, edgeCells, edgeCenter, parseCellKey, rectsOverlap, type EdgeRef, type Rect, type StairsLink, type XZ } from './grid';
import type { LayoutIndex } from './layout-index';
import { roomGraph, ROOM_TYPES, type Room } from './rooms';
import { checkPlacement } from './rules';

export type Severity = 'error' | 'warning' | 'info';

export type IssueCode =
  | 'HULL_BREACH'
  | 'NO_RAILING'
  | 'DOOR_TO_VOID'
  | 'ROOM_NO_DOOR'
  | 'ROOM_CUT_OFF'
  | 'BAD_PLACEMENT'
  | 'DOOR_BLOCKED'
  | 'ORPHAN_EDGE'
  | 'STAIRS_BROKEN'
  | 'LIFT_SINGLE'
  | 'UNKNOWN_ITEM';

export interface Issue {
  readonly id: string;
  readonly code: IssueCode;
  readonly severity: Severity;
  readonly title: string;
  readonly detail: string;
  readonly level: number;
  /** Where to look (metres). */
  readonly at: XZ;
  readonly edges: readonly EdgeRef[];
  readonly pieces: readonly string[];
  readonly roomId?: string;
}

const SEVERITY_ORDER: Record<Severity, number> = { error: 0, warning: 1, info: 2 };

/** Door clearance: 1.8 m wide, 1.5 m deep on each side of the door edge. */
const DOOR_CLEAR_HALF_WIDTH = 0.9;
const DOOR_CLEAR_DEPTH = 1.5;

/**
 * Design rules that do not block editing but matter to the ship: airtight hull, reachable rooms,
 * doors that lead somewhere, objects that still fit after later edits.
 */
export function computeIssues(index: LayoutIndex, rooms: readonly Room[]): Issue[] {
  const issues: Issue[] = [];
  const push = (i: Omit<Issue, 'id'>) => issues.push({ ...i, id: `${i.code}:${i.roomId ?? i.pieces[0] ?? `${i.at.x},${i.at.z}`}` });

  for (const r of rooms) {
    const name = `${ROOM_TYPES[r.type].label} (${r.area} m²)`;
    if (r.breaches.length) {
      push({
        code: 'HULL_BREACH',
        severity: 'error',
        title: 'Nieszczelny kadłub',
        detail: `${name}: ${r.breaches.length} ${plural(r.breaches.length, 'krawędź otwarta', 'krawędzie otwarte', 'krawędzi otwartych')} na próżnię. Postaw ścianę, szkło lub drzwi.`,
        level: r.level,
        at: edgeCenter(r.breaches[0]),
        edges: r.breaches,
        pieces: [],
        roomId: r.id,
      });
    }
    if (r.drops.length) {
      push({
        code: 'NO_RAILING',
        severity: 'warning',
        title: 'Brak barierki',
        detail: `${name}: ${r.drops.length} ${plural(r.drops.length, 'krawędź', 'krawędzie', 'krawędzi')} nad niższym pokładem bez barierki.`,
        level: r.level,
        at: edgeCenter(r.drops[0]),
        edges: r.drops,
        pieces: [],
        roomId: r.id,
      });
    }
  }

  // Reachability: rooms joined by doors; everything should reach the largest group.
  if (rooms.length > 1) {
    const graph = roomGraph(index, rooms);
    const byId = new Map(rooms.map((r) => [r.id, r]));
    const groups: Room[][] = [];
    const seen = new Set<string>();
    for (const r of rooms) {
      if (seen.has(r.id)) continue;
      const group: Room[] = [];
      const stack = [r.id];
      seen.add(r.id);
      while (stack.length) {
        const id = stack.pop()!;
        group.push(byId.get(id)!);
        for (const n of graph.get(id) ?? []) {
          if (!seen.has(n)) {
            seen.add(n);
            stack.push(n);
          }
        }
      }
      groups.push(group);
    }
    const area = (g: Room[]) => g.reduce((s, r) => s + r.area, 0);
    groups.sort((a, b) => area(b) - area(a));
    for (const g of groups.slice(1)) {
      for (const r of g) {
        const noDoor = r.doors.length === 0;
        push({
          code: noDoor ? 'ROOM_NO_DOOR' : 'ROOM_CUT_OFF',
          severity: 'warning',
          title: noDoor ? 'Pomieszczenie bez wejścia' : 'Odcięte od reszty statku',
          detail: `${ROOM_TYPES[r.type].label} (${r.area} m²) ${noDoor ? 'nie ma drzwi' : 'nie łączy się z główną częścią statku (drzwi, schody, winda)'}.`,
          level: r.level,
          at: r.center,
          edges: [],
          pieces: [],
          roomId: r.id,
        });
      }
    }
  }

  for (const ip of index.pieces.values()) {
    const { piece, item, shape } = ip;
    if (shape.kind === 'edge') {
      const [a, b] = edgeCells(shape.edges[0]);
      const fa = index.isFloored(piece.level, a.x, a.z);
      const fb = index.isFloored(piece.level, b.x, b.z);
      if (shape.edgeKind === 'door' && fa !== fb) {
        push({
          code: 'DOOR_TO_VOID',
          severity: 'warning',
          title: 'Drzwi prowadzą w próżnię',
          detail: 'Po jednej stronie drzwi nie ma podłogi. Jeśli to śluza, dobuduj komorę.',
          level: piece.level,
          at: { x: piece.x, z: piece.z },
          edges: shape.edges,
          pieces: [piece.id],
        });
      }
      // Walls round the opening over stairs enclose the stairwell: not orphans.
      const used = (c: XZ) => index.isFloored(piece.level, c.x, c.z) || index.openings.has(cellKey(piece.level, c.x, c.z));
      if (!fa && !fb && !shape.edges.some((e) => edgeCells(e).some(used))) {
        push({
          code: 'ORPHAN_EDGE',
          severity: 'info',
          title: `${item.entry.label} bez podłogi`,
          detail: 'Element krawędzi nie przylega do żadnej podłogi.',
          level: piece.level,
          at: { x: piece.x, z: piece.z },
          edges: shape.edges,
          pieces: [piece.id],
        });
      }
      if (shape.edgeKind === 'door') {
        const blockers = doorBlockers(index, piece.level, shape.edges[0]);
        if (blockers.length) {
          push({
            code: 'DOOR_BLOCKED',
            severity: 'warning',
            title: 'Zastawione drzwi',
            detail: `Przejście zastawia: ${blockers.map((b) => index.get(b)?.item.entry.label).join(', ')}.`,
            level: piece.level,
            at: { x: piece.x, z: piece.z },
            edges: shape.edges,
            pieces: [piece.id, ...blockers],
          });
        }
      }
    }
    if (shape.kind === 'object' || shape.kind === 'wall-object') {
      const check = checkPlacement(index, piece);
      if (!check.ok) {
        push({
          code: 'BAD_PLACEMENT',
          severity: 'error',
          title: `${item.entry.label}: złe miejsce`,
          detail: check.reason ?? 'Obiekt nie spełnia reguł ustawienia.',
          level: piece.level,
          at: { x: piece.x, z: piece.z },
          edges: [],
          pieces: [piece.id],
        });
      }
    }
  }

  for (const { id, link } of index.stairs) {
    const problems = stairsProblems(index, link);
    if (!problems.length) continue;
    const piece = index.get(id)!.piece;
    push({
      code: 'STAIRS_BROKEN',
      severity: 'warning',
      title: `Schody nie prowadzą na pokład ${link.landing.level}`,
      detail: `${problems.join('. ')}.`,
      level: piece.level,
      at: { x: piece.x, z: piece.z },
      edges: [],
      pieces: [id],
    });
  }

  for (const [key, id] of index.lifts) {
    const c = parseCellKey(key);
    if (index.liftShaft(c.level, c.x, c.z).length > 1) continue;
    const piece = index.get(id)!.piece;
    push({
      code: 'LIFT_SINGLE',
      severity: 'warning',
      title: 'Winda z jednym przystankiem',
      detail: 'Dodaj przystanek w tym samym polu pokład wyżej lub niżej (inspektor: „Przystanek wyżej / niżej”).',
      level: piece.level,
      at: { x: piece.x, z: piece.z },
      edges: [],
      pieces: [id],
    });
  }

  for (const p of index.unknown) {
    push({
      code: 'UNKNOWN_ITEM',
      severity: 'info',
      title: 'Nieznany element',
      detail: `„${p.item}” nie istnieje w katalogu i nie jest rysowany.`,
      level: p.level,
      at: { x: p.x, z: p.z },
      edges: [],
      pieces: [p.id],
    });
  }

  return issues.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || a.level - b.level);
}

/** Why a flight of stairs cannot be walked (Polish, for the issue detail). */
export function stairsProblems(index: LayoutIndex, s: StairsLink): string[] {
  const out: string[] = [];
  const { foot, entry, landing } = s;
  const up = landing.level;
  if (!index.isFloored(entry.level, entry.x, entry.z)) out.push('Przed wejściem na schody nie ma podłogi');
  else if (!index.isPassable(s.bottomEdge)) out.push(`Wejście zamyka: ${edgeLabel(index, s.bottomEdge)}`);
  if (index.floorAt(up, foot.x, foot.z) || index.isFloored(up, foot.x, foot.z)) out.push(`Nad schodami jest podłoga pokładu ${up}: potrzebny otwór`);
  if (index.ceilingAt(foot.level, foot.x, foot.z)) out.push('Nad schodami jest sufit');
  if (!index.isFloored(up, landing.x, landing.z)) out.push(`Za szczytem schodów nie ma podłogi pokładu ${up}`);
  else if (!index.isPassable(s.topEdge)) out.push(`Szczyt zamyka: ${edgeLabel(index, s.topEdge)}`);
  return out;
}

const edgeLabel = (index: LayoutIndex, e: EdgeRef) => index.edgeAt(e)?.item.entry.label.toLowerCase() ?? 'krawędź';

function doorBlockers(index: LayoutIndex, level: number, e: EdgeRef): string[] {
  const c = edgeCenter(e);
  const zone: Rect =
    e.axis === 'x'
      ? { minX: c.x - DOOR_CLEAR_HALF_WIDTH, maxX: c.x + DOOR_CLEAR_HALF_WIDTH, minZ: c.z - DOOR_CLEAR_DEPTH, maxZ: c.z + DOOR_CLEAR_DEPTH }
      : { minX: c.x - DOOR_CLEAR_DEPTH, maxX: c.x + DOOR_CLEAR_DEPTH, minZ: c.z - DOOR_CLEAR_HALF_WIDTH, maxZ: c.z + DOOR_CLEAR_HALF_WIDTH };
  return index
    .objectsOn(level, 'floor')
    .filter((o) => o.shape.kind === 'object' && rectsOverlap(o.shape.rect, zone))
    .map((o) => o.piece.id);
}

function plural(n: number, one: string, few: string, many: string): string {
  if (n === 1) return one;
  const d = n % 10;
  const t = n % 100;
  return d >= 2 && d <= 4 && (t < 12 || t > 14) ? few : many;
}

