// Light-data tests (Phase 6H.1). Run with: node --test tests/light-data.test.js
// Uses only Node's built-in test runner and assert; loads the browser modules in a sandbox with a `window` object.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const load = (...files) => {
  const window = {}, context = vm.createContext({ window, Intl });
  for (const file of files) vm.runInContext(fs.readFileSync(path.join(ROOT, file), 'utf8'), context, { filename: file });
  return window;
};
const { LightData: L, SizeData } = load('size-data.js', 'light-data.js');
// Relative tolerance for computed floating-point results: a few units in the last place.
const near = (actual, expected, rel = 1e-12, abs = 1e-9) =>
  assert.ok(Math.abs(actual - expected) <= Math.max(abs, rel * Math.abs(expected)), `${actual} ≉ ${expected}`);
const plain = text => text.replace(/[  ]/g, ' ');

test('exact constants (SI c, IAU 2012 au) and consistency with SizeData', () => {
  assert.equal(L.C_M_PER_S, 299792458);
  assert.equal(L.C_KM_PER_S, 299792.458);
  assert.equal(L.AU_KM, 149597870.7);
  assert.equal(L.AU_KM, SizeData.AU_KM);
  assert.ok(Object.isFrozen(L) && Object.isFrozen(L.earthMoon) && Object.isFrozen(L.sunDistanceAu) && Object.isFrozen(L.PLANETS));
});

test('core conversions: zero, inverse round trips, au', () => {
  assert.equal(L.lightDistanceKm(0), 0);
  assert.equal(L.lightTravelSeconds(0), 0);
  assert.equal(L.kmToAu(0), 0);
  assert.equal(L.auToKm(0), 0);
  for (const s of [1e-6, 0.016, 1, 1.255, 15, 499.0047838, 15006, 1e7]) near(L.lightTravelSeconds(L.lightDistanceKm(s)), s, 1e-15);
  for (const km of [1, 384400, 4496886.87, L.AU_KM, 4.5e9]) near(L.lightDistanceKm(L.lightTravelSeconds(km)), km, 1e-15);
  assert.equal(L.auToKm(1), L.AU_KM);
  near(L.kmToAu(L.AU_KM), 1, 1e-15);
  near(L.lightTravelSeconds(L.AU_KM), 499.00478383615643, 1e-14);
});

test('fifteen-second checkpoints (exact multiples of c)', () => {
  for (const [s, km] of [[1, 299792.458], [5, 1498962.29], [10, 2997924.58], [15, 4496886.87]]) near(L.lightDistanceKm(s), km, 1e-15);
  near(L.inEarthMoonDistances(L.lightDistanceKm(15)), 11.698456997918835, 1e-14);
  near(L.inEarthMoonDistances(L.lightDistanceKm(1)), 0.7799, 1e-3);
  // Linear in time: no frame-rate or step dependence (the sum of 900 frames of 1/60 s equals 15 s within rounding).
  let summed = 0; for (let i = 0; i < 900; i++) summed += L.lightDistanceKm(1 / 60);
  near(summed, L.lightDistanceKm(15), 1e-12);
});

test('Earth–Moon reference geometry: centre and surface models are distinct', () => {
  assert.equal(L.earthMoon.centerKm, 384400);
  assert.equal(L.earthMoon.earthRadiusKm, 6371);
  assert.equal(L.earthMoon.earthRadiusKm * 2, SizeData.bodies.earth.diameterKm);
  assert.equal(L.earthMoon.moonRadiusKm, 1737.4);
  near(L.earthMoon.surfaceKm, 376291.6);
  assert.equal(L.earthMoonDistanceKm(), L.earthMoon.surfaceKm); // default: the approved experiment (surface to surface)
  assert.equal(L.earthMoonDistanceKm('center'), 384400);
  near(L.earthMoonTravelSeconds('surface'), 1.2551737, 0, 1e-7);  // ≈ 1.255 s
  near(L.earthMoonTravelSeconds('center'), 1.2822204, 0, 1e-7);  // ≈ 1.282 s
  assert.ok(L.earthMoonTravelSeconds('surface') < L.earthMoonTravelSeconds('center'));
});

