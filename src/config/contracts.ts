// Contrats ordinaires, contrats majeurs scénarisés et projet final (relais orbital).
import { ITEM_INFO, ITEMS, type Items } from './items';
import type { BuildingId } from './buildings';
import type { SectorId } from './sectors';

export type ContractTier = 'classic' | 'industrial';

export interface ContractTemplate {
  id: string;
  tier: ContractTier;
  name: string;
  desc: string;
  needs: Items;
  /** Multiplicateur de récompense appliqué à la valeur de vente des matières. */
  factor: number;
  requires: { sector?: SectorId; building?: { id: BuildingId; level: number } };
}

export const CONTRACT_TEMPLATES: readonly ContractTemplate[] = [
  { id: 'c-rock', tier: 'classic', name: 'Roche pour chantier', desc: 'Un chantier voisin manque de remblai.', needs: { rock: 40 }, factor: 1.6, requires: {} },
  { id: 'c-scrap', tier: 'classic', name: 'Ferraille de fonderie', desc: 'Une fonderie de passage rachète du métal.', needs: { scrap: 30 }, factor: 1.6, requires: {} },
  { id: 'c-ice', tier: 'classic', name: 'Glace pour station', desc: 'Réserve d’eau et de réfrigérant.', needs: { ice: 30 }, factor: 1.6, requires: { sector: 'nebula' } },
  { id: 'c-crystal', tier: 'classic', name: 'Cristaux de recherche', desc: 'Un laboratoire cherche des échantillons purs.', needs: { crystal: 20 }, factor: 1.6, requires: { sector: 'nebula' } },
  { id: 'c-ingots', tier: 'classic', name: 'Lingots d’acier', desc: 'Commande de métal raffiné.', needs: { ingots: 10 }, factor: 1.7, requires: { building: { id: 'refinery', level: 1 } } },
  { id: 'c-cells', tier: 'classic', name: 'Cellules de secours', desc: 'Alimentation pour une balise isolée.', needs: { cells: 8 }, factor: 1.7, requires: { building: { id: 'refinery', level: 1 } } },
  { id: 'i-structure', tier: 'industrial', name: 'Armature de module', desc: 'Pour l’extension d’un chantier orbital.', needs: { ingots: 20, cells: 10 }, factor: 1.9, requires: { building: { id: 'refinery', level: 1 } } },
  { id: 'i-techparts', tier: 'industrial', name: 'Lot de pièces techniques', desc: 'Composants de précision pour un fabricant.', needs: { techparts: 5 }, factor: 1.9, requires: { building: { id: 'refinery', level: 1 } } },
  { id: 'i-boards', tier: 'industrial', name: 'Cartes de commande', desc: 'Électronique de récupération et armature.', needs: { circuits: 15, ingots: 5 }, factor: 1.9, requires: { sector: 'graveyard' } },
  { id: 'i-power', tier: 'industrial', name: 'Alimentation de relais', desc: 'Énergie pour un relais de communication.', needs: { cells: 15, ingots: 5 }, factor: 1.9, requires: { building: { id: 'refinery', level: 1 } } },
  { id: 'i-cores', tier: 'industrial', name: 'Noyaux de recherche', desc: 'Un institut paie cher les noyaux énergétiques.', needs: { cores: 3 }, factor: 3, requires: { sector: 'graveyard' } },
  { id: 'i-complete', tier: 'industrial', name: 'Livraison complète', desc: 'Un lot varié pour un grand constructeur.', needs: { ingots: 10, cells: 6, techparts: 3 }, factor: 2, requires: { building: { id: 'refinery', level: 1 } } },
];

export const getTemplate = (id: string): ContractTemplate | undefined => CONTRACT_TEMPLATES.find((t) => t.id === id);

export const baseReward = (needs: Items, factor: number): number => {
  const v = ITEMS.reduce((a, i) => a + (needs[i] ?? 0) * ITEM_INFO[i].sell, 0);
  return Math.max(10, Math.round((v * factor) / 10) * 10);
};

