import * as THREE from 'three';
import { rand } from './util.js';
import { NUMBER_COLORS } from './palette.js';

// 챕터 1 숫자 초원 (120x120).
//  - 남쪽: 마을(큰 숫자 나무, 표지판), 시작 지점
//  - 동쪽: 연못(징검다리, 연잎)
//  - 북쪽: 큰 구멍, 산과 동굴 입구(바위로 막혀 있음)
//  - 서북쪽: 보스 아레나(돌기둥 원) — 쿵쿵이
//  - 흙길이 마을에서 각 장소로 이어진다.
export const WORLD = {
  size: 120,
  hills: [
    { x: -30, z: -18, r: 12, h: 2.6 },
    { x: 28, z: 10, r: 10, h: 2.0 },
    { x: 10, z: -32, r: 9, h: 3.0 },
    { x: -34, z: 26, r: 14, h: 1.8 },
    { x: 44, z: -32, r: 13, h: 2.4 },
    { x: -12, z: 46, r: 12, h: 2.0 },
    { x: 48, z: 44, r: 10, h: 1.6 },
    { x: 20, z: -52, r: 9, h: 2.2 },
  ],
  hole: { x: 0, z: -48, r: 6 },
  village: { x: 0, z: 20 },
  pond: { x: 34, z: 30, r: 9 },
  arena: { x: -44, z: -38, r: 10 },
  cave: { x: -18, z: -55 },
  // 흙길 (마을 → 구멍/동굴, 마을 → 연못, 마을 → 아레나)
  paths: [
    [[0, 16], [0, -6], [-2, -26], [0, -40]],
    [[0, 0], [14, 10], [26, 24]],
    [[0, -6], [-16, -14], [-30, -30], [-40, -36]],
  ],
};

export function terrainHeight(x, z) {
  let y = 0;
  for (const h of WORLD.hills) {
    const dx = x - h.x, dz = z - h.z;
    y += h.h * Math.exp(-(dx * dx + dz * dz) / (h.r * h.r));
  }
  // 연못은 얕게 파인다
  const pd = Math.hypot(x - WORLD.pond.x, z - WORLD.pond.z);
  if (pd < WORLD.pond.r + 2) y -= 0.9 * Math.min(1, (WORLD.pond.r + 2 - pd) / 3);
  return y;
}

export function inHole(x, z) {
  const dx = x - WORLD.hole.x, dz = z - WORLD.hole.z;
  return dx * dx + dz * dz < WORLD.hole.r * WORLD.hole.r;
}

function distToSegment(px, pz, ax, az, bx, bz) {
  const vx = bx - ax, vz = bz - az;
  const t = Math.max(0, Math.min(1, ((px - ax) * vx + (pz - az) * vz) / (vx * vx + vz * vz)));
  return Math.hypot(px - (ax + vx * t), pz - (az + vz * t));
}
function distToPath(x, z) {
  let d = Infinity;
  for (const path of WORLD.paths) for (let i = 0; i + 1 < path.length; i++) d = Math.min(d, distToSegment(x, z, ...path[i], ...path[i + 1]));
  return d;
}

// 표지판 글씨 (캔버스 텍스처)
function makeTextTexture(text) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 128;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#f5deb3'; ctx.fillRect(0, 0, 256, 128);
  ctx.fillStyle = '#5a3a1a'; ctx.font = 'bold 44px sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, 128, 66);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeSign(text, x, z, rotY = 0) {
  const g = new THREE.Group();
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.5, 8), new THREE.MeshStandardMaterial({ color: 0x8b5a2b }));
  post.position.y = 0.75;
  const board = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.9, 0.1), new THREE.MeshStandardMaterial({ color: 0xf5deb3 }));
  board.position.y = 1.5;
  const face = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 0.9), new THREE.MeshBasicMaterial({ map: makeTextTexture(text) }));
  face.position.set(0, 1.5, 0.06);
  post.castShadow = board.castShadow = true;
  g.add(post, board, face);
  g.position.set(x, terrainHeight(x, z), z);
  g.rotation.y = rotY;
  return g;
}

