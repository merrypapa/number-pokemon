import * as THREE from 'three';
import { makeNpc } from './npc.js';
import { josa } from './util.js';

// ---------------------------------------------------------------------------
// 넘버로켓단 대원 — 지역마다 한 명 (docs/02_storyline.md 4장 "로켓 대원")
//
// 지구의 여섯 지역과 꿀벌집에 검은 옷을 입은 대원이 한 명씩 서 있다.
// 대원은 맵 바깥쪽 명소(협곡 길목·난파선·바깥 섬…)에 서 있어서, 찾아가려면 맵을 넓게 돌아다녀야 한다.
// 말을 걸면 세뇌한 포켓몬(붉은 숫자를 단, 야생보다 센 개체)을 내보내고, 그 포켓몬의 붉은 숫자를 0으로 만들면
// 포켓몬은 친구가 되고 대원은 숫자를 못 세며 항복한다. 이긴 자리에는 항복한 대원이 흰 깃발을 들고 남아
// 그 지역의 비밀을 한 줄씩 알려 준다 (지역마다 다른, 한 번뿐인 콘텐츠).
//
// 아무도 다치지 않는다. 대원은 무섭지 않고 우스꽝스럽다 — 늘 숫자를 틀린다.
// ---------------------------------------------------------------------------

/** 대원 한 명의 설계
 *  at      : 서 있으면 좋은 자리 (막혀 있으면 main.js 가 근처의 빈자리로 옮긴다)
 *  mon     : 세뇌한 포켓몬 (creatures.json 의 id) / hp·atk: 그 개체의 능력치 (야생보다 세고 보스보다는 약하게)
 *  extra   : 그 지역에 맞게 덮어쓸 값 (심해는 헤엄 끄기 등)
 *  ball    : 이기면 주는 넘버볼 / blocks: 이기면 주는 블록
 *  greet   : 처음 다가갔을 때 / taunt: 대결을 걸 때 / lose: 졌을 때(항복) / hold: 지우가 물러났을 때
 *  after   : 항복한 뒤의 대화 (지역 비밀·힌트)
 *
 *  능력치 기준: 그 지역 야생보다 세고, 그 지역 보스의 60~70% 체력에 공격은 보스보다 낮게 —
 *  야생 → 대원 → 보스 순서로 올라가는 계단이 되도록 (대원이 보스를 대신하지 않게).
 */
