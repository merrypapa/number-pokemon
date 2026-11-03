import * as THREE from 'three';
import { makeInstanced, makeLabelTexture } from './world.js';

// 넘버볼 아레나 = 로마 콜로세움을 본뜬 원형 경기장. (src/arena.js 가 이 모듈로 지형과 건물을 만든다)
//  - 타원 모래 경기장(가운데 무대) → 높이 3.5m 포디움 벽(난간) → 계단식 관중석(카베아) 두 층 → 맨 위 회랑 → 바깥 아치 벽(3층 아치 + 다락층 + 천막 돛대).
//  - 관중석 한 줄은 1m씩 높아져서 그냥 걸어서는 못 오르고(ledge 0.9), 뛰거나 통로 계단(0.5m씩)으로 오른다.
//  - 남쪽 큰 문(개선문 쪽)에서 관중석 밑을 지나는 굴(보미토리움)로 경기장에 들어간다. 굴 위로는 관중석이 그대로 이어진다(겹치는 층).
//  - 경기장 남쪽 굴 입구 양옆의 돌계단으로 포디움(귀빈석 테라스)에 오르고, 통로 계단을 따라 맨 위 회랑까지 올라가 내려다볼 수 있다.
//  - 북쪽 포디움에는 황제석(풀비나르), 경기장 동쪽 바닥에는 하이포지움(지하 무대) 뚜껑문과 오르내리는 승강기.
// 높이 규칙은 다른 지역과 같다: 단단한 것(관중석·벽)은 늘 지형, 겹치는 것(굴 위 관중석)은 지금 높이+0.7 아래일 때만.

const TAU = Math.PI * 2;
// 좌표: 경기장 타원 중심 (cx, cz), 반지름 A(동서)·B(남북). w = 경기장 가장자리에서 바깥으로 잰 거리(방사 방향)
export const COL = {
  cx: 0, cz: -3, A: 22, B: 15,
  P: 3.5,        // 포디움(첫 테라스) 높이
  OUT: 20.4,     // 바깥 벽 바깥면 (w)
  ATTIC: 18,     // 바깥 벽(다락층) 꼭대기
  TW: 1.55,      // 굴: 걸을 수 있는 반폭 (보이는 벽은 TWV)
  TWV: 1.9,
  TH: 3.4,       // 굴 천장
  ST0: 3.2,      // 포디움 계단: |x| 가 여기서부터 1m 마다 0.5m 오른다 (7칸)
  GAP: [9.0, 10.8], // 계단 꼭대기의 난간 틈 (|x|)
  PULV: { hw: 4, w0: 0.6, w1: 3.6, top: 4.0 }, // 황제석 (북쪽 포디움)
};
const { cx, cz, A, B, P, OUT, ATTIC, TW, TWV, TH } = COL;

/** 그 방향(th)의 경기장 가장자리 반지름 */
const reAt = (th) => (A * B) / Math.hypot(B * Math.cos(th), A * Math.sin(th));
export function polar(x, z) {
  const dx = x - cx, dz = z - cz, th = Math.atan2(dz, dx), rho = Math.hypot(dx, dz);
  return { th, rho, w: rho - reAt(th) };
}
export function ringPt(th, w) { const r = reAt(th) + w; return [cx + r * Math.cos(th), cz + r * Math.sin(th)]; }
/** 남쪽 반(z > cz)에서 x 가 X 인 고리 위 각도 (이분법) */
export function thetaAtX(X, w) {
  let lo = 0, hi = Math.PI;
  for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (ringPt(m, w)[0] > X) lo = m; else hi = m; }
  return (lo + hi) / 2;
}
const angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU; return d; };

// ---------- 관중석 단면 (w → 높이) ----------
export const SEG = [];
{
  const push = (w0, w1, h, kind) => SEG.push({ w0, w1, h, kind });
  push(0, 0.6, P, 'wall');             // 포디움 벽 + 난간
  push(0.6, 3.6, P, 'terrace');        // 귀빈석 테라스 (대리석)
  for (let k = 1; k <= 4; k++) push(3.6 + 1.4 * (k - 1), 3.6 + 1.4 * k, P + k, 'row');       // 1층 관중석 (4.5~7.5)
  push(9.2, 11.2, P + 5.2, 'walk');    // 가운데 통로 (8.7) — 앞 턱 1.2m
  for (let k = 1; k <= 4; k++) push(11.2 + 1.4 * (k - 1), 11.2 + 1.4 * k, P + 5.2 + k, 'row2'); // 2층 관중석 (9.7~12.7)
  push(16.8, 19.4, P + 10.2, 'gallery'); // 맨 위 회랑 (13.7)
  push(19.4, OUT, ATTIC, 'attic');     // 바깥 벽
}
const GALLERY = SEG.find((s) => s.kind === 'gallery');
function segIndex(w) { for (let i = 0; i < SEG.length; i++) if (w < SEG[i].w1) return i; return SEG.length - 1; }
// 통로 계단 8곳 (각도, 0 = 동쪽 +x, 90° = 남쪽 +z). 남쪽 굴·북쪽 황제석은 비켜 놓는다
export const AISLES = [20, 55, 125, 160, -20, -55, -125, -160].map((d) => (d * Math.PI) / 180);
const AISLE_HW = 0.85;
function aisleAt(th, rho) { for (const a of AISLES) { const d = angDiff(th, a); if (Math.abs(d) < 0.6 && Math.abs(rho * Math.sin(d)) < AISLE_HW) return true; } return false; }
/** 통로에서는 한 줄(1m)을 0.5m 계단 두 칸으로 나눈다: 줄의 바깥쪽 절반이 다음 줄과의 중간 높이 */
function aisleStep(i) { const s = SEG[i], n = SEG[i + 1]; if (!n) return 0; const rise = n.h - s.h; return rise > 0.9 && rise < 1.5 ? rise / 2 : 0; }
const inTunnel = (x, z, w) => z > cz && Math.abs(x - cx) < TW && w > -0.6 && w < OUT + 0.6;
const inPulv = (x, z, w) => z < cz && Math.abs(x - cx) < COL.PULV.hw && w >= COL.PULV.w0 && w < COL.PULV.w1;
function stairH(x, z, w) { // 경기장 → 포디움 돌계단 (굴 입구 양옆, 포디움 벽에 붙어 있다)
  if (z <= cz || w < -1.6 || w >= 0) return 0;
  const ax = Math.abs(x - cx) - COL.ST0;
  if (ax <= 0 || ax > 7.6) return 0; // 맨 윗단은 난간 틈 끝까지 넓다
  return 0.5 * Math.min(7, Math.ceil(ax));
}
const inGap = (x, z) => z > cz && Math.abs(x - cx) > COL.GAP[0] && Math.abs(x - cx) < COL.GAP[1];

