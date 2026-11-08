import { josa } from './util.js';
// 같이 놀기 2단계: 친구와 포켓몬 대결 (턴제, 우편 대결).
// 친구 탭에서 "⚔ 대결"을 누르면 내 대표 포켓몬의 지금 모습(공격·체력·기술)을 찍어 Firestore duels/{id} 문서를 만들고,
// 상대가 도감 "대결" 탭에서 수락하면 자기 대표를 찍어 넣는다. 그 뒤로는 서로 번갈아 기술을 하나씩 고른다(내 차례일 때만 버튼이 켜진다).
// 상대가 접속해 있지 않아도 문서에 차례가 남아 있어서 나중에 이어서 할 수 있다. 피해 = 공격 × 기술 배수 × 속성 상성 (대결 화면과 같은 식).
// 문서: { players:[a,b], a, b, names:{a,b}, mons:{a:[포켓몬 최대 3], b:[...]}, cur:{a,b}(지금 싸우는 번호), ready:{a,b}(무대 자리에서 "대결 시작"을 눌렀나),
//         state:'pending'(수락 기다림)|'ready'(둘 다 골랐고 자리에서 시작 버튼 기다림)|'active'|'done', turn:'a'|'b', log:[{who,skill,dmg,mult,left} | {who,switch}], winner, rewarded:{uid:true}, createdAt, updatedAt }
//  - 3마리씩: 대표 + 다음 둘(기절 안 한 포켓몬). 내 차례에 "🔄 교체"를 누르면 한 턴을 쓴다. 싸우던 포켓몬이 쓰러지면 다음 포켓몬이 저절로 나온다. 셋 다 쓰러지면 끝.
//  - 옛 문서(mons.a 가 포켓몬 하나)는 한 마리 팀으로 읽는다 (teamOf).
import { effectiveness, effectWord, skillIcon } from './types.js';

export const DUEL_REWARD = { win: 50, lose: 15, winBall: 'gold' }; // 끝나면 받는 블록 (이기면 하이퍼볼 1개도)
export const DUEL_POTIONS = 2;      // 대결 한 번에 쓸 수 있는 물약 수 (각자, 가방과 상관없이 공짜)
export const DUEL_POTION_HEAL = 0.4; // 물약 하나: 최대 체력의 40% 회복
export const DUEL_SWITCHES = 2;      // 대결 한 번에 직접 교체할 수 있는 횟수 (쓰러져서 저절로 나오는 건 안 센다)
export const DUEL_TEAM = 3;         // 팀은 아레나 자리에서 최대 3마리를 고른다
export const DUEL_KEEP_MS = 7 * 24 * 3600 * 1000;  // 끝난 대결은 일주일 뒤 지운다

/** 내 대표 포켓몬의 지금 모습을 찍는다 (대결 문서에 넣는다) */
export function snapshotMon(party, m) {
  const sp = party.species(m);
  return { speciesId: sp.id, name: party.name(m), type: sp.type || '노말', level: m.level || 1, atk: m.atk, hp: m.maxHp, maxHp: m.maxHp, skills: party.skills(m).map((s) => ({ name: s.name, power: s.power || 1, kind: s.kind || 'tackle' })) };
}
/** 팀 (옛 문서의 포켓몬 하나도 한 마리 팀으로) */
export const teamOf = (d, side) => { const m = d?.mons?.[side]; return Array.isArray(m) ? m : m ? [m] : []; };
export const curIdx = (d, side) => Math.max(0, Math.min(teamOf(d, side).length - 1, d?.cur?.[side] || 0));
/** 지금 싸우는 포켓몬 */
export const activeMon = (d, side) => teamOf(d, side)[curIdx(d, side)] || null;
/** 내 팀 찍기: 대표 먼저, 기절 안 한 포켓몬 최대 3 */
export function snapshotTeam(party, max = 3) {
  const L = party.leader;
  const list = [...(L && L.hp > 0 ? [L] : []), ...party.members.filter((m) => m !== L && m.hp > 0)].slice(0, max);
  return list.map((m) => snapshotMon(party, m));
}
const nextAlive = (team, from) => { for (let i = 0; i < team.length; i++) { const k = (from + 1 + i) % team.length; if (team[k].hp > 0) return k; } return -1; };
export function duelDamage(att, skill, def) {
  const mult = effectiveness(att.type, def.type);
  return { dmg: Math.max(1, Math.round(att.atk * (skill.power || 1) * mult)), mult };
}
/** 문서 안에서 내가 a 인지 b 인지 */
export const sideOf = (d, uid) => (d.a === uid ? 'a' : d.b === uid ? 'b' : null);
export const otherSide = (s) => (s === 'a' ? 'b' : 'a');

