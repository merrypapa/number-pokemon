import * as THREE from 'three';
import { Input } from './input.js';
import { buildWorld, terrainHeight, inHole, isBlocked, insideObstacle, setActiveTerrain, waterLevel, canSail, WORLD } from './world.js';
import { buildMegaShrine, shrineName, shrineHeightAt, SHRINE_PILLARS } from './mega.js';
import { buildArena, ARENA } from './arena.js';
import { buildCave } from './cave.js';
import { buildVolcano } from './volcano.js';
import { buildSea } from './sea.js';
import { buildDeepSea } from './deepsea.js';
import { buildSpace } from './space.js';
import { buildLab } from './lab.js';
import { buildHive } from './hive.js';
import { PLANETS, PLANET_BY_ZONE, buildPlanet, planetSvg } from './planets.js';
import { WarpFx } from './ufo.js';
import { strongAgainst, weakTo, skillIcon } from './types.js';
import { portrait, setPortraitRenderer } from './portrait.js';
import { BALLS, BALL_BY_ID, GRADES, gradeStars, recommendedBall, catchChance } from './balls.js';
import { evolveZoneOf } from './types.js';
import { Player, PLAYER_MODEL, PLAYER_NAME } from './player.js';
import { makeCar, CAR_MODEL, CAR_NAME } from './car.js';
import { Creature, buildDraftMesh, bossZoneOf, bossOverride, partyScale } from './creatures.js';
import { preloadModels, onModelLoaded, swapDraftWithModel, tickModel } from './models.js';
import { buildIntro } from './intro.js';
import { Numberblock, FollowChain, buildNumberblockMesh, animateNumberblock, GOLD_BLOCK, SILVER_BLOCK } from './numberblocks.js';
import { NUMBER_COLORS, colorForCount } from './palette.js';
import { Battle, BALL_MODEL, CUBE_MODEL } from './battle.js';
import { Confetti, Particles, Sound } from './effects.js';
import { Bgm, trackFor } from './bgm.js';
import { DuelStage } from './duelstage.js';
import { Dex } from './dex.js';
import { Party, friendStats } from './party.js';
import { Quiz } from './quiz.js';
import { listSaves, loadSave, saveGame, deleteSave, formatWhen } from './save.js';
import { cloud, validName, validPin } from './cloud.js';
import { weekKey, weekRange, weekScore, emptyWeek, rankEntry, renderRankRows, WEIGHTS, TOP_N } from './rank.js';
import { emptyLearn, loadLearn, rollWeek, learnSummary, TIER_NAME } from './learn.js';
import { emptyGoals, loadGoals, rollDay, goalAdd, allDone, checkStickers, MISSION_BY_ID, MISSION_BALL, BONUS_BALL, STICKERS, stickerCount } from './goals.js';
import { Photo } from './photo.js';
import { Ghosts, makeEmoteSprite } from './presence.js';
import { snapshotMon, acceptPatch, attackPatch, duelCardHtml, sideOf, DUEL_REWARD, DUEL_KEEP_MS } from './duel.js';
import { GRUNTS, ROCKETS_ON, buildGruntMesh, addWhiteFlag, addBrainwashRing } from './rocket.js';
import { makeBlockMesh, makeNumberSprite, rand, josa } from './util.js';

// ---------- 기본 세팅 ----------
const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5)); // 태블릿(2x)에서 픽셀 수를 줄여 빠르게
// 캔버스 크기는 CSS(화면 전체)가 정하고, 그리기 버퍼는 실제 캔버스 크기에 맞춘다.
// 휴대폰은 주소창이 접히거나 화면이 돌아가도 resize 이벤트가 안 올 때가 있어 매 프레임 확인한다.
let fitW = 0, fitH = 0, onFit = null; // onFit: 인트로 무대 카메라도 같이 맞춘다 (인트로가 만들어진 뒤 설정)
function fitRenderer() {
  const w = canvas.clientWidth || window.innerWidth, h = canvas.clientHeight || window.innerHeight;
  if (!w || !h || (w === fitW && h === fitH)) return;
  fitW = w; fitH = h;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  onFit?.(w / h);
}
renderer.shadowMap.enabled = true;
setPortraitRenderer(renderer); // 말풍선 얼굴 그림도 이 렌더러로 그린다 (컨텍스트를 따로 만들지 않는다)
renderer.shadowMap.type = THREE.PCFShadowMap; // Soft 보다 가볍다

const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 400);
fitRenderer();
// 카메라: 주인공을 중심으로 회전(camYaw)/기울기(camPitch). 화면 드래그나 Q/R 로 돌린다.
const cam = { yaw: 0, pitch: 0 };
// pitch 가 -0.35 보다 작아지면(화면을 위로 드래그) 카메라가 내려오고 시선이 하늘로 올라간다 (우주의 태양과 행성 보기)
function camOffset() {
  const h = Math.max(1.6, 9 + cam.pitch * 6), d = 11 - cam.pitch * 3;
  return new THREE.Vector3(Math.sin(cam.yaw) * d, h, Math.cos(cam.yaw) * d);
}
function camLookY() { return 1 + Math.max(0, -0.35 - cam.pitch) * 12; }
function camForward() { return new THREE.Vector3(-Math.sin(cam.yaw), 0, -Math.cos(cam.yaw)); } // 카메라가 보는 지면 방향
window.addEventListener('resize', fitRenderer);
window.visualViewport?.addEventListener('resize', fitRenderer);

const input = new Input();
const sound = new Sound();
// 배경 음악 (src/bgm.js). 음악 파일 없이 WebAudio 로 직접 연주한다. 브라우저 규칙상 화면을 한 번 눌러야 소리가 나므로,
// 첫 조작 때 지금 있어야 할 곡을 틀고 그 뒤로는 지역·대결에 따라 바뀐다.
const bgm = new Bgm(sound);
function bgmNow() { // 지금 나와야 할 곡
  if (battle?.active) return battle.creature?.isBoss ? 'boss' : 'battle';
  if (duelStage?.active) return 'battle'; // 아레나 무대 위 친구 대결
  return zone ? trackFor(zone.name) : 'title';
}
function bgmRefresh() { bgm.play(bgmNow(), zone?.name || null); }
for (const ev of ['pointerdown', 'keydown']) window.addEventListener(ev, () => { sound.ensure(); bgmRefresh(); }, { passive: true });
document.addEventListener('visibilitychange', () => bgm.setHidden(document.hidden));
const bgmBtns = [document.getElementById('btn-bgm'), document.getElementById('dex-bgm')];
function refreshBgmBtn() { for (const b of bgmBtns) { if (!b) continue; const t = bgm.on ? '🎵' : '🔇'; b.textContent = b.id === 'btn-bgm' ? `${t} 음악` : t; b.title = bgm.on ? '배경 음악 끄기' : '배경 음악 켜기'; } }
for (const b of bgmBtns) if (b) b.onclick = () => { sound.ensure(); bgm.toggle(); if (bgm.on) bgmRefresh(); refreshBgmBtn(); sound.click(); };
refreshBgmBtn();
const particles = new Particles();
const confetti = new Confetti(document.getElementById('fx'));

// ---------- 메시지 (원이 말풍선) ----------
const msgEl = document.getElementById('msg');
const msgText = document.getElementById('msg-text');
const msgFace = document.getElementById('msg-face');
let msgTimer = 0;
// 말풍선 기본 얼굴: 넘버볼 (SVG 그림 하나를 계속 재사용한다. iOS 사파리가 매번 새로 만든 CSS 그림을 안 그리는 일이 있어서)
const BALL_SVG = 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><defs><clipPath id="c"><circle cx="20" cy="20" r="18.5"/></clipPath></defs><circle cx="20" cy="20" r="18.5" fill="#f4f4f8"/><path d="M1.5 20a18.5 18.5 0 0 1 37 0z" fill="#e8453c"/><rect x="0" y="17.5" width="40" height="5" fill="#20232e" clip-path="url(#c)"/><circle cx="20" cy="20" r="18.5" fill="none" stroke="#20232e" stroke-width="3"/><circle cx="20" cy="20" r="5" fill="#fff" stroke="#20232e" stroke-width="3"/></svg>');
const ballFaceEl = Object.assign(new Image(), { src: BALL_SVG, className: 'ball-face', alt: '' });
const photoFaceEl = Object.assign(new Image(), { alt: '' });
// face: 숫자블록 얼굴('1'~'10') 또는 faceImg: 얼굴 그림(데이터 URL, NPC 대화)
function say(text, { face = null, faceImg = null, sec = 4 } = {}) {
  msgText.textContent = text;
  msgFace.classList.toggle('photo', !!faceImg);
  if (faceImg) {
    photoFaceEl.src = faceImg;
    msgFace.replaceChildren(photoFaceEl);
    msgFace.style.background = '#fff';
  } else if (!face) { // 기본 얼굴은 넘버볼
    msgFace.replaceChildren(ballFaceEl);
    msgFace.style.background = '#fff';
  } else {
    msgFace.textContent = face;
    const col = NUMBER_COLORS[Number(face)] || (Number(face) > 10 ? { base: colorForCount(Number(face)) } : null); // 열보다 큰 숫자는 열이와 같은 색
    msgFace.style.background = col ? col.base : '#fff';
    msgFace.style.color = col ? '#fff' : '#333';
  }
  msgEl.classList.remove('hidden');
  msgTimer = sec;
}
/** NPC 얼굴 그림 (모델이 도착하면 새로 그린다) */
function npcFace(npc) { return portrait(npc.mesh, `npc:${npc.name}:${npc.mesh.userData.model ? 'm' : 'd'}`); }
// 메시지 창을 누르면(터치/클릭) 바로 사라진다. 손가락을 뗀 뒤(click)에 숨겨야 iOS 가 다음 그림을 제대로 그린다.
msgEl.addEventListener('pointerdown', (e) => e.stopPropagation());
msgEl.addEventListener('click', () => { msgEl.classList.add('hidden'); msgTimer = 0; });
// 지역 이름 배너 (지역에 들어갈 때 크게)
const zoneBannerEl = document.getElementById('zone-banner');
let zoneBannerTimer = 0;
function showZoneBanner(text) {
  zoneBannerEl.textContent = text;
  zoneBannerEl.classList.remove('hidden');
  zoneBannerEl.classList.remove('pop'); void zoneBannerEl.offsetWidth; zoneBannerEl.classList.add('pop');
  zoneBannerTimer = 2.6;
}

// ---------- 데이터 ----------
const [creatureData, nbData] = await Promise.all([
  fetch('data/creatures.json').then((r) => r.json()),
  fetch('data/numberblocks.json').then((r) => r.json()),
]);
const ZONE_INFO = creatureData.zones; // { forest: { name: '푸른숲', desc }, ... }
const speciesById = Object.fromEntries(creatureData.creatures.map((c) => [c.id, c]));
const starters = creatureData.creatures.filter((c) => c.starter);
// assets/models/ 의 .glb 는 기다리지 않고 뒤에서 받는다. 도착하면 시작 화면과 게임 안의 드래프트 도형이 그 자리에서 모델로 바뀐다.
const NPC_MODELS = ['나미.glb', '웅이.glb', '봄이.glb', '리리.glb', '코리.glb', '오박사.glb', '루피.glb', '아이손오공.glb', '손오공.glb', '도토로.glb', '베지터.glb', '벅스버니.glb'];
const PICKUP_MODEL = { p_sun: '햇님.glb', p_uranus: '보석.glb', space: '황금빵구.glb' }; // 흰 블록 대신 떠 있는 줍는 것 (태양 햇님 · 천왕성 보석 · 꿈의우주 황금 별)
// 줍는 것 중 가끔 섞여 나오는 수수께끼 상자. 주우면 블록 대신 숫자블록 친구가 그 자리에서 튀어나온다 (아래 spawnRescue)
const CHEST_MODEL = { forest: '수수께끼블록.glb', cave: '수수께끼블록.glb', volcano: '수수께끼블록.glb', hive: '수수께끼블록.glb', sea: '바다보물상자.glb', deepsea: '바다보물상자.glb' };
const CHEST_CHANCE = 0.12; // 여덟 개에 하나쯤 — 가끔 만나야 반갑다. 흰 블록이 "블록 한 개"를 눈으로 보여 주는 장치이기도 해서 상자로 다 바꾸지는 않는다
const ITEM_MODELS = [BALL_MODEL, CUBE_MODEL, ...Object.values(PICKUP_MODEL), ...new Set(Object.values(CHEST_MODEL))];
const modelFiles = [PLAYER_MODEL, CAR_MODEL, ...creatureData.creatures.map((c) => c.model), ...NPC_MODELS, ...ITEM_MODELS];
const loadingEl = document.getElementById('title-loading');
preloadModels(modelFiles, (done, total) => {
  loadingEl.textContent = `친구들 불러오는 중 ${done}/${total}`;
  loadingEl.classList.toggle('hidden', done >= total);
});
document.getElementById('title-sub').textContent = '포켓몬과 함께 떠나는 신나는 숫자 모험!';
const nbById = Object.fromEntries(nbData.numberblocks.map((n) => [n.id, n]));
const nbByNumber = Object.fromEntries(nbData.numberblocks.map((n) => [n.number, n]));

// ---------- 지역(zone) ----------
// 각 지역은 자기 scene, 지형, 몬스터, 블록을 가진다. 주인공과 파트너들은 지역을 옮겨 다닌다.
function makeZone(name, builder) {
  const scene = new THREE.Scene();
  const world = builder(scene);
  return { name, label: ZONE_INFO[name]?.name || name, scene, world, terrain: world.terrain, creatures: [], pickups: [], rescues: [], nbTimer: rand(3, 7), respawnTimer: 6 };
}
// 지역은 필요할 때 만든다 (시작할 때 다 만들면 타이틀이 늦게 뜬다): 푸른숲은 시작 직후 뒤에서, 나머지는 처음 갈 때(화면 전환 페이드 중).
/** 그 지역의 보스 (보스 능력치를 덮어쓴 모습). boss 가 객체인 종(이상해꽃·리자몽·꼬마돌 …)은 평소엔 진화형·야생이고 그 지역에서만 보스다 */
function bossFor(zoneName) { const sp = creatureData.creatures.find((c) => c.boss && bossZoneOf(c) === zoneName); return sp ? { ...sp, ...bossOverride(sp) } : null; }
const BUILDERS = { forest: buildWorld, cave: buildCave, volcano: buildVolcano, sea: buildSea, deepsea: buildDeepSea, space: buildSpace, lab: buildLab, hive: buildHive, arena: buildArena };
const WILD_TOTAL = { forest: 42, cave: 16, volcano: 26, sea: 44, deepsea: 24, space: 26, hive: 14 }; // 지역별 야생 몬스터 자리 수 (물의길은 섬 20 + 바다 20 + 먼바다 4). 맵을 넓히며 함께 늘렸다
const PICKUP_CAP = { forest: 3, cave: 2, volcano: 2, sea: 2, deepsea: 2, space: 2, hive: 3 }; // 꿀벌집 3개는 보너스 벌집 위 // 줍는 블록 자리 수 (아주 적게: 블록은 대결·숫자블록 퀴즈로 얻는다)
for (const p of PLANETS) { // 태양계 행성 지역 10곳 (p_sun … p_pluto): 꿈의우주 UFO 정거장의 손오공에게 말을 걸고 고른다. 사는 포켓몬은 zones.p_*.wild
  BUILDERS[p.zone] = (scene) => buildPlanet(p, scene, { info: ZONE_INFO[p.zone] || {}, speciesName: (id) => speciesById[id]?.name, boss: bossFor(p.zone), hidden: creatureData.creatures.find((c) => c.zone === p.zone && c.unlockedBy) || null, rival: p.zone === 'p_sun' ? { name: '베지터', model: '베지터.glb' } : null });
  WILD_TOTAL[p.zone] = 16; PICKUP_CAP[p.zone] = 2;
}
const MAX_RESCUES = 5; // 한 지역에 동시에 나타나는 퀴즈 친구 수 (문제를 많이 풀게)
const blockValue = () => ZONE_INFO[zone?.name]?.blockValue || 1; // 이 지역에서 블록 1개의 가치
const zones = {};
let zone = null;       // 지금 있는 지역 (게임 시작 전엔 null)
let player = null, chain = null;
let pendingCaught = {}; // 불러온 저장 데이터의 "이미 잡은 몬스터" (지역이 만들어질 때 적용)

function spawnCreature(z, speciesId, x, zz, extra = {}) {
  const data = { ...speciesById[speciesId], ...extra };
  const c = new Creature(z.scene, data, new THREE.Vector3(x, 0, zz));
  z.creatures.push(c);
  return c;
}
/** 넘버로켓단 대원을 그 지역에 세운다 (src/rocket.js).
 *  서려던 자리가 바위·물·장식으로 막혀 있으면 둘레를 넓혀 가며 빈자리를 찾는다 (맵이 넓어져도 안 파묻히게). */
const SHOW_ROCKETS = ROCKETS_ON || location.search.includes('rockets'); // 캐릭터 그림이 정해질 때까지는 꺼 둔다 (src/rocket.js)
function placeGrunt(z) {
  if (!SHOW_ROCKETS) return;
  const g = GRUNTS[z.name];
  if (!g) return;
  const clear = (x, zz) => Math.abs(x) < z.terrain.size / 2 - 4 && Math.abs(zz) < z.terrain.size / 2 - 4 && !inHole(x, zz) && !isBlocked(x, zz) && !insideObstacle(x, zz, 1.4);
  let at = null;
  for (const r of [0, 3, 6, 9, 13, 18, 24, 32]) {
    for (let k = 0; k < (r ? 16 : 1); k++) {
      const a = (k / 16) * Math.PI * 2;
      const x = g.at.x + Math.cos(a) * r, zz = g.at.z + Math.sin(a) * r;
      if (clear(x, zz)) { at = { x, z: zz }; break; }
    }
    if (at) break;
  }
  if (!at) { console.warn('[rocket] 대원이 설 자리를 못 찾았어:', z.name); return; }
  const mesh = buildGruntMesh(g);
  mesh.position.set(at.x, terrainHeight(at.x, at.z), at.z);
  const home = z.world.spawn || { x: 0, z: 0 };
  mesh.rotation.y = Math.atan2(home.x - at.x, home.z - at.z); // 지우가 오는 쪽(시작 지점)을 본다
  mesh.userData.radius = 0.9; // 대결 중 시야를 가릴 때만 잠깐 숨기는 크기 (나무·바위와 같은 규칙, src/battle.js)
  (z.world.decor || z.scene).add(mesh); // 다른 NPC 와 같이 장식 그룹에 — 그래야 대결 화면에서 상대를 가리지 않는다
  const npc = { x: at.x, z: at.z, mesh, name: g.name, rocket: g, lines: g.after };
  if (state.rockets[z.name]) addWhiteFlag(mesh); // 이미 항복시킨 대원은 흰 깃발을 들고 서 있다
  (z.world.npcs ||= []).push(npc);
  z.grunt = npc;
}
/** 시작 지점에서 얼마나 멀리 있는 자리인가: 0 = 시작 지점, 1 = 맵 가장자리 */
function outwardness(z, x, zz) {
  const s = z.world.spawn || { x: 0, z: 0 };
  const half = (z.terrain.size || 200) / 2;
  return Math.max(0, Math.min(1, Math.hypot(x - s.x, zz - s.z) / half));
}
/** 그 자리에서 수수께끼 상자가 나올 확률. 마을 근처(0.3 안쪽)에는 안 나오고, 멀수록 잦다(가장자리에서 두 배).
 *  아이가 맵 구석구석까지 나가 보도록 — 전체 개수는 예전과 비슷하다. */
function chestChanceAt(z, x, zz) {
  const d = outwardness(z, x, zz);
  if (d < 0.3) return 0;
  return CHEST_CHANCE * (0.5 + 2 * (d - 0.3) / 0.7);
}
function spawnPickup(z, x, zz) {
  let m;
  const chest = CHEST_MODEL[z.name] && Math.random() < chestChanceAt(z, x, zz) ? CHEST_MODEL[z.name] : null;
  if (chest) { // 수수께끼 상자 (푸른숲·지하동굴·불의산·꿀벌집) / 바다 보물상자 (물의길·심해)
    m = new THREE.Group();
    const draft = new THREE.Group(); draft.add(makeBlockMesh(0xffd43b)); m.add(draft); m.userData.draft = draft;
    swapDraftWithModel(m, chest, { scale: 1.1, onSwap: (mm) => { mm.position.y = -0.55; } });
    m.userData.chest = true;
    if (z.world.dark) m.userData.glow = true;
  } else if (PICKUP_MODEL[z.name]) { // 태양·천왕성·꿈의우주: 흰 블록 대신 햇님·보석·황금 별 모델 (없으면 흰 블록)
    m = new THREE.Group();
    const draft = new THREE.Group(); draft.add(makeBlockMesh(0xffffff)); m.add(draft); m.userData.draft = draft;
    swapDraftWithModel(m, PICKUP_MODEL[z.name], { scale: 1.1, onSwap: (mm) => { mm.position.y = -0.55; } }); // 높이 1.1m, 가운데가 원점 (블록처럼 떠서 돈다)
    if (z.world.dark) m.userData.glow = true;
  } else {
    m = makeBlockMesh(0xffffff);
    if (z.world.dark) { m.material.emissive = new THREE.Color(0x9fe8ff); m.material.emissiveIntensity = 0.7; m.userData.glow = true; } // 어두운 곳의 형광 블록
  }
  m.position.set(x, z.terrain.height(x, zz) + 0.6, zz);
  m.userData.t = rand(0, 10);
  z.scene.add(m);
  z.pickups.push(m);
}
// ---------- 이상해꽃 자동차: 주인공의 탈것 ----------
// 푸른숲 시작 지점 옆에 세워져 있다. 가까이 가서 "🚗 타기"를 누르면 타고, 한 번 타면 내 차가 되어 어느 지역에서든 HUD 🚗 버튼(C)으로 부르거나 내린다.
// 걷기의 2.2배로 달리고(가속 버튼이면 더) 점프는 못 한다. 물 위·심해·꿀벌집·연구소에서는 못 타고, 기차·로켓·배·UFO 를 타면 자동으로 내린다.
// 이상해꽃 자동차는 이상해꽃(푸른숲 보스·이상해씨의 최종 진화·메가이상해꽃)이 대표 포켓몬일 때만 쓸 수 있다. 대표를 바꾸면 차는 사라진다.
const CAR_ZONE_OK = (name) => !['deepsea', 'hive', 'lab'].includes(name);
const CAR_SPECIES = new Set(['m01ee', 'x01']); // 이상해꽃 · 메가이상해꽃
const carAllowed = () => !!party.leader && CAR_SPECIES.has(party.leader.speciesId);
let carAt = null;   // 세워 둔 차: { zone, car, obs }
let driving = false;
const carBtn = document.getElementById('hud-car-row');
function refreshCarBtn() { const show = carAllowed(); if (carBtn.hidden === show) carBtn.hidden = !show; const label = driving ? '🚶 내리기' : '🚗 타기'; if (carBtn.textContent !== label) carBtn.textContent = label; }
/** 매 프레임: 대표가 이상해꽃이 아니면 차를 거둔다 */
function tickCar() {
  if (!carAllowed()) { if (driving) dismountCar({ park: false }); if (carAt) removeParkedCar(); }
  refreshCarBtn();
}
/** 차를 그 지역에 세운다 */
function parkCar(z, x, zz, yaw, car = null) {
  removeParkedCar();
  car = car || makeCar();
  car.group.position.set(x, terrainHeight(x, zz), zz);
  car.group.rotation.y = yaw;
  z.scene.add(car.group);
  const obs = { x, z: zz, r: 1.5 };
  z.terrain.obstacles.push(obs);
  carAt = { zone: z.name, car, obs };
}
function removeParkedCar() {
  if (!carAt) return;
  const z = zones[carAt.zone];
  if (z) { z.scene.remove(carAt.car.group); const i = z.terrain.obstacles.indexOf(carAt.obs); if (i >= 0) z.terrain.obstacles.splice(i, 1); }
  carAt = null;
}
function mountCar() {
  if (driving || !zone || !carAllowed() || !CAR_ZONE_OK(zone.name) || sailing || battle.active || ride || switching) return;
  const car = carAt?.car || makeCar();
  removeParkedCar();
  carAt = null;
  player.drive(car.body);
  driving = true;
  car.body.userData.car = car;
  if (!state.carTold) { state.carTold = true; say(`🚗 ${CAR_NAME} 출발! 달리기 버튼을 누르면 더 빨라지고, 🚗 버튼(C)이나 액션 버튼으로 내릴 수 있어. 이상해꽃이 대표일 때만 탈 수 있어.`, { sec: 8 }); }
  sound.click();
  refreshCarBtn();
}
/** 내린다. park 가 true 면 옆에 세워 두고, false 면 차는 사라진다(다음에 🚗 버튼으로 다시 부른다) */
function dismountCar({ park = true } = {}) {
  if (!driving) return;
  const body = player.dismount();
  driving = false;
  const car = body?.userData.car;
  if (park && car && zone) {
    const f = player.facing, px = player.position.x, pz = player.position.z;
    let x = px + Math.cos(f) * 2.4, zz = pz - Math.sin(f) * 2.4; // 주인공 왼쪽 옆
    if (isBlocked(x, zz) || insideObstacle(x, zz, 1.2)) { x = px; zz = pz; }
    car.group.add(body);
    parkCar(zone, x, zz, f, car);
  }
  refreshCarBtn();
}
function toggleCar() { driving ? dismountCar() : mountCar(); }
carBtn.onclick = toggleCar;

