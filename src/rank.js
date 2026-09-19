// 주간 순위표. 한 주(월요일~일요일, 기기 시간 기준 ISO 주) 동안 한 일을 점수로 섞어 매긴다.
//   점수 = 퀴즈 정답 × 5 + 포켓몬 잡기 × 3 + 보스 정복 × 20
// 주가 바뀌면 state.wk(이번 주 기록)가 0으로 돌아간다 (main 의 checkWeek). 순위는 Firestore leaderboard/{주} 문서 하나에
// 모두의 기록이 { entries: { uid: { n(가린 이름), s(점수), q, c, b, l(대표 id), t } } } 로 모이고, 이 문서는 로그인 없이도 읽을 수 있어서
// 처음 화면의 "이번 주 순위" 버튼에서도 보인다. 전체 순위의 이름은 첫 글자만 보이고 나머지는 ** 로 가린다 (친구 순위는 이름 그대로).
export const WEIGHTS = { quiz: 5, caught: 3, boss: 20 };
export const TOP_N = 20;
export const emptyWeek = () => ({ quiz: 0, caught: 0, boss: 0 });
export const weekScore = (wk) => (wk?.quiz || 0) * WEIGHTS.quiz + (wk?.caught || 0) * WEIGHTS.caught + (wk?.boss || 0) * WEIGHTS.boss;

/** ISO 주 키 'YYYY-Www' (월요일 시작, 기기 시간) */
export function weekKey(d = new Date()) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7; // 월 1 … 일 7
  t.setUTCDate(t.getUTCDate() + 4 - day); // 그 주의 목요일로 (ISO 주의 해는 목요일이 속한 해)
  const y = t.getUTCFullYear();
  const week = Math.ceil(((t - Date.UTC(y, 0, 1)) / 86400000 + 1) / 7);
  return `${y}-W${String(week).padStart(2, '0')}`;
}
/** 주 키 → 그 주의 월요일·일요일 날짜 글자 '9월 15일 ~ 9월 21일' */
export function weekRange(key) {
  const [y, w] = key.split('-W').map(Number);
  const jan4 = new Date(Date.UTC(y, 0, 4)); // 1월 4일은 늘 1주차
  const mon = new Date(jan4.getTime() - ((jan4.getUTCDay() || 7) - 1) * 86400000 + (w - 1) * 7 * 86400000);
  const sun = new Date(mon.getTime() + 6 * 86400000);
  const f = (d) => `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일`;
  return `${f(mon)} ~ ${f(sun)}`;
}
/** 전체 순위용 이름 가리기: 첫 글자만 보이고 나머지는 ** */
export const maskName = (name) => { const s = String(name || '?').trim(); return s.length <= 1 ? s + '**' : s[0] + '**'; };

/** 순위표에 넣을 내 항목 (leaderboard 문서의 entries[uid]) */
export function rankEntry(name, wk, leaderId) {
  return { n: maskName(name), s: weekScore(wk), q: wk.quiz || 0, c: wk.caught || 0, b: wk.boss || 0, l: leaderId || null, t: Date.now() };
}

const MEDAL = ['🥇', '🥈', '🥉'];
/**
 * 순위 줄들을 el 에 그린다. entries: [{ uid, name, s, q, c, b, l }] (점수 내림차순 정렬은 여기서 한다)
 * thumb(l) → 대표 포켓몬 그림 주소(없으면 null). myUid 줄은 강조하고 "(나)"를 붙인다.
 */
export function renderRankRows(el, entries, { myUid = null, thumb = () => null, empty = '아직 이번 주 기록이 없어요. 퀴즈를 풀고 포켓몬을 잡아 보자!' } = {}) {
  el.innerHTML = '';
  const list = [...entries].sort((a, b) => (b.s || 0) - (a.s || 0) || (a.t || 0) - (b.t || 0));
  if (!list.length) { el.innerHTML = `<div class="friend-note">${empty}</div>`; return; }
  list.forEach((e, i) => {
    const row = document.createElement('div');
    row.className = 'rank-row' + (e.uid === myUid ? ' me' : '') + (i < 3 ? ' top' : '');
    const t = thumb(e.l);
    row.innerHTML = `<div class="rank-no">${MEDAL[i] || i + 1}</div>${t ? `<img src="${t}" alt="">` : '<div class="rank-noimg"></div>'}
      <div class="save-info"><div class="rank-name">${e.name}${e.uid === myUid ? ' <span class="rank-me">(나)</span>' : ''}</div>
      <div class="save-sub">퀴즈 ${e.q || 0} · 잡기 ${e.c || 0} · 보스 ${e.b || 0}</div></div>
      <div class="rank-score">${e.s || 0}<small>점</small></div>`;
    el.appendChild(row);
  });
}
