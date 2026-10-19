// Minuteries en temps réel (application ouverte) : raffinerie et drone.
// Mutent l'état en place (aucune matière n'est créée ici : les versements passent par des transactions).

import { droneCapacity, droneCargoTotal, droneYieldPerMinute } from './drone';
import type { SaveData } from './save-model';

export interface TickReport {
  jobsFinished: string[];
  droneReturned: boolean;
}

export function tickTimers(state: SaveData, dt: number): TickReport {
  const report: TickReport = { jobsFinished: [], droneReturned: false };
  const step = Math.max(0, Math.min(dt, 5));
  for (const job of state.refinery.jobs) {
    if (job.remaining > 0) {
      job.remaining = Math.max(0, job.remaining - step);
      if (job.remaining === 0) report.jobsFinished.push(job.id);
    }
  }
  const d = state.drone;
  if (d.built && d.status === 'working' && d.resource) {
    d.acc += (step * droneYieldPerMinute(state)) / 60;
    const room = droneCapacity(state) - droneCargoTotal(state);
    let units = Math.floor(d.acc);
    if (units > 0) {
      units = Math.min(units, room);
      d.acc -= units;
      d.cargo[d.resource] = (d.cargo[d.resource] ?? 0) + units;
    }
    if (droneCargoTotal(state) >= droneCapacity(state)) {
      d.status = 'returned';
      d.acc = 0;
      report.droneReturned = true;
    }
  }
  return report;
}

/** Marque des découvertes/uniques (ensembles : idempotent, pas de transaction nécessaire). */
export function withDiscoveries(state: SaveData, sector: keyof SaveData['sectors']['discovered'], ids: string[]): SaveData {
  const cur = new Set(state.sectors.discovered[sector]);
  const before = cur.size;
  for (const id of ids) cur.add(id);
  if (cur.size === before) return state;
  return { ...state, sectors: { ...state.sectors, discovered: { ...state.sectors.discovered, [sector]: [...cur] } } };
}

export function withUniqueDone(state: SaveData, id: string): SaveData {
  if (state.sectors.uniquesDone.includes(id)) return state;
  return { ...state, sectors: { ...state.sectors, uniquesDone: [...state.sectors.uniquesDone, id] } };
}

export function withVisited(state: SaveData, sector: SaveData['sectors']['visited'][number]): SaveData {
  if (state.sectors.visited.includes(sector)) return state;
  return { ...state, sectors: { ...state.sectors, visited: [...state.sectors.visited, sector] } };
}
