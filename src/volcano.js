import * as THREE from 'three';
import { rand } from './util.js';
import { buildGround, makePortal, makeSignAt } from './world.js';

// 불의산 (160x160). 푸른숲 동북쪽 붉은 바위 아치로 들어온다. 불 포켓몬이 산다.
// 가운데에 큰 화산이 솟아 있고 분화구엔 용암 호수, 산기슭엔 용암 웅덩이가 있다. 용암은 못 들어간다.
export const VOLCANO = {
  size: 160,
  spawn: { x: 0, z: 62 },
  portal: { x: -10, z: 70 },
  crater: { x: 0, z: -18, r: 24, h: 14 },
  lavaPools: [
    { x: -38, z: 20, r: 6 }, { x: 40, z: 30, r: 5 }, { x: -50, z: -40, r: 7 }, { x: 52, z: -46, r: 6 },
    { x: 20, z: 52, r: 4 }, { x: -60, z: 55, r: 5 }, { x: 62, z: 0, r: 4.5 }, { x: -10, z: -66, r: 5 },
  ],
  bumps: [
    { x: -55, z: 0, r: 14, h: 3 }, { x: 55, z: 55, r: 12, h: 2.5 }, { x: -30, z: 60, r: 12, h: 2 }, { x: 60, z: -20, r: 12, h: 2.8 }, { x: -60, z: -65, r: 14, h: 3.2 }, { x: 40, z: -70, r: 12, h: 2.6 },
  ],
};

function volcanoHeight(x, z) {
  let y = 0;
  for (const b of VOLCANO.bumps) {
    const dx = x - b.x, dz = z - b.z;
    y += b.h * Math.exp(-(dx * dx + dz * dz) / (b.r * b.r));
  }
  // 화산: 분화구 둘레(r)에서 가장 높고, 바깥으로 완만히 내려가고, 안쪽은 용암 호수로 움푹
  const c = VOLCANO.crater;
  const d = Math.hypot(x - c.x, z - c.z);
  if (d < c.r * 2.2) {
    const t = Math.max(0, 1 - (d - c.r) / (c.r * 1.2)); // 바깥 경사
    y += d >= c.r ? c.h * t * t : c.h - Math.min(1, (c.r - d) / 4) * 4.5; // 안쪽은 4.5 만큼 파인 평평한 용암 호수 바닥
  }
  for (const p of VOLCANO.lavaPools) {
    const pd = Math.hypot(x - p.x, z - p.z);
    if (pd < p.r + 1.5) y -= 0.6 * Math.min(1, (p.r + 1.5 - pd) / 2);
  }
  return y;
}
function volcanoBlocked(x, z) {
  const c = VOLCANO.crater;
  if (Math.hypot(x - c.x, z - c.z) < c.r - 3) return true; // 분화구 용암 호수
  return VOLCANO.lavaPools.some((p) => Math.hypot(x - p.x, z - p.z) < p.r + 0.4);
}
export const VOLCANO_TERRAIN = { height: volcanoHeight, inHole: () => false, blocked: volcanoBlocked, size: VOLCANO.size, obstacles: [] };

