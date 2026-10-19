// Écrans en DOM : chaînes HTML construites uniquement à partir de données statiques et de nombres.
import { BUILDINGS, BUILDING_IDS, OFFICE_BONUS, REFINERY_BATCH, WORKSHOP_BRANCH_CAP, type BuildingId } from '../config/buildings';
import {
  BRANCHES,
  DRONE_BUILD,
  DRONE_CAPACITY,
  DRONE_EFFICIENCY,
  DRONE_RATE,
  DRONE_STATS,
  EQUIPMENTS,
  MAX_SHIP_LEVEL,
  cargoCapacity,
  engineSpeed,
  extractionPower,
  hazardInterval,
  hullMax,
  magnetRange,
  repairDelay,
  type Branch,
  type DroneStat,
  type EquipmentId,
} from '../config/balance';
import { CONTRACT_TEMPLATES, MAJOR_CONTRACTS, PROJECT_REQUIREMENTS, PROJECT_STAGES, getMajor, getTemplate } from '../config/contracts';
import { ITEM_INFO, ITEMS, RECIPES, sumItems, type ItemId, type Items, type ResourceId } from '../config/items';
import { SECTORS, getSector, type SectorId } from '../config/sectors';
import { MAX_ACTIVE_ORDINARY, activeOrdinaryCount, contractNeeds, contractReward, isFulfilled, majorStatus, remainingNeeds } from '../logic/contracts';
import { droneCapacity, droneCargoTotal, droneEfficiency, droneLevelCap, droneRate, droneResources, droneYieldPerMinute, nextDroneCost } from '../logic/drone';
import { canSell } from '../logic/inventory';
import { projectOpen, projectReady, requirementProgress } from '../logic/project';
import { maxBatch, refinerySlots } from '../logic/refinery';
import type { SaveData } from '../logic/save-model';
import type { SimResult } from '../logic/sim';
import { branchCap, nextShipCost, shipStats } from '../logic/ship';
import { buildStatus } from '../logic/station';
import { storageCap, missingForCost } from '../logic/tx';
import { costHtml, dec, fmt, fmtTime, itemsChips, levelPips, pct } from './format';

export interface UiCtx {
  officeTab: 'contracts' | 'sales';
  droneSector: SectorId | null;
  droneRes: ResourceId | null;
  flash: string | null;
  message: string;
  persistent: boolean;
  confirmEmergency: boolean;
}

export { fmt };

const panel = (id: string, icon: string, title: string, sub: string, body: string, ctx: UiCtx): string => `
<section class="screen" data-screen="${id}">
  <div class="scroll">
    <div class="row between" style="margin-bottom:.6rem">
      <div><div class="logo-sub">${sub}</div><h2 style="margin:0">${icon} ${title}</h2></div>
      <button class="icon-btn" data-action="station" aria-label="Retour à la station">✕</button>
    </div>
    ${ctx.message ? `<div class="tip">${ctx.message}</div>` : ''}
    ${ctx.persistent ? '' : '<div class="tip warnbox">Session non persistante : la progression sera perdue à la fermeture.</div>'}
    ${body}
    <div style="height:.4rem"></div>
  </div>
  <div class="footer"><button class="btn primary block" data-action="station">Retour à la station</button></div>
</section>`;

// ---------------------------------------------------------------- objectif
export function nextObjective(s: SaveData): string {
  const done = (id: string) => s.contracts.majorsDone.includes(id);
  if (s.project.done) return 'Le relais orbital est construit ! Continue d’explorer et de développer ta station.';
  if (s.sectors.expeditions === 0) return 'Touche DÉPART et récupère tes premières matières dans la Ceinture rocheuse.';
  if (s.buildings.warehouse === 0) return 'Construis un entrepôt pour stocker davantage (🪨 40, 🔩 20).';
  if (s.buildings.office === 0) return 'Construis le bureau commercial pour vendre et signer des contrats.';
  if (!done('m1-nebula')) return 'Contrat majeur au bureau : « Ouverture de la nébuleuse ».';
  if (s.buildings.refinery === 0) return 'Explore la nébuleuse (glace, cristaux) puis construis la raffinerie.';
  if (!done('m2-graveyard')) return 'Produis lingots et cellules, puis livre « Route du cimetière ».';
  if (!done('m3-drone')) return 'Explore le cimetière : circuits, noyaux, épaves (laser). Puis « Licence de drone ».';
  if (s.buildings.hangar === 0) return 'Construis le hangar à drones.';
  if (!s.drone.built) return 'Fabrique ton premier drone au hangar.';
  if (!done('m4-relay')) return 'Contrat majeur : « Autorisation du relais » (pièces techniques + noyaux).';
  return 'Verse matières et crédits au chantier du relais orbital.';
}

// ---------------------------------------------------------------- station
const SHORT_NAMES: Record<BuildingId, string> = { workshop: 'Atelier', warehouse: 'Entrepôt', refinery: 'Raffinerie', office: 'Bureau', hangar: 'Hangar' };

function slotBadge(s: SaveData, id: BuildingId): string {
  const lvl = s.buildings[id];
  if (lvl === 0) return buildStatus(s, id).canBuild ? '<span class="badge go">Construire</span>' : '';
  switch (id) {
    case 'refinery':
      if (s.refinery.jobs.some((j) => j.remaining <= 0)) return '<span class="badge ok">✓</span>';
      if (s.refinery.jobs.length) return `<span class="badge">⏳ ${s.refinery.jobs.length}</span>`;
      return '';
    case 'office': {
      const ready = s.contracts.active.some((a) => isFulfilled(s, a));
      const newMajor = MAJOR_CONTRACTS.some((m) => majorStatus(s, m) === 'available');
      return ready ? '<span class="badge ok">✓</span>' : newMajor ? '<span class="badge go">!</span>' : '';
    }
    case 'hangar':
      if (s.drone.status === 'returned') return '<span class="badge ok">✓</span>';
      if (s.drone.status === 'working') return '<span class="badge">⏳</span>';
      return s.drone.built ? '' : '<span class="badge go">Drone</span>';
    case 'warehouse': {
      const cap = storageCap(s);
      return ITEMS.some((i) => s.stock[i] >= cap) ? '<span class="badge no">Plein</span>' : '';
    }
    case 'workshop':
      return BRANCHES.some((b) => {
        const c = nextShipCost(s, b);
        return c && s.ship.levels[b] < branchCap(s) && !missingForCost(s, { items: c, credits: 0 });
      })
        ? '<span class="badge go">↑</span>'
        : '';
  }
}

