import { TYPE_CHART, TYPES, effectiveness, strongAgainst, weakTo } from './types.js';
// 상성 수업 (포켓몬 학교의 오박사 선생님): 속성 상성표를 그림으로 배우고 다섯 문제 상성 퀴즈를 푼다.
//  - 수업: 아이가 외우기 쉬운 고리(불 > 풀 > 물 > 불, 전기 > 물, 땅 > 전기)부터 보여 주고, 전체 "굉장해!" 짝을 칩으로 나열한다.
//  - 퀴즈: 상성표에서 그때그때 만든다 (어느 속성이 강한지 · 굉장한 상대 · 별로인 상대 · 실제 포켓몬 둘을 놓고 "굉장해/별로/보통").
//  - 보상(main): 맞힌 문제마다 블록 2개. 하루에 한 번, 3개 이상 맞히면 물약 1개, 다 맞히면 브론즈볼 1개를 더 준다.
//  - 상성 스티커: 대결에서 "효과가 굉장했다!"를 내면 그 짝(공격 속성 → 상대 속성)이 도감 미션 탭의 상성표에 켜진다 (state.typeSeen). 5짝·15짝 스티커.

export const TYPE_EMOJI = { '불': '🔥', '물': '💧', '풀': '🌿', '전기': '⚡', '땅': '🏜️', '바위': '🪨', '벌레': '🐛', '독': '🧪', '에스퍼': '🔮', '고스트': '👻', '페어리': '🎀', '격투': '👊', '노말': '⭐' };
export const typeTag = (t) => `${TYPE_EMOJI[t] || '✨'} ${t}`;

/** 모든 "굉장해!" 짝 [{atk, def}] (상성표의 1.5 배 칸). 28 짝 */
export const STRONG_PAIRS = [];
for (const [atk, row] of Object.entries(TYPE_CHART)) for (const [def, v] of Object.entries(row)) if (v > 1) STRONG_PAIRS.push({ atk, def, id: `${atk}>${def}` });
export const pairId = (atk, def) => `${atk}>${def}`;
/** 왜 그런지 한 줄 (아이 말로). 없는 짝은 상성표 그대로 */
const WHY = {
  '불>풀': '불은 풀을 태워.', '불>벌레': '벌레는 불을 무서워해.', '물>불': '물은 불을 꺼.', '물>땅': '물은 흙을 진흙으로 만들어.', '물>바위': '물은 바위를 깎아.',
  '풀>물': '풀은 물을 쭉쭉 빨아들여.', '풀>땅': '풀은 땅에 뿌리를 내려.', '풀>바위': '풀뿌리는 바위도 뚫어.', '전기>물': '물은 전기가 잘 통해 찌릿!',
  '땅>불': '흙을 덮으면 불이 꺼져.', '땅>전기': '전기는 땅으로 흘러 사라져.', '땅>바위': '땅이 흔들리면 바위가 굴러.', '땅>독': '독은 흙에 스며 사라져.',
  '바위>불': '바위는 불에 타지 않아.', '바위>벌레': '바위에 벌레는 꼼짝 못 해.', '벌레>풀': '벌레는 풀잎을 갉아먹어.', '벌레>에스퍼': '벌레는 생각이 안 통해.',
  '독>풀': '독은 풀을 시들게 해.', '독>페어리': '요정은 독에 약해.', '에스퍼>독': '마음의 힘은 독을 밀어내.', '에스퍼>격투': '힘보다 생각이 빨라.',
  '고스트>에스퍼': '유령은 마음속으로 쑥!', '고스트>고스트': '유령은 유령끼리 통해.', '페어리>고스트': '요정의 빛은 유령을 쫓아.', '페어리>격투': '요정의 마법은 주먹보다 세.',
  '격투>노말': '주먹은 보통 포켓몬에게 아파.', '격투>바위': '주먹으로 바위를 깨!',
};
export const whyStrong = (atk, def) => WHY[pairId(atk, def)] || `${atk}은(는) ${def}에 강해.`;

