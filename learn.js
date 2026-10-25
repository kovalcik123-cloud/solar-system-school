/* Learn owns no scene resources and never reads or writes Quiz state. */
window.Learn = (() => {
  let adapter, root, active = false, lesson = null, step = 0, stop = 0, answer = null;
  let feedback = null, completed = false, session = 0, snapshot = null, expanded = true;
  let experimentUI = null, experimentDetailsOpen = false, notice = null, liveStatus = null, tourReading = false;
  let solved = new Set(), tried = new Set();
  const data = window.LearnContent;
  const sheetLayout = window.matchMedia('(max-width: 900px)');
  const shortExperimentLayout = window.matchMedia('(max-width: 700px) and (min-height: 521px) and (max-height: 740px)');
  // Short screens open tours collapsed so the planet stays visible; short landscape tablets use a side panel.
  const compactTourLayout = window.matchMedia('(max-width: 900px) and (max-height: 740px)');
  const sideTourLayout = window.matchMedia('(min-width: 701px) and (max-width: 900px) and (max-height: 600px)');
  const el = (tag, text, cls) => { const n = document.createElement(tag); if (text) n.textContent = text; if (cls) n.className = cls; return n; };
  function button(text, action, cls) { const b = el('button', text, cls); b.type = 'button'; b.addEventListener('click', action); return b; }
  const filled = value => typeof value === 'string' && value.trim() !== '';
  const optionalText = value => value === undefined || filled(value);
  // Scientific groups come from content (planetGroups), never from rendering types.
  function validateGroups() {
    const groups = data.planetGroups, ids = new Set(), bodies = new Map();
    if (!Array.isArray(groups) || !groups.length) throw Error('Invalid planet groups');
    for (const g of groups) {
      if (!filled(g?.id) || ids.has(g.id) || !filled(g.title) || !filled(g.label) || !Array.isArray(g.bodies) || !g.bodies.length) throw Error('Invalid planet group');
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
    if (s.demo || !Array.isArray(s.groups) || s.groups.length < 2 || !Array.isArray(s.items) || !optionalText(s.doneTitle) || !optionalText(s.doneText)) throw Error('Invalid lesson classification');
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
        // A short visible label keeps the full next label as its accessible name.
        if (!optionalText(s.nextShort) || s.nextShort !== undefined && !filled(s.next)) throw Error('Invalid lesson step');
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
    if (current.type === 'classify') return current.items[stop] ? { kind: 'focus', body: current.items[stop].body } : { kind: 'overview' };
    return current.demo || (current.type === 'summary' ? { kind: 'overview' } : null);
  }
  // Tour stops are numbered across every tour step of the lesson, e.g. "Planéta 3 z 8".
  function tourPosition() {
    let before = 0, total = 0;
    lesson.steps.forEach((s, index) => { if (s.type === 'tour') { if (index < step) before += s.stops.length; total += s.stops.length; } });
    return { number: before + stop + 1, total };
  }
  const groupLabel = body => data.planetGroups.find(g => g.bodies.includes(body))?.label;
  const groupOf = body => data.planetGroups.find(g => g.bodies.includes(body))?.id;
  // The adjacent position in reading order; entering a tour backwards lands on its last stop.
  function neighbour(direction) {
    const current = lesson.steps[step];
    if (current.type === 'tour' && current.stops[stop + direction]) return { step, stop: stop + direction, title: current.stops[stop + direction].title };
    // Classification positions are its planets plus a final result view (stop === items.length).
    if (current.type === 'classify' && stop + direction >= 0 && stop + direction <= current.items.length) {
      const index = stop + direction, item = current.items[index];
      if (direction < 0) return { step, stop: index, title: adapter.bodyInfo(item.body).name };
      return { step, stop: index, title: null, label: item ? 'Ďalšia planéta' : 'Zobraziť výsledok' };
    }
    const target = lesson.steps[step + direction];
    if (!target) return null;
    if (target.type === 'classify') return { step: step + direction, stop: direction > 0 ? 0 : target.items.length, title: null };
    if (target.type !== 'tour') return { step: step + direction, stop: 0, title: null };
    const index = direction > 0 ? 0 : target.stops.length - 1;
    return { step: step + direction, stop: index, title: target.stops[index].title };
  }
  function go(target, focusKey) {
    if (target.step === step) moveStop(target.stop, focusKey); else move(target.step, target.stop);
  }
  function announce(text) {
    if (!liveStatus) return;
    liveStatus.textContent = '';
    liveStatus.textContent = text;
  }
  function classifyAnnouncement(current) {
    const item = current.items[stop];
    if (!item) return `${current.doneTitle || 'Všetky planéty sú roztriedené.'} ${current.groups.map(g => `${g.label}: ${data.planetGroups.find(x => x.id === g.id).bodies.length}`).join(', ')}.`;
    const name = adapter.bodyInfo(item.body).name;
    return `${name}, planéta ${stop + 1} z ${current.items.length}. Do ktorej skupiny patrí ${name}?`;
  }
  // A solved planet keeps its answer when revisited; an unsolved one starts fresh.
  function classifyState(current) {
    const item = current.items[stop];
    tried = new Set();
    answer = item && solved.has(item.body) ? groupOf(item.body) : null;
    feedback = answer ? 'correct' : null;
  }
  function moveStop(index, focusKey) {
    const current = active && lesson?.steps[step];
    if (current?.type === 'classify') {
      if (index < 0 || index > current.items.length || index > 0 && current.items[index - 1] && !solved.has(current.items[index - 1].body)) return;
      session++; adapter.cancel(); stop = index; notice = null; classifyState(current); render(focusKey); demonstrate();
      root.scrollTop = 0; root.querySelector('.learn-body').scrollTop = 0; // Each planet starts at its name and question.
      announce(classifyAnnouncement(current));
      return;
    }
    if (current?.type !== 'tour' || !current.stops[index]) return;
    session++; adapter.cancel(); stop = index; notice = null; render(focusKey); demonstrate();
    const position = tourPosition();
    announce(`${current.stops[stop].title}, planéta ${position.number} z ${position.total}, ${groupLabel(current.stops[stop].body)}.`);
  }
  // Scene and top-bar picks during a tour never let the camera show a different planet than the panel.
  function selectBody(id) {
    const current = active && lesson?.steps[step];
    if (current?.type === 'classify' && adapter.hasBody(id)) {
      // Picks never skip a question or reveal an answer; the view stays on the current question.
      const item = current.items[stop];
      if (item && item.body === id) { notice = null; render(false); demonstrate(); return true; }
      const name = adapter.bodyInfo(id).name;
      const later = current.items.some(x => x.body === id) ? `${name} príde na rad postupne.` : `${name} v tomto triedení nie je.`;
      notice = { text: item ? `Teraz triedime planétu ${adapter.bodyInfo(item.body).name}. ${later}` : 'Všetky planéty sú už roztriedené. Pokračuj tlačidlom Ďalej.', target: null };
      render(false); demonstrate(); announce(notice.text);
      return true;
    }
    if (current?.type !== 'tour' || !adapter.hasBody(id)) return false;
    const index = current.stops.findIndex(s => s.body === id);
    if (index >= 0) { moveStop(index); return true; }
    const name = adapter.bodyInfo(id).name, here = current.stops[stop].title;
    const elsewhere = lesson.steps.findIndex(s => s.type === 'tour' && s.stops.some(x => x.body === id));
    notice = elsewhere >= 0
      ? { text: `${name} navštívime v časti „${lesson.steps[elsewhere].title}“. Teraz je na rade ${here}.`, target: { step: elsewhere, stop: lesson.steps[elsewhere].stops.findIndex(x => x.body === id), title: name } }
      : { text: `${name} nie je zastávkou tejto expedície. Teraz je na rade ${here}.`, target: null };
    // The view returns to the planet the panel describes, so camera and text never disagree.
    render(false); demonstrate(); announce(notice.text);
    return true;
  }
  function classify(group) {
    const current = active && lesson?.steps[step], item = current?.type === 'classify' && current.items[stop];
    if (!item || feedback === 'correct') return;
    const correct = groupOf(item.body) === group, name = adapter.bodyInfo(item.body).name;
    answer = group; feedback = correct ? 'correct' : 'incorrect'; notice = null;
    if (correct) solved.add(item.body); else tried.add(group);
    render(correct ? 'next' : `group-${group}`);
    // Keep the new feedback, and after a correct answer the Next button, inside scrolling panels.
    root.querySelector(correct ? '.learn-footer .learn-primary' : '.learn-classify-feedback')?.scrollIntoView({ block: 'nearest' });
    announce(correct ? item.confirm || `Správne! ${name} patrí do skupiny ${current.groups.find(g => g.id === group).label}.` : item.hint || 'Skús to znova.');
  }
  function cleanup() {
    session++; adapter.cancel(); experimentDetailsOpen = false;
    if (snapshot) adapter.restore(snapshot);
    snapshot = null; lesson = null; step = 0; stop = 0; answer = null; feedback = null; completed = false; notice = null;
    solved = new Set(); tried = new Set();
    if (liveStatus) liveStatus.textContent = '';
  }
  function leave() {
    if (!active) return;
    cleanup(); active = false; root.hidden = true; root.inert = true;
    document.body.classList.remove('is-learn', 'is-learn-classify'); adapter.sync();
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
    cleanup(); snapshot = adapter.snapshot(); lesson = found; step = 0; expanded = true; tourReading = false; render();
  }
  function move(index, stopIndex = 0) {
    if (!active || !lesson || index < 0 || index >= lesson.steps.length) return;
    const target = lesson.steps[index];
    session++; adapter.cancel(); experimentDetailsOpen = false; step = index; answer = null; feedback = null; notice = null;
    stop = target.type === 'tour' && target.stops[stopIndex] ? stopIndex : target.type === 'classify' ? Math.min(Math.max(stopIndex, 0), target.items.length) : 0;
    if (target.type === 'classify') classifyState(target);
    completed = lesson.steps[step].type === 'summary'; expanded = target.type === 'tour' && compactTourLayout.matches ? tourReading : true; render(); demonstrate();
    if (target.type === 'classify') announce(classifyAnnouncement(target));
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
  function render(focusKey) {
    experimentUI = null;
    const tour = !!lesson && lesson.steps[step].type === 'tour' ? lesson.steps[step] : null;
    const sorting = !!lesson && lesson.steps[step].type === 'classify' ? lesson.steps[step] : null;
    const item = sorting?.items[stop], itemName = item ? adapter.bodyInfo(item.body).name : null;
    const compactExperiment = !!lesson && lesson.steps[step].type === 'experiment' && shortExperimentLayout.matches;
    root.replaceChildren(); root.hidden = false; root.inert = false;
    document.body.classList.add('is-learn'); root.className = lesson ? 'learn-panel' : 'learn-home';
    root.classList.toggle('is-expanded', expanded);
    root.classList.toggle('is-experiment', !!lesson && lesson.steps[step].type === 'experiment');
    root.classList.toggle('is-tour', !!tour);
    root.classList.toggle('is-classify', !!sorting); root.classList.toggle('is-result', !!sorting && !item);
    document.body.classList.toggle('is-learn-classify', !!sorting);
    if ((tour || sorting) && sideTourLayout.matches) root.dataset.layout = 'side'; else delete root.dataset.layout;
    const header = el('header', null, 'learn-header');
    const heading = el('h2', compactExperiment ? 'Pokus so Zemou' : tour ? tour.stops[stop].title : sorting ? itemName || sorting.doneTitle || 'Všetky planéty sú roztriedené.' : lesson ? lesson.steps[step].title : 'Čo dnes objavíme?');
    heading.id = 'learn-heading'; heading.tabIndex = -1;
    const titles = el('div'), eyebrow = el('p', null, 'learn-eyebrow');
    if (lesson) {
      eyebrow.append(el('span', tour ? tour.title : sorting ? sorting.title : lesson.title, 'learn-lesson-title'), el('span', `Krok ${step + 1} zo ${lesson.steps.length}`, 'learn-step-full'));
      const compact = el('span', `${step + 1}/${lesson.steps.length}`, 'learn-step-compact');
      compact.setAttribute('aria-hidden', 'true'); eyebrow.append(compact);
    } else eyebrow.textContent = 'Uč sa · Vesmír na dosah';
    titles.append(eyebrow, heading);
    if (tour) {
      const position = tourPosition(), meta = el('p', `Planéta ${position.number} z ${position.total}`, 'learn-tour-position');
      const category = el('span', groupLabel(tour.stops[stop].body), 'learn-category');
      category.dataset.group = data.planetGroups.find(g => g.bodies.includes(tour.stops[stop].body)).id;
      meta.append(category); titles.append(meta);
    }
    // The category stays hidden until the planet is classified.
    if (item) titles.append(el('p', `Planéta ${stop + 1} z ${sorting.items.length}`, 'learn-tour-position'));
    header.append(titles);
    if (lesson) {
      const toggle = button(compactExperiment ? (experimentDetailsOpen ? 'Menej textu' : 'Vysvetlenie') : expanded ? 'Menej' : 'Viac', () => {
        if (compactExperiment) { experimentDetailsOpen = !experimentDetailsOpen; render(); root.querySelector('.learn-expand').focus({ preventScroll: true }); }
        else { expanded = !expanded; if (tour) tourReading = expanded; render(); }
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
    if (notice) {
      const box = el('div', null, 'learn-notice'); box.append(el('p', notice.text));
      if (notice.target) { const target = notice.target; box.append(button(`Prejsť na zastávku: ${target.title}`, () => go(target))); }
      root.append(box);
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
      if (tour) {
        const current = tour.stops[stop], strip = el('div', null, 'learn-tour-strip');
        strip.setAttribute('role', 'group'); strip.setAttribute('aria-label', `Planéty v časti ${tour.title}`);
        const first = tourPosition().number - stop;
        tour.stops.forEach((item, index) => {
          const thumb = el('span', null, 'planet-thumbnail'); thumb.setAttribute('aria-hidden', 'true');
          thumb.style.backgroundImage = `url('${adapter.bodyInfo(item.body).texture}')`;
          const pick = button(null, () => moveStop(index, `stop-${index}`), 'learn-tour-stop');
          pick.append(thumb, el('span', item.title, 'learn-tour-stop-name'));
          pick.dataset.focus = `stop-${index}`; pick.setAttribute('aria-label', `${item.title}, planéta ${first + index} z ${tourPosition().total}`);
          if (index === stop) pick.setAttribute('aria-current', 'step');
          strip.append(pick);
        });
        body.append(strip, el('p', current.text));
        if (current.fact) { const fact = el('div', null, 'learn-fact'); fact.append(el('p', 'Zaujímavosť', 'learn-fact-label'), el('p', current.fact)); body.append(fact); }
        if (current.note) body.append(el('p', current.note, 'learn-note'));
        body.append(button('Vrátiť pohľad na planétu', demonstrate));
      }
      if (sorting && item) {
        const question = el('p', `Do ktorej skupiny patrí ${itemName}?`, 'learn-classify-question'); question.id = 'learn-classify-question';
        const choices = el('div', null, 'learn-classify-choices');
        choices.setAttribute('role', 'group'); choices.setAttribute('aria-labelledby', question.id);
        for (const g of sorting.groups) {
          const choice = button(g.label, () => classify(g.id), 'learn-classify-choice');
          choice.dataset.focus = `group-${g.id}`; choice.dataset.group = g.id;
          if (feedback === 'correct') { choice.disabled = true; if (answer === g.id) { choice.classList.add('is-correct'); choice.append(el('span', ' – správne', 'learn-visually-hidden')); } }
          else if (tried.has(g.id)) { choice.classList.add('is-incorrect'); choice.append(el('span', ' – nesprávne, skús inú možnosť', 'learn-visually-hidden')); }
          choices.append(choice);
        }
        body.append(question, choices);
        if (feedback) {
          const result = el('p', feedback === 'correct' ? item.confirm || `Správne! ${itemName} patrí do skupiny ${sorting.groups.find(g => g.id === answer).label}.` : item.hint || 'Skús to znova.', `learn-feedback learn-classify-feedback is-${feedback}`);
          body.append(result);
        }
        body.append(button('Vrátiť pohľad na planétu', demonstrate, 'learn-recenter'));
      }
      if (sorting && !item) {
        // Completion: the three scientific groups side by side (4 + 2 + 2).
        const result = el('div', null, 'learn-classify-result');
        for (const g of sorting.groups) {
          const source = data.planetGroups.find(x => x.id === g.id), column = el('section', null, 'learn-classify-group');
          column.dataset.group = g.id;
          column.append(el('h3', source.title), el('p', `${source.bodies.length} ${source.bodies.length < 5 ? 'planéty' : 'planét'}`, 'learn-classify-count'));
          const list = el('ul');
          for (const body of source.bodies) {
            const entry = el('li'), thumb = el('span', null, 'planet-thumbnail'); thumb.setAttribute('aria-hidden', 'true');
            thumb.style.backgroundImage = `url('${adapter.bodyInfo(body).texture}')`;
            entry.append(thumb, el('span', adapter.bodyInfo(body).name)); list.append(entry);
          }
          column.append(list); result.append(column);
        }
        body.append(result);
        if (sorting.doneText) body.append(el('p', sorting.doneText));
      }
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
      const s = lesson.steps[step], back = neighbour(-1), forward = neighbour(1);
      footer.append(button('Témy', home));
      if (back) {
        const previous = button(back.title ? `← ${back.title}` : 'Späť', () => go(back, 'back'));
        if (back.title) previous.setAttribute('aria-label', `Predchádzajúca planéta: ${back.title}`);
        if (tour || sorting) previous.dataset.focus = 'back';
        footer.append(previous);
      }
      if (forward) {
        // Within a tour, and from a step leading into one, the button names the next planet.
        const named = forward.title && (forward.step === step || !s.next);
        const next = button(forward.label || (named ? `Ďalej: ${forward.title}` : s.nextShort || s.next || 'Ďalej'), () => go(forward, 'next'), 'learn-primary');
        if (named) next.setAttribute('aria-label', `Ďalšia planéta: ${forward.title}`);
        else if (s.nextShort) next.setAttribute('aria-label', s.next);
        if (tour || sorting) next.dataset.focus = 'next';
        // Classification continues only after the current planet is classified correctly.
        next.disabled = (s.type === 'question' || !!item) && feedback !== 'correct'; footer.append(next);
      }
      root.append(footer);
    }
    const collapsed = lesson && !expanded && sheetLayout.matches && !compactExperiment;
    body.inert = !!collapsed; adapter.sync(); syncExperiment();
    if (focusKey === false) return;
    const preferred = focusKey && root.querySelector(`[data-focus="${focusKey}"]:not(:disabled)`);
    (preferred && !preferred.closest('[inert]') ? preferred : heading).focus({ preventScroll: true });
  }
  function syncResponsiveSheet() {
    if (!active) return;
    const body = root.querySelector('.learn-body');
    const collapsed = !!lesson && !expanded && sheetLayout.matches && !(lesson.steps[step].type === 'experiment' && shortExperimentLayout.matches);
    if (collapsed && body.contains(document.activeElement)) root.querySelector('.learn-expand').focus();
    body.inert = collapsed; adapter.sync();
  }
  shortExperimentLayout.addEventListener('change', () => { if (active && lesson?.steps[step].type === 'experiment') render(); });
  sideTourLayout.addEventListener('change', () => { if (active && ['tour', 'classify'].includes(lesson?.steps[step].type)) render(false); });
  sheetLayout.addEventListener('change', syncResponsiveSheet);
  window.addEventListener('resize', syncResponsiveSheet);
  return { init(a) {
      adapter = a; root = document.getElementById('learn-root'); root.addEventListener('click', event => event.stopPropagation()); validate();
      liveStatus = el('p', null, 'learn-live'); liveStatus.setAttribute('role', 'status'); liveStatus.setAttribute('aria-atomic', 'true'); document.body.append(liveStatus);
    }, enter, leave, home, selectBody,
    get active() { return active; }, get inLesson() { return !!lesson; }, get state() { return { active, lesson: lesson?.id, step, stop, answer, feedback, completed, session, notice: notice?.text ?? null }; } };
})();
