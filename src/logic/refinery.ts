import { REFINERY_BATCH, REFINERY_SLOTS, REFINERY_SPEED } from '../config/buildings';
import { ITEM_INFO, ITEMS, RECIPES, getRecipe, type RecipeId } from '../config/items';
import type { SaveData } from './save-model';
import { commit, fail, freeSpace, type TxResult } from './tx';

export const refinerySlots = (s: SaveData) => REFINERY_SLOTS[s.buildings.refinery];
export const refineryBatch = (s: SaveData) => REFINERY_BATCH[s.buildings.refinery];
export const refinerySpeed = (s: SaveData) => REFINERY_SPEED[s.buildings.refinery];

/** Quantité maximale lançable pour une recette (lot, stock, entrepôt non pris en compte pour la sortie). */
export function maxBatch(state: SaveData, recipe: RecipeId): number {
  const r = getRecipe(recipe);
  let n: number = refineryBatch(state);
  for (const i of ITEMS) {
    const need = r.inputs[i] ?? 0;
    if (need > 0) n = Math.min(n, Math.floor(state.stock[i] / need));
  }
  return Math.max(0, n);
}

export function startJob(state: SaveData, recipe: RecipeId, qty: number, txId: string): TxResult {
  if (!RECIPES.some((r) => r.id === recipe)) return fail(state, 'invalid', 'Recette inconnue.');
  if (state.buildings.refinery < 1) return fail(state, 'locked', 'Construis la raffinerie.');
  if (!Number.isInteger(qty) || qty < 1) return fail(state, 'invalid', 'Quantité invalide.');
  if (state.refinery.jobs.length >= refinerySlots(state)) return fail(state, 'locked', 'Toutes les chaînes de production sont occupées.');
  if (qty > refineryBatch(state)) return fail(state, 'maxed', `Lot maximal : ${refineryBatch(state)}.`);
  const r = getRecipe(recipe);
  for (const i of ITEMS) {
    const need = (r.inputs[i] ?? 0) * qty;
    if (need > state.stock[i]) return fail(state, 'insufficient', `Il manque ${need - state.stock[i]} ${ITEM_INFO[i].name.toLowerCase()}.`);
  }
  return commit(state, txId, (d) => {
    for (const i of ITEMS) d.stock[i] -= (r.inputs[i] ?? 0) * qty;
    d.refinery.counter += 1;
    const total = (qty * r.time) / refinerySpeed(state);
    d.refinery.jobs.push({ id: `j${d.refinery.counter}`, recipe, qty, total, remaining: total, delivered: 0 });
  });
}

/** Verse au stock les unités terminées d'une production (dans la limite de l'entrepôt). */
export function deliverJobOutput(state: SaveData, jobId: string): TxResult {
  const job = state.refinery.jobs.find((j) => j.id === jobId);
  if (!job) return fail(state, 'invalid', 'Production inconnue.');
  if (job.remaining > 1e-6) return fail(state, 'locked', 'Production en cours.');
  const out = getRecipe(job.recipe).output;
  const n = Math.min(job.qty - job.delivered, freeSpace(state, out));
  if (n < 1) return fail(state, 'full', 'Entrepôt plein : libère de la place.');
  return commit(state, `jobout:${job.id}:${job.delivered}`, (d) => {
    const j = d.refinery.jobs.find((x) => x.id === jobId);
    if (!j) return;
    d.stock[out] += n;
    j.delivered += n;
    if (j.delivered >= j.qty) d.refinery.jobs = d.refinery.jobs.filter((x) => x.id !== jobId);
  });
}
