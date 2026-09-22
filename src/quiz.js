import { josa } from './util.js';
// 숫자블록 퀴즈. 숫자블록 친구가 낸 문제를 포켓몬 마리 수로 풀고, 맞히면 친구가 고마워하며 블록을 준다.
// 답을 고르면 정답이든 오답이든 "왜 그런지" 한 줄 풀이(explain)를 보여 준다.
//
// 어떤 종류(tier)를 어느 단계(level 0 쉬움 · 1 보통 · 2 어려움)로 낼지는 학습 기록이 정한다 (src/learn.js).
// 틀린 종류는 "빚"으로 남아 다음에 그 지역에서 다시, 쉬운 단계로 나온다 (복습).
// 지역마다 나오는 종류:
//  - 푸른숲: 더하기 · 세 무리 더하기      "피카츄 3마리와 파이리 2마리, 모두 몇 마리?"
//  - 지하동굴: 세기 · 10 만들기           "꼬부기 6마리. 몇 마리 더 오면 10마리?"
//  - 물의길: 빼기 · 나누기                "이상해씨 7마리 중 3마리가 숨었어. 남은 건?"
//  - 불의산: 곱하기                       "파이리가 3마리씩 4무리. 모두 몇 마리? (3×4)"
//  - 꿈의우주: 세제곱                     "케이시가 3마리씩 3줄, 그런 층이 3층. (3×3×3)"
//  - 행성(p_*) · 꿀벌집: 숫자 대신 상식 퀴즈 (src/planetquiz.js)
import { makePlanetProblem, TRIVIA_ZONE } from './planetquiz.js';
import { PLANET_BY_ZONE, planetSvg } from './planets.js';
import { TIER_NAME, planFor, record as recordLearn } from './learn.js';
const ri = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const rr = (range, level) => ri(...range[Math.max(0, Math.min(2, level))]); // 단계에 맞는 숫자 범위에서 하나
// 단계별 숫자 범위 (0 쉬움 → 2 어려움)
const RANGE = {
  count: [[3, 6], [3, 9], [6, 14]],   // 세기: 몇 마리인지
  add:   [[1, 3], [1, 5], [3, 9]],    // 더하기: 각 무리의 마리 수
  add3:  [[1, 3], [1, 5], [2, 7]],    // 세 무리 더하기
  sub:   [[3, 6], [4, 9], [8, 14]],   // 빼기: 처음 마리 수
  ten:   [[6, 9], [2, 8], [1, 9]],    // 10 만들기: 이미 있는 마리 수 (쉬울수록 10에 가깝다)
  mulA:  [[2, 3], [2, 4], [2, 5]],    // 곱하기: 한 무리의 마리 수
  mulB:  [[2, 3], [2, 3], [2, 4]],    // 곱하기: 무리 수
  divG:  [[2, 2], [2, 3], [2, 4]],    // 나누기: 무리 수
  divE:  [[2, 3], [2, 4], [2, 5]],    // 나누기: 한 무리의 마리 수
};

