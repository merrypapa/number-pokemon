import * as THREE from 'three';
import { makeInstanced, makePillSprite } from './world.js';

// 푸른숲 = 야쿠시마(시라타니운스이쿄) 이끼 숲을 본뜬 구조물들. 평지에서 위아래로 오가는 길을 만든다.
//  - 개울: 서북쪽에서 연못까지 굽이쳐 흐른다. 물에는 못 들어가고 흙길이 지나는 곳은 나무다리(world.js 가 자동으로 놓는다), 그 밖에는 징검다리로 건넌다.
//  - 나무 데크길: 이끼 바위 사이를 2.6m 높이로 지나는 산책로. 양 끝 경사로로 오르고, 데크 아래로도 걸어 다닐 수 있다(층이 겹치는 지형: refY).
//  - 할아버지 삼나무: 줄기 둘레를 한 바퀴 감아 오르는 나선 길 → 9m 높이 둥근 전망대.
//  - 쓰러진 고목: 속이 빈 거대한 통나무. 흙길이 그 속을 지나고(터널), 옆의 이끼 비탈로 올라가면 통나무 위를 걷는다.
//  - 이끼 바위 언덕: 점프해야 오르는 바위 다섯 개(1.0 → 4.3m). 꼭대기 전망 바위에 블록.
// 높이 규칙: "단단한 것"(바위·비탈·징검돌)은 어느 높이에서나 지형이고, "겹치는 것"(데크·나선길·전망대·통나무 위)은 지금 서 있는 높이(refY)+0.7 아래일 때만 지형.
// 그래서 데크·전망대 아래로 걸어 다니고, 경사로 끝에서만 올라탄다(동굴탑과 같은 방식). 숲의 턱 높이(ledge)는 0.9: 바위 가장자리는 뛰어야 오른다.

const TAU = Math.PI * 2;
function segNear(px, pz, ax, az, bx, bz) {
  const vx = bx - ax, vz = bz - az, L2 = vx * vx + vz * vz || 1;
  const t = Math.max(0, Math.min(1, ((px - ax) * vx + (pz - az) * vz) / L2));
  const x = ax + vx * t, z = az + vz * t;
  return { d: Math.hypot(px - x, pz - z), t, x, z };
}
/** 꺾은선 위 가장 가까운 점: d(거리) · s(시작에서 길이) · u(진행 방향) · side(왼쪽+/오른쪽-) */
function polyNear(P, px, pz) {
  let best = null, acc = 0;
  for (let i = 0; i + 1 < P.pts.length; i++) {
    const [ax, az] = P.pts[i], [bx, bz] = P.pts[i + 1], len = P.lens[i];
    const r = segNear(px, pz, ax, az, bx, bz);
    if (!best || r.d < best.d) { const ux = (bx - ax) / len, uz = (bz - az) / len; best = { d: r.d, s: acc + r.t * len, ux, uz, x: r.x, z: r.z, side: Math.sign((px - r.x) * -uz + (pz - r.z) * ux) || 1 }; }
    acc += len;
  }
  return best;
}
function poly(pts, extra = {}) {
  const lens = []; let L = 0;
  for (let i = 0; i + 1 < pts.length; i++) { const l = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]); lens.push(l); L += l; }
  const xs = pts.map((p) => p[0]), zs = pts.map((p) => p[1]);
  return { pts, lens, L, box: [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)], ...extra };
}
const inBox = (P, x, z, m) => x > P.box[0] - m && x < P.box[1] + m && z > P.box[2] - m && z < P.box[3] + m;
/** 꺾은선에서 길이 s 인 점 */
function polyAt(P, s) {
  let acc = 0;
  for (let i = 0; i + 1 < P.pts.length; i++) {
    if (s <= acc + P.lens[i] || i === P.pts.length - 2) { const t = Math.max(0, Math.min(1, (s - acc) / P.lens[i])); const [ax, az] = P.pts[i], [bx, bz] = P.pts[i + 1]; return { x: ax + (bx - ax) * t, z: az + (bz - az) * t, ux: (bx - ax) / P.lens[i], uz: (bz - az) / P.lens[i] }; }
    acc += P.lens[i];
  }
  return null;
}

