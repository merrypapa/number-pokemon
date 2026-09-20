import * as THREE from 'three';
import { makeNpc } from './npc.js';
import { rand } from './util.js';
import { buildGround, makePortal, makeInstanced, makePillSprite } from './world.js';

// 꿀벌집 (160x160). 푸른숲 서남쪽 큰 나무에 매달린 벌집 입구로 들어온다. 벌·풀 포켓몬이 산다.
// 벌집 안: 육각형 벌집 무늬 바닥, 둘레를 두른 벌집 칸 벽(육각 기둥과 열린 육각 칸), 밀랍 기둥, 빛나는 꿀 웅덩이(끈적해서 못 들어간다),
// 천장에서 떨어지는 꿀 방울, 날아다니는 꿀벌 떼. 북쪽에는 높은 **벌집 탑**(육각 기둥, 12m)이 있고 그 둘레를 **육각 계단 열한 개**가
// 나선으로 감아 오른다(한 칸에 1m 씩 높아진다). 걸어서는 못 오르고(ledge 0.6) 점프로 한 칸씩 건너뛰어 꼭대기에 오르면 보스가 있다.
// 남쪽 포탈로 푸른숲에 돌아간다.
export const HIVE = {
  size: 160,
  spawn: { x: 0, z: 58 },
  portal: { x: 0, z: 64 },
  tower: { x: 0, z: -46, r: 8, h: 12 },       // 벌집 탑: 꼭대기(높이 12)에 보스
  pools: [{ x: -34, z: 18, r: 6 }, { x: 31, z: -8, r: 7 }, { x: -36, z: -36, r: 6 }, { x: 39, z: 36, r: 5.5 }, { x: 0, z: 10, r: 5 }, { x: 47, z: -44, r: 5 }, { x: -49, z: 52, r: 5 }],
  bumps: [{ x: -26, z: -16, r: 15, h: 1.4 }, { x: 29, z: 21, r: 15, h: 1.2 }, { x: -47, z: 29, r: 12, h: 1.0 }, { x: 44, z: -26, r: 11, h: 1.1 }, { x: 13, z: 34, r: 12, h: 0.9 }],
  wallR: 72, // 이 바깥은 벌집 벽
};
const HEX = 2.6; // 바닥 육각 무늬 한 칸의 크기
/** 육각 계단(벌집 칸): 탑 둘레를 남쪽(90°)에서 시작해 30° 씩 감아 오르며 1m 씩 높아진다. 칸마다 크기·고리 반지름이 조금씩 달라 리듬이 생긴다.
 *  칸 사이 틈은 1.2~2.4m 로 맞춘다(걷는 속도 점프로 건널 수 있는 거리). 마지막 칸은 탑에 바짝 붙어 꼭대기로 건너간다.
 *  bonus 칸은 옆으로 살짝 벗어난 보너스 벌집: 위에 블록이 놓여 있다 (3·6·9번 칸 옆). */
