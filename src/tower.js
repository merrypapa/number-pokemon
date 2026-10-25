import * as THREE from 'three';
import { makeNpc } from './npc.js';
import { rand } from './util.js';
import { makeInstanced, makePillSprite } from './world.js';

// 동굴탑 (지하동굴 서쪽 벽 안의 거대한 세로 굴, 94층). 문도 포탈도 없이 **벽을 따라 도는 돌계단**(나선 비탈)을 걸어서
// 꼭대기까지 올라간다. 한 바퀴(360°)에 4m 씩 높아지고 한 바퀴가 한 층이다. 층마다 동쪽(각도 0°)에 넓은 **층계참**(평평한 쐐기 단)이
// 있어 포켓몬 몇 마리가 살고 층 이름표가 떠 있다. 올라갈수록 세진다(1층 Lv.6 → 94층 Lv.48). 10층마다 층계참에 문지기 보스,
// 94층 꼭대기(굴 전체를 덮는 둥근 단, 하늘이 뚫려 별이 보인다)에는 탑의 수호신. 수호신을 친구로 만들면 하늘의 문(지하동굴로
// 내려가는 포탈)이 열리고 특별 보상. 1층(바닥) 서쪽의 워프 패드로 가 본 10층 단위 층계참에 바로 올라갈 수 있다.
//
// 지형은 높이맵이라 "같은 x,z 위에 여러 층"을 표현할 수 없다. 그래서 높이 함수가 세 번째 인자 refY(지금 서 있는 높이)를 받아,
// 그 자리에 있는 여러 바퀴의 비탈 중 refY + 0.7 아래에서 가장 높은 것을 고른다 (world.terrainHeight / isBlocked 의 refY).
// 점프 높이는 1.2m 라 위 바퀴(4m)로 건너뛰지 못한다. 포켓몬은 자기 높이로 같은 규칙을 쓴다. 포켓몬은 지금 있는 층 근처만 세운다 (main 의 towerTick).
export const TOWER = { species: [], conquered: () => false };
export const TOWER_TOP = 94;
export const LAP_H = 4;               // 한 바퀴(한 층)에 오르는 높이
export const R_IN = 11, R_OUT = 16;   // 비탈(돌계단) 안쪽·바깥쪽 반지름
export const LAND_W = 0.40;           // 층계참 쐐기: 각도 -LAND_LO ~ LAND_W (라디안, 약 -17° ~ 23°)
export const LAND_LO = 0.30;
const LAND_R = 6;                     // 층계참 안쪽 반지름
export const TOP_Y = LAP_H * (TOWER_TOP - 1); // 꼭대기 단 높이 (372)
export const GATE_LAYER = 0.7;        // 이 높이 아래의 가장 높은 바퀴를 고른다

