/* Real sizes for the size-comparison lesson (Phase 6G). Independent of the simulation's illustrative radii.
   Diameters in kilometres; IDs match the Learn body IDs.
   - Planets: 2 × NASA mean (volumetric) radius, NSSDC Planetary Fact Sheet
     (https://nssdc.gsfc.nasa.gov/planetary/factsheet/) and NASA "Solar System Sizes"
     (https://science.nasa.gov/resource/solar-system-sizes). Mean, not equatorial: Saturn differs by about 3.5 %.
   - Sun: 2 × the IAU 2015 Resolution B3 nominal solar radius (exactly 695 700 km).
   - Betelgeuse: reference estimate 764 (+116/−62) solar radii, Joyce et al. 2020, ApJ 902, 63 (arXiv:2006.09837).
     An uncertain model-based estimate, not a measurement; other published values span roughly 640–1 070.
   - Orbits (Phase 6G.5.4): semi-major axes in au from JPL "Approximate Positions of the Planets", Table 1 (J2000 mean
     elements, valid 1800–2050; https://ssd.jpl.nasa.gov/planets/approx_pos.html); Earth = Earth–Moon barycentre.
     1 au = 149 597 870.7 km (IAU 2012 Resolution B2). Circles at these distances simplify the slightly elliptical orbits.
     Betelgeuse's radius in au follows from its solar radii (reference and range above) and the nominal solar radius. */
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
  const AU_KM = 149597870.7;
  const orbitsAu = Object.freeze({ mercury: 0.38709927, venus: 0.72333566, earth: 1.00000261, mars: 1.52371034, jupiter: 5.20288700 });
  const auOf = solarRadii => solarRadii * SOLAR_RADIUS_KM / AU_KM;
  const [lowRadii, highRadii] = bodies.betelgeuse.solarRadiiRange;
  const betelgeuseRadiusAu = Object.freeze({ lower: auOf(lowRadii), reference: auOf(bodies.betelgeuse.solarRadii), upper: auOf(highRadii) });
  const has = id => typeof id === 'string' && Object.prototype.hasOwnProperty.call(bodies, id);
  // How many times wider body a is than body b.
  function ratio(a, b) {
    if (!has(a) || !has(b)) throw Error('Unknown body');
    return bodies[a].diameterKm / bodies[b].diameterKm;
  }
  return Object.freeze({ SOLAR_RADIUS_KM, AU_KM, bodies, orbitsAu, betelgeuseRadiusAu, has, ratio });
})();
