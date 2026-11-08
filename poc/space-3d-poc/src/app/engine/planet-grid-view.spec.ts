import * as THREE from 'three';
import { INITIAL_BODIES, PLANET_ID } from '../game/config/initial-world';
import { buildGoldbergGrid } from '../game/math/goldberg-grid';
import { EntityViewRegistry } from './entity-view-registry';
import { THEMES } from './model-registry';
import { PickingService } from './picking.service';
import { PlanetGridView } from './planet-grid-view';

/** Raycasting is pure math in Three.js, so these run in jsdom without a WebGL context. */
describe('PlanetGridView + PickingService', () => {
  const planet = INITIAL_BODIES.find((b) => b.id === PLANET_ID)!;
  const grid = buildGoldbergGrid(planet.id, planet.radius, planet.surfaceGrid!.frequency);
  const view = new PlanetGridView(grid, planet.color);
  const registry = new EntityViewRegistry();
  const group = new THREE.Group();
  group.add(view.mesh);
  registry.addBody({
    id: planet.id,
    group,
    mesh: view.mesh,
    orbitalUnits: new THREE.Group(),
    orbitLine: null,
    dockingOffset: new THREE.Vector3(0, planet.radius * 1.25, 0),
    grid: view,
    asteroid: null,
    structures: new Map(),
    decor: null,
    theme: THEMES.KAYKIT,
    dressing: new Map(),
  });
  group.updateMatrixWorld(true);
  const picking = new PickingService();

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
      origin.set(tile.center.x, tile.center.y, tile.center.z).multiplyScalar(2);
      dir.copy(origin).negate().normalize();
      const r = picking.pickRay(origin, dir, registry);
      expect(r.kind).toBe('TILE');
      if (r.kind === 'TILE') {
        expect(r.tileIndex).toBe(tile.index);
        expect(r.tileId).toBe(tile.id);
        expect(r.bodyId).toBe(planet.id);
      }
    }
  });

  it('a ray aimed between two neighbouring tiles still returns one of them, never EMPTY', () => {
    const origin = new THREE.Vector3();
    const dir = new THREE.Vector3();
    for (const tile of grid.tiles.slice(0, 60)) {
      for (const n of tile.neighbors) {
        const other = grid.tiles[n];
        origin
          .set(tile.center.x + other.center.x, tile.center.y + other.center.y, tile.center.z + other.center.z)
          .multiplyScalar(0.5)
          .normalize()
          .multiplyScalar(planet.radius * 2);
        dir.copy(origin).negate().normalize();
        const r = picking.pickRay(origin, dir, registry);
        expect(r.kind).toBe('TILE');
        if (r.kind === 'TILE') expect([tile.index, other.index]).toContain(r.tileIndex);
      }
    }
  });

  it('hover and selection recolour only the targeted tile and restore the base colour', () => {
    const base0 = view.colorOf(0);
    const base1 = view.colorOf(1);
    view.setHover(0);
    expect(view.colorOf(0).r).toBeGreaterThan(base0.r);
    expect(view.colorOf(1)).toEqual(base1);
    view.setSelected(0);
    expect(view.colorOf(0).getHex()).toBe(0x22d3ee);
    view.setHover(null);
    expect(view.colorOf(0).getHex()).toBe(0x22d3ee); // selection wins over hover
    view.setSelected(null);
    expect(view.colorOf(0)).toEqual(base0);
    expect(view.colorOf(1)).toEqual(base1);
  });

  it('pentagon tiles are shaded darker than hexagons', () => {
    const pent = grid.tiles.find((t) => t.kind === 'PENT')!;
    const hex = grid.tiles.find((t) => t.kind === 'HEX')!;
    expect(view.colorOf(pent.index).r).toBeLessThan(view.colorOf(hex.index).r);
  });
});
