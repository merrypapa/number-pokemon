import * as THREE from 'three';
import { makeNpc } from './npc.js';
import { rand } from './util.js';
import { makeInstanced, makePillSprite, makeLabelTexture } from './world.js';

// 동굴탑 (지하동굴 서쪽 벽 안의 거대한 탑, 94층). 한 층은 둥근 돌방 하나. 북쪽 돌계단(걸어서 오르는 완만한 비탈)을 올라
// "▲ 다음 층" 문으로 들어서면 다음 층, 남쪽 "▼" 문으로 나가면 아래층(1층이면 지하동굴)이다. 층마다 야생 포켓몬 네댓 마리가
// 살고 위로 갈수록 세진다(1층 Lv.6 → 94층 Lv.48). 10층마다 문지기 보스, 94층 꼭대기에는 탑의 수호신. 수호신을 친구로 만들면
// 하늘의 문이 열린다(지하동굴로 내려가는 포탈) + 특별 보상.
// 층은 지역 하나(zone 'tower')를 층 번호(TOWER.floor)에 맞춰 다시 짓는다 (main 의 goTowerFloor). 1층에는 10층마다 남긴
// 기록석 자리로 바로 올라가는 워프 패드가 있다 (가 본 가장 높은 10층 단위까지).
export const TOWER = { floor: 1, best: 1, species: [], conquered: () => false };
export const TOWER_TOP = 94;
export const ROOM_R = 20;         // 방 반지름
const RAMP = { x: 2.6, z0: -8, z1: -20, h: 3 }; // 북쪽 비탈: z0 에서 z1 까지 오르며 h 만큼 높아진다
export const TOWER_GATES = { up: { x: 0, z: -23 }, down: { x: 0, z: 23 } };

