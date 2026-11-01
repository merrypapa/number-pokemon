// 주인공 고르기: 지우 말고도 넘버랜드의 친구들(NPC 모델) 중에서 고른다. 트레이너마다 "잘 맞는 속성"이 있어
// 그 속성 포켓몬은 공격 1.2배(대결 피해), 경험치 1.25배로 자란다 (찰떡 포켓몬). 모습은 그 NPC 의 glb 모델 (없으면 지우 드래프트).
// state.trainer = { id } 로 저장. 옛 저장(없음)은 지우.
export const TRAINERS = [
  { id: 'jiwoo', name: '지우', model: '지우.glb', type: '전기', emoji: '⚡', desc: '피카츄의 단짝. 번개처럼 빠른 모험가', height: 1.9 },
  { id: 'nami', name: '나미', model: '나미.glb', type: '물', emoji: '💧', desc: '바다를 잘 아는 항해사', height: 1.8 },
  { id: 'woongi', name: '웅이', model: '웅이.glb', type: '바위', emoji: '🪨', desc: '동굴을 누비는 광부', height: 1.8 },
  { id: 'bomi', name: '봄이', model: '봄이.glb', type: '불', emoji: '🔥', desc: '화산을 연구하는 과학자', height: 1.8 },
  { id: 'riri', name: '리리', model: '리리.glb', type: '풀', emoji: '🌿', desc: '숲을 달리는 기차 차장', height: 1.8 },
  { id: 'kori', name: '코리', model: '코리.glb', type: '에스퍼', emoji: '🔮', desc: '별을 보는 우주비행사', height: 1.8 },
  { id: 'luffy', name: '루피', model: '루피.glb', type: '격투', emoji: '👊', desc: '주먹이 센 뱃사공', height: 1.8 },
  { id: 'kidgoku', name: '아이 손오공', model: '아이손오공.glb', type: '땅', emoji: '🏜️', desc: '탑을 지키는 꼬마 무술가', height: 1.6 },
  { id: 'goku', name: '손오공', model: '손오공.glb', type: '노말', emoji: '⭐', desc: 'UFO 를 모는 든든한 조종사', height: 1.9 },
  { id: 'totoro', name: '도토로', model: '도토로.glb', type: '벌레', emoji: '🐛', desc: '숲의 작은 친구들을 아끼는 광부', height: 1.8 },
  { id: 'vegeta', name: '베지터', model: '베지터.glb', type: '고스트', emoji: '👻', desc: '어둠도 무섭지 않은 전사', height: 1.85 },
  { id: 'bugs', name: '벅스버니', model: '벅스버니.glb', type: '페어리', emoji: '🎀', desc: '장난꾸러기 토끼', height: 1.8 },
  { id: 'inha', name: '인하', model: '인하.glb', type: '독', emoji: '🧪', desc: '포켓몬 학교 당번', height: 1.7 },
];
export const TRAINER_BY_ID = Object.fromEntries(TRAINERS.map((t) => [t.id, t]));
export const DEFAULT_TRAINER = TRAINERS[0];
export const trainerOf = (id) => TRAINER_BY_ID[id] || DEFAULT_TRAINER;
/** 찰떡 보너스: 트레이너의 속성과 같은 포켓몬 */
export const AFFINITY_ATK = 1.2;
export const AFFINITY_EXP = 1.25;
export function isAffinity(trainer, sp) { return !!(trainer && sp && (sp.type || '노말') === trainer.type); }
