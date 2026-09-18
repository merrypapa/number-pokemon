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
  KeyC: 'car', // 이상해꽃 자동차 타기/내리기 (한 번 탄 뒤부터)
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
    if ('ontouchstart' in window || navigator.maxTouchPoints > 0) { touch.classList.remove('hidden'); document.body.classList.add('touch'); }

    touch.querySelectorAll('button').forEach((btn) => {
      // 키는 누를 때 읽는다 (점프 버튼은 NPC·기차 근처에서 '대화'·'타기' 버튼으로 바뀐다: data-key 가 action 이 된다)
      let heldKey = null;
      const down = (e) => { e.preventDefault(); const k = btn.dataset.key; heldKey = k; if (!this.held.has(k)) this.pressed.add(k); this.held.add(k); };
      const up = (e) => { e.preventDefault(); if (heldKey) this.held.delete(heldKey); heldKey = null; };
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
      // 이미 잡고 있는 손가락이 있어도 새 손가락이 오면 넘겨받는다 (놓침 이벤트를 못 받아 굳었을 때 스스로 풀린다)
      e.preventDefault();
      const rect = base.getBoundingClientRect();
      j.active = true; j.id = e.pointerId; j.cx = rect.left + rect.width / 2; j.cy = rect.top + rect.height / 2;
      base.classList.add('active');
      try { zone.setPointerCapture(e.pointerId); } catch (_) { /* 합성 이벤트 등 */ }
      place(e);
    });
    zone.addEventListener('pointermove', (e) => { if (j.active && e.pointerId === j.id) place(e); });
    zone.addEventListener('lostpointercapture', (e) => { if (e.pointerId === j.id) release(); });
    // 손가락이 원 밖으로 나가 다른 요소 위에서 떼어져도 반드시 풀리도록 window 에서 받는다
    const joyEnd = (e) => { if (j.active && e.pointerId === j.id) release(); };
    window.addEventListener('pointerup', joyEnd, true);
    window.addEventListener('pointercancel', joyEnd, true);

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
    window.addEventListener('pointerup', endLook, true);
    window.addEventListener('pointercancel', endLook, true);

    // 안전장치: 손가락이 하나도 안 남았거나(iOS 가 pointerup 을 삼킬 때), 창이 가려지면 모든 입력을 놓는다
    const releaseAll = () => { release(); L.id = null; this.held.clear(); };
    window.addEventListener('touchend', (e) => { if (e.touches.length === 0) releaseAll(); }, { passive: true });
    window.addEventListener('touchcancel', (e) => { if (e.touches.length === 0) releaseAll(); }, { passive: true });
    window.addEventListener('blur', releaseAll);
    document.addEventListener('visibilitychange', () => { if (document.hidden) releaseAll(); });
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
