import * as THREE from 'three';
import { BALLS, GRADES, gradeStars, recommendedBall, catchChance } from './balls.js';
import { buildDraftMesh } from './creatures.js';
import { colorForCount } from './palette.js';

// 몬스터 도감 + 내 포켓몬.
//  - 위: "내 포켓몬" 칩(잡은 포켓몬 한 줄) + 선택한 포켓몬 한 마리의 상세 카드 (스탯·기술·진화, 내 포켓몬이면 키우기/대표/진화 버튼).
//  - 아래: 모든 종을 액자로. 액자를 누르면 그 종이 상세에 나온다. 잡은 종은 컬러 썸네일 + 이름, 아니면 검은 실루엣 + 물음표.
// 썸네일은 작은 오프스크린 렌더러로 한 번만 만들어 캐시한다.
const DEFAULT_ZONE_NAME = { forest: '푸른숲', cave: '지하동굴', volcano: '불의산', sea: '물의길', space: '꿈의우주', evolution: '진화' };
// 지도 탭: 지역 위치(0~100 좌표), 모양, 아이콘, 가는 길
const MAP_REGIONS = [
  { id: 'forest', x: 50, y: 33, rx: 17, ry: 10.5, icon: '🌲', fill: '#7ccf5a', desc: '시작 마을이 있는 숲. 풀·노말·벌레·전기 포켓몬이 산다. 다른 지역으로 가는 길이 모두 여기서 시작해.', how: '처음 시작하는 곳. 다른 지역에서 포탈·기차·로켓으로 돌아온다.' },
  { id: 'cave', x: 50, y: 10, rx: 13, ry: 8, icon: '🕳️', fill: '#4b5261', desc: '어두운 지하 동굴. 땅·바위·독 포켓몬이 산다. 호수와 다리, 빛나는 웅덩이가 있어.', how: '푸른숲 북쪽 큰 구멍에 빠지거나, 푸른숲 보스를 잡은 뒤 북쪽 산의 동굴 입구로. 포탈로 돌아온다.' },
  { id: 'volcano', x: 83, y: 15, rx: 14, ry: 8.5, icon: '🌋', fill: '#c0533a', desc: '용암이 끓는 화산. 불 포켓몬이 산다. 큰 화산 꼭대기에 보스가 있어.', how: '푸른숲 동북쪽 붉은 바위 아치로 들어간다. 포탈로 돌아온다.' },
  { id: 'sea', x: 15, y: 42, rx: 14, ry: 9, icon: '🌊', fill: '#3fb8e8', desc: '다리로 이어진 모래섬들의 바다. 물 포켓몬이 산다. 남쪽 끝 섬에 보스가 있어.', how: '푸른숲 서쪽 기차역에서 기차를 탄다 (E). 돌아올 때도 그곳 기차역에서 기차를 탄다.' },
  { id: 'space', x: 82, y: 49, rx: 14, ry: 8.5, icon: '🚀', fill: '#6a4ca8', desc: '별하늘 아래 보랏빛 달 표면. 신비한 포켓몬이 산다. 북쪽 제단에 보스, 하늘엔 태양과 행성들.', how: '푸른숲 남동쪽 로켓 발사장에서 로켓을 탄다 (E). 돌아올 때도 착륙장의 로켓을 탄다.' },
];

export class Dex {
  constructor(species, zoneNames = {}) {
    this.species = species;
    this.byId = Object.fromEntries(species.map((s) => [s.id, s]));
    this.zoneName = { ...DEFAULT_ZONE_NAME, ...zoneNames };
    this.el = document.getElementById('dex');
    this.grid = document.getElementById('dex-grid');
    this.partyEl = document.getElementById('dex-party');
    this.membersEl = document.getElementById('dex-members');
    this.blocksEl = document.getElementById('dex-blocks');
    this.countEl = document.getElementById('dex-count');
    this.open = false;
    this.cache = new Map(); // id -> { color, silhouette }
    this.partyCtx = null;
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
    this.camera.position.set(0, center.y + r * 0.25, dist);
    this.camera.lookAt(0, center.y, 0);
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
    if (tab === 'map') this.renderMap(this.lastCaught || {});
    if (tab === 'balls') this.renderBalls();
  }