export function stationScreen(s: SaveData, ctx: UiCtx): string {
  const slots = BUILDING_IDS.map((id) => {
    const b = BUILDINGS[id];
    const lvl = s.buildings[id];
    const short = SHORT_NAMES[id];
    const aria = lvl > 0 ? `${b.name}, niveau ${lvl}` : `${b.name} (à construire)`;
    return `<button class="slot" style="left:${(b.slot.x - 65) / 16}rem;top:${(b.slot.y - 55) / 16}rem" data-action="open" data-panel="${id}" aria-label="${aria}">
      <span class="slot-label ${lvl === 0 ? 'empty' : ''}">${b.icon} ${short}${lvl > 0 ? ` <small>${lvl}</small>` : ''}</span>${slotBadge(s, id)}</button>`;
  }).join('');
  const relayLabel = s.project.done ? '📡 Relais orbital ✔' : '📡 Relais orbital';
  return `
<section class="screen station" data-screen="station">
  <div class="st-top">
    <div class="st-credits" title="Crédits spatiaux">💳 <b>${fmt(s.credits)}</b></div>
    <button class="icon-btn" data-action="open" data-panel="settings" aria-label="Réglages">⚙</button>
  </div>
  <div class="st-obj">🎯 ${nextObjective(s)}</div>
  ${ctx.persistent ? '' : '<div class="st-obj warnbox">Session non persistante : progression perdue à la fermeture.</div>'}
  <button class="slot relay" style="left:${(195 - 65) / 16}rem;top:${(135 - 50) / 16}rem" data-action="open" data-panel="project" aria-label="Relais orbital"><span class="slot-label">${relayLabel}</span>${s.flags.projectOpen && !s.project.done ? '<span class="badge go">Chantier</span>' : ''}</button>
  ${slots}
  <button class="slot dock" style="left:${(195 - 70) / 16}rem;top:${(660 - 62) / 16}rem" data-action="open" data-panel="map" aria-label="Partir en expédition"><span class="slot-label">🚀 Vaisseau prêt</span></button>
  <div class="st-nav">
    <button class="btn" data-action="open" data-panel="office">💼 Contrats</button>
    <button class="btn primary" data-action="open" data-panel="map">Départ ▸</button>
    <button class="btn" data-action="open" data-panel="warehouse">📦 Stock</button>
  </div>
</section>`;
}

// ---------------------------------------------------------------- carte des secteurs
export function mapScreen(s: SaveData, ctx: UiCtx): string {
  const eq = s.ship.equipped ? EQUIPMENTS[s.ship.equipped] : null;
  const cards = SECTORS.map((sec) => {
    const unlocked = s.sectors.unlocked.includes(sec.id);
    const total = (sec.counts.deposits + sec.counts.wrecks + sec.counts.heavies + sec.counts.radiation + sec.counts.electric + sec.counts.fields);
    const found = s.sectors.discovered[sec.id].length;
    const major = sec.unlockedBy ? getMajor(sec.unlockedBy) : null;
    const colors: Record<SectorId, string> = { belt: '#a9b1c6', nebula: '#b38cff', graveyard: '#ff9a3c' };
    return `
<div class="card sector" style="border-left:4px solid ${colors[sec.id]}">
  <div class="row between"><h3>${sec.name}</h3>${unlocked ? `<span class="chip">Explorée ${s.sectors.visited.includes(sec.id) ? '✔' : '—'}</span>` : '<span class="chip">🔒 Verrouillé</span>'}</div>
  <p class="small muted" style="margin:.3rem 0">${sec.blurb}</p>
  <div class="row" style="flex-wrap:wrap;gap:.3rem">${sec.resources.map((r) => `<span class="chip item">${ITEM_INFO[r].icon} ${ITEM_INFO[r].name}</span>`).join('')}</div>
  <div class="small muted" style="margin:.4rem 0">⚠ ${sec.hazardsText}${unlocked ? ` · Découvertes : ${found}/~${total}` : ''}</div>
  ${unlocked ? `<button class="btn primary wide" data-action="launch" data-sector="${sec.id}">Partir explorer ▸</button>` : `<div class="lock">🔒 ${major ? `Contrat majeur « ${major.name} » au bureau commercial.` : 'Verrouillé.'}</div>`}
</div>`;
  }).join('');
  return panel(
    'map',
    '🗺️',
    'Carte des secteurs',
    'Départ en expédition',
    `<div class="card"><div class="row between"><span>Outil équipé</span><b>${eq ? `${eq.icon} ${eq.name}` : 'Aucun'}</b></div>
      <div class="small muted" style="margin-top:.3rem">Change d’outil à l’atelier. Aucune limite de temps : explore, dépose, repars.</div></div>${cards}`,
    ctx,
  );
}

// ---------------------------------------------------------------- carte « construire / améliorer »
function buildCard(s: SaveData, id: BuildingId, ctx: UiCtx): string {
  const b = BUILDINGS[id];
  const st = buildStatus(s, id);
  const effects = b.effects.map((e, i) => `<div class="small ${i + 1 === st.level ? 'accent' : 'muted'}">${i + 1 === st.level ? '▶' : '·'} Niv. ${i + 1} : ${e}</div>`).join('');
  let action = '';
  if (st.maxed) action = '<button class="btn sm wide ghost" disabled>Niveau maximal atteint</button>';
  else {
    const label = st.level === 0 ? `Construire (niv. 1)` : `Améliorer (niv. ${st.level + 1})`;
    action = `<button class="btn sm wide ${st.canBuild ? 'primary' : ''}" data-action="build" data-building="${id}" ${st.canBuild ? '' : 'disabled'}>${label}</button>`;
  }
  return `
<div class="card ${ctx.flash === `b:${id}` ? 'flash' : ''}">
  <div class="row between"><h3>${b.icon} ${b.name}</h3><span class="chip">Niv. ${st.level}/3</span></div>
  ${levelPips(st.level, 3, 3)}
  <p class="small muted" style="margin:.2rem 0">${b.desc}</p>
  ${effects}
  ${st.cost ? `<div class="small" style="margin-top:.4rem">${st.level === 0 ? 'Coût de construction' : 'Coût d’amélioration'} :</div>${costHtml(st.cost, s)}` : ''}
  <div style="margin-top:.4rem">${action}</div>
  ${st.lockReason ? `<div class="lock">🔒 ${st.lockReason}</div>` : st.missing && st.cost ? `<div class="lock">${st.missing}</div>` : ''}
</div>`;
}

