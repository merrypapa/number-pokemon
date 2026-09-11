import * as THREE from 'three';
import { Input } from './input.js';
import { buildWorld, terrainHeight, inHole, WORLD } from './world.js';
import { Player } from './player.js';
import { Creature } from './creatures.js';
import { Numberblock, FollowChain, buildNumberblockMesh } from './numberblocks.js';
import { CatchMode } from './catch.js';
import { makeBlockMesh, rand } from './util.js';

// ---------- 기본 세팅 ----------
const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 200);
const CAM_OFFSET = new THREE.Vector3(0, 9, 11);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

const input = new Input();
buildWorld(scene);
const player = new Player(scene);
const chain = new FollowChain(player);

// ---------- 메시지 (원이 말풍선) ----------
const msgEl = document.getElementById('msg');
const msgText = document.getElementById('msg-text');
const msgFace = document.getElementById('msg-face');
let msgTimer = 0;
function say(text, { face = '1', sec = 4 } = {}) {
  msgText.textContent = text;
  msgFace.textContent = face;
  msgEl.classList.remove('hidden');
  msgTimer = sec;
}

// ---------- 데이터 로드 ----------
const [creatureData, nbData] = await Promise.all([
  fetch('data/creatures.json').then((r) => r.json()),
  fetch('data/numberblocks.json').then((r) => r.json()),
]);
const nbById = Object.fromEntries(nbData.numberblocks.map((n) => [n.id, n]));

// 원이(1)는 처음부터 같이 다닌다.
const wonie = buildNumberblockMesh(nbById.nb01);
wonie.position.set(1.5, 0, 9.5);
scene.add(wonie);
chain.add(wonie);

// 초원 몬스터 3마리
const spawn = { m01: [-13, 3], m02: [14, -8], m03: [11, -3] };
const creatures = creatureData.creatures
  .filter((c) => c.zone === 'meadow')
  .map((c) => new Creature(scene, c, new THREE.Vector3(spawn[c.id][0], 0, spawn[c.id][1])));

// 구출할 숫자블록: 둘이(언덕 위), 셋이(꽃밭)
const rescueSpots = { nb02: [-14, -8], nb03: [16, 12] };
const numberblocks = ['nb02', 'nb03'].map((id) => new Numberblock(scene, nbById[id], { x: rescueSpots[id][0], z: rescueSpots[id][1] }));

// 주울 수 있는 블록 10개
const pickups = [];
const pickupSpots = [[0, 3], [-4, 6], [6, -6], [-9, -2], [10, 8], [-2, -12], [14, -14], [-16, 4], [2, 16], [-12, 14]];
for (const [x, z] of pickupSpots) {
  const m = makeBlockMesh(0xffffff);
  m.position.set(x, terrainHeight(x, z) + 0.6, z);
  m.userData.t = rand(0, 10);
  scene.add(m);
  pickups.push(m);
}

// ---------- 게임 상태 ----------
const state = { blocks: 0, caught: 0, rescued: 0, tutorial: 0, done: false };
if (location.search.includes('debug')) { state.blocks = 10; window.__game = { player, state, creatures }; } // 테스트용: ?debug 로 열면 블록 10개로 시작
const hudBlocks = document.getElementById('hud-blocks');
const hudCaught = document.getElementById('hud-caught');
const hudRescued = document.getElementById('hud-rescued');
function refreshHud() {
  hudBlocks.textContent = `블록 ${state.blocks}개`;
  hudCaught.textContent = `친구 ${state.caught}/${creatures.length}`;
  hudRescued.textContent = `구출 ${state.rescued}/${numberblocks.length}`;
}
refreshHud();

const catchMode = new CatchMode(input, say);

