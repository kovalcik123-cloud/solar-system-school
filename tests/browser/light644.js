// Phase 6H.4.3.D Milky Way backdrop visibility harness (outside the repository). Test-only fixture with both light journeys; the variants
// are set with the development hook lightStage.setBackground() inside this test browser only. "pohyb" stays inactive in the app.
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const S = __dirname, ROOT = require('./env').ROOT, OUT = require('./env').out('light644'), PORT = Number(process.env.PORT || 8921);
fs.mkdirSync(OUT, { recursive: true });
const server = http.createServer((q, r) => { const u = decodeURIComponent(q.url.split('?')[0]); fs.readFile(path.join(ROOT, u === '/' ? 'index.html' : u), (e, d) => { if (e) { r.writeHead(404); r.end(); } else r.end(d); }); }).listen(PORT);
const FIXTURE = `window.LearnContent.topics.push({"id":"test-svetlo","title":"Testovacia lekcia","description":"Len na testovanie.","minutes":1}); window.LearnContent.lessons.push(${JSON.stringify({ id: 'test-svetlo', title: 'Svetlo — technický test', objective: 'Len na testovanie.', limitation: 'Len na testovanie.', steps: [
  { id: 'uvod', type: 'intro', title: 'Úvod — test', text: 'Len na testovanie.' },
  { id: 'svetlo1', type: 'experiment', title: 'Svetlo za jednu sekundu', text: 'Len na testovanie.', experiment: { kind: 'light-travel', journey: 'earth-moon' } },
  { id: 'svetlo15', type: 'experiment', title: 'Svetlo za 15 sekúnd', text: 'Len na testovanie.', experiment: { kind: 'light-travel', journey: 'fifteen' } },
  { id: 'zaver', type: 'summary', title: 'Koniec testu', ideas: ['Len na testovanie.'], text: 'Len na testovanie.' }] })});`;
