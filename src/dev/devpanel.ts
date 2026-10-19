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
      <button class="btn" data-d="m100">+100 matières de base</button>
      <button class="btn" data-d="m1000">+1000 matières (toutes)</button>
      <button class="btn" data-d="c1000">+1000 💳</button>
    </div>
    <div class="row">
      <button class="btn" data-d="b3">Stations niv. 3</button>
      <button class="btn" data-d="ship">Vaisseau max</button>
      <button class="btn" data-d="unlock">Tout débloquer</button>
    </div>
    <div class="row">Temps :
      <button class="btn" data-d="t1">×1</button>
      <button class="btn" data-d="t4">×4</button>
      <button class="btn" data-d="t20">×20</button>
      <button class="btn" data-d="tick">+60 s (raffinerie/drone)</button>
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
      case 'm100': app.devAddStock(100, false); break;
      case 'm1000': app.devAddStock(1000, true); break;
      case 'c1000': app.devAddCredits(1000); break;
      case 'b3': app.devBuildings(); break;
      case 'ship': app.devShipMax(); break;
      case 'unlock': app.devUnlockAll(); break;
      case 't1': app.timeScale = 1; break;
      case 't4': app.timeScale = 4; break;
      case 't20': app.timeScale = 20; break;
      case 'tick': app.devTick(60); break;
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
  (window as unknown as { __spacetrash: unknown }).__spacetrash = app;
}
