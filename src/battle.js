import * as THREE from 'three';
import { colorForCount } from './palette.js';
import { terrainHeight, waterLevel } from './world.js';
import { effectiveness, effectWord, skillIcon } from './types.js';
import { tickModel, instantiate, hasModel } from './models.js';
import { partyScale } from './creatures.js';
import { strongAgainst, weakTo } from './types.js';
import { BALLS, BALL_BY_ID, catchChance, GRADES, gradeStars, recommendedBall, RETRY_BONUS } from './balls.js';
import { View3D } from './view3d.js';

// 대결 장면 (포켓몬 배틀 느낌, 턴제):
//  1) 카메라가 주인공 어깨 뒤로 내려가고, 내 대표 포켓몬이 앞으로 나가 상대 몬스터를 마주 본다
//  2) 기술을 고르면 내 포켓몬이 돌진 → 빛덩이가 날아가 상대 체력을 (공격력 × 기술 배수) 만큼 깎는다
//  3) 상대가 살아 있으면 반격해서 내 체력을 상대 공격력만큼 깎는다. 내 체력이 0이면 진다
//  4) 상대 체력이 0이면 어질어질 → 넘버볼을 던져 잡는다 (볼이 흔들리고 "잡았다!")
const easeOut = (t) => 1 - Math.pow(1 - t, 3);
const SKILL_KEYS = ['skill1', 'skill2', 'skill3', 'skill4'];

export const BALL_MODEL = '포켓몬볼.glb', CUBE_MODEL = '포켓몬큐브.glb';
const BALL_R = 0.32; // 볼 반지름(m). 모델도 이 크기로 맞춘다 (가운데가 원점)
/** 몬스터볼 모델: 텍스처의 빨간 부분(뚜껑)만 그 볼 색으로 칠한다 (브론즈·실버·골드). 재질은 복제해서 볼마다 따로 */
function tintRed(root, color) {
  const tint = new THREE.Color(color);
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.material = o.material.clone();
    o.material.onBeforeCompile = (shader) => {
      shader.uniforms.tintColor = { value: tint };
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform vec3 tintColor;')
        .replace('#include <map_fragment>', `#include <map_fragment>
  { float r = diffuseColor.r, g = diffuseColor.g, b = diffuseColor.b;
    if (r > 0.12 && r > g * 2.2 && r > b * 2.2) diffuseColor.rgb = tintColor * (0.55 + r * 0.75); } // 빨간 뚜껑 → 볼 색 (밝기는 그대로)`);
    };
    o.material.needsUpdate = true;
  });
}
export /** 볼을 다른 것보다 위에 그린다 (상대가 볼 위로 겹쳐도 볼이 안 사라지게). on=false 면 원래대로 */
function ballOnTop(ball, on) {
  ball.traverse((o) => { if (o.isMesh) { o.material.depthTest = !on; o.renderOrder = on ? 20 : 0; } });
}
export function makeBall(color, spec = null) {
  const file = spec?.shape === 'cube' ? CUBE_MODEL : BALL_MODEL;
  if (hasModel(file)) { // 진짜 모델: 높이 1m·발바닥 원점으로 맞춰져 있으니 볼 크기로 줄이고 가운데를 원점에
    const g = new THREE.Group();
    const m = instantiate(file);
    const s = BALL_R * 2 * (spec?.shape === 'cube' ? 0.95 : 1);
    m.scale.setScalar(s); m.position.y = -BALL_R;
    m.userData.popT = 1; m.userData.targetScale = s;
    if (spec?.shape !== 'cube') tintRed(m, color);
    else m.traverse((o) => { if (o.isMesh) o.material = o.material.clone(); });
    m.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    g.add(m);
    return g;
  }
  return makeDraftBall(color);
}
function makeDraftBall(color) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.32, 20, 16), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 }));
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.31, 0.07, 10, 32), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.4 }));
  band.rotation.x = Math.PI / 2;
  const btn = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), new THREE.MeshStandardMaterial({ color: 0x20232e }));
  btn.position.set(0, 0, 0.3);
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.325, 20, 16, 0, Math.PI * 2, 0, Math.PI * 0.42), new THREE.MeshStandardMaterial({ color, roughness: 0.3 }));
  body.castShadow = true;
  g.add(body, cap, band, btn);
  return g;
}

// 기술 빛덩이: 내 포켓몬 색으로 빛나는 구슬 + 은은한 빛
// 기술 종류(kind)별 투사체. 근접 기술(tackle/punch/scratch/peck)은 투사체 없이 돌진한다.
const MELEE = new Set(['tackle', 'punch', 'scratch', 'peck']);
const WHIP = new Set(['whip']);
function makeProjectile(kind, color, size = 1) {
  const g = new THREE.Group();
  const glow = (c, r) => { const m = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 10), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.35, depthWrite: false })); g.add(m); };
  const std = (c, e = 1) => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: e });
  switch (kind) {
    case 'fire': {
      g.add(new THREE.Mesh(new THREE.SphereGeometry(0.26 * size, 12, 10), std(0xff6a1a, 1.5)));
      const tail = new THREE.Mesh(new THREE.ConeGeometry(0.22 * size, 0.7 * size, 10), std(0xffb347, 1.2)); tail.rotation.z = Math.PI / 2; tail.position.x = -0.4 * size; g.add(tail);
      glow(0xff8833, 0.45 * size); g.add(new THREE.PointLight(0xff6a1a, 4, 6)); break; }
    case 'water': {
      const jet = new THREE.Mesh(new THREE.CapsuleGeometry(0.16 * size, 0.7 * size, 6, 12), std(0x4fc3f7, 0.8)); jet.rotation.z = Math.PI / 2; g.add(jet);
      for (let i = 0; i < 4; i++) { const b = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), std(0x9fe8ff, 0.6)); b.position.set(-0.3 - i * 0.15, (i % 2 ? 0.15 : -0.15), 0); g.add(b); }
      glow(0x4fc3f7, 0.4 * size); break; }
    case 'leaf': {
      for (let i = 0; i < 5; i++) { const l = new THREE.Mesh(new THREE.CircleGeometry(0.18 * size, 6), new THREE.MeshStandardMaterial({ color: 0x57b947, emissive: 0x2e8b57, emissiveIntensity: 0.6, side: THREE.DoubleSide })); l.scale.x = 0.55; const a = (i / 5) * Math.PI * 2; l.position.set(Math.cos(a) * 0.25, Math.sin(a) * 0.25, 0); l.rotation.set(a, a * 2, 0); g.add(l); }
      g.userData.spin = 14; break; }
    case 'bolt': {
      const pts = []; for (let i = 0; i < 6; i++) pts.push(new THREE.Vector3(-0.5 + i * 0.2, (i % 2 ? 0.14 : -0.14) * size, 0));
      g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0xffff66 })));
      g.add(new THREE.Mesh(new THREE.SphereGeometry(0.14 * size, 10, 8), std(0xffee55, 2))); glow(0xffee55, 0.4 * size); g.add(new THREE.PointLight(0xffee55, 4, 6)); break; }
    case 'rock': { g.add(new THREE.Mesh(new THREE.DodecahedronGeometry(0.28 * size, 0), new THREE.MeshStandardMaterial({ color: 0x8a94a6, roughness: 1 }))); g.userData.spin = 8; break; }
    case 'poison': { for (let i = 0; i < 5; i++) { const b = new THREE.Mesh(new THREE.SphereGeometry((0.1 + (i % 3) * 0.05) * size, 10, 8), new THREE.MeshStandardMaterial({ color: 0xa06bd6, emissive: 0x6a2fa8, emissiveIntensity: 0.8, transparent: true, opacity: 0.85 })); b.position.set((i - 2) * 0.16, (i % 2 ? 0.12 : -0.1), 0); g.add(b); } break; }
    case 'bug': { const th = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.2 * size, 6), std(0xffffff, 0.5)); th.rotation.z = Math.PI / 2; g.add(th); glow(0xffffff, 0.2); break; }
    case 'wind': { for (let i = 0; i < 3; i++) { const r = new THREE.Mesh(new THREE.TorusGeometry(0.15 + i * 0.12, 0.03, 6, 20), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7 })); r.rotation.y = Math.PI / 2; g.add(r); } g.userData.spin = 10; break; }
    case 'bone': { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.7 * size, 8), new THREE.MeshStandardMaterial({ color: 0xf5f0e6 })); b.rotation.z = Math.PI / 2; g.add(b); for (const x of [-0.35, 0.35]) for (const y of [-0.08, 0.08]) { const k = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), new THREE.MeshStandardMaterial({ color: 0xf5f0e6 })); k.position.set(x * size, y, 0); g.add(k); } g.userData.spin = 16; break; }
    case 'psychic': { for (let i = 0; i < 3; i++) { const r = new THREE.Mesh(new THREE.TorusGeometry(0.12 + i * 0.14, 0.035, 8, 24), std(0xff6bd6, 1.2)); r.rotation.y = Math.PI / 2; g.add(r); } glow(0xff6bd6, 0.45 * size); g.userData.spin = 6; break; }
    case 'ghost': { g.add(new THREE.Mesh(new THREE.SphereGeometry(0.3 * size, 12, 10), new THREE.MeshStandardMaterial({ color: 0x2a1d4d, emissive: 0x6a2fa8, emissiveIntensity: 1.2, transparent: true, opacity: 0.85 }))); glow(0x9b5cff, 0.5 * size); g.add(new THREE.PointLight(0x9b5cff, 3, 6)); break; }
    case 'sing': { for (let i = 0; i < 3; i++) { const col = [0xff6b9d, 0xffd93d, 0x4fc3f7][i]; const n = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 6), std(col, 1)); n.position.set((i - 1) * 0.28, (i % 2) * 0.2, 0); g.add(n); const st = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.35, 5), std(col, 1)); st.position.set((i - 1) * 0.28 + 0.1, (i % 2) * 0.2 + 0.2, 0); g.add(st); } break; }
    default: return makeBolt(color, size);
  }
  return g;
}
function makeBolt(color, size = 1) {
  const g = new THREE.Group();
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.2 * size, 12, 10), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: color, emissiveIntensity: 1.4 }));
  const halo = new THREE.Mesh(new THREE.SphereGeometry(0.36 * size, 12, 10), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.35, depthWrite: false }));
  const light = new THREE.PointLight(color, 3, 6);
  g.add(core, halo, light);
  return g;
}