const C = JSON.parse(process.env.CINE || '{"brightness":2,"lift":0.9}');
const VARIANTS = [['A', { brightness: 0, lift: 1, offset: 0 }], ['M1', { brightness: 1, lift: 1, offset: 0 }], ['M15', { brightness: 1.5, lift: 1, offset: 0 }], ['C', { ...C, offset: 0 }]];
const SHOT_SIZES = ['1366x768', '390x844', '844x390'];
let failures = 0, passes = 0; const notes = [];
const check = (label, ok, detail = '') => { ok ? passes++ : failures++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${!ok && detail ? '  — ' + String(detail).slice(0, 900) : ''}`); };
async function open(browser, w, h) {
  const context = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: w < 500 }), pg = await context.newPage(), errors = [];
  pg.on('pageerror', e => errors.push(e.message)); pg.on('console', m => { if (m.type() === 'error' || /THREE\.WebGL|shader/i.test(m.text())) errors.push('console: ' + m.text()); });
  await pg.route('**/three.min.js', r => r.fulfill({ path: require('./env').vendor('three.min.js') }));
  await pg.route('**/OrbitControls.js', r => r.fulfill({ path: require('./env').vendor('OrbitControls.js') }));
  await pg.route('**/learn-content.sk.js', async r => { const res = await r.fetch(); r.fulfill({ response: res, body: (await res.text()) + '\n' + FIXTURE }); });
  await pg.goto(`http://localhost:${PORT}/`); await pg.waitForTimeout(600);
  await pg.fill('#activation-code', 'NGV-2025'); await pg.evaluate(() => checkCode()); await pg.waitForTimeout(2800); // textures incl. stars.jpg
  // Test-only hook: remember the scene/camera the light stage renders.
  await pg.evaluate(() => { if (areOrbitsActive) toggleOrbit(); const render = renderer.render.bind(renderer); renderer.render = (sc, cam) => { if (sc !== scene) window.__stage = { scene: sc, camera: cam }; return render(sc, cam); }; });
  return { pg, errors, context };
}
const toStep = async (pg, n) => {
  await pg.evaluate(() => { Learn.enter(); [...document.querySelectorAll('.learn-topic')].find(c => c.querySelector('h3').textContent === 'Testovacia lekcia').querySelector('button').click(); });
  await pg.waitForTimeout(400); for (let i = 0; i < n; i++) { await pg.evaluate(() => document.querySelector('.learn-footer .learn-primary').click()); await pg.waitForTimeout(450); }
};
const frames = (pg, n = 3) => pg.evaluate(n => new Promise(res => { let k = 0; const f = () => (++k >= n ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
const fake = pg => pg.evaluate(() => { window.__realNow = window.__realNow || performance.now.bind(performance); window.__t = window.__realNow(); performance.now = () => window.__t; });
const advance = async (pg, ms, n = 2) => { await pg.evaluate(ms => { window.__t += ms; }, ms); await frames(pg, n); };
// Backdrop facts from the light scene itself: shared map identity, plane bounds vs the camera view.
const SKY = () => { const st = window.__stage, mainSky = scene.children.find(o => o.isMesh && o.geometry?.parameters?.radius === 5000 && o.material?.side === THREE.BackSide);
  const plane = st.scene.children.find(o => o.isMesh && o.position.z === -90), cam = st.camera, b = lightStage.background;
  const half = { w: plane.scale.x / 2, h: plane.scale.y / 2 };
  const u = plane.material.userData; return { shown: plane.visible, brightness: b.brightness, lift: b.lift, offset: b.offset, programKey: plane.material.customProgramCacheKey?.(), sameMap: !!plane.material.map && plane.material.map === mainSky?.material.map, mapNull: plane.material.map === null,
    covers: plane.position.x - half.w <= cam.left + 1e-9 && plane.position.x + half.w >= cam.right - 1e-9 && plane.position.y + half.h >= cam.top - 1e-9 && plane.position.y - half.h <= cam.bottom + 1e-9,
    aspect: plane.scale.x / plane.scale.y, color: plane.material.color.r, programs: renderer.info.programs.length, depthTest: plane.material.depthTest, depthWrite: plane.material.depthWrite, renderOrder: plane.renderOrder,
    textures: (renderer.render(st.scene, cam), renderer.info.memory.textures) }; };
// WCAG contrast of each visible overlay label against the canvas actually drawn behind it (95th percentile luminance under the label box),
// and the brightest backdrop pixel vs. the light head.
const CONTRAST = () => {
  lightStage.render(); const c = renderer.domElement, k = c.width / innerWidth, g = document.createElement('canvas'); g.width = c.width; g.height = c.height; const ctx = g.getContext('2d'); ctx.drawImage(c, 0, 0);
  const lin = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }, L = (r, gg, b) => 0.2126 * lin(r) + 0.7152 * lin(gg) + 0.0722 * lin(b);
  const parse = s => s.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number);
  const out = [];
  for (const e of document.querySelectorAll('#light-stage-overlay > div')) {
    if (e.hidden || !e.getBoundingClientRect().width) continue;
    const r = e.getBoundingClientRect(), x0 = Math.max(0, Math.floor(r.left * k)), y0 = Math.max(0, Math.floor(r.top * k)), w = Math.max(1, Math.min(g.width - x0, Math.ceil(r.width * k))), h = Math.max(1, Math.min(g.height - y0, Math.ceil(r.height * k)));
    const d = ctx.getImageData(x0, y0, w, h).data, lums = []; for (let i = 0; i < d.length; i += 4) lums.push(L(d[i], d[i + 1], d[i + 2])); lums.sort((a, b) => a - b);
    const bg = lums[Math.floor(lums.length * 0.95)], fg = L(...parse(getComputedStyle(e).color)), ratio = (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05);
    out.push({ cls: e.className, text: e.textContent.slice(0, 14), ratio: +ratio.toFixed(2), muted: e.classList.contains('light-mile') && !e.classList.contains('is-reached') });
  }
  return out; };
const BAND = () => { lightStage.render(); const c = renderer.domElement, g = document.createElement('canvas'); g.width = c.width; g.height = c.height; const ctx = g.getContext('2d'); ctx.drawImage(c, 0, 0);
  const d = ctx.getImageData(0, 0, g.width, g.height).data, v = []; for (let i = 0; i < d.length; i += 4 * 7) v.push(0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]); v.sort((a, b) => a - b);
  const q = p => +v[Math.floor(v.length * p)].toFixed(1); return { mean: +(v.reduce((a, b) => a + b, 0) / v.length).toFixed(1), p50: q(0.5), p90: q(0.9), p99: q(0.99) }; };
const LABELS = () => [...document.querySelectorAll('#light-stage-overlay > div')].filter(e => !e.hidden && e.getBoundingClientRect().width).map(e => { const t = e.classList.contains('light-scale') ? e.querySelector('span') : e, r = t.getBoundingClientRect(), m = getComputedStyle(t).color.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number);
  return { x: r.left, y: r.top, w: r.width, h: r.height, fg: m, cls: e.className, text: e.textContent.slice(0, 14), muted: e.classList.contains('light-mile') && !e.classList.contains('is-reached') }; });