export function buildWorld(scene) {
  const S = WORLD.size;
  const decor = new THREE.Group();
  scene.add(decor);

  // 하늘/안개/빛
  scene.background = new THREE.Color(0x8fd3ff);
  scene.fog = new THREE.Fog(0x8fd3ff, 60, 150);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x88aa55, 1.4));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(20, 30, 10);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -35, right: 35, top: 35, bottom: -35, near: 1, far: 120 });
  scene.add(sun, sun.target);

  // ---------- 지형 + 지역별 색 ----------
  const seg = 160;
  const geo = new THREE.PlaneGeometry(S, S, seg, seg);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = [];
  const grassA = new THREE.Color(0x7ccf5a), grassB = new THREE.Color(0x5fb648);
  const dirt = new THREE.Color(0xc9a15a), sand = new THREE.Color(0xe8d9a0), pondBed = new THREE.Color(0x6fa1a8);
  const stone = new THREE.Color(0xa7adb8), stoneDark = new THREE.Color(0x7d8594), dark = new THREE.Color(0x1b2a1a);
  const tmp = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    let y = terrainHeight(x, z);
    let c = Math.random() < 0.5 ? grassA : grassB;
    const pd = Math.hypot(x - WORLD.pond.x, z - WORLD.pond.z);
    const ad = Math.hypot(x - WORLD.arena.x, z - WORLD.arena.z);
    if (inHole(x, z)) { y = -6; c = dark; }
    else if (pd < WORLD.pond.r) c = pondBed;
    else if (pd < WORLD.pond.r + 2.5) c = sand;
    else if (ad < WORLD.arena.r) c = (Math.floor(x / 2) + Math.floor(z / 2)) % 2 === 0 ? stone : stoneDark;
    else if (distToPath(x, z) < 1.8 + Math.random() * 0.5) c = dirt;
    pos.setY(i, y);
    tmp.copy(c);
    colors.push(tmp.r, tmp.g, tmp.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const ground = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }));
  ground.receiveShadow = true;
  scene.add(ground);

  // 구멍 안쪽 어둠 + 표지판
  const holeDark = new THREE.Mesh(new THREE.CircleGeometry(WORLD.hole.r - 0.3, 32), new THREE.MeshBasicMaterial({ color: 0x1b2a1a }));
  holeDark.rotation.x = -Math.PI / 2;
  holeDark.position.set(WORLD.hole.x, -2.5, WORLD.hole.z);
  scene.add(holeDark);
  decor.add(makeSign('큰 구멍 조심!', WORLD.hole.x + 7.5, WORLD.hole.z + 3, -0.3));

  // ---------- 연못 ----------
  const water = new THREE.Mesh(
    new THREE.CircleGeometry(WORLD.pond.r + 1, 40),
    new THREE.MeshStandardMaterial({ color: 0x4fc3f7, transparent: true, opacity: 0.75, roughness: 0.2 })
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set(WORLD.pond.x, -0.3, WORLD.pond.z);
  scene.add(water);
  const padMat = new THREE.MeshStandardMaterial({ color: 0x3a9d3a });
  for (let i = 0; i < 8; i++) {
    const a = rand(0, Math.PI * 2), r = rand(2, WORLD.pond.r - 1);
    const pad = new THREE.Mesh(new THREE.CircleGeometry(rand(0.5, 0.9), 12, 0.3, Math.PI * 1.8), padMat);
    pad.rotation.x = -Math.PI / 2;
    pad.position.set(WORLD.pond.x + Math.cos(a) * r, -0.27, WORLD.pond.z + Math.sin(a) * r);
    decor.add(pad);
  }
  // 징검다리 (연못을 가로지름)
  const stoneMat = new THREE.MeshStandardMaterial({ color: 0x9aa3b5, roughness: 0.9 });
  for (let i = 0; i < 7; i++) {
    const t = (i + 0.5) / 7;
    const x = WORLD.pond.x - WORLD.pond.r + t * WORLD.pond.r * 2, z = WORLD.pond.z + Math.sin(t * Math.PI) * 2;
    const st = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.9, 0.5, 10), stoneMat);
    st.position.set(x, -0.15, z);
    st.castShadow = true;
    decor.add(st);
  }
  decor.add(makeSign('숫자 연못', WORLD.pond.x - WORLD.pond.r - 3, WORLD.pond.z - 4, 0.6));

  // ---------- 마을: 큰 숫자 나무 + 표지판 + 울타리 ----------
  const v = WORLD.village;
  const tree = new THREE.Group();
  const bigTrunk = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.3, 5, 12), new THREE.MeshStandardMaterial({ color: 0x8b5a2b }));
  bigTrunk.position.y = 2.5;
  bigTrunk.castShadow = true;
  tree.add(bigTrunk);
  const crownMain = new THREE.Mesh(new THREE.SphereGeometry(4, 16, 12), new THREE.MeshStandardMaterial({ color: 0x3f9d3a }));
  crownMain.position.y = 7;
  crownMain.castShadow = true;
  tree.add(crownMain);
  for (let n = 1; n <= 10; n++) { // 숫자 색 열매
    const fruit = new THREE.Mesh(new THREE.SphereGeometry(0.55, 12, 10), new THREE.MeshStandardMaterial({ color: NUMBER_COLORS[n].base, emissive: NUMBER_COLORS[n].base, emissiveIntensity: 0.25 }));
    const a = (n / 10) * Math.PI * 2;
    fruit.position.set(Math.cos(a) * 3.6, 6.5 + Math.sin(n * 1.7) * 1.6, Math.sin(a) * 3.6);
    tree.add(fruit);
  }
  tree.position.set(v.x, terrainHeight(v.x, v.z), v.z);
  decor.add(tree);
  decor.add(makeSign('← 보스 아레나', v.x - 4, v.z - 5, 0.4));
  decor.add(makeSign('연못 →', v.x + 4, v.z - 5, -0.4));
  decor.add(makeSign('↑ 큰 구멍 · 동굴', v.x, v.z - 8, 0));
  const fenceMat = new THREE.MeshStandardMaterial({ color: 0xd9b077 });
  for (let i = 0; i < 12; i++) { // 나무 주변 반원 울타리
    const a = Math.PI * 0.15 + (i / 11) * Math.PI * 0.7;
    const x = v.x + Math.cos(a) * 9, z = v.z + Math.sin(a) * 9;
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.25, 1.1, 0.25), fenceMat);
    post.position.set(x, terrainHeight(x, z) + 0.55, z);
    post.castShadow = true;
    decor.add(post);
    if (i < 11) {
      const a2 = Math.PI * 0.15 + ((i + 1) / 11) * Math.PI * 0.7;
      const x2 = v.x + Math.cos(a2) * 9, z2 = v.z + Math.sin(a2) * 9;
      const rail = new THREE.Mesh(new THREE.BoxGeometry(Math.hypot(x2 - x, z2 - z), 0.12, 0.12), fenceMat);
      rail.position.set((x + x2) / 2, terrainHeight((x + x2) / 2, (z + z2) / 2) + 0.8, (z + z2) / 2);
      rail.rotation.y = -Math.atan2(z2 - z, x2 - x);
      decor.add(rail);
    }
  }

  // ---------- 보스 아레나: 돌기둥 원 + 횃불 ----------
  const ar = WORLD.arena;
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const x = ar.x + Math.cos(a) * ar.r, z = ar.z + Math.sin(a) * ar.r;
    const pillar = new THREE.Mesh(new THREE.BoxGeometry(1.4, rand(2.6, 3.6), 1.4), stoneMat);
    pillar.position.set(x, terrainHeight(x, z) + pillar.geometry.parameters.height / 2, z);
    pillar.rotation.y = a;
    pillar.castShadow = true;
    decor.add(pillar);
    if (i % 2 === 0) {
      const flame = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.9, 8), new THREE.MeshStandardMaterial({ color: 0xff7f11, emissive: 0xff5500, emissiveIntensity: 1.2 }));
      flame.position.set(x, pillar.position.y + pillar.geometry.parameters.height / 2 + 0.5, z);
      flame.userData.flame = true;
      decor.add(flame);
      const light = new THREE.PointLight(0xff8833, 1.5, 12);
      light.position.copy(flame.position);
      decor.add(light);
    }
  }
  decor.add(makeSign('보스 아레나', ar.x + ar.r + 3, ar.z + 6, -0.8));

  // ---------- 북쪽 산 + 동굴 입구 (바위로 막힘) ----------
  const cv = WORLD.cave;
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x6f7a86, roughness: 1 });
  const mountain = new THREE.Group();
  for (const [dx, dz, r, h] of [[0, -2, 9, 7], [-8, -4, 7, 5], [9, -5, 6, 4.5], [0, -10, 8, 9]]) {
    const m = new THREE.Mesh(new THREE.ConeGeometry(r, h, 9), rockMat);
    m.position.set(dx, h / 2 - 0.5, dz);
    m.castShadow = true;
    mountain.add(m);
  }
  const arch = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 3, 16, 1, false, 0, Math.PI), new THREE.MeshBasicMaterial({ color: 0x0f1a14 }));
  arch.rotation.z = Math.PI / 2; arch.rotation.y = Math.PI / 2;
  arch.position.set(0, 1.6, 6.6);
  mountain.add(arch);
  mountain.position.set(cv.x, terrainHeight(cv.x, cv.z), cv.z);
  decor.add(mountain);
  const boulder = new THREE.Mesh(new THREE.DodecahedronGeometry(2.1, 1), new THREE.MeshStandardMaterial({ color: 0x8d97a3, roughness: 1 }));
  boulder.position.set(cv.x, terrainHeight(cv.x, cv.z + 7.5) + 1.6, cv.z + 7.5);
  boulder.castShadow = true;
  scene.add(boulder);
  decor.add(makeSign('괴물 동굴 (쿵쿵이를 친구로!)', cv.x + 5, cv.z + 10, -0.5));

  // ---------- 나무, 바위, 버섯, 풀숲, 꽃 ----------
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x8b5a2b });
  const leafMats = [0x3f9d3a, 0x4caf50, 0x2e8b57, 0x6ab04c].map((c) => new THREE.MeshStandardMaterial({ color: c }));
  const avoid = (x, z, extra = 0) =>
    Math.hypot(x, z - 8) < 6 || Math.hypot(x - v.x, z - v.z) < 11 || Math.hypot(x - WORLD.hole.x, z - WORLD.hole.z) < WORLD.hole.r + 4 ||
    Math.hypot(x - WORLD.pond.x, z - WORLD.pond.z) < WORLD.pond.r + 3 || Math.hypot(x - ar.x, z - ar.z) < ar.r + 3 ||
    Math.hypot(x - cv.x, z - cv.z) < 16 || distToPath(x, z) < 2.5 + extra;
  const treeSpots = [];
  while (treeSpots.length < 60) {
    const x = rand(-S / 2 + 4, S / 2 - 4), z = rand(-S / 2 + 4, S / 2 - 4);
    if (avoid(x, z, 1) || treeSpots.some(([tx, tz]) => Math.hypot(tx - x, tz - z) < 6)) continue;
    treeSpots.push([x, z]);
  }
  for (const [x, z] of treeSpots) {
    const t = new THREE.Group();
    const tall = Math.random() < 0.3;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.35, tall ? 2.6 : 1.6, 8), trunkMat);
    trunk.position.y = tall ? 1.3 : 0.8;
    const leaf = leafMats[Math.floor(Math.random() * leafMats.length)];
    if (tall) { // 침엽수
      for (let k = 0; k < 3; k++) {
        const cone = new THREE.Mesh(new THREE.ConeGeometry(1.6 - k * 0.4, 1.6, 8), leaf);
        cone.position.y = 2.4 + k * 1.0;
        cone.castShadow = true;
        t.add(cone);
      }
    } else {
      const crown = new THREE.Mesh(new THREE.SphereGeometry(1.4, 12, 10), leaf);
      crown.position.y = 2.2;
      const crown2 = new THREE.Mesh(new THREE.SphereGeometry(1.0, 12, 10), leaf);
      crown2.position.set(0.6, 2.8, 0.3);
      crown.castShadow = crown2.castShadow = true;
      t.add(crown, crown2);
    }
    trunk.castShadow = true;
    t.add(trunk);
    t.position.set(x, terrainHeight(x, z), z);
    decor.add(t);
    if (Math.random() < 0.5) { // 나무 밑 버섯
      const mush = new THREE.Group();
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.15, 0.35, 8), new THREE.MeshStandardMaterial({ color: 0xf3e9d2 }));
      stem.position.y = 0.17;
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: Math.random() < 0.5 ? 0xe8453c : 0xf2872f }));
      cap.position.y = 0.33;
      mush.add(stem, cap);
      const mx = x + rand(-1.5, 1.5), mz = z + rand(1, 2);
      mush.position.set(mx, terrainHeight(mx, mz), mz);
      decor.add(mush);
    }
  }
  for (let i = 0; i < 30; i++) { // 바위
    const x = rand(-S / 2 + 3, S / 2 - 3), z = rand(-S / 2 + 3, S / 2 - 3);
    if (avoid(x, z)) continue;
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(rand(0.4, 1.1), 0), rockMat);
    rock.position.set(x, terrainHeight(x, z) + 0.2, z);
    rock.rotation.set(rand(0, 3), rand(0, 3), 0);
    rock.castShadow = true;
    decor.add(rock);
  }
  const bushMat = new THREE.MeshStandardMaterial({ color: 0x4caf50 });
  const grassMat = new THREE.MeshStandardMaterial({ color: 0x3e9e3e, side: THREE.DoubleSide });
  const bladeTransforms = []; // 풀 블레이드는 한 번에 그린다 (InstancedMesh)
  const bushes = [];
  let placed = 0;
  while (placed < 28) {
    const x = rand(-S / 2 + 3, S / 2 - 3), z = rand(-S / 2 + 3, S / 2 - 3);
    if (avoid(x, z)) continue;
    placed++;
    if (Math.random() < 0.5) { // 둥근 덤불
      const b = new THREE.Group();
      for (let k = 0; k < 3; k++) {
        const s = new THREE.Mesh(new THREE.SphereGeometry(rand(0.5, 0.8), 10, 8), bushMat);
        s.position.set(rand(-0.5, 0.5), rand(0.2, 0.5), rand(-0.5, 0.5));
        s.castShadow = true;
        b.add(s);
      }
      b.position.set(x, terrainHeight(x, z), z);
      decor.add(b);
      bushes.push(b);
    } else { // 키 큰 풀숲 (몬스터가 숨는 곳)
      for (let k = 0; k < 14; k++) {
        const bx = x + rand(-1.4, 1.4), bz = z + rand(-1.4, 1.4), h = rand(0.8, 1.3);
        bladeTransforms.push([bx, terrainHeight(bx, bz) + h / 2, bz, h, rand(-0.2, 0.2)]);
      }
    }
  }
  {
    const inst = new THREE.InstancedMesh(new THREE.ConeGeometry(0.12, 1, 4), grassMat, bladeTransforms.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3(), pv = new THREE.Vector3();
    bladeTransforms.forEach(([bx, by, bz, h, tilt], i) => {
      e.set(0, 0, tilt); q.setFromEuler(e); sc.set(1, h, 1); pv.set(bx, by, bz);
      inst.setMatrixAt(i, m.compose(pv, q, sc));
    });
    decor.add(inst);
  }
  const petalColors = [0xff6b9d, 0xffd93d, 0xffffff, 0xff8c42, 0xb388ff, 0x4fc3f7];
  const stemMat = new THREE.MeshStandardMaterial({ color: 0x2e8b57 });
  const flowerSpots = [];
  for (let i = 0; i < 420; i++) {
    const x = rand(-S / 2 + 2, S / 2 - 2), z = rand(-S / 2 + 2, S / 2 - 2);
    if (inHole(x, z) || Math.hypot(x - WORLD.pond.x, z - WORLD.pond.z) < WORLD.pond.r + 2 || Math.hypot(x - ar.x, z - ar.z) < ar.r || distToPath(x, z) < 2) continue;
    flowerSpots.push([x, terrainHeight(x, z), z]);
  }
  {
    const stems = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.03, 0.03, 0.4, 5), stemMat, flowerSpots.length);
    const petals = new THREE.InstancedMesh(new THREE.SphereGeometry(0.12, 8, 6), new THREE.MeshStandardMaterial({ color: 0xffffff }), flowerSpots.length);
    const m = new THREE.Matrix4(), col = new THREE.Color();
    flowerSpots.forEach(([x, y, z], i) => {
      stems.setMatrixAt(i, m.makeTranslation(x, y + 0.2, z));
      petals.setMatrixAt(i, m.makeTranslation(x, y + 0.42, z));
      petals.setColorAt(i, col.set(petalColors[i % petalColors.length]));
    });
    decor.add(stems, petals);
  }

  // ---------- 구름, 나비 ----------
  const cloudMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.3 });
  for (let i = 0; i < 16; i++) {
    const c = new THREE.Group();
    for (let k = 0; k < 4; k++) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(rand(1, 2), 10, 8), cloudMat);
      s.position.set(k * 1.6, rand(-0.3, 0.3), rand(-0.5, 0.5));
      c.add(s);
    }
    c.position.set(rand(-70, 70), rand(14, 22), rand(-70, 40));
    decor.add(c);
  }
  const butterflies = [];
  for (let i = 0; i < 18; i++) {
    const b = new THREE.Group();
    const wingMat = new THREE.MeshStandardMaterial({ color: petalColors[i % petalColors.length], side: THREE.DoubleSide, emissive: petalColors[i % petalColors.length], emissiveIntensity: 0.3 });
    const wl = new THREE.Mesh(new THREE.PlaneGeometry(0.35, 0.28), wingMat);
    const wr = new THREE.Mesh(new THREE.PlaneGeometry(0.35, 0.28), wingMat);
    wl.position.x = -0.18; wr.position.x = 0.18;
    wl.rotation.x = wr.rotation.x = -Math.PI / 2;
    b.add(wl, wr);
    const cx = rand(-50, 50), cz = rand(-50, 50);
    b.userData = { cx, cz, r: rand(2, 6), t: rand(0, 10), speed: rand(0.3, 0.7), wl, wr };
    decor.add(b);
    butterflies.push(b);
  }
  const flames = [];
  decor.traverse((o) => { if (o.userData.flame) flames.push(o); });

  function animate(t) {
    for (const b of butterflies) {
      const u = b.userData;
      const a = t * u.speed + u.t;
      const x = u.cx + Math.cos(a) * u.r, z = u.cz + Math.sin(a * 1.3) * u.r;
      b.position.set(x, terrainHeight(x, z) + 1.2 + Math.sin(a * 3) * 0.3, z);
      const flap = Math.sin(t * 18 + u.t) * 0.9;
      u.wl.rotation.y = flap; u.wr.rotation.y = -flap;
      b.rotation.y = -a;
    }
    for (const f of flames) f.scale.y = 1 + Math.sin(t * 9 + f.position.x) * 0.2;
  }

  return { ground, bushes, sun, boulder, animate };
}
