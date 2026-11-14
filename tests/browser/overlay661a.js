// Phase 6G.6.1 end-to-end harness (real lesson, no injected content) (outside the repository). The fixture lesson "Porovnanie veľkostí — test" is injected
// only into this test browser; it is not part of the application.
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const S = __dirname, ROOT = require('./env').ROOT, OUT = require('./env').out('fix661a');
fs.mkdirSync(OUT, { recursive: true });
const PORT = Number(process.env.PORT || 8881);
const server = http.createServer((q, r) => { const u = decodeURIComponent(q.url.split('?')[0]); fs.readFile(path.join(ROOT, u === '/' ? 'index.html' : u), (e, d) => { if (e) { r.writeHead(404); r.end(); } else r.end(d); }); }).listen(PORT);
const lesson = (steps, title = 'Porovnanie veľkostí — test') => `window.LearnContent.topics.push({"id":"test-svetlo","title":"Testovacia lekcia","description":"Len na testovanie.","minutes":1}); window.LearnContent.lessons.push(${JSON.stringify({ id: 'test-svetlo', title, objective: 'Len na testovanie.', limitation: 'Len na testovanie.', steps })});`;
const REVEAL = { kind: 'size-comparison', start: { pair: ['jupiter', 'earth'] }, reveal: { pair: ['sun', 'jupiter'] } };
const FIXTURE = lesson([
  { id: 'uvod', type: 'intro', title: 'Jupiter verzus Slnko — test', text: 'Len na testovanie.' },
  { id: 'odhalenie', type: 'experiment', title: 'Jupiter verzus Slnko — test', text: 'Len na testovanie: dočasný krok. Nie je to obsah lekcie.', experiment: REVEAL },
  { id: 'zaver', type: 'summary', title: 'Koniec testu', ideas: ['Len na testovanie.'], text: 'Len na testovanie.' }], 'Jupiter verzus Slnko — test');
const PLAIN = lesson([
  { id: 'uvod', type: 'intro', title: 'Porovnanie veľkostí — test', text: 'Len na testovanie.' },
  { id: 'porovnanie', type: 'experiment', title: 'Porovnanie veľkostí — test', text: 'Len na testovanie.', experiment: { kind: 'size-comparison' } },
  { id: 'zaver', type: 'summary', title: 'Koniec testu', ideas: ['Len na testovanie.'], text: 'Len na testovanie.' }]);