/** 층 → 야생 레벨대 */
export function towerLevelBand(floor) { const mid = Math.round(5 + floor * 0.46); return [Math.max(2, mid - 1), Math.min(49, mid + 2)]; }
/** 층 → 나오는 종의 최대 등급 */
function gradeCap(floor) { return floor <= 15 ? 1 : floor <= 30 ? 2 : floor <= 50 ? 3 : floor <= 70 ? 4 : 5; }
function seeded(n) { let s = (n * 2654435761 + 12345) >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
/** 이 층에 사는 종 넷 (층마다 정해져 있어서 다시 와도 같다) */
export function towerWild(floor) {
  const cap = gradeCap(floor);
  const pool = TOWER.species.filter((c) => c.catchable && !c.boss && !c.mega && !c.unlockedBy && !c.special && !c.sleeping && !c.swim && !c.deepSea && c.model && (c.grade || 1) <= cap && (c.grade || 1) >= Math.max(1, cap - 1));
  const rnd = seeded(floor);
  const out = [];
  const list = [...pool];
  while (out.length < 4 && list.length) out.push(list.splice(Math.floor(rnd() * list.length), 1)[0].id);
  return out;
}
/** 10층마다 문지기 보스: 그 층 등급의 종 하나가 크고 세게 */
export function towerFloorBoss(floor) {
  if (floor % 10 !== 0 || floor >= TOWER_TOP) return null;
  const cap = gradeCap(floor);
  const pool = TOWER.species.filter((c) => c.catchable && !c.mega && !c.unlockedBy && !c.special && !c.sleeping && !c.swim && !c.deepSea && c.model && (c.grade || 1) === cap);
  const rnd = seeded(floor * 7 + 3);
  const sp = pool[Math.floor(rnd() * pool.length)];
  if (!sp) return null;
  return { id: sp.id, hp: 40 + floor * 2, atk: 5 + Math.round(floor * 0.3), scale: Math.min(2.6, (sp.scale || 1) * 1.7), level: towerLevelBand(floor)[1] + 3 };
}

function towerHeight(x, z) {
  if (Math.abs(x) <= RAMP.x + 0.2) {
    if (z <= RAMP.z1) return RAMP.h;
    if (z <= RAMP.z0) return RAMP.h * ((RAMP.z0 - z) / (RAMP.z0 - RAMP.z1));
  }
  return 0;
}
function towerBlocked(x, z) {
  const r = Math.hypot(x, z);
  if (Math.abs(x) <= RAMP.x) { // 북쪽 비탈·문 복도 / 남쪽 문 복도
    if (z < -ROOM_R - 6 || z > ROOM_R + 6) return true;
    return false;
  }
  if (z < RAMP.z1 && Math.abs(x) < 7) return true; // 비탈 꼭대기 양옆 벽
  return r > ROOM_R;
}
export const TOWER_TERRAIN = { height: towerHeight, inHole: () => false, blocked: towerBlocked, size: 60, obstacles: [], ledge: 0.6 }; // ledge: 비탈 옆으로는 못 올라간다

export function buildTower(scene) {
  const floor = TOWER.floor, top = floor >= TOWER_TOP, bossFloor = floor % 10 === 0 && !top;
  const decor = new THREE.Group();
  scene.add(decor);
  const obstacles = TOWER_TERRAIN.obstacles;
  obstacles.length = 0;
  const block = (x, z, r) => obstacles.push({ x, z, r });
  // 층이 높아질수록 돌 색이 바뀐다 (회색 → 푸른 돌 → 보랏빛 → 금빛)
  const tier = Math.min(4, Math.floor((floor - 1) / 24));
  const palette = [
    { wall: 0x4b5261, floorA: 0x5a6273, floorB: 0x4f5668, torch: 0xffa322, fog: 0x12141c },
    { wall: 0x3a4a6a, floorA: 0x4a5a7c, floorB: 0x41506e, torch: 0x66d0ff, fog: 0x0e1424 },
    { wall: 0x4a3a6a, floorA: 0x5a4a80, floorB: 0x4e4070, torch: 0xd08bff, fog: 0x160f24 },
    { wall: 0x6a5a30, floorA: 0x8a7a40, floorB: 0x7a6a34, torch: 0xffd23f, fog: 0x1c1708 },
    { wall: 0x6a5a30, floorA: 0x9a8a50, floorB: 0x8a7a44, torch: 0xfff1b5, fog: 0x1c1708 },
  ][top ? 4 : tier];
  scene.background = new THREE.Color(palette.fog);
  scene.fog = new THREE.Fog(palette.fog, 22, 60);
  scene.add(new THREE.HemisphereLight(0x8899bb, 0x111118, top ? 1.1 : 0.7));
  const sun = new THREE.DirectionalLight(0xffffff, top ? 0.6 : 0.3);
  sun.position.set(8, 20, 6);
  scene.add(sun, sun.target);

  // 바닥: 둥근 돌 타일 + 북쪽 비탈
  const floorMesh = new THREE.Mesh(new THREE.CircleGeometry(ROOM_R + 1, 48), new THREE.MeshStandardMaterial({ color: palette.floorA, roughness: 0.9 }));
  floorMesh.rotation.x = -Math.PI / 2; floorMesh.receiveShadow = true; floorMesh.userData.noHide = true;
  decor.add(floorMesh);
  for (let i = 0; i < 40; i++) { // 타일 무늬 (얇은 네모들)
    const a = rand(0, Math.PI * 2), r = rand(3, ROOM_R - 2);
    const t = new THREE.Mesh(new THREE.BoxGeometry(rand(1.5, 3), 0.04, rand(1.5, 3)), new THREE.MeshStandardMaterial({ color: palette.floorB }));
    t.position.set(Math.cos(a) * r, 0.02, Math.sin(a) * r); t.rotation.y = rand(0, 3); t.userData.noHide = true;
    decor.add(t);
  }
  const stone = new THREE.MeshStandardMaterial({ color: palette.wall, roughness: 1 });
  { // 비탈 (돌계단 느낌의 얇은 단 여러 개 + 양옆 난간) · 꼭대기 단
    const len = RAMP.z0 - RAMP.z1;
    const ramp = new THREE.Mesh(new THREE.BoxGeometry(RAMP.x * 2, 0.3, Math.hypot(len, RAMP.h)), new THREE.MeshStandardMaterial({ color: palette.floorB, roughness: 0.9 }));
    ramp.position.set(0, RAMP.h / 2 - 0.15, (RAMP.z0 + RAMP.z1) / 2); ramp.rotation.x = Math.atan2(RAMP.h, len);
    ramp.userData.noHide = true;
    decor.add(ramp);
    for (let i = 0; i < 12; i++) { const z = RAMP.z0 - (i + 0.5) * (len / 12); const step = new THREE.Mesh(new THREE.BoxGeometry(RAMP.x * 2 + 0.1, 0.12, 0.5), stone); step.position.set(0, towerHeight(0, z) + 0.02, z); step.userData.noHide = true; decor.add(step); }
    for (const side of [-1, 1]) { const rail = new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.0, Math.hypot(len, RAMP.h)), stone); rail.position.set(side * (RAMP.x + 0.15), RAMP.h / 2 + 0.4, (RAMP.z0 + RAMP.z1) / 2); rail.rotation.x = ramp.rotation.x; decor.add(rail); }
    const landing = new THREE.Mesh(new THREE.BoxGeometry(RAMP.x * 2 + 0.2, RAMP.h, 8), new THREE.MeshStandardMaterial({ color: palette.floorB, roughness: 0.9 })); landing.position.set(0, RAMP.h / 2, RAMP.z1 - 4); landing.userData.noHide = true;
    decor.add(landing);
    // 비탈 아래 벽 (꼭대기 양옆)
    for (const side of [-1, 1]) { const w = new THREE.Mesh(new THREE.BoxGeometry(5, 7, 8), stone); w.position.set(side * (RAMP.x + 2.6), 3.5, RAMP.z1 - 4); decor.add(w); }
  }
  // 둘레 벽: 뾰족 바위 고리 (문 두 곳은 비운다)
  const wallItems = [];
  for (let i = 0; i < 44; i++) {
    const a = (i / 44) * Math.PI * 2, x = Math.cos(a) * (ROOM_R + 3.5), z = Math.sin(a) * (ROOM_R + 3.5);
    if (Math.abs(x) < 4.5) continue;
    wallItems.push({ x, y: 4, z, sx: rand(3, 4.5), sy: rand(9, 14), sz: rand(3, 4.5), ry: rand(0, 3) });
  }
  decor.add(makeInstanced(new THREE.ConeGeometry(1, 1, 6), stone, wallItems));
  // 천장 (어두운 원판) — 위층이 있다는 느낌
  const ceil = new THREE.Mesh(new THREE.CircleGeometry(ROOM_R + 6, 48), new THREE.MeshBasicMaterial({ color: palette.fog, side: THREE.DoubleSide }));
  ceil.rotation.x = Math.PI / 2; ceil.position.y = 11; ceil.userData.noHide = true;
  decor.add(ceil);
  // 횃불 여덟
  const torches = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8, x = Math.cos(a) * (ROOM_R - 1.2), z = Math.sin(a) * (ROOM_R - 1.2);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 2.4, 6), new THREE.MeshStandardMaterial({ color: 0x3a2a1a })); post.position.set(x, 1.2, z);
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.7, 8), new THREE.MeshStandardMaterial({ color: palette.torch, emissive: palette.torch, emissiveIntensity: 1.2 })); flame.position.set(x, 2.7, z);
    decor.add(post, flame); torches.push(flame);
    if (i % 2 === 0) { const l = new THREE.PointLight(palette.torch, 1.6, 16); l.position.set(x, 2.6, z); decor.add(l); torches.push(l); }
  }
  // 층 표시: 가운데 위 큰 이름표 + 문 위 작은 표지
  const title = makePillSprite(`🗼 동굴탑 ${floor}층${top ? ' · 꼭대기' : bossFloor ? ' · 문지기' : ''}`, { bg: '#20232e', fg: '#ffd93d', border: '#ffd93d' }, 1.8);
  title.position.set(0, 7, 0); decor.add(title);
  const doorMat = new THREE.MeshStandardMaterial({ color: 0x20232e });
  const door = (z, label, color) => {
    for (const side of [-1, 1]) { const post = new THREE.Mesh(new THREE.BoxGeometry(0.6, 4.2, 0.6), stone); post.position.set(side * (RAMP.x + 0.4), towerHeight(0, z) + 2.1, z); decor.add(post); }
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(RAMP.x * 2 + 2, 0.7, 0.8), stone); lintel.position.set(0, towerHeight(0, z) + 4.4, z); decor.add(lintel);
    const dark = new THREE.Mesh(new THREE.BoxGeometry(RAMP.x * 2, 4, 3), doorMat); dark.position.set(0, towerHeight(0, z) + 2, z + (z < 0 ? -1.8 : 1.8)); decor.add(dark);
    const sign = new THREE.Sprite(new THREE.SpriteMaterial({ map: makeLabelTexture(label, '#20232e', color, 48), transparent: true, depthTest: false }));
    sign.scale.set(3.4, 0.85, 1); sign.position.set(0, towerHeight(0, z) + 5.4, z); decor.add(sign);
  };
  if (!top) door(RAMP.z1 - 2, `▲ ${floor + 1}층으로`, '#ffd93d');
  door(ROOM_R + 2, floor === 1 ? '▼ 지하동굴로 나가기' : `▼ ${floor - 1}층으로`, '#9fe8ff');

  // 장식: 수정·돌기둥 몇 개 (문·비탈·가운데는 비운다)
  const crystalMat = new THREE.MeshStandardMaterial({ color: palette.torch, emissive: palette.torch, emissiveIntensity: 0.6 });
  const pillarItems = [], crystalItems = [];
  for (let i = 0; i < 10; i++) {
    const a = rand(0, Math.PI * 2), r = rand(9, ROOM_R - 3), x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (Math.abs(x) < 4 || Math.hypot(x, z) < 8) continue;
    if (i % 2) { const h = rand(2, 4.5); pillarItems.push({ x, y: h / 2 - 0.2, z, sx: rand(0.7, 1.3), sy: h, sz: rand(0.7, 1.3), ry: rand(0, 3) }); block(x, z, 1.0); }
    else { for (let k = 0; k < 3; k++) { const h = rand(0.8, 2); crystalItems.push({ x: x + rand(-0.6, 0.6), y: h / 2 - 0.1, z: z + rand(-0.6, 0.6), sx: rand(0.2, 0.4), sy: h, sz: rand(0.2, 0.4), ry: rand(0, 3) }); } block(x, z, 0.8); }
  }
  decor.add(makeInstanced(new THREE.ConeGeometry(1, 1, 6), stone, pillarItems, { shadow: true }));
  decor.add(makeInstanced(new THREE.ConeGeometry(1, 1, 5), crystalMat, crystalItems));

  // 문지기 층·꼭대기: 가운데 금빛 무대
  let stage = null;
  if (bossFloor || top) {
    stage = new THREE.Mesh(new THREE.CylinderGeometry(6, 6.5, 0.4, 32), new THREE.MeshStandardMaterial({ color: top ? 0xffd93d : 0xb8860b, emissive: top ? 0xffb300 : 0x6a4a00, emissiveIntensity: 0.4 }));
    stage.position.set(0, 0.2, -2); stage.userData.noHide = true;
    decor.add(stage);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(6.3, 0.12, 8, 48), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffd93d, emissiveIntensity: 1 }));
    ring.rotation.x = Math.PI / 2; ring.position.set(0, 0.5, -2); decor.add(ring);
  }
  // 꼭대기: 하늘의 문 (수호신을 친구로 만들면 열린다 → 지하동굴로). 하늘 구멍으로 별빛이 내려온다
  let skyDoor = null, skyBeam = null;
  if (top) {
    scene.background = new THREE.Color(0x0b1026);
    scene.fog = new THREE.Fog(0x0b1026, 26, 70);
    const stars = []; for (let i = 0; i < 120; i++) { const a = rand(0, Math.PI * 2), r = rand(0, 40); stars.push({ x: Math.cos(a) * r, y: rand(12, 30), z: Math.sin(a) * r }); }
    decor.add(makeInstanced(new THREE.SphereGeometry(0.06, 5, 4), new THREE.MeshBasicMaterial({ color: 0xffffff }), stars)); // 별은 인스턴스 하나로
    ceil.visible = false;
    skyBeam = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 4, 30, 24, 1, true), new THREE.MeshBasicMaterial({ color: 0x9fe8ff, transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false }));
    skyBeam.position.set(0, 15, -14); decor.add(skyBeam);
    const gate = new THREE.Group();
    const arch = new THREE.Mesh(new THREE.TorusGeometry(2.6, 0.3, 10, 40, Math.PI), new THREE.MeshStandardMaterial({ color: 0xffd93d, emissive: 0xffb300, emissiveIntensity: 0.8 }));
    arch.position.y = 0.3; gate.add(arch);
    const disc = new THREE.Mesh(new THREE.CircleGeometry(2.3, 32, 0, Math.PI), new THREE.MeshBasicMaterial({ color: 0x9fe8ff, transparent: true, opacity: 0.5, side: THREE.DoubleSide }));
    disc.position.y = 0.3; gate.add(disc);
    const light = new THREE.PointLight(0x9fe8ff, 4, 18); light.position.y = 2; gate.add(light);
    const sign = makePillSprite('🌌 하늘의 문 · 지하동굴로', { bg: '#1f2a3a', fg: '#9fe8ff', border: '#9fe8ff' }, 1.4);
    sign.position.y = 4.6; gate.add(sign);
    gate.position.set(0, RAMP.h, RAMP.z1 - 3);
    gate.visible = TOWER.conquered();
    decor.add(gate);
    skyDoor = { group: gate, disc, at: { x: 0, z: RAMP.z1 - 3 } };
  }

  // 1층: 탑지기 아이 손오공 + 기록석 워프 패드 (가 본 10층 단위까지)
  const npcs = [], checkpoints = [];
  if (floor === 1) {
    const keeperAt = { x: 6, z: 12 };
    const keeper = makeNpc({ outfit: 'ranger', name: '아이 손오공', model: '아이손오공.glb' });
    keeper.position.set(keeperAt.x, 0, keeperAt.z); keeper.rotation.y = -0.6;
    decor.add(keeper); block(keeperAt.x, keeperAt.z, 0.6);
    npcs.push({ x: keeperAt.x, z: keeperAt.z, mesh: keeper, name: '아이 손오공', warp: true, lines: (c) => [
      `오스! ${c.name}, 여기가 동굴탑이야. 94층까지 있는 수련의 탑이지! 북쪽 돌계단을 걸어 올라가면 다음 층이야.`,
      '층마다 포켓몬이 살고, 올라갈수록 세져. 1층은 Lv.6쯤, 50층은 Lv.28, 꼭대기는 Lv.48이 넘어! 레벨을 올리기엔 최고야.',
      '10층마다 문지기 보스가 있어. 문지기를 이기면 기록석이 켜져서, 다음부터는 1층의 워프 패드로 그 층에 바로 갈 수 있어.',
      '94층 꼭대기에는 탑의 수호신이 살아. 체력 260에 공격 36! 수호신을 친구로 만들면 하늘의 문이 열리고 특별한 보상이 있대.',
      `지금까지 ${c.towerBest || 1}층까지 가 봤구나. ${(c.towerBest || 1) >= 94 ? '꼭대기까지 다녀온 챔피언이네!' : '힘들면 남쪽 문으로 나가서 쉬고 와. 물약도 챙기고!'}`,
    ] });
    for (let n = 10; n < TOWER_TOP; n += 10) {
      if (n > TOWER.best) break;
      const at = { x: -14, z: 12 - (n / 10 - 1) * 2.8 };
      const pad = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.1, 0.2, 20), new THREE.MeshStandardMaterial({ color: 0x66e0ff, emissive: 0x2288aa, emissiveIntensity: 0.8 }));
      pad.position.set(at.x, 0.1, at.z); pad.userData.noHide = true;
      const lbl = makePillSprite(`${n}층으로`, { bg: '#0f5f7a', fg: '#ffffff', border: '#66e0ff' }, 0.8);
      lbl.position.set(at.x, 1.8, at.z);
      decor.add(pad, lbl);
      checkpoints.push({ n, x: at.x, z: at.z });
    }
    if (TOWER.best >= TOWER_TOP) { const at = { x: -14, z: 12 - 9 * 2.8 }; const pad = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.1, 0.2, 20), new THREE.MeshStandardMaterial({ color: 0xffd93d, emissive: 0xaa7700, emissiveIntensity: 0.8 })); pad.position.set(at.x, 0.1, at.z); pad.userData.noHide = true; const lbl = makePillSprite('94층 꼭대기로', { bg: '#6a4a00', fg: '#ffffff', border: '#ffd93d' }, 0.8); lbl.position.set(at.x, 1.8, at.z); decor.add(pad, lbl); checkpoints.push({ n: TOWER_TOP, x: at.x, z: at.z }); }
  }

  const band = towerLevelBand(floor);
  const fb = towerFloorBoss(floor);
  function animate(t) {
    torches.forEach((o, i) => { if (o.isMesh) o.scale.y = 1 + Math.sin(t * 9 + i) * 0.2; else o.intensity = 1.4 + Math.sin(t * 7 + i) * 0.4; });
    title.position.y = 7 + Math.sin(t * 1.5) * 0.15;
    if (skyDoor) { skyDoor.disc.material.opacity = 0.35 + Math.sin(t * 3) * 0.15; skyDoor.group.rotation.y = Math.sin(t * 0.5) * 0.08; }
    if (skyBeam) skyBeam.material.opacity = 0.09 + Math.sin(t * 1.2) * 0.04;
    if (stage) stage.material.emissiveIntensity = 0.3 + Math.sin(t * 2) * 0.15;
  }
  // 야생 자리: 비탈·문·가운데 무대를 피해 둘레에
  const wildSpots = [[-12, 4], [12, 4], [-9, -9], [9, -9], [-14, -2], [14, -4], [-6, 13], [8, 13]];
  const pickupSpots = [[-5, 7], [5, -4], [-11, 10], [12, 11]];
  return {
    sun, animate, terrain: TOWER_TERRAIN, decor, spawn: { x: 0, z: 16 }, dark: true, noShrine: true, transient: true,
    label: `동굴탑 ${floor}층`, floor,
    wildIds: towerWild(floor), levelBand: band, wildCount: bossFloor || top ? 3 : 5,
    floorBoss: fb ? { ...fb, at: { x: 0, z: -2 } } : null,
    bossSpot: top ? { x: 0, z: -2 } : null,
    upGate: top ? null : TOWER_GATES.up, downGate: TOWER_GATES.down,
    checkpoints,
    skyDoor: skyDoor ? skyDoor.at : null,
    portal: skyDoor && TOWER.conquered() ? skyDoor.at : null, portalTo: 'cave',
    openSkyDoor: () => { if (skyDoor) skyDoor.group.visible = true; },
    npcs,
    wildSpots: wildSpots.slice(0, bossFloor || top ? 3 : 5), pickupSpots,
  };
}
