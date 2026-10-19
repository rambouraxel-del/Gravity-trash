// Simulation d'une expédition libre (sans chronomètre) : pure, sans Phaser.
// Le rendu lit l'état et consomme les événements.
import {
  DEPOSIT_DWELL,
  DEPOSIT_MAX_SPEED,
  ELECTRIC_ACTIVE_AT,
  ELECTRIC_PERIOD,
  ELECTRIC_WARN_AT,
  EXTRACT_DELAY,
  EXTRACT_PERIOD,
  FULL_SLOWDOWN,
  INVULN_TIME,
  KNOCKBACK,
  LASER_RANGE,
  MAX_FRAGMENTS,
  PICKUP_RADIUS,
  SHIP_ACCEL,
  SHIP_BRAKE,
  SHIP_RADIUS,
  TRACTOR_RANGE,
  TRACTOR_SLOWDOWN,
  type EquipmentId,
  type SimStats,
} from '../config/balance';
import { ITEMS, sumItems, type Items, type ResourceId } from '../config/items';
import { Cargo } from './cargo';
import type { SectorLevel } from './level';
import { mulberry32 } from './rng';

export interface SimInput { x: number; y: number }

export interface Fragment { id: number; x: number; y: number; res: ResourceId; variant: number; attracted: boolean; speed: number; swirl: number }
export interface Deposit {
  id: string; x: number; y: number; r: number; res: ResourceId; amount: number; remaining: number;
  progress: number; variant: number; hardness: number; unique?: string;
}
export interface Wreck {
  id: string; x: number; y: number; r: number; queue: ResourceId[]; amount: number; progress: number;
  variant: number; leaking: boolean; hardness: number; unique?: string;
}
export interface Heavy { id: string; x: number; y: number; res: ResourceId; amount: number; unique?: string; held: boolean }
export interface Obstacle { id: string; x: number; y: number; r: number; variant: number }
export interface Drifter { id: number; x: number; y: number; r: number; vx: number; vy: number; fx: number; fy: number; fr: number; variant: number }
export interface Zone { id: string; x: number; y: number; r: number; phase: number }

export type PoiKind = 'deposit' | 'wreck' | 'heavy' | 'radiation' | 'electric' | 'field';
export interface Poi { id: string; kind: PoiKind; x: number; y: number; r: number; res?: ResourceId; unique?: boolean }

export type SimOutcome = 'docked' | 'wrecked' | 'emergency';
export type ExtractTarget = Deposit | Wreck;

export type SimEvent =
  | { type: 'collect'; x: number; y: number; res: ResourceId }
  | { type: 'extract'; x: number; y: number; res: ResourceId }
  | { type: 'depleted'; x: number; y: number }
  | { type: 'full' }
  | { type: 'impact'; source: 'obstacle' | 'drifter' | 'radiation' | 'electric'; x: number; y: number }
  | { type: 'deposit'; txId: string; accepted: Items; leftover: Items }
  | { type: 'storageFull' }
  | { type: 'repair' }
  | { type: 'discover'; poi: Poi }
  | { type: 'unique'; id: string }
  | { type: 'heavyGrab'; res: ResourceId }
  | { type: 'heavyDelivered'; res: ResourceId; amount: number }
  | { type: 'laserHint' }
  | { type: 'end'; outcome: SimOutcome };

export interface SimResult {
  outcome: SimOutcome;
  deposited: Items;
  lost: Items;
  damageTaken: number;
  duration: number;
  discovered: number;
}

export interface SimHooks {
  /** Dépose `contents` à la station ; renvoie ce qui reste à bord (entrepôt plein). */
  deposit(txId: string, contents: Items): Items;
  /** Objet lourd ramené : true si accepté en entier. */
  recoverHeavy(txId: string, res: ResourceId, amount: number): boolean;
}

export interface SimOptions {
  runId: string;
  seed: number;
  level: SectorLevel;
  stats: SimStats;
  hardness: number;
  equipment: EquipmentId | null;
  discovered?: Iterable<string>;
  hooks?: SimHooks;
}

const acceptAll: SimHooks = { deposit: () => ({}), recoverHeavy: () => true };

export class Sim {
  readonly runId: string;
  readonly level: SectorLevel;
  readonly stats: SimStats;
  readonly equipment: EquipmentId | null;
  readonly cargo: Cargo;
  readonly fragments: Fragment[] = [];
  readonly deposits: Deposit[] = [];
  readonly wrecks: Wreck[] = [];
  readonly heavies: Heavy[] = [];
  readonly obstacles: Obstacle[] = [];
  readonly drifters: Drifter[] = [];
  readonly radiation: Zone[] = [];
  readonly electric: Zone[] = [];
  readonly pois: Poi[] = [];
  readonly discovered: Set<string>;

