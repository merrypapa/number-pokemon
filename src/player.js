import * as THREE from 'three';
import { addFace, lerpAngle } from './util.js';
import { terrainHeight, inHole, worldSize, isBlocked, resolveObstacles } from './world.js';
import { swapDraftWithModel, tickModel } from './models.js';
import { CAR_SPEED, CAR_BOOST } from './car.js';

export const PLAYER_NAME = '인하';
export const PLAYER_MODEL = '인하.glb'; // assets/models/ 안의 이 파일이 있으면 주인공이 이 모델로 바뀐다
export const PLAYER_HEIGHT = 1.9;      // 주인공 모델 키(m). 몬스터(1m 기준)보다 크게

const SPEED = 6.5, RUN = 1.7, JUMP = 7, GRAVITY = -20, ACCEL = 14; // RUN: 달리기 배속 (Shift/Ctrl 또는 달리기 버튼), ACCEL: 조이스틱처럼 부드럽게 가속/감속

export class Player {
  constructor(scene) {
    this.group = new THREE.Group();
    const draft = new THREE.Group(); // 드래프트 주인공 부품 (모델이 있으면 통째로 교체)
    this.group.add(draft);
    this.group.userData.draft = draft;
    // 몸(파란 옷), 머리, 노란 모자, 가방
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 0.4, 6, 12), new THREE.MeshStandardMaterial({ color: 0x3b82f6 }));
    body.position.y = 0.55;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.34, 16, 14), new THREE.MeshStandardMaterial({ color: 0xffe0bd }));
    head.position.y = 1.2;
    addFace(head, { y: 0.02, z: 0.3, spread: 0.12, size: 0.05 });
    const hat = new THREE.Mesh(new THREE.ConeGeometry(0.4, 0.5, 16), new THREE.MeshStandardMaterial({ color: 0xffd93d }));
    hat.position.y = 1.62;
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.06, 16), new THREE.MeshStandardMaterial({ color: 0xf1c40f }));
    brim.position.y = 1.38;
    const bag = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.45, 0.25), new THREE.MeshStandardMaterial({ color: 0xe74c3c }));
    bag.position.set(0, 0.7, -0.35);
    for (const m of [body, head, hat, brim, bag]) m.castShadow = true;
    draft.add(body, head, hat, brim, bag);
    this.body = body;
    // 모델이 준비돼 있으면 바로, 아직 받는 중이면 도착했을 때 드래프트 → 모델로 바뀐다
    swapDraftWithModel(this.group, PLAYER_MODEL, { scale: PLAYER_HEIGHT, onSwap: (m) => { this.body = m; } }); // 걷기 기울임을 모델 전체에

    this.group.position.set(0, 0, 12);
    this.vy = 0;
    this.vx = 0;
    this.vz = 0;
    this.onGround = true;
    this.facing = 0;
    this.moved = false;
    this.jumped = false;
    this.walkT = 0;
    this.respawnFlash = 0;
    this.gravityScale = 1; // 꿈의우주에서는 낮다 (높이 뛴다)
    this.boat = null;      // 배를 타고 있을 때: { canGo(x,z), floorY, speed } — 물 위를 달리고 뭍에서 막힌다
    this.swim = null;      // 물속 지역(심해)에서: { ceiling, up, rise, sink, clear } — 점프 버튼으로 헤엄쳐 올라간다
    this.swimming = false; // 지금 물에 떠 있나 (바닥을 딛고 있지 않나)
    this.car = null;       // 이상해꽃 자동차를 타고 있을 때: 차체 그룹 (주인공 모델 대신 보인다). 빠르고, 점프는 못 한다
    // 주인공이 드는 등불 (동굴에서 주변을 밝힌다)
    this.lamp = new THREE.PointLight(0xffd9a0, 0, 24);
    this.lamp.position.set(0, 1.6, 0.4);
    this.group.add(this.lamp);
    scene.add(this.group);
  }

  get position() { return this.group.position; }

  /** 차에 탄다: 주인공 모습을 숨기고 차체를 붙인다 */
  drive(body) {
    if (this.car) this.dismount();
    this.car = body;
    body.position.set(0, 0, 0);
    this.group.add(body);
    this.setShown(false);
  }
  /** 차에서 내린다. 떼어 낸 차체를 돌려준다 */
  dismount() {
    const body = this.car;
    if (!body) return null;
    this.group.remove(body);
    this.car = null;
    this.setShown(true);
    if (this.body) this.body.rotation.z = 0;
    return body;
  }
  setShown(on) {
    if (this.group.userData.draft) this.group.userData.draft.visible = on;
    if (this.group.userData.model) this.group.userData.model.visible = on;
  }

  /** 지역 이동 시 위치를 옮기고 "뿅" 효과 */
  teleport(x, z) {
    this.group.position.set(x, terrainHeight(x, z) + 0.5, z);
    this.vx = this.vz = 0;
    this.vy = 2;
    this.respawnFlash = 0.6;
  }

  update(dt, input, camYaw = 0) {
    const p = this.group.position;
    const axis = input.getAxis(); // 키보드도 조이스틱처럼: 목표 속도로 부드럽게 가속
    // 화면 기준 축을 카메라 방향(camYaw) 기준 월드 방향으로 회전
    const sy = Math.sin(camYaw), cy = Math.cos(camYaw);
    const wx = axis.x * cy + axis.y * sy;
    const wz = axis.y * cy - axis.x * sy;
    const k = Math.min(1, ACCEL * dt);
    const top = this.boat ? this.boat.speed * (input.isHeld('run') ? this.boat.boost : 1)
      : this.car ? SPEED * CAR_SPEED * (input.isHeld('run') ? CAR_BOOST : 1) // 차: 걷기의 2.2배, 가속 버튼이면 더
      : SPEED * (input.isHeld('run') ? RUN : 1);
    this.vx += (wx * top - this.vx) * k;
    this.vz += (wz * top - this.vz) * k;
    const speed = Math.hypot(this.vx, this.vz);
    const moving = speed > 0.4;
    this.running = !this.boat && !this.car && moving && speed > SPEED * 1.15; // 배 위에서는 뛰지 않는다 (배가 달리는 것이지 내가 뛰는 게 아니다)
    // 물(연못·호수)은 못 들어간다. 배를 타면 반대로 물 위만 갈 수 있다.
    // 축마다 따로 시도해서 가장자리를 따라 미끄러지듯 움직인다.
    const blocked = this.boat ? (x, z) => !this.boat.canGo(x, z) : isBlocked;
    const ox = p.x, oz = p.z;
    p.x += this.vx * dt;
    if (blocked(p.x, oz)) { p.x = ox; this.vx = 0; }
    p.z += this.vz * dt;
    if (blocked(p.x, p.z)) { p.z = oz; this.vz = 0; }
    // 나무·집·바위 같은 구조물 밖으로 밀어낸다 (배는 지형(canGo)으로만 막히므로 건너뛴다).
    // 물속에서 바위·다시마·가라앉은 배보다 높이 떠오르면 그 위로 헤엄쳐 지나갈 수 있다.
    const overObstacles = !!this.swim && p.y > terrainHeight(p.x, p.z) + this.swim.clear;
    if (!this.boat && !overObstacles && resolveObstacles(p, this.car ? 0.8 : 0.45) && blocked(p.x, p.z)) { p.x = ox; p.z = oz; }
    if (moving) {
      const before = this.facing;
      this.facing = lerpAngle(this.facing, Math.atan2(this.vx, this.vz), this.car ? 0.18 : 0.3); // 차는 천천히 꺾인다
      this.lean = (this.lean || 0) * 0.8 + Math.atan2(Math.sin(this.facing - before), Math.cos(this.facing - before)) * 2; // 꺾는 정도 (차가 기우는 데 쓴다)
      this.moved = true;
      this.walkT += dt * 2 * speed;
    }
    this.group.rotation.y = this.facing;
    // 진짜 애니메이션이 있는 모델이면 손으로 흔드는 연출(몸 기울임)은 끈다 — 두 개가 겹치면 어색하다
    const anim = this.group.userData.model?.userData.anim;
    this.body.rotation.z = !anim && moving && !this.boat && !this.car ? Math.sin(this.walkT) * 0.12 * Math.min(1, speed / SPEED) : 0; // 배 위·차 안에서는 몸이 좌우로 흔들리지 않는다
    if (!moving) this.lean = (this.lean || 0) * 0.8;
    if (this.car) this.car.rotation.z = -Math.max(-0.18, Math.min(0.18, this.lean || 0)); // 차는 꺾을 때 살짝 기운다
    tickModel(this.group, dt, this.boat ? 'idle'
      : this.swimming ? (moving ? 'swim' : 'swimidle')   // 심해에서 떠 있을 때는 헤엄 동작 (클립이 없으면 walk/idle 로 대신)
      : moving ? (this.running ? 'run' : 'walk') : 'idle');

    // 경계
    const lim = worldSize() / 2 - 2;
    p.x = Math.max(-lim, Math.min(lim, p.x));
    p.z = Math.max(-lim, Math.min(lim, p.z));

    // 배 위에서는 물결에 맞춰 떠 있다 (점프·중력 없음)
    if (this.boat) {
      p.y = this.boat.floorY;
      this.vy = 0;
      this.onGround = true;
      if (this.respawnFlash > 0) { this.respawnFlash -= dt; } else { this.group.scale.set(1, 1, 1); }
      return;
    }
    // 점프/중력. 물속 지역(심해)에서는 헤엄치기가 된다:
    // 점프 버튼을 누르고 있는 동안 물을 차고 올라가고, 놓으면 천천히 가라앉는다. 수면 위로는 못 나간다.
    const sw = this.swim;
    if (sw) {
      if (input.isHeld('jump')) this.vy += sw.up * dt;
      else if (this.vy > 0) this.vy *= Math.pow(0.05, dt); // 버튼을 놓으면 곧 떠오름을 멈춘다 (계속 솟구치지 않게)
      this.vy += GRAVITY * this.gravityScale * dt;
      this.vy = Math.max(-sw.sink, Math.min(sw.rise, this.vy)); // 너무 빨리 뜨거나 가라앉지 않게
    } else {
      if (input.wasPressed('jump') && this.onGround && !this.car) { // 차에서는 점프 없음
        this.vy = JUMP;
        this.onGround = false;
        this.jumped = true;
      }
      this.vy += GRAVITY * this.gravityScale * dt;
    }
    p.y += this.vy * dt;

    const floor = inHole(p.x, p.z) ? -20 : terrainHeight(p.x, p.z);
    if (p.y <= floor) {
      p.y = floor;
      this.vy = 0;
      this.onGround = true;
    } else {
      this.onGround = false;
    }
    if (sw && p.y >= sw.ceiling) { p.y = sw.ceiling; this.vy = Math.min(this.vy, 0); } // 수면 바로 아래까지
    this.swimming = !!sw && !this.onGround;
    if (this.body) this.body.rotation.x = this.swimming && !anim ? -0.5 : 0; // 떠 있을 때는 헤엄치듯 앞으로 기운다 (헤엄 애니가 있으면 애니에 맡긴다)

    // 구멍에 떨어지면 main 이 지역을 바꾼다 (초원 → 동굴)
    if (p.y < -4) {
      p.y = -4;
      this.vy = 0;
      this.fellInHole = true;
    }
    if (this.respawnFlash > 0) {
      this.respawnFlash -= dt;
      const s = 1 + Math.sin(this.respawnFlash * 30) * 0.15;
      this.group.scale.set(s, s, s);
    } else {
      this.group.scale.set(1, 1, 1);
    }
  }
}
