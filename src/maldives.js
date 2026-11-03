import * as THREE from 'three';
import { makeInstanced, makePillSprite } from './world.js';

// 물의길 = 몰디브 산호섬을 본뜬 구조물.
//  - 수상 빌라 마을: 1번 섬 동쪽 석호 위로 나무 산책로가 뻗고, 갈래마다 기둥 위 초가 오두막. 끝에는 계단으로 오르는 2층 전망대(3.4m).
//    산책로는 납작한 다리(rise 0)라 world.js 다리 규칙(bridgeHeightAt/onBridge)을 그대로 쓴다. 배는 산책로·오두막 사이를 못 지나간다.
//  - 모래톱 길: 도착 섬 서쪽에서 서북쪽 바깥 섬까지 굽이치는 흰 모래톱. 물 위로 살짝 드러나 걸어서 건너고, 배는 못 넘는다.
//  - 산호와 물고기: 섬 둘레 얕은 바다 밑에 알록달록한 산호, 물고기 떼가 빙글빙글 헤엄친다.
//  - 바다 아치: 동남쪽 먼바다의 거대한 바위 아치. 배를 타고 그 아래로 지나간다.

const TAU = Math.PI * 2;
function segNear(px, pz, ax, az, bx, bz) {
  const vx = bx - ax, vz = bz - az, L2 = vx * vx + vz * vz || 1;
  const t = Math.max(0, Math.min(1, ((px - ax) * vx + (pz - az) * vz) / L2));
  return { d: Math.hypot(px - (ax + vx * t), pz - (az + vz * t)), t };
}
function polyD(pts, x, z) { let d = Infinity; for (let i = 0; i + 1 < pts.length; i++) d = Math.min(d, segNear(x, z, ...pts[i], ...pts[i + 1]).d); return d; }

const DECK_Y0 = 0.25; // 산책로 바닥 (수면 -0.35 보다 0.68 위)
const seg = (x1, z1, x2, z2, w = 1.2) => ({ x1, z1, x2, z2, w, rise: 0, y0: DECK_Y0 });
// 수상 마을 산책로: 등뼈 길 + 오두막 갈래 셋 + 전망대 (오두막·전망대 판은 넓은 짧은 다리)
export const HUTS = [{ x: 70, z: 4, r: 1.7 }, { x: 78, z: 26, r: 1.7 }, { x: 87, z: -1, r: 1.7 }];
export const TOWER = { x: 97, z: 8, half: 2.4, H: 3.4, stair: [[89.6, 8], [94.6, 8]] }; // 전망대: 위층 정사각형 + 서쪽에서 올라가는 계단
export const WALKS = [
  seg(60, 18, 89, 9.6),                       // 등뼈 길 (1번 섬 동쪽 물가 → 전망대)
  seg(69, 15.6, 70, 6.6), seg(68, 4, 72, 4, 2.6),   // 오두막 A (남쪽)
  seg(77, 13.2, 78, 23.4), seg(76, 26, 80, 26, 2.6), // 오두막 B (북쪽)
  seg(85.4, 10.8, 86.8, 1.6), seg(85, -1, 89, -1, 2.6), // 오두막 C (남쪽)
  seg(89, 9.6, 101, 6.4, 3.2),                 // 전망대 아래 넓은 판
];
// 모래톱 길: 도착 섬(0번) 서쪽 → 서북쪽 바깥 섬(8번)
export const SANDBAR = { pts: [[-20, 74], [-38, 83], [-57, 79], [-71, 67], [-83, 62]], half: 2.6, edge: 4.5 };
export const ARCH = { x: 118, z: -62, span: 14, H: 10, leg: 2.6, dir: 0.5 }; // 바다 아치: 두 다리 사이로 배가 지나간다

