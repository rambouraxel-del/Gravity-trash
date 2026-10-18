import Phaser from 'phaser';
import { LOGICAL_H, LOGICAL_W, view } from './view';

/** Fond animé derrière les menus : étoiles en lente dérive et lumière froide. */
export class BackdropScene extends Phaser.Scene {
  private far!: Phaser.GameObjects.TileSprite;
  private near!: Phaser.GameObjects.TileSprite;
  private t = 0;
  private hero!: Phaser.GameObjects.Image;
  private glow!: Phaser.GameObjects.Image;

  constructor() {
    super('Backdrop');
  }

  create(): void {
    const cam = this.cameras.main;
    cam.setZoom(view.k);
    cam.centerOn(LOGICAL_W / 2, LOGICAL_H / 2);
    cam.setBackgroundColor(0x070d1c);
    this.add.image(LOGICAL_W / 2, 90, 'glow').setScale(9, 6).setTint(0x4a78d8).setAlpha(0.2);
    this.add.image(LOGICAL_W / 2, LOGICAL_H - 40, 'glow').setScale(10, 4).setTint(0xff9a3c).setAlpha(0.07);
    this.far = this.add.tileSprite(LOGICAL_W / 2, LOGICAL_H / 2, LOGICAL_W, LOGICAL_H, 'stars1').setTileScale(0.5);
    this.near = this.add.tileSprite(LOGICAL_W / 2, LOGICAL_H / 2, LOGICAL_W, LOGICAL_H, 'stars2').setTileScale(0.5);
    this.far.setTileScale(0.5);
    this.add.image(LOGICAL_W / 2 + 70, 120, 'station').setScale(0.9).setAlpha(0.85).setRotation(0.2);
    this.hero = this.add.image(LOGICAL_W / 2 - 40, 235, 'ship').setScale(1.1).setRotation(-0.25);
    this.glow = this.add.image(0, 0, 'glow').setTint(0xff9a3c).setBlendMode(Phaser.BlendModes.ADD).setScale(0.55).setAlpha(0.8);
  }

  update(_time: number, delta: number): void {
    this.t += delta / 1000;
    this.far.tilePositionY -= delta * 0.008;
    this.near.tilePositionY -= delta * 0.02;
    this.far.tilePositionX += Math.sin(this.t * 0.1) * 0.05;
    const bob = Math.sin(this.t * 1.3) * 6;
    this.hero.setPosition(LOGICAL_W / 2 - 40, 235 + bob);
    this.glow.setPosition(this.hero.x + 8, this.hero.y + 36).setAlpha(0.6 + Math.sin(this.t * 14) * 0.15);
  }
}