const ri = (n) => Math.floor(Math.random() * n);
const shuffle = (arr) => { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = ri(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const pick = (arr) => arr[ri(arr.length)];
const Q = (q, a, wrong, why, big = '') => ({ q, a: String(a), wrong: wrong.map(String), why, big });

/** 상성 문제 하나. species: 이름을 쓸 포켓몬 목록 [{name, type}] (없으면 속성만으로) */
export function typeQuestion(species = []) {
  const kind = ri(4);
  const withMon = species.filter((s) => s.type && TYPE_CHART[s.type]);
  if (kind === 0) { // 이 속성에게 강한 속성은?
    const def = pick(TYPES.filter((t) => weakTo(t).length));
    const a = pick(weakTo(def));
    const wrong = shuffle(TYPES.filter((t) => effectiveness(t, def) <= 1)).slice(0, 2);
    return Q(`${typeTag(def)} 포켓몬에게 가장 잘 통하는 속성은?`, typeTag(a), wrong.map(typeTag), `${whyStrong(a, def)} ${a} 기술은 ${def}에게 효과가 굉장해!`, TYPE_EMOJI[def]);
  }
  if (kind === 1) { // 이 속성 기술이 굉장한 상대는?
    const atk = pick(TYPES.filter((t) => strongAgainst(t).length));
    const a = pick(strongAgainst(atk));
    const wrong = shuffle(TYPES.filter((t) => effectiveness(atk, t) <= 1)).slice(0, 2);
    return Q(`${typeTag(atk)} 기술이 효과가 굉장한 상대는?`, typeTag(a), wrong.map(typeTag), `${whyStrong(atk, a)}`, TYPE_EMOJI[atk]);
  }
  if (kind === 2) { // 별로인 상대 (0.5)
    const atk = pick(TYPES.filter((t) => Object.values(TYPE_CHART[t]).some((v) => v < 1)));
    const a = pick(Object.entries(TYPE_CHART[atk]).filter(([, v]) => v < 1).map(([k]) => k));
    const wrong = shuffle(TYPES.filter((t) => effectiveness(atk, t) >= 1)).slice(0, 2);
    return Q(`${typeTag(atk)} 기술이 효과가 별로인 상대는?`, typeTag(a), wrong.map(typeTag), `${a}에게 ${atk} 기술은 반밖에 안 통해. 다른 속성 기술을 고르자!`, TYPE_EMOJI[atk]);
  }
  // 실제 포켓몬 둘: 굉장해 / 별로 / 보통
  if (withMon.length >= 2) {
    const me = pick(withMon), foe = pick(withMon.filter((s) => s !== me));
    const m = effectiveness(me.type, foe.type);
    const a = m > 1 ? '효과가 굉장해! (1.5배)' : m < 1 ? '효과가 별로야… (0.5배)' : '보통이야 (1배)';
    const all = ['효과가 굉장해! (1.5배)', '효과가 별로야… (0.5배)', '보통이야 (1배)'];
    const why = m > 1 ? whyStrong(me.type, foe.type) : m < 1 ? `${foe.type}에게 ${me.type} 기술은 반밖에 안 통해.` : `${me.type}과 ${foe.type}은 특별한 상성이 없어. 보통!`;
    return Q(`${me.name}(${typeTag(me.type)})가 ${foe.name}(${typeTag(foe.type)})에게 ${me.type} 기술을 쓰면?`, a, all.filter((x) => x !== a), why, `${TYPE_EMOJI[me.type]}→${TYPE_EMOJI[foe.type]}`);
  }
  return typeQuestion([]);
}

/** 수업 화면 HTML: 외우기 쉬운 고리 + 모든 굉장한 짝 (seen: 대결에서 발견한 짝 id → 날짜) */
export function lessonHtml(seen = {}) {
  const ring = [['불', '풀'], ['풀', '물'], ['물', '불']];
  const extra = [['전기', '물'], ['땅', '전기'], ['격투', '노말'], ['고스트', '에스퍼'], ['페어리', '고스트']];
  const chip = ({ atk, def }) => `<span class="ty-chip${seen[pairId(atk, def)] ? ' seen' : ''}" title="${whyStrong(atk, def)}">${TYPE_EMOJI[atk]} ${atk} <b>›</b> ${TYPE_EMOJI[def]} ${def}</span>`;
  return `
    <div class="ty-ring">${ring.map(([a, b]) => `<span class="ty-big">${TYPE_EMOJI[a]} ${a}</span><span class="ty-arrow">강해 ▶</span><span class="ty-big">${TYPE_EMOJI[b]} ${b}</span>`).join('<span class="ty-sep">·</span>')}</div>
    <div class="study-why right">🔥 불은 풀을 태우고, 🌿 풀은 물을 빨아들이고, 💧 물은 불을 꺼. 이 고리만 외워도 반은 알았어!</div>
    <div class="ty-ring small">${extra.map(([a, b]) => `<span>${TYPE_EMOJI[a]} ${a} ▶ ${TYPE_EMOJI[b]} ${b}</span>`).join('')}</div>
    <div class="study-why">⚡ 전기는 물에 찌릿! 하지만 🏜️ 땅에는 하나도 안 통해. 👊 주먹은 ⭐ 보통 포켓몬에게 아프고, 👻 유령은 🔮 에스퍼의 마음속으로 쑥!</div>
    <div class="ty-head">💥 효과가 굉장한 짝 전부 (${STRONG_PAIRS.length}개) — 대결에서 직접 내면 색이 켜져</div>
    <div class="ty-chips">${STRONG_PAIRS.map(chip).join('')}</div>`;
}

/** 도감 미션 탭의 상성 스티커판 HTML */
export function typeBoardHtml(seen = {}) {
  const n = STRONG_PAIRS.filter((p) => seen[p.id]).length;
  return `<div class="lrn-head2">💥 상성 스티커 <span class="rank-how">(${n} / ${STRONG_PAIRS.length} · 대결에서 "효과가 굉장했다!"를 내면 켜져요)</span></div>
    <div class="ty-chips board">${STRONG_PAIRS.map(({ atk, def, id }) => `<span class="ty-chip${seen[id] ? ' seen' : ''}" title="${seen[id] ? whyStrong(atk, def) : '아직 못 냈어'}">${TYPE_EMOJI[atk]} ${atk} <b>›</b> ${TYPE_EMOJI[def]} ${def}</span>`).join('')}</div>`;
}
export const typeSeenCount = (seen = {}) => STRONG_PAIRS.filter((p) => seen[p.id]).length;
