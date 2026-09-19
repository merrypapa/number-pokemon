import * as THREE from 'three';
import { rand } from './util.js';
import { buildGround, makeInstanced } from './world.js';
import { buildUfoStation } from './ufo.js';
import { makeNpc } from './npc.js';

// 태양계 행성 지역 10곳 (각 180x180). 꿈의우주 UFO 정거장에서 손오공에게 말을 걸고 행성을 골라 UFO 로 간다.
// 행성마다 지형·하늘·장식이 다르고, 사는 포켓몬은 data/creatures.json 의 zones.p_*.wild 종 목록으로 채운다.
// 행성마다 UFO 정거장이 있어 꿈의우주로 돌아가거나 다른 행성으로 갈 수 있다.
export const PLANETS = [
  { id: 'sun', zone: 'p_sun', name: '태양', emoji: '☀️', tint: '#ffb020', title: '활활 타는 우리 별', gravity: 1.3, gravityText: '아주 세다',
    desc: '태양계 한가운데에서 스스로 빛나는 커다란 별이야. 지구가 109개나 한 줄로 늘어설 만큼 크고, 표면은 약 5,500도로 뜨거워. 우리에게 빛과 따뜻함을 보내 줘.',
    fact: '태양은 행성이 아니라 별이야! 태양계 전체 무게의 99.8%가 태양이래.',
    size: '지름 약 139만 km (지구의 109배)', dist: '지구에서 약 1억 5천만 km',
    pokeNote: '뜨거운 걸 좋아하는 불 포켓몬들이 불꽃 들판에서 신나게 뛰어놀아.',
    greet: '여긴 정말 뜨거워! 검은 흑점 웅덩이는 밟으면 안 돼.', arrive: '태양에 도착! 불꽃이 솟는 뜨거운 들판이야. 검은 흑점 웅덩이는 밟을 수 없어. 돌아갈 땐 UFO 정거장의 손오공에게!' },
  { id: 'mercury', zone: 'p_mercury', name: '수성', emoji: '🪨', tint: '#b5b0a8', title: '태양에 가장 가까운 작은 행성', gravity: 0.5, gravityText: '약하다 (높이 뛴다)',
    desc: '태양에 가장 가까운 가장 작은 행성이야. 공기가 거의 없어서 낮에는 430도까지 뜨겁고 밤에는 영하 180도로 꽁꽁 얼어. 온몸이 크레이터로 울퉁불퉁해.',
    fact: '수성의 하루(88일)는 수성의 1년(88일)과 길이가 거의 같아!',
    size: '지름 약 4,880 km (지구의 0.38배)', dist: '태양에서 약 5,800만 km',
    pokeNote: '단단한 바위와 땅을 좋아하는 포켓몬들이 크레이터 사이에서 산다.',
    greet: '동쪽은 뜨거운 낮, 서쪽은 차가운 밤이야. 중력이 약해서 높이 뛸 수 있어.', arrive: '수성에 도착! 크레이터가 가득한 회색 바위 행성이야. 중력이 약해서 높이 뛸 수 있어. 돌아갈 땐 UFO 정거장의 손오공에게!' },
  { id: 'venus', zone: 'p_venus', name: '금성', emoji: '🌕', tint: '#e8c77a', title: '구름에 덮인 지구의 쌍둥이', gravity: 0.95, gravityText: '지구와 비슷',
    desc: '지구와 크기가 비슷해서 쌍둥이 행성이라고 불러. 하지만 두껍고 노란 구름이 열을 가둬서 약 465도, 태양계에서 가장 뜨거운 행성이야. 다른 행성과 반대로 거꾸로 돌아!',
    fact: '금성에서는 하루가 1년보다 길어. 한 바퀴 도는 데 243일, 태양을 도는 데 225일!',
    size: '지름 약 12,100 km (지구의 0.95배)', dist: '태양에서 약 1억 800만 km',
    pokeNote: '독 안개와 뜨거운 산성 호수를 좋아하는 독·벌레·불 포켓몬이 산다.',
    greet: '노란 구름이 두꺼워서 멀리가 잘 안 보여. 초록 산성 호수는 조심!', arrive: '금성에 도착! 노란 구름과 산성 호수가 있는 뜨거운 행성이야. 초록 호수는 밟을 수 없어. 돌아갈 땐 UFO 정거장의 손오공에게!' },
  { id: 'earth', zone: 'p_earth', name: '지구', emoji: '🌍', tint: '#4fa3ff', title: '우리가 사는 파란 행성', gravity: 1, gravityText: '보통',
    desc: '우리가 사는 집이야! 물과 공기가 있어서 수많은 생명이 살 수 있는 유일한 행성이지. 표면의 70%가 바다라서 우주에서 보면 파랗게 보여. 달이 하나 있어.',
    fact: '지구는 시속 10만 km 로 태양 둘레를 달리고 있어. 그래도 우리는 느끼지 못해!',
    size: '지름 약 12,742 km', dist: '태양에서 약 1억 5천만 km',
    pokeNote: '풀·물·불·전기 등 온갖 포켓몬이 어울려 사는 풍요로운 곳이야.',
    greet: '초록 들판과 파란 호수, 우리 집에 온 것 같지? 무지개도 떠 있어!', arrive: '지구에 도착! 초록 들판과 파란 호수, 나무와 꽃이 가득한 우리 행성이야. 돌아갈 땐 UFO 정거장의 손오공에게!' },
  { id: 'mars', zone: 'p_mars', name: '화성', emoji: '🔴', tint: '#d9603b', title: '붉은 먼지의 행성', gravity: 0.5, gravityText: '약하다 (높이 뛴다)',
    desc: '붉은 흙과 먼지로 뒤덮여 붉은 행성이라고 불러. 태양계에서 가장 높은 산 올림푸스(약 22km)와 아주 긴 골짜기가 있어. 두 개의 작은 달이 돌고, 탐사 로봇들이 돌아다니고 있어.',
    fact: '화성의 북극과 남극에는 하얀 얼음 모자가 있어. 옛날엔 강과 바다가 있었대!',
    size: '지름 약 6,780 km (지구의 0.53배)', dist: '태양에서 약 2억 2,800만 km',
    pokeNote: '땅을 파고 사막을 달리는 땅·바위·불 포켓몬이 붉은 먼지 속에 산다.',
    greet: '붉은 사막에 먼지 소용돌이가 돌아다녀. 저 멀리 탐사 로봇도 보여!', arrive: '화성에 도착! 붉은 사막과 골짜기, 하얀 얼음 모자가 있는 행성이야. 중력이 약해서 높이 뛸 수 있어. 돌아갈 땐 UFO 정거장의 손오공에게!' },
  { id: 'jupiter', zone: 'p_jupiter', name: '목성', emoji: '🟠', tint: '#d8a56a', title: '태양계에서 가장 큰 행성', gravity: 1.6, gravityText: '아주 세다 (낮게 뛴다)',
    desc: '태양계에서 가장 큰 행성! 지구가 1,300개나 들어갈 만큼 커. 가스로 되어 있어 딱딱한 땅이 없고, 줄무늬 구름이 빠르게 돌아. 커다란 붉은 점은 지구보다 큰 폭풍이야.',
    fact: '목성의 위성은 95개가 넘어! 그중 가니메데는 수성보다 커.',
    size: '지름 약 139,800 km (지구의 11배)', dist: '태양에서 약 7억 7,800만 km',
    pokeNote: '번개가 치는 구름 위라 전기 포켓몬과 하늘을 나는 포켓몬이 좋아해.',
    greet: '구름 위를 걷고 있는 거야! 중력이 세서 점프가 낮아. 붉은 폭풍 근처는 조심.', arrive: '목성에 도착! 줄무늬 구름 위에 떠 있는 곳이야. 중력이 세서 점프가 낮고, 번개가 번쩍여. 돌아갈 땐 UFO 정거장의 손오공에게!' },
  { id: 'saturn', zone: 'p_saturn', name: '토성', emoji: '🪐', tint: '#e6cf8f', title: '아름다운 고리의 행성', gravity: 1.05, gravityText: '지구와 비슷',
    desc: '얼음과 돌 조각으로 된 크고 아름다운 고리를 가진 행성이야. 가스로 되어 있어 아주 가벼워서, 커다란 욕조가 있다면 물에 뜰 수 있대! 북극에는 육각형 폭풍이 있어.',
    fact: '토성의 고리는 폭이 28만 km 나 되지만 두께는 겨우 10m~1km 밖에 안 돼!',
    size: '지름 약 116,500 km (지구의 9배)', dist: '태양에서 약 14억 km',
    pokeNote: '얼음 조각이 반짝이는 곳이라 페어리·에스퍼·노말 포켓몬이 모여 산다.',
    greet: '하늘을 올려다봐, 커다란 고리가 지나가! 북쪽엔 육각형 폭풍이 있어.', arrive: '토성에 도착! 하늘에 거대한 고리가 걸려 있고 얼음 조각이 반짝이는 곳이야. 돌아갈 땐 UFO 정거장의 손오공에게!' },
  { id: 'uranus', zone: 'p_uranus', name: '천왕성', emoji: '🩵', tint: '#8fd8e8', title: '옆으로 누워 도는 얼음 행성', gravity: 0.9, gravityText: '지구보다 조금 약함',
    desc: '청록색 얼음 행성이야. 공기 속 메탄이 빨간빛을 먹어서 청록색으로 보여. 다른 행성과 달리 옆으로 누워서 돌기 때문에 여름과 겨울이 각각 21년씩 계속돼!',
    fact: '천왕성 속에는 다이아몬드 비가 내릴지도 모른대!',
    size: '지름 약 50,700 km (지구의 4배)', dist: '태양에서 약 29억 km',
    pokeNote: '차가운 얼음 호수를 좋아하는 물·에스퍼 포켓몬이 산다.',
    greet: '하늘의 고리가 세로로 서 있지? 이 행성은 옆으로 누워서 돌거든. 얼음 호수는 미끄러워서 못 들어가.', arrive: '천왕성에 도착! 청록색 얼음과 다이아몬드 수정, 세로로 선 고리가 있는 행성이야. 돌아갈 땐 UFO 정거장의 손오공에게!' },
  { id: 'neptune', zone: 'p_neptune', name: '해왕성', emoji: '🔵', tint: '#3f5fd8', title: '가장 멀고 바람이 센 푸른 행성', gravity: 1.15, gravityText: '지구보다 조금 셈',
    desc: '태양에서 가장 먼 여덟 번째 행성이야. 짙은 파란색이고, 시속 2,000km 가 넘는 태양계에서 가장 센 바람이 불어. 태양을 한 바퀴 도는 데 165년이나 걸려!',
    fact: '해왕성은 망원경으로 보기 전에 수학 계산으로 먼저 찾아낸 행성이야!',
    size: '지름 약 49,200 km (지구의 3.9배)', dist: '태양에서 약 45억 km',
    pokeNote: '거센 바람과 파란 물을 좋아하는 물 포켓몬들이 산다.',
    greet: '바람이 엄청 세지? 구름이 휙휙 날아가. 파란 웅덩이는 깊어서 못 들어가.', arrive: '해왕성에 도착! 거센 바람에 구름이 날아가는 짙푸른 행성이야. 돌아갈 땐 UFO 정거장의 손오공에게!' },
  { id: 'pluto', zone: 'p_pluto', name: '명왕성', emoji: '🤍', tint: '#c9b8a8', title: '하트를 가진 작은 얼음 세상', gravity: 0.3, gravityText: '아주 약하다 (둥둥 뜬다)',
    desc: '태양계 바깥쪽의 작은 얼음 왜소행성이야. 달보다도 작아. 표면에 커다란 하트 모양의 하얀 얼음 평원이 있어! 태양빛이 여기까지 오는 데 5시간 반이 걸려.',
    fact: '명왕성은 2006년까지 아홉 번째 행성이었어. 짝꿍 위성 카론과 서로 마주 보며 돌아.',
    size: '지름 약 2,380 km (지구의 0.19배)', dist: '태양에서 약 59억 km',
    pokeNote: '어둡고 조용한 얼음 세상이라 고스트·에스퍼·페어리 포켓몬이 산다.',
    greet: '하트 모양 평원이 보여? 카론이 하늘에 크게 떠 있어. 중력이 약해서 둥둥 뜬 것처럼 걸어.', arrive: '명왕성에 도착! 하트 모양 얼음 평원과 커다란 카론이 떠 있는 어둡고 작은 세상이야. 중력이 아주 약해. 돌아갈 땐 UFO 정거장의 손오공에게!' },
];
export const PLANET_BY_ZONE = Object.fromEntries(PLANETS.map((p) => [p.zone, p]));