/** 모래톱 높이 (없으면 null). 가운데 수면 위 0.35, 가장자리로 갈수록 바닷속으로 */
export function sandbarH(x, z, waterY) {
  const d = polyD(SANDBAR.pts, x, z); if (d > SANDBAR.half + SANDBAR.edge) return null;
  const top = waterY + 0.35; if (d <= SANDBAR.half) return top;
  return top - 1.6 * ((d - SANDBAR.half) / SANDBAR.edge);
}
function towerTopH(x, z) { return Math.abs(x - TOWER.x) < TOWER.half && Math.abs(z - TOWER.z) < TOWER.half ? TOWER.H : null; }
function stairH(x, z) {
  const [[ax, az], [bx, bz]] = TOWER.stair, r = segNear(x, z, ax, az, bx, bz); if (r.d > 0.8) return null;
  return TOWER.H * r.t;
}
/** 전망대 2층·계단 (겹치는 층: 지금 높이+0.7 아래일 때만). deck: 산책로 바닥 높이 */
export function seaStructHeight(x, z, refY, ground) {
  let best = ground; const lim = (refY ?? ground) + 0.7, base = DECK_Y0 + 0.08;
  for (const h of [towerTopH(x, z), stairH(x, z)]) if (h != null && h > 0.02 && base + h <= lim) best = Math.max(best, base + h);
  return best;
}
export function seaStructCeiling(x, z, y) { const base = DECK_Y0 + 0.08; let c = Infinity; for (const h of [towerTopH(x, z), stairH(x, z)]) if (h != null && base + h > y + 0.5) c = Math.min(c, base + h); return c; }
/** 전망대 위 난간 (위층에 서 있을 때 가장자리 바깥, 계단 쪽은 터 있다) */
export function seaStructBlocked(x, z, refY) {
  const y = (refY ?? 0) - (DECK_Y0 + 0.08), sh = stairH(x, z);
  if (sh != null && sh > 0.7 && y < sh - 0.7) return true; // 계단 옆구리: 아래로 파고들지 않는다
  if (y < TOWER.H - 0.6) return false;
  const dx = Math.abs(x - TOWER.x), dz = Math.abs(z - TOWER.z), m = Math.max(dx, dz);
  if (m <= TOWER.half || m > TOWER.half + 0.9) return false;
  return !(x < TOWER.x - TOWER.half + 0.2 && Math.abs(z - TOWER.stair[1][1]) < 1.0); // 계단 꼭대기 쪽(서쪽)은 열려 있다
}
/** 배가 못 가는 곳: 산책로·오두막·모래톱 둘레, 아치 다리 */
export function seaSailBlock(x, z) {
  for (const b of WALKS) if (segNear(x, z, b.x1, b.z1, b.x2, b.z2).d < b.w + 1.6) return true;
  if (polyD(SANDBAR.pts, x, z) < SANDBAR.half + 2) return true;
  const ax = Math.cos(ARCH.dir), az = Math.sin(ARCH.dir);
  for (const s of [-1, 1]) if (Math.hypot(x - (ARCH.x + ax * s * ARCH.span / 2), z - (ARCH.z + az * s * ARCH.span / 2)) < ARCH.leg + 1.2) return true;
  return false;
}
/** 헤엄치는 포켓몬·블록 자리 비켜 놓기 */
export function seaClear(x, z, m = 3) { return !seaSailBlock(x, z) && WALKS.every((b) => segNear(x, z, b.x1, b.z1, b.x2, b.z2).d > b.w + m); }