// ---------- 메가 성역: 지역을 정복하면 나타나는 숨은 장소 + 그곳을 지키는 메가 포켓몬 ----------
const SHRINE_HINT = { forest: WORLD.shrineSpot, cave: { x: -44, z: 34 }, volcano: { x: -93, z: 85 }, sea: { x: 110, z: 114 }, space: { x: 85, z: 79 } }; // 푸른숲·물의길은 맵을 넓히며 함께 옮겼다 (물의길은 배로 나가는 먼바다 위)
/** 성역을 놓을 만한 넓고 평평한 자리를 찾는다 (바다 지역은 탁 트인 물 위) */
function findShrineSpot(z) {
  const onWater = !!z.world.waterY;
  const half = z.terrain.size / 2 - 26;
  const boss = z.world.bossSpot || { x: 0, z: 0 }, spawn = z.world.spawn;
  const minSpawn = Math.min(55, z.terrain.size * 0.26), minBoss = Math.min(40, z.terrain.size * 0.2); // 작은 지역(지하동굴)에서는 기준을 줄인다
  const ok = (x, zz) => {
    if (Math.abs(x) > half || Math.abs(zz) > half) return false;
    if (Math.hypot(x - boss.x, zz - boss.z) < minBoss || Math.hypot(x - spawn.x, zz - spawn.z) < minSpawn) return false; // 마을·보스에서 멀리 (숨은 곳)
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 6) {   // 둘레도 성역이 놓일 만한지
      for (const r of [5, 16]) {
        const px = x + Math.cos(a) * r, pz = zz + Math.sin(a) * r;
        if (onWater ? !canSail(px, pz) : (isBlocked(px, pz) || inHole(px, pz))) return false;
        if (r === 5 && !onWater && insideObstacle(px, pz, 1.2)) return false; // 가운데는 나무·바위 없는 빈터라야 한다
      }
    }
    return onWater ? canSail(x, zz) : (!isBlocked(x, zz) && !inHole(x, zz) && Math.abs(terrainHeight(x, zz) - terrainHeight(x + 14, zz)) < 4);
  };
  const hint = SHRINE_HINT[z.name];
  if (hint && ok(hint.x, hint.z)) return hint;
  for (let r = Math.max(minSpawn + 4, half * 0.5); r < half; r += 6) { // 힌트가 막혔으면 바깥쪽을 돌며 찾는다
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 10) {
      const x = Math.cos(a) * r, zz = Math.sin(a) * r;
      if (ok(x, zz)) return { x, z: zz };
    }
  }
  return null;
}
function buildShrine(z) {
  if (z.world.noShrine) return; // 그 지역 전용 메가 포켓몬이 없으면 성역도 세우지 않는다 (심해)
  const spot = findShrineSpot(z);
  if (!spot) return;
  const baseY = z.world.waterY != null ? z.world.waterY - 1.2 : terrainHeight(spot.x, spot.z);
  z.shrine = buildMegaShrine(z.name, spot.x, baseY, spot.z);
  z.scene.add(z.shrine.group);
  if (z.world.waterY != null) { // 바다 위 성역(물의길): 배로는 계단을 못 오르니 메가 포켓몬은 성역 앞 물 위에서 만난다. 성역 자체는 못 지나간다
    z.shrine.megaSpot = { x: spot.x, z: spot.z + 18 };
    z.terrain.obstacles.push({ x: spot.x, z: spot.z, r: 15.5, shrine: true }); // 정복 전엔 꺼 둔다
    z.shrineObstacle = z.terrain.obstacles[z.terrain.obstacles.length - 1];
    z.shrineObstacle.r = 0;                                 // 숨어 있는 동안은 막지 않는다
  } else { // 땅 위 성역: 메가 포켓몬은 성역 가운데 제단 위에 있고, 지우가 계단(단)을 걸어 올라가 대결한다
    z.shrine.megaSpot = { x: spot.x, z: spot.z };
    const orig = z.terrain.height;
    if (!z.terrain.shrineWrapped) { // 지형 높이에 성역의 단을 얹는다 (성역이 드러난 뒤에만)
      z.terrain.height = (x, zz) => { const h = orig(x, zz); if (!z.shrine?.shown) return h; const s = shrineHeightAt(Math.hypot(x - spot.x, zz - spot.z)); return s > 0 ? Math.max(h, baseY + s) : h; };
      z.terrain.shrineWrapped = true;
    }
    z.shrinePillars = SHRINE_PILLARS.map((p) => ({ x: spot.x + p.x, z: spot.z + p.z, r: 0, pillarR: p.r })); // 기둥은 못 지나간다 (드러난 뒤에)
    z.terrain.obstacles.push(...z.shrinePillars);
  }
  if (state.conquered[z.name]) revealShrine(z, true);
}
/** 성역을 드러내고 메가 포켓몬을 불러낸다 */
/** 조건 포켓몬(메가리자몽X·리자풀·뮤 …)을 잡을 수 있게 됐나: unlockedBy 종을 이미 잡았으면 열린다 (배열이면 그 종을 모두 잡아야 한다 — 뮤는 행성 보스 열 마리) */
function unlockNeeds(sp) { return Array.isArray(sp.unlockedBy) ? sp.unlockedBy : [sp.unlockedBy]; }
function caughtFor(id) { const sp = speciesById[id]; return sp?.boss ? (state.bossDex[id] || 0) > 0 : (state.dex[id] || 0) > 0; } // 보스 모습이 있는 종은 보스로 잡아야 센다 (야생 꼬마돌은 안 됨)
function megaUnlocked(sp) { return unlockNeeds(sp).every(caughtFor); }
/** 그 포켓몬을 지역의 빈 자리에 세운다 (성역이 아니라 일반 맵) */
function spawnUnlocked(z, sp) {
  if (z.creatures.some((c) => c.data.id === sp.id)) return null;
  if ((state.dex[sp.id] || 0) > 0) return null; // 이미 잡았으면 다시 나오지 않는다
  const spots = (z.world.wildSpots || []).filter(([x, zz]) => !z.creatures.some((c) => Math.hypot(c.home.x - x, c.home.z - zz) < 6));
  const all = spots.length ? spots : (z.world.wildSpots || []);
  const spot = all[Math.floor(Math.random() * all.length)] || [z.world.spawn.x + 10, z.world.spawn.z + 10];
  const prev = zone?.terrain;
  setActiveTerrain(z.terrain);
  const c = spawnCreature(z, sp.id, spot[0], spot[1]);
  if (c) c.isMega = true;
  if (prev) setActiveTerrain(prev);
  return c;
}
/** 방금 잡은 종 때문에 열린 특별 포켓몬을 그 지역에 세운다 (이미 만든 지역이면 바로, 아니면 들어갈 때 생긴다) */
function checkUnlocked(caughtId) {
  for (const sp of creatureData.creatures.filter((c) => c.unlockedBy && unlockNeeds(c).includes(caughtId))) {
    if (!megaUnlocked(sp) || (state.dex[sp.id] || 0) > 0) continue;
    const z = zones[sp.zone];
    if (z && !spawnUnlocked(z, sp)) continue; // 아직 안 만든 지역이면 처음 갈 때 getZone 이 세운다
    const many = unlockNeeds(sp).length > 1; // 뮤: 행성 보스를 모두 잡았을 때
    setTimeout(() => say(`✨ ${many ? '행성 열 곳의 보스를 모두 잡았어! 전설의 ' : ''}${josa(sp.name, '이가')} ${ZONE_INFO[sp.zone]?.name || sp.zone} 어딘가에 나타났어! 찾아가서 도전해 봐!`, { sec: 10 }), 2500);
  }
}
function revealShrine(z, silent = false) {
  if (!z.shrine || z.shrine.shown) return;
  z.shrine.shown = true;
  z.shrine.reveal();
  if (z.shrineObstacle) z.shrineObstacle.r = 15.5;
  for (const p of z.shrinePillars || []) p.r = p.pillarR;
  const mega = creatureData.creatures.find((c) => c.zone === z.name && c.shrine);
  if (mega && !(state.caughtCreatures[z.name] || []).includes(z.creatures.length)) {
    setActiveTerrain(z.terrain); // Creature 는 지형 높이를 쓰므로 잠시 전환
    const c = spawnCreature(z, mega.id, z.shrine.megaSpot.x, z.shrine.megaSpot.z);
    c.isMega = true;
    if (z.shrinePillars) { c.leash = 2.5; c.approachRange = 8; } // 제단 위를 벗어나지 않는다 (지우가 올라오면 마중은 나온다)
    if (zone) setActiveTerrain(zone.terrain);
  }
  if (!silent) {
    showZoneBanner(`✨ ${shrineName(z.name)} 출현!`);
    setTimeout(() => say(`숨어 있던 ${josa(shrineName(z.name), '이가')} 솟아올랐어! ${mega ? `그곳을 지키는 ${josa(mega.name, '이가')} 나타났어. 메가큐브을 준비해서 도전해 봐!` : ''}`, { sec: 10 }), 1800);
  }
}
/** 지역을 만들고(없으면) 몬스터·보스·블록을 채운다. 저장에서 이미 잡은 몬스터는 빼 둔다. */
function getZone(name) {
  if (zones[name]) return zones[name];
  const z = makeZone(name, BUILDERS[name]);
  zones[name] = z;
  setActiveTerrain(z.terrain); // Creature 생성 시 지형 높이를 쓰므로 잠시 전환
  // 야생 포켓몬: 보통은 그 지역에 사는 종(zone). 다만 zones[].wild 에 종 목록이 있으면 그걸 쓴다
  // (심해는 물의길의 물 포켓몬이 내려와 사는 곳이라 같은 종을 데려다 쓴다. wildOverride 로 그 지역에 맞게 고친다:
  //  심해에는 수면이 없으므로 swim 을 꺼서 해저 바닥을 걸어 다니게 한다).
  const zi = ZONE_INFO[name] || {};
  const wildExtra = zi.wildOverride || {};
  const ws = zi.wildScale; // 심해: 물의길 종이 내려와 살지만 기본 능력치 1.5배 (잡으면 그 능력치로 들어온다)
  const scaled = (c) => (ws ? { ...c, baseHp: Math.round(c.baseHp * (ws.hp || 1)), baseAtk: Math.round(c.baseAtk * (ws.atk || 1)) } : c);
  const wild = zi.wild
    ? zi.wild.map((id) => speciesById[id]).filter((c) => c && !(c.boss && bossZoneOf(c) === z.name)).map((c) => scaled({ ...c, ...wildExtra })) // 이 지역의 보스인 종은 야생으로는 안 나온다 (화성 이상해불·명왕성 윤겔라·수성 꼬마돌)
    : creatureData.creatures.filter((c) => c.zone === z.name && !(c.boss && bossZoneOf(c) === z.name) && !c.special && !c.mega && !c.unlockedBy && c.catchable); // 이 지역의 보스는 야생으로 안 나온다 (다른 지역 보스인 종은 여기선 야생). unlockedBy 종(힙합리자몽·루기아)도 조건을 채우기 전에는 야생으로 안 나온다
  const land = wild.filter((c) => !c.swim), swimmers = wild.filter((c) => c.swim && !c.deepSea), deep = wild.filter((c) => c.deepSea);
  const wildOnly = { ...wildExtra, boss: false }; // 야생으로 나올 땐 보스 표시를 뗀다 (꼬마돌은 수성에서만 보스)
  const extraFor = (c) => (ws ? { ...wildOnly, baseHp: c.baseHp, baseAtk: c.baseAtk } : wildOnly); // wildScale 로 키운 능력치를 그대로 넘긴다
  // 시작 지점에 가까운 자리에는 순한 종, 멀수록 등급이 높은(희귀하고 센) 종이 나온다.
  // 맵을 넓게 쓰게 하려는 것 — 바깥으로 나갈수록 좋은 포켓몬을 만난다.
  if (land.length) {
    const order = [...land].sort((a, b) => (a.grade || 1) - (b.grade || 1) || (a.baseHp || 0) - (b.baseHp || 0));
    const spots = z.world.wildSpots.map(([x, zz]) => ({ x, z: zz, d: outwardness(z, x, zz) })).sort((a, b) => a.d - b.d);
    spots.forEach((s, i) => {
      const band = Math.floor((i + rand(-0.9, 0.9)) * order.length / spots.length); // 띠 경계가 칼같지 않게 살짝 섞는다
      const c = order[Math.max(0, Math.min(order.length - 1, band))];
      spawnCreature(z, c.id, s.x, s.z, extraFor(c));
    });
  }
  // 배를 타야 만나는 헤엄치는 포켓몬 (물 위), 그리고 아주 먼바다에만 사는 포켓몬
  (z.world.waterSpots || []).forEach(([x, zz], i) => { if (swimmers.length) { const c = swimmers[i % swimmers.length]; spawnCreature(z, c.id, x, zz, extraFor(c)); } });
  (z.world.deepSpots || []).forEach(([x, zz], i) => { if (deep.length) { const c = deep[i % deep.length]; spawnCreature(z, c.id, x, zz, extraFor(c)); } });
  const boss = creatureData.creatures.find((c) => c.boss && bossZoneOf(c) === z.name);
  if (boss) { const c = spawnCreature(z, boss.id, z.world.bossSpot.x, z.world.bossSpot.z, bossOverride(boss)); c.mesh.userData.bossZone = z.name; }
  // 특별한 자리에만 나오는 몬스터 (잠만보의 잠자는 곳 등)
  for (const c of creatureData.creatures.filter((c) => c.zone === z.name && c.special)) {
    const spot = z.world.specialSpots?.[c.special];
    if (spot) spawnCreature(z, c.id, spot.x, spot.z);
  }
  for (const [x, zz] of z.world.pickupSpots.slice(0, PICKUP_CAP[name] ?? 16)) spawnPickup(z, x, zz);
  buildShrine(z); // 메가 성역 (정복 전에는 숨어 있다)
  for (const sp of creatureData.creatures.filter((c) => c.zone === z.name && c.unlockedBy)) { // 조건을 채우면 일반 맵에 나타나는 포켓몬 (맨 뒤에 세워야 저장된 번호가 안 밀린다)
    if (megaUnlocked(sp)) spawnUnlocked(z, sp);
  }
  placeGrunt(z); // 넘버로켓단 대원 (지역마다 한 명)
  applyPendingCaught(z);
  if (name === 'forest' && state.conquered.forest) removeBoulder();
  if (name === 'cave' && state.glow) z.scene.fog.far = 110;
  if (zone) setActiveTerrain(zone.terrain);
  return z;
}
/** 저장에서 "이미 잡은" 몬스터를 그 지역에서 뺀다 (지역을 만들 때, 그리고 미리 만들어 둔 지역에 불러올 때) */
function applyPendingCaught(z) {
  for (const i of pendingCaught[z.name] || []) { const c = z.creatures[i]; if (c && c.state !== 'caught') { c.becomeFriend(); z.scene.remove(c.mesh); } }
}
function removeBoulder() {
  const f = zones.forest;
  if (!f || !f.world.boulder) return;
  f.scene.remove(f.world.boulder);
  const obs = f.terrain.obstacles, bi = obs.indexOf(f.world.boulderObstacle);
  if (bi >= 0) obs.splice(bi, 1); // 바위가 치워지면 지나갈 수 있다
}
const totalCreatures = Object.values(WILD_TOTAL).reduce((a, b) => a + b, 0);
const CONQUERABLE = Object.keys(BUILDERS).filter((n) => creatureData.creatures.some((c) => c.boss && bossZoneOf(c) === n)); // 보스가 있는 지역만 정복 대상 (연구소 제외)
const ZONE_COUNT = CONQUERABLE.length;

// ---------- 게임 상태 ----------
const MAX_BLOCKS = 1000; // 블록 더미 최대 (50개마다 금빛 한 칸으로 뭉치니 1000개까지 모아도 더미가 넘치지 않는다)
const MEGA_REWARD = 2;  // 메가 포켓몬 한 마리를 잡으면 받는 메가블럭 수 (메가 진화 1번에 1개)
const state = { name: PLAYER_NAME, admin: false, blocks: 0, megaBlocks: 0, caught: 0, rescued: 0, conquered: {}, caughtCreatures: {}, tutorial: 0, frames: 0, glow: false, dex: {}, glowBlocks: 0, prompt: 0, autosave: 90, returnTo: null, carTold: false, bossDex: {}, rockets: {}, lastWeek: null, lastWk: null, balls: { bronze: 3, silver: 0, gold: 0, diamond: 0 }, week: weekKey(), wk: emptyWeek(), learn: emptyLearn(), goals: emptyGoals() }; // week/wk: 이번 주(ISO 주) 순위표 기록 — 퀴즈 정답·잡기·보스 (src/rank.js) // carTold: 이상해꽃 자동차 안내를 한 번 보여 줬나 // rockets: 항복시킨 넘버로켓단 대원 (지역 이름 → true, src/rocket.js) // lastWeek/lastWk: 지난주 기록 (순위 화면에서 이번 주와 견줘 본다) // balls: 넘버볼 재고 (처음엔 브론즈 3개) // returnTo: 연구소 워프 패드로 돌아갈 지역 // glowBlocks: 어두운 곳에서 주운 형광 블록 수
const party = new Party(speciesById);
party.conqueredCount = () => Object.keys(state.conquered).length;
party.zoneOf = () => zone?.name || 'forest';
party.megaBlocks = () => state.megaBlocks;
party.onUseMega = (n) => { state.megaBlocks = Math.max(0, state.megaBlocks - n); refreshHud(); };
const dex = new Dex(
  creatureData.creatures,
  Object.fromEntries(Object.entries(ZONE_INFO).map(([k, v]) => [k, v.name])),
  Object.fromEntries(Object.entries(ZONE_INFO).filter(([, v]) => v.wild).map(([k, v]) => [k, v.wild])),
);
dex.lastCaught = state.dex;
const quiz = new Quiz({ dex, species: creatureData.creatures.filter((c) => c.model && c.boss !== true && !c.evolvedFrom), sound, learn: state.learn }); // 순수 보스(큰 것)만 뺀다
for (const f of modelFiles) onModelLoaded(f, () => { dex.cache.clear(); renderStarter(); if (party.leader) refreshHud(); }); // 모델이 오면 도감/선택 그림도 새로

// 주운 블록은 주인공 바로 뒤에 숫자블록 캐릭터로 쌓인다.
const myStack = { mesh: null, pop: 0 };
const STACK_SCALE = 0.72; // 따라오는 블록 더미는 조금 작게 (주인공을 가리지 않게)
/** mission:false 는 "오늘 모은 블록"으로 세지 않는다 (불러오기·관리자처럼 새로 번 게 아닐 때) */
function setBlocks(n, { glow = false, quiet = false, mission = true } = {}) {
  n = Math.max(0, Math.min(MAX_BLOCKS, n));
  if (n > state.blocks && glow) state.glowBlocks += n - state.blocks; // 형광 블록 획득
  const gained = Math.max(0, n - state.blocks);
  const chunkBefore = Math.floor(state.blocks / SILVER_BLOCK);
  state.blocks = n;
  const chunkNow = Math.floor(n / SILVER_BLOCK); // 25개마다 은빛 한 칸, 은빛 두 칸은 금빛 한 칸으로 뭉쳐서 더미가 다시 작아진다
  state.glowBlocks = Math.min(state.glowBlocks, n);                 // 써서 줄면 형광 블록도 줄어든다
  const old = myStack.mesh;
  if (n === 0) {
    if (old) { chain.remove(old); zone.scene.remove(old); }
    myStack.mesh = null;
  } else {
    const mesh = buildNumberblockMesh({ number: n }, { glow: state.glowBlocks > 0, theme: zone.name });
    mesh.scale.setScalar(STACK_SCALE);
    if (old) { chain.replace(old, mesh); zone.scene.remove(old); }
    else {
      mesh.position.copy(player.position).addScaledVector(camForward(), 1.6); // 카메라 반대편(안쪽)에 생긴다
      chain.addFirst(mesh);
    }
    zone.scene.add(mesh);
    myStack.mesh = mesh;
    myStack.pop = 1;
  }
  refreshHud();
  // 블록이 뭉치면 뒤에 쌓인 더미가 눈에 띄게 "작아진다" (25개가 은빛 한 칸으로). 왜 작아졌는지 설명이 없으면
  // 블록을 잃은 것처럼 보이므로 반드시 알려 준다. 그런데 보상 말풍선이 곧바로 덮어써서 설명이 사라지곤 했다
  // (상자 퀴즈를 풀 때 특히) — 그래서 지금 떠 있는 말이 끝난 뒤에 띄우도록 줄을 세운다.
  let merged = '';
  if (chunkNow > chunkBefore) {
    const golds = Math.floor(n / GOLD_BLOCK);
    merged = chunkNow % 2 // 홀수 번째 묶음 = 은빛 한 칸이 새로 생긴 순간
      ? `✨ 블록을 잃은 게 아니야 — ${SILVER_BLOCK}개가 은빛 블록 한 칸으로 뭉쳐서 더미가 작아 보이는 거야! 은빛 한 칸은 ${SILVER_BLOCK}개, 두 칸이 되면 금빛 한 칸(${GOLD_BLOCK})이 돼. 지금 블록은 모두 ${n}개!`
      : `✨ 은빛 두 칸이 금빛 블록 한 칸으로 뭉쳤어! 금빛 한 칸은 ${GOLD_BLOCK}개${golds > 1 ? `, 금빛 ${golds}칸이면 ${GOLD_BLOCK}씩 ${golds}번이라 ${golds * GOLD_BLOCK}개` : ''}야. 지금 블록은 모두 ${n}개!`;
    if (!quiet) { sound.fanfare(); confetti.burst(160); queueSay(merged, { sec: 8 }); }
  }
  if (gained && mission) bump('blocks', null, gained); // 오늘의 미션 "블록 모으기"
  return merged; // 부르는 쪽이 제 말풍선에 이어 붙이고 싶으면 quiet 로 받아 간다
}
const msgQueue = []; // 줄 세워 둔 말풍선 (프레임 루프가 지금 말이 끝나면 하나씩 띄운다 — 뭉침 안내·미션 완료·스티커)
function queueSay(text, opts = {}) { msgQueue.push({ text, opts }); }

const hudBlocks = document.getElementById('hud-blocks');
const hudLeader = document.getElementById('hud-leader');
const hudBlockIcon = document.querySelector('.hud-icon.block');
const hudPokeIcon = document.getElementById('hud-poke-icon');
const hudPokeImg = document.getElementById('hud-poke-img');
const hudSwap = document.querySelector('#hud-leader-row .hud-swap');
function refreshHud() {
  hudBlocks.textContent = `${state.blocks}개`;
  // 메가블럭 수는 게임 화면에는 안 보이고 도감(블록 알약의 💠)에서 본다
  hudBlockIcon.style.background = state.blocks > 0 ? colorForCount(state.blocks) : '#fff';
  const L = party.leader;
  if (L) {
    hudLeader.textContent = `${party.name(L)}${L.hp <= 0 ? ' 😵' : ''}`;
    const thumb = dex.thumbs(party.species(L))?.color || null; // 대표 포켓몬의 작은 모습
    if (thumb) { hudPokeImg.src = thumb; hudPokeImg.hidden = false; hudPokeIcon.hidden = true; }
    else { hudPokeImg.hidden = true; hudPokeIcon.hidden = false; hudPokeIcon.style.background = party.color(L); }
    hudSwap.hidden = party.members.length < 2;
  } else { hudLeader.textContent = '대표 없음'; hudPokeImg.hidden = true; hudPokeIcon.hidden = false; hudSwap.hidden = true; }
}
// 대표 포켓몬 이름을 누르면 다음 포켓몬(기절하지 않은)이 대표가 된다
document.getElementById('hud-leader-row').onclick = () => {
  if (battle.active || switching || evo) return;
  const ms = party.members, L = party.leader;
  if (ms.length < 2) { if (L) say('포켓몬이 한 마리뿐이야. 더 잡으면 여기서 바꿀 수 있어!', { sec: 3 }); return; }
  const i = ms.indexOf(L);
  for (let k = 1; k < ms.length; k++) {
    const cand = ms[(i + k) % ms.length];
    if (party.isFainted(cand)) continue;
    attachLeader(cand); sound.click(); refreshHud();
    say(`${josa(party.name(cand), '이가')} 대표 포켓몬이 됐어!`, { sec: 3, faceImg: dex.thumbs(party.species(cand))?.color || null });
    return;
  }
  say('다른 포켓몬은 모두 기절했어. 오박사님께 치료받자!', { sec: 3 });
};
refreshHud();

const battle = new Battle({ input, camera, say, sound, particles, confetti, party });
battle.speciesName = (id) => speciesById[id]?.name;
battle.getBalls = () => state.balls;
battle.onUseBall = (id) => { if ((state.balls[id] || 0) <= 0) return false; state.balls[id]--; refreshHud(); return true; };
battle.getBlocks = () => state.blocks;
battle.onBuyBall = (id) => { // 대결 중 그 자리에서 블록으로 넘버볼 만들기
  const b = BALL_BY_ID[id];
  if (!b || state.blocks < b.cost) return false;
  setBlocks(state.blocks - b.cost);
  if (myStack.mesh && battle.active) { myStack.mesh.visible = false; battle.hidden.push(myStack.mesh); } // 새로 만든 블록 더미는 대결이 끝날 때까지 숨긴다
  state.balls[id] = (state.balls[id] || 0) + 1;
  autosave();
  return true;
};
battle.onSwitched = (m) => attachLeader(m); // 대결 중 교체한 포켓몬이 대표가 된다
battle.thumb = (sp) => dex.thumbs(speciesById[sp.id] || sp)?.color || null; // (i) 카드의 그림은 도감 썸네일을 쓴다

// ---------- 내 포켓몬 (파티) ----------
// 대표 포켓몬 한 마리만 주인공 뒤(숫자블록 다음)를 따라다닌다. 나머지는 볼 안에(화면에 없음).
function attachLeader(member) {
  if (CAR_SPECIES.has(member.speciesId) && !state.carShown && zone) { state.carShown = true; setTimeout(() => say(`🚗 이상해꽃이 대표가 됐으니 ${CAR_NAME}를 부를 수 있어! 화면 위 🚗 버튼(C)을 눌러 봐.`, { sec: 7 }), 900); }
  const old = chain.find((f) => f.isLeader);
  if (old) { chain.remove(old.mesh); zone.scene.remove(old.mesh); }
  party.setLeader(member);
  const mesh = member.mesh;
  mesh.visible = true;
  mesh.rotation.set(0, 0, 0);
  mesh.scale.setScalar(partyScale(party.species(member)));
  const behind = myStack.mesh ? myStack.mesh.position : player.position;
  mesh.position.copy(behind).addScaledVector(camForward(), 1.8);
  mesh.position.y = terrainHeight(mesh.position.x, mesh.position.z);
  zone.scene.add(mesh);
  chain.insertAt(mesh, myStack.mesh ? 1 : 0, { isLeader: true });
  particles.stars(zone.scene, mesh.position.clone().add(new THREE.Vector3(0, 0.8, 0)), 10, new THREE.Color(party.color(member)).getHex(), 0.4);
  refreshHud();
}
function addStarter(speciesId) {
  const sp = speciesById[speciesId];
  const member = party.add(speciesId, buildDraftMesh(sp), { hp: sp.starterHp ?? sp.baseHp, atk: sp.starterAtk ?? sp.baseAtk });
  attachLeader(member);
  state.dex[speciesId] = (state.dex[speciesId] || 0) + 1;
  return member;
}
// 진화 연출: 도감을 닫고, 카메라가 포켓몬 앞으로 가서 빛나며 커졌다가 번쩍! 새 모습으로.
let evo = null; // { t, m, oldSp, sp, oldMesh, newMesh, wasLeader, stage }
const evoFlash = document.getElementById('evo-flash'), evoBanner = document.getElementById('evo-banner');
function evolveMember(m) {
  if (!party.canEvolve(m) || evo) return;
  state.goals.stats.evolved++; bump('evolve');
  const wasLeader = party.isLeader(m);
  const oldSp = party.species(m), oldMesh = m.mesh;
  const sp = party.evolve(m);
  const newMesh = buildDraftMesh(sp);
  m.mesh = newMesh;
  state.dex[sp.id] = (state.dex[sp.id] || 0) + 1;
  dex.hide();
  // 무대: 주인공 앞
  const stage = player.position.clone().addScaledVector(camForward(), 2.6);
  stage.y = terrainHeight(stage.x, stage.z);
  if (wasLeader && oldMesh) { chain.replace(oldMesh, newMesh); zone.scene.remove(oldMesh); }
  if (!oldMesh) { m.mesh = newMesh; newMesh.position.copy(stage); zone.scene.add(newMesh); evoBanner.classList.add('hidden'); return; } // 모습이 없던 멤버는 연출 없이 바로
  oldMesh.visible = true; oldMesh.scale.setScalar(partyScale(oldSp));
  oldMesh.position.copy(stage); oldMesh.rotation.set(0, Math.atan2(player.position.x - stage.x, player.position.z - stage.z), 0);
  zone.scene.add(oldMesh);
  newMesh.visible = false; newMesh.position.copy(stage); newMesh.rotation.copy(oldMesh.rotation); newMesh.scale.setScalar(0.001);
  zone.scene.add(newMesh);
  evo = { t: 0, m, oldSp, sp, oldMesh, newMesh, wasLeader, stage, flashed: false };
  evoBanner.innerHTML = `${josa(oldSp.name, '이가')} 진화한다…!`;
  evoBanner.classList.remove('hidden');
  sound.click();
}
function updateEvolution(dt) {
  const e = evo; e.t += dt;
  const T = e.t, up = new THREE.Vector3(0, 0.9, 0);
  // 카메라: 무대의 앞·옆에서 비스듬히 (주인공이 뒤에 겹쳐 보이지 않게)
  const fwd = camForward(), right = new THREE.Vector3(-fwd.z, 0, fwd.x);
  const camTo = e.stage.clone().addScaledVector(fwd, 2.4).addScaledVector(right, 3.4); camTo.y = e.stage.y + 1.5;
  camera.position.lerp(camTo, 1 - Math.exp(-dt * 4));
  camera.lookAt(e.stage.x, e.stage.y + 0.9, e.stage.z);
  if (T < 2.2) { // 1) 빛나며 떨림 + 커졌다 작아졌다
    const s = (e.oldSp.scale || 1) * (1 + Math.sin(T * 9) * 0.08 + T * 0.1);
    e.oldMesh.scale.setScalar(s);
    e.oldMesh.rotation.y += dt * (1 + T * 2);
    if (Math.random() < 0.5) particles.stars(zone.scene, e.stage.clone().add(up).add(new THREE.Vector3((Math.random() - 0.5) * 1.5, Math.random() * 1.2, (Math.random() - 0.5) * 1.5)), 2, 0xffffff, 0.35);
    evoFlash.style.opacity = String(Math.min(0.85, T / 2.2 * 0.6));
  } else if (!e.flashed) { // 2) 번쩍! 모습 바꾸기
    e.flashed = true;
    evoFlash.style.opacity = '1';
    e.oldMesh.visible = false; zone.scene.remove(e.oldMesh);
    e.newMesh.visible = true;
    sound.fanfare();
    evoBanner.innerHTML = `✨ ${josa(e.sp.name, '으로')} 진화했다! ✨<small>공격 ${e.m.atk} · 체력 ${e.m.maxHp}</small>`;
  } else if (T < 4.2) { // 3) 새 모습이 커지며 등장, 색종이
    const k = Math.min(1, (T - 2.2) / 0.8);
    const back = 1 + 2.7 * Math.pow(k - 1, 3) + 1.7 * Math.pow(k - 1, 2);
    e.newMesh.scale.setScalar(Math.max(0.001, partyScale(e.sp) * back));
    e.newMesh.rotation.y += dt * 1.5 * (1 - k);
    evoFlash.style.opacity = String(Math.max(0, 1 - (T - 2.2) * 2));
    if (T - 2.2 < 0.1) confetti.burst(220);
    if (Math.random() < 0.3) particles.stars(zone.scene, e.stage.clone().add(up), 3, new THREE.Color(party.color(e.m)).getHex(), 0.5);
  } else { // 끝: 원래 자리로
    evoFlash.style.opacity = '0';
    evoBanner.classList.add('hidden');
    e.newMesh.scale.setScalar(partyScale(e.sp));
    if (e.wasLeader) attachLeader(e.m); else zone.scene.remove(e.newMesh);
    say(`축하해! ${josa(e.oldSp.name, '이가')} ${josa(e.sp.name, '으로')} 진화했어! 공격 ${e.m.atk}, 체력 ${e.m.maxHp}!`, { sec: 7 });
    refreshHud(); autosave();
    snapCam = true;
    evo = null;
  }
}
dex.bindParty({
  party,
  getBlocks: () => state.blocks,
  getMegaBlocks: () => state.megaBlocks,
  getProgress: () => ({ caught: state.caught, total: totalCreatures, rescued: state.rescued, conquered: Object.keys(state.conquered).length, zones: ZONE_COUNT }), // 친구·구출·정복 진행은 도감에서 본다
  getConquered: () => state.conquered,
  getZoneName: () => zone?.name,
  onUpgrade: (m, stat) => {
    if (party.atCap(m, stat)) { const e = party.species(m).evolution; say(e ? `${party.name(m)}의 ${stat === 'atk' ? '공격' : '체력'}은 여기까지야! 진화하면 더 키울 수 있어.` : `${party.name(m)}의 ${stat === 'atk' ? '공격' : '체력'}은 최대치야! 더는 안 올라가.`, { sec: 5 }); return; }
    const cost = party.upgradeCost(m, stat);
    if (state.blocks < cost) { say(`블록이 ${cost}개 필요해! 블록을 줍거나 대결에서 이겨서 모으자.`); return; }
    const n = 1;
    party.upgrade(m, stat);
    setBlocks(state.blocks - cost);
    sound.pickup();
    const next = party.nextSkill(m);
    const just = stat === 'atk' && party.skills(m).length && party.skills(m)[party.skills(m).length - 1].atk > m.atk - n;
    if (just && party.skills(m).length > 1) { const s = party.skills(m)[party.skills(m).length - 1]; sound.fanfare(); say(`${josa(party.name(m), '이가')} 새 기술 ${josa(s.name, '을를')} 배웠어!`, { sec: 5 }); }
    else if (party.canEvolve(m) && !m.evolveTold) { m.evolveTold = true; say(`${josa(party.name(m), '이가')} 진화할 수 있어! ✨ 진화! 버튼을 눌러봐.`, { sec: 6 }); }
    else say(stat === 'atk' ? `${party.name(m)} 공격 ${m.atk}!` : `${party.name(m)} 체력 ${m.maxHp}!`, { sec: 2, faceImg: dex.thumbs(party.species(m))?.color || null });
    refreshHud();
  },
  typeInfo: (type) => ({ strong: strongAgainst(type), weak: weakTo(type) }),
  evolveZone: (type) => evolveZoneOf(type),
  getBalls: () => state.balls,
  onBuyBall: (id) => {
    const b = BALL_BY_ID[id];
    if (!b) return;
    if (state.blocks < b.cost) { say(`${b.name}은 블록 ${b.cost}개가 필요해!`); return; }
    setBlocks(state.blocks - b.cost);
    state.balls[id] = (state.balls[id] || 0) + 1;
    sound.pickup();
    say(`${b.name} 1개를 만들었어! 이제 ${state.balls[id]}개.`, { sec: 3 });
    refreshHud();
    autosave();
  },
  onLeader: (m) => { if (party.isFainted(m)) { say(`${josa(party.name(m), '은는')} 기절했어. 오박사님께 치료받아야 대표가 될 수 있어.`); return; } attachLeader(m); sound.click(); say(`${josa(party.name(m), '이가')} 대표 포켓몬이 됐어! 이제 ${josa(party.name(m), '이가')} 싸워.`, { sec: 4, faceImg: dex.thumbs(party.species(m))?.color || null }); },
  onEvolve: (m) => evolveMember(m),
});

