// Contrôleur de l'application : enchaîne écrans, sauvegarde, sortie et audio.
import Phaser from 'phaser';
import { statsFromLevels } from './config/balance';
import { getRegion, type Branch } from './config/regions';
import { AudioManager } from './audio/audio';
import { Controls } from './input/controls';
import {
  activeRegion,
  applyDeposit,
  deliver,
  deliveryStatus,
  openNextRegion,
  purchaseUpgrade,
  transitionStatus,
  type TxResult,
} from './logic/economy';
import { generateLevel } from './logic/level';
import { cloneSave, createDefaultSave, type SaveData } from './logic/save-model';
import { Sim, type SimResult } from './logic/sim';
import { RunScene, type RunDeps } from './scenes/RunScene';
import { SaveStore, type LoadResult } from './storage/storage';
import { Hud } from './ui/hud';
import {
  ScreenManager,
  endScreen,
  fmt,
  homeScreen,
  pauseScreen,
  recoveryScreen,
  settingsScreen,
  summaryScreen,
  workshopScreen,
} from './ui/screens';

type ScreenName = 'home' | 'workshop' | 'summary' | 'pause' | 'settings' | 'end' | 'recovery' | 'none';

export class App {
  save: SaveData;
  readonly audio = new AudioManager();
  readonly hud = new Hud();
  readonly controls: Controls;
  readonly screens: ScreenManager;
  /** Multiplicateur de temps (panneau développeur uniquement). */
  timeScale = 1;

  private game: Phaser.Game;
  private store: SaveStore;
  private banner = document.getElementById('banner') as HTMLElement;
  private screen: ScreenName = 'none';
  private settingsFrom: ScreenName = 'home';
  private runScene: RunScene | null = null;
  private sim: Sim | null = null;
  private inRun = false;
  private paused = false;
  private confirmAbandon = false;
  private lastSummary: { r: SimResult; tons: number; lostTons: number } | null = null;
  private flashBranch: Branch | null = null;
  private notice = '';
  private interrupted = false;
  private txCounter = 0;
  private isTouch = window.matchMedia('(pointer: coarse)').matches;

