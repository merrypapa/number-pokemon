import * as THREE from 'three';
import { rand } from './util.js';
import { NUMBER_COLORS, RAINBOW } from './palette.js';

// 챕터 1 숫자 초원 (120x120).
//  - 남쪽: 마을(큰 숫자 나무, 표지판), 시작 지점
//  - 동쪽: 연못(징검다리, 연잎)
//  - 북쪽: 큰 구멍, 산과 동굴 입구(바위로 막혀 있음)
//  - 서북쪽: 보스 아레나(돌기둥 원) — 쿵쿵이
//  - 흙길이 마을에서 각 장소로 이어진다.
export const WORLD = {
  size: 180,
  hills: [
    { x: -45, z: -27, r: 15, h: 2.6 },
    { x: 42, z: 15, r: 12, h: 2.0 },
    { x: 15, z: -48, r: 11, h: 3.0 },
    { x: -51, z: 39, r: 17, h: 1.8 },
    { x: 66, z: -48, r: 16, h: 2.4 },
    { x: -18, z: 69, r: 15, h: 2.0 },
    { x: 72, z: 66, r: 12, h: 1.6 },
    { x: 30, z: -78, r: 11, h: 2.2 },
    { x: 78, z: -78, r: 14, h: 2.4 },
    { x: -75, z: 66, r: 13, h: 2.0 },
    { x: 60, z: 80, r: 12, h: 1.8 },
    { x: -80, z: -3, r: 12, h: 2.2 },
    { x: 0, z: -84, r: 10, h: 1.6 },
  ],
  hole: { x: 0, z: -72, r: 7 },
  village: { x: 0, z: 45 }, // 시작 지점(0, 12) 뒤 카메라(z≈23)에 나무가 걸리지 않게 충분히 뒤로
  pond: { x: 51, z: 45, r: 11 },
  arena: { x: -66, z: -57, r: 12 },
  cave: { x: -27, z: -82 },
  // 흙길 (마을 → 구멍/동굴, 마을 → 연못, 마을 → 아레나)
  paths: [
    [[0, 33], [0, -9], [-3, -39], [0, -60]],
    [[0, 0], [21, 15], [39, 36]],
    [[0, -9], [-24, -21], [-45, -45], [-60, -54]],
    [[0, -60], [-14, -70], [-27, -74]],
  ],
};

