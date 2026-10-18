// Écrans en DOM : chaînes HTML statiques (aucune donnée libre n'y est injectée) + délégation d'événements.
import { REGIONS, getRegion, BRANCHES, type Branch } from '../config/regions';
import { cargoCapacity, engineSpeed, extractionPower, hullMax, magnetRange, repairDelay } from '../config/balance';
import {
  activeRegion,
  deliveryStatus,
  nextUpgradeCost,
  transitionStatus,
  workshopProgress,
} from '../logic/economy';
import type { SaveData } from '../logic/save-model';
import type { SimResult } from '../logic/sim';

export const fmt = (n: number): string => n.toLocaleString('fr-FR');
const dec = (n: number, d = 2): string => n.toFixed(d).replace('.', ',');

const BRANCH_INFO: Record<Branch, { icon: string; name: string; desc: string }> = {
  cargo: { icon: '📦', name: 'Soute', desc: 'Plus de places pour la cargaison' },
  magnet: { icon: '🧲', name: 'Aimant / extracteur', desc: 'Portée et vitesse d’extraction' },
  engine: { icon: '🚀', name: 'Moteur', desc: 'Vitesse maximale' },
  hull: { icon: '🛡️', name: 'Coque', desc: 'Points de coque et réparation' },
};

function effectText(branch: Branch, level: number): { now: string; next: string | null } {
  const lv = (l: number): string => {
    switch (branch) {
      case 'cargo': return `${cargoCapacity(l)} places`;
      case 'magnet': return `portée ${magnetRange(l)} · extraction ×${dec(extractionPower(l))}`;
      case 'engine': return `vitesse ${engineSpeed(l)}`;
      case 'hull': return `${hullMax(l)} pts · réparation ${dec(repairDelay(l), 2)} s`;
    }
  };
  return { now: lv(level), next: level < 12 ? lv(level + 1) : null };
}

const pips = (level: number, cap: number): string =>
  `<div class="pips">${Array.from({ length: cap }, (_, i) => `<i class="${i < level ? 'on' : ''}"></i>`).join('')}</div>`;

const pct = (a: number, b: number): number => Math.max(0, Math.min(100, (a / b) * 100));

// ---------------------------------------------------------------- Accueil
export function homeScreen(o: { hasProgress: boolean; interrupted: boolean; persistent: boolean }): string {
  return `
<section class="screen home" data-screen="home">
  <div class="title-wrap">
    <div>
      <div class="logo-sub">Prototype — lot 1</div>
      <h1>Les Éboueurs<br/>de l’espace</h1>
    </div>
    <p class="muted">Pars avec une petite soute. Reviens avec de quoi construire ton prochain palier.</p>
    ${o.interrupted ? '<div class="tip">Ta dernière sortie a été interrompue : la cargaison non déposée est perdue, tes dépôts et améliorations sont intacts.</div>' : ''}
    ${o.persistent ? '' : '<div class="tip" style="border-color:rgba(255,107,94,.6)">Stockage indisponible : cette session n’est pas persistante, la progression sera perdue à la fermeture.</div>'}
    <div class="stack">
      <button class="btn primary wide" data-action="play">${o.hasProgress ? 'Reprendre' : 'Jouer'}</button>
      <button class="btn ghost wide" data-action="settings">Réglages</button>
    </div>
    <p class="muted small center">Région 1 jouable · les régions suivantes arrivent dans les prochains lots.</p>
  </div>
</section>`;
}

