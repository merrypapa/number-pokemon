import * as THREE from 'three';
import { makeNpc } from './npc.js';
import { makeLabelTexture, makePillSprite, makeInstanced } from './world.js';

// 야외 체육관: 푸른숲 마을 동쪽(연못 북쪽)의 울타리 친 넓은 잔디 운동장. 내가 잡은 포켓몬들이 모두 나와서 뛰어놀고(main 의 gymPets),
// 포켓몬에게 가까이 가서 "💪 훈련하기"를 누르면 경험치를 받는다(하루에 한 마리 3번). 가운데 흙 트랙, 서쪽 샌드백 셋, 동쪽 공, 벤치,
// 그리고 **올라갈 수 있는 큰 나무** 둘: 줄기 옆에서 점프 버튼을 꾹 누르면 줄기를 타고 올라가 6m 위 나무 위 집(둥근 단)에 선다 (player.climbAt).
// 코치는 코리. 몬스터·블록·퀴즈는 없다. 남쪽 문으로 나가면 푸른숲.
// 운동장은 넓게(140×100): 잡은 포켓몬이 50마리가 넘어도 빽빽하지 않게. 동쪽에 **연못**(타원 20×24)이 있어 물 포켓몬(물 속성·헤엄치는 종)은 거기서 헤엄치며 논다.
// 연못 서쪽 가장자리에서 나무 잔교가 연못 안으로 뻗어 있어(걸어갈 수 있다) 잔교 끝에서 물 포켓몬을 훈련시킨다. 연못 물은 못 들어간다.
export const GYM = { size: 170, field: { w: 140, d: 100 }, spawn: { x: 0, z: 42 }, door: { x: 0, z: 50.4 }, trees: [{ x: -40, z: -30 }, { x: 4, z: -34 }], platY: 6, platR: 3.6,
  dummies: [{ x: -60, z: 2 }, { x: -60, z: 9 }, { x: -60, z: 16 }], track: { x: -14, z: 2, rx: 26, rz: 15 },
  pond: { x: 46, z: -4, rx: 20, rz: 24 }, dock: { x0: 25, x1: 38, z0: -5.6, z1: -2.4 } };
const F = GYM.field, PI2 = Math.PI / 2, P = GYM.pond, DK = GYM.dock;
const inDoorway = (x, z) => Math.abs(x) < 1.8 && z > F.d / 2 - 0.6;
const treeDist = (x, z) => GYM.trees.map((t) => Math.hypot(x - t.x, z - t.z));
/** 연못 안인가 (k: 1 = 물가, 0.9 = 물 안쪽, 1.15 = 물가 밖 여유) */
export const inPond = (x, z, k = 1) => ((x - P.x) / (P.rx * k)) ** 2 + ((z - P.z) / (P.rz * k)) ** 2 < 1;
const onDock = (x, z) => x >= DK.x0 - 0.5 && x <= DK.x1 + 0.5 && z >= DK.z0 - 0.5 && z <= DK.z1 + 0.5;
export const GYM_TERRAIN = {
  size: GYM.size, inHole: () => false, obstacles: [],
  /** 나무 위 집: 줄기 둘레 platR 안쪽은, 그 높이 가까이 있을 때만(refY) 6m 단이 된다 (동굴탑처럼 층이 겹치는 지형) */
  height: (x, z, refY) => (treeDist(x, z).some((d) => d < GYM.platR) && (refY ?? 0) >= GYM.platY - 1.0 ? GYM.platY : 0),
  blocked: (x, z, refY) => {
    if (!inDoorway(x, z) && (Math.abs(x) > F.w / 2 - 0.6 || Math.abs(z) > F.d / 2 - 0.6)) return true; // 울타리
    if (inPond(x, z) && !onDock(x, z)) return true; // 연못 물 (잔교 위는 괜찮다)
    if ((refY ?? 0) >= GYM.platY - 1.0) { const d = Math.min(...treeDist(x, z)); if (d > GYM.platR - 0.45 && d < GYM.platR + 0.8) return true; } // 나무 위 집 난간 (떨어지지 않게)
    return false;
  },
  /** 줄기 옆(0.5~2.3m)이고 아직 단 아래면 올라갈 수 있다 → { top } (player.js 가 점프 버튼을 누르고 있는 동안 올린다) */
  climbAt: (x, z, y) => { const i = treeDist(x, z).findIndex((d) => d > 0.5 && d < 2.3); return i >= 0 && y < GYM.platY - 0.02 ? { top: GYM.platY, x: GYM.trees[i].x, z: GYM.trees[i].z } : null; },
};

