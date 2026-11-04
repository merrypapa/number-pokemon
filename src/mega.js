import * as THREE from 'three';
import { waterMaterial, windMaterial } from './fx.js';
import { makePillSprite } from './world.js';

// 메가 성역: 지역 보스를 잡아 정복하면 그 지역에 나타나는 숨은 장소.
// 정복 전에는 보이지 않고, 정복하는 순간 땅에서 솟아오르며 메가 포켓몬이 그 위에 나타난다.
// 지역마다 색만 바꿔 쓰는 한 벌짜리 구조물: 넓은 계단식 단 + 큰 기둥 여섯 + 떠 있는 수정 + 도는 고리 + 빛기둥.

const THEMES = {
  forest:  { stone: 0x9fb08a, accent: 0x57b947, glow: 0x9dff6a, name: '윌슨 그루터기' }, // 신전 대신 야쿠시마의 속이 빈 거대한 그루터기 (buildWilsonStump)
  cave:    { stone: 0x6b7280, accent: 0x39ffb0, glow: 0x5dffc8, name: '동굴 진주 웅덩이' }, // 손둥 동굴의 동굴 진주가 가득한 석회 웅덩이 (buildPearlPools)
  volcano: { stone: 0x6b4038, accent: 0xff6b1a, glow: 0xffb347, name: '푸우오오 분석구' }, // 킬라우에아의 분석구 (buildPuuOo)
  sea:     { stone: 0xbfae86, accent: 0x3fb8e8, glow: 0x9fe8ff, name: '별빛 해변' }, // 몰디브 바두섬의 빛나는 바다 (buildStarBeach)
  space:   { stone: 0x4a3f6b, accent: 0xb026ff, glow: 0xff5cf0, name: '소금사막의 눈' },
  thunder: { stone: 0xf3ead8, accent: 0xffc93d, glow: 0xfff3b0, name: '빛의 돌기둥 숲' }, // 번개동굴(루디옌 동굴)의 원시림: 무지개 돌기둥 숲 (buildLightForest) // 우유니 소금사막의 오호스 델 살라르 (buildSalarEyes)
};

/**
 * 메가 성역을 만든다. 처음엔 숨어 있다(visible=false).
 * @returns { group, reveal(), animate(t), spot, label, obstacles }
 */
export function buildMegaShrine(zoneName, x, groundY, z, decor = null) {
  if (zoneName === 'forest') return buildWilsonStump(x, groundY, z, decor); // 실제 장소의 명소로 바꾸는 중 (하나씩)
  if (zoneName === 'cave') return buildPearlPools(x, groundY, z);
  if (zoneName === 'sea') return buildStarBeach(x, groundY, z);
  if (zoneName === 'volcano') return buildPuuOo(x, groundY, z);
  if (zoneName === 'space') return buildSalarEyes(x, groundY, z);
  if (zoneName === 'thunder') return buildLightForest(x, groundY, z);
  const T = THEMES[zoneName] || THEMES.forest;
  const g = new THREE.Group();
  g.position.set(x, groundY, z);
  g.visible = false;

  const stoneMat = new THREE.MeshStandardMaterial({ color: T.stone, roughness: 0.92 });
  const accentMat = new THREE.MeshStandardMaterial({ color: T.accent, roughness: 0.5, emissive: T.accent, emissiveIntensity: 0.35 });
  const glowMat = new THREE.MeshStandardMaterial({ color: T.glow, emissive: T.glow, emissiveIntensity: 1.6, roughness: 0.2 });

  // 계단식 단 (넓고 웅장하게)
  for (const [r, h, y] of [[15, 0.9, 0.45], [12, 0.9, 1.35], [9, 0.9, 2.25]]) {
    const tier = new THREE.Mesh(new THREE.CylinderGeometry(r, r + 0.6, h, 32), stoneMat);
    tier.position.y = y;
    tier.receiveShadow = true; tier.castShadow = true;
    g.add(tier);
    const edge = new THREE.Mesh(new THREE.TorusGeometry(r, 0.16, 8, 40), accentMat);
    edge.rotation.x = Math.PI / 2; edge.position.y = y + h / 2;
    g.add(edge);
  }
  // 가운데 낮은 제단
  const dais = new THREE.Mesh(new THREE.CylinderGeometry(5.2, 5.6, 0.6, 28), stoneMat);
  dais.position.y = 3.0; dais.receiveShadow = true;
  g.add(dais);
  const rune = new THREE.Mesh(new THREE.TorusGeometry(4.2, 0.14, 8, 48), glowMat);
  rune.rotation.x = Math.PI / 2; rune.position.y = 3.33;
  g.add(rune);

  // 기둥 여섯 + 그 위의 작은 불꽃
  const flames = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const px = Math.cos(a) * 10.5, pz = Math.sin(a) * 10.5;
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 1.05, 9.5, 12), stoneMat);
    col.position.set(px, 6.2, pz); col.castShadow = true;
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.0, 0.7, 12), accentMat);
    cap.position.set(px, 11.3, pz);
    const bowl = new THREE.Mesh(new THREE.SphereGeometry(0.75, 12, 10), glowMat);
    bowl.position.set(px, 11.9, pz);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.5, 12, 10, 1, true), new THREE.MeshBasicMaterial({ color: T.glow, transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide }));
    beam.position.set(px, 17.8, pz);
    g.add(col, cap, bowl, beam);
    flames.push({ bowl, beam, phase: a });
  }

  // 떠 있는 큰 수정 + 도는 고리 셋
  const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(2.6, 0), glowMat);
  crystal.position.y = 11.5; crystal.castShadow = true;
  g.add(crystal);
  const rings = [];
  for (let i = 0; i < 3; i++) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(4.4 + i * 1.1, 0.16, 8, 48), accentMat);
    ring.position.y = 11.5;
    ring.rotation.set(Math.PI / 2 + i * 0.55, i * 0.7, 0);
    g.add(ring);
    rings.push({ ring, speed: 0.35 + i * 0.22, tilt: i });
  }
  // 하늘로 솟는 큰 빛기둥
  const pillar = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 4.6, 46, 20, 1, true), new THREE.MeshBasicMaterial({ color: T.glow, transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide }));
  pillar.position.y = 26;
  g.add(pillar);
  const light = new THREE.PointLight(T.glow, 2.4, 42);
  light.position.y = 11.5;
  g.add(light);

  // 멀리서도 보이는 이름표
  const label = makePillSprite(`✨ ${T.name}`, { bg: '#20232e', fg: '#ffffff', border: '#' + T.accent.toString(16).padStart(6, '0') }, 1.5);
  label.position.y = 16.5;
  g.add(label);

  let riseT = -1; // 0 이상이면 솟아오르는 중
  function reveal() {
    if (g.visible) return;
    g.visible = true;
    riseT = 0;
  }
  function animate(t, dt = 0) {
    if (!g.visible) return;
    if (riseT >= 0 && riseT < 1) { // 땅에서 솟아오르는 연출
      riseT = Math.min(1, riseT + dt * 0.55);
      const e = 1 - Math.pow(1 - riseT, 3);
      g.position.y = groundY - 26 * (1 - e);
      g.scale.setScalar(0.6 + 0.4 * e);
    }
    crystal.rotation.y = t * 0.5;
    crystal.rotation.x = Math.sin(t * 0.7) * 0.25;
    crystal.position.y = 11.5 + Math.sin(t * 1.1) * 0.5;
    for (const r of rings) { r.ring.rotation.z = t * r.speed; r.ring.rotation.y = r.tilt * 0.7 + t * r.speed * 0.4; }
    for (const f of flames) {
      const s = 1 + Math.sin(t * 4 + f.phase) * 0.18;
      f.bowl.scale.setScalar(s);
      f.beam.material.opacity = 0.12 + Math.sin(t * 3 + f.phase) * 0.06;
    }
    pillar.material.opacity = 0.09 + Math.sin(t * 1.6) * 0.04;
    light.intensity = 2.2 + Math.sin(t * 2.2) * 0.7;
    label.position.y = 16.5 + Math.sin(t * 1.3) * 0.35;
  }
  return { group: g, reveal, animate, spot: { x, z }, label: T.name, radius: 15.5 };
}