export function buildSeaStructures(scene, decor, { height, waterY, islands, obstacles }) {
  const wood = new THREE.MeshStandardMaterial({ color: 0xc9955a, roughness: 0.85 }), woodDark = new THREE.MeshStandardMaterial({ color: 0x8a5a2b, roughness: 0.9 });
  const thatch = new THREE.MeshStandardMaterial({ color: 0xd8b46a, roughness: 1 }), wall = new THREE.MeshStandardMaterial({ color: 0xf6efe0, roughness: 0.9 });
  const add = (m, radius = null) => { if (radius) m.userData.radius = radius; decor.add(m); return m; };
  const deckTop = DECK_Y0 + 0.08;

  // ----- 수상 마을: 산책로 기둥 (다리 판은 sea.js 가 buildBridge 로 그린다) + 오두막 + 전망대 -----
  const planks = []; // 산책로 판자 (난간 없이 낮게: 갈래가 만나는 곳을 막지 않게. 물에는 원래 못 들어가니 떨어지지 않는다)
  for (const b of WALKS) { const len = Math.hypot(b.x2 - b.x1, b.z2 - b.z1), n = Math.max(3, Math.round(len / 0.55)), ry = Math.atan2(b.x2 - b.x1, b.z2 - b.z1); for (let i = 0; i < n; i++) { const t = (i + 0.5) / n; planks.push({ x: b.x1 + (b.x2 - b.x1) * t, y: deckTop - 0.07, z: b.z1 + (b.z2 - b.z1) * t, sx: b.w * 2 + 0.2, sy: 0.14, sz: len / n - 0.07, ry, color: i % 3 ? 0xc9955a : 0xb9854a }); } }
  decor.add(makeInstanced(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85 }), planks, { shadow: false }));
  const stilts = [];
  for (const b of WALKS) { const len = Math.hypot(b.x2 - b.x1, b.z2 - b.z1), n = Math.max(2, Math.round(len / 3)); for (let i = 0; i <= n; i++) { const t = i / n, x = b.x1 + (b.x2 - b.x1) * t, z = b.z1 + (b.z2 - b.z1) * t, nx = -(b.z2 - b.z1) / len, nz = (b.x2 - b.x1) / len; for (const s of [-1, 1]) { const px = x + nx * b.w * s, pz = z + nz * b.w * s, gy = height(px, pz); if (gy > deckTop - 0.2) continue; stilts.push({ x: px, y: (gy + deckTop) / 2, z: pz, sx: 0.14, sy: deckTop - gy, sz: 0.14 }); } } }
  decor.add(makeInstanced(new THREE.CylinderGeometry(1, 1, 1, 6), woodDark, stilts));
  for (const h of HUTS) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(3.0, 2.2, 2.4), wall); body.position.y = 1.1; body.castShadow = true; g.add(body);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(2.7, 1.8, 4), thatch); roof.position.y = 3.0; roof.rotation.y = Math.PI / 4; roof.scale.set(1.25, 1, 1.05); roof.castShadow = true; g.add(roof);
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.4, 0.06), woodDark); door.position.set(0, 0.7, 1.23); g.add(door);
    for (const sx of [-0.95, 0.95]) { const win = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.5, 0.06), new THREE.MeshStandardMaterial({ color: 0x9fe8ff, emissive: 0x2a8ab0, emissiveIntensity: 0.3 })); win.position.set(sx, 1.3, 1.23); g.add(win); }
    const hammock = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 1.8, 10, 1, true, 0, Math.PI), new THREE.MeshStandardMaterial({ color: 0xe8453c, side: THREE.DoubleSide })); hammock.rotation.z = Math.PI / 2; hammock.position.set(0, 0.55, -1.9); g.add(hammock);
    g.position.set(h.x, deckTop, h.z); g.rotation.y = h.z > 10 ? Math.PI : 0; // 문이 산책로 쪽을 본다
    add(g, 3); obstacles.push({ x: h.x, z: h.z, r: h.r });
  }
  {
    const { x, z, half, H } = TOWER, g = new THREE.Group(); // 그룹 자리 = 전망대 가운데 (카메라 가림 판정이 그룹 위치를 본다)
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, H, 6), woodDark); p.position.set(sx * (half - 0.2), H / 2, sz * (half - 0.2)); g.add(p); obstacles.push({ x: x + sx * (half - 0.2), z: z + sz * (half - 0.2), r: 0.25 }); }
    const top = new THREE.Mesh(new THREE.BoxGeometry(half * 2, 0.2, half * 2), wood); top.position.set(0, H - 0.1, 0); top.castShadow = top.receiveShadow = true; g.add(top);
    for (const [sx, sz, w, d] of [[0, -1, half * 2, 0.1], [0, 1, half * 2, 0.1], [1, 0, 0.1, half * 2], [-1, -0.6, 0.1, half * 0.8], [-1, 0.6, 0.1, half * 0.8]]) { const r = new THREE.Mesh(new THREE.BoxGeometry(w, 0.1, d), woodDark); r.position.set(sx * half, H + 0.9, sz * half); g.add(r); }
    const roof = new THREE.Mesh(new THREE.ConeGeometry(half * 1.6, 1.6, 4), thatch); roof.rotation.y = Math.PI / 4; roof.position.set(0, H + 3.0, 0); g.add(roof);
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 2.3, 5), woodDark); p.position.set(sx * (half - 0.2), H + 1.15, sz * (half - 0.2)); g.add(p); }
    g.position.set(x, deckTop, z); add(g, 4);
    const [[ax, az], [bx, bz]] = TOWER.stair, n = 8;
    for (let i = 0; i < n; i++) { const t = (i + 0.5) / n, st = new THREE.Mesh(new THREE.BoxGeometry(Math.hypot(bx - ax, bz - az) / n + 0.05, 0.16, 1.6), wood); st.userData.noHide = true; st.position.set(ax + (bx - ax) * t, deckTop + H * t, az + (bz - az) * t); decor.add(st); }
    const sign = makePillSprite('🏝 수상 빌라 전망대 · 계단으로 올라가!', { bg: '#1f5f7a', fg: '#ffffff', border: '#9fe8ff' }, 0.75); sign.position.set(x - 4, deckTop + 2.4, z - 4); decor.add(sign);
    const sign2 = makePillSprite('🛖 수상 빌라 마을 →', { bg: '#6a4a00', fg: '#ffffff', border: '#ffd93d' }, 0.75); sign2.position.set(62, deckTop + 2.4, 20.5); decor.add(sign2);
  }

  // ----- 모래톱 길: 조개·불가사리·떠밀려 온 나무 + 표지판 -----
  {
    const shells = [];
    for (let i = 0; i < 70; i++) { const k = Math.floor(Math.random() * (SANDBAR.pts.length - 1)), t = Math.random(), [ax, az] = SANDBAR.pts[k], [bx, bz] = SANDBAR.pts[k + 1], off = (Math.random() - 0.5) * SANDBAR.half * 1.6, l = Math.hypot(bx - ax, bz - az); const x = ax + (bx - ax) * t + (-(bz - az) / l) * off, z = az + (bz - az) * t + ((bx - ax) / l) * off; const r = 0.1 + Math.random() * 0.1; shells.push({ x, y: height(x, z) + 0.02, z, sx: r, sy: r * 0.45, sz: r * 1.2, ry: Math.random() * 3, color: [0xffffff, 0xffc3a0, 0xff8a6b, 0xf6e3b4][i % 4] }); }
    decor.add(makeInstanced(new THREE.SphereGeometry(1, 6, 4), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 }), shells));
    const [sx, sz] = SANDBAR.pts[0], sign = makePillSprite('🏖 모래톱 길 · 걸어서 서북쪽 섬까지', { bg: '#6a4a00', fg: '#ffffff', border: '#ffd93d' }, 0.75); sign.position.set(sx - 1, height(sx, sz) + 2.6, sz + 3); decor.add(sign);
  }

  // ----- 산호: 섬 둘레 얕은 바다 밑 (가지 산호 · 둥근 산호 · 부채 산호) -----
  {
    const branch = [], brain = [], fan = [];
    const colors = [0xff6b9d, 0xff8c42, 0xb388ff, 0xffd93d, 0x4fd6c8, 0xff5a5a];
    let tries = 0;
    while (branch.length + brain.length + fan.length < 520 && tries++ < 6000) {
      const I = islands[Math.floor(Math.random() * islands.length)], a = Math.random() * TAU, d = I.r * (0.9 + Math.random() * 0.7), x = I.x + Math.cos(a) * d, z = I.z + Math.sin(a) * d, y = height(x, z);
      if (y > waterY - 0.35 || y < waterY - 1.3 || polyD(SANDBAR.pts, x, z) < SANDBAR.half + 1) continue;
      const c = colors[Math.floor(Math.random() * colors.length)], kind = Math.random(), room = waterY - 0.15 - y; // 물 밖으로 삐져나오지 않게 수면 아래까지만
      if (kind < 0.45) for (let k = 0; k < 3; k++) { const sy = Math.min(0.5 + Math.random() * 0.4, room); branch.push({ x: x + (Math.random() - 0.5) * 0.6, y: y + sy / 2, z: z + (Math.random() - 0.5) * 0.6, sx: 0.12, sy, sz: 0.12, rx: (Math.random() - 0.5) * 0.5, rz: (Math.random() - 0.5) * 0.5, color: c }); }
      else if (kind < 0.8) brain.push({ x, y: y + 0.05, z, sx: 0.45 + Math.random() * 0.3, sy: Math.min(0.3, room), sz: 0.45 + Math.random() * 0.3, color: c });
      else { const r = Math.min(0.55, room / 2); fan.push({ x, y: y + r, z, sx: r, sy: r, sz: 1, ry: Math.random() * 3, color: c }); }
    }
    const coralMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, emissive: 0x111111 });
    decor.add(makeInstanced(new THREE.CylinderGeometry(0.6, 1, 1, 5), coralMat, branch));
    decor.add(makeInstanced(new THREE.SphereGeometry(1, 10, 6), coralMat, brain));
    decor.add(makeInstanced(new THREE.CircleGeometry(1, 10), new THREE.MeshStandardMaterial({ color: 0xffffff, side: THREE.DoubleSide, roughness: 0.8 }), fan));
  }

  // ----- 물고기 떼: 섬 둘레 얕은 바다에서 빙글빙글 (매 프레임 자리만 바꾼다) -----
  const schools = [];
  const fishMesh = new THREE.InstancedMesh(new THREE.ConeGeometry(0.12, 0.42, 5).rotateZ(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 }), 72);
  {
    const col = new THREE.Color(), fishColors = [0xffa020, 0x3fd0ff, 0xffe23f, 0xff6b9d];
    for (let s = 0; s < 9; s++) { const I = islands[s % islands.length], a = s * 2.4, d = I.r * 1.6; schools.push({ x: I.x + Math.cos(a) * d, z: I.z + Math.sin(a) * d, r: 2 + Math.random() * 2.5, sp: 0.5 + Math.random() * 0.5, ph: Math.random() * TAU }); }
    for (let i = 0; i < 72; i++) fishMesh.setColorAt(i, col.set(fishColors[Math.floor(i / 8) % fishColors.length]));
    fishMesh.frustumCulled = false; decor.add(fishMesh);
  }
  // ----- 바다 아치 -----
  {
    const { x, z, span, H, leg, dir } = ARCH, rock = new THREE.MeshStandardMaterial({ color: 0xb59a78, roughness: 1 });
    const g = new THREE.Group();
    for (const s of [-1, 1]) { const l = new THREE.Mesh(new THREE.CylinderGeometry(leg * 0.8, leg * 1.15, H, 9), rock); l.position.set(s * span / 2, waterY + H / 2 - 1, 0); l.castShadow = true; g.add(l); }
    const top = new THREE.Mesh(new THREE.TorusGeometry(span / 2, leg * 0.85, 8, 18, Math.PI), rock); top.position.y = waterY + H - 1; top.scale.z = 0.8; g.add(top);
    const moss = new THREE.Mesh(new THREE.SphereGeometry(span * 0.32, 12, 6, 0, TAU, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x5fb648 })); moss.scale.y = 0.3; moss.position.y = waterY + H - 1 + span / 2 + leg * 0.4; g.add(moss);
    g.position.set(x, 0, z); g.rotation.y = -dir; add(g, span);
    const sign = makePillSprite('🪨 바다 아치 · 배로 아래를 지나가 봐!', { bg: '#20232e', fg: '#ffd93d', border: '#ffd93d' }, 1.1); sign.position.set(x, waterY + H + 3.5, z); decor.add(sign);
  }

  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3(1, 1, 1);
  return {
    animate(t) {
      let k = 0;
      for (const s of schools) for (let i = 0; i < 8; i++, k++) {
        const a = t * s.sp + s.ph + i * 0.32, rr = s.r + Math.sin(i * 1.7) * 0.5;
        v.set(s.x + Math.cos(a) * rr, waterY - 0.55 + Math.sin(a * 2 + i) * 0.12, s.z + Math.sin(a) * rr);
        e.set(0, -a - Math.PI / 2 * Math.sign(s.sp), 0); q.setFromEuler(e); fishMesh.setMatrixAt(k, m4.compose(v, q, sc));
      }
      fishMesh.instanceMatrix.needsUpdate = true;
    },
  };
}
