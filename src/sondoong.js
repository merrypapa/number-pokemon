import * as THREE from 'three';
import { waterMaterial } from './fx.js';
import { makeInstanced, makePillSprite } from './world.js';

// 지하동굴 = 베트남 손둥 동굴(세계에서 가장 큰 동굴)을 본뜬 구조물. 평지 동굴에 위아래로 오가는 길을 만든다.
//  - 하늘 구멍 밀림: 천장이 무너진 구멍(돌리네)으로 햇빛이 쏟아지고, 그 아래 작은 밀림(나무·고사리·덩굴)이 자란다.
//  - 지하 강: 첫 호수에서 두 번째 호수까지 흐른다. 물에는 못 들어가고, 높은 구름다리(2.4m) 하나와 징검다리 두 곳으로 건넌다.
//  - 거대 석순: 높이 12~22m 돌기둥. 천장에는 거꾸로 매달린 종유석.
//  - 만리장성 절벽: 보스 롱스톤은 높이 4.5m 절벽 위 고원에 산다. 남쪽 오르막길로만 올라간다 (절벽은 뛰어도 못 오른다).
//  - 계단식 석회 웅덩이: 둥근 계단 다섯 단(0.45m씩) 위에 물이 고인 언덕. 꼭대기에 블록.
// 높이 규칙은 푸른숲(yakushima.js)과 같다: 단단한 것(절벽 고원·오르막·석회 계단)은 늘 지형, 겹치는 것(구름다리)은 지금 높이+0.7 아래일 때만.

const TAU = Math.PI * 2;
function segNear(px, pz, ax, az, bx, bz) {
  const vx = bx - ax, vz = bz - az, L2 = vx * vx + vz * vz || 1;
  const t = Math.max(0, Math.min(1, ((px - ax) * vx + (pz - az) * vz) / L2));
  const x = ax + vx * t, z = az + vz * t;
  return { d: Math.hypot(px - x, pz - z), t, x, z };
}
function poly(pts, extra = {}) {
  const lens = []; let L = 0;
  for (let i = 0; i + 1 < pts.length; i++) { const l = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]); lens.push(l); L += l; }
  const xs = pts.map((p) => p[0]), zs = pts.map((p) => p[1]);
  return { pts, lens, L, box: [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)], ...extra };
}
function polyNear(P, px, pz) {
  let best = null, acc = 0;
  for (let i = 0; i + 1 < P.pts.length; i++) {
    const [ax, az] = P.pts[i], [bx, bz] = P.pts[i + 1], len = P.lens[i], r = segNear(px, pz, ax, az, bx, bz);
    if (!best || r.d < best.d) best = { d: r.d, s: acc + r.t * len, ux: (bx - ax) / len, uz: (bz - az) / len, x: r.x, z: r.z };
    acc += len;
  }
  return best;
}
function polyAt(P, s) {
  let acc = 0;
  for (let i = 0; i + 1 < P.pts.length; i++) {
    if (s <= acc + P.lens[i] || i === P.pts.length - 2) { const t = Math.max(0, Math.min(1, (s - acc) / P.lens[i])); const [ax, az] = P.pts[i], [bx, bz] = P.pts[i + 1]; return { x: ax + (bx - ax) * t, z: az + (bz - az) * t, ux: (bx - ax) / P.lens[i], uz: (bz - az) / P.lens[i] }; }
    acc += P.lens[i];
  }
  return null;
}
const inBox = (P, x, z, m) => x > P.box[0] - m && x < P.box[1] + m && z > P.box[2] - m && z < P.box[3] + m;