/** 성역 가운데에서 d 만큼 떨어진 곳의 단 높이(성역 바닥 기준, m). 단 가장자리 0.6m 는 경사로 이어서 지우가 걸어 올라간다.
 *  바깥 단 r15(0.9) → r12(1.8) → r9(2.7) → 제단 r5.2(3.3). 성역 밖(15.6 넘게)이면 0 */
export const SHRINE_TIERS = [[15, 0.9], [12, 1.8], [9, 2.7], [5.2, 3.3]];
export function shrineHeightAt(d) {
  let below = 0, h = 0;
  for (const [r, top] of SHRINE_TIERS) {
    if (d <= r) { h = top; below = top; continue; }
    if (d <= r + 0.6) return below + (top - below) * (1 - (d - r) / 0.6);
    return h;
  }
  return h;
}
/** 기둥 여섯의 자리 (성역 기준 좌표) */
export const SHRINE_PILLARS = Array.from({ length: 6 }, (_, i) => { const a = (i / 6) * Math.PI * 2; return { x: Math.cos(a) * 10.5, z: Math.sin(a) * 10.5, r: 1.15 }; });

/** 이 지역 메가 성역의 이름 */
export function shrineName(zoneName) { return (THEMES[zoneName] || THEMES.forest).name; }

// ---------- 푸른숲 = 야쿠시마의 윌슨 그루터기 ----------
// 400년 전에 베어진 거대한 삼나무의 속이 빈 그루터기. 안으로 걸어 들어가 위를 올려다보면 하늘이 하트 모양으로 보인다(1인칭).
// 정복하면 이끼 속에서 천천히 솟아오르고, 메가 포켓몬이 그 안의 샘가에 산다.
const STUMP = { rIn: 5.3, rOut: 6.6, H: 7, gap: 0.62, floor: 0.25 }; // gap: 남쪽(+z) 입구 각 (라디안)
function heartShape(s) { // 가운데 (0,0) 기준 하트 (위가 +y), 크기 s
  const h = new THREE.Shape();
  h.moveTo(0, -1.0 * s);
  h.bezierCurveTo(0.9 * s, -0.35 * s, 1.25 * s, 0.35 * s, 0.6 * s, 0.85 * s);
  h.bezierCurveTo(0.3 * s, 1.05 * s, 0.05 * s, 0.9 * s, 0, 0.55 * s);
  h.bezierCurveTo(-0.05 * s, 0.9 * s, -0.3 * s, 1.05 * s, -0.6 * s, 0.85 * s);
  h.bezierCurveTo(-1.25 * s, 0.35 * s, -0.9 * s, -0.35 * s, 0, -1.0 * s);
  return h;
}
export function buildWilsonStump(x, groundY, z, decor) {
  const g = new THREE.Group(); g.position.set(x, groundY, z); g.visible = false;
  const S = STUMP, bark = new THREE.MeshStandardMaterial({ color: 0x6e4a32, roughness: 1 }), wood = new THREE.MeshStandardMaterial({ color: 0x9a6a44, roughness: 0.95, side: THREE.BackSide });
  const moss = new THREE.MeshStandardMaterial({ color: 0x5f9e3c, roughness: 1 }), mossB = new THREE.MeshStandardMaterial({ color: 0x76b84a, roughness: 1 });
  // 바깥 껍질 (입구만 비움): 주인공이 안에 있으면 숨긴다 (main resolveCamera 의 cutaway). 안쪽 벽(뒷면만 그림)은 남아 단면처럼 보인다
  const outer = new THREE.Mesh(new THREE.CylinderGeometry(S.rOut - 0.3, S.rOut + 0.6, S.H, 28, 3, true, S.gap / 2, Math.PI * 2 - S.gap), bark);
  outer.position.y = S.H / 2; outer.castShadow = true; g.add(outer);
  const inner = new THREE.Mesh(new THREE.CylinderGeometry(S.rIn, S.rIn + 0.2, S.H - 0.1, 28, 1, true, S.gap / 2, Math.PI * 2 - S.gap), wood); inner.position.y = (S.H - 0.1) / 2; g.add(inner);
  for (const sgn of [-1, 1]) { const a = sgn * S.gap / 2, jamb = new THREE.Mesh(new THREE.BoxGeometry(S.rOut - S.rIn + 0.3, S.H, 0.35), bark); jamb.position.set(Math.sin(a) * (S.rIn + S.rOut) / 2, S.H / 2, Math.cos(a) * (S.rIn + S.rOut) / 2); jamb.rotation.y = a + Math.PI / 2; g.add(jamb); } // 입구 양옆 두께
  // 뚜껑: 하트 모양 구멍이 뚫린 윗면 (안에서 올려다보면 하늘이 하트) + 들쭉날쭉한 테두리
  const lidShape = new THREE.Shape(); lidShape.absarc(0, 0, S.rOut, 0, Math.PI * 2, false); lidShape.holes.push(heartShape(-2.6)); // 음수 = 위아래를 뒤집어, 입구(남)에서 들어와 올려다보면 하트가 바로 선다 (스크린샷으로 확인)
  const lid = new THREE.Mesh(new THREE.ShapeGeometry(lidShape, 32).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x7a5236, roughness: 1, side: THREE.DoubleSide }));
  lid.position.y = S.H; g.add(lid);
  const teeth = []; for (let i = 0; i < 26; i++) { const a = (i / 26) * Math.PI * 2; teeth.push({ x: Math.sin(a) * (S.rOut - 0.4), y: S.H + 0.3 + (i % 3) * 0.35, z: Math.cos(a) * (S.rOut - 0.4), s: 0.6 + (i % 4) * 0.15 }); }
  const tm = instanced(new THREE.ConeGeometry(0.6, 1.4, 4), bark, teeth); g.add(tm);
  // 뿌리 · 이끼 · 고사리 · 샘 · 반딧불 포자
  const roots = []; for (let i = 0; i < 9; i++) { const a = (i / 9) * Math.PI * 2 + 0.2; if (Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) < S.gap) continue; roots.push({ x: Math.sin(a) * (S.rOut + 0.8), y: 0.6, z: Math.cos(a) * (S.rOut + 0.8), sx: 1.0, sy: 3.4, sz: 1.0, rx: Math.cos(a) * 1.1, rz: -Math.sin(a) * 1.1 }); }
  g.add(instanced(new THREE.ConeGeometry(1, 1, 5), bark, roots));
  const mossItems = []; for (let i = 0; i < 40; i++) { const a = Math.random() * Math.PI * 2; if (Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) < S.gap * 0.7) continue; const y = Math.random() * S.H; mossItems.push({ x: Math.sin(a) * (S.rOut + 0.1 + y * -0.04), y, z: Math.cos(a) * (S.rOut + 0.1 + y * -0.04), sx: 0.9, sy: 0.7, sz: 0.35, ry: a }); }
  for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; mossItems.push({ x: Math.sin(a) * (S.rOut - 0.6), y: S.H + 0.05, z: Math.cos(a) * (S.rOut - 0.6), sx: 1.0, sy: 0.35, sz: 1.0 }); }
  g.add(instanced(new THREE.SphereGeometry(1, 8, 6), moss, mossItems));
  const floor = new THREE.Mesh(new THREE.CircleGeometry(S.rIn, 28).rotateX(-Math.PI / 2), mossB); floor.position.y = S.floor; floor.receiveShadow = true; g.add(floor);
  const pool = new THREE.Mesh(new THREE.CircleGeometry(1.3, 20).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x4fb0c8, emissive: 0x1a5a6a, emissiveIntensity: 0.5, roughness: 0.1 })); pool.position.set(-2.4, S.floor + 0.02, -2.2); g.add(pool);
  const ferns = []; for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2 + 0.3; if (Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) < S.gap) continue; for (let k = 0; k < 4; k++) ferns.push({ x: Math.sin(a) * (S.rIn - 0.7), y: S.floor, z: Math.cos(a) * (S.rIn - 0.7), sx: 0.5, sy: 1.2, sz: 1, ry: (k / 4) * Math.PI * 2 + a, rx: -0.9 }); }
  const fernGeo = new THREE.PlaneGeometry(0.5, 1.5); fernGeo.translate(0, 0.7, 0);
  g.add(instanced(fernGeo, new THREE.MeshStandardMaterial({ color: 0x4f9a3a, side: THREE.DoubleSide }), ferns));
  // 하트로 내려오는 빛 (안에서 보이는 부드러운 빛줄기) + 떠다니는 포자
  const beamGeo = new THREE.ExtrudeGeometry(heartShape(-2.2), { depth: S.H - 0.4, bevelEnabled: false }); beamGeo.rotateX(-Math.PI / 2); // 하트 기둥 (아래에서 위로)
  const beam = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ color: 0xeaffc0, transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide })); beam.position.y = S.floor + 0.1; g.add(beam);
  const light = new THREE.PointLight(0xd9ff9a, 2.2, 14); light.position.y = 4; g.add(light);
  const spores = []; for (let i = 0; i < 24; i++) { const m = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 4), new THREE.MeshBasicMaterial({ color: 0xdfff8a })); m.userData = { a: Math.random() * 6.3, r: 0.5 + Math.random() * 4, y: 0.8 + Math.random() * 5, s: 0.2 + Math.random() * 0.4 }; g.add(m); spores.push(m); }
  const label = makePillSprite('✨ 윌슨 그루터기', { bg: '#20232e', fg: '#ffffff', border: '#57b947' }, 1.5); label.position.set(0, S.H + 3.2, S.rOut + 1.5); g.add(label); // 입구 쪽 위 (안에서 올려다볼 때 하트를 가리지 않게)
  const hint = makePillSprite('💚 안에서 1인칭으로 위를 올려다봐!', { bg: '#2f6f2a', fg: '#ffffff', border: '#9dff6a' }, 0.7); hint.position.set(0, 2.8, S.rOut + 1.2); g.add(hint);
  // 바깥 껍질·뚜껑·이빨·이끼는 주인공이 그루터기 안에 있고 카메라가 밖(또는 뚜껑 위)에 있으면 숨긴다 → decor 로 옮겨 main 의 cutaway 를 쓴다
  const inside = (p) => Math.hypot(p.x - x, p.z - z) < S.rIn + 0.2;
  const cut = (head, target) => !!target && inside(head) && head.y < groundY + S.H && (!inside(target) || target.y > groundY + S.H - 0.3);
  const shell = new THREE.Group(); shell.position.copy(g.position); shell.visible = false; shell.userData.cutaway = cut;
  for (const m of [outer, lid, tm]) shell.add(m);
  if (decor) decor.add(shell); else g.add(shell);
  let riseT = -1;
  function reveal() { if (g.visible) return; g.visible = true; shell.visible = true; riseT = 0; }
  function animate(t, dt = 0) {
    if (!g.visible) return;
    if (riseT >= 0 && riseT < 1) { riseT = Math.min(1, riseT + dt * 0.45); const e = 1 - Math.pow(1 - riseT, 3); g.position.y = shell.position.y = groundY - S.H * (1 - e); }
    for (const m of spores) { const u = m.userData; m.position.set(Math.cos(t * u.s + u.a) * u.r, u.y + Math.sin(t * 0.8 + u.a) * 0.4, Math.sin(t * u.s + u.a) * u.r); }
    beam.material.opacity = 0.09 + Math.sin(t * 1.4) * 0.04;
    label.position.y = S.H + 3.2 + Math.sin(t * 1.3) * 0.3; // (x·z 는 입구 쪽 그대로)
  }
  // 높이: 안쪽 바닥(이끼)만 살짝 높다. 벽은 원을 따라 놓은 선분 장애물 (입구만 열림)
  const heightAt = (dx, dz) => (Math.hypot(dx, dz) < S.rIn ? S.floor : 0);
  const pillars = [], n = 24;
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2, mid = (a0 + a1) / 2, am = Math.atan2(Math.sin(mid), Math.cos(mid));
    if (Math.abs(am) < S.gap / 2 + 0.05) continue; // 입구 (각 0 = +z = 남쪽)
    const rm = (S.rIn + S.rOut) / 2; pillars.push({ ax: Math.sin(a0) * rm, az: Math.cos(a0) * rm, bx: Math.sin(a1) * rm, bz: Math.cos(a1) * rm, r: (S.rOut - S.rIn) / 2 + 0.15 });
  }
  return { group: g, reveal, animate, spot: { x, z }, label: '윌슨 그루터기', radius: S.rOut + 1, heightAt, pillars, megaAt: { x: -1.2, z: -2.6 } }; // megaAt: 메가 포켓몬은 안쪽 샘가 (가운데를 비워 하트 하늘이 보이게)
}
function instanced(geo, mat, items) {
  const mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, items.length)), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), sc = new THREE.Vector3();
  items.forEach((it, i) => { e.set(it.rx || 0, it.ry || 0, it.rz || 0); q.setFromEuler(e); p.set(it.x, it.y, it.z); sc.set(it.sx ?? it.s ?? 1, it.sy ?? it.s ?? 1, it.sz ?? it.s ?? 1); mesh.setMatrixAt(i, m4.compose(p, q, sc)); });
  mesh.count = items.length; mesh.frustumCulled = false; return mesh;
}