// ---------------------------------------------------------------- atelier
const BRANCH_INFO: Record<Branch, { icon: string; name: string; desc: string }> = {
  cargo: { icon: '📦', name: 'Soute', desc: 'Capacité de transport' },
  magnet: { icon: '🧲', name: 'Aimant', desc: 'Portée et efficacité de collecte' },
  engine: { icon: '🚀', name: 'Moteur', desc: 'Vitesse et maniabilité' },
  hull: { icon: '🛡️', name: 'Coque', desc: 'Résistance aux dangers' },
};

function effectText(b: Branch, l: number): string {
  switch (b) {
    case 'cargo': return `${cargoCapacity(l)} places`;
    case 'magnet': return `portée ${magnetRange(l)} · extraction ×${dec(extractionPower(l))}`;
    case 'engine': return `vitesse ${engineSpeed(l)}`;
    case 'hull': return `${hullMax(l)} pts · réparation ${dec(repairDelay(l))} s · radiation ${dec(hazardInterval(l), 1)} s`;
  }
}

export function workshopScreen(s: SaveData, ctx: UiCtx): string {
  const st = shipStats(s);
  const cap = branchCap(s);
  const stats = `
<div class="card">
  <h3>Statistiques du vaisseau</h3>
  <div class="stats-grid">
    <span>📦 Soute</span><b>${st.cargoCapacity} places</b>
    <span>🧲 Portée</span><b>${st.magnetRange}</b>
    <span>⛏ Extraction</span><b>×${dec(st.extractionPower)}</b>
    <span>🚀 Vitesse</span><b>${st.maxSpeed}</b>
    <span>🛡️ Coque</span><b>${st.hullMax} pts</b>
    <span>📡 Scanner</span><b>${st.scanRadius}</b>
  </div>
</div>`;
  const branches = BRANCHES.map((b) => {
    const info = BRANCH_INFO[b];
    const lvl = s.ship.levels[b];
    const cost = nextShipCost(s, b);
    const locked = cost !== null && lvl >= cap;
    const missing = cost ? missingForCost(s, { items: cost, credits: 0 }) : null;
    const can = cost !== null && !locked && !missing;
    return `
<div class="card ${ctx.flash === `s:${b}` ? 'flash' : ''}">
  <div class="row between"><h3>${info.icon} ${info.name}</h3><span class="chip">Niv. ${lvl}/${MAX_SHIP_LEVEL}</span></div>
  ${levelPips(lvl, cap, MAX_SHIP_LEVEL)}
  <div class="small muted">${info.desc}</div>
  <div class="small">${effectText(b, lvl)}${cost ? ` <span class="accent">→ ${effectText(b, lvl + 1)}</span>` : ''}</div>
  ${cost ? costHtml({ items: cost, credits: 0 }, s) : ''}
  <div style="margin-top:.4rem"><button class="btn sm wide ${can ? 'primary' : ''}" data-action="ship-up" data-branch="${b}" ${can ? '' : 'disabled'}>${cost ? 'Améliorer' : 'Maximum atteint'}</button></div>
  ${locked ? `<div class="lock">🔒 Atelier niveau ${s.buildings.workshop + 1} requis pour dépasser le niveau ${cap}.</div>` : missing ? `<div class="lock">${missing}</div>` : ''}
</div>`;
  }).join('');
  const equipment = (['laser', 'tractor'] as EquipmentId[]).map((id) => {
    const e = EQUIPMENTS[id];
    const owned = s.ship.owned.includes(id);
    const equipped = s.ship.equipped === id;
    const cost = { items: e.items, credits: e.credits };
    const locked = s.buildings.workshop < e.minWorkshop;
    const missing = missingForCost(s, cost);
    let action: string;
    if (owned) action = `<button class="btn sm wide ${equipped ? '' : 'primary'}" data-action="equip" data-eq="${equipped ? 'none' : id}">${equipped ? 'Retirer l’outil' : 'Équiper'}</button>`;
    else action = `<button class="btn sm wide ${locked || missing ? '' : 'primary'}" data-action="eq-buy" data-eq="${id}" ${locked || missing ? 'disabled' : ''}>Acheter</button>`;
    return `
<div class="card ${ctx.flash === `e:${id}` ? 'flash' : ''}">
  <div class="row between"><h3>${e.icon} ${e.name}</h3><span class="chip">${equipped ? 'Équipé' : owned ? 'Possédé' : 'À acheter'}</span></div>
  <p class="small muted" style="margin:.2rem 0">${e.desc}</p>
  ${owned ? '' : costHtml(cost, s)}
  <div style="margin-top:.4rem">${action}</div>
  ${!owned && locked ? `<div class="lock">🔒 Requiert l’atelier niveau ${e.minWorkshop}.</div>` : !owned && missing ? `<div class="lock">${missing}</div>` : ''}
</div>`;
  }).join('');
  return panel(
    'workshop',
    '🛠️',
    'Atelier',
    `Niveau ${s.buildings.workshop}/3 · améliorations jusqu’au niveau ${WORKSHOP_BRANCH_CAP[s.buildings.workshop]}`,
    `${stats}<h2 style="margin-top:.4rem">Améliorations</h2>${branches}
     <h2 style="margin-top:.4rem">Équipements <span class="small muted">(un seul à la fois)</span></h2>${equipment}
     <h2 style="margin-top:.4rem">Atelier</h2>${buildCard(s, 'workshop', ctx)}`,
    ctx,
  );
}

