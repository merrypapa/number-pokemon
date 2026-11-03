import * as THREE from 'three';
import { makeNpc } from './npc.js';
import { makeLabelTexture, makeInstanced, makePillSprite } from './world.js';
import { NUMBER_COLORS } from './palette.js';
import { PH, STAIRS, GALLERY_PROPS, palmHeight, palmCeiling, palmBlocked, buildPalmHouse } from './palmhouse.js';

// 오박사 연구소 내부: 푸른숲 마을의 연구소 문으로 들어오면 오는 실내 지역.
// 몬스터·블록·구출은 없고, 오박사에게 가까이 가서 대화 버튼을 누르면 이야기(힌트)를 해 주고 포켓몬을 치료해 준다.
// 연구소 건물은 런던 큐 왕립식물원의 팜 하우스(쇠와 유리 온실, src/palmhouse.js)를 본떴다:
//  가운데 연못(큰가시연꽃 잎) 둘레로 키 큰 야자나무·고사리, 식물 연구 탁자(현미경·표본병), 북쪽 큰 연구 모니터,
//  동·서 끝의 흰 나선 계단으로 2층 회랑(5m)에 올라 야자 잎을 가까이 보고, 회랑 남쪽 망원경·북쪽 희귀 식물을 구경한다.
export const LAB = { size: 56, spawn: { x: 0, z: 10.5 }, door: { x: 0, z: 13.9 } }; // 문 포탈: 가까이(1.6m) 오면 마을로
const POND = { x: 0, z: 0, rx: 5.5, rz: 2.8 }; // 가운데 연못 (들어갈 수 없다)
const inPond = (x, z, m = 0) => ((x - POND.x) / (POND.rx + m)) ** 2 + ((z - POND.z) / (POND.rz + m)) ** 2 < 1;
export const LAB_TERRAIN = {
  height: palmHeight, inHole: () => false, size: LAB.size, obstacles: [], ledge: 0.9,
  blocked: (x, z, refY) => palmBlocked(x, z, refY) || ((refY ?? 0) < 1 && inPond(x, z, 0.3)), // 유리벽·난간·기둥 + 연못
  ceiling: palmCeiling, // 회랑·계단 밑, 유리 지붕 아래로 카메라를 누른다
};

