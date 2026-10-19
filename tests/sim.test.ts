import { describe, expect, it } from 'vitest';
import { IDLE, makeLevel, makeSim, run } from './helpers';
import type { Items } from '../src/config/items';

const ring = { x: 100, y: 400 };

describe('soute', () => {
  it('ne dépasse jamais la capacité et conserve le surplus dans le monde', () => {
    const frags = Array.from({ length: 8 }, (_, i) => ({ x: 400 + (i % 4) * 6, y: 400 + Math.floor(i / 4) * 6, res: 'rock' as const, variant: 0 }));
    const sim = makeSim(makeLevel({ fragments: frags }), { cargoCapacity: 3 });
    sim.ship.x = 400; sim.ship.y = 400;
    run(sim, 1);
    expect(sim.cargo.used).toBe(3);
    expect(sim.fragments.length).toBe(5);
    expect(sim.cargo.used + sim.fragments.length).toBe(8);
  });

  it('range chaque matière séparément', () => {
    const frags = [
      { x: 400, y: 400, res: 'rock' as const, variant: 0 },
      { x: 405, y: 400, res: 'scrap' as const, variant: 0 },
      { x: 410, y: 400, res: 'scrap' as const, variant: 0 },
    ];
    const sim = makeSim(makeLevel({ fragments: frags }));
    sim.ship.x = 400; sim.ship.y = 400;
    run(sim, 1);
    expect(sim.cargo.contents()).toEqual({ rock: 1, scrap: 2 });
  });

  it('réduit la vitesse de 10 % au maximum quand elle est pleine, et normalise les diagonales', () => {
    const a = makeSim(makeLevel(), { cargoCapacity: 10, maxSpeed: 200 });
    a.ship.x = 300; a.ship.y = 300;
    run(a, 1.5, { x: 1, y: 1 });
    expect(a.speed).toBeCloseTo(200, 0);
    const b = makeSim(makeLevel(), { cargoCapacity: 10, maxSpeed: 200 });
    b.ship.x = 300; b.ship.y = 300;
    b.cargo.set({ rock: 10 });
    run(b, 1.5, { x: 1, y: 0 });
    expect(b.speed).toBeCloseTo(180, 0);
  });
});

describe('dépôt', () => {
  it('dépose toute la cargaison une seule fois après 2 s à faible vitesse', () => {
    const calls: Items[] = [];
    const sim = makeSim(makeLevel(), {}, { hooks: { deposit: (_id, c) => { calls.push(c); return {}; }, recoverHeavy: () => true } });
    sim.ship.x = ring.x; sim.ship.y = ring.y;
    sim.cargo.set({ rock: 4, scrap: 3 });
    run(sim, 1.9);
    expect(calls).toHaveLength(0);
    run(sim, 0.3);
    expect(calls).toEqual([{ rock: 4, scrap: 3 }]);
    expect(sim.cargo.used).toBe(0);
    run(sim, 5);
    expect(calls).toHaveLength(1);
    expect(sim.deposited).toEqual({ rock: 4, scrap: 3 });
  });

  it('entrepôt plein : le surplus reste à bord, sans perte, et un seul avertissement', () => {
    let calls = 0;
    const sim = makeSim(makeLevel(), {}, { hooks: { deposit: (_id, c) => { calls++; return { rock: (c.rock ?? 0) - 2 }; }, recoverHeavy: () => true } });
    sim.ship.x = ring.x; sim.ship.y = ring.y;
    sim.cargo.set({ rock: 5 });
    run(sim, 6);
    expect(sim.cargo.contents()).toEqual({ rock: 3 });
    expect(sim.deposited).toEqual({ rock: 2 });
    expect(calls).toBe(1); // pas de tentative répétée tant que rien ne change
    const ev = sim.drainEvents();
    expect(ev.filter((e) => e.type === 'storageFull')).toHaveLength(1);
  });

  it('ne dépose pas si le vaisseau reste rapide dans l’anneau', () => {
    const sim = makeSim(makeLevel(), { maxSpeed: 200 });
    sim.ship.x = ring.x - 40; sim.ship.y = ring.y;
    sim.cargo.set({ rock: 4 });
    for (let i = 0; i < 120; i++) sim.step(1 / 60, { x: i % 20 < 10 ? 1 : -1, y: 0 });
    expect(sim.cargo.used).toBe(4);
  });

  it('répare la coque après le délai supplémentaire', () => {
    const sim = makeSim(makeLevel(), { hullMax: 3, repairDelay: 3 });
    sim.ship.x = ring.x; sim.ship.y = ring.y;
    sim.ship.hull = 1;
    run(sim, 4.9);
    expect(sim.ship.hull).toBe(1);
    run(sim, 0.3);
    expect(sim.ship.hull).toBe(3);
  });
});

