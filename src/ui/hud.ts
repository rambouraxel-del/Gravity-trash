// HUD d'exploration en DOM : coque, soute, équipement, mini-carte, flèche de station, alertes.
import { ITEMS } from '../config/items';
import { ITEM_INFO } from '../config/items';
import { EQUIPMENTS, type EquipmentId } from '../config/balance';
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
  private items = $('hudItems');
  private equip = $('hudEquip');
  private toastEl = $('hudToast');
  private radar = $<HTMLCanvasElement>('radar');
  private arrow = $('stationArrow');
  private flash = $('damageFlash');
  private rctx = this.radar.getContext('2d') as CanvasRenderingContext2D;

  private last = { hull: -1, hullMax: -1, used: -1, cap: -1, end: false, itemsKey: '', endLabel: '' };
  private timedUntil = 0;
  private tipText = '';
  private radarAt = 0;
  private flashTimer = 0;
  private toastTimer = 0;
  private endLabel = 'Retour station';

  constructor() {
    this.radar.addEventListener('click', () => this.radar.classList.toggle('big'));
  }

  show(): void {
    this.root.hidden = false;
  }
  hide(): void {
    this.root.hidden = true;
    this.toastEl.classList.remove('show');
    this.radar.classList.remove('big');
  }

  reset(): void {
    this.last = { hull: -1, hullMax: -1, used: -1, cap: -1, end: false, itemsKey: '', endLabel: '' };
    this.timedUntil = 0;
    this.tipText = '';
    this.toastEl.classList.remove('show');
    this.endBtn.hidden = true;
    this.arrow.hidden = true;
    this.endLabel = 'Retour station';
    this.items.innerHTML = '';
  }

  setEquipment(id: EquipmentId | null): void {
    this.equip.hidden = id === null;
    if (id) {
      this.equip.textContent = EQUIPMENTS[id].icon;
      this.equip.title = EQUIPMENTS[id].name;
      this.equip.setAttribute('aria-label', EQUIPMENTS[id].name);
    }
  }

  /** Libellé du bouton de retour (ex. avertissement de perte). */
  setEndLabel(text: string): void {
    this.endLabel = text;
  }

  toast(text: string, kind: 'info' | 'warn' | 'alert' | 'good' = 'info', ms = 3200): void {
    this.toastEl.textContent = text;
    this.toastEl.className = `hud-toast show ${kind}`;
    this.timedUntil = performance.now() + ms;
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.refreshTip(), ms + 30);
  }

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

  update(sim: Sim, view: { cx: number; cy: number }, now: number): void {
    const L = this.last;
    const hull = sim.ship.hull;
    const hullMax = sim.stats.hullMax;
    if (L.hull !== hull || L.hullMax !== hullMax) {
      if (L.hullMax !== hullMax) this.hull.innerHTML = '<i></i>'.repeat(hullMax);
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
      const c = sim.cargo.contents();
      const key = ITEMS.map((i) => c[i] ?? 0).join(',');
      if (key !== L.itemsKey) {
        L.itemsKey = key;
        this.items.innerHTML = ITEMS.filter((i) => (c[i] ?? 0) > 0)
          .map((i) => `<span title="${ITEM_INFO[i].name}">${ITEM_INFO[i].icon} ${c[i]}</span>`)
          .join('');
      }
      L.used = used;
      L.cap = cap;
    }
    const canEnd = sim.canEnd;
    if (L.end !== canEnd || L.endLabel !== this.endLabel) {
      this.endBtn.hidden = !canEnd;
      if (canEnd) this.endBtn.textContent = this.endLabel;
      L.end = canEnd;
      L.endLabel = this.endLabel;
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
    const onScreen = sx > pad && sx < LOGICAL_W - pad && sy > pad + 60 && sy < PLAY_H - pad;
    if (onScreen) {
      this.arrow.hidden = true;
      return;
    }
    const shipX = sim.ship.x - left;
    const shipY = sim.ship.y - top;
    const dx = sx - shipX;
    const dy = sy - shipY;
    const minX = pad;
    const maxX = LOGICAL_W - pad;
    const minY = pad + 80;
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
    const label = this.arrow.lastElementChild as HTMLElement;
    const d = Math.round(sim.stationDistance / 10);
    if (label.dataset.d !== String(d)) {
      label.dataset.d = String(d);
      label.textContent = `Station ${d * 10}`;
    }
  }

  private drawRadar(sim: Sim, view: { cx: number; cy: number }): void {
    const c = this.rctx;
    const W = this.radar.width;
    const H = this.radar.height;
    const w = sim.level.world.w;
    const h = sim.level.world.h;
    const sx = W / w;
    const sy = H / h;
    const big = this.radar.classList.contains('big');
    const k = big ? 1.6 : 1;
    c.clearRect(0, 0, W, H);
    c.fillStyle = 'rgba(6, 12, 28, 0.82)';
    c.fillRect(0, 0, W, H);
    const disc = sim.discovered;
    for (const z of sim.pois) {
      if (!disc.has(z.id)) continue;
      const px = z.x * sx;
      const py = z.y * sy;
      switch (z.kind) {
        case 'radiation':
          c.fillStyle = 'rgba(182,255,90,0.28)';
          c.beginPath(); c.arc(px, py, z.r * sx, 0, Math.PI * 2); c.fill();
          break;
        case 'electric':
          c.fillStyle = 'rgba(179,140,255,0.3)';
          c.beginPath(); c.arc(px, py, z.r * sx, 0, Math.PI * 2); c.fill();
          break;
        case 'field':
          c.strokeStyle = 'rgba(255,107,94,0.8)';
          c.lineWidth = 1.5 * k;
          c.setLineDash([4, 3]);
          c.beginPath(); c.arc(px, py, z.r * sx, 0, Math.PI * 2); c.stroke();
          c.setLineDash([]);
          break;
        case 'deposit': {
          const d = sim.deposits.find((x) => x.id === z.id);
          const live = !d || d.remaining > 0;
          c.fillStyle = live ? '#' + ITEM_INFO[z.res ?? 'rock'].color.toString(16).padStart(6, '0') : 'rgba(150,160,180,0.35)';
          c.beginPath(); c.arc(px, py, (z.unique ? 5 : 3.4) * k, 0, Math.PI * 2); c.fill();
          if (z.unique) { c.strokeStyle = '#ffd27a'; c.lineWidth = 1.5; c.stroke(); }
          break;
        }
        case 'wreck':
          c.fillStyle = '#ff9a3c';
          c.fillRect(px - 3.4 * k, py - 2 * k, 6.8 * k, 4 * k);
          break;
        case 'heavy':
          c.fillStyle = '#ffd27a';
          c.fillRect(px - 2.6 * k, py - 2.6 * k, 5.2 * k, 5.2 * k);
          break;
      }
    }
    const st = sim.level.station;
    c.strokeStyle = '#7ff3f8';
    c.lineWidth = 2;
    c.strokeRect(st.x * sx - 5 * k, st.y * sy - 5 * k, 10 * k, 10 * k);
    c.strokeStyle = 'rgba(255,255,255,0.35)';
    c.lineWidth = 1;
    c.strokeRect((view.cx - LOGICAL_W / 2) * sx, (view.cy - LOGICAL_H / 2) * sy, LOGICAL_W * sx, PLAY_H * sy);
    c.strokeStyle = 'rgba(62,230,240,0.25)';
    c.beginPath(); c.arc(sim.ship.x * sx, sim.ship.y * sy, sim.stats.scanRadius * sx, 0, Math.PI * 2); c.stroke();
    c.fillStyle = '#f4e6c8';
    c.beginPath(); c.arc(sim.ship.x * sx, sim.ship.y * sy, 4 * k, 0, Math.PI * 2); c.fill();
    c.strokeStyle = 'rgba(80,120,200,0.6)';
    c.lineWidth = 2;
    c.strokeRect(1, 1, W - 2, H - 2);
  }
}
