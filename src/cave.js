import * as THREE from 'three';
import { rand } from './util.js';
import { buildBridge, onBridge, bridgeParam, bridgeDeckY } from './world.js';

// 괴물 동굴 (80x80). 초원의 큰 구멍에 빠지거나 동굴 입구로 들어오면 도착한다.
// 어둡고, 수정과 야광 버섯이 빛나며, 포탈을 지나면 숲마을(초원)로 돌아간다.
export const CAVE = {
  size: 80,
  spawn: { x: 0, z: 10 },
  portal: { x: 0, z: 22 },
  lake: { x: 22, z: -14, r: 8 },
  bumps: [
    { x: -20, z: -10, r: 8, h: 1.2 }, { x: 18, z: 16, r: 9, h: 1.0 }, { x: -8, z: -26, r: 7, h: 1.5 }, { x: 26, z: -30, r: 8, h: 1.1 },
  ],
};

// 지하 호수를 가로지르는 나무 다리 (물은 다리로만 건넌다)
const CAVE_BRIDGES = [{ x1: CAVE.lake.x - CAVE.lake.r - 2.5, z1: CAVE.lake.z, x2: CAVE.lake.x + CAVE.lake.r + 2.5, z2: CAVE.lake.z, w: 1.3, rise: 0.6 }];

function caveHeight(x, z) {
  let y = 0;
  for (const b of CAVE.bumps) {
    const dx = x - b.x, dz = z - b.z;
    y += b.h * Math.exp(-(dx * dx + dz * dz) / (b.r * b.r));
  }
  const ld = Math.hypot(x - CAVE.lake.x, z - CAVE.lake.z);
  if (ld < CAVE.lake.r + 2) y -= 0.8 * Math.min(1, (CAVE.lake.r + 2 - ld) / 3);
  for (const b of CAVE_BRIDGES) { const { t, d } = bridgeParam(b, x, z); if (t >= 0 && t <= 1 && d <= b.w + 0.3) y = Math.max(y, bridgeDeckY(b, t)); }
  return y;
}
function caveBlocked(x, z) {
  return Math.hypot(x - CAVE.lake.x, z - CAVE.lake.z) < CAVE.lake.r + 1 && !CAVE_BRIDGES.some((b) => onBridge(b, x, z));
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
  scene.fog = new THREE.Fog(0x05070c, 14, 48);
  scene.add(new THREE.HemisphereLight(0x6a7ab0, 0x141a22, 0.7));
  const sun = new THREE.DirectionalLight(0x8090c0, 0.25);
  sun.position.set(10, 30, 10);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 1, far: 100 });
  scene.add(sun, sun.target);

  // 바닥
  const seg = 100;
  const geo = new THREE.PlaneGeometry(S, S, seg, seg);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = [];
  const a = new THREE.Color(0x3a3f4a), b = new THREE.Color(0x2c3038), lakeBed = new THREE.Color(0x1d2a44);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    pos.setY(i, caveHeight(x, z));
    const c = Math.hypot(x - CAVE.lake.x, z - CAVE.lake.z) < CAVE.lake.r ? lakeBed : Math.random() < 0.5 ? a : b;
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
  for (const b of CAVE_BRIDGES) scene.add(buildBridge(b, obstacles, { plankColor: 0x6e5a45, railColor: 0x4a3b2c }));

  // 바깥 벽 (큰 바위 원뿔 링)
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x4b5261, roughness: 1 });
  for (let i = 0; i < 44; i++) {
    const ang = (i / 44) * Math.PI * 2;
    const r = S / 2 - 2 + rand(-2, 2);
    const x = Math.cos(ang) * r, z = Math.sin(ang) * r;
    const h = rand(6, 12), cr = rand(3, 5);
    const m = new THREE.Mesh(new THREE.ConeGeometry(cr, h, 7), rockMat);
    m.position.set(x, caveHeight(x, z) + h / 2 - 1, z);
    m.rotation.y = rand(0, 3);
    decor.add(m); block(x, z, cr * 0.6);
  }
  // 안쪽 바위 기둥 / 종유석(위로 솟은)
  for (let i = 0; i < 26; i++) {
    const x = rand(-S / 2 + 8, S / 2 - 8), z = rand(-S / 2 + 8, S / 2 - 8);
    if (Math.hypot(x - CAVE.spawn.x, z - CAVE.spawn.z) < 8 || Math.hypot(x - CAVE.portal.x, z - CAVE.portal.z) < 6 || Math.hypot(x - CAVE.lake.x, z - CAVE.lake.z) < CAVE.lake.r + 4) continue;
    const h = rand(1.5, 5), pr = rand(0.6, 1.6);
    const m = new THREE.Mesh(new THREE.ConeGeometry(pr, h, 6), rockMat);
    m.position.set(x, caveHeight(x, z) + h / 2 - 0.2, z);
    m.castShadow = true;
    decor.add(m); block(x, z, pr * 0.8);
  }

  // 수정 (빛남) + 점광원
  const crystalColors = [0x66e0ff, 0xc38bff, 0xff8bd6, 0x8bffb0];
  const crystals = [];
  for (let i = 0; i < 22; i++) {
    const x = rand(-S / 2 + 6, S / 2 - 6), z = rand(-S / 2 + 6, S / 2 - 6);
    if (Math.hypot(x - CAVE.lake.x, z - CAVE.lake.z) < CAVE.lake.r + 4 || Math.hypot(x - CAVE.spawn.x, z - CAVE.spawn.z) < 5 || Math.hypot(x - CAVE.portal.x, z - CAVE.portal.z) < 4) continue;
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
    const light = new THREE.PointLight(col, 2.2, 9);
    light.position.y = 1.2;
    g.add(light);
    g.position.set(x, caveHeight(x, z), z);
    g.userData.phase = rand(0, 6);
    decor.add(g); block(x, z, 0.7);
    crystals.push({ g, light });
  }
  // 야광 버섯
  for (let i = 0; i < 40; i++) {
    const x = rand(-S / 2 + 5, S / 2 - 5), z = rand(-S / 2 + 5, S / 2 - 5);
    if (Math.hypot(x - CAVE.lake.x, z - CAVE.lake.z) < CAVE.lake.r + 1) continue;
    const mush = new THREE.Group();
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 0.4, 6), new THREE.MeshStandardMaterial({ color: 0xcfd8dc }));
    stem.position.y = 0.2;
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x7ff2c8, emissive: 0x2fd39a, emissiveIntensity: 0.9 }));
    cap.position.y = 0.38;
    mush.add(stem, cap);
    mush.position.set(x, caveHeight(x, z), z);
    scene.add(mush);
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
    creatureSpawns: { m07: [[-16, -6], [14, 4]], m08: [[-24, -22], [8, -30]], m09: [[26, 8], [-6, -16]] },
    pickupSpots: [[4, 4], [-6, 2], [10, -8], [-14, 8], [-18, -14], [16, -22], [-4, -30], [28, -4], [-28, 4], [6, 20], [-20, 20], [20, 24]],
  };
}
