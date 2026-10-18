import { describe, expect, it } from 'vitest';
import {
  applyDeposit,
  deliver,
  deliveryStatus,
  nextUpgradeCost,
  openNextRegion,
  purchaseUpgrade,
  transitionStatus,
  workshopProgress,
} from '../src/logic/economy';
import { createDefaultSave, cloneSave, type SaveData } from '../src/logic/save-model';
import { BRANCHES } from '../src/config/regions';

const withStone = (n: number): SaveData => {
  const s = createDefaultSave('test');
  s.stock.stone = n;
  return s;
};
const maxed = (s: SaveData): SaveData => {
  const c = cloneSave(s);
  for (const b of BRANCHES) c.levels[b] = 3;
  return c;
};

describe('dépôt', () => {
  it('convertit les fragments en tonnes (10 t chacun) une seule fois par transaction', () => {
    const s = createDefaultSave('t');
    const r1 = applyDeposit(s, 'tx1', 7);
    expect(r1.ok && r1.state.stock.stone).toBe(70);
    if (!r1.ok) throw new Error();
    const r2 = applyDeposit(r1.state, 'tx1', 7);
    expect(r2.ok).toBe(false);
    expect(r2.state.stock.stone).toBe(70);
  });
  it('refuse une quantité invalide sans rien modifier', () => {
    const s = createDefaultSave('t');
    expect(applyDeposit(s, 'a', -1).ok).toBe(false);
    expect(applyDeposit(s, 'b', 1.5).ok).toBe(false);
    expect(s.stock.stone).toBe(0);
  });
  it("ne modifie pas l'état d'origine", () => {
    const s = createDefaultSave('t');
    applyDeposit(s, 'a', 3);
    expect(s.stock.stone).toBe(0);
    expect(s.transactions).toEqual([]);
  });
});

describe('achats atomiques', () => {
  it('suit les prix 40 / 80 / 120 t', () => {
    let s = withStone(1000);
    const costs: number[] = [];
    for (let i = 0; i < 3; i++) {
      costs.push(nextUpgradeCost(s, 'cargo') as number);
      const r = purchaseUpgrade(s, 'cargo', `u${i}`);
      if (!r.ok) throw new Error(r.message);
      s = r.state;
    }
    expect(costs).toEqual([40, 80, 120]);
    expect(s.stock.stone).toBe(1000 - 240);
    expect(s.levels.cargo).toBe(3);
    expect(nextUpgradeCost(s, 'cargo')).toBeNull();
  });
  it('refuse sans stock suffisant, sans aucune modification', () => {
    const s = withStone(39);
    const r = purchaseUpgrade(s, 'engine', 'x');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('insufficient');
    expect(r.state).toBe(s);
    expect(s.stock.stone).toBe(39);
    expect(s.levels.engine).toBe(0);
  });
  it('ne rejoue pas un double clic (même identifiant)', () => {
    const s = withStone(500);
    const r1 = purchaseUpgrade(s, 'hull', 'same');
    if (!r1.ok) throw new Error();
    const r2 = purchaseUpgrade(r1.state, 'hull', 'same');
    expect(r2.ok).toBe(false);
    expect(r2.state.levels.hull).toBe(1);
    expect(r2.state.stock.stone).toBe(460);
  });
  it('plafonne chaque branche à 3 dans la région 1', () => {
    const s = maxed(withStone(500));
    const r = purchaseUpgrade(s, 'magnet', 'm');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('maxed');
  });
  it('ne produit jamais de stock négatif', () => {
    let s = withStone(40);
    const a = purchaseUpgrade(s, 'cargo', '1');
    if (a.ok) s = a.state;
    const b = purchaseUpgrade(s, 'cargo', '2');
    expect(b.ok).toBe(false);
    expect(s.stock.stone).toBe(0);
  });
  it("compte l'atelier x/12", () => {
    let s = withStone(1000);
    expect(workshopProgress(s)).toEqual({ done: 0, total: 12 });
    const r = purchaseUpgrade(s, 'cargo', 'a');
    if (r.ok) s = r.state;
    expect(workshopProgress(s).done).toBe(1);
    expect(workshopProgress(maxed(s)).done).toBe(12);
  });
});

