// Phase 6H.4.2 prediction & learning UX for the 15-second journey (outside the repository). Test-only fixture lesson; "pohyb"
// stays inactive in the app.
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const S = __dirname, ROOT = require('./env').ROOT, OUT = require('./env').out('light642'), PORT = Number(process.env.PORT || 8918);
fs.mkdirSync(OUT, { recursive: true });
const server = http.createServer((q, r) => { const u = decodeURIComponent(q.url.split('?')[0]); fs.readFile(path.join(ROOT, u === '/' ? 'index.html' : u), (e, d) => { if (e) { r.writeHead(404); r.end(); } else r.end(d); }); }).listen(PORT);
const FIXTURE = `window.LearnContent.topics.push({"id":"test-svetlo","title":"Testovacia lekcia","description":"Len na testovanie.","minutes":1}); window.LearnContent.lessons.push(${JSON.stringify({ id: 'test-svetlo', title: 'Svetlo — technický test', objective: 'Len na testovanie.', limitation: 'Len na testovanie.', steps: [
  { id: 'uvod', type: 'intro', title: 'Úvod — test', text: 'Len na testovanie.' },
  { id: 'svetlo15', type: 'experiment', title: 'Svetlo za 15 sekúnd', text: 'Len na testovanie.', experiment: { kind: 'light-travel', journey: 'fifteen' } },
  { id: 'zaver', type: 'summary', title: 'Koniec testu', ideas: ['Len na testovanie.'], text: 'Len na testovanie.' }] })});`;
