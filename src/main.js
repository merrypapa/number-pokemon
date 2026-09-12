import * as THREE from 'three';
import { Input } from './input.js';
import { buildWorld, terrainHeight, inHole, isBlocked, insideObstacle, setActiveTerrain, WORLD } from './world.js';
import { buildCave } from './cave.js';
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
import { makeBlockMesh, rand } from './util.js';

// ---------- 기본 세팅 ----------
const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 220);
// 카메라: 주인공을 중심으로 회전(camYaw)/기울기(camPitch). 화면 드래그나 Q/R 로 돌린다.
const cam = { yaw: 0, pitch: 0 };
function camOffset() {
  const h = 9 + cam.pitch * 6, d = 11 - cam.pitch * 3;
  return new THREE.Vector3(Math.sin(cam.yaw) * d, h, Math.cos(cam.yaw) * d);
}
function camForward() { return new THREE.Vector3(-Math.sin(cam.yaw), 0, -Math.cos(cam.yaw)); } // 카메라가 보는 지면 방향
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

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

// ---------- 데이터 ----------
const [creatureData, nbData] = await Promise.all([
  fetch('data/creatures.json').then((r) => r.json()),
  fetch('data/numberblocks.json').then((r) => r.json()),
]);
const speciesById = Object.fromEntries(creatureData.creatures.map((c) => [c.id, c]));
const starters = creatureData.creatures.filter((c) => c.starter);
// assets/models/ 의 .glb 는 기다리지 않고 뒤에서 받는다. 도착하면 시작 화면과 게임 안의 드래프트 도형이 그 자리에서 모델로 바뀐다.
const modelFiles = [PLAYER_MODEL, ...creatureData.creatures.map((c) => c.model)];
const loadingEl = document.getElementById('title-loading');
preloadModels(modelFiles, (done, total) => {
  loadingEl.textContent = `친구들 불러오는 중 ${done}/${total}`;
  loadingEl.classList.toggle('hidden', done >= total);
});
document.getElementById('title-sub').textContent = `${PLAYER_NAME}와 ${starters.map((c) => c.name).join('·')}의 신나는 숫자 모험!`;
const nbById = Object.fromEntries(nbData.numberblocks.map((n) => [n.id, n]));

// ---------- 지역(zone) ----------
// 각 지역은 자기 scene, 지형, 몬스터, 블록을 가진다. 주인공과 파트너들은 지역을 옮겨 다닌다.
function makeZone(name, builder) {
  const scene = new THREE.Scene();
  const world = builder(scene);
  return { name, scene, world, terrain: world.terrain, creatures: [], pickups: [], numberblocks: [], respawnTimer: 6 };
}
const zones = {
  meadow: makeZone('meadow', buildWorld),
  cave: makeZone('cave', buildCave),
};
let zone = zones.meadow;
setActiveTerrain(zone.terrain);

const player = new Player(zone.scene);
const chain = new FollowChain(player);
const party = new Party(speciesById);

function spawnCreature(z, speciesId, x, zz, extra = {}) {
  const data = { ...speciesById[speciesId], ...extra };
  const c = new Creature(z.scene, data, new THREE.Vector3(x, 0, zz));
  z.creatures.push(c);
  return c;
}
function spawnPickup(z, x, zz) {
  const m = makeBlockMesh(0xffffff);
  if (z.name === 'cave') { m.material.emissive = new THREE.Color(0x9fe8ff); m.material.emissiveIntensity = 0.7; m.userData.glow = true; } // 형광 블록
  m.position.set(x, z.terrain.height(x, zz) + 0.6, zz);
  m.userData.t = rand(0, 10);
  z.scene.add(m);
  z.pickups.push(m);
}

