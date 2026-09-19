import * as THREE from 'three';
import { BALLS, GRADES, gradeStars, recommendedBall, catchChance } from './balls.js';
import { buildDraftMesh, dexSizeFactor, bossZoneOf } from './creatures.js';
import { View3D } from './view3d.js';
import { colorForCount } from './palette.js';
import { skillIcon } from './types.js';
import { PLANETS } from './planets.js';

// 몬스터 도감 + 내 포켓몬.
//  - 위: "내 포켓몬" 칩(잡은 포켓몬 한 줄) + 선택한 포켓몬 한 마리의 상세 카드 (스탯·기술·진화, 내 포켓몬이면 키우기/대표/진화 버튼).
//  - 아래: 모든 종을 액자로. 액자를 누르면 그 종이 상세에 나온다. 잡은 종은 컬러 썸네일 + 이름, 아니면 검은 실루엣 + 물음표.
// 썸네일은 작은 오프스크린 렌더러로 한 번만 만들어 캐시한다.
const DEFAULT_ZONE_NAME = { forest: '푸른숲', cave: '지하동굴', volcano: '불의산', sea: '물의길', space: '꿈의우주', evolution: '진화' };
// 지도 탭: 지역 위치(0~100 좌표), 모양, 아이콘, 가는 길
const MAP_REGIONS = [
  { id: 'forest', x: 50, y: 33, rx: 17, ry: 10.5, icon: '🌲', fill: '#7ccf5a', desc: '시작 마을이 있는 숲. 풀·노말·벌레·전기 포켓몬이 산다. 다른 지역으로 가는 길이 모두 여기서 시작해.', how: '처음 시작하는 곳. 다른 지역에서 포탈·기차·로켓으로 돌아온다.' },
  { id: 'hive', x: 27, y: 19, rx: 6.5, ry: 5, icon: '🐝', fill: '#f4b400', desc: '푸른숲 서남쪽 큰 나무에 매달린 벌집 속. 육각형 벌집 칸 바닥, 빛나는 꿀 웅덩이, 천장에서 떨어지는 꿀 방울, 날아다니는 꿀벌 떼. 벌레·풀 포켓몬이 살고, 북쪽 벌집 탑 꼭대기(육각 계단 열한 개를 뛰어 올라)에 대장 독침붕이 있어.', how: '푸른숲 서남쪽 큰 나무 아래 벌집에 닿으면 들어간다. 남쪽 초록 포탈로 나오면 그 나무 아래.' },
  { id: 'cave', x: 50, y: 10, rx: 13, ry: 8, icon: '🕳️', fill: '#4b5261', desc: '어두운 지하 동굴. 땅·바위·독 포켓몬이 산다. 호수와 다리, 빛나는 웅덩이가 있어.', how: '푸른숲 북쪽 큰 구멍에 빠지거나, 푸른숲 보스를 잡은 뒤 북쪽 산의 동굴 입구로. 포탈로 돌아온다.' },
  { id: 'volcano', x: 83, y: 15, rx: 14, ry: 8.5, icon: '🌋', fill: '#c0533a', desc: '용암이 끓는 화산. 불 포켓몬이 산다. 큰 화산 꼭대기에 보스가 있어.', how: '푸른숲 동북쪽 붉은 바위 아치로 들어간다. 포탈로 돌아온다.' },
  { id: 'sea', x: 15, y: 42, rx: 14, ry: 9, icon: '🌊', fill: '#3fb8e8', desc: '다리로 이어진 모래섬들의 바다. 물 포켓몬이 산다. 남쪽 끝 섬에 보스가 있어. 동쪽 선착장에서 배를 타면 먼바다로 나가 헤엄치는 포켓몬(잉어킹·셀러·크랩·독파리, 아주 먼바다엔 라프라스)을 만난다.', how: '푸른숲 서쪽 기차역에서 기차 타기 버튼을 누른다. 돌아올 때도 그곳 기차역에서 탄다. 바다는 도착 섬 동쪽 선착장에서 배 타기.' },
  { id: 'space', x: 82, y: 49, rx: 14, ry: 8.5, icon: '🚀', fill: '#6a4ca8', desc: '별하늘 아래 보랏빛 달 표면. 신비한 포켓몬이 산다. 북쪽 제단에 보스, 하늘엔 태양과 행성들.', how: '푸른숲 남동쪽 로켓 발사장에서 로켓 타기 버튼을 누른다. 돌아올 때도 착륙장의 로켓을 탄다.' },
  { id: 'deepsea', x: 16, y: 64, rx: 13, ry: 7.5, icon: '🫧', fill: '#0b3a5c', desc: '물의길 먼바다의 소용돌이 아래에 있는 깊은 바다. 다시마 숲과 산호, 가라앉은 배가 있고 저 위로 수면이 보인다. 물속이라 몸이 가벼워 아주 높이 뛴다. 남쪽 해구에 보스 갸라도스가 산다.', how: '물의길을 정복한 뒤, 루피의 배를 타고 서쪽 먼바다의 소용돌이로 들어간다. 북쪽 상승 해류를 타면 선착장으로 돌아온다.' },
];
// 지도 아래 띠: 태양계 (꿈의우주 UFO 정거장에서 손오공의 비행접시로 가는 태양·행성 10곳). x 는 가로 자리, r 은 그림 크기
const PLANET_LAYOUT = { sun: [4, 6], mercury: [15, 2.2], venus: [24, 3], earth: [34, 3.3], mars: [44, 2.7], jupiter: [57, 5.6], saturn: [72, 4.8], uranus: [85, 3.6], neptune: [94, 3.3], pluto: [101, 1.9] };
const PLANET_Y = 98.5;
for (const p of PLANETS) {
  const [x, r] = PLANET_LAYOUT[p.id];
  MAP_REGIONS.push({ id: p.zone, planet: p, x, y: PLANET_Y, rx: r, ry: r, icon: p.emoji, fill: p.tint, desc: `${p.title}. ${p.desc} 💡 ${p.fact}`, how: `꿈의우주 서쪽 UFO 정거장의 손오공에게 말을 걸고 "다른 행성으로 가기" 팝업에서 ${p.name}을 골라 출발! 행성의 UFO 정거장에서 꿈의우주나 다른 행성으로 갈 수 있다. 중력: ${p.gravityText}.` });
}

