import * as THREE from 'three';
import { makeNumberSprite } from './util.js';
import { tickModel } from './models.js';

// ---------------------------------------------------------------------------
// 친구 대결을 아레나 무대 위에서 보여 주는 화면 (src/duel.js 의 턴제 규칙은 그대로 쓴다).
//
// 예전에는 대결이 도감 안의 카드 한 장이었다 — 어디에 서 있든 버튼만 누르면 됐고, 포켓몬은
// 조그만 그림 두 장뿐이라 "대결"처럼 보이지 않았다. 이제는
//   · 아레나 무대(1P·2P 자리) 위에 올라가야 대결이 열리고,
//   · 두 포켓몬이 무대에서 마주 서서, 기술을 쓸 때마다 달려들어 때리고 뒤로 밀려난다.
// 야생 대결(src/battle.js)과 같은 어깨너머 카메라를 써서 느낌을 맞췄다.
// ---------------------------------------------------------------------------

const UP = new THREE.Vector3(0, 1, 0);
const KIND_COLOR = { water: 0x3fb8e8, fire: 0xff6a1a, leaf: 0x57b947, bolt: 0xffd93d, rock: 0xa98467, bone: 0xf1e9c8, tackle: 0xffffff };

export class DuelStage {
  constructor({ camera, particles, sound, confetti }) {
    Object.assign(this, { camera, particles, sound, confetti });
    this.active = false;
    this.fx = [];
  }

  /** 무대에 둘을 세운다. mine·theirs = { mesh, name }, spot = 무대 위 {x,z} 자리 */
  start({ scene, mySpot, theirSpot, mine, theirs, stageY = 0.3, hide = [] }) {
    this.scene = scene;
    this.mine = mine; this.theirs = theirs;
    this.myHome = new THREE.Vector3(mySpot.x, stageY, mySpot.z);
    this.theirHome = new THREE.Vector3(theirSpot.x, stageY, theirSpot.z);
    for (const [o, home, look] of [[mine, this.myHome, this.theirHome], [theirs, this.theirHome, this.myHome]]) {
      o.mesh.position.copy(home);
      o.mesh.rotation.y = Math.atan2(look.x - home.x, look.z - home.z); // 서로 마주 본다
      o.mesh.visible = true;
      o.bob = Math.random() * 6;
      if (!o.mesh.parent) scene.add(o.mesh);
    }
    this.hidden = hide.filter((o) => o && o.visible); // 주인공과 따라다니는 친구들은 무대에서 비킨다
    for (const o of this.hidden) o.visible = false;
    // 카메라: 무대 옆에서 둘을 함께 본다. 멀찍이 서서 눈높이를 포켓몬에 맞춰야 앞뒤 둘 다 화면 가운데쯤에 오고,
    // 아래쪽 기술 카드에 내 포켓몬이 가리지 않는다 (어깨너머로 바짝 붙으면 내 쪽이 화면 맨 아래로 내려간다).
    const back = new THREE.Vector3().subVectors(this.myHome, this.theirHome).setY(0).normalize();
    const right = new THREE.Vector3().crossVectors(UP, back).normalize();
    this.camPos = new THREE.Vector3().copy(this.myHome).addScaledVector(back, 7).addScaledVector(right, 2.0);
    this.camPos.y = stageY + 2.3;
    this.camLook = new THREE.Vector3().lerpVectors(this.myHome, this.theirHome, 0.5);
    this.camLook.y = stageY + 0.85;
    this.camera.position.copy(this.camPos).addScaledVector(back, 4).addScaledVector(UP, 2); // 조금 멀리서 스르륵 다가온다
    this.t = 0; this.anim = null; this.shake = 0; this.cheerT = 0; this.cheerWho = null;
    this.active = true;
  }

  /** 기술 한 방. mineAttacks 면 내 포켓몬이 달려든다 */
  attack(mineAttacks, { dmg = 0, mult = 1, kind = 'tackle' } = {}) {
    if (!this.active) return;
    const att = mineAttacks ? this.mine : this.theirs;
    const def = mineAttacks ? this.theirs : this.mine;
    this.anim = { att, def, home: att.mesh.position.clone(), to: def.mesh.position.clone(), t: 0, dmg, mult, kind, hit: false };
  }
  /** 대결이 끝났다 — 이긴 쪽이 폴짝폴짝 */
  cheer(iWon) {
    if (!this.active) return;
    this.cheerWho = iWon ? this.mine : this.theirs;
    this.cheerT = 0;
    if (iWon) { this.confetti?.burst(180); this.sound?.fanfare(); } else this.sound?.bounce();
  }