// ---------- 카메라 시야: 건물·바위산이 주인공을 가리지 않게 ----------
// solid 구조물(연구소·집·불의산 입구 바위)은 카메라를 그 앞으로 당기고, 나무·바위 같은 장식은 사이에 끼면 잠시 숨긴다.
const hiddenByCam = new Set();
function resolveCamera(target) {
  const head = player.position.clone(); head.y += 1;
  const dir = target.clone().sub(head); const len = dir.length(); dir.divideScalar(len || 1);
  let maxT = len;
  for (const o of hiddenByCam) { o.visible = true; } hiddenByCam.clear();
  const tmp = new THREE.Vector3();
  for (const o of zone.world.decor?.children || []) {
    if (o.isInstancedMesh || !o.position) continue;
    if (o.userData.noHide || (o.geometry && (o.geometry.type === 'PlaneGeometry' || o.geometry.type === 'CircleGeometry') && Math.abs(Math.abs(o.rotation.x) - Math.PI / 2) < 0.05)) continue; // 바닥·러그처럼 납작하게 깔린 것은 절대 숨기지 않는다 (연구실 바닥이 깜빡이던 원인)
    const r = o.userData.solid ? o.userData.radius : (o.userData.radius || 2.4);
    tmp.subVectors(o.position, head);
    const t = tmp.dot(dir); // 시선 위의 가장 가까운 점
    if (t < -r || t > len + r) continue;
    const d = tmp.clone().addScaledVector(dir, -Math.max(0, Math.min(len, t))).setY(0).length();
    if (d > r) continue;
    if (o.userData.solid) {
      let enter;
      if (o.userData.box) { // 건물 모양 상자: 시선을 따라가며 상자에 들어가는 지점을 찾는다 (회전 고려)
        const { hx, hz } = o.userData.box, c = Math.cos(-o.rotation.y), sn = Math.sin(-o.rotation.y);
        enter = len;
        for (let s = 0; s <= len; s += 0.4) {
          const px = head.x + dir.x * s - o.position.x, pz = head.z + dir.z * s - o.position.z;
          const lx = px * c - pz * sn, lz = px * sn + pz * c;
          if (Math.abs(lx) < hx + 0.5 && Math.abs(lz) < hz + 0.5) { enter = s - 0.5; break; }
        }
      } else { // 구(반지름 r)에 들어가는 지점 앞에서 멈춘다
        const under = Math.sqrt(Math.max(0, r * r - d * d));
        enter = t - under - 0.6;
      }
      if (enter < maxT) maxT = Math.max(2.6, enter);
    } else if (t > 0.8 && t < len && o.visible) { o.visible = false; hiddenByCam.add(o); }
  }
  if (maxT < len) return head.addScaledVector(dir, maxT);
  return target;
}

// ---------- 지역 이동 ----------
const fadeEl = document.getElementById('fade');
let switching = false;
let snapCam = true; // 다음 프레임에 카메라를 주인공 뒤 제자리로 바로 옮긴다 (시작 직후, 대결 직후)
function partyMeshes() { return [player.group, ...chain.followers.map((f) => f.mesh)]; }
function applyZoneEnv() {
  zone.world.setWhirlOpen?.(!!state.conquered[zone.name]); // 물의길 소용돌이: 거북왕을 이겼으면 열린 모습으로 (src/sea.js)
  player.lamp.intensity = zone.world.dark ? (state.glow ? 13 : 8) : 0;
  player.gravityScale = zone.world.gravity || 1;
  player.swim = zone.world.swim || null;  // 심해에서는 점프 버튼으로 헤엄친다
  chain.swim = !!zone.world.swim;         // 따라오는 친구들도 함께 떠오른다
}
function switchZone(name, spawn, message) {
  warpBtn.classList.add('hidden'); warpNpc = null; // 지역이 바뀌면 안내원 대화도 끝
  boardBtn.classList.add('hidden'); boardNpc = null;
  ufoBtn.classList.add('hidden'); ufoNpc = null;
  if (switching || !BUILDERS[name]) return;
  if (driving && !CAR_ZONE_OK(name)) dismountCar({ park: false }); // 심해·꿀벌집·연구소에는 차를 못 가져간다
  if (sailing || parked || goingHome) { // 다른 지역으로 가면 배와 루피는 선착장 제자리로
    const b = boatHere(), npc = sailorNpc(), home = zone.world.sailorHome;
    sailing = false; returning = null; parked = null; goingHome = null; player.boat = null; input.enabled = true;
    if (b) { b.mesh.userData.sailing = false; b.mesh.position.copy(b.base); b.mesh.rotation.set(0, 0, 0); }
    if (npc && home) { npc.mesh.position.set(home.x, home.y, home.z); npc.mesh.rotation.y = Math.PI; npc.x = home.x; npc.z = home.z; }
    for (const f of chain.followers) f.mesh.visible = true;
  }
  switching = true;
  fadeEl.classList.add('on');
  sound.portal();
  setTimeout(() => {
    const from = zone;
    zone = getZone(name); // 처음 가는 지역은 여기서(페이드 중) 만들어진다
    setActiveTerrain(zone.terrain);
    if (state.conquered[zone.name]) revealShrine(zone, true); // 정복한 지역에 오면 성역은 이미 떠 있다
    for (const m of partyMeshes()) { from.scene.remove(m); zone.scene.add(m); }
    player.teleport(spawn.x, spawn.z);
    if (spawn.yaw !== undefined) cam.yaw = spawn.yaw; // 도착 방향이 정해진 곳(연구소 문 앞 등)
    for (const f of chain.followers) { f.mesh.position.set(spawn.x + rand(-1, 1), terrainHeight(spawn.x, spawn.z), spawn.z + 1.5 + rand(0, 1)); }
    if (state.blocks > 0) setBlocks(state.blocks, { quiet: true, mission: false }); // 블록 더미를 새 지역 색(불·물·풀·형광)으로 다시 만든다
    state.goals.stats.zones[name] = true; bump('zones', name); // 오늘의 미션 "다른 지역 가 보기" · 스티커 "여행자"
    applyZoneEnv();
    camera.position.copy(player.position).add(camOffset());
    snapCam = true;
    showZoneBanner(zone.label);
    bgmRefresh(); // 지역마다 다른 곡
    if (message) say(message.text, message);
    refreshHud();
    autosave();
    setTimeout(() => { fadeEl.classList.remove('on'); switching = false; }, 150);
  }, 480);
}

// 타는 것: 기차(푸른숲 ↔ 물의길), 로켓(푸른숲 ↔ 꿈의우주). 주인공과 친구들을 숨기고 탈것을 움직인 뒤 지역을 바꾼다.
// 각 지역 world 의 train / rocket 에 { kind, mesh, base, boardPoint, to, dir?, flame? } 가 있다.
const RIDE_MSG = {
  sea: '물의길에 도착! 다리로 섬을 건너고, 동쪽 선착장에서 배를 타면 먼바다의 포켓몬도 만날 수 있어. 돌아갈 땐 기차역에서 E!',
  space: '꿈의우주에 도착! 중력이 약해서 높이 뛸 수 있어. 화면을 위로 밀어 하늘의 태양과 행성들도 봐! 돌아갈 땐 로켓에서 E!',
  forest: '푸른숲으로 돌아왔어!',
};
let ride = null;
function vehiclesHere() { return [zone.world.train, zone.world.rocket, zone.world.ufo].filter(Boolean); }

// ---------- 배 타기 (물의길): 선착장에서 배를 타고 바다를 돌아다닌다 ----------
// 배를 타면 주인공이 배 위에 서고, 물 위만 갈 수 있게 된다(뭍에서 막힘). 따라오던 친구들은 잠시 배웅.
let sailing = false, returning = null;   // returning: 루피가 배를 몰아 선착장으로 돌아가는 중
let parked = null, goingHome = null;     // parked: 배가 뭍에 대어 기다리는 중, goingHome: 빈 배가 선착장으로 스스로 돌아가는 중
const PARK_WAIT = 100;                   // 뭍에 댄 배가 기다려 주는 시간(초)
function boatHere() { return zone.world.boat || null; }
function sailorNpc() { return (zone.world.npcs || []).find((n) => n.sails) || null; }
/** 배 위에서 루피가 서는 자리 (조타륜 옆). 뱃머리(가는 방향)를 바라본다 */
function placeSailorOnBoat() {
  const b = boatHere(), npc = sailorNpc();
  if (!b || !npc) return;
  const yaw = b.mesh.rotation.y, ox = -1.3, oz = 0.8;   // 선실 앞 조타륜 옆
  const c = Math.cos(yaw), sn = Math.sin(yaw);
  const x = b.mesh.position.x + c * ox + sn * oz, z = b.mesh.position.z - sn * ox + c * oz;
  npc.mesh.position.set(x, b.mesh.position.y + (b.deckY ?? 0.5), z);
  npc.mesh.rotation.y = yaw + Math.PI / 2; // 뱃머리는 배의 +x 쪽
  npc.x = x; npc.z = z;                            // 배 위에서도 말을 걸 수 있게 위치를 따라 옮긴다
}
function boardBoat() {
  const b = boatHere();
  if (!b || sailing || battle.active || ride || switching || goingHome) return;
  dismountCar({ park: false }); // 배를 탈 때 차는 두고 간다
  parked = null;
  const surface = waterLevel() ?? 0;
  sailing = true;
  b.mesh.userData.sailing = true;
  b.mesh.rotation.z = 0;
  player.boat = { canGo: canSail, floorY: surface + (b.deckY ?? 0.5), speed: 8.5, boost: 2.1 }; // 갑판 높이에 서고, 가속하면 두 배 넘게 빨라진다
  player.position.set(b.mesh.position.x, surface + (b.deckY ?? 0.5), b.mesh.position.z);
  player.vx = player.vz = player.vy = 0;
  for (const f of chain.followers) f.mesh.visible = false; // 물 위를 걸을 수는 없으니 잠시 쉰다
  placeSailorOnBoat();
  sound.portal();
  say('루피와 함께 배를 탔어! 조이스틱으로 몰고 "가속"을 누르면 빨라져. 돌아갈 땐 루피에게 말을 걸어!', { sec: 8 });
}
/** 루피가 배를 몰아 선착장으로 돌아간다 (자동) */
function startReturn() {
  if (!sailing || returning) return;
  const d = zone.world.dock;
  returning = { to: { x: d.x + 3.4, z: d.z }, t: 0 };
  input.enabled = false;
  sound.portal();
  say('루피: 좋아, 선착장으로 돌아가자! 꽉 잡아!', { sec: 5, faceImg: npcFace(sailorNpc()) });
}
function updateReturn(dt) {
  const p = player.position, to = returning.to;
  returning.t += dt;
  const dx = to.x - p.x, dz = to.z - p.z, dist = Math.hypot(dx, dz);
  if (dist < 2.4 || returning.t > 25) { leaveBoat(); return; }
  const step = Math.min(dist, 20 * dt);            // 돌아갈 땐 빠르게
  p.x += (dx / dist) * step; p.z += (dz / dist) * step;
  player.facing = Math.atan2(dx, dz);
  player.group.rotation.y = player.facing;
}
/** 배에서 내린다. keepBoat 이면 배는 그 자리에서 기다린다(루피도 함께 내린다) */
function leaveBoat(keepBoat = false) {
  const b = boatHere();
  if (!b || !sailing) return;
  const spot = keepBoat ? (landingSpot() || dockLanding()) : dockLanding();
  sailing = false; returning = null;
  input.enabled = true;
  b.mesh.userData.sailing = false;
  player.boat = null;
  player.teleport(spot.x, spot.z);
  const npc = sailorNpc();
  if (keepBoat) {                                   // 배는 여기서 기다리고, 루피도 함께 내린다
    b.mesh.rotation.z = 0;
    parked = { timer: PARK_WAIT, told: false };
    if (npc) {
      const sx = spot.x + rand(-1.6, 1.6), sz = spot.z + rand(1.2, 2.2);
      npc.mesh.position.set(sx, terrainHeight(sx, sz), sz);
      npc.mesh.rotation.y = Math.atan2(spot.x - sx, spot.z - sz);
      npc.x = sx; npc.z = sz;
    }
    say('뭍에 내렸어! 배는 여기서 기다려 줘. 다시 타려면 루피에게 말을 걸어.', { sec: 7 });
  } else {                                          // 선착장 복귀: 배도 루피도 제자리로
    parked = null;
    b.mesh.position.copy(b.base);
    b.mesh.rotation.set(0, 0, 0);
    const home = zone.world.sailorHome;
    if (npc && home) { npc.mesh.position.set(home.x, home.y, home.z); npc.mesh.rotation.y = Math.PI; npc.x = home.x; npc.z = home.z; }
    say('선착장에 돌아왔어! 또 타고 싶으면 루피에게 말을 걸어.', { sec: 5 });
  }
  for (const f of chain.followers) { f.mesh.visible = true; f.mesh.position.set(spot.x + rand(-1.2, 1.2), terrainHeight(spot.x, spot.z), spot.z + rand(1, 2)); }
  sound.portal();
}
/** 기다리던 빈 배가 루피를 태우고 스스로 선착장으로 돌아간다 */
function sendBoatHome() {
  const b = boatHere();
  parked = null;
  if (!b) return;
  goingHome = { t: 0 };
  const npc = sailorNpc();
  if (npc) { npc.x = b.mesh.position.x; npc.z = b.mesh.position.z; } // 루피는 배를 타고 간다
  say('루피: 배를 선착장에 갖다 놓을게! 또 타고 싶으면 선착장으로 오렴.', { sec: 6, faceImg: npc ? npcFace(npc) : null });
}
function updateGoingHome(dt) {
  const b = boatHere();
  if (!b) { goingHome = null; return; }
  const m = b.mesh, to = b.base;
  const dx = to.x - m.position.x, dz = to.z - m.position.z, dist = Math.hypot(dx, dz);
  goingHome.t += dt;
  if (dist < 1.2 || goingHome.t > 30) {            // 도착: 배와 루피를 제자리로
    m.position.copy(to); m.rotation.set(0, 0, 0);
    const npc = sailorNpc(), home = zone.world.sailorHome;
    if (npc && home) { npc.mesh.position.set(home.x, home.y, home.z); npc.mesh.rotation.y = Math.PI; npc.x = home.x; npc.z = home.z; }
    goingHome = null;
    return;
  }
  const step = Math.min(dist, 16 * dt);
  m.position.x += (dx / dist) * step; m.position.z += (dz / dist) * step;
  m.rotation.y = Math.atan2(dx, dz) - Math.PI / 2;
  placeSailorOnBoat();
}
/** 배에서 내릴 수 있는 가장 가까운 뭍. 없으면 null. (찾기가 무거워서 0.3초마다만 다시 센다)
 *  섬 둘레에는 배가 못 들어가는 얕은 턱이 있는데, 큰 섬일수록 이 턱이 넓다.
 *  거북왕 섬(가장 크고 높다)은 턱이 10m가 넘어서, 예전 기준(땅 높이 0.6 위)으로는 배를 아무리 붙여도
 *  내릴 곳을 못 찾아 "내리기" 버튼이 아예 안 떴다. 물 위로 나온 모래밭(0.2 위, 수면은 -0.35)까지
 *  내릴 곳으로 치고, 방향도 촘촘히(24방향) 돌면서 그 고리에서 가장 안쪽(가장 높은) 자리를 고른다. */
const landCache = { t: -1, spot: null };
const LAND_Y = 0.2;   // 이만큼 솟았으면 물 밖으로 나온 마른 모래밭이다
function landingSpot(now = 0) {
  if (now && now - landCache.t < 0.3) return landCache.spot;
  landCache.t = now;
  const p = player.position;
  landCache.spot = null;
  for (let r = 4; r <= 10 && !landCache.spot; r += 2) {   // 가까운 고리부터 둘레를 돌며 걸어 다닐 수 있는 모래밭을 찾는다
    let best = null;
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 12) {
      const x = p.x + Math.cos(a) * r, z = p.z + Math.sin(a) * r;
      const h = terrainHeight(x, z);                      // 가장 싼 검사부터 (트인 바다에서는 여기서 거의 다 걸러진다)
      if (h <= LAND_Y || (best && h <= best.h)) continue;
      if (isBlocked(x, z) || insideObstacle(x, z, 0.8)) continue;
      best = { x, z, h };
    }
    if (best) landCache.spot = { x: best.x, z: best.z };
  }
  return landCache.spot;
}
/** 선착장 앞 (배에서 내리는 기본 자리) */
function dockLanding() {
  const d = zone.world.dock;
  return d ? { x: +(d.x - 1.5).toFixed(1), z: +d.z.toFixed(1) } : { x: +zone.world.spawn.x.toFixed(1), z: +zone.world.spawn.z.toFixed(1) };
}
/** 이 탈것을 태워 주는 안내원 (기차는 리리, 로켓은 코리) */
function rideNpc(v) { return (zone.world.npcs || []).find((n) => n.boards === v.kind) || null; }
function startRide(v) {
  if (ride || switching) return;
  dismountCar({ park: false });
  const npc = rideNpc(v);
  ride = { v, t: 0, from: zone.name, switched: false, puff: 0, npc, npcHome: npc ? { x: npc.x, z: npc.z, y: npc.mesh.position.y, rot: npc.mesh.rotation.y } : null };
  for (const m of partyMeshes()) m.visible = false;
  if (v.flame) v.flame.visible = true;
  sound.portal();
  const dest = ZONE_INFO[v.to]?.name || v.to;
  say(v.kind === 'train' ? `칙칙폭폭! ${josa(dest, '으로')} 출발!` : `3, 2, 1, 발사! ${josa(dest, '으로')}!`, { sec: 4 });
}
function updateRide(dt) {
  if (ride.kind === 'ufo') return updateUfoRide(dt);
  const r = ride, v = r.v, m = v.mesh;
  r.t += dt;
  const here = zone.name === r.from;
  if (v.kind === 'train') {
    m.position.x = v.base.x + (v.dir || -1) * r.t * r.t * 3.5; // 점점 빨리
    r.puff -= dt;
    if (r.puff <= 0 && here) { r.puff = 0.12; particles.stars(zone.scene, m.position.clone().add(new THREE.Vector3(1.6, 3.9, 0)), 2, 0xf4f4f8, 0.5); }
  } else {
    m.position.y = v.base.y + r.t * r.t * 6; // 위로 점점 빨리
    m.rotation.z = Math.sin(r.t * 20) * 0.01;
    r.puff -= dt;
    if (r.puff <= 0 && here) { r.puff = 0.06; particles.stars(zone.scene, v.base.clone().add(new THREE.Vector3(rand(-1.5, 1.5), 0.5, rand(-1.5, 1.5))), 3, 0xffb347, 0.7); }
  }
  if (here && r.npc) { // 안내원도 함께 타고 간다 (기차 옆자리 / 로켓 안)
    const n = r.npc;
    n.mesh.position.set(m.position.x + (v.kind === 'train' ? -1.6 : 0), m.position.y + (v.kind === 'train' ? 1.1 : 1.6), m.position.z + (v.kind === 'train' ? 0.9 : 0));
    n.mesh.rotation.y = v.kind === 'train' ? (v.dir || -1) > 0 ? Math.PI / 2 : -Math.PI / 2 : 0;
    n.x = n.mesh.position.x; n.z = n.mesh.position.z;
  }
  if (here) {
    const target = m.position.clone().add(camOffset());
    camera.position.lerp(target, 0.15);
    camera.lookAt(m.position.x, m.position.y + 1.5, m.position.z);
  }
  if (r.t > 2.4 && !r.switched) {
    r.switched = true;
    const dest = getZone(v.to);
    const spawn = dest.world.arrivals?.[r.from] || dest.world.spawn;
    switchZone(v.to, spawn, { text: RIDE_MSG[v.to] || `${dest.label}에 도착!`, sec: 8 });
  }
  if (r.t > 3.3) {
    m.position.copy(v.base);
    m.rotation.z = 0;
    if (r.npc && r.npcHome) { // 안내원은 제 자리(플랫폼)로 돌아와 다음 손님을 기다린다
      const h = r.npcHome;
      r.npc.mesh.position.set(h.x, h.y, h.z); r.npc.mesh.rotation.y = h.rot;
      r.npc.x = h.x; r.npc.z = h.z;
    }
    if (v.flame) v.flame.visible = false;
    for (const o of partyMeshes()) o.visible = true;
    ride = null;
    snapCam = true;
  }
}

// ---------- 숫자블록 퀴즈 (랜덤 출몰 + 문제 풀기) ----------
// 지역마다 가끔 숫자블록 친구가 랜덤한 곳에 나타나 퀴즈를 낸다. 가까이 가서 퀴즈 풀기 버튼을 누르면 문제가 나오고,
// 맞히면 그 숫자만큼 블록이 내 숫자블록에 합쳐진다. 120초 안에 못 구하면 다른 곳으로 가 버린다.
function dirWord(dx, dz) {
  const a = Math.atan2(dx, -dz); // 북(-z)=0
  const names = ['북', '북동', '동', '남동', '남', '남서', '서', '북서'];
  return names[Math.round(((a + Math.PI * 2) % (Math.PI * 2)) / (Math.PI / 4)) % 8];
}
// NPC와 이야기: 힌트를 한 줄씩 돌아가며 말해 준다. 오박사(heal)는 포켓몬을 모두 치료하고,
// 지역 안내원(warp)과 이야기하는 동안은 대화 버튼 위에 "연구소 가기" 버튼이 켜진다.
const boardBtn = document.getElementById('btn-board');
let boardNpc = null;
boardBtn.onclick = () => {
  const npc = boardNpc;
  boardBtn.classList.add('hidden');
  if (npc) npc.talking = false;
  boardNpc = null;
  if (!npc) return;
  if (npc.sails) { sailing ? startReturn() : boardBoat(); return; } // 루피: 배 타기 / 선착장 복귀
  const v = zone.world[npc.boards];
  if (!v) return;
  if (v.kind === 'ufo') { if (v.to) startUfoRide(v.to); else openPlanetPopup(); return; } // 손오공: 행성에서는 꿈의우주로 돌아가고, 우주에서는 행성 고르기 팝업
  startRide(v);
};
const warpBtn = document.getElementById('btn-warp');
let warpNpc = null; // 지금 이야기 중인, 연구소로 데려다줄 수 있는 NPC
warpBtn.onclick = () => {
  const npc = warpNpc; if (!npc) return;
  warpBtn.classList.add('hidden'); npc.talking = false; warpNpc = null;
  state.returnTo = { zone: zone.name, spawn: { x: npc.x + 1.5, z: npc.z + 1.5 } };
  goToLab(`${josa(npc.name, '이가')} 연구소로 데려다줬어! 오박사님께 치료받고, 워프 패드로 돌아가자.`, npcFace(npc));
};
// ----- UFO (손오공): 행성 고르기 팝업과 비행접시 타기 -----
// 꿈의우주 UFO 정거장의 손오공에게 말을 걸면 "다른 행성으로 가기" 버튼이 켜지고, 누르면 화면 가운데 팝업에서
// 태양·수성·금성·지구·화성·목성·토성·천왕성·해왕성·명왕성을 ◀ ▶ 로 넘겨 보며 그림·설명·사는 포켓몬을 읽고 오른쪽 "출발!" 로 간다.
// 행성의 손오공은 빨간 "꿈의우주로 돌아가기"와 보라 "다른 행성으로 가기" 버튼을 켜 준다.
const ufoBtn = document.getElementById('btn-ufo');
let ufoNpc = null;
/** 행성 이름 뒤에 붙는 '로/으로' (받침이 없거나 ㄹ 받침이면 '로': 지구로, 태양으로, 수성으로) */
function ro(word) { const code = word.charCodeAt(word.length - 1) - 0xac00; if (code < 0 || code > 11171) return `${josa(word, '으로')}`; const jong = code % 28; return word + (jong === 0 || jong === 8 ? '로' : '으로'); }
ufoBtn.onclick = () => { ufoBtn.classList.add('hidden'); boardBtn.classList.add('hidden'); if (ufoNpc) ufoNpc.talking = false; ufoNpc = null; boardNpc = null; openPlanetPopup(); };
const planetEl = document.getElementById('planet-modal');
const planetArt = document.getElementById('planet-art'), planetName = document.getElementById('planet-name'), planetSub = document.getElementById('planet-sub'), planetPos = document.getElementById('planet-pos'), planetDesc = document.getElementById('planet-desc'), planetPokes = document.getElementById('planet-pokes'), planetGo = document.getElementById('btn-planet-go');
let planetOpen = false, planetIdx = 0;
function openPlanetPopup() {
  if (!zone || ride || switching || battle.active) return;
  planetOpen = true;
  const here = PLANETS.findIndex((p) => p.zone === zone.name);
  planetIdx = here >= 0 ? here : 0; // 행성에 있으면 그 행성부터, 우주에서는 태양부터
  renderPlanet();
  planetEl.classList.remove('hidden');
  sound.click();
}
function closePlanetPopup() { planetOpen = false; planetEl.classList.add('hidden'); }
function renderPlanet() {
  const p = PLANETS[planetIdx], info = ZONE_INFO[p.zone] || {};
  planetArt.innerHTML = planetSvg(p);
  planetName.textContent = `${p.emoji} ${p.name}`;
  planetSub.textContent = p.title;
  planetPos.textContent = `${planetIdx + 1} / ${PLANETS.length} · ${planetIdx === 0 ? '태양계의 중심' : `태양에서 ${planetIdx}번째`}`;
  planetDesc.innerHTML = `<p>${p.desc}</p><p class="planet-fact">💡 ${p.fact}</p><div class="planet-stats"><span>📏 ${p.size}</span><span>📍 ${p.dist}</span><span>🪂 중력: ${p.gravityText}</span></div>`;
  const wild = [...(info.wild || []).map((id) => speciesById[id]).filter(Boolean), ...creatureData.creatures.filter((c) => c.zone === p.zone && c.unlockedBy)]; // 보스를 잡으면 나타나는 숨은 포켓몬도 함께
  planetPokes.innerHTML = `<div class="planet-poke-note">🐾 ${p.pokeNote}</div><div class="planet-poke-list">${wild.map((sp) => {
    const t = dex.thumbs(sp)?.color;
    return `<div class="planet-poke">${t ? `<img src="${t}" alt="">` : `<span class="planet-poke-dot" style="background:${sp.draftShape?.color || '#ccc'}"></span>`}<span>${sp.name}</span><small>${sp.type}</small></div>`;
  }).join('')}</div>`;
  const here = zone.name === p.zone;
  planetGo.disabled = here;
  planetGo.textContent = here ? '📍 지금 여기 있어' : `🛸 ${josa(p.name)} 출발!`;
}
document.getElementById('planet-prev').onclick = () => { planetIdx = (planetIdx + PLANETS.length - 1) % PLANETS.length; renderPlanet(); sound.click(); };
document.getElementById('planet-next').onclick = () => { planetIdx = (planetIdx + 1) % PLANETS.length; renderPlanet(); sound.click(); };
document.getElementById('btn-planet-close').onclick = () => { closePlanetPopup(); sound.click(); };
planetEl.addEventListener('click', (e) => { if (e.target === planetEl) closePlanetPopup(); });
planetGo.onclick = () => { const p = PLANETS[planetIdx]; if (zone.name === p.zone) return; startUfoRide(p.zone); };

