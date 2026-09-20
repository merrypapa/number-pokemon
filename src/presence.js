// 같이 놀기 1단계: 같은 지역에 있는 친구가 보인다.
// 내 위치(지역·x·z·y·바라보는 방향·대표 포켓몬·움직이는 중인지·감정 표현)를 Firebase Realtime Database 의 presence/{uid} 에 0.3초마다 올리고
// (main.js), 친구들의 presence 를 구독해서 같은 지역에 있는 친구를 이 모듈이 "유령 지우"(반투명 아님, 이름표 달린 지우 모델)로 그린다.
// 서로 부딪히거나 싸우지 않고, 감정 표현(👋 🎉 😆 ❤️)만 머리 위에 잠깐 뜬다. 20초 넘게 소식이 없으면 사라진다.
import * as THREE from 'three';
import { swapDraftWithModel, tickModel } from './models.js';
import { PLAYER_MODEL, PLAYER_HEIGHT } from './player.js';
import { makePillSprite, terrainHeight } from './world.js';
import { lerpAngle } from './util.js';
import { buildDraftMesh, partyScale } from './creatures.js';

export const EMOTES = ['👋', '🎉', '😆', '❤️'];
const STALE_MS = 20000, EMOTE_MS = 3000;

function makeGhost(name) {
  const g = new THREE.Group();
  const draft = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 0.4, 6, 12), new THREE.MeshStandardMaterial({ color: 0x3b82f6 }));
  body.position.y = 0.55;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.34, 16, 14), new THREE.MeshStandardMaterial({ color: 0xffe0bd }));
  head.position.y = 1.2;
  draft.add(body, head);
  g.add(draft);
  g.userData.draft = draft;
  swapDraftWithModel(g, PLAYER_MODEL, { scale: PLAYER_HEIGHT, onSwap: (m) => { m.userData.popT = 1; m.scale.setScalar(PLAYER_HEIGHT); } });
  const tag = makePillSprite(`👫 ${name}`, { bg: '#20232e', fg: '#ffffff', border: '#57b947' }, 0.5);
  tag.position.y = PLAYER_HEIGHT + 0.5;
  g.add(tag);
  return g;
}
/** 감정 표현 말풍선 스프라이트 (내 머리 위·친구 머리 위에 같은 모양) */
export function makeEmoteSprite(emoji) {
  const s = makePillSprite(emoji, { bg: '#ffffff', fg: '#20232e', border: '#ffd93d' }, 0.8);
  s.position.y = PLAYER_HEIGHT + 1.2;
  return s;
}

