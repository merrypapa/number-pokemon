import { TYPE_CHART, TYPES, effectiveness, strongAgainst, weakTo } from './types.js';
// 상성 수업 (포켓몬 학교의 오박사 선생님): 속성 상성을 다섯 교시로 나눠 실제 포켓몬 그림과 함께 배우고, 다섯 문제 상성 퀴즈를 푼다.
//  - 수업: 1교시 불·풀·물의 고리 → 2교시 전기와 땅 → 3교시 물·풀·주먹은 바위를 → 4교시 벌레와 독 → 5교시 마음과 주먹. 교시마다 3~7짝.
//          짝마다 그 속성의 대표 포켓몬 그림(도감 썸네일)과 "왜 그런지" 한 줄.
//  - 퀴즈: 늘 실제 포켓몬이 나온다 (그림 + 이름 + 속성). 네 가지: 이 포켓몬에게 잘 통하는 속성 · 이 포켓몬의 기술이 굉장한 상대 ·
//          별로인 상대 · 둘을 놓고 굉장해/별로/보통. 보상은 main (정답마다 블록, 하루 한 번 물약·브론즈볼).
//  - 대결에서 "효과가 굉장했다!"를 내면 오늘의 미션 "효과가 굉장한 공격 내기"가 올라간다 (goals.js 'super').

export const TYPE_EMOJI = { '불': '🔥', '물': '💧', '풀': '🌿', '전기': '⚡', '땅': '🏜️', '바위': '🪨', '벌레': '🐛', '독': '🧪', '에스퍼': '🔮', '고스트': '👻', '페어리': '🎀', '격투': '👊', '노말': '⭐' };
export const typeTag = (t) => `${TYPE_EMOJI[t] || '✨'} ${t}`;
/** 속성마다 수업에 그림으로 나오는 대표 포켓몬 (없으면 그 속성의 첫 야생 포켓몬) */
const REP = { '불': 'm02', '물': 'm05', '풀': 'm01', '전기': 'm03', '땅': 'm04', '바위': 'm18', '벌레': 'm06', '독': 'm17', '에스퍼': 'm24', '고스트': 'm26', '페어리': 'm15', '격투': 'm32', '노말': 'm11' };

/** 왜 그런지 한 줄 (아이 말로) */
const WHY = {
  '불>풀': '불은 풀을 태워.', '불>벌레': '벌레는 불을 무서워해.', '물>불': '물은 불을 꺼.', '물>땅': '물은 흙을 진흙으로 만들어.', '물>바위': '물은 바위를 깎아.',
  '풀>물': '풀은 물을 쭉쭉 빨아들여.', '풀>땅': '풀은 땅에 뿌리를 내려.', '풀>바위': '풀뿌리는 바위도 뚫어.', '전기>물': '물은 전기가 잘 통해 찌릿!',
  '땅>불': '흙을 덮으면 불이 꺼져.', '땅>전기': '전기는 땅으로 흘러 사라져.', '땅>바위': '땅이 흔들리면 바위가 굴러.', '땅>독': '독은 흙에 스며 사라져.',
  '바위>불': '바위는 불에 타지 않아.', '바위>벌레': '바위에 벌레는 꼼짝 못 해.', '벌레>풀': '벌레는 풀잎을 갉아먹어.', '벌레>에스퍼': '벌레는 생각이 안 통해.',
  '독>풀': '독은 풀을 시들게 해.', '독>페어리': '요정은 독에 약해.', '에스퍼>독': '마음의 힘은 독을 밀어내.', '에스퍼>격투': '힘보다 생각이 빨라.',
  '고스트>에스퍼': '유령은 마음속으로 쑥!', '고스트>고스트': '유령은 유령끼리 통해.', '페어리>고스트': '요정의 빛은 유령을 쫓아.', '페어리>격투': '요정의 마법은 주먹보다 세.',
  '격투>노말': '주먹은 보통 포켓몬에게 아파.', '격투>바위': '주먹으로 바위를 깨!',
};
export const whyStrong = (atk, def) => WHY[`${atk}>${def}`] || `${atk}은(는) ${def}에 강해.`;

