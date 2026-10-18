// Valeurs initiales du cahier des charges (à tester, pas un équilibrage validé).
import type { Branch } from './regions';

export const MAX_LEVEL = 12;

/** Places de soute par niveau 0..12. */
export const CARGO_CAPACITY: readonly number[] = [12, 16, 20, 24, 30, 36, 42, 50, 60, 72, 86, 102, 120];

const clampLevel = (l: number) => Math.max(0, Math.min(MAX_LEVEL, Math.floor(l)));

export const cargoCapacity = (level: number) => CARGO_CAPACITY[clampLevel(level)];
export const magnetRange = (level: number) => 56 + 4 * clampLevel(level);
export const extractionPower = (level: number) => Math.pow(1.17, clampLevel(level));
export const engineSpeed = (level: number) => 170 + 6 * clampLevel(level);
export const hullMax = (level: number) => 3 + Math.floor(clampLevel(level) / 3);
export const REPAIR_BASE_DELAY = 3;
export const repairDelay = (level: number) => Math.max(1, REPAIR_BASE_DELAY - 0.25 * clampLevel(level));

export type Levels = Record<Branch, number>;

export interface SimStats {
  cargoCapacity: number;
  magnetRange: number;
  extractionPower: number;
  maxSpeed: number;
  hullMax: number;
  repairDelay: number;
}

export function statsFromLevels(levels: Levels): SimStats {
  return {
    cargoCapacity: cargoCapacity(levels.cargo),
    magnetRange: magnetRange(levels.magnet),
    extractionPower: extractionPower(levels.magnet),
    maxSpeed: engineSpeed(levels.engine),
    hullMax: hullMax(levels.hull),
    repairDelay: repairDelay(levels.hull),
  };
}

// --- Sortie ---------------------------------------------------------------
export const RUN_DURATION = 240;
export const WARNING_TIMES: readonly number[] = [60, 30, 10];
export const STORM_DURATION = 40;
export const STORM_TICK = 1.5;

export const WORLD_W = 780;
export const WORLD_H = 2532;
export const STATION_X = 390;
export const STATION_Y = 2400;
export const RING_RADIUS = 56;
/** Position finale de la frontière de tempête : toujours au-dessus de l'anneau. */
export const STORM_FRONT_END = 2300;

export const SHIP_RADIUS = 13;
export const PICKUP_RADIUS = 16;
export const INVULN_TIME = 1.2;
export const KNOCKBACK = 170;

export const DEPOSIT_DWELL = 2;
export const DEPOSIT_MAX_SPEED = 45;

export const EXTRACT_DELAY = 0.3;
export const EXTRACT_PERIOD = 0.6;
export const FULL_SLOWDOWN = 0.1;
export const MAX_FRAGMENTS = 120;

export const SHIP_ACCEL = 700;
export const SHIP_BRAKE = 2200;
