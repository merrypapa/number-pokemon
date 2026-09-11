// 키보드 + 가상 조이스틱 입력. 이동은 아날로그 축(axis), 버튼은 점프/액션 두 개.
const KEYMAP = {
  ArrowUp: 'up', KeyW: 'up',
  ArrowDown: 'down', KeyS: 'down',
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
  Space: 'jump',
  KeyE: 'action', Enter: 'action',
  Escape: 'cancel',
};

const JOY_RADIUS = 55; // 스틱이 움직이는 최대 반지름(px)

export class Input {
  constructor() {
    this.held = new Set();
    this.pressed = new Set(); // 이번 프레임에 눌린 것
    this.enabled = true;
    this.joy = { active: false, id: null, cx: 0, cy: 0, x: 0, y: 0 };

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

    // 가상 조이스틱: 왼쪽 영역 아무 데나 누르면 그 자리에 스틱이 생긴다
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
      base.classList.add('hidden');
    };
    zone.addEventListener('pointerdown', (e) => {
      if (j.active) return;
      e.preventDefault();
      j.active = true; j.id = e.pointerId; j.cx = e.clientX; j.cy = e.clientY;
      base.style.left = `${e.clientX}px`;
      base.style.top = `${e.clientY}px`;
      base.classList.remove('hidden');
      try { zone.setPointerCapture(e.pointerId); } catch (_) { /* 합성 이벤트 등 */ }
      place(e);
    });
    zone.addEventListener('pointermove', (e) => { if (j.active && e.pointerId === j.id) place(e); });
    zone.addEventListener('pointerup', (e) => { if (e.pointerId === j.id) release(); });
    zone.addEventListener('pointercancel', (e) => { if (e.pointerId === j.id) release(); });
  }

  /** 이동 축. x: 왼쪽(-1)~오른쪽(+1), y: 위(-1)~아래(+1). 길이는 최대 1. */
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

  isHeld(k) { return this.enabled && this.held.has(k); }
  wasPressed(k) { return this.enabled && this.pressed.has(k); }
  endFrame() { this.pressed.clear(); }
}
