// Shared paths for the browser regression harnesses (no test logic here).
// - ROOT: the repository (served as a static site by each harness).
// - vendor(file): three.js r128 and its OrbitControls, served locally instead of the CDN so the tests run offline and reproducibly.
//   Default folder tests/browser/vendor (created by fetch-vendor.js); override with THREE_VENDOR_DIR.
// - out(name): a git-ignored folder for screenshots and logs (tests/browser/output/<name>).
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const VENDOR = process.env.THREE_VENDOR_DIR ? path.resolve(process.env.THREE_VENDOR_DIR) : path.join(__dirname, 'vendor');
function vendor(file) {
  const full = path.join(VENDOR, file);
  if (!fs.existsSync(full)) throw new Error(`Missing ${full}. Run "node tests/browser/fetch-vendor.js" first (see tests/browser/README.md).`);
  return full;
}
function out(name) { const dir = path.join(__dirname, 'output', name); fs.mkdirSync(dir, { recursive: true }); return dir; }
module.exports = { ROOT, vendor, out };
