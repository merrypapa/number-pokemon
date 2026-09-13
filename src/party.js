// 내 포켓몬(파티). 잡은 몬스터는 여기에 들어오고, 그중 한 마리가 "대표"로 주인공 뒤를 따라다니며 대결에 나간다.
//  - 스탯: atk(공격력), maxHp(체력), hp(지금 체력). 처음엔 종의 baseAtk/baseHp.
//  - 숫자블록 1개 = 공격력 +1 또는 체력 +1.
//  - 기술: 종의 skills 중 atk 가 문턱(skill.atk) 이상인 것만 쓸 수 있다. 피해 = atk × skill.power.
//  - 진화: 종의 evolution 조건(atk, hp)을 넘으면 진화할 수 있다. 진화하면 다음 종이 되고 스탯 보너스를 받는다.
//  - 대결에서 지면 체력이 종의 baseHp 로 돌아간다(공격력은 그대로).
export const EVOLVE_BONUS = { atk: 3, hp: 5 };

export class Party {
  constructor(speciesById, caughtCounts = {}) {
    this.speciesById = speciesById;
    this.caughtCounts = caughtCounts; // 종별로 잡은 마리 수 (main 의 state.dex 와 같은 객체)
    this.members = [];
    this.leaderUid = null;
    this.nextUid = 1;
  }

  species(m) { return this.speciesById[m.speciesId]; }
  get leader() { return this.members.find((m) => m.uid === this.leaderUid) || null; }
  setLeader(m) { this.leaderUid = m.uid; }
  isLeader(m) { return m.uid === this.leaderUid; }

  /** 새 멤버. mesh 는 따라다닐 때 쓰는 3D 오브젝트 (잡은 몬스터의 mesh 또는 새로 만든 것). */
  add(speciesId, mesh) {
    const sp = this.speciesById[speciesId];
    const m = { uid: this.nextUid++, speciesId, atk: sp.baseAtk, maxHp: sp.baseHp, hp: sp.baseHp, mesh, evolveTold: false };
    this.members.push(m);
    if (!this.leader) this.leaderUid = m.uid;
    return m;
  }

  name(m) { return this.species(m).name; }
  color(m) { return this.species(m).draftShape?.color || '#ffd93d'; }

  /** 지금 쓸 수 있는 기술들 (공격력 문턱을 넘은 것) */
  skills(m) { return (this.species(m).skills || []).filter((s) => m.atk >= s.atk); }
  /** 다음에 열릴 기술 (없으면 null) */
  nextSkill(m) { return (this.species(m).skills || []).find((s) => m.atk < s.atk) || null; }
  damage(m, skill) { return Math.max(1, Math.round(m.atk * (skill?.power || 1))); }

  /** 블록 n개로 공격력/체력 올리기. 체력을 올리면 지금 체력도 같이 오른다. */
  upgrade(m, stat, n = 1) {
    if (stat === 'atk') m.atk += n;
    else { m.maxHp += n; m.hp += n; }
  }

  heal(m) { m.hp = m.maxHp; }
  /** 대결에서 졌을 때: 체력이 종의 기본 체력으로 돌아간다 */
  loseReset(m) { const sp = this.species(m); m.maxHp = sp.baseHp; m.hp = sp.baseHp; }
  /** 탐험 중 천천히 회복 (1씩) */
  regen(m) { if (m.hp < m.maxHp) { m.hp += 1; return true; } return false; }

  caughtOf(m) { return this.caughtCounts[m.speciesId] || 0; }
  canEvolve(m) {
    const e = this.species(m).evolution;
    return !!(e && this.speciesById[e.to] && m.atk >= e.atk && m.maxHp >= e.hp && this.caughtOf(m) >= (e.count || 1));
  }
  /** 진화. 새 종의 데이터를 돌려준다. mesh 교체는 부르는 쪽(main)에서 한다. */
  evolve(m) {
    const e = this.species(m).evolution;
    const next = this.speciesById[e.to];
    m.speciesId = next.id;
    m.atk += EVOLVE_BONUS.atk;
    m.maxHp = Math.max(m.maxHp + EVOLVE_BONUS.hp, next.baseHp);
    m.hp = m.maxHp;
    m.evolveTold = false;
    return next;
  }
}