describe('fin d’expédition', () => {
  it('aucun chronomètre : l’expédition ne se termine jamais d’elle-même', () => {
    const sim = makeSim(makeLevel());
    sim.ship.x = 500; sim.ship.y = 300;
    for (let i = 0; i < 20; i++) sim.step(0.5, IDLE); // 10 s simulées par lot
    run(sim, 60 * 25);
    expect(sim.ended).toBe(false);
    expect(sim.time).toBeGreaterThan(1500);
  });

  it('retour volontaire dans l’anneau : dépôt puis fin', () => {
    const sim = makeSim(makeLevel());
    sim.ship.x = 400; sim.ship.y = 200;
    sim.step(0.05, IDLE);
    expect(sim.requestEnd()).toBe('denied');
    sim.ship.x = ring.x; sim.ship.y = ring.y;
    sim.cargo.set({ ice: 2 });
    sim.step(0.05, IDLE);
    expect(sim.requestEnd()).toBe('ended');
    expect(sim.outcome).toBe('docked');
    expect(sim.deposited).toEqual({ ice: 2 });
  });

  it('retour avec entrepôt plein : demande confirmation, puis perte explicite du reste', () => {
    const sim = makeSim(makeLevel(), {}, { hooks: { deposit: () => ({ rock: 3 }), recoverHeavy: () => true } });
    sim.ship.x = ring.x; sim.ship.y = ring.y;
    sim.cargo.set({ rock: 3 });
    sim.step(0.05, IDLE);
    expect(sim.requestEnd()).toBe('leftover');
    expect(sim.ended).toBe(false);
    expect(sim.cargo.used).toBe(3);
    expect(sim.requestEnd(true)).toBe('ended');
    expect(sim.lost).toEqual({ rock: 3 });
  });

  it('rapatriement d’urgence : cargaison perdue, dépôts antérieurs conservés', () => {
    const sim = makeSim(makeLevel());
    sim.ship.x = ring.x; sim.ship.y = ring.y;
    sim.cargo.set({ rock: 4 });
    run(sim, 2.2);
    expect(sim.deposited).toEqual({ rock: 4 });
    sim.ship.x = 500; sim.ship.y = 500;
    sim.cargo.set({ scrap: 6 });
    sim.emergency();
    expect(sim.outcome).toBe('emergency');
    expect(sim.lost).toEqual({ scrap: 6 });
    expect(sim.deposited).toEqual({ rock: 4 });
  });

  it('coque à zéro : perte de la seule cargaison courante', () => {
    const sim = makeSim(makeLevel({ obstacles: [{ id: 'o', x: 300, y: 300, r: 30, variant: 0 }] }), { hullMax: 1 });
    sim.ship.x = 300 - 30 - 12; sim.ship.y = 300;
    sim.cargo.set({ rock: 3 });
    run(sim, 0.1, { x: 1, y: 0 });
    expect(sim.ended).toBe(true);
    expect(sim.outcome).toBe('wrecked');
    expect(sim.lost).toEqual({ rock: 3 });
    expect(sim.deposited).toEqual({});
  });
});

