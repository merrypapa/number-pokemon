import * as THREE from 'three';
import { makeNpc } from './npc.js';
import { makeLabelTexture, makePillSprite, makeInstanced } from './world.js';
import { olyHeight, olyBlocked, olyCeiling, olyClear, buildOlympia, OLIVE_SPOTS } from './olympia.js';

// 야외 체육관 = **고대 올림피아**(그리스, 첫 올림픽이 열린 곳)를 본뜬 운동장. 내가 잡은 포켓몬들이 모두 나와서 뛰어놀고(main 의 gymPets),
// 포켓몬에게 가까이 가서 "💪 훈련하기"를 누르면 경험치를 받는다(하루에 한 마리 3번). 구조물(src/olympia.js):
//  북쪽 스타디온(달리기 길 + 양옆 풀 둑) · 남쪽 둑을 뚫은 돌 터널 크립테 · 서쪽 팔라이스트라(기둥 회랑 + 계단으로 지붕 위) ·
//  가운데 제우스 신전(세 단 기단, 부러진 기둥, 쓰러진 기둥 돌) · 헤라 신전 · 둥근 필리페이온 · 올리브 나무들.
// 그리고 **올라갈 수 있는 큰 올리브 나무** 둘: 줄기 옆에서 점프 버튼을 꾹 누르면 줄기를 타고 올라가 6m 위 나무 위 집(둥근 단)에 선다 (player.climbAt).
// 코치는 코리. 몬스터·블록·퀴즈는 없다. 남쪽 문으로 나가면 푸른숲. 샌드백 셋은 팔라이스트라 마당에 있다.
// 운동장은 넓게(170×120): 도감 130종을 다 잡아 130마리가 나와도 넉넉하게. 동쪽에 **연못**(타원 20×24)이 있어 물 포켓몬(물 속성·헤엄치는 종)은 거기서 헤엄치며 논다.
// 연못 서쪽 가장자리에서 나무 잔교가 연못 안으로 뻗어 있고, 주인공도 연못에 들어가면 **헤엄친다**(가슴까지 잠겨 천천히, main 이 player.surface 를 준다). 물 포켓몬 옆에서 같이 헤엄치며 훈련.
export const GYM = { size: 200, field: { w: 170, d: 120 }, spawn: { x: 0, z: 52 }, door: { x: 0, z: 60.4 }, trees: [{ x: -42, z: 44 }, { x: 30, z: 40 }], platY: 6, platR: 3.6,
  dummies: [{ x: -67, z: 6 }, { x: -67, z: 10 }, { x: -67, z: 14 }],
  pond: { x: 58, z: -4, rx: 24, rz: 28 }, dock: { x0: 33, x1: 47, z0: -5.6, z1: -2.4 } };
