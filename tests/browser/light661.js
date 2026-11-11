// Phase 6H.5.3.1 Sun-to-planets learning flow harness (outside the repository). A test-only fixture lesson with the real planets
// light step (and a 15 s step for comparison) is injected only into this test browser; "pohyb" stays inactive in the app.
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const S = __dirname, ROOT = require('./env').ROOT, OUT = require('./env').out('light661'), PORT = Number(process.env.PORT || 8941);
fs.mkdirSync(OUT, { recursive: true });
const server = http.createServer((q, r) => { const u = decodeURIComponent(q.url.split('?')[0]); fs.readFile(path.join(ROOT, u === '/' ? 'index.html' : u), (e, d) => { if (e) { r.writeHead(404); r.end(); } else r.end(d); }); }).listen(PORT);
const FIXTURE = `window.LearnContent.topics.push({"id":"test-svetlo","title":"Testovacia lekcia","description":"Len na testovanie.","minutes":1}); window.LearnContent.lessons.push(${JSON.stringify({ id: 'test-svetlo', title: 'Svetlo — technický test', objective: 'Len na testovanie.', limitation: 'Len na testovanie.', steps: [
  { id: 'uvod', type: 'intro', title: 'Úvod — test', text: 'Len na testovanie.' },
  { id: 'planety', type: 'experiment', title: 'Svetlo zo Slnka k planétam', text: 'Svetlo zo Slnka letí rýchlosťou takmer 300 000 km za sekundu. Planéty sú však veľmi ďaleko, preto mu cesta k nim trvá minúty až hodiny.', experiment: { kind: 'light-travel', journey: 'planets' } },
  { id: 'svetlo15', type: 'experiment', title: 'Svetlo za 15 sekúnd', text: 'Len na testovanie.', experiment: { kind: 'light-travel', journey: 'fifteen' } },
  { id: 'zaver', type: 'summary', title: 'Koniec testu', ideas: ['Len na testovanie.'], text: 'Len na testovanie.' }] })});`;