// ---------- 배치 (지하동굴 좌표: 도착 (0,15), 포탈 (0,33) 남쪽, 보스 (0,-68) 북쪽, 번개 굴 (70,12) 동쪽, 동굴탑 문 (-64,-24) 서쪽) ----------
export const RIVER = poly([[24, -19], [12, -11], [0, -7], [-14, -1], [-28, 10], [-41, 26]], { half: 2.2, carve: 3.4 });
RIVER.crossings = [14, -24].map((x) => { let best = null; for (let s = 0; s <= RIVER.L; s += 0.5) { const p = polyAt(RIVER, s); if (!best || Math.abs(p.x - x) < Math.abs(best.x - x)) best = p; } return best; });
export const ROPE = poly([[0, 4], [0, -18]], { half: 1.0, H: 2.4, ramp: 7 }); // 도착 → 보스 길이 강을 건너는 높은 구름다리
export const SKY = { x: -28, z: -40, r: 13 };                                  // 하늘 구멍 밀림
export const WALL = { x: 0, z: -68, r: 11, top: 4.5, ramp: { x: 0, z0: -47, z1: -57.5, half: 1.7 } }; // 보스 고원 + 남쪽 오르막
export const RIMS = { x: 50, z: 44, r: 9, steps: 5, h: 0.45 };                 // 계단식 석회 웅덩이
export const PILLARS = [[-50, -6, 2.6, 20], [50, -10, 3.0, 22], [-16, 44, 2.2, 15], [24, 26, 2.4, 17], [56, -46, 2.8, 19], [-58, 54, 2.6, 16], [36, -54, 2.0, 13], [-40, 8, 1.8, 12]]; // [x, z, 밑동 반지름, 높이]

// ---------- 높이 ----------
function riverNear(x, z) { return inBox(RIVER, x, z, RIVER.carve + 1) ? polyNear(RIVER, x, z) : null; }
export function onRiverCrossing(x, z) {
  for (const c of RIVER.crossings) { const dx = x - c.x, dz = z - c.z, along = dx * c.ux + dz * c.uz, across = -dx * c.uz + dz * c.ux; if (Math.abs(along) < 0.9 && Math.abs(across) < RIVER.half + 1.4) return true; }
  return false;
}
export function riverCarve(x, z) { const n = riverNear(x, z); if (!n || n.d >= RIVER.carve || onRiverCrossing(x, z)) return 0; return 0.9 * (1 - n.d / RIVER.carve); }
export function riverDist(x, z) { return inBox(RIVER, x, z, 30) ? polyNear(RIVER, x, z).d : Infinity; }
function inRiver(x, z) { const n = riverNear(x, z); return !!n && n.d < RIVER.half && !onRiverCrossing(x, z); }
function ropeH(x, z) { if (!inBox(ROPE, x, z, 2)) return null; const n = polyNear(ROPE, x, z); if (n.d > ROPE.half) return null; return ROPE.H * Math.min(1, n.s / ROPE.ramp, (ROPE.L - n.s) / ROPE.ramp); }
/** 보스 고원·오르막 높이 (절대 높이). 고원은 가운데 바닥 높이 + top 으로 평평하다 — 그린 뚜껑과 같게 (예전엔 자리마다 울퉁불퉁한 바닥을 더해 고원 위에서 발이 1m 가까이 묻혀 보였다) */
export function wallTopY(baseAt) { return baseAt(WALL.x, WALL.z) + WALL.top; }
function wallH(x, z, baseAt) {
  if (Math.hypot(x - WALL.x, z - WALL.z) < WALL.r) return wallTopY(baseAt);
  const R = WALL.ramp; if (Math.abs(x - R.x) < R.half && z <= R.z0 && z >= R.z1) { const y0 = baseAt(R.x, R.z0); return y0 + (wallTopY(baseAt) - y0) * (R.z0 - z) / (R.z0 - R.z1); } // 남쪽(z 큰 쪽) 바닥에서 고원 위까지 곧게
  return null;
}
function rimH(x, z, baseAt) { const d = Math.hypot(x - RIMS.x, z - RIMS.z); if (d >= RIMS.r) return null; return baseAt(RIMS.x, RIMS.z) + RIMS.h * Math.min(RIMS.steps, Math.floor((RIMS.r - d) / (RIMS.r / RIMS.steps)) + 1); } // 그린 단처럼 가운데 바닥 기준

