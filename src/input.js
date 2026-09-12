// 키보드 + 고정 가상 조이스틱 + 화면 드래그(카메라 회전). 이동은 아날로그 축(axis), 버튼은 점프/액션.
const KEYMAP = {
  ArrowUp: 'up', KeyW: 'up',
  ArrowDown: 'down', KeyS: 'down',
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
  Space: 'jump',
  KeyE: 'action', Enter: 'action',
  Escape: 'cancel',
  KeyQ: 'camLeft', KeyR: 'camRight',
  KeyB: 'dex',
  Digit1: 'skill1', Digit2: 'skill2', Digit3: 'skill3', Digit4: 'skill4', // 대결에서 기술 바로 쓰기
  ShiftLeft: 'run', ShiftRight: 'run', ControlLeft: 'run', ControlRight: 'run', // 달리기 (누르고 이동)
};

const JOY_RADIUS = 55; // 스틱이 움직이는 최대 반지름(px)

export class Input {
  constructor() {
    this.held = new Set();
    this.pressed = new Set(); // 이번 프레임에 눌린 것
    this.enabled = true;
    this.joy = { active: false, id: null, cx: 0, cy: 0, x: 0, y: 0 };
    this.look = { dx: 0, dy: 0, id: null, lastX: 0, lastY: 0 }; // 화면 드래그 누적량 (main 이 매 프레임 소비)

    window.addEventListener('keydown', (e) => {
      const k = KEYMAP[e.code];
      if (!k) return;
      e.preventDefault();
      if (!this.held.has(k)) this.pressed.add(k);
      this.held.add(k);
    });
    window.addEventListener('keyup', (e) => {
      const k = KEYMAP[e.code];
      if (k) this.held.delete(k);
    });

    // 터치 UI (조이스틱 + 버튼)
    const touch = document.getElementById('touch');
    if ('ontouchstart' in window || navigator.maxTouchPoints > 0) touch.classList.remove('hidden');

    touch.querySelectorAll('button').forEach((btn) => {
      const k = btn.dataset.key;
      const down = (e) => { e.preventDefault(); if (!this.held.has(k)) this.pressed.add(k); this.held.add(k); };
      const up = (e) => { e.preventDefault(); this.held.delete(k); };
      btn.addEventListener('pointerdown', down);
      btn.addEventListener('pointerup', up);
      btn.addEventListener('pointercancel', up);
      btn.addEventListener('pointerleave', up);
    });

    // 고정 조이스틱: 왼쪽 아래 원 안을 누르고 밀면 움직인다
    const zone = document.getElementById('joy-zone');
    const base = document.getElementById('joy-base');
    const knob = document.getElementById('joy-knob');
    const j = this.joy;
    const place = (e) => {
      let dx = e.clientX - j.cx, dy = e.clientY - j.cy;
      const r = Math.hypot(dx, dy);
      if (r > JOY_RADIUS) { dx *= JOY_RADIUS / r; dy *= JOY_RADIUS / r; }
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      j.x = dx / JOY_RADIUS;
      j.y = dy / JOY_RADIUS;
    };
    const release = () => {
      j.active = false; j.id = null; j.x = 0; j.y = 0;
      knob.style.transform = 'translate(0px, 0px)';
      base.classList.remove('active');
    };
    zone.addEventListener('pointerdown', (e) => {
      if (j.active) return;
      e.preventDefault();
      const rect = base.getBoundingClientRect();
      j.active = true; j.id = e.pointerId; j.cx = rect.left + rect.width / 2; j.cy = rect.top + rect.height / 2;
      base.classList.add('active');
      try { zone.setPointerCapture(e.pointerId); } catch (_) { /* 합성 이벤트 등 */ }
      place(e);
    });
    zone.addEventListener('pointermove', (e) => { if (j.active && e.pointerId === j.id) place(e); });
    zone.addEventListener('pointerup', (e) => { if (e.pointerId === j.id) release(); });
    zone.addEventListener('pointercancel', (e) => { if (e.pointerId === j.id) release(); });

    // 화면 드래그 → 카메라 회전 (조이스틱/버튼/패널 위가 아닌 게임 화면)
    const canvas = document.getElementById('game');
    const L = this.look;
    canvas.addEventListener('pointerdown', (e) => {
      if (L.id !== null) return;
      L.id = e.pointerId; L.lastX = e.clientX; L.lastY = e.clientY;
      try { canvas.setPointerCapture(e.pointerId); } catch (_) { /* */ }
    });
    canvas.addEventListener('pointermove', (e) => {
      if (e.pointerId !== L.id) return;
      L.dx += e.clientX - L.lastX; L.dy += e.clientY - L.lastY;
      L.lastX = e.clientX; L.lastY = e.clientY;
    });
    const endLook = (e) => { if (e.pointerId === L.id) L.id = null; };
    canvas.addEventListener('pointerup', endLook);
    canvas.addEventListener('pointercancel', endLook);
  }

  /** 이동 축(화면 기준). x: 왼쪽(-1)~오른쪽(+1), y: 위(-1)~아래(+1). 길이는 최대 1. */
  getAxis() {
    if (!this.enabled) return { x: 0, y: 0 };
    let x = 0, y = 0;
    if (this.joy.active && Math.hypot(this.joy.x, this.joy.y) > 0.12) {
      x = this.joy.x; y = this.joy.y;
    } else {
      if (this.held.has('left')) x -= 1;
      if (this.held.has('right')) x += 1;
      if (this.held.has('up')) y -= 1;
      if (this.held.has('down')) y += 1;
    }
    const len = Math.hypot(x, y);
    if (len > 1) { x /= len; y /= len; }
    return { x, y };
  }

  /** 이번 프레임의 화면 드래그량(px)을 꺼내고 0으로 되돌린다 */
  takeLook() {
    const r = { dx: this.look.dx, dy: this.look.dy };
    this.look.dx = 0; this.look.dy = 0;
    return r;
  }

  isHeld(k) { return this.enabled && this.held.has(k); }
  wasPressed(k) { return this.enabled && this.pressed.has(k); }
  endFrame() { this.pressed.clear(); }
}
