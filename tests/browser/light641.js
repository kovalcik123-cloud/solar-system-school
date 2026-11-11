// Phase 6H.4.1 15-second journey harness (outside the repository). A test-only fixture lesson step
// { kind: 'light-travel', journey: 'fifteen' } is injected into this browser only; "pohyb" stays inactive in the app.
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path'), vm = require('vm');
const S = __dirname, ROOT = require('./env').ROOT, OUT = require('./env').out('light641'), PORT = Number(process.env.PORT || 8915);
fs.mkdirSync(OUT, { recursive: true });
const server = http.createServer((q, r) => { const u = decodeURIComponent(q.url.split('?')[0]); fs.readFile(path.join(ROOT, u === '/' ? 'index.html' : u), (e, d) => { if (e) { r.writeHead(404); r.end(); } else r.end(d); }); }).listen(PORT);
const FIXTURE = `window.LearnContent.topics.push({"id":"test-svetlo","title":"Testovacia lekcia","description":"Len na testovanie.","minutes":1}); window.LearnContent.lessons.push(${JSON.stringify({ id: 'test-svetlo', title: 'Svetlo — technický test', objective: 'Len na testovanie.', limitation: 'Len na testovanie.', steps: [
  { id: 'uvod', type: 'intro', title: 'Úvod — test', text: 'Len na testovanie.' },
  { id: 'svetlo15', type: 'experiment', title: 'Svetlo za 15 sekúnd', text: 'Len na testovanie.', experiment: { kind: 'light-travel', journey: 'fifteen' } },
  { id: 'svetlo1', type: 'experiment', title: 'Svetlo za jednu sekundu', text: 'Len na testovanie.', experiment: { kind: 'light-travel', journey: 'earth-moon' } },
  { id: 'zaver', type: 'summary', title: 'Koniec testu', ideas: ['Len na testovanie.'], text: 'Len na testovanie.' }] })});`;
