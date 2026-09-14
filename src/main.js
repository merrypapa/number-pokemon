import * as THREE from 'three';
import { Input } from './input.js';
import { buildWorld, terrainHeight, inHole, isBlocked, insideObstacle, setActiveTerrain, WORLD } from './world.js';
import { buildCave } from './cave.js';
import { buildVolcano } from './volcano.js';
import { buildSea } from './sea.js';
import { buildSpace } from './space.js';
import { buildLab } from './lab.js';
import { strongAgainst, weakTo } from './types.js';
import { portrait } from './portrait.js';
import { BALLS, BALL_BY_ID, GRADES, gradeStars, recommendedBall, catchChance } from './balls.js';
import { evolveZoneOf } from './types.js';
import { Player, PLAYER_MODEL, PLAYER_NAME } from './player.js';
import { Creature, buildDraftMesh } from './creatures.js';
import { preloadModels, onModelLoaded } from './models.js';
import { buildIntro } from './intro.js';
import { Numberblock, FollowChain, buildNumberblockMesh, animateNumberblock } from './numberblocks.js';
import { NUMBER_COLORS, colorForCount } from './palette.js';
import { Battle } from './battle.js';
import { Confetti, Particles, Sound } from './effects.js';
import { Dex } from './dex.js';
import { Party } from './party.js';
import { Quiz } from './quiz.js';
import { listSaves, loadSave, saveGame, deleteSave, formatWhen } from './save.js';
import { makeBlockMesh, makeNumberSprite, rand } from './util.js';

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
    const col = NUMBER_COLORS[Number(face)];
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
const NPC_MODELS = ['나미.glb', '웅이.glb', '봄이.glb', '리리.glb', '코리.glb', '오박사.glb'];
const modelFiles = [PLAYER_MODEL, ...creatureData.creatures.map((c) => c.model), ...NPC_MODELS];
const loadingEl = document.getElementById('title-loading');
preloadModels(modelFiles, (done, total) => {
  loadingEl.textContent = `친구들 불러오는 중 ${done}/${total}`;
  loadingEl.classList.toggle('hidden', done >= total);
});
document.getElementById('title-sub').textContent = `${starters.map((c) => c.name).join('·')}와 함께 떠나는 신나는 숫자 모험!`;
const nbById = Object.fromEntries(nbData.numberblocks.map((n) => [n.id, n]));
const nbByNumber = Object.fromEntries(nbData.numberblocks.map((n) => [n.number, n]));