test('Earth–Moon after one second: not arrived; remaining distance and fraction', () => {
  const p = L.earthMoonProgress(1);
  assert.equal(p.model, 'surface');
  assert.equal(p.travelledKm, 299792.458);
  near(p.remainingKm, 76499.142, 1e-12);
  near(p.fraction, 0.7967, 1e-4);
  assert.equal(p.arrived, false);
  near(p.totalSeconds, L.earthMoonTravelSeconds('surface'), 1e-15);
  const c = L.earthMoonProgress(1, 'center');
  near(c.remainingKm, 84607.542, 1e-12); near(c.fraction, 0.7799, 1e-4); assert.equal(c.arrived, false);
  // Arrival exactly at the travel time, not before; afterwards light keeps going and nothing remains.
  const t = L.earthMoonTravelSeconds();
  assert.equal(L.earthMoonProgress(t * (1 - 1e-9)).arrived, false);
  assert.equal(L.earthMoonProgress(t).arrived, true);
  const later = L.earthMoonProgress(2);
  assert.equal(later.remainingKm, 0); assert.ok(later.fraction > 1); assert.equal(later.travelledKm, 2 * 299792.458);
  assert.deepEqual({ ...L.earthMoonProgress(0) }, { model: 'surface', seconds: 0, travelledKm: 0, totalKm: L.earthMoon.surfaceKm, remainingKm: L.earthMoon.surfaceKm, fraction: 0, arrived: false, totalSeconds: t });
});

test('Sun to planet: eight planets, IDs shared with SizeData, distances from JPL Table 1', () => {
  assert.deepEqual([...L.PLANETS], ['mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune']);
  for (const id of L.PLANETS) assert.ok(SizeData.has(id), id);
  // The five orbits SizeData also holds come from the same table and must stay identical.
  for (const [id, au] of Object.entries(SizeData.orbitsAu)) assert.equal(L.sunDistanceAu[id], au, id);
  let previous = 0;
  for (const id of L.PLANETS) {
    const r = L.sunToPlanet(id);
    assert.equal(r.id, id); assert.equal(r.distanceAu, L.sunDistanceAu[id]);
    near(r.distanceKm, r.distanceAu * L.AU_KM, 1e-15); near(r.lightSeconds, r.distanceKm / L.C_KM_PER_S, 1e-15);
    near(L.kmToAu(r.distanceKm), r.distanceAu, 1e-15);
    assert.ok(r.lightSeconds > previous, `${id} after the previous planet`); previous = r.lightSeconds;
  }
});

test('Sun to planet: expected reference light-travel times', () => {
  // Independently computed from the JPL Table 1 semi-major axes, 1 au and c (to 0.01 s).
  const expected = { mercury: 193.1644, venus: 360.9480, earth: 499.0061, mars: 760.3387, jupiter: 2596.2655, saturn: 4758.8469, uranus: 9575.4850, neptune: 15005.0353 };
  for (const [id, s] of Object.entries(expected)) near(L.sunToPlanet(id).lightSeconds, s, 0, 0.01);
  const text = id => plain(L.formatDuration(L.sunToPlanet(id).lightSeconds));
  assert.equal(text('earth'), '8 min 19 s');
  assert.equal(text('mars'), '12 min 40 s');
  assert.equal(text('jupiter'), '43 min 16 s');
  assert.equal(text('neptune'), '4 h 10 min 5 s');
});

test('input validation: negative, NaN, Infinity, missing, wrong type, unknown IDs and models', () => {
  const numeric = [L.lightDistanceKm, L.lightTravelSeconds, L.kmToAu, L.auToKm, L.inEarthMoonDistances, s => L.earthMoonProgress(s), L.formatKm, L.formatDuration];
  for (const f of numeric) {
    assert.throws(() => f(-1), { name: 'RangeError' });
    assert.throws(() => f(-Number.MIN_VALUE), { name: 'RangeError' });
    assert.throws(() => f(Infinity), { name: 'RangeError' });
    assert.throws(() => f(-Infinity), { name: 'RangeError' });
    assert.throws(() => f(NaN), { name: 'TypeError' });
    assert.throws(() => f(), { name: 'TypeError' });
    assert.throws(() => f(null), { name: 'TypeError' });
    assert.throws(() => f('1'), { name: 'TypeError' });
  }
  assert.equal(L.lightDistanceKm(-0), 0);
  assert.equal(plain(L.formatKm(-0)), '0 km');
  assert.equal(plain(L.formatDuration(-0)), '0 s');
  for (const id of ['pluto', 'moon', 'sun', 'Earth', '', null, undefined, 'hasOwnProperty', '__proto__', 'toString']) {
    assert.equal(L.isPlanet(id), false); assert.throws(() => L.sunToPlanet(id), { name: 'RangeError' });
  }
  for (const m of ['centre', 'Surface', '', null, 'centerKm']) {
    assert.throws(() => L.earthMoonDistanceKm(m), { name: 'RangeError' }); assert.throws(() => L.earthMoonProgress(1, m), { name: 'RangeError' });
  }
});

