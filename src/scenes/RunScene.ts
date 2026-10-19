import Phaser from 'phaser';
import { ELECTRIC_ACTIVE_AT, ELECTRIC_PERIOD, ELECTRIC_WARN_AT, LASER_RANGE } from '../config/balance';
import { ITEM_INFO, sumItems, type Items } from '../config/items';
import type { SectorConfig } from '../config/sectors';
import type { Sim, SimEvent, SimResult, Poi } from '../logic/sim';
import type { Controls } from '../input/controls';
import type { Hud } from '../ui/hud';
import type { AudioManager } from '../audio/audio';
import { Fx } from './fx';
import { LOGICAL_H, LOGICAL_W, PLAY_H, view } from './view';

export interface RunDeps {
  sim: Sim;
  sector: SectorConfig;
  controls: Controls;
  hud: Hud;
  audio: AudioManager;
  lowFx: boolean;
  isTouch: boolean;
  hasEquipment: boolean;
  timeScale: () => number;
  tipsSeen: () => ReadonlySet<string>;
  markTip: (key: string) => void;
  onDiscover: (poi: Poi) => void;
  onUnique: (id: string) => void;
  onEnd: (result: SimResult) => void;
}

const DEPTH = { nebula: -18, stars: -19, zone: 1, station: 2, deposit: 3, wreck: 3, frag: 4, obstacle: 5, beam: 6, heavy: 7, ship: 8, fx: 9 };
const CYAN = 0x3ee6f0;
const CORAL = 0xff6b5e;
const ORANGE = 0xff9a3c;
const GREEN = 0xb6ff5a;
const VIOLET = 0xb38cff;

const itemsText = (items: Items): string =>
  (Object.entries(items) as [keyof typeof ITEM_INFO, number][])
    .filter(([, n]) => n > 0)
    .slice(0, 4)
    .map(([k, n]) => `${ITEM_INFO[k].icon} +${n}`)
    .join('  ');

