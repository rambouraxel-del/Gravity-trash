// HUD en DOM (net sur tous les écrans) : coque, soute, temps, radar, flèche de station, alertes.
import { LOGICAL_H, LOGICAL_W, PLAY_H } from '../scenes/view';
import type { Sim } from '../logic/sim';

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Élément manquant : #${id}`);
  return el as T;
};

export class Hud {
  readonly root = $('hud');
  readonly pauseBtn = $<HTMLButtonElement>('btnPause');
  readonly endBtn = $<HTMLButtonElement>('btnEnd');
  readonly zone = $('joyZone');
  readonly controls = $('controls');
  readonly base = $('joyBase');
  readonly knob = $('joyKnob');
  readonly hint = $('joyHint');
  private hull = $('hudHull');
  private cargo = $('hudCargo');
  private cargoFill = $('hudCargoFill');
  private cargoText = $('hudCargoText');
  private time = $('hudTime');
  private toastEl = $('hudToast');
  private radar = $<HTMLCanvasElement>('radar');
  private arrow = $('stationArrow');
  private flash = $('damageFlash');
  private rctx = this.radar.getContext('2d') as CanvasRenderingContext2D;

  private last = { hull: -1, hullMax: -1, used: -1, cap: -1, time: -1, end: false, tip: '' };
  private timedUntil = 0;
  private tipText = '';
  private radarAt = 0;
  private flashTimer = 0;
  private toastTimer = 0;

  show(): void {
    this.root.hidden = false;
  }
  hide(): void {
    this.root.hidden = true;
    this.toastEl.classList.remove('show');
  }

  reset(): void {
    this.last = { hull: -1, hullMax: -1, used: -1, cap: -1, time: -1, end: false, tip: '' };
    this.timedUntil = 0;
    this.tipText = '';
    this.toastEl.classList.remove('show');
    this.endBtn.hidden = true;
    this.arrow.hidden = true;
  }

