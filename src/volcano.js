import * as THREE from 'three';
import { makeNpc } from './npc.js';
import { rand } from './util.js';
import { buildGround, makePortal, makeSignAt, makeInstanced } from './world.js';

// 불의산 (220x220). 푸른숲 동북쪽 붉은 바위 아치로 들어온다. 불 포켓몬이 산다.
// 가운데에 큰 화산(분화구 용암 호수), 동남쪽에 작은 화산, 산기슭엔 용암 웅덩이·간헐천·검은 나무·흑요석 아치. 용암은 못 들어간다.
// 보스 리자몽은 큰 화산 꼭대기(분화구 둘레)에 있다.
export const VOLCANO = {
  size: 220,
  spawn: { x: 0, z: 88 },
  portal: { x: -14, z: 96 },
  crater: { x: 0, z: -30, r: 26, h: 16 },
  crater2: { x: 74, z: 58, r: 13, h: 7 }, // 작은 화산
  lavaPools: [
    { x: -48, z: 30, r: 7 }, { x: 50, z: 10, r: 6 }, { x: -62, z: -50, r: 8 }, { x: 62, z: -60, r: 7 },
    { x: 26, z: 70, r: 5 }, { x: -80, z: 75, r: 6 }, { x: 85, z: -10, r: 5 }, { x: -12, z: -85, r: 6 },
    { x: -95, z: 10, r: 6 }, { x: 40, z: -95, r: 7 }, { x: -40, z: 95, r: 5 }, { x: 95, z: 95, r: 6 }, { x: -95, z: -95, r: 7 }, { x: 5, z: 40, r: 4 },
  ],
  geysers: [{ x: -30, z: 60 }, { x: 60, z: -30 }, { x: -70, z: -10 }, { x: 30, z: 30 }],
  bumps: [
    { x: -70, z: 0, r: 16, h: 3.4 }, { x: 70, z: 85, r: 12, h: 2.2 }, { x: -40, z: 80, r: 14, h: 2.2 }, { x: 80, z: -35, r: 14, h: 3 }, { x: -80, z: -80, r: 16, h: 3.6 }, { x: 50, z: -90, r: 14, h: 2.8 },
    { x: -100, z: 60, r: 12, h: 2.4 }, { x: 100, z: 30, r: 12, h: 2.6 }, { x: 10, z: -100, r: 14, h: 3 },
  ],
};

