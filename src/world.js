import * as THREE from 'three';
import { rand } from './util.js';
import { NUMBER_COLORS, RAINBOW } from './palette.js';
import { makeNpc } from './npc.js';

// 챕터 1 숫자 초원 (120x120).
//  - 남쪽: 마을(큰 숫자 나무, 표지판), 시작 지점
//  - 동쪽: 연못(징검다리, 연잎)
//  - 북쪽: 큰 구멍, 산과 동굴 입구(바위로 막혀 있음)
//  - 서북쪽: 보스 아레나(돌기둥 원) — 쿵쿵이
//  - 흙길이 마을에서 각 장소로 이어진다.
export const WORLD = {
  size: 220,
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
    { x: -96, z: -60, r: 14, h: 2.6 },
    { x: 96, z: 20, r: 13, h: 2.0 },
    { x: -40, z: 96, r: 14, h: 1.8 },
    { x: 40, z: -100, r: 12, h: 2.2 },
    { x: -100, z: 90, r: 12, h: 1.6 },
  ],
  hole: { x: 0, z: -72, r: 7 },
  village: { x: 0, z: 45 }, // 시작 지점(0, 12) 뒤 카메라(z≈23)에 나무가 걸리지 않게 충분히 뒤로
  pond: { x: 51, z: 45, r: 11 },
  arena: { x: -66, z: -57, r: 12 },
  cave: { x: -27, z: -82 },
  volcanoGate: { x: 88, z: -70 },  // 불의산 입구 (붉은 바위산 아치)
  station: { x: -88, z: 42 },      // 기차역 (물의길로 가는 기차)
  rocketPad: { x: 82, z: 82 },     // 로켓 발사장 (꿈의우주로 가는 로켓)
  sleepSpot: { x: -96, z: -96, r: 4.5 }, // 북서쪽 구석, 잠만보가 자는 버섯 고리
  lab: { x: 0, z: 64 },            // 오박사 연구소 (마을 남쪽 가운데, 문은 북쪽)
  // 흙길 (마을 → 구멍/동굴, 마을 → 연못, 마을 → 아레나, 구멍 → 동굴 입구, 구멍 → 불의산 입구, 마을 → 기차역, 마을 → 로켓 발사장)
  paths: [
    [[0, 33], [0, -9], [-3, -39], [0, -60]],
    [[0, 0], [21, 15], [39, 36]],
    [[0, -9], [-24, -21], [-45, -45], [-60, -54]],
    [[0, -60], [-14, -70], [-27, -74]],
    [[0, -60], [40, -66], [84, -70]],
    [[88, -46], [88, -66]], // 불의산 입구 협곡 길
    [[-9, 45], [-50, 44], [-84, 42]],
    [[14, 52], [50, 70], [78, 80]],
    [[0, 50], [0, 58]], // 마을 광장 → 연구소 문
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
export function bridgeHeightAt(bridges, x, z) {
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
/** 이 지역의 수면 높이 (바다가 있는 지역만, 없으면 null) */
export function waterLevel() { return active.waterY ?? null; }
/** 배를 타고 갈 수 있는 물 위인가 (바다가 있는 지역만) */
export function canSail(x, z) { return active.sailable ? active.sailable(x, z) : false; }
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

// ---------- 지역 공용 헬퍼 (동굴·불의산·물의길·꿈의우주가 함께 쓴다) ----------
/** 글씨 텍스처 (표지판·포탈 안내판) */
/** 머리 위 이름표: 글자 폭에 맞춘 둥근 알약 + 아래 작은 꼬리 + 그림자. 캔버스 폭이 글자에 맞춰지므로 스프라이트 크기는 tex.userData.aspect(가로/세로)로 맞춘다 */
export function makePillTexture(text, { bg = 'rgba(255,255,255,.95)', fg = '#20232e', border = '#20232e', size = 60 } = {}) {
  const c = document.createElement('canvas');
  const measure = c.getContext('2d'); measure.font = `900 ${size}px sans-serif`;
  const w = Math.ceil(measure.measureText(text).width + 64), h = 96;
  c.width = w + 40; c.height = 160;
  const ctx = c.getContext('2d');
  ctx.font = `900 ${size}px sans-serif`;
  const cx = c.width / 2, x = cx - w / 2, y = 18, r = h / 2;
  const pill = () => {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.arc(x + w - r, y + r, r, -Math.PI / 2, Math.PI / 2);
    ctx.lineTo(x + r, y + h); ctx.arc(x + r, y + r, r, Math.PI / 2, Math.PI * 1.5); ctx.closePath();
  };
  ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.28)'; ctx.shadowBlur = 14; ctx.shadowOffsetY = 6;
  pill(); ctx.fillStyle = bg; ctx.fill(); ctx.restore();
  ctx.beginPath(); ctx.moveTo(cx - 16, y + h - 2); ctx.lineTo(cx + 16, y + h - 2); ctx.lineTo(cx, y + h + 22); ctx.closePath(); // 꼬리
  ctx.fillStyle = bg; ctx.fill();
  pill(); ctx.lineWidth = 5; ctx.strokeStyle = border; ctx.stroke();
  ctx.fillStyle = fg; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, cx, y + h / 2 + 3);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.userData.aspect = c.width / c.height;
  return tex;
}
/** 이름표 스프라이트: 세로 크기(height, 월드 단위)만 정하면 가로는 글자 폭에 맞춘다 */
export function makePillSprite(text, opts = {}, height = 0.45) {
  const map = makePillTexture(text, opts);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map, transparent: true, depthTest: false }));
  s.scale.set(height * map.userData.aspect, height, 1);
  return s;
}
export function makeLabelTexture(text, bg = '#f5deb3', fg = '#5a3a1a', size = 40) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 128;
  const ctx = c.getContext('2d');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, 512, 128);
  ctx.fillStyle = fg; ctx.font = `bold ${size}px sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, 256, 66);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
/**
 * 같은 모양 여러 개를 한 번에 그리는 InstancedMesh (드로우콜을 줄여 빠르다).
 * items: [{ x, y, z, rx, ry, rz, s | sx, sy, sz, color }]. color 를 쓰려면 material 색을 흰색으로 두고 인스턴스마다 색을 곱한다.
 */
export function makeInstanced(geometry, material, items, { shadow = false } = {}) {
  const mesh = new THREE.InstancedMesh(geometry, material, Math.max(1, items.length));
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), sc = new THREE.Vector3(), col = new THREE.Color();
  let colored = false;
  items.forEach((it, i) => {
    e.set(it.rx || 0, it.ry || 0, it.rz || 0); q.setFromEuler(e);
    p.set(it.x, it.y, it.z);
    sc.set(it.sx ?? it.s ?? 1, it.sy ?? it.s ?? 1, it.sz ?? it.s ?? 1);
    mesh.setMatrixAt(i, m.compose(p, q, sc));
    if (it.color !== undefined) { mesh.setColorAt(i, col.set(it.color)); colored = true; }
  });
  mesh.count = items.length;
  mesh.castShadow = shadow;
  mesh.frustumCulled = false; // 넓게 퍼져 있으므로 항상 그린다 (경계 계산 생략)
  if (colored && mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  return mesh;
}
export const WHITE_MAT = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 });
export const WHITE_MAT_DS = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, side: THREE.DoubleSide });

/** 정점 색이 있는 바닥 지형. colorFn(x, z, y) 은 THREE.Color 를 돌려준다. */
export function buildGround(scene, size, seg, heightFn, colorFn) {
  const geo = new THREE.PlaneGeometry(size, size, seg, seg);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = [];
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const y = heightFn(x, z);
    pos.setY(i, y);
    const c = colorFn(x, z, y);
    colors.push(c.r, c.g, c.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const ground = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }));
  ground.receiveShadow = true;
  scene.add(ground);
  return ground;
}
/** 다른 지역으로 가는 포탈: 빛나는 고리 + 도는 불빛 + 안내판. 돌려주는 animate(t) 를 매 프레임 불러 준다. */
export function makePortal(scene, x, y, z, { color = 0x66e0ff, label = '푸른숲으로 가는 포탈', labelBg = '#1f2a3a', labelFg = '#9fe8ff' } = {}) {
  const portal = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.6, 0.18, 12, 40), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.5 }));
  ring.position.y = 1.9;
  const disc = new THREE.Mesh(new THREE.CircleGeometry(1.45, 32), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.45, side: THREE.DoubleSide }));
  disc.position.y = 1.9;
  const light = new THREE.PointLight(color, 4, 14);
  light.position.y = 2;
  portal.add(ring, disc, light);
  const orbs = [];
  for (let i = 0; i < 8; i++) {
    const o = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    portal.add(o);
    orbs.push(o);
  }
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.8), new THREE.MeshBasicMaterial({ map: makeLabelTexture(label, labelBg, labelFg), transparent: true }));
  sign.position.set(0, 4.2, 0);
  portal.add(sign);
  portal.position.set(x, y, z);
  scene.add(portal);
  return {
    group: portal,
    animate(t) {
      ring.rotation.y = t * 0.6;
      disc.material.opacity = 0.35 + Math.sin(t * 3) * 0.12;
      orbs.forEach((o, i) => { const a = t * 1.5 + (i / orbs.length) * Math.PI * 2; o.position.set(Math.cos(a) * 2.1, 1.9 + Math.sin(a * 2) * 0.5, Math.sin(a) * 0.6); });
    },
  };
}
/** 지역별 안내 표지판 (나무 기둥 + 판) */
export function makeSignAt(text, x, y, z, rotY = 0, opts = {}) {
  const g = new THREE.Group();
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.5, 8), new THREE.MeshStandardMaterial({ color: opts.post || 0x8b5a2b }));
  post.position.y = 0.75;
  const board = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.9, 0.1), new THREE.MeshStandardMaterial({ color: opts.board || 0xf5deb3 }));
  board.position.y = 1.5;
  const face = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.9), new THREE.MeshBasicMaterial({ map: makeLabelTexture(text, opts.bg || '#f5deb3', opts.fg || '#5a3a1a', 44) }));
  face.position.set(0, 1.5, 0.06);
  post.castShadow = board.castShadow = true;
  g.add(post, board, face);
  g.position.set(x, y, z);
  g.rotation.y = rotY;
  return g;
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
  scene.fog = new THREE.Fog(0x8fd3ff, 90, 240);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x88aa55, 1.4));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(20, 30, 10);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1536, 1536);
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
  const fenceMat = new THREE.MeshStandardMaterial({ color: 0xd9b077 });
  for (let i = 0; i < 12; i++) { // 나무 주변 반원 울타리 (남쪽 가운데는 연구소로 가는 문으로 터 둔다)
    const a = Math.PI * 0.15 + (i / 11) * Math.PI * 0.7;
    const x = v.x + Math.cos(a) * 9, z = v.z + Math.sin(a) * 9;
    if (i === 5 || i === 6) continue;
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.25, 1.1, 0.25), fenceMat);
    post.position.set(x, meadowHeight(x, z) + 0.55, z);
    post.castShadow = true;
    decor.add(post); block(x, z, 0.25);
    if (i < 11 && i !== 4 && i !== 6) {
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
    g.userData = { solid: true, radius: w / 2 + 1.2, box: { hx: w / 2 + 0.6, hz: 2.2 } };
    return g;
  }
  decor.add(house(1, v.x - 13, v.z - 4, 0.5), house(2, v.x + 13, v.z - 4, -0.5), house(3, v.x - 15, v.z + 8, 0.9), house(4, v.x + 15, v.z + 8, -0.9));
  // 오박사 연구소: 마을 남쪽 가운데의 큰 흰 건물. 문(북쪽)으로 들어가면 main 이 연구소 내부(lab 지역)로 보낸다
  const lab = WORLD.lab;
  {
    const g = new THREE.Group();
    const W = 16, H = 6.5, D = 11;
    const wallMat = new THREE.MeshStandardMaterial({ color: 0xfaf6ea });
    const bandMat = new THREE.MeshStandardMaterial({ color: 0x3fb8e8 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(W, H, D), wallMat);
    body.position.y = H / 2;
    const band = new THREE.Mesh(new THREE.BoxGeometry(W + 0.1, 0.7, D + 0.1), bandMat);
    band.position.y = H - 0.9;
    const roof = new THREE.Mesh(new THREE.BoxGeometry(W + 1.2, 0.5, D + 1.2), new THREE.MeshStandardMaterial({ color: 0xe8453c }));
    roof.position.y = H + 0.25;
    const dome = new THREE.Mesh(new THREE.SphereGeometry(2.6, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x9fe8ff, transparent: true, opacity: 0.85 }));
    dome.position.set(-3.5, H + 0.5, 0);
    const dishPost = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 2.2, 8), new THREE.MeshStandardMaterial({ color: 0x777 }));
    dishPost.position.set(4.5, H + 1.6, -1);
    const dish = new THREE.Mesh(new THREE.SphereGeometry(1.5, 16, 10, 0, Math.PI * 2, 0, Math.PI / 3), new THREE.MeshStandardMaterial({ color: 0xdddddd, side: THREE.DoubleSide }));
    dish.position.set(4.5, H + 2.7, -1); dish.rotation.x = -Math.PI / 2.6;
    const door = new THREE.Mesh(new THREE.BoxGeometry(2.2, 2.8, 0.2), new THREE.MeshStandardMaterial({ color: 0x3a5f9b }));
    door.position.set(0, 1.4, -D / 2 - 0.05); // 문은 북쪽(마을 광장 쪽)
    const doorGlass = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.2, 0.05), new THREE.MeshStandardMaterial({ color: 0x9fe8ff, emissive: 0x4fc3f7, emissiveIntensity: 0.4 }));
    doorGlass.position.set(0, 1.9, -D / 2 - 0.2);
    const winMat = new THREE.MeshStandardMaterial({ color: 0x9fe8ff, emissive: 0x4fc3f7, emissiveIntensity: 0.35 });
    for (const wx of [-5.5, -3, 3, 5.5]) { const win = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.6, 0.1), winMat); win.position.set(wx, 3.6, -D / 2 - 0.05); g.add(win); }
    for (const wz of [-2.5, 2.5]) for (const side of [-1, 1]) { const win = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.6, 1.6), winMat); win.position.set(side * (W / 2 + 0.05), 3.6, wz); g.add(win); }
    const sign = makePillSprite('🏥 오박사 연구소', { bg: '#fffbe6', fg: '#20232e', border: '#3fb8e8' }, 1.6);
    sign.position.set(0, 5.4, -D / 2 - 0.4);
    const steps = new THREE.Mesh(new THREE.BoxGeometry(4, 0.3, 1.6), stoneMat);
    steps.position.set(0, 0.15, -D / 2 - 0.9);
    for (const o of [body, roof, dome, dish]) o.castShadow = true;
    g.add(body, band, roof, dome, dishPost, dish, door, doorGlass, sign, steps);
    g.position.set(lab.x, meadowHeight(lab.x, lab.z), lab.z);
    g.userData = { solid: true, radius: 9.5, box: { hx: 8.6, hz: 6.2 } }; // 카메라가 건물 안으로 못 들어가게 (main 의 시야 처리, 건물 모양 상자)
    decor.add(g);
    // 벽은 선분 장애물로 (원 여러 개로는 틈이 생겨 건물을 뚫고 들어가던 버그). 북쪽 벽은 문(폭 2.6) 자리만 비운다
    const hw = W / 2, hd = D / 2, wr = 0.5, doorHalf = 1.3;
    for (const [ax, az, bx, bz] of [[-hw, -hd, -doorHalf, -hd], [doorHalf, -hd, hw, -hd], [-hw, hd, hw, hd], [-hw, -hd, -hw, hd], [hw, -hd, hw, hd], [-doorHalf, -hd + 1.2, doorHalf, -hd + 1.2]]) {
      obstacles.push({ ax: lab.x + ax, az: lab.z + az, bx: lab.x + bx, bz: lab.z + bz, r: wr });
    }
    for (const [px, pz] of [[-4, -8.5], [4, -8.5]]) { // 문 앞 화분
      const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.4, 0.7, 10), new THREE.MeshStandardMaterial({ color: 0xc46b2c }));
      pot.position.set(lab.x + px, meadowHeight(lab.x + px, lab.z + pz) + 0.35, lab.z + pz);
      const bush = new THREE.Mesh(new THREE.SphereGeometry(0.7, 10, 8), new THREE.MeshStandardMaterial({ color: 0x3f9d3a }));
      bush.position.set(lab.x + px, pot.position.y + 0.8, lab.z + pz);
      decor.add(pot, bush); block(lab.x + px, lab.z + pz, 0.6);
    }
  }
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
    const flagItems = [];
    for (let i = 0; i < posts.length; i++) {
      const a = posts[i], b = posts[(i + 1) % posts.length];
      for (let k = 1; k < 9; k++) {
        const t = k / 9;
        const pnt = a.clone().lerp(b, t);
        pnt.y -= Math.sin(t * Math.PI) * 0.6 + 0.3; // 늘어짐
        flagItems.push({ x: pnt.x, y: pnt.y, z: pnt.z, ry: Math.atan2(v.x - pnt.x, v.z - pnt.z), color: RAINBOW[(i * 3 + k) % RAINBOW.length] });
      }
    }
    decor.add(makeInstanced(new THREE.PlaneGeometry(0.45, 0.6), WHITE_MAT_DS, flagItems));
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

  // ---------- 불의산 입구: 붉은 바위산 + 아치 + 용암 빛 (아치로 들어가면 main 이 불의산으로 보낸다) ----------
  const vg = WORLD.volcanoGate;
  {
    const redRock = new THREE.MeshStandardMaterial({ color: 0x8a3b2a, roughness: 1 });
    const g = new THREE.Group();
    for (const [dx, dz, r, h] of [[0, -6, 10, 9], [-9, -3, 7, 6], [9, -4, 7, 6.5], [0, -14, 9, 11]]) {
      const m = new THREE.Mesh(new THREE.ConeGeometry(r, h, 9), redRock);
      m.position.set(dx, h / 2 - 0.5, dz);
      m.castShadow = true;
      g.add(m);
      block(vg.x + dx, vg.z + dz, r * 0.72);
    }
    const arch = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, 3, 16, 1, false, 0, Math.PI), new THREE.MeshBasicMaterial({ color: 0x3a0f08 }));
    arch.rotation.z = Math.PI / 2; arch.rotation.y = Math.PI / 2;
    arch.position.set(0, 1.7, 3.6);
    g.add(arch);
    const glow = new THREE.PointLight(0xff5a1f, 6, 18);
    glow.position.set(0, 2.2, 5);
    g.add(glow);
    for (const sx of [-4.5, 4.5]) { // 아치 옆 작은 용암 웅덩이
      const lava = new THREE.Mesh(new THREE.CircleGeometry(1.3, 16), new THREE.MeshStandardMaterial({ color: 0xff6a1a, emissive: 0xff3300, emissiveIntensity: 1.2 }));
      lava.rotation.x = -Math.PI / 2; lava.position.set(sx, 0.03, 6.5);
      g.add(lava);
    }
    g.position.set(vg.x, meadowHeight(vg.x, vg.z), vg.z);
    g.userData = { solid: true, radius: 13 };
    decor.add(g);
    // 아치 앞으로 이어지는 협곡 길: 양옆에 붉은 바위 벽이 점점 높아지고, 횃불과 용암 줄기가 길을 안내한다
    const torchMat = new THREE.MeshStandardMaterial({ color: 0x4a2a1a });
    for (let i = 0; i < 6; i++) {
      const z = vg.z + 22 - i * 3.2, spread = 7.5 - i * 0.55, r = 2.2 + i * 0.35, h = 3 + i * 0.8;
      for (const side of [-1, 1]) {
        const x = vg.x + side * spread;
        const rock = new THREE.Mesh(new THREE.ConeGeometry(r, h, 7), redRock);
        rock.position.set(x, meadowHeight(x, z) + h / 2 - 0.4, z);
        rock.rotation.y = i * 0.7 + side;
        rock.castShadow = true;
        decor.add(rock); block(x, z, r * 0.7);
        if (i % 2 === 1) { // 횃불
          const tx = x - side * (r + 0.6);
          const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 1.8, 6), torchMat);
          post.position.set(tx, meadowHeight(tx, z) + 0.9, z);
          const flame = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.8, 8), new THREE.MeshStandardMaterial({ color: 0xff7f11, emissive: 0xff5500, emissiveIntensity: 1.2 }));
          flame.position.set(tx, meadowHeight(tx, z) + 2.15, z);
          flame.userData.flame = true;
          const light = new THREE.PointLight(0xff8833, 1.4, 10);
          light.position.copy(flame.position);
          decor.add(post, flame, light); block(tx, z, 0.15);
        }
      }
      // 길 가운데 용암 줄기 (빛나는 얇은 판)
      const crack = new THREE.Mesh(new THREE.PlaneGeometry(0.35, 2.4), new THREE.MeshStandardMaterial({ color: 0xff6a1a, emissive: 0xff3300, emissiveIntensity: 1.1 }));
      crack.rotation.x = -Math.PI / 2; crack.rotation.z = (i % 2 ? 0.25 : -0.25);
      crack.position.set(vg.x + (i % 2 ? 1.1 : -1.1), meadowHeight(vg.x, z) + 0.04, z);
      decor.add(crack);
    }
    // 아치 위 큰 간판 + 길 입구 팻말
    const banner = makePillSprite('🔥 불의산 입구', { bg: '#3a0f08', fg: '#ffb347', border: '#ff6a1a' }, 2.4);
    banner.position.set(vg.x, meadowHeight(vg.x, vg.z + 3.6) + 5.2, vg.z + 3.6);
    decor.add(banner);
  }

  // ---------- 기차역: 선로 + 플랫폼 지붕 + 기차 (가까이 가서 기차 타기 버튼을 누르면 main 이 기차를 움직여 물의길로 보낸다) ----------
  const st = WORLD.station;
  let train;
  {
    const y0 = meadowHeight(st.x, st.z);
    const railMat = new THREE.MeshStandardMaterial({ color: 0x555b66 });
    const tieMat = new THREE.MeshStandardMaterial({ color: 0x6b4a2b });
    for (const dz of [-0.7, 0.7]) { const rail = new THREE.Mesh(new THREE.BoxGeometry(70, 0.12, 0.14), railMat); rail.position.set(st.x - 8, y0 + 0.1, st.z + dz); decor.add(rail); }
    for (let i = 0; i < 46; i++) { const tie = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, 2.0), tieMat); tie.position.set(st.x - 42 + i * 1.5, y0 + 0.05, st.z); decor.add(tie); }
    const plat = new THREE.Mesh(new THREE.BoxGeometry(16, 0.2, 4), new THREE.MeshStandardMaterial({ color: 0xd9c9a8 }));
    plat.position.set(st.x, y0 + 0.1, st.z + 3.6);
    plat.userData.noHide = true; // 바닥은 숨기지 않는다
    decor.add(plat);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(16, 0.25, 4.4), new THREE.MeshStandardMaterial({ color: 0x3fb8e8 }));
    roof.position.set(st.x, y0 + 3.4, st.z + 3.6);
    roof.castShadow = true;
    roof.userData.radius = 9;   // 넓은 지붕이라 끝에 서도 시야를 가리면 잠시 숨는다
    decor.add(roof);
    const sign = makePillSprite('🚂 기차역', { bg: '#1f3a93', fg: '#ffffff', border: '#9fe8ff' }, 2.4); // 불의산 입구처럼 멀리서 보이는 둥근 표지판
    sign.position.set(st.x, y0 + 5.4, st.z + 3.6);
    decor.add(sign);
    for (const dx of [-7, 0, 7]) for (const dz of [1.9, 5.3]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 3.4, 8), woodMat);
      post.position.set(st.x + dx, y0 + 1.7, st.z + dz);
      decor.add(post); block(st.x + dx, st.z + dz, 0.2);
    }
    // 기차: 기관차 + 객차 2칸
    train = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0xe8453c });
    const carMat = new THREE.MeshStandardMaterial({ color: 0x3fb8e8 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x20232e });
    const engine = new THREE.Mesh(new THREE.BoxGeometry(5, 2.2, 2.2), bodyMat); engine.position.set(0, 1.5, 0); engine.castShadow = true;
    const cab = new THREE.Mesh(new THREE.BoxGeometry(2, 1.2, 2.2), bodyMat); cab.position.set(-1.2, 3.2, 0);
    const chimney = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.4, 1.2, 10), dark); chimney.position.set(1.6, 3.2, 0);
    const face = new THREE.Mesh(new THREE.CircleGeometry(0.6, 16), new THREE.MeshStandardMaterial({ color: 0xffd93d })); face.position.set(2.51, 1.6, 0); face.rotation.y = Math.PI / 2;
    train.add(engine, cab, chimney, face);
    const wheel = (x, r) => { const w = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 2.4, 12), dark); w.rotation.x = Math.PI / 2; w.position.set(x, r, 0); train.add(w); };
    wheel(-1.6, 0.5); wheel(1.6, 0.5);
    for (let i = 0; i < 2; i++) {
      const car = new THREE.Mesh(new THREE.BoxGeometry(5, 2, 2.2), carMat); car.position.set(-6 * (i + 1), 1.4, 0); car.castShadow = true; train.add(car);
      for (let k = 0; k < 3; k++) { const win = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.7, 2.3), new THREE.MeshStandardMaterial({ color: 0xdff6ff })); win.position.set(-6 * (i + 1) - 1.5 + k * 1.5, 1.7, 0); train.add(win); }
      wheel(-6 * (i + 1) - 1.6, 0.45); wheel(-6 * (i + 1) + 1.6, 0.45);
    }
    train.position.set(st.x + 2, y0, st.z);
    scene.add(train);
  }
  const trainObstacle = { ax: st.x - 13, az: st.z, bx: st.x + 5, bz: st.z, r: 1.6 };
  obstacles.push(trainObstacle);
  // 선장 리리: 이 사람과 이야기해야 기차를 탈 수 있다 (물의길 플랫폼에도 서 있다)
  const conductorAt = { x: st.x - 1, z: st.z + 4.2 };
  const conductor = makeNpc({ outfit: 'captain', name: '리리', model: '리리.glb' });
  conductor.position.set(conductorAt.x, terrainHeight(conductorAt.x, conductorAt.z), conductorAt.z);
  conductor.rotation.y = Math.PI;
  decor.add(conductor);
  obstacles.push({ x: conductorAt.x, z: conductorAt.z, r: 0.6 });

  // ---------- 로켓 발사장: 콘크리트 판 + 발사탑 + 로켓 (가까이 가서 로켓 타기 버튼을 누르면 main 이 로켓을 쏘아 꿈의우주로 보낸다) ----------
  const rp = WORLD.rocketPad;
  let rocket, rocketFlame;
  {
    const y0 = meadowHeight(rp.x, rp.z);
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(9, 9, 0.3, 32), new THREE.MeshStandardMaterial({ color: 0x9aa0a8 }));
    pad.position.set(rp.x, y0 + 0.15, rp.z);
    decor.add(pad);
    const ringMark = new THREE.Mesh(new THREE.RingGeometry(3, 3.5, 32), new THREE.MeshBasicMaterial({ color: 0xffd93d, side: THREE.DoubleSide }));
    ringMark.rotation.x = -Math.PI / 2; ringMark.position.set(rp.x, y0 + 0.31, rp.z);
    decor.add(ringMark);
    const tower = new THREE.Mesh(new THREE.BoxGeometry(1.2, 12, 1.2), new THREE.MeshStandardMaterial({ color: 0xc0392b }));
    tower.position.set(rp.x + 4, y0 + 6, rp.z);
    tower.castShadow = true;
    decor.add(tower); block(rp.x + 4, rp.z, 1.0);
    const sign = makePillSprite('🚀 로켓 발사장', { bg: '#1b1236', fg: '#ffd93d', border: '#c9b8ff' }, 2.4);
    sign.position.set(rp.x - 2, y0 + 8.5, rp.z + 10);
    decor.add(sign);
    for (let i = 1; i <= 4; i++) { const arm = new THREE.Mesh(new THREE.BoxGeometry(3, 0.2, 0.2), new THREE.MeshStandardMaterial({ color: 0x7f8c8d })); arm.position.set(rp.x + 2.3, y0 + i * 2.6, rp.z); decor.add(arm); }
    rocket = new THREE.Group();
    const white = new THREE.MeshStandardMaterial({ color: 0xf4f4f8, roughness: 0.4 });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 7, 20), white); body.position.y = 4.5; body.castShadow = true;
    const nose = new THREE.Mesh(new THREE.ConeGeometry(1.1, 2.2, 20), new THREE.MeshStandardMaterial({ color: 0xe8453c })); nose.position.y = 9.1;
    const win = new THREE.Mesh(new THREE.SphereGeometry(0.4, 12, 10), new THREE.MeshStandardMaterial({ color: 0x66e0ff, emissive: 0x2288aa, emissiveIntensity: 0.5 })); win.position.set(0, 6, 1.0);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(1.12, 1.12, 0.5, 20), new THREE.MeshStandardMaterial({ color: 0x3fb8e8 })); band.position.y = 2.5;
    rocket.add(body, nose, win, band);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      const fin = new THREE.Mesh(new THREE.BoxGeometry(0.2, 2.2, 1.6), new THREE.MeshStandardMaterial({ color: 0x3fb8e8 }));
      fin.position.set(Math.cos(a) * 1.4, 1.6, Math.sin(a) * 1.4);
      fin.rotation.y = -a;
      rocket.add(fin);
    }
    rocketFlame = new THREE.Mesh(new THREE.ConeGeometry(0.8, 2.5, 12), new THREE.MeshStandardMaterial({ color: 0xffb347, emissive: 0xff6a00, emissiveIntensity: 1.5, transparent: true, opacity: 0.9 }));
    rocketFlame.rotation.x = Math.PI; rocketFlame.position.y = -0.3; rocketFlame.visible = false;
    rocket.add(rocketFlame);
    rocket.position.set(rp.x, y0 + 0.3, rp.z);
    scene.add(rocket);
  }
  // 우주비행사 코리: 이 사람과 이야기해야 로켓을 탈 수 있다 (꿈의우주 착륙장에도 서 있다)
  const pilotAt = { x: rp.x - 4.6, z: rp.z + 4.6 };
  const pilot = makeNpc({ outfit: 'astronaut', name: '코리', model: '코리.glb' });
  pilot.position.set(pilotAt.x, terrainHeight(pilotAt.x, pilotAt.z), pilotAt.z);
  pilot.rotation.y = -2.3;
  decor.add(pilot);
  obstacles.push({ x: pilotAt.x, z: pilotAt.z, r: 0.6 });
  const rocketObstacle = { x: rp.x, z: rp.z, r: 1.6 };
  obstacles.push(rocketObstacle);

  // ---------- 나무, 바위, 버섯, 풀숲, 꽃 ----------
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x8b5a2b });
  const leafMats = [0x3f9d3a, 0x4caf50, 0x2e8b57, 0x6ab04c].map((c) => new THREE.MeshStandardMaterial({ color: c }));
  const avoid = (x, z, extra = 0) =>
    Math.hypot(x, z - 12) < 7 || Math.hypot(x - v.x, z - v.z) < 22 || Math.hypot(x - WORLD.hole.x, z - WORLD.hole.z) < WORLD.hole.r + 4 ||
    Math.hypot(x - WORLD.pond.x, z - WORLD.pond.z) < WORLD.pond.r + 3 || Math.hypot(x - ar.x, z - ar.z) < ar.r + 3 ||
    Math.hypot(x - cv.x, z - cv.z) < 16 || Math.hypot(x - WORLD.volcanoGate.x, z - WORLD.volcanoGate.z) < 16 ||
    Math.hypot(x - WORLD.station.x, z - WORLD.station.z) < 18 || Math.hypot(x - WORLD.rocketPad.x, z - WORLD.rocketPad.z) < 16 || distToPath(x, z) < 2.5 + extra;
  const treeSpots = [];
  while (treeSpots.length < 170) {
    const x = rand(-S / 2 + 4, S / 2 - 4), z = rand(-S / 2 + 4, S / 2 - 4);
    if (avoid(x, z, 1) || treeSpots.some(([tx, tz]) => Math.hypot(tx - x, tz - z) < 6)) continue;
    treeSpots.push([x, z]);
  }
  // 나무·버섯·바위는 인스턴스로 한 번에 그린다 (170그루를 따로 그리면 느리다)
  const leafColors = [0x3f9d3a, 0x4caf50, 0x2e8b57, 0x6ab04c];
  const trunkItems = [], crownItems = [], coneItems = [], stemItems = [], capItems = [];
  for (const [x, z] of treeSpots) {
    const tall = Math.random() < 0.3;
    const y = meadowHeight(x, z);
    const leaf = leafColors[Math.floor(Math.random() * leafColors.length)];
    trunkItems.push({ x, y: y + (tall ? 1.3 : 0.8), z, sy: tall ? 2.6 : 1.6 });
    if (tall) for (let k = 0; k < 3; k++) coneItems.push({ x, y: y + 2.4 + k, z, sx: (1.6 - k * 0.4) / 1.6, sz: (1.6 - k * 0.4) / 1.6, color: leaf }); // 침엽수
    else { crownItems.push({ x, y: y + 2.2, z, s: 1.4, color: leaf }); crownItems.push({ x: x + 0.6, y: y + 2.8, z: z + 0.3, s: 1.0, color: leaf }); }
    block(x, z, 0.55);
    if (Math.random() < 0.5) { // 나무 밑 버섯
      const mx = x + rand(-1.5, 1.5), mz = z + rand(1, 2), my = meadowHeight(mx, mz);
      stemItems.push({ x: mx, y: my + 0.17, z: mz });
      capItems.push({ x: mx, y: my + 0.33, z: mz, color: Math.random() < 0.5 ? 0xe8453c : 0xf2872f });
    }
  }
  decor.add(makeInstanced(new THREE.CylinderGeometry(0.25, 0.35, 1, 8), trunkMat, trunkItems, { shadow: true }));
  decor.add(makeInstanced(new THREE.SphereGeometry(1, 12, 10), WHITE_MAT, crownItems, { shadow: true }));
  decor.add(makeInstanced(new THREE.ConeGeometry(1.6, 1.6, 8), WHITE_MAT, coneItems, { shadow: true }));
  decor.add(makeInstanced(new THREE.CylinderGeometry(0.12, 0.15, 0.35, 8), new THREE.MeshStandardMaterial({ color: 0xf3e9d2 }), stemItems));
  decor.add(makeInstanced(new THREE.SphereGeometry(0.3, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2), WHITE_MAT, capItems));
  const rockItems = [];
  for (let i = 0; i < 80; i++) { // 바위
    const x = rand(-S / 2 + 3, S / 2 - 3), z = rand(-S / 2 + 3, S / 2 - 3);
    if (avoid(x, z)) continue;
    const rr = rand(0.4, 1.1);
    rockItems.push({ x, y: meadowHeight(x, z) + 0.2, z, s: rr, rx: rand(0, 3), ry: rand(0, 3) });
    block(x, z, rr * 0.9);
  }
  decor.add(makeInstanced(new THREE.DodecahedronGeometry(1, 0), rockMat, rockItems, { shadow: true }));
  const bushMat = new THREE.MeshStandardMaterial({ color: 0x4caf50 });
  const grassMat = new THREE.MeshStandardMaterial({ color: 0x3e9e3e, side: THREE.DoubleSide });
  const bladeTransforms = []; // 풀 블레이드는 한 번에 그린다 (InstancedMesh)
  const bushes = [];
  const bushItems = [];
  let placed = 0;
  while (placed < 75) {
    const x = rand(-S / 2 + 3, S / 2 - 3), z = rand(-S / 2 + 3, S / 2 - 3);
    if (avoid(x, z)) continue;
    placed++;
    if (Math.random() < 0.5) { // 둥근 덤불 (공 3개)
      const y = meadowHeight(x, z);
      for (let k = 0; k < 3; k++) bushItems.push({ x: x + rand(-0.5, 0.5), y: y + rand(0.2, 0.5), z: z + rand(-0.5, 0.5), s: rand(0.5, 0.8) });
      block(x, z, 1.0);
      bushes.push({ x, z });
    } else { // 키 큰 풀숲 (몬스터가 숨는 곳)
      for (let k = 0; k < 14; k++) {
        const bx = x + rand(-1.4, 1.4), bz = z + rand(-1.4, 1.4), h = rand(0.8, 1.3);
        bladeTransforms.push([bx, meadowHeight(bx, bz) + h / 2, bz, h, rand(-0.2, 0.2)]);
      }
    }
  }
  decor.add(makeInstanced(new THREE.SphereGeometry(1, 10, 8), bushMat, bushItems, { shadow: true }));
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
  for (let i = 0; i < 1200; i++) {
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
    const petals = new THREE.InstancedMesh(new THREE.SphereGeometry(0.12, 6, 4), new THREE.MeshStandardMaterial({ color: 0xffffff }), flowerSpots.length);
    const m = new THREE.Matrix4(), col = new THREE.Color();
    flowerSpots.forEach(([x, y, z], i) => {
      stems.setMatrixAt(i, m.makeTranslation(x, y + 0.2, z));
      petals.setMatrixAt(i, m.makeTranslation(x, y + 0.42, z));
      petals.setColorAt(i, col.set(petalColors[i % petalColors.length]));
    });
    decor.add(stems, petals);
  }

  // ---------- 북서쪽 구석: 잠만보가 자는 곳 (버섯 고리 + 낙엽 이불 + 팻말) ----------
  const sleep = WORLD.sleepSpot;
  {
    const y0 = meadowHeight(sleep.x, sleep.z);
    const bed = new THREE.Mesh(new THREE.CircleGeometry(sleep.r, 32), new THREE.MeshStandardMaterial({ color: 0xc9a86a, roughness: 1 }));
    bed.rotation.x = -Math.PI / 2; bed.position.set(sleep.x, y0 + 0.04, sleep.z);
    decor.add(bed);
    const capMat = new THREE.MeshStandardMaterial({ color: 0xe0503a }), stemMatB = new THREE.MeshStandardMaterial({ color: 0xf5eedc }), dotMat = new THREE.MeshStandardMaterial({ color: 0xffffff });
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2, r = sleep.r + 1.2;
      const x = sleep.x + Math.cos(a) * r, z = sleep.z + Math.sin(a) * r, h = 1.1 + (i % 3) * 0.35;
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, h, 10), stemMatB);
      stem.position.set(x, meadowHeight(x, z) + h / 2, z);
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.75, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), capMat);
      cap.position.y = h / 2; cap.scale.y = 0.65;
      stem.add(cap);
      for (let k = 0; k < 4; k++) { const dot = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 5), dotMat); const b = k * 1.7 + i; dot.position.set(Math.cos(b) * 0.45, h / 2 + 0.3, Math.sin(b) * 0.45); stem.add(dot); }
      stem.castShadow = cap.castShadow = true;
      decor.add(stem);
      block(x, z, 0.6);
    }
    for (let i = 0; i < 24; i++) { // 낙엽
      const a = rand(0, Math.PI * 2), r = rand(0, sleep.r - 0.5);
      const leaf = new THREE.Mesh(new THREE.CircleGeometry(0.28, 6), new THREE.MeshStandardMaterial({ color: [0xd98c3a, 0xc46b2c, 0xe6b04a][i % 3], side: THREE.DoubleSide }));
      leaf.rotation.x = -Math.PI / 2; leaf.rotation.z = a;
      leaf.position.set(sleep.x + Math.cos(a) * r, y0 + 0.07, sleep.z + Math.sin(a) * r);
      decor.add(leaf);
    }
  }

  // ---------- 숲지기 (지역 안내 NPC): 시작 지점 옆. 대화 버튼으로 이야기, 말하는 동안 연구소로 데려다준다 ----------
  const ranger = makeNpc({ outfit: 'ranger', name: '나미', model: '나미.glb' });
  ranger.position.set(4.5, meadowHeight(4.5, 15), 15);
  ranger.rotation.y = -0.6;
  decor.add(ranger); block(4.5, 15, 0.6);

  // ---------- 구름, 나비 ----------
  const cloudMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.3 });
  const cloudItems = [];
  for (let i = 0; i < 26; i++) {
    const cx = rand(-120, 120), cy = rand(14, 22), cz = rand(-120, 80);
    for (let k = 0; k < 4; k++) cloudItems.push({ x: cx + k * 1.6, y: cy + rand(-0.3, 0.3), z: cz + rand(-0.5, 0.5), s: rand(1, 2) });
  }
  decor.add(makeInstanced(new THREE.SphereGeometry(1, 10, 8), cloudMat, cloudItems));
  const butterflies = [];
  for (let i = 0; i < 28; i++) {
    const b = new THREE.Group();
    const wingMat = new THREE.MeshStandardMaterial({ color: petalColors[i % petalColors.length], side: THREE.DoubleSide, emissive: petalColors[i % petalColors.length], emissiveIntensity: 0.3 });
    const wl = new THREE.Mesh(new THREE.PlaneGeometry(0.35, 0.28), wingMat);
    const wr = new THREE.Mesh(new THREE.PlaneGeometry(0.35, 0.28), wingMat);
    wl.position.x = -0.18; wr.position.x = 0.18;
    wl.rotation.x = wr.rotation.x = -Math.PI / 2;
    b.add(wl, wr);
    const cx = rand(-100, 100), cz = rand(-100, 100);
    b.userData = { cx, cz, r: rand(2, 6), t: rand(0, 10), speed: rand(0.3, 0.7), wl, wr };
    decor.add(b);
    butterflies.push(b);
  }
  const flames = [];
  decor.traverse((o) => { if (o.userData.flame) flames.push(o); });

  function animate(t) {
    ranger.position.y = meadowHeight(4.5, 15) + Math.sin(t * 2) * 0.03;
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

  return {
    ground, bushes, sun, boulder, boulderObstacle, animate, terrain: MEADOW_TERRAIN, decor,
    spawn: { x: 0, z: 12 }, dark: false,
    // 몬스터 자리 (야생·보스), 블록 자리
    wildSpots: [[-30, 6], [15, 45], [-57, 21], [60, -60], [36, -21], [-21, 36], [60, 18], [-70, 55], [21, -6], [-39, 0], [45, 66], [70, -20], [-18, -39], [51, -39], [-60, 72], [30, 54], [-66, 48], [75, 40], [9, -33], [69, -66], [-30, -72], [-95, -30], [95, -20], [-40, 95], [30, 95], [-100, 70], [100, 50], [-96, -85], [50, -100]],
    bossSpot: { x: WORLD.arena.x, z: WORLD.arena.z },
    specialSpots: { sleepSpot: { x: WORLD.sleepSpot.x, z: WORLD.sleepSpot.z } }, // creatures.json 의 special 이름 → 자리
    pickupSpots: [[0, 5], [-6, 9], [9, -9], [-13, -3], [15, 12], [-3, -18], [21, -21], [-24, 6], [3, 24], [-18, 21], [33, 6], [-36, -12], [12, -36], [-12, 45], [30, 27], [-54, 15], [54, -9], [-30, -45], [-51, -42], [-18, -60], [45, -45], [-63, 6], [18, 60], [66, 30], [-72, 30], [72, -30], [-45, 66], [0, 72], [60, 60], [-60, -70], [30, -70], [78, 0], [-90, 10], [90, -40], [-30, 90], [40, 90], [-95, 95], [95, 95], [-80, -95], [0, -100]],
    // 다른 지역으로 가는 곳들
    volcanoGate: { x: vg.x, z: vg.z + 3.6 },
    labDoor: { x: lab.x, z: lab.z - 6.4 }, // 연구소 문 앞 (닿으면 main 이 연구소 내부로 보낸다)
    npcs: [{ x: 4.5, z: 15, mesh: ranger, name: '나미', warp: true, lines: (c) => [
      `안녕, ${c.name}! 난 푸른숲 안내원 나미야. 여기 포켓몬은 공격 ${c.zone.atkRange} 정도면 편하게 이길 수 있어.`,
      '하얀 블록을 줍거나 대결에서 이기면 블록이 생겨. 도감에서 블록으로 포켓몬을 키우자. 숫자블록 친구가 도와달라고 하면 문제를 풀어 주면 블록을 많이 줘!',
      '불 포켓몬은 풀에 세고, 물은 불에 세고, 풀은 물에 세. 전기는 물에 세지. 상대 속성을 보고 대표를 고르면 훨씬 쉬워!',
      c.conquered.forest ? '푸른숲 보스 이상해꽃은 이미 네 친구! 북쪽 산의 동굴 입구가 열렸어. 지하동굴에 가 보자.' : `서북쪽 돌기둥 아레나에 보스 이상해꽃이 있어. 공격 ${c.zone.targetAtk + 2} 이상, 체력 15쯤 되면 도전해 봐. 불 포켓몬이면 더 좋아!`,
      '북서쪽 구석 버섯 고리에는 잠만보가 자고 있어. 체력이 60이나 되니까 충분히 강해진 다음에 가 보렴.',
      '동북쪽 붉은 바위 협곡은 불의산, 서쪽 기차역은 물의길, 남동쪽 로켓은 꿈의우주로 가는 길이야. 마을 남쪽 큰 건물은 오박사 연구소!',
    ] }, { x: conductorAt.x, z: conductorAt.z, mesh: conductor, name: '리리', boards: 'train', lines: (c) => [
      `어서 오게, ${c.name}! 난 선장 리리야. 이 기차는 바다 마을 물의길로 간다네.`,
      '표는 필요 없어. 나한테 말을 걸고 아래 빨간 "출발" 버튼만 누르면 태워 주지!',
      '물의길에도 내가 있어. 돌아올 때는 그쪽 플랫폼에서 나를 찾아 말을 걸면 된단다.',
      '물의길은 물 포켓몬의 고장이야. 선착장에서 뱃사공 루피와 배를 타면 먼바다까지 나갈 수 있지!',
    ] }, { x: pilotAt.x, z: pilotAt.z, mesh: pilot, name: '코리', boards: 'rocket', lines: (c) => [
      `반가워, ${c.name}! 난 우주비행사 코리야. 이 로켓은 꿈의우주로 간다!`,
      '나한테 말을 걸고 빨간 "출발" 버튼을 누르면 카운트다운이야. 3, 2, 1!',
      '꿈의우주에도 내가 있어. 돌아올 때는 착륙장에서 나를 찾아 말을 걸면 돼.',
      '꿈의우주는 중력이 약해서 아주 높이 뛸 수 있어. 화면을 위로 밀면 태양과 행성들도 보인단다!',
    ] }],
    train: { kind: 'train', mesh: train, base: train.position.clone(), obstacle: trainObstacle, boardPoint: { x: st.x - 1, z: st.z + 3.2 }, dir: -1, to: 'sea' },
    rocket: { kind: 'rocket', mesh: rocket, base: rocket.position.clone(), obstacle: rocketObstacle, flame: rocketFlame, boardPoint: { x: rp.x - 2.4, z: rp.z + 2.4 }, to: 'space' },
    // 다른 지역에서 돌아올 때 도착하는 자리
    arrivals: { cave: { x: WORLD.village.x, z: WORLD.village.z - 18 }, volcano: { x: vg.x, z: vg.z + 10 }, sea: { x: st.x, z: st.z + 8 }, space: { x: rp.x - 7, z: rp.z + 9 }, lab: { x: lab.x, z: lab.z - 10, yaw: Math.PI } }, // 연구소에서 나오면 건물을 등지고 서고, 카메라는 건물 앞(북쪽)에서 본다
  };
}
