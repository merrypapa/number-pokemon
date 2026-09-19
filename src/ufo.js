import * as THREE from 'three';
import { makeNpc } from './npc.js';
import { makePillSprite } from './world.js';

// UFO(비행접시)와 UFO 정거장. 꿈의우주와 각 행성에 하나씩 있고, 조종사 손오공에게 말을 걸면 탈 수 있다.
// 정거장은 착륙 패드(빛나는 고리 셋 + 유도등 넷) 위에 비행접시가 떠 있고, 옆에 손오공이 서 있다.
export const UFO_NPC_NAME = '손오공'; // UFO 조종사 (손오공.glb)

/** 비행접시: 은빛 접시 + 투명 돔 + 테두리 색등 12개 + 아래 빛나는 배 + 다리 셋. userData 에 lights/beam/glow 를 둔다 */
export function makeUfo() {
  const g = new THREE.Group();
  const hull = new THREE.MeshStandardMaterial({ color: 0xe4e9f2, metalness: 0.2, roughness: 0.35 }); // 환경맵이 없어 금속성을 낮게 (높으면 어둡게 보인다)
  const saucer = new THREE.Mesh(new THREE.SphereGeometry(2.6, 36, 18), hull);
  saucer.scale.y = 0.3; saucer.position.y = 0.9; saucer.castShadow = true;
  const rim = new THREE.Mesh(new THREE.TorusGeometry(2.45, 0.22, 12, 48), new THREE.MeshStandardMaterial({ color: 0x4a4f66, metalness: 0.4, roughness: 0.5 }));
  rim.rotation.x = Math.PI / 2; rim.position.y = 0.9;
  const dome = new THREE.Mesh(new THREE.SphereGeometry(1.15, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x9fe8ff, transparent: true, opacity: 0.5, roughness: 0.1, metalness: 0.1 }));
  dome.position.y = 1.5;
  const domeRing = new THREE.Mesh(new THREE.TorusGeometry(1.15, 0.08, 8, 32), new THREE.MeshStandardMaterial({ color: 0x4a4f66, metalness: 0.4 }));
  domeRing.rotation.x = Math.PI / 2; domeRing.position.y = 1.5;
  const belly = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.55, 0.5, 20), new THREE.MeshStandardMaterial({ color: 0x66e0ff, emissive: 0x33c0ff, emissiveIntensity: 1.2 }));
  belly.position.y = 0.35;
  g.add(saucer, rim, dome, domeRing, belly);
  const lights = [];
  const cols = [0xff5c8a, 0xffd93d, 0x6cff8a, 0x66e0ff];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2, col = cols[i % 4];
    const l = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 1 }));
    l.position.set(Math.cos(a) * 2.45, 0.9, Math.sin(a) * 2.45);
    l.userData.i = i;
    g.add(l); lights.push(l);
  }
  const legMat = new THREE.MeshStandardMaterial({ color: 0x7a8090, metalness: 0.5 });
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.5;
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.1, 6), legMat);
    leg.position.set(Math.cos(a) * 1.45, 0.25, Math.sin(a) * 1.45);
    leg.rotation.z = Math.cos(a) * 0.35; leg.rotation.x = -Math.sin(a) * 0.35;
    const foot = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), legMat);
    foot.position.set(Math.cos(a) * 1.65, -0.25, Math.sin(a) * 1.65);
    g.add(leg, foot);
  }
  // 빔: 타고 내릴 때만 보이는 하늘색 빛기둥 (위가 좁고 아래가 넓다)
  const beam = new THREE.Mesh(new THREE.ConeGeometry(1.9, 4.5, 24, 1, true), new THREE.MeshBasicMaterial({ color: 0x9fe8ff, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false }));
  beam.position.y = -1.95; beam.visible = false;
  const glow = new THREE.PointLight(0x66e0ff, 2.5, 12);
  glow.position.y = 0.2;
  g.add(beam, glow);
  g.userData = { lights, beam, glow, riding: false };
  return g;
}

/**
 * UFO 정거장을 세운다. to: 타면 가는 곳('space' = 행성에서 꿈의우주로 돌아간다, null = 팝업에서 행성을 고른다).
 * 돌려주는 값: vehicle(main 의 ride 가 쓴다) · npc(손오공) · animate(t) · arrival(도착해서 내리는 자리)
 */
