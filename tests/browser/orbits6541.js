// Phase 6G.5.1 development harness (outside the repository). A temporary fixture lesson, injected only into this test
// browser, hosts the comparison stage; screenshots show its panel "Vývojový prípravok" (development only).
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const S = __dirname, ROOT = require('./env').ROOT, OUT = require('./env').out('orbits6541-shots');
fs.mkdirSync(OUT, { recursive: true });
const PORT = Number(process.env.PORT || 8871);
const server = http.createServer((q, r) => { const u = decodeURIComponent(q.url.split('?')[0]); fs.readFile(path.join(ROOT, u === '/' ? 'index.html' : u), (e, d) => { if (e) { r.writeHead(404); r.end(); } else r.end(d); }); }).listen(PORT);
const lesson = steps => `window.LearnContent.topics.push({"id":"test-svetlo","title":"Testovacia lekcia","description":"Len na testovanie.","minutes":1}); window.LearnContent.lessons.push(${JSON.stringify({ id: 'test-svetlo', title: 'Vývojový prípravok', objective: 'Len na testovanie.', limitation: 'Len na testovanie.', steps })});`;
const FIXTURE = lesson([
  { id: 'uvod', type: 'intro', title: 'Vývojový prípravok', text: 'Len na testovanie porovnávacej scény.' },
  { id: 'scena', type: 'observe', title: 'Vývojový prípravok', text: 'Len na testovanie: dočasný krok zobrazuje porovnávaciu scénu. Nie je to obsah lekcie.', demo: { kind: 'focus', body: 'earth', view: 'earth-moon' } },
  { id: 'zaver', type: 'summary', title: 'Koniec prípravku', ideas: ['Len na testovanie.'], text: 'Len na testovanie.' }]);
const EXPERIMENT = lesson([
  { id: 'uvod', type: 'intro', title: 'Porovnanie veľkostí — test', text: 'Len na testovanie.' },
  { id: 'porovnanie', type: 'experiment', title: 'Porovnanie veľkostí — test', text: 'Len na testovanie.', experiment: { kind: 'size-comparison' } },
  { id: 'zaver', type: 'summary', title: 'Koniec testu', ideas: ['Len na testovanie.'], text: 'Len na testovanie.' }]);
