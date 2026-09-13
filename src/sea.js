import * as THREE from 'three';
import { makeNpc } from './npc.js';
import { rand } from './util.js';
import { buildGround, makeSignAt, buildBridge, onBridge, bridgeHeightAt, makeInstanced, WHITE_MAT } from './world.js';

// 물의길 (180x180). 푸른숲 기차역에서 기차를 타고 온다. 물 포켓몬이 산다.
// 모래섬들이 바다 위에 흩어져 있고 나무 다리로 이어진다. 바다는 못 들어가고 다리로만 건넌다.
export const SEA = {
  size: 180,
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
};
// 다리: 이웃한 섬끼리 (섬 가장자리에서 가장자리로)
function link(a, b) {
  const A = SEA.islands[a], B = SEA.islands[b];
  const dx = B.x - A.x, dz = B.z - A.z, d = Math.hypot(dx, dz);
  const ux = dx / d, uz = dz / d;
  return { x1: A.x + ux * (A.r - 5), z1: A.z + uz * (A.r - 5), x2: B.x - ux * (B.r - 5), z2: B.z - uz * (B.r - 5), w: 1.3, rise: 0.8 };
}
const SEA_BRIDGES = [link(0, 1), link(0, 2), link(1, 3), link(2, 3), link(1, 4), link(2, 5), link(3, 6), link(4, 6), link(5, 6)];

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
export const SEA_TERRAIN = { height: seaHeight, inHole: () => false, blocked: seaBlocked, size: SEA.size, obstacles: [] };

export function buildSea(scene) {
  const S = SEA.size;
  const decor = new THREE.Group();
  scene.add(decor);
  const obstacles = SEA_TERRAIN.obstacles;
  obstacles.length = 0;
  const block = (x, z, r) => obstacles.push({ x, z, r });

  scene.background = new THREE.Color(0x9fe3ff);
  scene.fog = new THREE.Fog(0x9fe3ff, 80, 220);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x4fa3c7, 1.5));
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
  const water = new THREE.Mesh(new THREE.PlaneGeometry(S + 40, S + 40, 1, 1), new THREE.MeshStandardMaterial({ color: 0x3fb8e8, transparent: true, opacity: 0.72, roughness: 0.15, metalness: 0.1 }));
  water.rotation.x = -Math.PI / 2;
  water.position.y = SEA.waterY;
  scene.add(water);
  for (const b of SEA_BRIDGES) scene.add(buildBridge(b, obstacles, { plankColor: 0xc9955a, railColor: 0x8a5a2b }));

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
    for (let i = 0; i < 52; i++) { const tie = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, 2.0), tieMat); tie.position.set(SEA.spawn.x - 4 + i * 1.5, y0 + 0.05, SEA.spawn.z - 6); decor.add(tie); }
    const plat = new THREE.Mesh(new THREE.BoxGeometry(14, 0.2, 3.5), new THREE.MeshStandardMaterial({ color: 0xd9c9a8 }));
    plat.position.set(SEA.spawn.x + 6, y0 + 0.1, SEA.spawn.z - 2.6);
    decor.add(plat);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(14, 0.25, 3.9), new THREE.MeshStandardMaterial({ color: 0xe8453c }));
    roof.position.set(SEA.spawn.x + 6, y0 + 3.4, SEA.spawn.z - 2.6);
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
  // 선장 (지역 안내 NPC)
  const captain = makeNpc({ outfit: 'captain', name: '선장 넷돌' });
  captain.position.set(SEA.spawn.x - 5, seaHeight(SEA.spawn.x - 5, SEA.spawn.z - 3), SEA.spawn.z - 3);
  captain.rotation.y = 0.7;
  decor.add(captain); block(SEA.spawn.x - 5, SEA.spawn.z - 3, 0.6);

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
    npcs: [{ x: SEA.spawn.x - 5, z: SEA.spawn.z - 3, mesh: captain, name: '선장 넷돌', warp: true, lines: (c) => [
      `물의길에 온 걸 환영하네, ${c.name}! 섬은 다리로만 건널 수 있어. 물에는 못 들어가.`,
      `여기 포켓몬은 물 속성이야. 공격 ${c.zone.atkRange}쯤이면 편하게 이겨. 전기(피카츄!)나 풀 포켓몬이 물에 세지. 불 포켓몬은 물에 약해.`,
      c.conquered.sea ? '보스 거북왕을 이겼군! 훌륭한 트레이너야.' : `남쪽 끝 섬에 보스 거북왕이 있어. 체력 100! 공격 ${c.zone.targetAtk + 3} 이상, 체력 35쯤 되면 도전해 보게. 전기 포켓몬이면 최고야.`,
      '여기 블록은 하나가 2개 가치야. 기차역의 기차를 타면 푸른숲으로 돌아가네.',
    ] }],
    train: { kind: 'train', mesh: train, base: trainBase, dir: 1, boardPoint: { x: SEA.spawn.x + 8, z: SEA.spawn.z - 3 }, to: 'forest' },
    wildSpots: [[I[1].x - 3, I[1].z + 3], [I[1].x + 5, I[1].z - 4], [I[2].x + 3, I[2].z + 2], [I[2].x - 5, I[2].z - 4], [I[3].x - 5, I[3].z + 4], [I[3].x + 5, I[3].z - 5], [I[4].x, I[4].z + 3], [I[4].x - 4, I[4].z - 3], [I[5].x + 3, I[5].z + 3], [I[5].x - 4, I[5].z - 4], [I[0].x - 10, I[0].z - 8], [I[0].x + 11, I[0].z + 6], [I[6].x - 8, I[6].z + 6], [I[6].x + 9, I[6].z + 4]],
    bossSpot: { x: I[6].x, z: I[6].z - 3 },
    pickupSpots: [[I[0].x - 6, I[0].z + 2], [I[0].x + 4, I[0].z - 10], [I[1].x, I[1].z + 6], [I[1].x - 6, I[1].z - 2], [I[2].x, I[2].z + 6], [I[2].x + 6, I[2].z - 2], [I[3].x, I[3].z + 7], [I[3].x - 7, I[3].z - 2], [I[3].x + 7, I[3].z], [I[4].x + 4, I[4].z], [I[5].x - 3, I[5].z + 5], [I[6].x - 6, I[6].z - 6], [I[6].x + 7, I[6].z - 4], [I[6].x, I[6].z + 9], [I[0].x + 12, I[0].z - 4], [I[0].x - 12, I[0].z + 6]],
  };
}