// 비행접시 타기 연출: 빔에 빨려 올라간다(1초) → 돌면서 솟아 길게 늘어나 사라진다(2.9초, 도중에 하이퍼스페이스가 화면을 덮는다)
// → 지역 교체 → 도착지 정거장 위 높은 곳에서 내려앉는다(2.3초) → 빔으로 주인공과 친구들이 내려온다(0.8초)
const warp = new WarpFx(document.getElementById('warp'), document.getElementById('warp-canvas'), document.getElementById('warp-text'));
const UFO_T = { beam: 1.0, lift: 2.9, land: 2.3, drop: 0.8 };
function startUfoRide(to) {
  const v = zone?.world.ufo;
  if (!v || ride || switching || battle.active || !BUILDERS[to]) return;
  closePlanetPopup();
  dismountCar({ park: false });
  boardBtn.classList.add('hidden'); ufoBtn.classList.add('hidden'); boardNpc = null; ufoNpc = null;
  const meshes = partyMeshes();
  ride = { kind: 'ufo', v, t: 0, from: zone.name, to, switched: false, beamed: false, destInit: false, landT: 0, meshes, scales: meshes.map((m) => m.scale.clone()), ys: meshes.map((m) => m.position.y), targets: null, land: null };
  v.mesh.userData.riding = true;
  v.mesh.position.set(v.base.x, v.base.y + 1.0, v.base.z);
  v.mesh.rotation.set(0, 0, 0);
  if (v.beam) v.beam.visible = true;
  sound.portal();
  const dest = PLANET_BY_ZONE[to];
  say(dest ? `🛸 ${josa(dest.name)} 출발! 꽉 잡아!` : '🛸 꿈의우주로 돌아가자! 꽉 잡아!', { sec: 3 });
}
const UFO_COLORS = [0xff5c8a, 0xffd93d, 0x6cff8a, 0x66e0ff];
function updateUfoRide(dt) {
  const r = ride, v = r.v, m = v.mesh;
  r.t += dt;
  const T = r.t;
  if (!r.switched) { // ---- 출발지 ----
    if (T < UFO_T.beam) { // 빔으로 빨려 올라간다: 작아지며 돌면서 비행접시 배 쪽으로
      const k = T / UFO_T.beam;
      r.meshes.forEach((o, i) => {
        o.position.x += (m.position.x - o.position.x) * Math.min(1, dt * 4);
        o.position.z += (m.position.z - o.position.z) * Math.min(1, dt * 4);
        o.position.y = r.ys[i] + k * k * (m.position.y - r.ys[i]);
        o.scale.copy(r.scales[i]).multiplyScalar(Math.max(0.02, 1 - k));
        o.rotation.y += dt * 6;
      });
      if (Math.random() < 0.7) particles.stars(zone.scene, new THREE.Vector3(m.position.x + rand(-1.2, 1.2), m.position.y - rand(0.5, 3.5), m.position.z + rand(-1.2, 1.2)), 1, 0x9fe8ff, 0.3);
    } else { // 이륙: 돌면서 점점 빨리 솟고, 끝에는 길게 늘어나며 사라진다
      if (!r.beamed) { r.beamed = true; for (const o of r.meshes) o.visible = false; if (v.beam) v.beam.visible = false; sound.portal(); }
      const u = T - UFO_T.beam;
      m.position.y = v.base.y + 1.0 + u * u * 7;
      m.rotation.y += dt * (2 + u * 5);
      m.rotation.z = Math.sin(T * 6) * 0.05 * Math.min(1, u);
      const st = Math.max(0, u - 1.3);
      m.scale.set(Math.max(0.2, 1 - st * 0.8), 1 + st * 2.2, Math.max(0.2, 1 - st * 0.8));
      m.userData.glow.intensity = 2.5 + u * 4;
      if (Math.random() < 0.8) particles.stars(zone.scene, m.position.clone().add(new THREE.Vector3(rand(-1.5, 1.5), -0.5, rand(-1.5, 1.5))), 2, UFO_COLORS[Math.floor(Math.random() * 4)], 0.45);
      if (u > 1.2 && !warp.on) { const d = PLANET_BY_ZONE[r.to]; warp.start(`🛸 ${josa(d ? d.name : (ZONE_INFO[r.to]?.name || '꿈의우주'), '으로')} 이동 중…`, d?.tint || '#c38bff'); }
    }
    camera.position.lerp(m.position.clone().add(camOffset()), 0.12);
    camera.lookAt(m.position.x, m.position.y + 1, m.position.z);
    if (T > UFO_T.beam + UFO_T.lift - 0.4 && !switching) { // 하이퍼스페이스가 화면을 덮은 뒤 지역을 바꾼다. 출발지 비행접시는 제자리로
      r.switched = true;
      r.meshes.forEach((o, i) => o.scale.copy(r.scales[i]));
      m.position.copy(v.base); m.position.y = v.base.y + 1.0; m.rotation.set(0, 0, 0); m.scale.setScalar(1); m.userData.riding = false; m.userData.glow.intensity = 2.5;
      const dest = getZone(r.to);
      switchZone(r.to, dest.world.ufoArrival || dest.world.arrivals?.[r.from] || dest.world.spawn, null);
    }
    return;
  }
  if (zone.name !== r.to) return; // 페이드 중 (아직 지역이 안 바뀌었다)
  const dv = zone.world.ufo;
  if (!dv) { finishUfoRide(); return; }
  const dm = dv.mesh;
  if (!r.destInit) { // 도착지: 비행접시를 정거장 위 높은 곳에 두고, 주인공과 친구들은 숨긴 채 비행접시 안에
    r.destInit = true; r.landT = T;
    r.land = { x: player.position.x, z: player.position.z };
    r.meshes = partyMeshes(); r.scales = r.meshes.map((o) => o.scale.clone());
    r.targets = r.meshes.map((o, i) => ({ x: r.land.x + (i ? rand(-1.5, 1.5) : 0), z: r.land.z + (i ? 1.2 + rand(0, 1.5) : 0) }));
    for (const o of r.meshes) { o.visible = false; o.position.x = dv.base.x; o.position.z = dv.base.z; }
    dm.userData.riding = true; dm.rotation.set(0, 0, 0); dm.scale.set(0.3, 2.5, 0.3);
    dm.position.set(dv.base.x, dv.base.y + 48, dv.base.z);
  }
  const u = T - r.landT;
  if (u < UFO_T.land) { // ---- 내려앉기 ----
    const k = u / UFO_T.land, e = 1 - (1 - k) * (1 - k);
    dm.position.y = dv.base.y + 1.0 + 48 * (1 - e);
    dm.rotation.y += dt * (6 - 5 * k);
    const s = Math.min(1, u / 0.5);
    dm.scale.set(0.3 + 0.7 * s, 2.5 - 1.5 * s, 0.3 + 0.7 * s);
    if (u > 0.4 && warp.on) warp.stop();
    if (Math.random() < 0.6) particles.stars(zone.scene, dm.position.clone().add(new THREE.Vector3(rand(-1.5, 1.5), 0.5, rand(-1.5, 1.5))), 1, 0x9fe8ff, 0.4);
    camera.position.lerp(dm.position.clone().add(camOffset().multiplyScalar(1.6)), 0.1);
    camera.lookAt(dm.position.x, dm.position.y, dm.position.z);
  } else if (u < UFO_T.land + UFO_T.drop) { // ---- 빔으로 내려오기 ----
    if (!dv.beam.visible) { dv.beam.visible = true; sound.portal(); particles.stars(zone.scene, dm.position.clone(), 24, 0x9fe8ff, 0.5); }
    const k = (u - UFO_T.land) / UFO_T.drop;
    r.meshes.forEach((o, i) => {
      o.visible = true;
      const tg = r.targets[i], gy = terrainHeight(tg.x, tg.z), top = dv.base.y + 1.0;
      o.position.set(dv.base.x + (tg.x - dv.base.x) * k, top + (gy - top) * k * k, dv.base.z + (tg.z - dv.base.z) * k);
      o.scale.copy(r.scales[i]).multiplyScalar(Math.max(0.02, k));
      o.rotation.y += dt * 8 * (1 - k);
    });
    camera.position.lerp(player.position.clone().add(camOffset()), 0.12);
    camera.lookAt(player.position.x, player.position.y + 1, player.position.z);
  } else finishUfoRide();
}
function finishUfoRide() {
  const r = ride, dv = zone.world.ufo;
  if (dv) { dv.mesh.userData.riding = false; dv.mesh.scale.setScalar(1); dv.mesh.rotation.set(0, 0, 0); if (dv.beam) dv.beam.visible = false; }
  r.meshes.forEach((o, i) => { o.visible = true; o.scale.copy(r.scales[i]); o.rotation.set(0, 0, 0); const tg = r.targets?.[i]; if (tg) o.position.set(tg.x, terrainHeight(tg.x, tg.z), tg.z); });
  player.vy = 0;
  warp.stop();
  ride = null; snapCam = true;
  const p = PLANET_BY_ZONE[zone.name];
  say(p ? p.arrive : zone.name === 'space' ? '꿈의우주로 돌아왔어! 손오공에게 말을 걸면 다른 행성으로 갈 수 있고, 착륙장의 로켓을 타면 푸른숲으로 돌아가.' : (RIDE_MSG[zone.name] || `${zone.label}에 도착!`), { sec: 9 });
  sound.fanfare(); confetti.burst(60);
  autosave();
}
// ----- 상황 버튼: 가까이 가면 할 수 있는 일(이야기·기차 타기·로켓 타기·퀴즈)이 화면에 버튼으로 나타난다. E키/엔터도 같은 일을 한다 -----
const ctxBtn = document.getElementById('ctx-action');
let ctxAction = null, ctxClicked = false;
ctxBtn.onclick = () => { ctxClicked = true; };
const jumpBtn = document.querySelector('#touch-actions button[data-key="jump"]');
const runBtn = document.querySelector('#touch-actions button[data-key="run"]');
function offer(label, run, short = label) { if (!ctxAction) ctxAction = { label, run, short }; }
function updateCtxButton() {
  const show = ctxAction && !battle.active && !duelStage.active && !dex.open && !quiz.open && !planetOpen && !ride && !switching && !evo;
  if (document.body.classList.contains('touch')) { // 터치 화면: 점프 버튼이 그 일을 하는 버튼으로 바뀐다 (색도 바뀜)
    ctxBtn.classList.add('hidden');
    const label = show ? ctxAction.short : (player.swim ? '헤엄' : '점프'); // 심해에서는 점프 버튼이 헤엄 버튼 (둥근 버튼 안에 한 줄로 들어가게 한 단어)
    if (jumpBtn.textContent !== label) { jumpBtn.textContent = label; jumpBtn.classList.toggle('ctx', !!show); jumpBtn.dataset.key = show ? 'action' : 'jump'; }
    jumpBtn.hidden = (sailing || driving) && !show;             // 배 위·차 안에서는 점프 버튼을 숨긴다 (할 일이 있을 때만 보인다)
    const runLabel = sailing || driving ? '가속' : '달리기'; // 배 위·차 안에서는 달리기 대신 가속 (역시 한 줄로)
    if (runBtn.textContent !== runLabel) { runBtn.textContent = runLabel; runBtn.classList.toggle('boost', sailing || driving); }
    return;
  }
  if (!show) { ctxBtn.classList.add('hidden'); return; }
  if (ctxBtn.textContent !== ctxAction.label) ctxBtn.textContent = ctxAction.label;
  ctxBtn.classList.remove('hidden');
}
function talkTo(npc) {
  state.prompt = 8;
  const ctx = { name: state.name, conquered: state.conquered, zone: ZONE_INFO[zone.name] || {}, leader: party.leader };
  const lines = typeof npc.lines === 'function' ? npc.lines(ctx) : npc.lines;
  npc.line = ((npc.line ?? -1) + 1) % lines.length;
  let healed = 0;
  if (npc.heal) {
    healed = party.healAll();
    if (healed) { sound.fanfare(); particles.stars(zone.scene, player.position.clone().add(new THREE.Vector3(0, 1.2, 0)), 20, 0xffd93d, 0.5); refreshHud(); }
  }
  if (!healed) sound.click();
  // 꿈의우주에서 행성으로 가는 UFO 는 별의 문을 지키는 메가팬텀을 잡아야 띄울 수 있다 (관리자 모드는 예외)
  const spaceMega = creatureData.creatures.find((c) => c.zone === 'space' && c.shrine);
  const ufoLocked = !!(npc.ufo && zone.world.ufo && !zone.world.ufo.to && spaceMega && !(state.dex[spaceMega.id] > 0) && !state.admin);
  const text = ufoLocked
    ? `${npc.name}: UFO 는 별의 문의 힘으로 나는 거야. ${state.conquered.space ? `별의 문을 지키는 ${josa(spaceMega.name, '을를')} 잡아 오면 태워 줄게!` : `먼저 북쪽 제단의 보스를 잡아 별의 문을 열고, 그곳을 지키는 ${spaceMega.name}까지 잡아 오면 태워 줄게!`}`
    : `${npc.name}: ${lines[npc.line]}${healed ? ' (포켓몬들을 치료해 줬단다!)' : ''}`;
  say(text, { sec: ufoLocked ? 8 : 6, faceImg: npcFace(npc) });
  // 데려다줄 수 있는 안내원과 이야기하는 동안은 대화 버튼 위에 "연구소 가기" 버튼이 켜진다
  npc.talking = true;
  if (npc.warp) { warpNpc = npc; warpBtn.classList.remove('hidden'); }
  if (npc.ufo && zone.world.ufo && !ufoLocked) { // 손오공: 행성에서는 빨간 "꿈의우주로 돌아가기" + 보라 "다른 행성으로 가기", 꿈의우주에서는 행성 고르기 팝업 버튼
    const v = zone.world.ufo;
    boardNpc = npc;
    boardBtn.textContent = v.to ? '🛸 꿈의우주로 돌아가기' : '🛸 다른 행성으로 가기';
    boardBtn.classList.remove('hidden');
    if (v.to) { ufoNpc = npc; ufoBtn.classList.remove('hidden'); }
  } else if (npc.boards && zone.world[npc.boards] && !ufoLocked) { // 차장과 이야기하는 동안 "기차 타기" 버튼이 켜진다 (손오공은 boards 도 'ufo' 라 잠겨 있으면 여기도 건너뛴다)
    boardNpc = npc;
    const dest = ZONE_INFO[zone.world[npc.boards].to]?.name || '';
    boardBtn.textContent = `${npc.boards === 'train' ? '🚂' : '🚀'} ${josa(dest, '으로')} 출발!`;
    boardBtn.classList.remove('hidden');
  }
  if (npc.sails && boatHere() && !returning && !goingHome) { // 뱃사공과 이야기하는 동안 "배 타기"·"선착장으로 돌아가기" 버튼이 켜진다
    boardNpc = npc;
    boardBtn.textContent = sailing ? '⚓ 선착장으로 돌아가기' : '⛵ 배 타기';
    boardBtn.classList.remove('hidden');
  }
}
/** 연구소로 순간이동 (모두 기절했을 때, 안내원이 데려다줄 때) */
function goToLab(text, faceImg = null) {
  if (zone.name === 'lab') { say(text, { sec: 6, faceImg }); return; }
  if (!state.returnTo) state.returnTo = { zone: zone.name, spawn: { x: player.position.x, z: player.position.z } };
  switchZone('lab', getZone('lab').world.spawn, { text, sec: 7, faceImg });
}
function spawnRescue(z) {
  const number = 2 + Math.floor(Math.random() * 9); // 2~10
  const data = nbByNumber[number];
  const half = z.terrain.size / 2 - 8;
  for (let tries = 0; tries < 40; tries++) {
    const x = player.position.x + rand(-35, 35), zz = player.position.z + rand(-35, 35);
    const d = Math.hypot(x - player.position.x, zz - player.position.z);
    if (Math.abs(x) > half || Math.abs(zz) > half || d < 10 || inHole(x, zz) || isBlocked(x, zz) || insideObstacle(x, zz, 1.4)) continue;
    if (z.rescues.some((o) => o.position.distanceTo(new THREE.Vector3(x, 0, zz)) < 8)) continue; // 친구들끼리 너무 붙지 않게
    placeRescue(z, data, x, zz);
    // 나타났다는 말풍선은 띄우지 않는다 (자주 나와서 시끄럽다). 머리 위 빨간 ! 로만 알린다
    z.nbTimer = rand(6, 13); // 다음 친구는 잠시 뒤에
    return;
  }
  z.nbTimer = 6; // 자리를 못 찾으면 잠시 뒤 다시
}
/** 숫자블록 친구를 그 자리에 세운다 (머리 위 빨간 ! 로 알린다). 말을 걸면 quiz 가 나온다 */
function placeRescue(z, data, x, zz) {
  const nb = new Numberblock(z.scene, data, { x, z: zz });
  nb.life = 150;
  nb.help = makeNumberSprite('!', '#e8453c');
  nb.help.position.y = new THREE.Box3().setFromObject(nb.mesh).max.y - nb.mesh.position.y + 0.7; // 머리 위
  nb.help.scale.set(0.8, 0.8, 1);
  nb.mesh.add(nb.help);
  z.rescues.push(nb);
  return nb;
}
// 열보다 큰 숫자블록 친구의 이름 (data/numberblocks.json 에는 열이까지만 있어서 상자에서 나올 때 그 자리에서 만든다).
// 몸은 numberblocks.js 의 shapeFor 가 11~24 를 다섯 칸 기둥으로 쌓아 주므로 그대로 세워진다
const BIG_NB_NAMES = { 11: '열하나', 12: '열둘', 13: '열셋', 14: '열넷', 15: '열다섯', 16: '열여섯', 17: '열일곱', 18: '열여덟', 19: '열아홉', 20: '스물' };
const BIG_NB_CHANCE = 0.2; // 상자 다섯 개에 하나쯤. 상자 자체가 드물어서(CHEST_CHANCE) 줍는 것 100개에 2~3번꼴이다
/** 상자 속에 몇 개가 들어 있었나: 문제를 다 풀고 나서야 굴린다 (주울 때는 아무도 모른다).
 *  분포는 예전에 "나온 친구의 숫자"를 그대로 주던 때와 같다 — 보통 2~10, 다섯 번에 한 번쯤 11~20. */
function chestReward() {
  if (Math.random() < BIG_NB_CHANCE) return 11 + Math.floor(Math.random() ** 2 * 10);
  return 2 + Math.floor(Math.random() * 9);
}
/** 그 숫자의 숫자블록 친구 자료 (열보다 크면 그 자리에서 만든다) */
function nbDataFor(n) { return nbByNumber[n] || { id: `nbx${n}`, number: n, name: BIG_NB_NAMES[n] || `${n}` }; }
/** 수수께끼 상자를 열었을 때. 문제가 먼저 나오고, 상자 속에 몇 개가 들었는지는 풀고 나서야
 *  그 숫자의 숫자블록 친구가 되어 튀어나온다 — 숫자를 먼저 보여 주면 "몇 개가 들었을까?" 가 되지 않는다. */
function openChest(z, at, boxName) {
  const hard = Math.random() < 0.45 ? 8 : 4; // 문제 난이도만 정한다 (상자 속 개수와는 상관없다)
  z.nbTimer = Math.max(z.nbTimer, rand(10, 16)); // 상자를 푸는 동안 평소 친구가 겹쳐 나오지 않게
  return quiz.ask(hard, boxName, z.name).then((res) => {
    if (res !== 'ok') {
      if (res === 'wrong') quizResult(false);
      sound.bounce();
      say(res === 'wrong'
        ? `${boxName}가 도로 닫혀 버렸어… 정답은 ${quiz.last?.answer}이었어. ${quiz.last?.explain || quiz.last?.hint || ''} 다음 상자에 또 도전해 봐!`
        : `${boxName}는 다음에 열어 보자!`, { sec: 7 });
      return res;
    }
    const reward = chestReward();               // 이제야 굴린다
    const data = nbDataFor(reward);
    const nb = placeRescue(z, data, at.x, at.z); // 보상 숫자 그대로인 친구가 상자 자리에서 뿅
    nb.prize = true;                             // 문제를 내는 친구가 아니다 (퀴즈 버튼도 안 뜬다)
    nb.life = 5;                                 // 잠깐 보여 주고 사라진다
    if (nb.help) nb.help.visible = false;        // 도와달라는 빨간 ! 도 없다
    particles.stars(z.scene, nb.mesh.position.clone().add(new THREE.Vector3(0, 1, 0)), 26, new THREE.Color(colorForCount(reward)).getHex(), 0.5);
    state.rescued++;
    wkAdd('quiz');
    quizResult(true);
    bump('chest');
    const merged = setBlocks(state.blocks + reward, { quiet: true }); // 뭉침 안내는 아래 말풍선에 이어 붙인다
    sound.fanfare();
    confetti.burst(100);
    const why = quiz.last?.explain || quiz.last?.hint || '';
    say(`정답이야! ${boxName} 속에는… ${josa(data.name, '이가')} 들어 있었어 — 블록 ${reward}개!${reward > 10 ? ' 열보다 많아!' : ''} 이제 모두 ${state.blocks}개야. ${why}${merged ? ' ' + merged : ''}`,
      { face: String(reward), sec: merged ? 11 : 8 });
    refreshHud();
    autosave();
    return res;
  });
}
function removeRescue(z, nb, escaped) {
  if (!nb || !z.rescues.includes(nb)) return;
  z.scene.remove(nb.mesh);
  z.rescues = z.rescues.filter((o) => o !== nb);
  z.nbTimer = Math.min(z.nbTimer, rand(4, 9)); // 가 버렸다는 말풍선도 띄우지 않는다
}
function rescueSolved(z, nb) {
  nb.rescued = true;
  const n = nb.data.number;
  particles.stars(z.scene, nb.mesh.position.clone().add(new THREE.Vector3(0, 1, 0)), 24, new THREE.Color(colorForCount(n)).getHex(), 0.5);
  z.scene.remove(nb.mesh);
  z.rescues = z.rescues.filter((o) => o !== nb);
  z.nbTimer = Math.min(z.nbTimer, rand(4, 9)); // 풀고 나면 곧 다음 친구가 온다
  state.rescued++;
  wkAdd('quiz');
  quizResult(true);
  // 길에서 만난 친구는 딱 "그 친구의 숫자만큼" 준다 — 줍기·대결과 달리 퀴즈는 자주 나오니
  // 보상을 낮춰 두어야 1000개까지 차근차근 모으는 맛이 난다.
  // 수수께끼 상자에서 나온 친구는 다르다: 상자 속에 몇 개가 들었는지 지금 굴려서 알려 준다.
  const reward = n;
  const merged = setBlocks(state.blocks + reward, { quiet: true }); // 뭉침 안내는 아래 말풍선에 이어 붙인다
  sound.fanfare();
  confetti.burst(100);
  const why = quiz.last?.explain || quiz.last?.hint || '';
  say(`${nb.data.name}: 정답이야, 고마워! 블록 ${reward}개를 받았어! 이제 모두 ${state.blocks}개야.${reward > 10 ? ' 열보다 큰 숫자야!' : ''} ${why}${merged ? ' ' + merged : ''}`,
    { face: String(reward), sec: merged ? 10 : 7 });
  refreshHud();
  autosave();
}

/** 숫자블록 친구에게 문제를 받아 푼다. 가까이 가서 퀴즈 버튼을 눌렀을 때와, 수수께끼 상자를 열었을 때 모두 이걸 쓴다.
 *  맞히면 블록을 주고(rescueSolved), 틀리면 그 친구는 가 버린다. */
function askRescueQuiz(z, nb) {
  return quiz.ask(nb.data.number, nb.data.name, z.name).then((res) => { // 행성에서는 그 행성 상식 퀴즈가 나온다
    if (!z.rescues.includes(nb)) return res;
    if (res === 'ok') rescueSolved(z, nb);
    else if (res === 'wrong') { // 한 번 틀리면 그 문제는 끝: 친구는 가 버리고 다른 친구가 곧 나타난다
      quizResult(false);
      removeRescue(z, nb);
      sound.bounce();
      say(`${nb.data.name}: 정답은 ${quiz.last?.answer}이었어. ${quiz.last?.explain || quiz.last?.hint || ''} 다음 퀴즈에 또 도전해 봐!`, { face: String(nb.data.number), sec: 7 });
    } else say('괜찮아, 다시 와서 도전하자!', { face: String(nb.data.number) });
    return res;
  });
}

/** 대결에서 이기면 받는 블록: 상대 공격력 × 지역 블록 가치 (보스는 2배).
 *  단, 그 등급을 잘 잡는(75% 이상) 넘버볼 값의 절반보다는 많다 — 두 번쯤 이기면 그 볼 하나를 만들 수 있게.
 *  (볼 값을 두 배로 올리면서 이 바닥값도 "볼 값 + 1" 에서 절반으로 낮췄다. 그러지 않으면 볼이 비싸질수록
 *   대결 보상이 따라 올라가서, 비싸진 값이 하나도 어렵지 않게 된다.) */
const ZONE_GRADE = { forest: 1, hive: 1, cave: 2, sea: 3, deepsea: 4, volcano: 4, space: 5 }; // 그 지역 야생 포켓몬의 등급
for (const p of PLANETS) ZONE_GRADE[p.zone] = 5; // 행성은 우주 등급
function winReward(c) {
  const grade = c.isBoss ? (ZONE_GRADE[zone.name] || 1) : (c.data.grade || 1); // 보스는 그 지역 기준 볼 값으로 (다이아 값까지는 아니게)
  const ball = BALLS.find((b) => catchChance(grade, b.tier) >= 75) || BALLS[BALLS.length - 1];
  return Math.max(c.data.baseAtk * blockValue() * (c.isBoss ? 2 : 1), Math.ceil(ball.cost / 2));
}

// ---------- 넘버로켓단 대원과의 대결 (src/rocket.js) ----------
// 대원은 직접 싸우지 않는다. 세뇌한 포켓몬을 내보내고, 그 포켓몬 머리 위의 "가짜 숫자"를 0으로 깎으면
// 포켓몬은 제 좋아하는 숫자를 되찾아 친구가 되고, 대원은 숫자를 못 세며 항복한다. 다치는 사람은 아무도 없다.
function challengeGrunt(npc) {
  const g = npc.rocket;
  if (!g || state.rockets[zone.name] || battle.active || npc.busy) return;
  if (zone.creatures.some((c) => c.rocketOf === npc)) return; // 이미 내보낸 포켓몬이 밖에 서 있으면 또 부르지 않는다 (닿으면 대결이 열린다)
  let L = party.leader;
  if (!L || party.isFainted(L)) {
    const other = party.healthy()[0];
    if (!other) { say('포켓몬이 모두 기절했어… 오박사 연구소에서 치료받고 다시 오자!', { sec: 6 }); return; }
    attachLeader(other); L = other;
  }
  npc.busy = true;
  npc.talking = true;
  state.prompt = 8;
  sound.click();
  say(`${npc.name}: ${g.taunt}`, { sec: 6, faceImg: npcFace(npc) });
  input.endFrame();
  const z = zone;
  setTimeout(() => {
    npc.busy = false;
    if (zone !== z || battle.active || state.rockets[z.name] || z.creatures.some((c) => c.rocketOf === npc)) return;
    // 세뇌된 포켓몬은 대원과 지우 사이에 나온다 (막힌 자리면 대원 발밑에)
    const pp = player.position;
    const dx = pp.x - npc.x, dz = pp.z - npc.z, d = Math.hypot(dx, dz) || 1;
    let sx = npc.x + (dx / d) * 1.5, sz = npc.z + (dz / d) * 1.5;
    if (inHole(sx, sz) || isBlocked(sx, sz) || insideObstacle(sx, sz, 0.8)) { sx = npc.x; sz = npc.z; }
    const c = spawnCreature(z, g.mon, sx, sz, { boss: false, baseHp: g.hp, baseAtk: g.atk, ...(g.extra || {}) });
    c.rocketOf = npc;
    c.hint.visible = true;             // 붉은 가짜 숫자는 처음부터 보인다
    c.leash = 3;                       // 대원 곁을 떠나지 않는다
    addBrainwashRing(c.mesh, c.data.scale || 1);
    particles.cubes(z.scene, c.mesh.position.clone().add(new THREE.Vector3(0, 1, 0)), 16, 0xe8453c);
    sound.click();
  }, 1600);
}
/** 대원이 내보낸 포켓몬과의 대결이 끝났다. won 이면 대원은 항복하고 그 자리에 남아 지역의 비밀을 알려 준다. */
function beatGrunt(c, won) {
  const npc = c.rocketOf;
  if (!npc) return;
  const z = zone, g = npc.rocket;
  c.rocketOf = null;
  c.becomeFriend();       // 다시 대결이 열리지 않게 (자리에는 남지만 움직이지 않는다)
  z.scene.remove(c.mesh);
  npc.talking = false;
  if (!won) { setTimeout(() => { if (zone === z) say(`${npc.name}: ${g.hold}`, { sec: 6, faceImg: npcFace(npc) }); }, 2600); return; }
  state.rockets[z.name] = true;
  addWhiteFlag(npc.mesh);
  state.balls[g.ball] = (state.balls[g.ball] || 0) + 1;
  setBlocks(Math.min(MAX_BLOCKS, state.blocks + g.blocks));
  confetti.burst(160); sound.fanfare();
  refreshHud();
  setTimeout(() => { if (zone === z) say(`${npc.name}: ${g.lose}`, { sec: 6, faceImg: npcFace(npc) }); }, 3200);
  setTimeout(() => { if (zone === z) say(`${z.label}의 넘버로켓단 ${g.chief ? '간부' : '대원'}을 물리쳤어! 블록 ${g.blocks}개와 ${BALL_BY_ID[g.ball].name} 1개를 받았어. 항복한 그 자리에서 말을 걸면 이곳의 비밀을 알려 줄 거야!`, { sec: 9 }); }, 9600);
  autosave();
}

// ---------- 주간 순위 기록 (src/rank.js) ----------
/** 이번 주 기록 +1 (quiz | caught | boss). 주가 바뀌었으면 먼저 0으로 돌린다 */
function wkAdd(key) { checkWeek(); state.wk[key] = (state.wk[key] || 0) + 1; }
/** 주가 바뀌었으면 이번 주 기록을 0으로 (지난주 기록은 순위 화면에 보여 주려고 남긴다). announce 면 말풍선으로 알린다 */
function checkWeek(announce = true) {
  const now = weekKey();
  if (state.week === now) return false;
  if (state.week && weekScore(state.wk) > 0) { state.lastWeek = state.week; state.lastWk = { ...state.wk }; } // 0점짜리 주는 남기지 않는다
  state.week = now; state.wk = emptyWeek(); rollWeek(state.learn); // 배움 기록도 이번 주를 지난주로 넘긴다 (통산 기록·복습 빚은 그대로)
  if (announce && zone) say(`🏆 새로운 한 주가 시작됐어! ${state.lastWeek ? `지난주엔 ${weekScore(state.lastWk)}점이었어. ` : ''}이번 주 순위에 다시 도전해 보자!`, { sec: 7 });
  return true;
}
// ---------- 오늘의 미션 · 스티커 (src/goals.js) ----------
/** 하루가 바뀌었으면 오늘의 미션을 새로 뽑는다 */
function checkDay(announce = true) {
  if (!rollDay(state.goals, state.name)) return false;
  if (announce && zone) queueSay('🎯 새로운 하루야! 오늘의 미션이 새로 나왔어 — 도감의 "미션" 탭에서 보자!', { sec: 7 });
  return true;
}
/** 지금까지 해낸 것으로 새 스티커를 받았는지 본다 */
function checkNewStickers() {
  const got = checkStickers(state.goals, {
    caught: state.caught, rescued: state.rescued, blocks: state.blocks,
    bosses: Object.keys(state.conquered).length,
    dexCount: Object.keys(state.dex).filter((k) => state.dex[k] > 0).length,
    stats: state.goals.stats,
  });
  for (const st of got) { sound.fanfare(); confetti.burst(140); queueSay(`🏅 스티커를 받았어! ${st.emoji} ${st.name} — ${st.how}`, { sec: 7 }); }
  return got;
}
/** 미션 진행. 끝낸 미션마다 넘버볼을 주고, 셋 다 끝내면 하나 더 준다 */
function bump(kind, key = null, amount = 1) {
  if (!zone) return;
  checkDay();
  const done = goalAdd(state.goals, kind, key, amount);
  for (const t of done) {
    const m = MISSION_BY_ID[t.id];
    t.got = true;
    state.balls[MISSION_BALL] = (state.balls[MISSION_BALL] || 0) + 1;
    sound.fanfare(); confetti.burst(90);
    queueSay(`🎯 오늘의 미션 완료 — ${m.emoji} ${m.text(m.need)}! ${BALL_BY_ID[MISSION_BALL].name} 1개를 받았어.`, { sec: 7 });
  }
  if (done.length && allDone(state.goals) && !state.goals.bonus) {
    state.goals.bonus = true;
    state.goals.stats.daily++;
    state.balls[BONUS_BALL] = (state.balls[BONUS_BALL] || 0) + 1;
    confetti.burst(200);
    queueSay(`🏅 오늘의 미션을 셋 다 했어! ${BALL_BY_ID[BONUS_BALL].name} 1개를 더 받았어. 내일 또 하자!`, { sec: 8 });
  }
  if (done.length) refreshHud();
  checkNewStickers();
}
/** 퀴즈를 맞히거나 틀렸을 때 (연속 정답 기록) */
function quizResult(ok) {
  const st = state.goals.stats;
  if (!ok) { st.streak = 0; return; }
  st.streak++;
  st.best = Math.max(st.best || 0, st.streak);
  bump('quiz');
}