// 초원: 6종 15마리 + 보스 쿵쿵이
{
  const z = zones.meadow;
  const spots = {
    m01: [[-20, 4], [10, 30], [-38, 14]],
    m02: [[24, -14], [-14, 24], [40, 12]],
    m03: [[14, -4], [-26, 0], [30, 44]],
    m04: [[-12, -26], [34, -26]],
    m05: [[20, 36], [-44, 32]],
    m06: [[6, -22], [46, -44]],
  };
  for (const [id, list] of Object.entries(spots)) for (const [x, zz] of list) spawnCreature(z, id, x, zz);
  spawnCreature(z, 'm13', WORLD.arena.x, WORLD.arena.z, { scale: 2.6 });
  for (const [x, zz] of [[0, 3], [-4, 6], [6, -6], [-9, -2], [10, 8], [-2, -12], [14, -14], [-16, 4], [2, 16], [-12, 14], [22, 4], [-24, -8], [8, -24], [-8, 30], [20, 18], [-36, 10], [36, -6], [-20, -30], [-34, -28], [-12, -40], [30, -30], [-42, 4], [12, 40]]) spawnPickup(z, x, zz);
  for (const [id, [x, zz]] of Object.entries({ nb02: [-30, -18], nb03: [22, 34] })) z.numberblocks.push(new Numberblock(z.scene, nbById[id], { x, z: zz }));
}
// 동굴: 3종 6마리
{
  const z = zones.cave;
  setActiveTerrain(z.terrain); // Numberblock/Creature 생성 시 지형 높이를 쓰므로 잠시 전환
  for (const [id, list] of Object.entries(z.world.creatureSpawns)) for (const [x, zz] of list) spawnCreature(z, id, x, zz);
  for (const [x, zz] of z.world.pickupSpots) spawnPickup(z, x, zz);
  setActiveTerrain(zone.terrain);
}
const totalCreatures = zones.meadow.creatures.filter((c) => !c.isBoss).length + zones.cave.creatures.length;
const boulder = zones.meadow.world.boulder;

// ?showcase : 숫자블록 친구 1~10을 시작 지점 앞에 한 줄로
if (location.search.includes('showcase')) {
  nbData.numberblocks.forEach((nb, i) => {
    const m = buildNumberblockMesh(nb);
    const x = -9 + i * 2, zz = 3;
    m.position.set(x, terrainHeight(x, zz), zz);
    zones.meadow.scene.add(m);
  });
}

// ---------- 게임 상태 ----------
const MAX_BLOCKS = 20;
const state = { blocks: 0, caught: 0, rescued: 0, tutorial: 0, done: false, frames: 0, bossDone: false, caveVisited: false, glow: false, dex: {}, glowBlocks: 0, regenTimer: 0 }; // glowBlocks: 동굴에서 주운 형광 블록 수
const dex = new Dex(creatureData.creatures);
dex.lastCaught = state.dex;
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
  getProgress: () => ({ caught: state.caught, total: totalCreatures, rescued: state.rescued, boss: state.bossDone }), // 친구·구출·보스 진행은 도감에서 본다
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

if (location.search.includes('debug')) {
  setBlocks(10);
  window.__game = { player, state, zones, setBlocks, input, renderer, switchZone, get zone() { return zone; }, battle, cam, dex, party, addStarter, attachLeader, evolveMember };
}

// ---------- 지역 이동 ----------
const fadeEl = document.getElementById('fade');
let switching = false;
function partyMeshes() { return [player.group, ...chain.followers.map((f) => f.mesh)]; }
function switchZone(name, spawn, message) {
  if (switching || !zones[name]) return;
  switching = true;
  fadeEl.classList.add('on');
  sound.portal();
  setTimeout(() => {
    const from = zone;
    zone = zones[name];
    setActiveTerrain(zone.terrain);
    for (const m of partyMeshes()) { from.scene.remove(m); zone.scene.add(m); }
    player.teleport(spawn.x, spawn.z);
    for (const f of chain.followers) { f.mesh.position.set(spawn.x + rand(-1, 1), terrainHeight(spawn.x, spawn.z), spawn.z + 1.5 + rand(0, 1)); }
    player.lamp.intensity = zone.name === 'cave' ? (state.glow ? 9 : 4.5) : 0;
    camera.position.copy(player.position).add(camOffset());
    if (message) say(message.text, message);
    setTimeout(() => { fadeEl.classList.remove('on'); switching = false; }, 150);
  }, 480);
}

