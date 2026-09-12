import * as THREE from 'three';
import { rand } from './util.js';
import { buildBridge, onBridge, bridgeParam, bridgeDeckY } from './world.js';

// 괴물 동굴 (80x80). 초원의 큰 구멍에 빠지거나 동굴 입구로 들어오면 도착한다.
// 어둡고, 수정과 야광 버섯이 빛나며, 포탈을 지나면 숲마을(초원)로 돌아간다.
export const CAVE = {
  size: 160,
  spawn: { x: 0, z: 15 },
  portal: { x: 0, z: 33 },
  lake: { x: 33, z: -21, r: 10 },
  lake2: { x: -48, z: 34, r: 9 },  // 두 번째 지하 호수 (다리로 건넌다)
  pools: [ { x: -20, z: -50, r: 3 }, { x: 55, z: 20, r: 2.5 }, { x: -60, z: -20, r: 3 }, { x: 20, z: 55, r: 2.5 }, { x: 60, z: -55, r: 3 }, { x: -30, z: 62, r: 2.5 } ], // 빛나는 작은 웅덩이 (못 들어감)
  bumps: [
    { x: -30, z: -15, r: 10, h: 1.2 }, { x: 27, z: 24, r: 11, h: 1.0 }, { x: -12, z: -39, r: 9, h: 1.5 }, { x: 39, z: -45, r: 10, h: 1.1 },
    { x: -45, z: 30, r: 11, h: 1.3 }, { x: 45, z: 42, r: 9, h: 1.0 }, { x: -48, z: -45, r: 10, h: 1.4 },
    { x: 60, z: 60, r: 12, h: 1.6 }, { x: -65, z: -60, r: 12, h: 1.5 }, { x: 0, z: -65, r: 10, h: 1.3 }, { x: -70, z: 5, r: 10, h: 1.2 }, { x: 68, z: -10, r: 11, h: 1.4 },
  ],
};

// 지하 호수를 가로지르는 나무 다리 (물은 다리로만 건넌다)
const CAVE_BRIDGES = [
  { x1: CAVE.lake.x - CAVE.lake.r - 2.5, z1: CAVE.lake.z, x2: CAVE.lake.x + CAVE.lake.r + 2.5, z2: CAVE.lake.z, w: 1.3, rise: 0.6 },
  { x1: CAVE.lake2.x, z1: CAVE.lake2.z - CAVE.lake2.r - 2.5, x2: CAVE.lake2.x, z2: CAVE.lake2.z + CAVE.lake2.r + 2.5, w: 1.3, rise: 0.6 },
];
const LAKES = () => [CAVE.lake, CAVE.lake2];

function caveHeight(x, z) {
  let y = 0;
  for (const b of CAVE.bumps) {
    const dx = x - b.x, dz = z - b.z;
    y += b.h * Math.exp(-(dx * dx + dz * dz) / (b.r * b.r));
  }
  for (const L of LAKES()) { const ld = Math.hypot(x - L.x, z - L.z); if (ld < L.r + 2) y -= 0.8 * Math.min(1, (L.r + 2 - ld) / 3); }
  for (const P of CAVE.pools) { const pd = Math.hypot(x - P.x, z - P.z); if (pd < P.r + 1) y -= 0.4 * Math.min(1, (P.r + 1 - pd) / 1.5); }
  for (const b of CAVE_BRIDGES) { const { t, d } = bridgeParam(b, x, z); if (t >= 0 && t <= 1 && d <= b.w + 0.3) y = Math.max(y, bridgeDeckY(b, t)); }
  return y;
}
function caveBlocked(x, z) {
  if (CAVE.pools.some((P) => Math.hypot(x - P.x, z - P.z) < P.r + 0.3)) return true;
  return LAKES().some((L) => Math.hypot(x - L.x, z - L.z) < L.r + 1) && !CAVE_BRIDGES.some((b) => onBridge(b, x, z));
}
export const CAVE_TERRAIN = { height: caveHeight, inHole: () => false, blocked: caveBlocked, size: CAVE.size, obstacles: [] };

