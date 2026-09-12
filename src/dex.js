import * as THREE from 'three';
import { buildDraftMesh } from './creatures.js';
import { colorForCount } from './palette.js';

// 몬스터 도감 + 내 포켓몬.
//  - 위: "내 포켓몬" 칩(잡은 포켓몬 한 줄) + 선택한 포켓몬 한 마리의 상세 카드 (스탯·기술·진화, 내 포켓몬이면 키우기/대표/진화 버튼).
//  - 아래: 모든 종을 액자로. 액자를 누르면 그 종이 상세에 나온다. 잡은 종은 컬러 썸네일 + 이름, 아니면 검은 실루엣 + 물음표.
// 썸네일은 작은 오프스크린 렌더러로 한 번만 만들어 캐시한다.
const DEFAULT_ZONE_NAME = { forest: '푸른숲', cave: '지하동굴', volcano: '불의산', sea: '물의길', space: '꿈의우주', evolution: '진화' };

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
    this.progressEl = document.getElementById('dex-progress');
    this.countEl = document.getElementById('dex-count');
    this.open = false;
    this.cache = new Map(); // id -> { color, silhouette }
    this.partyCtx = null;
    this.selectedId = null;
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
      chip.innerHTML = `${t ? `<img src="${t.color}" alt="">` : ''}<span>${sp.name}</span>${party.isLeader(m) ? '<i>★</i>' : ''}`;
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
          ${evo ? `<div class="detail-evo">진화: 공격 ${evo.atk} · 체력 ${evo.hp} · ${sp.name} ${evo.count || 1}마리 잡기 → <b>${evoTo?.name || '?'}</b></div>` : ''}
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
        const next = party.nextSkill(m);
        const row = document.createElement('div');
        row.className = 'member-row' + (leader ? ' leader' : '');
        row.innerHTML = `
          <div class="member-head">내 ${sp.name}${mine.length > 1 ? ` #${i + 1}` : ''} ${leader ? '<span class="party-badge">대표</span>' : ''}
            <span class="hp">❤ ${m.hp}/${m.maxHp}</span> <span class="atk">⚔ ${m.atk}</span>
            <small>기술: ${party.skills(m).map((s) => `${s.name}(${party.damage(m, s)})`).join(' · ')}${next ? ` · 🔒 ${next.name}은 공격 ${next.atk}이면` : ''}</small></div>
          <div class="member-actions">
            <span>블록으로 키우기:</span>
            <button data-act="hp1" ${blocks < 1 ? 'disabled' : ''}>❤ 체력 +1</button>
            <button data-act="atk1" ${blocks < 1 ? 'disabled' : ''}>⚔ 공격 +1</button>
            ${leader ? '' : '<button data-act="leader" class="btn-leader">대표로 하기</button>'}
            ${evo ? `<button data-act="evolve" class="btn-evolve" ${canEvolve ? '' : 'disabled'} title="공격 ${evo.atk} · 체력 ${evo.hp} · ${evo.count || 1}마리 잡으면 진화">✨ 진화!</button>` : ''}
          </div>`;
        row.querySelectorAll('button[data-act]').forEach((b) => {
          b.onclick = () => {
            const act = b.dataset.act;
            if (act === 'leader') ctx.onLeader(m);
            else if (act === 'evolve') { ctx.onEvolve(m); this.selectedId = m.speciesId; }
            else ctx.onUpgrade(m, act.startsWith('hp') ? 'hp' : 'atk', 1);
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
      this.blocksEl.textContent = `블록 ${blocks}개`;
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
      const sub = known
        ? (from ? `${from.name}의 진화형 · ${n}마리` : `${zone}${sp.boss ? ' 보스' : ''} · ${n}마리`)
        : (from ? `${fromKnown ? from.name : '???'}의 진화형` : `${zone}${sp.boss ? ' 보스' : ''}`);
      item.innerHTML = `
        ${t ? `<img src="${known ? t.color : t.silhouette}" alt="">` : ''}
        ${known ? '' : '<div class="dex-q">?</div>'}
        <div class="dex-name">${known ? sp.name : '???'}</div>
        <div class="dex-sub">${sub}</div>`;
      item.onclick = () => this.select(sp.id);
      this.grid.appendChild(item);
    }
    this.countEl.textContent = `도감 ${caughtSpecies} / ${this.species.length} 종`;
    const pr = ctx?.getProgress?.();
    this.progressEl.innerHTML = pr ? `
      <span><i class="hud-icon mon"></i>친구 ${pr.caught}/${pr.total}</span>
      <span><i class="hud-icon nb"></i>구출 ${pr.rescued}</span>
      <span><i class="hud-icon boss"></i>정복 ${pr.conquered}/${pr.zones}</span>` : '';
  }

  show(caughtById) { this.render(caughtById); this.el.classList.remove('hidden'); this.open = true; }
  hide() { this.el.classList.add('hidden'); this.open = false; }
  toggle(caughtById) { if (this.open) this.hide(); else this.show(caughtById || this.lastCaught || {}); }
}
