// Usage: node glb-info.js <file.glb>... ; prints one JSON line per file with node/mesh/material/triangle/bounds info
const fs = require('fs');
const path = require('path');
const COMP = {5120:1,5121:1,5122:2,5123:2,5125:4,5126:4};
const NUM = {SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT4:16};
function readAccessor(json, bin, idx){
  const a = json.accessors[idx]; const bv = json.bufferViews[a.bufferView];
  const n = NUM[a.type], cs = COMP[a.componentType];
  const stride = bv.byteStride || n*cs;
  const base = (bv.byteOffset||0) + (a.byteOffset||0);
  const out = [];
  for (let i=0;i<a.count;i++){
    const o = base + i*stride; const v=[];
    for(let k=0;k<n;k++){
      const p=o+k*cs;
      switch(a.componentType){
        case 5120: v.push(bin.readInt8(p)); break;
        case 5121: v.push(bin.readUInt8(p)); break;
        case 5122: v.push(bin.readInt16LE(p)); break;
        case 5123: v.push(bin.readUInt16LE(p)); break;
        case 5125: v.push(bin.readUInt32LE(p)); break;
        case 5126: v.push(bin.readFloatLE(p)); break;
      }
    }
    out.push(v);
  }
  return out;
}
for (const file of process.argv.slice(2)) {
  const buf = fs.readFileSync(file);
  if (buf.readUInt32LE(0) !== 0x46546C67) { console.log(JSON.stringify({file, error:'not glb'})); continue; }
  const jsonLen = buf.readUInt32LE(12);
  const json = JSON.parse(buf.slice(20, 20+jsonLen).toString('utf8'));
  let bin = null;
  const binOff = 20+jsonLen;
  if (binOff < buf.length) { const binLen = buf.readUInt32LE(binOff); bin = buf.slice(binOff+8, binOff+8+binLen); }
  let tris = 0, verts = 0;
  const min=[Infinity,Infinity,Infinity], max=[-Infinity,-Infinity,-Infinity];
  const primMats = [];
  // Walk scene nodes with transforms to get world bounds
  function nodeMatrix(n){
    if (n.matrix) return n.matrix;
    const t = n.translation||[0,0,0], r = n.rotation||[0,0,0,1], s = n.scale||[1,1,1];
    const [x,y,z,w]=r;
    const m = [
      (1-2*(y*y+z*z))*s[0], (2*(x*y+z*w))*s[0], (2*(x*z-y*w))*s[0], 0,
      (2*(x*y-z*w))*s[1], (1-2*(x*x+z*z))*s[1], (2*(y*z+x*w))*s[1], 0,
      (2*(x*z+y*w))*s[2], (2*(y*z-x*w))*s[2], (1-2*(x*x+y*y))*s[2], 0,
      t[0],t[1],t[2],1];
    return m;
  }
  function mul(a,b){ const o=new Array(16).fill(0); for(let i=0;i<4;i++)for(let j=0;j<4;j++)for(let k=0;k<4;k++)o[j*4+i]+=a[k*4+i]*b[j*4+k]; return o; }
  function apply(m,v){ return [m[0]*v[0]+m[4]*v[1]+m[8]*v[2]+m[12], m[1]*v[0]+m[5]*v[1]+m[9]*v[2]+m[13], m[2]*v[0]+m[6]*v[1]+m[10]*v[2]+m[14]]; }
  const nodeNames = [];
  function walk(ni, parent){
    const n = json.nodes[ni]; const m = mul(parent, nodeMatrix(n));
    nodeNames.push(n.name||('#'+ni));
    if (n.mesh !== undefined){
      const mesh = json.meshes[n.mesh];
      for (const p of mesh.primitives){
        const posAcc = json.accessors[p.attributes.POSITION];
        verts += posAcc.count;
        if (p.indices !== undefined) tris += json.accessors[p.indices].count/3; else tris += posAcc.count/3;
        const matName = p.material!==undefined ? (json.materials[p.material].name||('#'+p.material)) : null;
        primMats.push(matName);
        // bounds via accessor min/max transformed (8 corners)
        if (posAcc.min && posAcc.max){
          for (const cx of [posAcc.min[0],posAcc.max[0]]) for (const cy of [posAcc.min[1],posAcc.max[1]]) for (const cz of [posAcc.min[2],posAcc.max[2]]){
            const w = apply(m,[cx,cy,cz]);
            for(let k=0;k<3;k++){ if(w[k]<min[k])min[k]=w[k]; if(w[k]>max[k])max[k]=w[k]; }
          }
        }
        if (p.attributes.COLOR_0 !== undefined) primMats[primMats.length-1] += '+COLOR_0';
      }
    }
    for (const c of (n.children||[])) walk(c, m);
  }
  const scene = json.scenes[json.scene||0];
  const I=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
  for (const ni of scene.nodes) walk(ni, I);
  const mats = (json.materials||[]).map(mt => ({name: mt.name, color: mt.pbrMetallicRoughness && mt.pbrMetallicRoughness.baseColorFactor ? mt.pbrMetallicRoughness.baseColorFactor.map(c=>+c.toFixed(3)) : null, tex: !!(mt.pbrMetallicRoughness && mt.pbrMetallicRoughness.baseColorTexture), alpha: mt.alphaMode||'OPAQUE'}));
  const r3=x=>+x.toFixed(3);
  console.log(JSON.stringify({file: path.basename(file), bytes: buf.length, nodes: nodeNames, meshes:(json.meshes||[]).length, prims: primMats.length, tris, verts, textures:(json.textures||[]).length, images:(json.images||[]).length, materials: mats, size:[r3(max[0]-min[0]), r3(max[1]-min[1]), r3(max[2]-min[2])], min: min.map(r3), max: max.map(r3), extUsed: json.extensionsUsed||[], generator: json.asset && json.asset.generator}));
}