const F = GYM.field, PI2 = Math.PI / 2, P = GYM.pond, DK = GYM.dock;
const inDoorway = (x, z) => Math.abs(x) < 1.8 && z > F.d / 2 - 0.6;
const treeDist = (x, z) => GYM.trees.map((t) => Math.hypot(x - t.x, z - t.z));
/** 연못 안인가 (k: 1 = 물가, 0.9 = 물 안쪽, 1.15 = 물가 밖 여유) */
export const inPond = (x, z, k = 1) => ((x - P.x) / (P.rx * k)) ** 2 + ((z - P.z) / (P.rz * k)) ** 2 < 1;
const onDock = (x, z) => x >= DK.x0 - 0.5 && x <= DK.x1 + 0.5 && z >= DK.z0 - 0.5 && z <= DK.z1 + 0.5;
// 장식 올리브 나무: 연못·구조물·큰 나무·시작 자리와 겹치지 않는 후보만
const OLIVES = OLIVE_SPOTS.filter(([x, z]) => !inPond(x, z, 1.3) && olyClear(x, z) > 3 && treeDist(x, z).every((d) => d > 8) && !(Math.abs(x) < 6 && z > 40)).map(([x, z]) => ({ x, z }));
/** 구조물·장식 나무에서 떨어진 거리 (포켓몬 집을 비켜 놓는 데 쓴다) */
const gymClear = (x, z) => Math.min(olyClear(x, z), ...OLIVES.map((o) => Math.hypot(x - o.x, z - o.z) - 1.0));
export const GYM_TERRAIN = {
  size: GYM.size, inHole: () => false, obstacles: [], ledge: 0.9, // 0.9m 넘는 턱(기둥 밑동·쓰러진 큰 기둥)은 뛰어야 오른다
  /** 나무 위 집: 줄기 둘레 platR 안쪽은, 그 높이 가까이 있을 때만(refY) 6m 단이 된다 (동굴탑처럼 층이 겹치는 지형). 나머지는 올림피아 구조물 */
  height: (x, z, refY) => (treeDist(x, z).some((d) => d < GYM.platR) && (refY ?? 0) >= GYM.platY - 1.0 ? GYM.platY : olyHeight(x, z, refY)),
  blocked: (x, z, refY) => {
    if (!inDoorway(x, z) && (Math.abs(x) > F.w / 2 - 0.6 || Math.abs(z) > F.d / 2 - 0.6)) return true; // 울타리
    if ((refY ?? 0) >= GYM.platY - 1.0) { const d = Math.min(...treeDist(x, z)); if (d > GYM.platR - 0.45 && d < GYM.platR + 0.8) return true; } // 나무 위 집 난간 (떨어지지 않게)
    return olyBlocked(x, z, refY);
  },
  /** 크립테 터널 속(과 입구 앞): 카메라를 둥근 천장 아래로 누른다 */
  ceiling: (x, z, y) => olyCeiling(x, z, y),
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

  // 잔디 운동장 + 바깥 풀밭 + 문에서 제우스 신전까지 흙길
  const outer = new THREE.Mesh(new THREE.PlaneGeometry(GYM.size, GYM.size), new THREE.MeshStandardMaterial({ color: 0x6fbf5a, roughness: 1 }));
  outer.rotation.x = -PI2; outer.position.y = -0.02; outer.receiveShadow = true; outer.userData.noHide = true; decor.add(outer);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(F.w, F.d), new THREE.MeshStandardMaterial({ color: 0x5db84e, roughness: 0.95 }));
  floor.rotation.x = -PI2; floor.receiveShadow = true; floor.userData.noHide = true; decor.add(floor);
  const path = new THREE.Mesh(new THREE.PlaneGeometry(3.6, F.d / 2 - 1), new THREE.MeshStandardMaterial({ color: 0xd2b27c, roughness: 1 })); // 0.03 위: 잔디와 깊이 싸움이 안 나게
  path.rotation.x = -PI2; path.position.set(0, 0.03, (F.d / 2 - 1) / 2 + 0.2); path.receiveShadow = true; path.userData.noHide = true; decor.add(path);
  const oly = buildOlympia(decor); // 스타디온·크립테·팔라이스트라·신전들 (src/olympia.js)

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
  const exitSign = new THREE.Sprite(new THREE.SpriteMaterial({ map: makeLabelTexture('▼ 나가기 (마을)', '#2f6f2a', '#ffffff', 48), transparent: true, depthTest: false }));
  exitSign.scale.set(6, 1.4, 1); exitSign.position.set(0, 5.0, F.d / 2); decor.add(exitSign);
  const title = makePillSprite('🏛 올림피아 체육관 · 첫 올림픽이 열린 곳! 포켓몬에게 가까이 가서 💪 훈련하기', { bg: '#2f6f2a', fg: '#ffffff', border: '#ffd93d' }, 1.3);
  title.position.set(0, 4.5, GYM.spawn.z - 6); decor.add(title);

  // 샌드백 셋 (팔라이스트라 마당의 훈련 기구) + 큰 공 + 벤치
  const bagMat = new THREE.MeshStandardMaterial({ color: 0xc0392b, roughness: 0.7 }), ironMat = new THREE.MeshStandardMaterial({ color: 0x5a6273, metalness: 0.4 });
  for (const d of GYM.dummies) {
    const g = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 3.6, 8), ironMat); pole.position.y = 1.8; g.add(pole);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.12, 0.12), ironMat); arm.position.set(0.6, 3.5, 0); g.add(arm);
    const bag = new THREE.Mesh(new THREE.CapsuleGeometry(0.35, 1.0, 6, 12), bagMat); bag.position.set(1.2, 2.2, 0); bag.castShadow = true; g.add(bag);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.8, 0.2, 12), ironMat); base.position.y = 0.1; g.add(base);
    g.position.set(d.x, 0, d.z); decor.add(g); block(d.x, d.z, 0.7); block(d.x + 1.2, d.z, 0.5);
  }
  const bagSign = makePillSprite('🥊 샌드백 · 레슬링 훈련', { bg: '#20232e', fg: '#ffd93d', border: '#ffd93d' }, 0.8); bagSign.position.set(GYM.dummies[1].x, 4.6, GYM.dummies[1].z); decor.add(bagSign);
  const ball = new THREE.Mesh(new THREE.SphereGeometry(1.1, 18, 14), new THREE.MeshStandardMaterial({ color: 0xe8453c })); ball.position.set(20, 1.1, 30); ball.castShadow = true; decor.add(ball);
  const band = new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.08, 8, 32), new THREE.MeshStandardMaterial({ color: 0x20232e })); band.rotation.x = PI2; band.position.copy(ball.position); decor.add(band);
  block(20, 30, 1.3);
  const benchMat = new THREE.MeshStandardMaterial({ color: 0xb8742a });
  for (const [x, z] of [[-14, 44], [14, 44]]) { const b = new THREE.Mesh(new THREE.BoxGeometry(4, 0.3, 1), benchMat); b.position.set(x, 0.6, z); b.castShadow = true; decor.add(b); for (const s of [-1.6, 1.6]) { const leg = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.6, 0.8), benchMat); leg.position.set(x + s, 0.3, z); decor.add(leg); } block(x, z, 2.0); }

  // 연못: 모래 테두리 + 물(살짝 투명한 파랑) + 연잎 + 잔교
  // 모래 테두리는 물 밑에 깔지 않고 **고리**로만 (물 판과 8mm 차이로 겹쳐 있어 멀리서 깊이 싸움(z-fighting)이 나면 연못이 살구색 모래로 깜빡였다 — "연못이 살색으로 바뀐다")
  const sand = new THREE.Mesh(new THREE.RingGeometry(0.985, 1, 64), new THREE.MeshStandardMaterial({ color: 0xe8d9a8, roughness: 1, side: THREE.DoubleSide }));
  sand.rotation.x = -PI2; sand.scale.set(P.rx + 2.2, P.rz + 2.2, 1); sand.position.set(P.x, 0.05, P.z); sand.userData.noHide = true; decor.add(sand);
  const water = new THREE.Mesh(new THREE.CircleGeometry(1, 48), new THREE.MeshStandardMaterial({ color: 0x3fb8e8, roughness: 0.3 })); // 불투명: 반투명이면 물에 잠긴 주인공의 몸이 물 너머로 비쳐 깜빡였다
  water.rotation.x = -PI2; water.scale.set(P.rx, P.rz, 1); water.position.set(P.x, 0.08, P.z); water.userData.noHide = true; decor.add(water); // 잔디(0)보다 8cm 위: 깊이 싸움이 안 나게
  const pads = []; for (let i = 0; i < 14; i++) { const a = Math.random() * Math.PI * 2, r = 0.35 + Math.random() * 0.55; pads.push({ x: P.x + Math.cos(a) * P.rx * r, y: 0.14, z: P.z + Math.sin(a) * P.rz * r, sx: 0.9, sy: 1, sz: 0.9, ry: Math.random() * 3 }); }
  decor.add(makeInstanced(new THREE.CircleGeometry(0.6, 10).rotateX(-PI2), new THREE.MeshStandardMaterial({ color: 0x3f9d3a, side: THREE.DoubleSide }), pads));
  const dockMat = new THREE.MeshStandardMaterial({ color: 0xb8742a, roughness: 0.85 });
  const dock = new THREE.Mesh(new THREE.BoxGeometry(DK.x1 - DK.x0, 0.25, DK.z1 - DK.z0), dockMat); dock.position.set((DK.x0 + DK.x1) / 2, 0.15, (DK.z0 + DK.z1) / 2); dock.castShadow = true; dock.userData.noHide = true; decor.add(dock);
  for (let x = DK.x0 + 2; x < DK.x1; x += 3) for (const z of [DK.z0 + 0.2, DK.z1 - 0.2]) { const post = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.9, 0.25), dockMat); post.position.set(x, 0.45, z); decor.add(post); }
  const pondSign = makePillSprite('🌊 연못 · 물 포켓몬과 같이 헤엄치며 훈련!', { bg: '#1f5f8a', fg: '#ffffff', border: '#9fe8ff' }, 0.9); pondSign.position.set(DK.x0 - 1, 3.2, DK.z0 - 2); decor.add(pondSign);
  // 올라갈 수 있는 큰 올리브 나무 둘: 굵은 줄기 + 나무 위 집(둥근 단 + 난간) + 은빛 초록 잎 덩어리. 디딤판·난간 기둥·잎은 두 나무를 묶어 인스턴스로
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x7a6a55, roughness: 0.95 }), leafMat = new THREE.MeshStandardMaterial({ color: 0x8a9f5a, roughness: 0.9 });
  const plankMat = new THREE.MeshStandardMaterial({ color: 0xc9924a, roughness: 0.8 });
  const rungs = [], railPosts = [], leaves = [];
  for (const t of GYM.trees) {
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1.3, GYM.platY + 7, 10), trunkMat); trunk.position.y = (GYM.platY + 7) / 2; trunk.rotation.y = t.x; trunk.castShadow = true; g.add(trunk);
    for (let i = 0; i < 9; i++) rungs.push({ x: t.x, y: 0.7 + i * 0.6, z: t.z + 1.05, sx: 1.6, sy: 0.12, sz: 0.3 }); // 줄기의 디딤판 (올라가는 곳 표시)
    const plat = new THREE.Mesh(new THREE.CylinderGeometry(GYM.platR, GYM.platR, 0.3, 24), plankMat); plat.position.y = GYM.platY - 0.15; plat.receiveShadow = true; plat.castShadow = true; plat.userData.noHide = true; g.add(plat);
    const rail = new THREE.Mesh(new THREE.TorusGeometry(GYM.platR - 0.1, 0.08, 6, 40), postMat); rail.rotation.x = PI2; rail.position.y = GYM.platY + 0.9; g.add(rail);
    for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; railPosts.push({ x: t.x + Math.cos(a) * (GYM.platR - 0.1), y: GYM.platY + 0.45, z: t.z + Math.sin(a) * (GYM.platR - 0.1) }); }
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2 + 0.3, rr = 2.2 + (i % 2) * 0.5; leaves.push({ x: t.x + Math.cos(a) * 5.0, y: GYM.platY + 6.2 + (i % 3) * 0.5, z: t.z + Math.sin(a) * 5.0, sx: rr, sy: rr * 0.8, sz: rr, color: i % 2 ? 0x8a9f5a : 0x7b9150 }); } // 잎은 둥지처럼 둘레에만: 위에서 보는 카메라에 단이 가리지 않게
    leaves.push({ x: t.x, y: GYM.platY + 9.4, z: t.z, sx: 2.0, sy: 1.6, sz: 2.0, color: 0x93a865 });
    g.userData.noHide = true; // 카메라가 나무를 통째로 숨기지 않게 (단 위에 서 있으니까)
    const house = makePillSprite('🏠 나무 위 집 · 줄기 옆에서 ⬇ 내려가기', { bg: '#6a4a00', fg: '#ffffff', border: '#ffd93d' }, 0.8); house.position.set(0, GYM.platY + 1.8, 0); g.add(house);
    const how = makePillSprite('🌳 줄기 옆에서 점프 버튼을 꾹 누르면 올라가!', { bg: '#2f6f2a', fg: '#ffffff', border: '#ffd93d' }, 0.8); how.position.set(0, 2.6, 2.6); g.add(how);
    g.position.set(t.x, 0, t.z); decor.add(g); block(t.x, t.z, 1.0);
  }
  decor.add(makeInstanced(new THREE.BoxGeometry(1, 1, 1), plankMat, rungs));
  decor.add(makeInstanced(new THREE.BoxGeometry(0.12, 0.9, 0.12), postMat, railPosts));
  decor.add(makeInstanced(new THREE.SphereGeometry(1, 12, 8), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 }), leaves, { shadow: true }));
  // 장식 올리브 나무: 비틀린 줄기 + 납작한 은빛 잎 덩어리 둘 (장애물)
  const oTrunks = [], oLeaves = [];
  OLIVES.forEach((o, i) => {
    const lean = ((i * 37) % 10 - 5) * 0.04;
    oTrunks.push({ x: o.x, y: 1.1, z: o.z, sx: 0.3, sy: 2.2, sz: 0.3, rz: lean, rx: -lean * 0.6 });
    oLeaves.push({ x: o.x + lean * 4, y: 2.9, z: o.z, sx: 2.2, sy: 1.1, sz: 2.0, ry: i, color: 0x8a9f5a }, { x: o.x - 0.6, y: 3.5, z: o.z + 0.5, sx: 1.5, sy: 0.9, sz: 1.5, ry: i * 2, color: 0x9aae6c });
    block(o.x, o.z, 0.5);
  });
  decor.add(makeInstanced(new THREE.CylinderGeometry(0.8, 1, 1, 7), trunkMat, oTrunks, { shadow: true }));
  decor.add(makeInstanced(new THREE.DodecahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, flatShading: true }), oLeaves, { shadow: true }));
  // 꽃·풀 장식
  const flowers = []; for (let i = 0; i < 60; i++) { const x = (Math.random() - 0.5) * (GYM.size - 10), z = (Math.random() - 0.5) * (GYM.size - 10); if (Math.abs(x) < F.w / 2 + 2 && Math.abs(z) < F.d / 2 + 2) continue; flowers.push({ x, y: 0.25, z, sx: 0.5, sy: 0.5, sz: 0.5 }); }
  decor.add(makeInstanced(new THREE.SphereGeometry(0.5, 7, 5), new THREE.MeshStandardMaterial({ color: 0xff8fb4 }), flowers));

  // 코치 코리
  const coachAt = { x: 8, z: 48 };
  const coach = makeNpc({ outfit: 'ranger', name: '코리', model: '코리.glb' });
  coach.position.set(coachAt.x, 0, coachAt.z); coach.rotation.y = Math.PI; decor.add(coach); block(coachAt.x, coachAt.z, 0.6);

  function animate(t) { title.position.y = 4.5 + Math.sin(t * 1.5) * 0.12; ball.rotation.y = t * 0.3; water.position.y = 0.08 + Math.sin(t * 1.2) * 0.01; oly.animate(t); }
  /** 땅 포켓몬이 지낼 수 있는 자리인가: 연못·큰 나무·시작 자리를 피하고, 구조물(둑·신전·회랑 …)에서 m 만큼 떨어져 있다 */
  const landOk = (x, z, m) => Math.abs(x) < F.w / 2 - 4 && Math.abs(z) < F.d / 2 - 4 && !inPond(x, z, 1.2) && treeDist(x, z).every((d) => d >= 4.5) && gymClear(x, z) >= m && !(Math.abs(x - GYM.spawn.x) < 5 && Math.abs(z - GYM.spawn.z) < 5);
  /** 포켓몬들의 집 자리: 땅은 빈 풀밭에 고르게(격자를 흔들어서, 구조물 위에는 안 놓는다), 물은 연못 안에 고르게. 서로 겹치지 않게 넓게 퍼진다 */
  function homes(nLand, nWater) {
    const W = F.w - 10, D = F.d - 10;
    let cand = [];
    // 구조물이 땅의 일부를 차지하니까, 빈자리가 모자라면 격자를 조금씩 촘촘하게 다시 짠다
    for (let f = 1.6; f < 14 && cand.length < nLand; f *= 1.3) {
      const cols = Math.max(1, Math.ceil(Math.sqrt((nLand * f * W) / D))), rows = Math.max(1, Math.ceil((nLand * f) / cols));
      cand = [];
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        for (let tries = 0; tries < 6; tries++) {
          const x = -W / 2 + ((c + 0.5 + (Math.random() - 0.5) * 0.7) / cols) * W, z = -D / 2 + ((r + 0.5 + (Math.random() - 0.5) * 0.7) / rows) * D;
          if (landOk(x, z, 3.5)) { cand.push({ x, z }); break; }
        }
      }
    }
    const land = [];
    const step = Math.max(1, cand.length / Math.max(1, nLand));
    for (let i = 0; i < nLand && Math.floor(i * step) < cand.length; i++) land.push(cand[Math.floor(i * step)]); // 고르게 골라 쓴다 (한쪽에 몰리지 않게)
    for (let tries = 0; land.length < nLand && tries < 3000; tries++) { const x = (Math.random() - 0.5) * W, z = (Math.random() - 0.5) * D; if (landOk(x, z, tries < 1500 ? 2 : 0.5)) land.push({ x, z }); } // 그래도 모자라면 빈 풀밭 아무 데나
    while (land.length < nLand) { const x = (Math.random() - 0.5) * W * 0.9, z = (Math.random() - 0.5) * D * 0.9; if (!inPond(x, z, 1.2)) land.push({ x, z }); }
    const waterSpots = [];
    for (let i = 0; i < nWater; i++) { const a = (i / Math.max(1, nWater)) * Math.PI * 2 + Math.random() * 0.4, rr = 0.35 + 0.5 * ((i % 3) / 2); waterSpots.push({ x: P.x + Math.cos(a) * P.rx * rr, z: P.z + Math.sin(a) * P.rz * rr }); }
    return { land, water: waterSpots };
  }
  /** 집 근처(반지름 r)의 새 목표 자리. water 면 연못 안에서만, 아니면 연못 밖에서만.
   *  땅 포켓몬은 늘 땅 높이(0)로 걸으므로 구조물 위로 올라가면 안 된다 → 반지름을 "집에서 가장 가까운 구조물까지 거리 - 1m" 로 줄인다.
   *  (집 둘레의 이 원 안은 구조물이 없으니, 원 안의 어느 두 점 사이를 곧게 걸어도 구조물을 지나지 않는다) */
  function spotNear(home, r, water) {
    if (!water) r = Math.min(r, gymClear(home.x, home.z) - 1.0);
    if (r < 0.3) return { ...home };
    for (let i = 0; i < 20; i++) {
      const a = Math.random() * Math.PI * 2, d = Math.random() * r, x = home.x + Math.cos(a) * d, z = home.z + Math.sin(a) * d;
      if (Math.abs(x) > F.w / 2 - 2 || Math.abs(z) > F.d / 2 - 2) continue;
      if (water ? !inPond(x, z, 0.92) || onDock(x, z) : inPond(x, z, 1.15) || treeDist(x, z).some((t) => t < 2.6)) continue;
      return { x, z };
    }
    return { ...home };
  }
  return {
    sun, animate, terrain: GYM_TERRAIN, decor, spawn: GYM.spawn, portal: GYM.door, portalTo: 'town', dark: false, gym: true, noShrine: true,
    wildSpots: [], pickupSpots: [], climbAt: GYM_TERRAIN.climbAt,
    field: { w: F.w - 6, d: F.d - 6 }, dummies: GYM.dummies, homes, spotNear, inPond, onDock, waterY: -0.35, swimY: -0.75,
    treeNear: (x, z) => GYM.trees.find((t) => Math.hypot(x - t.x, z - t.z) < 2.6) || null, // 나무 위 집에서 줄기 가까이 (내려가기 버튼)
    npcs: [{ x: coachAt.x, z: coachAt.z, mesh: coach, name: '코리', lines: (c) => [
      `안녕, ${c.name}! 여기는 야외 체육관이야. 아주 옛날 그리스의 올림피아를 본떠 만들었어. 첫 올림픽 경기가 열린 곳이지! 네 포켓몬들이 전부 나와서 뛰어놀고 있어. 가까이 가서 "💪 훈련하기"를 누르면 경험치를 받아!`,
      '북쪽 스타디온은 옛날 선수들이 달리던 길이야. 양쪽 풀 둑에 관중들이 앉아서 응원했대. 경기장에는 저 돌 터널 "크립테"를 지나서 들어가. 둑 꼭대기에서는 터널 지붕 위로도 건널 수 있어!',
      '가운데 큰 돌 기단은 제우스 신전이야. 돌계단으로 올라가 봐. 낮은 기둥 밑동은 밟고, 높은 건 점프! 신상 받침대 위의 올리브 관은 옛날 올림픽 우승 상이었어. 남쪽에 쓰러진 기둥 돌도 통통 밟고 올라갈 수 있어.',
      '서쪽 팔라이스트라는 레슬링 연습장이야. 마당의 샌드백으로 훈련하고, 남쪽 바깥 돌계단으로 올라가면 기둥 회랑 지붕 위를 한 바퀴 걸을 수 있어.',
      '동쪽 연못에는 물 포켓몬들이 헤엄치고 있어. 너도 연못에 들어가면 같이 헤엄칠 수 있어! 잔교 끝에서 뛰어들어 봐. 물속에서는 천천히 움직이고 점프는 못 해.',
      '훈련은 한 마리에 하루 세 번까지. 매일 와서 골고루 훈련시켜 주면 레벨이 쑥쑥 올라.',
      '저 큰 올리브 나무 보이지? 줄기 옆에 서서 점프 버튼을 꾹 누르면 줄기를 타고 올라가. 나무 위 집에서 운동장이 다 보여! 내려올 땐 줄기 옆에서 "⬇ 나무 내려가기" 버튼.',
      `${c.leader ? `${c.leader.speciesId ? '대표 포켓몬도 스타디온을 한 바퀴 달리게 해 보렴.' : ''}` : '대표 포켓몬이 없네? 먼저 포켓몬을 잡아 오렴.'} 옛날 선수들처럼 매일 조금씩 훈련하는 게 최고야!`,
    ] }],
  };
}
