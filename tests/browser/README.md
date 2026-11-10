# Browser regression tests

Playwright scripts that load the real app (`index.html`) in headless Chromium and check the Light Laboratory experiments and the
Phase 6G Learn/Explore features. Each script serves the repository on its own local port, injects a **test-only fixture lesson**
into `learn-content.sk.js` inside the test browser only (the app's own content is never changed, and the "Pohyb vo vesmíre"
topic stays inactive), prints `PASS`/`FAIL` lines and ends with `<n> passed, <m> failed`.

The unit tests for the physics modules stay in `tests/*.test.js` (Node's built-in test runner).

## Prerequisites

- Node.js 18 or newer (developed with Node 22).
- Playwright for Node with its Chromium browser, resolvable as `require('playwright')` from this folder
  (developed with Playwright 1.63):
  `npm install --no-save playwright && npx playwright install chromium`
  (or a global installation on `NODE_PATH`). No `package.json` is added to the repository.
- The three.js r128 files the app loads from its CDNs, stored locally so the tests run offline and reproducibly:
  `node tests/browser/fetch-vendor.js`
  This downloads `three@0.128.0` from the npm registry and writes `three.min.js` and `OrbitControls.js` to
  `tests/browser/vendor/` (git-ignored). To use files from another folder, set `THREE_VENDOR_DIR`.
- Free local ports 8909–8951 (each script uses its own fixed port; set `PORT` to override for a single script).

Rendering uses SwiftShader (software WebGL, started by the scripts), so no GPU is needed. Screenshots and logs go to
`tests/browser/output/<script>/` (git-ignored).

## Running

From the repository root:

```sh
node --test tests/*.test.js            # unit tests (LightData, LightSim)
node tests/browser/fetch-vendor.js     # once: three.js r128 files for the browser tests
node tests/browser/run.js              # all browser suites, with a total
node tests/browser/run.js planets      # Sun-to-planets regression suite only
node tests/browser/run.js light        # Earth–Moon, 15-second experiment and Milky Way background
node tests/browser/run.js learn6g      # Phase 6G Learn/Explore regressions
node tests/browser/light662.js         # a single script
```

`run.js` exits with code 1 if any check fails or a script does not finish. A full run takes about 20–30 minutes on software
rendering; the planets suite about 10 minutes.

## Suites

| Group | Script | Covers |
|---|---|---|
| planets | `light652.js` | Sun-to-planets stage: positions, 60×/600× playback, exact Mars and Neptune stops, arrivals, inner-planet group, Mars scale-change header, pause/hidden tab/skip, lifecycle, layout at five sizes |
| planets | `light653.js` | Responsive checks (Phase 6H.5.2.C): panel bounds, 44 px targets, keyboard/wheel/touch reachability, stage/panel overlap (incl. the expanded technical-preview panel at 390×667), preview isolation |
| planets | `light654.js` | Functional continuity: exact 60× → 600× continuation, monotonic timeline, LightData arrival times, repeat, cleanup |
| planets | `light661.js` | Learning flow in Learn: both predictions and every choice, feedback, explanation pausing the run, hidden tab, reduced motion, keyboard, screen-reader announcements, no Earth–Moon fallback, cleanup, `pohyb` inactive |
| planets | `light662.js` | Responsive UX and accessibility at 1366×768, 390×844, 390×667, 844×390: every state, no panel overlap (scale label included), target and real time visible, focus, touch targets, explanation reading view |
| light | `light632.js` | Earth–Moon (1 s) experiment |
| light | `light641.js` | 15-second experiment scene |
| light | `light642.js` | 15-second prediction |
| light | `light644.js` | Milky Way background (approved M15 variant) |
| learn6g | `insp671.js`, `e2e661.js`, `overlay661a.js`, `orbits6541.js` | Phase 6G planet inspection, nine-step lesson, comparison overlay, orbit view |

`light662.js` reuses the setup part of `light661.js`, and `light654.js` that of `light652.js` (read from this folder); keep them
together. `fixtures/light62-fixture.js` is the test fixture `light632.js` reads.

## Dependencies on temporary paths or unavailable assets

None. The scripts were moved from a temporary development folder; only their paths were changed (repository root, vendor files,
output folder, fixture file) — assertions and behaviour are unchanged. The app's own textures are served from the repository.
The three.js files are not committed; they are fetched as described above.