export interface MajorContract {
  id: string;
  order: number;
  name: string;
  story: string;
  needs: Items;
  rewardCredits: number;
  /** Conditions d'apparition. */
  requires: { majorsDone?: string[]; building?: { id: BuildingId; level: number }; flag?: string };
  requiresText: string;
  unlocks: { sector?: SectorId; flag?: string };
  unlocksText: string;
}

export const MAJOR_CONTRACTS: readonly MajorContract[] = [
  {
    id: 'm1-nebula',
    order: 1,
    name: 'Ouverture de la nébuleuse',
    story: 'Une compagnie de transport veut une base arrière : livre de quoi baliser la route de la Nébuleuse cristalline.',
    needs: { rock: 80, scrap: 50 },
    rewardCredits: 200,
    requires: { building: { id: 'office', level: 1 } },
    requiresText: 'Construis le bureau commercial.',
    unlocks: { sector: 'nebula' },
    unlocksText: 'Débloque la Nébuleuse cristalline.',
  },
  {
    id: 'm2-graveyard',
    order: 2,
    name: 'Route du cimetière',
    story: 'Le Cimetière orbital recèle d’anciennes soutes pleines. Il faut des vivres industriels pour y établir une balise.',
    needs: { ingots: 12, cells: 8 },
    rewardCredits: 500,
    requires: { majorsDone: ['m1-nebula'], building: { id: 'refinery', level: 1 } },
    requiresText: 'Termine « Ouverture de la nébuleuse » et construis la raffinerie.',
    unlocks: { sector: 'graveyard' },
    unlocksText: 'Débloque le Cimetière orbital.',
  },
  {
    id: 'm3-drone',
    order: 3,
    name: 'Licence de drone',
    story: 'Un constructeur te propose une licence pour fabriquer un drone collecteur, contre des composants de qualité.',
    needs: { techparts: 4, circuits: 10 },
    rewardCredits: 600,
    requires: { majorsDone: ['m2-graveyard'] },
    requiresText: 'Termine « Route du cimetière ».',
    unlocks: { flag: 'hangarUnlocked' },
    unlocksText: 'Autorise la construction du hangar à drones.',
  },
  {
    id: 'm4-relay',
    order: 4,
    name: 'Autorisation du relais',
    story: 'La guilde commerciale autorise ton relais orbital. Elle exige des pièces de précision et des noyaux de référence.',
    needs: { techparts: 10, cores: 6 },
    rewardCredits: 2000,
    requires: { majorsDone: ['m3-drone'], flag: 'droneBuilt' },
    requiresText: 'Termine « Licence de drone » et fabrique ton premier drone.',
    unlocks: { flag: 'projectOpen' },
    unlocksText: 'Ouvre le chantier du relais orbital.',
  },
];

export const getMajor = (id: string): MajorContract | undefined => MAJOR_CONTRACTS.find((m) => m.id === id);

// --- Projet final : le relais commercial orbital ----------------------------------
export interface ProjectRequirement {
  key: string;
  stage: string;
  item: keyof typeof ITEM_INFO | 'credits';
  amount: number;
}

export const PROJECT_STAGES: readonly { id: string; name: string; desc: string }[] = [
  { id: 'structure', name: 'Structure', desc: 'L’ossature métallique du relais.' },
  { id: 'energy', name: 'Énergie', desc: 'Les cellules qui alimenteront ses antennes.' },
  { id: 'systems', name: 'Systèmes', desc: 'Pièces de précision et noyaux de référence.' },
  { id: 'funding', name: 'Financement', desc: 'L’investissement exigé par la guilde.' },
];

export const PROJECT_REQUIREMENTS: readonly ProjectRequirement[] = [
  { key: 'ingots', stage: 'structure', item: 'ingots', amount: 60 },
  { key: 'cells', stage: 'energy', item: 'cells', amount: 30 },
  { key: 'techparts', stage: 'systems', item: 'techparts', amount: 15 },
  { key: 'cores', stage: 'systems', item: 'cores', amount: 10 },
  { key: 'credits', stage: 'funding', item: 'credits', amount: 3000 },
];
