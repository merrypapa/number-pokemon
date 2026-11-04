import * as THREE from 'three';
import { waterMaterial } from './fx.js';
import { makeNpc } from './npc.js';
import { rand } from './util.js';
import { buildGround, makePortal, makeInstanced, makePillSprite } from './world.js';

// 번개동굴 (140x140). 지하동굴 동쪽 벽의 "번개 굴"로 들어오면 도착한다. 전기 포켓몬(피카츄·코일·쥬피썬더·닌자피카츄)이 산다.
// 벤치마크: 멕시코 **나이카 수정 동굴**(길이 10m 넘는 거대한 하얀 셀레나이트 수정이 동굴을 가로지른다) + 베네수엘라 **카타툼보 번개**
// (마라카이보 호수 위에서 1년에 260일 밤마다 번개가 끊이지 않는 "영원한 폭풍"). 거대한 수정 기둥 속으로 노란 전기가 흐르고,
// 가장 큰 수정 위의 번개 제단 너머 북쪽 벽이 호수 쪽으로 뚫려 있어 폭풍 구름 아래 번개가 쉬지 않고 친다.
// 어둡고, 바닥은 검푸른 바위. 노란 번개 수정 기둥이 지직거리고, 푸른 전기가 흐르는 웅덩이(감전되니 못 들어간다),
// 천장에서 가끔 번개가 내리쳐 동굴이 번쩍인다. 전선을 감은 테슬라 탑 사이로 전기 아크가 튄다.
// 북쪽 끝 번개 제단에 보스 라이츄. 남쪽 포탈로 지하동굴에 돌아간다.
export const THUNDER = {
  size: 140,
  spawn: { x: 0, z: 48 },
  portal: { x: 0, z: 56 },
  altar: { x: 0, z: -50, r: 7, h: 3.5 }, // 보스 라이츄가 선 번개 제단: 거대한 육각 수정 기둥이 모인 수정 고원 (높이 3.5, 둘레는 절벽)
  ramp: { half: 1.3, z0: -43.6, z1: -32 }, // 고원으로 오르는 쓰러진 거대 수정 (x = altar.x ± half, z0 = 고원 끝 → z1 = 땅)
  pools: [{ x: -30, z: 20, r: 6 }, { x: 34, z: 2, r: 5.5 }, { x: -38, z: -30, r: 6 }, { x: 36, z: -36, r: 5 }, { x: 8, z: -8, r: 4 }, { x: -12, z: 36, r: 4 }, { x: 50, z: 34, r: 5 }],
  bumps: [{ x: -24, z: -8, r: 12, h: 1.3 }, { x: 26, z: 24, r: 13, h: 1.1 }, { x: -50, z: 10, r: 11, h: 1.5 }, { x: 48, z: -16, r: 12, h: 1.2 }, { x: 14, z: -32, r: 10, h: 1.0 }, { x: -20, z: 50, r: 10, h: 0.9 }],
  towers: [{ x: -22, z: -40 }, { x: 22, z: -40 }, { x: -44, z: 44 }, { x: 44, z: 46 }, { x: -52, z: -50 }, { x: 54, z: -54 }], // 테슬라 탑 (아크가 튄다)
  wallR: 66,
  mouth: { a: -Math.PI / 2, half: 0.3 }, // 북쪽 벽의 뚫린 곳 (제단 뒤, 카타툼보 호수 쪽): 각 a ± half (x = cos a·r, z = sin a·r)
  // 나이카 거대 수정: 땅에 박힌 밑동(x, z)에서 yaw 방향으로 tilt 만큼 비스듬히 솟는다 (길이 len, 굵기 r). 길·포켓몬 자리에 걸리는 것은 buildThunder 가 뺀다
  beams: [[-14, 10, 0.6, 12, 0.35, 1.0], [16, 4, 2.4, 13, 0.3, 1.1], [-40, -4, 1.2, 14, 0.4, 1.2], [40, -30, 3.6, 12, 0.32, 1.0], [-10, -32, 5.0, 11, 0.42, 0.9], [14, -30, 4.2, 12, 0.38, 1.0],
    [-48, -34, 0.3, 13, 0.3, 1.2], [50, 20, 2.0, 12, 0.36, 1.0], [-30, 46, 5.6, 10, 0.45, 0.85], [34, 48, 3.9, 11, 0.4, 0.9], [-58, 0, 0.0, 12, 0.5, 1.1], [60, -24, 3.1, 12, 0.5, 1.1], [-26, -4, 4.0, 10, 0.4, 0.9], [28, 10, 1.0, 11, 0.38, 0.95]],
};
function angDiffT(a, b) { let d = (a - b) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; }
function thunderHeight(x, z) {
  let y = 0;
  for (const b of THUNDER.bumps) { const dx = x - b.x, dz = z - b.z; y += b.h * Math.exp(-(dx * dx + dz * dz) / (b.r * b.r)); }
  for (const p of THUNDER.pools) { const d = Math.hypot(x - p.x, z - p.z); if (d < p.r + 1.5) y -= 0.45 * Math.min(1, (p.r + 1.5 - d) / 2); }
  const A = THUNDER.altar, ad = Math.hypot(x - A.x, z - A.z), R = THUNDER.ramp;
  if (ad < A.r) return A.h; // 수정 고원 윗면
  if (Math.abs(x - A.x) < R.half && z > R.z0 && z < R.z1) return Math.max(y, A.h * (R.z1 - z) / (R.z1 - R.z0)); // 쓰러진 수정 위 비탈
  return y;
}
function thunderBlocked(x, z) {
  if (Math.hypot(x, z) > THUNDER.wallR - 1) return true; // 동굴 벽
  const A = THUNDER.altar, ad = Math.hypot(x - A.x, z - A.z), R = THUNDER.ramp;
  if (ad >= A.r && ad < A.r + 1.8 && !(Math.abs(x - A.x) < R.half && z > A.z)) return true; // 고원 둘레의 수정 기둥 치마 (쓰러진 수정 비탈만 열려 있다)
  return THUNDER.pools.some((p) => Math.hypot(x - p.x, z - p.z) < p.r + 0.3); // 전기 웅덩이: 감전되니 못 들어간다
}
const THUNDER_WILD = [[-22, 30], [24, 34], [-44, 20], [44, 14], [-18, -18], [22, -16], [-52, -14], [52, -8], [-30, -46], [30, -48], [0, -22], [-56, 36], [56, 44], [10, 16]];
const THUNDER_PICKUPS = [[-12, 28], [14, 22], [-36, 2], [38, -22], [0, -36], [-24, 56], [26, 56], [-58, 8], [58, 24], [6, 2], [-8, -44], [46, 0]];
export const THUNDER_TERRAIN = { height: thunderHeight, inHole: () => false, blocked: thunderBlocked, size: THUNDER.size, obstacles: [], ledge: 0.9 }; // ledge: 수정 고원(3.5m)은 쓰러진 수정 비탈로만 오른다

