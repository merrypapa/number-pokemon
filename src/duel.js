import { josa } from './util.js';
// 같이 놀기 2단계: 친구와 포켓몬 대결 (턴제, 우편 대결).
// 친구 탭에서 "⚔ 대결"을 누르면 내 대표 포켓몬의 지금 모습(공격·체력·기술)을 찍어 Firestore duels/{id} 문서를 만들고,
// 상대가 도감 "대결" 탭에서 수락하면 자기 대표를 찍어 넣는다. 그 뒤로는 서로 번갈아 기술을 하나씩 고른다(내 차례일 때만 버튼이 켜진다).
// 상대가 접속해 있지 않아도 문서에 차례가 남아 있어서 나중에 이어서 할 수 있다. 피해 = 공격 × 기술 배수 × 속성 상성 (대결 화면과 같은 식).
// 문서: { players:[a,b], a, b, names:{a,b}, mons:{a:{speciesId,name,type,atk,hp,maxHp,skills:[{name,power,kind}]}, b}, state:'pending'|'active'|'done',
//         turn:'a'|'b', log:[{who,skill,dmg,mult,left}], winner, rewarded:{uid:true}, createdAt, updatedAt }
import { effectiveness, effectWord, skillIcon } from './types.js';

export const DUEL_REWARD = { win: 30, lose: 10 }; // 끝나면 받는 블록
export const DUEL_KEEP_MS = 7 * 24 * 3600 * 1000;  // 끝난 대결은 일주일 뒤 지운다

/** 내 대표 포켓몬의 지금 모습을 찍는다 (대결 문서에 넣는다) */
export function snapshotMon(party, m) {
  const sp = party.species(m);
  return { speciesId: sp.id, name: sp.name, type: sp.type || '노말', atk: m.atk, hp: m.maxHp, maxHp: m.maxHp, skills: party.skills(m).map((s) => ({ name: s.name, power: s.power || 1, kind: s.kind || 'tackle' })) };
}
export function duelDamage(att, skill, def) {
  const mult = effectiveness(att.type, def.type);
  return { dmg: Math.max(1, Math.round(att.atk * (skill.power || 1) * mult)), mult };
}
/** 문서 안에서 내가 a 인지 b 인지 */
export const sideOf = (d, uid) => (d.a === uid ? 'a' : d.b === uid ? 'b' : null);
export const otherSide = (s) => (s === 'a' ? 'b' : 'a');

/** 수락: b 의 대표를 넣고 시작 (신청한 a 가 먼저) */
export function acceptPatch(d, uid, mon) {
  if (d.state !== 'pending' || d.b !== uid) return null;
  return { mons: { ...d.mons, b: mon }, state: 'active', turn: 'a', updatedAt: Date.now() };
}
/** 내 차례에 기술 하나 쓰기 → 문서에 덮어쓸 값 (차례가 아니면 null) */
export function attackPatch(d, uid, skillIndex) {
  const side = sideOf(d, uid);
  if (!side || d.state !== 'active' || d.turn !== side) return null;
  const att = d.mons[side], def = { ...d.mons[otherSide(side)] };
  const skill = att.skills[skillIndex] || att.skills[0];
  if (!skill) return null;
  const { dmg, mult } = duelDamage(att, skill, def);
  def.hp = Math.max(0, def.hp - dmg);
  const log = [...(d.log || []), { who: side, skill: skill.name, dmg, mult, left: def.hp }].slice(-20);
  const done = def.hp <= 0;
  return { mons: { ...d.mons, [otherSide(side)]: def }, log, state: done ? 'done' : 'active', winner: done ? side : null, turn: done ? null : otherSide(side), updatedAt: Date.now() };
}

const hpBar = (mon) => { const r = Math.max(0, Math.min(1, mon.hp / mon.maxHp)); return `<div class="duel-hp"><div class="duel-hp-fill${r < 0.3 ? ' low' : ''}" style="width:${Math.round(r * 100)}%"></div><span>❤ ${mon.hp}/${mon.maxHp}</span></div>`; };
/**
 * 대결 카드 HTML. me: 내 uid, thumb(speciesId) → 그림 주소. 내 차례면 기술 버튼(data-skill)이 들어 있다.
 */
export function duelCardHtml(d, me, thumb) {
  const side = sideOf(d, me), other = otherSide(side);
  const mine = d.mons[side], theirs = d.mons[other];
  const myName = d.names[side], theirName = d.names[other];
  const monBox = (mon, who, label) => mon
    ? `<div class="duel-mon${who === side ? ' me' : ''}"><div class="duel-who">${label}</div>${thumb(mon.speciesId) ? `<img src="${thumb(mon.speciesId)}" alt="">` : '<div class="friend-noimg"></div>'}<div class="duel-name">${mon.name} <span class="party-type">${mon.type}</span></div><div class="duel-atk">⚔ ${mon.atk}</div>${hpBar(mon)}</div>`
    : `<div class="duel-mon"><div class="duel-who">${label}</div><div class="friend-noimg"></div><div class="duel-name">아직 안 골랐어</div></div>`;
  const status = d.state === 'pending' ? (d.b === me ? '📨 대결 신청이 왔어! 수락하면 내 대표 포켓몬이 나가.' : `⏳ ${theirName}의 수락을 기다리는 중`)
    : d.state === 'done' ? (d.winner === side ? '🏆 내가 이겼어!' : `😢 ${josa(theirName, '이가')} 이겼어. 다음엔 꼭!`)
    : d.turn === side ? '👉 내 차례야! 기술을 골라' : `⏳ ${theirName}의 차례 (기다리면 알려 줄게)`;
  const skills = d.state === 'active' && d.turn === side && mine
    ? `<div class="duel-skills">${mine.skills.map((s, i) => `<button class="duel-skill" data-skill="${i}">${skillIcon(s)} ${s.name} <small>⚔ ${duelDamage(mine, s, theirs).dmg}</small></button>`).join('')}</div>` : '';
  const log = (d.log || []).slice(-4).map((l) => `<div class="duel-log-line">${l.who === side ? myName : theirName}의 ${d.mons[l.who]?.name || ''}: ${l.skill}! <b>${l.dmg}</b> 피해 ${effectWord(l.mult)} (남은 체력 ${l.left})</div>`).join('');
  const actions = d.state === 'pending' && d.b === me ? '<div class="duel-actions"><button class="duel-accept">✅ 수락하고 대결!</button><button class="duel-decline">거절</button></div>'
    : d.state === 'pending' ? '<div class="duel-actions"><button class="duel-decline">신청 취소</button></div>'
    : d.state === 'done' ? '<div class="duel-actions"><button class="duel-decline">지우기</button></div>' : '';
  return `<div class="duel-card ${d.state}" data-id="${d.id}">
    <div class="duel-head">⚔ ${myName} vs ${theirName}</div>
    <div class="duel-status">${status}</div>
    <div class="duel-arena">${monBox(mine, side, `나 · ${myName}`)}<div class="duel-vs">VS</div>${monBox(theirs, other, theirName)}</div>
    ${skills}${log ? `<div class="duel-log">${log}</div>` : ''}${actions}
  </div>`;
}
