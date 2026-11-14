// Phase 6H.8.B summary harness. The real lessons (no fixture): every lesson's summary keeps its three actions in the panel footer.
// Six viewports, including the visible heights of a real browser window on a 1366×768 laptop (1366×657) and 1280×720.
// - The actions ("Späť na témy", "Objavuj", "Otestuj sa") are in the footer once, never in the scrolling body, and never over the text.
// - Desktop and phone portrait: all three fully visible and clickable without scrolling. Short landscape (844×390): reached by
//   scrolling the panel (approved limitation), then fully visible.
// - Keyboard: focus starts on the heading; Tab reaches the three actions in reading order; Enter activates them.
// - Each action does what it did before: back to the topics, back to Explore, start the Quiz.
// - The light lesson: five summary ideas, the new 15-second transition and the final question's wording.
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const ENV = require('./env'), ROOT = ENV.ROOT, OUT = ENV.out('summary68'), PORT = Number(process.env.PORT || 8968);
const server = http.createServer((q, r) => { const u = decodeURIComponent(q.url.split('?')[0]); fs.readFile(path.join(ROOT, u === '/' ? 'index.html' : u), (e, d) => { if (e) { r.writeHead(404); r.end(); } else r.end(d); }); }).listen(PORT);
let failures = 0, passes = 0;
const check = (label, ok, detail = '') => { ok ? passes++ : failures++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${!ok && detail ? '  — ' + String(detail).slice(0, 900) : ''}`); };
const VIEWPORTS = [[1366, 768], [1366, 657], [1280, 720], [390, 844], [390, 667], [844, 390]];
const ACTION_VIEWPORTS = ['1366x768', '390x844', '844x390']; // every action of every lesson is exercised here
const LABELS = ['Späť na témy', 'Objavuj', 'Otestuj sa'];
const TRANSITION = 'Za sekundu svetlo prešlo asi štyri pätiny cesty k Mesiacu. A za 15 sekúnd?';
const ANSWER = 'Asi štyri pätiny cesty k Mesiacu.';
const FEEDBACK = 'Správne! Za jednu sekundu svetlo prejde takmer 300 000 km – približne štyri pätiny cesty zo Zeme k Mesiacu.';
const IDEAS = ['Svetlo preletí za sekundu takmer 300 000 km.', 'Za 1 sekundu svetlo prejde asi štyri pätiny cesty k Mesiacu.', 'Za 15 sekúnd prejde vzdialenosť približne 11,7-krát väčšiu, než je vzdialenosť Zem–Mesiac.',
  'Zo Slnka k Zemi letí asi 8 minút, k Neptúnu viac ako 4 hodiny.', 'Zrýchlené prehrávanie nemení rýchlosť svetla.'];

async function open(browser, w, h) {
  const context = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: w < 900 });
  const pg = await context.newPage(), errors = [];
  pg.on('pageerror', e => errors.push(e.message)); pg.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await pg.goto(`http://localhost:${PORT}/`); await pg.waitForTimeout(600);
  await pg.fill('#activation-code', 'NGV-2025'); await pg.evaluate(() => checkCode()); await pg.waitForTimeout(2400);
  return { pg, errors, context };
}
const startLesson = async (pg, id) => {
  await pg.evaluate(id => { Learn.enter(); const title = LearnContent.topics.find(t => t.id === id).title; [...document.querySelectorAll('.learn-topic')].find(c => c.querySelector('h3').textContent === title).querySelector('button').click(); }, id);
  await pg.waitForTimeout(300);
};
// One learner step forward through the real controls: the right answer and "Overiť", the right group, or the footer's forward button.
// Returns the step type it acted on; 'summary' when the summary is open (nothing is clicked there).
const forward = pg => pg.evaluate(() => {
  const s = Learn.state, step = LearnContent.lessons.find(l => l.id === s.lesson).steps[s.step], root = document.getElementById('learn-root');
  if (step.type === 'summary') return 'summary';
  if (step.type === 'question' && s.feedback !== 'correct') { root.querySelector(`.learn-answer input[value="${step.correct}"]`).click(); root.querySelector('[data-check]').click(); return 'answered'; }
  if (step.type === 'classify' && step.items[s.stop] && s.feedback !== 'correct') { root.querySelector(`[data-group="${step.items[s.stop].group}"]`).click(); return 'classified'; }
  root.querySelector('.learn-footer .learn-primary').click(); return step.type;
});
// To the summary; `at(stepIndex, state)` is called once per step before anything is clicked there, and after a question is answered.
async function toSummary(pg, id, at) {
  await startLesson(pg, id);
  let seen = '';
  for (let guard = 0; guard < 120; guard++) {
    const s = await pg.evaluate(() => ({ step: Learn.state.step, feedback: Learn.state.feedback, stop: Learn.state.stop }));
    const key = `${s.step}|${s.feedback}`;
    if (at && key !== seen && s.stop === 0) { await pg.waitForTimeout(350); await at(s.step, s.feedback); }
    seen = key;
    if (await forward(pg) === 'summary') { await pg.waitForTimeout(450); return true; }
    await pg.waitForTimeout(at ? 120 : 60);
  }
  return false;
}
// The summary as laid out now. Rectangles are compared with the page's own visible viewport (innerHeight and visualViewport).
const SUMMARY = () => {
  const root = document.getElementById('learn-root'), body = root.querySelector('.learn-body'), footers = [...root.querySelectorAll('.learn-footer')], footer = footers[0];
  const p = root.getBoundingClientRect(), b = body.getBoundingClientRect(), f = footer?.getBoundingClientRect(), viewH = Math.min(innerHeight, window.visualViewport?.height ?? innerHeight), viewW = Math.min(innerWidth, window.visualViewport?.width ?? innerWidth);
  const buttons = footer ? [...footer.querySelectorAll('button')].map(e => { const r = e.getBoundingClientRect(), hit = document.elementFromPoint((r.left + r.right) / 2, (r.top + r.bottom) / 2);
    return { text: e.textContent.trim(), top: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), primary: e.classList.contains('learn-primary'), disabled: e.disabled,
      inView: r.top >= Math.max(0, p.top) - 0.5 && r.bottom <= Math.min(viewH, p.bottom) + 0.5 && r.left >= Math.max(0, p.left) - 0.5 && r.right <= Math.min(viewW, p.right) + 0.5, hit: !!hit && (hit === e || e.contains(hit)) }; }) : [];
  const overlap = (a, c) => a.left < c.right - 0.5 && a.right > c.left + 0.5 && a.top < c.bottom - 0.5 && a.bottom > c.top + 0.5;
  const rects = footer ? [...footer.querySelectorAll('button')].map(e => e.getBoundingClientRect()) : [];
  const text = [...body.querySelectorAll('li, p')];
  return { heading: document.getElementById('learn-heading').textContent, focusOnHeading: document.activeElement === document.getElementById('learn-heading'), footers: footers.length, summaryFooter: !!footer?.classList.contains('learn-summary-actions'),
    buttons, bodyButtons: body.querySelectorAll('button').length, close: !!root.querySelector('.learn-close'), ideas: [...body.querySelectorAll('li')].map(li => li.textContent), text: body.querySelector('ul + p')?.textContent ?? '',
    rows: new Set(buttons.map(x => x.top)).size, buttonsOverlap: rects.some((a, i) => rects.slice(i + 1).some(c => overlap(a, c))),
    // The footer starts where the body ends: nothing of it lies over the summary text.
    footerBelowBody: !!f && f.top >= b.bottom - 0.5, textUnderFooter: !!f && text.some(e => { const r = e.getBoundingClientRect(), shown = { left: r.left, right: r.right, top: Math.max(r.top, b.top), bottom: Math.min(r.bottom, b.bottom) }; return shown.bottom > shown.top && overlap(shown, f); }), // only the part the body actually shows
    bodyScrolls: body.scrollHeight > body.clientHeight + 1, panelScrolls: root.scrollHeight > root.clientHeight + 1, panelInWindow: p.top >= -0.5 && p.bottom <= viewH + 0.5 && p.left >= -0.5 && p.right <= viewW + 0.5,
    spare: f ? Math.round(Math.min(viewH, p.bottom) - Math.max(...rects.map(r => r.bottom))) : null, bodyVisible: Math.round(b.height), panel: [Math.round(p.top), Math.round(p.height)],
    hOverflow: document.documentElement.scrollWidth > innerWidth + 1, view: [innerWidth, innerHeight, Math.round(window.visualViewport?.height ?? -1)], layout: root.dataset.layout ?? null };
};
// The last line of the summary can be brought fully into view above the footer (the text stays readable by scrolling).
const LAST_TEXT = () => {
  const root = document.getElementById('learn-root'), body = root.querySelector('.learn-body'), last = body.querySelector('ul + p'), footer = root.querySelector('.learn-footer');
  last.scrollIntoView({ block: 'nearest' });
  const r = last.getBoundingClientRect(), b = body.getBoundingClientRect(), p = root.getBoundingClientRect(), f = footer.getBoundingClientRect();
  const panelScrolls = root.scrollHeight > root.clientHeight + 1, hit = document.elementFromPoint(r.left + 8, r.bottom - 4);
  const ok = r.top >= Math.max(p.top, panelScrolls ? p.top : b.top) - 0.5 && r.bottom <= Math.min(innerHeight, p.bottom, panelScrolls ? p.bottom : b.bottom) + 0.5 && !(r.bottom > f.top + 0.5 && r.top < f.bottom - 0.5) && !!hit && (hit === last || last.contains(hit));
  body.scrollTop = 0; root.scrollTop = 0;
  return ok;
};
// Tab from the heading: the order in which the three actions receive focus, and whether each is fully visible while focused.
async function tabActions(pg) {
  await pg.evaluate(() => { document.getElementById('learn-root').scrollTop = 0; document.getElementById('learn-heading').focus(); });
  const order = [];
  for (let i = 0; i < 12 && order.length < 3; i++) {
    await pg.keyboard.press('Tab'); await pg.waitForTimeout(60);
    const f = await pg.evaluate(() => { const e = document.activeElement, root = document.getElementById('learn-root'); if (!e || !e.closest('.learn-footer')) return e && root.contains(e) ? null : { outside: true };
      const r = e.getBoundingClientRect(), p = root.getBoundingClientRect(), header = root.querySelector('.learn-header'), top = getComputedStyle(header).position === 'sticky' ? header.getBoundingClientRect().bottom : p.top, s = getComputedStyle(e);
      return { text: e.textContent.trim(), shown: r.top >= Math.max(0, top) - 0.5 && r.bottom <= Math.min(innerHeight, p.bottom) + 0.5, ring: s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0 }; });
    if (f?.outside) break;
    if (f) order.push(f);
  }
  return order;
}