export function buildVolcano(scene) {
  const S = VOLCANO.size;
  const decor = new THREE.Group();
  scene.add(decor);
  const obstacles = VOLCANO_TERRAIN.obstacles;
  obstacles.length = 0;
  const block = (x, z, r) => obstacles.push({ x, z, r });

  scene.background = new THREE.Color(0x2b1410);
  scene.fog = new THREE.Fog(0x2b1410, 60, 170);
  scene.add(new THREE.HemisphereLight(0xffb08a, 0x3a1a10, 1.1));
  const sun = new THREE.DirectionalLight(0xffc9a0, 1.1);
  sun.position.set(20, 30, 10);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -35, right: 35, top: 35, bottom: -35, near: 1, far: 120 });
  scene.add(sun, sun.target);

  // 바닥: 검붉은 바위, 분화구 근처는 더 어둡고, 용암 근처는 주황빛
  const rockA = new THREE.Color(0x5a3a30), rockB = new THREE.Color(0x4a2c24), ash = new THREE.Color(0x3a2a26), hot = new THREE.Color(0xa0522d);
  buildGround(scene, S, 200, volcanoHeight, (x, z, y) => {
    const c = VOLCANO.crater;
    const d = Math.hypot(x - c.x, z - c.z);
    const near = VOLCANO.lavaPools.some((p) => Math.hypot(x - p.x, z - p.z) < p.r + 3) || d < c.r + 2;
    if (near) return hot;
    if (d < c.r * 1.6) return ash;
    return Math.random() < 0.5 ? rockA : rockB;
  });

  // 용암: 분화구 호수 + 웅덩이 (빛남)
  const lavaMat = new THREE.MeshStandardMaterial({ color: 0xff6a1a, emissive: 0xff3300, emissiveIntensity: 1.3, roughness: 0.6 });
  const c = VOLCANO.crater;
  const lake = new THREE.Mesh(new THREE.CircleGeometry(c.r - 4, 40), lavaMat);
  lake.rotation.x = -Math.PI / 2;
  lake.position.set(c.x, c.h - 3.5, c.z);
  scene.add(lake);
  const lakeLight = new THREE.PointLight(0xff5a1f, 12, 40);
  lakeLight.position.set(c.x, c.h - 1, c.z);
  scene.add(lakeLight);
  const poolLights = [];
  for (const p of VOLCANO.lavaPools) {
    const pool = new THREE.Mesh(new THREE.CircleGeometry(p.r, 24), lavaMat);
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(p.x, volcanoHeight(p.x, p.z) + 0.25, p.z);
    scene.add(pool);
    if (poolLights.length < 4) { const l = new THREE.PointLight(0xff5a1f, 3, 14); l.position.set(p.x, volcanoHeight(p.x, p.z) + 1.2, p.z); scene.add(l); poolLights.push(l); } // 점광원은 4개까지
  }

  // 바위 기둥 (장애물), 검게 탄 나무, 뜨거운 돌
  const spireMat = new THREE.MeshStandardMaterial({ color: 0x6b3d33, roughness: 1 });
  for (let i = 0; i < 60; i++) {
    const x = rand(-S / 2 + 6, S / 2 - 6), z = rand(-S / 2 + 6, S / 2 - 6);
    if (Math.hypot(x - c.x, z - c.z) < c.r + 6 || Math.hypot(x - VOLCANO.spawn.x, z - VOLCANO.spawn.z) < 10 || volcanoBlocked(x, z)) continue;
    const h = rand(1.5, 5), r = rand(0.6, 1.5);
    const m = new THREE.Mesh(new THREE.ConeGeometry(r, h, 6), spireMat);
    m.position.set(x, volcanoHeight(x, z) + h / 2 - 0.2, z);
    m.castShadow = true;
    decor.add(m); block(x, z, r * 0.8);
  }
  const charMat = new THREE.MeshStandardMaterial({ color: 0x1f1512 });
  for (let i = 0; i < 26; i++) {
    const x = rand(-S / 2 + 6, S / 2 - 6), z = rand(-S / 2 + 6, S / 2 - 6);
    if (Math.hypot(x - c.x, z - c.z) < c.r * 1.6 || volcanoBlocked(x, z) || Math.hypot(x - VOLCANO.spawn.x, z - VOLCANO.spawn.z) < 8) continue;
    const t = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.3, rand(1.8, 3), 7), charMat);
    trunk.position.y = trunk.geometry.parameters.height / 2;
    t.add(trunk);
    for (let k = 0; k < 3; k++) {
      const br = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.1, 1.2, 5), charMat);
      br.position.set(0, trunk.geometry.parameters.height * (0.6 + k * 0.15), 0);
      br.rotation.z = (k - 1) * 0.9 + rand(-0.2, 0.2); br.rotation.y = rand(0, 3);
      t.add(br);
    }
    t.position.set(x, volcanoHeight(x, z), z);
    decor.add(t); block(x, z, 0.35);
  }
  const emberMat = new THREE.MeshStandardMaterial({ color: 0x2a1a16, emissive: 0xff4400, emissiveIntensity: 0.6 });
  for (let i = 0; i < 40; i++) {
    const x = rand(-S / 2 + 4, S / 2 - 4), z = rand(-S / 2 + 4, S / 2 - 4);
    if (volcanoBlocked(x, z) || Math.hypot(x - c.x, z - c.z) < c.r + 2) continue;
    const r = rand(0.3, 0.8);
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 0), emberMat);
    rock.position.set(x, volcanoHeight(x, z) + 0.15, z);
    rock.rotation.set(rand(0, 3), rand(0, 3), 0);
    decor.add(rock); block(x, z, r * 0.9);
  }

  // 화산재 연기 (분화구 위로 떠오르는 스프라이트) + 불티
  const smokeTex = (() => {
    const cv = document.createElement('canvas'); cv.width = cv.height = 64;
    const ctx = cv.getContext('2d');
    const g = ctx.createRadialGradient(32, 32, 4, 32, 32, 30);
    g.addColorStop(0, 'rgba(120,80,70,0.7)'); g.addColorStop(1, 'rgba(120,80,70,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64);
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; return tex;
  })();
  const smokes = [];
  for (let i = 0; i < 18; i++) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex, transparent: true, depthWrite: false }));
    sp.userData = { a: rand(0, Math.PI * 2), r: rand(2, 9), phase: rand(0, 10), speed: rand(0.6, 1.2) };
    scene.add(sp);
    smokes.push(sp);
  }
  const sparks = [];
  for (let i = 0; i < 30; i++) {
    const sp = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 5), new THREE.MeshBasicMaterial({ color: 0xffa040 }));
    sp.userData = { phase: rand(0, 10), a: rand(0, Math.PI * 2), r: rand(0, c.r - 6), speed: rand(1.5, 3) };
    scene.add(sp);
    sparks.push(sp);
  }

  // 포탈 (푸른숲으로) + 안내판
  const P = VOLCANO.portal;
  const portal = makePortal(scene, P.x, volcanoHeight(P.x, P.z), P.z, { color: 0x66e0ff, label: '푸른숲으로 가는 포탈', labelBg: '#3a1a10', labelFg: '#ffd1a8' });
  decor.add(makeSignAt('불의산 - 불 포켓몬의 땅. 산꼭대기엔 리자몽!', VOLCANO.spawn.x + 6, volcanoHeight(VOLCANO.spawn.x + 6, VOLCANO.spawn.z - 4), VOLCANO.spawn.z - 4, -0.4, { board: 0x6b3d33, bg: '#6b3d33', fg: '#ffd1a8', post: 0x3a2320 }));
  block(VOLCANO.spawn.x + 6, VOLCANO.spawn.z - 4, 0.25);
  const drop = new THREE.Mesh(new THREE.CircleGeometry(2.2, 24), new THREE.MeshBasicMaterial({ color: 0xffb080, transparent: true, opacity: 0.25 }));
  drop.rotation.x = -Math.PI / 2;
  drop.position.set(VOLCANO.spawn.x, volcanoHeight(VOLCANO.spawn.x, VOLCANO.spawn.z) + 0.03, VOLCANO.spawn.z);
  scene.add(drop);

  function animate(t) {
    for (const s of smokes) {
      const u = s.userData;
      const life = ((t * u.speed + u.phase) % 6) / 6;
      s.position.set(c.x + Math.cos(u.a + life) * u.r * (1 + life), c.h - 1 + life * 26, c.z + Math.sin(u.a + life) * u.r * (1 + life));
      s.scale.setScalar(4 + life * 14);
      s.material.opacity = 0.55 * (1 - life);
    }
    for (const s of sparks) {
      const u = s.userData;
      const life = ((t * u.speed + u.phase) % 3) / 3;
      s.position.set(c.x + Math.cos(u.a) * u.r, c.h - 3.5 + life * 9 - life * life * 6, c.z + Math.sin(u.a) * u.r);
      s.visible = life < 0.9;
    }
    lakeLight.intensity = 11 + Math.sin(t * 3) * 2;
    for (const l of poolLights) l.intensity = 2.6 + Math.sin(t * 4 + l.position.x) * 0.7;
    portal.animate(t);
  }

  return {
    sun, animate, terrain: VOLCANO_TERRAIN, decor, portal: P, spawn: VOLCANO.spawn, dark: false,
    wildSpots: [[-30, 30], [30, 40], [-45, -15], [50, -25], [-20, -50], [25, -55], [-65, 30], [65, 40], [-55, 70], [55, 70], [0, 40], [-70, -30], [70, -60], [-35, -70]],
    bossSpot: { x: c.x, z: c.z + c.r + 6 }, // 분화구 앞 산기슭
    pickupSpots: [[-15, 50], [15, 50], [-40, 40], [40, 45], [-55, 10], [55, 15], [-40, -30], [42, -35], [-25, -60], [28, -62], [0, 30], [-70, 65], [70, 65], [-65, -60], [65, -70], [0, -70], [-10, 10], [10, 12]],
  };
}
