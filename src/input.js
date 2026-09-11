// 키보드 + 터치 버튼 입력. 게임 전체에서 딱 세 가지(이동, 점프, 액션)만 쓴다.
const KEYMAP = {
  ArrowUp: 'up', KeyW: 'up',
  ArrowDown: 'down', KeyS: 'down',
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
  Space: 'jump',
  KeyE: 'action', Enter: 'action',
  Escape: 'cancel',
};

export class Input {
  constructor() {
    this.held = new Set();
    this.pressed = new Set(); // 이번 프레임에 눌린 것
    this.enabled = true;

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

    // 터치 버튼
    const touch = document.getElementById('touch');
    if ('ontouchstart' in window || navigator.maxTouchPoints > 0) {
      touch.classList.remove('hidden');
    }
    touch.querySelectorAll('button').forEach((btn) => {
      const k = btn.dataset.key;
      const down = (e) => { e.preventDefault(); if (!this.held.has(k)) this.pressed.add(k); this.held.add(k); };
      const up = (e) => { e.preventDefault(); this.held.delete(k); };
      btn.addEventListener('pointerdown', down);
      btn.addEventListener('pointerup', up);
      btn.addEventListener('pointercancel', up);
      btn.addEventListener('pointerleave', up);
    });
  }

  isHeld(k) { return this.enabled && this.held.has(k); }
  wasPressed(k) { return this.enabled && this.pressed.has(k); }
  endFrame() { this.pressed.clear(); }
}