  // ----- 넘버볼 탭: 블록으로 넘버볼 만들기 + 등급표 -----
  renderBalls() {
    const ctx = this.partyCtx;
    if (!ctx) return;
    const stock = ctx.getBalls?.() || {}, blocks = ctx.getBlocks();
    let html = `<div class="shop-title">🔮 내 넘버볼</div><div class="shop-grid">`;
    for (const b of BALLS) {
      const grades = Object.keys(GRADES).filter((g) => catchChance(+g, b.tier) >= 90);
      html += `<div class="shop-card" style="--ball:${b.css}">
        <div class="shop-head"><span class="ball-dot" style="--ball:${b.css}"></span>${b.name}</div>
        <div class="shop-count">${stock[b.id] || 0}<small>개</small></div>
        <div class="shop-for">${gradeStars(+grades[grades.length - 1] || 1)} 까지 잘 잡혀</div>
        <button data-ball="${b.id}" ${blocks < b.cost ? 'disabled' : ''}>블록 ${b.cost}개로 만들기</button>
      </div>`;
    }
    html += `</div><div class="shop-note">포켓몬의 ★가 많을수록 좋은 볼이 필요해. 실패하면 도망가!</div>`;
    this.ballsEl.innerHTML = html;
    this.ballsEl.querySelectorAll('button[data-ball]').forEach((btn) => { btn.onclick = () => { ctx.onBuyBall(btn.dataset.ball); this.renderBalls(); this.blocksEl.textContent = `${ctx.getBlocks()}`; }; });
  }

