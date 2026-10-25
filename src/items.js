// 상점에서 블록으로 사는 아이템 (넘버볼은 src/balls.js). 도감의 상점 탭과 대결 중 "가방"에서 쓴다.
//  - 물약: 체력 20 회복 · 좋은 물약: 체력 전부 회복 · 기운의 열매: 기절한 포켓몬을 깨워 체력 절반으로
export const ITEMS = [
  { id: 'potion', name: '물약', emoji: '🧪', cost: 8, heal: 20, desc: '체력 20 회복' },
  { id: 'superPotion', name: '좋은 물약', emoji: '🧴', cost: 20, heal: 'full', desc: '체력 전부 회복' },
  { id: 'revive', name: '기운의 열매', emoji: '🍒', cost: 25, revive: true, desc: '기절한 포켓몬을 깨워 체력 절반으로' },
];
export const ITEM_BY_ID = Object.fromEntries(ITEMS.map((i) => [i.id, i]));
export const emptyItems = () => ({ potion: 0, superPotion: 0, revive: 0 });

/** 이 포켓몬에게 이 아이템을 쓸 수 있나 (기절한 포켓몬에겐 열매만, 멀쩡한 포켓몬에겐 물약만) */
export function canUseItem(item, m) {
  if (!item || !m) return false;
  if (item.revive) return m.hp <= 0;
  return m.hp > 0 && m.hp < m.maxHp;
}
/** 아이템을 쓴다. 회복한 양을 돌려준다 (쓸 수 없으면 0) */
export function applyItem(item, m) {
  if (!canUseItem(item, m)) return 0;
  const before = m.hp;
  if (item.revive) m.hp = Math.max(1, Math.ceil(m.maxHp / 2));
  else if (item.heal === 'full') m.hp = m.maxHp;
  else m.hp = Math.min(m.maxHp, m.hp + item.heal);
  return m.hp - before;
}