export class Battle {
  constructor({ input, camera, say, sound, particles, confetti, party }) {
    Object.assign(this, { input, camera, say, sound, particles, confetti, party });
    this.active = false;
    this.el = document.getElementById('battle');
    this.tagEl = document.getElementById('battle-tag');
    this.tagNameEl = document.getElementById('tag-name');
    this.tagFillEl = document.getElementById('tag-fill');
    this.tagHpEl = document.getElementById('tag-hp');
    this.tagAtkEl = document.getElementById('tag-atk');
    this.infoEl = document.getElementById('poke-info');
    this.infoBodyEl = document.getElementById('poke-info-body');
    this.infoOpen = false;
    document.getElementById('btn-enemy-info').onclick = () => this.showInfo();
    document.getElementById('btn-info-close').onclick = () => this.hideInfo();
    this.infoEl.onclick = (e) => { if (e.target === this.infoEl) this.hideInfo(); };
    this.mineEl = document.getElementById('battle-mine');
    this.mineNameEl = document.getElementById('battle-mine-name');
    this.mineHpEl = document.getElementById('battle-mine-hp');
    this.mineHpNumEl = document.getElementById('battle-mine-hpnum');
    this.mineAtkEl = document.getElementById('battle-mine-atk');
    this.skillsEl = document.getElementById('battle-skills');
    this.msgEl = document.getElementById('battle-msg');
    this.bannerEl = document.getElementById('battle-banner');
    this.floatEl = document.getElementById('battle-float');
    this.ballBtn = document.getElementById('btn-ball');
    this.ballsEl = document.getElementById('battle-balls');
    this.onUseBall = null;   // (ballId) => true/false  main 이 재고를 관리한다
    this.getBalls = () => ({ bronze: 0, silver: 0, gold: 0, diamond: 0 });
    this.runBtn = document.getElementById('btn-run');
    this.ballBtn.onclick = () => this.throwBall();
    this.runBtn.onclick = () => this.leave();
    // 교체 팝업 (왼쪽 위 버튼): ◀ ▶ 로 넘기며 3D 모습·스탯·특징을 보고 교체한다
    this.switchBtn = document.getElementById('btn-switch');
    this.switchEl = document.getElementById('switch-modal');
    this.switchInfoEl = document.getElementById('switch-info');
    this.switchPosEl = document.getElementById('switch-pos');
    this.switchView = new View3D();
    this.switchBtn.onclick = () => this.openSwitch();
    document.getElementById('btn-switch-close').onclick = () => this.closeSwitch();
    document.getElementById('switch-prev').onclick = () => this.moveSwitch(-1);
    document.getElementById('switch-next').onclick = () => this.moveSwitch(1);
    document.getElementById('btn-switch-go').onclick = () => { const x = this.switchList?.[this.switchIdx]; this.closeSwitch(); if (x) this.switchTo(x); };
    // 넘버볼 만들기 팝업 (볼을 고를 때): 종류별로 블록을 넘버볼로 바꾼다
    this.craftBtn = document.getElementById('btn-craft');
    this.craftEl = document.getElementById('craft-modal');
    this.craftRowsEl = document.getElementById('craft-rows');
    this.craftBlocksEl = document.getElementById('craft-blocks');
    this.craftBtn.onclick = () => this.openCraft();
    this.catchEl = document.getElementById('catch-modal');
    document.getElementById('btn-catch-ok').onclick = () => { if (this.phase === 'success') this.end('caught'); };
    document.getElementById('btn-craft-close').onclick = () => this.closeCraft();
    document.getElementById('btn-craft-done').onclick = () => this.closeCraft();
    this.flying = [];
    this.sel = 0;
  }

  /** 대결이 벌어지는 바닥 높이. 바다 위(배를 타고 만난 포켓몬)면 수면 위에서 싸운다 */
  groundY(x, z) { return this.floorY == null ? terrainHeight(x, z) : Math.max(terrainHeight(x, z), this.floorY); }

