import { describe, expect, it } from 'vitest';
import { MAJOR_CONTRACTS, CONTRACT_TEMPLATES } from '../src/config/contracts';
import {
  MAX_ACTIVE_ORDINARY,
  abandonContract,
  acceptMajor,
  acceptOffer,
  completeContract,
  contractNeeds,
  contractReward,
  deliverToContract,
  ensureBoard,
  majorStatus,
} from '../src/logic/contracts';
import { mustOk, saveWith } from './helpers';

const withOffice = (over = {}) => saveWith({ buildings: { office: 1 }, ...over });

describe('tableau d’offres', () => {
  it('reste vide sans bureau, se remplit avec lui, de façon déterministe', () => {
    expect(ensureBoard(saveWith()).contracts.board).toHaveLength(0);
    const a = ensureBoard(withOffice());
    const b = ensureBoard(withOffice());
    expect(a.contracts.board).toHaveLength(3);
    expect(a.contracts.board).toEqual(b.contracts.board);
    expect(ensureBoard(a)).toBe(a); // déjà plein
  });

  it('ne propose que des contrats réalisables (secteur et installations requis)', () => {
    const s = ensureBoard(withOffice());
    for (const o of s.contracts.board) expect(['c-rock', 'c-scrap']).toContain(o.templateId);
    const adv = ensureBoard(saveWith({ buildings: { office: 3, refinery: 1 } }));
    expect(adv.contracts.board).toHaveLength(5);
    expect(adv.contracts.board.every((o) => CONTRACT_TEMPLATES.some((t) => t.id === o.templateId))).toBe(true);
    // pas de contrat de glace sans nébuleuse
    expect(adv.contracts.board.some((o) => ['c-ice', 'c-crystal'].includes(o.templateId))).toBe(false);
  });

  it('la V1 prévoit une douzaine de modèles ordinaires', () => {
    expect(CONTRACT_TEMPLATES.length).toBe(12);
    expect(new Set(CONTRACT_TEMPLATES.map((t) => t.tier))).toEqual(new Set(['classic', 'industrial']));
  });
});

describe('contrats ordinaires', () => {
  it('acceptation, livraison progressive, achèvement et récompense', () => {
    let s = ensureBoard(withOffice({ stock: { rock: 100, scrap: 100 }, credits: 0 }));
    const offer = s.contracts.board[0];
    s = mustOk(acceptOffer(s, offer.id, 'acc'));
    expect(s.contracts.active).toHaveLength(1);
    expect(s.contracts.board.find((o) => o.id === offer.id)).toBeUndefined();
    expect(s.contracts.board).toHaveLength(3); // le tableau est regarni
    const needs = contractNeeds(s.contracts.active[0]);
    const item = Object.keys(needs)[0] as 'rock' | 'scrap';
    const need = needs[item] as number;
    s.stock[item] = Math.floor(need / 2);
    s = mustOk(deliverToContract(s, offer.id, 'd1'));
    expect(s.stock[item]).toBe(0);
    expect(completeContract(s, offer.id, 'c0').ok).toBe(false);
    s.stock[item] = 500;
    s = mustOk(deliverToContract(s, offer.id, 'd2'));
    expect(s.contracts.active[0].delivered[item]).toBe(need);
    expect(s.stock[item]).toBe(500 - (need - Math.floor(need / 2)));
    const reward = contractReward(s, s.contracts.active[0]);
    s = mustOk(completeContract(s, offer.id, 'c1'));
    expect(s.credits).toBe(reward);
    expect(s.contracts.active).toHaveLength(0);
    expect(s.contracts.completed).toBe(1);
  });

  it('ne verse la récompense qu’une fois (idempotent)', () => {
    let s = ensureBoard(withOffice({ stock: { rock: 500, scrap: 500 }, credits: 0 }));
    const id = s.contracts.board[0].id;
    s = mustOk(acceptOffer(s, id, 'a'));
    s = mustOk(deliverToContract(s, id, 'd'));
    const done = mustOk(completeContract(s, id, 'same'));
    expect(completeContract(done, id, 'same').ok).toBe(false);
    expect(completeContract(done, id, 'other').ok).toBe(false); // contrat déjà retiré
    expect(done.credits).toBe(contractReward(s, s.contracts.active[0]));
  });

  it('limite le nombre de contrats ordinaires en cours', () => {
    let s = ensureBoard(withOffice({ buildings: { office: 3, refinery: 1 } }));
    for (let i = 0; i < MAX_ACTIVE_ORDINARY; i++) s = mustOk(acceptOffer(s, s.contracts.board[0].id, `a${i}`));
    expect(acceptOffer(s, s.contracts.board[0].id, 'over').ok).toBe(false);
  });

  it('abandon sans pénalité : les matières livrées sont rendues, majeurs non abandonnables', () => {
    let s = ensureBoard(withOffice({ stock: { rock: 30, scrap: 30 } }));
    const id = s.contracts.board[0].id;
    s = mustOk(acceptOffer(s, id, 'a'));
    s = mustOk(deliverToContract(s, id, 'd'));
    const delivered = { ...s.contracts.active[0].delivered };
    const stockBefore = { ...s.stock };
    s = mustOk(abandonContract(s, id, 'ab'));
    for (const [k, n] of Object.entries(delivered)) expect(s.stock[k as 'rock']).toBe(stockBefore[k as 'rock'] + (n as number));
    expect(s.contracts.active).toHaveLength(0);
    let m = withOffice({ stock: { rock: 500, scrap: 500 } });
    m = mustOk(acceptMajor(m, 'm1-nebula', 'mj'));
    expect(abandonContract(m, 'm:m1-nebula', 'ab2').ok).toBe(false);
  });

  it('abandon avec entrepôt plein : le surplus perdu est signalé, jamais silencieux', () => {
    let s = ensureBoard(withOffice({ stock: { rock: 60, scrap: 60 } }));
    const id = s.contracts.board[0].id;
    s = mustOk(acceptOffer(s, id, 'a'));
    const item = Object.keys(contractNeeds(s.contracts.active[0]))[0] as 'rock' | 'scrap';
    s.contracts.active[0].delivered[item] = 10;
    s.stock[item] = 60;
    const r = abandonContract(s, id, 'ab');
    expect(r.ok && r.note).toContain('perdu');
  });
});

