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
    assert.deepEqual({ ...idle }, { state: 'idle', mode: 'real-time', durationSeconds: 1, activeSeconds: 0, travelledKm: 0, remainingSeconds: 1, wallSeconds: 0, pauseReason: null, completed: false });
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
