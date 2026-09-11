import * as THREE from 'three';
import { NUMBER_COLORS, RAINBOW, OUTLINE, colorForCount } from './palette.js';
import { terrainHeight } from './world.js';

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

const outlineMat = new THREE.LineBasicMaterial({ color: OUTLINE });
const whiteMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 });
const darkMat = new THREE.MeshStandardMaterial({ color: OUTLINE, roughness: 0.6 });
const cubeGeo = new THREE.BoxGeometry(BLOCK, BLOCK, BLOCK);
const cubeEdges = new THREE.EdgesGeometry(cubeGeo);

// 11 이상은 "10 블록(빨강+하양) + 나머지" 로 보이게 한다. 세로 5칸씩 왼쪽부터 채운다.
function shapeFor(number) {
  if (SHAPES[number]) return SHAPES[number];
  const cells = [];
  for (let i = 0; i < number; i++) cells.push({ col: Math.floor(i / 5), row: i % 5 });
  return cells;
}

function cellColor(number, cell, index) {
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

function makeBadge(number) {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const ctx = c.getContext('2d');
  ctx.font = 'bold 84px sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.lineWidth = 12; ctx.strokeStyle = OUTLINE; ctx.strokeText(String(number), 64, 70);
  ctx.fillStyle = '#ffffff'; ctx.fillText(String(number), 64, 70);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(BLOCK * 0.8, BLOCK * 0.8), new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
  return plane;
}

function limb(from, to, radius, mat) {
  const dir = new THREE.Vector3().subVectors(to, from);
  const len = dir.length();
  const m = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, len, 6), mat);
  m.position.copy(from).addScaledVector(dir, 0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  return m;
}

export function buildNumberblockMesh(nb) {
  const number = nb.number;
  const cells = shapeFor(number);
  const cols = Math.max(...cells.map((c) => c.col)) + 1;
  const maxRow = Math.max(...cells.map((c) => c.row));
  const g = new THREE.Group();
  g.userData.number = number;
  const x0 = -((cols - 1) * BLOCK) / 2;
  const cy = (row) => LEG + BLOCK / 2 + row * BLOCK;

  // 블록
  for (const [index, cell] of cells.entries()) {
    const cube = makeCube(cellColor(number, cell, index));
    cube.position.set(x0 + cell.col * BLOCK, cy(cell.row), 0);
    g.add(cube);
  }

  // 얼굴: 맨 윗줄 중 가운데에 가까운 블록
  const centerCol = (cols - 1) / 2;
  const topCells = cells.filter((c) => c.row === maxRow);
  const faceCell = topCells.reduce((a, b) => (Math.abs(b.col - centerCol) < Math.abs(a.col - centerCol) ? b : a));
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

  // 숫자 배지: 맨 아래 가운데 블록 정면 (얼굴 블록과 다를 때만)
  const bottomCells = cells.filter((c) => c.row === 0);
  const badgeCell = bottomCells.reduce((a, b) => (Math.abs(b.col - centerCol) < Math.abs(a.col - centerCol) ? b : a));
  if (badgeCell !== faceCell) {
    const badge = makeBadge(number);
    badge.position.set(x0 + badgeCell.col * BLOCK, cy(badgeCell.row), fz);
    g.add(badge);
  }

  // 팔: 몸통 양옆, 높이의 55% 지점. 손은 하얀 공.
  const armY = LEG + (maxRow + 1) * BLOCK * 0.55;
  const left = x0 - BLOCK / 2, right = x0 + (cols - 1) * BLOCK + BLOCK / 2;
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

// 파트너들이 플레이어 뒤를 줄지어 따라온다.
export class FollowChain {
  constructor(leader) {
    this.leader = leader;
    this.followers = []; // { mesh, t }
  }
  add(mesh) { this.followers.push({ mesh, t: Math.random() * 10 }); }
  addFirst(mesh) { this.followers.unshift({ mesh, t: Math.random() * 10 }); }
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
      const want = 1.4;
      let moving = false;
      if (dist > want) {
        const step = Math.min(dist - want, 7 * dt);
        p.x += (dx / dist) * step;
        p.z += (dz / dist) * step;
        f.mesh.rotation.y = Math.atan2(dx, dz);
        p.y = terrainHeight(p.x, p.z) + Math.abs(Math.sin(f.t * 10)) * 0.12;
        moving = true;
      } else {
        p.y = terrainHeight(p.x, p.z) + Math.abs(Math.sin(f.t * 3)) * 0.03;
      }
      animateNumberblock(f.mesh, dt, moving);
      prev = p;
    }
  }
}
