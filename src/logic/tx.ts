// Transactions atomiques et idempotentes sur une sauvegarde (jamais de modification partielle).
import type { Cost } from '../config/buildings';
import { WAREHOUSE_CAP } from '../config/buildings';
import { ITEM_INFO, ITEMS, type ItemId, type Items } from '../config/items';
import { MAX_TRANSACTIONS, cloneSave, type SaveData } from './save-model';

export type TxFailure = 'duplicate' | 'invalid' | 'insufficient' | 'maxed' | 'locked' | 'unavailable' | 'full';
export type TxResult =
  | { ok: true; state: SaveData; note?: string }
  | { ok: false; reason: TxFailure; message: string; state: SaveData };

export const fail = (state: SaveData, reason: TxFailure, message: string): TxResult => ({ ok: false, reason, message, state });

/** Exécute `mutate` sur une copie ; l'identifiant n'est consommé que si tout réussit. */
export function commit(state: SaveData, txId: string, mutate: (draft: SaveData) => string | void): TxResult {
  if (typeof txId !== 'string' || txId.length === 0) return fail(state, 'invalid', 'Identifiant de transaction manquant.');
  if (state.transactions.includes(txId)) return fail(state, 'duplicate', 'Transaction déjà traitée.');
  const draft = cloneSave(state);
  const note = mutate(draft);
  draft.transactions.push(txId);
  if (draft.transactions.length > MAX_TRANSACTIONS) draft.transactions.splice(0, draft.transactions.length - MAX_TRANSACTIONS);
  return note ? { ok: true, state: draft, note } : { ok: true, state: draft };
}

export const storageCap = (state: SaveData): number => WAREHOUSE_CAP[state.buildings.warehouse];
export const freeSpace = (state: SaveData, item: ItemId): number => Math.max(0, storageCap(state) - state.stock[item]);

/** Message listant ce qui manque pour un coût, ou null si tout est disponible. */
export function missingForCost(state: SaveData, cost: Cost): string | null {
  const missing: string[] = [];
  for (const i of ITEMS) {
    const need = cost.items[i] ?? 0;
    if (need > state.stock[i]) missing.push(`${need - state.stock[i]} ${ITEM_INFO[i].name.toLowerCase()}`);
  }
  if (cost.credits > state.credits) missing.push(`${cost.credits - state.credits} crédits`);
  return missing.length ? `Il manque : ${missing.join(', ')}.` : null;
}

export function payCost(draft: SaveData, cost: Cost): void {
  for (const i of ITEMS) draft.stock[i] -= cost.items[i] ?? 0;
  draft.credits -= cost.credits;
}

export const scaleItems = (items: Items, mult: number): Items => {
  const out: Items = {};
  for (const i of ITEMS) if (items[i]) out[i] = (items[i] as number) * mult;
  return out;
};
