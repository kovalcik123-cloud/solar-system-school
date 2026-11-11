// Phase 6H.5.2.C final functional verification: Mars stop, exact 60× → 600× continuity, LightData arrival times, repeat (outside the repository). The stage is driven directly with
// lightStage.begin({ journey: 'planets' }) while a test-only fixture lesson is open (no Learn UI integration in this phase).
// "pohyb" stays inactive in the app; the fixture is injected only into this test browser.
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const S = __dirname, ROOT = require('./env').ROOT, OUT = require('./env').out('light654'), PORT = Number(process.env.PORT || 8937);
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
  await pg.route('**/three.min.js', r => r.fulfill({ path: require('./env').vendor('three.min.js') }));
  await pg.route('**/OrbitControls.js', r => r.fulfill({ path: require('./env').vendor('OrbitControls.js') }));
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
  const { pg, errors, context } = await open(browser, 1366, 768);
  await fake(pg); await advance(pg, 50);
  await pg.evaluate(() => lightStage.begin({ kind: 'light-travel', journey: 'planets' }, () => {})); await advance(pg, 50, 3);
  // LightData read in the page itself (the module the stage uses), not copied values.
  const ref = await pg.evaluate(() => LightData.PLANETS.map(id => { const p = LightData.sunToPlanet(id); return { id, seconds: p.lightSeconds, km: p.distanceKm, text: LightData.formatDuration(p.lightSeconds) }; }));
  const world = (await ST(pg)).world.planets;
  check('the stage uses exactly LightData.sunToPlanet() for all eight planets (distance and light time)', world.every((p, i) => p.id === ref[i].id && p.seconds === ref[i].seconds && p.km === ref[i].km), JSON.stringify(world.map(p => p.id)));
  for (let cycle = 1; cycle <= 2; cycle++) {
    const tag = `run ${cycle}`;
    if (cycle === 2) { const r = await pg.evaluate(() => lightStage.reset()); await advance(pg, 50, 3); const s = await ST(pg);
      check('repeat: reset() after Neptune returns to ready in the 0–1,7 au view with no arrivals and zero time', r && s.phase === 'ready' && s.stage === 'inner' && s.arrivals.length === 0 && s.seconds === 0 && s.offsetSeconds === 0, JSON.stringify(s).slice(0, 300)); }
    await pg.evaluate(() => lightStage.start()); await advance(pg, 3000); await advance(pg, 50);
    // Stage A in frames; the samples record physical time and playback time.
    const a = await play(pg, 12672 + 400, 100); let s = await ST(pg);
    check(`${tag}: stage A stops by itself at Mars (phase mars) after exactly ${(ref[3].seconds / 60).toFixed(3)} s of playback; physical time exactly ${ref[3].seconds.toFixed(3)} s`, s.phase === 'mars' && s.seconds === ref[3].seconds && s.playbackSeconds === ref[3].seconds / 60 && s.runTimeScale === 60);
    await advance(pg, 10000); const hold = await ST(pg);
    check(`${tag}: the Mars stop waits (10 s later still at Mars; no stage B run)`, hold.phase === 'mars' && hold.seconds === ref[3].seconds && hold.run === 'completed' && hold.runTimeScale === 60);
    // The continuation: before any frame passes, physical time is still exactly Mars's; then it grows at 600× from there.
    const t0 = await pg.evaluate(() => { const ok = lightStage.toNeptune(); const s = lightStage.state(); return { ok, phase: s.phase, seconds: s.seconds, playback: s.playbackSeconds, scale: s.runTimeScale, offset: s.offsetSeconds, stage: s.stage }; });
    check(`${tag}: toNeptune() switches to 600× and the 0–31 au view with physical time continuing from exactly ${t0.seconds.toFixed(3)} s (= Mars), playback restarting at ${t0.playback} s`, t0.ok && t0.phase === 'second' && t0.seconds === ref[3].seconds && t0.offset === ref[3].seconds && t0.playback === 0 && t0.scale === 600 && t0.stage === 'outer', JSON.stringify(t0));
    const seq = [];
    for (const ms of [50, 100, 250, 1000]) { await advance(pg, ms, 1); const x = await ST(pg); seq.push({ seconds: x.seconds, playback: x.playbackSeconds }); }
    check(`${tag}: across the transition physical time = Mars + playback × 600 at every sample (no jump, no restart): ${seq.map(x => x.seconds.toFixed(1)).join(' → ')} s`, seq.every(x => Math.abs(x.seconds - (ref[3].seconds + x.playback * 600)) < 1e-6) && seq.every((x, i) => i === 0 ? x.seconds > ref[3].seconds : x.seconds > seq[i - 1].seconds), JSON.stringify(seq));
    // The whole timeline is monotonic across both stages; stage B ends exactly at Neptune.
    const b = await play(pg, 24000, 100); s = await ST(pg);
    const tl = [...a.map(x => x.seconds), ref[3].seconds, ...seq.map(x => x.seconds), ...b.map(x => x.seconds)];
    check(`${tag}: one continuous, never-decreasing physical timeline from 0 to ${ref[7].seconds.toFixed(3)} s over ${tl.length} samples; completed exactly at Neptune`, tl.every((v, i) => !i || v >= tl[i - 1]) && s.phase === 'neptune' && s.seconds === ref[7].seconds && s.travelledKm === ref[7].km && s.playbackSeconds === (ref[7].seconds - ref[3].seconds) / 600);
    const labels = await pg.evaluate(() => [...document.querySelectorAll('#light-stage-overlay .light-planet')].filter(e => !e.classList.contains('is-sun') && !e.classList.contains('is-group')).map(e => e.lastChild.textContent));
    check(`${tag}: all eight arrivals, once each, in order, each with its LightData time; label texts = LightData.formatDuration: ${labels.join(' · ')}`,
      s.arrivals.length === 8 && s.arrivals.every((x, i) => x.id === ref[i].id && x.seconds === ref[i].seconds && x.km === ref[i].km) && labels.every((t, i) => t === ref[i].text), JSON.stringify(s.arrivals.map(x => [x.id, x.seconds])));
    check(`${tag}: arrival views: Mercury–Mars in stage A, Jupiter–Neptune in stage B`, s.arrivals.every((x, i) => x.view === (i < 4 ? 'inner' : 'outer')));
  }
  // Cleanup after the repeats: end() leaves nothing behind; begin() again is fresh.
  const life = await pg.evaluate(() => { lightStage.end(); const off = !lightStage.active && document.getElementById('light-stage-overlay').hidden;
    lightStage.begin({ kind: 'light-travel', journey: 'planets' }, () => {}); const s = lightStage.state(); return { off, phase: s.phase, n: s.arrivals.length, seconds: s.seconds, stage: s.stage }; });
  check('cleanup: end() hides and deactivates the stage; a new begin() starts fresh (ready, no arrivals, 0 s, view A)', life.off && life.phase === 'ready' && life.n === 0 && life.seconds === 0 && life.stage === 'inner', JSON.stringify(life));
  check('no JS or WebGL errors', errors.length === 0, errors.join('; '));
  await context.close();
  console.log(`${passes} passed, ${failures} failed`);
  await browser.close(); server.close();
})();
