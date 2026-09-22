// 오늘의 미션 + 스티커(도전과제).
//  - 미션: 날마다 셋. 하루가 바뀌면 새로 뽑힌다. 하나 끝낼 때마다 브론즈볼, 셋 다 끝내면 실버볼.
//          어떤 셋이 나올지는 날짜와 이름으로 정해서, 껐다 켜도 같은 미션이 나온다.
//  - 스티커: 한 번 받으면 사라지지 않는 기념 도장. 이미 세고 있던 값(잡은 수·푼 퀴즈·블록·보스…)으로 판단한다.
// 주간 순위(rank.js)가 "이번 주 점수"라면 이쪽은 "오늘 할 일"과 "지금까지 해낸 일"이다.

const TZ = 9 * 3600000; // 한국 시간으로 하루를 가른다 (주간 순위와 같은 기준)
/** 오늘 (한국 시간 기준) — 'YYYY-MM-DD' */
export function dayKey(d = new Date()) {
  const t = new Date(d.getTime() + TZ);
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}`;
}

// ---------- 미션 ----------
// uniq 인 미션은 "서로 다른 것"을 센다 (같은 지역을 여러 번 가도 한 번)
export const MISSIONS = [
  { id: 'quiz', emoji: '🧩', need: 3, text: (n) => `숫자블록 퀴즈 ${n}개 맞히기` },
  { id: 'catch', emoji: '⚔️', need: 2, text: (n) => `포켓몬 ${n}마리 잡기` },
  { id: 'chest', emoji: '🎁', need: 1, text: (n) => `수수께끼 상자 ${n}개 열기` },
  { id: 'blocks', emoji: '🟦', need: 30, text: (n) => `블록 ${n}개 모으기` },
  { id: 'zones', emoji: '🗺', need: 2, uniq: true, text: (n) => `다른 지역 ${n}곳 가 보기` },
  { id: 'evolve', emoji: '✨', need: 1, text: (n) => `포켓몬 ${n}마리 진화시키기` },
];
export const MISSION_BY_ID = Object.fromEntries(MISSIONS.map((m) => [m.id, m]));
export const MISSION_BALL = 'bronze';   // 미션 하나마다
export const BONUS_BALL = 'silver';     // 셋 다 끝내면 하나 더

/** 글자에서 숫자 하나 (같은 날·같은 이름이면 늘 같은 미션이 나오게) */
function seedOf(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
/** 그 날의 미션 셋 */
export function pickMissions(day, name = '') {
  let seed = seedOf(`${day}/${name}`);
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const pool = [...MISSIONS];
  const out = [];
  while (out.length < 3 && pool.length) out.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0]);
  return out.map((m) => ({ id: m.id, need: m.need, n: 0, got: false, seen: m.uniq ? {} : null }));
}

export const emptyGoals = (name = '') => {
  const day = dayKey();
  return { day, seedName: name, tasks: pickMissions(day, name), bonus: false, stickers: {}, stats: { evolved: 0, photos: 0, duels: 0, zones: {}, streak: 0, best: 0, daily: 0 } };
};

/** 저장 파일에서 (없거나 모양이 깨졌으면 새로) */
export function loadGoals(d, name = '') {
  const G = emptyGoals(name);
  if (!d || typeof d !== 'object') return G;
  G.stickers = {};
  if (d.stickers && typeof d.stickers === 'object') for (const [k, v] of Object.entries(d.stickers)) if (STICKER_BY_ID[k] && v) G.stickers[k] = v;
  if (d.stats && typeof d.stats === 'object') {
    for (const k of ['evolved', 'photos', 'duels', 'streak', 'best', 'daily']) G.stats[k] = Math.max(0, d.stats[k] | 0);
    if (d.stats.zones && typeof d.stats.zones === 'object') for (const k of Object.keys(d.stats.zones)) G.stats.zones[k] = true;
  }
  if (d.day === G.day && Array.isArray(d.tasks)) {  // 같은 날이면 하던 미션을 이어서
    const kept = d.tasks.filter((t) => MISSION_BY_ID[t?.id]).slice(0, 3)
      .map((t) => ({ id: t.id, need: MISSION_BY_ID[t.id].need, n: Math.max(0, t.n | 0), got: !!t.got, seen: MISSION_BY_ID[t.id].uniq ? { ...(t.seen || {}) } : null }));
    if (kept.length) { G.tasks = kept; G.bonus = !!d.bonus; G.seedName = d.seedName ?? name; }
  }
  return G;
}

/** 하루가 바뀌었으면 미션을 새로 뽑는다. 바뀌었으면 true.
 *  이름이 정해지기 전(타이틀 화면)에 만들어 둔 미션은, 이름이 생기고 아직 아무것도 안 했으면 그 이름으로 다시 뽑는다
 *  — 그래야 "같은 날 같은 아이에게 늘 같은 미션"이 처음부터 지켜진다. */
export function rollDay(G, name = '') {
  const day = dayKey();
  const fresh = !G.tasks.length || G.tasks.every((t) => t.n === 0);
  if (G.day === day && (G.seedName === name || !fresh)) return false;
  const newDay = G.day !== day;
  G.day = day; G.seedName = name; G.tasks = pickMissions(day, name);
  if (newDay) G.bonus = false;
  return newDay;
}

/** 미션 진행. 방금 끝난 미션들을 돌려준다 (보상은 부르는 쪽에서 준다) */
export function goalAdd(G, kind, key = null, amount = 1) {
  const done = [];
  for (const t of G.tasks) {
    if (t.id !== kind || t.n >= t.need) continue;
    if (t.seen) { if (!key || t.seen[key]) continue; t.seen[key] = true; t.n = Object.keys(t.seen).length; }
    else t.n = Math.min(t.need, t.n + amount);
    if (t.n >= t.need) done.push(t);
  }
  return done;
}
export const allDone = (G) => G.tasks.length > 0 && G.tasks.every((t) => t.n >= t.need);

// ---------- 스티커 ----------
// test(s) 의 s: { caught, rescued, blocks, bosses, dexCount, stats }
export const STICKERS = [
  { id: 'friend1', emoji: '🐣', name: '첫 친구', how: '포켓몬을 처음 잡았어', test: (s) => s.caught >= 1 },
  { id: 'friend10', emoji: '🔟', name: '열 친구', how: '포켓몬 10마리를 잡았어', test: (s) => s.caught >= 10 },
  { id: 'friend30', emoji: '🎊', name: '서른 친구', how: '포켓몬 30마리를 잡았어', test: (s) => s.caught >= 30 },
  { id: 'quiz10', emoji: '🧩', name: '퀴즈 박사', how: '퀴즈를 10개 맞혔어', test: (s) => s.rescued >= 10 },
  { id: 'quiz50', emoji: '🎓', name: '퀴즈 왕', how: '퀴즈를 50개 맞혔어', test: (s) => s.rescued >= 50 },
  { id: 'streak5', emoji: '🔥', name: '다섯 연속', how: '퀴즈를 5개 연달아 맞혔어', test: (s) => s.stats.best >= 5 },
  { id: 'block25', emoji: '🥈', name: '은빛 블록', how: '블록을 25개 모아 은빛 한 칸을 만들었어', test: (s) => s.blocks >= 25 },
  { id: 'block50', emoji: '🥇', name: '금빛 블록', how: '블록을 50개 모아 금빛 한 칸을 만들었어', test: (s) => s.blocks >= 50 },
  { id: 'block200', emoji: '🏗', name: '블록 부자', how: '블록을 200개나 모았어', test: (s) => s.blocks >= 200 },
  { id: 'evolve1', emoji: '✨', name: '첫 진화', how: '포켓몬이 처음으로 진화했어', test: (s) => s.stats.evolved >= 1 },
  { id: 'boss1', emoji: '👑', name: '첫 보스', how: '보스를 처음 이겼어', test: (s) => s.bosses >= 1 },
  { id: 'boss3', emoji: '🏆', name: '보스 셋', how: '보스를 셋이나 이겼어', test: (s) => s.bosses >= 3 },
  { id: 'zones5', emoji: '🌍', name: '여행자', how: '다섯 지역에 가 봤어', test: (s) => Object.keys(s.stats.zones).length >= 5 },
  { id: 'dex20', emoji: '📖', name: '도감 스무 종', how: '도감에 스무 종을 채웠어', test: (s) => s.dexCount >= 20 },
  { id: 'duel1', emoji: '⚔️', name: '첫 대결 승리', how: '친구와의 대결에서 이겼어', test: (s) => s.stats.duels >= 1 },
  { id: 'photo1', emoji: '📸', name: '첫 사진', how: '포켓몬과 사진을 찍었어', test: (s) => s.stats.photos >= 1 },
  { id: 'daily1', emoji: '🎯', name: '오늘 완주', how: '하루 미션 셋을 다 했어', test: (s) => s.stats.daily >= 1 },
];
export const STICKER_BY_ID = Object.fromEntries(STICKERS.map((s) => [s.id, s]));

/** 새로 받은 스티커들을 돌려준다 (받은 것은 G.stickers 에 날짜로 남는다) */
export function checkStickers(G, snap) {
  const got = [];
  for (const st of STICKERS) {
    if (G.stickers[st.id]) continue;
    let ok = false;
    try { ok = !!st.test(snap); } catch { ok = false; }
    if (ok) { G.stickers[st.id] = dayKey(); got.push(st); }
  }
  return got;
}
export const stickerCount = (G) => Object.keys(G.stickers).length;