// ---------- 팝업에 나오는 행성 그림 (SVG) ----------
const STARS = Array.from({ length: 40 }, (_, i) => `<circle cx="${(i * 37) % 160}" cy="${(i * 53 + 11) % 160}" r="${0.6 + (i % 3) * 0.4}" fill="#fff" opacity="${0.4 + (i % 4) * 0.15}"/>`).join('');
const SHADE = '<circle cx="80" cy="80" r="46" fill="url(#shade)"/>';
function planetBody(p) {
  switch (p.id) {
    case 'sun': return `<circle cx="80" cy="80" r="60" fill="#ff9a1f" opacity=".25"/><circle cx="80" cy="80" r="52" fill="#ffb020" opacity=".45"/>
      ${Array.from({ length: 12 }, (_, i) => { const a = (i / 12) * Math.PI * 2; return `<path d="M${80 + Math.cos(a) * 44},${80 + Math.sin(a) * 44} L${80 + Math.cos(a + 0.12) * 66},${80 + Math.sin(a + 0.12) * 66} L${80 + Math.cos(a + 0.24) * 44},${80 + Math.sin(a + 0.24) * 44}Z" fill="#ffd23f" opacity=".85"/>`; }).join('')}
      <circle cx="80" cy="80" r="46" fill="url(#gSun)"/><circle cx="64" cy="70" r="5" fill="#c94a10" opacity=".7"/><circle cx="96" cy="92" r="3.5" fill="#c94a10" opacity=".7"/><circle cx="88" cy="62" r="2.5" fill="#c94a10" opacity=".6"/>`;
    case 'mercury': return `<circle cx="80" cy="80" r="46" fill="url(#gMerc)"/>${[[60, 68, 7], [92, 60, 5], [100, 92, 8], [70, 100, 5], [82, 82, 3.5], [56, 90, 4]].map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#6f6f78"/><circle cx="${x - r * 0.25}" cy="${y - r * 0.25}" r="${r * 0.6}" fill="#8a8a90"/>`).join('')}${SHADE}`;
    case 'venus': return `<circle cx="80" cy="80" r="46" fill="url(#gVenus)"/><g opacity=".55" fill="none" stroke="#fff3c4" stroke-width="5" stroke-linecap="round"><path d="M44 66 q30 -14 62 0"/><path d="M40 84 q40 12 82 -4"/><path d="M50 104 q28 8 58 -6"/></g>${SHADE}`;
    case 'earth': return `<circle cx="80" cy="80" r="46" fill="url(#gEarth)"/><g fill="#3fa34d"><path d="M56 56 q12 -10 24 -2 q8 8 -2 16 q-10 8 -20 2 q-8 -8 -2 -16z"/><path d="M84 78 q14 -6 22 6 q6 12 -6 20 q-14 4 -20 -6 q-4 -12 4 -20z"/><path d="M52 92 q10 -4 14 6 q0 10 -10 10 q-10 -4 -4 -16z"/></g><g fill="#fff" opacity=".85"><ellipse cx="70" cy="70" rx="12" ry="4"/><ellipse cx="96" cy="60" rx="10" ry="3.5"/><ellipse cx="66" cy="106" rx="14" ry="4"/></g>${SHADE}`;
    case 'mars': return `<circle cx="80" cy="80" r="46" fill="url(#gMars)"/><path d="M60 100 q20 10 40 0 q-4 -14 -20 -12 q-16 0 -20 12z" fill="#a8452a" opacity=".7"/><ellipse cx="70" cy="66" rx="12" ry="6" fill="#a8452a" opacity=".6"/><ellipse cx="80" cy="38" rx="16" ry="5" fill="#fff" opacity=".9"/><ellipse cx="80" cy="122" rx="12" ry="4" fill="#fff" opacity=".8"/>${SHADE}`;
    case 'jupiter': return `<clipPath id="cJ"><circle cx="80" cy="80" r="46"/></clipPath><g clip-path="url(#cJ)"><rect x="30" y="30" width="100" height="100" fill="#e8c9a0"/>${[[38, 8, '#b8834a'], [52, 6, '#d8a56a'], [64, 10, '#8a5a3a'], [80, 8, '#f0d9b0'], [94, 10, '#b8834a'], [110, 8, '#d8a56a'], [122, 8, '#8a5a3a']].map(([y, h, c]) => `<rect x="30" y="${y}" width="100" height="${h}" fill="${c}"/>`).join('')}<ellipse cx="100" cy="94" rx="12" ry="7" fill="#c0442a"/><ellipse cx="100" cy="94" rx="7" ry="4" fill="#e06a4a"/></g>${SHADE}`;
    case 'saturn': return `<ellipse cx="80" cy="80" rx="72" ry="18" fill="none" stroke="#e8d9a0" stroke-width="7" transform="rotate(-18 80 80)" opacity=".9"/><ellipse cx="80" cy="80" rx="60" ry="14" fill="none" stroke="#c9b06a" stroke-width="3" transform="rotate(-18 80 80)"/><circle cx="80" cy="80" r="40" fill="url(#gSat)"/><g opacity=".5" fill="none" stroke="#c9b06a" stroke-width="4"><path d="M46 70 q34 -10 68 0"/><path d="M44 88 q36 8 72 0"/></g><path d="M8 80 A72 18 0 0 0 152 80" fill="none" stroke="#f1e3b8" stroke-width="7" transform="rotate(-18 80 80)"/>${SHADE}`;
    case 'uranus': return `<circle cx="80" cy="80" r="42" fill="url(#gUra)"/><ellipse cx="80" cy="80" rx="14" ry="66" fill="none" stroke="#dff6ff" stroke-width="3" opacity=".8" transform="rotate(8 80 80)"/>${SHADE}`;
    case 'neptune': return `<circle cx="80" cy="80" r="46" fill="url(#gNep)"/><ellipse cx="66" cy="70" rx="12" ry="6" fill="#1a2a70" opacity=".8"/><g fill="#fff" opacity=".8"><ellipse cx="92" cy="94" rx="14" ry="2.5"/><ellipse cx="74" cy="104" rx="10" ry="2"/><ellipse cx="96" cy="60" rx="8" ry="2"/></g>${SHADE}`;
    case 'pluto': return `<circle cx="80" cy="80" r="40" fill="url(#gPlu)"/><path d="M80 112 C62 100 54 90 58 80 C62 72 72 72 80 82 C88 72 98 72 102 80 C106 90 98 100 80 112z" fill="#f4f0f0" opacity=".95"/><circle cx="60" cy="62" r="6" fill="#7a5a50" opacity=".7"/><circle cx="130" cy="34" r="12" fill="#9a9aa6"/><circle cx="126" cy="30" r="3" fill="#7a7a86"/>${SHADE}`;
  }
  return `<circle cx="80" cy="80" r="46" fill="${p.tint}"/>`;
}
/** 팝업용 행성 그림 (160x160 SVG 문자열) */
export function planetSvg(p) {
  return `<svg viewBox="0 0 160 160" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${p.name}">
    <defs>
      <radialGradient id="shade" cx="35%" cy="35%" r="75%"><stop offset="55%" stop-color="#000" stop-opacity="0"/><stop offset="100%" stop-color="#000" stop-opacity=".45"/></radialGradient>
      <radialGradient id="gSun" cx="45%" cy="45%"><stop offset="0" stop-color="#fff4b0"/><stop offset=".6" stop-color="#ffd23f"/><stop offset="1" stop-color="#ff8a1f"/></radialGradient>
      <radialGradient id="gMerc" cx="40%" cy="38%"><stop offset="0" stop-color="#c9c6c0"/><stop offset="1" stop-color="#7a7a82"/></radialGradient>
      <radialGradient id="gVenus" cx="40%" cy="38%"><stop offset="0" stop-color="#fff0c0"/><stop offset="1" stop-color="#d9a84a"/></radialGradient>
      <radialGradient id="gEarth" cx="40%" cy="38%"><stop offset="0" stop-color="#7fc4ff"/><stop offset="1" stop-color="#1f5fb8"/></radialGradient>
      <radialGradient id="gMars" cx="40%" cy="38%"><stop offset="0" stop-color="#f08a5a"/><stop offset="1" stop-color="#b3442a"/></radialGradient>
      <radialGradient id="gSat" cx="40%" cy="38%"><stop offset="0" stop-color="#fff0c8"/><stop offset="1" stop-color="#d4b877"/></radialGradient>
      <radialGradient id="gUra" cx="40%" cy="38%"><stop offset="0" stop-color="#d0f6ff"/><stop offset="1" stop-color="#5ab8cc"/></radialGradient>
      <radialGradient id="gNep" cx="40%" cy="38%"><stop offset="0" stop-color="#6a86ff"/><stop offset="1" stop-color="#22318f"/></radialGradient>
      <radialGradient id="gPlu" cx="40%" cy="38%"><stop offset="0" stop-color="#d8c8b8"/><stop offset="1" stop-color="#8a6a5a"/></radialGradient>
    </defs>
    <rect width="160" height="160" fill="#050515"/>${STARS}${planetBody(p)}</svg>`;
}

// ---------- 행성 지역 만들기 ----------
const S = 180; // 행성 지역 한 변
const SPAWN = { x: 0, z: 62 }, STATION = { x: 13, z: 54 }, ARENA = { x: 0, z: -52, r: 8 }; // 아레나: 북쪽, 보스가 지킨다
// 야생·블록 자리 틀 (막힌 곳이면 근처 빈 자리로 옮긴다)
const WILD_TEMPLATE = [[-32, 30], [32, 34], [-52, -8], [52, -14], [-20, -46], [26, -50], [-66, 44], [66, 48], [0, -72], [-70, -56], [70, -60], [-4, 8]];
const PICKUP_TEMPLATE = [[-14, 44], [16, 40], [-40, 10], [42, 12], [-24, -24], [28, -26], [0, -40], [-60, 70], [62, 74], [-76, -20], [78, -22], [0, 78]];
/** 가우스 언덕들의 높이 합 */
const bumpsHeight = (bumps, x, z) => { let y = 0; for (const b of bumps) { const dx = x - b.x, dz = z - b.z; y += b.h * Math.exp(-(dx * dx + dz * dz) / (b.r * b.r)); } return y; };
/** 웅덩이(못 들어가는 곳) 근처는 조금 파인다 */
const poolsDip = (pools, x, z, depth = 0.7) => { let y = 0; for (const p of pools) { const d = Math.hypot(x - p.x, z - p.z); if (d < p.r + 1.5) y -= depth * Math.min(1, (p.r + 1.5 - d) / 2); } return y; };
const inPools = (pools, x, z, pad = 0.4) => pools.some((p) => Math.hypot(x - p.x, z - p.z) < p.r + pad);
/** 빈 자리 찾기: 막혔거나 장애물이면 둘레를 돌며 옮긴다 */
function freeSpot(x, z, ok) {
  if (ok(x, z)) return [x, z];
  for (let r = 4; r <= 24; r += 4) for (let a = 0; a < Math.PI * 2; a += Math.PI / 4) { const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r; if (Math.abs(px) < S / 2 - 6 && Math.abs(pz) < S / 2 - 6 && ok(px, pz)) return [px, pz]; }
  return [x, z];
}
/** 하늘의 별 */
function addStars(scene, n = 1800, size = 1.6) {
  const pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { const a = rand(0, Math.PI * 2), u = rand(0.02, 1), r = 340; pos[i * 3] = Math.cos(a) * Math.sqrt(1 - u * u) * r; pos[i * 3 + 1] = u * r; pos[i * 3 + 2] = Math.sin(a) * Math.sqrt(1 - u * u) * r; }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  scene.add(new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xffffff, size, sizeAttenuation: true, fog: false })));
}
/** 하늘의 큰 천체 (태양·카론·달 등) */
function addSkyBody(scene, { az, el, r, color, glow = null, R = 300 }) {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.SphereGeometry(r, 28, 20), new THREE.MeshBasicMaterial({ color, fog: false })));
  if (glow) g.add(new THREE.Mesh(new THREE.SphereGeometry(r * 1.5, 24, 18), new THREE.MeshBasicMaterial({ color: glow, transparent: true, opacity: 0.25, fog: false, depthWrite: false })));
  g.position.set(Math.sin(az) * Math.cos(el) * R, Math.sin(el) * R, -Math.cos(az) * Math.cos(el) * R);
  scene.add(g);
  return g;
}
/** 둥근 구름 스프라이트 텍스처 */
function puffTexture(rgb) {
  const cv = document.createElement('canvas'); cv.width = cv.height = 64;
  const ctx = cv.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 4, 32, 32, 30);
  g.addColorStop(0, `rgba(${rgb},0.8)`); g.addColorStop(1, `rgba(${rgb},0)`);
  ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; return tex;
}
const near = (x, z, pt, r) => Math.hypot(x - pt.x, z - pt.z) < r;
const keepClear = (x, z) => near(x, z, SPAWN, 9) || near(x, z, STATION, 9) || near(x, z, ARENA, ARENA.r + 4); // 시작 자리·정거장·아레나 둘레는 비워 둔다

// 행성별 테마: 하늘·안개·빛·바닥색·지형·못 가는 곳·장식
const THEMES = {
  sun: {
    sky: 0xff9a2a, fog: [0xffb060, 45, 150], hemi: [0xfff1b5, 0xff6a00, 1.6], sun: [0xfff4c0, 1.2], dark: false,
    bumps: [{ x: -40, z: -30, r: 16, h: 2.4 }, { x: 45, z: 20, r: 14, h: 2.0 }, { x: 10, z: -60, r: 18, h: 3.0 }, { x: -60, z: 50, r: 13, h: 1.8 }, { x: 60, z: -60, r: 15, h: 2.6 }],
    pools: [{ x: -30, z: 10, r: 7 }, { x: 36, z: -30, r: 8 }, { x: -58, z: -58, r: 6 }, { x: 62, z: 60, r: 6 }, { x: 0, z: -22, r: 5 }, { x: -70, z: 10, r: 5 }, { x: 24, z: 30, r: 4.5 }],
    colors: { a: 0xffc93a, b: 0xff9a1f, pool: 0x7a2a10, rim: 0xffe08a },
    decorate({ scene, decor, block, height, pools, anim }) {
      // 검은 흑점 웅덩이: 어두운 플라즈마 호수
      const lavaMat = new THREE.MeshStandardMaterial({ color: 0x8a2a10, emissive: 0xff3300, emissiveIntensity: 0.6, roughness: 0.6 });
      for (const p of pools) { const m = new THREE.Mesh(new THREE.CircleGeometry(p.r, 28), lavaMat); m.rotation.x = -Math.PI / 2; m.position.set(p.x, height(p.x, p.z) + 0.25, p.z); scene.add(m); }
      // 불꽃 기둥(플레어): 위아래로 출렁이는 주황 원뿔
      const flares = [];
      for (let i = 0; i < 26; i++) {
        const x = rand(-S / 2 + 8, S / 2 - 8), z = rand(-S / 2 + 8, S / 2 - 8);
        if (keepClear(x, z) || inPools(pools, x, z, 2)) continue;
        const h = rand(2.5, 6);
        const f = new THREE.Mesh(new THREE.ConeGeometry(rand(0.6, 1.2), h, 8), new THREE.MeshStandardMaterial({ color: 0xffb347, emissive: 0xff6a00, emissiveIntensity: 1.4, transparent: true, opacity: 0.85 }));
        f.position.set(x, height(x, z) + h / 2, z); f.userData = { h, phase: rand(0, 6) };
        decor.add(f); flares.push(f); block(x, z, 0.9);
      }
      // 홍염: 반쯤 땅에 묻힌 커다란 고리 아치
      for (const [x, z, rot] of [[-20, -70, 0.4], [55, -10, 1.2], [-70, 30, 2.1]]) {
        const arc = new THREE.Mesh(new THREE.TorusGeometry(7, 0.5, 8, 40, Math.PI), new THREE.MeshStandardMaterial({ color: 0xff8a1f, emissive: 0xff4400, emissiveIntensity: 1.2 }));
        arc.position.set(x, height(x, z) + 0.2, z); arc.rotation.y = rot; arc.userData.noHide = true;
        decor.add(arc);
        for (const s of [-1, 1]) block(x + Math.cos(rot) * 7 * s, z - Math.sin(rot) * 7 * s, 1.2);
      }
      // 솟아오르는 불티
      const sparks = [];
      for (let i = 0; i < 40; i++) { const sp = new THREE.Mesh(new THREE.SphereGeometry(0.14, 6, 5), new THREE.MeshBasicMaterial({ color: 0xffe08a })); sp.userData = { x: rand(-80, 80), z: rand(-80, 80), phase: rand(0, 10), speed: rand(1.2, 2.4) }; scene.add(sp); sparks.push(sp); }
      anim.push((t) => {
        for (const f of flares) { const u = f.userData; const s = 1 + Math.sin(t * 3 + u.phase) * 0.25; f.scale.set(1, s, 1); f.position.y = height(f.position.x, f.position.z) + (u.h * s) / 2; }
        for (const s of sparks) { const u = s.userData; const life = ((t * u.speed + u.phase) % 4) / 4; s.position.set(u.x, height(u.x, u.z) + life * 14, u.z + life * 3); s.visible = life < 0.9; }
      });
    },
  },
  mercury: {
    sky: 0x050308, fog: [0x0a0810, 70, 190], hemi: [0xd8d8e8, 0x2a2a30, 1.0], sun: [0xfff6d0, 1.9], dark: false, stars: true,
    bumps: [{ x: -45, z: -35, r: 16, h: 3.2 }, { x: 50, z: 30, r: 14, h: 2.6 }, { x: 15, z: -65, r: 16, h: 3.6 }, { x: -65, z: 45, r: 13, h: 2.2 }, { x: 70, z: -60, r: 15, h: 3.0 }, { x: -20, z: 20, r: 10, h: 1.4 }],
    craters: [{ x: -30, z: -5, r: 12, d: 2.4 }, { x: 40, z: -30, r: 10, d: 2.0 }, { x: -60, z: -65, r: 13, d: 2.6 }, { x: 60, z: 62, r: 9, d: 1.6 }, { x: 0, z: -35, r: 8, d: 1.5 }, { x: -72, z: 5, r: 9, d: 1.8 }, { x: 30, z: 20, r: 6, d: 1.2 }, { x: 72, z: -5, r: 10, d: 1.9 }],
    pools: [],
    colors: { a: 0x8a8a90, b: 0x6f6f78, hot: 0xa08a70, cold: 0x6a7080 },
    colorFn(x, z, y, C) { return Math.random() < 0.35 ? new THREE.Color(x > 0 ? C.hot : C.cold) : null; }, // 동쪽(낮)은 따뜻한 색, 서쪽(밤)은 찬 색이 섞인다
    decorate({ scene, decor, block, height, anim }) {
      addSkyBody(scene, { az: 0.5, el: 0.55, r: 34, color: 0xfff6d0, glow: 0xffd070 }); // 아주 가까운 커다란 태양
      const rocks = [];
      for (let i = 0; i < 110; i++) { const x = rand(-S / 2 + 4, S / 2 - 4), z = rand(-S / 2 + 4, S / 2 - 4); if (keepClear(x, z)) continue; const r = rand(0.4, 1.8); rocks.push({ x, y: height(x, z) + 0.2, z, s: r, rx: rand(0, 3), ry: rand(0, 3) }); block(x, z, r * 0.9); }
      decor.add(makeInstanced(new THREE.DodecahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ color: 0x8a8a94, roughness: 1 }), rocks, { shadow: true }));
      const spires = [];
      for (let i = 0; i < 30; i++) { const x = rand(-S / 2 + 6, S / 2 - 6), z = rand(-S / 2 + 6, S / 2 - 6); if (keepClear(x, z)) continue; const h = rand(2, 6), r = rand(0.6, 1.4); spires.push({ x, y: height(x, z) + h / 2 - 0.2, z, sx: r, sy: h, sz: r, ry: rand(0, 3) }); block(x, z, r * 0.8); }
      decor.add(makeInstanced(new THREE.ConeGeometry(1, 1, 5), new THREE.MeshStandardMaterial({ color: 0x5a5a64, roughness: 1 }), spires, { shadow: true }));
      // 그늘진 크레이터 바닥의 얼음 (서쪽 밤 쪽)
      for (const c of THEMES.mercury.craters) if (c.x < 0) { const ice = new THREE.Mesh(new THREE.CircleGeometry(c.r * 0.45, 20), new THREE.MeshStandardMaterial({ color: 0xdff6ff, emissive: 0x88c0d0, emissiveIntensity: 0.3, roughness: 0.2 })); ice.rotation.x = -Math.PI / 2; ice.position.set(c.x, height(c.x, c.z) + 0.08, c.z); scene.add(ice); }
      const heat = []; // 낮 쪽 땅에서 아지랑이처럼 올라오는 빛 점
      for (let i = 0; i < 30; i++) { const m = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 5), new THREE.MeshBasicMaterial({ color: 0xffe0a0, transparent: true, opacity: 0.7 })); m.userData = { x: rand(10, 85), z: rand(-85, 85), phase: rand(0, 10) }; scene.add(m); heat.push(m); }
      anim.push((t) => { for (const m of heat) { const u = m.userData; const life = ((t * 0.7 + u.phase) % 3) / 3; m.position.set(u.x, height(u.x, u.z) + 0.3 + life * 4, u.z); m.material.opacity = 0.7 * (1 - life); } });
    },
  },
  venus: {
    sky: 0xe0b060, fog: [0xe8c070, 28, 105], hemi: [0xfff0c0, 0x8a5a20, 1.2], sun: [0xffe8b0, 0.7], dark: false,
    bumps: [{ x: -40, z: -30, r: 14, h: 2.2 }, { x: 46, z: 26, r: 14, h: 2.0 }, { x: 0, z: -66, r: 14, h: 5 }, { x: -64, z: 46, r: 12, h: 1.8 }, { x: 64, z: -58, r: 14, h: 4.4 }, { x: -70, z: -60, r: 12, h: 3.6 }],
    pools: [{ x: -28, z: 14, r: 7 }, { x: 34, z: -26, r: 8 }, { x: -56, z: -20, r: 6 }, { x: 58, z: 58, r: 5.5 }, { x: 6, z: -30, r: 5 }, { x: -20, z: -70, r: 6 }, { x: 74, z: 4, r: 5 }],
    colors: { a: 0xb8862e, b: 0x9c6f22, rock: 0x5a3a22, pool: 0x8a9a20, rim: 0xd8c060 },
    decorate({ scene, decor, block, height, pools, anim }) {
      const acid = new THREE.MeshStandardMaterial({ color: 0xc9e04a, emissive: 0x8ab020, emissiveIntensity: 0.7, roughness: 0.3, transparent: true, opacity: 0.9 });
      for (const p of pools) { const m = new THREE.Mesh(new THREE.CircleGeometry(p.r, 28), acid); m.rotation.x = -Math.PI / 2; m.position.set(p.x, height(p.x, p.z) + 0.2, p.z); scene.add(m); }
      // 방패 화산 셋(큰 원뿔 + 분화구)과 유황 수정
      for (const [x, z, r, h] of [[0, -66, 14, 5], [64, -58, 14, 4.4], [-70, -60, 12, 3.6]]) { const top = new THREE.Mesh(new THREE.CircleGeometry(r * 0.35, 20), acid); top.rotation.x = -Math.PI / 2; top.position.set(x, height(x, z) + 0.15, z); scene.add(top); }
      const crystals = [];
      for (let i = 0; i < 90; i++) { const x = rand(-S / 2 + 5, S / 2 - 5), z = rand(-S / 2 + 5, S / 2 - 5); if (keepClear(x, z) || inPools(pools, x, z, 2)) continue; const h = rand(0.8, 2.6); crystals.push({ x, y: height(x, z) + h * 0.5, z, sx: 0.45, sy: h * 0.8, sz: 0.45, ry: rand(0, 3), rx: rand(-0.2, 0.2) }); block(x, z, 0.6); }
      decor.add(makeInstanced(new THREE.OctahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ color: 0xf0d040, emissive: 0xa08020, emissiveIntensity: 0.4, roughness: 0.4 }), crystals));
      const rocks = [];
      for (let i = 0; i < 70; i++) { const x = rand(-S / 2 + 4, S / 2 - 4), z = rand(-S / 2 + 4, S / 2 - 4); if (keepClear(x, z) || inPools(pools, x, z, 2)) continue; const r = rand(0.5, 1.6); rocks.push({ x, y: height(x, z) + 0.2, z, s: r, rx: rand(0, 3), ry: rand(0, 3) }); block(x, z, r * 0.9); }
      decor.add(makeInstanced(new THREE.DodecahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ color: 0x5a3a22, roughness: 1 }), rocks, { shadow: true }));
      // 노란 구름이 머리 위로 흘러가고, 가끔 번개가 친다
      const tex = puffTexture('240,210,140');
      const clouds = [];
      for (let i = 0; i < 40; i++) { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0.7 })); sp.scale.setScalar(rand(14, 26)); sp.userData = { x: rand(-120, 120), z: rand(-120, 120), y: rand(18, 30), speed: rand(2, 5) }; scene.add(sp); clouds.push(sp); }
      const bolt = new THREE.PointLight(0xffffff, 0, 90); bolt.position.set(0, 25, 0); scene.add(bolt);
      anim.push((t) => {
        for (const c of clouds) { const u = c.userData; c.position.set(((u.x + t * u.speed + 120) % 240) - 120, u.y, u.z); }
        const f = Math.sin(t * 7.3) * Math.sin(t * 1.7); bolt.intensity = f > 0.985 ? 12 : 0; if (f > 0.985) bolt.position.set(rand(-60, 60), 25, rand(-60, 60));
      });
    },
  },
  earth: {
    sky: 0x8fd3ff, fog: [0xbfe6ff, 90, 220], hemi: [0xdff4ff, 0x4f7f3f, 1.0], sun: [0xfff4e0, 1.2], dark: false,
    bumps: [{ x: -40, z: -35, r: 15, h: 2.6 }, { x: 44, z: 24, r: 13, h: 2.0 }, { x: 10, z: -66, r: 16, h: 6 }, { x: -64, z: 44, r: 13, h: 1.8 }, { x: 66, z: -60, r: 15, h: 5 }, { x: -72, z: -62, r: 14, h: 5.5 }],
    pools: [{ x: -30, z: 6, r: 11 }, { x: 50, z: -20, r: 8 }],
    colors: { a: 0x6fc95a, b: 0x5fb64c, pool: 0x3f9fe8, rim: 0xe8d9a0, snow: 0xf4f8ff },
    colorFn(x, z, y, C) { if (y > 4.2) return new THREE.Color(C.snow); return null; },
    decorate({ scene, decor, block, height, pools, anim }) {
      for (const p of pools) { const w = new THREE.Mesh(new THREE.CircleGeometry(p.r + 0.5, 32), new THREE.MeshStandardMaterial({ color: 0x3f9fe8, roughness: 0.15, transparent: true, opacity: 0.9 })); w.rotation.x = -Math.PI / 2; w.position.set(p.x, height(p.x, p.z) + 0.35, p.z); scene.add(w); }
      // 나무 (줄기 + 초록 원뿔), 꽃, 덤불
      const trunks = [], crowns = [];
      for (let i = 0; i < 110; i++) { const x = rand(-S / 2 + 5, S / 2 - 5), z = rand(-S / 2 + 5, S / 2 - 5); if (keepClear(x, z) || inPools(pools, x, z, 3) || height(x, z) > 4) continue; const h = rand(1.2, 2.2), y = height(x, z); trunks.push({ x, y: y + h / 2, z, sy: h }); crowns.push({ x, y: y + h + 1.4, z, s: rand(1.6, 2.4), color: Math.random() < 0.5 ? 0x2e9e4f : 0x3fb85a }); block(x, z, 0.5); }
      decor.add(makeInstanced(new THREE.CylinderGeometry(0.18, 0.26, 1, 7), new THREE.MeshStandardMaterial({ color: 0x8b5a2b }), trunks));
      decor.add(makeInstanced(new THREE.ConeGeometry(1, 2.2, 8), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 }), crowns, { shadow: true }));
      const flowers = [];
      const fc = [0xff6b9d, 0xffd93d, 0xffffff, 0xff9a3c, 0xc38bff];
      for (let i = 0; i < 260; i++) { const x = rand(-S / 2 + 3, S / 2 - 3), z = rand(-S / 2 + 3, S / 2 - 3); if (inPools(pools, x, z, 2) || height(x, z) > 4) continue; flowers.push({ x, y: height(x, z) + 0.25, z, s: 0.22, color: fc[i % fc.length] }); }
      decor.add(makeInstanced(new THREE.SphereGeometry(1, 6, 5), new THREE.MeshStandardMaterial({ color: 0xffffff }), flowers));
      // 무지개 (반원 고리 일곱 겹)
      const rainbow = new THREE.Group();
      [0xe8453c, 0xff9a3c, 0xffd93d, 0x6cff8a, 0x66e0ff, 0x5a7bd6, 0xc38bff].forEach((c, i) => { const r = new THREE.Mesh(new THREE.TorusGeometry(30 - i * 1.4, 0.7, 6, 48, Math.PI), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.55, fog: false })); rainbow.add(r); });
      rainbow.position.set(-30, 0, -60); rainbow.rotation.y = 0.5; scene.add(rainbow);
      // 하늘의 구름과 달
      const tex = puffTexture('255,255,255');
      const clouds = [];
      for (let i = 0; i < 30; i++) { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false })); sp.scale.setScalar(rand(16, 30)); sp.userData = { x: rand(-140, 140), z: rand(-140, 140), y: rand(28, 40), speed: rand(0.6, 1.4) }; scene.add(sp); clouds.push(sp); }
      addSkyBody(scene, { az: -0.9, el: 0.6, r: 10, color: 0xf4f4f8 });
      anim.push((t) => { for (const c of clouds) { const u = c.userData; c.position.set(((u.x + t * u.speed + 140) % 280) - 140, u.y, u.z); } });
    },
  },
  mars: {
    sky: 0xe0a070, fog: [0xe8b088, 60, 190], hemi: [0xffd0b0, 0x7a3a20, 1.1], sun: [0xffe0c0, 1.1], dark: false,
    bumps: [{ x: -42, z: -30, r: 16, h: 3.0 }, { x: 46, z: 26, r: 14, h: 2.4 }, { x: 8, z: -60, r: 22, h: 9 }, { x: -64, z: 44, r: 13, h: 2.0 }, { x: 66, z: -60, r: 14, h: 3.4 }, { x: -70, z: -60, r: 14, h: 3.0 }, { x: 30, z: 60, r: 12, h: 1.6 }],
    canyon: { x1: -80, z1: 20, x2: 70, z2: -10, w: 5, d: 2.6 },
    pools: [],
    colors: { a: 0xc1512f, b: 0xa8452a, canyon: 0x7a3020, ice: 0xf0eef0 },
    colorFn(x, z, y, C) { if (Math.abs(z) > 72) return new THREE.Color(C.ice); return null; },
    decorate({ scene, decor, block, height, anim }) {
      const rocks = [];
      for (let i = 0; i < 90; i++) { const x = rand(-S / 2 + 4, S / 2 - 4), z = rand(-S / 2 + 4, S / 2 - 4); if (keepClear(x, z)) continue; const r = rand(0.4, 1.7); rocks.push({ x, y: height(x, z) + 0.2, z, s: r, rx: rand(0, 3), ry: rand(0, 3) }); block(x, z, r * 0.9); }
      decor.add(makeInstanced(new THREE.DodecahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ color: 0x8a3a24, roughness: 1 }), rocks, { shadow: true }));
      const mesas = [];
      for (let i = 0; i < 18; i++) { const x = rand(-S / 2 + 8, S / 2 - 8), z = rand(-S / 2 + 8, S / 2 - 8); if (keepClear(x, z) || Math.abs(z) > 68) continue; const h = rand(2, 5), r = rand(1.4, 2.6); mesas.push({ x, y: height(x, z) + h / 2 - 0.3, z, sx: r, sy: h, sz: r, ry: rand(0, 3) }); block(x, z, r * 0.9); }
      decor.add(makeInstanced(new THREE.CylinderGeometry(0.8, 1, 1, 6), new THREE.MeshStandardMaterial({ color: 0x9a4028, roughness: 1 }), mesas, { shadow: true }));
      // 탐사 로봇 (상자 몸통 + 바퀴 여섯 + 태양전지판 + 카메라 기둥)
      const rover = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.8, 1.4), new THREE.MeshStandardMaterial({ color: 0xd0d4dc })); body.position.y = 0.9;
      const panel = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.08, 1.8), new THREE.MeshStandardMaterial({ color: 0x2a4ea0, emissive: 0x1a2f66, emissiveIntensity: 0.4 })); panel.position.y = 1.35;
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.2, 6), new THREE.MeshStandardMaterial({ color: 0x888888 })); mast.position.set(0.7, 1.9, 0);
      const cam = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.25, 0.3), new THREE.MeshStandardMaterial({ color: 0x333333 })); cam.position.set(0.7, 2.5, 0);
      rover.add(body, panel, mast, cam);
      for (const wx of [-0.9, 0, 0.9]) for (const wz of [-0.85, 0.85]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.3, 12), new THREE.MeshStandardMaterial({ color: 0x222222 })); w.rotation.x = Math.PI / 2; w.position.set(wx, 0.35, wz); rover.add(w); }
      rover.position.set(-36, height(-36, 40), 40); rover.rotation.y = 0.6; rover.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      decor.add(rover); block(-36, 40, 1.6);
      // 먼지 소용돌이: 돌면서 천천히 돌아다니는 반투명 원뿔
      const devils = [];
      for (let i = 0; i < 4; i++) { const d = new THREE.Mesh(new THREE.ConeGeometry(2.2, 9, 12, 1, true), new THREE.MeshBasicMaterial({ color: 0xe8b088, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false })); d.rotation.x = Math.PI; d.userData = { cx: rand(-50, 50), cz: rand(-50, 50), r: rand(15, 30), phase: rand(0, 6), speed: rand(0.08, 0.15) }; scene.add(d); devils.push(d); }
      addSkyBody(scene, { az: -0.7, el: 0.7, r: 3.5, color: 0xc9b8a8 }); addSkyBody(scene, { az: 0.9, el: 0.5, r: 2.2, color: 0xb0a090 }); // 포보스·데이모스
      anim.push((t) => { for (const d of devils) { const u = d.userData; const x = u.cx + Math.cos(t * u.speed + u.phase) * u.r, z = u.cz + Math.sin(t * u.speed + u.phase) * u.r; d.position.set(x, height(x, z) + 4.5, z); d.rotation.y = t * 4; } });
    },
  },
  jupiter: {
    sky: 0xd8a56a, fog: [0xe0b080, 50, 160], hemi: [0xfff0d0, 0x8a5a3a, 1.2], sun: [0xfff4e0, 0.9], dark: false,
    bumps: [{ x: -40, z: -30, r: 20, h: 1.6 }, { x: 46, z: 26, r: 18, h: 1.4 }, { x: 0, z: -60, r: 22, h: 1.8 }, { x: -64, z: 44, r: 16, h: 1.2 }, { x: 66, z: -60, r: 18, h: 1.6 }],
    spot: { x: 40, z: -22, rx: 24, rz: 15 },
    pools: [{ x: -50, z: 10, r: 6 }, { x: 10, z: 20, r: 5 }, { x: -20, z: -62, r: 6 }, { x: 62, z: 60, r: 5 }],
    colors: { bands: [0xf0d9b0, 0xb8834a, 0xd8a56a, 0x8a5a3a], spot: 0xc0442a, pool: 0x4a2a1a },
    colorFn(x, z, y, C) {
      const sp = THEMES.jupiter.spot; const e = ((x - sp.x) / sp.rx) ** 2 + ((z - sp.z) / sp.rz) ** 2;
      if (e < 1) return new THREE.Color(e < 0.35 ? 0xe06a4a : C.spot);
      const band = Math.floor((z + S / 2 + Math.sin(x * 0.08) * 3) / 16) % C.bands.length;
      return new THREE.Color(C.bands[(band + C.bands.length) % C.bands.length]);
    },
    decorate({ scene, decor, block, height, pools, anim }) {
      for (const p of pools) { const m = new THREE.Mesh(new THREE.CircleGeometry(p.r, 24), new THREE.MeshStandardMaterial({ color: 0x3a1a10, roughness: 1 })); m.rotation.x = -Math.PI / 2; m.position.set(p.x, height(p.x, p.z) + 0.2, p.z); scene.add(m); }
      // 구름 기둥 (지나갈 수 없는 뭉게구름 탑)
      const towers = [];
      for (let i = 0; i < 60; i++) { const x = rand(-S / 2 + 6, S / 2 - 6), z = rand(-S / 2 + 6, S / 2 - 6); if (keepClear(x, z) || inPools(pools, x, z, 2)) continue; const r = rand(1.0, 2.2); for (let k = 0; k < 3; k++) towers.push({ x: x + rand(-0.6, 0.6), y: height(x, z) + 0.6 + k * r * 0.9, z: z + rand(-0.6, 0.6), s: r * (1 - k * 0.2), color: Math.random() < 0.5 ? 0xfff4e0 : 0xf0d9b0 }); block(x, z, r); }
      decor.add(makeInstanced(new THREE.SphereGeometry(1, 10, 8), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1 }), towers, { shadow: true }));
      // 대적점 위에서 도는 소용돌이 고리
      const sp = THEMES.jupiter.spot;
      const swirls = [];
      for (let i = 0; i < 4; i++) { const ring = new THREE.Mesh(new THREE.TorusGeometry(4 + i * 4.5, 0.35, 6, 48), new THREE.MeshBasicMaterial({ color: i % 2 ? 0xe06a4a : 0xffb090, transparent: true, opacity: 0.5 })); ring.rotation.x = Math.PI / 2; ring.scale.set(1, 1, sp.rz / sp.rx); ring.position.set(sp.x, height(sp.x, sp.z) + 0.6 + i * 0.3, sp.z); scene.add(ring); swirls.push(ring); }
      // 번개
      const bolt = new THREE.PointLight(0xffffff, 0, 100); bolt.position.set(0, 20, 0); scene.add(bolt);
      const tex = puffTexture('255,240,220');
      const clouds = [];
      for (let i = 0; i < 36; i++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0.8 })); s.scale.setScalar(rand(14, 28)); s.userData = { x: rand(-130, 130), z: rand(-130, 130), y: rand(16, 28), speed: rand(4, 9) * (Math.random() < 0.5 ? 1 : -1) }; scene.add(s); clouds.push(s); }
      anim.push((t) => {
        swirls.forEach((r, i) => { r.rotation.z = t * (0.6 - i * 0.1) * (i % 2 ? -1 : 1); });
        for (const c of clouds) { const u = c.userData; c.position.set(((u.x + t * u.speed + 130 + 26000) % 260) - 130, u.y, u.z); }
        const f = Math.sin(t * 9.1) * Math.sin(t * 2.3); bolt.intensity = f > 0.98 ? 14 : 0; if (f > 0.98) bolt.position.set(rand(-60, 60), 20, rand(-60, 60));
      });
    },
  },
  saturn: {
    sky: 0xf3e2b8, fog: [0xf6ead0, 70, 200], hemi: [0xfff8e0, 0x9a8a5a, 1.1], sun: [0xfff4e0, 1.0], dark: false,
    bumps: [{ x: -40, z: -30, r: 16, h: 2.0 }, { x: 46, z: 26, r: 14, h: 1.8 }, { x: 10, z: -62, r: 16, h: 2.4 }, { x: -64, z: 44, r: 13, h: 1.6 }, { x: 66, z: -60, r: 14, h: 2.2 }],
    hex: { x: 0, z: -72, r: 13 },
    pools: [{ x: 0, z: -72, r: 12 }],
    colors: { a: 0xe6cf8f, b: 0xd4b877, hex: 0x2a3a6a, rim: 0xf6ead0 },
    colorFn(x, z, y, C) { const h = THEMES.saturn.hex; if (Math.hypot(x - h.x, z - h.z) < h.r + 1) return new THREE.Color(C.hex); return null; },
    decorate({ scene, decor, block, height, anim }) {
      // 북쪽 육각형 폭풍: 짙푸른 육각 판 위에 도는 고리
      const h = THEMES.saturn.hex;
      const hex = new THREE.Mesh(new THREE.CylinderGeometry(h.r, h.r, 0.4, 6), new THREE.MeshStandardMaterial({ color: 0x1f2f5a, emissive: 0x1a2a6a, emissiveIntensity: 0.4 }));
      hex.position.set(h.x, height(h.x, h.z) + 0.1, h.z); scene.add(hex);
      const eye = new THREE.Mesh(new THREE.TorusGeometry(5, 0.4, 6, 40), new THREE.MeshBasicMaterial({ color: 0x9fe8ff, transparent: true, opacity: 0.6 })); eye.rotation.x = Math.PI / 2; eye.position.set(h.x, height(h.x, h.z) + 0.8, h.z); scene.add(eye);
      // 하늘을 가로지르는 거대한 고리
      for (const [r, tube, col, op] of [[150, 4, 0xf1e3b8, 0.9], [160, 2, 0xc9b06a, 0.8], [140, 1.5, 0xfff8e0, 0.7]]) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(r, tube, 8, 90, Math.PI), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: op, fog: false, side: THREE.DoubleSide }));
        ring.position.set(0, 30, -20); ring.rotation.z = 0; ring.rotation.y = 0; ring.rotation.x = -0.35;
        scene.add(ring);
      }
      // 반짝이는 얼음 조각
      const ice = [];
      for (let i = 0; i < 140; i++) { const x = rand(-S / 2 + 4, S / 2 - 4), z = rand(-S / 2 + 4, S / 2 - 4); if (keepClear(x, z) || Math.hypot(x - h.x, z - h.z) < h.r + 3) continue; const s = rand(0.4, 1.6); ice.push({ x, y: height(x, z) + s * 0.5, z, s, rx: rand(0, 3), ry: rand(0, 3), color: Math.random() < 0.5 ? 0xffffff : 0xdff6ff }); block(x, z, s * 0.8); }
      decor.add(makeInstanced(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.9 }), ice, { shadow: true }));
      const sparkles = [];
      for (let i = 0; i < 60; i++) { const m = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 5), new THREE.MeshBasicMaterial({ color: 0xffffff })); m.userData = { x: rand(-85, 85), z: rand(-85, 85), h: rand(1, 4), phase: rand(0, 10) }; scene.add(m); sparkles.push(m); }
      anim.push((t) => { eye.rotation.z = t * 0.8; for (const m of sparkles) { const u = m.userData; m.position.set(u.x, height(u.x, u.z) + u.h + Math.sin(t * 2 + u.phase) * 0.5, u.z); m.visible = Math.sin(t * 5 + u.phase) > 0; } });
    },
  },
  uranus: {
    sky: 0x8fd8e8, fog: [0xa8e4ee, 50, 160], hemi: [0xe0fbff, 0x3a7a8a, 1.1], sun: [0xe0f8ff, 0.9], dark: false,
    bumps: [{ x: -40, z: -30, r: 16, h: 2.4 }, { x: 46, z: 26, r: 14, h: 2.0 }, { x: 10, z: -62, r: 16, h: 3.0 }, { x: -64, z: 44, r: 13, h: 1.8 }, { x: 66, z: -60, r: 14, h: 2.6 }, { x: -70, z: -60, r: 14, h: 2.8 }],
    pools: [{ x: -30, z: 8, r: 9 }, { x: 40, z: -30, r: 8 }, { x: -60, z: -50, r: 6 }, { x: 60, z: 62, r: 6 }, { x: 8, z: -30, r: 5 }],
    colors: { a: 0xa8e8f0, b: 0x8ad0dc, dark: 0x5aa8b8, pool: 0x3a8a9a, rim: 0xdff6ff },
    decorate({ scene, decor, block, height, pools, anim }) {
      for (const p of pools) { const m = new THREE.Mesh(new THREE.CircleGeometry(p.r + 0.4, 28), new THREE.MeshStandardMaterial({ color: 0x66d8e8, roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.85 })); m.rotation.x = -Math.PI / 2; m.position.set(p.x, height(p.x, p.z) + 0.3, p.z); scene.add(m); }
      // 세로로 선 고리 (옆으로 누운 행성)
      for (const [r, tube, op] of [[130, 2.2, 0.85], [140, 1.2, 0.7]]) { const ring = new THREE.Mesh(new THREE.TorusGeometry(r, tube, 8, 80, Math.PI), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: op, fog: false, side: THREE.DoubleSide })); ring.position.set(40, 0, -30); ring.rotation.y = 0.5; scene.add(ring); }
      // 다이아몬드 수정과 얼어붙은 간헐천
      const diamonds = [];
      for (let i = 0; i < 90; i++) { const x = rand(-S / 2 + 5, S / 2 - 5), z = rand(-S / 2 + 5, S / 2 - 5); if (keepClear(x, z) || inPools(pools, x, z, 2)) continue; const h = rand(0.8, 2.4); diamonds.push({ x, y: height(x, z) + h * 0.5, z, sx: 0.5, sy: h * 0.8, sz: 0.5, ry: rand(0, 3) }); block(x, z, 0.6); }
      decor.add(makeInstanced(new THREE.OctahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x88c0d0, emissiveIntensity: 0.35, roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.85 }), diamonds));
      const geysers = [];
      for (let i = 0; i < 24; i++) { const x = rand(-S / 2 + 6, S / 2 - 6), z = rand(-S / 2 + 6, S / 2 - 6); if (keepClear(x, z) || inPools(pools, x, z, 2)) continue; const h = rand(3, 7); geysers.push({ x, y: height(x, z) + h / 2, z, sx: 0.7, sy: h, sz: 0.7, ry: rand(0, 3) }); block(x, z, 0.7); }
      decor.add(makeInstanced(new THREE.ConeGeometry(1, 1, 7), new THREE.MeshStandardMaterial({ color: 0xdff6ff, roughness: 0.3 }), geysers, { shadow: true }));
      const flakes = [];
      for (let i = 0; i < 80; i++) { const m = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 5), new THREE.MeshBasicMaterial({ color: 0xffffff })); m.userData = { x: rand(-85, 85), z: rand(-85, 85), phase: rand(0, 10) }; scene.add(m); flakes.push(m); }
      anim.push((t) => { for (const m of flakes) { const u = m.userData; const life = ((t * 0.35 + u.phase) % 5) / 5; m.position.set(u.x + Math.sin(t + u.phase) * 1.5, 10 - life * 10, u.z); } });
    },
  },
  neptune: {
    sky: 0x2b4ad8, fog: [0x3050d0, 45, 150], hemi: [0x9fb8ff, 0x101a60, 1.2], sun: [0xcfe0ff, 1.0], dark: false,
    bumps: [{ x: -40, z: -30, r: 16, h: 2.4 }, { x: 46, z: 26, r: 14, h: 2.0 }, { x: 10, z: -62, r: 16, h: 3.0 }, { x: -64, z: 44, r: 13, h: 1.8 }, { x: 66, z: -60, r: 14, h: 2.6 }],
    spot: { x: -44, z: -40, r: 16 },
    pools: [{ x: 30, z: 6, r: 8 }, { x: -20, z: 30, r: 6 }, { x: 56, z: -40, r: 7 }, { x: -70, z: 60, r: 6 }, { x: 12, z: -34, r: 5 }],
    colors: { a: 0x3f5fd8, b: 0x3350c0, spot: 0x1a2a70, pool: 0x102060, rim: 0x8fb0ff },
    colorFn(x, z, y, C) { const s = THEMES.neptune.spot; if (Math.hypot(x - s.x, z - s.z) < s.r) return new THREE.Color(C.spot); return null; },
    decorate({ scene, decor, block, height, pools, anim }) {
      const glow = new THREE.MeshStandardMaterial({ color: 0x4f7fff, emissive: 0x2a5aff, emissiveIntensity: 0.9, roughness: 0.2 });
      for (const p of pools) { const m = new THREE.Mesh(new THREE.CircleGeometry(p.r, 28), glow); m.rotation.x = -Math.PI / 2; m.position.set(p.x, height(p.x, p.z) + 0.25, p.z); scene.add(m); }
      const s = THEMES.neptune.spot;
      const eye = new THREE.Mesh(new THREE.TorusGeometry(s.r * 0.6, 0.5, 6, 48), new THREE.MeshBasicMaterial({ color: 0x8fb0ff, transparent: true, opacity: 0.5 })); eye.rotation.x = Math.PI / 2; eye.position.set(s.x, height(s.x, s.z) + 0.8, s.z); scene.add(eye);
      const spires = [];
      for (let i = 0; i < 70; i++) { const x = rand(-S / 2 + 6, S / 2 - 6), z = rand(-S / 2 + 6, S / 2 - 6); if (keepClear(x, z) || inPools(pools, x, z, 2)) continue; const h = rand(2, 7), r = rand(0.5, 1.2); spires.push({ x, y: height(x, z) + h / 2 - 0.2, z, sx: r, sy: h, sz: r, ry: rand(0, 3), rz: rand(-0.15, 0.15) }); block(x, z, r * 0.9); }
      decor.add(makeInstanced(new THREE.ConeGeometry(1, 1, 6), new THREE.MeshStandardMaterial({ color: 0xbfd8ff, roughness: 0.3 }), spires, { shadow: true }));
      // 바람에 날아가는 흰 구름 줄기
      const tex = puffTexture('235,245,255');
      const clouds = [];
      for (let i = 0; i < 44; i++) { const c = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0.75 })); c.scale.set(rand(20, 40), rand(3, 6), 1); c.userData = { x: rand(-130, 130), z: rand(-130, 130), y: rand(6, 26), speed: rand(18, 34) }; scene.add(c); clouds.push(c); }
      const wind = [];
      for (let i = 0; i < 60; i++) { const m = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.05, 0.05), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6 })); m.userData = { x: rand(-90, 90), z: rand(-90, 90), h: rand(0.6, 3), speed: rand(20, 30) }; scene.add(m); wind.push(m); }
      anim.push((t) => {
        eye.rotation.z = -t * 0.7;
        for (const c of clouds) { const u = c.userData; c.position.set(((u.x + t * u.speed + 130 + 260000) % 260) - 130, u.y, u.z); }
        for (const m of wind) { const u = m.userData; const x = ((u.x + t * u.speed + 90 + 180000) % 180) - 90; m.position.set(x, height(x, u.z) + u.h, u.z); }
      });
    },
  },
  pluto: {
    sky: 0x030210, fog: [0x06041a, 60, 170], hemi: [0x9a8ab0, 0x1a1020, 0.9], sun: [0xd8d0ff, 0.9], dark: true, stars: true,
    bumps: [{ x: -55, z: -40, r: 16, h: 5 }, { x: 60, z: -50, r: 15, h: 5.5 }, { x: -70, z: 40, r: 13, h: 3.6 }, { x: 70, z: 45, r: 13, h: 3.2 }, { x: 0, z: -78, r: 14, h: 4.5 }, { x: 40, z: 10, r: 10, h: 1.8 }, { x: -40, z: 10, r: 10, h: 1.6 }],
    pools: [],
    colors: { a: 0x9a8a80, b: 0x7a5a50, heart: 0xf4f0f0, heart2: 0xffe8f0 },
    colorFn(x, z, y, C) { return inHeart(x, z) ? new THREE.Color(Math.random() < 0.5 ? C.heart : C.heart2) : null; },
    decorate({ scene, decor, block, height, anim }) {
      addSkyBody(scene, { az: 0.4, el: 0.55, r: 34, color: 0x9a9aa6 }); // 카론
      addSkyBody(scene, { az: -0.8, el: 0.7, r: 2.2, color: 0xffffff, glow: 0xffffc0 }); // 아주 작은 태양
      const mountains = [];
      for (let i = 0; i < 50; i++) { const x = rand(-S / 2 + 6, S / 2 - 6), z = rand(-S / 2 + 6, S / 2 - 6); if (keepClear(x, z) || inHeart(x, z)) continue; const h = rand(2, 7), r = rand(1, 2.4); mountains.push({ x, y: height(x, z) + h / 2 - 0.3, z, sx: r, sy: h, sz: r, ry: rand(0, 3) }); block(x, z, r * 0.9); }
      decor.add(makeInstanced(new THREE.ConeGeometry(1, 1, 6), new THREE.MeshStandardMaterial({ color: 0xe8e0e8, roughness: 0.6 }), mountains, { shadow: true }));
      const blocks = [];
      for (let i = 0; i < 70; i++) { const x = rand(-S / 2 + 4, S / 2 - 4), z = rand(-S / 2 + 4, S / 2 - 4); if (keepClear(x, z)) continue; const s = rand(0.5, 1.4); blocks.push({ x, y: height(x, z) + s * 0.4, z, s, ry: rand(0, 3), rx: rand(-0.2, 0.2), color: inHeart(x, z) ? 0xffffff : 0x8a6a60 }); block(x, z, s * 0.8); }
      decor.add(makeInstanced(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 }), blocks, { shadow: true }));
      // 하트 평원 위에 떠다니는 서릿빛 구슬 + 은은한 점광원
      const frost = [];
      for (let i = 0; i < 50; i++) { const m = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffd0e0 })); m.userData = { x: rand(-40, 40), z: rand(-50, 20), h: rand(1, 4), phase: rand(0, 10) }; scene.add(m); frost.push(m); }
      for (const [x, z] of [[0, -20], [-25, -5], [25, -5]]) { const l = new THREE.PointLight(0xffc0d8, 2.5, 30); l.position.set(x, height(x, z) + 4, z); scene.add(l); }
      anim.push((t) => { for (const m of frost) { const u = m.userData; m.position.set(u.x + Math.cos(t * 0.4 + u.phase) * 2, height(u.x, u.z) + u.h + Math.sin(t * 1.2 + u.phase) * 0.5, u.z + Math.sin(t * 0.4 + u.phase) * 2); } });
    },
  },
};
/** 명왕성의 하트 평원 (톰보 지역): 하트 방정식 (x²+z²−1)³ − x²z³ < 0 */
function inHeart(x, z) { const hx = x / 42, hz = -(z + 8) / 42 + 0.15; const q = hx * hx + hz * hz - 1; return q * q * q - hx * hx * hz * hz * hz < 0; }

/** 보스 아레나: 행성 색 빛나는 원판 + 기둥 여섯 + 불빛. 보스는 한가운데 선다 */
function buildArena(scene, decor, block, height, tint) {
  const a = ARENA, y = height(a.x, a.z);
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(a.r, a.r + 1, 0.4, 36), new THREE.MeshStandardMaterial({ color: tint, emissive: tint, emissiveIntensity: 0.35, roughness: 0.6 }));
  disc.position.set(a.x, y + 0.15, a.z); disc.userData.noHide = true;
  decor.add(disc);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(a.r - 0.6, 0.12, 8, 48), new THREE.MeshStandardMaterial({ color: 0xffd93d, emissive: 0xffb300, emissiveIntensity: 1 }));
  ring.rotation.x = Math.PI / 2; ring.position.set(a.x, y + 0.4, a.z); ring.userData.noHide = true;
  decor.add(ring);
  for (let i = 0; i < 6; i++) {
    const ang = (i / 6) * Math.PI * 2 + Math.PI / 6;
    const px = a.x + Math.cos(ang) * (a.r + 0.6), pz = a.z + Math.sin(ang) * (a.r + 0.6);
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.55, 3.4, 8), new THREE.MeshStandardMaterial({ color: 0xf4f4f8, emissive: tint, emissiveIntensity: 0.4 }));
    pillar.position.set(px, y + 1.9, pz); pillar.castShadow = true;
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.5, 10, 8), new THREE.MeshStandardMaterial({ color: tint, emissive: tint, emissiveIntensity: 0.9 }));
    cap.position.set(px, y + 3.9, pz);
    decor.add(pillar, cap); block(px, pz, 0.6);
  }
  const light = new THREE.PointLight(tint, 5, 26);
  light.position.set(a.x, y + 5, a.z);
  scene.add(light);
}

/** 행성 지역 하나를 만든다. info: ZONE_INFO[p.zone] (atkRange 등), speciesName(id) 는 손오공의 대사에, boss 는 그 행성의 보스 종, hidden 은 보스를 잡으면 나타나는 숨은 종(메가망나뇽) */
export function buildPlanet(p, scene, { info = {}, speciesName = (id) => id, boss = null, hidden = null, rival = null } = {}) { // rival: 아레나 앞에 서서 보스 도전 요령을 알려 주는 NPC (태양의 베지터)
  const T = THEMES[p.id];
  const pools = T.pools || [], craters = T.craters || [];
  function height(x, z) {
    let y = bumpsHeight(T.bumps, x, z) + poolsDip(pools, x, z);
    for (const c of craters) { const d = Math.hypot(x - c.x, z - c.z); if (d < c.r) y -= c.d * (1 - (d / c.r) ** 2); else if (d < c.r + 2.5) y += 0.5 * (1 - (d - c.r) / 2.5); }
    if (T.canyon) { const c = T.canyon; const vx = c.x2 - c.x1, vz = c.z2 - c.z1; const t = Math.max(0, Math.min(1, ((x - c.x1) * vx + (z - c.z1) * vz) / (vx * vx + vz * vz))); const d = Math.hypot(x - (c.x1 + vx * t), z - (c.z1 + vz * t)); if (d < c.w + 3) y -= c.d * Math.min(1, (c.w + 3 - d) / 3); }
    if (p.id === 'pluto' && inHeart(x, z)) y -= 0.6;
    return y;
  }
  const blocked = (x, z) => inPools(pools, x, z);
  const terrain = { height, inHole: () => false, blocked, size: S, obstacles: [] };
  const decor = new THREE.Group();
  scene.add(decor);
  const block = (x, z, r) => terrain.obstacles.push({ x, z, r });

  scene.background = new THREE.Color(T.sky);
  scene.fog = new THREE.Fog(T.fog[0], T.fog[1], T.fog[2]);
  scene.add(new THREE.HemisphereLight(T.hemi[0], T.hemi[1], T.hemi[2]));
  const sun = new THREE.DirectionalLight(T.sun[0], T.sun[1]);
  sun.position.set(20, 30, 10);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -35, right: 35, top: 35, bottom: -35, near: 1, far: 120 });
  scene.add(sun, sun.target);
  if (T.stars) addStars(scene);

  const C = T.colors;
  const colA = new THREE.Color(C.a ?? 0x888888), colB = new THREE.Color(C.b ?? C.a ?? 0x777777), colPool = new THREE.Color(C.pool ?? 0x333333), colRim = new THREE.Color(C.rim ?? C.a ?? 0x999999), colCanyon = new THREE.Color(C.canyon ?? 0x555555);
  buildGround(scene, S, 200, height, (x, z, y) => {
    for (const q of pools) { const d = Math.hypot(x - q.x, z - q.z); if (d < q.r) return colPool; if (d < q.r + 1.8) return colRim; }
    if (T.canyon) { const c = T.canyon; const vx = c.x2 - c.x1, vz = c.z2 - c.z1; const t = Math.max(0, Math.min(1, ((x - c.x1) * vx + (z - c.z1) * vz) / (vx * vx + vz * vz))); if (Math.hypot(x - (c.x1 + vx * t), z - (c.z1 + vz * t)) < c.w) return colCanyon; }
    const special = T.colorFn?.(x, z, y, C);
    if (special) return special;
    return Math.random() < 0.5 ? colA : colB;
  });

  const anim = [];
  const wildNames = (info.wild || []).map(speciesName).filter(Boolean);
  const station = buildUfoStation(scene, decor, block, {
    x: STATION.x, z: STATION.z, heightFn: height, to: 'space', color: Number(`0x${p.tint.slice(1)}`),
    lines: (c) => [
      `${p.name}에 온 걸 환영해, ${c.name}! 난 UFO 조종사 손오공야. ${p.greet}`,
      `${p.name}에는 ${wildNames.slice(0, 5).join('·')}${wildNames.length > 5 ? ' 등' : ''}이 살아. 공격 ${c.zone.atkRange || '?'}쯤 되면 편하게 이겨.`,
      p.fact,
      boss ? (c.conquered[p.zone] ? `보스 ${boss.name}을(를) 이겼구나! ${p.name}은 이제 네 거야.${hidden ? ` 그리고 ${p.name} 어딘가에 숨어 있던 ${hidden.name}이(가) 나타났대. 체력 ${hidden.baseHp}, 공격 ${hidden.baseAtk}이니 조심해!` : ''}` : `북쪽 아레나에 보스 ${boss.name}이(가) 있어. 체력 ${boss.baseHp}, 공격 ${boss.baseAtk}! 공격 ${(info.targetAtk || 10) + 3} 이상이면 도전해 봐.${hidden ? ' 보스를 잡으면 이 행성에 숨은 포켓몬이 하나 더 나타난대.' : ''}`) : p.fact,
      '행성 열 곳의 보스를 모두 잡으면 꿈의우주에 전설의 포켓몬 뮤가 나타난다는 소문이 있어. 아주아주 세니까 메가큐브을 잔뜩 준비해!',
      '꿈의우주로 돌아가려면 나한테 말을 걸고 빨간 버튼을, 다른 행성으로 가려면 보라 버튼을 눌러!',
    ],
  });
  T.decorate({ scene, decor, block, height, pools, anim, blocked });
  const tint = Number(`0x${p.tint.slice(1)}`);
  buildArena(scene, decor, block, height, tint);
  anim.push(station.animate);
  // 도착 자리 표시
  const drop = new THREE.Mesh(new THREE.CircleGeometry(2.2, 24), new THREE.MeshBasicMaterial({ color: 0x9fe8ff, transparent: true, opacity: 0.25 }));
  drop.rotation.x = -Math.PI / 2;
  drop.position.set(SPAWN.x, height(SPAWN.x, SPAWN.z) + 0.03, SPAWN.z);
  scene.add(drop);

  const ok = (x, z) => !blocked(x, z) && !terrain.obstacles.some((o) => Math.hypot(x - o.x, z - o.z) < o.r + 1.2) && !keepClear(x, z);
  const npcs = [station.npc];
  if (rival) { // 아레나 입구(남쪽) 옆의 라이벌: 팔짱 끼고 서서 보스 도전 요령을 알려 준다
    const [rx, rz] = freeSpot(ARENA.x + 6, ARENA.z + ARENA.r + 6, ok); // 아레나 남동쪽, 장식과 안 겹치는 자리
    const mesh = makeNpc({ outfit: 'astronaut', name: rival.name, model: rival.model });
    mesh.position.set(rx, height(rx, rz), rz); mesh.rotation.y = 2.6;
    decor.add(mesh); block(rx, rz, 0.6);
    npcs.push({ x: rx, z: rz, mesh, name: rival.name, lines: (c) => [
      `흥, ${c.name}이라고? 난 ${rival.name}다. ${p.name}에서 수련하고 있지. 저 아레나의 ${boss?.name || '보스'}는 내가 먼저 눈여겨보고 있었다.`,
      boss ? `${boss.name}은(는) 체력 ${boss.baseHp}에 공격 ${boss.baseAtk}. 공격 ${(info.targetAtk || 10) + 3} 은 넘겨야 상대가 된다. 불 포켓몬에겐 물 포켓몬을 내보내라!` : p.fact,
      '대결에서 기술을 고를 땐 상대 속성을 봐라. 상성이 맞으면 1.5배, 틀리면 절반이다. 그리고 볼은 넉넉히 만들어 와라. 도망가면 끝이니까.',
      c.conquered[p.zone] ? `${boss?.name || '보스'}를 잡았다고? …제법이군. 다음엔 다른 행성에서 보자. 행성 열 곳의 보스를 다 잡으면 전설의 뮤가 나타난다는 소문이 있다.` : '보스를 잡으면 이 행성은 네 것이 된다. 어서 강해져서 도전해 봐라.',
    ] });
  }
  const wildSpots = WILD_TEMPLATE.map(([x, z]) => freeSpot(x, z, ok));
  const pickupSpots = PICKUP_TEMPLATE.map(([x, z]) => freeSpot(x, z, ok));

  return {
    sun, animate: (t) => { for (const f of anim) f(t); }, terrain, decor, spawn: SPAWN, dark: T.dark, gravity: p.gravity, noShrine: true,
    npcs,
    bossSpot: { x: ARENA.x, z: ARENA.z },
    ufo: station.vehicle,
    ufoArrival: station.arrival,
    wildSpots, pickupSpots,
  };
}
