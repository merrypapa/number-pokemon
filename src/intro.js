import * as THREE from 'three';
import { instantiate, onModelLoaded } from './models.js';
import { PLAYER_MODEL, PLAYER_HEIGHT } from './player.js';
import { waterMaterial, tickFx } from './fx.js';

// 시작 화면(랜딩) 3D 무대: 하늘에 떠 있는 작은 섬 (디오라마).
// 가운데 광장에 주인공과 포켓몬 친구들이 통통 뛰고, 섬 가장자리에 다섯 지역의 명소가 작게 붙어 있다
// (푸른숲 윌슨 그루터기 · 지하동굴 진주 웅덩이 · 불의산 분석구 · 물의길 별빛 해변 · 꿈의우주 소금사막의 눈).
// 카메라가 섬을 천천히 돌아 첫 화면에서 어떤 곳을 모험하는지 한눈에 보인다. 도형 몇십 개로 가볍게.
// featured: 무대에 세울 캐릭터 [{ model, height }] (첫째가 주인공). 이어하는 아이는 내 트레이너와 내 파티 포켓몬.
const ISLAND_R = 9;
const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.9, ...o });

export function buildIntro(creatures, featured = null) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x9ad8ff);
  scene.fog = new THREE.Fog(0x9ad8ff, 30, 75);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x7fc06a, 1.5));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(6, 14, 8);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = sun.shadow.camera.bottom = -11;
  sun.shadow.camera.right = sun.shadow.camera.top = 11;
  scene.add(sun);
  const add = (m, x = 0, y = 0, z = 0, parent = scene) => { m.position.set(x, y, z); parent.add(m); return m; };

  // ---------- 떠 있는 섬: 초록 윗면 + 아래로 뾰족한 흙·바위 ----------
  const top = add(new THREE.Mesh(new THREE.CylinderGeometry(ISLAND_R, ISLAND_R - 0.4, 0.8, 40), std(0x7ed957)), 0, -0.4, 0);
  top.receiveShadow = true;
  add(new THREE.Mesh(new THREE.ConeGeometry(ISLAND_R - 0.4, 7, 14), std(0x8a6242, { flatShading: true })), 0, -4.3, 0).rotation.x = Math.PI;
  for (const [a, r, s] of [[0.5, 5, 1], [2.2, 6.5, 0.8], [3.9, 4.6, 1.1], [5.3, 6, 0.7]]) add(new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), std(0x6f5038, { flatShading: true })), Math.cos(a) * r, -1.6 - s, Math.sin(a) * r);
  const plaza = add(new THREE.Mesh(new THREE.CircleGeometry(3.8, 32).rotateX(-Math.PI / 2), std(0xe6c98a)), 0, 0.01, 0.4);
  plaza.receiveShadow = true;
  const flowerColors = [0xff6b6b, 0xffd93d, 0xff9ff3, 0x48dbfb, 0xffffff];
  const flowers = new THREE.InstancedMesh(new THREE.SphereGeometry(0.12, 6, 4), std(0xffffff), 46), m4 = new THREE.Matrix4(), col = new THREE.Color();
  for (let i = 0; i < 46; i++) { const a = Math.random() * Math.PI * 2, r = 4.2 + Math.random() * 2.2; flowers.setMatrixAt(i, m4.makeTranslation(Math.cos(a) * r, 0.14, Math.sin(a) * r)); flowers.setColorAt(i, col.set(flowerColors[i % 5])); }
  scene.add(flowers);

  // ---------- 섬 가장자리의 다섯 명소 (각 a 방향, 반지름 7) ----------
  const spot = (a, r = 7) => { const g = new THREE.Group(); g.position.set(Math.sin(a) * r, 0, Math.cos(a) * r); g.rotation.y = a; scene.add(g); return g; };
  const anim = [];
  { // 푸른숲: 속이 빈 그루터기(입구) + 삼나무 둘
    const g = spot(Math.PI * 0.62);
    const wood = std(0x8b5a2b);
    add(new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.3, 1.5, 16, 1, true, 0.5, Math.PI * 2 - 1), new THREE.MeshStandardMaterial({ color: 0x8b5a2b, side: THREE.DoubleSide })), 0, 0.75, 0, g).castShadow = true;
    add(new THREE.Mesh(new THREE.CircleGeometry(1.1, 16).rotateX(-Math.PI / 2), std(0x5fb648)), 0, 0.03, 0, g);
    for (const [x, z, h] of [[-1.6, 0.6, 2.6], [1.5, -0.8, 3.2]]) { add(new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.26, h * 0.4, 7), wood), x, h * 0.2, z, g); for (let k = 0; k < 3; k++) add(new THREE.Mesh(new THREE.ConeGeometry(0.9 - k * 0.22, 0.9, 8), std([0x2f6e3a, 0x356f3c, 0x2a6234][k])), x, h * 0.4 + k * 0.55, z, g).castShadow = true; }
  }
  { // 지하동굴: 바위 언덕 + 어두운 굴 입구 + 빛나는 진주 웅덩이
    const g = spot(Math.PI * 1.08);
    const rock = add(new THREE.Mesh(new THREE.DodecahedronGeometry(1.7, 0), std(0x8a8f98, { flatShading: true })), 0, 0.6, -0.3, g); rock.scale.set(1.2, 0.85, 1); rock.castShadow = true;
    add(new THREE.Mesh(new THREE.CircleGeometry(0.6, 16, 0, Math.PI), new THREE.MeshBasicMaterial({ color: 0x15161c })), 0, 0.02, 1.15, g);
    add(new THREE.Mesh(new THREE.CircleGeometry(0.55, 20).rotateX(-Math.PI / 2), waterMaterial({ color: 0x5fd8d0, emissive: 0x1a7a78, emissiveIntensity: 0.8, roughness: 0.05 }, { scale: 2 })), 1.3, 0.04, 1.0, g);
    for (let k = 0; k < 5; k++) add(new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 4), new THREE.MeshBasicMaterial({ color: 0xe8fffb })), 1.3 + Math.cos(k * 1.3) * 0.3, 0.08, 1.0 + Math.sin(k * 1.3) * 0.3, g);
  }
  { // 불의산: 계단식 분석구 + 용암 + 연기
    const g = spot(Math.PI * 1.5);
    [[1.8, 0], [1.35, 1], [0.95, 2]].forEach(([r, k]) => add(new THREE.Mesh(new THREE.CylinderGeometry(r, r + 0.15, 0.55, 12), std(k % 2 ? 0x5a3020 : 0x2e2422, { flatShading: true })), 0, 0.27 + k * 0.55, 0, g).castShadow = true);
    add(new THREE.Mesh(new THREE.CircleGeometry(0.6, 16).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xff6a1a })), 0, 1.66, 0, g);
    const smokeMat = new THREE.MeshBasicMaterial({ color: 0xd8c8c0, transparent: true, opacity: 0.4, depthWrite: false });
    for (let i = 0; i < 4; i++) { const s = add(new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 6), smokeMat.clone()), 0, 2, 0, g); anim.push((t) => { const life = ((t * 0.3 + i / 4) % 1); s.position.set(Math.sin(i * 2) * life * 0.4, 1.8 + life * 3, Math.cos(i * 2) * life * 0.4); s.scale.setScalar(0.6 + life * 1.6); s.material.opacity = 0.45 * (1 - life); }); }
  }
  { // 물의길: 바닷물 + 하얀 모래섬 + 야자수 + 빛나는 물결
    const g = spot(Math.PI * 1.9);
    add(new THREE.Mesh(new THREE.CircleGeometry(2.1, 24).rotateX(-Math.PI / 2), waterMaterial({ color: 0x2fb5e0, roughness: 0.15 }, { scale: 1.2, shine: 0.25 })), 0, 0.03, 0.2, g);
    add(new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.1, 0.25, 16), std(0xf4ead0)), 0.2, 0.1, 0, g);
    add(new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 1.6, 6), std(0xa57c52)), 0.2, 1.0, 0, g).rotation.z = 0.15;
    const leaf = new THREE.PlaneGeometry(0.3, 1.1); leaf.translate(0, 0.5, 0);
    for (let k = 0; k < 6; k++) { const l = add(new THREE.Mesh(leaf, new THREE.MeshStandardMaterial({ color: 0x3f9d3a, side: THREE.DoubleSide })), 0.08, 1.78, 0, g); l.rotation.set(-1, (k / 6) * Math.PI * 2, 0, 'YXZ'); }
    const glow = new THREE.MeshBasicMaterial({ color: 0x9ff8ff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
    for (let k = 0; k < 14; k++) { const d = add(new THREE.Mesh(new THREE.CircleGeometry(0.07, 6).rotateX(-Math.PI / 2), glow), 0, 0.06, 0, g); const a = k * 0.45, r = 1.25 + (k % 3) * 0.25; anim.push((t) => { d.position.set(Math.cos(a + t * 0.1) * r, 0.06, 0.2 + Math.sin(a + t * 0.1) * r); d.scale.setScalar(0.6 + 0.6 * Math.sin(t * 2 + k)); }); }
  }
  { // 꿈의우주: 하얀 소금 판 + 두 눈(샘) + 보라 수정
    const g = spot(Math.PI * 0.2);
    add(new THREE.Mesh(new THREE.CylinderGeometry(1.7, 1.8, 0.12, 20), std(0xf6f3ee)), 0, 0.06, 0, g);
    for (const [x, z, r] of [[-0.6, 0.15, 0.42], [0.55, -0.1, 0.36]]) add(new THREE.Mesh(new THREE.CircleGeometry(r, 18).rotateX(-Math.PI / 2), waterMaterial({ color: 0x2a8fb0, emissive: 0x0b3f55, emissiveIntensity: 0.5, roughness: 0.05 }, { scale: 3, speed: 1.5 })), x, 0.13, z, g);
    add(new THREE.Mesh(new THREE.OctahedronGeometry(0.4, 0), std(0xc38bff, { emissive: 0x7a3fd0, emissiveIntensity: 0.6 })), 1.1, 0.5, 0.8, g).scale.y = 1.6;
  }

  // 섬 둘레를 천천히 흐르는 구름 (아래쪽에도)
  const cloudMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, transparent: true, opacity: 0.92 });
  for (let i = 0; i < 7; i++) {
    const c = new THREE.Group(), a = (i / 7) * Math.PI * 2, r = 13 + (i % 3) * 3, y = i % 2 ? -3.5 : 2.5 + (i % 3);
    for (let k = 0; k < 3; k++) add(new THREE.Mesh(new THREE.SphereGeometry(1.1 - k * 0.2, 10, 8), cloudMat), k * 1.1 - 1.1, k === 1 ? 0.3 : 0, 0, c);
    scene.add(c); anim.push((t) => { const aa = a + t * 0.03; c.position.set(Math.cos(aa) * r, y, Math.sin(aa) * r); });
  }

  // ---------- 캐릭터: 주인공 가운데, 포켓몬 친구들이 양옆에 반원으로 (세로 화면에서도 잘리지 않게 가깝게) ----------
  const actors = [];
  const cast = featured?.length ? featured : [{ model: PLAYER_MODEL, height: PLAYER_HEIGHT }, ...creatures.filter((c) => c.model && c.starter).map((c) => ({ model: c.model, height: 1.2 }))]; // 시작 포켓몬 넷 (처음 온 아이)
  const slots = [[0, 1.0], [-1.7, 1.4], [1.7, 1.4], [-3.0, 0.4], [3.0, 0.4]];
  let disposed = false;
  cast.slice(0, slots.length).forEach((c, i) => onModelLoaded(c.model, () => {
    if (disposed) return;
    const m = instantiate(c.model);
    if (!m) return;
    const [x, z] = slots[i];
    m.scale.setScalar(0.001); m.position.set(x, 0, z); scene.add(m);
    actors.push({ mesh: m, x, z, phase: i, height: c.height || 1.2, pop: 0 }); // 도착한 순서대로 "뿅" 등장
  }));

  const camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.1, 140);
  let t = 0;
  function update(dt) {
    t += dt;
    tickFx(t);
    const yaw = Math.sin(t * 0.12) * 1.1; // 섬을 천천히 오가며 둘레 명소가 차례로 보인다
    const portrait = Math.max(0, 1 - camera.aspect); // 세로 화면(휴대폰)일수록 멀리서
    const dist = 18 + portrait * 25;
    camera.position.set(Math.sin(yaw) * dist, 7.5 + portrait * 9.5 + Math.sin(t * 0.4) * 0.3, Math.cos(yaw) * dist);
    camera.lookAt(0, -1.2 - portrait * 5.5, 0); /* 세로 화면: 아래쪽 버튼·카드에 가리지 않게 무대를 화면 위쪽으로 */
    for (const a of actors) {
      a.pop = Math.min(1, a.pop + dt / 0.55);
      const popS = Math.max(0.001, 1 + 2.7 * Math.pow(a.pop - 1, 3) + 1.7 * Math.pow(a.pop - 1, 2)); // 튀어나왔다 자리 잡기
      const hop = Math.abs(Math.sin(t * 3.2 + a.phase * 1.3));
      a.mesh.position.y = hop * 0.28 * (a.phase === 0 ? 0.6 : 1);
      a.mesh.rotation.y = Math.atan2(camera.position.x - a.x, camera.position.z - a.z) * 0.85 + Math.sin(t * 1.1 + a.phase) * 0.15 + (1 - a.pop) * Math.PI * 2; // 카메라 쪽을 보며 두리번
      const s = 1 + (1 - hop) * 0.04;
      a.mesh.scale.set(a.height * popS * (2 - s), a.height * popS * s, a.height * popS * (2 - s));
    }
    for (const f of anim) f(t);
  }
  function resize(aspect = window.innerWidth / window.innerHeight) { camera.aspect = aspect; camera.updateProjectionMatrix(); }
  function dispose() { disposed = true; scene.traverse((o) => { o.geometry?.dispose?.(); }); }
  return { scene, camera, update, resize, dispose };
}