export function caveStructHeight(x, z, refY, ground, base, baseAt) {
  let best = ground;
  for (const h of [wallH(x, z, baseAt), rimH(x, z, baseAt)]) if (h != null) best = Math.max(best, h);
  const r = ropeH(x, z), lim = (refY ?? ground) + 0.7;
  if (r != null && r > 0.02 && base + r <= lim) best = Math.max(best, base + r);
  return best;
}
export function caveStructCeiling(x, z, y, base) { const r = ropeH(x, z); return r != null && base + r > y + 0.5 ? base + r : Infinity; }
export function caveStructBlocked(x, z, refY, base) {
  if (inRiver(x, z) && (refY ?? base) < base + 1.5) return true;
  const y = (refY ?? base) - base;
  if (y > 1.2 && inBox(ROPE, x, z, 3)) { const n = polyNear(ROPE, x, z); if (n.d > ROPE.half && n.d < ROPE.half + 0.9) { const h = ROPE.H * Math.min(1, n.s / ROPE.ramp, (ROPE.L - n.s) / ROPE.ramp); if (h > 1.2 && Math.abs(y - h) < 1.6) return true; } }
  return false;
}
/** 구조물·강과 겹치지 않는 자리인가 (야생·블록·장식 자리 비켜 놓기) */
export function caveClear(x, z, m = 3) {
  const rn = riverNear(x, z); if (rn && rn.d < RIVER.half + m) return false;
  if (inBox(ROPE, x, z, m + 2) && polyNear(ROPE, x, z).d < ROPE.half + m) return false;
  if (Math.hypot(x - WALL.x, z - WALL.z) < WALL.r + m) return false;
  const R = WALL.ramp; if (Math.abs(x - R.x) < R.half + m && z < R.z0 + m && z > R.z1 - m) return false;
  if (Math.hypot(x - RIMS.x, z - RIMS.z) < RIMS.r + m) return false;
  if (PILLARS.some(([px, pz, pr]) => Math.hypot(x - px, z - pz) < pr + m)) return false;
  return true;
}
export const inJungle = (x, z, m = 0) => Math.hypot(x - SKY.x, z - SKY.z) < SKY.r + m;

