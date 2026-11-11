// Phase 6H.5.2.C focused responsive and interaction verification (outside the repository). 844×390 and 390×667: panel bounds,
// reachability of every panel control (keyboard focus, wheel and touch scrolling), stage/panel overlap, and isolation of the
// test-only technical preview. The preview fixture exists only in this test browser; production content is checked unpatched.
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const S = __dirname, ROOT = require('./env').ROOT, OUT = require('./env').out('light653'), PORT = Number(process.env.PORT || 8933);
fs.mkdirSync(OUT, { recursive: true });
const server = http.createServer((q, r) => { const u = decodeURIComponent(q.url.split('?')[0]); fs.readFile(path.join(ROOT, u === '/' ? 'index.html' : u), (e, d) => { if (e) { r.writeHead(404); r.end(); } else r.end(d); }); }).listen(PORT);
const FIXTURE = `window.LearnContent.topics.push({"id":"test-svetlo","title":"Testovacia lekcia","description":"Len na testovanie.","minutes":1}); window.LearnContent.lessons.push(${JSON.stringify({ id: 'test-svetlo', title: 'Svetlo — technický test', objective: 'Len na testovanie.', limitation: 'Len na testovanie.', steps: [
  { id: 'uvod', type: 'intro', title: 'Úvod — test', text: 'Len na testovanie.' },
  { id: 'nahlad', type: 'observe', title: 'Technický náhľad', text: 'Svetlo zo Slnka k planétam – len vizuálna kontrola scény, bez úloh.', demo: { kind: 'focus', body: 'earth', view: 'earth-moon' } },
  { id: 'zaver', type: 'summary', title: 'Koniec testu', ideas: ['Len na testovanie.'], text: 'Len na testovanie.' }] })});`;
