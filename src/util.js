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
