import * as THREE from 'three';
import { makeNpc } from './npc.js';
import { rand } from './util.js';
import { buildGround, makeSignAt, makeLabelTexture, makeInstanced } from './world.js';
import { buildUfoStation } from './ufo.js';

// 꿈의우주 (220x220). 푸른숲 로켓 발사장에서 로켓을 타고 온다. 신비한 포켓몬(페어리·에스퍼·고스트)이 산다.
// 보랏빛 달 표면(분화구·빛나는 수정·떠다니는 별빛·유성)과 하늘의 태양과 여덟 행성(+명왕성). 중력이 약해 높이 뛴다.
// 돌아갈 때는 착륙장의 로켓을 다시 탄다 (E).
export const SPACE = {
  size: 300,
  spawn: { x: 0.0, z: 109.1 },
  craters: [
    { x: -54.5, z: 40.9, r: 19.1, d: 2.4 }, { x: 61.4, z: 54.5, r: 16.4, d: 2.0 }, { x: 75.0, z: -54.5, r: 21.8, d: 2.8 }, { x: -81.8, z: -61.4, r: 19.1, d: 2.4 },
    { x: 10.9, z: -10.9, r: 12.3, d: 1.5 }, { x: -109.1, z: 95.5, r: 13.6, d: 1.7 }, { x: 109.1, z: 109.1, r: 12.3, d: 1.5 }, { x: -16.4, z: -102.3, r: 17.7, d: 2.2 },
    { x: 122.7, z: 6.8, r: 15.0, d: 1.9 }, { x: -129.5, z: -6.8, r: 16.4, d: 2.0 }, { x: 40.9, z: -129.5, r: 16.4, d: 2.1 }, { x: -68.2, z: -129.5, r: 13.6, d: 1.8 }, { x: 81.8, z: 129.5, r: 12.3, d: 1.5 }, { x: -40.9, z: 115.9, r: 10.9, d: 1.4 },
  ],
  bumps: [
    { x: -34.1, z: -75.0, r: 21.8, h: 2.8 }, { x: 95.5, z: 0.0, r: 19.1, h: 2.4 }, { x: -109.1, z: 6.8, r: 20.5, h: 2.6 }, { x: 34.1, z: 115.9, r: 16.4, h: 1.8 }, { x: 115.9, z: -115.9, r: 19.1, h: 2.6 },
    { x: -115.9, z: -109.1, r: 17.7, h: 2.4 }, { x: 0.0, z: 54.5, r: 13.6, h: 1.4 }, { x: 129.5, z: 68.2, r: 16.4, h: 2.0 },
  ],
  altar: { x: 0.0, z: -54.5, r: 12.3 }, // 보스 팬텀이 지키는 꿈의 제단
  ufoPad: { x: -24.5, z: 90.0 },    // UFO 정거장 (손오공에게 말을 걸면 태양·행성으로 간다)
  gravity: 0.45, // 지구의 절반도 안 되는 중력: 점프가 높고 오래 뜬다
};

function spaceHeight(x, z) {
  let y = 0;
  for (const b of SPACE.bumps) { const dx = x - b.x, dz = z - b.z; y += b.h * Math.exp(-(dx * dx + dz * dz) / (b.r * b.r)); }
  for (const c of SPACE.craters) {
    const d = Math.hypot(x - c.x, z - c.z);
    if (d < c.r) y -= c.d * (1 - (d / c.r) * (d / c.r));           // 움푹
    else if (d < c.r + 2.5) y += 0.5 * (1 - (d - c.r) / 2.5);      // 테두리 살짝 솟음
  }
  const a = SPACE.altar, ad = Math.hypot(x - a.x, z - a.z);
  if (ad < a.r + 4) y += 1.6 * Math.min(1, (a.r + 4 - ad) / 4); // 제단은 한 층 높다
  return y;
}
export const SPACE_TERRAIN = { height: spaceHeight, inHole: () => false, blocked: () => false, size: SPACE.size, obstacles: [] };

