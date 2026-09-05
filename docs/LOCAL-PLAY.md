# Two Oars local play implementation ledger

User request: separate phones, local simulation and direct WebRTC on Wi-Fi or a
phone hotspot; richer isometric environments, predators and cooperative actions.

The server authenticates room seats and forwards private negotiation messages.
Slot zero hosts the local simulation. Both browsers step the shared game core at
60 Hz. Guest input is predicted immediately and reconciled against host state.
Direct data channels carry gameplay when available. A labeled WebSocket relay
keeps the same host simulation if the network blocks peer traffic. No claim of
local routing is made unless the selected ICE candidate pair supports it.

Planned verification: simulation/prediction tests, signaling authorization tests,
local Durable Object smoke, real two-browser WebRTC and input response checks,
phone and desktop visual inspection, production deployment and smoke.

Physical iPhone hotspot combinations require device verification; browsers and
network isolation policies can prevent direct traffic even on the same network.

## Crew combat upgrade — September 2026

The user confirmed the earlier latency/Wi-Fi changes work on their actual two-phone
setup. Keep that evidence distinct from our same-Mac browser measurements.

Protocol 6 / co-op ruleset 7 adds pilot, gunner and engineer controls while preserving
the same direct RTC channels, signaling, fixed-tick local prediction and relay path.
Versus ruleset remains 6. Refresh both phones after this release. Existing Worker
room identities/seats are retained across protocol-5 storage loading; incompatible
old co-op simulation state starts fresh with the new rules instead of being replayed.

Station/upgrade requests are sequence-counted, and occupied station swaps require
the partner's agreement. Each player can occupy one station. Crew inputs include
steering, held operation, a one-shot ability and a priority target. Auto-turrets fire
weakly unattended. Engineer repairs cost 3 scrap and restore 1 of 3 shared hearts.
Both HUDs show numeric and vector health; the guest HUD uses confirmed host health
instead of speculative predicted damage. Victory requires 3 rescues plus defeating
the final guardian before extraction closes. Solo Scout fills an unattended role.

Detailed design and release evidence: `CREW-COMBAT-PLAN.md`, `CREW-RELEASE.md`.

## Verification receipt — 2026-09-04

- `pnpm check`: lint, typecheck, 70 tests, production builds passed.
- Local Durable Object room smokes: co-op and versus passed.
- Real isolated Chrome peers: both selected host/host ICE, host/guest play,
  direct-to-relay transition preserved the epoch, guest rematch synchronized,
  and a delayed packet from the previous epoch could not undo a rematch.
- With outbound gameplay blocked, next-frame local response measured 10.1 ms
  (co-op) and 19.1 ms (versus) in the latest browser run. These are browser test
  measurements on one Mac, not physical phone or hotspot latency measurements.
- Actual private invite URLs opened in fresh browser contexts and established
  local peer sessions in both modes. No browser exceptions. Mobile 390×844
  layout had no horizontal overflow and kept controls inside the viewport.
- Four-times CPU throttled, ten-second mobile-render soak: p95 frame gap 16.7 ms,
  one 149.9 ms outlier, zero freezes over 250 ms.
- Visual inspection: desktop home, mobile solo, both invite flows and all five
  world previews. Clouds/space use open sky rather than the terrain platform.
- Browser screenshots and JSON evidence:
  `/var/folders/nl/zvqhkx6x13n56g_wq93srs7m0000gn/T/two-oars-qa-g7GeHs/`.

The interactive Mac surface was locked; QA above used isolated headless test
browsers and inspected their generated screenshots. Physical two-phone and
hotspot-owner/guest verification remains a device-specific follow-up.
