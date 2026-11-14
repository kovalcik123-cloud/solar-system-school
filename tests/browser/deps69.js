// Phase 6H.9.1.B dependency harness. The real app with every request to another host blocked (and recorded).
// - index.html loads three.js r128 and OrbitControls from vendor/three-r128/ by relative path, in that order, before the app scripts;
//   the bytes the browser receives are the verified upstream files (SHA-256).
// - THREE is revision 128, THREE.OrbitControls exists and the app's camera controls are an instance of it; every THREE name the
//   application source uses is defined.
// - With the network blocked the app starts and works: Explore, the Learn catalogue, all six lessons (first step and one step on,
//   the size-comparison and light stages included) and a complete Quiz. No request to another host is ever attempted.
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const ENV = require('./env'), ROOT = ENV.ROOT, OUT = ENV.out('deps69'), PORT = Number(process.env.PORT || 8970);
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.jpg': 'image/jpeg' };
const server = http.createServer((q, r) => { const u = decodeURIComponent(q.url.split('?')[0]), file = path.join(ROOT, u === '/' ? 'index.html' : u);
  fs.readFile(file, (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] ?? 'application/octet-stream' }); r.end(d); } }); }).listen(PORT);
let failures = 0, passes = 0;
const check = (label, ok, detail = '') => { ok ? passes++ : failures++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${!ok && detail ? '  — ' + String(detail).slice(0, 900) : ''}`); };
const ORIGIN = `http://localhost:${PORT}`, THREE_URL = `${ORIGIN}/vendor/three-r128/three.min.js`, CONTROLS_URL = `${ORIGIN}/vendor/three-r128/OrbitControls.js`;
const SHA256 = { [THREE_URL]: '9274bbcec8d96168626c732b5d31c775aa8cfb7eaa0599bec0c175908a2c1ce2', [CONTROLS_URL]: '02bb4ade710f3e607329e37a21f098bc3ac70eb6e33daf8a65e79f4db785e7b2' };
const sha256 = buffer => crypto.createHash('sha256').update(buffer).digest('hex');
// THREE names used by the application source (index.html and learn.js), e.g. "WebGLRenderer", "MathUtils.degToRad".
const usedNames = [...new Set([...`${fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8')}\n${fs.readFileSync(path.join(ROOT, 'learn.js'), 'utf8')}`.matchAll(/\bTHREE\.([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)?)/g)].map(m => m[1]))].sort();

async function open(browser, w, h) {
  const context = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: w < 900 });
  const log = { errors: [], external: [], requests: [], responses: new Map(), failed: [], bodies: {} };
  // Every request to another host is refused, as on a filtered school network, and remembered.
  await context.route(url => !url.href.startsWith(`${ORIGIN}/`), route => { log.external.push(route.request().url()); return route.abort('blockedbyclient'); });
  const pg = await context.newPage();
  pg.on('pageerror', e => log.errors.push(e.message)); pg.on('console', m => { if (m.type() === 'error') log.errors.push('console: ' + m.text()); });
  pg.on('request', q => log.requests.push(q.url()));
  pg.on('requestfailed', q => log.failed.push(q.url()));
  pg.on('response', async res => { log.responses.set(res.url(), res.status()); if (SHA256[res.url()]) log.bodies[res.url()] = sha256(await res.body()); });
  await pg.goto(`${ORIGIN}/`); await pg.waitForTimeout(1800); // the loading spinner fades out and is removed 1,3 s after the load event
  return { pg, context, log };
}
const enterCode = async pg => { await pg.fill('#activation-code', 'NGV-2025'); await pg.click('#gatekeeper button'); await pg.waitForTimeout(2400); };
// The canvas shows a picture: some pixels differ from the plain background (the scene is drawn by three.js).
const drawn = pg => pg.evaluate(() => new Promise(res => requestAnimationFrame(() => { const src = renderer.domElement, c = document.createElement('canvas'); c.width = 256; c.height = 144; const g = c.getContext('2d'); g.drawImage(src, 0, 0, 256, 144);
  const d = g.getImageData(0, 0, 256, 144).data; let lit = 0; for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] + d[i + 2] > 45) lit++; res(lit); })));