/** 수락: 'ready' — 팀은 아직 안 고른다. 둘 다 아레나 자리(1P·2P)에서 포켓몬을 고르고 "대결 시작"을 눌러야 active 가 된다.
 *  (예전 방식처럼 team 을 주면 그대로 넣는다 — 옛 화면이 보낸 수락) */
export function acceptPatch(d, uid, team = null) {
  if (d.state !== 'pending' || d.b !== uid) return null;
  const b = team ? (Array.isArray(team) ? team : [team]) : [];
  return { mons: { a: [], b }, cur: { a: 0, b: 0 }, ready: { a: false, b: false }, potions: { a: DUEL_POTIONS, b: DUEL_POTIONS }, switches: { a: DUEL_SWITCHES, b: DUEL_SWITCHES }, state: 'ready', turn: 'a', updatedAt: Date.now() };
}
/** 자리에서 팀을 고르고 "대결 시작": 내 팀을 넣고 내 쪽 준비 완료. 둘 다 되면 active (a 가 먼저) */
export function readyPatch(d, uid, team = null) {
  const side = sideOf(d, uid);
  if (!side || d.state !== 'ready') return null;
  const mons = { a: teamOf(d, 'a'), b: teamOf(d, 'b') };
  if (team && team.length) mons[side] = team.slice(0, DUEL_TEAM);
  if (!mons[side].length) return null; // 팀이 있어야 준비할 수 있다
  const ready = { ...(d.ready || { a: false, b: false }), [side]: true };
  const both = ready.a && ready.b && mons.a.length && mons.b.length;
  return { mons, cur: { a: 0, b: 0 }, ready, state: both ? 'active' : 'ready', turn: 'a', updatedAt: Date.now() };
}
/** 남은 물약 (옛 문서는 DUEL_POTIONS) */
export const potionsLeft = (d, side) => (d?.potions && Number.isFinite(d.potions[side]) ? d.potions[side] : DUEL_POTIONS);
/** 내 차례에 물약: 지금 포켓몬의 체력을 최대의 40% 만큼 (한 턴을 쓴다) */
export function potionPatch(d, uid) {
  const side = sideOf(d, uid);
  if (!side || d.state !== 'active' || d.turn !== side || potionsLeft(d, side) <= 0) return null;
  const team = teamOf(d, side).map((m) => ({ ...m })), i = curIdx(d, side), mon = team[i];
  if (!mon || mon.hp <= 0 || mon.hp >= mon.maxHp) return null;
  const heal = Math.min(mon.maxHp - mon.hp, Math.max(1, Math.round(mon.maxHp * DUEL_POTION_HEAL)));
  mon.hp += heal;
  const log = [...(d.log || []), { who: side, potion: mon.name, heal, left: mon.hp }].slice(-20);
  return { mons: { ...d.mons, [side]: team }, potions: { a: potionsLeft(d, 'a'), b: potionsLeft(d, 'b'), [side]: potionsLeft(d, side) - 1 }, log, turn: otherSide(side), updatedAt: Date.now() };
}
/** 남은 교체 횟수 (옛 문서는 DUEL_SWITCHES) */
export const switchesLeft = (d, side) => (d?.switches && Number.isFinite(d.switches[side]) ? d.switches[side] : DUEL_SWITCHES);
/** 내 차례에 교체 (한 턴을 쓴다). idx: 내 팀(고른 3마리) 번호 (기절 안 했고 지금 포켓몬이 아니어야). 한 대결에 DUEL_SWITCHES 번까지 */
export function switchPatch(d, uid, idx) {
  const side = sideOf(d, uid);
  if (!side || d.state !== 'active' || d.turn !== side || switchesLeft(d, side) <= 0) return null;
  const team = teamOf(d, side);
  if (!team[idx] || team[idx].hp <= 0 || idx === curIdx(d, side)) return null;
  const log = [...(d.log || []), { who: side, switch: team[idx].name }].slice(-20);
  return { cur: { ...(d.cur || {}), [side]: idx }, switches: { a: switchesLeft(d, 'a'), b: switchesLeft(d, 'b'), [side]: switchesLeft(d, side) - 1 }, log, turn: otherSide(side), updatedAt: Date.now() };
}
/** 내 차례에 기술 하나 쓰기 → 문서에 덮어쓸 값 (차례가 아니면 null) */
export function attackPatch(d, uid, skillIndex) {
  const side = sideOf(d, uid);
  if (!side || d.state !== 'active' || d.turn !== side) return null;
  const other = otherSide(side), att = activeMon(d, side);
  const defTeam = teamOf(d, other).map((m) => ({ ...m })), di = curIdx(d, other), def = defTeam[di];
  if (!att || !def) return null;
  const skill = att.skills[skillIndex] || att.skills[0];
  if (!skill) return null;
  const { dmg, mult } = duelDamage(att, skill, def);
  def.hp = Math.max(0, def.hp - dmg);
  const log = [...(d.log || []), { who: side, skill: skill.name, dmg, mult, left: def.hp }];
  let cur = { ...(d.cur || {}), [other]: di }, done = false;
  if (def.hp <= 0) { // 쓰러졌다 → 다음 포켓몬이 저절로 나온다. 더 없으면 끝
    const nx = nextAlive(defTeam, di);
    if (nx < 0) done = true; else { cur[other] = nx; log.push({ who: other, switch: defTeam[nx].name, auto: true }); }
  }
  return { mons: { ...d.mons, [other]: defTeam }, cur, log: log.slice(-20), state: done ? 'done' : 'active', winner: done ? side : null, turn: done ? null : other, updatedAt: Date.now() };
}

