// Génération d'un secteur : repères fixes (graine du secteur) + contenu renouvelé à chaque expédition.
import { RING_RADIUS, SHIP_RADIUS } from '../config/balance';
import type { ResourceId } from '../config/items';
import { getSector, type SectorConfig, type SectorId } from '../config/sectors';
import { mulberry32 } from './rng';

export interface LevelFragment { x: number; y: number; res: ResourceId; variant: number }
export interface LevelDeposit { id: string; x: number; y: number; r: number; res: ResourceId; amount: number; variant: number; unique?: string }
export interface LevelWreck { id: string; x: number; y: number; r: number; queue: ResourceId[]; variant: number; leaking: boolean; unique?: string }
export interface LevelHeavy { id: string; x: number; y: number; res: ResourceId; amount: number; unique?: string }
export interface LevelObstacle { id: string; x: number; y: number; r: number; variant: number }
export interface LevelField { id: string; x: number; y: number; r: number; count: number }
export interface LevelZone { id: string; x: number; y: number; r: number }

export interface SectorLevel {
  sector: SectorId;
  world: { w: number; h: number };
  station: { x: number; y: number; ringR: number };
  fragments: LevelFragment[];
  deposits: LevelDeposit[];
  wrecks: LevelWreck[];
  heavies: LevelHeavy[];
  obstacles: LevelObstacle[];
  fields: LevelField[];
  radiation: LevelZone[];
  electric: LevelZone[];
}

interface Solid { x: number; y: number; r: number }
const GAP = 76; // passage libre minimal entre deux solides (> 2 × rayon du vaisseau)
const MARGIN = 110;

function pickWeighted<T extends string>(rng: () => number, weights: Partial<Record<T, number>>): T {
  const entries = Object.entries(weights) as [T, number][];
  const total = entries.reduce((a, [, w]) => a + w, 0);
  let t = rng() * total;
  for (const [k, w] of entries) {
    t -= w;
    if (t <= 0) return k;
  }
  return entries[entries.length - 1][0];
}