// ---------- 지하동굴 = 손둥 동굴의 동굴 진주 웅덩이 ----------
// 석회 물방울이 수천 년 굴려 만든 동글동글한 "동굴 진주"가 가득 찬 계단식 석회 웅덩이(림스톤 둑).
// 둥근 크림색 석회 둑 → 진주가 빛나는 물 → 가운데 작은 석회 섬(메가 포켓몬). 물에는 못 들어가고 남쪽 징검돌로 섬에 건넌다.
const PEARL = { island: 2.8, waterOut: 6.5, rimOut: 7.4, islandH: 0.45, rimH: 0.35, stoneH: 0.3, stones: [3.4, 4.3, 5.2, 6.1], stoneR: 0.6 }; // 징검돌은 섬 가장자리부터 둑 안쪽까지 빈틈없이 (0.9m 간격, 반지름 0.6)
export function buildPearlPools(x, groundY, z) {
  const P = PEARL, g = new THREE.Group(); g.position.set(x, groundY, z); g.visible = false;
  const calcite = new THREE.MeshStandardMaterial({ color: 0xe8dcc0, roughness: 0.8 }), calciteD = new THREE.MeshStandardMaterial({ color: 0xc9b896, roughness: 0.9 });
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(P.rimOut, P.rimOut + 0.4, P.rimH, 40, 1), calcite); rim.position.y = P.rimH / 2; rim.receiveShadow = true; g.add(rim);
  const lip = new THREE.Mesh(new THREE.TorusGeometry(P.waterOut + 0.3, 0.22, 6, 48), calciteD); lip.rotation.x = Math.PI / 2; lip.position.y = P.rimH; g.add(lip);
  const water = new THREE.Mesh(new THREE.RingGeometry(P.island - 0.05, P.waterOut, 48).rotateX(-Math.PI / 2), waterMaterial({ color: 0x5fd8d0, emissive: 0x1a7a78, emissiveIntensity: 0.6, transparent: true, opacity: 0.7, roughness: 0.05 }, { scale: 0.7, speed: 0.6 })); water.position.y = P.rimH + 0.04; g.add(water);
  const island = new THREE.Mesh(new THREE.CylinderGeometry(P.island, P.island + 0.3, P.islandH + 0.1, 28), calcite); island.position.y = (P.islandH + 0.1) / 2; island.castShadow = true; island.receiveShadow = true; g.add(island);
  const stones = P.stones.map((d) => ({ x: 0, y: P.stoneH / 2 + 0.05, z: d, sx: P.stoneR, sy: P.stoneH + 0.1, sz: P.stoneR }));
  g.add(instanced(new THREE.CylinderGeometry(1, 1.1, 1, 10), calciteD, stones));
  // 동굴 진주: 물속 수백 개 (하얗게 은은히 빛난다) + 둑 위의 작은 진주
  const pearls = [];
  for (let i = 0; i < 260; i++) { const a = Math.random() * Math.PI * 2, d = P.island + 0.3 + Math.random() * (P.waterOut - P.island - 0.6); if (Math.abs(Math.sin(a) * d) < 0.9 && Math.cos(a) > 0) continue; pearls.push({ x: Math.sin(a) * d, y: P.rimH - 0.05, z: Math.cos(a) * d, s: 0.09 + Math.random() * 0.13 }); }
  const pearlMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xbff8ff, emissiveIntensity: 0.55, roughness: 0.25 });
  g.add(instanced(new THREE.SphereGeometry(1, 10, 8), pearlMat, pearls));
  // 둘레 석순 고리 (메가 성역 기둥 자리): 위에서 떨어지는 물방울이 웅덩이를 만든 것처럼
  const ring = [], drips = [], pillars = [];
  for (let i = 0; i < 7; i++) { const a = (i / 7) * Math.PI * 2 + 0.45, r = 9.4, h = 3 + (i % 3) * 1.6; if (Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) < 0.5) continue; ring.push({ x: Math.sin(a) * r, y: h / 2, z: Math.cos(a) * r, sx: 0.9, sy: h, sz: 0.9 }); pillars.push({ x: Math.sin(a) * r, z: Math.cos(a) * r, r: 0.9 }); }
  g.add(instanced(new THREE.ConeGeometry(1, 1, 7), calciteD, ring));
  for (let i = 0; i < 18; i++) { const m = new THREE.Mesh(new THREE.SphereGeometry(0.05, 5, 4), new THREE.MeshBasicMaterial({ color: 0xbff8ff })); m.userData = { x: (Math.random() - 0.5) * 10, z: (Math.random() - 0.5) * 10, ph: Math.random() * 3 }; g.add(m); drips.push(m); }
  const light = new THREE.PointLight(0x9ff8f0, 2.6, 22); light.position.y = 2.5; g.add(light);
  const label = makePillSprite('✨ 동굴 진주 웅덩이', { bg: '#1f2a3a', fg: '#ffffff', border: '#5dffc8' }, 1.4); label.position.set(0, 6, 0); g.add(label);
  const hint = makePillSprite('🫧 징검돌로 가운데 섬에 건너가!', { bg: '#1f2a3a', fg: '#bff8ff', border: '#5dffc8' }, 0.6); hint.position.set(0, 1.8, P.rimOut + 1); g.add(hint);
  let riseT = -1;
  function reveal() { if (g.visible) return; g.visible = true; riseT = 0; }
  function animate(t, dt = 0) {
    if (!g.visible) return;
    if (riseT >= 0 && riseT < 1) { riseT = Math.min(1, riseT + dt * 0.5); g.position.y = groundY - 2 * (1 - riseT); pearlMat.emissiveIntensity = 0.2 + riseT * 0.5; } // 솟아오르며 진주가 하나둘 빛난다
    pearlMat.emissiveIntensity = 0.5 + Math.sin(t * 1.7) * 0.15;
    for (const m of drips) { const u = m.userData, life = ((t * 0.7 + u.ph) % 3) / 3; m.position.set(u.x, 8 - life * 8, u.z); m.visible = life < 0.95; }
    label.position.y = 6 + Math.sin(t * 1.3) * 0.25;
  }
  // 높이: 둑 위·섬·징검돌은 단단한 높이, 물은 못 들어간다 (blockedAt)
  const onStone = (dx, dz) => P.stones.some((d) => Math.hypot(dx, dz - d) < P.stoneR);
  const heightAt = (dx, dz) => { const d = Math.hypot(dx, dz); if (d < P.island) return P.islandH; if (onStone(dx, dz)) return P.stoneH; if (d >= P.waterOut && d < P.rimOut) return P.rimH; return 0; };
  const blockedAt = (dx, dz) => { const d = Math.hypot(dx, dz); return d >= P.island && d < P.waterOut && !onStone(dx, dz); };
  return { group: g, reveal, animate, spot: { x, z }, label: '동굴 진주 웅덩이', radius: P.rimOut + 2, heightAt, blockedAt, pillars, megaAt: { x: 0, z: -0.6 } };
}

