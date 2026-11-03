// 지역마다 다른 환경음 (새소리·개울·바람·물방울·용암·파도·윙윙·별빛 …). 배경 음악(bgm.js)처럼 소리 파일 없이 WebAudio 로 만든다.
// 음악 아래에 아주 작게 깔린다. 🎵 음악 버튼을 끄면 함께 꺼진다. 대결 중에는 작아진다(duck).
//  - 계속 나는 소리(층): 바람·파도·윙윙·웅웅 — 잡음/발진기를 필터로 다듬어 천천히 숨 쉬듯 커졌다 작아진다
//  - 가끔 나는 소리(사건): 새 지저귐·물방울·보글·풍경 소리·지직 — 정해진 간격 사이에서 무작위로
// 숲의 개울 소리는 개울에 가까울수록 커진다 (setWater, main 이 거리를 넣어 준다).

const SCAPES = {
  forest: { wind: 0.018, water: 0.05, birds: { gap: [1.2, 3.5], pitch: 1 }, woodpecker: true },
  town: { wind: 0.01, birds: { gap: [3, 7], pitch: 1.05 }, chimes: { gap: [4, 9] } },
  gym: { wind: 0.012, birds: { gap: [3, 6], pitch: 1.1 }, pond: 0.012 },
  hive: { buzz: 0.03 },
  cave: { drone: 0.028, drips: { gap: [0.8, 2.6] }, water: 0.045 }, // water: 지하 강 (가까울수록)
  thunder: { drone: 0.02, hum: 0.012, crackle: { gap: [0.4, 1.6] }, rumble: { gap: [9, 18] } },
  tower: { howl: 0.03, drips: { gap: [1.5, 4] } },
  volcano: { lava: 0.05, bubbles: { gap: [0.6, 1.8], low: true }, rumble: { gap: [8, 15] } },
  sea: { waves: 0.06, gulls: { gap: [4, 9] } },
  deepsea: { drone: 0.03, bubbles: { gap: [0.5, 1.6] } },
  space: { pad: 0.02, twinkle: { gap: [0.8, 2.4] } },
  planet: { pad: 0.018, twinkle: { gap: [1.2, 3] }, howl: 0.012 },
  arena: { crowd: 0.035, cheer: { gap: [7, 14] } },
  lab: { hum: 0.006, beep: { gap: [3, 7] } },
  school: { clock: true, birds: { gap: [6, 12], pitch: 1.1, far: true } },
  home: { clock: true },
};
const rand = (a, b) => a + Math.random() * (b - a);

