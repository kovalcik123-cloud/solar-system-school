/* Light-travel physics for the Light Laboratory (Phase 6H.1). Pure data and calculations: no DOM, Three.js, timers or lesson
   state. The future experiment supplies the measured active time; this module only turns times into distances and back.
   Independent of the main simulation, whose sizes, distances and speeds are illustrative.

   Exact by definition
   - Speed of light in vacuum c = 299 792 458 m/s (SI, 17th CGPM 1983; BIPM SI Brochure, 9th ed.).
   - 1 au = 149 597 870.7 km (IAU 2012 Resolution B2). Same value as SizeData.AU_KM; kept here so this module needs no
     script-loading order (tests/light-data.test.js checks that both stay equal).

   Reference values (measured or averaged; not instantaneous)
   - Earth–Moon: mean centre-to-centre distance 384 400 km (the Moon's mean orbital distance / semi-major axis; NASA,
     https://science.nasa.gov/moon/ and NSSDC Moon Fact Sheet, https://nssdc.gsfc.nasa.gov/planetary/factsheet/moonfact.html).
     The real distance varies, roughly 363 300 km (perigee) to 405 500 km (apogee).
   - Mean (volumetric) radii, NSSDC fact sheets: Earth 6 371.0 km (matches SizeData's 12 742 km diameter), Moon 1 737.4 km.
   - Sun–planet: semi-major axes in au from JPL "Approximate Positions of the Planets", Table 1 (J2000 mean elements, valid
     1800–2050; https://ssd.jpl.nasa.gov/planets/approx_pos.html); Earth = Earth–Moon barycentre. The same table SizeData
     cites; its five values (Mercury–Jupiter) are identical here. A semi-major axis is a reference (mean) distance: the real
     Sun–planet distance changes along each elliptical orbit, so light-travel times are reference times.

   Model: straight-line propagation in vacuum. No ephemerides, relativity, lensing or refraction.

   Units in every public function: seconds (s), kilometres (km), astronomical units (au). Core results are never rounded;
   rounding happens only in the format* helpers, which return text. Invalid input (non-number, NaN, ±Infinity, negative,
   missing, unknown body) throws; zero is valid. */
