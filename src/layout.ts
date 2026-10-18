import { LOGICAL_H, LOGICAL_W, view } from './scenes/view';

/** Calcule l'échelle d'affichage (portrait centré, zones sûres) et la publie dans --u. */
export function applyLayout(): number {
  const probe = document.getElementById('safe-probe');
  const cs = probe ? getComputedStyle(probe) : null;
  const inset = (side: 'Top' | 'Right' | 'Bottom' | 'Left') => (cs ? parseFloat(cs.getPropertyValue(`padding-${side.toLowerCase()}`)) || 0 : 0);
  const vv = window.visualViewport;
  const w = (vv?.width ?? window.innerWidth) - inset('Left') - inset('Right');
  const h = (vv?.height ?? window.innerHeight) - inset('Top') - inset('Bottom');
  const u = Math.max(0.5, Math.min(w / LOGICAL_W, h / LOGICAL_H, 1.6));
  document.documentElement.style.setProperty('--u', u.toFixed(4));
  return u;
}

/** Échelle de rendu du canvas : 2 sur écrans denses ou grands, sinon 1. */
export function pickRenderScale(u: number): number {
  const dpr = window.devicePixelRatio || 1;
  view.k = u * dpr > 1.45 ? 2 : 1;
  return view.k;
}
