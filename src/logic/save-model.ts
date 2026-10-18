import { BRANCHES, MATERIALS, REGIONS, type Branch, type MaterialId } from '../config/regions';
import { MAX_LEVEL, type Levels } from '../config/balance';

export const SCHEMA_VERSION = 1;
export const MAX_TRANSACTIONS = 200;
const MAX_VALUE = 1_000_000_000;

export type JoystickSide = 'left' | 'right';

export interface Settings {
  musicVolume: number; // 0..100
  sfxVolume: number; // 0..100
  muted: boolean;
  joystickSide: JoystickSide;
  lowFx: boolean;
}

export interface SaveData {
  schema: number;
  profileId: string;
  activeRegion: number;
  unlockedRegions: number[];
  stock: Record<MaterialId, number>;
  /** Tonnes livrées par région (index = id - 1), distinct du stock. */
  delivered: number[];
  levels: Levels;
  runsStarted: number;
  runsCompleted: number;
  /** Identifiant d'une sortie commencée et jamais terminée (fermeture complète). */
  runInProgress: string | null;
  /** Identifiants des dernières transactions (idempotence). */
  transactions: string[];
  tipsSeen: string[];
  settings: Settings;
}

export const DEFAULT_SETTINGS: Settings = {
  musicVolume: 70,
  sfxVolume: 80,
  muted: false,
  joystickSide: 'right',
  lowFx: false,
};

function newProfileId(): string {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  return 'p-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function createDefaultSave(profileId: string = newProfileId()): SaveData {
  return {
    schema: SCHEMA_VERSION,
    profileId,
    activeRegion: 1,
    unlockedRegions: [1],
    stock: { stone: 0, crystal: 0, gold: 0, circuits: 0 },
    delivered: REGIONS.map(() => 0),
    levels: { cargo: 0, magnet: 0, engine: 0, hull: 0 },
    runsStarted: 0,
    runsCompleted: 0,
    runInProgress: null,
    transactions: [],
    tipsSeen: [],
    settings: { ...DEFAULT_SETTINGS },
  };
}

export function cloneSave(s: SaveData): SaveData {
  return JSON.parse(JSON.stringify(s)) as SaveData;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isCount = (v: unknown, max = MAX_VALUE): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= max;

function validateSettings(raw: unknown): Settings {
  const out: Settings = { ...DEFAULT_SETTINGS };
  if (!isRecord(raw)) return out;
  if (isCount(raw.musicVolume, 100)) out.musicVolume = raw.musicVolume;
  if (isCount(raw.sfxVolume, 100)) out.sfxVolume = raw.sfxVolume;
  if (typeof raw.muted === 'boolean') out.muted = raw.muted;
  if (raw.joystickSide === 'left' || raw.joystickSide === 'right') out.joystickSide = raw.joystickSide;
  if (typeof raw.lowFx === 'boolean') out.lowFx = raw.lowFx;
  return out;
}

/**
 * Valide une sauvegarde lue. Renvoie null si elle est inutilisable (type, entier négatif, schéma
 * inconnu…) : l'appelant ne doit alors rien effacer silencieusement.
 */
export function validateSave(raw: unknown): SaveData | null {
  if (!isRecord(raw)) return null;
  if (raw.schema !== SCHEMA_VERSION) return null;
  if (typeof raw.profileId !== 'string' || raw.profileId.length === 0 || raw.profileId.length > 100) return null;
  if (!isCount(raw.activeRegion) || !REGIONS.some((r) => r.id === raw.activeRegion)) return null;

  if (!Array.isArray(raw.unlockedRegions) || raw.unlockedRegions.length === 0) return null;
  const unlocked: number[] = [];
  for (const r of raw.unlockedRegions) {
    if (!isCount(r) || !REGIONS.some((x) => x.id === r)) return null;
    if (!unlocked.includes(r)) unlocked.push(r);
  }
  if (!unlocked.includes(1) || !unlocked.includes(raw.activeRegion as number)) return null;

  if (!isRecord(raw.stock)) return null;
  const stock = {} as Record<MaterialId, number>;
  for (const m of MATERIALS) {
    const v = raw.stock[m];
    if (!isCount(v)) return null;
    stock[m] = v;
  }

  if (!Array.isArray(raw.delivered) || raw.delivered.length !== REGIONS.length) return null;
  const delivered: number[] = [];
  for (const d of raw.delivered) {
    if (!isCount(d)) return null;
    delivered.push(d);
  }

  if (!isRecord(raw.levels)) return null;
  const levels = {} as Levels;
  for (const b of BRANCHES) {
    const v = raw.levels[b as Branch];
    if (!isCount(v, MAX_LEVEL)) return null;
    levels[b] = v;
  }

  if (!isCount(raw.runsStarted) || !isCount(raw.runsCompleted)) return null;
  if (raw.runInProgress !== null && typeof raw.runInProgress !== 'string') return null;
  if (!Array.isArray(raw.transactions) || !raw.transactions.every((t) => typeof t === 'string')) return null;
  if (!Array.isArray(raw.tipsSeen) || !raw.tipsSeen.every((t) => typeof t === 'string')) return null;

  return {
    schema: SCHEMA_VERSION,
    profileId: raw.profileId,
    activeRegion: raw.activeRegion as number,
    unlockedRegions: unlocked,
    stock,
    delivered,
    levels,
    runsStarted: raw.runsStarted,
    runsCompleted: raw.runsCompleted,
    runInProgress: raw.runInProgress as string | null,
    transactions: (raw.transactions as string[]).slice(-MAX_TRANSACTIONS),
    tipsSeen: (raw.tipsSeen as string[]).slice(0, 50),
    settings: validateSettings(raw.settings),
  };
}