const EFFECTIVE = async (src, labels) => { const img = new Image(); img.src = src; await img.decode(); const g = document.createElement('canvas'); g.width = img.width; g.height = img.height; const ctx = g.getContext('2d'); ctx.drawImage(img, 0, 0);
  const lin = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }, L = (r, gg, b) => 0.2126 * lin(r) + 0.7152 * lin(gg) + 0.0722 * lin(b), k = img.width / innerWidth;
  return labels.map(l => { const x0 = Math.max(0, Math.floor(l.x * k)), y0 = Math.max(0, Math.floor(l.y * k)), w = Math.max(1, Math.min(g.width - x0, Math.ceil(l.w * k))), h = Math.max(1, Math.min(g.height - y0, Math.ceil(l.h * k)));
    const d = ctx.getImageData(x0, y0, w, h).data, lums = []; for (let i = 0; i < d.length; i += 4) lums.push(L(d[i], d[i + 1], d[i + 2])); lums.sort((a, b) => a - b);
    const bg = lums[Math.floor(lums.length * 0.95)], fg = L(...l.fg); return { cls: l.cls, text: l.text, muted: l.muted, ratio: +((Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05)).toFixed(2) }; }); };
async function effective(pg) { const labels = await pg.evaluate(`(${LABELS})()`); const h = await pg.addStyleTag({ content: '#light-stage-overlay, #light-stage-overlay * { color: transparent !important; }' });
  const src = 'data:image/png;base64,' + (await pg.screenshot()).toString('base64'); await h.evaluate(n => n.remove()); return pg.evaluate(`(${EFFECTIVE})(${JSON.stringify(src)}, ${JSON.stringify(labels)})`); }