describe('livraison et compteur « livré »', () => {
  it('est verrouillée tant que les 4 branches ne sont pas maximisées, avec la cause', () => {
    const s = withStone(2000);
    const st = deliveryStatus(s);
    expect(st.unlocked).toBe(false);
    expect(st.lockReason).toContain('0/12');
    const r = deliver(s, 100, 'd1');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('locked');
    expect(s.stock.stone).toBe(2000);
  });
  it('retire du stock et crédite le compteur livré (partielle possible)', () => {
    const s = maxed(withStone(300));
    const r = deliver(s, 120, 'd1');
    if (!r.ok) throw new Error(r.message);
    expect(r.state.stock.stone).toBe(180);
    expect(r.state.delivered[0]).toBe(120);
    const r2 = deliver(r.state, 80, 'd2');
    if (!r2.ok) throw new Error(r2.message);
    expect(r2.state.delivered[0]).toBe(200);
    expect(r2.state.stock.stone).toBe(100);
  });
  it('ne livre pas plus que le stock ni plus que le reste du quota', () => {
    const s = maxed(withStone(50));
    expect(deliver(s, 60, 'a').ok).toBe(false);
    const rich = maxed(withStone(5000));
    expect(deliver(rich, 1001, 'b').ok).toBe(false);
    expect(deliveryStatus(rich).maxDeliverable).toBe(1000);
  });
  it('les achats ne comptent jamais comme livraison', () => {
    let s = withStone(1000);
    for (const b of BRANCHES) {
      for (let i = 0; i < 3; i++) {
        const r = purchaseUpgrade(s, b, `${b}${i}`);
        if (r.ok) s = r.state;
      }
    }
    expect(s.delivered[0]).toBe(0);
  });
  it('conserve un stock économisé avant maximisation pour la livraison', () => {
    let s = withStone(960 + 1000);
    for (const b of BRANCHES) {
      for (let i = 0; i < 3; i++) {
        const r = purchaseUpgrade(s, b, `${b}${i}`);
        if (!r.ok) throw new Error(r.message);
        s = r.state;
      }
    }
    expect(s.stock.stone).toBe(1000);
    const r = deliver(s, 1000, 'all');
    expect(r.ok).toBe(true);
  });
  it('est idempotente', () => {
    const s = maxed(withStone(500));
    const a = deliver(s, 100, 'same');
    if (!a.ok) throw new Error();
    const b = deliver(a.state, 100, 'same');
    expect(b.ok).toBe(false);
    expect(b.state.delivered[0]).toBe(100);
  });
});

describe('transition vers la région 2', () => {
  it('branches maximisées SEULES ne suffisent pas', () => {
    const s = maxed(withStone(0));
    const t = transitionStatus(s);
    expect(t.upgradesOk).toBe(true);
    expect(t.canOpen).toBe(false);
    expect(openNextRegion(s, 'o').ok).toBe(false);
  });
  it('quota livré SEUL ne suffit pas', () => {
    const s = withStone(0);
    s.delivered[0] = 1000;
    const t = transitionStatus(s);
    expect(t.deliveryOk).toBe(true);
    expect(t.canOpen).toBe(false);
    expect(openNextRegion(s, 'o').ok).toBe(false);
  });
  it('les deux conditions ouvrent la région 2, une seule fois', () => {
    const s = maxed(withStone(0));
    s.delivered[0] = 1000;
    expect(transitionStatus(s).canOpen).toBe(true);
    const r = openNextRegion(s, 'open');
    if (!r.ok) throw new Error(r.message);
    expect(r.state.unlockedRegions).toEqual([1, 2]);
    const again = openNextRegion(r.state, 'open2');
    expect(again.ok).toBe(false);
    expect(transitionStatus(r.state).alreadyUnlocked).toBe(true);
  });
  it('les niveaux sont conservés au passage', () => {
    const s = maxed(withStone(0));
    s.delivered[0] = 1000;
    const r = openNextRegion(s, 'open');
    if (!r.ok) throw new Error();
    for (const b of BRANCHES) expect(r.state.levels[b]).toBe(3);
  });
  it('parcours complet : 1 960 t de pierre au total', () => {
    let s = withStone(1960);
    for (const b of BRANCHES) {
      for (let i = 0; i < 3; i++) {
        const r = purchaseUpgrade(s, b, `${b}${i}`);
        if (!r.ok) throw new Error(r.message);
        s = r.state;
      }
    }
    const d = deliver(s, 1000, 'd');
    if (!d.ok) throw new Error(d.message);
    const o = openNextRegion(d.state, 'o');
    expect(o.ok).toBe(true);
    if (o.ok) expect(o.state.stock.stone).toBe(0);
  });
});
