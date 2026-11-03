import * as THREE from 'three';

// 그래픽 1단계: 하늘 그라데이션 + 환경 조명(IBL).
// 지역마다 정해 둔 하늘색(scene.background)·안개색에서 위(짙은 하늘) → 지평선(밝은 안개) → 아래(땅빛)로 이어지는 세로 그라데이션을 만들어
//  - 바깥 지역은 그걸 하늘로 쓰고 (평평한 한 색 하늘 대신),
//  - 모든 지역에서 그 하늘빛을 환경 조명으로 쓴다 (PMREM). 빛을 받지 않는 그늘 쪽도 하늘색이 은은하게 비쳐 모양이 입체적으로 보인다.
// 텍스처가 아니라 8×256 그림 하나라서 메모리는 거의 들지 않는다. 지역마다 한 번만 만든다 (zone.skyEnv).
let pmrem = null;

export function setupSky(renderer, zone) {
  if (zone.skyEnv !== undefined) return;
  const scene = zone.scene, w = zone.world || {};
  const bg = scene.background && scene.background.isColor ? scene.background.clone() : null;
  if (!bg) { zone.skyEnv = null; return; }
  const fogC = scene.fog?.color ? scene.fog.color.clone() : bg.clone();
  const hsl = {}; bg.getHSL(hsl);
  const indoor = !!w.indoor, dark = !!w.dark || indoor || hsl.l < 0.25;
  let top, mid, hor, low;
  if (dark) { // 동굴·우주·실내: 어두운 색 안에서만 살짝 밝기 차이
    top = bg.clone().multiplyScalar(0.6); mid = bg.clone(); hor = fogC.clone().lerp(bg, 0.4).multiplyScalar(1.25); low = bg.clone().multiplyScalar(0.75);
  } else { // 밝은 하늘: 위는 짙은 파랑, 지평선은 하얗게 번지는 안개
    top = bg.clone().lerp(new THREE.Color(0x3a74d0), 0.55); mid = bg.clone(); hor = fogC.clone().lerp(new THREE.Color(0xffffff), 0.35); low = fogC.clone().multiplyScalar(0.92);
  }
  const c = document.createElement('canvas'); c.width = 8; c.height = 256;
  const g = c.getContext('2d'), grad = g.createLinearGradient(0, 0, 0, 256);
  const css = (col) => `#${col.getHexString()}`;
  grad.addColorStop(0, css(top)); grad.addColorStop(0.36, css(mid)); grad.addColorStop(0.49, css(hor)); grad.addColorStop(0.53, css(low)); grad.addColorStop(1, css(low.clone().multiplyScalar(0.8)));
  g.fillStyle = grad; g.fillRect(0, 0, 8, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.mapping = THREE.EquirectangularReflectionMapping; tex.colorSpace = THREE.SRGBColorSpace;
  if (!indoor) scene.background = tex; // 실내는 벽에 가려 하늘이 안 보이니 그대로 둔다
  try {
    pmrem ||= new THREE.PMREMGenerator(renderer);
    const env = pmrem.fromEquirectangular(tex).texture;
    scene.environment = env;
    scene.environmentIntensity = dark ? 0.3 : 0.4;
    zone.skyEnv = env;
  } catch (_) { zone.skyEnv = null; } // 환경 조명을 못 만드는 기기면 하늘 그라데이션만
}
