import * as THREE from 'three';
import { makeNpc } from './npc.js';
import { makeLabelTexture, makePillSprite, makeInstanced } from './world.js';
import { NUMBER_COLORS } from './palette.js';

// 포켓몬 학교: 푸른숲 마을 서쪽의 학교 문으로 들어오면 오는 실내 지역 (연구소처럼 몬스터·블록은 없다).
// 옥스퍼드 대학교 크라이스트처치의 그레이트 홀(호그와트 식당의 본보기)과 보들리 도서관(듀크 험프리 열람실)을 본떠 만들었다.
//  - 길쭉한 홀: 짙은 참나무 벽판, 남북으로 긴 식탁 4줄과 긴 의자, 동쪽 벽의 높은 고딕 창(따뜻한 햇살), 해머빔 나무 지붕, 벽의 초상화, 떠 있는 촛불
//  - 북쪽 끝은 한 칸 높은 단(다이스): 선생님들의 하이 테이블, 그 뒤 벽에 칠판. 오박사님(선생님)이 단 위에 계신다
//  - 서쪽은 보들리 도서관: 벽 가득 책장, 남쪽 벽을 따라 오르는 나무 계단 → 2층 회랑(발코니). 회랑 밑으로도 걸어 다닐 수 있다
// 학생 자리 12개는 긴 식탁의 긴 의자에 있다. 친구 11명이 앉아 있고, 앞쪽(단에 가까운) 빈자리 하나가 "내 자리"다.
// 내 자리에 가면 "공부하기" 버튼 → 과목을 골라 공부한다 (src/study.js). 열두 번째 친구 인하는 오늘의 당번이라 단 앞에 서 있다.

// 방: 서쪽 벽 x=-15, 동쪽 벽 x=11, 북쪽 벽 z=-21, 남쪽 벽(문) z=19. 홀 가운데는 x=0, 서쪽 4m 는 도서관 회랑
const XW = -15, XE = 11, ZN = -21, ZS = 19, WALL_H = 9, RIDGE = 13.5, CX = (XW + XE) / 2;
export const SCHOOL = { size: 70, room: { x0: XW, x1: XE, z0: ZN, z1: ZS }, spawn: { x: 0, z: 16 }, door: { x: 0, z: 18.8 } };
const DAIS = { z: -15, h: 0.45, stepZ: -14.4, stepH: 0.22 };            // 북쪽 단: z < -15 는 0.45m, 그 앞 한 칸(0.22m)
const GAL = { x1: -11.2, z0: -13, z1: 18.4, y: 3.6, under: 3.3 };      // 2층 회랑: x ∈ [서쪽 벽, -11.2], 바닥 높이 3.6m (밑면 3.3m)
const STAIR = { x0: -6.25, z0: 16.4, z1: 18.4, n: 9, rise: 0.4, run: 0.55 }; // 남쪽 벽을 따라 서쪽으로 오르는 계단 (9칸 × 0.4m)
const STAIR_TOP_X = STAIR.x0 - STAIR.n * STAIR.run;                     // = -11.2 (회랑 가장자리와 맞닿는다)
const SHELF_X = XW + 0.6;                                               // 벽 책장 앞면
const STUBS = [-9, -5, -1, 3, 7, 11, 15];                               // 벽에서 튀어나온 책장 칸막이 (보들리처럼 칸칸이 열람석)
const POSTS = [-13, -9, -5, -1, 3, 7, 11, 15, 18.4];                    // 회랑을 받치는 기둥
const TX = [-7.5, -2.5, 2.5, 7.5], TZ0 = -11, TZ1 = 8, BENCH = 1.05;   // 긴 식탁 (가운데 x), 남북 길이, 식탁 가운데 → 긴 의자

const inDoorway = (x, z) => Math.abs(x) < 1.3 && z > ZS - 0.8;
const inGallery = (x, z) => x < GAL.x1 && z > GAL.z0 && z < GAL.z1;
const stairStep = (x, z) => (z > STAIR.z0 && z < STAIR.z1 && x < STAIR.x0 && x >= STAIR_TOP_X ? Math.min(STAIR.n - 1, Math.floor((STAIR.x0 - x) / STAIR.run)) : -1);
// 높이가 정해진 장애물 (회랑 위 책상·사서, 회랑 밑 지구본): 그 층에 서 있을 때만 막는다
const LEVEL_BLOCKS = [];
const segDist = (o, x, z) => {
  if (o.ax === undefined) return Math.hypot(x - o.x, z - o.z);
  const vx = o.bx - o.ax, vz = o.bz - o.az, t = Math.max(0, Math.min(1, ((x - o.ax) * vx + (z - o.az) * vz) / (vx * vx + vz * vz)));
  return Math.hypot(x - o.ax - vx * t, z - o.az - vz * t);
};
/** 언제나 바닥이 되는 단단한 높이: 단, 계단 */
function solidH(x, z) {
  if (z < DAIS.z) return DAIS.h;
  if (z < DAIS.stepZ) return DAIS.stepH;
  const i = stairStep(x, z);
  return i >= 0 ? (i + 1) * STAIR.rise : 0;
}
export const SCHOOL_TERRAIN = {
  size: SCHOOL.size, obstacles: [], ledge: 0.9, inHole: () => false,
  // 회랑 바닥은 겹친 층: 발이 거의 그 높이에 있을 때만(계단 꼭대기에서 걸어 들어올 때) 바닥이 된다. 밑에 있으면 그냥 지나간다
  height: (x, z, refY) => {
    const s = solidH(x, z);
    if (inGallery(x, z) && GAL.y <= (refY ?? 0) + 0.7) return Math.max(s, GAL.y);
    return s;
  },
  blocked: (x, z, refY) => {
    const y = refY ?? 0;
    if (!inDoorway(x, z) && (x < SHELF_X + 0.4 || x > XE - 0.6 || z < ZN + 0.6 || z > ZS - 0.6)) return true; // 벽·벽 책장
    if (y > GAL.y - 0.6) { // 회랑 높이: 난간
      if (inGallery(x, z) || (x < GAL.x1 + 0.6 && z > GAL.z0 - 0.6)) {
        if (x > GAL.x1 - 0.4 && z < STAIR.z0) return true;  // 동쪽 난간 (계단이 붙은 남쪽 끝만 열려 있다)
        if (z < GAL.z0 + 0.4) return true;                  // 북쪽 끝 난간
      }
    }
    if (y > 0.3 && z < STAIR.z0 + 0.25 && z > STAIR.z0 - 0.8 && x < STAIR.x0 - 2 * STAIR.run && x > STAIR_TOP_X - 0.4) return true; // 계단 북쪽 난간 (아래 두 칸은 옆으로도 오른다)
    for (const o of LEVEL_BLOCKS) if (y >= o.lo && y < o.hi && segDist(o, x, z) < o.r + 0.45) return true;
    return false;
  },
  // 머리 위 구조물: 회랑 밑이면 회랑 밑면, 아니면 지붕 (카메라를 그 아래로 누른다)
  ceiling: (x, z, y) => (inGallery(x, z) && y < GAL.under - 0.3 ? GAL.under : 9.6),
};
const MY_SEAT_INDEX = 0;
// 학생 자리 12개: [식탁 번호, 쪽(-1 서쪽 의자 / +1 동쪽 의자), z]. 첫 번째가 내 자리 (단에 가장 가까운 앞자리)
const SEATS = [[2, 1, -9.6], [0, -1, -8], [0, 1, -4.6], [0, -1, -1], [1, 1, -9.6], [1, -1, -6], [1, 1, -2.2], [2, -1, -7], [2, 1, -4], [2, -1, -0.6], [3, -1, -9], [3, 1, -5.4]];
// 자리에 앉은 친구 11명 (기존 NPC 모델) — 이름, 드래프트 옷, 이야기
const CLASSMATES = [
  { name: '벅스버니', outfit: 'ranger', lines: (c) => [`어이, ${c.name}! 수업 시간엔 당근을 못 먹어서 괴롭다고.`, '난 수학이 제일 좋아. 당근이 3개씩 4줄이면 12개! 구구단은 간식 셀 때 최고야.', '쉬는 시간에 푸른숲 아레나 얘기 하자고. 이상해꽃은 불 포켓몬으로 상대하는 게 좋아!'] },
  { name: '나미', outfit: 'astronaut', lines: (c) => [`안녕, ${c.name}! 난 바다 이야기라면 자신 있어.`, '과학 시간에 고래가 물고기가 아니라는 걸 배웠어. 숨을 쉬고 젖을 먹인대!', '영어로 바다는 sea, 물은 water야. 물 포켓몬을 영어로 water Pokémon 이라고 해!'] },
  { name: '웅이', outfit: 'miner', lines: (c) => [`${c.name}, 반가워! 광부 웅이도 학교는 꼬박꼬박 와.`, '한자 山(메 산)은 봉우리 세 개 모양이래. 동굴 위에 있는 산이 딱 그 모양이야!', '지하동굴은 이제 산기슭 입구로 걸어 들어오면 돼. 놀러 와!'] },
  { name: '봄이', outfit: 'professor', lines: (c) => [`${c.name}, 숙제 했어? 난 오늘 국어 숙제를 벌써 끝냈지롱!`, '높임말 알아? 할머니께는 "밥" 대신 "진지", "자다" 대신 "주무시다"라고 해.', '포켓몬이 다치면 치료가 먼저야. 공부도 몸이 건강해야 잘 돼!'] },
  { name: '리리', outfit: 'captain', lines: (c) => [`어서 오게, ${c.name}! 기차 선장도 공부는 해야 한다네.`, '기차 시간표를 읽으려면 수학이 필요해. 3시 다음 2시간 뒤는 5시!', '영어로 기차는 train. 내 기차 이름표에도 적혀 있지!'] },
  { name: '코리', outfit: 'astronaut', lines: (c) => [`반가워, ${c.name}! 난 과학 시간을 기다렸어.`, '해는 동쪽에서 떠서 서쪽으로 져. 그래서 아침 햇살이 동쪽 창문으로 들어오는 거야!', '무지개는 빨주노초파남보 일곱 색. 꿈의우주에서도 별빛이 일곱 색으로 반짝여!'] },
  { name: '루피', outfit: 'captain', lines: (c) => [`시시싯! ${c.name}, 이 식탁 좀 봐! 여기서 밥 먹으면 고기를 산더미만큼 먹을 수 있겠다!`, '난 국어가 어려워. "어떻게"랑 "어떡해"가 헷갈려! "어떻게 할까?" "어떡해!" 이렇게 쓴대.', '그래도 친구랑 함께하면 뭐든 할 수 있어. 숙제도 같이 하자!'] },
  { name: '아이 손오공', outfit: 'ranger', lines: (c) => [`오스! ${c.name}, 공부도 수련이야!`, '한자 大(큰 대)는 사람이 팔다리를 쫙 벌린 모양이래. 에네르기파 자세 같아!', '매일 조금씩 하면 세져. 숙제도 매일 조금씩!'] },
  { name: '손오공', outfit: 'pilot', lines: (c) => [`어이, ${c.name}! 학교 끝나면 UFO 타러 갈래?`, '영어 숫자 알아? one, two, three, four, five! 행성은 태양에서 세 번째가 지구야.', '오박사님 수업은 졸리면 안 돼. 포켓몬 이야기가 엄청 재밌거든!'] },
  { name: '도토로', outfit: 'miner', lines: (c) => [`토토로~ ${c.name}, 안녕!`, '나무를 한자로 木(나무 목)이라고 해. 이 천장도 커다란 참나무로 만들었대. 나무가 서 있는 모양 같지?', '식물은 햇빛과 물을 먹고 자라. 풀 포켓몬도 햇볕을 쬐면 기운이 나!'] },
  { name: '베지터', outfit: 'pilot', lines: (c) => [`흥, ${c.name}. 내가 이 반 1등이다.`, '구구단 9단쯤은 눈 감고도 외운다. 9 × 9 = 81!', '…숙제? 당연히 했지. 넌 했냐? 오박사님께 검사 받아!'] },
];
const MONITOR = { name: '인하', outfit: 'ranger', lines: (c) => [`안녕, ${c.name}! 난 오늘 당번 인하야. 포켓몬 학교에 온 걸 환영해!`, '여기는 영국 옥스퍼드 대학교의 커다란 식당 "그레이트 홀"을 닮았어. 해리 포터에 나오는 호그와트 식당도 여기를 보고 만들었대!', '앞쪽 식탁의 ⭐ 표시가 있는 빈자리가 네 자리야. 가까이 가서 "공부하기" 버튼을 누르면 앉아서 공부할 수 있어.', '수학·영어·국어·한자·과학 중에 골라서 공부해. 다섯 문제 중에 맞힌 만큼 블록을 받아!', '칠판에 오늘의 숙제가 적혀 있어. 숙제를 끝내고 단 위의 오박사님께 말씀드리면 칭찬 블록을 주셔!', '서쪽은 도서관이야. 문 옆 나무 계단으로 2층 회랑에 올라가 봐. 사서 보들리 선생님이 계셔!', '문으로 나가면 마을이야. 또 놀러 와!'] };
const LIBRARIAN = { name: '사서 보들리', outfit: 'mom', lines: (c) => [`쉿… 어서 오렴, ${c.name}. 여기는 2층 열람실이란다. 도서관에서는 사뿐사뿐, 소곤소곤!`, '이 도서관은 옥스퍼드의 보들리 도서관을 닮았어. 400년도 더 된 아주 오래된 도서관이라 책이 1300만 권도 넘게 있단다!', '옛날에는 책이 너무 귀해서 책장에 쇠사슬로 묶어 두었대. 그래서 책을 빌려 가지 못하고 여기 앉아서 읽었지.', '책장 칸막이 사이의 작은 책상이 열람석이란다. 책을 많이 읽으면 퀴즈도 척척 맞힐 수 있어!', '난간 밖으로 몸을 내밀면 위험해. 내려갈 때는 남쪽 계단으로 천천히 내려가렴.'] };
const MODEL = { '아이 손오공': '아이손오공.glb' };
const modelOf = (name) => MODEL[name] || `${name}.glb`;

