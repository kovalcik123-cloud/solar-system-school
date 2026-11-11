// Phase 6H.3.2 interactive Earth–Moon light experiment harness (outside the repository). The 'light-travel' fixture lesson is
// injected only into this test browser; "pohyb" stays inactive in the app.
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path'), vm = require('vm');
const S = __dirname, ROOT = require('./env').ROOT, OUT = require('./env').out('light632'), PORT = Number(process.env.PORT || 8909);
fs.mkdirSync(OUT, { recursive: true });
const server = http.createServer((q, r) => { const u = decodeURIComponent(q.url.split('?')[0]); fs.readFile(path.join(ROOT, u === '/' ? 'index.html' : u), (e, d) => { if (e) { r.writeHead(404); r.end(); } else r.end(d); }); }).listen(PORT);
const FIXTURE = eval(fs.readFileSync(path.join(S, 'fixtures', 'light62-fixture.js'), 'utf8').match(/const FIXTURE = (`[\s\S]*?`);/)[1]).replace(/"Svetlo — test"/g, '"Svetlo za jednu sekundu"');
const W = {}; vm.runInContext(fs.readFileSync(path.join(ROOT, 'light-data.js'), 'utf8'), vm.createContext({ window: W, Intl })); const L = W.LightData;
const C = L.C_KM_PER_S, T = L.earthMoonTravelSeconds(), SURF = L.earthMoon.surfaceKm;
let failures = 0, passes = 0; const notes = [];
const check = (label, ok, detail = '') => { ok ? passes++ : failures++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${!ok && detail ? '  — ' + String(detail).slice(0, 900) : ''}`); };
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const plain = t => (t || '').replace(/[  ]/g, ' ');
async function open(browser, w, h, options = {}) {
  const context = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: options.touch ?? w < 500, reducedMotion: options.reduced ? 'reduce' : 'no-preference' });
  const pg = await context.newPage(), errors = [];
  pg.on('pageerror', e => errors.push(e.message)); pg.on('console', m => { if (m.type() === 'error' || /THREE\.WebGL|shader/i.test(m.text())) errors.push('console: ' + m.text()); });
  await pg.route('**/three.min.js', r => r.fulfill({ path: require('./env').vendor('three.min.js') }));
  await pg.route('**/OrbitControls.js', r => r.fulfill({ path: require('./env').vendor('OrbitControls.js') }));
  await pg.route('**/learn-content.sk.js', async r => { const res = await r.fetch(); r.fulfill({ response: res, body: (await res.text()) + '\n' + FIXTURE }); });
  await pg.goto(`http://localhost:${PORT}/`); await pg.waitForTimeout(600);
  await pg.fill('#activation-code', 'NGV-2025'); await pg.evaluate(() => checkCode()); await pg.waitForTimeout(2600);
  await pg.evaluate(() => { if (areOrbitsActive) toggleOrbit(); });
  // Announcements: every text the Learn live region receives.
  await pg.evaluate(() => { window.__live = []; const live = document.querySelector('#learn-root [aria-live], .learn-live, [role="status"]');
    new MutationObserver(() => { const t = document.querySelector('.learn-live')?.textContent; if (t) window.__live.push(t); }).observe(document.body, { subtree: true, childList: true, characterData: true }); });
  if (!options.noStep) await toStep(pg);
  return { pg, errors, context };
}
const toStep = async pg => {
  await pg.evaluate(() => { Learn.enter(); [...document.querySelectorAll('.learn-topic')].find(c => c.querySelector('h3').textContent === 'Testovacia lekcia').querySelector('button').click(); });
  await pg.waitForTimeout(400); await pg.evaluate(() => document.querySelector('.learn-footer .learn-primary').click()); await pg.waitForTimeout(500);
};
const frames = (pg, n = 3) => pg.evaluate(n => new Promise(res => { let k = 0; const f = () => (++k >= n ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
const fake = pg => pg.evaluate(() => { window.__realNow = performance.now.bind(performance); window.__t = window.__realNow(); performance.now = () => window.__t; });
const advance = async (pg, ms, n = 2) => { await pg.evaluate(ms => { window.__t += ms; }, ms); await frames(pg, n); };
const st = pg => pg.evaluate(() => lightStage.state());
const PANEL = () => { const q = s => document.querySelector(s), root = q('#learn-root');
  const b = s => { const e = q(s); if (!e) return null; const r = e.getBoundingClientRect(); return { text: e.textContent.replace(/[  ]/g, ' '), hidden: e.hidden, disabled: e.disabled, ariaDisabled: e.getAttribute('aria-disabled'), h: r.height, w: r.width }; };
  const details = [...(q('#learn-experiment-details')?.querySelectorAll('p') ?? [])].map(p => p.textContent.replace(/[\u00a0\u202f]/g, ' '));
  const lead = q('.learn-light-lead'), texts = [...(lead && !lead.hidden ? [lead.textContent] : []), ...[...q('#learn-light-message').querySelectorAll('p')].map(p => p.textContent)];
  return { details, message: texts.map(t => t.replace(/[\u00a0\u202f]/g, ' ')), primary: b('[data-focus="light-primary"]'), secondary: b('[data-focus="light-secondary"]'), skip: b('[data-focus="light-skip"]'),
    slider: { value: q('#learn-light-tip').value, disabled: q('#learn-light-tip').disabled, h: q('#learn-light-tip').getBoundingClientRect().height, valuetext: q('#learn-light-tip').getAttribute('aria-valuetext')?.replace(/[  ]/g, ' '), name: q('#learn-light-tip').labels?.[0]?.textContent },
    output: q('#learn-light-tip-text').textContent.replace(/[  ]/g, ' '), layout: root.dataset.layout ?? null, focus: document.activeElement?.dataset?.focus ?? document.activeElement?.id ?? document.activeElement?.tagName,
    hOverflow: document.documentElement.scrollWidth > innerWidth, scrollY: scrollY }; };
const panel = pg => pg.evaluate(`(${PANEL})()`);
// Layout audit: overlay items vs panel/nav/window; panel controls reachable by scrolling the panel; footer reachable.
const AUDIT = () => {
  const root = document.getElementById('learn-root'), pr = root.getBoundingClientRect(), nav = document.getElementById('planet-nav').getBoundingClientRect();
  const hit = (a, b) => a.left < b.right - 0.5 && a.right > b.left + 0.5 && a.top < b.bottom - 0.5 && a.bottom > b.top + 0.5;
  const overlay = [...document.querySelectorAll('#light-stage-overlay > div')].filter(e => !e.hidden && e.getBoundingClientRect().width > 0).map(e => { const r = e.getBoundingClientRect(); return { cls: e.className, clipped: r.left < 0 || r.right > innerWidth || r.top < 0 || r.bottom > innerHeight, panel: hit(r, pr), nav: hit(r, nav) }; });
  const overlayRects = [...document.querySelectorAll('#light-stage-overlay > div')].filter(e => !e.hidden && e.getBoundingClientRect().width > 0).map(e => ({ cls: e.className, r: e.getBoundingClientRect() }));
  const overlapping = []; overlayRects.forEach((a, i) => overlayRects.slice(i + 1).forEach(b => { if (hit(a.r, b.r)) overlapping.push(`${a.cls}/${b.cls}`); }));
  const s = lightStage.state(); const route = { left: s.view.earth.x, right: s.view.moon.x, y: s.view.y };
  const routeCovered = [route.left, (route.left + route.right) / 2, route.right].some(x => { const e = document.elementFromPoint(x, route.y); return e !== renderer.domElement; });
  // Reachability: scroll each control into view inside the panel, then it must be the element at its centre.
  const reach = [...root.querySelectorAll('#learn-light-tip, [data-focus="light-primary"], .learn-footer button')].filter(e => e.offsetParent !== null).map(e => { e.scrollIntoView({ block: 'nearest' }); const r = e.getBoundingClientRect(); const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return { id: e.id || e.dataset.focus || e.textContent, ok: !!top && (top === e || e.contains(top)) }; });
  root.scrollTop = 0;
  return { overlay, overlapping, routeCovered, reach, primaryVisibleWithoutScroll: (() => { const r = root.querySelector('[data-focus="light-primary"]').getBoundingClientRect(); return r.bottom <= Math.min(innerHeight, pr.bottom) + 0.5; })() };
};
const setTip = (pg, v) => pg.evaluate(v => { const s = document.getElementById('learn-light-tip'); s.value = String(v); s.dispatchEvent(new Event('input', { bubbles: true })); }, v);
const click = (pg, focus) => pg.click(`[data-focus="${focus}"]`, { force: true });

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  // 1. The five states at every viewport (deterministic page clock).
  for (const [w, h] of [[1920, 1080], [1366, 768], [390, 844], [390, 667], [844, 390]]) {
    const tag = `${w}×${h}`, { pg, errors, context } = await open(browser, w, h), tight = w < 500 || w === 844;
    await fake(pg); await advance(pg, 50);
    let p = await panel(pg), s = await st(pg);
    check(`${tag} READY: question, slider (accessible name, "Ešte si netipol"), "Vyšli svetlo"; no prediction yet (no tip marker); 0 s / 0 km${w === 844 ? '; side layout' : ''}`,
      s.phase === 'ready' && s.prediction === null && s.view.tip === null && p.message[0] === 'Kam sa podľa teba dostane svetlo za jednu sekundu?' && p.primary.text === 'Vyšli svetlo' && p.secondary.hidden && !p.slider.disabled && p.output === 'Ešte si netipol' && /Môj tip/.test(p.slider.name) && (w !== 844 || p.layout === 'side'), JSON.stringify({ p, s: { phase: s.phase, prediction: s.prediction } }));
    await setTip(pg, 60); await advance(pg, 16);
    p = await panel(pg); s = await st(pg);
    const tipKm = 0.6 * SURF;
    check(`${tag} prediction 60 %: marker at the same physical-to-screen mapping as the light (${s.view.tip.toFixed(2)} px), "${p.output}"`,
      near(s.prediction.km, tipKm, 1e-6) && near(s.view.tip, s.view.source + tipKm / 1000 / s.view.perPx, 1e-6) && p.output === 'Môj tip: ≈ 226 000 km' && p.slider.valuetext === 'Môj tip: približne 226 000 km od Zeme, 60 % cesty k Mesiacu', JSON.stringify({ tip: s.prediction, view: s.view.tip, p: p.output }));
    await pg.screenshot({ path: path.join(OUT, `1-ready-${w}x${h}.png`) });
    const a0 = await pg.evaluate(`(${AUDIT})()`);
    // Countdown: not active time; rapid clicks neither cancel nor restart.
    await click(pg, 'light-primary'); await click(pg, 'light-primary'); await click(pg, 'light-primary'); await advance(pg, 1200);
    p = await panel(pg); s = await st(pg); const sCountdownY = s.view.y;
    await pg.screenshot({ path: path.join(OUT, `2-countdown-${w}x${h}.png`) });
    check(`${tag} COUNTDOWN 3→2→1: digit ${s.countdown} after 1.2 s, light not moving (0 km), slider fixed, primary aria-disabled "${p.primary.text}", "Zrušiť" offered; repeated clicks ignored`,
      s.phase === 'countdown' && s.countdown === 2 && s.travelledKm === 0 && p.slider.disabled && p.primary.ariaDisabled === 'true' && p.primary.text === 'Pozor… 2' && !p.secondary.hidden && p.secondary.text === 'Zrušiť', JSON.stringify({ s: { phase: s.phase, countdown: s.countdown }, p }));
    await advance(pg, 1800); // countdown over: the run starts now, at 0 s
    const s0 = await st(pg);
    await advance(pg, 500); p = await panel(pg); s = await st(pg);
    check(`${tag} RUNNING: starts after the countdown at 0 s (countdown not counted); at 0.5 s: 149 896,229 km; "Svetlo letí k Mesiacu…", "Pozastaviť"`,
      s0.phase === 'first' && s0.seconds === 0 && near(s.seconds, 0.5, 1e-9) && near(s.travelledKm, C / 2, 1e-6) && p.message[0] === 'Svetlo letí k Mesiacu…' && p.primary.text === 'Pozastaviť', JSON.stringify({ s0: s0.seconds, s: s.seconds }));
    await click(pg, 'light-primary'); await advance(pg, 2000); p = await panel(pg); s = await st(pg);
    await pg.screenshot({ path: path.join(OUT, `3-paused-${w}x${h}.png`) }); const sPausedY = s.view.y;
    check(`${tag} PAUSED at 0.5 s: 2 s paused adds nothing; "Experiment je pozastavený.", "Pokračovať" and "Začať odznova"; prediction marker still shown`,
      s.paused && near(s.seconds, 0.5, 1e-9) && near(s.travelledKm, C / 2, 1e-6) && p.message[0] === 'Experiment je pozastavený.' && p.primary.text === 'Pokračovať' && !p.secondary.hidden && p.secondary.text === 'Začať odznova' && s.view.tip !== null, JSON.stringify({ s: { paused: s.paused, seconds: s.seconds }, p }));
    const frontPaused = s.view.front;
    await click(pg, 'light-primary'); await advance(pg, 0, 1); const sr = await st(pg);
    await advance(pg, 500); await advance(pg, 100, 3); p = await panel(pg); s = await st(pg);
    await pg.screenshot({ path: path.join(OUT, `4-one-second-${w}x${h}.png`) }); const sOneY = s.view.y;
    const a1 = await pg.evaluate(`(${AUDIT})()`);
    check(`${tag} resume continues from the same position (no jump: ${frontPaused.toFixed(2)} → ${sr.view.front.toFixed(2)} px)`, near(sr.view.front, frontPaused, 1e-6) && sr.run === 'running');
    check(`${tag} ONE-SECOND: exactly 1 s / 299 792,458 km; 76 499,142 km left; tip and light both on the route; panel: "Ani svetlo nestihlo doraziť!", "takmer 300 000 km", "približne 76 500 km", tip feedback "${p.message[3] ?? ''}"; exact values and the tip in km in "Vysvetlenie"`,
      s.phase === 'one-second' && s.seconds === 1 && s.travelledKm === C && near(s.remainingKm, 76499.142, 1e-6) && s.view.tip < s.view.front && s.view.front < s.view.moonSurface
      && p.message.join('|') === 'Ani svetlo nestihlo doraziť!|Prešlo takmer 300 000 km.|K Mesiacu zostáva približne 76 500 km.|Svetlo doletelo ďalej, než si odhadol.'
      && p.details.some(t => t.startsWith('Svetlo prejde za 1 sekundu presne 299 792,458 km. Od povrchu Zeme k povrchu Mesiaca je to v priemere 376 291,6 km')) && p.details.some(t => t.startsWith('Tvoj tip: približne 226 000 km od Zeme.'))
      && p.primary.text === 'Pokračovať k Mesiacu' && !p.secondary.hidden, JSON.stringify({ s: { phase: s.phase, seconds: s.seconds }, p }));
    const frontAt1 = s.view.front;
    await click(pg, 'light-primary'); await advance(pg, 0, 1); const s2 = await st(pg);
    await advance(pg, 300); p = await panel(pg); s = await st(pg);
    await pg.screenshot({ path: path.join(OUT, `5-arrived-${w}x${h}.png`) }); const sArrY = s.view.y;
    check(`${tag} RUNNING_TO_MOON starts exactly at the 1 s point (no jump, no countdown); ARRIVED at T = ${T.toFixed(4)} s, 376 291,6 km; "Svetlo dorazilo na Mesiac približne za 1,26 sekundy."; "Opakovať pokus"`,
      s2.phase === 'second' && s2.seconds === 1 && s2.travelledKm === C && near(s2.view.front, frontAt1, 1e-6) && s.phase === 'arrived' && s.seconds === T && s.travelledKm === SURF && near(s.view.front, s.view.moonSurface, 1e-9)
      && p.message[0] === 'Svetlo dorazilo na Mesiac približne za 1,26 sekundy.' && p.primary.text === 'Opakovať pokus' && p.secondary.hidden, JSON.stringify({ s2: { phase: s2.phase, seconds: s2.seconds }, p }));
    await click(pg, 'light-primary'); await advance(pg, 16); p = await panel(pg); s = await st(pg);
    check(`${tag} REPEAT: back to ready, the previous prediction is kept (60 %, marker shown) and can be changed`, s.phase === 'ready' && s.travelledKm === 0 && near(s.prediction.fraction, 0.6, 1e-12) && p.slider.value === '60' && !p.slider.disabled && p.primary.text === 'Vyšli svetlo', JSON.stringify({ s: s.phase, p }));
    check(`${tag} the route does not move between states (panel height held): ready, countdown, paused, 1 s, arrival at y = ${s.view.y.toFixed(1)} px`, [sCountdownY, sPausedY, sOneY, sArrY].every(v => v === s.view.y), JSON.stringify({ y: s.view.y, sCountdownY, sPausedY, sOneY, sArrY }));
    // Layout audit (ready and one-second).
    const bad = [a0, a1].flatMap(a => [...a.overlay.filter(o => o.clipped || o.panel || o.nav).map(o => `overlay ${o.cls}`), ...a.overlapping.map(x => `overlap ${x}`), ...(a.routeCovered ? ['route covered'] : []), ...a.reach.filter(r => !r.ok).map(r => `unreachable ${r.id}`)]);
    check(`${tag} layout: overlay not clipped, not over the panel or planet bar, no overlapping readouts; route visible; slider, main button and footer reachable (panel scroll where needed)`, bad.length === 0, JSON.stringify(bad));
    if (!a0.primaryVisibleWithoutScroll) notes.push(`${tag}: "Vyšli svetlo" needs a short panel scroll in the ready state (reachable).`);
    check(`${tag} touch targets: slider ${p.slider.h.toFixed(0)} px, main button ${p.primary.h.toFixed(0)} px high (≥ 44); no horizontal page overflow; page not scrolled`, p.slider.h >= 44 && p.primary.h >= 44 && !p.hOverflow && p.scrollY === 0, JSON.stringify(p));
    check(`${tag} no JS or WebGL errors`, errors.length === 0, errors.join('; '));
    await context.close();
  }
  // 2. Timing edges, announcements, hidden page, countdown cancellation, keyboard (1366×768, page clock unless noted).
  {
    const { pg, errors, context } = await open(browser, 1366, 768);
    await fake(pg); await advance(pg, 50);
    // No prediction: the experiment runs; the result invites a guess next time. Announcements: countdown, start, result only.
    await pg.evaluate(() => { window.__live = []; });
    await click(pg, 'light-primary'); await advance(pg, 3000); await advance(pg, 999.9);
    const before = await st(pg);
    await click(pg, 'light-primary'); // pause at 0.9999 s
    await advance(pg, 400); await click(pg, 'light-primary'); await advance(pg, 0.05); await advance(pg, 0.1); await advance(pg, 500);
    let s = await st(pg), p = await panel(pg); const live1 = await pg.evaluate(() => window.__live.map(t => t.replace(/[  ]/g, ' ')));
    check('pausing at 0.9999 s does not skip the stop; exactly one 1 s result (one result announcement); no prediction → "Nabudúce si najprv tipni posúvačom."',
      before.phase === 'first' && s.phase === 'one-second' && s.seconds === 1 && s.travelledKm === C && live1.filter(t => t.startsWith('Ani svetlo nestihlo doraziť!')).length === 1 && p.message[3] === 'Nabudúce si najprv tipni posúvačom.', JSON.stringify({ before: before.seconds, s: s.phase, live1, msg: p.message }));
    const runningAnnouncements = live1.filter(t => /km|s\b/.test(t) && !/^Ani svetlo|Pozor|Svetlo vyrazilo|Experiment je pozastavený|Pokračujeme/.test(t));
    check('announcements: countdown, "Svetlo vyrazilo.", pause/resume and the result only – nothing while the light moves', live1[0]?.startsWith('Pozor') && live1.includes('Svetlo vyrazilo.') && runningAnnouncements.length === 0, JSON.stringify(live1));
    await click(pg, 'light-primary'); await advance(pg, 6000, 1); s = await st(pg);
    check('a 6 s frame drop during the second segment still ends exactly at T / 376 291,6 km (one arrival)', s.phase === 'arrived' && s.seconds === T && s.travelledKm === SURF, JSON.stringify(s));
    const live2 = await pg.evaluate(() => window.__live.filter(t => t.startsWith('Svetlo dorazilo')).length);
    check('exactly one arrival announcement', live2 === 1, String(live2));
    // Hidden page while running: paused (reason shown), no hidden progress, no self-resume.
    await click(pg, 'light-primary'); await advance(pg, 16); await click(pg, 'light-primary'); await advance(pg, 3000); await advance(pg, 300);
    await pg.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); document.dispatchEvent(new Event('visibilitychange')); });
    const h1 = await st(pg); await advance(pg, 60000); const h2 = await st(pg);
    await pg.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' }); document.dispatchEvent(new Event('visibilitychange')); }); await advance(pg, 100);
    const h3 = await st(pg); p = await panel(pg);
    check('hidden page while running: paused at the hide moment, a minute hidden adds nothing, still paused when visible; panel says why', h1.paused && h1.pauseReason === 'hidden' && near(h1.seconds, 0.3, 1e-9) && h2.travelledKm === h1.travelledKm && h3.paused && p.message[1] === 'Zastavili sme ho, keď si odišiel zo stránky.' && p.primary.text === 'Pokračovať', JSON.stringify({ h1: h1.seconds, p: p.message }));
    // Hidden page and pagehide during the countdown: cancelled, back to ready; it never starts by itself.
    for (const how of ['visibilitychange', 'pagehide']) {
      await pg.evaluate(() => lightStage.reset()); await advance(pg, 16); await click(pg, 'light-primary'); await advance(pg, 1000);
      await pg.evaluate(how => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); if (how === 'pagehide') window.dispatchEvent(new Event('pagehide')); else document.dispatchEvent(new Event('visibilitychange')); }, how);
      await advance(pg, 5000); await pg.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' }); }); await advance(pg, 100);
      s = await st(pg); p = await panel(pg);
      check(`${how} during the countdown cancels it: back to ready (no run started 5 s later), explained in the panel`, s.phase === 'ready' && s.interrupted && s.run === null && s.travelledKm === 0 && /Odpočítavanie sme zastavili/.test(p.message[1] ?? ''), JSON.stringify({ s: { phase: s.phase, run: s.run }, p: p.message }));
    }
    // "Zrušiť" during the countdown and immediate reset.
    await click(pg, 'light-primary'); await advance(pg, 500); await click(pg, 'light-secondary'); await advance(pg, 5000); s = await st(pg);
    check('"Zrušiť" right after starting: ready again, nothing starts later', s.phase === 'ready' && s.run === null && s.travelledKm === 0);
    // Keyboard only: Tab to the slider, arrows set the guess, Enter on the main button starts; focus stays on the main button.
    await pg.focus('#learn-light-tip'); await pg.keyboard.press('Home'); for (let i = 0; i < 80; i++) await pg.keyboard.press('ArrowRight');
    await advance(pg, 16); s = await st(pg);
    await pg.keyboard.press('Tab'); const f1 = (await panel(pg)).focus; await pg.keyboard.press('Enter'); await advance(pg, 100);
    const f2 = await pg.evaluate(() => ({ focus: document.activeElement?.dataset?.focus, visible: document.activeElement.matches(':focus-visible'), outline: getComputedStyle(document.activeElement).outlineStyle }));
    await pg.screenshot({ path: path.join(OUT, '6-keyboard-focus-1366x768.png') });
    await advance(pg, 3000); await advance(pg, 1100); await advance(pg, 100); const s3 = await st(pg); const f3 = (await panel(pg)).focus;
    check(`keyboard: slider by arrows (80 % → tip ${Math.round(s.prediction?.km)} km), Tab to "Vyšli svetlo", Enter starts; focus stays on the main button with a visible ring through countdown, run and result`,
      near(s.prediction.fraction, 0.8, 1e-12) && f1 === 'light-primary' && f2.focus === 'light-primary' && f2.visible && f2.outline !== 'none' && s3.phase === 'one-second' && f3 === 'light-primary', JSON.stringify({ tip: s.prediction, f1, f2, s3: s3.phase, f3 }));
    const fb = (await panel(pg)).message[3];
    check(`80 % tip (301 033 km) is within ±10 % of the route of the 1 s point: "${fb}"`, fb === 'Tvoj odhad bol blízko!', fb);
    // Countdown cancelled by navigation: step change, leaving Learn, Quiz. The run never starts afterwards; no errors.
    for (const [how, act] of [['next step', () => document.querySelector('.learn-footer .learn-primary').click()], ['leaving Learn', () => Learn.leave()], ['Quiz', () => startQuiz()]]) {
      if (!(await pg.evaluate(() => lightStage.active))) { await pg.evaluate(() => { if (isQuizMode) stopQuiz(); }); await toStep(pg); }
      await pg.evaluate(() => { lightStage.reset(); lightStage.start(); }); await advance(pg, 800);
      await pg.evaluate(act); await advance(pg, 6000); s = await st(pg);
      check(`countdown cancelled by ${how}: stage ended, nothing starts later`, !s.active, JSON.stringify(s));
    }
    await pg.evaluate(() => { if (isQuizMode) stopQuiz(); });
    // Re-entry: the same lesson session keeps the tip across a step change; opening the lesson again starts with no tip.
    await toStep(pg); await setTip(pg, 30); await advance(pg, 16);
    // Step away (back to the intro) and return (the summary step has no "Späť").
    await pg.evaluate(() => [...document.querySelectorAll('.learn-footer button')].find(b => b.textContent === 'Späť').click()); await pg.waitForTimeout(300);
    await pg.evaluate(() => document.querySelector('.learn-footer .learn-primary').click()); await pg.waitForTimeout(400); await advance(pg, 16);
    const kept = await st(pg); await pg.evaluate(() => Learn.leave()); await toStep(pg); await advance(pg, 16); const fresh = await st(pg);
    check('step away and back keeps the prediction (30 %); reopening the lesson starts fresh (no prediction, ready)', near(kept.prediction?.fraction, 0.3, 1e-12) && kept.phase === 'ready' && fresh.prediction === null && fresh.phase === 'ready', JSON.stringify({ kept: kept.prediction, fresh: fresh.prediction }));
    // Resources and listeners over repeated cycles.
    const cyc = await pg.evaluate(() => {
      lightStage.end();
      const info = () => { renderer.render(scene, camera); return [renderer.info.memory.geometries, renderer.info.memory.textures, renderer.info.programs.length].join(); };
      let vis = 0; const add = document.addEventListener.bind(document), rem = document.removeEventListener.bind(document);
      document.addEventListener = (t, f, o) => { if (t === 'visibilitychange') vis++; return add(t, f, o); }; document.removeEventListener = (t, f, o) => { if (t === 'visibilitychange') vis--; return rem(t, f, o); };
      lightStage.begin({ kind: 'light-travel' }); lightStage.render(); lightStage.end(); const before = info(); let maxVis = 0;
      for (let i = 0; i < 20; i++) {
        lightStage.begin({ kind: 'light-travel' }); maxVis = Math.max(maxVis, vis); lightStage.setPrediction(i / 20);
        lightStage.start(); window.__t += 3000; lightStage.update(); window.__t += 1100; lightStage.update(); lightStage.render(); lightStage.toMoon(); window.__t += 400; lightStage.update(); lightStage.render();
        if (i % 3 === 1) { lightStage.reset(); lightStage.start(); window.__t += 500; lightStage.update(); } // end during a countdown
        if (i % 3 === 2) { lightStage.reset(); lightStage.start(); window.__t += 3200; lightStage.update(); } // end during a run
        lightStage.end();
      }
      return { before, after: info(), maxVis, visAfter: vis };
    });
    check(`20 cycles (ending in countdown, run or arrival): resources ${cyc.before} → ${cyc.after}; one visibility listener at most, none after end`, cyc.after === cyc.before && cyc.maxVis === 1 && cyc.visAfter === 0, JSON.stringify(cyc));
    check('no JS or WebGL errors (timing, navigation, keyboard, lifecycle)', errors.length === 0, errors.join('; '));
    await context.close();
  }
  // 2b. 844×390 short landscape: every control reachable by touch and by keyboard through the scrolling side panel.
  {
    const { pg, errors, context } = await open(browser, 844, 390, { touch: true });
    const panelRect = () => pg.evaluate(() => { const r = document.getElementById('learn-root').getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, scroll: document.getElementById('learn-root').scrollTop, max: document.getElementById('learn-root').scrollHeight - document.getElementById('learn-root').clientHeight }; });
    const inView = sel => pg.evaluate(sel => { const e = document.querySelector(sel), r = e.getBoundingClientRect(), p = document.getElementById('learn-root').getBoundingClientRect(); return r.top >= p.top - 0.5 && r.bottom <= p.bottom + 0.5 && r.height > 0; }, sel);
    // Keyboard: from the title, Tab through every control; each focused control is scrolled into the panel's view.
    const tabWalk = async () => { await pg.focus('#learn-heading'); const seen = [];
      for (let i = 0; i < 14; i++) { await pg.keyboard.press('Tab'); const f = await pg.evaluate(() => { const a = document.activeElement, r = a.getBoundingClientRect(), p = document.getElementById('learn-root').getBoundingClientRect();
          return { id: a.id || a.dataset.focus || a.textContent.trim().slice(0, 20), inPanel: !!a.closest('#learn-root'), visible: r.top >= p.top - 0.5 && r.bottom <= p.bottom + 0.5, ring: a.matches(':focus-visible') }; });
        if (!f.inPanel) break; seen.push(f); }
      return seen; };
    const ready = await tabWalk();
    const want = ['learn-light-tip', 'light-primary', 'Témy', 'Späť', 'Ďalej'];
    check(`844×390 ready, keyboard: Tab reaches ${want.join(', ')} in order; each is scrolled into the side panel's view with a focus ring`, want.every(w => ready.some(f => f.id === w)) && ready.every(f => f.visible && f.ring), JSON.stringify(ready));
    // Touch: the slider (tap sets a tip), the main button, the footer, each tapped where it is after scrolling it into view.
    await pg.locator('#learn-light-tip').scrollIntoViewIfNeeded(); const box = await pg.locator('#learn-light-tip').boundingBox();
    await pg.touchscreen.tap(box.x + box.width * 0.7, box.y + box.height / 2); await pg.waitForTimeout(100);
    const tapped = await pg.evaluate(() => Number(document.getElementById('learn-light-tip').value));
    await pg.locator('[data-focus="light-primary"]').tap(); await pg.waitForTimeout(150);
    const started = await st(pg);
    check(`844×390 touch: tapping the slider sets the tip (${tapped} %), tapping "Vyšli svetlo" starts the countdown`, tapped >= 60 && tapped <= 80 && started.phase === 'countdown' && Math.abs(started.prediction.fraction - tapped / 100) < 1e-12, JSON.stringify({ tapped, phase: started.phase }));
    await pg.waitForTimeout(4300); await frames(pg);
    const one = await st(pg);
    await pg.screenshot({ path: path.join(OUT, '8-one-second-844x390-top.png') });
    const result = await tabWalk();
    const want2 = ['light-primary', 'light-secondary', 'Témy', 'Späť', 'Ďalej'];
    check(`844×390 1 s result, keyboard: Tab reaches ${want2.join(', ')}; each visible in the panel when focused`, one.phase === 'one-second' && want2.every(w => result.some(f => f.id === w)) && result.every(f => f.visible && f.ring), JSON.stringify(result));
    // The panel scrolled to its bottom: footer and the end of the explanation visible; nothing over the stage.
    await pg.evaluate(() => { const r = document.getElementById('learn-root'); r.scrollTop = r.scrollHeight; }); await pg.waitForTimeout(150);
    const bottom = await panelRect(); const footerOk = await inView('.learn-footer .learn-primary');
    await pg.screenshot({ path: path.join(OUT, '9-one-second-844x390-panel-bottom.png') });
    await pg.locator('.learn-footer button', { hasText: 'Témy' }).tap(); await pg.waitForTimeout(400);
    const left = await pg.evaluate(() => ({ stage: lightStage.active, inLesson: Learn.inLesson }));
    check(`844×390 the side panel scrolls to its bottom (${Math.round(bottom.scroll)}/${Math.round(bottom.max)} px); the footer is visible there and a tap on "Témy" works (stage ended)`, Math.abs(bottom.scroll - bottom.max) < 1 && footerOk && !left.stage && !left.inLesson, JSON.stringify({ bottom, footerOk, left }));
    check('no JS or WebGL errors (844×390 reachability)', errors.length === 0, errors.join('; '));
    await context.close();
  }
  // 3. Real clock end to end (1366×768): countdown ~3 s, exact 1 s stop, exact arrival.
  {
    const { pg, errors, context } = await open(browser, 1366, 768);
    await setTip(pg, 75); await click(pg, 'light-primary'); await pg.waitForTimeout(1500);
    const mid = await st(pg); await pg.waitForTimeout(3000); await frames(pg); const one = await st(pg);
    await click(pg, 'light-primary'); await pg.waitForTimeout(600); await frames(pg); const arr = await st(pg);
    check('real clock: countdown still running at 1.5 s, then an exact 1 s stop (299 792,458 km) and exact arrival (T, 376 291,6 km)', mid.phase === 'countdown' && one.phase === 'one-second' && one.travelledKm === C && arr.phase === 'arrived' && arr.seconds === T && arr.travelledKm === SURF, JSON.stringify({ mid: mid.phase, one: one.phase, arr: arr.phase }));
    check('no JS or WebGL errors (real clock)', errors.length === 0, errors.join('; '));
    await context.close();
  }
  // 4. Reduced motion: "Ukáž výsledok bez animácie" gives the exact result without movement, then the arrival.
  {
    const { pg, errors, context } = await open(browser, 390, 844, { reduced: true });
    await fake(pg); await advance(pg, 50);
    let p = await panel(pg);
    const offered = !p.skip.hidden && p.skip.text === 'Ukáž výsledok bez animácie';
    await setTip(pg, 50); await click(pg, 'light-skip'); await advance(pg, 16); let s = await st(pg); p = await panel(pg);
    await pg.screenshot({ path: path.join(OUT, '7-reduced-motion-result-390x844.png') });
    const one = s.phase === 'one-second' && s.seconds === 1 && s.travelledKm === C && s.skipped && p.message[0] === 'Ani svetlo nestihlo doraziť!' && !p.skip.hidden && p.skip.text === 'Ukáž príchod bez animácie';
    await click(pg, 'light-skip'); await advance(pg, 16); s = await st(pg); p = await panel(pg);
    check('reduced motion: "Ukáž výsledok bez animácie" offered; shows the exact 1 s result (1 s, 299 792,458 km) and then "Ukáž príchod bez animácie" the exact arrival; the real-time option remains', offered && one && s.phase === 'arrived' && s.seconds === T && s.travelledKm === SURF && p.message[0] === 'Svetlo dorazilo na Mesiac približne za 1,26 sekundy.', JSON.stringify({ offered, one, s: s.phase, p: p.message }));
    await click(pg, 'light-primary'); await advance(pg, 16); await click(pg, 'light-primary'); await advance(pg, 1000); s = await st(pg);
    check('reduced motion: the real-time countdown and run are still available (static digits, no transitions)', s.phase === 'countdown' && s.countdown === 2);
    check('no JS or WebGL errors (reduced motion)', errors.length === 0, errors.join('; '));
    await context.close();
  }
  // 5. Catalogue unchanged (real content, no fixture): five topics, "Pohyb vo vesmíre" inactive.
  {
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } }), pg = await ctx.newPage();
    await pg.route('**/three.min.js', r => r.fulfill({ path: require('./env').vendor('three.min.js') })); await pg.route('**/OrbitControls.js', r => r.fulfill({ path: require('./env').vendor('OrbitControls.js') }));
    await pg.goto(`http://localhost:${PORT}/`); await pg.waitForTimeout(600); await pg.fill('#activation-code', 'NGV-2025'); await pg.evaluate(() => checkCode()); await pg.waitForTimeout(2200);
    await pg.evaluate(() => Learn.enter()); await pg.waitForTimeout(300);
    const topics = await pg.evaluate(() => [...document.querySelectorAll('.learn-topic')].map(c => ({ t: c.querySelector('h3').textContent, on: !!c.querySelector('button') && !c.querySelector('button').disabled })));
    check('real catalogue: five topics active, "Pohyb vo vesmíre" inactive', topics.length === 6 && topics.filter(t => t.on).length === 5 && topics.find(t => t.t === 'Pohyb vo vesmíre').on === false, JSON.stringify(topics));
    await ctx.close();
  }
  if (notes.length) console.log('NOTES\n' + notes.join('\n'));
  console.log(`${passes} passed, ${failures} failed`);
  await browser.close(); server.close();
})();
