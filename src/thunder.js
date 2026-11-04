import * as THREE from 'three';
import { waterMaterial } from './fx.js';
import { makeNpc } from './npc.js';
import { rand } from './util.js';
import { buildGround, makePortal, makeInstanced, makePillSprite } from './world.js';

// 번개동굴 (140x140). 지하동굴 동쪽 벽의 "번개 굴"로 들어오면 도착한다. 전기 포켓몬(피카츄·코일·쥬피썬더·닌자피카츄)이 산다.
// 벤치마크: 중국 구이린의 **루디옌 동굴(갈대피리 동굴)** — 천장에서 내려온 종유석과 바닥에서 솟은 석순, 둘이 만난 돌기둥이
// 빨강·초록·파랑·보라·금빛 조명으로 무지개처럼 빛나는 석회 동굴. 가장 안쪽의 "수정궁" 호수에는 그 빛이 거울처럼 비친다.
// 여기서는 전기 포켓몬이 만든 전기로 불빛이 켜진다: 빛이 물결처럼 천천히 흐르고, 가끔 번개가 치면 온 동굴의 빛이 하얗게 번쩍인다.
// 보스 라이츄는 수정궁 호수 가운데 돌섬에 있고 남쪽 돌다리로 건너간다. 작은 웅덩이들은 전기가 흘러 못 들어간다. 남쪽 포탈로 지하동굴에 돌아간다.
export const THUNDER = {
  size: 140,
  spawn: { x: 0, z: 48 },
  portal: { x: 0, z: 56 },
  palace: { x: 0, z: -44, lake: 15, island: 5, h: 0.8 }, // 수정궁: 거울 호수(반지름 15) 가운데 돌섬(반지름 5, 높이 0.8)
  bridge: { half: 1.3, z0: -40, z1: -27 }, // 남쪽 물가 → 돌섬을 잇는 돌다리 (x = palace.x ± half)
  pools: [{ x: -30, z: 20, r: 6 }, { x: 34, z: 2, r: 5.5 }, { x: -38, z: -24, r: 5 }, { x: 40, z: -30, r: 5 }, { x: 12, z: -6, r: 3.5 }, { x: -12, z: 36, r: 4 }, { x: 50, z: 34, r: 5 }],
  bumps: [{ x: -24, z: -8, r: 12, h: 1.3 }, { x: 26, z: 24, r: 13, h: 1.1 }, { x: -50, z: 10, r: 11, h: 1.5 }, { x: 48, z: -12, r: 12, h: 1.2 }, { x: -20, z: 50, r: 10, h: 0.9 }],
  wallR: 66,
  ceil: 22, // 천장 높이 (종유석이 매달린다)
};
const LIGHTS = [0xff4d6d, 0x3dff8a, 0x3da8ff, 0xb46bff, 0xffc93d, 0x3dfff0, 0xff8a3d]; // 루디옌의 조명 색 (빨강·초록·파랑·보라·금·청록·주황)
const THUNDER_WILD = [[-22, 30], [24, 34], [-44, 20], [44, 14], [-18, -18], [22, -16], [-52, -14], [52, -8], [-30, -46], [30, -48], [0, -14], [-56, 36], [56, 44], [10, 16]];
const THUNDER_PICKUPS = [[-12, 28], [14, 22], [-36, 2], [38, -18], [-6, -4], [-24, 56], [26, 56], [-58, 8], [58, 24], [6, 2], [-22, -36], [46, 0]];