export const GRUNTS = {
  forest: {
    name: '로켓단 덜렁이', at: { x: 104, z: -80 }, mon: 'm08', hp: 26, atk: 5, ball: 'bronze', blocks: 12,
    greet: '거기 서! 이 길은 넘버로켓단이 막았다! …어, 셋까지 세고 말하랬는데.',
    taunt: '가라 냐옹! 붉은 26으로 덮쳐라! 어… 26이 맞나? 27인가?',
    lose: '내 숫자가 깨졌잖아! 셋… 넷… 아, 몇까지 세야 하는 거야! 후퇴!',
    hold: '하하! 숫자도 못 세는 나한테 졌지! …어라, 그럼 나는 뭐지?',
    after: [
      '아이고… 나 사실 열까지도 못 세. 그래서 로켓단이 시키는 대로만 했어.',
      '붉은 숫자는 가짜야. 진짜 숫자는 포켓몬이 스스로 고른 "좋아하는 숫자"래. 네가 깨 준 냐옹도 그랬지?',
      '이 길로 더 가면 붉은 바위 협곡, 불의산 입구야. 거기 대원은 나보다 세니까 조심해!',
      '바깥으로 나갈수록 반짝이는 상자가 잘 나와. 우리가 숨겨 둔 거였는데… 이제 네가 가져.',
    ],
  },
  hive: {
    name: '로켓단 붕붕이', at: { x: 34, z: 30 }, mon: 'm51e', hp: 38, atk: 6, ball: 'bronze', blocks: 16,
    greet: '쉿! 벌 떼 실험 중이야. 하나, 둘, 셋… 넷은 어디 갔지?',
    taunt: '딱충이, 붉은 38로 줄 맞춰! 줄! 줄을 맞추라고!',
    lose: '줄이 흐트러졌어! 벌이 몇 마리였더라… 후퇴!',
    hold: '봤지? 여럿을 한꺼번에 세는 건 아무나 못 해!',
    after: [
      '여기가 첫 실험실이었어. 여럿을 한꺼번에 조종해 보려고 벌집을 골랐대.',
      '벌집 방이 왜 육각형인지 알아? 빈틈없이 채우면서 밀랍은 제일 적게 쓰거든. 우리보다 벌이 똑똑해.',
      '북쪽 탑 꼭대기에 대장 독침붕이 있어. 육각 계단 열한 개를 폴짝폴짝 뛰어야 올라가.',
      '계단이 몇 개랬지? 하나, 둘… 아, 열한 개! 이건 외웠다!',
    ],
  },
  cave: {
    name: '로켓단 곡괭이', at: { x: -58, z: -52 }, mon: 'm17e', hp: 44, atk: 7, ball: 'silver', blocks: 22,
    greet: '누구야! 여긴 붉은 원석 광산이라고… 아, 말하면 안 되는 거였나?',
    taunt: '골뱃, 붉은 44로 캄캄하게 만들어! 44… 사사? 사십사?',
    lose: '원석이 다 식어 버렸어! 셋… 넷… 후퇴!',
    hold: '깜깜하지? 여기선 숫자도 안 보인다고!',
    after: [
      '검은 옷 입은 우리가 밤마다 캐 간 건 하얀 블록이 아니라 붉게 빛나는 돌이었어. 가짜 숫자의 재료야.',
      '롱스톤을 굴 파는 장비처럼 부렸어… 미안해. 굴을 판 건 롱스톤인데 상은 우리가 받았지.',
      '포니타를 친구로 만들면 굴이 환해져. 불빛이 있으면 멀리까지 보여!',
      '호수는 다리로만 건널 수 있어. 다리는 두 개… 아니 세 개였나? 아무튼 가 보면 알아.',
    ],
  },
  volcano: {
    name: '로켓단 뜨끈이', at: { x: 92, z: 70 }, mon: 'm25', hp: 84, atk: 11, ball: 'silver', blocks: 30,
    greet: '어이 꼬마! 여긴 화력 훈련장이야. 하나, 둘! 하나, 둘! …그다음은?',
    taunt: '가디! 붉은 84로 불을 뿜어! 84, 84… 아 뜨거!',
    lose: '불이 꺼졌어! 하나, 둘… 셋이 안 나와! 후퇴!',
    hold: '하나, 둘! 그것 봐, 두 개면 충분하다니까!',
    after: [
      '여기선 하루 종일 같은 명령만 울렸어. "하나, 둘. 하나, 둘." 그래서 나도 둘까지밖에 못 세.',
      '물 포켓몬을 데려오면 불 포켓몬한테 훨씬 세. 우린 그걸 몰라서 계속 졌지.',
      '간헐천이 네 군데 있어. 하나, 둘… 그다음은 네가 세 줘.',
      '분화구 안쪽 용암에는 들어가면 안 돼! 가장자리 길로 돌아가야 해.',
    ],
  },
  sea: {
    name: '로켓단 파도타기', at: { x: 104, z: 36 }, mon: 'm20', hp: 60, atk: 9, ball: 'silver', blocks: 26,
    greet: '여기까지 배를 타고 왔다고? 이 바깥 섬은 아무도 못 찾는 줄 알았는데!',
    taunt: '고라파덕! 붉은 60으로 물대포! 60… 6? 600? 아 헷갈려!',
    lose: '파도에 숫자가 떠내려갔어! 셋… 넷… 후퇴!',
    hold: '바다에서는 우리가 한 수 위라고!',
    after: [
      '우린 잉어킹한테 숫자를 한꺼번에 밀어 넣어서 억지로 갸라도스를 만들었어. 억지로 큰 애들은 눈이 안 웃어.',
      '서쪽 먼바다에 소용돌이가 있어. 거북왕을 친구로 만든 뒤에 배로 들어가면 심해로 내려가.',
      '먼바다 등대까지 가 봤어? 거기까지 나가면 보물상자가 자주 떠 있어.',
      '바다 보물상자는 열면 숫자블록 친구가 튀어나와. 문제를 맞혀야 열리는 자물쇠인 셈이지.',
    ],
  },
  deepsea: {
    name: '로켓단 뽀글이', at: { x: -56, z: 32 }, mon: 'm42', hp: 95, atk: 16, extra: { swim: false }, ball: 'gold', blocks: 40,
    greet: '이 난파선이 우리 잠수정 기지야… 였어. 지금은 나 혼자 남았지만.',
    taunt: '라프라스! 붉은 95로 얼려 버려! 95… 59? 구십이 몇이더라!',
    lose: '백까지 세다가 숨이 찼어! 후퇴! 보글보글…',
    hold: '깊은 바다에서는 숫자도 천천히 가라앉는다고!',
    after: [
      '여기 포켓몬이 왜 물의길보다 센 줄 알아? 우리가 숫자를 억지로 부풀렸거든. 한 마리에 한 배 반씩.',
      '해구 바닥에 갸라도스가 있어. 원래는 작은 잉어킹이었대. 되돌려 주면 좋겠어.',
      '난파선 안은 캄캄해. 대표 포켓몬 중에 빛나는 애가 있으면 훨씬 편해.',
      '물속에서는 점프 버튼을 누르고 있으면 위로 헤엄쳐 올라가. 나도 그건 잘해!',
    ],
  },
  space: {
    name: '로켓단 둥둥이', at: { x: 105, z: 6 }, mon: 'm26', hp: 118, atk: 22, ball: 'gold', blocks: 48,
    greet: '지구는 연습이었어. 진짜 군대는 저 위 행성에 있다고! …저 위가 몇 개였지?',
    taunt: '고우스트! 붉은 118로 스며들어! 118… 81? 811…?',
    lose: '숫자가 우주로 날아갔어! 하나도 안 남았어! 후퇴!',
    hold: '거봐, 별은 너무 많아서 셀 수가 없다니까!',
    after: [
      '행성은 열 개야. 수성·금성·지구·화성·목성·토성·천왕성·해왕성·명왕성, 그리고 태양. 그게… 열 개 맞지?',
      '행성마다 넘버 간부가 하나씩 있어. 넘버원부터 넘버텐까지. 각자 숫자를 하나씩 뺏어 갔대.',
      '열 개를 다 되찾으면 전설의 뮤가 나타난다는 소문이 있어. 나도 본 적은 없지만.',
      '제단의 팬텀을 되돌려야 별의 문이 열려. 그래야 손오공의 UFO 가 뜬다고.',
      '여긴 중력이 약해서 높이 뛸 수 있어. 나도 뛰어 봤는데 내려올 때 몇 초였는지 못 셌어.',
    ],
  },
};

