import * as THREE from 'three';
import { makeNpc } from './npc.js';
import { makeLabelTexture, makeInstanced, makePillSprite } from './world.js';
import { NUMBER_COLORS } from './palette.js';

// 오박사 연구소 내부: 마을의 연구소 문으로 들어오면 오는 실내 지역.
// 몬스터·블록·구출은 없고, 오박사에게 가까이 가서 대화 버튼을 누르면 이야기(힌트)를 해 주고 포켓몬을 치료해 준다.
// 연구소는 영국 다운 하우스(찰스 다윈이 "종의 기원"을 쓴 집)의 서재를 본떴다 — 한 층짜리 아늑한 연구실:
//  나무 마루와 붉은 양탄자, 가운데 둥근 표본 탁자(현미경·표본병·돋보기), 서쪽 벽난로와 다윈의 안락의자, 책장과 표본 서랍장,
//  유리 종 속 핀치 새 표본, 정원이 보이는 높은 창, 동쪽 문으로 이어진 작은 유리 온실(벌레잡이 식물·난초).
export const LAB = { size: 44, spawn: { x: 0, z: 6.4 }, door: { x: 0, z: 9.6 } }; // 문 포탈: 가까이(1.6m) 오면 마을로
const ROOM = { hw: 11, hd: 9 };                     // 서재: x ±11, z ±9 (문은 남쪽 벽 가운데)
const GH = { x0: 11, x1: 18, hd: 5.5, door: 2 };    // 온실: 동쪽 벽 바깥 x 11~18, z ±5.5. 벽 가운데 z ±2 가 문
const TABLE = { x: 0, z: -1.2, r: 1.9 };            // 가운데 둥근 표본 탁자
function insideRoom(x, z) { return Math.abs(x) < ROOM.hw - 0.5 && Math.abs(z) < ROOM.hd - 0.5; }
function insideGH(x, z) { return x > GH.x0 + 0.5 && x < GH.x1 - 0.5 && Math.abs(z) < GH.hd - 0.5; }
function inGHDoor(x, z) { return x > ROOM.hw - 1 && x < GH.x0 + 1 && Math.abs(z) < GH.door - 0.4; }
function inDoorway(x, z) { return Math.abs(x) < 1.2 && z > ROOM.hd - 1 && z < ROOM.hd + 1.2; }
export const LAB_TERRAIN = {
  height: () => 0, inHole: () => false, size: LAB.size, obstacles: [], ledge: 0.9,
  blocked: (x, z) => !(insideRoom(x, z) || insideGH(x, z) || inGHDoor(x, z) || inDoorway(x, z)), // 벽 바깥은 못 간다 (문·온실 문만 열림)
};

