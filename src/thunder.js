import * as THREE from 'three';
import { makeNpc } from './npc.js';
import { rand } from './util.js';
import { buildGround, makePortal, makeInstanced, makePillSprite } from './world.js';

// 번개동굴 (140x140). 지하동굴 동쪽 벽의 "번개 굴"로 들어오면 도착한다. 전기 포켓몬(피카츄·코일·쥬피썬더·닌자피카츄)이 산다.
// 어둡고, 바닥은 검푸른 바위. 노란 번개 수정 기둥이 지직거리고, 푸른 전기가 흐르는 웅덩이(감전되니 못 들어간다),
// 천장에서 가끔 번개가 내리쳐 동굴이 번쩍인다. 전선을 감은 테슬라 탑 사이로 전기 아크가 튄다.
// 북쪽 끝 번개 제단에 보스 라이츄. 남쪽 포탈로 지하동굴에 돌아간다.
export const THUNDER = {
  size: 140,
  spawn: { x: 0, z: 48 },
  portal: { x: 0, z: 56 },
  altar: { x: 0, z: -52, r: 9 }, // 보스 라이츄가 선 번개 제단
  pools: [{ x: -30, z: 20, r: 6 }, { x: 34, z: 2, r: 5.5 }, { x: -38, z: -30, r: 6 }, { x: 36, z: -36, r: 5 }, { x: 8, z: -8, r: 4 }, { x: -12, z: 36, r: 4 }, { x: 50, z: 34, r: 5 }],
  bumps: [{ x: -24, z: -8, r: 12, h: 1.3 }, { x: 26, z: 24, r: 13, h: 1.1 }, { x: -50, z: 10, r: 11, h: 1.5 }, { x: 48, z: -16, r: 12, h: 1.2 }, { x: 14, z: -32, r: 10, h: 1.0 }, { x: -20, z: 50, r: 10, h: 0.9 }],
  towers: [{ x: -22, z: -40 }, { x: 22, z: -40 }, { x: -44, z: 44 }, { x: 44, z: 46 }, { x: -52, z: -50 }, { x: 54, z: -54 }], // 테슬라 탑 (아크가 튄다)
  wallR: 66,
};
function thunderHeight(x, z) {
  let y = 0;
  for (const b of THUNDER.bumps) { const dx = x - b.x, dz = z - b.z; y += b.h * Math.exp(-(dx * dx + dz * dz) / (b.r * b.r)); }
  for (const p of THUNDER.pools) { const d = Math.hypot(x - p.x, z - p.z); if (d < p.r + 1.5) y -= 0.45 * Math.min(1, (p.r + 1.5 - d) / 2); }
  const A = THUNDER.altar, ad = Math.hypot(x - A.x, z - A.z);
  if (ad < A.r) y = Math.max(y, 1.2); else if (ad < A.r + 2.5) y = Math.max(y, 1.2 * (1 - (ad - A.r) / 2.5)); // 제단은 한 단 높다 (경사로 올라간다)
  return y;
}
function thunderBlocked(x, z) {
  if (Math.hypot(x, z) > THUNDER.wallR - 1) return true; // 동굴 벽
  return THUNDER.pools.some((p) => Math.hypot(x - p.x, z - p.z) < p.r + 0.3); // 전기 웅덩이: 감전되니 못 들어간다
}
export const THUNDER_TERRAIN = { height: thunderHeight, inHole: () => false, blocked: thunderBlocked, size: THUNDER.size, obstacles: [] };

