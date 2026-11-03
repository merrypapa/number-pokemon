import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeInstanced, makePillSprite } from './world.js';

// 야외 체육관 = 고대 올림피아(그리스)를 본뜬 구조물들. 첫 올림픽 경기가 열린 성역이다.
//  - 스타디온: 북쪽의 긴 흙 달리기 길(80m) + 양쪽 끝 돌 출발선 + 양옆의 풀 둑(관중석, 3.6m 비탈로 걸어 올라간다). 남쪽 둑에는 심판석.
//  - 크립테: 남쪽 둑을 뚫고 지나가는 둥근 돌 터널(경기장 입구). 속을 걸어 지나가고(천장 → 카메라를 그 아래로), 둑 꼭대기에서 터널 지붕 위로도 건너간다.
//  - 팔라이스트라: 서쪽의 네모난 레슬링 연습장. 가운데 모래 마당 + 둘레의 돌기둥 회랑(지붕 아래로 걷는다). 남쪽 바깥 돌계단으로 지붕 위 산책길에 오른다.
//  - 제우스 신전: 가운데 큰 돌 기단(세 단, 한 단 0.8m 라 걸어 오른다) + 부러진 기둥 밑동(낮은 것은 밟고, 높은 것은 점프) + 다시 세운 기둥 하나 + 제우스 신상 받침대(점프) 위의 올리브 관.
//    남쪽에는 지진으로 쓰러진 기둥 돌(드럼)이 줄지어 누워 있다: 작은 줄은 걸어서, 큰 줄은 점프로 올라탄다.
//  - 헤라 신전: 크립테 앞의 낮은 기단 + 높이가 제각각인 기둥 밑동. 필리페이온: 북서쪽의 둥근 신전 (계단 두 단 + 기둥 고리 + 둥근 방).
// 높이 규칙(푸른숲과 같다): "단단한 것"(둑·기단·기둥·계단)은 어느 높이에서나 지형, "겹치는 것"(터널 지붕·회랑 지붕)은 지금 높이(refY)+0.7 아래일 때만 지형.
// 그래서 터널 속·회랑 아래를 걸어 다니고, 둑 꼭대기·계단 끝에서만 지붕에 올라선다. 턱(ledge) 0.9 보다 높은 곳은 뛰어야 오른다(점프 ≈ 1.2m).

const TAU = Math.PI * 2, PI2 = Math.PI / 2;
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const rectDist = (x, z, x0, x1, z0, z1) => Math.hypot(Math.max(x0 - x, 0, x - x1), Math.max(z0 - z, 0, z - z1));

// ---------- 배치 (체육관 좌표: 운동장 x -85~85, z -60~60, 남쪽 (0,60) 이 마을 문, 동쪽 (58,-4) 이 연못) ----------
export const STAD = { x0: -66, x1: 14, z0: -51, z1: -41 }; // 달리기 길 (흙)
// 둑: 북쪽은 -51 → -56 에서 3.6m, -58 까지 평평, 울타리 앞으로 내려간다. 남쪽은 -41 → -36 오르막, -33 까지 꼭대기, -28 까지 내리막. 양 끝(x)은 6m 동안 낮아진다(끝에서도 걸어 오른다)
export const EMB = { H: 3.6, x0: -72, x1: 20, taper: 6, nTop: -56, nBack: -58, nOut: -59.8, sTop: -36, sCrest: -33, sOut: -28 };
export const KRYPTE = { x: -56, hw: 3.0, iw: 1.6, z0: -42, z1: -27, roof: 3.6, spring: 1.6, ceil: 3.0 }; // hw: 바깥 반폭, iw: 속 반폭, spring: 둥근 천장이 시작하는 높이
export const JUDGES = { x0: -14, x1: -4, z0: -35.1, z1: -34.1, h: 0.45 }; // 심판석 (남쪽 둑 꼭대기의 돌 의자)
export const PAL = { x: -62, z: 10, S: 11, C: 7.5, roof: 3.4, door: 2.2 }; // S: 바깥벽 반폭, C: 안쪽 기둥 줄 반폭
export const ZEUS = { x: 0, z: -8, steps: [{ hx: 15.5, hz: 8, h: 0.8 }, { hx: 14.5, hz: 7, h: 1.6 }, { hx: 13.5, hz: 6, h: 2.4 }], cella: { hx: 8.5, hz: 2.4, t: 0.6, h: 0.7, door: 1.2 }, ped: { x0: -7.4, x1: -4.6, hz: 1.3, h: 1.1 } };
export const HERA = { x: -34, z: -18, hx: 9, hz: 3.6, h: 0.6 };
export const PHIL = { x: -28, z: 30, r1: 7.4, r2: 6.7, h1: 0.4, h2: 0.8, colR: 6.0, cin: 3.3, cout: 4.35, wallH: 4.6, door: 0.34, ped: 0.9 };
// 쓰러진 기둥: 북쪽(신전 쪽)에서 남쪽으로 드럼이 누워 있고 끝에 기둥머리(네모난 돌)
export const FALLEN = [
  { x: -6, z0: 0.6, n: 5, len: 1.3, r: 0.8, cap: { l: 1.8, h: 0.8 } }, // 작은 줄: 기둥머리(0.8) → 드럼(1.6) 걸어서
  { x: 7, z0: 0.6, n: 4, len: 1.5, r: 1.1, cap: { l: 2.2, h: 1.0 } },  // 큰 줄: 기둥머리(1.0)도 드럼(2.2)도 점프
];
// 장식 올리브 나무 후보 자리 (gym.js 가 연못·구조물과 겹치는 것은 뺀다)
export const OLIVE_SPOTS = [[-78, -20], [-80, 32], [-78, 50], [-62, 40], [-52, 52], [-20, 46], [-12, 24], [14, 22], [24, 12], [22, -20], [26, -40], [42, -50], [70, -50], [80, 40], [56, 44], [42, 52], [-46, -6], [-20, -2], [-8, 16], [-80, -8], [-14, 36], [-46, 28], [20, -30], [80, -40]];

