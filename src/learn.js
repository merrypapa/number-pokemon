// 학습 기록. 숫자블록 퀴즈를 종류(tier)별로 몇 개 맞히고 몇 개 틀렸는지 세어 두었다가 세 가지에 쓴다.
//  ① 복습   — 틀린 종류는 "빚"으로 남겨 두었다가, 그 종류가 나오는 지역에서 다시, 조금 쉽게 내 준다.
//              맞히면 빚이 지워진다. (예전에는 한 번 틀리면 그 문제가 그냥 사라졌다)
//  ② 난이도 — 종류별 정답률을 보고 숫자 크기를 올리고 내린다. 잘하면 큰 수, 어려워하면 작은 수.
//  ③ 배움 탭 — 무엇을 잘하고 무엇을 같이 연습하면 좋은지, 최근에 틀린 문제가 무엇이었는지 보여 준다.
//
// tier 는 문제의 종류다. 0(상식)은 행성·꿀벌집 퀴즈라서 난이도 조절 대상이 아니고 기록만 한다.

export const TIER_NAME = { 0: '상식', 1: '세기', 2: '더하기', 3: '빼기', 4: '10 만들기', 5: '세 무리 더하기', 6: '곱하기', 7: '세제곱', 8: '나누기' };
/** 그 종류의 문제가 나오는 곳 (배움 탭에서 "어디 가면 연습할 수 있는지" 알려 준다) */
export const TIER_WHERE = { 0: '행성 · 꿀벌집', 1: '지하동굴', 2: '푸른숲', 3: '물의길', 4: '지하동굴', 5: '푸른숲', 6: '불의산', 7: '꿈의우주', 8: '물의길' };
/** 지역마다 나올 수 있는 문제 종류 (앞에서부터 쉬운 쪽) */
const ZONE_TIERS = { forest: [2, 5], cave: [1, 4], sea: [3, 8], volcano: [6], space: [7] };

const MAX_MISSES = 8;   // 배움 탭에 남겨 두는 "최근 틀린 문제" 개수
const FADE_AT = 20;     // 한 종류를 이만큼 풀면 기록을 반으로 줄인다 (옛날 실력보다 요즘 실력을 보려고)

export const emptyLearn = () => ({ tiers: {}, debt: {}, wk: {}, lastWk: null, misses: [] });

/** 저장 파일에서 읽어 올 때 (없거나 모양이 깨졌으면 빈 기록으로) */
export function loadLearn(d) {
  const L = emptyLearn();
  if (!d || typeof d !== 'object') return L;
  for (const key of ['tiers', 'wk']) if (d[key] && typeof d[key] === 'object') {
    for (const [t, r] of Object.entries(d[key])) {
      if (!TIER_NAME[t]) continue;
      L[key][t] = { ok: Math.max(0, r?.ok | 0), no: Math.max(0, r?.no | 0) };
    }
  }
  if (d.lastWk && typeof d.lastWk === 'object') {
    L.lastWk = {};
    for (const [t, r] of Object.entries(d.lastWk)) if (TIER_NAME[t]) L.lastWk[t] = { ok: Math.max(0, r?.ok | 0), no: Math.max(0, r?.no | 0) };
  }
  if (d.debt && typeof d.debt === 'object') for (const [t, n] of Object.entries(d.debt)) if (TIER_NAME[t] && n > 0) L.debt[t] = Math.min(3, n | 0);
  if (Array.isArray(d.misses)) L.misses = d.misses.filter((m) => m && TIER_NAME[m.tier]).slice(0, MAX_MISSES).map((m) => ({ tier: m.tier | 0, text: String(m.text || '').slice(0, 120), answer: m.answer, zone: m.zone || null }));
  return L;
}

const rec = (L, t) => L.tiers[t] || { ok: 0, no: 0 };

/** 그 종류의 단계: 0 쉬움 · 1 보통 · 2 어려움.
 *  복습할 빚이 있으면 무조건 쉬움부터 (틀린 걸 또 어렵게 내면 더 미워진다).
 *  ignoreDebt 면 빚을 빼고 실력만 본다 — 배움 탭은 "한 번 틀렸다고 실력이 쉬움"으로 보이면 안 되니까. */
export function levelFor(L, tier, ignoreDebt = false) {
  if (!ignoreDebt && L.debt[tier] > 0) return 0;
  const r = rec(L, tier), n = r.ok + r.no;
  if (n < 3) return 1;                 // 아직 몇 번 안 풀어 봤으면 보통
  const acc = r.ok / n;
  if (acc >= 0.8) return 2;
  if (acc <= 0.5) return 0;
  return 1;
}

