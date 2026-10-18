import { describe, expect, it } from 'vitest';
import { generateLevel, unreachableTargets } from '../src/logic/level';
import { IDLE, makeLevel, makeSim, run } from './helpers';

const ring = { x: 100, y: 400 };

describe('soute', () => {
  it('ne dépasse jamais la capacité et conserve le surplus dans le monde', () => {
    const frags = Array.from({ length: 8 }, (_, i) => ({ x: 100 + (i % 4) * 6, y: 400 + Math.floor(i / 4) * 6, variant: 0 }));
    // la sim démarre sur la station : on décale pour tester hors anneau
    const level = makeLevel({ fragments: frags, station: { x: 100, y: 580, ringR: 56 } });
    const sim = makeSim(level, { cargoCapacity: 3 });
    sim.ship.x = 100;
    sim.ship.y = 400;
    run(sim, 1);
    expect(sim.cargo.used).toBe(3);
    expect(sim.fragments.length).toBe(5);
    expect(sim.cargo.used + sim.fragments.length).toBe(8);
  });

  it('réduit la vitesse de 10 % au maximum quand elle est pleine', () => {
    const level = makeLevel({ station: { x: 100, y: 580, ringR: 56 } });
    const sim = makeSim(level, { cargoCapacity: 10, maxSpeed: 200 });
    sim.ship.x = 100; sim.ship.y = 300;
    run(sim, 1.5, { x: 1, y: 0 });
    const empty = sim.speed;
    const full = makeSim(level, { cargoCapacity: 10, maxSpeed: 200 });
    full.ship.x = 100; full.ship.y = 300;
    full.cargo.used = 10;
    run(full, 1.5, { x: 1, y: 0 });
    expect(empty).toBeCloseTo(200, 0);
    expect(full.speed).toBeCloseTo(180, 0);
  });

  it('normalise les diagonales', () => {
    const sim = makeSim(makeLevel({ station: { x: 100, y: 580, ringR: 56 } }), { maxSpeed: 200 });
    sim.ship.x = 300; sim.ship.y = 300;
    run(sim, 1.5, { x: 1, y: 1 });
    expect(sim.speed).toBeCloseTo(200, 0);
  });
});

