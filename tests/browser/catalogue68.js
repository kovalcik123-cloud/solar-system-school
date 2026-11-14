// Phase 6H.8.C catalogue harness. The Learn topic catalogue ("Čo dnes objavíme?") with the real lessons (no fixture).
// - Six desktop viewports (1920×1080, 1920×945, 1440×900, 1366×768, 1366×657, 1280×720): the 3 × 2 grid with all six cards and
//   "Začať lekciu" buttons in view, no catalogue scrolling, at least 12 px of spare height, no clipped or overlapping text, the
//   planet bar untouched, font sizes unchanged, the simulation controls hidden and out of the Tab order.
// - Short desktop windows below the feasible height (1366×640, 1280×609): the catalogue scrolls when it must; every card is reachable.
// - Tablet and phone layouts (1024×768, 768×1024, 390×844, 390×667, 844×390): identical to the layout without the Phase 6H.8.C
//   rules (the same page is loaded a second time with those rules removed and the two layouts are compared).
// - Every card starts its own lesson; the simulation controls return in a lesson, in Explore and after the Quiz, also after
//   repeated mode switching; focus never stays inside hidden controls.
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const ENV = require('./env'), ROOT = ENV.ROOT, OUT = ENV.out('catalogue68'), PORT = Number(process.env.PORT || 8969);
const server = http.createServer((q, r) => { const u = decodeURIComponent(q.url.split('?')[0]); fs.readFile(path.join(ROOT, u === '/' ? 'index.html' : u), (e, d) => { if (e) { r.writeHead(404); r.end(); } else r.end(d); }); }).listen(PORT);
let failures = 0, passes = 0;
const check = (label, ok, detail = '') => { ok ? passes++ : failures++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${!ok && detail ? '  — ' + String(detail).slice(0, 900) : ''}`); };
const DESKTOP = [[1920, 1080], [1920, 945], [1440, 900], [1366, 768], [1366, 657], [1280, 720]];
const SHORT = [[1366, 640], [1280, 609]];
const SMALL = [[1024, 768, 2], [768, 1024, 1], [390, 844, 1], [390, 667, 1], [844, 390, 1]]; // width, height, expected columns
const MARGIN = 12;
// The page without the Phase 6H.8.C rules: the marked block of learn.css and the one rule in index.html are removed in the browser only.
const cssWithout = () => { const css = fs.readFileSync(path.join(ROOT, 'learn.css'), 'utf8'), a = css.indexOf('/* Phase 6H.8.C'), end = '/* End of Phase 6H.8.C */', b = css.indexOf(end);
  if (a < 0 || b < a) throw new Error('learn.css: Phase 6H.8.C block markers not found'); return css.slice(0, a) + css.slice(b + end.length); };
const htmlWithout = () => { const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8'), rule = /^.*@media \(min-width: 1200px\) \{ body:has\(#learn-root\.learn-home:not\(\[hidden\]\)\) \.simulation-controls \{ visibility: hidden; \} \}\r?\n/m;
  if (!rule.test(html)) throw new Error('index.html: Phase 6H.8.C rule not found'); return html.replace(rule, ''); };

async function open(browser, w, h, without = false) {
  const context = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: w < 900 });
  const pg = await context.newPage(), errors = [];
  pg.on('pageerror', e => errors.push(e.message)); pg.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  if (without) { await pg.route('**/learn.css', r => r.fulfill({ contentType: 'text/css', body: cssWithout() })); await pg.route(`http://localhost:${PORT}/`, r => r.fulfill({ contentType: 'text/html', body: htmlWithout() })); }
  await pg.goto(`http://localhost:${PORT}/`); await pg.waitForTimeout(600);
  await pg.fill('#activation-code', 'NGV-2025'); await pg.evaluate(() => checkCode()); await pg.waitForTimeout(2400);
  return { pg, errors, context };
}
// The catalogue as laid out now, measured against the page's own visible viewport.
const CATALOGUE = () => {
  const root = document.getElementById('learn-root'), header = root.querySelector('.learn-header'), body = root.querySelector('.learn-body'), grid = root.querySelector('.learn-topics'), cards = [...grid.children];
  const r = e => e.getBoundingClientRect(), box = x => [x.left, x.top, x.width, x.height].map(v => Math.round(v * 10) / 10), p = r(root), b = r(body);
  const shown = e => !!e && getComputedStyle(e).display !== 'none' && getComputedStyle(e).visibility !== 'hidden' && r(e).height > 0;
  const hit = (x, y) => x.left < y.right - 0.5 && x.right > y.left + 0.5 && x.top < y.bottom - 0.5 && x.bottom > y.top + 0.5;
  const viewH = Math.min(innerHeight, window.visualViewport?.height ?? innerHeight), viewW = Math.min(innerWidth, window.visualViewport?.width ?? innerWidth);
  const inView = e => { const x = r(e); return x.height > 0 && x.top >= Math.max(0, b.top) - 0.5 && x.bottom <= Math.min(b.bottom, viewH) + 0.5 && x.left >= b.left - 0.5 && x.right <= Math.min(b.right, viewW) + 0.5; };
  const clickable = e => { const x = r(e), t = document.elementFromPoint((x.left + x.right) / 2, (x.top + x.bottom) / 2); return !!t && (t === e || e.contains(t)); };
  const sim = document.querySelector('.simulation-controls'), nav = document.getElementById('planet-nav'), side = document.getElementById('side-ui'), intro = body.querySelector(':scope > p'), h2 = root.querySelector('h2'), eyebrow = root.querySelector('.learn-eyebrow');
  const simShown = getComputedStyle(sim).visibility !== 'hidden' && getComputedStyle(sim).display !== 'none';
  const cap = parseFloat(getComputedStyle(root).maxHeight), need = r(header).height + body.scrollHeight + 2; // + the panel's two 1 px borders
  const lines = e => Math.round(r(e).height / parseFloat(getComputedStyle(e).lineHeight));
  const items = cards.map(c => { const h3 = c.querySelector('h3'), desc = c.querySelector('p:not([class])'), dur = c.querySelector('.learn-duration'), btn = c.querySelector('button'), badge = c.querySelector('.learn-topic-badge');
    const parts = [h3, desc, dur, btn, badge].filter(shown), rects = parts.map(r), cr = r(c);
    return { title: h3.textContent, description: desc?.textContent ?? null, duration: dur?.textContent ?? null, button: btn?.textContent ?? null, badge: shown(badge), card: box(cr), cardInView: inView(c), buttonInView: !!btn && inView(btn), buttonClickable: !!btn && clickable(btn),
      buttonBox: btn ? box(r(btn)) : null, titleLines: lines(h3), descLines: desc ? lines(desc) : 0,
      clipped: parts.some(e => e.scrollWidth > e.clientWidth + 1 || e.scrollHeight > e.clientHeight + 1), overlap: rects.some((x, i) => rects.slice(i + 1).some(y => hit(x, y))),
      inside: rects.every(x => x.left >= cr.left - 0.5 && x.right <= cr.right + 0.5 && x.top >= cr.top - 0.5 && x.bottom <= cr.bottom + 0.5),
      sameRow: !!btn && !!dur && r(dur).top >= r(btn).top - 0.5 && r(dur).bottom <= r(btn).bottom + 0.5, buttonGapBelow: btn ? Math.round((cr.bottom - r(btn).bottom) * 10) / 10 : null }; });
  return { view: [innerWidth, innerHeight, Math.round(window.visualViewport?.width ?? -1), Math.round(window.visualViewport?.height ?? -1)], home: root.classList.contains('learn-home'), heading: h2.textContent, headingShown: shown(h2), eyebrow: eyebrow.textContent, eyebrowShown: shown(eyebrow),
    headerOneLine: Math.abs((r(h2).top + r(h2).bottom) / 2 - (r(eyebrow).top + r(eyebrow).bottom) / 2) < 12, intro: intro.textContent, introShown: shown(intro), close: shown(root.querySelector('.learn-close')),
    cols: getComputedStyle(grid).gridTemplateColumns.split(' ').length, rows: new Set(cards.map(c => Math.round(r(c).top))).size, items, panel: box(p), cap: Math.round(cap), need: Math.round(need), spare: Math.round(cap - need),
    bodyScrolls: body.scrollHeight > body.clientHeight + 1, bodyOverflowY: getComputedStyle(body).overflowY, hOverflow: document.documentElement.scrollWidth > innerWidth + 1 || body.scrollWidth > body.clientWidth + 1,
    panelInWindow: p.top >= -0.5 && p.bottom <= viewH + 0.5 && p.left >= -0.5 && p.right <= viewW + 0.5, navGap: Math.round(p.top - r(nav).bottom), bottomGap: Math.round(viewH - p.bottom), overlapsNav: hit(p, r(nav)), overlapsSide: hit(p, r(side)), navShown: shown(nav),
    sim: simShown, simInert: sim.inert, simOverlap: simShown && hit(p, r(sim)),
    fonts: { h2: getComputedStyle(h2).fontSize, title: getComputedStyle(cards[0].querySelector('h3')).fontSize, description: getComputedStyle(cards[0].querySelector('p:not([class])')).fontSize, duration: getComputedStyle(cards[0].querySelector('.learn-duration')).fontSize,
      button: getComputedStyle(cards[0].querySelector('button')).fontSize, eyebrow: getComputedStyle(eyebrow).fontSize, family: getComputedStyle(cards[0]).fontFamily, descriptionLineHeight: getComputedStyle(cards[0].querySelector('p:not([class])')).lineHeight } };
};
// What assistive technology is offered inside the catalogue: no element hidden from view may remain exposed.
const HIDDEN_BUT_EXPOSED = () => [...document.querySelectorAll('#learn-root .learn-topic-badge, #learn-root .learn-body > p')].filter(e => { const s = getComputedStyle(e); return (e.getBoundingClientRect().height === 0 || s.visibility === 'hidden') && s.display !== 'none'; }).length;
// Tab through the whole page once from the heading: the focus stops, in order.
async function tabCycle(pg, max = 40) {
  await pg.evaluate(() => document.getElementById('learn-heading').focus());
  const stops = [];
  for (let i = 0; i < max; i++) {
    await pg.keyboard.press('Tab'); await pg.waitForTimeout(40);
    const s = await pg.evaluate(() => { const e = document.activeElement; if (!e || e === document.body) return { body: true }; const st = getComputedStyle(e), r = e.getBoundingClientRect(), body = document.querySelector('#learn-root .learn-body').getBoundingClientRect();
      return { text: (e.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 30), card: e.closest('.learn-topic')?.querySelector('h3').textContent ?? null, inSim: !!e.closest('.simulation-controls'), inLearn: !!e.closest('#learn-root'), ring: st.outlineStyle !== 'none' && parseFloat(st.outlineWidth) > 0,
        shown: !e.closest('.learn-topic') || (r.top >= body.top - 0.5 && r.bottom <= Math.min(body.bottom, innerHeight) + 0.5) }; });
    if (s.body) break;
    stops.push(s);
    if (stops.length > 3 && s.text === stops[0].text && s.card === stops[0].card) { stops.pop(); break; }
  }
  return stops;
}
const simState = pg => pg.evaluate(() => { const s = document.querySelector('.simulation-controls'), c = getComputedStyle(s), b = document.getElementById('pause-btn').getBoundingClientRect(), t = document.elementFromPoint((b.left + b.right) / 2, (b.top + b.bottom) / 2);
  return { shown: c.visibility !== 'hidden' && c.display !== 'none', inert: s.inert, usable: !!t && !!t.closest('.simulation-controls') }; });

