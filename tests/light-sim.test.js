// Light-simulation engine tests (Phase 6H.2). Run with: node --test tests/light-sim.test.js
// Node's built-in runner only. The modules run in a sandbox; a fake monotonic clock drives every test (no real waiting).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const window = {}, context = vm.createContext({ window, Intl });
for (const file of ['light-data.js', 'light-sim.js']) vm.runInContext(fs.readFileSync(path.join(ROOT, file), 'utf8'), context, { filename: file });
const { LightData: L, LightSim: S } = window;
const near = (actual, expected, rel = 1e-12, abs = 1e-9) =>
  assert.ok(Math.abs(actual - expected) <= Math.max(abs, rel * Math.abs(expected)), `${actual} ≉ ${expected}`);
// A fake clock in milliseconds.
const fakeClock = (t = 1000) => ({ now: () => t, go: ms => { t += ms; return t; }, set: ms => { t = ms; } });

test('exactly 1 s and 15 s produce the exact light distances, and the run stops there', () => {
  for (const [seconds, km] of [[1, 299792.458], [15, 4496886.87]]) {
    const clock = fakeClock(), done = [];
    const run = S.createRun({ durationSeconds: seconds, now: clock.now, onComplete: shot => done.push(shot) });
    assert.equal(run.state, 'idle'); assert.equal(run.snapshot().travelledKm, 0);
    assert.equal(run.start(), true);
    clock.go(seconds * 1000 + 37); // The frame after the end comes late.
    const shot = run.update();
    assert.equal(shot.state, 'completed'); assert.equal(shot.activeSeconds, seconds); near(shot.travelledKm, km, 1e-15);
    assert.equal(shot.travelledKm, L.lightDistanceKm(seconds)); assert.equal(shot.remainingSeconds, 0);
    near(shot.wallSeconds, seconds, 1e-12); // Completed at the real end moment, not at the late frame.
    assert.equal(done.length, 1); assert.equal(done[0].activeSeconds, seconds);
    clock.go(5000); run.update(); run.update();
    assert.equal(run.snapshot().activeSeconds, seconds); assert.equal(done.length, 1);
  }
});

test('irregular frame intervals and long stalls give exactly the elapsed active time (no frame dependence)', () => {
  const clock = fakeClock(), run = S.createRun({ durationSeconds: 15, now: clock.now });
  run.start();
  const steps = [16.7, 33.3, 8.3, 250, 4.1, 1000, 0, 0.001, 2000]; let total = 0;
  for (const ms of steps) { clock.go(ms); total += ms; const shot = run.update(); near(shot.activeSeconds, total / 1000, 1e-12); near(shot.travelledKm, L.lightDistanceKm(total / 1000), 1e-12); }
  // 1 000 frames at 144 Hz vs 1 frame: same distance at the same moment.
  const a = fakeClock(0), b = fakeClock(0), fast = S.createRun({ now: a.now }), slow = S.createRun({ now: b.now });
  fast.start(); slow.start();
  for (let i = 0; i < 1000; i++) { a.go(1000 / 144); fast.update(); }
  b.go(1000 * 1000 / 144); slow.update();
  near(fast.snapshot().travelledKm, slow.snapshot().travelledKm, 1e-9);
});

test('progress never passes the stop time, even when sampled between frames', () => {
  const clock = fakeClock(), run = S.createRun({ durationSeconds: 1, now: clock.now });
  run.start(); clock.go(999); assert.equal(run.update().state, 'running');
  clock.go(500); // No update yet: a plain snapshot is clamped.
  const between = run.snapshot(); assert.equal(between.activeSeconds, 1); assert.equal(between.travelledKm, 299792.458);
  assert.equal(run.update().state, 'completed');
});