// ---------- 다리 ----------
// 물(연못·호수)은 건널 수 없고, 다리 위로만 지나갈 수 있다. 다리는 양 끝(x1,z1)-(x2,z2)을 잇고 가운데가 rise 만큼 솟는다.
export function bridgeParam(b, x, z) {
  const vx = b.x2 - b.x1, vz = b.z2 - b.z1, len2 = vx * vx + vz * vz;
  const t = ((x - b.x1) * vx + (z - b.z1) * vz) / len2;
  const d = Math.hypot(x - (b.x1 + vx * t), z - (b.z1 + vz * t));
  return { t, d };
}
export function onBridge(b, x, z) { const { t, d } = bridgeParam(b, x, z); return t >= 0 && t <= 1 && d <= b.w; }
export function bridgeDeckY(b, t) { return 0.08 + b.rise * Math.sin(Math.max(0, Math.min(1, t)) * Math.PI); }
function bridgeHeightAt(bridges, x, z) {
  for (const b of bridges) { const { t, d } = bridgeParam(b, x, z); if (t >= 0 && t <= 1 && d <= b.w + 0.3) return bridgeDeckY(b, t); }
  return null;
}
/** 나무 다리 모델: 판자 + 양쪽 난간. 난간은 장애물로 obstacles 에 추가된다. */
export function buildBridge(b, obstacles, { plankColor = 0xb07a3c, railColor = 0x7a4d22 } = {}) {
  const g = new THREE.Group();
  const plankMat = new THREE.MeshStandardMaterial({ color: plankColor, roughness: 0.9 });
  const railMat = new THREE.MeshStandardMaterial({ color: railColor, roughness: 0.9 });
  const len = Math.hypot(b.x2 - b.x1, b.z2 - b.z1);
  const ang = Math.atan2(b.x2 - b.x1, b.z2 - b.z1); // 다리 방향 (z 축 기준 회전)
  const n = Math.max(6, Math.round(len / 0.9));
  const nx = Math.cos(ang), nz = -Math.sin(ang); // 다리 옆 방향
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const x = b.x1 + (b.x2 - b.x1) * t, z = b.z1 + (b.z2 - b.z1) * t;
    const plank = new THREE.Mesh(new THREE.BoxGeometry(b.w * 2 + 0.2, 0.14, len / n - 0.06), plankMat);
    plank.position.set(x, bridgeDeckY(b, t) - 0.07, z);
    const t2 = t + 0.01; // 판자의 앞(+z)을 다리 방향·아치 기울기에 맞춘다
    plank.lookAt(b.x1 + (b.x2 - b.x1) * t2, bridgeDeckY(b, t2) - 0.07, b.z1 + (b.z2 - b.z1) * t2);
    plank.castShadow = plank.receiveShadow = true;
    g.add(plank);
  }
  for (const side of [-1, 1]) {
    const px = nx * side * b.w, pz = nz * side * b.w;
    const posts = Math.max(3, Math.round(len / 2.4));
    let prev = null;
    for (let i = 0; i <= posts; i++) {
      const t = i / posts;
      const x = b.x1 + (b.x2 - b.x1) * t + px, z = b.z1 + (b.z2 - b.z1) * t + pz;
      const y = bridgeDeckY(b, t);
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.0, 0.16), railMat);
      post.position.set(x, y + 0.5, z);
      g.add(post);
      if (prev) {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, Math.hypot(x - prev.x, z - prev.z, y - prev.y)), railMat);
        rail.position.set((x + prev.x) / 2, (y + prev.y) / 2 + 0.9, (z + prev.z) / 2);
        rail.lookAt(x, y + 0.9, z);
        g.add(rail);
        obstacles.push({ ax: prev.x, az: prev.z, bx: x, bz: z, r: 0.12 });
      }
      prev = { x, y, z };
    }
  }
  return g;
}

// ---------- 활성 지형 (초원/동굴 등 지역이 바뀌면 main 이 교체) ----------
// player/creatures/numberblocks 는 terrainHeight/inHole/isBlocked/resolveObstacles 만 쓰므로 지역이 바뀌어도 코드가 같다.
//  - blocked(x,z): 물처럼 들어갈 수 없는 곳 (다리 위는 예외)
//  - obstacles: 나무·집·바위 같은 구조물. 원 {x,z,r} 또는 선분 {ax,az,bx,bz,r}. 캐릭터를 밖으로 밀어낸다.
let active = { height: meadowHeight, inHole: meadowInHole, size: WORLD.size };
export function setActiveTerrain(t) { active = t; }
export function terrainHeight(x, z) { return active.height(x, z); }
export function inHole(x, z) { return active.inHole(x, z); }
export function worldSize() { return active.size; }
export function isBlocked(x, z) { return active.blocked ? active.blocked(x, z) : false; }
export function insideObstacle(x, z, r = 0.4) { return (active.obstacles || []).some((o) => obstacleDist(o, x, z) < o.r + r); }
function obstacleDist(o, x, z) {
  if (o.ax === undefined) return Math.hypot(x - o.x, z - o.z);
  return distToSegment(x, z, o.ax, o.az, o.bx, o.bz);
}
function obstacleClosest(o, x, z, out) {
  if (o.ax === undefined) { out.x = o.x; out.z = o.z; return; }
  const vx = o.bx - o.ax, vz = o.bz - o.az;
  const t = Math.max(0, Math.min(1, ((x - o.ax) * vx + (z - o.az) * vz) / (vx * vx + vz * vz)));
  out.x = o.ax + vx * t; out.z = o.az + vz * t;
}
const _c = { x: 0, z: 0 };
/** 반지름 r 인 캐릭터(pos.x, pos.z)를 장애물 밖으로 밀어낸다. 밀렸으면 true. */
export function resolveObstacles(pos, r = 0.4) {
  let pushed = false;
  for (const o of active.obstacles || []) {
    const reach = o.r + r;
    if (Math.abs(pos.x - (o.x ?? (o.ax + o.bx) / 2)) > reach + 20) continue; // 멀리 있는 건 건너뜀 (선분은 넉넉히)
    obstacleClosest(o, pos.x, pos.z, _c);
    const dx = pos.x - _c.x, dz = pos.z - _c.z;
    const d = Math.hypot(dx, dz);
    if (d >= reach) continue;
    if (d < 1e-4) { pos.x += reach; continue; }
    pos.x = _c.x + (dx / d) * reach;
    pos.z = _c.z + (dz / d) * reach;
    pushed = true;
  }
  return pushed;
}

