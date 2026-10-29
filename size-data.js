/* Real sizes for the size-comparison lesson (Phase 6G). Independent of the simulation's illustrative radii.
   Diameters in kilometres; IDs match the Learn body IDs.
   - Planets: 2 × NASA mean (volumetric) radius, NSSDC Planetary Fact Sheet
     (https://nssdc.gsfc.nasa.gov/planetary/factsheet/) and NASA "Solar System Sizes"
     (https://science.nasa.gov/resource/solar-system-sizes). Mean, not equatorial: Saturn differs by about 3.5 %.
   - Sun: 2 × the IAU 2015 Resolution B3 nominal solar radius (exactly 695 700 km).
   - Betelgeuse: reference estimate 764 (+116/−62) solar radii, Joyce et al. 2020, ApJ 902, 63 (arXiv:2006.09837).
     An uncertain model-based estimate, not a measurement; other published values span roughly 640–1 070. */
window.SizeData = (() => {
  const SOLAR_RADIUS_KM = 695700;
  const body = (name, diameterKm, extra = {}) => Object.freeze({ name, diameterKm, ...extra });
  const bodies = Object.freeze({
    mercury: body('Merkúr', 4879.4),
    venus: body('Venuša', 12103.6),
    earth: body('Zem', 12742.0),
    mars: body('Mars', 6779.0),
    jupiter: body('Jupiter', 139822),
    saturn: body('Saturn', 116464, { note: 'Priemer planéty bez prstencov.' }),
    uranus: body('Urán', 50724),
    neptune: body('Neptún', 49244),
    sun: body('Slnko', 2 * SOLAR_RADIUS_KM),
    betelgeuse: body('Betelgeuze', 2 * 764 * SOLAR_RADIUS_KM, {
      estimate: true, solarRadii: 764, solarRadiiRange: Object.freeze([702, 880]), source: 'Joyce et al. 2020, ApJ 902, 63'
    })
  });
  const has = id => typeof id === 'string' && Object.prototype.hasOwnProperty.call(bodies, id);
  // How many times wider body a is than body b.
  function ratio(a, b) {
    if (!has(a) || !has(b)) throw Error('Unknown body');
    return bodies[a].diameterKm / bodies[b].diameterKm;
  }
  return Object.freeze({ SOLAR_RADIUS_KM, bodies, has, ratio });
})();