export function buildThunder(scene) {
  const S = THUNDER.size;
  const decor = new THREE.Group();
  scene.add(decor);
  const obstacles = THUNDER_TERRAIN.obstacles;
  obstacles.length = 0;
  const block = (x, z, r) => obstacles.push({ x, z, r });

  scene.background = new THREE.Color(0x070a16);
  scene.fog = new THREE.Fog(0x070a16, 18, 90); // 제단 너머 호수의 폭풍까지 보이게 조금 멀리
  scene.add(new THREE.HemisphereLight(0x6a7fc0, 0x1a1830, 0.8)); // 나이카: 수정이 보이게 예전보다 조금 밝게
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
    if (Math.abs(angDiffT(a, THUNDER.mouth.a)) < THUNDER.mouth.half) continue; // 북쪽은 호수 쪽으로 뚫려 있다
    const x = Math.cos(a) * r, z = Math.sin(a) * r, h = rand(9, 16), cr = rand(3.5, 6);
    wallItems.push({ x, y: h / 2 - 1, z, sx: cr, sy: h, sz: cr, ry: rand(0, 3) });
  }
  decor.add(makeInstanced(new THREE.ConeGeometry(1, 1, 6), rockMat, wallItems));

  // 전기 웅덩이: 푸른 빛이 흐르는 물 + 위에서 지직거리는 번개 고리
  const poolLights = [], poolRings = [];
  for (const P of THUNDER.pools) {
    const water = new THREE.Mesh(new THREE.CircleGeometry(P.r + 0.6, 28), waterMaterial({ color: 0x1e9bff, emissive: 0x0a5fd0, emissiveIntensity: 0.9, transparent: true, opacity: 0.85, roughness: 0.1 }, { scale: 0.6 }));
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

  // 나이카 거대 수정: 하얀 셀레나이트 기둥(육각) 속으로 노란 전기 불꽃이 밑동에서 끝으로 흐른다. 낮은 쪽은 못 지나간다(선분 장애물)
  const beamMat = new THREE.MeshStandardMaterial({ color: 0xfffbea, emissive: 0xfff0c0, emissiveIntensity: 0.35, roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.92 });
  const sparkMat = new THREE.MeshBasicMaterial({ color: 0xfff1a0 });
  const beams = [], keepOut = [...THUNDER_WILD, ...THUNDER_PICKUPS].map(([x, z]) => ({ x, z, r: 2.5 })).concat(THUNDER.pools.map((p) => ({ x: p.x, z: p.z, r: p.r + 2 })), THUNDER.towers.map((t) => ({ x: t.x, z: t.z, r: 3 })), [{ x: THUNDER.altar.x, z: THUNDER.altar.z, r: THUNDER.altar.r + 4 }, { x: 5, z: 44, r: 4 }, { x: THUNDER.altar.x, z: (THUNDER.ramp.z0 + THUNDER.ramp.z1) / 2, r: 8 }]);
  for (const [bx, bz, yaw, len, tilt, br] of THUNDER.beams) {
    const dx = Math.cos(yaw), dz = Math.sin(yaw), low = Math.min(len * Math.cos(tilt), 2.4 / Math.tan(tilt)); // 땅에서 2.4m 아래인 구간 = 못 지나가는 곳
    const ex = bx + dx * low, ez = bz + dz * low;
    const segD = (o) => { const vx = ex - bx, vz = ez - bz, t = Math.max(0, Math.min(1, ((o.x - bx) * vx + (o.z - bz) * vz) / (vx * vx + vz * vz))); return Math.hypot(o.x - (bx + vx * t), o.z - (bz + vz * t)); };
    if (keepOut.some((o) => segD(o) < o.r + br) || (Math.abs(bx) < 7 && bz > -46) || (Math.abs(ex) < 7 && ez > -46) || Math.hypot(ex, ez) > THUNDER.wallR - 3) continue; // 등불 길(x ±3)과 포켓몬·블록 자리는 비운다
    const g = new THREE.Group(), y0 = thunderHeight(bx, bz) - 0.6;
    g.position.set(bx, y0, bz); g.rotation.set(0, -yaw, 0); decor.add(g);
    const tiltG = new THREE.Group(); tiltG.rotation.z = tilt; g.add(tiltG); // 그룹 안: +x 가 기둥 방향
    const m = new THREE.Mesh(new THREE.CylinderGeometry(br, br * 1.1, len, 6), beamMat); m.rotation.z = -Math.PI / 2; m.position.x = len / 2; m.castShadow = true; tiltG.add(m);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(br, br * 1.6, 6), beamMat); tip.rotation.z = -Math.PI / 2; tip.position.x = len + br * 0.8; tiltG.add(tip);
    const spark = new THREE.Mesh(new THREE.SphereGeometry(br * 0.45, 8, 6), sparkMat); tiltG.add(spark);
    beams.push({ spark, len, ph: rand(0, 3), sp: rand(0.25, 0.45) });
    if (beams.length <= 3) { const l = new THREE.PointLight(0xffd27a, 2.4, 22); l.position.set(bx + dx * len * 0.5, y0 + Math.sin(tilt) * len * 0.5 + 1.5, bz + dz * len * 0.5); decor.add(l); } // 나이카 동굴의 금빛: 거대 수정 셋만 점광원
    obstacles.push({ ax: bx, az: bz, bx: ex, bz: ez, r: br + 0.3 });
  }

  // 번개 수정: 노란 빛이 나는 뾰족 기둥 무리 (점광원은 몇 개만)
  const crystalMat = new THREE.MeshStandardMaterial({ color: 0xffe36b, emissive: 0xffc400, emissiveIntensity: 0.8, roughness: 0.3 });
  const crystals = [], crystalLights = [];
  for (let i = 0; i < 34; i++) {
    const x = rand(-S / 2 + 12, S / 2 - 12), z = rand(-S / 2 + 12, S / 2 - 12);
    if (Math.hypot(x, z) > THUNDER.wallR - 6 || Math.hypot(x - THUNDER.spawn.x, z - THUNDER.spawn.z) < 8 || Math.hypot(x - THUNDER.altar.x, z - THUNDER.altar.z) < THUNDER.altar.r + 3 || thunderBlocked(x, z) || (Math.abs(x) < 6 && z > -46) || keepOut.some((o) => Math.hypot(x - o.x, z - o.z) < o.r + 1) || obstacles.some((o) => o.ax !== undefined && Math.hypot(x - (o.ax + o.bx) / 2, z - (o.az + o.bz) / 2) < 5)) continue; // 등불 길·포켓몬·블록 자리·거대 수정 곁은 비운다
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

  // 번개 제단 = 수정 고원 (북쪽, 번개 호수 앞): 굵은 육각 수정 기둥이 벌집처럼 빽빽이 모여 평평한 윗면을 이루고(높이 3.5),
  // 둘레는 높이가 들쭉날쭉한 기둥 치마, 가장자리에 키 큰 수정 첨탑(끝끼리 전기 아크), 남쪽엔 쓰러진 거대 수정이 비탈로 걸쳐 있다.
  const spireTips = [];
  {
    const A = THUNDER.altar, R = THUNDER.ramp, cols = [], skirt = [];
    for (let gx = -A.r; gx <= A.r; gx += 1.75) for (let gz = -A.r; gz <= A.r; gz += 1.52) {
      const x = gx + ((Math.round(gz / 1.52) & 1) ? 0.875 : 0), d = Math.hypot(x, gz);
      if (d < A.r - 0.4) { const hh = A.h + 0.05 + rand(0, 0.04); cols.push({ x: A.x + x, y: hh / 2, z: A.z + gz, sx: 1, sy: hh, sz: 1 }); } // 윗면 기둥 (거의 평평)
    }
    for (let i = 0; i < 40; i++) { // 치마: 고원 둘레 기둥들 (바깥으로 갈수록 낮게)
      const a = (i / 40) * Math.PI * 2, x = Math.cos(a), z = Math.sin(a);
      if (z > 0 && Math.abs(x * (A.r + 1)) < R.half + 0.6) continue; // 쓰러진 수정 비탈 자리는 비운다
      for (const [rr, hh] of [[A.r - 0.2, A.h + rand(-0.1, 0.4)], [A.r + 0.9, A.h * rand(0.45, 0.8)]]) skirt.push({ x: A.x + x * rr, y: hh / 2, z: A.z + z * rr, sx: rand(0.8, 1.1), sy: hh, sz: rand(0.8, 1.1), ry: rand(0, 1) });
    }
    const hexCol = new THREE.CylinderGeometry(1.0, 1.0, 1, 6);
    const topMat = new THREE.MeshStandardMaterial({ color: 0xfffbea, emissive: 0xfff0c0, emissiveIntensity: 0.3, roughness: 0.2 });
    decor.add(makeInstanced(hexCol, topMat, cols, { shadow: false }), makeInstanced(hexCol, beamMat, skirt, { shadow: true }));
    for (let i = 0; i < 7; i++) { // 가장자리 첨탑 일곱 (남쪽 비탈 쪽은 비운다): 끝에 전기 구슬, 이웃끼리 아크
      const a = -Math.PI / 2 + (i - 3) * 0.62, x = A.x + Math.cos(a) * (A.r - 1.2), z = A.z + Math.sin(a) * (A.r - 1.2), h = 4.5 + (3 - Math.abs(i - 3)) * 1.1;
      const sp = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.75, h, 6), beamMat); sp.position.set(x, A.h + h / 2 - 0.1, z); sp.rotation.set(Math.sin(a) * -0.12, 0, Math.cos(a) * 0.12); sp.castShadow = true;
      const cap = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.2, 6), beamMat); cap.position.set(0, h / 2 + 0.6, 0); sp.add(cap);
      const orb = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), new THREE.MeshBasicMaterial({ color: 0xfff6b0 })); orb.position.set(0, h / 2 + 1.3, 0); sp.add(orb);
      decor.add(sp); block(x, z, 0.75);
      spireTips.push(new THREE.Vector3(x, A.h + h + 1.2, z));
    }
    // 쓰러진 거대 수정: 땅(z1)에서 고원 끝(z0)까지 비스듬히 걸친 육각 기둥. 윗면(납작한 면)이 걷는 비탈
    const run = R.z1 - R.z0, len = Math.hypot(run, A.h) + 1.2, ang = Math.atan2(A.h, run), rr = R.half / 0.866;
    const rampGeo = new THREE.CylinderGeometry(rr, rr, len, 6); rampGeo.rotateY(Math.PI / 6); // 납작한 면이 지오메트리 +z 쪽 (회전하면 위쪽)
    const ramp = new THREE.Mesh(rampGeo, beamMat); ramp.rotation.x = ang - Math.PI / 2; // 기둥 축 +y → 비탈 방향 (위로, -z 쪽)
    ramp.position.set(A.x, A.h / 2 - Math.cos(ang) * R.half + 0.08, (R.z0 + R.z1) / 2 - Math.sin(ang) * R.half); /* +0.08: 같은 높이의 땅(비탈)과 겹쳐 깜빡이지 않게 */ // 축은 걷는 비탈(윗면)보다 변 반지름만큼 아래
    decor.add(ramp); /* 그림자는 끈다: 비스듬한 면에 자기 그림자 줄무늬가 졌다 */
    const altarLight = new THREE.PointLight(0xffe6a0, 5, 26); altarLight.position.set(A.x, A.h + 4, A.z); decor.add(altarLight);
    const sign = makePillSprite('⚡ 번개 제단 · 수정 고원 · 보스', { bg: '#20232e', fg: '#ffd93d', border: '#ffd93d' }, 1.3);
    sign.position.set(A.x, A.h + 5.5, A.z + 5); decor.add(sign);
    const rampSign = makePillSprite('💎 쓰러진 수정을 타고 올라가요', { bg: '#20232e', fg: '#fff1c8', border: '#ffd93d' }, 0.7);
    rampSign.position.set(A.x + 2.6, 2.2, R.z1 - 1); decor.add(rampSign);
  }
  const spireArcs = [];
  for (let i = 0; i + 1 < spireTips.length; i++) { const geo = new THREE.BufferGeometry().setFromPoints(Array.from({ length: 10 }, () => new THREE.Vector3())); const line = new THREE.Line(geo, arcMat); line.userData = { a: spireTips[i], b: spireTips[i + 1], phase: rand(0, 6) }; decor.add(line); spireArcs.push(line); }

  // 카타툼보 호수: 북쪽 벽의 뚫린 곳 너머 넓은 호수와 낮은 폭풍 구름, 번개가 쉬지 않고 친다 (호수는 벽 밖이라 못 간다)
  const M = THUNDER.mouth, lakeZ = -THUNDER.wallR - 45;
  const lake = new THREE.Mesh(new THREE.PlaneGeometry(220, 90), waterMaterial({ color: 0x14204a, roughness: 0.2, metalness: 0.3 }, { scale: 0.15, strength: 0.6, shine: 0.12 }));
  lake.rotation.x = -Math.PI / 2; lake.position.set(0, -1.4, lakeZ); decor.add(lake);
  const shore = []; for (let i = 0; i < 16; i++) { const a = M.a + (i / 15 - 0.5) * M.half * 2.2, r = THUNDER.wallR + rand(0.5, 2.5); shore.push({ x: Math.cos(a) * r, y: 0.1, z: Math.sin(a) * r, s: rand(0.8, 1.6), rx: rand(0, 3), ry: rand(0, 3) }); }
  decor.add(makeInstanced(new THREE.DodecahedronGeometry(1, 0), rockMat, shore));
  for (const side of [-1, 1]) { const a = M.a + side * (M.half + 0.04), r = THUNDER.wallR + 2; const c = new THREE.Mesh(new THREE.ConeGeometry(5, 22, 6), rockMat); c.position.set(Math.cos(a) * r, 10, Math.sin(a) * r); decor.add(c); } // 뚫린 곳 양옆의 높은 바위
  const cloudMat = new THREE.MeshStandardMaterial({ color: 0x1c1f38, emissive: 0x6a4cff, emissiveIntensity: 0, roughness: 1 });
  for (let i = 0; i < 9; i++) { const c = new THREE.Mesh(new THREE.SphereGeometry(rand(9, 14), 10, 8), cloudMat); c.scale.y = 0.45; c.position.set(rand(-60, 60), rand(22, 28), lakeZ + rand(-25, 25)); decor.add(c); }
  const stormBolts = [], stormFlash = new THREE.PointLight(0xd9c8ff, 0, 140); stormFlash.position.set(0, 18, lakeZ + 10); decor.add(stormFlash);
  for (let i = 0; i < 3; i++) { const b = new THREE.Line(new THREE.BufferGeometry().setFromPoints(Array.from({ length: 12 }, () => new THREE.Vector3())), new THREE.LineBasicMaterial({ color: 0xf0e6ff, transparent: true, opacity: 0 })); b.userData = { next: rand(0, 1.5), until: 0, from: new THREE.Vector3(), to: new THREE.Vector3() }; decor.add(b); stormBolts.push(b); }
  const lakeSign = makePillSprite('⚡ 카타툼보 번개 · 끝나지 않는 폭풍', { bg: '#1c1f38', fg: '#e9d8ff', border: '#9f8cff' }, 1.0);
  lakeSign.position.set(0, 5, -THUNDER.wallR + 3); decor.add(lakeSign);

  // 전선: 바닥을 따라 늘어진 케이블 몇 가닥 (장식)
  const cableMat = new THREE.MeshStandardMaterial({ color: 0x20232e });
  for (let i = 0; i < 10; i++) {
    const x1 = rand(-50, 50), z1 = rand(-50, 50), x2 = x1 + rand(-14, 14), z2 = z1 + rand(-14, 14);
    if ([[x1, z1], [x2, z2], [(x1 + x2) / 2, (z1 + z2) / 2]].some(([x, z]) => Math.hypot(x - THUNDER.altar.x, z - THUNDER.altar.z) < THUNDER.altar.r + 4 || thunderBlocked(x, z))) continue; // 제단 위·웅덩이 속으로는 전선을 두지 않는다
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
  const caveSign = makePillSprite('💎 나이카 수정 동굴 · 거대한 수정 속으로 전기가 흘러요', { bg: '#20232e', fg: '#fff1c8', border: '#ffd93d' }, 0.8);
  caveSign.position.set(-5, 2.6, THUNDER.spawn.z - 4); decor.add(caveSign);

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
    for (const a of spireArcs) { const u = a.userData; a.visible = Math.sin(t * 3 + u.phase) > 0; if (a.visible) zigzag(a, u.a, u.b, 0.35, t + u.phase); } // 수정 첨탑 끝끼리 튀는 전기
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
    for (const b of beams) { const u = ((t * b.sp + b.ph) % 1); b.spark.position.x = u * b.len; b.spark.scale.setScalar(0.6 + Math.sin(u * Math.PI) * 0.8); } // 수정 속을 흐르는 전기 불꽃
    beamMat.emissiveIntensity = 0.32 + Math.max(0, Math.sin(t * 2.3)) * 0.18;
    let storm = 0; // 카타툼보: 번개 셋이 저마다 0.4~1.6초마다 호수에 내리친다
    for (const b of stormBolts) {
      const u = b.userData;
      if (t > u.next) { u.next = t + rand(0.4, 1.6); u.until = t + rand(0.12, 0.3); const x = rand(-50, 50), z = lakeZ + rand(-25, 20); u.from.set(x + rand(-8, 8), 26, z + rand(-6, 6)); u.to.set(x, -1.4, z); }
      const lit = t < u.until; b.material.opacity = lit ? 1 : 0; if (lit) { zigzag(b, u.from, u.to, 2.2, t + u.next); storm = 1; }
    }
    stormFlash.intensity = storm ? 7 + Math.sin(t * 50) * 3 : 0; cloudMat.emissiveIntensity = storm ? 0.55 : 0;
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
      `여기 포켓몬은 세. 공격 ${c.zone.atkRange}쯤은 돼야 편하게 이겨. 지하동굴에서 레벨을 충분히 올리고 오렴.`,
      c.conquered.thunder ? '보스 라이츄를 이겼구나! 번개 제단이 조용해졌어. 대단해!' : `북쪽 번개 제단에 보스 라이츄가 있어. 체력 ${c.zone.bossHp || 100}에 공격이 세니까 공격 ${c.zone.targetAtk + 3} 이상, 체력 40쯤 되면 도전해 봐. 땅 포켓몬이면 훨씬 쉬워!`,
      '여기는 멕시코의 나이카 수정 동굴을 닮았어. 진짜 그곳엔 사람 키보다 열 배는 긴 하얀 수정이 누워 있대! 수정 속으로 노란 전기가 흐르는 게 보이지?',
      '번개 제단 뒤 북쪽 벽이 뚫려 있어. 그 너머 호수엔 베네수엘라의 카타툼보처럼 번개가 쉬지 않고 쳐. 1년에 260일 밤마다 번개가 친대!',
      '테슬라 탑 사이로 튀는 하얀 전기 아크도 구경해 봐. 만지면 안 돼!',
      '남쪽의 노란 포탈로 나가면 지하동굴의 번개 굴 앞이야.',
    ] }],
    wildSpots: THUNDER_WILD.map(([x, z]) => [x, z]),
    bossSpot: { x: THUNDER.altar.x, z: THUNDER.altar.z },
    pickupSpots: THUNDER_PICKUPS.map(([x, z]) => [x, z]),
  };
}
