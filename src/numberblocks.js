import * as THREE from 'three';
import { NUMBER_COLORS, RAINBOW, OUTLINE, colorForCount } from './palette.js';
import { terrainHeight } from './world.js';
import { tickModel } from './models.js';

// 숫자블록 친구: 블록 개수 = 숫자, 숫자마다 고유한 색.
// 규칙(number-mario 와 공통): 둥근 큐브 스택, 큰 흰자 눈 + 동공, 웃는 입, 막대 팔다리, 아래 블록 정면에 숫자 배지.

export const BLOCK = 0.6;      // 블록 한 칸 크기
const LEG = 0.12;              // 다리 높이 (블록은 이 위에 올라간다)

// 숫자별 블록 배치. col 은 왼쪽부터, row 는 아래부터 0. 실제 넘버블럭스 기본 형태와 같다.
function rect(cols, rows) {
  const cells = [];
  for (let row = 0; row < rows; row++) for (let col = 0; col < cols; col++) cells.push({ col, row });
  return cells;
}
export const SHAPES = {
  1: rect(1, 1), 2: rect(1, 2), 3: rect(1, 3), 4: rect(1, 4), 5: rect(1, 5),
  6: rect(2, 3), 7: rect(1, 7), 8: rect(2, 4), 9: rect(3, 3), 10: rect(2, 5),
};

// 지역별 블록 색 테마. 주인공 뒤를 따라오는 블록 더미는 지금 있는 지역의 기운을 띤다.
// colors: 아래 줄부터 순서대로 칠하고 넘치면 반복. emissive: 스스로 빛나는 정도(형광). light: 함께 켜는 작은 불빛 색.
export const BLOCK_THEMES = {
  forest:  { name: '풀',   colors: ['#2f9e44', '#51cf66', '#8ce99a', '#a9e34b', '#69db7c'], emissive: 0 },
  volcano: { name: '불',   colors: ['#c92a2a', '#f03e3e', '#ff6b1a', '#ff922b', '#ffd43b'], emissive: 0.35, light: 0xff7a30 },
  sea:     { name: '물',   colors: ['#1c7ed6', '#339af0', '#4dabf7', '#74c0fc', '#a5d8ff'], emissive: 0.15, light: 0x74d0ff },
  cave:    { name: '형광', colors: ['#39ff14', '#00fff2', '#7cff00', '#18ffb2', '#c6ff00'], emissive: 0.85, light: 0x5dffc8 },
  space:   { name: '우주', colors: ['#ff2bd6', '#b026ff', '#2bffea', '#ff6ec7', '#7d5cff'], emissive: 0.9, light: 0xff5cf0 },
};

const outlineMat = new THREE.LineBasicMaterial({ color: OUTLINE });
const whiteMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 });
const darkMat = new THREE.MeshStandardMaterial({ color: OUTLINE, roughness: 0.6 });
const cubeGeo = new THREE.BoxGeometry(BLOCK, BLOCK, BLOCK);
const cubeEdges = new THREE.EdgesGeometry(cubeGeo);

// 블록이 이만큼 모이면 은빛·금빛 블록 한 칸으로 뭉친다. 더미가 한없이 커지지 않고 다시 작아진다.
// 25 = 은빛 한 칸, 50 = 금빛 한 칸(= 은빛 두 칸), 75 = 금빛 한 칸 + 은빛 한 칸, 100 = 금빛 두 칸.
// 25씩 묶어 세기·자리값(은빛 둘이면 금빛 하나)을 눈으로 익히는 장치이기도 하다.
export const SILVER_BLOCK = 25;
export const GOLD_BLOCK = 50;
const GOLD_PER_COL = 10; // 금빛 블록도 열 칸씩 기둥으로 쌓는다 (1000개를 모아도 키가 하늘까지 자라지 않게)
const GOLD_COLOR = '#ffcf33';
const SILVER_COLOR = '#dfe6ee';

