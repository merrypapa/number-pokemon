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

    // 주인공이 보는 쪽 앞에 카메라를 둔다 (셀카처럼 마주 본다)
    const p = player.position;
    const yaw = player.facing || 0;
    const fwd = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    const right = new THREE.Vector3(fwd.z, 0, -fwd.x);
    const camAt = new THREE.Vector3(p.x + fwd.x * 4.6, p.y + 1.55, p.z + fwd.z * 4.6);
    camera.position.copy(camAt);
    camera.lookAt(p.x, p.y + 0.75, p.z);
    player.group.rotation.y = yaw;                       // 주인공은 카메라를 본다

    // 친구들은 주인공 좌우로 한 줄씩 벌려 서서 카메라를 본다
    followers.forEach((m, i) => {
      const side = i % 2 ? 1 : -1, rank = Math.floor(i / 2);
      const off = 1.0 + rank * 0.95;
      const back = 0.1 + rank * 0.45;                    // 뒷줄은 조금 뒤로 (다 보이게)
      const x = p.x + right.x * side * off - fwd.x * back;
      const z = p.z + right.z * side * off - fwd.z * back;
      m.position.set(x, groundY(x, z), z);
      m.rotation.y = Math.atan2(camAt.x - x, camAt.z - z);
      m.visible = true;
      this.pose.push({ mesh: m, x, y: m.position.y, z, rotY: m.rotation.y });
    });
    this.pose.push({ mesh: player.group, x: p.x, y: player.group.position.y, z: p.z, rotY: yaw });

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
