import Phaser from 'phaser';

interface P {
  img: Phaser.GameObjects.Image;
  alive: boolean;
  life: number;
  max: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  s0: number;
  s1: number;
  a0: number;
  flow: { fx: number; fy: number; tx: number; ty: number; wob: number } | null;
}

export interface EmitOpts {
  count: number;
  color: number;
  speed?: number;
  life?: number;
  size?: number;
  spread?: number; // rayon d'apparition
  angle?: number; // direction centrale (rad), défaut tous sens
  cone?: number; // demi-ouverture (rad)
  alpha?: number;
}

/** Particules en pool, plafonnées (80 en qualité normale, 30 en qualité basse). */
export class Fx {
  private pool: P[] = [];
  private cursor = 0;

  constructor(scene: Phaser.Scene, max: number, depth: number) {
    for (let i = 0; i < max; i++) {
      const img = scene.add.image(0, 0, 'spark').setVisible(false).setDepth(depth).setBlendMode(Phaser.BlendModes.ADD);
      this.pool.push({ img, alive: false, life: 0, max: 1, x: 0, y: 0, vx: 0, vy: 0, s0: 1, s1: 0, a0: 1, flow: null });
    }
  }

  private take(): P {
    for (let n = 0; n < this.pool.length; n++) {
      const p = this.pool[(this.cursor + n) % this.pool.length];
      if (!p.alive) {
        this.cursor = (this.cursor + n + 1) % this.pool.length;
        return p;
      }
    }
    const p = this.pool[this.cursor];
    this.cursor = (this.cursor + 1) % this.pool.length;
    return p;
  }

  emit(x: number, y: number, o: EmitOpts): void {
    for (let i = 0; i < o.count; i++) {
      const p = this.take();
      const ang = (o.angle ?? Math.random() * Math.PI * 2) + (o.angle === undefined ? 0 : (Math.random() * 2 - 1) * (o.cone ?? 0.5));
      const sp = (o.speed ?? 60) * (0.4 + Math.random() * 0.8);
      const r = Math.random() * (o.spread ?? 0);
      p.x = x + Math.cos(ang) * r;
      p.y = y + Math.sin(ang) * r;
      p.vx = Math.cos(ang) * sp;
      p.vy = Math.sin(ang) * sp;
      p.max = p.life = (o.life ?? 0.4) * (0.7 + Math.random() * 0.6);
      p.s0 = ((o.size ?? 0.8) * (0.7 + Math.random() * 0.6));
      p.s1 = 0;
      p.a0 = o.alpha ?? 0.9;
      p.flow = null;
      p.alive = true;
      p.img.setTint(o.color).setVisible(true);
    }
  }

  /** Flux de particules d'un point à un autre (animation de déchargement). */
  flow(fx: number, fy: number, tx: number, ty: number, count: number, color: number): void {
    for (let i = 0; i < count; i++) {
      const p = this.take();
      p.max = p.life = 0.55 + Math.random() * 0.35;
      p.flow = { fx, fy, tx, ty, wob: (Math.random() * 2 - 1) * 28 };
      p.s0 = 0.9;
      p.s1 = 0.3;
      p.a0 = 0.95;
      p.x = fx;
      p.y = fy;
      p.vx = 0;
      p.vy = 0;
      p.alive = true;
      // départ échelonné : vie négative simulée par un léger retard
      p.life += Math.random() * 0.25;
      p.max = p.life;
      p.img.setTint(color).setVisible(true);
    }
  }

  update(dt: number): void {
    for (const p of this.pool) {
      if (!p.alive) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.alive = false;
        p.img.setVisible(false);
        continue;
      }
      const t = 1 - p.life / p.max;
      if (p.flow) {
        const e = t * t * (3 - 2 * t);
        const f = p.flow;
        const wob = Math.sin(e * Math.PI) * f.wob;
        const dx = f.tx - f.fx;
        const dy = f.ty - f.fy;
        const len = Math.hypot(dx, dy) || 1;
        p.x = f.fx + dx * e + (-dy / len) * wob;
        p.y = f.fy + dy * e + (dx / len) * wob;
      } else {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vx *= 1 - Math.min(1, dt * 2.2);
        p.vy *= 1 - Math.min(1, dt * 2.2);
      }
      p.img.setPosition(p.x, p.y);
      p.img.setScale((p.s0 + (p.s1 - p.s0) * t) * 0.5);
      p.img.setAlpha(p.a0 * (1 - t * t));
    }
  }

  clear(): void {
    for (const p of this.pool) {
      p.alive = false;
      p.img.setVisible(false);
    }
  }
}
