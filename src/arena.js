import * as THREE from 'three';
import { makeNpc } from './npc.js';
import { makeLabelTexture, makePillSprite } from './world.js';

// 넘버볼 아레나 내부: 푸른숲 마을 동남쪽의 둥근 경기장 건물로 들어오면 오는 큰 실내 지역.
// 가운데 포켓몬 경기장(둥근 무대, 1P·2P 자리), 삼면의 관중석, 전광판, 조명탑, 치료 데스크의 봄이(치료), 심판 웅이 (올려 준 NPC 모델을 쓴다).
// 몬스터·블록·퀴즈는 없다. 친구 대결(src/duel.js)을 수락하면 여기로 오고, 친구가 가까이 있으면 "대결!" 버튼이 켜진다. 남쪽 문으로 나가면 푸른숲.
export const ARENA = { size: 90, room: { w: 72, d: 58 }, spawn: { x: 0, z: 22 }, door: { x: 0, z: 28.4 }, ring: { x: 0, z: -3, r: 12 }, spots: { a: { x: -7, z: -3 }, b: { x: 7, z: -3 } } };
const R = ARENA.room;
const inDoorway = (x, z) => Math.abs(x) < 1.6 && z > R.d / 2 - 0.6;
export const ARENA_TERRAIN = {
  height: () => 0, inHole: () => false, size: ARENA.size, obstacles: [],
  blocked: (x, z) => !inDoorway(x, z) && (Math.abs(x) > R.w / 2 - 0.6 || Math.abs(z) > R.d / 2 - 0.6),
};

