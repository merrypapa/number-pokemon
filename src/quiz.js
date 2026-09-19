// 숫자블록 구출 문제. 포켓몬 마리 수로 문제를 내고, 맞히면 구출된다.
// 지역마다 문제 종류가 다르다 (구출할 숫자블록의 숫자가 7 이상이면 조금 더 어렵게):
//  - 푸른숲: 더하기        "피카츄 3마리와 파이리 2마리, 모두 몇 마리?" (큰 숫자면 세 무리)
//  - 지하동굴: 세기 · 10 만들기  "꼬부기 6마리. 몇 마리 더 오면 10마리?"
//  - 물의길: 빼기 또는 나누기  "이상해씨 7마리 중 3마리가 숨었어. 남은 건?" / "12마리를 3무리로 똑같이 나누면 한 무리에?"
//  - 불의산: 곱하기        "파이리가 3마리씩 4무리. 모두 몇 마리? (3×4)"
//  - 꿈의우주: 세제곱      "케이시가 3마리씩 3줄, 그런 층이 3층. 모두 몇 마리? (3×3×3)"
//  - 행성(p_*): 숫자 문제 대신 그 행성 상식 퀴즈 (src/planetquiz.js, 어린이 눈높이 세 보기)
//  - 꿀벌집: 꿀벌·꿀·벌집 상식 퀴즈 (같은 파일의 HIVE_QUIZ)
import { makePlanetProblem, TRIVIA_ZONE } from './planetquiz.js';
import { PLANET_BY_ZONE, planetSvg } from './planets.js';
const ri = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const TIER_NAME = { 1: '세기', 2: '더하기', 3: '빼기', 4: '10 만들기', 5: '세 무리 더하기', 6: '곱하기', 7: '세제곱', 8: '나누기' };
const ZONE_KIND = { forest: 'add', cave: 'ten', sea: 'sub', volcano: 'mul', space: 'cube' };

export function makeProblem(number, species, zone = 'forest') {
  if (PLANET_BY_ZONE[zone] || TRIVIA_ZONE[zone]) return makePlanetProblem(zone); // 행성·꿀벌집에서는 상식 퀴즈
  const pool = [...species];
  const pick = () => pool.splice(Math.floor(Math.random() * pool.length), 1)[0];
  const A = pick(), B = pick(), C = pick();
  const kind = ZONE_KIND[zone] || 'add';
  const hard = number >= 7;
  if (kind === 'add') {
    if (!hard) {
      const a = ri(1, 5), b = ri(1, 5);
      return { tier: 2, text: `${A.name} ${a}마리와 ${B.name} ${b}마리가 모였어. 모두 몇 마리?`, groups: [{ sp: A, count: a }, { sp: B, count: b }], answer: a + b, hint: `${a}에서 ${b}만큼 더 세어 봐!` };
    }
    const a = ri(1, 5), b = ri(1, 5), c = ri(1, 5);
    return { tier: 5, text: `${A.name} ${a}마리, ${B.name} ${b}마리, ${C.name} ${c}마리. 모두 몇 마리?`, groups: [{ sp: A, count: a }, { sp: B, count: b }, { sp: C, count: c }], answer: a + b + c, hint: `먼저 ${a}과(와) ${b}을(를) 더하고, 거기에 ${c}을(를) 더해 봐!` };
  }
  if (kind === 'ten') {
    if (number <= 4) {
      const k = ri(3, 8);
      return { tier: 1, text: `${A.name}이(가) 모두 몇 마리일까?`, groups: [{ sp: A, count: k }], answer: k, hint: '손가락으로 하나씩 세어 봐: 1, 2, 3…' };
    }
    const a = ri(2, 8);
    return { tier: 4, text: `${A.name} ${a}마리가 있어. ${B.name}이(가) 몇 마리 더 오면 10마리가 될까?`, groups: [{ sp: A, count: a }, { sp: B, count: 10 - a, ghost: true }], answer: 10 - a, hint: `${a}에서 10까지 몇 칸 남았는지 세어 봐!` };
  }
  if (kind === 'sub' && Math.random() < 0.5) { // 물의길: 절반은 나누기
    const groups = ri(2, hard ? 4 : 3), each = ri(2, hard ? 5 : 4), total = groups * each;
    return { tier: 8, text: `${A.name} ${total}마리를 ${groups}무리로 똑같이 나누면 한 무리에 몇 마리? (${total}÷${groups})`, groups: [{ sp: A, count: total }], answer: each, choices: [each + 1, groups, total - groups], hint: `${groups}무리에 한 마리씩 돌아가며 나눠 봐. ${each}씩 ${groups}번이면 ${total}!` };
  }
  if (kind === 'sub') {
    const a = hard ? ri(7, 12) : ri(4, 9), b = ri(1, a - 1);
    return { tier: 3, text: `${A.name} ${a}마리 중 ${b}마리가 숨었어. 남은 ${A.name}은(는) 몇 마리?`, groups: [{ sp: A, count: a, faded: b }], answer: a - b, hint: '흐려진 친구는 빼고 남은 친구만 세어 봐!' };
  }
  if (kind === 'mul') {
    const a = ri(2, hard ? 5 : 4), b = ri(2, hard ? 4 : 3);
    return { tier: 6, text: `${A.name}이(가) ${a}마리씩 ${b}무리 있어. 모두 몇 마리? (${a}×${b})`, groups: Array.from({ length: b }, () => ({ sp: A, count: a })), answer: a * b, choices: [a * b + a, a * b - a > 0 ? a * b - a : a + b], hint: `${a}를 ${b}번 더해 봐: ${Array(b).fill(a).join('+')}` };
  }
  // cube: n×n×n
  const n = number <= 4 ? 2 : number <= 8 ? 3 : 4;
  return { tier: 7, text: `${A.name}이(가) ${n}마리씩 ${n}줄로 서 있고, 그런 층이 ${n}층이야. 모두 몇 마리? (${n}×${n}×${n})`, groups: [...Array.from({ length: n }, () => ({ sp: A, count: n })), { sp: A, count: 0, note: `⬆ 이런 층이 ${n}층!` }], answer: n ** 3, choices: [n * n, n * n * (n - 1) || n * n + n], hint: `한 층은 ${n}×${n}=${n * n}마리. 그걸 ${n}번 더해 봐: ${Array(n).fill(n * n).join('+')}` };
}

