// 내 포켓몬(파티). 잡은 몬스터는 여기에 들어오고, 그중 한 마리가 "대표"로 주인공 뒤를 따라다니며 대결에 나간다.
//  - 스탯: atk(공격력), maxHp(체력), hp(지금 체력). 야생을 잡으면 그 종의 baseAtk/baseHp, 시작 포켓몬은 starterAtk/starterHp.
//  - 키우기: 숫자블록으로 공격력 +1 또는 체력 +1. 비용은 10단위마다 오른다 (0~9: 1개, 10~19: 2개, 20~29: 3개 …).
//  - 기술: 종의 skills 중 atk 가 문턱(skill.atk) 이상인 것만 쓸 수 있다. 피해 = atk × skill.power × 속성 상성.
//  - 진화: 공격·체력 조건 + wins(대표로 이긴 횟수) 또는 boss(정복한 지역 수)를 채우면. 진화하면 다음 종이 되고 스탯 보너스를 받는다.
//  - 대결에서 지면 그 포켓몬은 기절(hp 0)해서 대결에 못 나간다. 올린 스탯은 그대로. 오박사에게 치료받으면 낫는다.
import { evolveZoneOf } from './types.js';

export const EVOLVE_BONUS = { atk: 3, hp: 5 };
export const MEGA_BONUS = { atk: 10, hp: 20 }; // 메가 진화 보너스

export class Party {
  constructor(speciesById) {
    this.speciesById = speciesById;
    this.members = [];
    this.leaderUid = null;
    this.nextUid = 1;
    this.conqueredCount = () => 0; // main 이 정복한 지역 수를 넣어 준다 (2단계 진화 조건)
    this.zoneOf = () => 'forest';      // main 이 지금 있는 지역 이름을 넣어 준다 (진화는 속성의 고향에서만)
    this.megaBlocks = () => 0;         // main 이 가진 메가블럭 수를 넣어 준다 (메가 진화 조건)
    this.onUseMega = () => {};         // 메가 진화할 때 메가블럭을 쓴다
  }

  species(m) { return this.speciesById[m.speciesId]; }
  get leader() { return this.members.find((m) => m.uid === this.leaderUid) || null; }
  setLeader(m) { this.leaderUid = m.uid; }
  isLeader(m) { return m.uid === this.leaderUid; }

  /** 새 멤버. mesh 는 따라다닐 때 쓰는 3D 오브젝트. stats 로 시작 스탯을 덮어쓸 수 있다 (시작 포켓몬). */
  add(speciesId, mesh, stats = {}) {
    const sp = this.speciesById[speciesId];
    const atk = stats.atk ?? sp.baseAtk, hp = stats.hp ?? sp.baseHp;
    const m = { uid: this.nextUid++, speciesId, atk, maxHp: hp, hp, mesh, wins: 0, evolveTold: false };
    this.members.push(m);
    if (!this.leader) this.leaderUid = m.uid;
    return m;
  }

  name(m) { return this.species(m).name; }
  color(m) { return this.species(m).draftShape?.color || '#ffd93d'; }
  type(m) { return this.species(m).type || '노말'; }
  isFainted(m) { return m.hp <= 0; }
  /** 기절하지 않은 멤버들 */
  healthy() { return this.members.filter((m) => m.hp > 0); }

  /** 지금 쓸 수 있는 기술들 (공격력 문턱을 넘은 것) */
  skills(m) { return (this.species(m).skills || []).filter((s) => m.atk >= s.atk); }
  /** 다음에 열릴 기술 (없으면 null) */
  nextSkill(m) { return (this.species(m).skills || []).find((s) => m.atk < s.atk) || null; }
  damage(m, skill, mult = 1) { return Math.max(1, Math.round(m.atk * (skill?.power || 1) * mult)); }

  /** 스탯을 1 올리는 데 드는 블록 수: 5칸 오를 때마다 한 개씩 비싸진다 (0~4 → 2, 5~9 → 3, 10~14 → 4 …).
   *  키우기가 헐값이면 블록을 모을 까닭이 없다: 공격 3 → 20 에 64개, 체력 10 → 30 에 110개쯤 든다. */
  upgradeCost(m, stat) { return 2 + Math.floor((stat === 'atk' ? m.atk : m.maxHp) / 5); }
  /** 블록으로 공격력/체력 +1. 체력을 올리면 지금 체력도 같이 오른다(기절 중이면 그대로). 드는 블록 수를 돌려준다. */
  upgrade(m, stat) {
    const cost = this.upgradeCost(m, stat);
    if (stat === 'atk') m.atk += 1;
    else { m.maxHp += 1; if (m.hp > 0) m.hp += 1; }
    return cost;
  }

  heal(m) { m.hp = m.maxHp; }
  healAll() { let n = 0; for (const m of this.members) if (m.hp < m.maxHp) { m.hp = m.maxHp; n++; } return n; }

  /** 진화 조건 */
  evolveNeed(m) {
    const e = this.species(m).evolution;
    if (!e || !this.speciesById[e.to]) return null;
    return { ...e, winsNow: m.wins || 0, bossNow: this.conqueredCount(), megaNow: this.megaBlocks(), zone: evolveZoneOf(this.type(m)), here: this.zoneOf() };
  }
  /** 지역만 빼고 조건을 다 채웠나 (도감 안내용) */
  readyExceptZone(m) {
    const e = this.evolveNeed(m);
    if (!e) return false;
    if (m.atk < e.atk || m.maxHp < e.hp) return false;
    if (e.wins && (m.wins || 0) < e.wins) return false;
    if (e.boss && this.conqueredCount() < e.boss) return false;
    if (e.mega && this.megaBlocks() < e.mega) return false; // 메가 진화는 메가블럭이 있어야 한다
    return true;
  }
  canEvolve(m) {
    const e = this.evolveNeed(m);
    return !!e && this.readyExceptZone(m) && e.zone === e.here;
  }
  /** 진화. 새 종의 데이터를 돌려준다. mesh 교체는 부르는 쪽(main)에서 한다. */
  evolve(m) {
    const e = this.species(m).evolution;
    // altTo 가 있으면 altChance 확률로 그쪽으로 진화한다 (리자몽 → 메가리자몽Y 또는 메가리자몽X)
    const alt = e.altTo && this.speciesById[e.altTo] && Math.random() < (e.altChance ?? 0.5) ? e.altTo : e.to;
    const next = this.speciesById[alt];
    if (e.mega) this.onUseMega(e.mega); // 메가블럭을 쓴다
    m.speciesId = next.id;
    const bonus = e.mega ? MEGA_BONUS : EVOLVE_BONUS; // 메가 진화는 더 크게 오른다
    m.atk += bonus.atk;
    m.maxHp += bonus.hp;
    m.hp = m.maxHp;
    m.wins = 0;
    m.evolveTold = false;
    return next;
  }
}
