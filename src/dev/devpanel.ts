// Panneau développeur : chargé uniquement en mode dev (import.meta.env.DEV), jamais en production.
import type { App } from '../app';

export function installDevPanel(app: App): void {
  const stage = document.getElementById('stage') as HTMLElement;
  const toggle = document.createElement('button');
  toggle.className = 'dev-toggle';
  toggle.textContent = 'DEV';
  const panel = document.createElement('div');
  panel.className = 'dev-panel';
  panel.hidden = true;
  panel.innerHTML = `
    <div class="row"><b>Outils développeur (local)</b></div>
    <div class="row">
      <button class="btn" data-d="s100">+100 t</button>
      <button class="btn" data-d="s1000">+1000 t</button>
      <button class="btn" data-d="max">Max atelier</button>
    </div>
    <div class="row">Temps :
      <button class="btn" data-d="t1">×1</button>
      <button class="btn" data-d="t4">×4</button>
      <button class="btn" data-d="t10">×10</button>
    </div>
    <div class="row">
      <button class="btn" data-d="inspect">Inspecter la sauvegarde</button>
      <button class="btn" data-d="reset">Remise à zéro…</button>
    </div>
    <textarea readonly hidden></textarea>`;
  stage.append(toggle, panel);
  const area = panel.querySelector('textarea') as HTMLTextAreaElement;
  toggle.addEventListener('click', () => (panel.hidden = !panel.hidden));
  panel.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-d]');
    if (!b) return;
    switch (b.dataset.d) {
      case 's100': app.devAddStone(100); break;
      case 's1000': app.devAddStone(1000); break;
      case 'max': app.devMaxUpgrades(); break;
      case 't1': app.timeScale = 1; break;
      case 't4': app.timeScale = 4; break;
      case 't10': app.timeScale = 10; break;
      case 'inspect':
        area.hidden = false;
        try {
          area.value = JSON.stringify(JSON.parse(app.devRawSave()), null, 1);
        } catch {
          area.value = app.devRawSave();
        }
        break;
      case 'reset':
        if (window.confirm('Effacer TOUTE la sauvegarde locale (profil + copie) ?')) app.devReset();
        break;
    }
  });
  (window as unknown as { __eboueurs: unknown }).__eboueurs = app;
}
