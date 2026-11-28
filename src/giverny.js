import * as THREE from 'three';
import { makeInstanced, makePillSprite, buildBridge, makeLabelTexture } from './world.js';
import { mergeGroup } from './hallstatt.js';
import { waterMaterial, windMaterial } from './fx.js';

// 포켓몬 쉼터 = 프랑스 지베르니의 모네 정원 (클로드 모네가 수련 연작을 그린 곳)을 본뜬, 마을 안의 작은 정원.
//  - 물의 정원: 수련이 가득 뜬 연못, 그 위를 건너는 초록 일본식 아치 다리(다이코바시)와 다리 위 등나무 꽃 지붕.
//  - 수양버들: 연못가에 가지를 물까지 늘어뜨린 버드나무, 서쪽 물가에는 대나무 숲.
//  - 클로 노르망(꽃의 정원): 입구에서 연못까지 곧게 뻗은 "그랑드 알레" — 초록 쇠 아치에 덩굴장미·한련화가 덮이고, 양옆은 알록달록 꽃밭.
//  - 낮은 생울타리로 둘러싸고 북쪽 가운데로만 들어간다. 입구 옆에는 쉼터지기 봄이 (main: 고른 포켓몬이 여기서 논다).

export const GARDEN = { x: 30, z: 64, hw: 14, hd: 11 };                  // 정원 (x 16~44, z 53~75), 입구는 북쪽(z 53) 가운데
export const GARDEN_POND = { x: 30, z: 68, rx: 8.5, rz: 4.6 };            // 수련 연못
export const GARDEN_BRIDGE = { x1: 30, z1: 62.2, x2: 30, z2: 73.8, w: 1.1, rise: 0.9 }; // 일본식 아치 다리 (남북으로 연못을 건넌다)
export const GARDEN_KEEPER = { x: 34.5, z: 50.8 };                        // 쉼터지기 봄이 (입구 동쪽)
/** 정원 안 (m: 안쪽 여유) */
export const inGarden = (x, z, m = 0) => Math.abs(x - GARDEN.x) < GARDEN.hw - m && Math.abs(z - GARDEN.z) < GARDEN.hd - m;
/** 연못 안 (k: 1 이면 물가) */
export const inGardenPond = (x, z, k = 1) => ((x - GARDEN_POND.x) / (GARDEN_POND.rx * k)) ** 2 + ((z - GARDEN_POND.z) / (GARDEN_POND.rz * k)) ** 2 < 1;
/** 마을 땅 높이에 더할 연못 깊이 (가장자리에서 부드럽게) */
export function gardenDip(x, z) {
  const e = ((x - GARDEN_POND.x) / (GARDEN_POND.rx + 1)) ** 2 + ((z - GARDEN_POND.z) / (GARDEN_POND.rz + 1)) ** 2;
  return e < 1 ? -0.75 * Math.min(1, (1 - e) * 3) : 0;
}
export const GARDEN_WATER_Y = -0.22;

const rand = (a, b) => a + Math.random() * (b - a);

