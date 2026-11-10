// Fetches the exact three.js files the application loads from its CDNs (three r128 = npm three@0.128.0):
//   build/three.min.js and examples/js/controls/OrbitControls.js  ->  tests/browser/vendor/
// Uses "npm pack" (npm registry) and "tar"; no package.json or node_modules are created in the repository.
'use strict';
const { execFileSync } = require('child_process'), fs = require('fs'), os = require('os'), path = require('path'), crypto = require('crypto');
const dest = path.join(__dirname, 'vendor'), tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'three-r128-'));
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const tgz = execFileSync(npm, ['pack', 'three@0.128.0', '--silent'], { cwd: tmp, encoding: 'utf8' }).trim().split('\n').pop();
execFileSync('tar', ['-xzf', tgz, 'package/build/three.min.js', 'package/examples/js/controls/OrbitControls.js'], { cwd: tmp });
fs.mkdirSync(dest, { recursive: true });
for (const [from, to] of [['package/build/three.min.js', 'three.min.js'], ['package/examples/js/controls/OrbitControls.js', 'OrbitControls.js']]) {
  fs.copyFileSync(path.join(tmp, from), path.join(dest, to));
  console.log(`${to}  md5 ${crypto.createHash('md5').update(fs.readFileSync(path.join(dest, to))).digest('hex')}`);
}
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`three@0.128.0 files written to ${dest}`);