// 기둥들 (높이 계산과 모습이 같은 목록을 쓴다). h: 밑에서부터 기둥 높이, hit: 밟는/막히는 반지름 (사람 몸 두께만큼 크게)
const ZTOP = ZEUS.steps[2].h;
export const ZCOL = (() => {
  const out = [], ax = 12.2, az = 4.7; // 밟는 반지름(1.15)이 기단 가장자리(13.5·6) 안에 들도록
  const south = [0.6, 1.4, 0.8, 10.4, 0.5, 1.2, 0.7, 2.6, 0.9], north = [1.0, 0.5, 4.2, 0.7, 1.5, 0.6, 0.8, 1.3, 0.5];
  for (let i = 0; i < 9; i++) { const x = ZEUS.x - ax + (i * 2 * ax) / 8; out.push({ x, z: ZEUS.z + az, h: south[i] }, { x, z: ZEUS.z - az, h: north[i] }); }
  for (const [s, hs] of [[-1, [0.9, 1.6]], [1, [0.6, 0.8]]]) [-1.68, 1.68].forEach((dz, i) => out.push({ x: ZEUS.x + s * ax, z: ZEUS.z + dz, h: hs[i] }));
  return out.map((c) => ({ ...c, r: 0.8, hit: 1.15, base: ZTOP }));
})();
export const HCOL = (() => {
  const out = [], ax = 8.3, az = 3.0;
  const south = [0.5, 5.2, 0.8, 1.2, 5.2, 0.4, 0.9, 1.5], north = [1.1, 0.6, 0.4, 5.2, 0.8, 1.3, 0.5, 0.7];
  for (let i = 0; i < 8; i++) { const x = HERA.x - ax + (i * 2 * ax) / 7; out.push({ x, z: HERA.z + az, h: south[i] }, { x, z: HERA.z - az, h: north[i] }); }
  return out.map((c) => ({ ...c, r: 0.5, hit: 0.85, base: HERA.h }));
})();
export const PCOL = (() => { // 필리페이온 기둥 고리 (문 쪽(+z)에는 기둥 사이가 오게)
  const out = [];
  for (let i = 0; i < 12; i++) { const a = ((i + 0.5) / 12) * TAU; out.push({ x: PHIL.x + Math.sin(a) * PHIL.colR, z: PHIL.z + Math.cos(a) * PHIL.colR, h: 5.6, r: 0.3, hit: 0.65, base: PHIL.h2 }); }
  return out;
})();
export const PALCOL = (() => { // 팔라이스트라 안쪽 회랑 기둥 (동·북쪽 문 앞 가운데 기둥은 비운다)
  const out = [], C = PAL.C;
  for (let k = -3; k <= 3; k++) {
    const t = k * 2.5;
    out.push({ x: PAL.x + t, z: PAL.z + C }); // 남
    if (k !== 0) out.push({ x: PAL.x + t, z: PAL.z - C }); // 북 (문)
    if (Math.abs(k) < 3) { out.push({ x: PAL.x - C, z: PAL.z + t }); if (k !== 0) out.push({ x: PAL.x + C, z: PAL.z + t }); } // 서, 동 (문). 모서리는 남·북 줄에 있다
  }
  return out;
})();

// ---------- 높이 ----------
function embRaw(x, z) {
  if (x <= EMB.x0 || x >= EMB.x1) return 0;
  let h = 0;
  if (z < STAD.z0) h = z > EMB.nTop ? (STAD.z0 - z) / (STAD.z0 - EMB.nTop) : z > EMB.nBack ? 1 : clamp01((z - EMB.nOut) / (EMB.nBack - EMB.nOut));
  else if (z > STAD.z1 && z < EMB.sOut) h = z < EMB.sTop ? (z - STAD.z1) / (EMB.sTop - STAD.z1) : z <= EMB.sCrest ? 1 : (EMB.sOut - z) / (EMB.sOut - EMB.sCrest);
  return EMB.H * clamp01(h) * clamp01(Math.min(x - EMB.x0, EMB.x1 - x) / EMB.taper);
}
const inKrypte = (x, z, m = 0) => Math.abs(x - KRYPTE.x) < KRYPTE.hw + m && z >= KRYPTE.z0 - m && z <= KRYPTE.z1 + m;
/** 둑 높이 (터널 자리는 터널이 맡는다) */
export function embH(x, z) { return inKrypte(x, z) ? 0 : embRaw(x, z); }
const stairH = (lx) => (lx < 1 ? PAL.roof : (PAL.roof / 8) * (Math.floor(8 - lx) + 1)); // 팔라이스트라 남쪽 계단: 0.425m 씩 7칸 + 맨 위 디딤(3.4)
function colH(list, x, z, h) { for (const c of list) if (Math.abs(x - c.x) < c.hit && Math.abs(z - c.z) < c.hit && Math.hypot(x - c.x, z - c.z) < c.hit) h = Math.max(h, c.base + c.h); return h; }

