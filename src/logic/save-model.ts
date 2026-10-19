import { BUILDING_IDS, MAX_BUILDING_LEVEL, type BuildingId } from '../config/buildings';
import { BRANCHES, DRONE_STATS, MAX_SHIP_LEVEL, type DroneStat, type EquipmentId, type Levels } from '../config/balance';
import { ITEMS, RECIPES, RESOURCES, emptyStock, type ItemId, type Items, type RecipeId, type ResourceId, type Stock } from '../config/items';
import { SECTORS, type SectorId } from '../config/sectors';

export const SCHEMA_VERSION = 1;
export const MAX_TRANSACTIONS = 300;
const MAX_VALUE = 1_000_000_000;
export const KNOWN_FLAGS = ['hangarUnlocked', 'droneBuilt', 'projectOpen'] as const;
export type FlagId = (typeof KNOWN_FLAGS)[number];

export type JoystickSide = 'left' | 'right';

export interface Settings {
  musicVolume: number;
  sfxVolume: number;
  muted: boolean;
  joystickSide: JoystickSide;
  lowFx: boolean;
}

export interface RefineryJob {
  id: string;
  recipe: RecipeId;
  qty: number;
  /** Secondes de traitement au total, et restantes. */
  total: number;
  remaining: number;
  /** Unités déjà versées au stock (l'entrepôt peut être plein). */
  delivered: number;
}

export interface Offer {
  id: string;
  templateId: string;
  mult: number;
}

export interface ActiveContract {
  id: string;
  kind: 'ordinary' | 'major';
  templateId: string;
  mult: number;
  delivered: Items;
}

export type DroneStatus = 'idle' | 'working' | 'returned';

export interface DroneState {
  built: boolean;
  levels: Record<DroneStat, number>;
  status: DroneStatus;
  sector: SectorId | null;
  resource: ResourceId | null;
  cargo: Items;
  /** Fraction d'unité accumulée (mission en cours). */
  acc: number;
}

export interface SaveData {
  schema: number;
  profileId: string;
  credits: number;
  stock: Stock;
  buildings: Record<BuildingId, number>;
  ship: { levels: Levels; owned: EquipmentId[]; equipped: EquipmentId | null };
  sectors: {
    unlocked: SectorId[];
    visited: SectorId[];
    discovered: Record<SectorId, string[]>;
    uniquesDone: string[];
    expeditions: number;
  };
  refinery: { jobs: RefineryJob[]; counter: number };
  contracts: { board: Offer[]; active: ActiveContract[]; majorsDone: string[]; counter: number; completed: number };
  drone: DroneState;
  project: { contrib: Record<string, number>; done: boolean; successSeen: boolean };
  flags: Record<FlagId, boolean>;
  /** Identifiant d'une expédition commencée et jamais terminée (fermeture complète). */
  runInProgress: string | null;
  transactions: string[];
  tipsSeen: string[];
  settings: Settings;
}

export const DEFAULT_SETTINGS: Settings = { musicVolume: 70, sfxVolume: 80, muted: false, joystickSide: 'right', lowFx: false };

function newProfileId(): string {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  return 'p-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function createDefaultSave(profileId: string = newProfileId()): SaveData {
  return {
    schema: SCHEMA_VERSION,
    profileId,
    credits: 60,
    stock: emptyStock(),
    buildings: { workshop: 1, warehouse: 0, refinery: 0, office: 0, hangar: 0 },
    ship: { levels: { cargo: 0, magnet: 0, engine: 0, hull: 0 }, owned: [], equipped: null },
    sectors: {
      unlocked: ['belt'],
      visited: [],
      discovered: { belt: [], nebula: [], graveyard: [] },
      uniquesDone: [],
      expeditions: 0,
    },
    refinery: { jobs: [], counter: 0 },
    contracts: { board: [], active: [], majorsDone: [], counter: 0, completed: 0 },
    drone: { built: false, levels: { capacity: 0, speed: 0, efficiency: 0 }, status: 'idle', sector: null, resource: null, cargo: {}, acc: 0 },
    project: { contrib: {}, done: false, successSeen: false },
    flags: { hangarUnlocked: false, droneBuilt: false, projectOpen: false },
    runInProgress: null,
    transactions: [],
    tipsSeen: [],
    settings: { ...DEFAULT_SETTINGS },
  };
}

