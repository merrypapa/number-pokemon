import * as THREE from 'three';
import { makeInstanced, makePillSprite } from './world.js';

// 불의산 = 하와이 킬라우에아 화산을 본뜬 구조물.
//  - 용암 동굴 (서스턴 용암 동굴): 굳은 용암이 만든 긴 굴. 안으로 걸어서 지나가고(천장 등불), 북쪽 돌무더기 비탈로 지붕 위에도 올라간다.
//  - 분화구 전망대: 큰 화산 동쪽 가장자리에서 용암 호수 위로 쑥 내민 전망 데크. 가운데선 용암 분수(할레마우마우)가 솟는다.
//  - 흐르는 용암 강: 작은 화산에서 남서쪽 용암 웅덩이까지 흘러내린다. 못 들어가고, 굳은 용암 돌다리(아치)나 징검돌로 건넌다.
//  - 유황 증기 데크길: 노란 유황 땅에서 김이 솟는 곳 사이로 놓인 나무 데크길 (증기 구멍은 뜨거워서 못 밟는다).
//  - 오히아 숲: 들어오는 곳 둘레는 빨간 레후아 꽃이 피는 오히아 나무와 나무고사리 숲 (화산 기슭의 비 숲).

const TAU = Math.PI * 2;
function segNear(px, pz, ax, az, bx, bz) {
  const vx = bx - ax, vz = bz - az, L2 = vx * vx + vz * vz || 1;
  const t = ((px - ax) * vx + (pz - az) * vz) / L2, tc = Math.max(0, Math.min(1, t));
  return { d: Math.hypot(px - (ax + vx * tc), pz - (az + vz * tc)), t, tc };
}
function polyNear(pts, x, z) { let best = { d: Infinity, i: 0, t: 0 }; for (let i = 0; i + 1 < pts.length; i++) { const r = segNear(x, z, ...pts[i], ...pts[i + 1]); if (r.d < best.d) best = { d: r.d, i, t: r.tc }; } return best; }

// ----- 용암 동굴 -----
export const TUBE = { a: [-28, 93], b: [-70, 82], wall: 3.0, R: 4.6, roof: 4.05, inner: 3.0 }; // wall: 안쪽 벽 (여기부터 막힘), R: 바깥 반지름, roof: 지붕 높이
const TL = Math.hypot(TUBE.b[0] - TUBE.a[0], TUBE.b[1] - TUBE.a[1]), TU = [(TUBE.b[0] - TUBE.a[0]) / TL, (TUBE.b[1] - TUBE.a[1]) / TL], TN = [-TU[1], TU[0]]; // TN: 북쪽 옆
const TP = [TUBE.a[0] + (TUBE.b[0] - TUBE.a[0]) * 0.55, TUBE.a[1] + (TUBE.b[1] - TUBE.a[1]) * 0.55];
export const TUBE_RAMP = { a: [TP[0] + TN[0] * 4.4, TP[1] + TN[1] * 4.4], b: [TP[0] + TN[0] * 14, TP[1] + TN[1] * 14], half: 1.6 }; // 지붕으로 오르는 돌무더기 비탈
// ----- 분화구 전망대 (큰 화산 동쪽 가장자리) -----
export const OVERLOOK = { x0: 27, x1: 36.6, z: -40.9, half: 1.6 };
// ----- 용암 강 -----
export const LAVA_RIVER = { pts: [[93.7, 64.8], [86, 50], [83, 38], [76, 28], [71.8, 20.8]], half: 2.0 };
function riverPoint(i, t) { const [ax, az] = LAVA_RIVER.pts[i], [bx, bz] = LAVA_RIVER.pts[i + 1], l = Math.hypot(bx - ax, bz - az); return { x: ax + (bx - ax) * t, z: az + (bz - az) * t, ux: (bx - ax) / l, uz: (bz - az) / l }; }
const ARCHP = riverPoint(1, 0.5), STONEP = riverPoint(2, 0.55);
export const LAVA_ARCH = { x: ARCHP.x, z: ARCHP.z, nx: -ARCHP.uz, nz: ARCHP.ux, len: 5, half: 1.4, rise: 1.3 }; // 강을 가로지르는 굳은 용암 돌다리
export const STONES = [-1.9, -0.65, 0.65, 1.9].map((o) => ({ x: STONEP.x - STONEP.uz * o, z: STONEP.z + STONEP.ux * o, r: 0.78 }));
// ----- 유황 증기 데크길 -----
export const STEAM = { a: [-66, -32], b: [-90, -8], half: 1.1, lift: 0.7 };
const SL = Math.hypot(STEAM.b[0] - STEAM.a[0], STEAM.b[1] - STEAM.a[1]), SN = [-(STEAM.b[1] - STEAM.a[1]) / SL, (STEAM.b[0] - STEAM.a[0]) / SL];
export const VENTS = [];
for (let k = 0; k < 8; k++) { const t = 0.12 + k * 0.11, s = k % 2 ? 1 : -1, off = 3.3 + (k % 3) * 0.6; VENTS.push({ x: STEAM.a[0] + (STEAM.b[0] - STEAM.a[0]) * t + SN[0] * s * off, z: STEAM.a[1] + (STEAM.b[1] - STEAM.a[1]) * t + SN[1] * s * off, r: 1.3 }); }

