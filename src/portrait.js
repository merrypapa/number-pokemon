import * as THREE from 'three';
import { clone as skeletonClone } from 'three/addons/utils/SkeletonUtils.js';

// 말풍선용 얼굴 그림: 3D 오브젝트(NPC·포켓몬)를 정면에서 머리 위주로 작게 그려 데이터 URL 로 만든다.
// 오브젝트를 복제해서 별도 장면에 그리므로 게임 장면은 건드리지 않는다. key 별로 캐시한다.
// 그리기는 게임 본체의 렌더러(setPortraitRenderer)로 작은 렌더 타깃에 한다. 도감·3D 화면이 WebGL 컨텍스트를 여럿 만들면
// 브라우저가 가장 오래된 컨텍스트를 끊어 버려서, 따로 만든 얼굴용 컨텍스트로 그리면 어느 순간부터 얼굴이 빈 그림이 됐다.
// 본체 렌더러가 없을 때만 예비로 따로 만든다(끊기면 버리고 다시 만든다).
const SIZE = 128;
let renderer = null, own = null, scene = null, camera = null, target = null, canvas2d = null;
const cache = new Map();

/** 게임 본체 렌더러를 빌려 쓴다 (main 에서 한 번) */
export function setPortraitRenderer(r) { renderer = r; cache.clear(); }

function ensureScene() {
  if (scene) return;
  scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0xaaaaaa, 1.7));
  const sun = new THREE.DirectionalLight(0xffffff, 1.2);
  sun.position.set(1.5, 3, 4);
  scene.add(sun);
  camera = new THREE.PerspectiveCamera(28, 1, 0.05, 50);
}
function ensure() { ensureScene(); return true; } // 본체 렌더러가 없거나 픽셀을 못 읽으면 drawWithOwn 이 예비 렌더러를 만든다
/** 본체 렌더러로 렌더 타깃에 그린 뒤 2D 캔버스로 옮겨 데이터 URL 을 만든다 */
// 렌더 타깃은 sRGB 가 아니라 선형으로 두고 픽셀을 읽은 뒤 여기서 sRGB 로 바꾼다.
// (iOS Safari 는 sRGB 렌더 타깃의 readPixels 를 거부해 픽셀이 전부 0 → 얼굴이 빈 그림이 됐다)
const toSRGB = new Uint8Array(256);
for (let i = 0; i < 256; i++) { const c = i / 255; toSRGB[i] = Math.round((c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055) * 255); }
function drawWithMain() {
  if (!target) {
    target = new THREE.WebGLRenderTarget(SIZE, SIZE);
    canvas2d = document.createElement('canvas'); canvas2d.width = SIZE; canvas2d.height = SIZE;
  }
  const prevTarget = renderer.getRenderTarget();
  const prevColor = new THREE.Color(); renderer.getClearColor(prevColor); const prevAlpha = renderer.getClearAlpha();
  const prevAuto = renderer.autoClear, prevTone = renderer.toneMapping;
  renderer.setRenderTarget(target);
  renderer.setClearColor(0x000000, 0); renderer.autoClear = true; renderer.toneMapping = THREE.NoToneMapping;
  renderer.clear();
  renderer.render(scene, camera);
  const px = new Uint8Array(SIZE * SIZE * 4);
  renderer.readRenderTargetPixels(target, 0, 0, SIZE, SIZE, px);
  renderer.setRenderTarget(prevTarget); renderer.setClearColor(prevColor, prevAlpha); renderer.autoClear = prevAuto; renderer.toneMapping = prevTone;
  let any = false;
  for (let i = 3; i < px.length; i += 4) if (px[i]) { any = true; break; }
  if (!any) return null; // 픽셀을 못 읽었다(전부 투명) → 호출한 쪽이 예비 렌더러로 다시 그린다
  const ctx = canvas2d.getContext('2d');
  const img = ctx.createImageData(SIZE, SIZE);
  for (let y = 0; y < SIZE; y++) img.data.set(px.subarray((SIZE - 1 - y) * SIZE * 4, (SIZE - y) * SIZE * 4), y * SIZE * 4); // 위아래 뒤집기 (GL 은 아래가 0)
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) { d[i] = toSRGB[d[i]]; d[i + 1] = toSRGB[d[i + 1]]; d[i + 2] = toSRGB[d[i + 2]]; }
  ctx.putImageData(img, 0, 0);
  return canvas2d.toDataURL();
}
/** 예비: 따로 만든 작은 렌더러로 그린다 (본체 렌더러로 픽셀을 못 읽을 때) */
function drawWithOwn() {
  if (!own) {
    try {
      own = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
      own.setSize(SIZE, SIZE);
      own.domElement.addEventListener('webglcontextlost', (e) => { e.preventDefault(); own.dispose(); own = null; cache.clear(); }, false);
    } catch (_) { return null; }
  }
  own.render(scene, camera);
  return own.domElement.toDataURL();
}

/**
 * @param {THREE.Object3D} obj 원본 (복제해서 그린다)
 * @param {string} key 캐시 키 (모델이 나중에 바뀌면 다른 키를 주면 된다)
 * @param {{ head?: number }} opts head: 0~1, 어느 높이를 가운데에 둘지 (기본 0.78 = 머리)
 */
export function portrait(obj, key, { head = 0.86, zoom = 0.19 } = {}) {
  if (key && cache.has(key)) return cache.get(key);
  if (!ensure()) return null;
  const clone = skeletonClone(obj); // 뼈가 있는 모델도 제자리에서 그려지게 (Object3D.clone 은 원본 뼈를 같이 써서 엉뚱한 곳에 그려진다)
  clone.position.set(0, 0, 0); clone.rotation.set(0, 0, 0); clone.scale.setScalar(1);
  const strip = []; // 이름표(스프라이트)·조명은 크기 계산에 끼지 않게 떼어낸다
  clone.traverse((o) => {
    if (o.isSprite || o.isLight) strip.push(o);
    if (o.userData.targetScale && o.userData.popT < 1) o.scale.setScalar(o.userData.targetScale); // 아직 '뿅' 하고 커지는 중이면 다 커진 크기로
  });
  for (const o of strip) o.parent?.remove(o);
  scene.add(clone);
  clone.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(clone);
  const size = box.getSize(new THREE.Vector3()), center = box.getCenter(new THREE.Vector3());
  const focusY = box.min.y + size.y * head;
  const r = Math.max(size.x * 0.3, size.y * zoom, 0.25); // 머리 주변만 보이게 (얼굴이 크게)
  const dist = r / Math.tan(THREE.MathUtils.degToRad(14)) + r;
  camera.position.set(center.x + dist * 0.12, focusY + r * 0.1, center.z + dist); // 정면(+Z)에서 살짝 위·옆
  camera.lookAt(center.x, focusY, center.z);
  let url = null;
  try { if (renderer) url = drawWithMain(); } catch (_) { url = null; }
  if (!url) { try { url = drawWithOwn(); } catch (_) { url = null; } }
  scene.remove(clone);
  if (key && url) cache.set(key, url);
  return url;
}
