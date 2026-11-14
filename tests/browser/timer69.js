// Phase 6H.9.1.D timer-stability harness. The big live readout of the Sun-to-planets experiment (the real lesson, real controls) keeps its
// length and its place while it counts. A fake clock drives the experiment frame by frame (steps of 20 ms at 1366×768, coarser elsewhere);
// every frame the readout is measured geometrically (box and glyph positions, not pixels).
// - 60× leg: "MM min SS s" (11 characters); 600× leg: "H h MM min SS s" (15 characters, hours present from the first frame of the leg).
// - Within a leg the readout's box, the positions of its unit letters and of its last two digits never change (±0.05 px).
// - Its text always equals LightData.formatClock of the physical time the stage reports; elapsed time, the 60× and 600× playback and the eight
//   arrival times are the exact values of LightData / LightSim; labels, the Learn panel, the live region and the Earth–Moon and 15 s readouts keep
//   their natural wording and format.
// - Five viewports: the readout stays on screen and clear of the Learn panel and the scene labels, in the approved layout of each state.
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path'), vm = require('vm');
const ENV = require('./env'), ROOT = ENV.ROOT, OUT = ENV.out('timer69'), PORT = Number(process.env.PORT || 8972);
const server = http.createServer((q, r) => { const u = decodeURIComponent(q.url.split('?')[0]); fs.readFile(path.join(ROOT, u === '/' ? 'index.html' : u), (e, d) => { if (e) { r.writeHead(404); r.end(); } else r.end(d); }); }).listen(PORT);
let failures = 0, passes = 0;
const check = (label, ok, detail = '') => { ok ? passes++ : failures++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${!ok && detail ? '  — ' + String(detail).slice(0, 1000) : ''}`); };
const W = {}; vm.runInContext(fs.readFileSync(path.join(ROOT, 'light-data.js'), 'utf8'), vm.createContext({ window: W, Intl })); const L = W.LightData;
const NB = ' ', TOL = 0.05, plain = t => t.replace(/[  ]/g, ' ');
const LEG1 = new RegExp(`^\\d{2}${NB}min \\d{2}${NB}s$`), LEG2 = new RegExp(`^\\d${NB}h \\d{2}${NB}min \\d{2}${NB}s$`);
const MARS = L.sunToPlanet('mars'), NEPTUNE = L.sunToPlanet('neptune');
const range = values => values.length ? Math.max(...values) - Math.min(...values) : 0;
// How the timer is laid out in each state at each viewport (the approved layouts, measured before this phase; text only changed).
// c = centred and prominent, k = compact row beside the scale bar, - = not shown.
const LAYOUT = {
  '1366x768': { ready: 'c', run1: 'c', mars: 'c', run2: 'c', neptune: 'c' }, '1280x720': { ready: 'c', run1: 'c', mars: 'c', run2: 'c', neptune: 'c' },
  '390x844': { ready: 'k', run1: 'c', mars: 'k', run2: 'c', neptune: 'k' }, '390x667': { ready: '-', run1: 'k', mars: '-', run2: 'k', neptune: '-' },
  '844x390': { ready: 'c', run1: 'c', mars: 'c', run2: 'k', neptune: 'k' }
};
const VIEWPORTS = [[1366, 768, true], [1280, 720, false], [390, 844, false], [390, 667, false], [844, 390, false]]; // width, height, fine sampling

async function open(browser, w, h) {
  const context = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: w < 900 });
  const pg = await context.newPage(), errors = [];
  pg.on('pageerror', e => errors.push(e.message)); pg.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await pg.goto(`http://localhost:${PORT}/`); await pg.waitForTimeout(600);
  await pg.fill('#activation-code', 'NGV-2025'); await pg.evaluate(() => checkCode()); await pg.waitForTimeout(2400);
  await pg.evaluate(() => { if (areOrbitsActive) toggleOrbit(); });
  return { pg, context, errors };
}
const frames = (pg, n = 2) => pg.evaluate(n => new Promise(res => { let k = 0; const f = () => (++k >= n ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
const fake = pg => pg.evaluate(() => { window.__realNow = window.__realNow || performance.now.bind(performance); window.__t = window.__realNow(); performance.now = () => window.__t; });
const advance = async (pg, ms, n = 2) => { await pg.evaluate(ms => { window.__t += ms; }, ms); await frames(pg, n); };
const startLesson = pg => pg.evaluate(() => { Learn.enter(); [...document.querySelectorAll('.learn-topic')].find(c => /Svetlo a/.test(c.textContent)).querySelector('button').click(); });
const next = async pg => { await pg.evaluate(() => document.querySelector('#learn-root .learn-footer .learn-primary').click()); await pg.waitForTimeout(500); };
const back = async pg => { await pg.evaluate(() => [...document.querySelectorAll('#learn-root .learn-footer button')].find(b => /^(Späť|←)/.test(b.textContent.trim()) && !/témy/i.test(b.textContent)).click()); await pg.waitForTimeout(500); };

// In the page: one measurement of the live readout (the .light-time element), its layout and its surroundings.
const PROBE = () => { window.__probe = () => {
  const ov = document.getElementById('light-stage-overlay'), el = ov.querySelector('.light-time'), raw = el.textContent, cut = raw.indexOf(' · '), time = cut < 0 ? raw : raw.slice(0, cut), cs = getComputedStyle(el), r = el.getBoundingClientRect();
  const shown = !el.hidden && cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0, compact = el.classList.contains('is-compact');
  let box = null, glyphs = null;
  if (shown) { const node = el.firstChild, rg = document.createRange(), at = i => { rg.setStart(node, i); rg.setEnd(node, i + 1); const b = rg.getBoundingClientRect(); return b.left; };
    rg.setStart(node, 0); rg.setEnd(node, time.length); const b = rg.getBoundingClientRect(); box = { left: b.left, right: b.right, top: b.top, bottom: b.bottom, width: b.width };
    const n = time.length; glyphs = { h: time.indexOf('h') >= 0 ? at(time.indexOf('h')) : null, min: at(time.indexOf('min')), s: at(n - 1), ones: at(n - 3), tens: at(n - 4), first: at(0) }; }
  const learn = document.getElementById('learn-root').getBoundingClientRect(), learnHidden = document.getElementById('learn-root').hidden, nav = document.getElementById('planet-nav').getBoundingClientRect();
  const hit = (a, c) => a.left < c.right - 0.5 && a.right > c.left + 0.5 && a.top < c.bottom - 0.5 && a.bottom > c.top + 0.5;
  const mine = shown ? { left: r.left, right: r.right, top: r.top, bottom: r.bottom } : null;
  const others = [...ov.children].filter(e => e !== el && !e.hidden && getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().width > 0).map(e => ({ cls: (e.className || e.tagName).split(' ')[0], r: e.getBoundingClientRect() }));
  const s = lightStage.state(), expected = LightData.formatClock(s.seconds, s.stage === 'outer');
  return { phase: s.phase, stage: s.stage, seconds: s.seconds, runScale: s.runTimeScale, playback: s.playbackSeconds, raw, time, shown, compact, box, glyphs, topEl: shown ? r.top : null, leftEl: shown ? r.left : null,
    expectedText: expected, textIsClock: time === expected, lines: shown ? Math.round(r.height / parseFloat(cs.lineHeight)) : 0, font: cs.fontSize, tnum: cs.fontVariantNumeric,
    onScreen: !shown || (r.left >= -0.5 && r.right <= innerWidth + 0.5 && r.top >= nav.bottom - 0.5 && r.bottom <= innerHeight + 0.5), overPanel: shown && !learnHidden && hit(mine, learn), overLabels: shown ? others.filter(o => hit(mine, o.r)).map(o => o.cls) : [] };
}; };
const probe = pg => pg.evaluate(() => window.__probe());
// Frame-by-frame sampling in the page (two animation frames per step, the fake clock advanced by `ms`).
const sample = (pg, opts) => pg.evaluate(async ({ ms, phase, untilSeconds, max }) => { const out = [], raf = () => new Promise(r => requestAnimationFrame(r));
  for (let i = 0; i < max; i++) { window.__t += ms; await raf(); await raf(); const p = window.__probe(); out.push(p); if (p.phase !== phase || (untilSeconds && p.seconds >= untilSeconds)) break; } return out; }, opts);

// Geometric stability of one run (the samples of one leg while it runs).
function stability(tag, name, runs, form) {
  const pattern = form === 'hours' ? LEG2 : LEG1, length = form === 'hours' ? 15 : 11;
  check(`${tag} ${name}: every frame's text is the ${form === 'hours' ? '"H h MM min SS s"' : '"MM min SS s"'} form with no-break spaces (${runs.length} frames, ${runs[0].time} … ${runs.at(-1).time})`, runs.every(p => pattern.test(p.time)), runs.find(p => !pattern.test(p.time))?.time);
  check(`${tag} ${name}: the length never changes (always ${length} characters) and the text always equals LightData.formatClock of the physical time the stage reports`, runs.every(p => p.time.length === length && p.textIsClock), JSON.stringify(runs.find(p => p.time.length !== length || !p.textIsClock)));
  const shown = runs.filter(p => p.shown);
  check(`${tag} ${name}: the readout is shown in every frame or in none (${shown.length} of ${runs.length}), in one layout, with tabular digits and one line`, (shown.length === 0 || shown.length === runs.length) && new Set(runs.map(p => p.compact)).size === 1 && runs.every(p => /tabular-nums/.test(p.tnum) && (!p.shown || p.lines === 1)), JSON.stringify({ shown: shown.length, compact: [...new Set(runs.map(p => p.compact))] }));
  if (!shown.length) return;
  const w = range(shown.map(p => p.box.width)), l = range(shown.map(p => p.box.left)), t = range(shown.map(p => p.box.top)), el = range(shown.map(p => p.leftEl));
  check(`${tag} ${name}: constant width (${shown[0].box.width.toFixed(2)} px, range ${w.toFixed(3)}) and constant position (left range ${l.toFixed(3)}, top range ${t.toFixed(3)}, element left range ${el.toFixed(3)}) in all ${shown.length} frames`, w <= TOL && l <= TOL && t <= TOL && el <= TOL, JSON.stringify({ w, l, t, el }));
  const g = key => range(shown.map(p => p.glyphs[key]).filter(v => v !== null));
  const spread = ['min', 's', 'ones', 'tens', 'first', ...(form === 'hours' ? ['h'] : [])].map(k => [k, g(k)]);
  check(`${tag} ${name}: no character moves: the unit letters and the two seconds digits keep their x positions (largest range ${Math.max(...spread.map(x => x[1])).toFixed(3)} px)`, spread.every(([, v]) => v <= TOL), JSON.stringify(spread));
  // Digit boundaries crossed during the run, each with an unchanged box: seconds tens, minutes, minute tens, and (600×) the hour.
  const pairs = runs.slice(1).map((p, i) => [runs[i], p]).filter(([a, b]) => a.shown && b.shown), digits = s => s.replace(/\D+/g, ' ').trim().split(' ').map(Number);
  const crossings = { 'seconds 09 → 10 (tens digit changes)': ([a, b]) => Math.floor(digits(a.time).at(-1) / 10) !== Math.floor(digits(b.time).at(-1) / 10), 'a minute passes (59 s → 00 s)': ([a, b]) => digits(a.time).at(-1) > digits(b.time).at(-1),
    'minutes 09 → 10 (tens digit changes)': ([a, b]) => Math.floor(digits(a.time).at(-2) / 10) !== Math.floor(digits(b.time).at(-2) / 10), ...(form === 'hours' ? { '59 min 59 s → 1 h 00 min 00 s (hour passes)': ([a, b]) => digits(b.time)[0] > digits(a.time)[0] } : {}) };
  for (const [label, test] of Object.entries(crossings)) { const hit = pairs.filter(test), moved = hit.filter(([a, b]) => Math.abs(a.box.width - b.box.width) > TOL || Math.abs(a.box.left - b.box.left) > TOL || Math.abs(a.glyphs.s - b.glyphs.s) > TOL || Math.abs(a.glyphs.min - b.glyphs.min) > TOL);
    check(`${tag} ${name}: crossing "${label}" ${hit.length} time${hit.length === 1 ? '' : 's'} (e.g. ${hit[0] ? `${plain(hit[0][0].time)} → ${plain(hit[0][1].time)}` : '–'}): no jump`, hit.length > 0 && moved.length === 0, JSON.stringify({ hit: hit.length, moved: moved.length })); }
}
// Time and playback of one run: monotonic, at exactly the leg's speed.
function playbackChecks(tag, name, runs, scale) {
  let monotonic = true, ratio = true, worst = 0;
  for (let i = 1; i < runs.length; i++) { const a = runs[i - 1], b = runs[i]; if (b.seconds < a.seconds) monotonic = false; const d = (b.seconds - a.seconds) - scale * (b.playback - a.playback); worst = Math.max(worst, Math.abs(d)); if (Math.abs(d) > 1e-6) ratio = false; }
  check(`${tag} ${name}: elapsed time never goes back, and every frame advances exactly ${scale}× the playback time (largest deviation ${worst.toExponential(1)} s); the run speed is ${scale}×`, monotonic && ratio && runs.every(p => p.runScale === scale), JSON.stringify({ monotonic, worst, scales: [...new Set(runs.map(p => p.runScale))] }));
}
const shot = async (pg, name, clip) => pg.screenshot({ path: path.join(OUT, `${name}.png`), ...(clip ? { clip } : {}) });

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  for (const [w, h, fine] of VIEWPORTS) {
    const size = `${w}x${h}`, tag = size, layout = LAYOUT[size], { pg, context, errors } = await open(browser, w, h);
    await pg.evaluate(`(${PROBE})()`);
    await startLesson(pg); await pg.waitForTimeout(400);

    // ---- Earth–Moon (1 s) and 15 s experiments: not touched (main size only).
    if (fine) {
      await next(pg); await fake(pg); await advance(pg, 50);
      const em0 = await pg.evaluate(() => lightStage.state().journey);
      await pg.evaluate(() => lightStage.skip()); await advance(pg, 100);
      const em1 = await pg.evaluate(() => ({ time: document.querySelector('#light-stage-overlay .light-time').textContent, phase: lightStage.state().phase }));
      check(`${tag} Earth–Moon experiment: the one-second stop still reads ${JSON.stringify(plain(L.formatDuration(1, 3)))} (natural form, three decimals, no "min")`, em0 === 'earth-moon' && em1.phase === 'one-second' && em1.time === `${L.formatDuration(1, 3)}`, JSON.stringify(em1));
      await pg.evaluate(() => { lightStage.reset(); lightStage.start(); }); await advance(pg, 3050); await advance(pg, 300);
      const em2 = await pg.evaluate(() => ({ time: document.querySelector('#light-stage-overlay .light-time').textContent, phase: lightStage.state().phase }));
      check(`${tag} Earth–Moon experiment: while the light flies the readout counts in seconds with two decimals ("${plain(em2.time)}")`, em2.phase === 'first' && /^0,\d{2} s$/.test(em2.time), JSON.stringify(em2));
      await next(pg); await advance(pg, 50);
      const f0 = await pg.evaluate(() => lightStage.state().journey);
      await pg.evaluate(() => lightStage.start()); await advance(pg, 3050); await advance(pg, 4000, 1);
      const f1 = await pg.evaluate(() => ({ time: document.querySelector('#light-stage-overlay .light-time').textContent, phase: lightStage.state().phase }));
      check(`${tag} 15-second experiment: the running readout stays in seconds with two decimals ("${plain(f1.time)}")`, f0 === 'fifteen' && f1.phase === 'first' && /^\d+,\d{2} s$/.test(f1.time), JSON.stringify(f1));
      await pg.evaluate(() => { lightStage.reset(); lightStage.skip(); }); await advance(pg, 100);
      const f2 = await pg.evaluate(() => ({ time: document.querySelector('#light-stage-overlay .light-time').textContent, phase: lightStage.state().phase }));
      check(`${tag} 15-second experiment: the result still reads ${JSON.stringify(plain(L.formatDuration(15, 3)))}`, f2.phase === 'done' && f2.time === L.formatDuration(15, 3), JSON.stringify(f2));
      await next(pg);
    } else { for (let i = 0; i < 3; i++) await next(pg); await fake(pg); await advance(pg, 50); }
    await advance(pg, 50); const journey = await pg.evaluate(() => lightStage.state().journey);
    check(`${tag}: the Sun-to-planets experiment is open`, journey === 'planets', journey);

    // ---- Ready state.
    await advance(pg, 100); const ready = await probe(pg);
    check(`${tag} ready: the readout shows "00 min 00 s" (${ready.shown ? (ready.compact ? 'compact row' : 'centred') : 'not shown in this layout'})`, ready.time === `00${NB}min 00${NB}s` && ready.textIsClock && (layout.ready === '-' ? !ready.shown : layout.ready === 'k' ? ready.shown && ready.compact : ready.shown && !ready.compact), JSON.stringify({ time: ready.time, shown: ready.shown, compact: ready.compact }));
    if (fine) await shot(pg, `${size}-1-ready`);

    // ---- 60× leg: Sun to Mars.
    await pg.evaluate(() => lightStage.start()); await advance(pg, 3050); await advance(pg, 100);
    const ms1 = fine ? 20 : 97, ms2 = fine ? 20 : 97; // 97 ms is not a whole number of seconds at 600×, so the seconds digits really change from frame to frame
    const a1 = await sample(pg, { ms: ms1, phase: 'first', untilSeconds: 300, max: 4000 });
    const midRun1 = await probe(pg); if (fine) await shot(pg, `${size}-2-sun-to-mars-running`);
    const a2 = await sample(pg, { ms: ms1, phase: 'first', max: 4000 }); const leg1 = [...a1, ...a2].filter(p => p.phase === 'first');
    check(`${tag} 60× leg: the run reached Mars (${leg1.length} measured frames, ${plain(leg1[0].time)} … ${plain(leg1.at(-1).time)}); layout of the running readout: ${layout.run1 === 'c' ? 'centred' : 'compact row'}`, a2.at(-1).phase === 'mars' && leg1.length > 20 && (layout.run1 === 'c' ? leg1.every(p => p.shown && !p.compact) : leg1.every(p => p.shown && p.compact)), JSON.stringify({ last: a2.at(-1).phase, n: leg1.length }));
    stability(tag, '60× leg', leg1, 'minutes'); playbackChecks(tag, '60× leg', leg1, 60);
    await advance(pg, 200); const mars = await probe(pg), marsState = await pg.evaluate(() => lightStage.state());
    check(`${tag} Mars stop: the readout keeps its text "12 min 40 s"; the physical time is exactly ${MARS.lightSeconds.toFixed(4)} s and the playback exactly ${(MARS.lightSeconds / 60).toFixed(4)} s`, mars.time === `12${NB}min 40${NB}s` && marsState.seconds === MARS.lightSeconds && marsState.playbackSeconds === MARS.lightSeconds / 60 && marsState.travelledKm === MARS.distanceKm && (layout.mars === '-' ? !mars.shown : mars.shown && mars.compact === (layout.mars === 'k')), JSON.stringify({ time: mars.time, seconds: marsState.seconds, playback: marsState.playbackSeconds }));
    if (fine) await shot(pg, `${size}-3-mars-stop`);

    // ---- 600× leg: Mars to Neptune.
    await pg.evaluate(() => lightStage.toNeptune()); await advance(pg, 20);
    const b0 = await probe(pg);
    check(`${tag} 600× leg start: hours are present from the first frame, before the first hour ("${plain(b0.time)}")`, b0.phase === 'second' && LEG2.test(b0.time) && new RegExp(`^0${NB}h 12${NB}min `).test(b0.time), JSON.stringify(b0.time));
    const c1 = await sample(pg, { ms: ms2, phase: 'second', untilSeconds: 4000, max: 4000 });
    const midRun2 = await probe(pg); await shot(pg, `${size}-5-600x-running`);
    const c2 = await sample(pg, { ms: ms2, phase: 'second', max: 4000 }); const leg2 = [b0, ...c1, ...c2].filter(p => p.phase === 'second');
    check(`${tag} 600× leg: the run reached Neptune (${leg2.length} measured frames, ${plain(leg2[0].time)} … ${plain(leg2.at(-1).time)}); layout of the running readout: ${layout.run2 === 'c' ? 'centred' : 'compact row'}`, c2.at(-1).phase === 'neptune' && leg2.length > 20 && (layout.run2 === 'c' ? leg2.every(p => p.shown && !p.compact) : leg2.every(p => p.shown && p.compact)), JSON.stringify({ last: c2.at(-1).phase, n: leg2.length }));
    stability(tag, '600× leg', leg2, 'hours'); playbackChecks(tag, '600× leg', leg2, 600);
    await advance(pg, 200); const nep = await probe(pg), nepState = await pg.evaluate(() => lightStage.state());
    check(`${tag} Neptune result: the readout shows "4 h 10 min 05 s"; the physical time is exactly ${NEPTUNE.lightSeconds.toFixed(4)} s, the distance exactly ${NEPTUNE.distanceKm.toFixed(0)} km`, nep.time === `4${NB}h 10${NB}min 05${NB}s` && nepState.seconds === NEPTUNE.lightSeconds && nepState.travelledKm === NEPTUNE.distanceKm && nepState.done === true && (layout.neptune === '-' ? !nep.shown : nep.shown && nep.compact === (layout.neptune === 'k')), JSON.stringify({ time: nep.time, seconds: nepState.seconds }));
    if (fine) await shot(pg, `${size}-6-neptune-result`);
    check(`${tag}: all eight arrivals once, in order, each with its exact LightData time`, nepState.arrivals.map(a => a.id).join() === L.PLANETS.join() && nepState.arrivals.every(a => a.seconds === L.sunToPlanet(a.id).lightSeconds && a.km === L.sunToPlanet(a.id).distanceKm), JSON.stringify(nepState.arrivals.map(a => [a.id, a.seconds])));

    // ---- Layout in every state: on screen, clear of the Learn panel and the scene labels.
    const snaps = { ready, 'running 60×': midRun1, 'Mars stop': mars, 'running 600×': midRun2, 'Neptune result': nep };
    const bad = Object.entries(snaps).filter(([, p]) => p.shown && (!p.onScreen || p.overPanel || p.overLabels.length || p.lines !== 1)).map(([n, p]) => `${n}: ${!p.onScreen ? 'off screen ' : ''}${p.overPanel ? 'over panel ' : ''}${p.overLabels.join(',')}${p.lines !== 1 ? ' wraps' : ''}`);
    check(`${tag}: in all five states the readout is on screen, on one line, not under the Learn panel and not over any scene label or readout (${Object.entries(snaps).map(([n, p]) => `${n}: ${p.shown ? (p.compact ? 'compact' : 'centred') : 'not shown'}`).join('; ')})`, bad.length === 0, bad.join(' | '));
    if (w < 900) await shot(pg, `${size}-5-600x-neptune-stop`);

    // ---- Wording elsewhere stays natural (main size: all of it; elsewhere: the live region and result line).
    const words = await pg.evaluate(() => ({
      labels: [...document.querySelectorAll('#light-stage-overlay .light-planet:not(.is-group) .when')].map(e => e.textContent), lead: document.querySelector('.learn-light-lead')?.textContent ?? '',
      details: [...document.querySelectorAll('#learn-root .learn-note')].map(e => e.textContent).join(' '), live: document.querySelector('.learn-live')?.textContent ?? '', body: document.getElementById('learn-root').textContent }));
    const naturalAll = L.PLANETS.map(id => L.formatDuration(L.sunToPlanet(id).lightSeconds));
    check(`${tag}: the Learn result line and the live region keep the natural wording ("${plain(words.lead)}")`, plain(words.lead) === `K Neptúnu letelo svetlo ${plain(L.formatDuration(NEPTUNE.lightSeconds))}!` && plain(words.lead) === 'K Neptúnu letelo svetlo 4 h 10 min 5 s!' && plain(words.live).startsWith('K Neptúnu letelo svetlo 4 h 10 min 5 s!'), JSON.stringify({ lead: words.lead, live: words.live.slice(0, 60) }));
    check(`${tag}: no clock-style text ("05 s", "00 min") appears anywhere in the Learn panel or the live region`, !/\b0\d.min|\b0\d.s\b/.test(plain(words.body + words.live)), plain(words.body).match(/.{0,20}\b0\d.(min|s)\b.{0,10}/)?.[0]);
    if (fine) {
      check(`${tag}: the eight planet time labels on the stage keep the natural wording: ${naturalAll.map(plain).join(' · ')}`, words.labels.length === 8 && words.labels.join('|') === naturalAll.join('|'), JSON.stringify(words.labels));
      check(`${tag}: the Learn explanation keeps the natural list "${plain(L.PLANETS.map(id => L.formatDuration(L.sunToPlanet(id).lightSeconds)).join(' · ')).slice(0, 40)}…"`, plain(words.details).includes(`Neptún ${plain(L.formatDuration(NEPTUNE.lightSeconds))}`) && plain(words.details).includes(`Mars ${plain(L.formatDuration(MARS.lightSeconds))}`), plain(words.details).slice(0, 200));
    }
    check(`${tag}: no page or console errors`, errors.length === 0, errors.join(' | '));

    // ---- Evidence at the critical transitions (main size only): the same clip before and after, taken from fresh runs.
    if (fine) {
      const clipOf = async () => { const p = await probe(pg); return { x: Math.max(0, Math.floor(p.box.left - 24)), y: Math.max(0, Math.floor(p.box.top - 10)), width: Math.ceil(p.box.width + 48), height: Math.ceil(p.box.bottom - p.box.top + 20) }; };
      const goTo = async target => { for (let i = 0; i < 4000; i++) { const p = await probe(pg), scale = p.runScale ?? 60, left = target - p.seconds; if (left <= 0) return p; await advance(pg, Math.max(20, Math.min(100, left / scale * 1000)), 2); } };
      const transitions = async targets => { const out = [];
        for (const [label, target] of targets) { await goTo(target); const clip = await clipOf(), shots = [];
          for (let i = 0; i < 4; i++) { const p = await probe(pg); shots.push({ p, png: await pg.screenshot({ clip }) }); await advance(pg, 20, 2); }
          out.push({ label, clip, shots }); }
        return out; };
      await pg.evaluate(() => lightStage.reset()); await advance(pg, 100); await pg.evaluate(() => lightStage.start()); await advance(pg, 3050); await advance(pg, 100);
      const t1 = await transitions([['59 s to 1 min (00 min 59 s → 01 min 00 s)', 56.5], ['minutes 09 to 10 (09 min 59 s → 10 min 00 s)', 597.5]]);
      for (const t of t1) { const geo = t.shots.map(s => s.p.box), names = t.shots.map(s => plain(s.p.time));
        check(`${tag} transition "${t.label}": ${names.join(' → ')} — the readout's box and the unit letters stay exactly in place (left range ${range(geo.map(b => b.left)).toFixed(3)} px, width range ${range(geo.map(b => b.width)).toFixed(3)} px)`, range(geo.map(b => b.left)) <= TOL && range(geo.map(b => b.width)) <= TOL && range(t.shots.map(s => s.p.glyphs.s)) <= TOL && range(t.shots.map(s => s.p.glyphs.min)) <= TOL && new Set(names).size >= 3, JSON.stringify(names)); }
      const minuteAt = t1[0].shots.findIndex((x, i) => i > 0 && /^01.min/.test(x.p.time) && /^00.min/.test(t1[0].shots[i - 1].p.time));
      check(`${tag} the minute was crossed between two measured frames ("${minuteAt > 0 ? plain(t1[0].shots[minuteAt - 1].p.time) + '" → "' + plain(t1[0].shots[minuteAt].p.time) : '–'}")`, minuteAt > 0);
      if (minuteAt > 0) { fs.writeFileSync(path.join(OUT, `${size}-transition-minute-before.png`), t1[0].shots[minuteAt - 1].png); fs.writeFileSync(path.join(OUT, `${size}-transition-minute-after.png`), t1[0].shots[minuteAt].png); }
      await pg.evaluate(() => { lightStage.reset(); lightStage.skip(); }); await advance(pg, 100); await pg.evaluate(() => lightStage.toNeptune()); await advance(pg, 100);
      const t2 = await transitions([['59 min 59 s to 1 h 00 min 00 s (hour passes)', 3570], ['2 h 07 min 59 s to 2 h 08 min 00 s', 7650]]);
      for (const t of t2) { const geo = t.shots.map(s => s.p.box), names = t.shots.map(s => plain(s.p.time));
        check(`${tag} transition "${t.label}": ${names.join(' → ')} — the readout's box and the unit letters stay exactly in place (left range ${range(geo.map(b => b.left)).toFixed(3)} px, width range ${range(geo.map(b => b.width)).toFixed(3)} px)`, range(geo.map(b => b.left)) <= TOL && range(geo.map(b => b.width)) <= TOL && range(t.shots.map(s => s.p.glyphs.s)) <= TOL && range(t.shots.map(s => s.p.glyphs.min)) <= TOL && range(t.shots.map(s => s.p.glyphs.h)) <= TOL, JSON.stringify(names)); }
      const hourPair = t2[0].shots.findIndex((s, i) => i > 0 && /^1.h/.test(s.p.time) && /^0.h/.test(t2[0].shots[i - 1].p.time));
      check(`${tag} the hour was crossed between two measured frames ("${hourPair > 0 ? plain(t2[0].shots[hourPair - 1].p.time) + '" → "' + plain(t2[0].shots[hourPair].p.time) : '–'}")`, hourPair > 0);
      if (hourPair > 0) { fs.writeFileSync(path.join(OUT, `${size}-transition-hour-before.png`), t2[0].shots[hourPair - 1].png); fs.writeFileSync(path.join(OUT, `${size}-transition-hour-after.png`), t2[0].shots[hourPair].png); }
    }
    await context.close();
  }
  await browser.close(); server.close();
  console.log(`\n${passes} passed, ${failures} failed`);
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); server.close(); process.exit(1); });
