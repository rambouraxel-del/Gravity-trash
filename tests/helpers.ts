import { statsFromLevels, type SimStats } from '../src/config/balance';
import type { LevelData } from '../src/logic/level';
import { Sim } from '../src/logic/sim';

export const baseStats = (over: Partial<SimStats> = {}): SimStats => ({
  ...statsFromLevels({ cargo: 0, magnet: 0, engine: 0, hull: 0 }),
  ...over,
});

/** Petite carte de test : station en (100, 400), rien d'autre par défaut. */
export function makeLevel(over: Partial<LevelData> = {}): LevelData {
  return {
    world: { w: 600, h: 600 },
    station: { x: 100, y: 400, ringR: 56 },
    stormFrontEnd: 350,
    fragments: [],
    deposits: [],
    obstacles: [],
    ...over,
  };
}

export function makeSim(level: LevelData, stats: Partial<SimStats> = {}, duration?: number): Sim {
  return new Sim({ runId: 'test', seed: 1, level, stats: baseStats(stats), hardness: 1, duration });
}

export const IDLE = { x: 0, y: 0 };

/** Fait avancer la sim `seconds` secondes avec une entrée constante. */
export function run(sim: Sim, seconds: number, input = IDLE): void {
  const steps = Math.round(seconds * 60);
  for (let i = 0; i < steps && !sim.ended; i++) sim.step(1 / 60, input);
}
