import * as THREE from 'three';
import { addFace, makeNumberSprite, rand } from './util.js';
import { terrainHeight, inHole, isBlocked, insideObstacle, resolveObstacles, worldSize, makeLabelTexture } from './world.js';
import { swapDraftWithModel, tickModel } from './models.js';

// data/creatures.json 의 draftShape 를 읽어 기본 도형으로 드래프트 몬스터를 만든다.
// model 에 .glb 파일명이 있고 그 파일을 미리 받아 두었다면(models.js preloadModels) 드래프트 대신 그 모델을 쓴다.
export function buildDraftMesh(c, opts = {}) {
  const g = new THREE.Group();
  const draft = new THREE.Group(); // 드래프트 부품은 여기에 모아서 한 번에 교체할 수 있게 한다
  g.add(draft);
  g.userData.draft = draft;
  const d = c.draftShape || {};
  const color = new THREE.Color(d.color || '#cccccc');
  const glows = !!(d.glowSegments || d.glow); // 포니타(m07), 푸린(m15)처럼 스스로 빛나는 몬스터
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.5, transparent: !!d.translucent, opacity: d.translucent ? 0.7 : 1, emissive: glows ? color : 0x000000, emissiveIntensity: glows ? 0.8 : 0 });
  let body, faceZ = 0.5, faceY = 0.55;
  switch (d.body) {
    case 'cube': body = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat); body.position.y = 0.5; break;
    case 'capsule': body = new THREE.Mesh(new THREE.CapsuleGeometry(0.4, 0.5, 6, 12), mat); body.position.y = 0.65; faceZ = 0.4; faceY = 0.75; break;
    case 'cone': body = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.2, 16), mat); body.position.y = 0.6; faceZ = 0.3; faceY = 0.4; break;
    case 'drop': body = new THREE.Mesh(new THREE.SphereGeometry(0.5, 16, 14), mat); body.position.y = 0.6; body.scale.y = 1.3; break;
    default: body = new THREE.Mesh(new THREE.SphereGeometry(0.55, 16, 14), mat); body.position.y = 0.55; faceZ = 0.55;
  }
  body.castShadow = true;
  draft.add(body);
  addFace(draft, { y: faceY + 0.05, z: faceZ, eyes: d.eyes ?? 2 });

  // "좋아하는 숫자"가 몸에 무늬로 들어간다 (세어서 맞출 수 있게)
  const accentMat = new THREE.MeshStandardMaterial({ color: color.clone().offsetHSL(0, 0, -0.15) });
  if (d.curls) {
    for (let i = 0; i < d.curls; i++) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), accentMat);
      s.position.set(-0.3 + (0.6 * i) / Math.max(1, d.curls - 1), 1.1, 0);
      draft.add(s);
    }
  }
  if (d.ears) {
    for (let i = 0; i < d.ears; i++) {
      const e = new THREE.Mesh(new THREE.CapsuleGeometry(0.1, 0.45, 4, 8), accentMat);
      e.position.set(i === 0 ? -0.25 : 0.25, 1.15, 0);
      e.rotation.z = i === 0 ? 0.2 : -0.2;
      draft.add(e);
    }
  }
  if (d.paws) {
    for (let i = 0; i < d.paws; i++) {
      const p = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), accentMat);
      p.position.set(i % 2 === 0 ? -0.35 : 0.35, 0.15, i < 2 ? 0.3 : -0.3);
      draft.add(p);
    }
  }
  if (d.bubbles) {
    for (let i = 0; i < d.bubbles; i++) {
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.8 }));
      const a = (i / d.bubbles) * Math.PI * 2;
      b.position.set(Math.cos(a) * 0.7, 0.9 + Math.sin(a * 2) * 0.2, Math.sin(a) * 0.7);
      draft.add(b);
    }
  }
  if (d.dots) {
    for (let i = 0; i < d.dots; i++) {
      const dot = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), new THREE.MeshStandardMaterial({ color: 0x222222 }));
      dot.position.set(-0.3 + (i % 3) * 0.3, 0.8 - Math.floor(i / 3) * 0.3, 0.51);
      draft.add(dot);
    }
  }
  if (glows && c.boss) { const light = new THREE.PointLight(color, 3, 9); light.position.y = 0.8; g.add(light); } // 점광원은 보스만 (야생 여럿이 빛을 켜면 느려진다)
  if (c.model) swapDraftWithModel(g, c.model, { onSwap: opts.onSwap }); // 진짜 모델이 있으면 드래프트 도형 대신 사용
  g.scale.setScalar(c.scale || 1);
  return g;
}

