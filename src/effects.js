import * as THREE from 'three';
import { RAINBOW } from './palette.js';

// ---------- 2D 색종이 (화면 전체 캔버스 오버레이) ----------
export class Confetti {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.parts = [];
  }
  burst(n = 120) {
    const w = window.innerWidth, h = window.innerHeight;
    for (let i = 0; i < n; i++) {
      this.parts.push({
        x: w / 2 + (Math.random() - 0.5) * w * 0.3, y: h * 0.35,
        vx: (Math.random() - 0.5) * 900, vy: -Math.random() * 700 - 200,
        w: 8 + Math.random() * 8, h: 5 + Math.random() * 6,
        rot: Math.random() * 6, vr: (Math.random() - 0.5) * 12,
        color: RAINBOW[i % RAINBOW.length], life: 2.2 + Math.random() * 0.8,
      });
    }
  }
  update(dt) {
    if (this.parts.length === 0) { if (this.canvas.width) { this.canvas.width = 0; } return; }
    const w = window.innerWidth, h = window.innerHeight;
    if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w; this.canvas.height = h; }
    const ctx = this.ctx;
    ctx.clearRect(0, 0, w, h);
    for (const p of this.parts) {
      p.life -= dt;
      p.vy += 1100 * dt; p.vx *= 0.99;
      p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
      ctx.save();
      ctx.translate(p.x, p.y); ctx.rotate(p.rot);
      ctx.globalAlpha = Math.max(0, Math.min(1, p.life));
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    }
    this.parts = this.parts.filter((p) => p.life > 0 && p.y < h + 40);
  }
}

// ---------- 3D 별/조각 파티클 ----------
function makeStarTexture() {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 64;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? 30 : 13;
    const a = (i * Math.PI) / 5 - Math.PI / 2;
    ctx.lineTo(32 + Math.cos(a) * r, 32 + Math.sin(a) * r);
  }
  ctx.closePath(); ctx.fill();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
let starTex = null;

export class Particles {
  constructor() { this.items = []; }
  /** 별이 사방으로 튀어나온다 */
  stars(scene, pos, n = 16, color = 0xffd93d, size = 0.6) {
    starTex = starTex || makeStarTexture();
    for (let i = 0; i < n; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: starTex, color, transparent: true, depthTest: false }));
      s.position.copy(pos);
      s.scale.setScalar(size * (0.7 + Math.random() * 0.6));
      const a = Math.random() * Math.PI * 2, u = Math.random() * Math.PI;
      const v = new THREE.Vector3(Math.cos(a) * Math.sin(u), Math.cos(u) * 0.8 + 0.6, Math.sin(a) * Math.sin(u)).multiplyScalar(3 + Math.random() * 3);
      scene.add(s);
      this.items.push({ obj: s, v, life: 1.2, scene, gravity: 6 });
    }
  }
  /** 블록 조각이 튄다 */
  cubes(scene, pos, n = 10, color = 0xffffff) {
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, 0.18), new THREE.MeshStandardMaterial({ color, transparent: true }));
      m.position.copy(pos);
      const v = new THREE.Vector3((Math.random() - 0.5) * 6, 2 + Math.random() * 4, (Math.random() - 0.5) * 6);
      scene.add(m);
      this.items.push({ obj: m, v, life: 1.0, scene, gravity: 12, spin: true });
    }
  }
  update(dt) {
    for (const it of this.items) {
      it.life -= dt;
      it.v.y -= it.gravity * dt;
      it.obj.position.addScaledVector(it.v, dt);
      if (it.spin) it.obj.rotation.x += dt * 8, it.obj.rotation.y += dt * 6;
      const mat = it.obj.material;
      mat.opacity = Math.max(0, Math.min(1, it.life * 1.5));
      if (it.life <= 0) it.scene.remove(it.obj);
    }
    this.items = this.items.filter((it) => it.life > 0);
  }
}

// ---------- 효과음 (WebAudio 합성, 파일 없음) ----------
export class Sound {
  constructor() { this.ctx = null; }
  ensure() {
    if (!this.ctx) { try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (_) { this.ctx = null; } }
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }
  tone(freq, dur = 0.12, type = 'square', vol = 0.12, when = 0) {
    const ctx = this.ensure();
    if (!ctx) return;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(0, ctx.currentTime + when);
    g.gain.linearRampToValueAtTime(vol, ctx.currentTime + when + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + when + dur);
    o.connect(g).connect(ctx.destination);
    o.start(ctx.currentTime + when); o.stop(ctx.currentTime + when + dur + 0.05);
  }
  throw_() { this.tone(520, 0.15, 'triangle', 0.1); this.tone(780, 0.12, 'triangle', 0.08, 0.08); }
  hit() { this.tone(220, 0.12, 'sawtooth', 0.12); this.tone(160, 0.18, 'square', 0.08, 0.05); }
  bounce() { this.tone(330, 0.08, 'square', 0.08); this.tone(260, 0.1, 'square', 0.06, 0.09); }
  click() { this.tone(900, 0.05, 'square', 0.08); }
  pickup() { this.tone(880, 0.08, 'square', 0.08); this.tone(1320, 0.1, 'square', 0.08, 0.07); }
  fanfare() {
    const notes = [523, 659, 784, 1047, 784, 1047, 1319];
    notes.forEach((f, i) => this.tone(f, i === notes.length - 1 ? 0.5 : 0.16, 'square', 0.1, i * 0.12));
    [262, 330, 392].forEach((f, i) => this.tone(f, 0.9, 'triangle', 0.06, 0.5 + i * 0.02));
  }
  portal() { for (let i = 0; i < 6; i++) this.tone(400 + i * 120, 0.12, 'sine', 0.08, i * 0.06); }
}