// ---------- 물의길 = 몰디브 바두섬의 별빛 해변 ----------
// 밤이면 파도가 파랗게 빛나는(발광 플랑크톤) 바다로 유명한 섬. 먼바다의 작은 하얀 모래섬 둘레로 파란 빛 물결이 일렁인다.
// 배로 가서 섬에 내려 걸어 다니고(walkAt), 배는 섬을 지나가지 못한다(noSailAt). 메가거북왕은 섬 둘레 빛나는 물에서 헤엄친다.
// groundY 는 main 이 주는 바다 성역 바닥(수면 - 1.2). 높이는 그 기준.
const BEACH = { r: 7.2, walk: 7.6, noSail: 9.4, top: 2.0, glowIn: 7.4, glowOut: 15 }; // top 2.0 = 수면 위 0.8 (배에서 내릴 땅은 수면 위 0.2 넘게, main LAND_Y)
export function buildStarBeach(x, groundY, z) {
  const B = BEACH, water = 1.2, g = new THREE.Group(); g.position.set(x, groundY, z); g.visible = false;
  const sand = new THREE.MeshStandardMaterial({ color: 0xf4ead0, roughness: 0.95 });
  const mound = new THREE.Mesh(new THREE.CylinderGeometry(B.r, B.r + 2.2, B.top + 0.4, 36), sand); mound.position.y = (B.top + 0.4) / 2 - 0.4; mound.receiveShadow = true; g.add(mound);
  const cap = new THREE.Mesh(new THREE.SphereGeometry(B.r, 32, 8, 0, Math.PI * 2, 0, 0.35), sand); cap.scale.y = 0.25; cap.position.y = B.top - B.r * 0.25 * Math.cos(0.35) + 0.02; g.add(cap);
  // 야자수 셋 + 그물 침대 + 조개
  const trunkM = new THREE.MeshStandardMaterial({ color: 0xa57c52 }), leafM = windMaterial(new THREE.MeshStandardMaterial({ color: 0x3f9d3a, side: THREE.DoubleSide }), { amp: 0.15, y0: 0, y1: 2.8 }), trunks = [], leaves = [];
  for (const [px, pz, h, lean] of [[-3.5, -2.5, 4.2, 0.18], [3.8, -1.6, 3.6, -0.2], [-0.8, -4.6, 4.8, 0.08]]) { trunks.push({ x: px, y: B.top + h / 2, z: pz, sx: 0.22, sy: h, sz: 0.22, rz: lean }); for (let k = 0; k < 7; k++) leaves.push({ x: px - Math.sin(lean) * h, y: B.top + h + 0.2, z: pz, ry: (k / 7) * Math.PI * 2, rx: -0.9 }); }
  g.add(instanced(new THREE.CylinderGeometry(0.7, 1, 1, 7), trunkM, trunks));
  const leafGeo = new THREE.PlaneGeometry(0.8, 3); leafGeo.translate(0, 1.3, 0); g.add(instanced(leafGeo, leafM, leaves));
  const shells = []; for (let i = 0; i < 30; i++) { const a = Math.random() * Math.PI * 2, d = 2 + Math.random() * (B.r - 2.6); shells.push({ x: Math.cos(a) * d, y: B.top + 0.04, z: Math.sin(a) * d, sx: 0.14, sy: 0.06, sz: 0.18, ry: a }); }
  g.add(instanced(new THREE.SphereGeometry(1, 6, 4), new THREE.MeshStandardMaterial({ color: 0xffd9c9 }), shells));
  // 빛나는 물결: 섬 둘레 물 위에 파란 빛점이 고리를 그리며 일렁인다 (가산 혼합으로 반짝)
  const glowMat = new THREE.MeshBasicMaterial({ color: 0x9ff8ff, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false }); // 낮에도 보이게 밝게
  const n = 520, dots = new THREE.InstancedMesh(new THREE.CircleGeometry(0.3, 8).rotateX(-Math.PI / 2), glowMat, n), info = [];
  for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, d = B.glowIn + Math.pow(Math.random(), 0.7) * (B.glowOut - B.glowIn); info.push({ a, d, s: 0.6 + Math.random() * 1.4, ph: Math.random() * 6.3 }); }
  const deep = new THREE.Mesh(new THREE.RingGeometry(B.r + 0.3, B.glowOut + 1.5, 64).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x06203a, transparent: true, opacity: 0.72, depthWrite: false })); deep.position.y = water + 0.1; g.add(deep); // 섬 둘레만 밤바다처럼 짙게 (그 위에서 빛점이 또렷하다)
  dots.frustumCulled = false; dots.renderOrder = 2; g.add(dots);
  const foam = new THREE.Mesh(new THREE.TorusGeometry(B.r + 0.5, 0.18, 6, 64), new THREE.MeshBasicMaterial({ color: 0xbff4ff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false })); foam.rotation.x = Math.PI / 2; foam.position.y = water + 0.13; g.add(foam);
  const light = new THREE.PointLight(0x5fd8ff, 3, 26); light.position.y = water + 1.2; g.add(light);
  const label = makePillSprite('✨ 별빛 해변', { bg: '#062a40', fg: '#ffffff', border: '#5fd8ff' }, 1.5); label.position.set(0, B.top + 6.5, 0); g.add(label);
  const hint = makePillSprite('🌟 파도가 파랗게 빛나는 바다 · 배에서 내려 섬을 걸어 봐!', { bg: '#062a40', fg: '#bff4ff', border: '#5fd8ff' }, 0.6); hint.position.set(0, B.top + 2.2, B.r - 1); g.add(hint);
  let riseT = -1; const m4 = new THREE.Matrix4(), v = new THREE.Vector3(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
  function reveal() { if (g.visible) return; g.visible = true; riseT = 0; }
  function animate(t, dt = 0) {
    if (!g.visible) return;
    if (riseT >= 0 && riseT < 1) { riseT = Math.min(1, riseT + dt * 0.5); g.position.y = groundY - 1.5 * (1 - riseT); }
    for (let i = 0; i < n; i++) { // 바깥에서 섬 쪽으로 밀려오는 물결마다 빛이 번진다
      const u = info[i], wave = 0.5 + 0.5 * Math.sin(u.d * 1.3 - t * 2.2 + u.ph * 0.3), k = (0.2 + wave * 0.8) * u.s * 0.55;
      v.set(Math.cos(u.a + t * 0.02) * u.d, water + 0.13, Math.sin(u.a + t * 0.02) * u.d); /* 물결(±0.06) 위로 */ sc.setScalar(k); dots.setMatrixAt(i, m4.compose(v, q, sc));
    }
    dots.instanceMatrix.needsUpdate = true;
    glowMat.opacity = 0.55 + Math.sin(t * 1.5) * 0.15; foam.material.opacity = 0.6 + Math.sin(t * 2.6) * 0.3;
    label.position.y = B.top + 6.5 + Math.sin(t * 1.3) * 0.3;
  }
  const heightAt = (dx, dz) => { const d = Math.hypot(dx, dz); return d < B.walk ? B.top - 0.25 * Math.max(0, d - (B.r - 1.5)) : 0; };
  const walkAt = (dx, dz) => Math.hypot(dx, dz) < B.walk;
  const noSailAt = (dx, dz) => Math.hypot(dx, dz) < B.noSail;
  return { group: g, reveal, animate, spot: { x, z }, label: '별빛 해변', radius: B.glowOut, heightAt, walkAt, noSailAt, megaAt: { x: 0, z: 11.5 } };
}

