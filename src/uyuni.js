import * as THREE from 'three';
import { makeInstanced, makePillSprite } from './world.js';

// 꿈의우주 = 볼리비아 우유니 소금사막을 본뜬 구조물 (우주의 보랏빛 하늘 아래).
//  - 별빛 거울: 얇은 물이 고인 소금 평원. 물이 하늘을 비춰 발밑에도 별과 행성이 반짝인다 (걸어 들어갈 수 있다).
//  - 소금 육각 무늬: 거울 둘레 마른 소금 땅에 벌집처럼 갈라진 하얀 육각 테두리.
//  - 잉카와시 선인장 섬: 소금 평원 서쪽에 솟은 계단 바위섬. 네 단(한 단 2.2m)을 경사로로 오르거나, 약한 중력으로 껑충 뛰어 오른다. 꼭대기 전망대에 블록.
//  - 기차 무덤 (북서쪽): 녹슨 옛 기관차와 화차들. 나무 상자를 밟고 지붕 위로 올라가 지붕에서 지붕으로 건너뛴다.
//  - 소금 더미: 줄지어 쌓아 둔 하얀 소금 고깔.

const TAU = Math.PI * 2;
export const MIRROR = { x: 45, z: 10, r: 26, blend: 6 };
export const SALAR = { x: 45, z: 10, r: 62 }; // 하얀 소금 땅 (거울 둘레)
export const ISLA = { x: -95, z: 40, rings: [14, 10.5, 7, 4], step: 2.2, ramps: [0.3, 2.2, 4.1, 5.6], rampHalf: 1.6, rampRun: 1.8 };
// 기차 무덤: 상자 = { x, z, len(긴 쪽, x 방향), w, h, ry(보이는 기울기만), kind }
export const TRAINS = [ // 북서쪽 (메가 성역 자리(85,79)와 겹치지 않게)
  { x: -80, z: 80, len: 7, w: 2.4, h: 2.9, kind: 'loco' }, { x: -72, z: 80, len: 6, w: 2.4, h: 2.55, kind: 'wagon' }, { x: -64.8, z: 80, len: 6, w: 2.4, h: 2.55, kind: 'wagon' },
  { x: -76, z: 88, len: 6, w: 2.4, h: 2.55, kind: 'wagon' }, { x: -68.6, z: 88, len: 6, w: 2.4, h: 2.55, kind: 'wagon', tilt: 0.06 }, { x: -60, z: 88, len: 7, w: 2.4, h: 2.9, kind: 'loco' },
  { x: -52, z: 96, len: 6, w: 2.4, h: 2.55, kind: 'wagon', tilt: -0.08 }, { x: -44.4, z: 96, len: 7, w: 2.4, h: 2.9, kind: 'loco' },
];
export const CRATES = [ // 지붕으로 오르는 상자 계단 (0.85 → 1.7 → 지붕 2.55)
  { x: -72, z: 77.0, s: 1.2, h: 0.85 }, { x: -72, z: 78.2, s: 1.2, h: 1.7 },
  { x: -76, z: 91.0, s: 1.2, h: 0.85 }, { x: -76, z: 89.8, s: 1.2, h: 1.7 },
  { x: -52, z: 98.8, s: 1.2, h: 1.7 }, { x: -52, z: 100.0, s: 1.2, h: 0.85 },
];
export const SALT_ROWS = { x0: 22, x1: 70, z0: -24, rows: 4, gap: 3.2 };

let ground = null;
/** space.js 가 원래 땅 높이를 넘겨준다 (거울은 평평하게 고르고, 섬·기차는 그 위에 얹는다) */
export function setSpaceRaw(fn) { ground = fn; }
const baseCache = new Map();
function baseAt(o) { const k = o.x + ',' + o.z; if (!baseCache.has(k)) baseCache.set(k, uyuniGround(o.x, o.z)); return baseCache.get(k); }

/** 땅: 거울 소금 평원은 평평하게 */
export function uyuniGround(x, z) {
  const y = ground(x, z), d = Math.hypot(x - MIRROR.x, z - MIRROR.z);
  if (d >= MIRROR.r + MIRROR.blend) return y;
  if (d <= MIRROR.r) return 0;
  const w = (d - MIRROR.r) / MIRROR.blend; return y * w;
}
export function inMirror(x, z) { return Math.hypot(x - MIRROR.x, z - MIRROR.z) < MIRROR.r; }
export function inSalar(x, z) { return Math.hypot(x - SALAR.x, z - SALAR.z) < SALAR.r; }