function onBridge(x, z) { const B = THUNDER.bridge; return Math.abs(x - THUNDER.palace.x) < B.half && z > B.z0 && z < B.z1; }
function thunderHeight(x, z) {
  const P = THUNDER.palace, pd = Math.hypot(x - P.x, z - P.z);
  if (pd < P.island) return P.h; // 수정궁 돌섬
  if (onBridge(x, z)) return P.h; // 돌다리
  let y = 0;
  for (const b of THUNDER.bumps) { const dx = x - b.x, dz = z - b.z; y += b.h * Math.exp(-(dx * dx + dz * dz) / (b.r * b.r)); }
  for (const p of THUNDER.pools) { const d = Math.hypot(x - p.x, z - p.z); if (d < p.r + 1.5) y -= 0.45 * Math.min(1, (p.r + 1.5 - d) / 2); }
  if (pd < P.lake - 0.6) return -12; // 호수는 깊다: 물에 거꾸로 비친 돌기둥이 바닥에 가리지 않게 (물은 못 들어가니 보이지 않는다)
  if (pd < P.lake + 2) y = Math.min(y, -0.6 * Math.min(1, (P.lake + 2 - pd) / 2)); // 물가 둘레는 살짝 낮다
  return y;
}
function thunderBlocked(x, z) {
  if (Math.hypot(x, z) > THUNDER.wallR - 1) return true; // 동굴 벽
  const P = THUNDER.palace, pd = Math.hypot(x - P.x, z - P.z);
  if (pd < P.lake && pd >= P.island && !onBridge(x, z)) return true; // 수정궁 호수: 돌다리로만 건넌다
  return THUNDER.pools.some((p) => Math.hypot(x - p.x, z - p.z) < p.r + 0.3); // 전기 웅덩이: 감전되니 못 들어간다
}
export const THUNDER_TERRAIN = { height: thunderHeight, inHole: () => false, blocked: thunderBlocked, size: THUNDER.size, obstacles: [] };

