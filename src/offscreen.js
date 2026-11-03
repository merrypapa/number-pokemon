import * as THREE from 'three';

// 게임 본체 렌더러를 빌려 다른 장면을 렌더 타깃에 그리고, 픽셀을 2D 캔버스로 옮긴다 (도감 액자 그림 · 도감/교체 팝업의 360° 보기).
// 왜: 도감이 WebGL 렌더러(컨텍스트)를 따로 두 개 더 만들면, 컨텍스트마다 모델 텍스처를 다시 올려야 해서 메모리가 몇 배로 든다.
// 아이폰 사파리는 한도가 빡빡해 도감을 누르면 탭이 꺼졌다. 본체 컨텍스트는 텍스처가 이미 올라가 있어 추가 메모리가 거의 없다.
// 렌더 타깃은 선형으로 두고 읽은 뒤 sRGB 로 바꾼다 (iOS Safari 는 sRGB 렌더 타깃의 readPixels 를 거부한다 — portrait.js 와 같은 이유).
let renderer = null;
const targets = new Map(); // "w×h" → { target, px, img }
const toSRGB = new Uint8Array(256);
for (let i = 0; i < 256; i++) { const c = i / 255; toSRGB[i] = Math.round((c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055) * 255); }

export function setOffscreenRenderer(r) { renderer = r; }
export const hasOffscreen = () => !!renderer;

/** scene 을 camera 로 w×h 에 그려 ctx(2D) 의 (0,0) 에 놓는다. 픽셀을 못 읽었으면(전부 투명) false */
export function renderToCanvas(scene, camera, w, h, ctx) {
  if (!renderer) return false;
  const key = `${w}x${h}`;
  let t = targets.get(key);
  if (!t) {
    t = { target: new THREE.WebGLRenderTarget(w, h, { samples: 4 }), px: new Uint8Array(w * h * 4), img: ctx.createImageData(w, h) }; // samples: 가장자리 매끄럽게 (WebGL2)
    targets.set(key, t);
  }
  const prevTarget = renderer.getRenderTarget();
  const prevColor = new THREE.Color(); renderer.getClearColor(prevColor); const prevAlpha = renderer.getClearAlpha();
  const prevAuto = renderer.autoClear, prevTone = renderer.toneMapping, prevShadow = renderer.shadowMap.autoUpdate;
  renderer.setRenderTarget(t.target);
  renderer.setClearColor(0x000000, 0); renderer.autoClear = true; renderer.toneMapping = THREE.NoToneMapping; renderer.shadowMap.autoUpdate = false;
  renderer.clear();
  renderer.render(scene, camera);
  renderer.setRenderTarget(prevTarget); // 멀티샘플 타깃은 여기서 풀린다(resolve)
  renderer.readRenderTargetPixels(t.target, 0, 0, w, h, t.px);
  renderer.setClearColor(prevColor, prevAlpha); renderer.autoClear = prevAuto; renderer.toneMapping = prevTone; renderer.shadowMap.autoUpdate = prevShadow;
  const px = t.px, d = t.img.data;
  let any = false;
  for (let i = 3; i < px.length; i += 4 * 7) if (px[i]) { any = true; break; }
  if (!any) return false;
  const row = w * 4;
  for (let y = 0; y < h; y++) d.set(px.subarray((h - 1 - y) * row, (h - y) * row), y * row); // 위아래 뒤집기 (GL 은 아래가 0)
  for (let i = 0; i < d.length; i += 4) { const a = d[i + 3]; if (!a) continue; d[i] = toSRGB[d[i]]; d[i + 1] = toSRGB[d[i + 1]]; d[i + 2] = toSRGB[d[i + 2]]; }
  ctx.putImageData(t.img, 0, 0);
  return true;
}
