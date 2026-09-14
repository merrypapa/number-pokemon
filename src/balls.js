// 넘버볼: 숫자블록으로 교환하는 포획 도구. 등급이 높을수록 센 포켓몬도 잘 잡힌다.
export const BALLS = [
  { id: 'bronze',  name: '브론즈볼',  tier: 1, cost: 2,  color: 0xcd7f32, css: '#cd7f32' },
  { id: 'silver',  name: '실버볼',   tier: 2, cost: 6,  color: 0xc0c0c0, css: '#b8bcc4' },
  { id: 'gold',    name: '골드볼',   tier: 3, cost: 15, color: 0xffc300, css: '#f2b705' },
  { id: 'diamond', name: '메가볼', tier: 4, cost: 40, color: 0x7fe3ff, css: '#5fd3f5' }, // id 는 예전 저장과 맞추려고 그대로 둔다
];
export const BALL_BY_ID = Object.fromEntries(BALLS.map((b) => [b.id, b]));

// 포켓몬 등급 (creatures.json 의 grade): 1 초급(푸른숲) · 2 중급(지하동굴) · 3 고급(물의길) · 4 최상급(불의산) · 5 전설급(꿈의우주) · 6 보스급
export const GRADES = { 1: '초급', 2: '중급', 3: '고급', 4: '최상급', 5: '전설급', 6: '보스급', 7: '메가급' };
export function gradeStars(g) { return g >= 7 ? '✨★★★★★★' : '★'.repeat(Math.min(6, Math.max(1, g))); }

// 잡힐 확률(%) [등급][볼 등급]. 체력을 0으로 만든 뒤 넘버볼을 던졌을 때. 실패하면 도망간다.
const CHANCE = {
  1: [100, 100, 100, 100],
  2: [65, 100, 100, 100],
  3: [35, 75, 100, 100],
  4: [20, 50, 85, 100],
  5: [10, 35, 70, 98],
  6: [10, 30, 60, 95],
  7: [2, 8, 25, 80], // 메가급: 메가볼이라야 제대로 잡힌다
};
// 같은 포켓몬에게 실패할 때마다 잡힐 확률이 이만큼 오른다 (계속 도망만 가지 않게)
export const RETRY_BONUS = 15;
export function catchChance(grade, tier) { return (CHANCE[Math.min(7, Math.max(1, grade))] || CHANCE[1])[Math.min(4, Math.max(1, tier)) - 1]; }
/** 이 등급을 확실히(90% 이상) 잡을 수 있는 가장 싼 볼 */
export function recommendedBall(grade) { return BALLS.find((b) => catchChance(grade, b.tier) >= 80) || BALLS[BALLS.length - 1]; }