test('precision: core values unrounded; formatting is text only and does not alter results', () => {
  const before = L.sunToPlanet('earth').lightSeconds;
  assert.equal(plain(L.formatKm(L.lightDistanceKm(1))), '299 792 km');
  assert.equal(plain(L.formatKm(L.lightDistanceKm(1), 3)), '299 792,458 km');
  assert.equal(plain(L.formatKm(L.earthMoonProgress(1).remainingKm)), '76 499 km');
  assert.equal(plain(L.formatDuration(L.earthMoonTravelSeconds(), 2)), '1,26 s');
  assert.equal(plain(L.formatDuration(L.earthMoonTravelSeconds(), 3)), '1,255 s');
  assert.equal(plain(L.formatDuration(15)), '15 s');
  assert.equal(plain(L.formatDuration(59.6)), '1 min 0 s'); // rounded once, never "60 s"
  assert.equal(plain(L.formatDuration(3600)), '1 h 0 min 0 s');
  assert.equal(plain(L.formatDuration(0)), '0 s');
  assert.equal(L.sunToPlanet('earth').lightSeconds, before);
  assert.notEqual(L.lightTravelSeconds(L.earthMoon.surfaceKm), 1.255);
  assert.ok(!Number.isInteger(L.sunToPlanet('earth').lightSeconds));
  assert.match(L.formatKm(1000), / km$/); // non-breaking space before the unit
});

// Phase 6H.9.1.D: LightData.formatClock, the fixed-length clock of the live Sun-to-planets readout. Display only; formatDuration (above) is unchanged.
test('formatClock: minutes and seconds always have two digits, in the 60× form (no hours)', () => {
  const c = s => L.formatClock(s);
  assert.equal(c(0), '00\u00a0min 00\u00a0s');                // initial zero
  assert.equal(c(5), '00\u00a0min 05\u00a0s');                // single-digit seconds
  assert.equal(c(9), '00\u00a0min 09\u00a0s');
  assert.equal(c(10), '00\u00a0min 10\u00a0s');               // 09 → 10 seconds
  assert.equal(c(59), '00\u00a0min 59\u00a0s');
  assert.equal(c(60), '01\u00a0min 00\u00a0s');               // 59 seconds → 1 minute
  assert.equal(c(9 * 60 + 9), '09\u00a0min 09\u00a0s');       // single-digit minutes
  assert.equal(c(9 * 60 + 59), '09\u00a0min 59\u00a0s');
  assert.equal(c(10 * 60), '10\u00a0min 00\u00a0s');          // 09 → 10 minutes
  assert.equal(c(L.sunToPlanet('mars').lightSeconds), '12\u00a0min 40\u00a0s'); // the Mars stop
  assert.equal(c(59 * 60 + 59), '59\u00a0min 59\u00a0s');
  assert.equal(c(3600), '60\u00a0min 00\u00a0s');             // the no-hours form never drops hours silently: minutes keep counting
});

