import * as THREE from 'three';
import { makeNpc } from './npc.js';
import { buildShip } from './boat.js';
import { rand } from './util.js';
import { buildGround, makeSignAt, buildBridges, onBridge, bridgeHeightAt, bridgeDeckY, makeInstanced, waterRippleTexture, WHITE_MAT } from './world.js';

// 물의길 (240x240). 푸른숲 기차역에서 기차를 타고 온다. 물 포켓몬이 산다.
// 모래섬들이 바다 위에 흩어져 있고 나무 다리로 이어진다. 걸어서는 바다에 못 들어가고 다리로만 건너지만,
// 도착 섬 선착장에서 뱃사공에게 배를 빌리면 바다를 자유롭게 돌아다니며 헤엄치는 포켓몬(잉어킹 등)을 만날 수 있다.
export const SEA = {
  size: 240,
  base: -1.6,     // 바다 밑바닥
  waterY: -0.35,  // 수면
  islands: [
    { x: 0, z: 58, r: 20, h: 4.4 },     // 도착 섬 (기차역·포탈)
    { x: 34, z: 20, r: 15, h: 4.2 },
    { x: -34, z: 14, r: 15, h: 4.2 },
    { x: 8, z: -22, r: 16, h: 4.4 },
    { x: 50, z: -26, r: 13, h: 4.0 },
    { x: -48, z: -34, r: 14, h: 4.0 },
    { x: 4, z: -66, r: 18, h: 4.6 },    // 보스 섬 (거북왕)
  ],
  spawn: { x: 0, z: 62 },
  dock: { x1: 12, z1: 70, x2: 29, z2: 70, w: 1.7, rise: 0 }, // 선착장: 기차역에서 조금 걸어가는 섬 북동쪽 물가에서 바다로 뻗은 잔교
  lighthouse: { x: 86, z: 26 },      // 먼바다 등대 바위
};
/** 배를 탄 채 갈 수 있는 곳: 물 위이고 맵 안. (섬·다리 위는 배가 못 간다) */
export function seaSailable(x, z) {
  const lim = SEA.size / 2 - 3;
  if (Math.abs(x) > lim || Math.abs(z) > lim) return false;
  let y = SEA.base;
  for (const i of SEA.islands) { const dx = x - i.x, dz = z - i.z; y += i.h * Math.exp(-(dx * dx + dz * dz) / (i.r * i.r)); }
  const d = SEA.dock; // 선착장 위로는 배가 지나가지 않는다 (다른 다리 아래로는 지나갈 수 있다)
  if (Math.abs(z - d.z1) < d.w + 1.2 && x > d.x1 - 1 && x < d.x2 + 1) return false;
  const L = SEA.lighthouse; // 등대 바위는 피해서 돈다
  if (Math.hypot(x - L.x, z - L.z) < 7) return false;
  return y < SEA.waterY - 0.35; // 물가 얕은 곳은 배가 못 들어간다 (걸어서 내릴 수 있게)
}
// 다리: 이웃한 섬끼리 (섬 가장자리에서 가장자리로)
function link(a, b) {
  const A = SEA.islands[a], B = SEA.islands[b];
  const dx = B.x - A.x, dz = B.z - A.z, d = Math.hypot(dx, dz);
  const ux = dx / d, uz = dz / d;
  return { x1: A.x + ux * (A.r - 5), z1: A.z + uz * (A.r - 5), x2: B.x - ux * (B.r - 5), z2: B.z - uz * (B.r - 5), w: 1.3, rise: 0.8 };
}
const SEA_BRIDGES = [link(0, 1), link(0, 2), link(1, 3), link(2, 3), link(1, 4), link(2, 5), link(3, 6), link(4, 6), link(5, 6), SEA.dock];