// ---------- 튜토리얼/진행 ----------
function tutorial() {
  if (state.tutorial === 0 && player.moved) { state.tutorial = 1; say('잘했어! 이번엔 스페이스(점프 버튼)로 점프해 봐!'); }
  else if (state.tutorial === 1 && player.jumped) { state.tutorial = 2; say('하얀 블록을 찾아서 주워보자! 블록 위로 걸어가면 돼.'); }
  else if (state.tutorial === 2 && state.blocks > 0) { state.tutorial = 3; say('블록이 네 뒤에 숫자블록으로 쌓였어! B(도감)를 열면 블록으로 포켓몬의 공격력이나 체력을 올릴 수 있어.', { sec: 7 }); }
  else if (state.tutorial === 3 && state.blocks >= 3 && !state.upgradeTold) { state.upgradeTold = true; say('몬스터와 만나면 내 포켓몬이 대신 싸워! 체력이 0이 되면 지니까 도감에서 체력도 올려 두자.', { sec: 7 }); }
  else if (state.tutorial === 3 && state.caught > 0) { state.tutorial = 4; say('첫 친구다! 도감에서 대표를 바꿀 수 있어. 숫자블록 친구가 나타나면 퀴즈를 풀어 줘. 맞히면 블록을 줘!', { sec: 7 }); }
  else if (state.tutorial === 4 && state.caught >= 3 && !state.mapTold) { state.mapTold = true; say('푸른숲엔 다른 지역으로 가는 길이 있어. 동북쪽 불의산 입구, 서쪽 기차역(물의길), 남동쪽 로켓 발사장(꿈의우주)! 꿈의우주의 UFO 정거장에서는 태양과 행성들까지 갈 수 있어. 지역마다 보스를 잡으면 정복이야!', { sec: 10 }); }
}
function conquer(zoneName) {
  state.conquered[zoneName] = true;
  zones[zoneName]?.world.setWhirlOpen?.(true); // 거북왕을 이긴 그 순간 소용돌이가 열린 모습으로 바뀐다
  const n = Object.keys(state.conquered).length;
  showZoneBanner(`${ZONE_INFO[zoneName].name} 정복!`);
  confetti.burst(220);
  const z = zones[zoneName];
  if (z) setTimeout(() => revealShrine(z), 2200); // 정복 직후 숨어 있던 메가 성역이 나타난다
  if (n >= ZONE_COUNT) setTimeout(() => say('모든 지역을 정복했어! 넘버랜드의 챔피언이 됐어!', { sec: 10 }), 3000);
  refreshHud();
}

// ---------- 시작: 타이틀 → 포켓몬 고르기 → 모험 ----------
// 타이틀이 떠 있는 동안은 인트로 무대(주인공·몬스터 친구들)를 그린다
let intro = buildIntro(creatureData.creatures);
onFit = (aspect) => intro?.resize(aspect);
intro.resize(fitW / fitH);
document.body.classList.add('intro');
setTimeout(() => { if (!zones.forest) getZone('forest'); }, 300); // 타이틀이 뜬 뒤 뒤에서 푸른숲을 미리 만든다
const starterEl = document.getElementById('starter');
const starterGrid = document.getElementById('starter-grid');
function renderStarter() {
  if (starterEl.classList.contains('hidden')) return;
  starterGrid.innerHTML = '';
  for (const sp of starters) {
    const t = dex.thumbs(sp);
    const item = document.createElement('button');
    item.className = 'starter-item';
    item.style.borderColor = sp.draftShape?.color || '#ffd93d';
    const first = sp.skills?.[0];
    item.innerHTML = `
      ${t ? `<img src="${t.color}" alt="">` : ''}
      <div class="starter-name">${sp.name}</div>
      <div class="starter-stat">${sp.type} 속성 · ❤ 체력 ${friendStats(sp.starterHp ?? sp.baseHp, sp.starterAtk ?? sp.baseAtk).hp} · ⚔ 공격 ${friendStats(sp.starterHp ?? sp.baseHp, sp.starterAtk ?? sp.baseAtk).atk}</div>
      <div class="starter-skill">기술: ${first ? `${skillIcon(first)} ${first.name}` : '-'}${sp.skills?.[1] ? ` → ${skillIcon(sp.skills[1])} ${sp.skills[1].name}` : ''}</div>`;
    item.onclick = () => chooseStarter(sp.id);
    starterGrid.appendChild(item);
  }
}
// 게임 시작: 지역(푸른숲 또는 저장된 지역)을 준비하고 주인공을 세운다
function startGame({ zoneName = 'forest', pos = null } = {}) {
  document.body.classList.remove('intro');
  intro?.dispose();
  intro = null;
  getZone('forest');
  zone = getZone(zoneName);
  setActiveTerrain(zone.terrain);
  player = new Player(zone.scene);
  chain = new FollowChain(player);
  if (pos) player.teleport(pos.x, pos.z);
  applyZoneEnv();
  if (state.glow) { player.lamp.distance = 30; }
  camera.position.copy(player.position).add(camOffset());
  snapCam = true;
  showZoneBanner(zone.label);
  bgmRefresh();
  refreshHud();
  checkDay(false);                                       // 날이 바뀌었으면 오늘의 미션을 새로 (시작할 때는 말풍선 없이)
  state.goals.stats.zones[zoneName] = true; bump('zones', zoneName);
  checkNewStickers();                                    // 예전 저장에서 이어 하면 이미 해낸 몫의 스티커를 여기서 받는다
}
function chooseStarter(id) {
  starterEl.classList.add('hidden');
  if (state.admin) applyAdmin(); // 지역을 만들기 전에 열어 둬야 큰 바위 같은 것도 미리 치워진다
  startGame();
  const member = addStarter(id);
  confetti.burst(120);
  sound.fanfare();
  if (state.admin) startAdmin();
  else say(`안녕, ${state.name}! 난 원이야. ${party.name(member)}와 함께 가자! 방향키(또는 왼쪽 화면을 눌러 조이스틱)로 움직여 봐!`, { sec: 6 });
  autosave();
}

// ---------- 관리자 모드 (기능 테스트용) ----------
// 새로하기에서 이름을 "Admin" 으로 하면 보스를 잡지 않아도 모든 지역이 열린다.
// 도감의 "관리자" 탭에서 어느 지역이든 바로 갈 수 있고, 모든 포켓몬이 도감에 들어 있어 대표로 고를 수 있다.
const DEBUG_ADMIN = location.search.includes('debug') && location.search.includes('admin'); // 시험용: ?debug&admin
const isAdminName = () => false; // 이름 Admin 으로 관리자가 되던 기능은 껐다. 계정 프로필의 admin 이 true 인 계정(콘솔에서 켠다)만 관리자
const accountAdmin = (name) => DEBUG_ADMIN || !!(cloud.user?.admin && (name || '').trim().toLowerCase() === cloud.user.name.trim().toLowerCase());
function applyAdmin() {
  for (const n of CONQUERABLE) state.conquered[n] = true; // 정복 처리 → 동굴 입구·심해 소용돌이가 열린다
  state.megaBlocks = 30;
  state.glowBlocks = 50;
  state.glow = true;                                      // 어두운 동굴도 처음부터 밝게
  state.balls = { bronze: 30, silver: 30, gold: 30, diamond: 30 };
  state.tutorial = 5; state.upgradeTold = true; state.mapTold = true; // 처음 안내는 건너뛴다
}
function startAdmin() {
  setBlocks(30, { quiet: true, mission: false }); // 너무 많으면 뒤에 쌓인 블록 더미가 주인공을 가린다 (모자라면 +블록 100 버튼)
  adminGrantAll();
  showAdminPanel();
  say(`관리자 모드야, ${state.name}! 모든 지역이 열렸고 모든 포켓몬이 도감에 있어. 도감(B)의 "관리자" 탭에서 어디든 바로 갈 수 있어.`, { sec: 8 });
}
/** 관리자: 모든 포켓몬을 잡은 것처럼 도감에 넣어 대표로 고를 수 있게 한다 (이미 있는 종은 건너뛴다) */
function adminGrantAll() {
  let added = 0;
  for (const sp of creatureData.creatures) {
    if (!party.members.some((m) => m.speciesId === sp.id)) { party.add(sp.id, buildDraftMesh(sp)); added++; }
    if (!state.dex[sp.id]) state.dex[sp.id] = 1;
  }
  if (added) refreshHud();
}
/** 지역을 바로 옮기는 관리자 버튼들: 화면을 가리지 않게 도감의 "관리자" 탭 안에 넣는다 (관리자 모드에서만 탭이 보인다) */
function showAdminPanel() {
  const tab = document.querySelector('#dex-tabs button[data-tab="admin"]');
  if (tab) tab.hidden = false;
  const box = dex.adminEl;
  if (!box || box.dataset.ready) return;
  box.dataset.ready = '1';
  const title = document.createElement('div'); title.className = 'admin-title'; title.textContent = '🛠 지역 바로 가기'; box.appendChild(title);
  const row = document.createElement('div'); row.className = 'admin-row'; box.appendChild(row);
  for (const n of Object.keys(BUILDERS)) {
    const btn = document.createElement('button');
    btn.textContent = ZONE_INFO[n]?.name || n;
    btn.onclick = () => {
      if (!zone || zone.name === n || switching || battle.active) return;
      dex.hide();
      const dest = getZone(n);
      switchZone(n, dest.world.spawn, { text: `${josa(dest.label || ZONE_INFO[n]?.name || n, '으로')} 왔어!`, sec: 3 });
    };
    row.appendChild(btn);
  }
  const title2 = document.createElement('div'); title2.className = 'admin-title'; title2.textContent = '🧱 블록'; box.appendChild(title2);
  const row2 = document.createElement('div'); row2.className = 'admin-row'; box.appendChild(row2);
  const more = document.createElement('button');
  more.textContent = '+블록 100';
  more.onclick = () => { setBlocks(state.blocks + 100, { mission: false }); dex.blocksEl.textContent = `${state.blocks}`; }; // 관리자 버튼은 미션으로 세지 않는다
  row2.appendChild(more);
  const note = document.createElement('div'); note.className = 'admin-note'; note.textContent = '관리자 모드: 모든 지역이 열려 있고, 모든 포켓몬이 도감에 있어 대표로 고를 수 있어요. 메가블럭 30개, 넘버볼 각 30개로 시작해요.'; box.appendChild(note);
}
// 화면에 보이는 버전 — 태블릿이 옛 파일을 캐시에 갖고 있으면 이 숫자가 그대로 남는다 (고칠 때마다 바꾼다)
const BUILD = 'v2026-09-21', UPDATED = '2026년 9월 21일';
document.getElementById('title-help').textContent = `버전 ${BUILD} · 업데이트 ${UPDATED}`;
const titleEl = document.getElementById('title');
const newgameEl = document.getElementById('newgame');
const continueEl = document.getElementById('continue');
const nameInput = document.getElementById('name-input');
/** 시작하기: 클라우드가 켜져 있으면 계정 모달(로그인/새 계정)로, 아니면 예전처럼 이름을 적는 화면으로 */
document.getElementById('btn-new').onclick = async () => {
  sound.ensure();
  if (cloud.enabled) {
    if (!cloud.ready) { // Firebase 가 아직 로그인 상태를 복원하는 중이면 잠깐 기다린다 (자동 로그인)
      const btn = document.getElementById('btn-new');
      btn.disabled = true; btn.textContent = '☁️ 계정 확인 중…';
      await cloud.waitReady(8000);
      btn.disabled = false; btn.textContent = '▶ 시작하기';
    }
    if (cloud.user) { startWithAccount(cloud.user); return; } // 이미 로그인돼 있으면 바로
    acctShowChoice(); acctModal.classList.remove('hidden');
    return;
  }
  titleEl.classList.add('hidden');
  nameInput.value = '';
  newgameEl.classList.remove('hidden');
  setTimeout(() => nameInput.focus(), 50);
};
function confirmName() {
  const name = (nameInput.value || '').trim().slice(0, 8) || PLAYER_NAME;
  if (loadSave(name) && !confirm(`"${name}" 이름으로 저장된 모험이 있어요. 새로 시작하면 지워집니다. 새로 시작할까요?`)) return;
  state.name = name;
  state.admin = accountAdmin(name); // 관리자 계정이면 관리자 모드로 시작한다
  newgameEl.classList.add('hidden');
  starterEl.classList.remove('hidden');
  renderStarter();
}
document.getElementById('btn-name-ok').onclick = confirmName;
nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') confirmName(); e.stopPropagation(); });
nameInput.addEventListener('keyup', (e) => e.stopPropagation());
document.getElementById('btn-name-back').onclick = () => { newgameEl.classList.add('hidden'); titleEl.classList.remove('hidden'); };
document.getElementById('btn-continue').onclick = () => { sound.ensure(); titleEl.classList.add('hidden'); renderContinue(); continueEl.classList.remove('hidden'); };
document.getElementById('btn-continue-back').onclick = () => { continueEl.classList.add('hidden'); titleEl.classList.remove('hidden'); };
function renderContinue() {
  const list = document.getElementById('continue-list');
  const saves = listSaves();
  list.innerHTML = saves.length ? '' : '<div class="save-empty">저장된 모험이 아직 없어요. 새로하기로 시작해 봐요!</div>';
  for (const sv of saves) {
    const row = document.createElement('div');
    row.className = 'save-row';
    const leader = sv.party?.[sv.leader] ? speciesById[sv.party[sv.leader].speciesId] : null;
    const t = leader ? dex.thumbs(leader) : null;
    row.innerHTML = `
      ${t ? `<img src="${t.color}" alt="">` : '<div class="save-noimg"></div>'}
      <div class="save-info">
        <div class="save-name">${sv.name}</div>
        <div class="save-sub">${ZONE_INFO[sv.zone]?.name || sv.zone} · 친구 ${sv.caught}마리 · 정복 ${Object.keys(sv.conquered || {}).length}/${ZONE_COUNT} · 블록 ${sv.blocks}개 · ${formatWhen(sv.savedAt)}</div>
      </div>
      <button class="save-go">이어서 하기 ▶</button>
      <button class="save-del" title="삭제">✕</button>`;
    row.querySelector('.save-go').onclick = () => { continueEl.classList.add('hidden'); applySave(sv); };
    row.querySelector('.save-del').onclick = () => { if (confirm(`"${sv.name}"의 저장을 지울까요?`)) { deleteSave(sv.name); renderContinue(); } };
    list.appendChild(row);
  }
}

// ---------- 저장 / 불러오기 ----------
function buildSaveData() {
  return {
    v: 1, name: state.name, admin: !!state.admin, savedAt: Date.now(),
    zone: zone.name, pos: sailing ? { ...dockLanding() } : { x: +player.position.x.toFixed(1), z: +player.position.z.toFixed(1) }, // 배 위에서 저장하면 선착장에서 다시 시작
    blocks: state.blocks, megaBlocks: state.megaBlocks, glowBlocks: state.glowBlocks, caught: state.caught, rescued: state.rescued,
    conquered: { ...state.conquered }, caughtCreatures: state.caughtCreatures, dex: { ...state.dex }, bossDex: { ...state.bossDex },
    tutorial: state.tutorial, upgradeTold: !!state.upgradeTold, mapTold: !!state.mapTold, glow: state.glow,
    balls: { ...state.balls }, rockets: { ...state.rockets },
    party: party.members.map((m) => ({ speciesId: m.speciesId, atk: m.atk, maxHp: m.maxHp, hp: m.hp, wins: m.wins || 0 })),
    returnTo: state.returnTo,
    carTold: !!state.carTold,
    week: state.week, wk: { ...state.wk }, lastWeek: state.lastWeek, lastWk: state.lastWk ? { ...state.lastWk } : null,
    learn: state.learn,
    goals: state.goals,
    leader: Math.max(0, party.members.findIndex((m) => party.isLeader(m))),
  };
}
const saveToastEl = document.getElementById('save-toast');
let saveToastTimer = 0;
let cloudSavedAt = 0;
function doSave(manual = false) {
  if (!zone || !player || battle.active || ride || switching) return false;
  const data = buildSaveData();
  const ok = saveGame(data);
  const toast = (text, sec) => { saveToastEl.textContent = text; saveToastEl.classList.remove('hidden'); saveToastTimer = sec; };
  if (ok && cloud.user && (manual || Date.now() - cloudSavedAt > 60000)) { // 클라우드: 수동 저장은 바로, 자동 저장은 1분에 한 번
    cloudSavedAt = Date.now();
    // 계정으로 하는 중이면 클라우드까지 올라가야 "저장 완료". 그동안은 "저장하는 중…"을 보여 주고, 끝나면 완료(또는 실패)로 바꾼다
    if (manual) toast('☁️ 저장하는 중…', 30);
    cloud.saveGame(data, cloudSummary(data)).then(() => { if (manual) toast(`✅ 저장 완료! (${state.name})`, 2.2); }).catch((e) => { console.warn('[cloud] 저장 실패', e); if (manual) toast(`이 기기에는 저장됐지만 클라우드 저장은 실패했어: ${e.message}`, 5); });
  } else if (manual) toast(ok ? `💾 저장했어! (${state.name})` : '저장할 수 없어요 (브라우저 저장 공간)', 2.2);
  if (manual) sound.click();
  return ok;
}
function autosave() { if (zone && player) { checkWeek(); doSave(false); state.autosave = 90; } }
document.getElementById('dex-save').onclick = () => { if (doSave(true)) sound.click(); }; // 저장은 도감 안에서

// ---------- 사진 모드 (src/photo.js): 도감의 📸 를 누르면 친구들과 줄 서서 찰칵 ----------
const photo = new Photo({ sound });
const photoModal = document.getElementById('photo-modal');
const photoImg = document.getElementById('photo-img');
const photoSave = document.getElementById('photo-save');
function startPhoto() {
  if (!zone || !player) return;
  if (battle.active || duelStage.active || ride || switching || evo || photo.active) { say('지금은 사진을 찍을 수 없어. 잠깐 뒤에 다시 눌러 봐!', { sec: 4 }); return; }
  dex.hide();
  photoModal.classList.add('hidden');
  document.body.classList.add('photo-mode');   // HUD·버튼을 잠깐 숨긴다 (사진에 안 나오게)
  input.enabled = false;
  const today = state.goals.day;
  photo.start({
    camera, player,
    followers: chain.followers.map((f) => f.mesh).filter((m) => m && m.visible),
    groundY: (x, z) => terrainHeight(x, z),
    caption: `${state.name} · ${zone.label} · ${today}`,
    onShot: (url) => {
      state.goals.stats.photos++;
      checkNewStickers();
      autosave();
      if (!url) { say('사진이 잘 안 나왔어… 다시 찍어 보자!', { sec: 4 }); return; }
      photoImg.src = url;
      photoSave.href = url;
      photoSave.download = `${state.name}_${zone.label}_${today}.png`;
      photoModal.classList.remove('hidden');
    },
    onEnd: () => { document.body.classList.remove('photo-mode'); input.enabled = true; snapCam = true; },
  });
}
document.getElementById('dex-photo').onclick = () => { sound.ensure(); startPhoto(); };
document.getElementById('photo-close').onclick = () => photoModal.classList.add('hidden');
document.getElementById('photo-again').onclick = () => { photoModal.classList.add('hidden'); startPhoto(); };

