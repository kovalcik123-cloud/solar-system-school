// Phase 6H.5.2.B Sun-to-planets light journey prototype harness (visual refinement) (outside the repository). The stage is driven directly with
// lightStage.begin({ journey: 'planets' }) while a test-only fixture lesson is open (no Learn UI integration in this phase).
// "pohyb" stays inactive in the app; the fixture is injected only into this test browser.
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const S = __dirname, ROOT = require('./env').ROOT, OUT = require('./env').out('light652'), PORT = Number(process.env.PORT || 8929);
fs.mkdirSync(OUT, { recursive: true });
const server = http.createServer((q, r) => { const u = decodeURIComponent(q.url.split('?')[0]); fs.readFile(path.join(ROOT, u === '/' ? 'index.html' : u), (e, d) => { if (e) { r.writeHead(404); r.end(); } else r.end(d); }); }).listen(PORT);
const FIXTURE = `window.LearnContent.topics.push({"id":"test-svetlo","title":"Testovacia lekcia","description":"Len na testovanie.","minutes":1}); window.LearnContent.lessons.push(${JSON.stringify({ id: 'test-svetlo', title: 'Svetlo — technický test', objective: 'Len na testovanie.', limitation: 'Len na testovanie.', steps: [
  { id: 'uvod', type: 'intro', title: 'Úvod — test', text: 'Len na testovanie.' },
  // Neutral technical placeholder (no experiment content). Its Earth–Moon demo only gives it the side-panel layout on short landscape screens;
  // the main scene with that demo is hidden while the light stage draws.
  { id: 'nahlad', type: 'observe', title: 'Technický náhľad', text: 'Svetlo zo Slnka k planétam – len vizuálna kontrola scény, bez úloh.', demo: { kind: 'focus', body: 'earth', view: 'earth-moon' } },
  { id: 'zaver', type: 'summary', title: 'Koniec testu', ideas: ['Len na testovanie.'], text: 'Len na testovanie.' }] })});`;
