// Whole-lesson integration harness (Phase 6H.6.1; Phase 6H.6.3: the real, activated sixth lesson "Svetlo a vesmírne vzdialenosti",
// topic id "pohyb", from learn-content.sk.js – no fixture). Covers the full sequence forwards and backwards, journey switching and
// cleanup, the transitions shown before the 15 s and planets experiments, predictions and session state, leaving and returning,
// Explore and Quiz, focus and announcements, hidden tab, reduced motion, at four sizes. The test-only fixture
// fixtures/light-lesson.js (identical to the real lesson) is used only for invalid configurations and fixture coexistence.
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const env = require('./env'), { inject, lesson } = require('./fixtures/light-lesson');
const ROOT = env.ROOT, OUT = env.out('light671'), PORT = Number(process.env.PORT || 8955);
const server = http.createServer((q, r) => { const u = decodeURIComponent(q.url.split('?')[0]); fs.readFile(path.join(ROOT, u === '/' ? 'index.html' : u), (e, d) => { if (e) { r.writeHead(404); r.end(); } else r.end(d); }); }).listen(PORT);
let failures = 0, passes = 0;
const check = (label, ok, detail = '') => { ok ? passes++ : failures++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${!ok && detail ? '  — ' + String(detail).slice(0, process.env.FULL ? 6000 : 1200) : ''}`); };
const TITLES = lesson.steps.map(s => s.title), TOPIC = 'Svetlo a vesmírne vzdialenosti';
const REJECTED = /^Learn: lesson "pohyb" is not available/;
// SHA-256 of the five existing lessons, their topic cards and the planet groups at Phase 6H.6 (commit a953c9c): must stay unchanged.
const EXISTING_HASH = '334fe0cba08aadada25dce743a679a7c300c94affaa15241bdb1066039d77cec';

async function open(browser, w, h, { fixture = null, options = {} } = {}) {
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
// The transition before an experiment (Phase 6H.6.3): its text, whether it is in view inside the panel without scrolling (and without
// opening the explanation), whether the guesses and the main action are in view too, and any stage text under the panel.
const T = () => {
  const root = document.getElementById('learn-root'), body = root.querySelector('.learn-body'), scroller = root.dataset.layout === 'side' ? root : body;
  const p = root.getBoundingClientRect(), sv = scroller.getBoundingClientRect(), view = { t: Math.max(p.top, sv.top), b: Math.min(p.bottom, sv.bottom, innerHeight) };
  const inView = e => { if (!e || e.hidden || e.closest('[hidden]') || !e.getClientRects().length) return false; const b = e.getBoundingClientRect(); return b.top >= view.t - 0.5 && b.bottom <= view.b + 0.5; };
  const tr = root.querySelector('.learn-light-transition'), sets = [...root.querySelectorAll('.learn-light-box fieldset')].filter(f => !f.hidden);
  const under = [...document.querySelectorAll('#light-stage-overlay > div, #light-stage-overlay .light-scale span')].filter(e => !e.hidden && !e.closest('[hidden]') && e.getBoundingClientRect().width > 0)
    .filter(e => { const r = e.getBoundingClientRect(); return r.left < p.right - 1 && p.left < r.right - 1 && r.top < p.bottom - 1 && p.top < r.bottom - 1; }).map(e => e.className);
  return { text: tr && !tr.hidden && !tr.closest('[hidden]') ? tr.textContent : null, inView: inView(tr), choices: sets.length > 0 && sets.every(inView), primary: inView(root.querySelector('.learn-light-box .learn-primary')), details: !root.querySelector('#learn-experiment-details')?.hidden, under };
};
const tr = pg => pg.evaluate(`(${T})()`);
// Phase 6H.6.3.B. The panel header (sticky on short landscape): heading and buttons visible and not covered; the main action in view;
// every focusable panel control, when focused, fully visible and not hidden under the header. And the summary's three actions.
const HEAD = () => {
  const root = document.getElementById('learn-root'), header = root.querySelector('.learn-header'), p = root.getBoundingClientRect(), h = header.getBoundingClientRect();
  const clear = e => { if (!e || !e.getClientRects().length) return false; const b = e.getBoundingClientRect(); if (b.top < p.top - 0.5 || b.bottom > Math.min(p.bottom, innerHeight) + 0.5) return false;
    const hit = document.elementFromPoint(b.left + b.width / 2, b.top + Math.min(b.height / 2, 10)); return !!hit && (e === hit || e.contains(hit)); };
  const action = root.querySelector('.learn-light-box .learn-primary') ?? root.querySelector('.learn-footer .learn-primary');
  return { sticky: getComputedStyle(header).position === 'sticky', heading: clear(document.getElementById('learn-heading')), close: [...header.querySelectorAll('button')].every(clear), action: action ? clear(action) && action.getBoundingClientRect().top >= h.bottom - 0.5 : null };
};
const head = pg => pg.evaluate(`(${HEAD})()`);
async function focusSweep(pg) { // Tab through every control of the panel; each one must be fully visible (not under the sticky header) when focused
  const names = await pg.evaluate(() => [...document.querySelectorAll('#learn-root button, #learn-root input')].filter(e => e.getClientRects().length && !e.disabled && !e.closest('[hidden],[inert]')).length);
  await pg.evaluate(() => document.getElementById('learn-heading').focus()); const bad = [];
  for (let i = 0; i < names + 2; i++) { await pg.keyboard.press('Tab'); const r = await pg.evaluate(() => { const a = document.activeElement, root = document.getElementById('learn-root'); if (!root.contains(a)) return null; const t = a.type === 'radio' ? a.closest('label') : a, b = t.getBoundingClientRect(), p = root.getBoundingClientRect();
    const hit = document.elementFromPoint(b.left + b.width / 2, b.top + Math.min(b.height / 2, 10)); return { name: (t.textContent || '').trim().slice(0, 20), ok: b.top >= p.top - 0.5 && b.bottom <= Math.min(p.bottom, innerHeight) + 0.5 && !!hit && (t === hit || t.contains(hit)) }; });
    if (r && !r.ok) bad.push(r.name); }
  return bad;
}
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
    check(`${tag} topic list: the sixth topic "${TOPIC}" is active with its description, about 9 minutes and a start button; six active lessons; no "undefined"`,
      !!card && card === cards[5] && card.button && card.text.includes('Zisti, ako ďaleko doletí svetlo za sekundu') && card.text.includes('Približne 9 min') && cards.every(c => c.button) && cards.length === 6 && !cards.some(c => /undefined/.test(c.text)), JSON.stringify(cards.map(c => c.t)));
    await pg.evaluate(t => [...document.querySelectorAll('.learn-topic')].find(c => c.querySelector('h3').textContent === t).scrollIntoView({ block: 'center' }), TOPIC); await pg.waitForTimeout(200);
    await shot('0-topics');
    await startLesson(pg);
    // Forward through all eight steps.
    const forward = [];
    for (let i = 0; i < 8; i++) {
      let s = await snap(pg);
      // Phones show the short planets heading; since Phase 6H.6.3.B also the short landscape side panel (one header row).
      const expectedHeading = i === 3 && ((w < 701 && h > 520) || w === 844) ? 'Svetlo k planétam' : TITLES[i];
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
      if (i === 2 || i === 3) { // the transition, before the light starts: in view on every layout, with the guesses and the main action
        const t = await tr(pg);
        check(`${tag} ${i === 2 ? '15 s' : 'planets'} experiment ready: the transition "${t.text}" is in view without opening "Vysvetlenie"; guesses and the main action in view; no stage text under the panel`,
          t.text === lesson.steps[i].transition && t.inView && t.choices && t.primary && t.under.length === 0 && (w > 700 || h <= 520 || !t.details), JSON.stringify(t));
        await shot(i === 2 ? '3a-fifteen-ready' : '4a-planets-ready');
      }
      if (i === 1) check(`${tag} 1 s experiment: no transition (it opens the experiments)`, (await tr(pg)).text === null);
      if (i === 2) { // Phase 6H.6.3.B: on a short free area the 15 s scene keeps Earth, the light and the milestones in its ready state
        const f = await pg.evaluate(() => { const v = lightStage.state().view, p = document.getElementById('learn-root').getBoundingClientRect(), vis = sel => [...document.querySelectorAll(sel)].filter(e => !e.hidden && e.getClientRects().length);
          const clear = e => e.getBoundingClientRect().bottom <= p.top - 1; return { tight: v.tight, earth: vis('#light-stage-overlay .light-label').filter(e => e.textContent === 'Zem').every(clear), miles: vis('#light-stage-overlay .light-mile').length, milesClear: vis('#light-stage-overlay .light-mile').every(clear), front: v.front, earthX: v.earth.x }; });
        if (w === 390 && h === 667) {
          check(`${tag} 15 s ready (transition shown): the short-area layout keeps Earth and the four milestones clear of the panel`, f.tight && f.earth && f.miles === 4 && f.milesClear, JSON.stringify(f));
          await pg.evaluate(() => document.querySelector('.learn-light-box .learn-primary').click()); await advance(pg, 3000); await advance(pg, 50, 3); await play(pg, 1200);
          const run = await pg.evaluate(() => { const st = lightStage.state(), p = document.getElementById('learn-root').getBoundingClientRect(), t = document.querySelector('#light-stage-overlay .light-time'), sc = document.querySelector('#light-stage-overlay .light-scale span');
            return { phase: st.phase, tight: st.view.tight, time: !t.hidden && t.getBoundingClientRect().bottom <= p.top - 1 ? t.textContent : null, scale: !sc.closest('[hidden]') && sc.getBoundingClientRect().bottom <= p.top - 1 }; });
          check(`${tag} 15 s run: the panel is shorter again and the approved layout returns (readout "${run.time}", scale bar) — the scene changes only at the start`, run.phase === 'first' && !run.tight && !!run.time && run.scale, JSON.stringify(run));
          await pg.evaluate(() => lightStage.reset()); await advance(pg, 50, 3);
        } else check(`${tag} 15 s ready: enough room, the normal 15 s layout (no short-area layout)`, !f.tight, JSON.stringify(f));
      }
      if (i === 2) {
        await clickLabel(pg, 'fieldset.learn-light-choices', 'Asi 12-krát'); await advance(pg, 50);
        await pg.evaluate(() => lightStage.skip()); await advance(pg, 50, 3); s = await snap(pg);
        check(`${tag} 15 s experiment: guess "Asi 12-krát" and result "${s.lead}"; the transition is not repeated`, s.stage.phase === 'done' && /^Za 15 sekúnd svetlo preletelo/.test(s.lead) && s.body.includes('Správny odhad!') && (await tr(pg)).text === null, s.body.slice(0, 400));
        await shot('3-fifteen');
      }
      if (i === 3) {
        await clickLabel(pg, 'fieldset[data-question="earth"]', 'Asi 8 minút'); await advance(pg, 50);
        await pg.evaluate(() => lightStage.skip()); await advance(pg, 50, 3);
        const m = await tr(pg);
        check(`${tag} planets Mars stop: the transition is not repeated; the Neptune question and "Pokračovať k Neptúnu" in view; no stage text under the panel`, m.text === null && m.choices && m.primary && m.under.length === 0, JSON.stringify(m));
        await shot('4b-mars');
        if (w === 844) { const hd = await head(pg);
          // Phase 6H.6.3.C: as the Mars stop opens (no manual swipe), the Earth result, the Neptune question, its three answers (44 px
          // touch targets) and "Pokračovať k Neptúnu" are all in view below the fixed header; the feedback sentence follows by scrolling.
          const mv = await pg.evaluate(() => { const root = document.getElementById('learn-root'), hb = root.querySelector('.learn-header').getBoundingClientRect().bottom, p = root.getBoundingClientRect();
            const seen = e => { if (!e || e.hidden || !e.getClientRects().length) return false; const b = e.getBoundingClientRect(); if (b.top < hb - 0.5 || b.bottom > Math.min(p.bottom, innerHeight) + 0.5) return false; const hit = document.elementFromPoint(b.left + 8, b.top + b.height / 2); return !!hit && (e === hit || e.contains(hit)); };
            const labels = [...root.querySelectorAll('fieldset[data-question="neptune"] label')];
            return { result: seen(root.querySelector('.learn-light-lead:not(.learn-light-ask)')), resultText: root.querySelector('.learn-light-lead:not(.learn-light-ask)').textContent.replace(/\u00a0/g, ' '), ask: seen(root.querySelector('.learn-light-ask')), answers: labels.length === 3 && labels.every(seen), targets: labels.map(l => Math.round(l.getBoundingClientRect().height)), action: seen(root.querySelector('.learn-light-box .learn-primary')), feedback: !!root.querySelector('.learn-light-feedback:not([hidden])') }; });
          await pg.evaluate(() => document.querySelector('.learn-light-feedback').scrollIntoView({ block: 'nearest' })); await pg.waitForTimeout(100); // the panel's scroll padding keeps it clear of the header
          const fb = await pg.evaluate(() => { const r = document.getElementById('learn-root'), f = r.querySelector('.learn-light-feedback'), b = f.getBoundingClientRect(), hb = r.querySelector('.learn-header').getBoundingClientRect().bottom; return b.top >= hb - 0.5 && b.bottom <= r.getBoundingClientRect().bottom + 0.5; });
          check(`${tag} Mars stop: without a swipe the result "${mv.resultText}", the Neptune question, its three answers (${mv.targets.join('/')} px) and "Pokračovať k Neptúnu" are in view below the fixed header; the feedback is reachable by scrolling`,
            hd.sticky && hd.heading && hd.close && mv.result && mv.resultText === 'K Zemi letelo svetlo 8 min 19 s.' && mv.ask && mv.answers && mv.targets.every(t => t >= 44) && mv.action && mv.feedback && fb, JSON.stringify({ hd, mv, fb }));
          const bad = await focusSweep(pg);
          check(`${tag} Mars stop: Tab shows every control fully, none under the header`, bad.length === 0, JSON.stringify(bad)); }
        await clickLabel(pg, 'fieldset[data-question="neptune"]', 'Asi 4 hodiny'); await advance(pg, 50);
        await pg.evaluate(() => lightStage.skip()); await advance(pg, 50, 3); s = await snap(pg);
        check(`${tag} planets experiment: both guesses and the Neptune result "${s.lead}"`, s.stage.phase === 'neptune' && s.lead === 'K Neptúnu letelo svetlo 4 h 10 min 5 s!' && s.body.includes('Správne! Svetlo letí k Neptúnu asi 4 hodiny.'), s.body.slice(0, 400));
        await shot('4c-neptune');
        if (w < 701 && h > 520) { // phones: the explanation as a reading view, then closed again
          await pg.evaluate(() => document.querySelector('.learn-expand').click()); await advance(pg, 50, 3);
          const rv = await pg.evaluate(() => { const d = document.getElementById('learn-experiment-details'), root = document.getElementById('learn-root').getBoundingClientRect(); return { open: !d.hidden, text: d.innerText.replace(/\u00a0/g, ' '), inView: root.top >= 0 && root.bottom <= innerHeight }; });
          check(`${tag} explanation opened at the Neptune result: the eight light times and the playback note readable; the panel stays on screen`, rv.open && rv.inView && /Neptún 4 h 10 min 5 s/.test(rv.text) && /600-krát/.test(rv.text), JSON.stringify(rv).slice(0, 300));
          await shot('4d-explanation');
          await pg.evaluate(() => document.querySelector('.learn-expand').click()); await advance(pg, 50, 3);
        }
      }
      if (i >= 4 && i <= 6) {
        const q = lesson.steps[i], wrong = q.options.find(o => o.id !== q.correct).id;
        const a1 = await answer(pg, wrong); await retry(pg); await pg.waitForTimeout(150); const a2 = await answer(pg, q.correct);
        check(`${tag} question "${q.title}": a wrong answer gets the hint and keeps Next locked; the right one gets "${a2.feedback.slice(0, 40)}…" and unlocks Next`, a1.feedback === q.incorrectFeedback && !a1.next && a2.feedback === q.correctFeedback && a2.next, JSON.stringify([a1, a2]));
        await shot(`${5 + i - 4}-question-${i - 3}`);
        if (w === 844) { const hd = await head(pg), bad = await focusSweep(pg);
          check(`${tag} question "${q.title}" after the answer: the heading and Zavrieť stay visible above the scrolled feedback; Tab shows every control fully`, hd.sticky && hd.heading && hd.close && bad.length === 0, JSON.stringify({ hd, bad })); }
      }
      if (i === 6) await roundTrip(); // the summary has no Back button: the backward pass starts at the last question
      if (i === 7) {
        check(`${tag} summary "${s.heading}": the four ideas`, lesson.steps[7].ideas.every(t => s.body.includes(t)), s.body.slice(0, 500));
        const sum = await pg.evaluate(() => { const root = document.getElementById('learn-root'), body = root.querySelector('.learn-body'), scroller = root.dataset.layout === 'side' ? root : body, v = scroller.getBoundingClientRect(), p = root.getBoundingClientRect();
          const header = root.querySelector('.learn-header'), top = getComputedStyle(header).position === 'sticky' ? header.getBoundingClientRect().bottom : v.top;
          return { buttons: [...body.querySelectorAll(':scope > button')].map(b => { const r = b.getBoundingClientRect(); return { t: b.textContent, inView: r.top >= Math.max(top, p.top) - 0.5 && r.bottom <= Math.min(v.bottom, p.bottom, innerHeight) + 0.5 }; }), scrolls: body.scrollHeight > body.clientHeight + 1 }; });
        if (w > 900) check(`${tag} summary: "Späť na témy", "Objavuj" and "Otestuj sa" fully visible and clickable without scrolling`, sum.buttons.length === 3 && sum.buttons.every(b => b.inView) && !sum.scrolls, JSON.stringify(sum));
        if (w === 844) { const hd = await head(pg), bad = await focusSweep(pg);
          check(`${tag} summary: the heading stays visible while the panel scrolls; Tab reaches all three actions and shows each fully`, hd.sticky && hd.heading && bad.length === 0, JSON.stringify({ hd, bad })); }
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
  // Coexistence (Phase 6H.6.2; Phase 6H.6.3 against the real activated lesson instead of a stand-in): the migrated test-lesson fixtures
  // (own test topic "test-svetlo") load beside the real "pohyb" lesson, and the whole-lesson fixture replaces it; never a duplicate ID.
  {
    const TEST = `window.LearnContent.topics.push({"id":"test-svetlo","title":"Testovacia lekcia","description":"Len na testovanie.","minutes":1}); window.LearnContent.lessons.push(${JSON.stringify({ id: 'test-svetlo', title: 'Svetlo — technický test', objective: 'x', limitation: 'x', steps: [{ id: 'svetlo', type: 'experiment', title: 'Svetlo', text: 'x', experiment: { kind: 'light-travel', journey: 'earth-moon' } }, { id: 'z', type: 'summary', title: 'Koniec', ideas: ['x'], text: 'x' }] })});`;
    for (const [name, fixture, expect] of [['migrated test fixture', TEST, 'test'], ['whole-lesson fixture', inject(l => { l.objective += ' (fixture)'; }), 'lesson']]) {
      const { pg, errors, rejected, context } = await open(browser, 1366, 768, { fixture });
      const c = await pg.evaluate(() => ({ ids: window.LearnContent.lessons.map(l => l.id), pohyb: window.LearnContent.lessons.filter(l => l.id === 'pohyb').map(l => l.title), fixture: window.LearnContent.lessons.find(l => l.id === 'pohyb')?.objective.endsWith('(fixture)') }));
      let opened = null;
      if (expect === 'test') { await pg.evaluate(() => { Learn.enter(); [...document.querySelectorAll('.learn-topic')].find(x => x.querySelector('h3').textContent === 'Testovacia lekcia').querySelector('button').click(); }); await pg.waitForTimeout(400); opened = await pg.evaluate(() => ({ lesson: Learn.state.lesson, journey: lightStage.state().journey ?? null })); }
      else { await startLesson(pg); opened = { lesson: await pg.evaluate(() => Learn.state.lesson), heading: (await snap(pg)).heading }; }
      check(`coexistence with the real "pohyb" lesson — ${name}: one "pohyb" lesson (${expect === 'test' ? 'the real one' : 'replaced by the fixture'}), no duplicate ID, no error; the fixture lesson opens (${JSON.stringify(opened)})`,
        errors.length === 0 && rejected.length === 0 && new Set(c.ids).size === c.ids.length && c.pohyb.length === 1 && c.pohyb[0] === TOPIC && (expect === 'test' ? !c.fixture && opened.lesson === 'test-svetlo' : c.fixture && opened.lesson === 'pohyb' && opened.heading === TITLES[0]), JSON.stringify({ c, opened, errors, rejected }));
      await context.close();
    }
  }
  // Production content (no fixture), Phase 6H.6.3 activation candidate: the sixth topic is active and its lesson is exactly the
  // approved eight-step lesson; the five existing lessons are unchanged; the old title is gone. (Until 6H.6.2 this checked "inactive".)
  {
    const { pg, errors, rejected, context } = await open(browser, 1366, 768, { fixture: null });
    await pg.evaluate(() => Learn.enter()); await pg.waitForTimeout(300);
    const cards = await topics(pg), real = cards.find(c => c.t === TOPIC);
    const content = await pg.evaluate(() => { const c = window.LearnContent, l = c.lessons.find(x => x.id === 'pohyb');
      return { lesson: l && { id: l.id, title: l.title, objective: l.objective, limitation: l.limitation, sources: l.sources, steps: l.steps }, topic: c.topics.find(t => t.id === 'pohyb'), old: c.topics.some(t => t.title === 'Pohyb vo vesmíre'),
        light: c.lessons.flatMap(x => x.steps.filter(s => s.experiment?.kind === 'light-travel').map(s => `${x.id}:${s.experiment.journey}`)), existing: JSON.stringify({ topics: c.topics.slice(0, 5), lessons: c.lessons.slice(0, 5), planetGroups: c.planetGroups }) }; });
    const approved = { id: lesson.id, title: lesson.title, objective: lesson.objective, limitation: lesson.limitation, sources: lesson.sources, steps: lesson.steps };
    const existingHash = require('crypto').createHash('sha256').update(content.existing).digest('hex');
    check('activation: the real sixth topic "Svetlo a vesmírne vzdialenosti" (id "pohyb") is active with description, 9 minutes and a start button; the old title "Pohyb vo vesmíre" is gone',
      !!real && real.button && real.text.includes('Približne 9 min') && !/undefined|Pripravujeme/.test(real.text) && content.topic.minutes === 9 && content.topic.description === 'Zisti, ako ďaleko doletí svetlo za sekundu a ako dlho mu trvá cesta zo Slnka k planétam.' && !content.old, JSON.stringify({ real, topic: content.topic }));
    check('activation: the real lesson is exactly the approved eight-step lesson (identical to fixtures/light-lesson.js); its three light steps name earth-moon, fifteen and planets',
      JSON.stringify(content.lesson) === JSON.stringify(approved) && JSON.stringify(content.light) === JSON.stringify(['pohyb:earth-moon', 'pohyb:fifteen', 'pohyb:planets']), JSON.stringify(content.light));
    check(`activation: the five existing lessons, their topic cards and the planet groups are unchanged (SHA-256 ${existingHash.slice(0, 12)}…)`, existingHash === EXISTING_HASH);
    check('activation: no JS error and no rejected lesson in production content', errors.length === 0 && rejected.length === 0, [...errors, ...rejected].join('; '));
    await context.close();
  }
  console.log(`${passes} passed, ${failures} failed`);
  await browser.close(); server.close();
})();