export class Ghosts {
  constructor(speciesById = {}) { this.speciesById = speciesById; this.map = new Map(); this.scene = null; this.zoneName = null; this.seen = new Set(); this.onAppear = () => {}; }
  removeGhost(g) { g.mesh.parent?.remove(g.mesh); g.pet?.parent?.remove(g.pet); }
  /** 지역이 바뀌면 이전 지역의 유령을 모두 치운다 */
  setZone(scene, zoneName) {
    for (const g of this.map.values()) this.removeGhost(g);
    this.map.clear(); this.seen.clear();
    this.scene = scene; this.zoneName = zoneName;
  }
  /** 친구들의 최신 presence 목록으로 유령을 맞춘다. list: [{uid,name,zone,x,z,y,f,l,m,e,et,at}] */
  sync(list, now = Date.now()) {
    if (!this.scene) return;
    const keep = new Set();
    for (const p of list) {
      if (!p || p.zone !== this.zoneName || typeof p.x !== 'number' || typeof p.z !== 'number') continue;
      if (p.at && now - p.at > STALE_MS) continue;
      keep.add(p.uid);
      let g = this.map.get(p.uid);
      if (!g) {
        g = { mesh: makeGhost(p.name || '친구'), target: new THREE.Vector3(p.x, p.y || 0, p.z), facing: p.f || 0, moving: false, vx: 0, vz: 0, predicted: 0, emote: null, emoteAt: 0, emoteSprite: null, name: p.name || '친구' };
        g.mesh.position.copy(g.target);
        this.scene.add(g.mesh);
        this.map.set(p.uid, g);
        if (!this.seen.has(p.uid)) { this.seen.add(p.uid); this.onAppear(g.name); }
      }
      if (p.x !== g.lastX || p.z !== g.lastZ || p.at !== g.lastAt) { // 새 소식: 목표를 옮기고 예측을 처음부터
        g.target.set(p.x, p.y || 0, p.z); g.predicted = 0; g.lastX = p.x; g.lastZ = p.z; g.lastAt = p.at;
      }
      g.vx = p.vx || 0; g.vz = p.vz || 0;
      g.facing = p.f || 0;
      g.moving = !!p.m;
      if ((p.l || null) !== (g.leaderId || null)) { // 친구의 대표 포켓몬이 뒤를 따라온다 (바뀌면 새로)
        g.pet?.parent?.remove(g.pet); g.pet = null; g.leaderId = p.l || null;
        const sp = p.l ? this.speciesById[p.l] : null;
        if (sp) { g.pet = buildDraftMesh(sp); g.pet.scale.setScalar(partyScale(sp)); g.pet.position.copy(g.mesh.position); this.scene.add(g.pet); }
      }
      if (p.e && p.et && p.et !== g.emoteAt && now - p.et < EMOTE_MS + 5000) { g.emoteAt = p.et; g.emote = p.e; g.emoteShown = now; }
    }
    for (const [uid, g] of this.map) if (!keep.has(uid)) { this.removeGhost(g); this.map.delete(uid); }
  }
  update(dt, now = Date.now()) {
    for (const g of this.map.values()) {
      const m = g.mesh;
      // 소식은 0.1초마다 오니 그 사이는 친구의 속도로 앞을 내다본다(최대 0.35초). 그래서 끊기지 않고 미끄러지듯 움직인다
      if (g.moving && g.predicted < 0.35) { const step = Math.min(dt, 0.35 - g.predicted); g.target.x += g.vx * step; g.target.z += g.vz * step; g.predicted += step; }
      const k = 1 - Math.exp(-dt * 12);
      m.position.x += (g.target.x - m.position.x) * k;
      m.position.z += (g.target.z - m.position.z) * k;
      const ground = terrainHeight(m.position.x, m.position.z);
      m.position.y += (Math.max(ground, g.target.y) - m.position.y) * k;
      m.rotation.y = lerpAngle(m.rotation.y, g.facing, 0.3);
      tickModel(m, dt, g.moving ? 'walk' : 'idle');
      if (g.pet) { // 대표 포켓몬: 친구 뒤 1.6m 를 따라온다
        const pet = g.pet, back = 1.6;
        const tx = m.position.x - Math.sin(g.facing) * back, tz = m.position.z - Math.cos(g.facing) * back;
        const kp = 1 - Math.exp(-dt * 6);
        const ddx = tx - pet.position.x, ddz = tz - pet.position.z, dd = Math.hypot(ddx, ddz);
        pet.position.x += ddx * kp; pet.position.z += ddz * kp;
        pet.position.y += (terrainHeight(pet.position.x, pet.position.z) - pet.position.y) * kp;
        if (dd > 0.2) pet.rotation.y = lerpAngle(pet.rotation.y, Math.atan2(ddx, ddz), 0.25);
        tickModel(pet, dt, dd > 0.3 ? 'walk' : 'idle');
      }
      // 감정 표현: 3초 동안 머리 위에
      if (g.emote && g.emoteShown && now - g.emoteShown < EMOTE_MS) {
        if (!g.emoteSprite) { g.emoteSprite = makeEmoteSprite(g.emote); m.add(g.emoteSprite); }
        g.emoteSprite.position.y = PLAYER_HEIGHT + 1.2 + Math.sin(now / 150) * 0.08;
      } else if (g.emoteSprite) { m.remove(g.emoteSprite); g.emoteSprite = null; g.emote = null; }
    }
  }
  /** 이 자리에서 r 안에 있는 친구 이름들 */
  nearby(pos, r = 15) { const out = []; for (const g of this.map.values()) if (g.mesh.position.distanceTo(pos) < r) out.push(g.name); return out; }
  get count() { return this.map.size; }
}
