// Phase 6G.6.1 end-to-end harness (real lesson, no injected content) (outside the repository). The fixture lesson "Porovnanie veľkostí — test" is injected
// only into this test browser; it is not part of the application.
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const S = __dirname, ROOT = require('./env').ROOT, OUT = require('./env').out('e2e661-shots');
fs.mkdirSync(OUT, { recursive: true });
const PORT = Number(process.env.PORT || 8876);
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
  await pg.route('**/three.min.js', r => r.fulfill({ path: require('./env').vendor('three.min.js') }));
  await pg.route('**/OrbitControls.js', r => r.fulfill({ path: require('./env').vendor('OrbitControls.js') }));
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
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  // 0. The application's own content validation (runs at start-up; an invalid lesson throws).
  {
    const { pg, errors, context } = await open(browser, 1366, 768, { patch: null });
    const v = await pg.evaluate(() => { const l = LearnContent.lessons.find(x => x.id === 'obri'); return { topics: LearnContent.topics.map(t => t.id), lessons: LearnContent.lessons.map(x => x.id), steps: l.steps.map(s => `${s.id}:${s.type}`), unique: new Set(l.steps.map(s => s.id)).size === l.steps.length,
      questions: l.steps.filter(s => s.type === 'question').map(s => [s.options.length, s.options.filter(o => o.id === s.correct).length, !!s.correctFeedback && !!s.incorrectFeedback]), experiments: l.steps.filter(s => s.type === 'experiment').map(s => [JSON.stringify(s.experiment), s.demo === undefined]),
      learnActive: !!window.Learn, minutes: LearnContent.topics.find(t => t.id === 'obri').minutes }; });
    check('content validation: the app starts with no "Invalid lesson" error (the real validator ran)', errors.length === 0 && v.learnActive, errors.join('; '));
    // Phase 6H.6.3 activation candidate: "pohyb" now has its lesson (until 6H.6.2: "pohyb has no lesson", five lessons).
    check('topics: obri fifth, pohyb sixth; lessons: four existing + obri + pohyb', v.topics.join() === 'nasa-slnecna-sustava,slnko,planety,zem-mesiac,obri,pohyb' && v.lessons.join() === 'nasa-slnecna-sustava,slnko,planety,zem-mesiac,obri,pohyb' && v.minutes === 9, JSON.stringify({ topics: v.topics, lessons: v.lessons }));
    check('lesson: nine steps in the approved order and types, unique IDs', v.steps.join() === 'uvod:intro,planety:experiment,otazka-zeme:question,slnko:experiment,betelgeuze:experiment,drahy:experiment,otazka-drahy:question,otazka-priemer:question,zaver:summary' && v.unique, v.steps.join());
    check('questions: three options each, exactly one correct, both feedback texts', v.questions.length === 3 && v.questions.every(q => q[0] === 3 && q[1] === 1 && q[2]), JSON.stringify(v.questions));
    check('experiments: the four approved configurations, none with demo', JSON.stringify(v.experiments.map(e => e[0])) === JSON.stringify([JSON.stringify({ kind: 'size-comparison' }), JSON.stringify({ kind: 'size-comparison', start: { pair: ['jupiter', 'earth'] }, reveal: { pair: ['sun', 'jupiter'] } }), JSON.stringify({ kind: 'size-comparison', start: { pair: ['sun', 'jupiter'] }, reveal: { pair: ['betelgeuse', 'sun'] } }), JSON.stringify({ kind: 'size-comparison', start: { orbits: 'sun' }, reveal: { orbits: 'betelgeuse' } })]) && v.experiments.every(e => e[1]));
    await context.close();
  }
  // 1. The whole lesson at five viewports (touch on phones, keyboard on 1366).
  for (const [w, h] of (process.env.ONLY ? [[1366, 768]] : [[1366, 768], [1920, 1080], [390, 844], [390, 667], [844, 390]])) {
    const tag = `${w}×${h}`, touch = w < 500, key = w === 1366, { pg, errors, context } = await open(browser, w, h, { touch, patch: null });
    const press = async () => { if (touch) await pg.tap(PRIMARY, { force: true }); else if (key) { await pg.focus(PRIMARY); await pg.keyboard.press('Enter'); } else await pg.click(PRIMARY, { force: true }); };
    const sm = w === 1366 || (w === 390 && h === 667) ? (n => shot(pg, `${n}-${w}x${h}.png`)) : (async () => {});
    await pg.evaluate(() => { if (areOrbitsActive) toggleOrbit(); simulationSpeed = 2; document.getElementById('simulation-speed').value = '2'; }); await pg.waitForTimeout(200);
    const before = await pg.evaluate(`(${MAIN_STATE})()`);
    await pg.evaluate(() => Learn.enter()); await pg.waitForTimeout(300);
    const cards = await pg.evaluate(() => [...document.querySelectorAll('.learn-topic')].map(c => ({ t: c.querySelector('h3').textContent, text: c.textContent, button: !!c.querySelector('button') })));
    // Phase 6H.6.3 activation candidate: the sixth topic is now the active "Svetlo a vesmírne vzdialenosti" (until 6H.6.2: "Pohyb vo vesmíre", Pripravujeme).
    check(`${tag} topic list: "Vesmírni obri" fifth with its description, ~9 min and a start button; "Svetlo a vesmírne vzdialenosti" sixth, active`, cards[4]?.t === 'Vesmírni obri' && cards[4].text.includes('Porovnaj skutočné veľkosti planét, Slnka a obrovskej hviezdy Betelgeuze.') && cards[4].text.includes('Približne 9 min') && cards[4].button && cards[5]?.t === 'Svetlo a vesmírne vzdialenosti' && cards[5].text.includes('Zisti, ako ďaleko doletí svetlo za sekundu') && cards[5].text.includes('Približne 9 min') && cards[5].button && !/undefined|Pripravujeme/.test(cards[5].text) && cards.length === 6 && cards.slice(0, 4).map(c => c.t).join() === 'Naša slnečná sústava,Slnko – naša hviezda,Spoznaj planéty,Zem a Mesiac', JSON.stringify(cards.map(c => c.t)));
    await sm('01-topics');
    await openLesson(pg);
    let hd = await heading(pg), intro = await pg.evaluate(() => document.getElementById('learn-root').textContent);
    check(`${tag} step 1 intro: title, text, objective and limitation; "Začať"`, hd === TITLES[0] && intro.includes('Poďme ich porovnať v skutočnom pomere veľkostí.') && intro.includes('Porovnáš skutočné veľkosti planét, Slnka a hviezdy Betelgeuze.') && intro.includes('Veľkosť Betelgeuze je len odhad.') && (await pg.evaluate(() => document.querySelector('.learn-footer .learn-primary').textContent)) === 'Začať');
    await sm('02-intro');
    // Step 2: lineup → Earth–Jupiter → 11 Earths.
    await next(pg); await pg.waitForTimeout(300);
    let u = await ui(pg);
    const s2a = u.stage.lineup === 'planets' && u.primary === 'Porovnaj Zem a Jupiter' && (await heading(pg)) === TITLES[1];
    await sm('03-lineup');
    await press(); await idle(pg); await pg.waitForTimeout(150); u = await ui(pg);
    const s2b = u.stage.pair?.join() === 'jupiter,earth' && u.primary === 'Ukáž 11 Zemí' && u.live === 'Jupiter má približne 11-krát väčší priemer ako Zem.';
    await sm('04-earth-jupiter');
    await press(); await idle(pg); await pg.waitForTimeout(150); u = await ui(pg);
    const s2c = u.stage.references === 11 && u.primary === 'Skryť 11 Zemí';
    await sm('05-eleven-earths');
    check(`${tag} step 2: eight-planet lineup → Earth–Jupiter (announced) → 11 Earths`, s2a && s2b && s2c, JSON.stringify({ s2a, s2b, s2c }));
    // Step 3: question 1 (wrong, retry, right).
    await next(pg);
    const q1w = await answer(pg, 'tri'); await retry(pg); await pg.waitForTimeout(150); const q1r = await answer(pg, 'jedenast');
    check(`${tag} step 3 question: stage ended; wrong answer → hint, retry, Next locked; right answer → praise, Next unlocked`, (await heading(pg)) === TITLES[2] && !(await pg.evaluate(() => comparisonStage.active)) && q1w.feedback === 'Skús to znova. Spomeň si na rad Zemí, ktorý si videl pri Jupiteri.' && q1w.next && q1w.retry && q1r.feedback === 'Správne! Jupiter má približne 11-krát väčší priemer ako Zem.' && !q1r.next, JSON.stringify({ q1w, q1r }));
    await sm('06-question');
    // Step 4: Jupiter → Sun.
    await next(pg); await pg.waitForTimeout(300); u = await ui(pg);
    const s4a = u.stage.pair?.join() === 'jupiter,earth' && u.primary === 'Odhaľ veľkosť Slnka' && (await heading(pg)) === TITLES[3];
    await press(); await pg.waitForTimeout(60); const s4busy = (await ui(pg)).primaryBusy === 'true';
    await idle(pg); await pg.waitForTimeout(150); u = await ui(pg);
    check(`${tag} step 4: Jupiter → Sun reveal (busy, then "Späť k Jupiteru", 10× sentence, announced)`, s4a && s4busy && u.stage.pair?.join() === 'sun,jupiter' && u.primary === 'Späť k Jupiteru' && u.live === LIVE_SUN && (!key || u.focus === 'comparison-primary'), JSON.stringify(u.primary));
    await sm('07-sun');
    // Step 5: Sun → Betelgeuse with the Sun marker.
    await next(pg); await pg.waitForTimeout(300); u = await ui(pg);
    const s5a = u.stage.pair?.join() === 'sun,jupiter' && u.primary === 'Odhaľ Betelgeuze' && (await heading(pg)) === TITLES[4];
    await press(); await idle(pg); await pg.waitForTimeout(150); u = await ui(pg); const x5 = await extra(pg);
    check(`${tag} step 5: Sun → Betelgeuse reveal; estimate result, 700–900 explanation, Sun marker, announced`, s5a && u.stage.pair?.join() === 'betelgeuse,sun' && u.primary === 'Späť k Slnku' && u.info === RESULT_B && x5.detailVisible && x5.marker && u.live === LIVE_B);
    await sm('08-betelgeuse');
    // Step 6: orbits.
    await next(pg); await pg.waitForTimeout(300); let o = await OFACTS(pg); u = await ui(pg);
    const s6a = o.orbits === 'sun' && !o.star.visible && u.primary === SHOW_O && o.noteText === Q_O && (await heading(pg)) === TITLES[5];
    await press(); await idle(pg); await pg.waitForTimeout(150); o = await OFACTS(pg); u = await ui(pg);
    check(`${tag} step 6: orbit reveal; short conclusion visible in the panel; diagram (Jupiter radius ${o.ringRadii[4]?.toFixed(1)} px) clear of panel and navigation; no overflow`, s6a && o.orbits === 'betelgeuse' && o.star.opacity === 1 && u.primary === HIDE_O && o.noteText === SHORT_O && o.noteInPanel && o.buttonInPanel && o.jupiterInWindow && !o.jupiterHitsPanel && !o.jupiterHitsNav && !o.overflowX && u.live === LIVE_O, JSON.stringify({ o }));
    notes.push(`${tag}: orbit diagram Jupiter radius ${o.ringRadii[4]?.toFixed(1)} px`);
    await sm('09-orbits');
    // Steps 7 and 8: questions.
    await next(pg);
    const q2w = await answer(pg, 'jupiter'); await retry(pg); await pg.waitForTimeout(150); const q2r = await answer(pg, 'mars');
    await next(pg);
    const q3w = await answer(pg, 'objem'); await retry(pg); await pg.waitForTimeout(150); const q3r = await answer(pg, 'priemer');
    const finish = await pg.evaluate(() => document.querySelector('.learn-footer .learn-primary').textContent);
    check(`${tag} steps 7–8: both questions give the approved hint and praise; last button "Dokončiť lekciu"`, q2w.feedback === 'Skús to znova. Pozri sa, ktoré obežné dráhy ležali vnútri hviezdy.' && q2r.feedback.startsWith('Správne! Podľa použitého odhadu') && !q2r.next && q3w.feedback === 'Skús to znova. Spomeň si na jedenásť Zemí zoradených vedľa seba cez Jupiter.' && q3r.feedback === 'Správne! Porovnávali sme priemery – teda šírku telies. Ich objemy sa líšia ešte výraznejšie.' && finish === 'Dokončiť lekciu', JSON.stringify({ q2w: q2w.feedback, q3w: q3w.feedback, finish }));
    await sm('10-question-priemer');
    // Back through every step from the last question to the start: each comparison restarts at its start view.
    const seen = [];
    for (let i = 7; i > 0; i--) { await back(pg); await pg.waitForTimeout(150); seen.push([await heading(pg), await pg.evaluate(() => { const s = comparisonStage.state(); return s.active ? (s.orbits ? `orbits:${s.orbits}` : s.lineup ? 'lineup' : s.pair.join()) : 'none'; })]); }
    check(`${tag} Back through all steps: correct titles; each comparison restarts at its start view; none on question steps`, seen.map(s => s[0]).join('|') === TITLES.slice(0, 7).reverse().join('|') && JSON.stringify(seen.map(s => s[1])) === JSON.stringify(['none', 'orbits:sun', 'sun,jupiter', 'jupiter,earth', 'none', 'lineup', 'none']), JSON.stringify(seen));
    // Forward again to the summary (answered questions stay answered or are answered again).
    for (let i = 0; i < 12 && (await heading(pg)) !== TITLES[8]; i++) {
      const st = await pg.evaluate(() => ({ step: Learn.state.step, locked: document.querySelector('.learn-footer .learn-primary')?.disabled }));
      if (st.locked) { const c = await pg.evaluate(s => LearnContent.lessons.find(l => l.id === 'obri').steps[s].correct, st.step); await answer(pg, c); }
      await next(pg);
    }
    // Step 9: summary.
    const sum = await pg.evaluate(() => ({ h: document.getElementById('learn-heading').textContent, ideas: [...document.querySelectorAll('#learn-root .learn-body li')].map(li => li.textContent), buttons: [...document.querySelectorAll('#learn-root .learn-footer button')].map(b => b.textContent), inBody: document.querySelectorAll('#learn-root .learn-body button').length }));
    check(`${tag} step 9 summary: title, five key ideas, existing end buttons (in the panel footer since Phase 6H.8.B, none in the body)`, sum.h === TITLES[8] && sum.ideas.length === 5 && sum.ideas.filter(t => /11-krát|10-krát|760-krát|dráhu Marsu|osobitne/.test(t)).length === 5 && sum.buttons.join() === 'Späť na témy,Objavuj,Otestuj sa' && sum.inBody === 0, JSON.stringify(sum));
    await sm('11-summary');
    await pg.evaluate(() => Learn.leave()); await settle(pg); await pg.waitForTimeout(300);
    // Re-entry starts at the introduction; the Jupiter–Sun step starts fresh.
    await openLesson(pg); hd = await heading(pg);
    for (let i = 0; i < 3; i++) { const st = await pg.evaluate(() => ({ step: Learn.state.step, locked: document.querySelector('.learn-footer .learn-primary')?.disabled })); if (st.locked) await answer(pg, await pg.evaluate(s => LearnContent.lessons.find(l => l.id === 'obri').steps[s].correct, st.step)); await next(pg); }
    await pg.waitForTimeout(300); const reset = await ui(pg);
    check(`${tag} re-entry: starts at the introduction; the Jupiter–Sun step starts fresh at Jupiter–Earth`, hd === TITLES[0] && reset.stage.pair?.join() === 'jupiter,earth' && reset.primary === 'Odhaľ veľkosť Slnka');
    await pg.evaluate(() => Learn.leave());
    check(`${tag}: no JS or WebGL errors`, errors.length === 0, errors.join('; '));
    await context.close();
  }
  // 1b. Leaving during an animation restores the Solar System exactly (fresh pages: no earlier summary overview camera).
  for (const [w, h] of [[1366, 768], [390, 667]]) {
    const { pg, errors, context } = await open(browser, w, h, { touch: w < 500, patch: null });
    await pg.evaluate(() => { if (areOrbitsActive) toggleOrbit(); simulationSpeed = 2; document.getElementById('simulation-speed').value = '2'; toggleOrbitVisibility(); }); await settle(pg); await pg.waitForTimeout(200);
    const before = await pg.evaluate(`(${MAIN_STATE})()`);
    await openLesson(pg);
    for (let i = 0; i < 4; i++) { const st = await pg.evaluate(() => ({ step: Learn.state.step, locked: document.querySelector('.learn-footer .learn-primary')?.disabled })); if (st.locked) await answer(pg, await pg.evaluate(s => LearnContent.lessons.find(l => l.id === 'obri').steps[s].correct, st.step)); await next(pg); }
    await pg.waitForTimeout(300); await pg.click(PRIMARY, { force: true }); await pg.waitForTimeout(400);
    const mid = await pg.evaluate(`(() => { const busy = comparisonStage.state().busy; Learn.leave(); comparisonStage.update(); return { busy, active: comparisonStage.active, overlay: document.getElementById('comparison-overlay').hidden }; })()`);
    await settle(pg); await pg.waitForTimeout(300);
    const after = await pg.evaluate(`(${MAIN_STATE})()`), diff = Object.keys(before).filter(k => before[k] !== after[k]);
    check(`${w}×${h} leave during the Betelgeuse zoom: stage ended, overlay hidden, Solar System identical (camera, playback, speed, orbit lines, planets, Moon, materials, renderer)`, mid.busy && !mid.active && mid.overlay && diff.length === 0, JSON.stringify({ mid, diff }));
    check(`${w}×${h}: no JS or WebGL errors (restoration)`, errors.length === 0, errors.join('; '));
    await context.close();
  }
  // 2. Reduced motion through the three reveals.
  {
    const { pg, errors, context } = await open(browser, 1366, 768, { reduced: true, patch: null });
    await openLesson(pg); for (let i = 0; i < 3; i++) { const st = await pg.evaluate(() => ({ step: Learn.state.step, locked: document.querySelector('.learn-footer .learn-primary')?.disabled })); if (st.locked) await answer(pg, await pg.evaluate(s => LearnContent.lessons.find(l => l.id === 'obri').steps[s].correct, st.step)); await next(pg); }
    await pg.click(PRIMARY); const a = await ui(pg); await next(pg); await pg.click(PRIMARY); const b = await ui(pg); await next(pg); await pg.click(PRIMARY); const c = await ui(pg);
    check('reduced motion: all three reveals switch at once (never busy) with their final labels', !a.stage.busy && a.primary === 'Späť k Jupiteru' && !b.stage.busy && b.primary === 'Späť k Slnku' && !c.stage.busy && c.primary === HIDE_O);
    await pg.evaluate(() => Learn.leave());
    check('no JS or WebGL errors (reduced motion)', errors.length === 0, errors.join('; '));
    await context.close();
  }
  // 3. Existing lessons and Quiz (smoke).
  {
    const { pg, errors, context } = await open(browser, 1366, 768, { patch: null });
    const start = t => pg.evaluate(t => { Learn.enter(); [...document.querySelectorAll('.learn-topic')].find(c => c.querySelector('h3').textContent === t).querySelector('button').click(); }, t);
    const goTo = n => pg.evaluate(n => { for (let g = 0; Learn.state.step < n && g < 40; g++) { const s = LearnContent.lessons.find(l => l.id === Learn.state.lesson).steps[Learn.state.step];
      if (s.type === 'question' && Learn.state.feedback !== 'correct') { const i = document.querySelector(`.learn-answer input[value="${s.correct}"]`); i.checked = true; i.dispatchEvent(new Event('change', { bubbles: true })); document.querySelector('[data-check]').click(); }
      if (s.type === 'classify') { const g2 = LearnContent.planetGroups.find(x => x.bodies.includes(s.items[Learn.state.stop]?.body))?.id; if (g2) document.querySelector(`.learn-classify-choice[data-group="${g2}"]`).click(); }
      document.querySelector('.learn-footer .learn-primary').click(); } }, n);
    await start('Naša slnečná sústava'); await goTo(5); await pg.waitForTimeout(300);
    check('smoke "Naša slnečná sústava": reaches its summary', await pg.evaluate(() => Learn.state.step === 5 && document.getElementById('learn-heading').textContent.startsWith('Výborne')));
    await pg.evaluate(() => Learn.leave());
    await start('Slnko – naša hviezda'); await goTo(3); await settle(pg);
    await pg.evaluate(() => document.querySelector('.learn-experiment-actions .learn-primary').click());
    await pg.waitForFunction(() => !earthLessonExperiment.state().busy, null, { timeout: 10000 });
    check('smoke "Slnko – naša hviezda": Day/Night turn', await pg.evaluate(() => earthLessonExperiment.state().turns === 1));
    await pg.evaluate(() => Learn.leave());
    await start('Spoznaj planéty'); await goTo(2); await settle(pg);
    check('smoke "Spoznaj planéty": tour reaches Merkúr', await pg.evaluate(() => document.getElementById('learn-heading').textContent === 'Merkúr'));
    await pg.evaluate(() => Learn.leave());
    await start('Zem a Mesiac'); await goTo(4); await settle(pg);
    await pg.evaluate(() => document.querySelector('.learn-experiment-actions .learn-primary').click());
    await pg.waitForFunction(() => !moonPhaseExperiment.state().busy, null, { timeout: 10000 });
    check('smoke "Zem a Mesiac": Moon Phases advance', await pg.evaluate(() => moonPhaseExperiment.state().name === 'Dorastajúci kosák'));
    await pg.evaluate(() => Learn.leave());
    await pg.evaluate(() => startQuiz()); await pg.waitForTimeout(200);
    const q = await pg.evaluate(() => { selectPlanetByName(quizTarget.name); return document.getElementById('quiz-feedback').textContent; });
    check('smoke Quiz: a correct pick scores', q.includes('Správne'), q);
    await pg.evaluate(() => stopQuiz());
    check('no JS or WebGL errors (smoke)', errors.length === 0, errors.join('; '));
    await context.close();
  }
  await browser.close(); server.close();
  notes.forEach(n => console.log('NOTE  ' + n));
  console.log(`${passes} passed, ${failures} failed`);
  process.exit(failures ? 1 : 0);
})();
