import * as THREE from 'three';
import { clone as skeletonClone } from 'three/addons/utils/SkeletonUtils.js';

// 말풍선용 얼굴 그림: 3D 오브젝트(NPC·포켓몬)를 정면에서 머리 위주로 작게 그려 데이터 URL 로 만든다.
// 오브젝트를 복제해서 별도 장면에 그리므로 게임 장면은 건드리지 않는다. key 별로 캐시한다.
let renderer = null, scene = null, camera = null;
const cache = new Map();

function ensure() {
  if (renderer) return true;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setSize(128, 128);
    scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xffffff, 0xaaaaaa, 1.7));
    const sun = new THREE.DirectionalLight(0xffffff, 1.2);
    sun.position.set(1.5, 3, 4);
    scene.add(sun);
    camera = new THREE.PerspectiveCamera(28, 1, 0.05, 50);
    return true;
  } catch (_) { return false; }
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
  renderer.render(scene, camera);
  const url = renderer.domElement.toDataURL();
  scene.remove(clone);
  if (key) cache.set(key, url);
  return url;
}
