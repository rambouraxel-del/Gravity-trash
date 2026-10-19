import { describe, expect, it } from 'vitest';
import { BRANCHES } from '../src/config/balance';
import { depositCargo, receiveHeavy, sellItem } from '../src/logic/inventory';
import { branchCap, buyEquipment, equip, nextShipCost, purchaseShipUpgrade } from '../src/logic/ship';
import { buildOrUpgrade, buildStatus } from '../src/logic/station';
import { deliverJobOutput, maxBatch, startJob } from '../src/logic/refinery';
import { advance, mustOk, saveWith } from './helpers';

describe('dépôt en entrepôt', () => {
  it('crédite le stock une seule fois par identifiant', () => {
    const s = saveWith();
    const r1 = depositCargo(s, 'tx1', { rock: 7, scrap: 3 });
    expect(r1.result.ok).toBe(true);
    const s1 = mustOk(r1.result);
    expect(s1.stock.rock).toBe(7);
    expect(s1.stock.scrap).toBe(3);
    const r2 = depositCargo(s1, 'tx1', { rock: 7, scrap: 3 });
    expect(r2.result.ok).toBe(false);
    expect(r2.leftover).toEqual({}); // doublon : déjà crédité, la soute est considérée vidée
    expect(s1.stock.rock).toBe(7);
  });

  it('plafonne par matière selon l’entrepôt et renvoie le surplus (jamais détruit)', () => {
    const s = saveWith({ stock: { rock: 55 } });
    const r = depositCargo(s, 'tx', { rock: 12, ice: 4 });
    expect(r.accepted).toEqual({ rock: 5, ice: 4 });
    expect(r.leftover).toEqual({ rock: 7 });
    const out = mustOk(r.result);
    expect(out.stock.rock).toBe(60); // capacité de départ
    // conservation : stock + reste = avant + apporté
    expect(out.stock.rock + (r.leftover.rock ?? 0)).toBe(55 + 12);
  });

  it('entrepôt totalement plein : rien n’est crédité, tout reste à bord', () => {
    const s = saveWith({ stock: { rock: 60 } });
    const r = depositCargo(s, 'tx', { rock: 5 });
    expect(r.result.ok).toBe(false);
    expect(r.leftover).toEqual({ rock: 5 });
    expect(r.result.state).toBe(s);
  });

  it('l’entrepôt amélioré augmente la capacité', () => {
    const s = saveWith({ stock: { rock: 60 }, buildings: { warehouse: 2 } });
    expect(depositCargo(s, 'tx', { rock: 100 }).accepted).toEqual({ rock: 100 });
  });

  it('refuse un objet lourd si la place manque, l’accepte sinon', () => {
    const s = saveWith({ stock: { ice: 50 } });
    expect(receiveHeavy(s, 'h1', 'ice', 20).ok).toBe(false);
    expect(mustOk(receiveHeavy(s, 'h2', 'ice', 10)).stock.ice).toBe(60);
  });
});

describe('vente directe', () => {
  it('exige le bureau commercial, retire le stock et crédite au prix fixe', () => {
    const s = saveWith({ stock: { crystal: 10 } });
    expect(sellItem(s, 'crystal', 4, 'v').ok).toBe(false);
    const o = saveWith({ stock: { crystal: 10 }, buildings: { office: 1 }, credits: 0 });
    const r = mustOk(sellItem(o, 'crystal', 4, 'v1'));
    expect(r.credits).toBe(20);
    expect(r.stock.crystal).toBe(6);
    expect(sellItem(r, 'crystal', 7, 'v2').ok).toBe(false);
    expect(sellItem(r, 'crystal', 4, 'v1').ok).toBe(false); // idempotent
  });
});

