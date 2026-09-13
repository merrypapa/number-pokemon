// 숫자블록 구출 문제. 포켓몬 마리 수를 세거나 더하고 빼는 문제를 내고, 맞히면 구출된다.
// 구출할 숫자블록의 숫자가 클수록 어려운 문제가 나온다.
//  - 2~3: 세기            "피카츄가 모두 몇 마리?"
//  - 4~5: 더하기          "피카츄 3마리와 파이리 2마리, 모두 몇 마리?"
//  - 6~7: 빼기            "이상해씨 7마리 중 3마리가 숨었어. 남은 건?"
//  - 8~9: 10 만들기       "꼬부기 6마리. 몇 마리 더 오면 10마리?"
//  - 10 : 세 무리 더하기   "3마리, 4마리, 5마리, 모두 몇 마리?"
const ri = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const TIER_NAME = { 1: '세기', 2: '더하기', 3: '빼기', 4: '10 만들기', 5: '세 무리 더하기' };

export function makeProblem(number, species) {
  const pool = [...species];
  const pick = () => pool.splice(Math.floor(Math.random() * pool.length), 1)[0];
  const A = pick(), B = pick(), C = pick();
  if (number <= 3) {
    const k = ri(2, 6);
    return { tier: 1, text: `${A.name}이(가) 모두 몇 마리일까?`, groups: [{ sp: A, count: k }], answer: k, hint: '손가락으로 하나씩 세어 봐: 1, 2, 3…' };
  }
  if (number <= 5) {
    const a = ri(1, 5), b = ri(1, 5);
    return { tier: 2, text: `${A.name} ${a}마리와 ${B.name} ${b}마리가 모였어. 모두 몇 마리?`, groups: [{ sp: A, count: a }, { sp: B, count: b }], answer: a + b, hint: `${a}에서 ${b}만큼 더 세어 봐!` };
  }
  if (number <= 7) {
    const a = ri(4, 9), b = ri(1, a - 1);
    return { tier: 3, text: `${A.name} ${a}마리 중 ${b}마리가 숨었어. 남은 ${A.name}은(는) 몇 마리?`, groups: [{ sp: A, count: a, faded: b }], answer: a - b, hint: '흐려진 친구는 빼고 남은 친구만 세어 봐!' };
  }
  if (number <= 9) {
    const a = ri(2, 8);
    return { tier: 4, text: `${A.name} ${a}마리가 있어. ${B.name}이(가) 몇 마리 더 오면 10마리가 될까?`, groups: [{ sp: A, count: a }, { sp: B, count: 10 - a, ghost: true }], answer: 10 - a, hint: `${a}에서 10까지 몇 칸 남았는지 세어 봐!` };
  }
  const a = ri(1, 5), b = ri(1, 5), c = ri(1, 5);
  return { tier: 5, text: `${A.name} ${a}마리, ${B.name} ${b}마리, ${C.name} ${c}마리. 모두 몇 마리?`, groups: [{ sp: A, count: a }, { sp: B, count: b }, { sp: C, count: c }], answer: a + b + c, hint: `먼저 ${a}과(와) ${b}을(를) 더하고, 거기에 ${c}을(를) 더해 봐!` };
}

function choicesFor(answer) {
  const set = new Set([answer]);
  let guard = 0;
  while (set.size < 3 && guard++ < 50) {
    const d = ri(1, 3) * (Math.random() < 0.5 ? -1 : 1);
    if (answer + d >= 0) set.add(answer + d);
  }
  return [...set].sort(() => Math.random() - 0.5);
}

export class Quiz {
  constructor({ dex, species, sound }) {
    Object.assign(this, { dex, species, sound });
    this.el = document.getElementById('quiz');
    this.titleEl = document.getElementById('quiz-title');
    this.textEl = document.getElementById('quiz-text');
    this.iconsEl = document.getElementById('quiz-icons');
    this.choicesEl = document.getElementById('quiz-choices');
    this.hintEl = document.getElementById('quiz-hint');
    this.skipBtn = document.getElementById('btn-quiz-skip');
    this.skipBtn.onclick = () => this.finish(false);
    this.open = false;
  }

  /** 숫자블록(number, name)을 구출하는 문제를 낸다. 맞히면 true, "나중에"면 false 로 끝나는 Promise. */
  ask(number, name) {
    return new Promise((resolve) => {
      this.resolve = resolve;
      this.number = number;
      this.wrong = 0;
      this.problem = makeProblem(number, this.species);
      this.render(name);
      this.el.classList.remove('hidden');
      this.open = true;
    });
  }

  render(name) {
    const p = this.problem;
    this.titleEl.textContent = `${name} 구출 문제 · ${TIER_NAME[p.tier]}`;
    this.textEl.textContent = p.text;
    this.hintEl.textContent = '';
    this.iconsEl.innerHTML = '';
    for (const g of p.groups) {
      const row = document.createElement('div');
      row.className = 'quiz-row';
      const t = this.dex.thumbs(g.sp);
      for (let i = 0; i < g.count; i++) {
        const cell = document.createElement('div');
        cell.className = 'quiz-cell' + (g.faded && i >= g.count - g.faded ? ' faded' : '') + (g.ghost ? ' ghost' : '');
        cell.innerHTML = g.ghost ? '<span>?</span>' : (t ? `<img src="${t.color}" alt="${g.sp.name}">` : `<span>${g.sp.name[0]}</span>`);
        cell.title = g.sp.name;
        row.appendChild(cell);
      }
      const label = document.createElement('div');
      label.className = 'quiz-label';
      label.textContent = g.ghost ? `${g.sp.name} ?마리` : `${g.sp.name} ${g.count}마리${g.faded ? ` (${g.faded}마리 숨음)` : ''}`;
      row.appendChild(label);
      this.iconsEl.appendChild(row);
    }
    this.choicesEl.innerHTML = '';
    for (const c of choicesFor(p.answer)) {
      const b = document.createElement('button');
      b.textContent = String(c);
      b.onclick = () => this.answer(c, b);
      this.choicesEl.appendChild(b);
    }
  }

  answer(c, btn) {
    if (!this.open) return;
    if (c === this.problem.answer) {
      btn.classList.add('right');
      this.sound?.fanfare();
      setTimeout(() => this.finish(true), 500);
    } else {
      this.wrong++;
      btn.classList.add('wrong');
      btn.disabled = true;
      this.sound?.bounce();
      this.hintEl.textContent = this.wrong >= 2 ? `힌트: ${this.problem.hint}` : '음… 다시 한 번 세어 볼까?';
    }
  }

  finish(ok) {
    this.el.classList.add('hidden');
    this.open = false;
    const r = this.resolve; this.resolve = null;
    r?.(ok);
  }
}