let failures = 0, passes = 0; const notes = [];
const check = (label, ok, detail = '') => { ok ? passes++ : failures++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? '  — ' + String(detail).slice(0, 600) : ''}`); };
async function open(browser, w, h, options = {}) {
  const context = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: !!options.touch, isMobile: false, reducedMotion: options.reduced ? 'reduce' : 'no-preference' });
  const pg = await context.newPage(), errors = [];
  pg.on('pageerror', e => errors.push(e.message)); pg.on('console', m => { if (m.type() === 'error' || /THREE\.WebGL|shader/i.test(m.text())) errors.push('console: ' + m.text()); });
  const patch = options.patch === undefined ? FIXTURE : options.patch;
  if (patch) await pg.route('**/learn-content.sk.js', async r => { const res = await r.fetch(); r.fulfill({ response: res, body: (await res.text()) + '\n' + patch }); });
  await pg.goto(`http://localhost:${PORT}/`); await pg.waitForTimeout(600);
  if (options.boot === false) return { pg, errors, context };
  await pg.fill('#activation-code', 'NGV-2025'); await pg.evaluate(() => checkCode()); await pg.waitForTimeout(2200);
  // Test-only hook: remembers the stage scene and camera the stage renders.
  await pg.evaluate(() => { const render = renderer.render.bind(renderer); renderer.render = (sc, cam) => { if (sc !== scene) window.__stage = { scene: sc, camera: cam }; return render(sc, cam); }; });
  return { pg, errors, context };
}
const settle = async pg => { await pg.waitForTimeout(200); await pg.waitForFunction(() => !cameraTransition, null, { timeout: 20000 }).catch(() => {}); await pg.waitForTimeout(150); };
const enterFixture = pg => pg.evaluate(() => { Learn.enter(); [...document.querySelectorAll('.learn-topic')].find(c => c.querySelector('h3').textContent === 'Testovacia lekcia').querySelector('button').click(); });
const toComparison = async pg => { await enterFixture(pg); await pg.evaluate(() => document.querySelector('.learn-footer .learn-primary').click()); await pg.waitForTimeout(400); };
const idle = pg => pg.waitForFunction(() => !comparisonStage.state().busy, null, { timeout: 10000 });
const PRIMARY = '[data-focus="comparison-primary"]', BACK = '[data-focus="comparison-back"]';
const ui = pg => pg.evaluate(() => {
  const p = document.querySelector('[data-focus="comparison-primary"]'), b = document.querySelector('[data-focus="comparison-back"]'), panel = document.getElementById('learn-root').getBoundingClientRect();
  const inPanel = el => { const r = el.getBoundingClientRect(); return r.height >= 44 && r.top >= panel.top - 1 && r.bottom <= panel.bottom + 1 && r.bottom <= innerHeight; };
  return { primary: p.textContent, pressed: p.getAttribute('aria-pressed'), primaryBusy: p.getAttribute('aria-disabled'), primaryDisabled: p.disabled, primaryVisible: inPanel(p),
    back: b.hidden ? null : b.textContent, backVisible: !b.hidden && inPanel(b), focus: document.activeElement?.dataset?.focus || document.activeElement?.id || document.activeElement?.tagName,
    info: document.querySelector('.learn-comparison-info').textContent, note: document.querySelector('.learn-comparison-note').textContent, noteVisible: getComputedStyle(document.querySelector('.learn-comparison-note')).visibility !== 'hidden',
    panelHeight: Math.round(document.getElementById('learn-root').getBoundingClientRect().height),
    live: document.querySelector('.learn-live').textContent, stage: comparisonStage.state(), heading: document.getElementById('learn-heading').textContent };
});
const measure = pg => pg.evaluate(() => {
  comparisonStage.render();
  const { scene: sc, camera: cam } = window.__stage; cam.updateMatrixWorld();
  const project = v => { const p = v.clone().project(cam); return { x: (p.x + 1) / 2 * innerWidth, y: (1 - p.y) / 2 * innerHeight }; };
  const disc = m => { const c = project(m.position), e = project(m.position.clone().add(new THREE.Vector3(m.scale.x, 0, 0))); return { id: m.userData.id || 'ref', x: c.x, y: c.y, r: Math.hypot(e.x - c.x, e.y - c.y), visible: m.visible }; };
  const meshes = sc.children.filter(c => c.isMesh), bodies = meshes.filter(m => m.userData.id).map(disc), refs = meshes.filter(m => m.name === 'comparison-reference-earth').map(disc);
  const rect = el => el.getBoundingClientRect();
  const ui = ['planet-nav', 'side-ui', 'learn-root'].map(id => document.getElementById(id)).filter(e => !e.hidden && getComputedStyle(e).visibility !== 'hidden').map(rect);
  const overlap = (a, b) => a.left < b.right - 0.5 && a.right > b.left + 0.5 && a.top < b.bottom - 0.5 && a.bottom > b.top + 0.5;
  const box = d => ({ left: d.x - d.r, right: d.x + d.r, top: d.y - d.r, bottom: d.y + d.r });
  const inView = b => b.left >= -0.5 && b.top >= -0.5 && b.right <= innerWidth + 0.5 && b.bottom <= innerHeight + 0.5;
  return { bodies, refs, clear: [...bodies, ...refs].every(d => inView(box(d)) && !ui.some(u => overlap(box(d), u))) };
});
const MAIN_STATE = () => {
  const r = v => v.toArray().map(x => +x.toFixed(9)).join();
  return { camera: r(camera.position), target: r(controls.target), controls: controls.enabled, playing: areOrbitsActive, speed: simulationSpeed, orbits: areOrbitLinesVisible, orbitLines: orbitLines.map(l => l.visible).join(),
    planets: planets.map(p => `${r(p.position)}:${p.rotation.y.toFixed(9)}:${p.material.uuid}`).join('|'), moons: satellites.map(m => `${r(m.position)}:${m.rotation.y.toFixed(9)}:${m.material.uuid}`).join('|'), children: scene.children.length };
};
const RATIO = 139822 / 12742, SUN = 1391400 / 139822;
const START = 'Odhaľ veľkosť Slnka', BACKTO = 'Späť k Jupiteru';
const INTRO = 'Jupiter je najväčšia planéta našej slnečnej sústavy. Ale aký veľký je v porovnaní so Slnkom?';
const SENT = 'Slnko má približne 10-krát väčší priemer ako Jupiter.';
const LIVE_SUN = 'Slnko má približne desaťkrát väčší priemer ako Jupiter. Porovnávame priemery, nie objemy.';
const LIVE_JUP = 'Jupiter má približne jedenásťkrát väčší priemer ako Zem. Porovnávame priemery, nie objemy.';
// Test-only clock: freezes performance.now in this page so transition progress is deterministic.
const freeze = pg => pg.evaluate(() => { window.__realNow = window.__realNow || performance.now.bind(performance); window.__t = window.__realNow(); performance.now = () => window.__t; });
const advance = (pg, ms) => pg.evaluate(ms => { window.__t += ms; comparisonStage.update?.(); comparisonStage.render(); }, ms);
const thaw = pg => pg.evaluate(() => { performance.now = window.__realNow; });
const liveCount = pg => pg.evaluate(() => { window.__live = []; new MutationObserver(() => { const t = document.querySelector('.learn-live').textContent; if (t) window.__live.push(t); }).observe(document.querySelector('.learn-live'), { childList: true, characterData: true, subtree: true }); });

