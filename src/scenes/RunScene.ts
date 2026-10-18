import Phaser from 'phaser';
import { STORM_DURATION } from '../config/balance';
import { Sim, type SimEvent, type SimResult } from '../logic/sim';
import type { Controls } from '../input/controls';
import type { Hud } from '../ui/hud';
import type { AudioManager } from '../audio/audio';
import { Fx } from './fx';
import { LOGICAL_H, LOGICAL_W, PLAY_H, view } from './view';

export interface RunDeps {
  sim: Sim;
  controls: Controls;
  hud: Hud;
  audio: AudioManager;
  lowFx: boolean;
  isTouch: boolean;
  tonsPerFragment: number;
  materialName: string;
  timeScale: () => number;
  tipsSeen: () => ReadonlySet<string>;
  markTip: (key: string) => void;
  /** Applique le dépôt à la sauvegarde (transaction unique) ; renvoie les tonnes créditées. */
  onDeposit: (fragments: number, txId: string) => number;
  onEnd: (result: SimResult) => void;
}

const DEPTH = { bg: -20, stars: -19, nebula: -18, storm: 1, station: 2, deposit: 3, frag: 4, obstacle: 5, beam: 6, ship: 8, fx: 9, ui: 10 };
const CYAN = 0x3ee6f0;
const CORAL = 0xff6b5e;
const ORANGE = 0xff9a3c;

export class RunScene extends Phaser.Scene {
  paused = false;
  private d!: RunDeps;
  private sim!: Sim;
  private far!: Phaser.GameObjects.TileSprite;
  private near!: Phaser.GameObjects.TileSprite;
  private shipImg!: Phaser.GameObjects.Image;
  private glowL!: Phaser.GameObjects.Image;
  private glowR!: Phaser.GameObjects.Image;
  private fragSprites = new Map<number, Phaser.GameObjects.Image>();
  private freeFrag: Phaser.GameObjects.Image[] = [];
  private depSprites = new Map<number, Phaser.GameObjects.Image>();
  private gfx!: Phaser.GameObjects.Graphics; // anneau, jauge, rayon, aimant
  private stormGfx!: Phaser.GameObjects.Graphics;
  private fx!: Fx;
  private center = { cx: 0, cy: 0 };
  private elapsed = 0;
  private thrustAcc = 0;
  private beamAcc = 0;
  private finished = false;
  private endTimer = 0;
  private pendingResult: SimResult | null = null;
  private collected = false;
  private pulse = 0;

  constructor() {
    super('Run');
  }

  init(deps: RunDeps): void {
    this.d = deps;
    this.sim = deps.sim;
    this.paused = false;
    this.finished = false;
    this.endTimer = 0;
    this.pendingResult = null;
    this.elapsed = 0;
    this.fragSprites = new Map();
    this.depSprites = new Map();
    this.freeFrag = [];
    this.collected = false;
  }

