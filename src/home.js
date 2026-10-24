import * as THREE from 'three';
import { makeNpc } from './npc.js';
import { makeLabelTexture, makePillSprite } from './world.js';
import { NUMBER_COLORS } from './palette.js';

// 지우네 집: 푸른숲 마을 서쪽(학교 가는 길목)의 작은 집. 문으로 들어오면 오는 아늑한 실내 지역 (몬스터·블록은 없다).
//  - 엄마: 말을 걸면 포켓몬을 치료해 주고 집안 이야기를 해 준다
//  - 침대: 가까이 가서 "자기" 버튼 → 잠깐 눈을 감았다 뜨면 포켓몬이 모두 낫고 저장된다
//  - 책상: 학교의 내 자리처럼 앉아서 숙제(과목 공부)를 할 수 있다 (main 이 world.mySeat 로 다룬다)
export const HOME = { size: 30, room: { w: 16, d: 12 }, spawn: { x: 0, z: 3.4 }, door: { x: 0, z: 6.6 } };
const R = HOME.room;
const inDoorway = (x, z) => Math.abs(x) < 1.2 && z > R.d / 2 - 0.6;
export const HOME_TERRAIN = {
  height: () => 0, inHole: () => false, size: HOME.size, obstacles: [],
  blocked: (x, z) => !inDoorway(x, z) && (Math.abs(x) > R.w / 2 - 0.6 || Math.abs(z) > R.d / 2 - 0.6),
};

