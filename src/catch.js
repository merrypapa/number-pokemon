import { colorForCount } from './palette.js';

// 잡기 모드 UI. 블록을 쌓아 몬스터가 좋아하는 숫자를 맞춘다. 벌칙 없음, 3번 틀리면 원이가 같이 세어준다.
export class CatchMode {
  constructor(input, say) {
    this.input = input;
    this.say = say;
    this.el = document.getElementById('catch');
    this.nameEl = document.getElementById('catch-monster-name');
    this.hintEl = document.getElementById('catch-hint');
    this.stackEl = document.getElementById('catch-stack');
    this.countEl = document.getElementById('catch-count');
    this.fbEl = document.getElementById('catch-feedback');
    this.active = false;
    this.count = 0;
    document.getElementById('btn-plus').onclick = () => this.change(1);
    document.getElementById('btn-minus').onclick = () => this.change(-1);
    document.getElementById('btn-show').onclick = () => this.show();
  }

  open(creature, blocksOwned, onDone) {
    this.active = true;
    this.creature = creature;
    this.max = blocksOwned;
    this.onDone = onDone;
    this.count = 0;
    this.misses = 0;
    this.locked = false;
    this.nameEl.textContent = creature.data.name;
    this.hintEl.textContent = creature.data.favoriteNumber;
    this.fbEl.textContent = '';
    this.fbEl.className = '';
    this.render();
    this.el.classList.remove('hidden');
    if (blocksOwned < creature.data.favoriteNumber) {
      this.fbEl.textContent = `블록이 ${creature.data.favoriteNumber - blocksOwned}개 모자라요. 더 주워오자!`;
    }
  }

  close(result) {
    this.active = false;
    this.el.classList.add('hidden');
    this.onDone?.(result);
  }

  change(d) {
    if (!this.active || this.locked) return;
    const next = this.count + d;
    if (next < 0) return;
    if (next > this.max) {
      this.fbEl.className = '';
      this.fbEl.textContent = '가진 블록을 다 썼어요. 초원에서 더 주워오자!';
      return;
    }
    this.count = next;
    this.fbEl.textContent = '';
    this.render();
  }

  render() {
    // 블록을 n개 쌓으면 숫자블록 n의 색이 된다 (원이=빨강, 둘이=주황, 셋이=노랑…)
    this.stackEl.innerHTML = '';
    const color = colorForCount(this.count);
    for (let i = 0; i < this.count; i++) {
      const b = document.createElement('div');
      b.className = 'stack-block';
      b.style.background = color;
      this.stackEl.appendChild(b);
    }
    this.countEl.textContent = this.count;
  }

  show() {
    if (!this.active || this.locked) return;
    const want = this.creature.data.favoriteNumber;
    if (this.count === want) {
      this.locked = true;
      this.fbEl.className = 'good';
      this.fbEl.textContent = `딱 맞아요! ${this.creature.data.name}이(가) 친구가 되었어요!`;
      [...this.stackEl.children].forEach((b) => b.classList.add('highlight'));
      setTimeout(() => this.close('caught'), 1300);
      return;
    }
    this.misses++;
    this.fbEl.className = '';
    this.fbEl.textContent = this.count > want ? '음… 너무 많아요!' : '음… 조금 모자라요!';
    if (this.misses >= 3 && this.max >= want) this.countTogether(want);
  }

  // 원이가 하나, 둘, 셋… 같이 세어준다.
  countTogether(want) {
    this.locked = true;
    this.count = 0;
    this.render();
    const words = ['하나', '둘', '셋', '넷', '다섯', '여섯', '일곱', '여덟', '아홉', '열'];
    let i = 0;
    const tick = () => {
      if (!this.active) return;
      i++;
      this.count = i;
      this.render();
      [...this.stackEl.children].forEach((b) => b.classList.add('highlight'));
      this.fbEl.className = 'good';
      this.fbEl.textContent = `원이: ${words.slice(0, i).join(', ')}!`;
      if (i < want) setTimeout(tick, 600);
      else {
        this.fbEl.textContent += ' 이제 보여주자!';
        this.locked = false;
      }
    };
    setTimeout(tick, 500);
  }

  update() {
    if (!this.active) return;
    if (this.input.wasPressed('up')) this.change(1);
    if (this.input.wasPressed('down')) this.change(-1);
    if (this.input.wasPressed('action') || this.input.wasPressed('jump')) this.show();
    if (this.input.wasPressed('cancel')) this.close('later');
  }
}
