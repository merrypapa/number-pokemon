import * as THREE from 'three';
import { instantiate, onModelLoaded } from './models.js';
import { buildNumberblockMesh } from './numberblocks.js';
import { PLAYER_MODEL, PLAYER_HEIGHT } from './player.js';

// 시작 화면(랜딩) 3D 무대: 주인공과 몬스터 친구들이 초원 위에서 통통 뛰고, 숫자블록이 둥둥 떠다닌다.
// main.js 가 타이틀이 떠 있는 동안 이 scene/camera 로 그린다.
export function buildIntro(creatures) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x8fd3ff);
  scene.fog = new THREE.Fog(0x8fd3ff, 22, 60);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x7fc06a, 1.5));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(6, 12, 8);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = sun.shadow.camera.bottom = -10;
  sun.shadow.camera.right = sun.shadow.camera.top = 10;
  scene.add(sun);

  // 초원: 넓은 원판 + 살짝 어두운 흙길 + 꽃
  const ground = new THREE.Mesh(new THREE.CircleGeometry(40, 48), new THREE.MeshStandardMaterial({ color: 0x7ed957, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  const path = new THREE.Mesh(new THREE.RingGeometry(3.2, 5.4, 48), new THREE.MeshStandardMaterial({ color: 0xd9b36b, roughness: 1 }));
  path.rotation.x = -Math.PI / 2;
  path.position.y = 0.01;
  scene.add(path);
  const flowerColors = [0xff6b6b, 0xffd93d, 0xff9ff3, 0x48dbfb, 0xffffff];
  for (let i = 0; i < 70; i++) {
    const r = 6 + Math.random() * 22, a = Math.random() * Math.PI * 2;
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.35, 5), new THREE.MeshStandardMaterial({ color: 0x3c9d3c }));
    stem.position.set(Math.cos(a) * r, 0.17, Math.sin(a) * r);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6), new THREE.MeshStandardMaterial({ color: flowerColors[i % flowerColors.length] }));
    head.position.y = 0.2;
    stem.add(head);
    scene.add(stem);
  }
  for (let i = 0; i < 14; i++) {
    const r = 12 + Math.random() * 16, a = (i / 14) * Math.PI * 2 + Math.random() * 0.3;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.35, 1.4, 8), new THREE.MeshStandardMaterial({ color: 0x8b5a2b }));
    trunk.position.set(Math.cos(a) * r, 0.7, Math.sin(a) * r);
    const crown = new THREE.Mesh(new THREE.SphereGeometry(1.6 + Math.random(), 10, 8), new THREE.MeshStandardMaterial({ color: 0x2e9e4f }));
    crown.position.y = 1.8;
    trunk.add(crown);
    trunk.castShadow = crown.castShadow = true;
    scene.add(trunk);
  }

  // 캐릭터: 주인공이 가운데, 몬스터 친구들이 양옆에서 반원으로
  const actors = [];
  const withModels = creatures.filter((c) => c.model && (c.starter || c.boss || c.special)); // 시작 포켓몬 + 지역 보스 + 잠만보
  const slots = [[-2.2, 0.9], [2.2, 0.9], [-3.8, -0.6], [3.8, -0.6], [-5.2, -2.6], [5.2, -2.6], [-3.2, -3.4], [3.2, -3.4], [-1.1, -3.9], [1.1, -3.9], [-6.4, -0.2], [6.4, -0.2], [0, -5.2]];
  let disposed = false, placed = 0;
  const place = (file, x0, z0, height, phase) => onModelLoaded(file, () => {
    if (disposed) return;
    const m = instantiate(file);
    if (!m) return;
    const [x, z] = x0 == null ? slots[placed++ % slots.length] : [x0, z0]; // 도착한 순서대로 빈자리에
    m.scale.setScalar(0.001);
    m.position.set(x, 0, z);
    m.rotation.y = Math.atan2(-x, 12 - z) * 0.6; // 살짝 카메라 쪽을 보게
    scene.add(m);
    actors.push({ mesh: m, x, z, phase, height, baseRot: m.rotation.y, pop: 0 }); // 도착한 순서대로 "뿅" 등장
  });
  place(PLAYER_MODEL, 0, 1.4, PLAYER_HEIGHT, 0);
  withModels.forEach((c, i) => place(c.model, null, null, c.boss ? 1.9 : c.special ? 1.6 : 1.15, i + 1));

  // 둥둥 떠다니는 숫자블록 (1~5)
  const floaters = [];
  for (let n = 1; n <= 5; n++) {
    const b = buildNumberblockMesh({ number: n });
    b.scale.setScalar(0.5);
    const a = (n / 5) * Math.PI * 2;
    b.position.set(Math.cos(a) * 5.5, 2.2 + n * 0.25, Math.sin(a) * 5.5 - 1);
    scene.add(b);
    floaters.push({ mesh: b, a, r: 5.5, y: b.position.y });
  }

  const camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.1, 120);
  let t = 0;
  function update(dt) {
    t += dt;
    for (const a of actors) {
      a.pop = Math.min(1, a.pop + dt / 0.55);
      const popS = Math.max(0.001, 1 + 2.7 * Math.pow(a.pop - 1, 3) + 1.7 * Math.pow(a.pop - 1, 2)); // 튀어나왔다 자리 잡기
      const hop = Math.abs(Math.sin(t * 3.2 + a.phase * 1.3));
      a.mesh.position.y = hop * 0.28 * (a.phase === 0 ? 0.6 : 1);
      a.mesh.rotation.y = a.baseRot + Math.sin(t * 1.1 + a.phase) * 0.18 + (1 - a.pop) * Math.PI * 2;
      const s = 1 + (1 - hop) * 0.04;
      a.mesh.scale.set(a.height * popS * (2 - s), a.height * popS * s, a.height * popS * (2 - s));
    }
    for (const f of floaters) {
      const ang = f.a + t * 0.25;
      f.mesh.position.set(Math.cos(ang) * f.r, f.y + Math.sin(t * 2 + f.a) * 0.25, Math.sin(ang) * f.r - 1);
      f.mesh.rotation.y = -ang + Math.PI / 2;
    }
    const yaw = Math.sin(t * 0.22) * 0.45;
    const dist = 11 + Math.max(0, 1 - camera.aspect) * 12; // 세로 화면(휴대폰)에서는 더 멀리서 전체가 보이게
    camera.position.set(Math.sin(yaw) * dist, 3.4 + (dist - 11) * 0.25 + Math.sin(t * 0.4) * 0.3, Math.cos(yaw) * dist);
    camera.lookAt(0, 1.1, -0.4);
  }
  function resize(aspect = window.innerWidth / window.innerHeight) { camera.aspect = aspect; camera.updateProjectionMatrix(); }
  function dispose() { disposed = true; scene.traverse((o) => { o.geometry?.dispose?.(); }); }
  return { scene, camera, update, resize, dispose };
}
