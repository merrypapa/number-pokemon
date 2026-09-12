import * as THREE from 'three';
import { Input } from './input.js';
import { buildWorld, terrainHeight, inHole, isBlocked, insideObstacle, setActiveTerrain, WORLD } from './world.js';
import { buildCave } from './cave.js';
import { buildVolcano } from './volcano.js';
import { buildSea } from './sea.js';
import { buildSpace } from './space.js';
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
function say(text, { face = '1', sec = 4 } = {}) {
  msgText.textContent = text;
  msgFace.textContent = face;
  const col = NUMBER_COLORS[Number(face)];
  msgFace.style.background = col ? col.base : '#fff';
  msgFace.style.color = col ? '#fff' : '#333';
  msgEl.classList.remove('hidden');
  msgTimer = sec;
}
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
const modelFiles = [PLAYER_MODEL, ...creatureData.creatures.map((c) => c.model)];
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
  return { name, label: ZONE_INFO[name]?.name || name, scene, world, terrain: world.terrain, creatures: [], pickups: [], rescue: null, nbTimer: rand(25, 50), respawnTimer: 6 };
}
// 지역은 필요할 때 만든다 (시작할 때 다 만들면 타이틀이 늦게 뜬다): 푸른숲은 시작 직후 뒤에서, 나머지는 처음 갈 때(화면 전환 페이드 중).
const BUILDERS = { forest: buildWorld, cave: buildCave, volcano: buildVolcano, sea: buildSea, space: buildSpace };
const WILD_TOTAL = { forest: 29, cave: 16, volcano: 18, sea: 14, space: 18 }; // 지역별 야생 몬스터 자리 수 (각 지역 wildSpots 길이)
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
  const wild = creatureData.creatures.filter((c) => c.zone === z.name && !c.boss && c.catchable);
  z.world.wildSpots.forEach(([x, zz], i) => { if (wild.length) spawnCreature(z, wild[i % wild.length].id, x, zz); });
  const boss = creatureData.creatures.find((c) => c.zone === z.name && c.boss);
  if (boss) { const c = spawnCreature(z, boss.id, z.world.bossSpot.x, z.world.bossSpot.z); c.mesh.userData.bossZone = z.name; }
  for (const [x, zz] of z.world.pickupSpots) spawnPickup(z, x, zz);
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
const ZONE_COUNT = Object.keys(BUILDERS).length;

// ---------- 게임 상태 ----------
const MAX_BLOCKS = 30;
const state = { name: PLAYER_NAME, blocks: 0, caught: 0, rescued: 0, conquered: {}, caughtCreatures: {}, tutorial: 0, frames: 0, glow: false, dex: {}, glowBlocks: 0, regenTimer: 0, prompt: 0, autosave: 90 }; // glowBlocks: 어두운 곳에서 주운 형광 블록 수
const party = new Party(speciesById, state.dex);
const dex = new Dex(creatureData.creatures, Object.fromEntries(Object.entries(ZONE_INFO).map(([k, v]) => [k, v.name])));
dex.lastCaught = state.dex;
const quiz = new Quiz({ dex, species: creatureData.creatures.filter((c) => c.model && !c.boss && !c.evolvedFrom), sound });
for (const f of modelFiles) onModelLoaded(f, () => { dex.cache.clear(); renderStarter(); }); // 모델이 오면 도감/선택 그림도 새로

// 주운 블록은 주인공 바로 뒤에 숫자블록 캐릭터로 쌓인다.
const myStack = { mesh: null, pop: 0 };
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
    const mesh = buildNumberblockMesh({ number: n }, { glow: state.glowBlocks > 0 });
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
const hudZone = document.getElementById('hud-zone');
const hudBlockIcon = document.querySelector('.hud-icon.block');
const hudPokeIcon = document.querySelector('.hud-icon.poke');
function refreshHud() {
  hudBlocks.textContent = `블록 ${state.blocks}개`;
  hudBlockIcon.style.background = state.blocks > 0 ? colorForCount(state.blocks) : '#fff';
  const L = party.leader;
  if (L) {
    hudLeader.textContent = `${party.name(L)} ❤${L.hp}/${L.maxHp} ⚔${L.atk}`;
    hudPokeIcon.style.background = party.color(L);
  } else hudLeader.textContent = '대표 포켓몬 없음';
  hudZone.textContent = zone ? `${zone.label}${state.conquered[zone.name] ? ' ★정복' : ''}` : '';
}
refreshHud();

