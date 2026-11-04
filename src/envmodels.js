import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { windMaterial } from './fx.js';

// 배경 3D 모델 (Quaternius Stylized Nature MegaKit, CC0): assets/models/env/*.glb
// 처음엔 도형으로 만든 나무·바위가 보이고, 모델이 다 받아지면 같은 자리에 모델로 바꿔 심는다 (못 받으면 도형 그대로).
// 모델은 발바닥 y=0 · 가운데 x/z=0 · 높이 1 로 맞춰 굽고(bake), 종류마다 InstancedMesh 하나씩으로 수백 그루를 한 번에 그린다.

const DIR = 'assets/models/env/';
const loader = new GLTFLoader();
const cache = new Map();

/** 모델 하나를 받아 높이 1 로 맞춘 조각들(지오메트리 + 재질)로 굽는다 */
function loadKit(name) {
  if (!cache.has(name)) {
    cache.set(name, loader.loadAsync(DIR + name + '.glb').then((gltf) => {
      const root = gltf.scene; root.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(root), size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3()), s = 1 / (size.y || 1);
      const parts = [];
      root.traverse((o) => {
        if (!o.isMesh) return;
        const geo = o.geometry.clone(); geo.applyMatrix4(o.matrixWorld); geo.translate(-c.x, -box.min.y, -c.z); geo.scale(s, s, s);
        geo.computeBoundingSphere();
        parts.push({ geo, mat: o.material });
      });
      return { parts, wide: Math.max(size.x, size.z) * s };
    }).catch((e) => { console.warn(`[env] ${name} 을(를) 불러오지 못해 도형을 씁니다.`, e?.message || e); return null; }));
  }
  return cache.get(name);
}

const LEAFY = /leaf|leaves|bush|fern|grass|flower/i;
function partMaterial(mat, wind) {
  const leafy = LEAFY.test(mat.name || '') || LEAFY.test(mat.map?.name || '') || mat.alphaTest > 0 || mat.transparent;
  if (leafy && !mat.userData.np) { mat.userData.np = true; mat.side = THREE.DoubleSide; mat.alphaTest = mat.alphaTest || 0.45; mat.transparent = false; mat.color.multiplyScalar(1.35); } /* 잎을 조금 밝게: 원래 텍스처가 어두워 도형 나무(밝은 초록) 사이에서 검게 보였다 */ // 잎 그림의 빈 곳은 잘라낸다 (반투명 정렬 문제 없이)
  return wind && leafy ? windMaterial(mat, { amp: wind, y0: 0.25, y1: 1, speed: 1.2 }) : mat;
}

/**
 * items 자리마다 variants 중 하나(item.v, 없으면 무작위)를 심는다.
 * item: { x, y, z, h(높이 m), ry?, w?(너비 m: 주면 너비로 맞춤) }
 * @returns Promise<{ meshes, slots } | null>  slots[i] = [메시 번호들, 그 메시 안의 인스턴스 번호]
 */
export async function plantModels(parent, items, variants, { wind = 0, shadow = true } = {}) {
  const kits = await Promise.all(variants.map(loadKit));
  if (kits.some((k) => !k)) return null; // 하나라도 없으면 통째로 도형 유지 (어색하게 섞이지 않게)
  const groups = kits.map(() => []);
  const slots = items.map((it) => { const v = it.v ?? Math.floor(Math.random() * kits.length); it.v = v; groups[v].push(it); return [v, groups[v].length - 1]; });
  const meshes = [], meshOfVariant = kits.map(() => []);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), sc = new THREE.Vector3();
  kits.forEach((kit, v) => {
    const list = groups[v]; if (!list.length) return;
    for (const part of kit.parts) {
      const mats = Array.isArray(part.mat) ? part.mat.map((m) => partMaterial(m, wind)) : partMaterial(part.mat, wind);
      const mesh = new THREE.InstancedMesh(part.geo, mats, list.length);
      list.forEach((it, j) => {
        const s = it.w ? it.w / (kit.wide || 1) : it.h;
        e.set(0, it.ry ?? Math.random() * Math.PI * 2, 0); q.setFromEuler(e); p.set(it.x, it.y, it.z); sc.set(s, it.w ? s : it.h, s);
        mesh.setMatrixAt(j, m4.compose(p, q, sc));
      });
      mesh.castShadow = shadow; mesh.receiveShadow = true; mesh.computeBoundingSphere();
      parent.add(mesh); meshOfVariant[v].push(meshes.length); meshes.push(mesh);
    }
  });
  return { meshes, slots: slots.map(([v, j]) => [meshOfVariant[v], j]) };
}

