import * as THREE from 'three';
import { makeNpc } from './npc.js';
import { makeLabelTexture } from './world.js';
import { NUMBER_COLORS } from './palette.js';

// 오박사 연구소 내부: 푸른숲 마을의 연구소 문으로 들어오면 오는 작은 실내 지역.
// 몬스터·블록·구출은 없고, 오박사에게 가까이 가서 대화 버튼을 누르면 이야기(힌트)를 해 주고 포켓몬을 치료해 준다.
export const LAB = { size: 40, room: { w: 26, d: 18 }, spawn: { x: 0, z: 6 }, door: { x: 0, z: 9.6 } };
const R = LAB.room;
const inDoorway = (x, z) => Math.abs(x) < 1.3 && z > R.d / 2 - 0.6;
export const LAB_TERRAIN = {
  height: () => 0, inHole: () => false, size: LAB.size, obstacles: [],
  blocked: (x, z) => !inDoorway(x, z) && (Math.abs(x) > R.w / 2 - 0.6 || Math.abs(z) > R.d / 2 - 0.6), // 벽 밖으로는 못 나간다 (문 쪽만 열림)
};

export function buildLab(scene) {
  const decor = new THREE.Group();
  scene.add(decor);
  const obstacles = LAB_TERRAIN.obstacles;
  obstacles.length = 0;
  const block = (x, z, r) => obstacles.push({ x, z, r });

  scene.background = new THREE.Color(0x1b2230);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x9aa4b8, 1.5));
  const sun = new THREE.DirectionalLight(0xffffff, 1.1);
  sun.position.set(8, 20, 6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -20, right: 20, top: 20, bottom: -20, near: 1, far: 60 });
  scene.add(sun, sun.target);
  for (const [lx, lz] of [[-7, -3], [7, -3], [-7, 4], [7, 4]]) { const l = new THREE.PointLight(0xfff4d6, 1.2, 16); l.position.set(lx, 3.6, lz); scene.add(l); }

  // 바닥: 밝은 타일 (체크무늬) + 문 앞 러그
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(R.w, R.d, 13, 9), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 }));
  {
    const pos = floor.geometry.attributes.position, cols = [];
    const a = new THREE.Color(0xe9eef5), b = new THREE.Color(0xd3dbe6);
    for (let i = 0; i < pos.count; i++) { const c = (Math.floor(pos.getX(i) / 2) + Math.floor(pos.getY(i) / 2)) % 2 === 0 ? a : b; cols.push(c.r, c.g, c.b); }
    floor.geometry.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  }
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; floor.userData.noHide = true; // 카메라 가림 처리에서 제외
  decor.add(floor);
  const rug = new THREE.Mesh(new THREE.CircleGeometry(2.2, 24), new THREE.MeshStandardMaterial({ color: 0xe8453c }));
  rug.rotation.x = -Math.PI / 2; rug.position.set(0, 0.02, 5.5); rug.userData.noHide = true;
  decor.add(rug);

  // 벽: 흰 벽 + 파란 띠, 남쪽 벽 가운데는 문
  const wallMat = new THREE.MeshStandardMaterial({ color: 0xf6f3ea }), bandMat = new THREE.MeshStandardMaterial({ color: 0x3fb8e8 });
  const H = 4;
  const wall = (w, d, x, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, H, d), wallMat); m.position.set(x, H / 2, z); m.receiveShadow = true; decor.add(m); const band = new THREE.Mesh(new THREE.BoxGeometry(w + 0.02, 0.5, d + 0.02), bandMat); band.position.set(x, 1.1, z); decor.add(band); };
  wall(R.w + 1, 0.5, 0, -R.d / 2 - 0.25);
  wall(0.5, R.d + 1, -R.w / 2 - 0.25, 0);
  wall(0.5, R.d + 1, R.w / 2 + 0.25, 0);
  wall(R.w / 2 - 1.5, 0.5, -(R.w / 4 + 0.75), R.d / 2 + 0.25);
  wall(R.w / 2 - 1.5, 0.5, R.w / 4 + 0.75, R.d / 2 + 0.25);
  const doorFrame = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.6, 0.6), new THREE.MeshStandardMaterial({ color: 0x3a5f9b }));
  doorFrame.position.set(0, 3.2, R.d / 2 + 0.25);
  decor.add(doorFrame);
  const exitSign = new THREE.Sprite(new THREE.SpriteMaterial({ map: makeLabelTexture('▼ 나가기 (마을)', '#3a5f9b', '#ffffff', 48), transparent: true, depthTest: false }));
  exitSign.scale.set(3, 0.75, 1); exitSign.position.set(0, 2.6, R.d / 2 - 0.4);
  decor.add(exitSign);

  // 북쪽 벽 큰 화면
  // 연구 모니터: 포켓몬 그림을 스캔하며 체력·공격 막대와 분석 그래프가 움직이는 화면 (그림은 main 이 도감에서 넣어 준다)
  const screenCanvas = document.createElement('canvas'); screenCanvas.width = 1024; screenCanvas.height = 364;
  const screenTex = new THREE.CanvasTexture(screenCanvas); screenTex.colorSpace = THREE.SRGBColorSpace;
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(9, 3.2), new THREE.MeshBasicMaterial({ map: screenTex }));
  screen.position.set(0, 2.3, -R.d / 2 + 0.02);
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
  const screenGlow = new THREE.PointLight(0x4fc3f7, 1.5, 12); screenGlow.position.set(0, 2.3, -R.d / 2 + 1.5); decor.add(screenGlow);

  // 책상 + 모니터 (북쪽 벽 앞)
  const deskMat = new THREE.MeshStandardMaterial({ color: 0xc9a15a }), metalMat = new THREE.MeshStandardMaterial({ color: 0x8a94a6 });
  const monitorMat = new THREE.MeshStandardMaterial({ color: 0x1f2a3a, emissive: 0x4fc3f7, emissiveIntensity: 0.6 });
  for (const dx of [-9, -3.5, 3.5, 9]) {
    const desk = new THREE.Mesh(new THREE.BoxGeometry(4, 0.15, 1.6), deskMat); desk.position.set(dx, 0.9, -6.5); desk.castShadow = true;
    for (const lx of [-1.8, 1.8]) for (const lz of [-0.6, 0.6]) { const leg = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.9, 0.12), metalMat); leg.position.set(dx + lx, 0.45, -6.5 + lz); decor.add(leg); }
    const mon = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.0, 0.08), monitorMat); mon.position.set(dx, 1.6, -6.9);
    const stand = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.2), metalMat); stand.position.set(dx, 1.1, -6.9);
    const kb = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.06, 0.4), new THREE.MeshStandardMaterial({ color: 0xdddddd })); kb.position.set(dx, 1.0, -6.1);
    decor.add(desk, mon, stand, kb);
    obstacles.push({ ax: dx - 2, az: -6.5, bx: dx + 2, bz: -6.5, r: 1.0 });
  }

  // 책장 (서쪽 벽)
  for (const bz of [-3, 1, 5]) {
    const shelf = new THREE.Mesh(new THREE.BoxGeometry(0.6, 3.2, 3), new THREE.MeshStandardMaterial({ color: 0x7a4d22 })); shelf.position.set(-R.w / 2 + 0.3, 1.6, bz); shelf.castShadow = true;
    decor.add(shelf);
    for (let row = 0; row < 3; row++) for (let k = 0; k < 6; k++) {
      const book = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.7, 0.32), new THREE.MeshStandardMaterial({ color: NUMBER_COLORS[(k + row * 2) % 10 + 1].base }));
      book.position.set(-R.w / 2 + 0.75, 0.55 + row * 1.0, bz - 1.2 + k * 0.45);
      decor.add(book);
    }
    obstacles.push({ ax: -R.w / 2 + 0.6, az: bz - 1.5, bx: -R.w / 2 + 0.6, bz: bz + 1.5, r: 0.8 });
  }

  // 몬스터볼 선반 (동쪽 벽): 숫자 색 볼이 줄지어
  {
    const rack = new THREE.Mesh(new THREE.BoxGeometry(0.5, 3, 6), new THREE.MeshStandardMaterial({ color: 0xdfe6ee })); rack.position.set(R.w / 2 - 0.3, 1.5, 0);
    decor.add(rack);
    for (let row = 0; row < 3; row++) for (let k = 0; k < 8; k++) {
      const n = (row * 8 + k) % 10 + 1;
      const ball = new THREE.Group();
      const top = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: NUMBER_COLORS[n].base }));
      const bottom = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xffffff }));
      const btn = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), new THREE.MeshStandardMaterial({ color: 0x20232e })); btn.position.x = -0.2;
      ball.add(top, bottom, btn);
      ball.position.set(R.w / 2 - 0.75, 0.6 + row * 0.9, -2.6 + k * 0.75);
      decor.add(ball);
    }
    obstacles.push({ ax: R.w / 2 - 0.6, az: -3, bx: R.w / 2 - 0.6, bz: 3, r: 0.8 });
  }

  // 치료·연구 캡슐 (동쪽 앞): 유리 원통 안에 빛나는 몬스터볼
  {
    const g = new THREE.Group();
    const base = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.4, 0.5, 20), metalMat); base.position.y = 0.25;
    const glass = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.0, 2.6, 24, 1, true), new THREE.MeshStandardMaterial({ color: 0x9fe8ff, transparent: true, opacity: 0.35, side: THREE.DoubleSide })); glass.position.y = 1.8;
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.15, 0.4, 20), metalMat); cap.position.y = 3.3;
    const orb = new THREE.Mesh(new THREE.SphereGeometry(0.45, 16, 12), new THREE.MeshStandardMaterial({ color: 0xffd93d, emissive: 0xffb300, emissiveIntensity: 1 })); orb.position.y = 1.8; orb.userData.orb = true;
    const light = new THREE.PointLight(0xffd36b, 2.5, 8); light.position.y = 1.8;
    g.add(base, glass, cap, orb, light);
    g.position.set(8.5, 0, -2);
    decor.add(g); block(8.5, -2, 1.6);
  }

  // 가운데 실험 탁자 두 개: 비커·시험관
  for (const tx of [-4.5, 3]) {
    const table = new THREE.Mesh(new THREE.BoxGeometry(4.5, 0.15, 1.8), new THREE.MeshStandardMaterial({ color: 0xe9eef5 })); table.position.set(tx, 0.95, 1); table.castShadow = true;
    for (const lx of [-2, 2]) for (const lz of [-0.7, 0.7]) { const leg = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.95, 0.12), metalMat); leg.position.set(tx + lx, 0.47, 1 + lz); decor.add(leg); }
    decor.add(table);
    for (let k = 0; k < 4; k++) {
      const col = [0x4fc3f7, 0x7ed957, 0xff6b9d, 0xffd93d][k];
      const beaker = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.55, 10), new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.5, transparent: true, opacity: 0.85 }));
      beaker.position.set(tx - 1.4 + k * 0.9, 1.3, 1 + (k % 2 ? 0.4 : -0.3));
      decor.add(beaker);
    }
    obstacles.push({ ax: tx - 2.2, az: 1, bx: tx + 2.2, bz: 1, r: 1.1 });
  }
  // 화분
  for (const [px, pz] of [[-11.5, 7.5], [11.5, 7.5], [11.5, -7.5]]) {
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.4, 0.7, 10), new THREE.MeshStandardMaterial({ color: 0xc46b2c })); pot.position.set(px, 0.35, pz);
    const plant = new THREE.Mesh(new THREE.ConeGeometry(0.7, 1.6, 8), new THREE.MeshStandardMaterial({ color: 0x3f9d3a })); plant.position.set(px, 1.5, pz);
    decor.add(pot, plant); block(px, pz, 0.6);
  }

  // 워프 패드: 마지막에 있던 지역으로 돌아간다 (main 이 state.returnTo 를 보고 처리)
  const padPos = { x: -8, z: 5.5 };
  const warpPad = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.6, 0.25, 24), new THREE.MeshStandardMaterial({ color: 0x66e0ff, emissive: 0x2288aa, emissiveIntensity: 0.8 }));
  warpPad.position.set(padPos.x, 0.12, padPos.z);
  const warpRing = new THREE.Mesh(new THREE.TorusGeometry(1.3, 0.08, 8, 32), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x9fe8ff, emissiveIntensity: 1 }));
  warpRing.rotation.x = Math.PI / 2; warpRing.position.set(padPos.x, 0.5, padPos.z);
  const warpLabel = new THREE.Sprite(new THREE.SpriteMaterial({ map: makeLabelTexture('워프 패드 · 지역으로 돌아가기', '#0f5f7a', '#ffffff', 48), transparent: true, depthTest: false }));
  warpLabel.scale.set(3.6, 0.9, 1); warpLabel.position.set(padPos.x, 2.4, padPos.z);
  decor.add(warpPad, warpRing, warpLabel);

  // 오박사 (모델 오박사.glb, 없으면 드래프트)
  const prof = makeNpc({ outfit: 'professor', name: '오박사', model: '오박사.glb' });
  prof.position.set(5.5, 0, -3.5);
  prof.rotation.y = Math.PI; // 문(남쪽) 쪽을 본다
  decor.add(prof); block(5.5, -3.5, 0.7);

  let orb = null;
  decor.traverse((o) => { if (o.userData.orb) orb = o; });
  function animate(t) {
    prof.position.y = Math.sin(t * 2) * 0.03;
    if (t - screenState.lastPaint > 0.1) { screenState.lastPaint = t; paintScreen(t); } // 모니터는 초당 10번 새로 그린다
    if (screenState.subjects.length > 1 && t > screenState.switchAt) { screenState.switchAt = t + 6; screenState.idx = (screenState.idx + 1) % screenState.subjects.length; }
    if (orb) { orb.position.y = 1.8 + Math.sin(t * 1.5) * 0.25; orb.rotation.y = t; }
    warpRing.position.y = 0.5 + Math.sin(t * 2) * 0.15; warpRing.rotation.z = t;
  }

  return {
    sun, animate, terrain: LAB_TERRAIN, decor, spawn: LAB.spawn, portal: LAB.door, dark: false, indoor: true,
    wildSpots: [], pickupSpots: [],
    warpPad: padPos,
    setScreenSubjects,
    npcs: [{
      x: prof.position.x, z: prof.position.z, mesh: prof, name: '오박사', heal: true,
      lines: (c) => [
        `안녕, ${c.name}! 난 오박사란다. 다친 포켓몬은 언제든 여기서 치료해 줄게. 포켓몬을 잡아서 함께 모험하렴!`,
        '숫자블록으로 도감에서 포켓몬의 체력이나 공격력을 올릴 수 있단다. 스탯이 5칸 오를 때마다 블록이 하나씩 더 들어(0~4는 2개, 5~9는 3개, 10~14는 4개…). 넘버볼도 블록으로 만드니 아껴 쓰렴.',
        '공격력이 10, 20이 되면 새 기술을 배운단다. 공격 10·체력 15가 되고 대표로 5번 이기면 진화할 수 있어!',
        '이상해씨는 이상해풀을 거쳐 이상해꽃으로, 파이리는 리자드를 거쳐 리자몽으로 두 번 진화한단다. 두 번째 진화는 공격 20·체력 30에 지역 보스를 한 명 이겨야 해.',
        '대결에서 지면 그 포켓몬은 기절해서 못 싸워. 여기서 치료받으면 낫지. 다른 지역의 안내원에게 부탁하면 연구소로 데려다준단다.',
        '왼쪽의 워프 패드에 올라서면 마지막에 있던 지역으로 바로 돌아갈 수 있어.',
        '불은 풀에, 물은 불에, 풀은 물에, 전기는 물에 세단다. 상대 속성을 보고 대표를 고르렴. 도감에서 강함·약함을 볼 수 있어.',
      ],
    }],
  };
}