export function buildUfoStation(scene, decor, block, { x, z, heightFn, to = null, color = 0x66e0ff, lines }) {
  const y = heightFn(x, z);
  const pad = new THREE.Mesh(new THREE.CylinderGeometry(5.2, 5.6, 0.35, 32), new THREE.MeshStandardMaterial({ color: 0x3a3f55, roughness: 0.8 }));
  pad.position.set(x, y + 0.17, z);
  pad.userData.noHide = true;
  decor.add(pad);
  const rings = [];
  for (const [r, c] of [[4.6, color], [3.0, 0xffffff], [1.4, color]]) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.09, 8, 48), new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 1.2 }));
    ring.rotation.x = Math.PI / 2; ring.position.set(x, y + 0.37, z);
    ring.userData.noHide = true;
    decor.add(ring); rings.push(ring);
  }
  const lampMat = new THREE.MeshStandardMaterial({ color: 0xffd93d, emissive: 0xffb300, emissiveIntensity: 1 });
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const px = x + Math.cos(a) * 5.0, pz = z + Math.sin(a) * 5.0, py = heightFn(px, pz);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 1.6, 8), new THREE.MeshStandardMaterial({ color: 0x7a8090 }));
    post.position.set(px, py + 0.8, pz);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), lampMat);
    lamp.position.set(px, py + 1.7, pz);
    decor.add(post, lamp); block(px, pz, 0.25);
  }
  const ufo = makeUfo();
  const baseY = y + 0.35;
  ufo.position.set(x, baseY + 1.0, z);
  scene.add(ufo);
  const obstacle = { x, z, r: 2.9 };
  block(x, z, obstacle.r);
  const sign = makePillSprite('🛸 UFO 정거장', { bg: '#1f2a3a', fg: '#9fe8ff', border: '#66e0ff' }, 1.0);
  sign.position.set(x, y + 5.4, z);
  scene.add(sign);
  const nx = x - 4.4, nz = z + 4.4;
  const pilot = makeNpc({ outfit: 'pilot', name: UFO_NPC_NAME, model: '손오공.glb' });
  pilot.position.set(nx, heightFn(nx, nz), nz);
  pilot.rotation.y = -2.3;
  decor.add(pilot); block(nx, nz, 0.6);
  const npc = { x: nx, z: nz, mesh: pilot, name: UFO_NPC_NAME, boards: 'ufo', ufo: true, lines };
  const vehicle = { kind: 'ufo', mesh: ufo, base: new THREE.Vector3(x, baseY, z), obstacle, boardPoint: { x: x - 2.6, z: z + 2.6 }, to, beam: ufo.userData.beam };
  function animate(t) {
    if (!ufo.userData.riding) { // 정거장에 떠서 천천히 돈다 (타고 있을 때는 main 이 움직인다)
      ufo.position.y = baseY + 1.0 + Math.sin(t * 1.4) * 0.18;
      ufo.rotation.y = t * 0.35;
      ufo.rotation.z = Math.sin(t * 0.9) * 0.03;
    }
    for (const l of ufo.userData.lights) l.material.emissiveIntensity = 0.5 + 0.5 * Math.sin(t * 6 - l.userData.i * 0.55);
    rings.forEach((r, i) => { r.material.emissiveIntensity = 0.8 + 0.6 * Math.sin(t * 3 + i * 1.2); });
  }
  return { vehicle, npc, animate, arrival: { x: x - 3.6, z: z + 6.0 } };
}

/** 하이퍼스페이스 연출: 화면 전체 캔버스에 별이 가운데에서 바깥으로 줄지어 날아간다 (UFO 로 행성 사이를 오갈 때) */
export class WarpFx {
  constructor(el, canvas, textEl) { this.el = el; this.c = canvas; this.textEl = textEl; this.on = false; this.stars = []; this.k = 0; }
  spawn(init) { return { a: Math.random() * Math.PI * 2, r: init ? Math.random() : Math.random() * 0.12, s: 0.4 + Math.random() * 0.9, hue: Math.random() }; }
  start(text, tint = '#66e0ff') {
    this.on = true; this.k = 0;
    this.textEl.textContent = text;
    this.el.style.setProperty('--warp', tint);
    this.stars = Array.from({ length: 260 }, () => this.spawn(true));
    const ctx = this.c.getContext('2d'); ctx.clearRect(0, 0, this.c.width, this.c.height);
    this.el.classList.add('on');
  }
  stop() { this.on = false; this.el.classList.remove('on'); }
  update(dt, speed = 1) {
    if (!this.on) return;
    const c = this.c, w = c.clientWidth, h = c.clientHeight;
    if (!w || !h) return;
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    const ctx = c.getContext('2d');
    ctx.fillStyle = 'rgba(4,2,20,0.32)'; ctx.fillRect(0, 0, w, h);
    const cx = w / 2, cy = h / 2, R = Math.hypot(cx, cy);
    this.k = Math.min(1, this.k + dt * 0.8);
    ctx.lineCap = 'round';
    for (const s of this.stars) {
      const r0 = s.r;
      s.r += (0.05 + s.r * 2.2) * s.s * dt * speed * (0.4 + this.k);
      if (s.r > 1.05) { Object.assign(s, this.spawn(false)); continue; }
      const x0 = cx + Math.cos(s.a) * r0 * R, y0 = cy + Math.sin(s.a) * r0 * R, x1 = cx + Math.cos(s.a) * s.r * R, y1 = cy + Math.sin(s.a) * s.r * R;
      ctx.strokeStyle = `hsla(${200 + s.hue * 70}, 100%, ${70 + s.r * 30}%, ${0.3 + s.r * 0.7})`;
      ctx.lineWidth = 0.6 + s.r * 3;
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    }
  }
}
