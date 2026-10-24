import * as THREE from 'three';
import { makeNpc } from './npc.js';
import { makeLabelTexture, makePillSprite } from './world.js';
import { NUMBER_COLORS } from './palette.js';

// 포켓몬 학교 교실: 푸른숲 마을 서쪽의 학교 문으로 들어오면 오는 작은 실내 지역 (연구소처럼 몬스터·블록은 없다).
// 북쪽 벽에 칠판, 그 앞 교탁에 오박사님(선생님), 학생 자리 12개(4줄 × 3줄). 친구 11명이 자리에 앉아 있고
// 앞줄의 빈자리 하나가 "내 자리"다. 내 자리에 가면 "공부하기" 버튼 → 과목을 골라 공부한다 (src/study.js).
// 열두 번째 친구 인하는 오늘의 당번이라 칠판 옆에 서 있다.
export const SCHOOL = { size: 50, room: { w: 30, d: 24 }, spawn: { x: 0, z: 8.8 }, door: { x: 0, z: 11.6 } };
const R = SCHOOL.room;
const inDoorway = (x, z) => Math.abs(x) < 1.3 && z > R.d / 2 - 0.6;
export const SCHOOL_TERRAIN = {
  height: () => 0, inHole: () => false, size: SCHOOL.size, obstacles: [],
  blocked: (x, z) => !inDoorway(x, z) && (Math.abs(x) > R.w / 2 - 0.6 || Math.abs(z) > R.d / 2 - 0.6),
};
// 학생 자리: 4칸 × 3줄. 책상은 칠판(북쪽, -z)을 보고, 의자는 책상 남쪽(+z)
const COLS = [-9, -3, 3, 9], ROWS = [-3.6, 0.4, 4.4];
const CHAIR = 1.05; // 책상 가운데 → 의자 가운데
const MY_SEAT = { col: 2, row: 0 }; // 앞줄 오른쪽에서 두 번째
// 자리에 앉은 친구 11명 (기존 NPC 모델) — 이름, 드래프트 옷, 이야기
const CLASSMATES = [
  { name: '벅스버니', outfit: 'ranger', lines: (c) => [`어이, ${c.name}! 수업 시간엔 당근을 못 먹어서 괴롭다고.`, '난 수학이 제일 좋아. 당근이 3개씩 4줄이면 12개! 구구단은 간식 셀 때 최고야.', '쉬는 시간에 푸른숲 아레나 얘기 하자고. 이상해꽃은 불 포켓몬으로 상대하는 게 좋아!'] },
  { name: '나미', outfit: 'astronaut', lines: (c) => [`안녕, ${c.name}! 난 바다 이야기라면 자신 있어.`, '과학 시간에 고래가 물고기가 아니라는 걸 배웠어. 숨을 쉬고 젖을 먹인대!', '영어로 바다는 sea, 물은 water야. 물 포켓몬을 영어로 water Pokémon 이라고 해!'] },
  { name: '웅이', outfit: 'miner', lines: (c) => [`${c.name}, 반가워! 광부 웅이도 학교는 꼬박꼬박 와.`, '한자 山(메 산)은 봉우리 세 개 모양이래. 동굴 위에 있는 산이 딱 그 모양이야!', '지하동굴은 이제 산기슭 입구로 걸어 들어오면 돼. 놀러 와!'] },
  { name: '봄이', outfit: 'professor', lines: (c) => [`${c.name}, 숙제 했어? 난 오늘 국어 숙제를 벌써 끝냈지롱!`, '높임말 알아? 할머니께는 "밥" 대신 "진지", "자다" 대신 "주무시다"라고 해.', '포켓몬이 다치면 치료가 먼저야. 공부도 몸이 건강해야 잘 돼!'] },
  { name: '리리', outfit: 'captain', lines: (c) => [`어서 오게, ${c.name}! 기차 선장도 공부는 해야 한다네.`, '기차 시간표를 읽으려면 수학이 필요해. 3시 다음 2시간 뒤는 5시!', '영어로 기차는 train. 내 기차 이름표에도 적혀 있지!'] },
  { name: '코리', outfit: 'astronaut', lines: (c) => [`반가워, ${c.name}! 난 과학 시간을 기다렸어.`, '해는 동쪽에서 떠서 서쪽으로 져. 우주에서 보면 지구가 도는 거야!', '무지개는 빨주노초파남보 일곱 색. 꿈의우주에서도 별빛이 일곱 색으로 반짝여!'] },
  { name: '루피', outfit: 'captain', lines: (c) => [`시시싯! ${c.name}, 나 배고파… 점심시간 언제야?`, '난 국어가 어려워. "어떻게"랑 "어떡해"가 헷갈려! "어떻게 할까?" "어떡해!" 이렇게 쓴대.', '그래도 친구랑 함께하면 뭐든 할 수 있어. 숙제도 같이 하자!'] },
  { name: '아이 손오공', outfit: 'ranger', lines: (c) => [`오스! ${c.name}, 공부도 수련이야!`, '한자 大(큰 대)는 사람이 팔다리를 쫙 벌린 모양이래. 에네르기파 자세 같아!', '매일 조금씩 하면 세져. 숙제도 매일 조금씩!'] },
  { name: '손오공', outfit: 'pilot', lines: (c) => [`어이, ${c.name}! 학교 끝나면 UFO 타러 갈래?`, '영어 숫자 알아? one, two, three, four, five! 행성은 태양에서 세 번째가 지구야.', '오박사님 수업은 졸리면 안 돼. 포켓몬 이야기가 엄청 재밌거든!'] },
  { name: '도토로', outfit: 'miner', lines: (c) => [`토토로~ ${c.name}, 안녕!`, '나무를 한자로 木(나무 목)이라고 해. 나무가 서 있는 모양 같지? 내가 사는 큰 나무도 木!', '식물은 햇빛과 물을 먹고 자라. 풀 포켓몬도 햇볕을 쬐면 기운이 나!'] },
  { name: '베지터', outfit: 'pilot', lines: (c) => [`흥, ${c.name}. 내가 이 반 1등이다.`, '구구단 9단쯤은 눈 감고도 외운다. 9 × 9 = 81!', '…숙제? 당연히 했지. 넌 했냐? 오박사님께 검사 받아!'] },
];
const MONITOR = { name: '인하', outfit: 'ranger', lines: (c) => [`안녕, ${c.name}! 난 오늘 당번 인하야. 포켓몬 학교에 온 걸 환영해!`, '앞줄의 ⭐ 표시가 있는 빈자리가 네 자리야. 가까이 가서 "공부하기" 버튼을 누르면 앉아서 공부할 수 있어.', '수학·영어·국어·한자·과학 중에 골라서 공부해. 다섯 문제 중에 맞힌 만큼 블록을 받아!', '칠판에 오늘의 숙제가 적혀 있어. 숙제를 끝내고 오박사님께 말씀드리면 칭찬 블록을 주셔!', '문으로 나가면 마을이야. 또 놀러 와!'] };
const MODEL = { '아이 손오공': '아이손오공.glb' };
const modelOf = (name) => MODEL[name] || `${name}.glb`;

