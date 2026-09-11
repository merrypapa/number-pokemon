import * as THREE from 'three';
import { colorForCount, NUMBER_COLORS } from './palette.js';
import { buildNumberblockMesh } from './numberblocks.js';
import { terrainHeight } from './world.js';

// 전투 장면 (포켓몬 GO 느낌):
//  1) 카메라가 주인공 어깨 뒤로 내려가 몬스터를 마주 본다
//  2) 숫자블록을 n개 던지면 몬스터 체력(= 좋아하는 숫자)이 n 만큼 깎인다. 딱 0이 되어야 한다(너무 많으면 튕겨 나옴)
//  3) 체력이 0이면 숫자볼을 던져 캡처한다 (볼이 3번 흔들리고 "잡았다!")
const easeOut = (t) => 1 - Math.pow(1 - t, 3);

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

export class Battle {
  constructor({ input, camera, say, sound, particles, confetti }) {
    Object.assign(this, { input, camera, say, sound, particles, confetti });
    this.active = false;
    this.el = document.getElementById('battle');
    this.nameEl = document.getElementById('battle-name');
    this.hpEl = document.getElementById('battle-hp');
    this.hpNumEl = document.getElementById('battle-hpnum');
    this.mineEl = document.getElementById('battle-mine');
    this.nEl = document.getElementById('battle-n');
    this.msgEl = document.getElementById('battle-msg');
    this.bannerEl = document.getElementById('battle-banner');
    this.floatEl = document.getElementById('battle-float');
    this.throwBtn = document.getElementById('btn-throw');
    this.ballBtn = document.getElementById('btn-ball');
    this.runBtn = document.getElementById('btn-run');
    document.getElementById('btn-n-minus').onclick = () => this.changeN(-1);
    document.getElementById('btn-n-plus').onclick = () => this.changeN(1);
    this.throwBtn.onclick = () => this.throwBlocks();
    this.ballBtn.onclick = () => this.throwBall();
    this.runBtn.onclick = () => this.leave();
    this.flying = [];
  }

  start({ creature, player, scene, blocksOwned, onThrow, onCaught, onLeave, party = [], decor = null }) {
    Object.assign(this, { creature, player, scene, blocksOwned, onThrow, onCaught, onLeave, party, decor });
    this.active = true;
    this.phase = 'enter';
    this.timer = 0;
    this.wobbles = 0;
    if (creature.hp == null) creature.hp = creature.data.favoriteNumber;
    this.input.endFrame();
    this.sound.ensure();

    // 무대: 몬스터를 주인공 앞 일정 거리에 세우고 서로 마주 보게
    const m = creature.mesh.position, p = player.position;
    const dir = new THREE.Vector3(m.x - p.x, 0, m.z - p.z);
    if (dir.lengthSq() < 0.01) dir.set(0, 0, -1);
    dir.normalize();
    const dist = 4.2 + (creature.data.scale || 1) * 0.8;
    this.stageFrom = m.clone();
    this.stageTo = new THREE.Vector3(p.x + dir.x * dist, 0, p.z + dir.z * dist);
    this.stageTo.y = terrainHeight(this.stageTo.x, this.stageTo.z);
    creature.mesh.rotation.y = Math.atan2(-dir.x, -dir.z);
    player.facing = Math.atan2(dir.x, dir.z);
    player.group.rotation.y = player.facing;
    this.dir = dir;
    const right = new THREE.Vector3(dir.z, 0, -dir.x);
    // 주인공 시점: 눈높이에서 몬스터를 마주 본다. 주인공과 뒤따르던 친구들은 전투 동안 숨긴다.
    this.camPos = new THREE.Vector3().copy(p).addScaledVector(dir, -0.4);
    this.camPos.y = p.y + 1.55;
    this.camLook = new THREE.Vector3(this.stageTo.x, this.stageTo.y + 0.8 * (creature.data.scale || 1), this.stageTo.z);
    this.throwFrom = new THREE.Vector3().copy(this.camPos).addScaledVector(dir, 0.9).addScaledVector(right, 0.35);
    this.throwFrom.y -= 0.45;
    this.hidden = [];
    for (const m of [player.group, ...party]) { if (m.visible) { m.visible = false; this.hidden.push(m); } }
    // 주인공을 숨기면 등불도 꺼지므로 전투 동안 카메라 자리에 같은 등불을 켠다 (동굴)
    if (player.lamp && player.lamp.intensity > 0) {
      this.lampLight = new THREE.PointLight(0xffd9a0, player.lamp.intensity, player.lamp.distance);
      this.lampLight.position.copy(this.camPos);
      scene.add(this.lampLight);
    }
    // 카메라와 몬스터 사이 통로에 있는 나무·바위·풀숲 숨기기
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

    this.n = Math.max(1, Math.min(creature.hp, blocksOwned));
    this.nameEl.textContent = (creature.isBoss ? '보스 ' : '') + creature.data.name;
    this.nameEl.style.color = colorForCount(creature.data.favoriteNumber);
    this.msgEl.textContent = creature.hp === creature.data.favoriteNumber
      ? `${creature.data.name}의 체력은 ${creature.hp}! 블록을 던져서 딱 0으로 만들자.`
      : `체력이 ${creature.hp} 남아 있어. 이어서 던지자!`;
    this.ballBtn.classList.add('hidden');
    this.bannerEl.classList.add('hidden');
    this.render();
    this.el.classList.remove('hidden');
  }