// ---------- 지역(zone) ----------
// 각 지역은 자기 scene, 지형, 몬스터, 블록을 가진다. 주인공과 파트너들은 지역을 옮겨 다닌다.
function makeZone(name, builder) {
  const scene = new THREE.Scene();
  const world = builder(scene);
  return { name, label: ZONE_INFO[name]?.name || name, scene, world, terrain: world.terrain, creatures: [], pickups: [], rescue: null, nbTimer: rand(10, 25), respawnTimer: 6 };
}
// 지역은 필요할 때 만든다 (시작할 때 다 만들면 타이틀이 늦게 뜬다): 푸른숲은 시작 직후 뒤에서, 나머지는 처음 갈 때(화면 전환 페이드 중).
const BUILDERS = { forest: buildWorld, cave: buildCave, volcano: buildVolcano, sea: buildSea, space: buildSpace, lab: buildLab };
const WILD_TOTAL = { forest: 29, cave: 16, volcano: 18, sea: 14, space: 18 }; // 지역별 야생 몬스터 자리 수 (각 지역 wildSpots 길이)
const PICKUP_CAP = { forest: 12, cave: 8, volcano: 8, sea: 10, space: 8 }; // 줍는 블록 자리 수 (적게: 블록은 대결·구출 퀴즈로 얻는다)
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
function spawnPickup(z, x, zz) {
  const m = makeBlockMesh(0xffffff);
  if (z.world.dark) { m.material.emissive = new THREE.Color(0x9fe8ff); m.material.emissiveIntensity = 0.7; m.userData.glow = true; } // 어두운 곳의 형광 블록
  m.position.set(x, z.terrain.height(x, zz) + 0.6, zz);
  m.userData.t = rand(0, 10);
  z.scene.add(m);
  z.pickups.push(m);
}
/** 지역을 만들고(없으면) 몬스터·보스·블록을 채운다. 저장에서 이미 잡은 몬스터는 빼 둔다. */
function getZone(name) {
  if (zones[name]) return zones[name];
  const z = makeZone(name, BUILDERS[name]);
  zones[name] = z;
  setActiveTerrain(z.terrain); // Creature 생성 시 지형 높이를 쓰므로 잠시 전환
  const wild = creatureData.creatures.filter((c) => c.zone === z.name && !c.boss && !c.special && c.catchable);
  z.world.wildSpots.forEach(([x, zz], i) => { if (wild.length) spawnCreature(z, wild[i % wild.length].id, x, zz); });
  const boss = creatureData.creatures.find((c) => c.zone === z.name && c.boss);
  if (boss) { const c = spawnCreature(z, boss.id, z.world.bossSpot.x, z.world.bossSpot.z); c.mesh.userData.bossZone = z.name; }
  // 특별한 자리에만 나오는 몬스터 (잠만보의 잠자는 곳 등)
  for (const c of creatureData.creatures.filter((c) => c.zone === z.name && c.special)) {
    const spot = z.world.specialSpots?.[c.special];
    if (spot) spawnCreature(z, c.id, spot.x, spot.z);
  }
  for (const [x, zz] of z.world.pickupSpots.slice(0, PICKUP_CAP[name] ?? 16)) spawnPickup(z, x, zz);
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
const ZONE_COUNT = Object.keys(BUILDERS).filter((n) => creatureData.creatures.some((c) => c.zone === n && c.boss)).length; // 보스가 있는 지역만 정복 대상 (연구소 제외)

// ---------- 게임 상태 ----------
const MAX_BLOCKS = 100; // 블록 더미 최대 (31개부터는 10칸 기둥으로 쌓인다)
const state = { name: PLAYER_NAME, blocks: 0, caught: 0, rescued: 0, conquered: {}, caughtCreatures: {}, tutorial: 0, frames: 0, glow: false, dex: {}, glowBlocks: 0, prompt: 0, autosave: 90, returnTo: null, balls: { bronze: 3, silver: 0, gold: 0, diamond: 0 } }; // balls: 넘버볼 재고 (처음엔 브론즈 3개) // returnTo: 연구소 워프 패드로 돌아갈 지역 // glowBlocks: 어두운 곳에서 주운 형광 블록 수
const party = new Party(speciesById);
party.conqueredCount = () => Object.keys(state.conquered).length;
party.zoneOf = () => zone?.name || 'forest';
const dex = new Dex(creatureData.creatures, Object.fromEntries(Object.entries(ZONE_INFO).map(([k, v]) => [k, v.name])));
dex.lastCaught = state.dex;
const quiz = new Quiz({ dex, species: creatureData.creatures.filter((c) => c.model && !c.boss && !c.evolvedFrom), sound });
for (const f of modelFiles) onModelLoaded(f, () => { dex.cache.clear(); renderStarter(); if (party.leader) refreshHud(); }); // 모델이 오면 도감/선택 그림도 새로

// 주운 블록은 주인공 바로 뒤에 숫자블록 캐릭터로 쌓인다.
const myStack = { mesh: null, pop: 0 };
const STACK_SCALE = 0.72; // 따라오는 블록 더미는 조금 작게 (주인공을 가리지 않게)
function setBlocks(n, { glow = false } = {}) {
  n = Math.max(0, Math.min(MAX_BLOCKS, n));
  if (n > state.blocks && glow) state.glowBlocks += n - state.blocks; // 형광 블록 획득
  state.blocks = n;
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
}

const hudBlocks = document.getElementById('hud-blocks');
const hudLeader = document.getElementById('hud-leader');
const hudBlockIcon = document.querySelector('.hud-icon.block');
const hudPokeIcon = document.getElementById('hud-poke-icon');
const hudPokeImg = document.getElementById('hud-poke-img');
const hudSwap = document.querySelector('#hud-leader-row .hud-swap');
function refreshHud() {
  hudBlocks.textContent = `${state.blocks}개`;
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
    say(`${party.name(cand)}이(가) 대표 포켓몬이 됐어!`, { sec: 3, faceImg: dex.thumbs(party.species(cand))?.color || null });
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
  const old = chain.find((f) => f.isLeader);
  if (old) { chain.remove(old.mesh); zone.scene.remove(old.mesh); }
  party.setLeader(member);
  const mesh = member.mesh;
  mesh.visible = true;
  mesh.rotation.set(0, 0, 0);
  mesh.scale.setScalar(party.species(member).scale || 1);
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
  if (wasLeader) { chain.replace(oldMesh, newMesh); zone.scene.remove(oldMesh); }
  oldMesh.visible = true; oldMesh.scale.setScalar(oldSp.scale || 1);
  oldMesh.position.copy(stage); oldMesh.rotation.set(0, Math.atan2(player.position.x - stage.x, player.position.z - stage.z), 0);
  zone.scene.add(oldMesh);
  newMesh.visible = false; newMesh.position.copy(stage); newMesh.rotation.copy(oldMesh.rotation); newMesh.scale.setScalar(0.001);
  zone.scene.add(newMesh);
  evo = { t: 0, m, oldSp, sp, oldMesh, newMesh, wasLeader, stage, flashed: false };
  evoBanner.innerHTML = `${oldSp.name}이(가) 진화한다…!`;
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
    evoBanner.innerHTML = `✨ ${e.sp.name}(으)로 진화했다! ✨<small>공격 ${e.m.atk} · 체력 ${e.m.maxHp}</small>`;
  } else if (T < 4.2) { // 3) 새 모습이 커지며 등장, 색종이
    const k = Math.min(1, (T - 2.2) / 0.8);
    const back = 1 + 2.7 * Math.pow(k - 1, 3) + 1.7 * Math.pow(k - 1, 2);
    e.newMesh.scale.setScalar(Math.max(0.001, (e.sp.scale || 1) * back));
    e.newMesh.rotation.y += dt * 1.5 * (1 - k);
    evoFlash.style.opacity = String(Math.max(0, 1 - (T - 2.2) * 2));
    if (T - 2.2 < 0.1) confetti.burst(220);
    if (Math.random() < 0.3) particles.stars(zone.scene, e.stage.clone().add(up), 3, new THREE.Color(party.color(e.m)).getHex(), 0.5);
  } else { // 끝: 원래 자리로
    evoFlash.style.opacity = '0';
    evoBanner.classList.add('hidden');
    e.newMesh.scale.setScalar(e.sp.scale || 1);
    if (e.wasLeader) attachLeader(e.m); else zone.scene.remove(e.newMesh);
    say(`축하해! ${e.oldSp.name}이(가) ${e.sp.name}(으)로 진화했어! 공격 ${e.m.atk}, 체력 ${e.m.maxHp}!`, { sec: 7 });
    refreshHud(); autosave();
    snapCam = true;
    evo = null;
  }
}
dex.bindParty({
  party,
  getBlocks: () => state.blocks,
  getProgress: () => ({ caught: state.caught, total: totalCreatures, rescued: state.rescued, conquered: Object.keys(state.conquered).length, zones: ZONE_COUNT }), // 친구·구출·정복 진행은 도감에서 본다
  getConquered: () => state.conquered,
  getZoneName: () => zone?.name,
  onUpgrade: (m, stat) => {
    const cost = party.upgradeCost(m, stat);
    if (state.blocks < cost) { say(`블록이 ${cost}개 필요해! 블록을 줍거나 대결에서 이겨서 모으자.`); return; }
    const n = 1;
    party.upgrade(m, stat);
    setBlocks(state.blocks - cost);
    sound.pickup();
    const next = party.nextSkill(m);
    const just = stat === 'atk' && party.skills(m).length && party.skills(m)[party.skills(m).length - 1].atk > m.atk - n;
    if (just && party.skills(m).length > 1) { const s = party.skills(m)[party.skills(m).length - 1]; sound.fanfare(); say(`${party.name(m)}이(가) 새 기술 ${s.name}을(를) 배웠어!`, { sec: 5 }); }
    else if (party.canEvolve(m) && !m.evolveTold) { m.evolveTold = true; say(`${party.name(m)}이(가) 진화할 수 있어! ✨ 진화! 버튼을 눌러봐.`, { sec: 6 }); }
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
  onLeader: (m) => { if (party.isFainted(m)) { say(`${party.name(m)}은(는) 기절했어. 오박사님께 치료받아야 대표가 될 수 있어.`); return; } attachLeader(m); sound.click(); say(`${party.name(m)}이(가) 대표 포켓몬이 됐어! 이제 ${party.name(m)}이(가) 싸워.`, { sec: 4, faceImg: dex.thumbs(party.species(m))?.color || null }); },
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
  player.lamp.intensity = zone.world.dark ? (state.glow ? 13 : 8) : 0;
  player.gravityScale = zone.world.gravity || 1;
}
function switchZone(name, spawn, message) {
  warpBtn.classList.add('hidden'); warpNpc = null; // 지역이 바뀌면 안내원 대화도 끝
  if (switching || !BUILDERS[name]) return;
  switching = true;
  fadeEl.classList.add('on');
  sound.portal();
  setTimeout(() => {
    const from = zone;
    zone = getZone(name); // 처음 가는 지역은 여기서(페이드 중) 만들어진다
    setActiveTerrain(zone.terrain);
    for (const m of partyMeshes()) { from.scene.remove(m); zone.scene.add(m); }
    player.teleport(spawn.x, spawn.z);
    if (spawn.yaw !== undefined) cam.yaw = spawn.yaw; // 도착 방향이 정해진 곳(연구소 문 앞 등)
    for (const f of chain.followers) { f.mesh.position.set(spawn.x + rand(-1, 1), terrainHeight(spawn.x, spawn.z), spawn.z + 1.5 + rand(0, 1)); }
    if (state.blocks > 0) setBlocks(state.blocks); // 블록 더미를 새 지역 색(불·물·풀·형광)으로 다시 만든다
    applyZoneEnv();
    camera.position.copy(player.position).add(camOffset());
    snapCam = true;
    showZoneBanner(zone.label);
    if (message) say(message.text, message);
    refreshHud();
    autosave();
    setTimeout(() => { fadeEl.classList.remove('on'); switching = false; }, 150);
  }, 480);
}

// 타는 것: 기차(푸른숲 ↔ 물의길), 로켓(푸른숲 ↔ 꿈의우주). 주인공과 친구들을 숨기고 탈것을 움직인 뒤 지역을 바꾼다.
// 각 지역 world 의 train / rocket 에 { kind, mesh, base, boardPoint, to, dir?, flame? } 가 있다.
const RIDE_MSG = {
  sea: '물의길에 도착! 물 포켓몬들이 사는 바다야. 다리로 섬을 건너자. 돌아갈 땐 기차역에서 E!',
  space: '꿈의우주에 도착! 중력이 약해서 높이 뛸 수 있어. 화면을 위로 밀어 하늘의 태양과 행성들도 봐! 돌아갈 땐 로켓에서 E!',
  forest: '푸른숲으로 돌아왔어!',
};
let ride = null;
function vehiclesHere() { return [zone.world.train, zone.world.rocket].filter(Boolean); }
function startRide(v) {
  if (ride || switching) return;
  ride = { v, t: 0, from: zone.name, switched: false, puff: 0 };
  for (const m of partyMeshes()) m.visible = false;
  if (v.flame) v.flame.visible = true;
  sound.portal();
  const dest = ZONE_INFO[v.to]?.name || v.to;
  say(v.kind === 'train' ? `칙칙폭폭! ${dest}(으)로 출발!` : `3, 2, 1, 발사! ${dest}(으)로!`, { sec: 4 });
}
function updateRide(dt) {
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
    if (v.flame) v.flame.visible = false;
    for (const o of partyMeshes()) o.visible = true;
    ride = null;
    snapCam = true;
  }
}

// ---------- 숫자블록 구출 (랜덤 출몰 + 문제 풀기) ----------
// 지역마다 가끔(45~90초) 숫자블록 친구가 랜덤한 곳에 나타나 도와달라고 한다. 가까이 가서 구출하기 버튼을 누르면 문제가 나오고,
// 맞히면 그 숫자만큼 블록이 내 숫자블록에 합쳐진다. 120초 안에 못 구하면 다른 곳으로 가 버린다.
function dirWord(dx, dz) {
  const a = Math.atan2(dx, -dz); // 북(-z)=0
  const names = ['북', '북동', '동', '남동', '남', '남서', '서', '북서'];
  return names[Math.round(((a + Math.PI * 2) % (Math.PI * 2)) / (Math.PI / 4)) % 8];
}
// NPC와 이야기: 힌트를 한 줄씩 돌아가며 말해 준다. 오박사(heal)는 포켓몬을 모두 치료하고,
// 지역 안내원(warp)과 이야기하는 동안은 대화 버튼 위에 "연구소 가기" 버튼이 켜진다.
const warpBtn = document.getElementById('btn-warp');
let warpNpc = null; // 지금 이야기 중인, 연구소로 데려다줄 수 있는 NPC
warpBtn.onclick = () => {
  const npc = warpNpc; if (!npc) return;
  warpBtn.classList.add('hidden'); npc.talking = false; warpNpc = null;
  state.returnTo = { zone: zone.name, spawn: { x: npc.x + 1.5, z: npc.z + 1.5 } };
  goToLab(`${npc.name}이(가) 연구소로 데려다줬어! 오박사님께 치료받고, 워프 패드로 돌아가자.`, npcFace(npc));
};
// ----- 상황 버튼: 가까이 가면 할 수 있는 일(이야기·기차 타기·로켓 타기·구출)이 화면에 버튼으로 나타난다. E키/엔터도 같은 일을 한다 -----
const ctxBtn = document.getElementById('ctx-action');
let ctxAction = null, ctxClicked = false;
ctxBtn.onclick = () => { ctxClicked = true; };
const jumpBtn = document.querySelector('#touch-actions button[data-key="jump"]');
function offer(label, run, short = label) { if (!ctxAction) ctxAction = { label, run, short }; }
function updateCtxButton() {
  const show = ctxAction && !battle.active && !dex.open && !quiz.open && !ride && !switching && !evo;
  if (document.body.classList.contains('touch')) { // 터치 화면: 점프 버튼이 그 일을 하는 버튼으로 바뀐다 (색도 바뀜)
    ctxBtn.classList.add('hidden');
    const label = show ? ctxAction.short : '점프';
    if (jumpBtn.textContent !== label) { jumpBtn.textContent = label; jumpBtn.classList.toggle('ctx', !!show); jumpBtn.dataset.key = show ? 'action' : 'jump'; }
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
  const text = `${npc.name}: ${lines[npc.line]}${healed ? ' (포켓몬들을 치료해 줬단다!)' : ''}`;
  say(text, { sec: 6, faceImg: npcFace(npc) });
  // 데려다줄 수 있는 안내원과 이야기하는 동안은 대화 버튼 위에 "연구소 가기" 버튼이 켜진다
  npc.talking = true;
  if (npc.warp) { warpNpc = npc; warpBtn.classList.remove('hidden'); }
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
    const x = player.position.x + rand(-45, 45), zz = player.position.z + rand(-45, 45);
    const d = Math.hypot(x - player.position.x, zz - player.position.z);
    if (Math.abs(x) > half || Math.abs(zz) > half || d < 12 || inHole(x, zz) || isBlocked(x, zz) || insideObstacle(x, zz, 1.4)) continue;
    const nb = new Numberblock(z.scene, data, { x, z: zz });
    nb.life = 120;
    nb.help = makeNumberSprite('!', '#e8453c');
    nb.help.position.y = new THREE.Box3().setFromObject(nb.mesh).max.y - nb.mesh.position.y + 0.7; // 머리 위
    nb.help.scale.set(0.8, 0.8, 1);
    nb.mesh.add(nb.help);
    z.rescue = nb;
    nb.arrow = makeRescueArrow(); nb.arrowT = 18; // 처음 18초 동안 머리 위 화살표가 친구 쪽을 가리킨다
    z.scene.add(nb.arrow);
    say(`${data.name}이(가) 도와달래! 머리 위 빨간 화살표를 따라가서 구출하기 버튼을 눌러 문제를 풀자!`, { face: String(number), sec: 7 });
    return;
  }
  z.nbTimer = 10; // 자리를 못 찾으면 잠시 뒤 다시
}
/** 구출 친구가 어디 있는지 가리키는 빨간 화살표 (주인공 머리 위에 떠서 친구 쪽을 향한다) */
function makeRescueArrow() {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0xe8453c, emissive: 0xe8453c, emissiveIntensity: 0.55 });
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 1.6, 10), mat); shaft.rotation.x = Math.PI / 2; shaft.position.z = 0.8;
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.5, 0.9, 12), mat); tip.rotation.x = Math.PI / 2; tip.position.z = 2.05;
  g.add(shaft, tip);
  return g;
}
function removeRescueArrow(z, nb) { if (nb.arrow) { z.scene.remove(nb.arrow); nb.arrow = null; } }
function removeRescue(z, escaped) {
  const nb = z.rescue;
  if (!nb) return;
  removeRescueArrow(z, nb);
  z.scene.remove(nb.mesh);
  z.rescue = null;
  z.nbTimer = rand(20, 40);
  if (escaped) say(`${nb.data.name}이(가) 다른 곳으로 가 버렸어… 다음에 또 나타날 거야.`, { face: String(nb.data.number), sec: 4 });
}
function rescueSolved(z, nb) {
  nb.rescued = true;
  const n = nb.data.number;
  particles.stars(z.scene, nb.mesh.position.clone().add(new THREE.Vector3(0, 1, 0)), 24, new THREE.Color(colorForCount(n)).getHex(), 0.5);
  removeRescueArrow(z, nb);
  z.scene.remove(nb.mesh);
  z.rescue = null;
  z.nbTimer = rand(20, 40);
  state.rescued++;
  const bonus = quiz.problem?.bonus || 1; // 나누기처럼 어려운 문제는 블록을 더 준다
  const before = state.blocks, gain = n * blockValue() * bonus;
  setBlocks(state.blocks + gain);
  sound.fanfare();
  confetti.burst(100);
  say(`${nb.data.name}: 고마워! ${before}에 ${gain}을 더해서 이제 블록 ${state.blocks}개!${bonus > 1 ? ` (나누기 문제라 ${bonus}배!)` : gain > n ? ` (이 지역 블록은 ${blockValue()}배!)` : ''} 내 블록이 네 숫자블록에 합쳐졌어!`, { face: String(n), sec: 6 });
  refreshHud();
  autosave();
}