describe('dangers', () => {
  it('un choc retire un seul point, puis 1,2 s d’invulnérabilité', () => {
    const sim = makeSim(makeLevel({ obstacles: [{ id: 'o', x: 300, y: 300, r: 40, variant: 0 }] }), { hullMax: 5 });
    sim.ship.x = 300 - 40 - 12; sim.ship.y = 300;
    for (let i = 0; i < 40; i++) sim.step(1 / 60, { x: 1, y: 0 });
    expect(sim.ship.hull).toBe(4);
    expect(sim.drainEvents().filter((e) => e.type === 'impact')).toHaveLength(1);
  });

  it('un fragment ou un gisement ne blessent pas', () => {
    const sim = makeSim(makeLevel({ fragments: [{ x: 300, y: 300, res: 'rock', variant: 0 }], deposits: [{ id: 'd', x: 340, y: 300, r: 26, res: 'rock', amount: 3, variant: 0 }] }));
    sim.ship.x = 300; sim.ship.y = 300;
    run(sim, 1, { x: 1, y: 0 });
    expect(sim.ship.hull).toBe(sim.stats.hullMax);
  });

  it('la radiation inflige des dégâts à intervalle régulier, jamais dans l’anneau', () => {
    const lvl = makeLevel({ radiation: [{ id: 'r', x: 500, y: 500, r: 150 }] });
    const sim = makeSim(lvl, { hullMax: 10, hazardInterval: 1.5 });
    sim.ship.x = 500; sim.ship.y = 500;
    run(sim, 1.4);
    expect(sim.ship.hull).toBe(10);
    run(sim, 0.2);
    expect(sim.ship.hull).toBe(9);
    run(sim, 3.1);
    expect(sim.ship.hull).toBe(7);
    // sortie de la zone : plus de dégâts
    sim.ship.x = 700; sim.ship.y = 700;
    run(sim, 5);
    expect(sim.ship.hull).toBe(7);
    // une meilleure coque ralentit les dégâts
    const tough = makeSim(lvl, { hullMax: 10, hazardInterval: 2.5 });
    tough.ship.x = 500; tough.ship.y = 500;
    run(tough, 2.2);
    expect(tough.ship.hull).toBe(10);
  });

  it('le courant électrique est annoncé (avertissement) avant de décharger, une fois par décharge', () => {
    const sim = makeSim(makeLevel({ electric: [{ id: 'e', x: 500, y: 500, r: 120 }] }), { hullMax: 10 });
    sim.ship.x = 500; sim.ship.y = 500;
    const z = sim.electric[0];
    let sawWarn = false;
    let hullAtWarn = -1;
    for (let i = 0; i < 60 * 8 && !sim.ended; i++) {
      sim.step(1 / 60, IDLE);
      const st = sim.electricState(z);
      if (st === 'warn' && !sawWarn) { sawWarn = true; hullAtWarn = sim.ship.hull; }
    }
    expect(sawWarn).toBe(true);
    expect(hullAtWarn).toBe(10); // aucun dégât avant la phase active
    expect(sim.ship.hull).toBeLessThan(10);
    expect(sim.ship.hull).toBeGreaterThanOrEqual(10 - 2 * 2); // au plus une décharge par cycle de 4 s
  });

  it('les astéroïdes instables bougent et blessent', () => {
    const sim = makeSim(makeLevel({ fields: [{ id: 'f', x: 400, y: 400, r: 120, count: 3 }] }));
    expect(sim.drifters).toHaveLength(3);
    const before = sim.drifters.map((d) => [d.x, d.y]);
    sim.ship.x = 700; sim.ship.y = 700;
    run(sim, 3);
    const after = sim.drifters.map((d) => [d.x, d.y]);
    expect(after).not.toEqual(before);
    for (const d of sim.drifters) expect(Math.hypot(d.x - 400, d.y - 400)).toBeLessThanOrEqual(120 + 0.01);
  });
});

describe('minage et laser', () => {
  const deposit = { id: 'd', x: 300, y: 300, r: 26, res: 'ice' as const, amount: 3, variant: 0 };

  it('extrait après 0,3 s puis un fragment par 0,6 s, quantité finie, matière correcte', () => {
    const sim = makeSim(makeLevel({ deposits: [deposit] }), { magnetRange: 56 });
    sim.ship.x = 300 - 26 - 14 - 10; sim.ship.y = 300;
    run(sim, 0.25);
    expect(sim.deposits[0].remaining).toBe(3);
    run(sim, 6.5);
    expect(sim.deposits[0].remaining).toBe(0);
    expect(sim.cargo.contents()).toEqual({ ice: 3 });
    expect(sim.cargo.used + sim.fragments.length).toBe(3);
  });

  it('suspend l’extraction quand la soute est pleine, sans perdre de matière', () => {
    const sim = makeSim(makeLevel({ deposits: [deposit] }), { cargoCapacity: 1 });
    sim.ship.x = 300 - 26 - 14 - 10; sim.ship.y = 300;
    run(sim, 8);
    expect(sim.cargo.used).toBe(1);
    expect(sim.deposits[0].remaining + sim.fragments.length + sim.cargo.used).toBe(3);
  });

  it('conserve la progression après être sorti de portée', () => {
    const sim = makeSim(makeLevel({ deposits: [deposit] }), { magnetRange: 56 });
    sim.ship.x = 300 - 26 - 14 - 10; sim.ship.y = 300;
    run(sim, 0.7);
    const p = sim.deposits[0].progress;
    expect(p).toBeGreaterThan(0.3);
    sim.ship.x = 100; sim.ship.y = 100;
    run(sim, 1);
    expect(sim.target).toBeNull();
    expect(sim.deposits[0].progress).toBeCloseTo(p, 5);
  });

  const wreck = { id: 'w', x: 300, y: 300, r: 50, queue: ['circuits', 'scrap', 'cores'] as const, variant: 0, leaking: false };

  it('sans laser, une épave ne donne rien (et un indice est émis une fois)', () => {
    const sim = makeSim(makeLevel({ wrecks: [{ ...wreck, queue: [...wreck.queue] }] }));
    sim.ship.x = 300 - 50 - 13 - 30; sim.ship.y = 300;
    run(sim, 5);
    expect(sim.target).toBeNull();
    expect(sim.wrecks[0].queue).toHaveLength(3);
    expect(sim.drainEvents().filter((e) => e.type === 'laserHint')).toHaveLength(1);
  });

  it('avec le laser, démantèle l’épave et récupère ses composants dans l’ordre', () => {
    const sim = makeSim(makeLevel({ wrecks: [{ ...wreck, queue: [...wreck.queue] }] }), {}, { equipment: 'laser' });
    sim.ship.x = 300 - 50 - 13 - 30; sim.ship.y = 300;
    run(sim, 8);
    expect(sim.wrecks[0].queue).toHaveLength(0);
    expect(sim.cargo.contents()).toEqual({ circuits: 1, scrap: 1, cores: 1 });
    expect(sim.target).toBeNull();
  });

  it('un objet unique déclenche un événement une seule fois', () => {
    const lvl = makeLevel({ wrecks: [{ ...wreck, id: 'uniq', queue: ['cores'], unique: 'uniq' }] });
    const sim = makeSim(lvl, {}, { equipment: 'laser' });
    sim.ship.x = 300 - 50 - 13 - 30; sim.ship.y = 300;
    run(sim, 5);
    expect(sim.drainEvents().filter((e) => e.type === 'unique')).toEqual([{ type: 'unique', id: 'uniq' }]);
  });
});

