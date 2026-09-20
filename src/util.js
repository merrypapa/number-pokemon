import * as THREE from 'three';

// 눈 2개(또는 n개) + 웃는 입. 모든 캐릭터가 같은 얼굴 규칙을 쓴다.
export function addFace(group, { y = 0.1, z = 0.5, eyes = 2, spread = 0.18, size = 0.07, mouth = true } = {}) {
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0x222222 });
  const n = Math.max(1, eyes);
  for (let i = 0; i < n; i++) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(size, 10, 10), eyeMat);
    const x = n === 1 ? 0 : -spread + (2 * spread * i) / (n - 1);
    eye.position.set(x, y, z);
    group.add(eye);
  }
  if (mouth) {
    const m = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.025, 6, 12, Math.PI), eyeMat);
    m.rotation.z = Math.PI;
    m.position.set(0, y - 0.13, z);
    group.add(m);
  }
}

// 숫자를 그린 캔버스 스프라이트 (몬스터 머리 위 힌트)
export function makeNumberSprite(text, color = '#e67e22') {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const ctx = c.getContext('2d');
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.beginPath(); ctx.arc(64, 64, 58, 0, Math.PI * 2); ctx.fill();
  ctx.lineWidth = 6; ctx.strokeStyle = color; ctx.stroke();
  ctx.fillStyle = color;
  ctx.font = 'bold 72px sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(String(text), 64, 68);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
  sprite.scale.set(0.9, 0.9, 1);
  return sprite;
}

// 정육면체 블록 하나 (숫자블록의 기본 단위, 주울 수 있는 블록도 같은 모양)
export function makeBlockMesh(color = 0xffffff) {
  const geo = new THREE.BoxGeometry(0.6, 0.6, 0.6);
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.6 });
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = true;
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: 0x333333 }));
  m.add(edges);
  return m;
}

export function lerpAngle(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

export const rand = (a, b) => a + Math.random() * (b - a);

/** 받침에 맞는 조사 붙이기: josa('미나', '이가') → '미나가', josa('인하', '과와') → '인하와', josa('태양', '으로') → '태양으로', josa('지구', '으로') → '지구로', josa('인하', '이라') → '인하라'.
 *  한글이 아닌 글자로 끝나면(숫자·영어·이모지) 두 가지를 같이 보여 준다: '???이(가)'. 종류: 이가·을를·은는·과와·으로·이라 */
const JOSA = { '이가': ['이', '가'], '을를': ['을', '를'], '은는': ['은', '는'], '과와': ['과', '와'], '으로': ['으로', '로'], '이라': ['이라', '라'] };
export function josa(word, type) {
  const w = String(word ?? ''), [withJong, noJong] = JOSA[type] || ['', ''];
  const code = w.charCodeAt(w.length - 1) - 0xac00;
  if (!(code >= 0 && code <= 11171)) return `${w}${withJong}(${noJong})`;
  const jong = code % 28;
  if (type === '으로') return w + (jong === 0 || jong === 8 ? '로' : '으로'); // ㄹ 받침은 '로'
  return w + (jong ? withJong : noJong);
}
