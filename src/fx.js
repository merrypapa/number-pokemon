import * as THREE from 'three';

// 그래픽 효과: 출렁이는 물 셰이더 + 바람에 흔들리는 나무·풀.
// 기존 MeshStandardMaterial 에 셰이더 조각을 끼워 넣는 방식(onBeforeCompile)이라 빛·그림자·안개는 그대로 쓴다.
// 시간은 main 의 프레임마다 tickFx(t) 로 한 번만 올린다 (모든 물·바람 재질이 같은 시계를 본다).

const uTime = { value: 0 };
export function tickFx(t) { uTime.value = t; }

/**
 * 물 재질: 물결 무늬로 법선을 흔들어 빛이 반짝이며 일렁이고, 밝은 물결 줄무늬가 천천히 흐른다.
 * @param params MeshStandardMaterial 옵션 (color·opacity …)
 * @param o.scale 물결 크기 (클수록 잔물결), o.strength 일렁임 세기, o.shine 물결 줄무늬 밝기, o.speed 흐름 빠르기
 */
export function waterMaterial(params, { scale = 0.35, strength = 0.45, shine = 0.18, speed = 1 } = {}) {
  const mat = new THREE.MeshStandardMaterial(params);
  const u = { uWScale: { value: scale }, uWStrength: { value: strength }, uWShine: { value: shine }, uWSpeed: { value: speed } };
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u, { uTime });
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nuniform float uTime, uWScale, uWStrength, uWShine, uWSpeed;')
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
      {
        vec2 p = vWPos.xz * uWScale; float t = uTime * uWSpeed;
        vec3 wn = vec3(
          sin(p.x * 1.3 + t * 1.1) * 0.5 + sin(p.y * 1.7 - t * 0.9 + p.x * 0.4) * 0.35 + sin((p.x + p.y) * 2.9 + t * 1.7) * 0.15,
          0.0,
          cos(p.y * 1.1 + t * 0.8) * 0.5 + cos(p.x * 1.9 + t * 1.3 - p.y * 0.3) * 0.35 + cos((p.x - p.y) * 3.1 - t * 1.5) * 0.15);
        normal = normalize(normal + (viewMatrix * vec4(wn * uWStrength, 0.0)).xyz);
      }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
      {
        vec2 p = vWPos.xz * uWScale * 1.6; float t = uTime * uWSpeed;
        float c = sin(p.x * 2.1 + sin(p.y * 1.3 + t * 0.7) * 1.4 + t * 0.9) * sin(p.y * 2.4 + sin(p.x * 1.1 - t * 0.6) * 1.4 - t * 0.8);
        diffuseColor.rgb += vec3(uWShine) * pow(max(0.0, c), 6.0); /* 물결 꼭대기에 밝은 줄 (햇빛 그물무늬) */
      }`);
  };
  mat.customProgramCacheKey = () => 'np-water';
  return mat;
}

/**
 * 바람 재질: 정점을 바람 방향으로 흔든다. 인스턴스(나무 수백 그루)마다 자리에 따라 흔들리는 박자가 다르다.
 * 지오메트리 자체 높이(y)가 y0 → y1 로 갈수록 더 흔들린다 (풀잎 끝이 가장 많이). y0 ≥ y1 이면 통째로 흔들린다(나무 잎 덩어리).
 * @param base 복제할 재질 (WHITE_MAT 처럼 여러 곳에서 같이 쓰는 재질도 원본은 그대로 둔다)
 */
export function windMaterial(base, { amp = 0.08, y0 = 0, y1 = 0, speed = 1.3 } = {}) {
  const mat = base.clone();
  const u = { uWAmp: { value: amp }, uWY0: { value: y0 }, uWY1: { value: y1 }, uWSpd: { value: speed } };
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u, { uTime });
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime, uWAmp, uWY0, uWY1, uWSpd;')
      .replace('#include <project_vertex>', `
      vec4 mvPosition = vec4(transformed, 1.0);
      #ifdef USE_BATCHING
        mvPosition = batchingMatrix * mvPosition;
      #endif
      #ifdef USE_INSTANCING
        mvPosition = instanceMatrix * mvPosition;
        vec3 wOrigin = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
      #else
        vec3 wOrigin = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
      #endif
      vec4 wPos = modelMatrix * mvPosition;
      float wk = uWY1 > uWY0 ? smoothstep(uWY0, uWY1, position.y) : 1.0;
      float ph = wOrigin.x * 0.21 + wOrigin.z * 0.17, tt = uTime * uWSpd;
      float gust = 0.65 + 0.35 * sin(tt * 0.31 + wOrigin.x * 0.02); /* 바람이 셌다 약했다 */
      wPos.x += (sin(tt + ph) * 0.8 + sin(tt * 2.3 + ph * 1.7) * 0.2) * uWAmp * wk * gust;
      wPos.z += (cos(tt * 0.8 + ph * 1.3) * 0.5) * uWAmp * wk * gust;
      mvPosition = viewMatrix * wPos;
      gl_Position = projectionMatrix * mvPosition;`);
  };
  mat.customProgramCacheKey = () => `np-wind-${y1 > y0 ? 'tip' : 'all'}`;
  return mat;
}