window.LightData = (() => {
  const C_M_PER_S = 299792458;
  const C_KM_PER_S = C_M_PER_S / 1000;
  const AU_KM = 149597870.7;

  // Earth–Moon reference geometry. "center": centre to centre. "surface": from Earth's surface towards the Moon's near-side
  // surface along the centre line (the approved experiment's start and finish), using the reference centre distance.
  const EARTH_RADIUS_KM = 6371.0, MOON_RADIUS_KM = 1737.4, EARTH_MOON_MEAN_KM = 384400;
  const earthMoon = Object.freeze({
    centerKm: EARTH_MOON_MEAN_KM,
    surfaceKm: EARTH_MOON_MEAN_KM - EARTH_RADIUS_KM - MOON_RADIUS_KM,
    earthRadiusKm: EARTH_RADIUS_KM,
    moonRadiusKm: MOON_RADIUS_KM
  });
  const EARTH_MOON_MODELS = Object.freeze(['center', 'surface']);

  // The eight planets, from the Sun outwards; IDs match SizeData and the Learn body IDs.
  const PLANETS = Object.freeze(['mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune']);
  const sunDistanceAu = Object.freeze({
    mercury: 0.38709927, venus: 0.72333566, earth: 1.00000261, mars: 1.52371034,
    jupiter: 5.20288700, saturn: 9.53667594, uranus: 19.18916464, neptune: 30.06992276
  });

  // Input checks: finite, non-negative numbers only.
  function amount(value, name) {
    if (typeof value !== 'number' || Number.isNaN(value)) throw new TypeError(`${name} must be a number`);
    if (!Number.isFinite(value)) throw new RangeError(`${name} must be finite`);
    if (value < 0) throw new RangeError(`${name} must not be negative`);
    return value === 0 ? 0 : value; // −0 counts as 0 (so it never shows as "-0 km")
  }
  const isPlanet = id => typeof id === 'string' && Object.prototype.hasOwnProperty.call(sunDistanceAu, id);
  function planet(id) { if (!isPlanet(id)) throw new RangeError(`Unknown planet: ${String(id)}`); return id; }
  function model(name) { if (!EARTH_MOON_MODELS.includes(name)) throw new RangeError(`Unknown Earth–Moon model: ${String(name)}`); return name; }

  // Core conversions.
  const lightDistanceKm = seconds => amount(seconds, 'seconds') * C_KM_PER_S;
  const lightTravelSeconds = distanceKm => amount(distanceKm, 'distanceKm') / C_KM_PER_S;
  const kmToAu = km => amount(km, 'km') / AU_KM;
  const auToKm = au => amount(au, 'au') * AU_KM;

  // Earth–Moon.
  const earthMoonDistanceKm = (name = 'surface') => earthMoon[`${model(name)}Km`];
  const earthMoonTravelSeconds = (name = 'surface') => earthMoonDistanceKm(name) / C_KM_PER_S;
  // Where light is after `seconds` on its way to the Moon. travelledKm keeps growing after arrival (light does not stop);
  // remainingKm stops at 0; fraction is travelledKm / totalKm and may exceed 1.
  function earthMoonProgress(seconds, name = 'surface') {
    const totalKm = earthMoonDistanceKm(name), travelledKm = lightDistanceKm(seconds);
    return Object.freeze({ model: name, seconds, travelledKm, totalKm, remainingKm: Math.max(0, totalKm - travelledKm),
      fraction: travelledKm / totalKm, arrived: travelledKm >= totalKm, totalSeconds: totalKm / C_KM_PER_S });
  }
  // A distance expressed in mean Earth–Moon centre-to-centre distances (e.g. 15 s of light ≈ 11.7).
  const inEarthMoonDistances = distanceKm => amount(distanceKm, 'distanceKm') / EARTH_MOON_MEAN_KM;

  // Sun to planet (reference distance = semi-major axis).
  function sunToPlanet(id) {
    const distanceAu = sunDistanceAu[planet(id)], distanceKm = distanceAu * AU_KM;
    return Object.freeze({ id, distanceAu, distanceKm, lightSeconds: distanceKm / C_KM_PER_S });
  }

  // Slovak display text (rounding happens only here). Intl uses a non-breaking space as the thousands separator.
  const number = (value, digits) => new Intl.NumberFormat('sk-SK', { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
  function formatKm(km, digits = 0) { return `${number(amount(km, 'km'), digits)} km`; }
  // Under a minute: seconds with `digits` decimals ("1,26 s"). From a minute up: whole seconds as h / min / s, rounded once
  // so 59,6 s never reads as "60 s" ("8 min 19 s", "4 h 10 min 5 s").
  function formatDuration(seconds, digits = 0) {
    seconds = amount(seconds, 'seconds');
    if (Number(seconds.toFixed(digits)) < 60) return `${number(seconds, digits)} s`;
    const total = Math.round(seconds), h = Math.floor(total / 3600), m = Math.floor(total % 3600 / 60), s = total % 60;
    return [h && `${h} h`, (h || m) && `${m} min`, `${s} s`].filter(Boolean).join(' ');
  }
  // A fixed-length clock for a live readout (Phase 6H.9.1.D; display only, the physical time is never changed). Minutes and seconds always
  // have two digits, so the text keeps its length while it counts: "00 min 05 s", "12 min 40 s". With `withHours` the hours come first, without
  // a leading zero: "0 h 12 min 40 s", "4 h 10 min 05 s". The caller picks the form for a whole experiment leg, not per value, so hours are
  // never dropped or added while the readout runs (without hours the minutes simply keep counting past 59). Whole seconds, rounded once
  // like formatDuration; a no-break space joins each number to its unit.
  function formatClock(seconds, withHours = false) {
    const total = Math.round(amount(seconds, 'seconds')), s = total % 60, two = n => String(n).padStart(2, '0');
    if (withHours) return `${Math.floor(total / 3600)} h ${two(Math.floor(total % 3600 / 60))} min ${two(s)} s`;
    return `${two(Math.floor(total / 60))} min ${two(s)} s`;
  }

  return Object.freeze({
    C_M_PER_S, C_KM_PER_S, AU_KM, earthMoon, EARTH_MOON_MODELS, PLANETS, sunDistanceAu,
    lightDistanceKm, lightTravelSeconds, kmToAu, auToKm,
    earthMoonDistanceKm, earthMoonTravelSeconds, earthMoonProgress, inEarthMoonDistances,
    isPlanet, sunToPlanet, formatKm, formatDuration, formatClock
  });
})();