export const HIVE_STEPS = [];
export const HIVE_BONUS = [];
{
  const T = HIVE.tower, N = 11;
  const rings = [12.6, 13.4, 12.2, 13.8, 12.8, 12.0, 13.6, 12.4, 13.2, 12.6, 11.4]; // 마지막은 탑에 붙인다
  const sizes = [2.8, 2.3, 3.2, 2.4, 2.9, 2.2, 3.0, 2.5, 2.7, 2.3, 3.1];
  for (let i = 0; i < N; i++) {
    const a = Math.PI / 2 + (i * Math.PI) / 6 + (i % 2 ? 0.05 : -0.05);
    HIVE_STEPS.push({ x: T.x + Math.cos(a) * rings[i], z: T.z + Math.sin(a) * rings[i], h: i + 1, r: sizes[i], n: i + 1, a });
  }
  // 틈 맞추기: 이전 칸과의 틈이 2.4m 를 넘으면 이전 칸 쪽으로 당긴다 (육각 꼭짓점·변 방향 차이까지 넉넉히)
  const ap = (r) => r * Math.sqrt(3) / 2;
  for (let i = 1; i < N; i++) {
    const a = HIVE_STEPS[i - 1], b = HIVE_STEPS[i];
    for (let k = 0; k < 20; k++) {
      const d = Math.hypot(b.x - a.x, b.z - a.z), gap = d - ap(a.r) - ap(b.r);
      if (gap <= 2.4) break;
      b.x += (a.x - b.x) * 0.06; b.z += (a.z - b.z) * 0.06;
    }
  }
  // 보너스 칸: 3·6·9번 칸 바깥쪽에 0.5m 더 높게, 위에 블록
  for (const n of [3, 6, 9]) {
    const st = HIVE_STEPS[n - 1];
    const dx = st.x - T.x, dz = st.z - T.z, d = Math.hypot(dx, dz);
    const R = 2.2, ring = d + ap(st.r) + ap(R) + 1.6;
    HIVE_BONUS.push({ x: T.x + (dx / d) * ring, z: T.z + (dz / d) * ring, h: st.h + 0.5, r: R, n: `+${n}` });
  }
}
/** 점이 육각형(CylinderGeometry 6각과 같은 방향: 꼭짓점이 ±z) 안에 있나. R 은 꼭짓점까지의 거리 */
function inHex(dx, dz, R) {
  const d = Math.max(Math.abs(dx), Math.abs(dx * 0.5 + dz * Math.sqrt(3) / 2), Math.abs(dx * 0.5 - dz * Math.sqrt(3) / 2));
  return d <= R * Math.sqrt(3) / 2;
}

/** 바닥 높이 (언덕·웅덩이만. 계단·탑은 뺀 것 — 바닥 메시는 이걸로 그린다) */
function hiveFloor(x, z) {
  let y = 0;
  for (const b of HIVE.bumps) { const dx = x - b.x, dz = z - b.z; y += b.h * Math.exp(-(dx * dx + dz * dz) / (b.r * b.r)); }
  for (const p of HIVE.pools) { const d = Math.hypot(x - p.x, z - p.z); if (d < p.r + 1.5) y -= 0.5 * Math.min(1, (p.r + 1.5 - d) / 2); }
  return y;
}
/** 걷는 높이: 바닥 + 육각 계단·탑 (계단 위에 서면 그 높이) */
function hiveHeight(x, z) {
  let y = hiveFloor(x, z);
  const T = HIVE.tower;
  if (inHex(x - T.x, z - T.z, T.r)) return Math.max(y, T.h);
  for (const s of HIVE_STEPS) if (inHex(x - s.x, z - s.z, s.r)) return Math.max(y, s.h);
  for (const s of HIVE_BONUS) if (inHex(x - s.x, z - s.z, s.r)) return Math.max(y, s.h);
  return y;
}
function hiveBlocked(x, z) {
  if (Math.hypot(x, z) > HIVE.wallR - 1) return true; // 벌집 벽
  return HIVE.pools.some((p) => Math.hypot(x - p.x, z - p.z) < p.r + 0.3);
}
export const HIVE_TERRAIN = { height: hiveHeight, inHole: () => false, blocked: hiveBlocked, size: HIVE.size, obstacles: [], ledge: 0.6 }; // ledge: 0.6m 넘는 턱은 뛰어야 오른다

/** 육각 격자: 점이 어느 칸에 있는지와 칸 가장자리까지의 거리 (바닥 무늬용) */
function hexCell(x, z) {
  const q = (Math.sqrt(3) / 3 * x - z / 3) / HEX, r = (2 / 3 * z) / HEX;
  let rx = Math.round(q), rz = Math.round(r), ry = Math.round(-q - r);
  const dq = Math.abs(rx - q), dr = Math.abs(rz - r), dy = Math.abs(ry + q + r);
  if (dq > dr && dq > dy) rx = -rz - ry; else if (dr > dy) rz = -rx - ry;
  const cx = HEX * Math.sqrt(3) * (rx + rz / 2), cz = HEX * 1.5 * rz;
  const dx = x - cx, dz = z - cz;
  // 육각형 안에서 변까지의 거리 (정육각형: 세 방향 투영의 최댓값)
  const edge = Math.max(Math.abs(dz), Math.abs(dz * 0.5 + dx * Math.sqrt(3) / 2), Math.abs(dz * 0.5 - dx * Math.sqrt(3) / 2));
  return { q: rx, r: rz, edge };
}

