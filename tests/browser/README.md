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
- No download is needed for three.js: the app loads r128 from the committed `vendor/three-r128/` folder and the scripts serve and
  test exactly those files (Phase 6H.9.1.B). Optionally, `node tests/browser/verify-vendor.js` compares them with the npm package
  `three@0.128.0` (needs the npm registry; writes nothing into the repository).
- Free local ports 8909–8970 (each script uses its own fixed port; set `PORT` to override for a single script).

Rendering uses SwiftShader (software WebGL, started by the scripts), so no GPU is needed. Screenshots and logs go to
`tests/browser/output/<script>/` (git-ignored).

## Running

From the repository root:

```sh
node --test tests/*.test.js            # unit tests (LightData, LightSim, vendor files and script paths)
node tests/browser/verify-vendor.js    # optional: compare vendor/three-r128 with npm three@0.128.0
node tests/browser/run.js deps         # committed three.js files with every other host blocked; start-up failure handling
node tests/browser/run.js              # all browser suites, with a total
node tests/browser/run.js planets      # Sun-to-planets regression suite only
node tests/browser/run.js light        # Earth–Moon, 15-second experiment and Milky Way background
node tests/browser/run.js lesson       # the whole Light Laboratory lesson (test-only fixture)
node tests/browser/run.js summary      # every lesson's summary: the three actions in the panel footer
node tests/browser/run.js catalogue    # the Learn topic catalogue: six cards in view on desktop
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
| lesson | `light671.js` | The whole eight-step Light Laboratory lesson from `fixtures/light-lesson.js` (test-only; the real "pohyb" topic stays inactive) at 1366×768, 390×844, 390×667, 844×390: forwards and backwards, journey switching and cleanup, predictions and session state, questions, leaving and returning, Explore and Quiz, focus, announcements, hidden tab, reduced motion, journey validation |
| summary | `summary68.js` | The real lessons (no fixture), Phase 6H.8.B: all six summaries at 1366×768, 1366×657, 1280×720, 390×844, 390×667, 844×390 – the three actions in the panel footer, visible without scrolling (844×390: by scrolling the panel), keyboard order, each action's destination; the light lesson's five ideas, 15-second transition and final question wording |
| catalogue | `catalogue68.js` | The Learn topic catalogue with the real lessons, Phase 6H.8.C: at 1920×1080, 1920×945, 1440×900, 1366×768, 1366×657, 1280×720 all six cards and buttons in view without scrolling (at least 12 px spare), texts and font sizes unchanged, simulation controls hidden and out of the Tab order, restored in lessons, Explore and after the Quiz; scroll fallback at 1366×640 and 1280×609; tablet and phone layouts identical with and without the Phase 6H.8.C rules |
| deps | `deps69.js` | Phase 6H.9.1.B: the real app with every request to another host blocked – three.js r128 and OrbitControls load from `vendor/three-r128/` in order and byte-identical to upstream, revision 128, every THREE name the app uses is defined; Explore, the catalogue, all six lessons and a full Quiz work; no external request is attempted (1366×768, 390×844, 844×390) |
| deps | `failure69.js` | Phase 6H.9.1.C: start-up failure handling – three.js or OrbitControls missing (404, blocked, throwing, empty), WebGL unavailable, `init()` failing (controlled errors): one Slovak `role="alert"` message, one "Načítať znova" button (keyboard, reloads the page), no spinner, code gate closed, page inert; the normal start unchanged; phones and landscape |
| light | `light632.js` | Earth–Moon (1 s) experiment |
| light | `light641.js` | 15-second experiment scene |
| light | `light642.js` | 15-second prediction |
| light | `light644.js` | Milky Way background (approved M15 variant) |
| learn6g | `insp671.js`, `e2e661.js`, `overlay661a.js`, `orbits6541.js` | Phase 6G planet inspection, nine-step lesson, comparison overlay, orbit view |

Fixture conventions (Phase 6H.6.2): test lessons use the test-only lesson and topic id `test-svetlo` (topic card „Testovacia lekcia"),
never the id of a real topic, so they can coexist with the future real "pohyb" lesson. The whole-lesson fixture
`fixtures/light-lesson.js` stands for that future lesson: it replaces a "pohyb" lesson if one exists and adds it otherwise. Every
light-travel step names its `journey` (`earth-moon`, `fifteen` or `planets`); Learn leaves out a lesson with a missing or unsupported
journey and reports it in the console.

`light662.js` reuses the setup part of `light661.js`, and `light654.js` that of `light652.js` (read from this folder); keep them
together. `fixtures/light62-fixture.js` is the test fixture `light632.js` reads; `fixtures/light-lesson.js` is the complete Light Laboratory lesson
that `light671.js` injects (with the future topic card "Svetlo a vesmírne vzdialenosti"), only inside the test browser.

## Dependencies on temporary paths or unavailable assets

None. The scripts were moved from a temporary development folder; only their paths were changed (repository root, vendor files,
output folder, fixture file) — assertions and behaviour are unchanged. The app's own textures are served from the repository.
The three.js files are committed in `vendor/three-r128/` and served from the repository like the textures.
