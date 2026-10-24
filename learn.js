/* Learn owns no scene resources and never reads or writes Quiz state. */
window.Learn = (() => {
  let adapter, root, active = false, lesson = null, step = 0, stop = 0, answer = null;
  let feedback = null, completed = false, session = 0, snapshot = null, expanded = true;
  let experimentUI = null, experimentDetailsOpen = false;
  const data = window.LearnContent;
  const sheetLayout = window.matchMedia('(max-width: 900px)');
  const shortExperimentLayout = window.matchMedia('(max-width: 700px) and (min-height: 521px) and (max-height: 740px)');
  const el = (tag, text, cls) => { const n = document.createElement(tag); if (text) n.textContent = text; if (cls) n.className = cls; return n; };
  function button(text, action, cls) { const b = el('button', text, cls); b.type = 'button'; b.addEventListener('click', action); return b; }
  const filled = value => typeof value === 'string' && value.trim() !== '';
  const optionalText = value => value === undefined || filled(value);
  // Scientific groups come from content (planetGroups), never from rendering types.
  function validateGroups() {
    const groups = data.planetGroups, ids = new Set(), bodies = new Map();
    if (!Array.isArray(groups) || !groups.length) throw Error('Invalid planet groups');
    for (const g of groups) {
      if (!filled(g?.id) || ids.has(g.id) || !filled(g.title) || !Array.isArray(g.bodies) || !g.bodies.length) throw Error('Invalid planet group');
      ids.add(g.id);
      for (const body of g.bodies) {
        if (!adapter.hasBody(body) || adapter.bodyInfo(body).kind !== 'planet' || bodies.has(body)) throw Error('Invalid planet group body');
        bodies.set(body, g.id);
      }
    }
    if (adapter.bodies.some(id => adapter.bodyInfo(id).kind === 'planet' && !bodies.has(id))) throw Error('Incomplete planet groups');
    return bodies;
  }
  function validateTour(s, groupOf) {
    if (s.demo || s.group !== undefined && !groupOf.has(s.group) || !Array.isArray(s.stops) || !s.stops.length) throw Error('Invalid lesson tour');
    const bodies = new Set();
    for (const stop of s.stops) {
      const group = stop?.group ?? s.group;
      if (!stop || !adapter.hasBody(stop.body) || bodies.has(stop.body) || stop.demo !== undefined || stop.view !== undefined) throw Error('Invalid tour stop');
      if (!filled(stop.title) || !filled(stop.text) || !optionalText(stop.fact) || !optionalText(stop.note)) throw Error('Invalid tour stop text');
      if (group !== undefined && groupOf.get(group)?.has(stop.body) !== true) throw Error('Invalid tour stop group');
      bodies.add(stop.body);
    }
  }
  function validateClassify(s, groupOf) {
    if (s.demo || !Array.isArray(s.groups) || s.groups.length < 2 || !Array.isArray(s.items)) throw Error('Invalid lesson classification');
    const declared = new Set(), bodies = new Set();
    for (const g of s.groups) {
      if (!g || !groupOf.has(g.id) || declared.has(g.id) || !filled(g.label)) throw Error('Invalid classification group');
      declared.add(g.id);
    }
    for (const item of s.items) {
      if (!item || !adapter.hasBody(item.body) || bodies.has(item.body) || !declared.has(item.group)) throw Error('Invalid classification item');
      if (!groupOf.get(item.group).has(item.body) || !optionalText(item.hint) || !optionalText(item.confirm)) throw Error('Invalid classification answer');
      bodies.add(item.body);
    }
    // Every planet of every declared group is sorted exactly once.
    for (const id of declared) for (const body of groupOf.get(id)) if (!bodies.has(body)) throw Error('Incomplete classification');
  }
  function validate() {
    const ids = new Set(), groupOf = new Map();
    for (const [body, group] of validateGroups()) { if (!groupOf.has(group)) groupOf.set(group, new Set()); groupOf.get(group).add(body); }
    for (const l of data.lessons) {
      if (ids.has(l.id) || !data.topics.some(t => t.id === l.id)) throw Error('Invalid lesson ID');
      ids.add(l.id); const steps = new Set();
      for (const s of l.steps) {
        if (steps.has(s.id) || !['intro','observe','experiment','question','summary','tour','classify'].includes(s.type)) throw Error('Invalid lesson step');
        steps.add(s.id);
        if (s.demo && ( !['overview','focus'].includes(s.demo.kind) || (s.demo.kind === 'focus' && !adapter.hasBody(s.demo.body)))) throw Error('Invalid lesson demonstration');
        if (s.demo?.view && (s.demo.kind !== 'focus' || s.demo.body !== 'earth' || s.demo.view !== 'day-night')) throw Error('Invalid lesson view');
        if (s.type === 'experiment' && (s.experiment?.kind !== 'earth-day-night' || s.demo?.body !== 'earth' || s.demo?.view !== 'day-night')) throw Error('Invalid lesson experiment');
        if (s.type === 'question' && (!s.options.some(o => o.id === s.correct) || new Set(s.options.map(o => o.id)).size !== s.options.length)) throw Error('Invalid lesson answer');
        if (s.type === 'tour') validateTour(s, groupOf);
        if (s.type === 'classify') validateClassify(s, groupOf);
      }
    }
  }
  // Tour and classification steps resolve their demonstration per stop; other steps keep step-level demos.
  function stepDemo(current) {
    if (current.type === 'tour') return { kind: 'focus', body: current.stops[stop].body };
    if (current.type === 'classify') return { kind: 'focus', body: current.items[stop].body };
    return current.demo || (current.type === 'summary' ? { kind: 'overview' } : null);
  }
  function cleanup() {
    session++; adapter.cancel(); experimentDetailsOpen = false;
    if (snapshot) adapter.restore(snapshot);
    snapshot = null; lesson = null; step = 0; stop = 0; answer = null; feedback = null; completed = false;
  }
  function leave() {
    if (!active) return;
    cleanup(); active = false; root.hidden = true; root.inert = true;
    document.body.classList.remove('is-learn'); adapter.sync();
    document.getElementById('explore-nav').focus({ preventScroll: true });
  }
  function home() {
    cleanup(); active = true; expanded = true; adapter.closeInfo(); render(); adapter.sync();
  }
  function enter() {
    if (!adapter.ready()) return;
    if (active) { home(); return; }
    adapter.exitQuiz(); active = true; adapter.closeInfo(); adapter.cancel(); home();
  }
  function start(id) {
    if (!active) return;
    const found = data.lessons.find(l => l.id === id); if (!found) return;
    cleanup(); snapshot = adapter.snapshot(); lesson = found; step = 0; expanded = true; render();
  }
  function move(index) {
    if (!active || !lesson || index < 0 || index >= lesson.steps.length) return;
    session++; adapter.cancel(); experimentDetailsOpen = false; step = index; stop = 0; answer = null; feedback = null;
    completed = lesson.steps[step].type === 'summary'; expanded = true; render(); demonstrate();
  }
  function demonstrate() {
    if (!active || !lesson) return;
    const current = lesson.steps[step];
    const demo = stepDemo(current);
    if (!demo) return;
    adapter.experiment.end();
    adapter.demonstrate(demo);
    if (current.type === 'experiment') {
      const owner = session;
      adapter.experiment.begin(current.experiment, () => { if (active && session === owner) syncExperiment(); });
    }
  }
  function syncExperiment() {
    if (!experimentUI || !active || lesson?.steps[step].type !== 'experiment') return;
    const state = adapter.experiment.state();
    experimentUI.turn.disabled = !state.active || state.busy;
    experimentUI.reset.disabled = !state.active;
    experimentUI.light.textContent = state.active ? (state.day ? 'DEŇ' : 'NOC') : 'Pripravujeme pokus…';
    experimentUI.light.dataset.day = String(!!state.day);
    const explanation = state.boundary ? 'Miesto je blízko rozhrania dňa a noci. Model neurčuje presný čas východu ani západu Slnka.' : state.day ? 'Na označené miesto dopadá priame slnečné svetlo.' : 'Označené miesto je odvrátené od priameho slnečného svetla.';
    experimentUI.explanation.textContent = state.active ? explanation : '';
    experimentUI.visibility.textContent = state.hiddenReason === 'back' ? 'Miesto je na odvrátenej strane Zeme. Jeho stav sleduj tu v paneli.' : state.hiddenReason ? 'Značka je mimo voľného výhľadu. Stav miesta zostáva dostupný tu.' : 'Krúžok označuje stále to isté miesto na povrchu.';
    const announcement = state.active && !state.busy ? `${state.turns ? 'Otočenie dokončené.' : 'Pokus je pripravený.'} Označené miesto: ${state.day ? 'deň' : 'noc'}.` : '';
    if (experimentUI.status.textContent !== announcement) experimentUI.status.textContent = announcement;
  }
  function render() {
    experimentUI = null;
    const compactExperiment = !!lesson && lesson.steps[step].type === 'experiment' && shortExperimentLayout.matches;
    root.replaceChildren(); root.hidden = false; root.inert = false;
    document.body.classList.add('is-learn'); root.className = lesson ? 'learn-panel' : 'learn-home';
    root.classList.toggle('is-expanded', expanded);
    root.classList.toggle('is-experiment', !!lesson && lesson.steps[step].type === 'experiment');
    const header = el('header', null, 'learn-header');
    const heading = el('h2', compactExperiment ? 'Pokus so Zemou' : lesson ? lesson.steps[step].title : 'Čo dnes objavíme?');
    heading.id = 'learn-heading'; heading.tabIndex = -1;
    const titles = el('div'), eyebrow = el('p', null, 'learn-eyebrow');
    if (lesson) {
      eyebrow.append(el('span', lesson.title, 'learn-lesson-title'), el('span', `Krok ${step + 1} zo ${lesson.steps.length}`, 'learn-step-full'));
      const compact = el('span', `${step + 1}/${lesson.steps.length}`, 'learn-step-compact');
      compact.setAttribute('aria-hidden', 'true'); eyebrow.append(compact);
    } else eyebrow.textContent = 'Uč sa · Vesmír na dosah';
    titles.append(eyebrow, heading); header.append(titles);
    if (lesson) {
      const toggle = button(compactExperiment ? (experimentDetailsOpen ? 'Menej textu' : 'Vysvetlenie') : expanded ? 'Menej' : 'Viac', () => {
        if (compactExperiment) { experimentDetailsOpen = !experimentDetailsOpen; render(); root.querySelector('.learn-expand').focus({ preventScroll: true }); }
        else { expanded = !expanded; render(); }
      }, 'learn-expand');
      toggle.setAttribute('aria-expanded', String(compactExperiment ? experimentDetailsOpen : expanded));
      toggle.setAttribute('aria-controls', compactExperiment ? 'learn-experiment-details' : 'learn-body'); header.append(toggle);
    }
    if (!lesson || lesson.steps[step].type !== 'summary') header.append(button('Zavrieť', leave, 'learn-close'));
    root.append(header);
    if (lesson) {
      const progress = el('ol', null, 'learn-progress'); progress.setAttribute('aria-hidden', 'true');
      lesson.steps.forEach((item, index) => {
        const segment = el('li'); segment.dataset.state = index < step ? 'completed' : index === step ? 'current' : 'upcoming';
        progress.append(segment);
      });
      root.append(progress);
    }
    const body = el('div', null, 'learn-body'); body.id = 'learn-body';
    if (!lesson) {
      body.append(el('p', 'Vyber si krátku lekciu. Pozoruj, skúmaj a vyskúšaj si, čo si sa naučil.'));
      body.append(el('p', '6 tém · Ďalšie témy nájdeš nižšie ↓', 'learn-scroll-hint'));
      const grid = el('div', null, 'learn-topics');
      for (const topic of data.topics) {
        const card = el('article', null, 'learn-topic'); card.append(el('h3', topic.title));
        const available = data.lessons.some(l => l.id === topic.id);
        card.classList.add(available ? 'is-available' : 'is-upcoming');
        if (available) {
          card.prepend(el('p', 'Interaktívna lekcia', 'learn-topic-badge'));
          card.append(el('p', topic.description), el('p', `Približne ${topic.minutes} min`, 'learn-duration'), button('Začať lekciu', () => start(topic.id), 'learn-primary'));
        } else card.append(el('p', 'Pripravujeme', 'learn-topic-status'));
        grid.append(card);
      }
      body.append(grid);
    } else {
      const s = lesson.steps[step];
      if (s.text && s.type !== 'summary' && s.type !== 'experiment') body.append(el('p', s.text));
      if (s.type === 'intro') { body.append(el('h3', 'Čo sa naučíš'), el('p', lesson.objective), el('p', lesson.limitation, 'learn-note')); }
      if (s.demo && s.type !== 'experiment') body.append(button('Zopakovať ukážku', demonstrate));
      if (s.type === 'experiment') {
        const light = el('p', null, 'learn-daynight'); light.setAttribute('aria-label', 'Stav označeného miesta');
        const explanation = el('p'), visibility = el('p', null, 'learn-location-note');
        const turn = button('Otočiť Zem o 90°', () => adapter.experiment.turn(), 'learn-primary');
        const reset = button('Obnoviť pokus', () => adapter.experiment.reset());
        const actions = el('div', null, 'learn-experiment-actions'); actions.append(turn, reset);
        const status = el('p', null, 'learn-experiment-status'); status.setAttribute('role', 'status'); status.setAttribute('aria-atomic', 'true');
        experimentUI = { light, explanation, visibility, turn, reset, status };
        const details = el('div', null, 'learn-experiment-details'); details.id = 'learn-experiment-details';
        details.hidden = compactExperiment && !experimentDetailsOpen;
        if (compactExperiment) { details.tabIndex = 0; details.setAttribute('role', 'region'); details.setAttribute('aria-label', 'Vysvetlenie pokusu'); }
        details.append(explanation, visibility, el('p', s.text), el('p', s.note, 'learn-note'), button('Zopakovať ukážku', demonstrate));
        body.append(light, actions, details, status);
      }
      if (s.type === 'question') {
        const group = el('fieldset'); group.append(el('legend', 'Vyber jednu odpoveď'));
        for (const option of s.options) {
          const label = el('label', null, 'learn-answer'), input = el('input'); input.type = 'radio'; input.name = 'learn-answer'; input.value = option.id; input.checked = answer === option.id;
          input.disabled = feedback !== null;
          label.classList.toggle('is-selected', input.checked);
          if (input.checked && feedback) label.classList.add(feedback === 'correct' ? 'is-correct' : 'is-incorrect');
          input.addEventListener('change', () => {
            answer = option.id;
            root.querySelectorAll('.learn-answer').forEach(row => row.classList.toggle('is-selected', row.querySelector('input').checked));
            root.querySelector('[data-check]').disabled = false;
          });
          const optionText = el('span', option.text, 'learn-answer-text');
          if (input.checked && feedback) optionText.append(el('small', feedback === 'correct' ? 'Správna odpoveď' : 'Nesprávna odpoveď', 'learn-answer-state'));
          label.append(input, optionText); group.append(label);
        }
        body.append(group);
        if (feedback === null) {
          const check = button('Overiť', () => { feedback = answer === s.correct ? 'correct' : 'incorrect'; render(); root.querySelector('[role="status"]').focus(); }, 'learn-primary');
          check.dataset.check = ''; check.disabled = !answer; body.append(check);
        }
        const status = el('p', feedback ? (feedback === 'correct' ? s.correctFeedback : s.incorrectFeedback) : '', 'learn-feedback');
        status.id = 'learn-feedback'; status.setAttribute('role', 'status'); status.tabIndex = -1;
        if (feedback) { status.classList.add(`is-${feedback}`); group.setAttribute('aria-describedby', status.id); }
        body.append(status);
        if (feedback === 'incorrect') body.append(button('Skúsiť znova', () => { answer = null; feedback = null; render(); root.querySelector('input').focus(); }));
      }
      if (s.type === 'summary') {
        const list = el('ul'); s.ideas.forEach(t => list.append(el('li', t))); body.append(list, el('p', s.text));
        body.append(button('Späť na témy', home), button('Objavuj', leave), button('Otestuj sa', () => { leave(); adapter.quiz(); }, 'learn-primary'));
      }
    }
    root.append(body);
    if (lesson && lesson.steps[step].type !== 'summary') {
      const footer = el('footer', null, 'learn-footer');
      footer.append(button('Témy', home));
      if (step > 0) footer.append(button('Späť', () => move(step - 1)));
      if (step < lesson.steps.length - 1) { const next = button(lesson.steps[step].next || 'Ďalej', () => move(step + 1), 'learn-primary'); next.disabled = lesson.steps[step].type === 'question' && feedback !== 'correct'; footer.append(next); }
      root.append(footer);
    }
    const collapsed = lesson && !expanded && sheetLayout.matches && !compactExperiment;
    body.inert = !!collapsed; adapter.sync(); syncExperiment();
    heading.focus({ preventScroll: true });
  }
  function syncResponsiveSheet() {
    if (!active) return;
    const body = root.querySelector('.learn-body');
    const collapsed = !!lesson && !expanded && sheetLayout.matches && !(lesson.steps[step].type === 'experiment' && shortExperimentLayout.matches);
    if (collapsed && body.contains(document.activeElement)) root.querySelector('.learn-expand').focus();
    body.inert = collapsed; adapter.sync();
  }
  shortExperimentLayout.addEventListener('change', () => { if (active && lesson?.steps[step].type === 'experiment') render(); });
  sheetLayout.addEventListener('change', syncResponsiveSheet);
  window.addEventListener('resize', syncResponsiveSheet);
  return { init(a) { adapter = a; root = document.getElementById('learn-root'); root.addEventListener('click', event => event.stopPropagation()); validate(); }, enter, leave, home,
    get active() { return active; }, get inLesson() { return !!lesson; }, get state() { return { active, lesson: lesson?.id, step, stop, answer, feedback, completed, session }; } };
})();