// 튜토리얼: 조작을 한 번씩 해볼 때마다 다음 안내
function tutorial() {
  if (state.tutorial === 0 && player.moved) { state.tutorial = 1; say('잘했어! 이번엔 스페이스(점프 버튼)로 점프해 봐!'); }
  else if (state.tutorial === 1 && player.jumped) { state.tutorial = 2; say('하얀 블록을 찾아서 주워보자! 블록 위로 걸어가면 돼.'); }
  else if (state.tutorial === 2 && state.blocks > 0) { state.tutorial = 3; say('몬스터가 다가오면 블록을 좋아하는 숫자만큼 쌓아서 보여주자!', { sec: 6 }); }
  else if (state.tutorial === 3 && state.caught > 0) { state.tutorial = 4; say('첫 친구다! 언덕 위 둘이와 꽃밭의 셋이도 찾아줘. 가까이 가서 E(액션)!', { sec: 6 }); }
}

function checkChapterDone() {
  if (state.done) return;
  if (state.caught >= creatures.length && state.rescued >= numberblocks.length && state.blocks >= 5) {
    state.done = true;
    say('챕터 1 완료! 초원 끝의 큰 구멍은… 블록을 더하면 다리가 될지도 몰라! (다음 챕터는 준비 중)', { sec: 12 });
  }
}

// ---------- 시작 ----------
document.getElementById('btn-start').onclick = () => {
  document.getElementById('title').classList.add('hidden');
  say('안녕! 난 원이야. 방향키(또는 화살표 버튼)로 움직여 봐!', { sec: 6 });
};

// ---------- 루프 ----------
const clock = new THREE.Clock();
let holeTold = false;
function frame() {
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;

  if (catchMode.active) {
    catchMode.update();
  } else {
    player.update(dt, input);
    if (player.fellInHole && !holeTold) { holeTold = true; say('뿅! 구멍은 아직 못 건너. 나중에 블록으로 다리를 만들자!'); }
    player.fellInHole = false;

    // 블록 줍기
    for (let i = pickups.length - 1; i >= 0; i--) {
      const b = pickups[i];
      b.rotation.y = t + b.userData.t;
      b.position.y = terrainHeight(b.position.x, b.position.z) + 0.6 + Math.sin(t * 2 + b.userData.t) * 0.1;
      if (b.position.distanceTo(player.position) < 1.1) {
        scene.remove(b);
        pickups.splice(i, 1);
        state.blocks++;
        refreshHud();
        if (state.blocks === 5) say('블록 5개! 이제 큰 문도 열 수 있겠어.');
      }
    }

    // 몬스터
    for (const c of creatures) {
      if (c.state === 'caught') continue;
      const ev = c.update(dt, player.position);
      if (ev === 'meet') {
        c.hint.visible = false;
        say(`${c.data.name}은(는) ${c.data.favoriteNumber}을(를) 좋아해!`, { sec: 3 });
        catchMode.open(c, state.blocks, (result) => {
          if (result === 'caught') {
            c.becomeFriend();
            chain.add(c.mesh);
            state.caught++;
            refreshHud();
            checkChapterDone();
          } else {
            c.becomeShy();
            say('괜찮아, 나중에 다시 오면 돼!');
          }
        });
        break;
      }
    }

    // 숫자블록 구출 (가까이 가서 액션)
    for (const nb of numberblocks) {
      if (nb.rescued) continue;
      nb.t += dt;
      nb.mesh.position.y = terrainHeight(nb.position.x, nb.position.z) + Math.abs(Math.sin(nb.t * 2)) * 0.05;
      const d = nb.position.distanceTo(player.position);
      if (d < 2.2 && input.wasPressed('action')) {
        nb.rescued = true;
        chain.add(nb.mesh);
        state.rescued++;
        refreshHud();
        say(`${nb.data.name}: 고마워! ${nb.data.personality}. 같이 갈래!`, { face: String(nb.data.number), sec: 5 });
        checkChapterDone();
      }
    }

    chain.update(dt);
    tutorial();
  }

  // 카메라 따라가기
  const camTarget = player.position.clone().add(CAM_OFFSET);
  camera.position.lerp(camTarget, 0.08);
  camera.lookAt(player.position.x, player.position.y + 1, player.position.z);

  if (msgTimer > 0) { msgTimer -= dt; if (msgTimer <= 0) msgEl.classList.add('hidden'); }

  renderer.render(scene, camera);
  input.endFrame();
  requestAnimationFrame(frame);
}
frame();
