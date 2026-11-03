import * as THREE from 'three';
import { makeNpc } from './npc.js';
import { rand, josa } from './util.js';
import { buildGround, makePortal, makeSignAt, makeInstanced } from './world.js';
import { setRawGround, volcGround, volcStructHeight, volcStructCeiling, volcStructBlocked, volcUnblockLava, volcClear, inOhiaForest, riverDist, inTube, VENTS, LAVA_RIVER, buildVolcanoStructures } from './kilauea.js';

// 불의산 (300x300). 마을 서북쪽 붉은 바위 아치로 들어온다 (포탈은 마을로). 불 포켓몬이 산다.
// 가운데에 큰 화산(분화구 용암 호수), 동남쪽에 작은 화산, 산기슭엔 용암 웅덩이·간헐천·검은 나무·흑요석 아치. 용암은 못 들어간다.
// 보스 리자몽은 큰 화산 꼭대기(분화구 둘레)에 있다.
export const VOLCANO = {
  size: 300,
  spawn: { x: 0.0, z: 120.0 },
  portal: { x: -19.1, z: 130.9 },
  crater: { x: 0.0, z: -40.9, r: 35.5, h: 16 },
  crater2: { x: 100.9, z: 79.1, r: 17.7, h: 7 }, // 작은 화산
  lavaPools: [
    { x: -65.5, z: 40.9, r: 9.5 }, { x: 68.2, z: 13.6, r: 8.2 }, { x: -84.5, z: -68.2, r: 10.9 }, { x: 84.5, z: -81.8, r: 9.5 },
    { x: 35.5, z: 95.5, r: 6.8 }, { x: -109.1, z: 102.3, r: 8.2 }, { x: 115.9, z: -13.6, r: 6.8 }, { x: -16.4, z: -115.9, r: 8.2 },
    { x: -129.5, z: 13.6, r: 8.2 }, { x: 54.5, z: -129.5, r: 9.5 }, { x: -54.5, z: 129.5, r: 6.8 }, { x: 129.5, z: 129.5, r: 8.2 }, { x: -129.5, z: -129.5, r: 9.5 }, { x: 6.8, z: 54.5, r: 5.5 },
  ],
  geysers: [{ x: -40.9, z: 81.8 }, { x: 81.8, z: -40.9 }, { x: -95.5, z: -13.6 }, { x: 40.9, z: 40.9 }],
  bumps: [
    { x: -95.5, z: 0.0, r: 21.8, h: 3.4 }, { x: 95.5, z: 115.9, r: 16.4, h: 2.2 }, { x: -54.5, z: 109.1, r: 19.1, h: 2.2 }, { x: 109.1, z: -47.7, r: 19.1, h: 3 }, { x: -109.1, z: -109.1, r: 21.8, h: 3.6 }, { x: 68.2, z: -122.7, r: 19.1, h: 2.8 },
    { x: -136.4, z: 81.8, r: 16.4, h: 2.4 }, { x: 136.4, z: 40.9, r: 16.4, h: 2.6 }, { x: 13.6, z: -136.4, r: 19.1, h: 3 },
  ],
};