// ---------------------------------------------------------------------------
// 열 명의 넘버 간부 — 행성마다 한 명 (docs/02_storyline.md 6장)
//
// 행성 열 곳의 지부장. 각자 그 별의 숫자를 하나씩 뺏어 갔고, 그 숫자로 아레나의 보스에게
// 가짜 숫자를 씌웠다. 간부를 이기면 뺏긴 숫자가 그 별로 돌아온다 — 열 개가 다 모이면 뮤가 나타난다.
// 대원과 달리 도망치지 않고, 진 자리에 남아 제 별의 비밀을 알려 준다.
// 행성 지형은 열 곳이 같은 틀(src/planets.js)이라 서 있는 자리도 하나로 정해 두었다: 착륙장에서 아레나로 가는 길목.
// ---------------------------------------------------------------------------
const CHIEF_SPOT = { x: -34, z: -18 }; // 착륙장(0,83)에서 아레나(0,-69)로 가는 길 서쪽
const CHIEFS = [
  { zone: 'p_mercury', name: '넘버원',   num: 1,  mon: 'm33', hp: 44,  atk: 9,  ball: 'silver',  blocks: 30,
    quip: '하나! 세상에 필요한 숫자는 하나면 충분하다.',
    secret: '수성의 하루는 88일, 1년도 88일이다. 하루와 1년이 같은 별이지.' },
  { zone: 'p_venus',   name: '넘버투',   num: 2,  mon: 'm40e', hp: 60, atk: 12, ball: 'silver',  blocks: 34,
    quip: '둘씩 짝지어 줄을 세우면 세상이 얼마나 깔끔한지 아느냐.',
    secret: '금성과 지구는 크기가 거의 같아서 쌍둥이라 불린다. 둘이 닮은 별이지.' },
  { zone: 'p_earth',   name: '넘버쓰리', num: 3,  mon: 'm48', hp: 62,  atk: 11, ball: 'silver',  blocks: 36,
    quip: '셋이면 무엇이든 무너지지 않는다. 다리가 셋인 의자처럼.',
    secret: '지구의 10분의 7은 바다다. 열 칸 중 일곱 칸이 파랗다는 뜻이지.' },
  { zone: 'p_mars',    name: '넘버포',   num: 4,  mon: 'm07', hp: 52,  atk: 10, ball: 'silver',  blocks: 38,
    quip: '넷은 네모다. 네모난 것은 흔들리지 않는다.',
    secret: '화성에는 태양계에서 가장 높은 산 올림푸스가 있다. 에베레스트의 두 배하고도 반이지.' },
  { zone: 'p_jupiter', name: '넘버파이브', num: 5, mon: 'm41', hp: 96, atk: 19, ball: 'gold',   blocks: 52,
    quip: '다섯은 한 손이다. 손가락처럼 세면 틀릴 일이 없지.',
    secret: '목성의 붉은 점은 지구보다 큰 폭풍이다. 수백 년째 돌고 있지.' },
  { zone: 'p_saturn',  name: '넘버식스', num: 6,  mon: 'm49', hp: 98,  atk: 18, ball: 'gold',   blocks: 56,
    quip: '여섯은 벌집의 숫자다. 빈틈없이 채우는 숫자지.',
    secret: '토성 북극에는 육각형 폭풍이 있다. 변이 여섯인 소용돌이다.' },
  { zone: 'p_uranus',  name: '넘버세븐', num: 7,  mon: 'm57', hp: 88,  atk: 15, ball: 'gold',   blocks: 58,
    quip: '일곱은 무지개다. 나누면 일곱, 합치면 하나.',
    secret: '천왕성은 옆으로 누워서 돈다. 그래서 여름과 겨울이 21년씩이다.' },
  { zone: 'p_neptune', name: '넘버에이트', num: 8, mon: 'm22', hp: 74, atk: 13, ball: 'gold',   blocks: 60,
    quip: '여덟은 눕히면 끝이 없다. 영원이라는 뜻이지.',
    secret: '해왕성은 태양에서 여덟 번째, 가장 먼 행성이다. 한 바퀴 도는 데 165년이 걸린다.' },
  { zone: 'p_pluto',   name: '넘버나인', num: 9,  mon: 'm55', hp: 118, atk: 20, ball: 'diamond', blocks: 72,
    quip: '아홉은 열의 바로 앞. 아무리 가도 열이 되지 못하는 숫자다.',
    secret: '명왕성은 아홉 번째 행성이었다가 왜소행성이 되었다. 아홉에서 밀려난 별이지.' },
  { zone: 'p_sun',     name: '넘버텐',   num: 10, mon: 'm25', hp: 104, atk: 19, ball: 'diamond', blocks: 90,
    quip: '열은 단장님의 숫자다. 0 옆에 1이 서면 열이 되니까.',
    secret: '태양 하나에 지구가 109개나 들어간다. 태양계 무게의 99.8%가 태양이다.' },
];
for (const c of CHIEFS) {
  GRUNTS[c.zone] = {
    name: c.name, chief: true, at: CHIEF_SPOT, mon: c.mon, hp: c.hp, atk: c.atk, ball: c.ball, blocks: c.blocks,
    greet: `나는 넘버로켓단 간부 ${c.name}. 이 별의 숫자 ${josa(String(c.num), '은는')} 내가 가졌다. ${c.quip}`,
    taunt: `가라! 붉은 ${josa(String(c.hp), '으로')} 저 아이를 눌러라!`,
    lose: `붉은 숫자가 깨졌군… 좋다. ${josa(String(c.num), '은는')} 이 별로 돌려주마.`,
    hold: `아직 ${josa(String(c.num), '을를')} 받아 갈 실력이 아니로군. 더 강해져서 오너라.`,
    after: [
      `숫자 ${josa(String(c.num), '은는')} 이 별로 돌아갔다. 열 개가 다 모이면 무슨 일이 일어나는지 나도 궁금하구나.`,
      c.secret,
      `아레나의 보스도 우리가 가짜 숫자를 씌운 것이다. 그 붉은 숫자를 0으로 깎아 주어라.`,
      '제로 단장은 아는 수가 0 하나뿐이다. 그래서 모두를 0으로 줄 세우려 했지. …나도 처음엔 그게 맞는 줄 알았다.',
    ],
  };
}

