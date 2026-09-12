import * as THREE from 'three';
import { rand } from './util.js';
import { buildGround, makePortal, makeSignAt, buildBridge, onBridge, bridgeHeightAt } from './world.js';

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
  portal: { x: -8, z: 70 },
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
  sun.shadow.mapSize.set(2048, 2048);
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

  // 야자수 (장애물), 바위, 조개, 파라솔
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0xa57c52 });
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x3f9d3a, side: THREE.DoubleSide });
  const onLand = (x, z, margin = 0.9) => seaHeight(x, z) > margin && !SEA_BRIDGES.some((b) => onBridge(b, x, z));
  let palms = 0;
  while (palms < 46) {
    const isl = SEA.islands[Math.floor(Math.random() * SEA.islands.length)];
    const a = rand(0, Math.PI * 2), r = rand(3, isl.r - 3);
    const x = isl.x + Math.cos(a) * r, z = isl.z + Math.sin(a) * r;
    if (!onLand(x, z) || Math.hypot(x - SEA.spawn.x, z - SEA.spawn.z) < 7 || Math.hypot(x - SEA.portal.x, z - SEA.portal.z) < 4) continue;
    const t = new THREE.Group();
    const h = rand(3, 4.5);
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.28, h, 8), trunkMat);
    trunk.position.y = h / 2; trunk.rotation.z = rand(-0.12, 0.12);
    trunk.castShadow = true;
    t.add(trunk);
    for (let k = 0; k < 6; k++) {
      const leaf = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 2.6), leafMat);
      leaf.position.set(0, h, 0);
      leaf.rotation.y = (k / 6) * Math.PI * 2;
      leaf.rotation.x = -0.9;
      leaf.translateY(1.1);
      t.add(leaf);
    }
    const coconut = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), new THREE.MeshStandardMaterial({ color: 0x6b4a2b }));
    coconut.position.set(0.2, h - 0.2, 0.2);
    t.add(coconut);
    t.position.set(x, seaHeight(x, z), z);
    decor.add(t); block(x, z, 0.4);
    palms++;
  }
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x8d97a3, roughness: 1 });
  for (let i = 0; i < 40; i++) {
    const isl = SEA.islands[Math.floor(Math.random() * SEA.islands.length)];
    const a = rand(0, Math.PI * 2), r = rand(2, isl.r - 2);
    const x = isl.x + Math.cos(a) * r, z = isl.z + Math.sin(a) * r;
    if (!onLand(x, z, -0.2) || Math.hypot(x - SEA.spawn.x, z - SEA.spawn.z) < 6) continue;
    const rr = rand(0.3, 0.9);
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(rr, 0), rockMat);
    rock.position.set(x, seaHeight(x, z) + 0.1, z);
    rock.rotation.set(rand(0, 3), rand(0, 3), 0);
    rock.castShadow = true;
    decor.add(rock); block(x, z, rr * 0.9);
  }
  const shellColors = [0xffffff, 0xffd1dc, 0xffe4b5, 0xe0ffff];
  for (let i = 0; i < 80; i++) {
    const isl = SEA.islands[Math.floor(Math.random() * SEA.islands.length)];
    const a = rand(0, Math.PI * 2), r = rand(isl.r - 8, isl.r - 2);
    const x = isl.x + Math.cos(a) * r, z = isl.z + Math.sin(a) * r;
    if (!onLand(x, z, -0.2)) continue;
    const shell = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: shellColors[i % shellColors.length] }));
    shell.position.set(x, seaHeight(x, z) + 0.02, z);
    shell.scale.set(1, 0.5, 1.2);
    decor.add(shell);
  }
  // 도착 섬: 파라솔 + 작은 기차역(도착) + 표지판
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
    // 도착 기차역: 짧은 선로 + 정차한 기차 (장식)
    const y0 = seaHeight(SEA.spawn.x, SEA.spawn.z - 6);
    const railMat = new THREE.MeshStandardMaterial({ color: 0x555b66 });
    for (const dz of [-0.7, 0.7]) { const rail = new THREE.Mesh(new THREE.BoxGeometry(24, 0.12, 0.14), railMat); rail.position.set(SEA.spawn.x + 6, y0 + 0.1, SEA.spawn.z - 6 + dz); decor.add(rail); }
    const train = new THREE.Group();
    const engine = new THREE.Mesh(new THREE.BoxGeometry(5, 2.2, 2.2), new THREE.MeshStandardMaterial({ color: 0xe8453c })); engine.position.y = 1.5; engine.castShadow = true;
    const car = new THREE.Mesh(new THREE.BoxGeometry(5, 2, 2.2), new THREE.MeshStandardMaterial({ color: 0x3fb8e8 })); car.position.set(-6, 1.4, 0); car.castShadow = true;
    train.add(engine, car);
    train.position.set(SEA.spawn.x + 10, y0, SEA.spawn.z - 6);
    scene.add(train);
    obstacles.push({ ax: SEA.spawn.x + 1, az: SEA.spawn.z - 6, bx: SEA.spawn.x + 13, bz: SEA.spawn.z - 6, r: 1.6 });
    decor.add(makeSignAt('물의길 - 물 포켓몬의 바다. 남쪽 끝 섬엔 거북왕!', SEA.spawn.x - 6, seaHeight(SEA.spawn.x - 6, SEA.spawn.z - 3), SEA.spawn.z - 3, 0.4));
    block(SEA.spawn.x - 6, SEA.spawn.z - 3, 0.25);
  }
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

  const P = SEA.portal;
  const portal = makePortal(scene, P.x, seaHeight(P.x, P.z), P.z, { color: 0x66e0ff, label: '푸른숲으로 가는 포탈', labelBg: '#1f5a7a', labelFg: '#dff6ff' });

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
    portal.animate(t);
  }

  const I = SEA.islands;
  return {
    sun, animate, terrain: SEA_TERRAIN, decor, portal: P, spawn: SEA.spawn, dark: false,
    wildSpots: [[I[1].x - 3, I[1].z + 3], [I[1].x + 5, I[1].z - 4], [I[2].x + 3, I[2].z + 2], [I[2].x - 5, I[2].z - 4], [I[3].x - 5, I[3].z + 4], [I[3].x + 5, I[3].z - 5], [I[4].x, I[4].z + 3], [I[4].x - 4, I[4].z - 3], [I[5].x + 3, I[5].z + 3], [I[5].x - 4, I[5].z - 4], [I[0].x - 10, I[0].z - 8], [I[0].x + 11, I[0].z + 6], [I[6].x - 8, I[6].z + 6], [I[6].x + 9, I[6].z + 4]],
    bossSpot: { x: I[6].x, z: I[6].z - 3 },
    pickupSpots: [[I[0].x - 6, I[0].z + 2], [I[0].x + 4, I[0].z - 10], [I[1].x, I[1].z + 6], [I[1].x - 6, I[1].z - 2], [I[2].x, I[2].z + 6], [I[2].x + 6, I[2].z - 2], [I[3].x, I[3].z + 7], [I[3].x - 7, I[3].z - 2], [I[3].x + 7, I[3].z], [I[4].x + 4, I[4].z], [I[5].x - 3, I[5].z + 5], [I[6].x - 6, I[6].z - 6], [I[6].x + 7, I[6].z - 4], [I[6].x, I[6].z + 9], [I[0].x + 12, I[0].z - 4], [I[0].x - 12, I[0].z + 6]],
  };
}