  /** ◀ ▶ 로 지역을 차례로 넘겨 본다 (푸른숲 → 지하동굴 → 불의산 → 물의길 → 꿈의우주) */
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
    let svg = `<svg viewBox="-5 -5 110 72" preserveAspectRatio="xMidYMid meet">
      <defs>
        <radialGradient id="gSea" cx="30%" cy="55%" r="70%"><stop offset="0" stop-color="#7fd4f5"/><stop offset="1" stop-color="#3a9fd6"/></radialGradient>
        <linearGradient id="gLand" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#b7e07f"/><stop offset="1" stop-color="#7ccf5a"/></linearGradient>
        <linearGradient id="gRock" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9aa3b3"/><stop offset="1" stop-color="#4b5261"/></linearGradient>
        <linearGradient id="gLava" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e06b3a"/><stop offset="1" stop-color="#8a2f1a"/></linearGradient>
        <radialGradient id="gSpace" cx="50%" cy="50%" r="60%"><stop offset="0" stop-color="#6a4ca8"/><stop offset="1" stop-color="#1b1236"/></radialGradient>
        <filter id="shadow" x="-20%" y="-20%" width="140%" height="160%"><feDropShadow dx="0" dy="1.2" stdDeviation="0.8" flood-color="#20232e" flood-opacity=".35"/></filter>
      </defs>
      <rect x="-5" y="-5" width="110" height="72" fill="url(#gSea)"/>
      ${[8, 20, 32, 44, 56].map((y) => `<path class="wave" d="M-5,${y} q4,-1.5 8,0 t8,0 t8,0 t8,0 t8,0 t8,0 t8,0 t8,0 t8,0 t8,0 t8,0 t8,0 t8,0 t8,0"/>`).join('')}
      <!-- 큰 섬(육지): 푸른숲 + 동굴 산 + 화산 + 우주 착륙지 -->
      <path class="land" d="M28,58 C18,50 20,34 34,26 C36,14 46,6 58,8 C66,2 80,2 92,8 C104,12 104,26 98,34 C104,44 100,58 88,62 C76,66 60,66 48,63 C40,64 32,64 28,58 Z" fill="url(#gLand)"/>
      <!-- 흙길 / 철길 / 항로 -->
      ${curve('forest', 'cave', 'path', 3)}${curve('forest', 'volcano', 'path', 8)}${curve('forest', 'sea', 'rail', 5)}${curve('forest', 'space', 'flight', 14)}
      <!-- 기차 -->
      <g transform="translate(31,40)"><rect x="-3" y="-1.6" width="6" height="3.2" rx=".6" fill="#e8453c"/><rect x="-3" y="-2.6" width="2.4" height="1.2" fill="#e8453c"/><circle cx="-1.6" cy="1.9" r=".7" fill="#20232e"/><circle cx="1.6" cy="1.9" r=".7" fill="#20232e"/></g>`;
    // 지역 그림
    const draw = {
      forest: (r) => `<ellipse rx="${r.rx}" ry="${r.ry}" class="blob" fill="url(#gLand)"/>
        ${[[-11, 3], [-6, -4], [0, 5], [7, -3], [11, 3], [4, 0], [-3, 0]].map(([x, y]) => `<g transform="translate(${x},${y})"><rect x="-.5" y="1.5" width="1" height="2.2" fill="#8b5a2b"/><path d="M0,-4 L3,1.8 L-3,1.8 Z" fill="#2e9e4f"/><path d="M0,-2 L2.4,2.2 L-2.4,2.2 Z" fill="#3fb85a"/></g>`).join('')}
        <g transform="translate(-1,-2)"><rect x="-2.2" y="-1.4" width="4.4" height="3.2" fill="#fff4dc" stroke="#20232e" stroke-width=".25"/><path d="M-2.8,-1.4 L0,-3.6 L2.8,-1.4 Z" fill="#e8453c"/></g>`,
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
    };
    for (const r of MAP_REGIONS) {
      const done = !!conquered[r.id];
      svg += `<g class="region${done ? ' conquered' : ''}${this.mapSel === r.id ? ' sel' : ''}" data-zone="${r.id}" transform="translate(${r.x},${r.y})" filter="url(#shadow)">
        ${draw[r.id](r)}
        <g transform="translate(0,${r.ry + 1.5})"><rect x="-10" y="-2.6" width="20" height="5.2" rx="2.6" class="label-bg"/><text class="name" y="1.3" text-anchor="middle">${this.zoneName[r.id]}</text></g>
        ${done ? `<g transform="translate(${r.rx - 2},${-r.ry + 2})"><circle r="3" fill="#ffd93d" stroke="#20232e" stroke-width=".3"/><text class="star" y="1.3" text-anchor="middle">★</text></g>` : ''}
        ${here === r.id ? `<g class="pin" transform="translate(0,${-r.ry - 2})"><path d="M0,0 L-2.4,-4 A2.6,2.6 0 1 1 2.4,-4 Z" fill="#e8453c" stroke="#20232e" stroke-width=".3"/><circle cy="-4.6" r="1" fill="#fff"/></g>` : ''}
      </g>`;
    }
    svg += '</svg>';
    this.mapEl.innerHTML = svg;
    this.mapEl.querySelectorAll('.region').forEach((g) => { g.onclick = () => { this.mapSel = g.dataset.zone; this.renderMap(caughtById); }; });
    // 지역 상세 (◀ ▶ 로 넘겨 본다)
    const r = R[this.mapSel];
    document.getElementById('map-pos').textContent = `${MAP_REGIONS.findIndex((m) => m.id === r.id) + 1} / ${MAP_REGIONS.length} · ${this.zoneName[r.id]}`;
    const list = this.species.filter((sp) => sp.zone === r.id);
    const known = list.filter((sp) => (caughtById[sp.id] || 0) > 0).length;
    const done = !!conquered[r.id];
    let html = `<div class="map-title">${r.icon} ${this.zoneName[r.id]} <span class="badge ${done ? 'done' : ''}">${done ? '★ 정복!' : '아직 정복 전'}</span>${here === r.id ? '<span class="badge">지금 여기</span>' : ''}</div>
      <div class="map-desc">${r.desc}</div>
      <div class="map-how">가는 길: ${r.how}</div>
      <div class="map-count">이 지역의 포켓몬 ${list.length}종 중 ${known}종을 잡았어${done ? '' : ' · 보스를 잡으면 정복!'}</div>
      <div class="map-pokes">`;
    for (const sp of list.sort((a, b) => (b.boss ? 1 : 0) - (a.boss ? 1 : 0))) {
      const n = caughtById[sp.id] || 0;
      const t = this.thumbs(sp);
      html += `<div class="map-poke ${n ? 'caught' : 'unknown'}${sp.boss ? ' boss' : ''}" data-id="${sp.id}">
        ${sp.boss ? '<span class="bossmark">보스</span>' : ''}
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
            <div class="detail-sub">${from ? `${(caughtById[from.id] || 0) > 0 ? from.name : '???'}의 진화형` : `사는 곳: ${zone}${sp.boss ? ' (보스)' : ''}`}</div>
            <div class="detail-desc">아직 만나지 못한 포켓몬이야. ${sp.boss ? `${zone}의 보스를 찾아 잡아 보자!` : from ? '진화시키면 알 수 있어.' : `${zone}에서 찾아보자!`}</div>
          </div>
        </div>`;
      this.partyEl.appendChild(card);
      return;
    }
    const skills = (sp.skills || []).map((s) => `${s.name}<small>(공격 ${s.atk}↑ · ×${s.power})</small>`).join(' · ');
    card.innerHTML = `
      <div class="detail-top">
        ${t ? `<img src="${t.color}" alt="">` : ''}
        <div class="detail-info">
          <div class="detail-name">${sp.name} <span class="party-type">${sp.type}</span>${sp.boss ? ' <span class="party-badge boss">보스</span>' : ''}</div>
          <div class="detail-sub">${from ? `${from.name}의 진화형` : `사는 곳: ${zone}`} · 성격: ${sp.personality || '-'} · 잡은 수: <b>${n}마리</b></div>
          <div class="detail-stat"><span class="hp">❤ 기본 체력 ${sp.baseHp}</span> <span class="atk">⚔ 기본 공격 ${sp.baseAtk}</span></div>
          <div class="detail-skills">기술: ${skills}</div>
          ${ctx?.typeInfo ? (() => { const ti = ctx.typeInfo(sp.type); return `<div class="detail-type">💪 강함: ${ti.strong.length ? ti.strong.join('·') : '-'} &nbsp; 😖 약함: ${ti.weak.length ? ti.weak.join('·') : '-'}</div>`; })() : ''}
          <div class="detail-grade">등급 ${gradeStars(sp.grade || 1)} ${GRADES[sp.grade || 1]} · 추천 넘버볼: ${recommendedBall(sp.grade || 1).name}</div>
          ${evo ? `<div class="detail-evo">진화: 공격 ${evo.atk} · 체력 ${evo.hp} · ${evo.wins ? `대표로 ${evo.wins}번 이기기` : `지역 보스 ${evo.boss}명 이기기`} · <b>${this.zoneName[ctx?.evolveZone?.(sp.type) || 'forest'] || ''}에서만</b> → <b>${evoTo?.name || '?'}</b></div>` : ''}
        </div>
      </div>`;
    // 내 포켓몬 중 이 종: 한 마리씩 줄로 (키우기·대표·진화)
    const mine = party ? party.members.filter((m) => m.speciesId === sp.id) : [];
    if (mine.length) {
      const blocks = ctx.getBlocks();
      const list = document.createElement('div');
      list.className = 'detail-members';
      mine.forEach((m, i) => {
        const leader = party.isLeader(m);
        const canEvolve = party.canEvolve(m);
        const need = party.evolveNeed(m);
        const zoneBlocked = need && party.readyExceptZone(m) && !canEvolve;
        const next = party.nextSkill(m);
        const fainted = party.isFainted(m);
        const costHp = party.upgradeCost(m, 'hp'), costAtk = party.upgradeCost(m, 'atk');
        const row = document.createElement('div');
        row.className = 'member-row' + (leader ? ' leader' : '') + (fainted ? ' fainted' : '');
        row.innerHTML = `
          <div class="member-head">내 ${sp.name} ${leader ? '<span class="party-badge">대표</span>' : ''}${fainted ? '<span class="party-badge faint">😵 기절 · 오박사님께 치료</span>' : ''}
            <span class="hp">❤ ${m.hp}/${m.maxHp}</span> <span class="atk">⚔ ${m.atk}</span>${need?.wins ? ` <span class="wins">🏆 ${m.wins || 0}/${need.wins}승</span>` : ''}
            <small>기술: ${party.skills(m).map((s) => `${s.name}(${party.damage(m, s)})`).join(' · ')}${next ? ` · 🔒 ${next.name}은 공격 ${next.atk}이면` : ''}</small></div>
          <div class="member-actions">
            <span>블록으로 키우기:</span>
            <button data-act="hp1" ${blocks < costHp ? 'disabled' : ''}>❤ 체력 +1 <small>(블록 ${costHp})</small></button>
            <button data-act="atk1" ${blocks < costAtk ? 'disabled' : ''}>⚔ 공격 +1 <small>(블록 ${costAtk})</small></button>
            ${leader || fainted ? '' : '<button data-act="leader" class="btn-leader">대표로 하기</button>'}
            ${evo ? `<button data-act="evolve" class="btn-evolve" ${canEvolve ? '' : 'disabled'} title="공격 ${evo.atk} · 체력 ${evo.hp} · ${evo.wins ? `대표로 ${evo.wins}번 이기면` : `지역 보스 ${evo.boss}명 이기면`} 진화">✨ 진화!</button>` : ''}
            ${zoneBlocked ? `<span class="shop-for">준비 끝! ${this.zoneName[need.zone] || need.zone}에 가서 진화할 수 있어</span>` : ''}
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
  }

  render(caughtById) {
    const ctx = this.partyCtx;
    if (ctx) {
      const blocks = ctx.getBlocks();
      this.blocksEl.textContent = `${blocks}`;
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
        ? (from ? `${from.name}의 진화형 · ${n}마리` : `${zone}${sp.boss ? ' 보스' : ''} · ${n}마리`)
        : (from ? `${fromKnown ? from.name : '???'}의 진화형` : `${zone}${sp.boss ? ' 보스' : ''}`)) + ` · ${gradeStars(sp.grade || 1)}`;
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

  show(caughtById) { this.render(caughtById); if (this.tab === 'map') this.renderMap(caughtById); this.el.classList.remove('hidden'); this.open = true; }
  hide() { this.el.classList.add('hidden'); this.open = false; }
  toggle(caughtById) { if (this.open) this.hide(); else this.show(caughtById || this.lastCaught || {}); }
}