const STATIC_DIFF = () => { lightStage.render(); const c = renderer.domElement, g = document.createElement('canvas'); g.width = c.width; g.height = c.height; const ctx = g.getContext('2d'); ctx.drawImage(c, 0, 0); return Array.from(ctx.getImageData(0, 0, g.width, Math.floor(g.height * 0.25)).data.filter((_, i) => i % 97 === 0)).join(); };

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const shots = {};
  for (const [w, h] of (process.env.SIZES ? JSON.parse(process.env.SIZES) : [[1920, 1080], [1366, 768], [390, 844], [390, 667], [844, 390]])) {
    for (const [journey, step] of [['one-second', 1], ['fifteen', 2]]) {
      const tag = `${w}×${h} ${journey}`, { pg, errors, context } = await open(browser, w, h);
      await toStep(pg, step); if (w === 844) await pg.waitForTimeout(200);
      await fake(pg); await advance(pg, 50);
      // Bring the experiment to a representative moment: 1 s result with a tip; 15 s at 10 s with a guess.
      if (journey === 'one-second') { await pg.evaluate(() => { const s = document.getElementById('learn-light-tip'); s.value = '60'; s.dispatchEvent(new Event('input', { bubbles: true })); }); await advance(pg, 50); await pg.evaluate(() => lightStage.start()); await advance(pg, 3000); await advance(pg, 1200); await advance(pg, 50); }
      else { await pg.click('.learn-light-choices label:has(input[value="12"])'); await advance(pg, 50); await pg.evaluate(() => lightStage.start()); await advance(pg, 3000); await advance(pg, 10000); await advance(pg, 50); }
      const results = {};
      for (const [name, cfg] of VARIANTS) {
        await pg.evaluate(cfg => lightStage.setBackground(cfg), cfg); await advance(pg, 50, 3);
        const sky = await pg.evaluate(`(${SKY})()`), con = await pg.evaluate(`(${CONTRAST})()`), band = await pg.evaluate(`(${BAND})()`), eff = await effective(pg);
        if (SHOT_SIZES.includes(`${w}x${h}`)) { const file = path.join(OUT, `${journey}-${w}x${h}-${name}.png`); await pg.screenshot({ path: file }); (shots[`${journey}-${w}x${h}`] ??= []).push([name, file]); }
        results[name] = { sky, con: eff, raw: con, band };
      }
      const A = results.A, B = ['M1', 'M15', 'C'].map(n => results[n]);
      check(`${tag}: A has no backdrop; M1/M15/C show the main scene's own stars.jpg texture (same object) through one tone-curve program; colour stays 1; no extra texture (${A.sky.textures} → ${results.C.sky.textures})`,
        !A.sky.shown && A.sky.mapNull && B.every(r => r.sky.shown && r.sky.sameMap && r.sky.color === 1 && r.sky.programKey === 'light-sky-tone' && r.sky.textures === A.sky.textures) && results.C.sky.programs === results.M1.sky.programs, JSON.stringify({ A: A.sky, C: results.C.sky }));
      check(`${tag}: brighter variants are visibly brighter (backdrop mean luma A ${A.band.mean} · M1 ${results.M1.band.mean} · M15 ${results.M15.band.mean} · C ${results.C.band.mean}; p90 ${A.band.p90} · ${results.M1.band.p90} · ${results.M15.band.p90} · ${results.C.band.p90})`,
        results.M1.band.mean > A.band.mean && results.M15.band.mean > results.M1.band.mean && results.C.band.mean > results.M15.band.mean, JSON.stringify(results.C.band));
      check(`${tag}: the 2:1 panorama covers the whole view; drawn first, no depth test or write`, B.every(r => r.sky.covers && Math.abs(r.sky.aspect - 2) < 1e-9 && !r.sky.depthTest && !r.sky.depthWrite && r.sky.renderOrder === -1), JSON.stringify(results.C.sky));
      await pg.evaluate(c => lightStage.setBackground({ ...c, offset: -0.12 }), C); await advance(pg, 50, 3); const low = await pg.evaluate(`(${SKY})()`); await pg.evaluate(() => lightStage.setBackground({ offset: 0 }));
      check(`${tag}: still fully covered with the band 12 % lower (offset option kept)`, low.covers, JSON.stringify(low));
      // Contrast per variant: normal labels ≥ 4.5:1, muted (not yet reached) milestones ≥ 3:1, against the 95th-percentile pixel behind them.
      const rawMin = n => Math.min(...results[n].raw.filter(x => !x.muted).map(x => x.ratio)); const summary = VARIANTS.map(([name]) => { const c = results[name].con, normal = c.filter(x => !x.muted), muted = c.filter(x => x.muted); return { name, minNormal: Math.min(...normal.map(x => x.ratio)), minMuted: muted.length ? Math.min(...muted.map(x => x.ratio)) : null, worst: normal.sort((a, b) => a.ratio - b.ratio)[0] }; });
      notes.push(`${tag}: ` + summary.map(s => `${s.name} min ${s.minNormal}:1${s.minMuted !== null ? ` (muted ${s.minMuted}:1)` : ''} [no halo ${rawMin(s.name)}]`).join(' · '));
      check(`${tag}: readable labels and readouts in every variant (normal ≥ 4.5:1, muted milestones ≥ 3:1 against the composited page incl. the label halo)`, summary.every(s => s.minNormal >= 4.5 && (s.minMuted === null || s.minMuted >= 3)), JSON.stringify(summary));
      // Static backdrop: the top quarter of the canvas (no beam there) is pixel-identical across frames while the light moves.
      if (journey === 'fifteen' && w === 1366) {
        await pg.evaluate(c => lightStage.setBackground({ ...c, offset: 0 }), C); await advance(pg, 50); const p1 = await pg.evaluate(`(${STATIC_DIFF})()`); await advance(pg, 1000); const p2 = await pg.evaluate(`(${STATIC_DIFF})()`);
        check(`${tag}: the backdrop is static (identical pixels away from the light while the run continues)`, p1 === p2 && (await pg.evaluate(() => lightStage.state().phase)) === 'first');
      }
      check(`${tag}: no JS or WebGL errors`, errors.length === 0, errors.join('; '));
      await context.close();
    }
  }
  // Lifecycle, sharing, isolation and frame time (1366×768).
  {
    const { pg, errors, context } = await open(browser, 1366, 768);
    await toStep(pg, 2); await frames(pg, 4);
    const def = await pg.evaluate(() => { const b = lightStage.background; return { brightness: b.brightness, lift: b.lift, offset: b.offset, shown: b.shown }; });
    check(`the shipped default is the approved medium variant M15 (brightness 1.5, lift 1, no offset): ${JSON.stringify(def)}`, def.brightness === 1.5 && def.lift === 1 && def.offset === 0 && def.shown);
    const life = await pg.evaluate(() => {
      const mainSky = scene.children.find(o => o.isMesh && o.geometry?.parameters?.radius === 5000 && o.material?.side === THREE.BackSide), tex = mainSky.material.map; let disposed = 0; tex.addEventListener('dispose', () => disposed++);
      const info = () => { renderer.render(scene, camera); return [renderer.info.memory.geometries, renderer.info.memory.textures, renderer.info.programs.length].join(); };
      lightStage.begin({ kind: 'light-travel' }); lightStage.setBackground({ brightness: 1.5, lift: 1 }); lightStage.render();
      lightStage.end(); const before = info();
      for (let i = 0; i < 20; i++) { lightStage.begin({ kind: 'light-travel', journey: i % 2 ? 'fifteen' : 'earth-moon' }); lightStage.setBackground([{ brightness: 0, lift: 1 }, { brightness: 1, lift: 1 }, { brightness: 1.5, lift: 1 }, { brightness: 2, lift: 0.9 }][i % 4]); lightStage.render(); lightStage.end(); }
      return { before, after: info(), disposed, mainMapIntact: mainSky.material.map === tex && !!tex.image };
    });
    check(`20 begin/render/end cycles with changing backdrop: resources ${life.before} → ${life.after}; the shared texture is never disposed and the Explore sky keeps it`, life.after === life.before && life.disposed === 0 && life.mainMapIntact, JSON.stringify(life));
    // Isolation: outside the light stage, the comparison stage and the main scene draw as before (no backdrop plane anywhere else).
    const iso = await pg.evaluate(() => ({ mainHasPlane: scene.children.some(o => o.isMesh && o.position.z === -90), lightActive: lightStage.active }));
    check('isolation: the backdrop exists only in the light stage scene (not in the main Explore/Quiz scene); stage inactive after leaving', !iso.mainHasPlane && !iso.lightActive, JSON.stringify(iso));
    // Frame time, A vs B2 (SwiftShader software rendering; relative only).
    await toStep(pg, 2); await frames(pg, 4);
    const timing = await pg.evaluate(async () => { const run = n => { const t0 = performance.now(); for (let i = 0; i < n; i++) lightStage.render(); renderer.getContext().finish(); return (performance.now() - t0) / n; };
      lightStage.setBackground({ brightness: 0 }); run(5); const a = run(40); lightStage.setBackground({ brightness: 2, lift: 0.9 }); run(5); const b = run(40); return { a: +a.toFixed(2), b: +b.toFixed(2) }; });
    notes.push(`render time per frame (SwiftShader, 1366×768): A ${timing.a} ms, C ${timing.b} ms`);
    check(`frame cost with the backdrop stays moderate on software rendering (A ${timing.a} ms → C ${timing.b} ms per frame)`, timing.b <= timing.a * 2 + 2, JSON.stringify(timing));
    const bad = await pg.evaluate(() => [lightStage.setBackground({ brightness: 5 }), lightStage.setBackground({ brightness: -1 }), lightStage.setBackground({ lift: 0.3 }), lightStage.setBackground({ lift: 1.5 }), lightStage.setBackground({ offset: 0.9 }), lightStage.setBackground({ brightness: NaN })]);
    check('the development hook refuses invalid values', bad.every(v => v === false));
    check('no JS or WebGL errors (lifecycle, isolation, timing)', errors.length === 0, errors.join('; '));
    await context.close();
  }
  // Composites: one row per experiment and viewport, the four variants side by side (for visual review).
  fs.writeFileSync(path.join(OUT, 'shots.json'), JSON.stringify(shots));
  console.log('NOTES\n' + notes.join('\n'));
  console.log(`${passes} passed, ${failures} failed`);
  await browser.close(); server.close();
})();
