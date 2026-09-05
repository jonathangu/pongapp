# Two Oars — Expeditions

Two separate phones, one shared adventure. Send a private link; the other person
opens it and the countdown starts. No accounts, installation or ready button.

Co-op is a 120-second isometric journey through Emerald Wilds, Sunset Mesa,
Alpine Kingdom, Rainbow Skies and Starlight Frontier. The shared boat becomes a
monster truck, airship and spacecraft. Both players have four tap-only buttons:
Left, Right, Shoot and Recover. Repeated taps add movement, big slow splash
shells or shared repair progress. Six Recover taps and three scrap restore one
heart. More enemies approach across a wider river; cannon upgrades equip
automatically without menus. Rescue three friends and defeat the guardian.
Collisions grant 1.5 seconds of protection from repeat damage.

Rapid Rivals retains its two-boat race and now uses the same local simulation
and peer transport. Solo Adventure runs the expedition with Scout AI.

## Connection and authority

The deployed browser clients simulate at 60 Hz. Slot zero hosts the canonical
match. Guest controls affect local simulation immediately, then reconcile with
host snapshots. Counter-based taps survive packet loss and duplication.

The existing Cloudflare room authenticates seats and forwards WebRTC signaling.
An ordered reliable data channel carries controls; an unordered non-retransmitted
channel carries replaceable host snapshots at 20 Hz. If direct connectivity is
unavailable, messages use the private WebSocket relay at 10 Hz without restarting
the host simulation. Protocol 7 carries cumulative action counters; co-op uses
ruleset 8 and versus keeps ruleset 6. Stale clients must refresh. The room's
fallback simulation is ignored once the peer session starts.

The UI reports Local Wi-Fi only for a selected host/host ICE candidate pair;
Direct peer for other direct routes; Relay when using the server path. Candidate
addresses and signaling payloads are not logged. Local Wi-Fi is a route hint,
not a guarantee that a particular router or hotspot supports peer traffic.

Same Wi-Fi, two devices on the same hotspot, and hotspot-owner plus connected
phone all attempt direct connectivity automatically. Some hotspot/router/browser
policies block it; the relay remains usable with local input prediction. The site
and initial invitation still need internet. No camera, microphone or Bluetooth
permission is required. Keep both tabs foregrounded; play pauses for an absent
peer. Reloading the host begins a new expedition; peer transport interruption
and rematches preserve a coherent host epoch.

## Development and verification

Node 22+, pnpm 10:

```bash
pnpm install
pnpm dev:worker
VITE_ROOM_SERVER_URL=http://127.0.0.1:8787 pnpm dev
pnpm check
ROOM_SERVER_URL=http://127.0.0.1:8787 pnpm smoke:room
GAME_MODE=versus ROOM_SERVER_URL=http://127.0.0.1:8787 pnpm smoke:room
node scripts/peer-browser-smoke.mjs
```

The browser smoke uses isolated headless Chrome contexts, the real local Worker,
and Vite. It verifies direct ICE, local response while outgoing messages are
blocked, relay fallback, rematch epochs, actual invitation UI, and mobile layouts.
Screenshots and results are written to a printed temporary artifact directory.
It does not substitute for testing two physical phones or hotspot hardware.

Deploy Worker first with `pnpm deploy:worker`, then publish the client from
`main` using GitHub Pages. Verify with `pnpm smoke:prod`.

Public site: https://www.jonathangu.com/pongapp/
