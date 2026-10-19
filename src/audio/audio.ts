// Audio 100 % synthétisé (Web Audio). STATUT : ambiance et sons PROVISOIRES du prototype,
// originaux (aucun fichier tiers) mais pas une bande-son finale.
import type { Settings } from '../logic/save-model';

export type MusicMode = 'off' | 'menu' | 'run';
export type SfxName =
  | 'collect' | 'extract' | 'full' | 'impact' | 'deposit' | 'purchase'
  | 'warning' | 'warningLast' | 'storm' | 'repair' | 'click' | 'deliver' | 'unlock'
  | 'laser' | 'discover' | 'sell' | 'build' | 'contract';

const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

// Boucle de 8 mesures : Am F C G | F G Am Em
interface Chord { root: number; tones: [number, number, number] }
const CHORDS: Chord[] = [
  { root: 45, tones: [57, 60, 64] }, // Am
  { root: 41, tones: [53, 57, 60] }, // F
  { root: 48, tones: [55, 60, 64] }, // C
  { root: 43, tones: [55, 59, 62] }, // G
  { root: 41, tones: [53, 57, 60] }, // F
  { root: 43, tones: [55, 59, 62] }, // G
  { root: 45, tones: [57, 60, 64] }, // Am
  { root: 40, tones: [52, 55, 59] }, // Em
];
// Mélodie (degrés de la gamme pentatonique la mineur, null = silence), 8 pas par mesure.
const SCALE = [69, 72, 74, 76, 79, 81, 84]; // A4 C5 D5 E5 G5 A5 C6
const MELODY: (number | null)[][] = [
  [4, null, null, 3, null, 2, null, null],
  [3, null, 2, null, 0, null, null, 1],
  [2, null, null, 3, null, 4, null, null],
  [4, null, 3, null, 2, null, 1, null],
  [3, null, null, 2, null, 0, null, null],
  [2, null, 3, null, 4, null, null, 5],
  [4, null, null, 3, null, 2, 1, null],
  [0, null, null, null, 1, null, 2, null],
];
const ARP_A = [0, 1, 2, 3, 2, 1, 2, 1];
const ARP_B = [0, 2, 1, 3, 1, 2, 3, 2];

const BPM = 96;
const STEP = 60 / BPM / 2; // croche

interface MusicSession {
  mode: MusicMode;
  gain: GainNode;
  timer: number;
  nextTime: number;
  step: number; // 0 .. 63
  danger: GainNode | null;
  dangerNodes: AudioScheduledSourceNode[];
}

export class AudioManager {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private musicBus!: GainNode;
  private sfxBus!: GainNode;
  private delay!: DelayNode;
  private noise: AudioBuffer | null = null;
  private session: MusicSession | null = null;
  private wanted: MusicMode = 'off';
  private settings: Settings = { musicVolume: 70, sfxVolume: 80, muted: false, joystickSide: 'right', lowFx: false };
  private lastPlay = new Map<SfxName, number>();
  private voices = 0;
  private comboIndex = 0;
  private lastCollect = 0;
  private duck = 1;
  private dangerLevel = 0;
  private engine: { gain: GainNode; filter: BiquadFilterNode; src: AudioBufferSourceNode } | null = null;
  private beam: { gain: GainNode; osc: OscillatorNode; lfo: OscillatorNode } | null = null;
  private suspended = false;

  get unlocked(): boolean {
    return this.ctx !== null;
  }

