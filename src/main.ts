import Phaser from 'phaser';
import './styles.css';
import { App } from './app';
import { applyLayout, pickRenderScale } from './layout';
import { BootScene } from './scenes/BootScene';
import { RunScene } from './scenes/RunScene';
import { StationScene } from './scenes/StationScene';
import { LOGICAL_H, LOGICAL_W } from './scenes/view';
import { SaveStore, browserStorage } from './storage/storage';

const u = applyLayout();
const k = pickRenderScale(u);
window.addEventListener('resize', applyLayout);
window.visualViewport?.addEventListener('resize', applyLayout);

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: LOGICAL_W * k,
  height: LOGICAL_H * k,
  backgroundColor: '#070d1c',
  scale: { mode: Phaser.Scale.NONE },
  banner: false,
  audio: { noAudio: true }, // l'audio est géré par AudioManager (Web Audio)
  input: { mouse: false, touch: false, keyboard: false, gamepad: false },
  render: { antialias: true, powerPreference: 'high-performance' },
  fps: { target: 60 },
  scene: [BootScene, StationScene, RunScene],
});

const store = new SaveStore(browserStorage());
const load = store.load();
game.events.once(Phaser.Core.Events.READY, () => {
  const app = new App(game, store, load);
  if (import.meta.env.DEV) {
    void import('./dev/devpanel').then((m) => m.installDevPanel(app));
  }
});
