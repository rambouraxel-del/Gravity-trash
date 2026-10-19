// Test de fumée navigateur (émulation Chromium, PAS un téléphone réel) : mise à l'échelle, commandes, pause, son.
//   node scripts/smoke.mjs [url] [dossier-captures]      (nécessite `npm run dev`)
import { check, click, launchBrowser, newSession, out, sleep, state, summary, until } from './lib.mjs';

const browser = await launchBrowser();

for (const [label, vp] of [['390x844', { width: 390, height: 844 }], ['360x800', { width: 360, height: 800 }]]) {
  const { ctx, page, errors } = await newSession(browser, vp, { touch: true, dpr: 2 });
  await page.screenshot({ path: `${out}/${label}-station.png` });
  const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, sh: document.documentElement.scrollHeight, ch: document.documentElement.clientHeight }));
  check(`${label} station affichée, aucun défilement de page`, (await page.locator('[data-screen="station"]').count()) === 1 && m.sw <= m.cw + 1 && m.sh <= m.ch + 1, JSON.stringify(m));
  // zones tactiles ≥ 44 px CSS
  const small = await page.evaluate(() => [...document.querySelectorAll('#screen button, #btnPause')].map((b) => { const r = b.getBoundingClientRect(); return { n: b.getAttribute('aria-label') || b.textContent.trim().slice(0, 18), w: r.width, h: r.height }; }).filter((b) => b.w > 0 && (b.w < 43.5 || b.h < 43.5) && !/Construire|Drone|^\d|↑|✓/.test(b.n)));
  check(`${label} boutons de la station ≥ 44 px`, small.filter((b) => !b.n.match(/Atelier|Entrepôt|Raffinerie|Bureau|Hangar|Vaisseau|Relais/)).length === 0, JSON.stringify(small));

  await click(page, '.st-nav .btn.primary');
  await page.screenshot({ path: `${out}/${label}-map.png` });
  await click(page, '[data-action="launch"][data-sector="belt"]');
  await sleep(600);
  let st = await state(page);
  check(`${label} expédition lancée`, st.inRun);
  // joystick tactile
  const zone = await page.locator('#joyZone').boundingBox();
  const sx = zone.x + zone.width * 0.5;
  const sy = zone.y + zone.height * 0.6;
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: sx, y: sy, id: 1 }] });
  const y0 = st.sim.y;
  for (let i = 1; i <= 8; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: sx, y: sy - i * 8, id: 1 }] }); await sleep(60); }
  await until(page, (x) => x.sim.y < y0 - 40, 6000);
  st = await state(page);
  check(`${label} le joystick déplace le vaisseau`, st.sim.y < y0 - 40, `y ${y0.toFixed(0)} → ${st.sim.y.toFixed(0)}`);
  await page.screenshot({ path: `${out}/${label}-run.png` });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await sleep(500);
  const a = await state(page); await sleep(500); const b = await state(page);
  check(`${label} relâché : le vaisseau freine et s'arrête`, Math.abs(b.sim.y - a.sim.y) < 3);

  // pause
  await click(page, '#btnPause');
  const p1 = await state(page); await sleep(1000); const p2 = await state(page);
  check(`${label} pause : simulation figée`, p1.paused && p2.sim.t === p1.sim.t && p1.screen === 'pause');
  await page.screenshot({ path: `${out}/${label}-pause.png` });
  await click(page, '[data-action="resume-run"]');
  check(`${label} reprise`, !(await state(page)).paused);

  // arrière-plan : pause automatique
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
  await sleep(250);
  check(`${label} arrière-plan : pause automatique`, (await state(page)).screen === 'pause');
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); document.dispatchEvent(new Event('visibilitychange')); });
  await page.waitForFunction(() => window.__spacetrash.audio.ctx?.state === 'running', null, { timeout: 5000 }).catch(() => {});
  const au = await page.evaluate(() => { const a = window.__spacetrash.audio; return { unlocked: a.unlocked, state: a.ctx ? a.ctx.state : null }; });
  check(`${label} audio débloqué après le premier geste`, au.unlocked && au.state === 'running', JSON.stringify(au));

  // fermeture complète en pleine expédition : cargaison perdue, rien rejoué
  await page.evaluate(() => { const s = window.__spacetrash.debugState.sim; s.cargo.set({ rock: 5 }); });
  const stockBefore = JSON.stringify((await state(page)).save.stock);
  await page.reload();
  await page.waitForFunction(() => window.__spacetrash);
  st = await state(page);
  check(`${label} fermeture en expédition : stock inchangé, plus d'expédition en cours`, JSON.stringify(st.save.stock) === stockBefore && st.save.runInProgress === null && !st.inRun && st.screen === 'station');
  check(`${label} message d'expédition interrompue`, (await page.locator('#banner').textContent()).includes('interrompue'));
  check(`${label} aucune erreur console`, errors.length === 0, errors.join(' | '));
  await ctx.close();
}

// ---- ordinateur
{
  const { ctx, page, errors } = await newSession(browser, { width: 1280, height: 800 }, { dpr: 1 });
  await page.screenshot({ path: `${out}/desktop-station.png` });
  const box = await page.locator('#stage').boundingBox();
  check('ordinateur : portrait centré avec marges', box.width < 1280 * 0.5 && Math.abs(box.x + box.width / 2 - 640) < 2, `${box.width.toFixed(0)}×${box.height.toFixed(0)}`);
  await click(page, '.st-nav .btn.primary');
  await click(page, '[data-action="launch"][data-sector="belt"]');
  await sleep(500);
  let st = await state(page);
  const y0 = st.sim.y;
  await page.keyboard.down('ArrowUp'); await sleep(1500); await page.keyboard.up('ArrowUp');
  st = await state(page);
  check('clavier : flèche haut déplace le vaisseau', st.sim.y < y0 - 60, `y ${y0.toFixed(0)} → ${st.sim.y.toFixed(0)}`);
  const sp = await page.evaluate(async () => {
    const s = window.__spacetrash.debugState.sim; let max = 0; const t0 = performance.now();
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyD' }));
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }));
    return await new Promise((res) => { const tick = () => { max = Math.max(max, s.speed); if (performance.now() - t0 > 1500) res(max); else requestAnimationFrame(tick); }; tick(); });
  });
  await page.evaluate(() => { window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyD' })); window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' })); });
  check('WASD en diagonale : vitesse normalisée (≤ max)', sp <= 170.5 && sp > 100, `vitesse max ${sp.toFixed(1)}`);
  await page.keyboard.press('Escape');
  await sleep(200);
  check('Échap met en pause', (await state(page)).screen === 'pause');
  await page.screenshot({ path: `${out}/desktop-pause.png` });
  check('ordinateur : aucune erreur console', errors.length === 0, errors.join(' | '));
  await ctx.close();
}

await browser.close();
process.exit(summary());