// ---------- 클라우드 계정: 이름 + 4자리 비밀번호. 진행을 클라우드에 올려 어느 기기에서든 이어 하고, 친구의 도감을 본다 (src/cloud.js) ----------
/** 친구에게 보이는 내 요약 (profiles 문서) */
function cloudSummary(d) {
  const leader = d.party?.[d.leader] ? speciesById[d.party[d.leader].speciesId] : null;
  const wk = { ...emptyWeek(), ...(d.wk || {}) }, week = d.week || weekKey();
  return { name: d.name, caught: d.caught || 0, dexCount: Object.keys(d.dex || {}).filter((id) => d.dex[id] > 0 && speciesById[id]).length, conquered: Object.keys(d.conquered || {}).length, blocks: d.blocks || 0, leaderId: leader?.id || null, leaderName: leader?.name || null, zone: d.zone || 'forest',
    week, wk, wkScore: weekScore(wk), rank: rankEntry(d.name, wk, leader?.id) }; // week/wk/wkScore 는 친구 순위, rank 는 전체 순위(leaderboard/{주}) 항목
}
const acctModal = document.getElementById('account-modal'), dexLogoutBtn = document.getElementById('dex-logout');
const titleAcct = document.getElementById('title-acct');
const acctName = document.getElementById('acct-name'), acctPin = document.getElementById('acct-pin'), acctErr = document.getElementById('acct-error');
const acctForm = document.getElementById('acct-form'), acctSigned = document.getElementById('acct-signed'), acctChoice = document.getElementById('acct-choice');
let acctMode = 'login'; // 'login' | 'signup'
function acctShowChoice() { acctChoice.classList.remove('hidden'); acctForm.classList.add('hidden'); acctError(''); }
function acctShowForm(mode) {
  acctMode = mode; acctChoice.classList.add('hidden'); acctForm.classList.remove('hidden'); acctError('');
  document.getElementById('acct-form-title').textContent = mode === 'signup' ? '새 계정: 이름과 숫자 6자리 비밀번호를 정해요 (잊지 않게 적어 두세요!)' : '기존 계정의 이름과 비밀번호를 적어요';
  document.getElementById('btn-acct-go').textContent = mode === 'signup' ? '만들기' : '로그인';
  acctPin.value = ''; setTimeout(() => acctName.focus(), 50);
}
document.getElementById('btn-acct-choose-login').onclick = () => acctShowForm('login');
document.getElementById('btn-acct-choose-signup').onclick = () => acctShowForm('signup');
document.getElementById('btn-acct-back').onclick = acctShowChoice;
const friendsTabBtn = document.querySelector('#dex-tabs button[data-tab="friends"]'), feedbackTabBtn = document.querySelector('#dex-tabs button[data-tab="feedback"]'), rankTabBtn = document.querySelector('#dex-tabs button[data-tab="rank"]');
function acctError(msg) { acctErr.textContent = msg || ''; acctErr.classList.toggle('hidden', !msg); }
function refreshAccountUi() {
  const u = cloud.user;
  titleAcct.hidden = !(cloud.enabled && u); // 처음 화면 버튼은 시작하기 하나. 이미 로그인돼 있으면 그 아래에 누구 계정인지 작게 알려 준다
  if (u) document.getElementById('title-acct-name').textContent = u.name;
  if (u) { acctChoice.classList.add('hidden'); acctForm.classList.add('hidden'); } else acctShowChoice();
  acctSigned.classList.toggle('hidden', !u);
  if (u) document.getElementById('acct-me-name').textContent = u.name;
  friendsTabBtn.hidden = !cloud.enabled; // 친구 탭은 클라우드가 켜져 있으면 늘 보인다 (로그인 전에는 로그인 버튼)
  feedbackTabBtn.hidden = !cloud.enabled;
  rankTabBtn.hidden = !cloud.enabled;
  document.getElementById('btn-rank').hidden = !cloud.enabled; // 처음 화면의 이번 주 순위 (로그인 없이도 본다)
  dexLogoutBtn.hidden = !u;
  // 로그인해 있으면 "시작하기" 하나가 이어서 해 준다. 로그인 전(클라우드가 꺼진 오프라인 포함)에는
  // 이 기기 저장으로 이어 갈 길이 있어야 한다 — 없으면 새로 시작하는 수밖에 없어 진행이 통째로 사라진다.
  document.getElementById('btn-continue').hidden = !!u || !listSaves().length;
  if (dex.open && dex.tab === 'friends') renderFriends();
}
cloud.onUser = () => { refreshAccountUi(); if (cloud.user) { presence.refreshT = 0; startDuelWatch(); } else { stopPresence(); stopDuelWatch(); } };
/** 계정 창 열기: 로그인 전이면 로그인/새 계정 고르기, 로그인 뒤면 내 계정(로그아웃) */
function openAccount() { acctError(''); if (!cloud.user) acctShowChoice(); acctModal.classList.remove('hidden'); }
/** 처음 화면의 "다른 계정으로": 물어보지 않고 로그아웃하고 로그인/새 계정 고르기로 (아직 게임을 시작하기 전이라 저장할 것이 없다) */
document.getElementById('title-switch').onclick = async (e) => { e.preventDefault(); sound.ensure(); try { await cloud.signOut(); } catch (err) { console.warn('[cloud] 로그아웃', err); } acctShowChoice(); acctModal.classList.remove('hidden'); };
document.getElementById('btn-acct-close').onclick = () => acctModal.classList.add('hidden');
for (const el of [acctName, acctPin]) { el.addEventListener('keydown', (e) => { if (e.key === 'Enter') document.getElementById('btn-acct-go').click(); e.stopPropagation(); }); el.addEventListener('keyup', (e) => e.stopPropagation()); }
function acctInputs() {
  const name = acctName.value.trim(), pin = acctPin.value.trim();
  if (!validName(name)) { acctError('이름은 2~8글자, 띄어쓰기 없이 적어 주세요.'); return null; }
  if (!validPin(pin)) { acctError('비밀번호는 숫자 6자리예요.'); return null; }
  return { name, pin };
}
let acctBusy = false;
/** 로그인/가입 뒤 바로 시작: 클라우드 저장(또는 이 기기 저장)이 있으면 이어서, 없으면 그 이름으로 포켓몬 고르기 */
async function startWithAccount(u) {
  acctModal.classList.add('hidden');
  if (zone) { say(`☁️ ${u.name}로 로그인했어!`, { sec: 4 }); return; } // 게임 중 로그인: 그대로 계속
  let remote = null;
  try { remote = await cloud.loadGame(); }
  catch (e) { // 못 읽었으면 새로 시작하지 않는다: 새 게임의 자동 저장이 클라우드의 진짜 진행을 덮어쓰면 안 된다
    say(`☁️ 클라우드 저장을 못 읽었어 (${e.message}). 인터넷을 확인하고 시작하기를 다시 눌러 줘!`, { sec: 8 });
    return;
  }
  const local = loadSave(u.name);
  let d = null;
  if (remote && (!local || (remote.savedAt || 0) >= (local.savedAt || 0))) { d = remote; saveGame(remote); }
  else if (local) { d = local; cloud.saveGame(local, cloudSummary(local)).catch(() => {}); }
  titleEl.classList.add('hidden');
  if (d) { applySave(d); say(`☁️ ${u.name}의 모험을 이어서 해! (${formatWhen(d.savedAt)} 저장)`, { sec: 6 }); }
  else { state.name = u.name; state.admin = accountAdmin(u.name); starterEl.classList.remove('hidden'); renderStarter(); say(`☁️ ${u.name}, 함께 모험할 포켓몬을 골라 봐!`, { sec: 5 }); }
}
document.getElementById('btn-acct-go').onclick = async () => {
  const v = acctInputs(); if (!v || acctBusy) return; acctBusy = true; acctError('');
  try {
    const u = acctMode === 'signup' ? await cloud.signUp(v.name, v.pin) : await cloud.signIn(v.name, v.pin);
    acctPin.value = ''; await startWithAccount(u);
  } catch (e) { acctError(e.message); } finally { acctBusy = false; }
};
/** 로그아웃: 물어본 뒤 저장하고 로그아웃, 처음 화면으로 (페이지를 새로 연다) */
async function logoutAndRestart() {
  if (!confirm(`정말 로그아웃할까요?${zone ? ' 지금까지 한 것은 저장돼요.' : ''}`)) return;
  try {
    if (zone && player && !battle.active) { const data = buildSaveData(); saveGame(data); await cloud.saveGame(data, cloudSummary(data)); }
    await cloud.clearPresence();
    await cloud.signOut();
  } catch (e) { console.warn('[cloud] 로그아웃', e); }
  location.reload();
}
document.getElementById('btn-acct-logout').onclick = logoutAndRestart;
dexLogoutBtn.onclick = logoutAndRestart;
// 친구 탭: 이름으로 친구 요청 → 상대가 수락하면 서로 친구. 받은 요청은 수락/거절
async function renderFriends() {
  const box = dex.friendsEl;
  if (!cloud.user) { box.innerHTML = '<div class="friend-note">☁️ 계정으로 로그인하면 어느 기기에서든 이어 하고 친구를 추가할 수 있어요.</div><div class="friend-add"><button id="btn-friend-login">☁️ 로그인 / 계정 만들기</button></div>'; box.querySelector('#btn-friend-login').onclick = openAccount; return; }
  box.innerHTML = `<div class="friend-me">☁️ 나: ${cloud.user.name}</div>
    <div class="friend-add"><input id="friend-name" type="text" maxlength="8" placeholder="친구 이름" autocomplete="off" /><button id="btn-friend-add">➕ 친구 요청</button></div>
    <div class="friend-note">친구가 만든 계정 이름을 적어 요청을 보내면, 친구가 수락한 뒤부터 서로의 도감·정복 상황이 보여요.</div>
    <div id="friend-requests"></div><div id="friend-duels"></div><div id="friend-list"><div class="friend-note">불러오는 중…</div></div>`;
  const input = box.querySelector('#friend-name');
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') box.querySelector('#btn-friend-add').click(); e.stopPropagation(); }); input.addEventListener('keyup', (e) => e.stopPropagation());
  box.querySelector('#btn-friend-add').onclick = async () => {
    const n = input.value.trim(); if (!n) return;
    try { const p = await cloud.requestFriend(n); input.value = ''; say(`📨 ${p.name}에게 친구 요청을 보냈어! 수락하면 친구 목록에 나타나.`, { sec: 5 }); } catch (e) { say(`😢 ${e.message}`, { sec: 5 }); }
  };
  renderFriendList();
}
const friendsOpen = new Set(); // 펼쳐 둔 친구 (다시 그려도 유지)
/** 친구 탭의 목록: 받은 친구 요청 → ⚔ 대결(받은 신청·진행 중·보낸 신청·결과) → 내 친구(접힌 줄, 누르면 자세히) */
async function renderFriendList() {
  const box = dex.friendsEl, list = box.querySelector('#friend-list'), reqBox = box.querySelector('#friend-requests'), duelBox = box.querySelector('#friend-duels'); if (!list) return;
  let friends = [], requests = [];
  try { [friends, requests] = await Promise.all([cloud.listFriends(), cloud.listRequests()]); } catch (e) { list.innerHTML = `<div class="friend-note">친구 목록을 못 읽었어: ${e.message}</div>`; return; }
  reqBox.innerHTML = '';
  if (requests.length) {
    reqBox.innerHTML = `<div class="friend-me">📨 받은 친구 요청 ${requests.length}개</div>`;
    for (const r of requests.sort((a, b) => (b.at || 0) - (a.at || 0))) {
      const row = document.createElement('div'); row.className = 'friend-row';
      row.innerHTML = `<div class="save-info"><div class="save-name">${r.fromName || '?'}</div><div class="save-sub">친구가 되고 싶대요${r.at ? ` · ${formatWhen(r.at)}` : ''}</div></div>
        <button class="friend-accept">✅ 수락</button><button class="friend-decline">거절</button>`;
      row.querySelector('.friend-accept').onclick = async () => { try { await cloud.acceptRequest(r.uid); presence.refreshT = 0; say(`👫 ${josa(r.fromName, '과와')} 친구가 됐어!`, { sec: 4 }); } catch (e) { say(`😢 ${e.message}`, { sec: 5 }); } renderFriendList(); };
      row.querySelector('.friend-decline').onclick = async () => { await cloud.declineRequest(r.uid); renderFriendList(); };
      reqBox.appendChild(row);
    }
  }
  renderFriendDuels(duelBox);
  if (!friends.length) { list.innerHTML = '<div class="friend-note">아직 친구가 없어요. 위에 친구 이름을 적어 요청을 보내 봐요!</div>'; return; }
  list.innerHTML = '<div class="friend-me">👫 내 친구 <small class="friend-note">(이름을 누르면 자세히)</small></div>';
  const isOn = (f) => { const p = presence.friends.get(f.uid); return p && (!p.at || Date.now() - p.at < 60000) ? p : null; }; // 접속 중이면 presence (지역 포함)
  for (const f of friends.sort((a, b) => (isOn(b) ? 1 : 0) - (isOn(a) ? 1 : 0) || (b.updatedAt || 0) - (a.updatedAt || 0))) { // 접속 중인 친구 먼저
    const sp = f.leaderId ? speciesById[f.leaderId] : null, t = sp ? dex.thumbs(sp) : null;
    const on = isOn(f), busy = duels.list.some((x) => x.state !== 'done' && (x.players || []).includes(f.uid));
    const row = document.createElement('div'); row.className = 'friend-row' + (on ? ' online' : '') + (friendsOpen.has(f.uid) ? ' open' : '');
    row.innerHTML = `${t ? `<img src="${t.color}" alt="">` : '<div class="friend-noimg"></div>'}
      <div class="save-info"><div class="save-name">${f.name} <span class="friend-status ${on ? 'on' : 'off'}">${on ? `🟢 접속 중 · ${ZONE_INFO[on.zone]?.name || ''}` : '⚪ 로그오프'}</span></div></div>
      <button class="friend-duel" ${busy ? 'disabled title="이미 대결 중"' : 'title="내 대표 포켓몬으로 대결 신청"'}>⚔ 대결</button><span class="friend-toggle">▾</span>
      <div class="friend-detail"><div>📍 ${ZONE_INFO[f.zone]?.name || '?'} · 친구 ${f.caught || 0}마리 · 도감 ${f.dexCount || 0}종 · 정복 ${f.conquered || 0}/${ZONE_COUNT} · 블록 ${f.blocks || 0}개${sp ? ` · 대표 ${sp.name}` : ''}${f.updatedAt ? `<br>🕒 마지막 저장 ${formatWhen(f.updatedAt)}` : ''}</div><button class="save-del" title="친구 삭제">✕ 친구 삭제</button></div>`;
    row.onclick = (e) => { if (e.target.closest('button')) return; row.classList.toggle('open'); if (row.classList.contains('open')) friendsOpen.add(f.uid); else friendsOpen.delete(f.uid); };
    row.querySelector('.friend-duel').onclick = () => challengeFriend(f);
    row.querySelector('.save-del').onclick = async () => { if (confirm(`${josa(f.name, '을를')} 친구 목록에서 뺄까요?`)) { await cloud.removeFriend(f.uid); friendsOpen.delete(f.uid); renderFriendList(); } };
    list.appendChild(row);
  }
}
/** 친구 탭의 ⚔ 대결 묶음: 받은 신청(수락/거절) · 진행 중(대결판 열기·아레나) · 보낸 신청(취소) · 끝난 결과(지우기) */
function renderFriendDuels(box) {
  if (!box) return;
  const me = cloud.user?.uid; box.innerHTML = '';
  const list = [...duels.list].sort((a, b) => (duelNeedsMe(b) ? 1 : 0) - (duelNeedsMe(a) ? 1 : 0) || (b.updatedAt || 0) - (a.updatedAt || 0));
  if (!me || !list.length) return;
  box.innerHTML = '<div class="friend-me">⚔ 친구 대결</div>';
  for (const d of list) {
    const side = myDuelSide(d), other = side === 'a' ? 'b' : 'a', name = d.names?.[other] || '친구', mine = duelNeedsMe(d);
    const line = document.createElement('div'); line.className = 'duel-line' + (mine ? ' mine' : '') + (d.state === 'done' ? ' done' : '');
    let sub, btns;
    if (d.state === 'pending' && d.b === me) { sub = `📨 ${josa(name, '이가')} 대결을 신청했어 (${d.mons.a?.name || '?'} ⚔ ${d.mons.a?.atk})`; btns = '<button class="duel-open">보기 · 수락</button><button class="duel-decline secondary">거절</button>'; }
    else if (d.state === 'pending') { sub = `⏳ ${name}의 수락을 기다리는 중`; btns = '<button class="duel-go">🏟 아레나</button><button class="duel-decline secondary">취소</button>'; }
    else if (d.state === 'active') { sub = d.turn === side ? '👉 내 차례야!' : `⏳ ${name}의 차례`; btns = `<button class="duel-open">${d.turn === side ? '⚔ 대결판 열기' : '대결판 보기'}</button>${zone?.name !== 'arena' ? '<button class="duel-go secondary">🏟 아레나</button>' : ''}`; }
    else { sub = d.winner === side ? '🏆 내가 이겼어!' : `😢 ${josa(name, '이가')} 이겼어`; btns = '<button class="duel-decline secondary">지우기</button>'; }
    line.innerHTML = `<div class="save-info"><div class="save-name">⚔ ${name}</div><div class="save-sub">${sub}</div></div>${btns}`;
    line.querySelector('.duel-open')?.addEventListener('click', () => openDuelModal(d.id));
    line.querySelector('.duel-go')?.addEventListener('click', () => { dex.hide(); goToArena(); });
    line.querySelector('.duel-decline')?.addEventListener('click', async () => { await cloud.deleteDuel(d.id); });
    box.appendChild(line);
  }
}
// ---------- 요청 탭: 아이가 개발자에게 글·목소리·사진으로 요청을 보낸다. 관리자는 관리자 탭에서 보고 답장한다 ----------
const fb = { blob: null, mime: null, rec: null, recTimer: null, chunks: [] };
/** Blob → base64 (data: 접두어 없이) */
function blobToBase64(blob) { return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.onerror = rej; r.readAsDataURL(blob); }); }
/** 사진을 1024px 안, JPEG 로 줄인다 (Firestore 문서 1MB 한도 안에 들어가게) */
async function shrinkImage(file) {
  const bmp = await createImageBitmap(file).catch(() => null);
  if (!bmp) return file;
  const max = 1024, k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  for (const q of [0.75, 0.6, 0.45, 0.3]) { const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', q)); if (blob && blob.size <= 450000) return blob; }
  return await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.25));
}
function fbSetAttachment(blob, mime) { fb.blob = blob; fb.mime = mime; renderFbPreview(); }
function renderFbPreview() {
  const box = dex.feedbackEl.querySelector('#fb-preview'); if (!box) return;
  if (!fb.blob) { box.classList.add('hidden'); box.innerHTML = ''; return; }
  box.classList.remove('hidden');
  const url = URL.createObjectURL(fb.blob);
  box.innerHTML = fb.mime.startsWith('image/') ? `<img src="${url}" alt=""><span>📷 사진 (${Math.round(fb.blob.size / 1024)}KB)</span>` : `<audio controls src="${url}"></audio>`;
  const del = document.createElement('button'); del.className = 'save-del'; del.textContent = '✕'; del.title = '붙인 것 빼기'; del.onclick = () => fbSetAttachment(null, null);
  box.appendChild(del);
}
async function fbToggleRecord(btn) {
  if (fb.rec) { fb.rec.stop(); return; }
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) { say('이 브라우저에서는 목소리 녹음이 안 돼요. 글이나 사진으로 보내 주세요.', { sec: 5 }); return; }
  let stream;
  try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); } catch (_) { say('마이크를 쓸 수 없어요. 브라우저에서 마이크 허용을 눌러 주세요.', { sec: 5 }); return; }
  const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'].find((m) => MediaRecorder.isTypeSupported(m)) || '';
  const rec = new MediaRecorder(stream, mime ? { mimeType: mime, audioBitsPerSecond: 32000 } : undefined);
  fb.chunks = []; fb.rec = rec;
  rec.ondataavailable = (e) => { if (e.data.size) fb.chunks.push(e.data); };
  rec.onstop = () => {
    clearTimeout(fb.recTimer); fb.rec = null; stream.getTracks().forEach((t) => t.stop());
    btn.classList.remove('rec'); btn.textContent = '🎤 목소리 녹음';
    const blob = new Blob(fb.chunks, { type: rec.mimeType || mime || 'audio/webm' });
    if (blob.size > 0) fbSetAttachment(blob, blob.type.split(';')[0]);
  };
  rec.start(250);
  btn.classList.add('rec'); btn.textContent = '⏹ 녹음 끝내기 (30초까지)';
  fb.recTimer = setTimeout(() => { if (fb.rec) fb.rec.stop(); }, 30000);
}
async function renderFeedback() {
  const box = dex.feedbackEl;
  if (!cloud.user) { box.innerHTML = '<div class="friend-note">☁️ 계정으로 로그인하면 만든 사람에게 하고 싶은 말을 보낼 수 있어요.</div><div class="friend-add"><button id="btn-fb-login">☁️ 로그인 / 계정 만들기</button></div>'; box.querySelector('#btn-fb-login').onclick = openAccount; return; }
  box.innerHTML = `<div class="friend-me">📨 만든 사람에게 요청하기</div>
    <div class="friend-note">게임에 넣고 싶은 것, 고쳤으면 하는 것을 글로 적거나, 목소리로 말하거나, 종이에 쓴 걸 사진으로 찍어 보내요.</div>
    <textarea id="fb-text" maxlength="1000" placeholder="예: 리자몽이 하늘을 날았으면 좋겠어요"></textarea>
    <div class="fb-tools"><button id="fb-rec">🎤 목소리 녹음</button><button id="fb-photo">📷 사진 찍기 / 고르기</button><input id="fb-file" type="file" accept="image/*" capture="environment" hidden /></div>
    <div id="fb-preview" class="fb-preview hidden"></div>
    <button id="fb-send" class="fb-send">📨 보내기</button>
    <div id="fb-mine"><div class="friend-note">불러오는 중…</div></div>`;
  const ta = box.querySelector('#fb-text');
  ta.addEventListener('keydown', (e) => e.stopPropagation()); ta.addEventListener('keyup', (e) => e.stopPropagation());
  box.querySelector('#fb-rec').onclick = (e) => fbToggleRecord(e.currentTarget);
  const file = box.querySelector('#fb-file');
  box.querySelector('#fb-photo').onclick = () => file.click();
  file.onchange = async () => { const f = file.files?.[0]; if (!f) return; const small = await shrinkImage(f); fbSetAttachment(small, 'image/jpeg'); file.value = ''; };
  box.querySelector('#fb-send').onclick = async (e) => {
    const btn = e.currentTarget; btn.disabled = true;
    try {
      const data = fb.blob ? await blobToBase64(fb.blob) : null;
      await cloud.sendFeedback({ text: ta.value, mime: fb.blob ? fb.mime : null, data });
      ta.value = ''; fbSetAttachment(null, null);
      say('📨 보냈어! 고마워, 잘 읽어 볼게!', { sec: 5 }); confetti.burst(80);
      renderMyFeedback();
    } catch (err) { say(`😢 ${err.message}`, { sec: 5 }); } finally { btn.disabled = false; }
  };
  renderFbPreview();
  renderMyFeedback();
}
function fbItemHtml(f, admin) {
  const media = f.data && f.mime ? (f.mime.startsWith('image/') ? `<img src="data:${f.mime};base64,${f.data}" alt="">` : `<audio controls src="data:${f.mime};base64,${f.data}"></audio>`) : '';
  return `<div class="fb-meta">${admin ? `<b>${f.name}</b> · ` : ''}${formatWhen(f.at)}</div>${f.text ? `<div class="fb-body">${f.text.replace(/</g, '&lt;')}</div>` : ''}${media}${f.reply ? `<div class="fb-reply">💬 답장: ${f.reply.replace(/</g, '&lt;')}</div>` : ''}`;
}
async function renderMyFeedback() {
  const list = dex.feedbackEl.querySelector('#fb-mine'); if (!list) return;
  let mine = [];
  try { mine = await cloud.listMyFeedback(); } catch (e) { list.innerHTML = ''; return; }
  if (!mine.length) { list.innerHTML = ''; return; }
  list.innerHTML = '<div class="friend-me">📬 내가 보낸 요청</div>';
  for (const f of mine.sort((a, b) => b.at - a.at).slice(0, 20)) { const el = document.createElement('div'); el.className = 'fb-item'; el.innerHTML = fbItemHtml(f, false); list.appendChild(el); }
}
/** 관리자 탭: 받은 요청 모두 보기 + 답장 + 삭제 */
async function renderAdminFeedback() {
  const box = dex.adminEl; let sec = box.querySelector('#admin-fb');
  if (!sec) { sec = document.createElement('div'); sec.id = 'admin-fb'; box.appendChild(sec); }
  if (!cloud.user) { sec.innerHTML = ''; return; }
  sec.innerHTML = '<div class="admin-title">📨 아이들이 보낸 요청</div><div class="friend-note">불러오는 중…</div>';
  let all = [];
  try { all = await cloud.listAllFeedback(); } catch (e) { sec.innerHTML = `<div class="admin-title">📨 아이들이 보낸 요청</div><div class="friend-note">못 읽었어: ${e.message} (관리자 계정으로 로그인했는지, 규칙을 붙였는지 확인)</div>`; return; }
  sec.innerHTML = `<div class="admin-title">📨 아이들이 보낸 요청 ${all.length}개</div>`;
  if (!all.length) { sec.insertAdjacentHTML('beforeend', '<div class="friend-note">아직 없어요.</div>'); return; }
  for (const f of all) {
    const el = document.createElement('div'); el.className = 'fb-item';
    el.innerHTML = fbItemHtml(f, true) + `<div class="fb-admin"><input type="text" maxlength="300" placeholder="답장 쓰기" value="${(f.reply || '').replace(/"/g, '&quot;')}"><button class="fb-reply-btn">답장</button><button class="fb-del-btn">삭제</button></div>`;
    const input = el.querySelector('input'); input.addEventListener('keydown', (e) => e.stopPropagation()); input.addEventListener('keyup', (e) => e.stopPropagation());
    el.querySelector('.fb-reply-btn').onclick = async () => { try { await cloud.replyFeedback(f.id, input.value.trim()); say('답장했어!', { sec: 3 }); renderAdminFeedback(); } catch (e) { say(`😢 ${e.message}`, { sec: 5 }); } };
    el.querySelector('.fb-del-btn').onclick = async () => { if (confirm('이 요청을 지울까요?')) { await cloud.deleteFeedback(f.id); renderAdminFeedback(); } };
    sec.appendChild(el);
  }
}
dex.onTab = (tab) => { if (tab === 'friends') { presence.refreshT = 0; renderFriends(); } if (tab === 'feedback') renderFeedback(); if (tab === 'rank') renderRank(dex.rankEl, true); if (tab === 'learn') renderLearn(dex.learnEl); if (tab === 'goals') renderGoals(dex.goalsEl); if (tab === 'admin' && state.admin) renderAdminFeedback(); };
// ---------- PWA: 서비스 워커(오프라인·모델 캐시·새 버전 안내)와 "홈 화면에 추가" 안내 ----------
const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true; // 홈 화면에서 열었나
const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); // 아이패드는 Mac 인 척 한다
const installBtn = document.getElementById('btn-install'), installModal = document.getElementById('install-modal');
let installPrompt = null; // 안드로이드 크롬이 주는 설치 창 (있으면 버튼으로 바로 띄운다)
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installPrompt = e; });
window.addEventListener('appinstalled', () => { installBtn.hidden = true; });
installBtn.hidden = isStandalone(); // 이미 홈 화면에서 열었으면 안내가 필요 없다
/** 기기별 홈 화면 추가 순서 (iOS 는 자동 설치 창이 없어서 손으로 하는 순서를 그림처럼 보여 준다) */
function installSteps() {
  const ua = navigator.userAgent;
  if (isIOS()) {
    const inApp = /KAKAOTALK|Line\/|Instagram|FBAN|FBAV|NAVER/i.test(ua) || (!/Safari/.test(ua) && !/CriOS|FxiOS/.test(ua));
    return [
      ...(inApp ? ['<li class="install-note">지금 열린 앱(카카오톡 등)의 창에서는 안 돼요. 오른쪽 위 메뉴에서 <b>Safari로 열기</b>를 먼저 눌러 주세요.</li>'] : []),
      '<li><b>Safari</b>로 이 게임을 열어요. (아이폰은 화면 아래, 아이패드는 화면 위에 버튼이 있어요)</li>',
      '<li><b>공유 버튼</b>(네모에서 화살표가 위로 나가는 모양)을 눌러요.</li>',
      '<li>목록을 조금 내려서 <b>"홈 화면에 추가"</b>를 눌러요.</li>',
      '<li>오른쪽 위 <b>추가</b>를 누르면 홈 화면에 넘버몬스터 아이콘이 생겨요!</li>',
    ];
  }
  if (/Android/i.test(ua)) return [
    '<li><b>크롬</b>으로 이 게임을 열어요.</li>',
    '<li>오른쪽 위 <b>⋮ 메뉴</b>를 눌러요.</li>',
    '<li><b>"홈 화면에 추가"</b> 또는 <b>"앱 설치"</b>를 누르고 <b>설치</b>를 눌러요.</li>',
    '<li class="install-note">아래에 "홈 화면에 추가" 안내가 떠 있으면 그걸 눌러도 돼요.</li>',
  ];
  return [
    '<li><b>크롬</b>이나 <b>엣지</b>로 이 게임을 열어요.</li>',
    '<li>주소창 오른쪽 끝의 <b>설치 아이콘</b>(모니터에 아래 화살표)을 눌러요.</li>',
    '<li><b>설치</b>를 누르면 앱처럼 창이 따로 열려요.</li>',
  ];
}
installBtn.onclick = async () => {
  sound.ensure();
  if (installPrompt) { // 안드로이드·데스크톱 크롬: 바로 설치 창
    installPrompt.prompt();
    const r = await installPrompt.userChoice.catch(() => null); installPrompt = null;
    if (r?.outcome === 'accepted') { installBtn.hidden = true; return; }
  }
  document.getElementById('install-steps').innerHTML = installSteps().join('');
  installModal.classList.remove('hidden');
};
document.getElementById('btn-install-close').onclick = () => installModal.classList.add('hidden');
const INSTALL_LINK = 'https://merrypapa.github.io/number-pokemon/install.html'; // 이 주소 하나만 보내면, 받은 사람 폰에 맞는 설치 방법이 나온다
document.getElementById('btn-install-copy').onclick = (e) => {
  const btn = e.currentTarget;
  const done = () => { btn.textContent = '✅ 복사했어요'; setTimeout(() => { btn.textContent = '🔗 주소 복사'; }, 2500); };
  if (navigator.clipboard) navigator.clipboard.writeText(INSTALL_LINK).then(done, () => prompt('이 주소를 복사해 주세요', INSTALL_LINK));
  else prompt('이 주소를 복사해 주세요', INSTALL_LINK);
};
if ('serviceWorker' in navigator && !location.search.includes('nosw') && location.protocol !== 'file:') {
  const hadController = !!navigator.serviceWorker.controller; // 처음 설치될 때(controller 가 없다가 생길 때)는 새로 열 필요가 없다
  const updateBar = document.getElementById('update-bar');
  const applyUpdate = (worker) => { updateBar.textContent = '새 버전으로 바꾸는 중…'; worker.postMessage('SKIP_WAITING'); }; // 바뀌면 아래 controllerchange 가 새로고침한다
  const offerUpdate = (worker) => {
    if (!zone || !player) { applyUpdate(worker); return; } // 아직 게임을 시작하지 않았으면(타이틀 화면) 묻지 않고 바로 새 버전으로 — 아이가 막대를 못 눌러 옛 버전에 머무르지 않게
    updateBar.hidden = false; // 게임 중에는 묻는다 (갑자기 새로고침되면 곤란하니까)
    document.getElementById('btn-update').onclick = () => { if (zone && player) doSave(false); applyUpdate(worker); };
  };
  navigator.serviceWorker.register('./sw.js').then((reg) => {
    if (reg.waiting && hadController) offerUpdate(reg.waiting);
    reg.addEventListener('updatefound', () => { const w = reg.installing; w?.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) offerUpdate(w); }); });
    reg.update().catch(() => {}); // 열 때마다 새 버전 확인 (이게 없으면 새 버전을 올려도 한 시간 뒤에야 알아챘다)
    document.addEventListener('visibilitychange', () => { if (!document.hidden) reg.update().catch(() => {}); }); // 홈 화면 앱을 다시 켤 때도 확인
    setInterval(() => reg.update().catch(() => {}), 60 * 60 * 1000); // 오래 켜 두어도 한 시간마다 새 버전을 확인
  }).catch((e) => console.warn('[sw] 등록 실패', e));
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (!hadController || reloading) return; reloading = true; location.reload(); });
}
// ---------- 같이 놀기 1단계: 같은 지역에 있는 친구가 보인다 (src/presence.js, Realtime Database presence/{uid}) ----------
const ghosts = new Ghosts(speciesById);
ghosts.onAppear = (name) => say(`👫 ${josa(name, '이가')} 같은 지역에 있어! 손을 흔들어 봐 👋`, { sec: 5 });
const presence = { t: 0, heart: 0, last: null, friends: new Map(), watches: new Map(), refreshT: 0, emote: null, emoteAt: 0, mySprite: null, myShown: 0 };
const emoteRow = document.getElementById('hud-emote-row');
emoteRow.querySelectorAll('button').forEach((b) => { b.onclick = () => sendEmote(b.textContent.trim()); });
/** 감정 표현: 내 머리 위에 3초 + 친구들에게 보낸다 */
function sendEmote(e) { presence.emote = e; presence.emoteAt = Date.now(); presence.myShown = presence.emoteAt; presence.t = 0; sound.click(); }
/** 매 프레임: 내 위치 올리기(0.3초마다, 움직였을 때) + 친구 유령 맞추기 */
function presenceTick(dt) {
  if (!zone || !player || !cloud.presenceOn) { if (ghosts.count) ghosts.setZone(null, null); emoteRow.hidden = true; return; }
  if (ghosts.zoneName !== zone.name) ghosts.setZone(zone.scene, zone.name);
  presence.refreshT -= dt;
  if (presence.refreshT <= 0) { presence.refreshT = 300; refreshPresenceFriends(); } // 친구 목록은 5분마다 (친구 탭을 열거나 수락하면 바로) — Firestore 읽기 절약
  presence.t -= dt; presence.heart += dt;
  if (presence.t <= 0) {
    presence.t = player.moving ? 0.1 : 0.3; // 움직일 때는 초당 10번 (친구 화면에서 끊기지 않게), 가만히 있으면 0.3초
    const p = player.position;
    const d = { zone: zone.name, x: +p.x.toFixed(2), y: +p.y.toFixed(2), z: +p.z.toFixed(2), f: +player.facing.toFixed(2), vx: +player.vx.toFixed(2), vz: +player.vz.toFixed(2), l: party.leader?.speciesId || null, m: !!player.moving, e: presence.emote, et: presence.emoteAt };
    const L = presence.last;
    const changed = !L || L.zone !== d.zone || Math.hypot(L.x - d.x, L.z - d.z) > 0.05 || Math.abs(L.y - d.y) > 0.05 || L.f !== d.f || L.m !== d.m || L.et !== d.et || L.l !== d.l || Math.abs(L.vx - d.vx) > 0.2 || Math.abs(L.vz - d.vz) > 0.2;
    if (changed || presence.heart > 5) { presence.last = d; presence.heart = 0; cloud.setPresence(d).catch((e) => console.warn('[presence]', e)); } // 5초마다는 그대로라도 한 번 (살아 있다는 표시)
  }
  ghosts.sync([...presence.friends.values()]);
  ghosts.update(dt);
  emoteRow.hidden = ghosts.count === 0; // 같은 지역에 친구가 있을 때만 감정 표현 버튼
  if (presence.emote && Date.now() - presence.myShown < 3000) {
    if (presence.mySprite && presence.mySprite.userData.emote !== presence.emote) { player.group.remove(presence.mySprite); presence.mySprite = null; } // 다른 표현을 누르면 바로 바뀐다
    if (!presence.mySprite) { presence.mySprite = makeEmoteSprite(presence.emote); presence.mySprite.userData.emote = presence.emote; player.group.add(presence.mySprite); }
  }
  else if (presence.mySprite) { player.group.remove(presence.mySprite); presence.mySprite = null; }
}
async function refreshPresenceFriends() {
  let friends = [];
  try { friends = await cloud.listFriends(); } catch (_) { return; }
  const ids = new Set(friends.map((f) => f.uid));
  for (const [uid, off] of presence.watches) if (!ids.has(uid)) { off(); presence.watches.delete(uid); presence.friends.delete(uid); }
  for (const f of friends) if (!presence.watches.has(f.uid)) {
    let first = true, online = false;
    presence.watches.set(f.uid, cloud.watchPresence(f.uid, (v) => {
      const name = v?.name || f.name, where = v?.zone ? (ZONE_INFO[v.zone]?.name || v.zone) : '';
      if (v) presence.friends.set(f.uid, { ...v, uid: f.uid, name }); else presence.friends.delete(f.uid);
      // 접속 알림: 처음 볼 때 이미 접속 중이면 "접속 중", 나중에 들어오면 "접속했어", 나가면 "나갔어"
      const now = !!v && (!v.at || Date.now() - v.at < 60000);
      if (first) { first = false; if (now) { say(`👫 ${josa(name, '이가')} 지금 접속해 있어! (${where})`, { sec: 5 }); } }
      else if (now && !online) { sound.pickup(); say(`👫 ${josa(name, '이가')} 접속했어! ${where}에 있어. 만나러 가 볼까?`, { sec: 6 }); }
      else if (!now && online) say(`👋 ${josa(name, '이가')} 나갔어.`, { sec: 4 });
      online = now;
    }));
  }
}
function stopPresence() { for (const off of presence.watches.values()) off(); presence.watches.clear(); presence.friends.clear(); presence.last = null; }
window.addEventListener('pagehide', () => { cloud.clearPresence(); });
// ---------- 같이 놀기 2단계: 친구 대결 (src/duel.js, Firestore duels/{id}) ----------
const duelBadge = document.getElementById('duel-badge'); // 친구 탭 배지: 내가 할 일(받은 신청·내 차례) 수
const duels = { list: [], off: null, seen: new Map(), created: new Set() }; // seen: id → 마지막으로 본 상태 (알림은 바뀔 때만), created: 이번에 내가 신청한 대결 (수락되면 팝업)
const duelKey = (d) => `${d.state}:${d.turn}:${(d.log || []).length}`;
const myDuelSide = (d) => sideOf(d, cloud.user?.uid);
const duelNeedsMe = (d) => (d.state === 'pending' && d.b === cloud.user?.uid) || (d.state === 'active' && d.turn === myDuelSide(d));
function startDuelWatch() { stopDuelWatch(); duels.off = cloud.watchDuels((list) => { duels.list = list; onDuelsChanged(); }); }
function stopDuelWatch() { duels.off?.(); duels.off = null; duels.list = []; duels.seen.clear(); duelBadge.hidden = true; }
// 대결 팝업: 신청이 오면 수락/거절/닫기, 신청한 쪽은 수락되면 "아레나로 가기". 아레나에서 친구 가까이 "대결!" 을 누르면 같은 팝업이 실시간 대결판이 된다
const duelModal = document.getElementById('duel-modal'), duelModalBody = document.getElementById('duel-modal-body');
let duelModalId = null; // 열려 있는 대결 (문서가 바뀌면 다시 그린다)
function openDuelModal(id) { duelModalId = id; renderDuelModal(); duelModal.classList.remove('hidden'); input.endFrame?.(); }
function closeDuelModal() { duelModal.classList.add('hidden'); duelModalId = null; }
document.getElementById('btn-duel-modal-close').onclick = () => { if (duelStage.active) leaveDuelStage('무대에서 내려왔어. 자리에 다시 올라서면 이어서 할 수 있어!'); else closeDuelModal(); };
/** 아레나로 이동 (이미 아레나면 그대로). 대결·탈것·전환 중이면 말만 한다 */
function goToArena() {
  if (!zone || zone.name === 'arena') { say('🏟 여기가 아레나야! 친구가 오면 가까이 가서 대결! 버튼을 눌러.', { sec: 5 }); return; }
  if (battle.active || ride || switching || evo) { say('지금은 못 가. 끝나고 다시 눌러 줘!', { sec: 4 }); return; }
  closeDuelModal();
  switchZone('arena', getZone('arena').world.spawn, { text: '🏟 넘버볼 아레나! 친구가 도착하면 가까이 가서 대결! 버튼을 눌러.', sec: 7 });
}
// ----- 아레나 무대 위 3D 대결 (src/duelstage.js) -----
// 예전에는 어디에 서 있든 도감 카드로 대결했다. 이제는 무대 위 제 자리(1P·2P)에 올라가야 열리고,
// 두 포켓몬이 무대에서 마주 서서 기술을 쓸 때마다 달려들어 때린다.
const duelStage = new DuelStage({ camera, particles, sound, confetti });
let duelPlay = null; // { id, side, logSeen } — 무대에서 진행 중인 대결
/** 그 편이 설 무대 위 자리 (a = 파란 1P, b = 빨간 2P) */
const arenaSpot = (side) => (side === 'b' ? ARENA.spots.b : ARENA.spots.a);
/** 포켓몬이 설 자리: 1P·2P 표시보다 가운데로 조금 당긴다 (14m 는 너무 멀어 서로 작게 보인다) */
const monSpot = (side) => { const s = arenaSpot(side), r = ARENA.ring; return { x: r.x + (s.x - r.x) * 0.6, z: r.z + (s.z - r.z) * 0.6 }; };
/** 대결 문서에 찍힌 포켓몬의 모습 (모델이 있으면 모델로) */
function duelMonMesh(mon) {
  const sp = speciesById[mon?.speciesId];
  if (!sp) return null;
  const mesh = buildDraftMesh(sp);
  mesh.scale.setScalar(partyScale(sp));
  return mesh;
}
function enterDuelStage(d) {
  if (duelStage.active || battle.active || switching || evo || ride) return;
  const me = cloud.user?.uid, side = sideOf(d, me);
  if (!side || d.state !== 'active') return;
  const other = side === 'a' ? 'b' : 'a';
  const myMesh = duelMonMesh(d.mons[side]), theirMesh = duelMonMesh(d.mons[other]);
  if (!myMesh || !theirMesh) { say('포켓몬 모습을 못 불러왔어… 도감 대결 탭에서 해 보자.', { sec: 5 }); return; }
  duelStage.start({
    scene: zone.scene,
    mySpot: monSpot(side), theirSpot: monSpot(other), stageY: 0.32,
    mine: { mesh: myMesh, name: d.mons[side].name }, theirs: { mesh: theirMesh, name: d.mons[other].name },
    hide: [player.group, myStack.mesh, ...chain.followers.map((f) => f.mesh)], // 주인공과 따라다니는 친구는 무대에서 비킨다
  });
  duelPlay = { id: d.id, side, logSeen: (d.log || []).length };
  duelModalId = d.id;
  duelModal.classList.add('stage'); // 카드를 화면 아래 띠로 (무대가 보이게)
  duelModal.classList.remove('hidden');
  renderDuelModal();
  bgmRefresh();
  input.endFrame();
  say(`⚔ ${d.mons[side].name} vs ${d.mons[other].name}! ${d.turn === side ? '내 차례야 — 아래에서 기술을 골라!' : '상대 차례야, 잠깐 기다리자.'}`, { sec: 6 });
}
function leaveDuelStage(msg) {
  if (!duelStage.active) return;
  duelStage.end();
  duelPlay = null;
  duelModal.classList.remove('stage');
  closeDuelModal();
  snapCam = true; // 카메라를 주인공에게 되돌린다
  bgmRefresh();
  if (msg) say(msg, { sec: 6 });
}
const duelThumb = (id) => { const sp = speciesById[id]; return sp ? dex.thumbs(sp)?.color || null : null; };
function renderDuelModal() {
  const d = duels.list.find((x) => x.id === duelModalId), me = cloud.user?.uid;
  if (!d || !me) { closeDuelModal(); return; }
  const side = myDuelSide(d), other = side === 'a' ? 'b' : 'a', name = d.names?.[other] || '친구';
  let html;
  if (d.state === 'pending' && d.b === me) { // 받은 신청
    const mon = d.mons.a;
    html = `<div class="duel-invite"><div class="menu-title">⚔ ${josa(name, '이가')} 대결을 신청했어!</div>
      <div class="menu-sub">${name}의 대표 ${mon?.name || '?'} (⚔ ${mon?.atk} · ❤ ${mon?.maxHp}) 이(가) 기다리고 있어. 수락하면 내 대표 ${josa(party.leader ? party.name(party.leader) : '포켓몬', '이가')} 나가고, 넘버볼 아레나로 이동해!</div>
      ${mon ? `<div class="duel-mon"><div class="duel-who">${name}</div>${duelThumb(mon.speciesId) ? `<img src="${duelThumb(mon.speciesId)}" alt="">` : ''}<div class="duel-name">${mon.name} <span class="party-type">${mon.type}</span></div></div>` : ''}
      <div class="duel-actions"><button class="duel-accept">✅ 수락 → 아레나로!</button><button class="duel-decline">거절</button></div>
      <div class="friend-note">닫기(✕)를 누르면 나중에 도감 → 대결 탭에서 다시 볼 수 있어.</div></div>`;
  } else if (d.state === 'pending') { // 내가 보낸 신청
    html = `<div class="duel-invite"><div class="menu-title">⏳ ${name}의 수락을 기다리는 중</div><div class="menu-sub">수락하면 알려 줄게. 그동안 아레나에서 기다려도 좋아!</div>
      <div class="duel-actions"><button class="duel-go">🏟 아레나로 가기</button><button class="duel-decline">신청 취소</button></div></div>`;
  } else {
    html = duelCardHtml(d, me, duelThumb) + (d.state === 'active' && zone?.name !== 'arena' ? '<div class="duel-actions"><button class="duel-go">🏟 아레나로 가기</button></div>' : '');
  }
  duelModalBody.innerHTML = html;
  bindDuelCard(duelModalBody, d, { onAccept: () => { if (dex.open) dex.hide(); setTimeout(goToArena, 600); } });
}
/** 카드 안의 버튼들 (도감 대결 탭과 팝업이 같이 쓴다) */
function bindDuelCard(box, d, { onAccept = null } = {}) {
  const me = cloud.user?.uid, id = d.id;
  box.querySelector('.duel-accept')?.addEventListener('click', async () => {
    const L = party.leader;
    if (!L) { say('대표 포켓몬이 있어야 대결할 수 있어!', { sec: 4 }); return; }
    if (party.isFainted(L)) { say(`${josa(party.name(L), '은는')} 기절했어. 오박사님이나 아레나의 봄이에게 치료받고 수락하자.`, { sec: 5 }); return; }
    const mon = snapshotMon(party, L);
    const ok = await cloud.duelTx(id, (cur) => acceptPatch(cur, me, mon)).catch(() => false);
    if (ok) { sound.fanfare(); say(`⚔ 대결 시작! ${josa(d.names.a, '이가')} 먼저 공격해.`, { sec: 5 }); onAccept?.(); }
  });
  box.querySelector('.duel-decline')?.addEventListener('click', async () => { await cloud.deleteDuel(id); closeDuelModal(); });
  box.querySelector('.duel-go')?.addEventListener('click', goToArena);
  box.querySelectorAll('.duel-skill').forEach((b) => b.addEventListener('click', async () => {
    const ok = await cloud.duelTx(id, (cur) => attackPatch(cur, me, +b.dataset.skill)).catch(() => false);
    if (ok) sound.hit(); else say('지금은 내 차례가 아니야!', { sec: 3 });
  }));
}
/** 대결 문서가 바뀔 때마다: 알림(신청·내 차례), 끝난 대결 보상(각자 한 번), 오래된 대결 정리, 탭 배지 */
function onDuelsChanged() {
  const me = cloud.user?.uid; if (!me) return;
  const now = Date.now();
  for (const d of duels.list) {
    const side = myDuelSide(d), other = side === 'a' ? 'b' : 'a', name = d.names?.[other] || '친구';
    const key = duelKey(d), prev = duels.seen.get(d.id);
    if (prev !== key) {
      duels.seen.set(d.id, key);
      if (d.state === 'pending' && d.b === me && prev === undefined) { sound.pickup(); say(`⚔ ${josa(name, '이가')} 대결을 신청했어!`, { sec: 6 }); if (!battle.active && !ride && !evo) openDuelModal(d.id); }
      else if (d.state === 'active' && d.a === me && (prev?.startsWith('pending') || (prev === undefined && duels.created.has(d.id)))) { duels.created.delete(d.id); sound.fanfare(); say(`⚔ ${josa(name, '이가')} 수락했어! 아레나로 가서 만나자.`, { sec: 6 }); if (!battle.active && !ride && !evo) openDuelModal(d.id); }
      else if (d.state === 'active' && d.turn === side && prev !== undefined) { sound.pickup(); if (duelModalId !== d.id) say(`⚔ ${josa(name, '과와')}의 대결, 내 차례야! ${zone?.name === 'arena' ? '친구 가까이서 대결! 버튼을' : '도감 → 대결 탭을'} 눌러.`, { sec: 6 }); }
    }
    // 무대에서 보고 있는 대결이면, 새로 쌓인 공격을 그대로 보여 준다 (달려들어 때리기)
    if (duelStage.active && duelPlay && d.id === duelPlay.id) {
      const log = d.log || [];
      for (let i = duelPlay.logSeen; i < log.length; i++) {
        const l = log[i];
        const skill = d.mons?.[l.who]?.skills?.find((s) => s.name === l.skill);
        setTimeout(() => { if (duelStage.active) duelStage.attack(l.who === duelPlay.side, { dmg: l.dmg, mult: l.mult, kind: skill?.kind || 'tackle' }); }, (i - duelPlay.logSeen) * 1500);
      }
      duelPlay.logSeen = log.length;
      if (d.state === 'done') {
        const iWon = d.winner === duelPlay.side;
        setTimeout(() => { if (duelStage.active) duelStage.cheer(iWon); }, 1600);
        setTimeout(() => leaveDuelStage(null), 7500); // 보상 말풍선은 아래 done 처리가 띄운다
      }
    }
    if (d.state === 'done' && !d.rewarded?.[me] && !d.rewarding) { // 결과 보상은 각자 한 번씩 (문서에 표시)
      d.rewarding = true;
      const won = d.winner === side, gain = won ? DUEL_REWARD.win : DUEL_REWARD.lose;
      cloud.duelTx(d.id, (cur) => (cur.rewarded?.[me] ? null : { rewarded: { ...(cur.rewarded || {}), [me]: true } })).then((ok) => {
        if (!ok) return;
        setBlocks(state.blocks + gain); if (won) { wkAdd('duel'); state.goals.stats.duels++; checkNewStickers(); sound.fanfare(); confetti.burst(120); }
        say(won ? `🏆 ${josa(name, '과와')}의 대결에서 이겼어! 블록 ${gain}개!` : `😢 ${josa(name, '과와')}의 대결에서 졌어… 그래도 블록 ${gain}개! 포켓몬을 더 키워서 다시 도전하자.`, { sec: 7 });
        refreshHud(); autosave();
      }).catch(() => {});
    }
    if (d.state === 'done' && now - (d.updatedAt || 0) > DUEL_KEEP_MS) cloud.deleteDuel(d.id); // 일주일 지난 결과는 지운다
  }
  const n = duels.list.filter(duelNeedsMe).length;
  duelBadge.textContent = n; duelBadge.hidden = n === 0;
  if (dex.open && dex.tab === 'friends') renderFriendList();
  if (duelModalId) renderDuelModal();
}
/** 친구 탭의 ⚔ 대결: 내 대표 포켓몬의 지금 모습으로 신청 */
async function challengeFriend(f) {
  const L = party.leader;
  if (!L) { say('대표 포켓몬이 있어야 대결할 수 있어!', { sec: 4 }); return; }
  if (party.isFainted(L)) { say(`${josa(party.name(L), '은는')} 기절했어. 오박사님께 치료받고 신청하자.`, { sec: 5 }); return; }
  if (duels.list.some((x) => x.state !== 'done' && (x.players || []).includes(f.uid))) { say(`${josa(f.name, '과와')}는 이미 대결 중이야! 도감 → 대결 탭을 봐.`, { sec: 5 }); return; }
  try { const id = await cloud.createDuel(f, snapshotMon(party, L)); duels.created.add(id); sound.click(); say(`⚔ ${f.name}에게 ${josa(party.name(L), '으로')} 대결을 신청했어! 수락하면 알려 줄게.`, { sec: 6 }); }
  catch (e) { say(`😢 ${e.message}`, { sec: 5 }); }
}
// ---------- 주간 순위표: 도감 "순위" 탭과 처음 화면의 "이번 주 순위" 버튼이 같은 그림을 그린다 ----------
const rankModal = document.getElementById('rank-modal');
document.getElementById('btn-rank').onclick = () => { sound.ensure(); rankModal.classList.remove('hidden'); renderRank(document.getElementById('rank-modal-body'), false); };
document.getElementById('btn-rank-close').onclick = () => rankModal.classList.add('hidden');
/** 순위 그리기. inGame 이면 내 이번 주 점수 카드와 친구 순위(이름 그대로)도 넣는다. 전체 TOP 20 은 이름을 가려서 보여 준다 */
async function renderRank(el, inGame) {
  checkWeek(false); // 게임을 켜 둔 채 월요일을 넘겼을 수 있다 — 표와 내 점수가 서로 다른 주를 가리키지 않게 먼저 맞춘다
  const week = weekKey(), me = cloud.user?.uid || null;
  const thumb = (id) => { const sp = id ? speciesById[id] : null; return sp ? dex.thumbs(sp)?.color || null : null; };
  el.innerHTML = `<div class="rank-head">🏆 이번 주 순위 <span class="rank-how">(${weekRange(week)})</span></div>
    <div class="rank-how">점수 = 퀴즈 정답 ×${WEIGHTS.quiz} + 포켓몬 잡기 ×${WEIGHTS.caught} + 보스 정복 ×${WEIGHTS.boss} + 친구 대결 승리 ×${WEIGHTS.duel} · 월요일마다 새로 시작</div>
    ${inGame && zone ? `<div class="rank-mine">내 이번 주 <b>${weekScore(state.wk)}</b>점 <span>퀴즈 ${state.wk.quiz || 0} · 잡기 ${state.wk.caught || 0} · 보스 ${state.wk.boss || 0}</span>${state.lastWk ? `<span class="rank-last">지난주(${weekRange(state.lastWeek)}) ${weekScore(state.lastWk)}점</span>` : ''}</div>` : ''}
    ${inGame && me ? `<div class="rank-switch"><button data-list="all" class="on">🌍 전체 TOP ${TOP_N}</button><button data-list="friends">👫 친구 순위</button></div>` : `<div class="friend-me">🌍 전체 TOP ${TOP_N}</div>`}
    <div class="rank-list" id="rank-all"><div class="friend-note">불러오는 중…</div></div>
    ${inGame && me ? '<div class="rank-list hidden" id="rank-friends"><div class="friend-note">불러오는 중…</div></div>' : ''}`;
  // 전체 / 친구 표를 나눠 본다 (한 번에 하나만)
  el.querySelectorAll('.rank-switch button').forEach((b) => { b.onclick = () => { el.querySelectorAll('.rank-switch button').forEach((x) => x.classList.toggle('on', x === b)); el.querySelector('#rank-all').classList.toggle('hidden', b.dataset.list !== 'all'); el.querySelector('#rank-friends')?.classList.toggle('hidden', b.dataset.list !== 'friends'); }; });
  const all = el.querySelector('#rank-all');
  try {
    const entries = (await cloud.leaderboard(week)).filter((e) => (e.s || 0) > 0 || e.uid === me).map((e) => ({ ...e, name: e.n })); // 0점은 안 보이지만 나는 보인다
    renderRankRows(all, entries.sort((a, b) => (b.s || 0) - (a.s || 0)).slice(0, TOP_N), { myUid: me, thumb });
  } catch (e) { all.innerHTML = `<div class="friend-note">순위를 못 읽었어: ${e.message}</div>`; }
  const fr = el.querySelector('#rank-friends');
  if (fr) {
    try {
      const friends = await cloud.listFriends();
      const rows = friends.map((f) => ({ uid: f.uid, name: f.name, l: f.leaderId, t: f.updatedAt, ...(f.week === week ? { s: f.wkScore || weekScore(f.wk), q: f.wk?.quiz, c: f.wk?.caught, b: f.wk?.boss } : { s: 0, q: 0, c: 0, b: 0 }) }));
      if (zone) rows.push({ uid: me, name: state.name, l: party.leader?.speciesId || null, s: weekScore(state.wk), q: state.wk.quiz, c: state.wk.caught, b: state.wk.boss, t: 0 });
      renderRankRows(fr, rows, { myUid: me, thumb, empty: '아직 친구가 없어요. 친구 탭에서 친구를 추가해 봐요!' });
    } catch (e) { fr.innerHTML = `<div class="friend-note">친구 순위를 못 읽었어: ${e.message}</div>`; }
  }
}