function angDiff(a, b) { let d = (a - b) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; }
/** 섬 높이 (땅 위로 얹는 값, 섬 밖이면 null) */
function islaH(x, z) {
  const I = ISLA, dx = x - I.x, dz = z - I.z, d = Math.hypot(dx, dz);
  if (d > I.rings[0] + I.rampRun) return null;
  let n = 0; for (const r of I.rings) if (d < r) n++;
  let h = n * I.step;
  const a = Math.atan2(dz, dx);
  I.rings.forEach((r, k) => { // 경사로: 단 가장자리를 비스듬히 가로지른다
    if (Math.abs(d - r) > I.rampRun || Math.abs(angDiff(a, I.ramps[k])) * r > I.rampHalf) return;
    h = k * I.step + I.step * Math.min(1, Math.max(0, (r + I.rampRun - d) / (2 * I.rampRun)));
  });
  return h > 0.01 ? h : null;
}
function inBox(o, x, z, m = 0) { return Math.abs(x - o.x) < o.len / 2 + m && Math.abs(z - o.z) < o.w / 2 + m; }
function inCrate(c, x, z) { return Math.abs(x - c.x) < c.s / 2 && Math.abs(z - c.z) < c.s / 2; }

/** 구조물 높이 (모두 단단한 것: 섬 단·경사로, 기차 지붕, 상자). 턱(ledge 0.9)보다 높으면 뛰어야 오른다 */
export function uyuniHeight(x, z, gy) {
  let y = gy;
  const ih = islaH(x, z); if (ih != null) y = Math.max(y, baseAt(ISLA) + ih);
  for (const t of TRAINS) if (inBox({ x: t.x, z: t.z, len: t.len, w: t.w }, x, z)) y = Math.max(y, baseAt(t) + t.h);
  for (const c of CRATES) if (inCrate(c, x, z)) y = Math.max(y, baseAt(c) + c.h);
  return y;
}
/** 포켓몬·블록 자리를 구조물에서 비켜 놓을 때 */
export function uyuniClear(x, z, m = 3) {
  if (TRAINS.some((t) => inBox({ x: t.x, z: t.z, len: t.len, w: t.w }, x, z, m))) return false;
  if (CRATES.some((c) => Math.hypot(x - c.x, z - c.z) < c.s + m)) return false;
  if (Math.hypot(x - ISLA.x, z - ISLA.z) < ISLA.rings[0] + 2 + m && Math.hypot(x - ISLA.x, z - ISLA.z) > ISLA.rings[3] - 1) return false; // 섬 비탈 (꼭대기는 괜찮다)
  if (x > SALT_ROWS.x0 - m && x < SALT_ROWS.x1 + m && z < SALT_ROWS.z0 + m && z > SALT_ROWS.z0 - SALT_ROWS.rows * SALT_ROWS.gap - m) return false;
  return true;
}

