import Phaser from 'phaser';
import { BUILDINGS, BUILDING_IDS, type BuildingId } from '../config/buildings';
import type { SaveData } from '../logic/save-model';
import { LOGICAL_H, LOGICAL_W, view } from './view';

const CYAN = 0x3ee6f0;

/** Vue 2D fixe de la station : les modules apparaissent automatiquement à leur emplacement. */
export class StationScene extends Phaser.Scene {
  private far!: Phaser.GameObjects.TileSprite;
  private near!: Phaser.GameObjects.TileSprite;
  private mods = new Map<BuildingId, Phaser.GameObjects.Image>();
  private links!: Phaser.GameObjects.Graphics;
  private relay!: Phaser.GameObjects.Image;
  private relayGlow!: Phaser.GameObjects.Image;
  private ship!: Phaser.GameObjects.Image;
  private pad!: Phaser.GameObjects.Graphics;
  private drone!: Phaser.GameObjects.Image;
  private smoke!: Phaser.GameObjects.Image[];
  private state: SaveData | null = null;
  private shown = new Map<BuildingId, number>();
  private t = 0;

  constructor() {
    super('Station');
  }

  create(): void {
    const cam = this.cameras.main;
    cam.setZoom(view.k);
    cam.centerOn(LOGICAL_W / 2, LOGICAL_H / 2);
    cam.setBackgroundColor(0x070d1c);
    this.add.image(LOGICAL_W / 2, 150, 'glow').setScale(9, 6).setTint(0x4a78d8).setAlpha(0.2);
    this.add.image(LOGICAL_W / 2, 560, 'glow').setScale(10, 6).setTint(0xff9a3c).setAlpha(0.06);
    this.far = this.add.tileSprite(LOGICAL_W / 2, LOGICAL_H / 2, LOGICAL_W, LOGICAL_H, 'stars1').setTileScale(0.5);
    this.near = this.add.tileSprite(LOGICAL_W / 2, LOGICAL_H / 2, LOGICAL_W, LOGICAL_H, 'stars2').setTileScale(0.5);

    // coeur de la station
    this.add.image(LOGICAL_W / 2, 395, 'station').setScale(0.9).setAlpha(0.55);
    this.links = this.add.graphics();
    for (const id of BUILDING_IDS) {
      const slot = BUILDINGS[id].slot;
      this.mods.set(id, this.add.image(slot.x, slot.y, 'slot_empty').setScale(0.5));
    }
    this.relayGlow = this.add.image(195, 130, 'glow').setTint(0xffd27a).setBlendMode(Phaser.BlendModes.ADD).setScale(3).setAlpha(0);
    this.relay = this.add.image(195, 135, 'relay_scaffold').setScale(0.5);
    this.pad = this.add.graphics();
    this.ship = this.add.image(195, 660, 'ship').setScale(0.6);
    this.drone = this.add.image(320, 560, 'drone').setScale(0.5).setVisible(false);
    this.smoke = [0, 1, 2, 3].map(() => this.add.image(320, 270, 'glow').setTint(0xaab4d0).setScale(0.25).setAlpha(0));
    this.refresh();
  }

  setState(s: SaveData): void {
    this.state = s;
    if (this.sys.isActive()) this.refresh();
  }

  private refresh(): void {
    const s = this.state;
    if (!s || !this.mods.size) return;
    for (const id of BUILDING_IDS) {
      const lvl = s.buildings[id];
      const img = this.mods.get(id) as Phaser.GameObjects.Image;
      const key = lvl > 0 ? `mod_${id}_${lvl}` : 'slot_empty';
      if (this.shown.get(id) !== lvl) {
        img.setTexture(key);
        // apparition : léger éclat lorsque le niveau change
        if (this.shown.has(id)) {
          img.setScale(0.35);
          this.tweens.add({ targets: img, scale: 0.5, duration: 420, ease: 'Back.Out' });
        }
        this.shown.set(id, lvl);
      }
      img.setAlpha(lvl > 0 ? 1 : 0.75);
    }
    // liaisons
    const g = this.links;
    g.clear();
    for (const id of BUILDING_IDS) {
      if (id === 'workshop') continue;
      const a = BUILDINGS.workshop.slot;
      const b = BUILDINGS[id].slot;
      const lit = s.buildings[id] > 0;
      g.lineStyle(lit ? 7 : 3, lit ? 0x24407a : 0x1a2442, 1);
      g.lineBetween(a.x, a.y, b.x, b.y);
      if (lit) {
        g.lineStyle(2, CYAN, 0.6);
        g.lineBetween(a.x, a.y, b.x, b.y);
      }
    }
    // relais orbital
    const built = s.project.done;
    this.relay.setTexture(built ? 'relay_built' : 'relay_scaffold').setAlpha(s.flags.projectOpen || built ? 1 : 0.5);
    this.relayGlow.setAlpha(built ? 0.5 : 0);
    // drone
    this.drone.setVisible(s.drone.built && s.drone.status !== 'working');
    // plateforme
    const p = this.pad;
    p.clear();
    p.lineStyle(3, CYAN, 0.7);
    p.strokeCircle(195, 660, 44);
    p.lineStyle(1.5, 0xff9a3c, 0.8);
    p.strokeCircle(195, 660, 34);
  }

  update(_time: number, delta: number): void {
    const dt = delta / 1000;
    this.t += dt;
    this.far.tilePositionY -= delta * 0.006;
    this.near.tilePositionY -= delta * 0.016;
    const s = this.state;
    if (!s) return;
    this.ship.setY(660 + Math.sin(this.t * 1.4) * 3);
    if (s.drone.built && s.drone.status !== 'working') {
      this.drone.setPosition(320 + Math.cos(this.t * 0.9) * 26, 560 + Math.sin(this.t * 1.7) * 10);
    }
    const busy = s.refinery.jobs.some((j) => j.remaining > 0) && s.buildings.refinery > 0;
    this.smoke.forEach((sm, i) => {
      if (!busy) {
        sm.setAlpha(0);
        return;
      }
      const ph = (this.t * 0.5 + i / this.smoke.length) % 1;
      sm.setPosition(318 + Math.sin(ph * 6 + i) * 6, 276 - ph * 50).setScale(0.2 + ph * 0.35).setAlpha(0.35 * (1 - ph));
    });
    this.relayGlow.setScale(3 + Math.sin(this.t * 2) * 0.2);
  }
}
