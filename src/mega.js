import * as THREE from 'three';
import { makePillSprite } from './world.js';

// 메가 성역: 지역 보스를 잡아 정복하면 그 지역에 나타나는 숨은 장소.
// 정복 전에는 보이지 않고, 정복하는 순간 땅에서 솟아오르며 메가 포켓몬이 그 위에 나타난다.
// 지역마다 색만 바꿔 쓰는 한 벌짜리 구조물: 넓은 계단식 단 + 큰 기둥 여섯 + 떠 있는 수정 + 도는 고리 + 빛기둥.

const THEMES = {
  forest:  { stone: 0x9fb08a, accent: 0x57b947, glow: 0x9dff6a, name: '윌슨 그루터기' }, // 신전 대신 야쿠시마의 속이 빈 거대한 그루터기 (buildWilsonStump)
  cave:    { stone: 0x6b7280, accent: 0x39ffb0, glow: 0x5dffc8, name: '수정 광장' },
  volcano: { stone: 0x6b4038, accent: 0xff6b1a, glow: 0xffb347, name: '하늘 신전' },
  sea:     { stone: 0xbfae86, accent: 0x3fb8e8, glow: 0x9fe8ff, name: '산호 신전' },
  space:   { stone: 0x4a3f6b, accent: 0xb026ff, glow: 0xff5cf0, name: '별의 문' },
};

/**
 * 메가 성역을 만든다. 처음엔 숨어 있다(visible=false).
 * @returns { group, reveal(), animate(t), spot, label, obstacles }
 */
export function buildMegaShrine(zoneName, x, groundY, z, decor = null) {
  if (zoneName === 'forest') return buildWilsonStump(x, groundY, z, decor); // 실제 장소의 명소로 바꾸는 중 (하나씩)
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