  start({ creature, player, scene, member, onCaught, onLeave, onLost, onEscaped = null, hideMeshes = [], decor = null, onWater = false }) {
    Object.assign(this, { creature, player, scene, member, onCaught, onLeave, onLost, onEscaped, decor });
    this.floorY = onWater ? waterLevel() : null; // 물 위 대결: 바닥 대신 수면
    this.active = true;
    this.phase = 'enter';
    this.timer = 0;
    this.wobbles = 0;
    this.sel = 0;
    this.skill = null;
    this.shakeCam = 0;
    this.switched = false; this.firstMember = member; // 교체하면 대결이 끝날 때 새 포켓몬이 대표가 된다
    this.switchOpen = false; this.craftOpen = false;
    this.switchEl.classList.add('hidden'); this.craftEl.classList.add('hidden'); this.craftBtn.classList.add('hidden');
    if (creature.hp == null) creature.hp = creature.data.baseHp;
    this.input.endFrame();
    this.sound.ensure();

    // 무대: 상대를 주인공 앞 일정 거리에, 내 포켓몬을 그 사이 왼쪽에 세우고 서로 마주 보게
    const m = creature.mesh.position, p = player.position;
    const dir = new THREE.Vector3(m.x - p.x, 0, m.z - p.z);
    if (dir.lengthSq() < 0.01) dir.set(0, 0, -1);
    dir.normalize();
    const dist = 5.2 + (creature.data.scale || 1) * 0.8;
    this.stageFrom = m.clone();
    this.stageTo = new THREE.Vector3(p.x + dir.x * dist, 0, p.z + dir.z * dist);
    this.stageTo.y = this.groundY(this.stageTo.x, this.stageTo.z);
    creature.mesh.rotation.y = Math.atan2(-dir.x, -dir.z);
    player.facing = Math.atan2(dir.x, dir.z);
    player.group.rotation.y = player.facing;
    this.dir = dir;
    const right = new THREE.Vector3(dir.z, 0, -dir.x);
    this.right = right;
    // 주인공 시점(낮은 눈높이)에서 상대를 마주 본다. 주인공과 (대표가 아닌) 뒤따르던 친구들은 대결 동안 숨긴다.
    this.camPos = new THREE.Vector3().copy(p).addScaledVector(dir, -0.7);
    this.camPos.y = p.y + 1.35;
    // 상대의 발밑 근처를 보면 상대 몸이 화면 위쪽 절반에 잡혀 아래 대결 패널에 가리지 않는다 (큰 보스도)
    this.camLook = new THREE.Vector3(this.stageTo.x, this.stageTo.y + 0.15, this.stageTo.z);
    // 내 포켓몬은 화면 왼쪽 아래(가로 9%, 세로 72% 지점)에 발을 딛고 서서 상대를 본다.
    // 대결 카메라로 그 화면 좌표를 지면까지 되쏘아 자리를 정하므로 화면 비율이 달라도 패널에 가리지 않는다.
    const mine = member.mesh;
    this.mineFrom = mine.position.clone();
    const cam = this.camera.clone();
    cam.position.copy(this.camPos); cam.lookAt(this.camLook); cam.updateMatrixWorld();
    const ray = new THREE.Vector3(-0.78, -0.4, 0.5).unproject(cam).sub(this.camPos).normalize();
    const tGround = ray.y < -0.02 ? (p.y - this.camPos.y) / ray.y : 4;
    this.mineTo = new THREE.Vector3().copy(this.camPos).addScaledVector(ray, Math.max(2, Math.min(6, tGround)));
    this.mineTo.y = this.groundY(this.mineTo.x, this.mineTo.z);
    this.mineScale = partyScale(this.party.species(member)); // 내 포켓몬은 메가라도 1.6 까지
    // 둘이 서로 마주 본다: 내 포켓몬은 상대 자리를, 상대는 내 포켓몬 자리를 향한다
    this.mineYaw = Math.atan2(this.stageTo.x - this.mineTo.x, this.stageTo.z - this.mineTo.z);
    this.enemyYaw = Math.atan2(this.mineTo.x - this.stageTo.x, this.mineTo.z - this.stageTo.z);
    mine.rotation.set(0, this.mineYaw, 0);
    creature.mesh.rotation.y = this.enemyYaw;
    mine.visible = true;
    this.throwFrom = new THREE.Vector3().copy(this.camPos).addScaledVector(dir, 0.9).addScaledVector(right, 0.35);
    this.throwFrom.y -= 0.45;
    this.hidden = [];
    for (const o of [player.group, ...hideMeshes]) { if (o !== mine && o.visible) { o.visible = false; this.hidden.push(o); } }
    // 어두운 곳(동굴)에서는 대결 무대를 따로 밝힌다: 카메라 자리 등불 + 두 포켓몬 위 무대 조명. 안개도 잠시 멀리 민다.
    this.lights = [];
    if (player.lamp && player.lamp.intensity > 0) {
      const lamp = new THREE.PointLight(0xffd9a0, player.lamp.intensity, player.lamp.distance);
      lamp.position.copy(this.camPos);
      const enemySpot = new THREE.PointLight(0xfff3d6, 16, 18);
      enemySpot.position.set(this.stageTo.x, this.stageTo.y + 3.5, this.stageTo.z);
      const mineSpot = new THREE.PointLight(0xfff3d6, 10, 12);
      mineSpot.position.set(this.mineTo.x, this.mineTo.y + 3, this.mineTo.z);
      this.lights.push(lamp, enemySpot, mineSpot);
      for (const l of this.lights) scene.add(l);
      if (scene.fog) { this.fogFar = scene.fog.far; scene.fog.far = Math.max(scene.fog.far, 120); }
    }
    // 카메라와 상대 사이 통로에 있는 나무·바위·풀숲 숨기기
    if (decor) {
      const a = this.camPos, b = this.stageTo;
      const ab = new THREE.Vector3().subVectors(b, a);
      const len2 = ab.lengthSq();
      const tmp = new THREE.Vector3();
      for (const o of decor.children) {
        if (!o.visible || o.isInstancedMesh) continue;
        const t = Math.max(0, Math.min(1, tmp.subVectors(o.position, a).dot(ab) / len2));
        const d = tmp.copy(a).addScaledVector(ab, t).distanceTo(o.position);
        const rad = o.userData.radius || 3.2;
        if (d < rad + 0.5 && Math.hypot(o.position.x - b.x, o.position.z - b.z) < 30) { o.visible = false; this.hidden.push(o); }
      }
    }

    this.tagNameEl.textContent = (creature.isBoss ? '보스 ' : '') + creature.data.name;
    this.tagNameEl.style.color = colorForCount(creature.data.favoriteNumber || creature.data.baseHp);
    const myName = this.party.name(member);
    this.msgEl.textContent = creature.hp === creature.data.baseHp
      ? `${creature.data.name}의 체력은 ${creature.hp}, 공격력은 ${creature.data.baseAtk}! 가라, ${myName}!`
      : `체력이 ${creature.hp} 남아 있어. 이어서 싸우자, ${myName}!`;
    if (member.hp <= creature.data.baseAtk) this.msgEl.textContent += ` (조심해! 내 체력이 ${member.hp}밖에 없어)`;
    this.ballBtn.classList.add('hidden');
    this.ballsEl.classList.add('hidden');
    this.bannerEl.classList.add('hidden');
    this.runBtn.textContent = '도망치기';
    this.runBtn.classList.remove('primary');
    this.render();
    this.el.classList.remove('hidden');
    this.tagEl.classList.remove('hidden');
    this.placeTag();
    this.mineEl.classList.remove('hidden');
    document.body.classList.add('battle');
  }

  // 체력 칸: 숫자블록처럼 10개가 꽉 찬 묶음은 "10 막대" 하나로, 나머지는 낱개 칸으로. 묶음마다 색이 다르다(10·20·30… 단위를 한눈에)
  cubes(el, total, now, color) {
    el.innerHTML = '';
    for (let g = 0; g * 10 < total; g++) {
      const lo = g * 10, hi = Math.min(total, lo + 10);
      const col = g === 0 ? color : colorForCount(g + 1);
      const group = document.createElement('span');
      group.className = 'hp-group';
      if (hi - lo === 10 && (now >= hi || now <= lo)) { // 꽉 찬 10 묶음 (남아 있거나 다 잃었거나) → 막대 하나
        const bar = document.createElement('span');
        bar.className = 'hp-ten' + (now <= lo ? ' gone' : '');
        bar.style.background = col;
        bar.textContent = '10';
        group.appendChild(bar);
      } else {
        for (let i = lo; i < hi; i++) {
          const cube = document.createElement('span');
          cube.className = 'hp-cube' + (i >= now ? ' gone' : '');
          cube.style.background = col;
          group.appendChild(cube);
        }
      }
      el.appendChild(group);
    }
  }

  render() {
    const c = this.creature, m = this.member;
    // 상대: 머리 위 체력 바
    const ratio = Math.max(0, Math.min(1, c.hp / c.data.baseHp));
    this.tagFillEl.style.width = `${ratio * 100}%`;
    this.tagFillEl.style.background = ratio > 0.5 ? '#57b947' : ratio > 0.25 ? '#f7cf3e' : '#e8453c';
    this.tagHpEl.textContent = `❤ ${c.hp}/${c.data.baseHp}`;
    this.tagAtkEl.textContent = `· ⚔ ${c.data.baseAtk}`;
    this.mineNameEl.textContent = this.party.name(m);
    this.mineNameEl.style.color = this.party.color(m);
    const mr = Math.max(0, Math.min(1, m.hp / m.maxHp));
    this.mineHpEl.innerHTML = `<div class="tag-bar mine"><div class="mine-fill" style="width:${mr * 100}%;background:${mr > 0.5 ? '#57b947' : mr > 0.25 ? '#f7cf3e' : '#e8453c'}"></div></div>`;
    this.mineHpNumEl.textContent = `❤ ${Math.max(0, m.hp)}/${m.maxHp}`;
    this.mineAtkEl.textContent = `⚔ ${m.atk}`;

    // 기술 버튼: 열린 기술은 이름 + 피해, 아직 안 열린 다음 기술은 잠금 표시. 볼을 고르는 동안은 숨긴다
    this.skillsEl.innerHTML = '';
    this.skillsEl.classList.toggle('hidden', this.phase === 'dizzy' || this.phase === 'ball_fly' || this.phase === 'capture' || this.phase === 'wobble');
    const unlocked = this.party.skills(m);
    this.sel = Math.max(0, Math.min(this.sel, unlocked.length - 1));
    const choosing = this.phase === 'choose';
    unlocked.forEach((s, i) => {
      const b = document.createElement('button');
      b.className = 'skill' + (i === this.sel ? ' sel' : '');
      b.innerHTML = `<span class="skill-top"><span class="skill-icon">${skillIcon(s)}</span><span class="skill-name">${s.name}</span></span><span class="skill-dmg">⚔ ${this.party.damage(m, s)}</span>`;
      b.disabled = !choosing;
      b.onclick = () => { this.sel = i; this.useSkill(i); };
      this.skillsEl.appendChild(b);
    });
    for (const s of (this.party.species(m).skills || []).filter((s) => m.atk < s.atk)) { // 아직 못 쓰는 기술은 회색으로
      const b = document.createElement('button');
      b.className = 'skill locked';
      b.innerHTML = `<span class="skill-top"><span class="skill-icon">${skillIcon(s)}</span><span class="skill-name">${s.name}</span></span><span class="skill-dmg">🔒 공격 ${s.atk}</span>`;
      b.disabled = true;
      this.skillsEl.appendChild(b);
    }
    const others = this.party.members.filter((x) => x !== m && !this.party.isFainted(x));
    this.switchBtn.classList.toggle('hidden', !(choosing && others.length));
    if (!choosing && this.switchOpen) this.closeSwitch();
    document.documentElement.style.setProperty('--battle-h', `${this.el.offsetHeight}px`); // 좁은 화면에서 내 포켓몬 패널을 조작판 위에 올리기 위해
  }