// 11 이상은 "10 블록(빨강+하양) + 나머지" 로 보이게 한다. 세로 5칸씩 왼쪽부터 채운다(24까지).
// 25 이상은 금빛(50)·은빛(25)·보통 블록을 한 줄로 고르게 섞어 열 칸짜리 기둥에 아래부터 차례로 쌓는다.
// 종류별로 기둥을 나누지 않고 한 더미에 섞여 있어서, 블록이 늘 때마다 금빛·은빛이 더미 곳곳에 끼어 든다.
// 은빛은 늘 한 칸뿐이다: 두 칸이 되는 순간 금빛 한 칸으로 바뀐다. 1000 = 금빛 스무 칸(열 칸짜리 기둥 두 개).
function shapeFor(number) {
  if (SHAPES[number]) return SHAPES[number];
  const golds = Math.floor(number / GOLD_BLOCK);
  const silver = Math.floor((number - golds * GOLD_BLOCK) / SILVER_BLOCK); // 0 또는 1
  const rest = number - golds * GOLD_BLOCK - silver * SILVER_BLOCK;
  if (!golds && !silver) return Array.from({ length: rest }, (_, i) => ({ col: Math.floor(i / 5), row: i % 5 })); // 11~24: 다섯 칸 기둥
  // 종류별 개수 비율에 맞춰 고르게 섞는다 (놓인 비율이 가장 낮은 종류부터)
  const kinds = [{ n: rest, cell: {} }, { n: silver, cell: { silver: true } }, { n: golds, cell: { gold: true } }];
  const placed = [0, 0, 0];
  const cells = [];
  for (let i = 0; i < rest + silver + golds; i++) {
    let pick = -1, best = Infinity;
    kinds.forEach((k, j) => { if (k.n > 0 && (placed[j] + 1) / k.n < best) { best = (placed[j] + 1) / k.n; pick = j; } });
    placed[pick]++;
    cells.push({ col: Math.floor(i / GOLD_PER_COL), row: i % GOLD_PER_COL, ...kinds[pick].cell });
  }
  return cells;
}

function cellColor(number, cell, index, theme) {
  if (cell.gold) return GOLD_COLOR; // 금빛·은빛 블록은 지역 테마 색을 따르지 않는다
  if (cell.silver) return SILVER_COLOR;
  if (theme) return theme.colors[(cell.row + cell.col) % theme.colors.length];
  if (number === 7) return RAINBOW[cell.row % RAINBOW.length];
  if (number === 10) return cell.col === 0 ? NUMBER_COLORS[10].base : NUMBER_COLORS[10].alt; // 1(빨강) + 0(하양)
  if (number > 10) {
    if (index < 10) return cell.col === 0 ? NUMBER_COLORS[10].base : NUMBER_COLORS[10].alt;
    return colorForCount(number - 10);
  }
  return (NUMBER_COLORS[number] || NUMBER_COLORS[1]).base;
}

function makeCube(colorHex) {
  const m = new THREE.Mesh(cubeGeo, new THREE.MeshStandardMaterial({ color: colorHex, roughness: 0.55 }));
  m.castShadow = true;
  m.add(new THREE.LineSegments(cubeEdges, outlineMat));
  return m;
}

// 자주 쓰는 배지(금빛의 "50", 은빛의 "25", 숫자블록 친구들의 1~10)는 그림을 한 번만 그려서 다시 쓴다.
// 금빛이 스무 칸이면 "50" 배지만 스무 장이라, 블록을 얻을 때마다 캔버스를 스무 장 새로 그리게 된다.
// 더미 전체 숫자(1~1000)는 매번 달라지므로 캐시에 쌓지 않는다.
const badgeTextures = new Map();
const badgeGeo = new THREE.PlaneGeometry(BLOCK * 0.8, BLOCK * 0.8);
const badgeMesh = (tex) => new THREE.Mesh(badgeGeo, new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
function makeBadge(number) {
  const cached = badgeTextures.get(number);
  if (cached) return badgeMesh(cached);
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const ctx = c.getContext('2d');
  ctx.font = 'bold 84px sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.lineWidth = 12; ctx.strokeStyle = OUTLINE; ctx.strokeText(String(number), 64, 70);
  ctx.fillStyle = '#ffffff'; ctx.fillText(String(number), 64, 70);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  if (number === GOLD_BLOCK || number === SILVER_BLOCK || number <= 10) badgeTextures.set(number, tex);
  return badgeMesh(tex);
}

function limb(from, to, radius, mat) {
  const dir = new THREE.Vector3().subVectors(to, from);
  const len = dir.length();
  const m = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, len, 6), mat);
  m.position.copy(from).addScaledVector(dir, 0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  return m;
}