  time = 0;
  ship = { x: 0, y: 0, vx: 0, vy: 0, angle: 0, hull: 0, invuln: 0 };
  target: ExtractTarget | null = null;
  extracting = false;
  held: Heavy | null = null;
  dwell = 0;
  inRing = true;
  ended = false;
  outcome: SimOutcome | null = null;
  deposited: Items = {};
  lost: Items = {};
  damageTaken = 0;
  /** Épave proche sans laser équipé (pour l'indice d'interface). */
  nearWreckNoLaser = false;

  private hooks: SimHooks;
  private events: SimEvent[] = [];
  private presence = 0;
  private radTimer = 0;
  private depositSeq = 0;
  private heavySeq = 0;
  private nextId = 1;
  private scanTimer = 0;
  private rng: () => number;
  private blockedAt = -1;
  private storageWarned = false;
  private hintShown = false;

  constructor(opts: SimOptions) {
    this.runId = opts.runId;
    this.level = opts.level;
    this.stats = opts.stats;
    this.equipment = opts.equipment;
    this.hooks = opts.hooks ?? acceptAll;
    this.cargo = new Cargo(opts.stats.cargoCapacity);
    this.rng = mulberry32(opts.seed * 31 + 5);
    this.discovered = new Set(opts.discovered ?? []);
    const lv = opts.level;
    this.ship.x = lv.station.x;
    this.ship.y = lv.station.y;
    this.ship.hull = opts.stats.hullMax;
    for (const f of lv.fragments) this.fragments.push({ id: this.nextId++, x: f.x, y: f.y, res: f.res, variant: f.variant, attracted: false, speed: 0, swirl: this.rng() < 0.5 ? -1 : 1 });
    for (const d of lv.deposits) {
      this.deposits.push({ id: d.id, x: d.x, y: d.y, r: d.r, res: d.res, amount: d.amount, remaining: d.amount, progress: 0, variant: d.variant, hardness: opts.hardness, unique: d.unique });
      this.pois.push({ id: d.id, kind: 'deposit', x: d.x, y: d.y, r: d.r, res: d.res, unique: !!d.unique });
    }
    for (const w of lv.wrecks) {
      this.wrecks.push({ id: w.id, x: w.x, y: w.y, r: w.r, queue: [...w.queue], amount: w.queue.length, progress: 0, variant: w.variant, leaking: w.leaking, hardness: opts.hardness * 1.2, unique: w.unique });
      this.pois.push({ id: w.id, kind: 'wreck', x: w.x, y: w.y, r: w.r, unique: !!w.unique });
    }
    for (const h of lv.heavies) {
      this.heavies.push({ id: h.id, x: h.x, y: h.y, res: h.res, amount: h.amount, unique: h.unique, held: false });
      this.pois.push({ id: h.id, kind: 'heavy', x: h.x, y: h.y, r: 30, res: h.res, unique: !!h.unique });
    }
    for (const o of lv.obstacles) this.obstacles.push({ id: o.id, x: o.x, y: o.y, r: o.r, variant: o.variant });
    for (const z of lv.radiation) {
      this.radiation.push({ id: z.id, x: z.x, y: z.y, r: z.r, phase: 0 });
      if (!z.id.endsWith('-aura')) this.pois.push({ id: z.id, kind: 'radiation', x: z.x, y: z.y, r: z.r });
    }
    lv.electric.forEach((z, i) => {
      this.electric.push({ id: z.id, x: z.x, y: z.y, r: z.r, phase: (i * 1.37) % ELECTRIC_PERIOD });
      this.pois.push({ id: z.id, kind: 'electric', x: z.x, y: z.y, r: z.r });
    });
    for (const f of lv.fields) {
      this.pois.push({ id: f.id, kind: 'field', x: f.x, y: f.y, r: f.r });
      for (let i = 0; i < f.count; i++) {
        const a = this.rng() * Math.PI * 2;
        const d = Math.sqrt(this.rng()) * (f.r - 20);
        const va = this.rng() * Math.PI * 2;
        const sp = 20 + this.rng() * 25;
        this.drifters.push({ id: this.nextId++, x: f.x + Math.cos(a) * d, y: f.y + Math.sin(a) * d, r: 11 + this.rng() * 5, vx: Math.cos(va) * sp, vy: Math.sin(va) * sp, fx: f.x, fy: f.y, fr: f.r, variant: Math.floor(this.rng() * 3) });
      }
    }
  }