function choicesFor(answer, extra = []) {
  const set = new Set([answer, ...extra.filter((v) => v >= 0 && v !== answer)]);
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
    this.skipBtn.onclick = () => this.finish('skip');
    this.open = false;
  }

  /**
   * 숫자블록(number, name)을 구출하는 문제를 낸다. 기회는 한 번뿐이다.
   * Promise 는 'ok'(맞힘) · 'wrong'(틀림 — 그 친구는 가 버린다) · 'skip'("나중에") 중 하나로 끝난다.
   */
  ask(number, name, zone = 'forest') {
    return new Promise((resolve) => {
      this.resolve = resolve;
      this.number = number;
      this.done = false; // 답을 고른 뒤에는 더 못 고른다 (정답을 보여 주는 동안)
      this.problem = makeProblem(number, this.species, zone);
      this.planet = PLANET_BY_ZONE[zone] || TRIVIA_ZONE[zone] || null; // 상식 퀴즈의 제목(이모지·이름)과 그림
      this.render(name);
      this.el.classList.remove('hidden');
      this.open = true;
    });
  }

  render(name) {
    const p = this.problem;
    this.titleEl.textContent = `${name} 구출 문제 · ${p.trivia ? `${this.planet.emoji} ${this.planet.name} 상식 퀴즈` : TIER_NAME[p.tier]}`;
    this.textEl.textContent = p.text;
    this.hintEl.textContent = p.trivia ? '기회는 한 번이야. 잘 생각해서 골라!' : '기회는 한 번이야. 잘 세어 보고 골라!';
    this.skipBtn.disabled = false;
    this.iconsEl.innerHTML = '';
    if (p.trivia) { // 행성 상식: 그림 대신 행성 그림 + 글자 보기 셋
      const art = document.createElement('div');
      art.className = 'quiz-planet';
      art.innerHTML = this.planet.art || planetSvg(this.planet);
      this.iconsEl.appendChild(art);
      this.choicesEl.innerHTML = '';
      for (const c of p.choices) {
        const b = document.createElement('button');
        b.className = 'text';
        b.textContent = c;
        b.dataset.value = c;
        b.onclick = () => this.answer(c, b);
        this.choicesEl.appendChild(b);
      }
      return;
    }
    for (const g of p.groups) {
      const row = document.createElement('div');
      row.className = 'quiz-row';
      if (g.note) { row.classList.add('note'); row.textContent = g.note; this.iconsEl.appendChild(row); continue; }
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
    for (const c of choicesFor(p.answer, p.choices || [])) {
      const b = document.createElement('button');
      b.textContent = String(c);
      b.dataset.value = String(c);
      b.onclick = () => this.answer(c, b);
      this.choicesEl.appendChild(b);
    }
  }

  answer(c, btn) {
    if (!this.open || this.done) return;
    const p = this.problem;
    this.done = true;
    this.skipBtn.disabled = true;
    for (const b of this.choicesEl.children) b.disabled = true;
    if (c === p.answer) {
      btn.classList.add('right');
      this.sound?.fanfare();
      setTimeout(() => this.finish('ok'), 500);
      return;
    }
    // 기회는 한 번. 틀리면 정답을 보여 주고 문제가 끝난다 (숫자블록은 가 버린다)
    btn.classList.add('wrong');
    this.sound?.bounce();
    for (const b of this.choicesEl.children) if (b.dataset.value === String(p.answer)) b.classList.add('right');
    this.hintEl.textContent = `정답은 ${p.answer}! ${p.hint}`;
    setTimeout(() => this.finish('wrong'), p.trivia ? 4200 : 2600); // 정답을 볼 시간을 준다 (상식 퀴즈는 설명이 길다)
  }

  /** result: 'ok' | 'wrong' | 'skip' */
  finish(result) {
    if (!this.open) return;
    this.el.classList.add('hidden');
    this.open = false;
    const r = this.resolve; this.resolve = null;
    r?.(result);
  }
}
