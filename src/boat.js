import * as THREE from 'three';

// 모험용 돛단배 (원피스 "고잉 메리호" 느낌의 카라벨).
// 상자를 쌓지 않고 선체를 곡면으로 짓는다: 길이 방향으로 단면(station)을 늘어놓고 서로 이어 붙인다(로프팅).
// 뱃머리는 +x 방향. 갑판 높이는 DECK_Y (주인공이 이 위에 선다).

export const DECK_Y = 1.15;     // 갑판 높이 (배 원점 = 수면)
const LEN = 8.2;                // 뱃머리~선미 길이
const BEAM = 1.62;              // 가장 넓은 곳의 반폭
const STATIONS = 26;            // 단면 개수 (많을수록 매끈)
const RIB = 14;                 // 단면 하나의 점 개수

/** t: 0(선미) → 1(뱃머리). 그 자리의 반폭 */
function beamAt(t) {
  if (t < 0.16) return BEAM * (0.66 + (t / 0.16) * 0.3);                    // 둥근 선미
  if (t < 0.66) return BEAM * (0.96 + Math.sin(((t - 0.16) / 0.5) * Math.PI) * 0.04); // 가장 넓은 중앙
  return BEAM * Math.max(0.03, Math.pow(1 - (t - 0.66) / 0.34, 0.72));      // 뾰족하게 모이는 뱃머리
}
/** 그 자리의 배 밑바닥 높이 (가운데가 가장 깊다) */
function keelAt(t) { return -0.62 + Math.pow(Math.abs(t - 0.46) / 0.54, 2.3) * 0.45; }
/** 그 자리의 뱃전(윗선) 높이 — 앞뒤가 들리는 시어 라인 */
function sheerAt(t) { return DECK_Y + 0.26 + Math.pow(Math.abs(t - 0.46) / 0.54, 2.8) * 0.5; }

/** 단면 위의 점 (u: -1 좌현 → +1 우현) */
function ribPoint(t, u) {
  const b = beamAt(t), k = keelAt(t), sh = sheerAt(t);
  const x = -LEN / 2 + LEN * t;
  const z = b * u;
  const y = k + (sh - k) * Math.pow(Math.abs(u), 1.55);
  return [x, y, z];
}

/** 단면들을 이어 붙여 선체 겉면을 만든다 */
function buildHullGeometry() {
  const pos = [], idx = [];
  for (let i = 0; i < STATIONS; i++) {
    const t = i / (STATIONS - 1);
    for (let j = 0; j < RIB; j++) {
      const u = -1 + (2 * j) / (RIB - 1);
      pos.push(...ribPoint(t, u));
    }
  }
  for (let i = 0; i < STATIONS - 1; i++) {
    for (let j = 0; j < RIB - 1; j++) {
      const a = i * RIB + j, b = a + 1, c = a + RIB, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  // 선미를 판자로 막는다 (부채꼴)
  const center = pos.length / 3;
  pos.push(-LEN / 2, (keelAt(0) + sheerAt(0)) / 2, 0);
  for (let j = 0; j < RIB - 1; j++) idx.push(center, j + 1, j);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** 갑판: 뱃전 안쪽을 덮는 평평한 바닥 */
function buildDeckGeometry() {
  const pos = [], idx = [];
  for (let i = 0; i < STATIONS; i++) {
    const t = i / (STATIONS - 1);
    const x = -LEN / 2 + LEN * t, b = beamAt(t) * 0.93;
    pos.push(x, DECK_Y, -b, x, DECK_Y, b);
  }
  for (let i = 0; i < STATIONS - 1; i++) {
    const a = i * 2;
    idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** 뱃전을 따라 도는 띠 (선체와 갑판 사이의 굵은 테두리) */
function buildRailGeometry(yOff, thick) {
  const pos = [], idx = [];
  for (let i = 0; i < STATIONS; i++) {
    const t = i / (STATIONS - 1);
    const x = -LEN / 2 + LEN * t, b = beamAt(t), y = sheerAt(t) + yOff;
    for (const side of [-1, 1]) pos.push(x, y, b * side, x, y - thick, b * side);
  }
  for (let i = 0; i < STATIONS - 1; i++) {
    const a = i * 4;
    idx.push(a, a + 4, a + 1, a + 1, a + 4, a + 5);       // 좌현
    idx.push(a + 2, a + 3, a + 6, a + 3, a + 7, a + 6);   // 우현
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** 돛 그림: 흰 천에 넘버볼 문장 */
function sailTexture() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 256;
  const x = c.getContext('2d');
  x.fillStyle = '#f7f4ea'; x.fillRect(0, 0, 256, 256);
  x.strokeStyle = '#e8453c'; x.lineWidth = 16;
  x.strokeRect(8, 8, 240, 240);
  x.fillStyle = '#e8453c';
  x.beginPath(); x.arc(128, 128, 62, Math.PI, 0); x.fill();     // 넘버볼 윗면
  x.fillStyle = '#f4f4f8';
  x.beginPath(); x.arc(128, 128, 62, 0, Math.PI); x.fill();     // 아랫면
  x.fillStyle = '#20232e'; x.fillRect(66, 120, 124, 16);        // 가운데 띠
  x.beginPath(); x.arc(128, 128, 22, 0, Math.PI * 2); x.fill();
  x.fillStyle = '#ffffff';
  x.beginPath(); x.arc(128, 128, 13, 0, Math.PI * 2); x.fill();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** 뱃머리 장식: 웃는 양 머리 (고잉 메리호처럼) */
function buildFigurehead() {
  const g = new THREE.Group();
  const wool = new THREE.MeshStandardMaterial({ color: 0xfaf6e8, roughness: 0.95 });
  const face = new THREE.MeshStandardMaterial({ color: 0xf2d9b8, roughness: 0.8 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x20232e });
  const horn = new THREE.MeshStandardMaterial({ color: 0xe0c48a, roughness: 0.7 });
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.6, 18, 14), wool);
  head.scale.set(1.0, 0.98, 0.92);
  const snout = new THREE.Mesh(new THREE.SphereGeometry(0.34, 14, 12), face);
  snout.position.set(0.56, -0.12, 0); snout.scale.set(1.25, 0.9, 0.95);
  for (const side of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 8), face);
    ear.position.set(-0.02, 0.14, side * 0.62); ear.scale.set(0.7, 0.5, 1.5);
    ear.rotation.x = side * 0.3;
    const hornM = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.09, 8, 16, Math.PI * 1.5), horn);
    hornM.position.set(-0.06, 0.38, side * 0.44);
    hornM.rotation.set(Math.PI / 2, 0, side * 0.5);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.105, 10, 8), dark);
    eye.position.set(0.68, 0.13, side * 0.26); // 눈은 주둥이 위쪽(털 바깥)이라 옆에서도 보인다
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 6), dark);
    nose.position.set(0.95, -0.06, side * 0.1);
    g.add(ear, hornM, eye, nose);
  }
  const smile = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.033, 6, 14, Math.PI), dark);
  smile.position.set(0.87, -0.24, 0);
  smile.rotation.set(0, Math.PI / 2, Math.PI);
  g.add(head, snout, smile);
  return g;
}