/** 올림피아 구조물의 높이 (없으면 0). refY: 지금 서 있는 높이 */
export function olyHeight(x, z, refY) {
  const lim = (refY ?? 0) + 0.7;
  let h = 0;
  // 스타디온 둑 · 크립테 지붕(겹침) · 심판석
  if (x > EMB.x0 && x < EMB.x1 && (z < STAD.z0 || z > STAD.z1 - 1.5) && z < EMB.sOut + 1) {
    if (inKrypte(x, z)) { if (KRYPTE.roof <= lim) h = KRYPTE.roof; } else h = embRaw(x, z);
    if (x > JUDGES.x0 && x < JUDGES.x1 && z > JUDGES.z0 && z < JUDGES.z1) h = Math.max(h, EMB.H + JUDGES.h);
    return h;
  }
  // 팔라이스트라: 회랑 지붕(겹침) + 남쪽 바깥 계단(단단)
  const lx = x - PAL.x, lz = z - PAL.z;
  if (Math.abs(lx) < PAL.S + 0.5 && lz > -PAL.S - 0.5 && lz < PAL.S + 2.4) {
    const m = Math.max(Math.abs(lx), Math.abs(lz));
    if (m >= PAL.C - 0.6 && m <= PAL.S + 0.3 && PAL.roof <= lim) h = PAL.roof;
    if (lz > PAL.S + 0.3 && lz < PAL.S + 2.3 && lx > -2 && lx < 8) h = Math.max(h, stairH(lx));
    return h;
  }
  // 제우스 신전: 세 단 기단 + 신상 받침대 + 방 벽 터 + 기둥
  const zx = x - ZEUS.x, zz = z - ZEUS.z;
  if (Math.abs(zx) < ZEUS.steps[0].hx && Math.abs(zz) < ZEUS.steps[0].hz) {
    for (const s of ZEUS.steps) if (Math.abs(zx) < s.hx && Math.abs(zz) < s.hz) h = s.h;
    if (h < ZTOP) return h;
    const c = ZEUS.cella, P = ZEUS.ped;
    const inOuter = Math.abs(zx) < c.hx && Math.abs(zz) < c.hz, inInner = Math.abs(zx) < c.hx - c.t && Math.abs(zz) < c.hz - c.t;
    if (inOuter && !inInner && !(zx > 0 && Math.abs(zz) < c.door)) h = ZTOP + c.h;
    if (zx > P.x0 && zx < P.x1 && Math.abs(zz) < P.hz) h = ZTOP + P.h;
    return colH(ZCOL, x, z, h);
  }
  // 쓰러진 기둥 줄
  for (const f of FALLEN) {
    const dx = Math.abs(x - f.x), zEnd = f.z0 + f.n * f.len;
    if (z < f.z0 || z > zEnd + f.cap.l || dx > f.r + 0.2) continue;
    if (z <= zEnd) { if (dx < f.r) h = Math.max(h, f.r + Math.sqrt(f.r * f.r - dx * dx)); } else h = Math.max(h, f.cap.h);
  }
  if (h > 0) return h;
  // 헤라 신전
  if (Math.abs(x - HERA.x) < HERA.hx && Math.abs(z - HERA.z) < HERA.hz) return colH(HCOL, x, z, HERA.h);
  // 필리페이온: 계단 두 단 + 기둥 고리 + 둥근 방 벽(남쪽 문) + 가운데 받침대
  const px = x - PHIL.x, pz = z - PHIL.z, r = Math.hypot(px, pz);
  if (r < PHIL.r1) {
    h = r < PHIL.r2 ? PHIL.h2 : PHIL.h1;
    if (r > PHIL.cin && r < PHIL.cout && Math.abs(Math.atan2(px, pz)) > PHIL.door) h = PHIL.h2 + PHIL.wallH;
    if (r < PHIL.ped) h = PHIL.h2 + 0.8;
    return colH(PCOL, x, z, h);
  }
  return 0;
}

