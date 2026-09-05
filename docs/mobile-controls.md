# Four tap controls, responsive on either phone

Co-op ruleset 8 replaces held jobs with four always-visible buttons for both players:

- Left / Right: each tap gives a steering impulse; repeated taps move farther, and movement settles after taps stop.
- Shoot: each tap queues one big, slow, homing splash shell (two after Twin Cannons). No held or unattended human fire. Tap a predator to focus aim.
- Recover: six shared taps and three scrap restore one heart. Partial progress persists; full hull and missing scrap are explained on the button.

Pointer hold and keyboard auto-repeat do not repeat actions. Per-action cumulative counters preserve bursts and suppress duplicate network packets. Both players may contribute to a repair. The shared hull stays numeric plus vector hearts on host and guest.

The camera defaults to 90% with a wider 14-unit river, and allows local-only pinch/button zoom from 65–120%. Zoom never changes simulation or collision rules. Canvas fallback uses matching zoom for drawing and targeting.

Upgrades equip automatically at progression milestones and appear as an inline message and badges. No upgrade popup. The optional Controls guide is the only in-game dialog; it does not pause the teammate. Keyboard: A/D or arrows, Space/J, R/K. Solo Scout occasionally shoots and makes emergency repairs, never steering.

Versus is unchanged: Switch lane + speed burst, a visible obstacle legend, numeric hull and landscape side controls.

## Verify

- `pnpm check`: core, protocol, room integrations, web tests and build.
- `node scripts/mobile-controls-smoke.mjs`: actual Chrome touch hold/release, rapid taps, repair, keyboard repeat, pinch/reset, guide and five viewport layouts.
- `node scripts/peer-browser-smoke.mjs`: real direct/relay peers, triplicate cumulative burst packets, prediction, reconnect, rematch, invite UI, guest repair and versus layouts.
- `node scripts/tiny-worlds-browser-smoke.mjs`: five original Blender worlds with active shell/explosion effects, 4× CPU slowdown, GPU loss and failed-download fallback.
- `node scripts/tap-cross-browser-smoke.mjs`: Chromium/WebKit touch or mouse, focused Space repeat, six-tap repair, zoom and unobscured controls. Requires Playwright (`QA_PLAYWRIGHT` can point to an existing installation) and browser binaries.

`UI_URL`, `ROOM_SERVER_URL` and `QA_OUTPUT` select test endpoints and evidence paths. Tests use only disposable rooms and solo fixtures. Browser emulation is not measured physical-phone performance.

Runtime: 01a0369d-0914-7190-ac0e-b4d37e1fc052. Release evidence: workspace `task-artifacts/tap-river-combat/`.