/** 넘버로켓단 대원·간부 한 명의 모습 (드래프트. 전용 .glb 는 없다) */
export function buildGruntMesh(g) {
  const mesh = makeNpc({ outfit: 'rocket', name: g.name });
  if (g.chief) { // 간부는 붉은 망토와 금빛 깃으로 대원과 구분한다
    const cape = new THREE.Mesh(new THREE.ConeGeometry(0.6, 1.15, 12, 1, true), new THREE.MeshStandardMaterial({ color: 0x6a1b1b, side: THREE.DoubleSide, roughness: 0.8 }));
    cape.position.set(0, 1.02, -0.14);
    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.33, 0.055, 8, 18), new THREE.MeshStandardMaterial({ color: 0xffd93d, emissive: 0xffb300, emissiveIntensity: 0.6 }));
    collar.rotation.x = Math.PI / 2; collar.position.y = 1.33;
    mesh.add(cape, collar);
  }
  return mesh;
}

/** 항복 표시: 손에 든 흰 깃발. 이긴 뒤에 대원 위로 꽂아 준다 */
export function addWhiteFlag(mesh) {
  if (mesh.userData.flag) return;
  const flag = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.5, 6), new THREE.MeshStandardMaterial({ color: 0x8a6a3a }));
  pole.position.y = 0.75;
  const cloth = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.36), new THREE.MeshStandardMaterial({ color: 0xffffff, side: THREE.DoubleSide, emissive: 0xffffff, emissiveIntensity: 0.25 }));
  cloth.position.set(0.3, 1.32, 0);
  flag.add(pole, cloth);
  flag.position.set(0.55, 0.55, 0.15);
  flag.rotation.z = -0.25;
  flag.userData.cloth = cloth;
  mesh.add(flag);
  mesh.userData.flag = flag;
  return flag;
}

/** 세뇌 표시: 발밑의 붉은 고리 (보스의 금빛 고리와 짝. "가짜 숫자를 뒤집어썼다"는 눈에 보이는 표시) */
export function addBrainwashRing(mesh, scale = 1) {
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.07, 8, 36), new THREE.MeshStandardMaterial({ color: 0xe8453c, emissive: 0xe8453c, emissiveIntensity: 1 }));
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.06;
  ring.scale.setScalar(1 / (scale || 1)); // 몬스터 크기에 눌리지 않게
  mesh.add(ring);
  return ring;
}