const BETEL = { kind: 'size-comparison', start: { pair: ['sun', 'jupiter'] }, reveal: { pair: ['betelgeuse', 'sun'] } };
const BFIX = lesson([
  { id: 'uvod', type: 'intro', title: 'Betelgeuze — test', text: 'Len na testovanie.' },
  { id: 'odhalenie', type: 'experiment', title: 'Betelgeuze — test', text: 'Len na testovanie: dočasný krok. Nie je to obsah lekcie.', experiment: BETEL },
  { id: 'zaver', type: 'summary', title: 'Koniec testu', ideas: ['Len na testovanie.'], text: 'Len na testovanie.' }], 'Betelgeuze — test');
const SHOW = 'Odhaľ Betelgeuze', BACKS = 'Späť k Slnku';
const INTRO_B = 'Už vieš, že Slnko je približne 10-krát širšie ako Jupiter. Čo sa stane, keď ho porovnáme s obrovskou hviezdou Betelgeuze?';
const RESULT_B = 'Betelgeuze má podľa jedného odhadu približne 760-krát väčší priemer ako Slnko.';
const DETAIL_B = 'Vedci jej veľkosť odhadujú. Podľa použitého odhadu je jej priemer približne 700 až 900-krát väčší než priemer Slnka.';
const LIVE_B = 'Betelgeuze má podľa jedného odhadu približne 760-krát väčší priemer ako Slnko. Značka označuje skutočnú polohu Slnka, nie jeho veľkosť.';
const LIVE_BACK = 'Opäť vidíš Slnko a Jupiter. Slnko má približne 10-krát väčší priemer ako Jupiter.';
// Extra facts: explanation visibility, the stage's Sun marker, Betelgeuse on stage.
const extra = pg => pg.evaluate(() => { const d = [...document.querySelectorAll('.learn-experiment-details .learn-note')].find(p => p.textContent.startsWith('Vedci')); const mk = document.querySelector('.comparison-sun-marker'), o = document.getElementById('comparison-overlay');
  const st = window.__stage && window.__stage.scene; return { detail: d ? d.textContent : null, detailVisible: d ? getComputedStyle(d).visibility !== 'hidden' : null,
  marker: !!mk && !o.hidden && !mk.hidden && getComputedStyle(mk).visibility !== 'hidden', betelgeuse: !!st && st.children.some(c => c.userData && c.userData.id === 'betelgeuse' && comparisonStage.active) }; });
