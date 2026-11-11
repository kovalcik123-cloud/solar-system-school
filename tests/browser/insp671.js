// Phase 6G.7.1 planet inspection harness (real lesson, no injected content) (outside the repository). The fixture lesson "Porovnanie veľkostí — test" is injected
// only into this test browser; it is not part of the application.
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const S = __dirname, ROOT = require('./env').ROOT, OUT = require('./env').out('insp671');
fs.mkdirSync(OUT, { recursive: true });
const PORT = Number(process.env.PORT || 8888);
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
const DEG = Math.PI / 180, LIMIT = 25 * DEG, STEP = 15 * DEG;
const PLANETS = ['mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune'];
const NAMES = { mercury: 'Merkúr', venus: 'Venuša', earth: 'Zem', mars: 'Mars', jupiter: 'Jupiter', saturn: 'Saturn', uranus: 'Urán', neptune: 'Neptún' };
// Strict lineup snapshot: every mesh's position, scale and rotation, the lineup camera, overlay mode and the size data.
const LINE = () => { comparisonStage.render(); const { scene: sc, camera: cam } = window.__stage, o = document.getElementById('comparison-overlay');
  const meshes = sc.children.filter(c => c.isMesh && c.userData.id).map(m => [m.userData.id, m.position.toArray().join(), m.scale.toArray().join(), m.rotation.toArray().slice(0, 3).join(), m.quaternion.toArray().join()].join('|')).sort();
  return { meshes, camera: [cam.type, cam.left, cam.right, cam.top, cam.bottom, cam.near, cam.far, cam.zoom, cam.position.toArray().join()].join(), view: o.dataset.view, mode: o.dataset.mode ?? null,
    labels: [...o.querySelectorAll('.comparison-list li')].map(li => `${li.style.left}|${li.style.top}`).join(), data: JSON.stringify(SizeData.bodies), ratios: [SizeData.ratio('jupiter', 'earth'), SizeData.ratio('saturn', 'mercury')].join() }; };
const line = pg => pg.evaluate(`(${LINE})()`);
const INS = () => { comparisonStage.render(); const s = comparisonStage.state(), o = document.getElementById('comparison-overlay'), g = o.querySelector('.comparison-inspect');
  const vis = el => !o.hidden && !g.hidden && getComputedStyle(el).display !== 'none' && getComputedStyle(el).visibility !== 'hidden' && el.getBoundingClientRect().width > 1;
  const panel = document.getElementById('learn-root').getBoundingClientRect(), nav = document.getElementById('planet-nav').getBoundingClientRect(), cap = g.getBoundingClientRect();
  const overlap = (a, b) => a.left < b.right - 0.5 && a.right > b.left + 0.5 && a.top < b.bottom - 0.5 && a.bottom > b.top + 0.5;
  const { scene: sc, camera: cam } = window.__stage, m = sc.children.find(c => c.isMesh && c.userData.id === s.body);
  let disc = null; if (m) { cam.updateMatrixWorld(); const c = m.position.clone().project(cam), r = new THREE.Vector3(0, 1, 0).project(cam); const px = v => ({ x: (v.x + 1) / 2 * innerWidth, y: (1 - v.y) / 2 * innerHeight }); const pc = px(c), pr = px(r); const rad = Math.hypot(pr.x - pc.x, pr.y - pc.y) * 1.02; disc = { x: pc.x, y: pc.y, r: rad, box: { left: pc.x - rad, right: pc.x + rad, top: pc.y - rad, bottom: pc.y + rad } }; }
  const turnButtons = [...document.querySelectorAll('.learn-inspect-turn button')].map(b => ({ label: b.getAttribute('aria-label'), visible: b.getBoundingClientRect().height >= 40 && b.getBoundingClientRect().bottom <= Math.min(innerHeight, panel.bottom) + 0.5 && getComputedStyle(b).visibility !== 'hidden' && b.offsetParent !== null }));
  return { s, name: g.querySelector('.inspect-name').textContent, size: g.querySelector('.inspect-size').textContent, disclaimerVisible: vis(g.querySelector('.inspect-disclaimer')), disclaimer: g.querySelector('.inspect-disclaimer').textContent,
    nameVisible: vis(g.querySelector('.inspect-name')), view: o.dataset.view, others: [...o.children].filter(c => c !== g).some(c => !c.hidden && getComputedStyle(c).display !== 'none' && getComputedStyle(c).visibility !== 'hidden' && [...c.querySelectorAll('li, p, span')].some(x => x.getBoundingClientRect().width > 1 && getComputedStyle(x).visibility !== 'hidden')),
    captionInWindow: cap.left >= -0.5 && cap.right <= innerWidth + 0.5 && cap.top >= 0 && cap.bottom <= innerHeight, captionHitsPanel: overlap(cap, panel), captionHitsNav: overlap(cap, nav), disc, discHitsPanel: disc ? overlap(disc.box, panel) : null, discHitsNav: disc ? overlap(disc.box, nav) : null, discHitsCaption: disc ? overlap(disc.box, cap) : null,
    discInWindow: disc ? disc.box.left >= 0 && disc.box.right <= innerWidth && disc.box.top >= 0 && disc.box.bottom <= innerHeight : null, meshScale: m ? m.scale.toArray().join() : null, meshPos: m ? m.position.toArray().join() : null, rot: m ? m.rotation.toArray().slice(0, 3) : null,
    primary: document.querySelector('[data-focus="comparison-primary"]')?.textContent, turnButtons, touchAction: renderer.domElement.style.touchAction, scrollY: window.scrollY, pickHidden: document.querySelector('.learn-inspect-pick')?.hidden,
    lessonText: (() => { const t = document.querySelector('.learn-experiment-details > p:not(.learn-note)'); return t ? { hidden: t.hidden, text: t.textContent.slice(0, 30) } : null; })(),
    inPanel: Object.fromEntries([['heading', '#learn-root h2'], ['primary', '[data-focus="comparison-primary"]'], ['turn', '.learn-inspect-turn']].map(([k, q]) => { const e = document.querySelector(q), b = e?.getBoundingClientRect(); return [k, !!b && b.height > 0 && b.top >= panel.top - 0.5 && b.bottom <= Math.min(panel.bottom, innerHeight) + 0.5]; })),
    restartShown: (() => { const r = [...document.querySelectorAll('#learn-root button')].find(b => b.textContent === 'Začať porovnanie odznova'); return r ? !r.hidden : null; })(),
    info: document.querySelector('.learn-comparison-info')?.textContent, note: document.querySelector('.learn-comparison-note')?.textContent, live: document.querySelector('.learn-live')?.textContent }; };
