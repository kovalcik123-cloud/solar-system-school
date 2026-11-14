// Shared paths for the browser regression harnesses (no test logic here).
// - ROOT: the repository (served as a static site by each harness). The app loads three.js r128 and its OrbitControls from the
//   committed vendor/three-r128/ folder, so the harnesses serve and test exactly the files that ship (Phase 6H.9.1.B).
// - out(name): a git-ignored folder for screenshots and logs (tests/browser/output/<name>).
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
function out(name) { const dir = path.join(__dirname, 'output', name); fs.mkdirSync(dir, { recursive: true }); return dir; }
module.exports = { ROOT, out };