export function buildArena(scene) {
  const decor = new THREE.Group();
  scene.add(decor);
  const obstacles = ARENA_TERRAIN.obstacles;
  obstacles.length = 0;
  const seg = (ax, az, bx, bz, r = 0.3) => obstacles.push({ ax, az, bx, bz, r });
  const block = (x, z, r) => obstacles.push({ x, z, r });

  scene.background = new THREE.Color(0x0e1424);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8890a8, 1.25));
  const sun = new THREE.DirectionalLight(0xfff6e0, 1.0);
  sun.position.set(10, 30, 8); sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -40, right: 40, top: 40, bottom: -40, near: 1, far: 80 });
  scene.add(sun, sun.target);

  // 바닥: 짙은 초록 잔디 + 흰 선. 가운데 무대는 밝은 원판 + 파란 1P · 빨간 2P 자리
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(R.w, R.d), new THREE.MeshStandardMaterial({ color: 0x3f8f46, roughness: 0.9 }));
  floor.rotation.x = -PI2; floor.receiveShadow = true; floor.userData.noHide = true; decor.add(floor);
  const line = (w, d, x, z) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshBasicMaterial({ color: 0xf4f4f8 })); m.rotation.x = -PI2; m.position.set(x, 0.01, z); m.userData.noHide = true; decor.add(m); };
  line(R.w - 4, 0.25, 0, -R.d / 2 + 2); line(R.w - 4, 0.25, 0, R.d / 2 - 2); line(0.25, R.d - 4, -R.w / 2 + 2, 0); line(0.25, R.d - 4, R.w / 2 - 2, 0);
  const ring = ARENA.ring;
  const stage = new THREE.Mesh(new THREE.CylinderGeometry(ring.r, ring.r + 0.4, 0.3, 48), new THREE.MeshStandardMaterial({ color: 0xf1e9c8, roughness: 0.7 }));
  stage.position.set(ring.x, 0.15, ring.z); stage.receiveShadow = true; stage.userData.noHide = true; decor.add(stage);
  const edge = new THREE.Mesh(new THREE.TorusGeometry(ring.r, 0.18, 8, 64), new THREE.MeshStandardMaterial({ color: 0xffd93d, emissive: 0xffd93d, emissiveIntensity: 0.3 }));
  edge.rotation.x = PI2; edge.position.set(ring.x, 0.32, ring.z); decor.add(edge);
  const mid = new THREE.Mesh(new THREE.PlaneGeometry(0.3, ring.r * 2 - 1), new THREE.MeshBasicMaterial({ color: 0x20232e })); mid.rotation.x = -PI2; mid.position.set(ring.x, 0.31, ring.z); mid.userData.noHide = true; decor.add(mid);
  const ball = new THREE.Mesh(new THREE.CircleGeometry(2.2, 32), new THREE.MeshBasicMaterial({ color: 0xe8453c })); ball.rotation.x = -PI2; ball.position.set(ring.x, 0.315, ring.z); ball.userData.noHide = true; decor.add(ball);
  const ballIn = new THREE.Mesh(new THREE.CircleGeometry(0.9, 24), new THREE.MeshBasicMaterial({ color: 0xf4f4f8 })); ballIn.rotation.x = -PI2; ballIn.position.set(ring.x, 0.32, ring.z); ballIn.userData.noHide = true; decor.add(ballIn);
  for (const [k, s, color, label] of [['a', ARENA.spots.a, 0x3fb8e8, '1P'], ['b', ARENA.spots.b, 0xe8453c, '2P']]) {
    const c = new THREE.Mesh(new THREE.RingGeometry(1.6, 2.0, 32), new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide })); c.rotation.x = -PI2; c.position.set(s.x, 0.33, s.z); c.userData.noHide = true; decor.add(c);
    const tag = makePillSprite(label, { bg: '#' + color.toString(16).padStart(6, '0'), fg: '#ffffff', border: '#ffffff' }, 0.6); tag.position.set(s.x, 0.9, s.z); decor.add(tag);
  }

  // 벽: 짙은 남색 벽 + 노란 띠, 남쪽 벽 가운데는 문
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x27304a }), bandMat = new THREE.MeshStandardMaterial({ color: 0xffd93d });
  const H = 7;
  const wall = (w, d, x, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, H, d), wallMat); m.position.set(x, H / 2, z); m.receiveShadow = true; decor.add(m); const band = new THREE.Mesh(new THREE.BoxGeometry(w + 0.02, 0.6, d + 0.02), bandMat); band.position.set(x, 1.4, z); decor.add(band); };
  wall(R.w + 1, 0.6, 0, -R.d / 2 - 0.3);
  wall(0.6, R.d + 1, -R.w / 2 - 0.3, 0);
  wall(0.6, R.d + 1, R.w / 2 + 0.3, 0);
  wall(R.w / 2 - 2, 0.6, -(R.w / 4 + 1), R.d / 2 + 0.3);
  wall(R.w / 2 - 2, 0.6, R.w / 4 + 1, R.d / 2 + 0.3);
  const doorFrame = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.7, 0.8), new THREE.MeshStandardMaterial({ color: 0xe8453c }));
  doorFrame.position.set(0, 3.6, R.d / 2 + 0.3); decor.add(doorFrame);
  const exitSign = new THREE.Sprite(new THREE.SpriteMaterial({ map: makeLabelTexture('▼ 나가기 (푸른숲)', '#e8453c', '#ffffff', 48), transparent: true, depthTest: false }));
  exitSign.scale.set(3.4, 0.85, 1); exitSign.position.set(0, 3.0, R.d / 2 - 0.5); decor.add(exitSign);

  // 관중석: 북·동·서 삼면, 4단 계단 + 알록달록 좌석. 앞줄 앞은 못 올라간다(장애물)
  const seatColors = [0xe8453c, 0x3fb8e8, 0xffd93d, 0x57b947, 0xb026ff];
  const standMat = new THREE.MeshStandardMaterial({ color: 0x4a5270, roughness: 0.9 });
  const stand = (cx, cz, len, dir) => { // dir: 'n' | 'e' | 'w' — 무대를 바라본다
    for (let t = 0; t < 4; t++) {
      const depth = 1.6, h = 0.7 * (t + 1);
      const along = dir === 'n';
      const g = new THREE.Mesh(new THREE.BoxGeometry(along ? len : depth, h, along ? depth : len), standMat);
      const off = (t + 0.5) * depth;
      g.position.set(along ? cx : cx + (dir === 'e' ? off : -off), h / 2, along ? cz - off : cz);
      g.castShadow = true; g.receiveShadow = true; decor.add(g);
      const seats = Math.floor(len / 1.4);
      for (let i = 0; i < seats; i++) {
        const s = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.5, 0.9), new THREE.MeshStandardMaterial({ color: seatColors[(i + t) % seatColors.length] }));
        const p = -len / 2 + 0.7 + i * 1.4;
        s.position.set(along ? cx + p : g.position.x, h + 0.25, along ? g.position.z : cz + p);
        decor.add(s);
      }
    }
    if (dir === 'n') seg(cx - len / 2, cz, cx + len / 2, cz, 0.4); else seg(cx, cz - len / 2, cx, cz + len / 2, 0.4);
  };
  stand(0, -R.d / 2 + 7.5, R.w - 8, 'n');
  stand(R.w / 2 - 7.5, -3, R.d - 22, 'e');
  stand(-R.w / 2 + 7.5, -3, R.d - 22, 'w');

  // 전광판 (북쪽 벽 위) + 현수막
  const board = new THREE.Mesh(new THREE.BoxGeometry(18, 4.2, 0.4), new THREE.MeshStandardMaterial({ color: 0x0f1a2e }));
  board.position.set(0, 5.4, -R.d / 2 + 0.5); decor.add(board);
  const boardText = new THREE.Sprite(new THREE.SpriteMaterial({ map: makeLabelTexture('🏟 넘버볼 아레나 · 친구와 대결!', '#0f1a2e', '#ffd93d', 56), transparent: true, depthTest: false }));
  boardText.scale.set(14, 2.6, 1); boardText.position.set(0, 5.4, -R.d / 2 + 0.9); decor.add(boardText);
  for (const [x, text, bg] of [[-R.w / 2 + 1, '⚡ 힘내라!', '#3fb8e8'], [R.w / 2 - 1, '🔥 이겨라!', '#e8453c']]) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: makeLabelTexture(text, bg, '#ffffff', 48), transparent: true, depthTest: false }));
    s.scale.set(5, 1.3, 1); s.position.set(x, 5.5, -6); decor.add(s);
  }

  // 조명탑 넷 + 무대를 비추는 스포트라이트
  const lights = [];
  for (const [x, z] of [[-R.w / 2 + 4, -R.d / 2 + 4], [R.w / 2 - 4, -R.d / 2 + 4], [-R.w / 2 + 4, R.d / 2 - 4], [R.w / 2 - 4, R.d / 2 - 4]]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.35, 9, 10), new THREE.MeshStandardMaterial({ color: 0x9aa4b8 }));
    pole.position.set(x, 4.5, z); decor.add(pole); block(x, z, 0.6);
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.8, 1.0), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff2c0, emissiveIntensity: 1.2 }));
    lamp.position.set(x, 9.2, z); lamp.lookAt(ring.x, 0, ring.z); decor.add(lamp);
    const spot = new THREE.SpotLight(0xfff4d6, 2.2, 60, Math.PI / 7, 0.5, 1);
    spot.position.set(x, 9, z); spot.target.position.set(ring.x, 0, ring.z); decor.add(spot, spot.target);
    lights.push(spot);
  }

  // 치료 데스크 + 간호사 조이 (서쪽 앞), 심판 (무대 앞)
  const desk = new THREE.Mesh(new THREE.BoxGeometry(5, 1.1, 1.6), new THREE.MeshStandardMaterial({ color: 0xf6f3ea }));
  desk.position.set(-16, 0.55, 19); desk.castShadow = true; decor.add(desk); seg(-18.5, 19, -13.5, 19, 0.9);
  const cross = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.2, 0.1), new THREE.MeshStandardMaterial({ color: 0xe8453c })); cross.position.set(-16, 2.6, 21.2); decor.add(cross);
  const crossH = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.26, 0.12), new THREE.MeshStandardMaterial({ color: 0xffffff })); crossH.position.copy(cross.position); decor.add(crossH);
  const crossV = crossH.clone(); crossV.rotation.z = PI2; decor.add(crossV);
  const deskSign = new THREE.Sprite(new THREE.SpriteMaterial({ map: makeLabelTexture('🏥 치료 데스크', '#ffffff', '#e8453c', 44), transparent: true, depthTest: false }));
  deskSign.scale.set(3.6, 0.9, 1); deskSign.position.set(-16, 3.5, 20); decor.add(deskSign);
  const nurse = makeNpc({ outfit: 'professor', name: '봄이', model: '봄이.glb' }); // 불의산 안내원 봄이가 아레나 치료 데스크도 본다
  nurse.position.set(-16, 0, 17.2); nurse.rotation.y = Math.PI; decor.add(nurse);
  const referee = makeNpc({ outfit: 'ranger', name: '웅이', model: '웅이.glb' }); // 지하동굴 안내원 웅이가 심판
  referee.position.set(0, 0, 10.5); referee.rotation.y = Math.PI; decor.add(referee);

  function animate(t) { lights.forEach((l, i) => { l.intensity = 2.0 + Math.sin(t * 1.3 + i) * 0.3; }); edge.material.emissiveIntensity = 0.3 + Math.sin(t * 2) * 0.2; }

  return {
    sun, animate, terrain: ARENA_TERRAIN, decor, spawn: ARENA.spawn, portal: ARENA.door, dark: false, indoor: true, noShrine: true,
    wildSpots: [], pickupSpots: [],
    duelSpots: ARENA.spots,
    npcs: [
      { x: nurse.position.x, z: nurse.position.z, mesh: nurse, name: '봄이', heal: true, lines: (c) => [
        `어서 와, ${c.name}! 나 봄이야, 오늘은 아레나 치료 데스크를 맡았어. 대결로 지친 포켓몬은 언제든 여기서 낫게 해 줄게.`,
        '친구와 대결하려면 도감 친구 탭에서 ⚔ 대결을 눌러 신청해. 친구가 수락하면 둘 다 여기 아레나로 오게 돼.',
        '아레나에서 친구 가까이 가면 "대결!" 버튼이 켜져. 서로 번갈아 기술을 하나씩 고르는 거야.',
        '대결에서 이기면 블록 30개, 져도 10개! 주간 순위에도 대결 승리 점수가 들어간단다.',
      ] },
      { x: referee.position.x, z: referee.position.z, mesh: referee, name: '웅이', lines: (c) => [
        `${c.name} 선수, 심판 웅이다! 무대에 오르렴! 파란 1P 자리는 신청한 사람, 빨간 2P 자리는 받은 사람이야.`,
        '피해는 공격력 × 기술 배수 × 속성 상성이야. 불은 풀에, 물은 불에, 풀은 물에 세단다. 상대 대표를 보고 기술을 고르렴!',
        '상대가 자리에 없으면 기다려도 돼. 차례는 남아 있으니 나중에 도감 대결 탭에서 이어서 할 수 있어.',
        '먼저 상대 포켓몬의 체력을 0으로 만드는 쪽이 이겨! 정정당당하게!',
      ] },
    ],
  };
}
const PI2 = Math.PI / 2;
