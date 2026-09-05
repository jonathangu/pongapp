# Two Oars expedition design

The invitation stays effortless: create a private room, text the complete URL,
and automatically begin when the second person opens it. Co-op uses
`#/room/CODE`; versus uses `#/race/CODE`. No shared-screen mode.

## Worlds and cooperative actions

Five 24-second chapters use an isometric canvas with depth-sorted terrain,
vehicles, creatures, pickups, shadows and sky panoramas:

1. Emerald Wilds — boat, jungle banks, crocodiles, ruins and fireflies.
2. Sunset Mesa — monster truck, warm canyon cliffs and a setting sun.
3. Alpine Kingdom — monster truck, snow peaks and crystal passes.
4. Rainbow Skies — airship, floating cloud islands and a rainbow.
5. Starlight Frontier — spacecraft, rings, stars and cosmic predators.

The shared controls remain familiar across vehicles: hold both sides for speed,
alternate to steer. Harmony rewards synchronized holding with a hazard-smashing
rush. Predators track the vehicle while their warning is visible, then commit
to their approach. Either player can fire a shared flare to clear nearby
predators; its seven-second cooldown is visible to both. Relics recharge it.
Rescue targets and golden gates add optional team objectives and scores.
Two seconds of invulnerability after a crash prevents clustered instant deaths.

The canvas reads the simulation each animation frame. React handles the HUD at
about 10 Hz plus important events. Canvas resolution is capped at 1.5 device
pixels per CSS pixel. The home preview lets players inspect all five worlds.

## Local connection

The server authenticates seats and forwards only room-scoped peer messages.
Slot zero hosts physics and results; both phones execute the same deterministic
simulation. A guest predicts its own input without waiting for acknowledgement.
Host snapshots carry consumed action counters so corrections do not repeat taps.

WebRTC ICE negotiates a direct route. Reliable ordered controls are independent
from unordered snapshots with zero retransmissions. A WebSocket relay preserves
the same simulation if ICE is blocked or a data channel fails. Shared epochs
identify rematches and reject older frames. An absent/backgrounded peer pauses
play. The screen wake lock is requested when supported.

Path labels come from the selected ICE pair, and the displayed RTT is a peer
round trip. It is separate from touch-to-visible latency. Physical phones and
hotspot combinations must be tested directly before claiming hardware coverage.

## Limits

This is a private casual game, not a cheat-resistant ranked service: the host
phone owns the match. A host page reload starts a new expedition. The initial
page and signaling require internet even if subsequent play takes a local path.
A same-network connection is attempted, never promised merely from proximity.