export class Dex {
  constructor(species, zoneNames = {}, zoneRoster = {}) {
    this.species = species;
    this.byId = Object.fromEntries(species.map((s) => [s.id, s]));
    this.zoneName = { ...DEFAULT_ZONE_NAME, ...zoneNames };
    this.zoneRoster = zoneRoster; // { 지역: [종 id] } — 다른 지역의 종을 데려다 쓰는 지역 (심해)
    this.el = document.getElementById('dex');
    this.grid = document.getElementById('dex-grid');
    this.partyEl = document.getElementById('dex-party');
    this.membersEl = document.getElementById('dex-members');
    this.blocksEl = document.getElementById('dex-blocks');
    this.countEl = document.getElementById('dex-count');
    this.adminEl = document.getElementById('dex-admin');   // 관리자 탭 (main 이 채운다)
    this.friendsEl = document.getElementById('dex-friends'); // 친구 탭 (main 이 채운다)
    this.feedbackEl = document.getElementById('dex-feedback'); // 요청 탭 (main 이 채운다)
    this.rankEl = document.getElementById('dex-rank');         // 주간 순위 탭 (main 이 채운다)
    this.onTab = null; // (tab) → main 이 탭이 열릴 때 할 일 (친구 목록 새로 고침)
    this.open = false;
    this.cache = new Map(); // id -> { color, silhouette }
    this.partyCtx = null;
    this.view = new View3D(); // 카드의 360° 화면
    this.selectedId = null;
    this.tab = 'poke';
    this.mapSel = null;
    this.bodyEl = document.getElementById('dex-body');
    this.mapViewEl = document.getElementById('dex-mapview');
    this.mapEl = document.getElementById('dex-map');
    this.ballsEl = document.getElementById('dex-balls');
    this.mapDetailEl = document.getElementById('dex-map-detail');
    document.querySelectorAll('#dex-tabs button').forEach((b) => { b.onclick = () => this.setTab(b.dataset.tab); });
    document.getElementById('map-prev').onclick = () => this.stepMap(-1);
    document.getElementById('map-next').onclick = () => this.stepMap(1);
    document.getElementById('btn-dex').onclick = () => this.toggle();
    document.getElementById('btn-dex-close').onclick = () => this.hide();
    this.el.addEventListener('click', (e) => { if (e.target === this.el) this.hide(); });
  }

  /** 파티 패널 연결: party 와 블록 수, 버튼 콜백 */
  bindParty(ctx) { this.partyCtx = ctx; }

  ensureRenderer() {
    if (this.renderer) return true;
    try {
      this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
      this.renderer.setSize(180, 180);
      this.scene = new THREE.Scene();
      this.scene.add(new THREE.HemisphereLight(0xffffff, 0x99aa88, 1.6));
      const sun = new THREE.DirectionalLight(0xffffff, 1.2);
      sun.position.set(2, 4, 3);
      this.scene.add(sun);
      this.camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
      return true;
    } catch (_) { return false; }
  }

  thumbs(sp) {
    if (this.cache.has(sp.id)) return this.cache.get(sp.id);
    if (!this.ensureRenderer()) return null;
    const mesh = buildDraftMesh({ ...sp, scale: 1 }); // 도감에서는 크기를 통일
    this.scene.add(mesh);
    const box = new THREE.Box3().setFromObject(mesh);
    const size = box.getSize(new THREE.Vector3()), center = box.getCenter(new THREE.Vector3());
    const r = Math.max(size.x, size.y, size.z, 0.8);
    const dist = r / Math.tan(THREE.MathUtils.degToRad(15)) * 0.6 + r * 0.6;
    const f = dexSizeFactor(sp); mesh.scale.setScalar(f); // 메가·보스는 같은 틀에서 더 크게
    this.camera.position.set(0, center.y * f + r * 0.25, dist);
    this.camera.lookAt(0, center.y * f, 0);
    mesh.rotation.y = -0.4;
    this.renderer.render(this.scene, this.camera);
    const color = this.renderer.domElement.toDataURL();
    // 실루엣: 모든 재질을 검정으로
    const dark = new THREE.MeshBasicMaterial({ color: 0x20232e });
    mesh.traverse((o) => { if (o.isMesh) o.material = dark; if (o.isLight || o.isSprite) o.visible = false; });
    this.renderer.render(this.scene, this.camera);
    const silhouette = this.renderer.domElement.toDataURL();
    this.scene.remove(mesh);
    const out = { color, silhouette };
    this.cache.set(sp.id, out);
    return out;
  }