/** plan: { tier, level, review } — 없으면 학습 기록 없이 보통 단계로 (src/learn.js planFor) */
export function makeProblem(number, species, zone = 'forest', plan = null) {
  if (PLANET_BY_ZONE[zone] || TRIVIA_ZONE[zone]) return makePlanetProblem(zone); // 행성·꿀벌집에서는 상식 퀴즈
  const p = plan || { tier: zone === 'cave' ? 4 : zone === 'sea' ? 3 : zone === 'volcano' ? 6 : zone === 'space' ? 7 : 2, level: 1, review: false };
  const lv = p.level ?? 1;
  const pool = [...species];
  const pick = () => pool.splice(Math.floor(Math.random() * pool.length), 1)[0];
  const A = pick(), B = pick(), C = pick();
  const tag = { tier: p.tier, review: !!p.review };

  if (p.tier === 1) { // 세기
    const k = rr(RANGE.count, lv);
    return { ...tag, text: `${josa(A.name, '이가')} 모두 몇 마리일까?`, groups: [{ sp: A, count: k }], answer: k, hint: '손가락으로 하나씩 세어 봐: 1, 2, 3…', explain: `하나씩 세면 ${Array.from({ length: k }, (_, i) => i + 1).join(', ')} — 모두 ${k}마리야!` };
  }
  if (p.tier === 2) { // 더하기
    const a = rr(RANGE.add, lv), b = rr(RANGE.add, lv);
    return { ...tag, text: `${A.name} ${a}마리와 ${B.name} ${b}마리가 모였어. 모두 몇 마리?`, groups: [{ sp: A, count: a }, { sp: B, count: b }], answer: a + b, hint: `${a}에서 ${b}만큼 더 세어 봐!`, explain: `${a} + ${b} = ${a + b}. ${a}에서 ${b}만큼 더 세면 ${josa(a + b, '이가')} 돼!` };
  }
  if (p.tier === 5) { // 세 무리 더하기
    const a = rr(RANGE.add3, lv), b = rr(RANGE.add3, lv), c = rr(RANGE.add3, lv);
    return { ...tag, text: `${A.name} ${a}마리, ${B.name} ${b}마리, ${C.name} ${c}마리. 모두 몇 마리?`, groups: [{ sp: A, count: a }, { sp: B, count: b }, { sp: C, count: c }], answer: a + b + c, hint: `먼저 ${josa(a, '과와')} ${josa(b, '을를')} 더하고, 거기에 ${josa(c, '을를')} 더해 봐!`, explain: `${a} + ${b} = ${a + b}, 거기에 ${josa(c, '을를')} 더하면 ${a + b + c}!` };
  }
  if (p.tier === 4) { // 10 만들기
    const a = rr(RANGE.ten, lv);
    return { ...tag, text: `${A.name} ${a}마리가 있어. ${josa(B.name, '이가')} 몇 마리 더 오면 10마리가 될까?`, groups: [{ sp: A, count: a }, { sp: B, count: 10 - a, ghost: true }], answer: 10 - a, hint: `${a}에서 10까지 몇 칸 남았는지 세어 봐!`, explain: `${a} + ${10 - a} = 10. ${a}에서 ${10 - a}만큼 더 가면 10이 돼!` };
  }
  if (p.tier === 8) { // 나누기
    const groups = rr(RANGE.divG, lv), each = rr(RANGE.divE, lv), total = groups * each;
    return { ...tag, text: `${A.name} ${total}마리를 ${groups}무리로 똑같이 나누면 한 무리에 몇 마리? (${total}÷${groups})`, groups: [{ sp: A, count: total }], answer: each, choices: [each + 1, groups, total - groups], hint: `${groups}무리에 한 마리씩 돌아가며 나눠 봐. ${each}씩 ${groups}번이면 ${total}!`, explain: `${total} ÷ ${groups} = ${each}. ${each}마리씩 ${groups}무리면 ${Array(groups).fill(each).join('+')} = ${total}이니까!` };
  }
  if (p.tier === 3) { // 빼기
    const a = rr(RANGE.sub, lv), b = ri(1, a - 1);
    return { ...tag, text: `${A.name} ${a}마리 중 ${b}마리가 숨었어. 남은 ${josa(A.name, '은는')} 몇 마리?`, groups: [{ sp: A, count: a, faded: b }], answer: a - b, hint: '흐려진 친구는 빼고 남은 친구만 세어 봐!', explain: `${a} - ${b} = ${a - b}. ${a}마리에서 숨은 ${b}마리를 빼면 ${a - b}마리가 남아!` };
  }
  if (p.tier === 6) { // 곱하기
    const a = rr(RANGE.mulA, lv), b = rr(RANGE.mulB, lv);
    return { ...tag, text: `${josa(A.name, '이가')} ${a}마리씩 ${b}무리 있어. 모두 몇 마리? (${a}×${b})`, groups: Array.from({ length: b }, () => ({ sp: A, count: a })), answer: a * b, choices: [a * b + a, a * b - a > 0 ? a * b - a : a + b], hint: `${a}를 ${b}번 더해 봐: ${Array(b).fill(a).join('+')}`, explain: `${a} × ${b} = ${a * b}. ${a}를 ${b}번 더하면 ${Array(b).fill(a).join('+')} = ${a * b}!` };
  }
  // 세제곱 (tier 7): n×n×n
  const n = lv <= 0 ? 2 : lv === 1 ? 3 : 4;
  return { ...tag, text: `${josa(A.name, '이가')} ${n}마리씩 ${n}줄로 서 있고, 그런 층이 ${n}층이야. 모두 몇 마리? (${n}×${n}×${n})`, groups: [...Array.from({ length: n }, () => ({ sp: A, count: n })), { sp: A, count: 0, note: `⬆ 이런 층이 ${n}층!` }], answer: n ** 3, choices: [n * n, n * n * (n - 1) || n * n + n], hint: `한 층은 ${n}×${n}=${n * n}마리. 그걸 ${n}번 더해 봐: ${Array(n).fill(n * n).join('+')}`, explain: `${n} × ${n} × ${n} = ${n ** 3}. 한 층이 ${n * n}마리, 그런 층이 ${n}층이니 ${Array(n).fill(n * n).join('+')} = ${n ** 3}!` };
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
  constructor({ dex, species, sound, learn = null }) {
    Object.assign(this, { dex, species, sound, learn });
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
   * 숫자블록(number, name)이 낸 퀴즈를 보여 준다. 기회는 한 번뿐이다.
   * 답을 고르면 정답/오답과 풀이(explain)를 카드에 보여 주고, "확인" 버튼(또는 몇 초 뒤 자동)으로 닫힌다.
   * Promise 는 'ok'(맞힘) · 'wrong'(틀림 — 그 친구는 가 버린다) · 'skip'("나중에") 중 하나로 끝난다.
   * 닫힌 뒤 마지막 문제(정답·풀이)는 this.last 에 남아 있어서 말풍선에 쓸 수 있다.
   */
  ask(number, name, zone = 'forest') {
    return new Promise((resolve) => {
      this.resolve = resolve;
      this.number = number;
      this.done = false; // 답을 고른 뒤에는 더 못 고른다 (풀이를 보여 주는 동안)
      this.result = null; // 답을 고른 뒤의 결과 ('ok' | 'wrong') — 확인 버튼·ESC 로 닫아도 이 결과로 끝난다
      this.zone = zone;
      this.plan = this.learn ? planFor(this.learn, zone, number) : null;   // 복습할 빚이 있으면 그 종류를 쉽게
      this.problem = makeProblem(number, this.species, zone, this.plan);
      this.last = this.problem;
      this.planet = PLANET_BY_ZONE[zone] || TRIVIA_ZONE[zone] || null; // 상식 퀴즈의 제목(이모지·이름)과 그림
      this.render(name);
      this.el.classList.remove('hidden');
      this.open = true;
    });
  }

  render(name) {
    const p = this.problem;
    const kindName = p.trivia ? `${this.planet.emoji} ${this.planet.name} 상식` : TIER_NAME[p.tier];
    this.titleEl.textContent = `${name}의 퀴즈 · ${kindName}${p.review ? ' 🔁 다시 도전' : ''}`;
    this.titleEl.classList.remove('right', 'wrong');
    this.hintEl.classList.remove('right', 'wrong');
    this.skipBtn.textContent = '나중에';
    this.skipBtn.classList.remove('confirm');
    this.textEl.textContent = p.text;
    this.hintEl.textContent = p.review ? `지난번에 ${josa(kindName, '을를')} 아쉽게 틀렸지? 이번엔 쉬운 걸로 다시 내 볼게!`
      : p.trivia ? '기회는 한 번이야. 잘 생각해서 골라!' : '기회는 한 번이야. 잘 세어 보고 골라!';
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
    // 정답이든 오답이든 카드에 "왜 그런지" 풀이를 보여 주고, 확인 버튼(또는 몇 초 뒤 자동)으로 닫는다
    const ok = c === p.answer;
    this.result = ok ? 'ok' : 'wrong';
    if (this.learn) recordLearn(this.learn, { tier: p.tier, ok, text: p.text, answer: p.answer, zone: this.zone });
    btn.classList.add(ok ? 'right' : 'wrong');
    if (ok) this.sound?.fanfare(); else this.sound?.bounce();
    for (const b of this.choicesEl.children) if (b.dataset.value === String(p.answer)) b.classList.add('right');
    const why = p.explain || p.hint || '';
    this.titleEl.textContent = ok ? (p.review ? '🎉 이번엔 맞혔어!' : '🎉 정답이야!') : `😢 아쉬워, 정답은 ${p.answer}`;
    this.titleEl.classList.add(ok ? 'right' : 'wrong');
    this.hintEl.textContent = why;
    this.hintEl.classList.add(ok ? 'right' : 'wrong');
    this.skipBtn.textContent = '확인 ✔';
    this.skipBtn.classList.add('confirm');
    this.skipBtn.disabled = false;
    clearTimeout(this.autoClose);
    this.autoClose = setTimeout(() => this.finish(this.result), p.trivia ? 9000 : 7000); // 풀이를 읽을 시간을 넉넉히 주고 저절로 닫힌다
  }

  /** result: 'ok' | 'wrong' | 'skip' */
  finish(result) {
    if (!this.open) return;
    clearTimeout(this.autoClose);
    if (this.done) result = this.result; // 답을 고른 뒤에는 어떻게 닫아도(확인·ESC·자동) 그 결과로 끝난다
    this.el.classList.add('hidden');
    this.open = false;
    const r = this.resolve; this.resolve = null;
    r?.(result);
  }
}
