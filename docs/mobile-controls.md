# Obvious controls, responsive on either phone

The deterministic game rules, local prediction, direct WebRTC, signaling, and relay are unchanged by this interface revision.

## Jobs

- **Drive (pilot):** forward motion is automatic; hold Left or Right to steer. Tap Boost for a short speed burst, not invulnerability.
- **Shoot (gunner):** turrets automatically target predators. Hold Rapid fire for stronger shots. Release to cool; the heat percentage explains cooldown. Tap a predator to select it.
- **Repair (engineer):** hold Repair for roughly two seconds to spend exactly three scrap and regain one team heart. Shield briefly blocks hits. The disabled repair button explains whether hearts are full or scrap is missing.
- A free job changes immediately on the next local simulation step. An occupied job requests a swap; the other player accepts. Solo Scout fills the missing job.

Each job has a persistent explanation, per-button pressed feedback, and a live local action description. Controls opens a native dialog during play; it releases input but deliberately does not pause the teammate's game. Keyboard mappings are included. Shared hearts remain numeric plus vector icons on both peers.

The camera has +/−, reset and pinch, bounded to 100–135% so more of the playable corridor stays visible. Zoom is local-only and never changes collision/aim simulation. The Canvas fallback uses the same zoom for drawing and target hit testing.

Versus uses one action: **Switch lane + speed burst**. Its button names the destination lane and acknowledges presses immediately. The visible legend explains rocks, stars and ramps; hearts include a numeric count. Small landscape phones get side controls instead of a clipped footer.

## Verify

- `pnpm check` (simulation, protocol, room integrations, web tests and production build).
- `node scripts/mobile-controls-smoke.mjs` against `UI_URL`: real injected touch hold/cancel, gun heat/cooling, paid-with-scrap repair, shield, pinch/reset, native guide, 15 job/viewport layouts, hit-target occlusion checks.
- `ROOM_SERVER_URL=… node scripts/peer-browser-smoke.mjs`: real direct peers and relay fallback, local input prediction, rematch, background/resume, invite UI, guest hearts/repair, and versus phone/landscape layout.
- `node scripts/tiny-worlds-browser-smoke.mjs`: original five Blender worlds, 4× CPU slowdown, context loss and download fallback.

Tests create only disposable private game rooms and local solo fixtures. Browser emulation is not a claim of measured physical-phone performance. No credentials or paid backend changes.

Runtime session: 01a0369d-0914-7190-ac0e-b4d37e1fc052. Release evidence: workspace `task-artifacts/mobile-game-controls/`.
