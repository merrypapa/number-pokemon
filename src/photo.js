import * as THREE from 'three';

// 사진 모드. 주인공과 따라다니는 친구들이 카메라를 보고 줄을 서고, 3·2·1 뒤에 찰칵.
// 찍은 그림은 액자와 글씨를 붙여 PNG 로 만들어 준다 (모달에서 "저장" 을 누르면 받아진다).
//
// 화면을 그대로 찍는다: 게임 캔버스는 preserveDrawingBuffer 가 꺼져 있어서, 그린 직후 같은 프레임 안에서만
// 읽을 수 있다. 그래서 프레임 루프가 renderer.render(...) 를 부른 바로 다음에 afterRender() 를 부른다.

const COUNT = 3;          // 3 → 2 → 1
const STEP = 0.85;        // 숫자 하나에 머무는 시간(초)
const HOLD = 0.35;        // "찰칵" 직전에 잠깐 멈춤

export class Photo {
  constructor({ sound = null } = {}) {
    this.sound = sound;
    this.active = false;
    this.countEl = document.getElementById('photo-count');
    this.flashEl = document.getElementById('photo-flash');
  }

  /**
   * scene 안의 주인공·친구들을 세우고 카메라를 앞으로 옮긴다.
   * poses: [{ mesh, x, z }] 가 아니라 여기서 직접 자리를 잡는다.
   */
  start({ camera, player, followers = [], groundY = () => 0, caption = '', onShot = null, onEnd = null }) {
    if (this.active) return false;
    this.active = true;
    this.camera = camera;
    this.onShot = onShot;
    this.onEnd = onEnd;
    this.caption = caption;
    this.t = 0;
    this.want = false;
    this.shot = false;
    this.pose = [];   // 잡아 준 포즈 (매 프레임 다시 맞춰 준다)

    // 되돌리려고 지금 상태를 적어 둔다
    this.savedCam = { pos: camera.position.clone(), quat: camera.quaternion.clone() };
    this.savedPoses = [{ mesh: player.group, pos: player.group.position.clone(), rotY: player.group.rotation.y },
      ...followers.map((m) => ({ mesh: m, pos: m.position.clone(), rotY: m.rotation.y }))];

    const p = player.position;
    const yaw = player.facing || 0;
    const fwd = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));   // 주인공이 보는 쪽
    const right = new THREE.Vector3(fwd.z, 0, -fwd.x);
    player.group.rotation.y = yaw;                       // 주인공은 카메라를 본다

    // 친구들은 주인공 좌우로 한 줄씩 벌려 선다. 세로 화면(휴대폰)은 가로가 좁으니 더 붙여 세운다.
    const narrow = camera.aspect < 1.1;
    const spread = narrow ? 0.78 : 1;
    followers.forEach((m, i) => {
      const side = i % 2 ? 1 : -1, rank = Math.floor(i / 2);
      const off = (0.95 + rank * 0.9) * spread;
      const back = 0.15 + rank * 0.75;                   // 뒷줄은 뒤로 (앞줄에 안 가리게)
      const x = p.x + right.x * side * off - fwd.x * back;
      const z = p.z + right.z * side * off - fwd.z * back;
      m.position.set(x, groundY(x, z), z);
      m.visible = true;
      this.pose.push({ mesh: m, x, y: m.position.y, z, rotY: 0 });
    });
    this.pose.push({ mesh: player.group, x: p.x, y: player.group.position.y, z: p.z, rotY: yaw });

    // 모두를 화면에 담을 만큼 카메라를 뒤로 뺀다.
    // 서 있는 것들의 진짜 크기(Box3)를 재서 정한다 — 블록 더미는 개수에 따라 아주 높아질 수 있어서,
    // 거리를 고정해 두면 더미 꼭대기나 양 끝 친구가 잘렸다.
    const all = [player.group, ...followers];
    for (const o of all) o.updateWorldMatrix(true, true);
    const bb = new THREE.Box3();
    let lMin = Infinity, lMax = -Infinity, top = -Infinity, bottom = Infinity;
    for (const o of all) {
      bb.setFromObject(o);
      if (!Number.isFinite(bb.min.x) || !Number.isFinite(bb.max.y)) continue;
      top = Math.max(top, bb.max.y); bottom = Math.min(bottom, bb.min.y);
      for (const cx of [bb.min.x, bb.max.x]) for (const cz of [bb.min.z, bb.max.z]) {   // 좌우로 얼마나 벌어져 있나 (카메라의 오른쪽 방향으로 재서)
        const l = (cx - p.x) * right.x + (cz - p.z) * right.z;
        lMin = Math.min(lMin, l); lMax = Math.max(lMax, l);
      }
    }
    if (!Number.isFinite(lMin)) { lMin = -1; lMax = 1; }                // 크기를 못 재면 적당히
    if (!Number.isFinite(top)) { top = p.y + 1.8; bottom = p.y; }
    const lMid = (lMin + lMax) / 2;                                     // 무리의 좌우 한가운데 (주인공이 아니라 여기를 겨눈다)
    const midY = (top + bottom) / 2;
    const halfW = Math.max(0.8, (lMax - lMin) / 2 + 0.35);
    const halfH = Math.max(0.95, (top - bottom) / 2 + 0.3);
    const vHalf = (camera.fov * Math.PI) / 360;                        // 세로 화각의 반
    const hHalf = Math.atan(Math.tan(vHalf) * camera.aspect);          // 가로 화각의 반
    const dist = Math.min(18, Math.max(3.4, Math.max(halfW / Math.tan(hHalf), halfH / Math.tan(vHalf)) * 1.1));
    const aimX = p.x + right.x * lMid, aimZ = p.z + right.z * lMid;
    const camAt = new THREE.Vector3(aimX + fwd.x * dist, midY + 0.3, aimZ + fwd.z * dist);
    camera.position.copy(camAt);
    camera.lookAt(aimX, midY, aimZ);

    for (const q of this.pose) {                         // 이제 카메라 자리가 정해졌으니 다 같이 그쪽을 본다
      if (q.mesh === player.group) continue;             // 주인공은 제 방향(=카메라 쪽)을 그대로 본다
      q.rotY = Math.atan2(camAt.x - q.x, camAt.z - q.z);
      q.mesh.rotation.y = q.rotY;
    }

    this.say(String(COUNT));
    this.sound?.tone?.(660, 0.1, 'square', 0.07);
    return true;
  }

  say(text) {
    if (!this.countEl) return;
    this.countEl.textContent = text;
    this.countEl.classList.remove('hidden', 'pop');
    void this.countEl.offsetWidth;   // 애니메이션을 다시 시작시킨다
    this.countEl.classList.add('pop');
  }

  update(dt) {
    if (!this.active) return;
    for (const q of this.pose) { q.mesh.position.set(q.x, q.y, q.z); q.mesh.rotation.y = q.rotY; } // 포즈 유지
    if (this.shot) return;
    const was = Math.min(COUNT, Math.floor(this.t / STEP));
    this.t += dt;
    const now = Math.min(COUNT, Math.floor(this.t / STEP));
    if (now !== was && now < COUNT) { this.say(String(COUNT - now)); this.sound?.tone?.(660 + now * 110, 0.1, 'square', 0.07); }
    if (this.t >= COUNT * STEP + HOLD) { this.want = true; this.shot = true; this.say('📸'); }
  }

  /** 프레임 루프가 renderer.render(...) 를 부른 바로 다음에 부른다 */
  afterRender(renderer) {
    if (!this.want) return;
    this.want = false;
    let url = null;
    try { url = this.frame(renderer.domElement); } catch (e) { console.warn('[photo]', e); }
    this.flash();
    this.sound?.tone?.(1400, 0.05, 'square', 0.09);
    this.sound?.tone?.(700, 0.07, 'square', 0.06, 0.05);
    setTimeout(() => { this.onShot?.(url); this.end(); }, 420);
  }

  /** 찍은 그림에 액자와 글씨를 붙인다 */
  frame(srcCanvas) {
    const W = srcCanvas.width, H = srcCanvas.height;
    const pad = Math.round(Math.min(W, H) * 0.035), bar = Math.round(Math.min(W, H) * 0.1);
    const c = document.createElement('canvas');
    c.width = W + pad * 2; c.height = H + pad * 2 + bar;
    const g = c.getContext('2d');
    g.fillStyle = '#fffdf5'; g.fillRect(0, 0, c.width, c.height);          // 액자(폴라로이드처럼 아래가 넓다)
    g.drawImage(srcCanvas, pad, pad, W, H);
    g.strokeStyle = '#ffd93d'; g.lineWidth = Math.max(3, pad * 0.35);
    g.strokeRect(pad - g.lineWidth / 2, pad - g.lineWidth / 2, W + g.lineWidth, H + g.lineWidth);
    const fs = Math.round(bar * 0.42);
    g.fillStyle = '#20232e';
    g.font = `900 ${fs}px system-ui, -apple-system, "Apple SD Gothic Neo", "Noto Sans KR", sans-serif`;
    g.textBaseline = 'middle';
    g.fillText(this.caption || '넘버 몬스터 어드벤처', pad, pad + H + bar * 0.55, W);
    return c.toDataURL('image/png');
  }

  flash() {
    const f = this.flashEl;
    if (!f) return;
    f.classList.remove('on');
    void f.offsetWidth;
    f.classList.add('on');
    setTimeout(() => f.classList.remove('on'), 400);
  }

  /** 카메라와 친구들을 원래 자리로 */
  end() {
    if (!this.active) return;
    this.active = false;
    this.countEl?.classList.add('hidden');
    if (this.camera && this.savedCam) { this.camera.position.copy(this.savedCam.pos); this.camera.quaternion.copy(this.savedCam.quat); }
    for (const s of this.savedPoses || []) { s.mesh.position.copy(s.pos); s.mesh.rotation.y = s.rotY; }
    this.savedPoses = null; this.pose = [];
    const done = this.onEnd; this.onEnd = null;
    done?.();
  }
}