// ---------- 배치 (푸른숲 좌표: 시작 지점 (0,12), 남쪽 (0,40) 은 마을 문, 북쪽 (z 음수) 으로 갈수록 깊은 숲) ----------
export const STREAM = poly([[-142, -24], [-110, -12], [-84, -26], [-60, -40], [-30, -46], [0, -44], [24, -36], [44, -22], [56, -2], [62, 22], [64, 46]], { half: 2.4, carve: 3.8 });
// 징검다리: 흙길 다리가 없는 굽이마다 (아이가 숲 어디서든 개울을 건널 수 있게)
STREAM.crossings = [-118, -72, 12, 52, 61].map((x) => { // x 좌표 근처의 개울 점에 놓는다
  let best = null; for (let s = 0; s <= STREAM.L; s += 0.5) { const p = polyAt(STREAM, s); if (!best || Math.abs(p.x - x) < Math.abs(best.x - x)) best = p; }
  return best;
});
export const DECK = poly([[14, -16], [26, -24], [38, -29], [50, -35], [62, -46], [72, -55]], { half: 1.1, H: 2.6, ramp: 9 });
export const CEDAR = { x: 52, z: -78, RT: 3.0, RIN: 3.3, ROUT: 6.0, PLAT: 8.6, H: 9, a0: Math.PI / 2 }; // a0: 나선길 시작 방향 (남쪽 = 마을 쪽)
// 쓰러진 고목: 흙길 (0,-12.3)→(-32.7,-28.6) 위에 길을 따라 놓인다 (길이 그 속을 지난다)
export const LOG = (() => {
  const ax = 0, az = -12.3, bx = -32.7, bz = -28.6, l = Math.hypot(bx - ax, bz - az), ux = (bx - ax) / l, uz = (bz - az) / l;
  const cx = -16.35, cz = -20.45, L = 11;
  return { x1: cx - ux * L / 2, z1: cz - uz * L / 2, ux, uz, L, R: 1.9, inner: 1.25, top: 3.8, ramp: { d0: 1.7, d1: 4.2, s0: 0, s1: 9.5 } };
})();
// 이끼 바위 언덕: 점프해서 하나씩 오르는 바위 (높이 차 1.1 → 걸어서는 못 오르고 뛰어야 한다)
export const ROCKS = [
  { x: -60, z: 14, r: 2.1, top: 1.0 }, { x: -63.6, z: 10.4, r: 2.0, top: 2.1 }, { x: -67.6, z: 7.6, r: 2.1, top: 3.2 },
  { x: -72.2, z: 4.6, r: 3.6, top: 4.3, view: true },
];

