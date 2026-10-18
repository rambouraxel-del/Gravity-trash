// Carte de la région 1 : disposition préparée + légère variation déterministe (graine).
import { RING_RADIUS, SHIP_RADIUS, STATION_X, STATION_Y, STORM_FRONT_END, WORLD_H, WORLD_W } from '../config/balance';
import { mulberry32 } from './rng';

export interface LevelData {
  world: { w: number; h: number };
  station: { x: number; y: number; ringR: number };
  stormFrontEnd: number;
  fragments: { x: number; y: number; variant: number }[];
  deposits: { x: number; y: number; r: number; amount: number; variant: number }[];
  obstacles: { x: number; y: number; r: number; variant: number }[];
}

// [x, y, quantité]
const DEPOSIT_PLAN: readonly (readonly [number, number, number])[] = [
  [560, 2230, 8], // poche facile, proche de la station
  [230, 1850, 10],
  [480, 1650, 12],
  [160, 1350, 12],
  [610, 1200, 14],
  [330, 950, 14],
  [570, 600, 16],
  [200, 480, 16],
];

// [x, y, rayon]
const OBSTACLE_PLAN: readonly (readonly [number, number, number])[] = [
  [200, 2090, 30],
  [610, 2020, 34],
  [390, 1900, 36],
  [90, 1740, 28],
  [680, 1690, 30],
  [320, 1520, 34],
  [560, 1420, 32],
  [390, 1280, 38],
  [100, 1090, 30],
  [690, 1010, 34],
  [200, 760, 32],
  [500, 800, 36],
  [400, 620, 30],
  [90, 380, 34],
  [690, 400, 30],
  [390, 240, 36],
];

// [x, y, nombre, rayon d'étalement]
const FRAGMENT_PLAN: readonly (readonly [number, number, number, number])[] = [
  [390, 2235, 6, 40], // premier groupe, très proche de la station
  [150, 2200, 5, 40],
  [650, 2130, 5, 40],
  [300, 1990, 5, 36],
  [530, 1830, 5, 36],
  [150, 1600, 4, 34],
  [420, 1460, 5, 36],
  [650, 1330, 4, 34],
  [250, 1190, 4, 34],
  [480, 1020, 4, 34],
  [130, 860, 3, 30],
  [620, 700, 3, 30],
  [380, 480, 3, 30],
  [220, 300, 3, 30],
];

const DEPOSIT_R = 26;
const GAP = 64; // passage libre minimal entre deux solides (> 2 × rayon du vaisseau)
const STATION_CLEAR = 150;

interface Solid {
  x: number;
  y: number;
  r: number;
}

const clear = (list: Solid[], x: number, y: number, r: number, gap: number) =>
  list.every((s) => Math.hypot(s.x - x, s.y - y) >= s.r + r + gap);