/**
 * 모험용 돛단배를 만든다. 뱃머리는 +x, 갑판은 y = DECK_Y.
 * 돌려주는 것: { group, deckY, animate(t, sailing) }
 */
export function buildShip() {
  const ship = new THREE.Group();
  const hullMat = new THREE.MeshStandardMaterial({ color: 0xe0964a, roughness: 0.85, side: THREE.DoubleSide });
  const trimMat = new THREE.MeshStandardMaterial({ color: 0x8a4a24, roughness: 0.85, side: THREE.DoubleSide });
  const deckMat = new THREE.MeshStandardMaterial({ color: 0xe9c38d, roughness: 0.9, side: THREE.DoubleSide });
  const whiteMat = new THREE.MeshStandardMaterial({ color: 0xf7f4ea, roughness: 0.8 });
  const greenMat = new THREE.MeshStandardMaterial({ color: 0x2f9e6e, roughness: 0.8 });
  const mastMat = new THREE.MeshStandardMaterial({ color: 0xa9743f, roughness: 0.8 });

  const hull = new THREE.Mesh(buildHullGeometry(), hullMat);
  hull.castShadow = true;
  const deck = new THREE.Mesh(buildDeckGeometry(), deckMat);
  const rail = new THREE.Mesh(buildRailGeometry(0, 0.16), trimMat);      // 뱃전 굵은 테두리
  const stripe = new THREE.Mesh(buildRailGeometry(-0.4, 0.34), whiteMat); // 흰 줄무늬
  ship.add(hull, deck, rail, stripe);

  // 뱃전 난간 기둥 (갑판 위 낮은 울타리)
  for (let i = 2; i < STATIONS - 3; i += 3) {
    const t = i / (STATIONS - 1);
    const x = -LEN / 2 + LEN * t, b = beamAt(t);
    for (const side of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.5, 6), trimMat);
      post.position.set(x, sheerAt(t) + 0.25, b * side * 0.99);
      ship.add(post);
    }
  }

  // 선미 선실: 낮은 나무집 + 초록 지붕 + 창문
  const cabin = new THREE.Group();
  const walls = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.95, 1.65), whiteMat);
  walls.position.y = 0.5; walls.castShadow = true;
  const roof = new THREE.Mesh(new THREE.ConeGeometry(1.42, 1.0, 4), greenMat);
  roof.position.y = 1.45; roof.rotation.y = Math.PI / 4;
  const door = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.62, 0.48), trimMat);
  door.position.set(0.85, 0.33, 0);
  for (const side of [-1, 1]) {
    const win = new THREE.Mesh(new THREE.CircleGeometry(0.2, 14), new THREE.MeshStandardMaterial({ color: 0x9fe8ff }));
    win.position.set(0.2, 0.6, side * 0.84); win.rotation.y = side * Math.PI / 2;
    const frame = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.05, 6, 16), trimMat);
    frame.position.set(0.2, 0.6, side * 0.85); frame.rotation.y = side * Math.PI / 2;
    cabin.add(win, frame);
  }
  cabin.add(walls, roof, door);
  cabin.position.set(-2.2, DECK_Y + 0.02, 0);
  ship.add(cabin);

  // 돛대 둘: 큰 돛(가운데) + 작은 돛(앞)
  const sailTex = sailTexture();
  const sails = [];
  const addMast = (x, h, sw, sh, withSail = true) => {
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, h, 10), mastMat);
    mast.position.set(x, DECK_Y + h / 2, 0);
    mast.castShadow = true;
    ship.add(mast);
    if (!withSail) return mast;
    const yard = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, sw + 0.5, 8), mastMat);
    yard.rotation.x = Math.PI / 2;
    yard.position.set(x, DECK_Y + h - 0.5, 0);
    const sail = new THREE.Mesh(new THREE.PlaneGeometry(sw, sh, 8, 4), new THREE.MeshStandardMaterial({ map: sailTex, emissiveMap: sailTex, emissive: 0xffffff, emissiveIntensity: 0.55, side: THREE.DoubleSide, roughness: 1 }));
    sail.rotation.y = Math.PI / 2;
    sail.position.set(x, DECK_Y + h - 0.5 - sh / 2, 0);
    ship.add(yard, sail);
    sails.push({ mesh: sail, base: sail.geometry.attributes.position.array.slice(), phase: x });
    return mast;
  };
  const mainMast = addMast(0.4, 5.2, 3.4, 3.0);
  addMast(2.3, 3.4, 2.0, 1.8);

  // 까마귀 둥지 + 깃발
  const nest = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.36, 0.46, 12, 1, true), trimMat);
  nest.position.set(0.4, DECK_Y + 4.55, 0);
  const nestRim = new THREE.Mesh(new THREE.TorusGeometry(0.46, 0.06, 6, 16), mastMat);
  nestRim.rotation.x = Math.PI / 2; nestRim.position.set(0.4, DECK_Y + 4.78, 0);
  ship.add(nestRim);
  const flagPole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.9, 6), mastMat);
  flagPole.position.set(0.4, DECK_Y + 5.6, 0);
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 0.55, 6, 2), new THREE.MeshStandardMaterial({ color: 0xe8453c, emissive: 0xe8453c, emissiveIntensity: 0.35, side: THREE.DoubleSide }));
  flag.rotation.y = Math.PI / 2;
  flag.position.set(0.4, DECK_Y + 5.85, 0.5);
  sails.push({ mesh: flag, base: flag.geometry.attributes.position.array.slice(), phase: 3 });
  ship.add(nest, flagPole, flag);

  // 뱃머리 양 머리 장식 + 바우스프릿
  const head = buildFigurehead();
  head.scale.setScalar(1.2);
  head.position.set(LEN / 2 + 0.05, DECK_Y + 0.72, 0);
  head.rotation.z = 0.12;
  ship.add(head);
  const sprit = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 1.8, 8), mastMat);
  sprit.rotation.z = -Math.PI / 2.5;
  sprit.position.set(LEN / 2 + 0.5, DECK_Y + 1.1, 0);
  ship.add(sprit);

  // 키(조타륜), 닻, 나무통
  const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.07, 8, 20), mastMat);
  wheel.position.set(-1.2, DECK_Y + 0.55, 0);
  for (let i = 0; i < 6; i++) {
    const spoke = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 1.0, 6), mastMat);
    spoke.position.copy(wheel.position);
    spoke.rotation.x = (i / 6) * Math.PI;
    ship.add(spoke);
  }
  ship.add(wheel);
  const anchor = new THREE.Group();
  const shank = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.9, 6), trimMat);
  const arms = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.06, 6, 14, Math.PI), trimMat);
  arms.position.y = -0.45; arms.rotation.z = Math.PI;
  anchor.add(shank, arms);
  anchor.position.set(2.9, DECK_Y - 0.2, BEAM * 0.72);
  anchor.rotation.x = Math.PI / 2.2;
  ship.add(anchor);
  for (const [bx, bz] of [[-1.7, 0.75], [-1.9, -0.8]]) {
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.6, 12), trimMat);
    barrel.position.set(bx, DECK_Y + 0.3, bz);
    ship.add(barrel);
  }

  ship.traverse((o) => { if (o.isMesh) o.receiveShadow = true; });

  /** 돛과 깃발이 바람에 물결친다 */
  function animate(t, sailing = false) {
    const amp = sailing ? 0.14 : 0.06;
    for (const s of sails) {
      const p = s.mesh.geometry.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const x = s.base[i * 3], y = s.base[i * 3 + 1];
        p.setZ(i, Math.sin(t * 3 + x * 2.2 + s.phase) * amp * (0.5 + (x + 2) * 0.2) + Math.cos(t * 2 + y) * amp * 0.4);
      }
      p.needsUpdate = true;
    }
  }
  return { group: ship, deckY: DECK_Y, animate, mainMast };
}
