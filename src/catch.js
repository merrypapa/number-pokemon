import * as THREE from 'three';
import { colorForCount } from './palette.js';
import { buildNumberblockMesh } from './numberblocks.js';
import { buildDraftMesh } from './creatures.js';

// 잡기 화면 안의 작은 3D 미리보기 (왼쪽: 몬스터, 오른쪽: 내가 쌓는 숫자블록)
class Preview {
  constructor(canvas) {
    this.canvas = canvas;
    this.ok = false;
    try {
      this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      this.ok = true;
    } catch (e) {
      console.warn('미리보기 WebGL 생성 실패, 미리보기 없이 진행', e);
      canvas.style.display = 'none';
      return;
    }
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
    if (!this.ok) return;
    if (this.model) {
      this.scene.remove(this.model);
      this.model.traverse((o) => { if (o.material?.map) o.material.map.dispose(); }); // 숫자 배지 텍스처 정리 (지오메트리는 공유하므로 유지)
    }
    this.model = mesh;
    if (!mesh) return;
    this.scene.add(mesh);
    this.baseScale = mesh.scale.x; // 보스처럼 기본 크기가 큰 모델도 유지
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
    if (!this.ok) return;
    const w = this.canvas.clientWidth || 200, h = this.canvas.clientHeight || 200;
    if (this.canvas.width !== Math.floor(w * this.renderer.getPixelRatio())) this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.t += dt;
    if (this.model) {
      this.model.rotation.y = Math.sin(this.t * 1.2) * 0.45;
      if (this.pop > 0) {
        this.pop = Math.max(0, this.pop - dt * 4);
        const s = (1 + Math.sin(this.pop * Math.PI) * 0.18) * (this.baseScale || 1);
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
    this.laterBtn = document.getElementById('btn-later');
    this.laterBtn.onclick = () => this.close('later');
    this.stackBtns = [document.getElementById('btn-plus'), document.getElementById('btn-minus'), document.getElementById('btn-show')];
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
    this.input.endFrame(); // 걷던 중 누른 키가 블록 올리기로 들어가지 않게
    this.monPreview.setModel(buildDraftMesh(creature.data));
    this.render();
    // 블록이 모자라면: 화면은 열리지만 쌓기는 잠그고, 나가서 주워오도록 안내
    this.short = blocksOwned < creature.data.favoriteNumber;
    for (const b of this.stackBtns) b.disabled = this.short;
    this.laterBtn.textContent = this.short ? '블록 주우러 가기' : '나중에';
    this.laterBtn.classList.toggle('primary', this.short);
    if (this.short) {
      this.fbEl.className = '';
      this.fbEl.textContent = `블록이 ${creature.data.favoriteNumber - blocksOwned}개 모자라요. 하얀 블록을 더 주워오자!`;
    }
    document.getElementById('catch-title').textContent = creature.data.boss ? '보스가 나타났다!' : '몬스터가 다가왔어요!';
    this.el.classList.remove('hidden');
  }

  close(result) {
    if (!this.active) return;
    this.active = false;
    this.el.classList.add('hidden');
    const used = result === 'caught' ? this.count : 0;
    this.monPreview.setModel(null);
    this.mePreview.setModel(null);
    this.onDone?.(result, used);
  }

  change(d) {
    if (!this.active || this.locked || this.short) return;
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
    if (!this.active || this.locked || this.short) return;
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