// ---------------------------------------------------------------- Atelier / préparation
export function workshopScreen(s: SaveData, o: { flashBranch?: Branch | null; firstTip: boolean; persistent: boolean; message?: string }): string {
  const region = activeRegion(s);
  const stock = s.stock[region.material];
  const wp = workshopProgress(s);
  const del = deliveryStatus(s);
  const tr = transitionStatus(s);
  const next = tr.nextRegionId ? getRegion(tr.nextRegionId) : null;

  const branchCards = BRANCHES.map((b) => {
    const info = BRANCH_INFO[b];
    const level = s.levels[b];
    const cost = nextUpgradeCost(s, b);
    const fx = effectText(b, level);
    const maxed = cost === null;
    const missing = cost !== null ? cost - stock : 0;
    return `
<div class="card ${o.flashBranch === b ? 'flash' : ''}">
  <div class="row between">
    <h3>${info.icon} ${info.name}</h3>
    <span class="chip">Niv. ${level}/${region.levelCap}</span>
  </div>
  ${pips(level, region.levelCap)}
  <div class="small muted">${info.desc}</div>
  <div class="small">${fx.now}${fx.next && !maxed ? ` <span class="accent">→ ${fx.next}</span>` : ''}</div>
  <div class="row" style="margin-top:.5rem">
    <button class="btn sm block ${maxed ? 'ghost' : ''}" data-action="buy" data-branch="${b}" ${maxed || missing > 0 ? 'disabled' : ''}>
      ${maxed ? 'Maximum atteint' : `Améliorer — ${fmt(cost as number)} t`}
    </button>
  </div>
  ${!maxed && missing > 0 ? `<div class="lock">Il manque ${fmt(missing)} t de ${region.materialName.toLowerCase()}.</div>` : ''}
</div>`;
  }).join('');

  const canDeliver100 = del.unlocked && del.maxDeliverable >= 100;
  const delivery = `
<div class="card">
  <div class="row between"><h3>🚚 Livraison</h3><span class="chip">${fmt(del.delivered)} / ${fmt(del.quota)} t</span></div>
  <div class="progress"><i style="width:${pct(del.delivered, del.quota)}%"></i></div>
  <div class="small muted">Retire la matière du stock pour construire la région suivante. Les achats ne comptent pas comme livraison.</div>
  <div class="row" style="margin-top:.5rem">
    <button class="btn sm block" data-action="deliver" data-amount="100" ${canDeliver100 ? '' : 'disabled'}>Livrer 100 t</button>
    <button class="btn sm block" data-action="deliver" data-amount="max" ${del.unlocked ? '' : 'disabled'}>Livrer tout${del.unlocked ? ` (${fmt(del.maxDeliverable)} t)` : ''}</button>
  </div>
  ${del.lockReason ? `<div class="lock">${del.lockReason}</div>` : del.maxDeliverable < 100 ? `<div class="small muted" style="margin-top:.3rem">Stock disponible : ${fmt(stock)} t.</div>` : ''}
</div>`;

  let transition: string;
  if (tr.alreadyUnlocked && next) {
    transition = `
<div class="card" style="border-color:rgba(110,231,168,.6)">
  <h3 class="ok">✔ ${next.name} débloquée</h3>
  <p class="small muted" style="margin:.3rem 0 .5rem">Fin du prototype : la région ${next.id} n’est pas encore jouable. Tu peux continuer à rejouer la région 1.</p>
  <button class="btn sm wide" data-action="show-end">Voir l’écran de fin</button>
</div>`;
  } else if (tr.canOpen && next) {
    transition = `
<div class="card" style="border-color:var(--orange);box-shadow:0 0 1.2rem rgba(255,154,60,.3)">
  <h3 class="accent">Palier terminé !</h3>
  <p class="small" style="margin:.3rem 0 .6rem">Atelier ${wp.done}/${wp.total} et livraison ${fmt(del.delivered)}/${fmt(del.quota)} t : tout est prêt.</p>
  <button class="btn primary wide" data-action="open-region">Ouvrir la région ${next.id}</button>
</div>`;
  } else {
    transition = `
<div class="card">
  <h3>Objectif de la région</h3>
  <div class="stat-line"><span>Atelier</span><b>${wp.done}/${wp.total} améliorations</b></div>
  <div class="progress cyan"><i style="width:${pct(wp.done, wp.total)}%"></i></div>
  <div class="stat-line"><span>Livraison</span><b>${fmt(del.delivered)}/${fmt(del.quota)} t</b></div>
  <div class="progress"><i style="width:${pct(del.delivered, del.quota)}%"></i></div>
  ${tr.reasons.map((r) => `<div class="lock">🔒 ${r}</div>`).join('')}
</div>`;
  }

  const regions = REGIONS.map((r) => {
    const unlocked = s.unlockedRegions.includes(r.id);
    const current = r.id === s.activeRegion;
    const colors = ['#b4bfd6', '#a58bff', '#ffc15a', '#ff8a5e'];
    const status = current
      ? '<span class="ok">Région actuelle</span>'
      : unlocked
        ? '<span class="muted">Débloquée — pas encore jouable</span>'
        : '<span class="muted">🔒 Verrouillée</span>';
    return `<div class="region-row"><span class="dot" style="background:${colors[r.id - 1]}"></span><div style="flex:1"><b>${r.id} — ${r.name}</b><div class="muted small">${r.materialName} · ${r.tonsPerFragment} t/fragment · quota ${fmt(r.quota)} t</div></div><div class="small">${status}</div></div>`;
  }).join('');

  return `
<section class="screen" data-screen="workshop">
  <div class="scroll">
    <div class="row between" style="margin-bottom:.6rem">
      <div><div class="logo-sub">Région ${region.id}</div><h2 style="margin:0">${region.name}</h2></div>
      <button class="icon-btn" style="pointer-events:auto" data-action="settings" aria-label="Réglages">⚙</button>
    </div>
    <div class="row" style="margin-bottom:.7rem">
      <span class="chip">🪨 ${region.materialName} : <b>${fmt(stock)} t</b></span>
      <span class="chip">Sorties : ${s.runsCompleted}</span>
    </div>
    ${o.message ? `<div class="tip">${o.message}</div>` : ''}
    ${o.firstTip ? '<div class="tip">💡 Dépense ta pierre à l’atelier : une première amélioration est possible. Puis décolle de nouveau !</div>' : ''}
    ${!o.persistent ? '<div class="tip" style="border-color:rgba(255,107,94,.6)">Session non persistante : la progression sera perdue à la fermeture.</div>' : ''}
    ${transition}
    <h2 style="margin-top:.4rem">Atelier</h2>
    ${branchCards}
    ${delivery}
    <h2 style="margin-top:.4rem">Régions</h2>
    <div class="card">${regions}</div>
    <div style="height:.4rem"></div>
  </div>
  <div class="footer">
    <button class="btn ghost" data-action="home">Accueil</button>
    <button class="btn primary block" data-action="launch">Décoller ▸</button>
  </div>
</section>`;
}

