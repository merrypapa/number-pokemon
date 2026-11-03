import * as THREE from 'three';
import { makeInstanced } from './world.js';

// 오박사 연구소 = 런던 큐 왕립식물원의 팜 하우스(Palm House, 1848)를 본뜬 쇠와 유리 온실. 이 파일은 건물 뼈대와 높이 규칙만 맡는다 (안의 물건·오박사는 lab.js).
//  - 모양: 가운데가 긴 둥근 지붕(배럴 볼트)이고 동·서 끝은 반원(앱스)으로 둥글다. 위에서 보면 운동장 트랙 모양 (가운데 선분에서 같은 거리).
//  - 단면: 바닥 둘레는 낮은 유리벽(3.2m) → 둥근 아래 지붕(통로, 7m) → 세로 유리창 띠(7~9m) → 크게 휜 위 지붕(꼭대기 17m).
//  - 2층 회랑: 큐처럼 둥근 지붕 아래를 한 바퀴 도는 흰 쇠 회랑(높이 5m). 아래로 걸어 지나갈 수 있고, 회랑 위에서는 난간이 막아 준다.
//  - 동·서 끝의 흰 쇠 나선 계단(한 바퀴 4m, 1과 1/4 바퀴)으로 회랑에 오른다. 꼭대기는 반원 층계참이 회랑과 이어진다.
// 높이 규칙은 푸른숲(yakushima.js)과 같다: 겹치는 것(회랑·계단·층계참)은 지금 높이+0.7 아래일 때만 땅으로 친다.
// 난간은 따로 그리지 않고 규칙 하나로 막는다: 높은 곳(1m 넘게)에 서 있을 때 1.6m 넘게 떨어지는 곳으로는 못 간다 (점프 1.2m 로는 넘지 못한다).

const TAU = Math.PI * 2;
export const PH = { SX: 9, RO: 14, AI: 10, GI: 7.6, GO: 9.8, G: 5, SKIRT: 3.2, AISLE: 7, CLER: 9, APEX: 17 }; // SX: 가운데 선분 반길이, RO: 바깥벽, AI: 세로 창 띠, GI~GO: 회랑 폭, G: 회랑 높이
export const STAIR = { RIN: 0.3, ROUT: 2.0, P: 4, POST: 0.3 };          // 나선 계단: 한 바퀴(P)에 4m, 1.25 바퀴로 회랑 높이 5m
const SC = PH.GI - STAIR.ROUT + 0.3;                                    // 계단 가운데 기둥이 가운데 선분에서 떨어진 거리 (바깥쪽 끝이 회랑에 0.3m 겹친다)
// a0: 나선의 시작 방향. f = 0 은 방 안쪽(입구), f = 0.5 는 바깥쪽(회랑 쪽). 0.25~0.75 가 꼭대기 반원 층계참
export const STAIRS = [{ x: PH.SX + SC, z: 0, a0: -Math.PI }, { x: -PH.SX - SC, z: 0, a0: 0 }];

