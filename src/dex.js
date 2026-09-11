import * as THREE from 'three';
import { buildDraftMesh } from './creatures.js';
import { colorForCount } from './palette.js';

// 몬스터 도감. 모든 종을 한 번에 보여준다. 잡은 종은 컬러 썸네일 + 이름, 못 잡은 종은 검은 실루엣 + 물음표.
// 썸네일은 작은 오프스크린 렌더러로 한 번만 만들어 캐시한다.
const ZONE_NAME = { meadow: '숫자 초원', holes: '숫자 초원', holes_gate: '초원 보스 아레나', cave: '괴물 동굴', cave_boss: '괴물 동굴' };

export class Dex {
  constructor(species) {
    this.species = species;
    this.el = document.getElementById('dex');
    this.grid = document.getElementById('dex-grid');
    this.countEl = document.getElementById('dex-count');
    this.open = false;
    this.cache = new Map(); // id -> { color, silhouette }
    document.getElementById('btn-dex').onclick = () => this.toggle();
    document.getElementById('btn-dex-close').onclick = () => this.hide();
    this.el.addEventListener('click', (e) => { if (e.target === this.el) this.hide(); });
  }

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

  render(caughtById) {
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
      const num = sp.favoriteNumber ?? '?';
      item.innerHTML = `
        ${t ? `<img src="${known ? t.color : t.silhouette}" alt="">` : ''}
        ${known ? '' : '<div class="dex-q">?</div>'}
        <div class="dex-name">${known ? sp.name : '???'}</div>
        <div class="dex-sub">${known ? `${zone} · ${n}마리` : zone}</div>
        <div class="dex-num" style="background:${known ? colorForCount(Number(num) || 1) : '#bbb'}">${known ? `좋아하는 숫자 ${num}` : '좋아하는 숫자 ?'}</div>`;
      this.grid.appendChild(item);
    }
    this.countEl.textContent = `${caughtSpecies} / ${this.species.length} 종`;
  }

  show(caughtById) { this.render(caughtById); this.el.classList.remove('hidden'); this.open = true; }
  hide() { this.el.classList.add('hidden'); this.open = false; }
  toggle(caughtById) { if (this.open) this.hide(); else this.show(caughtById || this.lastCaught || {}); }
}
