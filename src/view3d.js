import * as THREE from 'three';
import { buildDraftMesh } from './creatures.js';

// 작은 360° 3D 화면: 포켓몬 한 마리를 캔버스에 그려 저절로 돌리고, 끌면 직접 돌릴 수 있다 (도감 카드·대결 교체 팝업에서 쓴다)
export class View3D {
  constructor() { this.renderer = null; this.mesh = null; this.raf = null; }
  ensure(canvas) {
    try {
      if (!this.renderer) {
        this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
        this.scene = new THREE.Scene();
        this.scene.add(new THREE.HemisphereLight(0xffffff, 0x99aa88, 1.6));
        const sun = new THREE.DirectionalLight(0xffffff, 1.2); sun.position.set(2, 4, 3); this.scene.add(sun);
        this.camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
      } else if (this.renderer.domElement !== canvas) { // 캔버스가 새로 만들어졌다
        this.renderer.dispose(); this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
      }
      this.renderer.setSize(canvas.width, canvas.height, false);
      return true;
    } catch (_) { return false; }
  }
  /** sp: 종 데이터. isOpen(): false 를 돌려주면 그리기를 멈춘다 */
  show(canvas, sp, isOpen = () => true) {
    this.stop();
    if (!canvas || !this.ensure(canvas)) return;
    const mesh = buildDraftMesh({ ...sp, scale: 1 });
    this.scene.add(mesh);
    this.mesh = mesh;
    this.spin = 0.8; this.angle = -0.4; this.drag = null;
    const fit = () => {
      const box = new THREE.Box3().setFromObject(mesh);
      const size = box.getSize(new THREE.Vector3()), center = box.getCenter(new THREE.Vector3());
      const r = Math.max(size.x, size.y, size.z, 0.8);
      const dist = r / Math.tan(THREE.MathUtils.degToRad(15)) * 0.6 + r * 0.6;
      this.camera.position.set(0, center.y + r * 0.25, dist);
      this.camera.lookAt(0, center.y, 0);
    };
    fit();
    canvas.onpointerdown = (e) => { this.drag = { x: e.clientX, angle: this.angle }; canvas.setPointerCapture(e.pointerId); };
    canvas.onpointermove = (e) => { if (this.drag) this.angle = this.drag.angle + (e.clientX - this.drag.x) * 0.02; };
    canvas.onpointerup = canvas.onpointercancel = () => { this.drag = null; };
    let last = performance.now(), frames = 0;
    const loop = (now) => {
      if (this.mesh !== mesh || !isOpen()) return;
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      if (!this.drag) this.angle += this.spin * dt;
      mesh.rotation.y = this.angle;
      if (++frames % 30 === 0) fit(); // 모델이 나중에 도착해 크기가 바뀌어도 맞춘다
      this.renderer.render(this.scene, this.camera);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }
  stop() {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = null;
    if (this.mesh && this.scene) this.scene.remove(this.mesh);
    this.mesh = null;
  }
}