let failures = 0, passes = 0; const notes = [];
const check = (label, ok, detail = '') => { ok ? passes++ : failures++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${!ok && detail ? '  — ' + String(detail).slice(0, 1200) : ''}`); };
async function open(browser, w, h, options = {}) {
  const context = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: w < 500, ...options }), pg = await context.newPage(), errors = [];
  pg.on('pageerror', e => errors.push(e.message)); pg.on('console', m => { if (m.type() === 'error' || /THREE\.WebGL|shader/i.test(m.text())) errors.push('console: ' + m.text()); });
  await pg.route('**/three.min.js', r => r.fulfill({ path: require('./env').vendor('three.min.js') }));
  await pg.route('**/OrbitControls.js', r => r.fulfill({ path: require('./env').vendor('OrbitControls.js') }));
  await pg.route('**/learn-content.sk.js', async r => { const res = await r.fetch(); r.fulfill({ response: res, body: (await res.text()) + '\n' + FIXTURE }); });
  await pg.goto(`http://localhost:${PORT}/`); await pg.waitForTimeout(600);
  await pg.fill('#activation-code', 'NGV-2025'); await pg.evaluate(() => checkCode()); await pg.waitForTimeout(2800);
  await pg.evaluate(() => { if (areOrbitsActive) toggleOrbit(); });
  // Record every announcement (the Learn live region) and every stage call that would mean an Earth–Moon fallback.
  await pg.evaluate(() => { window.__said = []; const live = document.querySelector('.learn-live'); // announce() clears, then sets the text: record each non-empty setting
    new MutationObserver(() => { const t = live.textContent; if (t) window.__said.push(t); }).observe(live, { subtree: true, childList: true, characterData: true });
    window.__calls = []; for (const name of ['toMoon', 'setPrediction', 'toNeptune', 'pause', 'resume', 'reset', 'skip', 'start']) { const f = lightStage[name]; lightStage[name] = (...a) => { window.__calls.push(name); return f(...a); }; } });
  return { pg, errors, context };
}
const toStep = async (pg, n) => {
  await pg.evaluate(() => { Learn.enter(); [...document.querySelectorAll('.learn-topic')].find(c => c.querySelector('h3').textContent === 'Testovacia lekcia').querySelector('button').click(); });
  await pg.waitForTimeout(400); for (let i = 0; i < n; i++) { await pg.evaluate(() => document.querySelector('.learn-footer .learn-primary').click()); await pg.waitForTimeout(450); }
};
const frames = (pg, n = 3) => pg.evaluate(n => new Promise(res => { let k = 0; const f = () => (++k >= n ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
const fake = pg => pg.evaluate(() => { window.__realNow = window.__realNow || performance.now.bind(performance); window.__t = window.__realNow(); performance.now = () => window.__t; });
const advance = async (pg, ms, n = 2) => { await pg.evaluate(ms => { window.__t += ms; }, ms); await frames(pg, n); };
const play = async (pg, totalMs, stepMs = 200) => { for (let t = 0; t < totalMs; t += stepMs) await advance(pg, Math.min(stepMs, totalMs - t), 1); };
const nb = s => s.replace(/ /g, ' ');
// Panel read-out: visible texts and controls.
const PANEL = () => { const q = s => document.querySelector(s), vis = e => !!e && !e.hidden && !e.closest('[hidden]') && e.getClientRects().length > 0;
  const sets = [...document.querySelectorAll('.learn-light-box fieldset')].map(f => ({ q: f.dataset.question ?? 'fifteen', shown: vis(f), legend: f.querySelector('legend')?.textContent, options: [...f.querySelectorAll('label')].map(l => ({ text: l.textContent, value: l.querySelector('input').value, checked: l.querySelector('input').checked, disabled: l.querySelector('input').disabled })) }));
  const ask = q('.learn-light-ask');
  const fb = q('.learn-light-feedback');
  return { feedback: vis(fb) ? fb.textContent : null, lead: vis(q('.learn-light-lead:not(.learn-light-ask)')) ? q('.learn-light-lead:not(.learn-light-ask)').textContent : null, ask: vis(ask) ? ask.textContent : null,
    lines: [...document.querySelectorAll('.learn-light-message p')].map(p => p.textContent), sets, slider: vis(q('.learn-light-pick')),
    primary: q('.learn-light-box .learn-primary')?.textContent, secondary: vis(q('[data-focus="light-secondary"]')) ? q('[data-focus="light-secondary"]').textContent : null,
    skip: vis(q('[data-focus="light-skip"]')) ? q('[data-focus="light-skip"]').textContent : null, details: [...document.querySelectorAll('#learn-experiment-details p')].map(p => p.textContent),
    detailsShown: vis(q('#learn-experiment-details')), toggle: q('.learn-expand')?.textContent, all: q('#learn-root').innerText, stage: lightStage.state() }; };
const P = async pg => { const p = await pg.evaluate(`(${PANEL})()`); for (const k of ['lead', 'ask', 'primary', 'all']) if (p[k]) p[k] = nb(p[k]); p.lines = p.lines.map(nb); p.details = p.details.map(nb); return p; };
const choose = (pg, q, text) => pg.evaluate(([q, text]) => [...document.querySelectorAll(`fieldset[data-question="${q}"] label`)].find(l => l.textContent === text).click(), [q, text]);
const primary = pg => pg.evaluate(() => document.querySelector('.learn-light-box .learn-primary').click());

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  let ref = null;
  // A. Full guided flow on desktop (1366×768) with screenshots; then 390×844 and 844×390 for screenshots and the same checks.
  for (const [w, h] of [[1366, 768], [390, 844], [844, 390]]) {
    const tag = `${w}×${h}`, { pg, errors, context } = await open(browser, w, h);
    await toStep(pg, 1); await fake(pg); await advance(pg, 50, 3);
    ref = await pg.evaluate(() => LightData.PLANETS.map(id => { const p = LightData.sunToPlanet(id); return { id, seconds: p.lightSeconds, km: p.distanceKm, text: LightData.formatDuration(p.lightSeconds).replace(/ /g, ' ') }; }));
    let p = await P(pg);
    check(`${tag} ready: question "${p.lead}", the Earth choices ${JSON.stringify(p.sets.find(s => s.shown)?.options.map(o => o.text))}, primary "${p.primary}"; no slider; the stage runs the planets journey`,
      p.lead === 'Ako dlho letí svetlo zo Slnka k Zemi?' && JSON.stringify(p.sets.find(s => s.shown).options.map(o => o.text)) === JSON.stringify(['Asi 8 sekúnd', 'Asi 8 minút', 'Asi 8 hodín']) && p.sets.find(s => s.shown).q === 'earth'
        && p.sets.filter(s => s.shown).length === 1 && !p.slider && p.primary === 'Vyšli svetlo' && p.stage.journey === 'planets' && p.stage.phase === 'ready' && !p.ask, JSON.stringify(p).slice(0, 600));
    check(`${tag} ready: no Earth–Moon wording or controls ("Mesiac", "Pokračovať k Mesiacu", tip slider)`, !/Mesiac/.test(p.all) && !p.slider, p.all.slice(0, 400));
    await pg.screenshot({ path: path.join(OUT, `1-ready-${w}x${h}.png`) });
    await choose(pg, 'earth', 'Asi 8 minút'); await advance(pg, 50);
    p = await P(pg);
    check(`${tag}: choosing "Asi 8 minút" marks it selected (one answer)`, p.sets.find(s => s.q === 'earth').options.filter(o => o.checked).map(o => o.text).join() === 'Asi 8 minút');
    await primary(pg); await advance(pg, 50); p = await P(pg);
    check(`${tag} countdown: "Pozor…" and the start button disabled; guess locked`, p.stage.phase === 'countdown' && /^Pozor/.test(p.primary) && p.sets.find(s => s.q === 'earth').options.every(o => o.disabled), JSON.stringify(p.stage).slice(0, 200));
    await advance(pg, 3000); await advance(pg, 50); p = await P(pg);
    check(`${tag} stage A running: "${p.lines[0]}", primary "${p.primary}"`, p.stage.phase === 'first' && p.lines[0] === 'Svetlo letí k Marsu… Prehrávanie je 60-krát rýchlejšie.' && p.primary === 'Pozastaviť' && p.stage.runTimeScale === 60);
    await play(pg, 12800); await advance(pg, 50, 3); p = await P(pg);
    check(`${tag} Mars stop: "${p.lead}" then "${p.ask}"; feedback "${p.feedback}" (under the result); Neptune choices; primary "${p.primary}"`,
      p.stage.phase === 'mars' && p.lead === `K Zemi letelo svetlo ${ref[2].text}.` && p.lead === 'K Zemi letelo svetlo 8 min 19 s.' && p.ask === 'Ako dlho bude svetlo letieť až k Neptúnu?' && p.feedback === 'Správne! Svetlo letí k Zemi asi 8 minút.'
        && JSON.stringify(p.sets.find(s => s.shown)?.options.map(o => o.text)) === JSON.stringify(['Asi 40 minút', 'Asi 4 hodiny', 'Asi 4 dni']) && p.sets.find(s => s.shown).options.every(o => !o.disabled) && p.primary === 'Pokračovať k Neptúnu', JSON.stringify(p).slice(0, 700));
    const inView = () => pg.evaluate(() => { const f = document.querySelector('.learn-light-feedback'), body = document.querySelector('.learn-body').getBoundingClientRect(), root = document.getElementById('learn-root').getBoundingClientRect(), r = f.getBoundingClientRect();
      return !f.hidden && r.top >= Math.max(body.top, root.top) - 0.5 && r.bottom <= Math.min(body.bottom, root.bottom, innerHeight) + 0.5; });
    check(`${tag}: at the Mars stop the result and its feedback are in view without scrolling`, await inView());
    await pg.screenshot({ path: path.join(OUT, `2-mars-${w}x${h}.png`) });
    await choose(pg, 'neptune', 'Asi 4 hodiny'); await advance(pg, 50);
    const marsSeconds = p.stage.seconds;
    await primary(pg); await advance(pg, 50, 1); p = await P(pg);
    check(`${tag}: "Pokračovať k Neptúnu" continues at 600× from exactly Mars's time (${marsSeconds.toFixed(3)} s → ${p.stage.seconds.toFixed(3)} s = Mars + ${p.stage.playbackSeconds.toFixed(3)} × 600); "${p.lines[0]}"`,
      p.stage.phase === 'second' && p.stage.runTimeScale === 600 && marsSeconds === ref[3].seconds && Math.abs(p.stage.seconds - (ref[3].seconds + p.stage.playbackSeconds * 600)) < 1e-6 && p.lines[0] === 'Svetlo letí k Neptúnu… Prehrávanie je 600-krát rýchlejšie.' && p.sets.find(s => s.q === 'neptune').options.every(o => o.disabled));
    await play(pg, 24000, 250); await advance(pg, 50, 3); p = await P(pg);
    check(`${tag} Neptune: "${p.lead}"; feedback "${p.feedback}"; ${JSON.stringify(p.lines)}; primary "${p.primary}"; all eight arrivals with LightData times`,
      p.stage.phase === 'neptune' && p.lead === `K Neptúnu letelo svetlo ${ref[7].text}!` && p.lead === 'K Neptúnu letelo svetlo 4 h 10 min 5 s!' && p.feedback === 'Správne! Svetlo letí k Neptúnu asi 4 hodiny.' && p.lines.join(' ').includes('Svetlo, ktoré práve dopadlo na Neptún, vyšlo zo Slnka pred viac ako 4 hodinami.')
        && p.primary === 'Opakovať pokus' && p.stage.seconds === ref[7].seconds && p.stage.arrivals.length === 8 && p.stage.arrivals.every((a, i) => a.id === ref[i].id && a.seconds === ref[i].seconds), JSON.stringify(p).slice(0, 700));
    check(`${tag} explanation: all eight LightData times, the two scales, real time vs playback, symbolic markers, average centre distances`,
      p.details.some(t => ref.every(r => t.includes(r.text))) && p.details.some(t => /0 – 1,7 au/.test(t) && /0 – 31 au/.test(t)) && p.details.some(t => /60-krát/.test(t) && /600-krát/.test(t) && /skutočný čas letu svetla/.test(t)) && p.details.some(t => /značky/.test(t)) && p.details.some(t => /priemerné vzdialenosti od stredu Slnka k stredu planéty/.test(t)) && !p.details.some(t => /Mesiac/.test(t)), JSON.stringify(p.details));
    check(`${tag}: at Neptune the result and its feedback are in view without scrolling`, await inView());
    await pg.screenshot({ path: path.join(OUT, `3-neptune-${w}x${h}.png`) });
    // Repeat clears both guesses.
    await primary(pg); await advance(pg, 50, 3); p = await P(pg);
    check(`${tag}: "Opakovať pokus" returns to ready with both guesses cleared (no answer selected in either question)`, p.stage.phase === 'ready' && p.stage.arrivals.length === 0 && p.sets.every(s => s.options.every(o => !o.checked)) && p.lead === 'Ako dlho letí svetlo zo Slnka k Zemi?' && p.primary === 'Vyšli svetlo', JSON.stringify(p.sets));
    const calls = await pg.evaluate(() => window.__calls);
    check(`${tag}: no Earth–Moon fallback (no toMoon or setPrediction call; stage calls: ${[...new Set(calls)].join(', ')})`, !calls.includes('toMoon') && !calls.includes('setPrediction') && calls.includes('toNeptune'));
    const said = (await pg.evaluate(() => window.__said)).map(nb);
    check(`${tag} screen reader: announcements only at state changes — start, departure, full Mars text (result, feedback, next question), continuation, full Neptune text, ready again`,
      said.some(t => /^Pozor/.test(t)) && said.includes('Svetlo vyrazilo.') && said.some(t => t.startsWith('K Zemi letelo svetlo 8 min 19 s. Správne! Svetlo letí k Zemi asi 8 minút.') && t.includes('Ako dlho bude svetlo letieť až k Neptúnu?')) && said.includes('Svetlo pokračuje k Neptúnu. Prehrávanie je 600-krát rýchlejšie.')
        && said.some(t => t.startsWith('K Neptúnu letelo svetlo 4 h 10 min 5 s!')) && said.includes('Pokus je pripravený. Môžeš si znova tipnúť.') && !said.some(t => /Svetlo letí k (Marsu|Neptúnu)…/.test(t)), JSON.stringify(said));
    check(`${tag}: no JS errors`, errors.length === 0, errors.join('; '));
    await context.close();
  }
  // B. Every choice and the no-guess case (fast: the stage's own skip moves between results; the panel follows its state).
  {
    const { pg, errors, context } = await open(browser, 1366, 768);
    await toStep(pg, 1); await fake(pg); await advance(pg, 50, 3);
    const cases = [[null, null], ['Asi 8 sekúnd', 'Asi 40 minút'], ['Asi 8 minút', 'Asi 4 hodiny'], ['Asi 8 hodín', 'Asi 4 dni']], seen = [];
    for (const [e, n] of cases) {
      if (e) await choose(pg, 'earth', e);
      await pg.evaluate(() => lightStage.skip()); await advance(pg, 50, 3); const m = await P(pg);
      if (n) await choose(pg, 'neptune', n);
      await pg.evaluate(() => lightStage.skip()); await advance(pg, 50, 3); const d = await P(pg);
      seen.push({ e, n, mars: m.feedback, marsLines: m.lines, nep: d.feedback, nepLines: d.lines });
      await primary(pg); await advance(pg, 50, 3);
    }
    const [none, short, right, long] = seen;
    check(`no guesses: the results only, no comment (feedback ${none.mars} / ${none.nep}; lines ${JSON.stringify([...none.marsLines, ...none.nepLines])})`,
      none.mars === null && none.nep === null && JSON.stringify(none.marsLines) === JSON.stringify(['Ďalej uvidíš celú cestu až k Neptúnu. Zmení sa mierka a prehrávanie bude 10-krát rýchlejšie.']) && JSON.stringify(none.nepLines) === JSON.stringify(['Svetlo, ktoré práve dopadlo na Neptún, vyšlo zo Slnka pred viac ako 4 hodinami.']));
    check(`too-short guesses: neutral "dlhšie" feedback (${short.mars} / ${short.nep})`, short.mars === 'Svetlo letelo dlhšie, než si tipol.' && short.nep === 'Svetlo letelo dlhšie, než si tipol.');
    check(`correct guesses: "Správne!" with the result (${right.mars} / ${right.nep})`, right.mars === 'Správne! Svetlo letí k Zemi asi 8 minút.' && right.nep === 'Správne! Svetlo letí k Neptúnu asi 4 hodiny.');
    check(`too-long guesses: neutral "kratšie" feedback (${long.mars} / ${long.nep})`, long.mars === 'Svetlo letelo kratšie, než si tipol.' && long.nep === 'Svetlo letelo kratšie, než si tipol.');
    // A guess is optional: starting without one works; the Neptune guess can only be made at the Mars stop.
    const p0 = await P(pg);
    check('guesses are optional and limited to their question phase: in ready only the Earth row is enabled; the Neptune row is not shown', p0.sets.find(s => s.q === 'earth').options.every(o => !o.disabled) && !p0.sets.find(s => s.q === 'neptune').shown && p0.sets.find(s => s.q === 'neptune').options.every(o => o.disabled));
    // Leaving and re-entering keeps the session guesses only within the lesson; reopening the lesson clears them.
    await choose(pg, 'earth', 'Asi 8 minút'); await pg.evaluate(() => document.querySelector('.learn-footer .learn-primary').click()); await pg.waitForTimeout(400);
    const away = await pg.evaluate(() => lightStage.state().journey ?? 'inactive'); // the next fixture step is the 15 s experiment
    await pg.evaluate(() => [...document.querySelectorAll('.learn-footer button')].find(b => /Späť|←/.test(b.textContent))?.click()); await pg.waitForTimeout(400); await advance(pg, 50, 3);
    const back = await P(pg);
    check(`cleanup: moving to the next step ends the planets journey (stage now: ${away}); coming back keeps the lesson-session guess (${back.sets.find(s => s.q === 'earth').options.filter(o => o.checked).map(o => o.text)}) and restarts at ready`, away === 'fifteen' && back.stage.journey === 'planets' && back.stage.phase === 'ready' && back.sets.find(s => s.q === 'earth').options.find(o => o.checked)?.text === 'Asi 8 minút');
    await pg.evaluate(() => Learn.leave()); await pg.waitForTimeout(300);
    const left = await pg.evaluate(() => ({ stage: lightStage.active, overlay: document.getElementById('light-stage-overlay').hidden }));
    await toStep(pg, 1); await advance(pg, 50, 3); const reopened = await P(pg);
    check('cleanup: leaving Learn ends the stage and hides its overlay; reopening the lesson starts with no guesses', !left.stage && left.overlay && reopened.sets.every(s => s.options.every(o => !o.checked)), JSON.stringify(left));
    check('choices/no-guess/cleanup: no JS errors', errors.length === 0, errors.join('; '));
    await context.close();
  }
  // C. Explanation pauses the planets run (compact phone panel); never resumes by itself; the 15 s step keeps its behaviour.
  {
    const { pg, errors, context } = await open(browser, 390, 844);
    await toStep(pg, 1); await fake(pg); await advance(pg, 50, 3);
    await primary(pg); await advance(pg, 3000); await advance(pg, 50); await play(pg, 2000);
    let p = await P(pg);
    check(`390×844: the compact panel offers "${p.toggle}" (explanation closed)`, p.toggle === 'Vysvetlenie' && !p.detailsShown);
    const before = p.stage.seconds;
    await pg.evaluate(() => document.querySelector('.learn-expand').click()); await advance(pg, 50, 3); p = await P(pg);
    await advance(pg, 5000); const later = await P(pg);
    check(`opening "Vysvetlenie" in stage A pauses the light (reason user) at its exact time (${before.toFixed(1)} → ${p.stage.seconds.toFixed(1)} s, 5 s later still ${later.stage.seconds.toFixed(1)} s); the explanation shows the eight times`,
      p.stage.paused && p.stage.pauseReason === 'user' && later.stage.seconds === p.stage.seconds && p.stage.seconds - before < 60 * 0.2 && p.detailsShown && p.details.some(t => /Neptún 4 h 10 min 5 s/.test(t)) && p.toggle === 'Menej textu', JSON.stringify(p.stage).slice(0, 300));
    await pg.evaluate(() => document.querySelector('.learn-expand').click()); await advance(pg, 2000); p = await P(pg);
    check(`closing the explanation does not resume (still paused at ${p.stage.seconds.toFixed(1)} s); the panel offers "${p.primary}"`, p.stage.paused && p.stage.seconds === later.stage.seconds && p.primary === 'Pokračovať' && p.lines[0] === 'Experiment je pozastavený.');
    await primary(pg); await play(pg, 1000); p = await P(pg);
    check(`only the learner's "Pokračovať" resumes (${p.stage.seconds.toFixed(1)} s)`, !p.stage.paused && p.stage.seconds > later.stage.seconds + 50);
    // Stage B: the same.
    await play(pg, 12000); await advance(pg, 50, 3); await primary(pg); await play(pg, 1000); const b0 = await P(pg);
    await pg.evaluate(() => document.querySelector('.learn-expand').click()); await advance(pg, 4000); const b1 = await P(pg);
    check(`in stage B (600×) opening "Vysvetlenie" also pauses at the exact time (${b0.stage.seconds.toFixed(0)} → ${b1.stage.seconds.toFixed(0)} s)`, b0.stage.phase === 'second' && b1.stage.paused && b1.stage.seconds - b0.stage.seconds < 600 * 0.2);
    await pg.evaluate(() => document.querySelector('.learn-expand').click()); await advance(pg, 50, 3);
    // Opening the explanation when nothing runs (Mars stop) changes nothing.
    await primary(pg); await play(pg, 30000, 500); const done = await P(pg);
    await pg.evaluate(() => document.querySelector('.learn-expand').click()); await advance(pg, 50, 3); const doneOpen = await P(pg);
    check('at a result (Neptune) the explanation only opens (no pause, no state change)', done.stage.phase === 'neptune' && doneOpen.stage.phase === 'neptune' && doneOpen.detailsShown);
    await pg.evaluate(() => document.querySelector('.learn-expand').click()); await advance(pg, 50, 3);
    // The 15 s step: opening the explanation during its run keeps the existing behaviour (no pause).
    await pg.evaluate(() => document.querySelector('.learn-footer .learn-primary').click()); await pg.waitForTimeout(450); await advance(pg, 50, 3);
    await primary(pg); await advance(pg, 3000); await advance(pg, 50); await play(pg, 1000);
    await pg.evaluate(() => document.querySelector('.learn-expand').click()); await advance(pg, 1000); const f = await P(pg);
    check(`15 s step unchanged: its explanation does not pause the run (phase ${f.stage.phase}, paused ${f.stage.paused})`, f.stage.journey === 'fifteen' && f.stage.phase === 'first' && !f.stage.paused);
    check('explanation behaviour: no JS errors', errors.length === 0, errors.join('; '));
    await context.close();
  }
  // D. Hidden tab, keyboard, reduced motion.
  {
    const { pg, errors, context } = await open(browser, 1366, 768, { reducedMotion: 'reduce' });
    await toStep(pg, 1); await fake(pg); await advance(pg, 50, 3);
    let p = await P(pg);
    check(`reduced motion: ready offers "${p.skip}"`, p.skip === 'Ukáž cestu k Marsu bez animácie');
    await pg.evaluate(() => document.querySelector('[data-focus="light-skip"]').click()); await advance(pg, 50, 3); p = await P(pg);
    check(`reduced motion: the skip shows the exact Mars result (${p.stage.seconds.toFixed(3)} s) with the Neptune question; the next skip reads "${p.skip}"`, p.stage.phase === 'mars' && p.stage.skipped && p.stage.seconds === ref[3].seconds && p.ask === 'Ako dlho bude svetlo letieť až k Neptúnu?' && p.skip === 'Ukáž cestu k Neptúnu bez animácie');
    await pg.evaluate(() => document.querySelector('[data-focus="light-skip"]').click()); await advance(pg, 50, 3); p = await P(pg);
    check('reduced motion: the second skip shows the exact Neptune result; no skip left', p.stage.phase === 'neptune' && p.stage.seconds === ref[7].seconds && p.skip === null && p.lead === 'K Neptúnu letelo svetlo 4 h 10 min 5 s!');
    await primary(pg); await advance(pg, 50, 3);
    // Keyboard: Tab into the Earth answers, arrow keys choose, Tab to the primary action, Enter starts.
    await pg.evaluate(() => document.getElementById('learn-heading').focus());
    let got = null; for (let i = 0; i < 20 && !got; i++) { await pg.keyboard.press('Tab'); got = await pg.evaluate(() => document.activeElement?.name === 'learn-planet-earth' ? document.activeElement.value : null); }
    await pg.keyboard.press('ArrowRight'); await advance(pg, 50);
    const picked = await pg.evaluate(() => [...document.querySelectorAll('input[name="learn-planet-earth"]')].find(i => i.checked)?.closest('label').textContent);
    let onPrimary = false; for (let i = 0; i < 10 && !onPrimary; i++) { await pg.keyboard.press('Tab'); onPrimary = await pg.evaluate(() => document.activeElement?.dataset.focus === 'light-primary'); }
    await pg.keyboard.press('Enter'); await advance(pg, 50); const kb = await P(pg);
    check(`keyboard: Tab reaches the Earth answers, arrow keys choose ("${picked}"), Tab reaches "Vyšli svetlo", Enter starts the countdown`, got !== null && !!picked && onPrimary && kb.stage.phase === 'countdown');
    await advance(pg, 3000); await advance(pg, 50); await play(pg, 1000);
    await pg.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); document.dispatchEvent(new Event('visibilitychange')); });
    await advance(pg, 50, 3); const h1 = await P(pg); await advance(pg, 60000); const h2 = await P(pg);
    await pg.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' }); document.dispatchEvent(new Event('visibilitychange')); }); await advance(pg, 100); const h3 = await P(pg);
    check(`hidden tab: paused (reason hidden) with "${h1.lines.join(' ')}"; no time passes while hidden; no automatic resume`, h1.stage.paused && h1.stage.pauseReason === 'hidden' && h1.lines.includes('Zastavili sme ho, keď si odišiel zo stránky.') && h2.stage.seconds === h1.stage.seconds && h3.stage.paused && h1.primary === 'Pokračovať');
    await primary(pg); await play(pg, 600); const h4 = await P(pg);
    check('hidden tab: "Pokračovať" resumes from the same physical time', !h4.stage.paused && h4.stage.seconds > h1.stage.seconds && h4.stage.phase === 'first');
    const said = (await pg.evaluate(() => window.__said)).map(nb);
    check('screen reader: the pause after a hidden tab is announced', said.some(t => t.startsWith('Experiment je pozastavený.')));
    check('hidden tab / keyboard / reduced motion: no JS errors', errors.length === 0, errors.join('; '));
    await context.close();
  }
  // E. Production content (no fixture), Phase 6H.6.3 activation candidate.
  {
    const context = await browser.newContext({ viewport: { width: 1366, height: 768 } }), pg = await context.newPage();
    await pg.route('**/three.min.js', r => r.fulfill({ path: require('./env').vendor('three.min.js') })); await pg.route('**/OrbitControls.js', r => r.fulfill({ path: require('./env').vendor('OrbitControls.js') }));
    await pg.goto(`http://localhost:${PORT}/`); await pg.waitForTimeout(600); await pg.fill('#activation-code', 'NGV-2025'); await pg.evaluate(() => checkCode()); await pg.waitForTimeout(2500);
    // Phase 6H.6.3 activation candidate: the planets journey is used exactly once, by the real sixth lesson (until 6H.6.2: test fixtures only).
    const prod = await pg.evaluate(() => { Learn.enter(); const card = [...document.querySelectorAll('.learn-topic')].find(c => c.querySelector('h3').textContent === 'Svetlo a vesmírne vzdialenosti');
      return { button: !!card?.querySelector('button:not([disabled])'), planets: window.LearnContent.lessons.flatMap(l => l.steps.filter(s => s.experiment?.journey === 'planets').map(s => `${l.id}:${s.id}`)) }; });
    check('production: the sixth topic "Svetlo a vesmírne vzdialenosti" is active; the planets journey is used exactly once, by its step "k-planetam"', prod.button && JSON.stringify(prod.planets) === JSON.stringify(['pohyb:k-planetam']), JSON.stringify(prod));
    await context.close();
  }
  console.log('NOTES\n' + notes.join('\n'));
  console.log(`${passes} passed, ${failures} failed`);
  await browser.close(); server.close();
})();