const toB = async pg => { await toComparison(pg); };

const ORB = { kind: 'size-comparison', start: { orbits: 'sun' }, reveal: { orbits: 'betelgeuse' } };
const OFIX = lesson([
  { id: 'uvod', type: 'intro', title: 'Dráhy a Betelgeuze — test', text: 'Len na testovanie.' },
  { id: 'drahy', type: 'experiment', title: 'Dráhy a Betelgeuze — test', text: 'Len na testovanie: dočasný krok. Nie je to obsah lekcie.', experiment: ORB },
  { id: 'zaver', type: 'summary', title: 'Koniec testu', ideas: ['Len na testovanie.'], text: 'Len na testovanie.' }], 'Dráhy a Betelgeuze — test');
const SHOW_O = 'Ukáž Betelgeuze', HIDE_O = 'Skryť Betelgeuze';
const INTRO_O = 'Kruhy ukazujú stredné vzdialenosti dráh planét od Slnka v skutočnom pomere.';
const RESULT_O = 'Betelgeuze by siahala asi do 3,6 AU – ďalej ako dráha Marsu, ale nie až k dráhe Jupitera (5,2 AU).';
const Q_O = 'Keby bola Betelgeuze na mieste Slnka, kam až by siahala?', SHORT_O = 'Merkúr až Mars: vnútri Betelgeuze. Jupiter: mimo.';
const LIVE_O = 'Dráhy Merkúra, Venuše, Zeme a Marsu by boli vnútri Betelgeuze. Dráha Jupitera by zostala mimo nej.', LIVE_OBACK = 'Opäť vidíš len dráhy planét okolo Slnka.';
// Orbit view and panel facts: star and band, Jupiter's orbit on screen, and whether the note and button are visible in the panel.
const OFACTS = pg => pg.evaluate(() => {
  comparisonStage.render();
  const { scene: sc, camera: cam } = window.__stage; cam.updateMatrixWorld();
  const proj = v => { const p = v.clone().project(cam); return { x: (p.x + 1) / 2 * innerWidth, y: (1 - p.y) / 2 * innerHeight }; };
  const g = sc.children.find(c => c.name === 'comparison-orbits'), rings = g ? g.children.filter(m => m.renderOrder === 3) : [], band = g ? g.children.find(m => m.renderOrder === 2) : null;
  const b = sc.children.find(c => c.isMesh && c.userData.id === 'betelgeuse');
  const J = rings[4], c = J ? proj(J.position) : null, r = J ? J.geometry.parameters.outerRadius : 0, jBox = c ? { left: c.x - r, right: c.x + r, top: c.y - r, bottom: c.y + r } : null;
  const panel = document.getElementById('learn-root'), pr = panel.getBoundingClientRect(), nav = document.getElementById('planet-nav').getBoundingClientRect();
  const overlap = (a, q) => a.left < q.right - 0.5 && a.right > q.left + 0.5 && a.top < q.bottom - 0.5 && a.bottom > q.top + 0.5;
  const inPanel = el => { const q = el.getBoundingClientRect(); return getComputedStyle(el).visibility !== 'hidden' && q.height > 2 && q.top >= pr.top - 0.5 && q.bottom <= pr.bottom + 0.5 && q.bottom <= innerHeight && q.right <= innerWidth + 0.5; };
  const note = document.querySelector('.learn-comparison-note'), btn = document.querySelector('[data-focus="comparison-primary"]');
  const detail = [...document.querySelectorAll('.learn-experiment-details .learn-note')].find(p => p.textContent.startsWith('Podľa použitého odhadu'));
  return { orbits: comparisonStage.state().orbits, groupVisible: !!g && g.visible, star: b ? { visible: b.visible, opacity: b.material.opacity, r: b.scale.x } : null, band: band ? { visible: band.visible, opacity: band.material.opacity } : null, ringRadii: rings.map(m => (m.geometry.parameters.innerRadius + m.geometry.parameters.outerRadius) / 2),
    jupiterInWindow: !!jBox && jBox.left >= -0.5 && jBox.top >= -0.5 && jBox.right <= innerWidth + 0.5 && jBox.bottom <= innerHeight + 0.5, jupiterHitsPanel: !!jBox && overlap(jBox, pr), jupiterHitsNav: !!jBox && overlap(jBox, nav),
    noteText: note.textContent, noteInPanel: inPanel(note), buttonInPanel: inPanel(btn), panelScroll: panel.scrollTop + (panel.querySelector('.learn-body')?.scrollTop ?? 0), overflowX: document.documentElement.scrollWidth > innerWidth,
    detail: detail ? detail.textContent : null, detailVisible: detail ? getComputedStyle(detail).visibility !== 'hidden' : null, overlayView: document.getElementById('comparison-overlay').dataset.view };
});
const ratiosOk = o => { const AU = [0.38709927, 0.72333566, 1.00000261, 1.52371034, 5.20288700]; return o.ringRadii.length === 5 && o.ringRadii.every((r, i) => Math.abs(r / o.ringRadii[4] - AU[i] / AU[4]) < 1e-9); };

