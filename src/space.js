import * as THREE from 'three';
import { rand } from './util.js';
import { buildGround, makePortal, makeSignAt } from './world.js';

// 꿈의우주 (160x160). 푸른숲 로켓 발사장에서 로켓을 타고 온다. 신비한 포켓몬(페어리·에스퍼·고스트)이 산다.
// 보랏빛 달 표면(분화구·빛나는 수정·떠다니는 별빛)에 별하늘과 커다란 행성이 보인다. 중력이 약해 높이 뛴다.
export const SPACE = {
  size: 160,
  spawn: { x: 0, z: 58 },
  portal: { x: -10, z: 68 },
  craters: [
    { x: -30, z: 20, r: 12, d: 2.2 }, { x: 35, z: 30, r: 10, d: 1.8 }, { x: 40, z: -30, r: 14, d: 2.6 }, { x: -45, z: -35, r: 12, d: 2.2 },
    { x: 5, z: -10, r: 8, d: 1.4 }, { x: -60, z: 55, r: 9, d: 1.6 }, { x: 60, z: 60, r: 8, d: 1.4 }, { x: -10, z: -60, r: 11, d: 2 },
  ],
  bumps: [
    { x: -20, z: -45, r: 14, h: 2.6 }, { x: 55, z: 0, r: 12, h: 2.2 }, { x: -65, z: 0, r: 13, h: 2.4 }, { x: 20, z: 65, r: 10, h: 1.6 }, { x: 65, z: -65, r: 12, h: 2.4 },
  ],
  gravity: 0.45, // 지구의 절반도 안 되는 중력: 점프가 높고 오래 뜬다
};

function spaceHeight(x, z) {
  let y = 0;
  for (const b of SPACE.bumps) { const dx = x - b.x, dz = z - b.z; y += b.h * Math.exp(-(dx * dx + dz * dz) / (b.r * b.r)); }
  for (const c of SPACE.craters) {
    const d = Math.hypot(x - c.x, z - c.z);
    if (d < c.r) y -= c.d * (1 - (d / c.r) * (d / c.r));           // 움푹
    else if (d < c.r + 2.5) y += 0.5 * (1 - (d - c.r) / 2.5);      // 테두리 살짝 솟음
  }
  return y;
}
export const SPACE_TERRAIN = { height: spaceHeight, inHole: () => false, blocked: () => false, size: SPACE.size, obstacles: [] };