describe('améliorations du vaisseau', () => {
  it('les coûts suivent le tableau et débitent exactement', () => {
    let s = saveWith({ stock: { rock: 200, scrap: 100 } });
    expect(nextShipCost(s, 'cargo')).toEqual({ rock: 30 });
    s = mustOk(purchaseShipUpgrade(s, 'cargo', 'a'));
    expect(s.stock.rock).toBe(170);
    expect(nextShipCost(s, 'cargo')).toEqual({ rock: 60, scrap: 30 });
    s = mustOk(purchaseShipUpgrade(s, 'cargo', 'b'));
    expect(s.stock.rock).toBe(110);
    expect(s.stock.scrap).toBe(70);
    expect(s.ship.levels.cargo).toBe(2);
  });

  it('refuse sans matériaux ou au-delà du palier de l’atelier, sans rien modifier', () => {
    const s = saveWith({ stock: { rock: 10 } });
    const r = purchaseShipUpgrade(s, 'engine', 'x');
    expect(r.ok).toBe(false);
    expect(r.state).toBe(s);
    const capped = saveWith({ stock: { rock: 500, scrap: 500, ice: 500 } });
    capped.ship.levels.cargo = 2; // plafond de l'atelier niveau 1
    expect(branchCap(capped)).toBe(2);
    const r2 = purchaseShipUpgrade(capped, 'cargo', 'y');
    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(r2.reason).toBe('locked');
  });

  it('un double clic (même identifiant) ne s’applique qu’une fois', () => {
    const s = saveWith({ stock: { rock: 200 } });
    const a = mustOk(purchaseShipUpgrade(s, 'hull', 'same'));
    const b = purchaseShipUpgrade(a, 'hull', 'same');
    expect(b.ok).toBe(false);
    expect(b.state.ship.levels.hull).toBe(1);
    expect(b.state.stock.rock).toBe(170);
  });

  it('toutes les branches existent et partent de zéro', () => {
    expect(BRANCHES.map((b) => saveWith().ship.levels[b])).toEqual([0, 0, 0, 0]);
  });
});

describe('équipements', () => {
  const rich = () => saveWith({ stock: { ingots: 50, circuits: 20, cells: 20 }, credits: 2000, buildings: { workshop: 2 } });

  it('exigent l’atelier niveau 2, les matières et les crédits', () => {
    expect(buyEquipment(saveWith({ stock: { ingots: 50, circuits: 20 }, credits: 2000 }), 'laser', 'x').ok).toBe(false);
    const s = mustOk(buyEquipment(rich(), 'laser', 'l'));
    expect(s.ship.owned).toEqual(['laser']);
    expect(s.credits).toBe(1750);
    expect(s.stock.ingots).toBe(42);
    expect(buyEquipment(s, 'laser', 'l2').ok).toBe(false);
  });

  it('un seul outil équipé à la fois, seulement s’il est possédé', () => {
    let s = mustOk(buyEquipment(rich(), 'laser', 'l'));
    s = mustOk(buyEquipment(s, 'tractor', 't'));
    expect(equip(rich(), 'laser', 'e').ok).toBe(false);
    s = mustOk(equip(s, 'laser', 'e1'));
    expect(s.ship.equipped).toBe('laser');
    s = mustOk(equip(s, 'tractor', 'e2'));
    expect(s.ship.equipped).toBe('tractor');
    s = mustOk(equip(s, null, 'e3'));
    expect(s.ship.equipped).toBeNull();
  });
});

describe('construction de la station', () => {
  it('l’atelier et un stockage de départ sont disponibles, les quatre autres installations sont à construire', () => {
    const s = saveWith();
    expect(s.buildings).toEqual({ workshop: 1, warehouse: 0, refinery: 0, office: 0, hangar: 0 });
  });

  it('construire consomme matières et crédits, passe au niveau suivant, jusqu’au niveau 3', () => {
    let s = saveWith({ stock: { rock: 40, scrap: 20 } });
    s = mustOk(buildOrUpgrade(s, 'warehouse', 'b1'));
    expect(s.buildings.warehouse).toBe(1);
    expect(s.stock.rock).toBe(0);
    expect(s.stock.scrap).toBe(0);
    const big = saveWith({ stock: { rock: 500, scrap: 500, ingots: 100, cells: 50, circuits: 50 }, credits: 5000 });
    let b = mustOk(buildOrUpgrade(big, 'warehouse', 'u1'));
    b = mustOk(buildOrUpgrade(b, 'warehouse', 'u2'));
    b = mustOk(buildOrUpgrade(b, 'warehouse', 'u3'));
    expect(b.buildings.warehouse).toBe(3);
    expect(buildStatus(b, 'warehouse').maxed).toBe(true);
    expect(buildOrUpgrade(b, 'warehouse', 'u4').ok).toBe(false);
  });

  it('refuse si une matière ou des crédits manquent, sans modification partielle', () => {
    const s = saveWith({ stock: { rock: 100, scrap: 100 }, credits: 10 });
    const r = buildOrUpgrade(s, 'office', 'x');
    expect(r.ok).toBe(false);
    expect(r.state).toBe(s);
    expect(s.stock.rock).toBe(100);
  });

  it('le hangar exige la licence de drone', () => {
    const rich = saveWith({ stock: { ingots: 100, circuits: 100, techparts: 50 }, credits: 9999 });
    const r = buildOrUpgrade(rich, 'hangar', 'h');
    expect(r.ok).toBe(false);
    expect(buildStatus(rich, 'hangar').lockReason).toContain('licence');
    const licensed = saveWith({ stock: { ingots: 100, circuits: 100, techparts: 50 }, credits: 9999, flags: { hangarUnlocked: true } });
    expect(buildOrUpgrade(licensed, 'hangar', 'h2').ok).toBe(true);
  });

  it('les crédits ne remplacent jamais les matériaux', () => {
    const s = saveWith({ credits: 100000 });
    expect(buildOrUpgrade(s, 'warehouse', 'w').ok).toBe(false);
  });
});