let raw = null, tA = 0, tB = 0;
/** volcano.js 가 원래 땅 높이 함수를 넘겨준다 (용암 동굴 바닥을 평평하게 고르는 데 쓴다) */
export function setRawGround(fn) { raw = fn; tA = fn(...TUBE.a); tB = fn(...TUBE.b); }
function tubeAt(x, z) { const r = segNear(x, z, ...TUBE.a, ...TUBE.b); return r.t < 0 || r.t > 1 ? null : { d: r.d, t: r.t, base: tA + (tB - tA) * r.t }; }
export function inTube(x, z, m = 0) { const tb = tubeAt(x, z); return !!tb && tb.d < TUBE.R + m; }
export function riverDist(x, z) { return polyNear(LAVA_RIVER.pts, x, z).d; }

/** 땅 높이 고치기: 용암 동굴 바닥은 평평하게, 용암 강 바닥은 살짝 파인다 */
export function volcGround(x, z) {
  let y = raw(x, z);
  const tb = tubeAt(x, z);
  if (tb && tb.d < 6.5) { const w = tb.d < 5 ? 1 : (6.5 - tb.d) / 1.5; y = y + (tb.base - y) * w; }
  const rd = riverDist(x, z), cw = LAVA_RIVER.half + 1.6;
  if (rd < cw) y -= 0.5 * (1 - rd / cw);
  return y;
}
function archH(x, z) { const A = LAVA_ARCH, dx = x - A.x, dz = z - A.z, s = dx * A.nx + dz * A.nz, w = Math.abs(dx * A.nz - dz * A.nx); if (Math.abs(s) > A.len || w > A.half) return null; return A.rise * Math.cos((s / A.len) * Math.PI / 2) + 0.15; }
function onStone(x, z) { return STONES.some((s) => Math.hypot(x - s.x, z - s.z) < s.r); }
function onSteamDeck(x, z) { const r = segNear(x, z, ...STEAM.a, ...STEAM.b); return r.t >= -0.01 && r.t <= 1.01 && r.d < STEAM.half; }
function onOverlook(x, z) { return x > OVERLOOK.x0 && x < OVERLOOK.x1 && Math.abs(z - OVERLOOK.z) < OVERLOOK.half; }
let overlookY = null;
function rampH(x, z) {
  const R = TUBE_RAMP, r = segNear(x, z, ...R.a, ...R.b); if (r.t < 0 || r.t > 1 || r.d > R.half) return null;
  const top = tA + (tB - tA) * 0.55 + TUBE.roof, bot = raw(...R.b); return top + (bot - top) * r.t;
}