/** 원래 화산 땅 (구조물 빼고) */
function volcanoRaw(x, z) {
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
setRawGround(volcanoRaw);
/** 킬라우에아 구조물(용암 동굴·전망대·돌다리·징검돌·데크길)까지 넣은 높이. refY: 지금 선 높이 (용암 동굴 지붕 위/아래) */
function volcanoHeight(x, z, refY) { return volcStructHeight(x, z, refY, volcGround(x, z)); }
function lavaBlocked(x, z) {
  for (const c of [VOLCANO.crater, VOLCANO.crater2]) if (Math.hypot(x - c.x, z - c.z) < c.r - 3) return true; // 분화구 용암 호수
  return VOLCANO.lavaPools.some((p) => Math.hypot(x - p.x, z - p.z) < p.r + 0.4);
}
function volcanoBlocked(x, z, refY) {
  if (volcStructBlocked(x, z, refY)) return true;
  return lavaBlocked(x, z) && !volcUnblockLava(x, z); // 전망대 위는 용암 호수 위라도 걷는다
}
export const VOLCANO_TERRAIN = { height: volcanoHeight, inHole: () => false, blocked: volcanoBlocked, size: VOLCANO.size, obstacles: [], ledge: 0.9, ceiling: volcStructCeiling };

/** 전설(엔테이) 상태를 한 줄로 — 왜 아직 안 보이는지까지 (main 의 talkTo 가 c.legend 를 준다) */
function legendLine(c) {
  const L = (c.legend || []).find((x) => x.name === '엔테이') || (c.legend || [])[0]; // 엔테이 이야기부터 (힙합리자몽 등 다른 특별 포켓몬은 다음에)
  if (!L) return '';
  if (L.caught) return `전설의 ${L.name}도 네 친구가 됐지! 대단해.`;
  if (L.here) return `소문에 전설의 ${josa(L.name, '이가')} 불의산 어딘가에 내려왔대 — 발밑의 금빛 고리를 찾아봐!`;
  const miss = L.needs.find((n) => !n.ok);
  if (miss) return miss.hasAny && miss.boss ? `${josa(L.name, '은는')} 화산 꼭대기의 "보스" ${josa(miss.name, '을를')} 넘버볼로 잡아야 내려와. 진화로 얻은 ${miss.name}나 풀어주기는 안 쳐!` : `${josa(L.name, '은는')} 보스 ${josa(miss.name, '을를')} 넘버볼로 잡으면 내려와.`;
  return `${josa(L.name, '이가')} 내려올 때가 됐는데… 불의산을 나갔다가 다시 들어와 봐!`;
}
export function buildVolcano(scene) {
  const S = VOLCANO.size;
  const decor = new THREE.Group();
  scene.add(decor);
  const obstacles = VOLCANO_TERRAIN.obstacles;
  obstacles.length = 0;
  const block = (x, z, r) => obstacles.push({ x, z, r });

  scene.background = new THREE.Color(0x2b1410);
  scene.fog = new THREE.Fog(0x2b1410, 95, 290);
  scene.add(new THREE.HemisphereLight(0xffb08a, 0x3a1a10, 1.1));
  const sun = new THREE.DirectionalLight(0xffc9a0, 1.1);
  sun.position.set(20, 30, 10);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -35, right: 35, top: 35, bottom: -35, near: 1, far: 120 });
  scene.add(sun, sun.target);

  // 바닥: 검붉은 바위, 분화구 근처는 더 어둡고, 용암 근처는 주황빛
  const rockA = new THREE.Color(0x5a3a30), rockB = new THREE.Color(0x4a2c24), ash = new THREE.Color(0x3a2a26), hot = new THREE.Color(0xa0522d);
  const craters = [VOLCANO.crater, VOLCANO.crater2];
  const moss = new THREE.Color(0x5f8f3e), mossB = new THREE.Color(0x527f36), sulfur = new THREE.Color(0xc9b43a);
  buildGround(scene, S, 240, volcGround, (x, z, y) => {
    if (riverDist(x, z) < LAVA_RIVER.half + 2) return hot;
    if (inTube(x, z, 0.5)) return ash; // 용암 동굴 바닥은 검은 현무암
    if (VENTS.some((v) => Math.hypot(x - v.x, z - v.z) < v.r + 2.2)) return sulfur;
    if (inOhiaForest(x, z) && y < 4) return Math.random() < 0.5 ? moss : mossB; // 오히아 숲 바닥은 이끼빛
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
  for (let i = 0; i < 210; i++) {
    const x = rand(-S / 2 + 6, S / 2 - 6), z = rand(-S / 2 + 6, S / 2 - 6);
    if (craters.some((cc) => Math.hypot(x - cc.x, z - cc.z) < cc.r + 6) || Math.hypot(x - VOLCANO.spawn.x, z - VOLCANO.spawn.z) < 10 || volcanoBlocked(x, z) || !volcClear(x, z, 2) || inOhiaForest(x, z)) continue;
    const h = rand(1.5, 6), r = rand(0.6, 1.6);
    spireItems.push({ x, y: volcanoHeight(x, z) + h / 2 - 0.2, z, sx: r, sy: h, sz: r, ry: rand(0, 3) });
    block(x, z, r * 0.8);
  }
  decor.add(makeInstanced(new THREE.ConeGeometry(1, 1, 6), new THREE.MeshStandardMaterial({ color: 0x6b3d33, roughness: 1 }), spireItems, { shadow: true }));
  const trunkItems = [], branchItems = [];
  for (let i = 0; i < 140; i++) {
    const x = rand(-S / 2 + 6, S / 2 - 6), z = rand(-S / 2 + 6, S / 2 - 6);
    if (craters.some((cc) => Math.hypot(x - cc.x, z - cc.z) < cc.r * 1.6) || volcanoBlocked(x, z) || Math.hypot(x - VOLCANO.spawn.x, z - VOLCANO.spawn.z) < 8 || !volcClear(x, z, 2) || inOhiaForest(x, z)) continue; // 들어오는 곳 둘레는 오히아 숲 (kilauea.js)
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
    if (volcanoBlocked(x, z) || !volcClear(x, z, 1.5) || craters.some((cc) => Math.hypot(x - cc.x, z - cc.z) < cc.r + 2)) continue;
    const r = rand(0.3, 0.9);
    emberItems.push({ x, y: volcanoHeight(x, z) + 0.15, z, s: r, rx: rand(0, 3), ry: rand(0, 3) });
    block(x, z, r * 0.9);
  }
  decor.add(makeInstanced(new THREE.DodecahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ color: 0x2a1a16, emissive: 0xff4400, emissiveIntensity: 0.6 }), emberItems));
  const structs = buildVolcanoStructures(scene, decor, { height: volcanoHeight, obstacles, avoid: (x, z) => lavaBlocked(x, z) || VOLCANO.lavaPools.some((p) => Math.hypot(x - p.x, z - p.z) < p.r + 2.5) || Math.hypot(x - VOLCANO.spawn.x, z - VOLCANO.spawn.z) < 9 || Math.hypot(x - VOLCANO.portal.x, z - VOLCANO.portal.z) < 5 }); // 킬라우에아 (kilauea.js)
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
  const portal = makePortal(scene, P.x, volcanoHeight(P.x, P.z), P.z, { color: 0x66e0ff, label: '마을로 가는 포탈', labelBg: '#3a1a10', labelFg: '#ffd1a8' });
  const geologist = makeNpc({ outfit: 'scientist', name: '봄이', model: '봄이.glb' });
  geologist.position.set(VOLCANO.spawn.x + 5, volcanoHeight(VOLCANO.spawn.x + 5, VOLCANO.spawn.z - 3), VOLCANO.spawn.z - 3);
  geologist.rotation.y = -0.7;
  decor.add(geologist); block(VOLCANO.spawn.x + 5, VOLCANO.spawn.z - 3, 0.6);
  const drop = new THREE.Mesh(new THREE.CircleGeometry(2.2, 24), new THREE.MeshBasicMaterial({ color: 0xffb080, transparent: true, opacity: 0.25 }));
  drop.rotation.x = -Math.PI / 2;
  drop.position.set(VOLCANO.spawn.x, volcanoHeight(VOLCANO.spawn.x, VOLCANO.spawn.z) + 0.03, VOLCANO.spawn.z);
  scene.add(drop);

  const craterInfo = { x: VOLCANO.crater.x, z: VOLCANO.crater.z, lake: VOLCANO.crater.h - VOLCANO.crater.h * 0.3 + 1 };
  function animate(t) {
    structs.animate(t, craterInfo);
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

  /** 야생·블록 자리가 용암 강·증기 구멍·용암 동굴과 겹치면 옆으로 옮긴다 (앞쪽 keep 개는 일부러 구조물 위에 둔 자리) */
  function clearSpots(list, keep = 0) {
    return list.map(([x, z], i) => { if (i < keep || volcClear(x, z)) return [x, z]; for (let r = 3; r < 24; r += 3) for (let k = 0; k < 8; k++) { const nx = x + Math.cos(k * Math.PI / 4) * r, nz = z + Math.sin(k * Math.PI / 4) * r; if (volcClear(nx, nz) && !volcanoBlocked(nx, nz)) return [nx, nz]; } return [x, z]; });
  }
  return {
    sun, animate, terrain: VOLCANO_TERRAIN, decor, portal: P, portalTo: 'town', spawn: VOLCANO.spawn, dark: false,
    npcs: [{ x: VOLCANO.spawn.x + 5, z: VOLCANO.spawn.z - 3, mesh: geologist, name: '봄이', warp: true, lines: (c) => [
      `불의산에 온 걸 환영해, ${c.name}! 난 화산을 연구하는 봄이야. 용암은 뜨거우니 밟지 마.`,
      '여긴 하와이 킬라우에아 화산을 닮았어. 들어오는 곳 둘레의 빨간 꽃 나무는 오히아야. 용암이 식은 땅에 제일 먼저 자라는 나무지!',
      '서쪽엔 용암이 흘러가며 만든 굴, 용암 동굴이 있어. 안으로 걸어서 지나가도 되고, 북쪽 돌무더기 비탈로 지붕 위에도 올라갈 수 있어. 굴 속에 블록이 있대!',
      '큰 화산 동쪽 가장자리엔 용암 호수 위로 쑥 내민 전망대가 있어. 가운데서 용암 분수가 솟는 게 보여! 동쪽 작은 화산에선 용암 강이 흘러내리는데, 돌다리나 징검돌로 건너.',
      '서남쪽엔 노란 유황 땅에서 김이 솟는 곳이 있어. 김 나는 구멍은 뜨거우니 나무 데크길로만 다녀!',
      `여기 포켓몬은 전부 불 속성이야. 공격 ${c.zone.atkRange}쯤 되면 편하게 이겨. 물 포켓몬(꼬부기!)이 불에 세고, 풀 포켓몬은 불에 약하니 조심.`,
      '여기선 하루 종일 같은 소리만 들렸어. "하나, 둘, 하나, 둘." 로켓단이 불 포켓몬들에게 명령을 훈련시킨 거야.',
      c.conquered.volcano ? `보스 리자몽을 이겼구나! 정말 강해졌는걸. ${legendLine(c)}` : `${(c.legend || []).some((L) => L.needs.some((n) => n.hasAny && !n.ok)) ? '진화로 얻은 리자몽은 안 쳐 — 전설의 엔테이는 화산 꼭대기의 보스 리자몽을 넘버볼로 잡아야 내려와! ' : ''}큰 화산 꼭대기에 보스 리자몽이 있어. 체력 140! 공격 ${c.zone.targetAtk + 3} 이상, 체력 45쯤 되면 도전해 봐. 물 포켓몬이면 훨씬 쉬워.`,
      '여기 블록은 하나가 2개 가치야. 대결에서 이기면 상대 공격력만큼 블록을 받으니 싸우는 게 이득이지. 포탈로 마을에 돌아갈 수 있어.',
    ] }],
    wildSpots: clearSpots([[-40.9, 61.4], [40.9, 75.0], [-75.0, -27.3], [81.8, -40.9], [-34.1, -95.5], [40.9, -102.3], [-115.9, 54.5], [122.7, 68.2], [-95.5, 122.7], [81.8, 129.5], [0.0, 75.0], [-122.7, -54.5], [122.7, -109.1], [-61.4, -129.5], [136.4, 0.0], [-136.4, 122.7], [20.5, -143.2], [-20.5, 20.5], [-72.3, 12.2], [34.7, -119.9], [-134.4, 93.1], [-66.4, -73.3], [92.9, -6.5], [71.3, 25.1], [60.4, 104.6], [-92.5, 52.4]]),
    bossSpot: { x: c.x, z: c.z + c.r + 0.5 }, // 큰 화산 꼭대기 (분화구 둘레)
    pickupSpots: clearSpots([[-49, 86.5], [31, -40.9], [-20.5, 95.5], [20.5, 95.5], [-54.5, 75.0], [61.4, 81.8], [-88.6, 20.5], [88.6, 27.3], [-61.4, -54.5], [65.5, -61.4], [-40.9, -109.1], [43.6, -111.8], [0.0, 61.4], [-115.9, 115.9], [122.7, 109.1], [-109.1, -95.5], [109.1, -122.7], [0.0, -122.7], [-16.4, 16.4], [16.4, 20.5], [-136.4, 40.9], [136.4, -40.9], [-81.8, 136.4], [81.8, -136.4], [0.0, 136.4], [-136.4, -40.9], [59.1, 116.2], [-29.0, 83.1], [-15.3, 120.2], [104.6, -111.1], [-100.5, -78.1], [128.5, -17.6], [-41.1, 23.5], [23.3, 111.6], [98.4, 135.5], [47.3, -93.0]], 2),
  };
}
