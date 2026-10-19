// Valeurs initiales de simulation (à tester, pas un équilibrage validé).
import type { ResourceId, Items } from './items';

export type Branch = 'cargo' | 'magnet' | 'engine' | 'hull';
export const BRANCHES: readonly Branch[] = ['cargo', 'magnet', 'engine', 'hull'];
export type Levels = Record<Branch, number>;

export const MAX_SHIP_LEVEL = 6;
const clampLevel = (l: number) => Math.max(0, Math.min(MAX_SHIP_LEVEL, Math.floor(l)));

/** Places de soute par niveau 0..6. */
export const CARGO_CAPACITY: readonly number[] = [12, 16, 20, 24, 30, 36, 42];

export const cargoCapacity = (level: number) => CARGO_CAPACITY[clampLevel(level)];
export const magnetRange = (level: number) => 56 + 4 * clampLevel(level);
export const extractionPower = (level: number) => Math.pow(1.17, clampLevel(level));
export const engineSpeed = (level: number) => 170 + 6 * clampLevel(level);
export const hullMax = (level: number) => 3 + Math.floor(clampLevel(level) / 2);
export const REPAIR_BASE_DELAY = 3;
export const repairDelay = (level: number) => Math.max(1, REPAIR_BASE_DELAY - 0.25 * clampLevel(level));
/** Intervalle entre deux dégâts de radiation : la coque améliore la résistance. */
export const hazardInterval = (level: number) => 1.5 + 0.2 * clampLevel(level);

/** Coût (matières) pour atteindre le niveau n d'une branche (index n - 1). */
export const SHIP_UPGRADE_COSTS: readonly Items[] = [
  { rock: 30 },
  { rock: 60, scrap: 30 },
  { scrap: 80, ice: 20 },
  { ice: 60, crystal: 30, ingots: 5 },
  { ingots: 25, cells: 5, circuits: 10 },
  { ingots: 50, cells: 10, techparts: 4 },
];

export type EquipmentId = 'laser' | 'tractor';
export interface EquipmentInfo {
  id: EquipmentId;
  name: string;
  icon: string;
  desc: string;
  items: Items;
  credits: number;
  minWorkshop: number;
}
export const EQUIPMENTS: Record<EquipmentId, EquipmentInfo> = {
  laser: {
    id: 'laser',
    name: 'Laser de découpe',
    icon: '🔦',
    desc: 'Démantèle les épaves : reste près d’une grande épave pour récupérer ses composants.',
    items: { ingots: 8, circuits: 6 },
    credits: 250,
    minWorkshop: 2,
  },
  tractor: {
    id: 'tractor',
    name: 'Tracteur gravitationnel',
    icon: '🧲',
    desc: 'Saisit un objet lourd à proximité : ramène-le dans l’anneau de la station pour le récupérer.',
    items: { ingots: 12, cells: 6 },
    credits: 400,
    minWorkshop: 2,
  },
};

export interface SimStats {
  cargoCapacity: number;
  magnetRange: number;
  extractionPower: number;
  maxSpeed: number;
  hullMax: number;
  repairDelay: number;
  hazardInterval: number;
  scanRadius: number;
}

export function statsFromLevels(levels: Levels, scanRadius: number): SimStats {
  return {
    cargoCapacity: cargoCapacity(levels.cargo),
    magnetRange: magnetRange(levels.magnet),
    extractionPower: extractionPower(levels.magnet),
    maxSpeed: engineSpeed(levels.engine),
    hullMax: hullMax(levels.hull),
    repairDelay: repairDelay(levels.hull),
    hazardInterval: hazardInterval(levels.hull),
    scanRadius,
  };
}

// --- Drone --------------------------------------------------------------------
export type DroneStat = 'capacity' | 'speed' | 'efficiency';
export const DRONE_STATS: readonly DroneStat[] = ['capacity', 'speed', 'efficiency'];
export const DRONE_CAPACITY = [20, 35, 55, 80] as const;
/** Unités extraites par minute avant efficacité. */
export const DRONE_RATE = [6, 9, 13, 18] as const;
export const DRONE_EFFICIENCY = [0.5, 0.6, 0.75, 0.9] as const;
export const DRONE_BUILD: { items: Items; credits: number } = { items: { ingots: 10, circuits: 10, techparts: 2 }, credits: 300 };
export const DRONE_UPGRADE_COSTS: readonly { items: Items; credits: number }[] = [
  { items: { ingots: 10, circuits: 5 }, credits: 150 },
  { items: { ingots: 25, circuits: 15, techparts: 3 }, credits: 400 },
  { items: { ingots: 45, cells: 10, techparts: 6 }, credits: 800 },
];
export const DRONE_RESOURCES_EXCLUDED: readonly ResourceId[] = ['cores'];

// --- Exploration ---------------------------------------------------------------
export const SHIP_RADIUS = 13;
export const PICKUP_RADIUS = 16;
export const INVULN_TIME = 1.2;
export const KNOCKBACK = 170;
export const RING_RADIUS = 56;
export const DEPOSIT_DWELL = 2;
export const DEPOSIT_MAX_SPEED = 45;
export const EXTRACT_DELAY = 0.3;
export const EXTRACT_PERIOD = 0.6;
export const FULL_SLOWDOWN = 0.1;
export const MAX_FRAGMENTS = 120;
export const SHIP_ACCEL = 700;
export const SHIP_BRAKE = 2200;
export const LASER_RANGE = 96;
export const TRACTOR_RANGE = 120;
export const TRACTOR_SLOWDOWN = 0.25;
export const ELECTRIC_PERIOD = 4;
export const ELECTRIC_WARN_AT = 2.4;
export const ELECTRIC_ACTIVE_AT = 3.2;