const hpBar = (mon) => { const r = Math.max(0, Math.min(1, mon.hp / mon.maxHp)); return `<div class="duel-hp"><div class="duel-hp-fill${r < 0.3 ? ' low' : ''}" style="width:${Math.round(r * 100)}%"></div><span>❤ ${mon.hp}/${mon.maxHp}</span></div>`; };
/**
 * 대결 카드 HTML. me: 내 uid, thumb(speciesId) → 그림 주소. 내 차례면 기술 버튼(data-skill)이 들어 있다.
 */
export function duelCardHtml(d, me, thumb) {
  const side = sideOf(d, me), other = otherSide(side);
  const mine = activeMon(d, side), theirs = activeMon(d, other);
  const myTeam = teamOf(d, side), theirTeam = teamOf(d, other);
  const myName = d.names[side], theirName = d.names[other];
  // 팀 줄: 작은 그림 셋 (지금 싸우는 포켓몬은 테두리, 쓰러진 포켓몬은 흐리게). 내 차례엔 내 벤치 포켓몬이 교체 버튼
  const teamRow = (team, who) => team.length > 1 ? `<div class="duel-team">${team.map((m, i) => { const cur = i === curIdx(d, who), out = m.hp <= 0, canSwitch = who === side && d.state === 'active' && d.turn === side && !cur && !out && switchesLeft(d, side) > 0; return `<${canSwitch ? 'button' : 'span'} class="duel-tm${cur ? ' cur' : ''}${out ? ' out' : ''}${canSwitch ? ' duel-switch' : ''}" ${canSwitch ? `data-idx="${i}"` : ''} title="${m.name} ❤ ${m.hp}/${m.maxHp}">${thumb(m.speciesId) ? `<img src="${thumb(m.speciesId)}" alt="">` : '❔'}<small>${out ? '😵' : canSwitch ? '🔄' : `${m.hp}`}</small></${canSwitch ? 'button' : 'span'}>`; }).join('')}</div>` : '';
  const monBox = (mon, who, label) => mon
    ? `<div class="duel-mon${who === side ? ' me' : ''}"><div class="duel-who">${label}</div>${thumb(mon.speciesId) ? `<img src="${thumb(mon.speciesId)}" alt="">` : '<div class="friend-noimg"></div>'}<div class="duel-name">${mon.name} <span class="party-type">${mon.type}</span></div><div class="duel-atk">⚔ ${mon.atk}</div>${hpBar(mon)}</div>`
    : `<div class="duel-mon"><div class="duel-who">${label}</div><div class="friend-noimg"></div><div class="duel-name">아직 안 골랐어</div></div>`;
  const status = d.state === 'pending' ? (d.b === me ? '📨 대결 신청이 왔어! 수락하면 내 포켓몬 셋이 나가.' : `⏳ ${theirName}의 수락을 기다리는 중`)
    : d.state === 'ready' ? (d.ready?.[side] ? `⏳ ${josa(theirName, '이가')} 아레나 자리에서 팀을 고르고 "대결 시작"을 누르면 시작돼` : '🏟 아레나 무대의 내 자리(1P·2P)에 올라서서 포켓몬 3마리를 고르고 "대결 시작"을 눌러!')
    : d.state === 'done' ? (d.winner === side ? '🏆 내가 이겼어!' : `😢 ${josa(theirName, '이가')} 이겼어. 다음엔 꼭!`)
    : d.turn === side ? '👉 내 차례야! 기술을 골라' : `⏳ ${theirName}의 차례 (기다리면 알려 줄게)`;
  const skills = d.state === 'active' && d.turn === side && mine
    ? `<div class="duel-skills">${mine.skills.map((s, i) => `<button class="duel-skill" data-skill="${i}">${skillIcon(s)} ${s.name} <small>⚔ ${duelDamage(mine, s, theirs).dmg}</small></button>`).join('')}</div>` : '';
  const log = (d.log || []).slice(-4).map((l) => l.potion ? `<div class="duel-log-line">🧪 ${l.who === side ? myName : theirName}: ${josa(l.potion, '이가')} 물약으로 ❤ ${l.heal} 회복 (체력 ${l.left})</div>` : l.switch ? `<div class="duel-log-line">🔄 ${l.who === side ? myName : theirName}: ${josa(l.switch, '이가')} ${l.auto ? '대신 나왔어!' : '교체로 나왔어!'}</div>` : `<div class="duel-log-line">${l.who === side ? myName : theirName}: ${l.skill}! <b>${l.dmg}</b> 피해 ${effectWord(l.mult)} (남은 체력 ${l.left})</div>`).join('');
  const actions = d.state === 'pending' && d.b === me ? '<div class="duel-actions"><button class="duel-accept">✅ 수락하고 대결!</button><button class="duel-decline">거절</button></div>'
    : d.state === 'pending' ? '<div class="duel-actions"><button class="duel-decline">신청 취소</button></div>'
    : d.state === 'done' ? '<div class="duel-actions"><button class="duel-decline">지우기</button></div>' : '';
  return `<div class="duel-card ${d.state}" data-id="${d.id}">
    <div class="duel-head">⚔ ${myName} vs ${theirName}</div>
    <div class="duel-status">${status}</div>
    <div class="duel-arena">${monBox(mine, side, `나 · ${myName}`)}<div class="duel-vs">VS</div>${monBox(theirs, other, theirName)}</div>
    ${myTeam.length > 1 || theirTeam.length > 1 ? `<div class="duel-teams"><div>${teamRow(myTeam, side)}</div><div>${teamRow(theirTeam, other)}</div></div>` : ''}
    ${skills}${log ? `<div class="duel-log">${log}</div>` : ''}${actions}
  </div>`;
}

