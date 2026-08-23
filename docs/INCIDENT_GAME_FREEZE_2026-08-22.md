# Production game-freeze incident — 2026-08-22

## User impact

Two real players reported severe lag and a mid-game freeze. The relevant
privacy-safe production support trace is `A869D66B` (2026-08-23 04:29–04:32Z).

## Evidence and RCA

- The Durable Object simulation continued from tick 0 through tick 3,129 and
  emitted `match_finished`; this was not a server simulation halt.
- One client reported poor transport health: 89–151 ms RTT p95, up to 53 ms
  jitter, and 49–74 ms snapshot-gap p95.
- The other client reported 101 ms RTT p95 and 160 ms jitter.
- One active player WebSocket ended abnormally with code 1006 after 36.5
  seconds. The other remained connected through the result and later also
  ended with 1006.
- Existing telemetry could prove transport instability but could not separate
  a phone render-thread stall from network delay. It had no frame-gap, render
  duration, long-frame, freeze, renderer-resolution, or adaptive-quality data.
- The persisted-log CLI was also broken by a Cloudflare Observability API shape
  change: query parameters are now nested under `parameters`, and event rows are
  returned under `result.events.events`.
- Client audit found avoidable main-thread/GPU pressure: full deep clones on
  every online render and local snapshot, two React update paths for each 30 Hz
  server snapshot, a 2× mobile render target, antialiasing, and a standard-mode
  blur filter.

Correcting the earlier interpretation: a low-RTT synthetic edge smoke test
proved server reachability, not smooth rendering or resilient transport on the
players' phones.

## Remediation

- Detect an active but stale stream after 2 seconds and reconnect it.
- Reduce reconnect backoff from 1/2/4/4 seconds to 0.25/0.5/1/2 seconds.
- Preserve the last render state while reconnecting and show a visible
  `Reconnecting…` status instead of silently freezing.
- Coalesce predicted client input at 30 Hz and stop adding input when the
  WebSocket send buffer is backed up. Local mallet prediction remains per-frame.
- Replace generic `structuredClone` calls with copies of only mutable game-state
  branches.
- Stop notifying the whole online room React tree for routine snapshots and
  throttle HUD state to 10 Hz while Pixi continues rendering each animation
  frame directly from the newest state.
- Cap the mobile render resolution at 1.5×, disable mobile antialiasing, remove
  blur from standard effects, and reduce standard particles/trails.
- Automatically drop to the low-effects profile when frame p95 exceeds 34 ms,
  render p95 exceeds 18 ms, or a 250 ms freeze occurs.
- Emit privacy-safe `client_performance_sample` lifecycle logs with frame-gap
  p95/max, render p95, long-frame/freeze counts, resolution, and quality mode.
- Repair the persisted Cloudflare log query and accept both old and new response
  envelopes.
- Add `pnpm perf:client`, supporting practice/online play, mobile viewport, CPU
  throttling, touch motion, Pal actions, and optional forced network loss.

## Verification evidence

- `pnpm check`: lint, typecheck, 57 tests, all builds passed.
- Same 390×844@3×, 4×-CPU, 10-second practice soak before versus after:
  main-thread task time 2,228 → 1,406 ms (-36.9%); script time 1,757 →
  1,007 ms (-42.7%); zero 250 ms freezes after the change.
- Online mobile soak against the production edge with the new client: 748
  frames, 26.6 ms frame-gap p95, 68 ms max, and zero 250 ms freezes over the
  measured 10 seconds at 4× CPU throttling.
- A second online soak forced the browser fully offline for 2 seconds mid-match:
  the canvas remained mounted, the client recovered to 15 ms RTT with no error,
  and recorded zero 250 ms freezes over 15 seconds at 4× CPU throttling.
- The first production watchdog soak showed that waiting for the browser's close
  handshake could delay the reconnect callback. Commit `50208ad` detached a
  stale socket and scheduled recovery immediately instead.
- Final canonical-production trace `8FC3DC1C` proved the correction: Cloudflare
  logged `closeCategory: stale`, then `participant_reconnected` 155 ms later
  with the same client session and player seat. Its client sample reported
  26 ms frame-gap p95, 1 ms render p95, 1.5× resolution, and zero freezes under
  4× CPU throttling.

The Chromium soak is a repeatable regression signal, not a substitute for real
iOS/Android telemetry. The new production performance samples close that gap.
