import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeInstanced, makePillSprite } from './world.js';

// 포켓몬 마을 = 오스트리아 할슈타트를 본뜬 구조물.
//  - 할슈타트 호수: 마을 동북쪽의 커다란 호수. 나무 잔교 끝에 보트 창고, 하얀 백조가 떠다닌다.
//  - 계단식 언덕 마을: 호수 북쪽 산비탈을 따라 세 단(한 단 2.2m)으로 쌓인 알프스 집들. 단과 단은 돌계단으로만 오른다 (뛰어서는 못 오른다).
//  - 호숫가 교회: 첫째 단 위, 뾰족한 첨탑의 하얀 교회.
//  - 스카이워크 전망대: 맨 윗단에서 허공으로 쑥 내민 전망대 (아랫단에서는 그 밑으로 지나간다).
//  - 다흐슈타인 설산: 마을 둘레의 눈 덮인 큰 산.
//  - 건물 겉모습: 지우네 집은 알프스 목조 샬레, 연구소는 다운 하우스, 학교는 옥스퍼드 고딕 건물, 아레나는 콜로세움.

const TAU = Math.PI * 2;
export const LAKE = { x: 60, z: -32, r: 18 };
export const PIER = { x1: 41.5, z1: -32, x2: 56, z2: -32, w: 1.3, rise: 0 };
export const BOATHOUSE = { x: 58.6, z: -32, hw: 2, hd: 1.8 };
export const TERR = { x0: 28, x1: 104, edges: [-54, -64, -74], step: 2.2 };
export const STAIRS = [{ x: 48, k: 0 }, { x: 84, k: 1 }, { x: 60, k: 2 }].map((s) => ({ ...s, half: 1.4, run: 2.6 }));
export const CHURCH = { x: 37, z: -59.5, hw: 5, hd: 3 }; // 긴 쪽이 x (단 폭 10m 안에 들어가게), 탑은 동쪽 끝
export const SKYWALK = { x0: 66, x1: 72, z0: -74, z1: -67.5, top: 6.75 };

function terraceLevel(x, z) {
  if (x < TERR.x0 || x > TERR.x1) return 0;
  let n = 0; for (const e of TERR.edges) if (z <= e) n++;
  return n * TERR.step;
}
function stairH(x, z) {
  for (const s of STAIRS) {
    const e = TERR.edges[s.k]; if (Math.abs(x - s.x) > s.half || Math.abs(z - e) > s.run) continue;
    const t = (e + s.run - z) / (2 * s.run); return s.k * TERR.step + TERR.step * Math.max(0, Math.min(1, t));
  }
  return null;
}
function inSky(x, z) { return x > SKYWALK.x0 && x < SKYWALK.x1 && z < SKYWALK.z1 && z > SKYWALK.z0 - 0.5; }

/** 언덕 단·돌계단(단단한 것) + 스카이워크(겹친 층: 지금 높이+0.7 아래일 때만) */
export function hallstattHeight(x, z, refY, ground) {
  const sh = stairH(x, z); // 돌계단 자리는 계단이 단 높이를 대신한다 (단 가장자리에서 툭 끊기지 않게)
  let y = Math.max(ground, sh ?? terraceLevel(x, z));
  if (inSky(x, z) && SKYWALK.top <= (refY ?? y) + 0.7) y = Math.max(y, SKYWALK.top);
  return y;
}
export function hallstattCeiling(x, z, y) { return inSky(x, z) && y < SKYWALK.top - 0.5 ? SKYWALK.top - 0.15 : Infinity; }
/** 스카이워크 난간 (윗단 쪽만 열려 있다) */
export function hallstattBlocked(x, z, refY) {
  if ((refY ?? 0) < SKYWALK.top - 0.5) return false;
  const inX = x > SKYWALK.x0 - 0.8 && x < SKYWALK.x1 + 0.8, inZ = z < SKYWALK.z1 + 0.8 && z > SKYWALK.z0;
  return inX && inZ && !inSky(x, z) && z > SKYWALK.z0 + 0.3;
}
/** 나무·꽃·사람이 구조물 자리를 피할 때 */
export function hallstattClear(x, z, m = 2) {
  if (Math.hypot(x - LAKE.x, z - LAKE.z) < LAKE.r + 2 + m) return false;
  if (x > TERR.x0 - m && x < TERR.x1 + m && z < TERR.edges[0] + m) return false; // 언덕 마을 (단 위는 집이 차 있다)
  return true;
}