// ---------- 높이 ----------
function streamNear(x, z) { return inBox(STREAM, x, z, STREAM.carve + 1) ? polyNear(STREAM, x, z) : null; }
/** 징검다리 위인가 (개울을 가로지르는 폭 1.8m 띠) */
export function onCrossing(x, z) {
  for (const c of STREAM.crossings) {
    const dx = x - c.x, dz = z - c.z, along = dx * c.ux + dz * c.uz, across = -dx * c.uz + dz * c.ux;
    if (Math.abs(along) < 0.9 && Math.abs(across) < STREAM.half + 1.4) return true;
  }
  return false;
}
/** 개울 바닥 깎기 (0 ~ 0.9m). 징검다리 위는 안 깎는다 (돌 높이) */
export function streamCarve(x, z) {
  const n = streamNear(x, z); if (!n || n.d >= STREAM.carve) return 0;
  if (onCrossing(x, z)) return 0;
  return 0.9 * (1 - n.d / STREAM.carve);
}
export function inStreamWater(x, z) { const n = streamNear(x, z); return !!n && n.d < STREAM.half && !onCrossing(x, z); }
function deckH(x, z) {
  if (!inBox(DECK, x, z, 2.5)) return null;
  const n = polyNear(DECK, x, z); if (n.d > DECK.half) return null;
  return DECK.H * Math.min(1, n.s / DECK.ramp, (DECK.L - n.s) / DECK.ramp);
}
function cedarRampH(x, z) {
  const dx = x - CEDAR.x, dz = z - CEDAR.z, r = Math.hypot(dx, dz);
  if (r < CEDAR.RIN || r > CEDAR.ROUT) return null;
  let a = Math.atan2(dz, dx) - CEDAR.a0; a = ((a % TAU) + TAU) % TAU;
  return CEDAR.H * (a / TAU);
}
const CEDAR_GAP = 1.1; // 전망대 바닥에 뚫린 계단 구멍 (나선길 마지막 1.1 라디안 위). 없으면 전망대 바닥이 나선길을 다 덮어 내려갈 수 없었다
function inCedarGap(x, z) {
  const dx = x - CEDAR.x, dz = z - CEDAR.z, r = Math.hypot(dx, dz); if (r < CEDAR.RIN - 0.05 || r > CEDAR.ROUT) return false;
  let a = Math.atan2(dz, dx) - CEDAR.a0; a = ((a % TAU) + TAU) % TAU; return a > TAU - CEDAR_GAP;
}
function cedarPlatH(x, z) { const r = Math.hypot(x - CEDAR.x, z - CEDAR.z); return r >= CEDAR.RT - 0.1 && r <= CEDAR.PLAT && !inCedarGap(x, z) ? CEDAR.H : null; }
function logLocal(x, z) { const dx = x - LOG.x1, dz = z - LOG.z1; return { s: dx * LOG.ux + dz * LOG.uz, d: -dx * LOG.uz + dz * LOG.ux }; }
function logTopH(x, z) { const { s, d } = logLocal(x, z); if (s < 0 || s > LOG.L || Math.abs(d) > LOG.R) return null; return LOG.R + Math.sqrt(LOG.R * LOG.R - d * d); }
function logRampH(x, z) { const { s, d } = logLocal(x, z), R = LOG.ramp; if (d < R.d0 || d > R.d1 || s < R.s0 || s > R.s1) return null; return LOG.top * (s - R.s0) / (R.s1 - R.s0); }
function rockH(x, z) { let h = null; for (const k of ROCKS) if (Math.hypot(x - k.x, z - k.z) < k.r) h = Math.max(h ?? 0, k.top); return h; }

/** 땅(ground: 개울을 깎은 높이) 위에 구조물을 얹은 높이. 구조물 높이는 base(깎기 전 언덕 높이) 기준. refY: 지금 서 있는 높이 (없으면 땅에서 본다) */
export function structHeight(x, z, refY, ground, base = ground) {
  let best = ground;
  const lim = (refY ?? ground) + 0.7;
  const solid = [rockH(x, z), logRampH(x, z)];
  for (const h of solid) if (h != null) best = Math.max(best, base + h);
  const layered = [deckH(x, z), cedarRampH(x, z), cedarPlatH(x, z), logTopH(x, z)];
  for (const h of layered) if (h != null && h > 0.02 && base + h <= lim) best = Math.max(best, base + h);
  return best;
}
/** 위에 겹쳐 있는 가장 낮은 천장 (카메라를 그 아래로 누른다). 없으면 Infinity */
export function structCeiling(x, z, y, base) {
  let c = Infinity;
  for (const h of [deckH(x, z), cedarRampH(x, z), cedarPlatH(x, z), logTopH(x, z)]) if (h != null && base + h > y + 0.5) c = Math.min(c, base + h);
  return c;
}
/** 막힌 곳: 개울 물 · 데크·나선길·전망대 난간 · 통나무 벽 */
export function structBlocked(x, z, refY, base) {
  if (inStreamWater(x, z) && (refY ?? base) < base + 1.5) return true; // 개울 물 (데크로 위를 지날 때는 괜찮다)
  const y = (refY ?? base) - base;
  // 데크 난간: 데크 높이 근처에 서 있을 때, 데크 가장자리 바깥 띠
  if (y > 1.2 && inBox(DECK, x, z, 3)) { const n = polyNear(DECK, x, z); if (n.d > DECK.half && n.d < DECK.half + 0.9) { const h = DECK.H * Math.min(1, n.s / DECK.ramp, (DECK.L - n.s) / DECK.ramp); if (h > 1.2 && Math.abs(y - h) < 1.6) return true; } }
  // 나선길 바깥 난간 · 전망대 난간
  const r = Math.hypot(x - CEDAR.x, z - CEDAR.z);
  if (y > 1.2 && r > CEDAR.ROUT && r < CEDAR.ROUT + 0.9 && y < CEDAR.H - 0.6) { let a = Math.atan2(z - CEDAR.z, x - CEDAR.x) - CEDAR.a0; a = ((a % TAU) + TAU) % TAU; const h = CEDAR.H * a / TAU; if (h > 1.2 && Math.abs(y - h) < 1.6) return true; }
  if (y > CEDAR.H - 0.6 && r > CEDAR.PLAT && r < CEDAR.PLAT + 0.9) return true;
  // 통나무 벽 (속은 터널, 위는 걸어 다닌다)
  if (y < 2.6) { const { s, d } = logLocal(x, z); if (s >= 0 && s <= LOG.L && Math.abs(d) > LOG.inner && Math.abs(d) < LOG.R + 0.35) return true; }
  return false;
}
/** 구조물·개울과 겹치는 자리인가 (야생·블록 자리를 비켜 놓는 데 쓴다) */
export function structClear(x, z, m = 3.5) {
  const sn = streamNear(x, z); if (sn && sn.d < STREAM.half + m) return false;
  if (inBox(DECK, x, z, m + 2) && polyNear(DECK, x, z).d < DECK.half + m) return false;
  if (Math.hypot(x - CEDAR.x, z - CEDAR.z) < CEDAR.PLAT + m) return false;
  const { s, d } = logLocal(x, z); if (s > -m && s < LOG.L + m && Math.abs(d) < LOG.ramp.d1 + m) return false;
  if (ROCKS.some((k) => Math.hypot(x - k.x, z - k.z) < k.r + m)) return false;
  return true;
}
export const VIEW_ROCK = ROCKS.find((k) => k.view);
/** 개울까지 거리 (환경음: 가까울수록 물소리) */
export function streamDist(x, z) { return inBox(STREAM, x, z, 30) ? polyNear(STREAM, x, z).d : Infinity; }

