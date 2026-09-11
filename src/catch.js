import * as THREE from 'three';
import { colorForCount } from './palette.js';
import { buildNumberblockMesh } from './numberblocks.js';
import { buildDraftMesh } from './creatures.js';

// 잡기 화면 안의 작은 3D 미리보기 (왼쪽: 몬스터, 오른쪽: 내가 쌓는 숫자블록)
class Preview {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.scene = new THREE.Scene();
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x99aa88, 1.5));
    const sun = new THREE.DirectionalLight(0xffffff, 1.3);
    sun.position.set(2, 4, 3);
    this.scene.add(sun);
    this.camera = new THREE.PerspectiveCamera(32, 1, 0.1, 50);
    this.model = null;
    this.t = 0;
    this.pop = 0;
  }

  setModel(mesh) {
    if (this.model) this.scene.remove(this.model);
    this.model = mesh;
    if (!mesh) return;
    this.scene.add(mesh);
    this.pop = 1;
    const box = new THREE.Box3().setFromObject(mesh);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const r = Math.max(size.x, size.y * 0.9, size.z, 0.8);
    const dist = r / Math.tan(THREE.MathUtils.degToRad(32) / 2) * 0.62 + r * 0.6;
    this.camera.position.set(0, center.y + r * 0.25, dist);
    this.camera.lookAt(0, center.y, 0);
  }

  render(dt) {
    const w = this.canvas.clientWidth || 200, h = this.canvas.clientHeight || 200;
    if (this.canvas.width !== Math.floor(w * this.renderer.getPixelRatio())) this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.t += dt;
    if (this.model) {
      this.model.rotation.y = Math.sin(this.t * 1.2) * 0.45;
      if (this.pop > 0) {
        this.pop = Math.max(0, this.pop - dt * 4);
        const s = 1 + Math.sin(this.pop * Math.PI) * 0.18;
        this.model.scale.setScalar(s);
      }
    }
    this.renderer.render(this.scene, this.camera);
  }
}

// 잡기 모드 UI. 블록을 쌓아 몬스터가 좋아하는 숫자를 맞춘다. 벌칙 없음, 3번 틀리면 원이가 같이 세어준다.
// 성공하면 그 개수만큼 블록을 몬스터에게 준다(블록이 줄어든다).
export class CatchMode {
  constructor(input, say) {
    this.input = input;
    this.say = say;
    this.el = document.getElementById('catch');
    this.nameEl = document.getElementById('catch-monster-name');
    this.hintEl = document.getElementById('catch-hint');
    this.countEl = document.getElementById('catch-count');
    this.ownedEl = document.getElementById('catch-owned');
    this.fbEl = document.getElementById('catch-feedback');
    this.monPreview = new Preview(document.getElementById('catch-mon'));
    this.mePreview = new Preview(document.getElementById('catch-me'));
    this.active = false;
    this.count = 0;
    document.getElementById('btn-plus').onclick = () => this.change(1);
    document.getElementById('btn-minus').onclick = () => this.change(-1);
    document.getElementById('btn-show').onclick = () => this.show();
  }

  open(creature, blocksOwned, onDone) {
    this.active = true;
    this.creature = creature;
    this.max = blocksOwned;
    this.onDone = onDone;
    this.count = 0;
    this.misses = 0;
    this.locked = false;
    this.nameEl.textContent = creature.data.name;
    this.hintEl.textContent = creature.data.favoriteNumber;
    this.fbEl.textContent = '';
    this.fbEl.className = '';
    this.monPreview.setModel(buildDraftMesh(creature.data));
    this.render();
    this.el.classList.remove('hidden');
    if (blocksOwned < creature.data.favoriteNumber) {
      this.fbEl.textContent = `블록이 ${creature.data.favoriteNumber - blocksOwned}개 모자라요. 더 주워오자!`;
    }
  }

  close(result) {
    this.active = false;
    this.el.classList.add('hidden');
    const used = result === 'caught' ? this.count : 0;
    this.monPreview.setModel(null);
    this.mePreview.setModel(null);
    this.onDone?.(result, used);
  }

  change(d) {
    if (!this.active || this.locked) return;
    const next = this.count + d;
    if (next < 0) return;
    if (next > this.max) {
      this.fbEl.className = '';
      this.fbEl.textContent = '가진 블록을 다 썼어요. 초원에서 더 주워오자!';
      return;
    }
    this.count = next;
    this.fbEl.textContent = '';
    this.render();
  }

  // 오른쪽 미리보기: 블록을 n개 쌓으면 숫자블록 n이 된다 (1 빨강, 2 주황, 3 노랑…)
  render() {
    this.countEl.textContent = this.count;
    this.countEl.style.color = this.count > 0 ? colorForCount(this.count) : '#333';
    this.ownedEl.textContent = `가진 블록 ${this.max}개`;
    this.mePreview.setModel(this.count > 0 ? buildNumberblockMesh({ number: this.count }) : null);
  }

  show() {
    if (!this.active || this.locked) return;
    const want = this.creature.data.favoriteNumber;
    if (this.count === want) {
      this.locked = true;
      this.fbEl.className = 'good';
      this.fbEl.textContent = `딱 맞아요! ${this.creature.data.name}이(가) 블록 ${want}개를 받고 친구가 되었어요!`;
      setTimeout(() => this.close('caught'), 1500);
      return;
    }
    this.misses++;
    this.fbEl.className = '';
    this.fbEl.textContent = this.count > want ? '음… 너무 많아요!' : '음… 조금 모자라요!';
    if (this.misses >= 3 && this.max >= want) this.countTogether(want);
  }

  // 원이가 하나, 둘, 셋… 같이 세어준다.
  countTogether(want) {
    this.locked = true;
    this.count = 0;
    this.render();
    const words = ['하나', '둘', '셋', '넷', '다섯', '여섯', '일곱', '여덟', '아홉', '열'];
    let i = 0;
    const tick = () => {
      if (!this.active) return;
      i++;
      this.count = i;
      this.render();
      this.fbEl.className = 'good';
      this.fbEl.textContent = `원이: ${words.slice(0, i).join(', ')}!`;
      if (i < want) setTimeout(tick, 600);
      else {
        this.fbEl.textContent += ' 이제 보여주자!';
        this.locked = false;
      }
    };
    setTimeout(tick, 500);
  }

  update(dt) {
    if (!this.active) return;
    if (this.input.wasPressed('up')) this.change(1);
    if (this.input.wasPressed('down')) this.change(-1);
    if (this.input.wasPressed('action') || this.input.wasPressed('jump')) this.show();
    if (this.input.wasPressed('cancel')) this.close('later');
    this.monPreview.render(dt);
    this.mePreview.render(dt);
  }
}