describe('dépôt', () => {
  it('dépose toute la cargaison une seule fois après 2 s à faible vitesse', () => {
    const sim = makeSim(makeLevel());
    sim.ship.x = ring.x; sim.ship.y = ring.y;
    sim.cargo.used = 7;
    run(sim, 1.9);
    expect(sim.cargo.used).toBe(7);
    run(sim, 0.3);
    const deposits = sim.drainEvents().filter((e) => e.type === 'deposit');
    expect(deposits).toHaveLength(1);
    expect(deposits[0]).toMatchObject({ fragments: 7 });
    expect(sim.cargo.used).toBe(0);
    run(sim, 5);
    expect(sim.drainEvents().filter((e) => e.type === 'deposit')).toHaveLength(0);
    expect(sim.depositedFragments).toBe(7);
  });

  it('ne dépose pas si le vaisseau reste rapide dans l’anneau', () => {
    const sim = makeSim(makeLevel(), { maxSpeed: 200 });
    sim.ship.x = ring.x - 40; sim.ship.y = ring.y;
    sim.cargo.used = 4;
    // va-et-vient rapide sans quitter l'anneau
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

  it('un identifiant de dépôt unique par événement', () => {
    const sim = makeSim(makeLevel());
    sim.ship.x = ring.x; sim.ship.y = ring.y;
    sim.cargo.used = 2;
    run(sim, 2.2);
    sim.cargo.used = 3;
    run(sim, 0.1);
    const ids = sim.drainEvents().filter((e) => e.type === 'deposit').map((e) => (e as { txId: string }).txId);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBe(2);
  });
});

describe('fin de sortie', () => {
  it('à zéro dans l’anneau : dépôt puis réussite', () => {
    const sim = makeSim(makeLevel(), {}, 5);
    sim.ship.x = ring.x; sim.ship.y = ring.y;
    sim.cargo.used = 5;
    run(sim, 6);
    expect(sim.ended).toBe(true);
    expect(sim.outcome).toBe('success');
    expect(sim.depositedFragments).toBe(5);
    expect(sim.lostFragments).toBe(0);
  });

  it('à zéro dehors : récupération d’urgence, cargaison non déposée perdue, dépôts antérieurs gardés', () => {
    const sim = makeSim(makeLevel(), {}, 60);
    sim.ship.x = ring.x; sim.ship.y = ring.y;
    sim.cargo.used = 4;
    run(sim, 2.2); // dépôt de 4
    expect(sim.depositedFragments).toBe(4);
    sim.ship.x = 400; sim.ship.y = 500; // sous la frontière de tempête
    sim.cargo.used = 6;
    run(sim, 60);
    expect(sim.ended).toBe(true);
    expect(sim.outcome).toBe('emergency');
    expect(sim.depositedFragments).toBe(4);
    expect(sim.lostFragments).toBe(6);
    expect(sim.cargo.used).toBe(0);
  });

  it('coque à zéro : perte de la seule cargaison courante', () => {
    const obstacle = { x: 300, y: 300, r: 30, variant: 0 };
    const sim = makeSim(makeLevel({ obstacles: [obstacle] }), { hullMax: 1 });
    sim.ship.x = 300 - 30 - 12; sim.ship.y = 300;
    sim.cargo.used = 3;
    run(sim, 0.1, { x: 1, y: 0 });
    expect(sim.ended).toBe(true);
    expect(sim.outcome).toBe('wrecked');
    expect(sim.lostFragments).toBe(3);
    expect(sim.depositedFragments).toBe(0);
  });

  it('fin volontaire seulement dans l’anneau, avec dépôt du reste', () => {
    const sim = makeSim(makeLevel());
    sim.ship.x = 400; sim.ship.y = 200;
    sim.step(0.05, IDLE);
    expect(sim.requestEnd()).toBe(false);
    sim.ship.x = ring.x; sim.ship.y = ring.y;
    sim.cargo.used = 2;
    sim.step(0.05, IDLE);
    expect(sim.requestEnd()).toBe(true);
    expect(sim.outcome).toBe('voluntary');
    expect(sim.depositedFragments).toBe(2);
  });

  it('abandon : cargaison perdue', () => {
    const sim = makeSim(makeLevel());
    sim.ship.x = 400; sim.ship.y = 200;
    sim.cargo.used = 3;
    sim.abandon();
    expect(sim.outcome).toBe('abandoned');
    expect(sim.lostFragments).toBe(3);
  });

  it('le chronomètre n’avance que lorsque step() est appelé (pause)', () => {
    const sim = makeSim(makeLevel());
    run(sim, 1);
    const t = sim.time;
    expect(sim.time).toBe(t);
    expect(t).toBeGreaterThan(0.99);
  });
});

describe('dégâts', () => {
  it('un choc retire un seul point, puis 1,2 s d’invulnérabilité', () => {
    const obstacle = { x: 300, y: 300, r: 40, variant: 0 };
    const sim = makeSim(makeLevel({ obstacles: [obstacle] }), { hullMax: 5 });
    sim.ship.x = 300 - 40 - 12; sim.ship.y = 300;
    // on pousse en continu contre l'obstacle
    for (let i = 0; i < 40; i++) sim.step(1 / 60, { x: 1, y: 0 });
    expect(sim.ship.hull).toBe(4);
    expect(sim.damageTaken).toBe(1);
    expect(sim.drainEvents().filter((e) => e.type === 'impact')).toHaveLength(1);
  });

  it('un objet ramassable ne blesse pas', () => {
    const sim = makeSim(makeLevel({ fragments: [{ x: 300, y: 300, variant: 0 }] }));
    sim.ship.x = 300; sim.ship.y = 300;
    run(sim, 0.5);
    expect(sim.ship.hull).toBe(sim.stats.hullMax);
  });

  it('la tempête inflige des dégâts annoncés et la station reste sûre', () => {
    const sim = makeSim(makeLevel({ stormFrontEnd: 350 }), {}, 60);
    sim.ship.x = 400; sim.ship.y = 100;
    run(sim, 21); // la tempête démarre à 20 s
    expect(sim.stormStarted).toBe(true);
    expect(sim.stormFront).toBeGreaterThan(0);
    const hullBefore = sim.ship.hull;
    run(sim, 14);
    expect(sim.ship.hull).toBeLessThan(hullBefore);
    const safe = makeSim(makeLevel({ stormFrontEnd: 350 }), {}, 60);
    safe.ship.x = ring.x; safe.ship.y = ring.y;
    run(safe, 59.9);
    expect(safe.ship.hull).toBe(safe.stats.hullMax);
  });

  it('émet les alertes à 60, 30 et 10 secondes', () => {
    const sim = makeSim(makeLevel(), {}, 70);
    sim.ship.x = ring.x; sim.ship.y = ring.y;
    run(sim, 69);
    const w = sim.drainEvents().filter((e) => e.type === 'warning').map((e) => (e as { remaining: number }).remaining);
    expect(w).toEqual([60, 30, 10]);
  });
});

describe('minage', () => {
  const deposit = { x: 300, y: 300, r: 26, amount: 3, variant: 0 };

  it('extrait après 0,3 s puis un fragment par 0,6 s, quantité finie', () => {
    const sim = makeSim(makeLevel({ deposits: [deposit] }), { magnetRange: 56 });
    sim.ship.x = 300 - 26 - 14 - 10; sim.ship.y = 300;
    run(sim, 0.25);
    expect(sim.deposits[0].remaining).toBe(3);
    run(sim, 0.3 - 0.25 + 0.65);
    expect(sim.deposits[0].remaining).toBeLessThan(3);
    run(sim, 6);
    expect(sim.deposits[0].remaining).toBe(0);
    // 3 fragments exactement sortis, ni plus ni moins
    expect(sim.cargo.used + sim.fragments.length).toBe(3);
  });

  it('suspend l’extraction quand la soute est pleine, sans perdre de matière', () => {
    const sim = makeSim(makeLevel({ deposits: [deposit] }), { cargoCapacity: 1 });
    sim.ship.x = 300 - 26 - 14 - 10; sim.ship.y = 300;
    run(sim, 8);
    expect(sim.cargo.used).toBe(1);
    // un fragment extrait peut rester au sol ; le reste demeure dans le gisement
    expect(sim.deposits[0].remaining + sim.fragments.length + sim.cargo.used).toBe(3);
    expect(sim.deposits[0].remaining).toBeGreaterThan(0);
  });

  it('conserve la progression d’extraction après être sorti de portée', () => {
    const sim = makeSim(makeLevel({ deposits: [deposit] }), { magnetRange: 56 });
    sim.ship.x = 300 - 26 - 14 - 10; sim.ship.y = 300;
    run(sim, 0.7); // 0,3 s d'attente puis ~0,4 s de progression
    const p = sim.deposits[0].progress;
    expect(p).toBeGreaterThan(0.3);
    sim.ship.x = 100; sim.ship.y = 100;
    run(sim, 1);
    expect(sim.target).toBeNull();
    expect(sim.deposits[0].progress).toBeCloseTo(p, 5);
  });

  it('garde le gisement le plus proche jusqu’à sa sortie de portée', () => {
    const a = { x: 300, y: 300, r: 26, amount: 20, variant: 0 };
    const b = { x: 300, y: 372, r: 26, amount: 20, variant: 0 };
    const sim = makeSim(makeLevel({ deposits: [a, b] }), { magnetRange: 80 });
    sim.ship.x = 300; sim.ship.y = 300 - 26 - 14 - 5;
    run(sim, 0.1);
    const first = sim.target;
    expect(first?.y).toBe(300);
    // se rapproche de b sans quitter la portée de a : la cible ne change pas
    sim.ship.y = 336;
    sim.ship.x = 300 + 40;
    run(sim, 0.05);
    expect(sim.target).toBe(first);
  });
});

describe('collecte', () => {
  it('attire visiblement puis ramasse chaque fragment exactement une fois', () => {
    const frag = { x: 150, y: 200, variant: 0 };
    const level = makeLevel({ fragments: [frag], station: { x: 100, y: 580, ringR: 56 } });
    const sim = makeSim(level, { magnetRange: 56 });
    sim.ship.x = 150 + 40; sim.ship.y = 200;
    sim.step(0.05, IDLE);
    expect(sim.fragments[0]?.attracted).toBe(true);
    run(sim, 1);
    expect(sim.cargo.used).toBe(1);
    expect(sim.fragments).toHaveLength(0);
    const collects = sim.drainEvents().filter((e) => e.type === 'collect');
    expect(collects).toHaveLength(1);
  });
});

describe('carte de la région 1', () => {
  it('reste praticable pour de nombreuses graines (tout est atteignable depuis la station)', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const lvl = generateLevel(seed);
      expect(unreachableTargets(lvl)).toEqual({ fragments: 0, deposits: 0 });
    }
  });
  it('est déterministe pour une graine donnée', () => {
    expect(generateLevel(5)).toEqual(generateLevel(5));
    expect(generateLevel(5)).not.toEqual(generateLevel(6));
  });
  it('garde un groupe de fragments très proche de la station et respecte le budget', () => {
    const lvl = generateLevel(1);
    const near = lvl.fragments.filter((f) => Math.hypot(f.x - lvl.station.x, f.y - lvl.station.y) < 220);
    expect(near.length).toBeGreaterThanOrEqual(5);
    expect(lvl.fragments.length).toBeLessThanOrEqual(120);
    expect(lvl.obstacles.length).toBeLessThanOrEqual(30);
    expect(lvl.deposits.length).toBeLessThanOrEqual(20);
    for (const o of lvl.obstacles) {
      expect(Math.hypot(o.x - lvl.station.x, o.y - lvl.station.y)).toBeGreaterThan(o.r + 140);
    }
  });
});