(async () => {
  const browser = await chromium.launch();
  const lessons = ['nasa-slnecna-sustava', 'slnko', 'planety', 'zem-mesiac', 'obri', 'pohyb'];
  for (const [w, h] of VIEWPORTS) {
    const tag = `${w}x${h}`, { pg, errors, context } = await open(browser, w, h), landscape = h < 500;
    const shot = name => pg.screenshot({ path: path.join(OUT, `${tag}-${name}.png`) });
    const view = await pg.evaluate(() => [innerWidth, innerHeight, Math.round(window.visualViewport.width), Math.round(window.visualViewport.height), document.documentElement.clientWidth, document.documentElement.clientHeight]);
    check(`${tag}: measurements use the page's visible viewport (inner ${view[0]}×${view[1]}, visual ${view[2]}×${view[3]})`, view[0] === w && view[1] === h && view[2] === w && view[3] === h && view[4] === w && view[5] === h, JSON.stringify(view));
    check(`${tag}: all six topics are available`, await pg.evaluate(ids => { Learn.enter(); const ok = ids.every(id => LearnContent.lessons.some(l => l.id === id)) && document.querySelectorAll('.learn-topic button').length === 6; Learn.leave(); return ok; }, lessons));

    for (const id of lessons) {
      const light = id === 'pohyb', probe = {};
      const reached = await toSummary(pg, id, !light ? null : async (step, feedback) => {
        if (step === 2 && feedback === null) { // the 15-second experiment, ready: the new transition, "Vyšli svetlo" in view
          probe.fifteen = await pg.evaluate(() => { const root = document.getElementById('learn-root'), p = root.getBoundingClientRect(), tr = [...root.querySelectorAll('.learn-light-box *')].find(e => e.children.length === 0 && /A za 15 sekúnd\?/.test(e.textContent)),
            a = root.querySelector('[data-focus="light-primary"]'), r = a.getBoundingClientRect(), t = tr?.getBoundingClientRect(), s = lightStage.state();
            return { text: tr?.textContent ?? null, lines: tr ? Math.round(t.height / parseFloat(getComputedStyle(tr).lineHeight)) : 0, shown: !!tr && t.top >= p.top - 0.5 && t.bottom <= Math.min(innerHeight, p.bottom) + 0.5, action: a.textContent.trim(),
              actionInView: r.top >= p.top - 0.5 && r.bottom <= Math.min(innerHeight, p.bottom) + 0.5, journey: s.journey, phase: s.phase, old: /takmer doletelo/.test(root.textContent) }; });
          await shot('pohyb-15s-ready');
        }
        if (step === 6 && feedback === null) { probe.options = await pg.evaluate(() => [...document.querySelectorAll('#learn-root .learn-answer')].map(l => ({ text: l.textContent.trim(), h: Math.round(l.getBoundingClientRect().height) }))); await shot('pohyb-question'); }
        if (step === 6 && feedback === 'correct') {
          probe.feedback = await pg.evaluate(() => ({ text: document.querySelector('#learn-root .learn-feedback')?.textContent ?? '', answer: Learn.state.answer, next: !document.querySelector('.learn-footer .learn-primary').disabled }));
          await pg.evaluate(() => document.querySelector('#learn-root .learn-feedback').scrollIntoView({ block: 'nearest' })); await shot('pohyb-question-feedback');
        }
      });
      check(`${tag} ${id}: the lesson runs to its summary through the real controls`, reached && await pg.evaluate(() => Learn.state.completed));
      if (!reached) { await pg.evaluate(() => Learn.leave()); continue; }
      const s = await pg.evaluate(`(${SUMMARY})()`), lesson = await pg.evaluate(id => LearnContent.lessons.find(l => l.id === id).steps.at(-1), id);
      await shot(`${id}-summary`);
      check(`${tag} ${id} summary "${s.heading}": focus starts on the heading; all ${lesson.ideas.length} ideas and the closing text are in the body`, s.focusOnHeading && s.heading === lesson.title && JSON.stringify(s.ideas) === JSON.stringify(lesson.ideas) && s.text === lesson.text, JSON.stringify({ focus: s.focusOnHeading, ideas: s.ideas }));
      check(`${tag} ${id} summary: one footer holds exactly "Späť na témy", "Objavuj", "Otestuj sa" (primary last, all enabled); no action is left in the body`, s.footers === 1 && s.summaryFooter && s.buttons.map(b => b.text).join() === LABELS.join() && s.buttons.map(b => b.primary).join() === 'false,false,true' && s.buttons.every(b => !b.disabled) && s.bodyButtons === 0, JSON.stringify(s.buttons));
      check(`${tag} ${id} summary: every action is at least 44 px in both directions; the actions do not overlap or leave the panel sideways; no page overflow`, s.buttons.every(b => b.w >= 44 && b.h >= 44) && !s.buttonsOverlap && !s.hOverflow, JSON.stringify(s.buttons));
      check(`${tag} ${id} summary: the footer starts below the scrolling text and covers none of it`, s.footerBelowBody && !s.textUnderFooter, JSON.stringify({ below: s.footerBelowBody, under: s.textUnderFooter }));
      if (!landscape) {
        check(`${tag} ${id} summary: all three actions fully visible and clickable without scrolling (${s.spare} px to spare; text area ${s.bodyVisible} px${s.bodyScrolls ? ', scrolls' : ''})`, s.buttons.length === 3 && s.buttons.every(b => b.inView && b.hit) && s.panelInWindow && !s.panelScrolls, JSON.stringify(s));
        if (w >= 1200) check(`${tag} ${id} summary: the three actions share one row in the desktop panel`, s.rows === 1, JSON.stringify(s.buttons));
      } else {
        // Short landscape: the whole panel scrolls (approved); after scrolling, each action is fully visible and clickable.
        const reach = await pg.evaluate(() => [...document.querySelectorAll('#learn-root .learn-footer button')].map(e => { e.scrollIntoView({ block: 'nearest' }); const r = e.getBoundingClientRect(), p = document.getElementById('learn-root').getBoundingClientRect(), hit = document.elementFromPoint((r.left + r.right) / 2, (r.top + r.bottom) / 2);
          return r.top >= p.top - 0.5 && r.bottom <= Math.min(innerHeight, p.bottom) + 0.5 && !!hit && (hit === e || e.contains(hit)); }));
        await shot(`${id}-summary-scrolled`);
        await pg.evaluate(() => { document.getElementById('learn-root').scrollTop = 0; });
        check(`${tag} ${id} summary: the panel scrolls (approved limitation) and brings each action fully into view on one row`, s.panelScrolls && reach.length === 3 && reach.every(Boolean) && s.rows === 1, JSON.stringify({ reach, rows: s.rows, panelScrolls: s.panelScrolls }));
      }
      check(`${tag} ${id} summary: the closing text can be read in full above the footer${s.bodyScrolls || s.panelScrolls ? ' by scrolling' : ''}`, await pg.evaluate(`(${LAST_TEXT})()`));
      const order = await tabActions(pg);
      check(`${tag} ${id} summary: Tab from the heading reaches "Späť na témy" → "Objavuj" → "Otestuj sa", each fully visible with a focus ring`, order.map(o => o.text).join() === LABELS.join() && order.every(o => o.shown && o.ring), JSON.stringify(order));

      if (light) {
        check(`${tag} pohyb summary: the five approved ideas, in order`, JSON.stringify(s.ideas) === JSON.stringify(IDEAS), JSON.stringify(s.ideas));
        const f = probe.fifteen ?? {};
        check(`${tag} pohyb 15 s ready: the transition reads "${TRANSITION}" (${f.lines} lines), is in view, and the old "takmer doletelo" wording is gone`, f.text === TRANSITION && f.shown && !f.old && f.journey === 'fifteen' && f.phase === 'ready', JSON.stringify(f));
        if (!landscape) check(`${tag} pohyb 15 s ready: "Vyšli svetlo" is in view without scrolling`, f.action === 'Vyšli svetlo' && f.actionInView, JSON.stringify(f));
        check(`${tag} pohyb final question: the three options are unchanged except the correct one, "${ANSWER}"; every option row is at least 44 px tall`, JSON.stringify((probe.options ?? []).map(o => o.text)) === JSON.stringify(['Až k Slnku.', 'Len na druhý koniec Slovenska.', ANSWER]) && probe.options.every(o => o.h >= 44), JSON.stringify(probe.options));
        check(`${tag} pohyb final question: choosing it is graded correct (id "mesiac"), shows the new feedback and unlocks "Dokončiť lekciu"`, probe.feedback?.text === FEEDBACK && probe.feedback.answer === 'mesiac' && probe.feedback.next, JSON.stringify(probe.feedback));
      }

      // The three actions. On the action viewports every lesson is checked; elsewhere the lesson is simply left.
      if (ACTION_VIEWPORTS.includes(tag)) {
        // 1. "Späť na témy", by keyboard (focus, Enter): the topic list, no lesson, nothing left behind.
        await pg.evaluate(() => [...document.querySelectorAll('#learn-root .learn-footer button')].find(b => b.textContent.trim() === 'Späť na témy').focus()); await pg.keyboard.press('Enter'); await pg.waitForTimeout(350);
        const topics = await pg.evaluate(() => ({ learn: Learn.active, lesson: Learn.inLesson, cards: document.querySelectorAll('.learn-topic').length, footer: document.querySelectorAll('#learn-root .learn-footer').length, focusInLearn: document.getElementById('learn-root').contains(document.activeElement), stages: comparisonStage.active || lightStage.active }));
        check(`${tag} ${id}: "Späť na témy" (Enter) opens the topic list: Learn stays open, no lesson, six cards, no footer or stage left, focus inside Learn`, topics.learn && !topics.lesson && topics.cards === 6 && topics.footer === 0 && topics.focusInLearn && !topics.stages, JSON.stringify(topics));
        // 2. "Objavuj", by a real click or tap at its position.
        await toSummary(pg, id);
        if (landscape) await pg.evaluate(() => [...document.querySelectorAll('#learn-root .learn-footer button')].find(b => b.textContent.trim() === 'Objavuj').scrollIntoView({ block: 'nearest' }));
        const pos = await pg.evaluate(() => { const r = [...document.querySelectorAll('#learn-root .learn-footer button')].find(b => b.textContent.trim() === 'Objavuj').getBoundingClientRect(); return { x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2 }; });
        if (w < 900) await pg.touchscreen.tap(pos.x, pos.y); else await pg.mouse.click(pos.x, pos.y);
        await pg.waitForTimeout(400);
        const explore = await pg.evaluate(() => ({ learn: Learn.active, hidden: document.getElementById('learn-root').hidden, quiz: isQuizMode || isQuizResults, stages: comparisonStage.active || lightStage.active, cls: document.body.className, focus: document.activeElement.id, current: document.getElementById('explore-nav').getAttribute('aria-current') }));
        check(`${tag} ${id}: "Objavuj" (${w < 900 ? 'tap' : 'click'} at its position) returns to Explore: Learn closed, no Quiz, no stage, focus on the Explore button`, !explore.learn && explore.hidden && !explore.quiz && !explore.stages && !/is-learn/.test(explore.cls) && explore.focus === 'explore-nav' && explore.current === 'page', JSON.stringify(explore));
        // 3. "Otestuj sa": the Quiz starts and Learn is closed.
        await toSummary(pg, id);
        await pg.evaluate(() => [...document.querySelectorAll('#learn-root .learn-footer button')].find(b => b.textContent.trim() === 'Otestuj sa').click()); await pg.waitForTimeout(450);
        const quiz = await pg.evaluate(() => ({ quiz: isQuizMode, learn: Learn.active, hidden: document.getElementById('learn-root').hidden, overlay: getComputedStyle(document.getElementById('quiz-overlay')).display, question: document.getElementById('quiz-question').innerText, stages: comparisonStage.active || lightStage.active }));
        check(`${tag} ${id}: "Otestuj sa" starts the Quiz: Learn closed, question shown, no stage`, quiz.quiz && !quiz.learn && quiz.hidden && quiz.overlay === 'block' && /^Nájdi planétu:/.test(quiz.question) && !quiz.stages, JSON.stringify(quiz));
        await pg.evaluate(() => stopQuiz()); await pg.waitForTimeout(250);
      } else { await pg.evaluate(() => Learn.leave()); await pg.waitForTimeout(150); }
    }
    // Other step types keep their own footer and header: a first step has "Témy" and its forward button, and "Zavrieť".
    await startLesson(pg, 'slnko');
    const first = await pg.evaluate(() => { const root = document.getElementById('learn-root'); return { footer: [...root.querySelectorAll('.learn-footer button')].map(b => b.textContent.trim()), summary: !!root.querySelector('.learn-summary-actions'), close: !!root.querySelector('.learn-close') }; });
    check(`${tag}: other steps are unchanged (intro footer "Témy" + "Začať", "Zavrieť" in the header, no summary footer)`, first.footer.join() === 'Témy,Začať' && !first.summary && first.close, JSON.stringify(first));
    await pg.evaluate(() => Learn.leave());
    check(`${tag}: no page or console errors`, errors.length === 0, errors.join(' | '));
    await context.close();
  }
  await browser.close(); server.close();
  console.log(`\n${passes} passed, ${failures} failed`);
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); server.close(); process.exit(1); });