// ---------- 불의산 = 킬라우에아의 푸우오오 분석구 ----------
// 화산재(분석)가 쌓여 생긴 원뿔 언덕. 꼭대기 분화구에 용암 호수가 있고 용암 분수가 솟는다.
// 다섯 단(한 단 1.4m — 뛰어서는 못 오른다)이고 단마다 돌 경사로가 각도를 바꿔 나 있어 둘레를 돌며 오른다. 꼭대기 테두리(반지름 3.4~6)를 걸어 다니고 가운데 용암은 못 들어간다.
const PUU = { rings: [15, 12.5, 10, 7.5, 5.6], step: 1.4, ramps: [0, 2.3, 4.4, 0.9, 3.1], rampHalf: 1.5, rampRun: 1.15, lava: 3.2 }; // 단 너비 2.5m · 테두리 2.4m. 각 0 = 남쪽(+z): 첫 경사로는 남쪽
function angDiffM(a, b) { let d = (a - b) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; }
export function buildPuuOo(x, groundY, z) {
  const P = PUU, g = new THREE.Group(); g.position.set(x, groundY, z); g.visible = false;
  const cinder = new THREE.MeshStandardMaterial({ color: 0x2e2422, roughness: 1, flatShading: true }), cinderR = new THREE.MeshStandardMaterial({ color: 0x5a3020, roughness: 1, flatShading: true });
  P.rings.forEach((r, k) => { const top = (k + 1) * P.step, m = new THREE.Mesh(new THREE.CylinderGeometry(r - 0.3, r + 0.3, top + 0.5, 22 - k * 2), k % 2 ? cinderR : cinder); m.position.y = top / 2 - 0.25; m.castShadow = m.receiveShadow = true; g.add(m); });
  const ramps = [];
  P.rings.forEach((r, k) => { const a = P.ramps[k], len = Math.hypot(P.rampRun * 2, P.step); const m = new THREE.Mesh(new THREE.BoxGeometry(P.rampHalf * 2, 0.35, len), new THREE.MeshStandardMaterial({ color: 0x8a6a58, roughness: 1 })); m.position.set(Math.sin(a) * r, k * P.step + P.step / 2 - 0.15, Math.cos(a) * r); m.rotation.order = 'YXZ'; m.rotation.y = a + Math.PI; m.rotation.x = -Math.atan2(P.step, P.rampRun * 2); g.add(m); ramps.push(m); }); // 각 a: x=sin a, z=cos a (안쪽이 높다)
  // 분화구: 용암 호수 + 테두리 돌 + 용암 분수 + 김
  const topY = P.rings.length * P.step;
  const lava = new THREE.Mesh(new THREE.CircleGeometry(P.lava, 28).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xff6a1a, emissive: 0xff3300, emissiveIntensity: 1.4, roughness: 0.5 })); lava.position.y = topY - 0.5; g.add(lava);
  const pit = new THREE.Mesh(new THREE.CylinderGeometry(P.lava, P.lava - 0.4, 0.7, 24, 1, true), new THREE.MeshStandardMaterial({ color: 0x1a1210, side: THREE.BackSide })); pit.position.y = topY - 0.2; g.add(pit);
  const rimRocks = []; for (let i = 0; i < 18; i++) { const a = (i / 18) * Math.PI * 2; rimRocks.push({ x: Math.sin(a) * (P.lava + 0.25), y: topY + 0.1, z: Math.cos(a) * (P.lava + 0.25), s: 0.35 + (i % 3) * 0.1, ry: a }); }
  g.add(instanced(new THREE.DodecahedronGeometry(1, 0), cinderR, rimRocks));
  const fountain = new THREE.InstancedMesh(new THREE.SphereGeometry(0.22, 6, 5), new THREE.MeshBasicMaterial({ color: 0xffa040 }), 60), fInfo = [];
  for (let i = 0; i < 60; i++) fInfo.push({ a: Math.random() * Math.PI * 2, sp: 0.4 + Math.random() * 1.6, ph: Math.random() * 3, v: 0.6 + Math.random() * 0.7 });
  fountain.frustumCulled = false; g.add(fountain);
  const steam = []; const smokeMat = new THREE.MeshBasicMaterial({ color: 0xd8c8c0, transparent: true, opacity: 0.3, depthWrite: false });
  for (let i = 0; i < 8; i++) { const m = new THREE.Mesh(new THREE.SphereGeometry(0.9, 8, 6), smokeMat.clone()); m.userData = { ph: i * 0.6, ox: (Math.random() - 0.5) * 2, oz: (Math.random() - 0.5) * 2 }; g.add(m); steam.push(m); }
  const light = new THREE.PointLight(0xff6a1a, 5, 26); light.position.y = topY + 1.5; g.add(light);
  const label = makePillSprite('✨ 푸우오오 분석구', { bg: '#3a1a10', fg: '#ffd1a8', border: '#ff6b1a' }, 1.5); label.position.set(0, topY + 7, 0); g.add(label);
  const hint = makePillSprite('🌋 돌 경사로를 따라 빙 돌며 분화구 꼭대기까지!', { bg: '#3a1a10', fg: '#ffd1a8', border: '#ff6b1a' }, 0.6); hint.position.set(0, 2.2, P.rings[0] + 1.6); g.add(hint);
  let riseT = -1; const m4 = new THREE.Matrix4(), v = new THREE.Vector3(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
  function reveal() { if (g.visible) return; g.visible = true; riseT = 0; }
  function animate(t, dt = 0) {
    if (!g.visible) return;
    if (riseT >= 0 && riseT < 1) { riseT = Math.min(1, riseT + dt * 0.45); g.position.y = groundY - topY * (1 - riseT); }
    fInfo.forEach((f, i) => { const life = ((t * 0.7 + f.ph) % 2) / 2, r = life * f.sp; v.set(Math.cos(f.a) * r, topY - 0.4 + life * 9 * f.v - life * life * 9 * f.v, Math.sin(f.a) * r); sc.setScalar(life < 0.95 ? 1 - life * 0.5 : 0); fountain.setMatrixAt(i, m4.compose(v, q, sc)); });
    fountain.instanceMatrix.needsUpdate = true;
    for (const m of steam) { const u = m.userData, life = ((t * 0.25 + u.ph) % 4) / 4; m.position.set(u.ox * (1 + life), topY + 1 + life * 9, u.oz * (1 + life)); m.scale.setScalar(1 + life * 2.5); m.material.opacity = 0.32 * (1 - life); }
    lava.material.emissiveIntensity = 1.2 + Math.sin(t * 3) * 0.3; light.intensity = 4.5 + Math.sin(t * 4) * 1;
    label.position.y = topY + 7 + Math.sin(t * 1.3) * 0.3;
  }
  // 높이: 단(뛰어서 못 오르는 1.4m)과 단마다 경사로. 꼭대기 가운데는 용암(못 들어감)
  const heightAt = (dx, dz) => {
    const d = Math.hypot(dx, dz); if (d > P.rings[0] + P.rampRun) return 0;
    let n = 0; for (const r of P.rings) if (d < r) n++;
    let h = n * P.step; const a = Math.atan2(dx, dz); // 각: x=sin a, z=cos a
    P.rings.forEach((r, k) => { if (Math.abs(d - r) <= P.rampRun && Math.abs(angDiffM(a, P.ramps[k])) * r <= P.rampHalf) h = k * P.step + P.step * Math.min(1, Math.max(0, (r + P.rampRun - d) / (2 * P.rampRun))); });
    return h > 0.01 ? h : 0;
  };
  const blockedAt = (dx, dz) => Math.hypot(dx, dz) < P.lava;
  return { group: g, reveal, animate, spot: { x, z }, label: '푸우오오 분석구', radius: P.rings[0] + 2, heightAt, blockedAt, pillars: [], megaAt: { x: 0, z: -4.4 } };
}

