import {
  DRONE_BUILD,
  DRONE_CAPACITY,
  DRONE_EFFICIENCY,
  DRONE_RATE,
  DRONE_RESOURCES_EXCLUDED,
  DRONE_STATS,
  DRONE_UPGRADE_COSTS,
  type DroneStat,
} from '../config/balance';
import { RESOURCES, sumItems, type ItemId, type ResourceId } from '../config/items';
import { getSector, type SectorId } from '../config/sectors';
import type { SaveData } from './save-model';
import { commit, fail, freeSpace, missingForCost, payCost, type TxResult } from './tx';

export const droneCapacity = (s: SaveData) => DRONE_CAPACITY[s.drone.levels.capacity];
export const droneRate = (s: SaveData) => DRONE_RATE[s.drone.levels.speed];
export const droneEfficiency = (s: SaveData) => DRONE_EFFICIENCY[s.drone.levels.efficiency];
/** Unités par minute réellement obtenues. */
export const droneYieldPerMinute = (s: SaveData) => droneRate(s) * droneEfficiency(s);
export const droneCargoTotal = (s: SaveData) => sumItems(s.drone.cargo);
export const droneLevelCap = (s: SaveData) => s.buildings.hangar;

export function buildDrone(state: SaveData, txId: string): TxResult {
  if (state.buildings.hangar < 1) return fail(state, 'locked', 'Construis le hangar à drones.');
  if (state.drone.built) return fail(state, 'duplicate', 'Le drone est déjà fabriqué.');
  const missing = missingForCost(state, DRONE_BUILD);
  if (missing) return fail(state, 'insufficient', missing);
  return commit(state, txId, (d) => {
    payCost(d, DRONE_BUILD);
    d.drone.built = true;
    d.flags.droneBuilt = true;
  });
}

export function nextDroneCost(state: SaveData, stat: DroneStat) {
  const lvl = state.drone.levels[stat];
  return lvl >= 3 ? null : DRONE_UPGRADE_COSTS[lvl];
}

export function upgradeDrone(state: SaveData, stat: DroneStat, txId: string): TxResult {
  if (!DRONE_STATS.includes(stat)) return fail(state, 'invalid', 'Caractéristique inconnue.');
  if (!state.drone.built) return fail(state, 'locked', 'Fabrique d’abord le drone.');
  const cost = nextDroneCost(state, stat);
  if (!cost) return fail(state, 'maxed', 'Niveau maximal atteint.');
  if (state.drone.levels[stat] >= droneLevelCap(state)) return fail(state, 'locked', 'Améliore le hangar pour débloquer le niveau suivant.');
  const missing = missingForCost(state, cost);
  if (missing) return fail(state, 'insufficient', missing);
  return commit(state, txId, (d) => {
    payCost(d, cost);
    d.drone.levels[stat] += 1;
  });
}

/** Ressources ordinaires d'un secteur confiables au drone. */
export const droneResources = (sector: SectorId): ResourceId[] => getSector(sector).resources.filter((r) => !DRONE_RESOURCES_EXCLUDED.includes(r));

export function launchMission(state: SaveData, sector: SectorId, resource: ResourceId, txId: string): TxResult {
  const d0 = state.drone;
  if (!d0.built) return fail(state, 'locked', 'Fabrique d’abord le drone.');
  if (d0.status !== 'idle') return fail(state, 'locked', d0.status === 'working' ? 'Le drone est déjà en mission.' : 'Vide d’abord la cargaison du drone.');
  if (droneCargoTotal(state) > 0) return fail(state, 'locked', 'Vide d’abord la cargaison du drone.');
  if (!state.sectors.unlocked.includes(sector) || !state.sectors.visited.includes(sector)) {
    return fail(state, 'locked', 'Explore d’abord ce secteur toi-même.');
  }
  if (!droneResources(sector).includes(resource)) return fail(state, 'invalid', 'Ressource indisponible pour le drone dans ce secteur.');
  return commit(state, txId, (d) => {
    d.drone.status = 'working';
    d.drone.sector = sector;
    d.drone.resource = resource;
    d.drone.acc = 0;
  });
}

export function recallDrone(state: SaveData, txId: string): TxResult {
  if (state.drone.status !== 'working') return fail(state, 'invalid', 'Le drone n’est pas en mission.');
  return commit(state, txId, (d) => {
    d.drone.status = 'returned';
  });
}

/** Vide la cargaison du drone dans l'entrepôt (dans la limite de la place). */
export function collectDrone(state: SaveData, txId: string): TxResult {
  if (state.drone.status === 'working') return fail(state, 'locked', 'Le drone est encore en mission : rappelle-le d’abord.');
  const cargo = state.drone.cargo;
  let moved = 0;
  const plan: Partial<Record<ItemId, number>> = {};
  for (const r of RESOURCES) {
    const n = Math.min(cargo[r] ?? 0, freeSpace(state, r));
    if (n > 0) {
      plan[r] = n;
      moved += n;
    }
  }
  if (moved === 0) {
    return fail(state, droneCargoTotal(state) > 0 ? 'full' : 'invalid', droneCargoTotal(state) > 0 ? 'Entrepôt plein : libère de la place.' : 'La cargaison est vide.');
  }
  return commit(state, txId, (d) => {
    for (const r of RESOURCES) {
      const n = plan[r] ?? 0;
      if (n <= 0) continue;
      d.stock[r] += n;
      const left = (d.drone.cargo[r] ?? 0) - n;
      if (left > 0) d.drone.cargo[r] = left;
      else delete d.drone.cargo[r];
    }
    if (sumItems(d.drone.cargo) === 0) {
      d.drone.status = 'idle';
      d.drone.sector = null;
      d.drone.resource = null;
      d.drone.acc = 0;
    }
  });
}