/** 가운데 선분(x -SX~SX, z 0)까지의 거리 = 벽에서 얼마나 안쪽인가 */
export function spineDist(x, z) { const cx = Math.max(-PH.SX, Math.min(PH.SX, x)); return Math.hypot(x - cx, z); }
/** 안에서 본 지붕 높이 (가운데 선분에서 d 떨어진 곳) */
export function roofH(d) {
  if (d >= PH.RO) return PH.SKIRT;
  if (d > PH.AI) { const u = (d - PH.AI) / (PH.RO - PH.AI); return PH.SKIRT + (PH.AISLE - PH.SKIRT) * Math.sqrt(1 - u * u); }
  const u = d / PH.AI; return PH.CLER + (PH.APEX - PH.CLER) * Math.sqrt(1 - u * u);
}
const fracOf = (s, x, z) => { let f = (Math.atan2(z - s.z, x - s.x) - s.a0) / TAU; return f - Math.floor(f); };
/** 이 자리의 겹치는 바닥 높이들(회랑·계단 비탈 두 바퀴·층계참)을 하나씩 fn 에 넘긴다 */
function forLayers(x, z, fn) {
  const d = spineDist(x, z);
  if (d >= PH.GI && d <= PH.GO) fn(PH.G);
  for (const s of STAIRS) {
    const dx = x - s.x, dz = z - s.z;
    if (Math.abs(dx) > STAIR.ROUT || Math.abs(dz) > STAIR.ROUT || dx * dx + dz * dz > STAIR.ROUT * STAIR.ROUT) continue;
    const f = fracOf(s, x, z);
    fn(STAIR.P * f);                          // 첫 바퀴 (0 ~ 4m)
    if (f <= 0.25) fn(STAIR.P * (1 + f));     // 두 번째 바퀴의 1/4 (4 ~ 5m)
    if (f >= 0.25 && f <= 0.75) fn(PH.G);     // 꼭대기 반원 층계참
  }
}
export function palmHeight(x, z, refY) {
  const lim = (refY ?? 0) + 0.7; let best = 0;
  forLayers(x, z, (h) => { if (h <= lim && h > best) best = h; });
  return best;
}
/** 카메라를 누르는 천장: 위에 겹친 회랑·계단, 그리고 높은 위 지붕(세로 창 띠 안쪽). 낮은 통로 지붕·바깥에서는 누르지 않는다
 * (전에는 통로 지붕까지 눌러 카메라가 바닥 가까이 내려가 현관 쇠살 너머로 주인공을 봤다 → 유리라 위에서 내려다봐도 잘 보인다) */
export function palmCeiling(x, z, y) {
  let c = Infinity;
  forLayers(x, z, (h) => { if (h > y + 0.5 && h < c) c = h; });
  const d = spineDist(x, z);
  if (d < PH.AI) c = Math.min(c, Math.max(roofH(d), y + 4.6));
  return c;
}
export const COLS = [];         // 흰 쇠기둥 { x, z, r, top } (바닥에서만 막는다 — 회랑 위에서는 기둥이 발밑에 있다)
export const GALLERY_PROPS = []; // 회랑 위 물건 { x, z, r } (회랑 높이에서만 막는다)
export function palmBlocked(x, z, refY) {
  const y = refY ?? 0, d = spineDist(x, z);
  if (z > PH.RO + 0.3 || (d > PH.RO - 0.7 && !(Math.abs(x) < 1.3 && z > 0))) return true; // 유리벽 (남쪽 가운데 문만 열림)
  for (const s of STAIRS) if (Math.abs(x - s.x) < STAIR.POST && Math.abs(z - s.z) < STAIR.POST) return true; // 계단 가운데 기둥
  if (y < PH.G - 1) { for (const c of COLS) if (Math.abs(x - c.x) < c.r && Math.abs(z - c.z) < c.r && Math.hypot(x - c.x, z - c.z) < c.r) return true; }
  else { for (const p of GALLERY_PROPS) if (Math.hypot(x - p.x, z - p.z) < p.r) return true; }
  let bump = false, best = 0; const lim = y + 0.7;
  forLayers(x, z, (h) => { if (h > lim && h < y + 1.9) bump = true; if (h <= lim && h > best) best = h; });
  if (bump) return true;                    // 계단 밑에 머리를 박는다 (계단 옆구리로 끼어들지 못한다)
  if (y > 1.0 && best < y - 1.6) return true; // 난간: 높은 곳에서 떨어지는 쪽으로는 못 간다
  return false;
}