const W = {}; vm.runInContext(fs.readFileSync(path.join(ROOT, 'light-data.js'), 'utf8'), vm.createContext({ window: W, Intl })); const L = W.LightData;
const C = L.C_KM_PER_S, D15 = L.lightDistanceKm(15), UNIT = L.earthMoon.centerKm;
let failures = 0, passes = 0;
const check = (label, ok, detail = '') => { ok ? passes++ : failures++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${!ok && detail ? '  — ' + String(detail).slice(0, 900) : ''}`); };
const near = (a, b, tol) => Math.abs(a - b) <= tol;
async function open(browser, w, h) {
  const context = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: w < 500 }), pg = await context.newPage(), errors = [];
  pg.on('pageerror', e => errors.push(e.message)); pg.on('console', m => { if (m.type() === 'error' || /THREE\.WebGL|shader/i.test(m.text())) errors.push('console: ' + m.text()); });
  await pg.route('**/three.min.js', r => r.fulfill({ path: require('./env').vendor('three.min.js') }));
  await pg.route('**/OrbitControls.js', r => r.fulfill({ path: require('./env').vendor('OrbitControls.js') }));
  await pg.route('**/learn-content.sk.js', async r => { const res = await r.fetch(); r.fulfill({ response: res, body: (await res.text()) + '\n' + FIXTURE }); });
  await pg.goto(`http://localhost:${PORT}/`); await pg.waitForTimeout(600);
  await pg.fill('#activation-code', 'NGV-2025'); await pg.evaluate(() => checkCode()); await pg.waitForTimeout(2400);
  await pg.evaluate(() => { if (areOrbitsActive) toggleOrbit(); });
  await pg.evaluate(() => { Learn.enter(); [...document.querySelectorAll('.learn-topic')].find(c => c.querySelector('h3').textContent === 'Testovacia lekcia').querySelector('button').click(); });
  await pg.waitForTimeout(400); await pg.evaluate(() => document.querySelector('.learn-footer .learn-primary').click()); await pg.waitForTimeout(500);
  return { pg, errors, context };
}
const frames = (pg, n = 3) => pg.evaluate(n => new Promise(res => { let k = 0; const f = () => (++k >= n ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
const fake = pg => pg.evaluate(() => { window.__realNow = performance.now.bind(performance); window.__t = window.__realNow(); performance.now = () => window.__t; });
const advance = async (pg, ms, n = 2) => { await pg.evaluate(ms => { window.__t += ms; }, ms); await frames(pg, n); };
const st = pg => pg.evaluate(() => lightStage.state());
// Overlay audit: visible items not clipped, not over the panel or planet bar, not overlapping each other; no horizontal page overflow.
const AUDIT = () => {
  const pr = document.getElementById('learn-root').getBoundingClientRect(), nav = document.getElementById('planet-nav').getBoundingClientRect();
  const hit = (a, b) => a.left < b.right - 0.5 && a.right > b.left + 0.5 && a.top < b.bottom - 0.5 && a.bottom > b.top + 0.5;
  const items = [...document.querySelectorAll('#light-stage-overlay > div')].filter(e => !e.hidden && e.getBoundingClientRect().width > 0).map(e => ({ cls: e.className + ':' + e.textContent.slice(0, 10), r: e.getBoundingClientRect() }));
  const bad = [];
  items.forEach(a => { if (a.r.left < 0 || a.r.right > innerWidth || a.r.top < 0 || a.r.bottom > innerHeight) bad.push(`clipped ${a.cls}`); if (hit(a.r, pr)) bad.push(`over panel ${a.cls}`); if (hit(a.r, nav)) bad.push(`over nav ${a.cls}`); });
  items.forEach((a, i) => items.slice(i + 1).forEach(b => { if (hit(a.r, b.r)) bad.push(`overlap ${a.cls} / ${b.cls}`); }));
  // The scale bar's label is a child span: check it against the other items too.
  const label = document.querySelector('#light-stage-overlay .light-scale span'), lr = label?.getBoundingClientRect();
  if (lr && lr.width) items.filter(a => !a.cls.startsWith('light-scale')).forEach(a => { if (hit(lr, a.r)) bad.push(`overlap scale-label / ${a.cls}`); });
  // Clear separation (Phase 6H.4.1a): scale bar and label at least 12 px from the time and distance readouts.
  const gap = (a, b) => Math.max(a.left - b.right, b.left - a.right, a.top - b.bottom, b.top - a.bottom);
  const scale = document.querySelector('#light-stage-overlay .light-scale');
  if (scale && !scale.hidden) for (const box of [scale.getBoundingClientRect(), lr].filter(Boolean)) for (const sel of ['.light-time', '.light-distance']) {
    const e = document.querySelector(`#light-stage-overlay ${sel}`); if (!e || e.hidden || !e.getBoundingClientRect().width) continue;
    const g = gap(box, e.getBoundingClientRect()); if (g < 12) bad.push(`scale too close to ${sel} (${g.toFixed(1)} px)`); }
  if (document.documentElement.scrollWidth > innerWidth) bad.push('horizontal page overflow');
  return bad;
};
const MAIN_STATE = () => { const r = v => v.toArray().map(x => +x.toFixed(9)).join(); return { camera: r(camera.position), playing: areOrbitsActive, controls: controls.enabled, planets: planets.map(p => r(p.position)).join('|'), children: scene.children.length }; };

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  for (const [w, h] of [[1920, 1080], [1366, 768], [390, 844], [390, 667], [844, 390]]) {
    const tag = `${w}×${h}`, { pg, errors, context } = await open(browser, w, h);
    if (w === 844) check(`${tag} the 15 s step uses the short-landscape side layout`, await pg.evaluate(() => document.getElementById('learn-root').dataset.layout === 'side'));
    await fake(pg); await advance(pg, 50);
    let s = await st(pg); const v = s.view, base = { perPx: v.perPx, y: v.y, source: v.source };
    // Geometry straight from the stage (world units: 1 = 1 000 km).
    check(`${tag} journey "fifteen": route from Earth's surface to exactly c × 15 s = 4 496 886,87 km; ruler unit = 384 400 km = orbit radius; ${s.world.units.toFixed(4)} units`,
      s.journey === 'fifteen' && near(s.world.end * 1000, D15, 1e-6) && near(s.world.unit * 1000, UNIT, 1e-9) && s.world.orbitR === s.world.unit && near(s.world.units, D15 / UNIT, 1e-12) && near(s.world.earthX + s.world.earthR, 0, 1e-12), JSON.stringify(s.world));
    const rulerOk = v.ruler.slice(0, -1).every((t, i) => t.unit === i + 1 && near(t.x, v.source + (i + 1) * UNIT / 1000 / v.perPx, 1e-6)) && v.ruler.length === 12 && near(v.ruler[11].x, v.source + D15 / 1000 / v.perPx, 1e-6);
    const milesOk = v.milestones.length === 4 && v.milestones.every(m => near(m.km, C * m.seconds, 1e-6) && near(m.x, v.source + C * m.seconds / 1000 / v.perPx, 1e-6) && !m.reached);
    check(`${tag} ruler ticks at 1…11 units and the 11,7× end; milestones 1/5/10/15 s at c × t (${v.milestones.map(m => m.x.toFixed(1)).join(', ')} px), all muted at the start`, rulerOk && milesOk, JSON.stringify({ ruler: v.ruler, ms: v.milestones }));
    const labels = await pg.evaluate(() => ({ ruler: [...document.querySelectorAll('#light-stage-overlay .light-ruler')].filter(e => !e.hidden).map(e => e.textContent), miles: [...document.querySelectorAll('#light-stage-overlay .light-mile')].filter(e => !e.hidden).map(e => e.textContent), moonLabel: [...document.querySelectorAll('#light-stage-overlay .light-label')].filter(e => !e.hidden).map(e => e.textContent), scale: document.querySelector('#light-stage-overlay .light-scale span').textContent.replace(/ /g, ' '), note: document.querySelector('#light-stage-overlay .light-note').textContent }));
    check(`${tag} labels: ruler ${labels.ruler.join(' ')} ("11,7×" hidden until the result, 6H.4.2), milestones ${labels.miles.join(' ')}, only "Zem" (no Moon body or label), scale "${labels.scale}"; Earth at true size ${v.earth.diameterPx.toFixed(2)} px with its marker ring; orbit radius ${v.orbitRadiusPx.toFixed(1)} px`,
      labels.ruler.join() === '1×,5×,10×' && labels.miles.join() === '1 s,5 s,10 s,15 s' && labels.moonLabel.join() === 'Zem' && labels.scale === '1 000 000 km' && near(v.earth.diameterPx, 12.742 / v.perPx, 1e-9) && v.earth.ring && near(v.orbitRadiusPx, v.unitPx, 1e-12)
      && await pg.evaluate(() => !window.__stage || true), JSON.stringify(labels));
    const panel = await pg.evaluate(() => ({ lead: document.querySelector('.learn-light-lead')?.textContent, lines: [...document.querySelectorAll('#learn-light-message p')].map(p => p.textContent), sliderHidden: (document.querySelector('.learn-light-pick')?.hidden ?? true) /* 6H.4.2: no slider element in the 15 s panel */, primary: document.querySelector('[data-focus="light-primary"]').textContent }));
    // Phase 6H.4.2: the ready lead is the prediction question; the scale introduction stays (panel line on wide layouts, "Vysvetlenie" always).
    const scaleIntro = await pg.evaluate(() => [...document.querySelectorAll('#learn-experiment-details p')].some(p => p.textContent.startsWith('Teraz sa pozeráme oveľa ďalej')));
    check(`${tag} panel (test fixture): the prediction question, the scale introduction (${w < 500 || w === 844 ? 'in "Vysvetlenie"' : 'panel line and "Vysvetlenie"'}), no slider, "Vyšli svetlo"`,
      panel.lead === 'Koľkokrát by svetlo za 15 sekúnd preletelo vzdialenosť Zem–Mesiac?' && scaleIntro && (w < 500 || w === 844 || panel.lines[0] === 'Zem a Mesiac budú vyzerať menšie, pretože vidíme omnoho väčšiu vzdialenosť.') && panel.sliderHidden && panel.primary === 'Vyšli svetlo', JSON.stringify(panel));
    const a0 = await pg.evaluate(`(${AUDIT})()`);
    await pg.screenshot({ path: path.join(OUT, `1-ready-${w}x${h}.png`) });
    // Countdown (not active time), then 5 s, 10 s, a pause near 12 s, and the exact 15 s stop.
    await pg.click('[data-focus="light-primary"]', { force: true }); await advance(pg, 3000); await advance(pg, 5000);
    const s5 = await st(pg); const a5 = await pg.evaluate(`(${AUDIT})()`);
    await pg.screenshot({ path: path.join(OUT, `2-five-seconds-${w}x${h}.png`) });
    check(`${tag} 5 s: exactly 1 498 962,29 km; front at c × 5 s; milestones 1 s and 5 s lit, 10 s and 15 s muted`, s5.phase === 'first' && near(s5.seconds, 5, 1e-9) && near(s5.travelledKm, C * 5, 1e-6) && near(s5.view.front, s5.view.source + C * 5 / 1000 / s5.view.perPx, 1e-6) && s5.view.milestones.map(m => m.reached).join() === 'true,true,false,false', JSON.stringify({ sec: s5.seconds, ms: s5.view.milestones.map(m => m.reached) }));
    await advance(pg, 5000); const s10 = await st(pg); const a10 = await pg.evaluate(`(${AUDIT})()`);
    await pg.screenshot({ path: path.join(OUT, `3-ten-seconds-${w}x${h}.png`) });
    check(`${tag} 10 s: exactly 2 997 924,58 km; 1/5/10 s lit, 15 s muted`, near(s10.seconds, 10, 1e-9) && near(s10.travelledKm, C * 10, 1e-6) && s10.view.milestones.map(m => m.reached).join() === 'true,true,true,false', JSON.stringify(s10.view.milestones));
    await advance(pg, 2000); await pg.click('[data-focus="light-primary"]', { force: true }); await advance(pg, 7000);
    const sp = await st(pg);
    await pg.click('[data-focus="light-primary"]', { force: true }); await advance(pg, 0, 1); const sr = await st(pg);
    check(`${tag} pause at 12 s: 7 s paused adds nothing; resume continues from the same front position`, sp.paused && near(sp.seconds, 12, 1e-9) && sr.run === 'running' && near(sr.view.front, sp.view.front, 1e-6), JSON.stringify({ sp: sp.seconds, sr: sr.seconds }));
    await advance(pg, 2500); await advance(pg, 1000, 3); const s15 = await st(pg); const a15 = await pg.evaluate(`(${AUDIT})()`);
    await pg.screenshot({ path: path.join(OUT, `4-fifteen-seconds-${w}x${h}.png`) });
    const endLabel = await pg.evaluate(() => [...document.querySelectorAll('#light-stage-overlay .light-ruler')].filter(e => !e.hidden).map(e => e.textContent).join());
    check(`${tag} at 15 s the ruler end label appears: ${endLabel}`, endLabel === '1×,5×,10×,11,7×');
    const out = await pg.evaluate(() => ({ time: document.querySelector('#light-stage-overlay .light-time').textContent.replace(/ /g, ' '), lead: document.querySelector('.learn-light-lead').textContent, primary: document.querySelector('[data-focus="light-primary"]').textContent }));
    check(`${tag} 15 s: stops at exactly 15 s / 4 496 886,87 km (static result "${out.time}"), front at the route end, all milestones lit; "Opakovať pokus"`,
      s15.phase === 'done' && s15.seconds === 15 && s15.travelledKm === D15 && near(s15.view.front, s15.view.end, 1e-9) && s15.view.milestones.every(m => m.reached) && /15,000 s/.test(out.time) && out.primary === 'Opakovať pokus', JSON.stringify({ s15: { phase: s15.phase, sec: s15.seconds, km: s15.travelledKm }, out }));
    check(`${tag} framing never changes (no camera motion or zoom): ready, 5 s, 10 s, pause, 15 s`, [s5, s10, sp, s15].every(x => x.view.perPx === base.perPx && x.view.y === base.y && x.view.source === base.source));
    const bad = [...a0, ...a5, ...a10, ...a15];
    check(`${tag} no clipped or overlapping labels; scale bar and label ≥ 12 px from the readouts; nothing over the panel or planet bar; no horizontal overflow`, bad.length === 0, JSON.stringify([...new Set(bad)]));
    // Advance at least one 60 fps frame interval (the app's frame limiter), so the reset is drawn before reading the highlights.
    await pg.click('[data-focus="light-primary"]', { force: true }); await advance(pg, 50); s = await st(pg);
    check(`${tag} repeat: back to ready at 0 km, milestones muted again`, s.phase === 'ready' && s.travelledKm === 0 && s.view.milestones.every(m => !m.reached), JSON.stringify({ phase: s.phase, km: s.travelledKm, ms: s.view?.milestones?.map(m => m.reached) }));
    check(`${tag} no JS or WebGL errors`, errors.length === 0, errors.join('; '));
    await context.close();
  }
  // Hidden page, switching journeys, the Earth–Moon step after the 15 s step, resources and listeners (1366×768).
  {
    const { pg, errors, context } = await open(browser, 1366, 768);
    await fake(pg); await advance(pg, 50);
    await pg.evaluate(() => lightStage.start()); await advance(pg, 3000); await advance(pg, 4000);
    await pg.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); document.dispatchEvent(new Event('visibilitychange')); });
    const h1 = await st(pg); await advance(pg, 600000); const h2 = await st(pg);
    await pg.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' }); document.dispatchEvent(new Event('visibilitychange')); }); await advance(pg, 100); const h3 = await st(pg);
    check('hidden page during the 15 s run: paused at 4 s, ten minutes hidden add nothing, still paused when visible', h1.paused && h1.pauseReason === 'hidden' && near(h1.seconds, 4, 1e-9) && h2.travelledKm === h1.travelledKm && h3.paused, JSON.stringify({ h1: h1.seconds, h3: h3.paused }));
    const sk = await pg.evaluate(() => { lightStage.reset(); lightStage.skip(); return lightStage.state(); });
    check('skip (reduced-motion path): the exact static 15 s result without movement', sk.phase === 'done' && sk.seconds === 15 && sk.travelledKm === 4496886.87 && sk.skipped);
    // Next step: the Earth–Moon experiment is unchanged (Moon visible, Earth–Moon framing and 1 s stop).
    await pg.evaluate(() => document.querySelector('.learn-footer .learn-primary').click()); await pg.waitForTimeout(400); await advance(pg, 16);
    let em = await st(pg);
    const vis = await pg.evaluate(() => ({ ruler: [...document.querySelectorAll('#light-stage-overlay .light-ruler, #light-stage-overlay .light-mile')].some(e => !e.hidden), moon: [...document.querySelectorAll('#light-stage-overlay .light-label')].filter(e => !e.hidden).map(e => e.textContent).join(), scale: document.querySelector('#light-stage-overlay .light-scale span').textContent.replace(/ /g, ' ') }));
    await pg.evaluate(() => lightStage.start()); await advance(pg, 3000); await advance(pg, 1200); const em1 = await st(pg);
    check('the next step (Earth–Moon) shows its own scene: no ruler or milestones, Earth and Moon labels, 100 000 km scale; its 1 s stop is exact', em.journey === 'earth-moon' && !vis.ruler && vis.moon === 'Zem,Mesiac' && vis.scale === '100 000 km' && em.view.moon.diameterPx > 0 && em1.phase === 'one-second' && em1.travelledKm === C, JSON.stringify({ vis, em1: em1.phase }));
    // Resources and listeners over journeys.
    const cyc = await pg.evaluate(() => {
      lightStage.end(); const info = () => { renderer.render(scene, camera); return [renderer.info.memory.geometries, renderer.info.memory.textures, renderer.info.programs.length].join(); };
      let vis = 0; const add = document.addEventListener.bind(document), rem = document.removeEventListener.bind(document);
      document.addEventListener = (t, f, o) => { if (t === 'visibilitychange') vis++; return add(t, f, o); }; document.removeEventListener = (t, f, o) => { if (t === 'visibilitychange') vis--; return rem(t, f, o); };
      lightStage.begin({ kind: 'light-travel', journey: 'fifteen' }); lightStage.render(); lightStage.configure({ journey: 'earth-moon' }); lightStage.render(); lightStage.end(); const before = info(); let maxVis = 0, stale = 0;
      for (let i = 0; i < 20; i++) {
        lightStage.begin({ kind: 'light-travel', journey: i % 2 ? 'fifteen' : 'earth-moon' }, () => { if (!lightStage.active) stale++; }); maxVis = Math.max(maxVis, vis);
        lightStage.start(); window.__t += 3000; lightStage.update(); window.__t += 7000; lightStage.update(); lightStage.render();
        if (i % 3 === 0) lightStage.pause();
        lightStage.end(); window.__t += 20000; lightStage.update(); lightStage.render();
      }
      return { before, after: info(), maxVis, visAfter: vis, stale };
    });
    check(`20 begin/run/end cycles alternating journeys (ending mid-run): resources ${cyc.before} → ${cyc.after}; one visibility listener at most, none after end; no stale callbacks`, cyc.after === cyc.before && cyc.maxVis === 1 && cyc.visAfter === 0 && cyc.stale === 0, JSON.stringify(cyc));
    check('no JS or WebGL errors (hidden page, journeys, lifecycle)', errors.length === 0, errors.join('; '));
    await context.close();
  }
  // Real clock: the 15 s run ends exactly; the Solar System is restored after leaving; "pohyb" inactive in the real catalogue.
  {
    const { pg, errors, context } = await open(browser, 1366, 768);
    const t0 = Date.now(); await pg.evaluate(() => lightStage.start()); await pg.waitForTimeout(18700); await frames(pg);
    const s = await st(pg);
    check(`real clock: countdown + 15 s → done at exactly 15 s / 4 496 886,87 km (wall ${((Date.now() - t0) / 1000).toFixed(1)} s)`, s.phase === 'done' && s.seconds === 15 && s.travelledKm === D15, JSON.stringify({ phase: s.phase, sec: s.seconds }));
    check('no JS or WebGL errors (real clock)', errors.length === 0, errors.join('; '));
    await context.close();
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } }), p2 = await ctx.newPage();
    await p2.route('**/three.min.js', r => r.fulfill({ path: require('./env').vendor('three.min.js') })); await p2.route('**/OrbitControls.js', r => r.fulfill({ path: require('./env').vendor('OrbitControls.js') }));
    await p2.goto(`http://localhost:${PORT}/`); await p2.waitForTimeout(600); await p2.fill('#activation-code', 'NGV-2025'); await p2.evaluate(() => checkCode()); await p2.waitForTimeout(2200);
    await p2.evaluate(() => Learn.enter()); await p2.waitForTimeout(300);
    const topics = await p2.evaluate(() => [...document.querySelectorAll('.learn-topic')].map(c => ({ t: c.querySelector('h3').textContent, on: !!c.querySelector('button') && !c.querySelector('button').disabled })));
    check('real catalogue: five topics active, "Pohyb vo vesmíre" inactive', topics.filter(t => t.on).length === 5 && topics.find(t => t.t === 'Pohyb vo vesmíre').on === false, JSON.stringify(topics));
    await ctx.close();
  }
  console.log(`${passes} passed, ${failures} failed`);
  await browser.close(); server.close();
})();