/** 이번에 낼 문제: 어떤 종류를, 어느 단계로. 복습할 빚이 있는 종류를 먼저 고른다. */
export function planFor(L, zone, number) {
  const tiers = ZONE_TIERS[zone];
  if (!tiers) return { tier: 0, level: 1, review: false };          // 행성·꿀벌집: 상식 퀴즈
  const owed = tiers.find((t) => L.debt[t] > 0);
  if (owed) return { tier: owed, level: 0, review: true };
  let tier;
  if (zone === 'forest') tier = number >= 7 ? 5 : 2;                // 큰 친구는 세 무리 더하기
  else if (zone === 'cave') tier = number <= 4 ? 1 : 4;             // 작은 친구는 세기부터
  else if (zone === 'sea') tier = Math.random() < 0.5 ? 3 : 8;      // 빼기 반, 나누기 반
  else tier = tiers[0];
  return { tier, level: levelFor(L, tier), review: false };
}

/** 문제를 풀고 난 뒤. 맞히면 그 종류의 빚이 하나 지워지고, 틀리면 빚이 하나 쌓인다. */
export function record(L, { tier, ok, text, answer, zone }) {
  if (!TIER_NAME[tier]) return;
  for (const key of ['tiers', 'wk']) {
    const r = (L[key][tier] ||= { ok: 0, no: 0 });
    r[ok ? 'ok' : 'no']++;
    if (key === 'tiers' && r.ok + r.no > FADE_AT) { r.ok = Math.round(r.ok / 2); r.no = Math.round(r.no / 2); }
  }
  if (ok) { if (L.debt[tier] > 0 && --L.debt[tier] <= 0) delete L.debt[tier]; return; }
  if (tier) L.debt[tier] = Math.min(3, (L.debt[tier] || 0) + 1);    // 세 번까지만 쌓아 둔다
  // 상식(0)은 복습 빚을 지지 않는다 — 문제가 정해진 묶음에서 나오고 난이도도 없어서 "쉽게 다시"가 없다 (틀린 문제 목록에는 남는다)
  L.misses.unshift({ tier, text: String(text || '').slice(0, 120), answer, zone: zone || null });
  L.misses.length = Math.min(L.misses.length, MAX_MISSES);
}

/** 새로운 한 주: 이번 주 기록을 지난주로 옮긴다 (통산 기록과 복습 빚은 그대로 간다) */
export function rollWeek(L) {
  const had = Object.values(L.wk).some((r) => r.ok + r.no > 0);
  L.lastWk = had ? JSON.parse(JSON.stringify(L.wk)) : L.lastWk;
  L.wk = {};
}

const sum = (m) => Object.values(m || {}).reduce((a, r) => ({ ok: a.ok + r.ok, no: a.no + r.no }), { ok: 0, no: 0 });

/** 배움 탭에 뿌릴 자료. which: 'wk' 이번 주 · 'tiers' 통산 */
export function learnRows(L, which = 'wk') {
  const src = which === 'tiers' ? L.tiers : L.wk;
  return Object.keys(TIER_NAME)
    .map(Number)
    .map((tier) => {
      const r = src[tier] || { ok: 0, no: 0 };
      const n = r.ok + r.no;
      return { tier, name: TIER_NAME[tier], where: TIER_WHERE[tier], ok: r.ok, no: r.no, n, acc: n ? r.ok / n : null, level: tier ? levelFor(L, tier, true) : null, owed: L.debt[tier] > 0 };
    })
    .filter((row) => row.n > 0);
}

/** 한눈 요약: 제일 잘하는 것과 같이 연습하면 좋은 것 (각각 다섯 문제 이상 푼 종류 중에서) */
export function learnSummary(L, which = 'wk') {
  const rows = learnRows(L, which);
  const total = sum(which === 'tiers' ? L.tiers : L.wk);
  const enough = rows.filter((r) => r.n >= 3 && r.tier);
  const best = enough.length ? enough.reduce((a, b) => (b.acc > a.acc ? b : a)) : null;
  const weak = enough.length ? enough.reduce((a, b) => (b.acc < a.acc ? b : a)) : null;
  return {
    rows, total,
    acc: total.ok + total.no ? total.ok / (total.ok + total.no) : null,
    best: best && best.acc >= 0.7 ? best : null,
    weak: weak && weak.acc < 0.7 ? weak : null,
    last: L.lastWk ? sum(L.lastWk) : null,
    misses: L.misses,
  };
}
