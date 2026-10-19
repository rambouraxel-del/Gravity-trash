import { PROJECT_REQUIREMENTS, type ProjectRequirement } from '../config/contracts';
import type { ItemId } from '../config/items';
import type { SaveData } from './save-model';
import { commit, fail, type TxResult } from './tx';

export const requirementProgress = (s: SaveData, r: ProjectRequirement): number => s.project.contrib[r.key] ?? 0;
export const requirementRemaining = (s: SaveData, r: ProjectRequirement): number => Math.max(0, r.amount - requirementProgress(s, r));
export const projectOpen = (s: SaveData): boolean => s.flags.projectOpen;
export const projectReady = (s: SaveData): boolean => PROJECT_REQUIREMENTS.every((r) => requirementRemaining(s, r) === 0);

/** Verse au projet tout ce qui peut l'être pour une exigence (matières du stock ou crédits). */
export function contribute(state: SaveData, key: string, txId: string, max = Infinity): TxResult {
  if (!projectOpen(state)) return fail(state, 'locked', 'Le chantier n’est pas encore ouvert.');
  if (state.project.done) return fail(state, 'duplicate', 'Le relais est déjà construit.');
  const req = PROJECT_REQUIREMENTS.find((r) => r.key === key);
  if (!req) return fail(state, 'invalid', 'Exigence inconnue.');
  const have = req.item === 'credits' ? state.credits : state.stock[req.item as ItemId];
  const n = Math.min(requirementRemaining(state, req), have, max);
  if (n < 1) return fail(state, requirementRemaining(state, req) === 0 ? 'duplicate' : 'insufficient', requirementRemaining(state, req) === 0 ? 'Exigence déjà remplie.' : 'Stock insuffisant.');
  return commit(state, txId, (d) => {
    if (req.item === 'credits') d.credits -= n;
    else d.stock[req.item as ItemId] -= n;
    d.project.contrib[key] = (d.project.contrib[key] ?? 0) + n;
  });
}

export function completeProject(state: SaveData, txId: string): TxResult {
  if (state.project.done) return fail(state, 'duplicate', 'Le relais est déjà construit.');
  if (!projectReady(state)) return fail(state, 'locked', 'Il manque encore des éléments.');
  return commit(state, txId, (d) => {
    d.project.done = true;
  });
}

export function markSuccessSeen(state: SaveData): SaveData {
  if (state.project.successSeen) return state;
  return { ...state, project: { ...state.project, successSeen: true } };
}
