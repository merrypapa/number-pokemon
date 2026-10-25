import { evoTargets, pickEvolution } from './creatures.js';
// 내 포켓몬(파티). 잡은 몬스터는 여기에 들어오고, 그중 한 마리가 "대표"로 주인공 뒤를 따라다니며 대결에 나간다.
//  - 레벨: 포켓몬마다 level(1~50)과 exp. 대결에서 이기면(잡든 풀어주든) 경험치를 받고, 다음 레벨 경험치(level × 6)를 채우면 레벨업.
//          레벨업마다 체력·공격이 종의 성장치만큼 오른다 (등급이 높을수록 조금 더). 블록으로는 키우지 않는다 — 블록은 상점에서 아이템을 산다.
//  - 스탯: atk(공격력), maxHp(체력), hp(지금 체력). 잡을 때의 스탯(atk0·hp0)과 레벨(lv0)을 기억해 두고, 지금 스탯 = 그때 스탯 + 성장치 × 오른 레벨.
//  - 기술: 종의 skills 중 레벨 문턱(skillLevel)을 넘은 것만 쓸 수 있다. 피해 = atk × skill.power × 속성 상성.
//  - 진화: 종의 evolution.level 에 닿으면 (메가 진화는 메가블럭도 있어야). 진화하면 다음 종이 되고 스탯 보너스를 받는다. 어디서든 할 수 있다.
//  - 대결에서 지면 그 포켓몬은 기절(hp 0)해서 대결에 못 나간다. 오박사·엄마·침대·기운의 열매로 낫는다.

export const EVOLVE_BONUS = { atk: 3, hp: 5 };
/** 친구가 되면 야생일 때보다 세진다: 체력 ×1.3, 공격 ×1.25 (시작 포켓몬·잡은 포켓몬·보스 능력치 모두). 야생·보스는 그대로라 대결이 조금 쉬워진다 */
export const FRIEND_BONUS = { hp: 1.3, atk: 1.25 };
export const friendStats = (hp, atk) => ({ hp: Math.round(hp * FRIEND_BONUS.hp), atk: Math.round(atk * FRIEND_BONUS.atk) });
export const MEGA_BONUS = { atk: 10, hp: 20 }; // 메가 진화 보너스
export const MAX_LEVEL = 50;
export const STARTER_LEVEL = 1; // 시작 포켓몬은 Lv.1 부터 (처음엔 한 번 이기면 한 레벨씩 오른다)
/** 다음 레벨까지 필요한 경험치 (Lv1 → 16, Lv5 → 40, Lv15 → 100, Lv30 → 190: 처음엔 한 번 이기면 한 레벨, 같은 지역 야생을 두세 번 이기면 한 레벨) */
export const expNeed = (level) => 10 + level * 6;
/** 이기면 받는 경험치: 상대 레벨·등급으로 (같은 지역 야생이면 두세 번에 한 레벨), 보스는 3배. 나보다 센 상대일수록 많이, 약한 상대는 적게 (0.75~1.5배) */
export function expFor(foeLevel, foeGrade = 1, boss = false, myLevel = 5) {
  const ratio = Math.max(0.75, Math.min(1.5, foeLevel / Math.max(1, myLevel)));
  return Math.max(1, Math.round((foeLevel * 3 + foeGrade * 3) * (boss ? 3 : 1) * ratio));
}
/** 레벨마다 오르는 스탯 (등급이 높을수록 조금 더): 1등급 공격 0.6·체력 1.55, 5등급 0.8·2.15 */
export function growthOf(sp) { const g = sp.grade || 1; return { atk: 0.55 + 0.05 * g, hp: 1.4 + 0.15 * g }; }
/** 기술을 배우는 레벨: 종 데이터의 skill.level 이 있으면 그 값, 없으면 예전 공격력 문턱(1·10·20·30)을 레벨(1·9·18·27)로 */
export function skillLevel(s) { return s.level ?? (s.atk <= 1 ? 1 : Math.round(s.atk * 0.9)); }

export class Party {
  constructor(speciesById) {
    this.speciesById = speciesById;
    this.members = [];
    this.leaderUid = null;
    this.nextUid = 1;
    this.megaBlocks = () => 0;         // main 이 가진 메가블럭 수를 넣어 준다 (메가 진화 조건)
    this.onUseMega = () => {};         // 메가 진화할 때 메가블럭을 쓴다
  }

  species(m) { return this.speciesById[m.speciesId]; }
  get leader() { return this.members.find((m) => m.uid === this.leaderUid) || null; }
  setLeader(m) { this.leaderUid = m.uid; }
  isLeader(m) { return m.uid === this.leaderUid; }

  /** 새 멤버. mesh 는 따라다닐 때 쓰는 3D 오브젝트. stats 로 시작 스탯을 덮어쓸 수 있다 (시작 포켓몬). level 은 잡았을 때의 레벨. */
  add(speciesId, mesh, stats = {}, level = STARTER_LEVEL) {
    const sp = this.speciesById[speciesId];
    const { hp, atk } = friendStats(stats.hp ?? sp.baseHp, stats.atk ?? sp.baseAtk); // 친구 보너스 (불러오기는 이 뒤에 저장된 값으로 덮어쓴다)
    level = Math.max(1, Math.min(MAX_LEVEL, Math.round(level)));
    const m = { uid: this.nextUid++, speciesId, atk, maxHp: hp, hp, mesh, level, exp: 0, lv0: level, atk0: atk, hp0: hp, evolveTold: false };
    this.members.push(m);
    if (!this.leader) this.leaderUid = m.uid;
    return m;
  }
  /** 옛 저장(레벨이 없던 때)을 불러올 때: 공격력에서 레벨을 어림한다 (공격 4 → Lv5, 20 → Lv30 쯤) */
  migrate(m) {
    if (m.level) return;
    m.level = Math.max(1, Math.min(MAX_LEVEL, Math.round(5 + (m.atk - 4) / 0.65))); // 공격 4 → Lv.5, 20 → Lv.30 쯤
    m.exp = 0; m.lv0 = m.level; m.atk0 = m.atk; m.hp0 = m.maxHp;
  }