  // ----- 내 공격 -----
  useSkill(i) {
    if (this.phase !== 'choose') return;
    const skill = this.party.skills(this.member)[i];
    if (!skill) return;
    this.skill = skill;
    this.phase = 'attack';
    this.phaseStart = this.timer;
    this.meleeHitDone = false;
    this.msgEl.textContent = `${this.party.name(this.member)}의 ${skill.name}!`;
    this.sound.throw_();
    this.render();
  }

  // ----- 포켓몬 교체 (한 턴을 쓴다: 바꾸는 동안 상대가 공격해 온다) -----
  openSwitch() {
    if (this.phase !== 'choose') return;
    this.switchList = this.party.members.filter((x) => x !== this.member && !this.party.isFainted(x));
    if (!this.switchList.length) return;
    this.switchIdx = 0;
    this.switchOpen = true;
    this.switchEl.classList.remove('hidden');
    this.renderSwitch();
    this.sound.click();
  }
  closeSwitch() { this.switchOpen = false; this.switchEl.classList.add('hidden'); this.switchView.stop(); }
  moveSwitch(d) { const n = this.switchList.length; this.switchIdx = (this.switchIdx + d + n) % n; this.sound.click(); this.renderSwitch(); }
  renderSwitch() {
    const x = this.switchList[this.switchIdx], sp = this.party.species(x), c = this.creature.data;
    const n = this.switchList.length;
    this.switchPosEl.textContent = `${this.switchIdx + 1} / ${n}`;
    const myType = sp.type || '노말', enemyType = c.type || '노말';
    const atkMult = effectiveness(myType, enemyType), defMult = effectiveness(enemyType, myType);
    const word = (m) => (m > 1 ? '<b class="good">굉장해! ×1.5</b>' : m < 1 ? '<b class="bad">별로… ×0.5</b>' : '보통');
    const skills = this.party.skills(x).map((s) => `${skillIcon(s)} ${s.name} <small>-${this.party.damage(x, s)}</small>`).join(' · ');
    this.switchInfoEl.innerHTML = `
      <div class="sw-name">${sp.name} <span class="party-type">${myType}</span></div>
      <div class="sw-stat"><span class="hp">❤ ${x.hp}/${x.maxHp}</span> <span class="atk">⚔ ${x.atk}</span></div>
      <div class="sw-row">🎯 ${skills || '기술 없음'}</div>
      <div class="sw-row">💥 ${c.name}(${enemyType})에게 내 공격: ${word(atkMult)}</div>
      <div class="sw-row">🛡 ${c.name}의 공격을 받으면: ${word(defMult === 1 ? 1 : defMult > 1 ? 0.5 : 1.5)}</div>
      ${sp.story ? `<div class="sw-story">📖 ${sp.story}</div>` : ''}
      <div class="sw-tip">바꾸는 동안 상대가 한 번 공격해!</div>`;
    this.switchView.show(document.getElementById('switch-view'), sp, () => this.switchOpen);
  }
  // ----- 넘버볼 만들기 팝업 -----
  openCraft() {
    if (this.phase !== 'dizzy') return;
    this.craftOpen = true;
    this.craftEl.classList.remove('hidden');
    this.renderCraft();
    this.sound.click();
  }
  closeCraft() { this.craftOpen = false; this.craftEl.classList.add('hidden'); if (this.phase === 'dizzy') this.renderBalls(); }
  renderCraft() {
    const stock = this.getBalls(), blocks = this.getBlocks ? this.getBlocks() : 0;
    this.craftBlocksEl.innerHTML = `내 블록 <b>${blocks}개</b> · ${gradeStars(this.creature.data.grade || 1)} ${this.creature.data.name}에게는 <b>${recommendedBall(this.creature.data.grade || 1).name}</b>이 잘 맞아`;
    this.craftRowsEl.innerHTML = '';
    for (const b of BALLS) {
      const row = document.createElement('div');
      row.className = 'ball-row';
      row.style.setProperty('--ball', b.css);
      row.innerHTML = `<span class="ball-dot big${b.shape === 'cube' ? ' cube' : ''}"></span><span class="ball-name">${b.name}</span><span class="ball-count">${stock[b.id] || 0}<small>개</small></span><span class="ball-pct-sm">${this.chanceFor(b.tier)}%</span><button ${blocks < b.cost ? 'disabled' : ''}>블록 ${b.cost}개로 만들기</button>`;
      row.querySelector('button').onclick = () => { if (this.onBuyBall?.(b.id)) { this.sound.pickup?.(); this.renderCraft(); } };
      this.craftRowsEl.appendChild(row);
    }
  }
  switchTo(x) {
    if (this.phase !== 'choose' || x === this.member || this.party.isFainted(x)) return;
    const old = this.member;
    old.mesh.visible = false;
    const mesh = x.mesh;
    this.scene.add(mesh);
    this.mineScale = partyScale(this.party.species(x));
    mesh.visible = true;
    mesh.scale.setScalar(this.mineScale);
    mesh.rotation.set(0, this.mineYaw, 0); // 상대를 마주 본다
    mesh.position.copy(this.mineTo);
    this.member = x;
    this.switched = true;
    this.mineFrom = this.mineTo.clone();
    this.particles.stars(this.scene, this.minePoint(), 14, new THREE.Color(this.party.color(x)).getHex(), 0.4);
    this.msgEl.textContent = `가라, ${this.party.name(x)}! 바꾸는 사이에 ${this.creature.data.name}이(가) 공격해 온다!`;
    this.sound.throw_();
    this.phase = 'enemyWind';
    this.phaseStart = this.timer;
    this.render();
  }

  targetPoint() {
    const c = this.creature;
    return c.mesh.position.clone().add(new THREE.Vector3(0, 0.7 * (c.data.scale || 1), 0));
  }
  minePoint() { return this.member.mesh.position.clone().add(new THREE.Vector3(0, 0.6 * this.mineScale, 0)); }

