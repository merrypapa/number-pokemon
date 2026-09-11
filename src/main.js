import * as THREE from 'three';
import { Input } from './input.js';
import { buildWorld, terrainHeight, inHole, WORLD } from './world.js';
import { Player } from './player.js';
import { Creature } from './creatures.js';
import { Numberblock, FollowChain, buildNumberblockMesh, animateNumberblock } from './numberblocks.js';
import { NUMBER_COLORS, colorForCount } from './palette.js';
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
  const col = NUMBER_COLORS[Number(face)];
  msgFace.style.background = col ? col.base : '#fff';
  msgFace.style.color = col ? '#fff' : '#333';
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

// ?showcase 로 열면 숫자블록 친구 1~10이 시작 지점 앞에 한 줄로 선다 (디자인 확인용)
if (location.search.includes('showcase')) {
  nbData.numberblocks.forEach((nb, i) => {
    const m = buildNumberblockMesh(nb);
    const x = -9 + i * 2, z = 3;
    m.position.set(x, terrainHeight(x, z), z);
    m.rotation.y = Math.PI * 0.02 * (i - 5);
    scene.add(m);
  });
}

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
const MAX_BLOCKS = 20;
const state = { blocks: 0, caught: 0, rescued: 0, tutorial: 0, done: false, frames: 0 };

// 주운 블록은 주인공 바로 뒤에 숫자블록 캐릭터로 쌓인다. 1개면 빨간 1, 2개면 주황 2… 잡기에 쓰면 다시 작아진다.
const myStack = { mesh: null, pop: 0 };
function setBlocks(n) {
  n = Math.max(0, Math.min(MAX_BLOCKS, n));
  state.blocks = n;
  const old = myStack.mesh;
  if (n === 0) {
    if (old) { chain.remove(old); scene.remove(old); }
    myStack.mesh = null;
  } else {
    const mesh = buildNumberblockMesh({ number: n });
    if (old) { chain.replace(old, mesh); scene.remove(old); }
    else {
      mesh.position.copy(player.position);
      mesh.position.z += 1.2;
      chain.addFirst(mesh);
    }
    scene.add(mesh);
    myStack.mesh = mesh;
    myStack.pop = 1;
  }
  refreshHud();
}
if (location.search.includes('debug')) { window.__game = { player, state, creatures, setBlocks }; }
const hudBlocks = document.getElementById('hud-blocks');
const hudCaught = document.getElementById('hud-caught');
const hudRescued = document.getElementById('hud-rescued');
const hudBlockIcon = document.querySelector('.hud-icon.block');
function refreshHud() {
  hudBlocks.textContent = `블록 ${state.blocks}개`;
  hudBlockIcon.style.background = state.blocks > 0 ? colorForCount(state.blocks) : '#fff';
  hudCaught.textContent = `친구 ${state.caught}/${creatures.length}`;
  hudRescued.textContent = `구출 ${state.rescued}/${numberblocks.length}`;
}
refreshHud();
if (location.search.includes('debug')) setBlocks(10); // 테스트용: ?debug 로 열면 블록 10개로 시작

const catchMode = new CatchMode(input, say);

// 튜토리얼: 조작을 한 번씩 해볼 때마다 다음 안내
function tutorial() {
  if (state.tutorial === 0 && player.moved) { state.tutorial = 1; say('잘했어! 이번엔 스페이스(점프 버튼)로 점프해 봐!'); }
  else if (state.tutorial === 1 && player.jumped) { state.tutorial = 2; say('하얀 블록을 찾아서 주워보자! 블록 위로 걸어가면 돼.'); }
  else if (state.tutorial === 2 && state.blocks > 0) { state.tutorial = 3; say('블록이 네 뒤에 숫자블록으로 쌓였어! 더 모으면 숫자가 커져. 몬스터가 오면 좋아하는 숫자만큼 나눠 주자!', { sec: 7 }); }
  else if (state.tutorial === 3 && state.caught > 0) { state.tutorial = 4; say('첫 친구다! 언덕 위 둘이와 꽃밭의 셋이도 찾아줘. 가까이 가서 E(액션)!', { sec: 6 }); }
}