/** 다섯 교시. 상성표의 "굉장해!" 27짝을 빠짐없이 나눠 담았다 */
export const CHAPTERS = [
  { title: '1교시 · 불 › 풀 › 물의 고리', intro: '🔥 불은 풀을 태우고, 🌿 풀은 물을 빨아들이고, 💧 물은 불을 꺼. 이 고리만 외워도 반은 알았어!', pairs: [['불', '풀'], ['풀', '물'], ['물', '불']] },
  { title: '2교시 · 전기와 땅', intro: '⚡ 전기는 물에 찌릿! 하지만 🏜️ 땅에는 하나도 안 통해. 땅은 불·전기·바위·독을 다 덮어 버려.', pairs: [['전기', '물'], ['땅', '전기'], ['땅', '불'], ['땅', '바위'], ['땅', '독']] },
  { title: '3교시 · 바위는 누구에게 약할까', intro: '🪨 바위는 단단하지만 💧 물에 깎이고, 🌿 풀뿌리에 뚫리고, 👊 주먹에 깨져. 대신 바위는 🔥 불에 타지 않아.', pairs: [['물', '바위'], ['물', '땅'], ['풀', '바위'], ['풀', '땅'], ['격투', '바위'], ['바위', '불']] },
  { title: '4교시 · 벌레와 독', intro: '🐛 벌레는 풀잎을 갉아먹지만 🔥 불과 🪨 바위를 무서워해. 🧪 독은 풀과 요정을 시들게 하지만 🔮 마음의 힘에 밀려.', pairs: [['벌레', '풀'], ['벌레', '에스퍼'], ['불', '벌레'], ['바위', '벌레'], ['독', '풀'], ['독', '페어리'], ['에스퍼', '독']] },
  { title: '5교시 · 마음과 주먹', intro: '👊 주먹은 ⭐ 보통 포켓몬에게 아프지만 🔮 생각이 빠른 에스퍼와 🎀 요정에겐 안 통해. 👻 유령은 에스퍼의 마음속으로 쑥!', pairs: [['격투', '노말'], ['에스퍼', '격투'], ['페어리', '격투'], ['고스트', '에스퍼'], ['고스트', '고스트'], ['페어리', '고스트']] },
];

