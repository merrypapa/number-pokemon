import * as THREE from 'three';
import { makeNpc } from './npc.js';
import { makeLabelTexture, makePillSprite, makeInstanced } from './world.js';
import { NUMBER_COLORS } from './palette.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// 지우네 집 = 오스트리아 할슈타트 호숫가의 알프스 통나무집(샬레). 마을에서 문으로 들어오는 아늑한 실내 지역 (몬스터·블록은 없다).
//  - 1층: 통나무 벽·천장 들보, 돌 벽난로(불꽃이 일렁인다), 빨간 제라늄 창가 화분, 뻐꾸기시계, 빨간 체크 식탁보 식탁, 책상, 부엌 찬장
//  - 다락방(2층, 높이 2.6m): 서쪽 벽을 따라 놓인 나무 계단(13칸, 한 칸 0.2m)으로 올라간다. 가장자리엔 난간이 있어 계단으로만 오르내린다
//    다락방 아래(부엌 앞)는 그 밑으로 걸어 다닐 수 있다 — 숲의 데크와 같은 "겹치는 층" 규칙 (지금 높이 + 0.7 보다 낮을 때만 발판)
//  - 엄마: 말을 걸면 포켓몬을 치료해 주고 집안 이야기를 해 준다
//  - 침대(다락방): 가까이 가서 "자기" 버튼 → 잠깐 눈을 감았다 뜨면 포켓몬이 모두 낫고 저장된다
//    (침대 자리 바로 아래 1층은 부엌 찬장이라 들어갈 수 없다 → 1층에서는 "자기" 버튼이 뜨지 않는다)
//  - 책상: 학교의 내 자리처럼 앉아서 숙제(과목 공부)를 할 수 있다 (main 이 world.mySeat 로 다룬다)
//  - 카메라: 벽·들보·다락방은 주인공과 카메라 사이를 가릴 때만 잠깐 숨긴다 (userData.cutaway, 인형의 집처럼 단면이 보인다)
export const HOME = { size: 30, room: { w: 20, d: 14 }, spawn: { x: 0, z: 4.4 }, door: { x: 0, z: 7.6 } };
const R = HOME.room, HW = R.w / 2, HD = R.d / 2, IN = 0.6; // 벽 안쪽으로 0.6m 까지 걸을 수 있다
const WH = 5.6;                                              // 통나무 벽 높이 (북쪽 박공은 9m 까지)
export const LOFT = { x1: -3.6, z1: 0.6, y: 2.6 };            // 다락방: x < -3.6, z < 0.6 (서북쪽), 바닥 높이 2.6m
export const STAIR = { x1: -7.8, zTop: 0.6, zBot: 5.0, n: 13 }; // 계단: 서쪽 벽을 따라 남(아래) → 북(위), x < -7.8
const PANTRY = { x1: -4.6, z1: -2.4 };                        // 다락방 아래 북쪽: 부엌 찬장·광 (1층에서는 못 들어간다)
const RAIL_Y = LOFT.y - 0.9;                                  // 이 높이보다 위에 있으면 다락방 난간이 막는다 (보통 점프 1.2m 로는 안 닿는다)
const inDoorway = (x, z) => Math.abs(x) < 1.2 && z > HD - IN;
const onLoft = (x, z) => x < LOFT.x1 && z < LOFT.z1;
function stairH(x, z) { // 계단 칸 높이 (단단한 지형: 늘 지형으로 친다, 계단 밑은 막힌 나무 상자)
  if (x >= STAIR.x1 || z < STAIR.zTop || z > STAIR.zBot) return null;
  const run = (STAIR.zBot - STAIR.zTop) / STAIR.n, k = Math.min(STAIR.n, Math.max(1, Math.ceil((STAIR.zBot - z) / run - 1e-6)));
  return LOFT.y * k / STAIR.n;
}
// 층이 정해진 막힘: 1층 다락방 밑 가구(lowBlocks)는 1층에서만, 다락방 가구는 다락방에서만 막는다 (obstacles 는 층과 상관없이 막아서 따로 둔다)
const lowBlocks = [], loftBlocks = [];
const hitBlock = (list, x, z) => list.some((b) => (b.r != null ? Math.hypot(x - b.x, z - b.z) < b.r : x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1));
export const HOME_TERRAIN = {
  inHole: () => false, size: HOME.size, obstacles: [], ledge: 0.9,
  height: (x, z, refY) => {
    const s = stairH(x, z); if (s != null) return s;
    if (onLoft(x, z) && LOFT.y <= (refY ?? 0) + 0.7) return LOFT.y; // 다락방 바닥: 가까이 올라왔을 때만 (밑으로는 걸어 다닌다)
    return 0;
  },
  blocked: (x, z, refY) => {
    if (!inDoorway(x, z) && (Math.abs(x) > HW - IN || Math.abs(z) > HD - IN)) return true; // 바깥 벽
    const y = refY ?? 0;
    if (y > RAIL_Y) return (!onLoft(x, z) && stairH(x, z) == null) || hitBlock(loftBlocks, x, z); // 다락방 난간 (계단 쪽만 열려 있다)
    if (x < PANTRY.x1 && z < PANTRY.z1) return true;                                             // 부엌 찬장·광 (침대 바로 아래)
    return hitBlock(lowBlocks, x, z);
  },
  // 다락방 아래로 카메라를 누르면 카메라가 통나무 벽 밖으로 나가 버린다 → 누르지 않고 대신 다락방을 잠깐 숨긴다 (cutaway)
  ceiling: () => Infinity,
};

// 선분(a → b)이 상자(x0..x1, y0..y1, z0..z1)를 지나는가 (slab 방식)
function segHitsBox(a, b, B) {
  let t0 = 0, t1 = 1;
  for (const k of ['x', 'y', 'z']) {
    const d = b[k] - a[k], lo = B[k + '0'], hi = B[k + '1'];
    if (Math.abs(d) < 1e-9) { if (a[k] < lo || a[k] > hi) return false; continue; }
    let u = (lo - a[k]) / d, v = (hi - a[k]) / d; if (u > v) [u, v] = [v, u];
    t0 = Math.max(t0, u); t1 = Math.min(t1, v); if (t0 > t1) return false;
  }
  return true;
}