/** 구조물 높이. ground: volcGround 값. 단단한 것(돌다리·징검돌·데크·전망대·비탈)은 늘, 용암 동굴 지붕은 겹치는 층(지금 높이+0.7 아래일 때만) */
export function volcStructHeight(x, z, refY, ground) {
  let y = ground;
  const ah = archH(x, z); if (ah != null) y = Math.max(y, ground + ah);
  if (onStone(x, z)) y = Math.max(y, ground + 0.35);
  if (onSteamDeck(x, z)) y = Math.max(y, raw(x, z) + STEAM.lift);
  if (onOverlook(x, z)) { overlookY ??= raw(OVERLOOK.x1 - 1, OVERLOOK.z) + 0.25; y = Math.max(y, overlookY); }
  const rh = rampH(x, z); if (rh != null) y = Math.max(y, rh);
  const tb = tubeAt(x, z);
  if (tb && tb.d < TUBE.R) { const top = tb.base + TUBE.roof; if (top <= (refY ?? ground) + 0.7) y = Math.max(y, top); }
  return y;
}
/** 용암 동굴 안: 천장 (카메라가 지붕 밖으로 나가지 않게) */
export function volcStructCeiling(x, z, y) { // x,z: 카메라 자리, y: 주인공 높이. 굴 입구 바깥 조금까지 눌러서 굴 속 주인공이 지붕에 가리지 않게
  const r = segNear(x, z, ...TUBE.a, ...TUBE.b); if (r.t < -0.22 || r.t > 1.22 || r.d > TUBE.R + 1.5) return Infinity;
  const base = tA + (tB - tA) * r.tc; return y < base + TUBE.inner ? base + TUBE.inner + 0.2 : Infinity;
}
/** 못 가는 곳: 용암 강(돌다리·징검돌 빼고), 증기 구멍, 동굴 벽(안에서·밖에서), 전망대 난간 */
export function volcStructBlocked(x, z, refY) {
  if (riverDist(x, z) < LAVA_RIVER.half && archH(x, z) == null && !onStone(x, z)) return true;
  if (VENTS.some((v) => Math.hypot(x - v.x, z - v.z) < v.r)) return true;
  const tb = tubeAt(x, z);
  if (tb && tb.d > TUBE.wall && tb.d < TUBE.R + 0.2 && (refY ?? tb.base) < tb.base + TUBE.roof - 0.8 && rampH(x, z) == null) return true;
  if (x > OVERLOOK.x0 - 0.6 && x < OVERLOOK.x1 - 1.2 && Math.abs(z - OVERLOOK.z) >= OVERLOOK.half && Math.abs(z - OVERLOOK.z) < OVERLOOK.half + 0.8 && overlookY != null && (refY ?? 0) > overlookY - 0.5) return true;
  if (onOverlook(x, z) && x < OVERLOOK.x0 + 0.5) return true;
  return false;
}
/** 전망대 위는 용암 호수 위라도 걸을 수 있다 */
export function volcUnblockLava(x, z) { return onOverlook(x, z); }
/** 포켓몬·블록 자리를 구조물에서 비켜 놓을 때 */
export function volcClear(x, z, m = 3) {
  if (riverDist(x, z) < LAVA_RIVER.half + m) return false;
  if (VENTS.some((v) => Math.hypot(x - v.x, z - v.z) < v.r + m)) return false;
  if (segNear(x, z, ...STEAM.a, ...STEAM.b).d < STEAM.half + m) return false;
  const tb = tubeAt(x, z); if (tb && tb.d < TUBE.R + m) return false;
  if (segNear(x, z, ...TUBE_RAMP.a, ...TUBE_RAMP.b).d < TUBE_RAMP.half + m) return false;
  return true;
}
/** 오히아 숲 자리 (들어오는 곳 둘레) */
export function inOhiaForest(x, z) { return z > 78 && Math.abs(x) < 125; }