describe('tracteur', () => {
  it('saisit un objet lourd, le ramène dans l’anneau et le livre une seule fois', () => {
    const received: string[] = [];
    const lvl = makeLevel({ heavies: [{ id: 'h', x: 400, y: 400, res: 'scrap', amount: 20 }] });
    const sim = makeSim(lvl, { maxSpeed: 200 }, { equipment: 'tractor', hooks: { deposit: () => ({}), recoverHeavy: (id, res, n) => { received.push(`${id}:${res}:${n}`); return true; } } });
    sim.ship.x = 400; sim.ship.y = 400;
    run(sim, 0.2);
    expect(sim.held?.id).toBe('h');
    run(sim, 6, { x: -1, y: 0 }); // vers la station (x=100)
    run(sim, 3);
    expect(received).toHaveLength(1);
    expect(received[0]).toContain('scrap:20');
    expect(sim.heavies).toHaveLength(0);
    expect(sim.held).toBeNull();
  });

  it('sans tracteur, un objet lourd reste en place', () => {
    const sim = makeSim(makeLevel({ heavies: [{ id: 'h', x: 400, y: 400, res: 'scrap', amount: 20 }] }));
    sim.ship.x = 400; sim.ship.y = 400;
    run(sim, 1);
    expect(sim.held).toBeNull();
  });

  it('entrepôt plein : l’objet reste saisi, sans perte', () => {
    const lvl = makeLevel({ heavies: [{ id: 'h', x: 130, y: 400, res: 'scrap', amount: 20 }] });
    const sim = makeSim(lvl, {}, { equipment: 'tractor', hooks: { deposit: () => ({}), recoverHeavy: () => false } });
    sim.ship.x = 130; sim.ship.y = 400;
    run(sim, 3);
    expect(sim.heavies).toHaveLength(1);
    expect(sim.drainEvents().filter((e) => e.type === 'storageFull')).toHaveLength(1);
  });
});

describe('scanner et découvertes', () => {
  it('révèle progressivement les points d’intérêt à portée, une seule fois chacun', () => {
    const lvl = makeLevel({
      deposits: [{ id: 'near', x: 400, y: 400, r: 26, res: 'rock', amount: 5, variant: 0 }, { id: 'far', x: 700, y: 700, r: 26, res: 'rock', amount: 5, variant: 0 }],
      radiation: [{ id: 'rad', x: 450, y: 450, r: 100 }],
    });
    const sim = makeSim(lvl, { scanRadius: 220 });
    sim.ship.x = 400; sim.ship.y = 300;
    run(sim, 1);
    const ids = sim.drainEvents().filter((e) => e.type === 'discover').map((e) => (e as { poi: { id: string } }).poi.id);
    expect(ids.sort()).toEqual(['near', 'rad']);
    expect(sim.discovered.has('far')).toBe(false);
    run(sim, 1);
    expect(sim.drainEvents().filter((e) => e.type === 'discover')).toHaveLength(0);
  });

  it('ne redécouvre pas ce qui est déjà enregistré', () => {
    const lvl = makeLevel({ deposits: [{ id: 'near', x: 400, y: 400, r: 26, res: 'rock', amount: 5, variant: 0 }] });
    const sim = makeSim(lvl, { scanRadius: 220 }, { discovered: ['near'] });
    sim.ship.x = 400; sim.ship.y = 300;
    run(sim, 1);
    expect(sim.drainEvents().filter((e) => e.type === 'discover')).toHaveLength(0);
  });
});