  launchBolt() {
    const color = new THREE.Color(this.party.color(this.member));
    const kind = this.skill.kind || 'tackle';
    const bolt = makeProjectile(kind, color, 0.8 + (this.skill.power || 1) * 0.4);
    const from = this.minePoint().addScaledVector(this.dir, 0.4);
    bolt.position.copy(from); bolt.lookAt(this.targetPoint()); bolt.rotateY(-Math.PI / 2); // 투사체의 +X 가 앞
    this.scene.add(bolt);
    const arc = kind === 'rock' || kind === 'bone' ? 1.4 : kind === 'bolt' ? 0.1 : kind === 'water' ? 0.35 : 0.6;
    const dur = kind === 'bolt' ? 0.22 : kind === 'rock' ? 0.55 : 0.38;
    this.flying.push({ mesh: bolt, from, to: this.targetPoint(), t: 0, dur, kind: 'bolt', arc, spin: bolt.userData.spin || 0, keepRot: true });
    this.particles.stars(this.scene, from, 6, color.getHex(), 0.3);
  }
  /** 엔터로 던질 때: 가진 것 중 추천 등급 이상에서 가장 싼 볼, 없으면 가진 것 중 제일 좋은 볼 */
  bestBall() {
    const stock = this.getBalls(), rec = recommendedBall(this.creature.data.grade || 1);
    const have = BALLS.filter((b) => stock[b.id] > 0);
    return (have.find((b) => b.tier >= rec.tier) || have[have.length - 1] || BALLS[0]).id;
  }
  isMelee() { return MELEE.has(this.skill?.kind || 'tackle'); }
  isWhip() { return WHIP.has(this.skill?.kind); }
  /** 덩굴채찍: 내 포켓몬에서 상대까지 물결치는 덩굴이 뻗어 나가 때리고 되감긴다 */
  whipStart() {
    const from = this.minePoint(), to = this.targetPoint();
    const mat = new THREE.MeshStandardMaterial({ color: 0x3f9d3a, emissive: 0x1f6b2a, emissiveIntensity: 0.5 });
    this.whip = { from, to, t: 0, mesh: null, mat, hit: false };
    this.sound.throw_();
  }
  whipUpdate(dt) {
    const w = this.whip; if (!w) return;
    w.t += dt / 0.55;
    const t = Math.min(1, w.t);
    const reach = t < 0.5 ? t * 2 : 1 - (t - 0.5) * 2; // 뻗었다가 되감긴다
    if (w.mesh) { this.scene.remove(w.mesh); w.mesh.geometry.dispose(); }
    const pts = [];
    const side = new THREE.Vector3(-this.dir.z, 0, this.dir.x);
    for (let i = 0; i <= 14; i++) {
      const u = i / 14;
      const p = w.from.clone().lerp(w.to, u * Math.max(0.02, reach));
      p.addScaledVector(side, Math.sin(u * Math.PI * 2 + this.timer * 30) * 0.25 * (1 - u) * reach);
      p.y += Math.sin(u * Math.PI) * 0.6 * reach;
      pts.push(p);
    }
    w.mesh = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.06, 6, false), w.mat);
    this.scene.add(w.mesh);
    if (!w.hit && t >= 0.5) { w.hit = true; this.particles.stars(this.scene, w.to, 10, 0x57b947, 0.35); this.onBoltHit(); }
    if (t >= 1) { this.scene.remove(w.mesh); w.mesh.geometry.dispose(); this.whip = null; }
  }
  /** 근접 기술 효과: 할퀴기는 흰 발톱 자국, 펀치는 노란 충격 별, 쪼기는 작은 튐, 몸통박치기는 먼지 */
  meleeFx() {
    const kind = this.skill?.kind, at = this.targetPoint();
    if (kind === 'scratch') {
      for (let i = 0; i < 3; i++) { const slash = new THREE.Mesh(new THREE.PlaneGeometry(0.08, 0.9), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false })); slash.position.copy(at).add(new THREE.Vector3((i - 1) * 0.22, 0, 0.3)); slash.lookAt(this.camera.position); slash.rotateZ(-0.6); this.scene.add(slash); this.flying.push({ mesh: slash, from: slash.position.clone(), to: slash.position.clone().add(new THREE.Vector3(0.1, -0.3, 0)), t: 0, dur: 0.35, kind: 'fx', arc: 0, keepRot: true }); }
      this.particles.stars(this.scene, at, 8, 0xffffff, 0.3);
    } else if (kind === 'punch') { this.particles.stars(this.scene, at, 14, 0xffd93d, 0.5); }
    else if (kind === 'peck') { this.particles.stars(this.scene, at, 8, 0xffffff, 0.25); }
    else { this.particles.cubes(this.scene, at.clone().setY(at.y - 0.4), 10, 0xd9c9a0); }
  }

  onBoltHit() {
    const c = this.creature;
    const mult = effectiveness(this.party.type(this.member), c.data.type || '노말');
    const dmg = this.party.damage(this.member, this.skill, mult);
    const hitPos = this.targetPoint();
    c.hp = Math.max(0, c.hp - dmg);
    this.sound.hit();
    this.particles.cubes(this.scene, hitPos, 8 + Math.min(12, dmg), new THREE.Color(this.party.color(this.member)).getHex());
    this.showFloat(`-${dmg}${mult > 1 ? ' !!' : mult < 1 ? ' …' : ''}`, mult > 1 ? '#ff5a1f' : mult < 1 ? '#8899aa' : this.party.color(this.member), hitPos);
    const eff = effectWord(mult);
    if (eff) this.showBanner(eff);
    this.squash = 0.35;
    this.shakeCam = 0.15;
    if (c.hp === 0) {
      this.phase = 'dizzy';
      this.msgEl.textContent = `${c.data.name}이(가) 어질어질! 넘버볼을 던지자!`;
      this.showBanner('쓰러뜨렸다!');
      this.ballsEl.classList.remove('hidden');
      this.renderBalls();
      this.particles.stars(this.scene, hitPos, 12, 0xffd93d);
    } else {
      this.phase = 'enemyWind';
      this.phaseStart = this.timer;
      this.msgEl.textContent = `${eff ? eff + ' ' : ''}${c.data.name}의 체력이 ${c.hp} 남았어! ${c.data.name}의 공격!`;
    }
    this.render();
  }

  // ----- 상대의 반격 -----
  onEnemyHit() {
    const c = this.creature, m = this.member;
    const mult = effectiveness(c.data.type || '노말', this.party.type(m));
    const dmg = Math.max(1, Math.round(c.data.baseAtk * mult));
    this.enemyEff = effectWord(mult);
    m.hp = Math.max(0, m.hp - dmg);
    const pos = this.minePoint();
    this.sound.hit();
    this.particles.cubes(this.scene, pos, 8, colorForCount(c.data.favoriteNumber || c.data.baseHp));
    this.showFloat(`-${dmg}${mult > 1 ? ' !!' : mult < 1 ? ' …' : ''}`, '#c0392b', pos);
    this.mineHurt = 0.4;
    this.shakeCam = 0.25;
    this.render();
  }

  afterEnemyTurn() {
    const c = this.creature, m = this.member;
    if (m.hp <= 0) {
      this.phase = 'lost';
      this.phaseStart = this.timer;
      this.showBanner('앗, 졌다…');
      this.msgEl.textContent = `${this.party.name(m)}이(가) 기절했어… 오박사님께 치료받아야 해. 올린 공격력과 체력은 그대로야!`;
      this.runBtn.textContent = '돌아가기 ▶';
      this.runBtn.classList.add('primary');
      this.sound.bounce();
    } else {
      this.phase = 'choose';
      this.msgEl.textContent = `${this.enemyEff ? this.enemyEff + ' ' : ''}${c.data.name} 체력 ${c.hp}, 내 체력 ${m.hp}. 다음 기술을 고르자!`;
    }
    this.render();
  }

  // ----- 넘버볼 던지기 -----
  /** 어질어질할 때 넘버볼 고르기 버튼들 (재고·잡힐 확률) */
  /** 잡힐 확률 (등급·볼 + 이 포켓몬에게 실패한 만큼 보너스) */
  chanceFor(tier) { return Math.min(100, catchChance(this.creature.data.grade || 1, tier) + (this.creature.catchBonus || 0)); }
  renderBalls() {
    this.ballsEl.innerHTML = '';
    const stock = this.getBalls();
    for (const b of BALLS) {
      const n = stock[b.id] || 0, pct = this.chanceFor(b.tier);
      const btn = document.createElement('button');
      btn.className = 'ball-btn' + (n ? '' : ' none');
      btn.style.setProperty('--ball', b.css);
      btn.innerHTML = `<span class="ball-dot${b.shape === 'cube' ? ' cube' : ''}"></span><span class="ball-name">${b.name.replace('볼', '')}</span><span class="ball-n">×${n}</span><span class="ball-pct">${pct}%</span>`;
      btn.title = `잡힐 확률 ${pct}%`;
      btn.disabled = !n;
      btn.onclick = () => this.throwBall(b.id);
      this.ballsEl.appendChild(btn);
    }
    this.craftBtn.classList.toggle('hidden', !this.onBuyBall); // 팝업에서 블록을 넘버볼로 바꾼다
  }
  throwBall(ballId = 'bronze') {
    if (this.phase !== 'dizzy') return;
    const spec = BALL_BY_ID[ballId] || BALLS[0];
    if (this.onUseBall && !this.onUseBall(spec.id)) { this.msgEl.textContent = `${spec.name}이 없어! 도감의 넘버볼 탭에서 블록으로 바꿀 수 있어.`; return; }
    this.ballSpec = spec;
    const ball = makeBall(spec.color, spec);
    const from = this.throwFrom.clone();
    this.scene.add(ball);
    this.flying.push({ mesh: ball, from, to: this.targetPoint(), t: 0, dur: 0.7, kind: 'ball', arc: 1.6 });
    this.ball = ball;
    this.phase = 'ball_fly';
    this.ballBtn.classList.add('hidden');
    this.ballsEl.classList.add('hidden');
    this.craftBtn.classList.add('hidden');
    this.msgEl.textContent = `${spec.name} 던지기!`;
    this.sound.throw_();
  }

  /** 상대 머리 위에 이름표·체력 바를 놓는다 (화면 좌표로 투영) */
  placeTag() {
    const c = this.creature;
    if (!c || !this.active) return;
    const top = c.mesh.position.clone().add(new THREE.Vector3(0, 1.25 * (c.data.scale || 1), 0));
    this.camera.updateMatrixWorld();
    const v = top.project(this.camera);
    this.tagEl.style.left = `${((v.x + 1) / 2) * window.innerWidth}px`;
    this.tagEl.style.top = `${Math.max(70, ((1 - v.y) / 2) * window.innerHeight - 12)}px`;
    this.tagEl.style.visibility = c.mesh.visible && v.z < 1 ? 'visible' : 'hidden';
  }

  /** (i) 상대 포켓몬 상세: 특징·기술·진화·이야기 */
  showInfo() {
    const d = this.creature.data;
    const strong = strongAgainst(d.type || '노말'), weak = weakTo(d.type || '노말');
    const skills = (d.skills || []).map((s) => `<span>${skillIcon(s)} ${s.name} <small>(공격 ${s.atk}↑ ×${s.power})</small></span>`).join('');
    const evo = d.evolution ? `<div class="row">✨ 진화: 공격 ${d.evolution.atk} · 체력 ${d.evolution.hp} · ${d.evolution.wins ? `대표로 ${d.evolution.wins}번 이기면` : `지역 보스 ${d.evolution.boss}명 이기면`} → <b>${(Array.isArray(d.evolution.to) ? d.evolution.to.map((t) => this.speciesName?.(t.id)).filter(Boolean).join(' / ') : this.speciesName?.(d.evolution.to)) || '?'}</b></div>` : '';
    const img = this.thumb ? this.thumb(d) : null;
    this.infoBodyEl.innerHTML = `
      <h2>${img ? `<img src="${img}" alt="">` : ''}<span>${d.isBoss || d.boss ? '보스 ' : ''}${d.name} <small style="font-size:14px;color:#777">${d.type} 속성</small></span></h2>
      <div class="row">❤ 체력 <b>${this.creature.hp}/${d.baseHp}</b> · ⚔ 공격 <b>${d.baseAtk}</b> · 성격: <b>${d.personality || '-'}</b></div>
      <div class="row">등급: <b>${gradeStars(d.grade || 1)} ${GRADES[d.grade || 1]}</b> · 추천 넘버볼: <b>${recommendedBall(d.grade || 1).name}</b></div>
      <div class="row">💪 강함: <b>${strong.length ? strong.join('·') : '-'}</b> &nbsp; 😖 약함: <b>${weak.length ? weak.join('·') : '-'}</b></div>
      <div class="row">기술: <span class="skill-list">${skills}</span></div>
      ${evo}
      <div class="story">📖 ${d.story || '아직 알려진 이야기가 없어.'}</div>
      <div class="row" style="color:#999;font-size:13px">상대 속성에 강한 포켓몬을 대표로 하면 피해가 1.5배! (닫기: ✕ 또는 ESC)</div>`;
    this.infoEl.classList.remove('hidden');
    this.infoOpen = true;
    this.sound.click();
  }
  hideInfo() { this.infoEl.classList.add('hidden'); this.infoOpen = false; }

  showFloat(text, color, worldPos = this.targetPoint()) {
    const v = worldPos.project(this.camera);
    this.floatEl.textContent = text;
    this.floatEl.style.color = color;
    const cv = document.getElementById('game');
    const W = cv.clientWidth || window.innerWidth, H = cv.clientHeight || window.innerHeight;
    this.floatEl.style.left = `${((v.x + 1) / 2) * W}px`;
    this.floatEl.style.top = `${((1 - v.y) / 2) * H - 40}px`;
    this.floatEl.classList.remove('hidden');
    this.floatEl.classList.remove('pop'); void this.floatEl.offsetWidth; this.floatEl.classList.add('pop');
    this.floatTimer = 1.0;
  }
  showBanner(text) {
    this.bannerEl.textContent = text;
    this.bannerEl.classList.remove('hidden');
    this.bannerEl.classList.remove('pop'); void this.bannerEl.offsetWidth; this.bannerEl.classList.add('pop');
    this.bannerTimer = 1.6;
  }

  leave() {
    if (!this.active) return;
    if (this.phase === 'success') { this.end('caught'); return; } // 성공 연출은 버튼/키로 바로 넘길 수 있다
    if (this.phase === 'lost') { this.end('lost'); return; }
    if (this.phase === 'escape') { this.end('escaped'); return; }
    if (this.phase !== 'choose' && this.phase !== 'dizzy' && this.phase !== 'enter') return; // 연출 중엔 못 나감
    this.end('later');
  }

  end(result) {
    this.active = false;
    for (const f of this.flying) this.scene.remove(f.mesh);
    this.flying = [];
    if (this.ball) { this.scene.remove(this.ball); this.ball = null; }
    const c = this.creature;
    c.mesh.scale.setScalar(c.data.scale || 1);
    c.mesh.rotation.z = 0;
    c.mesh.visible = true;
    c.mesh.position.copy(this.stageTo);
    const mine = this.member.mesh;
    mine.scale.setScalar(this.mineScale);
    mine.rotation.z = 0;
    mine.visible = true;
    for (const m of this.hidden || []) m.visible = true;
    this.hidden = [];
    for (const l of this.lights || []) this.scene.remove(l);
    this.lights = [];
    if (this.fogFar != null) { this.scene.fog.far = this.fogFar; this.fogFar = null; }
    this.el.classList.add('hidden');
    this.tagEl.classList.add('hidden');
    this.hideInfo();
    this.mineEl.classList.add('hidden');
    document.body.classList.remove('battle');
    this.bannerEl.classList.add('hidden');
    this.floatEl.classList.add('hidden');
    this.closeSwitch(); this.switchBtn.classList.add('hidden');
    this.catchEl.classList.add('hidden');
    this.craftOpen = false; this.craftEl.classList.add('hidden'); this.craftBtn.classList.add('hidden');
    if (this.switched) this.onSwitched?.(this.member, this.firstMember); // 새 포켓몬이 대표로 따라온다
    if (result === 'caught') this.onCaught?.();
    else if (result === 'lost') this.onLost?.();
    else if (result === 'escaped') this.onEscaped?.();
    else this.onLeave?.();
  }

  update(dt) {
    if (!this.active) return;
    const c = this.creature, m = c.mesh, mine = this.member.mesh;
    this.timer += dt;
    mine.rotation.y = this.mineYaw; m.rotation.y = this.enemyYaw; // 서로 마주 보기 (대결 시작 프레임에 따라오기 코드가 덮어쓴 것도 되돌린다)

    // 카메라 & 무대 진입
    const k = 1 - Math.exp(-dt * 5);
    this.camera.position.lerp(this.camPos, k);
    if (this.shakeCam > 0) {
      this.shakeCam -= dt;
      this.camera.position.x += (Math.random() - 0.5) * 0.12;
      this.camera.position.y += (Math.random() - 0.5) * 0.12;
    }
    this.camera.lookAt(this.camLook);
    this.placeTag();
    if (this.infoOpen || this.switchOpen || this.craftOpen) { // 팝업이 열려 있으면 조작은 잠시 멈춘다 (ESC 로 닫기)
      if (this.input.wasPressed('cancel')) { this.hideInfo(); this.closeSwitch(); this.closeCraft(); }
      return;
    }
    if (this.phase === 'enter') {
      const t = Math.min(1, this.timer / 0.6);
      m.position.lerpVectors(this.stageFrom, this.stageTo, easeOut(t));
      m.position.y = this.groundY(m.position.x, m.position.z) + Math.sin(t * Math.PI) * 1.2;
      mine.position.lerpVectors(this.mineFrom, this.mineTo, easeOut(t));
      mine.position.y = this.groundY(mine.position.x, mine.position.z) + Math.sin(t * Math.PI) * 0.8;
      if (t >= 1) { this.phase = 'choose'; this.render(); }
    }

    // 입력: ↑↓←→ 기술 고르기, 엔터/스페이스 사용, 1~4 바로 사용, ESC 나중에
    const unlocked = this.party.skills(this.member);
    if (this.phase === 'choose') {
      if (this.input.wasPressed('right') || this.input.wasPressed('down')) { this.sel = (this.sel + 1) % unlocked.length; this.sound.click(); this.render(); }
      if (this.input.wasPressed('left') || this.input.wasPressed('up')) { this.sel = (this.sel - 1 + unlocked.length) % unlocked.length; this.sound.click(); this.render(); }
      SKILL_KEYS.forEach((key, i) => { if (this.input.wasPressed(key) && unlocked[i]) { this.sel = i; this.useSkill(i); } });
    }
    if (this.input.wasPressed('action') || this.input.wasPressed('jump')) {
      if (this.phase === 'choose') this.useSkill(this.sel);
      else if (this.phase === 'dizzy') this.throwBall(this.bestBall());
      else if (this.phase === 'success') this.end('caught');
      else if (this.phase === 'escape') this.end('escaped');
      else if (this.phase === 'lost') this.end('lost');
    }
    if (this.input.wasPressed('cancel')) this.leave();

    this.whipUpdate(dt);
    // 날아가는 것들 (포물선)
    for (const f of this.flying) {
      f.t += dt / f.dur;
      const t = Math.min(1, f.t);
      f.mesh.position.lerpVectors(f.from, f.to, t);
      f.mesh.position.y += Math.sin(t * Math.PI) * (f.arc ?? 1.6);
      if (f.keepRot) { if (f.spin) f.mesh.rotateX(dt * f.spin); }
      else if (f.kind === 'ball') f.mesh.rotation.x += dt * 9; // 넘버볼은 앞으로 구르듯
      else { f.mesh.rotation.x += dt * 6; f.mesh.rotation.y += dt * 4; }
      if (t >= 1) {
        if (f.kind !== 'ball') this.scene.remove(f.mesh); // 넘버볼은 그대로 남아 상대에게 맞고 튕겨 떨어진다
        f.done = true;
        if (f.kind === 'bolt') this.onBoltHit();
        else if (f.kind === 'ball') this.startCapture();
      }
    }
    this.flying = this.flying.filter((f) => !f.done);

    // 내 포켓몬: 돌진, 맞았을 때 흔들림, 숨쉬기
    const mineGround = this.groundY(this.mineTo.x, this.mineTo.z);
    if (this.phase !== 'enter') {
      mine.position.copy(this.mineTo);
      mine.position.y = mineGround + Math.abs(Math.sin(this.timer * 3)) * 0.05;
      if (this.phase === 'attack') {
        if (this.isWhip()) { // 채찍: 제자리에서 살짝 앞으로 기울며 덩굴을 뻗는다
          const t = Math.min(1, (this.timer - this.phaseStart) / 0.3);
          mine.position.addScaledVector(this.dir, Math.sin(t * Math.PI) * 0.4);
          if (t >= 1) { this.phase = 'bolt'; this.whipStart(); }
        } else if (this.isMelee()) { // 근접: 상대에게 돌진, 가장 가까울 때 피해, 돌아오기
          const t = Math.min(1, (this.timer - this.phaseStart) / 0.62);
          const reach = Math.sin(t * Math.PI);
          mine.position.lerpVectors(this.mineTo, this.stageTo, reach * 0.78);
          mine.position.y = this.groundY(mine.position.x, mine.position.z) + reach * 0.7;
          if (!this.meleeHitDone && t >= 0.5) { this.meleeHitDone = true; this.meleeFx(); this.onBoltHit(); }
          if (t >= 1 && this.phase === 'attack') this.phase = 'choose';
        } else {
          const t = Math.min(1, (this.timer - this.phaseStart) / 0.42);
          mine.position.addScaledVector(this.dir, Math.sin(t * Math.PI) * 1.3);
          mine.position.y += Math.sin(t * Math.PI) * 0.5;
          if (t >= 1) { this.phase = 'bolt'; this.launchBolt(); }
        }
      }
      if (this.mineHurt > 0) {
        this.mineHurt -= dt;
        mine.position.addScaledVector(this.dir, -Math.sin(this.mineHurt * 8) * 0.3);
        mine.rotation.z = Math.sin(this.mineHurt * 40) * 0.15;
      } else mine.rotation.z = 0;
      if (this.phase === 'lost') {
        const t = Math.min(1, (this.timer - this.phaseStart) / 0.6);
        mine.rotation.z = t * Math.PI / 2;
        mine.position.y = mineGround + 0.3 * this.mineScale * t;
        if (this.timer - this.phaseStart > 2.4) this.end('lost');
      }
    }
    tickModel(mine, dt, this.phase === 'attack' ? 'walk' : 'idle');

    // 상대 리액션
    const base = c.data.scale || 1;
    const ground = this.groundY(m.position.x, m.position.z);
    if (this.phase === 'choose' || this.phase === 'attack' || this.phase === 'bolt' || this.phase === 'lost') {
      m.position.copy(this.stageTo);
      m.position.y = ground + Math.abs(Math.sin(this.timer * 4)) * 0.12;
      if (this.squash > 0) { this.squash -= dt; const s = 1 + Math.sin(this.squash * 9) * 0.25; m.scale.set(base * (2 - s), base * s, base * (2 - s)); }
      else m.scale.setScalar(base);
      if (this.phase === 'lost') m.position.y = ground + Math.abs(Math.sin(this.timer * 8)) * 0.5; // 이겼다고 폴짝폴짝
    } else if (this.phase === 'enemyWind') {
      // 반격 준비: 살짝 웅크렸다가
      const t = Math.min(1, (this.timer - this.phaseStart) / 0.55);
      m.position.copy(this.stageTo);
      m.position.y = ground;
      m.scale.set(base * (1 + t * 0.15), base * (1 - t * 0.15), base * (1 + t * 0.15));
      if (t >= 1) { this.phase = 'enemyLunge'; this.phaseStart = this.timer; this.enemyHitDone = false; this.sound.throw_(); }
    } else if (this.phase === 'enemyLunge') {
      // 내 포켓몬 쪽으로 돌진했다가 돌아온다. 가장 가까울 때 피해
      const t = Math.min(1, (this.timer - this.phaseStart) / 0.6);
      const reach = Math.sin(t * Math.PI);
      m.position.lerpVectors(this.stageTo, this.mineTo, reach * 0.75);
      m.position.y = this.groundY(m.position.x, m.position.z) + reach * 0.9;
      m.scale.setScalar(base);
      if (!this.enemyHitDone && t >= 0.5) { this.enemyHitDone = true; this.onEnemyHit(); }
      if (t >= 1) this.afterEnemyTurn();
    } else if (this.phase === 'dizzy' || this.phase === 'ball_fly') {
      m.rotation.z = Math.sin(this.timer * 6) * 0.25;
      m.position.y = ground;
      m.scale.setScalar(base);
    } else if (this.phase === 'capture') {
      // 1) 흡수 (0.65초): 볼은 상대 앞 공중에 멈춰 천천히 돌고, 상대는 빨간 빛이 되어 작아지며 볼 속으로 빨려 들어간다
      // 2) 떨어짐 (0.5초): 볼이 닫히고 포물선으로 앞 땅에 떨어진다 → wobble (흔들림)
      const SUCK = 0.65, DROP = 0.5;
      const el = this.timer - this.captureStart;
      if (el < SUCK) {
        const t = el / SUCK;
        this.ball.position.copy(this.ballHold);
        this.ball.position.y += Math.sin(this.timer * 6) * 0.05; // 공중에 떠서 살짝 흔들
        this.ball.rotation.set(0, this.ballFace + Math.sin(this.timer * 5) * 0.12, 0); // 앞면을 보인 채 살짝 갸웃
        m.scale.setScalar(base * (1 - easeOut(t)));
        m.position.lerp(this.ballHold, Math.min(1, dt * 6));
        if (Math.random() < 0.6) this.particles.stars(this.scene, m.position.clone().add(new THREE.Vector3(0, 0.3 * m.scale.x, 0)), 2, 0xff6a6a, 0.25);
        if (t > 0.9 && m.visible) { m.visible = false; this.particles.stars(this.scene, this.ballHold, 8, 0xffffff, 0.3); this.sound.hit(); ballOnTop(this.ball, false); } // 볼이 닫힌다
      } else {
        const t = Math.min(1, (el - SUCK) / DROP);
        m.visible = false;
        this.ball.position.lerpVectors(this.ballHold, this.ballLand, t);
        this.ball.position.y += Math.sin(t * Math.PI) * 0.6;
        this.ball.rotation.set(0, this.ballFace, 0); // 떨어지는 동안에도 앞면
        if (t >= 1) { this.ball.position.copy(this.ballLand); this.ball.rotation.set(0, this.ballFace, 0); this.phase = 'wobble'; this.wobbleStart = this.timer; this.wobbles = 0; this.sound.bounce(); }
      }
    } else if (this.phase === 'wobble') {
      const bt = this.timer - this.wobbleStart;
      // 공이 땅에 떨어진 뒤 0.55초마다 흔들림 (총 3번), 그다음 잡혔는지 판정
      const groundY = this.groundY(this.ball.position.x, this.ball.position.z) + 0.32;
      this.ball.position.y += (groundY - this.ball.position.y) * Math.min(1, dt * 6);
      const idx = Math.floor((bt - 0.3) / 0.55);
      const local = ((bt - 0.3) % 0.55) / 0.55;
      this.ball.rotation.y = this.ballFace ?? 0;
      if (bt > 0.3 && idx < 3) {
        this.ball.rotation.z = Math.sin(local * Math.PI * 2) * 0.55 * (1 - local);
        if (idx > this.wobbles - 1 && local < 0.05) { this.wobbles = idx + 1; this.sound.bounce(); }
      } else this.ball.rotation.z = 0;
      if (bt > 0.3 + 3 * 0.55 + 0.35) {
        const pct = this.chanceFor(this.ballSpec?.tier || 1);
        if (this.catchRoll == null) this.catchRoll = Math.random() * 100;
        if (this.catchRoll < pct) this.startSuccess(); else this.startEscape();
      }
    } else if (this.phase === 'escape') { // 볼이 열리고 튀어나와 달아난다
      const t = Math.min(1, (this.timer - this.escapeStart) / 1.4);
      m.visible = true;
      m.scale.setScalar(base * Math.min(1, t * 3));
      m.position.copy(this.stageTo).addScaledVector(this.dir, t * 9);
      m.position.y = this.groundY(m.position.x, m.position.z) + Math.abs(Math.sin(t * 14)) * 0.6;
      m.rotation.z = 0;
      if (this.timer - this.escapeStart > 1.7) this.end('escaped');
    } else if (this.phase === 'success') {
      m.visible = false; // 상대는 볼 안에 있다 (잡았다 팝업에 그림으로 나온다)
      if (this.ball) { // 볼은 땅에 그대로, 반짝이며 살짝 튄다
        const groundY = this.groundY(this.ball.position.x, this.ball.position.z) + 0.32;
        this.ball.position.y = groundY + Math.abs(Math.sin((this.timer - this.successStart) * 9)) * 0.18 * Math.max(0, 1 - (this.timer - this.successStart));
        this.ball.rotation.z = 0;
        if (Math.random() < 0.25) this.particles.stars(this.scene, this.ball.position.clone().add(new THREE.Vector3(0, 0.4, 0)), 2, 0xffd93d, 0.3);
      }
      mine.position.y = mineGround + Math.abs(Math.sin(this.timer * 8)) * 0.4; // 내 포켓몬은 기뻐서 폴짝폴짝
      if (this.timer - this.successStart > 0.9 && !this.catchShown) this.showCatchPopup(); // 잠깐 기뻐한 뒤 "잡았다!" 팝업 (버튼을 눌러야 끝난다)
    }
    if (this.phase !== 'enter') tickModel(m, dt, 'idle');

    // 플로팅 텍스트/배너 타이머
    if (this.floatTimer > 0) { this.floatTimer -= dt; if (this.floatTimer <= 0) this.floatEl.classList.add('hidden'); }
    if (this.bannerTimer > 0) { this.bannerTimer -= dt; if (this.bannerTimer <= 0) this.bannerEl.classList.add('hidden'); }
  }

  startCapture() { // 볼이 상대에게 맞았다: 상대 앞 공중에 멈춰 열리고, 상대가 빛이 되어 빨려 들어간 뒤 닫혀서 앞 땅에 떨어진다
    this.phase = 'capture';
    this.captureStart = this.timer;
    this.catchRoll = null;
    this.ballHit = this.targetPoint();
    this.ballHold = this.ballHit.clone().addScaledVector(this.dir, -(0.6 + 0.35 * (this.creature.data.scale || 1))); // 상대 몸 바로 앞 (몸에 안 가려지게)
    this.ballHold.y = Math.max(this.ballHold.y, this.groundY(this.ballHold.x, this.ballHold.z) + 0.9);
    this.ball.position.copy(this.ballHold);
    this.ballFace = Math.atan2(-this.dir.x, -this.dir.z); // 볼 앞면(버튼)이 카메라(내 쪽)를 보게
    this.ball.rotation.set(0, this.ballFace, 0);
    ballOnTop(this.ball, true); // 흡수되는 동안 상대가 볼 위로 겹쳐도 볼이 보이게
    this.ballLand = new THREE.Vector3().copy(this.stageTo).addScaledVector(this.dir, -1.9);
    this.ballLand.y = this.groundY(this.ballLand.x, this.ballLand.z) + 0.32;
    this.sound.hit();
    this.particles.stars(this.scene, this.ball.position, 14, 0xffffff, 0.35);
    this.showFloat('탁!', '#fff', this.ballHit);
  }

  startEscape() {
    this.phase = 'escape';
    this.escapeStart = this.timer;
    const c = this.creature;
    c.mesh.position.copy(this.ball.position);
    this.particles.stars(this.scene, this.ball.position, 16, 0xffffff, 0.5);
    this.particles.cubes(this.scene, this.ball.position, 8, this.ballSpec?.color || 0xffffff);
    this.scene.remove(this.ball); this.ball = null;
    this.sound.bounce();
    c.catchBonus = (c.catchBonus || 0) + RETRY_BONUS;
    this.showBanner('앗, 도망쳤다!');
    this.msgEl.textContent = `${c.data.name}이(가) ${this.ballSpec?.name || '넘버볼'}에서 튀어나왔어! 다시 도전하면 잡힐 확률이 ${RETRY_BONUS}% 올라가.`;
    this.runBtn.textContent = '돌아가기 ▶';
  }
  showCatchPopup() {
    this.catchShown = true;
    const d = this.creature.data;
    const img = this.thumb ? this.thumb(d) : null;
    const imgEl = document.getElementById('catch-img');
    if (img) { imgEl.src = img; imgEl.hidden = false; } else imgEl.hidden = true;
    document.getElementById('catch-name').textContent = `${d.boss ? '보스 ' : ''}${d.name}`;
    document.getElementById('catch-sub').textContent = `${d.type} 속성 · ❤ ${d.baseHp} · ⚔ ${d.baseAtk} · 친구가 됐어!`;
    this.catchEl.classList.remove('hidden');
  }
  startSuccess() {
    this.phase = 'success';
    this.successStart = this.timer;
    this.catchShown = false;
    const c = this.creature;
    c.mesh.position.copy(this.ball.position);
    c.mesh.position.y = this.groundY(c.mesh.position.x, c.mesh.position.z);
    const at = this.ball.position.clone().add(new THREE.Vector3(0, 0.4, 0)); // 볼은 땅에 남겨 두고(대결이 끝날 때 치운다) 그 둘레에서 축하
    this.particles.stars(this.scene, at, 28, 0xffd93d);
    this.particles.stars(this.scene, at, 16, colorForCount(c.data.favoriteNumber || c.data.baseHp));
    this.confetti.burst(160);
    this.sound.fanfare();
    this.showBanner(`잡았다! ${c.data.name}!`);
    this.msgEl.textContent = `${c.data.name}이(가) 친구가 되었어요! 도감에서 대표로 고를 수 있어.`;
    this.runBtn.textContent = '계속하기 ▶';
    this.runBtn.classList.add('primary');
  }
}