(async () => {
  const browser = await chromium.launch();
  check(`source: the application uses ${usedNames.length} THREE names (index.html, learn.js)`, usedNames.length >= 40 && usedNames.includes('WebGLRenderer') && usedNames.includes('OrbitControls'), usedNames.join(' '));

  for (const [w, h] of [[1366, 768], [390, 844], [844, 390]]) {
    const tag = `${w}x${h}`, { pg, context, log } = await open(browser, w, h), main = w === 1366;
    const shot = name => pg.screenshot({ path: path.join(OUT, `${tag}-${name}.png`) });

    // 1. Loading: local files, right order, right bytes, nothing external.
    const scripts = await pg.evaluate(() => [...document.scripts].map(s => s.getAttribute('src')));
    check(`${tag}: index.html references three.js then OrbitControls by relative path, before the five application scripts and the inline script`,
      JSON.stringify(scripts) === JSON.stringify(['vendor/three-r128/three.min.js', 'vendor/three-r128/OrbitControls.js', 'learn-content.sk.js', 'learn.js', 'size-data.js', 'light-data.js', 'light-sim.js', null]), JSON.stringify(scripts));
    const order = log.requests.filter(u => /\.js$/.test(u)).map(u => u.replace(`${ORIGIN}/`, ''));
    check(`${tag}: the browser requested the scripts from this site only, three.js first, OrbitControls second`, order[0] === 'vendor/three-r128/three.min.js' && order[1] === 'vendor/three-r128/OrbitControls.js' && order.length === 7, JSON.stringify(order));
    check(`${tag}: both library files were served (HTTP 200) and are byte-identical to three.js r128 (SHA-256 of the received bodies)`, log.responses.get(THREE_URL) === 200 && log.responses.get(CONTROLS_URL) === 200 && log.bodies[THREE_URL] === SHA256[THREE_URL] && log.bodies[CONTROLS_URL] === SHA256[CONTROLS_URL], JSON.stringify(log.bodies));
    const lib = await pg.evaluate(names => ({ three: typeof THREE, revision: typeof THREE !== 'undefined' && THREE.REVISION, controls: typeof THREE !== 'undefined' && typeof THREE.OrbitControls,
      missing: names.filter(n => n.split('.').reduce((o, k) => (o == null ? undefined : o[k]), THREE) === undefined) }), usedNames);
    check(`${tag}: THREE is revision 128 and THREE.OrbitControls is available before the code is entered`, lib.three === 'object' && lib.revision === '128' && lib.controls === 'function', JSON.stringify(lib));
    check(`${tag}: every THREE name the application uses is defined by the committed files`, lib.missing.length === 0, lib.missing.join(' '));
    check(`${tag}: the loading spinner is gone and the access screen is shown`, await pg.evaluate(() => !document.getElementById('loader') && getComputedStyle(document.getElementById('gatekeeper')).display !== 'none'));

    // 2. Start and Explore.
    await enterCode(pg);
    const start = await pg.evaluate(() => ({ ready: document.body.classList.contains('is-ready'), gate: getComputedStyle(document.getElementById('gatekeeper')).display, canvas: !!document.querySelector('#canvas-container canvas'), orbit: controls instanceof THREE.OrbitControls,
      renderer: renderer instanceof THREE.WebGLRenderer, planets: planets.length, moons: satellites.length, nav: document.querySelectorAll('#planet-nav .nav-item').length }));
    check(`${tag}: the code opens the app; the renderer and the camera controls come from the local library; nine bodies and three moons exist`, start.ready && start.gate === 'none' && start.canvas && start.orbit && start.renderer && start.planets === 9 && start.moons === 3 && start.nav === 9, JSON.stringify(start));
    await pg.waitForTimeout(600);
    check(`${tag}: the scene is drawn (the canvas is not blank)`, await drawn(pg) > 12);
    const a0 = await pg.evaluate(() => planets[3].userData.angle); await pg.waitForTimeout(500);
    check(`${tag}: Explore runs: the planets move`, await pg.evaluate(a => planets[3].userData.angle !== a, a0));
    if (main) await shot('explore');
    await pg.click('#planet-nav .nav-item[data-planet="Saturn"]'); await pg.waitForTimeout(1600);
    const info = await pg.evaluate(() => ({ card: getComputedStyle(document.getElementById('info-card')).display, name: document.getElementById('planet-name').innerText, diameter: document.getElementById('planet-diam').innerText, paused: !areOrbitsActive, target: controls.target.length() > 1 }));
    check(`${tag}: Explore: choosing Saturn opens its card, pauses the motion and moves the camera target to the planet`, info.card === 'block' && info.name === 'Saturn' && info.diameter === '116,460 km' && info.paused && info.target, JSON.stringify(info));
    await pg.evaluate(() => { closePopup(); requestSystemOverview(); if (!areOrbitsActive) toggleOrbit(); }); await pg.waitForTimeout(500);
    const textures = await pg.evaluate(() => planets.map(p => p.material.isShaderMaterial ? !!p.material.uniforms.dayMap?.value?.image : !!p.material.map?.image).filter(Boolean).length);
    check(`${tag}: the planet textures loaded from this site (${textures} of 9)`, textures === 9, String(textures));

    // 3. Learn: the catalogue and all six lessons (first step, then one step on).
    await pg.click('#learn-nav'); await pg.waitForTimeout(450);
    const topics = await pg.evaluate(() => [...document.querySelectorAll('.learn-topic')].map(c => ({ title: c.querySelector('h3').textContent, button: !!c.querySelector('button') })));
    check(`${tag}: Learn opens the catalogue with six available lessons`, topics.length === 6 && topics.every(t => t.button), JSON.stringify(topics));
    if (main || w === 390) await shot('learn-catalogue');
    const ids = await pg.evaluate(() => LearnContent.topics.map(t => t.id));
    for (let k = 0; k < ids.length; k++) {
      await pg.evaluate(k => { const b = document.querySelectorAll('.learn-topic button')[k]; b.scrollIntoView({ block: 'nearest' }); b.click(); }, k); await pg.waitForTimeout(450);
      const first = await pg.evaluate(() => ({ lesson: Learn.state.lesson, step: Learn.state.step, heading: document.getElementById('learn-heading').textContent, expected: LearnContent.lessons.find(l => l.id === Learn.state.lesson)?.steps[0].title }));
      await pg.evaluate(() => document.querySelector('#learn-root .learn-footer .learn-primary').click()); await pg.waitForTimeout(900);
      const second = await pg.evaluate(() => { const s = Learn.state, step = LearnContent.lessons.find(l => l.id === s.lesson).steps[1]; return { step: s.step, type: step.type, kind: step.experiment?.kind ?? step.demo?.kind ?? null, comparison: comparisonStage.active, light: lightStage.active,
        journey: lightStage.active ? lightStage.state().journey : null, heading: document.getElementById('learn-heading').textContent }; });
      const stageOk = second.kind === 'size-comparison' ? second.comparison : second.kind === 'light-travel' ? second.light && second.journey === 'earth-moon' : !second.comparison && !second.light;
      check(`${tag}: lesson "${first.heading}" (${ids[k]}) opens at its first step and continues to step 2 (${second.type}${second.kind ? ', ' + second.kind : ''})`, first.lesson === ids[k] && first.step === 0 && first.heading === first.expected && second.step === 1 && stageOk && await drawn(pg) > 12, JSON.stringify({ first, second }));
      if (ids[k] === 'pohyb') {
        // The Light Laboratory: send the light without waiting (reduced-motion result) and check the stage reports the real distance.
        await pg.evaluate(() => lightStage.skip()); await pg.waitForTimeout(400);
        const light = await pg.evaluate(() => { const s = lightStage.state(); return { phase: s.phase, km: Math.round(s.travelledKm), overlay: !document.getElementById('light-stage-overlay').hidden }; });
        check(`${tag}: Light Laboratory: the Earth–Moon stage shows the one-second result (299 792 km)`, light.phase === 'one-second' && light.km === 299792 && light.overlay, JSON.stringify(light));
        if (main || w === 844) await shot('light-laboratory');
      }
      if (ids[k] === 'planety' && w === 390) await shot('learn-lesson');
      await pg.evaluate(() => Learn.home()); await pg.waitForTimeout(300);
    }

    // 4. Quiz: all eight questions through the planet bar.
    // Real pointer clicks, as a learner makes them. (A scripted element.click() carries the position 0,0, which the app's scene
    // picking also evaluates; with a body under that corner it would count as an answer.)
    await pg.click('#quiz-nav'); await pg.waitForTimeout(450);
    const q0 = await pg.evaluate(() => ({ quiz: isQuizMode, learn: Learn.active, question: document.getElementById('quiz-question').innerText }));
    const picks = [];
    for (let i = 0; i < 8; i++) {
      await pg.waitForFunction(i => isQuizResults || (isQuizMode && !isWaiting && quizIndex === i && !!quizTarget), i, { timeout: 15000 }).catch(() => {});
      const target = await pg.evaluate(() => (!isQuizMode || !quizTarget ? { stopped: true, quiz: isQuizMode, results: isQuizResults, index: quizIndex, waiting: isWaiting } : { name: quizTarget.name, index: quizIndex, before: score }));
      if (target.stopped) { picks.push(target); break; }
      await pg.click(`#planet-nav .nav-item[data-planet="${target.name}"]`);
      picks.push({ name: target.name, index: target.index, ...(await pg.evaluate(before => ({ scored: score - before, feedback: document.getElementById('quiz-feedback').innerText }), target.before)) });
      await pg.waitForFunction(i => quizIndex > i || isQuizResults, i, { timeout: 15000 }).catch(() => {});
    }
    await pg.waitForTimeout(300);
    const q1 = await pg.evaluate(() => ({ results: isQuizResults, score: document.getElementById('final-score').innerText }));
    await pg.evaluate(() => stopQuiz()); await pg.waitForTimeout(350);
    const q2 = await pg.evaluate(() => ({ quiz: isQuizMode || isQuizResults, side: getComputedStyle(document.getElementById('side-ui')).visibility }));
    check(`${tag}: Quiz starts from Learn, eight correct picks give "8 / 8", and "Späť" returns to Explore`, q0.quiz && !q0.learn && /^Nájdi planétu:/.test(q0.question) && q1.results && q1.score === '8 / 8' && !q2.quiz && q2.side === 'visible' && picks.length === 8 && new Set(picks.map(p => p.name)).size === 8 && picks.every((p, i) => p.index === i && p.scored === 1 && p.feedback === 'Správne!'), JSON.stringify({ q0, q1, q2, picks }));

    // 5. Network: everything came from this site.
    const hosts = [...new Set(log.requests.map(u => new URL(u).origin))], bad = [...log.responses].filter(([, status]) => status >= 400).map(([u, s]) => `${s} ${u}`);
    check(`${tag}: no request to another host was attempted during the whole session (${log.requests.length} requests, all to ${ORIGIN})`, log.external.length === 0 && hosts.length === 1 && hosts[0] === ORIGIN, JSON.stringify({ external: log.external, hosts }));
    check(`${tag}: every requested file was served: no failed request and no HTTP error`, log.failed.length === 0 && bad.length === 0, JSON.stringify({ failed: log.failed, bad }));
    check(`${tag}: the library, the stylesheet, the five application scripts and the fifteen textures in use were all requested from this site`,
      ['vendor/three-r128/three.min.js', 'vendor/three-r128/OrbitControls.js', 'learn.css', 'learn-content.sk.js', 'learn.js', 'size-data.js', 'light-data.js', 'light-sim.js', 'stars.jpg', '2k_earth_daymap.jpg', '2k_earth_nightmap.jpg', '2k_earth_clouds.jpg', 'sun.jpg', 'mercury.jpg', 'venus.jpg', 'mars.jpg', 'jupiter.jpg', 'saturn.jpg', 'uranus.jpg', 'neptune.jpg', 'moon.jpg', 'europa.jpg']
        .every(f => log.requests.includes(`${ORIGIN}/${f}`)), JSON.stringify(log.requests.map(u => u.replace(`${ORIGIN}/`, ''))));
    check(`${tag}: no page or console errors`, log.errors.length === 0, log.errors.join(' | '));
    await context.close();
  }

  // 6. The blocker itself works: a page that does ask for a CDN file is refused and recorded (so "no external request" above is meaningful).
  { const context = await browser.newContext(), seen = [];
    await context.route(url => !url.href.startsWith(`${ORIGIN}/`), route => { seen.push(route.request().url()); return route.abort('blockedbyclient'); });
    const pg = await context.newPage(); await pg.goto(`${ORIGIN}/`);
    const result = await pg.evaluate(() => new Promise(res => { const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js'; s.onload = () => res('loaded'); s.onerror = () => res('blocked'); document.head.append(s); }));
    check('control: a request to a CDN host is blocked and recorded by this harness', result === 'blocked' && seen.length === 1 && /cdnjs\.cloudflare\.com/.test(seen[0]), JSON.stringify({ result, seen }));
    await context.close(); }

  await browser.close(); server.close();
  console.log(`\n${passes} passed, ${failures} failed`);
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); server.close(); process.exit(1); });
