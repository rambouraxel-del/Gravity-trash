// Parcours complet en navigateur : explore, dépose, construit, raffine, contrats, drone, laser, tracteur, relais.
//   node scripts/flow.mjs [url] [dossier-captures]      (nécessite `npm run dev`)
import { check, click, launchBrowser, newSession, out, sleep, state, summary, until } from './lib.mjs';

const browser = await launchBrowser();
const { page, errors } = await newSession(browser, { width: 390, height: 844 }, { touch: true });
const app = (fn, arg) => page.evaluate(fn, arg);
const shot = (n) => page.screenshot({ path: `${out}/flow-${n}.png` });
const goPanel = async (p) => { await app((p) => window.__spacetrash.go(p), p); await sleep(250); };
const tele = (x, y) => app(([x, y]) => { const s = window.__spacetrash.debugState.sim; s.ship.x = x; s.ship.y = y; s.ship.vx = 0; s.ship.vy = 0; }, [x, y]);
const dock = async () => { const lv = await app(() => window.__spacetrash.debugState.sim.level.station); await tele(lv.x, lv.y); };
const quitRun = async () => {
  await click(page, '#btnPause');
  await click(page, '[data-action="emergency"]');
  await click(page, '[data-action="emergency"]');
  await until(page, (x) => x.screen === 'summary');
  await click(page, '[data-action="station"]');
};

// ---------------------------------------------------------------- 1. départ et première expédition
let st = await state(page);
check('démarrage direct sur la station', st.screen === 'station' && (await page.locator('[data-screen="station"]').count()) === 1);
check('un seul bâtiment au départ (atelier), 60 crédits', st.save.buildings.workshop === 1 && st.save.buildings.warehouse === 0 && st.save.credits === 60);
check('objectif de départ affiché', (await page.locator('.st-obj').first().textContent()).includes('DÉPART'));
await shot('station-start');

await click(page, '.st-nav .btn.primary');
check('la carte ne propose que la ceinture rocheuse', (await page.locator('[data-action="launch"]').count()) === 1 && (await page.locator('.lock').count()) === 2);
await click(page, '[data-action="launch"][data-sector="belt"]');
await sleep(500);
st = await state(page);
check('expédition lancée, sans chronomètre', st.inRun && (await page.locator('#hudTime').count()) === 0);
check('aucune ressource au départ, coque pleine', st.sim.used === 0 && st.sim.hull === st.sim.hullMax);
const lv = await app(() => { const l = window.__spacetrash.debugState.sim.level; return { st: l.station, w: l.world, d0: l.deposits[0] }; });
check('carte vaste (≥ 2400 × 4000)', lv.w.w >= 2400 && lv.w.h >= 4000);

await tele(lv.st.x, lv.st.y - 270);
await until(page, (x) => x.sim.used >= 5);
await tele(lv.d0.x, lv.d0.y + lv.d0.r + 30);
await until(page, (x) => x.sim.used >= 9, 20000);
st = await state(page);
check('collecte et minage remplissent la soute (roche)', st.sim.used >= 6 && (st.sim.cargo.rock ?? 0) >= 6, JSON.stringify(st.sim.cargo));
check('découverte du gisement par le scanner', st.sim.discovered >= 1);
await shot('run-mining');
const carried = st.sim.used;

const before = (await state(page)).save.stock;
await dock();
await until(page, (x) => x.sim.used === 0, 25000);
await sleep(300);
st = await state(page);
const gained = Object.values(st.save.stock).reduce((a, b) => a + b, 0) - Object.values(before).reduce((a, b) => a + b, 0);
check('dépôt unique : soute vidée et stock crédité exactement', st.sim.used === 0 && gained >= carried && gained <= carried + 12, `soute ${carried} → stock +${gained}`);
check('découverte enregistrée dans la sauvegarde', st.save.sectors.discovered.belt.length >= 1);
const raw = await app(() => JSON.parse(localStorage.getItem('spacetrash.save.v1')));
check('sauvegarde immédiate (stock + expédition en cours)', raw.stock.rock + raw.stock.scrap >= carried && !!raw.runInProgress);
await shot('run-docked');

await click(page, '#btnEnd');
await until(page, (x) => x.screen === 'summary');
check('bilan d’expédition affiché', (await state(page)).screen === 'summary');
await shot('summary');
await click(page, '[data-action="station"]');

