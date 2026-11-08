// 넘버볼: 숫자블록으로 교환하는 포획 도구. 몬스터볼·슈퍼볼·하이퍼볼은 같은 모델(포켓몬볼.glb)에 뚜껑 색만 다르고(몬스터볼은 원래 빨강 그대로),
// 마스터볼은 마스터볼.glb(분홍·하늘색, 별과 달 무늬)이다. 등급이 높을수록 센 포켓몬도 잘 잡힌다.
// id 는 예전 저장과 맞추려고 그대로 둔다 (bronze=몬스터볼, silver=슈퍼볼, gold=하이퍼볼). 메가큐브(diamond)는 없앴다 — 옛 저장의 메가큐브는 불러올 때 하이퍼볼 2개씩으로 바꾼다 (main applySave)
// 값은 키우기 비용과 함께 두 배로 올렸다 — 볼 하나를 만들지, 포켓몬을 키울지 고민하게.
export const BALLS = [
  { id: 'bronze',  name: '몬스터볼', tier: 1, cost: 4,  color: 0xe8453c, css: '#e8453c', plain: true }, // 원래 빨간 뚜껑 그대로 (칠하지 않는다)
  { id: 'silver',  name: '슈퍼볼',   tier: 2, cost: 12, color: 0x2f7fe0, css: '#2f7fe0' },
  { id: 'gold',    name: '하이퍼볼', tier: 3, cost: 30, color: 0xffd23f, css: '#f2c200' },
  { id: 'master',  name: '마스터볼', tier: 5, cost: 120, color: 0xff8fc0, css: '#ff6fa8', shape: 'master' }, // 마스터볼.glb. 어떤 포켓몬이든 반드시 잡힌다
];
export const BALL_BY_ID = Object.fromEntries(BALLS.map((b) => [b.id, b]));
BALL_BY_ID.diamond = BALL_BY_ID.gold; // 없앤 메가큐브를 아직 가리키는 곳(옛 캐시의 코드)이 깨지지 않게 하이퍼볼로 읽는다 (BALLS 목록에는 없다)

// 포켓몬 등급 (creatures.json 의 grade): 1 초급(푸른숲) · 2 중급(지하동굴) · 3 고급(물의길) · 4 최상급(불의산) · 5 전설급(꿈의우주) · 6 보스급
export const GRADES = { 1: '초급', 2: '중급', 3: '고급', 4: '최상급', 5: '전설급', 6: '보스급', 7: '메가급' };
export function gradeStars(g) { return g >= 7 ? '✨★★★★★★' : '★'.repeat(Math.min(6, Math.max(1, g))); }

// 잡힐 확률(%) [등급][볼 등급]. 체력을 0으로 만든 뒤 넘버볼을 던졌을 때. 실패하면 도망간다.
// 열: 몬스터볼 · 슈퍼볼 · 하이퍼볼 · (없앤 메가큐브 자리, 쓰지 않음) · 마스터볼. 마스터볼은 늘 100%
const CHANCE = {
  1: [100, 100, 100, 100, 100],
  2: [65, 100, 100, 100, 100],
  3: [35, 75, 100, 100, 100],
  4: [20, 50, 85, 95, 100],
  5: [10, 35, 70, 85, 100],
  6: [10, 30, 60, 80, 100],
  7: [2, 8, 25, 60, 100], // 메가급: 하이퍼볼로는 넷 중 하나, 마스터볼이면 반드시
};
// 같은 포켓몬에게 실패할 때마다 잡힐 확률이 이만큼 오른다 (계속 도망만 가지 않게)
export const RETRY_BONUS = 15;
export function catchChance(grade, tier) { return (CHANCE[Math.min(7, Math.max(1, grade))] || CHANCE[1])[Math.min(5, Math.max(1, tier)) - 1]; }
/** 이 등급을 확실히(90% 이상) 잡을 수 있는 가장 싼 볼 */
export function recommendedBall(grade) { return BALLS.find((b) => catchChance(grade, b.tier) >= 80) || BALLS[BALLS.length - 1]; }
