import { BUILDINGS, type BuildingId, type Cost } from '../config/buildings';
import { ITEM_INFO, ITEMS, type ItemId, type Items } from '../config/items';
import type { SaveData } from '../logic/save-model';

export const fmt = (n: number): string => Math.round(n).toLocaleString('fr-FR');
export const dec = (n: number, d = 2): string => n.toFixed(d).replace('.', ',');
export const pct = (a: number, b: number): number => (b <= 0 ? 0 : Math.max(0, Math.min(100, (a / b) * 100)));

export function fmtTime(sec: number): string {
  const s = Math.max(0, Math.ceil(sec));
  const m = Math.floor(s / 60);
  return m > 0 ? `${m} min ${String(s % 60).padStart(2, '0')} s` : `${s} s`;
}

export const itemChip = (id: ItemId, qty: number): string => `<span class="chip item" style="border-color:${ITEM_INFO[id].css}55">${ITEM_INFO[id].icon} ${fmt(qty)}</span>`;

export const itemsChips = (items: Items): string =>
  ITEMS.filter((i) => (items[i] ?? 0) > 0)
    .map((i) => itemChip(i, items[i] as number))
    .join('') || '<span class="muted small">—</span>';

/** Liste de coûts : chaque exigence indique ce qu'on a (vert) ou ce qui manque (rouge). */
export function costHtml(cost: Cost, s: SaveData): string {
  const parts: string[] = [];
  for (const i of ITEMS) {
    const need = cost.items[i] ?? 0;
    if (need <= 0) continue;
    const have = s.stock[i];
    parts.push(`<span class="cost ${have >= need ? 'ok' : 'no'}" title="${ITEM_INFO[i].name}">${ITEM_INFO[i].icon} ${fmt(have)}/${fmt(need)}</span>`);
  }
  if (cost.credits > 0) parts.push(`<span class="cost ${s.credits >= cost.credits ? 'ok' : 'no'}" title="Crédits">💳 ${fmt(s.credits)}/${fmt(cost.credits)}</span>`);
  return `<div class="costs">${parts.join('') || '<span class="muted small">Gratuit</span>'}</div>`;
}

export const buildingName = (id: BuildingId): string => BUILDINGS[id].name;

export function levelPips(level: number, cap: number, max: number): string {
  return `<div class="pips">${Array.from({ length: max }, (_, i) => `<i class="${i < level ? 'on' : i >= cap ? 'locked' : ''}"></i>`).join('')}</div>`;
}