/** 무대 위 포켓몬 머리 위 이름표 (맵 대결의 체력표처럼): 이름 · Lv · 체력 막대 · 남은 팀 점 */
export function duelTagHtml(d, who, owner) {
  const mon = activeMon(d, who);
  if (!mon) return '';
  const r = Math.max(0, Math.min(1, mon.hp / mon.maxHp));
  const dots = teamOf(d, who).map((m, i) => `<i class="${m.hp <= 0 ? 'out' : i === curIdx(d, who) ? 'cur' : ''}"></i>`).join('');
  return `<div class="tag-name">${owner ? `<small>${owner}의</small> ` : ''}${mon.name} <small>Lv.${mon.level || '?'}</small></div>
    <div class="tag-bar"><div style="width:${r * 100}%;background:${r > 0.5 ? '#57b947' : r > 0.25 ? '#f7cf3e' : '#e8453c'}"></div></div>
    <div class="tag-stat">❤ ${mon.hp}/${mon.maxHp} · ⚔ ${mon.atk} <span class="ds-dots">${dots}</span></div>`;
}
/** 무대 위 대결 조작판 (맵 대결처럼 오른쪽 아래): 차례 안내 · 기술 버튼 · 물약 · 교체(고른 3마리 안에서만).
 *  버튼: data-skill · .duel-potion · .duel-switch(data-idx). 체력은 포켓몬 머리 위 이름표(duelTagHtml)로 */
