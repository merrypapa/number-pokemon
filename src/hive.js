import * as THREE from 'three';
import { makeNpc } from './npc.js';
import { rand } from './util.js';
import { buildGround, makePortal, makeInstanced } from './world.js';

// 꿀벌집 (120x120). 푸른숲 서남쪽 큰 나무에 매달린 벌집 입구로 들어온다. 벌·풀 포켓몬이 산다.
// 벌집 안: 육각형 벌집 무늬 바닥, 둘레를 두른 벌집 칸 벽(육각 기둥과 열린 육각 칸), 밀랍 기둥, 빛나는 꿀 웅덩이(끈적해서 못 들어간다),
// 천장에서 떨어지는 꿀 방울, 날아다니는 꿀벌 떼, 북쪽 여왕의 자리(육각 단)에 보스. 남쪽 포탈로 푸른숲에 돌아간다.
export const HIVE = {
  size: 120,
  spawn: { x: 0, z: 44 },
  portal: { x: 0, z: 50 },
  throne: { x: 0, z: -40, r: 7 },
  pools: [{ x: -26, z: 14, r: 5 }, { x: 24, z: -6, r: 6 }, { x: -28, z: -28, r: 5 }, { x: 30, z: 28, r: 4.5 }, { x: 0, z: 8, r: 4 }, { x: 36, z: -34, r: 4 }, { x: -38, z: 40, r: 4 }],
  bumps: [{ x: -20, z: -12, r: 12, h: 1.4 }, { x: 22, z: 16, r: 12, h: 1.2 }, { x: -36, z: 22, r: 10, h: 1.0 }, { x: 34, z: -20, r: 9, h: 1.1 }, { x: 10, z: -30, r: 10, h: 0.9 }],
  wallR: 54, // 이 바깥은 벌집 벽
};
const HEX = 2.6; // 바닥 육각 무늬 한 칸의 크기

