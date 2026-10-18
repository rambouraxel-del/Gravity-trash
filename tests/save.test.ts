import { describe, expect, it } from 'vitest';
import { SaveStore, type StorageLike } from '../src/storage/storage';
import { applyDeposit, purchaseUpgrade } from '../src/logic/economy';
import { createDefaultSave, validateSave } from '../src/logic/save-model';

class MemoryStorage implements StorageLike {
  data = new Map<string, string>();
  getItem(k: string) {
    return this.data.has(k) ? (this.data.get(k) as string) : null;
  }
  setItem(k: string, v: string) {
    this.data.set(k, v);
  }
  removeItem(k: string) {
    this.data.delete(k);
  }
}

describe('validation', () => {
  it('accepte une sauvegarde par défaut', () => {
    expect(validateSave(JSON.parse(JSON.stringify(createDefaultSave('x'))))).not.toBeNull();
  });
  it('refuse entiers négatifs, flottants, types faux et schéma inconnu', () => {
    const base = () => JSON.parse(JSON.stringify(createDefaultSave('x')));
    const a = base(); a.stock.stone = -5;
    const b = base(); b.stock.stone = 1.5;
    const c = base(); c.levels.cargo = 'beaucoup';
    const d = base(); d.schema = 99;
    const e = base(); d.levels.cargo = 13; e.levels.hull = 13;
    const f = base(); f.unlockedRegions = [2];
    for (const x of [a, b, c, d, e, f]) expect(validateSave(x)).toBeNull();
    expect(validateSave(null)).toBeNull();
    expect(validateSave('texte')).toBeNull();
  });
  it('remet des réglages par défaut si ils sont invalides', () => {
    const s = JSON.parse(JSON.stringify(createDefaultSave('x')));
    s.settings = { musicVolume: -3, joystickSide: 'haut' };
    const v = validateSave(s);
    expect(v?.settings.musicVolume).toBe(70);
    expect(v?.settings.joystickSide).toBe('right');
  });
});

describe('stockage', () => {
  it('sauvegarde puis recharge exactement', () => {
    const mem = new MemoryStorage();
    const store = new SaveStore(mem);
    expect(store.load().status).toBe('new');
    let s = createDefaultSave('p1');
    const dep = applyDeposit(s, 'tx-a', 12);
    if (!dep.ok) throw new Error();
    s = dep.state;
    const up = purchaseUpgrade(s, 'cargo', 'tx-b');
    if (!up.ok) throw new Error();
    s = up.state;
    s.settings.muted = true;
    s.settings.joystickSide = 'left';
    expect(store.save(s).ok).toBe(true);

    const reloaded = new SaveStore(mem).load();
    expect(reloaded.status).toBe('ok');
    expect(reloaded.data).toEqual(s);
  });

  it('rechargement : rejouer une transaction déjà enregistrée ne duplique rien', () => {
    const mem = new MemoryStorage();
    const store = new SaveStore(mem);
    let s = createDefaultSave('p1');
    const dep = applyDeposit(s, 'run1:d1', 5);
    if (!dep.ok) throw new Error();
    s = dep.state;
    store.save(s);
    const loaded = new SaveStore(mem).load().data;
    if (!loaded) throw new Error();
    const replay = applyDeposit(loaded, 'run1:d1', 5);
    expect(replay.ok).toBe(false);
    expect(replay.state.stock.stone).toBe(50);
  });

  it('sauvegarde corrompue : récupération explicite, copie conservée, rien écrasé', () => {
    const mem = new MemoryStorage();
    const store = new SaveStore(mem);
    const s1 = createDefaultSave('p1');
    store.save(s1); // main = s1
    const dep = applyDeposit(s1, 'a', 4);
    if (!dep.ok) throw new Error();
    store.save(dep.state); // backup = s1, main = dep
    mem.setItem('eboueurs.save.v1', '{ceci n est pas du json');

    const fresh = new SaveStore(mem);
    const res = fresh.load();
    expect(res.status).toBe('corrupt');
    expect(res.backupAvailable).toBe(true);
    // Tant que l'utilisateur n'a rien décidé, aucune écriture.
    expect(fresh.save(createDefaultSave('autre')).ok).toBe(false);
    expect(mem.getItem('eboueurs.save.v1')).toBe('{ceci n est pas du json');

    const restored = fresh.restoreBackup();
    expect(restored.status).toBe('recovered');
    expect(restored.data?.profileId).toBe('p1');
    expect(fresh.save(restored.data!).ok).toBe(true);
  });

  it("corruption sans copie : nouveau profil uniquement sur demande, texte corrompu gardé", () => {
    const mem = new MemoryStorage();
    mem.setItem('eboueurs.save.v1', 'xxx');
    const store = new SaveStore(mem);
    const res = store.load();
    expect(res.status).toBe('corrupt');
    expect(res.backupAvailable).toBe(false);
    expect(store.restoreBackup().data).toBeNull();
    const fresh = store.startFresh();
    expect(fresh.profileId).toBeTruthy();
    expect(mem.getItem('eboueurs.save.v1.corrupt')).toBe('xxx');
  });

  it('stockage indisponible : mode non persistant signalé, sans crash', () => {
    const broken: StorageLike = {
      getItem() { throw new Error('denied'); },
      setItem() { throw new Error('denied'); },
      removeItem() { throw new Error('denied'); },
    };
    const store = new SaveStore(broken);
    expect(store.load().status).toBe('unavailable');
    expect(store.persistent).toBe(false);
    expect(store.save(createDefaultSave('x')).ok).toBe(false);
    expect(new SaveStore(null).persistent).toBe(false);
  });

  it("quota dépassé à l'écriture : erreur renvoyée, pas d'exception", () => {
    const mem = new MemoryStorage();
    const store = new SaveStore(mem);
    store.load();
    mem.setItem = () => { throw new Error('QuotaExceeded'); };
    const r = store.save(createDefaultSave('x'));
    expect(r.ok).toBe(false);
  });
});
