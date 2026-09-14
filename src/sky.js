import * as THREE from 'three';

// 하늘과 환경광. 지역마다 색만 바꿔 쓴다.
//  - 배경: 단색 대신 위아래로 이어지는 그라데이션 하늘 (해가 있는 쪽이 밝다)
//  - 환경맵(scene.environment): 그 하늘을 흐릿하게 구워 물체에 은은히 비친다.
//    이게 있으면 무광 플라스틱처럼 보이던 재질이 주변 빛을 받아 훨씬 자연스러워진다.
// 파일을 받지 않고 캔버스로 직접 그려 만들기 때문에 용량이 늘지 않는다.

/** 지역별 하늘: [위, 가운데, 아래] 색과 해의 색·높이 */
export const SKIES = {
  forest:  { top: '#3d8fe0', mid: '#8fd3ff', bot: '#dff3ff', sun: '#fff6d8', sunY: 0.3, sunSize: 0.2 },
  cave:    { top: '#04060b', mid: '#0a1018', bot: '#141c26', sun: '#2a3a52', sunY: 0.1, sunSize: 0.5 },
  volcano: { top: '#1a0c0a', mid: '#4a1f16', bot: '#8c3a1c', sun: '#ffb066', sunY: -0.1, sunSize: 0.35 },
  sea:     { top: '#2f86d6', mid: '#9fe3ff', bot: '#e6f8ff', sun: '#fff6d8', sunY: 0.28, sunSize: 0.22 },
  space:   { top: '#05040f', mid: '#0b0820', bot: '#1a1038', sun: '#b98cff', sunY: 0.2, sunSize: 0.45, stars: 260 },
  lab:     { top: '#151b28', mid: '#1b2230', bot: '#262f40', sun: '#3a4a60', sunY: 0, sunSize: 0.5 },
};

/** 위아래 그라데이션 + 해 무리(+우주는 별)를 그린 파노라마 텍스처 */
function skyTexture(s) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 256;
  const x = c.getContext('2d');
  const grad = x.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, s.top); grad.addColorStop(0.52, s.mid); grad.addColorStop(1, s.bot);
  x.fillStyle = grad; x.fillRect(0, 0, 512, 256);
  if (s.stars) { // 우주: 작은 별을 뿌린다
    x.fillStyle = '#ffffff';
    for (let i = 0; i < s.stars; i++) {
      const sx = Math.random() * 512, sy = Math.random() * 150, r = Math.random() * 1.3 + 0.3;
      x.globalAlpha = 0.35 + Math.random() * 0.65;
      x.beginPath(); x.arc(sx, sy, r, 0, Math.PI * 2); x.fill();
    }
    x.globalAlpha = 1;
  }
  const sy = 128 - s.sunY * 128;                       // 해(또는 큰 광원)의 무리
  const halo = x.createRadialGradient(300, sy, 0, 300, sy, 256 * s.sunSize);
  halo.addColorStop(0, s.sun); halo.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = halo; x.fillRect(0, 0, 512, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.mapping = THREE.EquirectangularReflectionMapping;
  return tex;
}

/**
 * 지역 장면에 그라데이션 하늘과 환경광을 넣는다.
 * @param renderer 환경맵을 굽는 데 쓴다 (한 번만 굽고 텍스처만 남긴다)
 * @param intensity 환경광 세기 (어두운 지역은 작게)
 */
export function applySky(scene, renderer, zoneName, { intensity = 1 } = {}) {
  const s = SKIES[zoneName] || SKIES.forest;
  const tex = skyTexture(s);
  scene.background = tex;
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  const env = pmrem.fromEquirectangular(tex).texture;
  scene.environment = env;
  scene.environmentIntensity = intensity;             // three r163+: 환경광 세기
  pmrem.dispose();
  return { sky: tex, env };
}
