import { describe, expect, it } from 'vitest';
import { SaveStore, type StorageLike } from '../src/storage/storage';
import { depositCargo } from '../src/logic/inventory';
import { startJob } from '../src/logic/refinery';
import { ensureBoard } from '../src/logic/contracts';
import { createDefaultSave, validateSave, cloneSave } from '../src/logic/save-model';
import { mustOk, saveWith } from './helpers';

class MemoryStorage implements StorageLike {
  data = new Map<string, string>();
  getItem(k: string) { return this.data.has(k) ? (this.data.get(k) as string) : null; }
  setItem(k: string, v: string) { this.data.set(k, v); }
  removeItem(k: string) { this.data.delete(k); }
}
const KEY = 'spacetrash.save.v1';

describe('validation', () => {
  it('accepte une sauvegarde par défaut et une partie avancée', () => {
    expect(validateSave(JSON.parse(JSON.stringify(createDefaultSave('x'))))).not.toBeNull();
    let s = ensureBoard(saveWith({ buildings: { office: 2, refinery: 1 }, stock: { scrap: 30 } }));
    s = mustOk(startJob(s, 'ingots', 3, 'j'));
    s.drone.built = true;
    s.ship.owned.push('laser');
    s.ship.equipped = 'laser';
    expect(validateSave(JSON.parse(JSON.stringify(s)))).toEqual(s);
  });

  it('refuse les valeurs invalides (jamais de réparation silencieuse)', () => {
    const base = () => JSON.parse(JSON.stringify(createDefaultSave('x')));
    const cases: ((s: ReturnType<typeof base>) => void)[] = [
      (s) => { s.stock.rock = -5; },
      (s) => { s.stock.rock = 1.5; },
      (s) => { s.credits = 'beaucoup'; },
      (s) => { s.schema = 99; },
      (s) => { s.ship.levels.cargo = 7; },
      (s) => { s.buildings.refinery = 4; },
      (s) => { s.buildings.workshop = 0; },
      (s) => { s.sectors.unlocked = ['nebula']; },
      (s) => { s.ship.equipped = 'laser'; },
      (s) => { s.drone.status = 'perdu'; },
      (s) => { delete s.stock.cores; },
      (s) => { s.contracts.active = [{ id: 'a', kind: 'ordinary', templateId: 'c-rock', mult: 1, delivered: { rock: -1 } }]; },
      (s) => { s.refinery.jobs = [{ id: 'j', recipe: 'inconnue', qty: 1, total: 1, remaining: 1, delivered: 0 }]; },
    ];
    for (const mutate of cases) {
      const s = base();
      mutate(s);
      expect(validateSave(s)).toBeNull();
    }
    expect(validateSave(null)).toBeNull();
    expect(validateSave('texte')).toBeNull();
  });

  it('remplace des réglages invalides par les valeurs par défaut', () => {
    const s = JSON.parse(JSON.stringify(createDefaultSave('x')));
    s.settings = { musicVolume: -3, joystickSide: 'haut' };
    const v = validateSave(s);
    expect(v?.settings.musicVolume).toBe(70);
    expect(v?.settings.joystickSide).toBe('right');
  });
});

describe('stockage', () => {
  it('sauvegarde puis recharge exactement toute la progression', () => {
    const mem = new MemoryStorage();
    const store = new SaveStore(mem);
    expect(store.load().status).toBe('new');
    let s = createDefaultSave('p1');
    s = mustOk(depositCargo(s, 'tx-a', { rock: 12, scrap: 5 }).result);
    s = ensureBoard({ ...s, buildings: { ...s.buildings, office: 1 } });
    s.settings.muted = true;
    s.sectors.visited.push('belt');
    s.sectors.discovered.belt = ['belt-d0', 'belt-d1'];
    s.sectors.uniquesDone = ['belt-container'];
    expect(store.save(s).ok).toBe(true);
    const reloaded = new SaveStore(mem).load();
    expect(reloaded.status).toBe('ok');
    expect(reloaded.data).toEqual(s);
  });

  it('rechargement : rejouer une transaction déjà enregistrée ne duplique rien', () => {
    const mem = new MemoryStorage();
    const store = new SaveStore(mem);
    const s = mustOk(depositCargo(createDefaultSave('p1'), 'run1:d1', { rock: 5 }).result);
    store.save(s);
    const loaded = new SaveStore(mem).load().data;
    if (!loaded) throw new Error();
    const replay = depositCargo(loaded, 'run1:d1', { rock: 5 });
    expect(replay.result.ok).toBe(false);
    expect(replay.result.state.stock.rock).toBe(5);
  });

  it('sauvegarde corrompue : récupération explicite, copie conservée, rien écrasé', () => {
    const mem = new MemoryStorage();
    const store = new SaveStore(mem);
    const s1 = createDefaultSave('p1');
    store.save(s1);
    const s2 = cloneSave(s1);
    s2.credits = 99;
    store.save(s2);
    mem.setItem(KEY, '{ceci n est pas du json');
    const fresh = new SaveStore(mem);
    const res = fresh.load();
    expect(res.status).toBe('corrupt');
    expect(res.backupAvailable).toBe(true);
    expect(fresh.save(createDefaultSave('autre')).ok).toBe(false);
    expect(mem.getItem(KEY)).toBe('{ceci n est pas du json');
    const restored = fresh.restoreBackup();
    expect(restored.status).toBe('recovered');
    expect(restored.data?.profileId).toBe('p1');
    expect(fresh.save(restored.data as never).ok).toBe(true);
  });

  it('corruption sans copie : nouveau profil uniquement sur demande, contenu conservé', () => {
    const mem = new MemoryStorage();
    mem.setItem(KEY, 'xxx');
    const store = new SaveStore(mem);
    expect(store.load().backupAvailable).toBe(false);
    expect(store.restoreBackup().data).toBeNull();
    expect(store.startFresh().profileId).toBeTruthy();
    expect(mem.getItem(KEY + '.corrupt')).toBe('xxx');
  });

  it('stockage indisponible ou plein : signalé sans exception', () => {
    const broken: StorageLike = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); }, removeItem() { throw new Error('denied'); } };
    const store = new SaveStore(broken);
    expect(store.load().status).toBe('unavailable');
    expect(store.persistent).toBe(false);
    expect(store.save(createDefaultSave('x')).ok).toBe(false);
    const mem = new MemoryStorage();
    const s2 = new SaveStore(mem);
    s2.load();
    mem.setItem = () => { throw new Error('QuotaExceeded'); };
    expect(s2.save(createDefaultSave('x')).ok).toBe(false);
  });
});
