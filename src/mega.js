import * as THREE from 'three';
import { makePillSprite } from './world.js';

// 메가 성역: 지역 보스를 잡아 정복하면 그 지역에 나타나는 숨은 장소.
// 정복 전에는 보이지 않고, 정복하는 순간 땅에서 솟아오르며 메가 포켓몬이 그 위에 나타난다.
// 지역마다 색만 바꿔 쓰는 한 벌짜리 구조물: 넓은 계단식 단 + 큰 기둥 여섯 + 떠 있는 수정 + 도는 고리 + 빛기둥.

const THEMES = {
  forest:  { stone: 0x9fb08a, accent: 0x57b947, glow: 0x9dff6a, name: '빛의 제단' },
  cave:    { stone: 0x6b7280, accent: 0x39ffb0, glow: 0x5dffc8, name: '수정 광장' },
  volcano: { stone: 0x6b4038, accent: 0xff6b1a, glow: 0xffb347, name: '하늘 신전' },
  sea:     { stone: 0xbfae86, accent: 0x3fb8e8, glow: 0x9fe8ff, name: '산호 신전' },
  space:   { stone: 0x4a3f6b, accent: 0xb026ff, glow: 0xff5cf0, name: '별의 문' },
};

/**
 * 메가 성역을 만든다. 처음엔 숨어 있다(visible=false).
 * @returns { group, reveal(), animate(t), spot, label, obstacles }
 */
export function buildMegaShrine(zoneName, x, groundY, z) {
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
