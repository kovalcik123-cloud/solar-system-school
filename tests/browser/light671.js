// Phase 6H.6.1 whole-lesson integration harness: the complete eight-step Light Laboratory lesson (test-only fixture
// fixtures/light-lesson.js; the app's own content is unchanged and the real "pohyb" topic stays inactive).
// Covers the full sequence forwards and backwards, journey switching and cleanup, predictions and session state, leaving and
// returning, Explore and Quiz, focus and announcements, hidden tab, reduced motion, journey validation, at four sizes.
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const env = require('./env'), { inject, lesson } = require('./fixtures/light-lesson');
const ROOT = env.ROOT, OUT = env.out('light671'), PORT = Number(process.env.PORT || 8955);
const server = http.createServer((q, r) => { const u = decodeURIComponent(q.url.split('?')[0]); fs.readFile(path.join(ROOT, u === '/' ? 'index.html' : u), (e, d) => { if (e) { r.writeHead(404); r.end(); } else r.end(d); }); }).listen(PORT);
let failures = 0, passes = 0;
const check = (label, ok, detail = '') => { ok ? passes++ : failures++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${!ok && detail ? '  — ' + String(detail).slice(0, 1200) : ''}`); };
const TITLES = lesson.steps.map(s => s.title), TOPIC = 'Svetlo a vesmírne vzdialenosti';
const REJECTED = /^Learn: lesson "pohyb" is not available/;

async function open(browser, w, h, { fixture = inject(), options = {} } = {}) {
  const context = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: w < 500, ...options }), pg = await context.newPage(), errors = [], rejected = [];
  pg.on('pageerror', e => errors.push(e.message));
  pg.on('console', m => { if (m.type() !== 'error' && !/THREE\.WebGL|shader/i.test(m.text())) return; if (REJECTED.test(m.text())) rejected.push(m.text()); else errors.push('console: ' + m.text()); });
  await pg.route('**/three.min.js', r => r.fulfill({ path: env.vendor('three.min.js') }));
  await pg.route('**/OrbitControls.js', r => r.fulfill({ path: env.vendor('OrbitControls.js') }));
  if (fixture) await pg.route('**/learn-content.sk.js', async r => { const res = await r.fetch(); r.fulfill({ response: res, body: (await res.text()) + '\n' + fixture }); });
  await pg.goto(`http://localhost:${PORT}/`); await pg.waitForTimeout(600);
  await pg.fill('#activation-code', 'NGV-2025'); await pg.evaluate(() => checkCode()); await pg.waitForTimeout(2800);
  await pg.evaluate(() => { if (areOrbitsActive) toggleOrbit(); window.__said = []; const live = document.querySelector('.learn-live');
    new MutationObserver(() => { const t = live.textContent; if (t) window.__said.push(t); }).observe(live, { subtree: true, childList: true, characterData: true }); });
  return { pg, errors, rejected, context };
}
const frames = (pg, n = 3) => pg.evaluate(n => new Promise(res => { let k = 0; const f = () => (++k >= n ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
const fake = pg => pg.evaluate(() => { window.__realNow = window.__realNow || performance.now.bind(performance); window.__t = window.__realNow(); performance.now = () => window.__t; });
const advance = async (pg, ms, n = 2) => { await pg.evaluate(ms => { window.__t += ms; }, ms); await frames(pg, n); };
const play = async (pg, totalMs, stepMs = 250) => { for (let t = 0; t < totalMs; t += stepMs) await advance(pg, Math.min(stepMs, totalMs - t), 1); };
const topics = pg => pg.evaluate(() => [...document.querySelectorAll('.learn-topic')].map(c => ({ t: c.querySelector('h3').textContent, text: c.textContent, button: !!c.querySelector('button') })));
const startLesson = async pg => { await pg.evaluate(t => { Learn.enter(); [...document.querySelectorAll('.learn-topic')].find(c => c.querySelector('h3').textContent === t).querySelector('button').click(); }, TOPIC); await pg.waitForTimeout(450); await advance(pg, 50, 3); };
// Next and Back through the keyboard (focus the footer button, Enter), as a learner without a mouse would.
const key = async (pg, which) => { const ok = await pg.evaluate(which => { const b = which === 'next' ? document.querySelector('.learn-footer .learn-primary') : [...document.querySelectorAll('.learn-footer button')].find(x => /^(Späť|←)/.test(x.textContent.trim())); if (!b || b.disabled) return false; b.focus(); return true; }, which); if (ok) await pg.keyboard.press('Enter'); await pg.waitForTimeout(450); await advance(pg, 50, 3); return ok; };
const answer = async (pg, id) => { await pg.evaluate(id => { const i = document.querySelector(`.learn-answer input[value="${id}"]`); i.checked = true; i.dispatchEvent(new Event('change', { bubbles: true })); document.querySelector('[data-check]').click(); }, id); await pg.waitForTimeout(200);
  return pg.evaluate(() => ({ feedback: document.querySelector('.learn-feedback')?.textContent ?? '', next: !document.querySelector('.learn-footer .learn-primary').disabled })); };
const retry = pg => pg.evaluate(() => [...document.querySelectorAll('button')].find(b => b.textContent === 'Skúsiť znova')?.click());
const clickLabel = (pg, scope, text) => pg.evaluate(([scope, text]) => [...document.querySelectorAll(`${scope} label`)].find(l => l.textContent.trim() === text).click(), [scope, text]);
// One snapshot of where the lesson is and what the light stage shows.
const S = () => {
  const vis = sel => [...document.querySelectorAll(sel)].filter(e => !e.hidden && !e.closest('[hidden]') && e.getClientRects().length > 0);
  const st = lightStage.state(), overlay = document.getElementById('light-stage-overlay');
  return { step: Learn.state.step, lesson: Learn.state.lesson, heading: document.getElementById('learn-heading')?.textContent ?? null, focus: document.activeElement?.id || document.activeElement?.tagName,
    stage: st.active ? { journey: st.journey, phase: st.phase } : null, overlayHidden: !overlay || overlay.hidden, bodyClass: document.body.classList.contains('is-light-stage'),
    shown: { moon: vis('#light-stage-overlay .light-label').some(e => e.textContent === 'Mesiac'), earth: vis('#light-stage-overlay .light-label').some(e => e.textContent === 'Zem'), ruler: vis('#light-stage-overlay .light-ruler, #light-stage-overlay .light-mile').length, planets: vis('#light-stage-overlay .light-planet, #light-stage-overlay .light-caption, #light-stage-overlay .light-speed').length },
    slider: vis('.learn-light-pick').length > 0, fifteenChoices: vis('fieldset.learn-light-choices:not([data-question])').length > 0, planetChoices: vis('fieldset[data-question]').length > 0,
    lead: document.querySelector('.learn-light-lead:not(.learn-light-ask)')?.textContent?.replace(/ /g, ' ') ?? null, body: document.getElementById('learn-root')?.innerText.replace(/ /g, ' ') ?? '' };
};
const snap = pg => pg.evaluate(`(${S})()`);
// Each journey shows only its own scene objects and panel controls; question and summary steps show no light stage at all.
function journeyClean(s, expected) {
  if (!expected) return !s.stage && s.overlayHidden && !s.bodyClass && !s.slider && !s.fifteenChoices && !s.planetChoices;
  if (!s.stage || s.stage.journey !== expected || s.overlayHidden || !s.bodyClass) return false;
  if (expected === 'earth-moon') return s.shown.moon && s.shown.ruler === 0 && s.shown.planets === 0 && s.slider && !s.fifteenChoices && !s.planetChoices;
  if (expected === 'fifteen') return !s.shown.moon && s.shown.ruler > 0 && s.shown.planets === 0 && !s.slider && s.fifteenChoices && !s.planetChoices;
  return !s.shown.moon && !s.shown.earth && s.shown.ruler === 0 && s.shown.planets > 0 && !s.slider && !s.fifteenChoices && s.planetChoices;
}
const JOURNEY = [null, 'earth-moon', 'fifteen', 'planets', null, null, null, null];

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  for (const [w, h] of [[1366, 768], [390, 844], [390, 667], [844, 390]]) {
    const tag = `${w}×${h}`, { pg, errors, rejected, context } = await open(browser, w, h);
    const shot = name => pg.screenshot({ path: path.join(OUT, `${name}-${w}x${h}.png`) });
    await fake(pg); await advance(pg, 50);
    await pg.evaluate(() => Learn.enter()); await pg.waitForTimeout(300);
    const cards = await topics(pg), card = cards.find(c => c.t === TOPIC);
    check(`${tag} topic list (test-only topic card): "${TOPIC}" with its description, about 9 minutes and a start button; the five existing lessons unchanged`,
      !!card && card.button && card.text.includes('Zisti, ako ďaleko doletí svetlo za sekundu') && card.text.includes('Približne 9 min') && cards.slice(0, 5).every(c => c.button) && cards.length === 6, JSON.stringify(cards.map(c => c.t)));
    await shot('0-topics');
    await startLesson(pg);
    // Forward through all eight steps.
    const forward = [];
    for (let i = 0; i < 8; i++) {
      let s = await snap(pg);
      const expectedHeading = i >= 1 && i <= 3 && (w < 701 && h > 520) ? (i === 3 ? 'Svetlo k planétam' : TITLES[i]) : TITLES[i];
      check(`${tag} step ${i + 1}/8 "${TITLES[i]}": heading "${s.heading}", focus on the heading${JOURNEY[i] ? `, light stage "${JOURNEY[i]}" with only its own objects and controls` : ', no light stage or overlay'}`,
        s.step === i && s.heading === expectedHeading && (i === 0 || s.focus === 'learn-heading') && journeyClean(s, JOURNEY[i]), JSON.stringify({ step: s.step, heading: s.heading, focus: s.focus, stage: s.stage, overlayHidden: s.overlayHidden, shown: s.shown, slider: s.slider, f: s.fifteenChoices, p: s.planetChoices }));
      if (i === 0) {
        check(`${tag} intro: objective and the scientific conventions (constant speed, surface vs centre distances, accelerated playback, illustrative markers)`,
          ['Čo sa naučíš', 'od povrchu Zeme k povrchu Mesiaca', 'priemernú vzdialenosť stredov Zeme a Mesiaca', 'od stredu Slnka k stredu planét', 'prehrávame zrýchlene', 'neletí rýchlejšie', 'Rýchlosť svetla je vo všetkých pokusoch rovnaká', 'len názorné'].every(t => s.body.includes(t)), s.body.slice(0, 600));
        await shot('1-intro');
      }
      if (i === 1) { // the 1 s experiment: a tip, then the 1 s result (stage skip = the reduced-motion path, no animation needed here)
        await pg.evaluate(() => { const sl = document.getElementById('learn-light-tip'); sl.value = '70'; sl.dispatchEvent(new Event('input', { bubbles: true })); });
        await pg.evaluate(() => lightStage.skip()); await advance(pg, 50, 3); s = await snap(pg);
        check(`${tag} 1 s experiment: result "${s.lead}"`, s.stage.phase === 'one-second' && s.lead === 'Ani svetlo nestihlo doraziť!');
        await shot('2-one-second');
      }
      if (i === 2) {
        await clickLabel(pg, 'fieldset.learn-light-choices', 'Asi 12-krát'); await advance(pg, 50);
        await pg.evaluate(() => lightStage.skip()); await advance(pg, 50, 3); s = await snap(pg);
        check(`${tag} 15 s experiment: guess "Asi 12-krát" and result "${s.lead}"`, s.stage.phase === 'done' && /^Za 15 sekúnd svetlo preletelo/.test(s.lead) && s.body.includes('Správny odhad!'), s.body.slice(0, 400));
        await shot('3-fifteen');
      }
      if (i === 3) {
        await clickLabel(pg, 'fieldset[data-question="earth"]', 'Asi 8 minút'); await advance(pg, 50);
        await pg.evaluate(() => lightStage.skip()); await advance(pg, 50, 3);
        await clickLabel(pg, 'fieldset[data-question="neptune"]', 'Asi 4 hodiny'); await advance(pg, 50);
        await pg.evaluate(() => lightStage.skip()); await advance(pg, 50, 3); s = await snap(pg);
        check(`${tag} planets experiment: both guesses and the Neptune result "${s.lead}"`, s.stage.phase === 'neptune' && s.lead === 'K Neptúnu letelo svetlo 4 h 10 min 5 s!' && s.body.includes('Správne! Svetlo letí k Neptúnu asi 4 hodiny.'), s.body.slice(0, 400));
        await shot('4-planets');
      }
      if (i >= 4 && i <= 6) {
        const q = lesson.steps[i], wrong = q.options.find(o => o.id !== q.correct).id;
        const a1 = await answer(pg, wrong); await retry(pg); await pg.waitForTimeout(150); const a2 = await answer(pg, q.correct);
        check(`${tag} question "${q.title}": a wrong answer gets the hint and keeps Next locked; the right one gets "${a2.feedback.slice(0, 40)}…" and unlocks Next`, a1.feedback === q.incorrectFeedback && !a1.next && a2.feedback === q.correctFeedback && a2.next, JSON.stringify([a1, a2]));
        await shot(`${5 + i - 4}-question-${i - 3}`);
      }
      if (i === 6) await roundTrip(); // the summary has no Back button: the backward pass starts at the last question
      if (i === 7) {
        check(`${tag} summary "${s.heading}": the four ideas`, lesson.steps[7].ideas.every(t => s.body.includes(t)), s.body.slice(0, 500));
        await shot('8-summary');
      }
      forward.push(s);
      if (i < 7) await key(pg, 'next');
    }
    async function roundTrip() {
    // Backwards from the last question to the intro: every journey switches back cleanly; the lesson-session guesses are kept.
    const backSteps = [];
    for (let i = 5; i >= 0; i--) {
      const moved = await pg.evaluate(() => { const b = [...document.querySelectorAll('.learn-footer button, .learn-body button')].find(x => /^(Späť|←)/.test(x.textContent.trim()) && !/témy/.test(x.textContent)); if (!b) return false; b.click(); return true; });
      await pg.waitForTimeout(450); await advance(pg, 50, 3);
      const s = await snap(pg); backSteps.push(s);
      if (!moved || s.step !== i || !journeyClean(s, JOURNEY[i])) { check(`${tag} back to step ${i + 1}`, false, JSON.stringify({ moved, step: s.step, stage: s.stage, shown: s.shown })); break; }
      if (i === 3) check(`${tag} back on the planets step: guesses kept for the lesson session (Earth "Asi 8 minút")`, await pg.evaluate(() => [...document.querySelectorAll('fieldset[data-question="earth"] input')].find(x => x.checked)?.closest('label').textContent === 'Asi 8 minút'));
      if (i === 2) check(`${tag} back on the 15 s step: its guess kept ("Asi 12-krát")`, await pg.evaluate(() => [...document.querySelectorAll('fieldset.learn-light-choices:not([data-question]) input')].find(x => x.checked)?.closest('label').textContent === 'Asi 12-krát'));
      if (i === 1) check(`${tag} back on the 1 s step: its tip kept (70)`, await pg.evaluate(() => document.getElementById('learn-light-tip').value === '70'));
    }
    check(`${tag}: backwards from the last question to the intro, every step shows only its own journey (or none)`, backSteps.length === 6 && backSteps.every((s, k) => s.step === 5 - k && journeyClean(s, JOURNEY[5 - k])), JSON.stringify(backSteps.map(s => [s.step, s.stage?.journey ?? null])));
    // Renderer resources: anything created on first use is created once; further passes through the three journeys add nothing.
    const res = () => pg.evaluate(() => { renderer.render(scene, camera); return [renderer.info.memory.geometries, renderer.info.memory.textures, renderer.info.programs.length].join(); });
    const pass = async () => { for (let i = 0; i < 4; i++) await key(pg, 'next'); for (let i = 0; i < 4; i++) await key(pg, 'back'); return res(); };
    const r1 = await pass(), r2 = await pass(), r3 = await pass();
    check(`${tag}: repeated passes through the three journeys leave renderer resources unchanged (${r1} → ${r2} → ${r3})`, r2 === r1 && r3 === r1);
    // Forward again to the last question (answering the questions, whose answers reset on a step change).
    for (let i = 0; i < 6; i++) { const st = await pg.evaluate(() => ({ locked: document.querySelector('.learn-footer .learn-primary')?.disabled, step: Learn.state.step })); if (st.locked) await answer(pg, lesson.steps[st.step].correct); await key(pg, 'next'); }
    const at = await pg.evaluate(() => Learn.state.step); if (at !== 6) check(`${tag}: forward again to the last question`, false, `step ${at}`);
    if (await pg.evaluate(() => document.querySelector('.learn-footer .learn-primary')?.disabled)) await answer(pg, lesson.steps[6].correct);
    }
    await pg.evaluate(() => [...document.querySelectorAll('#learn-root button')].find(b => b.textContent.trim() === 'Zavrieť')?.click()); await pg.waitForTimeout(300); // leave from the summary's lesson
    await startLesson(pg);
    // Leaving Learn mid-experiment and returning: the stage ends; reopening the lesson starts fresh (no kept guesses).
    for (let i = 0; i < 3; i++) await key(pg, 'next'); // the planets step
    await pg.evaluate(() => [...document.querySelectorAll('#learn-root button')].find(b => b.textContent.trim() === 'Zavrieť').click()); await pg.waitForTimeout(400); await advance(pg, 50, 3);
    const left = await snap(pg);
    check(`${tag}: "Zavrieť" during the planets experiment leaves Learn; the light stage and its overlay are gone; Explore is back`, !left.stage && left.overlayHidden && !left.bodyClass && !(await pg.evaluate(() => Learn.active)));
    await startLesson(pg); for (let i = 0; i < 3; i++) await key(pg, 'next');
    const fresh = await pg.evaluate(() => ({ guesses: [...document.querySelectorAll('fieldset[data-question] input')].filter(x => x.checked).length, journey: lightStage.state().journey, phase: lightStage.state().phase }));
    check(`${tag}: reopening the lesson starts fresh (planets step ready, no guesses kept)`, fresh.guesses === 0 && fresh.journey === 'planets' && fresh.phase === 'ready', JSON.stringify(fresh));
    // Quiz from inside an experiment step, then back to Learn.
    await pg.evaluate(() => [...document.querySelectorAll('#side-ui button, #side-ui a, .nav-item')].find(b => /Kvíz/.test(b.textContent))?.click()); await pg.waitForTimeout(500); await advance(pg, 50, 3);
    const quiz = await pg.evaluate(() => ({ quiz: typeof isQuizMode !== 'undefined' && isQuizMode, learn: Learn.active, light: lightStage.active, overlay: document.getElementById('light-stage-overlay').hidden }));
    check(`${tag}: switching to Quiz during the planets experiment ends Learn and the light stage`, quiz.quiz && !quiz.learn && !quiz.light && quiz.overlay, JSON.stringify(quiz));
    await pg.evaluate(() => { if (isQuizMode || isQuizResults) stopQuiz(); }); await pg.waitForTimeout(300);
    // From the summary: "Otestuj sa" opens the Quiz, "Objavuj" returns to Explore.
    await startLesson(pg); for (let i = 0; i < 7; i++) { const st = await pg.evaluate(() => ({ locked: document.querySelector('.learn-footer .learn-primary')?.disabled, step: Learn.state.step })); if (st.locked) await answer(pg, lesson.steps[st.step].correct); await key(pg, 'next'); }
    await pg.evaluate(() => [...document.querySelectorAll('#learn-root button')].find(b => b.textContent.trim() === 'Otestuj sa').click()); await pg.waitForTimeout(500);
    const q2 = await pg.evaluate(() => ({ quiz: isQuizMode, learn: Learn.active, light: lightStage.active }));
    check(`${tag}: summary "Otestuj sa" opens the Quiz with no light stage left`, q2.quiz && !q2.learn && !q2.light, JSON.stringify(q2));
    await pg.evaluate(() => { if (isQuizMode || isQuizResults) stopQuiz(); }); await pg.waitForTimeout(300);
    await startLesson(pg); for (let i = 0; i < 7; i++) { const st = await pg.evaluate(() => ({ locked: document.querySelector('.learn-footer .learn-primary')?.disabled, step: Learn.state.step })); if (st.locked) await answer(pg, lesson.steps[st.step].correct); await key(pg, 'next'); }
    await pg.evaluate(() => [...document.querySelectorAll('#learn-root button')].find(b => b.textContent.trim() === 'Objavuj').click()); await pg.waitForTimeout(400);
    check(`${tag}: summary "Objavuj" returns to Explore (Learn closed, no light stage)`, await pg.evaluate(() => !Learn.active && !lightStage.active && document.getElementById('light-stage-overlay').hidden));
    // Announcements over the whole run: the experiment results are announced, never the same text twice in a row.
    const said = (await pg.evaluate(() => window.__said)).map(t => t.replace(/ /g, ' '));
    check(`${tag} screen reader: the three experiment results announced (1 s, 15 s, Mars and Neptune), no immediate duplicates (${said.length} announcements)`,
      said.some(t => t.startsWith('Ani svetlo nestihlo doraziť!')) && said.some(t => t.startsWith('Za 15 sekúnd svetlo preletelo')) && said.some(t => t.startsWith('K Zemi letelo svetlo 8 min 19 s.')) && said.some(t => t.startsWith('K Neptúnu letelo svetlo 4 h 10 min 5 s!')) && said.every((t, k) => k === 0 || t !== said[k - 1]), JSON.stringify(said));
    check(`${tag}: no JS errors and no rejected lesson`, errors.length === 0 && rejected.length === 0, [...errors, ...rejected].join('; '));
    await context.close();
  }
  // Hidden tab during the 15-second experiment and during the planets journey (1366×768).
  {
    const { pg, errors, context } = await open(browser, 1366, 768); await fake(pg); await advance(pg, 50);
    await startLesson(pg); await key(pg, 'next'); await key(pg, 'next'); // 15 s step
    await pg.evaluate(() => document.querySelector('.learn-light-box .learn-primary').click()); await advance(pg, 3000); await advance(pg, 50); await play(pg, 2000);
    const hide = v => pg.evaluate(v => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => v }); document.dispatchEvent(new Event('visibilitychange')); }, v);
    await hide('hidden'); await advance(pg, 50, 3); const a = await pg.evaluate(() => lightStage.state()); await advance(pg, 20000); const b = await pg.evaluate(() => lightStage.state()); await hide('visible'); await advance(pg, 200, 3);
    const c = await pg.evaluate(() => ({ st: lightStage.state(), primary: document.querySelector('.learn-light-box .learn-primary').textContent }));
    check('hidden tab on the 15 s step: paused (reason hidden), no time passes while hidden, no automatic resume; "Pokračovať" offered', a.paused && a.pauseReason === 'hidden' && b.seconds === a.seconds && c.st.paused && c.primary === 'Pokračovať', JSON.stringify([a.seconds, b.seconds, c]));
    await pg.evaluate(() => document.querySelector('.learn-light-box .learn-primary').click()); await play(pg, 1000);
    check('hidden tab on the 15 s step: explicit resume continues', await pg.evaluate(() => !lightStage.state().paused && lightStage.state().seconds > 2));
    await key(pg, 'next'); await pg.evaluate(() => document.querySelector('.learn-light-box .learn-primary').click()); await advance(pg, 3000); await advance(pg, 50); await play(pg, 2000);
    await hide('hidden'); await advance(pg, 50, 3); const p1 = await pg.evaluate(() => lightStage.state()); await advance(pg, 20000); const p2 = await pg.evaluate(() => lightStage.state()); await hide('visible'); await advance(pg, 200, 3);
    check('hidden tab on the planets step (after switching from the 15 s step): paused, frozen, no automatic resume', p1.journey === 'planets' && p1.paused && p1.pauseReason === 'hidden' && p2.seconds === p1.seconds && (await pg.evaluate(() => lightStage.state().paused)));
    check('hidden tab: no JS errors', errors.length === 0, errors.join('; '));
    await context.close();
  }
  // Reduced motion: each experiment offers its no-animation result (390×844).
  {
    const { pg, errors, context } = await open(browser, 390, 844, { options: { reducedMotion: 'reduce' } }); await fake(pg); await advance(pg, 50);
    await startLesson(pg); const seen = [];
    for (const [i, labels] of [[1, ['Ukáž výsledok bez animácie', 'Ukáž príchod bez animácie']], [2, ['Ukáž výsledok bez animácie']], [3, ['Ukáž cestu k Marsu bez animácie', 'Ukáž cestu k Neptúnu bez animácie']]]) {
      await key(pg, 'next');
      for (const label of labels) { const t = await pg.evaluate(() => { const b = document.querySelector('[data-focus="light-skip"]'); return b && !b.hidden ? b.textContent : null; }); seen.push([i, t]); await pg.evaluate(() => document.querySelector('[data-focus="light-skip"]').click()); await advance(pg, 50, 3); }
    }
    const final = await pg.evaluate(() => lightStage.state().phase);
    check(`reduced motion: every experiment offers its skip in order and reaches its result without animation (${JSON.stringify(seen)})`,
      JSON.stringify(seen) === JSON.stringify([[1, 'Ukáž výsledok bez animácie'], [1, 'Ukáž príchod bez animácie'], [2, 'Ukáž výsledok bez animácie'], [3, 'Ukáž cestu k Marsu bez animácie'], [3, 'Ukáž cestu k Neptúnu bez animácie']]) && final === 'neptune');
    check('reduced motion: no JS errors', errors.length === 0, errors.join('; '));
    await context.close();
  }
  // Journey validation: invalid values leave the lesson out (reported, no breakage); a missing journey means earth-moon.
  for (const [name, change] of [['unknown text "mars-moon"', l => { l.steps[3].experiment.journey = 'mars-moon'; }], ['null', l => { l.steps[2].experiment.journey = null; }], ['a number', l => { l.steps[1].experiment.journey = 42; }]]) {
    const { pg, errors, rejected, context } = await open(browser, 1366, 768, { fixture: inject(change) });
    await pg.evaluate(() => Learn.enter()); await pg.waitForTimeout(300);
    const cards = await topics(pg), card = cards.find(c => c.t === TOPIC);
    await pg.evaluate(() => [...document.querySelectorAll('.learn-topic')].find(c => c.querySelector('h3').textContent === 'Zem a Mesiac').querySelector('button').click()); await pg.waitForTimeout(400);
    const other = await pg.evaluate(() => ({ lesson: Learn.state.lesson, heading: document.getElementById('learn-heading')?.textContent }));
    check(`invalid journey (${name}): the lesson is left out and reported once; its topic shows "Pripravujeme"; the app and the other lessons keep working`,
      rejected.length === 1 && !!card && !card.button && card.text.includes('Pripravujeme') && other.lesson === 'zem-mesiac' && errors.length === 0 && (await pg.evaluate(() => !window.LearnContent.lessons.some(l => l.id === 'pohyb'))), JSON.stringify({ rejected, card, other, errors }));
    await context.close();
  }
  {
    const { pg, errors, rejected, context } = await open(browser, 1366, 768, { fixture: inject(l => { delete l.steps[1].experiment.journey; }) });
    await pg.evaluate(() => Learn.enter()); await pg.waitForTimeout(300);
    const card = (await topics(pg)).find(c => c.t === TOPIC), s = card?.button ? 'available' : null;
    // Phase 6H.6.2: the journey is mandatory; a missing one is rejected like an invalid one (no Earth–Moon default).
    check('missing journey: rejected and reported once ("has no light journey"); the topic shows "Pripravujeme"; no other error', rejected.length === 1 && /has no light journey/.test(rejected[0]) && errors.length === 0 && !card.button && card.text.includes('Pripravujeme') && s === null, JSON.stringify({ rejected, errors, card }));
    await context.close();
  }
  // Phase 6H.6.2 coexistence: with a stand-in for the future real "pohyb" lesson in the content (as after activation), the migrated
  // test-lesson fixtures (own test topic "test-svetlo") and the whole-lesson fixture (replaces "pohyb") both load without a duplicate ID.
  {
    const STAND_IN = `window.LearnContent.lessons.push(${JSON.stringify({ id: 'pohyb', title: 'Stand-in', objective: 'x', limitation: 'x', steps: [{ id: 'a', type: 'intro', title: 'Stand-in', text: 'x' }, { id: 'b', type: 'summary', title: 'Koniec', ideas: ['x'], text: 'x' }] })});`;
    const TEST = `window.LearnContent.topics.push({"id":"test-svetlo","title":"Testovacia lekcia","description":"Len na testovanie.","minutes":1}); window.LearnContent.lessons.push(${JSON.stringify({ id: 'test-svetlo', title: 'Svetlo — technický test', objective: 'x', limitation: 'x', steps: [{ id: 'svetlo', type: 'experiment', title: 'Svetlo', text: 'x', experiment: { kind: 'light-travel', journey: 'earth-moon' } }, { id: 'z', type: 'summary', title: 'Koniec', ideas: ['x'], text: 'x' }] })});`;
    for (const [name, fixture, expect] of [['migrated test fixture', STAND_IN + '\n' + TEST, 'test'], ['whole-lesson fixture', STAND_IN + '\n' + inject(), 'lesson']]) {
      const { pg, errors, rejected, context } = await open(browser, 1366, 768, { fixture });
      const c = await pg.evaluate(() => ({ ids: window.LearnContent.lessons.map(l => l.id), pohyb: window.LearnContent.lessons.filter(l => l.id === 'pohyb').map(l => l.title) }));
      let opened = null;
      if (expect === 'test') { await pg.evaluate(() => { Learn.enter(); [...document.querySelectorAll('.learn-topic')].find(x => x.querySelector('h3').textContent === 'Testovacia lekcia').querySelector('button').click(); }); await pg.waitForTimeout(400); opened = await pg.evaluate(() => ({ lesson: Learn.state.lesson, journey: lightStage.state().journey ?? null })); }
      else { await startLesson(pg); opened = { lesson: await pg.evaluate(() => Learn.state.lesson), heading: (await snap(pg)).heading }; }
      check(`coexistence with a future real "pohyb" lesson — ${name}: one "pohyb" lesson (${JSON.stringify(c.pohyb)}), no duplicate ID, no error; the fixture lesson opens (${JSON.stringify(opened)})`,
        errors.length === 0 && rejected.length === 0 && new Set(c.ids).size === c.ids.length && c.pohyb.length === 1 && (expect === 'test' ? c.pohyb[0] === 'Stand-in' && opened.lesson === 'test-svetlo' : c.pohyb[0] === 'Svetlo a vesmírne vzdialenosti' && opened.lesson === 'pohyb' && opened.heading === TITLES[0]), JSON.stringify({ c, opened, errors, rejected }));
      await context.close();
    }
  }
  // Production content (no fixture): the real "pohyb" topic stays inactive.
  {
    const { pg, errors, context } = await open(browser, 1366, 768, { fixture: null });
    await pg.evaluate(() => Learn.enter()); await pg.waitForTimeout(300);
    const cards = await topics(pg), real = cards.find(c => c.t === 'Pohyb vo vesmíre');
    const content = await pg.evaluate(() => ({ pohyb: window.LearnContent.lessons.some(l => l.id === 'pohyb'), light: window.LearnContent.lessons.flatMap(l => l.steps).filter(s => s.experiment?.kind === 'light-travel').length }));
    check('production content: the real topic "Pohyb vo vesmíre" stays inactive ("Pripravujeme", no button); no lesson uses a light experiment', !!real && !real.button && real.text.includes('Pripravujeme') && !content.pohyb && content.light === 0 && errors.length === 0, JSON.stringify({ real, content, errors }));
    await context.close();
  }
  console.log(`${passes} passed, ${failures} failed`);
  await browser.close(); server.close();
})();
