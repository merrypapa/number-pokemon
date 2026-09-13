// 속성 상성. 공격 속성 → 방어 속성 → 배수. 없는 조합은 1(보통).
// 아이가 외우기 쉬운 고리: 불 > 풀 > 물 > 불, 전기 > 물, 땅 > 전기. 나머지는 재미 삼아 몇 개만.
export const TYPE_CHART = {
  '불':   { '풀': 1.5, '벌레': 1.5, '물': 0.5, '바위': 0.5 },
  '물':   { '불': 1.5, '땅': 1.5, '바위': 1.5, '풀': 0.5 },
  '풀':   { '물': 1.5, '땅': 1.5, '바위': 1.5, '불': 0.5, '벌레': 0.5 },
  '전기': { '물': 1.5, '땅': 0.5 },
  '땅':   { '불': 1.5, '전기': 1.5, '바위': 1.5, '독': 1.5, '풀': 0.5 },
  '바위': { '불': 1.5, '벌레': 1.5 },
  '벌레': { '풀': 1.5, '에스퍼': 1.5, '불': 0.5, '격투': 0.5 },
  '독':   { '풀': 1.5, '페어리': 1.5 },
  '에스퍼': { '독': 1.5, '격투': 1.5 },
  '고스트': { '에스퍼': 1.5, '고스트': 1.5, '노말': 0.5 },
  '페어리': { '고스트': 1.5, '격투': 1.5 },
  '격투': { '노말': 1.5, '바위': 1.5, '벌레': 0.5, '독': 0.5, '에스퍼': 0.5, '페어리': 0.5 },
  '노말': {},
};
export const TYPES = Object.keys(TYPE_CHART);
export function effectiveness(atkType, defType) { return TYPE_CHART[atkType]?.[defType] ?? 1; }
/** 이 속성이 공격할 때 1.5배가 되는 상대 속성들 */
export function strongAgainst(type) { return Object.entries(TYPE_CHART[type] || {}).filter(([, v]) => v > 1).map(([k]) => k); }
/** 이 속성이 맞을 때 1.5배로 아픈 공격 속성들 */
export function weakTo(type) { return TYPES.filter((t) => effectiveness(t, type) > 1); }
export function effectWord(mult) { return mult > 1 ? '효과가 굉장했다!' : mult < 1 ? '효과가 별로야…' : ''; }

// 진화는 그 속성의 고향 지역에서만 할 수 있다 (파이리는 불의산, 꼬부기는 물의길 …)
export const EVOLVE_ZONE = { '풀': 'forest', '노말': 'forest', '벌레': 'forest', '격투': 'forest', '땅': 'cave', '바위': 'cave', '독': 'cave', '물': 'sea', '불': 'volcano', '전기': 'space', '에스퍼': 'space', '고스트': 'space', '페어리': 'space' };
export function evolveZoneOf(type) { return EVOLVE_ZONE[type] || 'forest'; }
