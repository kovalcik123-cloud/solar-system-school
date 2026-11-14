// Phase 6H.9.1.B: the application's own copy of three.js r128. Pure file checks (no browser, no network):
// the committed files are the verified upstream bytes, index.html loads them by relative path in the right order, and no runtime
// resource of the application points at another server. Source citations in lesson data and links in documentation are not
// runtime resources and are not restricted here.
'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const ROOT = path.resolve(__dirname, '..'), read = file => fs.readFileSync(path.join(ROOT, file));
const sha256 = file => crypto.createHash('sha256').update(read(file)).digest('hex');
const VENDOR = 'vendor/three-r128';
const SHA256 = {
  'three.min.js': '9274bbcec8d96168626c732b5d31c775aa8cfb7eaa0599bec0c175908a2c1ce2',
  'OrbitControls.js': '02bb4ade710f3e607329e37a21f098bc3ac70eb6e33daf8a65e79f4db785e7b2',
  'LICENSE': '7dddf7c5b8fd10ee654db8857d75d104b5557889aa5a91fc4ca545ea7c07062f'
};
const html = read('index.html').toString('utf8');
// Markup without comments, inline scripts' bodies and inline styles, so only real tags are inspected.
const scriptTags = [...html.replace(/<!--[\s\S]*?-->/g, '').matchAll(/<script\b([^>]*)>/g)].map(m => (m[1].match(/\bsrc\s*=\s*["']([^"']+)["']/) || [])[1] ?? null);
const external = url => /^(?:[a-z][a-z0-9+.-]*:)?\/\//i.test(url.trim());

test('vendor: the three committed files are the verified three.js r128 bytes (SHA-256)', () => {
  for (const [name, expected] of Object.entries(SHA256)) assert.equal(sha256(`${VENDOR}/${name}`), expected, name);
  assert.deepEqual(fs.readdirSync(path.join(ROOT, VENDOR)).sort(), Object.keys(SHA256).sort(), 'no other file in the folder');
});

test('vendor: the library is revision 128 and the controls attach to THREE', () => {
  const three = read(`${VENDOR}/three.min.js`).toString('utf8'), controls = read(`${VENDOR}/OrbitControls.js`).toString('utf8');
  assert.match(three, /^\/\*\*\s*\n \* @license\s*\n \* Copyright 2010-2021 Three\.js Authors\s*\n \* SPDX-License-Identifier: MIT/);
  assert.match(three, /const e="128"/, 'REVISION 128');
  assert.match(controls, /THREE\.OrbitControls = OrbitControls;/);
  assert.match(read(`${VENDOR}/LICENSE`).toString('utf8'), /^The MIT License\s+Copyright © 2010-2021 three\.js authors/);
});

test('index.html: three.js, then OrbitControls, by relative path, as classic scripts before the application scripts', () => {
  const sources = scriptTags.filter(Boolean);
  assert.deepEqual(sources, [`${VENDOR}/three.min.js`, `${VENDOR}/OrbitControls.js`, 'learn-content.sk.js', 'learn.js', 'size-data.js', 'light-data.js', 'light-sim.js']);
  // Phase 6H.9.1.C: two inline scripts at the end: the start-up guard (checks the libraries and WebGL), then the application script.
  assert.equal(scriptTags.filter(src => src === null).length, 2, 'the start-up guard and the inline application script');
  assert.equal(scriptTags.indexOf(null), scriptTags.length - 2, 'both inline scripts come last, after every external script');
  const tags = [...html.matchAll(/<script\b[^>]*\bsrc\s*=\s*["']vendor\/three-r128\/[^"']+["'][^>]*>/g)].map(m => m[0]);
  assert.equal(tags.length, 2);
  for (const tag of tags) assert.doesNotMatch(tag, /\b(?:type|async|defer|integrity|crossorigin)\b/, 'plain classic script');
  for (const src of sources) assert.ok(fs.existsSync(path.join(ROOT, src)), `${src} exists`);
});

test('runtime resources: no script, stylesheet, image, frame or CSS url() points at another server', () => {
  const markup = html.replace(/<!--[\s\S]*?-->/g, '');
  // Element attributes that fetch a resource. (xmlns="http://www.w3.org/2000/svg" is a namespace name, not a request.)
  const attrs = [...markup.matchAll(/<(script|link|img|iframe|audio|video|source|object|embed)\b[^>]*?\b(?:src|href|data)\s*=\s*["']([^"']+)["']/gi)].map(m => ({ tag: m[1], url: m[2] }));
  assert.ok(attrs.length >= 8, 'the scripts and the stylesheet were found');
  assert.deepEqual(attrs.filter(a => external(a.url)), []);
  for (const file of ['index.html', 'learn.css']) {
    const text = read(file).toString('utf8'), urls = [...text.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g)].map(m => m[1]).filter(u => !u.includes('${'));
    assert.deepEqual(urls.filter(external), [], `${file} url()`);
    assert.doesNotMatch(text, /@import/, `${file} @import`);
  }
  // No CDN host name remains in anything the application loads.
  for (const file of ['index.html', 'learn.js', 'learn.css', 'learn-content.sk.js', 'size-data.js', 'light-data.js', 'light-sim.js'])
    assert.doesNotMatch(read(file).toString('utf8'), /cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|unpkg\.com|googleapis\.com|gstatic\.com/i, file);
});

test('runtime code: the application makes no network call of its own and loads only relative texture paths', () => {
  for (const file of ['index.html', 'learn.js', 'size-data.js', 'light-data.js', 'light-sim.js'])
    assert.doesNotMatch(read(file).toString('utf8'), /\bfetch\s*\(|XMLHttpRequest|sendBeacon|new\s+WebSocket|EventSource\s*\(|importScripts|\bimport\s*\(/, file);
  const textures = [...html.matchAll(/(?:texture:\s*|\.load\(\s*)["']([^"']+\.jpg)["']/g)].map(m => m[1]);
  assert.ok(textures.length >= 14, 'texture references were found');
  assert.deepEqual(textures.filter(external), []);
  assert.deepEqual(textures.filter(t => t !== 'Stars.jpg' && !fs.existsSync(path.join(ROOT, t))), [], 'every texture file exists (Stars.jpg is only a fallback name)');
});