// 관중(앉은 사람) 자리: 줄마다 각도 목록. 걸어가다 부딪히게 (blocked)
const SPECT = new Map();
let rng = 7;
const rand = () => { rng = (rng * 16807) % 2147483647; return (rng - 1) / 2147483646; };

/** 관중석 높이 (경기장 바깥, 바깥 벽 안) */
function caveaH(x, z, p) {
  if (inPulv(x, z, p.w)) return COL.PULV.top;
  const i = segIndex(p.w), s = SEG[i];
  if (s.kind !== 'wall' && s.kind !== 'attic' && p.w > s.w1 - 0.7 && aisleAt(p.th, p.rho)) return s.h + aisleStep(i);
  return s.h;
}

let headInTunnel = false; // 카메라 계산(resolveCamera 의 cutaway)이 매 프레임 알려 준다

export function makeColosseumTerrain({ size, stage, obstacles }) {
  const height = (x, z, refY) => {
    const ref = refY ?? 0, p = polar(x, z);
    if (p.w < 0) {
      const s = stairH(x, z, p.w); if (s) return s;
      return stage && Math.hypot(x - stage.x, z - stage.z) < stage.r ? 0.3 : 0;
    }
    if (p.w >= OUT) return 0;
    const h = caveaH(x, z, p);
    if (inTunnel(x, z, p.w)) return h <= ref + 0.7 ? h : 0; // 굴 위 관중석은 겹치는 층
    return h;
  };
  const blocked = (x, z, refY) => {
    const ref = refY ?? 0, p = polar(x, z), w = p.w;
    if (w < -0.4 || w > OUT + 0.45) return false;
    const tun = inTunnel(x, z, w);
    if (tun && ref < P - 0.5) return Math.abs(x - cx) > TW - 0.05 && w > 0 && w < OUT; // 굴 안: 양옆 벽
    if (w < 0) return ref < P - 0.5 && !stairH(x, z, w) && !tun;  // 포디움 벽에 몸이 파묻히지 않게
    if (w >= OUT) return ref < 2 && !tun;                          // 바깥 벽에 몸이 파묻히지 않게
    if (w < 0.85 && ref > 1.5 && !inGap(x, z)) return true;        // 포디움 난간
    const i = segIndex(w), s = SEG[i];
    if (tun && w > GALLERY.w1 - 0.8 && ref > P) return true;       // 굴 위 바깥 벽
    if (s.kind === 'gallery' && w > s.w1 - 0.7) return true;        // 회랑 바깥 기둥
    const n = SEG[i + 1]; // 관중석 줄 뒤쪽 턱에 몸이 파묻히지 않게 (뛰어올라 발이 높아지면 풀린다)
    if (n && n.h - s.h > 0.9 && w > s.w1 - 0.3 && ref < n.h - 0.9 && !(aisleAt(p.th, p.rho))) return true;
    const arr = SPECT.get(i); // 앉아 있는 관중
    if (arr && w > s.w0 + 0.05 && w < s.w0 + 0.95 && ref > s.h - 0.4 && ref < s.h + 0.8) {
      let lo = 0, hi = arr.length - 1;
      while (lo < hi) { const m = (lo + hi) >> 1; if (arr[m] < p.th) lo = m + 1; else hi = m; }
      for (const k of [lo - 1, lo, 0, arr.length - 1]) if (k >= 0 && k < arr.length && Math.abs(angDiff(arr[k], p.th)) * p.rho < 0.42) return true;
    }
    return false;
  };
  const ceiling = (x, z, y) => (headInTunnel && y < P - 0.5 ? TH : Infinity); // 굴 안에서는 카메라를 굴 천장 아래로
  return { height, inHole: () => false, blocked, size, obstacles, ledge: 0.9, ceiling };
}