export function buildNumberblockMesh(nb, { glow = false, theme = null } = {}) {
  const number = nb.number;
  const th = BLOCK_THEMES[theme] || null;
  const emissive = th?.emissive || (glow ? 0.5 : 0); // 형광 블록을 들고 있거나 빛나는 테마면 스스로 빛난다
  const cells = shapeFor(number);
  const cols = Math.max(...cells.map((c) => c.col)) + 1;
  const maxRow = Math.max(...cells.map((c) => c.row));
  const g = new THREE.Group();
  g.userData.number = number;
  const x0 = -((cols - 1) * BLOCK) / 2;
  const cy = (row) => LEG + BLOCK / 2 + row * BLOCK;

  // 블록
  const glowMats = [];
  for (const [index, cell] of cells.entries()) {
    const cube = makeCube(cellColor(number, cell, index, th));
    cube.position.set(x0 + cell.col * BLOCK, cy(cell.row), 0);
    if (cell.gold || cell.silver) { // 금빛·은빛 블록: 반짝이는 금속 느낌 (지역 형광과 섞이지 않게 따로)
      cube.material.emissive = new THREE.Color(cell.gold ? 0xffb300 : 0xaebecd);
      cube.material.emissiveIntensity = cell.gold ? 0.55 : 0.3;
      cube.material.metalness = 0.55;
      cube.material.roughness = 0.25;
    } else if (emissive > 0) { cube.material.emissive = cube.material.color.clone(); cube.material.emissiveIntensity = emissive; glowMats.push(cube.material); }
    g.add(cube);
  }
  if (emissive > 0) {
    const lightBase = 3 * Math.min(1, emissive / 0.5);
    const light = new THREE.PointLight(th?.light || 0xfff4c0, lightBase, 8);
    light.position.y = LEG + (maxRow + 1) * BLOCK * 0.6;
    g.add(light);
    g.userData.glow = { mats: glowMats, light, base: emissive, lightBase };
  }

  // 얼굴: 맨 윗줄 중 가운데에 가까운 블록
  const centerCol = (cols - 1) / 2;
  const topCells = cells.filter((c) => c.row === maxRow);
  const topPlain = topCells.filter((c) => !c.gold && !c.silver); // 얼굴은 되도록 보통 블록에 (금빛·은빛의 50·25 배지를 가리지 않게)
  const faceCell = (topPlain.length ? topPlain : topCells).reduce((a, b) => (Math.abs(b.col - centerCol) < Math.abs(a.col - centerCol) ? b : a));
  const fx = x0 + faceCell.col * BLOCK, fy = cy(faceCell.row), fz = BLOCK / 2 + 0.01;
  const eyeCount = number === 1 ? 1 : 2; // 원이는 눈이 하나
  const eyeR = BLOCK * 0.13;
  for (let i = 0; i < eyeCount; i++) {
    const ex = eyeCount === 1 ? 0 : (i === 0 ? -1 : 1) * BLOCK * 0.2;
    const white = new THREE.Mesh(new THREE.SphereGeometry(eyeR, 12, 10), whiteMat);
    white.position.set(fx + ex, fy + BLOCK * 0.1, fz);
    white.scale.z = 0.5;
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(eyeR * 0.5, 10, 8), darkMat);
    pupil.position.set(fx + ex, fy + BLOCK * 0.09, fz + eyeR * 0.45);
    g.add(white, pupil);
  }
  const smile = new THREE.Mesh(new THREE.TorusGeometry(BLOCK * 0.13, BLOCK * 0.03, 6, 14, Math.PI), darkMat);
  smile.rotation.z = Math.PI;
  smile.position.set(fx, fy - BLOCK * 0.12, fz);
  g.add(smile);

  // 숫자 배지: 맨 아래 가운데 블록 정면 (얼굴 블록과 다를 때만). 금빛·은빛 블록은 "50"·"25" 배지를 달 자리라 비워 둔다
  const bottomCells = cells.filter((c) => c.row === 0);
  const plainBottom = bottomCells.filter((c) => !c.gold && !c.silver);
  const badgeCell = (plainBottom.length ? plainBottom : bottomCells).reduce((a, b) => (Math.abs(b.col - centerCol) < Math.abs(a.col - centerCol) ? b : a));
  if (badgeCell !== faceCell) {
    const badge = makeBadge(number);
    badge.position.set(x0 + badgeCell.col * BLOCK, cy(badgeCell.row), fz);
    g.add(badge);
  }
  // 금빛 블록마다 "50", 은빛 블록에 "25" 배지 (얼굴이나 전체 숫자가 그려진 칸은 빼고)
  for (const cell of cells) {
    if ((!cell.gold && !cell.silver) || cell === faceCell || cell === badgeCell) continue;
    const gb = makeBadge(cell.gold ? GOLD_BLOCK : SILVER_BLOCK);
    gb.position.set(x0 + cell.col * BLOCK, cy(cell.row), fz);
    g.add(gb);
  }

  // 팔: 몸통 양옆, 높이의 55% 지점. 손은 하얀 공.
  // 기둥 높이가 들쭉날쭉할 때(11 이상, 금빛 블록이 섞일 때) 팔이 허공에 뜨지 않도록,
  // 팔이 달리는 줄에 실제로 블록이 있는 칸 중 가장 왼쪽·오른쪽에 붙인다.
  const armRow = Math.min(maxRow, Math.round(maxRow * 0.55));
  const armCells = cells.filter((c) => c.row === armRow);
  const armY = cy(armRow);
  const left = x0 + Math.min(...armCells.map((c) => c.col)) * BLOCK - BLOCK / 2;
  const right = x0 + Math.max(...armCells.map((c) => c.col)) * BLOCK + BLOCK / 2;
  const armR = BLOCK * 0.05;
  const arms = [];
  for (const side of [-1, 1]) {
    const sx = side < 0 ? left : right;
    const from = new THREE.Vector3(sx, armY, 0);
    const to = new THREE.Vector3(sx + side * BLOCK * 0.45, armY - BLOCK * 0.25, 0);
    const arm = limb(from, to, armR, darkMat);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(BLOCK * 0.1, 10, 8), whiteMat);
    hand.position.copy(to);
    g.add(arm, hand);
    arms.push({ arm, hand, side, from });
  }

  // 다리 + 발 (둘이는 주황 신발)
  const legs = [];
  const shoeMat = number === 2 ? new THREE.MeshStandardMaterial({ color: NUMBER_COLORS[2].dark }) : darkMat;
  for (const side of [-1, 1]) {
    const lx = side * BLOCK * 0.18 + (cols > 1 ? side * (cols - 1) * BLOCK * 0.25 : 0);
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(armR, armR, LEG, 6), darkMat);
    leg.position.set(lx, LEG / 2, 0);
    const foot = new THREE.Mesh(new THREE.SphereGeometry(BLOCK * 0.11, 10, 8), shoeMat);
    foot.scale.set(1, 0.5, 1.4);
    foot.position.set(lx, 0.03, BLOCK * 0.05);
    g.add(leg, foot);
    legs.push({ leg, foot, side });
  }

  g.userData.anim = { arms, legs, t: Math.random() * 10 };
  return g;
}

