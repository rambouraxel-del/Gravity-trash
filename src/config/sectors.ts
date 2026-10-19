// Les trois secteurs de la V1.
import type { ResourceId } from './items';

export type SectorId = 'belt' | 'nebula' | 'graveyard';

export interface UniqueSpec {
  id: string;
  kind: 'heavy' | 'deposit' | 'wreck';
  res: ResourceId;
  amount: number;
  label: string;
  /** Distance minimale à la station. */
  minDist: number;
}

export interface SectorConfig {
  id: SectorId;
  name: string;
  blurb: string;
  /** Graine des repères fixes (positions des gisements, épaves, zones). */
  seed: number;
  world: { w: number; h: number };
  resources: ResourceId[];
  hardness: number;
  fragmentWeights: Partial<Record<ResourceId, number>>;
  depositWeights: Partial<Record<ResourceId, number>>;
  wreckWeights: Partial<Record<ResourceId, number>>;
  counts: {
    fragments: number;
    deposits: number;
    obstacles: number;
    fields: number;
    radiation: number;
    electric: number;
    wrecks: number;
    heavies: number;
  };
  uniques: UniqueSpec[];
  palette: { bg: number; glow: number; glow2: number; stars: number; border: number };
  /** Contrat majeur qui débloque ce secteur (null = disponible au départ). */
  unlockedBy: string | null;
  hazardsText: string;
}

export const SECTORS: readonly SectorConfig[] = [
  {
    id: 'belt',
    name: 'Ceinture rocheuse',
    blurb: 'Le secteur de départ : roche et ferraille à portée de main.',
    seed: 101,
    world: { w: 2400, h: 4000 },
    resources: ['rock', 'scrap'],
    hardness: 1,
    fragmentWeights: { rock: 55, scrap: 45 },
    depositWeights: { rock: 55, scrap: 45 },
    wreckWeights: { scrap: 90, circuits: 10 },
    counts: { fragments: 78, deposits: 16, obstacles: 18, fields: 3, radiation: 0, electric: 0, wrecks: 3, heavies: 2 },
    uniques: [
      { id: 'belt-container', kind: 'heavy', res: 'scrap', amount: 40, label: 'Conteneur scellé', minDist: 2200 },
      { id: 'belt-vein', kind: 'deposit', res: 'rock', amount: 30, label: 'Veine massive', minDist: 1800 },
    ],
    palette: { bg: 0x070d1c, glow: 0x4a78d8, glow2: 0x6a5aa8, stars: 0xffffff, border: 0xff6b5e },
    unlockedBy: null,
    hazardsText: 'Roches stériles, champs d’astéroïdes instables',
  },
  {
    id: 'nebula',
    name: 'Nébuleuse cristalline',
    blurb: 'Glace et cristaux, perturbés par de violents courants énergétiques.',
    seed: 202,
    world: { w: 2400, h: 4000 },
    resources: ['ice', 'crystal'],
    hardness: 1.4,
    fragmentWeights: { ice: 50, crystal: 50 },
    depositWeights: { ice: 50, crystal: 50 },
    wreckWeights: { scrap: 70, circuits: 30 },
    counts: { fragments: 72, deposits: 16, obstacles: 10, fields: 1, radiation: 4, electric: 5, wrecks: 2, heavies: 3 },
    uniques: [
      { id: 'nebula-geode', kind: 'deposit', res: 'crystal', amount: 40, label: 'Géode géante', minDist: 2000 },
      { id: 'nebula-cargo', kind: 'heavy', res: 'ice', amount: 45, label: 'Soute gelée', minDist: 2400 },
    ],
    palette: { bg: 0x0a0a24, glow: 0x8a5aff, glow2: 0x3ee6f0, stars: 0xd8c8ff, border: 0xb38cff },
    unlockedBy: 'm1-nebula',
    hazardsText: 'Courants électriques, poches de radiation',
  },
  {
    id: 'graveyard',
    name: 'Cimetière orbital',
    blurb: 'D’immenses épaves : circuits, noyaux et beaucoup de dangers.',
    seed: 303,
    world: { w: 2400, h: 4000 },
    resources: ['circuits', 'cores', 'scrap'],
    hardness: 1.9,
    fragmentWeights: { circuits: 42, scrap: 54, cores: 4 },
    depositWeights: { circuits: 70, scrap: 30 },
    wreckWeights: { circuits: 45, scrap: 35, cores: 20 },
    counts: { fragments: 56, deposits: 10, obstacles: 8, fields: 3, radiation: 3, electric: 3, wrecks: 9, heavies: 3 },
    uniques: [
      { id: 'graveyard-prometheus', kind: 'wreck', res: 'cores', amount: 8, label: 'Épave du Prométhée', minDist: 2600 },
      { id: 'graveyard-vault', kind: 'heavy', res: 'circuits', amount: 40, label: 'Coffre blindé', minDist: 2000 },
    ],
    palette: { bg: 0x0c0a10, glow: 0xff9a3c, glow2: 0xff6b5e, stars: 0xffe0c0, border: 0xff9a3c },
    unlockedBy: 'm2-graveyard',
    hazardsText: 'Épaves instables, radiation, étincelles',
  },
];

export const getSector = (id: SectorId): SectorConfig => {
  const s = SECTORS.find((x) => x.id === id);
  if (!s) throw new Error(`Secteur inconnu : ${id}`);
  return s;
};
