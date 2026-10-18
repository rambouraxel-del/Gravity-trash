// Parcours complet en navigateur (dev) : sortie, dépôt, achats, livraison, région 2, rechargement.
//   node scripts/flow.mjs [url] [dossier-captures]
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire(import.meta.url);
let pw;
for (const p of ['playwright', '/opt/node22/lib/node_modules/playwright']) { try { pw = require(p); break; } catch { /* suivant */ } }
const url = process.argv[2] ?? 'http://127.0.0.1:5173/';
const out = process.argv[3] ?? 'shots';
fs.mkdirSync(out, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0;
const check = (n, ok, i = '') => { if (!ok) fails++; console.log(`${ok ? 'OK  ' : 'FAIL'} ${n}${i ? ' — ' + i : ''}`); };

const browser = await pw.chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(url);
await page.waitForFunction(() => window.__eboueurs, null, { timeout: 20000 });
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.waitForFunction(() => window.__eboueurs, null, { timeout: 20000 });
const S = () => page.evaluate(() => { const a = window.__eboueurs; const s = a.debugState.sim; return { screen: a.debugState.screen, inRun: a.debugState.inRun, save: a.save, sim: s && { t: s.time, cargo: s.cargo.used, cap: s.cargo.capacity, ended: s.ended, outcome: s.outcome, dep: s.depositedFragments, lost: s.lostFragments, hull: s.ship.hull, tgt: !!s.target, extracting: s.extracting, deposits: s.deposits.map((d) => d.remaining) } }; });
const until = async (fn, ms = 20000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await fn(await S())) return true; await sleep(150); } return false; };
const click = async (sel) => { await page.click(sel); await sleep(200); };

// --- première sortie : fragments, minage, dépôt
await click('[data-action="play"]');
await sleep(500);
await page.evaluate(() => { const s = window.__eboueurs.debugState.sim; s.ship.x = 390; s.ship.y = 2235; });
await until((x) => x.sim.cargo >= 5);
let st = await S();
check('fragments collectés automatiquement', st.sim.cargo >= 5, `soute ${st.sim.cargo}/${st.sim.cap}`);
await page.evaluate(() => { const s = window.__eboueurs.debugState.sim; const d = s.deposits[0]; s.ship.x = d.x; s.ship.y = d.y + d.r + 30; });
await until((x) => x.sim.deposits[0] < 8 && x.sim.cargo >= 8);
st = await S();
check('minage : un gisement entame son stock', st.sim.deposits[0] < 8, `restant ${st.sim.deposits[0]}`);
check('soute pleine plafonnée', st.sim.cargo <= st.sim.cap);
await page.screenshot({ path: `${out}/flow-mining.png` });
const cargoBefore = await page.evaluate(() => { const s = window.__eboueurs.debugState.sim; const n = s.cargo.used; s.ship.x = 390; s.ship.y = 2400; s.ship.vx = 0; s.ship.vy = 0; return n; });
await until((x) => x.sim.cargo === 0, 25000);
await sleep(500);
st = await S();
check('dépôt unique : soute vidée', st.sim.cargo === 0 && st.sim.dep === cargoBefore, `déposé ${st.sim.dep}`);
check('stock crédité exactement (10 t/fragment) et sauvegardé', st.save.stone === undefined && st.save.stock.stone === cargoBefore * 10, `stock ${st.save.stock.stone}`);
const raw = await page.evaluate(() => JSON.parse(localStorage.getItem('eboueurs.save.v1')));
check('sauvegarde persistée immédiatement', raw.stock.stone === cargoBefore * 10 && raw.runInProgress);
await page.screenshot({ path: `${out}/flow-deposit.png` });
await click('#btnEnd');
await until((x) => x.screen === 'summary');
st = await S();
check('fin volontaire : bilan affiché', st.screen === 'summary');
await page.screenshot({ path: `${out}/flow-summary.png` });
const stockAfterRun = (await S()).save.stock.stone;
check('fin de sortie sans double crédit', stockAfterRun === cargoBefore * 10);

// --- audio : débloqué au premier geste, une seule musique
const au = await page.evaluate(() => { const a = window.__eboueurs.audio; return { unlocked: a.unlocked, state: a.ctx ? a.ctx.state : null }; });
check('audio débloqué après le premier geste', au.unlocked && au.state === 'running', JSON.stringify(au));

// --- rechargement : aucune duplication, run terminée proprement
await page.reload();
await page.waitForFunction(() => window.__eboueurs, null, { timeout: 20000 });
st = await S();
check('rechargement : stock identique', st.save.stock.stone === stockAfterRun);