/** 막힌 곳: 터널 벽·지붕 난간, 팔라이스트라 바깥벽·기둥·지붕 난간 (높은 기둥·벽은 턱(ledge) 때문에 저절로 막힌다) */
export function olyBlocked(x, z, refY) {
  const y = refY ?? 0;
  if (inKrypte(x, z, 0.1)) {
    const dx = Math.abs(x - KRYPTE.x);
    if (y < KRYPTE.roof - 0.6) return z >= KRYPTE.z0 && z <= KRYPTE.z1 && dx > KRYPTE.iw - 0.35; // 터널 벽 (속은 지나간다)
    if (z < KRYPTE.z0 + 0.3 || z > KRYPTE.z1 - 0.3) return true; // 지붕 양 끝 난간
    if (dx > KRYPTE.hw - 0.3 && embRaw(x + Math.sign(x - KRYPTE.x) * 0.9, z) < KRYPTE.roof - 0.9) return true; // 지붕 옆 난간 (둑이 낮은 곳)
    return false;
  }
  const lx = x - PAL.x, lz = z - PAL.z, S = PAL.S, C = PAL.C;
  if (Math.abs(lx) < S + 0.4 && Math.abs(lz) < S + 0.4) {
    const m = Math.max(Math.abs(lx), Math.abs(lz));
    if (y < PAL.roof - 0.8) {
      if (m > S - 0.6 && m < S + 0.15) { // 바깥벽 (동·북쪽 가운데는 문)
        const east = Math.abs(lx) >= Math.abs(lz) && lx > 0, north = Math.abs(lz) > Math.abs(lx) && lz < 0;
        if (!(east && Math.abs(lz) < PAL.door) && !(north && Math.abs(lx) < PAL.door)) return true;
      }
      if (m > C - 0.7 && m < C + 0.7) for (const c of PALCOL) if (Math.hypot(x - c.x, z - c.z) < 0.65) return true; // 회랑 기둥
      return false;
    }
    if (m > C - 0.6 && m < C - 0.25) return true; // 지붕 안쪽 난간 (마당으로 떨어지지 않게)
    if (m > S && m < S + 0.3 && !(lz > 0 && Math.abs(lz) >= Math.abs(lx) && lx > -2 && lx < 1)) return true; // 지붕 바깥 난간 (계단 꼭대기만 열려 있다)
  }
  return false;
}

/** 위에 겹친 천장 (카메라를 그 아래로 누른다). 크립테 속과 그 양쪽 입구 앞(카메라가 뒤따라 오는 자리)까지. 없으면 Infinity */
export function olyCeiling(x, z, y) {
  if (y < KRYPTE.roof - 0.8 && Math.abs(x - KRYPTE.x) < KRYPTE.hw && z > KRYPTE.z0 - 10 && z < KRYPTE.z1 + 12) return KRYPTE.ceil;
  return Infinity;
}

/** 구조물에서 떨어진 거리 (안이면 0). 포켓몬 집·돌아다닐 자리를 구조물에서 비켜 놓는 데 쓴다 */
export function olyClear(x, z) {
  let d = Math.min(
    rectDist(x, z, EMB.x0, EMB.x1, -61, STAD.z0), rectDist(x, z, EMB.x0, EMB.x1, KRYPTE.z0, EMB.sOut), // 둑 (달리기 길 가운데는 비어 있다)
    rectDist(x, z, PAL.x - PAL.S - 0.5, PAL.x + PAL.S + 0.5, PAL.z - PAL.S - 0.5, PAL.z + PAL.S + 2.5),
    rectDist(x, z, ZEUS.x - ZEUS.steps[0].hx, ZEUS.x + ZEUS.steps[0].hx, ZEUS.z - ZEUS.steps[0].hz, ZEUS.z + ZEUS.steps[0].hz),
    rectDist(x, z, HERA.x - HERA.hx, HERA.x + HERA.hx, HERA.z - HERA.hz, HERA.z + HERA.hz),
    Math.max(0, Math.hypot(x - PHIL.x, z - PHIL.z) - PHIL.r1));
  for (const f of FALLEN) d = Math.min(d, rectDist(x, z, f.x - f.r - 0.2, f.x + f.r + 0.2, f.z0, f.z0 + f.n * f.len + f.cap.l));
  return d;
}

