import * as THREE from 'three';
import { POC_SCENARIO, SHIP_ID, Simulation, type Vec3 } from '@space-game/domain';
import { geometryTriangles } from './buffers';
import { ModelKit, boxMatrix } from './model-kit';
import { ROVER_MODEL, SHIP_MODEL } from './model-registry';
import { roverRestPosition } from './placement';
import { UNIT_FULL_PX, UNIT_LOD_PX, UnitsLayer, roverProxyGeometry, shipProxyGeometry, type UnitContext, type UnitDetail } from './units-layer';

/** Every face of a closed solid round the origin faces outwards (flat shading, front faces only). */
function outward(g: THREE.BufferGeometry): boolean {
  const flat = g.index ? g.toNonIndexed() : g;
  const p = flat.getAttribute('position');
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  for (let i = 0; i < p.count; i += 3) {
    a.fromBufferAttribute(p, i);
    b.fromBufferAttribute(p, i + 1);
    c.fromBufferAttribute(p, i + 2);
    const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a));
    if (n.dot(a.clone().add(b).add(c)) <= 0) return false;
  }
  return true;
}

describe('UnitsLayer level of detail (T4b)', () => {
  const sim = new Simulation(POC_SCENARIO);

  it('proxy shapes: an 8-triangle dart and a 12-triangle box in the unit box, faces outwards', () => {
    const dart = shipProxyGeometry();
    const box = roverProxyGeometry();
    expect(geometryTriangles(dart)).toBe(8);
    expect(geometryTriangles(box)).toBe(12);
    for (const g of [dart, box]) {
      g.computeBoundingBox();
      expect(g.boundingBox!.min.toArray()).toEqual([-0.5, -0.5, -0.5]);
      expect(g.boundingBox!.max.toArray()).toEqual([0.5, 0.5, 0.5]);
      expect(outward(g)).toBe(true);
      g.dispose();
    }
  });

  it('switches each unit by its length on screen (hysteresis) or its far body; never without detail; the proxy covers the model box', () => {
    const kit = new ModelKit('assets/');
    const layer = new UnitsLayer(kit);
    let px = 20;
    let far = false;
    const centre = new THREE.Vector3(100, 0, 0);
    const dock: Vec3 = { x: 0, y: 60, z: 0 };
    const world = structuredClone(sim.world);
    // the camera far out above the rover's side of the body: nothing culled here (see the next test)
    const rover = roverRestPosition(sim.grids.get(world.rovers[0]!.bodyId)!, world.rovers[0]!.tileIndex, { x: 0, y: 0, z: 0 });
    const camera = new THREE.Vector3(rover.x, rover.y, rover.z).normalize().multiplyScalar(1e4).add(centre);
    let inView = true;
    const detail: UnitDetail = { camera, apparentPx: () => px, far: () => far, inView: () => inView };
    const ctx: UnitContext = {
      world,
      frame: null,
      time: 0,
      grids: sim.grids,
      bodyWorld: () => centre,
      docking: () => dock,
      orbit: () => dock,
      selectedShip: null,
      detail,
    };
    const ships = world.ships.filter((s) => s.currentBodyId).length;
    const rovers = world.rovers.length;
    expect(ships).toBeGreaterThan(0);
    expect(rovers).toBeGreaterThan(0);
    const at = (n: number) => {
      px = n;
      layer.update(ctx);
      return layer.drawnUnits;
    };
    const full = { ships, shipProxies: 0, rovers, roverProxies: 0 };
    const proxies = { ships: 0, shipProxies: ships, rovers: 0, roverProxies: rovers };
    expect(at(20)).toEqual(full);
    expect(at(UNIT_LOD_PX + 1)).toEqual(full); // in the gap from above
    expect(at(UNIT_LOD_PX - 1)).toEqual(proxies);
    expect(at(UNIT_FULL_PX - 1)).toEqual(proxies); // in the gap from below
    expect(at(UNIT_FULL_PX + 1)).toEqual(full);
    // docked at / driving on a far body: proxies at any size
    far = true;
    expect(at(40)).toEqual(proxies);
    far = false;
    expect(at(40)).toEqual(full);
    expect(at(2)).toEqual(proxies);

    // a proxy is the model's matrix times its box: the same corners as the model's bounds
    const proxyMesh = layer.group.children.find((o) => o.name === 'ShipProxies') as THREE.InstancedMesh;
    const modelMesh = layer.group.children.find((o) => o.name === 'Ships') as THREE.InstancedMesh;
    const proxy = proxyMesh.getMatrixAt(0, new THREE.Matrix4());
    at(20);
    const model = modelMesh.getMatrixAt(0, new THREE.Matrix4()).multiply(boxMatrix(kit.box(SHIP_MODEL), new THREE.Matrix4()));
    proxy.elements.forEach((x, i) => expect(x).toBeCloseTo(model.elements[i]!, 4));
    // in the model's tone (the placeholder's here: no models loaded)
    const tone = (name: string) => {
      const g = (layer.group.children.find((o) => o.name === name) as THREE.InstancedMesh).geometry;
      return new THREE.Color().fromBufferAttribute(g.getAttribute('color') as THREE.BufferAttribute, 0).getHex();
    };
    expect(tone('ShipProxies')).toBe(kit.tone(SHIP_MODEL).getHex());
    expect(tone('RoverProxies')).toBe(kit.tone(ROVER_MODEL).getHex());

    // outside the view frustum: not drawn at all, the positions stay (picking, brackets)
    inView = false;
    expect(at(20)).toEqual({ ships: 0, shipProxies: 0, rovers: 0, roverProxies: 0 });
    expect(layer.shipPos.size).toBe(world.ships.length);
    expect(layer.roverPos.size).toBe(rovers);
    inView = true;

    // cullDetail = false: no detail, the models at any size
    ctx.detail = null;
    expect(at(1)).toEqual(full);
    // a ship that left the world is forgotten (no stale hysteresis state)
    ctx.detail = detail;
    at(2);
    ctx.world = { ...world, ships: world.ships.filter((s) => s.id !== SHIP_ID) };
    expect(at(2).shipProxies).toBe(ships - 1);
    layer.dispose();
    kit.dispose();
  });

  it('rovers behind the horizon of their body are not drawn, and every one left out really is hidden (random cameras, rays past the body)', () => {
    const kit = new ModelKit('assets/');
    const layer = new UnitsLayer(kit);
    const centre = new THREE.Vector3(-40, 5, 12);
    const r0 = sim.world.rovers[0]!;
    const grid = sim.grids.get(r0.bodyId)!;
    const R = grid.radius;
    // rovers spread over the body, one per 7th tile
    const rovers = grid.tiles.filter((t) => t.index % 7 === 0).map((t, i) => ({ ...r0, id: `${r0.id}-${i}` as typeof r0.id, tileIndex: t.index }));
    const world = { ...structuredClone(sim.world), ships: [], rovers };
    const camera = new THREE.Vector3();
    const ctx: UnitContext = {
      world,
      frame: null,
      time: 0,
      grids: sim.grids,
      bodyWorld: () => centre,
      docking: () => ({ x: 0, y: 0, z: 0 }),
      orbit: () => ({ x: 0, y: 0, z: 0 }),
      selectedShip: null,
      detail: { camera, apparentPx: () => 50, far: () => false, inView: () => true },
    };
    /** Whether the segment from the camera to p misses the ball of radius R round the centre (p can be seen). */
    const seen = (p: THREE.Vector3) => {
      const o = camera.clone().sub(centre);
      const q = p.clone().sub(centre);
      const dir = q.clone().sub(o);
      const len = dir.length();
      dir.divideScalar(len);
      const t = Math.max(0, Math.min(len, -o.dot(dir)));
      return o.addScaledVector(dir, t).length() >= R;
    };
    let rnd = 7;
    const next = () => ((rnd = (rnd * 16807) % 2147483647) / 2147483647);
    let culled = 0;
    for (let k = 0; k < 40; k++) {
      const z = next() * 2 - 1;
      const a = next() * Math.PI * 2;
      const s = Math.sqrt(1 - z * z);
      camera.set(s * Math.cos(a), z, s * Math.sin(a)).multiplyScalar(R * (1.2 + next() * 20)).add(centre);
      layer.update(ctx);
      const drawn = layer.drawnUnits.rovers;
      culled += rovers.length - drawn;
      expect(drawn).toBeGreaterThan(0);
      // the ones drawn are a prefix of the source order: check each rover left out against rays to its body and top
      const mesh = layer.group.children.find((o) => o.name === 'Rovers') as THREE.InstancedMesh;
      const shown = new Set(Array.from({ length: drawn }, (_, i) => new THREE.Vector3().setFromMatrixPosition(mesh.getMatrixAt(i, new THREE.Matrix4())).toArray().join()));
      for (const r of rovers) {
        const p = layer.roverPos.get(r.id)!;
        if (shown.has(p.toArray().map(Math.fround).join())) continue; // the instance buffer is float32
        const up = p.clone().sub(centre).normalize();
        const size = layer.roverSize.get(r.id)!;
        expect(seen(p)).toBe(false);
        expect(seen(p.clone().addScaledVector(up, size))).toBe(false);
      }
    }
    expect(culled).toBeGreaterThan(rovers.length * 40 * 0.3); // well over a third behind on average
    // positions stay for picking (the surface in front of them wins there)
    expect(layer.roverPos.size).toBe(rovers.length);
    layer.dispose();
    kit.dispose();
  });
});
