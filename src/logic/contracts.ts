import { OFFICE_BOARD, OFFICE_BONUS } from '../config/buildings';
import {
  CONTRACT_TEMPLATES,
  MAJOR_CONTRACTS,
  baseReward,
  getMajor,
  getTemplate,
  type ContractTemplate,
  type MajorContract,
} from '../config/contracts';
import { ITEM_INFO, ITEMS, type Items } from '../config/items';
import { mulberry32 } from './rng';
import type { ActiveContract, SaveData } from './save-model';
import { commit, fail, freeSpace, scaleItems, type TxResult } from './tx';

export const MAX_ACTIVE_ORDINARY = 3;

export const officeLevel = (s: SaveData) => s.buildings.office;
export const boardSize = (s: SaveData) => OFFICE_BOARD[s.buildings.office];

/** Matières demandées par un contrat actif ou une offre. */
export function contractNeeds(c: { kind?: 'ordinary' | 'major'; templateId: string; mult: number }): Items {
  const major = getMajor(c.templateId);
  if (major) return major.needs;
  const t = getTemplate(c.templateId);
  return t ? scaleItems(t.needs, c.mult) : {};
}

export function contractReward(state: SaveData, c: { templateId: string; mult: number }): number {
  const major = getMajor(c.templateId);
  if (major) return major.rewardCredits;
  const t = getTemplate(c.templateId);
  if (!t) return 0;
  const base = baseReward(scaleItems(t.needs, c.mult), t.factor);
  return Math.round((base * (1 + OFFICE_BONUS[state.buildings.office])) / 10) * 10;
}

export function templateAvailable(state: SaveData, t: ContractTemplate): boolean {
  if (t.tier === 'industrial' && state.buildings.office < 2) return false;
  if (t.requires.sector && !state.sectors.unlocked.includes(t.requires.sector)) return false;
  if (t.requires.building && state.buildings[t.requires.building.id] < t.requires.building.level) return false;
  return true;
}

export type MajorStatus = 'locked' | 'available' | 'active' | 'done';

export function majorStatus(state: SaveData, m: MajorContract): MajorStatus {
  if (state.contracts.majorsDone.includes(m.id)) return 'done';
  if (state.contracts.active.some((a) => a.templateId === m.id)) return 'active';
  const r = m.requires;
  if (r.majorsDone && !r.majorsDone.every((id) => state.contracts.majorsDone.includes(id))) return 'locked';
  if (r.building && state.buildings[r.building.id] < r.building.level) return 'locked';
  if (r.flag && !state.flags[r.flag as keyof SaveData['flags']]) return 'locked';
  return 'available';
}

/** Remplit le tableau d'offres (déterministe : graine = profil + compteur). Sans effet s'il est déjà plein. */
export function ensureBoard(state: SaveData): SaveData {
  const size = boardSize(state);
  if (size === 0 || state.contracts.board.length >= size) return state;
  const draft: SaveData = JSON.parse(JSON.stringify(state));
  let guard = 0;
  while (draft.contracts.board.length < size && guard++ < 40) {
    const taken = new Set([...draft.contracts.board, ...draft.contracts.active].map((o) => `${o.templateId}:${o.mult}`));
    // une même matière peut revenir avec une autre quantité ; jamais deux offres identiques
    const pool: { t: ContractTemplate; mult: number }[] = [];
    for (const t of CONTRACT_TEMPLATES) {
      if (!templateAvailable(draft, t)) continue;
      for (const mult of [1, 2, 3]) if (!taken.has(`${t.id}:${mult}`)) pool.push({ t, mult });
    }
    if (pool.length === 0) break;
    draft.contracts.counter += 1;
    let seed = draft.contracts.counter * 7919;
    for (let i = 0; i < draft.profileId.length; i++) seed = (seed * 31 + draft.profileId.charCodeAt(i)) >>> 0;
    const rng = mulberry32(seed);
    const pick = pool[Math.floor(rng() * pool.length)];
    draft.contracts.board.push({ id: `o${draft.contracts.counter}`, templateId: pick.t.id, mult: pick.mult });
  }
  return draft;
}

export const activeOrdinaryCount = (s: SaveData) => s.contracts.active.filter((a) => a.kind === 'ordinary').length;

export function acceptOffer(state: SaveData, offerId: string, txId: string): TxResult {
  const offer = state.contracts.board.find((o) => o.id === offerId);
  if (!offer) return fail(state, 'invalid', 'Offre introuvable.');
  if (activeOrdinaryCount(state) >= MAX_ACTIVE_ORDINARY) return fail(state, 'locked', `Maximum ${MAX_ACTIVE_ORDINARY} contrats en cours.`);
  const r = commit(state, txId, (d) => {
    d.contracts.board = d.contracts.board.filter((o) => o.id !== offerId);
    d.contracts.active.push({ id: offer.id, kind: 'ordinary', templateId: offer.templateId, mult: offer.mult, delivered: {} });
  });
  return r.ok ? { ok: true, state: ensureBoard(r.state) } : r;
}