// 묶음 안의 움직이지 않는 부품을 한 덩어리로 합친다 (그리기 횟수를 줄인다). userData.live 가 붙은 것(불꽃·시계추)은 따로 합친다.
// 그림(map)이 없는 보통 색 재료는 색을 꼭짓점 색으로 옮겨 거칠기(roughness)가 같은 것끼리 한 덩어리 → 묶음마다 몇 번만 그린다
const VC_MATS = new Map();
const vcMat = (rough) => { if (!VC_MATS.has(rough)) VC_MATS.set(rough, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: rough })); return VC_MATS.get(rough); };
function bake(g) {
  g.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(g.matrixWorld).invert(), rel = new THREE.Matrix4(), buckets = new Map(), drop = [];
  const walk = (o) => {
    for (const c of o.children) {
      if (c.userData.live) { bake(c); continue; }
      if (c.isMesh && !c.isInstancedMesh && !c.isSkinnedMesh) {
        const geo = c.geometry.index ? c.geometry.toNonIndexed() : c.geometry.clone();
        for (const k of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv'].includes(k)) geo.deleteAttribute(k);
        if (!geo.attributes.uv) geo.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
        geo.applyMatrix4(rel.multiplyMatrices(inv, c.matrixWorld));
        const m = c.material, plain = m.isMeshStandardMaterial && !m.map && !m.vertexColors && !m.transparent && m.side === THREE.FrontSide && m.metalness === 0 && m.emissive.getHex() === 0;
        const key = plain ? 'vc' + m.roughness : m;
        if (plain) { const n = geo.attributes.position.count, col = new Float32Array(n * 3); for (let i = 0; i < n; i++) col.set([m.color.r, m.color.g, m.color.b], i * 3); geo.setAttribute('color', new THREE.BufferAttribute(col, 3)); }
        const b = buckets.get(key) || { geos: [], shadow: false, mat: plain ? vcMat(m.roughness) : m }; b.geos.push(geo); b.shadow ||= c.castShadow; buckets.set(key, b);
        drop.push(c);
      }
      if (!c.userData.live) walk(c);
    }
  };
  walk(g);
  for (const c of drop) c.parent.remove(c);
  for (const b of buckets.values()) { const m = new THREE.Mesh(b.geos.length > 1 ? mergeGeometries(b.geos) : b.geos[0], b.mat); m.castShadow = b.shadow; m.receiveShadow = true; g.add(m); }
}
// 묶음을 (x, z) 중심으로 옮긴다: 카메라가 숨길지 정할 때 묶음의 자리(position)와 반지름(userData.radius)을 본다
function recenter(g, x, z) { for (const c of g.children) { c.position.x -= x; c.position.z -= z; } g.position.set(x, 0, z); }

// ---------- 캔버스 무늬 (그림 파일 없이) ----------
function canvasTex(w, h, draw, rx = 1, ry = 1) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry); t.anisotropy = 4;
  return t;
}
const logDraw = (g, w, h) => { // 가로로 쌓은 통나무: 한 줄마다 색이 조금씩 다르고, 사이에 어두운 틈
  const rows = 4, rh = h / rows;
  for (let i = 0; i < rows; i++) {
    const y = i * rh, grd = g.createLinearGradient(0, y, 0, y + rh), base = ['#b5793f', '#a86d36', '#bd8247', '#ad723b'][i];
    grd.addColorStop(0, '#6e4520'); grd.addColorStop(0.12, base); grd.addColorStop(0.55, '#c98f52'); grd.addColorStop(0.9, base); grd.addColorStop(1, '#5a3818');
    g.fillStyle = grd; g.fillRect(0, y, w, rh);
    g.strokeStyle = 'rgba(90,55,25,.35)'; g.lineWidth = 2;
    for (let k = 0; k < 5; k++) { const yy = y + rh * (0.3 + 0.1 * k); g.beginPath(); g.moveTo(0, yy); g.bezierCurveTo(w * 0.3, yy + 3, w * 0.6, yy - 3, w, yy); g.stroke(); } // 나뭇결
    const kx = (i * 173) % w; g.fillStyle = 'rgba(80,45,15,.55)'; g.beginPath(); g.ellipse(kx, y + rh / 2, 10, 6, 0, 0, Math.PI * 2); g.fill(); // 옹이
  }
};
const stoneDraw = (g, w, h) => { // 둥근 돌을 쌓은 벽난로
  g.fillStyle = '#5b5650'; g.fillRect(0, 0, w, h);
  const cols = ['#9a948a', '#a8a196', '#8b857c', '#b3ab9e', '#7f7a72'];
  for (let row = 0; row < 6; row++) for (let k = 0; k < 5; k++) {
    const x = (k + (row % 2) * 0.5) * (w / 5), y = row * (h / 6) + h / 12;
    g.fillStyle = cols[(row * 3 + k) % 5]; g.beginPath(); g.ellipse(x, y, w / 11, h / 15, ((row + k) % 3 - 1) * 0.2, 0, Math.PI * 2); g.fill();
  }
};
const checkDraw = (g, w, h) => { // 빨강·하양 체크 식탁보
  g.fillStyle = '#fff6ee'; g.fillRect(0, 0, w, h);
  const n = 8, s = w / n; g.fillStyle = 'rgba(214,40,40,.55)';
  for (let i = 0; i < n; i++) { if (i % 2) continue; g.fillRect(i * s, 0, s, h); g.fillRect(0, i * s, w, s); }
};
const viewDraw = (g, w, h) => { // 창밖: 할슈타트 호수와 눈 덮인 알프스, 호숫가 집들
  const sky = g.createLinearGradient(0, 0, 0, h * 0.6); sky.addColorStop(0, '#7cc4f0'); sky.addColorStop(1, '#d9f0ff');
  g.fillStyle = sky; g.fillRect(0, 0, w, h);
  g.fillStyle = '#6f8a96'; g.beginPath(); g.moveTo(0, h * 0.62); g.lineTo(w * 0.18, h * 0.22); g.lineTo(w * 0.42, h * 0.5); g.lineTo(w * 0.62, h * 0.14); g.lineTo(w * 0.86, h * 0.42); g.lineTo(w, h * 0.3); g.lineTo(w, h * 0.62); g.fill();
  g.fillStyle = '#ffffff'; for (const [px, py] of [[0.18, 0.22], [0.62, 0.14]]) { g.beginPath(); g.moveTo(w * px, h * py); g.lineTo(w * (px - 0.07), h * (py + 0.12)); g.lineTo(w * (px + 0.07), h * (py + 0.12)); g.fill(); }
  g.fillStyle = '#3f7a4a'; g.fillRect(0, h * 0.58, w, h * 0.08);
  for (let i = 0; i < 6; i++) { g.fillStyle = ['#f4e3c1', '#ffffff', '#f2c6a0', '#e9e0d0', '#ffe9b0', '#f7d9c4'][i]; const x = w * (0.08 + i * 0.15); g.fillRect(x, h * 0.53, w * 0.07, h * 0.07); g.fillStyle = '#7a3b22'; g.beginPath(); g.moveTo(x - 3, h * 0.53); g.lineTo(x + w * 0.035, h * 0.47); g.lineTo(x + w * 0.07 + 3, h * 0.53); g.fill(); }
  const lake = g.createLinearGradient(0, h * 0.64, 0, h); lake.addColorStop(0, '#3d8fb8'); lake.addColorStop(1, '#1f5f86');
  g.fillStyle = lake; g.fillRect(0, h * 0.64, w, h * 0.36);
  g.strokeStyle = 'rgba(255,255,255,.45)'; g.lineWidth = 2; for (let i = 0; i < 5; i++) { const y = h * (0.72 + i * 0.06); g.beginPath(); g.moveTo(w * 0.1 * i, y); g.lineTo(w * (0.1 * i + 0.25), y); g.stroke(); }
};
const tileDraw = (g, w, h) => { // 부엌 벽 하늘색 꽃 타일
  g.fillStyle = '#f4f8fb'; g.fillRect(0, 0, w, h);
  g.strokeStyle = '#b7c6d6'; g.lineWidth = 3; g.strokeRect(1, 1, w - 2, h - 2);
  g.fillStyle = '#3d74b8'; for (let a = 0; a < 4; a++) { g.beginPath(); g.ellipse(w / 2 + Math.cos(a * Math.PI / 2) * w * 0.14, h / 2 + Math.sin(a * Math.PI / 2) * h * 0.14, w * 0.1, h * 0.06, a * Math.PI / 2, 0, Math.PI * 2); g.fill(); }
  g.fillStyle = '#ffd93d'; g.beginPath(); g.arc(w / 2, h / 2, w * 0.06, 0, Math.PI * 2); g.fill();
};
const paintedDraw = (g, w, h) => { // 알프스 시골 찬장: 초록 바탕에 빨강·하양 꽃 그림
  g.fillStyle = '#3f6e5a'; g.fillRect(0, 0, w, h);
  g.strokeStyle = '#e9d8a6'; g.lineWidth = 8; g.strokeRect(14, 14, w - 28, h - 28);
  const flower = (x, y, r, c) => { g.fillStyle = c; for (let a = 0; a < 5; a++) { g.beginPath(); g.arc(x + Math.cos(a * 1.257) * r, y + Math.sin(a * 1.257) * r, r * 0.7, 0, Math.PI * 2); g.fill(); } g.fillStyle = '#ffd93d'; g.beginPath(); g.arc(x, y, r * 0.5, 0, Math.PI * 2); g.fill(); };
  g.strokeStyle = '#8fbf6a'; g.lineWidth = 5; g.beginPath(); g.moveTo(w / 2, h * 0.85); g.bezierCurveTo(w * 0.2, h * 0.6, w * 0.8, h * 0.4, w / 2, h * 0.2); g.stroke();
  flower(w / 2, h * 0.22, 18, '#d63a3a'); flower(w * 0.3, h * 0.5, 14, '#ffffff'); flower(w * 0.7, h * 0.58, 14, '#d63a3a'); flower(w / 2, h * 0.8, 12, '#ffffff');
};

