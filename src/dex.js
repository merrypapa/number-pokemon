import * as THREE from 'three';
import { buildDraftMesh } from './creatures.js';
import { colorForCount } from './palette.js';

// 몬스터 도감 + 내 포켓몬.
//  - 위: 내 포켓몬(파티) 카드. 대표 고르기, 블록으로 공격력/체력 올리기, 진화.
//  - 아래: 모든 종. 잡은(또는 진화한) 종은 컬러 썸네일 + 이름, 아니면 검은 실루엣 + 물음표.
// 썸네일은 작은 오프스크린 렌더러로 한 번만 만들어 캐시한다.
const ZONE_NAME = { meadow: '숫자 초원', holes: '숫자 초원', holes_gate: '초원 보스 아레나', cave: '괴물 동굴', cave_boss: '괴물 동굴', evolution: '진화' };

export class Dex {
  constructor(species) {
    this.species = species;
    this.el = document.getElementById('dex');
    this.grid = document.getElementById('dex-grid');
    this.partyEl = document.getElementById('dex-party');
    this.blocksEl = document.getElementById('dex-blocks');
    this.countEl = document.getElementById('dex-count');
    this.open = false;
    this.cache = new Map(); // id -> { color, silhouette }
    this.partyCtx = null;
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

  renderParty() {
    const ctx = this.partyCtx;
    if (!ctx) { this.partyEl.classList.add('hidden'); return; }
    const { party } = ctx;
    const blocks = ctx.getBlocks();
    this.blocksEl.textContent = `블록 ${blocks}개`;
    this.blocksEl.style.background = blocks > 0 ? colorForCount(blocks) : '#bbb';
    this.partyEl.innerHTML = '';
    this.partyEl.classList.remove('hidden');
    if (party.members.length === 0) {
      this.partyEl.innerHTML = '<div class="party-empty">아직 포켓몬이 없어요.</div>';
      return;
    }
    for (const m of party.members) {
      const sp = party.species(m);
      const t = this.thumbs(sp);
      const leader = party.isLeader(m);
      const skills = party.skills(m);
      const next = party.nextSkill(m);
      const evo = sp.evolution;
      const canEvolve = party.canEvolve(m);
      const card = document.createElement('div');
      card.className = 'party-card' + (leader ? ' leader' : '');
      card.style.borderColor = party.color(m);
      card.innerHTML = `
        <div class="party-top">
          ${t ? `<img src="${t.color}" alt="">` : ''}
          <div class="party-info">
            <div class="party-name">${sp.name} ${leader ? '<span class="party-badge">대표</span>' : ''}</div>
            <div class="party-stat"><span class="hp">❤ 체력 ${m.hp}/${m.maxHp}</span> <span class="atk">⚔ 공격 ${m.atk}</span></div>
            <div class="party-skills">기술: ${skills.map((s) => `${s.name}(${party.damage(m, s)})`).join(' · ')}${next ? `<br><span class="dim">🔒 ${next.name}: 공격 ${next.atk}이면 열려요</span>` : ''}</div>
            ${evo ? `<div class="party-evo ${canEvolve ? 'ready' : 'dim'}">${canEvolve ? `✨ ${ctx.party.speciesById[evo.to]?.name || '?'}(으)로 진화할 수 있어!` : `진화: 공격 ${evo.atk} · 체력 ${evo.hp}이면 ${ctx.party.speciesById[evo.to]?.name || '?'}`}</div>` : ''}
          </div>
        </div>
        <div class="party-actions">
          <div class="party-up">
            <span>블록으로 키우기:</span>
            <button data-act="hp1" ${blocks < 1 ? 'disabled' : ''}>❤ 체력 +1</button>
            <button data-act="hp5" ${blocks < 5 ? 'disabled' : ''}>❤ +5</button>
            <button data-act="atk1" ${blocks < 1 ? 'disabled' : ''}>⚔ 공격 +1</button>
            <button data-act="atk5" ${blocks < 5 ? 'disabled' : ''}>⚔ +5</button>
          </div>
          <div class="party-side">
            ${leader ? '' : '<button data-act="leader" class="btn-leader">대표로 하기</button>'}
            ${canEvolve ? '<button data-act="evolve" class="btn-evolve">✨ 진화!</button>' : ''}
          </div>
        </div>`;
      card.querySelectorAll('button[data-act]').forEach((b) => {
        b.onclick = () => {
          const act = b.dataset.act;
          if (act === 'leader') ctx.onLeader(m);
          else if (act === 'evolve') ctx.onEvolve(m);
          else ctx.onUpgrade(m, act.startsWith('hp') ? 'hp' : 'atk', Number(act.slice(-1)));
          this.render(this.lastCaught || {});
        };
      });
      this.partyEl.appendChild(card);
    }
  }

  render(caughtById) {
    this.renderParty();
    this.grid.innerHTML = '';
    let caughtSpecies = 0;
    for (const sp of this.species) {
      const n = caughtById[sp.id] || 0;
      const known = n > 0;
      if (known) caughtSpecies++;
      const t = this.thumbs(sp);
      const item = document.createElement('div');
      item.className = 'dex-item ' + (known ? 'caught' : 'unknown');
      const zone = ZONE_NAME[sp.zone] || '???';
      const from = sp.evolvedFrom ? this.species.find((s) => s.id === sp.evolvedFrom) : null;
      const fromKnown = !!(from && (caughtById[from.id] || 0) > 0);
      const sub = known
        ? (from ? `${from.name}의 진화형 · ${n}마리` : `${zone} · ${n}마리`)
        : (from ? `${fromKnown ? from.name : '???'}의 진화형` : zone);
      item.innerHTML = `
        ${t ? `<img src="${known ? t.color : t.silhouette}" alt="">` : ''}
        ${known ? '' : '<div class="dex-q">?</div>'}
        <div class="dex-name">${known ? sp.name : '???'}</div>
        <div class="dex-sub">${sub}</div>
        <div class="dex-num" style="background:${known ? colorForCount(Number(sp.favoriteNumber) || 1) : '#bbb'}">${known ? `❤ ${sp.baseHp} · ⚔ ${sp.baseAtk}` : '❤ ? · ⚔ ?'}</div>`;
      this.grid.appendChild(item);
    }
    this.countEl.textContent = `${caughtSpecies} / ${this.species.length} 종`;
  }

  show(caughtById) { this.render(caughtById); this.el.classList.remove('hidden'); this.open = true; }
  hide() { this.el.classList.add('hidden'); this.open = false; }
  toggle(caughtById) { if (this.open) this.hide(); else this.show(caughtById || this.lastCaught || {}); }
}
