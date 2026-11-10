// Phase 6H.5.3.2 Sun-to-planets responsive UX & accessibility harness (outside the repository). The real planets Learn step in a
// test-only fixture (pohyb stays inactive in the app). Replaces and strengthens the light653 preview-panel assertions for the real panel:
// every state, the scale bar's label included, target and real time visible, focus, touch targets, reading view.
const base = require('fs').readFileSync(__dirname + '/light661.js', 'utf8').split('(async () => {')[0]
  .replace("'light661')", "'light662')").replace(/PORT \|\| \d+/, 'PORT || 8951');
eval(base + `
// Geometry and visibility of everything that matters in one state.
const G = () => {
  const root = document.getElementById('learn-root'), body = root.querySelector('.learn-body'), nav = document.getElementById('planet-nav').getBoundingClientRect(), p = root.getBoundingClientRect();
  const scroller = root.dataset.layout === 'side' ? root : body, sv = scroller.getBoundingClientRect();
  const view = { t: Math.max(p.top, sv.top), b: Math.min(p.bottom, sv.bottom, innerHeight) };
  const shown = e => !!e && !e.hidden && !e.closest('[hidden]') && e.getClientRects().length > 0;
  const inView = e => { if (!shown(e)) return null; const b = e.getBoundingClientRect(); return b.top >= view.t - 0.5 && b.bottom <= view.b + 0.5; };
  const R = e => { const b = e.getBoundingClientRect(); return { l: b.left, t: b.top, r: b.right, b: b.bottom }; };
  const hit = r => r.l < p.right - 1 && p.left < r.r - 1 && r.t < p.bottom - 1 && p.top < r.b - 1;
  const overlay = [...document.querySelectorAll('#light-stage-overlay > div, #light-stage-overlay .light-scale span')].filter(e => shown(e) && e.getBoundingClientRect().width > 0);
  const under = overlay.filter(e => hit(R(e))).map(e => e.className + ':' + e.textContent.slice(0, 14));
  const offscreen = overlay.filter(e => { const r = R(e); return r.l < -1 || r.r > innerWidth + 1 || r.t < nav.bottom - 1 || r.b > innerHeight + 1; }).map(e => e.className);
  const labels = overlay.filter(e => e.classList.contains('light-planet')).map(R), clash = [];
  for (let i = 0; i < labels.length; i++) for (let j = i + 1; j < labels.length; j++) { const a = labels[i], c = labels[j]; if (a.l < c.r - 1 && c.l < a.r - 1 && a.t < c.b - 1 && c.t < a.b - 1) clash.push(i + 'x' + j); }
  const s = lightStage.state(), target = s.stage === 'outer' ? 'Neptún' : 'Mars';
  const targetEl = [...document.querySelectorAll('#light-stage-overlay .light-planet')].find(e => shown(e) && e.firstChild?.textContent === target);
  const time = document.querySelector('#light-stage-overlay .light-time');
  const ctrls = [...root.querySelectorAll('button, .learn-answer')].filter(e => shown(e) && !e.closest('[inert]')).map(e => ({ t: e.textContent.trim().slice(0, 22), h: e.getBoundingClientRect().height }));
  const primary = root.querySelector('.learn-light-box .learn-primary'), pr = primary.getBoundingClientRect(), outline = parseFloat(getComputedStyle(primary).outlineWidth || '0') + Math.max(0, parseFloat(getComputedStyle(primary).outlineOffset || '0'));
  return { phase: s.phase, paused: s.paused, view: s.view, panel: { t: p.top, b: p.bottom, l: p.left, r: p.right }, navBottom: nav.bottom, vw: innerWidth, vh: innerHeight,
    primary: inView(primary), primaryText: primary.textContent, lead: inView(root.querySelector('.learn-light-lead:not(.learn-light-ask)')), feedback: inView(root.querySelector('.learn-light-feedback')), ask: inView(root.querySelector('.learn-light-ask')),
    message: [...root.querySelectorAll('.learn-light-message p')].map(e => inView(e)), under, offscreen, clash, target: !!targetEl && !hit(R(targetEl)), targetTime: targetEl ? targetEl.lastChild.textContent.replace(/\\u00a0/g, ' ') : null, targetReached: !!targetEl?.classList.contains('is-reached'),
    time: shown(time) && !hit(R(time)) ? time.textContent.replace(/\\u00a0/g, ' ') : null, ctrls, focus: document.activeElement === primary ? 'primary' : document.activeElement?.tagName, focusRoom: pr.top - outline - view.t };
};
const g = pg => pg.evaluate('(' + G + ')()');
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const SIZES = [[1366, 768], [390, 844], [390, 667], [844, 390]];
  for (const [w, h] of SIZES) {
    const tag = w + '×' + h, { pg, errors, context } = await open(browser, w, h);
    await toStep(pg, 1); await fake(pg); await advance(pg, 50, 3);
    const states = [];
    const take = async (name, shot) => { await advance(pg, 50, 3); const s = await g(pg); states.push([name, s]); if (shot) await pg.screenshot({ path: path.join(OUT, shot + '-' + w + 'x' + h + '.png') }); return s; };
    await take('ready', '1-ready');
    await choose(pg, 'earth', 'Asi 8 minút');
    // Keyboard: focus the primary action and use Enter for every transition, so focus is tracked across the responsive changes.
    await pg.evaluate(() => document.querySelector('.learn-light-box .learn-primary').focus()); await pg.keyboard.press('Enter');
    const cd = await take('countdown');
    await advance(pg, 3000); await advance(pg, 50); await play(pg, 2000); const a = await take('stage A');
    await play(pg, 11000); const m = await take('mars', '2-mars');
    await choose(pg, 'neptune', 'Asi 4 hodiny'); await pg.evaluate(() => document.querySelector('.learn-light-box .learn-primary').focus()); await pg.keyboard.press('Enter');
    await play(pg, 3200); const b = await take('stage B', '3-stage-b');
    await play(pg, 22000, 400); const n = await take('neptune', '4-neptune');
    for (const [name, s] of states) {
      check(tag + ' ' + name + ': panel inside the usable viewport; primary "' + s.primaryText + '" fully in view without scrolling', s.panel.t >= s.navBottom - 0.5 && s.panel.b <= s.vh + 0.5 && s.panel.l >= -0.5 && s.panel.r <= s.vw + 0.5 && s.primary === true, JSON.stringify({ panel: s.panel, primary: s.primary }));
      check(tag + ' ' + name + ': no simulation label, readout or scale label under the panel or off screen; no label collisions', s.under.length === 0 && s.offscreen.length === 0 && s.clash.length === 0, JSON.stringify({ under: s.under, off: s.offscreen, clash: s.clash }));
      check(tag + ' ' + name + ': current target (' + (s.view?.name === 'outer' ? 'Neptún' : 'Mars') + ') visible; real time shown (' + (s.time ?? 'target label ' + s.targetTime) + ')' + (s.view?.tight ? ' [tight' + (s.view.minimal ? ', minimal' : '') + ']' : ''),
        s.target && (s.time !== null || (s.view?.minimal && (s.phase === 'ready' || s.targetReached))), JSON.stringify({ target: s.target, time: s.time, view: s.view && { tight: s.view.tight, minimal: s.view.minimal } }));
      check(tag + ' ' + name + ': every visible panel control is at least 44 px tall', s.ctrls.every(c => c.h >= 43.5), JSON.stringify(s.ctrls.filter(c => c.h < 43.5)));
    }
    check(tag + ': key texts in view without scrolling — Mars: result, feedback, question' + (w > 900 ? ', transition sentence' : '') + '; Neptune: result, feedback, discovery',
      m.lead && m.feedback && m.ask && (w > 900 ? m.message.every(Boolean) : true) && n.lead && n.feedback && n.message.every(Boolean), JSON.stringify({ mars: [m.lead, m.feedback, m.ask, m.message], neptune: [n.lead, n.feedback, n.message] }));
    check(tag + ': keyboard focus stays on the main action across the state and size changes (countdown, stage A, Mars, stage B, Neptune) with room for its focus outline',
      [cd, a, m, b, n].every(s => s.focus === 'primary' && s.focusRoom >= -0.5), JSON.stringify([cd, a, m, b, n].map(s => [s.phase, s.focus, Math.round(s.focusRoom)])));
    if (w < 500) check(tag + ': the panel is shorter while the light flies (question/result ' + Math.round(m.panel.b - m.panel.t) + ' px, runs ' + Math.round(a.panel.b - a.panel.t) + ' px)', a.panel.t > m.panel.t + 20 && b.panel.t > m.panel.t + 20);
    const said = (await pg.evaluate(() => window.__said)).map(nb);
    check(tag + ': screen-reader announcements without duplicates (' + said.length + ')', said.every((t, i) => i === 0 || t !== said[i - 1]) && said.filter(t => t.startsWith('K Zemi letelo')).length === 1 && said.filter(t => t.startsWith('K Neptúnu letelo')).length === 1, JSON.stringify(said));
    // Explanation on phones: a reading view; opening it in a run pauses; all its controls reachable; closing does not resume.
    if (w < 500) {
      await primary(pg); await advance(pg, 50, 3); await primary(pg); await advance(pg, 3000); await advance(pg, 50); await play(pg, 1500);
      await pg.evaluate(() => document.querySelector('.learn-expand').click()); await advance(pg, 50, 3);
      const rv = await pg.evaluate(() => { const root = document.getElementById('learn-root'), d = document.getElementById('learn-experiment-details'), p = root.getBoundingClientRect();
        const ctrls = [...root.querySelectorAll('button, [tabindex="0"]')].filter(e => e.getClientRects().length && !e.closest('[hidden]'));
        return { paused: lightStage.state().paused, expanded: root.querySelector('.learn-expand').getAttribute('aria-expanded'), detailsShown: !d.hidden, scrollable: d.scrollHeight > d.clientHeight + 1 ? getComputedStyle(d).overflowY : 'fits', panelInView: p.top >= 0 && p.bottom <= innerHeight, names: ctrls.map(e => (e.textContent || e.getAttribute('aria-label') || '').trim().slice(0, 18)) }; });
      const missed = [];
      for (const label of ['Menej textu', 'Pokračovať', 'Témy', 'Späť', 'Ďalej']) { let ok = false; await pg.evaluate(() => document.getElementById('learn-heading').focus()); for (let i = 0; i < 25 && !ok; i++) { await pg.keyboard.press('Tab'); ok = await pg.evaluate(l => { const a = document.activeElement, t = (a?.textContent || '').trim(); if (t !== l) return false; const r = a.getBoundingClientRect(), p = document.getElementById('learn-root').getBoundingClientRect(); return r.top >= p.top - 0.5 && r.bottom <= Math.min(p.bottom, innerHeight) + 0.5; }, label); } if (!ok) missed.push(label); }
      check(tag + ' explanation reading view: opening pauses the run; aria-expanded true; the panel stays on screen; Menej textu, Pokračovať and the navigation are reachable by keyboard and fully visible (details: ' + rv.scrollable + ')',
        rv.paused && rv.expanded === 'true' && rv.detailsShown && rv.panelInView && missed.length === 0, JSON.stringify({ rv, missed }));
      await pg.evaluate(() => document.querySelector('.learn-expand').click()); await advance(pg, 1000, 3); const closed = await g(pg);
      check(tag + ' explanation closed: still paused (no automatic resume); no simulation text under the panel', closed.paused && closed.under.length === 0, JSON.stringify(closed.under));
      await pg.screenshot({ path: path.join(OUT, '5-paused-after-explanation-' + w + 'x' + h + '.png') });
    }
    check(tag + ': no JS errors', errors.length === 0, errors.join('; '));
    await context.close();
  }
  // 844×390: the navigation below the experiment stays reachable by keyboard focus and by touch scrolling (existing side-panel pattern).
  {
    const { pg, errors, context } = await open(browser, 844, 390); await toStep(pg, 1); await fake(pg); await advance(pg, 50, 3);
    await pg.evaluate(() => lightStage.skip()); await advance(pg, 50, 3);
    const nav = [];
    for (const label of ['Témy', 'Späť', 'Ďalej']) { let ok = false; await pg.evaluate(() => document.getElementById('learn-heading').focus()); for (let i = 0; i < 30 && !ok; i++) { await pg.keyboard.press('Tab'); ok = await pg.evaluate(l => (document.activeElement?.textContent || '').trim() === l && (r => { const p = document.getElementById('learn-root').getBoundingClientRect(); return r.top >= p.top - 0.5 && r.bottom <= p.bottom + 0.5; })(document.activeElement.getBoundingClientRect()), label); } nav.push([label, ok]); }
    await pg.evaluate(() => { document.activeElement.blur(); document.getElementById('learn-root').scrollTop = 0; });
    const cdp = await context.newCDPSession(pg), p = await pg.evaluate(() => { const r = document.getElementById('learn-root').getBoundingClientRect(); return { x: Math.round(r.left + 20), y: Math.round(r.bottom - 40) }; });
    const footerIn = () => pg.evaluate(() => { const p = document.getElementById('learn-root').getBoundingClientRect(); return [...document.querySelectorAll('.learn-footer button')].every(b => { const r = b.getBoundingClientRect(); return r.top >= p.top - 0.5 && r.bottom <= p.bottom + 0.5; }); });
    let touched = false, swipes = 0;
    for (; swipes < 8 && !touched; swipes++) { // repeated finger swipes, as a learner would scroll a long side panel
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: p.x, y: p.y }] });
      for (let y = p.y; y >= p.y - 160; y -= 10) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: p.x, y }] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await pg.waitForTimeout(300); touched = await footerIn();
    }
    nav.push(['swipes', swipes]);
    check('844×390 Mars stop: Témy / Späť / Ďalej reachable by keyboard (shown fully when focused) and by a touch swipe', nav.every(x => x[1]) && touched, JSON.stringify({ nav, touched }));
    check('844×390 navigation: no JS errors', errors.length === 0, errors.join('; '));
    await context.close();
  }
  console.log(passes + ' passed, ' + failures + ' failed');
  await browser.close(); server.close();
})();`);
