/* Learn owns no scene resources and never reads or writes Quiz state. */
window.Learn = (() => {
  let adapter, root, active = false, lesson = null, step = 0, stop = 0, answer = null;
  let feedback = null, completed = false, session = 0, snapshot = null, expanded = true;
  let experimentUI = null, experimentDetailsOpen = false, notice = null, liveStatus = null, tourReading = false, viewReading = false;
  let solved = new Set(), tried = new Set(), comparisonPending = false;
  const data = window.LearnContent;
  const sheetLayout = window.matchMedia('(max-width: 900px)');
  const shortExperimentLayout = window.matchMedia('(max-width: 700px) and (min-height: 521px) and (max-height: 740px)');
  // Short screens open tours collapsed so the planet stays visible; short landscape tablets use a side panel.
  const compactTourLayout = window.matchMedia('(max-width: 900px) and (max-height: 740px)');
  const sideTourLayout = window.matchMedia('(min-width: 701px) and (max-width: 900px) and (max-height: 600px)');
  // Phone portrait screens keep the Moon drawing and its buttons; the explanation opens on request.
  const compactMoonLayout = window.matchMedia('(max-width: 700px) and (min-height: 521px)');
  // Steps whose 3D view must stay visible beside the panel on short landscape tablets.
  const sideStep = s => s.type === 'tour' || s.type === 'classify' || s.demo?.view === 'earth-moon' || sizeComparison(s) || lightTravel(s);
  const el = (tag, text, cls) => { const n = document.createElement(tag); if (text) n.textContent = text; if (cls) n.className = cls; return n; };
  function button(text, action, cls) { const b = el('button', text, cls); b.type = 'button'; b.addEventListener('click', action); return b; }
  // Learn-only camera views and the single body each one supports.
  const views = Object.freeze({ 'day-night': 'earth', 'earth-moon': 'earth' });
  // Each experiment kind runs in exactly one Earth view; the engine comes from the adapter's registry.
  const experimentViews = Object.freeze({ 'earth-day-night': 'day-night', 'moon-phases': 'earth-moon' });
  const dayNight = s => s?.type === 'experiment' && s.experiment.kind === 'earth-day-night';
  const moonPhases = s => s?.type === 'experiment' && s.experiment.kind === 'moon-phases';
  // Stage-backed experiments (adapter.stages) draw their own scene and need no Solar System camera view.
  const sizeComparison = s => s?.type === 'experiment' && s.experiment.kind === 'size-comparison';
  // The Earth–Moon light experiment (Phase 6H.3.2) shares the comparison steps' compact, side and panel layouts.
  const lightTravel = s => s?.type === 'experiment' && s.experiment.kind === 'light-travel';
  const planetsStep = s => lightTravel(s) && s.experiment.journey === 'planets'; // Phase 6H.5.3
  const stageKind = kind => typeof kind === 'string' && Object.prototype.hasOwnProperty.call(adapter.stages ?? {}, kind);
  const experimentOf = s => s?.type !== 'experiment' ? null : stageKind(s.experiment.kind) ? adapter.stages[s.experiment.kind] : adapter.experiments[s.experiment.kind];
  const compactExperimentStep = s => dayNight(s) && shortExperimentLayout.matches || (moonPhases(s) || sizeComparison(s) || lightTravel(s)) && compactMoonLayout.matches;
  // Light experiment (Phase 6H.3.2): the learner's prediction (0–100 % of the Earth–Moon surface route, or null before any
  // choice) lives for the lesson session, so a repeated run keeps it for comparison. It never changes the simulation.
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let lightTip = null;
  // 15-second journey (Phase 6H.4.2): the learner's guess of how many Earth–Moon distances light covers (3, 12 or 100), or null.
  // Kept for the lesson session like the tip; it never reaches the stage (physics, camera and ruler are unaffected).
  const LIGHT_CHOICES = Object.freeze([3, 12, 100]);
  let lightChoice = null;
  // Sun-to-planets journey (Phase 6H.5.3.1): two optional guesses (light time to Earth, then to Neptune), as times in seconds; kept for the
  // lesson session, cleared by "Opakovať pokus". They never reach the stage. The answer is the option nearest to the LightData time (in
  // ratio, the options being 60-fold apart), so no physical value is repeated here.
  const PLANET_GUESSES = Object.freeze({
    earth: Object.freeze([{ seconds: 8, text: 'Asi 8 sekúnd', tip: 'asi 8 sekúnd' }, { seconds: 480, text: 'Asi 8 minút', tip: 'asi 8 minút' }, { seconds: 28800, text: 'Asi 8 hodín', tip: 'asi 8 hodín' }]),
    neptune: Object.freeze([{ seconds: 2400, text: 'Asi 40 minút', tip: 'asi 40 minút' }, { seconds: 14400, text: 'Asi 4 hodiny', tip: 'asi 4 hodiny' }, { seconds: 345600, text: 'Asi 4 dni', tip: 'asi 4 dni' }])
  });
  const PLANET_QUESTIONS = Object.freeze({ earth: 'Ako dlho letí svetlo zo Slnka k Zemi?', neptune: 'Ako dlho bude svetlo letieť až k Neptúnu?' });
  let planetGuess = { earth: null, neptune: null };
  // Which question a planets phase belongs to; the guess can change only in its question phase (ready, mars).
  const planetQuestion = phase => ['mars', 'second', 'neptune'].includes(phase) ? 'neptune' : 'earth';
  const lightNumber = (value, digits) => new Intl.NumberFormat('sk-SK', { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
  // The comparison the size-comparison experiment offers (Phase 6G.3); the stage accepts any planet pair.
  const COMPARISON_PAIR = Object.freeze(['jupiter', 'earth']);
  // Planet inspection (Phase 6G.7.1): planets in order from the Sun, the turn step for the buttons and the panel texts.
  const INSPECT_BODIES = Object.freeze(['mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune']);
  const INSPECT_STEP = Math.PI / 12; // 15°
  const INSPECT_HINT = 'Klepni alebo klikni na planétu a preskúmaj ju zblízka.', INSPECT_NOTE = 'Zväčšený detail – nie v skutočnom pomere';
  const PAIR_NOTE = 'Porovnávame priemery planét, nie ich objemy.', INSPECT_TURN = 'Potiahni planétu alebo ju otoč šípkami.';
  const kmText = value => `${new Intl.NumberFormat('sk-SK').format(Math.round(value))} km`;
  // Approved configured comparisons (Phase 6G.4.2): a lesson may start at one pair and reveal the next. Only these exact
  // start → reveal combinations are accepted, so content cannot ask the stage for an unapproved star comparison.
  // An entry may give its own result sentence, announcements and an explanation shown after the reveal (Phase 6G.5.3:
  // Betelgeuse is an estimate, so its texts are written out and rounded instead of derived from the exact model ratio).
  const REVEALS = Object.freeze([Object.freeze({
    start: Object.freeze(['jupiter', 'earth']), reveal: Object.freeze(['sun', 'jupiter']), show: 'Odhaľ veľkosť Slnka', back: 'Späť k Jupiteru',
    intro: 'Jupiter je najväčšia planéta našej slnečnej sústavy. Ale aký veľký je v porovnaní so Slnkom?'
  }), Object.freeze({
    start: Object.freeze(['sun', 'jupiter']), reveal: Object.freeze(['betelgeuse', 'sun']), show: 'Odhaľ Betelgeuze', back: 'Späť k Slnku',
    intro: 'Už vieš, že Slnko je približne 10-krát širšie ako Jupiter. Čo sa stane, keď ho porovnáme s obrovskou hviezdou Betelgeuze?',
    result: 'Betelgeuze má podľa jedného odhadu približne 760-krát väčší priemer ako Slnko.',
    detail: 'Vedci jej veľkosť odhadujú. Podľa použitého odhadu je jej priemer približne 700 až 900-krát väčší než priemer Slnka.',
    announceReveal: 'Betelgeuze má podľa jedného odhadu približne 760-krát väčší priemer ako Slnko. Značka označuje skutočnú polohu Slnka, nie jeho veľkosť.',
    announceBack: 'Opäť vidíš Slnko a Jupiter. Slnko má približne 10-krát väčší priemer ako Jupiter.'
  }), Object.freeze({
    // The orbit view (Phase 6G.5.4.2): start and reveal are stage orbit states, not pairs. The note line stays visible on
    // every layout (the info line is screen-reader-only on phones), so it carries the question and the short result.
    kind: 'orbits', start: 'sun', reveal: 'betelgeuse', show: 'Ukáž Betelgeuze', back: 'Skryť Betelgeuze',
    intro: 'Kruhy ukazujú stredné vzdialenosti dráh planét od Slnka v skutočnom pomere.',
    result: 'Betelgeuze by siahala asi do 3,6 AU – ďalej ako dráha Marsu, ale nie až k dráhe Jupitera (5,2 AU).',
    noteBefore: 'Keby bola Betelgeuze na mieste Slnka, kam až by siahala?',
    noteAfter: 'Merkúr až Mars: vnútri Betelgeuze. Jupiter: mimo.',
    detail: 'Podľa použitého odhadu by povrch Betelgeuze siahal asi 3,6 AU od stredu (odhad 3,3 až 4,1 AU). Dráhy Merkúra, Venuše, Zeme a Marsu by boli vnútri hviezdy; Jupiter obieha v strednej vzdialenosti asi 5,2 AU, teda mimo nej. Je to len porovnanie veľkostí, nie simulácia toho, čo by sa s planétami naozaj stalo. Kruhy ukazujú zjednodušené stredné vzdialenosti, skutočné dráhy sú mierne eliptické. Veľkosť Betelgeuze je odhad z modelu, nie presné meranie.',
    announceReveal: 'Dráhy Merkúra, Venuše, Zeme a Marsu by boli vnútri Betelgeuze. Dráha Jupitera by zostala mimo nej.',
    announceBack: 'Opäť vidíš len dráhy planét okolo Slnka.'
  })]);
  const samePair = (a, b) => Array.isArray(a) && a.length === 2 && a.every(id => typeof id === 'string') && [...a].sort().join() === [...b].sort().join();
  function revealOf(s) {
    const e = s?.experiment;
    if (!sizeComparison(s) || e.start === undefined && e.reveal === undefined) return null;
    return REVEALS.find(r => r.kind === 'orbits' ? e.start?.orbits === r.start && e.reveal?.orbits === r.reveal
      : samePair(e.start?.pair, r.start) && samePair(e.reveal?.pair, r.reveal)) ?? null;
  }
  // The stage setting for one side of an approved reveal, and whether the stage currently shows (or targets) its reveal side.
  const stageSide = (r, side) => r.kind === 'orbits' ? { orbits: side } : { pair: [...side] };
  const atReveal = (r, state) => r.kind === 'orbits' ? state.orbits === r.reveal : !!state.pair && samePair(state.pair, r.reveal);
  // Spoken ratio words for the live region; the visible text keeps the numeral.
  const TIMES = Object.freeze({ 2: 'dvakrát', 3: 'trikrát', 4: 'štyrikrát', 5: 'päťkrát', 10: 'desaťkrát', 11: 'jedenásťkrát' });
  const earthMoonStep = s => s?.demo?.view === 'earth-moon';
  // Short phones open Earth–Moon observations collapsed so both bodies stay visible; side panels already leave room.
  const compactView = s => s.type === 'observe' && earthMoonStep(s) && compactTourLayout.matches && !sideTourLayout.matches;
  // Lit part of the Moon disc as seen from Earth: the limb on the lit side plus the terminator ellipse.
  function phasePath(fraction, litRight, r = 46) {
    const k = Math.min(1, Math.max(0, fraction)), rx = r * Math.abs(1 - 2 * k);
    return `M 0 ${-r} A ${r} ${r} 0 0 ${litRight ? 1 : 0} 0 ${r} A ${rx.toFixed(2)} ${r} 0 0 ${(k > 0.5) === litRight ? 1 : 0} 0 ${-r} Z`;
  }
  // Experiment actions stay focusable while busy: aria-disabled during an animation (the engines ignore repeat
  // activation), native disabled only while the experiment is unavailable.
  function setAvailability(button, unavailable, busy) {
    button.disabled = unavailable;
    if (busy && !unavailable) button.setAttribute('aria-disabled', 'true'); else button.removeAttribute('aria-disabled');
  }
  // Slovak "zo" before numbers whose spoken genitive starts with s/z/š (štyroch, šiestich, siedmich), else "z".
  const stepOf = (n, total) => `Krok ${n} ${[4, 6, 7].includes(total) ? 'zo' : 'z'} ${total}`;
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
        if (s.demo?.motion !== undefined && (typeof s.demo.motion !== 'boolean' || s.demo.kind !== 'focus' || s.type === 'experiment')) throw Error('Invalid lesson demonstration');
        if (s.type === 'observe' && !optionalText(s.note)) throw Error('Invalid lesson step');
        if (s.demo?.view && (s.demo.kind !== 'focus' || !Object.prototype.hasOwnProperty.call(views, s.demo.view) || views[s.demo.view] !== s.demo.body)) throw Error('Invalid lesson view');
        if (s.type === 'experiment') {
          const kind = s.experiment?.kind;
          const earthView = Object.prototype.hasOwnProperty.call(experimentViews, kind) && !!adapter.experiments?.[kind] && s.demo?.body === 'earth' && s.demo?.view === experimentViews[kind];
          if (!earthView && !(stageKind(kind) && s.demo === undefined)) throw Error('Invalid lesson experiment');
          // A comparison step is either unconfigured (the planet lineup) or exactly one approved start → reveal pair.
          if (kind === 'size-comparison') {
            const keys = Object.keys(s.experiment), part = v => v === undefined || v && typeof v === 'object' && Object.keys(v).length === 1 && (Array.isArray(v.pair) || typeof v.orbits === 'string');
            if (keys.some(k => !['kind', 'start', 'reveal'].includes(k)) || !part(s.experiment.start) || !part(s.experiment.reveal)) throw Error('Invalid lesson experiment');
            if ((s.experiment.start !== undefined || s.experiment.reveal !== undefined) && !revealOf(s)) throw Error('Invalid lesson experiment');
          }
        }
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
  // Earth–Moon steps keep the camera on Earth and the Moon; other picks, and the overview (id null), only explain why.
  function holdView(id) {
    const current = active && lesson?.steps[step];
    if (!earthMoonStep(current)) return false;
    if (id === 'earth') return true;
    const name = id && adapter.bodyInfo(id)?.name;
    notice = { text: `Teraz pozorujeme Zem a Mesiac. ${name ? `${name} si môžeš pozrieť v režime Objavuj.` : 'Celú sústavu uvidíš na konci lekcie.'}`, target: null };
    render(false); announce(notice.text);
    return true;
  }
  // Scene and top-bar picks during a tour never let the camera show a different planet than the panel.
  function selectBody(id) {
    if (holdView(id)) return true;
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
    document.body.classList.remove('is-learn', 'is-learn-classify', 'is-learn-moon'); adapter.sync();
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
    cleanup(); snapshot = adapter.snapshot(); lesson = found; step = 0; expanded = true; tourReading = false; viewReading = false; lightTip = null; lightChoice = null; planetGuess = { earth: null, neptune: null }; render();
  }
  function move(index, stopIndex = 0) {
    if (!active || !lesson || index < 0 || index >= lesson.steps.length) return;
    const target = lesson.steps[index];
    session++; adapter.cancel(); experimentDetailsOpen = false; step = index; answer = null; feedback = null; notice = null;
    stop = target.type === 'tour' && target.stops[stopIndex] ? stopIndex : target.type === 'classify' ? Math.min(Math.max(stopIndex, 0), target.items.length) : 0;
    if (target.type === 'classify') classifyState(target);
    completed = lesson.steps[step].type === 'summary'; expanded = target.type === 'tour' && compactTourLayout.matches ? tourReading : compactView(target) ? viewReading : true; render();
    root.scrollTop = 0; // A new step starts at its heading; short screens scroll the whole panel, which render() keeps.
    demonstrate();
    if (target.type === 'classify') announce(classifyAnnouncement(target));
  }
  function demonstrate() {
    if (!active || !lesson) return;
    const current = lesson.steps[step];
    const demo = stepDemo(current);
    // Steps without a demonstration start only stage experiments (size comparison; Phase 6H.2: any registered stage kind).
    if (!demo && !(current.type === 'experiment' && stageKind(current.experiment.kind))) return;
    Object.values(adapter.experiments).forEach(experiment => experiment.end());
    if (demo) adapter.demonstrate(demo);
    if (current.type === 'experiment') {
      const owner = session;
      comparisonPending = false;
      // A comparison stage starts with all eight planets (or a configured step's start pair); Earth experiments receive
      // their lesson configuration.
      const reveal = revealOf(current);
      experimentOf(current).begin(!sizeComparison(current) ? current.experiment : reveal ? stageSide(reveal, reveal.start) : { lineup: 'planets' }, () => { if (active && session === owner) syncExperiment(); });
    }
  }
  function syncExperiment() {
    if (!experimentUI || !active || lesson?.steps[step].type !== 'experiment') return;
    const state = experimentOf(lesson.steps[step]).state();
    if (experimentUI.kind === 'moon-phases') { syncMoonPhases(state); return; }
    if (experimentUI.kind === 'size-comparison') { syncComparison(state); return; }
    if (experimentUI.kind === 'light-travel') { syncLight(state); return; }
    setAvailability(experimentUI.turn, !state.active, state.busy);
    experimentUI.reset.disabled = !state.active;
    experimentUI.light.textContent = state.active ? (state.day ? 'DEŇ' : 'NOC') : 'Pripravujeme pokus…';
    experimentUI.light.dataset.day = String(!!state.day);
    const explanation = state.boundary ? 'Miesto je blízko rozhrania dňa a noci. Model neurčuje presný čas východu ani západu Slnka.' : state.day ? 'Na označené miesto dopadá priame slnečné svetlo.' : 'Označené miesto je odvrátené od priameho slnečného svetla.';
    experimentUI.explanation.textContent = state.active ? explanation : '';
    experimentUI.visibility.textContent = state.hiddenReason === 'back' ? 'Miesto je na odvrátenej strane Zeme. Jeho stav sleduj tu v paneli.' : state.hiddenReason ? 'Značka je mimo voľného výhľadu. Stav miesta zostáva dostupný tu.' : 'Krúžok označuje stále to isté miesto na povrchu.';
    const announcement = state.active && !state.busy ? `${state.turns ? 'Otočenie dokončené.' : 'Pokus je pripravený.'} Označené miesto: ${state.day ? 'deň' : 'noc'}.` : '';
    if (experimentUI.status.textContent !== announcement) experimentUI.status.textContent = announcement;
  }
  // Presentation only: the drawing, name and percentage come from the experiment's model geometry.
  function syncMoonPhases(state) {
    const ui = experimentUI;
    setAvailability(ui.advance, !state.active, state.busy); ui.reset.disabled = !state.active;
    if (!state.active) { ui.name.textContent = 'Pripravujeme pokus…'; ui.fraction.textContent = ''; ui.position.textContent = ''; return; }
    const percent = Math.round(state.fraction * 100), name = state.name ?? 'Mesiac sa posúva…';
    ui.lit.setAttribute('d', phasePath(state.fraction, state.litRight));
    ui.name.textContent = name;
    ui.fraction.textContent = `Osvetlená časť: približne ${percent} %`;
    ui.position.textContent = `Poloha ${state.position} z ${state.positions}`;
    // At New and Full Moon (0 % or 100 %) there is no lit side to name.
    const side = percent > 0 && percent < 100 ? `, svetlá strana ${state.litRight ? 'vpravo' : 'vľavo'}` : '';
    ui.svg.setAttribute('aria-label', `Pohľad zo Zeme: ${name.endsWith('…') ? name : `${name}.`} Osvetlená časť približne ${percent} %${side}.`);
    const announcement = state.busy ? '' : `${state.name}. Osvetlená časť približne ${percent} %.`;
    if (ui.status.textContent !== announcement) ui.status.textContent = announcement;
  }
  // Learn owns the controls and words; the stage owns objects, ratios and motion. One primary button changes with the
  // state (compare → show/hide the reference row, with aria-pressed), so keyboard focus never sits on a vanishing control.
  function syncComparison(state) {
    if (experimentUI.reveal) { syncReveal(state); return; }
    const ui = experimentUI;
    // The note keeps the height of its longest text (hint, pair note, disclaimer), so the lineup never moves (Phase 6G.7.1).
    if (!ui.noteHeld && ui.note.offsetHeight > 2) {
      ui.noteHeld = true; const before = ui.note.textContent;
      // Exact (fractional) heights: a rounded value would move the true-scale lineup by a fraction of a pixel.
      const heights = [INSPECT_HINT, PAIR_NOTE, INSPECT_TURN].map(text => { ui.note.textContent = text; return ui.note.getBoundingClientRect().height; });
      ui.note.style.minHeight = `${Math.max(...heights)}px`; ui.note.textContent = before;
    }
    if (state.body) { syncInspect(state); return; }
    if (ui.inspected) { ui.inspected = null; if (ui.turn.contains(document.activeElement)) ui.primary.focus({ preventScroll: true }); sideTop(); }
    if (ui.text) ui.text.hidden = false; // The lineup's own words return with the lineup (Phase 6G.7.1.1).
    ui.restart.hidden = false;
    ui.turn.hidden = true; ui.pick.hidden = false; ui.info.classList.remove('learn-visually-hidden');
    ui.pick.style.visibility = state.pair ? 'hidden' : ''; // Kept in the layout, so the pair view does not move the planets.
    const [big, small] = COMPARISON_PAIR.map(id => adapter.bodyInfo(id).name);
    const count = Math.round(SizeData.ratio(...COMPARISON_PAIR)), pair = !!state.pair, reference = !!state.reference;
    setAvailability(ui.primary, !state.active, state.busy); setAvailability(ui.back, !state.active, state.busy);
    ui.primary.textContent = !pair ? `Porovnaj ${small} a ${big}` : reference ? `Skryť ${count} Zemí` : `Ukáž ${count} Zemí`;
    if (pair) ui.primary.setAttribute('aria-pressed', String(reference)); else ui.primary.removeAttribute('aria-pressed');
    if (!pair && ui.back.contains(document.activeElement)) ui.primary.focus({ preventScroll: true });
    ui.back.hidden = !pair;
    const sentence = `${big} má približne ${count}-krát väčší priemer ako ${small}.`, row = `${count} Zemí vedľa seba má približne rovnakú šírku ako ${big}.`;
    ui.info.textContent = !state.active ? 'Pripravujeme porovnanie…' : !pair ? 'Všetkých osem planét je v skutočnom pomere priemerov.' : reference ? row : sentence;
    // Kept in the layout in every state: the lineup shows how to open a planet, the pair what is compared.
    ui.note.textContent = pair ? PAIR_NOTE : INSPECT_HINT; ui.note.style.visibility = '';
    // Each finished request is announced once in the Learn live region.
    if (comparisonPending && state.active && !state.busy) {
      comparisonPending = false;
      announce(!pair ? 'Opäť vidíš všetkých osem planét v skutočnom pomere priemerov.' : reference ? `${row} Porovnávame priemery planét, nie ich objemy.` : sentence);
    }
  }
  // Configured reveal (Phase 6G.4.2): one primary button toggles between the start pair and the revealed pair. The stage
  // state is the only record of which pair is shown; while it moves, the button keeps its label and is aria-disabled.
  // A busy stage is always moving between the two pairs, so the panel describes the pair it is leaving until the move
  // ends; this also holds for a panel rebuilt mid-transition (for example after a responsive layout change).
  function syncReveal(state) {
    const ui = experimentUI, entry = ui.reveal, { start, reveal, show, back, intro, result, announceReveal, announceBack } = entry;
    // While busy the panel describes the side it is leaving (Phase 6G.4.4), for pairs and orbit states alike.
    const revealed = state.busy ? !atReveal(entry, state) : atReveal(entry, state);
    let pairResult = null, words = null;
    if (entry.kind !== 'orbits') {
      // Pair texts; names from SizeData (it also holds the stars the Solar System scene does not have, such as Betelgeuse).
      const shown = revealed ? reveal : start, [big, small] = shown.map(id => SizeData.bodies[id].name), count = Math.round(SizeData.ratio(...shown));
      pairResult = `${big} má približne ${count}-krát väčší priemer ako ${small}.`;
      words = `${big} má približne ${TIMES[count] ?? `${count}-krát`} väčší priemer ako ${small}. Porovnávame priemery, nie objemy.`;
    }
    setAvailability(ui.primary, !state.active, state.busy); ui.back.hidden = true;
    if (!ui.fitted && ui.info.offsetHeight > 0) fitReveal(ui); // Waits until the panel is laid out.
    ui.primary.textContent = revealed ? back : show;
    ui.info.textContent = !state.active ? 'Pripravujeme porovnanie…' : revealed ? result ?? pairResult : intro;
    if (entry.noteBefore) ui.note.textContent = revealed ? entry.noteAfter : entry.noteBefore;
    // The explanation keeps its place in every state, so the panel never changes height when it appears.
    if (ui.detail) ui.detail.style.visibility = revealed && state.active ? '' : 'hidden';
    if (comparisonPending && state.active && !state.busy) {
      comparisonPending = false;
      announce((revealed ? announceReveal : announceBack) ?? words);
    }
  }
  // Once per panel build (Phase 6G.5.3): the explanation line keeps the height of its longer text, so the button does
  // not move when the text changes; in the short-landscape side panel the action comes first when it would otherwise
  // fall below the panel's visible area. Both only act when needed.
  function fitReveal(ui) {
    ui.fitted = true;
    const { intro, result, noteBefore, noteAfter } = ui.reveal;
    const hold = (element, texts) => {
      if (element.offsetHeight <= 2) return; // Screen-reader-only on this layout.
      const before = element.textContent, heights = texts.map(text => { element.textContent = text; return element.offsetHeight; });
      element.style.minHeight = `${Math.max(...heights)}px`; element.textContent = before;
    };
    if (result) hold(ui.info, [intro, result]);
    if (noteBefore) hold(ui.note, [noteBefore, noteAfter]);
    // Orbit view on phones (Phase 6G.5.4.2a): an opened explanation scrolls inside the panel body, which keeps its collapsed
    // height, so the panel never grows over the orbit diagram and its legend.
    const details = document.getElementById('learn-experiment-details'), body = root.querySelector('.learn-body');
    if (ui.reveal.kind === 'orbits' && compactMoonLayout.matches && details && body && !details.hidden) {
      details.hidden = true; const collapsed = body.offsetHeight; details.hidden = false;
      Object.assign(body.style, { maxHeight: `${collapsed}px`, overflowY: 'auto' }); details.style.maxHeight = 'none';
      // The body no longer moves the button when the note changes, so the note takes only its own lines here; with a
      // tighter gap the start of the explanation shows below the button and the rest scrolls.
      ui.note.style.minHeight = ''; details.style.marginTop = '4px';
    }
    const actions = ui.primary.parentElement;
    if (root.dataset.layout === 'side' && !actions.contains(document.activeElement) && ui.primary.getBoundingClientRect().bottom > root.getBoundingClientRect().bottom) ui.info.before(actions);
    // The visible short result (orbit view) follows the action when it would otherwise fall below the side panel's view.
    if (root.dataset.layout === 'side' && ui.reveal.noteBefore && ui.note.getBoundingClientRect().bottom > root.getBoundingClientRect().bottom) ui.info.before(ui.note);
  }
  // Inspection (Phase 6G.7.1): the enlarged planet, its name and real diameter, the disclaimer, the turn buttons and the way
  // back. The stage state is the only record of which planet is open; it is announced once when it opens.
  function syncInspect(state) {
    const ui = experimentUI, name = SizeData.bodies[state.body].name, size = kmText(SizeData.bodies[state.body].diameterKm);
    setAvailability(ui.primary, !state.active, state.busy); ui.back.hidden = true; ui.primary.removeAttribute('aria-pressed');
    ui.primary.textContent = 'Späť na porovnanie';
    ui.info.textContent = `${name} – priemer ${size}`;
    // The stage caption shows the name, diameter and disclaimer; in the short side panel the info line is for screen readers.
    ui.info.classList.toggle('learn-visually-hidden', root.dataset.layout === 'side');
    ui.note.textContent = INSPECT_TURN; ui.note.style.visibility = '';
    if (ui.pick.contains(document.activeElement)) ui.primary.focus({ preventScroll: true });
    ui.pick.hidden = true; ui.turn.hidden = false;
    if (ui.text) ui.text.hidden = true; // Its words describe the lineup, not the one enlarged planet.
    // "Späť na porovnanie" already leads back to the lineup, so the restart waits until then (Phase 6G.7.1.2).
    if (ui.restart.contains(document.activeElement)) ui.primary.focus({ preventScroll: true });
    ui.restart.hidden = true;
    if (ui.inspected !== state.body) {
      ui.inspected = state.body; comparisonPending = false; sideTop();
      announce(`${name}, priemer ${size}. ${INSPECT_NOTE}. Planétu otočíš potiahnutím alebo tlačidlami.`);
    }
  }
  // Short landscape (Phase 6G.7.1.1): the whole side panel scrolls. Opening or closing an inspection starts it at the top,
  // so the heading, the way back and the turn buttons are in view; the navigation below stays reachable by scrolling.
  function sideTop() { if (root.dataset.layout === 'side') root.scrollTop = 0; }
  // Light experiment panel (Phase 6H.3.2). The stage state is the only record of the experiment; the panel explains it and
  // announces only the start, a pause, the 1 s result and the arrival (never during the run).
  // Sun to planets (Phase 6H.5.3.1): times from LightData only ("8 min 19 s" style, as on the stage labels).
  function planetFeedback(id, guess) {
    if (guess == null) return null; // no guess: the result alone, without comment
    const actual = LightData.sunToPlanet(id).lightSeconds, options = PLANET_GUESSES[id], ratio = g => Math.abs(Math.log(g / actual));
    const nearest = options.reduce((a, b) => ratio(b.seconds) < ratio(a.seconds) ? b : a);
    if (guess === nearest.seconds) return `Správne! Svetlo letí k ${id === 'earth' ? 'Zemi' : 'Neptúnu'} ${nearest.tip}.`;
    return guess < actual ? 'Svetlo letelo dlhšie, než si tipol.' : 'Svetlo letelo kratšie, než si tipol.';
  }
  function planetsCopy(state, tight) {
    const guess = state.guess ?? {}, time = id => LightData.formatDuration(LightData.sunToPlanet(id).lightSeconds);
    const tipLine = id => tight && guess[id] != null ? [`Tvoj tip pre ${id === 'earth' ? 'Zem' : 'Neptún'}: ${PLANET_GUESSES[id].find(o => o.seconds === guess[id]).tip}.`] : [];
    const paused = ['Experiment je pozastavený.', ...(state.pauseReason === 'hidden' ? ['Zastavili sme ho, keď si odišiel zo stránky.'] : [])];
    if (state.phase === 'countdown') return { lines: ['Pozor… svetlo vyrazí o chvíľu.', ...tipLine('earth')] };
    if (state.phase === 'first') return { lines: [...(state.paused ? paused : ['Svetlo letí k Marsu… Prehrávanie je 60-krát rýchlejšie.']), ...tipLine('earth')] };
    if (state.phase === 'second') return { lines: [...(state.paused ? paused : ['Svetlo letí k Neptúnu… Prehrávanie je 600-krát rýchlejšie.']), ...tipLine('neptune')] };
    if (state.phase === 'mars') {
      const feedback = planetFeedback('earth', guess.earth);
      // The feedback sits right under the result (above the next question), so it is in view without scrolling on every layout.
      return { lead: `K Zemi letelo svetlo ${time('earth')}.`, feedback, ask: PLANET_QUESTIONS.neptune, lines: tight ? [] : ['Ďalej uvidíš celú cestu až k Neptúnu. Zmení sa mierka a prehrávanie bude 10-krát rýchlejšie.'] };
    }
    if (state.phase === 'neptune') {
      const feedback = planetFeedback('neptune', guess.neptune), hours = Math.floor(LightData.sunToPlanet('neptune').lightSeconds / 3600);
      const discovery = `Svetlo, ktoré práve dopadlo na Neptún, vyšlo zo Slnka pred viac ako ${hours} hodinami.`;
      return { lead: `K Neptúnu letelo svetlo ${time('neptune')}!`, feedback, lines: [discovery] };
    }
    return { lead: PLANET_QUESTIONS.earth, lines: state.interrupted ? ['Odpočítavanie sme zastavili, keď si odišiel zo stránky. Svetlo vyšleš znova tlačidlom.'] : tight ? [] : ['Tipni si a vyšli svetlo. Pri Marse sa pokus na chvíľu zastaví.'] };
  }
  function lightCopy(state, tight = false) {
    if (state.journey === 'planets') return planetsCopy(state, tight);
    // The 15-second journey (Phase 6H.4.1): scene foundation only; its prediction and result feedback come in Phase 6H.4.2.
    if (state.journey === 'fifteen') {
      // Compact and side panels show the guess as a short line once the experiment starts (the row of choices is hidden there).
      const guess = tight && state.choice != null ? [`Tvoj odhad: asi ${state.choice}-krát.`] : [];
      if (state.phase === 'countdown') return { lines: ['Pozor… svetlo vyrazí o chvíľu.', ...guess] };
      if (state.phase === 'first') return { lines: [...(state.paused ? ['Experiment je pozastavený.', ...(state.pauseReason === 'hidden' ? ['Zastavili sme ho, keď si odišiel zo stránky.'] : [])] : ['Svetlo letí…']), ...guess] };
      if (state.phase === 'done') {
        // Rounded child-facing numbers from LightData ("takmer" when the rounded value is above the exact one).
        const km = LightData.lightDistanceKm(15), millions = Math.round(km / 1e5) / 10, units = LightData.inEarthMoonDistances(km), times = Math.round(units);
        const about = (rounded, exact) => rounded > exact ? 'takmer' : 'približne';
        const choice = state.choice ?? null, nearest = LIGHT_CHOICES.reduce((a, b) => Math.abs(b - units) < Math.abs(a - units) ? b : a);
        const feedback = choice === null ? 'Nabudúce si najprv tipni, koľkokrát to bude.' : choice === nearest ? 'Správny odhad!' : choice < nearest ? 'Svetlo doletelo ďalej, než si odhadol.' : 'Svetlo nedoletelo tak ďaleko, ako si odhadol.';
        const lead = `Za 15 sekúnd svetlo preletelo ${about(millions * 1e6, km)} ${lightNumber(millions, 1)} milióna kilometrov!`, times12 = `To je ${about(times, units)} ${times}-krát vzdialenosť Zem–Mesiac.`;
        // Compact and side panels: the same sentences in one paragraph, so the result fits the ready state's height.
        return tight ? { lead, lines: [`${times12} ${feedback}`] } : { lead, lines: [times12, feedback] };
      }
      return { lead: 'Koľkokrát by svetlo za 15 sekúnd preletelo vzdialenosť Zem–Mesiac?', lines: state.interrupted ? ['Odpočítavanie sme zastavili, keď si odišiel zo stránky. Svetlo vyšleš znova tlačidlom.'] : tight ? [] : ['Zem a Mesiac budú vyzerať menšie, pretože vidíme omnoho väčšiu vzdialenosť.'] };
    }
    const tip = state.prediction, near = km => LightData.formatKm(Math.round(km / 1000) * 1000);
    const travelled = LightData.lightDistanceKm(1), remaining = LightData.earthMoonProgress(1).remainingKm;
    const roundedTravel = Math.round(travelled / 1000) * 1000, roundedRemaining = Math.round(remaining / 500) * 500;
    const verdict = !tip ? null : tip.verdict === 'close' ? 'Tvoj odhad bol blízko!' : tip.verdict === 'further' ? 'Svetlo doletelo ďalej, než si odhadol.' : 'Svetlo nedoletelo tak ďaleko, ako si odhadol.';
    // Result: three short facts and the tip feedback; exact values and the tip in km are in the explanation (lightDetail).
    const tipLine = tip ? verdict : 'Nabudúce si najprv tipni posúvačom.';
    if (state.phase === 'countdown') return { lines: ['Pozor… svetlo vyrazí o chvíľu.'] };
    if (state.phase === 'first' || state.phase === 'second') {
      if (!state.paused) return { lines: ['Svetlo letí k Mesiacu…'] };
      return { lines: ['Experiment je pozastavený.', ...(state.pauseReason === 'hidden' ? ['Zastavili sme ho, keď si odišiel zo stránky.'] : [])] };
    }
    const about = roundedTravel > travelled ? 'takmer' : 'približne';
    if (state.phase === 'one-second') return { lead: 'Ani svetlo nestihlo doraziť!', lines: [`Prešlo ${about} ${LightData.formatKm(roundedTravel)}.`, `K Mesiacu zostáva približne ${LightData.formatKm(roundedRemaining)}.`, tipLine] };
    if (state.phase === 'arrived') return { lead: `Svetlo dorazilo na Mesiac približne za ${lightNumber(state.seconds, 2)} sekundy.`, lines: ['Aj svetlo potrebuje na cestu k Mesiacu viac ako jednu sekundu.'] };
    // Compact and side panels keep only the question (the slider sits right below it); wider panels add the hint.
    const hint = state.interrupted ? 'Odpočítavanie sme zastavili, keď si odišiel zo stránky. Svetlo vyšleš znova tlačidlom.' : tight ? null : 'Posuň posúvač na miesto, kam podľa teba svetlo doletí. Nemusíš byť presný.';
    return { lead: 'Kam sa podľa teba dostane svetlo za jednu sekundu?', lines: hint ? [hint] : [] };
  }
  function fillLight(ui, copy) {
    ui.lead.textContent = copy.lead ?? ''; ui.lead.hidden = !copy.lead;
    if (ui.ask) { ui.ask.textContent = copy.ask ?? ''; ui.ask.hidden = !copy.ask; } // planets: the second question below the Earth result
    if (ui.feedback) { ui.feedback.textContent = copy.feedback ?? ''; ui.feedback.hidden = !copy.feedback; } // planets: the guess feedback under the result
    ui.message.replaceChildren(...copy.lines.map(line => el('p', line)));
  }
  // Planets: the Earth question's choices up to the Mars stop, then the Neptune question's; compact and side panels show a row only
  // in its question phase (the guess then appears as a "Tvoj tip" line), wider panels keep the chosen answer visible.
  function showPlanetChoices(ui, phase) {
    const current = planetQuestion(phase), asking = phase === 'ready' || phase === 'mars';
    for (const [id, set] of Object.entries(ui.choiceSets)) set.hidden = id !== current || (ui.tight && !asking);
  }
  // Once per panel build: the experiment box keeps the height of its tallest state (ready, the longest result, arrival), so
  // the panel and with it the route never move between states (the comparison panel holds its note the same way).
  function holdLight(ui) {
    if (ui.held || ui.box.offsetHeight <= 2) return;
    ui.held = true; ui.output.textContent = 'Ešte si netipol'; // the tip row as it will read
    const longest = { earth: PLANET_GUESSES.earth[2].seconds, neptune: PLANET_GUESSES.neptune[0].seconds }; // the longer feedback sentences
    const samples = ui.journey === 'fifteen' ? [{ journey: 'fifteen', phase: 'ready' }, { journey: 'fifteen', phase: 'done', choice: 100 }, { journey: 'fifteen', phase: 'first', choice: 100 }]
      : ui.journey === 'planets' ? [{ journey: 'planets', phase: 'ready' }, { journey: 'planets', phase: 'mars', guess: longest }, { journey: 'planets', phase: 'neptune', guess: longest }, { journey: 'planets', phase: 'second', guess: longest }]
      : [{ phase: 'ready', prediction: null }, { phase: 'one-second', prediction: { verdict: 'shorter', km: 376000 } }, { phase: 'arrived', seconds: LightData.earthMoonTravelSeconds() }];
    // Planets on phones (Phase 6H.5.3.2): the panel holds two heights, one for the question and result states and a shorter one for
    // the countdown and the runs, so more of the stage is free while the light flies. The stage re-frames only at those changes.
    const modes = ui.journey === 'planets' && ui.compact;
    if (modes) samples.push({ journey: 'planets', phase: 'countdown', guess: longest }, { journey: 'planets', phase: 'first', paused: true, pauseReason: 'hidden', guess: longest }, { journey: 'planets', phase: 'second', paused: true, guess: longest });
    const heights = samples.map(sample => {
      fillLight(ui, lightCopy(sample, ui.tight)); ui.pick.hidden = sample.phase !== 'ready' || ui.journey !== 'earth-moon';
      ui.secondary.hidden = ui.journey === 'planets' ? !(sample.paused || sample.phase === 'countdown') : sample.phase !== 'one-second';
      if (ui.choices) ui.choices.hidden = ui.tight && sample.phase !== 'ready';
      if (ui.choiceSets) showPlanetChoices(ui, sample.phase);
      ui.skip.hidden = !(reducedMotion.matches && !['arrived', 'neptune', 'second'].includes(sample.phase));
      return ui.box.getBoundingClientRect().height;
    });
    if (modes) {
      const run = sample => ['countdown', 'first', 'second'].includes(sample.phase);
      ui.heldModes = { question: Math.max(...heights.filter((_, i) => !run(samples[i]))), run: Math.max(...heights.filter((_, i) => run(samples[i]))) };
      ui.box.style.minHeight = `${ui.heldModes.question}px`;
    } else ui.box.style.minHeight = `${Math.max(...heights)}px`;
    ui.copyKey = null;
  }
  // The explanation area ("Vysvetlenie"): the exact values behind the short result and the learner's tip in kilometres.
  function lightDetail(state) {
    if (state.journey === 'planets') {
      const name = { mercury: 'Merkúr', venus: 'Venuša', earth: 'Zem', mars: 'Mars', jupiter: 'Jupiter', saturn: 'Saturn', uranus: 'Urán', neptune: 'Neptún' };
      return [`Čas letu svetla zo Slnka: ${LightData.PLANETS.map(id => `${name[id]} ${LightData.formatDuration(LightData.sunToPlanet(id).lightSeconds)}`).join(' · ')}.`,
        'Pokus má dve mierky: najprv 0 – 1,7 au (Slnko až Mars), potom 0 – 31 au (celá cesta k Neptúnu). 1 au je priemerná vzdialenosť Zeme od Slnka, asi 150 miliónov km.',
        'Prehrávanie je zrýchlené: najprv 60-krát (1 s = 1 minúta letu svetla), potom 600-krát (1 s = 10 minút). Veľké hodiny ukazujú skutočný čas letu svetla.',
        'Planéty sú v jednom rade len pre názornosť. Bodky sú značky, nie skutočná veľkosť.',
        'Časy platia pre priemerné vzdialenosti od stredu Slnka k stredu planéty. Skutočná vzdialenosť sa počas roka trochu mení.'];
    }
    const em = LightData.earthMoon, tip = state.prediction;
    if (state.journey === 'fifteen') {
      const ruler = `Jeden dielik pravítka je priemerná vzdialenosť stredov Zeme a Mesiaca: ${LightData.formatKm(em.centerKm)}. Prerušovaný kruh okolo Zeme je priemerná dráha Mesiaca, nie jeho presná poloha.`;
      const scale = 'Teraz sa pozeráme oveľa ďalej ako v prvom pokuse, preto Zem a Mesiac vyzerajú menšie.';
      const guess = state.choice != null && state.phase !== 'ready' ? [`Tvoj odhad: asi ${state.choice}-krát.`] : [];
      if (state.phase !== 'done') return [...guess, scale, ruler]; // the exact result appears only after the 15 seconds
      const km = LightData.lightDistanceKm(15);
      return [`Svetlo prejde za 15 sekúnd presne ${LightData.formatKm(km, 2)}. To je ${lightNumber(LightData.inEarthMoonDistances(km), 2)} × ${LightData.formatKm(em.centerKm)}.`, ...guess, scale, ruler];
    }
    const science = `Svetlo prejde za 1 sekundu presne ${LightData.formatKm(LightData.lightDistanceKm(1), 3)}. Od povrchu Zeme k povrchu Mesiaca je to v priemere ${LightData.formatKm(em.surfaceKm, 1)} `
      + `(stred Zeme – stred Mesiaca ${LightData.formatKm(em.centerKm)}), preto svetlu cesta trvá približne ${lightNumber(LightData.earthMoonTravelSeconds(), 2)} sekundy. Po 1 sekunde mu zostáva ${LightData.formatKm(LightData.earthMoonProgress(1).remainingKm, 3)}.`;
    return tip ? [science, `Tvoj tip: približne ${LightData.formatKm(Math.round(tip.km / 1000) * 1000)} od Zeme. Za „blízko“ považujeme tip do ${LightData.formatKm(Math.round(tip.toleranceKm / 1000) * 1000)} od skutočnej polohy svetla po 1 sekunde.`] : [science];
  }
  function syncLight(state) {
    const ui = experimentUI;
    if (ui.journey === 'fifteen') state = { ...state, choice: lightChoice }; // the learner's guess, for the panel's words only
    if (ui.journey === 'planets') state = { ...state, guess: { ...planetGuess } }; // both guesses, for the panel's words only
    holdLight(ui);
    const detail = lightDetail(state), detailKey = detail.join('|');
    if (ui.detailKey !== detailKey) { ui.detailKey = detailKey; ui.science.replaceChildren(...detail.map(text => el('p', text, 'learn-note'))); }
    const copy = lightCopy(state, ui.tight), key = JSON.stringify(copy);
    if (ui.copyKey !== key) { ui.copyKey = key; fillLight(ui, copy); }
    // The stage follows the learner's prediction (it is kept in Learn across repeats and step re-entry).
    const wanted = lightTip === null ? null : lightTip / 100;
    if (ui.journey === 'earth-moon' && (state.prediction?.fraction ?? null) !== wanted) experimentOf(lesson.steps[step]).setPrediction(wanted);
    const ready = state.phase === 'ready', running = state.phase === 'first' || state.phase === 'second';
    ui.slider.disabled = !ready;
    ui.pick.hidden = !ready || ui.journey !== 'earth-moon'; // after the start the tip stays visible on the route; 15 s and planets: no slider
    if (ui.choiceSets) { // planets: one question at a time; a guess can change only in its question phase (ready, mars)
      showPlanetChoices(ui, state.phase);
      for (const [id, set] of Object.entries(ui.choiceSets)) set.querySelectorAll('input').forEach(input => { input.disabled = state.phase !== (id === 'earth' ? 'ready' : 'mars'); input.checked = Number(input.value) === planetGuess[id]; input.closest('label').classList.toggle('is-selected', input.checked); });
      if (Object.values(ui.choiceSets).some(set => set.contains(document.activeElement) && document.activeElement.disabled)) ui.primary.focus({ preventScroll: true });
    }
    if (ui.choices) { // 15 s: the guess stays visible, but can change only before the start
      ui.choices.hidden = ui.tight && !ready; // compact panels: shown as the "Tvoj odhad" line instead
      ui.choices.querySelectorAll('input').forEach(input => { input.disabled = !ready; input.checked = Number(input.value) === lightChoice; input.closest('label').classList.toggle('is-selected', input.checked); });
      if (!ready && ui.choices.contains(document.activeElement)) ui.primary.focus({ preventScroll: true });
    }
    if (ui.slider.disabled && ui.pick.contains(document.activeElement)) ui.primary.focus({ preventScroll: true });
    const tipKm = lightTip === null ? null : LightData.formatKm(Math.round(lightTip / 100 * LightData.earthMoon.surfaceKm / 1000) * 1000);
    const tipText = tipKm === null ? 'Ešte si netipol' : `Môj tip: ≈ ${tipKm}`;
    if (ui.output.textContent !== tipText) ui.output.textContent = tipText;
    ui.slider.setAttribute('aria-valuetext', tipKm === null ? 'Ešte si netipol' : `Môj tip: približne ${tipKm} od Zeme, ${lightTip} % cesty k Mesiacu`);
    // The held height may only grow (fonts or a longer text), so no later state can move the route back.
    if (ui.heldModes) { const mode = running || state.phase === 'countdown' ? 'run' : 'question'; ui.heldMode = mode; ui.box.style.minHeight = `${ui.heldModes[mode]}px`; }
    const height = ui.box.getBoundingClientRect().height;
    if (ui.held && height > parseFloat(ui.box.style.minHeight || '0') + 0.01) { ui.box.style.minHeight = `${height}px`; if (ui.heldModes) ui.heldModes[ui.heldMode] = height; }
    ui.primary.textContent = state.phase === 'countdown' ? (state.countdown ? `Pozor… ${state.countdown}` : 'Pozor…') : running ? (state.paused ? 'Pokračovať' : 'Pozastaviť')
      : state.phase === 'one-second' ? 'Pokračovať k Mesiacu' : state.phase === 'mars' ? 'Pokračovať k Neptúnu' : state.phase === 'arrived' || state.phase === 'done' || state.phase === 'neptune' ? 'Opakovať pokus' : 'Vyšli svetlo';
    setAvailability(ui.primary, false, state.phase === 'countdown'); // aria-disabled: a second click cannot cancel or restart
    ui.secondary.textContent = state.phase === 'countdown' ? 'Zrušiť' : 'Začať odznova';
    ui.secondary.hidden = !(state.phase === 'countdown' || (running && state.paused) || state.phase === 'one-second');
    if (ui.secondary.hidden && ui.secondary.contains(document.activeElement)) ui.primary.focus({ preventScroll: true });
    ui.skip.textContent = ui.journey === 'planets' ? (state.phase === 'mars' ? 'Ukáž cestu k Neptúnu bez animácie' : 'Ukáž cestu k Marsu bez animácie')
      : state.phase === 'one-second' ? 'Ukáž príchod bez animácie' : 'Ukáž výsledok bez animácie';
    ui.skip.hidden = !(reducedMotion.matches && (ready || state.phase === 'one-second' || state.phase === 'mars'));
    if (ui.skip.hidden && ui.skip.contains(document.activeElement)) ui.primary.focus({ preventScroll: true });
    // One announcement per change of state, never during the run.
    const moment = state.phase === 'countdown' ? 'countdown' : running ? (state.paused ? 'paused' : 'running') : state.phase;
    if (ui.moment !== moment) {
      const previous = ui.moment; ui.moment = moment;
      if (moment === 'countdown') announce('Pozor, svetlo vyrazí po odpočítaní: tri, dva, jeden.');
      else if (moment === 'running' && previous === 'countdown') announce('Svetlo vyrazilo.');
      else if (moment === 'running' && previous === 'paused') announce('Pokračujeme.');
      else if (moment === 'running' && previous === 'mars') announce('Svetlo pokračuje k Neptúnu. Prehrávanie je 600-krát rýchlejšie.');
      else if (moment === 'paused') announce(copy.lines.join(' '));
      else if (['one-second', 'arrived', 'done', 'mars', 'neptune'].includes(moment)) { if (ui.journey === 'planets') revealPlanetResult(ui); const full = lightCopy(state, false); announce([full.lead, ...(full.feedback ? [full.feedback] : []), ...full.lines, ...(full.ask ? [full.ask] : [])].join(' ')); } // full text for screen readers
      else if (moment === 'ready' && previous && previous !== 'ready') announce(state.interrupted ? copy.lines[0] : ui.journey === 'fifteen' ? 'Pokus je pripravený.' : ui.journey === 'planets' ? 'Pokus je pripravený. Môžeš si znova tipnúť.' : 'Pokus je pripravený. Môžeš zmeniť svoj tip.');
    }
  }
  // Planets (Phase 6H.5.3.2): at the Mars stop and at Neptune, short landscape and desktop panels scroll just enough to show the
  // main action (and, where it fits, the last message line) without moving the result headline out of view. Never moves focus.
  function revealPlanetResult(ui) {
    if (ui.compact) return; // phones: the held panel shows everything
    const scroller = root.dataset.layout === 'side' ? root : root.querySelector('.learn-body');
    if (!scroller) return;
    const view = scroller.getBoundingClientRect(), lead = ui.lead.getBoundingClientRect(), action = ui.primary.getBoundingClientRect();
    const last = (ui.message.lastElementChild ?? ui.primary).getBoundingClientRect();
    const keepLead = Math.max(0, lead.top - view.top - 4), forAction = Math.max(0, action.bottom - view.bottom + 8), forLast = Math.max(0, last.bottom - view.bottom + 8);
    scroller.scrollTop += Math.max(forAction, Math.min(forLast, keepLead)); // the action always; the last line only while the headline stays
  }
  function lightAction(action) {
    const current = active && lesson?.steps[step];
    if (!lightTravel(current)) return;
    const stage = experimentOf(current), state = stage.state();
    if (!state.active) return;
    if (action === 'reset') stage.reset();
    else if (action === 'skip') stage.skip();
    else if (state.phase === 'ready') stage.start();
    else if (state.phase === 'first' || state.phase === 'second') { if (state.paused) stage.resume(); else stage.pause(); }
    else if (state.phase === 'one-second') stage.toMoon();
    else if (state.phase === 'mars') stage.toNeptune();
    else if (state.phase === 'neptune') { planetGuess = { earth: null, neptune: null }; stage.reset(); } // "Opakovať pokus": a fresh attempt, both guesses cleared
    else if (state.phase === 'arrived' || state.phase === 'done') stage.reset();
    syncExperiment();
  }
  function turnPlanet(yaw, pitch) {
    const current = active && lesson?.steps[step];
    if (!sizeComparison(current)) return;
    const stage = experimentOf(current);
    if (stage.state().body) stage.turn(yaw * INSPECT_STEP, pitch * INSPECT_STEP);
  }
  // Requests are ignored while the stage moves or reveals, so repeated activation cannot queue extra changes.
  function compare(action) {
    const current = active && lesson?.steps[step];
    if (!sizeComparison(current)) return;
    const stage = experimentOf(current), state = stage.state();
    if (!state.active || state.busy) return;
    const reveal = revealOf(current);
    const next = reveal ? stageSide(reveal, atReveal(reveal, state) ? reveal.start : reveal.reveal)
      : action === 'inspect' ? { body: experimentUI.select.value } : state.body ? { lineup: 'planets' } : action === 'back' ? { lineup: 'planets' } : !state.pair ? { pair: [...COMPARISON_PAIR] } : { pair: [...COMPARISON_PAIR], reference: !state.reference };
    comparisonPending = true;
    if (!stage.configure(next)) comparisonPending = false;
    syncExperiment();
  }
  function render(focusKey) {
    experimentUI = null;
    const tour = !!lesson && lesson.steps[step].type === 'tour' ? lesson.steps[step] : null;
    const sorting = !!lesson && lesson.steps[step].type === 'classify' ? lesson.steps[step] : null;
    const item = sorting?.items[stop], itemName = item ? adapter.bodyInfo(item.body).name : null;
    const compactExperiment = !!lesson && compactExperimentStep(lesson.steps[step]);
    root.replaceChildren(); root.hidden = false; root.inert = false;
    document.body.classList.add('is-learn'); root.className = lesson ? 'learn-panel' : 'learn-home';
    root.classList.toggle('is-expanded', expanded);
    root.classList.toggle('is-experiment', !!lesson && dayNight(lesson.steps[step]));
    root.classList.toggle('is-moon-experiment', !!lesson && moonPhases(lesson.steps[step]));
    root.classList.toggle('is-comparison-experiment', !!lesson && (sizeComparison(lesson.steps[step]) || lightTravel(lesson.steps[step])));
    root.classList.toggle('is-light-experiment', !!lesson && lightTravel(lesson.steps[step]));
    root.classList.toggle('is-planets-experiment', !!lesson && planetsStep(lesson.steps[step]));
    root.classList.toggle('is-earth-moon', !!lesson && earthMoonStep(lesson.steps[step]));
    root.classList.toggle('is-tour', !!tour);
    root.classList.toggle('is-classify', !!sorting); root.classList.toggle('is-result', !!sorting && !item);
    document.body.classList.toggle('is-learn-classify', !!sorting);
    document.body.classList.toggle('is-learn-moon', !!lesson && earthMoonStep(lesson.steps[step]));
    if (lesson && sideStep(lesson.steps[step]) && sideTourLayout.matches) root.dataset.layout = 'side'; else delete root.dataset.layout;
    const header = el('header', null, 'learn-header');
    const heading = el('h2', compactExperiment ? (dayNight(lesson.steps[step]) ? 'Pokus so Zemou' : moonPhases(lesson.steps[step]) ? 'Fázy Mesiaca' : planetsStep(lesson.steps[step]) ? 'Svetlo k planétam' : lesson.steps[step].title) : tour ? tour.stops[stop].title : sorting ? itemName || sorting.doneTitle || 'Všetky planéty sú roztriedené.' : lesson ? lesson.steps[step].title : 'Čo dnes objavíme?');
    heading.id = 'learn-heading'; heading.tabIndex = -1;
    const titles = el('div'), eyebrow = el('p', null, 'learn-eyebrow');
    if (lesson) {
      eyebrow.append(el('span', tour ? tour.title : sorting ? sorting.title : lesson.title, 'learn-lesson-title'), el('span', stepOf(step + 1, lesson.steps.length), 'learn-step-full'));
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
        if (compactExperiment) {
          experimentDetailsOpen = !experimentDetailsOpen;
          // Planets journey only: opening the explanation pauses a running light (exact time kept); closing it never resumes by itself.
          const current = lesson.steps[step];
          if (experimentDetailsOpen && lightTravel(current) && current.experiment.journey === 'planets') { const st = experimentOf(current).state(); if (st.active && (st.phase === 'first' || st.phase === 'second') && !st.paused) experimentOf(current).pause(); }
          render(); root.querySelector('.learn-expand').focus({ preventScroll: true });
        }
        else { expanded = !expanded; if (tour) tourReading = expanded; else if (compactView(lesson.steps[step])) viewReading = expanded; render(); }
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
    // A collapsed Earth–Moon observation keeps the start of its own text visible (clipped by CSS); "Viac" shows all.
    if (lesson && !expanded && sheetLayout.matches && lesson.steps[step].type === 'observe' && earthMoonStep(lesson.steps[step])) root.append(el('p', lesson.steps[step].text, 'learn-lead'));
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
      if (s.type === 'observe' && s.note) body.append(el('p', s.note, 'learn-note'));
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
      if (dayNight(s)) {
        const light = el('p', null, 'learn-daynight'); light.setAttribute('aria-label', 'Stav označeného miesta');
        const explanation = el('p'), visibility = el('p', null, 'learn-location-note');
        const turn = button('Otočiť Zem o 90°', () => experimentOf(s).turn(), 'learn-primary');
        const reset = button('Obnoviť pokus', () => experimentOf(s).reset());
        const actions = el('div', null, 'learn-experiment-actions'); actions.append(turn, reset);
        const status = el('p', null, 'learn-experiment-status'); status.setAttribute('role', 'status'); status.setAttribute('aria-atomic', 'true');
        experimentUI = { light, explanation, visibility, turn, reset, status };
        const details = el('div', null, 'learn-experiment-details'); details.id = 'learn-experiment-details';
        details.hidden = compactExperiment && !experimentDetailsOpen;
        if (compactExperiment) { details.tabIndex = 0; details.setAttribute('role', 'region'); details.setAttribute('aria-label', 'Vysvetlenie pokusu'); }
        details.append(explanation, visibility, el('p', s.text), el('p', s.note, 'learn-note'), button('Zopakovať ukážku', demonstrate));
        body.append(light, actions, details, status);
      }
      if (s.type === 'experiment' && s.experiment.kind === 'moon-phases') {
        const ns = 'http://www.w3.org/2000/svg', svg = document.createElementNS(ns, 'svg'), shape = name => document.createElementNS(ns, name);
        svg.setAttribute('viewBox', '-50 -50 100 100'); svg.setAttribute('class', 'learn-moon-phase'); svg.setAttribute('role', 'img');
        const dark = shape('circle'), lit = shape('path'), rim = shape('circle');
        dark.setAttribute('r', '46'); dark.setAttribute('class', 'learn-moon-dark'); lit.setAttribute('class', 'learn-moon-lit');
        rim.setAttribute('r', '46'); rim.setAttribute('class', 'learn-moon-rim'); svg.append(dark, lit, rim);
        const figure = el('figure', null, 'learn-moon-view'), caption = el('figcaption');
        const name = el('strong', null, 'learn-moon-name'), fraction = el('span'), position = el('span', null, 'learn-moon-position');
        caption.append(el('span', 'Ako vidíme Mesiac zo Zeme', 'learn-moon-label'), name, fraction, position); figure.append(svg, caption);
        const advance = button('Posuň Mesiac', () => experimentOf(s).advance(), 'learn-primary');
        const reset = button('Začať odznova', () => experimentOf(s).reset());
        const actions = el('div', null, 'learn-experiment-actions'); actions.append(advance, reset);
        const status = el('p', null, 'learn-experiment-status'); status.setAttribute('role', 'status'); status.setAttribute('aria-atomic', 'true');
        experimentUI = { kind: 'moon-phases', svg, lit, name, fraction, position, advance, reset, status };
        const details = el('div', null, 'learn-experiment-details'); details.id = 'learn-experiment-details';
        details.hidden = compactExperiment && !experimentDetailsOpen;
        if (compactExperiment) { details.tabIndex = 0; details.setAttribute('role', 'region'); details.setAttribute('aria-label', 'Vysvetlenie pokusu'); }
        details.append(el('p', s.text), el('p', s.note, 'learn-note'), button('Zopakovať ukážku', demonstrate));
        body.append(figure, actions, details, status);
      }
      if (sizeComparison(s)) {
        const reveal = revealOf(s);
        const info = el('p', null, 'learn-comparison-info'), note = el('p', reveal?.noteBefore ?? (reveal ? 'Porovnávame priemery, nie objemy.' : 'Porovnávame priemery planét, nie ich objemy.'), 'learn-comparison-note');
        const primary = button('', () => compare('primary'), 'learn-primary'), back = button('Späť na všetky planéty', () => compare('back'));
        primary.dataset.focus = 'comparison-primary'; back.dataset.focus = 'comparison-back';
        const actions = el('div', null, 'learn-experiment-actions'); actions.append(primary, back);
        experimentUI = { kind: 'size-comparison', info, note, primary, back };
        if (reveal) { back.hidden = true; experimentUI.reveal = reveal; }
        else {
          // Planet inspection: a compact accessible picker (also for planets only a few pixels wide) and the turn buttons.
          const pick = el('div', null, 'learn-inspect-pick'), label = el('label', 'Preskúmaj planétu'), select = el('select');
          select.id = 'learn-inspect-planet'; label.htmlFor = select.id;
          INSPECT_BODIES.forEach(id => { const option = el('option', SizeData.bodies[id].name); option.value = id; select.append(option); });
          const open = button('Zblízka', () => compare('inspect')); open.dataset.focus = 'inspect-open';
          pick.append(label, select, open);
          const turn = el('div', null, 'learn-inspect-turn'); turn.setAttribute('role', 'group'); turn.setAttribute('aria-label', 'Otáčanie planéty'); turn.hidden = true;
          [['←', 'Otočiť doľava', -1, 0], ['→', 'Otočiť doprava', 1, 0], ['↑', 'Otočiť nahor', 0, -1], ['↓', 'Otočiť nadol', 0, 1]].forEach(([glyph, labelText, yaw, pitch]) => {
            const b = button(glyph, () => turnPlanet(yaw, pitch)); b.setAttribute('aria-label', labelText); b.title = labelText; turn.append(b);
          });
          Object.assign(experimentUI, { pick, select, turn });
        }
        const details = el('div', null, 'learn-experiment-details'); details.id = 'learn-experiment-details';
        details.hidden = compactExperiment && !experimentDetailsOpen;
        if (compactExperiment) { details.tabIndex = 0; details.setAttribute('role', 'region'); details.setAttribute('aria-label', 'Vysvetlenie pokusu'); }
        if (s.text) { experimentUI.text = el('p', s.text); details.append(experimentUI.text); }
        if (s.note) details.append(el('p', s.note, 'learn-note'));
        if (reveal?.detail) { experimentUI.detail = el('p', reveal.detail, 'learn-note'); details.append(experimentUI.detail); }
        // On phones the picker waits in the explanation, so the true-scale lineup keeps its approved size.
        if (experimentUI.pick && compactExperiment) details.append(experimentUI.pick);
        experimentUI.restart = button('Začať porovnanie odznova', demonstrate); details.append(experimentUI.restart);
        body.append(info, note, actions);
        // Phones: the turn buttons share the action row, so the panel (and the planet above it) keeps its height.
        if (experimentUI.turn && compactExperiment) actions.append(experimentUI.turn);
        else if (experimentUI.turn) body.append(experimentUI.turn);
        if (experimentUI.pick && !compactExperiment) body.append(experimentUI.pick);
        body.append(details);
      }
      if (lightTravel(s)) {
        // Light experiment: a short message, the prediction slider (native range, 0–100 % of the surface route), the actions.
        const lead = el('p', null, 'learn-light-lead'), message = el('div', null, 'learn-light-message'); message.id = 'learn-light-message';
        // The question above is the visible label; the <label> names the slider for assistive technology.
        const pick = el('div', null, 'learn-light-pick'), label = el('label', 'Môj tip: kam doletí svetlo za 1 sekundu?', 'learn-visually-hidden'), slider = el('input');
        slider.type = 'range'; slider.id = 'learn-light-tip'; slider.min = '0'; slider.max = '100'; slider.step = '1'; slider.value = String(lightTip ?? 50);
        label.htmlFor = slider.id;
        // One row under the slider: the route's ends and, between them, the learner's tip in kilometres.
        const ends = el('div', null, 'learn-light-ends'), output = el('span', null, 'learn-light-tip-text'); output.id = 'learn-light-tip-text';
        const start = el('span', 'Zem'), finish = el('span', 'Mesiac'); start.setAttribute('aria-hidden', 'true'); finish.setAttribute('aria-hidden', 'true');
        ends.append(start, output, finish); slider.setAttribute('aria-describedby', output.id);
        slider.addEventListener('input', () => { lightTip = Number(slider.value); syncExperiment(); });
        pick.append(label, slider, ends);
        const primary = button('Vyšli svetlo', () => lightAction('primary'), 'learn-primary'), secondary = button('Začať odznova', () => lightAction('reset'));
        const skip = button('Ukáž výsledok bez animácie', () => lightAction('skip'));
        primary.dataset.focus = 'light-primary'; secondary.dataset.focus = 'light-secondary'; skip.dataset.focus = 'light-skip';
        secondary.hidden = true; skip.hidden = true;
        const actions = el('div', null, 'learn-experiment-actions'); actions.append(primary, secondary, skip);
        // 15 s journey: three guesses as one row of native radio buttons (the existing answer styling); optional, never blocking.
        let choices = null;
        if (s.experiment.journey === 'fifteen') {
          choices = el('fieldset', null, 'learn-light-choices'); choices.append(el('legend', 'Môj odhad', 'learn-visually-hidden'));
          for (const value of LIGHT_CHOICES) {
            // Native radio (arrow keys, "checked" for screen readers); its circle is hidden, the whole button shows the choice.
            const label = el('label', null, 'learn-answer'), input = el('input', null, 'learn-visually-hidden'); input.type = 'radio'; input.name = 'learn-light-choice'; input.value = String(value);
            input.addEventListener('change', () => { lightChoice = value; syncExperiment(); });
            label.append(input, el('span', `Asi ${value}-krát`, 'learn-answer-text')); choices.append(label);
          }
        }
        // Sun to planets (Phase 6H.5.3.1): the same answer row, one per question (Earth, then Neptune), and a second question line.
        let choiceSets = null, ask = null, feedback = null;
        if (s.experiment.journey === 'planets') {
          ask = el('p', null, 'learn-light-lead learn-light-ask'); ask.hidden = true;
          feedback = el('p', null, 'learn-light-feedback'); feedback.hidden = true;
          choiceSets = {};
          for (const id of ['earth', 'neptune']) {
            const set = el('fieldset', null, 'learn-light-choices'); set.append(el('legend', PLANET_QUESTIONS[id], 'learn-visually-hidden')); set.dataset.question = id;
            for (const option of PLANET_GUESSES[id]) {
              const label = el('label', null, 'learn-answer'), input = el('input', null, 'learn-visually-hidden'); input.type = 'radio'; input.name = `learn-planet-${id}`; input.value = String(option.seconds);
              input.addEventListener('change', () => { planetGuess = { ...planetGuess, [id]: option.seconds }; syncExperiment(); });
              label.append(input, el('span', option.text, 'learn-answer-text')); set.append(label);
            }
            choiceSets[id] = set;
          }
        }
        // Order: headline, slider or guesses (ready only for the slider), actions, then the explanation, so the main action never
        // drops below the fold.
        const box = el('div', null, 'learn-light-box'); box.append(lead, ...(choiceSets ? [feedback, ask, choiceSets.earth, choiceSets.neptune] : choices ? [choices] : [pick]), actions, message);
        const journey = s.experiment.journey === 'fifteen' || s.experiment.journey === 'planets' ? s.experiment.journey : 'earth-moon';
        experimentUI = { kind: 'light-travel', journey, box, lead, ask, feedback, message, pick, choices, choiceSets, slider, output, primary, secondary, skip, tight: compactExperiment || root.dataset.layout === 'side', compact: compactExperiment };
        const details = el('div', null, 'learn-experiment-details'); details.id = 'learn-experiment-details';
        details.hidden = compactExperiment && !experimentDetailsOpen;
        if (compactExperiment) { details.tabIndex = 0; details.setAttribute('role', 'region'); details.setAttribute('aria-label', 'Vysvetlenie pokusu'); }
        if (s.text) details.append(el('p', s.text));
        if (s.note) details.append(el('p', s.note, 'learn-note'));
        const science = el('div', null, 'learn-light-science'); experimentUI.science = science;
        details.append(science);
        if (journey !== 'planets') details.append(el('p', 'Krúžky okolo malých telies sú len značky, nie ich skutočná veľkosť. Zem aj Mesiac majú správnu veľkosť aj vzdialenosť.', 'learn-note')); // planets: its own symbol note in the science text
        body.append(box, details);
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
        else if (s.nextShort && !forward.label) next.setAttribute('aria-label', s.next);
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
    const collapsed = !!lesson && !expanded && sheetLayout.matches && !compactExperimentStep(lesson.steps[step]);
    if (collapsed && body.contains(document.activeElement)) root.querySelector('.learn-expand').focus();
    body.inert = collapsed; adapter.sync();
  }
  shortExperimentLayout.addEventListener('change', () => { if (active && dayNight(lesson?.steps[step])) render(); });
  compactMoonLayout.addEventListener('change', () => { if (active && (moonPhases(lesson?.steps[step]) || sizeComparison(lesson?.steps[step]))) render(); });
  sideTourLayout.addEventListener('change', () => { if (active && lesson && sideStep(lesson.steps[step])) render(false); });
  sheetLayout.addEventListener('change', syncResponsiveSheet);
  window.addEventListener('resize', syncResponsiveSheet);
  return { init(a) {
      adapter = a; root = document.getElementById('learn-root'); root.addEventListener('click', event => event.stopPropagation()); validate();
      liveStatus = el('p', null, 'learn-live'); liveStatus.setAttribute('role', 'status'); liveStatus.setAttribute('aria-atomic', 'true'); document.body.append(liveStatus);
    }, enter, leave, home, selectBody, selectOverview: () => holdView(null),
    get active() { return active; }, get inLesson() { return !!lesson; },
    // The Learn-only camera view of the current step, e.g. 'earth-moon'.
    get view() { return active && lesson ? stepDemo(lesson.steps[step])?.view ?? null : null; }, get state() { return { active, lesson: lesson?.id, step, stop, answer, feedback, completed, session, notice: notice?.text ?? null }; } };
})();