export function generateSector(sectorId: SectorId, expeditionSeed: number, uniquesDone: ReadonlySet<string> = new Set()): SectorLevel {
  const cfg: SectorConfig = getSector(sectorId);
  const { w: W, h: H } = cfg.world;
  const land = mulberry32(cfg.seed); // repères fixes
  const content = mulberry32(expeditionSeed * 977 + cfg.seed * 13 + 7); // contenu renouvelé
  const station = { x: W / 2, y: H - 130, ringR: RING_RADIUS };
  const stationClear: Solid = { x: station.x, y: station.y, r: 250 };
  const dist = (x: number, y: number) => Math.hypot(x - station.x, y - station.y);
  const solids: Solid[] = [];
  const reserve: Solid[] = [];
  const inBounds = (x: number, y: number, r: number) => x - r >= MARGIN && x + r <= W - MARGIN && y - r >= MARGIN && y + r <= H - MARGIN;
  const clearOf = (list: Solid[], x: number, y: number, r: number, gap: number) => list.every((s) => Math.hypot(s.x - x, s.y - y) >= s.r + r + gap);
  const okSolid = (x: number, y: number, r: number) =>
    inBounds(x, y, r) && clearOf(solids, x, y, r, GAP) && clearOf(reserve, x, y, r, 20) && clearOf([stationClear], x, y, r, 0);

  /** Point aléatoire valide à une distance [minD, maxD] de la station. */
  const spot = (rng: () => number, _r: number, minD: number, maxD: number, test: (x: number, y: number) => boolean): { x: number; y: number } | null => {
    for (let i = 0; i < 400; i++) {
      const x = MARGIN + rng() * (W - 2 * MARGIN);
      const y = MARGIN + rng() * (H - 2 * MARGIN);
      const d = dist(x, y);
      if (d < minD || d > maxD) continue;
      if (test(x, y)) return { x, y };
    }
    return null;
  };

  // 1. champs d'astéroïdes instables (zones réservées)
  const fields: LevelField[] = [];
  for (let i = 0; i < cfg.counts.fields; i++) {
    const r = 140 + land() * 50;
    const p = spot(land, r, 1100, 99999, (x, y) => inBounds(x, y, r) && clearOf(reserve, x, y, r, 80));
    if (!p) continue;
    reserve.push({ x: p.x, y: p.y, r });
    fields.push({ id: `${cfg.id}-f${i}`, x: p.x, y: p.y, r, count: cfg.id === 'graveyard' ? 5 : 4 });
  }

  // 2. zones de radiation et courants électriques (traversables, annoncés)
  const zones: Solid[] = [];
  const zoneOk = (x: number, y: number, r: number) => inBounds(x, y, r * 0.6) && zones.every((z) => Math.hypot(z.x - x, z.y - y) >= z.r + r - 50) && clearOf(reserve, x, y, r, 0);
  const radiation: LevelZone[] = [];
  for (let i = 0; i < cfg.counts.radiation; i++) {
    const r = 120 + land() * 50;
    const p = spot(land, r, 900, 99999, (x, y) => zoneOk(x, y, r));
    if (!p) continue;
    zones.push({ x: p.x, y: p.y, r });
    radiation.push({ id: `${cfg.id}-r${i}`, x: p.x, y: p.y, r });
  }
  const electric: LevelZone[] = [];
  for (let i = 0; i < cfg.counts.electric; i++) {
    const r = 100 + land() * 50;
    const p = spot(land, r, 700, 99999, (x, y) => zoneOk(x, y, r));
    if (!p) continue;
    zones.push({ x: p.x, y: p.y, r });
    electric.push({ id: `${cfg.id}-e${i}`, x: p.x, y: p.y, r });
  }

  // 3. grandes épaves
  const wrecks: LevelWreck[] = [];
  const wreckSpecs: { unique?: (typeof cfg.uniques)[number] }[] = [];
  for (let i = 0; i < cfg.counts.wrecks; i++) wreckSpecs.push({});
  for (const u of cfg.uniques) if (u.kind === 'wreck') wreckSpecs.push({ unique: u });
  wreckSpecs.forEach((spec, i) => {
    const r = spec.unique ? 62 : 36 + land() * 22;
    const minD = spec.unique ? spec.unique.minDist : 500;
    const p = spot(land, r, minD, 99999, (x, y) => okSolid(x, y, r));
    if (!p) return;
    solids.push({ x: p.x, y: p.y, r });
    const leaking = spec.unique ? true : cfg.id !== 'belt' && i % 2 === 1;
    const variant = Math.floor(land() * 3);
    if (spec.unique && uniquesDone.has(spec.unique.id)) return;
    const queue: ResourceId[] = [];
    if (spec.unique) {
      for (let k = 0; k < spec.unique.amount; k++) queue.push(spec.unique.res);
      queue.push('circuits', 'circuits', 'scrap', 'scrap');
    } else {
      const n = 8 + Math.floor(content() * 6);
      for (let k = 0; k < n; k++) queue.push(pickWeighted(content, cfg.wreckWeights));
    }
    wrecks.push({ id: spec.unique ? spec.unique.id : `${cfg.id}-w${i}`, x: p.x, y: p.y, r, queue, variant, leaking, unique: spec.unique?.id });
    if (leaking) radiation.push({ id: `${spec.unique ? spec.unique.id : `${cfg.id}-w${i}`}-aura`, x: p.x, y: p.y, r: r + 62 });
  });

  // 4. obstacles stériles
  const obstacles: LevelObstacle[] = [];
  for (let i = 0; i < cfg.counts.obstacles; i++) {
    const r = 24 + land() * 24;
    const p = spot(land, r, 280, 99999, (x, y) => okSolid(x, y, r));
    if (!p) continue;
    solids.push({ x: p.x, y: p.y, r });
    obstacles.push({ id: `${cfg.id}-o${i}`, x: p.x, y: p.y, r, variant: Math.floor(land() * 3) });
  }

  // 5. gisements : les trois premiers près de la station, ~40 % dans les zones dangereuses, le reste loin
  const DEPOSIT_R = 26;
  const deposits: LevelDeposit[] = [];
  const hazardZones = [...radiation.filter((z) => !z.id.endsWith('-aura')), ...electric];
  const coreDeposits = cfg.id === 'graveyard' ? 2 : 0;
  const regular = cfg.counts.deposits;
  for (let i = 0; i < regular; i++) {
    const isCore = i >= regular - coreDeposits;
    const near = i < 3;
    const wantZone = !near && hazardZones.length > 0 && (isCore || land() < 0.4);
    let p: { x: number; y: number } | null = null;
    let inZone = false;
    if (wantZone) {
      const pool = isCore ? radiation.filter((z) => !z.id.endsWith('-aura')) : hazardZones;
      for (let a = 0; a < 60 && !p; a++) {
        const z = pool[Math.floor(land() * pool.length)];
        if (!z) break;
        const ang = land() * Math.PI * 2;
        const d = land() * Math.max(10, z.r - 50);
        const x = z.x + Math.cos(ang) * d;
        const y = z.y + Math.sin(ang) * d;
        if (okSolid(x, y, DEPOSIT_R)) {
          p = { x, y };
          inZone = true;
        }
      }
    }
    if (!p) p = spot(land, DEPOSIT_R, i === 0 ? 330 : near ? 450 : 700, i === 0 ? 520 : near ? 900 : 99999, (x, y) => okSolid(x, y, DEPOSIT_R));
    if (!p) continue;
    solids.push({ x: p.x, y: p.y, r: DEPOSIT_R });
    const res: ResourceId = isCore ? 'cores' : i === 0 ? cfg.resources[0] : pickWeighted(land, cfg.depositWeights);
    const far = dist(p.x, p.y) > 2200;
    let amount = isCore ? 4 + Math.floor(content() * 3) : 8 + Math.floor(content() * 8);
    if (!isCore && (inZone || far)) amount = Math.round(amount * 1.8);
    deposits.push({ id: `${cfg.id}-d${i}`, x: p.x, y: p.y, r: DEPOSIT_R, res, amount, variant: Math.floor(land() * 2) });
  }
  for (const u of cfg.uniques) {
    if (u.kind !== 'deposit') continue;
    const p = spot(land, DEPOSIT_R, u.minDist, 99999, (x, y) => okSolid(x, y, DEPOSIT_R));
    if (!p) continue;
    solids.push({ x: p.x, y: p.y, r: DEPOSIT_R });
    if (uniquesDone.has(u.id)) continue;
    deposits.push({ id: u.id, x: p.x, y: p.y, r: DEPOSIT_R, res: u.res, amount: u.amount, variant: Math.floor(land() * 2), unique: u.id });
  }

  // 6. objets lourds
  const heavies: LevelHeavy[] = [];
  for (let i = 0; i < cfg.counts.heavies; i++) {
    const p = spot(land, 30, 700, 99999, (x, y) => clearOf(solids, x, y, 30, 40) && inBounds(x, y, 30));
    if (!p) continue;
    const res = pickWeighted(land, cfg.fragmentWeights);
    heavies.push({ id: `${cfg.id}-h${i}`, x: p.x, y: p.y, res, amount: 12 + Math.floor(content() * 14) });
  }
  for (const u of cfg.uniques) {
    if (u.kind !== 'heavy') continue;
    const p = spot(land, 30, u.minDist, 99999, (x, y) => clearOf(solids, x, y, 30, 40) && inBounds(x, y, 30));
    if (!p || uniquesDone.has(u.id)) continue;
    heavies.push({ id: u.id, x: p.x, y: p.y, res: u.res, amount: u.amount, unique: u.id });
  }

  // 7. fragments libres : premier groupe très proche de la station, puis grappes dispersées
  const fragments: LevelFragment[] = [];
  const addCluster = (cx: number, cy: number, n: number, spread: number) => {
    let placed = 0;
    for (let a = 0; a < n * 30 && placed < n; a++) {
      const ang = content() * Math.PI * 2;
      const d = Math.sqrt(content()) * spread;
      const x = cx + Math.cos(ang) * d;
      const y = cy + Math.sin(ang) * d;
      if (!inBounds(x, y, 8) || !clearOf(solids, x, y, 8, 12)) continue;
      if (fragments.some((f) => Math.hypot(f.x - x, f.y - y) < 20)) continue;
      fragments.push({ x, y, res: pickWeighted(content, cfg.fragmentWeights), variant: Math.floor(content() * 3) });
      placed++;
    }
  };
  addCluster(station.x + (content() - 0.5) * 80, station.y - 270, 6, 40);
  let guard = 0;
  while (fragments.length < cfg.counts.fragments && guard++ < 400) {
    const nearZone = zones.length > 0 && content() < 0.2;
    let c: { x: number; y: number } | null = null;
    if (nearZone) {
      const z = zones[Math.floor(content() * zones.length)];
      c = { x: z.x + (content() - 0.5) * z.r, y: z.y + (content() - 0.5) * z.r };
    } else {
      c = spot(content, 8, 350, 99999, (x, y) => clearOf(solids, x, y, 8, 30));
    }
    if (c) addCluster(c.x, c.y, 3 + Math.floor(content() * 3), 38);
  }
  if (fragments.length > cfg.counts.fragments) fragments.length = cfg.counts.fragments;

  return { sector: sectorId, world: { w: W, h: H }, station, fragments, deposits, wrecks, heavies, obstacles, fields, radiation, electric };
}

/**
 * Vérifie par remplissage de grille que le vaisseau peut atteindre depuis la station chaque
 * fragment, gisement, épave et objet lourd (les zones de danger sont traversables).
 */
export function unreachableTargets(level: SectorLevel, cell = 20, extra = 4): { fragments: number; deposits: number; wrecks: number; heavies: number } {
  const cols = Math.ceil(level.world.w / cell);
  const rows = Math.ceil(level.world.h / cell);
  const blocked = new Uint8Array(cols * rows);
  const solids: Solid[] = [...level.obstacles, ...level.deposits, ...level.wrecks];
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
    wrecks: level.wrecks.filter((w) => !reach(w.x, w.y, w.r + SHIP_RADIUS + 60)).length,
    heavies: level.heavies.filter((h) => !reach(h.x, h.y, 40)).length,
  };
}