export function buildLab(scene) {
  const decor = new THREE.Group();
  scene.add(decor);
  const obstacles = LAB_TERRAIN.obstacles;
  obstacles.length = 0;
  const block = (x, z, r) => obstacles.push({ x, z, r });
  const add = (m, radius) => { if (radius) m.userData.radius = radius; decor.add(m); return m; };
  const noHide = (m) => { m.userData.noHide = true; decor.add(m); return m; };
  const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, ...o });

  // 유리 온실이라 밖(하늘)이 보인다: 밝은 하늘색 배경 + 밖의 잔디밭
  scene.background = new THREE.Color(0xbfe0f0);
  scene.add(new THREE.HemisphereLight(0xf4fbff, 0x7d9a6a, 1.7));
  const sun = new THREE.DirectionalLight(0xfff6e0, 1.6);
  sun.position.set(8, 20, 6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -22, right: 22, top: 22, bottom: -22, near: 1, far: 70 });
  scene.add(sun, sun.target);
  for (const [lx, lz] of [[-12, 0], [12, 0]]) { const l = new THREE.PointLight(0xfff0c8, 1.0, 18); l.position.set(lx, 4, lz); scene.add(l); }

  // 바닥: 밖의 잔디 + 온실 안 돌바닥(운동장 모양) + 화단 흙
  const lawn = noHide(new THREE.Mesh(new THREE.CircleGeometry(60, 24), std(0x7fb35a, { roughness: 1 })));
  lawn.rotation.x = -Math.PI / 2; lawn.position.y = -0.03;
  {
    const sh = new THREE.Shape(), R = PH.RO + 0.05;
    sh.moveTo(-PH.SX, R); sh.lineTo(PH.SX, R); sh.absarc(PH.SX, 0, R, Math.PI / 2, -Math.PI / 2, true); sh.lineTo(-PH.SX, -R); sh.absarc(-PH.SX, 0, R, -Math.PI / 2, -Math.PI * 1.5, true);
    const geo = new THREE.ShapeGeometry(sh, 24); geo.rotateX(-Math.PI / 2);
    // 큰 돌 타일 무늬 (정점 색 대신 작은 캔버스 무늬)
    const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
    g.fillStyle = '#e8e1d0'; g.fillRect(0, 0, 128, 128); g.fillStyle = '#ddd4bf'; g.fillRect(0, 0, 64, 64); g.fillRect(64, 64, 64, 64);
    g.strokeStyle = '#c9bea5'; g.lineWidth = 3; g.strokeRect(0, 0, 128, 128); g.beginPath(); g.moveTo(64, 0); g.lineTo(64, 128); g.moveTo(0, 64); g.lineTo(128, 64); g.stroke();
    const tex = new THREE.CanvasTexture(c); tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.colorSpace = THREE.SRGBColorSpace;
    const uv = geo.attributes.uv, pos = geo.attributes.position; for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i) / 3, pos.getZ(i) / 3);
    const floor = noHide(new THREE.Mesh(geo, std(0xffffff, { map: tex, roughness: 0.85 }))); floor.receiveShadow = true; // 카메라 가림 처리에서 제외
  }
  const rug = noHide(new THREE.Mesh(new THREE.CircleGeometry(1.8, 24), std(0xe8453c)));
  rug.rotation.x = -Math.PI / 2; rug.position.set(0, 0.02, 11.8);

  buildPalmHouse(decor); // 쇠와 유리 온실 뼈대 · 2층 회랑 · 나선 계단 · 현관

  const exitSign = new THREE.Sprite(new THREE.SpriteMaterial({ map: makeLabelTexture('▼ 나가기 (마을)', '#3a5f9b', '#ffffff', 48), transparent: true, depthTest: false }));
  exitSign.scale.set(3, 0.75, 1); exitSign.position.set(0, 3.1, PH.RO - 0.3);
  decor.add(exitSign);
  for (const s of STAIRS) { const t = makePillSprite('🌀 나선 계단 · 2층 회랑', { bg: '#ffffff', fg: '#2e6b3a', border: '#2e6b3a' }, 0.55); t.position.set(s.x + Math.cos(s.a0) * 2.6, 2.6, s.z + Math.sin(s.a0) * 2.6); decor.add(t); }

  // 북쪽 통로의 큰 연구 모니터 (도감 같은 화면)
  const SCR = { y: 3.2, z: -12.9 };
  // 연구 모니터: 포켓몬 그림을 스캔하며 체력·공격 막대와 분석 그래프가 움직이는 화면 (그림은 main 이 도감에서 넣어 준다)
  const screenCanvas = document.createElement('canvas'); screenCanvas.width = 1024; screenCanvas.height = 364;
  const screenTex = new THREE.CanvasTexture(screenCanvas); screenTex.colorSpace = THREE.SRGBColorSpace;
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(9, 3.2), new THREE.MeshBasicMaterial({ map: screenTex }));
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
  { // 모니터 틀과 다리
    const frame = add(new THREE.Mesh(new THREE.BoxGeometry(9.5, 3.7, 0.25), std(0x2a3448)), 2); frame.position.set(0, SCR.y, SCR.z - 0.15);
    for (const lx of [-4.2, 4.2]) { const leg = add(new THREE.Mesh(new THREE.BoxGeometry(0.25, SCR.y - 1.8, 0.25), std(0xf4f6f2))); leg.position.set(lx, (SCR.y - 1.8) / 2, SCR.z - 0.2); }
    obstacles.push({ ax: -4.6, az: SCR.z - 0.15, bx: 4.6, bz: SCR.z - 0.15, r: 0.45 });
  }
  const screenGlow = new THREE.PointLight(0x4fc3f7, 1.5, 12); screenGlow.position.set(0, SCR.y, SCR.z + 1.5); decor.add(screenGlow);

  const metalMat = std(0x8a94a6);
  // 책상 + 모니터 (연구 모니터 앞, 북쪽 통로): 묶음 그리기
  {
    const desks = [], legs = [], mons = [], kbs = [];
    for (const dx of [-8, -3.2, 3.2, 8]) {
      const dz = -11.3;
      desks.push({ x: dx, y: 0.9, z: dz, sx: 3.4, sy: 0.15, sz: 1.4 });
      for (const lx of [-1.5, 1.5]) for (const lz of [-0.55, 0.55]) legs.push({ x: dx + lx, y: 0.45, z: dz + lz, sx: 0.12, sy: 0.9, sz: 0.12 });
      mons.push({ x: dx, y: 1.6, z: dz - 0.4, sx: 1.6, sy: 1.0, sz: 0.08 }, { x: dx, y: 1.1, z: dz - 0.4, sx: 0.3, sy: 0.3, sz: 0.2 });
      kbs.push({ x: dx, y: 1.0, z: dz + 0.3, sx: 1.1, sy: 0.06, sz: 0.4 });
      obstacles.push({ ax: dx - 1.7, az: dz, bx: dx + 1.7, bz: dz, r: 0.9 });
    }
    const box = new THREE.BoxGeometry(1, 1, 1);
    decor.add(makeInstanced(box, std(0xc9a15a), desks, { shadow: true }), makeInstanced(box, metalMat, legs), makeInstanced(box, std(0x1f2a3a, { emissive: 0x4fc3f7, emissiveIntensity: 0.6 }), mons), makeInstanced(box, std(0xdddddd), kbs));
  }

  // 씨앗·식물 책장 (서쪽 끝 통로, 벽을 따라 둥글게)
  {
    const books = [], shelves = [];
    for (const th of [Math.PI - 0.55, Math.PI, Math.PI + 0.55]) {
      const d = 12.6, cx = -PH.SX + Math.cos(th) * d, cz = Math.sin(th) * d, nx = Math.cos(th), nz = Math.sin(th), tx = -nz, tz = nx;
      shelves.push({ x: cx, y: 1.6, z: cz, sx: 0.6, sy: 3.2, sz: 3, ry: -th });
      for (let row = 0; row < 3; row++) for (let k = 0; k < 6; k++) {
        const o = -1.2 + k * 0.45;
        books.push({ x: cx - nx * 0.45 + tx * o, y: 0.55 + row * 1.0, z: cz - nz * 0.45 + tz * o, sx: 0.35, sy: 0.7, sz: 0.32, ry: -th, color: NUMBER_COLORS[(k + row * 2) % 10 + 1].base });
      }
      obstacles.push({ ax: cx - nx * 0.2 - tx * 1.5, az: cz - nz * 0.2 - tz * 1.5, bx: cx - nx * 0.2 + tx * 1.5, bz: cz - nz * 0.2 + tz * 1.5, r: 0.8 });
    }
    const box = new THREE.BoxGeometry(1, 1, 1);
    decor.add(makeInstanced(box, std(0x7a4d22), shelves, { shadow: true }), makeInstanced(box, std(0xffffff), books));
  }

  // 몬스터볼 선반 (동쪽 끝 통로): 숫자 색 볼이 줄지어 (묶음 그리기)
  {
    const rx = PH.SX + 12.6;
    const rack = add(new THREE.Mesh(new THREE.BoxGeometry(0.5, 3, 6), std(0xdfe6ee))); rack.position.set(rx, 1.5, 0);
    const tops = [], bottoms = [], btns = [];
    for (let row = 0; row < 3; row++) for (let k = 0; k < 8; k++) {
      const n = (row * 8 + k) % 10 + 1, x = rx - 0.45, y = 0.6 + row * 0.9, z = -2.6 + k * 0.75;
      tops.push({ x, y, z, color: NUMBER_COLORS[n].base }); bottoms.push({ x, y, z }); btns.push({ x: x - 0.2, y, z });
    }
    decor.add(makeInstanced(new THREE.SphereGeometry(0.22, 8, 2, 0, Math.PI * 2, 0, Math.PI / 2), std(0xffffff), tops),
      makeInstanced(new THREE.SphereGeometry(0.22, 8, 2, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), std(0xffffff), bottoms),
      makeInstanced(new THREE.SphereGeometry(0.06, 4, 2), std(0x20232e), btns));
    obstacles.push({ ax: rx - 0.3, az: -3, bx: rx - 0.3, bz: 3, r: 0.8 });
  }

  // 치료·연구 캡슐 (문 오른쪽): 유리 원통 안에 빛나는 몬스터볼
  {
    const g = new THREE.Group();
    const base = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.4, 0.5, 20), metalMat); base.position.y = 0.25;
    const glass = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.0, 2.6, 24, 1, true), std(0x9fe8ff, { transparent: true, opacity: 0.35, side: THREE.DoubleSide })); glass.position.y = 1.8;
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.15, 0.4, 20), metalMat); cap.position.y = 3.3;
    const orb = new THREE.Mesh(new THREE.SphereGeometry(0.45, 16, 12), std(0xffd93d, { emissive: 0xffb300, emissiveIntensity: 1 })); orb.position.y = 1.8; orb.userData.orb = true;
    const light = new THREE.PointLight(0xffd36b, 2.5, 8); light.position.y = 1.8;
    g.add(base, glass, cap, orb, light);
    g.position.set(6.5, 0, 11.8);
    decor.add(g); block(6.5, 11.8, 1.6);
  }

  // ----- 가운데 연못: 큰가시연꽃(빅토리아 연꽃) 잎이 둥둥 + 돌 테두리 -----
  {
    const water = noHide(new THREE.Mesh(new THREE.CircleGeometry(1, 40), std(0x2f8fb0, { emissive: 0x0b3a4a, emissiveIntensity: 0.4, roughness: 0.1, metalness: 0.2 })));
    water.rotation.x = -Math.PI / 2; water.scale.set(POND.rx, POND.rz, 1); water.position.set(POND.x, 0.06, POND.z);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(1, 0.06, 4, 32), std(0xb9b2a0, { roughness: 1 }));
    rim.rotation.x = -Math.PI / 2; rim.scale.set(POND.rx + 0.15, POND.rz + 0.15, 4); rim.position.set(POND.x, 0.08, POND.z); noHide(rim);
    const pads = [], flowers = [];
    for (const [px, pz, s] of [[-3.6, -0.6, 1.0], [-1.0, 1.5, 0.8], [1.6, -1.2, 1.1], [3.8, 0.7, 0.9], [0.4, 0.2, 0.6], [-2.6, 1.3, 0.55], [2.8, 1.8, 0.5], [-4.3, 1.1, 0.45]]) {
      pads.push({ x: px, y: 0.1, z: pz, sx: s, sy: 1, sz: s, color: s > 0.7 ? 0x5e9e3c : 0x74b04a });
      if (s < 0.7) flowers.push({ x: px + 0.2, y: 0.25, z: pz, s: 0.2, color: s < 0.5 ? 0xffffff : 0xff8fb8 });
    }
    decor.add(makeInstanced(new THREE.CylinderGeometry(1, 1, 0.08, 16), std(0xffffff, { roughness: 0.7 }), pads));
    decor.add(makeInstanced(new THREE.IcosahedronGeometry(1, 0), std(0xffffff, { emissive: 0x442233, emissiveIntensity: 0.3 }), flowers));
    const sign = makePillSprite('🪷 큰가시연꽃 연못', { bg: '#ffffff', fg: '#1f6f8b', border: '#1f6f8b' }, 0.5); sign.position.set(POND.x + 3, 1.6, POND.z + POND.rz + 0.4); decor.add(sign);
  }

  // ----- 야자나무 · 고사리 (같은 잎 모양 하나를 묶음으로 그린다) -----
  {
    // 잎 하나: +x 로 뻗고 끝이 아래로 처지는, 가운데가 접힌 긴 잎 (길이 1)
    const pos = [], idx = [], S = 4;
    for (let i = 0; i <= S; i++) { const u = i / S, w = 0.16 * Math.sin(Math.PI * Math.min(1, u * 1.15)) + 0.01, y = -0.45 * u * u; pos.push(u, y + 0.04, -w, u, y, 0, u, y + 0.04, w); }
    for (let i = 0; i < S; i++) { const a = i * 3; idx.push(a, a + 3, a + 1, a + 1, a + 3, a + 4, a + 1, a + 4, a + 2, a + 2, a + 4, a + 5); }
    const leafGeo = new THREE.BufferGeometry(); leafGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); leafGeo.setIndex(idx); leafGeo.computeVertexNormals();
    const ferns = [], beds = [];
    const leafMat = std(0xffffff, { roughness: 0.8, side: THREE.DoubleSide }), trunkGeo = new THREE.CylinderGeometry(0.18, 0.3, 1, 7, 1, true), trunkMat = std(0x8d6e4f, { roughness: 1 });
    const knobGeo = new THREE.SphereGeometry(0.45, 7, 5), knobMat = std(0x6f5a3a);
    // [x, z, 키] — 가운데는 지붕 꼭대기(17m)를 향해 높이, 반원 끝은 잎이 회랑(5m) 위에서 펼쳐지게, 통로 구석은 작은 야자
    // 야자는 그루마다 한 덩어리(Group)라서, 카메라와 주인공 사이에 끼면 resolveCamera 가 그 그루를 잠깐 숨긴다 (묶음 그리기로 만들면 못 숨겨 잎이 화면을 덮었다)
    const PALMS = [[-1.8, 0.1, 14.5], [-6.2, -4.6, 12.5], [6.8, -4.4, 11.5], [-11, -3.6, 10.5], [11.4, 3.4, 11], [-11.6, 4.2, 8.6], [10.8, -4.4, 8.2], [12.5, 10.6, 4.6], [-12.5, -10.6, 4.4]];
    for (const [x, z, h] of PALMS) {
      const lean = (x * 7 + z * 3) % 1, tx = Math.sin(lean * 6) * 0.04, tz = Math.cos(lean * 6) * 0.04;
      const palm = new THREE.Group(); palm.position.set(x, 0, z);
      const trunk = new THREE.Mesh(trunkGeo, trunkMat); trunk.position.set(tx * h / 2, h / 2, -tz * h / 2); trunk.scale.set(0.9 + h * 0.02, h, 0.9 + h * 0.02); trunk.rotation.set(-tz, 0, -tx); trunk.castShadow = true;
      const hx = tx * h, hz = -tz * h;
      const knob = new THREE.Mesh(knobGeo, knobMat); knob.position.set(hx, h, hz);
      const n = h > 6 ? 11 : 9, L = h > 6 ? 4.2 : 2.8, leaves = [];
      for (let k = 0; k < n; k++) { const a = (k / n) * Math.PI * 2 + h; leaves.push({ x: hx, y: h + 0.1, z: hz, s: L * (0.85 + ((k * 37) % 10) / 40), ry: a, rz: 0.25 + ((k * 13) % 5) * 0.06, color: k % 2 ? 0x2f7d32 : 0x3b8f3a }); }
      const crown = makeInstanced(leafGeo, leafMat, leaves, { shadow: true }); crown.frustumCulled = false;
      palm.add(trunk, knob, crown); add(palm, L * 0.8);
      if (!inPond(x, z)) beds.push({ x, y: 0.015, z, s: 1.3, rx: -Math.PI / 2 });
      block(x, z, h > 8 ? 0.55 : 0.45);
    }
    // 고사리 덤불: 연못 둘레와 벽 쪽 화단
    const FERNS = [];
    for (let k = 0; k < 14; k++) { const a = (k / 14) * Math.PI * 2 + 0.2; const x = Math.cos(a) * (POND.rx + 0.9), z = Math.sin(a) * (POND.rz + 0.9); if (z > 0 && Math.abs(x) < 1.8) continue; if (Math.hypot(x - 2.5, z + 5.2) < 1.6) continue; FERNS.push([x, z, 0.8 + (k % 3) * 0.15]); }
    for (const [x, z] of [[-3, 12.6], [3.1, 12.8], [-10.5, 12], [10.2, 12.4], [-12.6, -11.6], [12.8, -11], [-21.7, 4.5], [-21.5, -4.6], [21.8, 5.4], [21.6, -5.2], [-16.5, 9.5], [16.6, -9.6], [16.4, 9.7], [-16.4, -9.8]]) FERNS.push([x, z, 1.2]);
    for (const [x, z, s] of FERNS) {
      for (let k = 0; k < 4; k++) ferns.push({ x, y: 0.05, z, s: s * (0.9 + (k % 3) * 0.1), ry: (k / 4) * Math.PI * 2 + x, rz: 0.75 + (k % 2) * 0.2, color: k % 2 ? 0x56a845 : 0x4a9a3e });
      beds.push({ x, y: 0.012, z, s: s * 0.9, rx: -Math.PI / 2 });
    }
    decor.add(makeInstanced(leafGeo, leafMat, ferns));
    decor.add(makeInstanced(new THREE.CircleGeometry(1, 12), std(0x6b4f33, { roughness: 1 }), beds));
  }

  // ----- 식물 연구 탁자 두 개 (연못 남쪽): 현미경 · 표본병 · 비커 -----
  {
    const box = new THREE.BoxGeometry(1, 1, 1), tops = [], legs = [], scope = [], tubes = [], jars = [], inner = [];
    for (const tx of [-5, 5]) {
      const tz = 5.4;
      tops.push({ x: tx, y: 0.95, z: tz, sx: 4.5, sy: 0.15, sz: 1.6 });
      for (const lx of [-2, 2]) for (const lz of [-0.65, 0.65]) legs.push({ x: tx + lx, y: 0.47, z: tz + lz, sx: 0.12, sy: 0.95, sz: 0.12 });
      // 현미경: 받침 + 기둥 + 경통
      const mx = tx - 1.4;
      scope.push({ x: mx, y: 1.07, z: tz, sx: 0.45, sy: 0.08, sz: 0.55 }, { x: mx, y: 1.35, z: tz - 0.18, sx: 0.1, sy: 0.5, sz: 0.1 });
      tubes.push({ x: mx, y: 1.5, z: tz - 0.05, sx: 0.09, sy: 0.45, sz: 0.09, rx: 0.4 });
      // 표본병 (안에 작은 잎) · 색 비커
      for (let k = 0; k < 4; k++) {
        const jx = tx - 0.4 + k * 0.6, jz = tz + (k % 2 ? 0.35 : -0.3), big = k % 2 === 0;
        jars.push({ x: jx, y: 1.3, z: jz, sx: big ? 0.2 : 0.16, sy: 0.55, sz: big ? 0.2 : 0.16, color: big ? 0xd8f6ff : [0x4fc3f7, 0x7ed957, 0xff6b9d, 0xffd93d][(k + (tx > 0 ? 2 : 0)) % 4] });
        if (big) inner.push({ x: jx, y: 1.25, z: jz, s: 0.12, color: tx > 0 ? 0x5cbf4a : 0xc2e05a });
      }
      obstacles.push({ ax: tx - 2.2, az: tz, bx: tx + 2.2, bz: tz, r: 1.1 });
    }
    decor.add(makeInstanced(box, std(0xe9eef5), tops, { shadow: true }), makeInstanced(box, metalMat, legs), makeInstanced(box, std(0x2a3448), scope));
    decor.add(makeInstanced(new THREE.CylinderGeometry(1, 1, 1, 8), std(0x2a3448), tubes));
    decor.add(makeInstanced(new THREE.CylinderGeometry(1, 1, 1, 10), std(0xffffff, { transparent: true, opacity: 0.8, emissive: 0x223344, emissiveIntensity: 0.4 }), jars));
    decor.add(makeInstanced(new THREE.IcosahedronGeometry(1, 0), std(0xffffff), inner));
    const sign = makePillSprite('🔬 식물 연구 탁자', { bg: '#ffffff', fg: '#2e6b3a', border: '#2e6b3a' }, 0.5); sign.position.set(-5, 2.4, 5.4); decor.add(sign);
  }

  // ----- 2층 회랑 위: 남쪽 망원경 (지붕 너머 하늘을 본다) · 북쪽 희귀 식물 (공룡 시대부터 살아온 소철) -----
  {
    const G = PH.G, gm = (PH.GI + PH.GO) / 2;
    const scope = new THREE.Group();
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, 1.6, 10), std(0xc9a15a, { metalness: 0.6, roughness: 0.3 })); tube.position.set(0, 1.4, 0.2); tube.rotation.x = 0.7;
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.12, 10), std(0x9fe8ff, { emissive: 0x4fc3f7, emissiveIntensity: 0.8 })); lens.position.set(0, 1.98, 0.75); lens.rotation.x = 0.7 - Math.PI / 2; lens.userData.noHide = true;
    scope.add(tube, lens);
    for (let k = 0; k < 3; k++) { const a = (k / 3) * Math.PI * 2, leg = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.3, 5), std(0x5a3a1a)); leg.position.set(Math.sin(a) * 0.25, 0.6, Math.cos(a) * 0.25); leg.rotation.set(Math.cos(a) * 0.35, 0, -Math.sin(a) * 0.35); scope.add(leg); }
    scope.position.set(0, G, gm); add(scope, 1.2);
    GALLERY_PROPS.push({ x: 0, z: gm, r: 0.6 });
    const ts = makePillSprite('🔭 전망 망원경 · 유리 지붕 너머 하늘!', { bg: '#20232e', fg: '#ffd93d', border: '#ffd93d' }, 0.5); ts.position.set(0, G + 2.6, gm); decor.add(ts);
    // 소철: 큰 화분 + 굵은 줄기 + 빳빳한 깃털 잎
    const cy = new THREE.Group();
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.42, 0.7, 12), std(0xc46b2c)); pot.position.y = 0.35;
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, 0.9, 8), std(0x7a6040)); stem.position.y = 1.1;
    cy.add(pot, stem);
    for (let k = 0; k < 9; k++) { const a = (k / 9) * Math.PI * 2, leaf = new THREE.Mesh(new THREE.ConeGeometry(0.12, 1.4, 4), std(0x3f7d2a)); leaf.position.set(Math.cos(a) * 0.5, 1.75, Math.sin(a) * 0.5); leaf.rotation.set(Math.sin(a) * 0.9, 0, -Math.cos(a) * 0.9); cy.add(leaf); }
    const glow = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 8), std(0xffe066, { emissive: 0xffb300, emissiveIntensity: 1 })); glow.position.y = 1.7; glow.userData.cone = true; cy.add(glow);
    cy.position.set(0, G, -gm); add(cy, 1.2);
    GALLERY_PROPS.push({ x: 0, z: -gm, r: 0.7 });
    const cs = makePillSprite('🦕 희귀 식물 · 공룡 시대부터 살아온 소철', { bg: '#fffbe6', fg: '#3f7d2a', border: '#3f7d2a' }, 0.5); cs.position.set(0, G + 2.8, -gm); decor.add(cs);
  }

  // 워프 패드 (문 왼쪽): 마지막에 있던 지역으로 돌아간다 (main 이 state.returnTo 를 보고 처리)
  const padPos = { x: -6.5, z: 11.8 };
  const warpPad = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.6, 0.25, 24), std(0x66e0ff, { emissive: 0x2288aa, emissiveIntensity: 0.8 }));
  warpPad.position.set(padPos.x, 0.12, padPos.z);
  const warpRing = new THREE.Mesh(new THREE.TorusGeometry(1.3, 0.08, 8, 32), std(0xffffff, { emissive: 0x9fe8ff, emissiveIntensity: 1 }));
  warpRing.rotation.x = Math.PI / 2; warpRing.position.set(padPos.x, 0.5, padPos.z);
  const warpLabel = new THREE.Sprite(new THREE.SpriteMaterial({ map: makeLabelTexture('워프 패드 · 지역으로 돌아가기', '#0f5f7a', '#ffffff', 48), transparent: true, depthTest: false }));
  warpLabel.scale.set(3.6, 0.9, 1); warpLabel.position.set(padPos.x, 2.4, padPos.z);
  decor.add(warpPad, warpRing, warpLabel);

  // 오박사 (모델 오박사.glb, 없으면 드래프트): 연못 북쪽, 연구 모니터 앞
  const prof = makeNpc({ outfit: 'professor', name: '오박사', model: '오박사.glb' });
  prof.position.set(2.5, 0, -5.2);
  prof.rotation.y = 0; // 문(남쪽) 쪽을 본다
  decor.add(prof); block(2.5, -5.2, 0.7);

  let orb = null, cone = null;
  decor.traverse((o) => { if (o.userData.orb) orb = o; if (o.userData.cone) cone = o; });
  function animate(t) {
    prof.position.y = Math.sin(t * 2) * 0.03;
    if (t - screenState.lastPaint > 0.1) { screenState.lastPaint = t; paintScreen(t); } // 모니터는 초당 10번 새로 그린다
    if (screenState.subjects.length > 1 && t > screenState.switchAt) { screenState.switchAt = t + 6; screenState.idx = (screenState.idx + 1) % screenState.subjects.length; }
    if (orb) { orb.position.y = 1.8 + Math.sin(t * 1.5) * 0.25; orb.rotation.y = t; }
    if (cone) cone.material.emissiveIntensity = 0.7 + Math.sin(t * 2.5) * 0.4; // 소철 솔방울이 은은하게 반짝
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
        '이 연구소는 런던의 큐 식물원에 있는 팜 하우스를 본떠 지었단다. 쇠와 유리로 만든 커다란 온실이지. 햇빛이 잘 들어서 야자나무가 지붕까지 쑥쑥 자라!',
        '동쪽과 서쪽 끝의 하얀 나선 계단을 빙글빙글 올라가면 2층 회랑이야. 야자 잎을 가까이서 보고, 남쪽 망원경으로 하늘도 보렴. 북쪽에는 공룡 시대부터 살아온 소철이 있단다!',
        '가운데 연못의 동그란 잎은 큰가시연꽃이야. 잎이 아주 커서 진짜로는 어린아이가 올라가도 뜰 만큼 튼튼하단다. 그래도 연못에 들어가면 안 돼!',
        '불은 풀에, 물은 불에, 풀은 물에, 전기는 물에 세단다. 상대 속성을 보고 대표를 고르렴. 도감에서 강함·약함을 볼 수 있어.',
        '포켓몬 이름 옆의 ★ 개수가 등급이란다. ★~★★는 브론즈볼, ★★★는 실버볼, ★★★★~★★★★★는 골드볼, 메가 포켓몬은 메가큐브로 던지면 잘 잡혀.',
        '도감의 기술 칩에서 ⚔ 숫자는 그 기술의 위력, ×숫자는 한 대결에서 쓸 수 있는 횟수, 🔒는 아직 레벨이 모자란 기술이란다.',
      ],
    }],
  };
}
