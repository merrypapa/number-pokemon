import * as THREE from 'three';
import { Input } from './input.js';
import { buildWorld, terrainHeight, inHole, setActiveTerrain, WORLD } from './world.js';
import { buildCave } from './cave.js';
import { Player, PLAYER_MODEL, PLAYER_NAME } from './player.js';
import { Creature } from './creatures.js';
import { preloadModels } from './models.js';
import { Numberblock, FollowChain, buildNumberblockMesh, animateNumberblock } from './numberblocks.js';
import { NUMBER_COLORS, colorForCount } from './palette.js';
import { Battle } from './battle.js';
import { Confetti, Particles, Sound } from './effects.js';
import { Dex } from './dex.js';
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
const startBtn = document.getElementById('btn-start');
startBtn.disabled = true;
startBtn.textContent = '불러오는 중…';
document.getElementById('title-sub').textContent = `챕터 1 · 숫자 초원 · 주인공 ${PLAYER_NAME}`;
const [creatureData, nbData] = await Promise.all([
  fetch('data/creatures.json').then((r) => r.json()),
  fetch('data/numberblocks.json').then((r) => r.json()),
]);
const speciesById = Object.fromEntries(creatureData.creatures.map((c) => [c.id, c]));
// assets/models/ 의 .glb 를 미리 받아 둔다 (없는 파일은 드래프트 도형으로 대체)
await preloadModels([PLAYER_MODEL, ...creatureData.creatures.map((c) => c.model)]);
startBtn.disabled = false;
startBtn.textContent = '시작하기';
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
const state = { blocks: 0, caught: 0, rescued: 0, tutorial: 0, done: false, frames: 0, bossDone: false, caveVisited: false, glow: false, dex: {}, glowBlocks: 0 }; // glowBlocks: 동굴에서 주운 형광 블록 수
const dex = new Dex(creatureData.creatures);
dex.lastCaught = state.dex;

// 주운 블록은 주인공 바로 뒤에 숫자블록 캐릭터로 쌓인다.
const myStack = { mesh: null, pop: 0 };
function setBlocks(n, { glow = false } = {}) {
  n = Math.max(0, Math.min(MAX_BLOCKS, n));
  if (n > state.blocks && glow) state.glowBlocks += n - state.blocks; // 형광 블록 획득
  state.blocks = n;
  state.glowBlocks = Math.min(state.glowBlocks, n);                 // 던져서 줄면 형광 블록도 줄어든다
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
  if (battle.active) battle.setBlocks(n);
}

const hudBlocks = document.getElementById('hud-blocks');
const hudCaught = document.getElementById('hud-caught');
const hudRescued = document.getElementById('hud-rescued');
const hudBoss = document.getElementById('hud-boss');
const hudBlockIcon = document.querySelector('.hud-icon.block');
function refreshHud() {
  hudBlocks.textContent = `블록 ${state.blocks}개`;
  hudBlockIcon.style.background = state.blocks > 0 ? colorForCount(state.blocks) : '#fff';
  hudCaught.textContent = `친구 ${state.caught}/${totalCreatures}`;
  hudRescued.textContent = `구출 ${state.rescued}/2`;
  hudBoss.textContent = `보스 ${state.bossDone ? 1 : 0}/1`;
}
refreshHud();

const battle = new Battle({ input, camera, say, sound, particles, confetti });

if (location.search.includes('debug')) {
  setBlocks(10);
  window.__game = { player, state, zones, setBlocks, input, renderer, switchZone, get zone() { return zone; }, battle, cam, dex };
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
  else if (state.tutorial === 2 && state.blocks > 0) { state.tutorial = 3; say('블록이 네 뒤에 숫자블록으로 쌓였어! 몬스터와 만나면 블록을 던져서 체력을 딱 0으로 만들자!', { sec: 7 }); }
  else if (state.tutorial === 3 && state.caught > 0) { state.tutorial = 4; say('첫 친구다! 서쪽 언덕 위 둘이와 동쪽 연못가의 셋이도 찾아줘. 가까이 가서 E(액션)!', { sec: 6 }); }
}
function checkProgress() {
  if (state.rescued >= 2 && state.bossDone && !state.done) {
    state.done = true;
    say('챕터 1 완료! 동굴 입구가 열렸어. 큰 구멍이나 동굴 입구로 들어가면 어두운 동굴이야!', { sec: 10 });
  } else if (state.rescued >= 2 && !state.bossDone && !state.bossHintTold) {
    state.bossHintTold = true;
    say('둘이 셋이를 다 구했어! 서북쪽 돌기둥 아레나의 커다란 쿵쿵이를 만나러 가자. 블록 10개가 필요해!', { sec: 8 });
  }
}

// ---------- 시작 ----------
document.getElementById('btn-start').onclick = () => {
  document.getElementById('title').classList.add('hidden');
  sound.ensure();
  say(`안녕, ${PLAYER_NAME}! 난 원이야. 방향키(또는 왼쪽 화면을 눌러 조이스틱)로 움직여 봐!`, { sec: 6 });
};

// ---------- 루프 ----------
const clock = new THREE.Clock();
function frame() {
  state.frames++;
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;

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
        if (state.blocks >= MAX_BLOCKS) { if (!state.fullTold) { state.fullTold = true; say('블록이 스무 개! 더는 못 들어. 몬스터에게 던지자!'); } continue; }
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
        if (Math.abs(x) > half || Math.abs(zz) > half || inHole(x, zz) || Math.hypot(x - player.position.x, zz - player.position.z) < 6) continue;
        spawnPickup(zone, x, zz);
        break;
      }
    }

    // 몬스터: 닿으면 전투
    for (const c of zone.creatures) {
      if (c.state === 'caught') continue;
      const ev = c.update(dt, player.position);
      if (ev === 'meet') {
        const need = c.data.favoriteNumber;
        say(c.isBoss ? `쿵쿵이다! 체력이 ${need}이나 돼!` : `${c.data.name}이(가) 나타났다! 체력은 ${c.hp ?? need}!`, { sec: 3 });
        battle.start({
          creature: c, player, scene: zone.scene, blocksOwned: state.blocks,
          party: chain.followers.map((f) => f.mesh), decor: zone.world.decor,
          onThrow: (n) => setBlocks(state.blocks - n),
          onCaught: () => {
            c.becomeFriend();
            chain.add(c.mesh);
            if (c.isBoss) {
              state.bossDone = true;
              zones.meadow.scene.remove(boulder);
              say('쿵쿵이가 친구가 됐어! 쿵! 하고 동굴 입구 바위를 치워줬어!', { sec: 7 });
            } else {
              state.caught++;
              say(`${c.data.name}이(가) 친구가 됐어! 남은 블록은 ${state.blocks}개!`, { sec: 5 });
            }
            state.dex[c.data.id] = (state.dex[c.data.id] || 0) + 1;
            if (c.data.id === 'm07' && !state.glow) { state.glow = true; player.lamp.intensity = 9; player.lamp.distance = 22; zones.cave.scene.fog.far = 75; say('반디가 동굴을 환하게 밝혀줘!', { sec: 5 }); }
            refreshHud();
            checkProgress();
          },
          onLeave: () => { c.becomeShy(); say('괜찮아, 블록을 더 모아서 다시 오자!'); },
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

    // 카메라 따라가기
    const camTarget = player.position.clone().add(camOffset());
    camera.position.lerp(camTarget, look.dx || look.dy || input.isHeld('camLeft') || input.isHeld('camRight') ? 0.35 : 0.08);
    camera.lookAt(player.position.x, player.position.y + 1, player.position.z);
  }

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