const ins = pg => pg.evaluate(`(${INS})()`);
const toStep2 = async pg => { await openLesson(pg); await next(pg); await pg.waitForTimeout(350); };
const pickVia = async (pg, id, compact) => {
  if (compact) { await pg.evaluate(() => { const d = document.getElementById('learn-experiment-details'); if (d.hidden) document.querySelector('.learn-expand').click(); }); await pg.waitForTimeout(250); }
  await pg.selectOption('#learn-inspect-planet', id); await pg.click('[data-focus="inspect-open"]'); await pg.waitForTimeout(200);
  if (compact) { await pg.evaluate(() => { const d = document.getElementById('learn-experiment-details'); if (!d.hidden) document.querySelector('.learn-expand').click(); }); await pg.waitForTimeout(250); }
};
const back2lineup = async pg => { await pg.click(PRIMARY, { force: true }); await pg.waitForTimeout(250); };
const centreOf = (pg, id) => pg.evaluate(id => { comparisonStage.render(); const { camera: cam } = window.__stage, m = window.__stage.scene.children.find(c => c.userData?.id === id); const p = m.position.clone().project(cam); return { x: (p.x + 1) / 2 * innerWidth, y: (1 - p.y) / 2 * innerHeight, r: m.scale.x }; }, id);

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  // 1. All eight planets through the accessible picker, at every viewport; layout, texts, disclaimer, return and invariants.
  for (const [w, h] of (process.env.ONE ? [[1366, 768]] : [[1366, 768], [1920, 1080], [390, 844], [390, 667], [844, 390]])) {
    const tag = `${w}×${h}`, touch = w < 500, { pg, errors, context } = await open(browser, w, h, { touch, patch: null });
    await toStep2(pg);
    const compact = await pg.evaluate(() => !!document.getElementById('learn-experiment-details').contains(document.querySelector('.learn-inspect-pick')));
    const base = await line(pg); const baseLive = await pg.evaluate(() => { renderer.render(scene, camera); comparisonStage.render(); return [renderer.info.memory.geometries, renderer.info.memory.textures, renderer.info.programs.length].join(); });
    if (w === 1366 || (w === 390 && h === 667)) await pg.screenshot({ path: path.join(OUT, `01-lineup-${w}x${h}.png`) });
    const fails = [], textFails = [], restartFails = [];
    for (const id of PLANETS) {
      await pickVia(pg, id, compact);
      const i = await ins(pg);
      const terms = [(i.s.body === id),(i.name === NAMES[id]),(i.size.replace(/[\u00a0\u202f]/g, ' ') === `priemer ${await pg.evaluate(id => { const v = Math.round(SizeData.bodies[id].diameterKm); return String(v).replace(/\B(?=(\d{3})+(?!\d))/g, ' '); }, id)} km`),(i.disclaimerVisible),(i.disclaimer === 'Zväčšený detail – nie v skutočnom pomere'),(i.nameVisible),(!i.others),(i.view === 'inspect'),(i.captionInWindow),(!i.captionHitsPanel),(!i.captionHitsNav),(i.discInWindow),(!i.discHitsPanel),(!i.discHitsNav),(!i.discHitsCaption),(i.meshScale === '1,1,1'),(i.meshPos === '0,0,0'),(i.primary === 'Späť na porovnanie'),(i.turnButtons.length === 4),(i.turnButtons.every(b => b.visible)),(i.pickHidden === true),(i.lessonText?.hidden === true),(i.inPanel.heading),(i.inPanel.primary),(i.inPanel.turn),(i.restartShown === false)]; const ok = terms.every(Boolean);
      if (!ok) fails.push({ id, falseTerms: terms.map((t, k) => t ? null : k).filter(k => k !== null).join(), sizeCodes: [...i.size].map(c => c.charCodeAt(0).toString(16)).join(' '), dis: i.disclaimer === 'Zväčšený detail – nie v skutočnom pomere', turnLen: i.turnButtons.length, bad: Object.entries({ body: i.s.body === id, name: i.name === NAMES[id], size: i.size, disc: i.disclaimerVisible, nameV: i.nameVisible, others: !i.others, view: i.view, capWin: i.captionInWindow, capPanel: !i.captionHitsPanel, capNav: !i.captionHitsNav, discWin: i.discInWindow, discPanel: !i.discHitsPanel, discNav: !i.discHitsNav, discCap: !i.discHitsCaption, scale: i.meshScale, pos: i.meshPos, primary: i.primary, turn: i.turnButtons.map(b=>b.visible).join(), pickHidden: i.pickHidden }).filter(([k,v]) => v !== true).map(([k,v])=>k+'='+v).join(' ') });
      if (id === 'jupiter' && (w === 1366 || (w === 390 && h === 667) || w === 844)) await pg.screenshot({ path: path.join(OUT, `02-jupiter-${w}x${h}.png`) });
      if (w === 1366 && id === 'earth') await pg.screenshot({ path: path.join(OUT, '04-earth-1366x768.png') });
      if (w === 1366 && id === 'mercury') await pg.screenshot({ path: path.join(OUT, '05-mercury-1366x768.png') });
      await back2lineup(pg);
      const restored = await pg.evaluate(() => { const t = document.querySelector('.learn-experiment-details > p:not(.learn-note)'); return t && !t.hidden && t.textContent.startsWith('Pozri sa na všetkých osem planét'); });
      if (!restored || i.lessonText?.hidden !== true) textFails.push(id);
      if (!(await pg.evaluate(() => { const r = [...document.querySelectorAll('#learn-root button')].find(b => b.textContent === 'Začať porovnanie odznova'); return !!r && !r.hidden; }))) restartFails.push(id);
    }
    check(`${tag} lesson paragraph "Pozri sa na všetkých osem planét…" hidden during each inspection and restored (same text) after every return`, textFails.length === 0, JSON.stringify(textFails));
    check(`${tag} "Začať porovnanie odznova" hidden during each inspection (focus never left on it) and shown again in the lineup after every return`, restartFails.length === 0 && !fails.some(f => f.falseTerms?.split(',').includes('25')), JSON.stringify(restartFails));
    check(`${tag} every planet opens through the picker: right name and real diameter, disclaimer visible, enlarged planet and caption clear of the panel and navigation, four turn buttons, "Späť na porovnanie"`, fails.length === 0, JSON.stringify(fails.slice(0, 1)).slice(0, 900));
    const after = await line(pg); const res = await pg.evaluate(() => { renderer.render(scene, camera); comparisonStage.render(); return [renderer.info.memory.geometries, renderer.info.memory.textures, renderer.info.programs.length].join(); });
    check(`${tag} after eight inspections the true-scale lineup is identical (mesh positions, scales, rotations, lineup camera, labels, size data, ratios)`, JSON.stringify(after) === JSON.stringify(base), JSON.stringify({ base: base.meshes.slice(0, 2), after: after.meshes.slice(0, 2) }));
    check(`${tag} resources after eight inspections: ${baseLive} → ${res} (no growth)`, res === baseLive || res.split(',').every((v, k) => +v <= +baseLive.split(',')[k] + (k === 2 ? 0 : 0)), JSON.stringify({ baseLive, res }));
    // Tap or click on the visible spheres, including tiny ones; an ambiguous point opens nothing.
    const tapFails = [];
    for (const id of ['jupiter', 'mercury', 'mars']) {
      const c = await centreOf(pg, id);
      if (touch) await pg.tap('canvas', { position: { x: c.x, y: c.y }, force: true }); else await pg.mouse.click(c.x, c.y);
      await pg.waitForTimeout(200);
      const s = await pg.evaluate(() => comparisonStage.state().body);
      if (s !== id) tapFails.push({ id, s, c });
      await back2lineup(pg);
    }
    const e = await centreOf(pg, 'earth'), v = await centreOf(pg, 'venus'), mid = { x: (e.x + v.x) / 2, y: (e.y + v.y) / 2 };
    if (touch) await pg.tap('canvas', { position: mid, force: true }); else await pg.mouse.click(mid.x, mid.y);
    await pg.waitForTimeout(200);
    const ambiguous = await pg.evaluate(() => comparisonStage.state().body);
    check(`${tag} ${touch ? 'tap' : 'click'} on Jupiter, Mercury (${(2 * (await centreOf(pg, 'mercury')).r).toFixed(1)} px) and Mars opens them; a point between Earth and Venus opens nothing`, tapFails.length === 0 && ambiguous === null, JSON.stringify({ tapFails, ambiguous }));
    if (ambiguous) await back2lineup(pg);
    if (w === 844) {
      await pickVia(pg, 'jupiter', compact);
      const top = await ins(pg);
      const reach = await pg.evaluate(() => { const root = document.getElementById('learn-root'); const start = root.scrollTop; root.scrollTop = root.scrollHeight; const p = root.getBoundingClientRect();
        const footer = [...document.querySelectorAll('.learn-footer button')].map(b => { const r = b.getBoundingClientRect(), x = (r.left + r.right) / 2, y = (r.top + r.bottom) / 2, e = document.elementFromPoint(x, y); return { t: b.textContent, inView: r.top >= p.top - 0.5 && r.bottom <= p.bottom + 0.5, hit: !!e && (e === b || b.contains(e)) }; });
        const controls = [...document.querySelectorAll('[data-focus="comparison-primary"], .learn-inspect-turn button, .learn-footer button')].map(b => b.getBoundingClientRect()).filter(r => r.height > 0);
        const overlaps = controls.some((a, i) => controls.some((b, j) => j > i && a.left < b.right - 0.5 && a.right > b.left + 0.5 && a.top < b.bottom - 0.5 && a.bottom > b.top + 0.5));
        const out = { start, range: root.scrollHeight - root.clientHeight, footer, overlaps }; root.scrollTop = 0; return out; });
      check(`844×390 inspection opens at the top of the side panel (scroll ${reach.start}): heading, "Späť na porovnanie" and the four turn buttons in view; the Learn navigation is reached by scrolling the panel (${reach.range} px) and is unobstructed; no controls overlap`, reach.start === 0 && top.inPanel.heading && top.inPanel.primary && top.inPanel.turn && reach.footer.length >= 3 && reach.footer.every(f => f.inView && f.hit) && !reach.overlaps, JSON.stringify(reach));
      await back2lineup(pg);
      const after = await pg.evaluate(() => document.getElementById('learn-root').scrollTop);
      check('844×390 return to the lineup starts the side panel at the top again', after === 0, String(after));
    }
    await pg.evaluate(() => Learn.leave());
    check(`${tag}: no JS or WebGL errors`, errors.length === 0, errors.join('; '));
    await context.close();
  }
  // 2. Rotation: mouse drag, keyboard buttons, pitch limit, focus, announcements (1366×768).
  {
    const { pg, errors, context } = await open(browser, 1366, 768, { patch: null });
    await toStep2(pg); await liveCount(pg);
    await pg.focus('#learn-inspect-planet'); await pg.keyboard.press('Shift+Tab'); await pg.keyboard.press('Tab');
    await pg.selectOption('#learn-inspect-planet', 'jupiter'); await pg.focus('[data-focus="inspect-open"]'); await pg.keyboard.press('Enter'); await pg.waitForTimeout(200);
    let i = await ins(pg);
    const focus1 = await pg.evaluate(() => document.activeElement?.dataset?.focus);
    check('keyboard: picker + Enter opens Jupiter; focus moves to "Späť na porovnanie"; one announcement with name, diameter and disclaimer', i.s.body === 'jupiter' && focus1 === 'comparison-primary' && (await pg.evaluate(() => window.__live)).join('|').replace(/[\u00a0\u202f]/g, ' ') === 'Jupiter, priemer 139 822 km. Zväčšený detail – nie v skutočnom pomere. Planétu otočíš potiahnutím alebo tlačidlami.', JSON.stringify({ focus1, live: await pg.evaluate(() => window.__live) }));
    // Mouse drag: right → yaw grows; down → pitch grows up to the limit.
    const c = i.disc;
    await pg.mouse.move(c.x, c.y); await pg.mouse.down(); for (let k = 1; k <= 10; k++) await pg.mouse.move(c.x + k * 12, c.y); await pg.mouse.up(); await pg.waitForTimeout(100);
    i = await ins(pg); const yaw1 = i.s.inspect.yaw;
    await pg.screenshot({ path: path.join(OUT, '03-jupiter-rotated-1366x768.png') });
    await pg.mouse.move(c.x, c.y); await pg.mouse.down(); for (let k = 1; k <= 10; k++) await pg.mouse.move(c.x + k * 12, c.y); await pg.mouse.up();
    i = await ins(pg); const yaw2 = i.s.inspect.yaw;
    await pg.mouse.move(c.x, c.y - 100); await pg.mouse.down(); for (let k = 1; k <= 20; k++) await pg.mouse.move(c.x, c.y - 100 + k * 20); await pg.mouse.up();
    i = await ins(pg); const pitchDown = i.s.inspect.pitch;
    await pg.mouse.move(c.x, c.y + 100); await pg.mouse.down(); for (let k = 1; k <= 30; k++) await pg.mouse.move(c.x, c.y + 100 - k * 20); await pg.mouse.up();
    i = await ins(pg); const pitchUp = i.s.inspect.pitch;
    check(`mouse drag: yaw grows continuously (${yaw1.toFixed(3)} → ${yaw2.toFixed(3)} rad), pitch stops at +25° (${(pitchDown / DEG).toFixed(2)}°) and −25° (${(pitchUp / DEG).toFixed(2)}°); rotation applied as pitch × yaw; scale and position unchanged; disclaimer stays`, yaw1 > 0.5 && Math.abs(yaw2 - 2 * yaw1) < 1e-6 && Math.abs(pitchDown - LIMIT) < 1e-12 && Math.abs(pitchUp + LIMIT) < 1e-12 && Math.abs(i.rot[0] - pitchUp) < 1e-12 && Math.abs(i.rot[1] - yaw2) < 1e-12 && i.rot[2] === 0 && i.meshScale === '1,1,1' && i.meshPos === '0,0,0' && i.disclaimerVisible, JSON.stringify({ yaw1, yaw2, pitchDown, pitchUp, rot: i.rot }));
    // Buttons: 15° steps, same pitch limit; visible keyboard focus.
    const before = (await ins(pg)).s.inspect;
    const press = async label => { await pg.focus(`.learn-inspect-turn button[aria-label="${label}"]`); await pg.keyboard.press('Enter'); return (await ins(pg)).s.inspect; };
    const r1 = await press('Otočiť doprava'), r2 = await press('Otočiť doľava'), r3 = await press('Otočiť nadol'), r4 = await press('Otočiť nadol'), r5 = await press('Otočiť nadol'), r5b = await press('Otočiť nadol'), r6 = await press('Otočiť nahor');
    const fv = await pg.evaluate(() => ({ visible: document.activeElement.matches(':focus-visible'), outline: getComputedStyle(document.activeElement).outlineStyle, label: document.activeElement.getAttribute('aria-label') }));
    await pg.screenshot({ path: path.join(OUT, '08-keyboard-focus-rotation-1366x768.png') });
    check('buttons: doprava +15°, doľava −15°, nadol +15° steps up to +25°, nahor −15°; visible keyboard focus on the turn buttons; Slovak accessible names', Math.abs(r1.yaw - (before.yaw + STEP) % (2 * Math.PI)) < 1e-9 && Math.abs(r2.yaw - before.yaw) < 1e-9 && Math.abs(r3.pitch - Math.min(LIMIT, before.pitch + STEP)) < 1e-12 && Math.abs(r4.pitch - Math.min(LIMIT, before.pitch + 2 * STEP)) < 1e-12 && Math.abs(r5.pitch - Math.min(LIMIT, before.pitch + 3 * STEP)) < 1e-12 && Math.abs(r5b.pitch - LIMIT) < 1e-12 && Math.abs(r6.pitch - (LIMIT - STEP)) < 1e-12 && fv.visible && fv.outline !== 'none' && (await ins(pg)).turnButtons.map(b => b.label).join() === 'Otočiť doľava,Otočiť doprava,Otočiť nahor,Otočiť nadol', JSON.stringify({ before, r1, r3, r4, r5, r5b, r6, fv }));
    const liveCount2 = (await pg.evaluate(() => window.__live)).length;
    check('no announcements during dragging or turning (only the one on opening)', liveCount2 === 1, String(liveCount2));
    // Return: focus kept on the same button; lineup announced; orientation reset; a new inspection starts from the original orientation.
    await pg.focus(PRIMARY); await pg.keyboard.press('Enter'); await pg.waitForTimeout(200);
    const ret = await pg.evaluate(() => ({ s: comparisonStage.state(), focus: document.activeElement?.dataset?.focus, text: document.activeElement?.textContent, live: window.__live.slice(-1)[0], rot: window.__stage.scene.children.filter(c => c.isMesh && c.userData.id).map(m => m.rotation.toArray().slice(0, 3).join()).every(r => r === '0,0,0') }));
    await pg.screenshot({ path: path.join(OUT, '09-restored-lineup-1366x768.png') });
    await pg.selectOption('#learn-inspect-planet', 'jupiter'); await pg.click('[data-focus="inspect-open"]'); await pg.waitForTimeout(150);
    const again = (await ins(pg)).s.inspect;
    check('return: lineup, focus stays on the primary button ("Porovnaj Zem a Jupiter"), announced, all planets unrotated; reopening starts at yaw 0, pitch 0', ret.s.lineup === 'planets' && ret.focus === 'comparison-primary' && ret.text === 'Porovnaj Zem a Jupiter' && ret.live === 'Opäť vidíš všetkých osem planét v skutočnom pomere priemerov.' && ret.rot && again.yaw === 0 && again.pitch === 0, JSON.stringify({ ret, again }));
    // Earth–Jupiter and 11 Earths still work after inspection; shared meshes unrotated.
    await back2lineup(pg);
    await pg.click(PRIMARY); await idle(pg); await pg.click(PRIMARY); await idle(pg); await pg.waitForTimeout(100);
    const pairOk = await pg.evaluate(() => { const s = comparisonStage.state(); return s.pair?.join() === 'jupiter,earth' && s.references === 11 && window.__stage.scene.children.filter(c => c.isMesh && c.userData.id).every(m => m.rotation.toArray().slice(0, 3).join() === '0,0,0') && document.getElementById('comparison-overlay').querySelector('.comparison-inspect').hidden; });
    const pairRestart = await pg.evaluate(() => { const r = [...document.querySelectorAll('#learn-root button')].find(b => b.textContent === 'Začať porovnanie odznova'); return !!r && !r.hidden && r.offsetParent !== null; });
    check('pair view (Earth–Jupiter, 11 Earths): "Začať porovnanie odznova" still visible', pairRestart);
    check('after inspection: Earth–Jupiter and the 11-Earth row work; shared Jupiter and Earth meshes unrotated; inspection caption hidden; no tap opens inspection in the pair view', pairOk);
    const j = await centreOf(pg, 'jupiter'); await pg.mouse.click(j.x, j.y); await pg.waitForTimeout(150);
    check('a click in the pair view does not open inspection', (await pg.evaluate(() => comparisonStage.state().body)) === null);
    await pg.evaluate(() => [...document.querySelectorAll('#learn-root button')].find(b => b.textContent === 'Začať porovnanie odznova').click()); await pg.waitForTimeout(300);
    const restarted = await pg.evaluate(() => { const s = comparisonStage.state(); return { lineup: s.lineup, pair: s.pair, body: s.body, active: s.active }; });
    check('"Začať porovnanie odznova" keeps its behaviour outside inspection: from the pair view it restarts the comparison with all eight planets', restarted.active && restarted.lineup === 'planets' && !restarted.pair && !restarted.body, JSON.stringify(restarted));
    await pg.evaluate(() => Learn.leave());
    check('no JS or WebGL errors (rotation)', errors.length === 0, errors.join('; '));
    await context.close();
  }
  // 3. Touch drag on a phone: rotates, no page scroll or zoom, touch-action restored afterwards.
  {
    const { pg, errors, context } = await open(browser, 390, 667, { touch: true, patch: null });
    // Attribute every preventDefault on a non-cancelable touch event to its listener (Chrome logs "Ignored attempt to cancel…" for each).
    await pg.evaluate(() => { window.__pd = []; const pd = Event.prototype.preventDefault; Event.prototype.preventDefault = function () { if (/^touch/.test(this.type) && !this.cancelable) window.__pd.push(this.type + ' ' + (new Error().stack.split('\n')[2] || '').trim()); return pd.call(this); }; });
    await toStep2(pg);
    const c0 = await centreOf(pg, 'saturn'); await pg.tap('canvas', { position: { x: c0.x, y: c0.y }, force: true }); await pg.waitForTimeout(200);
    let i = await ins(pg);
    const cdp = await context.newCDPSession(pg);
    const touch = async (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] });
    await touch('touchStart', i.disc.x, i.disc.y); for (let k = 1; k <= 8; k++) await touch('touchMove', i.disc.x - k * 10, i.disc.y + k * 3); await touch('touchEnd');
    await pg.waitForTimeout(150);
    const t = await ins(pg);
    check('touch drag (CDP touch events) on Saturn at 390×667: yaw turns, pitch follows within the limit; no page scroll; canvas touch-action "none" while the stage is active', i.s.body === 'saturn' && t.s.inspect.yaw < -0.3 && t.s.inspect.pitch > 0 && t.s.inspect.pitch <= LIMIT && t.scrollY === 0 && t.touchAction === 'none' && (await pg.evaluate(() => visualViewport.scale)) === 1, JSON.stringify({ inspect: t.s.inspect, scrollY: t.scrollY, ta: t.touchAction }));
    await pg.screenshot({ path: path.join(OUT, '06-saturn-rotated-390x667.png') });
    // Cancellation: blur and resize during a drag end it; later moves do not turn the planet.
    await touch('touchStart', i.disc.x, i.disc.y); await touch('touchMove', i.disc.x - 20, i.disc.y);
    await pg.evaluate(() => window.dispatchEvent(new Event('blur')));
    const y1 = (await ins(pg)).s.inspect.yaw; await touch('touchMove', i.disc.x - 120, i.disc.y); const y2 = (await ins(pg)).s.inspect.yaw; await touch('touchEnd');
    await touch('touchStart', i.disc.x, i.disc.y); await touch('touchMove', i.disc.x - 20, i.disc.y);
    await pg.setViewportSize({ width: 390, height: 844 }); await pg.waitForTimeout(250);
    const y3 = (await ins(pg)).s.inspect.yaw; await touch('touchMove', i.disc.x - 160, i.disc.y); const y4 = (await ins(pg)).s.inspect.yaw; await touch('touchEnd');
    const after = await ins(pg);
    check('blur and resize during a drag end it (no further turning); the enlarged planet is reframed at the new size, clear of the panel', Math.abs(y2 - y1) < 1e-12 && Math.abs(y4 - y3) < 1e-12 && after.discInWindow && !after.discHitsPanel && !after.captionHitsPanel, JSON.stringify({ y1, y2, y3, y4 }));
    await pg.setViewportSize({ width: 390, height: 667 }); await pg.waitForTimeout(250);
    // Leaving during a drag: stage ended, touch-action restored, no stale pointer handling.
    await touch('touchStart', i.disc.x, i.disc.y); await touch('touchMove', i.disc.x - 20, i.disc.y);
    await pg.evaluate(() => Learn.leave()); await touch('touchMove', i.disc.x - 100, i.disc.y); await touch('touchEnd');
    const gone = await pg.evaluate(() => ({ active: comparisonStage.active, ta: renderer.domElement.style.touchAction, overlay: document.getElementById('comparison-overlay').hidden }));
    check('leaving the lesson during a drag: stage ended, overlay hidden, canvas touch-action restored', !gone.active && gone.overlay && gone.ta === '', JSON.stringify(gone));
    const pdSources = await pg.evaluate(() => [...new Set(window.__pd.map(x => x.replace(/\(.*\/([^/:]*):(\d+):\d+\)/, '$1 line $2')))]);
    const preexisting = pdSources.every(x => /^touchend at HTMLCanvasElement\.onTouchEnd  line \d+$/.test(x) || /^touchmove at HTMLCanvasElement\.onTouchMove OrbitControls\.js line \d+$/.test(x));
    const real = errors.filter(e => !/Ignored attempt to cancel a touch(end|move) event with cancelable=false/.test(e));
    check(`no JS or WebGL errors (touch); Chrome's "Ignored attempt to cancel" notices come only from the existing main-scene onTouchEnd / OrbitControls listeners, not from the inspection code (sources: ${pdSources.join(' | ') || 'none'})`, real.length === 0 && preexisting, real.join('; '));
    await context.close();
  }
  // 4. Lifecycle during inspection: Back, Next, Close, Explore, Quiz, restart; Solar System restored; repeated cycles.
  {
    const { pg, errors, context } = await open(browser, 1366, 768, { patch: null });
    await pg.evaluate(() => { if (areOrbitsActive) toggleOrbit(); simulationSpeed = 2; document.getElementById('simulation-speed').value = '2'; toggleOrbitVisibility(); }); await settle(pg); await pg.waitForTimeout(200);
    const before = await pg.evaluate(`(${MAIN_STATE})()`);
    await toStep2(pg); await pg.evaluate(() => comparisonStage.configure({ body: 'earth' })); await pg.waitForTimeout(150);
    await pg.evaluate(() => Learn.leave()); await settle(pg); await pg.waitForTimeout(300);
    const after = await pg.evaluate(`(${MAIN_STATE})()`), diff = Object.keys(before).filter(k => before[k] !== after[k]);
    check('leaving the lesson during inspection: Solar System identical (camera, playback, speed, orbit lines, planets, Moon, materials, renderer)', diff.length === 0, JSON.stringify(diff));
    const exits = { back: () => [...document.querySelectorAll('.learn-footer button')].find(b => b.textContent === 'Späť').click(), next: () => document.querySelector('.learn-footer .learn-primary').click(),
      close: () => document.querySelector('.learn-close').click(), explore: () => showExploration(), quiz: () => startQuiz(), restart: () => [...document.querySelectorAll('.learn-experiment-details button')].find(b => b.textContent === 'Začať porovnanie odznova').click() };
    for (const how of Object.keys(exits)) {
      await pg.evaluate(() => { if (isQuizMode || isQuizResults) stopQuiz(); Learn.leave(); }); await toStep2(pg);
      await pg.evaluate(() => comparisonStage.configure({ body: 'mars' })); await pg.evaluate(() => comparisonStage.turn(1, 0.3)); await pg.waitForTimeout(100);
      await pg.evaluate(`(${exits[how]})()`); await pg.waitForTimeout(400);
      const r = await pg.evaluate(() => { const g = document.getElementById('comparison-overlay').querySelector('.comparison-inspect'); return { active: comparisonStage.active, s: comparisonStage.state(), caption: !g.hidden && !document.getElementById('comparison-overlay').hidden, ta: renderer.domElement.style.touchAction, primary: document.querySelector('[data-focus="comparison-primary"]')?.textContent ?? null,
        rot: window.__stage.scene.children.filter(c => c.isMesh && c.userData.id).every(m => m.rotation.toArray().slice(0, 3).join() === '0,0,0') }; });
      const ok = how === 'restart' ? r.active && r.s.lineup === 'planets' && !r.caption && r.primary === 'Porovnaj Zem a Jupiter' && r.rot && r.ta === 'none' : !r.active && !r.caption && r.ta === '';
      check(`inspection then ${how}: ${how === 'restart' ? 'restarts at the unrotated lineup' : 'stage ended, caption gone, touch-action restored'}`, ok, JSON.stringify(r));
    }
    await pg.evaluate(() => { if (isQuizMode || isQuizResults) stopQuiz(); Learn.leave(); }); await toStep2(pg);
    const res = () => pg.evaluate(() => { renderer.render(scene, camera); comparisonStage.render(); return [renderer.info.memory.geometries, renderer.info.memory.textures, renderer.info.programs.length].join(); });
    for (const id of PLANETS) { await pg.evaluate(id => comparisonStage.configure({ body: id }), id); await pg.waitForTimeout(60); await pg.evaluate(() => comparisonStage.configure({ lineup: 'planets' })); await pg.waitForTimeout(60); }
    const r0 = await res();
    for (let k = 0; k < 3; k++) for (const id of PLANETS) { await pg.evaluate(id => { comparisonStage.configure({ body: id }); comparisonStage.turn(0.5, 0.2); }, id); await pg.waitForTimeout(40); await pg.evaluate(() => comparisonStage.configure({ lineup: 'planets' })); await pg.waitForTimeout(40); }
    const r1 = await res();
    check(`resources stable over 24 more inspections (${r0} → ${r1})`, r0 === r1);
    await pg.evaluate(() => Learn.leave());
    check('no JS or WebGL errors (lifecycle)', errors.length === 0, errors.join('; '));
    await context.close();
  }
  // 5. Reduced motion: inspection opens and closes at once; direct rotation still works.
  {
    const { pg, errors, context } = await open(browser, 1366, 768, { reduced: true, patch: null });
    await toStep2(pg);
    const a = await pg.evaluate(() => { comparisonStage.configure({ body: 'jupiter' }); return comparisonStage.state().busy; });
    const c = (await ins(pg)).disc; await pg.mouse.move(c.x, c.y); await pg.mouse.down(); await pg.mouse.move(c.x + 60, c.y); await pg.mouse.up();
    const yaw = (await ins(pg)).s.inspect.yaw;
    const b = await pg.evaluate(() => { comparisonStage.configure({ lineup: 'planets' }); return comparisonStage.state().busy; });
    check('reduced motion: inspection opens and closes instantly (never busy); direct drag still turns the planet', !a && !b && yaw > 0);
    await pg.evaluate(() => Learn.leave());
    check('no JS or WebGL errors (reduced motion)', errors.length === 0, errors.join('; '));
    await context.close();
  }
  await browser.close(); server.close();
  console.log(`${passes} passed, ${failures} failed`);
  process.exit(failures ? 1 : 0);
})();