// ---------- 배움 탭 (src/learn.js): 무엇을 잘하고 무엇을 같이 연습하면 좋은지 ----------
// 퀴즈를 풀 때마다 종류(더하기·빼기·곱하기…)별로 맞음/틀림이 쌓인다. 여기서 그걸 읽어 보여 준다.
const LEVEL_NAME = ['쉬운 숫자', '보통 숫자', '큰 숫자'];
const escHtml = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
let learnWhich = 'wk';   // 'wk' 이번 주 · 'tiers' 전부
function renderLearn(el) {
  checkWeek(false);      // 게임을 켜 둔 채 월요일을 넘겼을 수 있다
  const which = learnWhich;
  const s = learnSummary(state.learn, which);
  const pct = (a) => (a === null ? '—' : `${Math.round(a * 100)}%`);
  const lastAcc = s.last && s.last.ok + s.last.no ? s.last.ok / (s.last.ok + s.last.no) : null;
  const bar = (r) => {
    const w = r.n ? Math.round((r.ok / r.n) * 100) : 0;
    return `<div class="lrn-bar"><i class="ok" style="width:${w}%"></i><i class="no" style="width:${100 - w}%"></i></div>`;
  };
  const rows = s.rows.length ? s.rows.map((r) => `<div class="lrn-row">
      <span class="lrn-name">${escHtml(r.name)}${r.owed ? ' <b class="lrn-again">🔁</b>' : ''}</span>
      ${bar(r)}
      <span class="lrn-num">${r.ok}/${r.n}</span>
      <span class="lrn-lv">${r.level === null ? escHtml(r.where) : LEVEL_NAME[r.level]}</span>
    </div>`).join('') : '<div class="friend-note">아직 푼 문제가 없어요. 숫자블록 친구를 만나 퀴즈를 풀어 보자!</div>';
  const misses = s.misses.length ? `<div class="lrn-head2">🔁 다시 풀어 볼 문제 <span class="rank-how">(최근에 아쉬웠던 것 — 그 지역에 가면 쉬운 걸로 다시 나와요)</span></div>
    ${s.misses.map((m) => `<div class="lrn-miss"><b>${escHtml(TIER_NAME[m.tier] || '')}</b> ${escHtml(m.text)} <span>정답 ${escHtml(m.answer)}</span></div>`).join('')}` : '';
  el.innerHTML = `<div class="rank-head">🌱 배움 카드 <span class="rank-how">${which === 'wk' ? `(이번 주 · ${weekRange(state.week)})` : '(지금까지 전부)'}</span></div>
    <div class="rank-switch"><button data-which="wk" class="${which === 'wk' ? 'on' : ''}">이번 주</button><button data-which="tiers" class="${which === 'tiers' ? 'on' : ''}">전부</button></div>
    <div class="rank-mine"><span>${s.total.ok + s.total.no ? `${s.total.ok + s.total.no}문제 중 <b>${s.total.ok}</b>개 맞혔어 · ${pct(s.acc)}` : '아직 푼 문제가 없어'}</span>${which === 'wk' && lastAcc !== null ? `<span class="rank-last">지난주 ${pct(lastAcc)} (${s.last.ok}/${s.last.ok + s.last.no})</span>` : ''}</div>
    ${s.best ? `<div class="lrn-tip good">👍 제일 잘하는 건 <b>${escHtml(s.best.name)}</b> (${s.best.ok}/${s.best.n})</div>` : ''}
    ${s.weak ? `<div class="lrn-tip weak">🌱 같이 연습하면 좋은 건 <b>${escHtml(s.weak.name)}</b> (${s.weak.ok}/${s.weak.n}) — ${escHtml(s.weak.where)}에서 나와요</div>` : ''}
    <div class="lrn-rows">${rows}</div>
    ${misses}
    <div class="rank-how">잘하는 종류는 숫자가 커지고, 어려워하는 종류는 작아져요. 틀린 종류에는 🔁 가 붙고, 그 지역에 다시 가면 쉬운 문제로 한 번 더 나와요.</div>`;
  el.querySelectorAll('.rank-switch button').forEach((b) => { b.onclick = () => { learnWhich = b.dataset.which; renderLearn(el); }; });
}

// ---------- 미션 탭 (src/goals.js): 오늘의 미션 셋 + 지금까지 모은 스티커 ----------
function renderGoals(el) {
  checkDay();
  const G = state.goals;
  const tasks = G.tasks.map((t) => {
    const m = MISSION_BY_ID[t.id];
    const done = t.n >= t.need, pc = Math.min(100, Math.round((t.n / t.need) * 100));
    return `<div class="goal-row${done ? ' done' : ''}">
      <span class="goal-emoji">${done ? '✅' : m.emoji}</span>
      <span class="goal-text">${escHtml(m.text(m.need))}</span>
      <div class="goal-bar"><i style="width:${pc}%"></i></div>
      <span class="goal-num">${Math.min(t.n, t.need)}/${t.need}</span>
    </div>`;
  }).join('');
  const got = stickerCount(G);
  const board = STICKERS.map((st) => {
    const on = G.stickers[st.id];
    return `<div class="stk${on ? ' on' : ''}" title="${escHtml(st.how)}">
      <span class="stk-face">${on ? st.emoji : '❔'}</span>
      <span class="stk-name">${escHtml(on ? st.name : '???')}</span>
      <span class="stk-how">${escHtml(on ? st.how : '아직 못 받았어')}</span>
    </div>`;
  }).join('');
  el.innerHTML = `<div class="rank-head">🎯 오늘의 미션 <span class="rank-how">(${escHtml(G.day)} · 날마다 새로 나와요)</span></div>
    <div class="goal-rows">${tasks}</div>
    <div class="rank-how">미션 하나를 끝낼 때마다 ${escHtml(BALL_BY_ID[MISSION_BALL].name)} 1개, 셋을 다 하면 ${escHtml(BALL_BY_ID[BONUS_BALL].name)} 1개를 더 받아요.</div>
    ${allDone(G) ? '<div class="lrn-tip good">🏅 오늘 미션을 다 했어! 내일 새 미션으로 또 만나자.</div>' : ''}
    <div class="lrn-head2">🏅 스티커 <span class="rank-how">(${got} / ${STICKERS.length})</span></div>
    <div class="stk-board">${board}</div>`;
}
cloud.init().then(() => refreshAccountUi()).catch((e) => console.warn('[cloud]', e));

function applySave(d) {
  state.name = d.name;
  state.admin = accountAdmin(d.name || '') || (DEBUG_ADMIN && !!d.admin);
  Object.assign(state, { blocks: 0, megaBlocks: d.megaBlocks || 0, glowBlocks: d.glowBlocks || 0, caught: d.caught || 0, rescued: d.rescued || 0, conquered: { ...(d.conquered || {}) }, caughtCreatures: d.caughtCreatures || {}, tutorial: d.tutorial ?? 5, upgradeTold: !!d.upgradeTold, mapTold: !!d.mapTold, glow: !!d.glow });
  // 옛 저장의 보스 전용 id → 합쳐진 종 id (보스로 잡은 기록도 남긴다)
  const ALIAS = { b01: 'm01ee', b03: 'm02ee', b04: 'm05ee', hb01: 'm36', pb02: 'm18', pb05: 'm33', pb08: 'm42', pb10: 'm26', pb01: 'm07', pb04: 'm27', pb09: 'm21e', pb03: 'm34', pb06: 'm03e', pb07: 'm15', m51ee: 'hb02' };
  const BOSS_ALIAS = new Set(['b01', 'b03', 'b04', 'pb02', 'pb05', 'pb08', 'pb10']);
  for (const k of Object.keys(state.dex)) delete state.dex[k];
  for (const k of Object.keys(state.bossDex)) delete state.bossDex[k];
  for (const [k, v] of Object.entries(d.dex || {})) { const id = ALIAS[k] || k; state.dex[id] = (state.dex[id] || 0) + v; if (BOSS_ALIAS.has(k)) state.bossDex[id] = (state.bossDex[id] || 0) + v; }
  Object.assign(state.bossDex, d.bossDex || {});
  pendingCaught = d.caughtCreatures || {};
  state.returnTo = d.returnTo || null;
  state.carTold = !!d.carTold;
  state.lastWeek = d.lastWeek || null; state.lastWk = d.lastWk ? { ...emptyWeek(), ...d.lastWk } : null;
  state.learn = loadLearn(d.learn); quiz.learn = state.learn;   // 퀴즈도 새로 읽은 기록을 보게 (참조가 바뀐다)
  state.goals = loadGoals(d.goals, d.name);                    // 오늘의 미션 · 스티커
  state.week = d.week || weekKey(); state.wk = { ...emptyWeek(), ...(d.wk || {}) }; checkWeek(false); // 지난 주 기록이면 0부터 (지난주 점수는 lastWk 로 옮겨 둔다)
  refreshCarBtn();
  state.balls = { bronze: 3, silver: 0, gold: 0, diamond: 0, ...(d.balls || {}) };
  state.rockets = { ...(d.rockets || {}) };
  for (const z of Object.values(zones)) { applyPendingCaught(z); if (z.grunt && state.rockets[z.name]) addWhiteFlag(z.grunt.mesh); } // 타이틀 중에 미리 만든 푸른숲에도 적용
  if (state.conquered.forest) removeBoulder();
  startGame({ zoneName: BUILDERS[d.zone] ? d.zone : 'forest', pos: d.pos });
  const seenSpecies = new Set();
  for (const m of d.party || []) {
    m.speciesId = ALIAS[m.speciesId] || m.speciesId;
    if (seenSpecies.has(m.speciesId)) continue; // 합쳐진 종이 둘이면 하나만
    seenSpecies.add(m.speciesId);
    const sp = speciesById[m.speciesId];
    if (!sp) continue;
    const member = party.add(m.speciesId, buildDraftMesh(sp));
    Object.assign(member, { atk: m.atk, maxHp: m.maxHp, hp: Math.min(m.hp, m.maxHp), wins: m.wins || 0 });
  }
  const leader = party.healthy().includes(party.members[d.leader]) ? party.members[d.leader] : (party.healthy()[0] || party.members[0]);
  if (leader) attachLeader(leader);
  setBlocks(d.blocks || 0, { quiet: true, mission: false }); // 불러오기: 금빛 블록 축하도, 오늘의 미션 셈도 하지 않는다
  for (const [n, z] of Object.entries(zones)) if (state.conquered[n]) revealShrine(z, true); // 미리 만들어 둔 지역의 성역도 드러낸다
  if (state.admin) { adminGrantAll(); showAdminPanel(); }
  sound.fanfare();
  say(`다시 만나서 반가워, ${state.name}! ${leader ? party.name(leader) + '와 ' : ''}모험을 이어서 하자!`, { sec: 6 });
  refreshHud();
}

if (location.search.includes('debug')) {
  window.__game = { get player() { return player; }, say, state, cloud, presence, ghosts, duels, get parked() { return parked; }, get goingHome() { return goingHome; }, get sailing() { return sailing; }, boardBoat, leaveBoat, landingSpot, renderLearn, zones, getZone, setBlocks, input, renderer, switchZone, startRide, startUfoRide, openPlanetPopup, vehiclesHere, spawnRescue, get zone() { return zone; }, get ride() { return ride; }, battle, bgm, duelStage, duels, cam, dex, party, quiz, addStarter, attachLeader, evolveMember, conquer, doSave, applySave, listSaves, buildSaveData };
}