(async () => {
  const browser = await chromium.launch();
  const content = await (async () => { const { pg, context } = await open(browser, 1366, 768); const c = await pg.evaluate(() => LearnContent.topics.map(t => ({ id: t.id, title: t.title, description: t.description, minutes: t.minutes, first: LearnContent.lessons.find(l => l.id === t.id)?.steps[0].title ?? null }))); await context.close(); return c; })();
  check(`content: six topics, each with a lesson`, content.length === 6 && content.every(t => t.first), JSON.stringify(content.map(t => t.id)));

  // 1. Desktop targets.
  for (const [w, h] of DESKTOP) {
    const tag = `${w}x${h}`, { pg, errors, context } = await open(browser, w, h);
    // Focus sits on a simulation control when the catalogue opens: it must not stay there.
    await pg.focus('#pause-btn'); await pg.evaluate(() => document.getElementById('learn-nav').click()); await pg.waitForTimeout(450);
    const c = await pg.evaluate(`(${CATALOGUE})()`), focus = await pg.evaluate(() => ({ heading: document.activeElement === document.getElementById('learn-heading'), inSim: !!document.activeElement.closest('.simulation-controls') }));
    await pg.screenshot({ path: path.join(OUT, `${tag}-catalogue.png`) });
    check(`${tag}: measured in the page's visible viewport (inner ${c.view[0]}×${c.view[1]}, visual ${c.view[2]}×${c.view[3]})`, c.view.join() === [w, h, w, h].join(), JSON.stringify(c.view));
    check(`${tag}: the catalogue is open with its heading "Čo dnes objavíme?", the eyebrow beside it and "Zavrieť"`, c.home && c.heading === 'Čo dnes objavíme?' && c.headingShown && c.eyebrowShown && /Uč sa/.test(c.eyebrow) && c.headerOneLine && c.close, JSON.stringify({ heading: c.heading, eyebrow: c.eyebrow, oneLine: c.headerOneLine }));
    check(`${tag}: three columns, two rows, six cards in the lesson order`, c.cols === 3 && c.rows === 2 && c.items.map(i => i.title).join('|') === content.map(t => t.title).join('|'), JSON.stringify({ cols: c.cols, rows: c.rows, titles: c.items.map(i => i.title) }));
    check(`${tag}: every card keeps its full description, its duration and "Začať lekciu"; the redundant badge is not shown`, c.items.every((i, k) => i.description === content[k].description && i.duration === `Približne ${content[k].minutes} min` && i.button === 'Začať lekciu' && !i.badge), JSON.stringify(c.items.map(i => [i.description, i.duration, i.button, i.badge])));
    check(`${tag}: all six cards and all six buttons are fully visible and clickable`, c.items.every(i => i.cardInView && i.buttonInView && i.buttonClickable) && c.panelInWindow, JSON.stringify(c.items.map(i => [i.cardInView, i.buttonInView, i.buttonClickable])));
    check(`${tag}: no catalogue scrolling; ${c.need} px needed of ${c.cap} px available, ${c.spare} px spare (at least ${MARGIN})`, !c.bodyScrolls && c.spare >= MARGIN, JSON.stringify({ need: c.need, cap: c.cap, spare: c.spare, scrolls: c.bodyScrolls }));
    check(`${tag}: no text is clipped, nothing inside a card overlaps or leaves its card; no horizontal overflow (titles ${c.items.map(i => i.titleLines).join('')} lines, descriptions ${c.items.map(i => i.descLines).join('')} lines)`, c.items.every(i => !i.clipped && !i.overlap && i.inside) && !c.hOverflow, JSON.stringify(c.items.map(i => [i.clipped, i.overlap, i.inside])));
    const rowsOf = [c.items.slice(0, 3), c.items.slice(3)];
    check(`${tag}: buttons are 48 px tall (at least 44), share the bottom row with the duration and line up along the bottom of each row`, c.items.every(i => i.buttonBox[3] >= 44 && Math.round(i.buttonBox[3]) === 48 && i.buttonBox[2] >= 44 && i.sameRow) && rowsOf.every(row => new Set(row.map(i => Math.round(i.buttonBox[1] + i.buttonBox[3]))).size === 1 && new Set(row.map(i => i.buttonGapBelow)).size === 1), JSON.stringify(c.items.map(i => [i.buttonBox, i.sameRow, i.buttonGapBelow])));
    check(`${tag}: the planet bar stays visible, ${c.navGap} px above the catalogue; no overlap with it or the sidebar; ${c.bottomGap} px to the window's bottom edge`, c.navShown && !c.overlapsNav && !c.overlapsSide && c.navGap >= 8 && c.bottomGap >= 16, JSON.stringify({ navGap: c.navGap, bottomGap: c.bottomGap, panel: c.panel }));
    check(`${tag}: font sizes are unchanged (heading 23 px, titles 24 px, descriptions 16 px, durations 14 px, buttons 16 px, eyebrow 13 px)`, c.fonts.h2 === '23px' && c.fonts.title === '24px' && c.fonts.description === '16px' && c.fonts.duration === '14px' && c.fonts.button === '16px' && c.fonts.eyebrow === '13px', JSON.stringify(c.fonts));
    const veryShort = h <= 700;
    check(`${tag}: ${veryShort ? 'below 700 px the introduction is hidden and descriptions use line-height 1.5' : 'the introduction is shown and descriptions keep line-height 1.6'}`, c.introShown === !veryShort && c.fonts.descriptionLineHeight === (veryShort ? '24px' : '25.6px') && /^Vyber si krátku lekciu/.test(c.intro), JSON.stringify({ intro: c.introShown, lineHeight: c.fonts.descriptionLineHeight }));
    check(`${tag}: nothing hidden from view is left exposed to assistive technology (hidden badges and introduction use display: none)`, await pg.evaluate(`(${HIDDEN_BUT_EXPOSED})()`) === 0);
    check(`${tag}: the simulation controls are hidden while the catalogue is open and do not overlap it; focus moved from them to the heading`, !c.sim && !c.simOverlap && focus.heading && !focus.inSim, JSON.stringify({ sim: c.sim, focus }));
    const stops = await tabCycle(pg), cardStops = stops.filter(s => s.card);
    check(`${tag}: Tab reaches "Zavrieť", then the six "Začať lekciu" buttons in card order, each visible with a focus ring; no stop inside the hidden simulation controls`,
      stops[0]?.text === 'Zavrieť' && cardStops.map(s => s.card).join('|') === content.map(t => t.title).join('|') && cardStops.every(s => s.text === 'Začať lekciu' && s.ring && s.shown) && stops.every(s => !s.inSim) && stops.every(s => s.ring), JSON.stringify(stops.map(s => `${s.card ?? ''}:${s.text}${s.inSim ? ' SIM' : ''}`)));

    // Each card starts its own lesson; the controls return in the lesson and hide again in the catalogue.
    const launches = [];
    for (let k = 0; k < 6; k++) {
      if (k === 0) { await pg.evaluate(() => document.querySelectorAll('.learn-topic button')[0].focus()); await pg.keyboard.press('Enter'); } // once by keyboard
      else { const b = await pg.evaluate(k => { const x = document.querySelectorAll('.learn-topic button')[k].getBoundingClientRect(); return { x: (x.left + x.right) / 2, y: (x.top + x.bottom) / 2 }; }, k); await pg.mouse.click(b.x, b.y); }
      await pg.waitForTimeout(450);
      const inLesson = await pg.evaluate(() => ({ lesson: Learn.state.lesson, step: Learn.state.step, heading: document.getElementById('learn-heading').textContent, panel: document.getElementById('learn-root').className.split(' ')[0] })), sim = await simState(pg);
      if (k === 0 && tag === '1366x657') await pg.screenshot({ path: path.join(OUT, `${tag}-lesson-first-step.png`) });
      await pg.evaluate(() => [...document.querySelectorAll('#learn-root .learn-footer button')].find(b => b.textContent.trim() === 'Témy').click()); await pg.waitForTimeout(350);
      launches.push({ ok: inLesson.lesson === content[k].id && inLesson.step === 0 && inLesson.heading === content[k].first && inLesson.panel === 'learn-panel', sim, back: !(await simState(pg)).shown && await pg.evaluate(() => document.getElementById('learn-root').classList.contains('learn-home')), inLesson });
    }
    check(`${tag}: each of the six cards starts its own lesson at its first step`, launches.every(l => l.ok), JSON.stringify(launches.map(l => l.inLesson)));
    check(`${tag}: in every lesson's first step the simulation controls are back (visible, not inert, clickable); "Témy" hides them again`, launches.every(l => l.sim.shown && !l.sim.inert && l.sim.usable && l.back), JSON.stringify(launches.map(l => [l.sim, l.back])));

    // Leaving the catalogue: Explore, Quiz, "Zavrieť"; then repeated switching.
    await pg.evaluate(() => document.getElementById('explore-nav').click()); await pg.waitForTimeout(350);
    const explore = { sim: await simState(pg), learn: await pg.evaluate(() => Learn.active), hidden: await pg.evaluate(() => document.getElementById('learn-root').hidden) };
    if (tag === '1366x657') await pg.screenshot({ path: path.join(OUT, `${tag}-explore.png`) });
    check(`${tag}: "Objavuj" from the catalogue restores the simulation controls (visible, not inert, clickable); Learn is closed`, explore.sim.shown && !explore.sim.inert && explore.sim.usable && !explore.learn && explore.hidden, JSON.stringify(explore));
    const pause = await pg.evaluate(() => { const before = areOrbitsActive; document.getElementById('pause-btn').click(); const mid = areOrbitsActive; document.getElementById('pause-btn').click(); return { before, mid, after: areOrbitsActive }; });
    check(`${tag}: the restored pause button works (motion toggles and returns)`, pause.mid === !pause.before && pause.after === pause.before, JSON.stringify(pause));
    await pg.evaluate(() => document.getElementById('learn-nav').click()); await pg.waitForTimeout(300); await pg.evaluate(() => document.getElementById('quiz-nav').click()); await pg.waitForTimeout(400);
    const quiz = await pg.evaluate(() => ({ quiz: isQuizMode, learn: Learn.active, sim: getComputedStyle(document.querySelector('.simulation-controls')).visibility, question: document.getElementById('quiz-question').innerText }));
    await pg.evaluate(() => stopQuiz()); await pg.waitForTimeout(350); const afterQuiz = await simState(pg);
    check(`${tag}: "Kvíz" from the catalogue starts the Quiz as before (its own rule hides the controls there); ending the Quiz restores them`, quiz.quiz && !quiz.learn && quiz.sim === 'hidden' && /^Nájdi planétu:/.test(quiz.question) && afterQuiz.shown && !afterQuiz.inert && afterQuiz.usable, JSON.stringify({ quiz, afterQuiz }));
    await pg.evaluate(() => document.getElementById('learn-nav').click()); await pg.waitForTimeout(300); await pg.evaluate(() => document.querySelector('#learn-root .learn-close').click()); await pg.waitForTimeout(300);
    const closed = { sim: await simState(pg), learn: await pg.evaluate(() => Learn.active), focus: await pg.evaluate(() => document.activeElement.id) };
    check(`${tag}: "Zavrieť" in the catalogue closes Learn, restores the controls and returns focus to the Explore button`, closed.sim.shown && !closed.sim.inert && closed.sim.usable && !closed.learn && closed.focus === 'explore-nav', JSON.stringify(closed));
    const seq = await pg.evaluate(async () => { const raf = () => new Promise(r => requestAnimationFrame(r)), vis = () => getComputedStyle(document.querySelector('.simulation-controls')).visibility, log = [];
      for (let i = 0; i < 6; i++) { Learn.enter(); await raf(); log.push(vis() === 'hidden'); document.querySelectorAll('.learn-topic button')[i].click(); await raf(); log.push(vis() === 'visible'); Learn.home(); await raf(); log.push(vis() === 'hidden'); startQuiz(); await raf(); stopQuiz(); await raf(); log.push(vis() === 'visible'); Learn.enter(); await raf(); showExploration(); await raf(); log.push(vis() === 'visible'); }
      return { log, learn: Learn.active, quiz: isQuizMode || isQuizResults, inert: document.querySelector('.simulation-controls').inert, cls: document.body.className }; });
    check(`${tag}: thirty mode switches (catalogue, lesson, catalogue, Quiz, Explore) leave the controls in the right state every time and visible at the end`, seq.log.length === 30 && seq.log.every(Boolean) && !seq.learn && !seq.quiz && !seq.inert && (await simState(pg)).usable, JSON.stringify(seq));
    check(`${tag}: no page or console errors`, errors.length === 0, errors.join(' | '));
    await context.close();
  }

  // 2. Desktop windows below the feasible height: the catalogue fits or scrolls; nothing becomes unreachable.
  for (const [w, h] of SHORT) {
    const tag = `${w}x${h}`, { pg, errors, context } = await open(browser, w, h);
    await pg.evaluate(() => Learn.enter()); await pg.waitForTimeout(450);
    const c = await pg.evaluate(`(${CATALOGUE})()`);
    await pg.screenshot({ path: path.join(OUT, `${tag}-catalogue.png`) });
    const fits = !c.bodyScrolls && c.items.every(i => i.cardInView && i.buttonInView);
    const reach = await pg.evaluate(() => [...document.querySelectorAll('.learn-topic')].map(card => { const out = {}; for (const [name, e] of [['title', card.querySelector('h3')], ['description', card.querySelector('p:not([class])')], ['button', card.querySelector('button')]]) { e.scrollIntoView({ block: 'nearest' });
      const r = e.getBoundingClientRect(), b = document.querySelector('#learn-root .learn-body').getBoundingClientRect(), t = document.elementFromPoint((r.left + r.right) / 2, (r.top + r.bottom) / 2); out[name] = r.top >= b.top - 0.5 && r.bottom <= Math.min(b.bottom, innerHeight) + 0.5 && !!t && (t === e || e.contains(t)); } return out; }));
    await pg.evaluate(() => { document.querySelector('#learn-root .learn-body').scrollTop = 0; });
    check(`${tag}: the 3 × 2 grid is kept; the catalogue ${fits ? `still fits (${c.spare} px spare)` : `scrolls (${-c.spare} px more than the window allows, overflow-y ${c.bodyOverflowY})`}; the panel stays inside the window under the planet bar`, c.cols === 3 && c.rows === 2 && (fits || (c.bodyScrolls && /auto|scroll/.test(c.bodyOverflowY))) && c.panelInWindow && !c.overlapsNav && !c.hOverflow, JSON.stringify({ spare: c.spare, scrolls: c.bodyScrolls, panel: c.panel }));
    check(`${tag}: every title, description and button can be brought fully into view and clicked; no text is clipped`, reach.length === 6 && reach.every(x => x.title && x.description && x.button) && c.items.every(i => !i.clipped && !i.overlap && i.inside), JSON.stringify(reach));
    const stops = await tabCycle(pg), cardStops = stops.filter(s => s.card);
    check(`${tag}: Tab reaches all six buttons in card order and scrolls each fully into view`, cardStops.map(s => s.card).join('|') === content.map(t => t.title).join('|') && cardStops.every(s => s.shown && s.ring) && stops.every(s => !s.inSim), JSON.stringify(stops.map(s => `${s.card ?? ''}:${s.text}:${s.shown}`)));
    await pg.evaluate(() => { const b = document.querySelectorAll('.learn-topic button')[5]; b.scrollIntoView({ block: 'nearest' }); b.click(); }); await pg.waitForTimeout(400);
    check(`${tag}: the last card, reached by scrolling, starts its lesson`, await pg.evaluate(id => Learn.state.lesson === id, content[5].id));
    check(`${tag}: no page or console errors`, errors.length === 0, errors.join(' | '));
    await context.close();
  }

  // 3. Tablet and phone layouts: identical with and without the Phase 6H.8.C rules.
  for (const [w, h, cols] of SMALL) {
    const tag = `${w}x${h}`, layouts = [];
    for (const without of [false, true]) {
      const { pg, errors, context } = await open(browser, w, h, without);
      await pg.evaluate(() => Learn.enter()); await pg.waitForTimeout(450);
      const c = await pg.evaluate(`(${CATALOGUE})()`);
      if (!without) {
        await pg.screenshot({ path: path.join(OUT, `${tag}-catalogue.png`) });
        // A button counts as reachable when it scrolls fully into the list area and can be clicked there. On short landscape (844×390)
        // the list area is lower than a button (an existing limitation, unchanged by Phase 6H.8.C): there the button must fill the area
        // from top to bottom and be clickable at the area's centre.
        const reach = await pg.evaluate(() => [...document.querySelectorAll('.learn-topic button')].map(e => { e.scrollIntoView({ block: 'nearest' }); const r = e.getBoundingClientRect(), b = document.querySelector('#learn-root .learn-body').getBoundingClientRect();
          if (b.height >= r.height) { const t = document.elementFromPoint((r.left + r.right) / 2, (r.top + r.bottom) / 2); return r.top >= b.top - 0.5 && r.bottom <= Math.min(b.bottom, innerHeight) + 0.5 && !!t && (t === e || e.contains(t)); }
          const t = document.elementFromPoint((r.left + r.right) / 2, (b.top + b.bottom) / 2); return r.top <= b.top + 0.5 && r.bottom >= b.bottom - 0.5 && !!t && (t === e || e.contains(t)); }));
        const area = await pg.evaluate(() => Math.round(document.querySelector('#learn-root .learn-body').getBoundingClientRect().height));
        check(`${tag}: ${cols} column${cols > 1 ? 's' : ''} as before, badges and introduction shown, the list scrolls (list area ${area} px) and every button can be scrolled into view and clicked; buttons at least 44 px`, c.cols === cols && c.items.every(i => i.badge && i.buttonBox[3] >= 44) && c.introShown && c.bodyScrolls && reach.length === 6 && reach.every(Boolean) && !c.hOverflow, JSON.stringify({ cols: c.cols, reach, intro: c.introShown, area }));
        check(`${tag}: every card still has its title, full description, duration and button in order`, c.items.every((i, k) => i.title === content[k].title && i.description === content[k].description && i.duration === `Približne ${content[k].minutes} min` && i.button === 'Začať lekciu'));
        await pg.evaluate(() => { const b = document.querySelectorAll('.learn-topic button')[4]; b.scrollIntoView({ block: 'nearest' }); b.click(); }); await pg.waitForTimeout(400);
        check(`${tag}: a card reached by scrolling starts its lesson`, await pg.evaluate(id => Learn.state.lesson === id, content[4].id));
        check(`${tag}: no page or console errors`, errors.length === 0, errors.join(' | '));
      }
      layouts.push(JSON.stringify(c));
      await context.close();
    }
    check(`${tag}: the catalogue layout is identical with and without the Phase 6H.8.C rules (positions, sizes, fonts, visibility, simulation controls)`, layouts[0] === layouts[1], (() => { const a = JSON.parse(layouts[0]), b = JSON.parse(layouts[1]); return Object.keys(a).filter(k => JSON.stringify(a[k]) !== JSON.stringify(b[k])).map(k => `${k}: ${JSON.stringify(a[k]).slice(0, 120)} ≠ ${JSON.stringify(b[k]).slice(0, 120)}`).join(' ; '); })());
  }
  await browser.close(); server.close();
  console.log(`\n${passes} passed, ${failures} failed`);
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); server.close(); process.exit(1); });