// ---------- 모습 ----------
/** decor 에 올림피아 구조물을 세운다. 돌로 된 상자·기둥은 인스턴스로 묶어(그리기 호출이 적게) 그린다 */
export function buildOlympia(decor) {
  const stone = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92 }); // 인스턴스마다 색 (조개 석회암 · 대리석)
  const LIME = 0xd9c49b, LIME_D = 0xc4ad82, MARBLE = 0xeee6d6, PLASTER = 0xe8dcc0;
  const boxes = [], cols = [], caps = [];
  const box = (x0, x1, y0, y1, z0, z1, color) => boxes.push({ x: (x0 + x1) / 2, y: (y0 + y1) / 2, z: (z0 + z1) / 2, sx: x1 - x0, sy: y1 - y0, sz: z1 - z0, color });
  const column = (c, color, capital) => {
    cols.push({ x: c.x, y: c.base + c.h / 2, z: c.z, sx: c.r, sy: c.h, sz: c.r, color });
    if (capital) caps.push({ x: c.x, y: c.base + c.h + 0.15, z: c.z, sx: c.r * 2.5, sy: 0.3, sz: c.r * 2.5, color });
    else caps.push({ x: c.x, y: c.base + c.h + 0.01, z: c.z, sx: c.r * 1.3, sy: 0.02, sz: c.r * 1.3, color: LIME_D, ry: c.x }); // 부러진 면 (조금 어둡게)
  };
  const signs = [];
  const sign = (text, x, y, z, colors, h = 0.75) => { const s = makePillSprite(text, colors, h); s.position.set(x, y, z); decor.add(s); signs.push(s); return s; };
  const BROWN = { bg: '#6a4a00', fg: '#ffffff', border: '#ffd93d' }, DARK = { bg: '#20232e', fg: '#ffd93d', border: '#ffd93d' };

  // ----- 스타디온: 흙 달리기 길 + 돌 출발선 둘 + 풀 둑 (높이장 그물) -----
  const dirt = new THREE.Mesh(new THREE.PlaneGeometry(STAD.x1 - STAD.x0, STAD.z1 - STAD.z0 + 0.6), new THREE.MeshStandardMaterial({ color: 0xd9a066, roughness: 1 }));
  dirt.rotation.x = -PI2; dirt.position.set((STAD.x0 + STAD.x1) / 2, 0.03, (STAD.z0 + STAD.z1) / 2); dirt.receiveShadow = true; dirt.userData.noHide = true; decor.add(dirt);
  for (const x of [STAD.x0 + 4, STAD.x1 - 4]) { box(x - 0.3, x + 0.3, 0.0, 0.09, STAD.z0 + 0.2, STAD.z1 - 0.2, MARBLE); for (let k = 1; k < 8; k++) box(x - 0.05, x + 0.05, 0.0, 0.1, STAD.z0 + k * 1.25 - 0.04, STAD.z0 + k * 1.25 + 0.04, LIME_D); } // 출발선(발 홈 있는 돌) + 칸 나누기
  const embMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 });
  const lo = new THREE.Color(0x5fa64a), hi = new THREE.Color(0x9cc46a), col = new THREE.Color();
  for (const [z0, z1] of [[-60, STAD.z0 + 1], [STAD.z1 - 1, EMB.sOut + 1]]) {
    const nx = EMB.x1 - EMB.x0, nz = z1 - z0;
    const geo = new THREE.PlaneGeometry(nx, nz, nx, nz); geo.rotateX(-PI2); geo.translate((EMB.x0 + EMB.x1) / 2, 0, (z0 + z1) / 2);
    const pos = geo.attributes.position, colors = [];
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const cut = Math.abs(x - KRYPTE.x) < KRYPTE.hw - 0.5 && z > KRYPTE.z0 - 0.5 && z < KRYPTE.z1 + 0.5; // 터널 자리는 깎는다 (터널 벽 속에 숨는다)
      const h = cut ? 0 : embRaw(x, z);
      pos.setY(i, h > 0.001 ? h : -0.08);
      col.copy(lo).lerp(hi, h / EMB.H); col.offsetHSL(0, 0, (Math.sin(x * 1.7 + z * 2.3) * 0.5) * 0.03); colors.push(col.r, col.g, col.b);
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3)); geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, embMat); m.receiveShadow = true; m.userData.noHide = true; decor.add(m);
  }
  box(JUDGES.x0, JUDGES.x1, EMB.H - 0.1, EMB.H + JUDGES.h, JUDGES.z0, JUDGES.z1, MARBLE); // 심판석
  box(JUDGES.x0, JUDGES.x1, EMB.H - 0.1, EMB.H + 1.1, JUDGES.z1, JUDGES.z1 + 0.25, LIME);
  sign('🏟 스타디온 · 첫 올림픽 달리기 길! 양쪽 둑에도 올라가 봐', -26, 3.0, -46, BROWN, 0.85);
  sign('⚖ 심판석', (JUDGES.x0 + JUDGES.x1) / 2, EMB.H + 2.2, JUDGES.z0, DARK, 0.55);
  sign('🏁 출발선', STAD.x1 - 4, 2.2, -46, DARK, 0.55);

  // ----- 크립테: 둥근 천장 돌 터널 (3토막: 카메라가 머리 위 토막만 숨길 수 있게) + 입구 아치 + 돌바닥 -----
  {
    const K = KRYPTE, shape = new THREE.Shape();
    shape.moveTo(-K.hw, 0); shape.lineTo(-K.iw, 0); shape.lineTo(-K.iw, K.spring);
    shape.absarc(0, K.spring, K.iw, Math.PI, 0, true); shape.lineTo(K.iw, 0); shape.lineTo(K.hw, 0); shape.lineTo(K.hw, K.roof); shape.lineTo(-K.hw, K.roof); shape.closePath();
    const vaultMat = new THREE.MeshStandardMaterial({ color: 0xc9a77a, roughness: 0.95 });
    const archMat = new THREE.MeshStandardMaterial({ color: 0xb08f62, roughness: 0.95 });
    const L = (K.z1 - K.z0) / 3;
    for (let i = 0; i < 3; i++) {
      const g = new THREE.Group(), zc = K.z0 + L * (i + 0.5);
      const seg = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: L, bevelEnabled: false, curveSegments: 10 }), vaultMat);
      seg.position.z = -L / 2; seg.castShadow = seg.receiveShadow = true; g.add(seg);
      for (const e of i === 0 ? [-1] : i === 2 ? [1] : []) { // 입구 아치 돌 테두리
        const arch = new THREE.Mesh(new THREE.TorusGeometry(K.iw + 0.18, 0.22, 6, 14, Math.PI), archMat); arch.position.set(0, K.spring, e * (L / 2 + 0.05)); g.add(arch);
        for (const s of [-1, 1]) { const jamb = new THREE.Mesh(new THREE.BoxGeometry(0.44, K.spring, 0.3), archMat); jamb.position.set(s * (K.iw + 0.18), K.spring / 2, e * (L / 2 + 0.05)); g.add(jamb); }
      }
      g.position.set(K.x, 0, zc);
      // 터널 속에 있는데 카메라가 터널 옆(위)에 있으면 이 토막을 숨긴다. 카메라가 터널을 따라 뒤에 있으면(천장 아래로 눌린다) 그대로 둔다
      g.userData.cutaway = (head, target) => {
        if (!inKrypte(head.x, head.z, 0.5) || head.y > K.roof - 0.4) return false;
        if (!target) return false;
        return Math.abs(target.x - K.x) > K.hw && Math.abs(head.z - zc) < L / 2 + 4;
      };
      g.userData.radius = 4; decor.add(g);
    }
    const pz0 = STAD.z1 + 0.4, pz1 = K.z1 + 6; // 달리기 길 흙판과 겹치지 않게 (깊이 싸움)
    const pave = new THREE.Mesh(new THREE.PlaneGeometry(K.iw * 2, pz1 - pz0), new THREE.MeshStandardMaterial({ color: 0xa89474, roughness: 1 }));
    pave.rotation.x = -PI2; pave.position.set(K.x, 0.035, (pz0 + pz1) / 2); pave.receiveShadow = true; pave.userData.noHide = true; decor.add(pave);
    sign('🕳 크립테 · 돌 터널을 지나 경기장으로!', K.x + 4.2, 2.4, K.z1 + 2.5, BROWN, 0.75);
  }

  // ----- 팔라이스트라: 바깥벽 + 회랑 지붕 (8토막, 주인공 가까이면 숨긴다) + 안쪽 기둥 + 모래 마당 + 남쪽 돌계단 -----
  {
    const { x: cx, z: cz, S, C, roof, door } = PAL, R0 = roof - 0.3;
    const roofMat = new THREE.MeshStandardMaterial({ color: 0xc0623a, roughness: 0.85 }), wallMat = new THREE.MeshStandardMaterial({ color: PLASTER, roughness: 0.95 });
    const pieces = [ // [x0,x1,z0,z1] 지붕, 벽 조각들 (지역 좌표)
      // 남·북 지붕은 모서리까지, 동·서 지붕은 그 사이만
      ...[-1, 1].flatMap((sz) => [-1, 1].map((sx) => ({ roof: [sx < 0 ? -S - 0.3 : 0, sx < 0 ? 0 : S + 0.3, sz < 0 ? -S - 0.3 : C - 0.6, sz < 0 ? -(C - 0.6) : S + 0.3], walls: sz < 0 ? [sx < 0 ? [-S, -door, -S, -S + 0.4] : [door, S, -S, -S + 0.4]] : [sx < 0 ? [-S, 0, S - 0.4, S] : [0, S, S - 0.4, S]] }))),
      ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => ({ roof: [sx < 0 ? -S - 0.3 : C - 0.6, sx < 0 ? -(C - 0.6) : S + 0.3, sz < 0 ? -(C - 0.6) : 0, sz < 0 ? 0 : C - 0.6], walls: [sx < 0 ? [-S, -S + 0.4, sz < 0 ? -S + 0.4 : 0, sz < 0 ? 0 : S - 0.4] : [S - 0.4, S, sz < 0 ? -S + 0.4 : door, sz < 0 ? -door : S - 0.4]] }))),
    ];
    // 남·북 벽 조각: 남쪽은 문이 없고, 북쪽은 가운데 문. 동쪽 벽은 가운데 문 (위 목록이 그 틈을 비워 둔다)
    // 지붕 난간(낮은 턱): 안쪽 고리 + 바깥 고리(남쪽 계단 꼭대기만 비운다). 조각마다 잘라서 지붕 판과 한 덩어리로 합친다
    const a = C - 0.6, b = C - 0.45, A = S + 0.15, B = S + 0.3;
    const rails = [[-b, b, -b, -a], [-b, b, a, b], [-b, -a, -a, a], [a, b, -a, a], [-B, B, -B, -A], [-B, -2, A, B], [1, B, A, B], [-B, -A, -A, A], [A, B, -A, A]];
    for (const pc of pieces) {
      const [rx0, rx1, rz0, rz1] = pc.roof, mx = (rx0 + rx1) / 2, mz = (rz0 + rz1) / 2, g = new THREE.Group();
      const parts = [new THREE.BoxGeometry(rx1 - rx0, 0.3, rz1 - rz0)];
      for (const [x0, x1, z0, z1] of rails) {
        const cx0 = Math.max(x0, rx0), cx1 = Math.min(x1, rx1), cz0 = Math.max(z0, rz0), cz1 = Math.min(z1, rz1);
        if (cx1 - cx0 > 0.01 && cz1 - cz0 > 0.01) parts.push(new THREE.BoxGeometry(cx1 - cx0, 0.5, cz1 - cz0).translate((cx0 + cx1) / 2 - mx, 0.4, (cz0 + cz1) / 2 - mz));
      }
      const rm = new THREE.Mesh(mergeGeometries(parts), roofMat); rm.position.set(0, R0 + 0.15 - 1.7, 0); rm.castShadow = rm.receiveShadow = true; g.add(rm);
      for (const [wx0, wx1, wz0, wz1] of pc.walls) { if (wx1 - wx0 < 0.05 || wz1 - wz0 < 0.05) continue; const w = new THREE.Mesh(new THREE.BoxGeometry(wx1 - wx0, R0, wz1 - wz0), wallMat); w.position.set((wx0 + wx1) / 2 - mx, R0 / 2 - 1.7, (wz0 + wz1) / 2 - mz); w.castShadow = true; g.add(w); }
      g.position.set(cx + mx, 1.7, cz + mz);
      const bx0 = cx + rx0, bx1 = cx + rx1, bz0 = cz + rz0, bz1 = cz + rz1;
      // 주인공이 지붕 아래(마당·회랑·벽 바로 바깥)에 있을 때: 카메라 시선이 이 조각을 지나면 숨긴다 (main 이 target 을 안 주면 가까운 조각을 숨긴다)
      g.userData.cutaway = (head, target) => {
        if (head.y > roof - 0.2) return false;
        if (!target) return rectDist(head.x, head.z, bx0, bx1, bz0, bz1) < 4;
        for (let s = 0; s <= 1.0001; s += 0.1) { const px = head.x + (target.x - head.x) * s, pz = head.z + (target.z - head.z) * s, py = head.y + (target.y - head.y) * s; if (py < roof + 0.3 && rectDist(px, pz, bx0, bx1, bz0, bz1) < 0.6) return true; }
        return false;
      };
      g.userData.radius = 6; decor.add(g);
    }
    for (const c of PALCOL) column({ x: c.x, z: c.z, r: 0.3, h: R0 - 0.3, base: 0 }, MARBLE, true);
    // 남쪽 바깥 돌계단 (7칸 + 맨 위 디딤) → 지붕 위 산책길
    for (let i = 0; i < 7; i++) box(cx + 8 - (i + 1), cx + 8 - i, 0, (roof / 8) * (i + 1), cz + S + 0.3, cz + S + 2.3, LIME);
    box(cx - 2, cx + 1, 0, roof, cz + S + 0.3, cz + S + 2.3, LIME);
    const sand = new THREE.Mesh(new THREE.PlaneGeometry(5, 9), new THREE.MeshStandardMaterial({ color: 0xe8d9a8, roughness: 1 })); // 레슬링 모래판 (스카마)
    sand.rotation.x = -PI2; sand.position.set(cx + 2.5, 0.045, cz); sand.receiveShadow = true; sand.userData.noHide = true; decor.add(sand);
    const floorIn = new THREE.Mesh(new THREE.PlaneGeometry(2 * C - 1.2, 2 * C - 1.2), new THREE.MeshStandardMaterial({ color: 0xcdb88a, roughness: 1 })); // 마당 흙바닥
    floorIn.rotation.x = -PI2; floorIn.position.set(cx, 0.02, cz); floorIn.receiveShadow = true; floorIn.userData.noHide = true; decor.add(floorIn);
    sign('🤼 팔라이스트라 · 레슬링 연습장 (남쪽 계단으로 지붕 위까지!)', cx + S + 2.5, 4.6, cz, BROWN, 0.75);
  }

  // ----- 제우스 신전: 세 단 기단 + 방 벽 터 + 신상 받침대 + 기둥 (부러진 밑동, 다시 세운 기둥 하나) + 올리브 관 -----
  {
    let y0 = 0;
    for (const s of ZEUS.steps) { box(ZEUS.x - s.hx, ZEUS.x + s.hx, y0, s.h, ZEUS.z - s.hz, ZEUS.z + s.hz, s.h === ZTOP ? LIME : LIME_D); y0 = s.h; }
    const c = ZEUS.cella, X = ZEUS.x, Z = ZEUS.z, top = ZTOP + c.h;
    box(X - c.hx, X + c.hx, ZTOP, top, Z - c.hz, Z - c.hz + c.t, LIME_D); box(X - c.hx, X + c.hx, ZTOP, top, Z + c.hz - c.t, Z + c.hz, LIME_D); // 북·남 벽 터
    box(X - c.hx, X - c.hx + c.t, ZTOP, top, Z - c.hz + c.t, Z + c.hz - c.t, LIME_D); // 서
    box(X + c.hx - c.t, X + c.hx, ZTOP, top, Z - c.hz + c.t, Z - c.door, LIME_D); box(X + c.hx - c.t, X + c.hx, ZTOP, top, Z + c.door, Z + c.hz - c.t, LIME_D); // 동 (문)
    const P = ZEUS.ped; box(X + P.x0, X + P.x1, ZTOP, ZTOP + P.h, Z - P.hz, Z + P.hz, 0x8a8f96); // 신상 받침대 (검은 돌)
    for (const k of ZCOL) column(k, LIME, k.h > 4);
    sign('🏛 제우스 신전 · 돌계단으로 올라가 봐!', X + 17, 3.0, Z + 6, BROWN, 0.8);
  }
  // 올리브 관 (고대 올림픽의 상): 신상 받침대 위에서 빙글빙글
  const wreath = new THREE.Group();
  {
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x7f9a45, roughness: 0.7, emissive: 0x223300, emissiveIntensity: 0.4 });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.06, 6, 24), new THREE.MeshStandardMaterial({ color: 0x8a6a2a })); wreath.add(ring);
    const leaves = []; for (let i = 0; i < 18; i++) { const a = (i / 18) * TAU; leaves.push({ x: Math.cos(a) * 0.55, y: Math.sin(a) * 0.55, z: (i % 2 ? 0.06 : -0.06), sx: 0.07, sy: 0.17, sz: 0.04, rz: a + 0.5 }); }
    wreath.add(makeInstanced(new THREE.SphereGeometry(1, 6, 4), leafMat, leaves));
    wreath.position.set(ZEUS.x + (ZEUS.ped.x0 + ZEUS.ped.x1) / 2, ZTOP + ZEUS.ped.h + 1.1, ZEUS.z); wreath.userData.noHide = true; decor.add(wreath);
    sign('🌿 올리브 관 · 받침대에 점프!', wreath.position.x, wreath.position.y + 1.3, wreath.position.z, DARK, 0.55);
  }
  // 쓰러진 기둥 줄: 드럼(눕힌 원기둥) + 기둥머리
  for (const f of FALLEN) {
    for (let i = 0; i < f.n; i++) cols.push({ x: f.x, y: f.r, z: f.z0 + (i + 0.5) * f.len, sx: f.r, sy: f.len - 0.08, sz: f.r, rx: PI2, ry: 0, rz: 0.05 * (i % 3 - 1), color: i % 2 ? LIME : LIME_D });
    const z0 = f.z0 + f.n * f.len; box(f.x - f.r - 0.2, f.x + f.r + 0.2, 0, f.cap.h, z0, z0 + f.cap.l, LIME_D);
  }
  sign('🪨 쓰러진 기둥 · 통통 밟고 올라가! (큰 줄은 점프)', (FALLEN[0].x + FALLEN[1].x) / 2, 3.2, 10.5, DARK, 0.6);

  // ----- 헤라 신전: 낮은 기단 + 높이가 제각각인 기둥 -----
  box(HERA.x - HERA.hx, HERA.x + HERA.hx, 0, HERA.h, HERA.z - HERA.hz, HERA.z + HERA.hz, LIME_D);
  for (const k of HCOL) column(k, LIME, k.h > 4);
  sign('🏛 헤라 신전', HERA.x, 7.4, HERA.z, BROWN, 0.6);

  // ----- 필리페이온: 둥근 계단 두 단 + 기둥 12개 + 둥근 방 (남쪽 문) + 지붕 테두리 + 가운데 받침대 -----
  {
    const marble = new THREE.MeshStandardMaterial({ color: MARBLE, roughness: 0.8 });
    const s1 = new THREE.Mesh(new THREE.CylinderGeometry(PHIL.r1, PHIL.r1, PHIL.h1, 40), marble); s1.position.set(PHIL.x, PHIL.h1 / 2, PHIL.z); s1.receiveShadow = true; s1.userData.noHide = true; decor.add(s1);
    const s2 = new THREE.Mesh(new THREE.CylinderGeometry(PHIL.r2, PHIL.r2, PHIL.h2 - PHIL.h1, 40), marble); s2.position.set(PHIL.x, (PHIL.h1 + PHIL.h2) / 2, PHIL.z); s2.receiveShadow = true; s2.userData.noHide = true; decor.add(s2);
    const g = new THREE.Group();
    const wallMat = new THREE.MeshStandardMaterial({ color: 0xe2d6bc, roughness: 0.9, side: THREE.DoubleSide });
    const cella = new THREE.Mesh(new THREE.CylinderGeometry((PHIL.cin + PHIL.cout) / 2, (PHIL.cin + PHIL.cout) / 2, PHIL.wallH, 32, 1, true, PHIL.door, TAU - 2 * PHIL.door), wallMat);
    cella.position.y = PHIL.h2 + PHIL.wallH / 2 - 3; cella.castShadow = true; g.add(cella);
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(PHIL.colR + 0.25, PHIL.colR + 0.25, 0.6, 40, 1, true), wallMat); ring.position.y = PHIL.h2 + 5.6 + 0.6 - 3; g.add(ring);
    g.position.set(PHIL.x, 3, PHIL.z);
    g.userData.cutaway = (head) => Math.hypot(head.x - PHIL.x, head.z - PHIL.z) < PHIL.r1 + 0.5 && head.y < 6; // 안에 들어가면 벽·테두리를 숨긴다
    g.userData.radius = 6; decor.add(g);
    for (const k of PCOL) column(k, MARBLE, true);
    cols.push({ x: PHIL.x, y: PHIL.h2 + 0.4, z: PHIL.z, sx: PHIL.ped, sy: 0.8, sz: PHIL.ped, color: 0xd8cdb5 }); // 가운데 받침대
    sign('⭕ 필리페이온 · 둥근 신전', PHIL.x, 8.6, PHIL.z, BROWN, 0.6);
  }

  decor.add(makeInstanced(new THREE.BoxGeometry(1, 1, 1), stone, boxes, { shadow: true }));
  decor.add(makeInstanced(new THREE.CylinderGeometry(1, 1, 1, 12), stone, cols, { shadow: true }));
  decor.add(makeInstanced(new THREE.BoxGeometry(1, 1, 1), stone, caps));
  return { animate: (t) => { wreath.rotation.y = t * 0.8; wreath.position.y = ZTOP + ZEUS.ped.h + 1.1 + Math.sin(t * 1.6) * 0.12; } };
}