/** 층 → 층계참 높이 (1층은 바닥 0) */
export const floorY = (n) => LAP_H * (n - 1);
/** 높이 → 층 (층계참 기준, 1~94) */
export function floorOfY(y) { return Math.max(1, Math.min(TOWER_TOP, Math.floor(y / LAP_H + 0.5) + 1)); }
/** 층계참 가운데 자리 (각도 0 = 동쪽). 94층은 꼭대기 단 가운데 */
export function landingAt(n) { return n >= TOWER_TOP ? { x: 0, z: 6, y: TOP_Y } : { x: (LAND_R + R_OUT) / 2, z: 0, y: floorY(n) }; }
/** 층 → 야생 레벨대 */
export function towerLevelBand(floor) { const mid = Math.round(5 + floor * 0.46); return [Math.max(2, mid - 1), Math.min(49, mid + 2)]; }
function gradeCap(floor) { return floor <= 15 ? 1 : floor <= 30 ? 2 : floor <= 50 ? 3 : floor <= 70 ? 4 : 5; }
function seeded(n) { let s = (n * 2654435761 + 12345) >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
/** 이 층 층계참에 사는 종 (층마다 정해져 있어서 다시 와도 같다) */
export function towerWild(floor, count = 3) {
  const cap = gradeCap(floor);
  const pool = TOWER.species.filter((c) => c.catchable && !c.boss && !c.mega && !c.unlockedBy && !c.special && !c.sleeping && !c.swim && !c.deepSea && c.model && (c.grade || 1) <= cap && (c.grade || 1) >= Math.max(1, cap - 1));
  const rnd = seeded(floor);
  const out = [], list = [...pool];
  while (out.length < count && list.length) out.push(list.splice(Math.floor(rnd() * list.length), 1)[0].id);
  return out;
}
/** 10층마다 문지기 보스: 그 층 등급의 종 하나가 크고 세게 */
export function towerFloorBoss(floor) {
  if (floor % 10 !== 0 || floor >= TOWER_TOP) return null;
  const cap = gradeCap(floor);
  const pool = TOWER.species.filter((c) => c.catchable && !c.mega && !c.unlockedBy && !c.special && !c.sleeping && !c.swim && !c.deepSea && c.model && (c.grade || 1) === cap);
  const sp = pool[Math.floor(seeded(floor * 7 + 3)() * pool.length)];
  if (!sp) return null;
  return { id: sp.id, hp: 40 + floor * 2, atk: 5 + Math.round(floor * 0.3), scale: Math.min(2.6, (sp.scale || 1) * 1.7), level: towerLevelBand(floor)[1] + 3 };
}

const TAU = Math.PI * 2;
const angOf = (x, z) => { const a = Math.atan2(z, x); return a < 0 ? a + TAU : a; };   // 0 ~ 2π (0 = 동쪽)
const ramp = (a) => (a <= LAND_W ? 0 : (a - LAND_W) / (TAU - LAND_W));                 // 층계참(0~LAND_W)은 평평, 나머지 한 바퀴 동안 0 → 1
const inLanding = (a) => a <= LAND_W || a >= TAU - LAND_LO;                            // 층계참 쐐기 (각도 0 조금 아래까지: 포켓몬이 가장자리를 조금 벗어나도 떨어지지 않게)
/** 그 자리에 있을 수 있는 높이들 중 refY + GATE_LAYER 아래에서 가장 높은 것 */
function towerHeight(x, z, refY = 0) {
  const r = Math.hypot(x, z);
  if (r > R_OUT + 0.6) return 0;
  const lim = (refY ?? 0) + GATE_LAYER;
  let best = 0; // 바닥 (1층)
  if (TOP_Y <= lim) best = TOP_Y;
  const a = angOf(x, z);
  if (r >= R_IN - 0.05) { // 비탈 (바퀴 k = 0 ~ 92)
    const k = Math.floor(lim / LAP_H - ramp(a));
    if (k >= 0 && k <= TOWER_TOP - 2) best = Math.max(best, LAP_H * (k + ramp(a)));
  } else if (r >= LAND_R - 0.05 && inLanding(a)) { // 층계참 안쪽 (평평, 층 2 ~ 93)
    const k = Math.floor(lim / LAP_H);
    if (k >= 1 && k <= TOWER_TOP - 2) best = Math.max(best, LAP_H * k);
  }
  return best;
}
function towerBlocked(x, z, refY = 0) {
  const r = Math.hypot(x, z);
  if (r > R_OUT) return true;                                   // 바깥 벽
  const y = refY ?? 0;
  if (y < LAP_H * 0.5 || y > TOP_Y - LAP_H * 0.5) return false; // 바닥·꼭대기 단은 어디든 간다
  if (r >= R_IN) return false;                                  // 비탈 위
  const a = angOf(x, z);
  return !(r >= LAND_R && inLanding(a));                        // 층계참 쐐기 밖(가운데 굴)은 떨어지니 난간으로 막는다
}
export const TOWER_TERRAIN = { height: towerHeight, inHole: () => false, blocked: towerBlocked, size: 40, obstacles: [] };

export function buildTower(scene) {
  const decor = new THREE.Group();
  scene.add(decor);
  const obstacles = TOWER_TERRAIN.obstacles;
  obstacles.length = 0;
  const block = (x, z, r) => obstacles.push({ x, z, r });

  scene.background = new THREE.Color(0x141a26);
  scene.fog = new THREE.Fog(0x141a26, 18, 60); // 위아래가 까마득하게 보이지 않게 (계단은 가장자리 금빛 띠가 안개 너머로도 보인다)
  scene.add(new THREE.HemisphereLight(0xaab4d4, 0x2a2d3a, 1.6));
  const baseLight = new THREE.PointLight(0xffd9a0, 4, 36); baseLight.position.set(0, 6, 0); scene.add(baseLight); // 바닥은 밝게 (위층은 횃불과 주인공의 등불)
  // 처음 두 바퀴의 계단을 비추는 등불 셋씩 (1층에서 올려다봤을 때 계단이 보이게)
  for (let k = 0; k < 2; k++) for (const a of [Math.PI * 0.6, Math.PI * 1.2, Math.PI * 1.8]) { const l = new THREE.PointLight(0xffd9a0, 2.2, 16); l.position.set(13.5 * Math.cos(a), LAP_H * (k + ramp(a)) + 2.5, 13.5 * Math.sin(a)); scene.add(l); }
  const sun = new THREE.DirectionalLight(0xffffff, 0.4);
  sun.position.set(6, 30, 4);
  scene.add(sun, sun.target);
  const tierColor = (k) => [0x8b93a6, 0x6f84b0, 0x8a74b4, 0xb8a455][Math.min(3, Math.floor(k / 24))]; // 24층마다 돌 색 (밝은 회색 → 푸른 돌 → 보랏빛 → 금빛)

  // ---------- 나선 비탈 (돌계단): 바퀴 93개를 한 메시로 ----------
  {
    const SEG = 60; // 한 바퀴를 60조각으로
    const pos = [], col = [], idx = [];
    const tmp = new THREE.Color();
    const push = (x, y, z, c) => { pos.push(x, y, z); tmp.setHex(c); col.push(tmp.r, tmp.g, tmp.b); return pos.length / 3 - 1; };
    for (let k = 0; k <= TOWER_TOP - 2; k++) {
      const c = tierColor(k), cDark = new THREE.Color(c).multiplyScalar(0.55).getHex(); // 한 칸 걸러 어둡게: 계단 무늬가 또렷하게
      let prev = null;
      for (let i = 0; i <= SEG; i++) {
        const a = (i / SEG) * TAU * 0.99999;
        const y = LAP_H * (k + ramp(a));
        const cs = Math.cos(a), sn = Math.sin(a);
        const shade = i % 2 ? c : cDark; // 계단 무늬
        const vi = push(R_IN * cs, y, R_IN * sn, shade), vo = push(R_OUT * cs, y, R_OUT * sn, shade);
        const vl = push((R_IN + 0.35) * cs, y + 0.55, (R_IN + 0.35) * sn, 0x20232e), vl2 = push(R_IN * cs, y + 0.55, R_IN * sn, 0x20232e); // 안쪽 난간 (낮은 턱)
        if (prev) { idx.push(prev.vi, vi, prev.vo, vi, vo, prev.vo); idx.push(prev.vl2, vl2, prev.vl, vl2, vl, prev.vl); idx.push(prev.vl2, prev.vi, vl2, vl2, prev.vi, vi); }
        prev = { vi, vo, vl, vl2 };
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, side: THREE.DoubleSide }));
    mesh.userData.noHide = true;
    decor.add(mesh);
    // 바깥 가장자리를 따라 도는 금빛 띠: 안개·어둠 너머로도 계단이 어디로 도는지 보인다 (안개 안 받음, 빛 안 받음)
    const gpos = [], gidx = [];
    let gp = null;
    for (let k = 0; k <= TOWER_TOP - 2; k++) for (let i = 0; i <= SEG; i++) {
      const a = (i / SEG) * TAU * 0.99999, y = LAP_H * (k + ramp(a)) + 0.03, cs = Math.cos(a), sn = Math.sin(a);
      const vi = gpos.push((R_OUT - 0.5) * cs, y, (R_OUT - 0.5) * sn) / 3 - 1, vo = gpos.push((R_OUT - 0.05) * cs, y, (R_OUT - 0.05) * sn) / 3 - 1;
      if (gp && i > 0) gidx.push(gp.vi, vi, gp.vo, vi, vo, gp.vo);
      gp = { vi, vo };
    }
    const ggeo = new THREE.BufferGeometry();
    ggeo.setAttribute('position', new THREE.Float32BufferAttribute(gpos, 3));
    ggeo.setIndex(gidx);
    const glow = new THREE.Mesh(ggeo, new THREE.MeshBasicMaterial({ color: 0xffd36b, fog: false, side: THREE.DoubleSide }));
    glow.userData.noHide = true;
    decor.add(glow);
  }
  // ---------- 1층 계단 입구: 표지판 + 바닥 화살표 (첫 바퀴를 따라) ----------
  {
    const a0 = LAND_W + 0.12;
    const sign = makePillSprite('▲ 돌계단 시작! 여기로 올라가', { bg: '#6a4a00', fg: '#ffffff', border: '#ffd93d' }, 1.1);
    sign.position.set(13.5 * Math.cos(a0), 3.0, 13.5 * Math.sin(a0));
    decor.add(sign);
    const arrows = [];
    for (let i = 0; i < 14; i++) { const a = a0 + i * 0.42; arrows.push({ x: 13.5 * Math.cos(a), y: LAP_H * ramp(a) + 0.2, z: 13.5 * Math.sin(a), rz: -Math.PI / 2, ry: -Math.PI / 2 - a, sx: 0.9, sy: 0.9, sz: 0.9 }); } // 뾰족한 쪽이 올라가는 방향
    decor.add(makeInstanced(new THREE.ConeGeometry(0.35, 0.8, 3), new THREE.MeshBasicMaterial({ color: 0xffd93d, fog: false }), arrows));
  }
  // ---------- 층계참 쐐기 (2 ~ 93층) + 층 이름표 ----------
  {
    const pos = [], col = [], idx = [];
    const tmp = new THREE.Color();
    const push = (x, y, z, c) => { pos.push(x, y, z); tmp.setHex(c); col.push(tmp.r, tmp.g, tmp.b); return pos.length / 3 - 1; };
    for (let n = 2; n <= TOWER_TOP - 1; n++) {
      const y = floorY(n), c = n % 10 === 0 ? 0xb8860b : tierColor(n - 1);
      const steps = 6;
      let prev = null;
      for (let i = 0; i <= steps; i++) {
        const a = -LAND_LO + (i / steps) * (LAND_W + LAND_LO), cs = Math.cos(a), sn = Math.sin(a);
        const vi = push(LAND_R * cs, y, LAND_R * sn, c), vo = push((R_IN + 0.3) * cs, y, (R_IN + 0.3) * sn, c);
        if (prev) idx.push(prev.vi, vi, prev.vo, vi, vo, prev.vo);
        prev = { vi, vo };
      }
      // 안쪽 가장자리 난간 기둥 둘
      for (const a of [-LAND_LO + 0.04, LAND_W - 0.04]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.0, 0.3), new THREE.MeshStandardMaterial({ color: 0x20232e })); p.position.set(LAND_R * Math.cos(a), y + 0.5, LAND_R * Math.sin(a)); decor.add(p); }
      const label = makePillSprite(`${n}층${n % 10 === 0 ? ' · 문지기' : ''}`, { bg: n % 10 === 0 ? '#6a4a00' : '#20232e', fg: '#ffd93d', border: '#ffd93d' }, 0.9);
      label.position.set((LAND_R + R_OUT) / 2 * Math.cos(LAND_W / 2), y + 3.2, (LAND_R + R_OUT) / 2 * Math.sin(LAND_W / 2));
      decor.add(label);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, side: THREE.DoubleSide }));
    mesh.userData.noHide = true;
    decor.add(mesh);
  }
  // ---------- 바깥 벽: 안쪽 면만 그리는 원통 (카메라가 벽 밖으로 나가도 가리지 않는다) + 바닥·꼭대기 단 ----------
  const wall = new THREE.Mesh(new THREE.CylinderGeometry(R_OUT + 0.6, R_OUT + 0.6, TOP_Y + 20, 48, 1, true), new THREE.MeshStandardMaterial({ color: 0x4a5268, roughness: 1, side: THREE.BackSide }));
  wall.position.y = TOP_Y / 2 + 4; wall.userData.noHide = true;
  decor.add(wall);
  const base = new THREE.Mesh(new THREE.CircleGeometry(R_OUT + 0.6, 48), new THREE.MeshStandardMaterial({ color: 0x5e6679, roughness: 0.9 }));
  base.rotation.x = -Math.PI / 2; base.userData.noHide = true; base.receiveShadow = true;
  decor.add(base);
  const top = new THREE.Mesh(new THREE.CircleGeometry(R_OUT + 0.6, 48), new THREE.MeshStandardMaterial({ color: 0x8a7a40, roughness: 0.9 }));
  top.rotation.x = -Math.PI / 2; top.position.y = TOP_Y; top.userData.noHide = true;
  decor.add(top);
  // 꼭대기 금빛 무대 + 하늘 (별) + 하늘의 문
  const stage = new THREE.Mesh(new THREE.CylinderGeometry(6, 6.5, 0.4, 32), new THREE.MeshStandardMaterial({ color: 0xffd93d, emissive: 0xffb300, emissiveIntensity: 0.4 }));
  stage.position.set(0, TOP_Y + 0.2, 0); stage.userData.noHide = true;
  decor.add(stage);
  const stars = []; for (let i = 0; i < 160; i++) { const a = rand(0, TAU), r = rand(0, 30); stars.push({ x: Math.cos(a) * r, y: TOP_Y + rand(10, 30), z: Math.sin(a) * r }); }
  decor.add(makeInstanced(new THREE.SphereGeometry(0.07, 5, 4), new THREE.MeshBasicMaterial({ color: 0xffffff }), stars));
  const topLight = new THREE.PointLight(0xfff1b5, 3, 40); topLight.position.set(0, TOP_Y + 8, 0); decor.add(topLight);
  const skyAt = { x: 0, z: -11, y: TOP_Y };
  const gate = new THREE.Group();
  const arch = new THREE.Mesh(new THREE.TorusGeometry(2.6, 0.3, 10, 40, Math.PI), new THREE.MeshStandardMaterial({ color: 0xffd93d, emissive: 0xffb300, emissiveIntensity: 0.8 })); arch.position.y = 0.3;
  const disc = new THREE.Mesh(new THREE.CircleGeometry(2.3, 32, 0, Math.PI), new THREE.MeshBasicMaterial({ color: 0x9fe8ff, transparent: true, opacity: 0.5, side: THREE.DoubleSide })); disc.position.y = 0.3;
  const gateLight = new THREE.PointLight(0x9fe8ff, 4, 18); gateLight.position.y = 2;
  const gateSign = makePillSprite('🌌 하늘의 문 · 지하동굴로', { bg: '#1f2a3a', fg: '#9fe8ff', border: '#9fe8ff' }, 1.4); gateSign.position.y = 4.6;
  gate.add(arch, disc, gateLight, gateSign);
  gate.position.set(skyAt.x, TOP_Y, skyAt.z);
  gate.visible = TOWER.conquered();
  decor.add(gate);

  // ---------- 횃불 (바퀴마다 넷, 인스턴스) + 바닥 장식 ----------
  const torchItems = [];
  for (let k = 0; k <= TOWER_TOP - 2; k++) for (let i = 0; i < 4; i++) { const a = LAND_W + (i + 0.5) * (TAU - LAND_W) / 4; torchItems.push({ x: (R_OUT - 0.4) * Math.cos(a), y: LAP_H * (k + ramp(a)) + 2.2, z: (R_OUT - 0.4) * Math.sin(a) }); }
  decor.add(makeInstanced(new THREE.ConeGeometry(0.25, 0.6, 7), new THREE.MeshStandardMaterial({ color: 0xffa322, emissive: 0xff8a00, emissiveIntensity: 1.2 }), torchItems));
  const title = makePillSprite('🗼 동굴탑 1층 · 동쪽 금빛 돌계단을 따라 94층까지 →', { bg: '#20232e', fg: '#ffd93d', border: '#ffd93d' }, 1.6);
  title.position.set(0, 6, 0); decor.add(title);
  const crystalItems = [];
  for (let i = 0; i < 12; i++) { const a = rand(0, TAU), r = rand(3, 9); for (let k = 0; k < 3; k++) { const h = rand(0.8, 2); crystalItems.push({ x: Math.cos(a) * r + rand(-0.5, 0.5), y: h / 2 - 0.1, z: Math.sin(a) * r + rand(-0.5, 0.5), sx: 0.3, sy: h, sz: 0.3, ry: rand(0, 3) }); } block(Math.cos(a) * r, Math.sin(a) * r, 0.7); }
  decor.add(makeInstanced(new THREE.ConeGeometry(1, 1, 5), new THREE.MeshStandardMaterial({ color: 0xffd93d, emissive: 0xffc400, emissiveIntensity: 0.6 }), crystalItems));

  // ---------- 1층: 탑지기 아이 손오공 + 기록석 워프 패드 (가 본 10층 단위까지, main 이 best 를 보고 켠다) ----------
  const keeperAt = { x: -4, z: 10 };
  const keeper = makeNpc({ outfit: 'ranger', name: '아이 손오공', model: '아이손오공.glb' });
  keeper.position.set(keeperAt.x, 0, keeperAt.z); keeper.rotation.y = 0.4;
  decor.add(keeper); block(keeperAt.x, keeperAt.z, 0.6);
  const pads = [];
  for (const fl of [10, 20, 30, 40, 50, 60, 70, 80, 90, TOWER_TOP]) {
    const at = { x: -12 + (fl / 10 - 1) * 0.0, z: 8 - (fl / 10 - 1) * 1.9 };
    const g = new THREE.Group();
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.9, 0.2, 20), new THREE.MeshStandardMaterial({ color: fl === TOWER_TOP ? 0xffd93d : 0x66e0ff, emissive: fl === TOWER_TOP ? 0xaa7700 : 0x2288aa, emissiveIntensity: 0.8 }));
    pad.position.y = 0.1; pad.userData.noHide = true;
    const lbl = makePillSprite(fl === TOWER_TOP ? '94층 꼭대기로' : `${fl}층으로`, { bg: fl === TOWER_TOP ? '#6a4a00' : '#0f5f7a', fg: '#ffffff', border: '#66e0ff' }, 0.75);
    lbl.position.y = 1.7;
    g.add(pad, lbl); g.position.set(at.x, 0, at.z); g.visible = false;
    decor.add(g);
    pads.push({ n: fl, x: at.x, z: at.z, group: g });
  }
  function refreshPads(best) { for (const p of pads) p.group.visible = best >= p.n; }
  // 바닥 남쪽 출구 (지하동굴로 나가는 문)
  const exitAt = { x: 0, z: 14.8 };
  {
    const stoneMat = new THREE.MeshStandardMaterial({ color: 0x3a4150, roughness: 1 });
    for (const side of [-1, 1]) { const post = new THREE.Mesh(new THREE.BoxGeometry(0.6, 4, 0.6), stoneMat); post.position.set(side * 2.2, 2, R_OUT - 0.4); decor.add(post); }
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.7, 0.8), stoneMat); lintel.position.set(0, 4.2, R_OUT - 0.4); decor.add(lintel);
    const dark = new THREE.Mesh(new THREE.BoxGeometry(3.8, 3.8, 2), new THREE.MeshBasicMaterial({ color: 0x05070c })); dark.position.set(0, 1.9, R_OUT + 0.4); decor.add(dark);
    const sign = makePillSprite('▼ 지하동굴로 나가기', { bg: '#1f2a3a', fg: '#9fe8ff', border: '#9fe8ff' }, 1.0); sign.position.set(0, 5.2, R_OUT - 0.6); decor.add(sign);
  }

  function animate(t) {
    title.position.y = 6 + Math.sin(t * 1.5) * 0.15;
    disc.material.opacity = 0.35 + Math.sin(t * 3) * 0.15;
    stage.material.emissiveIntensity = 0.3 + Math.sin(t * 2) * 0.15;
  }
  return {
    sun, animate, terrain: TOWER_TERRAIN, decor, spawn: { x: 5, z: 8 }, dark: true, noShrine: true, transient: true, tower: true,
    wildSpots: [], pickupSpots: [[6, -6], [-7, -4]],
    checkpoints: pads, refreshPads, exitGate: exitAt,
    skyDoor: skyAt, portal: TOWER.conquered() ? skyAt : null, portalTo: 'cave',
    openSkyDoor: () => { gate.visible = true; },
    npcs: [{ x: keeperAt.x, z: keeperAt.z, mesh: keeper, name: '아이 손오공', warp: true, lines: (c) => [
      `오스! ${c.name}, 여기가 동굴탑이야. 벽을 따라 도는 돌계단을 걸어서 올라가면 돼. 한 바퀴 돌면 한 층! 94층까지 있어.`,
      '층마다 동쪽에 넓은 층계참이 있고 거기 포켓몬이 살아. 올라갈수록 세져. 1층은 Lv.6쯤, 50층은 Lv.28, 꼭대기는 Lv.48이 넘어!',
      '10층마다 층계참에 문지기 보스가 있어. 문지기를 이기면 기록석이 켜져서, 다음부터는 여기 서쪽 워프 패드로 그 층에 바로 올라갈 수 있어.',
      '계단 안쪽은 까마득한 굴이야. 난간이 있으니 떨어지진 않지만 조심해! 지치면 돌아 내려와서 쉬고 와. 물약도 챙기고!',
      '94층 꼭대기에는 탑의 수호신이 살아. 체력 260에 공격 36! 친구로 만들면 하늘의 문이 열리고 특별한 보상이 있대.',
      `지금까지 ${c.towerBest || 1}층까지 가 봤구나. ${(c.towerBest || 1) >= 94 ? '꼭대기까지 다녀온 챔피언이네!' : '오늘은 몇 층까지 가 볼래?'}`,
    ] }],
  };
}
