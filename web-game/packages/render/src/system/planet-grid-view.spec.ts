import * as THREE from 'three';
import { INITIAL_BODIES, PLANET_ID, buildGoldbergGrid } from '@space-game/domain';
import { DS, depositTint, mixHex, muteBodyColor } from './palette';
import { PlanetGridView } from './planet-grid-view';

/** Raycasting is pure math in Three.js, so these run in plain node without WebGL (PoC spec). */
describe('PlanetGridView', () => {
  const planet = INITIAL_BODIES.find((b) => b.id === PLANET_ID)!;
  const grid = buildGoldbergGrid(planet.id, planet.radius, planet.surfaceGrid!.frequency, planet.surfaceGrid!.depositSeed);
  const view = new PlanetGridView(grid, planet.color);
  const group = new THREE.Group();
  group.add(view.mesh);
  group.position.set(900, 0, 40); // a body somewhere on its orbit
  group.updateMatrixWorld(true);
  const raycaster = new THREE.Raycaster();
  const centre = new THREE.Vector3(900, 0, 40);

  function pick(origin: THREE.Vector3, dir: THREE.Vector3): number {
    raycaster.set(origin, dir);
    const hit = raycaster.intersectObject(view.mesh, false)[0];
    return hit && hit.faceIndex != null ? view.tileAtFace(hit.faceIndex) : -1;
  }

  afterAll(() => view.dispose());

  it('maps every triangle to a tile; triangle count = sum of tile corners', () => {
    const expected = grid.tiles.reduce((s, t) => s + t.vertices.length, 0);
    expect(view.triangleCount).toBe(expected);
    expect(expected).toBe(3840);
    for (let f = 0; f < view.triangleCount; f++) {
      const t = view.tileAtFace(f);
      expect(t).toBeGreaterThanOrEqual(0);
      expect(t).toBeLessThan(grid.tiles.length);
    }
    expect(view.tileAtFace(-1)).toBe(-1);
    expect(view.tileAtFace(view.triangleCount)).toBe(-1);
  });

  it('a ray from above each tile centre towards the body centre hits that tile', () => {
    const origin = new THREE.Vector3();
    const dir = new THREE.Vector3();
    for (const tile of grid.tiles) {
      origin.set(tile.center.x, tile.center.y, tile.center.z).multiplyScalar(2).add(centre);
      dir.subVectors(centre, origin).normalize();
      expect(pick(origin, dir)).toBe(tile.index);
    }
  });

  it('a ray aimed between two neighbouring tiles still returns one of them, never nothing', () => {
    const origin = new THREE.Vector3();
    const dir = new THREE.Vector3();
    for (const tile of grid.tiles.slice(0, 60)) {
      for (const n of tile.neighbors) {
        const other = grid.tiles[n]!;
        origin
          .set(tile.center.x + other.center.x, tile.center.y + other.center.y, tile.center.z + other.center.z)
          .normalize()
          .multiplyScalar(planet.radius * 2)
          .add(centre);
        dir.subVectors(centre, origin).normalize();
        expect([tile.index, other.index]).toContain(pick(origin, dir));
      }
    }
  });

  it('hover lightens, selection pulls to the signal colour; both restore the base colour', () => {
    const plain = grid.tiles.find((t) => !t.deposit && t.kind === 'HEX')!.index;
    const other = plain + 1;
    const base0 = view.colorOf(plain);
    const base1 = view.colorOf(other);
    view.setHover(plain);
    expect(view.colorOf(plain).r).toBeGreaterThan(base0.r);
    expect(view.colorOf(other)).toEqual(base1);
    view.setSelected(plain);
    const sel = view.colorOf(plain);
    const signal = new THREE.Color(DS.signal);
    expect(sel.r - base0.r).toBeCloseTo((signal.r - base0.r) * 0.35, 5);
    view.setHover(null);
    expect(view.colorOf(plain)).toEqual(sel); // selection wins over hover
    view.setSelected(null);
    expect(view.colorOf(plain)).toEqual(base0);
    expect(view.colorOf(other)).toEqual(base1);
  });

  it('pentagon tiles are shaded darker than hexagons', () => {
    const pent = grid.tiles.find((t) => t.kind === 'PENT' && !t.deposit)!;
    const hex = grid.tiles.find((t) => t.kind === 'HEX' && !t.deposit && t.index % 7 === 0)!;
    expect(view.colorOf(pent.index).r).toBeLessThan(view.colorOf(hex.index).r);
  });

  it('deposits are tinted by material code; exhausted ones fade back towards the ground', () => {
    const dep = grid.tiles.find((t) => t.deposit)!;
    const tinted = view.colorOf(dep.index);
    const ground = new THREE.Color(muteBodyColor(planet.color));
    const tint = new THREE.Color(depositTint(dep.deposit!.resource));
    // the tinted colour is closer to the deposit tint than the plain ground is
    const dist = (a: THREE.Color, b: THREE.Color) => Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b);
    expect(dist(tinted, tint)).toBeLessThan(dist(ground, tint));
    view.setExhausted(dep.index, true);
    const faded = view.colorOf(dep.index);
    expect(dist(faded, tint)).toBeGreaterThan(dist(tinted, tint));
    view.setExhausted(dep.index, false);
    expect(view.colorOf(dep.index)).toEqual(tinted);
    expect(mixHex(0, 0, 0)).toBe(0);
  });

  it('writes tile outlines as segments lifted above the surface', () => {
    const t = grid.tiles.find((x) => x.kind === 'HEX')!;
    const out = new Float32Array(200);
    const end = view.writeOutline([t.index], out, 0);
    expect(end).toBe(6 * 6); // 6 edges × 2 points × xyz
    const r = Math.hypot(out[0]!, out[1]!, out[2]!);
    expect(r).toBeGreaterThan(planet.radius);
    expect(r).toBeLessThan(planet.radius * 1.01);
    // never writes past the end of the buffer
    expect(view.writeOutline([t.index, t.index], new Float32Array(40), 0)).toBeLessThanOrEqual(40);
  });
});