/** 캔버스에 그린 그림 텍스처 */
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
  return t;
}
/** 무늬가 tw × th m 마다 되풀이되는 평면 */
function tiledPlane(w, h, tw, th) {
  const g = new THREE.PlaneGeometry(w, h), uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w / tw, uv.getY(i) * h / th);
  return g;
}
/** 뾰족한 고딕 아치 창 모양 (가운데 아래가 원점, 폭 w, 전체 높이 h). uv 는 0~1 */
function archGeometry(w, h) {
  const s = new THREE.Shape(), r = w, spring = h - w * Math.sqrt(3) / 2;
  s.moveTo(-w / 2, 0); s.lineTo(w / 2, 0); s.lineTo(w / 2, spring);
  s.absarc(-w / 2, spring, r, 0, Math.PI / 3, false);
  s.absarc(w / 2, spring, r, Math.PI * 2 / 3, Math.PI, false);
  s.lineTo(-w / 2, 0);
  const g = new THREE.ShapeGeometry(s, 6), pos = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (pos.getX(i) + w / 2) / w, pos.getY(i) / h);
  return g;
}
// 의사 난수 (늘 같은 모양이 나오게)
let seed = 7;
const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

export function buildSchool(scene) {
  const decor = new THREE.Group();
  scene.add(decor);
  const obstacles = SCHOOL_TERRAIN.obstacles;
  obstacles.length = 0; LEVEL_BLOCKS.length = 0; seed = 7;
  const block = (x, z, r) => obstacles.push({ x, z, r });
  const add = (m, { shadow = false, recv = true, noHide = false } = {}) => { m.castShadow = shadow; m.receiveShadow = recv; if (noHide) m.userData.noHide = true; decor.add(m); return m; };
  const box = (w, h, d, mat, x, y, z, opt) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); return add(m, opt); };

  scene.background = new THREE.Color(0x2a1d14);
  scene.add(new THREE.HemisphereLight(0xfff1d6, 0x6b4a2a, 1.35));
  const sun = new THREE.DirectionalLight(0xffe2b0, 1.5); // 동쪽 고딕 창으로 비쳐 드는 햇살
  sun.position.set(CX + 16, 22, -4);
  sun.target.position.set(CX, 0, -1);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -26, right: 26, top: 26, bottom: -26, near: 1, far: 70 });
  scene.add(sun, sun.target);
  for (const [lx, ly, lz, li] of [[0, 6.5, -14, 30], [0, 6.5, -2, 30], [0, 6.5, 10, 30], [-12.8, 2.6, 2, 14]]) { const l = new THREE.PointLight(0xffc98a, li, 22); l.position.set(lx, ly, lz); scene.add(l); }

  // ---------- 재료 (캔버스 무늬) ----------
  const oakTex = canvasTex(256, 512, (g, w, h) => { // 짙은 참나무 벽판: 위아래 두 칸 + 가운데 접힌 천 무늬(리넨폴드)
    g.fillStyle = '#3d2414'; g.fillRect(0, 0, w, h);
    for (const [y0, y1] of [[24, 250], [278, 490]]) {
      g.fillStyle = '#4e2f1a'; g.fillRect(22, y0, w - 44, y1 - y0);
      g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(22, y1 - 6, w - 44, 6); g.fillRect(w - 28, y0, 6, y1 - y0);
      g.fillStyle = 'rgba(255,220,170,.12)'; g.fillRect(22, y0, w - 44, 4); g.fillRect(22, y0, 4, y1 - y0);
      for (let k = 0; k < 5; k++) { g.fillStyle = k % 2 ? 'rgba(0,0,0,.18)' : 'rgba(255,220,170,.08)'; g.fillRect(56 + k * 30, y0 + 26, 14, y1 - y0 - 52); }
    }
    g.fillStyle = '#2c180c'; g.fillRect(0, 0, w, 12); // 위 띠
  });
  const stoneTex = canvasTex(256, 128, (g, w, h) => { // 옅은 꿀빛 석회암 (옥스퍼드 돌)
    g.fillStyle = '#cdb98e'; g.fillRect(0, 0, w, h);
    for (let r = 0; r < 2; r++) for (let k = -1; k < 3; k++) { const x = k * 128 + (r % 2) * 64, y = r * 64; g.fillStyle = `rgba(${90 + rnd() * 40},${70 + rnd() * 30},40,${0.06 + rnd() * 0.08})`; g.fillRect(x + 3, y + 3, 122, 58); }
    g.fillStyle = 'rgba(80,60,30,.35)'; g.fillRect(0, 0, w, 3); g.fillRect(0, 64, w, 3);
    for (let r = 0; r < 2; r++) for (let k = 0; k < 3; k++) g.fillRect(k * 128 + (r % 2) * 64, r * 64, 3, 64);
  });
  const floorTex = canvasTex(256, 256, (g, w, h) => { // 돌 바닥 (네모 판석)
    for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) { const v = 150 + rnd() * 30; g.fillStyle = `rgb(${v + 20},${v + 6},${v - 25})`; g.fillRect(i * 128, j * 128, 128, 128); }
    g.strokeStyle = 'rgba(60,45,30,.55)'; g.lineWidth = 4; for (let k = 0; k <= 2; k++) { g.beginPath(); g.moveTo(k * 128, 0); g.lineTo(k * 128, h); g.moveTo(0, k * 128); g.lineTo(w, k * 128); g.stroke(); }
  });
  const boardsTex = canvasTex(128, 256, (g, w, h) => { // 나무 판자 (회랑 바닥·지붕 안쪽)
    for (let k = 0; k < 4; k++) { const v = 0.85 + rnd() * 0.3; g.fillStyle = `rgb(${Math.round(110 * v)},${Math.round(70 * v)},${Math.round(40 * v)})`; g.fillRect(k * 32, 0, 32, h); g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(k * 32, 0, 2, h); }
  });
  const glassTex = canvasTex(128, 256, (g, w, h) => { // 납틀 유리창: 따뜻한 햇빛 + 마름모 납선 + 가운데 창살, 위쪽에 색유리 몇 조각
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#fff6d8'); gr.addColorStop(1, '#ffc96e');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    const cols = ['#e8453c', '#3f6fd8', '#3faa4f', '#ffd93d'];
    for (let k = 0; k < 10; k++) { g.fillStyle = cols[k % 4]; g.globalAlpha = 0.55; g.fillRect(8 + rnd() * 100, 4 + rnd() * 70, 14, 14); }
    g.globalAlpha = 1; g.strokeStyle = 'rgba(70,55,35,.75)'; g.lineWidth = 2;
    for (let k = -16; k < 24; k++) { g.beginPath(); g.moveTo(k * 16, 0); g.lineTo(k * 16 + h, h); g.stroke(); g.beginPath(); g.moveTo(k * 16, 0); g.lineTo(k * 16 - h, h); g.stroke(); }
    g.fillStyle = '#5b4a35'; g.fillRect(w / 2 - 4, 0, 8, h); g.fillRect(0, h * 0.42, w, 7);
  });
  glassTex.wrapS = glassTex.wrapT = THREE.ClampToEdgeWrapping;
  const oakMat = new THREE.MeshStandardMaterial({ map: oakTex, roughness: 0.75 });
  const stoneMat = new THREE.MeshStandardMaterial({ map: stoneTex, roughness: 0.95 });
  const darkWood = new THREE.MeshStandardMaterial({ color: 0x4a2b17, roughness: 0.7 });
  const midWood = new THREE.MeshStandardMaterial({ color: 0x7a4a26, roughness: 0.65 });
  const roofWood = new THREE.MeshStandardMaterial({ color: 0x3b2414, roughness: 0.8 });
  const brass = new THREE.MeshStandardMaterial({ color: 0xc9a14a, metalness: 0.6, roughness: 0.35 });
  const glow = new THREE.MeshBasicMaterial({ color: 0xffd27a });

  // ---------- 바닥: 돌 판석 + 가운데 붉은 융단 + 문 앞 매트 ----------
  const floor = new THREE.Mesh(tiledPlane(XE - XW, ZS - ZN, 1.6, 1.6), new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.85 }));
  floor.rotation.x = -Math.PI / 2; floor.position.set(CX, 0, (ZN + ZS) / 2);
  add(floor, { noHide: true });
  const runner = new THREE.Mesh(new THREE.PlaneGeometry(1.8, ZS - 0.6 - DAIS.stepZ), new THREE.MeshStandardMaterial({ color: 0x8e1f24, roughness: 0.9 }));
  runner.rotation.x = -Math.PI / 2; runner.position.set(0, 0.015, (DAIS.stepZ + ZS - 0.6) / 2);
  add(runner, { noHide: true });
  const mat = new THREE.Mesh(new THREE.PlaneGeometry(3, 1.4), new THREE.MeshStandardMaterial({ color: 0x3fb8e8 }));
  mat.rotation.x = -Math.PI / 2; mat.position.set(0, 0.025, ZS - 1.1);
  add(mat, { noHide: true });

  // ---------- 벽: 아래 3.4m 는 참나무 벽판, 위는 돌벽. 안쪽에서만 보이는 한쪽 면이라 카메라가 벽 밖에 있어도 안이 보인다 ----------
  const PANEL_H = 3.4;
  const wallFace = (len, x, z, ry, y0 = 0, y1 = WALL_H) => {
    const st = new THREE.Mesh(tiledPlane(len, y1 - Math.max(y0, PANEL_H), 2, 1), stoneMat);
    st.position.set(x, (y1 + Math.max(y0, PANEL_H)) / 2, z); st.rotation.y = ry; add(st, { noHide: true });
    if (y0 < PANEL_H) { const p = new THREE.Mesh(tiledPlane(len, PANEL_H - y0, 1.3, PANEL_H), oakMat); p.position.set(x, (PANEL_H + y0) / 2, z); p.rotation.y = ry; p.translateZ(0.01); add(p, { noHide: true }); }
  };
  wallFace(XE - XW, CX, ZN, 0);                          // 북쪽
  wallFace(ZS - ZN, XE, (ZN + ZS) / 2, -Math.PI / 2);     // 동쪽
  wallFace(ZS - ZN, XW, (ZN + ZS) / 2, Math.PI / 2);      // 서쪽 (책장 뒤)
  wallFace(-1.5 - XW, (XW - 1.5) / 2, ZS, Math.PI);       // 남쪽: 문 서쪽
  wallFace(XE - 1.5, (XE + 1.5) / 2, ZS, Math.PI);        // 남쪽: 문 동쪽
  wallFace(3, 0, ZS, Math.PI, 3.4);                       // 남쪽: 문 위
  // 박공: 지붕 끝의 세모 돌벽 (북·남)
  for (const [z, ry] of [[ZN, 0], [ZS, Math.PI]]) {
    const s = new THREE.Shape(); s.moveTo(XW - CX, 0); s.lineTo(XE - CX, 0); s.lineTo(0, RIDGE - WALL_H); s.lineTo(XW - CX, 0);
    const m = new THREE.Mesh(new THREE.ShapeGeometry(s), stoneMat); m.position.set(CX, WALL_H, z); m.rotation.y = ry; add(m, { noHide: true });
  }
  // 카메라: 벽은 안쪽에서만 보이는 면이라 카메라가 남·동·북쪽 벽 밖에 있어도 안이 들여다보인다 (인형의 집처럼).
  // 서쪽은 책장·회랑이 가리므로 보이지 않는 "단단한 상자"로 카메라를 막는다 (resolveCamera 가 상자 앞에서 멈춘다).
  // 주인공이 홀 바닥에 있으면 상자 앞면을 회랑 가장자리까지 당겨, 카메라가 회랑 위로 넘어가 주인공을 가리지 않게 한다 (회랑 바닥 cutaway 에서 매 프레임 옮긴다)
  const westCam = new THREE.Object3D(), WCH = 8;
  westCam.userData.solid = true; westCam.userData.radius = Math.hypot(WCH, 30) + 1; westCam.userData.box = { hx: WCH, hz: 30 };
  westCam.position.set(SHELF_X + 0.2 - WCH, 0, (ZN + ZS) / 2);
  decor.add(westCam);
  // 문: 돌 아치 문틀 + 바깥 햇빛
  const doorGlow = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 3.4), new THREE.MeshBasicMaterial({ color: 0xfff2c8 }));
  doorGlow.position.set(0, 1.7, ZS + 0.3); doorGlow.rotation.y = Math.PI; add(doorGlow, { noHide: true });
  box(0.4, 3.6, 0.5, stoneMat, -1.5, 1.8, ZS - 0.05); box(0.4, 3.6, 0.5, stoneMat, 1.5, 1.8, ZS - 0.05); box(3.4, 0.4, 0.5, stoneMat, 0, 3.6, ZS - 0.05);
  const exitSign = new THREE.Sprite(new THREE.SpriteMaterial({ map: makeLabelTexture('▼ 나가기 (마을)', '#8b5a2b', '#ffffff', 48), transparent: true, depthTest: false }));
  exitSign.scale.set(3, 0.75, 1); exitSign.position.set(0, 2.6, ZS - 0.5);
  decor.add(exitSign);

  // ---------- 고딕 창 (동쪽 7개 · 서쪽 회랑 위 4개 · 북쪽 칠판 위 1개 · 남쪽 2개) ----------
  {
    const glassGeo = archGeometry(1.8, 4.6), rimGeo = archGeometry(2.2, 5.0);
    const wins = [];
    for (const z of [-12, -8, -4, 0, 4, 8, 12]) wins.push({ x: XE - 0.03, y: 4.0, z, ry: -Math.PI / 2 });
    for (const z of [-9, -3, 3, 9]) wins.push({ x: XW + 0.03, y: 6.9, z, ry: Math.PI / 2, sx: 0.8, sy: 0.41 });
    wins.push({ x: 0, y: 5.9, z: ZN + 0.03, ry: 0, sx: 1.4, sy: 0.64 });
    for (const x of [5.5, -9]) wins.push({ x, y: 4.6, z: ZS - 0.03, ry: Math.PI, sx: 0.9, sy: 0.82 });
    const glass = makeInstanced(glassGeo, new THREE.MeshBasicMaterial({ map: glassTex }), wins);
    const rims = makeInstanced(rimGeo, new THREE.MeshStandardMaterial({ color: 0xa08a62, roughness: 0.9 }), wins.map((w) => {
      const back = 0.015, nx = Math.sin(w.ry) * back, nz = Math.cos(w.ry) * back; // 유리보다 살짝 벽 쪽
      return { ...w, x: w.x - nx, y: w.y - 0.2 * (w.sy ?? 1), z: w.z - nz };
    }));
    glass.userData.noHide = rims.userData.noHide = true;
    decor.add(rims, glass);
    // 햇살 줄기: 동쪽 창에서 홀 바닥으로 비스듬히 (더하기 섞기, 반투명)
    const rayTex = canvasTex(4, 64, (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, 'rgba(255,230,170,0)'); gr.addColorStop(0.15, 'rgba(255,230,170,.9)'); gr.addColorStop(1, 'rgba(255,230,170,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
    rayTex.wrapS = rayTex.wrapT = THREE.ClampToEdgeWrapping;
    const pos = [], uv = [], idx = [];
    for (const z of [-12, -8, -4, 0, 4, 8, 12]) {
      const b = pos.length / 3, top = [XE - 0.1, 8.0], bot = [XE - 8.5, 0.05];
      pos.push(top[0], top[1], z - 0.75, top[0], top[1], z + 0.75, bot[0], bot[1], z + 1.3 - 0.5, bot[0], bot[1], z - 1.3 - 0.5);
      uv.push(0, 1, 1, 1, 1, 0, 0, 0);
      idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
    }
    const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); rg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); rg.setIndex(idx);
    const rays = new THREE.Mesh(rg, new THREE.MeshBasicMaterial({ map: rayTex, transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    rays.renderOrder = 2; add(rays, { recv: false, noHide: true });
  }

  // ---------- 해머빔 지붕: 4m 마다 참나무 트러스 (벽 기둥 → 해머빔 → 짧은 기둥 → 아치 → 서까래·대들보) ----------
  {
    const slope = Math.atan2(RIDGE - WALL_H, (XE - XW) / 2), rafterLen = Math.hypot(RIDGE - WALL_H, (XE - XW) / 2);
    const tz = []; for (let z = ZN + 2; z < ZS; z += 4) tz.push(z);
    const parts = { posts: [], hammers: [], kings: [], rafters: [], collars: [], arches: [] };
    for (const z of tz) {
      for (const side of [-1, 1]) {
        const wx = side < 0 ? XW + 0.2 : XE - 0.2, hx = side < 0 ? XW + 1.8 : XE - 1.8;
        parts.posts.push({ x: wx, y: 7.9, z });                                  // 벽에 붙은 기둥 (돌 받침 위)
        parts.hammers.push({ x: (wx + hx) / 2 - side * 0.1, y: WALL_H, z });     // 해머빔 (벽에서 홀 쪽으로 내민 들보)
        parts.kings.push({ x: hx, y: WALL_H + 0.8, z });                          // 해머 기둥
        parts.rafters.push({ x: CX + side * (XE - XW) / 4, y: (WALL_H + RIDGE) / 2 + 0.15, z, rz: -side * slope }); // 서까래
      }
      parts.collars.push({ x: CX, y: 12, z });
      parts.arches.push({ x: CX, y: WALL_H + 1.6, z });
    }
    const pm = (geo, list) => { const m = makeInstanced(geo, roofWood, list); m.userData.noHide = true; decor.add(m); };
    pm(new THREE.BoxGeometry(0.35, 2.2, 0.35), parts.posts);
    pm(new THREE.BoxGeometry(1.9, 0.35, 0.4), parts.hammers);
    pm(new THREE.BoxGeometry(0.3, 1.6, 0.3), parts.kings);
    pm(new THREE.BoxGeometry(rafterLen, 0.35, 0.35), parts.rafters);
    pm(new THREE.BoxGeometry(2 * ((XE - XW) / 2) * (RIDGE - 12) / (RIDGE - WALL_H) + 0.2, 0.3, 0.3), parts.collars);
    const archGeo = new THREE.TorusGeometry((XE - XW) / 2 - 1.8, 0.16, 4, 24, Math.PI); archGeo.scale(1, 0.18, 1);
    pm(archGeo, parts.arches);
    // 지붕 안쪽 판자 (아래를 보는 한쪽 면) + 도리 + 마룻대
    for (const side of [-1, 1]) {
      const g = tiledPlane(rafterLen, ZS - ZN, 1, 2); g.rotateX(Math.PI / 2); g.rotateZ(-side * slope);
      const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: boardsTex, roughness: 0.85 }));
      m.position.set(CX + side * (XE - XW) / 4, (WALL_H + RIDGE) / 2 + 0.35, (ZN + ZS) / 2); add(m, { noHide: true });
    }
    const purl = [];
    for (const side of [-1, 1]) for (const f of [0.3, 0.6]) purl.push({ x: CX + side * (XE - XW) / 2 * (1 - f), y: WALL_H + (RIDGE - WALL_H) * f + 0.1, z: (ZN + ZS) / 2 });
    purl.push({ x: CX, y: RIDGE - 0.05, z: (ZN + ZS) / 2 });
    pm(new THREE.BoxGeometry(0.3, 0.3, ZS - ZN), purl);
    // 돌 처마 띠 (벽 꼭대기)
    pm(new THREE.BoxGeometry(0.3, 0.3, ZS - ZN), [{ x: XW + 0.15, y: WALL_H - 0.15, z: (ZN + ZS) / 2 }, { x: XE - 0.15, y: WALL_H - 0.15, z: (ZN + ZS) / 2 }]);
  }

  // ---------- 북쪽 단 (다이스) + 하이 테이블 ----------
  box(XE - XW, DAIS.h, DAIS.z - ZN, midWood, CX, DAIS.h / 2, (ZN + DAIS.z) / 2, { noHide: true });
  box(XE - XW, DAIS.stepH, DAIS.stepZ - DAIS.z, midWood, CX, DAIS.stepH / 2, (DAIS.z + DAIS.stepZ) / 2, { noHide: true });
  box(XE - XW, 0.06, 0.08, brass, CX, DAIS.h - 0.03, DAIS.z + 0.04, { noHide: true }); // 단 끝 놋쇠 띠
  const HT_Z = -17.3, PROF = { x: 0, z: -18.4 };
  {
    const y0 = DAIS.h;
    box(10.4, 0.1, 1.2, darkWood, 0, y0 + 0.78, HT_Z, { shadow: true });
    box(10.4, 0.62, 0.06, darkWood, 0, y0 + 0.42, HT_Z + 0.55, { shadow: true }); // 앞 가림판
    const cloth = new THREE.Mesh(new THREE.BoxGeometry(10.2, 0.02, 1.0), new THREE.MeshStandardMaterial({ color: 0xf3ead8 })); cloth.position.set(0, y0 + 0.84, HT_Z); add(cloth);
    decor.add(makeInstanced(new THREE.BoxGeometry(0.12, 0.78, 0.12), darkWood, [-5, 5].flatMap((x) => [-0.5, 0.5].map((dz) => ({ x, y: y0 + 0.39, z: HT_Z + dz })))));
    // 선생님 의자들 (등받이가 높은 참나무 의자), 가운데는 더 큰 교장 의자
    const chairs = [-4, -2.2, 2.2, 4].map((x) => ({ x, y: y0 + 0.9, z: HT_Z - 1.0 }));
    decor.add(makeInstanced(new THREE.BoxGeometry(0.7, 1.8, 0.12), darkWood, chairs.map((c) => ({ ...c, z: c.z - 0.3 })), { shadow: true }));
    decor.add(makeInstanced(new THREE.BoxGeometry(0.7, 0.1, 0.6), darkWood, chairs.map((c) => ({ ...c, y: y0 + 0.48 }))));
    box(1.1, 2.6, 0.16, darkWood, 0, y0 + 1.3, PROF.z - 1.2, { shadow: true });
    box(1.2, 0.2, 0.2, brass, 0, y0 + 2.65, PROF.z - 1.2);
    // 교탁 위: 지구본, 빨간 책, 몬스터볼, 촛대 둘
    const globe = new THREE.Mesh(new THREE.SphereGeometry(0.32, 16, 12), new THREE.MeshStandardMaterial({ color: 0x3fb8e8 })); globe.position.set(-1.2, y0 + 1.48, HT_Z); add(globe, { shadow: true });
    const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.15, 0.3, 8), brass); stand.position.set(-1.2, y0 + 1.0, HT_Z); add(stand);
    const book = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.12, 0.5), new THREE.MeshStandardMaterial({ color: 0xe8453c })); book.position.set(0.8, y0 + 0.9, HT_Z); add(book);
    const ball = new THREE.Group(); // 교탁 위 몬스터볼
    ball.add(new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xe8453c })));
    ball.add(new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xffffff })));
    ball.position.set(0.1, y0 + 1.05, HT_Z + 0.2); decor.add(ball);
    obstacles.push({ ax: -5.2, az: HT_Z, bx: 5.2, bz: HT_Z, r: 0.62 });
    for (const x of [-4, -2.2, 2.2, 4]) block(x, HT_Z - 1.1, 0.4); // 의자
  }

  // ---------- 칠판 (북쪽 벽, 단 위): 오늘의 숙제는 main 이 setBoard 로 적어 준다 ----------
  const boardCanvas = document.createElement('canvas'); boardCanvas.width = 1024; boardCanvas.height = 384;
  const boardTex = new THREE.CanvasTexture(boardCanvas); boardTex.colorSpace = THREE.SRGBColorSpace;
  const board = new THREE.Mesh(new THREE.PlaneGeometry(11, 4.1), new THREE.MeshBasicMaterial({ map: boardTex }));
  board.position.set(0, 3.55, ZN + 0.06);
  const boardFrame = new THREE.Mesh(new THREE.PlaneGeometry(11.6, 4.7), new THREE.MeshStandardMaterial({ color: 0x6b3f1f }));
  boardFrame.position.set(0, 3.55, ZN + 0.04);
  add(boardFrame, { noHide: true }); add(board, { noHide: true });
  box(11, 0.08, 0.3, midWood, 0, 1.47, ZN + 0.18);
  function setBoard({ homework = '', done = false, name = '' } = {}) {
    const c = boardCanvas, ctx = c.getContext('2d'), W = c.width, Hh = c.height;
    ctx.fillStyle = '#2f5d3a'; ctx.fillRect(0, 0, W, Hh);
    ctx.fillStyle = 'rgba(255,255,255,.05)'; for (let i = 0; i < 40; i++) ctx.fillRect(Math.random() * W, Math.random() * Hh, 60, 3); // 지운 자국
    ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff'; ctx.font = '900 64px sans-serif'; ctx.fillText('🏰 포켓몬 학교', W / 2, 62);
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
  const prof = makeNpc({ outfit: 'professor', name: '오박사', model: '오박사.glb' });
  prof.position.set(PROF.x, DAIS.h, PROF.z);
  decor.add(prof); block(PROF.x, PROF.z, 0.6);

  // ---------- 초상화 (동쪽 벽 창 아래 7개 + 칠판 양옆 2개): 그림 한 장(아틀라스)을 나눠 붙여 한 번에 그린다 ----------
  {
    const P = [['🦉', '부엉 교장'], ['⚡', '피카 박사'], ['🔥', '파이리 경'], ['💧', '꼬부기 여사'], ['🌿', '이상해 교수'], ['🐉', '망나뇽 학장'], ['🌙', '팬텀 경'], ['⭐', '뮤 선생']];
    const tex = canvasTex(1024, 640, (g) => {
      P.forEach(([emo, nm], i) => {
        const x = (i % 4) * 256, y = Math.floor(i / 4) * 320;
        g.fillStyle = '#b8892e'; g.fillRect(x, y, 256, 320); g.fillStyle = '#e2bf5c'; g.fillRect(x + 8, y + 8, 240, 304); g.fillStyle = '#8a6420'; g.fillRect(x + 18, y + 18, 220, 284);
        const bg = g.createRadialGradient(x + 128, y + 130, 20, x + 128, y + 150, 150); bg.addColorStop(0, ['#5d3b6e', '#2e4a6b', '#6b2e2e', '#2e5a5a'][i % 4]); bg.addColorStop(1, '#1a120c');
        g.fillStyle = bg; g.fillRect(x + 24, y + 24, 208, 272);
        g.fillStyle = '#3a2a5a'; g.beginPath(); g.ellipse(x + 128, y + 250, 78, 50, 0, Math.PI, 0); g.fill(); // 망토 어깨
        g.font = '110px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(emo, x + 128, y + 140);
        g.fillStyle = '#e2bf5c'; g.fillRect(x + 48, y + 262, 160, 30); g.fillStyle = '#2a1a0a'; g.font = '700 22px sans-serif'; g.fillText(nm, x + 128, y + 278);
      });
    });
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    const pos = [], uv = [], idx = [];
    const quad = (cx, cy, cz, rx, rz, w, h, k) => { // (rx, rz): 오른쪽 방향
      const b = pos.length / 3, u0 = (k % 4) / 4, v1 = 1 - Math.floor(k / 4) / 2, u1 = u0 + 0.25, v0 = v1 - 0.5;
      for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) pos.push(cx + rx * sx * w / 2, cy + sy * h / 2, cz + rz * sx * w / 2);
      uv.push(u0, v0, u1, v0, u1, v1, u0, v1); idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
    };
    [-12, -8, -4, 0, 4, 8, 12].forEach((z, i) => quad(XE - 0.04, 2.2, z, 0, 1, 1.3, 1.62, i));  // 동쪽 벽 (서쪽을 본다)
    quad(-7.8, 3.3, ZN + 0.04, 1, 0, 1.4, 1.75, 7); quad(7.8, 3.3, ZN + 0.04, 1, 0, 1.4, 1.75, 0); // 북쪽 벽 (남쪽을 본다)
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
    add(new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 })), { noHide: true });
  }
  // 시계 (북쪽 벽, 오른쪽 초상화 위)
  const clock = new THREE.Group();
  clock.add(new THREE.Mesh(new THREE.CircleGeometry(0.55, 24), new THREE.MeshBasicMaterial({ color: 0xfff6e0 })));
  const handM = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.42, 0.02), new THREE.MeshBasicMaterial({ color: 0x20232e })); handM.geometry.translate(0, 0.21, 0);
  const handH = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.28, 0.02), new THREE.MeshBasicMaterial({ color: 0xe8453c })); handH.geometry.translate(0, 0.14, 0);
  handM.position.z = handH.position.z = 0.01;
  clock.add(handM, handH);
  clock.position.set(7.8, 5.2, ZN + 0.06); clock.userData.noHide = true;
  decor.add(clock);

  // ---------- 긴 식탁 4줄 + 긴 의자 (식탁마다 놋쇠 등, 접시) ----------
  const seats = SEATS.map(([t, side, z], i) => ({ x: TX[t] + side * BENCH, z, t, side, mine: i === MY_SEAT_INDEX }));
  const mySeat = seats[MY_SEAT_INDEX];
  {
    const L = TZ1 - TZ0, zc = (TZ0 + TZ1) / 2;
    decor.add(makeInstanced(new THREE.BoxGeometry(1.0, 0.1, L), darkWood, TX.map((x) => ({ x, y: 0.78, z: zc })), { shadow: true }));
    decor.add(makeInstanced(new THREE.BoxGeometry(0.42, 0.08, L), midWood, TX.flatMap((x) => [-1, 1].map((s) => ({ x: x + s * BENCH, y: 0.46, z: zc }))), { shadow: true }));
    const legs = [], bl = [];
    for (const x of TX) for (let z = TZ0 + 0.5; z <= TZ1 - 0.4; z += (L - 1) / 4) { for (const dx of [-0.38, 0.38]) legs.push({ x: x + dx, y: 0.37, z }); for (const s of [-1, 1]) bl.push({ x: x + s * BENCH, y: 0.21, z }); }
    decor.add(makeInstanced(new THREE.BoxGeometry(0.1, 0.74, 0.1), darkWood, legs));
    decor.add(makeInstanced(new THREE.BoxGeometry(0.34, 0.42, 0.08), darkWood, bl));
    const lamps = [], shades = [], plates = [];
    for (const x of TX) {
      for (let z = TZ0 + 1.4; z < TZ1; z += 3.2) { lamps.push({ x, y: 1.0, z }); shades.push({ x, y: 1.24, z }); }
      for (let z = TZ0 + 0.8; z < TZ1 - 0.4; z += 1.4) for (const s of [-1, 1]) plates.push({ x: x + s * 0.3, y: 0.84, z });
    }
    decor.add(makeInstanced(new THREE.CylinderGeometry(0.03, 0.07, 0.34, 6), brass, lamps));
    decor.add(makeInstanced(new THREE.ConeGeometry(0.16, 0.2, 8, 1, true), new THREE.MeshBasicMaterial({ color: 0xffc46a, side: THREE.DoubleSide }), shades));
    decor.add(makeInstanced(new THREE.CylinderGeometry(0.16, 0.13, 0.03, 7), new THREE.MeshStandardMaterial({ color: 0xf4efe4, roughness: 0.4 }), plates));
    // 자리마다 공책 (숫자블록 색)
    decor.add(makeInstanced(new THREE.BoxGeometry(0.36, 0.04, 0.5), new THREE.MeshStandardMaterial({ color: 0xffffff }), seats.map((s, i) => ({ x: TX[s.t] + s.side * 0.3, y: 0.87, z: s.z, ry: 0.2 * s.side, color: NUMBER_COLORS[i % 10 + 1].base }))));
    // 부딪힘: 식탁 가운데 선, 긴 의자 (내 자리만 비워 둔다: 걸어 들어가 앉는다)
    for (const x of TX) obstacles.push({ ax: x, az: TZ0, bx: x, bz: TZ1, r: 0.5 });
    for (const x of TX) for (const s of [-1, 1]) {
      const bx = x + s * BENCH;
      if (Math.abs(bx - mySeat.x) < 0.01) { obstacles.push({ ax: bx, az: TZ0, bx, bz: mySeat.z - 0.75, r: 0.22 }, { ax: bx, az: mySeat.z + 0.75, bx, bz: TZ1, r: 0.22 }); }
      else obstacles.push({ ax: bx, az: TZ0, bx, bz: TZ1, r: 0.22 });
    }
  }
  const star = makePillSprite('⭐ 내 자리', { bg: '#fffbe6', fg: '#20232e', border: '#ffd93d' }, 0.8);
  star.position.set(mySeat.x - 0.4, 2.1, mySeat.z);
  decor.add(star);
  const seatGlow = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.75, 28), new THREE.MeshBasicMaterial({ color: 0xffd93d, transparent: true, opacity: 0.7, side: THREE.DoubleSide }));
  seatGlow.rotation.x = -Math.PI / 2; seatGlow.position.set(mySeat.x + 0.15, 0.03, mySeat.z); seatGlow.userData.noHide = true;
  decor.add(seatGlow);

  // 친구들: 내 자리를 뺀 11자리에 앉아 식탁 건너편 친구를 본다 (긴 의자에 앉은 키: 조금 내려 앉힌다)
  const npcs = [];
  const others = seats.filter((s) => !s.mine);
  CLASSMATES.forEach((f, i) => {
    const s = others[i];
    const m = makeNpc({ outfit: f.outfit, name: f.name, model: modelOf(f.name) });
    m.position.set(s.x, -0.42, s.z);
    m.rotation.y = -s.side * Math.PI / 2; // 식탁 쪽을 본다
    m.userData.sitY = -0.42;
    decor.add(m); block(s.x, s.z, 0.45);
    npcs.push({ x: s.x, z: s.z, mesh: m, name: f.name, seated: true, lines: f.lines });
  });
  // 당번 인하: 단 앞 왼쪽에 서 있다
  const monitor = makeNpc({ outfit: MONITOR.outfit, name: MONITOR.name, model: modelOf(MONITOR.name) });
  monitor.position.set(-6.2, 0, -13.2);
  decor.add(monitor); block(-6.2, -13.2, 0.6);

  // ---------- 떠 있는 촛불 (식탁 위 · 단 위): 다 같이 천천히 오르내린다. 카메라(지붕 밑 8.9m 까지)보다 높이 띄워 화면을 가리지 않게 ----------
  const candles = new THREE.Group();
  {
    const list = [];
    for (const x of TX) for (let z = TZ0 + 0.6; z < TZ1; z += 2.4) list.push({ x: x + (rnd() - 0.5) * 0.8, y: 9.4 + rnd() * 1.2, z: z + (rnd() - 0.5) * 0.8 });
    for (let x = -5; x <= 5; x += 1.6) list.push({ x, y: 9.3 + rnd() * 0.8, z: -17.5 + (rnd() - 0.5) });
    candles.add(makeInstanced(new THREE.CylinderGeometry(0.07, 0.07, 0.5, 6), new THREE.MeshStandardMaterial({ color: 0xfff3d6, emissive: 0x7a5a30, emissiveIntensity: 0.5 }), list));
    candles.add(makeInstanced(new THREE.SphereGeometry(0.06, 6, 4), glow, list.map((c) => ({ ...c, y: c.y + 0.33, s: 1.4, sy: 2.2 }))));
    candles.userData.noHide = true;
    decor.add(candles);
  }

  // ---------- 보들리 도서관: 벽 책장 (1층·2층), 칸막이 책장, 2층 회랑, 계단 ----------
  {
    const galLen = GAL.z1 - GAL.z0, galZ = (GAL.z0 + GAL.z1) / 2, galW = GAL.x1 - XW;
    // 벽 책장 몸체 (1층은 단 앞부터 문 쪽 벽까지, 2층은 회랑 길이만큼)
    const shelfZ0 = DAIS.stepZ;
    box(0.6, GAL.under, ZS - shelfZ0, darkWood, XW + 0.3, GAL.under / 2, (shelfZ0 + ZS) / 2, { noHide: true });
    box(0.6, 3.0, galLen, darkWood, XW + 0.3, GAL.y + 1.5, galZ, { noHide: true });
    // 칸막이 책장 (1층만: 듀크 험프리 열람실처럼 칸칸이 열람석. 2층은 벽 책장만 있어 회랑을 따라 시야가 트인다)
    const stubs = [];
    for (const z of STUBS) { stubs.push({ x: XW + 0.6, y: GAL.under / 2, z }); LEVEL_BLOCKS.push({ ax: XW, az: z, bx: XW + 1.2, bz: z, r: 0.25, lo: -1, hi: GAL.y - 0.6 }); }
    decor.add(makeInstanced(new THREE.BoxGeometry(1.2, GAL.under, 0.3), darkWood, stubs, { shadow: true }));
    // 선반 판 + 책 (책 한 권 = 상자 하나, 모두 한 번에 그린다)
    const boards = [], books = [];
    const leather = [0x7a1f1f, 0x2f4f2f, 0x3b2a1a, 0x1f3050, 0x6b4a1a, 0x5a1a3a, 0x8a6a2a, 0x2a2a2a];
    const kid = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => NUMBER_COLORS[n].base);
    const fillRow = (alongZ, fixed, a0, a1, y, hMax, depthAt, fixed0 = 0) => { // 한 줄의 책: a0→a1 을 따라 꽂는다
      let a = a0 + 0.04;
      while (a < a1 - 0.1) {
        const w = 0.1 + rnd() * 0.12, h = hMax * (0.65 + rnd() * 0.33);
        if (rnd() < 0.05) { a += w * 1.5; continue; } // 빈틈
        const color = rnd() < 0.18 ? kid[Math.floor(rnd() * 10)] : leather[Math.floor(rnd() * leather.length)];
        const tilt = rnd() < 0.04 ? 0.25 : 0;
        if (alongZ) books.push({ x: depthAt, y: y + h / 2, z: a + w / 2, sx: 0.24, sy: h, sz: w, rx: tilt, color });
        else books.push({ x: a + w / 2, y: y + h / 2, z: depthAt, sx: 0.24, sy: h, sz: w, ry: depthAt > fixed0 ? -Math.PI / 2 : Math.PI / 2, color }); // 칸막이 책: 등이 칸 쪽(±z)을 보게 돌린다
        a += w + 0.005;
      }
      if (alongZ) boards.push({ x: fixed, y: y - 0.02, z: (a0 + a1) / 2, sx: 0.62, sz: a1 - a0 });
      else boards.push({ x: (a0 + a1) / 2, y: y - 0.02, z: fixed, sx: a1 - a0, sz: 0.62 });
    };
    const rows1 = [0.12, 0.92, 1.72, 2.5], rows2 = [GAL.y + 0.1, GAL.y + 0.85, GAL.y + 1.6, GAL.y + 2.3];
    // 벽 책장: 칸막이 사이마다 끊어서
    const cuts = (z0, z1) => { const pts = [z0, ...STUBS.filter((z) => z > z0 && z < z1), z1]; return pts.slice(1).map((z, i) => [pts[i] + 0.15, z - 0.15]); };
    for (const [a0, a1] of cuts(shelfZ0, ZS - 0.3)) for (const y of rows1) fillRow(true, XW + 0.3, a0, a1, y, 0.68, XW + 0.5);
    for (const [a0, a1] of cuts(GAL.z0, GAL.z1)) for (const y of rows2) fillRow(true, XW + 0.3, a0, a1, y, 0.64, XW + 0.5);
    for (const z of STUBS) for (const s of [-1, 1]) {
      for (const y of rows1) fillRow(false, z + s * 0.27, XW + 0.62, XW + 1.18, y, 0.68, z + s * 0.27, z);
    }
    decor.add(makeInstanced(new THREE.BoxGeometry(1, 0.04, 1), midWood, boards));
    const bookGeo = new THREE.BoxGeometry(1, 1, 1); // 책 상자에서 안 보이는 뒷면(-x)·밑면(-y)은 뺀다 (삼각형 12 → 8)
    { const ix = bookGeo.index.array; bookGeo.setIndex([...ix.slice(0, 6), ...ix.slice(12, 18), ...ix.slice(24, 36)]); bookGeo.clearGroups(); }
    const bookMesh = makeInstanced(bookGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 }), books);
    decor.add(bookMesh);
    // 2층 벽 책장 앞 열람석 (기울어진 작은 책상) — 벽 쪽이라 지나가는 길은 막지 않는다
    const desks = [];
    for (let i = 0; i < STUBS.length - 1; i++) { const z = (STUBS[i] + STUBS[i + 1]) / 2; if (z > GAL.z0 + 1 && z < STAIR.z0) desks.push({ x: XW + 0.85, y: GAL.y + 0.8, z, rz: 0.2 }); }
    decor.add(makeInstanced(new THREE.BoxGeometry(0.5, 0.06, 1.6), midWood, desks));

    // 2층 회랑 바닥: 밑에 서 있으면 숨긴다 (cutaway) — 위에서 내려다보는 카메라가 회랑 밑의 주인공을 볼 수 있게
    const slab = new THREE.Mesh(new THREE.BoxGeometry(galW, GAL.y - GAL.under, galLen), new THREE.MeshStandardMaterial({ map: boardsTex, roughness: 0.8 }));
    { const uv = slab.geometry.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 4, uv.getY(i) * 10); }
    slab.position.set((XW + GAL.x1) / 2, (GAL.y + GAL.under) / 2, galZ);
    slab.castShadow = true; slab.receiveShadow = true;
    slab.userData.cutaway = (head) => {
      const inHall = head.y < GAL.y + 0.5 && head.x > GAL.x1; // 홀 바닥·계단 아래쪽 (머리 높이가 회랑 바닥 + 0.5 보다 낮다)
      westCam.position.x = (inHall ? GAL.x1 + 0.3 : SHELF_X + 0.2) - WCH;
      return head.y < GAL.under && head.x < GAL.x1 + 0.6 && head.z > GAL.z0 - 0.6 && head.z < GAL.z1 + 0.6; // 회랑 밑에 있으면 바닥판을 숨긴다
    };
    decor.add(slab);
    const fascia = box(0.14, 0.42, galLen, darkWood, GAL.x1 - 0.02, GAL.under + 0.12, galZ);
    fascia.userData.noHide = true;
    // 기둥 (바닥부터 난간 위까지 한 줄기)
    decor.add(makeInstanced(new THREE.BoxGeometry(0.3, GAL.y + 1.15, 0.3), darkWood, POSTS.map((z) => ({ x: GAL.x1, y: (GAL.y + 1.15) / 2, z })), { shadow: true }));
    for (const z of POSTS) if (z < GAL.z1) block(GAL.x1, z, 0.22);
    // 난간: 회랑 동쪽·북쪽 + 계단 옆 (손잡이 + 동살)
    const rails = [], bal = [];
    const railY = GAL.y + 0.95;
    rails.push({ x: GAL.x1, y: railY, z: (GAL.z0 + STAIR.z0) / 2, sx: 0.12, sy: 0.1, sz: STAIR.z0 - GAL.z0 });
    rails.push({ x: (XW + GAL.x1) / 2, y: railY, z: GAL.z0, sx: galW, sy: 0.1, sz: 0.12 });
    for (let z = GAL.z0 + 0.3; z < STAIR.z0; z += 0.4) bal.push({ x: GAL.x1, y: GAL.y + 0.47, z });
    for (let x = XW + 0.8; x < GAL.x1; x += 0.4) bal.push({ x, y: GAL.y + 0.47, z: GAL.z0 });
    { // 계단 손잡이: 셋째 칸 동살 위 → 맨 위 칸 동살 위
      const ax = STAIR.x0 - 2.5 * STAIR.run, ay = 3 * STAIR.rise + 0.95, bx = STAIR.x0 - (STAIR.n - 0.5) * STAIR.run, by = STAIR.n * STAIR.rise + 0.95;
      rails.push({ x: (ax + bx) / 2, y: (ay + by) / 2, z: STAIR.z0 + 0.06, sx: Math.hypot(ax - bx, by - ay) + 0.2, sy: 0.1, sz: 0.12, rz: -Math.atan2(by - ay, ax - bx) });
    }
    for (let i = 2; i < STAIR.n; i++) bal.push({ x: STAIR.x0 - (i + 0.5) * STAIR.run, y: (i + 1) * STAIR.rise + 0.47, z: STAIR.z0 + 0.06 });
    decor.add(makeInstanced(new THREE.BoxGeometry(1, 1, 1), midWood, rails));
    decor.add(makeInstanced(new THREE.CylinderGeometry(0.035, 0.045, 0.94, 6), midWood, bal));
    // 계단: 칸마다 바닥까지 꽉 찬 나무 상자 + 칸 끝 놋쇠 띠
    const steps = [], nos = [];
    for (let i = 0; i < STAIR.n; i++) {
      const top = (i + 1) * STAIR.rise, x = STAIR.x0 - (i + 0.5) * STAIR.run;
      steps.push({ x, y: top / 2, z: (STAIR.z0 + ZS) / 2, sx: STAIR.run, sy: top, sz: ZS - STAIR.z0 });
      nos.push({ x: STAIR.x0 - i * STAIR.run - 0.03, y: top - 0.02, z: (STAIR.z0 + ZS) / 2, sx: 0.06, sy: 0.04, sz: ZS - STAIR.z0 });
    }
    const stepMesh = makeInstanced(new THREE.BoxGeometry(1, 1, 1), midWood, steps, { shadow: true }); stepMesh.receiveShadow = true; decor.add(stepMesh);
    decor.add(makeInstanced(new THREE.BoxGeometry(1, 1, 1), brass, nos));
    // 회랑 밑 등불 (밑면에 매달린 작은 초롱) + 깔개 + 지구본
    const lan = []; for (let z = GAL.z0 + 2; z < GAL.z1 - 1; z += 4) lan.push({ x: (XW + GAL.x1) / 2 + 0.6, y: GAL.under - 0.35, z });
    decor.add(makeInstanced(new THREE.BoxGeometry(0.22, 0.3, 0.22), glow, lan));
    const rug = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 14), new THREE.MeshStandardMaterial({ color: 0x2f4a6b, roughness: 0.95 }));
    rug.rotation.x = -Math.PI / 2; rug.position.set(-12.7, 0.012, 1); add(rug, { noHide: true });
    const g2 = new THREE.Mesh(new THREE.SphereGeometry(0.4, 16, 12), new THREE.MeshStandardMaterial({ color: 0x6aa0c8, roughness: 0.5 })); g2.position.set(-13.5, 1.15, 5); add(g2, { shadow: true });
    const g2s = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.25, 0.75, 8), brass); g2s.position.set(-13.5, 0.38, 5); add(g2s);
    LEVEL_BLOCKS.push({ x: -13.5, z: 5, r: 0.35, lo: -1, hi: 2 });
    // 2층 북쪽 끝: 큰 열람 책상 (초록 등, 펼친 책, 쇠사슬 묶인 책)
    const DESK = { x: -12.9, z: -11.4 };
    box(1.6, 0.08, 1.0, darkWood, DESK.x, GAL.y + 0.78, DESK.z, { shadow: true });
    decor.add(makeInstanced(new THREE.BoxGeometry(0.08, 0.76, 0.08), darkWood, [-0.7, 0.7].flatMap((dx) => [-0.4, 0.4].map((dz) => ({ x: DESK.x + dx, y: GAL.y + 0.38, z: DESK.z + dz })))));
    const lampShade = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.18, 0.14, 10, 1, true), new THREE.MeshBasicMaterial({ color: 0x3fbf6a, side: THREE.DoubleSide })); lampShade.position.set(DESK.x - 0.5, GAL.y + 1.15, DESK.z - 0.2); add(lampShade);
    const lampStem = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.06, 0.34, 6), brass); lampStem.position.set(DESK.x - 0.5, GAL.y + 0.98, DESK.z - 0.2); add(lampStem);
    const open = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.04, 0.42), new THREE.MeshStandardMaterial({ color: 0xf6ecd0 })); open.position.set(DESK.x + 0.2, GAL.y + 0.84, DESK.z); open.rotation.y = 0.15; add(open);
    const chain = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.015, 4, 16, Math.PI), brass); chain.position.set(DESK.x + 0.2, GAL.y + 0.84, DESK.z - 0.3); chain.rotation.x = Math.PI / 2; add(chain);
    LEVEL_BLOCKS.push({ ax: DESK.x - 0.7, az: DESK.z, bx: DESK.x + 0.7, bz: DESK.z, r: 0.5, lo: GAL.y - 0.6, hi: GAL.y + 2 });
    // 안내 이름표
    const up = makePillSprite('⬆ 2층 도서관', { bg: '#fff6e0', fg: '#3b2414', border: '#c9a14a' }, 0.75); up.position.set(STAIR.x0 + 0.4, 2.0, STAIR.z0 + 1); decor.add(up);
    const libSign = makePillSprite('📚 보들리 도서관', { bg: '#fff6e0', fg: '#3b2414', border: '#c9a14a' }, 0.65); libSign.position.set(GAL.x1 + 0.1, GAL.y + 1.7, 0); decor.add(libSign);
  }
  // 사서 보들리 (2층 회랑, 칸막이 사이)
  const LIB = { x: -13.5, z: -7.0 };
  const librarian = makeNpc({ outfit: LIBRARIAN.outfit, name: LIBRARIAN.name });
  librarian.position.set(LIB.x, GAL.y, LIB.z); librarian.rotation.y = Math.PI / 2;
  decor.add(librarian);
  LEVEL_BLOCKS.push({ x: LIB.x, z: LIB.z, r: 0.4, lo: GAL.y - 0.6, hi: GAL.y + 2 });

  // ---------- 남쪽: 사물함 (문 동쪽) + 화분 ----------
  {
    const LX = 6, LZ = ZS - 0.4;
    box(6, 1.6, 0.6, darkWood, LX, 0.8, LZ, { shadow: true });
    decor.add(makeInstanced(new THREE.BoxGeometry(0.85, 1.3, 0.04), new THREE.MeshStandardMaterial({ color: 0xffffff }), [0, 1, 2, 3, 4, 5].map((k) => ({ x: LX - 2.5 + k, y: 0.8, z: LZ - 0.32, color: NUMBER_COLORS[k + 1].base }))));
    obstacles.push({ ax: LX - 3, az: LZ, bx: LX + 3, bz: LZ, r: 0.5 });
  }
  for (const [px, pz] of [[XE - 1, -13], [XE - 1, 15]]) {
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.35, 0.6, 10), new THREE.MeshStandardMaterial({ color: 0xc46b2c })); pot.position.set(px, 0.3, pz);
    const plant = new THREE.Mesh(new THREE.SphereGeometry(0.65, 10, 8), new THREE.MeshStandardMaterial({ color: 0x3f9d3a })); plant.position.set(px, 1.1, pz);
    add(pot); add(plant, { shadow: true }); block(px, pz, 0.6);
  }

  function animate(t) {
    prof.position.y = DAIS.h + Math.sin(t * 2) * 0.03;
    star.position.y = 2.1 + Math.sin(t * 2.5) * 0.12;
    seatGlow.material.opacity = 0.45 + Math.sin(t * 3) * 0.25;
    candles.position.y = Math.sin(t * 0.8) * 0.15;
    npcs.forEach((n, i) => { n.mesh.position.y = n.mesh.userData.sitY + Math.max(0, Math.sin(t * 1.6 + i * 1.7)) * 0.04; }); // 자리에서 살짝살짝 들썩
    handM.rotation.z = -t * 0.5; handH.rotation.z = -t * 0.04;
  }

  return {
    portalTo: 'town', sun, animate, terrain: SCHOOL_TERRAIN, decor, spawn: SCHOOL.spawn, portal: SCHOOL.door, dark: false, indoor: true,
    wildSpots: [], pickupSpots: [],
    mySeat: { x: mySeat.x, z: mySeat.z },
    setBoard,
    // 시험용 (디버그 검사 스크립트가 읽는다): 계단 길, 확인할 자리, 사진 찍을 자리
    test: {
      stairPath: [...Array(24)].map((_, i) => ({ x: STAIR.x0 + 1.5 - i * 0.35, z: 17.6 })).concat([{ x: -12.4, z: 17.4 }, { x: -12.6, z: 15.5 }, { x: -12.6, z: 10 }, { x: -12.6, z: 0 }, { x: -12.4, z: -9.9 }]),
      checks: [
        { name: 'gallery top (on)', x: -12.6, z: 0, y: GAL.y, expect: 'h 3.6' },
        { name: 'under gallery (ground)', x: -12.6, z: 0, y: 0, expect: 'h 0, not blocked, ceil 3.3' },
        { name: 'rail east (on gallery)', x: -11.0, z: 0, y: GAL.y, expect: 'blocked' },
        { name: 'rail north (on gallery)', x: -12.6, z: -12.8, y: GAL.y, expect: 'blocked' },
        { name: 'hall next to gallery (ground)', x: -10.5, z: 0, y: 0, expect: 'h 0 free' },
        { name: 'stair side rail (on stair)', x: -9.5, z: 16.3, y: 2.0, expect: 'blocked' },
        { name: 'stair side (ground)', x: -9.5, z: 16.0, y: 0, expect: 'free h 0' },
        { name: 'stair step3 from ground', x: -8.2, z: 17.4, y: 0, expect: 'h 1.6 (too high)' },
        { name: 'dais front step', x: 3, z: -14.7, y: 0, expect: 'h 0.22' },
        { name: 'dais top', x: 3, z: -16, y: 0.22, expect: 'h 0.45' },
        { name: 'in front of prof', x: 0, z: -16.1, y: 0.45, expect: 'free (2.3m from prof)' },
        { name: 'librarian spot (gallery)', x: -12.8, z: -7.0, y: GAL.y, expect: 'blocked' },
        { name: 'under librarian (ground)', x: -12.6, z: -7.0, y: 0, expect: 'free' },
        { name: 'reading desk (gallery)', x: -12.9, z: -11.4, y: GAL.y, expect: 'blocked' },
        { name: 'under desk (ground)', x: -12.6, z: -11.4, y: 0, expect: 'free' },
        { name: 'aisle', x: 5, z: -2, y: 0, expect: 'free' },
      ],
      shots: [
        { name: 'entry', x: 0, z: 15.5, yaw: 0, pitch: 0 },
        { name: 'hall-from-dais', x: 0, z: -16.2, y: DAIS.h, yaw: Math.PI, pitch: 0 },
        { name: 'seat', x: mySeat.x + 0.8, z: mySeat.z + 2, yaw: 0, pitch: 0 },
        { name: 'stair', x: -4, z: 13.5, yaw: -0.9, pitch: 0 },
        { name: 'gallery', x: -12.6, z: 6, y: GAL.y, yaw: -Math.PI / 2 - 0.5, pitch: 0 },
        { name: 'gallery-north', x: -12.4, z: -6, y: GAL.y, yaw: 0.5, pitch: 0 },
        { name: 'gallery-along', x: -12.4, z: 8, y: GAL.y, yaw: -0.25, pitch: -0.2 },
        { name: 'under-gallery', x: -12.6, z: 4, yaw: Math.PI / 2 - 0.4, pitch: 0 },
        { name: 'under-gallery2', x: -12.4, z: -3, yaw: Math.PI / 2 + 0.6, pitch: 0.2 },
        { name: 'east-windows', x: -2, z: 2, yaw: -Math.PI / 2, pitch: -0.3 },
        { name: 'stair-top', x: -10.4, z: 17.4, y: 3.6, yaw: 0.9, pitch: 0 },
      ],
    },
    npcs: [{
      x: prof.position.x, z: prof.position.z, mesh: prof, name: '오박사', teacher: true, heal: true,
      lines: (c) => [
        `어서 오렴, ${c.name}! 여기는 포켓몬 학교란다. 오늘은 내가 선생님이야. 숙제는 열심히 하고 있지?`,
        '이 강당은 영국 옥스퍼드의 크라이스트처치 대식당을 본떠 지었단다. 500년 가까이 학생들이 여기서 밥을 먹고 공부했지. 내가 선 이 단은 선생님들이 앉는 "하이 테이블"이야.',
        '포켓몬 지식 하나! 피카츄는 볼에 있는 빨간 주머니에 전기를 모아 둔단다. 화가 나거나 신나면 찌릿찌릿 전기가 튀지.',
        '파이리 꼬리의 불꽃은 파이리의 기운을 보여 준단다. 기운이 넘치면 활활, 지치면 작아져. 그러니 늘 잘 돌봐 주렴. 그리고 숙제도 꼭 하고!',
        '꼬부기는 위험하면 등껍질 속에 쏙 숨는단다. 껍질에 홈이 있어서 물속에서 아주 빨리 헤엄칠 수 있지.',
        '이상해씨는 태어날 때부터 등에 씨앗을 지고 있어. 햇볕을 쬐면 씨앗이 자라서 이상해풀, 이상해꽃으로 진화한단다. 공부도 씨앗처럼 매일 조금씩 자라는 거야.',
        '잠만보는 하루에 음식을 400kg 이나 먹는단다! 먹고 나면 쿨쿨… 하지만 너는 숙제 먼저 하고 자렴.',
        '속성 상성을 기억하렴. 물은 불에, 불은 풀에, 풀은 물에 강해. 전기는 물에 강하지만 땅에는 하나도 안 통한단다. 📘 상성 수업 버튼을 누르면 자세히 가르쳐 주고, 퀴즈를 맞히면 상도 준단다!',
        '이브이는 진화의 가능성이 아주 많은 포켓몬이란다. 어디서 진화시키느냐에 따라 모습이 달라지지 — 불의산에서는 부스터, 물의길에서는 샤미드, 번개동굴에서는 쥬피썬더, 꿈의우주에서는 블래키! 너희도 무엇을 배우느냐에 따라 무엇이든 될 수 있어!',
        '갸라도스는 약해 보이는 잉어킹이 끝까지 포기하지 않고 진화한 모습이란다. 어려운 문제도 포기하지 말고 끝까지 풀어 보렴.',
        '고오스는 몸이 가스로 되어 있어서 벽을 스르륵 지나간단다. 하지만 숙제는 스르륵 지나가면 안 돼! 꼭 하렴.',
        '라프라스는 사람을 등에 태우고 바다를 건너는 걸 좋아하는 착한 포켓몬이란다. 친구를 돕는 마음, 그게 진짜 트레이너야.',
        '숙제는 매일 칠판에 적어 둔단다. 내 자리에 앉아 그 과목을 공부해서 세 문제 이상 맞히면 숙제 끝! 다 하면 나한테 꼭 보여 주렴.',
      ],
    }, { x: monitor.position.x, z: monitor.position.z, mesh: monitor, name: MONITOR.name, lines: MONITOR.lines },
    { x: LIB.x, z: LIB.z, mesh: librarian, name: LIBRARIAN.name, lines: LIBRARIAN.lines }, ...npcs],
  };
}
