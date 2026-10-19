import { ITEM_INFO, ITEMS, type ItemId, type Items, type ResourceId } from '../config/items';
import type { SaveData } from './save-model';
import { commit, fail, freeSpace, type TxResult } from './tx';

export interface DepositOutcome {
  result: TxResult;
  accepted: Items;
  leftover: Items;
}

/**
 * Dépose le contenu d'une soute dans l'entrepôt, dans la limite de la place disponible par matière.
 * Le surplus reste à bord (aucune perte silencieuse).
 */
export function depositCargo(state: SaveData, txId: string, contents: Items): DepositOutcome {
  const accepted: Items = {};
  const leftover: Items = {};
  let total = 0;
  for (const i of ITEMS) {
    const n = contents[i] ?? 0;
    if (n < 0 || !Number.isInteger(n)) return { result: fail(state, 'invalid', 'Quantité invalide.'), accepted: {}, leftover: contents };
    if (n === 0) continue;
    const ok = Math.min(n, freeSpace(state, i));
    if (ok > 0) accepted[i] = ok;
    if (n - ok > 0) leftover[i] = n - ok;
    total += ok;
  }
  if (total === 0) {
    return { result: fail(state, Object.keys(leftover).length ? 'full' : 'invalid', Object.keys(leftover).length ? 'Entrepôt plein.' : 'Rien à déposer.'), accepted, leftover };
  }
  const result = commit(state, txId, (d) => {
    for (const i of ITEMS) d.stock[i] += accepted[i] ?? 0;
  });
  if (!result.ok) {
    // doublon : déjà crédité auparavant, la soute est considérée comme vidée
    return { result, accepted: {}, leftover: result.reason === 'duplicate' ? {} : contents };
  }
  return { result, accepted, leftover };
}

/** Objet lourd ramené à la station : accepté en entier ou pas du tout. */
export function receiveHeavy(state: SaveData, txId: string, res: ResourceId, amount: number): TxResult {
  if (!Number.isInteger(amount) || amount < 1) return fail(state, 'invalid', 'Quantité invalide.');
  if (freeSpace(state, res) < amount) return fail(state, 'full', `Entrepôt plein : il faut ${amount} places de ${ITEM_INFO[res].name.toLowerCase()}.`);
  return commit(state, txId, (d) => {
    d.stock[res] += amount;
  });
}

export const canSell = (state: SaveData): boolean => state.buildings.office >= 1;

export function sellItem(state: SaveData, item: ItemId, qty: number, txId: string): TxResult {
  if (!canSell(state)) return fail(state, 'locked', 'Construis le bureau commercial pour vendre.');
  if (!ITEMS.includes(item) || !Number.isInteger(qty) || qty < 1) return fail(state, 'invalid', 'Vente invalide.');
  if (state.stock[item] < qty) return fail(state, 'insufficient', `Stock insuffisant : ${state.stock[item]} disponible(s).`);
  return commit(state, txId, (d) => {
    d.stock[item] -= qty;
    d.credits += qty * ITEM_INFO[item].sell;
  });
}