export function cloneSave(s: SaveData): SaveData {
  return JSON.parse(JSON.stringify(s)) as SaveData;
}

// --- validation -------------------------------------------------------------------
type R = Record<string, unknown>;
const isRecord = (v: unknown): v is R => typeof v === 'object' && v !== null && !Array.isArray(v);
const isCount = (v: unknown, max = MAX_VALUE): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= max;
const isStr = (v: unknown, max = 120): v is string => typeof v === 'string' && v.length > 0 && v.length <= max;
const isStrArray = (v: unknown, max = 500): v is string[] => Array.isArray(v) && v.length <= max && v.every((x) => isStr(x, 200));
const SECTOR_IDS = SECTORS.map((s) => s.id) as SectorId[];

function validateItems(raw: unknown, keys: readonly string[]): Items | null {
  if (!isRecord(raw)) return null;
  const out: Items = {};
  for (const [k, v] of Object.entries(raw)) {
    if (!keys.includes(k) || !isCount(v)) return null;
    if (v > 0) out[k as ItemId] = v;
  }
  return out;
}

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

/** Valide une sauvegarde lue. Renvoie null si elle est inutilisable (jamais de réparation silencieuse). */
export function validateSave(raw: unknown): SaveData | null {
  if (!isRecord(raw) || raw.schema !== SCHEMA_VERSION) return null;
  if (!isStr(raw.profileId, 100) || !isCount(raw.credits)) return null;

  if (!isRecord(raw.stock)) return null;
  const stock = emptyStock();
  for (const i of ITEMS) {
    const v = raw.stock[i];
    if (!isCount(v)) return null;
    stock[i] = v;
  }

  if (!isRecord(raw.buildings)) return null;
  const buildings = {} as Record<BuildingId, number>;
  for (const b of BUILDING_IDS) {
    const v = raw.buildings[b];
    if (!isCount(v, MAX_BUILDING_LEVEL)) return null;
    buildings[b] = v;
  }
  if (buildings.workshop < 1) return null;

  if (!isRecord(raw.ship) || !isRecord(raw.ship.levels)) return null;
  const levels = {} as Levels;
  for (const b of BRANCHES) {
    const v = raw.ship.levels[b];
    if (!isCount(v, MAX_SHIP_LEVEL)) return null;
    levels[b] = v;
  }
  const owned = raw.ship.owned;
  if (!Array.isArray(owned) || !owned.every((e) => e === 'laser' || e === 'tractor')) return null;
  const equipped = raw.ship.equipped;
  if (equipped !== null && equipped !== 'laser' && equipped !== 'tractor') return null;
  if (equipped !== null && !owned.includes(equipped)) return null;

  const sec = raw.sectors;
  if (!isRecord(sec)) return null;
  if (!Array.isArray(sec.unlocked) || !sec.unlocked.every((s) => SECTOR_IDS.includes(s as SectorId)) || !sec.unlocked.includes('belt')) return null;
  if (!Array.isArray(sec.visited) || !sec.visited.every((s) => SECTOR_IDS.includes(s as SectorId))) return null;
  if (!isRecord(sec.discovered)) return null;
  const discovered = {} as Record<SectorId, string[]>;
  for (const id of SECTOR_IDS) {
    const d = sec.discovered[id];
    if (!isStrArray(d, 1000)) return null;
    discovered[id] = d;
  }
  if (!isStrArray(sec.uniquesDone, 100) || !isCount(sec.expeditions)) return null;

  if (!isRecord(raw.refinery) || !Array.isArray(raw.refinery.jobs) || !isCount(raw.refinery.counter)) return null;
  const jobs: RefineryJob[] = [];
  for (const j of raw.refinery.jobs as unknown[]) {
    if (!isRecord(j) || !isStr(j.id) || !RECIPES.some((r) => r.id === j.recipe)) return null;
    if (!isCount(j.qty, 1000) || j.qty < 1 || !isCount(j.delivered, 1000) || j.delivered > j.qty) return null;
    if (typeof j.total !== 'number' || typeof j.remaining !== 'number' || !(j.total >= 0) || !(j.remaining >= 0) || j.remaining > j.total + 1e-6) return null;
    jobs.push({ id: j.id, recipe: j.recipe as RecipeId, qty: j.qty, total: j.total, remaining: j.remaining, delivered: j.delivered });
  }

  const c = raw.contracts;
  if (!isRecord(c) || !Array.isArray(c.board) || !Array.isArray(c.active) || !isStrArray(c.majorsDone, 50) || !isCount(c.counter) || !isCount(c.completed)) return null;
  const board: Offer[] = [];
  for (const o of c.board as unknown[]) {
    if (!isRecord(o) || !isStr(o.id) || !isStr(o.templateId) || !isCount(o.mult, 20) || o.mult < 1) return null;
    board.push({ id: o.id, templateId: o.templateId, mult: o.mult });
  }
  const active: ActiveContract[] = [];
  for (const a of c.active as unknown[]) {
    if (!isRecord(a) || !isStr(a.id) || !isStr(a.templateId) || !isCount(a.mult, 20) || a.mult < 1) return null;
    if (a.kind !== 'ordinary' && a.kind !== 'major') return null;
    const delivered = validateItems(a.delivered, ITEMS);
    if (!delivered) return null;
    active.push({ id: a.id, kind: a.kind, templateId: a.templateId, mult: a.mult, delivered });
  }

  const d = raw.drone;
  if (!isRecord(d) || typeof d.built !== 'boolean' || !isRecord(d.levels)) return null;
  const dl = {} as Record<DroneStat, number>;
  for (const s of DRONE_STATS) {
    const v = d.levels[s];
    if (!isCount(v, 3)) return null;
    dl[s] = v;
  }
  if (d.status !== 'idle' && d.status !== 'working' && d.status !== 'returned') return null;
  if (d.sector !== null && !SECTOR_IDS.includes(d.sector as SectorId)) return null;
  if (d.resource !== null && !RESOURCES.includes(d.resource as ResourceId)) return null;
  const dcargo = validateItems(d.cargo, RESOURCES);
  if (!dcargo || typeof d.acc !== 'number' || !(d.acc >= 0 && d.acc < 1 + 1e-9)) return null;

  const p = raw.project;
  if (!isRecord(p) || !isRecord(p.contrib) || typeof p.done !== 'boolean' || typeof p.successSeen !== 'boolean') return null;
  const contrib: Record<string, number> = {};
  for (const [k, v] of Object.entries(p.contrib)) {
    if (!isCount(v)) return null;
    contrib[k] = v;
  }

  if (!isRecord(raw.flags)) return null;
  const flags = {} as Record<FlagId, boolean>;
  for (const f of KNOWN_FLAGS) {
    if (typeof raw.flags[f] !== 'boolean') return null;
    flags[f] = raw.flags[f] as boolean;
  }

  if (raw.runInProgress !== null && !isStr(raw.runInProgress, 200)) return null;
  if (!Array.isArray(raw.transactions) || !raw.transactions.every((t) => typeof t === 'string')) return null;
  if (!isStrArray(raw.tipsSeen, 50)) return null;

  return {
    schema: SCHEMA_VERSION,
    profileId: raw.profileId,
    credits: raw.credits,
    stock,
    buildings,
    ship: { levels, owned: owned as EquipmentId[], equipped: equipped as EquipmentId | null },
    sectors: {
      unlocked: [...new Set(sec.unlocked as SectorId[])],
      visited: [...new Set(sec.visited as SectorId[])],
      discovered,
      uniquesDone: sec.uniquesDone as string[],
      expeditions: sec.expeditions as number,
    },
    refinery: { jobs, counter: raw.refinery.counter as number },
    contracts: { board, active, majorsDone: c.majorsDone as string[], counter: c.counter as number, completed: c.completed as number },
    drone: {
      built: d.built,
      levels: dl,
      status: d.status as DroneStatus,
      sector: d.sector as SectorId | null,
      resource: d.resource as ResourceId | null,
      cargo: dcargo,
      acc: d.acc,
    },
    project: { contrib, done: p.done, successSeen: p.successSeen },
    flags,
    runInProgress: raw.runInProgress as string | null,
    transactions: (raw.transactions as string[]).slice(-MAX_TRANSACTIONS),
    tipsSeen: raw.tipsSeen as string[],
    settings: validateSettings(raw.settings),
  };
}
