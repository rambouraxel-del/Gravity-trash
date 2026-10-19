import { statsFromLevels, type EquipmentId, type SimStats } from '../src/config/balance';
import type { Items } from '../src/config/items';
import type { SectorLevel } from '../src/logic/level';
import { createDefaultSave, cloneSave, type SaveData } from '../src/logic/save-model';
import { Sim, type SimHooks } from '../src/logic/sim';

export const baseStats = (over: Partial<SimStats> = {}): SimStats => ({
  ...statsFromLevels({ cargo: 0, magnet: 0, engine: 0, hull: 0 }, 220),
  ...over,
});

/** Petit secteur de test : station en (100, 400), rien d'autre par défaut. */
export function makeLevel(over: Partial<SectorLevel> = {}): SectorLevel {
  return {
    sector: 'belt',
    world: { w: 800, h: 800 },
    station: { x: 100, y: 400, ringR: 56 },
    fragments: [],
    deposits: [],
    wrecks: [],
    heavies: [],
    obstacles: [],
    fields: [],
    radiation: [],
    electric: [],
    ...over,
  };
}

export function makeSim(level: SectorLevel, stats: Partial<SimStats> = {}, extra: { equipment?: EquipmentId | null; hooks?: SimHooks; discovered?: string[]; hardness?: number } = {}): Sim {
  return new Sim({ runId: 'test', seed: 1, level, stats: baseStats(stats), hardness: extra.hardness ?? 1, equipment: extra.equipment ?? null, hooks: extra.hooks, discovered: extra.discovered });
}

export const IDLE = { x: 0, y: 0 };

export function run(sim: Sim, seconds: number, input = IDLE): void {
  const steps = Math.round(seconds * 60);
  for (let i = 0; i < steps && !sim.ended; i++) sim.step(1 / 60, input);
}

/** Sauvegarde de test avec stock, crédits et niveaux de bâtiments donnés. */
export function saveWith(over: { stock?: Items; credits?: number; buildings?: Partial<SaveData['buildings']>; flags?: Partial<SaveData['flags']> } = {}): SaveData {
  const s = cloneSave(createDefaultSave('test-profile'));
  for (const [k, v] of Object.entries(over.stock ?? {})) s.stock[k as keyof SaveData['stock']] = v as number;
  if (over.credits !== undefined) s.credits = over.credits;
  Object.assign(s.buildings, over.buildings ?? {});
  Object.assign(s.flags, over.flags ?? {});
  return s;
}

export function mustOk<T extends { ok: boolean; state: SaveData }>(r: T): SaveData {
  if (!r.ok) throw new Error('transaction refusée : ' + JSON.stringify((r as unknown as { message?: string }).message));
  return r.state;
}

import { tickTimers, type TickReport } from '../src/logic/timers';

/** Fait avancer les minuteries de `seconds` secondes par pas d'une seconde (mutation en place). */
export function advance(state: SaveData, seconds: number): TickReport {
  const total: TickReport = { jobsFinished: [], droneReturned: false };
  for (let t = 0; t < seconds; t++) {
    const r = tickTimers(state, 1);
    total.jobsFinished.push(...r.jobsFinished);
    total.droneReturned ||= r.droneReturned;
  }
  return total;
}
