# Crew combat release ledger

Runtime session: 01a0369d-0914-7190-ac0e-b4d37e1fc052

- Intake: approved implementation of `CREW-COMBAT-PLAN.md`; user confirms the
  existing direct Wi-Fi/two-phone experience works. Preserve transport and invites.
- Scope: shared numeric/vector health, forward camera and orientation, three crew
  stations, auto/manual turrets, independent predators, limited defense/boost,
  earned upgrades, objective/boss victory, richer five-world art, solo AI, retain versus.
- Access verified: Node 22 available, GitHub authentication and Wrangler OAuth valid.
- Pre-existing changes: user-owned AGENTS.md and this thread's design plan; do not
  stage AGENTS.md. RackeTapp services/data are outside scope.
- Implementation: crew combat, UI, camera, all five environments, shared numeric
  vector health, solo crew AI, and versioned protocol/ruleset now implemented.
- Local verification: 86 tests plus lint/typecheck/build passed. Local co-op and
  versus Durable Object smoke passed. Two-browser damage and actual engineer
  repair agreed on both HUDs at 320/375/390px; screenshots inspected.
- Browser iteration caught and fixed frozen post-finish network ticks; added
  regression. Balance probe caught and fixed inherited slow automatic firing delay
  when taking over a turret. A deterministic coordinated bot wins 20/20 seeds in
  115–117 seconds; this is not a human difficulty assessment. Idle/one-button tests
  never win across 12 seeds.
- Direct WebRTC, forced relay fallback, rematch epochs, multi-touch, background
  pause/resume and signaling reconnect passed in both modes. Input-to-local-motion
  9.7 ms co-op / 9.4 ms versus with guest outbound packets deliberately blocked.
  Four-times CPU slowdown: 6-second sample p95 16.8 ms, zero frames over 250 ms.
  These measurements are same-Mac browser tests, not physical-phone latency claims.
- Expanded browser receipt:
  `/var/folders/nl/zvqhkx6x13n56g_wq93srs7m0000gn/T/two-oars-qa-8w2Uys/results.json`.
- Final pre-release browser receipt (also checks stale control epochs):
  `/var/folders/nl/zvqhkx6x13n56g_wq93srs7m0000gn/T/two-oars-qa-vpXjld/results.json`.
  Input-to-motion 25.7/25.9 ms co-op/versus; CPU-slowed p95 16.8 ms, zero freezes.
- First complete browser receipt:
  `/var/folders/nl/zvqhkx6x13n56g_wq93srs7m0000gn/T/two-oars-qa-jk9l6q/results.json`.
- Improved-art and narrow HUD screenshots:
  `/var/folders/nl/zvqhkx6x13n56g_wq93srs7m0000gn/T/two-oars-qa-isshiP/`.
- Reconnect probe found local Worker did not finish client close handshake;
  explicitly reciprocating the close is documented safe in current runtimes and
  necessary in older ones. Both-mode close/reconnect verification now passed:
  https://developers.cloudflare.com/durable-objects/api/base/
- CI / deployment / live browser verification: pending.
- Original physical guest-phone disappearance was not reproduced on hardware.
  Replacement HUD and confirmed-health path now pass explicit host/guest damage,
  repair and visibility checks. User's own two-phone play remains the final
  subjective difficulty and device-specific visual assessment.