/** 아이폰·아이패드·안드로이드 (아이패드는 데스크톱 사파리처럼 보이므로 터치로 가린다) */
export const LOW_END = typeof navigator !== 'undefined' && (/iPhone|iPad|iPod|Android/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));

/**
 * 가까운 것만 모델로 (LOD). 멀리 있는 것은 원래 도형(proc)으로 그린다 — 안개에 묻혀 차이가 거의 안 보이고, 그리는 양은 몇 분의 일로 준다.
 * proc = { meshes, orig, parts(i) → [[a, b] (meshes 순서대로)] } : 도형 인스턴스 자리 (main 의 camTrees 와 같은 꼴)
 * 돌려주는 lod 의 update(x, z) 를 프레임마다 부르면 주인공이 몇 m 움직일 때마다 가까운 목록을 다시 짠다.
 * setHidden(i, h): 카메라를 가리는 나무 감추기 (도형·모델 둘 다)
 */
export async function lodModels(parent, items, variants, proc, { radius = 45, wind = 0, shadow = true } = {}) {
  const kits = await Promise.all(variants.map(loadKit));
  if (kits.some((k) => !k)) return null;
  const n = items.length, near = new Uint8Array(n), hidden = new Uint8Array(n), mats = [], vOf = new Int32Array(n), cap = kits.map(() => 0);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), sc = new THREE.Vector3();
  items.forEach((it, i) => {
    const v = it.v ?? Math.floor(Math.random() * kits.length); vOf[i] = v; cap[v]++;
    e.set(0, it.ry ?? Math.random() * Math.PI * 2, 0); q.setFromEuler(e); p.set(it.x, it.y, it.z); sc.set(it.h, it.h, it.h);
    mats.push(new THREE.Matrix4().compose(p, q, sc));
  });
  const meshesOf = kits.map((kit, v) => (cap[v] ? kit.parts.map((part) => {
    const mesh = new THREE.InstancedMesh(part.geo, Array.isArray(part.mat) ? part.mat.map((m) => partMaterial(m, wind)) : partMaterial(part.mat, wind), cap[v]);
    mesh.count = 0; mesh.castShadow = shadow; mesh.receiveShadow = true; mesh.frustumCulled = false; parent.add(mesh); return mesh;
  }) : []));
  const procShow = (i) => {
    const show = !near[i] && !hidden[i];
    proc.parts(i).forEach(([a, b], k) => { if (b <= a) return; const arr = proc.meshes[k].instanceMatrix.array; for (let j = a; j < b; j++) { if (show) arr.set(proc.orig[k].subarray(j * 16, j * 16 + 16), j * 16); else arr.fill(0, j * 16, j * 16 + 16); } proc.meshes[k].instanceMatrix.needsUpdate = true; });
  };
  const rebuild = () => {
    const used = kits.map(() => 0);
    for (let i = 0; i < n; i++) { if (!near[i] || hidden[i]) continue; const v = vOf[i], j = used[v]++; for (const mesh of meshesOf[v]) mesh.setMatrixAt(j, mats[i]); }
    meshesOf.forEach((ms, v) => ms.forEach((mesh) => { mesh.count = used[v]; mesh.instanceMatrix.needsUpdate = true; }));
  };
  let lx = Infinity, lz = Infinity;
  const lod = {
    update(x, z) {
      if (Math.hypot(x - lx, z - lz) < 2.5) return; lx = x; lz = z;
      let changed = false;
      for (let i = 0; i < n; i++) {
        const d = Math.hypot(items[i].x - x, items[i].z - z), nn = near[i] ? d < radius + 5 : d < radius; // 경계에서 깜빡이지 않게 5m 여유
        if (+nn !== near[i]) { near[i] = +nn; procShow(i); changed = true; }
      }
      if (changed) rebuild();
    },
    setHidden(i, h) { if (hidden[i] === +h) return; hidden[i] = +h; procShow(i); if (near[i]) rebuild(); },
    meshes: meshesOf.flat(),
  };
  return lod;
}
