// Ressources brutes, produits raffinés, recettes de la raffinerie.

export type ResourceId = 'rock' | 'scrap' | 'ice' | 'crystal' | 'circuits' | 'cores';
export type RefinedId = 'ingots' | 'cells' | 'techparts';
export type ItemId = ResourceId | RefinedId;

export const RESOURCES: readonly ResourceId[] = ['rock', 'scrap', 'ice', 'crystal', 'circuits', 'cores'];
export const REFINED: readonly RefinedId[] = ['ingots', 'cells', 'techparts'];
export const ITEMS: readonly ItemId[] = [...RESOURCES, ...REFINED];

export type Items = Partial<Record<ItemId, number>>;
export type Stock = Record<ItemId, number>;

export interface ItemInfo {
  id: ItemId;
  name: string;
  icon: string;
  /** Couleur de rendu (0xRRGGBB) et CSS. */
  color: number;
  css: string;
  /** Prix de vente directe fixe, en crédits par unité. */
  sell: number;
  refined: boolean;
}

export const ITEM_INFO: Record<ItemId, ItemInfo> = {
  rock: { id: 'rock', name: 'Roche brute', icon: '🪨', color: 0xa9b1c6, css: '#a9b1c6', sell: 1, refined: false },
  scrap: { id: 'scrap', name: 'Ferraille', icon: '🔩', color: 0xd9a066, css: '#d9a066', sell: 2, refined: false },
  ice: { id: 'ice', name: 'Glace', icon: '🧊', color: 0x9fe6ff, css: '#9fe6ff', sell: 3, refined: false },
  crystal: { id: 'crystal', name: 'Cristaux', icon: '💎', color: 0xb38cff, css: '#b38cff', sell: 5, refined: false },
  circuits: { id: 'circuits', name: 'Circuits récupérés', icon: '🔌', color: 0x6ee7a8, css: '#6ee7a8', sell: 8, refined: false },
  cores: { id: 'cores', name: 'Noyaux énergétiques', icon: '⚛️', color: 0xffb347, css: '#ffb347', sell: 20, refined: false },
  ingots: { id: 'ingots', name: 'Lingots métalliques', icon: '🧱', color: 0xe8c07a, css: '#e8c07a', sell: 8, refined: true },
  cells: { id: 'cells', name: 'Cellules énergétiques', icon: '🔋', color: 0x5fd8ff, css: '#5fd8ff', sell: 18, refined: true },
  techparts: { id: 'techparts', name: 'Pièces technologiques', icon: '⚙️', color: 0xff8fd0, css: '#ff8fd0', sell: 40, refined: true },
};

export type RecipeId = 'ingots' | 'cells' | 'techparts';

export interface Recipe {
  id: RecipeId;
  output: RefinedId;
  inputs: Items;
  /** Secondes de traitement par unité produite (niveau 1 de raffinerie). */
  time: number;
}

export const RECIPES: readonly Recipe[] = [
  { id: 'ingots', output: 'ingots', inputs: { scrap: 3 }, time: 8 },
  { id: 'cells', output: 'cells', inputs: { ice: 2, crystal: 1 }, time: 12 },
  { id: 'techparts', output: 'techparts', inputs: { ingots: 2, circuits: 1 }, time: 18 },
];

export const getRecipe = (id: RecipeId): Recipe => {
  const r = RECIPES.find((x) => x.id === id);
  if (!r) throw new Error(`Recette inconnue : ${id}`);
  return r;
};

export const emptyStock = (): Stock => ({ rock: 0, scrap: 0, ice: 0, crystal: 0, circuits: 0, cores: 0, ingots: 0, cells: 0, techparts: 0 });

export const sumItems = (items: Items): number => ITEMS.reduce((a, i) => a + (items[i] ?? 0), 0);

/** Quantité totale de crédits équivalente (prix de vente). */
export const sellValue = (items: Items): number => ITEMS.reduce((a, i) => a + (items[i] ?? 0) * ITEM_INFO[i].sell, 0);