let failures = 0, passes = 0; const notes = [];
const check = (label, ok, detail = '') => { ok ? passes++ : failures++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? '  — ' + String(detail).slice(0, 700) : ''}`); };
async function open(browser, w, h, options = {}) {
  const context = await browser.newContext({ viewport: { width: w, height: h }, reducedMotion: options.reduced ? 'reduce' : 'no-preference' });
  const pg = await context.newPage(), errors = [];
  pg.on('pageerror', e => errors.push(e.message)); pg.on('console', m => { if (m.type() === 'error' || /THREE\.WebGL|shader/i.test(m.text())) errors.push('console: ' + m.text()); });
  await pg.route('**/three.min.js', r => r.fulfill({ path: require('./env').vendor('three.min.js') }));
  await pg.route('**/OrbitControls.js', r => r.fulfill({ path: require('./env').vendor('OrbitControls.js') }));
  const patch = options.patch === undefined ? FIXTURE : options.patch;
  if (patch) await pg.route('**/learn-content.sk.js', async r => { const res = await r.fetch(); r.fulfill({ response: res, body: (await res.text()) + '\n' + patch }); });
  await pg.goto(`http://localhost:${PORT}/`); await pg.waitForTimeout(600);
  await pg.fill('#activation-code', 'NGV-2025'); await pg.evaluate(() => checkCode()); await pg.waitForTimeout(2200);
  // Test-only hook: remembers the stage scene and camera the stage renders.
  await pg.evaluate(() => { const render = renderer.render.bind(renderer); renderer.render = (sc, cam) => { if (sc !== scene) window.__stage = { scene: sc, camera: cam }; return render(sc, cam); }; });
  return { pg, errors, context };
}
const settle = async pg => { await pg.waitForTimeout(200); await pg.waitForFunction(() => !cameraTransition, null, { timeout: 20000 }).catch(() => {}); await pg.waitForTimeout(150); };
const fixture = async pg => { await pg.evaluate(() => { Learn.enter(); [...document.querySelectorAll('.learn-topic')].find(c => c.querySelector('h3').textContent === 'Testovacia lekcia').querySelector('button').click(); document.querySelector('.learn-footer .learn-primary').click(); }); await settle(pg); };
const idle = pg => pg.waitForFunction(() => !comparisonStage.state().busy, null, { timeout: 15000 });
// Projected discs (CSS px), camera depth facts and layout checks for the current stage frame.
const MEASURE = () => {
  const { scene: sc, camera: cam } = window.__stage; cam.updateMatrixWorld();
  const project = v => { const p = v.clone().project(cam); return { x: (p.x + 1) / 2 * innerWidth, y: (1 - p.y) / 2 * innerHeight }; };
  const out = {};
  sc.children.filter(c => c.isMesh && c.userData.id).forEach(m => { const c = project(m.position), e = project(m.position.clone().add(new THREE.Vector3(m.scale.x, 0, 0))), t = project(m.position.clone().add(new THREE.Vector3(0, m.scale.x, 0)));
    out[m.userData.id] = { x: c.x, y: c.y, r: Math.hypot(e.x - c.x, e.y - c.y), rv: Math.hypot(t.x - c.x, t.y - c.y), opacity: m.material.opacity, front: m.position.z + m.scale.x, back: m.position.z - m.scale.x }; });
  const refs = sc.children.filter(c => c.isMesh && c.name === 'comparison-reference-earth').length;
  const ui = ['planet-nav', 'side-ui', 'learn-root'].map(id => document.getElementById(id)).filter(e => !e.hidden && getComputedStyle(e).visibility !== 'hidden').map(e => e.getBoundingClientRect());
  const overlap = (a, b) => a.left < b.right - 0.5 && a.right > b.left + 0.5 && a.top < b.bottom - 0.5 && a.bottom > b.top + 0.5;
  const box = d => ({ left: d.x - d.r, right: d.x + d.r, top: d.y - d.r, bottom: d.y + d.r });
  const inView = b => b.left >= -0.5 && b.top >= -0.5 && b.right <= innerWidth + 0.5 && b.bottom <= innerHeight + 0.5;
  const overlay = document.getElementById('comparison-overlay'), group = overlay.querySelector('.comparison-pair');
  const textRect = el => { const range = document.createRange(); range.selectNodeContents(el); const rs = [...range.getClientRects()].filter(r => r.width > 0); return rs.length ? { left: Math.min(...rs.map(r => r.left)), right: Math.max(...rs.map(r => r.right)), top: Math.min(...rs.map(r => r.top)), bottom: Math.max(...rs.map(r => r.bottom)) } : null; };
  const visible = el => getComputedStyle(el).visibility !== 'hidden';
  const texts = [...group.querySelectorAll('.comparison-pair-list li'), group.querySelector('.comparison-sentence')].filter(visible).map(textRect).filter(Boolean);
  const discs = Object.values(out);
  return { bodies: out, refs, camera: { z: cam.position.z, near: cam.near, far: cam.far, ortho: cam.isOrthographicCamera, left: cam.left, right: cam.right, top: cam.top, bottom: cam.bottom },
    allInView: discs.every(d => inView(box(d))), hitUI: discs.some(d => ui.some(u => overlap(box(d), u))), view: overlay.dataset.view, state: comparisonStage.state(),
    labels: [...group.querySelectorAll('.comparison-pair-list li')].map(li => `${li.querySelector('strong').textContent} | ${li.querySelector('.comparison-size').textContent.replace(/\s+/g, ' ')}`),
    sentence: group.querySelector('.comparison-sentence').textContent, caption: group.querySelector('.comparison-reference').textContent, captionShown: visible(group.querySelector('.comparison-reference')),
    textInView: texts.every(inView), textHitUI: texts.some(t => ui.some(u => overlap(t, u))), textHitDiscs: texts.some(t => discs.some(d => overlap(t, box(d)))) };
};
const measure = pg => pg.evaluate(`(() => { comparisonStage.render(); return (${MEASURE})(); })()`);
const MAIN_STATE = () => {
  const r = v => v.toArray().map(x => +x.toFixed(9)).join(); const clear = new THREE.Color(); renderer.getClearColor(clear);
  return { camera: r(camera.position), target: r(controls.target), near: camera.near, far: camera.far, controls: controls.enabled, playing: areOrbitsActive, speed: simulationSpeed, orbits: areOrbitLinesVisible,
    planets: planets.map(p => `${r(p.position)}:${p.rotation.y.toFixed(9)}:${p.scale.x}:${p.material.uuid}`).join('|'), moons: satellites.map(m => `${r(m.position)}:${m.rotation.y.toFixed(9)}:${m.material.uuid}`).join('|'),
    children: scene.children.length, renderer: [renderer.outputEncoding, renderer.getPixelRatio(), renderer.autoClear, clear.getHexString(), renderer.toneMapping].join() };
};
const SUNJ = 1391400 / 139822, BS = 764; // SizeData: Betelgeuse = 2 × 764 × 695 700 km, Sun = 2 × 695 700 km.
const LABEL_B = 'Betelgeuze | priemer asi 1,1 miliardy km (odhad)', LABEL_S = 'Slnko | priemer 1 391 400 km';
const SENTENCE = 'Betelgeuze má podľa jedného odhadu približne 760-krát väčší priemer ako Slnko.';
const ease = p => { const l = p / 100; return l * l * (3 - 2 * l); };
// Test-only deterministic clock in the page.
const startClock = pg => pg.evaluate(() => { const real = performance.now.bind(performance); window.__clock = { real, t0: real() }; window.__clock.now = window.__clock.t0; performance.now = () => window.__clock.now; });
const at = (pg, ms) => pg.evaluate(`(() => { window.__clock.now = window.__clock.t0 + ${ms}; comparisonStage.render(); return (${MEASURE})(); })()`);
const stopClock = pg => pg.evaluate(() => { performance.now = window.__clock.real; delete window.__clock; });
// Silhouette of the real Betelgeuse geometry: the outline vertices (z = 0 meridian, right half) projected to the screen;
// the largest gap between each on-screen chord and the true circle.
const SILHOUETTE = () => {
  const { scene: sc, camera: cam } = window.__stage, m = sc.children.find(c => c.isMesh && c.userData.id === 'betelgeuse');
  if (!m) return null;
  cam.updateMatrixWorld(); m.updateMatrixWorld();
  const pos = m.geometry.attributes.position, pts = [];
  for (let i = 0; i < pos.count; i++) if (Math.abs(pos.getZ(i)) < 1e-9 && pos.getX(i) >= -1e-9) pts.push(new THREE.Vector3(pos.getX(i), pos.getY(i), 0));
  const uniq = [...new Map(pts.map(p => [p.y.toFixed(9), p])).values()].sort((a, b) => a.y - b.y);
  const toScreen = v => { const p = v.clone().applyMatrix4(m.matrixWorld).project(cam); return { x: (p.x + 1) / 2 * innerWidth, y: (1 - p.y) / 2 * innerHeight }; };
  const c = toScreen(new THREE.Vector3()), r = m.scale.x, scr = uniq.map(toScreen);
  let max = 0, onScreen = 0;
  for (let i = 1; i < scr.length; i++) {
    const a = scr[i - 1], b = scr[i], mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const inside = p => p.x >= 0 && p.x <= innerWidth && p.y >= 0 && p.y <= innerHeight;
    if (!inside(a) && !inside(b) && !inside(mid)) continue;
    onScreen++; max = Math.max(max, r - Math.hypot(mid.x - c.x, mid.y - c.y));
  }
  return { segments: uniq.length - 1, onScreen, maxDeviation: max, radius: r };
};
const silhouette = pg => pg.evaluate(`(${SILHOUETTE})()`);
const resources = pg => pg.evaluate(() => { renderer.render(scene, camera); comparisonStage.render(); return [renderer.info.memory.geometries, renderer.info.memory.textures, renderer.info.programs.length].join(); });
const PCTS = [0, 10, 25, 50, 75, 90, 100];
const AU = { mercury: 0.38709927, venus: 0.72333566, earth: 1.00000261, mars: 1.52371034, jupiter: 5.20288700 };
const IDS = Object.keys(AU), RS = 695700, AUKM = 149597870.7, REF = 764 * RS / AUKM, LOW = 702 * RS / AUKM, HIGH = 880 * RS / AUKM;
const ORBIT = () => {
  const { scene: sc, camera: cam } = window.__stage; cam.updateMatrixWorld();
  const project = v => { const p = v.clone().project(cam); return { x: (p.x + 1) / 2 * innerWidth, y: (1 - p.y) / 2 * innerHeight }; };
  const group = sc.children.find(c => c.name === 'comparison-orbits');
  const meshes = group ? group.children : [];
  const ring = m => { const p = m.geometry.parameters, c = project(m.position.clone()), e = project(m.position.clone().add(new THREE.Vector3((p.innerRadius + p.outerRadius) / 2, 0, 0))); return { x: c.x, y: c.y, r: Math.hypot(e.x - c.x, e.y - c.y), inner: p.innerRadius, outer: p.outerRadius, opacity: m.material.opacity, visible: m.visible, depthTest: m.material.depthTest, order: m.renderOrder, color: m.material.color.getHexString() }; };
  const rings = meshes.filter(m => m.renderOrder === 3).map(ring), band = meshes.find(m => m.renderOrder === 2);
  const b = sc.children.find(c => c.isMesh && c.userData.id === 'betelgeuse');
  const bc = b ? project(b.position.clone()) : null, be = b ? project(b.position.clone().add(new THREE.Vector3(b.scale.x, 0, 0))) : null;
  const o = document.getElementById('comparison-overlay'), g = o.querySelector('.comparison-orbits');
  const shown = el => !o.hidden && !g.hidden && getComputedStyle(el).visibility !== 'hidden' && getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().width > 1;
  const centre = g.querySelector('.comparison-orbit-centre').getBoundingClientRect();
  const ui = ['planet-nav', 'side-ui', 'learn-root'].map(id => document.getElementById(id)).filter(e => !e.hidden && getComputedStyle(e).visibility !== 'hidden').map(e => e.getBoundingClientRect());
  const overlap = (a, c) => a.left < c.right - 0.5 && a.right > c.left + 0.5 && a.top < c.bottom - 0.5 && a.bottom > c.top + 0.5;
  const inWin = a => a.left >= -0.5 && a.top >= -0.5 && a.right <= innerWidth + 0.5 && a.bottom <= innerHeight + 0.5;
  const textRect = el => { const range = document.createRange(); range.selectNodeContents(el); const rs = [...range.getClientRects()].filter(x => x.width > 1); return rs.length ? { left: Math.min(...rs.map(x => x.left)), right: Math.max(...rs.map(x => x.right)), top: Math.min(...rs.map(x => x.top)), bottom: Math.max(...rs.map(x => x.bottom)) } : null; };
  const tags = [...g.querySelectorAll('.comparison-orbit-tags > div')].map(textRect).filter(Boolean);
  const visibleRects = [...g.querySelectorAll('.comparison-orbit-text li, .comparison-orbit-text p')].filter(el => !el.classList.contains('comparison-word') && getComputedStyle(el).visibility !== 'hidden')
    .flatMap(el => [...el.childNodes].filter(n => !(n.nodeType === 1 && (n.classList.contains('comparison-word') || n.hidden)))).map(n => { if (n.nodeType === 3) { const r = document.createRange(); r.selectNode(n); return r; } return n; })
    .flatMap(x => [...x.getClientRects()]).filter(x => x.width > 1);
  const textBlock = visibleRects.length ? { left: Math.min(...visibleRects.map(x => x.left)), right: Math.max(...visibleRects.map(x => x.right)), top: Math.min(...visibleRects.map(x => x.top)), bottom: Math.max(...visibleRects.map(x => x.bottom)) } : null;
  const J = rings[4], jBox = J ? { left: J.x - J.r, right: J.x + J.r, top: J.y - J.r, bottom: J.y + J.r } : null;
  const pairs = []; for (let i = 0; i < tags.length; i++) for (let k = i + 1; k < tags.length; k++) pairs.push(overlap(tags[i], tags[k]));
  const legend = [...g.querySelectorAll('.comparison-orbit-legend li')].map(li => li.textContent);
  return { rings, band: band ? ring(band) : null, bandVisible: band ? band.visible : false, star: b ? { x: bc.x, y: bc.y, r: Math.hypot(be.x - bc.x, be.y - bc.y), opacity: b.material.opacity, visible: b.visible } : null,
    centre: { x: centre.left + centre.width / 2, y: centre.top + centre.height / 2, size: centre.width }, view: o.dataset.view, groupShown: !o.hidden && !g.hidden, otherShown: [...o.children].filter(c => !c.classList.contains('comparison-orbits')).some(c => !c.hidden),
    jupiterInWindow: jBox ? inWin(jBox) : null, jupiterHitsUI: jBox ? ui.some(u => overlap(jBox, u)) : null, tagsInWindow: tags.every(inWin), tagsHitUI: tags.some(t => ui.some(u => overlap(t, u))), tagsOverlap: pairs.some(Boolean),
    textInWindow: textBlock ? inWin(textBlock) : null, textHitsUI: textBlock ? ui.some(u => overlap(textBlock, u)) : null, textHitsJupiter: textBlock && jBox ? overlap(textBlock, jBox) : null, tagsHitText: textBlock ? tags.some(t => overlap(t, textBlock)) : null,
    legend, sentence: g.querySelector('.comparison-orbit-sentence').textContent, starLegendShown: getComputedStyle(g.querySelector('.orbit-legend-star')).visibility !== 'hidden',
    compact: g.dataset.compact, side: g.dataset.side, centreAria: g.querySelector('.comparison-orbit-centre').getAttribute('aria-hidden'), focusables: o.querySelectorAll('a, button, input, select, textarea, [tabindex]').length,
    pointer: getComputedStyle(o).pointerEvents, groupCount: sc.children.filter(c => c.name === 'comparison-orbits').length, state: comparisonStage.state() };
};
const orbit = pg => pg.evaluate(`(() => { comparisonStage.render(); return (${ORBIT})(); })()`);
const orbitAt = (pg, ms) => pg.evaluate(`(() => { window.__clock.now = window.__clock.t0 + ${ms}; comparisonStage.render(); return (${ORBIT})(); })()`);
const near = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));
const AFTER = 'Dráhy Merkúra, Venuše, Zeme a Marsu by boli vnútri Betelgeuze. Dráha Jupitera by zostala mimo nej.';
const BEFORE = 'Kruhy ukazujú vzdialenosti dráh planét od Slnka v skutočnom pomere.';

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  // 0. Data.
  {
    const { pg, errors, context } = await open(browser, 1366, 768);
    const d = await pg.evaluate(() => ({ au: SizeData.AU_KM, orbits: { ...SizeData.orbitsAu }, r: { ...SizeData.betelgeuseRadiusAu }, frozen: Object.isFrozen(SizeData.orbitsAu) && Object.isFrozen(SizeData.betelgeuseRadiusAu),
      ratios: [SizeData.ratio('betelgeuse', 'sun'), SizeData.ratio('sun', 'jupiter'), SizeData.ratio('jupiter', 'earth')], sun: SizeData.bodies.sun.diameterKm, bet: SizeData.bodies.betelgeuse.diameterKm }));
    check(`data: 1 AU = 149 597 870.7 km; JPL semi-major axes exact; immutable`, d.au === AUKM && IDS.every(id => d.orbits[id] === AU[id]) && Object.keys(d.orbits).length === 5 && d.frozen, JSON.stringify(d.orbits));
    check(`data: Betelgeuse radius ${d.r.lower.toFixed(3)} / ${d.r.reference.toFixed(3)} / ${d.r.upper.toFixed(3)} AU (expected 3.265 / 3.553 / 4.092)`, near(d.r.lower, LOW, 1e-12) && near(d.r.reference, REF, 1e-12) && near(d.r.upper, HIGH, 1e-12) && d.r.lower.toFixed(3) === '3.265' && d.r.reference.toFixed(3) === '3.553' && d.r.upper.toFixed(3) === '4.092');
    check('data: existing diameters and ratios unchanged (764; Sun/Jupiter 9.951224; Jupiter/Earth 10.973317)', d.ratios[0] === 764 && d.ratios[1].toFixed(6) === '9.951224' && d.ratios[2].toFixed(6) === '10.973317' && d.sun === 1391400 && d.bet === 2 * 764 * 695700, JSON.stringify(d.ratios));
    await context.close();
  }
  // 1. Five viewports: initial and revealed.
  for (const [w, h] of [[1920, 1080], [1366, 768], [390, 844], [390, 667], [844, 390]]) {
    const tag = `${w}×${h}`, { pg, errors, context } = await open(browser, w, h);
    await fixture(pg);
    const ok = await pg.evaluate(() => comparisonStage.begin({ orbits: 'sun' })); await pg.waitForTimeout(300);
    let o = await orbit(pg);
    const J = o.rings[4], s = J.r / AU.jupiter;
    check(`${tag} initial: five orbits, Sun symbol, no Betelgeuse, no band; other overlay groups hidden`, ok && o.rings.length === 5 && o.view === 'orbits' && o.groupShown && !o.otherShown && o.star && !o.star.visible && o.star.opacity === 0 && !o.bandVisible && o.state.orbits === 'sun' && !o.state.busy);
    check(`${tag} one AU scale: every orbit radius / Jupiter's equals its AU ratio; all circles share one centre`, o.rings.every((r, i) => near(r.r / J.r, AU[IDS[i]] / AU.jupiter, 1e-9) && Math.abs(r.x - J.x) < 1e-6 && Math.abs(r.y - J.y) < 1e-6));
    check(`${tag} Sun symbol centred on the orbits (error ${Math.hypot(o.centre.x - J.x, o.centre.y - J.y).toFixed(3)} px), ${o.centre.size.toFixed(0)} px, inside Mercury's orbit (${o.rings[0].r.toFixed(1)} px)`, Math.hypot(o.centre.x - J.x, o.centre.y - J.y) < 0.5 && o.centre.size / 2 < o.rings[0].r - 1 && o.centreAria === 'true');
    const gaps = o.rings.slice(1).map((r, i) => r.r - o.rings[i].r - r.outer + r.r - (o.rings[i].outer - o.rings[i].r));
    check(`${tag} spacing: visible gaps between neighbouring circles (smallest ${Math.min(...gaps).toFixed(1)} px; true proportions)`, Math.min(...gaps) >= 2, JSON.stringify(gaps.map(x => +x.toFixed(1))));
    check(`${tag} layout: Jupiter's orbit fully visible, clear of panel and navigation; labels and legend inside the window, not overlapping each other, the UI or Jupiter's orbit`, o.jupiterInWindow && !o.jupiterHitsUI && o.tagsInWindow && !o.tagsHitUI && !o.tagsOverlap && o.textInWindow && !o.textHitsUI && !o.tagsHitText && (o.side === 'true' ? !o.textHitsJupiter : true), JSON.stringify({ j: [o.jupiterInWindow, o.jupiterHitsUI], tags: [o.tagsInWindow, o.tagsHitUI, o.tagsOverlap], text: [o.textInWindow, o.textHitsUI, o.textHitsJupiter, o.tagsHitText], compact: o.compact, side: o.side }));
    check(`${tag} accessible text: legend with every orbit and distance, Sun place, sentence; no focusable elements; no pointer capture`, ['Merkúr – 0,39 AU', 'Venuša – 0,72 AU', 'Zem – 1,00 AU', 'Mars – 1,52 AU', 'Jupiter – 5,20 AU'].every((t, i) => o.legend[i].includes(t)) && o.legend[5] === 'Tu je miesto Slnka (značka = poloha, nie veľkosť)' && o.sentence === BEFORE && !o.starLegendShown && o.focusables === 0 && o.pointer === 'none', JSON.stringify(o.legend));
    await pg.screenshot({ path: path.join(OUT, `initial-${w}x${h}.png`) });
    // Reveal: 900 ms opacity fade at a fixed true radius.
    await startClock(pg); await pg.evaluate(() => comparisonStage.configure({ orbits: 'betelgeuse' }));
    const f = [];
    for (const ms of [0, 450, 899]) f.push(await orbitAt(pg, ms));
    const done = await orbitAt(pg, 901);
    await stopClock(pg); await pg.waitForTimeout(150);
    o = await orbit(pg);
    const B = o.star;
    check(`${tag} reveal: busy for 900 ms; opacity ${f.map(x => x.star.opacity.toFixed(2)).join(' → ')} → 1; radius fixed at ${B.r.toFixed(1)} px the whole time; done at 901 ms`, f.every(x => x.state.busy) && !done.state.busy && f[0].star.opacity === 0 && f[1].star.opacity > 0.4 && f[1].star.opacity < 0.6 && f.every(x => Math.abs(x.star.r - B.r) < 1e-6) && f.every(x => x.rings.every((r, i) => Math.abs(r.r - o.rings[i].r) < 1e-9)) && B.opacity === 1 && B.visible);
    check(`${tag} Betelgeuse on the same scale: radius / Jupiter's orbit = ${(B.r / J.r).toFixed(6)} (${(REF / AU.jupiter).toFixed(6)}); centred (error ${Math.hypot(B.x - J.x, B.y - J.y).toFixed(4)} px)`, near(B.r / J.r, REF / AU.jupiter, 1e-9) && Math.hypot(B.x - J.x, B.y - J.y) < 1e-6);
    check(`${tag} uncertainty band ${o.band.inner.toFixed(1)}–${o.band.outer.toFixed(1)} px = ${LOW.toFixed(3)}–${HIGH.toFixed(3)} AU on the same scale; visible (opacity ${o.band.opacity.toFixed(2)})`, near(o.band.inner / J.r, LOW / AU.jupiter, 1e-9) && near(o.band.outer / J.r, HIGH / AU.jupiter, 1e-9) && o.bandVisible && o.band.opacity > 0.2);
    check(`${tag} inner four orbits inside the reference star and highlighted above it; Jupiter outside, unchanged colour`, o.rings.slice(0, 4).every(r => r.r + (r.outer - r.r) < B.r && r.color === 'fff1c8' && !r.depthTest && r.order > 0) && J.r - (J.r - J.inner) > o.band.outer && o.rings[4].color === '9cc2e0');
    check(`${tag} texts after the reveal: sentence, Betelgeuse legend line, per-orbit inside/outside for screen readers`, o.sentence === AFTER && o.starLegendShown && o.legend.slice(0, 4).every(t => t.endsWith(', vnútri Betelgeuze')) && o.legend[4].endsWith(', mimo Betelgeuze') && o.legend[6].startsWith('Betelgeuze: polomer asi 3,6 AU (odhad 3,3–4,1 AU)'), JSON.stringify(o.legend));
    check(`${tag} revealed layout still clear (Jupiter's orbit, labels, legend)`, o.jupiterInWindow && !o.jupiterHitsUI && o.tagsInWindow && !o.tagsHitUI && !o.tagsOverlap && o.textInWindow && !o.textHitsUI);
    notes.push(`${tag}: ${o.compact === 'true' ? (o.side === 'true' ? 'compact, legend beside' : 'compact, legend below') : 'names on the orbits'}; Jupiter ${J.r.toFixed(1)} px, Mars ${o.rings[3].r.toFixed(1)} px, Mercury ${o.rings[0].r.toFixed(1)} px, Betelgeuse ${B.r.toFixed(1)} px, band ${o.band.inner.toFixed(1)}–${o.band.outer.toFixed(1)} px; Sun symbol ${o.centre.size.toFixed(0)} px at (${o.centre.x.toFixed(2)}, ${o.centre.y.toFixed(2)}); scale ${s.toFixed(3)} px/AU`);
    await pg.screenshot({ path: path.join(OUT, `revealed-${w}x${h}.png`) });
    if (w < 900) {
      const c = o.centre, side = Math.min(2 * o.rings[3].r + 30, 140), x = Math.max(0, Math.round(c.x - side / 2)), y = Math.max(0, Math.round(c.y - side / 2));
      await pg.screenshot({ path: path.join(OUT, `closeup-revealed-${w}x${h}.png`), clip: { x, y, width: Math.round(side), height: Math.round(side) } });
      await startClock(pg); await pg.evaluate(() => comparisonStage.configure({ orbits: 'sun' })); await orbitAt(pg, 901); await stopClock(pg); await pg.waitForTimeout(100);
      await pg.screenshot({ path: path.join(OUT, `closeup-initial-${w}x${h}.png`), clip: { x, y, width: Math.round(side), height: Math.round(side) } });
    } else { await startClock(pg); await pg.evaluate(() => comparisonStage.configure({ orbits: 'sun' })); await orbitAt(pg, 901); await stopClock(pg); await pg.waitForTimeout(100); }
    o = await orbit(pg);
    check(`${tag} reverse fade: Betelgeuse and band gone, Sun symbol and before-texts back`, !o.star.visible && o.star.opacity === 0 && !o.bandVisible && o.sentence === BEFORE && !o.starLegendShown && o.rings.slice(0, 4).every(r => r.color === '9cc2e0') && o.state.orbits === 'sun');
    await pg.evaluate(() => comparisonStage.end());
    check(`${tag}: no JS or WebGL errors`, errors.length === 0, errors.join('; '));
    await context.close();
  }
  // 2. Validation, reduced motion, lifecycle, resources, regressions (1366×768).
  {
    const { pg, errors, context } = await open(browser, 1366, 768);
    await fixture(pg);
    const before = await pg.evaluate(`(${MAIN_STATE})()`);
    await pg.evaluate(() => comparisonStage.begin({ orbits: 'sun' })); await pg.waitForTimeout(200);
    await pg.evaluate(() => comparisonStage.configure({ orbits: 'betelgeuse' })); await pg.waitForTimeout(150);
    const exit = await pg.evaluate(() => { const busy = comparisonStage.state().busy; comparisonStage.end(); const g = window.__stage.scene.children.find(c => c.name === 'comparison-orbits');
      return { busy, active: comparisonStage.active, overlay: document.getElementById('comparison-overlay').hidden, rings: g.visible, meshes: window.__stage.scene.children.filter(c => c.isMesh).length, cls: document.body.classList.contains('is-comparison'), controls: controls.enabled }; });
    await pg.waitForTimeout(200);
    const after = await pg.evaluate(`(${MAIN_STATE})()`), diff = Object.keys(before).filter(k => before[k] !== after[k]);
    check('exit during the fade: stage ended, overlay and rings hidden, no meshes, Solar System identical', exit.busy && !exit.active && exit.overlay && !exit.rings && exit.meshes === 0 && !exit.cls && exit.controls && diff.length === 0, JSON.stringify({ exit, diff }));
    await pg.evaluate(() => comparisonStage.begin({ orbits: 'sun' })); await pg.waitForTimeout(200);
    const v = await pg.evaluate(() => [{ orbits: 'jupiter' }, { orbits: true }, { orbits: 'sun', pair: ['sun', 'jupiter'] }, { orbits: 'betelgeuse', reference: true }, { orbits: '' }].map(c => comparisonStage.configure(c)));
    check('validation: only { orbits: "sun" } and { orbits: "betelgeuse" }; anything else rejected and the view unchanged', v.every(x => x === false) && (await pg.evaluate(() => comparisonStage.state().orbits)) === 'sun', JSON.stringify(v));
    // Resize at rest and during the fade.
    await pg.setViewportSize({ width: 390, height: 844 }); await pg.waitForTimeout(300);
    let o = await orbit(pg);
    check('resize at rest (1366 → 390×844): relaid out, one scale, Jupiter visible and clear', o.jupiterInWindow && !o.jupiterHitsUI && o.rings.every((r, i) => near(r.r / o.rings[4].r, AU[IDS[i]] / AU.jupiter, 1e-9)) && o.compact === 'true');
    await pg.evaluate(() => comparisonStage.configure({ orbits: 'betelgeuse' })); await pg.waitForTimeout(150);
    await pg.setViewportSize({ width: 1366, height: 768 }); await idle(pg); await pg.waitForTimeout(300);
    o = await orbit(pg);
    check('resize during the fade: ends revealed at the new size, Betelgeuse on the shared scale', o.star.visible && o.star.opacity === 1 && near(o.star.r / o.rings[4].r, REF / AU.jupiter, 1e-9) && o.jupiterInWindow && !o.jupiterHitsUI && o.compact === 'false');
    // Switching away and back: other views get their overlay back, nothing stale.
    await pg.evaluate(() => comparisonStage.configure({ pair: ['betelgeuse', 'sun'] })); await idle(pg); await pg.waitForTimeout(150);
    const pairView = await pg.evaluate(`(() => { comparisonStage.render(); const o = document.getElementById('comparison-overlay'); const g = window.__stage.scene.children.find(c => c.name === 'comparison-orbits');
      return { view: o.dataset.view, orbitsHidden: o.querySelector('.comparison-orbits').hidden, pairHidden: o.querySelector('.comparison-pair').hidden, rings: g.visible, marker: !o.querySelector('.comparison-sun-marker').hidden, meshes: window.__stage.scene.children.filter(c => c.isMesh).length }; })()`);
    const m = await measure(pg);
    check('orbits → Betelgeuse–Sun pair: pair overlay and Sun marker back, orbit rings and texts hidden, ratio 764, two bodies', pairView.view === 'pair' && pairView.orbitsHidden && !pairView.pairHidden && !pairView.rings && pairView.marker && pairView.meshes === 2 && Math.abs(m.bodies.betelgeuse.r / m.bodies.sun.r - 764) < 1e-6 * 764, JSON.stringify(pairView));
    await pg.evaluate(() => comparisonStage.configure({ orbits: 'sun' })); await pg.waitForTimeout(150);
    o = await orbit(pg);
    check('back to orbits: Betelgeuse hidden at once, rings shown, one orbit group', o.groupShown && !o.otherShown && !o.star.visible && o.groupCount === 1 && !o.state.busy);
    // Re-entry.
    await pg.evaluate(() => comparisonStage.end()); await pg.evaluate(() => comparisonStage.begin({ orbits: 'betelgeuse' })); await pg.waitForTimeout(200);
    o = await orbit(pg);
    check('re-entry directly at { orbits: "betelgeuse" }: shown at once (no fade), texts revealed', o.star.visible && o.star.opacity === 1 && !o.state.busy && o.sentence === AFTER && o.groupCount === 1);
    // Resources over cycles.
    const res = () => pg.evaluate(() => { renderer.render(scene, camera); comparisonStage.render(); return [renderer.info.memory.geometries, renderer.info.memory.textures, renderer.info.programs.length].join(); });
    for (const c of [{ orbits: 'sun' }, { lineup: 'planets' }, { pair: ['jupiter', 'earth'], reference: true }, { pair: ['sun', 'jupiter'] }, { pair: ['betelgeuse', 'sun'] }, { orbits: 'betelgeuse' }]) { await pg.evaluate(c => comparisonStage.configure(c), c); await idle(pg); }
    const r0 = await res();
    for (let i = 0; i < 3; i++) for (const c of [{ orbits: 'sun' }, { orbits: 'betelgeuse' }, { pair: ['betelgeuse', 'sun'] }, { orbits: 'betelgeuse' }]) { await pg.evaluate(c => comparisonStage.configure(c), c); await idle(pg); }
    await pg.setViewportSize({ width: 844, height: 390 }); await pg.waitForTimeout(300); await pg.setViewportSize({ width: 1366, height: 768 }); await pg.waitForTimeout(300);
    const r1 = await res();
    check(`GPU resources stable over repeated reveals, view switches and relayouts (${r0} → ${r1})`, r0 === r1);
    // Regressions in the existing modes.
    await pg.evaluate(() => comparisonStage.configure({ lineup: 'planets' })); await idle(pg); let g = await measure(pg);
    const lineup = Object.keys(g.bodies).length === 8 && g.allInView && g.view === 'lineup';
    await pg.evaluate(() => comparisonStage.configure({ pair: ['jupiter', 'earth'], reference: true })); await idle(pg); g = await measure(pg);
    const ej = g.refs === 11 && g.sentence === 'Jupiter má približne 11-krát väčší priemer ako Zem.';
    await startClock(pg); await pg.evaluate(() => comparisonStage.configure({ pair: ['jupiter', 'sun'] }));
    const js = [(await at(pg, 1799)).state.busy, (await at(pg, 1801)).state.busy]; await stopClock(pg); await pg.waitForTimeout(100);
    await startClock(pg); await pg.evaluate(() => comparisonStage.configure({ pair: ['betelgeuse', 'sun'] }));
    const bs = [(await at(pg, 3999)).state.busy, (await at(pg, 4001)).state.busy]; await stopClock(pg); await pg.waitForTimeout(100);
    g = await measure(pg);
    check('regression: lineup, Earth–Jupiter with 11 Earths, Jupiter–Sun 1,800 ms, Sun–Betelgeuse 4,000 ms (ratio 764, Sun marker)', lineup && ej && js[0] && !js[1] && bs[0] && !bs[1] && Math.abs(g.bodies.betelgeuse.r / g.bodies.sun.r - 764) < 1e-6 * 764 && g.labels.join() === `${LABEL_B},${LABEL_S}`, JSON.stringify({ lineup, ej, js, bs }));
    await pg.evaluate(() => comparisonStage.end());
    check('no JS or WebGL errors (lifecycle)', errors.length === 0, errors.join('; '));
    await context.close();
  }
  // 3. Reduced motion.
  {
    const { pg, errors, context } = await open(browser, 1366, 768, { reduced: true });
    await fixture(pg);
    await pg.evaluate(() => comparisonStage.begin({ orbits: 'sun' })); await pg.waitForTimeout(200);
    const a = await pg.evaluate(`(() => { comparisonStage.configure({ orbits: 'betelgeuse' }); comparisonStage.render(); return (${ORBIT})(); })()`);
    const b = await pg.evaluate(`(() => { comparisonStage.configure({ orbits: 'sun' }); comparisonStage.render(); return (${ORBIT})(); })()`);
    check('reduced motion: reveal and return switch at once (never busy), texts follow', !a.state.busy && a.star.opacity === 1 && a.sentence === AFTER && !b.state.busy && !b.star.visible && b.sentence === BEFORE);
    await pg.evaluate(() => comparisonStage.end());
    check('no JS or WebGL errors (reduced motion)', errors.length === 0, errors.join('; '));
    await context.close();
  }
  await browser.close(); server.close();
  notes.forEach(n => console.log('NOTE  ' + n));
  console.log(`${passes} passed, ${failures} failed`);
  process.exit(failures ? 1 : 0);
})();