  constructor(game: Phaser.Game, store: SaveStore, load: LoadResult) {
    this.game = game;
    this.store = store;
    this.save = load.data ?? createDefaultSave();
    this.controls = new Controls(this.hud.zone, this.hud.controls, this.hud.base, this.hud.knob);
    this.screens = new ScreenManager(
      document.getElementById('screen') as HTMLElement,
      (a, el) => this.onAction(a, el),
      (k, v) => this.onRange(k, v),
    );
    this.hud.pauseBtn.addEventListener('click', () => this.pause());
    this.hud.endBtn.addEventListener('click', () => this.endRunVoluntarily());
    this.applySettings();

    // premier geste : déblocage de l'audio
    const unlock = () => {
      this.audio.unlock();
    };
    window.addEventListener('pointerdown', unlock, { capture: true });
    window.addEventListener('keydown', unlock, { capture: true });

    // arrière-plan / interruption : pause automatique
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.pause();
        this.audio.setSuspended(true);
      } else {
        this.audio.setSuspended(false);
      }
    });
    window.addEventListener('pagehide', () => this.pause());
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape' || e.code === 'KeyP') {
        if (this.inRun && !this.paused) this.pause();
        else if (this.inRun && this.paused && this.screen === 'pause') this.resume();
      }
    });

    this.boot(load);
  }

  // ---------------------------------------------------------------- démarrage
  private boot(load: LoadResult): void {
    if (load.status === 'corrupt') {
      this.go('recovery', { backupAvailable: load.backupAvailable });
      return;
    }
    if (load.status === 'unavailable') this.showBanner('Stockage indisponible : session non persistante, la progression sera perdue à la fermeture.', 'warn');
    if (load.status === 'new') this.persist();
    if (this.save.runInProgress) {
      // fermeture complète pendant une sortie : dépôts conservés, cargaison perdue, rien à rejouer
      this.interrupted = true;
      this.save = { ...this.save, runInProgress: null };
      this.persist();
    }
    this.audio.applySettings(this.save.settings);
    this.go('home');
  }

  private showBanner(text: string, kind: 'warn' | 'info' = 'warn'): void {
    this.banner.textContent = text;
    this.banner.className = `banner ${kind === 'info' ? 'info' : ''}`;
    this.banner.hidden = false;
    window.setTimeout(() => (this.banner.hidden = true), 6000);
  }

  // ---------------------------------------------------------------- persistance
  private persist(): boolean {
    const r = this.store.save(this.save);
    if (!r.ok && this.store.persistent === false && !this.warnedPersist) {
      this.warnedPersist = true;
      this.showBanner('Sauvegarde impossible : la progression de cette session ne sera pas conservée.', 'warn');
    }
    return r.ok;
  }
  private warnedPersist = false;

  get persistent(): boolean {
    return this.store.persistent;
  }

  private txId(prefix: string): string {
    return `${prefix}:${this.save.profileId.slice(0, 8)}:${Date.now().toString(36)}:${++this.txCounter}`;
  }

  /** Applique un résultat de transaction ; en cas d'échec, rien ne change. */
  private apply(r: TxResult): boolean {
    if (r.ok) {
      this.save = r.state;
      this.persist();
      return true;
    }
    return false;
  }

  // ---------------------------------------------------------------- navigation
  go(name: ScreenName, extra?: { backupAvailable?: boolean; message?: string; resetScroll?: boolean }): void {
    this.screen = name;
    const s = this.save;
    switch (name) {
      case 'home':
        this.audio.setMusic('menu');
        this.screens.show(
          homeScreen({
            hasProgress: s.runsStarted > 0 || s.stock.stone > 0 || s.levels.cargo + s.levels.magnet + s.levels.engine + s.levels.hull > 0,
            interrupted: this.interrupted,
            persistent: this.store.persistent,
          }),
        );
        break;
      case 'workshop': {
        this.audio.setMusic('menu');
        const region = activeRegion(s);
        const firstTip =
          !s.tipsSeen.includes('buy') &&
          s.runsCompleted > 0 &&
          s.levels.cargo + s.levels.magnet + s.levels.engine + s.levels.hull === 0 &&
          s.stock[region.material] >= 40;
        this.screens.show(
          workshopScreen(s, { flashBranch: this.flashBranch, firstTip, persistent: this.store.persistent, message: extra?.message ?? this.notice }),
          extra?.resetScroll === true,
        );
        this.flashBranch = null;
        this.notice = '';
        break;
      }
      case 'summary':
        if (this.lastSummary) {
          const { r, tons, lostTons } = this.lastSummary;
          this.screens.show(
            summaryScreen(s, r, {
              tons,
              lostTons,
              saved: this.store.persistent,
              firstRun: s.runsCompleted <= 1,
              canOpen: transitionStatus(s).canOpen,
            }),
          );
        }
        break;
      case 'pause': {
        const sim = this.sim;
        this.screens.show(
          pauseScreen(s, {
            used: sim?.cargo.used ?? 0,
            cap: sim?.cargo.capacity ?? 0,
            remaining: sim?.remaining ?? 0,
            confirmAbandon: this.confirmAbandon,
          }),
        );
        break;
      }
      case 'settings':
        this.screens.show(settingsScreen(s, { fromRun: this.settingsFrom === 'pause', unlocked: this.audio.unlocked }));
        break;
      case 'end':
        this.audio.setMusic('menu');
        this.screens.show(endScreen(s));
        break;
      case 'recovery':
        this.screens.show(recoveryScreen({ backupAvailable: extra?.backupAvailable ?? false }));
        break;
      case 'none':
        this.screens.clear();
        break;
    }
  }

  // ---------------------------------------------------------------- actions
  private onAction(action: string, el: HTMLElement): void {
    if (action !== 'abandon') this.confirmAbandon = false;
    if (action !== 'play') this.audio.sfx('click');
    switch (action) {
      case 'play':
        this.audio.unlock();
        if (this.save.runsStarted === 0) this.launch();
        else this.go('workshop');
        break;
      case 'home':
        this.go('home');
        break;
      case 'to-workshop':
        this.go('workshop');
        break;
      case 'launch':
        this.launch();
        break;
      case 'buy': {
        const branch = el.dataset.branch as Branch;
        if (this.apply(purchaseUpgrade(this.save, branch, this.txId(`buy-${branch}`)))) {
          this.audio.sfx('purchase');
          this.flashBranch = branch;
          this.markTip('buy');
        }
        this.go('workshop');
        break;
      }
      case 'deliver': {
        const st = deliveryStatus(this.save);
        const amount = el.dataset.amount === 'max' ? st.maxDeliverable : Number(el.dataset.amount);
        if (amount >= 1 && this.apply(deliver(this.save, amount, this.txId('deliver')))) this.audio.sfx('deliver');
        this.go('workshop', { resetScroll: transitionStatus(this.save).canOpen });
        break;
      }
      case 'open-region':
        if (this.apply(openNextRegion(this.save, this.txId('open-region')))) {
          this.audio.sfx('unlock');
          this.go('end');
        } else {
          this.go('workshop');
        }
        break;
      case 'show-end':
        this.go('end');
        break;
      case 'settings':
        this.settingsFrom = this.screen === 'pause' ? 'pause' : this.screen;
        this.go('settings');
        break;
      case 'settings-back':
        this.go(this.settingsFrom === 'pause' ? 'pause' : this.settingsFrom === 'none' ? 'home' : this.settingsFrom);
        break;
      case 'toggle-muted':
        this.updateSettings({ muted: !this.save.settings.muted });
        this.go('settings');
        break;
      case 'toggle-lowfx':
        this.updateSettings({ lowFx: !this.save.settings.lowFx });
        this.go('settings');
        break;
      case 'side':
        this.updateSettings({ joystickSide: el.dataset.side === 'left' ? 'left' : 'right' });
        this.go('settings');
        break;
      case 'reset-tips':
        this.save = { ...this.save, tipsSeen: [] };
        this.persist();
        this.showBanner('Les conseils seront réaffichés.', 'info');
        break;
      case 'resume-run':
        this.resume();
        break;
      case 'abandon':
        if (!this.confirmAbandon) {
          this.confirmAbandon = true;
          this.go('pause');
        } else {
          this.confirmAbandon = false;
          this.abandonRun();
        }
        break;
      case 'recover-backup': {
        const r = this.store.restoreBackup();
        if (r.data) {
          this.save = r.data;
          this.showBanner('Dernière copie valide restaurée.', 'info');
          this.audio.applySettings(this.save.settings);
          this.go('home');
        } else {
          this.go('recovery', { backupAvailable: false });
        }
        break;
      }
      case 'recover-fresh':
        this.save = this.store.startFresh();
        this.go('home');
        break;
    }
  }

  private onRange(key: string, value: number): void {
    if (key === 'musicVolume' || key === 'sfxVolume') this.updateSettings({ [key]: Math.max(0, Math.min(100, Math.round(value))) });
  }

  private updateSettings(patch: Partial<SaveData['settings']>): void {
    this.save = { ...this.save, settings: { ...this.save.settings, ...patch } };
    this.persist();
    this.applySettings();
  }

  private applySettings(): void {
    this.audio.applySettings(this.save.settings);
    this.controls.setSide(this.save.settings.joystickSide);
  }

  markTip(key: string): void {
    if (this.save.tipsSeen.includes(key)) return;
    this.save = { ...this.save, tipsSeen: [...this.save.tipsSeen, key] };
    this.persist();
  }

  // ---------------------------------------------------------------- sortie
  private launch(): void {
    if (this.inRun) return;
    const s = this.save;
    const region = activeRegion(s);
    const runNo = s.runsStarted + 1;
    const runId = `run-${s.profileId.slice(0, 8)}-${runNo}-${Date.now().toString(36)}`;
    this.save = { ...cloneSave(s), runsStarted: runNo, runInProgress: runId };
    this.persist();
    this.interrupted = false;

    const sim = new Sim({
      runId,
      seed: runNo,
      level: generateLevel(runNo),
      stats: statsFromLevels(this.save.levels),
      hardness: region.hardness,
    });
    this.sim = sim;
    this.inRun = true;
    this.paused = false;
    this.confirmAbandon = false;
    this.go('none');
    this.screen = 'none';
    this.hud.show();
    this.hud.setJoystickHint(this.isTouch ? 'Glisse ici pour piloter' : 'Glisse ici ou utilise les flèches / ZQSD');
    this.controls.setSide(this.save.settings.joystickSide);
    this.controls.reset();
    this.controls.enabled = true;
    this.audio.setMusic('run');
    this.audio.setDuck(false);

    const deps: RunDeps = {
      sim,
      controls: this.controls,
      hud: this.hud,
      audio: this.audio,
      lowFx: this.save.settings.lowFx,
      isTouch: this.isTouch,
      tonsPerFragment: region.tonsPerFragment,
      materialName: region.materialName,
      timeScale: () => this.timeScale,
      tipsSeen: () => new Set(this.save.tipsSeen),
      markTip: (k) => this.markTip(k),
      onDeposit: (fragments, txId) => this.onDeposit(fragments, txId),
      onEnd: (r) => this.onRunEnd(r),
    };
    this.game.scene.stop('Backdrop');
    this.game.scene.start('Run', deps);
    this.runScene = this.game.scene.getScene('Run') as RunScene;
  }

  private onDeposit(fragments: number, txId: string): number {
    const region = activeRegion(this.save);
    const r = applyDeposit(this.save, txId, fragments);
    if (r.ok) {
      this.save = r.state;
      this.persist();
      return fragments * region.tonsPerFragment;
    }
    return 0;
  }

  private onRunEnd(r: SimResult): void {
    if (!this.inRun) return;
    this.inRun = false;
    this.paused = false;
    this.controls.enabled = false;
    this.controls.reset();
    const region = activeRegion(this.save);
    this.save = { ...this.save, runInProgress: null, runsCompleted: this.save.runsCompleted + 1 };
    const saved = this.persist();
    this.hud.hide();
    this.game.scene.stop('Run');
    this.game.scene.start('Backdrop');
    this.runScene = null;
    this.sim = null;
    this.lastSummary = {
      r,
      tons: r.depositedFragments * region.tonsPerFragment,
      lostTons: r.lostFragments * region.tonsPerFragment,
    };
    void saved;
    this.audio.setMusic('menu');
    this.go('summary');
  }

  private endRunVoluntarily(): void {
    if (!this.inRun || this.paused || !this.sim) return;
    this.sim.requestEnd();
  }

  private abandonRun(): void {
    if (!this.sim || !this.runScene) return;
    this.sim.abandon();
    // la scène traite l'événement « end » à la prochaine image ; on débloque sa boucle
    this.paused = false;
    this.runScene.paused = false;
    this.screens.clear();
    this.screen = 'none';
  }

  pause(): void {
    if (!this.inRun || this.paused || !this.runScene) return;
    this.paused = true;
    this.runScene.paused = true;
    this.controls.reset();
    this.controls.enabled = false;
    this.audio.setDuck(true);
    this.go('pause');
  }

  resume(): void {
    if (!this.inRun || !this.paused || !this.runScene) return;
    this.paused = false;
    this.confirmAbandon = false;
    this.screens.clear();
    this.screen = 'none';
    this.runScene.paused = false;
    this.controls.reset();
    this.controls.enabled = true;
    this.audio.setDuck(false);
  }

  // ---------------------------------------------------------------- outils développeur
  devAddStone(tons: number): void {
    const region = getRegion(this.save.activeRegion);
    const s = cloneSave(this.save);
    s.stock[region.material] += tons;
    this.save = s;
    this.persist();
    if (this.screen === 'workshop') this.go('workshop');
  }

  devMaxUpgrades(): void {
    const s = cloneSave(this.save);
    const cap = getRegion(s.activeRegion).levelCap;
    for (const b of ['cargo', 'magnet', 'engine', 'hull'] as const) s.levels[b] = cap;
    this.save = s;
    this.persist();
    if (this.screen === 'workshop') this.go('workshop');
  }

  devReset(): void {
    this.save = this.store.wipe();
    this.interrupted = false;
    this.go('home');
  }

  devRawSave(): string {
    return this.store.rawMain() ?? '(vide)';
  }

  get debugState(): { screen: string; inRun: boolean; paused: boolean; sim: Sim | null } {
    return { screen: this.screen, inRun: this.inRun, paused: this.paused, sim: this.sim };
  }
}

export { fmt };
