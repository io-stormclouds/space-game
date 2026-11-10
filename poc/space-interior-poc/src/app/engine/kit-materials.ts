import {
  Color,
  DoubleSide,
  MeshBasicMaterial,
  MeshStandardMaterial,
  SRGBColorSpace,
  TextureLoader,
  type Material,
  type Texture,
  type WebGLProgramParametersWithUniforms,
} from 'three';

/**
 * The kit uses five materials, all reading ONE gradient atlas. They are created once and shared by
 * every model (the GLBs ship without textures, see tools/build-kit.mjs), so 130+ models cost one
 * texture and five shader programs.
 *
 * All kit materials get the "cutaway" shader patch: a per-instance attribute `aCutY` (world height);
 * fragments above it are discarded. 0 means "no cut" (also what a mesh without the attribute reads),
 * so the same materials work for thumbnails and non-instanced meshes.
 */
export type KitMaterialName = 'Atlas' | 'Atlas Metallic' | 'Atlas Emissive' | 'Atlas Glass' | 'Atlas Holo';

export const CUT_ATTRIBUTE = 'aCutY';

export function patchCutaway(material: Material): void {
  material.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\nattribute float ${CUT_ATTRIBUTE};\nvarying float vCutY;\nvarying float vCutWorldY;`)
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
  vec4 cutWorld = vec4( transformed, 1.0 );
  #ifdef USE_INSTANCING
    cutWorld = instanceMatrix * cutWorld;
  #endif
  cutWorld = modelMatrix * cutWorld;
  vCutWorldY = cutWorld.y;
  vCutY = ${CUT_ATTRIBUTE};`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vCutY;\nvarying float vCutWorldY;')
      .replace('void main() {', 'void main() {\n  if ( vCutY > 0.0 && vCutWorldY > vCutY ) discard;');
  };
  material.customProgramCacheKey = () => 'cutaway-v1';
}

export class KitMaterials {
  readonly atlas: Texture;
  private readonly byName: Record<KitMaterialName, MeshStandardMaterial>;

  constructor(atlasUrl: string) {
    this.atlas = new TextureLoader().load(atlasUrl);
    this.atlas.colorSpace = SRGBColorSpace;
    this.atlas.flipY = false; // glTF UV convention
    this.atlas.anisotropy = 4;

    const base = { map: this.atlas, side: DoubleSide } as const;
    this.byName = {
      Atlas: new MeshStandardMaterial({ ...base, name: 'Atlas', metalness: 0.24, roughness: 0.88 }),
      'Atlas Metallic': new MeshStandardMaterial({ ...base, name: 'Atlas Metallic', metalness: 0.65, roughness: 0.3 }),
      'Atlas Emissive': new MeshStandardMaterial({
        side: DoubleSide,
        name: 'Atlas Emissive',
        color: new Color(0.054, 0.066, 0.071),
        emissiveMap: this.atlas,
        emissive: new Color(1, 1, 1),
        emissiveIntensity: 1.4,
        metalness: 0.65,
        roughness: 0.82,
      }),
      'Atlas Glass': new MeshStandardMaterial({
        ...base,
        name: 'Atlas Glass',
        transparent: true,
        opacity: 0.32,
        metalness: 0,
        roughness: 0.05,
        depthWrite: false,
      }),
      'Atlas Holo': new MeshStandardMaterial({
        ...base,
        name: 'Atlas Holo',
        emissive: new Color(0.88, 0, 1),
        emissiveIntensity: 1.2,
        transparent: true,
        opacity: 0.3,
        depthWrite: false,
      }),
    };
    for (const m of Object.values(this.byName)) patchCutaway(m);
  }

  get(name: string): MeshStandardMaterial {
    return this.byName[name as KitMaterialName] ?? this.byName.Atlas;
  }

  /** Night mode pushes emissive parts so the bloom pass picks them up. */
  setGlow(emissive: number, holo: number): void {
    this.byName['Atlas Emissive'].emissiveIntensity = emissive;
    this.byName['Atlas Holo'].emissiveIntensity = holo;
  }

  dispose(): void {
    for (const m of Object.values(this.byName)) m.dispose();
    this.atlas.dispose();
  }
}

/** Flat translucent materials of the placement preview. */
export class GhostMaterials {
  readonly valid = new MeshBasicMaterial({ color: 0x4fffb0, transparent: true, opacity: 0.42, depthWrite: false });
  readonly invalid = new MeshBasicMaterial({ color: 0xff5a4a, transparent: true, opacity: 0.5, depthWrite: false });
  readonly removed = new MeshBasicMaterial({ color: 0xff5a4a, transparent: true, opacity: 0.35, depthWrite: false, depthTest: false });

  dispose(): void {
    this.valid.dispose();
    this.invalid.dispose();
    this.removed.dispose();
  }
}
