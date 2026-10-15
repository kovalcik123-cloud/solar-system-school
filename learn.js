/* Learn owns no scene resources and never reads or writes Quiz state. */
window.Learn = (() => {
  let adapter, root, active = false, lesson = null, step = 0, answer = null;
  let feedback = null, completed = false, session = 0, snapshot = null, expanded = true;
  const data = window.LearnContent;
  const sheetLayout = window.matchMedia('(max-width: 900px)');
  const el = (tag, text, cls) => { const n = document.createElement(tag); if (text) n.textContent = text; if (cls) n.className = cls; return n; };
  function button(text, action, cls) { const b = el('button', text, cls); b.type = 'button'; b.addEventListener('click', action); return b; }
  function validate() {
    const ids = new Set();
    for (const l of data.lessons) {
      if (ids.has(l.id) || !data.topics.some(t => t.id === l.id)) throw Error('Invalid lesson ID');
      ids.add(l.id); const steps = new Set();
      for (const s of l.steps) {
        if (steps.has(s.id) || !['intro','observe','question','summary'].includes(s.type)) throw Error('Invalid lesson step');
        steps.add(s.id);
        if (s.demo && ( !['overview','focus'].includes(s.demo.kind) || (s.demo.kind === 'focus' && !adapter.hasBody(s.demo.body)))) throw Error('Invalid lesson demonstration');
        if (s.type === 'question' && (!s.options.some(o => o.id === s.correct) || new Set(s.options.map(o => o.id)).size !== s.options.length)) throw Error('Invalid lesson answer');
      }
    }
  }
  function cleanup() {
    session++; adapter.cancel();
    if (snapshot) adapter.restore(snapshot);
    snapshot = null; lesson = null; step = 0; answer = null; feedback = null; completed = false;
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
    session++; adapter.cancel(); step = index; answer = null; feedback = null;
    completed = lesson.steps[step].type === 'summary'; expanded = true; render(); demonstrate();
  }
  function demonstrate() {
    if (!active || !lesson) return;
    const current = lesson.steps[step];
    const demo = current.demo || (current.type === 'summary' ? { kind: 'overview' } : null);
    if (!demo) return;
    adapter.demonstrate(demo);
  }
  function render() {
    root.replaceChildren(); root.hidden = false; root.inert = false;
    document.body.classList.add('is-learn'); root.className = lesson ? 'learn-panel' : 'learn-home';
    root.classList.toggle('is-expanded', expanded);
    const header = el('header', null, 'learn-header');
    const heading = el('h2', lesson ? lesson.steps[step].title : 'Čo dnes objavíme?');
    heading.id = 'learn-heading'; heading.tabIndex = -1;
    const titles = el('div'), eyebrow = el('p', null, 'learn-eyebrow');
    if (lesson) {
      eyebrow.append(el('span', lesson.title, 'learn-lesson-title'), el('span', `Krok ${step + 1} zo ${lesson.steps.length}`, 'learn-step-full'));
      const compact = el('span', `${step + 1}/${lesson.steps.length}`, 'learn-step-compact');
      compact.setAttribute('aria-hidden', 'true'); eyebrow.append(compact);
    } else eyebrow.textContent = 'Uč sa · Vesmír na dosah';
    titles.append(eyebrow, heading); header.append(titles);
    if (lesson) {
      const toggle = button(expanded ? 'Menej' : 'Viac', () => { expanded = !expanded; render(); }, 'learn-expand');
      toggle.setAttribute('aria-expanded', String(expanded)); toggle.setAttribute('aria-controls', 'learn-body'); header.append(toggle);
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
          card.prepend(el('p', 'Začni tu', 'learn-topic-badge'));
          card.append(el('p', topic.description), el('p', `Približne ${topic.minutes} minúty`, 'learn-duration'), button('Začať lekciu', () => start(topic.id), 'learn-primary'));
        } else card.append(el('p', 'Pripravujeme', 'learn-topic-status'));
        grid.append(card);
      }
      body.append(grid);
    } else {
      const s = lesson.steps[step];
      if (s.text && s.type !== 'summary') body.append(el('p', s.text));
      if (s.type === 'intro') { body.append(el('h3', 'Čo sa naučíš'), el('p', lesson.objective), el('p', lesson.limitation, 'learn-note')); }
      if (s.demo) body.append(button('Zopakovať ukážku', demonstrate));
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
    const collapsed = lesson && !expanded && sheetLayout.matches;
    body.inert = !!collapsed; adapter.sync();
    heading.focus({ preventScroll: true });
  }
  function syncResponsiveSheet() {
    if (!active) return;
    const body = root.querySelector('.learn-body');
    const collapsed = !!lesson && !expanded && sheetLayout.matches;
    if (collapsed && body.contains(document.activeElement)) root.querySelector('.learn-expand').focus();
    body.inert = collapsed; adapter.sync();
  }
  sheetLayout.addEventListener('change', syncResponsiveSheet);
  window.addEventListener('resize', syncResponsiveSheet);
  return { init(a) { adapter = a; root = document.getElementById('learn-root'); root.addEventListener('click', event => event.stopPropagation()); validate(); }, enter, leave, home,
    get active() { return active; }, get inLesson() { return !!lesson; }, get state() { return { active, lesson: lesson?.id, step, answer, feedback, completed, session }; } };
})();