// ---------- 모습 ----------
/** decor 에 구조물을 세운다. ground(x,z): 깎기 전 언덕 높이(구조물 기준), bed(x,z): 개울을 깎은 실제 땅, obstacles: 장애물 배열 */
export function buildForestStructures(decor, { ground, bed, obstacles }) {
  const hills = ground;
  const mossMat = new THREE.MeshStandardMaterial({ color: 0x5f9e3c, roughness: 1 });
  const mossDark = new THREE.MeshStandardMaterial({ color: 0x3f7a2c, roughness: 1 });
  const barkMat = new THREE.MeshStandardMaterial({ color: 0x7a4e32, roughness: 0.95 });
  const woodMat = new THREE.MeshStandardMaterial({ color: 0xb98a55, roughness: 0.85 });
  const railMat = new THREE.MeshStandardMaterial({ color: 0x7a5530, roughness: 0.9 });
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x8c8f86, roughness: 1 });
  const add = (m, radius = null) => { if (radius) m.userData.radius = radius; decor.add(m); return m; };

  // ----- 개울: 물 띠(언덕 높이를 따라) + 둑의 이끼 돌 + 징검다리 -----
  {
    const pos = [], idx = [];
    const step = 1.5, w = STREAM.half + 0.5;
    let k = 0;
    for (let s = 0; s <= STREAM.L + 0.01; s += step, k++) {
      const p = polyAt(STREAM, Math.min(s, STREAM.L)), nx = -p.uz, nz = p.ux;
      for (const side of [-1, 1]) { const x = p.x + nx * w * side, z = p.z + nz * w * side; pos.push(x, hills(x, z) - 0.32, z); }
      if (k > 0) { const a = (k - 1) * 2, b = k * 2; idx.push(a, a + 1, b, a + 1, b + 1, b); }
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx); geo.computeVertexNormals();
    const water = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x4fb3d9, roughness: 0.15, metalness: 0.1, side: THREE.DoubleSide }));
    water.userData.noHide = true; water.receiveShadow = true; decor.add(water);
    const bank = [];
    for (let s = 2; s < STREAM.L; s += 2.2) {
      const p = polyAt(STREAM, s), nx = -p.uz, nz = p.ux;
      for (const side of [-1, 1]) { if (Math.random() < 0.45) continue; const d = STREAM.half + 0.6 + Math.random() * 1.0, x = p.x + nx * d * side, z = p.z + nz * d * side; if (onCrossing(x, z)) continue; const r = 0.35 + Math.random() * 0.55; bank.push({ x, y: bed(x, z) + r * 0.3, z, s: r, rx: Math.random() * 3, ry: Math.random() * 3, color: Math.random() < 0.6 ? 0x6f9e48 : 0x8c8f86 }); }
    }
    decor.add(makeInstanced(new THREE.DodecahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1 }), bank, { shadow: true }));
    const stones = [];
    for (const c of STREAM.crossings) for (let i = -2; i <= 2; i++) { const d = i * 1.25, x = c.x - c.uz * d, z = c.z + c.ux * d; stones.push({ x, y: hills(x, z) - 0.1, z, sx: 0.75, sy: 0.25, sz: 0.65, ry: Math.random() * 3 }); }
    decor.add(makeInstanced(new THREE.CylinderGeometry(1, 1.1, 1, 9), new THREE.MeshStandardMaterial({ color: 0x9a9c92, roughness: 1 }), stones, { shadow: true }));
    const sign = makePillSprite('💧 이끼 계곡 · 징검다리로 건너', { bg: '#1f5f7a', fg: '#ffffff', border: '#9fe8ff' }, 0.7);
    const c0 = STREAM.crossings[2]; sign.position.set(c0.x - c0.uz * 4.5, ground(c0.x, c0.z) + 2.6, c0.z + c0.ux * 4.5); decor.add(sign);
  }

  // ----- 나무 데크길: 3m 조각들(카메라가 머리 위 조각만 잠깐 숨길 수 있게 따로따로) + 기둥 + 난간 -----
  {
    const n = Math.ceil(DECK.L / 3);
    const hAt = (s) => DECK.H * Math.min(1, s / DECK.ramp, (DECK.L - s) / DECK.ramp);
    for (let i = 0; i < n; i++) {
      const s0 = (i / n) * DECK.L, s1 = ((i + 1) / n) * DECK.L, sm = (s0 + s1) / 2;
      const a = polyAt(DECK, s0), b = polyAt(DECK, s1), m = polyAt(DECK, sm);
      const ya = ground(a.x, a.z) + hAt(s0), yb = ground(b.x, b.z) + hAt(s1);
      const g = new THREE.Group();
      const len = Math.hypot(b.x - a.x, yb - ya, b.z - a.z);
      const deck = new THREE.Mesh(new THREE.BoxGeometry(DECK.half * 2 + 0.2, 0.18, len + 0.05), woodMat);
      deck.position.set(0, -0.09, 0); deck.castShadow = deck.receiveShadow = true; g.add(deck);
      const hm = (ya + yb) / 2;
      if (hm > 1.0) for (const side of [-1, 1]) { const rail = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, len), railMat); rail.position.set(side * (DECK.half + 0.05), 0.9, 0); g.add(rail); const post = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.95, 0.14), railMat); post.position.set(side * (DECK.half + 0.05), 0.45, -len / 2 + 0.1); g.add(post); }
      g.position.set(m.x, hm, m.z); g.lookAt(b.x, yb, b.z);
      add(g, 2.4);
      if (hm > 1.2) for (const side of [-1, 1]) { // 데크를 받치는 기둥 (아래로 지나갈 수 있게 가장자리에만)
        const px = m.x - m.uz * (DECK.half - 0.1) * side, pz = m.z + m.ux * (DECK.half - 0.1) * side, gy = ground(px, pz);
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.16, hm - gy, 6), railMat); post.position.set(px, gy + (hm - gy) / 2 - 0.1, pz); add(post, 1.2);
      }
    }
    const st = polyAt(DECK, 2), sign = makePillSprite('🪵 이끼숲 데크길 ↗', { bg: '#6a4a00', fg: '#ffffff', border: '#ffd93d' }, 0.7);
    sign.position.set(st.x - st.uz * 2.2, ground(st.x, st.z) + 2.2, st.z + st.ux * 2.2); decor.add(sign);
  }

  // ----- 할아버지 삼나무: 거대한 줄기 + 판뿌리 + 나선 길 + 9m 전망대 + 높은 잎 -----
  {
    const { x: cx, z: cz } = CEDAR, gy = ground(cx, cz);
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(2.5, CEDAR.RT, 28, 16), barkMat); trunk.position.set(cx, gy + 14, cz); trunk.castShadow = true; add(trunk, 3.2);
    for (let i = 0; i < 7; i++) { const a = (i / 7) * TAU + 0.3, root = new THREE.Mesh(new THREE.ConeGeometry(1.0, 3.2, 5), barkMat); root.position.set(cx + Math.cos(a) * (CEDAR.RT + 0.1), gy + 1.2, cz + Math.sin(a) * (CEDAR.RT + 0.1)); root.rotation.z = Math.cos(a) * 0.55; root.rotation.x = -Math.sin(a) * 0.55; decor.add(root); }
    for (let i = 0; i < 9; i++) { const a = Math.random() * TAU, y = 1 + Math.random() * 14; const m = new THREE.Mesh(new THREE.SphereGeometry(0.9 + Math.random() * 0.6, 8, 6), mossMat); m.scale.set(1, 1.6, 0.5); m.position.set(cx + Math.cos(a) * (CEDAR.RT - 0.2), gy + y, cz + Math.sin(a) * (CEDAR.RT - 0.2)); m.rotation.y = -a; decor.add(m); } // 줄기의 이끼
    obstacles.push({ x: cx, z: cz, r: CEDAR.RT });
    const segs = 30, rm = (CEDAR.RIN + CEDAR.ROUT) / 2, rw = CEDAR.ROUT - CEDAR.RIN;
    for (let i = 0; i < segs; i++) { // 나선 길 판자
      const u0 = i / segs, u1 = (i + 1) / segs, a0 = CEDAR.a0 + u0 * TAU, a1 = CEDAR.a0 + u1 * TAU, am = (a0 + a1) / 2;
      const p0 = new THREE.Vector3(cx + Math.cos(a0) * rm, gy + CEDAR.H * u0, cz + Math.sin(a0) * rm), p1 = new THREE.Vector3(cx + Math.cos(a1) * rm, gy + CEDAR.H * u1, cz + Math.sin(a1) * rm);
      const len = p0.distanceTo(p1) + 0.12, g = new THREE.Group();
      const plank = new THREE.Mesh(new THREE.BoxGeometry(rw, 0.2, len), woodMat); plank.position.y = -0.1; plank.castShadow = plank.receiveShadow = true; g.add(plank);
      if ((p0.y + p1.y) / 2 > 1.2) { const rail = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, len), railMat); rail.position.set(rw / 2 + 0.05, 0.9, 0); g.add(rail); const post = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.95, 0.14), railMat); post.position.set(rw / 2 + 0.05, 0.45, 0); g.add(post); }
      g.position.copy(p0).add(p1).multiplyScalar(0.5); g.lookAt(p1);
      add(g, 2.2);
      const prop = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, g.position.y - gy, 5), railMat); prop.position.set(cx + Math.cos(am) * (CEDAR.ROUT - 0.2), gy + (g.position.y - gy) / 2 - 0.1, cz + Math.sin(am) * (CEDAR.ROUT - 0.2)); if (g.position.y - gy > 1.3) add(prop, 1);
    }
    // 전망대 바닥: 안쪽 고리(나선길 위)에는 계단 구멍을 비우고, 바깥 고리는 한 바퀴 다. (rotation.x=-π/2 로 눕히면 고리 각 θ 가 땅의 각 -θ 가 된다)
    const platMat = woodMat.clone(); platMat.side = THREE.DoubleSide;
    const platIn = new THREE.Mesh(new THREE.RingGeometry(CEDAR.RT - 0.1, CEDAR.ROUT, 36, 1, -(CEDAR.a0 + TAU - CEDAR_GAP), TAU - CEDAR_GAP), platMat);
    const platOut = new THREE.Mesh(new THREE.RingGeometry(CEDAR.ROUT, CEDAR.PLAT, 40), platMat);
    for (const plat of [platIn, platOut]) { plat.rotation.x = -Math.PI / 2; plat.position.set(cx, gy + CEDAR.H + 0.01, cz); plat.receiveShadow = true; plat.userData.noHide = true; decor.add(plat); }
    { const ga = CEDAR.a0 - CEDAR_GAP / 2, gs = makePillSprite('⬇ 내려가는 나선길', { bg: '#6a4a00', fg: '#ffffff', border: '#ffd93d' }, 0.6); gs.position.set(cx + Math.cos(ga) * (CEDAR.RIN + CEDAR.ROUT) / 2, gy + CEDAR.H + 1.8, cz + Math.sin(ga) * (CEDAR.RIN + CEDAR.ROUT) / 2); decor.add(gs); }
    const platRim = new THREE.Mesh(new THREE.CylinderGeometry(CEDAR.PLAT, CEDAR.PLAT, 0.3, 40, 1, true), railMat); platRim.position.set(cx, gy + CEDAR.H - 0.15, cz); add(platRim, 6);
    const rimRail = new THREE.Mesh(new THREE.TorusGeometry(CEDAR.PLAT + 0.05, 0.07, 6, 48), railMat); rimRail.rotation.x = Math.PI / 2; rimRail.position.set(cx, gy + CEDAR.H + 0.95, cz); add(rimRail, 6);
    for (let i = 0; i < 16; i++) { const a = (i / 16) * TAU, p = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.95, 0.14), railMat); p.position.set(cx + Math.cos(a) * (CEDAR.PLAT + 0.05), gy + CEDAR.H + 0.47, cz + Math.sin(a) * (CEDAR.PLAT + 0.05)); decor.add(p); }
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x2f6e3a, roughness: 1 });
    for (const [dx, dy, dz, r] of [[0, 30, 0, 9], [6, 25, 3, 6], [-6, 26, -2, 6.5], [2, 24, -7, 5.5], [-3, 23, 7, 5.5]]) { const m = new THREE.Mesh(new THREE.SphereGeometry(r, 14, 10), leafMat); m.scale.y = 0.6; m.position.set(cx + dx, gy + dy, cz + dz); m.castShadow = true; add(m, r + 1); }
    const sign = makePillSprite('🌳 할아버지 삼나무 · 나선 길로 전망대까지', { bg: '#6a4a00', fg: '#ffffff', border: '#ffd93d' }, 0.8);
    sign.position.set(cx + Math.cos(CEDAR.a0) * (CEDAR.ROUT + 2.5), gy + 2.6, cz + Math.sin(CEDAR.a0) * (CEDAR.ROUT + 2.5)); decor.add(sign);
    const top = makePillSprite('🔭 전망대 · 숲이 다 보여!', { bg: '#20232e', fg: '#ffd93d', border: '#ffd93d' }, 0.7); top.position.set(cx, gy + CEDAR.H + 3.2, cz + CEDAR.PLAT - 1.5); decor.add(top);
  }

  // ----- 쓰러진 고목: 속이 빈 통나무(겉·속·양 끝 고리) + 위의 이끼 + 옆의 이끼 비탈 -----
  {
    const { x1, z1, ux, uz, L, R, inner } = LOG, cx = x1 + ux * L / 2, cz = z1 + uz * L / 2, gy = ground(cx, cz);
    const g = new THREE.Group();
    const outer = new THREE.Mesh(new THREE.CylinderGeometry(R, R, L, 22, 1, true), barkMat); outer.castShadow = true;
    const innerM = new THREE.Mesh(new THREE.CylinderGeometry(inner + 0.35, inner + 0.35, L, 22, 1, true), new THREE.MeshStandardMaterial({ color: 0x4a2f1e, roughness: 1, side: THREE.BackSide }));
    const moss = new THREE.Mesh(new THREE.CylinderGeometry(R + 0.06, R + 0.06, L * 0.96, 22, 1, true, Math.PI * 0.65, Math.PI * 0.7), mossMat); // 눕히면 위쪽이 되는 쪽(θ=π 둘레)에 이끼
    g.add(outer, innerM, moss);
    for (const e of [-1, 1]) { const ring = new THREE.Mesh(new THREE.RingGeometry(inner + 0.35, R, 22), new THREE.MeshStandardMaterial({ color: 0xc9925a, side: THREE.DoubleSide })); ring.position.y = e * L / 2; ring.rotation.x = Math.PI / 2; g.add(ring); }
    g.rotation.order = 'YXZ'; g.rotation.y = Math.atan2(ux, uz); g.rotation.x = Math.PI / 2; // 원기둥(세로)을 길 방향으로 눕힌다
    g.position.set(cx, gy + R, cz);
    add(g, 4);
    // 옆 이끼 비탈: 땅에서 통나무 꼭대기까지 오르는 경사면
    const Rp = LOG.ramp, w = Rp.d1 - Rp.d0, len = Math.hypot(Rp.s1 - Rp.s0, LOG.top);
    const sm = (Rp.s0 + Rp.s1) / 2, dm = (Rp.d0 + Rp.d1) / 2, px = x1 + ux * sm - uz * dm, pz = z1 + uz * sm + ux * dm;
    const slope = new THREE.Mesh(new THREE.BoxGeometry(w, 0.6, len), mossDark); slope.castShadow = slope.receiveShadow = true;
    slope.position.set(px, ground(px, pz) + LOG.top / 2 - 0.3, pz); slope.rotation.order = 'YXZ'; slope.rotation.y = Math.atan2(ux, uz); slope.rotation.x = -Math.atan2(LOG.top, Rp.s1 - Rp.s0);
    add(slope, 3);
    const sign = makePillSprite('🪵 쓰러진 고목 · 속으로 지나가거나 이끼 비탈로 위에 올라가!', { bg: '#6a4a00', fg: '#ffffff', border: '#ffd93d' }, 0.65);
    sign.position.set(x1 - ux * 2.5 - uz * 3, gy + 2.6, z1 - uz * 2.5 + ux * 3); decor.add(sign);
  }

  // ----- 이끼 바위 언덕: 점프해서 오르는 바위들 -----
  for (const k of ROCKS) {
    const gy = ground(k.x, k.z);
    // 울퉁불퉁한 바위 몸통(다면체) + 위를 덮은 이끼. 밟는 높이는 평평한 꼭대기(k.top)
    const body = new THREE.Mesh(new THREE.DodecahedronGeometry(1, 1), rockMat); body.scale.set(k.r * 1.05, k.top * 0.62, k.r * 1.05); body.position.set(k.x, gy + k.top * 0.42, k.z); body.rotation.y = k.x * 0.7;
    body.castShadow = body.receiveShadow = true; add(body, k.r + 0.5);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(k.r * 0.92, 16, 6, 0, TAU, 0, Math.PI / 2), mossMat); cap.scale.y = 0.18; cap.position.set(k.x, gy + k.top - 0.06, k.z); add(cap, k.r);
    for (let i = 0; i < 4; i++) { const a = i * 1.6 + k.z, f = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.9, 3), mossDark); f.position.set(k.x + Math.cos(a) * k.r * 0.95, gy + 0.35, k.z + Math.sin(a) * k.r * 0.95); f.rotation.z = Math.cos(a) * 0.8; f.rotation.x = -Math.sin(a) * 0.8; decor.add(f); } // 바위 밑 고사리
  }
  {
    const v = VIEW_ROCK, s = makePillSprite('🪨 이끼 바위 언덕 · 점프로 꼭대기까지!', { bg: '#20232e', fg: '#ffd93d', border: '#ffd93d' }, 0.7);
    s.position.set(ROCKS[0].x + 2.5, ground(ROCKS[0].x, ROCKS[0].z) + 2.2, ROCKS[0].z + 2.5); decor.add(s);
    const t = makePillSprite('⛰ 전망 바위', { bg: '#6a4a00', fg: '#ffffff', border: '#ffd93d' }, 0.6); t.position.set(v.x, ground(v.x, v.z) + v.top + 2.2, v.z); decor.add(t);
  }

  // ----- 나무 사이로 내리는 빛줄기 (흐린 빛 기둥) -----
  const shafts = [];
  {
    const mat = new THREE.MeshBasicMaterial({ color: 0xfff3c4, transparent: true, opacity: 0.07, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
    for (const [x, z] of [[-20, -30], [30, -50], [-80, 20], [48, -78], [-40, 40], [70, 0], [-100, -50], [10, 20], [90, -40], [-60, -10]]) {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 3.6, 34, 12, 1, true), mat.clone());
      m.position.set(x, ground(x, z) + 15, z); m.rotation.z = 0.32; m.rotation.y = 0.6; m.userData.noHide = true; m.userData.phase = Math.random() * 6;
      decor.add(m); shafts.push(m);
    }
  }
  return { animate: (t) => { for (const m of shafts) m.material.opacity = 0.05 + 0.03 * Math.sin(t * 0.6 + m.userData.phase); } };
}