// --- fermeture complète en pleine sortie : dépôts gardés, cargaison perdue, rien rejoué
await click('[data-action="play"]');
await click('[data-action="launch"]');
await sleep(400);
await page.evaluate(() => { const s = window.__eboueurs.debugState.sim; s.ship.x = 390; s.ship.y = 2235; });
await until((x) => x.sim.cargo >= 3);
check('sortie en cours marquée dans la sauvegarde', (await S()).save.runInProgress !== null);
await page.reload();
await page.waitForFunction(() => window.__eboueurs, null, { timeout: 20000 });
st = await S();
check('fermeture en sortie : stock inchangé, plus de sortie en cours', st.save.stock.stone === stockAfterRun && st.save.runInProgress === null && !st.inRun);
check('message de sortie interrompue affiché', (await page.locator('.tip').allTextContents()).some((t) => t.includes('interrompue')));

// --- atelier : achats, verrous, livraison
await click('[data-action="play"]');
await sleep(300);
st = await S();
check('Reprendre ouvre l’atelier', st.screen === 'workshop');
await page.evaluate(() => window.__eboueurs.devAddStone(2000));
await sleep(200);
await page.screenshot({ path: `${out}/flow-workshop.png`, fullPage: false });
const dis = await page.locator('[data-action="deliver"]').first().isDisabled();
check('livraison verrouillée avant maximisation', dis);
check('cause du verrou affichée', (await page.locator('.lock').allTextContents()).some((t) => t.includes('Maximise')));
for (const b of ['cargo', 'magnet', 'engine', 'hull']) for (let i = 0; i < 3; i++) await click(`[data-action="buy"][data-branch="${b}"]`);
st = await S();
check('12 améliorations achetées, stock débité de 960 t', st.save.levels.cargo === 3 && st.save.levels.hull === 3 && st.save.stock.stone === stockAfterRun + 2000 - 960, `stock ${st.save.stock.stone}`);
check('un achat de plus est refusé (bouton inactif)', await page.locator('[data-action="buy"][data-branch="cargo"]').isDisabled());
check('region non ouvrable avec branches seules', (await page.locator('[data-action="open-region"]').count()) === 0);
await page.screenshot({ path: `${out}/flow-workshop-maxed.png` });
await click('[data-action="deliver"][data-amount="100"]');
st = await S();
check('livraison partielle : stock -100, livré +100', st.save.delivered[0] === 100);
await page.evaluate(() => window.__eboueurs.devAddStone(1000));
await sleep(100);
await click('[data-action="deliver"][data-amount="max"]');
st = await S();
check('livraison du reste du quota', st.save.delivered[0] === 1000, `livré ${st.save.delivered[0]}`);
check('« Ouvrir la région 2 » disponible', (await page.locator('[data-action="open-region"]').count()) === 1);
await page.screenshot({ path: `${out}/flow-ready.png` });
await click('[data-action="open-region"]');
st = await S();
check('fin de prototype affichée, région 2 persistée', st.screen === 'end' && st.save.unlockedRegions.includes(2));
await page.screenshot({ path: `${out}/flow-end.png` });
await page.reload();
await page.waitForFunction(() => window.__eboueurs, null, { timeout: 20000 });
st = await S();
check('après rechargement : région 2 toujours débloquée, niveaux conservés', st.save.unlockedRegions.includes(2) && st.save.levels.engine === 3);
await click('[data-action="play"]');
await click('[data-action="launch"]');
await sleep(500);
st = await S();
check('rejouer la région 1 avec le vaisseau amélioré', st.inRun && st.sim.cap === 24, `capacité ${st.sim?.cap}`);
await page.screenshot({ path: `${out}/flow-run-upgraded.png` });

// --- réglages
// pause automatique en arrière-plan
await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
await sleep(200);
const hid = await S();
check('arrière-plan : pause automatique', hid.screen === 'pause');
const tHidden = (await S()).sim.t; await sleep(800);
check('arrière-plan : chronomètre figé', (await S()).sim.t === tHidden);
await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); document.dispatchEvent(new Event('visibilitychange')); });
await click('[data-action="settings"]');
await page.screenshot({ path: `${out}/flow-settings.png` });
await click('[data-action="side"][data-side="left"]');
await click('[data-action="settings-back"]');
st = await S();
check('réglages depuis la pause : retour à la pause', st.screen === 'pause');
await page.screenshot({ path: `${out}/flow-pause.png` });
await click('[data-action="abandon"]');
await click('[data-action="abandon"]');
await until((x) => x.screen === 'summary');
st = await S();
check('abandon : bilan, rien d’autre perdu', st.screen === 'summary' && st.save.levels.cargo === 3);
check('aucune erreur console', errors.length === 0, errors.join(' | '));
await browser.close();
console.log(fails ? `\n${fails} échec(s)` : '\nParcours complet OK');
process.exit(fails ? 1 : 0);