// ---------------------------------------------------------------- 2. rechargement : rien n'est dupliqué
const stockBeforeReload = (await state(page)).save.stock;
await page.reload();
await page.waitForFunction(() => window.__spacetrash);
st = await state(page);
check('rechargement : stock, découvertes et expéditions conservés', JSON.stringify(st.save.stock) === JSON.stringify(stockBeforeReload) && st.save.sectors.expeditions === 1);

// ---------------------------------------------------------------- 3. station : entrepôt, bureau, vente, contrats
await app(() => window.__spacetrash.devAddStock(150, false));
await goPanel('warehouse');
await click(page, '[data-action="build"][data-building="warehouse"]');
st = await state(page);
check('entrepôt construit (niveau 1), matières consommées', st.save.buildings.warehouse === 1);
await app(() => window.__spacetrash.devAddStock(150, false));
await goPanel('office');
await click(page, '[data-action="build"][data-building="office"]');
st = await state(page);
check('bureau commercial construit, crédits débités', st.save.buildings.office === 1 && st.save.credits === 10, `crédits ${st.save.credits}`);
await shot('office');
const creditsBefore = st.save.credits;
await click(page, '[data-action="office-tab"][data-tab="sales"]');
await click(page, '[data-action="sell"][data-item="rock"][data-qty="10"]');
st = await state(page);
check('vente directe à prix fixe (1 crédit / roche)', st.save.credits === creditsBefore + 10);
await click(page, '[data-action="office-tab"][data-tab="contracts"]');
st = await state(page);
check('le tableau propose des offres ordinaires', st.save.contracts.board.length === 3);
await page.locator('[data-action="accept-offer"]').first().click();
await sleep(250);
st = await state(page);
check('contrat ordinaire accepté (sans limite de temps)', st.save.contracts.active.length === 1 && st.save.contracts.board.length === 3);
await app(() => window.__spacetrash.devAddStock(100, false));
await click(page, '[data-action="deliver"]');
const cid = (await state(page)).save.contracts.active[0].id;
await click(page, `[data-action="complete"][data-id="${cid}"]`);
st = await state(page);
check('contrat terminé : récompense versée une fois', st.save.contracts.active.length === 0 && st.save.credits > 10 && st.save.contracts.completed === 1, `crédits ${st.save.credits}`);

await app(() => window.__spacetrash.devAddStock(200, false));
await click(page, '[data-action="accept-major"][data-id="m1-nebula"]');
await click(page, '[data-action="deliver"][data-id="m:m1-nebula"]');
await click(page, '[data-action="complete"][data-id="m:m1-nebula"]');
st = await state(page);
check('contrat majeur : la nébuleuse est débloquée', st.save.sectors.unlocked.includes('nebula') && st.save.contracts.majorsDone.includes('m1-nebula'));
await shot('major-done');

// ---------------------------------------------------------------- 4. atelier : amélioration du vaisseau
await app(() => window.__spacetrash.devAddStock(300, true));
await goPanel('workshop');
await click(page, '[data-action="ship-up"][data-branch="cargo"]');
await click(page, '[data-action="ship-up"][data-branch="cargo"]');
st = await state(page);
check('soute améliorée jusqu’au plafond de l’atelier niveau 1 (niv. 2)', st.save.ship.levels.cargo === 2);
check('plafond : troisième amélioration verrouillée par l’atelier', await page.locator('[data-action="ship-up"][data-branch="cargo"]').isDisabled());
await shot('workshop');

// ---------------------------------------------------------------- 5. nébuleuse : dangers, rapatriement d'urgence
await app(() => window.__spacetrash.devAddCredits(5000));
await goPanel('map');
await click(page, '[data-action="launch"][data-sector="nebula"]');
await sleep(500);
const nz = await app(() => { const l = window.__spacetrash.debugState.sim.level; return { rad: l.radiation[0], ele: l.electric[0], res: [...new Set(l.deposits.map((d) => d.res))] }; });
check('la nébuleuse a ses zones de radiation et courants', !!nz.rad && !!nz.ele && nz.res.every((r) => ['ice', 'crystal'].includes(r)), nz.res.join(','));
await tele(nz.rad.x, nz.rad.y);
await app(() => { const s = window.__spacetrash.debugState.sim; s.cargo.set({ ice: 4 }); });
await until(page, (x) => x.sim.hull < x.sim.hullMax, 20000);
st = await state(page);
check('la radiation use la coque', st.sim.hull < st.sim.hullMax);
await shot('radiation');
await tele(nz.rad.x, nz.rad.y + nz.rad.r + 400);
const iceBefore = (await state(page)).save.stock.ice;
await click(page, '#btnPause');
check('pause : écran de pause avec rapatriement', (await state(page)).screen === 'pause' && (await page.locator('[data-action="emergency"]').count()) === 1);
await click(page, '[data-action="emergency"]');
check('confirmation avant le rapatriement', (await page.locator('[data-action="emergency"]').textContent()).includes('Confirmer'));
await click(page, '[data-action="emergency"]');
await until(page, (x) => x.screen === 'summary');
st = await state(page);
check('rapatriement d’urgence : cargaison perdue, stock et progression conservés', st.screen === 'summary' && st.save.stock.ice === iceBefore && st.save.buildings.office === 1);
await click(page, '[data-action="station"]');