test('pause excludes paused time; resume continues from the same distance; repeated cycles do not drift', () => {
  const clock = fakeClock(), run = S.createRun({ durationSeconds: 15, now: clock.now });
  run.start(); clock.go(400); run.update();
  assert.equal(run.pause(), true); assert.equal(run.state, 'paused'); assert.equal(run.snapshot().pauseReason, 'user');
  const atPause = run.snapshot().travelledKm; near(atPause, L.lightDistanceKm(0.4), 1e-12);
  clock.go(60000); assert.equal(run.update().travelledKm, atPause); // A minute paused adds nothing.
  assert.equal(run.resume(), true); assert.equal(run.snapshot().travelledKm, atPause);
  clock.go(100); near(run.update().activeSeconds, 0.5, 1e-12);
  near(run.snapshot().wallSeconds, 60.5, 1e-12); // Wall time includes the pause; active time does not.
  // 1 000 pause/resume cycles of 3 ms running + 7 ms paused = exactly 3 s active.
  const c2 = fakeClock(), r2 = S.createRun({ durationSeconds: 15, now: c2.now }); r2.start();
  for (let i = 0; i < 1000; i++) { c2.go(3); r2.update(); r2.pause(); c2.go(7); r2.resume(); }
  near(r2.snapshot().activeSeconds, 3, 1e-12); near(r2.snapshot().travelledKm, L.lightDistanceKm(3), 1e-12);
  assert.equal(r2.resume(), false); assert.equal(r2.pause(), true); assert.equal(r2.pause(), false); // Invalid transitions are refused.
});

test('a hidden-document pause excludes the hidden time and does not resume by itself', () => {
  const clock = fakeClock(), run = S.createRun({ durationSeconds: 15, now: clock.now });
  run.start(); clock.go(2000); run.update();
  clock.go(120); assert.equal(run.pause('hidden'), true); // The hide event comes 120 ms after the last frame: still counted.
  assert.equal(run.snapshot().pauseReason, 'hidden'); near(run.snapshot().activeSeconds, 2.12, 1e-12);
  clock.go(3600000); for (let i = 0; i < 3; i++) run.update(); // An hour hidden; frames when visible again.
  assert.equal(run.state, 'paused'); near(run.snapshot().activeSeconds, 2.12, 1e-12);
  run.resume(); clock.go(880); near(run.update().activeSeconds, 3, 1e-12);
});

test('completion wins over a pause that comes after the end; no duplicate completion', () => {
  const clock = fakeClock(), done = [], run = S.createRun({ durationSeconds: 1, now: clock.now, onComplete: s => done.push(s.state) });
  run.start(); clock.go(1500);
  assert.equal(run.pause('hidden'), false); assert.equal(run.state, 'completed'); assert.deepEqual(done, ['completed']);
  run.update(); run.pause(); run.resume(); assert.equal(done.length, 1);
});

test('reset returns to the initial state and allows exactly one new completion; repeated resets are safe', () => {
  const clock = fakeClock(), done = [], run = S.createRun({ durationSeconds: 1, now: clock.now, onComplete: () => done.push(1) });
  for (let cycle = 0; cycle < 50; cycle++) {
    assert.equal(run.reset(), true);
    const idle = run.snapshot();
    assert.deepEqual({ ...idle }, { state: 'idle', mode: 'real-time', timeScale: 1, durationSeconds: 1, activeSeconds: 0, simulatedSeconds: 0, travelledKm: 0, remainingSeconds: 1, wallSeconds: 0, pauseReason: null, completed: false });
    run.start(); clock.go(250); run.update(); if (cycle % 2) { run.pause(); clock.go(10); run.resume(); }
    clock.go(800); run.update();
    assert.equal(run.state, 'completed');
  }
  assert.equal(done.length, 50); assert.equal(run.reset(), true); assert.equal(run.reset(), true);
  assert.equal(run.start(), true); assert.equal(run.start(), false); // Only from idle.
});

test('dispose: stops for good, no stale callbacks, every later call is a no-op', () => {
  const clock = fakeClock(), done = [], run = S.createRun({ durationSeconds: 1, now: clock.now, onComplete: () => done.push(1) });
  run.start(); clock.go(400); run.update();
  assert.equal(run.dispose(), true); assert.equal(run.state, 'disposed');
  clock.go(5000);
  for (const call of ['update', 'start', 'pause', 'resume', 'reset']) run[call]();
  assert.equal(run.state, 'disposed'); assert.equal(done.length, 0); assert.equal(run.dispose(), false);
  near(run.snapshot().activeSeconds, 0.4, 1e-12); // The last value stays readable; time no longer moves.
});