const C = 299792.458, D15 = 15 * C;
const QUESTION = 'Koľkokrát by svetlo za 15 sekúnd preletelo vzdialenosť Zem–Mesiac?', RESULT1 = 'Za 15 sekúnd svetlo preletelo takmer 4,5 milióna kilometrov!', RESULT2 = 'To je takmer 12-krát vzdialenosť Zem–Mesiac.';
const FEEDBACK = { 12: 'Správny odhad!', 3: 'Svetlo doletelo ďalej, než si odhadol.', 100: 'Svetlo nedoletelo tak ďaleko, ako si odhadol.', none: 'Nabudúce si najprv tipni, koľkokrát to bude.' };
let failures = 0, passes = 0;
const check = (label, ok, detail = '') => { ok ? passes++ : failures++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${!ok && detail ? '  — ' + String(detail).slice(0, 900) : ''}`); };
const near = (a, b, tol) => Math.abs(a - b) <= tol;
async function open(browser, w, h, options = {}) {
  const context = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: options.touch ?? w < 500, reducedMotion: options.reduced ? 'reduce' : 'no-preference' });
  const pg = await context.newPage(), errors = [];
  pg.on('pageerror', e => errors.push(e.message)); pg.on('console', m => { if (m.type() === 'error' || /THREE\.WebGL|shader/i.test(m.text())) errors.push('console: ' + m.text()); });
  await pg.route('**/learn-content.sk.js', async r => { const res = await r.fetch(); r.fulfill({ response: res, body: (await res.text()) + '\n' + FIXTURE }); });
  await pg.goto(`http://localhost:${PORT}/`); await pg.waitForTimeout(600);
  await pg.fill('#activation-code', 'NGV-2025'); await pg.evaluate(() => checkCode()); await pg.waitForTimeout(2400);
  await pg.evaluate(() => { if (areOrbitsActive) toggleOrbit(); window.__live = []; new MutationObserver(() => { const t = document.querySelector('.learn-live')?.textContent; if (t) window.__live.push(t); }).observe(document.body, { subtree: true, childList: true, characterData: true }); });
  await toStep(pg);
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
const PANEL = () => { const q = s => document.querySelector(s), root = q('#learn-root'), pr = root.getBoundingClientRect(), t = x => x.replace(/[  ]/g, ' ');
  const lead = q('.learn-light-lead'), prim = q('[data-focus="light-primary"]'), pb = prim.getBoundingClientRect(), fs = q('.learn-light-choices');
  return { lead: lead && !lead.hidden ? t(lead.textContent) : null, lines: [...q('#learn-light-message').querySelectorAll('p')].map(p => t(p.textContent)), details: [...(q('#learn-experiment-details')?.querySelectorAll('p') ?? [])].map(p => t(p.textContent)),
    choices: [...document.querySelectorAll('.learn-light-choices label')].map(l => { const i = l.querySelector('input'), r = l.getBoundingClientRect(); return { text: l.textContent, value: i.value, checked: i.checked, disabled: i.disabled, selected: l.classList.contains('is-selected'), h: r.height, visible: r.height > 0 && r.bottom <= pr.bottom + 0.5 && r.top >= pr.top - 0.5, bold: getComputedStyle(l.querySelector('.learn-answer-text')).fontWeight }; }),
    choicesHidden: !fs || fs.hidden, legend: fs?.querySelector('legend')?.textContent, radios: document.querySelectorAll('input[name="learn-light-choice"][type="radio"]').length,
    primary: { text: prim.textContent, visible: pb.top >= pr.top - 0.5 && pb.bottom <= Math.min(innerHeight, pr.bottom) + 0.5, h: pb.height, ariaDisabled: prim.getAttribute('aria-disabled') },
    endLabel: [...document.querySelectorAll('#light-stage-overlay .light-ruler')].some(e => !e.hidden && e.textContent === '11,7×'), hOverflow: document.documentElement.scrollWidth > innerWidth, focus: document.activeElement?.dataset?.focus ?? document.activeElement?.name ?? document.activeElement?.tagName }; };
const panel = pg => pg.evaluate(`(${PANEL})()`);
const AUDIT = () => { const pr = document.getElementById('learn-root').getBoundingClientRect(), nav = document.getElementById('planet-nav').getBoundingClientRect(); const hit = (a, b) => a.left < b.right - 0.5 && a.right > b.left + 0.5 && a.top < b.bottom - 0.5 && a.bottom > b.top + 0.5;
  const items = [...document.querySelectorAll('#light-stage-overlay > div')].filter(e => !e.hidden && e.getBoundingClientRect().width > 0).map(e => ({ c: e.className + ':' + e.textContent.slice(0, 8), r: e.getBoundingClientRect() })); const bad = [];
  items.forEach(a => { if (a.r.left < 0 || a.r.right > innerWidth || a.r.top < 0 || a.r.bottom > innerHeight) bad.push('clipped ' + a.c); if (hit(a.r, pr)) bad.push('over panel ' + a.c); if (hit(a.r, nav)) bad.push('over nav ' + a.c); });
  items.forEach((a, i) => items.slice(i + 1).forEach(b => { if (hit(a.r, b.r)) bad.push(`overlap ${a.c} / ${b.c}`); })); return bad; };
const choose = (pg, value) => pg.click(`.learn-light-choices label:has(input[value="${value}"])`);
const reveals = p => [...p.lines, ...p.details, p.lead ?? ''].some(t => /11,7|4 496|4,5 milióna|12-krát vzdialenosť|Správny odhad/.test(t));

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  // 1. Ready → guess → countdown → running → result → repeat, at every viewport (page clock).
  for (const [w, h] of [[1920, 1080], [1366, 768], [390, 844], [390, 667], [844, 390]]) {
    const tag = `${w}×${h}`, tight = w < 500 || w === 844, { pg, errors, context } = await open(browser, w, h);
    await fake(pg); await advance(pg, 50);
    let p = await panel(pg), s = await st(pg); const before = { world: JSON.stringify(s.world), perPx: s.view.perPx, y: s.view.y };
    check(`${tag} READY: the question, three accessible choices (${p.choices.map(c => c.text).join(' / ')}, native radios in a labelled group, ≥ 44 px), none selected; "Vyšli svetlo" visible without scrolling`,
      p.lead === QUESTION && p.choices.map(c => c.text).join('|') === 'Asi 3-krát|Asi 12-krát|Asi 100-krát' && p.radios === 3 && p.legend === 'Môj odhad' && p.choices.every(c => !c.checked && !c.disabled && c.h >= 44 && c.visible) && p.primary.text === 'Vyšli svetlo' && p.primary.visible && !p.hOverflow, JSON.stringify(p));
    check(`${tag} no answer revealed before the run: no "11,7×" end label, no result or exact distance in the panel or "Vysvetlenie"`, !p.endLabel && !reveals(p), JSON.stringify({ end: p.endLabel, lines: p.lines, details: p.details }));
    await choose(pg, 12); await advance(pg, 50); p = await panel(pg); s = await st(pg);
    check(`${tag} choosing "Asi 12-krát": checked and highlighted (selected border plus bold text, weight ${p.choices[1].bold}); the stage is unchanged (physics, ruler, camera)`,
      p.choices[1].checked && p.choices[1].selected && Number(p.choices[1].bold) >= 600 && p.choices.filter(c => c.checked).length === 1 && JSON.stringify(s.world) === before.world && s.view.perPx === before.perPx && s.prediction === null && s.travelledKm === 0, JSON.stringify(p.choices));
    await pg.screenshot({ path: path.join(OUT, `1-ready-${w}x${h}.png`) });
    const a0 = await pg.evaluate(`(${AUDIT})()`);
    await pg.click('[data-focus="light-primary"]', { force: true }); await advance(pg, 1200); p = await panel(pg); s = await st(pg);
    const guessShown = tight ? p.choicesHidden && p.lines.includes('Tvoj odhad: asi 12-krát.') : !p.choicesHidden && p.choices[1].checked && p.choices[1].selected && p.choices.every(c => c.disabled);
    check(`${tag} COUNTDOWN: the guess stays visible (${tight ? '"Tvoj odhad: asi 12-krát." line' : 'selected, disabled choice row'}) and cannot change; no answer revealed`, s.phase === 'countdown' && guessShown && !reveals(p), JSON.stringify(p));
    if (!tight) { await pg.click('.learn-light-choices label:has(input[value="3"])', { force: true }); }
    await advance(pg, 1800); await advance(pg, 5000); p = await panel(pg); s = await st(pg);
    await pg.screenshot({ path: path.join(OUT, `2-running-${w}x${h}.png`) });
    check(`${tag} RUNNING at 5 s: the guess is unchanged (still 12), the run is exact (c × 5 s), "Pozastaviť"; no answer revealed`, s.phase === 'first' && near(s.travelledKm, C * 5, 1e-6) && p.primary.text === 'Pozastaviť' && (tight ? p.lines.includes('Tvoj odhad: asi 12-krát.') : p.choices[1].checked && !p.choices[0].checked) && !reveals(p) && !p.endLabel, JSON.stringify(p));
    await pg.click('[data-focus="light-primary"]', { force: true }); await advance(pg, 4000); const sp = await st(pg);
    await pg.click('[data-focus="light-primary"]', { force: true }); await advance(pg, 0, 1); await advance(pg, 10000); await advance(pg, 100, 3);
    p = await panel(pg); s = await st(pg); const live = await pg.evaluate(() => window.__live.map(t => t.replace(/[  ]/g, ' ')));
    await pg.screenshot({ path: path.join(OUT, `3-result-${w}x${h}.png`) });
    const a15 = await pg.evaluate(`(${AUDIT})()`);
    const resultOk = p.lead === RESULT1 && (tight ? p.lines[0] === `${RESULT2} ${FEEDBACK[12]}` : p.lines.join('|') === `${RESULT2}|${FEEDBACK[12]}`);
    check(`${tag} RESULT at exactly 15 s: "${p.lead}" / ${p.lines.join(' / ')}; "Opakovať pokus" visible; "11,7×" now shown; exact values in "Vysvetlenie"`,
      sp.paused && near(sp.seconds, 5, 1e-9) && s.phase === 'done' && s.seconds === 15 && s.travelledKm === D15 && resultOk && p.primary.text === 'Opakovať pokus' && p.primary.visible && p.endLabel
      && p.details.some(t => t.startsWith('Svetlo prejde za 15 sekúnd presne 4 496 886,87 km. To je 11,70 × 384 400 km.')) && p.details.includes('Tvoj odhad: asi 12-krát.'), JSON.stringify({ p, sp: sp.seconds }));
    check(`${tag} one result announcement with the result and feedback; nothing announced while the light moves`, live.filter(t => t.startsWith(RESULT1)).length === 1 && live.some(t => t.includes(FEEDBACK[12])) && !live.some(t => /km|Správny/.test(t) && !t.startsWith(RESULT1)), JSON.stringify(live));
    check(`${tag} the route never moves (panel height held): ready, countdown, running, result`, s.view.y === before.y && s.view.perPx === before.perPx);
    const bad = [...a0, ...a15];
    check(`${tag} no clipped or overlapping labels, nothing over the panel or planet bar, no horizontal overflow`, bad.length === 0 && !p.hOverflow, JSON.stringify([...new Set(bad)]));
    await pg.click('[data-focus="light-primary"]', { force: true }); await advance(pg, 50); p = await panel(pg); s = await st(pg);
    check(`${tag} REPEAT: ready again, the guess (12) is kept and can be changed; "11,7×" hidden again`, s.phase === 'ready' && p.choices[1].checked && p.choices.every(c => !c.disabled) && !p.choicesHidden && !p.endLabel && p.lead === QUESTION, JSON.stringify(p));
    check(`${tag} touch targets ≥ 44 px (choices ${p.choices.map(c => c.h.toFixed(0)).join('/')}, main button ${p.primary.h.toFixed(0)})`, p.choices.every(c => c.h >= 44) && p.primary.h >= 44);
    check(`${tag} no JS or WebGL errors`, errors.length === 0, errors.join('; '));
    await context.close();
  }
  // 2. All feedback outcomes, optional guess, keyboard, hidden page, navigation cleanup, fresh session (1366×768).
  {
    const { pg, errors, context } = await open(browser, 1366, 768);
    await fake(pg); await advance(pg, 50);
    // No guess: the experiment starts anyway; neutral invitation.
    let p = await panel(pg);
    await pg.click('[data-focus="light-primary"]', { force: true }); await advance(pg, 3000); await advance(pg, 15000); await advance(pg, 100, 3); p = await panel(pg);
    check('no guess: starting is not blocked; result with the neutral invitation "Nabudúce si najprv tipni, koľkokrát to bude."', (await st(pg)).phase === 'done' && p.lines[1] === FEEDBACK.none, JSON.stringify(p.lines));
    for (const value of [3, 100, 12]) {
      await pg.click('[data-focus="light-primary"]', { force: true }); await advance(pg, 50); await choose(pg, value); await advance(pg, 50);
      await pg.evaluate(() => lightStage.skip()); await advance(pg, 50); p = await panel(pg);
      check(`guess ${value}×: "${p.lines[1]}" (not a score)`, p.lines[1] === FEEDBACK[value] && p.lead === RESULT1, JSON.stringify(p.lines));
    }
    // Keyboard: Tab into the group, arrows choose, Tab to the main button, Enter starts; focus ring visible; focus stays on the button.
    await pg.click('[data-focus="light-primary"]', { force: true }); await advance(pg, 50);
    // From the title, Tab in document order ("Zavrieť" in the header comes first) until the choice group has focus.
    await pg.focus('#learn-heading'); let tabs = 0;
    while (tabs < 6 && await pg.evaluate(() => document.activeElement?.name !== 'learn-light-choice')) { await pg.keyboard.press('Tab'); tabs++; }
    const f1 = await pg.evaluate(() => ({ name: document.activeElement.name, value: document.activeElement.value, ring: getComputedStyle(document.activeElement.closest('label') ?? document.body).outlineStyle }));
    await pg.keyboard.press('ArrowRight'); await advance(pg, 50); // the kept guess is 12; → selects 100
    const f2 = await pg.evaluate(() => ({ value: document.activeElement.value, checked: document.activeElement.checked }));
    await pg.keyboard.press('Tab'); const f3 = (await panel(pg)).focus; await pg.keyboard.press('Enter'); await advance(pg, 100);
    const s1 = await st(pg), f4 = (await panel(pg)).focus;
    await pg.screenshot({ path: path.join(OUT, '4-keyboard-1366x768.png') });
    check(`keyboard: Tab reaches the choices after ${tabs} Tab presses (on the kept guess ${f1.value}; focus ring ${f1.ring}), arrow keys choose (→ ${f2.value}), Tab to "Vyšli svetlo", Enter starts; focus stays on the main button`, f1.name === 'learn-light-choice' && f1.value === '12' && f1.ring !== 'none' && f2.checked && f2.value === '100' && f3 === 'light-primary' && s1.phase === 'countdown' && f4 === 'light-primary', JSON.stringify({ f1, f2, f3, f4 }));
    // Hidden page during the run: paused; no hidden progress.
    await advance(pg, 3000); await advance(pg, 2000);
    await pg.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); document.dispatchEvent(new Event('visibilitychange')); });
    const h1 = await st(pg); await advance(pg, 60000); const h2 = await st(pg);
    await pg.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' }); }); p = await panel(pg);
    check('hidden page during the run: paused, a minute hidden adds nothing; the panel explains; the guess stays', h1.paused && h1.pauseReason === 'hidden' && h2.travelledKm === h1.travelledKm && p.lines.includes('Zastavili sme ho, keď si odišiel zo stránky.') && p.choices[2].checked, JSON.stringify(p.lines));
    // Navigation cleanup during the countdown and during the run; a fresh lesson session starts without a guess.
    await pg.evaluate(() => { lightStage.reset(); lightStage.start(); }); await advance(pg, 800);
    await pg.evaluate(() => Learn.leave()); await advance(pg, 6000); const gone1 = await st(pg);
    await toStep(pg); await advance(pg, 50); p = await panel(pg);
    check('leaving Learn during the countdown ends the stage (nothing starts later); reopening the lesson starts without a guess', !gone1.active && p.choices.every(c => !c.checked) && (await st(pg)).phase === 'ready', JSON.stringify(p.choices));
    await choose(pg, 3); await pg.evaluate(() => lightStage.start()); await advance(pg, 3000); await advance(pg, 4000);
    await pg.evaluate(() => startQuiz()); await advance(pg, 100); const gone2 = await st(pg);
    check('starting Quiz during the run ends the stage cleanly', !gone2.active);
    await pg.evaluate(() => { if (isQuizMode) stopQuiz(); }); await toStep(pg); await advance(pg, 50);
    check('a fresh lesson session after Quiz starts without a guess', (await panel(pg)).choices.every(c => !c.checked));
    check('no JS or WebGL errors (outcomes, keyboard, navigation)', errors.length === 0, errors.join('; '));
    await context.close();
  }
  // 3. Reduced motion: "Ukáž výsledok bez animácie" gives the exact result and feedback without movement (390×844).
  {
    const { pg, errors, context } = await open(browser, 390, 844, { reduced: true });
    await fake(pg); await advance(pg, 50); await choose(pg, 3); await advance(pg, 50);
    let p = await panel(pg); const offered = await pg.evaluate(() => { const b = document.querySelector('[data-focus="light-skip"]'); return !b.hidden && b.textContent; });
    await pg.click('[data-focus="light-skip"]'); await advance(pg, 50); p = await panel(pg); const s = await st(pg);
    await pg.screenshot({ path: path.join(OUT, '5-reduced-motion-result-390x844.png') });
    check(`reduced motion: "${offered}" shows the exact 15 s result (4 496 886,87 km) with the feedback for 3×, no movement`, offered === 'Ukáž výsledok bez animácie' && s.phase === 'done' && s.travelledKm === D15 && s.skipped && p.lines[0] === `${RESULT2} ${FEEDBACK[3]}`, JSON.stringify({ offered, lines: p.lines }));
    check('no JS or WebGL errors (reduced motion)', errors.length === 0, errors.join('; '));
    await context.close();
  }
  // 4. The real catalogue (Phase 6H.6.3 activation candidate: six active topics; until 6H.6.2 "Pohyb vo vesmíre" was inactive).
  {
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } }), p2 = await ctx.newPage();
    await p2.goto(`http://localhost:${PORT}/`); await p2.waitForTimeout(600); await p2.fill('#activation-code', 'NGV-2025'); await p2.evaluate(() => checkCode()); await p2.waitForTimeout(2200);
    await p2.evaluate(() => Learn.enter()); await p2.waitForTimeout(300);
    const topics = await p2.evaluate(() => [...document.querySelectorAll('.learn-topic')].map(c => ({ t: c.querySelector('h3').textContent, on: !!c.querySelector('button') && !c.querySelector('button').disabled })));
    check('real catalogue (Phase 6H.6.3 activation candidate): six topics active, the sixth "Svetlo a vesmírne vzdialenosti"', topics.length === 6 && topics.filter(t => t.on).length === 6 && topics[5].t === 'Svetlo a vesmírne vzdialenosti' && topics[5].on === true, JSON.stringify(topics));
    await ctx.close();
  }
  console.log(`${passes} passed, ${failures} failed`);
  await browser.close(); server.close();
})();