// ---------- 건물 겉모습 ----------
/** 한 건물의 작은 조각들을 재질(색)마다 하나로 합친다 — 집 하나가 조각 14개면 그리기 14번이 3~5번으로 준다 (마을이 느려지지 않게) */
export function mergeGroup(root) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert(), buckets = new Map(), keep = [], col = new THREE.Color();
  root.traverse((o) => {
    if (o === root) return;
    if (o.isGroup || (!o.isMesh && !o.isSprite && !o.isPoints)) return; // 묶음(그룹)은 속만 합친다
    if (!o.isMesh || o.isInstancedMesh || Array.isArray(o.material)) { keep.push(o); return; } // 인스턴스·스프라이트는 그대로 옮긴다
    const m = o.material, glow = m.emissive && m.emissive.getHex() !== 0 && m.emissiveIntensity > 0;
    // 색은 꼭짓점 색으로 굽고, 재질 종류(투명·빛남·양면·각진 면)가 같으면 한 덩이로 그린다
    const key = [m.type, m.transparent, m.opacity, m.side, m.flatShading, m.map?.uuid, glow ? m.emissive.getHex() + '/' + m.emissiveIntensity : '', m.metalness > 0.3].join('|');
    let geo = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    for (const k of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv'].includes(k)) geo.deleteAttribute(k);
    if (!geo.attributes.uv) geo.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
    const n = geo.attributes.position.count, cols = new Float32Array(n * 3); col.copy(m.color || col.set(0xffffff));
    for (let i = 0; i < n; i++) { cols[i * 3] = col.r; cols[i * 3 + 1] = col.g; cols[i * 3 + 2] = col.b; }
    geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    geo.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
    if (!buckets.has(key)) { const mat = m.clone(); mat.color?.set(0xffffff); mat.vertexColors = true; buckets.set(key, { mat, geos: [], shadow: false, order: o.renderOrder }); }
    const b = buckets.get(key); b.geos.push(geo); b.shadow ||= o.castShadow; b.order = Math.max(b.order, o.renderOrder);
  });
  const out = new THREE.Group();
  for (const b of buckets.values()) { const mesh = new THREE.Mesh(mergeGeometries(b.geos, false), b.mat); mesh.castShadow = b.shadow; mesh.receiveShadow = !b.mat.transparent; mesh.renderOrder = b.order; out.add(mesh); }
  for (const o of keep) { o.updateMatrixWorld(true); const m = new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld); m.decompose(o.position, o.quaternion, o.scale); out.add(o); } // 묶음 속 자리를 그대로
  return out;
}
const M = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.85, ...o });
function gable(w, d, h, mat) { // 박공지붕 (삼각 기둥)
  const s = new THREE.Shape(); s.moveTo(-w / 2, 0); s.lineTo(w / 2, 0); s.lineTo(0, h); s.lineTo(-w / 2, 0);
  const g = new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: false }); g.translate(0, 0, -d / 2);
  const m = new THREE.Mesh(g, mat); m.castShadow = true; return m;
}
/** 알프스 집: 아래층 회반죽 벽 + 위층 짙은 나무 + 발코니 꽃상자 + 넓은 박공지붕. 앞(+z)에 문 */
export function alpineHouse({ w = 5, d = 4.4, h = 2.4, wall = 0xfff6e6, roof = 0x6a3a22, accent = 0xe8453c } = {}) {
  const g = new THREE.Group();
  const low = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), M(wall)); low.position.y = h / 2; low.castShadow = true; g.add(low);
  const up = new THREE.Mesh(new THREE.BoxGeometry(w, h * 0.9, d), M(0x7a4a2a)); up.position.y = h + h * 0.45; up.castShadow = true; g.add(up);
  const r = gable(w + 1.1, d + 1.0, w * 0.42, M(roof)); r.position.y = h * 1.9; g.add(r); // 박공이 앞을 본다
  const bal = new THREE.Mesh(new THREE.BoxGeometry(w * 0.8, 0.12, 0.8), M(0x5a3420)); bal.position.set(0, h + 0.1, d / 2 + 0.4); g.add(bal);
  const rail = new THREE.Mesh(new THREE.BoxGeometry(w * 0.8, 0.5, 0.08), M(0x5a3420)); rail.position.set(0, h + 0.4, d / 2 + 0.8); g.add(rail);
  const flowers = new THREE.Mesh(new THREE.BoxGeometry(w * 0.78, 0.22, 0.3), M(accent, { emissive: accent, emissiveIntensity: 0.15 })); flowers.position.set(0, h + 0.75, d / 2 + 0.82); g.add(flowers);
  const door = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.6, 0.08), M(0x5a3420)); door.position.set(-w * 0.22, 0.8, d / 2 + 0.03); g.add(door);
  const winM = M(0x9fe8ff, { emissive: 0x4fc3f7, emissiveIntensity: 0.25 });
  for (const wx of [w * 0.22]) { const win = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.7, 0.08), winM); win.position.set(wx, 1.3, d / 2 + 0.03); g.add(win); const fb = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.16, 0.25), M(accent)); fb.position.set(wx, 0.9, d / 2 + 0.12); g.add(fb); }
  for (const wx of [-w * 0.25, w * 0.25]) { const win = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 0.08), winM); win.position.set(wx, h + h * 0.55, d / 2 + 0.03); g.add(win); }
  const chim = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.4, 0.5), M(0x9a8e86)); chim.position.set(w * 0.25, h * 1.9 + w * 0.3, -d * 0.2); g.add(chim);
  return mergeGroup(g);
}
/** 지우네 집 = 알프스 목조 샬레 (발자국 W×D 는 예전 그대로, 문은 +z) */
export function chaletHome(W, H, D) {
  const g = new THREE.Group();
  const stone = new THREE.Mesh(new THREE.BoxGeometry(W, 1.0, D), M(0xb8b0a4)); stone.position.y = 0.2; g.add(stone);
  const low = new THREE.Mesh(new THREE.BoxGeometry(W, H * 0.55, D), M(0xfff6e6)); low.position.y = 0.7 + H * 0.275; low.castShadow = true; g.add(low);
  const up = new THREE.Mesh(new THREE.BoxGeometry(W, H * 0.6, D), M(0x8a5a32)); up.position.y = 0.7 + H * 0.55 + H * 0.3; up.castShadow = true; g.add(up);
  for (let i = -3; i <= 3; i++) { const plank = new THREE.Mesh(new THREE.BoxGeometry(0.06, H * 0.6, D + 0.02), M(0x6a3e20)); plank.position.set(i * W / 7, up.position.y, 0); g.add(plank); }
  const roof = gable(W + 1.6, D + 1.6, W * 0.45, M(0x4a2a1a)); roof.position.y = 0.7 + H * 1.15; g.add(roof);
  const bal = new THREE.Mesh(new THREE.BoxGeometry(W * 0.86, 0.14, 1.0), M(0x5a3420)); bal.position.set(0, 0.7 + H * 0.58, D / 2 + 0.5); g.add(bal);
  const rail = new THREE.Mesh(new THREE.BoxGeometry(W * 0.86, 0.6, 0.08), M(0x5a3420)); rail.position.set(0, 0.7 + H * 0.58 + 0.35, D / 2 + 1.0); g.add(rail);
  const geran = new THREE.Mesh(new THREE.BoxGeometry(W * 0.84, 0.28, 0.32), M(0xe8203a, { emissive: 0x500010 })); geran.position.set(0, 0.7 + H * 0.58 + 0.75, D / 2 + 1.02); g.add(geran);
  const leaves = new THREE.Mesh(new THREE.BoxGeometry(W * 0.84, 0.16, 0.34), M(0x3f8a3a)); leaves.position.set(0, 0.7 + H * 0.58 + 0.56, D / 2 + 1.02); g.add(leaves);
  const chim = new THREE.Mesh(new THREE.BoxGeometry(0.7, 2.0, 0.7), M(0x9a8e86)); chim.position.set(W * 0.28, 0.7 + H * 1.15 + 1.4, -D * 0.2); chim.castShadow = true; g.add(chim);
  const winM = M(0xffe6a8, { emissive: 0xffb347, emissiveIntensity: 0.35 });
  for (const wx of [-W * 0.3, W * 0.3]) { const win = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.9, 0.08), winM); win.position.set(wx, 0.7 + H * 0.88, D / 2 + 0.03); g.add(win); for (const s of [-1, 1]) { const sh = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.95, 0.06), M(0x2f6f3a)); sh.position.set(wx + s * 0.68, win.position.y, D / 2 + 0.05); g.add(sh); } }
  const gableWin = new THREE.Mesh(new THREE.CircleGeometry(0.4, 16), winM); gableWin.position.set(0, 0.7 + H * 1.15 + 1.1, D / 2 + 0.81); g.add(gableWin);
  return mergeGroup(g);
}
/** 연구소 = 다운 하우스: 하얀 회반죽 벽의 조지 왕조풍 시골집 + 3층 돌출 창(베이 윈도) + 회색 슬레이트 지붕·높은 굴뚝 + 담쟁이 + 옆의 작은 온실. 문은 -z */
export function downHouseOut(W, H, D) {
  const g = new THREE.Group(), white = M(0xf4f0e6), trim = M(0xffffff), slate = M(0x5a6070), winM = M(0xbfe4ff, { emissive: 0x3a6fb0, emissiveIntensity: 0.3 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(W, H, D), white); body.position.y = H / 2; body.castShadow = true; g.add(body);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(Math.hypot(W, D) * 0.56, 2.6, 4), slate); roof.rotation.y = Math.PI / 4; roof.scale.set(W / Math.hypot(W, D) * 1.45, 1, D / Math.hypot(W, D) * 1.45); roof.position.y = H + 1.3; roof.castShadow = true; g.add(roof);
  const cornice = new THREE.Mesh(new THREE.BoxGeometry(W + 0.4, 0.25, D + 0.4), trim); cornice.position.y = H; g.add(cornice);
  for (const sx of [-0.33, 0.33]) { const ch = new THREE.Mesh(new THREE.BoxGeometry(0.9, 3.2, 0.9), M(0xb06a4a)); ch.position.set(sx * W, H + 2.0, 0); ch.castShadow = true; g.add(ch); }
  // 앞(-z)면: 창 두 줄 + 가운데 문 위 부채꼴 창 / 뒤(+z)면: 3층 돌출 창
  for (const wy of [1.8, 4.4]) for (const wx of [-W * 0.35, -W * 0.18, W * 0.18, W * 0.35]) { const w = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.5, 0.08), winM); w.position.set(wx, wy, -D / 2 - 0.03); g.add(w); const sill = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.1, 0.18), trim); sill.position.set(wx, wy - 0.8, -D / 2 - 0.08); g.add(sill); }
  const door = new THREE.Mesh(new THREE.BoxGeometry(1.6, 2.6, 0.12), M(0x2f4a3a)); door.position.set(0, 1.3, -D / 2 - 0.05); g.add(door);
  const fan = new THREE.Mesh(new THREE.CircleGeometry(0.8, 16, 0, Math.PI), winM); fan.position.set(0, 2.62, -D / 2 - 0.06); fan.rotation.y = Math.PI; g.add(fan);
  for (const s of [-1, 1]) { const col = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 2.8, 8), trim); col.position.set(s * 1.1, 1.4, -D / 2 - 0.6); g.add(col); }
  const porch = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.2, 1.2), trim); porch.position.set(0, 2.9, -D / 2 - 0.5); g.add(porch);
  const bay = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, H, 6, 1, false, 0, Math.PI), white); bay.position.set(-W * 0.2, H / 2, D / 2); bay.rotation.y = -Math.PI / 2; g.add(bay);
  for (const wy of [1.8, 4.4]) for (const a of [0.5, 1.57, 2.64]) { const w = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.4, 0.08), winM); w.position.set(-W * 0.2 + Math.cos(a) * 2.38, wy, D / 2 + Math.sin(a) * 2.38); w.rotation.y = Math.PI / 2 - a; g.add(w); }
  // 담쟁이 (벽에 붙은 초록 덩이)
  const ivy = []; for (let i = 0; i < 26; i++) { const x = W / 2 - 0.05, z = -D / 2 + 1 + Math.random() * (D - 2), y = 0.5 + Math.random() * (H - 1); ivy.push({ x, y, z, sx: 0.18, sy: 0.6 + Math.random() * 0.6, sz: 0.6 + Math.random() * 0.6 }); }
  g.add(makeInstanced(new THREE.SphereGeometry(1, 6, 5), M(0x3f7d2a), ivy));
  // 옆(서쪽)의 작은 온실
  const glass = new THREE.MeshStandardMaterial({ color: 0xd8f6ff, transparent: true, opacity: 0.45, side: THREE.DoubleSide, depthWrite: false });
  const gh = new THREE.Mesh(new THREE.BoxGeometry(3.2, 2.4, 5), glass); gh.position.set(-W / 2 - 1.6, 1.2, 1); g.add(gh);
  const ghRoof = new THREE.Mesh(new THREE.ConeGeometry(3.0, 1.2, 4), glass); ghRoof.rotation.y = Math.PI / 4; ghRoof.scale.set(0.8, 1, 1.25); ghRoof.position.set(-W / 2 - 1.6, 3.0, 1); g.add(ghRoof);
  const plants = new THREE.Mesh(new THREE.IcosahedronGeometry(0.9, 0), M(0x4f9a3a, { flatShading: true })); plants.position.set(-W / 2 - 1.6, 0.9, 1); g.add(plants);
  return mergeGroup(g);
}
/** 학교 = 옥스퍼드 고딕 건물: 꿀빛 석회암 벽, 뾰족 아치 창, 톱니 난간, 가운데 톰 타워(팔각 탑). 문은 +z */
export function oxfordSchool(W, H, D) {
  const g = new THREE.Group(), stone = M(0xe2c88e), stoneD = M(0xc9ad72), winM = M(0x9fd0ff, { emissive: 0x3a6fb0, emissiveIntensity: 0.35 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(W, H + 0.6, D), stone); body.position.y = H / 2 - 0.3; body.castShadow = true; g.add(body);
  const roof = gable(D + 0.6, W + 0.4, 2.6, M(0x5a6070)); roof.position.y = H + 0.3; roof.rotation.y = Math.PI / 2; g.add(roof); // 용마루가 긴 쪽(x)
  const merlons = [];
  for (let x = -W / 2 + 0.4; x <= W / 2 - 0.3; x += 0.9) for (const s of [-1, 1]) merlons.push({ x, y: H + 0.55, z: s * (D / 2 + 0.05), sx: 0.45, sy: 0.5, sz: 0.3 });
  g.add(makeInstanced(new THREE.BoxGeometry(1, 1, 1), stoneD, merlons));
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.45, H + 2.4, 8), stoneD); p.position.set(sx * W / 2, (H + 2.4) / 2 - 0.3, sz * D / 2); g.add(p); const cap = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.4, 8), stoneD); cap.position.set(sx * W / 2, H + 2.8, sz * D / 2); g.add(cap); }
  const arches = [];
  for (const wy of [1.9, 4.5]) for (const wx of [-7, -4.6, 4.6, 7]) { arches.push([wx, wy]); }
  for (const [wx, wy] of arches) {
    const w = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.5, 0.1), winM); w.position.set(wx, wy, D / 2 + 0.05); g.add(w);
    const top = new THREE.Mesh(new THREE.ConeGeometry(0.62, 0.7, 4), winM); top.rotation.y = Math.PI / 4; top.scale.z = 0.15; top.position.set(wx, wy + 1.05, D / 2 + 0.05); g.add(top);
  }
  for (const wz of [-3, 0, 3]) for (const side of [-1, 1]) { const w = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.2, 1.2), winM); w.position.set(side * (W / 2 + 0.05), 3.0, wz); g.add(w); }
  // 톰 타워: 문 위로 솟은 사각 탑 + 팔각 꼭대기
  const tw = new THREE.Mesh(new THREE.BoxGeometry(4.4, H + 3.4, 3.4), stone); tw.position.set(0, (H + 3.4) / 2 - 0.3, D / 2 - 0.6); tw.castShadow = true; g.add(tw);
  const oct = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.8, 2.6, 8), stoneD); oct.position.set(0, H + 4.4, D / 2 - 0.6); g.add(oct);
  const ogee = new THREE.Mesh(new THREE.SphereGeometry(1.7, 8, 8, 0, TAU, 0, Math.PI / 2), M(0x5a6070)); ogee.scale.y = 1.4; ogee.position.set(0, H + 5.7, D / 2 - 0.6); g.add(ogee);
  const spire = new THREE.Mesh(new THREE.ConeGeometry(0.35, 1.8, 8), M(0xffd93d, { metalness: 0.6, roughness: 0.3 })); spire.position.set(0, H + 8.9, D / 2 - 0.6); g.add(spire);
  const clock = new THREE.Mesh(new THREE.CircleGeometry(1.0, 24), M(0x2a3a7a)); clock.position.set(0, H + 1.6, D / 2 + 1.12); g.add(clock);
  const hand = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.75, 0.04), M(0xffd93d)); hand.position.set(0, H + 1.9, D / 2 + 1.15); g.add(hand);
  const gate = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.9, 0.2), M(0x5a3420)); gate.position.set(0, 1.45, D / 2 + 1.15); g.add(gate);
  const gateTop = new THREE.Mesh(new THREE.ConeGeometry(1.25, 1.0, 4), M(0x5a3420)); gateTop.rotation.y = Math.PI / 4; gateTop.scale.z = 0.12; gateTop.position.set(0, 3.3, D / 2 + 1.15); g.add(gateTop);
  return mergeGroup(g);
}
/** 아레나 = 콜로세움: 세 층 아치 + 맨 위 벽, 한쪽은 무너져 낮다. 문은 -z */
export function colosseumOut(r) {
  const g = new THREE.Group(), trav = M(0xe6d6b4), travD = M(0xcdb98e), dark = new THREE.MeshBasicMaterial({ color: 0x2a2018 });
  const tierH = 2.3, n = 28;
  for (let t = 0; t < 4; t++) {
    const wall = new THREE.Mesh(new THREE.CylinderGeometry(r - t * 0.05, r - t * 0.05, tierH, 40, 1, true), trav); wall.material.side = THREE.DoubleSide; wall.position.y = tierH / 2 + t * tierH; wall.castShadow = true; g.add(wall);
    const cornice = new THREE.Mesh(new THREE.TorusGeometry(r + 0.05, 0.14, 4, 40), travD); cornice.rotation.x = Math.PI / 2; cornice.position.y = (t + 1) * tierH; g.add(cornice);
  }
  const holes = [], tops = [];
  for (let t = 0; t < 3; t++) for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU; if (t === 0 && Math.abs(Math.sin(a) + 1) < 0.05) continue; // 북쪽 문 자리
    const ruined = t === 2 && Math.sin(a) > 0.45; // 남쪽 위층은 무너졌다 (진짜 콜로세움처럼)
    if (ruined) continue;
    const x = Math.cos(a) * (r + 0.03), z = Math.sin(a) * (r + 0.03), ry = -a + Math.PI / 2;
    holes.push({ x, y: t * tierH + 0.95, z, sx: 1.0, sy: 1.5, sz: 0.06, ry }); tops.push({ x, y: t * tierH + 1.7, z, s: 0.5, sz: 1, ry });
  }
  g.add(makeInstanced(new THREE.BoxGeometry(1, 1, 1), dark, holes), makeInstanced(new THREE.CircleGeometry(1, 10, 0, Math.PI), dark, tops));
  // 무너진 위쪽: 남쪽 반은 셋째·넷째 층을 지우고 들쭉날쭉한 돌
  const rubble = []; for (let i = 0; i < 18; i++) { const a = 0.5 + (i / 18) * 2.1; rubble.push({ x: Math.cos(a) * r, y: tierH * 2 + 0.3 + Math.random() * 1.2, z: Math.sin(a) * r, sx: 0.9, sy: 0.6 + Math.random(), sz: 0.6, ry: -a }); }
  g.add(makeInstanced(new THREE.BoxGeometry(1, 1, 1), travD, rubble));
  const masts = []; for (let i = 0; i < 16; i++) { const a = (i / 16) * TAU; if (Math.sin(a) > 0.45) continue; masts.push({ x: Math.cos(a) * r, y: tierH * 4 + 0.8, z: Math.sin(a) * r, sx: 0.08, sy: 1.6, sz: 0.08 }); }
  g.add(makeInstanced(new THREE.CylinderGeometry(1, 1, 1, 5), M(0x8a6a48), masts));
  const sand = new THREE.Mesh(new THREE.CircleGeometry(r * 0.55, 28), M(0xe8cf98)); sand.rotation.x = -Math.PI / 2; sand.position.y = 0.4; g.add(sand);
  const cavea = new THREE.Mesh(new THREE.CylinderGeometry(r - 0.2, r * 0.55, tierH * 3, 32, 1, true), M(0xbfa77e, { side: THREE.BackSide })); cavea.position.y = 0.4 + tierH * 1.5; g.add(cavea);
  return mergeGroup(g);
}