const battle = new Battle({ input, camera, say, sound, particles, confetti, party });

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
  const member = party.add(speciesId, buildDraftMesh(sp));
  attachLeader(member);
  state.dex[speciesId] = (state.dex[speciesId] || 0) + 1;
  return member;
}
function evolveMember(m) {
  if (!party.canEvolve(m)) return;
  const wasLeader = party.isLeader(m);
  const oldSp = party.species(m), oldMesh = m.mesh;
  const sp = party.evolve(m);
  const mesh = buildDraftMesh(sp);
  m.mesh = mesh;
  if (wasLeader) {
    mesh.position.copy(oldMesh.position);
    mesh.rotation.copy(oldMesh.rotation);
    chain.replace(oldMesh, mesh);
    zone.scene.remove(oldMesh);
    zone.scene.add(mesh);
    particles.stars(zone.scene, mesh.position.clone().add(new THREE.Vector3(0, 1, 0)), 30, 0xffffff, 0.6);
    particles.stars(zone.scene, mesh.position.clone().add(new THREE.Vector3(0, 1, 0)), 20, new THREE.Color(party.color(m)).getHex(), 0.5);
  }
  state.dex[sp.id] = (state.dex[sp.id] || 0) + 1;
  confetti.burst(200);
  sound.fanfare();
  say(`축하해! ${oldSp.name}이(가) ${sp.name}(으)로 진화했어! 공격 ${m.atk}, 체력 ${m.maxHp}!`, { sec: 7 });
  refreshHud();
}
dex.bindParty({
  party,
  getBlocks: () => state.blocks,
  getProgress: () => ({ caught: state.caught, total: totalCreatures, rescued: state.rescued, conquered: Object.keys(state.conquered).length, zones: ZONE_COUNT }), // 친구·구출·정복 진행은 도감에서 본다
  getConquered: () => state.conquered,
  getZoneName: () => zone?.name,
  onUpgrade: (m, stat, n) => {
    n = Math.min(n, state.blocks);
    if (n <= 0) { say('블록이 없어! 하얀 블록을 주워서 다시 오자.'); return; }
    party.upgrade(m, stat, n);
    setBlocks(state.blocks - n);
    sound.pickup();
    const next = party.nextSkill(m);
    const just = stat === 'atk' && party.skills(m).length && party.skills(m)[party.skills(m).length - 1].atk > m.atk - n;
    if (just && party.skills(m).length > 1) { const s = party.skills(m)[party.skills(m).length - 1]; sound.fanfare(); say(`${party.name(m)}이(가) 새 기술 ${s.name}을(를) 배웠어!`, { sec: 5 }); }
    else if (party.canEvolve(m) && !m.evolveTold) { m.evolveTold = true; say(`${party.name(m)}이(가) 진화할 수 있어! ✨ 진화! 버튼을 눌러봐.`, { sec: 6 }); }
    else say(stat === 'atk' ? `${party.name(m)} 공격력 ${m.atk}!${next ? ` 공격 ${next.atk}이 되면 ${next.name}!` : ''}` : `${party.name(m)} 체력 ${m.maxHp}!`, { sec: 3 });
    refreshHud();
  },
  onLeader: (m) => { attachLeader(m); sound.click(); say(`${party.name(m)}이(가) 대표 포켓몬이 됐어! 이제 ${party.name(m)}이(가) 싸워.`, { sec: 4 }); },
  onEvolve: (m) => evolveMember(m),
});

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
    for (const f of chain.followers) { f.mesh.position.set(spawn.x + rand(-1, 1), terrainHeight(spawn.x, spawn.z), spawn.z + 1.5 + rand(0, 1)); }
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
// 지역마다 가끔(45~90초) 숫자블록 친구가 랜덤한 곳에 나타나 도와달라고 한다. 가까이 가서 E 를 누르면 문제가 나오고,
// 맞히면 그 숫자만큼 블록이 내 숫자블록에 합쳐진다. 120초 안에 못 구하면 다른 곳으로 가 버린다.
function dirWord(dx, dz) {
  const a = Math.atan2(dx, -dz); // 북(-z)=0
  const names = ['북', '북동', '동', '남동', '남', '남서', '서', '북서'];
  return names[Math.round(((a + Math.PI * 2) % (Math.PI * 2)) / (Math.PI / 4)) % 8];
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
    say(`${data.name}이(가) ${dirWord(x - player.position.x, zz - player.position.z)}쪽에서 도와달래! 찾아가서 E(액션)로 문제를 풀어 구출하자!`, { face: String(number), sec: 7 });
    return;
  }
  z.nbTimer = 20; // 자리를 못 찾으면 잠시 뒤 다시
}
function removeRescue(z, escaped) {
  const nb = z.rescue;
  if (!nb) return;
  z.scene.remove(nb.mesh);
  z.rescue = null;
  z.nbTimer = rand(45, 90);
  if (escaped) say(`${nb.data.name}이(가) 다른 곳으로 가 버렸어… 다음에 또 나타날 거야.`, { face: String(nb.data.number), sec: 4 });
}
function rescueSolved(z, nb) {
  nb.rescued = true;
  const n = nb.data.number;
  particles.stars(z.scene, nb.mesh.position.clone().add(new THREE.Vector3(0, 1, 0)), 24, new THREE.Color(colorForCount(n)).getHex(), 0.5);
  z.scene.remove(nb.mesh);
  z.rescue = null;
  z.nbTimer = rand(45, 90);
  state.rescued++;
  const before = state.blocks;
  setBlocks(state.blocks + n);
  sound.fanfare();
  confetti.burst(100);
  say(`${nb.data.name}: 고마워! ${before}에 ${n}을 더해서 이제 블록 ${state.blocks}개! 내 블록이 네 숫자블록에 합쳐졌어!`, { face: String(n), sec: 6 });
  refreshHud();
  autosave();
}