/** 정원 모습 + 장애물 (생울타리·아치 기둥·버들·대나무). 움직이는 것(버들가지·꽃)은 바람 재질로 */
export function buildGiverny(scene, decor, { height, obstacles }) {
  const G = GARDEN, P = GARDEN_POND;
  const x0 = G.x - G.hw, x1 = G.x + G.hw, z0 = G.z - G.hd, z1 = G.z + G.hd;
  const block = (x, z, r) => obstacles.push({ x, z, r });
  const seg = (ax, az, bx, bz, r = 0.45) => obstacles.push({ ax, az, bx, bz, r });
  const g = new THREE.Group();

  // ---------- 물의 정원: 수련 연못 ----------
  const water = new THREE.Mesh(new THREE.CircleGeometry(1, 40), waterMaterial({ color: 0x3f8f86, transparent: true, opacity: 0.82, roughness: 0.15 }, { scale: 0.45 }));
  water.rotation.x = -Math.PI / 2; water.scale.set(P.rx + 0.6, P.rz + 0.6, 1); water.position.set(P.x, GARDEN_WATER_Y, P.z);
  scene.add(water);
  const pads = [], blooms = [];
  for (let i = 0; i < 46; i++) {
    const a = rand(0, Math.PI * 2), r = Math.sqrt(Math.random()) * 0.9, x = P.x + Math.cos(a) * P.rx * r, z = P.z + Math.sin(a) * P.rz * r;
    if (Math.abs(x - GARDEN_BRIDGE.x1) < 1.6) continue; // 다리 밑은 비운다
    const s = rand(0.35, 0.7); pads.push({ x, y: GARDEN_WATER_Y + 0.02, z, s, ry: rand(0, 6.3) });
    if (Math.random() < 0.45) blooms.push({ x: x + rand(-0.1, 0.1), y: GARDEN_WATER_Y + 0.12, z: z + rand(-0.1, 0.1), s: rand(0.12, 0.2), color: [0xff9ec7, 0xffffff, 0xffc2dc, 0xfff1a8][i % 4] });
  }
  const padGeo = new THREE.CircleGeometry(1, 14, 0.35, Math.PI * 1.8); padGeo.rotateX(-Math.PI / 2);
  decor.add(makeInstanced(padGeo, new THREE.MeshStandardMaterial({ color: 0x4f9a3e, roughness: 0.8 }), pads));
  decor.add(makeInstanced(new THREE.ConeGeometry(1, 0.9, 7), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 }), blooms));
  // 연못가 돌
  const stones = [];
  for (let i = 0; i < 40; i++) { const a = (i / 40) * Math.PI * 2, x = P.x + Math.cos(a) * (P.rx + 0.7), z = P.z + Math.sin(a) * (P.rz + 0.7); if (Math.abs(x - GARDEN_BRIDGE.x1) < 1.5) continue; stones.push({ x, y: height(x, z) + 0.05, z, sx: rand(0.35, 0.6), sy: rand(0.18, 0.3), sz: rand(0.3, 0.5), ry: rand(0, 3) }); }
  decor.add(makeInstanced(new THREE.DodecahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ color: 0x9c9a8e, roughness: 1 }), stones));

  // ---------- 일본식 아치 다리 + 등나무 지붕 (모네가 그린 초록 다리) ----------
  const B = GARDEN_BRIDGE;
  scene.add(buildBridge(B, obstacles, { plankColor: 0x3f8a4f, railColor: 0x2f7a42 }));
  {
    const frame = new THREE.Group(), green = new THREE.MeshStandardMaterial({ color: 0x2f7a42, roughness: 0.7 });
    const len = B.z2 - B.z1;
    for (let i = 0; i <= 4; i++) { // 다리 위 아치 기둥 넷 쌍 + 위 가로대
      const t = 0.12 + (i / 4) * 0.76, z = B.z1 + len * t, y = 0.08 + B.rise * Math.sin(t * Math.PI);
      for (const s of [-1, 1]) { const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.3, 6), green); post.position.set(B.x1 + s * (B.w + 0.05), y + 1.15, z); frame.add(post); }
      const top = new THREE.Mesh(new THREE.TorusGeometry(B.w + 0.05, 0.05, 6, 12, Math.PI), green); top.position.set(B.x1, y + 2.3, z); frame.add(top);
    }
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, len * 0.8), green); rail.position.set(B.x1, B.rise + 2.5, (B.z1 + B.z2) / 2); frame.add(rail);
    g.add(frame);
    const wis = []; // 등나무 꽃송이: 지붕에서 늘어진 보랏빛 송이
    for (let i = 0; i < 90; i++) { const t = rand(0.1, 0.9), z = B.z1 + len * t, y = 0.08 + B.rise * Math.sin(t * Math.PI) + 2.25, s = Math.random() < 0.5 ? -1 : 1; wis.push({ x: B.x1 + s * rand(0.2, B.w + 0.2), y: y - rand(0, 0.25), z, s: rand(0.12, 0.2), sy: rand(0.35, 0.6), rx: Math.PI, color: [0x9a7be0, 0xb79cf0, 0x8565cf, 0xd7c6ff][i % 4] }); }
    decor.add(makeInstanced(new THREE.ConeGeometry(1, 1, 6), windMaterial(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7 }), { amp: 0.05, speed: 1.2 }), wis));
    const leaves = []; for (let i = 0; i < 40; i++) { const t = rand(0.08, 0.92), z = B.z1 + len * t; leaves.push({ x: B.x1 + rand(-B.w, B.w), y: 0.08 + B.rise * Math.sin(t * Math.PI) + 2.45, z, s: rand(0.3, 0.5), sy: 0.25 }); }
    decor.add(makeInstanced(new THREE.SphereGeometry(1, 8, 6), new THREE.MeshStandardMaterial({ color: 0x5b9a45, roughness: 0.9 }), leaves));
  }

  // ---------- 수양버들 · 대나무 ----------
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x7a5a3a, roughness: 1 });
  const strands = [], crowns = [];
  for (const [wx, wz, sc] of [[19.5, 70.5, 1.1], [40.5, 64.5, 1], [38.5, 73, 0.9]]) {
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22 * sc, 0.35 * sc, 3.4 * sc, 8), trunkMat); trunk.position.set(wx, height(wx, wz) + 1.7 * sc, wz); trunk.rotation.z = 0.08; trunk.castShadow = true; g.add(trunk);
    crowns.push({ x: wx, y: height(wx, wz) + 3.7 * sc, z: wz, sx: 2.3 * sc, sy: 1.3 * sc, sz: 2.3 * sc });
    for (let i = 0; i < 46; i++) { const a = (i / 46) * Math.PI * 2 + rand(-0.1, 0.1), r = rand(1.3, 2.4) * sc, l = rand(1.8, 2.8) * sc; strands.push({ x: wx + Math.cos(a) * r, y: height(wx, wz) + 3.9 * sc - l / 2, z: wz + Math.sin(a) * r, sx: 0.12, sy: l, sz: 0.12 }); }
    block(wx, wz, 0.5 * sc);
  }
  decor.add(makeInstanced(new THREE.SphereGeometry(1, 12, 8), windMaterial(new THREE.MeshStandardMaterial({ color: 0x8cbf4f, roughness: 0.9 }), { amp: 0.05 }), crowns, { shadow: true }));
  decor.add(makeInstanced(new THREE.BoxGeometry(1, 1, 1), windMaterial(new THREE.MeshStandardMaterial({ color: 0x9bcc5a, roughness: 0.9 }), { amp: 0.16, y0: -0.5, y1: 0.5, speed: 1.1 }), strands));
  const bamboo = [], bLeaves = [];
  for (let i = 0; i < 26; i++) { const x = rand(17, 20.5), z = rand(62, 66.5), h = rand(3.5, 5.5); bamboo.push({ x, y: height(x, z) + h / 2, z, sx: 0.08, sy: h, sz: 0.08, rz: rand(-0.06, 0.06) }); bLeaves.push({ x: x + rand(-0.3, 0.3), y: height(x, z) + h - 0.3, z: z + rand(-0.3, 0.3), s: rand(0.4, 0.7), sy: 0.5 }); }
  decor.add(makeInstanced(new THREE.CylinderGeometry(1, 1, 1, 6), new THREE.MeshStandardMaterial({ color: 0x7fae4a, roughness: 0.8 }), bamboo));
  decor.add(makeInstanced(new THREE.SphereGeometry(1, 8, 6), windMaterial(new THREE.MeshStandardMaterial({ color: 0x5f9a3c, roughness: 0.9 }), { amp: 0.08 }), bLeaves));
  seg(17.2, 62, 17.2, 66.5, 1.6);

  // ---------- 꽃의 정원: 그랑드 알레 (초록 쇠 아치 + 덩굴꽃) 와 양옆 꽃밭 ----------
  const archMat = new THREE.MeshStandardMaterial({ color: 0x2f7a42, roughness: 0.7 });
  const vine = [];
  for (let i = 0; i < 4; i++) {
    const z = z0 + 1.6 + i * 2.1, a = new THREE.Group();
    for (const s of [-1, 1]) { const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.4, 6), archMat); post.position.set(G.x + s * 1.5, 1.2, z); a.add(post); block(G.x + s * 1.5, z, 0.15); }
    const top = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.06, 6, 14, Math.PI), archMat); top.position.set(G.x, 2.4, z); a.add(top);
    g.add(a);
    for (let k = 0; k < 26; k++) { const t = rand(0, Math.PI), side = Math.random() < 0.3; const x = side ? G.x + (Math.random() < 0.5 ? -1.5 : 1.5) : G.x + Math.cos(t) * 1.5, y = side ? rand(0.6, 2.4) : 2.4 + Math.sin(t) * 1.5; vine.push({ x: x + rand(-0.12, 0.12), y, z: z + rand(-0.15, 0.15), s: rand(0.1, 0.17), color: [0xe8453c, 0xff8c42, 0xffb0c8, 0xffd93d, 0x3f8f3a, 0x3f8f3a][k % 6] }); }
  }
  decor.add(makeInstanced(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 }), vine));
  // 꽃밭: 입구 양옆, 줄 맞춘 화단 (모네가 색을 맞춰 심은 줄무늬 꽃밭)
  const flowers = [], stems = [], cols = [[0xff6b9d, 0xffb0c8], [0xffd93d, 0xff8c42], [0xb388ff, 0x7c6cff], [0xffffff, 0xfff1a8], [0xe8453c, 0xff6b6b]];
  for (const s of [-1, 1]) for (let row = 0; row < 5; row++) {
    const c = cols[(row + (s > 0 ? 2 : 0)) % cols.length], z = z0 + 1.4 + row * 1.3;
    for (let k = 0; k < 16; k++) { const x = G.x + s * (2.6 + k * 0.62) + rand(-0.15, 0.15), zz = z + rand(-0.2, 0.2), h = rand(0.35, 0.8); if (Math.abs(x - G.x) > G.hw - 1) continue; stems.push({ x, y: h / 2, z: zz, sx: 0.04, sy: h, sz: 0.04 }); flowers.push({ x, y: h + 0.05, z: zz, s: rand(0.12, 0.2), color: c[k % 2] }); }
  }
  decor.add(makeInstanced(new THREE.BoxGeometry(1, 1, 1), windMaterial(new THREE.MeshStandardMaterial({ color: 0x3f8f3a }), { amp: 0.05, y0: -0.4, y1: 0.4, speed: 1.6 }), stems));
  decor.add(makeInstanced(new THREE.IcosahedronGeometry(1, 0), windMaterial(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7 }), { amp: 0.06, speed: 1.6 }), flowers));

  // ---------- 낮은 생울타리 (북쪽 가운데 입구만 열림) + 벤치 · 표지판 ----------
  const hedgeMat = new THREE.MeshStandardMaterial({ color: 0x3d7f3a, roughness: 1 });
  const hedge = (ax, az, bx, bz) => { const len = Math.hypot(bx - ax, bz - az), m = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.0, len), hedgeMat); m.position.set((ax + bx) / 2, 0.5, (az + bz) / 2); m.rotation.y = Math.atan2(bx - ax, bz - az); m.castShadow = true; g.add(m); seg(ax, az, bx, bz, 0.5); };
  hedge(x0, z0, G.x - 2.2, z0); hedge(G.x + 2.2, z0, x1, z0); hedge(x1, z0, x1, z1); hedge(x1, z1, x0, z1); hedge(x0, z1, x0, z0);
  const wood = new THREE.MeshStandardMaterial({ color: 0x2f7a42, roughness: 0.8 });
  for (const [bx, bz, ry] of [[24, 61.5, 0], [37, 61.5, 0]]) { const b = new THREE.Group(); const seat = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.1, 0.5), wood); seat.position.y = 0.45; const back = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.5, 0.08), wood); back.position.set(0, 0.75, -0.25); b.add(seat, back); for (const s of [-1, 1]) { const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.45, 0.45), wood); leg.position.set(s * 0.8, 0.22, 0); b.add(leg); } b.position.set(bx, 0, bz); b.rotation.y = ry + Math.PI; g.add(b); block(bx, bz, 0.7); }
  const sign = new THREE.Sprite(new THREE.SpriteMaterial({ map: makeLabelTexture('🌸 포켓몬 쉼터', '#2f7a42', '#ffffff', 56), transparent: true, depthTest: false }));
  sign.scale.set(5, 1.2, 1); sign.position.set(G.x, 4.6, z0 - 0.2); g.add(sign);
  for (const s of [-1, 1]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 2.8, 8), archMat); p.position.set(G.x + s * 2.4, 1.4, z0); g.add(p); }
  decor.add(mergeGroup(g));
  // 정원 오솔길 (입구 → 다리 앞, 다리 건너 → 남쪽 벤치) 은 모래색 판
  const path = new THREE.Mesh(new THREE.PlaneGeometry(2.2, B.z1 - z0 - 0.5), new THREE.MeshStandardMaterial({ color: 0xd9c08a, roughness: 1 }));
  path.rotation.x = -Math.PI / 2; path.position.set(G.x, 0.03, (z0 + B.z1) / 2); path.receiveShadow = true; scene.add(path);
}
