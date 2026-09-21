// ---------------------------------------------------------------------------
// 배경 음악 (BGM). 음악 파일을 받지 않고 WebAudio 로 직접 연주한다 —
// 효과음(src/effects.js Sound)과 같은 방식이라 내려받을 것이 하나도 늘지 않고,
// 저작권 걱정도 없으며, 지역마다 다른 곡을 몇 줄로 적어 둘 수 있다.
//
// 곡 적는 법: 한 칸이 8분음표. 숫자 = 으뜸음에서 몇 반음 위(12 = 한 옥타브), '-' = 앞 소리를 이어서, '.' = 쉼.
//   lead  : 멜로디 (한 마디 8칸 × 4마디 = 32칸)
//   bass  : 낮은 소리 (한 마디 4칸 × 4마디 = 16칸, 4분음표)
//   drum  : 'x' 만 짧게 톡 (32칸). 소리를 아주 작게 깔아 박자만 잡아 준다
// ---------------------------------------------------------------------------

const TRACKS = {
  // 푸른숲: 밝은 장조, 통통 튀는 걸음걸이
  forest: { bpm: 116, root: 523.25, wave: 'square', bassWave: 'triangle',
    lead: '0 - 4 - 7 - 9 -  7 - 4 - 5 - . .  5 - 9 - 12 - 9 -  7 - 4 - 2 - 0 -',
    bass: '0 . 7 .  5 . 7 .  5 . 9 .  7 . 0 .',
    drum: '. . x . . . x .  . . x . . . x .  . . x . . . x .  . . x . x . x .' },
  // 꿀벌집: 바쁘게 윙윙, 짧게 끊어 치는 소리
  hive: { bpm: 132, root: 587.33, wave: 'square', bassWave: 'triangle', short: true,
    lead: '0 . 3 . 7 . 3 .  5 . 8 . 12 . 8 .  7 . 10 . 7 . 3 .  5 . 3 . 0 . . .',
    bass: '0 0 7 7  5 5 3 3  7 7 5 5  0 0 0 .',
    drum: 'x . x . x . x .  x . x . x . x .  x . x . x . x .  x . x . x x x .' },
  // 지하동굴: 느리고 어두운 단조, 소리가 드문드문
  cave: { bpm: 84, root: 392.00, wave: 'triangle', bassWave: 'sine',
    lead: '0 - - - 3 - - -  7 - - - 3 - - -  8 - - - 7 - - -  5 - - - . . . .',
    bass: '0 . . .  0 . . .  8 . . .  7 . . .',
    drum: '. . . . x . . .  . . . . x . . .  . . . . x . . .  . . . . x . x .' },
  // 불의산: 몰아치는 단조, 빠른 걸음
  volcano: { bpm: 140, root: 440.00, wave: 'sawtooth', bassWave: 'triangle',
    lead: '0 . 0 . 3 . 5 .  7 - 5 . 3 . 0 .  10 . 10 . 7 . 5 .  3 - 5 - 3 . 0 .',
    bass: '0 0 0 0  3 3 3 3  10 10 10 10  7 7 0 0',
    drum: 'x . x x . . x .  x . x x . . x .  x . x x . . x .  x . x x x . x x' },
  // 물의길: 넘실대는 장조, 물결 같은 셋잇단 느낌
  sea: { bpm: 100, root: 493.88, wave: 'triangle', bassWave: 'sine',
    lead: '0 - 4 - 7 - 12 -  9 - 7 - 4 - . .  2 - 5 - 9 - 14 -  12 - 9 - 7 - . .',
    bass: '0 . 7 .  4 . 7 .  2 . 9 .  7 . 0 .',
    drum: '. . . . x . . .  . . . . x . . .  . . . . x . . .  . . . . x . x .' },
  // 심해: 아주 느리고 꿈결 같은 소리, 깊은 곳의 울림
  deepsea: { bpm: 68, root: 329.63, wave: 'sine', bassWave: 'sine',
    lead: '0 - - - - - - -  7 - - - - - - -  10 - - - - - - -  5 - - - - - - -',
    bass: '0 . . .  0 . . .  10 . . .  5 . . .',
    drum: '. . . . . . . .  . . . . x . . .  . . . . . . . .  . . . . x . . .' },
  // 꿈의우주: 둥둥 뜨는 리디안(4도가 반음 높다), 별 사이를 걷는 느낌
  space: { bpm: 92, root: 466.16, wave: 'triangle', bassWave: 'sine',
    lead: '0 - - - 6 - - -  7 - - - 11 - - -  12 - - - 11 - - -  7 - - - 6 - - -',
    bass: '0 . . .  7 . . .  0 . . .  7 . . .',
    drum: '. . . . . . x .  . . . . . . x .  . . . . . . x .  . . . . x . x .' },
  // 연구소: 조용하고 포근한 소리 (오박사님 방)
  lab: { bpm: 88, root: 523.25, wave: 'sine', bassWave: 'sine', quiet: true,
    lead: '0 - - - 4 - - -  7 - - - 4 - - -  5 - - - 9 - - -  7 - - - . . . .',
    bass: '0 . . .  5 . . .  3 . . .  7 . . .',
    drum: '. . . . . . . .  . . . . . . . .  . . . . . . . .  . . . . . . . .' },
  // 아레나: 행진곡풍, 또박또박
  arena: { bpm: 124, root: 523.25, wave: 'square', bassWave: 'triangle', short: true,
    lead: '0 . 0 . 7 . 7 .  5 . 5 . 4 . . .  2 . 2 . 9 . 9 .  7 . 5 . 0 . . .',
    bass: '0 0 7 7  5 5 4 4  2 2 9 9  7 7 0 0',
    drum: 'x . . . x . . .  x . . . x . . .  x . . . x . . .  x . . . x . x x' },
  // 행성: 신비로운 단조. 행성마다 으뜸음을 조금씩 옮겨 열 곳이 다 다르게 들린다 (planetRoot)
  planet: { bpm: 96, root: 415.30, wave: 'triangle', bassWave: 'sine',
    lead: '0 - - - 3 - - -  10 - - - 7 - - -  8 - - - 7 - - -  3 - - - 0 - - -',
    bass: '0 . . .  10 . . .  8 . . .  7 . . .',
    drum: '. . . . x . . .  . . . . x . . .  . . . . x . . .  . . . . x . x .' },
  // 대결: 빠르고 조마조마하게
  battle: { bpm: 152, root: 440.00, wave: 'square', bassWave: 'triangle', short: true,
    lead: '0 . 7 . 0 . 7 .  3 . 10 . 3 . 10 .  5 . 12 . 5 . 12 .  3 . 2 . 0 . . .',
    bass: '0 0 0 0  3 3 3 3  5 5 5 5  2 2 0 0',
    drum: 'x . x . x . x .  x . x . x . x .  x . x . x . x .  x x x x x . x .' },
  // 보스: 더 크고 더 무겁게
  boss: { bpm: 160, root: 349.23, wave: 'sawtooth', bassWave: 'square', short: true,
    lead: '0 . 0 . 3 . 0 .  7 . 7 . 8 . 7 .  10 . 10 . 12 . 10 .  8 - 7 - 0 . . .',
    bass: '0 0 0 0  7 7 7 7  10 10 10 10  8 8 7 7',
    drum: 'x x . x x x . x  x x . x x x . x  x x . x x x . x  x x x x x x x x' },
  // 처음 화면: 푸른숲 주제곡을 느긋하게
  title: { bpm: 92, root: 523.25, wave: 'triangle', bassWave: 'sine', quiet: true,
    lead: '0 - - - 4 - - -  7 - - - 9 - - -  7 - - - 5 - - -  4 - - - 0 - - -',
    bass: '0 . . .  7 . . .  5 . . .  0 . . .',
    drum: '. . . . . . . .  . . . . x . . .  . . . . . . . .  . . . . x . . .' },
};