export function buildUyuniStructures(scene, decor, { height, obstacles, avoid, sky }) {
  const add = (m, r) => { if (r) m.userData.radius = r; decor.add(m); return m; };

  // ----- 별빛 거울 -----
  const twinkles = [];
  {
    const M = MIRROR;
    const film = new THREE.Mesh(new THREE.CircleGeometry(M.r + 1.5, 64), new THREE.MeshStandardMaterial({ color: 0x3a2f8a, emissive: 0x1a1450, emissiveIntensity: 0.6, metalness: 0.85, roughness: 0.08, transparent: true, opacity: 0.8, envMapIntensity: 1.8 }));
    film.rotation.x = -Math.PI / 2; film.position.set(M.x, 0.04, M.z); film.renderOrder = 1; scene.add(film);
    // 물에 비친 별: 원판 위 작은 빛점 (하늘 별과 똑같은 색·크기 느낌)
    const n = 900, pos = new Float32Array(n * 3), col = new Float32Array(n * 3), c = new THREE.Color();
    for (let i = 0; i < n; i++) { const a = Math.random() * TAU, r = Math.sqrt(Math.random()) * M.r; pos[i * 3] = M.x + Math.cos(a) * r; pos[i * 3 + 1] = 0.07; pos[i * 3 + 2] = M.z + Math.sin(a) * r; c.set([0xffffff, 0xffe9b0, 0xc8d8ff, 0xffc8f0][i % 4]); col.set([c.r, c.g, c.b], i * 3); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const pts = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.24, vertexColors: true, transparent: true, opacity: 0.9, depthWrite: false })); scene.add(pts); twinkles.push(pts);
    // 물에 비친 태양·행성: 거울 북쪽에 하늘과 같은 순서로 빛나는 둥근 그림자
    (sky || []).forEach((p, i) => {
      const t = i / Math.max(1, sky.length - 1), x = M.x - M.r * 0.7 + t * M.r * 1.4, z = M.z - M.r * 0.45 - Math.sin(t * Math.PI) * 3, r = Math.max(0.8, p.r * 0.26);
      const glow = new THREE.Mesh(new THREE.CircleGeometry(r, 24), new THREE.MeshBasicMaterial({ color: p.color, transparent: true, opacity: p.glow ? 0.75 : 0.55, depthWrite: false }));
      glow.rotation.x = -Math.PI / 2; glow.position.set(x, 0.08, z); glow.scale.y = 0.6; glow.userData.noHide = true; scene.add(glow);
    });
    const sign = makePillSprite('🪞 별빛 거울 · 우유니 소금사막 — 발밑에도 별이 떠!', { bg: '#1a1240', fg: '#fff3b0', border: '#c8b8ff' }, 0.85);
    sign.position.set(M.x, 3.2, M.z + M.r + 2); decor.add(sign);
  }

  // ----- 소금 육각 무늬 (마른 소금 땅) -----
  {
    const hexes = [], R = 1.7, w = R * Math.sqrt(3);
    for (let row = -40; row <= 40; row++) for (let col = -40; col <= 40; col++) {
      const x = SALAR.x + col * w + (row % 2 ? w / 2 : 0), z = SALAR.z + row * R * 1.5, d = Math.hypot(x - SALAR.x, z - SALAR.z);
      if (d < MIRROR.r + 1 || d > SALAR.r - 4 || avoid(x, z) || !uyuniClear(x, z, 0.5)) continue;
      const y = height(x, z); if (Math.abs(y - uyuniGround(x, z)) > 0.05 || y < -0.4 || y > 1.2) continue; // 분화구·언덕 비탈은 건너뛴다
      hexes.push({ x, y: y + 0.03, z, s: R * 0.94, sy: 1, rx: -Math.PI / 2, rz: Math.PI / 6 });
    }
    decor.add(makeInstanced(new THREE.TorusGeometry(1, 0.035, 2, 6), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x8070b0, emissiveIntensity: 0.25 }), hexes));
  }

  // ----- 잉카와시 선인장 섬 -----
  {
    const I = ISLA, b = baseAt(I), rock = new THREE.MeshStandardMaterial({ color: 0x9a8a7a, roughness: 1, flatShading: true }), rockD = new THREE.MeshStandardMaterial({ color: 0x7d6e60, roughness: 1, flatShading: true });
    const g = new THREE.Group(); g.position.set(I.x, b, I.z);
    I.rings.forEach((r, k) => { const top = (k + 1) * I.step, m = new THREE.Mesh(new THREE.CylinderGeometry(r, r + 0.4, top + 1, 20 - k * 2), k % 2 ? rockD : rock); m.position.y = top / 2 - 0.5; m.castShadow = m.receiveShadow = true; g.add(m); });
    I.rings.forEach((r, k) => { // 경사로 (단 가장자리를 비스듬히 가로지르는 돌길)
      const a = I.ramps[k], len = Math.hypot(I.rampRun * 2, I.step), ramp = new THREE.Mesh(new THREE.BoxGeometry(I.rampHalf * 2, 0.4, len), new THREE.MeshStandardMaterial({ color: 0xd8c8a8, roughness: 1 }));
      ramp.position.set(Math.cos(a) * r, k * I.step + I.step / 2 - 0.2, Math.sin(a) * r);
      ramp.rotation.order = 'YXZ'; ramp.rotation.y = Math.atan2(-Math.cos(a), -Math.sin(a)); ramp.rotation.x = -Math.atan2(I.step, I.rampRun * 2); // 안쪽(섬 가운데)이 높다
      g.add(ramp);
    });
    g.userData.radius = 6; add(g, 6);
    // 선인장: 단 위에 (경사로·꼭대기 전망대는 비운다)
    const trunks = [], arms = [];
    let n = 0, tries = 0;
    while (n < 44 && tries++ < 3000) {
      const a = Math.random() * TAU, d = 4.6 + Math.random() * 9;
      if (I.rings.some((r, k) => Math.abs(d - r) < 2.2 && Math.abs(angDiff(a, I.ramps[k])) * r < I.rampHalf + 1.5) || I.rings.some((r) => Math.abs(d - r) < 0.7)) continue;
      const x = I.x + Math.cos(a) * d, z = I.z + Math.sin(a) * d, y = height(x, z), h = 2.4 + Math.random() * 3;
      trunks.push({ x, y: y + h / 2, z, sx: 0.3, sy: h, sz: 0.3 });
      for (let k = 0; k < 2; k++) { const s = k ? 1 : -1, ah = h * (0.4 + Math.random() * 0.25), ry = Math.random() * TAU, ox = Math.cos(ry) * 0.55 * s, oz = Math.sin(ry) * 0.55 * s; arms.push({ x: x + ox * 0.5, y: y + ah, z: z + oz * 0.5, sx: 0.16, sy: 0.6, sz: 0.16, rz: Math.PI / 2, ry }); arms.push({ x: x + ox, y: y + ah + 0.7, z: z + oz, sx: 0.2, sy: 1.3, sz: 0.2 }); }
      obstacles.push({ x, z, r: 0.5 }); n++;
    }
    const cactus = new THREE.MeshStandardMaterial({ color: 0x4f8a4a, roughness: 0.9 });
    decor.add(makeInstanced(new THREE.CylinderGeometry(1, 1, 1, 8), cactus, trunks, { shadow: true }));
    decor.add(makeInstanced(new THREE.CylinderGeometry(1, 1, 1, 6), cactus, arms));
    const top = b + I.rings.length * I.step;
    const flag = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 3, 6), new THREE.MeshStandardMaterial({ color: 0xffffff })); flag.position.set(I.x + 1.5, top + 1.5, I.z - 1.5); decor.add(flag);
    const cloth = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.7), new THREE.MeshStandardMaterial({ color: 0xffd93d, side: THREE.DoubleSide, emissive: 0x7a5a00, emissiveIntensity: 0.4 })); cloth.position.set(I.x + 2.1, top + 2.6, I.z - 1.5); decor.add(cloth); twinkles.flag = cloth;
    obstacles.push({ x: I.x + 1.5, z: I.z - 1.5, r: 0.2 });
    const sign = makePillSprite('🌵 잉카와시 선인장 섬 · 경사로로, 아니면 껑충 뛰어서 꼭대기까지!', { bg: '#3a2a1a', fg: '#fff3b0', border: '#ffd93d' }, 0.8);
    sign.position.set(I.x + 17, b + 3, I.z + 4); decor.add(sign);
  }

  // ----- 기차 무덤 -----
  {
    const rust = new THREE.MeshStandardMaterial({ color: 0x8a4a2a, roughness: 0.95, metalness: 0.3 }), rustD = new THREE.MeshStandardMaterial({ color: 0x5e3420, roughness: 1, metalness: 0.3 });
    const wheel = new THREE.MeshStandardMaterial({ color: 0x2a2220, roughness: 0.8, metalness: 0.5 }), crateMat = new THREE.MeshStandardMaterial({ color: 0xa07a48, roughness: 1 });
    const rails = [];
    for (const tz of [80, 88, 96]) for (let x = -88; x < -38; x += 4) for (const s of [-0.7, 0.7]) rails.push({ x: x + 2, y: uyuniGround(x + 2, tz + s) + 0.06, z: tz + s, sx: 4.02, sy: 0.1, sz: 0.12 }); // 땅을 따라 4m 마디
    decor.add(makeInstanced(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0x55505a, metalness: 0.6, roughness: 0.6 }), rails));
    for (const t of TRAINS) {
      const b = baseAt(t), g = new THREE.Group(); g.position.set(t.x, b, t.z); g.rotation.z = t.tilt || 0;
      if (t.kind === 'loco') {
        const boiler = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.95, t.len - 2.2, 14), rust); boiler.rotation.z = Math.PI / 2; boiler.position.set(0.9, 1.75, 0); g.add(boiler);
        const cab = new THREE.Mesh(new THREE.BoxGeometry(2.2, 2.2, t.w), rustD); cab.position.set(-t.len / 2 + 1.1, 1.8, 0); g.add(cab);
        const roof = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.15, t.w + 0.3), rust); roof.position.set(-t.len / 2 + 1.1, t.h - 0.07, 0); g.add(roof);
        const deck = new THREE.Mesh(new THREE.BoxGeometry(t.len - 2.2, 0.12, t.w), rustD); deck.position.set(0.9, t.h - 0.06, 0); g.add(deck); // 보일러 위 걸판 (지붕처럼 걸을 수 있다)
        const chim = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.42, 1.1, 10), rustD); chim.position.set(t.len / 2 - 0.9, t.h + 0.5, 0); g.add(chim);
      } else {
        const body = new THREE.Mesh(new THREE.BoxGeometry(t.len, t.h - 0.7, t.w), rust); body.position.y = 0.7 + (t.h - 0.7) / 2; g.add(body);
        const roof = new THREE.Mesh(new THREE.BoxGeometry(t.len + 0.2, 0.12, t.w + 0.2), rustD); roof.position.y = t.h - 0.06; g.add(roof);
        for (const sx of [-1.5, 0, 1.5]) { const hole = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.6, 0.05), new THREE.MeshBasicMaterial({ color: 0x140c10 })); hole.position.set(sx, 1.7, t.w / 2 + 0.03); g.add(hole); }
      }
      for (const sx of [-t.len / 2 + 1, t.len / 2 - 1]) for (const sz of [-1, 1]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.2, 12), wheel); w.rotation.x = Math.PI / 2; w.position.set(sx, 0.45, sz * (t.w / 2 - 0.1)); g.add(w); }
      g.traverse((m) => { if (m.isMesh) m.castShadow = true; });
      g.userData.box = { hx: t.len / 2, hz: t.w / 2 }; add(g, t.len / 2 + 1);
    }
    decor.add(makeInstanced(new THREE.BoxGeometry(1, 1, 1), crateMat, CRATES.map((c) => ({ x: c.x, y: baseAt(c) + c.h / 2, z: c.z, sx: c.s, sy: c.h, sz: c.s, ry: 0.05 })), { shadow: true }));
    const sign = makePillSprite('🚂 기차 무덤 · 상자를 밟고 지붕 위로! 지붕에서 지붕으로 껑충!', { bg: '#3a2a1a', fg: '#fff3b0', border: '#ff9a5a' }, 0.8);
    sign.position.set(-86, height(-86, 76) + 3.4, 76); decor.add(sign);
  }

  // ----- 소금 더미 -----
  {
    const piles = [], S = SALT_ROWS;
    for (let r = 0; r < S.rows; r++) for (let x = S.x0; x <= S.x1; x += 3.4) { const z = S.z0 - r * S.gap + (Math.random() - 0.5) * 0.4, xx = x + (r % 2 ? 1.7 : 0); if (avoid(xx, z)) continue; const h = 0.8 + Math.random() * 0.4; piles.push({ x: xx, y: height(xx, z) + h / 2 - 0.05, z, sx: 0.8, sy: h, sz: 0.8, ry: Math.random() * 3 }); obstacles.push({ x: xx, z, r: 0.7 }); }
    decor.add(makeInstanced(new THREE.ConeGeometry(1, 1, 9), new THREE.MeshStandardMaterial({ color: 0xf4f0ff, roughness: 0.9, emissive: 0x403060, emissiveIntensity: 0.3 }), piles, { shadow: true }));
  }

  return {
    animate(t) {
      const p = twinkles[0]; if (p) p.material.opacity = 0.75 + Math.sin(t * 2.3) * 0.15; // 물결에 별빛이 일렁인다
      if (twinkles.flag) twinkles.flag.rotation.y = Math.sin(t * 2) * 0.3;
    },
  };
}