function checkChapterDone() {
  if (state.done) return;
  if (state.caught >= creatures.length && state.rescued >= numberblocks.length) {
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
let respawnTimer = 6;
function frame() {
  state.frames++;
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;

  if (catchMode.active) {
    catchMode.update(dt);
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
        if (state.blocks >= MAX_BLOCKS) { if (!state.fullTold) { state.fullTold = true; say('블록이 스무 개! 더는 못 들어. 몬스터한테 나눠 주자!'); } continue; }
        scene.remove(b);
        pickups.splice(i, 1);
        setBlocks(state.blocks + 1);
        if (state.blocks === 5) say('블록 5개! 뒤를 봐, 하늘색 다섯이 모양이 됐어!', { sec: 5 });
        if (state.blocks === 10) say('열 개! 빨강 하나에 하양 아홉, 열이 모양이야!', { sec: 5 });
        if (state.blocks === 11) say('열 개 넘으면 열이 옆에 새 블록이 붙어. 10과 1은 11!', { sec: 5 });
      }
    }
    // 블록은 천천히 다시 생긴다 (잡기에 쓴 만큼 다시 모을 수 있게)
    respawnTimer -= dt;
    if (respawnTimer <= 0 && pickups.length < 8) {
      respawnTimer = 6;
      for (let tries = 0; tries < 20; tries++) {
        const x = rand(-24, 24), z = rand(-20, 24);
        if (inHole(x, z) || Math.hypot(x - player.position.x, z - player.position.z) < 6) continue;
        const m = makeBlockMesh(0xffffff);
        m.position.set(x, terrainHeight(x, z) + 0.6, z);
        m.userData.t = rand(0, 10);
        scene.add(m);
        pickups.push(m);
        break;
      }
    }

    // 몬스터
    for (const c of creatures) {
      if (c.state === 'caught') continue;
      const ev = c.update(dt, player.position);
      if (ev === 'meet') {
        c.hint.visible = false;
        const need = c.data.favoriteNumber;
        if (state.blocks < need) {
          // 블록이 모자라면 잡기 화면을 열지 않는다. 원이가 알려주고 몬스터는 잠시 물러난다.
          c.becomeShy();
          say(`${c.data.name}은(는) ${need}을(를) 좋아해! 블록이 ${need - state.blocks}개 모자라. 하얀 블록을 더 주워오자!`, { sec: 6 });
          break;
        }
        say(`${c.data.name}은(는) ${need}을(를) 좋아해!`, { sec: 3 });
        catchMode.open(c, state.blocks, (result, used) => {
          if (result === 'caught') {
            c.becomeFriend();
            chain.add(c.mesh);
            state.caught++;
            setBlocks(state.blocks - used);
            say(`${c.data.name}에게 블록 ${used}개를 줬어. 남은 블록은 ${state.blocks}개!`, { sec: 5 });
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
      animateNumberblock(nb.mesh, dt, false);
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
    // 따라오는 친구가 카메라와 주인공 사이에 끼면(주인공보다 앞쪽, +z) 반투명하게
    for (const f of chain.followers) {
      const occluding = f.mesh.position.z > player.position.z + 0.3 && f.mesh.position.distanceTo(player.position) < 3.5;
      const target = occluding ? 0.35 : 1;
      if (f.mesh.userData.opacity === target) continue;
      f.mesh.userData.opacity = target;
      f.mesh.traverse((o) => {
        if (!o.material || o.isLine) return;
        if (!o.userData.ownMaterial) { o.material = o.material.clone(); o.userData.ownMaterial = true; } // 공유 재질 보호
        o.material.transparent = target < 1;
        o.material.opacity = target;
      });
    }
    if (myStack.mesh && myStack.pop > 0) {
      myStack.pop = Math.max(0, myStack.pop - dt * 3);
      const sc = 1 + Math.sin(myStack.pop * Math.PI) * 0.25;
      myStack.mesh.scale.setScalar(sc);
    }
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