// ---------- 튜토리얼/진행 ----------
function tutorial() {
  if (state.tutorial === 0 && player.moved) { state.tutorial = 1; say('잘했어! 이번엔 스페이스(점프 버튼)로 점프해 봐!'); }
  else if (state.tutorial === 1 && player.jumped) { state.tutorial = 2; say('하얀 블록을 찾아서 주워보자! 블록 위로 걸어가면 돼.'); }
  else if (state.tutorial === 2 && state.blocks > 0) { state.tutorial = 3; say('블록이 네 뒤에 숫자블록으로 쌓였어! B(도감)를 열면 블록으로 포켓몬의 공격력이나 체력을 올릴 수 있어.', { sec: 7 }); }
  else if (state.tutorial === 3 && state.blocks >= 3 && !state.upgradeTold) { state.upgradeTold = true; say('몬스터와 만나면 내 포켓몬이 대신 싸워! 체력이 0이 되면 지니까 도감(B)에서 체력도 올려 두자.', { sec: 7 }); }
  else if (state.tutorial === 3 && state.caught > 0) { state.tutorial = 4; say('첫 친구다! 도감(B)에서 대표를 바꿀 수 있어. 서쪽 언덕 위 둘이와 동쪽 연못가의 셋이도 찾아줘. 가까이 가서 E(액션)!', { sec: 7 }); }
}
function checkProgress() {
  if (state.rescued >= 2 && state.bossDone && !state.done) {
    state.done = true;
    say('챕터 1 완료! 동굴 입구가 열렸어. 큰 구멍이나 동굴 입구로 들어가면 어두운 동굴이야!', { sec: 10 });
  } else if (state.rescued >= 2 && !state.bossDone && !state.bossHintTold) {
    state.bossHintTold = true;
    say(`둘이 셋이를 다 구했어! 서북쪽 돌기둥 아레나의 커다란 쿵쿵이를 만나러 가자. 체력 ${speciesById.m13.baseHp}, 공격 ${speciesById.m13.baseAtk}이니까 포켓몬을 튼튼하게 키워서 가!`, { sec: 8 });
  }
}