// 태양계: 이름, 색, 크기(상대), 하늘에서의 방향(각도)과 높이
const SOLAR = [
  { name: '태양', color: 0xffd23f, emissive: 0xffa500, r: 20, az: -0.62, el: 0.86, glow: true },
  { name: '수성', color: 0xb5b0a8, r: 2.2, az: -0.40, el: 0.80 },
  { name: '금성', color: 0xe8c77a, r: 3.6, az: -0.28, el: 0.92 },
  { name: '지구', color: 0x4fa3ff, r: 3.8, az: -0.15, el: 0.82, moon: true },
  { name: '화성', color: 0xd9603b, r: 2.8, az: -0.02, el: 0.94 },
  { name: '목성', color: 0xd8a56a, r: 10, az: 0.14, el: 0.84, bands: true },
  { name: '토성', color: 0xe6cf8f, r: 8.5, az: 0.33, el: 0.95, ring: true },
  { name: '천왕성', color: 0x8fd8e8, r: 5.2, az: 0.48, el: 0.82 },
  { name: '해왕성', color: 0x3f5fd8, r: 5.0, az: 0.60, el: 0.92 },
  { name: '명왕성', color: 0xc9b8a8, r: 1.6, az: 0.70, el: 0.82 },
];

export function buildSpace(scene) {
  const S = SPACE.size;
  const decor = new THREE.Group();
  scene.add(decor);
  const obstacles = SPACE_TERRAIN.obstacles;
  obstacles.length = 0;
  const block = (x, z, r) => obstacles.push({ x, z, r });

  scene.background = new THREE.Color(0x070516);
  scene.fog = new THREE.Fog(0x070516, 68, 220);
  scene.add(new THREE.HemisphereLight(0xb9a6ff, 0x2a1d4d, 1.5));
  const sun = new THREE.DirectionalLight(0xcfc4ff, 0.6);
  sun.position.set(20, 30, 10);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -35, right: 35, top: 35, bottom: -35, near: 1, far: 120 });
  scene.add(sun, sun.target);

  // 바닥: 보랏빛 달 표면, 분화구 안은 더 어둡고 테두리는 밝게, 제단은 금빛
  const dustA = new THREE.Color(0x5a4a8a), dustB = new THREE.Color(0x4a3c78), deep = new THREE.Color(0x35295c), rim = new THREE.Color(0x8a7cc0), gold = new THREE.Color(0xa88fd8);
  buildGround(scene, S, 240, spaceHeight, (x, z, y) => {
    if (Math.hypot(x - SPACE.altar.x, z - SPACE.altar.z) < SPACE.altar.r + 1) return gold;
    for (const c of SPACE.craters) {
      const d = Math.hypot(x - c.x, z - c.z);
      if (d < c.r) return deep;
      if (d < c.r + 2.5) return rim;
    }
    return Math.random() < 0.5 ? dustA : dustB;
  });

  // ---------- 하늘: 별 + 태양과 행성들 (하늘을 올려다보면 보인다) ----------
  {
    const n = 2200;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2), u = rand(0.02, 1), r = 340;
      pos[i * 3] = Math.cos(a) * Math.sqrt(1 - u * u) * r;
      pos[i * 3 + 1] = u * r;
      pos[i * 3 + 2] = Math.sin(a) * Math.sqrt(1 - u * u) * r;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    scene.add(new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xffffff, size: 1.8, sizeAttenuation: true, fog: false })));
  }
  const planets = [];
  for (const p of SOLAR) {
    const R = 300;
    const x = Math.sin(p.az) * Math.cos(p.el) * R, y = Math.sin(p.el) * R, z = -Math.cos(p.az) * Math.cos(p.el) * R; // 북쪽(-z) 하늘에 한 줄로
    const g = new THREE.Group();
    const mat = p.glow
      ? new THREE.MeshBasicMaterial({ color: p.color, fog: false })
      : new THREE.MeshStandardMaterial({ color: p.color, emissive: p.color, emissiveIntensity: 0.35, fog: false });
    const body = new THREE.Mesh(new THREE.SphereGeometry(p.r, 28, 20), mat);
    g.add(body);
    if (p.glow) {
      const halo = new THREE.Mesh(new THREE.SphereGeometry(p.r * 1.6, 24, 18), new THREE.MeshBasicMaterial({ color: 0xffb347, transparent: true, opacity: 0.25, fog: false, depthWrite: false }));
      g.add(halo);
      const light = new THREE.PointLight(0xffe0a0, 2.5, 0);
      g.add(light);
    }
    if (p.bands) for (const [dy, col] of [[0.35, 0xb8834a], [-0.2, 0xf0d9b0], [0.05, 0xb8834a]]) {
      const band = new THREE.Mesh(new THREE.TorusGeometry(p.r * Math.sqrt(1 - dy * dy), p.r * 0.06, 6, 40), new THREE.MeshBasicMaterial({ color: col, fog: false }));
      band.rotation.x = Math.PI / 2; band.position.y = p.r * dy;
      g.add(band);
    }
    if (p.ring) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(p.r * 1.4, p.r * 2.1, 48), new THREE.MeshBasicMaterial({ color: 0xf1e3b8, side: THREE.DoubleSide, transparent: true, opacity: 0.75, fog: false }));
      ring.rotation.x = Math.PI / 2.4; ring.rotation.y = 0.3;
      g.add(ring);
    }
    if (p.moon) {
      const moon = new THREE.Mesh(new THREE.SphereGeometry(p.r * 0.27, 12, 10), new THREE.MeshBasicMaterial({ color: 0xe8e0ff, fog: false }));
      moon.position.set(p.r * 1.8, p.r * 0.4, 0);
      g.add(moon);
      g.userData.moon = moon;
    }
    const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: makeLabelTexture(p.name, 'rgba(0,0,0,0)', '#ffffff', 64), transparent: true, fog: false, depthTest: false }));
    label.scale.set(p.r * 2.6 + 14, (p.r * 2.6 + 14) / 4, 1);
    label.position.y = -p.r - 6 - (p.ring ? p.r * 0.6 : 0);
    g.add(label);
    g.position.set(x, y, z);
    g.userData.spin = rand(0.05, 0.2);
    scene.add(g);
    planets.push(g);
  }

  // ---------- 땅 위: 빛나는 수정 기둥(장애물), 우주 바위, 떠다니는 별빛, 유성, 인공위성 ----------
  const crystalColors = [0xff8bd6, 0x8bffe8, 0xc38bff, 0xfff28b];
  const crystalItems = crystalColors.map(() => []);
  const crystals = [];
  for (let i = 0; i < 140; i++) {
    const x = rand(-S / 2 + 6, S / 2 - 6), z = rand(-S / 2 + 6, S / 2 - 6);
    if (Math.hypot(x - SPACE.spawn.x, z - SPACE.spawn.z) < 10 || Math.hypot(x - SPACE.altar.x, z - SPACE.altar.z) < SPACE.altar.r + 3 || Math.hypot(x - SPACE.ufoPad.x, z - SPACE.ufoPad.z) < 10) continue;
    const ci = i % crystalColors.length;
    const y = spaceHeight(x, z);
    for (let k = 0; k < 3; k++) {
      const h = rand(1, 2.8);
      crystalItems[ci].push({ x: x + rand(-0.5, 0.5), y: y + h * 0.5, z: z + rand(-0.5, 0.5), sx: 0.4, sy: 0.4 * h * 1.6, sz: 0.4, rx: rand(-0.3, 0.3), ry: rand(0, 3), rz: rand(-0.3, 0.3) });
    }
    if (crystals.length < 6 && i % 12 === 0) { const light = new THREE.PointLight(crystalColors[ci], 2.4, 12); light.position.set(x, y + 1.4, z); light.userData.phase = rand(0, 6); scene.add(light); crystals.push(light); } // 점광원은 최대 6개
    block(x, z, 0.8);
  }
  crystalColors.forEach((col, ci) => decor.add(makeInstanced(new THREE.OctahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.9, transparent: true, opacity: 0.9 }), crystalItems[ci])));
  const rockItems = [];
  for (let i = 0; i < 160; i++) {
    const x = rand(-S / 2 + 4, S / 2 - 4), z = rand(-S / 2 + 4, S / 2 - 4);
    if (Math.hypot(x - SPACE.spawn.x, z - SPACE.spawn.z) < 8 || Math.hypot(x - SPACE.altar.x, z - SPACE.altar.z) < SPACE.altar.r + 2 || Math.hypot(x - SPACE.ufoPad.x, z - SPACE.ufoPad.z) < 9) continue;
    const r = rand(0.4, 1.6);
    rockItems.push({ x, y: spaceHeight(x, z) + 0.2, z, s: r, rx: rand(0, 3), ry: rand(0, 3) });
    block(x, z, r * 0.9);
  }
  decor.add(makeInstanced(new THREE.DodecahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ color: 0x6d5f9a, roughness: 1 }), rockItems, { shadow: true }));
  const orbs = [];
  for (let i = 0; i < 120; i++) {
    const col = crystalColors[i % crystalColors.length];
    const o = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 6), new THREE.MeshBasicMaterial({ color: col }));
    o.userData = { x: rand(-S / 2, S / 2), z: rand(-S / 2, S / 2), h: rand(1.5, 5), phase: rand(0, 10), r: rand(1, 3) };
    scene.add(o);
    orbs.push(o);
  }
  const meteors = [];
  for (let i = 0; i < 6; i++) {
    const m = new THREE.Mesh(new THREE.ConeGeometry(0.25, 6, 6), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, fog: false }));
    m.userData = { phase: rand(0, 20), speed: rand(0.6, 1.1), x0: rand(-125, 125), z0: rand(-125, 55) };
    m.rotation.z = Math.PI / 4;
    scene.add(m);
    meteors.push(m);
  }
  const satellite = new THREE.Group();
  {
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.2, 1.2), new THREE.MeshStandardMaterial({ color: 0xd0d4dc, fog: false }));
    const panelMat = new THREE.MeshStandardMaterial({ color: 0x2a4ea0, emissive: 0x1a2f66, emissiveIntensity: 0.5, fog: false, side: THREE.DoubleSide });
    for (const sx of [-3.2, 3.2]) { const p = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 1.4), panelMat); p.position.x = sx; satellite.add(p); }
    const dish = new THREE.Mesh(new THREE.SphereGeometry(0.7, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xffffff, fog: false }));
    dish.position.y = 1.0;
    satellite.add(body, dish);
    scene.add(satellite);
  }

  // ---------- 꿈의 제단: 우주 보스 팬텀이 지키는 곳. 빛기둥 고리 + 떠 있는 돌 ----------
  {
    const a = SPACE.altar;
    const y = spaceHeight(a.x, a.z);
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(a.r, a.r + 1, 0.5, 40), new THREE.MeshStandardMaterial({ color: 0xc9b8ff, emissive: 0x6a4ca8, emissiveIntensity: 0.5 }));
    disc.position.set(a.x, y + 0.2, a.z);
    decor.add(disc);
    for (let i = 0; i < 8; i++) {
      const ang = (i / 8) * Math.PI * 2;
      const px = a.x + Math.cos(ang) * (a.r - 1), pz = a.z + Math.sin(ang) * (a.r - 1);
      const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.45, 3.2, 8), new THREE.MeshStandardMaterial({ color: 0xe6dcff, emissive: 0x8c6fd6, emissiveIntensity: 0.6 }));
      pillar.position.set(px, y + 2.0, pz);
      decor.add(pillar); block(px, pz, 0.5);
    }
    const light = new THREE.PointLight(0xd8b4ff, 6, 26);
    light.position.set(a.x, y + 5, a.z);
    scene.add(light);
  }

  // ---------- 착륙장: 돌아가는 로켓 (E 로 탄다) + 표지판 ----------
  const rx = SPACE.spawn.x + 8, rz = SPACE.spawn.z - 6, ry = spaceHeight(rx, rz);
  const pad = new THREE.Mesh(new THREE.CylinderGeometry(6, 6, 0.3, 24), new THREE.MeshStandardMaterial({ color: 0x9aa0a8 }));
  pad.position.set(rx, ry + 0.15, rz);
  decor.add(pad);
  const rocket = new THREE.Group();
  {
    const body = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 7, 20), new THREE.MeshStandardMaterial({ color: 0xf4f4f8 })); body.position.y = 4.5; body.castShadow = true;
    const nose = new THREE.Mesh(new THREE.ConeGeometry(1.1, 2.2, 20), new THREE.MeshStandardMaterial({ color: 0xe8453c })); nose.position.y = 9.1;
    const win = new THREE.Mesh(new THREE.SphereGeometry(0.4, 12, 10), new THREE.MeshStandardMaterial({ color: 0x66e0ff, emissive: 0x2288aa, emissiveIntensity: 0.5 })); win.position.set(0, 6, 1.0);
    rocket.add(body, nose, win);
    for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2; const fin = new THREE.Mesh(new THREE.BoxGeometry(0.2, 2.2, 1.6), new THREE.MeshStandardMaterial({ color: 0x3fb8e8 })); fin.position.set(Math.cos(a) * 1.4, 1.6, Math.sin(a) * 1.4); fin.rotation.y = -a; rocket.add(fin); }
  }
  const rocketFlame = new THREE.Mesh(new THREE.ConeGeometry(0.8, 2.5, 12), new THREE.MeshStandardMaterial({ color: 0xffb347, emissive: 0xff6a00, emissiveIntensity: 1.5, transparent: true, opacity: 0.9 }));
  rocketFlame.rotation.x = Math.PI; rocketFlame.position.y = -0.3; rocketFlame.visible = false;
  rocket.add(rocketFlame);
  rocket.position.set(rx, ry + 0.3, rz);
  scene.add(rocket);
  const rocketObstacle = { x: rx, z: rz, r: 1.6 };
  obstacles.push(rocketObstacle);
  const pilotAt = { x: rx - 4.6, z: rz + 4.6 }; // 착륙장 로켓 옆
  const astronaut = makeNpc({ outfit: 'astronaut', name: '코리', model: '코리.glb' });
  astronaut.position.set(pilotAt.x, spaceHeight(pilotAt.x, pilotAt.z), pilotAt.z);
  astronaut.rotation.y = -2.3;
  decor.add(astronaut); block(pilotAt.x, pilotAt.z, 0.6);
  const drop = new THREE.Mesh(new THREE.CircleGeometry(2.2, 24), new THREE.MeshBasicMaterial({ color: 0xc9b8ff, transparent: true, opacity: 0.25 }));
  drop.rotation.x = -Math.PI / 2;
  drop.position.set(SPACE.spawn.x, spaceHeight(SPACE.spawn.x, SPACE.spawn.z) + 0.03, SPACE.spawn.z);
  scene.add(drop);

  // ---------- UFO 정거장: 조종사 손오공에게 말을 걸면 태양과 아홉 행성으로 갈 수 있다 (도착지는 팝업에서 고른다) ----------
  const station = buildUfoStation(scene, decor, block, { x: SPACE.ufoPad.x, z: SPACE.ufoPad.z, heightFn: spaceHeight, to: null, color: 0xc38bff, lines: (c) => [
    `안녕, ${c.name}! 난 UFO 조종사 손오공야. 이 비행접시로 태양이랑 수성·금성·지구·화성·목성·토성·천왕성·해왕성·명왕성까지 갈 수 있어!`,
    '행성마다 사는 포켓몬이 달라. 뜨거운 태양엔 불 포켓몬, 파란 해왕성엔 물 포켓몬, 어두운 명왕성엔 고스트 포켓몬이 살아.',
    '중력도 행성마다 달라서 명왕성에서는 둥둥 뜨고 목성에서는 점프가 낮아. 하늘을 올려다보면 태양과 행성들이 한 줄로 보여.',
    '가고 싶으면 나한테 말을 걸고 "다른 행성으로 가기" 버튼을 눌러! 행성마다 UFO 정거장이 있어서 언제든 돌아올 수 있어.',
  ] });

  function animate(t) {
    station.animate(t);
    for (const l of crystals) l.intensity = 1.8 + Math.sin(t * 2 + l.userData.phase) * 0.6;
    for (const o of orbs) {
      const u = o.userData;
      o.position.set(u.x + Math.cos(t * 0.5 + u.phase) * u.r, spaceHeight(u.x, u.z) + u.h + Math.sin(t * 1.3 + u.phase) * 0.6, u.z + Math.sin(t * 0.5 + u.phase) * u.r);
    }
    for (const m of meteors) {
      const u = m.userData;
      const life = ((t * u.speed + u.phase) % 9) / 9;
      m.visible = life < 0.35;
      m.position.set(u.x0 + life * 120, 80 - life * 140, u.z0 - 80 + life * 60);
    }
    for (const g of planets) {
      g.rotation.y = t * g.userData.spin;
      if (g.userData.moon) { const mo = g.userData.moon; const r = mo.position.length(); mo.position.set(Math.cos(t * 0.6) * r, Math.sin(t * 0.6) * r * 0.25, Math.sin(t * 0.6) * r); }
    }
    satellite.position.set(Math.cos(t * 0.08) * 90, 60 + Math.sin(t * 0.3) * 4, Math.sin(t * 0.08) * 90 - 20);
    satellite.rotation.y = t * 0.3;
  }

  return {
    sun, animate, terrain: SPACE_TERRAIN, decor, spawn: SPACE.spawn, dark: true, gravity: SPACE.gravity,
    npcs: [{ x: pilotAt.x, z: pilotAt.z, mesh: astronaut, name: '코리', boards: 'rocket', lines: (c) => [
      `꿈의우주에 온 걸 환영해, ${c.name}! 난 우주비행사 코리야. 중력이 약해서 점프가 높고 오래 떠. 화면을 위로 밀면 태양과 행성이 보여.`,
      `여기 포켓몬은 페어리·에스퍼·고스트·전기 속성이야. 공격 ${c.zone.atkRange}쯤 되어야 편하게 이겨. 피카츄와 라이츄도 여기 살아.`,
      '로켓단 본대는 벌써 지구를 떠났어. 별의 문을 넘어 행성 열 곳으로 흩어졌대. 지구는 연습이었던 거야!',
      c.conquered.space ? '보스 팬텀을 이겼구나! 이제 별의 문이 열렸어. 그곳의 메가팬텀까지 잡으면… 굉장한 일이 일어난대!' : `북쪽 제단에 보스 팬텀이 있어. 체력 240, 공격 26! 공격 ${c.zone.targetAtk + 3} 이상, 체력 70쯤 되면 도전해 봐. 고스트는 고스트에 세니 조심!`,
      '여기 블록은 하나가 3개 가치야. 푸른숲으로 돌아가려면 나한테 말을 걸고 빨간 "출발" 버튼을 누르면 돼!',
      '서쪽 UFO 정거장의 손오공은 비행접시로 태양이랑 행성들까지 데려다줘. 행성마다 사는 포켓몬이 다르대!',
    ] }, station.npc],
    ufo: station.vehicle,
    ufoArrival: station.arrival,
    rocket: { kind: 'rocket', mesh: rocket, base: rocket.position.clone(), obstacle: rocketObstacle, flame: rocketFlame, boardPoint: { x: rx - 2.6, z: rz + 2.6 }, to: 'forest' },
    wildSpots: [[-54.5, 68.2], [54.5, 75.0], [-75.0, 6.8], [81.8, 13.6], [-27.3, -40.9], [40.9, -34.1], [-102.3, -40.9], [102.3, -75.0], [-54.5, -109.1], [54.5, -109.1], [-115.9, 75.0], [115.9, 81.8], [0.0, 34.1], [-129.5, -109.1], [129.5, -27.3], [-20.5, 136.4], [95.5, -129.5], [-95.5, 129.5], [99.5, 128.2], [111.7, 19.1], [59.0, -79.7], [-24.7, -96.4], [31.6, -125.6], [60.3, -46.7], [1.5, 137.6], [-83.5, -25.4]],
    bossSpot: { x: SPACE.altar.x, z: SPACE.altar.z },
    pickupSpots: [[-19.1, 81.8], [19.1, 81.8], [-47.7, 27.3], [47.7, 27.3], [-75.0, -27.3], [79.1, -34.1], [-34.1, -81.8], [34.1, -81.8], [0.0, 6.8], [-95.5, 40.9], [95.5, 40.9], [-109.1, -81.8], [109.1, -102.3], [0.0, -129.5], [-16.4, 54.5], [16.4, 54.5], [-68.2, 109.1], [68.2, 111.8], [-136.4, 122.7], [136.4, 122.7], [-136.4, -13.6], [136.4, 0.0], [0.0, 136.4], [-129.5, -136.4], [30.5, -94.9], [-126.3, 101.5], [-51.4, 126.6], [109.5, -33.7], [16.4, 33.2], [121.6, 1.9], [-72.4, -54.9], [13.4, -134.8], [-23.4, 22.1], [-132.5, 32.0]],
  };
}
