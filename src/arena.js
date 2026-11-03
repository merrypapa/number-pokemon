import * as THREE from 'three';
import { makeNpc } from './npc.js';
import { makeLabelTexture, makePillSprite, makeInstanced } from './world.js';
import { COL, polar, ringPt, thetaAtX, makeColosseumTerrain, buildColosseum } from './colosseum.js';

// 넘버볼 아레나 = 로마 콜로세움 (모양·지형은 src/colosseum.js). 푸른숲 마을 동남쪽의 둥근 경기장 문으로 들어오면 오는 지역.
// 도착하면 콜로세움 남쪽 큰 문 앞 광장. 문 안의 굴(관중석 밑)을 지나면 타원 모래 경기장, 가운데에 포켓몬 무대(1P·2P 자리).
// 굴 입구 양옆 돌계단 → 포디움 테라스 → 통로 계단 → 1층·2층 관중석 → 맨 위 회랑까지 올라가 대결을 내려다볼 수 있다.
// 경기장 서쪽에 치료 데스크의 봄이(치료), 무대 앞에 심판 웅이, 북쪽 황제석에 콜로세움 해설가 마르코.
// 몬스터·블록·퀴즈는 없다. 친구 대결(src/duel.js)을 수락하면 여기로 오고, 무대 위 제 자리에 서면 "대결!" 버튼이 켜진다.
// 남쪽 광장의 개선문(콘스탄티누스 개선문)으로 나가면 마을.
export const ARENA = { size: 110, spawn: { x: 0, z: 37 }, door: { x: 0, z: 45.6 }, ring: { x: 0, z: -3, r: 10 }, spots: { a: { x: -7, z: -3 }, b: { x: 7, z: -3 } } };
export const ARENA_TERRAIN = makeColosseumTerrain({ size: ARENA.size, stage: ARENA.ring, obstacles: [] });
const ARCH = { z: 45.6, hw: 8.5, d: 3.4 }; // 개선문