  /** Message ponctuel (alertes, résultats). */
  toast(text: string, kind: 'info' | 'warn' | 'alert' | 'good' = 'info', ms = 3200): void {
    this.toastEl.textContent = text;
    this.toastEl.className = `hud-toast show ${kind}`;
    this.timedUntil = performance.now() + ms;
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.refreshTip(), ms + 30);
  }

  /** Conseil persistant (disparaît quand il est accompli). */
  setTip(text: string): void {
    if (text === this.tipText) return;
    this.tipText = text;
    this.refreshTip();
  }

  private refreshTip(): void {
    if (performance.now() < this.timedUntil) return;
    if (this.tipText) {
      this.toastEl.textContent = this.tipText;
      this.toastEl.className = 'hud-toast show info';
    } else {
      this.toastEl.classList.remove('show');
    }
  }

  damageFlash(): void {
    this.flash.classList.add('on');
    window.clearTimeout(this.flashTimer);
    this.flashTimer = window.setTimeout(() => this.flash.classList.remove('on'), 90);
  }

  bumpCargo(): void {
    this.cargo.classList.remove('bump');
    void this.cargo.offsetWidth;
    this.cargo.classList.add('bump');
  }

  setJoystickHint(text: string): void {
    this.hint.textContent = text;
  }

  /** Mise à jour par image : ne touche le DOM que si une valeur change. */
  update(sim: Sim, view: { cx: number; cy: number }, now: number): void {
    const L = this.last;
    const { hull } = sim.ship;
    const hullMax = sim.stats.hullMax;
    if (L.hull !== hull || L.hullMax !== hullMax) {
      if (L.hullMax !== hullMax) {
        this.hull.innerHTML = '<i></i>'.repeat(hullMax);
      }
      [...this.hull.children].forEach((c, i) => c.classList.toggle('off', i >= hull));
      L.hull = hull;
      L.hullMax = hullMax;
    }
    const used = sim.cargo.used;
    const cap = sim.cargo.capacity;
    if (L.used !== used || L.cap !== cap) {
      this.cargoFill.style.width = `${(used / cap) * 100}%`;
      this.cargoText.textContent = `Soute ${used}/${cap}${used >= cap ? ' — pleine' : ''}`;
      this.cargo.classList.toggle('full', used >= cap);
      L.used = used;
      L.cap = cap;
    }
    const rem = Math.ceil(sim.remaining);
    if (L.time !== rem) {
      const m = Math.floor(rem / 60);
      const s = rem % 60;
      this.time.textContent = `${m}:${String(s).padStart(2, '0')}`;
      this.time.classList.toggle('warn', rem <= 60 && rem > 10);
      this.time.classList.toggle('alert', rem <= 10);
      L.time = rem;
    }
    const canEnd = sim.canEnd;
    if (L.end !== canEnd) {
      this.endBtn.hidden = !canEnd;
      L.end = canEnd;
    }
    this.updateArrow(sim, view);
    if (now - this.radarAt > 66) {
      this.radarAt = now;
      this.drawRadar(sim, view);
    }
  }

  private updateArrow(sim: Sim, view: { cx: number; cy: number }): void {
    const st = sim.level.station;
    const left = view.cx - LOGICAL_W / 2;
    const top = view.cy - LOGICAL_H / 2;
    const sx = st.x - left;
    const sy = st.y - top;
    const pad = 34;
    const onScreen = sx > pad && sx < LOGICAL_W - pad && sy > pad + 40 && sy < PLAY_H - pad;
    if (onScreen) {
      this.arrow.hidden = true;
      return;
    }
    const shipX = sim.ship.x - left;
    const shipY = sim.ship.y - top;
    const dx = sx - shipX;
    const dy = sy - shipY;
    // intersection du rayon vaisseau → station avec le rectangle de jeu (avec marge)
    const minX = pad;
    const maxX = LOGICAL_W - pad;
    const minY = pad + 56;
    const maxY = PLAY_H - pad;
    let t = Infinity;
    if (dx > 0) t = Math.min(t, (maxX - shipX) / dx);
    if (dx < 0) t = Math.min(t, (minX - shipX) / dx);
    if (dy > 0) t = Math.min(t, (maxY - shipY) / dy);
    if (dy < 0) t = Math.min(t, (minY - shipY) / dy);
    const ax = shipX + dx * Math.max(0, t);
    const ay = shipY + dy * Math.max(0, t);
    const angle = (Math.atan2(dy, dx) * 180) / Math.PI + 90;
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) / 16;
    this.arrow.hidden = false;
    this.arrow.style.left = `${ax * rem}px`;
    this.arrow.style.top = `${ay * rem}px`;
    const svg = this.arrow.firstElementChild as SVGElement;
    svg.style.transform = `rotate(${angle}deg)`;
  }

  private drawRadar(sim: Sim, view: { cx: number; cy: number }): void {
    const c = this.rctx;
    const W = this.radar.width;
    const H = this.radar.height;
    const w = sim.level.world.w;
    const h = sim.level.world.h;
    const sx = W / w;
    const sy = H / h;
    c.clearRect(0, 0, W, H);
    c.fillStyle = 'rgba(6, 12, 28, 0.78)';
    c.fillRect(0, 0, W, H);
    if (sim.stormStarted) {
      c.fillStyle = 'rgba(255,107,94,0.4)';
      c.fillRect(0, 0, W, sim.stormFront * sy);
      c.fillStyle = '#ff6b5e';
      c.fillRect(0, sim.stormFront * sy - 1, W, 2);
    }
    for (const o of sim.obstacles) {
      c.fillStyle = 'rgba(255,107,94,0.6)';
      c.fillRect(o.x * sx - 2, o.y * sy - 2, 4, 4);
    }
    for (const d of sim.deposits) {
      c.fillStyle = d.remaining > 0 ? '#3ee6f0' : 'rgba(62,230,240,0.25)';
      c.beginPath();
      c.arc(d.x * sx, d.y * sy, 3, 0, Math.PI * 2);
      c.fill();
    }
    const st = sim.level.station;
    c.strokeStyle = '#7ff3f8';
    c.lineWidth = 2;
    c.strokeRect(st.x * sx - 5, st.y * sy - 5, 10, 10);
    c.strokeStyle = 'rgba(255,255,255,0.35)';
    c.lineWidth = 1;
    c.strokeRect((view.cx - LOGICAL_W / 2) * sx, (view.cy - LOGICAL_H / 2) * sy, LOGICAL_W * sx, PLAY_H * sy);
    c.fillStyle = '#f4e6c8';
    c.beginPath();
    c.arc(sim.ship.x * sx, sim.ship.y * sy, 3.6, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = 'rgba(80,120,200,0.6)';
    c.lineWidth = 1.5;
    c.strokeRect(0.75, 0.75, W - 1.5, H - 1.5);
  }
}