  update(dt) {
    if (!this.active) return;
    this.t += dt;
    // 카메라가 자리로 스르륵
    this.camera.position.lerp(this.camPos, Math.min(1, dt * 2.6));
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt * 2.5);
      this.camera.position.x += (Math.random() - 0.5) * 0.14 * this.shake;
      this.camera.position.y += (Math.random() - 0.5) * 0.14 * this.shake;
    }
    this.camera.lookAt(this.camLook);
    // 제자리에서 숨 쉬듯 까딱까딱
    for (const o of [this.mine, this.theirs]) {
      if (!o?.mesh) continue;
      const home = o === this.mine ? this.myHome : this.theirHome;
      if (!this.anim || (this.anim.att !== o && this.anim.def !== o)) {
        o.mesh.position.x += (home.x - o.mesh.position.x) * Math.min(1, dt * 6);
        o.mesh.position.z += (home.z - o.mesh.position.z) * Math.min(1, dt * 6);
        o.mesh.position.y = home.y + Math.abs(Math.sin(this.t * 2.4 + o.bob)) * 0.09;
      }
      tickModel(o.mesh, dt, 'idle');
    }
    this.tickAttack(dt);
    this.tickCheer(dt);
    this.tickFx(dt);
  }

  /** 달려들기 → 맞히기 → 제자리 */
  tickAttack(dt) {
    const a = this.anim;
    if (!a) return;
    a.t += dt;
    const home = a.att === this.mine ? this.myHome : this.theirHome;
    const dHome = a.def === this.mine ? this.myHome : this.theirHome;
    const toward = new THREE.Vector3().subVectors(a.to, home).setY(0);
    const dist = toward.length() || 1;
    toward.normalize();
    if (a.t < 0.3) {                                    // 웅크렸다가
      const k = a.t / 0.3;
      a.att.mesh.position.copy(home).addScaledVector(toward, -0.5 * k);
      a.att.mesh.position.y = home.y + k * 0.1;
    } else if (a.t < 0.58) {                            // 달려든다
      const k = (a.t - 0.3) / 0.28;
      a.att.mesh.position.copy(home).addScaledVector(toward, -0.5 + (dist - 1.6 + 0.5) * k);
      a.att.mesh.position.y = home.y + Math.sin(k * Math.PI) * 0.55;
      if (!a.hit && k > 0.85) this.hit(a, dHome, toward);
    } else if (a.t < 1.15) {                            // 되돌아온다
      const k = (a.t - 0.58) / 0.57;
      a.att.mesh.position.lerp(home, Math.min(1, k * 0.25 + dt * 4));
      a.att.mesh.position.y = home.y + Math.abs(Math.sin(k * Math.PI * 2)) * 0.12;
      // 맞은 쪽은 뒤로 밀렸다가 제자리로
      a.def.mesh.position.lerp(dHome, Math.min(1, dt * 4));
      a.def.mesh.position.y = dHome.y + Math.abs(Math.sin(k * 14)) * 0.1 * (1 - k);
    } else {
      a.att.mesh.position.copy(home);
      a.def.mesh.position.copy(dHome);
      this.anim = null;
    }
  }
  hit(a, dHome, toward) {
    a.hit = true;
    const at = a.def.mesh.position.clone(); at.y = dHome.y + 0.8;
    const color = KIND_COLOR[a.kind] ?? 0xffffff;
    this.particles?.cubes(this.scene, at, a.mult > 1 ? 20 : 12, color);
    this.particles?.stars(this.scene, at, 10, 0xffffff, 0.45);
    this.sound?.hit();
    this.shake = a.mult > 1 ? 1 : 0.6;
    a.def.mesh.position.addScaledVector(toward, 0.75); // 뒤로 밀린다
    if (a.dmg > 0) this.popNumber(at, a.dmg, a.mult);
  }
  /** 피해 숫자가 붕 떠올랐다 사라진다 */
  popNumber(at, dmg, mult) {
    const s = makeNumberSprite(dmg, mult > 1 ? '#e8453c' : mult < 1 ? '#8a8f98' : '#ff8c1a');
    s.scale.set(1.1, 1.1, 1);
    s.position.copy(at).add(new THREE.Vector3(0, 0.7, 0));
    this.scene.add(s);
    this.fx.push({ mesh: s, t: 0, dur: 1.2, rise: 1.4 });
  }
  tickFx(dt) {
    for (let i = this.fx.length - 1; i >= 0; i--) {
      const f = this.fx[i];
      f.t += dt;
      const k = f.t / f.dur;
      f.mesh.position.y += f.rise * dt;
      f.mesh.material.opacity = Math.max(0, 1 - k);
      f.mesh.material.transparent = true;
      if (k >= 1) { this.scene.remove(f.mesh); f.mesh.material.map?.dispose(); f.mesh.material.dispose(); this.fx.splice(i, 1); }
    }
  }
  tickCheer(dt) {
    if (!this.cheerWho) return;
    this.cheerT += dt;
    const home = this.cheerWho === this.mine ? this.myHome : this.theirHome;
    this.cheerWho.mesh.position.y = home.y + Math.abs(Math.sin(this.cheerT * 7)) * 0.5;
    this.cheerWho.mesh.rotation.y += dt * 2.2;
    if (this.cheerT > 4) this.cheerWho = null;
  }

  /** 무대를 치운다. 내가 만든 포켓몬 메시는 지우고, 비켜 두었던 것은 되돌린다 */
  end() {
    if (!this.active) return;
    for (const f of this.fx) { this.scene.remove(f.mesh); f.mesh.material.map?.dispose(); f.mesh.material.dispose(); }
    this.fx = [];
    for (const o of [this.mine, this.theirs]) if (o?.mesh) this.scene.remove(o.mesh);
    for (const o of this.hidden || []) o.visible = true;
    this.hidden = [];
    this.mine = this.theirs = this.anim = this.cheerWho = null;
    this.active = false;
  }
}