const TITLES = ['Vesmírni obri', 'Planéty a ich veľkosť', 'Koľko Zemí?', 'Jupiter a Slnko', 'Hviezda Betelgeuze', 'Kam by siahala?', 'Čo by bolo vnútri?', 'Priemer alebo objem?', 'Spoznal si vesmírnych obrov!'];
const heading = pg => pg.evaluate(() => document.getElementById('learn-heading')?.textContent);
const next = async pg => { await pg.evaluate(() => document.querySelector('.learn-footer .learn-primary').click()); await pg.waitForTimeout(350); };
const back = async pg => { await pg.evaluate(() => [...document.querySelectorAll('.learn-footer button')].find(b => b.textContent === 'Späť').click()); await pg.waitForTimeout(350); };
const answer = async (pg, id) => { await pg.evaluate(id => { const i = document.querySelector(`.learn-answer input[value="${id}"]`); i.checked = true; i.dispatchEvent(new Event('change', { bubbles: true })); document.querySelector('[data-check]').click(); }, id); await pg.waitForTimeout(200);
  return pg.evaluate(() => ({ feedback: document.querySelector('.learn-feedback')?.textContent ?? '', next: document.querySelector('.learn-footer .learn-primary').disabled, retry: [...document.querySelectorAll('button')].some(b => b.textContent === 'Skúsiť znova') })); };
