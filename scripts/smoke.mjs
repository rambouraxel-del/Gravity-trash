// Test de fumée navigateur (optionnel) : nécessite Playwright et un serveur `npm run dev` lancé.
//   node scripts/smoke.mjs [url] [dossier-captures]
// Ce script n'est PAS un test sur téléphone réel : il émule des écrans et le tactile dans Chromium.
import { createRequire } from 'node:module';
import fs from 'node:fs';

const require = createRequire(import.meta.url);
let pw;
for (const p of ['playwright', '/opt/node22/lib/node_modules/playwright']) {
  try { pw = require(p); break; } catch { /* essai suivant */ }
}
if (!pw) { console.error('Playwright introuvable.'); process.exit(2); }

const url = process.argv[2] ?? 'http://127.0.0.1:5173/';
const out = process.argv[3] ?? 'shots';
fs.mkdirSync(out, { recursive: true });
const results = [];
const check = (name, ok, info = '') => { results.push({ name, ok }); console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${info ? ' — ' + info : ''}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await pw.chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });

async function session(name, viewport, opts = {}) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: opts.dpr ?? 2, hasTouch: !!opts.touch, isMobile: !!opts.touch });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(url);
  await page.waitForFunction(() => window.__eboueurs, null, { timeout: 20000 });
  return { ctx, page, errors, name };
}
const state = (page) => page.evaluate(() => {
  const a = window.__eboueurs; const d = a.debugState; const s = d.sim;
  return { screen: d.screen, inRun: d.inRun, paused: d.paused, save: a.save,
    sim: s ? { t: s.time, x: s.ship.x, y: s.ship.y, hull: s.ship.hull, cargo: s.cargo.used, cap: s.cargo.capacity, frags: s.fragments.length, ended: s.ended, outcome: s.outcome, dep: s.depositedFragments, target: !!s.target, extracting: s.extracting } : null };
});
const click = async (page, sel) => { await page.click(sel); await sleep(150); };

// ---------- Session 1 : téléphone 390×844 (tactile émulé)
for (const [label, vp] of [['390x844', { width: 390, height: 844 }], ['360x800', { width: 360, height: 800 }]]) {
  const S = await session(label, vp, { touch: true });
  const { page } = S;
  await page.screenshot({ path: `${out}/${label}-home.png` });
  check(`${label} accueil affiché`, (await page.locator('[data-screen="home"]').count()) === 1);
  const scroll = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, sh: document.documentElement.scrollHeight, ch: document.documentElement.clientHeight }));
  check(`${label} aucun défilement de page`, scroll.sw <= scroll.cw + 1 && scroll.sh <= scroll.ch + 1, JSON.stringify(scroll));
  await click(page, '[data-action="play"]');
  await sleep(600);
  let st = await state(page);
  check(`${label} sortie lancée au premier « Jouer »`, st.inRun && st.screen === 'none');
  await page.screenshot({ path: `${out}/${label}-run-start.png` });

  // joystick tactile : glisser vers le haut (zone basse droite)
  const zone = await page.locator('#joyZone').boundingBox();
  const sx = zone.x + zone.width * 0.5; const sy = zone.y + zone.height * 0.6;
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: sx, y: sy, id: 1 }] });
  const y0 = st.sim.y;
  for (let i = 1; i <= 8; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: sx, y: sy - i * 8, id: 1 }] }); await sleep(60); }
  await sleep(1500);
  st = await state(page);
  check(`${label} le joystick déplace le vaisseau`, st.sim.y < y0 - 40, `y ${y0.toFixed(0)} → ${st.sim.y.toFixed(0)}`);
  await page.screenshot({ path: `${out}/${label}-run-moving.png` });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await sleep(400);
  const a = await state(page); await sleep(500); const b = await state(page);
  check(`${label} relâché : le vaisseau freine et s'arrête`, Math.abs(b.sim.y - a.sim.y) < 3);

  // pause : chrono suspendu
  await click(page, '#btnPause');
  const p1 = await state(page); await sleep(1200); const p2 = await state(page);
  check(`${label} pause : chrono et vaisseau figés`, p1.paused && p2.sim.t === p1.sim.t, `${p1.sim.t.toFixed(2)} = ${p2.sim.t.toFixed(2)}`);
  await page.screenshot({ path: `${out}/${label}-pause.png` });
  await click(page, '[data-action="resume-run"]');
  await sleep(300);
  const r = await state(page);
  check(`${label} reprise : simulation relancée`, !r.paused);
  check(`${label} aucune erreur console`, S.errors.length === 0, S.errors.join(' | '));
  await S.ctx.close();
}

// ---------- Session 2 : ordinateur 1280×800, clavier + parcours complet
{
  const S = await session('desktop', { width: 1280, height: 800 }, { dpr: 1 });
  const { page } = S;
  await page.screenshot({ path: `${out}/desktop-home.png` });
  const box = await page.locator('#stage').boundingBox();
  check('desktop portrait centré avec marges', box.width < 1280 * 0.5 && Math.abs(box.x + box.width / 2 - 640) < 2, `${box.width.toFixed(0)}×${box.height.toFixed(0)}`);
  await click(page, '[data-action="play"]');
  await sleep(500);
  let st = await state(page);
  const y0 = st.sim.y;
  await page.keyboard.down('ArrowUp'); await sleep(1500); await page.keyboard.up('ArrowUp');
  st = await state(page);
  check('clavier : flèche haut déplace le vaisseau', st.sim.y < y0 - 60, `y ${y0.toFixed(0)} → ${st.sim.y.toFixed(0)}`);
  // diagonales non accélérées : vitesse max mesurée
  const sp = await page.evaluate(async () => {
    const s = window.__eboueurs.debugState.sim; let max = 0;
    const t0 = performance.now();
    return await new Promise((res) => { const tick = () => { max = Math.max(max, s.speed); if (performance.now() - t0 > 1200) res(max); else requestAnimationFrame(tick); }; window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowRight' })); window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowUp' })); tick(); });
  });
  await page.evaluate(() => { window.dispatchEvent(new KeyboardEvent('keyup', { code: 'ArrowRight' })); window.dispatchEvent(new KeyboardEvent('keyup', { code: 'ArrowUp' })); });
  check('diagonale normalisée (vitesse ≤ max)', sp <= 170.5, `vitesse max ${sp.toFixed(1)}`);
  await page.screenshot({ path: `${out}/desktop-run.png` });
  check('desktop aucune erreur console', S.errors.length === 0, S.errors.join(' | '));
  await S.ctx.close();
}

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} vérifications réussies`);
process.exit(failed.length ? 1 : 0);