  create(): void {
    const sim = this.sim;
    const { w, h } = sim.level.world;
    const cam = this.cameras.main;
    cam.setZoom(view.k);
    cam.setBackgroundColor(0x070d1c);

    // décor : lumière froide, étoiles en parallaxe
    this.add.image(w / 2, 300, 'glow').setScale(16, 12).setTint(0x4a78d8).setAlpha(0.16).setDepth(DEPTH.nebula);
    this.add.image(w * 0.2, h * 0.5, 'glow').setScale(10, 14).setTint(0x6a5aa8).setAlpha(0.07).setDepth(DEPTH.nebula);
    this.add.image(w / 2, h - 80, 'glow').setScale(14, 5).setTint(ORANGE).setAlpha(0.06).setDepth(DEPTH.nebula);
    this.far = this.add.tileSprite(0, 0, LOGICAL_W + 8, LOGICAL_H + 8, 'stars1').setDepth(DEPTH.stars).setTileScale(0.5);
    this.near = this.add.tileSprite(0, 0, LOGICAL_W + 8, LOGICAL_H + 8, 'stars2').setDepth(DEPTH.stars).setTileScale(0.5);

    // frontières visibles
    const border = this.add.graphics().setDepth(DEPTH.nebula);
    border.lineStyle(4, CORAL, 0.55);
    border.strokeRect(2, 2, w - 4, h - 4);
    border.lineStyle(10, CORAL, 0.1);
    border.strokeRect(5, 5, w - 10, h - 10);

    this.stormGfx = this.add.graphics().setDepth(DEPTH.storm);
    this.gfx = this.add.graphics().setDepth(DEPTH.beam);

    const st = sim.level.station;
    this.add.image(st.x, st.y, 'station').setDepth(DEPTH.station).setDisplaySize(100, 100);

    for (const o of sim.obstacles) {
      const size = (o.r * 2 * 100) / 92;
      this.add
        .image(o.x, o.y, `obs${o.variant}`)
        .setDisplaySize(size, size)
        .setRotation((o.id * 1.7) % (Math.PI * 2))
        .setDepth(DEPTH.obstacle);
    }
    for (const dep of sim.deposits) {
      const img = this.add.image(dep.x, dep.y, `dep${dep.variant}`).setScale(0.5).setDepth(DEPTH.deposit).setRotation(dep.id);
      this.depSprites.set(dep.id, img);
    }

    this.glowL = this.add.image(0, 0, 'glow').setTint(ORANGE).setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.ship - 1);
    this.glowR = this.add.image(0, 0, 'glow').setTint(ORANGE).setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.ship - 1);
    this.shipImg = this.add.image(sim.ship.x, sim.ship.y, 'ship').setScale(0.5).setDepth(DEPTH.ship);
    this.fx = new Fx(this, this.d.lowFx ? 30 : 80, DEPTH.fx);

    this.center = this.targetCenter();
    cam.centerOn(this.center.cx, this.center.cy);
    this.d.hud.reset();
    this.d.audio.startRunLoops();
    this.d.audio.setDanger(0);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.d.audio.stopRunLoops();
      this.d.audio.setDanger(0);
    });
  }

  // --- caméra --------------------------------------------------------------
  private targetCenter(): { cx: number; cy: number } {
    const { w, h } = this.sim.level.world;
    const s = this.sim.ship;
    // le vaisseau est placé à 325 px du haut de l'écran : sous les doigts, la zone de commande
    const cx = Math.min(Math.max(s.x, LOGICAL_W / 2), w - LOGICAL_W / 2);
    const cy = Math.min(Math.max(s.y + (LOGICAL_H / 2 - 325), LOGICAL_H / 2), h - PLAY_H + LOGICAL_H / 2);
    return { cx, cy };
  }

  // --- boucle --------------------------------------------------------------
  update(_time: number, delta: number): void {
    const dtReal = Math.min(delta / 1000, 0.05);
    if (this.finished) {
      this.fx.update(dtReal);
      this.endTimer -= dtReal;
      if (this.endTimer <= 0 && this.pendingResult) {
        const r = this.pendingResult;
        this.pendingResult = null;
        this.d.onEnd(r);
      }
      return;
    }
    if (this.paused) return;
    this.elapsed += dtReal;
    const sim = this.sim;
    sim.step(dtReal * this.d.timeScale(), this.d.controls.vector());
    for (const e of sim.drainEvents()) this.onEvent(e);
    this.render(dtReal);
    const speed01 = Math.min(1, sim.speed / sim.stats.maxSpeed);
    this.d.audio.updateRunLoops(speed01, sim.extracting);
    const rem = sim.remaining;
    const danger = Math.max(rem <= 60 ? 0.85 * (1 - rem / 60) : 0, sim.inStorm ? 1 : 0);
    this.d.audio.setDanger(danger);
    this.d.hud.update(sim, this.center, performance.now());
    this.tips();
  }

  private onEvent(e: SimEvent): void {
    const { audio, hud } = this.d;
    const sim = this.sim;
    switch (e.type) {
      case 'collect':
        audio.sfx('collect');
        hud.bumpCargo();
        this.pulse = 0.12;
        this.fx.emit(sim.ship.x, sim.ship.y - 6, { count: 3, color: CYAN, speed: 70, life: 0.3, size: 0.55 });
        if (!this.collected) {
          this.collected = true;
          this.d.markTip('collect');
        }
        break;
      case 'extract':
        audio.sfx('extract');
        this.fx.emit(e.x, e.y, { count: 4, color: 0xbff8ff, speed: 50, life: 0.35, size: 0.6 });
        this.d.markTip('mine');
        break;
      case 'depleted':
        this.fx.emit(e.x, e.y, { count: 10, color: 0x9aa3bd, speed: 70, life: 0.6, size: 0.9, spread: 14 });
        break;
      case 'full':
        audio.sfx('full');
        hud.toast('Soute pleine — suis la flèche vers la station', 'warn', 4200);
        this.d.markTip('full');
        break;
      case 'impact':
        audio.sfx('impact');
        hud.damageFlash();
        this.fx.emit(e.x, e.y, { count: this.d.lowFx ? 5 : 10, color: CORAL, speed: 120, life: 0.4, size: 0.8 });
        if (!this.d.lowFx) this.cameras.main.shake(90, 0.0025);
        if (e.source === 'storm') hud.toast('La tempête abîme la coque — rentre à la station !', 'alert', 2200);
        break;
      case 'deposit': {
        const tons = this.d.onDeposit(e.fragments, e.txId);
        audio.sfx('deposit');
        const st = sim.level.station;
        this.fx.flow(sim.ship.x, sim.ship.y, st.x, st.y, Math.min(this.d.lowFx ? 12 : 26, e.fragments * 2), 0x9ff6fb);
        hud.toast(`+${tons} t de ${this.d.materialName.toLowerCase()} déposées`, 'good', 2600);
        this.d.markTip('deposit');
        break;
      }
      case 'repair':
        audio.sfx('repair');
        hud.toast('Coque réparée', 'good', 1800);
        break;
      case 'warning':
        audio.sfx(e.remaining <= 10 ? 'warningLast' : 'warning');
        hud.toast(
          e.remaining === 60 ? 'Plus que 60 s — la tempête approche' : e.remaining === 30 ? '30 s — retourne à la station' : '10 s ! Vite, dans l’anneau',
          e.remaining <= 10 ? 'alert' : 'warn',
          2800,
        );
        break;
      case 'stormStart':
        audio.sfx('storm');
        hud.toast(`La tempête avance depuis le haut (${STORM_DURATION} s) — rentre !`, 'alert', 3600);
        break;
      case 'end':
        this.onEnd(e.outcome);
        break;
    }
  }

  private onEnd(outcome: SimResult['outcome']): void {
    this.finished = true;
    this.d.audio.stopRunLoops();
    this.d.audio.setDanger(0);
    this.d.controls.reset();
    this.d.controls.enabled = false;
    const sim = this.sim;
    if (outcome === 'wrecked') {
      this.shipImg.setVisible(false);
      this.glowL.setVisible(false);
      this.glowR.setVisible(false);
      this.fx.emit(sim.ship.x, sim.ship.y, { count: this.d.lowFx ? 12 : 30, color: CORAL, speed: 150, life: 0.9, size: 1.1, spread: 8 });
      this.d.audio.sfx('impact');
      this.d.hud.toast('Coque détruite — cargaison perdue', 'alert', 2000);
    } else if (outcome === 'emergency') {
      this.d.hud.toast('Temps écoulé — récupération d’urgence, cargaison perdue', 'alert', 2000);
    }
    this.endTimer = outcome === 'abandoned' ? 0 : outcome === 'success' || outcome === 'voluntary' ? 1.1 : 1.0;
    this.pendingResult = sim.getResult();
  }

  // --- conseils intégrés -------------------------------------------------------
  private tips(): void {
    const seen = this.d.tipsSeen();
    const sim = this.sim;
    const hud = this.d.hud;
    let text = '';
    if (!seen.has('move')) {
      text = this.d.isTouch ? 'Glisse le pouce dans la zone du bas pour piloter' : 'Flèches ou ZQSD / WASD pour piloter';
      if (sim.speed > 40) this.d.markTip('move');
    } else if (!seen.has('collect')) {
      text = 'Approche les fragments : l’aimant les attire tout seul';
    } else if (!seen.has('mine')) {
      let near = false;
      for (const dep of sim.deposits) {
        if (dep.remaining > 0 && Math.hypot(dep.x - sim.ship.x, dep.y - sim.ship.y) < 230) near = true;
      }
      if (near) text = 'Reste près d’un gisement (roche à cristaux) pour l’extraire';
    } else if (!seen.has('deposit') && sim.cargo.used > 0) {
      const st = sim.level.station;
      if (sim.cargo.isFull || Math.hypot(st.x - sim.ship.x, st.y - sim.ship.y) < 260) {
        text = 'Entre dans l’anneau et reste immobile pour déposer';
      }
    }
    hud.setTip(text);
  }

  // --- rendu ---------------------------------------------------------------------
  private render(dt: number): void {
    const sim = this.sim;
    const cam = this.cameras.main;
    const s = sim.ship;

    // caméra : lissage exponentiel
    const tgt = this.targetCenter();
    const k = 1 - Math.exp(-9 * dt);
    this.center.cx += (tgt.cx - this.center.cx) * k;
    this.center.cy += (tgt.cy - this.center.cy) * k;
    const snap = 1 / view.k;
    cam.centerOn(Math.round(this.center.cx / snap) * snap, Math.round(this.center.cy / snap) * snap);
    this.far.setPosition(this.center.cx, this.center.cy).setTilePosition(this.center.cx * 0.2, this.center.cy * 0.2);
    this.near.setPosition(this.center.cx, this.center.cy).setTilePosition(this.center.cx * 0.45, this.center.cy * 0.45);

    // vaisseau et propulseurs
    this.pulse = Math.max(0, this.pulse - dt);
    const sc = 1 + (this.pulse > 0 ? 0.08 * (this.pulse / 0.12) : 0);
    this.shipImg.setPosition(s.x, s.y).setRotation(s.angle).setScale(0.5 * sc);
    this.shipImg.setAlpha(s.invuln > 0 ? 0.45 + 0.55 * (Math.sin(this.elapsed * 40) > 0 ? 1 : 0.2) : 1);
    const moving = Math.min(1, sim.speed / sim.stats.maxSpeed);
    const sin = Math.sin(s.angle);
    const cos = Math.cos(s.angle);
    // positions des tuyères (repère du vaisseau tourné de s.angle ; avant = -y local)
    const nx = (lx: number, ly: number) => s.x + lx * cos - ly * sin;
    const ny = (lx: number, ly: number) => s.y + lx * sin + ly * cos;
    const flick = 0.85 + Math.random() * 0.3;
    const gs = (0.35 + moving * 0.7) * flick;
    this.glowL.setPosition(nx(-6, 22), ny(-6, 22)).setScale(gs * 0.3).setAlpha(0.5 + moving * 0.5);
    this.glowR.setPosition(nx(6, 22), ny(6, 22)).setScale(gs * 0.3).setAlpha(0.5 + moving * 0.5);
    if (sim.speed > 25) {
      this.thrustAcc += dt;
      if (this.thrustAcc > (this.d.lowFx ? 0.09 : 0.045)) {
        this.thrustAcc = 0;
        const back = s.angle + Math.PI / 2;
        this.fx.emit(nx(-6, 24), ny(-6, 24), { count: 1, color: ORANGE, speed: 70, life: 0.3, size: 0.4, angle: back, cone: 0.25, alpha: 0.7 });
        this.fx.emit(nx(6, 24), ny(6, 24), { count: 1, color: ORANGE, speed: 70, life: 0.3, size: 0.4, angle: back, cone: 0.25, alpha: 0.7 });
      }
    }

    // gisements : se réduisent à mesure qu'on les exploite
    for (const dep of sim.deposits) {
      const img = this.depSprites.get(dep.id);
      if (!img) continue;
      const ratio = dep.remaining / dep.amount;
      img.setScale(0.5 * (dep.remaining > 0 ? 0.62 + 0.38 * ratio : 0.5));
      img.setAlpha(dep.remaining > 0 ? 1 : 0.35);
      img.setTint(dep.remaining > 0 ? 0xffffff : 0x667088);
    }

    this.syncFragments();
    this.drawOverlays(dt);
    this.fx.update(dt);
  }

  private syncFragments(): void {
    const sim = this.sim;
    const live = new Set<number>();
    for (const f of sim.fragments) {
      live.add(f.id);
      let img = this.fragSprites.get(f.id);
      if (!img) {
        img = this.freeFrag.pop() ?? this.add.image(0, 0, 'frag0').setDepth(DEPTH.frag);
        img.setTexture(`frag${f.variant}`).setVisible(true);
        this.fragSprites.set(f.id, img);
      }
      const bob = f.attracted ? 0 : Math.sin(this.elapsed * 3 + f.id) * 1.4;
      img.setPosition(f.x, f.y + bob).setRotation(f.attracted ? this.elapsed * 8 + f.id : f.id * 0.7 + Math.sin(this.elapsed * 1.5 + f.id) * 0.15);
      img.setScale(f.attracted ? 0.5 : 0.5 + Math.sin(this.elapsed * 4 + f.id) * 0.02);
    }
    for (const [id, img] of this.fragSprites) {
      if (!live.has(id)) {
        img.setVisible(false);
        this.freeFrag.push(img);
        this.fragSprites.delete(id);
      }
    }
  }

  private drawOverlays(dt: number): void {
    const sim = this.sim;
    const g = this.gfx;
    const s = sim.ship;
    g.clear();

    // anneau de dépôt
    const st = sim.level.station;
    const pulse = 0.5 + 0.5 * Math.sin(this.elapsed * 2.4);
    g.fillStyle(CYAN, sim.inRing ? 0.12 : 0.05 + pulse * 0.03);
    g.fillCircle(st.x, st.y, st.ringR);
    g.lineStyle(3, CYAN, 0.45 + pulse * 0.3);
    g.strokeCircle(st.x, st.y, st.ringR);
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2 + this.elapsed * 0.3;
      g.fillStyle(0x9ff6fb, 0.55);
      g.fillCircle(st.x + Math.cos(a) * (st.ringR + 6), st.y + Math.sin(a) * (st.ringR + 6), 1.6);
    }
    const prog = sim.stationProgress();
    if (prog) {
      const col = prog.kind === 'deposit' ? ORANGE : 0x6ee7a8;
      g.lineStyle(6, col, 0.95);
      g.beginPath();
      g.arc(st.x, st.y, st.ringR + 12, -Math.PI / 2, -Math.PI / 2 + prog.value * Math.PI * 2, false);
      g.strokePath();
    }

    // portée de l'aimant
    const r = sim.stats.magnetRange;
    g.lineStyle(1.5, CYAN, 0.16);
    g.strokeCircle(s.x, s.y, r);
    g.fillStyle(CYAN, 0.035);
    g.fillCircle(s.x, s.y, r);

    // filaments d'attraction
    let n = 0;
    g.lineStyle(1.2, 0x9ff6fb, 0.28);
    for (const f of sim.fragments) {
      if (!f.attracted) continue;
      g.lineBetween(f.x, f.y, s.x, s.y);
      if (++n >= 16) break;
    }

    // rayon d'extraction et jauge
    const t = sim.target;
    if (t) {
      const full = sim.cargo.isFull;
      const col = full ? CORAL : CYAN;
      const dx = t.x - s.x;
      const dy = t.y - s.y;
      const len = Math.hypot(dx, dy) || 1;
      const ex = t.x - (dx / len) * t.r * 0.8;
      const ey = t.y - (dy / len) * t.r * 0.8;
      const sx = s.x + (dx / len) * 12;
      const sy = s.y + (dy / len) * 12;
      if (sim.extracting) {
        const flick = 0.6 + 0.4 * Math.sin(this.elapsed * 30);
        g.lineStyle(5, col, 0.25 * flick);
        g.lineBetween(sx, sy, ex, ey);
        g.lineStyle(2, 0xdffcff, 0.9);
        g.lineBetween(sx, sy, ex, ey);
        this.beamAcc += dt;
        if (this.beamAcc > (this.d.lowFx ? 0.14 : 0.07)) {
          this.beamAcc = 0;
          this.fx.emit(ex, ey, { count: 1, color: 0xbff8ff, speed: 60, life: 0.3, size: 0.45 });
        }
      } else {
        g.lineStyle(1.5, col, 0.4);
        g.lineBetween(sx, sy, ex, ey);
      }
      g.lineStyle(4, 0xffffff, 0.12);
      g.strokeCircle(t.x, t.y, t.r + 9);
      g.lineStyle(4, col, 0.95);
      g.beginPath();
      g.arc(t.x, t.y, t.r + 9, -Math.PI / 2, -Math.PI / 2 + Math.min(1, t.progress) * Math.PI * 2, false);
      g.strokePath();
    }

    // tempête
    const sg = this.stormGfx;
    sg.clear();
    if (sim.stormStarted && sim.stormFront > 1) {
      const front = sim.stormFront;
      const w = sim.level.world.w;
      sg.fillStyle(CORAL, 0.1);
      sg.fillRect(0, 0, w, front);
      for (let i = 1; i <= 4; i++) {
        sg.fillStyle(CORAL, 0.06 * i);
        sg.fillRect(0, front - i * 14, w, 14);
      }
      sg.lineStyle(4, CORAL, 0.95);
      sg.beginPath();
      for (let x = 0; x <= w; x += 20) {
        const y = front + Math.sin(x * 0.05 + this.elapsed * 4) * 5;
        if (x === 0) sg.moveTo(x, y);
        else sg.lineTo(x, y);
      }
      sg.strokePath();
    }
  }
}