export function buildHome(scene) {
  const decor = new THREE.Group();
  scene.add(decor);
  const obstacles = HOME_TERRAIN.obstacles;
  obstacles.length = 0;
  const block = (x, z, r) => obstacles.push({ x, z, r });

  scene.background = new THREE.Color(0x2a2230);
  scene.add(new THREE.HemisphereLight(0xfff2dc, 0xa08a70, 1.4));
  const sun = new THREE.DirectionalLight(0xffe8c0, 0.9);
  sun.position.set(6, 14, 4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -14, right: 14, top: 14, bottom: -14, near: 1, far: 40 });
  scene.add(sun, sun.target);
  const lamp = new THREE.PointLight(0xffd9a0, 1.4, 14); lamp.position.set(0, 3.2, 0); scene.add(lamp);

  // 바닥: 나무 마루 + 둥근 러그
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(R.w, R.d, 16, 1), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 }));
  {
    const pos = floor.geometry.attributes.position, cols = [];
    const a = new THREE.Color(0xe0b27a), b = new THREE.Color(0xcf9f66);
    for (let i = 0; i < pos.count; i++) { const c = Math.floor((pos.getX(i) + R.w / 2) + 0.001) % 2 === 0 ? a : b; cols.push(c.r, c.g, c.b); }
    floor.geometry.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  }
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; floor.userData.noHide = true;
  decor.add(floor);
  const rug = new THREE.Mesh(new THREE.CircleGeometry(2.4, 28), new THREE.MeshStandardMaterial({ color: 0xe8453c }));
  rug.rotation.x = -Math.PI / 2; rug.position.set(0, 0.02, 1.2); rug.userData.noHide = true;
  const rugRing = new THREE.Mesh(new THREE.RingGeometry(1.6, 1.9, 28), new THREE.MeshStandardMaterial({ color: 0xffd93d }));
  rugRing.rotation.x = -Math.PI / 2; rugRing.position.set(0, 0.03, 1.2); rugRing.userData.noHide = true;
  decor.add(rug, rugRing);

  // 벽: 크림색 벽지 + 분홍 띠, 남쪽 벽 가운데는 문
  const wallMat = new THREE.MeshStandardMaterial({ color: 0xfff1dc }), bandMat = new THREE.MeshStandardMaterial({ color: 0xff8fa8 });
  const H = 3.6;
  const wall = (w, d, x, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, H, d), wallMat); m.position.set(x, H / 2, z); m.receiveShadow = true; decor.add(m); const band = new THREE.Mesh(new THREE.BoxGeometry(w + 0.02, 0.3, d + 0.02), bandMat); band.position.set(x, 0.9, z); decor.add(band); };
  wall(R.w + 1, 0.5, 0, -R.d / 2 - 0.25);
  wall(0.5, R.d + 1, -R.w / 2 - 0.25, 0);
  wall(0.5, R.d + 1, R.w / 2 + 0.25, 0);
  wall(R.w / 2 - 1.4, 0.5, -(R.w / 4 + 0.7), R.d / 2 + 0.25);
  wall(R.w / 2 - 1.4, 0.5, R.w / 4 + 0.7, R.d / 2 + 0.25);
  const doorFrame = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.5, 0.6), new THREE.MeshStandardMaterial({ color: 0x8b5a2b }));
  doorFrame.position.set(0, 2.9, R.d / 2 + 0.25);
  decor.add(doorFrame);
  const exitSign = new THREE.Sprite(new THREE.SpriteMaterial({ map: makeLabelTexture('▼ 나가기 (마을)', '#8b5a2b', '#ffffff', 48), transparent: true, depthTest: false }));
  exitSign.scale.set(3, 0.75, 1); exitSign.position.set(0, 2.5, R.d / 2 - 0.4);
  decor.add(exitSign);
  // 창문 (동쪽): 밝은 하늘 + 창틀 + 커튼
  {
    const win = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.6, 2.6), new THREE.MeshStandardMaterial({ color: 0xbfeaff, emissive: 0x7fd4f5, emissiveIntensity: 0.6 })); win.position.set(R.w / 2 - 0.02, 2.1, -1.5);
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.6, 0.08), new THREE.MeshStandardMaterial({ color: 0xffffff })); bar.position.set(R.w / 2 - 0.05, 2.1, -1.5);
    for (const cz of [-3.1, 0.1]) { const curtain = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.0, 0.7), new THREE.MeshStandardMaterial({ color: 0xffb3c6 })); curtain.position.set(R.w / 2 - 0.1, 2.0, cz); decor.add(curtain); }
    decor.add(win, bar);
  }

  const woodMat = new THREE.MeshStandardMaterial({ color: 0xc9a15a }), darkWood = new THREE.MeshStandardMaterial({ color: 0x8b5a2b });
  // 침대 (북서쪽): 나무 틀 + 파란 이불 + 베개 + 피카츄 인형
  const bedAt = { x: -5.2, z: -3.4 };
  {
    const frame = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.5, 4.2), darkWood); frame.position.set(bedAt.x, 0.25, bedAt.z); frame.castShadow = true;
    const mattress = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.3, 4.0), new THREE.MeshStandardMaterial({ color: 0xffffff })); mattress.position.set(bedAt.x, 0.65, bedAt.z);
    const quilt = new THREE.Mesh(new THREE.BoxGeometry(2.45, 0.22, 2.8), new THREE.MeshStandardMaterial({ color: 0x3f7fd6 })); quilt.position.set(bedAt.x, 0.9, bedAt.z + 0.5);
    const pillow = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.25, 0.7), new THREE.MeshStandardMaterial({ color: 0xfff4dc })); pillow.position.set(bedAt.x, 0.92, bedAt.z - 1.5);
    const head = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.3, 0.2), darkWood); head.position.set(bedAt.x, 0.9, bedAt.z - 2.1);
    decor.add(frame, mattress, quilt, pillow, head);
    // 피카츄 인형: 노란 공 + 귀 둘 + 빨간 볼
    const doll = new THREE.Group();
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.28, 14, 10), new THREE.MeshStandardMaterial({ color: 0xffd93d }));
    for (const ex of [-0.14, 0.14]) { const ear = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.4, 6), new THREE.MeshStandardMaterial({ color: 0xffd93d })); ear.position.set(ex, 0.4, 0); ear.rotation.z = ex > 0 ? -0.3 : 0.3; const tipM = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.14, 6), new THREE.MeshStandardMaterial({ color: 0x20232e })); tipM.position.set(ex + (ex > 0 ? 0.05 : -0.05), 0.55, 0); tipM.rotation.z = ear.rotation.z; doll.add(ear, tipM); }
    for (const cx of [-0.17, 0.17]) { const cheek = new THREE.Mesh(new THREE.CircleGeometry(0.06, 8), new THREE.MeshBasicMaterial({ color: 0xe8453c })); cheek.position.set(cx, -0.03, 0.26); doll.add(cheek); }
    doll.add(body);
    doll.position.set(bedAt.x + 0.7, 1.3, bedAt.z - 1.0); doll.rotation.y = 0.6;
    decor.add(doll);
    obstacles.push({ ax: bedAt.x, az: bedAt.z - 2.1, bx: bedAt.x, bz: bedAt.z + 2.1, r: 1.35 });
  }
  const bedSpot = { x: bedAt.x + 2.4, z: bedAt.z + 0.6 }; // 침대 옆 (여기 서면 "자기" 버튼)
  const bedSign = makePillSprite('🛏 침대', { bg: '#fffbe6', fg: '#20232e', border: '#3f7fd6' }, 0.8);
  bedSign.position.set(bedAt.x, 2.4, bedAt.z); decor.add(bedSign);

  // 책상 (북쪽 벽, 가운데 오른쪽): 스탠드·공책·연필꽂이 + 의자 (내 자리: 숙제)
  const deskAt = { x: 2.6, z: -4.6 };
  {
    const top = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.1, 1.1), woodMat); top.position.set(deskAt.x, 0.78, deskAt.z); top.castShadow = true;
    for (const lx of [-1.05, 1.05]) for (const lz of [-0.4, 0.4]) { const leg = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.78, 0.1), darkWood); leg.position.set(deskAt.x + lx, 0.39, deskAt.z + lz); decor.add(leg); }
    const lampArm = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.7, 6), new THREE.MeshStandardMaterial({ color: 0x8a94a6 })); lampArm.position.set(deskAt.x - 0.9, 1.18, deskAt.z - 0.3); lampArm.rotation.z = 0.4;
    const shade = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.3, 10, 1, true), new THREE.MeshStandardMaterial({ color: 0x57b947, side: THREE.DoubleSide })); shade.position.set(deskAt.x - 0.72, 1.5, deskAt.z - 0.3);
    const bulb = new THREE.PointLight(0xfff1b5, 1.2, 6); bulb.position.set(deskAt.x - 0.72, 1.35, deskAt.z - 0.3);
    const note = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.04, 0.45), new THREE.MeshStandardMaterial({ color: NUMBER_COLORS[3].base })); note.position.set(deskAt.x + 0.1, 0.85, deskAt.z + 0.1); note.rotation.y = -0.15;
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.1, 0.3, 10), new THREE.MeshStandardMaterial({ color: 0x3fb8e8 })); cup.position.set(deskAt.x + 0.9, 0.98, deskAt.z - 0.25);
    for (let k = 0; k < 3; k++) { const pencil = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.45, 5), new THREE.MeshStandardMaterial({ color: [0xffd93d, 0xe8453c, 0x57b947][k] })); pencil.position.set(deskAt.x + 0.86 + k * 0.04, 1.2, deskAt.z - 0.28 + k * 0.03); pencil.rotation.z = (k - 1) * 0.15; decor.add(pencil); }
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.08, 0.6), new THREE.MeshStandardMaterial({ color: 0xff8fa8 })); seat.position.set(deskAt.x, 0.48, deskAt.z + 1.05);
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.6, 0.08), new THREE.MeshStandardMaterial({ color: 0xff8fa8 })); back.position.set(deskAt.x, 0.8, deskAt.z + 1.35);
    for (const lx of [-0.28, 0.28]) for (const lz of [-0.25, 0.25]) { const leg = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.48, 0.06), darkWood); leg.position.set(deskAt.x + lx, 0.24, deskAt.z + 1.05 + lz); decor.add(leg); }
    decor.add(top, lampArm, shade, bulb, note, cup, seat, back);
    obstacles.push({ ax: deskAt.x - 1.2, az: deskAt.z, bx: deskAt.x + 1.2, bz: deskAt.z, r: 0.5 });
    // 벽에 붙인 시간표와 그림
    const board = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.0), new THREE.MeshBasicMaterial({ map: makeLabelTexture('📒 숙제 먼저! 그다음 모험', '#fff4d6', '#8a5a00', 40) }));
    board.position.set(deskAt.x, 2.1, -R.d / 2 + 0.02); decor.add(board);
  }
  const mySeat = { x: deskAt.x, z: deskAt.z + 1.05 };
  const seatStar = makePillSprite('⭐ 내 책상', { bg: '#fffbe6', fg: '#20232e', border: '#ffd93d' }, 0.8);
  seatStar.position.set(deskAt.x, 2.0, deskAt.z + 0.4); decor.add(seatStar);
  const seatGlow = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.68, 28), new THREE.MeshBasicMaterial({ color: 0xffd93d, transparent: true, opacity: 0.7, side: THREE.DoubleSide }));
  seatGlow.rotation.x = -Math.PI / 2; seatGlow.position.set(mySeat.x, 0.03, mySeat.z + 0.1); seatGlow.userData.noHide = true;
  decor.add(seatGlow);

  // 책장 (북동쪽 구석) + 텔레비전 (동쪽 벽 앞) + 식탁 (남서쪽)
  {
    const shelf = new THREE.Mesh(new THREE.BoxGeometry(1.8, 2.4, 0.5), darkWood); shelf.position.set(6.4, 1.2, -R.d / 2 + 0.5); shelf.castShadow = true;
    decor.add(shelf);
    for (let row = 0; row < 3; row++) for (let k = 0; k < 4; k++) { const bk = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.55, 0.3), new THREE.MeshStandardMaterial({ color: NUMBER_COLORS[(k + row * 4) % 10 + 1].base })); bk.position.set(5.75 + k * 0.42, 0.45 + row * 0.78, -R.d / 2 + 0.55); decor.add(bk); }
    obstacles.push({ ax: 5.5, az: -R.d / 2 + 0.5, bx: 7.3, bz: -R.d / 2 + 0.5, r: 0.6 });
    const tvStand = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 2.2), woodMat); tvStand.position.set(R.w / 2 - 0.8, 0.3, 2.2);
    const tv = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.1, 1.9), new THREE.MeshStandardMaterial({ color: 0x20232e })); tv.position.set(R.w / 2 - 0.8, 1.2, 2.2);
    const screenTex = makeLabelTexture('📺 오늘의 포켓몬 뉴스', '#1b2a4a', '#9fe8ff', 36);
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 0.95), new THREE.MeshBasicMaterial({ map: screenTex })); screen.position.set(R.w / 2 - 0.86, 1.2, 2.2); screen.rotation.y = -Math.PI / 2;
    const tvGlow = new THREE.PointLight(0x7fd4ff, 0.8, 6); tvGlow.position.set(R.w / 2 - 1.6, 1.2, 2.2);
    decor.add(tvStand, tv, screen, tvGlow); block(R.w / 2 - 0.8, 2.2, 1.2);
    const table = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 0.08, 20), woodMat); table.position.set(-5.2, 0.78, 2.6); table.castShadow = true;
    const tleg = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.3, 0.78, 10), darkWood); tleg.position.set(-5.2, 0.39, 2.6);
    const cloth = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 0.02, 20), new THREE.MeshStandardMaterial({ color: 0xfff4dc })); cloth.position.set(-5.2, 0.83, 2.6);
    const bowl = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xffffff })); bowl.position.set(-5.2, 0.86, 2.6); bowl.rotation.x = Math.PI;
    const apple = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8), new THREE.MeshStandardMaterial({ color: 0xe8453c })); apple.position.set(-5.1, 1.05, 2.5);
    const apple2 = apple.clone(); apple2.position.set(-5.35, 1.03, 2.75); apple2.material = new THREE.MeshStandardMaterial({ color: 0x7ed957 });
    decor.add(table, tleg, cloth, bowl, apple, apple2); block(-5.2, 2.6, 1.4);
    for (const [sx, sz] of [[-5.2, 4.3], [-3.6, 2.6]]) { const stool = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.5, 10), new THREE.MeshStandardMaterial({ color: 0xff8fa8 })); stool.position.set(sx, 0.25, sz); decor.add(stool); block(sx, sz, 0.35); }
  }
  // 사진 액자 (서쪽 벽): 주인공과 피카츄 + 화분
  {
    const frame = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.0, 1.4), darkWood); frame.position.set(-R.w / 2 + 0.05, 2.2, 1.0);
    const photo = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.8), new THREE.MeshBasicMaterial({ map: makeLabelTexture('📷 우리 가족 ❤', '#dfe9f5', '#20232e', 40) })); photo.position.set(-R.w / 2 + 0.1, 2.2, 1.0); photo.rotation.y = Math.PI / 2;
    decor.add(frame, photo);
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.3, 0.55, 10), new THREE.MeshStandardMaterial({ color: 0xc46b2c })); pot.position.set(6.8, 0.27, 4.8);
    const plant = new THREE.Mesh(new THREE.SphereGeometry(0.6, 10, 8), new THREE.MeshStandardMaterial({ color: 0x3f9d3a })); plant.position.set(6.8, 1.0, 4.8);
    decor.add(pot, plant); block(6.8, 4.8, 0.55);
  }

  // 엄마 (드래프트 사람: 앞치마). 식탁 옆에서 문 쪽을 본다
  const momAt = { x: -2.6, z: -1.2 };
  const mom = makeNpc({ outfit: 'mom', name: '엄마' });
  mom.position.set(momAt.x, 0, momAt.z);
  mom.rotation.y = Math.PI * 0.85;
  decor.add(mom); block(momAt.x, momAt.z, 0.6);

  function animate(t) {
    mom.position.y = Math.sin(t * 2) * 0.03;
    seatStar.position.y = 2.0 + Math.sin(t * 2.5) * 0.1;
    seatGlow.material.opacity = 0.45 + Math.sin(t * 3) * 0.25;
    bedSign.position.y = 2.4 + Math.sin(t * 2.2 + 1) * 0.1;
  }

  return {
    sun, animate, terrain: HOME_TERRAIN, decor, spawn: HOME.spawn, portal: HOME.door, dark: false, indoor: true,
    wildSpots: [], pickupSpots: [],
    mySeat, seatLabel: '📚 숙제하기', // 책상에 앉으면 학교처럼 과목 공부 (숙제)
    bed: bedSpot,                    // 침대 옆에 서면 "자기" 버튼 (포켓몬 치료 + 저장)
    npcs: [{
      x: momAt.x, z: momAt.z, mesh: mom, name: '엄마', heal: true, prompt: '엄마야! 대화 버튼을 눌러 봐.',
      lines: (c) => [
        `${c.name}, 다녀왔니? 포켓몬들도 많이 지쳤겠구나. 엄마가 돌봐 줄게. 푹 쉬고 가렴!`,
        '숙제는 했어? 네 책상에 앉으면 학교 숙제를 할 수 있단다. 오박사님이 칠판에 적어 두셨대.',
        '피곤하면 침대에서 한숨 자렴. 자고 일어나면 포켓몬들도 기운이 나고, 모험도 저장돼.',
        '모험 다닐 땐 꼭 손 씻고 밥 먹고! 식탁에 사과 놔뒀어. 가져가렴.',
        '마을 서쪽 노란 건물이 포켓몬 학교야. 친구들이 다 거기 있더라. 오박사님 말씀 잘 듣고!',
        '북쪽 동굴은 어두우니까 조심해. 동굴 속에 번개가 치는 굴이 있다던데… 전기 포켓몬이 산대. 땅 포켓몬이 있으면 든든하겠지?',
        `우리 ${c.name}는 엄마의 자랑이야. 오늘도 재밌게 놀다 와!`,
      ],
    }],
  };
}