// ---------------------------------------------------------------- entrepôt
export function warehouseScreen(s: SaveData, ctx: UiCtx): string {
  const cap = storageCap(s);
  const rows = ITEMS.map((i) => {
    const q = s.stock[i];
    return `<div class="stock-row"><span>${ITEM_INFO[i].icon} ${ITEM_INFO[i].name}</span><b class="${q >= cap ? 'accent' : ''}">${fmt(q)} / ${fmt(cap)}</b>
      <div class="progress ${q >= cap ? '' : 'cyan'}" style="grid-column:1/3"><i style="width:${pct(q, cap)}%"></i></div></div>`;
  }).join('');
  const lvl = s.buildings.warehouse;
  return panel(
    'warehouse',
    '📦',
    'Entrepôt',
    lvl === 0 ? 'Petit stockage de départ' : `Niveau ${lvl}/3`,
    `<div class="card"><h3>Stock (capacité ${fmt(cap)} par matière)</h3>${rows}
      <p class="small muted" style="margin-top:.4rem">Quand une matière est pleine, le surplus reste à bord du vaisseau : vends ou transforme du stock pour libérer de la place.</p></div>
     ${buildCard(s, 'warehouse', ctx)}`,
    ctx,
  );
}

// ---------------------------------------------------------------- raffinerie
export function refineryScreen(s: SaveData, ctx: UiCtx): string {
  if (s.buildings.refinery === 0) {
    return panel('refinery', '🏭', 'Raffinerie', 'À construire', `<p class="muted">La raffinerie transforme la ferraille en lingots, glace + cristaux en cellules énergétiques, lingots + circuits en pièces technologiques.</p>${buildCard(s, 'refinery', ctx)}`, ctx);
  }
  const slots = refinerySlots(s);
  const busy = s.refinery.jobs.length;
  const recipes = RECIPES.map((r) => {
    const inputs = (Object.entries(r.inputs) as [ItemId, number][]).map(([i, n]) => `${ITEM_INFO[i].icon} ${n}`).join(' + ');
    const max = maxBatch(s, r.id);
    const free = busy < slots;
    const unlocked = true;
    return `
<div class="card">
  <div class="row between"><h3>${ITEM_INFO[r.output].icon} ${ITEM_INFO[r.output].name}</h3><span class="chip">Stock : ${fmt(s.stock[r.output])}</span></div>
  <div class="small" style="margin:.2rem 0">${inputs} → ${ITEM_INFO[r.output].icon} 1 · ${r.time} s l’unité</div>
  <div class="row" style="margin-top:.3rem">
    <button class="btn sm block" data-action="job" data-recipe="${r.id}" data-qty="1" ${free && max >= 1 && unlocked ? '' : 'disabled'}>Produire ×1</button>
    <button class="btn sm block ${free && max >= 1 ? 'primary' : ''}" data-action="job" data-recipe="${r.id}" data-qty="max" ${free && max >= 1 ? '' : 'disabled'}>Produire ×${Math.max(1, max)}</button>
  </div>
  ${!free ? '<div class="lock">Toutes les chaînes sont occupées.</div>' : max < 1 ? '<div class="lock">Il manque des matières premières.</div>' : ''}
</div>`;
  }).join('');
  const jobs = s.refinery.jobs
    .map((j) => {
      const out = RECIPES.find((r) => r.id === j.recipe)?.output as ItemId;
      const done = j.remaining <= 0;
      const prog = pct(j.total - j.remaining, j.total);
      return `<div class="card" data-job="${j.id}">
  <div class="row between"><b>${ITEM_INFO[out].icon} ${ITEM_INFO[out].name} ×${j.qty - j.delivered}</b>
    <span class="small" data-job-eta="${j.id}">${done ? 'Terminé — entrepôt plein, en attente' : fmtTime(j.remaining)}</span></div>
  <div class="progress"><i data-job-bar="${j.id}" style="width:${prog}%"></i></div>
</div>`;
    })
    .join('');
  return panel(
    'refinery',
    '🏭',
    'Raffinerie',
    `Niveau ${s.buildings.refinery}/3 · ${busy}/${slots} chaîne(s) · lots de ${REFINERY_BATCH[s.buildings.refinery]}`,
    `<h2>En production</h2>${jobs || '<p class="muted small">Aucune production en cours.</p>'}
     <p class="small muted">Le traitement se fait en temps réel, application ouverte. Les matières sont consommées au lancement.</p>
     <h2 style="margin-top:.4rem">Chaînes de production</h2>${recipes}${buildCard(s, 'refinery', ctx)}`,
    ctx,
  );
}

// ---------------------------------------------------------------- bureau commercial
function needsProgress(s: SaveData, c: { templateId: string; mult: number; delivered: Items }): string {
  const need = contractNeeds(c as never);
  return ITEMS.filter((i) => (need[i] ?? 0) > 0)
    .map((i) => {
      const d = c.delivered[i] ?? 0;
      const n = need[i] as number;
      return `<span class="cost ${d >= n ? 'ok' : s.stock[i] > 0 ? '' : 'no'}">${ITEM_INFO[i].icon} ${fmt(d)}/${fmt(n)} <small>(stock ${fmt(s.stock[i])})</small></span>`;
    })
    .join('');
}

