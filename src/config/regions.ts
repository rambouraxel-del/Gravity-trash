// Configuration des régions. Seule la région 1 est jouable dans le lot 1 ;
// les autres sont définies pour ne pas refaire l'architecture (niveaux cumulatifs).

export type MaterialId = 'stone' | 'crystal' | 'gold' | 'circuits';
export type Branch = 'cargo' | 'magnet' | 'engine' | 'hull';

export const BRANCHES: readonly Branch[] = ['cargo', 'magnet', 'engine', 'hull'];
export const MATERIALS: readonly MaterialId[] = ['stone', 'crystal', 'gold', 'circuits'];

export interface RegionConfig {
  id: number;
  name: string;
  material: MaterialId;
  materialName: string;
  /** Tonnes créditées par fragment déposé. */
  tonsPerFragment: number;
  /** Niveau maximal natif de chacune des quatre branches dans cette région. */
  levelCap: number;
  /** Tonnes à livrer pour ouvrir la région suivante. */
  quota: number;
  /** Coefficient de prix des améliorations. */
  priceCoef: number;
  /** Coefficient de dureté des gisements. */
  hardness: number;
  playable: boolean;
}

export const REGIONS: readonly RegionConfig[] = [
  { id: 1, name: 'Ceinture rocheuse', material: 'stone', materialName: 'Pierre', tonsPerFragment: 10, levelCap: 3, quota: 1000, priceCoef: 1, hardness: 1, playable: true },
  { id: 2, name: 'Nébuleuse cristalline', material: 'crystal', materialName: 'Cristal', tonsPerFragment: 25, levelCap: 6, quota: 4000, priceCoef: 4, hardness: 1.6, playable: false },
  { id: 3, name: 'Couronne dorée', material: 'gold', materialName: 'Or', tonsPerFragment: 50, levelCap: 9, quota: 12000, priceCoef: 12, hardness: 2.56, playable: false },
  { id: 4, name: 'Cimetière orbital', material: 'circuits', materialName: 'Circuits recyclables', tonsPerFragment: 100, levelCap: 12, quota: 40000, priceCoef: 40, hardness: 4.096, playable: false },
];

/** Prix de base des trois achats d'une branche dans une région (× coefficient régional). */
export const UPGRADE_BASE_COSTS: readonly number[] = [40, 80, 120];
export const UPGRADES_PER_REGION_PER_BRANCH = 3;

export function getRegion(id: number): RegionConfig {
  const r = REGIONS.find((x) => x.id === id);
  if (!r) throw new Error(`Région inconnue : ${id}`);
  return r;
}
