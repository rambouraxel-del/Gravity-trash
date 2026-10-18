// Commandes : joystick flottant (zone basse réservée) + clavier. Une seule source de vecteur.
import type { JoystickSide } from '../logic/save-model';

export interface Vec {
  x: number;
  y: number;
}

const DEAD = 0.12;

export class Controls {
  /** Les commandes ne réagissent que pendant une sortie active. */
  enabled = false;
  private keys = new Set<string>();
  private joy = { active: false, id: -1, ox: 0, oy: 0, x: 0, y: 0 };
  private maxR = 50;

  constructor(
    private zone: HTMLElement,
    private controls: HTMLElement,
    private base: HTMLElement,
    private knob: HTMLElement,
  ) {
    zone.addEventListener('pointerdown', (e) => this.down(e));
    zone.addEventListener('pointermove', (e) => this.move(e));
    for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) {
      zone.addEventListener(ev, (e) => this.up(e));
    }
    zone.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('keydown', (e) => this.key(e, true));
    window.addEventListener('keyup', (e) => this.key(e, false));
    window.addEventListener('blur', () => this.reset());
  }

  setSide(side: JoystickSide): void {
    this.zone.classList.toggle('right', side === 'right');
    this.zone.classList.toggle('left', side === 'left');
    this.controls.classList.toggle('side-right', side === 'right');
    this.controls.classList.toggle('side-left', side === 'left');
  }

  /** Relâche tout (pause, retour d'arrière-plan, fin de sortie). */
  reset(): void {
    this.keys.clear();
    this.joy.active = false;
    this.joy.id = -1;
    this.joy.x = 0;
    this.joy.y = 0;
    this.zone.classList.remove('active');
    this.knob.style.transform = '';
  }

  vector(): Vec {
    if (!this.enabled) return { x: 0, y: 0 };
    let kx = 0;
    let ky = 0;
    if (this.keys.has('left')) kx -= 1;
    if (this.keys.has('right')) kx += 1;
    if (this.keys.has('up')) ky -= 1;
    if (this.keys.has('down')) ky += 1;
    if (kx !== 0 || ky !== 0) {
      const l = Math.hypot(kx, ky);
      return { x: kx / l, y: ky / l };
    }
    return { x: this.joy.x, y: this.joy.y };
  }

  private rem(): number {
    return parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
  }

  private down(e: PointerEvent): void {
    if (!this.enabled || this.joy.active) return;
    e.preventDefault();
    const rem = this.rem();
    this.maxR = 3.2 * rem;
    const r = this.zone.getBoundingClientRect();
    const margin = 3.4 * rem;
    const ox = Math.min(Math.max(e.clientX - r.left, margin), Math.max(margin, r.width - margin));
    const oy = Math.min(Math.max(e.clientY - r.top, margin), Math.max(margin, r.height - margin));
    this.joy = { active: true, id: e.pointerId, ox, oy, x: 0, y: 0 };
    try {
      this.zone.setPointerCapture(e.pointerId);
    } catch {
      /* ignoré */
    }
    this.base.style.left = `${ox}px`;
    this.base.style.top = `${oy}px`;
    this.zone.classList.add('active');
    this.apply(e);
  }

  private move(e: PointerEvent): void {
    if (!this.joy.active || e.pointerId !== this.joy.id) return;
    e.preventDefault();
    this.apply(e);
  }

  private up(e: PointerEvent): void {
    if (e.pointerId !== this.joy.id) return;
    this.reset();
  }

  private apply(e: PointerEvent): void {
    const r = this.zone.getBoundingClientRect();
    const dx = e.clientX - r.left - this.joy.ox;
    const dy = e.clientY - r.top - this.joy.oy;
    const len = Math.hypot(dx, dy);
    const k = len > this.maxR ? this.maxR / len : 1;
    this.knob.style.transform = `translate(${dx * k}px, ${dy * k}px)`;
    const mag = Math.min(1, len / this.maxR);
    if (mag < DEAD) {
      this.joy.x = 0;
      this.joy.y = 0;
    } else {
      const s = (mag - DEAD) / (1 - DEAD);
      this.joy.x = (dx / len) * s;
      this.joy.y = (dy / len) * s;
    }
  }

  private key(e: KeyboardEvent, down: boolean): void {
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
    let dir: string | null = null;
    switch (e.code) {
      case 'ArrowLeft': case 'KeyA': dir = 'left'; break;
      case 'ArrowRight': case 'KeyD': dir = 'right'; break;
      case 'ArrowUp': case 'KeyW': dir = 'up'; break;
      case 'ArrowDown': case 'KeyS': dir = 'down'; break;
      default:
        // AZERTY : Z et Q selon la lettre produite
        if (e.key === 'z' || e.key === 'Z') dir = 'up';
        else if (e.key === 'q' || e.key === 'Q') dir = 'left';
    }
    if (!dir) return;
    if (this.enabled) e.preventDefault();
    if (down) this.keys.add(dir);
    else this.keys.delete(dir);
  }
}