export function officeScreen(s: SaveData, ctx: UiCtx): string {
  if (s.buildings.office === 0) {
    return panel('office', '💼', 'Bureau commercial', 'À construire', `<p class="muted">Le bureau propose des commandes, des contrats majeurs et permet de vendre ton surplus à prix fixe.</p>${buildCard(s, 'office', ctx)}`, ctx);
  }
  const tabs = `<div class="seg" style="margin-bottom:.6rem">
    <button class="btn ${ctx.officeTab === 'contracts' ? 'on' : 'ghost'}" data-action="office-tab" data-tab="contracts">Contrats</button>
    <button class="btn ${ctx.officeTab === 'sales' ? 'on' : 'ghost'}" data-action="office-tab" data-tab="sales">Vente directe</button></div>`;
  let body = '';
  if (ctx.officeTab === 'sales') {
    body = `<div class="card"><h3>Vente à prix fixe</h3><p class="small muted">Pour ne jamais être bloqué : vends tes surplus contre des crédits.</p>
      ${ITEMS.map((i) => {
        const q = s.stock[i];
        return `<div class="sell-row"><span>${ITEM_INFO[i].icon} ${ITEM_INFO[i].name}<br/><small class="muted">${fmt(q)} en stock · ${ITEM_INFO[i].sell} 💳 l’unité</small></span>
          <span class="row" style="gap:.3rem"><button class="btn sm" data-action="sell" data-item="${i}" data-qty="1" ${q >= 1 ? '' : 'disabled'}>1</button>
          <button class="btn sm" data-action="sell" data-item="${i}" data-qty="10" ${q >= 10 ? '' : 'disabled'}>10</button>
          <button class="btn sm" data-action="sell" data-item="${i}" data-qty="all" ${q >= 1 ? '' : 'disabled'}>Tout</button></span></div>`;
      }).join('')}</div>`;
  } else {
    const majors = MAJOR_CONTRACTS.map((m) => {
      const st = majorStatus(s, m);
      const active = s.contracts.active.find((a) => a.templateId === m.id);
      let actions = '';
      let detail = '';
      if (st === 'done') detail = '<div class="ok small">✔ Terminé</div>';
      else if (st === 'locked') detail = `<div class="lock">🔒 ${m.requiresText}</div>`;
      else if (st === 'available') actions = `<button class="btn sm wide primary" data-action="accept-major" data-id="${m.id}">Accepter le contrat</button>`;
      else if (active) {
        const ok = isFulfilled(s, active);
        const rem = remainingNeeds(s, active);
        const can = ITEMS.some((i) => (rem[i] ?? 0) > 0 && s.stock[i] > 0);
        detail = `<div class="costs">${needsProgress(s, active)}</div>`;
        actions = `<div class="row"><button class="btn sm block" data-action="deliver" data-id="${active.id}" ${can ? '' : 'disabled'}>Livrer</button>
          <button class="btn sm block ${ok ? 'primary' : ''}" data-action="complete" data-id="${active.id}" ${ok ? '' : 'disabled'}>Terminer</button></div>`;
      }
      if (st === 'locked') return `<div class="card dim"><h3>⭐ ${m.name}</h3>${detail}</div>`;
      return `<div class="card major ${ctx.flash === `c:${m.id}` ? 'flash' : ''}">
        <div class="row between"><h3>⭐ ${m.name}</h3><span class="chip">+${fmt(m.rewardCredits)} 💳</span></div>
        <p class="small muted" style="margin:.2rem 0">${m.story}</p>
        ${st === 'available' ? `<div class="costs">${itemsChips(m.needs)}</div>` : ''}
        <div class="small accent">${m.unlocksText}</div>${detail}<div style="margin-top:.4rem">${actions}</div></div>`;
    }).join('');
    const active = s.contracts.active.filter((a) => a.kind === 'ordinary');
    const activeHtml = active
      .map((a) => {
        const t = getTemplate(a.templateId);
        if (!t) return '';
        const ok = isFulfilled(s, a);
        const rem = remainingNeeds(s, a);
        const can = ITEMS.some((i) => (rem[i] ?? 0) > 0 && s.stock[i] > 0);
        return `<div class="card ${ctx.flash === `c:${a.id}` ? 'flash' : ''}">
          <div class="row between"><h3>${t.name} <small class="muted">${t.tier === 'industrial' ? '(industriel)' : ''}</small></h3><span class="chip">+${fmt(contractReward(s, a))} 💳</span></div>
          <div class="costs">${needsProgress(s, a)}</div>
          <div class="row" style="margin-top:.4rem"><button class="btn sm block" data-action="deliver" data-id="${a.id}" ${can ? '' : 'disabled'}>Livrer</button>
          <button class="btn sm block ${ok ? 'primary' : ''}" data-action="complete" data-id="${a.id}" ${ok ? '' : 'disabled'}>Terminer</button>
          <button class="btn sm ghost" data-action="abandon" data-id="${a.id}">Abandonner</button></div></div>`;
      })
      .join('');
    const board = s.contracts.board
      .map((o) => {
        const t = getTemplate(o.templateId);
        if (!t) return '';
        const full = activeOrdinaryCount(s) >= MAX_ACTIVE_ORDINARY;
        return `<div class="card"><div class="row between"><h3>${t.name} <small class="muted">${t.tier === 'industrial' ? '(industriel)' : ''}</small></h3><span class="chip">+${fmt(contractReward(s, o))} 💳</span></div>
          <p class="small muted" style="margin:.2rem 0">${t.desc}</p><div class="costs">${itemsChips(contractNeeds(o))}</div>
          <div style="margin-top:.4rem"><button class="btn sm wide" data-action="accept-offer" data-id="${o.id}" ${full ? 'disabled' : ''}>Accepter</button></div></div>`;
      })
      .join('');
    body = `<h2>Contrats majeurs</h2>${majors}
      <h2 style="margin-top:.4rem">En cours (${active.length}/${MAX_ACTIVE_ORDINARY})</h2>${activeHtml || '<p class="muted small">Aucun contrat en cours. Les contrats n’ont pas de limite de temps.</p>'}
      <h2 style="margin-top:.4rem">Offres du tableau</h2>${board || '<p class="muted small">Pas d’offre pour le moment.</p>'}
      <p class="small muted">Contrats : ${CONTRACT_TEMPLATES.length} modèles · bonus de récompense du bureau : +${Math.round(OFFICE_BONUS[s.buildings.office] * 100)} %.</p>`;
  }
  return panel('office', '💼', 'Bureau commercial', `Niveau ${s.buildings.office}/3 · ${canSell(s) ? 'ventes ouvertes' : ''}`, `${tabs}${body}<h2 style="margin-top:.4rem">Bureau</h2>${buildCard(s, 'office', ctx)}`, ctx);
}