export function generateLevel(seed: number): LevelData {
  const rng = mulberry32(seed * 7919 + 17);
  const jitter = (amp: number) => (rng() * 2 - 1) * amp;
  const margin = 50;
  const inWorld = (x: number, y: number, r: number) =>
    x - r >= margin && x + r <= WORLD_W - margin && y - r >= margin && y + r <= WORLD_H - margin;
  const stationSolid: Solid = { x: STATION_X, y: STATION_Y, r: STATION_CLEAR };
  const solids: Solid[] = [];

  const deposits: LevelData['deposits'] = [];
  for (const [px, py, amount] of DEPOSIT_PLAN) {
    let x = px;
    let y = py;
    for (let i = 0; i < 8; i++) {
      const jx = px + jitter(26);
      const jy = py + jitter(26);
      if (inWorld(jx, jy, DEPOSIT_R) && clear(solids, jx, jy, DEPOSIT_R, GAP) && clear([stationSolid], jx, jy, DEPOSIT_R, 0)) {
        x = jx;
        y = jy;
        break;
      }
    }
    solids.push({ x, y, r: DEPOSIT_R });
    deposits.push({ x, y, r: DEPOSIT_R, amount, variant: Math.floor(rng() * 3) });
  }

  const obstacles: LevelData['obstacles'] = [];
  for (const [px, py, pr] of OBSTACLE_PLAN) {
    let x = px;
    let y = py;
    let r = pr;
    for (let i = 0; i < 8; i++) {
      const jr = pr + jitter(4);
      const jx = px + jitter(22);
      const jy = py + jitter(22);
      if (inWorld(jx, jy, jr) && clear(solids, jx, jy, jr, GAP) && clear([stationSolid], jx, jy, jr, 0)) {
        x = jx;
        y = jy;
        r = jr;
        break;
      }
    }
    solids.push({ x, y, r });
    obstacles.push({ x, y, r, variant: Math.floor(rng() * 3) });
  }

  const fragments: LevelData['fragments'] = [];
  for (const [cx, cy, count, spread] of FRAGMENT_PLAN) {
    let placed = 0;
    for (let attempt = 0; attempt < count * 30 && placed < count; attempt++) {
      const a = rng() * Math.PI * 2;
      const d = Math.sqrt(rng()) * spread;
      const x = cx + Math.cos(a) * d;
      const y = cy + Math.sin(a) * d;
      if (!inWorld(x, y, 8)) continue;
      if (!clear(solids, x, y, 8, 10)) continue;
      if (!fragments.every((f) => Math.hypot(f.x - x, f.y - y) >= 20)) continue;
      fragments.push({ x, y, variant: Math.floor(rng() * 3) });
      placed++;
    }
  }

  return {
    world: { w: WORLD_W, h: WORLD_H },
    station: { x: STATION_X, y: STATION_Y, ringR: RING_RADIUS },
    stormFrontEnd: STORM_FRONT_END,
    fragments,
    deposits,
    obstacles,
  };
}

/**
 * Vérifie par remplissage de grille que le vaisseau (avec marge) peut atteindre depuis la
 * station chaque fragment et chaque gisement. Utilisé par les tests.
 */
export function unreachableTargets(level: LevelData, cell = 10, extra = 4): { fragments: number; deposits: number } {
  const cols = Math.ceil(level.world.w / cell);
  const rows = Math.ceil(level.world.h / cell);
  const blocked = new Uint8Array(cols * rows);
  const solids = [...level.obstacles, ...level.deposits];
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const x = i * cell + cell / 2;
      const y = j * cell + cell / 2;
      let b = x < SHIP_RADIUS || y < SHIP_RADIUS || x > level.world.w - SHIP_RADIUS || y > level.world.h - SHIP_RADIUS;
      if (!b) b = solids.some((s) => Math.hypot(s.x - x, s.y - y) < s.r + SHIP_RADIUS + extra);
      blocked[j * cols + i] = b ? 1 : 0;
    }
  }
  const seen = new Uint8Array(cols * rows);
  const start = Math.floor(level.station.y / cell) * cols + Math.floor(level.station.x / cell);
  const stack = [start];
  seen[start] = 1;
  while (stack.length) {
    const c = stack.pop() as number;
    const ci = c % cols;
    const cj = Math.floor(c / cols);
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ni = ci + di;
      const nj = cj + dj;
      if (ni < 0 || nj < 0 || ni >= cols || nj >= rows) continue;
      const n = nj * cols + ni;
      if (seen[n] || blocked[n]) continue;
      seen[n] = 1;
      stack.push(n);
    }
  }
  const reach = (x: number, y: number, radius: number) => {
    const r = Math.ceil(radius / cell);
    const ci = Math.floor(x / cell);
    const cj = Math.floor(y / cell);
    for (let dj = -r; dj <= r; dj++) {
      for (let di = -r; di <= r; di++) {
        const i = ci + di;
        const j = cj + dj;
        if (i < 0 || j < 0 || i >= cols || j >= rows) continue;
        if (seen[j * cols + i] && Math.hypot(di * cell, dj * cell) <= radius) return true;
      }
    }
    return false;
  };
  return {
    fragments: level.fragments.filter((f) => !reach(f.x, f.y, 30)).length,
    deposits: level.deposits.filter((d) => !reach(d.x, d.y, d.r + SHIP_RADIUS + 30)).length,
  };
}