// ---------- 시작: 타이틀 → 포켓몬 고르기 → 모험 ----------
// 타이틀이 떠 있는 동안은 인트로 무대(주인공·몬스터 친구들)를 그린다
let intro = buildIntro(creatureData.creatures);
let snapCam = true; // 다음 프레임에 카메라를 주인공 뒤 제자리로 바로 옮긴다 (시작 직후, 대결 직후)
document.body.classList.add('intro');
window.addEventListener('resize', () => intro?.resize());
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
      <div class="starter-stat">❤ 체력 ${sp.baseHp} · ⚔ 공격 ${sp.baseAtk}</div>
      <div class="starter-skill">기술: ${first ? first.name : '-'}${sp.skills?.[1] ? ` → ${sp.skills[1].name}` : ''}</div>`;
    item.onclick = () => chooseStarter(sp.id);
    starterGrid.appendChild(item);
  }
}
function chooseStarter(id) {
  starterEl.classList.add('hidden');
  document.body.classList.remove('intro');
  intro?.dispose();
  intro = null;
  snapCam = true;
  const member = addStarter(id);
  confetti.burst(120);
  sound.fanfare();
  say(`안녕, ${PLAYER_NAME}! 난 원이야. ${party.name(member)}와 함께 가자! 방향키(또는 왼쪽 화면을 눌러 조이스틱)로 움직여 봐!`, { sec: 6 });
}
document.getElementById('btn-start').onclick = () => {
  document.getElementById('title').classList.add('hidden');
  sound.ensure();
  starterEl.classList.remove('hidden');
  renderStarter();
};

// ---------- 루프 ----------
const clock = new THREE.Clock();
let prevBattle = false;
function frame() {
  state.frames++;
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;

  if (intro) {
    intro.update(dt);
    renderer.render(intro.scene, intro.camera);
    input.endFrame();
    requestAnimationFrame(frame);
    return;
  }

  if (input.wasPressed('dex') && !battle.active) dex.toggle(state.dex);
  if (dex.open) {
    if (input.wasPressed('cancel')) dex.hide();
  } else if (battle.active) {
    battle.update(dt);
  } else if (!switching) {
    // 카메라 회전: 화면 드래그 또는 Q/R
    const look = input.takeLook();
    cam.yaw -= look.dx * 0.006;
    cam.pitch = Math.max(-0.35, Math.min(0.6, cam.pitch + look.dy * 0.004));
    if (input.isHeld('camLeft')) cam.yaw += dt * 1.8;
    if (input.isHeld('camRight')) cam.yaw -= dt * 1.8;

    player.update(dt, input, cam.yaw);

    // 구멍/동굴 입구 → 동굴, 포탈 → 초원
    if (zone.name === 'meadow') {
      if (player.fellInHole) {
        player.fellInHole = false;
        switchZone('cave', zones.cave.world.spawn, { text: '뿅! 어두운 동굴로 떨어졌어. 반디를 찾으면 밝아질 거야. 빛나는 포탈로 숲마을에 돌아갈 수 있어!', sec: 8 });
      } else if (state.bossDone && Math.hypot(player.position.x - WORLD.cave.x, player.position.z - (WORLD.cave.z + 6.5)) < 2.2) {
        switchZone('cave', zones.cave.world.spawn, { text: '괴물 동굴에 들어왔어! 포탈로 돌아갈 수 있어.', sec: 6 });
      }
    } else if (zone.name === 'cave') {
      const P = zones.cave.world.portal;
      if (Math.hypot(player.position.x - P.x, player.position.z - P.z) < 1.6) {
        switchZone('meadow', { x: WORLD.village.x, z: WORLD.village.z - 14 }, { text: '숲마을로 돌아왔어!', sec: 4 });
      }
    }

    // 블록 줍기
    for (let i = zone.pickups.length - 1; i >= 0; i--) {
      const b = zone.pickups[i];
      b.rotation.y = t + b.userData.t;
      b.position.y = terrainHeight(b.position.x, b.position.z) + 0.6 + Math.sin(t * 2 + b.userData.t) * 0.1;
      if (b.position.distanceTo(player.position) < 1.1) {
        if (state.blocks >= MAX_BLOCKS) { if (!state.fullTold) { state.fullTold = true; say('블록이 스무 개! 더는 못 들어. 도감(B)에서 포켓몬을 키우는 데 쓰자!'); } continue; }
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
    if (zone.respawnTimer <= 0 && zone.pickups.length < 14) {
      zone.respawnTimer = 6;
      const half = zone.terrain.size / 2 - 4;
      for (let tries = 0; tries < 20; tries++) {
        const x = player.position.x + rand(-30, 30), zz = player.position.z + rand(-30, 30);
        if (Math.abs(x) > half || Math.abs(zz) > half || inHole(x, zz) || isBlocked(x, zz) || insideObstacle(x, zz, 0.8) || Math.hypot(x - player.position.x, zz - player.position.z) < 6) continue;
        spawnPickup(zone, x, zz);
        break;
      }
    }

    // 탐험 중엔 포켓몬 체력이 3초에 1씩 천천히 회복된다
    state.regenTimer -= dt;
    if (state.regenTimer <= 0) {
      state.regenTimer = 3;
      let healed = false;
      for (const m of party.members) healed = party.regen(m) || healed;
      if (healed) refreshHud();
    }

    // 몬스터: 닿으면 내 대표 포켓몬과 대결
    for (const c of zone.creatures) {
      if (c.state === 'caught') continue;
      const ev = c.update(dt, player.position);
      if (ev === 'meet') {
        const L = party.leader;
        if (!L) { c.becomeShy(); say('대표 포켓몬이 없어!'); break; }
        const hp = c.hp ?? c.data.baseHp;
        say(c.isBoss ? `쿵쿵이다! 체력이 ${hp}이나 돼! 공격력은 ${c.data.baseAtk}!` : `${c.data.name}이(가) 나타났다! 체력 ${hp}, 공격력 ${c.data.baseAtk}!`, { sec: 3 });
        battle.start({
          creature: c, player, scene: zone.scene, member: L,
          hideMeshes: chain.followers.filter((f) => !f.isLeader).map((f) => f.mesh), decor: zone.world.decor,
          onCaught: () => {
            c.becomeFriend();
            const member = party.add(c.data.id, c.mesh);
            zone.scene.remove(c.mesh); // 볼 안으로. 도감에서 대표로 고르면 다시 나온다
            party.heal(L);              // 이긴 기쁨으로 대표 체력 회복
            if (c.isBoss) {
              state.bossDone = true;
              zones.meadow.scene.remove(boulder);
              const obs = zones.meadow.terrain.obstacles, bi = obs.indexOf(zones.meadow.world.boulderObstacle);
              if (bi >= 0) obs.splice(bi, 1); // 바위가 치워지면 지나갈 수 있다
              say('쿵쿵이가 친구가 됐어! 쿵! 하고 동굴 입구 바위를 치워줬어!', { sec: 7 });
            } else {
              state.caught++;
              say(`${c.data.name}이(가) 친구가 됐어! 도감(B)에서 대표로 고르거나 블록으로 키울 수 있어.`, { sec: 5 });
            }
            state.dex[c.data.id] = (state.dex[c.data.id] || 0) + 1;
            if (c.data.id === 'm07' && !state.glow) { state.glow = true; player.lamp.intensity = 9; player.lamp.distance = 22; zones.cave.scene.fog.far = 75; say('반디가 동굴을 환하게 밝혀줘!', { sec: 5 }); }
            if (party.members.length === 2) say(`${party.name(member)}은(는) 볼 안에서 쉬고 있어. 도감(B)에서 "대표로 하기"를 누르면 따라와!`, { sec: 6 });
            refreshHud();
            checkProgress();
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

    // 숫자블록 구출 (가까이 가서 액션)
    for (const nb of zone.numberblocks) {
      if (nb.rescued) continue;
      nb.t += dt;
      nb.mesh.position.y = terrainHeight(nb.position.x, nb.position.z) + Math.abs(Math.sin(nb.t * 2)) * 0.05;
      animateNumberblock(nb.mesh, dt, false);
      if (nb.position.distanceTo(player.position) < 2.2 && input.wasPressed('action')) {
        nb.rescued = true;
        chain.add(nb.mesh);
        state.rescued++;
        setBlocks(state.blocks + nb.data.number);
        sound.fanfare();
        say(`${nb.data.name}: 고마워! 블록 ${nb.data.number}개 나눠줄게. 같이 갈래!`, { face: String(nb.data.number), sec: 5 });
        checkProgress();
      }
    }

    chain.update(dt);
    // 따라오는 친구가 카메라와 주인공 사이에 끼면 반투명하게
    for (const f of chain.followers) {
      const occluding = f.mesh.position.distanceTo(camera.position) < player.position.distanceTo(camera.position) - 0.3 && f.mesh.position.distanceTo(player.position) < 3.5;
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

    // 카메라 따라가기 (대결이 막 끝났으면 눈높이에서 바로 원래 자리로 복귀)
    const camTarget = player.position.clone().add(camOffset());
    if (prevBattle || snapCam) { camera.position.copy(camTarget); snapCam = false; }
    else camera.position.lerp(camTarget, look.dx || look.dy || input.isHeld('camLeft') || input.isHeld('camRight') ? 0.35 : 0.08);
    camera.lookAt(player.position.x, player.position.y + 1, player.position.z);
  }
  prevBattle = battle.active;

  zone.world.animate?.(t);
  const sun = zone.world.sun;
  if (sun) { sun.position.set(player.position.x + 20, 30, player.position.z + 10); sun.target.position.copy(player.position); }
  particles.update(dt);
  confetti.update(dt);
  if (msgTimer > 0) { msgTimer -= dt; if (msgTimer <= 0) msgEl.classList.add('hidden'); }

  renderer.render(zone.scene, camera);
  input.endFrame();
  requestAnimationFrame(frame);
}
frame();