// ---------- 모습 ----------
// 고리 띠를 이어 붙이는 도우미: 모든 면을 정점 색 하나의 큰 메시로 (드로우콜 하나)
function Acc() { return { pos: [], col: [] }; }
const _c = new THREE.Color();
function quad(G, a, b, c, d, hex, want) {
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
  const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
  if (nx * want[0] + ny * want[1] + nz * want[2] < 0) [b, d] = [d, b];
  _c.setHex(hex);
  for (const p of [a, b, c, a, c, d]) { G.pos.push(p[0], p[1], p[2]); G.col.push(_c.r, _c.g, _c.b); }
}
function toMesh(G, mat) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(G.pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(G.col, 3));
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, mat); m.castShadow = true; m.receiveShadow = true; m.userData.noHide = true;
  return m;
}
const N = 176;
function thetas(extra = []) { const a = []; for (let i = 0; i < N; i++) a.push(-Math.PI + (i / N) * TAU); a.push(...extra); a.sort((p, q) => p - q); a.push(a[0] + TAU); return a; }
/** 세로 띠 (w 고리, 높이 y0~y1). out: 바깥을 보는 면. pick(thMid) → 넣을 누적기 (null 이면 건너뛴다) */
function vband(pick, w, y0, y1, hex, out, extra = []) {
  const ts = thetas(extra);
  for (let i = 0; i + 1 < ts.length; i++) {
    const tm = (ts[i] + ts[i + 1]) / 2, G = pick(tm, w); if (!G) continue;
    const [x0, z0] = ringPt(ts[i], w), [x1, z1] = ringPt(ts[i + 1], w), [xm, zm] = ringPt(tm, w), s = out ? 1 : -1;
    quad(G, [x0, y0, z0], [x1, y0, z1], [x1, y1, z1], [x0, y1, z0], hex, [(xm - cx) * s, 0, (zm - cz) * s]);
  }
}
function hband(pick, w0, w1, y, hex, extra = [], down = false) {
  const ts = thetas(extra);
  for (let i = 0; i + 1 < ts.length; i++) {
    const tm = (ts[i] + ts[i + 1]) / 2, G = pick(tm, (w0 + w1) / 2); if (!G) continue;
    const [a0, b0] = ringPt(ts[i], w0), [a1, b1] = ringPt(ts[i + 1], w0), [c1, d1] = ringPt(ts[i + 1], w1), [c0, d0] = ringPt(ts[i], w1);
    quad(G, [a0, y, b0], [a1, y, b1], [c1, y, d1], [c0, y, d0], hex, [0, down ? -1 : 1, 0]);
  }
}
const southX = (tm, w, lim) => { if (Math.sin(tm) <= 0) return false; return Math.abs(ringPt(tm, w)[0] - cx) < lim; };
const tunnelThetas = (w) => [thetaAtX(cx + TWV, w), thetaAtX(cx - TWV, w)];
const gapThetas = (w) => [COL.GAP[0], COL.GAP[1], -COL.GAP[0], -COL.GAP[1]].map((X) => thetaAtX(cx + X, w));

/** 바깥 벽 위 둘레 길이로 고른 각도 (아치 칸 나누기). 0 = 남쪽 문 */
function arcTable(w) {
  const M = 2400, th = [], s = [0]; let L = 0, prev = ringPt(Math.PI / 2, w);
  for (let i = 0; i <= M; i++) { const t = Math.PI / 2 + (i / M) * TAU, p = ringPt(t, w); if (i) { L += Math.hypot(p[0] - prev[0], p[1] - prev[1]); s.push(L); } th.push(t); prev = p; }
  return { L, at: (d) => { d = ((d % L) + L) % L; let lo = 0, hi = s.length - 1; while (lo < hi) { const m = (lo + hi) >> 1; if (s[m] < d) lo = m + 1; else hi = m; } return th[lo]; } };
}
function outNormal(th, w) {
  const a = ringPt(th - 0.002, w), b = ringPt(th + 0.002, w), tx = b[0] - a[0], tz = b[1] - a[1], L = Math.hypot(tx, tz);
  let nx = tz / L, nz = -tx / L; const p = ringPt(th, w); if (nx * (p[0] - cx) + nz * (p[1] - cz) < 0) { nx = -nx; nz = -nz; }
  return [nx, nz];
}

// 둘레를 K 조각으로 나눈다: 포디움 벽·난간과 다락층은 조각마다 따로 그려, 주인공과 카메라 사이를 가리면 그 조각만 잠깐 숨긴다
const K = 8;
const secOf = (th) => ((Math.floor(((th + Math.PI) / TAU) * K) % K) + K) % K;
const _nonIdx = new WeakMap(), _v = new THREE.Vector3(), _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3();
/** 모양(geo)을 it 자리·회전·크기로 옮겨 누적기에 붙인다 (여러 개를 메시 하나로 합쳐 드로우콜을 줄인다) */
function addGeo(G, geo, it, hex) {
  let g = _nonIdx.get(geo); if (!g) { g = geo.index ? geo.toNonIndexed() : geo; _nonIdx.set(geo, g); }
  _m.compose(_v.set(it.x, it.y, it.z), _q.setFromEuler(_e.set(it.rx || 0, it.ry || 0, it.rz || 0)), _s.set(it.sx ?? it.s ?? 1, it.sy ?? it.s ?? 1, it.sz ?? it.s ?? 1));
  const p = g.attributes.position; _c.setHex(hex);
  for (let i = 0; i < p.count; i++) { _v.fromBufferAttribute(p, i).applyMatrix4(_m); G.pos.push(_v.x, _v.y, _v.z); G.col.push(_c.r, _c.g, _c.b); }
}
const archShape = (hw, hr) => { const s = new THREE.Shape(); s.moveTo(-hw, 0); s.lineTo(hw, 0); s.lineTo(hw, hr); s.absarc(0, hr, hw, 0, Math.PI, false); s.lineTo(-hw, 0); return new THREE.ShapeGeometry(s, 8); };