/** 지역 이름 → 곡 이름. 행성 열 곳은 planet 하나를 나눠 쓰고 으뜸음만 옮긴다 */
export function trackFor(zoneName) {
  if (!zoneName) return 'title';
  if (zoneName.startsWith('p_')) return 'planet';
  return TRACKS[zoneName] ? zoneName : 'forest';
}
const PLANET_STEP = { p_mercury: 0, p_venus: 1, p_earth: 2, p_mars: 3, p_jupiter: 4, p_saturn: 5, p_uranus: 6, p_neptune: 7, p_pluto: 8, p_sun: 9 };

const parse = (s) => s.trim().split(/\s+/);
const semi = (root, n) => root * Math.pow(2, n / 12);

export class Bgm {
  /** sound: src/effects.js 의 Sound (AudioContext 를 함께 쓴다) */
  constructor(sound) {
    this.sound = sound;
    this.on = localStorage.getItem('np-bgm') !== 'off'; // 처음엔 켜져 있고, 끄면 기억한다
    this.name = null;
    this.timer = null;
    this.step = 0;
    this.nextAt = 0;
    this.gain = null;
    this.rootShift = 1;
  }
  get playing() { return !!this.timer; }
  /** 켜기/끄기. 끄면 바로 멈추고, 켜면 마지막 곡을 다시 시작한다 */
  toggle() {
    this.on = !this.on;
    localStorage.setItem('np-bgm', this.on ? 'on' : 'off');
    if (this.on) { const n = this.name; this.name = null; this.play(n || 'title'); }
    else this.stop();
    return this.on;
  }
  /** 이 곡을 연주한다 (같은 곡이면 그대로 둔다). zoneName 을 주면 행성마다 으뜸음이 달라진다 */
  play(name, zoneName = null) {
    const key = TRACKS[name] ? name : trackFor(name);
    this.rootShift = zoneName && PLANET_STEP[zoneName] != null ? Math.pow(2, (PLANET_STEP[zoneName] % 5) / 12) : 1;
    if (this.name === key && this.timer) return;
    this.name = key;
    this.stopTimer();
    if (!this.on) return;
    const ctx = this.sound.ensure();
    if (!ctx || ctx.state !== 'running') return; // 아직 화면을 한 번도 안 눌렀다 — 첫 조작 때 다시 부른다
    const t = TRACKS[key];
    this.stepDur = 60 / t.bpm / 2; // 8분음표 한 칸
    this.step = 0;
    this.nextAt = ctx.currentTime + 0.08;
    if (!this.gain) { this.gain = ctx.createGain(); this.gain.connect(ctx.destination); }
    this.gain.gain.cancelScheduledValues(ctx.currentTime);
    this.gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    this.gain.gain.linearRampToValueAtTime(t.quiet ? 0.035 : 0.055, ctx.currentTime + 1.2); // 효과음보다 한참 작게 깔린다
    this.timer = setInterval(() => this.tick(), 60);
    this.tick();
  }
  stop() { this.stopTimer(); if (this.gain) { const ctx = this.sound.ctx; if (ctx) { this.gain.gain.cancelScheduledValues(ctx.currentTime); this.gain.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.15); } } }
  stopTimer() { if (this.timer) { clearInterval(this.timer); this.timer = null; } }
  /** 화면이 가려지면 멈추고 돌아오면 이어서 (안 그러면 브라우저가 타이머를 늦춰 소리가 끊긴다) */
  setHidden(hidden) {
    if (hidden) this.stopTimer();
    else if (this.on && this.name) { const n = this.name; this.name = null; this.play(n); }
  }

  tick() {
    const ctx = this.sound.ctx;
    const t = TRACKS[this.name];
    if (!ctx || !t) return;
    while (this.nextAt < ctx.currentTime + 0.35) { // 조금 앞질러 예약해 두면 타이머가 늦어도 끊기지 않는다
      this.playStep(t, this.step, this.nextAt);
      this.step++;
      this.nextAt += this.stepDur;
    }
  }
  /** i 번째 칸(8분음표)의 소리들을 when 시각에 예약 */
  playStep(t, i, when) {
    const lead = (t._lead ||= parse(t.lead)), bass = (t._bass ||= parse(t.bass)), drum = (t._drum ||= parse(t.drum));
    const li = i % lead.length;
    const tok = lead[li];
    if (tok !== '.' && tok !== '-') { // 이어지는 칸('-') 수만큼 길게 낸다
      let len = 1;
      while (lead[(li + len) % lead.length] === '-' && len < 8) len++;
      const dur = this.stepDur * len * (t.short ? 0.55 : 0.92);
      this.note(semi(t.root * this.rootShift, +tok), dur, t.wave, 0.5, when);
    }
    if (i % 2 === 0) { // 낮은 소리는 4분음표 칸
      const bi = (i / 2) % bass.length, b = bass[bi];
      if (b !== '.' && b !== '-') this.note(semi(t.root * this.rootShift / 4, +b), this.stepDur * 1.7, t.bassWave, 0.75, when);
    }
    if (drum[i % drum.length] === 'x') this.tick_(when);
  }
  note(freq, dur, type, vol, when) {
    const ctx = this.sound.ctx;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, when);
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(vol, when + 0.012);
    g.gain.exponentialRampToValueAtTime(0.001, when + dur);
    o.connect(g).connect(this.gain);
    o.start(when); o.stop(when + dur + 0.02);
  }
  /** 톡 하는 박자 소리 (아주 짧은 잡음) */
  tick_(when) {
    const ctx = this.sound.ctx;
    if (!this.noise) { // 잡음 조각은 한 번만 만들어 두고 계속 쓴다
      const n = ctx.createBuffer(1, ctx.sampleRate * 0.1, ctx.sampleRate), d = n.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      this.noise = n;
    }
    const s = ctx.createBufferSource(), g = ctx.createGain(), f = ctx.createBiquadFilter();
    s.buffer = this.noise;
    f.type = 'highpass'; f.frequency.value = 3000;
    g.gain.setValueAtTime(0.18, when);
    g.gain.exponentialRampToValueAtTime(0.001, when + 0.05);
    s.connect(f).connect(g).connect(this.gain);
    s.start(when); s.stop(when + 0.06);
  }
}
