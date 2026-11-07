import * as THREE from 'three';
import { StructureKind } from '../game/models/structure.model';
import { BodyId, RoverId, ShipId } from '../shared/ids';
import { AsteroidView } from './asteroid-view';
import { PlanetGridView } from './planet-grid-view';
import { StructureView } from './structure-view';

export interface BodyView {
  id: BodyId;
  /** Positioned in the parent's frame; holds the mesh, the orbital units and child bodies. */
  group: THREE.Group;
  /** The pickable surface: sphere, Goldberg grid or asteroid rock. */
  mesh: THREE.Mesh;
  orbitalUnits: THREE.Group;
  orbitLine: THREE.LineLoop | null;
  /** Where docked ships sit, in the body's local frame. */
  dockingOffset: THREE.Vector3;
  grid: PlanetGridView | null;
  asteroid: AsteroidView | null;
  /** One instanced mesh per structure kind. */
  structures: Map<StructureKind, StructureView>;
  /** Deposit markers (rocks), instanced. */
  decor: StructureView | null;
}

export interface ShipView {
  id: ShipId;
  mesh: THREE.Mesh;
  material: THREE.MeshStandardMaterial;
  hitProxy: THREE.Mesh;
}

export interface RoverView {
  id: RoverId;
  bodyId: BodyId;
  mesh: THREE.Mesh;
  material: THREE.MeshStandardMaterial;
  hitProxy: THREE.Mesh;
}

export type PickKind = 'SHIP' | 'BODY' | 'ROVER';

export interface PickUserData {
  kind: PickKind;
  entityId: string;
}

/** Maps entity ids to their Three.js objects and keeps the pickable lists. */
export class EntityViewRegistry {
  readonly bodies = new Map<BodyId, BodyView>();
  readonly ships = new Map<ShipId, ShipView>();
  readonly rovers = new Map<RoverId, RoverView>();
  readonly pickableBodies: THREE.Object3D[] = [];
  readonly pickableShips: THREE.Object3D[] = [];
  readonly pickableRovers: THREE.Object3D[] = [];
  /** Surfaces with a tile grid; hover raycasts only these. */
  readonly pickableGrids: THREE.Object3D[] = [];

  addBody(view: BodyView): void {
    this.bodies.set(view.id, view);
    view.mesh.userData = { kind: 'BODY', entityId: view.id } satisfies PickUserData;
    this.pickableBodies.push(view.mesh);
    if (view.grid) this.pickableGrids.push(view.mesh);
  }

  addShip(view: ShipView): void {
    this.ships.set(view.id, view);
    const data: PickUserData = { kind: 'SHIP', entityId: view.id };
    view.mesh.userData = data;
    view.hitProxy.userData = data;
    this.pickableShips.push(view.mesh, view.hitProxy);
  }

  addRover(view: RoverView): void {
    this.rovers.set(view.id, view);
    const data: PickUserData = { kind: 'ROVER', entityId: view.id };
    view.mesh.userData = data;
    view.hitProxy.userData = data;
    this.pickableRovers.push(view.mesh, view.hitProxy);
  }

  body(id: BodyId): BodyView {
    const v = this.bodies.get(id);
    if (!v) throw new Error(`No view for body ${id}`);
    return v;
  }

  ship(id: ShipId): ShipView {
    const v = this.ships.get(id);
    if (!v) throw new Error(`No view for ship ${id}`);
    return v;
  }

  clear(): void {
    this.bodies.clear();
    this.ships.clear();
    this.rovers.clear();
    this.pickableBodies.length = 0;
    this.pickableShips.length = 0;
    this.pickableRovers.length = 0;
    this.pickableGrids.length = 0;
  }
}