// ---------- 루프 ----------
const clock = new THREE.Clock();
let prevBattle = false;
let whirlToldAt = 0; // 잠긴 소용돌이를 마지막으로 알려 준 때 (다른 안내에 막히지 않게 따로 센다)
let bgmInBattle = false; // 대결이 시작·끝날 때 곡을 바꾼다 (대결 → 대결곡/보스곡, 끝나면 지역 곡)
function frame() {
  state.frames++;
  fitRenderer();
  const fighting = battle.active || duelStage.active;
  if (fighting !== bgmInBattle) { bgmInBattle = fighting; bgmRefresh(); }
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;

  if (intro || !zone) {
    intro?.update(dt);
    if (intro) renderer.render(intro.scene, intro.camera);
    input.endFrame();
    requestAnimationFrame(frame);
    return;
  }
  if (saveToastTimer > 0) { saveToastTimer -= dt; if (saveToastTimer <= 0) saveToastEl.classList.add('hidden'); }
  presenceTick(dt); // 같이 놀기: 내 위치 올리기 + 같은 지역 친구 유령 (진화 연출·대결 중에도 친구는 보인다)

  if (evo) { // 진화 연출 중에는 그것만 그린다
    updateEvolution(dt);
    updateCtxButton();
    zone.world.animate?.(t);
    zone.shrine?.animate(t, dt);
    particles.update(dt); confetti.update(dt);
    if (msgTimer > 0) { msgTimer -= dt; if (msgTimer <= 0) msgEl.classList.add('hidden'); }
    renderer.render(zone.scene, camera);
    input.endFrame();
    requestAnimationFrame(frame);
    return;
  }
  ctxAction = null; // 이번 프레임에 할 수 있는 일은 아래 탐험 코드가 다시 채운다
  if (input.wasPressed('dex') && !battle.active && !quiz.open && !ride) dex.toggle(state.dex);
  if (input.wasPressed('car') && carAllowed() && !battle.active && !quiz.open && !dex.open && !ride && !switching) toggleCar();
  if (dex.open) {
    if (input.wasPressed('cancel')) dex.hide();
  } else if (quiz.open) {
    if (input.wasPressed('cancel')) quiz.finish('skip'); // 답을 고른 뒤라면 그 결과로 닫힌다
  } else if (planetOpen) { // 행성 고르기 팝업이 떠 있는 동안은 멈춘다
    if (input.wasPressed('cancel')) closePlanetPopup();
  } else if (battle.active) {
    battle.update(dt);
  } else if (duelStage.active) {
    duelStage.update(dt);
    if (input.wasPressed('cancel')) leaveDuelStage('무대에서 내려왔어. 자리에 다시 올라서면 이어서 할 수 있어!');
  } else if (ride) {
    updateRide(dt);
  } else if (!switching) {
    // 카메라 회전: 화면 드래그 또는 Q/R
    const look = input.takeLook();
    cam.yaw -= look.dx * 0.006;
    cam.pitch = Math.max(-1.25, Math.min(0.6, cam.pitch + look.dy * 0.004));
    if (input.isHeld('camLeft')) cam.yaw += dt * 1.8;
    if (input.isHeld('camRight')) cam.yaw -= dt * 1.8;

    player.update(dt, input, cam.yaw);
    const pp = player.position;
    const near = (pt, r) => Math.hypot(pp.x - pt.x, pp.z - pt.z) < r;
    state.prompt = Math.max(0, state.prompt - dt);

    // ----- 지역 이동 -----
    let moved = false;
    if (zone.name === 'forest') {
      const w = zone.world;
      if (player.fellInHole) {
        player.fellInHole = false; moved = true;
        switchZone('cave', getZone('cave').world.spawn, { text: '뿅! 지하동굴로 떨어졌어. 포니타를 찾으면 밝아질 거야. 빛나는 포탈로 푸른숲에 돌아갈 수 있어!', sec: 8 });
      } else if (state.conquered.forest && near({ x: WORLD.cave.x, z: WORLD.cave.z + 6.5 }, 2.2)) {
        moved = true;
        switchZone('cave', getZone('cave').world.spawn, { text: '지하동굴에 들어왔어! 땅·바위·독 포켓몬이 살아. 포탈로 돌아갈 수 있어.', sec: 6 });
      } else if (near(w.hiveDoor, 4.0)) { // 매달린 벌집 아래 (어느 방향에서 와도. 벌집이 커진 만큼 넓게)
        moved = true;
        switchZone('hive', getZone('hive').world.spawn, { text: '윙윙! 꿀벌집 안으로 들어왔어! 육각형 벌집 칸과 꿀 웅덩이, 꿀벌 떼가 가득해. 북쪽 벌집 탑은 육각 계단을 뛰어서 올라가! 벌레·풀 포켓몬이 살아. 남쪽 포탈로 나갈 수 있어.', sec: 8 });
      } else if (near(w.volcanoGate, 2.4)) {
        moved = true;
        switchZone('volcano', getZone('volcano').world.spawn, { text: '불의산에 들어왔어! 불 포켓몬의 땅이야. 용암은 뜨거우니 조심! 포탈로 돌아갈 수 있어.', sec: 7 });
      } else if (w.arenaDoor && Math.abs(pp.x - w.arenaDoor.x) < 1.8 && pp.z > w.arenaDoor.z - 1.4 && pp.z < w.arenaDoor.z + 0.9) { // 넘버볼 아레나 문 앞 칸
        moved = true;
        switchZone('arena', getZone('arena').world.spawn, { text: '🏟 넘버볼 아레나에 들어왔어! 친구와 대결하는 경기장이야. 치료 데스크의 봄이가 포켓몬을 치료해 줘. 남쪽 문으로 나가면 푸른숲이야.', sec: 7 });
      } else if (Math.abs(pp.x - w.labDoor.x) < 1.6 && pp.z > w.labDoor.z - 0.6 && pp.z < w.labDoor.z + 1.6) { // 문 앞 네모 칸 (문 틈으로 들어서면 바로)
        moved = true;
        switchZone('lab', getZone('lab').world.spawn, { text: '오박사 연구소에 들어왔어! 오박사님께 가까이 가서 대화 버튼을 눌러 봐. 문으로 나가면 마을이야.', sec: 6 });
      }
    } else if (zone.name === 'sea' && zone.world.dive && sailing && !returning && near(zone.world.dive, zone.world.dive.r)) {
      // 먼바다의 소용돌이: 보스 거북왕을 이긴 뒤부터 심해로 내려갈 수 있다 (푸른숲 큰 구멍 → 지하동굴과 같은 방식)
      if (state.conquered.sea) {
        moved = true;
        switchZone('deepsea', getZone('deepsea').world.spawn, { text: '소용돌이에 빨려 들어갔어… 여긴 심해야! 점프 버튼(스페이스)을 꾹 누르면 헤엄쳐 올라갈 수 있어. 북쪽 해류를 타면 돌아갈 수 있어!', sec: 9 });
      } else if (Date.now() - whirlToldAt > 7000) {
        // 잠긴 이유는 반드시 알려 준다. 예전에는 여러 안내가 나눠 쓰는 state.prompt 를 봤는데, 배를 타면
        // 그 값이 8로 차 있어서 안내가 통째로 막혔다 — 소용돌이 한가운데에 들어가도 아무 일도 안 일어나 보였다.
        whirlToldAt = Date.now();
        say('🔒 소용돌이가 아직 잠겨 있어! 남쪽 섬의 보스 거북왕을 이겨서 물의길을 정복하면 열려. 그때 다시 오자!', { sec: 7 });
      }
    } else if (zone.world.portal && near(zone.world.portal, 1.6)) {
      moved = true;
      const toName = zone.world.portalTo || 'forest'; // 보통은 푸른숲으로, 심해의 해류는 물의길로
      const dest = getZone(toName);
      const back = dest.world.arrivals?.[zone.name] || dest.world.spawn;
      switchZone(toName, back, { text: `${josa(dest.label, '으로')} 돌아왔어!`, sec: 4 });
    }
    if (!moved && zone.name === 'forest' && state.prompt <= 0 && near(zone.world.hiveDoor, 7)) { state.prompt = 8; say('🐝 꿀벌집이야! 매달린 벌집 바로 아래로 걸어가면 안으로 들어가.', { sec: 4 }); }
    // 배 위에서 뭍이 가까우면 "내리기"를 먼저 준다 (루피 대화는 트인 바다에서)
    const landNear = sailing && !returning ? landingSpot(t) : null;
    if (landNear) offer('⚓ 여기 내리기', () => leaveBoat(true), '⚓\n내리기');
    // ----- 세워 둔 이상해꽃 자동차 옆: 타기 -----
    if (!moved && !driving && carAt && carAt.zone === zone.name && near(carAt.car.group.position, 3.4)) offer('🚗 타기', mountCar, '🚗\n타기');
    // ----- 사람과 이야기하기 (지역 안내 NPC, 오박사) -----
    if (!moved) for (const npc of zone.world.npcs || []) {
      const d = Math.hypot(pp.x - npc.x, pp.z - npc.z);
      if (d < 7) npc.mesh.rotation.y = Math.atan2(pp.x - npc.x, pp.z - npc.z); // 가까이 오면 이쪽을 본다
      if (d < 2.8) {
        const foe = npc.rocket && !state.rockets[zone.name] ? npc.rocket : null; // 아직 안 이긴 넘버로켓단 대원
        if (foe) offer('⚔ 대결!', () => challengeGrunt(npc), '⚔\n대결');
        else offer('💬 대화', () => talkTo(npc), '💬\n대화');
        if (!npc.talking && !npc.prompted) { npc.prompted = true; say(foe ? `${npc.name}: ${foe.greet}` : npc.rocket ? `흰 깃발을 든 ${npc.name}이야. 대화 버튼을 누르면 이곳의 비밀을 알려 줘!` : `${npc.name}님이야! 대화 버튼을 눌러 봐.`, { sec: foe ? 7 : npc.rocket ? 5 : 3, faceImg: npcFace(npc) }); } // 다가갈 때 한 번만
      } else if (npc.talking || npc.prompted) { npc.talking = false; npc.prompted = false; if (warpNpc === npc) { warpBtn.classList.add('hidden'); warpNpc = null; } if (boardNpc === npc) { boardBtn.classList.add('hidden'); boardNpc = null; } if (ufoNpc === npc) { ufoBtn.classList.add('hidden'); ufoNpc = null; } } // 멀어지면 버튼도 사라진다
    }
    // ----- 넘버볼 아레나: 무대 위 내 자리(1P·2P)에 올라서면 "대결!" 버튼 -----
    if (!moved && zone.name === 'arena' && cloud.user) {
      const mineDuels = duels.list.filter((d) => d.state === 'active' && sideOf(d, cloud.user.uid));
      if (mineDuels.length) {
        const d = mineDuels[0], side = sideOf(d, cloud.user.uid), spot = arenaSpot(side);
        const nm = d.names?.[side === 'a' ? 'b' : 'a'] || '친구';
        if (near(spot, 2.4)) offer(`⚔ ${josa(nm, '과와')} 대결!`, () => enterDuelStage(d), '⚔\n대결');
        else if (state.prompt <= 0) { // 어디로 올라가야 하는지 알려 준다
          state.prompt = 12;
          say(`⚔ ${nm}와의 대결이 기다리고 있어! 무대 위 ${side === 'a' ? '파란 1P' : '빨간 2P'} 자리에 올라서면 시작해.`, { sec: 7 });
        }
      }
    }
    // ----- 연구소 워프 패드: 마지막에 있던 지역으로 -----
    if (!moved && zone.world.warpPad && near(zone.world.warpPad, 1.5)) {
      if (state.returnTo && BUILDERS[state.returnTo.zone]) {
        moved = true;
        const r = state.returnTo; state.returnTo = null;
        switchZone(r.zone, r.spawn, { text: `${josa(ZONE_INFO[r.zone]?.name || r.zone, '으로')} 돌아왔어!`, sec: 4 });
      } else if (state.prompt <= 0) { state.prompt = 8; say('워프 패드야. 다른 지역의 안내원이 데려다줬을 때 그 지역으로 돌아갈 수 있어.', { sec: 4 }); }
    }
    if (returning) updateReturn(dt); // 루피가 배를 몰아 선착장으로 (조작 잠금)
    if (goingHome) updateGoingHome(dt); // 빈 배가 스스로 선착장으로
    if (parked) {                       // 뭍에 댄 배가 기다려 준다
      parked.timer -= dt;
      if (!parked.told && parked.timer < 20) { parked.told = true; say('루피: 슬슬 배를 선착장에 갖다 놔야겠어. 탈 거면 지금 말을 걸어!', { sec: 6, faceImg: npcFace(sailorNpc()) }); }
      if (parked.timer <= 0) sendBoatHome();
    }
    for (const c of zone.creatures) if (returning) c.cooldown = Math.max(c.cooldown, 0.6); // 돌아가는 중엔 대결이 열리지 않는다
    // ----- 배: 루피와 함께 타고 다닌다 (타고 내리는 건 루피에게 말을 걸어서) -----
    if (sailing && boatHere()) {
      const b = boatHere(), surface = waterLevel() ?? 0;
      b.mesh.position.set(pp.x, surface + Math.sin(t * 1.6) * 0.1, pp.z);   // 배가 주인공을 따라다닌다
      b.mesh.rotation.y = player.facing - Math.PI / 2;                       // 뱃머리(+x)가 가는 방향을 본다
      b.mesh.rotation.z = Math.sin(t * 1.3) * 0.05;
      placeSailorOnBoat();                                                   // 루피도 갑판에서 함께 간다
      const fast = input.isHeld('run');
      if (Math.random() < (fast ? 0.6 : 0.25)) particles.stars(zone.scene, b.mesh.position.clone().add(new THREE.Vector3(rand(-1.8, 1.8), 0.2, rand(-1.8, 1.8))), 1, 0xf4f4f8, fast ? 0.4 : 0.25); // 물보라
    }
    // 기차·로켓은 안내원(리리·코리)과 이야기해야 탈 수 있다. 가까이 가면 알려만 준다.
    if (!moved && state.prompt <= 0) for (const v of vehiclesHere()) {
      if (!near(v.boardPoint, 3.6)) continue;
      state.prompt = 8;
      say(v.kind === 'train' ? '기차역이야! 옆에 선 리리에게 말을 걸면 탈 수 있어.' : v.kind === 'ufo' ? 'UFO 정거장이야! 옆에 선 손오공에게 말을 걸면 비행접시를 탈 수 있어.' : '로켓 발사장이야! 옆에 선 코리에게 말을 걸면 탈 수 있어.', { sec: 4 });
      break;
    }

    // ----- 블록 줍기 -----
    for (let i = zone.pickups.length - 1; i >= 0; i--) {
      const b = zone.pickups[i];
      tickModel(b, dt); // 늦게 도착한 모델의 등장 연출 (이걸 안 부르면 크기 0.001 에 멈춰 안 보인다)
      b.rotation.y = t + b.userData.t;
      b.position.y = terrainHeight(b.position.x, b.position.z) + 0.6 + Math.sin(t * 2 + b.userData.t) * 0.1;
      if (b.position.distanceTo(pp) < 1.1) {
        if (b.userData.chest) { // 수수께끼 상자·바다 보물상자: 숫자블록 친구가 튀어나와 문제를 낸다 (상자 속 블록 수는 풀고 나서 정해진다)
          const at = b.position.clone();
          zone.scene.remove(b);
          zone.pickups.splice(i, 1);
          sound.pickup();
          particles.stars(zone.scene, at.clone().add(new THREE.Vector3(0, 0.8, 0)), 22, 0xffd43b, 0.5);
          const boxName = CHEST_MODEL[zone.name] === '바다보물상자.glb' ? '바다 보물상자' : '수수께끼 상자';
          say(`${boxName}를 열었어! 안에서 문제가 톡 튀어나왔어. 맞히면 상자 속 블록을 다 준대 — 몇 개가 들었을까?`, { sec: 6 });
          input.endFrame();
          const zz2 = zone;
          setTimeout(() => { if (zone === zz2 && !quiz.open && !battle.active && !dex.open) openChest(zz2, at, boxName); }, 900); // 상자가 열리는 연출을 잠깐 보여 준 뒤 문제
          continue;
        }
        if (state.blocks >= MAX_BLOCKS) { if (!state.fullTold) { state.fullTold = true; say(`블록이 ${MAX_BLOCKS}개! 더는 못 들어. 도감에서 포켓몬을 키우는 데 쓰자!`); } continue; }
        zone.scene.remove(b);
        zone.pickups.splice(i, 1);
        setBlocks(state.blocks + blockValue(), { glow: !!b.userData.glow });
        sound.pickup();
        if (b.userData.glow && state.glowBlocks === 1) say('형광 블록이야! 숫자블록이 반짝반짝 빛나!', { sec: 5 });
        if (state.blocks === 5) say('블록 5개! 뒤를 봐, 하늘색 다섯이 모양이 됐어!', { sec: 5 });
        if (state.blocks === 10) say('열 개! 빨강 하나에 하양 아홉, 열이 모양이야!', { sec: 5 });
        if (state.blocks === 11) say('열 개 넘으면 열이 옆에 새 블록이 붙어. 10과 1은 11!', { sec: 5 });
      }
    }
    zone.respawnTimer -= dt;
    const farOut = outwardness(zone, pp.x, pp.z) > 0.5; // 맵 바깥으로 나오면 줍는 것이 조금 더 자주·많이 (상자도 바깥에서 잘 나온다)
    if (zone.respawnTimer <= 0 && zone.pickups.length < (farOut ? 2 : 1) && !zone.world.indoor) { // 블록은 아주 드물게 다시 생긴다 (대결·숫자블록 퀴즈가 주 수입)
      zone.respawnTimer = farOut ? 75 : 120;
      const half = zone.terrain.size / 2 - 4;
      for (let tries = 0; tries < 20; tries++) {
        const x = pp.x + rand(-36, 36), zz = pp.z + rand(-36, 36);
        if (Math.abs(x) > half || Math.abs(zz) > half || inHole(x, zz) || isBlocked(x, zz) || insideObstacle(x, zz, 0.8) || Math.hypot(x - pp.x, zz - pp.z) < 6) continue;
        spawnPickup(zone, x, zz);
        break;
      }
    }

    // ----- 몬스터: 닿으면 내 대표 포켓몬과 대결 -----
    for (const c of zone.creatures) {
      if (c.state === 'caught') continue;
      const ev = c.update(dt, pp);
      if (ev === 'meet') {
        let L = party.leader;
        if (!L) { c.becomeShy(); say('대표 포켓몬이 없어!'); break; }
        if (party.isFainted(L)) {
          const other = party.healthy()[0];
          if (other) { attachLeader(other); L = other; say(`${josa(party.name(L), '이가')} 대신 나서!`, { sec: 3 }); }
          else { c.becomeShy(); say('포켓몬이 모두 기절했어… 오박사 연구소에서 치료받자!', { sec: 5 }); break; }
        }
        const hp = c.hp ?? c.data.baseHp;
        say(c.rocketOf ? `${josa(c.rocketOf.name, '이가')} 세뇌한 ${c.data.name}! 머리 위 붉은 ${josa(String(hp), '을를')} 0으로 깎으면 친구로 되돌아와!` : c.isBoss ? `${zone.label}의 보스 ${c.data.name}이다! 체력이 ${hp}이나 돼! 공격력은 ${c.data.baseAtk}!` : `${josa(c.data.name, '이가')} 나타났다! 체력 ${hp}, 공격력 ${c.data.baseAtk}!`, { sec: c.rocketOf ? 5 : 3 });
        battle.start({
          creature: c, player, scene: zone.scene, member: L, onWater: !!c.swim,
          hideMeshes: chain.followers.filter((f) => !f.isLeader).map((f) => f.mesh), decor: zone.world.decor,
          onCaught: () => {
            const L = battle.member; // 대결 중 교체했을 수 있다
            c.becomeFriend();
            const already = party.members.find((m) => m.speciesId === c.data.id || party.name(m) === c.data.name); // 같은 포켓몬은 파티에 한 마리만 (보스로 만난 이상해꽃 = 진화한 이상해꽃)
            const member = already || party.add(c.data.id, c.mesh, { hp: c.data.baseHp, atk: c.data.baseAtk }); // 보스로 잡으면 보스 능력치로 들어온다
            let upgraded = false;
            if (already && c.isBoss) { // 이미 있는 같은 종은 보스 능력치로 올라간다 (낮아지지는 않는다)
              const fs = friendStats(c.data.baseHp, c.data.baseAtk); // 보스 능력치에도 친구 보너스
              const hp = Math.max(already.maxHp, fs.hp), atk = Math.max(already.atk, fs.atk);
              upgraded = hp > already.maxHp || atk > already.atk;
              already.maxHp = hp; already.hp = hp; already.atk = atk;
            }
            if (c.isBoss) state.bossDex[c.data.id] = (state.bossDex[c.data.id] || 0) + 1; // 보스로 잡은 기록 (뮤·메가망나뇽 조건)
            zone.scene.remove(c.mesh); // 볼 안으로. 도감에서 대표로 고르면 다시 나온다
            if (!c.rocketOf) (state.caughtCreatures[zone.name] ||= []).push(zone.creatures.indexOf(c)); // 저장용: 어느 몬스터를 잡았는지 (대원이 내보낸 포켓몬은 원래 이 지역 목록에 없으니 빼 둔다)
            party.heal(L);              // 이긴 기쁨으로 대표 체력 회복
            L.wins = (L.wins || 0) + 1;  // 진화 조건: 대표로 이긴 횟수
            const reward = winReward(c);
            setBlocks(Math.min(MAX_BLOCKS, state.blocks + reward));
            state.dex[c.data.id] = (state.dex[c.data.id] || 0) + 1;
            const cnt = state.dex[c.data.id];
            checkUnlocked(c.data.id); // 이 포켓몬을 잡아서 나타나는 특별 포켓몬이 있나 (메가팬텀 → 메가리자몽X)
            wkAdd('caught');
            bump('catch');
            if (c.isBoss) wkAdd('boss');
            if (c.data.mega) { // 메가 포켓몬을 잡으면 메가블럭을 준다 (메가 진화에 쓴다)
              state.caught++;
              state.megaBlocks += MEGA_REWARD;
              confetti.burst(200); sound.fanfare();
              say(`✨ ${josa(c.data.name, '이가')} 친구가 됐어! 메가블럭 ${MEGA_REWARD}개를 얻었어! 도감에서 최종 진화한 포켓몬을 메가 진화시킬 수 있어!`, { sec: 10 });
              refreshHud();
            }
            if (c.isBoss) { // 보스이면서 메가(태양의 메가리자몽X)면 위의 메가블럭에 더해 정복도
              conquer(zone.name);
              if (zone.name === 'forest') {
                removeBoulder();
                say(`${josa(c.data.name, '이가')} 친구가 됐어! 푸른숲 정복! 북쪽 산의 지하동굴 입구 바위도 치워졌어!${upgraded ? ` 내 이상해꽃이 보스 능력치(체력 ${member.maxHp}·공격 ${member.atk})로 올라갔어!` : ''}`, { sec: 8 });
              } else say(`${josa(c.data.name, '이가')} 친구가 됐어! ${zone.label} 정복! 블록 ${reward}개 획득!${upgraded ? ` 내 ${josa(c.data.name, '이가')} 보스 능력치(체력 ${member.maxHp}·공격 ${member.atk})로 올라갔어!` : ''}`, { sec: 7 });
            } else if (!c.data.mega) {
              if (!c.rocketOf) state.caught++; // 로켓단이 내보낸 포켓몬은 이 지역의 야생 목록에 없으니 "친구 몇/몇" 총합을 넘기지 않게 셈에서 뺀다 (도감 기록은 그대로 남는다)
              const sp = speciesById[c.data.id];
              const evo = sp.evolution;
              const winNote = party.canEvolve(L) ? ` ${josa(party.name(L), '이가')} 진화할 수 있어! 도감에서 ✨진화!` : (party.evolveNeed(L)?.wins ? ` ${party.name(L)} ${L.wins}승!` : '');
              if (already) say(`${josa(sp.name, '은는')} 이미 내 친구야! 이긴 보상으로 블록 ${reward}개 획득! (누적 ${cnt}마리)${winNote}`, { sec: 6 });
              else say(`${josa(c.data.name, '이가')} 친구가 됐어! 블록 ${reward}개 획득!${winNote} 도감에서 대표로 고르거나 블록으로 키울 수 있어.`, { sec: 6 });
            }
            if (c.data.id === 'm07' && !state.glow) { state.glow = true; player.lamp.intensity = 13; player.lamp.distance = 30; if (zones.cave) zones.cave.scene.fog.far = 110; say(`${c.data.name}가 동굴을 환하게 밝혀줘!`, { sec: 5 }); }
            if (!already && party.members.length === 2) say(`${josa(party.name(member), '은는')} 볼 안에서 쉬고 있어. 도감에서 "대표로 하기"를 누르면 따라와!`, { sec: 6 });
            refreshHud();
            beatGrunt(c, true); // 넘버로켓단 대원이 내보낸 포켓몬이었다면 대원이 항복한다
            autosave();
          },
          onLost: () => {
            const L = battle.member;
            c.becomeShy();
            c.hp = c.data.baseHp; // 이긴 몬스터는 기운을 되찾는다
            L.hp = 0; // 기절. 올린 스탯은 그대로
            const other = party.healthy()[0];
            if (other) {
              attachLeader(other);
              say(`${josa(party.name(L), '이가')} 기절했어… ${josa(party.name(other), '이가')} 대표로 나서! 오박사님께 가면 치료해 줘.`, { sec: 7 });
            } else {
              say('포켓몬이 모두 기절했어… 눈앞이 캄캄해…', { sec: 3 });
              setTimeout(() => goToLab('오박사님이 연구소로 데려왔어. 오박사님께 가까이 가서 대화 버튼을 누르면 치료해 줘!'), 900);
            }
            refreshHud();
            beatGrunt(c, false);
          },
          onEscaped: () => { // 넘버볼에서 튀어나와 도망: 승리 아님, 블록·승수 없음. 한동안 사라졌다가 돌아온다
            c.flee();
            say(`${josa(c.data.name, '이가')} 도망쳤어… 등급이 높은 포켓몬은 더 좋은 넘버볼이 필요해. 도감 넘버볼 탭에서 블록으로 바꾸자!`, { sec: 7 });
            refreshHud();
            beatGrunt(c, false);
          },
          onLeave: () => { c.becomeShy(); say('괜찮아, 블록을 모아서 더 강해진 다음 다시 오자!'); refreshHud(); beatGrunt(c, false); },
        });
        break;
      }
    }

    // ----- 숫자블록 퀴즈: 랜덤 출몰, 가까이 가서 퀴즈 풀기 버튼 → 문제 -----
    zone.nbTimer -= dt;
    if (zone.rescues.length < MAX_RESCUES && zone.nbTimer <= 0 && !zone.world.indoor) spawnRescue(zone);
    let nearNb = null; // 가장 가까운 퀴즈 친구 (퀴즈 풀기 버튼은 하나만)
    for (const nb of [...zone.rescues]) {
      nb.t += dt;
      nb.life -= dt;
      nb.mesh.position.y = terrainHeight(nb.position.x, nb.position.z) + Math.abs(Math.sin(nb.t * 3)) * 0.12;
      nb.mesh.rotation.y = Math.atan2(pp.x - nb.position.x, pp.z - nb.position.z); // 주인공을 본다
      animateNumberblock(nb.mesh, dt, true);
      if (nb.life <= 0) removeRescue(zone, nb, true);
      else if (!nb.prize && nb.position.distanceTo(pp) < 2.4 && (!nearNb || nb.position.distanceTo(pp) < nearNb.position.distanceTo(pp))) nearNb = nb; // 상자에서 상품으로 나온 친구는 문제를 내지 않는다
    }
    if (nearNb) {
      const nb = nearNb;
      offer(`🧩 ${nb.data.name} 퀴즈 풀기`, () => { input.endFrame(); askRescueQuiz(zone, nb); }, '🧩\n퀴즈');
    }
    if (msgQueue.length && msgTimer <= 0) { const m = msgQueue.shift(); say(m.text, m.opts); } // 줄 세워 둔 말풍선 (앞의 말이 끝난 뒤 하나씩)
    tickCar();
    if (driving && !ctxAction) offer('🚶 내리기', () => dismountCar(), '🚶\n내리기'); // 차 안에서 다른 할 일이 없으면 액션 버튼은 '내리기' (버튼 처리보다 먼저 등록해야 눌러진다)
    // 버튼을 눌렀거나 E키를 눌렀으면 지금 할 수 있는 일을 한다
    if (ctxAction && (ctxClicked || input.wasPressed('action'))) ctxAction.run();

    // 헤엄쳐 올라가는 동안 발밑에서 물방울이 보글보글 올라온다
    if (player.swimming && input.isHeld('jump') && Math.random() < 0.5) {
      particles.stars(zone.scene, pp.clone().add(new THREE.Vector3(rand(-0.4, 0.4), 0.2, rand(-0.4, 0.4))), 1, 0xdff6ff, 0.3);
    }
    if (!sailing) chain.update(dt); // 사진 중에도 돌린다 (모델 등장·걷기 애니메이션이 여기서 돈다). 포즈는 그 뒤 photo.update 가 다시 잡는다
    else for (const f of chain.followers) f.mesh.visible = false; // 대결이 끝나 돌아와도 물 위를 걷지 않게
    // 따라오는 친구가 카메라와 주인공 사이에 끼면 반투명하게
    for (const f of chain.followers) {
      const occluding = f.mesh.position.distanceTo(camera.position) < pp.distanceTo(camera.position) - 0.3 && f.mesh.position.distanceTo(pp) < 3.5;
      const target = occluding ? 0.35 : 1;
      if (f.mesh.userData.opacity === target) continue;
      f.mesh.userData.opacity = target;
      f.mesh.traverse((o) => {
        if (!o.material || o.isLine) return;
        if (!o.userData.ownMaterial) { o.material = o.material.clone(); o.userData.ownMaterial = true; }
        o.material.transparent = target < 1;
        o.material.opacity = target;
      });
    }
    if (myStack.mesh && myStack.pop > 0) {
      myStack.pop = Math.max(0, myStack.pop - dt * 3);
      myStack.mesh.scale.setScalar(STACK_SCALE * (1 + Math.sin(myStack.pop * Math.PI) * 0.25));
    }
    const glow = myStack.mesh?.userData.glow;
    if (glow) {
      const wave = Math.sin(t * 5);
      for (const m of glow.mats) m.emissiveIntensity = glow.base * (1 + wave * 0.45);
      glow.light.intensity = glow.lightBase * (0.8 + wave * 0.4);
      state.sparkleTimer = (state.sparkleTimer || 0) - dt;
      if (state.sparkleTimer <= 0 && glow.base >= 0.5) { // 형광(동굴·우주)일 때만 반짝이 입자
        state.sparkleTimer = 0.9;
        particles.stars(zone.scene, myStack.mesh.position.clone().add(new THREE.Vector3(rand(-0.5, 0.5), 0.6 + Math.random() * state.blocks * 0.3, rand(-0.5, 0.5))), 3, 0xfff6a0, 0.22);
      }
    }
    tutorial();
    state.autosave -= dt;
    if (state.autosave <= 0) autosave();

    // 카메라 따라가기 (대결이 막 끝났으면 눈높이에서 바로 원래 자리로 복귀)
    if (photo.active) photo.update(dt); // 사진 찍는 동안에는 카메라를 photo 가 잡아 둔 자리에 그대로 둔다
    else {
      const camTarget = resolveCamera(pp.clone().add(camOffset()));
      if (prevBattle || snapCam) { camera.position.copy(camTarget); snapCam = false; }
      else camera.position.lerp(camTarget, look.dx || look.dy || input.isHeld('camLeft') || input.isHeld('camRight') ? 0.35 : 0.08);
      camera.lookAt(pp.x, pp.y + camLookY(), pp.z);
    }
  }
  ctxClicked = false;
  updateCtxButton();
  prevBattle = battle.active;
  document.body.classList.toggle('battle', battle.active); // 대결 중엔 말풍선을 위로 올린다 (패널과 안 겹치게)

  if (zone.name === 'lab' && zone.world.setScreenSubjects && (zone.screenFedAt == null || t - zone.screenFedAt > 20)) { // 연구 모니터에 내가 만난 포켓몬 그림을 넣는다
    zone.screenFedAt = t;
    const ids = Object.keys(state.dex).filter((id) => state.dex[id] > 0 && speciesById[id]);
    const list = (ids.length ? ids : ['m01', 'm02', 'm05', 'm03']).slice(0, 8).map((id) => speciesById[id]).map((sp) => ({ name: sp.name, type: sp.type, hp: sp.baseHp, atk: sp.baseAtk, src: dex.thumbs(sp)?.color })).filter((s) => s.src);
    if (list.length) zone.world.setScreenSubjects(list);
  }
  zone.world.animate?.(t);
  const sun = zone.world.sun;
  if (sun) { sun.position.set(player.position.x + 20, 30, player.position.z + 10); sun.target.position.copy(player.position); }
  particles.update(dt);
  confetti.update(dt);
  warp.update(dt, ride ? 1.6 : 1); // UFO 하이퍼스페이스 (켜져 있을 때만 그린다)
  if (msgTimer > 0) { msgTimer -= dt; if (msgTimer <= 0) msgEl.classList.add('hidden'); }
  if (zoneBannerTimer > 0) { zoneBannerTimer -= dt; if (zoneBannerTimer <= 0) zoneBannerEl.classList.add('hidden'); }

  renderer.render(zone.scene, camera);
  photo.afterRender(renderer); // 그린 직후에만 캔버스를 읽을 수 있다 (preserveDrawingBuffer 가 꺼져 있다)
  input.endFrame();
  requestAnimationFrame(frame);
}
frame();