test('a callback that re-enters the run cannot cause a second completion', () => {
  const clock = fakeClock(); let calls = 0, run = null;
  run = S.createRun({ durationSeconds: 1, now: clock.now, onComplete: () => { calls++; run.update(); run.pause(); run.update(); } });
  run.start(); clock.go(2000); run.update(); run.update();
  assert.equal(calls, 1);
});

test('unlimited run (no duration) keeps measuring; a clock stepping back never removes time', () => {
  const clock = fakeClock(10000), run = S.createRun({ now: clock.now });
  run.start(); clock.go(1000); assert.equal(run.update().activeSeconds, 1);
  clock.set(10500); assert.equal(run.update().activeSeconds, 1); // Backwards: not less than before.
  clock.set(12000); assert.equal(run.update().remainingSeconds, null);
});

test('options and inputs are validated', () => {
  for (const durationSeconds of [0, -1, NaN, Infinity, '1', {}]) assert.throws(() => S.createRun({ durationSeconds }), { name: 'RangeError' });
  assert.throws(() => S.createRun({ now: 5 }), { name: 'TypeError' });
  assert.throws(() => S.createRun({ onComplete: 'x' }), { name: 'TypeError' });
  const bad = S.createRun({ now: () => NaN }); assert.throws(() => bad.start(), { name: 'TypeError' });
  assert.ok(S.createRun().state === 'idle'); // Defaults: real clock, no duration, no callback.
});

test('physical coordinates: fixed 1 world unit = 1 000 km; scene scale never changes physical distance', () => {
  assert.equal(S.WORLD_UNITS_PER_KM, 0.001);
  assert.equal(S.kmToWorld(L.lightDistanceKm(1)), 299.792458);
  near(S.kmToWorld(L.earthMoon.surfaceKm), 376.2916, 1e-12);
  near(S.kmToWorld(L.lightDistanceKm(15)), 4496.88687, 1e-12);
  near(S.kmToWorld(L.sunToPlanet('neptune').distanceKm), L.sunToPlanet('neptune').distanceKm / 1000, 1e-15);
  near(S.kmToWorld(-L.earthMoon.earthRadiusKm), -6.371, 1e-12); // Behind the source.
  for (const km of [0, 1, 384400, 4496886.87, 4.5e9]) near(S.worldToKm(S.kmToWorld(km)), km, 1e-15);
  for (const v of [NaN, Infinity, undefined, '3']) { assert.throws(() => S.kmToWorld(v), { name: 'TypeError' }); assert.throws(() => S.worldToKm(v), { name: 'TypeError' }); }
  assert.equal(S.kmToWorld(-0), 0);
  assert.ok(Object.isFrozen(S) && Object.isFrozen(S.STATES));
});

// Time acceleration (Phase 6H.5.1): timeScale changes playback only; light always moves at c in the model.
test('timeScale: the default is 1× real time, identical to an explicit timeScale 1 (backward compatible)', () => {
  const a = fakeClock(), b = fakeClock(), done = [];
  const plain = S.createRun({ durationSeconds: 15, now: a.now }), one = S.createRun({ durationSeconds: 15, now: b.now, timeScale: 1, onComplete: s => done.push(s) });
  const same = () => { const x = plain.update(), y = one.update(); assert.deepEqual(x, y); return x; };
  plain.start(); one.start();
  for (const ms of [16.7, 250, 0, 4000, 3.3]) { a.go(ms); b.go(ms); const shot = same(); assert.equal(shot.mode, 'real-time'); assert.equal(shot.timeScale, 1); assert.equal(shot.simulatedSeconds, shot.activeSeconds); assert.equal(shot.travelledKm, L.lightDistanceKm(shot.activeSeconds)); }
  plain.pause(); one.pause(); a.go(9000); b.go(9000); same(); plain.resume(); one.resume();
  a.go(20000); b.go(20000); const end = same();
  assert.equal(end.state, 'completed'); assert.equal(end.activeSeconds, 15); assert.equal(end.simulatedSeconds, 15); assert.equal(end.travelledKm, L.lightDistanceKm(15)); assert.equal(done.length, 1);
  assert.deepEqual(Object.keys(end).sort(), ['activeSeconds', 'completed', 'durationSeconds', 'mode', 'pauseReason', 'remainingSeconds', 'simulatedSeconds', 'state', 'timeScale', 'travelledKm', 'wallSeconds']);
});

