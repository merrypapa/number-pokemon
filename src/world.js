import * as THREE from 'three';
import { rand } from './util.js';

// 챕터 1 숫자 초원. 언덕은 부드러운 봉우리 함수로, 구멍은 원으로 정의해서
// 지형 메쉬와 캐릭터 발 높이가 같은 함수를 쓴다.
export const WORLD = {
  size: 120,
  hills: [
    { x: -30, z: -18, r: 12, h: 2.6 },
    { x: 28, z: 14, r: 11, h: 2.2 },
    { x: 8, z: -32, r: 9, h: 3.0 },
    { x: -34, z: 26, r: 14, h: 1.8 },
    { x: 40, z: -30, r: 13, h: 2.4 },
    { x: -12, z: 44, r: 12, h: 2.0 },
    { x: 44, z: 40, r: 10, h: 1.6 },
    { x: -48, z: -40, r: 14, h: 2.8 },
  ],
  hole: { x: 0, z: -50, r: 6 },
};

export function terrainHeight(x, z) {
  let y = 0;
  for (const h of WORLD.hills) {
    const dx = x - h.x, dz = z - h.z;
    y += h.h * Math.exp(-(dx * dx + dz * dz) / (h.r * h.r));
  }
  return y;
}

export function inHole(x, z) {
  const dx = x - WORLD.hole.x, dz = z - WORLD.hole.z;
  return dx * dx + dz * dz < WORLD.hole.r * WORLD.hole.r;
}

export function buildWorld(scene) {
  // 하늘/안개/빛
  scene.background = new THREE.Color(0x8fd3ff);
  scene.fog = new THREE.Fog(0x8fd3ff, 60, 150);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x88aa55, 1.4));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(20, 30, 10);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -35, right: 35, top: 35, bottom: -35, near: 1, far: 120 });
  scene.add(sun, sun.target); // 그림자 범위가 주인공을 따라가도록 main 에서 sun/target 위치를 옮긴다

  // 지형
  const S = WORLD.size, seg = 160;
  const geo = new THREE.PlaneGeometry(S, S, seg, seg);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = [];
  const cA = new THREE.Color(0x7ccf5a), cB = new THREE.Color(0x5fb648);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    let y = terrainHeight(x, z);
    if (inHole(x, z)) y = -6; // 구멍
    pos.setY(i, y);
    const c = Math.random() < 0.5 ? cA : cB;
    colors.push(c.r, c.g, c.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const ground = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }));
  ground.receiveShadow = true;
  scene.add(ground);

  // 구멍 안쪽 어둠
  const holeDark = new THREE.Mesh(
    new THREE.CircleGeometry(WORLD.hole.r - 0.3, 32),
    new THREE.MeshBasicMaterial({ color: 0x1b2a1a })
  );
  holeDark.rotation.x = -Math.PI / 2;
  holeDark.position.set(WORLD.hole.x, -2.5, WORLD.hole.z);
  scene.add(holeDark);

  // 구멍 앞 표지판
  const sign = new THREE.Group();
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.4, 8), new THREE.MeshStandardMaterial({ color: 0x8b5a2b }));
  post.position.y = 0.7;
  const board = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.7, 0.08), new THREE.MeshStandardMaterial({ color: 0xf5deb3 }));
  board.position.y = 1.4;
  sign.add(post, board);
  sign.position.set(WORLD.hole.x + 6.5, terrainHeight(WORLD.hole.x + 6.5, WORLD.hole.z + 2), WORLD.hole.z + 2);
  sign.castShadow = true;
  scene.add(sign);

  // 나무
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x8b5a2b });
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x3f9d3a });
  const treeSpots = [];
  while (treeSpots.length < 46) {
    const x = rand(-S / 2 + 4, S / 2 - 4), z = rand(-S / 2 + 4, S / 2 - 4);
    if (Math.hypot(x, z - 8) < 14 || Math.hypot(x - WORLD.hole.x, z - WORLD.hole.z) < WORLD.hole.r + 4) continue; // 시작 지점·구멍 근처 비움
    if (treeSpots.some(([tx, tz]) => Math.hypot(tx - x, tz - z) < 7)) continue;
    treeSpots.push([x, z]);
  }
  for (const [x, z] of treeSpots) {
    const t = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.35, 1.6, 8), trunkMat);
    trunk.position.y = 0.8;
    const crown = new THREE.Mesh(new THREE.SphereGeometry(1.4, 12, 10), leafMat);
    crown.position.y = 2.2;
    const crown2 = new THREE.Mesh(new THREE.SphereGeometry(1.0, 12, 10), leafMat);
    crown2.position.set(0.6, 2.8, 0.3);
    trunk.castShadow = crown.castShadow = crown2.castShadow = true;
    t.add(trunk, crown, crown2);
    t.position.set(x, terrainHeight(x, z), z);
    scene.add(t);
  }

  // 꽃
  const petalColors = [0xff6b9d, 0xffd93d, 0xffffff, 0xff8c42, 0xb388ff];
  const stemMat = new THREE.MeshStandardMaterial({ color: 0x2e8b57 });
  for (let i = 0; i < 320; i++) {
    const x = rand(-S / 2 + 2, S / 2 - 2), z = rand(-S / 2 + 2, S / 2 - 2);
    if (inHole(x, z)) continue;
    const f = new THREE.Group();
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.4, 5), stemMat);
    stem.position.y = 0.2;
    const petal = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), new THREE.MeshStandardMaterial({ color: petalColors[i % petalColors.length] }));
    petal.position.y = 0.42;
    f.add(stem, petal);
    f.position.set(x, terrainHeight(x, z), z);
    scene.add(f);
  }

  // 풀숲 (몬스터가 숨는 곳)
  const bushMat = new THREE.MeshStandardMaterial({ color: 0x4caf50 });
  const bushes = [];
  const bushSpots = [];
  while (bushSpots.length < 22) {
    const x = rand(-S / 2 + 3, S / 2 - 3), z = rand(-S / 2 + 3, S / 2 - 3);
    if (Math.hypot(x, z - 8) < 5 || inHole(x, z)) continue;
    bushSpots.push([x, z]);
  }
  for (const [x, z] of bushSpots) {
    const b = new THREE.Group();
    for (let k = 0; k < 3; k++) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(rand(0.5, 0.8), 10, 8), bushMat);
      s.position.set(rand(-0.5, 0.5), rand(0.2, 0.5), rand(-0.5, 0.5));
      s.castShadow = true;
      b.add(s);
    }
    b.position.set(x, terrainHeight(x, z), z);
    scene.add(b);
    bushes.push(b);
  }

  // 구름
  const cloudMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.3 });
  for (let i = 0; i < 16; i++) {
    const c = new THREE.Group();
    for (let k = 0; k < 4; k++) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(rand(1, 2), 10, 8), cloudMat);
      s.position.set(k * 1.6, rand(-0.3, 0.3), rand(-0.5, 0.5));
      c.add(s);
    }
    c.position.set(rand(-70, 70), rand(14, 22), rand(-70, 40));
    scene.add(c);
  }

  return { ground, bushes, sun };
}