// ---------- 모습 ----------
// 둘레를 따라 고른 점들: 가운데 선분 위의 점 b 와 바깥 방향 n. 남쪽 직선 → 동쪽 반원 → 북쪽 직선 → 서쪽 반원 (닫힌 고리)
function loop(stepX, capN) {
  const out = [], n = Math.round((2 * PH.SX) / stepX);
  for (let i = 0; i < n; i++) out.push({ bx: -PH.SX + i * stepX, bz: 0, nx: 0, nz: 1 });
  for (let k = 0; k < capN; k++) { const t = Math.PI / 2 - (k / capN) * Math.PI; out.push({ bx: PH.SX, bz: 0, nx: Math.cos(t), nz: Math.sin(t) }); }
  for (let i = 0; i < n; i++) out.push({ bx: PH.SX - i * stepX, bz: 0, nx: 0, nz: -1 });
  for (let k = 0; k < capN; k++) { const t = -Math.PI / 2 - (k / capN) * Math.PI; out.push({ bx: -PH.SX, bz: 0, nx: Math.cos(t), nz: Math.sin(t) }); }
  return out;
}
const at = (s, d, y) => [s.bx + s.nx * d, y, s.bz + s.nz * d];
// 단면 (가운데에서 거리 d, 높이 h): 바닥 → 낮은 유리벽 → 아래 지붕 → 세로 창 → 위 지붕 꼭대기
const PROF = [[PH.RO, 0]];
for (let i = 0; i <= 4; i++) { const a = (i / 4) * Math.PI / 2; PROF.push([PH.AI + (PH.RO - PH.AI) * Math.cos(a), PH.SKIRT + (PH.AISLE - PH.SKIRT) * Math.sin(a)]); }
for (let i = 0; i <= 6; i++) { const b = (i / 6) * Math.PI / 2; PROF.push([PH.AI * Math.cos(b), PH.CLER + (PH.APEX - PH.CLER) * Math.sin(b)]); }
const isDoor = (s0, s1) => s0.nz === 1 && s1.nz === 1 && Math.abs((s0.bx + s1.bx) / 2) < 0.5; // 남쪽 문 앞 한 칸 (x ±1.29, 유리벽 대신 현관). 세로살이 x=0 에 없어 기본 카메라 한가운데를 가르지 않는다

/** 쇠 막대 묶음 (InstancedMesh 하나). list: [ax, ay, az, bx, by, bz, 굵기] */
export function makeBeams(list, mat, { shadow = false, sides = 4 } = {}) {
  const geo = new THREE.CylinderGeometry(0.5, 0.5, 1, sides, 1, true); // 네모(또는 세모) 막대 (뚜껑 없이 8·6 삼각형)
  const mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, list.length));
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), dir = new THREE.Vector3(), p = new THREE.Vector3(), sc = new THREE.Vector3();
  list.forEach((b, i) => {
    dir.set(b[3] - b[0], b[4] - b[1], b[5] - b[2]); const L = dir.length() || 1e-3; dir.divideScalar(L);
    q.setFromUnitVectors(up, dir); p.set((b[0] + b[3]) / 2, (b[1] + b[4]) / 2, (b[2] + b[5]) / 2); sc.set(b[6], L, b[6]);
    mesh.setMatrixAt(i, m.compose(p, q, sc));
  });
  mesh.count = list.length; mesh.castShadow = shadow; mesh.frustumCulled = false;
  return mesh;
}

