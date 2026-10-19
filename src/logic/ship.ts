import {
  BRANCHES,
  EQUIPMENTS,
  MAX_SHIP_LEVEL,
  SHIP_UPGRADE_COSTS,
  statsFromLevels,
  type Branch,
  type EquipmentId,
  type SimStats,
} from '../config/balance';
import { SCANNER_RADIUS, WORKSHOP_BRANCH_CAP } from '../config/buildings';
import type { Items } from '../config/items';
import type { SaveData } from './save-model';
import { commit, fail, missingForCost, payCost, type TxResult } from './tx';

export const branchCap = (state: SaveData): number => Math.min(MAX_SHIP_LEVEL, WORKSHOP_BRANCH_CAP[state.buildings.workshop]);
export const scanRadius = (state: SaveData): number => SCANNER_RADIUS[state.buildings.workshop];
export const shipStats = (state: SaveData): SimStats => statsFromLevels(state.ship.levels, scanRadius(state));

/** Coût du prochain niveau d'une branche, ou null au maximum absolu. */
export function nextShipCost(state: SaveData, branch: Branch): Items | null {
  const lvl = state.ship.levels[branch];
  return lvl >= MAX_SHIP_LEVEL ? null : SHIP_UPGRADE_COSTS[lvl];
}

export function purchaseShipUpgrade(state: SaveData, branch: Branch, txId: string): TxResult {
  if (!BRANCHES.includes(branch)) return fail(state, 'invalid', 'Branche inconnue.');
  const cost = nextShipCost(state, branch);
  if (!cost) return fail(state, 'maxed', 'Cette branche est au maximum.');
  if (state.ship.levels[branch] >= branchCap(state)) return fail(state, 'locked', 'Améliore l’atelier pour débloquer le niveau suivant.');
  const missing = missingForCost(state, { items: cost, credits: 0 });
  if (missing) return fail(state, 'insufficient', missing);
  return commit(state, txId, (d) => {
    payCost(d, { items: cost, credits: 0 });
    d.ship.levels[branch] += 1;
  });
}

export function buyEquipment(state: SaveData, id: EquipmentId, txId: string): TxResult {
  const eq = EQUIPMENTS[id];
  if (!eq) return fail(state, 'invalid', 'Équipement inconnu.');
  if (state.ship.owned.includes(id)) return fail(state, 'duplicate', 'Équipement déjà possédé.');
  if (state.buildings.workshop < eq.minWorkshop) return fail(state, 'locked', `Requiert l’atelier niveau ${eq.minWorkshop}.`);
  const cost = { items: eq.items, credits: eq.credits };
  const missing = missingForCost(state, cost);
  if (missing) return fail(state, 'insufficient', missing);
  return commit(state, txId, (d) => {
    payCost(d, cost);
    d.ship.owned.push(id);
  });
}

/** Équipe un outil (un seul à la fois) ou le retire (null). Hors expédition uniquement (géré par l'appelant). */
export function equip(state: SaveData, id: EquipmentId | null, txId: string): TxResult {
  if (id !== null && !state.ship.owned.includes(id)) return fail(state, 'locked', 'Équipement non possédé.');
  return commit(state, txId, (d) => {
    d.ship.equipped = id;
  });
}
