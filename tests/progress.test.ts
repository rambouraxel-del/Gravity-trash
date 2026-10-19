import { describe, expect, it } from 'vitest';
import { PROJECT_REQUIREMENTS } from '../src/config/contracts';
import { buildDrone, collectDrone, droneYieldPerMinute, launchMission, recallDrone, upgradeDrone } from '../src/logic/drone';
import { completeProject, contribute, projectReady } from '../src/logic/project';
import { cloneSave } from '../src/logic/save-model';
import { withDiscoveries, withUniqueDone, withVisited } from '../src/logic/timers';
import { advance, mustOk, saveWith } from './helpers';

const droneReady = () =>
  withVisited(
    saveWith({ stock: { ingots: 100, circuits: 100, techparts: 20 }, credits: 5000, buildings: { hangar: 1 }, flags: { hangarUnlocked: true } }),
    'belt',
  );

describe('drone', () => {
  it('se fabrique une seule fois et consomme matières et crédits', () => {
    expect(buildDrone(saveWith(), 'x').ok).toBe(false);
    let s = mustOk(buildDrone(droneReady(), 'b'));
    expect(s.drone.built).toBe(true);
    expect(s.flags.droneBuilt).toBe(true);
    expect(s.credits).toBe(4700);
    expect(s.stock.ingots).toBe(90);
    expect(buildDrone(s, 'b2').ok).toBe(false);
    s = mustOk(launchMission(s, 'belt', 'rock', 'l'));
    expect(s.drone.status).toBe('working');
  });

  it('exige un secteur déjà exploré, une ressource ordinaire et un drone libre', () => {
    let s = mustOk(buildDrone(droneReady(), 'b'));
    expect(launchMission(s, 'nebula', 'ice', 'l').ok).toBe(false);
    expect(launchMission(s, 'belt', 'ice', 'l').ok).toBe(false);
    s = mustOk(launchMission(s, 'belt', 'rock', 'l1'));
    expect(launchMission(s, 'belt', 'scrap', 'l2').ok).toBe(false);
  });

  it('produit selon capacité et efficacité, revient plein, plafonné', () => {
    let s = mustOk(buildDrone(droneReady(), 'b'));
    s = mustOk(launchMission(s, 'belt', 'scrap', 'l'));
    expect(droneYieldPerMinute(s)).toBeCloseTo(3, 5); // 6 u/min × 50 %
    advance(s, 60);
    expect(s.drone.cargo.scrap).toBe(3);
    const rep = advance(s, 3600);
    expect(rep.droneReturned).toBe(true);
    expect(s.drone.status).toBe('returned');
    expect(s.drone.cargo.scrap).toBe(20); // capacité niveau 0
    advance(s, 3600);
    expect(s.drone.cargo.scrap).toBe(20); // ne dépasse jamais
  });

  it('plus productif manuellement : le drone reste modeste même amélioré', () => {
    let s = mustOk(buildDrone(droneReady(), 'b'));
    s = cloneSave(s);
    s.buildings.hangar = 3;
    s.stock.cells = 100; s.stock.techparts = 100; s.stock.ingots = 500; s.stock.circuits = 500; s.credits = 99999;
    for (const stat of ['capacity', 'speed', 'efficiency'] as const) for (let i = 0; i < 3; i++) s = mustOk(upgradeDrone(s, stat, `${stat}${i}`));
    expect(s.drone.levels).toEqual({ capacity: 3, speed: 3, efficiency: 3 });
    expect(droneYieldPerMinute(s)).toBeLessThan(20);
  });

  it('les améliorations sont limitées par le niveau du hangar', () => {
    let s = mustOk(buildDrone(droneReady(), 'b'));
    s = mustOk(upgradeDrone(s, 'speed', 'u1'));
    const r = upgradeDrone(s, 'speed', 'u2');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('locked');
  });

  it('vider la cargaison est nécessaire pour relancer ; l’entrepôt plein conserve le reste', () => {
    let s = mustOk(buildDrone(droneReady(), 'b'));
    s = mustOk(launchMission(s, 'belt', 'rock', 'l'));
    advance(s, 120);
    s = mustOk(recallDrone(s, 'r'));
    expect(launchMission(s, 'belt', 'rock', 'l2').ok).toBe(false);
    const carried = s.drone.cargo.rock as number;
    s = { ...s, stock: { ...s.stock, rock: 55 } };
    s = mustOk(collectDrone(s, 'c1'));
    expect(s.stock.rock).toBe(60);
    expect(s.drone.cargo.rock).toBe(carried - 5);
    expect(s.drone.status).toBe('returned');
    s = { ...s, stock: { ...s.stock, rock: 0 } };
    s = mustOk(collectDrone(s, 'c2'));
    expect(s.drone.status).toBe('idle');
    expect(s.stock.rock).toBe(carried - 5);
    expect(collectDrone(s, 'c3').ok).toBe(false);
    s = mustOk(launchMission(s, 'belt', 'rock', 'l3'));
    expect(s.drone.status).toBe('working');
  });
});