// ---------------------------------------------------------------- 6. raffinerie
await app(() => window.__spacetrash.devAddStock(300, true));
await goPanel('refinery');
await click(page, '[data-action="build"][data-building="refinery"]');
st = await state(page);
check('raffinerie construite', st.save.buildings.refinery === 1);
await app(() => { const a = window.__spacetrash; a.devSetStock('scrap', 40); a.devSetStock('ingots', 20); });
st = await state(page);
const scrapBefore = st.save.stock.scrap;
await click(page, '[data-action="job"][data-recipe="ingots"][data-qty="max"]');
st = await state(page);
check('production lancée : matières réellement consommées', st.save.refinery.jobs.length === 1 && st.save.stock.scrap === scrapBefore - 15, `ferraille ${scrapBefore} → ${st.save.stock.scrap}`);
await shot('refinery');
const ingotsBefore = st.save.stock.ingots;
await app(() => window.__spacetrash.devTick(60));
st = await state(page);
check('production terminée : lingots versés au stock une seule fois', st.save.refinery.jobs.length === 0 && st.save.stock.ingots === ingotsBefore + 5, `lingots ${ingotsBefore} → ${st.save.stock.ingots}`);

// ---------------------------------------------------------------- 7. cimetière, atelier niveau 2, laser, tracteur
await app(() => window.__spacetrash.devAddStock(500, true));
await goPanel('office');
await click(page, '[data-action="accept-major"][data-id="m2-graveyard"]');
await click(page, '[data-action="deliver"][data-id="m:m2-graveyard"]');
await click(page, '[data-action="complete"][data-id="m:m2-graveyard"]');
st = await state(page);
check('contrat majeur 2 : le cimetière est débloqué', st.save.sectors.unlocked.includes('graveyard'));
await goPanel('workshop');
await click(page, '[data-action="build"][data-building="workshop"]');
check('atelier niveau 2', (await state(page)).save.buildings.workshop === 2);
await click(page, '[data-action="eq-buy"][data-eq="laser"]');
await click(page, '[data-action="equip"][data-eq="laser"]');
st = await state(page);
check('laser acheté et équipé', st.save.ship.owned.includes('laser') && st.save.ship.equipped === 'laser');
await click(page, '[data-action="eq-buy"][data-eq="tractor"]');
await click(page, '[data-action="equip"][data-eq="tractor"]');
st = await state(page);
check('un seul outil à la fois (le tracteur remplace le laser)', st.save.ship.equipped === 'tractor');
await shot('equipment');

await goPanel('map');
await click(page, '[data-action="launch"][data-sector="graveyard"]');
await sleep(500);
const gh = await app(() => { const s = window.__spacetrash.debugState.sim; const h = s.heavies.find((x) => !x.unique) ?? s.heavies[0]; return { id: h.id, x: h.x, y: h.y, res: h.res, amount: h.amount }; });
await app((r) => window.__spacetrash.devSetStock(r, 10), gh.res);
const cdBefore = (await state(page)).save.stock[gh.res];
await tele(gh.x, gh.y + 20);
await until(page, (x) => x.sim.held === gh.id, 8000);
check('le tracteur saisit un objet lourd', (await state(page)).sim.held === gh.id);
await app(() => { const s = window.__spacetrash.debugState.sim; s.held.x = s.level.station.x; s.held.y = s.level.station.y + 10; s.ship.x = s.level.station.x; s.ship.y = s.level.station.y; });
await until(page, (x) => x.sim.held === null, 8000);
await sleep(300);
st = await state(page);
check('objet lourd ramené à la station : récupéré une fois', st.save.stock[gh.res] === cdBefore + gh.amount, `${gh.res} ${cdBefore} → ${st.save.stock[gh.res]} (+${gh.amount})`);
await quitRun();

