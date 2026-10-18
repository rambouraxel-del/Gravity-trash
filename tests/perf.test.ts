import { describe, expect, it } from 'vitest';
import { statsFromLevels } from '../src/config/balance';
import { generateLevel } from '../src/logic/level';
import { Sim } from '../src/logic/sim';

describe('coût de la simulation', () => {
  it('une sortie complète de 240 s reste très en dessous du budget d’image', () => {
    const sim = new Sim({ runId: 'perf', seed: 3, level: generateLevel(3), stats: statsFromLevels({ cargo: 3, magnet: 3, engine: 3, hull: 3 }), hardness: 1 });
    const t0 = performance.now();
    let frames = 0;
    for (let i = 0; i < 240 * 60 && !sim.ended; i++) {
      // pilotage erratique pour exercer collisions, extraction et collecte
      const a = i * 0.013;
      sim.step(1 / 60, { x: Math.cos(a), y: Math.sin(a * 1.7) });
      sim.drainEvents();
      frames++;
    }
    const msPerFrame = (performance.now() - t0) / frames;
    expect(frames).toBeGreaterThan(100);
    expect(msPerFrame).toBeLessThan(1); // budget d'une image à 60 Hz : 16,6 ms
    expect(sim.fragments.length).toBeLessThanOrEqual(120);
  });
});
