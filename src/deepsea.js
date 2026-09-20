import * as THREE from 'three';
import { makeNpc } from './npc.js';
import { buildShip } from './boat.js';
import { rand } from './util.js';
import { buildGround, makeInstanced, makePortal, makeSignAt } from './world.js';

// 심해 (200x200). 물의길 먼바다의 소용돌이로 뛰어들면 내려온다 (푸른숲 큰 구멍 → 지하동굴과 같은 방식).
// 해저 바닥을 걷다가 점프 버튼을 꾹 누르면 헤엄쳐 올라가고, 놓으면 천천히 가라앉는다 (아래 swim,
// gravity 0.22 — 꿈의우주보다 더 가볍다). 충분히 떠오르면 바위·다시마·가라앉은 배 위로 지나갈 수 있다.
// 고개를 들면 저 위로 수면이 일렁이고 빛줄기가 내려온다. 남쪽 해구에 보스 갸라도스,
// 서쪽에는 오래전에 가라앉은 배가 있다. 북쪽 상승 해류(포탈)를 타면 물의길 선착장으로 돌아간다.
export const DEEP = {
  size: 200,
  spawn: { x: 0, z: 72 },          // 소용돌이에서 떨어져 내려오는 자리
  portal: { x: 0, z: 84 },         // 상승 해류 → 물의길
  surfaceY: 30,                    // 저 위에 보이는 수면
  gravity: 0.22,                   // 물속이라 아주 가볍다
  trench: { x: 0, z: -60, r: 30, d: 2.4 }, // 보스가 사는 해구 (가운데로 갈수록 깊다)
  wreck: { x: -46, z: 20 },        // 가라앉은 배
  mounds: [
    { x: -34, z: 44, r: 14, h: 2.2 }, { x: 36, z: 40, r: 15, h: 2.6 },
    { x: 54, z: -4, r: 16, h: 2.4 }, { x: -58, z: -8, r: 15, h: 2.3 },
    { x: 12, z: 6, r: 18, h: 1.8 }, { x: -18, z: -34, r: 14, h: 2.0 },
    { x: 44, z: -44, r: 15, h: 2.2 }, { x: -70, z: 46, r: 13, h: 2.0 },
    { x: 74, z: 54, r: 13, h: 2.1 }, { x: -76, z: -52, r: 14, h: 2.2 },
    { x: 78, z: -62, r: 13, h: 2.0 },
  ],
};

// 야생 포켓몬과 블록 자리는 먼저 정해 두고, 장식(바위·다시마)은 그 자리를 피해서 놓는다
const WILD_SPOTS = [
  [-10, 56], [16, 52], [-30, 30], [28, 24], [-50, 14], [48, 12], [-6, -6], [18, -18],
  [-36, -14], [40, -30], [-62, 24], [64, 32], [-22, -46], [30, -48], [-66, -30], [68, -20],
];
const PICKUP_SPOTS = [[-6, 62], [22, 38], [-40, 4], [42, -12], [-16, -26], [26, -58], [-58, 40], [58, 48]];

function deepHeight(x, z) {
  let y = 0;
  for (const m of DEEP.mounds) {
    const dx = x - m.x, dz = z - m.z;
    y += m.h * Math.exp(-(dx * dx + dz * dz) / (m.r * m.r));
  }
  const T = DEEP.trench, td = Math.hypot(x - T.x, z - T.z);
  if (td < T.r) y -= T.d * (1 - td / T.r); // 해구 (가장 깊은 곳도 -2.4: 구멍으로 떨어지지 않는다)
  return y;
}
export const DEEP_TERRAIN = { height: deepHeight, inHole: () => false, blocked: () => false, size: DEEP.size, obstacles: [] };

