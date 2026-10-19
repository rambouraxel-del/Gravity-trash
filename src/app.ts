// Contrôleur de l'application : enchaîne écrans, sauvegarde, expéditions et minuteries en temps réel.
import Phaser from 'phaser';
import { BUILDING_IDS, type BuildingId } from './config/buildings';
import { MAX_SHIP_LEVEL, type DroneStat, type EquipmentId, type Branch } from './config/balance';
import { MAJOR_CONTRACTS } from './config/contracts';
import { ITEMS, sumItems, type ItemId, type ResourceId } from './config/items';
import { getSector, SECTORS, type SectorId } from './config/sectors';
import { AudioManager } from './audio/audio';
import { Controls } from './input/controls';
import { abandonContract, acceptMajor, acceptOffer, completeContract, deliverToContract, ensureBoard } from './logic/contracts';
import { buildDrone, collectDrone, launchMission, recallDrone, upgradeDrone } from './logic/drone';
import { depositCargo, receiveHeavy, sellItem } from './logic/inventory';
import { generateSector } from './logic/level';
import { completeProject, contribute, markSuccessSeen } from './logic/project';
import { deliverJobOutput, maxBatch, startJob } from './logic/refinery';
import { cloneSave, createDefaultSave, type SaveData } from './logic/save-model';
import { Sim, type Poi, type SimResult } from './logic/sim';
import { buyEquipment, equip, purchaseShipUpgrade, shipStats } from './logic/ship';
import { buildOrUpgrade } from './logic/station';
import { tickTimers, withDiscoveries, withUniqueDone, withVisited } from './logic/timers';
import { storageCap, type TxResult } from './logic/tx';
import { RunScene, type RunDeps } from './scenes/RunScene';
import { StationScene } from './scenes/StationScene';
import { SaveStore, type LoadResult } from './storage/storage';
import { Hud } from './ui/hud';
import {
  ScreenManager,
  hangarScreen,
  mapScreen,
  officeScreen,
  pauseScreen,
  projectScreen,
  recoveryScreen,
  refineryScreen,
  settingsScreen,
  stationScreen,
  successScreen,
  summaryScreen,
  warehouseScreen,
  workshopScreen,
  type UiCtx,
} from './ui/screens';
import { fmtTime, pct } from './ui/format';

type ScreenName =
  | 'station' | 'workshop' | 'warehouse' | 'refinery' | 'office' | 'hangar' | 'project' | 'map'
  | 'summary' | 'pause' | 'settings' | 'success' | 'recovery' | 'none';