const POI_LABEL: Record<Poi['kind'], string> = {
  deposit: 'Gisement',
  wreck: 'Grande épave',
  heavy: 'Objet lourd',
  radiation: 'Poche de radiation',
  electric: 'Courant électrique',
  field: 'Champ d’astéroïdes instables',
};

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
  private depSprites = new Map<string, Phaser.GameObjects.Image>();
  private wreckSprites = new Map<string, Phaser.GameObjects.Image>();
  private heavySprites = new Map<string, Phaser.GameObjects.Image>();
  private driftSprites = new Map<number, Phaser.GameObjects.Image>();
  private gfx!: Phaser.GameObjects.Graphics;
  private zoneGfx!: Phaser.GameObjects.Graphics;
  private fx!: Fx;
  private center = { cx: 0, cy: 0 };
  private elapsed = 0;
  private thrustAcc = 0;
  private beamAcc = 0;
  private finished = false;
  private endTimer = 0;
  private pendingResult: SimResult | null = null;
  private pulse = 0;
  private lastZoneWarn = 0;
  private wasInRad = false;
  private discoverQueue: string[] = [];
  private discoverAt = 0;
  private collected = false;

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
    this.wreckSprites = new Map();
    this.heavySprites = new Map();
    this.driftSprites = new Map();
    this.freeFrag = [];
    this.collected = false;
    this.discoverQueue = [];
    this.wasInRad = false;
  }

  create(): void {
    const sim = this.sim;
    const pal = this.d.sector.palette;
    const { w, h } = sim.level.world;
    const cam = this.cameras.main;
    cam.setZoom(view.k);
    cam.setBackgroundColor(pal.bg);

    this.add.image(w / 2, 400, 'glow').setScale(26, 18).setTint(pal.glow).setAlpha(0.16).setDepth(DEPTH.nebula);
    this.add.image(w * 0.2, h * 0.5, 'glow').setScale(18, 26).setTint(pal.glow2).setAlpha(0.08).setDepth(DEPTH.nebula);
    this.add.image(w * 0.8, h * 0.28, 'glow').setScale(18, 22).setTint(pal.glow).setAlpha(0.07).setDepth(DEPTH.nebula);
    this.add.image(w / 2, h - 120, 'glow').setScale(22, 7).setTint(ORANGE).setAlpha(0.06).setDepth(DEPTH.nebula);
    this.far = this.add.tileSprite(0, 0, LOGICAL_W + 8, LOGICAL_H + 8, 'stars1').setDepth(DEPTH.stars).setTileScale(0.5).setTint(pal.stars);
    this.near = this.add.tileSprite(0, 0, LOGICAL_W + 8, LOGICAL_H + 8, 'stars2').setDepth(DEPTH.stars).setTileScale(0.5).setTint(pal.stars);

    const border = this.add.graphics().setDepth(DEPTH.nebula);
    border.lineStyle(4, pal.border, 0.55);
    border.strokeRect(2, 2, w - 4, h - 4);
    border.lineStyle(10, pal.border, 0.1);
    border.strokeRect(5, 5, w - 10, h - 10);

    this.zoneGfx = this.add.graphics().setDepth(DEPTH.zone);
    this.gfx = this.add.graphics().setDepth(DEPTH.beam);

    const st = sim.level.station;
    this.add.image(st.x, st.y, 'station').setScale(0.5).setDepth(DEPTH.station);

    for (const o of sim.obstacles) {
      const size = (o.r * 2 * 100) / 92;
      this.add.image(o.x, o.y, `obs${o.variant}`).setDisplaySize(size, size).setRotation(((o.x + o.y) * 0.01) % (Math.PI * 2)).setDepth(DEPTH.obstacle);
    }
    for (const dp of sim.drifters) {
      const size = (dp.r * 2 * 100) / 92;
      this.driftSprites.set(dp.id, this.add.image(dp.x, dp.y, `obs${dp.variant}`).setDisplaySize(size, size).setDepth(DEPTH.obstacle));
    }
    for (const dep of sim.deposits) {
      this.depSprites.set(dep.id, this.add.image(dep.x, dep.y, `dep_${dep.res}_${dep.variant % 2}`).setScale(0.5).setDepth(DEPTH.deposit).setRotation(dep.x * 0.01));
    }
    for (const wr of sim.wrecks) {
      this.wreckSprites.set(wr.id, this.add.image(wr.x, wr.y, `wreck${wr.variant}`).setScale((wr.r / 52) * 0.5).setDepth(DEPTH.wreck));
    }
    for (const hv of sim.heavies) {
      this.heavySprites.set(hv.id, this.add.image(hv.x, hv.y, 'container').setScale(0.5).setDepth(DEPTH.heavy));
    }

    this.glowL = this.add.image(0, 0, 'glow').setTint(ORANGE).setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.ship - 1);
    this.glowR = this.add.image(0, 0, 'glow').setTint(ORANGE).setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.ship - 1);
    this.shipImg = this.add.image(sim.ship.x, sim.ship.y, 'ship').setScale(0.5).setDepth(DEPTH.ship);
    this.fx = new Fx(this, this.d.lowFx ? 30 : 80, DEPTH.fx);

    this.center = this.targetCenter();
    cam.centerOn(this.center.cx, this.center.cy);
    this.d.hud.reset();
    this.d.hud.setEquipment(sim.equipment);
    this.d.audio.startRunLoops();
    this.d.audio.setDanger(0);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.d.audio.stopRunLoops();
      this.d.audio.setDanger(0);
    });
  }

  private targetCenter(): { cx: number; cy: number } {
    const { w, h } = this.sim.level.world;
    const s = this.sim.ship;
    const cx = Math.min(Math.max(s.x, LOGICAL_W / 2), w - LOGICAL_W / 2);
    const cy = Math.min(Math.max(s.y + (LOGICAL_H / 2 - 325), LOGICAL_H / 2), h - PLAY_H + LOGICAL_H / 2);
    return { cx, cy };
  }

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
    this.flushDiscoveries();
    this.render(dtReal);
    const speed01 = Math.min(1, sim.speed / sim.stats.maxSpeed);
    this.d.audio.updateRunLoops(speed01, sim.extracting);
    this.d.audio.setDanger(this.dangerLevel());
    this.d.hud.update(sim, this.center, performance.now());
    this.tips();
  }

  private dangerLevel(): number {
    const s = this.sim.ship;
    let danger = 0;
    for (const z of [...this.sim.radiation, ...this.sim.electric]) {
      const d = Math.hypot(s.x - z.x, s.y - z.y) - z.r;
      if (d < 0) danger = Math.max(danger, 0.85);
      else if (d < 90) danger = Math.max(danger, 0.45 * (1 - d / 90));
    }
    if (this.sim.ship.hull <= 1) danger = Math.min(1, danger + 0.25);
    return danger;
  }

  private onEvent(e: SimEvent): void {
    const { audio, hud } = this.d;
    const sim = this.sim;
    switch (e.type) {
      case 'collect':
        audio.sfx('collect');
        hud.bumpCargo();
        this.pulse = 0.12;
        this.fx.emit(sim.ship.x, sim.ship.y - 6, { count: 3, color: ITEM_INFO[e.res].color, speed: 70, life: 0.3, size: 0.55 });
        if (!this.collected) {
          this.collected = true;
          this.d.markTip('collect');
        }
        break;
      case 'extract':
        audio.sfx(sim.equipment === 'laser' && sim.target && 'queue' in sim.target ? 'laser' : 'extract');
        this.fx.emit(e.x, e.y, { count: 4, color: ITEM_INFO[e.res].color, speed: 50, life: 0.35, size: 0.6 });
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
        this.fx.emit(e.x, e.y, { count: this.d.lowFx ? 5 : 10, color: e.source === 'radiation' ? GREEN : e.source === 'electric' ? VIOLET : CORAL, speed: 120, life: 0.4, size: 0.8 });
        if (!this.d.lowFx) this.cameras.main.shake(90, 0.0025);
        if (e.source === 'radiation') hud.toast('La radiation abîme la coque — sors de la zone !', 'alert', 2200);
        if (e.source === 'electric') hud.toast('Décharge électrique ! Attends l’accalmie.', 'alert', 2200);
        break;
      case 'deposit': {
        audio.sfx('deposit');
        const st = sim.level.station;
        const n = sumItems(e.accepted);
        this.fx.flow(sim.ship.x, sim.ship.y, st.x, st.y, Math.min(this.d.lowFx ? 12 : 26, n * 2), 0x9ff6fb);
        hud.toast(`Déposé : ${itemsText(e.accepted)}`, 'good', 2800);
        this.d.markTip('deposit');
        break;
      }
      case 'storageFull':
        audio.sfx('full');
        hud.toast('Entrepôt plein : vends ou transforme du stock à la station. Le surplus reste à bord.', 'warn', 5200);
        break;
      case 'repair':
        audio.sfx('repair');
        hud.toast('Coque réparée', 'good', 1800);
        break;
      case 'discover':
        this.d.onDiscover(e.poi);
        this.discoverQueue.push(e.poi.kind === 'deposit' && e.poi.res ? `Gisement de ${ITEM_INFO[e.poi.res].name.toLowerCase()}` : POI_LABEL[e.poi.kind]);
        break;
      case 'unique':
        this.d.onUnique(e.id);
        audio.sfx('unlock');
        hud.toast('Objet unique récupéré — il ne reviendra pas !', 'good', 3600);
        break;
      case 'heavyGrab':
        audio.sfx('extract');
        hud.toast(`${ITEM_INFO[e.res].icon} Objet lourd saisi — ramène-le dans l’anneau de la station`, 'info', 4200);
        break;
      case 'heavyDelivered':
        audio.sfx('deposit');
        hud.toast(`Objet lourd récupéré : ${ITEM_INFO[e.res].icon} +${e.amount}`, 'good', 3200);
        break;
      case 'laserHint':
        hud.toast('Cette épave demande le laser de découpe (atelier niveau 2).', 'info', 4800);
        break;
      case 'end':
        this.onEnd(e.outcome);
        break;
    }
  }

  private flushDiscoveries(): void {
    if (this.discoverQueue.length === 0) return;
    const now = performance.now();
    if (now - this.discoverAt < 1800) return;
    this.discoverAt = now;
    const first = this.discoverQueue[0];
    const more = this.discoverQueue.length - 1;
    this.discoverQueue = [];
    this.d.audio.sfx('discover');
    this.d.hud.toast(`Scanner : ${first}${more > 0 ? ` (+${more})` : ''}`, 'info', 2400);
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
      this.d.hud.toast('Vaisseau détruit — rapatriement, cargaison perdue', 'alert', 2000);
    } else if (outcome === 'emergency') {
      this.d.hud.toast('Rapatriement d’urgence — cargaison perdue', 'alert', 1800);
    }
    this.endTimer = outcome === 'emergency' ? 0 : outcome === 'docked' ? 0.9 : 1.0;
    this.pendingResult = sim.getResult();
  }

  private tips(): void {
    const seen = this.d.tipsSeen();
    const sim = this.sim;
    let text = '';
    if (!seen.has('move')) {
      text = this.d.isTouch ? 'Glisse le pouce dans la zone du bas pour piloter' : 'Flèches ou ZQSD / WASD pour piloter';
      if (sim.speed > 40) this.d.markTip('move');
    } else if (!seen.has('collect')) {
      text = 'Approche les fragments : l’aimant les attire tout seul';
    } else if (!seen.has('mine')) {
      let near = false;
      for (const dep of sim.deposits) if (dep.remaining > 0 && Math.hypot(dep.x - sim.ship.x, dep.y - sim.ship.y) < 260) near = true;
      if (near) text = 'Reste près d’un gisement (roche massive) pour l’extraire';
    } else if (!seen.has('deposit') && sim.cargo.used > 0) {
      if (sim.cargo.isFull || sim.stationDistance < 300) text = 'Entre dans l’anneau de la station et reste immobile pour déposer';
    }
    this.d.hud.setTip(text);
  }

  // --- rendu -------------------------------------------------------------------
  private render(dt: number): void {
    const sim = this.sim;
    const cam = this.cameras.main;
    const s = sim.ship;

    const tgt = this.targetCenter();
    const k = 1 - Math.exp(-9 * dt);
    this.center.cx += (tgt.cx - this.center.cx) * k;
    this.center.cy += (tgt.cy - this.center.cy) * k;
    const snap = 1 / view.k;
    cam.centerOn(Math.round(this.center.cx / snap) * snap, Math.round(this.center.cy / snap) * snap);
    this.far.setPosition(this.center.cx, this.center.cy).setTilePosition(this.center.cx * 0.2, this.center.cy * 0.2);
    this.near.setPosition(this.center.cx, this.center.cy).setTilePosition(this.center.cx * 0.45, this.center.cy * 0.45);

    this.pulse = Math.max(0, this.pulse - dt);
    const sc = 1 + (this.pulse > 0 ? 0.08 * (this.pulse / 0.12) : 0);
    this.shipImg.setPosition(s.x, s.y).setRotation(s.angle).setScale(0.5 * sc);
    this.shipImg.setAlpha(s.invuln > 0 ? 0.45 + 0.55 * (Math.sin(this.elapsed * 40) > 0 ? 1 : 0.2) : 1);
    const moving = Math.min(1, sim.speed / sim.stats.maxSpeed);
    const sin = Math.sin(s.angle);
    const cos = Math.cos(s.angle);
    const nx = (lx: number, ly: number) => s.x + lx * cos - ly * sin;
    const ny = (lx: number, ly: number) => s.y + lx * sin + ly * cos;
    const gs = (0.35 + moving * 0.7) * (0.85 + Math.random() * 0.3);
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

    for (const dep of sim.deposits) {
      const img = this.depSprites.get(dep.id);
      if (!img) continue;
      const ratio = dep.remaining / dep.amount;
      img.setScale(0.5 * (dep.remaining > 0 ? 0.62 + 0.38 * ratio : 0.5));
      img.setAlpha(dep.remaining > 0 ? 1 : 0.35);
      img.setTint(dep.remaining > 0 ? 0xffffff : 0x667088);
    }
    for (const [id, img] of this.wreckSprites) {
      const wr = sim.wrecks.find((x) => x.id === id);
      if (!wr) continue;
      const empty = wr.queue.length === 0;
      img.setAlpha(empty ? 0.4 : 1).setTint(empty ? 0x667088 : 0xffffff);
    }
    for (const dp of sim.drifters) this.driftSprites.get(dp.id)?.setPosition(dp.x, dp.y).setRotation(this.elapsed * 0.6 + dp.id);
    for (const [id, img] of this.heavySprites) {
      const hv = sim.heavies.find((x) => x.id === id);
      if (!hv) {
        img.destroy();
        this.heavySprites.delete(id);
        continue;
      }
      img.setPosition(hv.x, hv.y).setRotation(hv.held ? Math.sin(this.elapsed * 3) * 0.15 : id.length * 0.4 + Math.sin(this.elapsed + id.length) * 0.05);
    }

    this.syncFragments();
    this.drawOverlays(dt);
    this.zoneWarnings();
    this.fx.update(dt);
  }

  private syncFragments(): void {
    const sim = this.sim;
    const live = new Set<number>();
    for (const f of sim.fragments) {
      live.add(f.id);
      let img = this.fragSprites.get(f.id);
      if (!img) {
        img = this.freeFrag.pop() ?? this.add.image(0, 0, `frag_${f.res}_0`).setDepth(DEPTH.frag);
        img.setTexture(`frag_${f.res}_${f.variant}`).setVisible(true);
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

  private zoneWarnings(): void {
    const sim = this.sim;
    const s = sim.ship;
    const inRad = sim.radiation.some((z) => Math.hypot(s.x - z.x, s.y - z.y) < z.r);
    const now = performance.now();
    if (inRad && !this.wasInRad && now - this.lastZoneWarn > 2500) {
      this.lastZoneWarn = now;
      this.d.audio.sfx('warning');
      this.d.hud.toast('Zone de radiation — la coque s’use ici. Ressources précieuses, mais sors vite !', 'alert', 3200);
    }
    this.wasInRad = inRad;
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
      g.lineStyle(6, prog.kind === 'deposit' ? ORANGE : 0x6ee7a8, 0.95);
      g.beginPath();
      g.arc(st.x, st.y, st.ringR + 12, -Math.PI / 2, -Math.PI / 2 + prog.value * Math.PI * 2, false);
      g.strokePath();
    }

    // portées : aimant (cyan) et laser (orange) selon l'équipement
    const r = sim.stats.magnetRange;
    g.lineStyle(1.5, CYAN, 0.16);
    g.strokeCircle(s.x, s.y, r);
    g.fillStyle(CYAN, 0.035);
    g.fillCircle(s.x, s.y, r);
    if (sim.equipment === 'laser') {
      g.lineStyle(1.2, ORANGE, 0.18);
      g.strokeCircle(s.x, s.y, LASER_RANGE + 13);
    }

    let n = 0;
    g.lineStyle(1.2, 0x9ff6fb, 0.28);
    for (const f of sim.fragments) {
      if (!f.attracted) continue;
      g.lineBetween(f.x, f.y, s.x, s.y);
      if (++n >= 16) break;
    }

    // rayon d'extraction / découpe et jauge
    const t = sim.target;
    if (t) {
      const isWreck = 'queue' in t;
      const full = sim.cargo.isFull;
      const col = full ? CORAL : isWreck ? ORANGE : CYAN;
      const dx = t.x - s.x;
      const dy = t.y - s.y;
      const len = Math.hypot(dx, dy) || 1;
      const ex = t.x - (dx / len) * t.r * 0.8;
      const ey = t.y - (dy / len) * t.r * 0.8;
      const sx = s.x + (dx / len) * 12;
      const sy = s.y + (dy / len) * 12;
      if (sim.extracting) {
        const flick = 0.6 + 0.4 * Math.sin(this.elapsed * 30);
        g.lineStyle(isWreck ? 6 : 5, col, 0.3 * flick);
        g.lineBetween(sx, sy, ex, ey);
        g.lineStyle(2, isWreck ? 0xfff0d8 : 0xdffcff, 0.9);
        g.lineBetween(sx, sy, ex, ey);
        this.beamAcc += dt;
        if (this.beamAcc > (this.d.lowFx ? 0.14 : 0.07)) {
          this.beamAcc = 0;
          this.fx.emit(ex, ey, { count: 1, color: isWreck ? 0xffd9a0 : 0xbff8ff, speed: 60, life: 0.3, size: 0.45 });
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

    // tracteur
    if (sim.held) {
      g.lineStyle(4, VIOLET, 0.3);
      g.lineBetween(s.x, s.y, sim.held.x, sim.held.y);
      g.lineStyle(1.6, 0xefe2ff, 0.9);
      g.lineBetween(s.x, s.y, sim.held.x, sim.held.y);
    }

    this.drawZones();
  }

  private drawZones(): void {
    const sim = this.sim;
    const z = this.zoneGfx;
    z.clear();
    const t = this.elapsed;
    for (const r of sim.radiation) {
      const p = 0.5 + 0.5 * Math.sin(t * 1.6 + r.x);
      z.fillStyle(GREEN, 0.05 + 0.03 * p);
      z.fillCircle(r.x, r.y, r.r);
      z.lineStyle(3, GREEN, 0.35 + 0.25 * p);
      z.strokeCircle(r.x, r.y, r.r);
      z.lineStyle(1.5, GREEN, 0.25);
      z.strokeCircle(r.x, r.y, r.r * 0.55);
      // symbole : trois secteurs
      for (let i = 0; i < 3; i++) {
        const a0 = (i * 2 * Math.PI) / 3 + t * 0.15;
        z.fillStyle(GREEN, 0.18);
        z.slice(r.x, r.y, 22, a0, a0 + Math.PI / 3, false);
        z.fillPath();
      }
    }
    for (const e of sim.electric) {
      const st = sim.electricState(e);
      const base = st === 'active' ? 0.16 : st === 'warn' ? (Math.sin(t * 28) > 0 ? 0.12 : 0.03) : 0.04;
      z.fillStyle(VIOLET, base);
      z.fillCircle(e.x, e.y, e.r);
      z.lineStyle(st === 'active' ? 4 : 2.5, st === 'idle' ? 0x6a5aa8 : 0xe6dcff, st === 'idle' ? 0.5 : 0.95);
      z.strokeCircle(e.x, e.y, e.r);
      if (st === 'active') {
        z.lineStyle(2.4, 0xffffff, 0.9);
        for (let k = 0; k < 6; k++) {
          const a = (k / 6) * Math.PI * 2 + t * 3;
          let x = e.x;
          let y = e.y;
          z.beginPath();
          z.moveTo(x, y);
          for (let seg = 1; seg <= 5; seg++) {
            const rr = (seg / 5) * e.r;
            x = e.x + Math.cos(a + (Math.random() - 0.5) * 0.5) * rr;
            y = e.y + Math.sin(a + (Math.random() - 0.5) * 0.5) * rr;
            z.lineTo(x, y);
          }
          z.strokePath();
        }
      } else if (st === 'warn') {
        z.lineStyle(2, 0xffd27a, 0.9);
        z.strokeCircle(e.x, e.y, e.r * (0.75 + 0.25 * (((sim.time + e.phase) % ELECTRIC_PERIOD) - ELECTRIC_WARN_AT) / (ELECTRIC_ACTIVE_AT - ELECTRIC_WARN_AT)));
      }
    }
    // auras de fuite des épaves
    for (const w of sim.wrecks) {
      if (!w.leaking || w.queue.length === 0) continue;
      z.lineStyle(1.5, GREEN, 0.3);
      z.strokeCircle(w.x, w.y, w.r + 12);
    }
  }
}
