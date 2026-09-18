import * as THREE from 'three';
import { makePillSprite } from './world.js';
import { swapDraftWithModel } from './models.js';

// 이상해꽃 자동차: 주인공이 타고 다니는 차. 푸른숲 시작 지점 옆에 세워져 있고, 한 번 타면 "내 차"가 되어 어느 지역에서든 HUD 🚗 버튼으로 부른다.
// 모델(이상해꽃자동차.glb)은 앞이 -X 라서 90° 돌려 게임 앞 방향(+Z)에 맞춘다. 없으면 파란 상자 차(드래프트).
export const CAR_MODEL = '이상해꽃자동차.glb';
export const CAR_NAME = '이상해꽃 자동차';
export const CAR_LENGTH = 3.8;          // 차 길이(m). 모델은 높이 1m 기준이라 길이/높이 비율(2.3)로 높이를 정한다
export const CAR_SPEED = 2.2;           // 걷기 대비 배속
export const CAR_BOOST = 1.25;          // 달리기(가속) 버튼을 누르면 더 빨라진다
const CAR_HEIGHT = CAR_LENGTH / 2.3;

/** 차 한 대: { group(세워 둘 때 씬에 넣는 것), body(주인공에게 붙이는 차체), tag } */
export function makeCar() {
  const group = new THREE.Group();
  const body = new THREE.Group();                 // 차체(모델 또는 드래프트). 탈 때는 이걸 주인공 그룹으로 옮긴다
  const draft = new THREE.Group();
  body.add(draft);
  body.userData.draft = draft;
  const mat = (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.4 });
  const hull = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.6, CAR_LENGTH), mat(0x5ad2f0)); hull.position.y = 0.55;
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.55, 1.6), mat(0x9fe8ff)); cabin.position.set(0, 1.1, -0.3);
  const flower = new THREE.Mesh(new THREE.SphereGeometry(0.4, 10, 8), mat(0xff6f9c)); flower.position.set(0, 1.55, -0.3);
  draft.add(hull, cabin, flower);
  for (const [x, z] of [[-0.9, 1.2], [0.9, 1.2], [-0.9, -1.2], [0.9, -1.2]]) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.3, 12), mat(0x222222));
    w.rotation.z = Math.PI / 2; w.position.set(x, 0.35, z); draft.add(w);
  }
  body.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  swapDraftWithModel(body, CAR_MODEL, { scale: CAR_HEIGHT, onSwap: (m) => { m.rotation.y = Math.PI / 2; m.userData.popT = 1; m.scale.setScalar(CAR_HEIGHT); } });
  const tag = makePillSprite(CAR_NAME, { border: '#3fb8e8' }, 0.85);
  tag.position.y = 2.4;
  group.add(body, tag);
  return { group, body, tag };
}