// ---------- 호수·언덕 마을·교회·스카이워크·설산 ----------
export function buildHallstatt(scene, decor, { height, obstacles }) {
  const add = (m, r) => { if (r) m.userData.radius = r; decor.add(m); return m; };
  const box = (cx, cz, hx, hz) => { for (const [ax, az, bx, bz] of [[-hx, -hz, hx, -hz], [-hx, hz, hx, hz], [-hx, -hz, -hx, hz], [hx, -hz, hx, hz]]) obstacles.push({ ax: cx + ax, az: cz + az, bx: cx + bx, bz: cz + bz, r: 0.35 }); };
  const stoneW = M(0xa8a29a), stoneL = M(0xc8c2b6), grassTop = M(0x6cbf50);

  // 언덕 단: 돌 옹벽 + 풀 덮인 윗면 (땅 판과 따로 그린다 — 절벽이 반듯하게 보이게)
  const terr = new THREE.Group();
  TERR.edges.forEach((e, k) => {
    const next = TERR.edges[k + 1] ?? -116, top = (k + 1) * TERR.step, w = TERR.x1 - TERR.x0, d = e - next;
    const wall = new THREE.Mesh(new THREE.BoxGeometry(w, top, d), stoneW); wall.position.set((TERR.x0 + TERR.x1) / 2, top / 2 - 0.02, (e + next) / 2); wall.castShadow = true; terr.add(wall);
    const lid = new THREE.Mesh(new THREE.BoxGeometry(w, 0.1, d), grassTop); lid.position.set(wall.position.x, top - 0.03, wall.position.z); terr.add(lid);
  });
  { const tm = mergeGroup(terr); tm.userData.noHide = true; decor.add(tm); }
  // 돌계단
  const steps = [];
  for (const s of STAIRS) { const e = TERR.edges[s.k], n = 8; for (let i = 0; i < n; i++) { const t = (i + 0.5) / n, z = e + s.run - t * 2 * s.run, top = s.k * TERR.step + TERR.step * ((i + 1) / n); steps.push({ x: s.x, y: (s.k * TERR.step + top) / 2, z, sx: s.half * 2, sy: top - s.k * TERR.step, sz: (2 * s.run) / n + 0.02 }); } }
  decor.add(makeInstanced(new THREE.BoxGeometry(1, 1, 1), stoneL, steps, { shadow: true }));
  // 언덕 위 알프스 집들 (단마다 한 줄)
  const palette = [[0xfff6e6, 0xe8453c], [0xffe08a, 0xff8fa8], [0xf7c8c0, 0xffd93d], [0xe8d0a0, 0xe8453c], [0xd8e8f0, 0xff8fa8]];
  let hi = 0;
  const hill = new THREE.Group(); // 언덕 집들은 모두 한 덩이로 합친다 (집마다 따로 그리면 그리기 횟수가 몇 배로 는다)
  TERR.edges.forEach((e, k) => {
    for (let x = TERR.x0 + 5; x < TERR.x1 - 3; x += 9) {
      if (STAIRS.some((s) => Math.abs(x - s.x) < 5.5)) continue;
      if (k === 0 && x > CHURCH.x - CHURCH.hw - 4 && x < CHURCH.x + CHURCH.hw + 6) continue;
      if (k === 2 && x > SKYWALK.x0 - 4 && x < SKYWALK.x1 + 4) continue;
      const z = e - 4.2, [wall, accent] = palette[hi++ % palette.length], w = 4.4 + (hi % 3) * 0.6;
      const h = alpineHouse({ w, wall, accent, roof: hi % 2 ? 0x6a3a22 : 0x4a3a3a }); h.position.set(x, (k + 1) * TERR.step, z); hill.add(h);
      box(x, z, w / 2 + 0.2, 2.4);
    }
  });
  { const hm = mergeGroup(hill); hm.userData.noHide = true; decor.add(hm); }
  // 호숫가 교회 (첫째 단 위): 하얀 몸채(긴 쪽 x) + 동쪽 끝 뾰족 첨탑, 문은 호수 쪽(남, +z)
  {
    const C = CHURCH, y = TERR.step, g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(C.hw * 2, 4.2, C.hd * 2), M(0xfaf6ee)); body.position.y = 2.1; body.castShadow = true; g.add(body);
    const roof = gable(C.hd * 2 + 0.6, C.hw * 2 + 0.4, 2.4, M(0x5a4a4a)); roof.position.y = 4.2; roof.rotation.y = Math.PI / 2; g.add(roof);
    const tower = new THREE.Mesh(new THREE.BoxGeometry(2.4, 9, 2.4), M(0xfaf6ee)); tower.position.set(C.hw + 1.2, 4.5, 0); tower.castShadow = true; g.add(tower);
    const spire = new THREE.Mesh(new THREE.ConeGeometry(1.5, 7, 8), M(0x3a3a48)); spire.position.set(C.hw + 1.2, 12.5, 0); spire.castShadow = true; g.add(spire);
    const clock = new THREE.Mesh(new THREE.CircleGeometry(0.6, 20), M(0x20232e)); clock.position.set(C.hw + 1.2, 7.4, 1.22); g.add(clock);
    const door = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2, 0.08), M(0x5a3420)); door.position.set(0, 1, C.hd + 0.02); g.add(door);
    for (const wx of [-3.4, -1.7, 1.7, 3.4]) { const win = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.6, 0.08), M(0x9fd0ff, { emissive: 0x3a6fb0, emissiveIntensity: 0.3 })); win.position.set(wx, 2.4, C.hd + 0.02); g.add(win); }
    const cg = mergeGroup(g); cg.position.set(C.x, y, C.z); cg.userData = { solid: true, radius: 6.5, box: { hx: C.hw + 2.6, hz: C.hd + 0.4 } }; decor.add(cg);
    box(C.x + 1.2, C.z, C.hw + 1.4, C.hd + 0.2);
    const sign = makePillSprite('⛪ 호숫가 교회 · 돌계단으로 올라와!', { bg: '#20232e', fg: '#ffffff', border: '#ffd93d' }, 0.8); sign.position.set(STAIRS[0].x, 3.4, TERR.edges[0] + 4); decor.add(sign);
  }
  // 스카이워크 전망대: 맨 윗단에서 남쪽 허공으로
  {
    const S = SKYWALK, w = S.x1 - S.x0, d = S.z1 - S.z0, g = new THREE.Group(); g.position.set((S.x0 + S.x1) / 2, S.top, (S.z0 + S.z1) / 2);
    const deck = new THREE.Mesh(new THREE.BoxGeometry(w, 0.2, d), M(0xd8dde4, { metalness: 0.4 })); deck.position.y = -0.1; deck.receiveShadow = true; g.add(deck);
    const glass = new THREE.MeshStandardMaterial({ color: 0xcff6ff, transparent: true, opacity: 0.35, depthWrite: false });
    for (const [x, z, sx, sz] of [[-w / 2, 0, 0.06, d], [w / 2, 0, 0.06, d], [0, d / 2, w, 0.06]]) { const p = new THREE.Mesh(new THREE.BoxGeometry(sx, 1.0, sz), glass); p.position.set(x, 0.5, z); g.add(p); const rail = new THREE.Mesh(new THREE.BoxGeometry(Math.max(sx, 0.08), 0.08, Math.max(sz, 0.08)), M(0x9aa4b8, { metalness: 0.6 })); rail.position.set(x, 1.0, z); g.add(rail); }
    for (const s of [-1, 1]) { const strut = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, Math.hypot(d, 2.2)), M(0x9aa4b8, { metalness: 0.6 })); strut.position.set(s * (w / 2 - 0.3), -1.2, 0); strut.rotation.x = Math.atan2(2.2, d); g.add(strut); }
    const sk = mergeGroup(g); sk.position.copy(g.position); sk.userData.radius = 3; decor.add(sk);
    const sign = makePillSprite('🔭 스카이워크 · 마을과 호수가 한눈에!', { bg: '#1f5f7a', fg: '#ffffff', border: '#9fe8ff' }, 0.8); sign.position.set(S.x0 - 3, S.top + 2.2, S.z0 - 2); decor.add(sign);
  }
  // 잔교 끝 보트 창고 + 나룻배
  {
    const B = BOATHOUSE, g = new THREE.Group();
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 1.4, 6), M(0x5a3420)); p.position.set(sx * B.hw, -0.6, sz * B.hd); g.add(p); }
    const body = new THREE.Mesh(new THREE.BoxGeometry(B.hw * 2, 2.2, B.hd * 2), M(0x7a4a2a)); body.position.y = 1.1; g.add(body);
    const roof = gable(B.hd * 2 + 0.6, B.hw * 2 + 0.8, 1.6, M(0x4a2a1a)); roof.position.y = 2.2; roof.rotation.y = Math.PI / 2; g.add(roof);
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.6, 1.2), M(0x3a2010)); door.position.set(-B.hw - 0.02, 0.8, 0); g.add(door);
    const bg = mergeGroup(g); bg.position.set(B.x, 0.1, B.z); decor.add(bg); obstacles.push({ x: B.x, z: B.z, r: 1.9 });
    const boat = new THREE.Mesh(new THREE.BoxGeometry(3, 0.5, 1.1), M(0x8a5a32)); boat.position.set(B.x - 1, -0.2, B.z + 3); boat.rotation.y = 0.3; decor.add(boat);
  }
  // 백조
  const swans = [];
  for (let i = 0; i < 5; i++) {
    const g = new THREE.Group(), white = M(0xffffff, { roughness: 0.6 });
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.45, 10, 8), white); body.scale.set(1.4, 0.7, 0.9); g.add(body);
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 0.8, 6), white); neck.position.set(0.45, 0.45, 0); neck.rotation.z = -0.3; g.add(neck);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), white); head.position.set(0.58, 0.85, 0); g.add(head);
    const beak = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.22, 5), M(0xff8a3a)); beak.rotation.z = -Math.PI / 2; beak.position.set(0.74, 0.83, 0); g.add(beak);
    const sw = mergeGroup(g); sw.userData = { r: 4 + i * 1.7, sp: 0.12 + i * 0.03, ph: i * 1.3, noHide: true }; decor.add(sw); swans.push(sw);
  }
  // 다흐슈타인 설산 (마을 둘레 멀리)
  {
    const rock = [], snow = [];
    for (const [x, z, r, h] of [[-70, -150, 45, 60], [-10, -165, 40, 75], [55, -150, 50, 85], [115, -125, 40, 65], [150, -60, 38, 55], [150, 20, 35, 45], [-150, -90, 40, 55], [-155, 10, 35, 45], [-140, 90, 32, 40], [140, 100, 30, 38]]) {
      rock.push({ x, y: h / 2 - 2, z, sx: r, sy: h, sz: r, ry: x });
      snow.push({ x, y: h - h * 0.14 - 2, z, sx: r * 0.3, sy: h * 0.3, sz: r * 0.3, ry: x });
    }
    const mm = makeInstanced(new THREE.ConeGeometry(1, 1, 7), M(0x7a8a96, { flatShading: true }), rock); mm.userData.noHide = true; decor.add(mm);
    const sm = makeInstanced(new THREE.ConeGeometry(1.02, 1, 7), M(0xffffff, { flatShading: true }), snow); sm.userData.noHide = true; decor.add(sm);
  }
  const lakeSign = makePillSprite('🦢 할슈타트 호수 · 잔교 끝 보트 창고', { bg: '#1f5f7a', fg: '#ffffff', border: '#9fe8ff' }, 0.8); lakeSign.position.set(PIER.x1 - 1, 2.6, PIER.z1 + 2.5); decor.add(lakeSign);

  return {
    animate(t) {
      for (const s of swans) { const u = s.userData, a = t * u.sp + u.ph; s.position.set(LAKE.x + 4 + Math.cos(a) * u.r, -0.25 + Math.sin(t * 1.3 + u.ph) * 0.03, LAKE.z - 2 + Math.sin(a) * u.r * 0.8); s.rotation.y = -a - Math.PI / 2; }
    },
  };
}