// 걷기: 팔 흔들기, 서 있기: 살짝 숨쉬기
export function animateNumberblock(mesh, dt, moving) {
  const a = mesh.userData.anim;
  if (!a) return;
  a.t += dt;
  const swing = moving ? Math.sin(a.t * 12) * 0.5 : Math.sin(a.t * 2) * 0.08;
  for (const { arm, hand, side, from } of a.arms) {
    const to = new THREE.Vector3(from.x + side * BLOCK * 0.45, from.y - BLOCK * 0.25 + swing * side * BLOCK * 0.5, swing * BLOCK * 0.4);
    const dir = new THREE.Vector3().subVectors(to, from);
    arm.position.copy(from).addScaledVector(dir, 0.5);
    arm.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
    hand.position.copy(to);
  }
  for (const { leg, foot, side } of a.legs) {
    const z = moving ? Math.sin(a.t * 12) * side * BLOCK * 0.25 : 0;
    leg.position.z = z / 2;
    leg.rotation.x = moving ? Math.sin(a.t * 12) * side * 0.6 : 0;
    foot.position.z = BLOCK * 0.05 + z;
  }
}

export class Numberblock {
  constructor(scene, data, pos) {
    this.data = data;
    this.mesh = buildNumberblockMesh(data);
    this.mesh.position.set(pos.x, terrainHeight(pos.x, pos.z), pos.z);
    this.rescued = false;
    this.t = 0;
    scene.add(this.mesh);
  }
  get position() { return this.mesh.position; }
}

