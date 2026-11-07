import * as THREE from 'three';

/** Shared geometries and materials, disposed once with the scene. */
export class AssetCache {
  private readonly geometries = new Map<string, THREE.BufferGeometry>();
  private readonly materials = new Map<string, THREE.Material>();

  sphere(radius: number, segments = 32): THREE.SphereGeometry {
    return this.geometry(`sphere:${radius}:${segments}`, () => new THREE.SphereGeometry(radius, segments, segments / 2)) as THREE.SphereGeometry;
  }

  /** Cone whose apex points along +Z. */
  shipCone(): THREE.ConeGeometry {
    return this.geometry('ship', () => new THREE.ConeGeometry(2.5, 8, 12).rotateX(Math.PI / 2)) as THREE.ConeGeometry;
  }

  orbitRing(radius: number, segments = 128): THREE.BufferGeometry {
    return this.geometry(`orbit:${radius}`, () => {
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i < segments; i++) {
        const a = (i / segments) * Math.PI * 2;
        pts.push(new THREE.Vector3(radius * Math.cos(a), 0, radius * Math.sin(a)));
      }
      return new THREE.BufferGeometry().setFromPoints(pts);
    });
  }

  orbitLine(): THREE.LineBasicMaterial {
    return this.material('orbitLine', () => new THREE.LineBasicMaterial({ color: 0x64748b, transparent: true, opacity: 0.45 })) as THREE.LineBasicMaterial;
  }

  hitProxy(): THREE.MeshBasicMaterial {
    return this.material('hitProxy', () => new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })) as THREE.MeshBasicMaterial;
  }

  disposeAll(): void {
    for (const g of this.geometries.values()) g.dispose();
    for (const m of this.materials.values()) m.dispose();
    this.geometries.clear();
    this.materials.clear();
  }

  private geometry(key: string, make: () => THREE.BufferGeometry): THREE.BufferGeometry {
    let g = this.geometries.get(key);
    if (!g) {
      g = make();
      this.geometries.set(key, g);
    }
    return g;
  }

  private material(key: string, make: () => THREE.Material): THREE.Material {
    let m = this.materials.get(key);
    if (!m) {
      m = make();
      this.materials.set(key, m);
    }
    return m;
  }
}
