// Phase 6H.9.1.C start-up failure harness. The real app (committed three.js r128 files) with one failure at a time introduced by
// request interception or a controlled script only inside the test browser:
//   A. three.js missing (HTTP 404, request aborted, script that throws, empty script)
//   B. OrbitControls missing (the same four ways)
//   C. WebGL unavailable (getContext returns null)
//   D. initialization failure (init() throws: a controlled error, and a WebGL error raised after the first check passed)
// Each failure must show one Slovak alert with a "Načítať znova" button, no spinner, a closed code gate and an inert page; the button reloads
// the page (also from the keyboard). A normal start (nothing intercepted) must be unchanged.
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const ENV = require('./env'), ROOT = ENV.ROOT, OUT = ENV.out('failure69'), PORT = Number(process.env.PORT || 8971);
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.jpg': 'image/jpeg' };
const server = http.createServer((q, r) => { const u = decodeURIComponent(q.url.split('?')[0]), file = path.join(ROOT, u === '/' ? 'index.html' : u);
  fs.readFile(file, (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] ?? 'application/octet-stream' }); r.end(d); } }); }).listen(PORT);
let failures = 0, passes = 0;
const check = (label, ok, detail = '') => { ok ? passes++ : failures++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${!ok && detail ? '  — ' + String(detail).slice(0, 900) : ''}`); };
const ORIGIN = `http://localhost:${PORT}`, THREE_URL = `${ORIGIN}/vendor/three-r128/three.min.js`, CONTROLS_URL = `${ORIGIN}/vendor/three-r128/OrbitControls.js`;
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');
const MESSAGES = {
  dependencies: 'Aplikáciu sa nepodarilo načítať. Skúste stránku načítať znova. Ak problém pretrváva, obráťte sa na učiteľa alebo správcu siete.',
  webgl: 'Toto zariadenie alebo prehliadač nepodporuje 3D grafiku (WebGL). Skúste aktuálny prehliadač Chrome, Edge alebo Firefox.',
  init: 'Aplikáciu sa nepodarilo spustiť. Skúste stránku načítať znova.'
};
const RETRY = 'Načítať znova';
// The failures. `route(url)` returns how a library request is answered; `script` runs in the page before any script.
const THREE_FAILS = { 'three.js: HTTP 404': r => r.fulfill({ status: 404, contentType: 'text/plain', body: 'not found' }), 'three.js: request blocked': r => r.abort('blockedbyclient'),
  'three.js: script throws': r => r.fulfill({ contentType: 'text/javascript', body: 'throw new Error("test: library failed to run");' }), 'three.js: empty script (no THREE global)': r => r.fulfill({ contentType: 'text/javascript', body: '/* empty */' }) };
const CONTROLS_FAILS = { 'OrbitControls: HTTP 404': r => r.fulfill({ status: 404, contentType: 'text/plain', body: 'not found' }), 'OrbitControls: request blocked': r => r.abort('blockedbyclient'),
  'OrbitControls: script throws': r => r.fulfill({ contentType: 'text/javascript', body: 'throw new Error("test: controls failed to run");' }), 'OrbitControls: empty script (no THREE.OrbitControls)': r => r.fulfill({ contentType: 'text/javascript', body: '/* empty */' }) };
const withControls = extra => async r => { const res = await r.fetch(); r.fulfill({ response: res, body: (await res.text()) + '\n' + extra }); };

async function open(browser, w, h, setup = {}) {
  const context = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: w < 900 });
  const log = { pageErrors: [], consoleErrors: [], consoleWarnings: [], requests: [] };
  if (setup.three) await context.route(THREE_URL, setup.three);
  if (setup.controls) await context.route(CONTROLS_URL, setup.controls);
  const pg = await context.newPage();
  pg.on('pageerror', e => log.pageErrors.push(e.message)); pg.on('console', m => { if (m.type() === 'error') log.consoleErrors.push(m.text()); if (m.type() === 'warning') log.consoleWarnings.push(m.text()); });
  pg.on('request', q => log.requests.push(q.url()));
  if (setup.script) await pg.addInitScript(setup.script);
  await pg.goto(`${ORIGIN}/`); await pg.waitForTimeout(1800); // the normal spinner fades out and is removed 1,3 s after the load event
  return { pg, context, log };
}
// The page as a learner sees it.
const STATE = () => {
  const vis = e => { if (!e) return false; const s = getComputedStyle(e), r = e.getBoundingClientRect(); return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 && r.height > 0 && parseFloat(s.opacity) > 0 && !e.closest('[hidden]'); };
  const lum = c => { const [r, g, b] = c.match(/[\d.]+/g).map(Number).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const gate = document.getElementById('gatekeeper'), box = gate.querySelector('.login-box'), input = document.getElementById('activation-code'), enter = box.querySelector('button:not(#startup-retry)');
  const alerts = [...document.querySelectorAll('#startup-error')], retries = [...document.querySelectorAll('#startup-retry')], message = alerts[0], retry = retries[0], rect = e => { const r = e.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; };
  const bg = [20, 40, 70], mc = message ? getComputedStyle(message).color : 'rgb(0,0,0)', ml = lum(mc), bl = lum(`rgb(${bg.join(',')})`), contrast = (Math.max(ml, bl) + 0.05) / (Math.min(ml, bl) + 0.05);
  const loaders = [...document.querySelectorAll('#loader, .spinner')].filter(vis);
  const others = [...document.body.children].filter(e => e !== gate && e.tagName !== 'SCRIPT' && !e.classList.contains('learn-live'));
  const overlap = (a, b) => a.left < b.right - 0.5 && a.right > b.left + 0.5 && a.top < b.bottom - 0.5 && a.bottom > b.top + 0.5;
  const mr = message ? rect(message) : null, rr = retry ? rect(retry) : null, br = rect(box), view = [innerWidth, innerHeight];
  return { alerts: alerts.length, retries: retries.length, roleAlerts: document.querySelectorAll('[role="alert"]').length, text: message?.textContent ?? null, role: message?.getAttribute('role') ?? null, messageVisible: vis(message), messageFont: message ? parseFloat(getComputedStyle(message).fontSize) : 0, contrast: +contrast.toFixed(1),
    retryText: retry?.textContent ?? null, retryVisible: vis(retry), retryEnabled: !!retry && !retry.disabled, retryHeight: rr ? Math.round(rr.height) : 0, retryType: retry?.type ?? null, retryDescribedBy: retry?.getAttribute('aria-describedby') ?? null, retryFocused: document.activeElement === retry,
    focusRing: retry ? (() => { retry.focus(); const s = getComputedStyle(retry); return s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0; })() : false,
    loaders: loaders.length, loaderInDom: !!document.getElementById('loader'), gateVisible: vis(gate), gateInView: br.left >= -0.5 && br.top >= -0.5 && br.right <= view[0] + 0.5 && br.bottom <= view[1] + 0.5, hOverflow: document.documentElement.scrollWidth > innerWidth + 1,
    messageInView: !!mr && mr.left >= -0.5 && mr.right <= view[0] + 0.5 && mr.top >= -0.5 && mr.bottom <= view[1] + 0.5, retryInView: !!rr && rr.left >= -0.5 && rr.right <= view[0] + 0.5 && rr.top >= -0.5 && rr.bottom <= view[1] + 0.5,
    messageInBox: !!mr && mr.left >= br.left - 0.5 && mr.right <= br.right + 0.5 && mr.top >= br.top - 0.5 && mr.bottom <= br.bottom + 0.5, retryInBox: !!rr && rr.left >= br.left - 0.5 && rr.right <= br.right + 0.5 && rr.top >= br.top - 0.5 && rr.bottom <= br.bottom + 0.5,
    messageRetryOverlap: !!mr && !!rr && overlap(mr, rr), messageShownTopmost: !!mr && (() => { const e = document.elementFromPoint((mr.left + mr.right) / 2, (mr.top + mr.bottom) / 2); return !!e && (e === message || message.contains(e)); })(),
    retryTopmost: !!rr && (() => { const e = document.elementFromPoint((rr.left + rr.right) / 2, (rr.top + rr.bottom) / 2); return e === retry; })(),
    inputDisabled: input.disabled, inputVisible: vis(input), enterDisabled: enter.disabled, enterVisible: vis(enter), promptVisible: vis(box.querySelector('p')), invalidCodeVisible: vis(document.getElementById('error-msg')), title: box.querySelector('h2').textContent,
    othersHidden: others.every(e => getComputedStyle(e).display === 'none'), othersInert: others.every(e => e.inert), sidebar: vis(document.getElementById('side-ui')), planetNav: vis(document.getElementById('planet-nav')), canvases: [...document.querySelectorAll('canvas')].filter(vis).length,
    ready: document.body.classList.contains('is-ready'), failed: window.StartupGuard?.failed ?? null, guard: typeof window.StartupGuard, three: typeof THREE === 'object' ? THREE.REVISION : typeof THREE, orbit: typeof THREE === 'object' ? typeof THREE.OrbitControls : null };
};
const tabStops = async (pg, n = 8) => { await pg.evaluate(() => document.activeElement && document.activeElement.blur()); const stops = []; for (let i = 0; i < n; i++) { await pg.keyboard.press('Tab'); stops.push(await pg.evaluate(() => { const e = document.activeElement; return e === document.body || !e ? 'BODY' : (e.id || e.tagName); })); } return stops; };
const EXPECTED_ERRORS = pattern => e => pattern.test(e);

async function fatalChecks(browser, tag, kind, w, h, setup, allowed, opts = {}) {
  const { pg, context, log } = await open(browser, w, h, setup), size = `${w}x${h}`;
  // Initialization failures happen after the code is entered, as a learner would: type it and press the button.
  if (opts.enter) { await pg.focus('#activation-code'); await pg.keyboard.type('NGV-2025'); await pg.keyboard.press('Tab'); await pg.keyboard.press('Enter'); await pg.waitForTimeout(1500); } // keyboard only
  const s = await pg.evaluate(`(${STATE})()`);
  if (opts.shot) await pg.screenshot({ path: path.join(OUT, `${size}-${opts.shot}.png`) });
  check(`${tag} @${size}: one alert with exactly the approved ${kind} message, role="alert", visible and readable (${s.messageFont} px, contrast ${s.contrast}:1)`, s.alerts === 1 && s.roleAlerts === 1 && s.role === 'alert' && s.text === MESSAGES[kind] && s.messageVisible && s.messageFont >= 16 && s.contrast >= 7, JSON.stringify({ alerts: s.alerts, text: s.text, role: s.role, font: s.messageFont, contrast: s.contrast }));
  check(`${tag} @${size}: one "${RETRY}" button, visible, enabled, at least 44 px tall, focused, described by the message, with a focus ring`, s.retries === 1 && s.retryText === RETRY && s.retryVisible && s.retryEnabled && s.retryHeight >= 44 && s.retryType === 'button' && s.retryFocused && s.retryDescribedBy === 'startup-error' && s.focusRing, JSON.stringify({ retries: s.retries, text: s.retryText, visible: s.retryVisible, height: s.retryHeight, focused: s.retryFocused, ring: s.focusRing }));
  check(`${tag} @${size}: no spinner or loading overlay (not in the page, none visible, still none 2.5 s later)`, !s.loaderInDom && s.loaders === 0 && await pg.waitForTimeout(2500).then(() => pg.evaluate(() => !document.getElementById('loader') && ![...document.querySelectorAll('.spinner')].some(e => e.getBoundingClientRect().width > 0))), JSON.stringify({ inDom: s.loaderInDom, visible: s.loaders }));
  check(`${tag} @${size}: the message and the button are inside the access box and inside the window, do not overlap each other, nothing covers them; no horizontal overflow`, s.gateVisible && s.gateInView && s.messageInView && s.retryInView && s.messageInBox && s.retryInBox && !s.messageRetryOverlap && s.messageShownTopmost && s.retryTopmost && !s.hOverflow, JSON.stringify({ gateInView: s.gateInView, msgBox: s.messageInBox, retryBox: s.retryInBox, overlap: s.messageRetryOverlap, msgTop: s.messageShownTopmost, retryTop: s.retryTopmost, hOverflow: s.hOverflow }));
  check(`${tag} @${size}: the code input and "VSTÚPIŤ" are disabled and not shown; the prompt and "Neplatný kód" are hidden; the title stays`, s.inputDisabled && !s.inputVisible && s.enterDisabled && !s.enterVisible && !s.promptVisible && !s.invalidCodeVisible && /UČITEĽSKÝ PRÍSTUP/.test(s.title), JSON.stringify({ input: [s.inputDisabled, s.inputVisible], enter: [s.enterDisabled, s.enterVisible], prompt: s.promptVisible }));
  check(`${tag} @${size}: the rest of the page is hidden and inert: no sidebar, planet bar or 3D canvas, and the app is not "ready"`, s.othersHidden && s.othersInert && !s.sidebar && !s.planetNav && !s.ready, JSON.stringify({ hidden: s.othersHidden, inert: s.othersInert, sidebar: s.sidebar, nav: s.planetNav, ready: s.ready }));
  const stops = await tabStops(pg, 8);
  check(`${tag} @${size}: Tab can reach only the retry button (${stops.join(', ')})`, stops.every(x => x === 'startup-retry' || x === 'BODY') && stops.includes('startup-retry'), stops.join());
  // Nothing starts: the code function does nothing, Enter in the page does nothing, a second failure adds no second message.
  const before = await pg.evaluate(`(${STATE})()`);
  const after = await pg.evaluate(async () => { document.getElementById('activation-code').value = 'NGV-2025'; if (typeof checkCode === 'function') checkCode(); const again = StartupGuard.fail('init'); StartupGuard.fail('webgl'); await new Promise(r => setTimeout(r, 400)); return { again, failed: StartupGuard.failed }; });
  const end = await pg.evaluate(`(${STATE})()`);
  check(`${tag} @${size}: a valid code changes nothing (the gate stays, no visible canvas, not ready); a second failure adds no second message or button and keeps the first text`, after.again === false && after.failed === kind && end.alerts === 1 && end.retries === 1 && end.roleAlerts === 1 && end.text === before.text && end.gateVisible && end.canvases === 0 && !end.ready && !end.sidebar, JSON.stringify({ after, end: { alerts: end.alerts, retries: end.retries, canvases: end.canvases, ready: end.ready, text: end.text } }));
  const unexpected = [...log.pageErrors, ...log.consoleErrors].filter(e => !allowed.some(a => a.test(e)));
  check(`${tag} @${size}: the browser console shows only the expected technical errors (${log.pageErrors.length + log.consoleErrors.length}); nothing is shown to the learner`, unexpected.length === 0 && !/(Error|THREE|undefined|stack| at )/.test(s.text ?? '') , JSON.stringify({ unexpected, page: log.pageErrors, console: log.consoleErrors }));
  return { pg, context, log, s };
}

(async () => {
  const browser = await chromium.launch();

  // 0. Source: where the guard sits.
  { const html = read('index.html'), scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)].map(m => ({ src: (m[1].match(/src="([^"]+)"/) || [])[1] ?? null, body: m[2] })), inline = scripts.filter(s => !s.src), guard = inline[0], app = inline[1];
    check('source: two inline scripts, the start-up guard first and the application last, both after the library and application scripts', inline.length === 2 && scripts.at(-1) === app && scripts.at(-2) === guard && /StartupGuard = \(function/.test(guard.body) && /StartupGuard\.check\(\);\s*$/.test(guard.body) && /CONFIG: Moons Added/.test(app.body));
    check('source: the guard comes after three.js and OrbitControls and before the first use of THREE in the application script', scripts.findIndex(s => s.src === 'vendor/three-r128/OrbitControls.js') < scripts.indexOf(guard) && scripts.indexOf(guard) < scripts.indexOf(app));
    check('source: only the call of init() has a try/catch around it; no window.onerror / unhandledrejection handler hides other errors', (app.body.match(/try \{ init\(\); \}/g) || []).length === 1 && !/onerror|unhandledrejection|addEventListener\('error'/.test(html)); }

  // 1. Normal start: unchanged.
  { const { pg, context, log } = await open(browser, 1366, 768), s = await pg.evaluate(`(${STATE})()`);
    await pg.screenshot({ path: path.join(OUT, '1366x768-normal.png') });
    check('normal @1366x768: no alert, no retry button, the access box shows the title, the prompt, the code input and "VSTÚPIŤ"', s.alerts === 0 && s.retries === 0 && s.roleAlerts === 0 && !s.inputDisabled && s.inputVisible && !s.enterDisabled && s.enterVisible && s.promptVisible && /UČITEĽSKÝ PRÍSTUP/.test(s.title) && s.gateVisible, JSON.stringify(s));
    check('normal @1366x768: three.js revision 128 and OrbitControls are available, the guard found no failure', s.three === '128' && s.orbit === 'function' && s.failed === null && s.guard === 'object');
    check('normal @1366x768: the loading spinner fades out and is removed as before', !s.loaderInDom && s.loaders === 0);
    await pg.fill('#activation-code', 'WRONG'); await pg.click('#gatekeeper button'); await pg.waitForTimeout(200);
    check('normal @1366x768: a wrong code still shows "Neplatný kód" and keeps the gate', await pg.evaluate(() => getComputedStyle(document.getElementById('error-msg')).display === 'block' && getComputedStyle(document.getElementById('gatekeeper')).display !== 'none' && !document.querySelector('#startup-error')));
    await pg.fill('#activation-code', 'NGV-2025'); await pg.click('#gatekeeper button'); await pg.waitForTimeout(2300);
    const start = await pg.evaluate(() => ({ gate: getComputedStyle(document.getElementById('gatekeeper')).display, ready: document.body.classList.contains('is-ready'), canvases: document.querySelectorAll('#canvas-container canvas').length, renderer: renderer instanceof THREE.WebGLRenderer, controls: controls instanceof THREE.OrbitControls, planets: planets.length, alert: !!document.querySelector('#startup-error'), failed: StartupGuard.failed }));
    check('normal @1366x768: the valid code starts the app once (one canvas, renderer and controls from the local library, nine bodies, no error element)', start.gate === 'none' && start.ready && start.canvases === 1 && start.renderer && start.controls && start.planets === 9 && !start.alert && start.failed === null, JSON.stringify(start));
    check('normal @1366x768: no page or console errors', log.pageErrors.length === 0 && log.consoleErrors.length === 0, JSON.stringify({ page: log.pageErrors, console: log.consoleErrors }));
    // The software renderer prints a GPU driver note ("GPU stall due to ReadPixels") in a fresh browser; the app without the guard prints the same four lines.
    check('normal @1366x768: the guard adds no console warning of its own (only the software renderer\'s GPU driver note, which the app printed before)', log.consoleWarnings.every(w => /GL Driver Message/.test(w)), JSON.stringify(log.consoleWarnings));
    await context.close(); }

  // 2. Three.js and OrbitControls unavailable (four ways each), at the main size; the messages are the dependency message.
  const THREE_ERR = [/Failed to load resource/, /THREE is not defined/, /test: library failed to run/, /net::ERR/], CONTROLS_ERR = [/Failed to load resource/, /OrbitControls is not a constructor/, /test: controls failed to run/, /net::ERR/];
  for (const [name, fn] of Object.entries(THREE_FAILS)) { const first = name === 'three.js: HTTP 404'; const r = await fatalChecks(browser, name, 'dependencies', 1366, 768, { three: fn }, THREE_ERR, first ? { shot: 'missing-three' } : {}); await r.context.close(); }
  for (const [name, fn] of Object.entries(CONTROLS_FAILS)) { const first = name === 'OrbitControls: HTTP 404'; const r = await fatalChecks(browser, name, 'dependencies', 1366, 768, { controls: fn }, CONTROLS_ERR, first ? { shot: 'missing-orbitcontrols' } : {}); await r.context.close(); }
  { const r = await fatalChecks(browser, 'both libraries blocked', 'dependencies', 1366, 768, { three: THREE_FAILS['three.js: request blocked'], controls: CONTROLS_FAILS['OrbitControls: request blocked'] }, THREE_ERR); await r.context.close(); }
  // OrbitControls fails but three.js is fine: the app must not reach normal operation, and THREE itself is intact.
  { const { pg, context } = await open(browser, 1366, 768, { controls: CONTROLS_FAILS['OrbitControls: HTTP 404'] }), s = await pg.evaluate(`(${STATE})()`);
    check('OrbitControls missing @1366x768: three.js itself loaded (revision 128) but the app is not started: no canvas, not ready, controls undefined', s.three === '128' && s.orbit === 'undefined' && s.canvases === 0 && !s.ready && s.failed === 'dependencies', JSON.stringify({ three: s.three, orbit: s.orbit, canvases: s.canvases, ready: s.ready })); await context.close(); }

  // 3. WebGL unavailable.
  const NO_WEBGL = () => { const get = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function (type, ...rest) { return /webgl/i.test(String(type)) ? null : get.call(this, type, ...rest); }; };
  { const r = await fatalChecks(browser, 'WebGL unavailable', 'webgl', 1366, 768, { script: NO_WEBGL }, [], { shot: 'webgl-unavailable' });
    const s = r.s; check('WebGL unavailable @1366x768: the libraries loaded fine (revision 128, OrbitControls), so the message is the WebGL one, not the dependency one', s.three === '128' && s.orbit === 'function' && s.failed === 'webgl' && s.text === MESSAGES.webgl); await r.context.close(); }
  { const r = await fatalChecks(browser, 'WebGL unavailable (context creation throws)', 'webgl', 1366, 768, { script: () => { const get = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function (type, ...rest) { if (/webgl/i.test(String(type))) throw new Error('test: WebGL is blocked'); return get.call(this, type, ...rest); }; } }, []); await r.context.close(); }

  // 4. Initialization failure after the checks passed.
  { const r = await fatalChecks(browser, 'initialization failure (controlled error)', 'init', 1366, 768,
      { controls: withControls(`THREE.OrbitControls = function () { throw new Error('test: controlled initialization failure'); };`) }, [/test: controlled initialization failure/], { shot: 'init-failure', enter: true });
    check('initialization failure @1366x768: the technical error is only in the console; the learner sees the generic message (no stack, no error text)', r.log.consoleErrors.some(e => /test: controlled initialization failure/.test(e)) && !/controlled|test:|Error/.test(r.s.text), JSON.stringify(r.log.consoleErrors));
    check('initialization failure @1366x768: the gate (not the app) is on screen: the sidebar, planet bar and 3D canvas are hidden, and the code input is closed', await r.pg.evaluate(() => getComputedStyle(document.getElementById('gatekeeper')).display !== 'none' && ['side-ui', 'planet-nav', 'canvas-container'].every(id => getComputedStyle(document.getElementById(id)).display === 'none') && document.getElementById('activation-code').disabled));
    await r.context.close(); }
  { const r = await fatalChecks(browser, 'initialization failure (WebGL error raised by the renderer)', 'webgl', 1366, 768,
      { controls: withControls(`THREE.WebGLRenderer = function () { throw new Error('Error creating WebGL context.'); };`) }, [/Error creating WebGL context/], { enter: true }); await r.context.close(); }
  { const r = await fatalChecks(browser, 'initialization failure (renderer error unrelated to WebGL)', 'init', 1366, 768,
      { controls: withControls(`THREE.WebGLRenderer = function () { throw new TypeError('test: renderer exploded'); };`) }, [/test: renderer exploded/], { enter: true }); await r.context.close(); }

  // 5. Retry: the page reloads (a new document), also from the keyboard; after the cause is gone the app starts once.
  for (const key of ['Enter', ' ']) {
    let threeRequests = 0;
    const { pg, context, log } = await open(browser, 1366, 768, { three: r => { threeRequests++; return threeRequests === 1 ? r.fulfill({ status: 404, contentType: 'text/plain', body: 'not found' }) : r.continue(); } });
    await pg.evaluate(() => { window.__firstDocument = true; });
    const s = await pg.evaluate(`(${STATE})()`), focused = await pg.evaluate(() => document.activeElement.id);
    await pg.keyboard.press(key); await pg.waitForFunction(() => !window.__firstDocument, null, { timeout: 8000 }).catch(() => {}); await pg.waitForTimeout(2000);
    const after = await pg.evaluate(() => ({ firstDocument: !!window.__firstDocument, navigation: performance.getEntriesByType('navigation')[0]?.type, alerts: document.querySelectorAll('#startup-error').length, retries: document.querySelectorAll('#startup-retry').length, loader: !!document.getElementById('loader'), three: typeof THREE === 'object' ? THREE.REVISION : typeof THREE, failed: StartupGuard.failed, input: !document.getElementById('activation-code').disabled && getComputedStyle(document.getElementById('activation-code')).display !== 'none' }));
    check(`retry (${key === ' ' ? 'Space' : 'Enter'}): the failure shows, focus is on the retry button, and the keyboard press reloads the page (a new document, navigation type "${after.navigation}")`, s.failed === 'dependencies' && focused === 'startup-retry' && !after.firstDocument && after.navigation === 'reload', JSON.stringify({ failed: s.failed, focused, after }));
    check(`retry (${key === ' ' ? 'Space' : 'Enter'}): three.js was requested again (${threeRequests} requests) and the reloaded page is normal: no alert, no button, no spinner, the code input works`, threeRequests === 2 && after.alerts === 0 && after.retries === 0 && !after.loader && after.three === '128' && after.failed === null && after.input, JSON.stringify({ threeRequests, after }));
    await pg.fill('#activation-code', 'NGV-2025'); await pg.keyboard.press('Tab'); await pg.keyboard.press('Enter'); await pg.waitForTimeout(2300);
    const run = await pg.evaluate(() => ({ canvases: document.querySelectorAll('#canvas-container canvas').length, ready: document.body.classList.contains('is-ready'), renderer: renderer instanceof THREE.WebGLRenderer, planets: planets.length }));
    check(`retry (${key === ' ' ? 'Space' : 'Enter'}): after the reload the code starts the app exactly once (one canvas, renderer, nine bodies)`, run.canvases === 1 && run.ready && run.renderer && run.planets === 9, JSON.stringify(run));
    check(`retry (${key === ' ' ? 'Space' : 'Enter'}): the only technical errors are those of the first load`, log.pageErrors.every(e => /THREE is not defined/.test(e)) && log.consoleErrors.every(e => /Failed to load resource/.test(e)), JSON.stringify({ page: log.pageErrors, console: log.consoleErrors }));
    await context.close();
  }
  { // A retry while the cause persists shows the message again (one alert), it does not loop or stack messages.
    const { pg, context } = await open(browser, 1366, 768, { three: THREE_FAILS['three.js: HTTP 404'] }); await pg.evaluate(() => { window.__first = true; });
    await pg.click('#startup-retry'); await pg.waitForFunction(() => !window.__first, null, { timeout: 8000 }).catch(() => {}); await pg.waitForTimeout(2000); const s = await pg.evaluate(`(${STATE})()`);
    check('retry with the cause still present: the page reloads and shows the same single message and button again', s.alerts === 1 && s.retries === 1 && s.text === MESSAGES.dependencies && s.retryFocused && s.loaders === 0, JSON.stringify({ alerts: s.alerts, retries: s.retries, text: s.text })); await context.close(); }

  // 6. Phones and the short landscape window: the messages stay readable; nothing overlaps.
  const DEP = { three: THREE_FAILS['three.js: HTTP 404'] };
  for (const [w, h, dep, web] of [[390, 844, 'dependency-390x844', null], [390, 667, null, 'webgl-390x667'], [844, 390, 'dependency-844x390', 'webgl-844x390'], [390, 667, 'dependency-390x667', null]]) {
    if (dep) { const r = await fatalChecks(browser, 'dependency failure', 'dependencies', w, h, DEP, THREE_ERR, { shot: dep.replace(/-\d+x\d+$/, '') }); await r.context.close(); }
    if (web) { const r = await fatalChecks(browser, 'WebGL failure', 'webgl', w, h, { script: NO_WEBGL }, [], { shot: web.replace(/-\d+x\d+$/, '') }); await r.context.close(); }
  }
  { const r = await fatalChecks(browser, 'initialization failure', 'init', 390, 844, { controls: withControls(`THREE.OrbitControls = function () { throw new Error('test: controlled initialization failure'); };`) }, [/test: controlled initialization failure/], { enter: true, shot: 'init-failure-phone' }); await r.context.close(); }

  await browser.close(); server.close();
  console.log(`\n${passes} passed, ${failures} failed`);
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); server.close(); process.exit(1); });