export function duelStageHtml(d, me, thumb) {
  const side = sideOf(d, me), other = otherSide(side);
  const mine = activeMon(d, side), theirs = activeMon(d, other);
  const myTurn = d.state === 'active' && d.turn === side;
  const status = d.state === 'done' ? (d.winner === side ? '🏆 내가 이겼어!' : `😢 ${josa(d.names[other], '이가')} 이겼어`) : myTurn ? '👉 내 차례! 기술을 골라' : `⏳ ${d.names[other]}의 차례…`;
  const skills = mine ? mine.skills.map((s, i) => { const r = theirs ? duelDamage(mine, s, theirs) : { dmg: 0, mult: 1 }; return `<button class="skill duel-skill" data-skill="${i}" ${myTurn ? '' : 'disabled'}><span class="skill-top"><span class="skill-icon">${skillIcon(s)}</span><span class="skill-name">${s.name}</span></span><span class="skill-dmg${r.mult > 1 ? ' good' : r.mult < 1 ? ' bad' : ''}">⚔ ${r.dmg}${r.mult > 1 ? ' !!' : r.mult < 1 ? ' …' : ''}</span></button>`; }).join('') : '';
  const pl = potionsLeft(d, side), canPotion = myTurn && pl > 0 && mine && mine.hp < mine.maxHp;
  const sl = switchesLeft(d, side);
  const bench = teamOf(d, side).map((m, i) => ({ m, i })).filter(({ i }) => i !== curIdx(d, side));
  const switches = bench.map(({ m, i }) => { const ok = myTurn && m.hp > 0 && sl > 0; return `<button class="duel-switch ds-sw" data-idx="${i}" ${ok ? '' : 'disabled'}>${thumb(m.speciesId) ? `<img src="${thumb(m.speciesId)}" alt="">` : ''}<span>${m.hp <= 0 ? '😵' : '🔄'} ${m.name}<small>❤ ${m.hp}</small></span></button>`; }).join('');
  const last = (d.log || []).slice(-1).map((l) => l.potion ? `🧪 ${josa(l.potion, '이가')} ❤ ${l.heal} 회복` : l.switch ? `🔄 ${josa(l.switch, '이가')} 나왔어` : `${l.skill}! ${l.dmg} 피해 ${effectWord(l.mult)}`).join('');
  return `<div class="duel-stage-ui"><div class="ds-status">${status}${last ? `<small>${last}</small>` : ''}</div>
    <div class="ds-skills">${skills}</div>
    <div class="ds-actions"><button class="duel-potion" ${canPotion ? '' : 'disabled'}>🧪 물약 <small>${pl}/${DUEL_POTIONS}</small></button>${bench.length ? `<span class="ds-swlabel">🔄 교체 ${sl}/${DUEL_SWITCHES}</span>` : ''}${switches}</div></div>`;
}