  get speed(): number {
    return Math.hypot(this.ship.vx, this.ship.vy);
  }
  get canEnd(): boolean {
    return !this.ended && this.inRing;
  }
  get stationDistance(): number {
    return Math.hypot(this.ship.x - this.level.station.x, this.ship.y - this.level.station.y);
  }

  drainEvents(): SimEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }

  step(dt: number, input: SimInput): void {
    let rem = Math.min(Math.max(dt, 0), 0.5);
    while (rem > 1e-9 && !this.ended) {
      const h = Math.min(rem, 1 / 60);
      this.tick(h, input);
      rem -= h;
    }
  }

  /**
   * Retour volontaire (dans l'anneau). Dépose la cargaison ; s'il reste des unités à bord (entrepôt plein)
   * l'expédition ne se termine que si `force` est vrai (le reste est alors perdu).
   */
  requestEnd(force = false): 'ended' | 'leftover' | 'denied' {
    if (!this.canEnd) return 'denied';
    if (this.cargo.used > 0) this.depositAll();
    if (this.cargo.used > 0 && !force) return 'leftover';
    this.finish('docked');
    return 'ended';
  }

  /** Rapatriement d'urgence manuel : la cargaison transportée est perdue. */
  emergency(): void {
    this.finish('emergency');
  }

  getResult(): SimResult {
    return {
      outcome: this.outcome ?? 'emergency',
      deposited: { ...this.deposited },
      lost: { ...this.lost },
      damageTaken: this.damageTaken,
      duration: this.time,
      discovered: this.discovered.size,
    };
  }

  stationProgress(): { kind: 'deposit' | 'repair'; value: number } | null {
    if (!this.inRing || this.dwell <= 0) return null;
    if (this.cargo.used > 0 && this.dwell < DEPOSIT_DWELL) return { kind: 'deposit', value: this.dwell / DEPOSIT_DWELL };
    if (this.ship.hull < this.stats.hullMax) {
      return { kind: 'repair', value: Math.min(1, Math.max(0, (this.dwell - DEPOSIT_DWELL) / this.stats.repairDelay)) };
    }
    return null;
  }

  /** État d'un courant électrique : calme, avertissement clignotant, ou décharge active. */
  electricState(z: Zone): 'idle' | 'warn' | 'active' {
    const p = (this.time + z.phase) % ELECTRIC_PERIOD;
    return p >= ELECTRIC_ACTIVE_AT ? 'active' : p >= ELECTRIC_WARN_AT ? 'warn' : 'idle';
  }

  // --- interne ------------------------------------------------------------
  private tick(h: number, input: SimInput): void {
    this.time += h;
    this.moveShip(h, input);
    this.updateDrifters(h);
    this.collide();
    this.updateZones(h);
    if (this.checkEnd()) return;
    this.updateStation(h);
    this.updateExtraction(h);
    this.updateTractor(h);
    this.updateFragments(h);
    this.updateScanner(h);
  }

  private moveShip(h: number, input: SimInput): void {
    const s = this.ship;
    let ix = input.x;
    let iy = input.y;
    const mag = Math.hypot(ix, iy);
    if (mag > 1) { ix /= mag; iy /= mag; }
    const fill = this.cargo.used / this.cargo.capacity;
    let cap = this.stats.maxSpeed * (1 - FULL_SLOWDOWN * fill);
    if (this.held) cap *= 1 - TRACTOR_SLOWDOWN;
    const moving = mag > 0.05;
    const wx = moving ? ix * cap : 0;
    const wy = moving ? iy * cap : 0;
    const rate = moving ? SHIP_ACCEL : SHIP_BRAKE;
    const dx = wx - s.vx;
    const dy = wy - s.vy;
    const len = Math.hypot(dx, dy);
    if (len > 1e-6) {
      const k = Math.min(1, (rate * h) / len);
      s.vx += dx * k;
      s.vy += dy * k;
    }
    s.x += s.vx * h;
    s.y += s.vy * h;
    if (Math.hypot(s.vx, s.vy) > 12) {
      const target = Math.atan2(s.vx, -s.vy);
      let diff = target - s.angle;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      s.angle += diff * Math.min(1, 14 * h);
    }
    s.invuln = Math.max(0, s.invuln - h);
    const { w, h: wh } = this.level.world;
    if (s.x < SHIP_RADIUS) { s.x = SHIP_RADIUS; s.vx = Math.max(0, s.vx); }
    if (s.x > w - SHIP_RADIUS) { s.x = w - SHIP_RADIUS; s.vx = Math.min(0, s.vx); }
    if (s.y < SHIP_RADIUS) { s.y = SHIP_RADIUS; s.vy = Math.max(0, s.vy); }
    if (s.y > wh - SHIP_RADIUS) { s.y = wh - SHIP_RADIUS; s.vy = Math.min(0, s.vy); }
  }

  private updateDrifters(h: number): void {
    for (const d of this.drifters) {
      d.x += d.vx * h;
      d.y += d.vy * h;
      const dx = d.x - d.fx;
      const dy = d.y - d.fy;
      const dist = Math.hypot(dx, dy);
      const lim = d.fr - d.r;
      if (dist > lim && dist > 0) {
        const nx = dx / dist;
        const ny = dy / dist;
        const vn = d.vx * nx + d.vy * ny;
        if (vn > 0) {
          d.vx -= 2 * vn * nx;
          d.vy -= 2 * vn * ny;
        }
        d.x = d.fx + nx * lim;
        d.y = d.fy + ny * lim;
      }
    }
  }

  private collide(): void {
    for (const d of this.deposits) this.pushOut(d.x, d.y, d.r, null);
    for (const w of this.wrecks) this.pushOut(w.x, w.y, w.r, null);
    for (const o of this.obstacles) this.pushOut(o.x, o.y, o.r, 'obstacle');
    for (const d of this.drifters) this.pushOut(d.x, d.y, d.r, 'drifter');
  }

  private pushOut(ox: number, oy: number, or: number, harm: 'obstacle' | 'drifter' | null): void {
    const s = this.ship;
    const minD = SHIP_RADIUS + or;
    let dx = s.x - ox;
    let dy = s.y - oy;
    let d = Math.hypot(dx, dy);
    if (d >= minD) return;
    if (d < 1e-6) { dx = 0; dy = -1; d = 1; }
    const nx = dx / d;
    const ny = dy / d;
    s.x = ox + nx * (minD + 0.5);
    s.y = oy + ny * (minD + 0.5);
    if (harm && s.invuln <= 0 && !this.ended) {
      this.hurt(harm, s.x - nx * SHIP_RADIUS, s.y - ny * SHIP_RADIUS);
      s.invuln = INVULN_TIME;
      s.vx = nx * KNOCKBACK;
      s.vy = ny * KNOCKBACK;
    } else {
      const vn = s.vx * nx + s.vy * ny;
      if (vn < 0) { s.vx -= vn * nx; s.vy -= vn * ny; }
    }
  }

  private hurt(source: 'obstacle' | 'drifter' | 'radiation' | 'electric', x: number, y: number): void {
    this.ship.hull = Math.max(0, this.ship.hull - 1);
    this.damageTaken += 1;
    this.events.push({ type: 'impact', source, x, y });
  }

  private updateZones(h: number): void {
    const s = this.ship;
    let inRad = false;
    for (const z of this.radiation) if (Math.hypot(s.x - z.x, s.y - z.y) < z.r) inRad = true;
    if (inRad && !this.inRing) {
      this.radTimer += h;
      if (this.radTimer >= this.stats.hazardInterval) {
        this.radTimer = 0;
        this.hurt('radiation', s.x, s.y);
      }
    } else {
      this.radTimer = 0;
    }
    for (const z of this.electric) {
      if (this.electricState(z) === 'active' && s.invuln <= 0 && Math.hypot(s.x - z.x, s.y - z.y) < z.r) {
        s.invuln = INVULN_TIME;
        this.hurt('electric', s.x, s.y);
      }
    }
  }

  private updateStation(h: number): void {
    const st = this.level.station;
    const s = this.ship;
    this.inRing = Math.hypot(s.x - st.x, s.y - st.y) < st.ringR;
    if (this.inRing && this.speed <= DEPOSIT_MAX_SPEED) this.dwell += h;
    else {
      this.dwell = 0;
      this.storageWarned = false;
      this.blockedAt = -1;
    }
    if (this.dwell >= DEPOSIT_DWELL && this.cargo.used > 0 && this.blockedAt !== this.cargo.used) this.depositAll();
    if (this.dwell >= DEPOSIT_DWELL + this.stats.repairDelay && s.hull < this.stats.hullMax) {
      s.hull = this.stats.hullMax;
      this.events.push({ type: 'repair' });
    }
  }

  private depositAll(): void {
    const contents = this.cargo.contents();
    const txId = `${this.runId}:d${++this.depositSeq}`;
    const leftover = this.hooks.deposit(txId, contents);
    const accepted: Items = {};
    for (const i of ITEMS) {
      const a = (contents[i] ?? 0) - (leftover[i] ?? 0);
      if (a > 0) {
        accepted[i] = a;
        this.deposited[i] = (this.deposited[i] ?? 0) + a;
      }
    }
    this.cargo.set(leftover);
    if (sumItems(accepted) > 0) this.events.push({ type: 'deposit', txId, accepted, leftover });
    if (this.cargo.used > 0) {
      this.blockedAt = this.cargo.used;
      if (!this.storageWarned) {
        this.storageWarned = true;
        this.events.push({ type: 'storageFull' });
      }
    }
  }

  private edgeDist(x: number, y: number, r: number): number {
    return Math.hypot(x - this.ship.x, y - this.ship.y) - r;
  }

  private updateExtraction(h: number): void {
    const range = this.stats.magnetRange;
    const laser = this.equipment === 'laser';
    const t0 = this.target;
    if (t0) {
      const lim = 'queue' in t0 ? LASER_RANGE : range;
      const remaining = 'queue' in t0 ? t0.queue.length : t0.remaining;
      if (remaining <= 0 || this.edgeDist(t0.x, t0.y, t0.r) > lim) {
        this.target = null;
        this.presence = 0;
      }
    }
    // indice : épave proche sans laser
    this.nearWreckNoLaser = false;
    if (!laser) {
      for (const w of this.wrecks) {
        if (w.queue.length > 0 && this.edgeDist(w.x, w.y, w.r) < 140) this.nearWreckNoLaser = true;
      }
      if (this.nearWreckNoLaser && !this.hintShown) {
        this.hintShown = true;
        this.events.push({ type: 'laserHint' });
      }
    }
    if (!this.target) {
      let best: ExtractTarget | null = null;
      let bestD = Infinity;
      for (const d of this.deposits) {
        if (d.remaining <= 0) continue;
        const e = this.edgeDist(d.x, d.y, d.r);
        if (e <= range && e < bestD) { best = d; bestD = e; }
      }
      if (laser) {
        for (const w of this.wrecks) {
          if (w.queue.length <= 0) continue;
          const e = this.edgeDist(w.x, w.y, w.r);
          if (e <= LASER_RANGE && e < bestD) { best = w; bestD = e; }
        }
      }
      if (best) { this.target = best; this.presence = 0; }
    }
    this.extracting = false;
    const t = this.target;
    if (!t) return;
    this.presence += h;
    if (this.presence < EXTRACT_DELAY) return;
    if (this.cargo.isFull || this.fragments.length >= MAX_FRAGMENTS) return;
    this.extracting = true;
    t.progress += (h * this.stats.extractionPower) / (EXTRACT_PERIOD * t.hardness);
    while (t.progress >= 1 && this.fragments.length < MAX_FRAGMENTS) {
      if ('queue' in t) {
        const res = t.queue.shift();
        if (!res) break;
        t.progress -= 1;
        this.spawnFragment(t.x, t.y, t.r, res);
        if (t.queue.length <= 0) this.onDepleted(t.x, t.y, t.unique, t);
      } else {
        if (t.remaining <= 0) break;
        t.progress -= 1;
        t.remaining -= 1;
        this.spawnFragment(t.x, t.y, t.r, t.res);
        if (t.remaining <= 0) this.onDepleted(t.x, t.y, t.unique, t);
      }
      if (!this.target) break;
    }
  }

  private onDepleted(x: number, y: number, unique: string | undefined, t: ExtractTarget): void {
    t.progress = 0;
    this.events.push({ type: 'depleted', x, y });
    if (unique) this.events.push({ type: 'unique', id: unique });
    this.target = null;
    this.presence = 0;
  }

  private spawnFragment(x: number, y: number, r: number, res: ResourceId): void {
    const toShip = Math.atan2(this.ship.y - y, this.ship.x - x);
    const a = toShip + (this.rng() - 0.5) * 1.2;
    const dist = r + 6;
    const f: Fragment = { id: this.nextId++, x: x + Math.cos(a) * dist, y: y + Math.sin(a) * dist, res, variant: Math.floor(this.rng() * 3), attracted: false, speed: 0, swirl: this.rng() < 0.5 ? -1 : 1 };
    this.fragments.push(f);
    this.events.push({ type: 'extract', x: f.x, y: f.y, res });
  }

  private updateTractor(h: number): void {
    if (this.equipment !== 'tractor') return;
    const s = this.ship;
    if (!this.held) {
      let best: Heavy | null = null;
      let bd = TRACTOR_RANGE;
      for (const hv of this.heavies) {
        const d = Math.hypot(hv.x - s.x, hv.y - s.y);
        if (d < bd) { best = hv; bd = d; }
      }
      if (best) {
        best.held = true;
        this.held = best;
        this.events.push({ type: 'heavyGrab', res: best.res });
      }
      return;
    }
    const hv = this.held;
    const bx = s.x - Math.sin(s.angle) * 50;
    const by = s.y + Math.cos(s.angle) * 50;
    const k = Math.min(1, 9 * h);
    hv.x += (bx - hv.x) * k;
    hv.y += (by - hv.y) * k;
    const st = this.level.station;
    if (Math.hypot(hv.x - st.x, hv.y - st.y) < st.ringR - 6) {
      const ok = this.hooks.recoverHeavy(`${this.runId}:h${++this.heavySeq}`, hv.res, hv.amount);
      if (ok) {
        this.events.push({ type: 'heavyDelivered', res: hv.res, amount: hv.amount });
        if (hv.unique) this.events.push({ type: 'unique', id: hv.unique });
        this.heavies.splice(this.heavies.indexOf(hv), 1);
        this.held = null;
      } else if (!this.storageWarned) {
        this.storageWarned = true;
        this.events.push({ type: 'storageFull' });
      }
    }
  }

  private updateFragments(h: number): void {
    const s = this.ship;
    const range = this.stats.magnetRange;
    for (let i = this.fragments.length - 1; i >= 0; i--) {
      const f = this.fragments[i];
      const dx = s.x - f.x;
      const dy = s.y - f.y;
      const d = Math.hypot(dx, dy);
      const canTake = !this.cargo.isFull;
      if (canTake && d <= range) {
        if (!f.attracted) { f.attracted = true; f.speed = 110; }
        f.speed = Math.min(620, f.speed + 1500 * h);
        if (d > 1e-6) {
          const nx = dx / d;
          const ny = dy / d;
          const curve = 0.32 * f.swirl * Math.min(1, d / range);
          const vx = (nx - ny * curve) * f.speed;
          const vy = (ny + nx * curve) * f.speed;
          const step = Math.min(f.speed * h, d);
          const vl = Math.hypot(vx, vy) || 1;
          f.x += (vx / vl) * step;
          f.y += (vy / vl) * step;
        }
      } else if (f.attracted) {
        f.attracted = false;
        f.speed = 0;
      }
      if (canTake && Math.hypot(s.x - f.x, s.y - f.y) <= PICKUP_RADIUS) {
        this.cargo.tryAdd(f.res, 1);
        this.fragments[i] = this.fragments[this.fragments.length - 1];
        this.fragments.pop();
        this.events.push({ type: 'collect', x: f.x, y: f.y, res: f.res });
        if (this.cargo.isFull) this.events.push({ type: 'full' });
      }
    }
  }

  private updateScanner(h: number): void {
    this.scanTimer += h;
    if (this.scanTimer < 0.2) return;
    this.scanTimer = 0;
    const s = this.ship;
    for (const p of this.pois) {
      if (this.discovered.has(p.id)) continue;
      if (Math.hypot(p.x - s.x, p.y - s.y) <= this.stats.scanRadius + p.r) {
        this.discovered.add(p.id);
        this.events.push({ type: 'discover', poi: p });
      }
    }
  }

  private checkEnd(): boolean {
    if (this.ended) return true;
    if (this.ship.hull <= 0) {
      this.finish('wrecked');
      return true;
    }
    return false;
  }

  private finish(outcome: SimOutcome): void {
    if (this.ended) return;
    const lost = this.cargo.unload();
    for (const i of ITEMS) if ((lost[i] ?? 0) > 0) this.lost[i] = (this.lost[i] ?? 0) + (lost[i] as number);
    this.held = null;
    this.ended = true;
    this.outcome = outcome;
    this.events.push({ type: 'end', outcome });
  }
}