// ---------- 모습 ----------
export function buildCaveStructures(scene, decor, { ground, base, obstacles }) {
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x6d6a62, roughness: 1 });
  const calcite = new THREE.MeshStandardMaterial({ color: 0xc9bfa8, roughness: 0.95 });
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x8a6a45, roughness: 0.9 });
  const ropeMat = new THREE.MeshStandardMaterial({ color: 0xc9a86a, roughness: 1 });
  const add = (m, radius = null) => { if (radius) m.userData.radius = radius; decor.add(m); return m; };

  // ----- 지하 강: 물 띠 + 둑 돌 + 징검다리 -----
  {
    const pos = [], idx = []; let k = 0; const w = RIVER.half + 0.5;
    for (let s = 0; s <= RIVER.L + 0.01; s += 1.5, k++) {
      const p = polyAt(RIVER, Math.min(s, RIVER.L)), nx = -p.uz, nz = p.ux;
      for (const side of [-1, 1]) { const x = p.x + nx * w * side, z = p.z + nz * w * side; pos.push(x, base(x, z) - 0.3, z); }
      if (k > 0) { const a = (k - 1) * 2, b = k * 2; idx.push(a, a + 1, b, a + 1, b + 1, b); }
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx); geo.computeVertexNormals();
    const water = new THREE.Mesh(geo, waterMaterial({ color: 0x1e6fb8, emissive: 0x0b3a6a, emissiveIntensity: 0.7, roughness: 0.1, side: THREE.DoubleSide }, { scale: 0.45, speed: 1.4 }));
    water.userData.noHide = true; decor.add(water);
    const stones = [];
    for (const c of RIVER.crossings) for (let i = -2; i <= 2; i++) { const d = i * 1.2, x = c.x - c.uz * d, z = c.z + c.ux * d; stones.push({ x, y: base(x, z) - 0.1, z, sx: 0.75, sy: 0.25, sz: 0.65, ry: i }); }
    decor.add(makeInstanced(new THREE.CylinderGeometry(1, 1.1, 1, 9), new THREE.MeshStandardMaterial({ color: 0x8c8a80, roughness: 1 }), stones));
    const bank = [];
    for (let s = 2; s < RIVER.L; s += 2.4) { const p = polyAt(RIVER, s); for (const side of [-1, 1]) { if (Math.random() < 0.4) continue; const d = RIVER.half + 0.7 + Math.random(), x = p.x - p.uz * d * side, z = p.z + p.ux * d * side; if (onRiverCrossing(x, z)) continue; bank.push({ x, y: ground(x, z) + 0.15, z, s: 0.35 + Math.random() * 0.5, rx: Math.random() * 3, ry: Math.random() * 3 }); } }
    decor.add(makeInstanced(new THREE.DodecahedronGeometry(1, 0), rockMat, bank));
  }

  // ----- 구름다리: 나무 발판 + 밧줄 난간 + 양 끝 돌탑 -----
  {
    const n = Math.ceil(ROPE.L / 2), hAt = (s) => ROPE.H * Math.min(1, s / ROPE.ramp, (ROPE.L - s) / ROPE.ramp);
    for (let i = 0; i < n; i++) {
      const s0 = (i / n) * ROPE.L, s1 = ((i + 1) / n) * ROPE.L, a = polyAt(ROPE, s0), b = polyAt(ROPE, s1), m = polyAt(ROPE, (s0 + s1) / 2);
      const ya = base(a.x, a.z) + hAt(s0), yb = base(b.x, b.z) + hAt(s1), len = Math.hypot(b.x - a.x, yb - ya, b.z - a.z), hm = (ya + yb) / 2;
      const g = new THREE.Group();
      const plank = new THREE.Mesh(new THREE.BoxGeometry(ROPE.half * 2 + 0.2, 0.14, len - 0.08), woodMat); plank.position.y = -0.07; g.add(plank);
      if (hm > 0.8) for (const side of [-1, 1]) { const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, len, 5), ropeMat); rope.rotation.x = Math.PI / 2; rope.position.set(side * (ROPE.half + 0.05), 0.9, 0); g.add(rope); const v = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.9, 4), ropeMat); v.position.set(side * (ROPE.half + 0.05), 0.45, 0); g.add(v); }
      g.position.set(m.x, hm, m.z); g.lookAt(b.x, yb, b.z); g.userData.noHide = true; decor.add(g); // 걸어 건너는 구름다리 판은 숨기지 않는다
    }
    for (const s of [ROPE.ramp, ROPE.L - ROPE.ramp]) { const p = polyAt(ROPE, s); for (const side of [-1, 1]) { const x = p.x - p.uz * (ROPE.half + 0.5) * side, z = p.z + p.ux * (ROPE.half + 0.5) * side; const post = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.4, ROPE.H + 1.6, 6), rockMat); post.position.set(x, base(x, z) + (ROPE.H + 1.6) / 2, z); add(post, 1); } }
    const p = polyAt(ROPE, 1.5), sign = makePillSprite('🌉 구름다리 · 지하 강 건너 보스 절벽으로', { bg: '#1f2a3a', fg: '#9fe8ff', border: '#9fe8ff' }, 0.7); sign.position.set(p.x + 2.4, base(p.x, p.z) + 2.4, p.z); decor.add(sign);
  }

  // ----- 하늘 구멍 밀림: 쏟아지는 햇빛 기둥 + 밝은 빛 + 나무·고사리·덩굴 -----
  {
    const { x, z, r } = SKY, gy = ground(x, z);
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.8, r * 1.05, 70, 24, 1, true), new THREE.MeshBasicMaterial({ color: 0xfff0c0, transparent: true, opacity: 0.16, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false }));
    shaft.position.set(x, gy + 35, z); shaft.userData.noHide = true; decor.add(shaft);
    const hole = new THREE.Mesh(new THREE.CircleGeometry(r * 0.85, 32), new THREE.MeshBasicMaterial({ color: 0xcfeeff, fog: false })); hole.rotation.x = Math.PI / 2; hole.position.set(x, gy + 60, z); hole.userData.noHide = true; decor.add(hole); // 위로 보이는 하늘
    const sunL = new THREE.PointLight(0xfff2c8, 9, 36, 1.2); sunL.position.set(x, gy + 16, z); scene.add(sunL);
    const glow = new THREE.Mesh(new THREE.CircleGeometry(r, 32), new THREE.MeshBasicMaterial({ color: 0xfff6d0, transparent: true, opacity: 0.18, depthWrite: false })); glow.rotation.x = -Math.PI / 2; glow.position.set(x, gy + 0.05, z); glow.userData.noHide = true; decor.add(glow);
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6b4a32 }), leafMat = new THREE.MeshStandardMaterial({ color: 0x3f9d3a });
    const trunks = [], leaves = [], ferns = [];
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * TAU, d = 2 + Math.random() * (r - 4), tx = x + Math.cos(a) * d, tz = z + Math.sin(a) * d, ty = ground(tx, tz), h = 4 + Math.random() * 4;
      trunks.push({ x: tx, y: ty + h / 2, z: tz, sx: 1.4, sy: h, sz: 1.4 });
      for (let k = 0; k < 6; k++) leaves.push({ x: tx, y: ty + h, z: tz, rz: 1.1, ry: k * 1.05 + a, sx: 1.2, sy: 2.4, sz: 0.4, color: k % 2 ? 0x3f9d3a : 0x4caf50 });
      obstacles.push({ x: tx, z: tz, r: 0.4 });
    }
    for (let i = 0; i < 90; i++) { const a = Math.random() * TAU, d = Math.random() * r, fx = x + Math.cos(a) * d, fz = z + Math.sin(a) * d, fy = ground(fx, fz), sc = 0.7 + Math.random() * 0.6, a0 = Math.random() * 6; for (let k = 0; k < 5; k++) ferns.push({ x: fx, y: fy + 0.35 * sc, z: fz, rz: 1.05, ry: a0 + k * 1.256, sx: sc, sy: sc, sz: sc * 0.35, color: k % 2 ? 0x4f8f36 : 0x5fa43f }); }
    decor.add(makeInstanced(new THREE.CylinderGeometry(0.15, 0.22, 1, 6), trunkMat, trunks, { shadow: true }));
    decor.add(makeInstanced(new THREE.ConeGeometry(0.6, 2, 3), new THREE.MeshStandardMaterial({ color: 0xffffff }), leaves));
    decor.add(makeInstanced(new THREE.ConeGeometry(0.2, 1.2, 3), new THREE.MeshStandardMaterial({ color: 0xffffff }), ferns));
    const vines = []; for (let i = 0; i < 26; i++) { const a = Math.random() * TAU, d = r * (0.85 + Math.random() * 0.2), h = 6 + Math.random() * 14; vines.push({ x: x + Math.cos(a) * d, y: gy + 26 - h / 2, z: z + Math.sin(a) * d, sx: 0.05, sy: h, sz: 0.05 }); }
    decor.add(makeInstanced(new THREE.CylinderGeometry(1, 1, 1, 4), new THREE.MeshStandardMaterial({ color: 0x3f7a2c }), vines));
    const sign = makePillSprite('☀ 하늘 구멍 밀림 · 동굴 속 숲', { bg: '#2f6f2a', fg: '#ffffff', border: '#ffd93d' }, 0.8); sign.position.set(x, gy + 3.2, z + r + 1); decor.add(sign);
  }

  // ----- 거대 석순 + 천장의 종유석 -----
  for (const [px, pz, pr, ph] of PILLARS) {
    const gy = ground(px, pz);
    const col = new THREE.Mesh(new THREE.CylinderGeometry(pr * 0.25, pr, ph, 10, 4), calcite); col.position.set(px, gy + ph / 2, pz); col.castShadow = true; add(col, pr + 1);
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(pr * 1.2, pr * 1.5, 1.2, 10), calcite); ring.position.set(px, gy + 0.6, pz); decor.add(ring);
    obstacles.push({ x: px, z: pz, r: pr * 1.1 });
  }
  {
    const hang = [];
    for (let i = 0; i < 120; i++) { const x = (Math.random() - 0.5) * 150, z = (Math.random() - 0.5) * 150; if (inJungle(x, z, 4)) continue; const h = 2 + Math.random() * 7; hang.push({ x, y: 30 - h / 2, z, sx: 0.4 + Math.random() * 0.9, sy: h, sz: 0.4 + Math.random() * 0.9, rx: Math.PI }); }
    decor.add(makeInstanced(new THREE.ConeGeometry(1, 1, 6), calcite, hang));
  }

  // ----- 만리장성 절벽: 보스 고원(높이 4.5) + 남쪽 오르막 + 뒤의 거대한 흰 절벽 -----
  {
    const { x, z, r, top } = WALL, gy = base(x, z);
    const cliff = new THREE.Mesh(new THREE.CylinderGeometry(r, r + 0.4, top + 1.5, 28, 3), calcite); cliff.position.set(x, gy + (top - 1.5) / 2, z); /* 아래로 1.5m 더 묻는다: 가장자리 바닥이 가운데보다 낮아도 절벽 밑이 뜨지 않게 */ cliff.castShadow = cliff.receiveShadow = true; add(cliff, r);
    const lid = new THREE.Mesh(new THREE.CircleGeometry(r, 28), new THREE.MeshStandardMaterial({ color: 0x9a927e, roughness: 1 })); lid.rotation.x = -Math.PI / 2; lid.position.set(x, gy + top + 0.01, z); lid.userData.noHide = true; decor.add(lid);
    const R = WALL.ramp, y0 = base(R.x, R.z0), rise = gy + top - y0, len = Math.hypot(R.z0 - R.z1, rise), ang = Math.atan2(rise, R.z0 - R.z1); /* 걷는 높이(wallH)와 같은 비탈: 아래 끝 바닥 → 고원 위 */
    const ramp = new THREE.Mesh(new THREE.BoxGeometry(R.half * 2, 0.5, len), new THREE.MeshStandardMaterial({ color: 0x8c8572, roughness: 1 }));
    ramp.position.set(R.x, y0 + rise / 2 - 0.25 / Math.cos(ang), (R.z0 + R.z1) / 2); ramp.rotation.x = ang; add(ramp, 3);
    const backWall = new THREE.Mesh(new THREE.CylinderGeometry(r + 12, r + 14, 26, 32, 4, true, Math.PI * 0.5, Math.PI), calcite.clone()); /* 고원 북쪽 반원 (원기둥 각도 θ: x=sinθ, z=cosθ → θ=π 가 북쪽) */ backWall.material.side = THREE.DoubleSide; backWall.position.set(x, gy + 13, z - 4); backWall.userData.noHide = true; decor.add(backWall);
    for (let i = 0; i < 12; i++) { const th = Math.PI * 0.5 + (i / 11) * Math.PI; obstacles.push({ x: x + Math.sin(th) * (r + 12.5), z: z - 4 + Math.cos(th) * (r + 12.5), r: 2.5 }); }
    const sign = makePillSprite('🧗 만리장성 절벽 · 오르막길로 보스에게', { bg: '#20232e', fg: '#ffd93d', border: '#ffd93d' }, 0.8); sign.position.set(R.x + 2.6, gy + 2.6, R.z0 + 1); decor.add(sign);
  }

  // ----- 계단식 석회 웅덩이: 다섯 단 + 단마다 고인 물 -----
  {
    const { x, z, r, steps, h } = RIMS, gy = base(x, z);
    for (let k = 0; k < steps; k++) {
      const rr = r * (1 - k / steps), top = h * (k + 1);
      const step = new THREE.Mesh(new THREE.CylinderGeometry(rr, rr + 0.15, top, 26), calcite); step.position.set(x, gy + top / 2, z); step.receiveShadow = true; add(step, rr);
      const pool = new THREE.Mesh(new THREE.RingGeometry(Math.max(0.1, rr - r / steps + 0.35), rr - 0.25, 26), new THREE.MeshStandardMaterial({ color: 0x6fd6e8, emissive: 0x1e8aa0, emissiveIntensity: 0.4, roughness: 0.1, transparent: true, opacity: 0.85 }));
      pool.rotation.x = -Math.PI / 2; pool.position.set(x, gy + top + 0.02, z); pool.userData.noHide = true; decor.add(pool);
    }
    const l = new THREE.PointLight(0x7fe8ff, 2.2, 16); l.position.set(x, gy + 3.5, z); scene.add(l);
    const sign = makePillSprite('💧 계단식 석회 웅덩이 · 꼭대기까지 올라가 봐', { bg: '#1f2a3a', fg: '#9fe8ff', border: '#9fe8ff' }, 0.7); sign.position.set(x, gy + 4.2, z + r + 0.5); decor.add(sign);
  }
}