export function buildColosseum(decor, { obstacles }) {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 });
  const body = Acc(), low = Array.from({ length: K }, Acc), att = Array.from({ length: K }, Acc);
  const toBody = () => body;
  const toLow = (tm) => low[secOf(tm)], toAtt = (tm) => att[secOf(tm)];
  const noTunnel = (to) => (tm, w) => (southX(tm, w, TWV) ? null : to(tm));
  const inGapT = (tm, w) => { const x = Math.abs(ringPt(tm, w)[0] - cx); return Math.sin(tm) > 0 && x > COL.GAP[0] && x < COL.GAP[1]; };
  const noGap = (tm, w) => (inGapT(tm, w) ? null : toLow(tm)), gapOnly = (tm, w) => (inGapT(tm, w) ? toLow(tm) : null);

  // ----- 포디움 벽 (경기장 쪽 얼굴): 아래 어두운 띠 + 대리석, 굴 입구는 비운다. 그 위 난간 (계단 꼭대기는 틈) -----
  vband(noTunnel(toLow), 0, 0, 0.6, 0x8c7a62, false, tunnelThetas(0));
  vband(noTunnel(toLow), 0, 0.6, TH, 0xece4d2, false, tunnelThetas(0));
  vband(toLow, 0, TH, P, 0xd9b45a, false); // 굴 위 상인방까지 이어지는 금빛 띠
  vband(noGap, 0, P, P + 0.9, 0xf3eee2, false, gapThetas(0));
  hband(noGap, 0, 0.5, P + 0.9, 0xfaf6ec, gapThetas(0.25));
  vband(noGap, 0.5, P, P + 0.9, 0xe2dacb, true, gapThetas(0.5));
  hband(gapOnly, 0, 0.5, P, 0xefe8da, gapThetas(0.25));
  // ----- 관중석 단: 윗면 + 앞(경기장 쪽) 턱 -----
  const ROWC = { terrace: 0xf2ede3, row: [0xd8c7a3, 0xcbb892], walk: 0xb9a582, row2: [0xd2bf99, 0xc4b08a], gallery: 0xbfa985, attic: 0xa8946f };
  SEG.forEach((s, i) => {
    if (i === 0) return;
    const c = Array.isArray(ROWC[s.kind]) ? ROWC[s.kind][i % 2] : ROWC[s.kind];
    hband(s.kind === 'attic' ? toAtt : toBody, i === 1 ? 0.5 : s.w0, s.w1, s.h, c);
    const prev = SEG[i - 1].h;
    if (s.h > prev) vband(toBody, s.w0, prev, s.h, s.kind === 'walk' ? 0x9c8a6a : s.kind === 'attic' ? 0xb7a27c : 0xb3a07e, false);
  });
  // ----- 바깥 벽: 3층 아치 + 다락층, 층마다 처마 띠 -----
  const TIERS = [0, 5.2, 10.2, 14.8], TOP = ATTIC, facCol = [0xd9c39c, 0xd4bd95, 0xcfb78f, 0xcab28a];
  vband(noTunnel(toBody), OUT, 0, TH, facCol[0], true, tunnelThetas(OUT));
  vband(toBody, OUT, TH, TIERS[1], facCol[0], true);
  vband(toBody, OUT, TIERS[1], TIERS[2], facCol[1], true);
  vband(toBody, OUT, TIERS[2], TIERS[3], facCol[2], true);
  vband(toAtt, OUT, TIERS[3], TOP, facCol[3], true);
  for (const y of [TIERS[1], TIERS[2], TIERS[3], TOP]) { // 처마 띠
    const to = y === TOP ? toAtt : toBody;
    vband(to, OUT + 0.4, y - 0.45, y, 0xe8d9b8, true);
    hband(to, OUT, OUT + 0.4, y, 0xe2d1ae);
    hband(to, OUT, OUT + 0.4, y - 0.45, 0xb9a47e, [], true);
  }
  // 아치(어두운 문)·기둥·다락 창문·돛대
  const NB = 44, tab = arcTable(OUT), bay = tab.L / NB;
  const arch1 = archShape(1.9, 2.6), arch2 = archShape(1.7, 2.2), plane = new THREE.PlaneGeometry(1, 1), box = new THREE.BoxGeometry(1, 1, 1);
  const colGeo = new THREE.CylinderGeometry(1, 1.15, 1, 8), mastGeo = new THREE.CylinderGeometry(0.1, 0.15, 6, 6);
  const mastTops = [];
  for (let k = 0; k < NB; k++) {
    const th = tab.at(k * bay), [nx, nz] = outNormal(th, OUT), ry = Math.atan2(nx, nz), p = ringPt(th, OUT + 0.03);
    if (k) addGeo(body, arch1, { x: p[0], y: 0, z: p[1], ry }, 0x3b2f25);
    for (const y of [5.7, 10.6]) addGeo(body, arch2, { x: p[0], y, z: p[1], ry, s: 0.92 }, 0x3b2f25);
    if (k % 2 === 0) addGeo(toAtt(th), plane, { x: p[0], y: 16.4, z: p[1], ry, sx: 1.1, sy: 1.0 }, 0x3b2f25);
    const tb = tab.at((k + 0.5) * bay), [mx, mz] = outNormal(tb, OUT), pr = ringPt(tb, OUT + 0.15), rq = Math.atan2(mx, mz);
    for (let t = 0; t < 4; t++) { const y0 = TIERS[t], y1 = t < 3 ? TIERS[t + 1] - 0.45 : TOP - 0.45; addGeo(t < 3 ? body : toAtt(tb), box, { x: pr[0], y: (y0 + y1) / 2, z: pr[1], ry: rq, sx: t === 3 ? 0.5 : 0.7, sy: y1 - y0, sz: 0.3 }, 0xe6d6b4); }
    const pc = ringPt(tb, GALLERY.w1 - 0.35); // 회랑 기둥
    addGeo(body, colGeo, { x: pc[0], y: GALLERY.h + 1.6, z: pc[1], sx: 0.28, sy: 3.2, sz: 0.28 }, 0xe9ddc0);
    if (k % 2 === 0) { const m = ringPt(tb, OUT - 0.5); addGeo(toAtt(tb), mastGeo, { x: m[0], y: TOP + 3, z: m[1] }, 0x7a5a3a); mastTops.push({ th: tb, x: m[0], z: m[1] }); }
  }
  vband(toBody, GALLERY.w1 - 0.6, GALLERY.h + 3.2, GALLERY.h + 3.6, 0xe2d4b4, false); // 회랑 상인방
  hband(toBody, GALLERY.w1 - 0.6, GALLERY.w1, GALLERY.h + 3.2, 0xb9a47e, [], true);
  { // 남쪽 큰 문 위 반원(굴 입구 위 어두운 아치)
    const s = new THREE.Shape(); s.moveTo(-TWV, TH); s.lineTo(TWV, TH); s.absellipse(0, TH, TWV, 1.05, 0, Math.PI, false);
    const p = ringPt(Math.PI / 2, OUT + 0.03); addGeo(body, new THREE.ShapeGeometry(s, 10), { x: p[0], y: 0, z: p[1] }, 0x3b2f25);
  }

  // ----- 굴 (보미토리움): 양쪽 벽 + 천장 + 갈빗대 아치 -----
  {
    const z0 = ringPt(thetaAtX(cx + TWV, -0.05), -0.05)[1], z1 = ringPt(thetaAtX(cx + TWV, OUT + 0.05), OUT + 0.05)[1], L = z1 - z0, zm = (z0 + z1) / 2;
    for (const s of [-1, 1]) addGeo(body, plane, { x: cx + s * TWV, y: TH / 2, z: zm, ry: s > 0 ? -Math.PI / 2 : Math.PI / 2, sx: L, sy: TH }, 0xb59f7a);
    addGeo(body, plane, { x: cx, y: TH, z: zm, rx: Math.PI / 2, sx: TWV * 2, sy: L }, 0x8e7b5c);
    addGeo(body, plane, { x: cx, y: 0.03, z: zm + 6, rx: -Math.PI / 2, sx: TWV * 2, sy: L + 14 }, 0xa39478); // 굴 바닥 돌판 길
    for (let z = z0 + 2; z < z1 - 1; z += 3.2) {
      for (const s of [-1, 1]) addGeo(body, box, { x: cx + s * (TWV - 0.15), y: TH / 2, z, sx: 0.3, sy: TH, sz: 0.5 }, 0x9c8865);
      addGeo(body, box, { x: cx, y: TH - 0.15, z, sx: TWV * 2, sy: 0.3, sz: 0.5 }, 0x9c8865);
    }
  }
  // ----- 포디움 돌계단 (굴 입구 양옆) + 통로 계단 -----
  for (const sx of [-1, 1]) for (let k = 1; k <= 7; k++) {
    const top = k === 7, X = cx + sx * (COL.ST0 + k - (top ? 0.2 : 0.5)), th = thetaAtX(X, -0.8), p = ringPt(th, -0.8), [nx, nz] = outNormal(th, -0.8), h = 0.5 * k;
    addGeo(body, box, { x: p[0], y: h / 2, z: p[1], ry: Math.atan2(nx, nz), sx: top ? 1.62 : 1.02, sy: h, sz: 1.75 }, k % 2 ? 0xe9e1cf : 0xdcd2bd);
  }
  SEG.forEach((s, i) => {
    const st = aisleStep(i); if (!st || s.kind === 'wall') return;
    for (const a of AISLES) { const p = ringPt(a, s.w1 - 0.35); addGeo(body, box, { x: p[0], y: s.h + st / 2, z: p[1], ry: Math.atan2(Math.cos(a), Math.sin(a)), sx: AISLE_HW * 2, sy: st, sz: 0.7 }, 0xf0e6cc); }
  });
  // ----- 하이포지움(지하 무대) 나무 뚜껑문: 경기장 동쪽 바닥 (+ 서쪽 둘) -----
  for (const [x, z] of [[13.4, -5.2], [15.6, -5.2], [17.8, -5.2], [13.4, -0.8], [15.6, -0.8], [17.8, -0.8], [-13.6, -10.5], [-13.6, 4.5]]) {
    addGeo(body, plane, { x, y: 0.055, z, rx: -Math.PI / 2, sx: 1.7, sy: 1.7 }, 0x5a3e24);
    addGeo(body, plane, { x, y: 0.06, z, rx: -Math.PI / 2, sx: 1.3, sy: 1.3 }, 0x8a6440);
    for (const d of [-0.33, 0.33]) addGeo(body, plane, { x: x + d, y: 0.065, z, rx: -Math.PI / 2, sx: 0.08, sy: 1.3 }, 0x5a3e24);
  }
  // ----- 횃불: 포디움 벽 앞 모래 위 화로대, 굴 입구, 큰 문 -----
  const torches = [];
  for (let i = 0; i < 16; i++) {
    const th = -Math.PI + (i + 0.5) * (TAU / 16), p = ringPt(th, -0.7), x = Math.abs(p[0] - cx);
    if (Math.sin(th) > 0 && x < COL.GAP[1] + 1) continue; // 남쪽 계단·굴 입구 쪽은 비운다
    if (Math.sin(th) < 0 && x < COL.PULV.hw + 1) continue;
    torches.push({ x: p[0], y: 0, z: p[1], h: 2.6 }); obstacles.push({ x: p[0], z: p[1], r: 0.3 });
  }
  for (const s of [-1, 1]) { const b = ringPt(thetaAtX(cx + s * (TWV + 0.7), OUT + 0.5), OUT + 0.5); torches.push({ x: b[0], y: 0, z: b[1], h: 2.2 }); obstacles.push({ x: b[0], z: b[1], r: 0.3 }); }
  const postGeo = new THREE.CylinderGeometry(0.07, 0.11, 1, 6), bowlGeo = new THREE.CylinderGeometry(0.26, 0.12, 0.24, 8);
  for (const t of torches) { addGeo(body, postGeo, { x: t.x, y: t.h / 2, z: t.z, sy: t.h }, 0x4a3a28); addGeo(body, bowlGeo, { x: t.x, y: t.h + 0.1, z: t.z }, 0xb08a3a); }
  const flameItems = torches.map((t) => ({ x: t.x, y: t.h + 0.45, z: t.z }));
  const flames = makeInstanced(new THREE.ConeGeometry(0.2, 0.55, 7), new THREE.MeshBasicMaterial({ color: 0xffa236 }), flameItems);
  decor.add(flames);

  // 메시로: 본체 하나 + 포디움 조각 K + 다락 조각 K
  const camPos = new THREE.Vector3(0, 50, 60);
  const bodyMesh = toMesh(body, mat); bodyMesh.frustumCulled = false;
  bodyMesh.onBeforeRender = (r, s, cam) => { if (cam.isPerspectiveCamera) camPos.copy(cam.position); }; // 카메라 자리 (조각 숨기기에 쓴다)
  decor.add(bodyMesh);
  let key = '';
  const lowHide = new Set(), attHide = new Set();
  const update = (head) => {
    const k = `${head.x},${head.y},${head.z},${camPos.x},${camPos.z}`; if (k === key) return; key = k;
    const hp = polar(head.x, head.z), cp = polar(camPos.x, camPos.z), feet = head.y - 1;
    headInTunnel = inTunnel(head.x, head.z, hp.w) && hp.w > -0.3 && feet < P - 0.5;
    lowHide.clear(); attHide.clear();
    const near = (set) => { const mid = hp.th + angDiff(cp.th, hp.th) / 2; for (const a of [cp.th, hp.th, mid]) for (const d of [-0.28, 0, 0.28]) set.add(secOf(a + d)); }; // 조각 경계 근처면 옆 조각도
    if (!headInTunnel && hp.w < 0.4 && feet <= P + 0.1 && cp.w > -1.5) near(lowHide); // 경기장 바닥·계단에 있고 카메라가 관중석 위: 포디움 벽·난간을 숨긴다
    if (cp.w > OUT - 1.5 && hp.w < OUT - 0.3 && feet > P - 0.5) near(attHide);          // 관중석 위에 있고 카메라가 바깥 벽 밖: 다락층을 숨긴다
  };
  for (let s = 0; s < K; s++) {
    for (const [G, hide] of [[low[s], lowHide], [att[s], attHide]]) {
      if (!G.pos.length) continue;
      const m = toMesh(G, mat); m.castShadow = false; m.userData.noHide = false;
      m.userData.cutaway = (head) => { update(head); return hide.has(s); };
      decor.add(m);
    }
  }
  // 깃발: 돛대 몇 개에 (빨강·금·파랑·보라) — animate 에서 펄럭인다
  const flagItems = mastTops.filter((_, i) => i % 3 === 0).map((m, i) => ({ x: m.x, y: TOP + 5.2, z: m.z, ry: 0, color: [0xc8302c, 0xe8b630, 0x3a6fc8, 0x7b3fa8][i % 4] }));
  const flagGeo = new THREE.PlaneGeometry(1.8, 1.1); flagGeo.translate(0.9, 0, 0);
  const flags = makeInstanced(flagGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, side: THREE.DoubleSide, roughness: 0.8 }), flagItems);
  decor.add(flags);
  // 벨라리움 (햇빛 가리개 천막): 북쪽 절반만 펼쳐 놓았다. 하나씩 따로 두어 시야를 가리면 main 이 잠깐 숨긴다
  const sailMats = [new THREE.MeshStandardMaterial({ color: 0xf4ead2, side: THREE.DoubleSide, roughness: 1 }), new THREE.MeshStandardMaterial({ color: 0xd2694a, side: THREE.DoubleSide, roughness: 1 })];
  const north = mastTops.filter((m) => Math.sin(m.th) < -0.25).sort((a, b) => a.th - b.th);
  for (let i = 0; i + 1 < north.length; i++) {
    const a = north[i], b = north[i + 1], ia = ringPt(a.th, 6.5), ib = ringPt(b.th, 6.5);
    const pts = [[a.x, TOP + 5.6, a.z], [b.x, TOP + 5.6, b.z], [ib[0], TOP + 1.2, ib[1]], [ia[0], TOP + 1.2, ia[1]]];
    const c = pts.reduce((s, p) => [s[0] + p[0] / 4, s[1] + p[1] / 4, s[2] + p[2] / 4], [0, 0, 0]);
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pts.flatMap((p) => [p[0] - c[0], p[1] - c[1], p[2] - c[2]]), 3)); geo.setIndex([0, 1, 2, 0, 2, 3]); geo.computeVertexNormals();
    const sail = new THREE.Mesh(geo, sailMats[i % 2]); sail.position.set(c[0], c[1], c[2]); sail.castShadow = true; sail.userData.radius = 6; decor.add(sail);
  }

  // ----- 관중 (앉아서 응원). 통로 둘레는 비켜 앉는다 -----
  const bodies = [], heads = [], cheer = [];
  const cloth = [0xf4f0e6, 0xc8302c, 0x3a6fc8, 0xe8b630, 0x4f9a4a, 0x7b3fa8, 0xe07a3a, 0x50b8c8], skins = [0xffe0bd, 0xf1c27d, 0xc68642, 0x8d5524, 0xffd1a8];
  SEG.forEach((s, i) => {
    if (s.kind !== 'row' && s.kind !== 'row2') return;
    const wc = s.w0 + 0.45, list = [];
    for (let th = -Math.PI; th < Math.PI;) {
      const r = reAt(th) + wc;
      const nearAisle = AISLES.some((a) => Math.abs(angDiff(th, a)) < 0.5 && Math.abs(r * Math.sin(angDiff(th, a))) < 1.5);
      if (!nearAisle && rand() < (s.kind === 'row' ? 0.3 : 0.38)) {
        const [x, z] = ringPt(th, wc), face = Math.atan2(cx - x, cz - z);
        const k = bodies.length;
        bodies.push({ x, y: s.h + 0.38, z, ry: face, color: cloth[Math.floor(rand() * cloth.length)] });
        heads.push({ x, y: s.h + 0.95, z, color: skins[Math.floor(rand() * skins.length)] });
        if (rand() < 0.22) cheer.push({ k, x, z, y0: s.h, ph: rand() * 6, ry: face });
        list.push(th);
      }
      th += 1.05 / r;
    }
    SPECT.set(i, list);
  });
  const bodyI = makeInstanced(new THREE.CylinderGeometry(0.2, 0.3, 0.75, 7), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 }), bodies);
  const headI = makeInstanced(new THREE.SphereGeometry(0.21, 8, 6), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 }), heads);
  decor.add(bodyI, headI);

  // ----- 황제석 (풀비나르): 북쪽 포디움 위로 튀어나온 대리석 칸, 기둥 넷, 빨간 지붕 -----
  const pulv = { x: cx, z: cz - B - 2.1 };
  {
    const PV = COL.PULV, depth = PV.w1 - PV.w0;
    const plat = new THREE.Mesh(new THREE.BoxGeometry(PV.hw * 2, PV.top - P + 0.02, depth), new THREE.MeshStandardMaterial({ color: 0xf6f1e6, roughness: 0.7 }));
    plat.position.set(pulv.x, (PV.top + P) / 2, pulv.z); plat.userData.noHide = true; plat.receiveShadow = true; decor.add(plat);
    const carpet = new THREE.Mesh(new THREE.PlaneGeometry(PV.hw * 2 - 1.2, depth - 0.6), new THREE.MeshStandardMaterial({ color: 0x9a2230, roughness: 1 }));
    carpet.rotation.x = -Math.PI / 2; carpet.position.set(pulv.x, PV.top + 0.02, pulv.z); decor.add(carpet);
    const colItems = [];
    for (const sx of [-1, 1]) for (const dz of [-1.3, 1.1]) { colItems.push({ x: pulv.x + sx * (PV.hw - 0.4), y: PV.top + 1.8, z: pulv.z + dz, sx: 0.28, sy: 3.6, sz: 0.28 }); obstacles.push({ x: pulv.x + sx * (PV.hw - 0.4), z: pulv.z + dz, r: 0.35 }); }
    decor.add(makeInstanced(new THREE.CylinderGeometry(1, 1.1, 1, 10), new THREE.MeshStandardMaterial({ color: 0xfbf7ee, roughness: 0.6 }), colItems));
    const roof = new THREE.Group(); roof.position.set(pulv.x, PV.top + 3.8, pulv.z); roof.userData.radius = 5;
    const slab = new THREE.Mesh(new THREE.BoxGeometry(PV.hw * 2 + 0.6, 0.35, depth + 0.6), new THREE.MeshStandardMaterial({ color: 0xe9dfc8 }));
    const tri = new THREE.Shape(); tri.moveTo(-PV.hw - 0.3, 0); tri.lineTo(PV.hw + 0.3, 0); tri.lineTo(0, 1.3); tri.lineTo(-PV.hw - 0.3, 0);
    const pedGeo = new THREE.ExtrudeGeometry(tri, { depth: depth + 0.6, bevelEnabled: false }); pedGeo.translate(0, 0, -(depth + 0.6) / 2);
    const ped = new THREE.Mesh(pedGeo, new THREE.MeshStandardMaterial({ color: 0xb8323a, roughness: 0.8 })); ped.position.y = 0.17; // 세모 박공 지붕 (경기장 쪽을 본다)
    const eagle = new THREE.Mesh(new THREE.OctahedronGeometry(0.45, 0), new THREE.MeshStandardMaterial({ color: 0xffd24a, metalness: 0.6, roughness: 0.3, emissive: 0x6a4a00, emissiveIntensity: 0.4 }));
    eagle.position.set(0, 1.75, 0); eagle.scale.set(1.4, 1, 0.5);
    slab.castShadow = ped.castShadow = true; roof.add(slab, ped, eagle); decor.add(roof);
    // 황제석 아래 포디움 벽의 보라 휘장 (SPQR)
    const drape = new THREE.Mesh(new THREE.PlaneGeometry(6, 1.5), new THREE.MeshStandardMaterial({ map: makeLabelTexture('SPQR', '#5a2a7a', '#ffd93d', 70), roughness: 1 }));
    drape.position.set(pulv.x, 2.0, cz - B + 0.04); drape.userData.noHide = true; decor.add(drape);
    const throne = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.6, 0.8), new THREE.MeshStandardMaterial({ color: 0xd8a83a, metalness: 0.5, roughness: 0.4 }));
    throne.position.set(pulv.x + 1.6, PV.top + 0.8, pulv.z - 0.9); decor.add(throne); obstacles.push({ x: throne.position.x, z: throne.position.z, r: 0.7 });
  }

  // ----- 하이포지움 승강기: 바닥 구멍에서 상자를 싣고 오르내린다 -----
  const lift = { x: 16, z: 4.5 };
  const shaft = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.6), new THREE.MeshBasicMaterial({ color: 0x120c08 })); shaft.rotation.x = -Math.PI / 2; shaft.position.set(lift.x, 0.05, lift.z); shaft.userData.noHide = true; decor.add(shaft);
  const liftG = new THREE.Group(); liftG.position.set(lift.x, 0, lift.z); liftG.userData.radius = 1.6;
  const deck = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.2, 2.3), new THREE.MeshStandardMaterial({ color: 0x9a7048, roughness: 1 })); deck.position.y = -0.1;
  const crate = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.0, 1.0), new THREE.MeshStandardMaterial({ color: 0xc89a5a, roughness: 1 })); crate.position.y = 0.5;
  const ballTop = new THREE.Mesh(new THREE.SphereGeometry(0.32, 14, 10), new THREE.MeshStandardMaterial({ color: 0xe8453c, roughness: 0.4 })); ballTop.position.y = 1.3;
  liftG.add(deck, crate, ballTop); decor.add(liftG);
  obstacles.push({ x: lift.x, z: lift.z, r: 1.25 });

  // 애니메이션: 횃불 일렁임, 깃발 펄럭임, 승강기 오르내림, 응원하는 관중
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1), sc = new THREE.Vector3();
  function animate(t) {
    flameItems.forEach((f, i) => { sc.set(1, 0.8 + Math.sin(t * 9 + i * 1.7) * 0.2 + Math.sin(t * 13 + i) * 0.1, 1); m4.compose(v.set(f.x, f.y, f.z), q.identity(), sc); flames.setMatrixAt(i, m4); });
    flames.instanceMatrix.needsUpdate = true;
    flagItems.forEach((f, i) => { e.set(0, i * 1.3 + Math.sin(t * 2.2 + i) * 0.35, Math.sin(t * 3.1 + i) * 0.06); q.setFromEuler(e); m4.compose(v.set(f.x, f.y, f.z), q, one); flags.setMatrixAt(i, m4); });
    flags.instanceMatrix.needsUpdate = true;
    const lt = (t * 0.25) % 1, up = lt < 0.15 ? lt / 0.15 : lt < 0.55 ? 1 : lt < 0.7 ? 1 - (lt - 0.55) / 0.15 : 0; // 올라와서 잠시 머물렀다 내려간다
    liftG.position.y = -1.6 + up * 1.6;
    for (const c of cheer) { // 응원하는 관중은 들썩들썩
      const j = Math.max(0, Math.sin(t * 6 + c.ph)) * 0.25;
      m4.compose(v.set(c.x, c.y0 + 0.38 + j, c.z), q.setFromEuler(e.set(0, c.ry, 0)), one); bodyI.setMatrixAt(c.k, m4);
      m4.compose(v.set(c.x, c.y0 + 0.95 + j, c.z), q.identity(), one); headI.setMatrixAt(c.k, m4);
    }
    bodyI.instanceMatrix.needsUpdate = true; headI.instanceMatrix.needsUpdate = true;
  }
  return { animate, pulv, lift, counts: { spectators: bodies.length, torches: torches.length } };
}
