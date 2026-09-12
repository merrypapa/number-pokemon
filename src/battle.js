import * as THREE from 'three';
import { colorForCount } from './palette.js';
import { terrainHeight } from './world.js';
import { tickModel } from './models.js';

// 대결 장면 (포켓몬 배틀 느낌, 턴제):
//  1) 카메라가 주인공 어깨 뒤로 내려가고, 내 대표 포켓몬이 앞으로 나가 상대 몬스터를 마주 본다
//  2) 기술을 고르면 내 포켓몬이 돌진 → 빛덩이가 날아가 상대 체력을 (공격력 × 기술 배수) 만큼 깎는다
//  3) 상대가 살아 있으면 반격해서 내 체력을 상대 공격력만큼 깎는다. 내 체력이 0이면 진다
//  4) 상대 체력이 0이면 어질어질 → 숫자볼을 던져 잡는다 (볼이 흔들리고 "잡았다!")
const easeOut = (t) => 1 - Math.pow(1 - t, 3);
const SKILL_KEYS = ['skill1', 'skill2', 'skill3', 'skill4'];

function makeBall(color) {
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
    this.nameEl = document.getElementById('battle-name');
    this.hpEl = document.getElementById('battle-hp');
    this.hpNumEl = document.getElementById('battle-hpnum');
    this.mineNameEl = document.getElementById('battle-mine-name');
    this.mineHpEl = document.getElementById('battle-mine-hp');
    this.mineHpNumEl = document.getElementById('battle-mine-hpnum');
    this.mineAtkEl = document.getElementById('battle-mine-atk');
    this.skillsEl = document.getElementById('battle-skills');
    this.msgEl = document.getElementById('battle-msg');
    this.bannerEl = document.getElementById('battle-banner');
    this.floatEl = document.getElementById('battle-float');
    this.ballBtn = document.getElementById('btn-ball');
    this.runBtn = document.getElementById('btn-run');
    this.ballBtn.onclick = () => this.throwBall();
    this.runBtn.onclick = () => this.leave();
    this.flying = [];
    this.sel = 0;
  }

  start({ creature, player, scene, member, onCaught, onLeave, onLost, hideMeshes = [], decor = null }) {
    Object.assign(this, { creature, player, scene, member, onCaught, onLeave, onLost, decor });
    this.active = true;
    this.phase = 'enter';
    this.timer = 0;
    this.wobbles = 0;
    this.sel = 0;
    this.skill = null;
    this.shakeCam = 0;
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
    this.stageTo.y = terrainHeight(this.stageTo.x, this.stageTo.z);
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
    this.mineTo.y = terrainHeight(this.mineTo.x, this.mineTo.z);
    this.mineScale = this.party.species(member).scale || 1;
    mine.rotation.set(0, Math.atan2(dir.x, dir.z), 0);
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

    this.nameEl.textContent = (creature.isBoss ? '보스 ' : '') + creature.data.name;
    this.nameEl.style.color = colorForCount(creature.data.favoriteNumber || creature.data.baseHp);
    const myName = this.party.name(member);
    this.msgEl.textContent = creature.hp === creature.data.baseHp
      ? `${creature.data.name}의 체력은 ${creature.hp}, 공격력은 ${creature.data.baseAtk}! 가라, ${myName}!`
      : `체력이 ${creature.hp} 남아 있어. 이어서 싸우자, ${myName}!`;
    if (member.hp <= creature.data.baseAtk) this.msgEl.textContent += ` (조심해! 내 체력이 ${member.hp}밖에 없어)`;
    this.ballBtn.classList.add('hidden');
    this.bannerEl.classList.add('hidden');
    this.runBtn.textContent = '나중에';
    this.runBtn.classList.remove('primary');
    this.render();
    this.el.classList.remove('hidden');
  }

  cubes(el, total, now, color) {
    el.innerHTML = '';
    el.classList.toggle('many', total > 16);
    for (let i = 0; i < total; i++) {
      const cube = document.createElement('span');
      cube.className = 'hp-cube' + (i >= now ? ' gone' : '');
      cube.style.background = color;
      el.appendChild(cube);
    }
  }

  render() {
    const c = this.creature, m = this.member;
    this.cubes(this.hpEl, c.data.baseHp, c.hp, colorForCount(c.data.favoriteNumber || c.data.baseHp));
    this.hpNumEl.textContent = `체력 ${c.hp} · 공격 ${c.data.baseAtk}`;
    this.mineNameEl.textContent = this.party.name(m);
    this.mineNameEl.style.color = this.party.color(m);
    this.cubes(this.mineHpEl, m.maxHp, Math.max(0, m.hp), this.party.color(m));
    this.mineHpNumEl.textContent = `체력 ${Math.max(0, m.hp)}/${m.maxHp}`;
    this.mineAtkEl.textContent = `공격 ${m.atk}`;

    // 기술 버튼: 열린 기술은 이름 + 피해, 아직 안 열린 다음 기술은 잠금 표시
    this.skillsEl.innerHTML = '';
    const unlocked = this.party.skills(m);
    this.sel = Math.max(0, Math.min(this.sel, unlocked.length - 1));
    const choosing = this.phase === 'choose';
    unlocked.forEach((s, i) => {
      const b = document.createElement('button');
      b.className = 'skill' + (i === this.sel ? ' sel' : '');
      b.innerHTML = `<span class="skill-name">${s.name}</span><span class="skill-dmg">-${this.party.damage(m, s)}</span>`;
      b.disabled = !choosing;
      b.onclick = () => { this.sel = i; this.useSkill(i); };
      this.skillsEl.appendChild(b);
    });
    const next = this.party.nextSkill(m);
    if (next) {
      const b = document.createElement('button');
      b.className = 'skill locked';
      b.innerHTML = `<span class="skill-name">🔒 ${next.name}</span><span class="skill-dmg">공격 ${next.atk}이면!</span>`;
      b.disabled = true;
      this.skillsEl.appendChild(b);
    }
  }

  // ----- 내 공격 -----
  useSkill(i) {
    if (this.phase !== 'choose') return;
    const skill = this.party.skills(this.member)[i];
    if (!skill) return;
    this.skill = skill;
    this.phase = 'attack';
    this.phaseStart = this.timer;
    this.msgEl.textContent = `${this.party.name(this.member)}의 ${skill.name}!`;
    this.sound.throw_();
    this.render();
  }

  targetPoint() {
    const c = this.creature;
    return c.mesh.position.clone().add(new THREE.Vector3(0, 0.7 * (c.data.scale || 1), 0));
  }
  minePoint() { return this.member.mesh.position.clone().add(new THREE.Vector3(0, 0.6 * this.mineScale, 0)); }

  launchBolt() {
    const color = new THREE.Color(this.party.color(this.member));
    const bolt = makeBolt(color, 0.8 + (this.skill.power || 1) * 0.4);
    const from = this.minePoint().addScaledVector(this.dir, 0.4);
    this.scene.add(bolt);
    this.flying.push({ mesh: bolt, from, to: this.targetPoint(), t: 0, dur: 0.38, kind: 'bolt', arc: 0.6 });
    this.particles.stars(this.scene, from, 6, color.getHex(), 0.3);
  }

  onBoltHit() {
    const c = this.creature;
    const dmg = this.party.damage(this.member, this.skill);
    const hitPos = this.targetPoint();
    c.hp = Math.max(0, c.hp - dmg);
    this.sound.hit();
    this.particles.cubes(this.scene, hitPos, 8 + Math.min(12, dmg), new THREE.Color(this.party.color(this.member)).getHex());
    this.showFloat(`-${dmg}`, this.party.color(this.member), hitPos);
    this.squash = 0.35;
    this.shakeCam = 0.15;
    if (c.hp === 0) {
      this.phase = 'dizzy';
      this.msgEl.textContent = `체력 0! ${c.data.name}이(가) 어질어질해. 지금 숫자볼을 던지자!`;
      this.showBanner('쓰러뜨렸다!');
      this.ballBtn.classList.remove('hidden');
      this.particles.stars(this.scene, hitPos, 12, 0xffd93d);
    } else {
      this.phase = 'enemyWind';
      this.phaseStart = this.timer;
      this.msgEl.textContent = `${c.data.name}의 체력이 ${c.hp} 남았어! ${c.data.name}의 공격!`;
    }
    this.render();
  }

  // ----- 상대의 반격 -----
  onEnemyHit() {
    const c = this.creature, m = this.member;
    const dmg = c.data.baseAtk;
    m.hp = Math.max(0, m.hp - dmg);
    const pos = this.minePoint();
    this.sound.hit();
    this.particles.cubes(this.scene, pos, 8, colorForCount(c.data.favoriteNumber || c.data.baseHp));
    this.showFloat(`-${dmg}`, '#c0392b', pos);
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
      this.msgEl.textContent = `${this.party.name(m)}이(가) 쓰러졌어… 체력이 기본으로 돌아가. 블록을 모아서 다시 키우자!`;
      this.runBtn.textContent = '돌아가기 ▶';
      this.runBtn.classList.add('primary');
      this.sound.bounce();
    } else {
      this.phase = 'choose';
      this.msgEl.textContent = `${c.data.name} 체력 ${c.hp}, 내 체력 ${m.hp}. 다음 기술을 고르자!`;
    }
    this.render();
  }

  // ----- 숫자볼 던지기 -----
  throwBall() {
    if (this.phase !== 'dizzy') return;
    const ball = makeBall(colorForCount(this.creature.data.favoriteNumber || this.creature.data.baseHp));
    const from = this.throwFrom.clone();
    this.scene.add(ball);
    this.flying.push({ mesh: ball, from, to: this.targetPoint(), t: 0, dur: 0.7, kind: 'ball', arc: 1.6 });
    this.ball = ball;
    this.phase = 'ball_fly';
    this.ballBtn.classList.add('hidden');
    this.sound.throw_();
  }

  showFloat(text, color, worldPos = this.targetPoint()) {
    const v = worldPos.project(this.camera);
    this.floatEl.textContent = text;
    this.floatEl.style.color = color;
    this.floatEl.style.left = `${((v.x + 1) / 2) * window.innerWidth}px`;
    this.floatEl.style.top = `${((1 - v.y) / 2) * window.innerHeight - 40}px`;
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
    this.bannerEl.classList.add('hidden');
    this.floatEl.classList.add('hidden');
    if (result === 'caught') this.onCaught?.();
    else if (result === 'lost') this.onLost?.();
    else this.onLeave?.();
  }

  update(dt) {
    if (!this.active) return;
    const c = this.creature, m = c.mesh, mine = this.member.mesh;
    this.timer += dt;

    // 카메라 & 무대 진입
    const k = 1 - Math.exp(-dt * 5);
    this.camera.position.lerp(this.camPos, k);
    if (this.shakeCam > 0) {
      this.shakeCam -= dt;
      this.camera.position.x += (Math.random() - 0.5) * 0.12;
      this.camera.position.y += (Math.random() - 0.5) * 0.12;
    }
    this.camera.lookAt(this.camLook);
    if (this.phase === 'enter') {
      const t = Math.min(1, this.timer / 0.6);
      m.position.lerpVectors(this.stageFrom, this.stageTo, easeOut(t));
      m.position.y = terrainHeight(m.position.x, m.position.z) + Math.sin(t * Math.PI) * 1.2;
      mine.position.lerpVectors(this.mineFrom, this.mineTo, easeOut(t));
      mine.position.y = terrainHeight(mine.position.x, mine.position.z) + Math.sin(t * Math.PI) * 0.8;
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
      else if (this.phase === 'dizzy') this.throwBall();
      else if (this.phase === 'success') this.end('caught');
      else if (this.phase === 'lost') this.end('lost');
    }
    if (this.input.wasPressed('cancel')) this.leave();

    // 날아가는 것들 (포물선)
    for (const f of this.flying) {
      f.t += dt / f.dur;
      const t = Math.min(1, f.t);
      f.mesh.position.lerpVectors(f.from, f.to, t);
      f.mesh.position.y += Math.sin(t * Math.PI) * (f.arc ?? 1.6);
      f.mesh.rotation.x += dt * 6; f.mesh.rotation.y += dt * 4;
      if (t >= 1) {
        this.scene.remove(f.mesh);
        f.done = true;
        if (f.kind === 'bolt') this.onBoltHit();
        else if (f.kind === 'ball') this.startCapture();
      }
    }
    this.flying = this.flying.filter((f) => !f.done);

    // 내 포켓몬: 돌진, 맞았을 때 흔들림, 숨쉬기
    const mineGround = terrainHeight(this.mineTo.x, this.mineTo.z);
    if (this.phase !== 'enter') {
      mine.position.copy(this.mineTo);
      mine.position.y = mineGround + Math.abs(Math.sin(this.timer * 3)) * 0.05;
      if (this.phase === 'attack') {
        const t = Math.min(1, (this.timer - this.phaseStart) / 0.42);
        mine.position.addScaledVector(this.dir, Math.sin(t * Math.PI) * 1.3);
        mine.position.y += Math.sin(t * Math.PI) * 0.5;
        if (t >= 1) { this.phase = 'bolt'; this.launchBolt(); }
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
    const ground = terrainHeight(m.position.x, m.position.z);
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
      m.position.y = terrainHeight(m.position.x, m.position.z) + reach * 0.9;
      m.scale.setScalar(base);
      if (!this.enemyHitDone && t >= 0.5) { this.enemyHitDone = true; this.onEnemyHit(); }
      if (t >= 1) this.afterEnemyTurn();
    } else if (this.phase === 'dizzy' || this.phase === 'ball_fly') {
      m.rotation.z = Math.sin(this.timer * 6) * 0.25;
      m.position.y = ground;
      m.scale.setScalar(base);
    } else if (this.phase === 'capture') {
      const t = Math.min(1, (this.timer - this.captureStart) / 0.45);
      m.scale.setScalar(base * (1 - easeOut(t)));
      m.position.lerp(this.ball.position, 0.2);
      this.ball.rotation.y += dt * 10;
      if (t >= 1) { m.visible = false; this.phase = 'wobble'; this.wobbleStart = this.timer; this.wobbles = 0; }
    } else if (this.phase === 'wobble') {
      const bt = this.timer - this.wobbleStart;
      // 공이 땅에 떨어진 뒤 0.5초마다 흔들림 (총 2번)
      const groundY = terrainHeight(this.ball.position.x, this.ball.position.z) + 0.32;
      this.ball.position.y += (groundY - this.ball.position.y) * Math.min(1, dt * 6);
      const idx = Math.floor((bt - 0.25) / 0.5);
      const local = ((bt - 0.25) % 0.5) / 0.5;
      if (bt > 0.25 && idx < 2) {
        this.ball.rotation.z = Math.sin(local * Math.PI * 2) * 0.5 * (1 - local);
        if (idx > this.wobbles - 1 && local < 0.05) { this.wobbles = idx + 1; this.sound.bounce(); }
      } else this.ball.rotation.z = 0;
      if (bt > 0.25 + 2 * 0.5 + 0.25) this.startSuccess();
    } else if (this.phase === 'success') {
      const t = Math.min(1, (this.timer - this.successStart) / 0.5);
      m.visible = true;
      m.scale.setScalar(base * easeOut(t));
      m.position.y = ground + Math.abs(Math.sin(this.timer * 8)) * 0.5;
      m.rotation.z = 0;
      mine.position.y = mineGround + Math.abs(Math.sin(this.timer * 8)) * 0.4; // 내 포켓몬도 같이 기뻐한다
      if (this.timer - this.successStart > 1.3) this.end('caught');
    }
    if (this.phase !== 'enter') tickModel(m, dt, 'idle');

    // 플로팅 텍스트/배너 타이머
    if (this.floatTimer > 0) { this.floatTimer -= dt; if (this.floatTimer <= 0) this.floatEl.classList.add('hidden'); }
    if (this.bannerTimer > 0) { this.bannerTimer -= dt; if (this.bannerTimer <= 0) this.bannerEl.classList.add('hidden'); }
  }

  startCapture() {
    this.phase = 'capture';
    this.captureStart = this.timer;
    this.ball.position.copy(this.targetPoint());
    this.sound.click();
    this.particles.stars(this.scene, this.ball.position, 10, 0x9fe8ff);
  }

  startSuccess() {
    this.phase = 'success';
    this.successStart = this.timer;
    const c = this.creature;
    c.mesh.position.copy(this.ball.position);
    c.mesh.position.y = terrainHeight(c.mesh.position.x, c.mesh.position.z);
    this.scene.remove(this.ball); this.ball = null;
    this.particles.stars(this.scene, this.targetPoint(), 28, 0xffd93d);
    this.particles.stars(this.scene, this.targetPoint(), 16, colorForCount(c.data.favoriteNumber || c.data.baseHp));
    this.confetti.burst(160);
    this.sound.fanfare();
    this.showBanner(`잡았다! ${c.data.name}!`);
    this.msgEl.textContent = `${c.data.name}이(가) 친구가 되었어요! 도감(B)에서 대표로 고를 수 있어.`;
    this.runBtn.textContent = '계속하기 ▶';
    this.runBtn.classList.add('primary');
  }
}