export function buildSpace(scene) {
  const S = SPACE.size;
  const decor = new THREE.Group();
  scene.add(decor);
  const obstacles = SPACE_TERRAIN.obstacles;
  obstacles.length = 0;
  const block = (x, z, r) => obstacles.push({ x, z, r });

  scene.background = new THREE.Color(0x070516);
  scene.fog = new THREE.Fog(0x070516, 40, 130);
  scene.add(new THREE.HemisphereLight(0xb9a6ff, 0x2a1d4d, 1.5));
  const sun = new THREE.DirectionalLight(0xcfc4ff, 0.6);
  sun.position.set(20, 30, 10);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -35, right: 35, top: 35, bottom: -35, near: 1, far: 120 });
  scene.add(sun, sun.target);

  // 바닥: 보랏빛 달 표면, 분화구 안은 더 어둡고 테두리는 밝게
  const dustA = new THREE.Color(0x5a4a8a), dustB = new THREE.Color(0x4a3c78), deep = new THREE.Color(0x35295c), rim = new THREE.Color(0x8a7cc0);
  buildGround(scene, S, 200, spaceHeight, (x, z, y) => {
    for (const c of SPACE.craters) {
      const d = Math.hypot(x - c.x, z - c.z);
      if (d < c.r) return deep;
      if (d < c.r + 2.5) return rim;
    }
    return Math.random() < 0.5 ? dustA : dustB;
  });

  // 별하늘 (점들) + 큰 행성 + 고리 + 작은 달
  {
    const n = 1400;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2), u = rand(0.05, 1);
      const r = 300;
      pos[i * 3] = Math.cos(a) * Math.sqrt(1 - u * u) * r;
      pos[i * 3 + 1] = u * r;
      pos[i * 3 + 2] = Math.sin(a) * Math.sqrt(1 - u * u) * r;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const stars = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: true, fog: false }));
    scene.add(stars);
    const planet = new THREE.Mesh(new THREE.SphereGeometry(28, 32, 24), new THREE.MeshStandardMaterial({ color: 0x4fa3ff, emissive: 0x1a3d80, emissiveIntensity: 0.5, fog: false }));
    planet.position.set(-90, 70, -160);
    scene.add(planet);
    const ring = new THREE.Mesh(new THREE.RingGeometry(36, 50, 48), new THREE.MeshBasicMaterial({ color: 0xffe0b0, side: THREE.DoubleSide, transparent: true, opacity: 0.5, fog: false }));
    ring.position.copy(planet.position);
    ring.rotation.x = Math.PI / 2.6; ring.rotation.y = 0.4;
    scene.add(ring);
    const moon = new THREE.Mesh(new THREE.SphereGeometry(9, 20, 16), new THREE.MeshStandardMaterial({ color: 0xe8e0ff, emissive: 0x6a5aa0, emissiveIntensity: 0.4, fog: false }));
    moon.position.set(120, 90, -120);
    scene.add(moon);
  }

  // 빛나는 수정 기둥 (장애물), 떠다니는 별빛, 우주 바위
  const crystalColors = [0xff8bd6, 0x8bffe8, 0xc38bff, 0xfff28b];
  const crystals = [];
  for (let i = 0; i < 40; i++) {
    const x = rand(-S / 2 + 6, S / 2 - 6), z = rand(-S / 2 + 6, S / 2 - 6);
    if (Math.hypot(x - SPACE.spawn.x, z - SPACE.spawn.z) < 9 || Math.hypot(x - SPACE.portal.x, z - SPACE.portal.z) < 4) continue;
    const col = crystalColors[i % crystalColors.length];
    const g = new THREE.Group();
    for (let k = 0; k < 3; k++) {
      const h = rand(1, 2.6);
      const c = new THREE.Mesh(new THREE.OctahedronGeometry(0.4, 0), new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.9, transparent: true, opacity: 0.9 }));
      c.scale.set(1, h * 1.6, 1);
      c.position.set(rand(-0.5, 0.5), h * 0.5, rand(-0.5, 0.5));
      c.rotation.set(rand(-0.3, 0.3), rand(0, 3), rand(-0.3, 0.3));
      g.add(c);
    }
    if (crystals.length < 6 && i % 6 === 0) { const light = new THREE.PointLight(col, 2.4, 11); light.position.y = 1.4; g.add(light); crystals.push({ g, light }); } // 점광원은 최대 6개
    g.position.set(x, spaceHeight(x, z), z);
    g.userData.phase = rand(0, 6);
    decor.add(g); block(x, z, 0.8);
  }
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x6d5f9a, roughness: 1 });
  for (let i = 0; i < 50; i++) {
    const x = rand(-S / 2 + 4, S / 2 - 4), z = rand(-S / 2 + 4, S / 2 - 4);
    if (Math.hypot(x - SPACE.spawn.x, z - SPACE.spawn.z) < 7) continue;
    const r = rand(0.4, 1.4);
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 0), rockMat);
    rock.position.set(x, spaceHeight(x, z) + 0.2, z);
    rock.rotation.set(rand(0, 3), rand(0, 3), 0);
    rock.castShadow = true;
    decor.add(rock); block(x, z, r * 0.9);
  }
  const orbs = [];
  for (let i = 0; i < 40; i++) {
    const col = crystalColors[i % crystalColors.length];
    const o = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 6), new THREE.MeshBasicMaterial({ color: col }));
    o.userData = { x: rand(-S / 2, S / 2), z: rand(-S / 2, S / 2), h: rand(1.5, 5), phase: rand(0, 10), r: rand(1, 3) };
    scene.add(o);
    orbs.push(o);
  }
  // 도착 로켓 (장식) + 착륙 판 + 표지판
  {
    const x = SPACE.spawn.x + 7, z = SPACE.spawn.z - 6, y = spaceHeight(x, z);
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(5, 5, 0.3, 24), new THREE.MeshStandardMaterial({ color: 0x9aa0a8 }));
    pad.position.set(x, y + 0.15, z);
    decor.add(pad);
    const rocket = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 7, 20), new THREE.MeshStandardMaterial({ color: 0xf4f4f8 })); body.position.y = 4.5; body.castShadow = true;
    const nose = new THREE.Mesh(new THREE.ConeGeometry(1.1, 2.2, 20), new THREE.MeshStandardMaterial({ color: 0xe8453c })); nose.position.y = 9.1;
    rocket.add(body, nose);
    for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2; const fin = new THREE.Mesh(new THREE.BoxGeometry(0.2, 2.2, 1.6), new THREE.MeshStandardMaterial({ color: 0x3fb8e8 })); fin.position.set(Math.cos(a) * 1.4, 1.6, Math.sin(a) * 1.4); fin.rotation.y = -a; rocket.add(fin); }
    rocket.position.set(x, y + 0.3, z);
    scene.add(rocket); block(x, z, 1.6);
    decor.add(makeSignAt('꿈의우주 - 신비한 포켓몬의 별. 한가운데엔 뮤!', SPACE.spawn.x - 6, spaceHeight(SPACE.spawn.x - 6, SPACE.spawn.z - 3), SPACE.spawn.z - 3, 0.4, { board: 0x2a1d4d, bg: '#2a1d4d', fg: '#e6dcff', post: 0x4a3c78 }));
    block(SPACE.spawn.x - 6, SPACE.spawn.z - 3, 0.25);
  }
  const drop = new THREE.Mesh(new THREE.CircleGeometry(2.2, 24), new THREE.MeshBasicMaterial({ color: 0xc9b8ff, transparent: true, opacity: 0.25 }));
  drop.rotation.x = -Math.PI / 2;
  drop.position.set(SPACE.spawn.x, spaceHeight(SPACE.spawn.x, SPACE.spawn.z) + 0.03, SPACE.spawn.z);
  scene.add(drop);

  const P = SPACE.portal;
  const portal = makePortal(scene, P.x, spaceHeight(P.x, P.z), P.z, { color: 0xff8bd6, label: '푸른숲으로 가는 포탈', labelBg: '#2a1d4d', labelFg: '#ffd6f0' });

  function animate(t) {
    for (const { g, light } of crystals) light.intensity = 1.8 + Math.sin(t * 2 + g.userData.phase) * 0.6;
    for (const o of orbs) {
      const u = o.userData;
      o.position.set(u.x + Math.cos(t * 0.5 + u.phase) * u.r, spaceHeight(u.x, u.z) + u.h + Math.sin(t * 1.3 + u.phase) * 0.6, u.z + Math.sin(t * 0.5 + u.phase) * u.r);
    }
    portal.animate(t);
  }

  return {
    sun, animate, terrain: SPACE_TERRAIN, decor, portal: P, spawn: SPACE.spawn, dark: true, gravity: SPACE.gravity,
    wildSpots: [[-30, 35], [30, 40], [-40, 0], [45, 5], [-15, -25], [25, -20], [-55, -20], [55, -40], [-30, -60], [30, -60], [-60, 40], [60, 45], [0, 20], [-70, -60]],
    bossSpot: { x: 0, z: -35 },
    pickupSpots: [[-12, 45], [12, 45], [-30, 15], [30, 15], [-45, -15], [48, -20], [-20, -45], [22, -45], [0, 0], [-60, 25], [60, 25], [-65, -45], [65, -60], [0, -70], [-10, 30], [10, 30], [-40, 60], [40, 62]],
  };
}
