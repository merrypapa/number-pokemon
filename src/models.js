import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as skeletonClone } from 'three/addons/utils/SkeletonUtils.js';

// assets/models/ 안의 .glb 파일을 불러와 드래프트 도형 대신 쓰는 모듈.
// - preloadModels(files): 게임 시작 전에 한 번에 받아 둔다. 없는 파일(404)은 조용히 건너뛴다.
// - instantiate(file): 받아 둔 모델을 복제해서 돌려준다 (없으면 null → 드래프트 도형 유지).
// 규격: 발바닥 원점, 앞 +Z(이 게임의 드래프트 캐릭터와 같은 방향), 높이 약 1m. 크기가 달라도 여기서 높이 1m 로 자동 보정한다.

const MODEL_DIR = 'assets/models/';
const loader = new GLTFLoader();
const loaded = new Map();   // file -> { scene, animations } | null

export function preloadModels(files, onProgress) {
  const list = [...new Set(files.filter(Boolean))];
  let done = 0;
  onProgress?.(0, list.length);
  return Promise.all(list.map(async (file) => {
    if (!loaded.has(file)) {
      try {
        const gltf = await loader.loadAsync(MODEL_DIR + file);
        normalize(gltf.scene);
        loaded.set(file, { scene: gltf.scene, animations: gltf.animations || [] });
        console.info(`[models] ${file} 불러옴`);
      } catch (e) {
        loaded.set(file, null);
        console.warn(`[models] ${file} 을(를) 불러오지 못해 드래프트 도형을 씁니다.`, e?.message || e);
      }
    }
    onProgress?.(++done, list.length);
  }));
}

export function hasModel(file) { return !!(file && loaded.get(file)); }

// 발바닥이 y=0, 가운데가 x/z=0, 높이 1m 가 되도록 맞춘다.
function normalize(root) {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  if (box.isEmpty()) return;
  const size = box.getSize(new THREE.Vector3());
  const s = size.y > 0 ? 1 / size.y : 1;
  root.scale.multiplyScalar(s);
  root.updateMatrixWorld(true);
  box.setFromObject(root);
  const c = box.getCenter(new THREE.Vector3());
  root.position.x -= c.x;
  root.position.z -= c.z;
  root.position.y -= box.min.y;
  root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; o.frustumCulled = false; } });
}

/** 받아 둔 모델의 복제본. 애니메이션이 있으면 group.userData.anim 으로 재생기를 붙인다. */
export function instantiate(file) {
  const entry = file && loaded.get(file);
  if (!entry) return null;
  const obj = skeletonClone(entry.scene);
  const wrap = new THREE.Group();
  wrap.add(obj);
  wrap.userData.isModel = true;
  if (entry.animations.length) wrap.userData.anim = new ModelAnim(obj, entry.animations);
  return wrap;
}

// idle / walk / happy 이름의 클립을 찾아 재생. 이름이 없으면 첫 번째 클립을 계속 돈다.
class ModelAnim {
  constructor(root, clips) {
    this.mixer = new THREE.AnimationMixer(root);
    this.actions = {};
    for (const clip of clips) this.actions[clip.name.toLowerCase()] = this.mixer.clipAction(clip);
    this.first = clips[0]?.name.toLowerCase();
    this.current = null;
    this.play('idle');
  }
  play(name) {
    const key = this.actions[name] ? name : this.first;
    if (!key || key === this.current) return;
    const next = this.actions[key];
    if (this.current) this.actions[this.current].fadeOut(0.2);
    next.reset().fadeIn(0.2).play();
    this.current = key;
  }
  update(dt) { this.mixer.update(dt); }
}

/**
 * group 의 드래프트 도형(group.userData.draft)을 모델로 바꾼다.
 * 모델이 없으면 아무것도 하지 않고 false 를 돌려준다.
 */
export function swapDraftWithModel(group, file) {
  const model = instantiate(file);
  if (!model) return false;
  if (group.userData.draft) group.remove(group.userData.draft);
  group.add(model);
  group.userData.model = model;
  return true;
}

/** 모델 애니메이션 갱신 (모델이 아니면 아무것도 안 함) */
export function tickModel(group, dt, clipName) {
  const anim = group.userData.model?.userData.anim;
  if (!anim) return;
  if (clipName) anim.play(clipName);
  anim.update(dt);
}