export function buildGym(scene) {
  const decor = new THREE.Group();
  scene.add(decor);
  const obstacles = GYM_TERRAIN.obstacles;
  obstacles.length = 0;
  const block = (x, z, r) => obstacles.push({ x, z, r });

  scene.background = new THREE.Color(0x8fd3ff);
  scene.fog = new THREE.Fog(0x8fd3ff, 90, 180);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x7fa86a, 1.2));
  const sun = new THREE.DirectionalLight(0xfff6e0, 1.1);
  sun.position.set(20, 40, 12); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -60, right: 60, top: 60, bottom: -60, near: 1, far: 120 });
  scene.add(sun, sun.target);

  // 잔디 운동장 + 바깥 풀밭 + 흙 트랙 (타원 고리) + 흰 선
  const outer = new THREE.Mesh(new THREE.PlaneGeometry(GYM.size, GYM.size), new THREE.MeshStandardMaterial({ color: 0x6fbf5a, roughness: 1 }));
  outer.rotation.x = -PI2; outer.position.y = -0.02; outer.receiveShadow = true; outer.userData.noHide = true; decor.add(outer);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(F.w, F.d), new THREE.MeshStandardMaterial({ color: 0x5db84e, roughness: 0.95 }));
  floor.rotation.x = -PI2; floor.receiveShadow = true; floor.userData.noHide = true; decor.add(floor);
  const T = GYM.track;
  const track = new THREE.Mesh(new THREE.RingGeometry(0.78, 1, 64), new THREE.MeshStandardMaterial({ color: 0xd98c4a, roughness: 1, side: THREE.DoubleSide }));
  track.rotation.x = -PI2; track.scale.set(T.rx, T.rz, 1); track.position.set(T.x, 0.015, T.z); track.userData.noHide = true; decor.add(track);
  const lane = new THREE.Mesh(new THREE.RingGeometry(0.885, 0.895, 64), new THREE.MeshBasicMaterial({ color: 0xfff4e0, side: THREE.DoubleSide }));
  lane.rotation.x = -PI2; lane.scale.set(T.rx, T.rz, 1); lane.position.set(T.x, 0.02, T.z); lane.userData.noHide = true; decor.add(lane);
  const line = (w, d, x, z) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshBasicMaterial({ color: 0xf4f4f8 })); m.rotation.x = -PI2; m.position.set(x, 0.01, z); m.userData.noHide = true; decor.add(m); };
  line(F.w - 4, 0.25, 0, -F.d / 2 + 2); line(F.w - 4, 0.25, 0, F.d / 2 - 2); line(0.25, F.d - 4, -F.w / 2 + 2, 0); line(0.25, F.d - 4, F.w / 2 - 2, 0);

  // 울타리 (남쪽 가운데는 문)
  const postMat = new THREE.MeshStandardMaterial({ color: 0xd9b077 }), railMat = new THREE.MeshStandardMaterial({ color: 0xe8c48a });
  const posts = [], rails = [];
  const run = (ax, az, bx, bz) => { const n = Math.max(2, Math.round(Math.hypot(bx - ax, bz - az) / 3)); for (let i = 0; i <= n; i++) { const t = i / n; posts.push({ x: ax + (bx - ax) * t, y: 0.7, z: az + (bz - az) * t }); } rails.push({ x: (ax + bx) / 2, y: 1.0, z: (az + bz) / 2, ry: Math.atan2(bx - ax, bz - az), sz: Math.hypot(bx - ax, bz - az) }); };
  run(-F.w / 2, -F.d / 2, F.w / 2, -F.d / 2); run(-F.w / 2, -F.d / 2, -F.w / 2, F.d / 2); run(F.w / 2, -F.d / 2, F.w / 2, F.d / 2);
  run(-F.w / 2, F.d / 2, -2.4, F.d / 2); run(2.4, F.d / 2, F.w / 2, F.d / 2);
  decor.add(makeInstanced(new THREE.BoxGeometry(0.3, 1.4, 0.3), postMat, posts));
  decor.add(makeInstanced(new THREE.BoxGeometry(0.12, 0.12, 1), railMat, rails));
  // 문 기둥 + 간판
  for (const s of [-1, 1]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.6, 3.6, 0.6), postMat); p.position.set(s * 2.6, 1.8, F.d / 2); p.castShadow = true; decor.add(p); block(s * 2.6, F.d / 2, 0.5); }
  const beam = new THREE.Mesh(new THREE.BoxGeometry(6, 0.5, 0.6), postMat); beam.position.set(0, 3.7, F.d / 2); decor.add(beam);
  const exitSign = new THREE.Sprite(new THREE.SpriteMaterial({ map: makeLabelTexture('▼ 나가기 (푸른숲)', '#2f6f2a', '#ffffff', 48), transparent: true, depthTest: false }));
  exitSign.scale.set(6, 1.4, 1); exitSign.position.set(0, 5.0, F.d / 2); decor.add(exitSign);
  const title = makePillSprite('🏃 야외 체육관 · 내 포켓몬들이 뛰어노는 곳! 가까이 가서 💪 훈련하기', { bg: '#2f6f2a', fg: '#ffffff', border: '#ffd93d' }, 1.3);
  title.position.set(0, 4.5, GYM.spawn.z - 6); decor.add(title);

  // 샌드백 셋 (훈련 기구) + 큰 공 + 벤치
  const bagMat = new THREE.MeshStandardMaterial({ color: 0xc0392b, roughness: 0.7 }), ironMat = new THREE.MeshStandardMaterial({ color: 0x5a6273, metalness: 0.4 });
  for (const d of GYM.dummies) {
    const g = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 3.6, 8), ironMat); pole.position.y = 1.8; g.add(pole);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.12, 0.12), ironMat); arm.position.set(0.6, 3.5, 0); g.add(arm);
    const bag = new THREE.Mesh(new THREE.CapsuleGeometry(0.35, 1.0, 6, 12), bagMat); bag.position.set(1.2, 2.2, 0); bag.castShadow = true; g.add(bag);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.8, 0.2, 12), ironMat); base.position.y = 0.1; g.add(base);
    g.position.set(d.x, 0, d.z); decor.add(g); block(d.x, d.z, 0.7); block(d.x + 1.2, d.z, 0.5);
  }
  const bagSign = makePillSprite('🥊 샌드백 · 훈련 장소', { bg: '#20232e', fg: '#ffd93d', border: '#ffd93d' }, 0.8); bagSign.position.set(-36, 4.6, 14); decor.add(bagSign);
  const ball = new THREE.Mesh(new THREE.SphereGeometry(1.1, 18, 14), new THREE.MeshStandardMaterial({ color: 0xe8453c })); ball.position.set(34, 1.1, 10); ball.castShadow = true; decor.add(ball);
  const band = new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.08, 8, 32), new THREE.MeshStandardMaterial({ color: 0x20232e })); band.rotation.x = PI2; band.position.copy(ball.position); decor.add(band);
  block(34, 10, 1.3);
  const benchMat = new THREE.MeshStandardMaterial({ color: 0xb8742a });
  for (const [x, z] of [[-14, 30], [14, 30]]) { const b = new THREE.Mesh(new THREE.BoxGeometry(4, 0.3, 1), benchMat); b.position.set(x, 0.6, z); b.castShadow = true; decor.add(b); for (const s of [-1.6, 1.6]) { const leg = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.6, 0.8), benchMat); leg.position.set(x + s, 0.3, z); decor.add(leg); } block(x, z, 2.0); }

  // 연못: 모래 테두리 + 물(살짝 투명한 파랑) + 연잎 + 잔교
  const sand = new THREE.Mesh(new THREE.CircleGeometry(1, 48), new THREE.MeshStandardMaterial({ color: 0xe8d9a8, roughness: 1 }));
  sand.rotation.x = -PI2; sand.scale.set(P.rx + 2.2, P.rz + 2.2, 1); sand.position.set(P.x, 0.012, P.z); sand.userData.noHide = true; decor.add(sand);
  const water = new THREE.Mesh(new THREE.CircleGeometry(1, 48), new THREE.MeshStandardMaterial({ color: 0x3fb8e8, transparent: true, opacity: 0.85, roughness: 0.3 }));
  water.rotation.x = -PI2; water.scale.set(P.rx, P.rz, 1); water.position.set(P.x, 0.02, P.z); water.userData.noHide = true; decor.add(water);
  const pads = []; for (let i = 0; i < 14; i++) { const a = Math.random() * Math.PI * 2, r = 0.35 + Math.random() * 0.55; pads.push({ x: P.x + Math.cos(a) * P.rx * r, y: 0.04, z: P.z + Math.sin(a) * P.rz * r, sx: 0.9, sy: 1, sz: 0.9, ry: Math.random() * 3 }); }
  decor.add(makeInstanced(new THREE.CircleGeometry(0.6, 10).rotateX(-PI2), new THREE.MeshStandardMaterial({ color: 0x3f9d3a, side: THREE.DoubleSide }), pads));
  const dockMat = new THREE.MeshStandardMaterial({ color: 0xb8742a, roughness: 0.85 });
  const dock = new THREE.Mesh(new THREE.BoxGeometry(DK.x1 - DK.x0, 0.25, DK.z1 - DK.z0), dockMat); dock.position.set((DK.x0 + DK.x1) / 2, 0.15, (DK.z0 + DK.z1) / 2); dock.castShadow = true; dock.userData.noHide = true; decor.add(dock);
  for (let x = DK.x0 + 2; x < DK.x1; x += 3) for (const z of [DK.z0 + 0.2, DK.z1 - 0.2]) { const post = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.9, 0.25), dockMat); post.position.set(x, 0.45, z); decor.add(post); }
  const pondSign = makePillSprite('🌊 연못 · 물 포켓몬이 노는 곳. 잔교 끝에서 훈련!', { bg: '#1f5f8a', fg: '#ffffff', border: '#9fe8ff' }, 0.9); pondSign.position.set(DK.x0 - 1, 3.2, DK.z0 - 2); decor.add(pondSign);
  // 올라갈 수 있는 큰 나무 둘: 줄기 + 나무 위 집(둥근 단 + 난간 + 작은 지붕) + 잎 덩어리
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x8b5a2b, roughness: 0.95 }), leafMat = new THREE.MeshStandardMaterial({ color: 0x3f9d3a });
  const plankMat = new THREE.MeshStandardMaterial({ color: 0xc9924a, roughness: 0.8 });
  for (const t of GYM.trees) {
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1.2, GYM.platY + 7, 12), trunkMat); trunk.position.y = (GYM.platY + 7) / 2; trunk.castShadow = true; g.add(trunk);
    for (let i = 0; i < 9; i++) { const rung = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.12, 0.3), plankMat); rung.position.set(0, 0.7 + i * 0.6, 1.05); g.add(rung); } // 줄기의 디딤판 (올라가는 곳 표시)
    const plat = new THREE.Mesh(new THREE.CylinderGeometry(GYM.platR, GYM.platR, 0.3, 24), plankMat); plat.position.y = GYM.platY - 0.15; plat.receiveShadow = true; plat.castShadow = true; plat.userData.noHide = true; g.add(plat);
    const rail = new THREE.Mesh(new THREE.TorusGeometry(GYM.platR - 0.1, 0.08, 8, 40), postMat); rail.rotation.x = PI2; rail.position.y = GYM.platY + 0.9; g.add(rail);
    for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; const p = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.9, 0.12), postMat); p.position.set(Math.cos(a) * (GYM.platR - 0.1), GYM.platY + 0.45, Math.sin(a) * (GYM.platR - 0.1)); g.add(p); }
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2 + 0.3, rr = 2.2 + (i % 2) * 0.5; const leaf = new THREE.Mesh(new THREE.SphereGeometry(rr, 14, 10), leafMat); leaf.position.set(Math.cos(a) * 5.0, GYM.platY + 6.2 + (i % 3) * 0.5, Math.sin(a) * 5.0); leaf.castShadow = true; g.add(leaf); } // 잎은 둥지처럼 둘레에만: 위에서 보는 카메라에 단이 가리지 않게
    const topLeaf = new THREE.Mesh(new THREE.SphereGeometry(2.0, 12, 9), leafMat); topLeaf.position.set(0, GYM.platY + 9.4, 0); g.add(topLeaf);
    g.userData.noHide = true; // 카메라가 나무를 통째로 숨기지 않게 (단 위에 서 있으니까)
    const house = makePillSprite('🏠 나무 위 집', { bg: '#6a4a00', fg: '#ffffff', border: '#ffd93d' }, 0.8); house.position.set(0, GYM.platY + 1.8, 0); g.add(house);
    const how = makePillSprite('🌳 줄기 옆에서 점프 버튼을 꾹 누르면 올라가!', { bg: '#2f6f2a', fg: '#ffffff', border: '#ffd93d' }, 0.8); how.position.set(0, 2.6, 2.6); g.add(how);
    g.position.set(t.x, 0, t.z); decor.add(g); block(t.x, t.z, 1.0);
  }
  // 꽃·풀 장식
  const flowers = []; for (let i = 0; i < 60; i++) { const x = (Math.random() - 0.5) * (GYM.size - 10), z = (Math.random() - 0.5) * (GYM.size - 10); if (Math.abs(x) < F.w / 2 + 2 && Math.abs(z) < F.d / 2 + 2) continue; flowers.push({ x, y: 0.25, z, sx: 0.5, sy: 0.5, sz: 0.5 }); }
  decor.add(makeInstanced(new THREE.SphereGeometry(0.5, 7, 5), new THREE.MeshStandardMaterial({ color: 0xff8fb4 }), flowers));

  // 코치 코리
  const coachAt = { x: 8, z: 38 };
  const coach = makeNpc({ outfit: 'ranger', name: '코리', model: '코리.glb' });
  coach.position.set(coachAt.x, 0, coachAt.z); coach.rotation.y = Math.PI; decor.add(coach); block(coachAt.x, coachAt.z, 0.6);

  function animate(t) { title.position.y = 4.5 + Math.sin(t * 1.5) * 0.12; ball.rotation.y = t * 0.3; water.position.y = 0.02 + Math.sin(t * 1.2) * 0.01; }
  /** 포켓몬들의 집 자리: 땅은 연못·나무·기구를 피해 격자에 고르게(흔들어서), 물은 연못 안에 고르게. 서로 겹치지 않게 넓게 퍼진다 */
  function homes(nLand, nWater) {
    const land = [], waterSpots = [];
    const cols = Math.max(1, Math.ceil(Math.sqrt(nLand * 1.5))), rows = Math.max(1, Math.ceil(nLand / cols));
    const W = F.w - 10, D = F.d - 14; let k = 0;
    for (let r = 0; r < rows && land.length < nLand; r++) for (let c = 0; c < cols && land.length < nLand; c++, k++) {
      for (let tries = 0; tries < 8; tries++) {
        const x = -W / 2 + ((c + 0.5 + (Math.random() - 0.5) * 0.7) / cols) * W, z = -D / 2 + 2 + ((r + 0.5 + (Math.random() - 0.5) * 0.7) / rows) * D;
        if (inPond(x, z, 1.2) || treeDist(x, z).some((d) => d < 4.5) || GYM.dummies.some((d) => Math.hypot(x - d.x, z - d.z) < 3) || (Math.abs(x - GYM.spawn.x) < 5 && Math.abs(z - GYM.spawn.z) < 5)) continue;
        land.push({ x, z }); break;
      }
    }
    while (land.length < nLand) land.push({ x: (Math.random() - 0.5) * W * 0.6, z: (Math.random() - 0.5) * D * 0.6 }); // 자리가 모자라면 가운데 아무 데나
    for (let i = 0; i < nWater; i++) { const a = (i / Math.max(1, nWater)) * Math.PI * 2 + Math.random() * 0.4, rr = 0.35 + 0.5 * ((i % 3) / 2); waterSpots.push({ x: P.x + Math.cos(a) * P.rx * rr, z: P.z + Math.sin(a) * P.rz * rr }); }
    return { land, water: waterSpots };
  }
  /** 집 근처(반지름 r)의 새 목표 자리. water 면 연못 안에서만, 아니면 연못 밖에서만 */
  function spotNear(home, r, water) {
    for (let i = 0; i < 20; i++) {
      const a = Math.random() * Math.PI * 2, d = Math.random() * r, x = home.x + Math.cos(a) * d, z = home.z + Math.sin(a) * d;
      if (Math.abs(x) > F.w / 2 - 2 || Math.abs(z) > F.d / 2 - 2) continue;
      if (water ? !inPond(x, z, 0.92) || onDock(x, z) : inPond(x, z, 1.15) || treeDist(x, z).some((t) => t < 2.6)) continue;
      return { x, z };
    }
    return { ...home };
  }
  return {
    sun, animate, terrain: GYM_TERRAIN, decor, spawn: GYM.spawn, portal: GYM.door, portalTo: 'forest', dark: false, gym: true, noShrine: true,
    wildSpots: [], pickupSpots: [], climbAt: GYM_TERRAIN.climbAt,
    field: { w: F.w - 6, d: F.d - 6 }, dummies: GYM.dummies, homes, spotNear, inPond, waterY: -0.35,
    npcs: [{ x: coachAt.x, z: coachAt.z, mesh: coach, name: '코리', lines: (c) => [
      `안녕, ${c.name}! 여기는 야외 체육관이야. 네가 잡은 포켓몬들이 전부 나와서 뛰어놀고 있어. 가까이 가서 "💪 훈련하기"를 누르면 경험치를 받아!`,
      '동쪽 연못에는 물 포켓몬들이 헤엄치고 있어. 물에는 못 들어가니까 나무 잔교 끝까지 걸어가서 가까이 온 아이를 훈련시켜 줘.',
      '훈련은 한 마리에 하루 세 번까지. 매일 와서 골고루 훈련시켜 주면 레벨이 쑥쑥 올라.',
      '저 큰 나무 보이지? 줄기 옆에 서서 점프 버튼을 꾹 누르면 줄기를 타고 올라가. 나무 위 집에서 운동장이 다 보여!',
      `${c.leader ? `${c.leader.speciesId ? '대표 포켓몬도 트랙을 한 바퀴 돌게 해 보렴.' : ''}` : '대표 포켓몬이 없네? 먼저 포켓몬을 잡아 오렴.'} 운동장 서쪽 샌드백은 훈련하는 자리야.`,
    ] }],
  };
}