function volcanoHeight(x, z) {
  let y = 0;
  for (const b of VOLCANO.bumps) {
    const dx = x - b.x, dz = z - b.z;
    y += b.h * Math.exp(-(dx * dx + dz * dz) / (b.r * b.r));
  }
  // 화산: 분화구 둘레(r)에서 가장 높고, 바깥으로 완만히 내려가고, 안쪽은 용암 호수 바닥으로 파인다
  for (const c of [VOLCANO.crater, VOLCANO.crater2]) {
    const d = Math.hypot(x - c.x, z - c.z);
    if (d < c.r * 2.2) {
      const t = Math.max(0, 1 - (d - c.r) / (c.r * 1.2)); // 바깥 경사
      y += d >= c.r ? c.h * t * t : c.h - Math.min(1, (c.r - d) / 4) * (c.h * 0.3);
    }
  }
  for (const p of VOLCANO.lavaPools) {
    const pd = Math.hypot(x - p.x, z - p.z);
    if (pd < p.r + 1.5) y -= 0.6 * Math.min(1, (p.r + 1.5 - pd) / 2);
  }
  return y;
}
function volcanoBlocked(x, z) {
  for (const c of [VOLCANO.crater, VOLCANO.crater2]) if (Math.hypot(x - c.x, z - c.z) < c.r - 3) return true; // 분화구 용암 호수
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
  scene.fog = new THREE.Fog(0x2b1410, 70, 210);
  scene.add(new THREE.HemisphereLight(0xffb08a, 0x3a1a10, 0.65)); // 환경맵이 주변 빛을 내주므로 낮게
  const sun = new THREE.DirectionalLight(0xffc9a0, 1.1);
  sun.position.set(20, 30, 10);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -35, right: 35, top: 35, bottom: -35, near: 1, far: 120 });
  scene.add(sun, sun.target);

  // 바닥: 검붉은 바위, 분화구 근처는 더 어둡고, 용암 근처는 주황빛
  const rockA = new THREE.Color(0x5a3a30), rockB = new THREE.Color(0x4a2c24), ash = new THREE.Color(0x3a2a26), hot = new THREE.Color(0xa0522d);
  const craters = [VOLCANO.crater, VOLCANO.crater2];
  buildGround(scene, S, 240, volcanoHeight, (x, z, y) => {
    const near = VOLCANO.lavaPools.some((p) => Math.hypot(x - p.x, z - p.z) < p.r + 3) || craters.some((c) => Math.hypot(x - c.x, z - c.z) < c.r + 2);
    if (near) return hot;
    if (craters.some((c) => Math.hypot(x - c.x, z - c.z) < c.r * 1.6)) return ash;
    return Math.random() < 0.5 ? rockA : rockB;
  });

  // 용암: 분화구 호수 + 웅덩이 (빛남)
  const lavaMat = new THREE.MeshStandardMaterial({ color: 0xff6a1a, emissive: 0xff3300, emissiveIntensity: 1.3, roughness: 0.6 });
  const lakeLights = [];
  for (const c of craters) {
    const lake = new THREE.Mesh(new THREE.CircleGeometry(c.r - 4, 40), lavaMat);
    lake.rotation.x = -Math.PI / 2;
    lake.position.set(c.x, c.h - c.h * 0.3 + 1.0, c.z);
    scene.add(lake);
    const l = new THREE.PointLight(0xff5a1f, c === VOLCANO.crater ? 12 : 6, c.r * 1.7);
    l.position.set(c.x, c.h - 1, c.z);
    scene.add(l);
    lakeLights.push(l);
  }
  const c = VOLCANO.crater;
  const poolLights = [];
  for (const p of VOLCANO.lavaPools) {
    const pool = new THREE.Mesh(new THREE.CircleGeometry(p.r, 24), lavaMat);
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(p.x, volcanoHeight(p.x, p.z) + 0.25, p.z);
    scene.add(pool);
    if (poolLights.length < 4) { const l = new THREE.PointLight(0xff5a1f, 3, 14); l.position.set(p.x, volcanoHeight(p.x, p.z) + 1.2, p.z); scene.add(l); poolLights.push(l); } // 점광원은 4개까지
  }

  // 바위 기둥(장애물), 검게 탄 나무, 뜨거운 돌: 인스턴스로 한 번에
  const spireItems = [];
  for (let i = 0; i < 120; i++) {
    const x = rand(-S / 2 + 6, S / 2 - 6), z = rand(-S / 2 + 6, S / 2 - 6);
    if (craters.some((cc) => Math.hypot(x - cc.x, z - cc.z) < cc.r + 6) || Math.hypot(x - VOLCANO.spawn.x, z - VOLCANO.spawn.z) < 10 || volcanoBlocked(x, z)) continue;
    const h = rand(1.5, 6), r = rand(0.6, 1.6);
    spireItems.push({ x, y: volcanoHeight(x, z) + h / 2 - 0.2, z, sx: r, sy: h, sz: r, ry: rand(0, 3) });
    block(x, z, r * 0.8);
  }
  decor.add(makeInstanced(new THREE.ConeGeometry(1, 1, 6), new THREE.MeshStandardMaterial({ color: 0x6b3d33, roughness: 1 }), spireItems, { shadow: true }));
  const trunkItems = [], branchItems = [];
  for (let i = 0; i < 45; i++) {
    const x = rand(-S / 2 + 6, S / 2 - 6), z = rand(-S / 2 + 6, S / 2 - 6);
    if (craters.some((cc) => Math.hypot(x - cc.x, z - cc.z) < cc.r * 1.6) || volcanoBlocked(x, z) || Math.hypot(x - VOLCANO.spawn.x, z - VOLCANO.spawn.z) < 8) continue;
    const h = rand(1.8, 3.2), y = volcanoHeight(x, z);
    trunkItems.push({ x, y: y + h / 2, z, sy: h });
    for (let k = 0; k < 3; k++) branchItems.push({ x, y: y + h * (0.6 + k * 0.15), z, rz: (k - 1) * 0.9 + rand(-0.2, 0.2), ry: rand(0, 3) });
    block(x, z, 0.35);
  }
  const charMat = new THREE.MeshStandardMaterial({ color: 0x1f1512 });
  decor.add(makeInstanced(new THREE.CylinderGeometry(0.18, 0.3, 1, 7), charMat, trunkItems));
  decor.add(makeInstanced(new THREE.CylinderGeometry(0.06, 0.1, 1.2, 5), charMat, branchItems));
  const emberItems = [];
  for (let i = 0; i < 80; i++) {
    const x = rand(-S / 2 + 4, S / 2 - 4), z = rand(-S / 2 + 4, S / 2 - 4);
    if (volcanoBlocked(x, z) || craters.some((cc) => Math.hypot(x - cc.x, z - cc.z) < cc.r + 2)) continue;
    const r = rand(0.3, 0.9);
    emberItems.push({ x, y: volcanoHeight(x, z) + 0.15, z, s: r, rx: rand(0, 3), ry: rand(0, 3) });
    block(x, z, r * 0.9);
  }
  decor.add(makeInstanced(new THREE.DodecahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ color: 0x2a1a16, emissive: 0xff4400, emissiveIntensity: 0.6 }), emberItems));
  // 흑요석 아치 3개 (지나갈 수 있는 문)
  const obsidian = new THREE.MeshStandardMaterial({ color: 0x1a1018, roughness: 0.3, metalness: 0.2 });
  for (const [ax, az, rot] of [[-55, 60, 0.3], [55, -75, -0.6], [-20, -100, 1.2]]) {
    const y = volcanoHeight(ax, az);
    for (const side of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(1.2, 5, 1.2), obsidian);
      post.position.set(ax + Math.cos(rot) * side * 3, y + 2.5, az - Math.sin(rot) * side * 3);
      post.rotation.y = rot;
      decor.add(post); block(post.position.x, post.position.z, 0.9);
    }
    const top = new THREE.Mesh(new THREE.BoxGeometry(7.4, 1, 1.2), obsidian);
    top.position.set(ax, y + 5.4, az);
    top.rotation.y = rot;
    decor.add(top);
  }
  // 간헐천: 불티가 솟는 구멍
  const geyserSparks = [];
  for (const gz of VOLCANO.geysers) {
    const y = volcanoHeight(gz.x, gz.z);
    const hole = new THREE.Mesh(new THREE.CircleGeometry(1.4, 16), new THREE.MeshStandardMaterial({ color: 0xff8a3a, emissive: 0xff4400, emissiveIntensity: 1 }));
    hole.rotation.x = -Math.PI / 2; hole.position.set(gz.x, y + 0.05, gz.z);
    decor.add(hole);
    for (let k = 0; k < 10; k++) {
      const sp = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 5), new THREE.MeshBasicMaterial({ color: 0xffa040 }));
      sp.userData = { x: gz.x, z: gz.z, y, phase: rand(0, 10), dx: rand(-0.4, 0.4), dz: rand(-0.4, 0.4), speed: rand(1.5, 2.5) };
      scene.add(sp);
      geyserSparks.push(sp);
    }
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
  for (let i = 0; i < 24; i++) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex, transparent: true, depthWrite: false }));
    const cc = i < 18 ? VOLCANO.crater : VOLCANO.crater2;
    sp.userData = { c: cc, a: rand(0, Math.PI * 2), r: rand(2, cc.r * 0.35), phase: rand(0, 10), speed: rand(0.6, 1.2) };
    scene.add(sp);
    smokes.push(sp);
  }
  const sparks = [];
  for (let i = 0; i < 36; i++) {
    const sp = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 5), new THREE.MeshBasicMaterial({ color: 0xffa040 }));
    sp.userData = { phase: rand(0, 10), a: rand(0, Math.PI * 2), r: rand(0, c.r - 6), speed: rand(1.5, 3) };
    scene.add(sp);
    sparks.push(sp);
  }

  // 포탈 (푸른숲으로) + 안내판
  const P = VOLCANO.portal;
  const portal = makePortal(scene, P.x, volcanoHeight(P.x, P.z), P.z, { color: 0x66e0ff, label: '푸른숲으로 가는 포탈', labelBg: '#3a1a10', labelFg: '#ffd1a8' });
  const geologist = makeNpc({ outfit: 'scientist', name: '봄이', model: '봄이.glb' });
  geologist.position.set(VOLCANO.spawn.x + 5, volcanoHeight(VOLCANO.spawn.x + 5, VOLCANO.spawn.z - 3), VOLCANO.spawn.z - 3);
  geologist.rotation.y = -0.7;
  decor.add(geologist); block(VOLCANO.spawn.x + 5, VOLCANO.spawn.z - 3, 0.6);
  const drop = new THREE.Mesh(new THREE.CircleGeometry(2.2, 24), new THREE.MeshBasicMaterial({ color: 0xffb080, transparent: true, opacity: 0.25 }));
  drop.rotation.x = -Math.PI / 2;
  drop.position.set(VOLCANO.spawn.x, volcanoHeight(VOLCANO.spawn.x, VOLCANO.spawn.z) + 0.03, VOLCANO.spawn.z);
  scene.add(drop);

  function animate(t) {
    for (const s of smokes) {
      const u = s.userData, cc = u.c;
      const life = ((t * u.speed + u.phase) % 6) / 6;
      s.position.set(cc.x + Math.cos(u.a + life) * u.r * (1 + life), cc.h - 1 + life * 26, cc.z + Math.sin(u.a + life) * u.r * (1 + life));
      s.scale.setScalar(4 + life * 14);
      s.material.opacity = 0.55 * (1 - life);
    }
    for (const s of sparks) {
      const u = s.userData;
      const life = ((t * u.speed + u.phase) % 3) / 3;
      s.position.set(c.x + Math.cos(u.a) * u.r, c.h - 3.5 + life * 9 - life * life * 6, c.z + Math.sin(u.a) * u.r);
      s.visible = life < 0.9;
    }
    for (const s of geyserSparks) {
      const u = s.userData;
      const life = ((t * u.speed + u.phase) % 2.5) / 2.5;
      s.position.set(u.x + u.dx * life * 6, u.y + life * 8 - life * life * 8, u.z + u.dz * life * 6);
      s.visible = life < 0.95;
    }
    lakeLights[0].intensity = 11 + Math.sin(t * 3) * 2;
    for (const l of poolLights) l.intensity = 2.6 + Math.sin(t * 4 + l.position.x) * 0.7;
    portal.animate(t);
  }

  return {
    sun, animate, terrain: VOLCANO_TERRAIN, decor, portal: P, spawn: VOLCANO.spawn, dark: false,
    npcs: [{ x: VOLCANO.spawn.x + 5, z: VOLCANO.spawn.z - 3, mesh: geologist, name: '봄이', warp: true, lines: (c) => [
      `불의산에 온 걸 환영해, ${c.name}! 난 화산을 연구하는 봄이야. 용암은 뜨거우니 밟지 마.`,
      `여기 포켓몬은 전부 불 속성이야. 공격 ${c.zone.atkRange}쯤 되면 편하게 이겨. 물 포켓몬(꼬부기!)이 불에 세고, 풀 포켓몬은 불에 약하니 조심.`,
      c.conquered.volcano ? '보스 리자몽을 이겼구나! 정말 강해졌는걸.' : `큰 화산 꼭대기에 보스 리자몽이 있어. 체력 140! 공격 ${c.zone.targetAtk + 3} 이상, 체력 45쯤 되면 도전해 봐. 물 포켓몬이면 훨씬 쉬워.`,
      '여기 블록은 하나가 2개 가치야. 대결에서 이기면 상대 공격력만큼 블록을 받으니 싸우는 게 이득이지. 포탈로 푸른숲에 돌아갈 수 있어.',
    ] }],
    wildSpots: [[-30, 45], [30, 55], [-55, -20], [60, -30], [-25, -70], [30, -75], [-85, 40], [90, 50], [-70, 90], [60, 95], [0, 55], [-90, -40], [90, -80], [-45, -95], [100, 0], [-100, 90], [15, -105], [-15, 15]],
    bossSpot: { x: c.x, z: c.z + c.r + 0.5 }, // 큰 화산 꼭대기 (분화구 둘레)
    pickupSpots: [[-15, 70], [15, 70], [-40, 55], [45, 60], [-65, 15], [65, 20], [-45, -40], [48, -45], [-30, -80], [32, -82], [0, 45], [-85, 85], [90, 80], [-80, -70], [80, -90], [0, -90], [-12, 12], [12, 15], [-100, 30], [100, -30], [-60, 100], [60, -100], [0, 100], [-100, -30]],
  };
}