export function buildHome(scene) {
  const decor = new THREE.Group();
  scene.add(decor);
  const obstacles = HOME_TERRAIN.obstacles;
  obstacles.length = 0; lowBlocks.length = 0; loftBlocks.length = 0;
  const block = (x, z, r) => obstacles.push({ x, z, r });

  // 지금 화면을 그리는 카메라 (바닥이 그려질 때마다 받아 둔다) → 주인공과 카메라 사이를 가리는 벽·다락방만 숨긴다
  let camRef = null;
  const hides = (head, B) => !!camRef && (segHitsBox(head, camRef.position, B) || segHitsBox({ x: head.x, y: head.y - 0.6, z: head.z }, camRef.position, B));

  scene.background = new THREE.Color(0x1c2233);
  scene.add(new THREE.HemisphereLight(0xfff0d8, 0x8a6a48, 1.25));
  const sun = new THREE.DirectionalLight(0xffe2b8, 0.85);
  sun.position.set(6, 14, 4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -14, right: 14, top: 14, bottom: -14, near: 1, far: 40 });
  scene.add(sun, sun.target);

  // ----- 재료 -----
  const matCache = new Map();
  const std = (o) => { // 같은 색 재료는 하나만 만든다 (합칠 때 한 덩어리가 된다)
    const key = o.map ? null : JSON.stringify(o);
    if (key && matCache.has(key)) return matCache.get(key);
    const m = new THREE.MeshStandardMaterial({ roughness: 0.85, ...o }); if (key) matCache.set(key, m); return m;
  };
  const woodMat = std({ color: 0xc58a4e }), darkWood = std({ color: 0x6e4524 }), paleWood = std({ color: 0xe0b27a });
  const logTex = canvasTex(256, 256, logDraw);
  const logMat = (len, h) => { const t = logTex.clone(); t.needsUpdate = true; t.repeat.set(len / 4, h / 1.4); return std({ map: t }); };
  const stoneMat = std({ map: canvasTex(256, 256, stoneDraw, 2, 2), roughness: 1 });
  const checkMat = std({ map: canvasTex(128, 128, checkDraw, 2, 1) });
  const viewMat = new THREE.MeshBasicMaterial({ map: canvasTex(256, 192, viewDraw) });
  const tileMat = std({ map: canvasTex(64, 64, tileDraw, 9, 1.4), roughness: 0.4 });
  const paintedMat = std({ map: canvasTex(128, 256, paintedDraw) });
  let into = decor; // 부품을 넣을 묶음 (기본은 decor)
  const box = (w, h, d, mat, x, y, z, parent = into) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); parent.add(m); return m; };
  const cyl = (rt, rb, h, seg, mat, x, y, z, parent = into) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat); m.position.set(x, y, z); parent.add(m); return m; };
  const cutGroup = (B) => { const g = new THREE.Group(); g.userData.cutaway = (head) => hides(head, B); decor.add(g); return g; };

  // ----- 바닥: 넓은 전나무 마루 (판자마다 색이 조금씩 다르다) + 러그 -----
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(R.w, R.d, 1, 20), std({ vertexColors: true, roughness: 0.75 }));
  {
    const shades = [0xd9a46a, 0xcc965c, 0xe2b077, 0xc88f55].map((c) => new THREE.Color(c));
    floor.geometry = floor.geometry.toNonIndexed(); // 판자 경계가 번지지 않게 면마다 한 색
    const p2 = floor.geometry.attributes.position, c2 = [];
    for (let i = 0; i < p2.count; i += 3) { const yc = (p2.getY(i) + p2.getY(i + 1) + p2.getY(i + 2)) / 3, c = shades[Math.floor(yc + HD) % 4]; for (let k = 0; k < 3; k++) c2.push(c.r, c.g, c.b); }
    floor.geometry.setAttribute('color', new THREE.Float32BufferAttribute(c2, 3));
  }
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; floor.userData.noHide = true;
  floor.onBeforeRender = (renderer, sc, camera) => { camRef = camera; };
  decor.add(floor);
  const rugs = new THREE.Group(); rugs.userData.noHide = true; decor.add(rugs); // 바닥에 깔린 것은 숨기지 않는다 (한 덩어리로 합친다)
  const flat = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.rotation.x = -Math.PI / 2; m.position.set(x, y, z); rugs.add(m); return m; };
  flat(new THREE.CircleGeometry(2.3, 28), std({ color: 0xb83a32 }), 6.4, 0.02, -1.5);        // 벽난로 앞 둥근 러그
  flat(new THREE.RingGeometry(1.5, 1.8, 28), std({ color: 0xf2e3c0 }), 6.4, 0.03, -1.5);
  flat(new THREE.PlaneGeometry(2.4, 4.2), std({ color: 0x3f6e5a }), 0, 0.02, 3.6);           // 문에서 들어오는 길쭉한 초록 깔개
  flat(new THREE.PlaneGeometry(2.0, 3.8), std({ color: 0xe9d8a6 }), 0, 0.025, 3.6);

  // ----- 통나무 벽 (벽마다 묶음: 창문·화분·액자도 함께 숨는다) -----
  const T = 0.4; // 벽 두께
  const wallAt = (g, len, h, x, y, z, alongX) => { const m = box(alongX ? len : T, h, alongX ? T : len, logMat(len, h), x, y, z, g); m.receiveShadow = true; return m; };
  const north = cutGroup({ x0: -HW - T, x1: HW + T, y0: 0, y1: 9.2, z0: -HD - T, z1: -HD });
  const south = cutGroup({ x0: -HW - T, x1: HW + T, y0: 0, y1: WH, z0: HD, z1: HD + T });
  const west = cutGroup({ x0: -HW - T, x1: -HW, y0: 0, y1: WH, z0: -HD - T, z1: HD + T });
  const east = cutGroup({ x0: HW, x1: HW + T, y0: 0, y1: WH, z0: -HD - T, z1: HD + T });
  wallAt(north, R.w + 2 * T, WH, 0, WH / 2, -HD - T / 2, true);
  { // 북쪽 박공(세모 지붕 끝): 한가운데 9m 까지 + 둥근 환기창 (창밖 하늘)
    const sh = new THREE.Shape(); sh.moveTo(-HW - T, 0); sh.lineTo(HW + T, 0); sh.lineTo(0, 3.4); sh.closePath();
    const hole = new THREE.Path(); hole.absarc(0, 1.3, 0.45, 0, Math.PI * 2, false); sh.holes.push(hole);
    const geo = new THREE.ExtrudeGeometry(sh, { depth: T, bevelEnabled: false });
    const t = logTex.clone(); t.needsUpdate = true; t.repeat.set(0.25, 0.7);
    const gable = new THREE.Mesh(geo, std({ map: t })); gable.position.set(0, WH, -HD - T); north.add(gable);
    const glow = new THREE.Mesh(new THREE.CircleGeometry(0.45, 20), viewMat); glow.position.set(0, WH + 1.3, -HD - T + 0.05); north.add(glow);
    for (const s of [-1, 1]) { const rim = box(Math.hypot(HW + T, 3.4) + 0.4, 0.3, 0.6, darkWood, s * (HW + T) / 2, WH + 1.7, -HD - T / 2, north); rim.rotation.z = -s * Math.atan2(3.4, HW + T); } // 박공 테두리 (처마 판)
  }
  wallAt(west, R.d, WH, -HW - T / 2, WH / 2, 0, false);
  wallAt(east, R.d, WH, HW + T / 2, WH / 2, 0, false);
  const sideLen = HW - 1.5;
  wallAt(south, sideLen, WH, -(1.5 + sideLen / 2), WH / 2, HD + T / 2, true);
  wallAt(south, sideLen, WH, 1.5 + sideLen / 2, WH / 2, HD + T / 2, true);
  wallAt(south, 3.0, WH - 3.0, 0, 3.0 + (WH - 3.0) / 2, HD + T / 2, true);
  { // 문틀: 굵은 기둥 둘 + 조각한 상인방
    for (const s of [-1, 1]) box(0.3, 3.0, T + 0.2, darkWood, s * 1.35, 1.5, HD + T / 2, south);
    box(3.3, 0.35, T + 0.25, darkWood, 0, 3.05, HD + T / 2, south);
    const heart = new THREE.Mesh(new THREE.CircleGeometry(0.16, 12), std({ color: 0xd63a3a })); heart.position.set(0, 3.05, HD - 0.03); heart.rotation.y = Math.PI; south.add(heart);
  }
  // 벽 아래 굽도리 (돌 기초)
  box(R.w, 0.35, 0.1, darkWood, 0, 0.17, -HD + 0.05, north);
  box(0.1, 0.35, R.d, darkWood, HW - 0.05, 0.17, 0, east);

  // ----- 창문: 창밖 호수 그림 + 초록 덧문 + 빨간 제라늄 화분 -----
  const shutterMat = std({ color: 0x2f6b4f }), frameMat = std({ color: 0xf4eee2 });
  function windowOn(g, x, z, ry, w = 1.6, h = 1.3, y = 2.2) { // (x,z): 벽 안쪽 면, ry: 방 안쪽을 보는 방향
    const root = new THREE.Group(); root.position.set(x, 0, z); root.rotation.y = ry; g.add(root);
    const pane = new THREE.Mesh(new THREE.PlaneGeometry(w, h), viewMat); pane.position.set(0, y, 0.02); root.add(pane);
    box(w + 0.24, 0.12, 0.12, frameMat, 0, y + h / 2 + 0.06, 0.06, root); box(w + 0.3, 0.1, 0.34, frameMat, 0, y - h / 2 - 0.05, 0.16, root);
    box(0.1, h, 0.1, frameMat, -w / 2 - 0.05, y, 0.06, root); box(0.1, h, 0.1, frameMat, w / 2 + 0.05, y, 0.06, root);
    box(0.06, h, 0.06, frameMat, 0, y, 0.05, root); box(w, 0.06, 0.06, frameMat, 0, y, 0.05, root); // 십자 창살
    for (const s of [-1, 1]) { const sh = box(w / 2, h + 0.1, 0.06, shutterMat, s * (w * 0.75 + 0.12), y, 0.08, root); sh.rotation.y = s * 0.5; }
    // 화분: 창턱 위 나무 상자 + 빨간 제라늄 (벽 묶음과 함께 한 덩어리로 합쳐지고, 벽이 숨으면 같이 숨는다)
    box(w + 0.1, 0.28, 0.32, darkWood, 0, y - h / 2 + 0.06, 0.36, root);
    for (let i = 0; i < 7; i++) {
      const lx = -w / 2 + 0.15 + i * (w - 0.3) / 6, lz = 0.36 + ((i % 2) - 0.5) * 0.12, ly = y - h / 2 + 0.28;
      const leaf = new THREE.Mesh(petal, leafMat); leaf.position.set(lx, ly, lz); leaf.scale.setScalar(0.17 + (i % 3) * 0.02); root.add(leaf);
      const bloom = new THREE.Mesh(petal, i % 3 === 2 ? pinkMat : redMat); bloom.position.set(lx, ly + 0.15 + (i % 2) * 0.05, lz); bloom.scale.setScalar(0.1 + (i % 3) * 0.015); root.add(bloom);
    }
  }
  const petal = new THREE.OctahedronGeometry(1, 0), leafMat = std({ color: 0x3f8f3a }), redMat = std({ color: 0xe0202e }), pinkMat = std({ color: 0xff5a6e });
  windowOn(south, -5.0, HD, Math.PI);
  windowOn(south, 5.5, HD, Math.PI);
  windowOn(east, HW, 3.6, -Math.PI / 2);
  windowOn(north, -0.6, -HD, 0, 1.4, 1.2, 2.3);
  windowOn(west, -HW, -2.8, Math.PI / 2, 1.0, 0.9, LOFT.y + 1.5); // 다락방 창
  // 서쪽 벽: 할슈타트 호수 그림 액자 (계단 옆)
  {
    const frame = box(0.08, 1.1, 1.6, darkWood, -HW + 0.05, 2.7, 3.4, west);
    const pic = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.9), viewMat); pic.position.set(-HW + 0.1, 2.7, 3.4); pic.rotation.y = Math.PI / 2; west.add(pic);
    frame.castShadow = false;
  }

  // ----- 천장 들보 (동서로 두 줄) + 수레바퀴 샹들리에 -----
  for (const bz of [-3.4, 1.6]) { const g = cutGroup({ x0: LOFT.x1 - 0.3, x1: HW, y0: 4.9, y1: 5.5, z0: bz - 0.25, z1: bz + 0.25 }); box(HW - LOFT.x1 + 0.3, 0.45, 0.4, darkWood, (HW + LOFT.x1) / 2, 5.2, bz, g); }
  const tableAt = { x: 3.4, z: 1.6 }; // 식탁 (샹들리에가 그 위 들보에 매달린다)
  const lamp = new THREE.PointLight(0xffd59a, 1.5, 16); lamp.position.set(tableAt.x, 3.8, tableAt.z); scene.add(lamp);
  {
    const { x: cx, z: cz } = tableAt, g = cutGroup({ x0: cx - 1.1, x1: cx + 1.1, y0: 3.8, y1: 5.0, z0: cz - 1.1, z1: cz + 1.1 });
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.06, 4, 16), darkWood); wheel.rotation.x = Math.PI / 2; wheel.position.set(cx, 4.1, cz); g.add(wheel);
    for (const a of [0, Math.PI / 3, (2 * Math.PI) / 3]) { const sp = box(1.8, 0.05, 0.05, darkWood, cx, 4.1, cz, g); sp.rotation.y = a; }
    box(0.04, 0.9, 0.04, std({ color: 0x333333 }), cx, 4.55, cz, g); // 사슬 (들보까지)
    const candles = [], flames = [];
    for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3, x = cx + Math.cos(a) * 0.9, z = cz + Math.sin(a) * 0.9; candles.push({ x, y: 4.25, z, sx: 0.06, sy: 0.25, sz: 0.06 }); flames.push({ x, y: 4.45, z, s: 0.06 }); }
    g.add(makeInstanced(new THREE.CylinderGeometry(1, 1, 1, 6), std({ color: 0xfff4dc }), candles), makeInstanced(new THREE.SphereGeometry(1, 6, 4), new THREE.MeshBasicMaterial({ color: 0xffd36b }), flames));
  }

  // ----- 돌 벽난로 (동쪽 벽) -----
  const fire = { light: new THREE.PointLight(0xff8a3a, 2.2, 11), flames: [] };
  {
    const fz = -1.5, g = cutGroup({ x0: 8.3, x1: HW, y0: 0, y1: WH, z0: fz - 1.7, z1: fz + 1.7 });
    box(1.5, 2.3, 3.2, stoneMat, HW - 0.75, 1.15, fz, g).castShadow = true;           // 화덕 몸통
    box(1.1, WH - 2.3, 1.8, stoneMat, HW - 0.55, 2.3 + (WH - 2.3) / 2, fz, g);         // 굴뚝
    box(1.7, 0.18, 3.5, darkWood, HW - 0.8, 2.38, fz, g);                              // 선반 (벽난로 위)
    box(0.04, 1.1, 1.6, std({ color: 0x1b1410, roughness: 1 }), HW - 1.52, 0.75, fz, g); // 불 넣는 아궁이 (어두운 속)
    box(0.9, 0.12, 3.4, stoneMat, HW - 1.6, 0.06, fz, g);                              // 앞 돌 턱
    for (const dz of [-0.35, 0.35]) { const lg = cyl(0.11, 0.11, 1.0, 7, std({ color: 0x5a3418 }), HW - 1.8, 0.24, fz + dz * 0.5, g); lg.rotation.x = Math.PI / 2; lg.rotation.z = dz; }
    const flameMat = [0xff5a1a, 0xff9a2a, 0xffd34a].map((c) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.9 }));
    for (let i = 0; i < 5; i++) { const f = new THREE.Mesh(new THREE.ConeGeometry(0.14 + (i % 2) * 0.05, 0.6, 7), flameMat[i % 3]); f.position.set(HW - 1.8, 0.65, fz - 0.4 + i * 0.2); f.userData.live = true; g.add(f); fire.flames.push(f); }
    fire.light.position.set(HW - 2.0, 1.0, fz); scene.add(fire.light);
    // 선반 위: 촛대 둘 + 작은 화분 + 맥주잔 모양 꽃병
    for (const dz of [-1.2, 1.2]) cyl(0.05, 0.05, 0.3, 6, std({ color: 0xfff4dc }), HW - 0.5, 2.62, fz + dz, g);
    cyl(0.12, 0.1, 0.25, 8, std({ color: 0x3d74b8 }), HW - 0.5, 2.6, fz, g);
    obstacles.push({ ax: HW - 0.6, az: fz - 1.5, bx: HW - 0.6, bz: fz + 1.5, r: 1.3 }); // 불 앞 돌 턱까지
    // 장작 더미 (벽난로 남쪽)
    const logs = []; for (let i = 0; i < 6; i++) logs.push({ x: HW - 0.6, y: 0.15 + Math.floor(i / 3) * 0.26, z: fz + 2.2 + (i % 3) * 0.26 - 0.26 + (Math.floor(i / 3) * 0.13), sx: 0.12, sy: 0.8, sz: 0.12, rz: Math.PI / 2 });
    decor.add(makeInstanced(new THREE.CylinderGeometry(1, 1, 1, 7), std({ color: 0x8a5a2b }), logs));
    block(HW - 0.6, fz + 2.2, 0.55);
  }
  // 벽난로 앞 안락의자 둘 (빨간 체크 방석)
  for (const [cx, cz, ry] of [[5.0, -0.1, Math.PI * 0.62], [5.0, -2.9, Math.PI * 0.38]]) {
    const g = new THREE.Group(); g.position.set(cx, 0, cz); g.rotation.y = ry; decor.add(g); g.userData.radius = 0.9;
    box(0.9, 0.45, 0.9, woodMat, 0, 0.3, 0, g); box(0.85, 0.12, 0.85, checkMat, 0, 0.58, 0.02, g);
    box(0.9, 0.9, 0.14, woodMat, 0, 0.95, -0.42, g); for (const s of [-1, 1]) box(0.12, 0.35, 0.9, woodMat, s * 0.45, 0.7, 0, g);
    block(cx, cz, 0.6);
  }

  // ----- 뻐꾸기시계 (북쪽 벽, 시계추가 흔들리고 가끔 새가 튀어나온다) -----
  const cuckoo = {};
  {
    const g = new THREE.Group(); g.position.set(6.2, 3.3, -HD + 0.02); north.add(g);
    box(0.7, 0.8, 0.3, woodMat, 0, 0, 0.15, g);
    for (const s of [-1, 1]) { const rf = box(0.5, 0.06, 0.4, darkWood, s * 0.2, 0.52, 0.17, g); rf.rotation.z = -s * 0.65; }
    const face = new THREE.Mesh(new THREE.CircleGeometry(0.22, 16), std({ color: 0xfff4dc })); face.position.set(0, -0.08, 0.31); g.add(face);
    const handMat = std({ color: 0x20232e }); box(0.03, 0.17, 0.01, handMat, 0, -0.01, 0.32, g); box(0.12, 0.03, 0.01, handMat, 0.05, -0.08, 0.32, g); // 시곗바늘
    box(0.18, 0.16, 0.02, darkWood, 0, 0.27, 0.31, g); // 새 문
    const bird = new THREE.Group(); bird.position.set(0, 0.27, 0.2); g.add(bird);
    const bb = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), std({ color: 0xffd93d })); bird.add(bb);
    const beak = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.07, 5), std({ color: 0xff8a1a })); beak.rotation.x = Math.PI / 2; beak.position.z = 0.08; bird.add(beak);
    const pend = new THREE.Group(); pend.position.set(0, -0.4, 0.2); g.add(pend);
    box(0.03, 0.8, 0.02, std({ color: 0xd9b45a, metalness: 0.4 }), 0, -0.4, 0, pend);
    const bob = new THREE.Mesh(new THREE.CircleGeometry(0.09, 12), std({ color: 0xd9b45a, metalness: 0.4 })); bob.position.set(0, -0.8, 0.02); pend.add(bob);
    for (const s of [-1, 1]) { box(0.01, 0.6 + s * 0.15, 0.01, std({ color: 0x555555 }), s * 0.18, -0.7 + s * 0.07, 0.2, g); cyl(0.05, 0.03, 0.22, 6, darkWood, s * 0.18, -1.05 + s * 0.15, 0.2, g); } // 솔방울 추
    pend.userData.live = bird.userData.live = true;
    Object.assign(cuckoo, { pend, bird });
  }

  // ----- 책장 (북동쪽 구석) -----
  {
    const g = new THREE.Group(); g.position.set(8.4, 0, -HD + 0.35); decor.add(g); g.userData.radius = 1.2;
    box(1.6, 2.3, 0.5, darkWood, 0, 1.15, 0, g).castShadow = true;
    const books = [];
    for (let row = 0; row < 3; row++) for (let k = 0; k < 4; k++) books.push({ x: 8.4 - 0.55 + k * 0.36, y: 0.45 + row * 0.72, z: -HD + 0.42, sx: 0.26, sy: 0.5 - (k % 2) * 0.08, sz: 0.3, color: NUMBER_COLORS[(k + row * 4) % 10 + 1].base });
    decor.add(makeInstanced(new THREE.BoxGeometry(1, 1, 1), std({ color: 0xffffff }), books));
    obstacles.push({ ax: 7.7, az: -HD + 0.35, bx: 9.1, bz: -HD + 0.35, r: 0.55 });
  }

  // ----- 책상 (북쪽 벽, 가운데 오른쪽): 조각한 나무 책상 + 스탠드·공책·연필꽂이 + 하트 의자 (내 자리: 숙제) -----
  const deskAt = { x: 2.6, z: -HD + 1.4 };
  {
    const dg = new THREE.Group(); decor.add(dg); dg.userData.radius = 1.7; into = dg;
    box(2.4, 0.1, 1.1, woodMat, deskAt.x, 0.78, deskAt.z).castShadow = true;
    for (const lx of [-1.05, 1.05]) box(0.14, 0.78, 1.0, darkWood, deskAt.x + lx, 0.39, deskAt.z); // 옆판
    box(0.7, 0.35, 1.0, darkWood, deskAt.x + 0.7, 0.55, deskAt.z);                                // 서랍
    cyl(0.03, 0.03, 0.7, 6, std({ color: 0x8a94a6 }), deskAt.x - 0.9, 1.18, deskAt.z - 0.3).rotation.z = 0.4;
    const shade = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.3, 10, 1, true), std({ color: 0x57b947, side: THREE.DoubleSide })); shade.position.set(deskAt.x - 0.72, 1.5, deskAt.z - 0.3); dg.add(shade);
    const bulb = new THREE.PointLight(0xfff1b5, 1.0, 5); bulb.position.set(deskAt.x - 0.72, 1.35, deskAt.z - 0.3); decor.add(bulb);
    box(0.6, 0.04, 0.45, std({ color: NUMBER_COLORS[3].base }), deskAt.x + 0.1, 0.85, deskAt.z + 0.1).rotation.y = -0.15;
    cyl(0.12, 0.1, 0.3, 10, std({ color: 0x3fb8e8 }), deskAt.x + 0.9, 0.98, deskAt.z - 0.25);
    for (let k = 0; k < 3; k++) { const pc = cyl(0.02, 0.02, 0.45, 5, std({ color: [0xffd93d, 0xe8453c, 0x57b947][k] }), deskAt.x + 0.86 + k * 0.04, 1.2, deskAt.z - 0.28 + k * 0.03); pc.rotation.z = (k - 1) * 0.15; }
    // 알프스 판자 의자: 하트 구멍 대신 빨간 하트를 그린 등판
    box(0.7, 0.08, 0.6, woodMat, deskAt.x, 0.48, deskAt.z + 1.05);
    box(0.6, 0.7, 0.06, woodMat, deskAt.x, 0.86, deskAt.z + 1.35).rotation.x = 0.12;
    const heart = new THREE.Mesh(new THREE.CircleGeometry(0.1, 12), std({ color: 0xd63a3a })); heart.position.set(deskAt.x, 0.95, deskAt.z + 1.39); dg.add(heart);
    for (const lx of [-0.26, 0.26]) for (const lz of [-0.22, 0.22]) { const leg = box(0.06, 0.5, 0.06, darkWood, deskAt.x + lx, 0.24, deskAt.z + 1.05 + lz); leg.rotation.x = lz > 0 ? 0.12 : -0.12; }
    obstacles.push({ ax: deskAt.x - 1.2, az: deskAt.z, bx: deskAt.x + 1.2, bz: deskAt.z, r: 0.5 });
    into = decor; recenter(dg, deskAt.x, deskAt.z + 0.4);
    const board = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.0), new THREE.MeshBasicMaterial({ map: makeLabelTexture('📒 숙제 먼저! 그다음 모험', '#fff4d6', '#8a5a00', 40) }));
    board.position.set(deskAt.x, 2.1, -HD + 0.02); north.add(board);
  }
  const mySeat = { x: deskAt.x, z: deskAt.z + 1.05 };
  const seatStar = makePillSprite('⭐ 내 책상', { bg: '#fffbe6', fg: '#20232e', border: '#ffd93d' }, 0.8);
  seatStar.position.set(deskAt.x, 2.0, deskAt.z + 0.4); decor.add(seatStar);
  const seatGlow = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.68, 28), new THREE.MeshBasicMaterial({ color: 0xffd93d, transparent: true, opacity: 0.7, side: THREE.DoubleSide }));
  seatGlow.rotation.x = -Math.PI / 2; seatGlow.position.set(mySeat.x, 0.03, mySeat.z + 0.1); seatGlow.userData.noHide = true;
  decor.add(seatGlow);

  // ----- 식탁 (가운데 동쪽): 빨간 체크 식탁보 + 사과 그릇 + 빵 + 긴 의자 둘 -----
  {
    const g = new THREE.Group(); g.position.set(tableAt.x, 0, tableAt.z); decor.add(g); g.userData.radius = 1.4;
    for (const lx of [-1.1, 1.1]) box(0.16, 0.74, 0.9, darkWood, lx, 0.37, 0, g);
    box(2.9, 0.22, 1.6, checkMat, 0, 0.78, 0, g).castShadow = true;
    const bowl = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), std({ color: 0xffffff })); bowl.position.set(0, 0.92, 0); bowl.rotation.x = Math.PI; g.add(bowl);
    const apple = new THREE.SphereGeometry(0.14, 10, 8);
    for (const [ax, az, c] of [[0.08, -0.05, 0xe8453c], [-0.15, 0.12, 0x7ed957], [0.12, 0.15, 0xe8453c]]) { const a = new THREE.Mesh(apple, std({ color: c })); a.position.set(ax, 1.05, az); g.add(a); }
    const bread = new THREE.Mesh(new THREE.SphereGeometry(0.25, 10, 6), std({ color: 0xc98a3a })); bread.scale.set(1.3, 0.55, 0.8); bread.position.set(-0.85, 0.96, 0.1); g.add(bread);
    for (const s of [-1, 1]) { box(2.6, 0.08, 0.4, woodMat, 0, 0.46, s * 1.15, g); for (const lx of [-1.1, 1.1]) box(0.1, 0.44, 0.34, darkWood, lx, 0.22, s * 1.15, g); }
    obstacles.push({ ax: tableAt.x - 1.2, az: tableAt.z, bx: tableAt.x + 1.2, bz: tableAt.z, r: 1.35 });
  }

  // ----- 다락방 아래: 부엌 찬장 벽 (하늘색 꽃 타일 + 꽃 그림 찬장) + 우유 통 -----
  {
    const kx0 = -HW, kx1 = PANTRY.x1, kz = PANTRY.z1, kw = kx1 - kx0, kcx = (kx0 + kx1) / 2;
    const g = cutGroup({ x0: kx0, x1: kx1, y0: 0, y1: LOFT.y, z0: -HD, z1: kz });
    box(kw, 0.9, 0.6, woodMat, kcx, 0.45, kz - 0.3, g);                      // 아래 찬장
    box(kw + 0.05, 0.06, 0.66, paleWood, kcx, 0.93, kz - 0.3, g);            // 조리대
    const tiles = box(kw, 0.7, 0.05, tileMat, kcx, 1.31, kz - 0.62, g); tiles.material.map.repeat.set(kw / 0.45, 1.5);
    box(kw, 0.8, 0.36, paintedMat, kcx, 2.06, kz - 0.45, g);                 // 위 찬장 (꽃 그림)
    for (let i = 0; i < 4; i++) box(0.04, 0.8, 0.02, darkWood, kx0 + kw * (i + 0.5) / 4, 0.45, kz + 0.01, g); // 문 틈
    // 장작 화덕: 무쇠 상판 + 연통
    box(1.0, 0.98, 0.66, std({ color: 0x2b2b30, metalness: 0.4, roughness: 0.5 }), kx1 - 0.9, 0.49, kz - 0.3, g);
    cyl(0.09, 0.09, LOFT.y - 0.95, 8, std({ color: 0x2b2b30, metalness: 0.4 }), kx1 - 0.9, 0.95 + (LOFT.y - 0.95) / 2, kz - 0.5, g);
    cyl(0.2, 0.18, 0.22, 10, std({ color: 0xc0392b }), kx1 - 1.0, 1.09, kz - 0.25, g); // 빨간 냄비
    // 접시 선반 위 접시들
    for (let i = 0; i < 5; i++) { const pl = new THREE.Mesh(new THREE.CircleGeometry(0.14, 12), std({ color: i % 2 ? 0xffffff : 0x3d74b8 })); pl.position.set(kx0 + 1.0 + i * 0.36, 1.5, kz - 0.58); g.add(pl); }
    // 광 옆벽 (x = -4.6): 판자 벽 + 꽃 그림 문
    box(0.12, LOFT.y, kz + HD, darkWood, kx1 + 0.06, LOFT.y / 2, (-HD + kz) / 2, g);
    box(0.04, 1.9, 0.9, paintedMat, kx1 + 0.13, 0.95, -4.8, g);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 4), std({ color: 0xd9b45a })); knob.position.set(kx1 + 0.17, 0.95, -4.45); g.add(knob);
    // 우유 통 (1층에서만 막는다: 다락방에서는 그 위를 걷는다)
    cyl(0.22, 0.26, 0.7, 10, std({ color: 0xcfd6dc, metalness: 0.5, roughness: 0.4 }), -8.9, 0.35, -1.6, g);
    lowBlocks.push({ x: -8.9, z: -1.6, r: 0.6 });
  }

  // ----- 다락방 (2층): 바닥 판 + 받침 기둥 + 난간 + 침대·이불장·장난감 -----
  // 모습은 걷는 경계(주인공 중심)보다 0.4m 넓다: 주인공 몸(반지름 0.45)이 난간에 닿아 보이게
  const LY = LOFT.y, lx0 = -HW, lx1 = LOFT.x1 + 0.4, lz0 = -HD, lz1 = LOFT.z1 + 0.4, lcx = (lx0 + lx1) / 2, lcz = (lz0 + lz1) / 2;
  const loft = new THREE.Group(); decor.add(loft);
  const loftBox = { x0: lx0, x1: lx1 + 0.1, y0: LY - 0.45, y1: LY + 1.1, z0: lz0, z1: lz1 + 0.1 };
  loft.userData.cutaway = (head) => head.y - 1 < LY - 0.5 && (onLoft(head.x, head.z) || hides(head, loftBox)); // 1층에서: 다락방 밑에 있거나 다락방이 시선을 가릴 때
  {
    const deck = box(lx1 - lx0, 0.25, LOFT.z1 - lz0, paleWood, lcx, LY - 0.125, (lz0 + LOFT.z1) / 2, loft); deck.castShadow = true; deck.receiveShadow = true;
    box(lx1 - STAIR.x1, 0.25, lz1 - LOFT.z1, paleWood, (lx1 + STAIR.x1) / 2, LY - 0.125, (lz1 + LOFT.z1) / 2, loft); // 계단 옆 앞쪽 띠
    const joists = []; for (let x = lx0 + 0.8; x < lx1; x += 1.2) joists.push({ x, y: LY - 0.38, z: lcz, sx: 0.18, sy: 0.26, sz: lz1 - lz0 });
    loft.add(makeInstanced(new THREE.BoxGeometry(1, 1, 1), darkWood, joists));
    box(lx1 - lx0, 0.35, 0.22, darkWood, lcx, LY - 0.3, lz1 - 0.11, loft);   // 앞 들보 (남쪽)
    box(0.22, 0.35, lz1 - lz0, darkWood, lx1 - 0.11, LY - 0.3, lcz, loft);   // 옆 들보 (동쪽)
    const posts = [[lx1 - 0.15, lz1 - 0.15], [lx1 - 0.15, -2.6]];
    for (const [px, pz] of posts) { box(0.28, LY - 0.3, 0.28, darkWood, px, (LY - 0.3) / 2, pz, loft).castShadow = true; block(px, pz, 0.22); }
    // 난간: 남쪽(계단 옆은 열림)·동쪽. 위 손잡이 + 납작한 난간 살 (알프스 발코니 판자)
    const railMat = darkWood, rh = 0.95;
    box(lx1 - STAIR.x1, 0.1, 0.12, railMat, (STAIR.x1 + lx1) / 2, LY + rh, lz1 - 0.06, loft);
    box(0.12, 0.1, lz1 - lz0, railMat, lx1 - 0.06, LY + rh, lcz, loft);
    const bal = [];
    for (let x = STAIR.x1 + 0.1; x < lx1; x += 0.32) bal.push({ x, y: LY + rh / 2, z: lz1 - 0.06, sx: 0.16, sy: rh, sz: 0.04 });
    for (let z = lz0 + 0.3; z < lz1; z += 0.32) bal.push({ x: lx1 - 0.06, y: LY + rh / 2, z, sx: 0.04, sy: rh, sz: 0.16 });
    loft.add(makeInstanced(new THREE.BoxGeometry(1, 1, 1), woodMat, bal));
    // 다락방 깔개
    const rug = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.6), checkMat); rug.rotation.x = -Math.PI / 2; rug.position.set(-6.2, LY + 0.01, -1.0); loft.add(rug);
  }
  // 침대 (다락방 북서쪽 구석): 조각한 나무 틀 + 빨간 체크 이불 + 베개 + 피카츄 인형
  const bedAt = { x: -8.4, z: -4.6 };
  {
    const y0 = LY;
    box(2.1, 0.45, 3.8, darkWood, bedAt.x, y0 + 0.22, bedAt.z, loft).castShadow = true;
    box(1.95, 0.28, 3.6, std({ color: 0xffffff }), bedAt.x, y0 + 0.58, bedAt.z, loft);
    box(2.0, 0.2, 2.5, checkMat, bedAt.x, y0 + 0.78, bedAt.z + 0.5, loft);
    box(1.3, 0.24, 0.65, std({ color: 0xfff4dc }), bedAt.x, y0 + 0.82, bedAt.z - 1.4, loft);
    const head = box(2.1, 1.4, 0.18, darkWood, bedAt.x, y0 + 0.7, bedAt.z - 1.95, loft);
    const hh = new THREE.Mesh(new THREE.CircleGeometry(0.22, 14), std({ color: 0xd63a3a })); hh.position.set(bedAt.x, y0 + 1.05, bedAt.z - 1.85); loft.add(hh); void head;
    box(2.1, 0.8, 0.18, darkWood, bedAt.x, y0 + 0.4, bedAt.z + 1.95, loft);
    const doll = new THREE.Group();
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.28, 14, 10), std({ color: 0xffd93d }));
    for (const ex of [-0.14, 0.14]) { const ear = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.4, 6), std({ color: 0xffd93d })); ear.position.set(ex, 0.4, 0); ear.rotation.z = ex > 0 ? -0.3 : 0.3; const tipM = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.14, 6), std({ color: 0x20232e })); tipM.position.set(ex + (ex > 0 ? 0.05 : -0.05), 0.55, 0); tipM.rotation.z = ear.rotation.z; doll.add(ear, tipM); }
    for (const cx of [-0.17, 0.17]) { const cheek = new THREE.Mesh(new THREE.CircleGeometry(0.06, 8), new THREE.MeshBasicMaterial({ color: 0xe8453c })); cheek.position.set(cx, -0.03, 0.26); doll.add(cheek); }
    doll.add(body);
    doll.position.set(bedAt.x + 0.5, y0 + 1.2, bedAt.z - 1.0); doll.rotation.y = 0.9;
    loft.add(doll);
    loftBlocks.push({ x0: -HW - 1, x1: bedAt.x + 1.45, z0: -HD - 1, z1: bedAt.z + 2.3 }); // 침대 (다락방에서만 막는다)
    // 이불장 (꽃 그림 궤짝) + 작은 별 램프
    box(1.2, 0.7, 0.6, paintedMat, -5.6, y0 + 0.35, -HD + 0.45, loft);
    loftBlocks.push({ x0: -6.6, x1: -4.6, z0: -HD - 1, z1: -HD + 1.2 });
    const star = new THREE.Mesh(new THREE.OctahedronGeometry(0.16, 0), std({ color: 0xffd93d, emissive: 0xffb000, emissiveIntensity: 0.8 })); star.position.set(-7.0, y0 + 0.3, -6.3); loft.add(star);
  }
  const bedSpot = { x: bedAt.x + 2.0, z: bedAt.z + 0.2, y: LY }; // 다락방 침대 옆 (여기 서면 "자기" 버튼). 바로 아래 1층은 찬장이라 1층에서는 닿지 않는다
  const bedSign = makePillSprite('🛏 침대 (다락방)', { bg: '#fffbe6', fg: '#20232e', border: '#d63a3a' }, 0.8);
  bedSign.position.set(bedAt.x, LY + 2.4, bedAt.z); decor.add(bedSign);

  // ----- 나무 계단 (서쪽 벽을 따라 남 → 북으로 오른다) + 바깥쪽 난간 -----
  {
    const run = (STAIR.zBot - STAIR.zTop) / STAIR.n, w = STAIR.x1 + HW, cx = (-HW + STAIR.x1) / 2, steps = [], treads = [];
    for (let k = 1; k <= STAIR.n; k++) {
      const h = LY * k / STAIR.n, zc = STAIR.zBot - (k - 0.5) * run;
      steps.push({ x: cx, y: h / 2, z: zc, sx: w, sy: h, sz: run + 0.01, color: 0xc58a4e });
      treads.push({ x: cx, y: h + 0.02, z: zc + 0.02, sx: w + 0.06, sy: 0.05, sz: run + 0.06, color: 0xe0b27a });
    }
    const sm = makeInstanced(new THREE.BoxGeometry(1, 1, 1), std({ color: 0xffffff }), [...steps, ...treads], { shadow: true }); sm.receiveShadow = true;
    decor.add(sm);
    // 옆판 (계단 바깥 면) — 계단과 같이 단단해서 숨기지 않는다
    const sideShape = new THREE.Shape(); sideShape.moveTo(STAIR.zBot, 0); sideShape.lineTo(STAIR.zTop, 0); sideShape.lineTo(STAIR.zTop, LY); sideShape.closePath();
    const side = new THREE.Mesh(new THREE.ExtrudeGeometry(sideShape, { depth: 0.06, bevelEnabled: false }), darkWood);
    side.rotation.y = -Math.PI / 2; side.position.set(STAIR.x1 + 0.04, 0, 0); rugs.add(side);
    // 난간: 기둥 둘 + 비스듬한 손잡이 + 난간 살
    const rx = STAIR.x1 + 0.2, g = rugs;
    const hAt = (z) => LY * Math.min(1, Math.max(0, (STAIR.zBot - z) / (STAIR.zBot - STAIR.zTop)));
    const zA = 4.3, zB = STAIR.zTop + 0.15, yA = hAt(zA) + 0.95, yB = hAt(zB) + 0.95;
    for (const [z, y] of [[zA, yA], [zB, yB]]) box(0.16, y, 0.16, darkWood, rx, y / 2, z, g);
    const hand = box(0.1, 0.1, Math.hypot(zA - zB, yB - yA), darkWood, rx, (yA + yB) / 2, (zA + zB) / 2, g); hand.rotation.x = Math.atan2(yB - yA, zA - zB);
    const sp = []; for (let z = zA - 0.3; z > zB + 0.1; z -= 0.34) { const base = hAt(z), top = base + 0.95; sp.push({ x: rx, y: (base + top) / 2, z, sx: 0.05, sy: top - base, sz: 0.05 }); }
    g.add(makeInstanced(new THREE.BoxGeometry(1, 1, 1), woodMat, sp));
    obstacles.push({ ax: rx, az: zB, bx: rx, bz: zA, r: 0.14 }); // 난간은 위아래 어디서나 막는다 (1층에서 계단 옆으로도 못 지나간다)
    const up = makePillSprite('⬆ 다락방', { bg: '#fffbe6', fg: '#20232e', border: '#8b5a2b' }, 0.6);
    up.position.set(cx, 2.0, STAIR.zBot + 0.4); decor.add(up);
  }

  // ----- 나가는 문 표지 -----
  const exitSign = new THREE.Sprite(new THREE.SpriteMaterial({ map: makeLabelTexture('▼ 나가기 (마을)', '#8b5a2b', '#ffffff', 48), transparent: true, depthTest: false }));
  exitSign.scale.set(3, 0.75, 1); exitSign.position.set(0, 2.5, HD - 0.4);
  decor.add(exitSign);

  // 엄마 (드래프트 사람: 앞치마). 부엌과 식탁 사이에서 문 쪽을 본다 (다락방 가장자리에서 2.8m 넘게 떨어져 있다 → 다락방에서는 말이 안 걸린다)
  const momAt = { x: -0.5, z: -1.4 };
  const mom = makeNpc({ outfit: 'mom', name: '엄마', model: '엄마.glb' }); // 모델이 없으면 앞치마 드래프트
  mom.position.set(momAt.x, 0, momAt.z);
  mom.rotation.y = Math.PI * 0.85;
  decor.add(mom); block(momAt.x, momAt.z, 0.6);

  for (const c of decor.children) if (c.isGroup && c !== mom) bake(c); // 묶음마다 재료별로 합친다

  function animate(t) {
    mom.position.y = Math.sin(t * 2) * 0.03;
    seatStar.position.y = 2.0 + Math.sin(t * 2.5) * 0.1;
    seatGlow.material.opacity = 0.45 + Math.sin(t * 3) * 0.25;
    bedSign.position.y = LY + 2.4 + Math.sin(t * 2.2 + 1) * 0.1;
    // 벽난로 불: 여러 사인을 겹쳐 일렁이게 (불빛 세기와 불꽃 크기)
    const n = Math.sin(t * 7.3) * 0.5 + Math.sin(t * 13.1 + 1.3) * 0.3 + Math.sin(t * 3.1) * 0.2;
    fire.light.intensity = 2.2 + n * 0.6;
    fire.flames.forEach((f, i) => { const s = 1 + 0.25 * Math.sin(t * (9 + i * 1.7) + i); f.scale.set(1, s, 1); f.position.y = 0.45 + 0.3 * s * 0.5; });
    // 뻐꾸기시계: 시계추가 흔들리고 12초마다 새가 "뻐꾹!" 하고 나왔다 들어간다
    cuckoo.pend.rotation.z = Math.sin(t * 3.2) * 0.3;
    const ph = t % 12; cuckoo.bird.position.z = 0.2 + (ph < 1.2 ? Math.sin((ph / 1.2) * Math.PI) * 0.22 : 0);
  }

  return {
    portalTo: 'town', sun, animate, terrain: HOME_TERRAIN, decor, spawn: HOME.spawn, portal: HOME.door, dark: false, indoor: true,
    wildSpots: [], pickupSpots: [],
    mySeat, seatLabel: '📚 숙제하기', // 책상에 앉으면 학교처럼 과목 공부 (숙제)
    bed: bedSpot,                    // 다락방 침대 옆에 서면 "자기" 버튼 (포켓몬 치료 + 저장)
    npcs: [{
      x: momAt.x, z: momAt.z, mesh: mom, name: '엄마', heal: true, prompt: '엄마야! 대화 버튼을 눌러 봐.',
      lines: (c) => [
        `${c.name}, 다녀왔니? 포켓몬들도 많이 지쳤겠구나. 엄마가 돌봐 줄게. 벽난로 앞에서 푹 쉬고 가렴!`,
        '숙제는 했어? 네 책상에 앉으면 학교 숙제를 할 수 있단다. 오박사님이 칠판에 적어 두셨대.',
        '피곤하면 다락방 침대에서 한숨 자렴. 나무 계단으로 올라가면 돼. 자고 일어나면 포켓몬들도 기운이 나고, 모험도 저장돼.',
        '뻐꾸기시계 봤니? 가만히 보고 있으면 작은 새가 "뻐꾹!" 하고 나온단다.',
        '모험 다닐 땐 꼭 손 씻고 밥 먹고! 식탁에 사과랑 빵 놔뒀어. 가져가렴.',
        '창밖을 봐, 호수 너머로 눈 덮인 산이 보이지? 엄마는 이 통나무집이 참 좋아.',
        '마을 서쪽 노란 건물이 포켓몬 학교야. 친구들이 다 거기 있더라. 오박사님 말씀 잘 듣고!',
        '북쪽 동굴은 어두우니까 조심해. 동굴 속에 번개가 치는 굴이 있다던데… 전기 포켓몬이 산대. 땅 포켓몬이 있으면 든든하겠지?',
        `우리 ${c.name}는 엄마의 자랑이야. 오늘도 재밌게 놀다 와!`,
      ],
    }],
  };
}