describe('raffinerie', () => {
  const ready = (stock = {}) => saveWith({ stock: { scrap: 30, ice: 10, crystal: 10, circuits: 10, ingots: 10, ...stock }, buildings: { refinery: 1 } });

  it('consomme réellement les matières au lancement', () => {
    const s = mustOk(startJob(ready(), 'ingots', 5, 'j1'));
    expect(s.stock.scrap).toBe(15);
    expect(s.refinery.jobs).toHaveLength(1);
    expect(s.refinery.jobs[0].total).toBeCloseTo(40, 5); // 5 × 8 s
  });

  it('refuse sans matière, sans raffinerie, au-delà du lot ou des chaînes disponibles', () => {
    expect(startJob(saveWith({ stock: { scrap: 30 } }), 'ingots', 1, 'x').ok).toBe(false);
    expect(startJob(ready({ scrap: 2 }), 'ingots', 1, 'x').ok).toBe(false);
    expect(startJob(ready(), 'ingots', 6, 'x').ok).toBe(false); // lot max 5 au niveau 1
    const one = mustOk(startJob(ready(), 'ingots', 2, 'a'));
    expect(startJob(one, 'cells', 1, 'b').ok).toBe(false); // une seule chaîne au niveau 1
    expect(maxBatch(ready(), 'ingots')).toBe(5);
    expect(maxBatch(ready({ scrap: 7 }), 'ingots')).toBe(2);
  });

  it('les trois chaînes de la V1 produisent les bons produits', () => {
    let s = ready({ ice: 10, crystal: 5, ingots: 10, circuits: 3 });
    s = { ...s, buildings: { ...s.buildings, refinery: 3 } };
    s = mustOk(startJob(s, 'cells', 2, 'c'));
    expect([s.stock.ice, s.stock.crystal]).toEqual([6, 3]);
    s = mustOk(startJob(s, 'techparts', 3, 't'));
    expect([s.stock.ingots, s.stock.circuits]).toEqual([4, 0]);
  });

  it('une production terminée verse le produit une seule fois', () => {
    let s = mustOk(startJob(ready(), 'ingots', 2, 'j1'));
    expect(deliverJobOutput(s, 'j1').ok).toBe(false); // en cours
    const rep = advance(s, 100);
    expect(rep.jobsFinished).toEqual(['j1']);
    const before = s.stock.ingots;
    s = mustOk(deliverJobOutput(s, 'j1'));
    expect(s.stock.ingots).toBe(before + 2);
    expect(s.refinery.jobs).toHaveLength(0);
    expect(deliverJobOutput(s, 'j1').ok).toBe(false);
  });

  it('entrepôt plein : la sortie attend, puis se verse en deux temps sans perte', () => {
    let s = ready({ ingots: 59 });
    s = mustOk(startJob(s, 'ingots', 5, 'tx'));
    advance(s, 1000);
    s = mustOk(deliverJobOutput(s, 'j1'));
    expect(s.stock.ingots).toBe(60);
    expect(s.refinery.jobs[0].delivered).toBe(1);
    expect(deliverJobOutput(s, 'j1').ok).toBe(false); // plein
    s = { ...s, stock: { ...s.stock, ingots: 20 } };
    s = mustOk(deliverJobOutput(s, 'j1'));
    expect(s.stock.ingots).toBe(24);
    expect(s.refinery.jobs).toHaveLength(0);
  });

  it('un niveau supérieur accélère le traitement', () => {
    const s1 = mustOk(startJob(ready(), 'ingots', 5, 'a'));
    const s3 = mustOk(startJob({ ...ready(), buildings: { ...ready().buildings, refinery: 3 } }, 'ingots', 5, 'a'));
    expect(s3.refinery.jobs[0].total).toBeLessThan(s1.refinery.jobs[0].total);
  });
});