/** 꿀벌 한 마리: 노란 몸에 검은 줄무늬, 팔랑이는 날개, 눈. userData.wings 로 날개를 움직인다 */
function makeBee(scale = 1) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.32, 12, 10), new THREE.MeshStandardMaterial({ color: 0xffd23f, roughness: 0.6 }));
  body.scale.set(1.5, 1, 1);
  const stripeMat = new THREE.MeshStandardMaterial({ color: 0x20232e, roughness: 0.6 });
  for (const sx of [-0.1, 0.16]) { const s = new THREE.Mesh(new THREE.TorusGeometry(0.31, 0.06, 6, 16), stripeMat); s.rotation.y = Math.PI / 2; s.position.x = sx; s.scale.set(1, 1, 1); g.add(s); }
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), stripeMat); head.position.x = 0.5;
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0xffffff });
  for (const ez of [-0.1, 0.1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 5), eyeMat); e.position.set(0.64, 0.06, ez); g.add(e); }
  const wingMat = new THREE.MeshStandardMaterial({ color: 0xdff6ff, transparent: true, opacity: 0.55, side: THREE.DoubleSide });
  const wings = [];
  for (const side of [-1, 1]) {
    const w = new THREE.Mesh(new THREE.CircleGeometry(0.3, 10), wingMat);
    w.scale.set(1.4, 0.8, 1);
    w.rotation.x = -Math.PI / 2;
    w.position.set(0, 0.28, side * 0.2);
    const pivot = new THREE.Group(); pivot.position.set(0, 0.25, side * 0.08); pivot.add(w); w.position.set(0, 0.03, side * 0.22);
    g.add(pivot); wings.push({ pivot, side });
  }
  const sting = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.2, 6), stripeMat); sting.rotation.z = Math.PI / 2; sting.position.x = -0.55;
  g.add(body, head, sting);
  g.scale.setScalar(scale);
  g.userData.wings = wings;
  return g;
}