export function buildVolcanoStructures(scene, decor, { height, obstacles, avoid }) {
  const add = (m, r) => { if (r) m.userData.radius = r; decor.add(m); return m; };
  const basalt = new THREE.MeshStandardMaterial({ color: 0x3d302b, roughness: 0.95 }), basaltL = new THREE.MeshStandardMaterial({ color: 0x4a3a34, roughness: 1 });
  const wood = new THREE.MeshStandardMaterial({ color: 0x9a6a3e, roughness: 0.9 }), woodDark = new THREE.MeshStandardMaterial({ color: 0x5a3a20, roughness: 0.9 });

  // ----- 용암 동굴: 반원 통 (바깥 껍질 + 안 벽) + 천장 등불 + 입구 고사리 -----
  {
    const sh = new THREE.Shape(), sy = 0.88; // 위아래로 살짝 눌린 반원 고리
    for (let i = 0; i <= 20; i++) { const a = (i / 20) * Math.PI; sh.lineTo(Math.cos(a) * TUBE.R, Math.sin(a) * TUBE.R * sy); }
    for (let i = 20; i >= 0; i--) { const a = (i / 20) * Math.PI; sh.lineTo(Math.cos(a) * (TUBE.wall + 0.35), Math.sin(a) * (TUBE.wall + 0.35) * sy * 1.12); }
    const geo = new THREE.ExtrudeGeometry(sh, { depth: TL, bevelEnabled: false, curveSegments: 1 });
    // 바깥 껍질: 주인공이 굴 안에 있으면 숨긴다 (main resolveCamera 의 cutaway). 그래도 안쪽 벽(뒷면만 그리는 반원통)은 남아서
    // 카메라 쪽 벽은 비쳐 보이고 건너편 안벽만 보인다 = 잘라 낸 단면처럼 굴 속 주인공이 보인다.
    const tube = new THREE.Mesh(geo, basalt); tube.castShadow = tube.receiveShadow = true;
    tube.position.set(TUBE.a[0], tA, TUBE.a[1]); tube.lookAt(TUBE.b[0], tB, TUBE.b[1]); // +z 가 굴 방향
    tube.userData.cutaway = (head) => { const tb = tubeAt(head.x, head.z); return !!tb && tb.d < TUBE.R && head.y < tb.base + TUBE.roof; };
    decor.add(tube);
    const ir = TUBE.wall + 0.35, inGeo = new THREE.CylinderGeometry(ir, ir, TL, 18, 1, true, Math.PI / 2, Math.PI).rotateX(Math.PI / 2).translate(0, 0, TL / 2);
    const inner = new THREE.Mesh(inGeo, new THREE.MeshStandardMaterial({ color: 0x5a463c, roughness: 0.9, side: THREE.BackSide }));
    inner.scale.y = 0.88 * 1.12; inner.position.copy(tube.position); inner.quaternion.copy(tube.quaternion); inner.userData.noHide = true; decor.add(inner);
    const lamps = [], lampMat = new THREE.MeshStandardMaterial({ color: 0xffe0a0, emissive: 0xffb347, emissiveIntensity: 1.4 });
    for (let i = 1; i < 8; i++) { const t = i / 8, x = TUBE.a[0] + (TUBE.b[0] - TUBE.a[0]) * t, z = TUBE.a[1] + (TUBE.b[1] - TUBE.a[1]) * t; lamps.push({ x, y: tA + (tB - tA) * t + TUBE.inner - 0.25, z, s: 0.22 }); }
    decor.add(makeInstanced(new THREE.SphereGeometry(1, 8, 6), lampMat, lamps));
    const mid = new THREE.PointLight(0xffb347, 6, 26); mid.position.set(TP[0], tA + (tB - tA) * 0.55 + 2.4, TP[1]); scene.add(mid);
    // 입구 둘레 바위 테
    for (const [p, y] of [[TUBE.a, tA], [TUBE.b, tB]]) { const ring = new THREE.Mesh(new THREE.TorusGeometry(TUBE.R - 0.4, 0.7, 6, 14, Math.PI), basaltL); ring.position.set(p[0], y, p[1]); ring.rotation.y = Math.atan2(TU[0], TU[1]); ring.scale.y = 0.88; ring.userData.cutaway = tube.userData.cutaway; decor.add(ring); }
    // 지붕 오르는 돌무더기 비탈
    const R = TUBE_RAMP, rl = Math.hypot(R.b[0] - R.a[0], R.b[1] - R.a[1]), rocks = [];
    for (let i = 0; i < 9; i++) { const t = (i + 0.5) / 9, x = R.a[0] + (R.b[0] - R.a[0]) * t, z = R.a[1] + (R.b[1] - R.a[1]) * t, y = rampH(x, z); rocks.push({ x, y: (y + volcGround(x, z)) / 2 - 0.1, z, sx: R.half * 1.3, sy: Math.max(0.4, y - volcGround(x, z) + 0.4), sz: rl / 9 * 0.75, ry: Math.atan2(R.b[0] - R.a[0], R.b[1] - R.a[1]) }); }
    decor.add(makeInstanced(new THREE.BoxGeometry(1, 1, 1), basaltL, rocks, { shadow: true }));
    const sign = makePillSprite('🌋 용암 동굴 · 안으로 지나가거나 북쪽 비탈로 지붕 위에!', { bg: '#3a1a10', fg: '#ffd1a8', border: '#ff8a3a' }, 0.75);
    sign.position.set(TUBE.a[0] + 4, tA + 5.6, TUBE.a[1] + 3); decor.add(sign);
  }

  // ----- 분화구 전망대 + 용암 분수 -----
  const fountain = [];
  const fMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.45, 6, 5), new THREE.MeshBasicMaterial({ color: 0xffa040 }), 40);
  {
    const O = OVERLOOK, y = raw(O.x1 - 1, O.z) + 0.25, len = O.x1 - O.x0;
    const g = new THREE.Group(); g.position.set((O.x0 + O.x1) / 2, y, O.z);
    const deck = new THREE.Mesh(new THREE.BoxGeometry(len, 0.25, O.half * 2), wood); deck.position.y = -0.12; deck.receiveShadow = true; g.add(deck);
    for (const s of [-1, 1]) { const rail = new THREE.Mesh(new THREE.BoxGeometry(len, 0.1, 0.1), woodDark); rail.position.set(0, 0.95, s * O.half); g.add(rail); for (let i = 0; i <= 5; i++) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1, 0.12), woodDark); p.position.set(-len / 2 + (i / 5) * len, 0.45, s * O.half); g.add(p); } }
    const endRail = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, O.half * 2), woodDark); endRail.position.set(-len / 2, 0.95, 0); g.add(endRail);
    for (const s of [-1, 1]) { const brace = new THREE.Mesh(new THREE.BoxGeometry(0.2, 4.5, 0.2), woodDark); brace.position.set(len / 2 - 3.2, -2.2, s * (O.half - 0.2)); brace.rotation.z = -0.65; g.add(brace); }
    add(g, 3);
    const sign = makePillSprite('🔭 분화구 전망대 · 용암 호수가 한눈에!', { bg: '#3a1a10', fg: '#ffd1a8', border: '#ff8a3a' }, 0.75); sign.position.set(O.x1 + 1.5, y + 2.6, O.z + 2.5); decor.add(sign);
    for (let i = 0; i < 40; i++) fountain.push({ a: Math.random() * TAU, sp: 2 + Math.random() * 3, ph: Math.random() * 3, v: 0.7 + Math.random() * 0.6 });
    fMesh.frustumCulled = false; scene.add(fMesh);
  }

  // ----- 용암 강 (흐르는 띠) + 굳은 용암 돌다리 + 징검돌 -----
  let lavaTex;
  {
    const cv = document.createElement('canvas'); cv.width = 64; cv.height = 128;
    const ctx = cv.getContext('2d'); ctx.fillStyle = '#ff5a10'; ctx.fillRect(0, 0, 64, 128);
    for (let i = 0; i < 40; i++) { ctx.fillStyle = Math.random() < 0.5 ? 'rgba(255,220,80,0.7)' : 'rgba(120,20,0,0.55)'; ctx.beginPath(); ctx.ellipse(Math.random() * 64, Math.random() * 128, 3 + Math.random() * 8, 6 + Math.random() * 14, 0, 0, TAU); ctx.fill(); }
    lavaTex = new THREE.CanvasTexture(cv); lavaTex.wrapS = lavaTex.wrapT = THREE.RepeatWrapping; lavaTex.colorSpace = THREE.SRGBColorSpace;
    const pos = [], uv = [], idx = []; let v = 0, along = 0;
    const P = LAVA_RIVER.pts, w = LAVA_RIVER.half + 0.3;
    const samples = [];
    for (let i = 0; i + 1 < P.length; i++) { const l = Math.hypot(P[i + 1][0] - P[i][0], P[i + 1][1] - P[i][1]), n = Math.ceil(l / 1.2); for (let k = 0; k < n; k++) samples.push(riverPoint(i, k / n)); if (i + 2 === P.length) samples.push(riverPoint(i, 1)); }
    samples.forEach((s, k) => { if (k) along += Math.hypot(s.x - samples[k - 1].x, s.z - samples[k - 1].z); for (const side of [-1, 1]) { const x = s.x - s.uz * w * side, z = s.z + s.ux * w * side; pos.push(x, volcGround(x, z) + 0.12, z); uv.push(side < 0 ? 0 : 1, along / 6); } if (k) { const a = v - 2, b = v - 1, c = v, d = v + 1; idx.push(a, c, b, b, c, d); } v += 2; });
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(idx); geo.computeVertexNormals();
    const river = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: lavaTex, emissive: 0xff3300, emissiveMap: lavaTex, emissiveIntensity: 1.2, roughness: 0.6, side: THREE.DoubleSide }));
    river.userData.noHide = true; scene.add(river);
    const l1 = new THREE.PointLight(0xff5a1f, 5, 20); l1.position.set(P[2][0], volcGround(...P[2]) + 2, P[2][1]); scene.add(l1);
    // 돌다리: 아치 모양 판 여러 장
    const A = LAVA_ARCH, n = 12, slabs = [];
    for (let i = 0; i < n; i++) { const s = -A.len + (2 * A.len) * (i + 0.5) / n, x = A.x + A.nx * s, z = A.z + A.nz * s, y = height(x, z, 99); slabs.push({ x, y: y - 0.25, z, sx: A.half * 2.2, sy: 0.5, sz: (2 * A.len) / n + 0.1, ry: Math.atan2(A.nx, A.nz), rx: -Math.sin((s / A.len) * Math.PI / 2) * 0.25 }); }
    decor.add(makeInstanced(new THREE.BoxGeometry(1, 1, 1), basalt, slabs, { shadow: true }));
    decor.add(makeInstanced(new THREE.CylinderGeometry(1, 1.1, 0.7, 8), basaltL, STONES.map((s) => ({ x: s.x, y: height(s.x, s.z, 99) - 0.3, z: s.z, sx: s.r, sz: s.r, ry: s.x }))));
    const sign = makePillSprite('🔥 흐르는 용암 강 · 돌다리나 징검돌로 건너!', { bg: '#3a1a10', fg: '#ffd1a8', border: '#ff8a3a' }, 0.75); sign.position.set(A.x + A.nx * (A.len + 2), height(A.x + A.nx * (A.len + 2), A.z + A.nz * (A.len + 2)) + 2.6, A.z + A.nz * (A.len + 2)); decor.add(sign);
  }

  // ----- 유황 증기 데크길 -----
  const steam = [];
  {
    const n = Math.round(SL / 0.6), planks = [], posts = [], ry = Math.atan2(STEAM.b[0] - STEAM.a[0], STEAM.b[1] - STEAM.a[1]);
    for (let i = 0; i < n; i++) { const t = (i + 0.5) / n, x = STEAM.a[0] + (STEAM.b[0] - STEAM.a[0]) * t, z = STEAM.a[1] + (STEAM.b[1] - STEAM.a[1]) * t, y = raw(x, z) + STEAM.lift; planks.push({ x, y: y - 0.07, z, sx: STEAM.half * 2 + 0.2, sy: 0.14, sz: SL / n - 0.06, ry }); if (i % 3 === 0) for (const s of [-1, 1]) { const px = x + SN[0] * s * STEAM.half, pz = z + SN[1] * s * STEAM.half, gy = raw(px, pz); posts.push({ x: px, y: (gy + y) / 2, z: pz, sx: 0.14, sy: y - gy + 0.05, sz: 0.14 }); } }
    decor.add(makeInstanced(new THREE.BoxGeometry(1, 1, 1), wood, planks));
    decor.add(makeInstanced(new THREE.BoxGeometry(1, 1, 1), woodDark, posts));
    const sulfur = [], holes = [];
    for (const v of VENTS) { const y = raw(v.x, v.z); sulfur.push({ x: v.x, y: y + 0.04, z: v.z, sx: v.r + 0.9, sy: 0.06, sz: v.r + 0.6, ry: v.x }); holes.push({ x: v.x, y: y + 0.08, z: v.z, sx: v.r * 0.55, sy: 0.05, sz: v.r * 0.45 }); obstacles.push({ x: v.x, z: v.z, r: 0.5 }); }
    decor.add(makeInstanced(new THREE.CylinderGeometry(1, 1, 1, 12), new THREE.MeshStandardMaterial({ color: 0xe8d24a, roughness: 1 }), sulfur));
    decor.add(makeInstanced(new THREE.CylinderGeometry(1, 1, 1, 10), new THREE.MeshStandardMaterial({ color: 0x3a2a10, emissive: 0x6a3a00, emissiveIntensity: 0.5 }), holes));
    const cv = document.createElement('canvas'); cv.width = cv.height = 64; const ctx = cv.getContext('2d'), gr = ctx.createRadialGradient(32, 32, 3, 32, 32, 30); gr.addColorStop(0, 'rgba(255,255,255,0.75)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = gr; ctx.fillRect(0, 0, 64, 64);
    const tex = new THREE.CanvasTexture(cv);
    for (const v of VENTS) for (let k = 0; k < 3; k++) { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false })); sp.userData = { x: v.x, z: v.z, y: raw(v.x, v.z), ph: Math.random() * 4 + k * 1.3 }; scene.add(sp); steam.push(sp); }
    const [sx, sz] = STEAM.a, sign = makePillSprite('♨ 유황 증기 데크길 · 김 나는 구멍은 뜨거워!', { bg: '#5a4a00', fg: '#ffffff', border: '#ffe066' }, 0.75); sign.position.set(sx + 1.5, raw(sx, sz) + 3, sz - 1.5); decor.add(sign);
  }

  // ----- 오히아 숲: 빨간 레후아 꽃 + 나무고사리 -----
  {
    const trunks = [], crowns = [], blossoms = [], fernTrunks = [], fronds = [];
    let n = 0, tries = 0;
    while (n < 46 && tries++ < 3000) {
      const x = (Math.random() - 0.5) * 240, z = 80 + Math.random() * 65;
      if (!inOhiaForest(x, z) || avoid(x, z) || !volcClear(x, z, 2)) continue;
      const y = height(x, z, -99), h = 3 + Math.random() * 2;
      trunks.push({ x, y: y + h / 2, z, sx: 0.22, sy: h, sz: 0.22, rz: (Math.random() - 0.5) * 0.2 });
      for (let k = 0; k < 3; k++) { const a = k * 2.1 + Math.random(), r = 0.7 + Math.random() * 0.5; crowns.push({ x: x + Math.cos(a) * r, y: y + h + Math.random() * 0.6, z: z + Math.sin(a) * r, sx: 1.3, sy: 0.9, sz: 1.3 }); }
      for (let k = 0; k < 6; k++) { const a = Math.random() * TAU, r = 0.6 + Math.random() * 1.1; blossoms.push({ x: x + Math.cos(a) * r, y: y + h + 0.4 + Math.random() * 0.8, z: z + Math.sin(a) * r, s: 0.22 + Math.random() * 0.1 }); }
      obstacles.push({ x, z, r: 0.4 }); n++;
    }
    n = 0; tries = 0;
    while (n < 60 && tries++ < 3000) {
      const x = (Math.random() - 0.5) * 240, z = 80 + Math.random() * 65;
      if (!inOhiaForest(x, z) || avoid(x, z) || !volcClear(x, z, 1.5)) continue;
      const y = height(x, z, -99), h = 0.8 + Math.random() * 1.4;
      fernTrunks.push({ x, y: y + h / 2, z, sx: 0.16, sy: h, sz: 0.16 });
      for (let k = 0; k < 7; k++) fronds.push({ x, y: y + h, z, ry: (k / 7) * TAU, rx: -1.0 });
      n++;
    }
    const bark = new THREE.MeshStandardMaterial({ color: 0x6e6258, roughness: 1 });
    decor.add(makeInstanced(new THREE.CylinderGeometry(0.7, 1, 1, 6), bark, trunks));
    decor.add(makeInstanced(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ color: 0x3f7a3a, roughness: 1, flatShading: true }), crowns));
    decor.add(makeInstanced(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ color: 0xe8203a, emissive: 0x500010, roughness: 0.8 }), blossoms));
    decor.add(makeInstanced(new THREE.CylinderGeometry(0.8, 1, 1, 6), new THREE.MeshStandardMaterial({ color: 0x4a3420 }), fernTrunks));
    const frondGeo = new THREE.PlaneGeometry(0.5, 1.8); frondGeo.translate(0, 0.85, 0);
    decor.add(makeInstanced(frondGeo, new THREE.MeshStandardMaterial({ color: 0x4f9a3a, side: THREE.DoubleSide }), fronds));
  }

  const m4 = new THREE.Matrix4(), v3 = new THREE.Vector3(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
  return {
    animate(t, crater) {
      lavaTex.offset.y = -t * 0.12; // 용암이 아래로 흐른다
      fountain.forEach((f, i) => { // 할레마우마우: 분화구 가운데서 솟았다 떨어지는 용암 방울
        const life = ((t * 0.6 + f.ph) % 2.4) / 2.4, r = life * f.sp;
        v3.set(crater.x + Math.cos(f.a) * r, crater.lake + life * 12 * f.v - life * life * 12 * f.v, crater.z + Math.sin(f.a) * r);
        sc.setScalar(life < 0.95 ? 1 - life * 0.5 : 0); fMesh.setMatrixAt(i, m4.compose(v3, q, sc));
      });
      fMesh.instanceMatrix.needsUpdate = true;
      for (const s of steam) { const u = s.userData, life = ((t * 0.5 + u.ph) % 4) / 4; s.position.set(u.x + Math.sin(life * 3 + u.ph) * 0.4, u.y + 0.5 + life * 5, u.z); s.scale.setScalar(1.2 + life * 3.5); s.material.opacity = 0.6 * (1 - life); }
    },
  };
}
