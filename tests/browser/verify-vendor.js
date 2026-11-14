// Compares the committed three.js files (vendor/three-r128/) with the official npm package three@0.128.0 (= three.js r128):
//   build/three.min.js and examples/js/controls/OrbitControls.js, byte for byte (SHA-256).
// Optional and read-only: it needs the npm registry, uses "npm pack" and "tar" in a temporary folder and writes nothing into the
// repository. The tests themselves need no download: the app and every harness load the committed files.
// Exit code 1 if a file differs or is missing.
'use strict';
const { execFileSync } = require('child_process'), fs = require('fs'), os = require('os'), path = require('path'), crypto = require('crypto');
const committed = path.resolve(__dirname, '..', '..', 'vendor', 'three-r128'), tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'three-r128-'));
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm', sha256 = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
let different = 0;
try {
  const tgz = execFileSync(npm, ['pack', 'three@0.128.0', '--silent'], { cwd: tmp, encoding: 'utf8' }).trim().split('\n').pop();
  execFileSync('tar', ['-xzf', tgz, 'package/build/three.min.js', 'package/examples/js/controls/OrbitControls.js'], { cwd: tmp });
  for (const [from, name] of [['package/build/three.min.js', 'three.min.js'], ['package/examples/js/controls/OrbitControls.js', 'OrbitControls.js']]) {
    const upstream = sha256(path.join(tmp, from)), local = fs.existsSync(path.join(committed, name)) ? sha256(path.join(committed, name)) : 'missing';
    if (upstream !== local) different++;
    console.log(`${upstream === local ? 'SAME     ' : 'DIFFERENT'}  ${name}  npm ${upstream}  committed ${local}`);
  }
} finally { fs.rmSync(tmp, { recursive: true, force: true }); }
console.log(different ? `${different} file(s) differ from three@0.128.0` : 'vendor/three-r128 matches three@0.128.0');
process.exit(different ? 1 : 0);