function hiveHeight(x, z) {
  let y = 0;
  for (const b of HIVE.bumps) { const dx = x - b.x, dz = z - b.z; y += b.h * Math.exp(-(dx * dx + dz * dz) / (b.r * b.r)); }
  for (const p of HIVE.pools) { const d = Math.hypot(x - p.x, z - p.z); if (d < p.r + 1.5) y -= 0.5 * Math.min(1, (p.r + 1.5 - d) / 2); }
  const t = HIVE.throne, td = Math.hypot(x - t.x, z - t.z);
  if (td < t.r + 3) y += 1.2 * Math.min(1, (t.r + 3 - td) / 3);
  return y;
}
function hiveBlocked(x, z) {
  if (Math.hypot(x, z) > HIVE.wallR - 1) return true; // 벌집 벽
  return HIVE.pools.some((p) => Math.hypot(x - p.x, z - p.z) < p.r + 0.3);
}
export const HIVE_TERRAIN = { height: hiveHeight, inHole: () => false, blocked: hiveBlocked, size: HIVE.size, obstacles: [] };

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
  scene.fog = new THREE.Fog(0x8a5a10, 34, 110);
  scene.add(new THREE.HemisphereLight(0xffe0a0, 0x7a4a10, 1.25));
  const sun = new THREE.DirectionalLight(0xfff0c0, 0.9);
  sun.position.set(20, 30, 10);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -35, right: 35, top: 35, bottom: -35, near: 1, far: 120 });
  scene.add(sun, sun.target);

  // 바닥: 육각 벌집 무늬 (칸마다 노랑·주황·호박색, 칸 가장자리는 진한 갈색), 꿀 웅덩이는 반짝이는 꿀색, 여왕 단은 밝은 금빛
  const fills = [new THREE.Color(0xf4b400), new THREE.Color(0xffc93a), new THREE.Color(0xe89a1a), new THREE.Color(0xffd86a)];
  const border = new THREE.Color(0x8a5a10), honey = new THREE.Color(0xff9a1f), gold = new THREE.Color(0xffe08a), wall = new THREE.Color(0x5a3a08);
  buildGround(scene, S, 200, hiveHeight, (x, z) => {
    if (Math.hypot(x, z) > HIVE.wallR - 1) return wall;
    for (const p of HIVE.pools) if (Math.hypot(x - p.x, z - p.z) < p.r) return honey;
    if (Math.hypot(x - HIVE.throne.x, z - HIVE.throne.z) < HIVE.throne.r) return gold;
    const h = hexCell(x, z);
    if (h.edge > HEX * 0.78) return border;
    return fills[((h.q % 4) + 4 + ((h.r % 2) + 2) * 2) % 4];
  });

  // 천장: 커다란 어두운 육각 판 + 매달린 벌집 덩어리들
  const ceilY = 14;
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
  const n = 64;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    for (const [rr, hh] of [[HIVE.wallR + 1.5, rand(6, 11)], [HIVE.wallR + 5.5, rand(9, 14)]]) {
      const x = Math.cos(a + (rr > HIVE.wallR + 3 ? Math.PI / n : 0)) * rr, z = Math.sin(a + (rr > HIVE.wallR + 3 ? Math.PI / n : 0)) * rr;
      wallItems.push({ x, y: hh / 2 - 0.5, z, sx: 2.9, sy: hh, sz: 2.9, ry: a });
    }
    // 열린 벌집 칸: 벽 안쪽 면에 두 줄, 축이 가운데를 향한다
    for (const row of [0, 1]) {
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
  const clear = (x, z) => Math.hypot(x - HIVE.spawn.x, z - HIVE.spawn.z) < 9 || Math.hypot(x - HIVE.throne.x, z - HIVE.throne.z) < HIVE.throne.r + 4 || HIVE.pools.some((p) => Math.hypot(x - p.x, z - p.z) < p.r + 2.5);
  for (let i = 0; i < 34; i++) {
    const a = rand(0, Math.PI * 2), r = rand(6, HIVE.wallR - 6);
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (clear(x, z)) continue;
    const h = rand(2, 6), w = rand(0.8, 1.6);
    pillarItems.push({ x, y: hiveHeight(x, z) + h / 2 - 0.2, z, sx: w, sy: h, sz: w, ry: rand(0, 1) });
    block(x, z, w * 0.95);
  }
  decor.add(makeInstanced(new THREE.CylinderGeometry(1, 1.15, 1, 6), new THREE.MeshStandardMaterial({ color: 0xf0c060, roughness: 0.6 }), pillarItems, { shadow: true }));
  const potMat = new THREE.MeshStandardMaterial({ color: 0xffb020, roughness: 0.4 }), rimMat = new THREE.MeshStandardMaterial({ color: 0xffe08a });
  for (const [x, z] of [[-5, 40], [-7, 42], [8, 38], [-14, -8], [16, 30], [-30, 0], [26, -22]]) {
    const y = hiveHeight(x, z);
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.35, 0.7, 12), potMat); pot.position.set(x, y + 0.35, z); pot.castShadow = true;
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.08, 8, 16), rimMat); rim.rotation.x = Math.PI / 2; rim.position.set(x, y + 0.72, z);
    const drip = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), honeyMat); drip.position.set(x + 0.3, y + 0.55, z);
    decor.add(pot, rim, drip); block(x, z, 0.5);
  }

  // 여왕의 자리: 북쪽 육각 단 + 금빛 육각 기둥 여섯 + 꿀 방울 불빛
  const th = HIVE.throne, ty = hiveHeight(th.x, th.z);
  const dais = new THREE.Mesh(new THREE.CylinderGeometry(th.r, th.r + 1, 0.6, 6), new THREE.MeshStandardMaterial({ color: 0xffd23f, emissive: 0xff9a1f, emissiveIntensity: 0.25 }));
  dais.position.set(th.x, ty + 0.2, th.z); dais.userData.noHide = true;
  decor.add(dais);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
    const px = th.x + Math.cos(a) * (th.r + 0.8), pz = th.z + Math.sin(a) * (th.r + 0.8);
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.6, 4, 6), new THREE.MeshStandardMaterial({ color: 0xffe08a, emissive: 0xffb300, emissiveIntensity: 0.35 }));
    p.position.set(px, ty + 2, pz); p.castShadow = true;
    decor.add(p); block(px, pz, 0.7);
  }
  const throneLight = new THREE.PointLight(0xffd080, 5, 24);
  throneLight.position.set(th.x, ty + 5, th.z);
  scene.add(throneLight);

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
  for (let i = 0; i < 30; i++) {
    const b = makeBee(rand(0.7, 1.1));
    b.userData.path = { cx: rand(-40, 40), cz: rand(-40, 40), rx: rand(4, 12), rz: rand(4, 12), h: rand(1.5, 6), speed: rand(0.5, 1.1) * (Math.random() < 0.5 ? 1 : -1), phase: rand(0, 6), bob: rand(0.2, 0.6) };
    scene.add(b);
    bees.push(b);
  }
  // 여왕 자리 둘레를 도는 호위 꿀벌
  for (let i = 0; i < 6; i++) {
    const b = makeBee(1.2);
    b.userData.path = { cx: th.x, cz: th.z, rx: th.r + 3, rz: th.r + 3, h: 3.5, speed: 0.8, phase: (i / 6) * Math.PI * 2, bob: 0.3 };
    scene.add(b);
    bees.push(b);
  }

  // 포탈 (푸른숲으로) + 벌집을 돌보는 숲의 요정 도토로
  const P = HIVE.portal;
  const portal = makePortal(scene, P.x, hiveHeight(P.x, P.z), P.z, { color: 0x9be36d, label: '푸른숲으로 가는 포탈', labelBg: '#5a3a08', labelFg: '#ffe08a' });
  const keeperAt = { x: 6, z: 40 };
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
      `여기 포켓몬은 벌레·풀 속성이야. 뿔충이를 키우면 딱충이, 그다음 독침붕이 돼. 공격 ${c.zone.atkRange}쯤 되면 편하게 이겨. 불 포켓몬이 벌레와 풀에 세!`,
      c.conquered.hive ? '대장 독침붕을 이겼구나! 이제 벌집도 네 친구들 거야. 어딘가에 메가독침붕이 나타났을지도 몰라!' : `북쪽 금빛 단에 대장 독침붕이 있어. 체력 ${c.zone.bossHp || 60}! 공격 ${c.zone.targetAtk + 3} 이상이면 도전해 봐. 불 포켓몬이 벌레에 세!`,
      '여기서 숫자블록 친구를 구출할 때는 숫자 문제 대신 꿀벌·꿀·벌집 퀴즈가 나와. 벌집 방은 왜 육각형인지, 꿀은 어떻게 만드는지 잘 들어 두렴!',
      '남쪽 초록 포탈로 나가면 푸른숲 큰 나무 아래야.',
    ] }],
    wildSpots: [[-18, 30], [18, 34], [-34, 4], [34, 8], [-14, -16], [14, -18], [-40, -14], [40, -16], [-24, -42], [24, -44], [0, -14], [-44, 26], [44, 40], [8, 22]],
    bossSpot: { x: th.x, z: th.z },
    pickupSpots: [[-10, 24], [12, 18], [-30, -8], [30, -30], [0, -26], [-20, 44], [22, 44], [-46, 10], [46, 20], [0, 30], [-8, -36], [36, -8]],
  };
}