/** 대결에서 이기면 받는 블록: 상대 공격력 × 지역 블록 가치 (보스는 2배). 단, 그 등급을 잘 잡는(75% 이상) 넘버볼 값보다 항상 조금 더 많다 (볼을 만들어도 남게) */
const ZONE_GRADE = { forest: 1, cave: 2, sea: 3, volcano: 4, space: 5 }; // 그 지역 야생 포켓몬의 등급
function winReward(c) {
  const grade = c.isBoss ? (ZONE_GRADE[zone.name] || 1) : (c.data.grade || 1); // 보스는 그 지역 기준 볼 값으로 (다이아 값까지는 아니게)
  const ball = BALLS.find((b) => catchChance(grade, b.tier) >= 75) || BALLS[BALLS.length - 1];
  return Math.max(c.data.baseAtk * blockValue() * (c.isBoss ? 2 : 1), ball.cost + 1);
}

// ---------- 튜토리얼/진행 ----------
function tutorial() {
  if (state.tutorial === 0 && player.moved) { state.tutorial = 1; say('잘했어! 이번엔 스페이스(점프 버튼)로 점프해 봐!'); }
  else if (state.tutorial === 1 && player.jumped) { state.tutorial = 2; say('하얀 블록을 찾아서 주워보자! 블록 위로 걸어가면 돼.'); }
  else if (state.tutorial === 2 && state.blocks > 0) { state.tutorial = 3; say('블록이 네 뒤에 숫자블록으로 쌓였어! B(도감)를 열면 블록으로 포켓몬의 공격력이나 체력을 올릴 수 있어.', { sec: 7 }); }
  else if (state.tutorial === 3 && state.blocks >= 3 && !state.upgradeTold) { state.upgradeTold = true; say('몬스터와 만나면 내 포켓몬이 대신 싸워! 체력이 0이 되면 지니까 도감에서 체력도 올려 두자.', { sec: 7 }); }
  else if (state.tutorial === 3 && state.caught > 0) { state.tutorial = 4; say('첫 친구다! 도감에서 대표를 바꿀 수 있어. 숫자블록 친구가 도와달라고 나타나면 문제를 풀어 구출해 줘!', { sec: 7 }); }
  else if (state.tutorial === 4 && state.caught >= 3 && !state.mapTold) { state.mapTold = true; say('푸른숲엔 다른 지역으로 가는 길이 있어. 동북쪽 불의산 입구, 서쪽 기차역(물의길), 남동쪽 로켓 발사장(꿈의우주)! 지역마다 보스를 잡으면 정복이야!', { sec: 10 }); }
}
function conquer(zoneName) {
  state.conquered[zoneName] = true;
  const n = Object.keys(state.conquered).length;
  showZoneBanner(`${ZONE_INFO[zoneName].name} 정복!`);
  confetti.burst(220);
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
      <div class="starter-stat">${sp.type} 속성 · ❤ 체력 ${sp.starterHp ?? sp.baseHp} · ⚔ 공격 ${sp.starterAtk ?? sp.baseAtk}</div>
      <div class="starter-skill">기술: ${first ? first.name : '-'}${sp.skills?.[1] ? ` → ${sp.skills[1].name}` : ''}</div>`;
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
  document.getElementById('btn-save').classList.remove('hidden');
  document.getElementById('btn-code').classList.remove('hidden');
  showZoneBanner(zone.label);
  refreshHud();
}
function chooseStarter(id) {
  starterEl.classList.add('hidden');
  startGame();
  const member = addStarter(id);
  confetti.burst(120);
  sound.fanfare();
  say(`안녕, ${state.name}! 난 원이야. ${party.name(member)}와 함께 가자! 방향키(또는 왼쪽 화면을 눌러 조이스틱)로 움직여 봐!`, { sec: 6 });
  autosave();
}
const titleEl = document.getElementById('title');
const newgameEl = document.getElementById('newgame');
const continueEl = document.getElementById('continue');
const nameInput = document.getElementById('name-input');
document.getElementById('btn-new').onclick = () => {
  sound.ensure();
  titleEl.classList.add('hidden');
  nameInput.value = '';
  newgameEl.classList.remove('hidden');
  setTimeout(() => nameInput.focus(), 50);
};
function confirmName() {
  const name = (nameInput.value || '').trim().slice(0, 8) || PLAYER_NAME;
  if (loadSave(name) && !confirm(`"${name}" 이름으로 저장된 모험이 있어요. 새로 시작하면 지워집니다. 새로 시작할까요?`)) return;
  state.name = name;
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
document.getElementById('btn-continue').disabled = listSaves().length === 0;

// ---------- 저장 / 불러오기 ----------
function buildSaveData() {
  return {
    v: 1, name: state.name, savedAt: Date.now(),
    zone: zone.name, pos: { x: +player.position.x.toFixed(1), z: +player.position.z.toFixed(1) },
    blocks: state.blocks, glowBlocks: state.glowBlocks, caught: state.caught, rescued: state.rescued,
    conquered: { ...state.conquered }, caughtCreatures: state.caughtCreatures, dex: { ...state.dex },
    tutorial: state.tutorial, upgradeTold: !!state.upgradeTold, mapTold: !!state.mapTold, glow: state.glow,
    balls: { ...state.balls },
    party: party.members.map((m) => ({ speciesId: m.speciesId, atk: m.atk, maxHp: m.maxHp, hp: m.hp, wins: m.wins || 0 })),
    returnTo: state.returnTo,
    leader: Math.max(0, party.members.findIndex((m) => party.isLeader(m))),
  };
}
const saveToastEl = document.getElementById('save-toast');
let saveToastTimer = 0;
function doSave(manual = false) {
  if (!zone || !player || battle.active || ride || switching) return false;
  const ok = saveGame(buildSaveData());
  if (manual) { saveToastEl.textContent = ok ? `💾 저장했어! (${state.name})` : '저장할 수 없어요 (브라우저 저장 공간)'; saveToastEl.classList.remove('hidden'); saveToastTimer = 2.2; sound.click(); }
  return ok;
}
function autosave() { if (zone && player) { doSave(false); state.autosave = 90; } }
document.getElementById('btn-save').onclick = () => doSave(true);

// ---------- 저장 코드: 다른 기기로 옮기기 (텍스트로 복사해 두었다가 붙여넣기) ----------
const CODE_PREFIX = 'NPK1.';
function encodeSave(data) { const bytes = new TextEncoder().encode(JSON.stringify(data)); let bin = ''; for (const b of bytes) bin += String.fromCharCode(b); return CODE_PREFIX + btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
function decodeSave(text) {
  const t = (text || '').replace(/\s+/g, '');
  if (!t.startsWith(CODE_PREFIX)) throw new Error('NPK1. 으로 시작하는 저장 코드가 아니에요');
  let b64 = t.slice(CODE_PREFIX.length).replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4) b64 += '=';
  const bin = atob(b64); const bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const d = JSON.parse(new TextDecoder().decode(bytes));
  if (!d || d.v !== 1 || !d.name) throw new Error('알 수 없는 저장 코드예요');
  return d;
}
const codeModalEl = document.getElementById('code-modal'), codeTextEl = document.getElementById('code-text');
document.getElementById('btn-code').onclick = async () => {
  if (!zone || !player || battle.active) return;
  const data = buildSaveData(); saveGame(data);
  const code = encodeSave(data);
  codeTextEl.value = code;
  let copied = false;
  try { await navigator.clipboard.writeText(code); copied = true; } catch (_) { copied = false; }
  document.getElementById('code-modal-sub').textContent = copied ? '복사했어! 텔레그램이나 메모에 붙여넣어 두면 다른 기기에서 이어 할 수 있어.' : '아래 코드를 길게 눌러 전체 선택한 뒤 복사해서 텔레그램이나 메모에 붙여넣어 둬.';
  codeModalEl.classList.remove('hidden');
  sound.click();
};
document.getElementById('btn-code-close').onclick = () => codeModalEl.classList.add('hidden');
document.getElementById('btn-code-copy').onclick = async () => { try { await navigator.clipboard.writeText(codeTextEl.value); document.getElementById('code-modal-sub').textContent = '복사했어!'; } catch (_) { codeTextEl.focus(); codeTextEl.select(); } };
codeTextEl.onclick = () => { codeTextEl.focus(); codeTextEl.select(); };
let codeLoaded = null;
document.getElementById('btn-code-check').onclick = () => {
  const prev = document.getElementById('code-preview'), btn = document.getElementById('btn-code-load');
  try {
    const d = decodeSave(document.getElementById('code-input').value);
    codeLoaded = d;
    const leader = d.party?.[d.leader] ? speciesById[d.party[d.leader].speciesId]?.name : null;
    prev.textContent = `✅ ${d.name}의 모험 · ${ZONE_INFO[d.zone]?.name || d.zone} · 친구 ${d.caught || 0}마리 · 정복 ${Object.keys(d.conquered || {}).length}/${ZONE_COUNT} · 블록 ${d.blocks || 0}개${leader ? ` · 대표 ${leader}` : ''} · ${formatWhen(d.savedAt)}`;
    prev.classList.remove('bad'); prev.classList.remove('hidden'); btn.disabled = false;
  } catch (e) { codeLoaded = null; prev.textContent = `❌ ${e.message}`; prev.classList.add('bad'); prev.classList.remove('hidden'); btn.disabled = true; }
};
document.getElementById('btn-code-load').onclick = () => {
  if (!codeLoaded) return;
  if (loadSave(codeLoaded.name) && !confirm(`"${codeLoaded.name}" 이름의 저장이 이 기기에 이미 있어요. 코드의 진행으로 바꿀까요?`)) return;
  saveGame(codeLoaded);
  continueEl.classList.add('hidden');
  applySave(codeLoaded);
};
function applySave(d) {
  state.name = d.name;
  Object.assign(state, { blocks: 0, glowBlocks: d.glowBlocks || 0, caught: d.caught || 0, rescued: d.rescued || 0, conquered: { ...(d.conquered || {}) }, caughtCreatures: d.caughtCreatures || {}, tutorial: d.tutorial ?? 5, upgradeTold: !!d.upgradeTold, mapTold: !!d.mapTold, glow: !!d.glow });
  for (const k of Object.keys(state.dex)) delete state.dex[k];
  Object.assign(state.dex, d.dex || {});
  pendingCaught = d.caughtCreatures || {};
  state.returnTo = d.returnTo || null;
  state.balls = { bronze: 3, silver: 0, gold: 0, diamond: 0, ...(d.balls || {}) };
  for (const z of Object.values(zones)) applyPendingCaught(z); // 타이틀 중에 미리 만든 푸른숲에도 적용
  if (state.conquered.forest) removeBoulder();
  startGame({ zoneName: BUILDERS[d.zone] ? d.zone : 'forest', pos: d.pos });
  for (const m of d.party || []) {
    const sp = speciesById[m.speciesId];
    if (!sp) continue;
    const member = party.add(m.speciesId, buildDraftMesh(sp));
    Object.assign(member, { atk: m.atk, maxHp: m.maxHp, hp: Math.min(m.hp, m.maxHp), wins: m.wins || 0 });
  }
  const leader = party.healthy().includes(party.members[d.leader]) ? party.members[d.leader] : (party.healthy()[0] || party.members[0]);
  if (leader) attachLeader(leader);
  setBlocks(d.blocks || 0);
  sound.fanfare();
  say(`다시 만나서 반가워, ${state.name}! ${leader ? party.name(leader) + '와 ' : ''}모험을 이어서 하자!`, { sec: 6 });
  refreshHud();
}

if (location.search.includes('debug')) {
  window.__game = { get player() { return player; }, say, state, zones, getZone, setBlocks, input, renderer, switchZone, startRide, vehiclesHere, spawnRescue, get zone() { return zone; }, get ride() { return ride; }, battle, cam, dex, party, quiz, addStarter, attachLeader, evolveMember, conquer, doSave, applySave, listSaves, buildSaveData };
}

// ---------- 루프 ----------
const clock = new THREE.Clock();
let prevBattle = false;
function frame() {
  state.frames++;
  fitRenderer();
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

  if (evo) { // 진화 연출 중에는 그것만 그린다
    updateEvolution(dt);
    updateCtxButton();
    zone.world.animate?.(t);
    particles.update(dt); confetti.update(dt);
    if (msgTimer > 0) { msgTimer -= dt; if (msgTimer <= 0) msgEl.classList.add('hidden'); }
    renderer.render(zone.scene, camera);
    input.endFrame();
    requestAnimationFrame(frame);
    return;
  }
  ctxAction = null; // 이번 프레임에 할 수 있는 일은 아래 탐험 코드가 다시 채운다
  if (input.wasPressed('dex') && !battle.active && !quiz.open && !ride) dex.toggle(state.dex);
  if (dex.open) {
    if (input.wasPressed('cancel')) dex.hide();
  } else if (quiz.open) {
    if (input.wasPressed('cancel')) quiz.finish(false);
  } else if (battle.active) {
    battle.update(dt);
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
      } else if (near(w.volcanoGate, 2.4)) {
        moved = true;
        switchZone('volcano', getZone('volcano').world.spawn, { text: '불의산에 들어왔어! 불 포켓몬의 땅이야. 용암은 뜨거우니 조심! 포탈로 돌아갈 수 있어.', sec: 7 });
      } else if (Math.abs(pp.x - w.labDoor.x) < 1.6 && pp.z > w.labDoor.z - 0.6 && pp.z < w.labDoor.z + 1.6) { // 문 앞 네모 칸 (문 틈으로 들어서면 바로)
        moved = true;
        switchZone('lab', getZone('lab').world.spawn, { text: '오박사 연구소에 들어왔어! 오박사님께 가까이 가서 대화 버튼을 눌러 봐. 문으로 나가면 마을이야.', sec: 6 });
      }
    } else if (zone.world.portal && near(zone.world.portal, 1.6)) {
      moved = true;
      const back = zones.forest.world.arrivals[zone.name] || zones.forest.world.spawn;
      switchZone('forest', back, { text: '푸른숲으로 돌아왔어!', sec: 4 });
    }
    // ----- 사람과 이야기하기 (지역 안내 NPC, 오박사) -----
    if (!moved) for (const npc of zone.world.npcs || []) {
      const d = Math.hypot(pp.x - npc.x, pp.z - npc.z);
      if (d < 7) npc.mesh.rotation.y = Math.atan2(pp.x - npc.x, pp.z - npc.z); // 가까이 오면 이쪽을 본다
      if (d < 2.8) {
        offer('💬 대화', () => talkTo(npc), '💬\n대화');
        if (!npc.talking && !npc.prompted) { npc.prompted = true; say(`${npc.name}님이야! 대화 버튼을 눌러 봐.`, { sec: 3, faceImg: npcFace(npc) }); } // 다가갈 때 한 번만
      } else if (npc.talking || npc.prompted) { npc.talking = false; npc.prompted = false; if (warpNpc === npc) { warpBtn.classList.add('hidden'); warpNpc = null; } } // 멀어지면 버튼도 사라진다
    }
    // ----- 연구소 워프 패드: 마지막에 있던 지역으로 -----
    if (!moved && zone.world.warpPad && near(zone.world.warpPad, 1.5)) {
      if (state.returnTo && BUILDERS[state.returnTo.zone]) {
        moved = true;
        const r = state.returnTo; state.returnTo = null;
        switchZone(r.zone, r.spawn, { text: `${ZONE_INFO[r.zone]?.name || r.zone}(으)로 돌아왔어!`, sec: 4 });
      } else if (state.prompt <= 0) { state.prompt = 8; say('워프 패드야. 다른 지역의 안내원이 데려다줬을 때 그 지역으로 돌아갈 수 있어.', { sec: 4 }); }
    }
    if (!moved) for (const v of vehiclesHere()) {
      if (!near(v.boardPoint, 3.2)) continue;
      const dest = ZONE_INFO[v.to]?.name || v.to;
      offer(v.kind === 'train' ? '🚂 기차 타기' : '🚀 로켓 타기', () => startRide(v), v.kind === 'train' ? '🚂\n타기' : '🚀\n타기');
      if (state.prompt <= 0) { state.prompt = 8; say(v.kind === 'train' ? `기차역이야! 기차 타기 버튼을 누르면 ${dest}(으)로 가!` : `로켓이야! 로켓 타기 버튼을 누르면 ${dest}(으)로 가!`, { sec: 4 }); }
      break;
    }

    // ----- 블록 줍기 -----
    for (let i = zone.pickups.length - 1; i >= 0; i--) {
      const b = zone.pickups[i];
      b.rotation.y = t + b.userData.t;
      b.position.y = terrainHeight(b.position.x, b.position.z) + 0.6 + Math.sin(t * 2 + b.userData.t) * 0.1;
      if (b.position.distanceTo(pp) < 1.1) {
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
    if (zone.respawnTimer <= 0 && zone.pickups.length < 4 && !zone.world.indoor) { // 블록은 아주 드물게 다시 생긴다 (대결·구출 퀴즈가 주 수입)
      zone.respawnTimer = 60;
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
          if (other) { attachLeader(other); L = other; say(`${party.name(L)}이(가) 대신 나서!`, { sec: 3 }); }
          else { c.becomeShy(); say('포켓몬이 모두 기절했어… 오박사 연구소에서 치료받자!', { sec: 5 }); break; }
        }
        const hp = c.hp ?? c.data.baseHp;
        say(c.isBoss ? `${zone.label}의 보스 ${c.data.name}이다! 체력이 ${hp}이나 돼! 공격력은 ${c.data.baseAtk}!` : `${c.data.name}이(가) 나타났다! 체력 ${hp}, 공격력 ${c.data.baseAtk}!`, { sec: 3 });
        battle.start({
          creature: c, player, scene: zone.scene, member: L,
          hideMeshes: chain.followers.filter((f) => !f.isLeader).map((f) => f.mesh), decor: zone.world.decor,
          onCaught: () => {
            const L = battle.member; // 대결 중 교체했을 수 있다
            c.becomeFriend();
            const already = party.members.find((m) => m.speciesId === c.data.id); // 같은 종은 파티에 한 마리만. 또 잡으면 누적 수만 오른다 (진화 조건)
            const member = already || party.add(c.data.id, c.mesh);
            zone.scene.remove(c.mesh); // 볼 안으로. 도감에서 대표로 고르면 다시 나온다
            (state.caughtCreatures[zone.name] ||= []).push(zone.creatures.indexOf(c)); // 저장용: 어느 몬스터를 잡았는지
            party.heal(L);              // 이긴 기쁨으로 대표 체력 회복
            L.wins = (L.wins || 0) + 1;  // 진화 조건: 대표로 이긴 횟수
            const reward = winReward(c);
            setBlocks(Math.min(MAX_BLOCKS, state.blocks + reward));
            state.dex[c.data.id] = (state.dex[c.data.id] || 0) + 1;
            const cnt = state.dex[c.data.id];
            if (c.isBoss) {
              conquer(zone.name);
              if (zone.name === 'forest') {
                removeBoulder();
                say(`${c.data.name}이(가) 친구가 됐어! 푸른숲 정복! 북쪽 산의 지하동굴 입구 바위도 치워졌어!`, { sec: 7 });
              } else say(`${c.data.name}이(가) 친구가 됐어! ${zone.label} 정복! 블록 ${reward}개 획득!`, { sec: 6 });
            } else {
              state.caught++;
              const sp = speciesById[c.data.id];
              const evo = sp.evolution;
              const winNote = party.canEvolve(L) ? ` ${party.name(L)}이(가) 진화할 수 있어! 도감에서 ✨진화!` : (party.evolveNeed(L)?.wins ? ` ${party.name(L)} ${L.wins}승!` : '');
              if (already) say(`${sp.name}을(를) 또 잡았어! 누적 ${cnt}마리. 블록 ${reward}개 획득!${winNote}`, { sec: 6 });
              else say(`${c.data.name}이(가) 친구가 됐어! 블록 ${reward}개 획득!${winNote} 도감에서 대표로 고르거나 블록으로 키울 수 있어.`, { sec: 6 });
            }
            if (c.data.id === 'm07' && !state.glow) { state.glow = true; player.lamp.intensity = 13; player.lamp.distance = 30; if (zones.cave) zones.cave.scene.fog.far = 110; say(`${c.data.name}가 동굴을 환하게 밝혀줘!`, { sec: 5 }); }
            if (!already && party.members.length === 2) say(`${party.name(member)}은(는) 볼 안에서 쉬고 있어. 도감에서 "대표로 하기"를 누르면 따라와!`, { sec: 6 });
            refreshHud();
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
              say(`${party.name(L)}이(가) 기절했어… ${party.name(other)}이(가) 대표로 나서! 오박사님께 가면 치료해 줘.`, { sec: 7 });
            } else {
              say('포켓몬이 모두 기절했어… 눈앞이 캄캄해…', { sec: 3 });
              setTimeout(() => goToLab('오박사님이 연구소로 데려왔어. 오박사님께 가까이 가서 대화 버튼을 누르면 치료해 줘!'), 900);
            }
            refreshHud();
          },
          onEscaped: () => { // 넘버볼에서 튀어나와 도망: 승리 아님, 블록·승수 없음. 한동안 사라졌다가 돌아온다
            c.flee();
            say(`${c.data.name}이(가) 도망쳤어… 등급이 높은 포켓몬은 더 좋은 넘버볼이 필요해. 도감 넘버볼 탭에서 블록으로 바꾸자!`, { sec: 7 });
            refreshHud();
          },
          onLeave: () => { c.becomeShy(); say('괜찮아, 블록을 모아서 더 강해진 다음 다시 오자!'); refreshHud(); },
        });
        break;
      }
    }

    // ----- 숫자블록 구출: 랜덤 출몰, 가까이 가서 구출하기 버튼 → 문제 -----
    zone.nbTimer -= dt;
    if (!zone.rescue && zone.nbTimer <= 0 && !zone.world.indoor) spawnRescue(zone);
    const nb = zone.rescue;
    if (nb) {
      nb.t += dt;
      nb.life -= dt;
      nb.mesh.position.y = terrainHeight(nb.position.x, nb.position.z) + Math.abs(Math.sin(nb.t * 3)) * 0.12;
      nb.mesh.rotation.y = Math.atan2(pp.x - nb.position.x, pp.z - nb.position.z); // 주인공을 본다
      animateNumberblock(nb.mesh, dt, true);
      if (nb.arrow) { // 화살표: 주인공 머리 위에서 친구 쪽을 가리키다가 시간이 지나거나 가까워지면 사라진다
        nb.arrowT -= dt;
        const far = nb.position.distanceTo(pp);
        if (nb.arrowT <= 0 || far < 7) removeRescueArrow(zone, nb);
        else {
          nb.arrow.position.set(pp.x, pp.y + 3.4 + Math.sin(nb.t * 4) * 0.2, pp.z);
          nb.arrow.rotation.y = Math.atan2(nb.position.x - pp.x, nb.position.z - pp.z);
          nb.arrow.scale.setScalar(nb.arrowT < 1.5 ? Math.max(0.01, nb.arrowT / 1.5) : 1);
        }
      }
      if (nb.life <= 0) removeRescue(zone, true);
      else if (nb.position.distanceTo(pp) < 2.4) offer(`🧩 ${nb.data.name} 구출하기`, () => {
        input.endFrame();
        quiz.ask(nb.data.number, nb.data.name, zone.name).then((ok) => {
          if (zone.rescue !== nb) return;
          if (ok) rescueSolved(zone, nb);
          else say('괜찮아, 다시 와서 도전하자!', { face: String(nb.data.number) });
        });
      }, '🧩\n구출');
    }
    // 버튼을 눌렀거나 E키를 눌렀으면 지금 할 수 있는 일을 한다
    if (ctxAction && (ctxClicked || input.wasPressed('action'))) ctxAction.run();

    chain.update(dt);
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
    const camTarget = resolveCamera(pp.clone().add(camOffset()));
    if (prevBattle || snapCam) { camera.position.copy(camTarget); snapCam = false; }
    else camera.position.lerp(camTarget, look.dx || look.dy || input.isHeld('camLeft') || input.isHeld('camRight') ? 0.35 : 0.08);
    camera.lookAt(pp.x, pp.y + camLookY(), pp.z);
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
  if (msgTimer > 0) { msgTimer -= dt; if (msgTimer <= 0) msgEl.classList.add('hidden'); }
  if (zoneBannerTimer > 0) { zoneBannerTimer -= dt; if (zoneBannerTimer <= 0) zoneBannerEl.classList.add('hidden'); }

  renderer.render(zone.scene, camera);
  input.endFrame();
  requestAnimationFrame(frame);
}
frame();
