// Logique économique pure : transactions atomiques et idempotentes sur une sauvegarde.
// Chaque fonction renvoie un nouvel état ; en cas d'échec, l'état d'origine est rendu inchangé.
import {
  BRANCHES,
  UPGRADES_PER_REGION_PER_BRANCH,
  UPGRADE_BASE_COSTS,
  getRegion,
  REGIONS,
  type Branch,
  type RegionConfig,
} from '../config/regions';
import { MAX_TRANSACTIONS, cloneSave, type SaveData } from './save-model';

export type TxFailure = 'duplicate' | 'invalid' | 'insufficient' | 'maxed' | 'locked' | 'unavailable';
export type TxResult =
  | { ok: true; state: SaveData }
  | { ok: false; reason: TxFailure; message: string; state: SaveData };

const fail = (state: SaveData, reason: TxFailure, message: string): TxResult => ({ ok: false, reason, message, state });

function commit(state: SaveData, txId: string, mutate: (draft: SaveData) => void): TxResult {
  if (typeof txId !== 'string' || txId.length === 0) return fail(state, 'invalid', 'Identifiant de transaction manquant.');
  if (state.transactions.includes(txId)) return fail(state, 'duplicate', 'Transaction déjà traitée.');
  const draft = cloneSave(state);
  mutate(draft);
  draft.transactions.push(txId);
  if (draft.transactions.length > MAX_TRANSACTIONS) draft.transactions.splice(0, draft.transactions.length - MAX_TRANSACTIONS);
  return { ok: true, state: draft };
}

export const activeRegion = (state: SaveData): RegionConfig => getRegion(state.activeRegion);

// --- Dépôt -----------------------------------------------------------------
/** Crédite le stock de la matière régionale : une seule fois par identifiant. */
export function applyDeposit(state: SaveData, txId: string, fragments: number): TxResult {
  if (!Number.isInteger(fragments) || fragments < 0) return fail(state, 'invalid', 'Quantité invalide.');
  const region = activeRegion(state);
  return commit(state, txId, (d) => {
    d.stock[region.material] += fragments * region.tonsPerFragment;
  });
}

// --- Améliorations ---------------------------------------------------------
/** Prix du prochain niveau d'une branche dans une région (null si hors palier). */
export function upgradeCost(region: RegionConfig, currentLevel: number): number | null {
  const idx = currentLevel - (region.id - 1) * UPGRADES_PER_REGION_PER_BRANCH;
  if (idx < 0 || idx >= UPGRADES_PER_REGION_PER_BRANCH) return null;
  return UPGRADE_BASE_COSTS[idx] * region.priceCoef;
}

export function nextUpgradeCost(state: SaveData, branch: Branch): number | null {
  const region = activeRegion(state);
  if (state.levels[branch] >= region.levelCap) return null;
  return upgradeCost(region, state.levels[branch]);
}

export function purchaseUpgrade(state: SaveData, branch: Branch, txId: string): TxResult {
  if (!BRANCHES.includes(branch)) return fail(state, 'invalid', 'Branche inconnue.');
  const region = activeRegion(state);
  const cost = nextUpgradeCost(state, branch);
  if (cost === null) return fail(state, 'maxed', 'Cette branche est au maximum pour la région.');
  const have = state.stock[region.material];
  if (have < cost) return fail(state, 'insufficient', `Il manque ${cost - have} t de ${region.materialName.toLowerCase()}.`);
  return commit(state, txId, (d) => {
    d.stock[region.material] -= cost;
    d.levels[branch] += 1;
  });
}

// --- Progression de palier ---------------------------------------------------
/** « Atelier x/12 » : améliorations achetées dans le palier actif. */
export function workshopProgress(state: SaveData): { done: number; total: number } {
  const region = activeRegion(state);
  const base = (region.id - 1) * UPGRADES_PER_REGION_PER_BRANCH;
  let done = 0;
  for (const b of BRANCHES) {
    done += Math.max(0, Math.min(UPGRADES_PER_REGION_PER_BRANCH, state.levels[b] - base));
  }
  return { done, total: BRANCHES.length * UPGRADES_PER_REGION_PER_BRANCH };
}

export function branchesMaxed(state: SaveData): boolean {
  const cap = activeRegion(state).levelCap;
  return BRANCHES.every((b) => state.levels[b] >= cap);
}

