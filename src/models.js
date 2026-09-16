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
const waiting = new Map();  // file -> [callback]  (아직 안 온 모델을 기다리는 쪽)
const easeOutBack = (t) => 1 + 2.7 * Math.pow(t - 1, 3) + 1.7 * Math.pow(t - 1, 2); // 살짝 튀어나왔다 자리 잡는 곡선

/** 모델이 준비되면 cb 를 부른다 (이미 준비됐으면 바로). 불러오기에 실패한 파일은 부르지 않는다. */
export function onModelLoaded(file, cb) {
  if (!file) return;
  if (loaded.has(file)) { if (loaded.get(file)) cb(); return; }
  if (!waiting.has(file)) waiting.set(file, []);
  waiting.get(file).push(cb);
}

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
        for (const cb of waiting.get(file) || []) cb();
      } catch (e) {
        loaded.set(file, null);
        console.warn(`[models] ${file} 을(를) 불러오지 못해 드래프트 도형을 씁니다.`, e?.message || e);
      }
      waiting.delete(file);
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

// idle / walk / run / swim 이름의 클립을 찾아 재생.
// 툴마다 클립 이름이 달라서(Mixamo 는 Running, Walking, Swim_Forward, restpose …) 별명으로도 찾아 준다.
// 하나도 안 맞으면 첫 번째 클립을 계속 돈다.
const ALIAS = {
  idle: ['idle', 'restpose', 'rest', 'stand', 'breathing'],
  walk: ['walk', 'walking'],
  run: ['run', 'running', 'jog', 'walk'],
  swim: ['swim_forward', 'swimming', 'swim'],      // 물속에서 앞으로 나아갈 때
  swimidle: ['swim_idle', 'tread', 'float', 'swim'], // 물속에서 가만히 떠 있을 때
};
const MATCH = [(n, c) => n === c, (n, c) => n.startsWith(c), (n, c) => n.includes(c)]; // 딱 맞는 이름 → 앞부분이 같은 이름 → 포함하는 이름 순

// 제자리(In Place) 애니가 아니면 캐릭터가 게임 좌표와 따로 앞으로 밀려나가 보인다.
// 뼈의 x/z 가 그 뼈 높이의 20% 넘게 움직이면 걸음의 흔들림이 아니라 "이동"이므로 첫 프레임 값으로 고정한다.
// (걷기·달리기의 자연스러운 좌우 흔들림은 그대로 둔다. 같은 클립에 두 번 해도 결과는 같다)
function stripRootMotion(clip) {
  for (const track of clip.tracks) {
    if (!track.name.endsWith('.position')) continue;
    const v = track.values, n = v.length / 3;
    if (n < 2) continue;
    const ref = Math.abs(v[1]) || 1; // 첫 프레임 높이를 이 모델의 크기 기준으로 삼는다
    for (const axis of [0, 2]) {
      let lo = Infinity, hi = -Infinity;
      for (let i = 0; i < n; i++) { const x = v[i * 3 + axis]; if (x < lo) lo = x; if (x > hi) hi = x; }
      if (hi - lo <= ref * 0.2) continue;
      for (let i = 1; i < n; i++) v[i * 3 + axis] = v[axis];
    }
  }
}

class ModelAnim {
  constructor(root, clips) {
    this.mixer = new THREE.AnimationMixer(root);
    this.actions = {};
    this.names = [];
    for (const clip of clips) {
      stripRootMotion(clip);
      const key = clip.name.toLowerCase();
      this.actions[key] = this.mixer.clipAction(clip);
      this.names.push(key);
    }
    this.found = {};   // 'walk' → 이 모델이 실제로 가진 클립 이름 (한 번 찾으면 기억한다)
    this.first = this.names[0];
    this.current = null;
    this.play('idle');
  }
  /** 원하는 동작 이름을 이 모델에 있는 클립 이름으로 바꿔 준다 */
  find(name) {
    if (name in this.found) return this.found[name];
    let hit = null;
    for (const test of MATCH) {
      for (const cand of ALIAS[name] || [name]) {
        hit = this.names.find((n) => test(n, cand));
        if (hit) break;
      }
      if (hit) break;
    }
    return (this.found[name] = hit || this.first);
  }
  play(name) {
    const key = this.find(name);
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
 * 모델이 이미 준비돼 있으면 바로 바꾸고 true. 아직 받는 중이면 도착했을 때 "뿅" 하고 바꾼다(false).
 * 실패한 파일이면 드래프트가 그대로 남는다.
 */
export function swapDraftWithModel(group, file, { scale = 1, onSwap } = {}) {
  if (!file) return false;
  const doSwap = (pop) => {
    const model = instantiate(file);
    if (!model) return;
    if (group.userData.draft) group.remove(group.userData.draft);
    model.userData.targetScale = scale;
    model.userData.popT = pop ? 0 : 1;
    model.scale.setScalar(pop ? 0.001 : scale);
    group.add(model);
    group.userData.model = model;
    onSwap?.(model);
  };
  if (hasModel(file)) { doSwap(false); return true; }
  onModelLoaded(file, () => { if (!group.userData.model) doSwap(true); });
  return false;
}

/** 모델 애니메이션 + 늦게 도착한 모델의 등장 연출 갱신 (모델이 아니면 아무것도 안 함) */
export function tickModel(group, dt, clipName) {
  const model = group.userData.model;
  if (!model) return;
  const u = model.userData;
  if (u.popT < 1) {
    u.popT = Math.min(1, u.popT + dt / 0.5);
    model.scale.setScalar(u.targetScale * Math.max(0.001, easeOutBack(u.popT)));
  }
  if (!u.anim) return;
  if (clipName) u.anim.play(clipName);
  u.anim.update(dt);
}