export function buildThunder(scene) {
  const S = THUNDER.size;
  const decor = new THREE.Group();
  scene.add(decor);
  const obstacles = THUNDER_TERRAIN.obstacles;
  obstacles.length = 0;
  const block = (x, z, r) => obstacles.push({ x, z, r });

  scene.background = new THREE.Color(0x070a16);
  scene.fog = new THREE.Fog(0x070a16, 18, 70);
  scene.add(new THREE.HemisphereLight(0x5a6fb0, 0x0b0d1a, 0.55));
  const sun = new THREE.DirectionalLight(0x9fb4ff, 0.25);
  sun.position.set(10, 30, 10);
  scene.add(sun, sun.target);

  // 바닥: 검푸른 바위 + 번개 수정 가루가 번쩍이는 자리
  const rockA = new THREE.Color(0x1d2238), rockB = new THREE.Color(0x242a45), poolBed = new THREE.Color(0x0e2a4a), altarC = new THREE.Color(0x3a3410);
  buildGround(scene, S, 120, thunderHeight, (x, z) => {
    if (THUNDER.pools.some((p) => Math.hypot(x - p.x, z - p.z) < p.r)) return poolBed;
    if (Math.hypot(x - THUNDER.altar.x, z - THUNDER.altar.z) < THUNDER.altar.r) return altarC;
    return Math.random() < 0.5 ? rockA : rockB;
  });

  // 동굴 벽: 둘레를 두른 뾰족 바위들 (안쪽은 못 나간다)
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x2a3050, roughness: 1 });
  const wallItems = [];
  for (let i = 0; i < 64; i++) {
    const a = (i / 64) * Math.PI * 2, r = THUNDER.wallR + rand(0, 4);
    const x = Math.cos(a) * r, z = Math.sin(a) * r, h = rand(9, 16), cr = rand(3.5, 6);
    wallItems.push({ x, y: h / 2 - 1, z, sx: cr, sy: h, sz: cr, ry: rand(0, 3) });
  }
  decor.add(makeInstanced(new THREE.ConeGeometry(1, 1, 6), rockMat, wallItems));

  // 전기 웅덩이: 푸른 빛이 흐르는 물 + 위에서 지직거리는 번개 고리
  const poolLights = [], poolRings = [];
  for (const P of THUNDER.pools) {
    const water = new THREE.Mesh(new THREE.CircleGeometry(P.r + 0.6, 28), new THREE.MeshStandardMaterial({ color: 0x1e9bff, emissive: 0x0a5fd0, emissiveIntensity: 0.9, transparent: true, opacity: 0.85, roughness: 0.1 }));
    water.rotation.x = -Math.PI / 2;
    water.position.set(P.x, thunderHeight(P.x, P.z) + 0.1, P.z);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(P.r * 0.7, 0.06, 6, 40), new THREE.MeshBasicMaterial({ color: 0xbfe9ff }));
    ring.rotation.x = -Math.PI / 2; ring.position.set(P.x, water.position.y + 0.15, P.z);
    decor.add(water, ring);
    poolRings.push(ring);
    if (poolLights.length < 3) { const light = new THREE.PointLight(0x3fb0ff, 2.5, 16); light.position.set(P.x, 1.2, P.z); decor.add(light); poolLights.push(light); } // 점광원은 셋까지 (나머지 웅덩이는 빛나는 재질만 — 점광원이 많으면 태블릿에서 느리다)
    const sign = makePillSprite('⚡ 감전 주의', { bg: '#0b1a2e', fg: '#9fe8ff', border: '#3fb0ff' }, 0.8);
    sign.position.set(P.x, 2.0, P.z); decor.add(sign);
  }

  // 번개 수정: 노란 빛이 나는 뾰족 기둥 무리 (점광원은 몇 개만)
  const crystalMat = new THREE.MeshStandardMaterial({ color: 0xffe36b, emissive: 0xffc400, emissiveIntensity: 0.8, roughness: 0.3 });
  const crystals = [], crystalLights = [];
  for (let i = 0; i < 60; i++) {
    const x = rand(-S / 2 + 12, S / 2 - 12), z = rand(-S / 2 + 12, S / 2 - 12);
    if (Math.hypot(x, z) > THUNDER.wallR - 6 || Math.hypot(x - THUNDER.spawn.x, z - THUNDER.spawn.z) < 8 || Math.hypot(x - THUNDER.altar.x, z - THUNDER.altar.z) < THUNDER.altar.r + 3 || thunderBlocked(x, z)) continue;
    const y = thunderHeight(x, z), n = 2 + Math.floor(rand(0, 3));
    for (let k = 0; k < n; k++) {
      const h = rand(1.2, 3.2), r = rand(0.25, 0.5);
      crystals.push({ x: x + rand(-0.8, 0.8), y: y + h / 2 - 0.2, z: z + rand(-0.8, 0.8), sx: r, sy: h, sz: r, ry: rand(0, 3) });
    }
    block(x, z, 1.1);
    if (crystalLights.length < 5 && i % 5 === 0) { const l = new THREE.PointLight(0xffd23f, 1.6, 12); l.position.set(x, y + 1.6, z); l.userData.phase = rand(0, 6); decor.add(l); crystalLights.push(l); }
  }
  decor.add(makeInstanced(new THREE.ConeGeometry(1, 1, 5), crystalMat, crystals));

  // 테슬라 탑: 쇠기둥 위 둥근 코일, 탑 사이로 전기 아크가 튄다
  const metal = new THREE.MeshStandardMaterial({ color: 0x8a94a6, metalness: 0.6, roughness: 0.4 });
  const coilMat = new THREE.MeshStandardMaterial({ color: 0xc46b2c, metalness: 0.3 });
  const towerTops = [];
  for (const T of THUNDER.towers) {
    const y = thunderHeight(T.x, T.z);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.5, 0.6, 12), metal); base.position.set(T.x, y + 0.3, T.z);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.35, 5, 8), metal); post.position.set(T.x, y + 3.1, T.z);
    const coil = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 1.6, 12), coilMat); coil.position.set(T.x, y + 5.0, T.z);
    const orb = new THREE.Mesh(new THREE.SphereGeometry(0.75, 14, 10), new THREE.MeshStandardMaterial({ color: 0xbfe9ff, emissive: 0x7fd4ff, emissiveIntensity: 1.2 })); orb.position.set(T.x, y + 6.4, T.z);
    decor.add(base, post, coil, orb);
    if (towerTops.length % 2 === 0) { const light = new THREE.PointLight(0x9fe8ff, 2, 18); light.position.copy(orb.position); decor.add(light); } // 탑 둘에 하나만 점광원
    towerTops.push(orb.position.clone());
    block(T.x, T.z, 1.4);
  }
  // 아크: 탑 꼭대기끼리 잇는 지그재그 선 (매 프레임 모양이 바뀐다)
  const arcs = [];
  const arcMat = new THREE.LineBasicMaterial({ color: 0xcfefff, transparent: true, opacity: 0.9 });
  for (let i = 0; i + 1 < towerTops.length; i += 2) {
    const geo = new THREE.BufferGeometry().setFromPoints(Array.from({ length: 12 }, () => new THREE.Vector3()));
    const line = new THREE.Line(geo, arcMat);
    line.userData = { a: towerTops[i], b: towerTops[i + 1], phase: rand(0, 6) };
    decor.add(line); arcs.push(line);
  }

  // 천장 번개: 가끔 내리치는 번개 줄기 + 온 동굴이 번쩍 (안개색도 잠깐 밝아진다)
  const boltGeo = new THREE.BufferGeometry().setFromPoints(Array.from({ length: 10 }, () => new THREE.Vector3()));
  const bolt = new THREE.Line(boltGeo, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0 }));
  decor.add(bolt);
  const flash = new THREE.PointLight(0xfff6c0, 0, 90); flash.position.set(0, 20, 0); decor.add(flash);
  const flashState = { next: 3, until: 0 };

  // 번개 제단 (북쪽): 한 단 높은 둥근 바위 단 + 둘레 번개 기둥 + 가운데 피뢰침
  {
    const A = THUNDER.altar;
    const top = new THREE.Mesh(new THREE.CylinderGeometry(A.r, A.r + 2.5, 1.2, 32), new THREE.MeshStandardMaterial({ color: 0x3a3410, roughness: 0.8 }));
    top.position.set(A.x, 0.6, A.z); top.receiveShadow = true;
    decor.add(top);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2, x = A.x + Math.cos(a) * (A.r - 1.2), z = A.z + Math.sin(a) * (A.r - 1.2);
      const pillar = new THREE.Mesh(new THREE.ConeGeometry(0.6, 3.6, 5), crystalMat); pillar.position.set(x, 1.2 + 1.8, z); pillar.rotation.y = a;
      decor.add(pillar); block(x, z, 0.7);
    }
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 6, 8), metal); rod.position.set(A.x, 1.2 + 3, A.z - 6);
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffe36b, emissiveIntensity: 1.5 })); tip.position.set(A.x, 1.2 + 6.1, A.z - 6);
    decor.add(rod, tip); block(A.x, A.z - 6, 0.3);
    const altarLight = new THREE.PointLight(0xffd23f, 4, 24); altarLight.position.set(A.x, 4, A.z); decor.add(altarLight);
    const sign = makePillSprite('⚡ 번개 제단 · 보스', { bg: '#20232e', fg: '#ffd93d', border: '#ffd93d' }, 1.3);
    sign.position.set(A.x, 6.5, A.z + 4); decor.add(sign);
  }

  // 전선: 바닥을 따라 늘어진 케이블 몇 가닥 (장식)
  const cableMat = new THREE.MeshStandardMaterial({ color: 0x20232e });
  for (let i = 0; i < 10; i++) {
    const x1 = rand(-50, 50), z1 = rand(-50, 50), x2 = x1 + rand(-14, 14), z2 = z1 + rand(-14, 14);
    const len = Math.hypot(x2 - x1, z2 - z1);
    const c = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, len, 5), cableMat);
    c.position.set((x1 + x2) / 2, thunderHeight((x1 + x2) / 2, (z1 + z2) / 2) + 0.08, (z1 + z2) / 2);
    c.rotation.z = Math.PI / 2; c.rotation.y = -Math.atan2(z2 - z1, x2 - x1);
    decor.add(c);
  }

  // 등불 기둥: 도착 지점에서 북쪽으로 띄엄띄엄 (길잡이)
  const lampMat = new THREE.MeshStandardMaterial({ color: 0xfff1b5, emissive: 0xffd36b, emissiveIntensity: 1.2 });
  for (let i = 0; i < 6; i++) {
    const x = (i % 2 ? 3 : -3), z = THUNDER.spawn.z - 8 - i * 12;
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 2.2, 8), new THREE.MeshStandardMaterial({ color: 0x3a3f4a })); post.position.set(x, thunderHeight(x, z) + 1.1, z);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), lampMat); lamp.position.set(x, thunderHeight(x, z) + 2.3, z);
    decor.add(post, lamp); block(x, z, 0.2);
  }

  // 포탈 (남쪽): 지하동굴로 돌아간다
  const P = THUNDER.portal;
  const portal = makePortal(scene, P.x, thunderHeight(P.x, P.z), P.z, { color: 0xffd23f, label: '지하동굴로 가는 포탈', labelBg: '#20232e', labelFg: '#ffd93d' });

  // 안내원 코리 (우주비행사 — 전기는 내 전문!)
  const guideAt = { x: 5, z: 44 };
  const guide = makeNpc({ outfit: 'astronaut', name: '코리', model: '코리.glb' });
  guide.position.set(guideAt.x, thunderHeight(guideAt.x, guideAt.z), guideAt.z);
  guide.rotation.y = -0.8;
  decor.add(guide); block(guideAt.x, guideAt.z, 0.6);
  const drop = new THREE.Mesh(new THREE.CircleGeometry(2.2, 24), new THREE.MeshBasicMaterial({ color: 0xfff1b5, transparent: true, opacity: 0.25 }));
  drop.rotation.x = -Math.PI / 2;
  drop.position.set(THUNDER.spawn.x, thunderHeight(THUNDER.spawn.x, THUNDER.spawn.z) + 0.03, THUNDER.spawn.z);
  scene.add(drop);

  const _v = new THREE.Vector3();
  function zigzag(line, a, b, jitter, t) {
    const pos = line.geometry.attributes.position, n = pos.count;
    for (let i = 0; i < n; i++) {
      const u = i / (n - 1);
      _v.lerpVectors(a, b, u);
      if (i > 0 && i < n - 1) { _v.x += Math.sin(t * 37 + i * 2.1) * jitter; _v.y += Math.cos(t * 41 + i * 1.7) * jitter; _v.z += Math.sin(t * 29 + i * 2.9) * jitter; }
      pos.setXYZ(i, _v.x, _v.y, _v.z);
    }
    pos.needsUpdate = true;
  }
  const boltFrom = new THREE.Vector3(), boltTo = new THREE.Vector3();
  function animate(t) {
    for (const l of poolLights) l.intensity = 2.2 + Math.sin(t * 5 + l.position.x) * 0.9;
    for (const r of poolRings) { r.rotation.z = t * 0.8; r.material.opacity = 0.5 + Math.sin(t * 9 + r.position.x) * 0.5; }
    for (const l of crystalLights) l.intensity = 1.2 + Math.max(0, Math.sin(t * 3 + l.userData.phase)) * 1.4;
    for (const a of arcs) { const u = a.userData; a.visible = Math.sin(t * 2 + u.phase) > -0.2; if (a.visible) zigzag(a, u.a, u.b, 0.7, t + u.phase); }
    // 천장 번개
    if (t > flashState.next) {
      flashState.next = t + rand(4, 9); flashState.until = t + 0.35;
      const x = rand(-40, 40), z = rand(-40, 40);
      boltFrom.set(x + rand(-6, 6), 26, z + rand(-6, 6)); boltTo.set(x, thunderHeight(x, z), z);
      flash.position.set(x, 12, z);
    }
    const on = t < flashState.until;
    bolt.material.opacity = on ? 1 : 0;
    if (on) zigzag(bolt, boltFrom, boltTo, 1.6, t);
    flash.intensity = on ? 6 + Math.sin(t * 60) * 3 : 0;
    scene.fog.color.setHex(on ? 0x1a2240 : 0x070a16);
    portal.animate(t);
  }

  return {
    sun, animate, terrain: THUNDER_TERRAIN, decor, portal: P, spawn: THUNDER.spawn, dark: true, noShrine: true,
    portalTo: 'cave', // 이 지역의 포탈은 푸른숲이 아니라 지하동굴로 간다
    npcs: [{ x: guideAt.x, z: guideAt.z, mesh: guide, name: '코리', warp: true, lines: (c) => [
      `번개동굴에 온 걸 환영해, ${c.name}! 난 우주비행사 코리야. 로켓 전기 회로를 공부하다 보니 전기 포켓몬에 빠졌지 뭐야.`,
      '여기는 전기 포켓몬의 고향이야. 피카츄·코일·쥬피썬더·닌자피카츄가 살아. 천장에서 번개가 내리치면 눈을 잠깐 감아!',
      '푸른 웅덩이는 전기가 흐르는 물이야. 들어가면 찌릿! 감전되니까 절대 들어가지 마. 둘러서 가자.',
      '전기는 땅에 통하지 않아. 땅 포켓몬(디그다·탕구리)이 있으면 전기 공격을 하나도 안 맞는단다. 바위·땅 포켓몬으로 상대해 봐!',
      `여기 포켓몬은 세. 공격 ${c.zone.atkRange}쯤은 돼야 편하게 이겨. 지하동굴 친구들을 충분히 키우고 오렴.`,
      c.conquered.thunder ? '보스 라이츄를 이겼구나! 번개 제단이 조용해졌어. 대단해!' : `북쪽 번개 제단에 보스 라이츄가 있어. 체력 ${c.zone.bossHp || 100}에 공격이 세니까 공격 ${c.zone.targetAtk + 3} 이상, 체력 40쯤 되면 도전해 봐. 땅 포켓몬이면 훨씬 쉬워!`,
      '노란 번개 수정은 전기를 모아 두는 돌이야. 테슬라 탑 사이로 튀는 하얀 전기 아크도 구경해 봐. 만지면 안 돼!',
      '남쪽의 노란 포탈로 나가면 지하동굴의 번개 굴 앞이야.',
    ] }],
    wildSpots: [[-22, 30], [24, 34], [-44, 20], [44, 14], [-18, -18], [22, -16], [-52, -14], [52, -8], [-30, -46], [30, -48], [0, -22], [-56, 36], [56, 44], [10, 16]],
    bossSpot: { x: THUNDER.altar.x, z: THUNDER.altar.z },
    pickupSpots: [[-12, 28], [14, 22], [-36, 2], [38, -22], [0, -36], [-24, 56], [26, 56], [-58, 8], [58, 24], [6, 2], [-8, -44], [46, 0]],
  };
}