export class Creature {
  constructor(scene, data, home) {
    this.data = data;
    this.sleeping = !!data.sleeping; // 자는 몬스터(잠만보): 돌아다니지 않고 제자리에서 잔다. 닿으면 대결
    this.mesh = buildDraftMesh(data, { onSwap: (m) => { if (this.sleeping) this.lieDown(m); } });
    this.home = home.clone();
    this.mesh.position.copy(home);
    this.mesh.position.y = terrainHeight(home.x, home.z);
    this.target = home.clone();
    this.state = this.sleeping ? 'sleep' : 'wander'; // wander | approach | caught | shy | sleep
    this.shyTimer = 0;
    this.cooldown = 0;        // 결투 화면을 닫은 직후 잠깐은 다시 열리지 않음
    this.isBoss = !!data.boss;
    this.approachRange = this.isBoss ? 11 : 7;
    this.leash = this.isBoss ? 5 : 6;
    this.t = rand(0, 10);
    this.hint = makeNumberSprite(data.baseHp ?? data.favoriteNumber, '#e8453c'); // 머리 위 힌트 = 체력
    this.hint.position.y = 1.7 * (data.scale || 1);
    this.hint.visible = false;
    this.mesh.add(this.hint);
    if (this.isBoss) { // 보스 표시: 발밑 금빛 고리 + 머리 위 이름표 (멀리서도 보인다)
      const ring = new THREE.Mesh(new THREE.TorusGeometry(1.0, 0.07, 8, 40), new THREE.MeshStandardMaterial({ color: 0xffd93d, emissive: 0xffb300, emissiveIntensity: 1 }));
      ring.rotation.x = Math.PI / 2; ring.position.y = 0.06;
      this.mesh.add(ring);
      this.bossRing = ring;
      const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: makeLabelTexture(`보스 ${data.name}`, '#20232e', '#ffd93d', 56), transparent: true, depthTest: false }));
      label.scale.set(2.2, 0.55, 1);
      label.position.y = 1.65;
      this.mesh.add(label);
    }
    if (this.sleeping) { // 머리 위 "Zzz"
      const z = new THREE.Sprite(new THREE.SpriteMaterial({ map: makeLabelTexture('z Z z', '#ffffff', '#5a7bd6', 56), transparent: true, depthTest: false }));
      z.scale.set(1.6, 0.4, 1);
      z.position.set(0.4, 1.3 * (data.scale || 1), 0);
      this.mesh.add(z);
      this.zzz = z;
    }
    scene.add(this.mesh);
  }

  get position() { return this.mesh.position; }

  /** 모델을 등을 대고 눕힌다 (앞 +Z 가 하늘을 보게). 발바닥 원점이라 등 두께만큼 띄운다 */
  lieDown(model) {
    this.model = model;
    const box = new THREE.Box3().setFromObject(model.children[0]);
    model.rotation.x = -Math.PI / 2;
    model.position.y = -box.min.z * (model.userData.targetScale || 1);
    if (this.zzz) this.zzz.visible = true;
  }
  /** 일어난다 (대결 시작, 잡혔을 때) */
  standUp() {
    if (this.model) { this.model.rotation.x = 0; this.model.position.y = 0; }
    if (this.zzz) this.zzz.visible = false;
  }

  pickTarget() {
    for (let i = 0; i < 10; i++) {
      const x = this.home.x + rand(-this.leash, this.leash), z = this.home.z + rand(-this.leash, this.leash);
      if (!inHole(x, z) && !isBlocked(x, z) && !insideObstacle(x, z, 0.6) && Math.abs(x) < worldSize() / 2 - 3 && Math.abs(z) < worldSize() / 2 - 3) {
        this.target.set(x, 0, z);
        return;
      }
    }
  }

  moveToward(tx, tz, speed, dt) {
    const p = this.mesh.position;
    const dx = tx - p.x, dz = tz - p.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.05) return dist;
    const step = Math.min(dist, speed * dt);
    const ox = p.x, oz = p.z;
    p.x += (dx / dist) * step;
    p.z += (dz / dist) * step;
    resolveObstacles(p, 0.5 * (this.data.scale || 1));
    if (isBlocked(p.x, p.z)) { p.x = ox; p.z = oz; } // 물 앞에서는 멈춘다
    this.mesh.rotation.y = Math.atan2(dx, dz);
    return dist;
  }

  // 아직 안 잡힌 몬스터: 돌아다니다가 플레이어가 가까이 오면 다가온다.
  // 어떤 상태든 플레이어와 닿으면 결투('meet')가 열린다 (쿨다운 중 제외).
  update(dt, playerPos) {
    this.t += dt;
    this.cooldown = Math.max(0, this.cooldown - dt);
    const p = this.mesh.position;
    const touchDist = 1.7 + (this.data.scale || 1) * 0.5;
    if (this.cooldown <= 0 && p.distanceTo(playerPos) < touchDist) {
      this.hint.visible = false;
      if (this.sleeping) this.standUp(); // 건드리면 벌떡 일어나 대결
      return 'meet';
    }
    // 보스는 아레나(집) 근처에 플레이어가 와야 반응한다
    const playerNear = this.isBoss ? playerPos.distanceTo(this.home) < this.approachRange : p.distanceTo(playerPos) < this.approachRange;
    let bob = 0;
    if (this.state === 'sleep') {
      // 자는 중: 움직이지 않고 숨만 쉰다. 가까이 오면 체력 숫자만 보여 준다
      bob = Math.sin(this.t * 1.5) * 0.02;
      if (this.zzz) { this.zzz.position.y = 1.3 * (this.data.scale || 1) + Math.sin(this.t * 2) * 0.15; this.zzz.material.opacity = 0.7 + Math.sin(this.t * 2) * 0.3; }
      this.hint.visible = playerNear;
      p.y = terrainHeight(p.x, p.z) + bob;
      tickModel(this.mesh, dt, 'idle');
      return null;
    } else if (this.state === 'shy') {
      this.shyTimer -= dt;
      this.moveToward(this.home.x, this.home.z, 4, dt);
      if (this.shyTimer <= 0) {
        this.state = this.sleeping ? 'sleep' : 'wander';
        if (this.sleeping && this.model) this.lieDown(this.model); // 집에 돌아와 다시 잔다
      }
      bob = Math.abs(Math.sin(this.t * 10)) * 0.15;
    } else if (this.state === 'wander') {
      const d = this.moveToward(this.target.x, this.target.z, 1.2, dt);
      if (d < 0.3 && Math.random() < 0.02) this.pickTarget();
      bob = Math.abs(Math.sin(this.t * 6)) * 0.08;
      if (playerNear) this.state = 'approach';
    } else if (this.state === 'approach') {
      const d = this.moveToward(playerPos.x, playerPos.z, this.isBoss ? 1.8 : 2.6, dt);
      bob = this.isBoss ? Math.abs(Math.sin(this.t * 5)) * 0.35 : Math.abs(Math.sin(this.t * 10)) * 0.15; // 보스는 쿵쿵 크게
      if (!playerNear && d > 14) this.state = 'wander';
    }
    this.hint.visible = this.state === 'approach';
    if (this.bossRing) this.bossRing.rotation.z = this.t * 0.8;
    p.y = terrainHeight(p.x, p.z) + bob;
    tickModel(this.mesh, dt, 'walk'); // walk 클립이 없으면 첫 번째 클립(보통 idle)을 돈다
    return null;
  }

  becomeShy() {
    this.state = 'shy';
    this.shyTimer = this.isBoss || this.sleeping ? 2 : 5;
    this.cooldown = 3;
    this.hint.visible = false;
  }

  becomeFriend() {
    this.state = 'caught';
    this.hint.visible = false;
    if (this.sleeping) { this.standUp(); if (this.zzz) { this.mesh.remove(this.zzz); this.zzz = null; } } // 잡힌 잠만보는 일어나서 따라온다
  }
}