export function buildLab(scene) {
  const decor = new THREE.Group();
  scene.add(decor);
  const obstacles = LAB_TERRAIN.obstacles;
  obstacles.length = 0;
  const block = (x, z, r) => obstacles.push({ x, z, r });
  const seg = (ax, az, bx, bz, r = 0.45) => obstacles.push({ ax, az, bx, bz, r });
  const add = (m, radius) => { if (radius) m.userData.radius = radius; decor.add(m); return m; };
  const noHide = (m) => { m.userData.noHide = true; decor.add(m); return m; };
  const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, ...o });
  const box = new THREE.BoxGeometry(1, 1, 1);
  const { hw, hd } = ROOM, H = 4.2;

  scene.background = new THREE.Color(0x2a2a22);
  scene.add(new THREE.HemisphereLight(0xfff4dc, 0x7a6a50, 1.35));
  const sun = new THREE.DirectionalLight(0xfff0d0, 1.2);
  sun.position.set(-10, 18, 6); sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -20, right: 20, top: 20, bottom: -20, near: 1, far: 60 });
  scene.add(sun, sun.target);
  const lamp = new THREE.PointLight(0xffd9a0, 1.6, 20); lamp.position.set(0, 3.4, -1); scene.add(lamp);

  // ----- 바닥: 나무 마루(널판 줄무늬) + 붉은 페르시아 양탄자 -----
  {
    const geo = new THREE.PlaneGeometry(hw * 2, hd * 2, 22, 1); geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position, cols = [], a = new THREE.Color(0x9a6a3e), b = new THREE.Color(0x8a5c34);
    for (let i = 0; i < pos.count; i++) { const c = Math.floor(pos.getX(i) + hw + 0.001) % 2 ? a : b; cols.push(c.r, c.g, c.b); }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    const floor = noHide(new THREE.Mesh(geo, std(0xffffff, { vertexColors: true, roughness: 0.75 }))); floor.receiveShadow = true;
    const rug = noHide(new THREE.Mesh(new THREE.PlaneGeometry(9, 7).rotateX(-Math.PI / 2), std(0x8a2a2a, { roughness: 1 }))); rug.position.set(0, 0.015, -1);
    const rugIn = noHide(new THREE.Mesh(new THREE.PlaneGeometry(7.6, 5.6).rotateX(-Math.PI / 2), std(0xb8862a, { roughness: 1 }))); rugIn.position.set(0, 0.02, -1);
    const rugCore = noHide(new THREE.Mesh(new THREE.PlaneGeometry(7, 5).rotateX(-Math.PI / 2), std(0x9e3326, { roughness: 1 }))); rugCore.position.set(0, 0.025, -1);
    const door = noHide(new THREE.Mesh(new THREE.CircleGeometry(1.4, 20).rotateX(-Math.PI / 2), std(0x3a5f2a))); door.position.set(0, 0.02, hd - 1.6); // 문 앞 초록 매트
  }

  // ----- 벽: 안쪽만 그리는 판(밖에서 보면 비쳐서 카메라가 벽 밖에 있어도 방 안이 보인다) -----
  const wallMat = std(0x7d9a6e, { roughness: 0.95 }), wainMat = std(0x5a3a22, { roughness: 0.8 }), trimMat = std(0xf1e8d2);
  const wall = (cx, cz, len, ry, gaps = []) => { // ry: 판이 방 안쪽을 보게 돌리는 각, gaps: [가운데 위치, 폭] 문 구멍
    let s0 = -len / 2; const parts = [];
    for (const [g, w] of [...gaps, [len / 2 + 1, 0]]) { if (g - w / 2 > s0) parts.push([s0, g - w / 2]); s0 = g + w / 2; }
    for (const [a, b] of parts) {
      const w = b - a, mid = (a + b) / 2, ox = Math.cos(ry) * mid, oz = -Math.sin(ry) * mid;
      for (const [mat, y0, y1] of [[wainMat, 0, 1.1], [wallMat, 1.1, H]]) { const p = new THREE.Mesh(new THREE.PlaneGeometry(w, y1 - y0), mat); p.position.set(cx + ox, (y0 + y1) / 2, cz + oz); p.rotation.y = ry; p.receiveShadow = true; noHide(p); }
      const rail = new THREE.Mesh(new THREE.BoxGeometry(w, 0.1, 0.08), trimMat); rail.position.set(cx + ox, 1.12, cz + oz); rail.rotation.y = ry; noHide(rail);
    }
  };
  wall(0, -hd, hw * 2, 0);                         // 북쪽 벽 (안쪽 = +z 를 본다)
  wall(0, hd, hw * 2, Math.PI, [[0, 2.6]]);        // 남쪽 벽 (문)
  wall(-hw, 0, hd * 2, Math.PI / 2);               // 서쪽 벽
  wall(hw, 0, hd * 2, -Math.PI / 2, [[0, GH.door * 2]]); // 동쪽 벽 (온실 문)
  // 정원이 보이는 높은 내리닫이 창 (창 안은 초록 정원과 하늘)
  {
    const cv = document.createElement('canvas'); cv.width = 64; cv.height = 128; const g = cv.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 128);
    gr.addColorStop(0, '#bfe4ff'); gr.addColorStop(0.55, '#e8f4ff'); gr.addColorStop(0.6, '#6fae4a'); gr.addColorStop(1, '#3f7d2a'); g.fillStyle = gr; g.fillRect(0, 0, 64, 128);
    g.fillStyle = '#2f6b2a'; for (let i = 0; i < 5; i++) { g.beginPath(); g.arc(8 + i * 13, 78, 9, 0, Math.PI * 2); g.fill(); }
    const view = new THREE.CanvasTexture(cv); view.colorSpace = THREE.SRGBColorSpace;
    const glassM = new THREE.MeshBasicMaterial({ map: view }), frameM = std(0xf4efe4);
    const win = (x, z, ry) => { const g = new THREE.Group(); const p = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 2.4), glassM); g.add(p); for (const [w, h, px, py] of [[1.8, 0.12, 0, 1.26], [1.8, 0.12, 0, -1.26], [0.12, 2.6, -0.86, 0], [0.12, 2.6, 0.86, 0], [1.7, 0.08, 0, 0], [0.06, 2.4, 0, 0]]) { const f = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.06), frameM); f.position.set(px, py, 0.02); g.add(f); } g.position.set(x, 2.5, z); g.rotation.y = ry; noHide(g); };
    for (const x of [-5.2, 5.2]) win(x, -hd + 0.03, 0);        // 북쪽 벽: 모니터 양옆
    for (const x of [-7, 7]) win(x, hd - 0.03, Math.PI);        // 남쪽 벽: 문 양옆
    win(-hw + 0.03, 3.3, Math.PI / 2);                           // 서쪽 벽: 벽난로와 책장 사이
  }
  const exitSign = new THREE.Sprite(new THREE.SpriteMaterial({ map: makeLabelTexture('▼ 나가기 (마을)', '#3a5f9b', '#ffffff', 48), transparent: true, depthTest: false }));
  exitSign.scale.set(3, 0.75, 1); exitSign.position.set(0, 3.1, hd - 0.3); decor.add(exitSign);

  // 북쪽 벽 가운데 연구 모니터 (도감 같은 화면, 나무 액자 틀)
  const SCR = { y: 2.7, z: -hd + 0.25 };
  // 연구 모니터: 포켓몬 그림을 스캔하며 체력·공격 막대와 분석 그래프가 움직이는 화면 (그림은 main 이 도감에서 넣어 준다)
  const screenCanvas = document.createElement('canvas'); screenCanvas.width = 1024; screenCanvas.height = 364;
  const screenTex = new THREE.CanvasTexture(screenCanvas); screenTex.colorSpace = THREE.SRGBColorSpace;
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(5.4, 1.92), new THREE.MeshBasicMaterial({ map: screenTex }));
  screen.position.set(0, SCR.y, SCR.z);
  decor.add(screen);
  const screenState = { subjects: [], idx: 0, switchAt: 0, lastPaint: -1 };
  function setScreenSubjects(list) { // [{ name, type, hp, atk, src }]
    screenState.subjects = list.map((s) => { const img = new Image(); img.src = s.src; return { ...s, img }; });
    screenState.idx = 0;
  }
  function paintScreen(t) {
    const c = screenCanvas, ctx = c.getContext('2d'), W = c.width, H = c.height;
    ctx.fillStyle = '#0f1a2e'; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(79,195,247,.12)'; ctx.lineWidth = 1; // 모눈
    for (let x = 0; x < W; x += 48) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
    for (let y = 0; y < H; y += 48) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
    ctx.fillStyle = '#16294a'; ctx.fillRect(0, 0, W, 54); // 제목 줄
    ctx.fillStyle = '#9fe8ff'; ctx.font = '900 30px sans-serif'; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    ctx.fillText('🔬 포켓몬 연구 모니터', 24, 27);
    ctx.textAlign = 'right'; ctx.font = '700 22px sans-serif'; ctx.fillStyle = Math.floor(t * 2) % 2 ? '#ff6a6a' : '#ffb3b3';
    ctx.fillText('● REC', W - 24, 27);
    const s = screenState.subjects[screenState.idx];
    // 왼쪽: 스캔 틀 + 포켓몬 그림
    const fx = 40, fy = 78, fw = 300, fh = 260;
    ctx.fillStyle = 'rgba(79,195,247,.08)'; ctx.fillRect(fx, fy, fw, fh);
    ctx.strokeStyle = '#4fc3f7'; ctx.lineWidth = 3; ctx.strokeRect(fx, fy, fw, fh);
    for (const [cx, cy, dx, dy] of [[fx, fy, 1, 1], [fx + fw, fy, -1, 1], [fx, fy + fh, 1, -1], [fx + fw, fy + fh, -1, -1]]) { // 모서리 표시
      ctx.beginPath(); ctx.moveTo(cx, cy + dy * 26); ctx.lineTo(cx, cy); ctx.lineTo(cx + dx * 26, cy); ctx.lineWidth = 6; ctx.stroke();
    }
    if (s?.img?.complete && s.img.naturalWidth) ctx.drawImage(s.img, fx + 20, fy + 20, fw - 40, fh - 40);
    const sy = fy + ((t * 90) % fh); // 스캔 선
    const grad = ctx.createLinearGradient(0, sy - 30, 0, sy); grad.addColorStop(0, 'rgba(79,195,247,0)'); grad.addColorStop(1, 'rgba(79,195,247,.45)');
    ctx.fillStyle = grad; ctx.fillRect(fx, Math.max(fy, sy - 30), fw, Math.min(30, sy - fy));
    ctx.fillStyle = '#9fe8ff'; ctx.fillRect(fx, sy, fw, 3);
    // 오른쪽: 이름·속성·막대·분석 그래프
    const rx = 380;
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    if (s) {
      ctx.fillStyle = '#ffffff'; ctx.font = '900 46px sans-serif'; ctx.fillText(s.name, rx, 124);
      ctx.fillStyle = '#ffd93d'; ctx.font = '800 24px sans-serif'; ctx.fillText(`${s.type} 속성 · 분석 ${Math.min(99, Math.floor(60 + (t * 7) % 40))}%`, rx, 158);
      const bar = (label, val, max, y, col) => {
        ctx.fillStyle = '#9fe8ff'; ctx.font = '800 22px sans-serif'; ctx.fillText(label, rx, y - 6);
        ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.fillRect(rx, y, 560, 22);
        ctx.fillStyle = col; ctx.fillRect(rx, y, Math.max(12, Math.min(560, 560 * val / max)), 22);
        ctx.fillStyle = '#fff'; ctx.textAlign = 'right'; ctx.fillText(String(val), rx + 560, y - 6); ctx.textAlign = 'left';
      };
      bar('❤ 체력', s.hp, 120, 198, '#e8453c');
      bar('⚔ 공격', s.atk, 20, 254, '#3fb8e8');
    } else {
      ctx.fillStyle = '#ffffff'; ctx.font = '900 40px sans-serif'; ctx.fillText('포켓몬을 분석하는 중…', rx, 140);
    }
    ctx.strokeStyle = '#7fd4f5'; ctx.lineWidth = 3; ctx.beginPath(); // 아래 분석 파형
    for (let x = 0; x <= 560; x += 8) { const y = 318 + Math.sin(x * 0.05 + t * 4) * 12 * Math.sin(x * 0.011 + t) ; x === 0 ? ctx.moveTo(rx + x, y) : ctx.lineTo(rx + x, y); }
    ctx.stroke();
    screenTex.needsUpdate = true;
  }
  paintScreen(0);
  { // 모니터 나무 액자 + 아래 긴 책상 (원고·깃펜·잉크병)
    const frame = noHide(new THREE.Mesh(new THREE.BoxGeometry(5.9, 2.4, 0.12), std(0x6a4426))); frame.position.set(0, SCR.y, SCR.z - 0.07);
    const desk = add(new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.12, 1.2), std(0x7a4a26)), 2); desk.position.set(0, 0.92, -hd + 0.9); desk.castShadow = true;
    const legs = []; for (const lx of [-2.6, 2.6]) for (const lz of [-0.45, 0.45]) legs.push({ x: lx, y: 0.45, z: -hd + 0.9 + lz, sx: 0.12, sy: 0.9, sz: 0.12 });
    decor.add(makeInstanced(box, std(0x5a3a22), legs));
    const papers = []; for (let k = 0; k < 5; k++) papers.push({ x: -2 + k * 0.9, y: 0.995, z: -hd + 0.95 + (k % 2) * 0.12, sx: 0.5, sy: 0.01, sz: 0.65, ry: (k - 2) * 0.12 });
    decor.add(makeInstanced(box, std(0xf6efdc), papers));
    const ink = add(new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.14, 8), std(0x1a1a2a))); ink.position.set(2.3, 1.05, -hd + 0.7);
    const quill = add(new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.5, 4), std(0xffffff))); quill.position.set(2.35, 1.3, -hd + 0.7); quill.rotation.z = 0.4;
    seg(-2.9, -hd + 0.9, 2.9, -hd + 0.9, 0.75);
  }
  const screenGlow = new THREE.PointLight(0x9fd8ff, 0.9, 9); screenGlow.position.set(0, SCR.y, SCR.z + 1.5); decor.add(screenGlow);

  // ----- 가운데 둥근 표본 탁자: 현미경 · 표본병 · 돋보기 · 펼친 책 -----
  {
    const T = TABLE, top = add(new THREE.Mesh(new THREE.CylinderGeometry(T.r, T.r, 0.12, 28), std(0x6e4224, { roughness: 0.6 })), 2.2); top.position.set(T.x, 0.92, T.z); top.castShadow = true;
    const ped = add(new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.5, 0.86, 10), std(0x5a3a22))); ped.position.set(T.x, 0.43, T.z);
    const scopeM = std(0xc9a15a, { metalness: 0.6, roughness: 0.35 }), scope = new THREE.Group(); // 놋쇠 현미경
    for (const [geo, px, py, pz, rx] of [[new THREE.BoxGeometry(0.4, 0.06, 0.5), 0, 0.03, 0, 0], [new THREE.CylinderGeometry(0.04, 0.04, 0.45, 6), 0, 0.26, -0.15, 0], [new THREE.CylinderGeometry(0.07, 0.07, 0.4, 10), 0, 0.42, -0.02, 0.45]]) { const m = new THREE.Mesh(geo, scopeM); m.position.set(px, py, pz); m.rotation.x = rx; scope.add(m); }
    scope.position.set(T.x - 0.9, 0.98, T.z - 0.3); add(scope, 0.8);
    const jars = [], inner = [];
    for (let k = 0; k < 6; k++) { const a = 0.6 + k * 0.42, x = T.x + Math.cos(a) * 1.25, z = T.z + Math.sin(a) * 1.25; jars.push({ x, y: 1.18, z, sx: 0.16, sy: 0.42, sz: 0.16 }); inner.push({ x, y: 1.12, z, s: 0.09, color: [0x7ed957, 0xff8fa8, 0xffd93d, 0x4fc3f7, 0xc38bff, 0xff8c42][k] }); }
    decor.add(makeInstanced(new THREE.CylinderGeometry(1, 1, 1, 10), std(0xe8f8ff, { transparent: true, opacity: 0.55 }), jars));
    decor.add(makeInstanced(new THREE.IcosahedronGeometry(1, 0), std(0xffffff), inner));
    const book = add(new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.05, 0.6), std(0xf6efdc))); book.position.set(T.x + 0.6, 1.01, T.z - 0.6); book.rotation.y = 0.3;
    const lens = add(new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.03, 6, 16), scopeM)); lens.rotation.x = -Math.PI / 2; lens.position.set(T.x + 0.2, 1.0, T.z + 0.2);
    block(T.x, T.z, T.r + 0.3);
    const sign = makePillSprite('🔬 다윈의 표본 탁자', { bg: '#fffbe6', fg: '#5a3a22', border: '#5a3a22' }, 0.5); sign.position.set(T.x, 2.3, T.z); decor.add(sign);
  }

  // ----- 서쪽 벽: 벽난로 + 다윈의 안락의자(팔걸이에 글쓰기 판) · 양옆 책장 · 표본 서랍장 -----
  {
    const fx = -hw + 0.45, stone = std(0xd8d0c0, { roughness: 0.9 });
    const mantel = add(new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.18, 2.8), stone), 1.5); mantel.position.set(fx + 0.1, 1.45, 0);
    for (const s of [-1, 1]) { const jamb = add(new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.4, 0.4), stone)); jamb.position.set(fx, 0.7, s * 1.1); }
    const hole = noHide(new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.0, 1.8), new THREE.MeshBasicMaterial({ color: 0x1a0e08 }))); hole.position.set(fx - 0.15, 0.5, 0);
    const fire = noHide(new THREE.Mesh(new THREE.ConeGeometry(0.4, 0.8, 6), std(0xff8a2a, { emissive: 0xff5500, emissiveIntensity: 1.3, transparent: true, opacity: 0.9 }))); fire.position.set(fx + 0.05, 0.42, 0); fire.userData.fire = true;
    const fireLight = new THREE.PointLight(0xff9a4a, 1.6, 8); fireLight.position.set(fx + 1, 0.8, 0); fireLight.userData.fire = true; decor.add(fireLight);
    const clock = add(new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.5, 0.35), std(0x3a2416))); clock.position.set(fx + 0.15, 1.8, -0.8);
    seg(fx, -1.5, fx, 1.5, 0.75);
    // 안락의자 (빨간 천) + 무릎에 놓는 글쓰기 판
    const chair = new THREE.Group(), red = std(0x8a2a2a, { roughness: 1 });
    for (const [w, h, d, x, y, z] of [[1.0, 0.45, 1.0, 0, 0.45, 0], [0.22, 1.1, 1.0, -0.45, 0.75, 0], [1.0, 0.35, 0.2, 0, 0.85, 0.45], [1.0, 0.35, 0.2, 0, 0.85, -0.45]]) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), red); m.position.set(x, y, z); chair.add(m); }
    const board = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.04, 1.2), std(0x6a4426)); board.position.set(0.15, 1.08, 0); chair.add(board);
    chair.position.set(-hw + 2.6, 0, 2.6); chair.rotation.y = 0.5; add(chair, 1); block(-hw + 2.6, 2.6, 0.75);
    // 책장 넷 (서쪽 벽 양옆, 북쪽 벽 양끝) · 책은 묶음
    const shelves = [], books = [];
    const shelf = (x, z, ry) => {
      shelves.push({ x, y: 1.5, z, sx: 2.2, sy: 3.0, sz: 0.45, ry });
      const tx = Math.cos(ry), tz = -Math.sin(ry), nx = Math.sin(ry), nz = Math.cos(ry);
      for (let row = 0; row < 4; row++) for (let k = 0; k < 7; k++) { const o = -0.9 + k * 0.3; books.push({ x: x + tx * o + nx * 0.18, y: 0.45 + row * 0.7, z: z + tz * o + nz * 0.18, sx: 0.22, sy: 0.5 + ((k * 7 + row) % 3) * 0.06, sz: 0.3, ry, color: [0x8a2a2a, 0x2f4a6a, 0x3f6b3a, 0x7a5a2a, 0x5a3a6a][(k + row) % 5] }); }
      seg(x - tx * 1.1, z - tz * 1.1, x + tx * 1.1, z + tz * 1.1, 0.5);
    };
    shelf(-hw + 0.25, -5.5, Math.PI / 2); shelf(-hw + 0.25, 5.8, Math.PI / 2); shelf(-hw + 2.6, -hd + 0.25, 0); shelf(hw - 2.6, -hd + 0.25, 0);
    decor.add(makeInstanced(box, std(0x5a3a22), shelves, { shadow: true }), makeInstanced(box, std(0xffffff), books));
    // 표본 서랍장 (서쪽 벽 북쪽 책장 옆): 작은 서랍 앞판이 빼곡
    const cab = add(new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.5, 1.8), std(0x6a4426)), 1.2); cab.position.set(-hw + 0.4, 0.75, -2.6);
    const knobs = [], fronts = []; for (let r = 0; r < 5; r++) for (let c = 0; c < 4; c++) { const z = -2.6 - 0.66 + c * 0.44, y = 0.25 + r * 0.27; fronts.push({ x: -hw + 0.76, y, z, sx: 0.02, sy: 0.22, sz: 0.38 }); knobs.push({ x: -hw + 0.79, y, z, s: 0.03 }); }
    decor.add(makeInstanced(box, std(0x8a5a32), fronts), makeInstanced(new THREE.SphereGeometry(1, 5, 4), std(0xc9a15a, { metalness: 0.6 }), knobs));
    seg(-hw + 0.4, -3.5, -hw + 0.4, -1.7, 0.6);
    const ds = makePillSprite('🗄 표본 서랍장', { bg: '#fffbe6', fg: '#5a3a22', border: '#5a3a22' }, 0.45); ds.position.set(-hw + 0.9, 2.0, -2.6); decor.add(ds);
  }

  // ----- 유리 종 속 핀치 새 표본 (다윈이 갈라파고스에서 모은 새들) · 지구본 -----
  {
    const tx = -5.2, tz = -5.6, side = add(new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.1, 0.9), std(0x6e4224)), 1.5); side.position.set(tx, 0.9, tz);
    const legs = []; for (const lx of [-1.1, 1.1]) for (const lz of [-0.35, 0.35]) legs.push({ x: tx + lx, y: 0.45, z: tz + lz, sx: 0.1, sy: 0.9, sz: 0.1 }); decor.add(makeInstanced(box, std(0x5a3a22), legs));
    const domes = [], birds = [], beaks = [];
    [[0x8a6a48, 0.9], [0x4a4a4a, 1.1], [0xa07a4a, 0.8]].forEach(([col, s], k) => { const x = tx - 0.75 + k * 0.75; domes.push({ x, y: 1.25, z: tz, s: 0.32 }); birds.push({ x, y: 1.08, z: tz, sx: 0.16 * s, sy: 0.12 * s, sz: 0.11 * s, color: col }); beaks.push({ x: x + 0.15 * s, y: 1.1, z: tz, s: 0.04 * s * (1 + k * 0.4) }); });
    decor.add(makeInstanced(new THREE.SphereGeometry(1, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), std(0xe8f8ff, { transparent: true, opacity: 0.4, depthWrite: false }), domes));
    decor.add(makeInstanced(new THREE.SphereGeometry(1, 8, 6), std(0xffffff), birds), makeInstanced(new THREE.ConeGeometry(1, 2, 5).rotateZ(-Math.PI / 2), std(0x3a2a1a), beaks));
    seg(tx - 1.2, tz, tx + 1.2, tz, 0.6);
    const fs = makePillSprite('🐦 갈라파고스 핀치 표본 · 부리 모양이 다 달라!', { bg: '#fffbe6', fg: '#5a3a22', border: '#5a3a22' }, 0.45); fs.position.set(tx, 2.2, tz); decor.add(fs);
    const globe = new THREE.Group(); const gs = new THREE.Mesh(new THREE.SphereGeometry(0.45, 16, 12), std(0x4f8fc0, { roughness: 0.6 })); gs.position.y = 1.25; gs.userData.globe = true; const st = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.3, 0.85, 8), std(0x5a3a22)); st.position.y = 0.42; const ring = new THREE.Mesh(new THREE.TorusGeometry(0.52, 0.025, 4, 24), std(0xc9a15a, { metalness: 0.6 })); ring.position.y = 1.25; ring.rotation.y = Math.PI / 2; globe.add(gs, st, ring);
    globe.position.set(5.2, 0, -5.6); add(globe, 0.8); block(5.2, -5.6, 0.5);
  }

  // ----- 몬스터볼 선반 (동쪽 벽 북쪽): 숫자 색 볼이 줄지어 -----
  {
    const rx = hw - 0.3, rz = -5.6;
    const rack = add(new THREE.Mesh(new THREE.BoxGeometry(0.5, 2.6, 3.2), std(0x6a4426))); rack.position.set(rx, 1.3, rz);
    const tops = [], bottoms = [], btns = [];
    for (let row = 0; row < 3; row++) for (let k = 0; k < 5; k++) { const n = (row * 5 + k) % 10 + 1, x = rx - 0.45, y = 0.55 + row * 0.8, z = rz - 1.2 + k * 0.6; tops.push({ x, y, z, color: NUMBER_COLORS[n].base }); bottoms.push({ x, y, z }); btns.push({ x: x - 0.2, y, z }); }
    decor.add(makeInstanced(new THREE.SphereGeometry(0.22, 8, 2, 0, Math.PI * 2, 0, Math.PI / 2), std(0xffffff), tops),
      makeInstanced(new THREE.SphereGeometry(0.22, 8, 2, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), std(0xffffff), bottoms),
      makeInstanced(new THREE.SphereGeometry(0.06, 4, 2), std(0x20232e), btns));
    seg(rx - 0.3, rz - 1.6, rx - 0.3, rz + 1.6, 0.7);
  }

  // ----- 동쪽 작은 유리 온실: 벌레잡이 식물(끈끈이주걱·파리지옥) · 난초 · 화분대 -----
  {
    const gx = (GH.x0 + GH.x1) / 2, gw = GH.x1 - GH.x0, gd = GH.hd * 2;
    const glass = new THREE.MeshStandardMaterial({ color: 0xd8f6ff, transparent: true, opacity: 0.28, roughness: 0.05, side: THREE.DoubleSide, depthWrite: false });
    const tiles = noHide(new THREE.Mesh(new THREE.PlaneGeometry(gw, gd).rotateX(-Math.PI / 2), std(0xc9b8a0, { roughness: 0.9 }))); tiles.position.set(gx, 0.01, 0); tiles.receiveShadow = true;
    for (const [w, x, z, ry] of [[gw, gx, -GH.hd, 0], [gw, gx, GH.hd, 0], [gd, GH.x1, 0, Math.PI / 2]]) { const p = noHide(new THREE.Mesh(new THREE.PlaneGeometry(w, 2.6), glass)); p.position.set(x, 1.3, z); p.rotation.y = ry; }
    for (const s of [-1, 1]) { const r = noHide(new THREE.Mesh(new THREE.PlaneGeometry(gw, GH.hd * 1.12), glass)); r.position.set(gx, 3.0, s * GH.hd / 2); r.rotation.set(-Math.PI / 2 + s * 0.45, 0, 0); }
    const iron = std(0xf4f4f0), ribs = [];
    for (let k = 0; k <= 5; k++) { const x = GH.x0 + (k / 5) * gw; for (const s of [-1, 1]) ribs.push({ x, y: 1.3, z: s * GH.hd, sx: 0.06, sy: 2.6, sz: 0.06 }); ribs.push({ x, y: 3.55, z: 0, sx: 0.06, sy: 0.06, sz: gd * 0.98 }); }
    decor.add(makeInstanced(box, iron, ribs));
    const benches = [], pots = [], plants = [], flowers = [];
    for (const s of [-1, 1]) { benches.push({ x: gx, y: 0.8, z: s * (GH.hd - 0.6), sx: gw - 0.6, sy: 0.08, sz: 0.9 }); for (let k = 0; k < 6; k++) { const x = GH.x0 + 0.8 + k * 1.05, z = s * (GH.hd - 0.6); pots.push({ x, y: 0.98, z, sx: 0.2, sy: 0.28, sz: 0.2 }); plants.push({ x, y: 1.25, z, s: 0.22 + (k % 2) * 0.06, color: k % 3 === 0 ? 0xb83a3a : 0x4f9a3a }); if (k % 3 !== 0) flowers.push({ x, y: 1.5, z, s: 0.1, color: [0xff8fd0, 0xffffff, 0xc38bff][k % 3] }); } seg(GH.x0 + 0.3, s * (GH.hd - 0.6), GH.x1 - 0.3, s * (GH.hd - 0.6), 0.55); }
    decor.add(makeInstanced(box, std(0x6a4426), benches), makeInstanced(new THREE.CylinderGeometry(1, 0.8, 1, 8), std(0xc46b2c), pots));
    decor.add(makeInstanced(new THREE.IcosahedronGeometry(1, 0), std(0xffffff, { roughness: 0.8 }), plants), makeInstanced(new THREE.IcosahedronGeometry(1, 0), std(0xffffff, { emissive: 0x331122, emissiveIntensity: 0.3 }), flowers));
    const vine = add(new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.6, 0.6, 10), std(0xc46b2c)), 1); vine.position.set(GH.x1 - 1.2, 0.3, 0); block(GH.x1 - 1.2, 0, 0.7);
    const big = add(new THREE.Mesh(new THREE.IcosahedronGeometry(0.9, 0), std(0x3f7d2a, { flatShading: true })), 1.2); big.position.set(GH.x1 - 1.2, 1.2, 0);
    const sign = makePillSprite('🌿 다윈의 작은 온실 · 벌레잡이 식물과 난초', { bg: '#ffffff', fg: '#2e6b3a', border: '#2e6b3a' }, 0.5); sign.position.set(GH.x0 + 0.8, 3.0, 0); decor.add(sign);
    const sun2 = new THREE.PointLight(0xf4ffe8, 1.2, 12); sun2.position.set(gx, 3, 0); scene.add(sun2);
  }

  // ----- 치료·연구 캡슐 (문 오른쪽): 놋쇠 받침 + 유리 원통 안에 빛나는 몬스터볼 -----
  {
    const g = new THREE.Group(), brass = std(0xc9a15a, { metalness: 0.6, roughness: 0.35 });
    const base = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.2, 0.45, 20), brass); base.position.y = 0.22;
    const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.85, 2.2, 24, 1, true), std(0x9fe8ff, { transparent: true, opacity: 0.35, side: THREE.DoubleSide })); glass.position.y = 1.55;
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.95, 20, 8, 0, Math.PI * 2, 0, Math.PI / 2), brass); cap.position.y = 2.65;
    const orb = new THREE.Mesh(new THREE.SphereGeometry(0.4, 16, 12), std(0xffd93d, { emissive: 0xffb300, emissiveIntensity: 1 })); orb.position.y = 1.55; orb.userData.orb = true;
    const light = new THREE.PointLight(0xffd36b, 2.0, 7); light.position.y = 1.6;
    g.add(base, glass, cap, orb, light); g.position.set(6.8, 0, hd - 2.2); decor.add(g); block(6.8, hd - 2.2, 1.4);
  }

  // 워프 패드 (문 왼쪽): 마지막에 있던 지역으로 돌아간다 (main 이 state.returnTo 를 보고 처리)
  const padPos = { x: -6.8, z: hd - 2.2 };
  const warpPad = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.4, 0.22, 24), std(0x66e0ff, { emissive: 0x2288aa, emissiveIntensity: 0.8 }));
  warpPad.position.set(padPos.x, 0.11, padPos.z);
  const warpRing = new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.07, 8, 32), std(0xffffff, { emissive: 0x9fe8ff, emissiveIntensity: 1 }));
  warpRing.rotation.x = Math.PI / 2; warpRing.position.set(padPos.x, 0.5, padPos.z);
  const warpLabel = new THREE.Sprite(new THREE.SpriteMaterial({ map: makeLabelTexture('워프 패드 · 지역으로 돌아가기', '#0f5f7a', '#ffffff', 48), transparent: true, depthTest: false }));
  warpLabel.scale.set(3.6, 0.9, 1); warpLabel.position.set(padPos.x, 2.3, padPos.z);
  warpPad.userData.noHide = warpRing.userData.noHide = true;
  decor.add(warpPad, warpRing, warpLabel);

  // 천장 놋쇠 등 (줄에 매달림)
  { const chain = noHide(new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.0, 4), std(0x3a3a3a))); chain.position.set(0, 3.7, -1.2); const shade = noHide(new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.5, 0.4, 12, 1, true), std(0xf6e6b8, { emissive: 0xffc870, emissiveIntensity: 0.8, side: THREE.DoubleSide }))); shade.position.set(0, 3.1, -1.2); }

  // 오박사 (모델 오박사.glb, 없으면 드래프트): 표본 탁자 남쪽, 문을 본다
  const prof = makeNpc({ outfit: 'professor', name: '오박사', model: '오박사.glb' });
  prof.position.set(2.6, 0, 1.6);
  prof.rotation.y = -0.4;
  decor.add(prof); block(2.6, 1.6, 0.7);

  let orb = null, globe = null; const fires = [];
  decor.traverse((o) => { if (o.userData.orb) orb = o; if (o.userData.globe) globe = o; if (o.userData.fire) fires.push(o); });
  function animate(t) {
    prof.position.y = Math.sin(t * 2) * 0.03;
    if (t - screenState.lastPaint > 0.1) { screenState.lastPaint = t; paintScreen(t); } // 모니터는 초당 10번 새로 그린다
    if (screenState.subjects.length > 1 && t > screenState.switchAt) { screenState.switchAt = t + 6; screenState.idx = (screenState.idx + 1) % screenState.subjects.length; }
    if (orb) { orb.position.y = 1.55 + Math.sin(t * 1.5) * 0.22; orb.rotation.y = t; }
    if (globe) globe.rotation.y = t * 0.3;
    for (const f of fires) { if (f.isLight) f.intensity = 1.4 + Math.sin(t * 9) * 0.3 + Math.sin(t * 23) * 0.15; else { f.scale.set(1, 0.85 + Math.sin(t * 11) * 0.15, 1); } }
    warpRing.position.y = 0.5 + Math.sin(t * 2) * 0.15; warpRing.rotation.z = t;
  }

  return {
    portalTo: 'town', sun, animate, terrain: LAB_TERRAIN, decor, spawn: LAB.spawn, portal: LAB.door, dark: false, indoor: true,
    wildSpots: [], pickupSpots: [],
    warpPad: padPos,
    setScreenSubjects,
    npcs: [{
      x: prof.position.x, z: prof.position.z, mesh: prof, name: '오박사', heal: true,
      lines: (c) => [
        `안녕, ${c.name}! 난 오박사란다. 다친 포켓몬은 언제든 여기서 치료해 줄게. 포켓몬을 잡아서 함께 모험하렴!`,
        '요즘 포켓몬 머리 위에 붉은 숫자가 떠 있는 걸 봤지? 저건 병이 아니야. 넘버로켓단이 씌운 가짜 숫자란다.',
        '가짜 숫자를 뒤집어쓴 포켓몬은 제가 좋아하는 숫자를 잊고 명령만 들어. 대결에서 그 붉은 숫자를 0으로 깎으면 정신이 돌아온단다. 그때 넘버볼을 던지면 친구가 돼!',
        '넘버볼도 물약도 모두 숫자블록으로 산단다. 도감의 상점 탭을 열어 보렴. 숫자를 잘 아는 트레이너가 친구를 가장 많이 되돌릴 수 있어.',
        '포켓몬은 대결에서 이길 때마다 경험치를 받고, 경험치가 차면 레벨이 오른단다. 레벨이 오르면 체력과 공격이 세지지. 나보다 센 상대를 이기면 경험치를 더 많이 받아!',
        '레벨이 오르면 새 기술도 배운단다. 그리고 Lv.16이 되면 진화할 수 있어! 어디서든 도감에서 ✨진화 버튼을 누르렴.',
        '이상해씨는 이상해풀을 거쳐 이상해꽃으로, 파이리는 리자드를 거쳐 리자몽으로 두 번 진화한단다. 두 번째 진화는 Lv.32란다. 보스를 이기면 경험치를 세 배나 주니 보스에게 도전해 보렴.',
        '대결에서 지면 그 포켓몬은 기절해서 못 싸워. 여기서 치료받으면 낫지. 다른 지역의 안내원에게 부탁하면 연구소로 데려다준단다.',
        '문 왼쪽의 워프 패드에 올라서면 마지막에 있던 지역으로 바로 돌아갈 수 있어.',
        '이 연구소는 영국의 다운 하우스를 본떠 지었단다. 찰스 다윈 할아버지가 40년 동안 살면서 생물이 어떻게 변해 가는지(진화) 연구하고 "종의 기원"을 쓴 집이야.',
        '서쪽 벽 유리 종 속의 핀치 새들을 보렴. 섬마다 먹이가 달라서 부리 모양이 다 다르게 변했단다. 포켓몬이 사는 곳에 따라 진화하는 것과 닮았지!',
        '동쪽 문으로 나가면 작은 유리 온실이야. 다윈 할아버지는 벌레를 잡아먹는 식물(끈끈이주걱·파리지옥)을 아주 좋아했단다. 손가락을 넣으면 안 돼!',
        '불은 풀에, 물은 불에, 풀은 물에, 전기는 물에 세단다. 상대 속성을 보고 대표를 고르렴. 도감에서 강함·약함을 볼 수 있어.',
        '포켓몬 이름 옆의 ★ 개수가 등급이란다. ★~★★는 몬스터볼, ★★★는 하이퍼볼, ★★★★~★★★★★는 슈퍼볼, 메가 포켓몬은 마스터볼로 던지면 잘 잡혀.',
        '도감의 기술 칩에서 ⚔ 숫자는 그 기술의 위력, ×숫자는 한 대결에서 쓸 수 있는 횟수, 🔒는 아직 레벨이 모자란 기술이란다.',
      ],
    }],
  };
}