// 파트너들이 플레이어 뒤를 줄지어 따라온다. (숫자블록 → 대표 포켓몬 → 구출한 숫자블록 친구들 순)
export class FollowChain {
  constructor(leader) {
    this.leader = leader;
    this.followers = []; // { mesh, t, ...extra }
    this.swim = false;   // 물속 지역(심해)에서는 앞사람 높이를 따라 함께 떠오른다
  }
  add(mesh, extra = {}) { this.followers.push({ mesh, t: Math.random() * 10, ...extra }); }
  addFirst(mesh, extra = {}) { this.followers.unshift({ mesh, t: Math.random() * 10, ...extra }); }
  insertAt(mesh, index, extra = {}) { this.followers.splice(Math.max(0, Math.min(index, this.followers.length)), 0, { mesh, t: Math.random() * 10, ...extra }); }
  find(pred) { return this.followers.find(pred) || null; }
  replace(oldMesh, newMesh) {
    const f = this.followers.find((x) => x.mesh === oldMesh);
    if (!f) return;
    newMesh.position.copy(oldMesh.position);
    newMesh.rotation.copy(oldMesh.rotation);
    f.mesh = newMesh;
  }
  remove(mesh) { this.followers = this.followers.filter((x) => x.mesh !== mesh); }
  update(dt) {
    let prev = this.leader.position;
    for (const f of this.followers) {
      f.t += dt;
      const p = f.mesh.position;
      const dx = prev.x - p.x, dz = prev.z - p.z;
      const dist = Math.hypot(dx, dz);
      const want = 1.8;
      let moving = false;
      if (dist > want) {
        const step = Math.min(dist - want, 7 * dt);
        p.x += (dx / dist) * step;
        p.z += (dz / dist) * step;
        f.mesh.rotation.y = Math.atan2(dx, dz);
        moving = true;
      }
      const bob = Math.abs(Math.sin(f.t * (moving ? 10 : 3))) * (moving ? 0.12 : 0.03);
      const ground = terrainHeight(p.x, p.z);
      if (this.swim) p.y += (Math.max(ground, prev.y) + bob - p.y) * Math.min(1, dt * 3); // 물속: 앞사람을 따라 스르르 떠오른다
      else p.y = ground + bob;
      animateNumberblock(f.mesh, dt, moving);
      tickModel(f.mesh, dt, moving ? 'walk' : 'idle'); // 포켓몬 모델이면 걷기/서기 애니메이션
      prev = p;
    }
  }
}