// ---------- 튜토리얼/진행 ----------
function tutorial() {
  if (state.tutorial === 0 && player.moved) { state.tutorial = 1; say('잘했어! 이번엔 스페이스(점프 버튼)로 점프해 봐!'); }
  else if (state.tutorial === 1 && player.jumped) { state.tutorial = 2; say('하얀 블록을 찾아서 주워보자! 블록 위로 걸어가면 돼.'); }
  else if (state.tutorial === 2 && state.blocks > 0) { state.tutorial = 3; say('블록이 네 뒤에 숫자블록으로 쌓였어! B(도감)를 열면 블록으로 포켓몬의 공격력이나 체력을 올릴 수 있어.', { sec: 7 }); }
  else if (state.tutorial === 3 && state.blocks >= 3 && !state.upgradeTold) { state.upgradeTold = true; say('몬스터와 만나면 내 포켓몬이 대신 싸워! 체력이 0이 되면 지니까 도감(B)에서 체력도 올려 두자.', { sec: 7 }); }
  else if (state.tutorial === 3 && state.caught > 0) { state.tutorial = 4; say('첫 친구다! 도감(B)에서 대표를 바꿀 수 있어. 숫자블록 친구가 도와달라고 나타나면 문제를 풀어 구출해 줘!', { sec: 7 }); }
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
      <div class="starter-stat">${sp.type} 속성 · ❤ 체력 ${sp.baseHp} · ⚔ 공격 ${sp.baseAtk}</div>
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
    party: party.members.map((m) => ({ speciesId: m.speciesId, atk: m.atk, maxHp: m.maxHp, hp: m.hp })),
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
function applySave(d) {
  state.name = d.name;
  Object.assign(state, { blocks: 0, glowBlocks: d.glowBlocks || 0, caught: d.caught || 0, rescued: d.rescued || 0, conquered: { ...(d.conquered || {}) }, caughtCreatures: d.caughtCreatures || {}, tutorial: d.tutorial ?? 5, upgradeTold: !!d.upgradeTold, mapTold: !!d.mapTold, glow: !!d.glow });
  for (const k of Object.keys(state.dex)) delete state.dex[k];
  Object.assign(state.dex, d.dex || {});
  pendingCaught = d.caughtCreatures || {};
  for (const z of Object.values(zones)) applyPendingCaught(z); // 타이틀 중에 미리 만든 푸른숲에도 적용
  if (state.conquered.forest) removeBoulder();
  startGame({ zoneName: BUILDERS[d.zone] ? d.zone : 'forest', pos: d.pos });
  for (const m of d.party || []) {
    const sp = speciesById[m.speciesId];
    if (!sp) continue;
    const member = party.add(m.speciesId, buildDraftMesh(sp));
    Object.assign(member, { atk: m.atk, maxHp: m.maxHp, hp: Math.min(m.hp, m.maxHp) });
  }
  const leader = party.members[d.leader] || party.members[0];
  if (leader) attachLeader(leader);
  setBlocks(d.blocks || 0);
  sound.fanfare();
  say(`다시 만나서 반가워, ${state.name}! ${leader ? party.name(leader) + '와 ' : ''}모험을 이어서 하자!`, { sec: 6 });
  refreshHud();
}

if (location.search.includes('debug')) {
  window.__game = { get player() { return player; }, state, zones, getZone, setBlocks, input, renderer, switchZone, startRide, vehiclesHere, spawnRescue, get zone() { return zone; }, get ride() { return ride; }, battle, cam, dex, party, quiz, addStarter, attachLeader, evolveMember, conquer, doSave, applySave, listSaves, buildSaveData };
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
      }
    } else if (zone.world.portal && near(zone.world.portal, 1.6)) {
      moved = true;
      const back = zones.forest.world.arrivals[zone.name] || zones.forest.world.spawn;
      switchZone('forest', back, { text: '푸른숲으로 돌아왔어!', sec: 4 });
    }
    if (!moved) for (const v of vehiclesHere()) {
      if (!near(v.boardPoint, 3.2)) continue;
      const dest = ZONE_INFO[v.to]?.name || v.to;
      if (input.wasPressed('action')) startRide(v);
      else if (state.prompt <= 0) { state.prompt = 8; say(v.kind === 'train' ? `기차역이야! E(액션)를 누르면 기차를 타고 ${dest}(으)로 가!` : `로켓이야! E(액션)를 누르면 로켓을 타고 ${dest}(으)로 가!`, { sec: 4 }); }
      break;
    }

    // ----- 블록 줍기 -----
    for (let i = zone.pickups.length - 1; i >= 0; i--) {
      const b = zone.pickups[i];
      b.rotation.y = t + b.userData.t;
      b.position.y = terrainHeight(b.position.x, b.position.z) + 0.6 + Math.sin(t * 2 + b.userData.t) * 0.1;
      if (b.position.distanceTo(pp) < 1.1) {
        if (state.blocks >= MAX_BLOCKS) { if (!state.fullTold) { state.fullTold = true; say(`블록이 ${MAX_BLOCKS}개! 더는 못 들어. 도감(B)에서 포켓몬을 키우는 데 쓰자!`); } continue; }
        zone.scene.remove(b);
        zone.pickups.splice(i, 1);
        setBlocks(state.blocks + 1, { glow: !!b.userData.glow });
        sound.pickup();
        if (b.userData.glow && state.glowBlocks === 1) say('형광 블록이야! 숫자블록이 반짝반짝 빛나!', { sec: 5 });
        if (state.blocks === 5) say('블록 5개! 뒤를 봐, 하늘색 다섯이 모양이 됐어!', { sec: 5 });
        if (state.blocks === 10) say('열 개! 빨강 하나에 하양 아홉, 열이 모양이야!', { sec: 5 });
        if (state.blocks === 11) say('열 개 넘으면 열이 옆에 새 블록이 붙어. 10과 1은 11!', { sec: 5 });
      }
    }
    zone.respawnTimer -= dt;
    if (zone.respawnTimer <= 0 && zone.pickups.length < 20) {
      zone.respawnTimer = 6;
      const half = zone.terrain.size / 2 - 4;
      for (let tries = 0; tries < 20; tries++) {
        const x = pp.x + rand(-36, 36), zz = pp.z + rand(-36, 36);
        if (Math.abs(x) > half || Math.abs(zz) > half || inHole(x, zz) || isBlocked(x, zz) || insideObstacle(x, zz, 0.8) || Math.hypot(x - pp.x, zz - pp.z) < 6) continue;
        spawnPickup(zone, x, zz);
        break;
      }
    }

    // ----- 탐험 중엔 포켓몬 체력이 3초에 1씩 천천히 회복된다 -----
    state.regenTimer -= dt;
    if (state.regenTimer <= 0) {
      state.regenTimer = 3;
      let healed = false;
      for (const m of party.members) healed = party.regen(m) || healed;
      if (healed) refreshHud();
    }

    // ----- 몬스터: 닿으면 내 대표 포켓몬과 대결 -----
    for (const c of zone.creatures) {
      if (c.state === 'caught') continue;
      const ev = c.update(dt, pp);
      if (ev === 'meet') {
        const L = party.leader;
        if (!L) { c.becomeShy(); say('대표 포켓몬이 없어!'); break; }
        const hp = c.hp ?? c.data.baseHp;
        say(c.isBoss ? `${zone.label}의 보스 ${c.data.name}이다! 체력이 ${hp}이나 돼! 공격력은 ${c.data.baseAtk}!` : `${c.data.name}이(가) 나타났다! 체력 ${hp}, 공격력 ${c.data.baseAtk}!`, { sec: 3 });
        battle.start({
          creature: c, player, scene: zone.scene, member: L,
          hideMeshes: chain.followers.filter((f) => !f.isLeader).map((f) => f.mesh), decor: zone.world.decor,
          onCaught: () => {
            c.becomeFriend();
            const already = party.members.find((m) => m.speciesId === c.data.id); // 같은 종은 파티에 한 마리만. 또 잡으면 누적 수만 오른다 (진화 조건)
            const member = already || party.add(c.data.id, c.mesh);
            zone.scene.remove(c.mesh); // 볼 안으로. 도감에서 대표로 고르면 다시 나온다
            (state.caughtCreatures[zone.name] ||= []).push(zone.creatures.indexOf(c)); // 저장용: 어느 몬스터를 잡았는지
            party.heal(L);              // 이긴 기쁨으로 대표 체력 회복
            state.dex[c.data.id] = (state.dex[c.data.id] || 0) + 1;
            const cnt = state.dex[c.data.id];
            if (c.isBoss) {
              conquer(zone.name);
              if (zone.name === 'forest') {
                removeBoulder();
                say(`${c.data.name}이(가) 친구가 됐어! 푸른숲 정복! 북쪽 산의 지하동굴 입구 바위도 치워졌어!`, { sec: 7 });
              } else say(`${c.data.name}이(가) 친구가 됐어! ${zone.label} 정복!`, { sec: 6 });
            } else {
              state.caught++;
              const sp = speciesById[c.data.id];
              const evo = sp.evolution;
              if (already) {
                const need = evo ? (evo.count || 1) : 0;
                say(evo && cnt < need ? `${sp.name}을(를) 또 잡았어! 누적 ${cnt}마리. ${need}마리를 잡으면 진화할 수 있어.` : evo ? `${sp.name} 누적 ${cnt}마리! 도감(B)에서 진화 조건을 확인해 봐.` : `${sp.name}을(를) 또 잡았어! 누적 ${cnt}마리.`, { sec: 6 });
              } else {
                const more = evo && cnt < (evo.count || 1) ? ` ${evo.count}마리를 잡으면 진화할 수 있어.` : '';
                say(`${c.data.name}이(가) 친구가 됐어!${more} 도감(B)에서 대표로 고르거나 블록으로 키울 수 있어.`, { sec: 6 });
              }
            }
            if (c.data.id === 'm07' && !state.glow) { state.glow = true; player.lamp.intensity = 13; player.lamp.distance = 30; if (zones.cave) zones.cave.scene.fog.far = 110; say(`${c.data.name}가 동굴을 환하게 밝혀줘!`, { sec: 5 }); }
            if (!already && party.members.length === 2) say(`${party.name(member)}은(는) 볼 안에서 쉬고 있어. 도감(B)에서 "대표로 하기"를 누르면 따라와!`, { sec: 6 });
            refreshHud();
            autosave();
          },
          onLost: () => {
            c.becomeShy();
            c.hp = c.data.baseHp; // 이긴 몬스터는 기운을 되찾는다
            party.loseReset(L);
            say(`${party.name(L)}의 체력이 기본(${L.maxHp})으로 돌아갔어. 블록을 모아서 체력을 올리고 다시 도전하자!`, { sec: 7 });
            refreshHud();
          },
          onLeave: () => { c.becomeShy(); say('괜찮아, 블록을 모아서 더 강해진 다음 다시 오자!'); refreshHud(); },
        });
        break;
      }
    }

    // ----- 숫자블록 구출: 랜덤 출몰, 가까이 가서 액션 → 문제 -----
    zone.nbTimer -= dt;
    if (!zone.rescue && zone.nbTimer <= 0) spawnRescue(zone);
    const nb = zone.rescue;
    if (nb) {
      nb.t += dt;
      nb.life -= dt;
      nb.mesh.position.y = terrainHeight(nb.position.x, nb.position.z) + Math.abs(Math.sin(nb.t * 3)) * 0.12;
      nb.mesh.rotation.y = Math.atan2(pp.x - nb.position.x, pp.z - nb.position.z); // 주인공을 본다
      animateNumberblock(nb.mesh, dt, true);
      if (nb.life <= 0) removeRescue(zone, true);
      else if (nb.position.distanceTo(pp) < 2.4 && input.wasPressed('action')) {
        input.endFrame();
        quiz.ask(nb.data.number, nb.data.name).then((ok) => {
          if (zone.rescue !== nb) return;
          if (ok) rescueSolved(zone, nb);
          else say('괜찮아, 다시 와서 도전하자!', { face: String(nb.data.number) });
        });
      }
    }

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
      myStack.mesh.scale.setScalar(1 + Math.sin(myStack.pop * Math.PI) * 0.25);
    }
    const glow = myStack.mesh?.userData.glow;
    if (glow) {
      const pulse = 0.45 + Math.sin(t * 5) * 0.3;
      for (const m of glow.mats) m.emissiveIntensity = pulse;
      glow.light.intensity = 2.5 + Math.sin(t * 5) * 1.5;
      state.sparkleTimer = (state.sparkleTimer || 0) - dt;
      if (state.sparkleTimer <= 0) {
        state.sparkleTimer = 0.9;
        particles.stars(zone.scene, myStack.mesh.position.clone().add(new THREE.Vector3(rand(-0.5, 0.5), 0.6 + Math.random() * state.blocks * 0.3, rand(-0.5, 0.5))), 3, 0xfff6a0, 0.22);
      }
    }
    tutorial();
    state.autosave -= dt;
    if (state.autosave <= 0) autosave();

    // 카메라 따라가기 (대결이 막 끝났으면 눈높이에서 바로 원래 자리로 복귀)
    const camTarget = pp.clone().add(camOffset());
    if (prevBattle || snapCam) { camera.position.copy(camTarget); snapCam = false; }
    else camera.position.lerp(camTarget, look.dx || look.dy || input.isHeld('camLeft') || input.isHeld('camRight') ? 0.35 : 0.08);
    camera.lookAt(pp.x, pp.y + camLookY(), pp.z);
  }
  prevBattle = battle.active;
  document.body.classList.toggle('battle', battle.active); // 대결 중엔 말풍선을 위로 올린다 (패널과 안 겹치게)

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