const retry = pg => pg.evaluate(() => [...document.querySelectorAll('button')].find(b => b.textContent === 'Skúsiť znova').click());
const openLesson = async pg => { await pg.evaluate(() => { Learn.enter(); [...document.querySelectorAll('.learn-topic')].find(c => c.querySelector('h3').textContent === 'Vesmírni obri').querySelector('button').click(); }); await pg.waitForTimeout(400); };
const shot = (pg, name) => pg.screenshot({ path: path.join(OUT, name) });
// Computed visibility of every overlay group, and overlap between visible overlay texts.
const OVL = () => {
  if (typeof comparisonStage !== 'undefined' && comparisonStage.active) comparisonStage.render();
  const o = document.getElementById('comparison-overlay');
  const vis = el => { if (!el || o.hidden) return false; for (let e = el; e && e !== document.body; e = e.parentElement) { const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden' || e.hidden && cs.display === 'none') return false; } const r = el.getBoundingClientRect(); return r.width > 1 && r.height > 1 && getComputedStyle(el).visibility !== 'hidden'; };
  const textRects = root => [...root.querySelectorAll('li, p, span, strong, div')].filter(e => e.children.length === 0 && e.textContent.trim() && vis(e) && !e.classList.contains('comparison-word')).map(e => e.getBoundingClientRect());
  const list = o.querySelector('.comparison-list'), markers = o.querySelector('.comparison-markers'), note = o.querySelector('.comparison-note'), pair = o.querySelector('.comparison-pair'), orbits = o.querySelector('.comparison-orbits');
  const lineupItems = [...list.querySelectorAll('li')].filter(vis).length, markerItems = [...markers.querySelectorAll('span')].filter(vis).length;
  const orbitTexts = textRects(orbits), others = [list, markers, note, pair].flatMap(textRects);
  const overlap = (a, b) => a.left < b.right - 0.5 && a.right > b.left + 0.5 && a.top < b.bottom - 0.5 && a.bottom > b.top + 0.5;
  const legendItems = [...orbits.querySelectorAll('.comparison-orbit-legend li')].filter(vis).map(li => li.textContent);
  return { view: o.dataset.view ?? null, mode: o.dataset.mode ?? null, lineupItemsVisible: lineupItems, lineupMarkersVisible: markerItems, lineupNoteVisible: vis(note), pairVisible: textRects(pair).length, orbitTextsVisible: orbitTexts.length,
    orbitLegend: legendItems, overlapOrbitVsOthers: orbitTexts.some(a => others.some(b => overlap(a, b))), listDisplay: getComputedStyle(list).display };
};
const ovl = pg => pg.evaluate(`(${OVL})()`);
const walkTo = async (pg, n) => { for (let i = 0; i < 14 && (await pg.evaluate(() => Learn.state.step)) < n; i++) { const st = await pg.evaluate(() => ({ step: Learn.state.step, locked: document.querySelector('.learn-footer .learn-primary')?.disabled })); if (st.locked) await answer(pg, await pg.evaluate(s => LearnContent.lessons.find(l => l.id === 'obri').steps[s].correct, st.step)); await next(pg); } };
const backTo = async (pg, n) => { for (let i = 0; i < 14 && (await pg.evaluate(() => Learn.state.step)) > n; i++) await back(pg); };
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  for (const [w, h] of [[390, 667], [390, 844], [844, 390], [1366, 768], [1920, 1080]]) {
    const tag = `${w}×${h}`, narrow = w < 900 || h < 500, touch = w < 500, { pg, errors, context } = await open(browser, w, h, { touch, patch: null });
    const press = async () => { if (touch) await pg.tap(PRIMARY, { force: true }); else await pg.click(PRIMARY, { force: true }); };
    const shot = n => pg.screenshot({ path: path.join(OUT, `${n}-${w}x${h}.png`) });
    await openLesson(pg);
    for (let round = 1; round <= 2; round++) {
      await walkTo(pg, 1); await pg.waitForTimeout(300);
      let l = await ovl(pg);
      check(`${tag} round ${round} step 2: lineup labels shown (${l.mode} mode: ${l.lineupItemsVisible} labels${l.mode === 'numbers' ? `, ${l.lineupMarkersVisible} numbers` : ''}), no orbit texts`, l.view === 'lineup' && l.lineupItemsVisible === 8 && (l.mode !== 'numbers' || l.lineupMarkersVisible === 8) && l.orbitTextsVisible === 0 && (narrow ? l.mode === 'numbers' : l.mode === 'names'), JSON.stringify(l));
      if (round === 1 && w === 390 && h === 667) await shot('01-step2-lineup');
      if (round === 2 && w === 390 && h === 667) await shot('07-lineup-restored-after-back');
      await press(); await idle(pg); await press(); await idle(pg); // Earth–Jupiter, then 11 Earths.
      await walkTo(pg, 3); await pg.waitForTimeout(300); await press(); await idle(pg); // Jupiter → Sun.
      await walkTo(pg, 4); await pg.waitForTimeout(300); await press(); await idle(pg); // Sun → Betelgeuse.
      await walkTo(pg, 5); await pg.waitForTimeout(400);
      let b = await ovl(pg), of = await OFACTS(pg);
      check(`${tag} round ${round} step 6 before the reveal: lineup legend, numbers and note fully hidden (computed); no pair texts; only the orbit legend; no overlaps`, b.view === 'orbits' && b.mode === null && b.lineupItemsVisible === 0 && b.lineupMarkersVisible === 0 && !b.lineupNoteVisible && b.pairVisible === 0 && b.orbitTextsVisible > 0 && !b.overlapOrbitVsOthers && b.listDisplay !== 'grid' && of.jupiterInWindow && !of.jupiterHitsPanel && !of.jupiterHitsNav && !of.star.visible, JSON.stringify({ b, j: [of.jupiterInWindow, of.jupiterHitsPanel] }));
      if (round === 1 && w === 390 && h === 667) await shot('02-step6-before');
      await press(); await idle(pg); await pg.waitForTimeout(200);
      const a = await ovl(pg); of = await OFACTS(pg);
      const centre = await pg.evaluate(() => { const c = document.querySelector('.comparison-orbit-centre').getBoundingClientRect(), g = window.__stage.scene.children.find(x => x.name === 'comparison-orbits'), J = g.children.filter(m => m.renderOrder === 3)[4], band = g.children.find(m => m.renderOrder === 2);
        return { err: Math.hypot(c.left + c.width / 2 - J.position.x, c.top + c.height / 2 + J.position.y), bandIn: band.geometry.parameters.innerRadius, bandOut: band.geometry.parameters.outerRadius, jr: (J.geometry.parameters.innerRadius + J.geometry.parameters.outerRadius) / 2, bandOpacity: band.material.opacity }; });
      const bandOk = Math.abs(centre.bandIn / centre.jr - 3.264628017195435 / 5.202887) < 1e-9 && Math.abs(centre.bandOut / centre.jr - 4.092411189646699 / 5.202887) < 1e-9 && centre.bandOpacity > 0.2;
      check(`${tag} round ${round} step 6 revealed: still no stale legend; orbit legend incl. Betelgeuse line; Jupiter's orbit visible; Sun symbol centred (${centre.err.toFixed(3)} px); uncertainty band 3.265–4.092 AU`, a.lineupItemsVisible === 0 && a.lineupMarkersVisible === 0 && !a.lineupNoteVisible && a.pairVisible === 0 && !a.overlapOrbitVsOthers && a.orbitLegend.some(t => t.startsWith('Betelgeuze: polomer asi 3,6 AU')) && of.jupiterInWindow && !of.jupiterHitsPanel && of.star.opacity === 1 && centre.err < 0.5 && bandOk, JSON.stringify({ a, centre }));
      if (round === 1) { if (w === 390 && h === 667) await shot('03-step6-revealed'); else if (w !== 1920) await shot('04-step6-revealed'); }
      if (round === 1) await backTo(pg, 1); // Back to the lineup for round 2.
    }
    // Leave and re-enter: the lineup and orbit views are both still correct.
    await pg.evaluate(() => Learn.leave()); await pg.waitForTimeout(200); await openLesson(pg);
    await walkTo(pg, 1); await pg.waitForTimeout(300); const re1 = await ovl(pg);
    await walkTo(pg, 5); await pg.waitForTimeout(400); const re2 = await ovl(pg);
    check(`${tag} leave and re-enter: lineup labels return (${re1.lineupItemsVisible}), then the orbit view has no stale legend`, re1.lineupItemsVisible === 8 && re2.view === 'orbits' && re2.lineupItemsVisible === 0 && re2.lineupMarkersVisible === 0 && !re2.overlapOrbitVsOthers, JSON.stringify({ re1, re2 }));
    await pg.evaluate(() => Learn.leave());
    check(`${tag}: no JS or WebGL errors`, errors.length === 0, errors.join('; '));
    await context.close();
  }
  await browser.close(); server.close();
  console.log(`${passes} passed, ${failures} failed`);
  process.exit(failures ? 1 : 0);
})();