  /** À appeler depuis un geste utilisateur (pointerdown / keydown). */
  unlock(): void {
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      try {
        this.ctx = new Ctor();
      } catch {
        return;
      }
      this.buildGraph();
      this.applySettings(this.settings);
    }
    if (this.ctx.state === 'suspended' && !this.suspended) void this.ctx.resume();
    if (this.wanted !== 'off' && !this.session) this.startSession(this.wanted);
  }

  private buildGraph(): void {
    const ctx = this.ctx as AudioContext;
    this.master = ctx.createGain();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 3;
    this.master.connect(comp).connect(ctx.destination);
    this.musicBus = ctx.createGain();
    this.sfxBus = ctx.createGain();
    this.musicBus.connect(this.master);
    this.sfxBus.connect(this.master);
    // écho doux pour l'arpège
    this.delay = ctx.createDelay(1);
    this.delay.delayTime.value = STEP * 3;
    const fb = ctx.createGain();
    fb.gain.value = 0.32;
    const tone = ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = 2400;
    this.delay.connect(tone).connect(fb).connect(this.delay);
    tone.connect(this.musicBus);
    // bruit blanc réutilisable
    const len = ctx.sampleRate * 1.5;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  }

  applySettings(s: Settings): void {
    this.settings = { ...s };
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(s.muted ? 0 : 1, t, 0.03);
    this.musicBus.gain.setTargetAtTime((s.musicVolume / 100) * 0.55 * this.duck, t, 0.05);
    this.sfxBus.gain.setTargetAtTime((s.sfxVolume / 100) * 0.9, t, 0.05);
  }

  /** Baisse la musique (pause, bilan) sans l'arrêter. */
  setDuck(on: boolean): void {
    this.duck = on ? 0.4 : 1;
    this.applySettings(this.settings);
  }

  /** Arrêt/reprise propres quand l'application passe en arrière-plan. */
  setSuspended(v: boolean): void {
    this.suspended = v;
    if (!this.ctx) return;
    if (v) void this.ctx.suspend();
    else void this.ctx.resume();
  }

  // --- Musique ------------------------------------------------------------
  setMusic(mode: MusicMode): void {
    if (mode === this.wanted && (this.session !== null || !this.ctx || mode === 'off')) return;
    this.wanted = mode;
    if (!this.ctx) return; // démarrera au premier geste (unlock)
    this.stopSession();
    if (mode !== 'off') this.startSession(mode);
  }

  /** 0..1 : couche de tension ajoutée progressivement près du danger. */
  setDanger(level: number): void {
    this.dangerLevel = Math.max(0, Math.min(1, level));
    const s = this.session;
    if (s?.danger && this.ctx) s.danger.gain.setTargetAtTime(this.dangerLevel * 0.07, this.ctx.currentTime, 0.4);
  }

  private startSession(mode: MusicMode): void {
    const ctx = this.ctx as AudioContext;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.gain.setTargetAtTime(1, ctx.currentTime, 0.35);
    gain.connect(this.musicBus);
    const s: MusicSession = { mode, gain, timer: 0, nextTime: ctx.currentTime + 0.12, step: 0, danger: null, dangerNodes: [] };
    if (mode === 'run') this.buildDanger(s);
    this.session = s;
    s.timer = window.setInterval(() => this.schedule(s), 90);
    this.schedule(s);
  }

  private stopSession(): void {
    const s = this.session;
    this.session = null;
    if (!s || !this.ctx) return;
    window.clearInterval(s.timer);
    const t = this.ctx.currentTime;
    s.gain.gain.cancelScheduledValues(t);
    s.gain.gain.setTargetAtTime(0, t, 0.18);
    window.setTimeout(() => {
      try {
        s.dangerNodes.forEach((n) => n.stop());
        s.gain.disconnect();
      } catch { /* déjà arrêté */ }
    }, 1200);
  }

  private buildDanger(s: MusicSession): void {
    const ctx = this.ctx as AudioContext;
    const g = ctx.createGain();
    g.gain.value = this.dangerLevel * 0.07;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 520;
    const a = ctx.createOscillator();
    const b = ctx.createOscillator();
    a.type = 'sawtooth';
    b.type = 'sawtooth';
    a.frequency.value = midi(33);
    b.frequency.value = midi(33) * 1.012;
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.frequency.value = 1 / (STEP * 2); // pulsation à la noire
    lfoGain.gain.value = 0.5;
    const pulse = ctx.createGain();
    pulse.gain.value = 0.5;
    lfo.connect(lfoGain).connect(pulse.gain);
    a.connect(filter);
    b.connect(filter);
    filter.connect(pulse).connect(g).connect(s.gain);
    a.start();
    b.start();
    lfo.start();
    s.danger = g;
    s.dangerNodes = [a, b, lfo];
  }

  private schedule(s: MusicSession): void {
    const ctx = this.ctx;
    if (!ctx || this.session !== s) return;
    if (s.nextTime < ctx.currentTime) s.nextTime = ctx.currentTime + 0.05; // reprise après suspension
    while (s.nextTime < ctx.currentTime + 0.4) {
      this.playStep(s, s.step, s.nextTime);
      s.nextTime += STEP;
      s.step = (s.step + 1) % 64;
    }
  }

  private playStep(s: MusicSession, step: number, t: number): void {
    const bar = Math.floor(step / 8);
    const i = step % 8;
    const chord = CHORDS[bar];
    const run = s.mode === 'run';
    if (i === 0) this.pad(s, chord, t);
    // basse
    if (i === 0 || (run && (i === 4 || i === 6))) this.bass(s, chord.root, t, i === 0 ? STEP * 3.4 : STEP * 1.6, run ? 0.2 : 0.14);
    // arpège
    const pattern = bar % 2 === 0 ? ARP_A : ARP_B;
    const idx = pattern[i];
    const tones = [chord.tones[0], chord.tones[1], chord.tones[2], chord.tones[1] + 12];
    if (run || i % 2 === 0) this.pluck(s, midi(tones[idx] + 12), t, run ? 0.05 : 0.04);
    // mélodie
    const m = MELODY[bar][i];
    if (m !== null && (run || bar % 2 === 0)) this.lead(s, midi(SCALE[m]), t, STEP * 2.6, run ? 0.07 : 0.05);
    if (run) {
      if (i === 0 || i === 4) this.kick(s, t);
      if (i === 2 || i === 6) this.clap(s, t);
      if (i % 2 === 1) this.hat(s, t, i === 7 ? 0.05 : 0.03);
    }
  }

  private env(g: GainNode, t: number, peak: number, attack: number, release: number): void {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + release);
  }

  private pad(s: MusicSession, chord: Chord, t: number): void {
    const ctx = this.ctx as AudioContext;
    const dur = STEP * 8;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = s.mode === 'run' ? 1000 : 700;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.05, t + 0.5);
    g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.3);
    filter.connect(g).connect(s.gain);
    for (const n of chord.tones) {
      for (const det of [-6, 6]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = midi(n);
        o.detune.value = det;
        o.connect(filter);
        o.start(t);
        o.stop(t + dur + 0.4);
      }
    }
  }

  private bass(s: MusicSession, note: number, t: number, len: number, vol: number): void {
    const ctx = this.ctx as AudioContext;
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = midi(note);
    const g = ctx.createGain();
    this.env(g, t, vol, 0.01, len);
    o.connect(g).connect(s.gain);
    o.start(t);
    o.stop(t + len + 0.1);
  }

  private pluck(s: MusicSession, f: number, t: number, vol: number): void {
    const ctx = this.ctx as AudioContext;
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = f;
    const g = ctx.createGain();
    this.env(g, t, vol, 0.005, 0.28);
    o.connect(g);
    g.connect(s.gain);
    const send = ctx.createGain();
    send.gain.value = 0.45;
    g.connect(send).connect(this.delay);
    o.start(t);
    o.stop(t + 0.4);
  }

  private lead(s: MusicSession, f: number, t: number, len: number, vol: number): void {
    const ctx = this.ctx as AudioContext;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = f;
    const vib = ctx.createOscillator();
    vib.frequency.value = 5;
    const vg = ctx.createGain();
    vg.gain.value = 3;
    vib.connect(vg).connect(o.detune);
    const g = ctx.createGain();
    this.env(g, t, vol, 0.03, len);
    o.connect(g);
    g.connect(s.gain);
    const send = ctx.createGain();
    send.gain.value = 0.5;
    g.connect(send).connect(this.delay);
    o.start(t);
    vib.start(t);
    o.stop(t + len + 0.1);
    vib.stop(t + len + 0.1);
  }

  private kick(s: MusicSession, t: number): void {
    const ctx = this.ctx as AudioContext;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(130, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.16);
    const g = ctx.createGain();
    this.env(g, t, 0.26, 0.002, 0.2);
    o.connect(g).connect(s.gain);
    o.start(t);
    o.stop(t + 0.3);
  }

  private noiseBurst(dest: AudioNode, t: number, len: number, vol: number, type: BiquadFilterType, freq: number, q = 0.7): void {
    const ctx = this.ctx as AudioContext;
    if (!this.noise) return;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    this.env(g, t, vol, 0.002, len);
    src.connect(f).connect(g).connect(dest);
    src.start(t, Math.random());
    src.stop(t + len + 0.05);
  }

  private hat(s: MusicSession, t: number, vol: number): void {
    this.noiseBurst(s.gain, t, 0.05, vol, 'highpass', 7500);
  }
  private clap(s: MusicSession, t: number): void {
    this.noiseBurst(s.gain, t, 0.11, 0.07, 'bandpass', 1800, 1.2);
  }

  // --- Effets -------------------------------------------------------------
  private canPlay(name: SfxName, minGap: number): boolean {
    const ctx = this.ctx;
    if (!ctx || this.suspended) return false;
    const now = ctx.currentTime;
    const last = this.lastPlay.get(name) ?? -10;
    if (now - last < minGap) return false;
    if (this.voices > 16) return false;
    this.lastPlay.set(name, now);
    return true;
  }

  private tone(freq: number, t: number, len: number, vol: number, type: OscillatorType = 'sine', slideTo?: number): void {
    const ctx = this.ctx as AudioContext;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + len);
    const g = ctx.createGain();
    this.env(g, t, vol, 0.004, len);
    o.connect(g).connect(this.sfxBus);
    this.voices++;
    o.onended = () => {
      this.voices--;
    };
    o.start(t);
    o.stop(t + len + 0.05);
  }

  sfx(name: SfxName): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime + 0.005;
    switch (name) {
      case 'collect': {
        if (!this.canPlay(name, 0.04)) return;
        if (t - this.lastCollect > 0.7) this.comboIndex = 0;
        this.lastCollect = t;
        const steps = [0, 2, 4, 7, 9, 12, 14, 16];
        const semis = steps[Math.min(this.comboIndex, steps.length - 1)];
        this.comboIndex++;
        const f = midi(79 + semis) * (1 + (Math.random() - 0.5) * 0.01);
        this.tone(f, t, 0.13, 0.16, 'sine');
        this.tone(f * 2, t, 0.07, 0.04, 'triangle');
        break;
      }
      case 'extract':
        if (!this.canPlay(name, 0.12)) return;
        this.tone(midi(60 + Math.floor(Math.random() * 3) * 2), t, 0.12, 0.09, 'triangle', midi(67));
        break;
      case 'full':
        if (!this.canPlay(name, 0.8)) return;
        this.tone(midi(76), t, 0.18, 0.16, 'triangle');
        this.tone(midi(69), t + 0.16, 0.3, 0.16, 'triangle');
        break;
      case 'impact':
        if (!this.canPlay(name, 0.2)) return;
        this.tone(95, t, 0.25, 0.4, 'sine', 45);
        this.noiseBurst(this.sfxBus, t, 0.22, 0.28, 'lowpass', 600);
        break;
      case 'deposit': {
        if (!this.canPlay(name, 0.3)) return;
        const notes = [72, 76, 79, 84, 88];
        notes.forEach((n, i) => this.tone(midi(n), t + i * 0.075, 0.5, 0.15, 'triangle'));
        this.tone(midi(48), t, 0.45, 0.28, 'sine', midi(36));
        this.noiseBurst(this.sfxBus, t + 0.3, 0.4, 0.04, 'highpass', 6000);
        break;
      }
      case 'purchase':
      case 'unlock': {
        if (!this.canPlay(name, 0.2)) return;
        [67, 71, 74, 79].forEach((n, i) => this.tone(midi(n), t + i * 0.06, 0.45, 0.14, 'triangle'));
        this.tone(midi(91), t + 0.25, 0.6, 0.05, 'sine');
        break;
      }
      case 'deliver':
        if (!this.canPlay(name, 0.2)) return;
        [60, 64, 67].forEach((n, i) => this.tone(midi(n), t + i * 0.09, 0.4, 0.14, 'triangle'));
        this.tone(midi(48), t, 0.5, 0.25, 'sine');
        break;
      case 'warning':
        if (!this.canPlay(name, 0.5)) return;
        this.tone(880, t, 0.14, 0.12, 'square');
        this.tone(880, t + 0.2, 0.14, 0.12, 'square');
        break;
      case 'warningLast':
        if (!this.canPlay(name, 0.5)) return;
        for (let i = 0; i < 3; i++) this.tone(988, t + i * 0.18, 0.12, 0.12, 'square');
        break;
      case 'storm':
        if (!this.canPlay(name, 2)) return;
        this.noiseBurst(this.sfxBus, t, 1.4, 0.2, 'lowpass', 500);
        this.tone(midi(33), t, 1.4, 0.2, 'sawtooth', midi(29));
        break;
      case 'repair':
        if (!this.canPlay(name, 0.5)) return;
        this.tone(midi(64), t, 0.25, 0.14, 'triangle');
        this.tone(midi(71), t + 0.12, 0.35, 0.14, 'triangle');
        break;
      case 'laser':
        if (!this.canPlay(name, 0.12)) return;
        this.tone(midi(55), t, 0.16, 0.1, 'sawtooth', midi(60));
        this.noiseBurst(this.sfxBus, t, 0.1, 0.05, 'bandpass', 2400, 1.5);
        break;
      case 'discover':
        if (!this.canPlay(name, 0.6)) return;
        this.tone(midi(81), t, 0.2, 0.08, 'sine');
        this.tone(midi(88), t + 0.12, 0.3, 0.07, 'sine');
        break;
      case 'sell':
        if (!this.canPlay(name, 0.1)) return;
        this.tone(midi(84), t, 0.09, 0.12, 'triangle');
        this.tone(midi(91), t + 0.06, 0.18, 0.12, 'triangle');
        break;
      case 'build':
        if (!this.canPlay(name, 0.3)) return;
        this.tone(midi(40), t, 0.3, 0.3, 'sine', midi(36));
        [60, 64, 67, 72].forEach((n, i) => this.tone(midi(n), t + 0.12 + i * 0.07, 0.4, 0.13, 'triangle'));
        this.noiseBurst(this.sfxBus, t, 0.25, 0.1, 'lowpass', 900);
        break;
      case 'contract':
        if (!this.canPlay(name, 0.3)) return;
        [67, 72, 76, 79, 84].forEach((n, i) => this.tone(midi(n), t + i * 0.07, 0.5, 0.13, 'triangle'));
        break;
      case 'click':
        if (!this.canPlay(name, 0.03)) return;
        this.tone(660, t, 0.05, 0.1, 'triangle');
        break;
    }
  }

  // --- Propulsion et rayon (boucles continues, discrètes) ---------------------
  startRunLoops(): void {
    const ctx = this.ctx;
    if (!ctx || this.engine) return;
    if (this.noise) {
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      src.loop = true;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 220;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      src.connect(filter).connect(gain).connect(this.sfxBus);
      src.start();
      this.engine = { gain, filter, src };
    }
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = 150;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 9;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.004;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    lfo.connect(lfoGain).connect(gain.gain);
    osc.connect(gain).connect(this.sfxBus);
    osc.start();
    lfo.start();
    this.beam = { gain, osc, lfo };
  }

  updateRunLoops(speed01: number, beamOn: boolean): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    if (this.engine) {
      this.engine.gain.gain.setTargetAtTime(0.012 + speed01 * 0.05, t, 0.08);
      this.engine.filter.frequency.setTargetAtTime(180 + speed01 * 420, t, 0.1);
    }
    if (this.beam) this.beam.gain.gain.setTargetAtTime(beamOn ? 0.03 : 0, t, 0.08);
  }

  stopRunLoops(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    if (this.engine) {
      const e = this.engine;
      e.gain.gain.setTargetAtTime(0, t, 0.05);
      window.setTimeout(() => { try { e.src.stop(); e.gain.disconnect(); } catch { /* ok */ } }, 400);
      this.engine = null;
    }
    if (this.beam) {
      const b = this.beam;
      b.gain.gain.setTargetAtTime(0, t, 0.05);
      window.setTimeout(() => { try { b.osc.stop(); b.lfo.stop(); b.gain.disconnect(); } catch { /* ok */ } }, 400);
      this.beam = null;
    }
  }
}
