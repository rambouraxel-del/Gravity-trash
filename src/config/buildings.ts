// Installations de la station : 5 emplacements fixes, 3 niveaux maximum chacun.
import type { Items } from './items';

export type BuildingId = 'workshop' | 'warehouse' | 'refinery' | 'office' | 'hangar';
export const BUILDING_IDS: readonly BuildingId[] = ['workshop', 'warehouse', 'refinery', 'office', 'hangar'];
export const MAX_BUILDING_LEVEL = 3;

export interface Cost {
  items: Items;
  credits: number;
}

export interface BuildingInfo {
  id: BuildingId;
  name: string;
  icon: string;
  desc: string;
  /** Coût pour atteindre le niveau 1, 2, 3 (index 0, 1, 2). */
  costs: [Cost, Cost, Cost];
  /** Effets affichés par niveau (index = niveau - 1). */
  effects: [string, string, string];
  /** Drapeau de progression requis pour construire (null = libre). */
  requiresFlag: string | null;
  requiresText: string;
  /** Emplacement dans la vue de la station (coordonnées logiques 390 × 844). */
  slot: { x: number; y: number };
}

export const BUILDINGS: Record<BuildingId, BuildingInfo> = {
  workshop: {
    id: 'workshop',
    name: 'Atelier',
    icon: '🛠️',
    desc: 'Améliore le vaisseau et fournit les équipements. Son niveau débloque les paliers d’amélioration.',
    costs: [
      { items: {}, credits: 0 },
      { items: { rock: 100, scrap: 60 }, credits: 100 },
      { items: { ingots: 30, cells: 10 }, credits: 600 },
    ],
    effects: ['Améliorations de vaisseau jusqu’au niveau 2 · scanner 220', 'Jusqu’au niveau 4 · scanner 300 · équipements', 'Jusqu’au niveau 6 · scanner 380'],
    requiresFlag: null,
    requiresText: '',
    slot: { x: 195, y: 395 },
  },
  warehouse: {
    id: 'warehouse',
    name: 'Entrepôt',
    icon: '📦',
    desc: 'Augmente la capacité de stockage de chaque matière.',
    costs: [
      { items: { rock: 40, scrap: 20 }, credits: 0 },
      { items: { rock: 150, scrap: 80, ingots: 10 }, credits: 150 },
      { items: { ingots: 40, cells: 10, circuits: 10 }, credits: 500 },
    ],
    effects: ['Stockage 200 par matière', 'Stockage 500 par matière', 'Stockage 1 200 par matière'],
    requiresFlag: null,
    requiresText: '',
    slot: { x: 70, y: 300 },
  },
  refinery: {
    id: 'refinery',
    name: 'Raffinerie',
    icon: '🏭',
    desc: 'Transforme automatiquement les ressources (traitement en temps réel, application ouverte).',
    costs: [
      { items: { rock: 80, scrap: 60, crystal: 10 }, credits: 150 },
      { items: { scrap: 100, ice: 40, crystal: 40, ingots: 20 }, credits: 400 },
      { items: { ingots: 60, cells: 15, circuits: 20 }, credits: 1000 },
    ],
    effects: ['1 production à la fois · lots de 5', '2 productions · lots de 10 · ×1,5 plus rapide', '3 productions · lots de 20 · ×2,2 plus rapide'],
    requiresFlag: null,
    requiresText: '',
    slot: { x: 320, y: 300 },
  },
  office: {
    id: 'office',
    name: 'Bureau commercial',
    icon: '💼',
    desc: 'Contrats, commandes et vente directe de surplus.',
    costs: [
      { items: { rock: 60, scrap: 40 }, credits: 50 },
      { items: { ingots: 15, cells: 5 }, credits: 300 },
      { items: { ingots: 40, techparts: 5 }, credits: 800 },
    ],
    effects: ['3 offres · contrats classiques et majeurs', '4 offres · contrats industriels · +10 % de récompense', '5 offres · +20 % de récompense'],
    requiresFlag: null,
    requiresText: '',
    slot: { x: 70, y: 500 },
  },
  hangar: {
    id: 'hangar',
    name: 'Hangar à drones',
    icon: '🛸',
    desc: 'Fabrique et entretient le drone collecteur.',
    costs: [
      { items: { ingots: 25, circuits: 20, techparts: 3 }, credits: 500 },
      { items: { ingots: 40, circuits: 30, techparts: 8 }, credits: 900 },
      { items: { ingots: 70, cells: 20, techparts: 15, cores: 2 }, credits: 1500 },
    ],
    effects: ['Fabrication du drone · améliorations niveau 1', 'Améliorations du drone niveau 2', 'Améliorations du drone niveau 3'],
    requiresFlag: 'hangarUnlocked',
    requiresText: 'Requiert la licence de drone (contrat majeur « Licence de drone »).',
    slot: { x: 320, y: 500 },
  },
};

export const WAREHOUSE_CAP = [60, 200, 500, 1200] as const; // index = niveau (0 = stockage de départ)
export const SCANNER_RADIUS = [0, 220, 300, 380] as const;
export const REFINERY_SLOTS = [0, 1, 2, 3] as const;
export const REFINERY_BATCH = [0, 5, 10, 20] as const;
export const REFINERY_SPEED = [0, 1, 1.5, 2.2] as const;
export const OFFICE_BOARD = [0, 3, 4, 5] as const;
export const OFFICE_BONUS = [0, 0, 0.1, 0.2] as const;
/** Niveau maximal d'une branche du vaisseau selon le niveau d'atelier. */
export const WORKSHOP_BRANCH_CAP = [0, 2, 4, 6] as const;
