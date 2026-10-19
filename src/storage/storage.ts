// Sauvegarde locale : copie principale + dernière copie valide, jamais d'effacement silencieux.
import { createDefaultSave, validateSave, type SaveData } from '../logic/save-model';

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const SAVE_KEY = 'spacetrash.save.v1';
export const BACKUP_KEY = 'spacetrash.save.v1.backup';
export const CORRUPT_KEY = 'spacetrash.save.v1.corrupt';

export type LoadStatus = 'new' | 'ok' | 'recovered' | 'corrupt' | 'unavailable';

export interface LoadResult {
  status: LoadStatus;
  data: SaveData | null;
  /** Pour `corrupt` : une dernière copie valide existe et peut être restaurée. */
  backupAvailable: boolean;
}

function parseValid(raw: string | null): SaveData | null {
  if (raw === null) return null;
  try {
    return validateSave(JSON.parse(raw));
  } catch {
    return null;
  }
}

export class SaveStore {
  persistent: boolean;
  /** Verrou tant qu'une sauvegarde illisible n'a pas fait l'objet d'une décision explicite. */
  private locked = false;
  private ls: StorageLike | null;

  constructor(ls: StorageLike | null) {
    this.ls = ls;
    this.persistent = ls !== null;
  }

  load(): LoadResult {
    if (!this.ls) return this.unavailable();
    let main: string | null;
    let backup: string | null;
    try {
      main = this.ls.getItem(SAVE_KEY);
      backup = this.ls.getItem(BACKUP_KEY);
    } catch {
      return this.unavailable();
    }
    if (main === null && backup === null) return { status: 'new', data: null, backupAvailable: false };
    const data = parseValid(main);
    if (data) return { status: 'ok', data, backupAvailable: parseValid(backup) !== null };
    // Illisible : on garde une trace du contenu et on attend une décision explicite.
    this.locked = true;
    this.keepCorrupt(main);
    return { status: 'corrupt', data: null, backupAvailable: parseValid(backup) !== null };
  }

  /** Décision explicite : restaurer la dernière copie valide. */
  restoreBackup(): LoadResult {
    if (!this.ls) return this.unavailable();
    let backup: string | null = null;
    try {
      backup = this.ls.getItem(BACKUP_KEY);
    } catch {
      return this.unavailable();
    }
    const data = parseValid(backup);
    if (!data) return { status: 'corrupt', data: null, backupAvailable: false };
    this.locked = false;
    try {
      this.ls.setItem(SAVE_KEY, JSON.stringify(data));
    } catch {
      this.persistent = false;
    }
    return { status: 'recovered', data, backupAvailable: true };
  }

  /** Décision explicite : repartir d'un profil neuf (le contenu illisible reste conservé à part). */
  startFresh(): SaveData {
    this.locked = false;
    const data = createDefaultSave();
    this.save(data);
    return data;
  }

  save(data: SaveData): { ok: boolean; error?: string } {
    if (!this.ls) return { ok: false, error: 'Stockage indisponible.' };
    if (this.locked) return { ok: false, error: 'Sauvegarde en attente de décision.' };
    try {
      const previous = this.ls.getItem(SAVE_KEY);
      if (previous !== null && parseValid(previous) !== null) this.ls.setItem(BACKUP_KEY, previous);
      this.ls.setItem(SAVE_KEY, JSON.stringify(data));
      this.persistent = true;
      return { ok: true };
    } catch (e) {
      this.persistent = false;
      return { ok: false, error: e instanceof Error ? e.message : 'Écriture impossible.' };
    }
  }

  /** Contenu brut pour le panneau développeur. */
  rawMain(): string | null {
    try {
      return this.ls ? this.ls.getItem(SAVE_KEY) : null;
    } catch {
      return null;
    }
  }

  /** Remise à zéro explicite (panneau développeur) : efface aussi la copie. */
  wipe(): SaveData {
    try {
      this.ls?.removeItem(SAVE_KEY);
      this.ls?.removeItem(BACKUP_KEY);
    } catch {
      /* ignoré : save() signalera l'état */
    }
    this.locked = false;
    const data = createDefaultSave();
    this.save(data);
    return data;
  }

  private keepCorrupt(raw: string | null): void {
    if (raw === null || !this.ls) return;
    try {
      this.ls.setItem(CORRUPT_KEY, raw);
    } catch {
      /* sans conséquence */
    }
  }

  private unavailable(): LoadResult {
    this.persistent = false;
    return { status: 'unavailable', data: null, backupAvailable: false };
  }
}

export function browserStorage(): StorageLike | null {
  try {
    const ls = window.localStorage;
    const probe = '__eboueurs_probe__';
    ls.setItem(probe, '1');
    ls.removeItem(probe);
    return ls;
  } catch {
    return null;
  }
}