  name(m) { return this.species(m).name; }
  color(m) { return this.species(m).draftShape?.color || '#ffd93d'; }
  type(m) { return this.species(m).type || '노말'; }
  isFainted(m) { return m.hp <= 0; }
  /** 기절하지 않은 멤버들 */
  healthy() { return this.members.filter((m) => m.hp > 0); }

  /** 지금 쓸 수 있는 기술들 (레벨 문턱을 넘은 것) */
  skills(m) { return (this.species(m).skills || []).filter((s) => m.level >= skillLevel(s)); }
  /** 다음에 열릴 기술 (없으면 null) */
  nextSkill(m) { return (this.species(m).skills || []).find((s) => m.level < skillLevel(s)) || null; }
  damage(m, skill, mult = 1) { return Math.max(1, Math.round(m.atk * (skill?.power || 1) * mult)); }

  /** 이 레벨일 때의 스탯 (잡을 때 스탯 + 성장치 × 오른 레벨) */
  statsAt(m, level) {
    const g = growthOf(this.species(m));
    return { atk: Math.round(m.atk0 + g.atk * (level - m.lv0)), hp: Math.round(m.hp0 + g.hp * (level - m.lv0)) };
  }
  /** 다음 레벨까지 남은 경험치 비율 (0~1) */
  expRatio(m) { return m.level >= MAX_LEVEL ? 1 : Math.min(1, (m.exp || 0) / expNeed(m.level)); }
  /** 경험치를 받는다. 레벨이 오르면 스탯을 올리고, 배운 기술·진화 가능 여부와 함께 돌려준다 */
  gainExp(m, amount) {
    const from = m.level;
    const before = this.skills(m).length;
    if (m.level >= MAX_LEVEL) return { from, to: from, learned: [], amount: 0 };
    m.exp = (m.exp || 0) + amount;
    while (m.level < MAX_LEVEL && m.exp >= expNeed(m.level)) { m.exp -= expNeed(m.level); m.level++; }
    if (m.level >= MAX_LEVEL) m.exp = 0;
    if (m.level > from) {
      const s = this.statsAt(m, m.level);
      const dHp = s.hp - m.maxHp;
      m.atk = s.atk; m.maxHp = s.hp;
      if (m.hp > 0) m.hp = Math.min(m.maxHp, m.hp + Math.max(0, dHp)); // 오른 만큼 지금 체력도 (기절 중이면 그대로)
    }
    return { from, to: m.level, learned: this.skills(m).slice(before), amount };
  }
  /** 레벨을 끌어올린다 (보스를 잡았을 때 내 같은 종이 보스 레벨로). 낮아지지는 않는다 */
  raiseTo(m, level) {
    level = Math.min(MAX_LEVEL, level);
    if (level <= m.level) return false;
    m.level = level; m.exp = 0;
    const s = this.statsAt(m, level);
    m.atk = Math.max(m.atk, s.atk); m.maxHp = Math.max(m.maxHp, s.hp);
    this.rebase(m);
    return true;
  }
  /** 지금 스탯·레벨을 성장의 새 기준으로 (보스 능력치로 올라갔을 때처럼 밖에서 스탯을 바꾼 뒤에 부른다 — 안 그러면 다음 레벨업 때 공식값으로 되돌아간다) */
  rebase(m) { m.lv0 = m.level; m.atk0 = m.atk; m.hp0 = m.maxHp; }

  heal(m) { m.hp = m.maxHp; }
  healAll() { let n = 0; for (const m of this.members) if (m.hp < m.maxHp) { m.hp = m.maxHp; n++; } return n; }

  /** 진화 조건 (없으면 null): { level, mega, to, megaNow } */
  evolveNeed(m) {
    const e = this.species(m).evolution;
    if (!e || !evoTargets(e).some((t) => this.speciesById[t.id])) return null;
    return { ...e, level: e.level ?? 16, megaNow: this.megaBlocks() };
  }
  canEvolve(m) {
    const e = this.evolveNeed(m);
    if (!e) return false;
    if (m.level < e.level) return false;
    if (e.mega && this.megaBlocks() < e.mega) return false; // 메가 진화는 메가블럭이 있어야 한다
    return true;
  }
  /** 진화. 새 종의 데이터를 돌려준다. mesh 교체는 부르는 쪽(main)에서 한다. */
  evolve(m) {
    const e = this.species(m).evolution;
    // 진화 대상이 여럿이면 확률대로 고른다 (이브이 → 샤미드·부스터·쥬피썬더·엄브레온, 리자몽 → 메가리자몽Y 또는 X)
    const next = pickEvolution(e, this.speciesById);
    if (e.mega) this.onUseMega(e.mega); // 메가블럭을 쓴다
    m.speciesId = next.id;
    const bonus = e.mega ? MEGA_BONUS : EVOLVE_BONUS; // 메가 진화는 더 크게 오른다
    m.atk += bonus.atk;
    m.maxHp += bonus.hp;
    m.hp = m.maxHp;
    m.lv0 = m.level; m.atk0 = m.atk; m.hp0 = m.maxHp; // 진화한 모습부터 다시 자란다 (진화형은 등급이 높아 성장도 조금 빨라진다)
    m.evolveTold = false;
    return next;
  }
}