// ---------------------------------------------------------------- Bilan
const OUTCOME_TITLE: Record<SimResult['outcome'], { title: string; cls: string }> = {
  success: { title: 'Sortie réussie', cls: 'ok' },
  voluntary: { title: 'Sortie terminée', cls: 'ok' },
  emergency: { title: 'Récupération d’urgence', cls: 'accent' },
  wrecked: { title: 'Coque détruite', cls: 'accent' },
  abandoned: { title: 'Sortie abandonnée', cls: 'accent' },
};

export function summaryScreen(s: SaveData, r: SimResult, o: { tons: number; lostTons: number; saved: boolean; firstRun: boolean; canOpen: boolean }): string {
  const region = activeRegion(s);
  const wp = workshopProgress(s);
  const del = deliveryStatus(s);
  const t = OUTCOME_TITLE[r.outcome];
  const stock = s.stock[region.material];
  return `
<section class="screen" data-screen="summary">
  <div class="scroll">
    <div class="logo-sub">Bilan de sortie</div>
    <h1 class="${t.cls}" style="margin:.2rem 0 .8rem">${t.title}</h1>
    <div class="card">
      <div class="stat-line"><span>${region.materialName} déposée</span><b class="${o.tons > 0 ? 'ok' : ''}">+${fmt(o.tons)} t</b></div>
      <div class="stat-line"><span>Cargaison perdue</span><b class="${r.lostFragments > 0 ? 'accent' : ''}">${r.lostFragments} place${r.lostFragments > 1 ? 's' : ''}${r.lostFragments > 0 ? ` (${fmt(o.lostTons)} t jamais comptées)` : ''}</b></div>
      <div class="stat-line"><span>Dégâts subis</span><b>${r.damageTaken}</b></div>
      <div class="stat-line"><span>Durée</span><b>${Math.floor(r.duration / 60)}:${String(Math.floor(r.duration % 60)).padStart(2, '0')}</b></div>
      <div class="stat-line"><span>Stock de ${region.materialName.toLowerCase()}</span><b>${fmt(stock)} t</b></div>
    </div>
    <p class="small ${o.saved ? 'ok' : 'accent'}">${o.saved ? '✔ Dépôts et progression sauvegardés.' : '⚠ Sauvegarde indisponible : cette progression sera perdue à la fermeture.'}</p>
    ${r.outcome === 'wrecked' || r.outcome === 'emergency' || r.outcome === 'abandoned' ? '<p class="small muted">Seule la cargaison non déposée est perdue. Tes dépôts précédents et tes améliorations restent acquis.</p>' : ''}
    <div class="card">
      <div class="stat-line"><span>Atelier</span><b>${wp.done}/${wp.total}</b></div>
      <div class="stat-line"><span>Livraison</span><b>${fmt(del.delivered)}/${fmt(del.quota)} t</b></div>
    </div>
    ${o.firstRun && o.tons > 0 ? '<div class="tip">💡 Ta pierre est en sécurité. Va à l’atelier pour t’offrir ta première amélioration.</div>' : ''}
    ${o.canOpen ? '<div class="tip">🎉 Les deux conditions sont remplies : ouvre la région suivante à l’atelier !</div>' : ''}
  </div>
  <div class="footer">
    <button class="btn block" data-action="to-workshop">Atelier</button>
    <button class="btn primary block" data-action="launch">Repartir ▸</button>
  </div>
</section>`;
}