export function buildArena(scene) {
  const decor = new THREE.Group();
  scene.add(decor);
  const obstacles = ARENA_TERRAIN.obstacles;
  obstacles.length = 0;
  const seg = (ax, az, bx, bz, r = 0.3) => obstacles.push({ ax, az, bx, bz, r });
  const block = (x, z, r) => obstacles.push({ x, z, r });
  const flat = (m) => { m.userData.noHide = true; decor.add(m); return m; };

  // 하늘: 로마의 맑은 낮. 실내 지역 규칙(블록·숫자블록이 새로 생기지 않는다)은 그대로 두고, 하늘은 큰 공(돔)으로 그린다
  scene.background = new THREE.Color(0x9cc8ee);
  scene.fog = new THREE.Fog(0xd6e4f0, 110, 330);
  {
    const geo = new THREE.SphereGeometry(300, 24, 12), pos = geo.attributes.position, cols = [], top = new THREE.Color(0x4f8fd8), hor = new THREE.Color(0xe4eef6), c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) { const k = Math.max(0, pos.getY(i) / 300); c.copy(hor).lerp(top, Math.pow(k, 0.6)); cols.push(c.r, c.g, c.b); }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    flat(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false })));
  }
  scene.add(new THREE.HemisphereLight(0xfff8ec, 0x9a8a70, 1.15));
  const sun = new THREE.DirectionalLight(0xfff0d6, 1.6);
  sun.position.set(30, 60, 42); sun.target.position.set(0, 0, -3); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0006;
  Object.assign(sun.shadow.camera, { left: -52, right: 52, top: 52, bottom: -52, near: 1, far: 180 });
  scene.add(sun, sun.target);

  // 땅: 풀밭 + 돌을 깐 광장(타원) + 남쪽 길, 멀리 낮은 언덕
  const ground = flat(new THREE.Mesh(new THREE.PlaneGeometry(700, 700), new THREE.MeshStandardMaterial({ color: 0x8f9a5e, roughness: 1 })));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true;
  const plaza = flat(new THREE.Mesh(new THREE.CircleGeometry(1, 72), new THREE.MeshStandardMaterial({ color: 0xc9bc9c, roughness: 1 })));
  plaza.rotation.x = -Math.PI / 2; plaza.scale.set(COL.A + COL.OUT + 16, COL.B + COL.OUT + 18, 1); plaza.position.set(COL.cx, 0.02, COL.cz); plaza.receiveShadow = true;
  const road = flat(new THREE.Mesh(new THREE.PlaneGeometry(8, 140), new THREE.MeshStandardMaterial({ color: 0xb3a586, roughness: 1 })));
  road.rotation.x = -Math.PI / 2; road.position.set(0, 0.03, 110); road.receiveShadow = true;
  {
    const n = 72, pos = [], R = 230;
    for (let i = 0; i <= n; i++) { const a = (i / n) * Math.PI * 2, h = 14 + Math.sin(i * 1.7) * 7 + Math.sin(i * 0.43) * 9; pos.push(Math.cos(a) * R, 0, Math.sin(a) * R, Math.cos(a) * R, Math.max(4, h), Math.sin(a) * R); }
    const idx = []; for (let i = 0; i < n; i++) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx); geo.computeVertexNormals();
    flat(new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x7d8f6a, roughness: 1, side: THREE.DoubleSide })));
  }
  // 우산소나무(로마 소나무): 광장 둘레
  {
    const trunks = [], crowns = [];
    let s = 11; const rnd = () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
    for (let i = 0; i < 60 && trunks.length < 18; i++) {
      const x = (rnd() * 2 - 1) * 52, z = (rnd() * 2 - 1) * 52;
      if (polar(x, z).w < 9 || (Math.abs(x) < 12 && z > 28) || trunks.some((t) => Math.hypot(t.x - x, t.z - z) < 9)) continue;
      const h = 6 + rnd() * 2.5;
      trunks.push({ x, y: h / 2, z, sx: 1, sy: h, sz: 1, rz: (rnd() - 0.5) * 0.12 });
      crowns.push({ x, y: h + 0.6, z, sx: 3.6, sy: 1.3, sz: 3.6 });
      block(x, z, 0.6);
    }
    decor.add(makeInstanced(new THREE.CylinderGeometry(0.25, 0.4, 1, 7), new THREE.MeshStandardMaterial({ color: 0x6a4a32, roughness: 1 }), trunks, { shadow: true }));
    decor.add(makeInstanced(new THREE.SphereGeometry(1, 12, 8), new THREE.MeshStandardMaterial({ color: 0x4f7a3a, roughness: 1 }), crowns, { shadow: true }));
  }

  // 콜로세움 본체 (관중석·바깥 아치 벽·굴·황제석·하이포지움)
  const col = buildColosseum(decor, { obstacles });

  // 경기장 모래 바닥 + 가운데 무대 (밝은 원판 + 파란 1P · 빨간 2P 자리)
  const sand = flat(new THREE.Mesh(new THREE.CircleGeometry(1, 96), new THREE.MeshStandardMaterial({ color: 0xe0c28c, roughness: 1 })));
  sand.rotation.x = -Math.PI / 2; sand.scale.set(COL.A, COL.B, 1); sand.position.set(COL.cx, 0.04, COL.cz); sand.receiveShadow = true;
  const ring = ARENA.ring;
  const stage = flat(new THREE.Mesh(new THREE.CylinderGeometry(ring.r, ring.r + 0.3, 0.3, 64), new THREE.MeshStandardMaterial({ color: 0xf1e9c8, roughness: 0.7 })));
  stage.position.set(ring.x, 0.15, ring.z); stage.receiveShadow = true;
  const edge = new THREE.Mesh(new THREE.TorusGeometry(ring.r, 0.16, 8, 72), new THREE.MeshStandardMaterial({ color: 0xffd93d, emissive: 0xffd93d, emissiveIntensity: 0.3 }));
  edge.rotation.x = Math.PI / 2; edge.position.set(ring.x, 0.32, ring.z); flat(edge);
  const disc = (geo, color, y) => { const m = flat(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color }))); m.rotation.x = -Math.PI / 2; m.position.set(ring.x, y, ring.z); return m; };
  disc(new THREE.PlaneGeometry(0.3, ring.r * 2 - 1), 0x20232e, 0.31);
  disc(new THREE.CircleGeometry(2.2, 32), 0xe8453c, 0.315);
  disc(new THREE.CircleGeometry(0.9, 24), 0xf4f4f8, 0.32);
  for (const [s, color, label] of [[ARENA.spots.a, 0x3fb8e8, '1P'], [ARENA.spots.b, 0xe8453c, '2P']]) {
    const c = flat(new THREE.Mesh(new THREE.RingGeometry(1.6, 2.0, 32), new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }))); c.rotation.x = -Math.PI / 2; c.position.set(s.x, 0.33, s.z);
    const tag = makePillSprite(label, { bg: '#' + color.toString(16).padStart(6, '0'), fg: '#ffffff', border: '#ffffff' }, 0.6); tag.position.set(s.x, 0.9, s.z); decor.add(tag);
  }

  // 표지판 (벽 너머로 비치지 않게 깊이 검사를 켠다)
  const sign = (text, bg, fg, x, y, z, w = 3.6, h = 0.9) => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: makeLabelTexture(text, bg, fg, 48) })); s.scale.set(w, h, 1); s.position.set(x, y, z); decor.add(s); return s; };
  const gateOut = ringPt(Math.PI / 2, COL.OUT + 0.6), gateIn = ringPt(Math.PI / 2, -0.7);
  sign('🏟 넘버볼 콜로세움', '#5a2a7a', '#ffd93d', gateOut[0], 6.6, gateOut[1], 7, 1.6);
  sign('▼ 나가기 (마을)', '#e8453c', '#ffffff', gateIn[0], 2.7, gateIn[1]);
  for (const sx of [-1, 1]) sign('⬆ 관중석 계단', '#3a6fc8', '#ffffff', sx * 6.6, 4.6, ringPt(thetaAtX(sx * 6.6, -1.2), -1.2)[1], 3.4, 0.85);

  // 콘스탄티누스 개선문: 광장 남쪽. 가운데 큰 문이 마을로 나가는 문
  {
    const arch = new THREE.Group(); arch.position.set(0, 0, ARCH.z); arch.userData.radius = 7; decor.add(arch);
    const marble = new THREE.MeshStandardMaterial({ color: 0xe9e0cc, roughness: 0.85 }), dark = new THREE.MeshStandardMaterial({ color: 0xc9bc9f, roughness: 1 });
    const box = (w, h, d, x, y, z, m = marble) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); b.castShadow = true; b.receiveShadow = true; arch.add(b); return b; };
    for (const [x0, x1] of [[-8.5, -5.6], [-3.8, -1.9], [1.9, 3.8], [5.6, 8.5]]) { box(x1 - x0, 6.8, ARCH.d, (x0 + x1) / 2, 3.4, 0); for (const dz of [-0.85, 0.85]) seg(x0 + 0.85, ARCH.z + dz, x1 - 0.85, ARCH.z + dz, 0.85); } // 기둥(교각) 사각형을 굵은 선분 둘로
    box(1.8, 3.0, ARCH.d, -4.7, 5.3, 0); box(1.8, 3.0, ARCH.d, 4.7, 5.3, 0); box(17, 2.6, ARCH.d, 0, 8.1, 0); // 옆문 위 + 몸통
    box(17.4, 0.5, ARCH.d + 0.4, 0, 9.65, 0, dark); box(17, 2.6, ARCH.d, 0, 11.2, 0); box(17.4, 0.4, ARCH.d + 0.4, 0, 12.7, 0, dark);
    for (const x of [-7.05, -2.85, 2.85, 7.05]) for (const z of [-1, 1]) { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.36, 6.2, 10), new THREE.MeshStandardMaterial({ color: 0xd8b478, roughness: 0.6 })); c.position.set(x, 3.6, z * (ARCH.d / 2 + 0.3)); arch.add(c); }
    const ins = new THREE.Mesh(new THREE.PlaneGeometry(9, 1.8), new THREE.MeshStandardMaterial({ map: makeLabelTexture('넘버볼 개선문', '#e9e0cc', '#6a4a2a', 60), roughness: 1 }));
    ins.position.set(0, 11.2, -ARCH.d / 2 - 0.02); ins.rotation.y = Math.PI; arch.add(ins);
  }
  sign('▼ 나가기 (마을)', '#e8453c', '#ffffff', 0, 3.4, ARCH.z - 2.2);

  // 치료 데스크 + 간호사 봄이 (경기장 서쪽 끝), 심판 웅이 (무대 앞)
  const desk = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.1, 5), new THREE.MeshStandardMaterial({ color: 0xf6f3ea }));
  desk.position.set(-16.6, 0.55, -3); desk.castShadow = true; decor.add(desk); seg(-16.6, -5.3, -16.6, -0.7, 0.9);
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 3, 8), new THREE.MeshStandardMaterial({ color: 0x8a7a62 })); post.position.set(-18.3, 1.5, -3); decor.add(post); block(-18.3, -3, 0.4);
  const cross = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.2, 1.2), new THREE.MeshStandardMaterial({ color: 0xe8453c })); cross.position.set(-18.2, 3.4, -3); decor.add(cross);
  const crossH = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.26, 0.8), new THREE.MeshStandardMaterial({ color: 0xffffff })); crossH.position.set(-18.12, 3.4, -3); decor.add(crossH);
  const crossV = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.8, 0.26), crossH.material); crossV.position.copy(crossH.position); decor.add(crossV);
  sign('🏥 치료 데스크', '#ffffff', '#e8453c', -17.4, 4.5, -3);
  const nurse = makeNpc({ outfit: 'professor', name: '봄이', model: '봄이.glb' }); // 불의산 안내원 봄이가 아레나 치료 데스크도 본다
  nurse.position.set(-15.0, 0, -3); nurse.rotation.y = Math.PI / 2; decor.add(nurse);
  const referee = makeNpc({ outfit: 'ranger', name: '웅이', model: '웅이.glb' }); // 지하동굴 안내원 웅이가 심판
  referee.position.set(0, 0, 8.6); referee.rotation.y = Math.PI; decor.add(referee);
  const guide = makeNpc({ outfit: 'professor', name: '마르코' }); // 황제석의 콜로세움 해설가
  guide.position.set(col.pulv.x - 1.4, COL.PULV.top, col.pulv.z - 1.0); decor.add(guide);

  function animate(t) { col.animate(t); edge.material.emissiveIntensity = 0.3 + Math.sin(t * 2) * 0.2; }

  return {
    portalTo: 'town', sun, animate, terrain: ARENA_TERRAIN, decor, spawn: ARENA.spawn, portal: ARENA.door, dark: false, indoor: true, noShrine: true,
    wildSpots: [], pickupSpots: [],
    duelSpots: ARENA.spots,
    npcs: [
      { x: nurse.position.x, z: nurse.position.z, mesh: nurse, name: '봄이', heal: true, lines: (c) => [
        `어서 와, ${c.name}! 나 봄이야, 오늘은 콜로세움 치료 데스크를 맡았어. 대결로 지친 포켓몬은 언제든 여기서 낫게 해 줄게.`,
        '친구와 대결하려면 도감 친구 탭에서 ⚔ 대결을 눌러 신청해. 친구가 수락하면 둘 다 여기 아레나로 오게 돼.',
        '무대 위 파란 1P·빨간 2P 자리에 서면 "대결!" 버튼이 켜져. 서로 번갈아 기술을 하나씩 고르는 거야.',
        '대결에서 이기면 블록 30개, 져도 10개! 주간 순위에도 대결 승리 점수가 들어간단다.',
      ] },
      { x: referee.position.x, z: referee.position.z, mesh: referee, name: '웅이', lines: (c) => [
        `${c.name} 선수, 심판 웅이다! 무대에 오르렴! 파란 1P 자리는 신청한 사람, 빨간 2P 자리는 받은 사람이야.`,
        '피해는 공격력 × 기술 배수 × 속성 상성이야. 불은 풀에, 물은 불에, 풀은 물에 세단다. 상대 대표를 보고 기술을 고르렴!',
        '상대가 자리에 없으면 기다려도 돼. 차례는 남아 있으니 나중에 도감 대결 탭에서 이어서 할 수 있어.',
        '구경하고 싶으면 남쪽 문 양옆 돌계단으로 올라가 봐. 관중석 맨 위에서 무대가 한눈에 보여!',
      ] },
      { x: guide.position.x, z: guide.position.z, mesh: guide, name: '마르코', prompt: '황제석의 해설가 마르코 할아버지야! 대화 버튼을 눌러 봐.', lines: (c) => [
        `여기까지 올라왔구나, ${c.name}! 나는 해설가 마르코. 여기는 황제가 앉던 자리, "풀비나르"란다. 경기장이 제일 잘 보이지!`,
        '이 경기장은 이탈리아 로마의 콜로세움을 본떠 지었어. 진짜 콜로세움은 약 2천 년 전에 지어졌고, 5만 명이 한꺼번에 구경할 수 있었대.',
        '바깥 벽을 봐. 아치가 3층으로 쌓여 있고 맨 위에 다락층이 있지? 진짜 콜로세움 1층에는 아치 문이 80개나 있어서, 입장권에 적힌 번호 문으로 들어갔단다.',
        '관중석 한 줄은 꽤 높아서 그냥은 못 올라가. 통로 계단으로 한 칸씩 오르거나, 점프해야 해. 옛날 로마 사람들도 계단으로 다녔지!',
        '맨 위 돛대에는 "벨라리움"이라는 큰 천막을 걸어 햇빛을 가렸어. 북쪽에 펼쳐 둔 천막이 보이니?',
        '경기장 바닥 동쪽의 나무 뚜껑문 보이니? 그 아래는 "하이포지움"이라는 지하 무대야. 승강기로 무대 장치를 바닥 위로 올려 보냈단다. 지금도 오르락내리락하지!',
      ] },
    ],
  };
}