describe('projet final : relais orbital', () => {
  const open = (over = {}) => saveWith({ flags: { projectOpen: true }, ...over });

  it('est fermé tant que le contrat majeur n’est pas terminé', () => {
    expect(contribute(saveWith({ stock: { ingots: 100 } }), 'ingots', 'x').ok).toBe(false);
  });

  it('accepte des contributions partielles et ne retire que ce qui est versé', () => {
    let s = open({ stock: { ingots: 40 } });
    s = mustOk(contribute(s, 'ingots', 'c1'));
    expect(s.project.contrib.ingots).toBe(40);
    expect(s.stock.ingots).toBe(0);
    s = { ...s, stock: { ...s.stock, ingots: 100 } };
    s = mustOk(contribute(s, 'ingots', 'c2'));
    expect(s.project.contrib.ingots).toBe(60); // plafonné à l'exigence
    expect(s.stock.ingots).toBe(80);
    expect(contribute(s, 'ingots', 'c3').ok).toBe(false);
    expect(contribute(s, 'ingots', 'c1').ok).toBe(false);
  });

  it('les crédits financent le projet mais ne remplacent aucune matière', () => {
    let s = open({ credits: 5000 });
    s = mustOk(contribute(s, 'credits', 'f'));
    expect(s.project.contrib.credits).toBe(3000);
    expect(s.credits).toBe(2000);
    expect(contribute(s, 'ingots', 'x').ok).toBe(false);
    expect(projectReady(s)).toBe(false);
  });

  it('se termine seulement quand toutes les exigences sont remplies, une seule fois', () => {
    let s = open({ stock: { ingots: 60, cells: 30, techparts: 15, cores: 10 }, credits: 3000 });
    expect(completeProject(s, 'z').ok).toBe(false);
    for (const r of PROJECT_REQUIREMENTS) s = mustOk(contribute(s, r.key, `c-${r.key}`));
    expect(projectReady(s)).toBe(true);
    s = mustOk(completeProject(s, 'done'));
    expect(s.project.done).toBe(true);
    expect(completeProject(s, 'done2').ok).toBe(false);
    expect(s.stock.ingots).toBe(0);
  });
});

describe('découvertes et objets uniques', () => {
  it('enregistre les découvertes sans doublon', () => {
    let s = saveWith();
    s = withDiscoveries(s, 'belt', ['a', 'b']);
    const same = withDiscoveries(s, 'belt', ['a']);
    expect(same).toBe(s);
    expect(withDiscoveries(s, 'belt', ['b', 'c']).sectors.discovered.belt).toEqual(['a', 'b', 'c']);
    expect(withDiscoveries(s, 'nebula', []).sectors.discovered.nebula).toEqual([]);
  });

  it('un objet unique n’est enregistré qu’une fois', () => {
    const s = withUniqueDone(saveWith(), 'belt-container');
    expect(withUniqueDone(s, 'belt-container')).toBe(s);
    expect(s.sectors.uniquesDone).toEqual(['belt-container']);
  });
});