// ---------------------------------------------------------------- Pause
export function pauseScreen(s: SaveData, o: { used: number; cap: number; remaining: number; confirmAbandon: boolean }): string {
  const region = activeRegion(s);
  const wp = workshopProgress(s);
  const del = deliveryStatus(s);
  return `
<section class="screen" data-screen="pause">
  <div class="title-wrap">
    <h1>Pause</h1>
    <div class="card" style="margin:0">
      <div class="stat-line"><span>Soute</span><b>${o.used}/${o.cap} places</b></div>
      <div class="stat-line"><span>Temps restant</span><b>${Math.floor(o.remaining / 60)}:${String(Math.ceil(o.remaining) % 60).padStart(2, '0')}</b></div>
      <div class="stat-line"><span>Objectif · Atelier</span><b>${wp.done}/${wp.total}</b></div>
      <div class="stat-line"><span>Objectif · Livraison (${region.materialName.toLowerCase()})</span><b>${fmt(del.delivered)}/${fmt(del.quota)} t</b></div>
    </div>
    <div class="stack">
      <button class="btn primary wide" data-action="resume-run">Reprendre</button>
      <button class="btn ghost wide" data-action="settings">Réglages</button>
      <button class="btn danger wide" data-action="abandon">${o.confirmAbandon ? 'Confirmer : perdre la cargaison non déposée' : 'Abandonner la sortie'}</button>
    </div>
    <p class="muted small center">La simulation et le chronomètre sont suspendus.</p>
  </div>
</section>`;
}

// ---------------------------------------------------------------- Réglages
export function settingsScreen(s: SaveData, o: { fromRun: boolean; unlocked: boolean }): string {
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
    <p class="muted small" style="margin-top:.8rem">Musique et sons : synthèse temporaire du prototype (aucun fichier tiers).</p>
  </div>
  <div class="footer"><button class="btn primary block" data-action="settings-back">${o.fromRun ? 'Retour à la pause' : 'Retour'}</button></div>
</section>`;
}

// ---------------------------------------------------------------- Fin du prototype
export function endScreen(s: SaveData): string {
  return `
<section class="screen" data-screen="end">
  <div class="title-wrap">
    <div class="logo-sub">Fin du prototype</div>
    <h1 class="ok">Région 2<br/>débloquée</h1>
    <p>Bravo ! Les quatre branches sont maximisées et le quota de la Ceinture rocheuse est livré. La Nébuleuse cristalline est ouverte et enregistrée, mais elle n’est pas encore jouable dans ce lot.</p>
    <div class="card" style="margin:0">
      <div class="stat-line"><span>Sorties effectuées</span><b>${s.runsCompleted}</b></div>
      <div class="stat-line"><span>Pierre livrée</span><b>${fmt(s.delivered[0])} t</b></div>
      <div class="stat-line"><span>Améliorations</span><b>12/12</b></div>
    </div>
    <div class="stack">
      <button class="btn primary wide" data-action="to-workshop">Rejouer la région 1</button>
      <button class="btn ghost wide" data-action="home">Accueil</button>
    </div>
  </div>
</section>`;
}

// ---------------------------------------------------------------- Récupération
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

// ---------------------------------------------------------------- Gestionnaire
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
    const sameScreen = this.root.querySelector(`[data-screen="${this.idOf(html)}"]`) !== null;
    const top = sameScreen && before && !resetScroll ? before.scrollTop : 0;
    this.root.innerHTML = html;
    this.id = this.idOf(html);
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
