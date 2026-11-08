import { buildGoldbergGrid } from './domain.js';
const len = (a,b)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
const f=x=>x.toFixed(3);
for (const n of [3,4,5,6,8]) {
  const radius = 50*n/8;
  const g = buildGoldbergGrid('b', radius, n);
  let hexEdges=[], hexRad=[], pentRad=[], pentEdges=[];
  for (const t of g.tiles) {
    const m = t.vertices.length;
    for (let i=0;i<m;i++){ const e=len(t.vertices[i], t.vertices[(i+1)%m]); (t.kind==='HEX'?hexEdges:pentEdges).push(e); }
    for (const v of t.vertices) (t.kind==='HEX'?hexRad:pentRad).push(len(v,t.center));
  }
  const stats = (a)=>{ a=[...a].sort((x,y)=>x-y); const mean=a.reduce((s,x)=>s+x,0)/a.length; return {min:a[0],max:a[a.length-1],mean}; };
  const he=stats(hexEdges), hr=stats(hexRad), pe=stats(pentEdges), pr=stats(pentRad);
  console.log(`GP(${n},0) R=${radius} tiles=${g.tiles.length} tileEdge(domain)=${f(g.tileEdge)} tileWidth=${f(g.tileEdge*Math.sqrt(3))}`);
  console.log(`  HEX edge min/mean/max ${f(he.min)}/${f(he.mean)}/${f(he.max)} (max/min ${f(he.max/he.min)}) | circumradius ${f(hr.min)}/${f(hr.mean)}/${f(hr.max)}`);
  console.log(`  PENT edge ${f(pe.min)}/${f(pe.mean)}/${f(pe.max)} | circumradius ${f(pr.min)}/${f(pr.mean)}/${f(pr.max)}`);
  const s = hr.mean/1.1547;
  console.log(`  one global scale for KayKit hex (circumradius 1.1547): s=${f(s)}; worst edge vs regular: ${f((he.min/(s*1.1547)-1)*100)}% .. +${f((he.max/(s*1.1547)-1)*100)}%`);
  let worst=0, worstAng=0;
  for (const t of g.tiles){ if(t.kind!=='HEX') continue; const rs=t.vertices.map(v=>len(v,t.center)); const mean=rs.reduce((a,b)=>a+b)/6; for(const r of rs) worst=Math.max(worst, Math.abs(r/mean-1));
    // angular irregularity: angle between consecutive corner directions vs 60°
    for (let i=0;i<6;i++){ const a=t.vertices[i], b=t.vertices[(i+1)%6], c=t.center; const ax=a.x-c.x,ay=a.y-c.y,az=a.z-c.z,bx=b.x-c.x,by=b.y-c.y,bz=b.z-c.z; const ang=Math.acos((ax*bx+ay*by+az*bz)/(Math.hypot(ax,ay,az)*Math.hypot(bx,by,bz)))*180/Math.PI; worstAng=Math.max(worstAng, Math.abs(ang-60)); } }
  console.log(`  per-tile scale: worst corner radius deviation ${(worst*100).toFixed(1)}%, worst corner angle deviation ${worstAng.toFixed(1)}° from 60°`);
  const sag = radius - Math.sqrt(radius*radius - hr.mean*hr.mean);
  console.log(`  curvature: corners sit ${f(sag)} u below the tangent plane = ${f(sag/s)} of tile height (height 1.0·s = ${f(s)} u)`);
  // gaps between neighbouring flat tiles: angle between neighbour normals
  let maxDih=0; for (const t of g.tiles){ for (const nb of t.neighbors){ const u=g.tiles[nb]; const d=t.normal.x*u.normal.x+t.normal.y*u.normal.y+t.normal.z*u.normal.z; maxDih=Math.max(maxDih, Math.acos(Math.min(1,d))*180/Math.PI);} }
  console.log(`  max angle between neighbouring tile normals ${maxDih.toFixed(1)}° -> wedge gap at the top of a 1·s tall side ≈ ${f(s*Math.tan(maxDih*Math.PI/360)*2)} u (${f(Math.tan(maxDih*Math.PI/360)*2*100)}% of height)`);
}