let failures = 0, passes = 0; const notes = [], limits = [];
const check = (label, ok, detail = '') => { ok ? passes++ : failures++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${!ok && detail ? '  — ' + String(detail).slice(0, 1200) : ''}`); };
async function open(browser, w, h) {
  const context = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: w < 500 }), pg = await context.newPage(), errors = [];
  pg.on('pageerror', e => errors.push(e.message)); pg.on('console', m => { if (m.type() === 'error' || /THREE\.WebGL|shader/i.test(m.text())) errors.push('console: ' + m.text()); });
  await pg.route('**/learn-content.sk.js', async r => { const res = await r.fetch(); r.fulfill({ response: res, body: (await res.text()) + '\n' + FIXTURE }); });
  await pg.goto(`http://localhost:${PORT}/`); await pg.waitForTimeout(600);
  await pg.fill('#activation-code', 'NGV-2025'); await pg.evaluate(() => checkCode()); await pg.waitForTimeout(2800);
  await pg.evaluate(() => { if (areOrbitsActive) toggleOrbit(); });
  await pg.evaluate(() => { Learn.enter(); [...document.querySelectorAll('.learn-topic')].find(c => c.querySelector('h3').textContent === 'Testovacia lekcia').querySelector('button').click(); });
  await pg.waitForTimeout(500);
  // The neutral placeholder step; on phones its panel is collapsed with its own "Menej" button (a light step's panel is compact).
  await pg.evaluate(() => document.querySelector('.learn-footer .learn-primary').click()); await pg.waitForTimeout(500);
  if (w < 500) { await pg.evaluate(() => [...document.querySelectorAll('#learn-root button')].find(b => b.textContent.trim() === 'Menej')?.click()); await pg.waitForTimeout(300); }
  return { pg, errors, context };
}
const frames = (pg, n = 3) => pg.evaluate(n => new Promise(res => { let k = 0; const f = () => (++k >= n ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
const fake = pg => pg.evaluate(() => { window.__realNow = window.__realNow || performance.now.bind(performance); window.__t = window.__realNow(); performance.now = () => window.__t; });
const advance = async (pg, ms, n = 2) => { await pg.evaluate(ms => { window.__t += ms; }, ms); await frames(pg, n); };
// Advance in realistic frame steps (≥ 50 ms because of the 60 fps limiter); records every state change of the arrivals.
async function play(pg, totalMs, stepMs = 100) { const seen = []; for (let t = 0; t < totalMs; t += stepMs) { await advance(pg, Math.min(stepMs, totalMs - t), 1); seen.push(await pg.evaluate(() => { const s = lightStage.state(); return { phase: s.phase, seconds: s.seconds, n: s.arrivals.length }; })); } return seen; }
const ST = pg => pg.evaluate(() => lightStage.state());
// Overlay geometry: visible planet/sun/group labels, caption, speed, readouts, scale, note; and the Learn panel rectangle.
const BOXES = () => { const r = e => { const b = e.getBoundingClientRect(); return { cls: e.className, text: e.textContent.slice(0, 22), l: b.left, t: b.top, r: b.right, b: b.bottom }; };
  const vis = [...document.querySelectorAll('#light-stage-overlay > div')].filter(e => !e.hidden && e.getBoundingClientRect().width > 0).map(r);
  const panel = document.getElementById('learn-root').getBoundingClientRect(), nav = document.getElementById('planet-nav').getBoundingClientRect();
  return { vis, panel: { l: panel.left, t: panel.top, r: panel.right, b: panel.bottom, hidden: document.getElementById('learn-root').hidden }, nav: { b: nav.bottom }, w: innerWidth, h: innerHeight }; };
const overlaps = (a, b, pad = 0) => a.l < b.r - pad && b.l < a.r - pad && a.t < b.b - pad && b.t < a.b - pad;
function layoutCheck(tag, moment, g) {
  const labels = g.vis.filter(v => /light-planet/.test(v.cls)), others = g.vis.filter(v => !/light-planet/.test(v.cls) && !/light-note/.test(v.cls));
  const bad = [];
  for (let i = 0; i < labels.length; i++) for (let j = i + 1; j < labels.length; j++) if (overlaps(labels[i], labels[j], 1)) bad.push(`labels ${labels[i].text} × ${labels[j].text}`);
  for (const l of labels) for (const o of others) if (overlaps(l, o, 1)) bad.push(`label ${l.text} × ${o.cls} ${o.text}`);
  for (const v of g.vis) { if (v.l < -1 || v.r > g.w + 1 || v.t < g.nav.b - 1 || v.b > g.h + 1) bad.push(`outside ${v.cls} ${v.text}`); if (!g.panel.hidden && overlaps(v, g.panel, 1)) bad.push(`under panel ${v.cls} ${v.text}`); }
  // 390×667: known prototype limitation (≈ 105 px free between the planet bar and the existing 15 s panel); recorded, not counted.
  check(`${tag} ${moment}: no overlapping labels/readouts; everything on screen, below the planet bar and clear of the Learn panel (${labels.length} labels)`, bad.length === 0, bad.join('; '));
}

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const VIEWS = [[1366, 768, true], [390, 844, true], [844, 390, true], [1920, 1080, false], [390, 667, true]];
  let world = null;
  for (const [w, h, shots] of VIEWS) {
    const tag = `${w}×${h}`, { pg, errors, context } = await open(browser, w, h);
    await fake(pg); await advance(pg, 50);
    const began = await pg.evaluate(() => lightStage.begin({ kind: 'light-travel', journey: 'planets' }, () => {}));
    await advance(pg, 50, 3);
    const shot = async name => { if (shots) await pg.screenshot({ path: path.join(OUT, `${name}-${w}x${h}.png`) }); };
    let s = await ST(pg);
    check(`${tag}: planets journey starts ready in the 0–1,7 au view (Learn open, lightStage active)`, began && s.active && s.journey === 'planets' && s.phase === 'ready' && s.stage === 'inner' && s.view?.name === 'inner' && s.seconds === 0 && s.arrivals.length === 0, JSON.stringify(s).slice(0, 400));
    world = s.world;
    // Linear scale: every shown marker sits at sun + x / perPx; the four inner planets in this view; the outer ones are off-view.
    const lin = v => v.markers.every((m, i) => !m.shown || Math.abs(m.x - (v.sun + world.planets[i].x / v.perPx)) < 0.01);
    check(`${tag} view A: one linear scale (marker = Sun + distance / scale for all shown planets); Mercury–Mars shown, Jupiter–Neptune off this view; Mars at ${(s.view.markers[3].x - s.view.sun).toFixed(0)} px of ${(s.view.axisEnd - s.view.sun).toFixed(0)} px (1,524 / 1,7 au)`,
      lin(s.view) && s.view.markers.slice(0, 4).every(m => m.shown && m.sizePx === 10) && s.view.markers.slice(4).every(m => !m.shown) && Math.abs((s.view.markers[3].x - s.view.sun) / (s.view.axisEnd - s.view.sun) - world.planets[3].au / 1.7) < 1e-6, JSON.stringify(s.view));
    layoutCheck(tag, 'A ready', await pg.evaluate(`(${BOXES})()`)); await shot('1-A-ready');
    // Departure: 3-2-1 countdown, then the 60× run.
    await pg.evaluate(() => lightStage.start()); await advance(pg, 1000); s = await ST(pg);
    check(`${tag}: countdown first (no light yet)`, s.phase === 'countdown' && s.seconds === 0, JSON.stringify(s).slice(0, 200));
    await advance(pg, 2000); await advance(pg, 50); s = await ST(pg);
    check(`${tag}: after the countdown the Sun → Mars run plays at 60× (run timeScale ${s.runTimeScale})`, s.phase === 'first' && s.runTimeScale === 60 && s.timeScale === 60, JSON.stringify(s).slice(0, 300));
    // Play to just past Earth in 100 ms frames, recording every arrival change.
    const P = Object.fromEntries(world.planets.map(p => [p.id, p]));
    const toEarth = P.earth.seconds / 60 * 1000 - (s.playbackSeconds * 1000) + 40;
    const seenA = await play(pg, toEarth); s = await ST(pg);
    check(`${tag}: at Earth (8,32 s of playback at 60×): Mercury, Venus, Earth reached in order with their exact light times; physical time ${s.seconds.toFixed(2)} s = playback ${s.playbackSeconds.toFixed(3)} s × 60`,
      s.arrivals.map(a => a.id).join() === 'mercury,venus,earth' && s.arrivals.every(a => a.seconds === P[a.id].seconds && a.km === P[a.id].km && a.view === 'inner') && Math.abs(s.seconds - s.playbackSeconds * 60) < 1e-6 && s.seconds >= P.earth.seconds && s.seconds < P.mars.seconds,
      JSON.stringify(s.arrivals));
    // Arrivals appear exactly when physical time passes each planet's light time (never early, never twice).
    const early = seenA.filter((x, i) => world.planets.slice(0, x.n).some(p => x.seconds < p.seconds - 1e-9) || (i && x.n < seenA[i - 1].n));
    check(`${tag}: arrivals never early, never removed, one per planet (${seenA.length} frames)`, early.length === 0 && new Set(s.arrivals.map(a => a.id)).size === s.arrivals.length, JSON.stringify(early.slice(0, 3)));
    layoutCheck(tag, 'A at Earth', await pg.evaluate(`(${BOXES})()`)); await shot('2-A-earth');
    // On to the Mars stop.
    await play(pg, (P.mars.seconds - s.seconds) / 60 * 1000 + 200); s = await ST(pg);
    check(`${tag}: automatic stop at Mars: phase mars, physical time exactly ${P.mars.seconds.toFixed(3)} s and ${P.mars.km.toFixed(0)} km (LightData), playback exactly ${(P.mars.seconds / 60).toFixed(3)} s; 4 arrivals`,
      s.phase === 'mars' && s.run === 'completed' && s.seconds === P.mars.seconds && s.travelledKm === P.mars.km && s.playbackSeconds === P.mars.seconds / 60 && s.arrivals.map(a => a.id).join() === 'mercury,venus,earth,mars' && s.stage === 'inner', JSON.stringify(s).slice(0, 500));
    await advance(pg, 5000); const still = await ST(pg);
    check(`${tag}: the Mars stop holds (no auto-continue, no extra arrivals)`, still.phase === 'mars' && still.seconds === P.mars.seconds && still.arrivals.length === 4);
    const textM = await pg.evaluate(() => [...document.querySelectorAll('#light-stage-overlay .light-caption, #light-stage-overlay .light-speed')].map(e => [e.textContent, e.classList.contains('is-next')]));
    const timeM = await pg.evaluate(() => document.querySelector('#light-stage-overlay .light-time').textContent.replace(/\u00a0/g, ' '));
    check(`${tag}: the Mars stop announces the coming change of scale (0 – 1,7 au → 0 – 31 au) and speed (60× → 600×) and that the light's time continues; readout ${JSON.stringify(timeM)}: ${JSON.stringify(textM.map(t => t[0]))}`,
      /0 – 1,7 au → 0 – 31 au/.test(textM[0][0]) && /60× → 600×/.test(textM[1][0]) && /pokračuje/.test(textM[1][0]) && textM.every(t => t[1]) && timeM.startsWith('12 min 40 s'));
    layoutCheck(tag, 'A at Mars', await pg.evaluate(`(${BOXES})()`)); await shot('3-A-mars');
    // Explicit continuation: new 0–31 au view, new 600× run from Mars's exact light time.
    const cont = await pg.evaluate(() => lightStage.toNeptune()); await advance(pg, 50, 3); s = await ST(pg);
    check(`${tag}: toNeptune(): explicit switch to the 0–31 au view and a 600× run continuing from Mars (offset ${s.offsetSeconds.toFixed(3)} s; physical time ${s.seconds.toFixed(2)} s, not restarted)`,
      cont && s.phase === 'second' && s.stage === 'outer' && s.view?.name === 'outer' && s.runTimeScale === 600 && s.offsetSeconds === P.mars.seconds && s.seconds >= P.mars.seconds && s.seconds < P.mars.seconds + 600 * 0.2 && s.arrivals.length === 4, JSON.stringify(s).slice(0, 500));
    check(`${tag} view B: one linear scale; the four outer planets as dots at their true positions; the inner four replaced by one group band from ${(s.view.cluster?.from - s.view.sun).toFixed(1)} to ${(s.view.cluster?.to - s.view.sun).toFixed(1)} px (Mars at ${(s.view.markers[3].x - s.view.sun).toFixed(1)} px); their world positions unchanged; Neptune at ${((s.view.markers[7].x - s.view.sun) / (s.view.axisEnd - s.view.sun) * 31).toFixed(3)} au of 31`,
      lin(s.view) && s.view.markers.slice(0, 4).every(m => !m.shown) && s.view.markers.slice(4).every(m => m.shown && m.sizePx === 10) && !!s.view.cluster && s.view.cluster.to >= s.view.markers[3].x - 0.01 && s.view.cluster.from <= Math.max(s.view.markers[0].x, s.view.sun + 8) + 0.01
        && JSON.stringify(s.world.planets) === JSON.stringify(world.planets) && Math.abs((s.view.markers[7].x - s.view.sun) / (s.view.axisEnd - s.view.sun) - world.planets[7].au / 31) < 1e-6, JSON.stringify(s.view));
    const grp = await pg.evaluate(() => { const g = document.querySelector('#light-stage-overlay .light-planet.is-group'); return [g.hidden, g.textContent, getComputedStyle(g.lastChild).visibility, document.querySelector('#light-stage-overlay .light-note').textContent]; });
    check(`${tag}: the group is labelled as a visual simplification: ${JSON.stringify(grp[1])}; note ${grp[0] ? '' : ''}${JSON.stringify(grp[3].slice(0, 70))}`, !grp[0] && /Merkúr – Mars/.test(grp[1]) && /len pre prehľadnosť/.test(grp[1]) && grp[2] === 'visible' && /nemenia/.test(grp[3]));
    const textB = await pg.evaluate(() => [...document.querySelectorAll('#light-stage-overlay .light-caption, #light-stage-overlay .light-speed')].map(e => e.textContent));
    check(`${tag}: the scale and speed change is stated on screen: ${JSON.stringify(textB)}`, /Mierka 2 z 2/.test(textB[0]) && /0 – 31 au/.test(textB[0]) && /600×/.test(textB[1]));
    layoutCheck(tag, 'B start', await pg.evaluate(`(${BOXES})()`)); await shot('4-B-start');
    const seenB0 = await play(pg, (P.jupiter.seconds - s.seconds) / 600 * 1000 + 40); s = await ST(pg);
    check(`${tag}: at Jupiter (≈ 3,06 s after Mars at 600×): 5 arrivals; physical time ${s.seconds.toFixed(1)} s = Mars ${P.mars.seconds.toFixed(1)} s + playback ${s.playbackSeconds.toFixed(3)} s × 600`,
      s.arrivals.map(a => a.id).join() === 'mercury,venus,earth,mars,jupiter' && Math.abs(s.seconds - (P.mars.seconds + s.playbackSeconds * 600)) < 1e-6 && s.arrivals[4].seconds === P.jupiter.seconds && s.arrivals[4].view === 'outer', JSON.stringify(s.arrivals));
    layoutCheck(tag, 'B at Jupiter', await pg.evaluate(`(${BOXES})()`)); await shot('5-B-jupiter');
    const seenB = seenB0.concat(await play(pg, (P.neptune.seconds - s.seconds) / 600 * 1000 + 200, 250)); s = await ST(pg);
    check(`${tag}: completed at Neptune: physical time exactly ${P.neptune.seconds.toFixed(3)} s (4 h 10 min 5 s), distance exactly ${P.neptune.km.toFixed(0)} km; stage B playback exactly ${((P.neptune.seconds - P.mars.seconds) / 600).toFixed(3)} s`,
      s.phase === 'neptune' && s.done && s.seconds === P.neptune.seconds && s.travelledKm === P.neptune.km && s.playbackSeconds === (P.neptune.seconds - P.mars.seconds) / 600, JSON.stringify(s).slice(0, 400));
    const earlyB = seenB.filter((x, i) => world.planets.slice(0, x.n).some(p => x.seconds < p.seconds - 1e-9) || (i && x.n < seenB[i - 1].n));
    check(`${tag}: all eight arrivals exactly once, in order, each with its exact LightData light time; none early in stage B (${seenB.length} frames)`,
      s.arrivals.map(a => a.id).join() === world.planets.map(p => p.id).join() && s.arrivals.every(a => a.seconds === P[a.id].seconds) && earlyB.length === 0, JSON.stringify({ arrivals: s.arrivals.map(a => a.id), early: earlyB.slice(0, 3) }));
    const shown = await pg.evaluate(() => [...document.querySelectorAll('#light-stage-overlay .light-planet:not([hidden]):not(.is-sun)')].map(e => [e.textContent.replace(/\u00a0/g, ' '), e.classList.contains('is-reached')]));
    check(`${tag}: labels at Neptune: Sun, the inner group and the four outer planets with their real flight times: ${JSON.stringify(shown.map(x => x[0]))}`,
      shown.length === 5 && /Jupiter43 min 16 s/.test(shown.map(x => x[0]).join()) && /Neptún4 h 10 min 5 s/.test(shown.map(x => x[0]).join()) && shown.every(x => x[1]) && /Merkúr – Marsspolu len pre prehľadnosť/.test(shown.map(x => x[0]).join()));
    const read = await pg.evaluate(() => [document.querySelector('#light-stage-overlay .light-time').textContent, document.querySelector('#light-stage-overlay .light-distance').textContent].map(t => t.replace(/\u00a0/g, ' ')));
    notes.push(`${tag} Neptune readout: ${JSON.stringify(read)} · compact ${s.view.compact}`);
    check(`${tag}: readout shows the real physical time 4 h 10 min 05 s (not playback time)`, read[0].startsWith('4 h 10 min 05 s'));
    layoutCheck(tag, 'B at Neptune', await pg.evaluate(`(${BOXES})()`)); await shot('6-B-neptune');
    check(`${tag}: no JS or WebGL errors`, errors.length === 0, errors.join('; '));
    await context.close();
  }

  // Pause/resume, hidden tab, reduced motion (skip), cleanup and reuse (1366×768).
  {
    const { pg, errors, context } = await open(browser, 1366, 768);
    await fake(pg); await advance(pg, 50);
    await pg.evaluate(() => lightStage.begin({ kind: 'light-travel', journey: 'planets' }, () => {})); await advance(pg, 50);
    await pg.evaluate(() => lightStage.start()); await advance(pg, 3000); await advance(pg, 50); await play(pg, 2000);
    let a = await ST(pg); await pg.evaluate(() => lightStage.pause()); await advance(pg, 6000); let b = await ST(pg);
    check(`pause at 60×: physical time and arrivals frozen while paused (${a.seconds.toFixed(1)} s → ${b.seconds.toFixed(1)} s)`, b.paused && b.pauseReason === 'user' && Math.abs(b.seconds - a.seconds) < 60 * 0.11 && b.arrivals.length === a.arrivals.length);
    await advance(pg, 6000); const b2 = await ST(pg); await pg.evaluate(() => lightStage.resume()); await play(pg, 1000); let c = await ST(pg);
    check(`resume: continues from the same physical time (+${(c.seconds - b2.seconds).toFixed(1)} s for ≈ 1 s of playback)`, !c.paused && b2.seconds === b.seconds && c.seconds - b.seconds > 50 && c.seconds - b.seconds < 70);
    await pg.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); document.dispatchEvent(new Event('visibilitychange')); });
    const h1 = await ST(pg); await advance(pg, 600000 / 100); await advance(pg, 60000); const h2 = await ST(pg);
    await pg.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' }); document.dispatchEvent(new Event('visibilitychange')); }); await advance(pg, 100); const h3 = await ST(pg);
    check(`hidden tab at 60×: pauses (reason hidden), hidden time adds nothing, no auto-resume`, h1.paused && h1.pauseReason === 'hidden' && h2.seconds === h1.seconds && h3.paused && h3.seconds === h1.seconds, JSON.stringify([h1.pauseReason, h1.seconds, h2.seconds, h3.paused]));
    // Finish stage A, then hidden tab during stage B at 600×.
    await pg.evaluate(() => lightStage.resume()); await play(pg, 13000, 500);
    await pg.evaluate(() => lightStage.toNeptune()); await play(pg, 2000, 200); const o1 = await ST(pg);
    await pg.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); document.dispatchEvent(new Event('visibilitychange')); }); await advance(pg, 30000); const o2 = await ST(pg);
    await pg.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' }); }); await pg.evaluate(() => lightStage.resume()); await play(pg, 30000, 500); const o3 = await ST(pg);
    check(`hidden tab at 600× in stage B: paused while hidden; after resume completes exactly at Neptune with 8 arrivals`, o2.paused && o2.pauseReason === 'hidden' && Math.abs(o2.seconds - o1.seconds) < 600 * 0.06 && o3.phase === 'neptune' && o3.seconds === o3.world.planets[7].seconds && o3.arrivals.length === 8, JSON.stringify([o1.seconds, o2.seconds, o3.phase, o3.arrivals.length]));
    // Countdown cancelled by a hidden tab (shared behaviour).
    await pg.evaluate(() => lightStage.reset()); await advance(pg, 50); await pg.evaluate(() => lightStage.start()); await advance(pg, 1000);
    await pg.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); document.dispatchEvent(new Event('visibilitychange')); }); await advance(pg, 5000);
    const cd = await ST(pg); await pg.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' }); });
    check('a hidden tab cancels the countdown (back to ready, interrupted, nothing started)', cd.phase === 'ready' && cd.interrupted && cd.seconds === 0 && cd.arrivals.length === 0, JSON.stringify(cd).slice(0, 200));
    // Reduced motion: skip shows each result without movement; exact values; arrivals recorded once.
    await pg.evaluate(() => lightStage.reset()); await advance(pg, 50);
    const k1 = await pg.evaluate(() => lightStage.skip()); await advance(pg, 50); const s1 = await ST(pg);
    const k2 = await pg.evaluate(() => lightStage.skip()); await advance(pg, 50, 3); const s2 = await ST(pg); const k3 = await pg.evaluate(() => lightStage.skip());
    check('reduced motion: skip → exact Mars result (view A, 4 arrivals), skip again → exact Neptune result (view B, 8 arrivals); then nothing more to skip',
      k1 && s1.phase === 'mars' && s1.skipped && s1.seconds === s1.world.planets[3].seconds && s1.arrivals.length === 4 && s1.stage === 'inner' && k2 && s2.phase === 'neptune' && s2.seconds === s2.world.planets[7].seconds && s2.arrivals.length === 8 && s2.stage === 'outer' && s2.view?.name === 'outer' && k3 === false,
      JSON.stringify([s1.phase, s1.arrivals.length, s2.phase, s2.arrivals.length, k3]));
    check('toNeptune only from the Mars stop; toMoon never in this journey', await pg.evaluate(() => { lightStage.reset(); return [lightStage.toNeptune(), lightStage.toMoon()].every(v => v === false); }));
    // Cleanup and reuse: end hides everything; other journeys show none of the planet objects; repeated cycles keep resources.
    const life = await pg.evaluate(() => {
      const info = () => { renderer.render(scene, camera); return [renderer.info.memory.geometries, renderer.info.memory.textures, renderer.info.programs.length].join(); };
      lightStage.render(); lightStage.end();
      for (const j of ['earth-moon', 'fifteen', 'planets']) { lightStage.begin({ kind: 'light-travel', journey: j }, () => {}); lightStage.render(); lightStage.end(); } // first draw of each journey compiles once
      const before = info();
      const hiddenAfterEnd = document.getElementById('light-stage-overlay').hidden && !lightStage.active;
      const leaks = [];
      for (let i = 0; i < 12; i++) {
        const j = ['planets', 'earth-moon', 'fifteen'][i % 3];
        lightStage.begin({ kind: 'light-travel', journey: j }, () => {}); lightStage.render();
        const st = lightStage.state(), planetEls = [...document.querySelectorAll('#light-stage-overlay .light-planet, #light-stage-overlay .light-caption, #light-stage-overlay .light-speed')].filter(e => !e.hidden);
        if (j !== 'planets' && planetEls.length) leaks.push(`${j}: ${planetEls.length} planet overlay elements visible`);
        if (j === 'planets' && (st.phase !== 'ready' || st.arrivals.length || st.stage !== 'inner')) leaks.push('planets not fresh');
        if (j !== 'planets' && st.journey !== j) leaks.push(`journey ${st.journey}`);
        lightStage.end();
      }
      return { before, after: info(), hiddenAfterEnd, leaks };
    });
    check(`cleanup and reuse: end() hides the overlay; 12 begin/render/end cycles across the three journeys leave resources ${life.before} → ${life.after}; no planet objects on the other journeys; planets restart fresh`,
      life.hiddenAfterEnd && life.before === life.after && life.leaks.length === 0, JSON.stringify(life));
    // Leaving Learn ends the stage (shared lifecycle).
    await pg.evaluate(() => lightStage.begin({ kind: 'light-travel', journey: 'planets' }, () => {})); await advance(pg, 50);
    await pg.evaluate(() => Learn.exit ? Learn.exit() : document.querySelector('#learn-root .learn-close, [data-learn-close]')?.click()); await advance(pg, 100);
    check('leaving Learn ends the planets stage (no overlay, stage inactive)', await pg.evaluate(() => !lightStage.active && document.getElementById('light-stage-overlay').hidden));
    check('no JS or WebGL errors (pause, hidden tab, skip, lifecycle)', errors.length === 0, errors.join('; '));
    await context.close();
  }
  // Scientific table (from the same data the stage uses).
  console.log('PLANETS\n' + world.planets.map(p => `${p.id}: ${p.au} au, ${(p.km / 1e6).toFixed(1)} mil. km, ${p.seconds.toFixed(3)} s; playback ${p.inner ? (p.seconds / 60).toFixed(2) + ' s at 60×' : '+' + ((p.seconds - world.planets[3].seconds) / 600).toFixed(2) + ' s after Mars at 600×'}`).join('\n'));
  console.log('NOTES\n' + notes.join('\n'));
  console.log('KNOWN LIMITATION (not counted)\n' + limits.join('\n'));
  console.log(`${passes} passed, ${failures} failed`);
  await browser.close(); server.close();
})();
