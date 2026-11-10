// Runs browser regression harnesses one after another and sums their results.
// Usage: node tests/browser/run.js [planets | light | all | <harness name> ...]   (default: all)
// Each harness prints PASS/FAIL lines and ends with "<n> passed, <m> failed". Exit code 1 if anything failed or a harness crashed.
'use strict';
const { spawnSync } = require('child_process'), path = require('path');
const GROUPS = {
  planets: ['light652', 'light653', 'light654', 'light661', 'light662'],                 // Sun-to-planets: stage, responsive, functional, learning flow, responsive UX
  light: ['light632', 'light641', 'light642', 'light644'],                                // Earth–Moon, 15 s scene and prediction, Milky Way background
  learn6g: ['insp671', 'e2e661', 'overlay661a', 'orbits6541']                             // Phase 6G Learn/Explore regressions
};
GROUPS.all = [...GROUPS.light, ...GROUPS.planets, ...GROUPS.learn6g];
const args = process.argv.slice(2), names = (args.length ? args : ['all']).flatMap(a => GROUPS[a] ?? [a]);
let total = { passed: 0, failed: 0 }, broken = [];
for (const name of names) {
  const started = Date.now(), r = spawnSync(process.execPath, [path.join(__dirname, `${name}.js`)], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const outText = `${r.stdout ?? ''}${r.stderr ?? ''}`, m = outText.match(/(\d+) passed, (\d+) failed\s*$/m);
  outText.split('\n').filter(l => l.startsWith('FAIL')).forEach(l => console.log(`  ${name}: ${l.slice(0, 400)}`));
  if (!m || r.status !== 0) { broken.push(name); console.log(`${name}: did not finish (exit ${r.status})\n${outText.slice(-1500)}`); continue; }
  total.passed += Number(m[1]); total.failed += Number(m[2]);
  console.log(`${name.padEnd(12)} ${m[1].padStart(4)} passed, ${m[2]} failed  (${Math.round((Date.now() - started) / 1000)} s)`);
}
console.log(`TOTAL ${total.passed} passed, ${total.failed} failed${broken.length ? `; did not finish: ${broken.join(', ')}` : ''}`);
process.exit(total.failed || broken.length ? 1 : 0);
