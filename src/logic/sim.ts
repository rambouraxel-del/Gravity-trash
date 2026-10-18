// Simulation de la sortie : pure, sans Phaser. Le rendu lit l'état et consomme les événements.
import {
  DEPOSIT_DWELL,
  DEPOSIT_MAX_SPEED,
  EXTRACT_DELAY,
  EXTRACT_PERIOD,
  FULL_SLOWDOWN,
  INVULN_TIME,
  KNOCKBACK,
  MAX_FRAGMENTS,
  PICKUP_RADIUS,
  RUN_DURATION,
  SHIP_ACCEL,
  SHIP_BRAKE,
  SHIP_RADIUS,
  STORM_DURATION,
  STORM_TICK,
  WARNING_TIMES,
  type SimStats,
} from '../config/balance';
import { Cargo } from './cargo';
import type { LevelData } from './level';
import { mulberry32 } from './rng';

export interface SimInput {
  x: number;
  y: number;
}

export interface Fragment {
  id: number;
  x: number;
  y: number;
  variant: number;
  attracted: boolean;
  speed: number;
  swirl: number;
}

export interface Deposit {
  id: number;
  x: number;
  y: number;
  r: number;
  amount: number;
  remaining: number;
  /** Progression d'extraction (0..1), conservée quand on s'éloigne. */
  progress: number;
  variant: number;
  hardness: number;
}

export interface Obstacle {
  id: number;
  x: number;
  y: number;
  r: number;
  variant: number;
}

export type SimOutcome = 'success' | 'voluntary' | 'emergency' | 'wrecked' | 'abandoned';

export type SimEvent =
  | { type: 'collect'; x: number; y: number }
  | { type: 'extract'; x: number; y: number }
  | { type: 'depleted'; x: number; y: number }
  | { type: 'full' }
  | { type: 'impact'; source: 'obstacle' | 'storm'; x: number; y: number }
  | { type: 'deposit'; fragments: number; txId: string }
  | { type: 'repair' }
  | { type: 'warning'; remaining: number }
  | { type: 'stormStart' }
  | { type: 'end'; outcome: SimOutcome };

export interface SimResult {
  outcome: SimOutcome;
  depositedFragments: number;
  lostFragments: number;
  damageTaken: number;
  duration: number;
}

export interface SimOptions {
  runId: string;
  seed: number;
  level: LevelData;
  stats: SimStats;
  hardness: number;
  duration?: number;
}

export class Sim {
  readonly runId: string;
  readonly level: LevelData;
  readonly stats: SimStats;
  readonly duration: number;
  readonly cargo: Cargo;
  readonly fragments: Fragment[] = [];
  readonly deposits: Deposit[] = [];
  readonly obstacles: Obstacle[] = [];

  time = 0;
  ship = { x: 0, y: 0, vx: 0, vy: 0, angle: 0, hull: 0, invuln: 0 };
  target: Deposit | null = null;
  extracting = false;
  dwell = 0;
  inRing = true;
  stormFront = 0;
  stormStarted = false;
  inStorm = false;
  ended = false;
  outcome: SimOutcome | null = null;
  depositedFragments = 0;
  lostFragments = 0;
  damageTaken = 0;

  private events: SimEvent[] = [];
  private presence = 0;
  private stormTimer = 0;
  private depositSeq = 0;
  private nextId = 1;
  private warned = new Set<number>();
  private rng: () => number;

  constructor(opts: SimOptions) {
    this.runId = opts.runId;
    this.level = opts.level;
    this.stats = opts.stats;
    this.duration = opts.duration ?? RUN_DURATION;
    this.cargo = new Cargo(opts.stats.cargoCapacity);
    this.rng = mulberry32(opts.seed * 31 + 5);
    this.ship.x = opts.level.station.x;
    this.ship.y = opts.level.station.y;
    this.ship.hull = opts.stats.hullMax;
    for (const f of opts.level.fragments) {
      this.fragments.push({ id: this.nextId++, x: f.x, y: f.y, variant: f.variant, attracted: false, speed: 0, swirl: this.rng() < 0.5 ? -1 : 1 });
    }
    for (const d of opts.level.deposits) {
      this.deposits.push({ id: this.nextId++, x: d.x, y: d.y, r: d.r, amount: d.amount, remaining: d.amount, progress: 0, variant: d.variant, hardness: opts.hardness });
    }
    for (const o of opts.level.obstacles) {
      this.obstacles.push({ id: this.nextId++, x: o.x, y: o.y, r: o.r, variant: o.variant });
    }
  }