const PANELS: ScreenName[] = ['station', 'workshop', 'warehouse', 'refinery', 'office', 'hangar', 'project', 'map'];

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
  private settingsFrom: ScreenName = 'station';
  private runScene: RunScene | null = null;
  private sim: Sim | null = null;
  private runSector: SectorId = 'belt';
  private runDiscoveredAtStart = 0;
  private inRun = false;
  private paused = false;
  private ui: UiCtx = { officeTab: 'contracts', droneSector: null, droneRes: null, flash: null, message: '', persistent: true, confirmEmergency: false };
  private lastSummary: { r: SimResult; sector: SectorId; newDiscoveries: number } | null = null;
  private interrupted = false;
  private txCounter = 0;
  private isTouch = window.matchMedia('(pointer: coarse)').matches;
  private lastTick = performance.now();
  private lastPersist = performance.now();
  private signature = '';
  private warnedPersist = false;
  private forceEnd = false;

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

    const unlock = () => this.audio.unlock();
    window.addEventListener('pointerdown', unlock, { capture: true });
    window.addEventListener('keydown', unlock, { capture: true });

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.pause();
        this.audio.setSuspended(true);
        this.persist();
      } else {
        this.audio.setSuspended(false);
        this.lastTick = performance.now();
      }
    });
    window.addEventListener('pagehide', () => {
      this.pause();
      this.persist();
    });
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape' || e.code === 'KeyP') {
        if (this.inRun && !this.paused) this.pause();
        else if (this.inRun && this.paused && this.screen === 'pause') this.resume();
      }
    });

    window.setInterval(() => this.clockTick(), 250);
    this.boot(load);
  }

  // ---------------------------------------------------------------- démarrage
  private boot(load: LoadResult): void {
    if (load.status === 'corrupt') {
      this.go('recovery', { backupAvailable: load.backupAvailable });
      return;
    }
    if (load.status === 'unavailable') this.showBanner('Stockage indisponible : session non persistante, la progression sera perdue à la fermeture.', 'warn');
    if (this.save.runInProgress) {
      this.interrupted = true;
      this.save = { ...this.save, runInProgress: null };
    }
    this.save = ensureBoard(this.save);
    if (load.status === 'new' || this.interrupted) this.persist();
    this.audio.applySettings(this.save.settings);
    this.go('station');
    if (this.interrupted) this.showBanner('Ta dernière expédition a été interrompue : la cargaison non déposée est perdue, le reste est intact.', 'info');
    if (this.save.project.done && !this.save.project.successSeen) this.go('success');
  }

  private showBanner(text: string, kind: 'warn' | 'info' = 'warn'): void {
    this.banner.textContent = text;
    this.banner.className = `banner ${kind === 'info' ? 'info' : ''}`;
    this.banner.hidden = false;
    window.setTimeout(() => (this.banner.hidden = true), 6500);
  }

  // ---------------------------------------------------------------- persistance
  private persist(): boolean {
    this.lastPersist = performance.now();
    const r = this.store.save(this.save);
    if (!r.ok && !this.store.persistent && !this.warnedPersist) {
      this.warnedPersist = true;
      this.showBanner('Sauvegarde impossible : la progression de cette session ne sera pas conservée.', 'warn');
    }
    this.ui.persistent = this.store.persistent;
    return r.ok;
  }

  private txId(prefix: string): string {
    return `${prefix}:${this.save.profileId.slice(0, 8)}:${Date.now().toString(36)}:${++this.txCounter}`;
  }

  /** Applique un résultat de transaction ; en cas d'échec, rien ne change et un message est affiché. */
  private apply(r: TxResult, flash?: string): boolean {
    if (r.ok) {
      this.save = r.state;
      this.persist();
      this.ui.flash = flash ?? null;
      if (r.note) this.ui.message = r.note;
      return true;
    }
    this.ui.message = r.message;
    return false;
  }

  // ---------------------------------------------------------------- navigation
  get stationScene(): StationScene | null {
    const sc = this.game.scene.getScene('Station') as StationScene | null;
    return sc ?? null;
  }

  go(name: ScreenName, extra?: { backupAvailable?: boolean; resetScroll?: boolean }): void {
    this.screen = name;
    const s = this.save;
    const ctx = this.ui;
    ctx.persistent = this.store.persistent;
    if (PANELS.includes(name)) {
      this.audio.setMusic('menu');
      this.stationScene?.setState(s);
    }
    let html = '';
    switch (name) {
      case 'station': html = stationScreen(s, ctx); break;
      case 'workshop': html = workshopScreen(s, ctx); break;
      case 'warehouse': html = warehouseScreen(s, ctx); break;
      case 'refinery': html = refineryScreen(s, ctx); break;
      case 'office': html = officeScreen(s, ctx); break;
      case 'hangar': html = hangarScreen(s, ctx); break;
      case 'project': html = projectScreen(s, ctx); break;
      case 'map': html = mapScreen(s, ctx); break;
      case 'summary':
        if (this.lastSummary) html = summaryScreen(s, this.lastSummary.r, { sector: this.lastSummary.sector, saved: this.store.persistent, newDiscoveries: this.lastSummary.newDiscoveries });
        break;
      case 'pause':
        html = pauseScreen(s, {
          used: this.sim?.cargo.used ?? 0,
          cap: this.sim?.cargo.capacity ?? 0,
          confirm: ctx.confirmEmergency,
          sector: this.runSector,
          discovered: this.sim?.discovered.size ?? 0,
        });
        break;
      case 'settings': html = settingsScreen(s, { fromRun: this.settingsFrom === 'pause' }); break;
      case 'success':
        this.audio.sfx('unlock');
        html = successScreen(s);
        break;
      case 'recovery': html = recoveryScreen({ backupAvailable: extra?.backupAvailable ?? false }); break;
      case 'none': this.screens.clear(); break;
    }
    if (html) this.screens.show(html, extra?.resetScroll === true);
    ctx.message = '';
    ctx.flash = null;
    this.signature = this.computeSignature();
  }

  /** Redessine l'écran courant (après un changement d'état). */
  private refresh(resetScroll = false): void {
    if (this.screen !== 'none' && this.screen !== 'recovery') this.go(this.screen, { resetScroll });
  }

  // ---------------------------------------------------------------- actions
  private onAction(action: string, el: HTMLElement): void {
    if (action !== 'emergency') this.ui.confirmEmergency = false;
    if (action !== 'play') this.audio.sfx('click');
    const d = el.dataset;
    const flashed = (key: string) => key;
    switch (action) {
      case 'open':
        if (d.panel === 'settings') {
          this.settingsFrom = this.screen === 'pause' ? 'pause' : 'station';
          this.go('settings');
        } else this.go(d.panel as ScreenName);
        break;
      case 'station':
        this.go('station');
        break;
      case 'settings':
        this.settingsFrom = this.screen === 'pause' ? 'pause' : (this.screen === 'none' ? 'station' : this.screen);
        this.go('settings');
        break;
      case 'settings-back':
        this.go(this.settingsFrom === 'pause' ? 'pause' : this.settingsFrom === 'none' ? 'station' : this.settingsFrom);
        break;

      case 'build': {
        const id = d.building as BuildingId;
        if (this.apply(buildOrUpgrade(this.save, id, this.txId(`build-${id}`)), flashed(`b:${id}`))) {
          this.save = ensureBoard(this.save);
          this.audio.sfx('build');
        }
        this.refresh();
        break;
      }
      case 'ship-up': {
        const b = d.branch as Branch;
        if (this.apply(purchaseShipUpgrade(this.save, b, this.txId(`ship-${b}`)), `s:${b}`)) this.audio.sfx('purchase');
        this.refresh();
        break;
      }
      case 'eq-buy': {
        const e = d.eq as EquipmentId;
        if (this.apply(buyEquipment(this.save, e, this.txId(`eq-${e}`)), `e:${e}`)) this.audio.sfx('purchase');
        this.refresh();
        break;
      }
      case 'equip': {
        const e = d.eq === 'none' ? null : (d.eq as EquipmentId);
        this.apply(equip(this.save, e, this.txId('equip')), e ? `e:${e}` : undefined);
        this.refresh();
        break;
      }
      case 'job': {
        const recipe = d.recipe as 'ingots' | 'cells' | 'techparts';
        const qty = d.qty === 'max' ? maxBatch(this.save, recipe) : Number(d.qty);
        if (this.apply(startJob(this.save, recipe, qty, this.txId(`job-${recipe}`)))) this.audio.sfx('build');
        this.refresh();
        break;
      }
      case 'office-tab':
        this.ui.officeTab = d.tab === 'sales' ? 'sales' : 'contracts';
        this.refresh();
        break;
      case 'accept-offer':
        if (this.apply(acceptOffer(this.save, d.id as string, this.txId('accept')), `c:${d.id}`)) this.audio.sfx('click');
        this.refresh();
        break;
      case 'accept-major':
        if (this.apply(acceptMajor(this.save, d.id as string, this.txId('accept-major')), `c:${d.id}`)) this.audio.sfx('contract');
        this.refresh();
        break;
      case 'deliver': {
        const contract = this.save.contracts.active.find((c) => c.id === d.id);
        if (this.apply(deliverToContract(this.save, d.id as string, this.txId('deliver')), `c:${contract?.templateId.startsWith('m') && contract.kind === 'major' ? contract.templateId : d.id}`)) this.audio.sfx('deliver');
        this.refresh();
        break;
      }
      case 'complete': {
        const prevUnlocked = this.save.sectors.unlocked.length;
        if (this.apply(completeContract(this.save, d.id as string, this.txId('complete')))) {
          this.audio.sfx('contract');
          if (this.save.sectors.unlocked.length > prevUnlocked) this.showBanner('Nouveau secteur débloqué : consulte la carte !', 'info');
        }
        this.refresh();
        break;
      }
      case 'abandon':
        this.apply(abandonContract(this.save, d.id as string, this.txId('abandon')));
        this.refresh();
        break;
      case 'sell': {
        const item = d.item as ItemId;
        const qty = d.qty === 'all' ? this.save.stock[item] : Number(d.qty);
        if (this.apply(sellItem(this.save, item, qty, this.txId(`sell-${item}`)))) this.audio.sfx('sell');
        this.refresh();
        break;
      }

      case 'drone-build':
        if (this.apply(buildDrone(this.save, this.txId('drone-build')))) this.audio.sfx('build');
        this.refresh();
        break;
      case 'drone-up': {
        const stat = d.stat as DroneStat;
        if (this.apply(upgradeDrone(this.save, stat, this.txId(`drone-${stat}`)), `d:${stat}`)) this.audio.sfx('purchase');
        this.refresh();
        break;
      }
      case 'drone-sector':
        this.ui.droneSector = d.sector as SectorId;
        this.ui.droneRes = null;
        this.refresh();
        break;
      case 'drone-res':
        this.ui.droneRes = d.res as ResourceId;
        this.refresh();
        break;
      case 'drone-launch':
        if (this.apply(launchMission(this.save, d.sector as SectorId, d.res as ResourceId, this.txId('drone-launch')))) this.audio.sfx('contract');
        this.refresh();
        break;
      case 'drone-recall':
        this.apply(recallDrone(this.save, this.txId('drone-recall')));
        this.refresh();
        break;
      case 'drone-collect':
        if (this.apply(collectDrone(this.save, this.txId('drone-collect')))) this.audio.sfx('deposit');
        this.refresh();
        break;

      case 'project-give':
        if (this.apply(contribute(this.save, d.key as string, this.txId(`project-${d.key}`)))) this.audio.sfx('deliver');
        this.refresh();
        break;
      case 'project-build':
        if (this.apply(completeProject(this.save, this.txId('project-done')))) {
          this.go('success');
        } else this.refresh();
        break;
      case 'success-continue':
        this.save = markSuccessSeen(this.save);
        this.persist();
        this.go('station');
        break;

      case 'launch':
        this.audio.unlock();
        this.launch(d.sector as SectorId);
        break;
      case 'resume-run':
        this.resume();
        break;
      case 'emergency':
        if (!this.ui.confirmEmergency) {
          this.ui.confirmEmergency = true;
          this.go('pause');
        } else {
          this.ui.confirmEmergency = false;
          this.emergency();
        }
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
        this.updateSettings({ joystickSide: d.side === 'left' ? 'left' : 'right' });
        this.go('settings');
        break;
      case 'reset-tips':
        this.save = { ...this.save, tipsSeen: [] };
        this.persist();
        this.showBanner('Les conseils seront réaffichés.', 'info');
        break;
      case 'recover-backup': {
        const r = this.store.restoreBackup();
        if (r.data) {
          this.save = ensureBoard(r.data);
          this.showBanner('Dernière copie valide restaurée.', 'info');
          this.audio.applySettings(this.save.settings);
          this.go('station');
        } else this.go('recovery', { backupAvailable: false });
        break;
      }
      case 'recover-fresh':
        this.save = this.store.startFresh();
        this.go('station');
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

  // ---------------------------------------------------------------- minuteries (raffinerie, drone)
  private computeSignature(): string {
    const s = this.save;
    return JSON.stringify([
      s.refinery.jobs.map((j) => [j.id, j.remaining <= 0, j.delivered]),
      s.drone.status,
      s.drone.status === 'working' ? 0 : s.drone.cargo,
    ]);
  }

  private clockTick(): void {
    const now = performance.now();
    const dt = (now - this.lastTick) / 1000;
    this.lastTick = now;
    if (document.hidden || this.paused || this.screen === 'recovery') return;
    const rep = tickTimers(this.save, dt * this.timeScale);
    this.settleJobs();
    if (rep.droneReturned) {
      this.showBanner('🛸 Ton drone est revenu : vide sa cargaison au hangar.', 'info');
      this.audio.sfx('discover');
    }
    if (now - this.lastPersist > 10000 && (this.save.refinery.jobs.length > 0 || this.save.drone.status === 'working')) this.persist();
    const sig = this.computeSignature();
    if (sig !== this.signature) {
      this.signature = sig;
      if (!this.inRun) this.refresh();
    } else if (!this.inRun) {
      this.updateDynamic();
    }
  }

  /** Verse au stock les productions terminées, dans la limite de l'entrepôt. */
  private settleJobs(): void {
    for (const j of [...this.save.refinery.jobs]) {
      if (j.remaining > 0) continue;
      const r = deliverJobOutput(this.save, j.id);
      if (r.ok) {
        this.save = r.state;
        this.persist();
        this.audio.sfx('repair');
      }
    }
  }

  /** Mises à jour légères sans redessiner (barres de progression de la raffinerie et du drone). */
  private updateDynamic(): void {
    const root = document.getElementById('screen');
    if (!root) return;
    for (const j of this.save.refinery.jobs) {
      const bar = root.querySelector<HTMLElement>(`[data-job-bar="${j.id}"]`);
      if (bar) bar.style.width = `${pct(j.total - j.remaining, j.total)}%`;
      const eta = root.querySelector<HTMLElement>(`[data-job-eta="${j.id}"]`);
      if (eta) eta.textContent = j.remaining <= 0 ? 'Terminé — entrepôt plein, en attente' : fmtTime(j.remaining);
    }
    if (this.save.drone.built) {
      const carried = sumItems(this.save.drone.cargo);
      const lab = root.querySelector<HTMLElement>('[data-drone-cargo]');
      const bar = root.querySelector<HTMLElement>('[data-drone-bar]');
      if (lab) lab.textContent = `${carried}/${[20, 35, 55, 80][this.save.drone.levels.capacity]}`;
      if (bar) bar.style.width = `${pct(carried, [20, 35, 55, 80][this.save.drone.levels.capacity])}%`;
    }
  }

  // ---------------------------------------------------------------- expédition
  private launch(sector: SectorId): void {
    if (this.inRun) return;
    if (!this.save.sectors.unlocked.includes(sector)) return;
    const cfg = getSector(sector);
    const n = this.save.sectors.expeditions + 1;
    const runId = `run-${this.save.profileId.slice(0, 8)}-${n}-${Date.now().toString(36)}`;
    let s = cloneSave(this.save);
    s.sectors.expeditions = n;
    s.runInProgress = runId;
    s = withVisited(s, sector);
    this.save = s;
    this.persist();
    this.interrupted = false;

    const sim = new Sim({
      runId,
      seed: n,
      level: generateSector(sector, n, new Set(this.save.sectors.uniquesDone)),
      stats: shipStats(this.save),
      hardness: cfg.hardness,
      equipment: this.save.ship.equipped,
      discovered: this.save.sectors.discovered[sector],
      hooks: {
        deposit: (txId, contents) => {
          const out = depositCargo(this.save, txId, contents);
          if (out.result.ok) {
            this.save = out.result.state;
            this.persist();
          }
          return out.leftover;
        },
        recoverHeavy: (txId, res, amount) => {
          const r = receiveHeavy(this.save, txId, res, amount);
          if (r.ok) {
            this.save = r.state;
            this.persist();
          }
          return r.ok;
        },
      },
    });
    this.sim = sim;
    this.runSector = sector;
    this.runDiscoveredAtStart = sim.discovered.size;
    this.inRun = true;
    this.paused = false;
    this.forceEnd = false;
    this.ui.confirmEmergency = false;
    this.go('none');
    this.hud.show();
    this.hud.setJoystickHint(this.isTouch ? 'Glisse ici pour piloter' : 'Glisse ici ou utilise les flèches / ZQSD');
    this.hud.setEndLabel('Retour station');
    this.controls.setSide(this.save.settings.joystickSide);
    this.controls.reset();
    this.controls.enabled = true;
    this.audio.setMusic('run');
    this.audio.setDuck(false);

    const deps: RunDeps = {
      sim,
      sector: cfg,
      controls: this.controls,
      hud: this.hud,
      audio: this.audio,
      lowFx: this.save.settings.lowFx,
      isTouch: this.isTouch,
      hasEquipment: this.save.ship.equipped !== null,
      timeScale: () => this.timeScale,
      tipsSeen: () => new Set(this.save.tipsSeen),
      markTip: (k) => this.markTip(k),
      onDiscover: (poi: Poi) => {
        this.save = withDiscoveries(this.save, sector, [poi.id]);
        this.persist();
      },
      onUnique: (id) => {
        this.save = withUniqueDone(this.save, id);
        this.persist();
      },
      onEnd: (r) => this.onRunEnd(r),
    };
    this.game.scene.stop('Station');
    this.game.scene.start('Run', deps);
    this.runScene = this.game.scene.getScene('Run') as RunScene;
  }

  private onRunEnd(r: SimResult): void {
    if (!this.inRun) return;
    this.inRun = false;
    this.paused = false;
    this.controls.enabled = false;
    this.controls.reset();
    this.save = { ...this.save, runInProgress: null };
    this.persist();
    this.hud.hide();
    this.game.scene.stop('Run');
    this.game.scene.start('Station');
    this.runScene = null;
    const newDisc = Math.max(0, (this.sim?.discovered.size ?? 0) - this.runDiscoveredAtStart);
    this.sim = null;
    this.lastSummary = { r, sector: this.runSector, newDiscoveries: newDisc };
    this.save = ensureBoard(this.save);
    this.audio.setMusic('menu');
    this.lastTick = performance.now();
    this.go('summary');
    this.stationScene?.setState(this.save);
  }

  private endRunVoluntarily(): void {
    if (!this.inRun || this.paused || !this.sim) return;
    const res = this.sim.requestEnd(this.forceEnd);
    if (res === 'leftover') {
      this.forceEnd = true;
      const n = this.sim.cargo.used;
      this.hud.setEndLabel(`Quitter (perdre ${n} unité${n > 1 ? 's' : ''})`);
      this.hud.toast('Entrepôt plein : le surplus reste à bord. Libère de la place à la station, ou touche de nouveau pour le perdre.', 'warn', 5200);
    }
  }

  private emergency(): void {
    if (!this.sim || !this.runScene) return;
    this.sim.emergency();
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
    this.ui.confirmEmergency = false;
    this.screens.clear();
    this.screen = 'none';
    this.runScene.paused = false;
    this.controls.reset();
    this.controls.enabled = true;
    this.audio.setDuck(false);
    this.lastTick = performance.now();
  }

  // ---------------------------------------------------------------- outils développeur
  private devSet(mutate: (s: SaveData) => void): void {
    const s = cloneSave(this.save);
    mutate(s);
    this.save = s;
    this.persist();
    this.refresh();
  }
  devAddStock(n: number, all: boolean): void {
    this.devSet((s) => {
      const items: ItemId[] = all ? [...ITEMS] : ['rock', 'scrap'];
      const cap = storageCap(s);
      for (const i of items) s.stock[i] = Math.min(cap, s.stock[i] + n);
    });
  }
  devSetStock(item: ItemId, n: number): void {
    this.devSet((s) => { s.stock[item] = Math.max(0, Math.min(storageCap(s), Math.floor(n))); });
  }
  devAddCredits(n: number): void {
    this.devSet((s) => { s.credits += n; });
  }
  devBuildings(): void {
    this.devSet((s) => { for (const b of BUILDING_IDS) s.buildings[b] = 3; s.flags.hangarUnlocked = true; });
    this.save = ensureBoard(this.save);
    this.refresh();
  }
  devShipMax(): void {
    this.devSet((s) => { for (const b of ['cargo', 'magnet', 'engine', 'hull'] as const) s.ship.levels[b] = MAX_SHIP_LEVEL; });
  }
  devUnlockAll(): void {
    this.devSet((s) => {
      s.sectors.unlocked = SECTORS.map((x) => x.id);
      s.sectors.visited = SECTORS.map((x) => x.id);
      s.contracts.majorsDone = MAJOR_CONTRACTS.filter((m) => m.id !== 'm4-relay').map((m) => m.id);
      s.flags.hangarUnlocked = true;
    });
  }
  devTick(seconds: number): void {
    for (let t = 0; t < seconds; t++) tickTimers(this.save, 1);
    this.settleJobs();
    this.persist();
    this.refresh();
  }
  devReset(): void {
    this.save = this.store.wipe();
    this.interrupted = false;
    this.go('station');
  }
  devRawSave(): string {
    return this.store.rawMain() ?? '(vide)';
  }
  get debugState(): { screen: string; inRun: boolean; paused: boolean; sim: Sim | null } {
    return { screen: this.screen, inRun: this.inRun, paused: this.paused, sim: this.sim };
  }
}