function seaHeight(x, z) {
  let y = SEA.base;
  for (const i of SEA.islands) {
    const dx = x - i.x, dz = z - i.z;
    y += i.h * Math.exp(-(dx * dx + dz * dz) / (i.r * i.r));
  }
  const by = bridgeHeightAt(SEA_BRIDGES, x, z);
  return by === null ? y : Math.max(y, by);
}
function seaBlocked(x, z) {
  let y = SEA.base;
  for (const i of SEA.islands) { const dx = x - i.x, dz = z - i.z; y += i.h * Math.exp(-(dx * dx + dz * dz) / (i.r * i.r)); }
  return y < SEA.waterY + 0.05 && !SEA_BRIDGES.some((b) => onBridge(b, x, z));
}
export const SEA_TERRAIN = { height: seaHeight, inHole: () => false, blocked: seaBlocked, size: SEA.size, obstacles: [], waterY: SEA.waterY, sailable: seaSailable };

export function buildSea(scene) {
  const S = SEA.size;
  const decor = new THREE.Group();
  scene.add(decor);
  const foamRings = []; // 물가 흰 파도선 (밀려왔다 나갔다 한다)
  const obstacles = SEA_TERRAIN.obstacles;
  obstacles.length = 0;
  const block = (x, z, r) => obstacles.push({ x, z, r });

  scene.background = new THREE.Color(0x9fe3ff);
  scene.fog = new THREE.Fog(0x9fe3ff, 80, 220);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x4fa3c7, 0.65)); // 환경맵이 주변 빛을 내주므로 낮게
  const sun = new THREE.DirectionalLight(0xffffff, 1.8);
  sun.position.set(20, 30, 10);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -35, right: 35, top: 35, bottom: -35, near: 1, far: 120 });
  scene.add(sun, sun.target);

  // 바닥: 물속은 푸른 모래, 물가는 밝은 모래, 섬 위는 풀
  const seabed = new THREE.Color(0x6fb0b8), sand = new THREE.Color(0xf1e2b0), sandDark = new THREE.Color(0xe3cf92), grass = new THREE.Color(0x7ccf5a), grassB = new THREE.Color(0x5fb648);
  buildGround(scene, S, 220, seaHeight, (x, z, y) => {
    if (y < SEA.waterY - 0.1) return seabed;
    if (y < 0.7) return Math.random() < 0.5 ? sand : sandDark;
    return Math.random() < 0.5 ? grass : grassB;
  });
  // 바다 (반투명 수면, 파도처럼 살짝 출렁)
  const seaTex = waterRippleTexture().clone();
  seaTex.needsUpdate = true; seaTex.wrapS = seaTex.wrapT = THREE.RepeatWrapping; seaTex.repeat.set(26, 26);
  const water = new THREE.Mesh(new THREE.PlaneGeometry(S + 40, S + 40, 1, 1), new THREE.MeshStandardMaterial({ color: 0x3fb8e8, map: seaTex, transparent: true, opacity: 0.78, roughness: 0.15, metalness: 0.1 }));
  water.rotation.x = -Math.PI / 2;
  water.position.y = SEA.waterY;
  scene.add(water);
  { // 물가 흰 파도선: 섬마다 해안선을 따라 얇은 흰 고리를 둘러 바다와 모래의 경계를 살린다
    const foamMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.38, depthWrite: false, side: THREE.DoubleSide });
    for (const isl of SEA.islands) {
      const k = (SEA.waterY - SEA.base) / isl.h;   // 섬 높이식이 수면과 만나는 반지름
      if (k <= 0 || k >= 1) continue;
      const shore = isl.r * Math.sqrt(-Math.log(k));
      const ring = new THREE.Mesh(new THREE.RingGeometry(shore - 0.9, shore + 1.1, 56), foamMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(isl.x, SEA.waterY + 0.06, isl.z);
      decor.add(ring);
      foamRings.push(ring);
    }
  }
  scene.add(buildBridges(SEA_BRIDGES.filter((b) => b !== SEA.dock), obstacles, { plankColor: 0xc9955a, railColor: 0x8a5a2b }));

  // 야자수 (장애물, 인스턴스), 바위, 조개, 파라솔
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0xa57c52 });
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x3f9d3a, side: THREE.DoubleSide });
  const onLand = (x, z, margin = 0.9) => seaHeight(x, z) > margin && !SEA_BRIDGES.some((b) => onBridge(b, x, z));
  const trunkItems = [], leafItems = [], nutItems = [];
  let palms = 0;
  while (palms < 60) {
    const isl = SEA.islands[Math.floor(Math.random() * SEA.islands.length)];
    const a = rand(0, Math.PI * 2), r = rand(3, isl.r - 3);
    const x = isl.x + Math.cos(a) * r, z = isl.z + Math.sin(a) * r;
    if (!onLand(x, z) || Math.hypot(x - SEA.spawn.x, z - SEA.spawn.z) < 9) continue;
    const h = rand(3, 4.5), y = seaHeight(x, z);
    trunkItems.push({ x, y: y + h / 2, z, sy: h, rz: rand(-0.12, 0.12) });
    for (let k = 0; k < 6; k++) leafItems.push({ x, y: y + h + 0.5, z, ry: (k / 6) * Math.PI * 2, rx: -0.9 });
    nutItems.push({ x: x + 0.2, y: y + h - 0.2, z: z + 0.2 });
    block(x, z, 0.4);
    palms++;
  }
  decor.add(makeInstanced(new THREE.CylinderGeometry(0.16, 0.28, 1, 8), trunkMat, trunkItems, { shadow: true }));
  const leafGeo = new THREE.PlaneGeometry(0.7, 2.6); leafGeo.translate(0, 1.1, 0);
  decor.add(makeInstanced(leafGeo, leafMat, leafItems));
  decor.add(makeInstanced(new THREE.SphereGeometry(0.2, 8, 6), new THREE.MeshStandardMaterial({ color: 0x6b4a2b }), nutItems));
  const rockItems = [];
  for (let i = 0; i < 50; i++) {
    const isl = SEA.islands[Math.floor(Math.random() * SEA.islands.length)];
    const a = rand(0, Math.PI * 2), r = rand(2, isl.r - 2);
    const x = isl.x + Math.cos(a) * r, z = isl.z + Math.sin(a) * r;
    if (!onLand(x, z, -0.2) || Math.hypot(x - SEA.spawn.x, z - SEA.spawn.z) < 8) continue;
    const rr = rand(0.3, 0.9);
    rockItems.push({ x, y: seaHeight(x, z) + 0.1, z, s: rr, rx: rand(0, 3), ry: rand(0, 3) });
    block(x, z, rr * 0.9);
  }
  decor.add(makeInstanced(new THREE.DodecahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ color: 0x8d97a3, roughness: 1 }), rockItems, { shadow: true }));
  { // 섬 풀밭에 짧은 풀포기 (한 번에 그린다)
    const tufts = [];
    for (let i = 0; i < 1400; i++) {
      const isl = SEA.islands[Math.floor(Math.random() * SEA.islands.length)];
      const a = rand(0, Math.PI * 2), r = rand(2, isl.r - 2);
      const x = isl.x + Math.cos(a) * r, z = isl.z + Math.sin(a) * r;
      if (seaHeight(x, z) < 1.2 || SEA_BRIDGES.some((b) => onBridge(b, x, z))) continue;
      const h = rand(0.2, 0.45);
      tufts.push({ x, y: seaHeight(x, z) + h / 2, z, sy: h, rz: rand(-0.35, 0.35) });
    }
    decor.add(makeInstanced(new THREE.ConeGeometry(0.11, 1, 4), new THREE.MeshStandardMaterial({ color: 0x5aba4a, side: THREE.DoubleSide }), tufts));
  }
  const shellColors = [0xffffff, 0xffd1dc, 0xffe4b5, 0xe0ffff];
  const shellItems = [];
  for (let i = 0; i < 100; i++) {
    const isl = SEA.islands[Math.floor(Math.random() * SEA.islands.length)];
    const a = rand(0, Math.PI * 2), r = rand(isl.r - 8, isl.r - 2);
    const x = isl.x + Math.cos(a) * r, z = isl.z + Math.sin(a) * r;
    if (!onLand(x, z, -0.2)) continue;
    shellItems.push({ x, y: seaHeight(x, z) + 0.02, z, sx: 1, sy: 0.5, sz: 1.2, color: shellColors[i % shellColors.length] });
  }
  decor.add(makeInstanced(new THREE.SphereGeometry(0.16, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2), WHITE_MAT, shellItems));
  // 도착 섬: 파라솔 + 기차역 + 표지판
  const postMat0 = new THREE.MeshStandardMaterial({ color: 0x8a5a2b });
  let train, trainBase;
  {
    const isl = SEA.islands[0];
    for (const [dx, dz, col] of [[8, 4, 0xe8453c], [-9, 2, 0xffd93d], [6, -8, 0x3fb8e8]]) {
      const x = isl.x + dx, z = isl.z + dz, y = seaHeight(x, z);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.4, 6), new THREE.MeshStandardMaterial({ color: 0xffffff }));
      pole.position.set(x, y + 1.2, z);
      const top = new THREE.Mesh(new THREE.ConeGeometry(1.5, 0.7, 10, 1, true), new THREE.MeshStandardMaterial({ color: col, side: THREE.DoubleSide }));
      top.position.set(x, y + 2.5, z);
      decor.add(pole, top); block(x, z, 0.15);
    }
    // 기차역: 푸른숲으로 돌아가는 기차 (가까이 가서 E). 선로는 동쪽 바다 위 다리처럼 길게 뻗어 있다
    const y0 = seaHeight(SEA.spawn.x, SEA.spawn.z - 6);
    const railMat = new THREE.MeshStandardMaterial({ color: 0x555b66 });
    for (const dz of [-0.7, 0.7]) { const rail = new THREE.Mesh(new THREE.BoxGeometry(80, 0.12, 0.14), railMat); rail.position.set(SEA.spawn.x + 34, y0 + 0.1, SEA.spawn.z - 6 + dz); decor.add(rail); }
    const tieMat = new THREE.MeshStandardMaterial({ color: 0x6b4a2b });
    // 바다 위 구간에는 다리 기둥을 세운다 (배가 그 아래로 지나간다)
    for (let i = 0; i < 20; i++) {
      const px = SEA.spawn.x + 6 + i * 3.6;
      if (seaHeight(px, SEA.spawn.z - 6) > SEA.waterY + 0.5) continue;
      const pier = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.42, y0 - SEA.base + 0.5, 8), postMat0);
      pier.position.set(px, (y0 + SEA.base) / 2, SEA.spawn.z - 6);
      pier.castShadow = true;
      decor.add(pier);
    }
    for (let i = 0; i < 52; i++) { const tie = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, 2.0), tieMat); tie.position.set(SEA.spawn.x - 4 + i * 1.5, y0 + 0.05, SEA.spawn.z - 6); decor.add(tie); }
    const plat = new THREE.Mesh(new THREE.BoxGeometry(14, 0.2, 3.5), new THREE.MeshStandardMaterial({ color: 0xd9c9a8 }));
    plat.position.set(SEA.spawn.x + 6, y0 + 0.1, SEA.spawn.z - 2.6);
    plat.userData.noHide = true; // 바닥은 숨기지 않는다
    decor.add(plat);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(14, 0.25, 3.9), new THREE.MeshStandardMaterial({ color: 0xe8453c }));
    roof.position.set(SEA.spawn.x + 6, y0 + 3.4, SEA.spawn.z - 2.6);
    roof.userData.radius = 8;   // 넓은 지붕이라 끝에 서도 시야를 가리면 잠시 숨는다
    decor.add(roof);
    for (const dx of [-6, 0, 6]) for (const dz of [-4.2, -1.0]) { const post = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 3.4, 8), tieMat); post.position.set(SEA.spawn.x + 6 + dx, y0 + 1.7, SEA.spawn.z + dz); decor.add(post); block(SEA.spawn.x + 6 + dx, SEA.spawn.z + dz, 0.2); }
    train = new THREE.Group();
    const dark = new THREE.MeshStandardMaterial({ color: 0x20232e });
    const engine = new THREE.Mesh(new THREE.BoxGeometry(5, 2.2, 2.2), new THREE.MeshStandardMaterial({ color: 0xe8453c })); engine.position.y = 1.5; engine.castShadow = true;
    const cab = new THREE.Mesh(new THREE.BoxGeometry(2, 1.2, 2.2), new THREE.MeshStandardMaterial({ color: 0xe8453c })); cab.position.set(-1.2, 3.2, 0);
    const chimney = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.4, 1.2, 10), dark); chimney.position.set(1.6, 3.2, 0);
    const car = new THREE.Mesh(new THREE.BoxGeometry(5, 2, 2.2), new THREE.MeshStandardMaterial({ color: 0x3fb8e8 })); car.position.set(-6, 1.4, 0); car.castShadow = true;
    train.add(engine, cab, chimney, car);
    for (const wx of [-1.6, 1.6, -7.6, -4.4]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 2.4, 12), dark); w.rotation.x = Math.PI / 2; w.position.set(wx, 0.5, 0); train.add(w); }
    train.position.set(SEA.spawn.x + 10, y0, SEA.spawn.z - 6);
    scene.add(train);
    trainBase = train.position.clone();
    obstacles.push({ ax: SEA.spawn.x + 1, az: SEA.spawn.z - 6, bx: SEA.spawn.x + 13, bz: SEA.spawn.z - 6, r: 1.6 });
  }

  // ---------- 선착장(잔교) + 배 + 뱃사공 ----------
  // 도착 섬 동쪽에서 바다로 뻗은 나무 잔교. 끝에 배가 묶여 있고 옆에 뱃사공이 서 있다.
  const D = SEA.dock;
  const postMat = new THREE.MeshStandardMaterial({ color: 0x8a5a2b });
  scene.add(buildBridges([D], obstacles, { plankColor: 0xd9a55f, railColor: 0x8a5a2b })); // 잔교(걸어 다닐 수 있다)
  const dockEnd = { x: D.x2 - 1.2, z: D.z2 };
  const deckY = bridgeDeckY(D, 1);
  for (const dz of [-1.5, 1.5]) { // 잔교 끝 계선주
    const bol = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.24, 1.0, 10), postMat);
    bol.position.set(D.x2 - 0.5, deckY + 0.5, D.z2 + dz);
    decor.add(bol);
  }
  decor.add(makeSignAt(D.x1 - 2.5, seaHeight(D.x1 - 2.5, D.z1 + 2.8), D.z1 + 2.8, '선착장 · 배를 타고 먼바다로', { bg: '#1f3a93', fg: '#ffffff' }));
  // 배: 돛 두 개와 양 머리 장식이 달린 모험선 (src/boat.js). 탈 때는 주인공이 갑판 위에 선다
  const ship = buildShip();
  const boat = ship.group;
  boat.position.set(dockEnd.x + 4.2, SEA.waterY, dockEnd.z);
  boat.rotation.y = 0; // 뱃머리(+x)는 먼바다 쪽
  scene.add(boat);
  const boatBase = boat.position.clone();
  // 뱃사공 (배를 빌려주는 NPC)
  const sailor = makeNpc({ outfit: 'captain', name: '루피', skin: 0xf6d2ae, model: '루피.glb' });
  const sailorAt = { x: D.x2 - 2.6, z: D.z2 + 1.15 }; // 잔교 끝, 배 바로 옆
  sailor.position.set(sailorAt.x, deckY, sailorAt.z);
  sailor.rotation.y = -0.6;
  decor.add(sailor);

  // ---------- 먼바다: 부표 · 암초 · 등대 바위 · 떠 있는 나무통 ----------
  const bobbers = []; // 파도에 위아래로 흔들리는 것들
  const buoyBody = new THREE.MeshStandardMaterial({ color: 0xe8453c });
  const buoyTop = new THREE.MeshStandardMaterial({ color: 0xffd93d, emissive: 0xffb300, emissiveIntensity: 0.5 });
  for (const [bx, bz] of [[42, 52], [64, 30], [70, -14], [40, -58], [-4, 86], [-62, 52], [-86, -8], [-44, -78], [24, -92], [92, 62], [-92, 72], [96, -56]]) {
    if (!seaSailable(bx, bz)) continue;
    const g = new THREE.Group();
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.6, 1.4, 10), buoyBody); b.position.y = 0.5;
    const t2 = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), buoyTop); t2.position.y = 1.4;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.9, 6), postMat); pole.position.y = 1.0;
    g.add(b, pole, t2);
    g.position.set(bx, SEA.waterY, bz);
    decor.add(g);
    bobbers.push({ mesh: g, base: SEA.waterY, t: rand(0, 10), amp: 0.28 });
  }
  const reefMat = new THREE.MeshStandardMaterial({ color: 0x7d8a97, roughness: 1 });
  const reefItems = [];
  for (let i = 0; i < 70; i++) {
    const x = rand(-110, 110), z = rand(-110, 110);
    if (!seaSailable(x, z)) continue;
    const r = rand(0.5, 1.6);
    reefItems.push({ x, y: SEA.waterY - r * 0.35, z, s: r, rx: rand(0, 3), ry: rand(0, 3) });
  }
  decor.add(makeInstanced(new THREE.DodecahedronGeometry(1, 0), reefMat, reefItems, { shadow: true }));
  { // 등대 바위: 먼바다 한가운데, 밤에도 빛나는 빨간 등
    const L = SEA.lighthouse;
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(4.2, 0), reefMat);
    rock.position.set(L.x, SEA.waterY - 0.6, L.z); rock.scale.y = 0.7; rock.castShadow = true;
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.5, 8, 14), new THREE.MeshStandardMaterial({ color: 0xf4f4f8 }));
    tower.position.set(L.x, SEA.waterY + 4.2, L.z); tower.castShadow = true;
    const band = new THREE.Mesh(new THREE.CylinderGeometry(1.12, 1.22, 1.6, 14), new THREE.MeshStandardMaterial({ color: 0xe8453c }));
    band.position.set(L.x, SEA.waterY + 4.4, L.z);
    const lampG = new THREE.Mesh(new THREE.SphereGeometry(0.9, 12, 10), new THREE.MeshStandardMaterial({ color: 0xfff1b5, emissive: 0xffd36b, emissiveIntensity: 1.6 }));
    lampG.position.set(L.x, SEA.waterY + 8.6, L.z);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(1.3, 1.2, 12), new THREE.MeshStandardMaterial({ color: 0x1f3a93 }));
    roof.position.set(L.x, SEA.waterY + 9.7, L.z);
    decor.add(rock, tower, band, lampG, roof);
    obstacles.push({ x: L.x, z: L.z, r: 4.2 });
  }
  for (const [bx, bz] of [[30, 70], [56, -40], [-30, 66], [-70, -50], [78, 6], [8, -96]]) { // 떠 있는 나무통
    if (!seaSailable(bx, bz)) continue;
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 1.1, 12), postMat);
    barrel.rotation.z = Math.PI / 2;
    barrel.position.set(bx, SEA.waterY + 0.2, bz);
    decor.add(barrel);
    bobbers.push({ mesh: barrel, base: SEA.waterY + 0.2, t: rand(0, 10), amp: 0.18 });
  }

  // 선장 (지역 안내 NPC)
  const captainAt = { x: SEA.spawn.x + 6, z: SEA.spawn.z - 1 }; // 기차 플랫폼 옆
  const captain = makeNpc({ outfit: 'captain', name: '리리', model: '리리.glb' });
  captain.position.set(captainAt.x, seaHeight(captainAt.x, captainAt.z), captainAt.z);
  captain.rotation.y = Math.PI;
  decor.add(captain); block(captainAt.x, captainAt.z, 0.6);

  // 갈매기 (하늘을 도는 흰 새)
  const gulls = [];
  for (let i = 0; i < 12; i++) {
    const g = new THREE.Group();
    const wingMat = new THREE.MeshStandardMaterial({ color: 0xffffff, side: THREE.DoubleSide });
    const wl = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.25), wingMat), wr = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.25), wingMat);
    wl.position.x = -0.45; wr.position.x = 0.45;
    wl.rotation.x = wr.rotation.x = -Math.PI / 2;
    g.add(wl, wr);
    g.userData = { cx: rand(-60, 60), cz: rand(-60, 60), r: rand(8, 20), t: rand(0, 10), h: rand(8, 14), wl, wr };
    decor.add(g);
    gulls.push(g);
  }


  function animate(t) {
    water.position.y = SEA.waterY + Math.sin(t * 1.2) * 0.06;
    seaTex.offset.set(t * 0.006, t * 0.011); // 잔물결이 흘러간다
    for (let i = 0; i < foamRings.length; i++) {  // 파도가 밀려왔다 나갔다
      const f = foamRings[i], k = 1 + Math.sin(t * 0.9 + i) * 0.012;
      f.scale.set(k, k, 1);
      f.material.opacity = 0.3 + Math.sin(t * 0.9 + i) * 0.1;
    }
    for (const b of bobbers) { // 부표·나무통이 파도에 까딱까딱
      b.mesh.position.y = b.base + Math.sin(t * 1.5 + b.t) * b.amp;
      b.mesh.rotation.z = (b.mesh.geometry?.type === 'CylinderGeometry' ? Math.PI / 2 : 0) + Math.sin(t * 1.1 + b.t) * 0.08;
    }
    ship.animate(t, !!boat.userData.sailing); // 돛·깃발이 바람에 물결친다
    if (!boat.userData.sailing) { // 묶여 있는 동안에도 물결에 흔들린다
      boat.position.y = SEA.waterY + Math.sin(t * 1.4) * 0.12;
      boat.rotation.z = Math.sin(t * 1.1) * 0.05;
    }
    for (const g of gulls) {
      const u = g.userData;
      const a = t * 0.35 + u.t;
      g.position.set(u.cx + Math.cos(a) * u.r, u.h + Math.sin(a * 2) * 0.8, u.cz + Math.sin(a) * u.r);
      const flap = Math.sin(t * 9 + u.t) * 0.6;
      u.wl.rotation.y = flap; u.wr.rotation.y = -flap;
      g.rotation.y = -a;
    }
  }

  const I = SEA.islands;
  return {
    sun, animate, terrain: SEA_TERRAIN, decor, spawn: SEA.spawn, dark: false,
    waterY: SEA.waterY,
    sailable: seaSailable,
    dock: { x: dockEnd.x, z: dockEnd.z, deckY },                       // 배를 타고 내리는 곳 (잔교 끝)
    sailorHome: { x: sailorAt.x, y: deckY, z: sailorAt.z },            // 배에서 내리면 루피가 돌아가 서는 자리
    boat: { mesh: boat, base: boatBase, deckY: ship.deckY },           // 빌려 타는 배 (갑판 높이)
    npcs: [{ x: sailorAt.x, z: sailorAt.z, mesh: sailor, name: '루피', sails: true, lines: (c) => [
      `안녕, ${c.name}! 난 뱃사공 루피야. 나한테 말을 걸고 "배 타기"를 눌러! 같이 바다로 나가자!`,
      '배 위에서는 방향키(조이스틱)로 몰고, "가속"을 누르면 훨씬 빨리 달려. 나도 같이 타고 갈게!',
      '바다에는 헤엄치는 포켓몬이 살아. 잉어킹·셀러·크랩·독파리… 아주 먼바다엔 라프라스도 있대!',
      '잉어킹은 좀 멍~ 해서 튀어오르기밖에 못 하지만, 끈기 있게 키우면 무시무시한 갸라도스가 된다구!',
      '돌아갈 때는 배 위에서 나한테 다시 말을 걸어. "선착장으로 돌아가기"를 누르면 내가 데려다줄게!',
    ] }, { x: captainAt.x, z: captainAt.z, mesh: captain, name: '리리', boards: 'train', lines: (c) => [
      `물의길에 온 걸 환영해, ${c.name}! 난 선장 리리야. 섬은 다리로만 건널 수 있어. 물에는 못 들어가.`,
      `여기 포켓몬은 물 속성이야. 공격 ${c.zone.atkRange}쯤이면 편하게 이겨. 전기(피카츄!)나 풀 포켓몬이 물에 세지. 불 포켓몬은 물에 약해.`,
      c.conquered.sea ? '보스 거북왕을 이겼군! 훌륭한 트레이너야.' : `남쪽 끝 섬에 보스 거북왕이 있어. 체력 100! 공격 ${c.zone.targetAtk + 3} 이상, 체력 35쯤 되면 도전해 보게. 전기 포켓몬이면 최고야.`,
      '여기 블록은 하나가 2개 가치야. 푸른숲으로 돌아가려면 나한테 말을 걸고 빨간 "출발" 버튼을 누르게.',
      '북동쪽 선착장에 뱃사공 루피가 있네. 루피와 배를 타면 먼바다의 포켓몬을 만날 수 있어!',
      '거북왕을 이겨서 산호 신전이 열리면 메가거북왕이 나타나. 아주 강하니 메가볼을 준비하게!',
    ] }],
    train: { kind: 'train', mesh: train, base: trainBase, dir: 1, boardPoint: { x: SEA.spawn.x + 8, z: SEA.spawn.z - 3 }, to: 'forest' },
    wildSpots: [[I[1].x - 3, I[1].z + 3], [I[1].x + 5, I[1].z - 4], [I[2].x + 3, I[2].z + 2], [I[2].x - 5, I[2].z - 4], [I[3].x - 5, I[3].z + 4], [I[3].x + 5, I[3].z - 5], [I[4].x, I[4].z + 3], [I[4].x - 4, I[4].z - 3], [I[5].x + 3, I[5].z + 3], [I[5].x - 4, I[5].z - 4], [I[0].x - 10, I[0].z - 8], [I[0].x + 11, I[0].z + 6], [I[6].x - 8, I[6].z + 6], [I[6].x + 9, I[6].z + 4]],
    bossSpot: { x: I[6].x, z: I[6].z - 3 },
    // 배를 타야 만나는 헤엄치는 포켓몬 자리 (물 위). 뒤쪽 네 자리는 아주 먼바다 = 라프라스 같은 깊은바다 포켓몬
    waterSpots: [[26, 46], [44, 40], [56, 12], [50, -8], [30, -46], [-18, 40], [-26, 66], [-56, 30], [-66, -6], [-40, -60], [14, -84], [62, -62], [76, 44], [-78, -44]],
    deepSpots: [[100, 12], [-102, 96], [104, -92], [-8, 106]],
    pickupSpots: [[I[0].x - 6, I[0].z + 2], [I[0].x + 4, I[0].z - 10], [I[1].x, I[1].z + 6], [I[1].x - 6, I[1].z - 2], [I[2].x, I[2].z + 6], [I[2].x + 6, I[2].z - 2], [I[3].x, I[3].z + 7], [I[3].x - 7, I[3].z - 2], [I[3].x + 7, I[3].z], [I[4].x + 4, I[4].z], [I[5].x - 3, I[5].z + 5], [I[6].x - 6, I[6].z - 6], [I[6].x + 7, I[6].z - 4], [I[6].x, I[6].z + 9], [I[0].x + 12, I[0].z - 4], [I[0].x - 12, I[0].z + 6]],
  };
}