test('timeScale 60× and 600×: physical time = playback time × scale; light still moves at c', () => {
  for (const scale of [60, 600]) {
    const clock = fakeClock(), run = S.createRun({ now: clock.now, timeScale: scale });
    run.start();
    for (const ms of [16.7, 33.3, 500, 1000]) {
      clock.go(ms); const shot = run.update();
      assert.equal(shot.mode, 'accelerated'); assert.equal(shot.timeScale, scale);
      near(shot.simulatedSeconds, shot.activeSeconds * scale, 1e-15); near(shot.travelledKm / shot.simulatedSeconds, L.C_KM_PER_S, 1e-12);
    }
    near(run.snapshot().activeSeconds, 1.55, 1e-12); near(run.snapshot().simulatedSeconds, 1.55 * scale, 1e-12);
  }
  // 1 playback second at 600× is 10 physical minutes: 179 875 474,8 km.
  const clock = fakeClock(), run = S.createRun({ now: clock.now, timeScale: 600 }); run.start(); clock.go(1000);
  assert.equal(run.update().simulatedSeconds, 600); assert.equal(run.snapshot().travelledKm, L.lightDistanceKm(600));
});

test('timeScale: exact physical stop (planet light times), playback length = duration / scale, completion exactly once', () => {
  for (const [scale, id] of [[60, 'mars'], [600, 'neptune'], [600, 'mercury'], [60, 'earth']]) {
    const physical = L.sunToPlanet(id).lightSeconds, playbackMs = physical * 1000 / scale, clock = fakeClock(), done = [];
    const run = S.createRun({ durationSeconds: physical, now: clock.now, timeScale: scale, onComplete: s => done.push(s) });
    run.start();
    clock.go(playbackMs - 1); let shot = run.update();
    assert.equal(shot.state, 'running'); assert.ok(shot.simulatedSeconds < physical); near(shot.remainingSeconds, scale / 1000, 1e-9, 1e-9);
    clock.go(1 + 41); shot = run.update(); // the frame after the end comes 41 ms late
    assert.equal(shot.state, 'completed'); assert.equal(shot.simulatedSeconds, physical); assert.equal(shot.activeSeconds, physical / scale);
    assert.equal(shot.travelledKm, L.sunToPlanet(id).distanceKm === L.lightDistanceKm(physical) ? L.sunToPlanet(id).distanceKm : L.lightDistanceKm(physical));
    near(shot.travelledKm, L.sunToPlanet(id).distanceKm, 1e-12); assert.equal(shot.remainingSeconds, 0);
    near(shot.wallSeconds, physical / scale, 1e-12); // ended at the real playback moment, not at the late frame
    assert.equal(done.length, 1); assert.equal(done[0].simulatedSeconds, physical);
    clock.go(60000); run.update(); run.update(); assert.equal(run.pause(), false);
    assert.equal(run.snapshot().simulatedSeconds, physical); assert.equal(done.length, 1);
  }
});

test('timeScale: never past the physical stop, even sampled between frames or with rounding', () => {
  const physical = L.sunToPlanet('neptune').lightSeconds, clock = fakeClock(), run = S.createRun({ durationSeconds: physical, now: clock.now, timeScale: 600 });
  run.start();
  for (let i = 0; i < 400; i++) { clock.go(63.7); const shot = run.snapshot(); assert.ok(shot.simulatedSeconds <= physical); assert.ok(shot.travelledKm <= L.lightDistanceKm(physical)); assert.ok(shot.activeSeconds <= physical / 600); }
});

test('timeScale: pause/resume at 600× excludes paused time; repeated cycles do not drift', () => {
  const clock = fakeClock(), run = S.createRun({ durationSeconds: L.sunToPlanet('neptune').lightSeconds, now: clock.now, timeScale: 600 });
  run.start(); let played = 0;
  for (let i = 0; i < 50; i++) {
    clock.go(37); played += 37; assert.equal(run.pause(), true);
    const held = run.snapshot(); clock.go(5000); assert.deepEqual(run.update(), held); // nothing moves while paused
    assert.equal(run.resume(), true);
  }
  const shot = run.update(); near(shot.activeSeconds, played / 1000, 1e-12); near(shot.simulatedSeconds, played / 1000 * 600, 1e-12);
  near(shot.wallSeconds, (played + 50 * 5000) / 1000, 1e-12); assert.equal(shot.state, 'running');
});