export function acceptMajor(state: SaveData, majorId: string, txId: string): TxResult {
  const m = getMajor(majorId);
  if (!m) return fail(state, 'invalid', 'Contrat inconnu.');
  const st = majorStatus(state, m);
  if (st === 'locked') return fail(state, 'locked', m.requiresText);
  if (st !== 'available') return fail(state, 'duplicate', st === 'done' ? 'Contrat déjà terminé.' : 'Contrat déjà en cours.');
  return commit(state, txId, (d) => {
    d.contracts.active.push({ id: `m:${m.id}`, kind: 'major', templateId: m.id, mult: 1, delivered: {} });
  });
}

export function remainingNeeds(_state: SaveData, a: ActiveContract): Items {
  const need = contractNeeds(a);
  const out: Items = {};
  for (const i of ITEMS) {
    const r = (need[i] ?? 0) - (a.delivered[i] ?? 0);
    if (r > 0) out[i] = r;
  }
  return out;
}

export const isFulfilled = (state: SaveData, a: ActiveContract): boolean => Object.keys(remainingNeeds(state, a)).length === 0;

/** Livre depuis le stock tout ce qui peut l'être pour ce contrat (progressif). */
export function deliverToContract(state: SaveData, contractId: string, txId: string): TxResult {
  const a = state.contracts.active.find((x) => x.id === contractId);
  if (!a) return fail(state, 'invalid', 'Contrat introuvable.');
  const rem = remainingNeeds(state, a);
  const moves: Items = {};
  let total = 0;
  for (const i of ITEMS) {
    const n = Math.min(rem[i] ?? 0, state.stock[i]);
    if (n > 0) {
      moves[i] = n;
      total += n;
    }
  }
  if (total === 0) return fail(state, 'insufficient', 'Rien à livrer : le stock ne contient pas les matières demandées.');
  return commit(state, txId, (d) => {
    const c = d.contracts.active.find((x) => x.id === contractId);
    if (!c) return;
    for (const i of ITEMS) {
      const n = moves[i] ?? 0;
      if (n > 0) {
        d.stock[i] -= n;
        c.delivered[i] = (c.delivered[i] ?? 0) + n;
      }
    }
  });
}

export function completeContract(state: SaveData, contractId: string, txId: string): TxResult {
  const a = state.contracts.active.find((x) => x.id === contractId);
  if (!a) return fail(state, 'invalid', 'Contrat introuvable.');
  if (!isFulfilled(state, a)) return fail(state, 'locked', 'Il reste des matières à livrer.');
  const reward = contractReward(state, a);
  const major = getMajor(a.templateId);
  const r = commit(state, txId, (d) => {
    d.contracts.active = d.contracts.active.filter((x) => x.id !== contractId);
    d.credits += reward;
    if (major) {
      d.contracts.majorsDone.push(major.id);
      if (major.unlocks.sector && !d.sectors.unlocked.includes(major.unlocks.sector)) d.sectors.unlocked.push(major.unlocks.sector);
      if (major.unlocks.flag) d.flags[major.unlocks.flag as keyof SaveData['flags']] = true;
    } else {
      d.contracts.completed += 1;
    }
  });
  return r.ok ? { ok: true, state: ensureBoard(r.state), note: `+${reward} crédits` } : r;
}

/** Abandon d'un contrat ordinaire : les matières livrées sont rendues (dans la limite de l'entrepôt). */
export function abandonContract(state: SaveData, contractId: string, txId: string): TxResult {
  const a = state.contracts.active.find((x) => x.id === contractId);
  if (!a) return fail(state, 'invalid', 'Contrat introuvable.');
  if (a.kind === 'major') return fail(state, 'locked', 'Un contrat majeur ne peut pas être abandonné.');
  const r = commit(state, txId, (d) => {
    const c = d.contracts.active.find((x) => x.id === contractId);
    d.contracts.active = d.contracts.active.filter((x) => x.id !== contractId);
    const lost: string[] = [];
    if (c) {
      for (const i of ITEMS) {
        const n = c.delivered[i] ?? 0;
        if (n <= 0) continue;
        const back = Math.min(n, freeSpace(d, i));
        d.stock[i] += back;
        if (n - back > 0) lost.push(`${n - back} ${ITEM_INFO[i].name.toLowerCase()}`);
      }
    }
    return lost.length ? `Entrepôt plein : ${lost.join(', ')} perdu(s).` : undefined;
  });
  if (!r.ok) return r;
  return { ...r, state: ensureBoard(r.state) };
}

export { MAJOR_CONTRACTS };