const MEADOW_BRIDGES = [{ x1: WORLD.pond.x - WORLD.pond.r - 2.5, z1: WORLD.pond.z, x2: WORLD.pond.x + WORLD.pond.r + 2.5, z2: WORLD.pond.z, w: 1.3, rise: 0.7 }];

export function meadowHeight(x, z) {
  let y = 0;
  for (const h of WORLD.hills) {
    const dx = x - h.x, dz = z - h.z;
    y += h.h * Math.exp(-(dx * dx + dz * dz) / (h.r * h.r));
  }
  // 연못은 얕게 파인다
  const pd = Math.hypot(x - WORLD.pond.x, z - WORLD.pond.z);
  if (pd < WORLD.pond.r + 2) y -= 0.9 * Math.min(1, (WORLD.pond.r + 2 - pd) / 3);
  const by = bridgeHeightAt(MEADOW_BRIDGES, x, z);
  return by === null ? y : Math.max(y, by);
}

export function meadowInHole(x, z) {
  const dx = x - WORLD.hole.x, dz = z - WORLD.hole.z;
  return dx * dx + dz * dz < WORLD.hole.r * WORLD.hole.r;
}
// 연못 물속은 못 들어간다 (다리 위는 예외)
export function meadowBlocked(x, z) {
  return Math.hypot(x - WORLD.pond.x, z - WORLD.pond.z) < WORLD.pond.r + 1 && !MEADOW_BRIDGES.some((b) => onBridge(b, x, z));
}
export const MEADOW_TERRAIN = { height: meadowHeight, inHole: meadowInHole, blocked: meadowBlocked, size: WORLD.size, obstacles: [] };

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
  g.position.set(x, meadowHeight(x, z), z);
  g.rotation.y = rotY;
  return g;
}