// ---------- 꿈의우주 = 우유니 소금사막의 눈 (오호스 델 살라르) ----------
// 하얀 소금 땅 한가운데 나란히 뚫린 동그란 샘 둘. 땅속에서 물이 보글보글 솟아 "소금사막의 눈"이라 부른다.
// 육각형 금이 간 소금 판 위를 걸어 다니고, 두 눈(샘)에는 못 들어간다. 메가팬텀은 두 눈 뒤(북쪽)에 떠 있다.
const EYES = { crust: 13, top: 0.3, pools: [{ x: -3.3, z: 0.4, r: 2.6 }, { x: 3.5, z: -0.4, r: 2.2 }], mounds: 7 };
function saltTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 512; const x = c.getContext('2d');
  x.fillStyle = '#f6f3ee'; x.fillRect(0, 0, 512, 512);
  x.strokeStyle = '#d9d2c6'; x.lineWidth = 5; const R = 34, w = R * Math.sqrt(3);
  for (let row = -1; row < 12; row++) for (let col = -1; col < 11; col++) { // 소금 땅의 육각형 금
    const cx = col * w + (row % 2 ? w / 2 : 0) + (Math.random() - 0.5) * 6, cy = row * R * 1.5 + (Math.random() - 0.5) * 6;
    x.beginPath(); for (let k = 0; k <= 6; k++) { const a = Math.PI / 6 + (k / 6) * Math.PI * 2, px = cx + Math.cos(a) * R, py = cy + Math.sin(a) * R; k ? x.lineTo(px, py) : x.moveTo(px, py); } x.stroke();
  }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(3, 3); t.colorSpace = THREE.SRGBColorSpace; return t;
}
export function buildSalarEyes(x, groundY, z) {
  const E = EYES, g = new THREE.Group(); g.position.set(x, groundY, z); g.visible = false;
  let tex = null; try { tex = saltTexture(); } catch { /* 캔버스가 없으면 무늬 없이 */ }
  const salt = new THREE.MeshStandardMaterial({ color: 0xffffff, map: tex, roughness: 0.85 }), saltD = new THREE.MeshStandardMaterial({ color: 0xe6dfd2, roughness: 0.95 });
  const crust = new THREE.Mesh(new THREE.CylinderGeometry(E.crust, E.crust + 0.8, E.top + 0.8, 48), [saltD, salt, saltD]); crust.position.y = (E.top + 0.8) / 2 - 0.8; crust.receiveShadow = true; g.add(crust);
  const pools = [], bubbles = [], ripples = [];
  const bubMat = new THREE.MeshBasicMaterial({ color: 0xe8fbff, transparent: true, opacity: 0.85 });
  for (const P of E.pools) {
    const water = new THREE.Mesh(new THREE.CircleGeometry(P.r, 40).rotateX(-Math.PI / 2), waterMaterial({ color: 0x2a8fb0, emissive: 0x0b3f55, emissiveIntensity: 0.5, roughness: 0.05, metalness: 0.2 }, { scale: 0.9, speed: 1.5 })); water.position.set(P.x, E.top + 0.02, P.z); g.add(water); /* 소금 판 위에 얹는다 (판이 통짜라 아래에 두면 가려진다) */
    const deep = new THREE.Mesh(new THREE.CircleGeometry(P.r * 0.62, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x0a3550, transparent: true, opacity: 0.85, depthWrite: false })); deep.position.set(P.x, E.top + 0.03, P.z); g.add(deep); /* 가운데가 깊어 보이게 짙게 */
    const lip = new THREE.Mesh(new THREE.TorusGeometry(P.r + 0.1, 0.2, 6, 40), saltD); lip.rotation.x = Math.PI / 2; lip.position.set(P.x, E.top + 0.04, P.z); g.add(lip);
    pools.push({ P, water });
    for (let i = 0; i < 26; i++) { const m = new THREE.Mesh(new THREE.SphereGeometry(0.07 + Math.random() * 0.07, 6, 5), bubMat); m.userData = { P, a: Math.random() * 6.3, d: Math.random() * P.r * 0.6, ph: Math.random() * 2, sp: 0.6 + Math.random() * 0.6 }; g.add(m); bubbles.push(m); }
    for (let i = 0; i < 3; i++) { const m = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, depthWrite: false })); m.userData = { P, ph: i / 3 }; m.position.set(P.x, E.top + 0.05, P.z); g.add(m); ripples.push(m); }
  }
  // 둘레의 소금 무더기 (우유니에서 소금을 긁어 모아 말리는 작은 원뿔). 남쪽 입구는 비운다
  const mounds = [], pillars = [];
  for (let i = 0; i < E.mounds; i++) { const a = 0.6 + (i / (E.mounds - 1)) * (Math.PI * 2 - 1.2), r = 10.4 + (i % 2) * 0.9, h = 1.1 + (i % 3) * 0.3; mounds.push({ x: Math.sin(a) * r, y: E.top + h / 2, z: Math.cos(a) * r, sx: 0.95, sy: h, sz: 0.95, ry: a }); pillars.push({ x: Math.sin(a) * r, z: Math.cos(a) * r, r: 0.9 }); }
  g.add(instanced(new THREE.ConeGeometry(1, 1, 9), saltD, mounds));
  const light = new THREE.PointLight(0x8fe8ff, 2.4, 22); light.position.set(0, 3, 0); g.add(light);
  const label = makePillSprite('✨ 소금사막의 눈', { bg: '#1c2a44', fg: '#ffffff', border: '#8fe8ff' }, 1.5); label.position.set(0, 7, 0); g.add(label);
  const hint = makePillSprite('👀 하얀 소금 땅의 두 눈 · 물이 보글보글 솟아요!', { bg: '#1c2a44', fg: '#d8f6ff', border: '#8fe8ff' }, 0.6); hint.position.set(0, 2, E.crust - 1); g.add(hint);
  let riseT = -1;
  function reveal() { if (g.visible) return; g.visible = true; riseT = 0; }
  function animate(t, dt = 0) {
    if (!g.visible) return;
    if (riseT >= 0 && riseT < 1) { riseT = Math.min(1, riseT + dt * 0.5); g.position.y = groundY - 1.2 * (1 - riseT); }
    for (const m of bubbles) { const u = m.userData, life = ((t * u.sp + u.ph) % 2) / 2; m.position.set(u.P.x + Math.cos(u.a) * u.d, E.top + 0.04 + Math.sin(life * Math.PI) * 0.12, u.P.z + Math.sin(u.a) * u.d); m.scale.setScalar(0.4 + life * 1.2); m.visible = life < 0.92; } // 물 위로 보글보글 부풀다 톡
    for (const m of ripples) { const u = m.userData, life = (t * 0.45 + u.ph) % 1; m.scale.setScalar(0.3 + life * (u.P.r - 0.3)); m.material.opacity = 0.55 * (1 - life); }
    for (const p of pools) p.water.material.emissiveIntensity = 0.45 + Math.sin(t * 1.4 + p.P.x) * 0.12;
    label.position.y = 7 + Math.sin(t * 1.3) * 0.3;
  }
  const inPool = (dx, dz) => E.pools.some((P) => Math.hypot(dx - P.x, dz - P.z) < P.r + 0.15);
  const heightAt = (dx, dz) => (Math.hypot(dx, dz) < E.crust ? E.top : 0);
  const blockedAt = (dx, dz) => inPool(dx, dz);
  return { group: g, reveal, animate, spot: { x, z }, label: '소금사막의 눈', radius: E.crust + 2, heightAt, blockedAt, pillars, megaAt: { x: 0.2, z: -4.6 } };
}