await goPanel('workshop');
await click(page, '[data-action="equip"][data-eq="laser"]');
await goPanel('map');
await click(page, '[data-action="launch"][data-sector="graveyard"]');
await sleep(500);
const gw = await app(() => { const w = window.__spacetrash.debugState.sim.wrecks.find((x) => !x.unique); return { x: w.x, y: w.y, r: w.r }; });
await tele(gw.x, gw.y + gw.r + 40);
await until(page, (x) => x.sim.used >= 3, 20000);
st = await state(page);
check('le laser démantèle l’épave et récupère ses composants', st.sim.used >= 3, JSON.stringify(st.sim.cargo));
await shot('laser');
await quitRun();

// ---------------------------------------------------------------- 8. contrat majeur 3, hangar, drone
await app(() => window.__spacetrash.devAddStock(800, true));
await goPanel('office');
await click(page, '[data-action="accept-major"][data-id="m3-drone"]');
await click(page, '[data-action="deliver"][data-id="m:m3-drone"]');
await click(page, '[data-action="complete"][data-id="m:m3-drone"]');
st = await state(page);
check('licence de drone obtenue : le hangar peut être construit', st.save.flags.hangarUnlocked);
await goPanel('hangar');
await click(page, '[data-action="build"][data-building="hangar"]');
await click(page, '[data-action="drone-build"]');
st = await state(page);
check('hangar construit et drone fabriqué', st.save.buildings.hangar === 1 && st.save.drone.built && st.save.flags.droneBuilt);
await click(page, '[data-action="drone-launch"]');
st = await state(page);
check('mission de drone lancée dans un secteur déjà exploré', st.save.drone.status === 'working', `${st.save.drone.sector}/${st.save.drone.resource}`);
await shot('drone');
await app(() => window.__spacetrash.devTick(400));
st = await state(page);
check('le drone revient plein, plafonné à sa capacité', st.save.drone.status === 'returned' && Object.values(st.save.drone.cargo).reduce((a, b) => a + b, 0) === 20);
const dr = st.save.drone.resource;
await app((r) => window.__spacetrash.devSetStock(r, 5), dr);
const stockDr = (await state(page)).save.stock[dr];
await goPanel('hangar');
await click(page, '[data-action="drone-collect"]');
st = await state(page);
check('cargaison du drone vidée dans l’entrepôt', st.save.drone.status === 'idle' && st.save.stock[dr] === stockDr + 20);

// ---------------------------------------------------------------- 9. projet final
await app(() => window.__spacetrash.devAddStock(1000, true));
await app(() => window.__spacetrash.devAddCredits(10000));
await app(() => window.__spacetrash.devBuildings());
await goPanel('office');
await click(page, '[data-action="accept-major"][data-id="m4-relay"]');
await click(page, '[data-action="deliver"][data-id="m:m4-relay"]');
await click(page, '[data-action="complete"][data-id="m:m4-relay"]');
st = await state(page);
check('contrat majeur 4 : chantier du relais ouvert', st.save.flags.projectOpen);
await goPanel('project');
await shot('project');
check('relais non constructible avant d’avoir tout versé', await page.locator('[data-action="project-build"]').isDisabled());
for (const key of ['ingots', 'cells', 'techparts', 'cores', 'credits']) await click(page, `[data-action="project-give"][data-key="${key}"]`);
st = await state(page);
check('contributions versées (matières et crédits)', st.save.project.contrib.ingots === 60 && st.save.project.contrib.credits === 3000);
await click(page, '[data-action="project-build"]');
st = await state(page);
check('relais orbital construit : écran de réussite', st.save.project.done && st.screen === 'success');
await shot('success');
await click(page, '[data-action="success-continue"]');
st = await state(page);
check('on peut continuer après la réussite', st.screen === 'station' && st.save.project.successSeen);
await shot('station-final');

// ---------------------------------------------------------------- 10. rechargement final
const finalSave = JSON.stringify((await state(page)).save);
await page.reload();
await page.waitForFunction(() => window.__spacetrash);
st = await state(page);
check('rechargement : progression identique, sans duplication', JSON.stringify(st.save) === finalSave);
check('aucune erreur console', errors.length === 0, errors.join(' | '));
await browser.close();
process.exit(summary());
