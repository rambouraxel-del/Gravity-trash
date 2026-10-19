import { BUILDINGS, MAX_BUILDING_LEVEL, type BuildingId, type Cost } from '../config/buildings';
import type { SaveData, FlagId } from './save-model';
import { commit, fail, missingForCost, payCost, type TxResult } from './tx';

export const buildingLevel = (state: SaveData, id: BuildingId): number => state.buildings[id];

/** Coût pour passer au niveau suivant, ou null si le niveau maximal est atteint. */
export function nextBuildingCost(state: SaveData, id: BuildingId): Cost | null {
  const lvl = state.buildings[id];
  return lvl >= MAX_BUILDING_LEVEL ? null : BUILDINGS[id].costs[lvl];
}

export interface BuildStatus {
  level: number;
  maxed: boolean;
  cost: Cost | null;
  /** Raison du verrou (prérequis de progression), ou null. */
  lockReason: string | null;
  /** Manque de matières/crédits, ou null si abordable. */
  missing: string | null;
  canBuild: boolean;
}

export function buildStatus(state: SaveData, id: BuildingId): BuildStatus {
  const info = BUILDINGS[id];
  const level = state.buildings[id];
  const cost = nextBuildingCost(state, id);
  const lockReason = info.requiresFlag && level === 0 && !state.flags[info.requiresFlag as FlagId] ? info.requiresText : null;
  const missing = cost ? missingForCost(state, cost) : null;
  return { level, maxed: cost === null, cost, lockReason, missing, canBuild: cost !== null && !lockReason && !missing };
}

export function buildOrUpgrade(state: SaveData, id: BuildingId, txId: string): TxResult {
  const st = buildStatus(state, id);
  if (st.maxed || !st.cost) return fail(state, 'maxed', 'Niveau maximal atteint.');
  if (st.lockReason) return fail(state, 'locked', st.lockReason);
  if (st.missing) return fail(state, 'insufficient', st.missing);
  const cost = st.cost;
  return commit(state, txId, (d) => {
    payCost(d, cost);
    d.buildings[id] += 1;
  });
}