function makeTextTexture(text, bg = '#1f2a3a', fg = '#9fe8ff') {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 128;
  const ctx = c.getContext('2d');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, 256, 128);
  ctx.fillStyle = fg; ctx.font = 'bold 40px sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, 128, 66);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function buildCave(scene) {
  const S = CAVE.size;
  const decor = new THREE.Group();
  scene.add(decor);
  const obstacles = CAVE_TERRAIN.obstacles;
  obstacles.length = 0;
  const block = (x, z, r) => obstacles.push({ x, z, r });
  scene.background = new THREE.Color(0x05070c);
  // 어둡지만 캐릭터가 보일 만큼은 밝게: 달빛 같은 반구광 + 약한 방향광. (전투 중엔 battle.js 가 무대 조명을 더 켠다)
  scene.fog = new THREE.Fog(0x05070c, 24, 80);
  scene.add(new THREE.HemisphereLight(0x8fa3e0, 0x222a3a, 1.7));
  const sun = new THREE.DirectionalLight(0x9aa8d8, 0.5);
  sun.position.set(10, 30, 10);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -35, right: 35, top: 35, bottom: -35, near: 1, far: 120 });
  scene.add(sun, sun.target);

  // 바닥
  const seg = 200;
  const geo = new THREE.PlaneGeometry(S, S, seg, seg);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = [];
  const a = new THREE.Color(0x3a3f4a), b = new THREE.Color(0x2c3038), lakeBed = new THREE.Color(0x1d2a44);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    pos.setY(i, caveHeight(x, z));
    const c = LAKES().some((L) => Math.hypot(x - L.x, z - L.z) < L.r) || CAVE.pools.some((P) => Math.hypot(x - P.x, z - P.z) < P.r) ? lakeBed : Math.random() < 0.5 ? a : b;
    colors.push(c.r, c.g, c.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const ground = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }));
  ground.receiveShadow = true;
  scene.add(ground);

  // 지하 호수
  const water = new THREE.Mesh(new THREE.CircleGeometry(CAVE.lake.r + 1, 36), new THREE.MeshStandardMaterial({ color: 0x1e6fb8, emissive: 0x0b2f5a, emissiveIntensity: 0.6, transparent: true, opacity: 0.8, roughness: 0.1 }));
  water.rotation.x = -Math.PI / 2;
  water.position.set(CAVE.lake.x, -0.3, CAVE.lake.z);
  scene.add(water);
  const water2 = water.clone();
  water2.geometry = new THREE.CircleGeometry(CAVE.lake2.r + 1, 36);
  water2.position.set(CAVE.lake2.x, -0.3, CAVE.lake2.z);
  scene.add(water2);
  // 빛나는 웅덩이 (청록빛, 점광원)
  const poolLights = [];
  for (const P of CAVE.pools) {
    const pool = new THREE.Mesh(new THREE.CircleGeometry(P.r + 0.5, 20), new THREE.MeshStandardMaterial({ color: 0x2fd39a, emissive: 0x1fb88a, emissiveIntensity: 1.1, transparent: true, opacity: 0.85 }));
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(P.x, caveHeight(P.x, P.z) + 0.15, P.z);
    scene.add(pool);
    if (poolLights.length < 2) { const l = new THREE.PointLight(0x5fffc8, 2.5, 12); l.position.set(P.x, 1, P.z); scene.add(l); poolLights.push(l); }
  }
  for (const b of CAVE_BRIDGES) scene.add(buildBridge(b, obstacles, { plankColor: 0x6e5a45, railColor: 0x4a3b2c }));

  // 바깥 벽 (큰 바위 원뿔 링)
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x4b5261, roughness: 1 });
  for (let i = 0; i < 88; i++) {
    const ang = (i / 88) * Math.PI * 2;
    const r = S / 2 - 2 + rand(-2, 2);
    const x = Math.cos(ang) * r, z = Math.sin(ang) * r;
    const h = rand(6, 12), cr = rand(3, 5);
    const m = new THREE.Mesh(new THREE.ConeGeometry(cr, h, 7), rockMat);
    m.position.set(x, caveHeight(x, z) + h / 2 - 1, z);
    m.rotation.y = rand(0, 3);
    decor.add(m); block(x, z, cr * 0.6);
  }
  // 안쪽 바위 기둥 / 종유석(위로 솟은)
  for (let i = 0; i < 70; i++) {
    const x = rand(-S / 2 + 8, S / 2 - 8), z = rand(-S / 2 + 8, S / 2 - 8);
    if (Math.hypot(x - CAVE.spawn.x, z - CAVE.spawn.z) < 8 || Math.hypot(x - CAVE.portal.x, z - CAVE.portal.z) < 6 || LAKES().some((L) => Math.hypot(x - L.x, z - L.z) < L.r + 4) || caveBlocked(x, z)) continue;
    const h = rand(1.5, 5), pr = rand(0.6, 1.6);
    const m = new THREE.Mesh(new THREE.ConeGeometry(pr, h, 6), rockMat);
    m.position.set(x, caveHeight(x, z) + h / 2 - 0.2, z);
    m.castShadow = true;
    decor.add(m); block(x, z, pr * 0.8);
  }

  // 수정 (빛남) + 점광원
  const crystalColors = [0x66e0ff, 0xc38bff, 0xff8bd6, 0x8bffb0];
  const crystals = [];
  for (let i = 0; i < 50; i++) {
    const x = rand(-S / 2 + 6, S / 2 - 6), z = rand(-S / 2 + 6, S / 2 - 6);
    if (LAKES().some((L) => Math.hypot(x - L.x, z - L.z) < L.r + 4) || caveBlocked(x, z) || Math.hypot(x - CAVE.spawn.x, z - CAVE.spawn.z) < 5 || Math.hypot(x - CAVE.portal.x, z - CAVE.portal.z) < 4) continue;
    const col = crystalColors[i % crystalColors.length];
    const g = new THREE.Group();
    for (let k = 0; k < 3; k++) {
      const h = rand(0.8, 1.8);
      const c = new THREE.Mesh(new THREE.OctahedronGeometry(0.35, 0), new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.9, transparent: true, opacity: 0.9 }));
      c.scale.set(1, h * 1.6, 1);
      c.position.set(rand(-0.5, 0.5), h * 0.5, rand(-0.5, 0.5));
      c.rotation.set(rand(-0.3, 0.3), rand(0, 3), rand(-0.3, 0.3));
      g.add(c);
    }
    // 점광원은 5개 중 1개만 (광원이 많으면 매우 느려진다). 나머지는 스스로 빛나는 재질만.
    if (crystals.length < 8 && i % 5 === 0) {
      const light = new THREE.PointLight(col, 2.6, 11);
      light.position.y = 1.2;
      g.add(light);
      crystals.push({ g, light });
    }
    g.position.set(x, caveHeight(x, z), z);
    g.userData.phase = rand(0, 6);
    decor.add(g); block(x, z, 0.7);
  }
  // 야광 버섯
  for (let i = 0; i < 120; i++) {
    const x = rand(-S / 2 + 5, S / 2 - 5), z = rand(-S / 2 + 5, S / 2 - 5);
    if (LAKES().some((L) => Math.hypot(x - L.x, z - L.z) < L.r + 1) || caveBlocked(x, z)) continue;
    const mush = new THREE.Group();
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 0.4, 6), new THREE.MeshStandardMaterial({ color: 0xcfd8dc }));
    stem.position.y = 0.2;
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x7ff2c8, emissive: 0x2fd39a, emissiveIntensity: 0.9 }));
    cap.position.y = 0.38;
    mush.add(stem, cap);
    mush.position.set(x, caveHeight(x, z), z);
    scene.add(mush);
  }

  // 등불 기둥 (길잡이): 도착 지점에서 첫 호수 다리까지 띄엄띄엄
  const lanternMat = new THREE.MeshStandardMaterial({ color: 0xffd36b, emissive: 0xffa322, emissiveIntensity: 1.2 });
  for (let i = 0; i < 7; i++) {
    const t = i / 6;
    const x = CAVE.spawn.x + (CAVE.lake.x - CAVE.lake.r - 4 - CAVE.spawn.x) * t + 2.5, z = CAVE.spawn.z + (CAVE.lake.z - CAVE.spawn.z) * t + 2.5;
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 2.2, 8), new THREE.MeshStandardMaterial({ color: 0x3a3f4a }));
    post.position.set(x, caveHeight(x, z) + 1.1, z);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), lanternMat);
    lamp.position.set(x, caveHeight(x, z) + 2.3, z);
    decor.add(post, lamp); block(x, z, 0.2); // 등불은 빛나는 재질만 (점광원 아님)
  }
  // 종유석 무리 (작은 뾰족 바위 3~5개씩)
  for (let i = 0; i < 30; i++) {
    const cx = rand(-S / 2 + 8, S / 2 - 8), cz = rand(-S / 2 + 8, S / 2 - 8);
    if (Math.hypot(cx - CAVE.spawn.x, cz - CAVE.spawn.z) < 8 || Math.hypot(cx - CAVE.portal.x, cz - CAVE.portal.z) < 6 || LAKES().some((L) => Math.hypot(cx - L.x, cz - L.z) < L.r + 4) || caveBlocked(cx, cz)) continue;
    for (let k = 0; k < 4; k++) {
      const x = cx + rand(-1.5, 1.5), z = cz + rand(-1.5, 1.5), h = rand(0.5, 1.6);
      const m = new THREE.Mesh(new THREE.ConeGeometry(rand(0.2, 0.45), h, 5), rockMat);
      m.position.set(x, caveHeight(x, z) + h / 2 - 0.1, z);
      decor.add(m);
    }
    block(cx, cz, 1.3);
  }

  // 포탈: 빛나는 고리 + 도는 불빛 + 표지판
  const P = CAVE.portal;
  const portal = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.6, 0.18, 12, 40), new THREE.MeshStandardMaterial({ color: 0x66e0ff, emissive: 0x33c8ff, emissiveIntensity: 1.5 }));
  ring.position.y = 1.9;
  const disc = new THREE.Mesh(new THREE.CircleGeometry(1.45, 32), new THREE.MeshBasicMaterial({ color: 0x9fe8ff, transparent: true, opacity: 0.45, side: THREE.DoubleSide }));
  disc.position.y = 1.9;
  const plight = new THREE.PointLight(0x66e0ff, 4, 14);
  plight.position.y = 2;
  portal.add(ring, disc, plight);
  const orbs = [];
  for (let i = 0; i < 8; i++) {
    const o = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    portal.add(o);
    orbs.push(o);
  }
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.1), new THREE.MeshBasicMaterial({ map: makeTextTexture('숲마을로 가는 포탈') }));
  sign.position.set(0, 4.2, 0);
  portal.add(sign);
  portal.position.set(P.x, caveHeight(P.x, P.z), P.z);
  scene.add(portal);

  // 도착 지점 표시 (떨어진 곳의 빛)
  const drop = new THREE.Mesh(new THREE.CircleGeometry(2, 24), new THREE.MeshBasicMaterial({ color: 0xffe9b0, transparent: true, opacity: 0.25 }));
  drop.rotation.x = -Math.PI / 2;
  drop.position.set(CAVE.spawn.x, caveHeight(CAVE.spawn.x, CAVE.spawn.z) + 0.02, CAVE.spawn.z);
  scene.add(drop);

  function animate(t) {
    for (const { g, light } of crystals) light.intensity = 1.8 + Math.sin(t * 2 + g.userData.phase) * 0.6;
    for (const l of poolLights) l.intensity = 2.2 + Math.sin(t * 3 + l.position.x) * 0.6;
    ring.rotation.y = t * 0.6;
    disc.material.opacity = 0.35 + Math.sin(t * 3) * 0.12;
    orbs.forEach((o, i) => {
      const a = t * 1.5 + (i / orbs.length) * Math.PI * 2;
      o.position.set(Math.cos(a) * 2.1, 1.9 + Math.sin(a * 2) * 0.5, Math.sin(a) * 0.6);
    });
    sign.lookAt(sign.position.x, sign.position.y, sign.position.z + 10);
  }

  return {
    sun, animate, terrain: CAVE_TERRAIN, portal: P, spawn: CAVE.spawn,
    decor,
    dark: true,
    wildSpots: [[-24, -9], [21, 6], [-30, 50], [-36, -33], [12, -45], [48, -50], [39, 12], [-9, -24], [-45, -48], [60, 40], [-65, 50], [65, -25], [-70, -40], [0, -50], [30, 60], [-20, 70]],
    bossSpot: { x: 0, z: -68 },
    pickupSpots: [[6, 6], [-9, 3], [15, -12], [-21, 12], [-27, -21], [24, -33], [-6, -45], [42, -6], [-42, 6], [9, 30], [-30, 30], [30, 36], [-48, -12], [48, 24], [0, -60], [-20, 50], [40, -60], [-65, 20], [65, 60], [-60, -65], [60, -70], [0, 70], [-70, 70], [70, 0]],
  };
}