// ---------- 번개동굴 = 루디옌 동굴의 "원시림" (빛의 돌기둥 숲) ----------
// 천장까지 닿는 석회 돌기둥이 숲처럼 둥글게 서 있고, 무지갯빛이 기둥을 따라 빙글빙글 돈다 (전기 포켓몬의 전기로 켜진 조명).
// 가운데 낮은 석회 단(두 단) 위에 메가전룡. 전룡은 "등대 포켓몬"이라 머리 위에 빛줄기가 도는 등대 빛 구슬이 떠 있다. 남쪽이 입구.
const FOREST = { ring: 8.5, n: 14, gap: 0.42, tall: 17, dais: [[4, 0.3], [2.6, 0.6]] };
const RAINBOW = [0xff4d6d, 0xff8a3d, 0xffc93d, 0x3dff8a, 0x3dfff0, 0x3da8ff, 0xb46bff];
export function buildLightForest(x, groundY, z) {
  const F = FOREST, g = new THREE.Group(); g.position.set(x, groundY, z); g.visible = false;
  const cream = new THREE.MeshStandardMaterial({ color: 0xf3ead8, roughness: 0.8 });
  const colGeo = new THREE.CylinderGeometry(0.6, 1.1, 1, 10, 6);
  { const p = colGeo.attributes.position; for (let i = 0; i < p.count; i++) { const y = p.getY(i), w = 1 - 0.4 * Math.sin((y + 0.5) * Math.PI) + 0.08 * Math.sin(y * 23 + i); p.setX(i, p.getX(i) * w); p.setZ(i, p.getZ(i) * w); } colGeo.computeVertexNormals(); } // 울퉁불퉁 잘록한 돌기둥
  const cols = [], pillars = [];
  for (let i = 0; i < F.n; i++) {
    const a = (i / F.n) * Math.PI * 2; if (Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) < F.gap) continue; // 각 0 = 남쪽(+z): 입구
    const px = Math.sin(a) * F.ring, pz = Math.cos(a) * F.ring, h = F.tall * (0.85 + (i % 3) * 0.08), r = 0.9 + (i % 2) * 0.35;
    const mat = new THREE.MeshStandardMaterial({ color: 0xf3ead8, roughness: 0.7, emissive: RAINBOW[i % RAINBOW.length], emissiveIntensity: 0.5 });
    const m = new THREE.Mesh(colGeo, mat); m.position.set(px, h / 2, pz); m.scale.set(r, h, r); m.rotation.y = a; m.castShadow = true; g.add(m);
    cols.push({ m, mat, k: i, h }); pillars.push({ x: px, z: pz, r: r + 0.3 });
  }
  // 가운데 석회 단 (두 단, 가장자리에 빛 띠)
  F.dais.forEach(([r, h], k) => {
    const d = new THREE.Mesh(new THREE.CylinderGeometry(r, r + 0.3, h + 0.2, 32), cream); d.position.y = (h + 0.2) / 2 - 0.2; d.receiveShadow = true; g.add(d);
    const edge = new THREE.Mesh(new THREE.TorusGeometry(r + 0.05, 0.07, 6, 48), new THREE.MeshBasicMaterial({ color: k ? 0xfff3b0 : 0xffc93d })); edge.rotation.x = Math.PI / 2; edge.position.y = h; g.add(edge);
  });
  // 등대 빛 구슬 + 도는 빛줄기 둘
  const orbY = 7.5, orb = new THREE.Mesh(new THREE.SphereGeometry(0.9, 20, 14), new THREE.MeshBasicMaterial({ color: 0xfff6c8 }));
  orb.position.y = orbY; g.add(orb);
  const beam = new THREE.Group(); beam.position.y = orbY; g.add(beam);
  const beamMat = new THREE.MeshBasicMaterial({ color: 0xffe9a0, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  for (const s of [1, -1]) { const c = new THREE.Mesh(new THREE.ConeGeometry(1.6, 12, 16, 1, true), beamMat); c.rotation.z = s * Math.PI / 2; c.position.x = s * 6; beam.add(c); }
  const light = new THREE.PointLight(0xffe6a0, 4, 24); light.position.y = orbY - 1; g.add(light);
  const label = makePillSprite('✨ 빛의 돌기둥 숲', { bg: '#20232e', fg: '#ffffff', border: '#ffc93d' }, 1.5); label.position.set(0, orbY + 2.6, 0); g.add(label);
  const hint = makePillSprite('💡 전룡은 등대 포켓몬! 돌기둥 숲 가운데 빛의 단으로', { bg: '#20232e', fg: '#fff3b0', border: '#ffc93d' }, 0.6); hint.position.set(0, 2.2, F.ring + 2); g.add(hint);
  let riseT = -1; const tmp = new THREE.Color();
  function reveal() { if (g.visible) return; g.visible = true; riseT = 0; }
  function animate(t, dt = 0) {
    if (!g.visible) return;
    let e = 1;
    if (riseT >= 0 && riseT < 1) { riseT = Math.min(1, riseT + dt * 0.4); e = 1 - Math.pow(1 - riseT, 3); } // 돌기둥이 바닥에서 자라 오른다
    for (const c of cols) {
      c.m.scale.y = c.h * Math.max(0.02, e); c.m.position.y = (c.h * Math.max(0.02, e)) / 2;
      const chase = 0.5 + 0.5 * Math.sin(t * 2.2 - c.k * 0.9); // 빛이 기둥을 따라 빙글빙글
      c.mat.emissive.copy(tmp.setHex(RAINBOW[(c.k + Math.floor(t * 0.5)) % RAINBOW.length])); c.mat.emissiveIntensity = (0.25 + chase * 0.75) * e;
    }
    beam.rotation.y = t * 0.9; beamMat.opacity = 0.1 + Math.sin(t * 3) * 0.03;
    orb.scale.setScalar((0.9 + Math.sin(t * 2.6) * 0.08) * Math.max(0.01, e));
    light.intensity = 4 * e; label.position.y = orbY + 2.6 + Math.sin(t * 1.3) * 0.3;
  }
  const heightAt = (dx, dz) => { const d = Math.hypot(dx, dz); for (let k = F.dais.length - 1; k >= 0; k--) if (d < F.dais[k][0]) return F.dais[k][1]; return 0; };
  return { group: g, reveal, animate, spot: { x, z }, label: '빛의 돌기둥 숲', radius: F.ring + 2, heightAt, pillars, megaAt: { x: 0, z: -0.4 } };
}