// ---------------------------------------------------------------- hangar à drones
export function hangarScreen(s: SaveData, ctx: UiCtx): string {
  if (s.buildings.hangar === 0) {
    return panel('hangar', '🛸', 'Hangar à drones', 'À construire', `<p class="muted">Le hangar fabrique ton drone collecteur et l’entretient.</p>${buildCard(s, 'hangar', ctx)}`, ctx);
  }
  const d = s.drone;
  let droneCard: string;
  if (!d.built) {
    const missing = missingForCost(s, DRONE_BUILD);
    droneCard = `<div class="card"><h3>🛸 Drone collecteur</h3><p class="small muted">Un seul drone, améliorable. Il récolte des ressources ordinaires pendant que tu explores ou gères ta station, mais reste moins productif qu’une expédition manuelle.</p>
      ${costHtml(DRONE_BUILD, s)}<div style="margin-top:.4rem"><button class="btn sm wide ${missing ? '' : 'primary'}" data-action="drone-build" ${missing ? 'disabled' : ''}>Fabriquer le drone</button></div>${missing ? `<div class="lock">${missing}</div>` : ''}</div>`;
  } else {
    const cap = droneCapacity(s);
    const carried = droneCargoTotal(s);
    const status = d.status === 'idle' ? 'Au hangar, prêt' : d.status === 'working' ? 'En mission' : 'Revenu — cargaison à vider';
    const eligible = SECTORS.filter((x) => s.sectors.unlocked.includes(x.id) && s.sectors.visited.includes(x.id));
    const sector = ctx.droneSector && eligible.some((x) => x.id === ctx.droneSector) ? ctx.droneSector : (eligible[0]?.id ?? null);
    const resOptions = sector ? droneResources(sector) : [];
    const res = ctx.droneRes && resOptions.includes(ctx.droneRes) ? ctx.droneRes : (resOptions[0] ?? null);
    let mission = '';
    if (d.status === 'idle' && carried === 0) {
      mission = eligible.length === 0
        ? '<div class="lock">Explore d’abord un secteur toi-même.</div>'
        : `<div class="small" style="margin:.3rem 0">Secteur :</div><div class="seg">${eligible.map((x) => `<button class="btn sm ${x.id === sector ? 'on' : 'ghost'}" data-action="drone-sector" data-sector="${x.id}">${x.name.split(' ')[0]}</button>`).join('')}</div>
          <div class="small" style="margin:.3rem 0">Ressource :</div><div class="seg">${resOptions.map((r) => `<button class="btn sm ${r === res ? 'on' : 'ghost'}" data-action="drone-res" data-res="${r}">${ITEM_INFO[r].icon}</button>`).join('')}</div>
          <button class="btn sm wide primary" style="margin-top:.5rem" data-action="drone-launch" data-sector="${sector ?? ''}" data-res="${res ?? ''}" ${sector && res ? '' : 'disabled'}>Lancer la mission</button>`;
    } else if (d.status === 'working') {
      mission = `<div class="small">Récolte de ${d.resource ? ITEM_INFO[d.resource].icon + ' ' + ITEM_INFO[d.resource].name.toLowerCase() : ''} dans ${d.sector ? getSector(d.sector).name : ''}</div>
        <button class="btn sm wide" style="margin-top:.4rem" data-action="drone-recall">Rappeler le drone</button>`;
    }
    if (carried > 0 && d.status !== 'working') {
      mission += `<button class="btn sm wide primary" style="margin-top:.4rem" data-action="drone-collect">Vider la cargaison (${carried})</button>`;
    }
    const stats = DRONE_STATS.map((stat: DroneStat) => {
      const lvl = d.levels[stat];
      const cost = nextDroneCost(s, stat);
      const locked = cost !== null && lvl >= droneLevelCap(s);
      const missing = cost ? missingForCost(s, cost) : null;
      const can = cost !== null && !locked && !missing;
      const names: Record<DroneStat, [string, string, (l: number) => string]> = {
        capacity: ['Capacité', '📦', (l) => `${DRONE_CAPACITY[l]} unités`],
        speed: ['Vitesse de récupération', '⏱', (l) => `${DRONE_RATE[l]} u/min`],
        efficiency: ['Efficacité', '🎯', (l) => `${Math.round(DRONE_EFFICIENCY[l] * 100)} %`],
      };
      const [name, icon, f] = names[stat];
      return `<div class="card ${ctx.flash === `d:${stat}` ? 'flash' : ''}"><div class="row between"><h3>${icon} ${name}</h3><span class="chip">Niv. ${lvl}/3</span></div>
        ${levelPips(lvl, droneLevelCap(s), 3)}<div class="small">${f(lvl)}${cost ? ` <span class="accent">→ ${f(lvl + 1)}</span>` : ''}</div>
        ${cost ? costHtml(cost, s) : ''}<div style="margin-top:.4rem"><button class="btn sm wide ${can ? 'primary' : ''}" data-action="drone-up" data-stat="${stat}" ${can ? '' : 'disabled'}>${cost ? 'Améliorer' : 'Maximum'}</button></div>
        ${locked ? `<div class="lock">🔒 Hangar niveau ${s.buildings.hangar + 1} requis.</div>` : missing ? `<div class="lock">${missing}</div>` : ''}</div>`;
    }).join('');
    droneCard = `<div class="card"><div class="row between"><h3>🛸 Drone collecteur</h3><span class="chip">${status}</span></div>
      <div class="small muted" style="margin:.3rem 0">Rendement : ${dec(droneYieldPerMinute(s), 1)} u/min (${droneRate(s)} × ${Math.round(droneEfficiency(s) * 100)} %)</div>
      <div class="row between small"><span>Cargaison</span><b data-drone-cargo>${carried}/${cap}</b></div>
      <div class="progress cyan"><i data-drone-bar style="width:${pct(carried, cap)}%"></i></div>${mission}</div>
      <h2 style="margin-top:.4rem">Améliorations</h2>${stats}`;
  }
  return panel('hangar', '🛸', 'Hangar à drones', `Niveau ${s.buildings.hangar}/3`, `${droneCard}<h2 style="margin-top:.4rem">Hangar</h2>${buildCard(s, 'hangar', ctx)}`, ctx);
}

