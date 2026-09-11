import * as THREE from 'three';
import { addFace, lerpAngle } from './util.js';
import { terrainHeight, inHole, WORLD } from './world.js';

const SPEED = 6.5, JUMP = 7, GRAVITY = -20, ACCEL = 14; // ACCEL: 조이스틱처럼 부드럽게 가속/감속

export class Player {
  constructor(scene) {
    this.group = new THREE.Group();
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
    this.group.add(body, head, hat, brim, bag);
    this.body = body;

    this.group.position.set(0, 0, 8);
    this.vy = 0;
    this.vx = 0;
    this.vz = 0;
    this.onGround = true;
    this.facing = 0;
    this.moved = false;
    this.jumped = false;
    this.walkT = 0;
    this.respawnFlash = 0;
    scene.add(this.group);
  }

  get position() { return this.group.position; }

  update(dt, input) {
    const p = this.group.position;
    const axis = input.getAxis(); // 키보드도 조이스틱처럼: 목표 속도로 부드럽게 가속
    const k = Math.min(1, ACCEL * dt);
    this.vx += (axis.x * SPEED - this.vx) * k;
    this.vz += (axis.y * SPEED - this.vz) * k;
    const speed = Math.hypot(this.vx, this.vz);
    const moving = speed > 0.4;
    p.x += this.vx * dt;
    p.z += this.vz * dt;
    if (moving) {
      this.facing = lerpAngle(this.facing, Math.atan2(this.vx, this.vz), 0.3);
      this.moved = true;
      this.walkT += dt * 2 * speed;
    }
    this.group.rotation.y = this.facing;
    this.body.rotation.z = moving ? Math.sin(this.walkT) * 0.12 * Math.min(1, speed / SPEED) : 0;

    // 경계
    const lim = WORLD.size / 2 - 2;
    p.x = Math.max(-lim, Math.min(lim, p.x));
    p.z = Math.max(-lim, Math.min(lim, p.z));

    // 점프/중력
    if (input.wasPressed('jump') && this.onGround) {
      this.vy = JUMP;
      this.onGround = false;
      this.jumped = true;
    }
    this.vy += GRAVITY * dt;
    p.y += this.vy * dt;

    const floor = inHole(p.x, p.z) ? -20 : terrainHeight(p.x, p.z);
    if (p.y <= floor) {
      p.y = floor;
      this.vy = 0;
      this.onGround = true;
    } else {
      this.onGround = false;
    }

    // 구멍에 떨어지면 "뿅" 하고 구멍 옆으로
    if (p.y < -4) {
      const ang = Math.atan2(p.z - WORLD.hole.z, p.x - WORLD.hole.x);
      p.x = WORLD.hole.x + Math.cos(ang) * (WORLD.hole.r + 1.5);
      p.z = WORLD.hole.z + Math.sin(ang) * (WORLD.hole.r + 1.5);
      p.y = terrainHeight(p.x, p.z) + 2;
      this.vy = 3;
      this.respawnFlash = 0.6;
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