export function buildSchool(scene) {
  const decor = new THREE.Group();
  scene.add(decor);
  const obstacles = SCHOOL_TERRAIN.obstacles;
  obstacles.length = 0;
  const block = (x, z, r) => obstacles.push({ x, z, r });

  scene.background = new THREE.Color(0x24324a);
  scene.add(new THREE.HemisphereLight(0xffffff, 0xb8a98a, 1.5));
  const sun = new THREE.DirectionalLight(0xfff6e0, 1.1);
  sun.position.set(-10, 20, 6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -22, right: 22, top: 22, bottom: -22, near: 1, far: 60 });
  scene.add(sun, sun.target);
  for (const [lx, lz] of [[-8, -4], [8, -4], [-8, 5], [8, 5]]) { const l = new THREE.PointLight(0xfff4d6, 1.1, 18); l.position.set(lx, 3.8, lz); scene.add(l); }

  // 바닥: 나무 마루 (줄무늬)
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(R.w, R.d, 30, 1), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 }));
  {
    const pos = floor.geometry.attributes.position, cols = [];
    const a = new THREE.Color(0xd9a86c), b = new THREE.Color(0xc99659);
    for (let i = 0; i < pos.count; i++) { const c = Math.floor((pos.getX(i) + R.w / 2) / 1.0 + 0.001) % 2 === 0 ? a : b; cols.push(c.r, c.g, c.b); }
    floor.geometry.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  }
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; floor.userData.noHide = true;
  decor.add(floor);
  const mat = new THREE.Mesh(new THREE.PlaneGeometry(3, 1.6), new THREE.MeshStandardMaterial({ color: 0x3fb8e8 }));
  mat.rotation.x = -Math.PI / 2; mat.position.set(0, 0.02, R.d / 2 - 1.4); mat.userData.noHide = true;
  decor.add(mat);

  // 벽: 연노랑 벽 + 초록 띠, 남쪽 벽 가운데는 문
  const wallMat = new THREE.MeshStandardMaterial({ color: 0xfff3c9 }), bandMat = new THREE.MeshStandardMaterial({ color: 0x57b947 });
  const H = 4.2;
  const wall = (w, d, x, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, H, d), wallMat); m.position.set(x, H / 2, z); m.receiveShadow = true; decor.add(m); const band = new THREE.Mesh(new THREE.BoxGeometry(w + 0.02, 0.4, d + 0.02), bandMat); band.position.set(x, 1.0, z); decor.add(band); };
  wall(R.w + 1, 0.5, 0, -R.d / 2 - 0.25);
  wall(0.5, R.d + 1, -R.w / 2 - 0.25, 0);
  wall(0.5, R.d + 1, R.w / 2 + 0.25, 0);
  wall(R.w / 2 - 1.5, 0.5, -(R.w / 4 + 0.75), R.d / 2 + 0.25);
  wall(R.w / 2 - 1.5, 0.5, R.w / 4 + 0.75, R.d / 2 + 0.25);
  const doorFrame = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.6, 0.6), new THREE.MeshStandardMaterial({ color: 0x8b5a2b }));
  doorFrame.position.set(0, 3.2, R.d / 2 + 0.25);
  decor.add(doorFrame);
  const exitSign = new THREE.Sprite(new THREE.SpriteMaterial({ map: makeLabelTexture('▼ 나가기 (마을)', '#8b5a2b', '#ffffff', 48), transparent: true, depthTest: false }));
  exitSign.scale.set(3, 0.75, 1); exitSign.position.set(0, 2.6, R.d / 2 - 0.4);
  decor.add(exitSign);
  // 동쪽 벽 창문 (밝은 하늘빛)
  const winMat = new THREE.MeshStandardMaterial({ color: 0xbfeaff, emissive: 0x7fd4f5, emissiveIntensity: 0.6 });
  for (const wz of [-6, 0, 6]) {
    const win = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.8, 3), winMat); win.position.set(R.w / 2 - 0.02, 2.4, wz);
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.8, 0.08), new THREE.MeshStandardMaterial({ color: 0xffffff })); bar.position.set(R.w / 2 - 0.05, 2.4, wz);
    decor.add(win, bar);
  }

  // 칠판 (북쪽 벽): 오늘의 숙제는 main 이 setBoard 로 적어 준다
  const boardCanvas = document.createElement('canvas'); boardCanvas.width = 1024; boardCanvas.height = 384;
  const boardTex = new THREE.CanvasTexture(boardCanvas); boardTex.colorSpace = THREE.SRGBColorSpace;
  const board = new THREE.Mesh(new THREE.PlaneGeometry(11, 4.1), new THREE.MeshBasicMaterial({ map: boardTex }));
  board.position.set(0, 2.45, -R.d / 2 + 0.09); // 나무 틀(두께 0.1) 앞에
  const boardFrame = new THREE.Mesh(new THREE.BoxGeometry(11.5, 4.6, 0.1), new THREE.MeshStandardMaterial({ color: 0x8b5a2b }));
  boardFrame.position.set(0, 2.45, -R.d / 2 + 0.0);
  const chalkTray = new THREE.Mesh(new THREE.BoxGeometry(11, 0.1, 0.35), new THREE.MeshStandardMaterial({ color: 0x8b5a2b }));
  chalkTray.position.set(0, 0.36 + 0.1, -R.d / 2 + 0.2);
  decor.add(boardFrame, board, chalkTray);
  function setBoard({ homework = '', done = false, name = '' } = {}) {
    const c = boardCanvas, ctx = c.getContext('2d'), W = c.width, Hh = c.height;
    ctx.fillStyle = '#2f5d3a'; ctx.fillRect(0, 0, W, Hh);
    ctx.fillStyle = 'rgba(255,255,255,.05)'; for (let i = 0; i < 40; i++) ctx.fillRect(Math.random() * W, Math.random() * Hh, 60, 3); // 지운 자국
    ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff'; ctx.font = '900 64px sans-serif'; ctx.fillText('🏫 포켓몬 학교', W / 2, 62);
    ctx.font = '700 34px sans-serif'; ctx.fillStyle = '#ffe98a';
    ctx.fillText('수학 · 영어 · 국어 · 한자 · 과학', W / 2, 140);
    ctx.fillStyle = '#ffffff'; ctx.font = '800 44px sans-serif';
    ctx.fillText(homework ? `📒 오늘의 숙제: ${homework}${done ? '  ✔ 끝!' : ''}` : '📒 오늘의 숙제', W / 2, 222);
    ctx.font = '700 30px sans-serif'; ctx.fillStyle = '#bfe8c8';
    ctx.fillText(done ? `참 잘했어요, ${name}! 💮` : '내 자리(⭐)에 앉아서 공부하고, 오박사님께 숙제 검사 받기!', W / 2, 296);
    ctx.textAlign = 'right'; ctx.font = '700 26px sans-serif'; ctx.fillStyle = '#ffffff';
    ctx.fillText('당번: 인하', W - 30, Hh - 30);
    boardTex.needsUpdate = true;
  }
  setBoard();

  const woodMat = new THREE.MeshStandardMaterial({ color: 0xc9a15a }), metalMat = new THREE.MeshStandardMaterial({ color: 0x7d8594 });
  // 교탁 + 오박사님
  {
    const top = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.1, 1.2), woodMat); top.position.set(0, 0.55, -7.1); top.castShadow = true;
    const globe = new THREE.Mesh(new THREE.SphereGeometry(0.32, 16, 12), new THREE.MeshStandardMaterial({ color: 0x3fb8e8 })); globe.position.set(-1, 1.45, -7.1);
    const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.15, 0.3, 8), metalMat); stand.position.set(-1, 1.18, -7.1);
    const book = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.12, 0.5), new THREE.MeshStandardMaterial({ color: 0xe8453c })); book.position.set(0.8, 1.16, -7.1);
    const ball = new THREE.Group(); // 교탁 위 몬스터볼
    ball.add(new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xe8453c })));
    ball.add(new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xffffff })));
    ball.position.set(0.1, 1.3, -6.9);
    decor.add(top, globe, stand, book, ball);
    obstacles.push({ ax: -1.6, az: -7.1, bx: 1.6, bz: -7.1, r: 0.7 });
  }
  const prof = makeNpc({ outfit: 'professor', name: '오박사', model: '오박사.glb' });
  prof.position.set(0, 0, -8.5);
  decor.add(prof); block(0, -8.5, 0.6);

  // 학생 책상 12개 + 의자
  const deskMat = new THREE.MeshStandardMaterial({ color: 0xe8c07a }), chairMat = new THREE.MeshStandardMaterial({ color: 0x4f8fd6 });
  const seats = [];
  ROWS.forEach((z, row) => COLS.forEach((x, col) => {
    const top = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.1, 0.9), deskMat); top.position.set(x, 0.78, z); top.castShadow = true;
    decor.add(top);
    for (const lx of [-0.7, 0.7]) for (const lz of [-0.35, 0.35]) { const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.78, 0.08), metalMat); leg.position.set(x + lx, 0.39, z + lz); decor.add(leg); }
    const nb = NUMBER_COLORS[(row * 4 + col) % 10 + 1].base; // 책상 위 공책 (숫자블록 색)
    const note = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.04, 0.36), new THREE.MeshStandardMaterial({ color: nb })); note.position.set(x - 0.3, 0.85, z + 0.05); note.rotation.y = 0.2;
    decor.add(note);
    const cz = z + CHAIR;
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.08, 0.6), chairMat); seat.position.set(x, 0.48, cz);
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.6, 0.08), chairMat); back.position.set(x, 0.8, cz + 0.3);
    decor.add(seat, back);
    for (const lx of [-0.28, 0.28]) for (const lz of [-0.25, 0.25]) { const leg = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.48, 0.06), metalMat); leg.position.set(x + lx, 0.24, cz + lz); decor.add(leg); }
    obstacles.push({ ax: x - 0.8, az: z, bx: x + 0.8, bz: z, r: 0.45 }); // 책상 (의자 자리는 비워 둔다: 내 자리에 걸어 들어가 앉는다)
    seats.push({ x, z: cz, row, col, mine: row === MY_SEAT.row && col === MY_SEAT.col });
  }));
  const mySeat = seats.find((s) => s.mine);
  const star = makePillSprite('⭐ 내 자리', { bg: '#fffbe6', fg: '#20232e', border: '#ffd93d' }, 0.8);
  star.position.set(mySeat.x, 2.1, mySeat.z - CHAIR);
  decor.add(star);
  const seatGlow = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.75, 28), new THREE.MeshBasicMaterial({ color: 0xffd93d, transparent: true, opacity: 0.7, side: THREE.DoubleSide }));
  seatGlow.rotation.x = -Math.PI / 2; seatGlow.position.set(mySeat.x, 0.03, mySeat.z + 0.1); seatGlow.userData.noHide = true;
  decor.add(seatGlow);

  // 친구들: 내 자리를 뺀 11자리에 앉아 칠판을 본다 (의자에 앉은 키: 조금 내려 앉힌다)
  const npcs = [];
  const others = seats.filter((s) => !s.mine);
  CLASSMATES.forEach((f, i) => {
    const s = others[i];
    const m = makeNpc({ outfit: f.outfit, name: f.name, model: modelOf(f.name) });
    m.position.set(s.x, -0.42, s.z);
    m.rotation.y = Math.PI; // 칠판(북쪽)을 본다
    m.userData.sitY = -0.42;
    decor.add(m); block(s.x, s.z, 0.45);
    npcs.push({ x: s.x, z: s.z, mesh: m, name: f.name, seated: true, lines: f.lines });
  });
  // 당번 인하: 칠판 왼쪽에 서 있다
  const monitor = makeNpc({ outfit: MONITOR.outfit, name: MONITOR.name, model: modelOf(MONITOR.name) });
  monitor.position.set(-8.5, 0, -8.6);
  decor.add(monitor); block(-8.5, -8.6, 0.6);

  // 뒤쪽 사물함 (남쪽 벽, 문 양옆) + 책장 (서쪽 벽) + 화분 + 시계
  for (const side of [-1, 1]) {
    const lk = new THREE.Mesh(new THREE.BoxGeometry(8, 1.6, 0.7), new THREE.MeshStandardMaterial({ color: 0xf6f3ea })); lk.position.set(side * 8.5, 0.8, R.d / 2 - 0.45);
    decor.add(lk);
    for (let k = 0; k < 6; k++) { const d = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.3, 0.04), new THREE.MeshStandardMaterial({ color: NUMBER_COLORS[(k + (side > 0 ? 5 : 0)) % 10 + 1].base })); d.position.set(side * 8.5 - 3.3 + k * 1.32, 0.8, R.d / 2 - 0.82); decor.add(d); }
    obstacles.push({ ax: side * 8.5 - 4, az: R.d / 2 - 0.45, bx: side * 8.5 + 4, bz: R.d / 2 - 0.45, r: 0.6 });
  }
  for (const bz of [-5, 1]) {
    const shelf = new THREE.Mesh(new THREE.BoxGeometry(0.6, 2.6, 3.4), new THREE.MeshStandardMaterial({ color: 0x7a4d22 })); shelf.position.set(-R.w / 2 + 0.3, 1.3, bz);
    decor.add(shelf);
    for (let row = 0; row < 3; row++) for (let k = 0; k < 7; k++) {
      const bk = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.6, 0.3), new THREE.MeshStandardMaterial({ color: NUMBER_COLORS[(k + row * 3) % 10 + 1].base }));
      bk.position.set(-R.w / 2 + 0.75, 0.5 + row * 0.82, bz - 1.35 + k * 0.45); decor.add(bk);
    }
    obstacles.push({ ax: -R.w / 2 + 0.6, az: bz - 1.7, bx: -R.w / 2 + 0.6, bz: bz + 1.7, r: 0.8 });
  }
  for (const [px, pz] of [[12.8, -9.8], [-12.8, -9.8], [12.8, 7.8]]) {
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.35, 0.6, 10), new THREE.MeshStandardMaterial({ color: 0xc46b2c })); pot.position.set(px, 0.3, pz);
    const plant = new THREE.Mesh(new THREE.SphereGeometry(0.65, 10, 8), new THREE.MeshStandardMaterial({ color: 0x3f9d3a })); plant.position.set(px, 1.1, pz);
    decor.add(pot, plant); block(px, pz, 0.6);
  }
  const clock = new THREE.Group();
  clock.add(new THREE.Mesh(new THREE.CircleGeometry(0.55, 24), new THREE.MeshBasicMaterial({ color: 0xffffff })));
  const handM = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.42, 0.02), new THREE.MeshBasicMaterial({ color: 0x20232e })); handM.geometry.translate(0, 0.21, 0);
  const handH = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.28, 0.02), new THREE.MeshBasicMaterial({ color: 0xe8453c })); handH.geometry.translate(0, 0.14, 0);
  handM.position.z = handH.position.z = 0.01;
  clock.add(handM, handH);
  clock.position.set(8, 3.6, -R.d / 2 + 0.05);
  decor.add(clock);

  function animate(t) {
    prof.position.y = Math.sin(t * 2) * 0.03;
    star.position.y = 2.1 + Math.sin(t * 2.5) * 0.12;
    seatGlow.material.opacity = 0.45 + Math.sin(t * 3) * 0.25;
    npcs.forEach((n, i) => { n.mesh.position.y = n.mesh.userData.sitY + Math.max(0, Math.sin(t * 1.6 + i * 1.7)) * 0.04; }); // 자리에서 살짝살짝 들썩
    handM.rotation.z = -t * 0.5; handH.rotation.z = -t * 0.04;
  }

  return {
    sun, animate, terrain: SCHOOL_TERRAIN, decor, spawn: SCHOOL.spawn, portal: SCHOOL.door, dark: false, indoor: true,
    wildSpots: [], pickupSpots: [],
    mySeat: { x: mySeat.x, z: mySeat.z },
    setBoard,
    npcs: [{
      x: prof.position.x, z: prof.position.z, mesh: prof, name: '오박사', teacher: true, heal: true,
      lines: (c) => [
        `어서 오렴, ${c.name}! 여기는 포켓몬 학교란다. 오늘은 내가 선생님이야. 숙제는 열심히 하고 있지?`,
        '포켓몬 지식 하나! 피카츄는 볼에 있는 빨간 주머니에 전기를 모아 둔단다. 화가 나거나 신나면 찌릿찌릿 전기가 튀지.',
        '파이리 꼬리의 불꽃은 파이리의 기운을 보여 준단다. 기운이 넘치면 활활, 지치면 작아져. 그러니 늘 잘 돌봐 주렴. 그리고 숙제도 꼭 하고!',
        '꼬부기는 위험하면 등껍질 속에 쏙 숨는단다. 껍질에 홈이 있어서 물속에서 아주 빨리 헤엄칠 수 있지.',
        '이상해씨는 태어날 때부터 등에 씨앗을 지고 있어. 햇볕을 쬐면 씨앗이 자라서 이상해풀, 이상해꽃으로 진화한단다. 공부도 씨앗처럼 매일 조금씩 자라는 거야.',
        '잠만보는 하루에 음식을 400kg 이나 먹는단다! 먹고 나면 쿨쿨… 하지만 너는 숙제 먼저 하고 자렴.',
        '속성 상성을 기억하렴. 물은 불에, 불은 풀에, 풀은 물에 강해. 전기는 물에 강하지만 땅에는 하나도 안 통한단다.',
        '이브이는 진화의 가능성이 아주 많은 포켓몬이란다. 어떤 환경에서 자라느냐에 따라 모습이 달라지지. 너희도 무엇을 배우느냐에 따라 무엇이든 될 수 있어!',
        '갸라도스는 약해 보이는 잉어킹이 끝까지 포기하지 않고 진화한 모습이란다. 어려운 문제도 포기하지 말고 끝까지 풀어 보렴.',
        '고오스는 몸이 가스로 되어 있어서 벽을 스르륵 지나간단다. 하지만 숙제는 스르륵 지나가면 안 돼! 꼭 하렴.',
        '라프라스는 사람을 등에 태우고 바다를 건너는 걸 좋아하는 착한 포켓몬이란다. 친구를 돕는 마음, 그게 진짜 트레이너야.',
        '숙제는 매일 칠판에 적어 둔단다. 내 자리에 앉아 그 과목을 공부해서 세 문제 이상 맞히면 숙제 끝! 다 하면 나한테 꼭 보여 주렴.',
      ],
    }, { x: monitor.position.x, z: monitor.position.z, mesh: monitor, name: MONITOR.name, lines: MONITOR.lines }, ...npcs],
  };
}
