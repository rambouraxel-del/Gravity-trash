import { describe, expect, it } from 'vitest';
import { SECTORS } from '../src/config/sectors';
import { generateSector, unreachableTargets } from '../src/logic/level';

describe('génération des secteurs', () => {
  for (const cfg of SECTORS) {
    it(`${cfg.name} : tout est atteignable depuis la station (20 expéditions)`, () => {
      for (let seed = 1; seed <= 20; seed++) {
        const lvl = generateSector(cfg.id, seed);
        expect(unreachableTargets(lvl)).toEqual({ fragments: 0, deposits: 0, wrecks: 0, heavies: 0 });
      }
    });

    it(`${cfg.name} : respecte les budgets et contient les repères prévus`, () => {
      const lvl = generateSector(cfg.id, 1);
      expect(lvl.fragments.length).toBeGreaterThan(cfg.counts.fragments * 0.8);
      expect(lvl.fragments.length).toBeLessThanOrEqual(120);
      expect(lvl.deposits.length).toBeLessThanOrEqual(20);
      expect(lvl.obstacles.length + lvl.fields.reduce((a, f) => a + f.count, 0)).toBeLessThanOrEqual(45);
      expect(lvl.deposits.length).toBeGreaterThanOrEqual(cfg.counts.deposits - 2);
      const near = lvl.fragments.filter((f) => Math.hypot(f.x - lvl.station.x, f.y - lvl.station.y) < 400);
      expect(near.length).toBeGreaterThanOrEqual(5);
      for (const o of lvl.obstacles) expect(Math.hypot(o.x - lvl.station.x, o.y - lvl.station.y)).toBeGreaterThan(o.r + 240);
    });

    it(`${cfg.name} : repères fixes, contenu renouvelé`, () => {
      const a = generateSector(cfg.id, 1);
      const b = generateSector(cfg.id, 2);
      expect(a.deposits.map((d) => [d.id, d.x, d.y, d.res])).toEqual(b.deposits.map((d) => [d.id, d.x, d.y, d.res]));
      expect(a.obstacles).toEqual(b.obstacles);
      expect(a.radiation).toEqual(b.radiation);
      expect(a.fragments).not.toEqual(b.fragments);
      expect(generateSector(cfg.id, 7)).toEqual(generateSector(cfg.id, 7));
    });

    it(`${cfg.name} : les objets uniques déjà obtenus ne réapparaissent pas`, () => {
      const ids = cfg.uniques.map((u) => u.id);
      const all = generateSector(cfg.id, 1);
      const present = [...all.deposits.map((d) => d.id), ...all.wrecks.map((w) => w.id), ...all.heavies.map((h) => h.id)];
      for (const id of ids) expect(present).toContain(id);
      const done = generateSector(cfg.id, 1, new Set(ids));
      const after = [...done.deposits.map((d) => d.id), ...done.wrecks.map((w) => w.id), ...done.heavies.map((h) => h.id)];
      for (const id of ids) expect(after).not.toContain(id);
      // les repères ordinaires restent à la même place
      expect(done.obstacles).toEqual(all.obstacles);
    });
  }

  it('le premier gisement de la ceinture est de la roche, proche de la station', () => {
    const lvl = generateSector('belt', 1);
    const d = lvl.deposits[0];
    expect(d.res).toBe('rock');
    expect(Math.hypot(d.x - lvl.station.x, d.y - lvl.station.y)).toBeLessThan(540);
  });

  it('les noyaux ne se trouvent que dans le cimetière', () => {
    expect(generateSector('belt', 1).deposits.some((d) => d.res === 'cores')).toBe(false);
    expect(generateSector('nebula', 1).fragments.some((f) => f.res === 'cores')).toBe(false);
    expect(generateSector('graveyard', 1).deposits.some((d) => d.res === 'cores')).toBe(true);
  });
});
