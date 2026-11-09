/* Light-travel timing engine and physical coordinates (Phase 6H.2). Pure: no DOM, Three.js, events or timers of its own.
   A run measures ACTIVE time from a monotonic clock (performance.now by default; injectable for tests) and asks LightData
   for the distance. Frames only sample it, so the distance never depends on frame rate, frame count, stalls, the camera,
   the scene scale or any visual speed.

   Three kinds of time, kept apart:
   - wallSeconds: real time since start, including pauses (until completion or reset).
   - activeSeconds: playback time, i.e. real time while running only (pauses excluded).
   - simulatedSeconds: physical time in the model, activeSeconds × timeScale; the physics uses this. Light always moves at
     c in the model; timeScale (default 1, "real-time") only makes playback faster, e.g. 600 = ten physical minutes per
     playback second (mode "accelerated"; below 1 "slowed").

   durationSeconds is physical (simulated) time. A run with durationSeconds stops exactly there: simulatedSeconds becomes
   durationSeconds itself (not a sampled time) and activeSeconds durationSeconds / timeScale, so the final distance is
   exactly LightData.lightDistanceKm(durationSeconds), and onComplete is called exactly once. At timeScale 1 both equal
   durationSeconds, as before. Pausing, resetting and disposing are the caller's job (the stage pauses on a hidden
   document); this module only keeps time.

   Physical coordinates: 1 world unit = 1 000 km (WORLD_UNITS_PER_KM = 0.001). +x is the direction of propagation, the
   light source (emission point) is the origin, and the light axis is y = z = 0. Distances behind the source are negative
   (for example Earth's centre is −6 371 km when light leaves Earth's surface). Camera zoom and pixels are separate: the
   stage maps world units to the screen and never changes these distances. */
window.LightSim = (() => {
  const WORLD_UNITS_PER_KM = 0.001;
  const STATES = Object.freeze(['idle', 'running', 'paused', 'completed', 'disposed']);

  function finite(value, name) {
    if (typeof value !== 'number' || !Number.isFinite(value)) throw new TypeError(`${name} must be a finite number`);
    return value === 0 ? 0 : value;
  }
  const kmToWorld = km => finite(km, 'km') * WORLD_UNITS_PER_KM;
  const worldToKm = units => finite(units, 'units') / WORLD_UNITS_PER_KM;

  function createRun(options = {}) {
    const { durationSeconds = null, now = () => performance.now(), onComplete = null, timeScale = 1 } = options;
    if (durationSeconds !== null && !(typeof durationSeconds === 'number' && Number.isFinite(durationSeconds) && durationSeconds > 0)) {
      throw new RangeError('durationSeconds must be a positive finite number or null');
    }
    if (!(typeof timeScale === 'number' && Number.isFinite(timeScale) && timeScale > 0)) throw new RangeError('timeScale must be a positive finite number');
    if (typeof now !== 'function') throw new TypeError('now must be a function');
    if (onComplete !== null && typeof onComplete !== 'function') throw new TypeError('onComplete must be a function or null');
    const durationMs = durationSeconds === null ? null : durationSeconds * 1000 / timeScale; // playback length of the run
    let state = 'idle', accumulatedMs = 0, segmentStart = 0, startedWall = null, endedWall = null, pauseReason = null;
    let completed = false, complete = onComplete, latest = -Infinity;
    // Monotonic reading: a source that steps back is held at its latest value, so time is never removed.
    const clock = () => { const t = now(); if (typeof t !== 'number' || !Number.isFinite(t)) throw new TypeError('now() must return a finite number'); latest = Math.max(latest, t); return latest; };

    // Brings a running run up to `t`; completes it when the duration is reached. Returns true on the call that completes it.
    function sample(t) {
      if (state !== 'running') return false;
      const active = accumulatedMs + Math.max(0, t - segmentStart);
      if (durationMs === null || active < durationMs) return false;
      endedWall = segmentStart + (durationMs - accumulatedMs); // The real moment the duration was reached.
      accumulatedMs = durationMs; segmentStart = t; state = 'completed'; completed = true;
      return true;
    }
    function finish(done) {
      if (!done || !complete) return;
      const callback = complete; complete = null; // Exactly once, even if the callback calls back into the run.
      callback(snapshot());
    }
    function activeSecondsAt(t) {
      if (state === 'completed') return durationSeconds / timeScale;
      const ms = state === 'running' ? accumulatedMs + Math.max(0, t - segmentStart) : accumulatedMs;
      return (durationMs === null ? ms : Math.min(ms, durationMs)) / 1000; // Never past the stop, even between frames.
    }
    function snapshotAt(t) {
      const activeSeconds = activeSecondsAt(t);
      // Physical time: exact at the stop, never past it (also against rounding in activeSeconds × timeScale).
      const simulatedSeconds = state === 'completed' ? durationSeconds : durationSeconds === null ? activeSeconds * timeScale : Math.min(durationSeconds, activeSeconds * timeScale);
      return Object.freeze({
        state, mode: timeScale === 1 ? 'real-time' : timeScale > 1 ? 'accelerated' : 'slowed', timeScale, durationSeconds, activeSeconds, simulatedSeconds,
        travelledKm: window.LightData.lightDistanceKm(simulatedSeconds),
        remainingSeconds: durationSeconds === null ? null : Math.max(0, durationSeconds - simulatedSeconds),
        wallSeconds: startedWall === null ? 0 : Math.max(0, (endedWall ?? t) - startedWall) / 1000,
        pauseReason, completed
      });
    }
    function snapshot() { return snapshotAt(state === 'running' ? clock() : segmentStart); }

    function start() {
      if (state !== 'idle') return false;
      const t = clock(); state = 'running'; segmentStart = t; startedWall = t; endedWall = null; return true;
    }
    function pause(reason = 'user') {
      if (state !== 'running') return false;
      const t = clock();
      if (sample(t)) { finish(true); return false; } // Already over: completing wins over pausing.
      accumulatedMs += Math.max(0, t - segmentStart); segmentStart = t; state = 'paused'; pauseReason = reason;
      return true;
    }
    function resume() {
      if (state !== 'paused') return false;
      segmentStart = clock(); state = 'running'; pauseReason = null; return true;
    }
    function reset() {
      if (state === 'disposed') return false;
      state = 'idle'; accumulatedMs = 0; segmentStart = 0; startedWall = null; endedWall = null; pauseReason = null;
      completed = false; complete = onComplete;
      return true;
    }
    // Samples the clock (call once per frame); returns the current snapshot.
    function update() {
      if (state !== 'running') return snapshot();
      const t = clock(), done = sample(t), shot = snapshotAt(t);
      finish(done);
      return shot;
    }
    function dispose() {
      if (state === 'disposed') return false;
      if (state === 'running') { // Keep the time reached so far readable; it never moves again.
        const t = clock(); accumulatedMs = Math.min(durationMs ?? Infinity, accumulatedMs + Math.max(0, t - segmentStart)); segmentStart = t;
      }
      state = 'disposed'; complete = null; pauseReason = null; return true;
    }
    return Object.freeze({ start, pause, resume, reset, update, snapshot, dispose, get state() { return state; } });
  }

  return Object.freeze({ WORLD_UNITS_PER_KM, STATES, kmToWorld, worldToKm, createRun });
})();