test('timeScale: frame drops and long stalls at 600× give exactly the elapsed playback time (no frame dependence)', () => {
  const clock = fakeClock(), run = S.createRun({ now: clock.now, timeScale: 600 }); run.start();
  let total = 0;
  for (const ms of [16.7, 500, 0, 0.001, 2000, 8.3, 1000]) { clock.go(ms); total += ms; const shot = run.update(); near(shot.activeSeconds, total / 1000, 1e-12); near(shot.simulatedSeconds, total / 1000 * 600, 1e-12); }
  // A stall past the stop completes at the exact physical end.
  const physical = L.sunToPlanet('jupiter').lightSeconds, c2 = fakeClock(), done = [], r2 = S.createRun({ durationSeconds: physical, now: c2.now, timeScale: 600, onComplete: s => done.push(s) });
  r2.start(); c2.go(60000); const shot = r2.update();
  assert.equal(shot.simulatedSeconds, physical); assert.equal(done.length, 1); near(shot.wallSeconds, physical / 600, 1e-12);
});

test('timeScale: a hidden-document pause at 60× excludes the hidden time and does not resume by itself', () => {
  const clock = fakeClock(), run = S.createRun({ durationSeconds: L.sunToPlanet('mars').lightSeconds, now: clock.now, timeScale: 60 });
  run.start(); clock.go(2000);
  assert.equal(run.pause('hidden'), true); const hidden = run.snapshot(); assert.equal(hidden.pauseReason, 'hidden'); near(hidden.simulatedSeconds, 120, 1e-12);
  clock.go(600000); assert.equal(run.update().simulatedSeconds, hidden.simulatedSeconds); assert.equal(run.state, 'paused');
  run.resume(); clock.go(1000); const shot = run.update(); near(shot.simulatedSeconds, 180, 1e-12); near(shot.activeSeconds, 3, 1e-12); assert.equal(shot.pauseReason, null);
});

test('timeScale: reset and dispose keep the scale; snapshot fields stay consistent', () => {
  const clock = fakeClock(), done = [], physical = L.sunToPlanet('earth').lightSeconds;
  const run = S.createRun({ durationSeconds: physical, now: clock.now, timeScale: 60, onComplete: s => done.push(s) });
  const check = shot => { assert.equal(shot.timeScale, 60); assert.equal(shot.mode, 'accelerated'); assert.equal(shot.durationSeconds, physical);
    near(shot.simulatedSeconds, Math.min(physical, shot.activeSeconds * 60), 1e-12); assert.equal(shot.travelledKm, L.lightDistanceKm(shot.simulatedSeconds));
    near(shot.remainingSeconds, physical - shot.simulatedSeconds, 1e-12, 1e-9); assert.ok(shot.wallSeconds >= shot.activeSeconds - 1e-12); };
  check(run.snapshot()); run.start(); clock.go(4000); check(run.update());
  run.reset(); assert.equal(run.snapshot().simulatedSeconds, 0); check(run.snapshot());
  run.start(); clock.go(physical / 60 * 1000 + 5); check(run.update()); assert.equal(done.length, 1);
  run.reset(); run.start(); clock.go(1000); run.dispose(); const kept = run.snapshot(); check(kept); near(kept.simulatedSeconds, 60, 1e-12);
  clock.go(9000); assert.deepEqual(run.update(), kept); assert.equal(done.length, 1);
});

test('timeScale: invalid values are rejected', () => {
  for (const timeScale of [0, -1, -600, NaN, Infinity, -Infinity, '600', null, {}, true])
    assert.throws(() => S.createRun({ timeScale }), { name: 'RangeError' }, String(timeScale));
  assert.equal(S.createRun({ timeScale: undefined }).snapshot().timeScale, 1); // omitted → default 1
  assert.equal(S.createRun({ timeScale: 0.5 }).snapshot().mode, 'slowed'); // slow motion is allowed (positive, finite)
});
