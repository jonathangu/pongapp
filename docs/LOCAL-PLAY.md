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