// ---------------------------------------------------------------- projet final
export function projectScreen(s: SaveData, ctx: UiCtx): string {
  if (s.project.done) {
    return panel('project', '📡', 'Relais orbital', 'Projet accompli', `<div class="card" style="border-color:rgba(110,231,168,.6)"><h3 class="ok">✔ Le relais commercial orbital est construit</h3><p class="small muted">Ton entreprise est lancée. Tu peux continuer à explorer, récolter et développer ta station.</p></div>`, ctx);
  }
  if (!projectOpen(s)) {
    const steps = MAJOR_CONTRACTS.map((m) => {
      const st = majorStatus(s, m);
      return `<div class="region-row"><span class="dot" style="background:${st === 'done' ? '#6ee7a8' : st === 'locked' ? '#555' : '#ffb25e'}"></span><div style="flex:1"><b>${m.name}</b><div class="muted small">${st === 'done' ? 'Terminé' : st === 'locked' ? m.requiresText : 'Disponible au bureau commercial'}</div></div></div>`;
    }).join('');
    return panel('project', '📡', 'Relais orbital', 'Chantier fermé', `<p class="muted">Le grand projet de ton entreprise : un relais commercial en orbite. La guilde ouvre le chantier après quatre contrats majeurs.</p><div class="card">${steps}</div>`, ctx);
  }
  const stages = PROJECT_STAGES.map((st) => {
    const reqs = PROJECT_REQUIREMENTS.filter((r) => r.stage === st.id);
    const rows = reqs
      .map((r) => {
        const done = requirementProgress(s, r);
        const have = r.item === 'credits' ? s.credits : s.stock[r.item as ItemId];
        const left = r.amount - done;
        const can = left > 0 && have > 0;
        const label = r.item === 'credits' ? '💳 Crédits' : `${ITEM_INFO[r.item as ItemId].icon} ${ITEM_INFO[r.item as ItemId].name}`;
        return `<div class="stock-row"><span>${label}</span><b class="${left === 0 ? 'ok' : ''}">${fmt(done)} / ${fmt(r.amount)}</b>
          <div class="progress ${left === 0 ? 'cyan' : ''}" style="grid-column:1/3"><i style="width:${pct(done, r.amount)}%"></i></div>
          <div style="grid-column:1/3"><button class="btn sm wide" data-action="project-give" data-key="${r.key}" ${can ? '' : 'disabled'}>${left === 0 ? 'Complété ✔' : `Verser (disponible : ${fmt(have)})`}</button></div></div>`;
      })
      .join('');
    return `<div class="card ${ctx.flash === `p:${st.id}` ? 'flash' : ''}"><h3>${st.name}</h3><p class="small muted" style="margin:.2rem 0">${st.desc}</p>${rows}</div>`;
  }).join('');
  const ready = projectReady(s);
  return panel('project', '📡', 'Relais orbital', 'Chantier ouvert',
    `${stages}<button class="btn wide ${ready ? 'primary' : ''}" data-action="project-build" ${ready ? '' : 'disabled'}>Construire le relais</button>${ready ? '' : '<div class="lock">Toutes les exigences doivent être remplies.</div>'}`, ctx);
}

// ---------------------------------------------------------------- bilan d'expédition
const OUTCOME: Record<SimResult['outcome'], { title: string; cls: string }> = {
  docked: { title: 'Retour à la station', cls: 'ok' },
  wrecked: { title: 'Vaisseau détruit — rapatrié', cls: 'accent' },
  emergency: { title: 'Rapatriement d’urgence', cls: 'accent' },
};

export function summaryScreen(s: SaveData, r: SimResult, o: { sector: SectorId; saved: boolean; newDiscoveries: number }): string {
  const t = OUTCOME[r.outcome];
  const lost = sumItems(r.lost);
  const dep = sumItems(r.deposited);
  const min = Math.floor(r.duration / 60);
  return `
<section class="screen" data-screen="summary">
  <div class="scroll">
    <div class="logo-sub">Bilan · ${getSector(o.sector).name}</div>
    <h1 class="${t.cls}" style="margin:.2rem 0 .8rem">${t.title}</h1>
    <div class="card">
      <div class="stat-line"><span>Matières déposées</span><span class="chips">${dep > 0 ? itemsChips(r.deposited) : '<span class="muted">aucune</span>'}</span></div>
      <div class="stat-line"><span>Cargaison perdue</span><span class="chips">${lost > 0 ? itemsChips(r.lost) : '<span class="muted">aucune</span>'}</span></div>
      <div class="stat-line"><span>Dégâts subis</span><b>${r.damageTaken}</b></div>
      <div class="stat-line"><span>Nouvelles découvertes</span><b>${o.newDiscoveries}</b></div>
      <div class="stat-line"><span>Durée</span><b>${min} min ${String(Math.floor(r.duration % 60)).padStart(2, '0')} s</b></div>
    </div>
    <p class="small ${o.saved ? 'ok' : 'accent'}">${o.saved ? '✔ Dépôts, découvertes et progression sauvegardés.' : '⚠ Sauvegarde indisponible : la progression sera perdue à la fermeture.'}</p>
    ${r.outcome !== 'docked' ? '<p class="small muted">Seule la cargaison non déposée est perdue : ressources sécurisées, constructions et améliorations sont conservées.</p>' : ''}
    <div class="card"><div class="stat-line"><span>Crédits</span><b>💳 ${fmt(s.credits)}</b></div></div>
  </div>
  <div class="footer">
    <button class="btn block" data-action="station">Station</button>
    <button class="btn primary block" data-action="launch" data-sector="${o.sector}">Repartir ▸</button>
  </div>
</section>`;
}

// ---------------------------------------------------------------- pause / réglages / fin / récupération
export function pauseScreen(s: SaveData, o: { used: number; cap: number; confirm: boolean; sector: SectorId; discovered: number }): string {
  return `
<section class="screen" data-screen="pause">
  <div class="title-wrap">
    <div><div class="logo-sub">${getSector(o.sector).name}</div><h1>Pause</h1></div>
    <div class="card" style="margin:0">
      <div class="stat-line"><span>Soute</span><b>${o.used}/${o.cap} places</b></div>
      <div class="stat-line"><span>Découvertes</span><b>${o.discovered}</b></div>
      <div class="stat-line"><span>Crédits</span><b>💳 ${fmt(s.credits)}</b></div>
    </div>
    <div class="stack">
      <button class="btn primary wide" data-action="resume-run">Reprendre</button>
      <button class="btn ghost wide" data-action="settings">Réglages</button>
      <button class="btn danger wide" data-action="emergency">${o.confirm ? 'Confirmer : rapatrier et perdre la cargaison' : 'Rapatriement d’urgence'}</button>
    </div>
    <p class="muted small center">Aucune limite de temps : la simulation est suspendue. Le rapatriement d’urgence te ramène à la station en perdant la cargaison non déposée.</p>
  </div>
</section>`;
}

