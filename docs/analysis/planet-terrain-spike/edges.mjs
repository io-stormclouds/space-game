import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'resources', 'kaykit', 'Models', 'tiles', 'hex', 'gltf') + path.sep;
const COMP = {5120:1,5121:1,5122:2,5123:2,5125:4,5126:4}; const NUM = {SCALAR:1,VEC2:2,VEC3:3,VEC4:4};
function load(file){ const buf=fs.readFileSync(DIR+file); const jl=buf.readUInt32LE(12); const json=JSON.parse(buf.slice(20,20+jl).toString()); const bo=20+jl; const bl=buf.readUInt32LE(bo); const bin=buf.slice(bo+8,bo+8+bl); return {json,bin}; }
function acc(g, idx){ const a=g.json.accessors[idx], bv=g.json.bufferViews[a.bufferView]; const n=NUM[a.type], cs=COMP[a.componentType]; const stride=bv.byteStride||n*cs; const base=(bv.byteOffset||0)+(a.byteOffset||0); const out=[]; for(let i=0;i<a.count;i++){ const v=[]; for(let k=0;k<n;k++){ const p=base+i*stride+k*cs; v.push(a.componentType===5126?g.bin.readFloatLE(p):a.componentType===5123?g.bin.readUInt16LE(p):a.componentType===5125?g.bin.readUInt32LE(p):g.bin.readUInt8(p)); } out.push(v);} return out; }
function prims(g){ const out=[]; for(const m of g.json.meshes) for(const p of m.primitives){ out.push({mat: g.json.materials[p.material].name, pos: acc(g,p.attributes.POSITION)}); } return out; }
const f=x=>+x.toFixed(2);
// apothem-based: distance to the flat k is the projection on its direction; a vertex "touches" edge k if proj >= 0.86 (top ring apothem = 1.097*cos30 = 0.95, bevel starts ~0.95)
function edgeTouch(pos, yMin, thr){ const hits=[0,0,0,0,0,0]; for(const [x,y,z] of pos){ if(y<yMin) continue; for(let k=0;k<6;k++){ const a=k*Math.PI/3; const proj=x*Math.cos(a)+z*Math.sin(a); if(proj>=thr) hits[k]++; } } return hits; }
console.log('roads: Beige y-range, max apothem projection, exits (proj>=0.9)');
for (const L of 'ABCDEFGHIJKLM') { const g=load(`hex_forest_road${L}.gltf.glb`); const p=prims(g).find(q=>q.mat==='Beige'); const ys=p.pos.map(v=>v[1]); let maxProj=0; for(const [x,y,z] of p.pos) for(let k=0;k<6;k++){ const a=k*Math.PI/3; maxProj=Math.max(maxProj, x*Math.cos(a)+z*Math.sin(a)); } const h=edgeTouch(p.pos, 0.5, 0.9); console.log(`  road${L}: y ${f(Math.min(...ys))}..${f(Math.max(...ys))} maxProj ${f(maxProj)} exits ${h.map(x=>x>0?1:0).join('')} (${h.join(',')})`); }
console.log('water shores: Green (land) touching edges (proj>=0.9), Water touching edges');
for (const L of 'ABCD') { const g=load(`hex_forest_water${L}.gltf.glb`); const land=prims(g).find(q=>q.mat==='Green'); const w=prims(g).find(q=>q.mat==='Water'); const hl=edgeTouch(land.pos,0.5,0.9), hw=edgeTouch(w.pos,0.5,0.9); console.log(`  water${L}: land ${hl.map(x=>x>0?1:0).join('')} (${hl.join(',')})  water ${hw.map(x=>x>0?1:0).join('')}`); }
console.log('transitions: raised part (Brown/White) touching edges');
for (const L of 'AB') { const g=load(`hex_forest_transition${L}.gltf.glb`); const r=prims(g).find(q=>q.mat==='Brown'||q.mat==='White'); const h=edgeTouch(r.pos,0.5,0.9); console.log(`  transition${L}: raised ${h.map(x=>x>0?1:0).join('')}`); }
