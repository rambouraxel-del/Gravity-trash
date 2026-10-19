import { describe, expect, it } from 'vitest';
import { SECTORS } from '../src/config/sectors';
import { statsFromLevels } from '../src/config/balance';
import { generateSector } from '../src/logic/level';
import { Sim } from '../src/logic/sim';

describe('coût de la simulation', () => {
  for (const cfg of SECTORS) {
    it(`${cfg.name} : 10 minutes d’exploration erratique restent très en dessous du budget d’image`, () => {
      const sim = new Sim({
        runId: 'perf', seed: 3, level: generateSector(cfg.id, 3), hardness: cfg.hardness, equipment: 'laser',
        stats: statsFromLevels({ cargo: 6, magnet: 6, engine: 6, hull: 6 }, 380),
      });
      const t0 = performance.now();
      let frames = 0;
      for (let i = 0; i < 600 * 60 && !sim.ended; i++) {
        const a = i * 0.011;
        sim.step(1 / 60, { x: Math.cos(a), y: Math.sin(a * 1.7) });
        sim.drainEvents();
        frames++;
      }
      const msPerFrame = (performance.now() - t0) / frames;
      expect(frames).toBeGreaterThan(100);
      expect(msPerFrame).toBeLessThan(1); // budget d'une image à 60 Hz : 16,6 ms
      expect(sim.fragments.length).toBeLessThanOrEqual(120);
    });
  }
});
