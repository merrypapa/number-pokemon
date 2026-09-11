import * as THREE from 'three';
import { addFace, makeBlockMesh } from './util.js';
import { terrainHeight } from './world.js';

// 숫자블록 친구: 블록 개수 = 숫자. 맨 위 블록에 얼굴.
export function buildNumberblockMesh(nb) {
  const g = new THREE.Group();
  const color = new THREE.Color(nb.color || '#ffffff');
  for (let i = 0; i < nb.number; i++) {
    const b = makeBlockMesh(color);
    b.position.y = 0.3 + i * 0.6;
    g.add(b);
  }
  addFace(g, { y: 0.3 + (nb.number - 1) * 0.6 + 0.05, z: 0.31, spread: 0.13, size: 0.05 });
  return g;
}

export class Numberblock {
  constructor(scene, data, pos) {
    this.data = data;
    this.mesh = buildNumberblockMesh(data);
    this.mesh.position.set(pos.x, terrainHeight(pos.x, pos.z), pos.z);
    this.rescued = false;
    this.t = 0;
    scene.add(this.mesh);
  }
  get position() { return this.mesh.position; }
}

// 파트너들이 플레이어 뒤를 줄지어 따라온다.
export class FollowChain {
  constructor(leader) {
    this.leader = leader;
    this.followers = []; // { mesh, t }
  }
  add(mesh) { this.followers.push({ mesh, t: Math.random() * 10 }); }
  update(dt) {
    let prev = this.leader.position;
    for (const f of this.followers) {
      f.t += dt;
      const p = f.mesh.position;
      const dx = prev.x - p.x, dz = prev.z - p.z;
      const dist = Math.hypot(dx, dz);
      const want = 1.4;
      if (dist > want) {
        const step = Math.min(dist - want, 7 * dt);
        p.x += (dx / dist) * step;
        p.z += (dz / dist) * step;
        f.mesh.rotation.y = Math.atan2(dx, dz);
        p.y = terrainHeight(p.x, p.z) + Math.abs(Math.sin(f.t * 10)) * 0.12;
      } else {
        p.y = terrainHeight(p.x, p.z) + Math.abs(Math.sin(f.t * 3)) * 0.03;
      }
      prev = p;
    }
  }
}
