// Parcours complet de la V1 en logique pure : aucun blocage par les plafonds de stockage ni par l'ordre des déblocages.
import { describe, expect, it } from 'vitest';
import { PROJECT_REQUIREMENTS } from '../src/config/contracts';
import { ITEMS, getRecipe, type ItemId, type Items, type RecipeId } from '../src/config/items';
import { acceptMajor, completeContract, deliverToContract } from '../src/logic/contracts';
import { buildDrone, launchMission } from '../src/logic/drone';
import { depositCargo, sellItem } from '../src/logic/inventory';
import { completeProject, contribute } from '../src/logic/project';
import { deliverJobOutput, refineryBatch, startJob } from '../src/logic/refinery';
import type { SaveData } from '../src/logic/save-model';
import { buyEquipment, equip, purchaseShipUpgrade } from '../src/logic/ship';
import { buildOrUpgrade } from '../src/logic/station';
import { withVisited } from '../src/logic/timers';
import { freeSpace } from '../src/logic/tx';
import { advance, mustOk, saveWith } from './helpers';

let n = 0;
const id = (p: string) => `${p}-${++n}`;

/** Simule une expédition : apporte des matières brutes (dans la limite de l'entrepôt). */
function addRaw(s: SaveData, items: Items): SaveData {
  const out = depositCargo(s, id('gather'), items);
  expect(out.leftover, 'l’entrepôt doit pouvoir accueillir ce lot').toEqual({});
  return out.result.ok ? out.result.state : s;
}

/** S'assure d'avoir au moins ces quantités en stock (en rapportant le manque). */
function give(s: SaveData, items: Items): SaveData {
  const missing: Items = {};
  for (const i of ITEMS) {
    const need = (items[i] ?? 0) - s.stock[i];
    if (need > 0) missing[i] = need;
  }
  return Object.keys(missing).length ? addRaw(s, missing) : s;
}

/** Fabrique `qty` unités à la raffinerie (en plusieurs lots si besoin). */
function craft(s: SaveData, recipe: RecipeId, qty: number): SaveData {
  const r = getRecipe(recipe);
  let made = 0;
  while (made < qty) {
    const batch = Math.min(refineryBatch(s), qty - made);
    s = mustOk(startJob(s, recipe, batch, id('job')));
    advance(s, 2000);
    const job = s.refinery.jobs[0];
    s = mustOk(deliverJobOutput(s, job.id));
    made += batch;
  }
  expect(s.stock[r.output]).toBeGreaterThanOrEqual(0);
  return s;
}

/** Vend de la roche (1 💳) jusqu'à atteindre le solde voulu. */
function earn(s: SaveData, target: number): SaveData {
  let guard = 0;
  while (s.credits < target && guard++ < 200) {
    const room = freeSpace(s, 'rock');
    const take = Math.min(room, target - s.credits, 400);
    if (take <= 0) {
      s = mustOk(sellItem(s, 'rock', s.stock.rock, id('sell')));
      continue;
    }
    s = addRaw(s, { rock: take });
    s = mustOk(sellItem(s, 'rock', take, id('sell')));
  }
  return s;
}

const major = (s: SaveData, mid: string, bring: Items): SaveData => {
  s = give(s, bring);
  s = mustOk(acceptMajor(s, mid, id('acc')));
  s = mustOk(deliverToContract(s, `m:${mid}`, id('del')));
  return mustOk(completeContract(s, `m:${mid}`, id('com')));
};

describe('parcours complet de la V1 (logique seule)', () => {
  it('mène du départ au relais orbital sans blocage', () => {
    let s = saveWith();
    // Phase 1 : entrepôt, bureau, premier contrat majeur
    s = give(s, { rock: 40, scrap: 20 });
    s = mustOk(buildOrUpgrade(s, 'warehouse', id('b')));
    s = give(s, { rock: 60, scrap: 40 });
    s = mustOk(buildOrUpgrade(s, 'office', id('b')));
    s = major(s, 'm1-nebula', { rock: 80, scrap: 50 });
    expect(s.sectors.unlocked).toContain('nebula');
    s = withVisited(withVisited(s, 'belt'), 'nebula');

    // Phase 2 : raffinerie, lingots et cellules, route du cimetière
    s = give(s, { rock: 80, scrap: 60, crystal: 10 });
    s = mustOk(buildOrUpgrade(s, 'refinery', id('b')));
    s = give(s, { scrap: 36, ice: 16, crystal: 8 });
    s = craft(s, 'ingots', 12);
    s = craft(s, 'cells', 8);
    s = major(s, 'm2-graveyard', {});
    expect(s.sectors.unlocked).toContain('graveyard');
    s = withVisited(s, 'graveyard');

    // atelier niveau 2, améliorations jusqu'au niveau 2, équipements
    s = give(s, { rock: 100, scrap: 60 });
    s = earn(s, 100);
    s = mustOk(buildOrUpgrade(s, 'workshop', id('b')));
    for (const b of ['cargo', 'magnet', 'engine', 'hull'] as const) {
      s = give(s, { rock: 30 });
      s = mustOk(purchaseShipUpgrade(s, b, id('up')));
    }
    s = give(s, { scrap: 100, circuits: 20 });
    s = craft(s, 'ingots', 20);
    s = earn(s, 250);
    s = mustOk(buyEquipment(s, 'laser', id('eq')));
    s = mustOk(equip(s, 'laser', id('equip')));

    // Phase 3 : licence de drone, hangar, drone
    s = give(s, { circuits: 40, scrap: 60 });
    s = craft(s, 'ingots', 20);
    s = craft(s, 'techparts', 9);
    s = major(s, 'm3-drone', { circuits: 10 });
    s = earn(s, 500);
    s = give(s, { circuits: 20, scrap: 90 });
    s = craft(s, 'ingots', 30);
    s = mustOk(buildOrUpgrade(s, 'hangar', id('b')));
    s = earn(s, 300);
    s = give(s, { circuits: 10 });
    s = mustOk(buildDrone(s, id('drone')));
    s = mustOk(launchMission(s, 'belt', 'rock', id('mission')));
    expect(s.drone.status).toBe('working');

    // Phase 4 : autorisation, chantier, relais
    s = give(s, { circuits: 40, cores: 6, scrap: 120 });
    s = craft(s, 'ingots', 40);
    s = craft(s, 'techparts', 10);
    s = major(s, 'm4-relay', { cores: 6 });
    expect(s.flags.projectOpen).toBe(true);
    // l'entrepôt de niveau 1 (200) suffit pour tous les versements au chantier
    s = give(s, { scrap: 180, ice: 60, crystal: 30, circuits: 20, cores: 10 });
    s = craft(s, 'ingots', 60);
    s = give(s, { scrap: 90 });
    s = craft(s, 'ingots', 30);
    s = craft(s, 'cells', 30);
    s = craft(s, 'techparts', 15);
    s = earn(s, 3000);
    for (const r of PROJECT_REQUIREMENTS) {
      const res = contribute(s, r.key, id('give'));
      if (res.ok) s = res.state;
    }
    for (const r of PROJECT_REQUIREMENTS) expect(s.project.contrib[r.key] ?? 0, `exigence ${r.key}`).toBe(r.amount);
    s = mustOk(completeProject(s, id('done')));
    expect(s.project.done).toBe(true);
    for (const i of ITEMS) expect(s.stock[i as ItemId]).toBeGreaterThanOrEqual(0);
    expect(s.credits).toBeGreaterThanOrEqual(0);
  });
});