export function buildPalmHouse(decor) {
  COLS.length = 0; GALLERY_PROPS.length = 0;
  const iron = new THREE.MeshStandardMaterial({ color: 0xf4f6f2, roughness: 0.5, metalness: 0.15 });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0xd6f3f0, transparent: true, opacity: 0.16, roughness: 0.05, metalness: 0.3, side: THREE.DoubleSide, depthWrite: false });
  const deckMat = new THREE.MeshStandardMaterial({ color: 0xe3ebe4, roughness: 0.8, side: THREE.DoubleSide });
  const beams = [], fine = []; // beams: 굵은 쇠살(그림자 있음), fine: 가는 난간·가로살(그림자 없이 삼각 막대)
  const noHide = (m) => { m.userData.noHide = true; decor.add(m); return m; };
  // 회랑 바닥 + 층계참: 나선 계단을 오르는 동안(머리 위에 회랑이 겹칠 때)은 위에서 보는 카메라를 가리니 잠깐 숨긴다 (main 의 resolveCamera 가 cutaway 를 본다)
  const upper = new THREE.Group();
  upper.userData.cutaway = (head) => { const y = head.y - 1; return y > 0.3 && y < PH.G - 0.6 && STAIRS.some((s) => Math.hypot(head.x - s.x, head.z - s.z) < STAIR.ROUT + 0.4); };
  decor.add(upper);

  // ----- 유리 껍질: 둘레 32칸 × 단면 12칸 (문 앞 유리벽은 비운다) -----
  {
    const L = loop(18 / 7, 8), pos = [], idx = [], NP = PROF.length;
    for (const s of L) for (const [d, h] of PROF) pos.push(...at(s, d, h));
    for (let i = 0; i < L.length; i++) {
      const i1 = (i + 1) % L.length;
      for (let j = 0; j + 1 < NP; j++) {
        if (j === 0 && isDoor(L[i], L[i1])) continue;
        const a = i * NP + j, b = i1 * NP + j; idx.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx); geo.computeVertexNormals();
    const glass = noHide(new THREE.Mesh(geo, glassMat)); glass.renderOrder = 2; // 투명이라 주인공을 가리지 않는다
    // 갈비뼈(세로 쇠살)와 가로 띠. 꼭대기 용마루까지. 반원 끝은 한가운데로 모인다
    for (let i = 0; i < L.length; i++) {
      const s = L[i], s1 = L[(i + 1) % L.length];
      for (let j = 0; j + 1 < PROF.length; j++) {
        beams.push([...at(s, PROF[j][0], PROF[j][1]), ...at(s, PROF[j + 1][0], PROF[j + 1][1]), j < 6 ? 0.13 : 0.16]);
      }
      for (const j of [1, 5, 6, 9]) fine.push([...at(s, PROF[j][0], PROF[j][1]), ...at(s1, PROF[j][0], PROF[j][1]), 0.07]);
      if (!isDoor(s, s1)) beams.push([...at(s, PH.RO, 0.05), ...at(s1, PH.RO, 0.05), 0.12]); // 바닥 문턱
    }
    beams.push([-PH.SX, PH.APEX, 0, PH.SX, PH.APEX, 0, 0.22]); // 용마루
  }

  // ----- 흰 쇠기둥: 세로 창 띠 아래(지붕을 받친다)와 회랑 안쪽 가장자리(회랑을 받친다) -----
  {
    const cols = [];
    const nearStair = (x, z, m) => STAIRS.some((s) => Math.hypot(x - s.x, z - s.z) < STAIR.ROUT + m);
    const spots = [];
    for (const nz of [1, -1]) for (const x of [-6.75, -2.25, 2.25, 6.75]) spots.push({ bx: x, bz: 0, nx: 0, nz }); // 직선 쪽 (문 앞 x=0 은 비운다)
    for (const sx of [1, -1]) for (let k = 0; k <= 6; k++) { const t = -Math.PI / 2 + (k / 6) * Math.PI; spots.push({ bx: sx * PH.SX, bz: 0, nx: sx * Math.cos(t), nz: Math.sin(t) }); } // 반원 끝 (30°마다)
    for (const s of spots) {
      for (const [d, top, r] of [[PH.AI, PH.CLER, 0.17], [PH.GI + 0.2, PH.G - 0.2, 0.13]]) {
        const [x, , z] = at(s, d, 0);
        if (nearStair(x, z, 0.5)) continue;
        cols.push({ x, y: top / 2, z, sx: r, sy: top, sz: r });
        COLS.push({ x, z, r: r + 0.25, top });
      }
    }
    const colMesh = makeInstanced(new THREE.CylinderGeometry(1, 1, 1, 8, 1, true), iron, cols, { shadow: true });
    decor.add(colMesh);
    // 기둥머리의 둥근 쇠 장식 (회랑 아래 기둥)
    const caps = cols.filter((c) => c.sy < PH.G).map((c) => ({ x: c.x, y: c.sy - 0.3, z: c.z, s: 0.24 }));
    decor.add(makeInstanced(new THREE.SphereGeometry(1, 6, 3), iron, caps));
  }

  // ----- 2층 회랑: 운동장 모양 띠 (윗면·아랫면·안팎 옆면) + 안팎 난간 -----
  {
    const L = loop(1.125, 24), LR = loop(2.25, 10), pos = [], idx = [], T = 0.22;
    const ring = (d0, y0, d1, y1) => { const base = pos.length / 3; for (const s of L) { pos.push(...at(s, d0, y0), ...at(s, d1, y1)); } for (let i = 0; i < L.length; i++) { const i1 = (i + 1) % L.length, a = base + i * 2, b = base + i1 * 2; idx.push(a, b, a + 1, b, b + 1, a + 1); } };
    ring(PH.GI, PH.G, PH.GO, PH.G);           // 윗면
    ring(PH.GI, PH.G - T, PH.GO, PH.G - T);   // 아랫면
    ring(PH.GI, PH.G - T, PH.GI, PH.G);       // 안쪽 옆면
    ring(PH.GO, PH.G - T, PH.GO, PH.G);       // 바깥 옆면
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx); geo.computeVertexNormals();
    const deck = new THREE.Mesh(geo, deckMat); deck.receiveShadow = true; deck.castShadow = true; upper.add(deck);
    // 난간: 기둥(1.125m 마다) + 위 손잡이 + 가운데 띠. 계단이 올라오는 자리의 안쪽 난간은 비운다
    const open = (p) => STAIRS.some((s) => Math.hypot(p[0] - s.x, p[2] - s.z) < STAIR.ROUT + 0.35);
    for (const d of [PH.GI + 0.06, PH.GO - 0.06]) {
      for (let i = 0; i < LR.length; i++) {
        const s = LR[i], s1 = LR[(i + 1) % LR.length], p0 = at(s, d, PH.G), p1 = at(s1, d, PH.G);
        if (d < PH.AI - 1 && (open(p0) || open(p1))) continue;
        fine.push([p0[0], PH.G, p0[2], p0[0], PH.G + 1.0, p0[2], 0.07], [p0[0], PH.G + 1.0, p0[2], p1[0], PH.G + 1.0, p1[2], 0.1]);
      }
    }
    // 회랑 아래 쇠 받침(까치발): 안쪽 기둥 위에서 회랑 바닥으로
    for (const c of COLS) if (c.top < PH.G) { const d = spineDist(c.x, c.z), s = { bx: Math.max(-PH.SX, Math.min(PH.SX, c.x)), bz: 0 }; const nx = (c.x - s.bx) / d, nz = c.z / d; beams.push([c.x, PH.G - 1.2, c.z, c.x + nx * 1.2, PH.G - T, c.z + nz * 1.2, 0.07]) }
  }

  // ----- 흰 쇠 나선 계단 두 개 (동·서 끝) -----
  {
    const N = 20, dF = 1.25 / N, dA = dF * TAU, treads = [], lands = [], posts = [];
    for (const s of STAIRS) {
      for (let i = 0; i < N; i++) {
        const a = s.a0 + i * dA, top = STAIR.P * (i + 0.5) * dF;
        treads.push({ x: s.x, y: top - 0.05, z: s.z, ry: Math.PI / 2 - dA - a });
        // 바깥 난간 기둥 + 손잡이 (나선을 따라)
        const h0 = STAIR.P * i * dF, h1 = STAIR.P * (i + 1) * dF, R = STAIR.ROUT - 0.06;
        const px = s.x + Math.cos(a) * R, pz = s.z + Math.sin(a) * R, qx = s.x + Math.cos(a + dA) * R, qz = s.z + Math.sin(a + dA) * R;
        if (i >= 2) fine.push([px, top, pz, px, top + 0.95, pz, 0.05], [px, h0 + 0.95, pz, qx, h1 + 0.95, qz, 0.08]);
      }
      // 꼭대기 반원 층계참 (f 0.25 ~ 0.75): 높이 5m, 회랑과 이어진다
      const aStart = s.a0 + 0.25 * TAU;
      lands.push({ x: s.x, y: PH.G - 0.1 + 0.02, z: s.z, ry: Math.PI / 2 - Math.PI - aStart });
      // 층계참 난간: 회랑과 겹치지 않는 둥근 가장자리 + f 0.75 쪽 곧은 가장자리(그 너머는 뚫린 계단)
      for (let k = 0; k < 8; k++) {
        const a0 = aStart + (k / 8) * Math.PI, a1 = aStart + ((k + 1) / 8) * Math.PI, R = STAIR.ROUT - 0.06;
        const p0 = [s.x + Math.cos(a0) * R, s.z + Math.sin(a0) * R], p1 = [s.x + Math.cos(a1) * R, s.z + Math.sin(a1) * R];
        if (spineDist(p0[0], p0[1]) > PH.GI - 0.2 || spineDist(p1[0], p1[1]) > PH.GI - 0.2) continue;
        fine.push([p0[0], PH.G, p0[1], p0[0], PH.G + 1, p0[1], 0.07], [p0[0], PH.G + 1, p0[1], p1[0], PH.G + 1, p1[1], 0.09]);
      }
      const aE = s.a0 + 0.75 * TAU;
      for (let k = 0; k <= 3; k++) { const r = 0.3 + (k / 3) * (STAIR.ROUT - 0.36), x = s.x + Math.cos(aE) * r, z = s.z + Math.sin(aE) * r; fine.push([x, PH.G, z, x, PH.G + 1, z, 0.07]); }
      fine.push([s.x + Math.cos(aE) * 0.3, PH.G + 1, s.z + Math.sin(aE) * 0.3, s.x + Math.cos(aE) * (STAIR.ROUT - 0.06), PH.G + 1, s.z + Math.sin(aE) * (STAIR.ROUT - 0.06), 0.09]);
      posts.push({ x: s.x, y: (PH.G + 1.6) / 2, z: s.z, sx: 0.16, sy: PH.G + 1.6, sz: 0.16 });
    }
    decor.add(makeInstanced(new THREE.CylinderGeometry(STAIR.ROUT, STAIR.ROUT, 0.1, 3, 1, false, 0, dA * 1.04), iron, treads, { shadow: true }));
    upper.add(makeInstanced(new THREE.CylinderGeometry(STAIR.ROUT, STAIR.ROUT, 0.2, 10, 1, false, 0, Math.PI), deckMat, lands, { shadow: true }));
    decor.add(makeInstanced(new THREE.CylinderGeometry(1, 1, 1, 8), iron, posts));
    decor.add(makeInstanced(new THREE.SphereGeometry(0.22, 8, 6), iron, posts.map((p) => ({ x: p.x, y: p.sy, z: p.z }))));
  }

  // ----- 남쪽 현관 (문) -----
  {
    const z0 = PH.RO, z1 = PH.RO + 1.6, w = 9 / 7, h = 3.0;
    for (const sx of [-w, w]) { beams.push([sx, 0, z0, sx, h, z0, 0.16], [sx, 0, z1, sx, h, z1, 0.16], [sx, h, z0, sx, h, z1, 0.12]); }
    beams.push([-w, h, z1, w, h, z1, 0.16], [-w, h, z0, w, h, z0, 0.16]);
    const sideGlass = new THREE.Mesh(new THREE.PlaneGeometry(1.6, h), glassMat); sideGlass.rotation.y = Math.PI / 2;
    for (const sx of [-w, w]) { const g = sideGlass.clone(); g.position.set(sx, h / 2, (z0 + z1) / 2); noHide(g); }
  }

  decor.add(makeBeams(beams, iron, { shadow: true }), makeBeams(fine, iron, { sides: 3 }));
}