  select(id) { this.selectedId = id; this.render(this.lastCaught || {}); }
  setTab(tab) {
    this.tab = tab;
    document.querySelectorAll('#dex-tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
    this.bodyEl.classList.toggle('hidden', tab !== 'poke');
    this.mapViewEl.classList.toggle('hidden', tab !== 'map');
    this.ballsEl.classList.toggle('hidden', tab !== 'balls');
    this.adminEl.classList.toggle('hidden', tab !== 'admin');
    this.friendsEl.classList.toggle('hidden', tab !== 'friends');
    this.feedbackEl.classList.toggle('hidden', tab !== 'feedback');
    this.rankEl.classList.toggle('hidden', tab !== 'rank');
    this.onTab?.(tab);
    if (tab !== 'poke') this.stopView(); else if (this.selectedId && this.byId[this.selectedId]) this.render(this.lastCaught || {});
    if (tab === 'map') this.renderMap(this.lastCaught || {});
    if (tab === 'balls') this.renderBalls();
  }

  // ----- 넘버볼 탭: 블록으로 넘버볼 만들기 + 등급표 -----
  renderBalls() {
    const ctx = this.partyCtx;
    if (!ctx) return;
    const stock = ctx.getBalls?.() || {}, blocks = ctx.getBlocks();
    // 위: 볼마다 한 줄씩 (그림 · 이름 · 몇 개 · 만들기 버튼)
    const megaB = ctx.getMegaBlocks?.() || 0;
    let html = `<div class="shop-title">🔮 내 넘버볼</div>${megaB > 0 ? `<div class="shop-note">💠 메가블럭 ${megaB}개 · 최종 진화한 포켓몬을 메가 진화시킬 때 1개씩 써요</div>` : ''}<div class="ball-rows">`;
    for (const b of BALLS) {
      html += `<div class="ball-row" style="--ball:${b.css}">
        <span class="ball-dot big${b.shape === 'cube' ? ' cube' : ''}"></span><span class="ball-name">${b.name}</span>
        <span class="ball-count">${stock[b.id] || 0}<small>개</small></span>
        <button data-ball="${b.id}" ${blocks < b.cost ? 'disabled' : ''}>블록 ${b.cost}개로 만들기</button>
      </div>`;
    }
    // 아래: 볼마다 설명 한 줄 (어느 ★까지, 어느 지역 포켓몬까지 잘 잡히는지)
    const GRADE_ZONE = { 1: 'forest', 2: 'cave', 3: 'sea', 4: 'volcano', 5: 'space' };
    html += `</div><div class="shop-title">📖 넘버볼 설명</div><div class="ball-infos">`;
    for (const b of BALLS) {
      const grades = Object.keys(GRADES).map(Number).filter((g) => catchChance(g, b.tier) >= 90);
      const top = grades[grades.length - 1] || 1;
      const where = top >= 6 ? '모든 지역의 보스까지' : `${this.zoneName[GRADE_ZONE[top]] || ''} 포켓몬까지`;
      html += `<div class="ball-info" style="--ball:${b.css}"><span class="ball-dot${b.shape === 'cube' ? ' cube' : ''}"></span><b>${b.name}</b><span>블록 ${b.cost}개 · ${gradeStars(top)} ${where} 잘 잡혀</span></div>`;
    }
    html += `</div><div class="shop-note">포켓몬의 ★가 많을수록 좋은 볼이 필요해. 실패하면 도망가! (다시 만나면 잡힐 확률이 15%씩 올라)</div>`;
    this.ballsEl.innerHTML = html;
    this.ballsEl.querySelectorAll('button[data-ball]').forEach((btn) => { btn.onclick = () => { ctx.onBuyBall(btn.dataset.ball); this.renderBalls(); this.blocksEl.textContent = `${ctx.getBlocks()}`; }; });
  }

  /** ◀ ▶ 로 지역을 차례로 넘겨 본다 (푸른숲 → 지하동굴 → 불의산 → 물의길 → 꿈의우주 → 심해 → 태양 → … → 명왕성) */
  stepMap(d) {
    const ids = MAP_REGIONS.map((r) => r.id);
    const i = Math.max(0, ids.indexOf(this.mapSel));
    this.mapSel = ids[(i + d + ids.length) % ids.length];
    this.renderMap(this.lastCaught || {});
  }

  // ----- 지도 탭: 지역들을 그림으로, 정복한 곳은 금빛 ★. 누르면 그 지역의 포켓몬을 잡은/못 잡은 것으로 나눠 보여준다 -----
  renderMap(caughtById) {
    const ctx = this.partyCtx;
    const conquered = ctx?.getConquered?.() || {};
    const here = ctx?.getZoneName?.();
    if (!this.mapSel) this.mapSel = here || 'forest';
    const R = Object.fromEntries(MAP_REGIONS.map((r) => [r.id, r]));
    const curve = (a, b, cls, lift = 6) => { const A = R[a], B = R[b]; return `<path class="${cls}" d="M${A.x},${A.y} Q${(A.x + B.x) / 2},${(A.y + B.y) / 2 - lift} ${B.x},${B.y}"/>`; };
    // 배경: 양피지 + 바다 + 잔물결
    let svg = `<svg viewBox="-5 -5 110 115" preserveAspectRatio="xMidYMid meet">
      <defs>
        <radialGradient id="gSea" cx="30%" cy="55%" r="70%"><stop offset="0" stop-color="#7fd4f5"/><stop offset="1" stop-color="#3a9fd6"/></radialGradient>
        <radialGradient id="gDeep" cx="50%" cy="35%" r="70%"><stop offset="0" stop-color="#14567f"/><stop offset="1" stop-color="#062a40"/></radialGradient>
        <linearGradient id="gLand" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#b7e07f"/><stop offset="1" stop-color="#7ccf5a"/></linearGradient>
        <linearGradient id="gRock" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9aa3b3"/><stop offset="1" stop-color="#4b5261"/></linearGradient>
        <linearGradient id="gLava" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e06b3a"/><stop offset="1" stop-color="#8a2f1a"/></linearGradient>
        <radialGradient id="gSpace" cx="50%" cy="50%" r="60%"><stop offset="0" stop-color="#6a4ca8"/><stop offset="1" stop-color="#1b1236"/></radialGradient>
        <linearGradient id="gBand" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0b0a24"/><stop offset="1" stop-color="#1b1a48"/></linearGradient>
        <radialGradient id="gSunM" cx="40%" cy="40%"><stop offset="0" stop-color="#fff4b0"/><stop offset=".6" stop-color="#ffd23f"/><stop offset="1" stop-color="#ff8a1f"/></radialGradient>
        <radialGradient id="gEarthM" cx="40%" cy="38%"><stop offset="0" stop-color="#7fc4ff"/><stop offset="1" stop-color="#1f5fb8"/></radialGradient>
        <radialGradient id="gNepM" cx="40%" cy="38%"><stop offset="0" stop-color="#6a86ff"/><stop offset="1" stop-color="#22318f"/></radialGradient>
        <filter id="shadow" x="-20%" y="-20%" width="140%" height="160%"><feDropShadow dx="0" dy="1.2" stdDeviation="0.8" flood-color="#20232e" flood-opacity=".35"/></filter>
      </defs>
      <rect x="-5" y="-5" width="110" height="86" fill="url(#gSea)"/>
      ${[8, 20, 32, 44, 56, 68, 78].map((y) => `<path class="wave" d="M-5,${y} q4,-1.5 8,0 t8,0 t8,0 t8,0 t8,0 t8,0 t8,0 t8,0 t8,0 t8,0 t8,0 t8,0 t8,0 t8,0"/>`).join('')}
      <!-- 큰 섬(육지): 푸른숲 + 동굴 산 + 화산 + 우주 착륙지 -->
      <path class="land" d="M28,58 C18,50 20,34 34,26 C36,14 46,6 58,8 C66,2 80,2 92,8 C104,12 104,26 98,34 C104,44 100,58 88,62 C76,66 60,66 48,63 C40,64 32,64 28,58 Z" fill="url(#gLand)"/>
      <!-- 흙길 / 철길 / 항로 -->
      ${curve('forest', 'cave', 'path', 3)}${curve('forest', 'volcano', 'path', 8)}${curve('forest', 'sea', 'rail', 5)}${curve('forest', 'space', 'flight', 14)}${curve('forest', 'hive', 'path', 2)}
      <!-- 물의길 → 심해: 소용돌이로 내려가는 길 (지역 그림·이름표에 가리지 않게 왼쪽으로 비껴 그린다) -->
      <path class="dive" d="M${R.sea.x - R.sea.rx + 1},${R.sea.y + R.sea.ry - 2} Q${R.sea.x - R.sea.rx - 4},${(R.sea.y + R.deepsea.y) / 2} ${R.deepsea.x - R.deepsea.rx + 1},${R.deepsea.y - R.deepsea.ry + 2}"/>
      <!-- 태양계 띠 (지도 아래): 별 + 궤도선 + 제목. 꿈의우주에서 UFO 항로가 내려온다 -->
      <rect x="-5" y="83" width="110" height="27" fill="url(#gBand)"/>
      ${Array.from({ length: 46 }, (_, i) => `<circle cx="${((i * 37) % 110) - 5}" cy="${84 + ((i * 53) % 22)}" r="${0.25 + (i % 3) * 0.15}" fill="#fff" opacity="${0.35 + (i % 4) * 0.15}"/>`).join('')}
      <path class="orbit" d="M-5,${PLANET_Y} H105"/>
      <text class="band" x="50" y="85.4" text-anchor="middle">☀️ 태양계 · 꿈의우주 UFO 정거장에서 손오공의 비행접시로 간다 🛸</text>
      <path class="ufo-route" d="M${R.space.x},${R.space.y + R.space.ry} Q${R.space.x + 8},${(R.space.y + 90) / 2} 70,88"/>
      <g class="ufo" transform="translate(${R.space.x + 6},${R.space.y + R.space.ry + 12})"><ellipse rx="3.2" ry="1" fill="#d7dde8" stroke="#20232e" stroke-width=".25"/><path d="M-1.4,-.6 A1.4,1.4 0 0 1 1.4,-.6 Z" fill="#9fe8ff" stroke="#20232e" stroke-width=".2"/><circle cx="-1.8" cy=".3" r=".3" fill="#ff5c8a"/><circle cx="0" cy=".5" r=".3" fill="#ffd93d"/><circle cx="1.8" cy=".3" r=".3" fill="#6cff8a"/></g>
      <!-- 기차 -->
      <g transform="translate(31,40)"><rect x="-3" y="-1.6" width="6" height="3.2" rx=".6" fill="#e8453c"/><rect x="-3" y="-2.6" width="2.4" height="1.2" fill="#e8453c"/><circle cx="-1.6" cy="1.9" r=".7" fill="#20232e"/><circle cx="1.6" cy="1.9" r=".7" fill="#20232e"/></g>`;
    // 지역 그림
    const draw = {
      forest: (r) => `<ellipse rx="${r.rx}" ry="${r.ry}" class="blob" fill="url(#gLand)"/>
        ${[[-11, 3], [-6, -4], [0, 5], [7, -3], [11, 3], [4, 0], [-3, 0]].map(([x, y]) => `<g transform="translate(${x},${y})"><rect x="-.5" y="1.5" width="1" height="2.2" fill="#8b5a2b"/><path d="M0,-4 L3,1.8 L-3,1.8 Z" fill="#2e9e4f"/><path d="M0,-2 L2.4,2.2 L-2.4,2.2 Z" fill="#3fb85a"/></g>`).join('')}
        <g transform="translate(-1,-2)"><rect x="-2.2" y="-1.4" width="4.4" height="3.2" fill="#fff4dc" stroke="#20232e" stroke-width=".25"/><path d="M-2.8,-1.4 L0,-3.6 L2.8,-1.4 Z" fill="#e8453c"/></g>`,
      hive: (r) => `<ellipse rx="${r.rx}" ry="${r.ry}" class="blob" fill="#f4b400"/>
        ${[[-3, -1.5], [0, -1.5], [3, -1.5], [-1.5, 1.2], [1.5, 1.2]].map(([x, y]) => `<path d="M${x},${y - 1.4} L${x + 1.2},${y - 0.7} L${x + 1.2},${y + 0.7} L${x},${y + 1.4} L${x - 1.2},${y + 0.7} L${x - 1.2},${y - 0.7} Z" fill="#ffd86a" stroke="#8a5a10" stroke-width=".25"/>`).join('')}
        <ellipse cx="4.6" cy="-3.4" rx="1" ry=".6" fill="#ffd23f" stroke="#20232e" stroke-width=".2"/><ellipse cx="-5" cy="2.8" rx="1" ry=".6" fill="#ffd23f" stroke="#20232e" stroke-width=".2"/>`,
      cave: (r) => `<path d="M${-r.rx},${r.ry} Q${-r.rx * 0.5},${-r.ry * 1.3} 0,${-r.ry} Q${r.rx * 0.5},${-r.ry * 1.3} ${r.rx},${r.ry} Z" class="blob" fill="url(#gRock)"/>
        <path d="M-3,${r.ry} Q-3,${r.ry - 6} 0,${r.ry - 6} Q3,${r.ry - 6} 3,${r.ry} Z" fill="#1b1f2a"/>
        <circle cx="-6" cy="-1" r=".9" fill="#9fe8ff"/><circle cx="6" cy="0" r=".7" fill="#c9b8ff"/><circle cx="-2" cy="-4" r=".6" fill="#9fe8ff"/>`,
      volcano: (r) => `<path d="M${-r.rx},${r.ry} L-4,${-r.ry} L4,${-r.ry} L${r.rx},${r.ry} Z" class="blob" fill="url(#gLava)"/>
        <path d="M-4,${-r.ry} L4,${-r.ry} L2,${-r.ry + 3} L0,${-r.ry + 1.5} L-2,${-r.ry + 3} Z" fill="#ff6a1a"/>
        <path d="M-1,${-r.ry} L-2,${-r.ry + 6} L0,${-r.ry + 4} L1,${-r.ry + 9} " fill="none" stroke="#ff9a3c" stroke-width="1" stroke-linecap="round"/>
        <g class="smoke"><circle cx="0" cy="${-r.ry - 3}" r="2" fill="#ddd" opacity=".8"/><circle cx="2.5" cy="${-r.ry - 5}" r="1.6" fill="#eee" opacity=".7"/></g>`,
      sea: (r) => `<ellipse rx="${r.rx}" ry="${r.ry}" class="blob" fill="#4fc3f7"/>
        ${[[-7, -2, 4], [3, -4, 3.5], [7, 3, 3], [-3, 4, 3.5]].map(([x, y, rr]) => `<ellipse cx="${x}" cy="${y}" rx="${rr}" ry="${rr * 0.65}" fill="#e8d9a0" stroke="#d1b76a" stroke-width=".3"/>`).join('')}
        <g transform="translate(-7,-4)"><rect x="-.3" y="-4" width=".6" height="4" fill="#8b5a2b"/><path d="M0,-4 q3,1 2,3 z" fill="#3f9d3a"/><path d="M0,-4 q-3,1 -2,3 z" fill="#3f9d3a"/></g>
        <path d="M-4,-1 L2,-4 M3,-2 L6,2 M-2,3 L2,5" stroke="#b07a3c" stroke-width=".6" stroke-dasharray=".8 .5"/>`,
      space: (r) => `<ellipse rx="${r.rx}" ry="${r.ry}" class="blob" fill="url(#gSpace)"/>
        ${[[-9, -3], [-4, 4], [2, -5], [8, 2], [10, -3], [5, 5], [-7, 3]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r=".5" fill="#fff"/>`).join('')}
        <circle cx="-6" cy="1" r="2.2" fill="#c9b8ff"/><ellipse cx="-6" cy="1" rx="3.6" ry=".8" fill="none" stroke="#e6dcff" stroke-width=".4" transform="rotate(-20 -6 1)"/>
        <g transform="translate(3,0) rotate(-30)"><rect x="-1.1" y="-3" width="2.2" height="5" rx="1" fill="#f4f4f8" stroke="#20232e" stroke-width=".25"/><path d="M-1.1,-2 L0,-4.2 L1.1,-2 Z" fill="#e8453c"/><circle cx="0" cy="-1" r=".55" fill="#66e0ff"/><path d="M-.8,2 L0,4 L.8,2 Z" fill="#ffb347"/></g>`,
      deepsea: (r) => `<ellipse rx="${r.rx}" ry="${r.ry}" class="blob" fill="url(#gDeep)"/>
        ${[[-10, 3], [-5, 4], [4, 4], [9, 2], [-7, -1], [7, -2]].map(([x, y]) => `<path d="M${x},${y} q-1.6,-2.6 0,-4.6 q1.6,2 0,4.6" fill="#2f7d4a"/>`).join('')}
        ${[[-8, -4, .7], [-2, -5.2, .55], [5, -4.4, .6], [10, -2, .45], [-11, -1, .45]].map(([x, y, rr]) => `<circle cx="${x}" cy="${y}" r="${rr}" fill="#cdf3ff" opacity=".85"/>`).join('')}
        <g transform="translate(1,-1.4)"><path d="M-2,0 a2,1.8 0 0 1 4,0 z" fill="#8bd8ff"/><path d="M-1.2,.2 v2.2 M0,.2 v2.8 M1.2,.2 v2.2" stroke="#8bd8ff" stroke-width=".3"/></g>`,
    };
    // 태양계 띠의 행성 그림 (작은 원 + 특징 하나씩)
    const drawPlanet = {
      sun: (r) => `${Array.from({ length: 10 }, (_, i) => { const a = (i / 10) * Math.PI * 2; return `<path d="M${Math.cos(a) * r * 0.9},${Math.sin(a) * r * 0.9} L${Math.cos(a + 0.15) * r * 1.35},${Math.sin(a + 0.15) * r * 1.35} L${Math.cos(a + 0.3) * r * 0.9},${Math.sin(a + 0.3) * r * 0.9}Z" fill="#ffd23f" opacity=".9"/>`; }).join('')}<circle r="${r}" class="blob" fill="url(#gSunM)"/><circle cx="${-r * 0.3}" cy="${-r * 0.2}" r="${r * 0.12}" fill="#c94a10" opacity=".7"/>`,
      mercury: (r) => `<circle r="${r}" class="blob" fill="#a8a8b0"/><circle cx="${-r * 0.35}" cy="${-r * 0.2}" r="${r * 0.3}" fill="#6f6f78"/><circle cx="${r * 0.35}" cy="${r * 0.35}" r="${r * 0.22}" fill="#6f6f78"/>`,
      venus: (r) => `<circle r="${r}" class="blob" fill="#e8c77a"/><path d="M${-r * 0.7},${-r * 0.2} q${r * 0.7},${-r * 0.5} ${r * 1.4},0" fill="none" stroke="#fff3c4" stroke-width="${r * 0.18}" stroke-linecap="round" opacity=".8"/>`,
      earth: (r) => `<circle r="${r}" class="blob" fill="url(#gEarthM)"/><path d="M${-r * 0.6},${-r * 0.4} q${r * 0.5},${-r * 0.4} ${r * 0.9},0 q${r * 0.2},${r * 0.5} ${-r * 0.4},${r * 0.6} q${-r * 0.6},0 ${-r * 0.5},${-r * 0.6}z" fill="#3fa34d"/><ellipse cx="${r * 0.3}" cy="${r * 0.5}" rx="${r * 0.45}" ry="${r * 0.14}" fill="#fff" opacity=".85"/>`,
      mars: (r) => `<circle r="${r}" class="blob" fill="#d9603b"/><ellipse cy="${-r * 0.8}" rx="${r * 0.5}" ry="${r * 0.16}" fill="#fff" opacity=".9"/><ellipse cx="${-r * 0.2}" cy="${r * 0.2}" rx="${r * 0.4}" ry="${r * 0.2}" fill="#a8452a" opacity=".7"/>`,
      jupiter: (r) => `<clipPath id="cJm"><circle r="${r}"/></clipPath><circle r="${r}" class="blob" fill="#e8c9a0"/><g clip-path="url(#cJm)">${[[-0.7, 0.16, '#b8834a'], [-0.35, 0.14, '#d8a56a'], [0.05, 0.18, '#8a5a3a'], [0.45, 0.14, '#b8834a']].map(([y, h, c]) => `<rect x="${-r}" y="${y * r}" width="${r * 2}" height="${h * r}" fill="${c}"/>`).join('')}<ellipse cx="${r * 0.4}" cy="${r * 0.32}" rx="${r * 0.3}" ry="${r * 0.16}" fill="#c0442a"/></g>`,
      saturn: (r) => `<ellipse rx="${r * 1.9}" ry="${r * 0.45}" fill="none" stroke="#e8d9a0" stroke-width="${r * 0.22}" transform="rotate(-18)" opacity=".9"/><circle r="${r}" class="blob" fill="#e6cf8f"/><path d="M${-r * 1.9},0 A${r * 1.9},${r * 0.45} 0 0 0 ${r * 1.9},0" fill="none" stroke="#f1e3b8" stroke-width="${r * 0.22}" transform="rotate(-18)"/>`,
      uranus: (r) => `<circle r="${r}" class="blob" fill="#8fd8e8"/><ellipse rx="${r * 0.35}" ry="${r * 1.6}" fill="none" stroke="#dff6ff" stroke-width="${r * 0.12}" opacity=".85" transform="rotate(8)"/>`,
      neptune: (r) => `<circle r="${r}" class="blob" fill="url(#gNepM)"/><ellipse cx="${-r * 0.3}" cy="${-r * 0.25}" rx="${r * 0.3}" ry="${r * 0.16}" fill="#1a2a70" opacity=".85"/><ellipse cx="${r * 0.25}" cy="${r * 0.35}" rx="${r * 0.4}" ry="${r * 0.08}" fill="#fff" opacity=".8"/>`,
      pluto: (r) => `<circle r="${r}" class="blob" fill="#c9b8a8"/><path d="M0,${r * 0.75} C${-r * 0.55},${r * 0.35} ${-r * 0.65},${r * 0.05} ${-r * 0.4},${-r * 0.15} C${-r * 0.2},${-r * 0.3} 0,${-r * 0.15} 0,${r * 0.05} C0,${-r * 0.15} ${r * 0.2},${-r * 0.3} ${r * 0.4},${-r * 0.15} C${r * 0.65},${r * 0.05} ${r * 0.55},${r * 0.35} 0,${r * 0.75}z" fill="#f4f0f0"/>`,
    };
    for (const r of MAP_REGIONS) {
      const done = !!conquered[r.id];
      if (r.planet) { // 행성: 작은 그림 + 이름표(아래·위로 번갈아 놓아 겹치지 않게) + 작은 ★/? 표시. 지금 있는 곳엔 핀
        const above = PLANETS.indexOf(r.planet) % 2 === 1;
        const ly = above ? -r.rx - 3.4 : r.rx + 3.4;
        const mx = r.rx * 0.75 + 1.2, my = above ? r.rx * 0.75 + 0.6 : -r.rx * 0.75 - 0.6; // 이름표 반대쪽 어깨에
        svg += `<g class="region planet${done ? ' conquered' : ''}${this.mapSel === r.id ? ' sel' : ''}" data-zone="${r.id}" transform="translate(${r.x},${r.y})">
          ${drawPlanet[r.planet.id](r.rx)}
          <g transform="translate(0,${ly})"><rect x="-6.2" y="-2" width="12.4" height="4" rx="2" class="label-bg"/><text class="name small" y="1.05" text-anchor="middle">${this.zoneName[r.id]}</text></g>
          ${done
            ? `<g class="mark" transform="translate(${mx},${my})"><circle r="2" fill="#ffd93d" stroke="#20232e" stroke-width=".3"/><text class="star small" y=".85" text-anchor="middle">★</text></g>`
            : `<g class="mark" transform="translate(${mx},${my})"><circle r="1.9" fill="#f4f4f8" stroke="#20232e" stroke-width=".3"/><text class="lock small" y=".8" text-anchor="middle">?</text></g>`}
          ${here === r.id ? `<g class="pin" transform="translate(0,${above ? -r.rx - 6 : -r.rx - 1.6})"><path d="M0,0 L-2,-3.4 A2.2,2.2 0 1 1 2,-3.4 Z" fill="#e8453c" stroke="#20232e" stroke-width=".3"/><circle cy="-3.9" r=".8" fill="#fff"/></g>` : ''}
        </g>`;
        continue;
      }
      svg += `<g class="region${done ? ' conquered' : ''}${this.mapSel === r.id ? ' sel' : ''}" data-zone="${r.id}" transform="translate(${r.x},${r.y})" filter="url(#shadow)">
        ${draw[r.id](r)}
        <g transform="translate(0,${r.ry + 1.5})"><rect x="-10" y="-2.6" width="20" height="5.2" rx="2.6" class="label-bg"/><text class="name" y="1.3" text-anchor="middle">${this.zoneName[r.id]}</text></g>
        ${done
          ? `<g class="mark" transform="translate(${r.rx - 2},${-r.ry + 2})"><circle r="3.4" fill="#ffd93d" stroke="#20232e" stroke-width=".35"/><text class="star" y="1.4" text-anchor="middle">★</text></g>`
          : `<g class="mark" transform="translate(${r.rx - 2},${-r.ry + 2})"><circle r="3.2" fill="#f4f4f8" stroke="#20232e" stroke-width=".35"/><text class="lock" y="1.2" text-anchor="middle">?</text></g>`}
        ${here === r.id ? `<g class="pin" transform="translate(0,${-r.ry - 2})"><path d="M0,0 L-2.4,-4 A2.6,2.6 0 1 1 2.4,-4 Z" fill="#e8453c" stroke="#20232e" stroke-width=".3"/><circle cy="-4.6" r="1" fill="#fff"/></g>` : ''}
      </g>`;
    }
    svg += `<g class="legend" transform="translate(40,77)"><rect x="0" y="-3" width="46" height="5.4" rx="2.7" class="label-bg"/>
      <circle cx="3.2" cy="-.3" r="1.8" fill="#ffd93d" stroke="#20232e" stroke-width=".25"/><text x="6" y=".9">정복한 곳</text>
      <circle cx="24" cy="-.3" r="1.8" fill="#f4f4f8" stroke="#20232e" stroke-width=".25"/><text x="26.8" y=".9">아직 정복 전</text></g>`;
    svg += '</svg>';
    this.mapEl.innerHTML = svg;
    this.mapEl.querySelectorAll('.region').forEach((g) => { g.onclick = () => { this.mapSel = g.dataset.zone; this.renderMap(caughtById); }; });
    // 지역 상세 (◀ ▶ 로 넘겨 본다)
    const r = R[this.mapSel];
    document.getElementById('map-pos').textContent = `${MAP_REGIONS.findIndex((m) => m.id === r.id) + 1} / ${MAP_REGIONS.length} · ${this.zoneName[r.id]}`;
    // 그 지역에 사는 종 + (심해처럼) 다른 지역에서 종을 데려다 쓰는 지역이면 그 목록도 함께
    const roster = this.zoneRoster[r.id] || [];
    const list = [...this.species.filter((sp) => sp.zone === r.id), ...roster.map((id) => this.byId[id]).filter((sp) => sp && sp.zone !== r.id)];
    const known = list.filter((sp) => (caughtById[sp.id] || 0) > 0).length;
    const done = !!conquered[r.id];
    const badge = `${r.planet ? '<span class="badge planet">🛸 UFO 로 가는 행성</span>' : ''}<span class="badge ${done ? 'done' : ''}">${done ? '★ 정복!' : '아직 정복 전'}</span>`;
    let html = `<div class="map-title">${r.icon} ${this.zoneName[r.id]} ${badge}${here === r.id ? '<span class="badge">지금 여기</span>' : ''}</div>
      <div class="map-desc">${r.desc}</div>
      <div class="map-how">가는 길: ${r.how}</div>
      <div class="map-count">이 ${r.planet ? '행성' : '지역'}의 포켓몬 ${list.length}종 중 ${known}종을 잡았어${done ? '' : ' · 보스를 잡으면 정복!'}</div>
      <div class="map-pokes">`;
    const isBossHere = (sp) => !!sp.boss && bossZoneOf(sp) === r.id; // 꼬마돌은 지하동굴에선 야생, 수성에서만 보스
    for (const sp of list.sort((a, b) => (isBossHere(b) ? 1 : 0) - (isBossHere(a) ? 1 : 0))) {
      const n = caughtById[sp.id] || 0;
      const t = this.thumbs(sp);
      html += `<div class="map-poke ${n ? 'caught' : 'unknown'}${isBossHere(sp) ? ' boss' : ''}" data-id="${sp.id}">
        ${isBossHere(sp) ? '<span class="bossmark">보스</span>' : ''}
        ${t ? `<img src="${n ? t.color : t.silhouette}" alt="">` : ''}
        <div class="nm">${n ? sp.name : '???'}</div>
        <div class="sub">${n ? `${sp.type} · ${n}마리 잡음` : '아직 못 잡음'}</div>
      </div>`;
    }
    html += '</div>';
    this.mapDetailEl.innerHTML = html;
    this.mapDetailEl.querySelectorAll('.map-poke').forEach((el) => { el.onclick = () => { this.selectedId = el.dataset.id; this.setTab('poke'); this.render(caughtById); }; });
  }

  // ----- 내 포켓몬 칩 한 줄 -----
  renderMembers() {
    const ctx = this.partyCtx;
    this.membersEl.innerHTML = '';
    if (!ctx) return;
    const { party } = ctx;
    const title = document.createElement('span');
    title.className = 'members-title';
    title.textContent = `내 포켓몬 ${party.members.length}마리`;
    this.membersEl.appendChild(title);
    for (const m of party.members) {
      const sp = party.species(m);
      const t = this.thumbs(sp);
      const chip = document.createElement('button');
      chip.className = 'member-chip' + (party.isLeader(m) ? ' leader' : '') + (sp.id === this.selectedId ? ' sel' : '');
      chip.innerHTML = `${t ? `<img src="${t.color}" alt="">` : ''}<span>${sp.name}</span>${party.isLeader(m) ? '<i>★</i>' : ''}${m.hp <= 0 ? '<i>😵</i>' : ''}`;
      chip.onclick = () => this.select(sp.id);
      this.membersEl.appendChild(chip);
    }
  }

  // ----- 선택한 포켓몬 상세 -----
  renderDetail(caughtById) {
    const ctx = this.partyCtx;
    const party = ctx?.party;
    const sp = this.byId[this.selectedId];
    this.partyEl.innerHTML = '';
    if (!sp) { this.partyEl.innerHTML = '<div class="party-empty">아래 액자에서 포켓몬을 골라 봐!</div>'; return; }
    const n = caughtById[sp.id] || 0;
    const known = n > 0;
    const t = this.thumbs(sp);
    const zone = this.zoneName[sp.zone] || '???';
    const from = sp.evolvedFrom ? this.byId[sp.evolvedFrom] : null;
    const evo = sp.evolution;
    const evoTo = evo ? this.byId[evo.to] : null;
    const card = document.createElement('div');
    card.className = 'detail-card' + (known ? '' : ' unknown');
    card.style.borderColor = known ? (sp.draftShape?.color || '#ffd93d') : '#ccc';
    if (!known) {
      card.innerHTML = `
        <div class="detail-top">
          ${t ? `<img src="${t.silhouette}" alt="">` : ''}
          <div class="detail-info">
            <div class="detail-name">???</div>
            <div class="detail-sub">${from ? `${(caughtById[from.id] || 0) > 0 ? from.name : '???'}의 진화형${sp.boss ? ` · ${this.zoneName[bossZoneOf(sp)] || ''} 보스` : ''}` : `사는 곳: ${zone}${sp.boss ? ` (${this.zoneName[bossZoneOf(sp)] || ''} 보스)` : ''}`}</div>
            <div class="detail-desc">아직 만나지 못한 포켓몬이야. ${sp.boss ? `${this.zoneName[bossZoneOf(sp)] || zone}의 보스를 찾아 잡아 보자!` : from ? '진화시키면 알 수 있어.' : `${zone}에서 찾아보자!`}</div>
          </div>
        </div>`;
      this.partyEl.appendChild(card);
      return;
    }
    // 아이가 한눈에 보게: 큰 3D 모습 + 짧은 사실 몇 줄 (사는 곳·체력·공격·강약·볼·기술·진화)
    const ti = ctx?.typeInfo ? ctx.typeInfo(sp.type) : null;
    const mineAll = party ? party.members.filter((m) => m.speciesId === sp.id) : [];
    const rep0 = mineAll.find((m) => party.isLeader(m)) || mineAll[0] || null; // 내 포켓몬이면 그 아이 기준으로 기술 잠금을 보여 준다
    const skills = (sp.skills || []).map((s) => {
      const locked = rep0 ? rep0.atk < s.atk : false;
      return locked ? `<span class="skill-chip locked">${skillIcon(s)} ${s.name} <small>🔒 공격 ${s.atk}</small></span>` : `<span class="skill-chip">${skillIcon(s)} ${s.name}${rep0 ? ` <small>${party.damage(rep0, s)}</small>` : ''}</span>`;
    }).join('');
    const evoZone = evo ? (this.zoneName[ctx?.evolveZone?.(sp.type) || 'forest'] || '') : '';
    const starTarget = mineAll.find((m) => !party.isFainted(m)) || null;
    const star = rep0 ? `<button class="view-star${party.isLeader(rep0) ? ' on' : ''}" title="${party.isLeader(rep0) ? '지금 대표 포켓몬' : '대표로 하기'}">${party.isLeader(rep0) ? '★' : '☆'}</button>` : '';
    card.innerHTML = `
      <div class="detail-top">
        <div class="detail-view"><div class="view-wrap"><canvas id="dex-view" width="440" height="440"></canvas>${star}</div><div class="view-hint">${rep0 ? '★ 별을 누르면 대표 · ' : ''}끌어서 돌려 보기</div></div>
        <div class="detail-info">
          <div class="detail-name">${sp.name} <span class="party-type">${sp.type}</span>${sp.boss ? ' <span class="party-badge boss">보스</span>' : ''}</div>
          <div class="detail-chips">
            <span class="chip">🏠 ${from ? `${from.name}의 진화형` : zone}</span>
            <span class="chip hp">❤ ${sp.baseHp}</span><span class="chip atk">⚔ ${sp.baseAtk}</span>
            <span class="chip gold">${gradeStars(sp.grade || 1)}</span>
            <span class="chip">잡은 수 ${n}</span>
          </div>
          <ul class="detail-facts">
            ${ti ? `<li>💪 잘 이겨: <b>${ti.strong.length ? ti.strong.join(' · ') : '없음'}</b> &nbsp; 😖 조심: <b>${ti.weak.length ? ti.weak.join(' · ') : '없음'}</b></li>` : ''}
            <li>🔮 <b>${recommendedBall(sp.grade || 1).name}</b>이면 잘 잡혀</li>
            <li class="skills">🎯 ${skills}</li>
            ${evo ? `<li>✨ ${evo.wins ? `${evo.wins}번 이기고` : `보스 ${evo.boss}명 이기고`} 공격 ${evo.atk}·체력 ${evo.hp}가 되면 <b>${evoZone}</b>에서 <b>${evoTo?.name || '?'}</b>로 진화!</li>` : ''}
          </ul>
        </div>
      </div>`;
    const starBtn = card.querySelector('.view-star');
    if (starBtn && starTarget && !party.isLeader(starTarget)) starBtn.onclick = () => { ctx.onLeader(starTarget); this.render(this.lastCaught || {}); };
    // 내 포켓몬 중 이 종: 한 마리씩 줄로 (키우기·대표·진화)
    const mine = mineAll;
    if (mine.length) {
      const blocks = ctx.getBlocks();
      const list = document.createElement('div');
      list.className = 'detail-members';
      mine.forEach((m, i) => {
        const leader = party.isLeader(m);
        const canEvolve = party.canEvolve(m);
        const need = party.evolveNeed(m);
        const zoneBlocked = need && party.readyExceptZone(m) && !canEvolve;
        const fainted = party.isFainted(m);
        const costHp = party.upgradeCost(m, 'hp'), costAtk = party.upgradeCost(m, 'atk');
        const row = document.createElement('div');
        row.className = 'member-row' + (leader ? ' leader' : '') + (fainted ? ' fainted' : '');
        row.innerHTML = `
          <div class="member-head">내 ${sp.name} ${leader ? '<span class="party-badge">대표</span>' : ''}${fainted ? '<span class="party-badge faint">😵 기절 · 오박사님께 치료</span>' : ''}
            <span class="hp">❤ ${m.hp}/${m.maxHp}</span> <span class="atk">⚔ ${m.atk}</span>${need?.wins ? ` <span class="wins">🏆 ${m.wins || 0}/${need.wins}승</span>` : ''}</div>
          <div class="member-actions">
            <span>🌱 키우기</span>
            <button data-act="hp1" ${blocks < costHp ? 'disabled' : ''}>❤ +1 <small>🧱${costHp}</small></button>
            <button data-act="atk1" ${blocks < costAtk ? 'disabled' : ''}>⚔ +1 <small>🧱${costAtk}</small></button>
            ${leader || fainted || mine.length < 2 ? '' : '<button data-act="leader" class="btn-leader">☆ 대표</button>'}
            ${evo ? `<button data-act="evolve" class="btn-evolve${evo.mega ? ' mega' : ''}" ${canEvolve ? '' : 'disabled'} title="공격 ${evo.atk} · 체력 ${evo.hp} · ${evo.mega ? `메가블럭 ${evo.mega}개 필요` : evo.wins ? `대표로 ${evo.wins}번 이기면` : `지역 보스 ${evo.boss}명 이기면`} 진화">${evo.mega ? '💠 메가 진화!' : '✨ 진화!'}</button>` : ''}
            ${evo?.mega ? `<span class="mega-need${(need?.megaNow || 0) >= evo.mega ? ' ok' : ''}">💠 메가블럭 ${need?.megaNow || 0}/${evo.mega}</span>` : ''}
            ${zoneBlocked ? `<span class="shop-for">준비 끝! ${this.zoneName[need.zone] || need.zone}에 가면 진화!</span>` : ''}
          </div>`;
        row.querySelectorAll('button[data-act]').forEach((b) => {
          b.onclick = () => {
            const act = b.dataset.act;
            if (act === 'leader') ctx.onLeader(m);
            else if (act === 'evolve') { ctx.onEvolve(m); this.selectedId = m.speciesId; }
            else ctx.onUpgrade(m, act.startsWith('hp') ? 'hp' : 'atk');
            this.render(this.lastCaught || {});
          };
        });
        list.appendChild(row);
      });
      card.appendChild(list);
    }
    this.partyEl.appendChild(card);
    this.startView(sp);
  }

  // ----- 360° 보기: 선택한 포켓몬을 작은 3D 화면에서 천천히 돌리고, 끌면 직접 돌릴 수 있다 -----
  startView(sp) { this.view.show(document.getElementById('dex-view'), sp, () => this.open); }
  stopView() { this.view.stop(); }

  render(caughtById) {
    const ctx = this.partyCtx;
    if (ctx) {
      const blocks = ctx.getBlocks(), megaB = ctx.getMegaBlocks?.() || 0;
      this.blocksEl.textContent = `${blocks}`; // 메가블럭 수는 넘버볼 탭에서
      this.blocksEl.style.background = blocks > 0 ? colorForCount(blocks) : '#bbb';
      const L = ctx.party.leader;
      if (!this.selectedId || !this.byId[this.selectedId]) this.selectedId = L ? L.speciesId : (this.species.find((s) => caughtById[s.id])?.id || null);
    }
    this.renderMembers();
    this.renderDetail(caughtById);

    this.grid.innerHTML = '';
    let caughtSpecies = 0;
    for (const sp of this.species) {
      const n = caughtById[sp.id] || 0;
      const known = n > 0;
      if (known) caughtSpecies++;
      const t = this.thumbs(sp);
      const item = document.createElement('div');
      item.className = 'dex-item ' + (known ? 'caught' : 'unknown') + (sp.id === this.selectedId ? ' sel' : '');
      const zone = this.zoneName[sp.zone] || '???';
      const from = sp.evolvedFrom ? this.byId[sp.evolvedFrom] : null;
      const fromKnown = !!(from && (caughtById[from.id] || 0) > 0);
      const sub = (known
        ? (from ? `${from.name}의 진화형 · ${n}마리` : `${zone}${sp.boss ? ` · ${this.zoneName[bossZoneOf(sp)] || ''} 보스` : ''} · ${n}마리`)
        : (from ? `${fromKnown ? from.name : '???'}의 진화형` : `${zone}${sp.boss ? ` · ${this.zoneName[bossZoneOf(sp)] || ''} 보스` : ''}`)) + ` · ${gradeStars(sp.grade || 1)}`;
      item.innerHTML = `
        ${t ? `<img src="${known ? t.color : t.silhouette}" alt="">` : ''}
        ${known ? '' : '<div class="dex-q">?</div>'}
        <div class="dex-name">${known ? sp.name : '???'}</div>
        <div class="dex-sub">${sub}</div>`;
      item.onclick = () => this.select(sp.id);
      this.grid.appendChild(item);
    }
    this.countEl.textContent = `도감 ${caughtSpecies} / ${this.species.length} 종`;

  }

  show(caughtById) { this.render(caughtById); if (this.tab === 'map') this.renderMap(caughtById); if (this.tab === 'balls') this.renderBalls(); this.el.classList.remove('hidden'); this.open = true; }
  hide() { this.el.classList.add('hidden'); this.open = false; this.stopView(); }
  toggle(caughtById) { if (this.open) this.hide(); else this.show(caughtById || this.lastCaught || {}); }
}