export class Ambient {
  constructor(sound) { this.sound = sound; this.name = null; this.layers = []; this.timers = []; this.master = null; this.duckV = 1; this.waterG = null; this.token = 0; }
  scapeFor(zone) { if (!zone) return null; if (zone.startsWith('p_')) return 'planet'; return SCAPES[zone] ? zone : null; }
  /** 이 지역의 소리로 바꾼다 (같으면 그대로). null 이면 멈춘다 */
  play(zone) {
    const key = this.scapeFor(zone);
    if (key === this.name && (this.layers.length || this.timers.length)) return;
    this.stop();
    this.name = key;
    if (!key) return;
    const ctx = this.sound.ensure();
    if (!ctx || ctx.state !== 'running') { this.name = null; return; } // 화면을 한 번 누른 뒤 다시 부른다
    if (!this.master) { this.master = ctx.createGain(); this.master.gain.value = 0; this.master.connect(ctx.destination); }
    this.master.gain.cancelScheduledValues(ctx.currentTime);
    this.master.gain.setTargetAtTime(this.duckV, ctx.currentTime, 0.6); // 천천히 켜진다
    const S = SCAPES[key], tok = ++this.token;
    if (S.wind) this.noiseLayer({ type: 'bandpass', freq: 500, q: 0.6, vol: S.wind, lfo: 0.07, sweep: 300 });
    if (S.howl) this.noiseLayer({ type: 'bandpass', freq: 700, q: 4, vol: S.howl, lfo: 0.11, sweep: 500 });
    if (S.drone) this.noiseLayer({ type: 'lowpass', freq: 220, q: 0.7, vol: S.drone, lfo: 0.05, sweep: 60 });
    if (S.lava) this.noiseLayer({ type: 'lowpass', freq: 140, q: 1.2, vol: S.lava, lfo: 0.2, sweep: 50 });
    if (S.waves) this.noiseLayer({ type: 'lowpass', freq: 650, q: 0.5, vol: S.waves, lfo: 0.13, sweep: 400, swell: true });
    if (S.crowd) this.noiseLayer({ type: 'bandpass', freq: 900, q: 0.8, vol: S.crowd, lfo: 0.3, sweep: 200 });
    if (S.pond) this.noiseLayer({ type: 'bandpass', freq: 1500, q: 1.2, vol: S.pond, lfo: 2.3, sweep: 600 });
    if (S.water) { this.waterG = this.noiseLayer({ type: 'bandpass', freq: 1300, q: 0.9, vol: 1, lfo: 3.1, sweep: 700 }); this.waterG.gain.value = 0; this.waterMax = S.water; }
    if (S.buzz) this.buzzLayer(S.buzz);
    if (S.pad) this.padLayer(S.pad);
    if (S.hum) this.humLayer(S.hum);
    const ev = (gap, fn) => { const loop = () => { if (tok !== this.token) return; try { fn(); } catch (_) {} this.timers.push(setTimeout(loop, rand(gap[0], gap[1]) * 1000)); }; this.timers.push(setTimeout(loop, rand(0.3, gap[1]) * 1000)); };
    if (S.birds) ev(S.birds.gap, () => this.bird(S.birds.pitch, S.birds.far));
    if (S.woodpecker) ev([12, 25], () => this.woodpecker());
    if (S.chimes) ev(S.chimes.gap, () => this.chime());
    if (S.drips) ev(S.drips.gap, () => this.drip());
    if (S.bubbles) ev(S.bubbles.gap, () => this.bubble(S.bubbles.low));
    if (S.crackle) ev(S.crackle.gap, () => this.crackle());
    if (S.rumble) ev(S.rumble.gap, () => this.rumble());
    if (S.gulls) ev(S.gulls.gap, () => this.gull());
    if (S.twinkle) ev(S.twinkle.gap, () => this.twinkle());
    if (S.cheer) ev(S.cheer.gap, () => this.cheer());
    if (S.beep) ev(S.beep.gap, () => this.beep());
    if (S.clock) ev([1, 1], () => this.tick());
  }
  stop() {
    this.token++;
    for (const t of this.timers) clearTimeout(t); this.timers = [];
    const ctx = this.sound.ctx;
    for (const l of this.layers) { try { l.stop(ctx ? ctx.currentTime + 0.5 : 0); } catch (_) {} }
    this.layers = []; this.waterG = null; this.name = null;
  }
  /** 대결 중엔 작게 (0~1) */
  duck(on) { this.duckV = on ? 0.35 : 1; const ctx = this.sound.ctx; if (this.master && ctx) this.master.gain.setTargetAtTime(this.duckV, ctx.currentTime, 0.4); }
  /** 개울 가까움 (0~1): 숲의 물소리 크기 */
  setWater(v) { const ctx = this.sound.ctx; if (this.waterG && ctx) this.waterG.gain.setTargetAtTime(this.waterMax * Math.max(0, Math.min(1, v)), ctx.currentTime, 0.5); }
  setHidden(h, zone) { if (h) this.stop(); else this.play(zone); }

