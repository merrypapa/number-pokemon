import * as THREE from 'three';
import { addFace, lerpAngle } from './util.js';
import { terrainHeight, inHole, worldSize, isBlocked, resolveObstacles, ledgeStep } from './world.js';
import { swapDraftWithModel, tickModel } from './models.js';
import { CAR_SPEED, CAR_BOOST } from './car.js';

export const PLAYER_NAME = '인하';
export const PLAYER_MODEL = '지우.glb'; // 지우: 서기(restpose)·걷기·달리기·점프(Regular_Jump)·수영(Swim_Forward/Swim_Idle) 애니메이션이 들어 있다 // assets/models/ 안의 이 파일이 있으면 주인공이 이 모델로 바뀐다
export const PLAYER_HEIGHT = 1.9;      // 주인공 모델 키(m). 몬스터(1m 기준)보다 크게

const SPEED = 6.5, RUN = 1.7, JUMP = 7, GRAVITY = -20, ACCEL = 14; // RUN: 달리기 배속 (Shift/Ctrl 또는 달리기 버튼), ACCEL: 조이스틱처럼 부드럽게 가속/감속

export class Player {
  constructor(scene, { model = PLAYER_MODEL, height = PLAYER_HEIGHT } = {}) { // model/height: 고른 트레이너의 모습 (src/trainers.js)
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
    swapDraftWithModel(this.group, model, { scale: height, onSwap: (m) => { this.body = m; } }); // 걷기 기울임을 모델 전체에

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
    this.climbAt = null;   // 지역이 준 함수 (x, z, y) → { top, x, z } : 올라갈 수 있는 나무 줄기 옆이면 (야외 체육관). 점프 버튼을 누르고 있으면 줄기를 타고 오른다
    this.climbing = false;
    this.surface = null;   // 물 위를 헤엄칠 때(체육관 연못): main 이 매 프레임 물 높이를 넣어 준다. 가슴까지 잠긴 채 천천히 헤엄치고 점프는 못 한다
    this.fly = null;       // 날개 있는 포켓몬을 타고 날 때: { mesh, minH, maxH, up, down, speed } — 장애물·물 위를 지나고, 점프 버튼으로 올라가고 놓으면 천천히 내려온다
    this.flying = false;
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
  /** 날개 있는 포켓몬에 올라탄다: 포켓몬 모습을 발밑에 붙이고 주인공은 그 위에 선다 */
  mountFly(mesh, { seatY = 1.0, minH = 2.5, maxH = 16, up = 6, down = 2.2, speed = 2.0 } = {}) {
    if (this.fly) this.dismountFly();
    mesh.position.set(0, 0, 0); mesh.rotation.set(0, 0, 0);
    this.group.add(mesh);
    this.fly = { mesh, seatY, minH, maxH, up, down, speed };
    this.flying = true;
    const model = this.group.userData.model || this.group.userData.draft; if (model) model.position.y = seatY; // 주인공은 포켓몬 등 위에
  }
  /** 내린다. 떼어 낸 포켓몬 모습을 돌려준다 */
  dismountFly() {
    if (!this.fly) return null;
    const { mesh } = this.fly;
    this.group.remove(mesh);
    const model = this.group.userData.model || this.group.userData.draft; if (model) model.position.y = 0;
    this.fly = null; this.flying = false;
    return mesh;
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
  teleport(x, z, y = null) { // y: 겹치는 층이 있는 지형(동굴탑)에서 어느 층인지
    this.group.position.set(x, terrainHeight(x, z, y ?? 0) + 0.5, z);
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
      : this.fly ? SPEED * this.fly.speed * (input.isHeld('run') ? 1.4 : 1) // 날 때: 걷기의 2배, 가속 버튼이면 더
      : this.car ? SPEED * CAR_SPEED * (input.isHeld('run') ? CAR_BOOST : 1) // 차: 걷기의 2.2배, 가속 버튼이면 더
      : SPEED * (input.isHeld('run') ? RUN : 1) * (this.surface != null ? 0.6 : 1); // 물에서는 천천히
    this.vx += (wx * top - this.vx) * k;
    this.vz += (wz * top - this.vz) * k;
    const speed = Math.hypot(this.vx, this.vz);
    // 걷기/서기, 걷기/달리기 판정에 여유(히스테리시스)를 둔다: 조이스틱을 반쯤 기울이면 속도가 문턱 근처에서 오르내려
    // 매 프레임 걷기↔달리기 클립이 바뀌며 서로 섞여 동작이 깨져 보였다. 달리기는 속도가 아니라 달리기 버튼을 누르고 있는지로 정한다
    const moving = this.moving ? speed > 0.3 : speed > 0.6;
    this.moving = moving;
    this.running = !this.boat && !this.car && !this.fly && moving && input.isHeld('run'); // 배 위에서는 뛰지 않는다 (배가 달리는 것이지 내가 뛰는 게 아니다)
    // 물(연못·호수)은 못 들어간다. 배를 타면 반대로 물 위만 갈 수 있다.
    // 축마다 따로 시도해서 가장자리를 따라 미끄러지듯 움직인다.
    // 턱: 지형이 정한 높이(ledgeStep)보다 높은 곳으로는 걸어 올라갈 수 없고 뛰어서 발이 그 높이 가까이 올라와야 올라선다 (꿀벌집 육각 계단)
    const ledge = ledgeStep();
    const wall = (x, z) => this.fly ? terrainHeight(x, z, p.y) > p.y + 2.5 // 날 때는 지형이 나보다 훨씬 높을 때만 막힌다 (언덕은 저절로 넘고, 물·울타리·나무 위를 지난다)
      : (this.boat ? !this.boat.canGo(x, z) : isBlocked(x, z, p.y)) || (!this.boat && terrainHeight(x, z, p.y) > p.y + ledge);
    const blocked = wall;
    const ox = p.x, oz = p.z;
    p.x += this.vx * dt;
    if (blocked(p.x, oz)) { p.x = ox; this.vx = 0; }
    p.z += this.vz * dt;
    if (blocked(p.x, p.z)) { p.z = oz; this.vz = 0; }
    // 나무·집·바위 같은 구조물 밖으로 밀어낸다 (배는 지형(canGo)으로만 막히므로 건너뛴다).
    // 물속에서 바위·다시마·가라앉은 배보다 높이 떠오르면 그 위로 헤엄쳐 지나갈 수 있다.
    const overObstacles = !!this.fly || (!!this.swim && p.y > terrainHeight(p.x, p.z) + this.swim.clear);
    if (!this.boat && !overObstacles && resolveObstacles(p, this.car ? 0.8 : 0.45) && blocked(p.x, p.z)) { p.x = ox; p.z = oz; }
    if (moving) {
      const before = this.facing;
      this.facing = lerpAngle(this.facing, Math.atan2(this.vx, this.vz), this.car || this.fly ? 0.18 : 0.3); // 차·날 때는 천천히 꺾인다
      this.lean = (this.lean || 0) * 0.8 + Math.atan2(Math.sin(this.facing - before), Math.cos(this.facing - before)) * 2; // 꺾는 정도 (차가 기우는 데 쓴다)
      this.moved = true;
      this.walkT += dt * 2 * speed;
    }
    this.group.rotation.y = this.facing;
    // 진짜 애니메이션이 있는 모델이면 손으로 흔드는 연출(몸 기울임)은 끈다 — 두 개가 겹치면 어색하다
    const anim = this.group.userData.model?.userData.anim;
    this.body.rotation.z = !anim && moving && !this.boat && !this.car && !this.fly ? Math.sin(this.walkT) * 0.12 * Math.min(1, speed / SPEED) : 0; // 배 위·차 안에서는 몸이 좌우로 흔들리지 않는다
    if (!moving) this.lean = (this.lean || 0) * 0.8;
    if (this.car) this.car.rotation.z = -Math.max(-0.18, Math.min(0.18, this.lean || 0)); // 차는 꺾을 때 살짝 기운다
    if (this.fly) { // 타고 있는 포켓몬: 날갯짓(걷기/달리기 클립)과 기울기, 살짝 위아래로 둥실
      const fm = this.fly.mesh; this.flyT = (this.flyT || 0) + dt;
      fm.rotation.z = -Math.max(-0.3, Math.min(0.3, (this.lean || 0) * 1.5)); fm.rotation.x = moving ? -0.12 : 0;
      fm.position.y = Math.sin(this.flyT * 3) * 0.08;
      tickModel(fm, dt, moving ? 'run' : 'walk');
    }
    tickModel(this.group, dt, this.boat || this.fly ? 'idle'
      : this.swimming ? (moving ? 'swim' : 'swimidle')   // 심해에서 떠 있을 때는 헤엄 동작 (클립이 없으면 walk/idle 로 대신)
      : this.climbing ? 'jump' // 나무 타기: 점프 동작으로
      : !this.onGround && !this.car && (this.jumping || (this.airT || 0) > 0.15) ? 'jump' // 점프했거나 0.15초 넘게 떠 있으면 점프 동작 (한 프레임 뜬 건 무시)
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
    const flash = () => { if (this.respawnFlash > 0) { this.respawnFlash -= dt; } else { this.group.scale.set(1, 1, 1); } };
    // 날기: 점프 버튼을 누르면 올라가고(지면 위 maxH 까지), 놓으면 천천히 내려온다(지면 위 minH 까지). 중력·점프 없음
    if (this.fly) {
      const ground = terrainHeight(p.x, p.z, p.y), f = this.fly;
      const lo = ground + f.minH, hi = ground + f.maxH;
      this.vy = input.isHeld('jump') ? f.up : p.y > lo ? -f.down : 0;
      p.y = Math.min(hi, p.y + this.vy * dt);
      if (p.y < lo) p.y = lo; // 언덕·산 위로는 바로 떠오른다
      this.onGround = false; this.jumping = false; this.airT = 0; this.swimming = false; this.climbing = false;
      flash(); return;
    }
    // 나무 타기 (야외 체육관): 줄기 옆에서 점프 버튼을 누르고 있으면 줄기를 타고 오른다. 꼭대기(단)에 닿으면 지형이 단 높이를 돌려줘 그 위에 선다
    const cl = !this.boat && !this.car && !this.swim && this.climbAt ? this.climbAt(p.x, p.z, p.y) : null;
    this.climbing = !!cl && input.isHeld('jump');
    if (this.climbing) {
      p.y = Math.min(cl.top, p.y + 2.8 * dt);
      this.vy = 0; this.onGround = false; this.jumping = false; this.airT = 0;
      this.facing = Math.atan2(cl.x - p.x, cl.z - p.z); this.group.rotation.y = this.facing; // 줄기를 보고 오른다
      if (p.y >= cl.top - 0.01) { p.y = cl.top; this.onGround = true; this.climbing = false; }
      flash(); return;
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
      if (input.wasPressed('jump') && this.onGround && !this.car && !cl && this.surface == null) { // 차에서는 점프 없음. 줄기 옆에서는 점프 대신 나무 타기. 물에서는 못 뛴다
        this.vy = JUMP;
        this.onGround = false;
        this.jumped = true;
        this.jumping = true; // 진짜 점프 중 (내리막에서 잠깐 뜨는 것과 구분)
      }
      this.vy += GRAVITY * this.gravityScale * dt;
    }
    p.y += this.vy * dt;

    const floor = inHole(p.x, p.z) ? -20 : terrainHeight(p.x, p.z, p.y);
    // 내리막을 달릴 때는 중력보다 땅이 더 빨리 낮아져 매 프레임 살짝 떠 버린다 → 점프 동작이 깜빡이며 버벅였다.
    // 점프 중이 아니고 땅과의 틈이 작으면(0.6m 안) 땅에 붙인다. 그보다 높은 턱에서 떨어지는 건 진짜 낙하.
    const gap = p.y - floor;
    // 물속(심해)에서도 바닥 가까이 있으면 땅에 붙인다. 예전에는 물속이면(!sw) 붙이지 않아,
    // 내리막을 걷는 동안 매 프레임 살짝 떠서 걷기↔헤엄이 번갈아 바뀌며 버벅였다.
    const swimUp = !!sw && input.isHeld('jump'); // 헤엄쳐 올라가는 중에는 당연히 붙이지 않는다
    const snapGap = sw ? 0.35 : 0.6;             // 물속에서는 조금 더 낮게 (천천히 가라앉는 느낌을 남긴다)
    if (p.y <= floor || (!this.jumping && !swimUp && this.vy <= 0 && gap < snapGap)) {
      p.y = floor;
      this.vy = 0;
      this.onGround = true;
      this.jumping = false;
      this.airT = 0;
    } else {
      this.onGround = false;
      this.airT = (this.airT || 0) + dt;
    }
    if (sw && p.y >= sw.ceiling) { p.y = sw.ceiling; this.vy = Math.min(this.vy, 0); } // 수면 바로 아래까지
    if (this.surface != null && !this.jumping) { p.y = this.surface; this.vy = 0; this.onGround = true; this.airT = 0; } // 연못: 수면 높이에 붙어 헤엄친다
    this.swimming = this.surface != null || (!!sw && !this.onGround && (this.airT || 0) > 0.12); // 잠깐 뜬 것으로는 헤엄 동작으로 바꾸지 않는다 (동작이 깜빡이지 않게)
    if (this.body) this.body.rotation.x = this.swimming && !anim ? -0.5 : 0; // 떠 있을 때는 헤엄치듯 앞으로 기운다 (헤엄 애니가 있으면 애니에 맡긴다)

    // 구멍에 떨어지면 fellInHole 을 켠다 (지금은 구멍이 있는 지역이 없다: 지하동굴은 굴 입구로 걸어 들어간다)
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