  setBlocks(n) { this.blocksOwned = n; this.render(); }

  render() {
    const c = this.creature;
    this.hpEl.innerHTML = '';
    for (let i = 0; i < c.data.favoriteNumber; i++) {
      const cube = document.createElement('span');
      cube.className = 'hp-cube' + (i >= c.hp ? ' gone' : '');
      cube.style.background = colorForCount(c.data.favoriteNumber);
      this.hpEl.appendChild(cube);
    }
    this.hpNumEl.textContent = `체력 ${c.hp}`;
    this.mineEl.textContent = `내 블록 ${this.blocksOwned}개`;
    this.n = Math.max(0, Math.min(this.n, this.blocksOwned, 20));
    if (this.n === 0 && this.blocksOwned > 0) this.n = 1;
    this.nEl.textContent = this.n;
    this.nEl.style.color = colorForCount(this.n);
    this.throwBtn.textContent = `블록 ${this.n}개 던지기!`;
    const canThrow = this.phase === 'choose' && this.blocksOwned > 0 && c.hp > 0;
    this.throwBtn.disabled = !canThrow;
    this.runBtn.textContent = this.blocksOwned === 0 && c.hp > 0 ? '블록 주우러 가기' : '나중에';
    this.runBtn.classList.toggle('primary', this.blocksOwned === 0 && c.hp > 0);
  }

  changeN(d) {
    if (this.phase !== 'choose') return;
    this.n = Math.max(1, Math.min(this.blocksOwned, this.n + d));
    this.sound.click();
    this.render();
  }

  // ----- 블록 던지기 -----
  throwBlocks() {
    if (this.phase !== 'choose' || this.blocksOwned <= 0 || this.n <= 0) return;
    const n = this.n;
    const mesh = buildNumberblockMesh({ number: n });
    mesh.scale.setScalar(0.7);
    const from = this.throwFrom.clone();
    const to = this.targetPoint();
    this.scene.add(mesh);
    this.flying.push({ mesh, from, to, t: 0, dur: 0.65, kind: 'block', n });
    this.phase = 'throwing';
    this.sound.throw_();
    this.render();
  }

  targetPoint() {
    const c = this.creature;
    return c.mesh.position.clone().add(new THREE.Vector3(0, 0.7 * (c.data.scale || 1), 0));
  }

  onBlockHit(n) {
    const c = this.creature;
    const hitPos = this.targetPoint();
    if (n > c.hp) {
      // 너무 많으면 튕겨 나와 돌아온다 (블록은 그대로)
      this.sound.bounce();
      this.showFloat('너무 많아!', '#c0392b');
      this.msgEl.textContent = `너무 많아! 체력이 ${c.hp} 남았으니 ${c.hp}개만 던지자.`;
      const back = buildNumberblockMesh({ number: n });
      back.scale.setScalar(0.7);
      this.scene.add(back);
      this.flying.push({ mesh: back, from: hitPos, to: this.throwFrom.clone(), t: 0, dur: 0.6, kind: 'return' });
      this.shake = 0.3;
      return;
    }
    c.hp -= n;
    this.onThrow?.(n);
    this.sound.hit();
    this.particles.cubes(this.scene, hitPos, 8 + n * 2, colorForCount(n));
    this.showFloat(`-${n}`, colorForCount(n));
    this.squash = 0.35;
    if (c.hp === 0) {
      this.phase = 'dizzy';
      this.msgEl.textContent = `딱 0! ${c.data.name}이(가) 어질어질해. 지금 숫자볼을 던지자!`;
      this.showBanner('딱 맞았다!');
      this.ballBtn.classList.remove('hidden');
      this.particles.stars(this.scene, hitPos, 12, 0xffd93d);
    } else {
      this.phase = 'choose';
      this.msgEl.textContent = `체력이 ${c.hp} 남았어!`;
      this.n = Math.min(c.hp, this.blocksOwned);
    }
    this.render();
  }