export function buildWorld(scene) {
  const S = WORLD.size;
  const decor = new THREE.Group();
  scene.add(decor);
  const obstacles = MEADOW_TERRAIN.obstacles;
  obstacles.length = 0;
  const block = (x, z, r) => obstacles.push({ x, z, r }); // 지나갈 수 없는 구조물

  // 하늘/안개/빛
  scene.background = new THREE.Color(0x8fd3ff);
  scene.fog = new THREE.Fog(0x8fd3ff, 80, 210);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x88aa55, 1.4));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(20, 30, 10);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -35, right: 35, top: 35, bottom: -35, near: 1, far: 120 });
  scene.add(sun, sun.target);

  // ---------- 지형 + 지역별 색 ----------
  const seg = 240;
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
    let y = meadowHeight(x, z);
    let c = Math.random() < 0.5 ? grassA : grassB;
    const pd = Math.hypot(x - WORLD.pond.x, z - WORLD.pond.z);
    const ad = Math.hypot(x - WORLD.arena.x, z - WORLD.arena.z);
    if (meadowInHole(x, z)) { y = -6; c = dark; }
    else if (pd < WORLD.pond.r) c = pondBed;
    else if (pd < WORLD.pond.r + 2.5) c = sand;
    else if (ad < WORLD.arena.r) c = (Math.floor(x / 2) + Math.floor(z / 2)) % 2 === 0 ? stone : stoneDark;
    else if (Math.hypot(x - WORLD.village.x, z - WORLD.village.z) < 7.5) c = (Math.floor(x / 1.5) + Math.floor(z / 1.5)) % 2 === 0 ? sand : dirt; // 마을 광장
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
  decor.add(makeSign('큰 구멍 조심!', WORLD.hole.x + 7.5, WORLD.hole.z + 3, -0.3)); block(WORLD.hole.x + 7.5, WORLD.hole.z + 3, 0.25);

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
  // 나무 다리 (연못을 가로지름) — 물은 다리로만 건널 수 있다
  const stoneMat = new THREE.MeshStandardMaterial({ color: 0x9aa3b5, roughness: 0.9 });
  for (const b of MEADOW_BRIDGES) scene.add(buildBridge(b, obstacles));
  decor.add(makeSign('숫자 연못 · 다리로 건너요', WORLD.pond.x - WORLD.pond.r - 3, WORLD.pond.z - 4, 0.6)); block(WORLD.pond.x - WORLD.pond.r - 3, WORLD.pond.z - 4, 0.25);

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
  tree.position.set(v.x, meadowHeight(v.x, v.z), v.z);
  decor.add(tree); block(v.x, v.z, 1.5);
  decor.add(makeSign('← 보스 아레나', v.x - 4, v.z - 5, 0.4)); block(v.x - 4, v.z - 5, 0.25);
  decor.add(makeSign('연못 →', v.x + 4, v.z - 5, -0.4)); block(v.x + 4, v.z - 5, 0.25);
  decor.add(makeSign('↑ 큰 구멍 · 동굴', v.x, v.z - 8, 0)); block(v.x, v.z - 8, 0.25);
  const fenceMat = new THREE.MeshStandardMaterial({ color: 0xd9b077 });
  for (let i = 0; i < 12; i++) { // 나무 주변 반원 울타리
    const a = Math.PI * 0.15 + (i / 11) * Math.PI * 0.7;
    const x = v.x + Math.cos(a) * 9, z = v.z + Math.sin(a) * 9;
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.25, 1.1, 0.25), fenceMat);
    post.position.set(x, meadowHeight(x, z) + 0.55, z);
    post.castShadow = true;
    decor.add(post); block(x, z, 0.25);
    if (i < 11) {
      const a2 = Math.PI * 0.15 + ((i + 1) / 11) * Math.PI * 0.7;
      const x2 = v.x + Math.cos(a2) * 9, z2 = v.z + Math.sin(a2) * 9;
      obstacles.push({ ax: x, az: z, bx: x2, bz: z2, r: 0.15 }); // 울타리 가로대
      const rail = new THREE.Mesh(new THREE.BoxGeometry(Math.hypot(x2 - x, z2 - z), 0.12, 0.12), fenceMat);
      rail.position.set((x + x2) / 2, meadowHeight((x + x2) / 2, (z + z2) / 2) + 0.8, (z + z2) / 2);
      rail.rotation.y = -Math.atan2(z2 - z, x2 - x);
      decor.add(rail);
    }
  }

  // ---------- 마을 구조물: 숫자 색 집, 우물, 놀이터, 가랜드, 가로등, 꽃밭 ----------
  const woodMat = new THREE.MeshStandardMaterial({ color: 0xa5713a });
  function house(number, x, z, rotY) {
    const g = new THREE.Group();
    const col = NUMBER_COLORS[number].base;
    const w = 3 + number * 0.25, h = 2.2 + number * 0.15;
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, 3), new THREE.MeshStandardMaterial({ color: 0xfff4dc }));
    body.position.y = h / 2;
    const roof = new THREE.Mesh(new THREE.ConeGeometry(w * 0.8, 1.6, 4), new THREE.MeshStandardMaterial({ color: col }));
    roof.position.y = h + 0.8; roof.rotation.y = Math.PI / 4;
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.3, 0.1), new THREE.MeshStandardMaterial({ color: NUMBER_COLORS[number].dark }));
    door.position.set(0, 0.65, 1.52);
    const win = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 0.1), new THREE.MeshStandardMaterial({ color: 0x9fe8ff, emissive: 0x4fc3f7, emissiveIntensity: 0.3 }));
    win.position.set(w * 0.3, h * 0.6, 1.52);
    const badge = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), new THREE.MeshBasicMaterial({ map: makeTextTexture(String(number)), transparent: true }));
    badge.position.set(-w * 0.3, h * 0.6, 1.53);
    body.castShadow = roof.castShadow = true;
    g.add(body, roof, door, win, badge);
    g.position.set(x, meadowHeight(x, z), z);
    g.rotation.y = rotY;
    block(x, z, w / 2 + 0.6);
    return g;
  }
  decor.add(house(1, v.x - 13, v.z - 4, 0.5), house(2, v.x + 13, v.z - 4, -0.5), house(3, v.x - 15, v.z + 8, 0.9), house(4, v.x + 15, v.z + 8, -0.9));
  // 우물
  {
    const g = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.2, 1, 12, 1, true), stoneMat);
    ring.position.y = 0.5;
    const waterTop = new THREE.Mesh(new THREE.CircleGeometry(1.0, 12), new THREE.MeshStandardMaterial({ color: 0x4fc3f7 }));
    waterTop.rotation.x = -Math.PI / 2; waterTop.position.y = 0.7;
    const postA = new THREE.Mesh(new THREE.BoxGeometry(0.15, 2.2, 0.15), woodMat); postA.position.set(-1.0, 1.1, 0);
    const postB = postA.clone(); postB.position.x = 1.0;
    const roofW = new THREE.Mesh(new THREE.ConeGeometry(1.7, 0.9, 4), new THREE.MeshStandardMaterial({ color: 0xe8453c }));
    roofW.position.y = 2.6; roofW.rotation.y = Math.PI / 4;
    const bucket = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.15, 0.3, 8), woodMat); bucket.position.y = 1.4;
    g.add(ring, waterTop, postA, postB, roofW, bucket);
    g.position.set(v.x + 7, meadowHeight(v.x + 7, v.z - 9), v.z - 9);
    decor.add(g); block(v.x + 7, v.z - 9, 1.4);
  }
  // 놀이터: 미끄럼틀 + 그네
  {
    const g = new THREE.Group();
    const ladder = new THREE.Mesh(new THREE.BoxGeometry(0.8, 2.2, 0.15), woodMat); ladder.position.set(-1.6, 1.1, 0);
    const top = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.15, 1.0), woodMat); top.position.set(-1.0, 2.2, 0);
    const slide = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.12, 3.6), new THREE.MeshStandardMaterial({ color: 0xffd93d }));
    slide.position.set(0.6, 1.2, 0); slide.rotation.z = Math.PI / 5.2;
    slide.rotation.y = 0; slide.rotation.set(0, 0, 0); slide.rotation.x = 0; slide.rotation.z = 0;
    slide.rotation.set(0, 0, -Math.PI / 5.2);
    slide.geometry = new THREE.BoxGeometry(3.4, 0.12, 0.9);
    const frameL = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.4, 0.12), new THREE.MeshStandardMaterial({ color: 0x3fb8e8 })); frameL.position.set(3.2, 1.2, -1.2);
    const frameR = frameL.clone(); frameR.position.z = 1.2;
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 2.6), new THREE.MeshStandardMaterial({ color: 0x3fb8e8 })); bar.position.set(3.2, 2.4, 0);
    const seatL = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.1, 0.3), new THREE.MeshStandardMaterial({ color: 0xe8453c })); seatL.position.set(3.2, 0.7, -0.5);
    const seatR = seatL.clone(); seatR.position.z = 0.5;
    const ropeMat = new THREE.MeshStandardMaterial({ color: 0x555555 });
    for (const sz of [-0.5, 0.5]) for (const sx of [-0.25, 0.25]) {
      const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.7, 5), ropeMat);
      rope.position.set(3.2 + sx, 1.55, sz);
      g.add(rope);
    }
    g.add(ladder, top, slide, frameL, frameR, bar, seatL, seatR);
    g.position.set(v.x - 8, meadowHeight(v.x - 8, v.z - 11), v.z - 11);
    g.rotation.y = 0.3;
    decor.add(g);
    for (const [lx, r] of [[-1.0, 1.5], [3.2, 1.4]]) block(g.position.x + Math.cos(0.3) * lx, g.position.z - Math.sin(0.3) * lx, r); // 미끄럼틀, 그네
  }
  // 가랜드 (만국기): 광장 둘레 기둥 사이 삼각 깃발
  {
    const posts = [];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const x = v.x + Math.cos(a) * 8, z = v.z + Math.sin(a) * 8;
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 3.2, 8), woodMat);
      post.position.set(x, meadowHeight(x, z) + 1.6, z);
      decor.add(post); block(x, z, 0.2);
      posts.push(new THREE.Vector3(x, meadowHeight(x, z) + 3.1, z));
    }
    const flagGeo = new THREE.PlaneGeometry(0.45, 0.6);
    for (let i = 0; i < posts.length; i++) {
      const a = posts[i], b = posts[(i + 1) % posts.length];
      for (let k = 1; k < 9; k++) {
        const t = k / 9;
        const pnt = a.clone().lerp(b, t);
        pnt.y -= Math.sin(t * Math.PI) * 0.6; // 늘어짐
        const flag = new THREE.Mesh(flagGeo, new THREE.MeshStandardMaterial({ color: RAINBOW[(i * 3 + k) % RAINBOW.length], side: THREE.DoubleSide }));
        flag.position.copy(pnt); flag.position.y -= 0.3;
        flag.lookAt(v.x, flag.position.y, v.z);
        decor.add(flag);
      }
    }
  }
  // 가로등 (마을 길가)
  for (const [x, z] of [[v.x - 3, v.z - 12], [v.x + 3, v.z - 12], [v.x - 3, v.z - 20], [v.x + 3, v.z - 20]]) {
    const g = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 2.8, 8), new THREE.MeshStandardMaterial({ color: 0x3a3f4a }));
    pole.position.y = 1.4;
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8), new THREE.MeshStandardMaterial({ color: 0xfff1b5, emissive: 0xffd36b, emissiveIntensity: 0.9 }));
    lamp.position.y = 2.95;
    g.add(pole, lamp);
    g.position.set(x, meadowHeight(x, z), z);
    decor.add(g); block(x, z, 0.2);
  }
  // 꽃밭 (마을 옆 둥근 꽃 무더기)
  const flowerBeds = [[v.x - 10, v.z - 16], [v.x + 10, v.z - 16]];

  // ---------- 보스 아레나: 돌기둥 원 + 횃불 ----------
  const ar = WORLD.arena;
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const x = ar.x + Math.cos(a) * ar.r, z = ar.z + Math.sin(a) * ar.r;
    const pillar = new THREE.Mesh(new THREE.BoxGeometry(1.4, rand(2.6, 3.6), 1.4), stoneMat);
    pillar.position.set(x, meadowHeight(x, z) + pillar.geometry.parameters.height / 2, z);
    pillar.rotation.y = a;
    pillar.castShadow = true;
    decor.add(pillar); block(x, z, 1.0);
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
  decor.add(makeSign('보스 아레나', ar.x + ar.r + 3, ar.z + 6, -0.8)); block(ar.x + ar.r + 3, ar.z + 6, 0.25);

  // ---------- 북쪽 산 + 동굴 입구 (바위로 막힘) ----------
  const cv = WORLD.cave;
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x6f7a86, roughness: 1 });
  const mountain = new THREE.Group();
  for (const [dx, dz, r, h] of [[0, -2, 9, 7], [-8, -4, 7, 5], [9, -5, 6, 4.5], [0, -10, 8, 9]]) {
    const m = new THREE.Mesh(new THREE.ConeGeometry(r, h, 9), rockMat);
    m.position.set(dx, h / 2 - 0.5, dz);
    m.castShadow = true;
    mountain.add(m);
    block(cv.x + dx, cv.z + dz, r * 0.72); // 산은 못 올라간다 (입구 앞은 비어 있음)
  }
  const arch = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 3, 16, 1, false, 0, Math.PI), new THREE.MeshBasicMaterial({ color: 0x0f1a14 }));
  arch.rotation.z = Math.PI / 2; arch.rotation.y = Math.PI / 2;
  arch.position.set(0, 1.6, 6.6);
  mountain.add(arch);
  mountain.position.set(cv.x, meadowHeight(cv.x, cv.z), cv.z);
  decor.add(mountain);
  const boulder = new THREE.Mesh(new THREE.DodecahedronGeometry(2.1, 1), new THREE.MeshStandardMaterial({ color: 0x8d97a3, roughness: 1 }));
  boulder.position.set(cv.x, meadowHeight(cv.x, cv.z + 7.5) + 1.6, cv.z + 7.5);
  boulder.castShadow = true;
  scene.add(boulder);
  const boulderObstacle = { x: cv.x, z: cv.z + 7.5, r: 2.2 }; // 쿵쿵이가 치우면 main 이 함께 뺀다
  obstacles.push(boulderObstacle);
  decor.add(makeSign('괴물 동굴 (쿵쿵이를 친구로!)', cv.x + 5, cv.z + 10, -0.5)); block(cv.x + 5, cv.z + 10, 0.25);

  // ---------- 나무, 바위, 버섯, 풀숲, 꽃 ----------
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x8b5a2b });
  const leafMats = [0x3f9d3a, 0x4caf50, 0x2e8b57, 0x6ab04c].map((c) => new THREE.MeshStandardMaterial({ color: c }));
  const avoid = (x, z, extra = 0) =>
    Math.hypot(x, z - 12) < 7 || Math.hypot(x - v.x, z - v.z) < 22 || Math.hypot(x - WORLD.hole.x, z - WORLD.hole.z) < WORLD.hole.r + 4 ||
    Math.hypot(x - WORLD.pond.x, z - WORLD.pond.z) < WORLD.pond.r + 3 || Math.hypot(x - ar.x, z - ar.z) < ar.r + 3 ||
    Math.hypot(x - cv.x, z - cv.z) < 16 || distToPath(x, z) < 2.5 + extra;
  const treeSpots = [];
  while (treeSpots.length < 130) {
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
    t.position.set(x, meadowHeight(x, z), z);
    decor.add(t); block(x, z, 0.55);
    if (Math.random() < 0.5) { // 나무 밑 버섯
      const mush = new THREE.Group();
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.15, 0.35, 8), new THREE.MeshStandardMaterial({ color: 0xf3e9d2 }));
      stem.position.y = 0.17;
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: Math.random() < 0.5 ? 0xe8453c : 0xf2872f }));
      cap.position.y = 0.33;
      mush.add(stem, cap);
      const mx = x + rand(-1.5, 1.5), mz = z + rand(1, 2);
      mush.position.set(mx, meadowHeight(mx, mz), mz);
      decor.add(mush);
    }
  }
  for (let i = 0; i < 65; i++) { // 바위
    const x = rand(-S / 2 + 3, S / 2 - 3), z = rand(-S / 2 + 3, S / 2 - 3);
    if (avoid(x, z)) continue;
    const rr = rand(0.4, 1.1);
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(rr, 0), rockMat);
    rock.position.set(x, meadowHeight(x, z) + 0.2, z);
    rock.rotation.set(rand(0, 3), rand(0, 3), 0);
    rock.castShadow = true;
    decor.add(rock); block(x, z, rr * 0.9);
  }
  const bushMat = new THREE.MeshStandardMaterial({ color: 0x4caf50 });
  const grassMat = new THREE.MeshStandardMaterial({ color: 0x3e9e3e, side: THREE.DoubleSide });
  const bladeTransforms = []; // 풀 블레이드는 한 번에 그린다 (InstancedMesh)
  const bushes = [];
  let placed = 0;
  while (placed < 60) {
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
      b.position.set(x, meadowHeight(x, z), z);
      decor.add(b); block(x, z, 1.0);
      bushes.push(b);
    } else { // 키 큰 풀숲 (몬스터가 숨는 곳)
      for (let k = 0; k < 14; k++) {
        const bx = x + rand(-1.4, 1.4), bz = z + rand(-1.4, 1.4), h = rand(0.8, 1.3);
        bladeTransforms.push([bx, meadowHeight(bx, bz) + h / 2, bz, h, rand(-0.2, 0.2)]);
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
  for (let i = 0; i < 900; i++) {
    const x = rand(-S / 2 + 2, S / 2 - 2), z = rand(-S / 2 + 2, S / 2 - 2);
    if (meadowInHole(x, z) || Math.hypot(x - WORLD.pond.x, z - WORLD.pond.z) < WORLD.pond.r + 2 || Math.hypot(x - ar.x, z - ar.z) < ar.r || distToPath(x, z) < 2) continue;
    flowerSpots.push([x, meadowHeight(x, z), z]);
  }
  for (const [bx, bz] of flowerBeds) for (let i = 0; i < 40; i++) {
    const a = rand(0, Math.PI * 2), r = rand(0, 2.6);
    const x = bx + Math.cos(a) * r, z = bz + Math.sin(a) * r;
    flowerSpots.push([x, meadowHeight(x, z), z]);
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
  for (let i = 0; i < 26; i++) {
    const c = new THREE.Group();
    for (let k = 0; k < 4; k++) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(rand(1, 2), 10, 8), cloudMat);
      s.position.set(k * 1.6, rand(-0.3, 0.3), rand(-0.5, 0.5));
      c.add(s);
    }
    c.position.set(rand(-100, 100), rand(14, 22), rand(-100, 60));
    decor.add(c);
  }
  const butterflies = [];
  for (let i = 0; i < 28; i++) {
    const b = new THREE.Group();
    const wingMat = new THREE.MeshStandardMaterial({ color: petalColors[i % petalColors.length], side: THREE.DoubleSide, emissive: petalColors[i % petalColors.length], emissiveIntensity: 0.3 });
    const wl = new THREE.Mesh(new THREE.PlaneGeometry(0.35, 0.28), wingMat);
    const wr = new THREE.Mesh(new THREE.PlaneGeometry(0.35, 0.28), wingMat);
    wl.position.x = -0.18; wr.position.x = 0.18;
    wl.rotation.x = wr.rotation.x = -Math.PI / 2;
    b.add(wl, wr);
    const cx = rand(-80, 80), cz = rand(-80, 80);
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
      b.position.set(x, meadowHeight(x, z) + 1.2 + Math.sin(a * 3) * 0.3, z);
      const flap = Math.sin(t * 18 + u.t) * 0.9;
      u.wl.rotation.y = flap; u.wr.rotation.y = -flap;
      b.rotation.y = -a;
    }
    for (const f of flames) f.scale.y = 1 + Math.sin(t * 9 + f.position.x) * 0.2;
  }

  return { ground, bushes, sun, boulder, boulderObstacle, animate, terrain: MEADOW_TERRAIN, decor };
}
