import * as THREE from 'three';
import { addFace } from './util.js';
import { makeLabelTexture } from './world.js';
import { swapDraftWithModel } from './models.js';

export const NPC_HEIGHT = 1.8; // NPC 모델 키(m)

// 지역 안내 NPC (드래프트 사람 캐릭터). 가까이 가서 이야기 버튼을 누르면 한 줄씩 이야기하고, 마지막엔 연구소로 데려다준다.
// outfit: 'ranger'(숲지기) | 'miner'(광부) | 'scientist'(화산학자) | 'captain'(선장) | 'astronaut'(우주비행사) | 'professor'(오박사)
export function makeNpc({ outfit = 'ranger', name = '안내원', skin = 0xffe0bd, model = null } = {}) {
  const g = new THREE.Group();
  const draft = new THREE.Group(); // 드래프트 부품. 모델(.glb)이 있으면 통째로 교체된다
  g.add(draft);
  g.userData.draft = draft;
  const C = {
    ranger:    { coat: 0x2e8b57, pants: 0x5a3a1a, hat: 0x2e8b57, hatKind: 'cap' },
    miner:     { coat: 0xd9a441, pants: 0x4a4a4a, hat: 0xffd93d, hatKind: 'helmet' },
    scientist: { coat: 0xffffff, pants: 0x3a3f4a, hat: 0xff6a1a, hatKind: 'helmet' },
    captain:   { coat: 0x1f3a93, pants: 0xf4f4f8, hat: 0x1f3a93, hatKind: 'capcap' },
    astronaut: { coat: 0xf4f4f8, pants: 0xf4f4f8, hat: 0xdddddd, hatKind: 'bubble' },
    professor: { coat: 0xffffff, pants: 0x556070, hat: 0xbfc5cc, hatKind: 'hair' },
  }[outfit];
  const mat = (c) => new THREE.MeshStandardMaterial({ color: c });
  const coat = new THREE.Mesh(new THREE.CapsuleGeometry(0.38, 0.7, 6, 12), mat(C.coat)); coat.position.y = 0.75;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.36, 16, 14), mat(skin)); head.position.y = 1.55;
  addFace(head, { y: 0.02, z: 0.32, spread: 0.12, size: 0.05 });
  for (const ax of [-0.5, 0.5]) { const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.1, 0.5, 4, 8), mat(C.coat)); arm.position.set(ax, 0.85, 0); arm.rotation.z = ax > 0 ? -0.3 : 0.3; draft.add(arm); }
  for (const lx of [-0.16, 0.16]) { const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.11, 0.3, 4, 8), mat(C.pants)); leg.position.set(lx, 0.25, 0); draft.add(leg); }
  draft.add(coat, head);
  if (C.hatKind === 'cap') { const cap = new THREE.Mesh(new THREE.SphereGeometry(0.38, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2.2), mat(C.hat)); cap.position.y = 1.62; const brim = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.06, 0.35), mat(C.hat)); brim.position.set(0, 1.62, 0.4); draft.add(cap, brim); }
  if (C.hatKind === 'capcap') { const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.42, 0.28, 16), mat(C.hat)); cap.position.y = 1.85; const brim = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.06, 0.35), mat(0x20232e)); brim.position.set(0, 1.72, 0.4); const badge = new THREE.Mesh(new THREE.CircleGeometry(0.09, 10), mat(0xffd93d)); badge.position.set(0, 1.86, 0.41); draft.add(cap, brim, badge); const beard = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), mat(0xf4f4f8)); beard.position.set(0, 1.32, 0.22); beard.scale.y = 0.7; draft.add(beard); }
  if (C.hatKind === 'helmet') { const h = new THREE.Mesh(new THREE.SphereGeometry(0.41, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), mat(C.hat)); h.position.y = 1.6; const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), new THREE.MeshStandardMaterial({ color: 0xfff1b5, emissive: 0xffd36b, emissiveIntensity: 1 })); lamp.position.set(0, 1.78, 0.38); draft.add(h, lamp); }
  if (C.hatKind === 'bubble') { const b = new THREE.Mesh(new THREE.SphereGeometry(0.5, 16, 12), new THREE.MeshStandardMaterial({ color: 0x9fe8ff, transparent: true, opacity: 0.35 })); b.position.y = 1.55; const pack = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.6, 0.25), mat(0xdddddd)); pack.position.set(0, 0.9, -0.42); draft.add(b, pack); }
  if (C.hatKind === 'hair') { const hair = new THREE.Mesh(new THREE.SphereGeometry(0.37, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2.4), mat(C.hat)); hair.position.y = 1.62; const gm = mat(0x333333); for (const gx of [-0.12, 0.12]) { const ring = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.015, 6, 14), gm); ring.position.set(gx, 1.58, 0.34); draft.add(ring); } const tie = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.5, 0.05), mat(0xe8453c)); tie.position.set(0, 0.95, 0.38); draft.add(hair, tie); }
  const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: makeLabelTexture(name, '#ffffff', '#20232e', 56), transparent: true, depthTest: false }));
  tag.scale.set(1.6, 0.4, 1); tag.position.y = 2.3;
  g.add(tag);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  if (model) swapDraftWithModel(g, model, { scale: NPC_HEIGHT, onSwap: (m) => { m.userData.popT = 1; m.scale.setScalar(NPC_HEIGHT); tag.position.y = NPC_HEIGHT + 0.45; } }); // NPC 는 등장 연출 없이 바로
  return g;
}