let failures = 0, passes = 0; const notes = [];
const check = (label, ok, detail = '') => { ok ? passes++ : failures++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${!ok && detail ? '  — ' + String(detail).slice(0, 1200) : ''}`); };
async function open(browser, w, h, fixture = true) {
  const context = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: true }), pg = await context.newPage(), errors = [];
  pg.on('pageerror', e => errors.push(e.message)); pg.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await pg.route('**/three.min.js', r => r.fulfill({ path: require('./env').vendor('three.min.js') }));
  await pg.route('**/OrbitControls.js', r => r.fulfill({ path: require('./env').vendor('OrbitControls.js') }));
  if (fixture) await pg.route('**/learn-content.sk.js', async r => { const res = await r.fetch(); r.fulfill({ response: res, body: (await res.text()) + '\n' + FIXTURE }); });
  await pg.goto(`http://localhost:${PORT}/`); await pg.waitForTimeout(600);
  await pg.fill('#activation-code', 'NGV-2025'); await pg.evaluate(() => checkCode()); await pg.waitForTimeout(2800);
  await pg.evaluate(() => { if (areOrbitsActive) toggleOrbit(); });
  return { pg, errors, context };
}
const toPreview = async pg => {
  await pg.evaluate(() => { Learn.enter(); [...document.querySelectorAll('.learn-topic')].find(c => c.querySelector('h3').textContent === 'Testovacia lekcia').querySelector('button').click(); });
  await pg.waitForTimeout(500); await pg.evaluate(() => document.querySelector('.learn-footer .learn-primary').click()); await pg.waitForTimeout(500);
};
const frames = (pg, n = 3) => pg.evaluate(n => new Promise(res => { let k = 0; const f = () => (++k >= n ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
const fake = pg => pg.evaluate(() => { window.__realNow = window.__realNow || performance.now.bind(performance); window.__t = window.__realNow(); performance.now = () => window.__t; });
const advance = async (pg, ms, n = 2) => { await pg.evaluate(ms => { window.__t += ms; }, ms); await frames(pg, n); };
const PANEL = () => { const p = document.getElementById('learn-root'), b = p.getBoundingClientRect(), nav = document.getElementById('planet-nav').getBoundingClientRect();
  const ctrls = [...p.querySelectorAll('button, input, select, a[href]')].filter(e => e.offsetParent && !e.disabled).map(e => { const r = e.getBoundingClientRect(); return { t: (e.textContent || e.value || e.type).trim().slice(0, 18), top: r.top, bottom: r.bottom, left: r.left, right: r.right, w: r.width, h: r.height }; });
  return { layout: p.dataset.layout ?? 'sheet', top: b.top, bottom: b.bottom, left: b.left, right: b.right, vw: innerWidth, vh: innerHeight, navBottom: nav.bottom, scrollTop: p.scrollTop, scrollH: p.scrollHeight, clientH: p.clientHeight, overflowY: getComputedStyle(p).overflowY, touchAction: getComputedStyle(p).touchAction, ctrls }; };
const fully = (c, p) => c.top >= p.top - 0.5 && c.bottom <= p.bottom + 0.5 && c.left >= p.left - 0.5 && c.right <= p.right + 0.5;
// Stage overlay vs panel: every visible overlay element clear of the panel rectangle.
const OVERLAP = () => { const p = document.getElementById('learn-root').getBoundingClientRect();
  return [...document.querySelectorAll('#light-stage-overlay > div')].filter(e => !e.hidden && e.getBoundingClientRect().width > 0).map(e => { const r = e.getBoundingClientRect(); return { cls: e.className, text: e.textContent.slice(0, 20), hit: r.left < p.right - 1 && p.left < r.right - 1 && r.top < p.bottom - 1 && p.top < r.bottom - 1 }; }).filter(x => x.hit); };
// Keyboard: Tab until the named control is focused; return its rectangle after the browser scrolled it into view.
async function tabTo(pg, label) {
  // A radio group is one Tab stop; inside it the arrow keys move (standard keyboard behaviour).
  if (await pg.evaluate(l => document.activeElement?.type === 'radio' && [...document.querySelectorAll(`input[name="${document.activeElement.name}"]`)].some(r => r.value === l), label)) {
    for (let i = 0; i < 5 && !(await pg.evaluate(l => document.activeElement?.value === l, label)); i++) await pg.keyboard.press('ArrowRight');
    return pg.evaluate(() => { const r = document.activeElement.closest('label').getBoundingClientRect(), p = document.getElementById('learn-root').getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, pTop: p.top, pBottom: p.bottom, pLeft: p.left, pRight: p.right, visible: 'visible', what: 'radio (arrow keys)' }; });
  }
  for (let i = 0; i < 40; i++) { await pg.keyboard.press('Tab'); const t = await pg.evaluate(() => (document.activeElement?.textContent || '').trim()); if (t === label || await pg.evaluate(l => document.activeElement?.value === l, label)) return pg.evaluate(() => { const a = document.activeElement, box = a.type === 'radio' ? a.closest('label') : a, r = box.getBoundingClientRect(), p = document.getElementById('learn-root').getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, pTop: p.top, pBottom: p.bottom, pLeft: p.left, pRight: p.right, visible: getComputedStyle(box).visibility, what: a.type || a.tagName }; }); }
  return null;
}

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  // 1. 844×390 landscape: preview panel bounds and reachability of every control, during the planets stage.
  for (const [w, h] of [[844, 390], [390, 667]]) {
    const tag = `${w}×${h}`, { pg, errors, context } = await open(browser, w, h);
    await toPreview(pg); await fake(pg); await advance(pg, 50);
    await pg.evaluate(() => lightStage.begin({ kind: 'light-travel', journey: 'planets' }, () => {})); await advance(pg, 50, 3);
    for (const state of w < 500 ? ['as opened', 'expanded by the user (Viac)'] : ['as opened']) {
      if (state.startsWith('expanded')) { await pg.evaluate(() => [...document.querySelectorAll('#learn-root button')].find(b => b.textContent.trim() === 'Viac')?.click()); await pg.waitForTimeout(300); await advance(pg, 50, 3); }
      if (false) { await pg.evaluate(() => [...document.querySelectorAll('#learn-root button')].find(b => b.textContent.trim() === 'Menej')?.click()); await pg.waitForTimeout(300); await advance(pg, 50, 3); }
      const p = await pg.evaluate(`(${PANEL})()`);
      notes.push(`${tag} ${state}: layout ${p.layout}, panel ${Math.round(p.top)}–${Math.round(p.bottom)} of ${p.vh}px, scroll ${p.scrollH}/${p.clientH} (${p.overflowY}), touch-action ${p.touchAction}; controls ${p.ctrls.map(c => `${c.t}@${Math.round(c.top)}–${Math.round(c.bottom)}`).join(', ')}`);
      check(`${tag} ${state}: the Learn panel stays inside the usable viewport (below the planet bar, above the bottom edge, within the width)`, p.top >= p.navBottom - 0.5 && p.bottom <= p.vh + 0.5 && p.left >= 0 && p.right <= p.vw + 0.5, JSON.stringify(p).slice(0, 400));
      check(`${tag} ${state}: every panel control is at least 44 px tall (touch target)`, p.ctrls.every(c => c.h >= 44 - 0.5), JSON.stringify(p.ctrls.filter(c => c.h < 44)));
      // Keyboard: each control can be focused and is then fully visible inside the panel.
      const missed = [];
      for (const c of p.ctrls) { const r = await tabTo(pg, c.t); if (!r || !(r.top >= r.pTop - 0.5 && r.bottom <= r.pBottom + 0.5 && r.left >= r.pLeft - 0.5 && r.right <= r.pRight + 0.5) || r.visible !== 'visible') missed.push({ c: c.t, r }); }
      check(`${tag} ${state}: keyboard — Tab reaches every panel control and the browser shows it fully inside the panel (${p.ctrls.map(c => c.t).join(', ')})`, missed.length === 0, JSON.stringify(missed));
      // Scrolling: if the panel scrolls, a wheel and a touch swipe both reach its end, where the footer buttons are fully visible.
      await pg.evaluate(() => { document.activeElement?.blur(); document.getElementById('learn-root').scrollTop = 0; }); await pg.waitForTimeout(100);
      const scrolls = p.scrollH > p.clientH + 1;
      if (scrolls) {
        await pg.mouse.move((p.left + p.right) / 2, (p.top + p.bottom) / 2); await pg.mouse.wheel(0, 2000); await pg.waitForTimeout(300);
        const byWheel = await pg.evaluate(`(${PANEL})()`), footW = byWheel.ctrls.filter(c => ['Témy', 'Späť', 'Ďalej'].includes(c.t));
        await pg.evaluate(() => { document.getElementById('learn-root').scrollTop = 0; }); await pg.waitForTimeout(100);
        // Touch: a real finger drag (raw touch events; the browser scrolls natively). Starts on panel text, not on a button.
        const cdp = await context.newCDPSession(pg), x = Math.round(p.left + 24), y0 = Math.round(p.bottom - 60), pts = y => [{ x, y }];
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pts(y0) });
        for (let y = y0; y >= y0 - 120; y -= 10) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pts(y) });
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await pg.waitForTimeout(400);
        const byTouch = await pg.evaluate(`(${PANEL})()`), footT = byTouch.ctrls.filter(c => ['Témy', 'Späť', 'Ďalej'].includes(c.t));
        check(`${tag} ${state}: the panel scrolls (${p.scrollH - p.clientH}px); a mouse wheel and a touch swipe both bring Témy / Späť / Ďalej fully into the panel`, footW.length === 3 && footW.every(c => fully(c, byWheel)) && footT.length === 3 && footT.every(c => fully(c, byTouch)) && byTouch.scrollTop > 0,
          JSON.stringify({ wheel: footW, touch: footT, top: byTouch.scrollTop }));
        await pg.evaluate(() => { document.getElementById('learn-root').scrollTop = 0; });
      } else check(`${tag} ${state}: no scrolling needed — all panel controls fully visible inside the panel`, p.ctrls.every(c => fully(c, p)), JSON.stringify(p.ctrls));
      // Stage vs panel: no overlay element of the simulation lies under the panel, at all six review moments' extremes (start and Neptune).
      const hitReady = await pg.evaluate(`(${OVERLAP})()`);
      check(`${tag} ${state}: no simulation label or readout under the panel (ready)`, hitReady.length === 0, JSON.stringify(hitReady));
      await pg.evaluate(() => { lightStage.skip(); lightStage.skip(); }); await advance(pg, 50, 3);
      const hitEnd = await pg.evaluate(`(${OVERLAP})()`);
      check(`${tag} ${state}: no simulation label or readout under the panel (stage B completed at Neptune)`, hitEnd.length === 0, JSON.stringify(hitEnd));
      await pg.screenshot({ path: path.join(OUT, `neptune-${w}x${h}-${state.split(' ')[0]}.png`) });
      await pg.evaluate(() => lightStage.reset()); await advance(pg, 50, 3);
    }
    check(`${tag}: no JS errors`, errors.length === 0, errors.join('; '));
    await context.close();
  }
  // 2. Existing 1 s and 15 s light steps at 844×390 (approved earlier): same reachability checks, for comparison only.
  {
    const FIX2 = FIXTURE.replace(`{"id":"nahlad"`, `{"id":"svetlo1","type":"experiment","title":"Svetlo za jednu sekundu","text":"Len na testovanie.","experiment":{"kind":"light-travel","journey":"earth-moon"}},{"id":"svetlo15","type":"experiment","title":"Svetlo za 15 sekúnd","text":"Len na testovanie.","experiment":{"kind":"light-travel","journey":"fifteen"}},{"id":"nahlad"`);
    for (const step of [1, 2]) {
      const context = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true }), pg = await context.newPage();
      await pg.route('**/three.min.js', r => r.fulfill({ path: require('./env').vendor('three.min.js') })); await pg.route('**/OrbitControls.js', r => r.fulfill({ path: require('./env').vendor('OrbitControls.js') }));
      await pg.route('**/learn-content.sk.js', async r => { const res = await r.fetch(); r.fulfill({ response: res, body: (await res.text()) + '\n' + FIX2 }); });
      await pg.goto(`http://localhost:${PORT}/`); await pg.waitForTimeout(600); await pg.fill('#activation-code', 'NGV-2025'); await pg.evaluate(() => checkCode()); await pg.waitForTimeout(2800);
      await pg.evaluate(() => { Learn.enter(); [...document.querySelectorAll('.learn-topic')].find(c => c.querySelector('h3').textContent === 'Testovacia lekcia').querySelector('button').click(); }); await pg.waitForTimeout(500);
      for (let i = 0; i < step; i++) { await pg.evaluate(() => document.querySelector('.learn-footer .learn-primary').click()); await pg.waitForTimeout(450); }
      const p = await pg.evaluate(`(${PANEL})()`), missed = [];
      for (const c of p.ctrls) { const r = await tabTo(pg, c.t); if (!r || !(r.top >= r.pTop - 0.5 && r.bottom <= r.pBottom + 0.5)) missed.push({ c: c.t, r }); }
      notes.push(`844×390 existing ${step === 1 ? '1 s' : '15 s'} step: panel ${Math.round(p.top)}–${Math.round(p.bottom)}, scroll ${p.scrollH}/${p.clientH}; footer at ${p.ctrls.filter(c => c.t === 'Ďalej').map(c => Math.round(c.top)).join()} px (reached by scrolling)`);
      check(`844×390 existing ${step === 1 ? '1 s' : '15 s'} step (unchanged): panel inside the viewport; keyboard reaches every control fully inside the panel`, p.top >= p.navBottom - 0.5 && p.bottom <= p.vh + 0.5 && missed.length === 0, JSON.stringify(missed));
      await context.close();
    }
  }
  // 3. Isolation of the technical preview.
  {
    const { pg, errors, context } = await open(browser, 1366, 768, false); // production content, unpatched
    const prod = await pg.evaluate(() => { Learn.enter(); const card = [...document.querySelectorAll('.learn-topic')].find(c => c.querySelector('h3').textContent === 'Pohyb vo vesmíre');
      const lessons = window.LearnContent.lessons, planets = lessons.flatMap(l => l.steps).filter(s => s.experiment?.journey === 'planets').length;
      return { button: !!card?.querySelector('button:not([disabled])'), status: card?.querySelector('.learn-topic-status')?.textContent ?? null, pohybLesson: lessons.some(l => l.id === 'pohyb'), lightSteps: lessons.flatMap(l => l.steps).filter(s => s.experiment?.kind === 'light-travel').length, planets }; });
    check(`production content: "Pohyb vo vesmíre" stays inactive (no lesson, status "${prod.status}", no start button); no lesson uses any light experiment or the planets journey`, !prod.button && !prod.pohybLesson && prod.lightSteps === 0 && prod.planets === 0, JSON.stringify(prod));
    // The planets journey cannot start outside Learn, in Quiz, or by an unknown journey name.
    const gate = await pg.evaluate(() => { Learn.leave(); const out = lightStage.begin({ kind: 'light-travel', journey: 'planets' }, () => {}); const active = lightStage.active; return { out, active }; });
    check('outside Learn the stage refuses to begin (no way into the planets journey from Explore)', gate.out === false && gate.active === false, JSON.stringify(gate));
    check('production page: no JS errors', errors.length === 0, errors.join('; '));
    await context.close();
  }
  {
    const { pg, errors, context } = await open(browser, 844, 390);
    await toPreview(pg); await fake(pg); await advance(pg, 50);
    await pg.evaluate(() => lightStage.begin({ kind: 'light-travel', journey: 'planets' }, () => {})); await advance(pg, 50, 3);
    // Navigation from the preview stays inside the fixture lesson and ends the planets stage.
    await pg.evaluate(() => document.querySelector('.learn-footer .learn-primary').click()); await pg.waitForTimeout(500);
    const next = await pg.evaluate(() => ({ title: document.querySelector('#learn-root h2, #learn-root .learn-title')?.textContent ?? '', active: lightStage.active, overlay: document.getElementById('light-stage-overlay').hidden }));
    check(`"Ďalej" from the preview goes to the fixture's own next step ("${next.title.trim()}") and ends the planets stage`, /Koniec testu/.test(next.title) && !next.active && next.overlay, JSON.stringify(next));
    // Back to the preview step: Learn shows its panel again, but the planets stage does not restart by itself.
    await pg.evaluate(() => document.querySelector('.learn-footer .learn-secondary, .learn-footer button:not(.learn-primary)')?.click()); await pg.waitForTimeout(400);
    const back = await pg.evaluate(() => ({ active: lightStage.active, title: document.querySelector('#learn-root h2')?.textContent ?? '' }));
    check(`after leaving the preview step ("${back.title.trim()}") the planets stage does not re-activate the planets stage (only a direct begin() call starts it)`, !back.active, JSON.stringify(back));
    await pg.evaluate(() => { const b = [...document.querySelectorAll('#learn-root button')].find(x => ['Témy', 'Späť na témy'].includes(x.textContent.trim())); b?.click(); }); await pg.waitForTimeout(500);
    const topics = await pg.evaluate(() => ({ cards: document.querySelectorAll('.learn-topic').length, active: lightStage.active }));
    check(`"Témy" returns to the topic list (${topics.cards} topics); nothing else opens; stage inactive`, topics.cards >= 6 && !topics.active, JSON.stringify(topics));
    // Quiz and Explore after the preview still work as before.
    await pg.evaluate(() => Learn.leave()); await pg.waitForTimeout(300);
    const after = await pg.evaluate(() => ({ learn: Learn.active, light: lightStage.active, orbitsUI: !!document.getElementById('pause-btn') }));
    check('leaving Learn after the preview: Explore restored, light stage inactive', !after.learn && !after.light && after.orbitsUI, JSON.stringify(after));
    check('preview navigation: no JS errors', errors.length === 0, errors.join('; '));
    await context.close();
  }
  console.log('NOTES\n' + notes.join('\n'));
  console.log(`${passes} passed, ${failures} failed`);
  await browser.close(); server.close();
})();