const ri = (n) => Math.floor(Math.random() * n);
const shuffle = (arr) => { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = ri(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const pick = (arr) => arr[ri(arr.length)];
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

/** 포켓몬 한 마리 그림 + 이름 + 속성 (썸네일이 없으면 속성 이모지) */
export function monCard(sp, thumb, size = 'big') {
  const img = thumb ? `<img src="${thumb}" alt="">` : `<span class="ty-noimg">${TYPE_EMOJI[sp.type] || '✨'}</span>`;
  return `<span class="ty-mon ${size}">${img}<b>${esc(sp.name)}</b><small>${typeTag(sp.type)}</small></span>`;
}

/** 한 교시 화면 HTML. species: 전체 포켓몬 목록, thumbOf(sp) → 그림 주소 */
export function chapterHtml(k, species, thumbOf) {
  const ch = CHAPTERS[k];
  const rep = (t) => species.find((s) => s.id === REP[t]) || species.find((s) => s.type === t && s.catchable) || { id: t, name: t, type: t };
  const rows = ch.pairs.map(([a, b]) => `<div class="ty-row">${monCard(rep(a), thumbOf(rep(a)), 'sm')}<span class="ty-vs">${TYPE_EMOJI[a]} ${a} 기술<br><b>굉장해! ▶</b></span>${monCard(rep(b), thumbOf(rep(b)), 'sm')}<span class="ty-why">${whyStrong(a, b)}</span></div>`).join('');
  return `<div class="ty-chapter">${esc(ch.title)} <span class="rank-how">(${k + 1} / ${CHAPTERS.length})</span></div>
    <div class="study-why right">${ch.intro}</div>
    <div class="ty-rows">${rows}</div>`;
}

/** 상성 문제 하나. species: 문제에 나올 포켓몬 [{id,name,type}], thumbOf(sp) → 그림 주소.
 *  돌려주는 것: { q, a, wrong, why, bigHtml } (study.js 가 bigHtml 을 그림 칸에 그린다) */
export function typeQuestion(species, thumbOf) {
  const mons = species.filter((s) => s.type && TYPE_CHART[s.type]);
  const ofType = (t) => mons.filter((s) => s.type === t);
  const kind = ri(4);
  if (kind === 0) { // 이 포켓몬에게 잘 통하는 속성은?
    const me = pick(mons.filter((s) => weakTo(s.type).length));
    const a = pick(weakTo(me.type));
    const wrong = shuffle(TYPES.filter((t) => effectiveness(t, me.type) <= 1)).slice(0, 2);
    return { q: `${me.name}(${typeTag(me.type)})에게 가장 잘 통하는 기술 속성은?`, a: typeTag(a), wrong: wrong.map(typeTag), why: `${whyStrong(a, me.type)} ${a} 기술은 ${me.name}에게 효과가 굉장해!`, bigHtml: monCard(me, thumbOf(me)) };
  }
  const nameTag = (s) => `${s.name} (${typeTag(s.type)})`;
  if (kind === 1) { // 이 포켓몬의 기술이 굉장한 상대는?
    const me = pick(mons.filter((s) => strongAgainst(s.type).some((t) => ofType(t).length)));
    const defT = pick(strongAgainst(me.type).filter((t) => ofType(t).length));
    const foe = pick(ofType(defT));
    const wrongs = shuffle(mons.filter((s) => s !== me && effectiveness(me.type, s.type) <= 1)).slice(0, 2);
    return { q: `${me.name}의 ${typeTag(me.type)} 기술이 효과가 굉장한 상대는?`, a: nameTag(foe), wrong: wrongs.map(nameTag), why: `${whyStrong(me.type, foe.type)} ${foe.name}은(는) ${foe.type} 포켓몬이야.`, bigHtml: monCard(me, thumbOf(me)) };
  }
  if (kind === 2) { // 별로인 상대 (0.5)
    const weakT = (t) => Object.entries(TYPE_CHART[t]).filter(([, v]) => v < 1).map(([k]) => k);
    const me = pick(mons.filter((s) => weakT(s.type).some((t) => ofType(t).length)));
    const foe = pick(ofType(pick(weakT(me.type).filter((t) => ofType(t).length))));
    const wrongs = shuffle(mons.filter((s) => s !== me && effectiveness(me.type, s.type) >= 1)).slice(0, 2);
    return { q: `${me.name}의 ${typeTag(me.type)} 기술이 효과가 별로인 상대는?`, a: nameTag(foe), wrong: wrongs.map(nameTag), why: `${foe.name}은(는) ${foe.type} 포켓몬. ${foe.type}에게 ${me.type} 기술은 반밖에 안 통해. 다른 속성 기술을 고르자!`, bigHtml: monCard(me, thumbOf(me)) };
  }
  // 둘을 놓고: 굉장해 / 별로 / 보통
  const me = pick(mons), foe = pick(mons.filter((s) => s !== me));
  const m = effectiveness(me.type, foe.type);
  const all = ['효과가 굉장해! (1.5배)', '효과가 별로야… (0.5배)', '보통이야 (1배)'];
  const a = m > 1 ? all[0] : m < 1 ? all[1] : all[2];
  const why = m > 1 ? whyStrong(me.type, foe.type) : m < 1 ? `${foe.type}에게 ${me.type} 기술은 반밖에 안 통해.` : `${me.type}과 ${foe.type}은 특별한 상성이 없어. 보통!`;
  return { q: `${me.name}가 ${foe.name}에게 ${typeTag(me.type)} 기술을 쓰면?`, a, wrong: all.filter((x) => x !== a), why, bigHtml: `${monCard(me, thumbOf(me))}<span class="ty-vs big">${TYPE_EMOJI[me.type]} ▶</span>${monCard(foe, thumbOf(foe))}` };
}
