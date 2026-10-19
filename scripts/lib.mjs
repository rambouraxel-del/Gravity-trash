// Utilitaires communs aux tests navigateur (Playwright requis ; serveur `npm run dev` lancé).
import { createRequire } from 'node:module';
import fs from 'node:fs';

const require = createRequire(import.meta.url);
let pw;
for (const p of ['playwright', '/opt/node22/lib/node_modules/playwright']) {
  try { pw = require(p); break; } catch { /* essai suivant */ }
}
if (!pw) { console.error('Playwright introuvable.'); process.exit(2); }

export const url = process.argv[2] ?? 'http://127.0.0.1:5173/';
export const out = process.argv[3] ?? 'shots';
fs.mkdirSync(out, { recursive: true });
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let fails = 0;
let total = 0;
export const check = (name, ok, info = '') => {
  total++;
  if (!ok) fails++;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${info ? ' — ' + info : ''}`);
};
export const summary = () => {
  console.log(fails ? `\n${fails} échec(s) sur ${total}` : `\n${total}/${total} vérifications réussies`);
  return fails ? 1 : 0;
};

export async function launchBrowser() {
  return pw.chromium.launch({
    executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'],
  });
}

export async function newSession(browser, viewport, { touch = false, dpr = 1, fresh = true } = {}) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: dpr, hasTouch: touch, isMobile: touch });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(url);
  await page.waitForFunction(() => window.__spacetrash, null, { timeout: 30000 });
  if (fresh) {
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.waitForFunction(() => window.__spacetrash, null, { timeout: 30000 });
  }
  return { ctx, page, errors };
}

/** État courant lisible depuis la page (sauvegarde, simulation, écran). */
export const state = (page) => page.evaluate(() => {
  const a = window.__spacetrash;
  const d = a.debugState;
  const s = d.sim;
  return {
    screen: d.screen, inRun: d.inRun, paused: d.paused, save: a.save,
    sim: s && {
      t: s.time, x: s.ship.x, y: s.ship.y, hull: s.ship.hull, hullMax: s.stats.hullMax, cargo: s.cargo.contents(), used: s.cargo.used, cap: s.cargo.capacity,
      ended: s.ended, outcome: s.outcome, deposited: s.deposited, lost: s.lost, discovered: s.discovered.size, target: s.target && s.target.id, extracting: s.extracting,
      held: s.held && s.held.id, equipment: s.equipment, inRing: s.inRing,
    },
  };
});

export async function until(page, fn, ms = 30000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (await fn(await state(page))) return true;
    await sleep(150);
  }
  return false;
}

export const click = async (page, sel) => { await page.click(sel); await sleep(180); };