  // ----- 숫자볼 던지기 -----
  throwBall() {
    if (this.phase !== 'dizzy') return;
    const ball = makeBall(colorForCount(this.creature.data.favoriteNumber));
    const from = this.throwFrom.clone();
    this.scene.add(ball);
    this.flying.push({ mesh: ball, from, to: this.targetPoint(), t: 0, dur: 0.7, kind: 'ball' });
    this.ball = ball;
    this.phase = 'ball_fly';
    this.ballBtn.classList.add('hidden');
    this.sound.throw_();
  }

  showFloat(text, color) {
    const v = this.targetPoint().project(this.camera);
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
    if (!this.active || this.phase === 'capture' || this.phase === 'wobble') return;
    if (this.phase === 'success') { this.end('caught'); return; } // 성공 연출은 버튼/키로 바로 넘길 수 있다
    this.end('later');
  }

  end(result) {
    this.active = false;
    for (const f of this.flying) this.scene.remove(f.mesh);
    this.flying = [];
    if (this.ball) { this.scene.remove(this.ball); this.ball = null; }
    this.creature.mesh.scale.setScalar(this.creature.data.scale || 1);
    this.creature.mesh.rotation.z = 0;
    this.creature.mesh.visible = true;
    for (const m of this.hidden || []) m.visible = true;
    this.hidden = [];
    if (this.lampLight) { this.scene.remove(this.lampLight); this.lampLight = null; }
    this.el.classList.add('hidden');
    this.bannerEl.classList.add('hidden');
    this.floatEl.classList.add('hidden');
    if (result === 'caught') this.onCaught?.(); else this.onLeave?.();
  }

  update(dt) {
    if (!this.active) return;
    const c = this.creature, m = c.mesh;
    this.timer += dt;

    // 카메라 & 무대 진입
    const k = 1 - Math.exp(-dt * 5);
    this.camera.position.lerp(this.camPos, k);
    this.camera.lookAt(this.camLook);
    if (this.phase === 'enter') {
      const t = Math.min(1, this.timer / 0.6);
      m.position.lerpVectors(this.stageFrom, this.stageTo, easeOut(t));
      m.position.y = terrainHeight(m.position.x, m.position.z) + Math.sin(t * Math.PI) * 1.2;
      if (t >= 1) { this.phase = 'choose'; this.render(); }
    }

    // 입력
    if (this.input.wasPressed('up') || this.input.wasPressed('right')) this.changeN(1);
    if (this.input.wasPressed('down') || this.input.wasPressed('left')) this.changeN(-1);
    if (this.input.wasPressed('action') || this.input.wasPressed('jump')) {
      if (this.phase === 'choose') this.throwBlocks();
      else if (this.phase === 'dizzy') this.throwBall();
      else if (this.phase === 'success') this.end('caught');
    }
    if (this.input.wasPressed('cancel')) this.leave();

    // 날아가는 것들 (포물선)
    for (const f of this.flying) {
      f.t += dt / f.dur;
      const t = Math.min(1, f.t);
      f.mesh.position.lerpVectors(f.from, f.to, t);
      f.mesh.position.y += Math.sin(t * Math.PI) * 1.6;
      f.mesh.rotation.x += dt * 6; f.mesh.rotation.y += dt * 4;
      if (t >= 1) {
        this.scene.remove(f.mesh);
        f.done = true;
        if (f.kind === 'block') this.onBlockHit(f.n);
        else if (f.kind === 'return') { this.phase = 'choose'; this.render(); }
        else if (f.kind === 'ball') this.startCapture();
      }
    }
    this.flying = this.flying.filter((f) => !f.done);

    // 몬스터 리액션
    const base = c.data.scale || 1;
    const ground = terrainHeight(m.position.x, m.position.z);
    if (this.phase === 'choose' || this.phase === 'throwing') {
      m.position.y = ground + Math.abs(Math.sin(this.timer * 4)) * 0.12;
      if (this.squash > 0) { this.squash -= dt; const s = 1 + Math.sin(this.squash * 9) * 0.25; m.scale.set(base * (2 - s), base * s, base * (2 - s)); }
      else m.scale.setScalar(base);
      if (this.shake > 0) { this.shake -= dt; m.position.x += Math.sin(this.shake * 60) * 0.08; }
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
      if (this.timer - this.successStart > 1.3) this.end('caught');
    }

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
    this.particles.stars(this.scene, this.targetPoint(), 16, colorForCount(c.data.favoriteNumber));
    this.confetti.burst(160);
    this.sound.fanfare();
    this.showBanner(`잡았다! ${c.data.name}!`);
    this.msgEl.textContent = `${c.data.name}이(가) 친구가 되었어요!`;
    this.throwBtn.disabled = true;
    this.runBtn.textContent = '계속하기 ▶';
    this.runBtn.classList.add('primary');
  }
}