  // ----- 재료 -----
  noise() {
    const ctx = this.sound.ctx;
    if (!this.nbuf) { const n = ctx.createBuffer(1, ctx.sampleRate * 3, ctx.sampleRate), d = n.getChannelData(0); let b = 0; for (let i = 0; i < d.length; i++) { b = 0.97 * b + 0.03 * (Math.random() * 2 - 1); d[i] = b * 6 + (Math.random() * 2 - 1) * 0.15; } this.nbuf = n; } // 부드러운(붉은) 잡음
    const s = ctx.createBufferSource(); s.buffer = this.nbuf; s.loop = true; s.loopStart = Math.random(); return s;
  }
  /** 필터 거친 잡음 한 겹. lfo(초당 몇 번)로 필터 주파수와 크기가 천천히 흔들린다. 돌려주는 값은 그 층의 크기(GainNode) */
  noiseLayer({ type, freq, q, vol, lfo, sweep, swell }) {
    const ctx = this.sound.ctx, s = this.noise(), f = ctx.createBiquadFilter(), g = ctx.createGain(), og = ctx.createGain();
    f.type = type; f.frequency.value = freq; f.Q.value = q; g.gain.value = vol;
    const o = ctx.createOscillator(), oa = ctx.createGain(); o.frequency.value = lfo * rand(0.8, 1.2); oa.gain.value = sweep; o.connect(oa).connect(f.frequency);
    const o2 = ctx.createOscillator(), oa2 = ctx.createGain(); o2.frequency.value = lfo * 0.5; oa2.gain.value = swell ? vol * 0.9 : vol * 0.3; o2.connect(oa2).connect(g.gain);
    s.connect(f).connect(g).connect(og).connect(this.master); og.gain.value = 1;
    s.start(); o.start(); o2.start();
    this.layers.push({ stop: (t) => { og.gain.setTargetAtTime(0, ctx.currentTime, 0.15); s.stop(t); o.stop(t); o2.stop(t); } });
    return g;
  }
  oscLayer(freqs, type, vol, trem = 0.1) {
    const ctx = this.sound.ctx, g = ctx.createGain(), lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900; g.gain.value = vol;
    const oscs = freqs.map((fr) => { const o = ctx.createOscillator(); o.type = type; o.frequency.value = fr; o.connect(lp); o.start(); return o; });
    const t = ctx.createOscillator(), ta = ctx.createGain(); t.frequency.value = trem; ta.gain.value = vol * 0.5; t.connect(ta).connect(g.gain); t.start();
    lp.connect(g).connect(this.master);
    this.layers.push({ stop: (tt) => { g.gain.setTargetAtTime(0, ctx.currentTime, 0.15); for (const o of oscs) o.stop(tt); t.stop(tt); } });
  }
  buzzLayer(v) { this.oscLayer([176, 181, 352.5], 'sawtooth', v, 5.5); }
  padLayer(v) { this.oscLayer([110, 164.8, 220.6], 'sine', v, 0.08); }
  humLayer(v) { this.oscLayer([60, 120.4], 'sine', v, 0.3); }
  /** 짧은 소리 하나: 주파수가 f0 → f1 로 미끄러진다 */
  blip(f0, f1, dur, vol, type = 'sine', when = 0) {
    const ctx = this.sound.ctx, t0 = ctx.currentTime + when, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t0); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
    g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(vol, t0 + Math.min(0.02, dur / 4)); g.gain.exponentialRampToValueAtTime(0.0008, t0 + dur);
    o.connect(g).connect(this.master); o.start(t0); o.stop(t0 + dur + 0.03);
  }
  burst(dur, vol, type, freq, when = 0) {
    const ctx = this.sound.ctx, t0 = ctx.currentTime + when, s = this.noise(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    f.type = type; f.frequency.value = freq; g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(vol, t0 + Math.min(0.3, dur / 3)); g.gain.exponentialRampToValueAtTime(0.0008, t0 + dur);
    s.connect(f).connect(g).connect(this.master); s.start(t0); s.stop(t0 + dur + 0.05);
  }
  bird(pitch = 1, far = false) { // 두세 마디 지저귐 (한 마리마다 음높이가 다르다)
    const base = rand(2200, 3800) * pitch, n = 2 + Math.floor(Math.random() * 3), v = far ? 0.012 : 0.03;
    for (let i = 0; i < n; i++) { const up = Math.random() < 0.5; this.blip(base * (up ? 0.85 : 1.15), base * (up ? 1.2 : 0.8), rand(0.06, 0.12), v, 'sine', i * rand(0.1, 0.16)); }
  }
  woodpecker() { for (let i = 0; i < 7; i++) this.burst(0.03, 0.05, 'bandpass', 1800, i * 0.07); }
  chime() { const P = [0, 2, 4, 7, 9, 12], r = 880; for (let i = 0; i < 2 + Math.floor(Math.random() * 2); i++) { const f = r * Math.pow(2, P[Math.floor(Math.random() * P.length)] / 12); this.blip(f, f * 0.999, 1.4, 0.014, 'sine', i * rand(0.15, 0.35)); } }
  drip() { const f = rand(1100, 2200); this.blip(f, f * 1.6, 0.09, 0.035); if (Math.random() < 0.4) this.blip(f * 0.7, f * 0.9, 0.25, 0.008, 'sine', 0.05); }
  bubble(low) { const f = low ? rand(70, 140) : rand(300, 700); this.blip(f, f * (low ? 0.6 : 2.2), low ? 0.25 : 0.12, low ? 0.05 : 0.02); }
  crackle() { for (let i = 0; i < 3 + Math.floor(Math.random() * 4); i++) this.burst(0.02, 0.025, 'highpass', 4000, i * rand(0.02, 0.06)); }
  rumble() { this.burst(2.6, 0.09, 'lowpass', 90); }
  gull() { const f = rand(1400, 1900); this.blip(f, f * 0.65, 0.35, 0.02, 'triangle'); this.blip(f * 0.95, f * 0.6, 0.3, 0.016, 'triangle', 0.4); }
  twinkle() { const f = rand(1500, 3200); this.blip(f, f, 0.9, 0.012, 'sine'); }
  cheer() { this.burst(2.2, 0.05, 'bandpass', 1200); }
  beep() { this.blip(1320, 1320, 0.07, 0.01, 'square'); this.blip(1760, 1760, 0.07, 0.008, 'square', 0.12); }
  tick() { this.burst(0.02, 0.012, 'highpass', 2500); }
}