export function buildDeepSea(scene) {
  const S = DEEP.size;
  const decor = new THREE.Group();
  scene.add(decor);
  const obstacles = DEEP_TERRAIN.obstacles;
  obstacles.length = 0;
  const block = (x, z, r) => obstacles.push({ x, z, r });
  // 포켓몬·블록 자리와 오가는 길목에는 장식을 놓지 않는다
  const busy = (x, z, r = 5) =>
    Math.hypot(x - DEEP.spawn.x, z - DEEP.spawn.z) < 10 ||
    Math.hypot(x - DEEP.portal.x, z - DEEP.portal.z) < 8 ||
    Math.hypot(x - DEEP.trench.x, z - DEEP.trench.z) < 12 ||
    WILD_SPOTS.some(([wx, wz]) => Math.hypot(x - wx, z - wz) < r) ||
    PICKUP_SPOTS.some(([px, pz]) => Math.hypot(x - px, z - pz) < r);

  scene.background = new THREE.Color(0x02243c);
  scene.fog = new THREE.Fog(0x04365a, 26, 130);
  scene.add(new THREE.HemisphereLight(0x6fd7ff, 0x02121f, 1.5)); // 위는 수면빛, 아래는 캄캄한 바닥
  const sun = new THREE.DirectionalLight(0xbfefff, 0.9);         // 수면에서 비껴 드는 빛
  sun.position.set(12, 40, 16);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -40, right: 40, top: 40, bottom: -40, near: 1, far: 140 });
  scene.add(sun, sun.target);

  // 해저 바닥: 깊은 곳은 짙은 남색 뻘, 언덕 위는 밝은 모래
  const deepMud = new THREE.Color(0x123a52), sand = new THREE.Color(0x4a7f92), sandLight = new THREE.Color(0x5e97a8);
  buildGround(scene, S, 200, deepHeight, (x, z, y) => {
    if (y < -1.2) return deepMud;
    if (y > 1.2) return Math.random() < 0.5 ? sand : sandLight;
    return Math.random() < 0.35 ? sand : deepMud.clone().lerp(sand, 0.45);
  });

  // ---------- 저 위의 수면과 내려오는 빛줄기 ----------
  // 수면과 빛줄기는 안개를 받지 않는다(fog: false). 멀리 있어도 또렷하게 "저 위가 물 밖"으로 보이도록.
  const surface = new THREE.Mesh(
    new THREE.PlaneGeometry(S + 60, S + 60, 1, 1),
    new THREE.MeshBasicMaterial({ color: 0x9fe8ff, transparent: true, opacity: 0.45, side: THREE.DoubleSide, fog: false }),
  );
  surface.rotation.x = -Math.PI / 2;
  surface.position.y = DEEP.surfaceY;
  scene.add(surface);
  const shafts = [];
  const shaftMat = new THREE.MeshBasicMaterial({ color: 0xcdf3ff, transparent: true, opacity: 0.07, depthWrite: false, side: THREE.DoubleSide, fog: false });
  for (let i = 0; i < 16; i++) {
    const x = rand(-S / 2 + 12, S / 2 - 12), z = rand(-S / 2 + 12, S / 2 - 12);
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 6.5, DEEP.surfaceY, 10, 1, true), shaftMat.clone());
    shaft.position.set(x, DEEP.surfaceY / 2, z);
    shaft.rotation.z = rand(-0.12, 0.12);
    decor.add(shaft);
    shafts.push({ mesh: shaft, phase: rand(0, 6) });
  }

  // ---------- 다시마 숲: 물살에 좌우로 흔들린다 ----------
  const kelpMat = new THREE.MeshStandardMaterial({ color: 0x2f7d4a, roughness: 0.9, side: THREE.DoubleSide });
  const kelpItems = [];
  for (let i = 0; i < 260; i++) {
    const x = rand(-S / 2 + 6, S / 2 - 6), z = rand(-S / 2 + 6, S / 2 - 6);
    if (busy(x, z, 4)) continue;
    const h = rand(3, 8);
    kelpItems.push({ x, y: deepHeight(x, z), z, sx: 0.5, sy: h, sz: 0.5, ry: rand(0, 3), phase: rand(0, 6), lean: rand(0.1, 0.26) });
    if (h > 6) block(x, z, 0.45); // 키 큰 다시마는 길을 막는다
  }
  const kelpGeo = new THREE.ConeGeometry(0.34, 1, 5, 1, true);
  kelpGeo.translate(0, 0.5, 0); // 밑동이 원점 (해저 바닥에 심는다)
  const kelp = makeInstanced(kelpGeo, kelpMat, kelpItems);
  decor.add(kelp);
  const kelpM = new THREE.Matrix4(), kelpQ = new THREE.Quaternion(), kelpE = new THREE.Euler(), kelpP = new THREE.Vector3(), kelpS = new THREE.Vector3();

  // ---------- 산호: 색색의 가지와 뇌산호 ----------
  const coralColors = [0xff6f91, 0xffb347, 0xb06bff, 0x4fd6c2, 0xff5c8a];
  const branchItems = [], brainItems = [];
  for (let i = 0; i < 150; i++) {
    const x = rand(-S / 2 + 6, S / 2 - 6), z = rand(-S / 2 + 6, S / 2 - 6);
    if (busy(x, z, 3.5)) continue;
    const y = deepHeight(x, z), col = coralColors[i % coralColors.length];
    if (i % 3 === 0) {
      brainItems.push({ x, y: y + 0.35, z, s: rand(0.5, 1.1), color: col });
    } else {
      for (let k = 0; k < 4; k++) {
        const h = rand(0.7, 1.8);
        branchItems.push({ x: x + rand(-0.6, 0.6), y: y + h * 0.5, z: z + rand(-0.6, 0.6), sx: 0.2, sy: h, sz: 0.2, rx: rand(-0.35, 0.35), rz: rand(-0.35, 0.35), color: col });
      }
    }
    block(x, z, 0.6);
  }
  decor.add(makeInstanced(new THREE.CylinderGeometry(0.5, 0.9, 1, 6), new THREE.MeshStandardMaterial({ roughness: 0.75 }), branchItems, { shadow: true }));
  decor.add(makeInstanced(new THREE.SphereGeometry(1, 12, 9), new THREE.MeshStandardMaterial({ roughness: 0.85 }), brainItems, { shadow: true }));

  // ---------- 바위와 바닥의 불가사리·조개 ----------
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x3b5666, roughness: 1 });
  const rockItems = [];
  for (let i = 0; i < 90; i++) {
    const x = rand(-S / 2 + 6, S / 2 - 6), z = rand(-S / 2 + 6, S / 2 - 6);
    if (busy(x, z, 4)) continue;
    const r = rand(0.6, 2.2);
    rockItems.push({ x, y: deepHeight(x, z) + r * 0.3, z, s: r, rx: rand(0, 3), ry: rand(0, 3) });
    block(x, z, r * 0.8);
  }
  decor.add(makeInstanced(new THREE.DodecahedronGeometry(1, 0), rockMat, rockItems, { shadow: true }));
  const starItems = [], shellItems = [];
  for (let i = 0; i < 160; i++) {
    const x = rand(-S / 2 + 5, S / 2 - 5), z = rand(-S / 2 + 5, S / 2 - 5);
    const y = deepHeight(x, z) + 0.05;
    (i % 2 ? starItems : shellItems).push({ x, y, z, ry: rand(0, 3), s: rand(0.7, 1.2), color: i % 2 ? 0xff8f6b : 0xffe6c0 });
  }
  const starGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.06, 5); // 납작한 오각형 = 불가사리
  decor.add(makeInstanced(starGeo, new THREE.MeshStandardMaterial({ roughness: 0.8 }), starItems));
  decor.add(makeInstanced(new THREE.SphereGeometry(0.22, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ roughness: 0.7 }), shellItems));

  // ---------- 거품 기둥: 바닥에서 수면까지 방울이 올라간다 ----------
  const bubbleMat = new THREE.MeshBasicMaterial({ color: 0xdff6ff, transparent: true, opacity: 0.55 });
  const bubbles = [];
  for (const [bx, bz] of [[-24, 48], [38, 18], [-52, -22], [22, -36], [62, 60], [-68, 10], [8, 30], [-12, -62]]) {
    const g = new THREE.Group();
    g.position.set(bx, deepHeight(bx, bz), bz);
    const balls = [];
    for (let i = 0; i < 10; i++) {
      const b = new THREE.Mesh(new THREE.SphereGeometry(rand(0.12, 0.3), 8, 6), bubbleMat);
      g.add(b);
      balls.push({ mesh: b, off: i / 10, ox: rand(-0.7, 0.7), oz: rand(-0.7, 0.7), speed: rand(0.12, 0.2) });
    }
    decor.add(g);
    bubbles.push({ balls, top: DEEP.surfaceY - deepHeight(bx, bz) });
  }

  // ---------- 빛나는 해파리: 둥실둥실 떠다니며 주변을 밝힌다 ----------
  const jellies = [];
  const jellyLights = [];
  for (let i = 0; i < 14; i++) {
    const x = rand(-S / 2 + 14, S / 2 - 14), z = rand(-S / 2 + 14, S / 2 - 14);
    const col = [0x8bd8ff, 0xffa8e0, 0xb9a3ff][i % 3];
    const g = new THREE.Group();
    const bell = new THREE.Mesh(new THREE.SphereGeometry(0.6, 14, 10, 0, Math.PI * 2, 0, Math.PI / 1.9), new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 1.1, transparent: true, opacity: 0.65 }));
    g.add(bell);
    for (let k = 0; k < 5; k++) {
      const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.01, 1.3, 4), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.5 }));
      tail.position.set(Math.cos((k / 5) * Math.PI * 2) * 0.3, -0.7, Math.sin((k / 5) * Math.PI * 2) * 0.3);
      g.add(tail);
    }
    g.position.set(x, deepHeight(x, z) + rand(3, 9), z);
    decor.add(g);
    jellies.push({ mesh: g, bell, base: g.position.y, phase: rand(0, 6), cx: x, cz: z, r: rand(3, 8) });
    if (jellyLights.length < 4) { const l = new THREE.PointLight(col, 2.2, 16); l.position.copy(g.position); scene.add(l); jellyLights.push({ light: l, of: jellies.length - 1 }); } // 점광원은 4개까지
  }

  // ---------- 가라앉은 배: 오래전 폭풍에 가라앉은 모험선 ----------
  {
    const W = DEEP.wreck;
    const wreck = buildShip().group;
    const wy = deepHeight(W.x, W.z);
    wreck.position.set(W.x, wy - 0.9, W.z);   // 뻘에 반쯤 묻혀 있다
    wreck.rotation.set(0, 0.9, 0.32);          // 옆으로 기울어져 있다
    wreck.traverse((o) => { if (o.isMesh && o.material) { o.material = o.material.clone(); o.material.color?.multiplyScalar(0.55); o.material.roughness = 1; } }); // 오래돼 색이 바랬다
    scene.add(wreck);
    obstacles.push({ ax: W.x - 5, az: W.z - 3, bx: W.x + 5, bz: W.z + 3, r: 2.6 });
    decor.add(makeSignAt('가라앉은 배', W.x + 7, deepHeight(W.x + 7, W.z + 7), W.z + 7, -0.8, { bg: '#0d3a52', fg: '#cdf3ff', board: 0x2a5a72, post: 0x1d3f52 }));
  }

  // ---------- 해구: 보스가 사는 깊은 골짜기 (둘레에 빛나는 바위) ----------
  {
    const T = DEEP.trench;
    const glowMat = new THREE.MeshStandardMaterial({ color: 0x2fd3ff, emissive: 0x1f9fd0, emissiveIntensity: 1.2, roughness: 0.4 });
    const ringItems = [];
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2, r = T.r - 2 + rand(-1.5, 1.5);
      const x = T.x + Math.cos(a) * r, z = T.z + Math.sin(a) * r;
      if (Math.abs(x) > S / 2 - 4 || Math.abs(z) > S / 2 - 4) continue;
      ringItems.push({ x, y: deepHeight(x, z) + 0.5, z, s: rand(0.7, 1.4), rx: rand(0, 3), ry: rand(0, 3) });
    }
    decor.add(makeInstanced(new THREE.OctahedronGeometry(1, 0), glowMat, ringItems));
    const trenchLight = new THREE.PointLight(0x2fd3ff, 2.6, 34);
    trenchLight.position.set(T.x, deepHeight(T.x, T.z) + 6, T.z);
    scene.add(trenchLight);
    jellyLights.push({ light: trenchLight, of: -1 }); // 같이 깜빡이게 (of<0 이면 제자리에서 밝기만)
    const signZ = T.z + T.r + 4;
    decor.add(makeSignAt('심해 해구 · 보스가 산다', T.x + 4, deepHeight(T.x + 4, signZ), signZ, Math.PI, { bg: '#0d3a52', fg: '#ffd93d', board: 0x2a5a72, post: 0x1d3f52 }));
  }

  // ---------- 상승 해류(포탈): 물의길 선착장으로 돌아간다 ----------
  const P = DEEP.portal;
  const portal = makePortal(scene, P.x, deepHeight(P.x, P.z), P.z, { color: 0x7fe3ff, label: '물의길로 올라가는 해류', labelBg: '#0d3a52', labelFg: '#cdf3ff' });
  const current = new THREE.Mesh( // 위로 솟는 물기둥
    new THREE.CylinderGeometry(2.2, 3.4, DEEP.surfaceY, 16, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xcdf3ff, transparent: true, opacity: 0.14, depthWrite: false, side: THREE.DoubleSide }),
  );
  current.position.set(P.x, deepHeight(P.x, P.z) + DEEP.surfaceY / 2, P.z);
  scene.add(current);

  // 떨어져 내려오는 자리 (소용돌이 아래)
  const drop = new THREE.Mesh(new THREE.CircleGeometry(2.4, 24), new THREE.MeshBasicMaterial({ color: 0xcdf3ff, transparent: true, opacity: 0.22 }));
  drop.rotation.x = -Math.PI / 2;
  drop.position.set(DEEP.spawn.x, deepHeight(DEEP.spawn.x, DEEP.spawn.z) + 0.03, DEEP.spawn.z);
  scene.add(drop);

  // ---------- 잠수부 도리 (지역 안내 NPC) ----------
  const diverAt = { x: DEEP.spawn.x + 4, z: DEEP.spawn.z - 3 };
  const diver = makeNpc({ outfit: 'astronaut', name: '도리' }); // 동그란 잠수 헬멧
  diver.position.set(diverAt.x, deepHeight(diverAt.x, diverAt.z), diverAt.z);
  diver.rotation.y = -0.6;
  decor.add(diver); block(diverAt.x, diverAt.z, 0.6);
  decor.add(makeSignAt('심해 · 점프 버튼을 꾹 누르면 헤엄', DEEP.spawn.x - 5, deepHeight(DEEP.spawn.x - 5, DEEP.spawn.z - 1), DEEP.spawn.z - 1, 0.4, { bg: '#0d3a52', fg: '#cdf3ff', board: 0x2a5a72, post: 0x1d3f52 }));

  function animate(t) {
    surface.position.y = DEEP.surfaceY + Math.sin(t * 0.8) * 0.5;      // 저 위에서 수면이 일렁인다
    surface.material.opacity = 0.42 + Math.sin(t * 1.1) * 0.08;
    for (const s of shafts) s.mesh.material.opacity = 0.05 + Math.sin(t * 0.9 + s.phase) * 0.035; // 빛줄기가 어른거린다
    // 다시마가 물살에 좌우로 흔들린다
    kelpItems.forEach((it, i) => {
      kelpE.set(Math.sin(t * 0.9 + it.phase) * it.lean, it.ry, Math.cos(t * 0.7 + it.phase) * it.lean);
      kelpQ.setFromEuler(kelpE);
      kelpP.set(it.x, it.y, it.z);
      kelpS.set(it.sx, it.sy, it.sz);
      kelp.setMatrixAt(i, kelpM.compose(kelpP, kelpQ, kelpS));
    });
    kelp.instanceMatrix.needsUpdate = true;
    for (const col of bubbles) { // 방울이 수면까지 올라갔다가 다시 바닥에서
      for (const b of col.balls) {
        const u = (t * b.speed + b.off) % 1;
        b.mesh.position.set(b.ox * (1 + u * 2), u * col.top, b.oz * (1 + u * 2));
        b.mesh.material.opacity = 0.55 * (1 - u * 0.6);
      }
    }
    jellies.forEach((j, i) => { // 해파리가 천천히 돌며 떠다니고 우산이 오므렸다 펴진다
      const a = t * 0.18 + j.phase;
      j.mesh.position.set(j.cx + Math.cos(a) * j.r, j.base + Math.sin(t * 0.7 + j.phase) * 1.2, j.cz + Math.sin(a) * j.r);
      const pulse = 1 + Math.sin(t * 2.2 + j.phase) * 0.16;
      j.bell.scale.set(pulse, 2 - pulse, pulse);
    });
    for (const jl of jellyLights) {
      if (jl.of >= 0) jl.light.position.copy(jellies[jl.of].mesh.position);
      jl.light.intensity = 2.0 + Math.sin(t * 1.6 + jl.of) * 0.7;
    }
    portal.animate(t);
    current.material.opacity = 0.11 + Math.sin(t * 1.4) * 0.05;
  }

  return {
    sun, animate, terrain: DEEP_TERRAIN, decor,
    spawn: DEEP.spawn,
    portal: DEEP.portal,
    portalTo: 'sea',        // 이 지역의 포탈은 푸른숲이 아니라 물의길로 간다
    dark: true,             // 주인공의 등불이 켜진다
    gravity: DEEP.gravity,  // 물속: 둥실 떠서 높이 뛴다
    // 헤엄치기: 점프 버튼을 누르고 있으면 물을 차고 올라가고, 놓으면 천천히 가라앉는다.
    // clear 만큼 바닥에서 떠오르면 바위·다시마·가라앉은 배 위로 헤엄쳐 지나갈 수 있다.
    swim: { ceiling: DEEP.surfaceY - 1.2, up: 26, rise: 6.5, sink: 4.5, clear: 3.0 },
    noShrine: true,         // 심해에는 메가 성역이 없다 (심해 전용 메가 포켓몬이 아직 없다)
    npcs: [{ x: diverAt.x, z: diverAt.z, mesh: diver, name: '도리', warp: true, lines: (c) => [
      `여긴 심해야, ${c.name}! 난 잠수부 도리. 소용돌이를 타고 내려왔구나!`,
      '여기선 헤엄을 칠 수 있어! 점프 버튼(스페이스)을 꾹 누르고 있으면 쑥쑥 올라가고, 놓으면 천천히 가라앉아.',
      '위로 올라가면 바위와 다시마 숲을 넘어서 지나갈 수 있어. 저 위 수면까지 올라가 빛줄기도 구경해 봐!',
      `여기 포켓몬은 물 속성이야. 공격 ${c.zone.atkRange}쯤이면 편하게 이겨. 전기나 풀 포켓몬이 물에 세!`,
      '심해 친구들이 유난히 센 건 자기 힘이 아니야. 로켓단이 여기 잠수정 기지에서 숫자를 억지로 부풀린 거란다.',
      c.conquered.deepsea ? '보스 갸라도스를 이겼구나! 심해의 챔피언이야!' : `남쪽 해구에 보스 갸라도스가 있어. 체력 150, 공격 12! 공격 ${c.zone.targetAtk + 3} 이상, 체력 45쯤 되면 도전해 봐. 전기 포켓몬이 있으면 제일 좋아!`,
      '서쪽에 오래전에 가라앉은 배가 있어. 구경하고 가렴.',
      '돌아갈 땐 북쪽의 빛나는 해류를 타. 물의길 선착장까지 올려다 준단다.',
    ] }],
    wildSpots: WILD_SPOTS,
    bossSpot: { x: DEEP.trench.x, z: DEEP.trench.z },
    pickupSpots: PICKUP_SPOTS,
  };
}