export interface DeliveryStatus {
  delivered: number;
  quota: number;
  remaining: number;
  unlocked: boolean;
  /** Tonnes du stock livrables d'un coup (stock plafonné par le reste du quota). */
  maxDeliverable: number;
  /** Raison du verrou, ou null si la livraison est possible. */
  lockReason: string | null;
}

export function deliveryStatus(state: SaveData): DeliveryStatus {
  const region = activeRegion(state);
  const delivered = state.delivered[region.id - 1];
  const remaining = Math.max(0, region.quota - delivered);
  const stock = state.stock[region.material];
  const wp = workshopProgress(state);
  let lockReason: string | null = null;
  if (!branchesMaxed(state)) lockReason = `Maximise d'abord les 4 branches (atelier ${wp.done}/${wp.total}).`;
  else if (remaining === 0) lockReason = 'Quota déjà livré.';
  else if (stock < 1) lockReason = `Aucune ${region.materialName.toLowerCase()} en stock à livrer.`;
  return {
    delivered,
    quota: region.quota,
    remaining,
    unlocked: lockReason === null,
    maxDeliverable: Math.min(stock, remaining),
    lockReason,
  };
}

/** Livre `amount` tonnes depuis le stock : retire du stock, crédite le compteur « livré ». */
export function deliver(state: SaveData, amount: number, txId: string): TxResult {
  if (!Number.isInteger(amount) || amount < 1) return fail(state, 'invalid', 'Quantité invalide.');
  const region = activeRegion(state);
  const st = deliveryStatus(state);
  if (!branchesMaxed(state)) return fail(state, 'locked', st.lockReason ?? 'Livraison verrouillée.');
  if (st.remaining === 0) return fail(state, 'maxed', 'Quota déjà livré.');
  if (amount > st.remaining) return fail(state, 'invalid', `Il ne reste que ${st.remaining} t à livrer.`);
  const have = state.stock[region.material];
  if (amount > have) return fail(state, 'insufficient', `Stock insuffisant : ${have} t disponibles.`);
  return commit(state, txId, (d) => {
    d.stock[region.material] -= amount;
    d.delivered[region.id - 1] += amount;
  });
}

// --- Transition de région -------------------------------------------------
export interface TransitionStatus {
  upgradesDone: number;
  upgradesTotal: number;
  upgradesOk: boolean;
  delivered: number;
  quota: number;
  deliveryOk: boolean;
  nextRegionId: number | null;
  alreadyUnlocked: boolean;
  canOpen: boolean;
  reasons: string[];
}

export function transitionStatus(state: SaveData): TransitionStatus {
  const region = activeRegion(state);
  const wp = workshopProgress(state);
  const upgradesOk = branchesMaxed(state);
  const delivered = state.delivered[region.id - 1];
  const deliveryOk = delivered >= region.quota;
  const next = REGIONS.find((r) => r.id === region.id + 1) ?? null;
  const alreadyUnlocked = next !== null && state.unlockedRegions.includes(next.id);
  const reasons: string[] = [];
  if (!upgradesOk) reasons.push(`Atelier ${wp.done}/${wp.total} : maximise les quatre branches.`);
  if (!deliveryOk) reasons.push(`Livraison ${delivered}/${region.quota} t : livre le quota de ${region.materialName.toLowerCase()}.`);
  return {
    upgradesDone: wp.done,
    upgradesTotal: wp.total,
    upgradesOk,
    delivered,
    quota: region.quota,
    deliveryOk,
    nextRegionId: next ? next.id : null,
    alreadyUnlocked,
    canOpen: upgradesOk && deliveryOk && next !== null && !alreadyUnlocked,
    reasons,
  };
}

export function openNextRegion(state: SaveData, txId: string): TxResult {
  const t = transitionStatus(state);
  if (t.nextRegionId === null) return fail(state, 'unavailable', 'Aucune région suivante.');
  if (t.alreadyUnlocked) return fail(state, 'duplicate', 'Région déjà débloquée.');
  if (!t.canOpen) return fail(state, 'locked', t.reasons.join(' '));
  const next = t.nextRegionId;
  return commit(state, txId, (d) => {
    if (!d.unlockedRegions.includes(next)) d.unlockedRegions.push(next);
  });
}