export function settingsScreen(s: SaveData, o: { fromRun: boolean }): string {
  const st = s.settings;
  return `
<section class="screen" data-screen="settings">
  <div class="scroll">
    <h2>Réglages</h2>
    <label class="field">Musique : <b id="val-music">${st.musicVolume} %</b>
      <input type="range" min="0" max="100" step="5" value="${st.musicVolume}" data-range="musicVolume" aria-label="Volume de la musique" /></label>
    <label class="field">Effets sonores : <b id="val-sfx">${st.sfxVolume} %</b>
      <input type="range" min="0" max="100" step="5" value="${st.sfxVolume}" data-range="sfxVolume" aria-label="Volume des effets" /></label>
    <div class="switch"><span>Sourdine (musique et effets)</span>
      <button class="btn sm ${st.muted ? 'primary' : 'ghost'}" data-action="toggle-muted" aria-pressed="${st.muted}">${st.muted ? 'Activée' : 'Désactivée'}</button></div>
    <div class="field" style="margin-top:.6rem">Joystick
      <div class="seg">
        <button class="btn ${st.joystickSide === 'left' ? 'on' : 'ghost'}" data-action="side" data-side="left">À gauche</button>
        <button class="btn ${st.joystickSide === 'right' ? 'on' : 'ghost'}" data-action="side" data-side="right">À droite</button>
      </div></div>
    <div class="switch"><span>Effets réduits (moins de particules)</span>
      <button class="btn sm ${st.lowFx ? 'primary' : 'ghost'}" data-action="toggle-lowfx" aria-pressed="${st.lowFx}">${st.lowFx ? 'Activés' : 'Désactivés'}</button></div>
    <div class="switch"><span>Revoir les conseils de départ</span>
      <button class="btn sm ghost" data-action="reset-tips">Réafficher</button></div>
    <p class="muted small" style="margin-top:.8rem">Space Trash · Azerya Studio. Musique et sons : synthèse temporaire (aucun fichier tiers). Aucune publicité, aucun achat.</p>
  </div>
  <div class="footer"><button class="btn primary block" data-action="settings-back">${o.fromRun ? 'Retour à la pause' : 'Retour'}</button></div>
</section>`;
}

export function successScreen(s: SaveData): string {
  return `
<section class="screen" data-screen="success">
  <div class="title-wrap">
    <div class="logo-sub">Space Trash · Azerya Studio</div>
    <h1 class="ok">Relais orbital<br/>construit !</h1>
    <p>Ton petit vaisseau de récupération est devenu une entreprise industrielle : tu collectes, transformes et commercialises des ressources spatiales, et ton premier grand relais commercial brille en orbite.</p>
    <div class="card" style="margin:0">
      <div class="stat-line"><span>Expéditions</span><b>${s.sectors.expeditions}</b></div>
      <div class="stat-line"><span>Contrats terminés</span><b>${s.contracts.completed + s.contracts.majorsDone.length}</b></div>
      <div class="stat-line"><span>Installations</span><b>${BUILDING_IDS.reduce((a, b) => a + s.buildings[b], 0)}/15 niveaux</b></div>
    </div>
    <div class="stack"><button class="btn primary wide" data-action="success-continue">Continuer à explorer</button></div>
  </div>
</section>`;
}

export function recoveryScreen(o: { backupAvailable: boolean }): string {
  return `
<section class="screen" data-screen="recovery">
  <div class="title-wrap">
    <h1 class="accent">Sauvegarde illisible</h1>
    <p>La sauvegarde principale est corrompue. Rien n’a été effacé : son contenu est conservé à part. Choisis comment continuer.</p>
    <div class="stack">
      ${o.backupAvailable ? '<button class="btn primary wide" data-action="recover-backup">Restaurer la dernière copie valide</button>' : '<p class="lock">Aucune copie valide disponible.</p>'}
      <button class="btn danger wide" data-action="recover-fresh">Repartir d’un profil neuf</button>
    </div>
  </div>
</section>`;
}

// ---------------------------------------------------------------- gestionnaire
export type ActionHandler = (action: string, el: HTMLElement) => void;

export class ScreenManager {
  private id = '';
  constructor(private root: HTMLElement, private onAction: ActionHandler, private onRange: (key: string, value: number) => void) {
    root.addEventListener('click', (e) => {
      const el = (e.target as HTMLElement).closest<HTMLElement>('[data-action]');
      if (!el || (el as HTMLButtonElement).disabled) return;
      this.onAction(el.dataset.action as string, el);
    });
    root.addEventListener('input', (e) => {
      const el = e.target as HTMLInputElement;
      if (el.dataset.range) {
        this.onRange(el.dataset.range, Number(el.value));
        const label = document.getElementById(el.dataset.range === 'musicVolume' ? 'val-music' : 'val-sfx');
        if (label) label.textContent = `${el.value} %`;
      }
    });
  }

  show(html: string, resetScroll = false): void {
    const before = this.root.querySelector<HTMLElement>('.scroll');
    const next = this.idOf(html);
    const top = next === this.id && before && !resetScroll ? before.scrollTop : 0;
    this.root.innerHTML = html;
    this.id = next;
    if (top) {
      const after = this.root.querySelector<HTMLElement>('.scroll');
      if (after) after.scrollTop = top;
    }
  }

  clear(): void {
    this.root.innerHTML = '';
    this.id = '';
  }

  get current(): string {
    return this.id;
  }

  private idOf(html: string): string {
    const m = /data-screen="([a-z-]+)"/.exec(html);
    return m ? m[1] : '';
  }
}
