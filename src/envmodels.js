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
  if (leafy) { mat.side = THREE.DoubleSide; mat.alphaTest = mat.alphaTest || 0.45; mat.transparent = false; } // 잎 그림의 빈 곳은 잘라낸다 (반투명 정렬 문제 없이)
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