export function buildHive(scene) {
  const S = HIVE.size;
  const decor = new THREE.Group();
  scene.add(decor);
  const obstacles = HIVE_TERRAIN.obstacles;
  obstacles.length = 0;
  const block = (x, z, r) => obstacles.push({ x, z, r });

  scene.background = new THREE.Color(0x6b3f0a);
  scene.fog = new THREE.Fog(0x8a5a10, 40, 150);
  scene.add(new THREE.HemisphereLight(0xffe0a0, 0x7a4a10, 1.25));
  const sun = new THREE.DirectionalLight(0xfff0c0, 0.9);
  sun.position.set(20, 30, 10);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -60, right: 60, top: 60, bottom: -60, near: 1, far: 160 });
  scene.add(sun, sun.target);

  // 바닥: 육각 벌집 무늬 (칸마다 노랑·주황·호박색, 칸 가장자리는 진한 갈색), 꿀 웅덩이는 반짝이는 꿀색, 여왕 단은 밝은 금빛
  const fills = [new THREE.Color(0xf4b400), new THREE.Color(0xffc93a), new THREE.Color(0xe89a1a), new THREE.Color(0xffd86a)];
  const border = new THREE.Color(0x8a5a10), honey = new THREE.Color(0xff9a1f), wall = new THREE.Color(0x5a3a08);
  buildGround(scene, S, 240, hiveFloor, (x, z) => {
    if (Math.hypot(x, z) > HIVE.wallR - 1) return wall;
    for (const p of HIVE.pools) if (Math.hypot(x - p.x, z - p.z) < p.r) return honey;
    const h = hexCell(x, z);
    if (h.edge > HEX * 0.78) return border;
    return fills[((h.q % 4) + 4 + ((h.r % 2) + 2) * 2) % 4];
  });

  // 천장: 커다란 어두운 육각 판 + 매달린 벌집 덩어리들
  const ceilY = 28; // 탑(12m) 위로도 넉넉히
  const ceiling = new THREE.Mesh(new THREE.CylinderGeometry(HIVE.wallR + 8, HIVE.wallR + 8, 0.6, 6), new THREE.MeshStandardMaterial({ color: 0x7a4a10, roughness: 1 }));
  ceiling.position.y = ceilY + 0.3;
  scene.add(ceiling);
  const combMat = new THREE.MeshStandardMaterial({ color: 0xe8a020, roughness: 0.7 });
  const hangItems = [];
  for (let i = 0; i < 26; i++) {
    const a = rand(0, Math.PI * 2), r = rand(6, HIVE.wallR - 6);
    const x = Math.cos(a) * r, z = Math.sin(a) * r, h = rand(1.5, 4);
    hangItems.push({ x, y: ceilY - h / 2, z, sx: rand(1.4, 2.6), sy: h, sz: rand(1.4, 2.6), ry: rand(0, 1) });
  }
  decor.add(makeInstanced(new THREE.CylinderGeometry(1, 1, 1, 6), combMat, hangItems));

  // 둘레 벽: 육각 기둥 두 겹(높낮이가 다른 벌집 칸) + 그 안쪽에 열린 육각 칸(벌집 구멍)이 벌집 무늬로 붙어 있다
  const wallItems = [], cellItems = [];
  const wallMat = new THREE.MeshStandardMaterial({ color: 0xd98c1a, roughness: 0.8 });
  const n = 84;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    for (const [rr, hh] of [[HIVE.wallR + 1.5, rand(14, 22)], [HIVE.wallR + 5.5, rand(20, 30)]]) {
      const x = Math.cos(a + (rr > HIVE.wallR + 3 ? Math.PI / n : 0)) * rr, z = Math.sin(a + (rr > HIVE.wallR + 3 ? Math.PI / n : 0)) * rr;
      wallItems.push({ x, y: hh / 2 - 0.5, z, sx: 3.1, sy: hh, sz: 3.1, ry: a });
    }
    // 열린 벌집 칸: 벽 안쪽 면에 두 줄, 축이 가운데를 향한다
    for (const row of [0, 1, 2, 3]) {
      if ((i + row) % 2) continue;
      const rr = HIVE.wallR - 0.4, x = Math.cos(a) * rr, z = Math.sin(a) * rr;
      cellItems.push({ x, y: 1.6 + row * 3.0, z, s: 1, ry: -a });
    }
  }
  decor.add(makeInstanced(new THREE.CylinderGeometry(1, 1, 1, 6), wallMat, wallItems, { shadow: true }));
  const cellGeo = new THREE.CylinderGeometry(1.5, 1.5, 1.6, 6, 1, true);
  cellGeo.rotateZ(Math.PI / 2); // 축을 x 로: ry 로 돌리면 가운데를 향한다
  decor.add(makeInstanced(cellGeo, new THREE.MeshStandardMaterial({ color: 0xb8701a, roughness: 0.9, side: THREE.DoubleSide }), cellItems));

  // 꿀 웅덩이: 빛나는 꿀 + 거품, 불빛은 넷까지
  const honeyMat = new THREE.MeshStandardMaterial({ color: 0xffa020, emissive: 0xff7a00, emissiveIntensity: 0.55, roughness: 0.15, metalness: 0.1 });
  const bubbles = [], poolLights = [];
  for (const p of HIVE.pools) {
    const m = new THREE.Mesh(new THREE.CircleGeometry(p.r + 0.4, 28), honeyMat);
    m.rotation.x = -Math.PI / 2; m.position.set(p.x, hiveHeight(p.x, p.z) + 0.3, p.z);
    scene.add(m);
    for (let k = 0; k < 4; k++) { const b = new THREE.Mesh(new THREE.SphereGeometry(rand(0.12, 0.25), 8, 6), new THREE.MeshStandardMaterial({ color: 0xffd080, transparent: true, opacity: 0.8 })); b.userData = { x: p.x + rand(-p.r * 0.6, p.r * 0.6), z: p.z + rand(-p.r * 0.6, p.r * 0.6), y: hiveHeight(p.x, p.z) + 0.3, phase: rand(0, 6) }; scene.add(b); bubbles.push(b); }
    if (poolLights.length < 4) { const l = new THREE.PointLight(0xffb040, 2.6, 16); l.position.set(p.x, hiveHeight(p.x, p.z) + 1.5, p.z); scene.add(l); poolLights.push(l); }
  }

  // 밀랍 기둥(장애물)과 꿀단지
  const pillarItems = [];
  const clear = (x, z) => Math.hypot(x - HIVE.spawn.x, z - HIVE.spawn.z) < 9 || Math.hypot(x - HIVE.tower.x, z - HIVE.tower.z) < 22 || HIVE.pools.some((p) => Math.hypot(x - p.x, z - p.z) < p.r + 2.5);
  for (let i = 0; i < 44; i++) {
    const a = rand(0, Math.PI * 2), r = rand(6, HIVE.wallR - 6);
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (clear(x, z)) continue;
    const h = rand(2, 6), w = rand(0.8, 1.6);
    pillarItems.push({ x, y: hiveHeight(x, z) + h / 2 - 0.2, z, sx: w, sy: h, sz: w, ry: rand(0, 1) });
    block(x, z, w * 0.95);
  }
  decor.add(makeInstanced(new THREE.CylinderGeometry(1, 1.15, 1, 6), new THREE.MeshStandardMaterial({ color: 0xf0c060, roughness: 0.6 }), pillarItems, { shadow: true }));
  const potMat = new THREE.MeshStandardMaterial({ color: 0xffb020, roughness: 0.4 }), rimMat = new THREE.MeshStandardMaterial({ color: 0xffe08a });
  for (const [x, z] of [[-6, 52], [-9, 55], [10, 50], [-18, -10], [21, 39], [-39, 0], [34, -29]]) {
    const y = hiveHeight(x, z);
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.35, 0.7, 12), potMat); pot.position.set(x, y + 0.35, z); pot.castShadow = true;
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.08, 8, 16), rimMat); rim.rotation.x = Math.PI / 2; rim.position.set(x, y + 0.72, z);
    const drip = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), honeyMat); drip.position.set(x + 0.3, y + 0.55, z);
    decor.add(pot, rim, drip); block(x, z, 0.5);
  }

  // 벌집 탑: 북쪽의 커다란 육각 기둥(12m). 꼭대기는 금빛 단, 둘레에 금빛 기둥 여섯. 보스는 꼭대기에 선다
  const T = HIVE.tower, ty = T.h;
  const towerMat = new THREE.MeshStandardMaterial({ color: 0xe0961c, roughness: 0.75 });
  const tower = new THREE.Mesh(new THREE.CylinderGeometry(T.r, T.r + 0.8, T.h + 0.6, 6), towerMat);
  tower.position.set(T.x, T.h / 2 - 0.3, T.z); tower.castShadow = true; tower.receiveShadow = true; tower.userData.noHide = true;
  const dais = new THREE.Mesh(new THREE.CylinderGeometry(T.r * 0.96, T.r * 0.96, 0.24, 6), new THREE.MeshStandardMaterial({ color: 0xffd23f, emissive: 0xff9a1f, emissiveIntensity: 0.3 }));
  dais.position.set(T.x, ty + 0.12, T.z); dais.userData.noHide = true;
  decor.add(tower, dais);
  // 탑 옆면의 벌집 칸 무늬 (열린 육각 칸이 줄지어)
  const towerCells = [];
  for (let k = 0; k < 6; k++) for (let row = 0; row < 3; row++) {
    const a = (k / 6) * Math.PI * 2 + Math.PI / 6;
    towerCells.push({ x: T.x + Math.cos(a) * (T.r * 0.87), y: 2.2 + row * 3.4, z: T.z + Math.sin(a) * (T.r * 0.87), s: 0.75, ry: -a });
  }
  decor.add(makeInstanced(cellGeo, new THREE.MeshStandardMaterial({ color: 0xb8701a, roughness: 0.9, side: THREE.DoubleSide }), towerCells));
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
    const px = T.x + Math.cos(a) * (T.r - 1.0), pz = T.z + Math.sin(a) * (T.r - 1.0);
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.5, 3, 6), new THREE.MeshStandardMaterial({ color: 0xffe08a, emissive: 0xffb300, emissiveIntensity: 0.35 }));
    p.position.set(px, ty + 1.5, pz); p.castShadow = true;
    decor.add(p); block(px, pz, 0.6);
  }
  const throneLight = new THREE.PointLight(0xffd080, 5, 26);
  throneLight.position.set(T.x, ty + 5, T.z);
  scene.add(throneLight);
  // 육각 계단: 탑 둘레를 나선으로 감아 오르는 벌집 기둥 열한 개 (1m 씩 높아진다). 위에는 번호표
  const stepItems = [], capItems = [], bonusItems = [], bonusCaps = [];
  for (const st of HIVE_BONUS) {
    bonusItems.push({ x: st.x, y: st.h / 2 - 0.3, z: st.z, sx: st.r, sy: st.h + 0.6, sz: st.r });
    bonusCaps.push({ x: st.x, y: st.h + 0.06, z: st.z, sx: st.r * 0.92, sy: 0.12, sz: st.r * 0.92 });
    const tag = makePillSprite('🍯', { bg: '#ffb020', fg: '#5a3a08', border: '#ffe08a' }, 0.7);
    tag.position.set(st.x, st.h + 1.6, st.z);
    decor.add(tag);
  }
  decor.add(makeInstanced(new THREE.CylinderGeometry(1, 1.06, 1, 6), new THREE.MeshStandardMaterial({ color: 0xffc23a, roughness: 0.6 }), bonusItems, { shadow: true }));
  decor.add(makeInstanced(new THREE.CylinderGeometry(1, 1, 1, 6), new THREE.MeshStandardMaterial({ color: 0xffe08a, emissive: 0xffb300, emissiveIntensity: 0.35 }), bonusCaps));
  for (const st of HIVE_STEPS) {
    stepItems.push({ x: st.x, y: st.h / 2 - 0.3, z: st.z, sx: st.r, sy: st.h + 0.6, sz: st.r });
    capItems.push({ x: st.x, y: st.h + 0.06, z: st.z, sx: st.r * 0.92, sy: 0.12, sz: st.r * 0.92 });
    const tag = makePillSprite(String(st.n), { bg: '#5a3a08', fg: '#ffe08a', border: '#ffd23f' }, 0.7);
    tag.position.set(st.x, st.h + 1.6, st.z);
    decor.add(tag);
  }
  decor.add(makeInstanced(new THREE.CylinderGeometry(1, 1.06, 1, 6), new THREE.MeshStandardMaterial({ color: 0xf0b030, roughness: 0.7 }), stepItems, { shadow: true }));
  decor.add(makeInstanced(new THREE.CylinderGeometry(1, 1, 1, 6), new THREE.MeshStandardMaterial({ color: 0xffd86a, emissive: 0xffb300, emissiveIntensity: 0.18 }), capItems));
  // 계단 시작 안내판 (첫 칸 앞)
  const s0 = HIVE_STEPS[0];
  const signAt = { x: s0.x + 3.5, z: s0.z + 4.5 };
  const stepSign = makePillSprite('⬆ 육각 계단을 뛰어서 올라가면 꼭대기에 보스! 🍯 칸에는 블록', { bg: '#ffe08a', fg: '#5a3a08', border: '#d98c1a' }, 0.75);
  stepSign.position.set(signAt.x, hiveFloor(signAt.x, signAt.z) + 2.2, signAt.z);
  decor.add(stepSign);

  // 천장에서 떨어지는 꿀 방울 (줄기 + 방울)
  const drips = [];
  for (let i = 0; i < 14; i++) {
    const a = rand(0, Math.PI * 2), r = rand(4, HIVE.wallR - 8);
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const drop = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), honeyMat);
    const thread = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.09, 1, 6), honeyMat);
    drop.userData = { x, z, y0: hiveHeight(x, z), phase: rand(0, 6), speed: rand(0.35, 0.6), thread };
    scene.add(drop, thread);
    drips.push(drop);
  }

  // 꿀벌 떼: 저마다 다른 고리를 그리며 날고, 날개는 빠르게 팔랑인다
  const bees = [];
  for (let i = 0; i < 38; i++) {
    const b = makeBee(rand(0.7, 1.1));
    b.userData.path = { cx: rand(-52, 52), cz: rand(-52, 52), rx: rand(4, 12), rz: rand(4, 12), h: rand(1.5, 6), speed: rand(0.5, 1.1) * (Math.random() < 0.5 ? 1 : -1), phase: rand(0, 6), bob: rand(0.2, 0.6) };
    scene.add(b);
    bees.push(b);
  }
  // 여왕 자리 둘레를 도는 호위 꿀벌
  for (let i = 0; i < 6; i++) {
    const b = makeBee(1.2);
    b.userData.path = { cx: T.x, cz: T.z, rx: T.r + 3, rz: T.r + 3, h: 3.0, speed: 0.8, phase: (i / 6) * Math.PI * 2, bob: 0.3 }; // 탑 꼭대기 둘레 (hiveHeight 가 탑 위에서는 12)
    scene.add(b);
    bees.push(b);
  }

  // 포탈 (푸른숲으로) + 벌집을 돌보는 숲의 요정 도토로
  const P = HIVE.portal;
  const portal = makePortal(scene, P.x, hiveHeight(P.x, P.z), P.z, { color: 0x9be36d, label: '푸른숲으로 가는 포탈', labelBg: '#5a3a08', labelFg: '#ffe08a' });
  const keeperAt = { x: 8, z: 54 };
  const keeper = makeNpc({ outfit: 'miner', name: '도토로', model: '도토로.glb' });
  keeper.position.set(keeperAt.x, hiveHeight(keeperAt.x, keeperAt.z), keeperAt.z);
  keeper.rotation.y = -0.8;
  decor.add(keeper); block(keeperAt.x, keeperAt.z, 0.6);
  const drop = new THREE.Mesh(new THREE.CircleGeometry(2.2, 24), new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.3 }));
  drop.rotation.x = -Math.PI / 2;
  drop.position.set(HIVE.spawn.x, hiveHeight(HIVE.spawn.x, HIVE.spawn.z) + 0.03, HIVE.spawn.z);
  scene.add(drop);

  function animate(t) {
    for (const b of bees) {
      const p = b.userData.path;
      const a = t * p.speed + p.phase;
      const x = p.cx + Math.cos(a) * p.rx, z = p.cz + Math.sin(a) * p.rz;
      const nx = p.cx + Math.cos(a + 0.05 * Math.sign(p.speed)) * p.rx, nz = p.cz + Math.sin(a + 0.05 * Math.sign(p.speed)) * p.rz;
      b.position.set(x, hiveHeight(x, z) + p.h + Math.sin(t * 2.3 + p.phase) * p.bob, z);
      b.rotation.y = Math.atan2(-(nz - z), nx - x); // 머리(+x)가 가는 방향을 본다
      const flap = Math.sin(t * 40 + p.phase) * 0.7;
      for (const w of b.userData.wings) w.pivot.rotation.x = w.side * flap;
    }
    for (const d of drips) {
      const u = d.userData;
      const life = ((t * u.speed + u.phase) % 3) / 3;
      const y = ceilY - life * life * (ceilY - u.y0);
      d.position.set(u.x, y, u.z);
      d.visible = life < 0.97;
      const len = Math.max(0.2, Math.min(3, (ceilY - y) * 0.6));
      u.thread.scale.y = len; u.thread.position.set(u.x, y + len / 2, u.z); u.thread.visible = life < 0.5;
    }
    for (const b of bubbles) { const u = b.userData; b.position.set(u.x, u.y + Math.abs(Math.sin(t * 1.2 + u.phase)) * 0.25, u.z); }
    for (const l of poolLights) l.intensity = 2.2 + Math.sin(t * 2.5 + l.position.x) * 0.6;
    throneLight.intensity = 4.5 + Math.sin(t * 3) * 0.8;
    portal.animate(t);
  }

  return {
    sun, animate, terrain: HIVE_TERRAIN, decor, portal: P, spawn: HIVE.spawn, dark: false, noShrine: true,
    npcs: [{ x: keeperAt.x, z: keeperAt.z, mesh: keeper, name: '도토로', warp: true, lines: (c) => [
      `꿀벌집에 온 걸 환영해, ${c.name}! 난 이 큰 나무에 사는 숲의 요정 도토로야. 꿀벌들과 벌집을 돌보고 있단다.`,
      '바닥의 육각형 무늬가 벌집 칸이야. 벌들은 왜 육각형으로 집을 지을까? 빈틈없이 꽉 채우면서 밀랍은 가장 적게 쓰거든!',
      '주황빛 꿀 웅덩이는 끈적해서 들어갈 수 없어. 천장에서 떨어지는 꿀 방울도 구경해 봐.',
      '넘버로켓단이 여기서 "여럿을 한꺼번에 조종하기"를 연습했대. 대장 독침붕 머리의 붉은 숫자를 깨 주면 벌집이 다시 조용해질 거야.',
      `여기 포켓몬은 벌레·풀 속성이야. 뿔충이를 키우면 딱충이, 그다음 독침붕이 돼. 공격 ${c.zone.atkRange}쯤 되면 편하게 이겨. 불 포켓몬이 벌레와 풀에 세!`,
      c.conquered.hive ? '대장 독침붕을 이겼구나! 이제 벌집도 네 친구들 거야. 어딘가에 메가독침붕이 나타났을지도 몰라!' : `북쪽 벌집 탑 꼭대기에 대장 독침붕이 있어. 육각 계단 열한 개를 폴짝폴짝 뛰어서 올라가야 해. 걸어서는 못 올라가니까 점프 버튼을 써! 체력 ${c.zone.bossHp || 60}, 공격 ${c.zone.targetAtk + 3} 이상이면 도전해 봐.`,
      '여기서 숫자블록 친구가 내는 퀴즈는 숫자 문제 대신 꿀벌·꿀·벌집 퀴즈야. 벌집 방은 왜 육각형인지, 꿀은 어떻게 만드는지 잘 들어 두렴!',
      '남쪽 초록 포탈로 나가면 푸른숲 큰 나무 아래야.',
    ] }],
    wildSpots: [[-24, 40], [24, 44], [-46, 4], [46, 10], [-20, -20], [20, -24], [-54, -18], [54, -20], [-30, -56], [30, -58], [0, -18], [-58, 34], [58, 52], [10, 28]],
    bossSpot: { x: T.x, z: T.z }, // 탑 꼭대기 (hiveHeight 가 12)
    pickupSpots: [...HIVE_BONUS.map((b) => [b.x, b.z]), [-14, 32], [16, 24], [-40, -10], [40, -40], [0, -28], [-26, 58], [28, 58], [-60, 14], [60, 26], [0, 40], [-10, -48], [48, -10]], // 앞 셋은 보너스 벌집 위
  };
}
