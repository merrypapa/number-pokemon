import { dayKey } from './goals.js';
import { josa } from './util.js';
// 포켓몬 학교 공부: 교실의 내 자리에 앉으면 과목(수학·영어·국어·한자·과학)을 골라 다섯 문제를 푼다.
// 문제마다 보기 셋, 고르면 바로 "왜 그런지" 풀이를 보여 준다. 다 풀면 맞힌 수만큼 블록을 받는다.
// 오늘의 숙제: 날마다 과목 하나가 숙제로 정해지고(날짜로 정해서 껐다 켜도 같다), 그 과목에서 3문제 이상 맞히면 숙제 끝.
// 숙제를 끝내고 오박사님께 말을 걸면 칭찬과 함께 보너스 블록을 하루 한 번 준다 (main 의 talkTo).
//
// 기록(state.school): { day, studied: { 과목: 오늘 공부한 횟수 }, hwDone, hwPaid, total: { 과목: 지금까지 맞힌 수 } }

const ri = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const shuffle = (arr) => { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const pickN = (arr, n) => shuffle(arr).slice(0, n);
/** 문제 하나: q 질문, a 정답, wrong 오답 둘, why 풀이, big 크게 보여 줄 글자(한자·그림) */
const Q = (q, a, wrong, why, big = '') => ({ q, a: String(a), wrong: wrong.map(String), why, big });

// ---------- 수학: 덧셈·뺄셈·구구단·크기 비교 (낼 때마다 새로 만든다) ----------
function mathQuestion() {
  const kind = ri(0, 4);
  const near = (n, k = 3) => { const s = new Set(); while (s.size < 2) { const d = ri(1, k) * (Math.random() < 0.5 ? -1 : 1); if (n + d >= 0 && n + d !== n) s.add(n + d); } return [...s]; };
  if (kind === 0) { const a = ri(2, 12), b = ri(2, 9); return Q(`${a} + ${b} = ?`, a + b, near(a + b), `${a}에서 ${b}만큼 더 세면 ${a + b}!`); }
  if (kind === 1) { const a = ri(6, 18), b = ri(1, Math.min(9, a - 1)); return Q(`${a} - ${b} = ?`, a - b, near(a - b), `${a}에서 ${b}만큼 거꾸로 세면 ${a - b}!`); }
  if (kind === 2) { const a = ri(2, 9), b = ri(2, 9); return Q(`${a} × ${b} = ?`, a * b, near(a * b, a), `구구단 ${a}단: ${a} × ${b} = ${a * b}. ${a}를 ${b}번 더한 수야!`); }
  if (kind === 3) { const a = ri(1, 9), b = ri(1, 9), c = a + b; return Q(`□ + ${b} = ${c}. □에 들어갈 수는?`, a, near(a), `${c}에서 ${b}를 빼면 ${a}. 그래서 ${a} + ${b} = ${c}!`); }
  const a = ri(10, 99); let b = ri(10, 99); if (b === a) b = a + 1;
  const big = Math.max(a, b);
  return Q(`${a}, ${b} 중에 더 큰 수는?`, big, [Math.min(a, b), '둘이 같아'], `십의 자리부터 비교해 봐. ${josa(big, '이가')} 더 커!`);
}

// ---------- 영어: 그림 단어 ----------
const WORDS = [
  ['🍎', '사과', 'apple'], ['🐱', '고양이', 'cat'], ['🐶', '강아지', 'dog'], ['🐟', '물고기', 'fish'], ['🐦', '새', 'bird'],
  ['🔥', '불', 'fire'], ['💧', '물', 'water'], ['🌳', '나무', 'tree'], ['☀️', '해', 'sun'], ['🌙', '달', 'moon'],
  ['⭐', '별', 'star'], ['🏠', '집', 'house'], ['📕', '책', 'book'], ['🚗', '자동차', 'car'], ['🚂', '기차', 'train'],
  ['🍌', '바나나', 'banana'], ['🥚', '달걀', 'egg'], ['🥛', '우유', 'milk'], ['🌸', '꽃', 'flower'], ['⚡', '번개', 'thunder'],
  ['🪨', '돌', 'rock'], ['❄️', '얼음', 'ice'], ['🐻', '곰', 'bear'], ['🐸', '개구리', 'frog'], ['🐭', '쥐', 'mouse'],
  ['🦋', '나비', 'butterfly'], ['🐢', '거북이', 'turtle'], ['🐉', '용', 'dragon'], ['👀', '눈', 'eye'], ['✋', '손', 'hand'],
  ['🔴', '빨강', 'red'], ['🔵', '파랑', 'blue'], ['🟢', '초록', 'green'], ['🟡', '노랑', 'yellow'], ['⚪', '하양', 'white'],
  ['1️⃣', '하나', 'one'], ['2️⃣', '둘', 'two'], ['3️⃣', '셋', 'three'], ['5️⃣', '다섯', 'five'], ['🔟', '열', 'ten'],
];
const EN_PHRASES = [
  Q('아침에 만났을 때 하는 인사는?', 'Good morning', ['Good night', 'Thank you'], 'Good morning 은 "좋은 아침이에요", Good night 은 "잘 자요"야.'),
  Q('"고마워요"를 영어로 하면?', 'Thank you', ['Sorry', 'Hello'], 'Thank you 는 고마워요, Sorry 는 미안해요, Hello 는 안녕!'),
  Q('"미안해요"를 영어로 하면?', 'Sorry', ['Thank you', 'Bye'], '실수했을 때는 Sorry! 라고 해.'),
  Q('헤어질 때 하는 인사는?', 'Goodbye', ['Hello', 'Yes'], 'Goodbye(Bye) 는 잘 가, 안녕! 이야.'),
  Q('"네" 를 영어로 하면?', 'Yes', ['No', 'Wow'], 'Yes 는 네, No 는 아니요!'),
  Q('"I like Pikachu." 는 무슨 뜻?', '나는 피카츄를 좋아해', ['나는 피카츄야', '피카츄가 배고파'], 'like 는 "좋아하다"야. I like ~ 는 "나는 ~를 좋아해"!'),
  Q('"My name is Jiwoo." 는 무슨 뜻?', '내 이름은 지우야', ['나는 지우를 좋아해', '지우는 몇 살이야?'], 'name 은 이름. My name is ~ 는 "내 이름은 ~야".'),
  Q('"How are you?" 에 알맞은 대답은?', "I'm fine, thank you.", ["I'm seven.", 'It is a cat.'], 'How are you? 는 "어떻게 지내?" — I\'m fine 은 "잘 지내"야.'),
  Q('"How old are you?" 는 무엇을 묻는 걸까?', '나이', ['이름', '좋아하는 색'], 'old 는 나이가 많은. How old ~? 는 "몇 살이야?"!'),
  Q('"big" 의 반대말은?', 'small', ['tall', 'fast'], 'big 은 큰, small 은 작은!'),
  Q('"hot" 의 반대말은?', 'cold', ['warm', 'wet'], 'hot 은 뜨거운, cold 는 차가운. 불 포켓몬은 hot, 얼음 포켓몬은 cold!'),
  Q('"Pokémon, I choose you!" 에서 choose 의 뜻은?', '고르다', ['던지다', '달리다'], 'choose 는 "고르다". "너로 정했다!" 라는 뜻이야.'),
];
function englishQuestion() {
  const r = Math.random();
  if (r < 0.25) return pickN(EN_PHRASES, 1)[0];
  const [w, ...others] = pickN(WORDS, 3);
  if (r < 0.65) return Q(`${josa(w[1], '은는')} 영어로?`, w[2], others.map((o) => o[2]), `${w[0]} ${w[1]} = ${w[2]}`, w[0]);
  return Q(`"${w[2]}" — 무슨 뜻일까?`, w[1], others.map((o) => o[1]), `${w[2]} = ${w[1]} ${w[0]}`, w[0]);
}

// ---------- 국어: 반대말·맞춤법·흉내말·높임말·낱말 뜻 ----------
const KOREAN = [
  Q('"크다" 의 반대말은?', '작다', ['넓다', '높다'], '크다 ↔ 작다'),
  Q('"뜨겁다" 의 반대말은?', '차갑다', ['따뜻하다', '덥다'], '뜨겁다 ↔ 차갑다. 불꽃 ↔ 얼음!'),
  Q('"빠르다" 의 반대말은?', '느리다', ['가볍다', '늦잠'], '빠르다 ↔ 느리다. 피카츄는 빠르고 야돈은 느려!'),
  Q('"많다" 의 반대말은?', '적다', ['크다', '길다'], '많다 ↔ 적다'),
  Q('"열다" 의 반대말은?', '닫다', ['밀다', '켜다'], '문을 열다 ↔ 문을 닫다'),
  Q('"밝다" 의 반대말은?', '어둡다', ['맑다', '희다'], '밝다 ↔ 어둡다. 지하동굴은 어두워!'),
  Q('맞춤법이 바른 것은?', '어떻게 할까?', ['어떡게 할까?', '어떻해 할까?'], '"어떻게" 가 맞아. "어떡해" 는 "어떻게 해" 를 줄인 말이야.'),
  Q('맞춤법이 바른 것은?', '숙제를 안 했어', ['숙제를 않 했어', '숙제를 앉 했어'], '"안" 은 "아니" 의 준말. "않" 은 "~하지 않다" 처럼 써.'),
  Q('맞춤법이 바른 것은?', '포켓몬이 되었어', ['포켓몬이 돼었어', '포켓몬이 되엇어'], '"되었어" 가 맞아. 줄이면 "됐어"!'),
  Q('맞춤법이 바른 것은?', '왠지 기분이 좋아', ['웬지 기분이 좋아', '왼지 기분이 좋아'], '"왠지" 는 "왜인지" 의 준말이야.'),
  Q('맞춤법이 바른 것은?', '깨끗이 씻자', ['깨끗히 씻자', '깨끄시 씻자'], '"깨끗이" 가 맞아.'),
  Q('맞춤법이 바른 것은?', '며칠 동안', ['몇일 동안', '몇칠 동안'], '"며칠" 이 맞는 말이야.'),
  Q('비가 오는 소리를 흉내 낸 말은?', '주룩주룩', ['반짝반짝', '깡충깡충'], '주룩주룩은 소리, 반짝반짝은 빛, 깡충깡충은 뛰는 모양!'),
  Q('별이 빛나는 모양을 흉내 낸 말은?', '반짝반짝', ['멍멍', '뒤뚱뒤뚱'], '반짝반짝 작은 별~'),
  Q('토끼가 뛰는 모양을 흉내 낸 말은?', '깡충깡충', ['엉금엉금', '살랑살랑'], '엉금엉금은 거북이가 기어가는 모양이야.'),
  Q('피카츄가 전기를 쏘는 소리로 알맞은 것은?', '찌릿찌릿', ['보글보글', '야옹야옹'], '찌릿찌릿! 전기가 오르는 느낌이야.'),
  Q('할아버지께 쓰는 높임말로 알맞은 것은?', '진지 잡수세요', ['밥 먹어', '밥 먹자'], '어른께는 "밥" 대신 "진지", "먹다" 대신 "잡수시다" 를 써.'),
  Q('"있다" 의 높임말은?', '계시다', ['있어요다', '가시다'], '선생님께서 교실에 계셔.'),
  Q('"자다" 의 높임말은?', '주무시다', ['자시다', '눕다'], '할머니께서 주무셔.'),
  Q('문장 끝에 알맞은 문장 부호는? "너는 무슨 포켓몬을 좋아해__"', '?', ['.', '!'], '묻는 문장 끝에는 물음표(?)를 써.'),
  Q('"사과, 배, 포도" 를 묶어 부르는 말은?', '과일', ['채소', '동물'], '사과·배·포도는 모두 과일이야.'),
  Q('"피카츄, 파이리, 꼬부기" 를 묶어 부르는 말은?', '포켓몬', ['숫자블록', '과일'], '모두 포켓몬 친구들이야!'),
  Q('"학교" 의 첫 글자 "학" 의 받침은?', 'ㄱ', ['ㄴ', 'ㅇ'], '하 + ㄱ = 학'),
  Q('"꽃" 은 몇 글자일까?', '1글자', ['2글자', '3글자'], '꽃은 한 글자! 받침이 ㅊ 이야.'),
];

// ---------- 한자: 8급 기초 한자 ----------
const HANJA = [
  ['一', '한', '일'], ['二', '두', '이'], ['三', '석', '삼'], ['四', '넉', '사'], ['五', '다섯', '오'],
  ['六', '여섯', '육'], ['七', '일곱', '칠'], ['八', '여덟', '팔'], ['九', '아홉', '구'], ['十', '열', '십'],
  ['日', '날', '일'], ['月', '달', '월'], ['火', '불', '화'], ['水', '물', '수'], ['木', '나무', '목'],
  ['金', '쇠', '금'], ['土', '흙', '토'], ['山', '메', '산'], ['人', '사람', '인'], ['大', '큰', '대'],
  ['小', '작을', '소'], ['中', '가운데', '중'], ['上', '윗', '상'], ['下', '아래', '하'], ['王', '임금', '왕'],
  ['父', '아비', '부'], ['母', '어미', '모'], ['女', '여자', '녀'], ['子', '아들', '자'], ['白', '흰', '백'],
  ['靑', '푸를', '청'], ['門', '문', '문'], ['東', '동녘', '동'], ['西', '서녘', '서'], ['南', '남녘', '남'],
  ['北', '북녘', '북'], ['先', '먼저', '선'], ['生', '날', '생'], ['學', '배울', '학'], ['校', '학교', '교'],
];
const HANJA_TIP = { 火: '불 속성 포켓몬의 "불"!', 水: '물 속성 포켓몬의 "물"!', 木: '나무가 서 있는 모양이야.', 山: '봉우리 세 개가 솟은 산 모양!', 人: '사람이 걸어가는 모양이야.', 日: '해의 모양에서 왔어.', 月: '초승달 모양에서 왔어.', 門: '양쪽으로 여는 문 모양!', 學: '學校(학교)의 "학"!', 校: '學校(학교)의 "교"!', 大: '사람이 팔다리를 크게 벌린 모양!', 上: '선 위에 점, "위" 를 뜻해.', 下: '선 아래에 점, "아래" 를 뜻해.' };
const HANJA_WORDS = [
  Q('"학교" 를 한자로 쓰면?', '學校', ['先生', '大門'], '學(배울 학) + 校(학교 교) = 學校'),
  Q('"선생" 을 한자로 쓰면?', '先生', ['學生', '父母'], '先(먼저 선) + 生(날 생). 먼저 태어나 가르쳐 주는 분!'),
  Q('"부모" 를 한자로 쓰면?', '父母', ['子女', '兄弟'], '父(아비 부) + 母(어미 모) = 아버지와 어머니'),
  Q('"火山" 은 무슨 뜻일까?', '화산(불의 산)', ['물의 산', '큰 나무'], '火(불 화) + 山(메 산) = 불을 뿜는 산. 불의산처럼!'),
  Q('"大王" 은 무슨 뜻일까?', '큰 임금', ['작은 사람', '큰 문'], '大(큰 대) + 王(임금 왕)'),
  Q('달력에서 "月" 이 뜻하는 것은?', '달(월)', ['날(일)', '해(년)'], '1月 = 1월! 月 은 달 월.'),
];
function hanjaQuestion() {
  const r = Math.random();
  if (r < 0.2) return pickN(HANJA_WORDS, 1)[0];
  const [h, ...others] = pickN(HANJA, 3);
  const tip = HANJA_TIP[h[0]] ? ' ' + HANJA_TIP[h[0]] : '';
  if (r < 0.6) return Q('이 한자의 뜻과 소리는?', `${h[1]} ${h[2]}`, others.map((o) => `${o[1]} ${o[2]}`), `${h[0]} = ${h[1]} ${h[2]}.${tip}`, h[0]);
  return Q(`"${h[1]} ${h[2]}" — 어떤 한자일까?`, h[0], others.map((o) => o[0]), `${h[1]} ${h[2]} = ${h[0]}.${tip}`);
}

// ---------- 과학: 자연·몸·날씨·포켓몬 속성 ----------
const SCIENCE = [
  Q('물이 얼면 무엇이 될까?', '얼음', ['수증기', '모래'], '물은 0도 아래에서 얼어서 얼음이 돼.'),
  Q('물을 끓이면 나오는 하얀 김은?', '수증기', ['얼음', '연기'], '물이 뜨거워지면 수증기가 되어 날아가.'),
  Q('식물이 자라는 데 꼭 필요한 것은?', '햇빛과 물', ['사탕과 우유', '어둠과 모래'], '식물은 햇빛과 물, 공기로 양분을 만들어. 풀 포켓몬도 햇빛을 좋아해!'),
  Q('개구리는 어릴 때 무엇이었을까?', '올챙이', ['애벌레', '병아리'], '올챙이 → 개구리. 발챙이도 올챙이를 닮았지!'),
  Q('나비는 어릴 때 무엇이었을까?', '애벌레', ['올챙이', '달팽이'], '애벌레 → 번데기 → 나비. 캐터피도 그렇게 변해!'),
  Q('사람의 심장이 하는 일은?', '피를 온몸에 보내', ['음식을 씹어', '소리를 들어'], '심장은 펌프처럼 쿵쿵 뛰며 피를 보내.'),
  Q('소리를 듣는 곳은?', '귀', ['코', '혀'], '귀로 듣고, 코로 냄새 맡고, 혀로 맛을 봐.'),
  Q('자석에 붙는 것은?', '철로 된 클립', ['나무 젓가락', '고무 지우개'], '자석은 철을 끌어당겨. 코일도 자석 포켓몬이야!'),
  Q('번개가 친 뒤에 들리는 소리는?', '천둥', ['파도', '바람'], '번개는 빛, 천둥은 소리. 빛이 소리보다 빨라서 번쩍 다음에 우르릉!'),
  Q('무지개는 몇 가지 색일까?', '7가지', ['3가지', '10가지'], '빨주노초파남보 일곱 색!'),
  Q('해는 어느 쪽에서 뜰까?', '동쪽', ['서쪽', '북쪽'], '해는 동쪽에서 떠서 서쪽으로 져.'),
  Q('고래는 어떤 동물일까?', '젖을 먹이는 동물(포유류)', ['물고기', '새'], '고래는 바다에 살지만 숨을 쉬고 새끼에게 젖을 먹여.'),
  Q('불 포켓몬에게 강한 속성은?', '물', ['풀', '벌레'], '물은 불을 꺼! 그래서 물이 불에 강해.'),
  Q('물 포켓몬에게 강한 속성은?', '풀', ['불', '바위'], '풀은 물을 빨아들여 자라. 그래서 풀이 물에 강해.'),
  Q('풀 포켓몬에게 강한 속성은?', '불', ['물', '땅'], '불은 풀을 태워. 그래서 불이 풀에 강해.'),
  Q('바위·땅 포켓몬에게 강한 속성은?', '물', ['전기', '불'], '물은 바위를 깎고 흙을 무르게 해.'),
  Q('공기가 움직이는 것을 뭐라고 할까?', '바람', ['구름', '안개'], '공기가 움직이면 바람! 바람개비가 돌아가.'),
  Q('달은 스스로 빛을 낼까?', '아니, 햇빛을 받아 빛나', ['응, 스스로 빛나', '밤에만 스스로 빛나'], '달은 햇빛을 반사해서 밝게 보이는 거야.'),
];

export const SUBJECTS = [
  { id: 'math', emoji: '📐', name: '수학', sub: '덧셈 · 뺄셈 · 구구단', make: mathQuestion },
  { id: 'english', emoji: '🔤', name: '영어', sub: '그림 단어 · 인사말', make: englishQuestion },
  { id: 'korean', emoji: '📖', name: '국어', sub: '반대말 · 맞춤법 · 흉내말', make: () => pickN(KOREAN, 1)[0] },
  { id: 'hanja', emoji: '🈷️', name: '한자', sub: '8급 기초 한자', make: hanjaQuestion },
  { id: 'science', emoji: '🔬', name: '과학', sub: '자연 · 몸 · 포켓몬 속성', make: () => pickN(SCIENCE, 1)[0] },
];
export const SUBJECT_BY_ID = Object.fromEntries(SUBJECTS.map((s) => [s.id, s]));
export const LESSON_LEN = 5;   // 한 번 공부에 다섯 문제
export const HW_PASS = 3;      // 숙제는 3문제 이상 맞히면 끝
export const HW_BONUS = 10;    // 숙제를 끝내고 오박사님께 말하면 받는 블록

export function emptySchool() { return { day: dayKey(), studied: {}, hwDone: false, hwPaid: false, total: {} }; }
/** 저장에서 읽은 기록. 하루가 바뀌었으면 오늘 기록(공부 횟수·숙제)은 새로 시작한다 */
export function loadSchool(s) {
  const S = { ...emptySchool(), ...(s || {}), total: { ...(s?.total || {}) } };
  return rollSchoolDay(S);
}
export function rollSchoolDay(S) {
  const today = dayKey();
  if (S.day !== today) Object.assign(S, { day: today, studied: {}, hwDone: false, hwPaid: false });
  return S;
}
/** 오늘의 숙제 과목 (날짜로 정한다) */
export function homeworkOf(day = dayKey()) {
  let h = 0;
  for (const ch of day) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return SUBJECTS[h % SUBJECTS.length];
}

/** 한 과목 다섯 문제 (같은 문제가 겹치지 않게) */
function makeLesson(subject) {
  const out = [], seen = new Set();
  let guard = 0;
  while (out.length < LESSON_LEN && guard++ < 60) {
    const q = subject.make();
    if (seen.has(q.q + q.a)) continue;
    seen.add(q.q + q.a);
    out.push({ ...q, choices: shuffle([q.a, ...q.wrong]) });
  }
  return out;
}

export class Study {
  /** onReward(correct, subject, { homework }) — 다 풀었을 때 블록을 준다. onClose() — 자리에서 일어날 때 */
  constructor({ sound, getState, onReward, onClose }) {
    Object.assign(this, { sound, getState, onReward, onClose });
    this.el = document.getElementById('study');
    this.card = document.getElementById('study-card');
    this.open = false;
  }
  show() {
    this.open = true;
    this.el.classList.remove('hidden');
    this.renderPick();
  }
  close() {
    if (!this.open) return;
    this.open = false;
    this.lesson = null;
    this.el.classList.add('hidden');
    this.onClose?.();
  }
  /** ESC: 문제 푸는 중이면 과목 고르기로, 고르기 화면이면 일어서기 */
  back() { if (this.lesson) this.renderPick(); else this.close(); }

  renderPick() {
    this.lesson = null;
    const S = rollSchoolDay(this.getState());
    const hw = homeworkOf(S.day);
    this.card.innerHTML = `
      <div class="study-title">🏫 포켓몬 학교 · 무슨 공부를 할까?</div>
      <div class="study-hw ${S.hwDone ? 'done' : ''}">📒 오늘의 숙제: <b>${hw.emoji} ${hw.name}</b> ${S.hwDone ? (S.hwPaid ? '— 끝! 참 잘했어요 💮' : '— 끝! 오박사님께 보여 드리자 🙋') : `— ${LESSON_LEN}문제 중 ${HW_PASS}개 이상 맞히면 끝`}</div>
      <div class="study-subjects">${SUBJECTS.map((s) => `
        <button class="study-subject${s.id === hw.id ? ' hw' : ''}" data-id="${s.id}">
          <span class="study-emoji">${s.emoji}</span><span class="study-name">${s.name}</span><span class="study-sub">${s.sub}</span>
          <span class="study-count">${S.studied[s.id] ? `오늘 ${S.studied[s.id]}번 공부했어` : '오늘 아직 안 했어'}</span>
          ${s.id === hw.id ? '<span class="study-badge">숙제</span>' : ''}
        </button>`).join('')}</div>
      <button class="study-leave">🪑 자리에서 일어나기</button>`;
    for (const b of this.card.querySelectorAll('.study-subject')) b.onclick = () => this.start(SUBJECT_BY_ID[b.dataset.id]);
    this.card.querySelector('.study-leave').onclick = () => { this.sound?.click(); this.close(); };
  }

  start(subject) {
    this.sound?.click();
    this.lesson = { subject, qs: makeLesson(subject), i: 0, correct: 0 };
    this.renderQuestion();
  }

  renderQuestion() {
    const L = this.lesson, q = L.qs[L.i];
    this.card.innerHTML = `
      <div class="study-title">${L.subject.emoji} ${L.subject.name} · ${L.i + 1} / ${L.qs.length} <span class="study-score">⭕ ${L.correct}</span></div>
      <div class="study-progress">${L.qs.map((_, k) => `<i class="${k < L.i ? 'past' : k === L.i ? 'now' : ''}"></i>`).join('')}</div>
      ${q.big ? `<div class="study-big${L.subject.id === 'hanja' ? ' hanja' : ''}">${q.big}</div>` : ''}
      <div class="study-q">${q.q}</div>
      <div class="study-choices">${q.choices.map((c) => `<button data-v="${c.replace(/"/g, '&quot;')}">${c}</button>`).join('')}</div>
      <div class="study-why"></div>
      <div class="study-nav"><button class="study-back">◀ 과목 고르기</button><button class="study-next hidden">다음 ▶</button></div>`;
    for (const b of this.card.querySelectorAll('.study-choices button')) b.onclick = () => this.answer(b);
    this.card.querySelector('.study-back').onclick = () => { this.sound?.click(); this.renderPick(); };
    this.card.querySelector('.study-next').onclick = () => this.next();
  }

  answer(btn) {
    const L = this.lesson; if (!L || L.answered) return;
    const q = L.qs[L.i], ok = btn.dataset.v === q.a;
    L.answered = true;
    if (ok) { L.correct++; this.sound?.fanfare(); } else this.sound?.bounce();
    for (const b of this.card.querySelectorAll('.study-choices button')) { b.disabled = true; if (b.dataset.v === q.a) b.classList.add('right'); }
    if (!ok) btn.classList.add('wrong');
    const why = this.card.querySelector('.study-why');
    why.innerHTML = `${ok ? '🎉 <b>정답!</b>' : `😢 정답은 <b>${q.a}</b>`} ${q.why}`;
    why.classList.add(ok ? 'right' : 'wrong');
    this.card.querySelector('.study-score').textContent = `⭕ ${L.correct}`;
    const nx = this.card.querySelector('.study-next');
    nx.textContent = L.i + 1 < L.qs.length ? '다음 ▶' : '다 풀었어! ▶';
    nx.classList.remove('hidden');
  }

  next() {
    const L = this.lesson; if (!L) return;
    this.sound?.click();
    L.answered = false;
    if (++L.i < L.qs.length) { this.renderQuestion(); return; }
    this.finishLesson();
  }

  finishLesson() {
    const L = this.lesson, S = rollSchoolDay(this.getState());
    const hw = homeworkOf(S.day);
    S.studied[L.subject.id] = (S.studied[L.subject.id] || 0) + 1;
    S.total[L.subject.id] = (S.total[L.subject.id] || 0) + L.correct;
    const hwNow = L.subject.id === hw.id && !S.hwDone && L.correct >= HW_PASS;
    if (hwNow) S.hwDone = true;
    const reward = L.correct; // 맞힌 문제마다 블록 하나
    this.onReward?.(reward, L.subject, { homework: hwNow });
    const perfect = L.correct === L.qs.length;
    this.card.innerHTML = `
      <div class="study-title">${L.subject.emoji} ${L.subject.name} 공부 끝!</div>
      <div class="study-result">${perfect ? '💯' : L.correct >= HW_PASS ? '👍' : '💪'}</div>
      <div class="study-q">${L.qs.length}문제 중 <b>${L.correct}</b>개 맞았어!${perfect ? ' 만점이야!' : ''}</div>
      <div class="study-why right">🟦 블록 ${reward}개를 받았어!${hwNow ? ` 📒 오늘의 숙제(${hw.name})도 끝! 오박사님께 말씀드리면 칭찬해 주실 거야.` : ''}</div>
      ${L.subject.id === hw.id && !S.hwDone ? `<div class="study-why wrong">숙제는 ${HW_PASS}개 이상 맞혀야 끝나. 한 번 더 해 보자!</div>` : ''}
      <div class="study-nav"><button class="study-back">📚 다른 과목 공부하기</button><button class="study-leave2">🪑 일어나기</button></div>`;
    this.lesson = null;
    this.card.querySelector('.study-back').onclick = () => { this.sound?.click(); this.renderPick(); };
    this.card.querySelector('.study-leave2').onclick = () => { this.sound?.click(); this.close(); };
  }
}