test('formatClock: the 600× form always starts with the hours (no leading zero) and keeps two-digit minutes and seconds', () => {
  const c = s => L.formatClock(s, true);
  assert.equal(c(0), '0\u00a0h 00\u00a0min 00\u00a0s');
  assert.equal(c(L.sunToPlanet('mars').lightSeconds), '0\u00a0h 12\u00a0min 40\u00a0s'); // the start of the second leg
  assert.equal(c(59 * 60 + 59), '0\u00a0h 59\u00a0min 59\u00a0s');
  assert.equal(c(3600), '1\u00a0h 00\u00a0min 00\u00a0s');   // 59 min 59 s → 1 hour
  assert.equal(c(3600 + 9 * 60 + 59), '1\u00a0h 09\u00a0min 59\u00a0s');
  assert.equal(c(3600 + 10 * 60), '1\u00a0h 10\u00a0min 00\u00a0s'); // 09 → 10 minutes
  assert.equal(c(2 * 3600 + 7 * 60 + 4), '2\u00a0h 07\u00a0min 04\u00a0s');
  assert.equal(c(2 * 3600 + 7 * 60 + 59), '2\u00a0h 07\u00a0min 59\u00a0s');
  assert.equal(c(2 * 3600 + 8 * 60), '2\u00a0h 08\u00a0min 00\u00a0s');
  assert.equal(c(L.sunToPlanet('neptune').lightSeconds), '4\u00a0h 10\u00a0min 05\u00a0s'); // the Neptune arrival
  assert.equal(c(10 * 3600), '10\u00a0h 00\u00a0min 00\u00a0s');
});

test('formatClock: whole seconds, rounded once, like formatDuration (59,6 s never reads as "60 s")', () => {
  assert.equal(L.formatClock(0.4), '00\u00a0min 00\u00a0s');
  assert.equal(L.formatClock(0.5), '00\u00a0min 01\u00a0s');
  assert.equal(L.formatClock(4.49), '00\u00a0min 04\u00a0s');
  assert.equal(L.formatClock(59.6), '01\u00a0min 00\u00a0s');
  assert.equal(L.formatClock(59.6, true), '0\u00a0h 01\u00a0min 00\u00a0s');
  assert.equal(L.formatClock(3599.6, true), '1\u00a0h 00\u00a0min 00\u00a0s');
  assert.equal(L.formatClock(L.sunToPlanet('mars').lightSeconds), '12\u00a0min 40\u00a0s'); // 760,3387 s
  // The same seconds as formatDuration for every planet: only the layout of the digits differs.
  for (const id of L.PLANETS) {
    const t = L.sunToPlanet(id).lightSeconds, total = Math.round(t);
    assert.equal(L.formatClock(t, true).replace(/\u00a0/g, ' ').split(' ').filter((x, i) => i % 2 === 0).map(Number).reduce((sum, v, i) => sum + v * [3600, 60, 1][i], 0), total, id);
  }
});

test('formatClock: no-break space between each number and its unit, ordinary space between the groups; the length is constant within a form', () => {
  const pattern = /^\d{2}\u00a0min \d{2}\u00a0s$/, withHours = /^\d\u00a0h \d{2}\u00a0min \d{2}\u00a0s$/;
  const lengths = new Set(), longer = new Set();
  for (let s = 0; s <= 760; s++) { const t = L.formatClock(s); assert.match(t, pattern, String(s)); lengths.add(t.length); }
  for (let s = 760; s <= 15005; s++) { const t = L.formatClock(s, true); assert.match(t, withHours, String(s)); longer.add(t.length); }
  assert.deepEqual([...lengths], [11], 'the 60× form always has 11 characters');
  assert.deepEqual([...longer], [15], 'the 600× form always has 15 characters');
  assert.equal(L.formatClock(65).split(' ').length, 2, 'two number-unit pairs, one ordinary space between them');
  assert.equal(L.formatClock(65, true).split(' ').length, 3, 'three pairs with hours, two ordinary spaces');
});

test('formatClock: input checks as everywhere in LightData; formatDuration is unchanged', () => {
  assert.throws(() => L.formatClock(-1), { name: 'RangeError' }); // LightData runs in its own realm in these tests: compare by name
  assert.throws(() => L.formatClock(NaN), { name: 'TypeError' });
  assert.throws(() => L.formatClock(Infinity), { name: 'RangeError' });
  assert.throws(() => L.formatClock('5'), { name: 'TypeError' });
  assert.equal(L.formatClock(-0), '00\u00a0min 00\u00a0s');
  assert.equal(plain(L.formatDuration(3600)), '1 h 0 min 0 s');   // the natural text of the explanations, labels and announcements
  assert.equal(plain(L.formatDuration(L.sunToPlanet('neptune').lightSeconds)), '4 h 10 min 5 s');
  assert.equal(plain(L.formatDuration(L.sunToPlanet('mars').lightSeconds)), '12 min 40 s');
});