/** 석회 돌 재질: 인스턴스 색(조명 색)으로 스스로 빛나고, 빛이 자리마다 다른 박자로 천천히 숨 쉬듯 흐른다 (점광원 없이 가볍게) */
function neonStone(base = 0xf3ead8) {
  const u = { uTime: { value: 0 }, uFlash: { value: 0 }, uGlow: { value: 0.55 } };
  const mat = new THREE.MeshStandardMaterial({ color: base, roughness: 0.75, emissive: 0xffffff, emissiveIntensity: 1 });
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vNeon; varying float vPh; varying float vH;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
      #ifdef USE_INSTANCING_COLOR
        vNeon = instanceColor;
      #else
        vNeon = vec3(1.0);
      #endif
      #ifdef USE_INSTANCING
        vPh = instanceMatrix[3].x * 0.09 + instanceMatrix[3].z * 0.07;
      #else
        vPh = 0.0;
      #endif
      vH = position.y;`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uTime, uFlash, uGlow; varying vec3 vNeon; varying float vPh; varying float vH;')
      .replace('#include <color_fragment>', '#include <color_fragment>\n diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.95, 0.92, 0.86), 0.65); /* 돌 자체는 크림색 (인스턴스 색은 빛으로만) */')
      .replace('vec3 totalEmissiveRadiance = emissive;', `float pulse = 0.55 + 0.45 * sin(uTime * 1.3 + vPh * 6.2832);
      vec3 totalEmissiveRadiance = emissive * mix(vNeon * uGlow * pulse * (0.55 + 0.45 * clamp(0.5 - vH, 0.0, 1.0)), vec3(1.0, 0.98, 0.9), uFlash);`);
  };
  mat.customProgramCacheKey = () => 'np-neon-stone';
  return { mat, u };
}

export function buildThunder(scene) {
  const S = THUNDER.size;
  const decor = new THREE.Group();
  scene.add(decor);
  const obstacles = THUNDER_TERRAIN.obstacles;
  obstacles.length = 0;
  const block = (x, z, r) => obstacles.push({ x, z, r });
  const P = THUNDER.palace, B = THUNDER.bridge;

  scene.background = new THREE.Color(0x07060f);
  scene.fog = new THREE.Fog(0x07060f, 24, 85);
  scene.add(new THREE.HemisphereLight(0x8a7fb0, 0x1a1428, 0.7));
  const sun = new THREE.DirectionalLight(0xc8b8ff, 0.3);
  sun.position.set(10, 30, 10);
  scene.add(sun, sun.target);

  // 바닥: 젖은 석회 바닥 (크림·회갈)
  const floorA = new THREE.Color(0x4a4252), floorB = new THREE.Color(0x544a5a), poolBed = new THREE.Color(0x0e1a3a), stoneC = new THREE.Color(0x8a7f74);
  buildGround(scene, S, 120, thunderHeight, (x, z) => {
    if (THUNDER.pools.some((p) => Math.hypot(x - p.x, z - p.z) < p.r)) return poolBed;
    if (Math.hypot(x - P.x, z - P.z) < P.lake) return Math.hypot(x - P.x, z - P.z) < P.island || onBridge(x, z) ? stoneC : poolBed;
    return Math.random() < 0.5 ? floorA : floorB;
  });

  // 동굴 벽 + 둥근 천장
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x3a3340, roughness: 1 });
  const wallItems = [];
  for (let i = 0; i < 64; i++) {
    const a = (i / 64) * Math.PI * 2, r = THUNDER.wallR + rand(0, 4);
    const h = rand(16, 24), cr = rand(4, 6.5);
    wallItems.push({ x: Math.cos(a) * r, y: h / 2 - 1, z: Math.sin(a) * r, sx: cr, sy: h, sz: cr, ry: rand(0, 3) });
  }
  decor.add(makeInstanced(new THREE.ConeGeometry(1, 1, 6), rockMat, wallItems));
  const dome = new THREE.Mesh(new THREE.SphereGeometry(THUNDER.wallR + 6, 32, 10, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x1c1822, roughness: 1, side: THREE.BackSide }));
  dome.scale.y = THUNDER.ceil / (THUNDER.wallR + 6); decor.add(dome);

  // 종유석·석순·돌기둥 (루디옌의 무지개 조명). 무리마다 한 색, 무리 안에서 이웃 색이 조금 섞인다
  const stone = neonStone(), tites = [], mites = [], cols = [];
  const keepOut = [...THUNDER_WILD, ...THUNDER_PICKUPS].map(([x, z]) => ({ x, z, r: 2.6 })).concat([{ x: 5, z: 44, r: 4 }, { x: P.x, z: P.z, r: P.lake + 1.5 }, { x: P.x, z: (B.z0 + B.z1) / 2, r: 4 }]);
  const free = (x, z, m = 1) => Math.hypot(x, z) < THUNDER.wallR - 4 && !(Math.abs(x) < 6 && z > -27) && Math.hypot(x - THUNDER.spawn.x, z - THUNDER.spawn.z) > 9 && !thunderBlocked(x, z) && !THUNDER.pools.some((p) => Math.hypot(x - p.x, z - p.z) < p.r + 1.2) && !keepOut.some((o) => Math.hypot(x - o.x, z - o.z) < o.r + m);
  const ceilAt = (x, z) => THUNDER.ceil * Math.sqrt(Math.max(0, 1 - (x * x + z * z) / ((THUNDER.wallR + 6) ** 2)));
  for (let g = 0; g < 46; g++) {
    const cx = rand(-58, 58), cz = rand(-58, 58);
    if (Math.hypot(cx, cz) > THUNDER.wallR - 5) continue;
    const col = new THREE.Color(LIGHTS[g % LIGHTS.length]), col2 = new THREE.Color(LIGHTS[(g + 1) % LIGHTS.length]);
    for (let k = 0; k < 7; k++) { // 천장의 종유석 (어디든 매달려도 된다 — 머리 위라 길을 막지 않는다)
      const x = cx + rand(-4, 4), z = cz + rand(-4, 4), h = rand(2, 7), r = rand(0.3, 0.8);
      tites.push({ x, y: ceilAt(x, z) - 0.3 - h / 2, z, sx: r, sy: h, sz: r, rx: Math.PI, color: (k % 3 ? col : col2).getHex() });
    }
    for (let k = 0; k < 5; k++) { // 바닥의 석순 (길·포켓몬 자리는 비운다)
      const x = cx + rand(-4, 4), z = cz + rand(-4, 4); if (!free(x, z)) continue;
      const h = rand(1.2, 4.2), r = rand(0.35, 0.8);
      mites.push({ x, y: thunderHeight(x, z) + h / 2 - 0.1, z, sx: r, sy: h, sz: r, color: (k % 2 ? col : col2).getHex() }); block(x, z, r + 0.25);
    }
    if (g % 3 === 0 && free(cx, cz, 2)) { // 종유석과 석순이 만난 돌기둥 (천장까지)
      const top = ceilAt(cx, cz), r = rand(0.9, 1.6);
      cols.push({ x: cx, y: top / 2, z: cz, sx: r, sy: top, sz: r, ry: rand(0, 3), color: col.getHex() }); block(cx, cz, r + 0.3);
    }
  }
  const titeGeo = new THREE.ConeGeometry(1, 1, 7), colGeo = new THREE.CylinderGeometry(0.55, 1, 1, 9, 4);
  { const p = colGeo.attributes.position; for (let i = 0; i < p.count; i++) { const y = p.getY(i), w = 1 - 0.45 * Math.sin((y + 0.5) * Math.PI); p.setX(i, p.getX(i) * w); p.setZ(i, p.getZ(i) * w); } colGeo.computeVertexNormals(); } // 가운데가 잘록한 모래시계 기둥
  decor.add(makeInstanced(titeGeo, stone.mat, tites), makeInstanced(titeGeo, stone.mat, mites, { shadow: true }), makeInstanced(colGeo, stone.mat, cols, { shadow: true }));

  // 전기 웅덩이: 푸른 빛이 흐르는 물 (감전되니 못 들어간다)
  const poolRings = [];
  for (const W of THUNDER.pools) {
    const water = new THREE.Mesh(new THREE.CircleGeometry(W.r + 0.6, 28), waterMaterial({ color: 0x1e9bff, emissive: 0x0a5fd0, emissiveIntensity: 0.9, transparent: true, opacity: 0.85, roughness: 0.1 }, { scale: 0.6 }));
    water.rotation.x = -Math.PI / 2; water.position.set(W.x, thunderHeight(W.x, W.z) + 0.1, W.z);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(W.r * 0.7, 0.06, 6, 40), new THREE.MeshBasicMaterial({ color: 0xbfe9ff, transparent: true }));
    ring.rotation.x = -Math.PI / 2; ring.position.set(W.x, water.position.y + 0.15, W.z);
    const sign = makePillSprite('⚡ 감전 주의', { bg: '#0b1a2e', fg: '#9fe8ff', border: '#3fb0ff' }, 0.8); sign.position.set(W.x, 2.0, W.z);
    decor.add(water, ring, sign); poolRings.push(ring);
  }

  // ---------- 수정궁 (보스): 거울 호수 + 가운데 돌섬 + 남쪽 돌다리. 둘레 석순·돌기둥이 금빛·청록 빛으로 물에 거꾸로 비친다 ----------
  const palaceTop = [], palaceRefl = [];
  {
    const mirror = new THREE.Mesh(new THREE.CircleGeometry(P.lake + 0.5, 64), waterMaterial({ color: 0x14204a, roughness: 0.04, metalness: 0.3, transparent: true, opacity: 0.5, depthWrite: false }, { scale: 0.25, strength: 0.15, shine: 0.06, speed: 0.4 }));
    mirror.rotation.x = -Math.PI / 2; mirror.position.set(P.x, -0.25, P.z); mirror.renderOrder = 1; decor.add(mirror);
    for (let i = 0; i < 34; i++) { // 호숫가 석순 숲 (남쪽 다리 어귀는 비운다)
      const a = (i / 34) * Math.PI * 2 + rand(-0.05, 0.05), r = P.lake + rand(0.6, 3.2), x = P.x + Math.cos(a) * r, z = P.z + Math.sin(a) * r;
      if (Math.sin(a) > 0.8 || Math.hypot(x, z) > THUNDER.wallR - 3) continue;
      const h = rand(2.5, 9) * (Math.sin(a) < -0.5 ? 1.3 : 1), rr = rand(0.5, 1.1), c = [0xffc93d, 0x3dfff0, 0xb46bff][i % 3];
      palaceTop.push({ x, y: thunderHeight(x, z) + h / 2 - 0.1, z, sx: rr, sy: h, sz: rr, color: c });
      palaceRefl.push({ x, y: -0.25 - h / 2 + 0.05, z, sx: rr, sy: h, sz: rr, rx: Math.PI, color: c }); // 물에 비친 모습 (거꾸로)
      block(x, z, rr + 0.2);
    }
    const isl = new THREE.Mesh(new THREE.CylinderGeometry(P.island, P.island + 1.2, P.h + 12, 28), new THREE.MeshStandardMaterial({ color: 0x8a7f74, roughness: 0.9 })); // 깊은 호수 바닥까지
    isl.position.set(P.x, (P.h + 12) / 2 - 12 + 0.02, P.z); isl.receiveShadow = true; decor.add(isl);
    for (let i = 0; i < 6; i++) { // 섬 뒤쪽(북쪽) 반원의 큰 석순 왕관 — 라이츄의 왕좌
      const a = -Math.PI / 2 + (i - 2.5) * 0.42, x = P.x + Math.cos(a) * (P.island - 0.7), z = P.z + Math.sin(a) * (P.island - 0.7), h = 3 + (2.5 - Math.abs(i - 2.5)) * 1.4;
      palaceTop.push({ x, y: P.h + h / 2 - 0.05, z, sx: 0.55, sy: h, sz: 0.55, color: i % 2 ? 0xffc93d : 0xfff3b0 }); block(x, z, 0.6);
    }
    const len = B.z1 - B.z0 + 1; // 돌다리: 판석 + 난간 기둥
    const slab = new THREE.Mesh(new THREE.BoxGeometry(B.half * 2, 0.5, len), new THREE.MeshStandardMaterial({ color: 0x9a8f84, roughness: 0.9 }));
    slab.position.set(P.x, P.h - 0.24, (B.z0 + B.z1) / 2); slab.receiveShadow = true; slab.userData.noHide = true; decor.add(slab);
    const piers = []; for (let zz = B.z0 + 1; zz < B.z1 - 1; zz += 4) piers.push({ x: P.x, y: -6, z: zz, sx: 0.8, sy: 12.6, sz: 0.8 }); // 다리 기둥 (깊은 물속으로)
    decor.add(makeInstanced(new THREE.CylinderGeometry(1, 1.2, 1, 8), new THREE.MeshStandardMaterial({ color: 0x6f665c, roughness: 1 }), piers));
    const posts = []; for (let zz = B.z0 + 0.5; zz <= B.z1; zz += 2.2) for (const sx of [-1, 1]) posts.push({ x: P.x + sx * (B.half - 0.12), y: P.h + 0.35, z: zz, sx: 0.12, sy: 0.7, sz: 0.12, color: 0xffc93d });
    decor.add(makeInstanced(new THREE.CylinderGeometry(1, 1, 1, 6), stone.mat, posts));
    const light = new THREE.PointLight(0xffd98a, 5, 26); light.position.set(P.x, P.h + 5, P.z); decor.add(light);
    const sign = makePillSprite('🏯 수정궁 · 보스', { bg: '#20232e', fg: '#ffd93d', border: '#ffd93d' }, 1.3); sign.position.set(P.x, P.h + 7, P.z + 1); decor.add(sign);
    const bsign = makePillSprite('🌉 돌다리로 건너요', { bg: '#20232e', fg: '#fff1c8', border: '#ffd93d' }, 0.7); bsign.position.set(P.x + 2.8, 2, B.z1 + 0.5); decor.add(bsign);
  }
  decor.add(makeInstanced(titeGeo, stone.mat, palaceTop, { shadow: true }), makeInstanced(titeGeo, stone.mat, palaceRefl));

  // 번개: 가끔 천장에서 번쩍 — 온 동굴의 빛이 하얗게 번쩍인다 (전기가 넘친다)
  const flash = new THREE.PointLight(0xfff6e0, 0, 110); flash.position.set(0, 16, 0); decor.add(flash);
  const flashState = { next: 4, until: 0 };

  // 등불 기둥: 도착 지점에서 수정궁 다리까지 (길잡이)
  const lampMat = new THREE.MeshStandardMaterial({ color: 0xfff1b5, emissive: 0xffd36b, emissiveIntensity: 1.2 });
  for (let i = 0; i < 6; i++) {
    const x = (i % 2 ? 3.2 : -3.2), z = THUNDER.spawn.z - 8 - i * 12;
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 2.2, 8), new THREE.MeshStandardMaterial({ color: 0x3a3f4a })); post.position.set(x, thunderHeight(x, z) + 1.1, z);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), lampMat); lamp.position.set(x, thunderHeight(x, z) + 2.3, z);
    decor.add(post, lamp); block(x, z, 0.2);
  }

  // 포탈 (남쪽): 지하동굴로 돌아간다
  const portal = makePortal(scene, THUNDER.portal.x, thunderHeight(THUNDER.portal.x, THUNDER.portal.z), THUNDER.portal.z, { color: 0xffd23f, label: '지하동굴로 가는 포탈', labelBg: '#20232e', labelFg: '#ffd93d' });

  // 안내원 코리
  const guideAt = { x: 5, z: 44 };
  const guide = makeNpc({ outfit: 'astronaut', name: '코리', model: '코리.glb' });
  guide.position.set(guideAt.x, thunderHeight(guideAt.x, guideAt.z), guideAt.z); guide.rotation.y = -0.8;
  decor.add(guide); block(guideAt.x, guideAt.z, 0.6);
  const drop = new THREE.Mesh(new THREE.CircleGeometry(2.2, 24), new THREE.MeshBasicMaterial({ color: 0xfff1b5, transparent: true, opacity: 0.25 }));
  drop.rotation.x = -Math.PI / 2; drop.position.set(THUNDER.spawn.x, thunderHeight(THUNDER.spawn.x, THUNDER.spawn.z) + 0.03, THUNDER.spawn.z); scene.add(drop);
  const caveSign = makePillSprite('🌈 루디옌 동굴 · 전기로 빛나는 무지개 석회 동굴', { bg: '#20232e', fg: '#fff1c8', border: '#ff8ad8' }, 0.8);
  caveSign.position.set(-5, 2.6, THUNDER.spawn.z - 4); decor.add(caveSign);

  function animate(t) {
    for (const r of poolRings) { r.rotation.z = t * 0.8; r.material.opacity = 0.5 + Math.sin(t * 9 + r.position.x) * 0.5; }
    if (t > flashState.next) { flashState.next = t + rand(6, 11); flashState.until = t + 0.45; flash.position.set(rand(-30, 30), 16, rand(-30, 30)); }
    const on = t < flashState.until, k = on ? Math.max(0, Math.sin((flashState.until - t) / 0.45 * Math.PI)) : 0;
    stone.u.uTime.value = t; stone.u.uFlash.value = k * 0.4; /* 번개가 치면 빛이 하얗게 (너무 세면 무지개가 다 사라진다) */
    flash.intensity = k * 8;
    scene.fog.color.setHex(on ? 0x1a1630 : 0x07060f);
    portal.animate(t);
  }

  return {
    sun, animate, terrain: THUNDER_TERRAIN, decor, portal: THUNDER.portal, spawn: THUNDER.spawn, dark: true, noShrine: true,
    portalTo: 'cave', // 이 지역의 포탈은 푸른숲이 아니라 지하동굴로 간다
    npcs: [{ x: guideAt.x, z: guideAt.z, mesh: guide, name: '코리', warp: true, lines: (c) => [
      `번개동굴에 온 걸 환영해, ${c.name}! 난 우주비행사 코리야. 로켓 전기 회로를 공부하다 보니 전기 포켓몬에 빠졌지 뭐야.`,
      '여기는 중국 구이린의 루디옌 동굴을 닮았어. 진짜 그곳도 종유석과 석순이 무지갯빛 조명으로 빛나는 동굴이래!',
      '이 동굴 불빛은 전기 포켓몬들이 만든 전기로 켜져. 피카츄·코일·쥬피썬더·닌자피카츄가 살아. 가끔 번개가 치면 온 동굴이 하얗게 번쩍!',
      '푸른 웅덩이는 전기가 흐르는 물이야. 들어가면 찌릿! 감전되니까 절대 들어가지 마. 둘러서 가자.',
      '전기는 땅에 통하지 않아. 땅 포켓몬(디그다·탕구리)이 있으면 전기 공격을 하나도 안 맞는단다. 바위·땅 포켓몬으로 상대해 봐!',
      `여기 포켓몬은 세. 공격 ${c.zone.atkRange}쯤은 돼야 편하게 이겨. 지하동굴에서 레벨을 충분히 올리고 오렴.`,
      c.conquered.thunder ? '보스 라이츄를 이겼구나! 수정궁이 조용해졌어. 대단해!' : `등불 길 끝, 북쪽 수정궁 호수 가운데 돌섬에 보스 라이츄가 있어. 돌다리로 건너가. 체력 ${c.zone.bossHp || 100}에 공격이 세니까 공격 ${c.zone.targetAtk + 3} 이상, 체력 40쯤 되면 도전해 봐!`,
      '수정궁 호수는 거울처럼 잔잔해서 둘레 돌기둥이 물에 거꾸로 비쳐. 물에는 못 들어가니 다리로만 건너!',
      '남쪽의 노란 포탈로 나가면 지하동굴의 번개 굴 앞이야.',
    ] }],
    wildSpots: THUNDER_WILD.map(([x, z]) => [x, z]),
    bossSpot: { x: P.x, z: P.z },
    pickupSpots: THUNDER_PICKUPS.map(([x, z]) => [x, z]),
  };
}