describe('contrats majeurs', () => {
  it('s’enchaînent dans l’ordre et débloquent secteurs, hangar et chantier', () => {
    let s = saveWith({ buildings: { office: 1, refinery: 1 }, stock: { rock: 200, scrap: 200, ingots: 50, cells: 50, techparts: 50, circuits: 50, cores: 20 }, credits: 0 });
    const status = (id: string) => majorStatus(s, MAJOR_CONTRACTS.find((m) => m.id === id) as (typeof MAJOR_CONTRACTS)[number]);
    expect(status('m1-nebula')).toBe('available');
    expect(status('m2-graveyard')).toBe('locked');
    expect(acceptMajor(s, 'm2-graveyard', 'x').ok).toBe(false);

    for (const [id, check] of [
      ['m1-nebula', () => s.sectors.unlocked.includes('nebula')],
      ['m2-graveyard', () => s.sectors.unlocked.includes('graveyard')],
      ['m3-drone', () => s.flags.hangarUnlocked],
    ] as const) {
      s = mustOk(acceptMajor(s, id, `acc-${id}`));
      s = mustOk(deliverToContract(s, `m:${id}`, `del-${id}`));
      s = mustOk(completeContract(s, `m:${id}`, `com-${id}`));
      expect(check()).toBe(true);
      expect(status(id)).toBe('done');
    }
    expect(status('m4-relay')).toBe('locked'); // exige le drone
    s.flags.droneBuilt = true;
    expect(status('m4-relay')).toBe('available');
    s = mustOk(acceptMajor(s, 'm4-relay', 'a4'));
    s = mustOk(deliverToContract(s, 'm:m4-relay', 'd4'));
    s = mustOk(completeContract(s, 'm:m4-relay', 'c4'));
    expect(s.flags.projectOpen).toBe(true);
    expect(s.credits).toBe(200 + 500 + 600 + 2000);
    expect(acceptMajor(s, 'm1-nebula', 'again').ok).toBe(false);
  });

  it('exigent le bureau commercial', () => {
    expect(majorStatus(saveWith(), MAJOR_CONTRACTS[0])).toBe('locked');
  });
});