  get remaining(): number {
    return Math.max(0, this.duration - this.time);
  }

  get speed(): number {
    return Math.hypot(this.ship.vx, this.ship.vy);
  }

  /** Bouton « Terminer la sortie » disponible seulement dans l'anneau. */
  get canEnd(): boolean {
    return !this.ended && this.inRing;
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

  /** Fin volontaire : uniquement dans l'anneau ; la soute est déposée dans la même foulée. */
  requestEnd(): boolean {
    if (!this.canEnd) return false;
    this.finish('voluntary');
    return true;
  }

  /** Abandon depuis la pause : la cargaison non déposée est perdue. */
  abandon(): void {
    this.finish('abandoned');
  }

  getResult(): SimResult {
    return {
      outcome: this.outcome ?? 'abandoned',
      depositedFragments: this.depositedFragments,
      lostFragments: this.lostFragments,
      damageTaken: this.damageTaken,
      duration: this.time,
    };
  }

  /** Progression de l'anneau (dépôt puis réparation), ou null. */
  stationProgress(): { kind: 'deposit' | 'repair'; value: number } | null {
    if (!this.inRing || this.dwell <= 0) return null;
    if (this.cargo.used > 0 && this.dwell < DEPOSIT_DWELL) return { kind: 'deposit', value: this.dwell / DEPOSIT_DWELL };
    if (this.ship.hull < this.stats.hullMax) {
      return { kind: 'repair', value: Math.min(1, Math.max(0, (this.dwell - DEPOSIT_DWELL) / this.stats.repairDelay)) };
    }
    return null;
  }

  // --- interne ------------------------------------------------------------
  private tick(h: number, input: SimInput): void {
    this.time += h;
    this.moveShip(h, input);
    this.collide();
    this.updateStorm(h);
    if (this.checkEnd()) return;
    this.updateStation(h);
    this.updateExtraction(h);
    this.updateFragments(h);
    this.updateWarnings();
    this.checkEnd();
  }

  private moveShip(h: number, input: SimInput): void {
    const s = this.ship;
    let ix = input.x;
    let iy = input.y;
    const mag = Math.hypot(ix, iy);
    if (mag > 1) {
      ix /= mag;
      iy /= mag;
    }
    const fill = this.cargo.used / this.cargo.capacity;
    const cap = this.stats.maxSpeed * (1 - FULL_SLOWDOWN * fill);
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

  private collide(): void {
    for (const d of this.deposits) this.pushOut(d.x, d.y, d.r, false);
    for (const o of this.obstacles) this.pushOut(o.x, o.y, o.r, true);
  }

  private pushOut(ox: number, oy: number, or: number, harmful: boolean): void {
    const s = this.ship;
    const minD = SHIP_RADIUS + or;
    let dx = s.x - ox;
    let dy = s.y - oy;
    let d = Math.hypot(dx, dy);
    if (d >= minD) return;
    if (d < 1e-6) {
      dx = 0;
      dy = -1;
      d = 1;
    }
    const nx = dx / d;
    const ny = dy / d;
    s.x = ox + nx * (minD + 0.5);
    s.y = oy + ny * (minD + 0.5);
    if (harmful && s.invuln <= 0 && !this.ended) {
      s.hull = Math.max(0, s.hull - 1);
      this.damageTaken += 1;
      s.invuln = INVULN_TIME;
      s.vx = nx * KNOCKBACK;
      s.vy = ny * KNOCKBACK;
      this.events.push({ type: 'impact', source: 'obstacle', x: s.x - nx * SHIP_RADIUS, y: s.y - ny * SHIP_RADIUS });
    } else {
      const vn = s.vx * nx + s.vy * ny;
      if (vn < 0) {
        s.vx -= vn * nx;
        s.vy -= vn * ny;
      }
    }
  }

  private updateStorm(h: number): void {
    const start = this.duration - STORM_DURATION;
    if (this.time < start) return;
    if (!this.stormStarted) {
      this.stormStarted = true;
      this.events.push({ type: 'stormStart' });
    }
    const p = Math.min(1, (this.time - start) / STORM_DURATION);
    this.stormFront = p * this.level.stormFrontEnd;
    this.inStorm = this.ship.y < this.stormFront;
    if (this.inStorm) {
      this.stormTimer += h;
      if (this.stormTimer >= STORM_TICK) {
        this.stormTimer = 0;
        this.ship.hull = Math.max(0, this.ship.hull - 1);
        this.damageTaken += 1;
        this.events.push({ type: 'impact', source: 'storm', x: this.ship.x, y: this.ship.y });
      }
    } else {
      this.stormTimer = 0;
    }
  }

  private updateStation(h: number): void {
    const st = this.level.station;
    const s = this.ship;
    this.inRing = Math.hypot(s.x - st.x, s.y - st.y) < st.ringR;
    if (this.inRing && this.speed <= DEPOSIT_MAX_SPEED) this.dwell += h;
    else this.dwell = 0;
    if (this.dwell >= DEPOSIT_DWELL && this.cargo.used > 0) this.depositAll();
    if (this.dwell >= DEPOSIT_DWELL + this.stats.repairDelay && s.hull < this.stats.hullMax) {
      s.hull = this.stats.hullMax;
      this.events.push({ type: 'repair' });
    }
  }

  private depositAll(): number {
    const n = this.cargo.unload();
    if (n > 0) {
      this.depositedFragments += n;
      this.events.push({ type: 'deposit', fragments: n, txId: `${this.runId}:d${++this.depositSeq}` });
    }
    return n;
  }

  private edgeDist(d: Deposit): number {
    return Math.hypot(d.x - this.ship.x, d.y - this.ship.y) - d.r;
  }

  private updateExtraction(h: number): void {
    const range = this.stats.magnetRange;
    if (this.target && (this.target.remaining <= 0 || this.edgeDist(this.target) > range)) {
      this.target = null;
      this.presence = 0;
    }
    if (!this.target) {
      let best: Deposit | null = null;
      let bestD = Infinity;
      for (const d of this.deposits) {
        if (d.remaining <= 0) continue;
        const e = this.edgeDist(d);
        if (e <= range && e < bestD) {
          best = d;
          bestD = e;
        }
      }
      if (best) {
        this.target = best;
        this.presence = 0;
      }
    }
    this.extracting = false;
    const t = this.target;
    if (!t) return;
    this.presence += h;
    if (this.presence < EXTRACT_DELAY) return;
    if (this.cargo.isFull || this.fragments.length >= MAX_FRAGMENTS) return;
    this.extracting = true;
    t.progress += (h * this.stats.extractionPower) / (EXTRACT_PERIOD * t.hardness);
    while (t.progress >= 1 && t.remaining > 0 && this.fragments.length < MAX_FRAGMENTS) {
      t.progress -= 1;
      t.remaining -= 1;
      this.spawnFragment(t);
      if (t.remaining <= 0) {
        t.progress = 0;
        this.events.push({ type: 'depleted', x: t.x, y: t.y });
      }
    }
  }

  private spawnFragment(d: Deposit): void {
    const toShip = Math.atan2(this.ship.y - d.y, this.ship.x - d.x);
    const a = toShip + (this.rng() - 0.5) * 1.2;
    const dist = d.r + 6;
    const f: Fragment = {
      id: this.nextId++,
      x: d.x + Math.cos(a) * dist,
      y: d.y + Math.sin(a) * dist,
      variant: Math.floor(this.rng() * 3),
      attracted: false,
      speed: 0,
      swirl: this.rng() < 0.5 ? -1 : 1,
    };
    this.fragments.push(f);
    this.events.push({ type: 'extract', x: f.x, y: f.y });
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
        if (!f.attracted) {
          f.attracted = true;
          f.speed = 110;
        }
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
        this.cargo.tryAdd(1);
        this.fragments[i] = this.fragments[this.fragments.length - 1];
        this.fragments.pop();
        this.events.push({ type: 'collect', x: f.x, y: f.y });
        if (this.cargo.isFull) this.events.push({ type: 'full' });
      }
    }
  }

  private updateWarnings(): void {
    const rem = this.remaining;
    for (const w of WARNING_TIMES) {
      if (rem <= w && !this.warned.has(w)) {
        this.warned.add(w);
        this.events.push({ type: 'warning', remaining: w });
      }
    }
  }

  private checkEnd(): boolean {
    if (this.ended) return true;
    if (this.ship.hull <= 0) {
      this.finish('wrecked');
      return true;
    }
    if (this.time >= this.duration) {
      this.finish(this.inRing ? 'success' : 'emergency');
      return true;
    }
    return false;
  }

  private finish(outcome: SimOutcome): void {
    if (this.ended) return;
    if (outcome === 'success' || outcome === 'voluntary') this.depositAll();
    else this.lostFragments += this.cargo.unload();
    this.ended = true;
    this.outcome = outcome;
    this.events.push({ type: 'end', outcome });
  }
}
