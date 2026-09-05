# Two Oars product and interaction design

## Product promise

“Text one link. Play together or race each other in seconds.”

The invite is not a pre-game workflow; it is the lobby. Creating a trip returns
one complete URL. Opening it joins the room automatically and assigns the first
available oar. Two connected rowers trigger a three-second countdown without a
ready button.

## Core loop

The shared boat moves through moonlight, aurora, and dawn for 90 seconds:

- Both players hold: maximum forward speed and a straight course.
- Left player holds: the boat turns right.
- Right player holds: the boat turns left.
- Fireflies add points and grow a shared streak.
- Rocks remove one of three shared hearts and reset the streak.
- Rare hearts repair one shared heart.
- Sustained synchronized rowing fills Harmony and triggers a three-second Rush
  that attracts fireflies, doubles their points, and smashes hazards.
- Rare lanterns create an eight-second magnet power; moving logs and near-miss
  bonuses add risk and surprise.

There is no individual score, winner, or blame surface in co-op. Every reward and cost is
shared. A trip ends at sunrise or when all three hearts are gone; either player
can immediately start a rematch. Rapid Rivals is an intentionally separate
competitive mode: tapping switches the player's boat between two lanes and
adds a speed kick, with rocks, boost stars, and ramps shared deterministically.
Solo Adventure runs the co-op simulation locally with a hazard-aware AI oar.

## Join state machine

1. Host presses “Row with someone.”
2. Client creates a nearest-edge room with `mode: coop|versus` and replaces the
   URL with `#/room/CODE` or `#/race/CODE`.
3. Host sends the URL using native share or clipboard fallback.
4. Guest opens it and sends a guest ID in the protocol-v5 hello.
5. The room assigns slot 0/left or slot 1/right and starts at two connected seats.
6. A per-room reconnect token reclaims the same participant and closes a stale
   duplicate socket with code 4001.
7. A third browser sees a clear full-boat screen and cannot affect controls.

## Latency strategy

The server remains authoritative, but the mechanic avoids latency-sensitive
collisions between players:

- Control payload: `{seq, paddle, controlActive}` where paddle is 0…1.
- Press and release are flushed immediately, with a 30 Hz safety loop.
- Local button state and the local oar animate before server acknowledgement.
- Boat position is interpolated from recent snapshots using an adaptive 1.5–4
  tick buffer based on round-trip time, jitter, and snapshot gaps.
- A visible client reconnects a stale stream after two seconds without messages.
- A disconnected participant's paddle is zeroed server-side immediately.

The resulting game remains understandable on ordinary cellular latency while a
good edge connection still feels crisp.

## Privacy-safe operations

Lifecycle telemetry uses server-generated room and match correlation IDs. It
records connection transitions, anonymous seat numbers, timing, network quality,
and final aggregate trip metrics. It does not log room codes, names, guest IDs,
participant IDs, reconnect tokens, invite URLs, or paddle values.
