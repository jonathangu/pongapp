# Shared-room control incident RCA — 2026-08-22

## Status and impact

Resolved in production. A creator could open their invite in another tab or
device and see a live court that intermittently or permanently ignored input.
A third visitor to a full room could see the same apparently interactive court
while actually holding a spectator slot. Neither state was explained in the UI.

## Root cause

The Durable Object correctly recognized a reconnect token, transferred the
existing participant seat to the new WebSocket, and closed the old WebSocket
with application code `4001` (`reconnected elsewhere`). The old browser client
ignored the close code and treated every non-user close as transient. It opened
another socket with the same reconnect token, which closed the new socket. The
two page sessions could then repeatedly evict one another.

The control symptom followed directly: both pages continued rendering game
snapshots, but authoritative input ownership alternated between sockets. The
player saw the court while their current page was no longer the seat owner.

A separate path produced the same symptom. When both player slots were filled,
the server assigned a new visitor `slot: null`. The old UI still rendered the
game court; `GameCourt` had no local player ID, so pointer input intentionally
did nothing. The UI never said that the visitor was spectating.

## Cause chain

1. The same reconnect token appeared on a second WebSocket.
2. The server transferred the seat and closed the old socket with `4001`.
3. The old client discarded the close code and auto-reconnected.
4. Each successful reconnect closed the other page session.
5. Both pages retained snapshots and looked playable while ownership churned.
6. Existing logs showed socket activity but not page-session ownership, close
   codes, replacement edges, rendered UI state, or genuine user input.

## Contributing factors

- The reconnect retry counter reset on every socket open, before a participant
  welcome proved that the connection was stable.
- Replacement ownership was serialized after closing the old socket, leaving a
  latent race where the close handler could temporarily mark the seat offline.
- The client emitted idle input packets at 60 Hz. A server-side "first input"
  signal would therefore have been meaningless without an explicit
  `controlActive` bit.
- Custom events were JSON strings, not structured log objects, so their fields
  were not directly indexable in Workers Logs.
- Invocation logging captured the high-frequency WebSocket stream and buried
  the few lifecycle events with diagnostic value.
- There was no privacy-safe correlation value a player could report.

## Corrective changes

- `4001` is terminal for the displaced page. It displays a handoff message and
  does not reconnect.
- The replacement attachment is published before the old socket is closed.
- Full rooms display an explicit non-interactive state instead of a dead court.
- Each room has a human-readable name.
- Idle input packets are no longer sent; real control packets carry
  `controlActive: true`.
- Every room, match, socket, and page session receives a random opaque
  correlation ID. The room exposes only an eight-character support trace.
- Workers Logs now receive indexed `pongapp.room.lifecycle.v2` objects.
- UI signals are accepted once per connection and network samples at most once
  every 15 seconds, preventing a client from flooding observability storage.
- High-frequency invocation logs are disabled while lifecycle logs remain
  persisted at 100% sampling.

## Lifecycle evidence model

All events include `supportTraceId`, `roomSessionId`, phase, game tick, room age,
connected player/spectator counts, and reserved seat count.

| Action | What it proves |
| --- | --- |
| `participant_joined` | A new page received a player or spectator role |
| `participant_reconnected` | A reconnect token reclaimed an existing seat |
| `socket_replaced` | Exact old-to-new connection and page-session ownership |
| `socket_closed` | Close category/code, cleanliness, duration, input seen, and replacement state |
| `client_control_surface_visible` | React rendered the interactive match for this page session |
| `control_input_first` | The Worker received genuine local control intent |
| `client_room_full_visible` | The non-interactive full-room explanation rendered |
| `client_network_sample` | Median/p95 RTT, jitter, snapshot gap, and quality bucket |
| `protocol_rejected` | A bounded reason for client/server protocol rejection |

No lifecycle event contains a room code/name, player/guest/participant ID,
display name, reconnect/access token, free-form client text, or input coordinate.

## Detection rules

- **Reconnect loop:** more than three `participant_reconnected` events for one
  `clientSessionId` in 30 seconds, or a displaced `clientSessionId` returning
  after a `socket_closed` event with `closeCategory: replaced`.
- **Control gap:** `client_control_surface_visible` without
  `control_input_first` for the same connection after the player attempts to
  move. The support trace lets support inspect this without a room code.
- **Full-room surprise:** `requestedRole: player` plus
  `assignedRole: spectator`; confirm `client_room_full_visible` follows.
- **Transport health:** abnormal-close rate and the p95 of `latencyP95Ms`,
  `jitterMs`, and `snapshotGapP95Ms`.
- **Protocol drift:** any `protocol_rejected` event, grouped by reason and
  announced version.

## Querying logs

Live lifecycle events:

```bash
pnpm --filter @pongapp/room-worker exec wrangler tail pongapp-room \
  --format=pretty --search pongapp.room.lifecycle.v2
```

Persisted events by support trace:

```bash
CLOUDFLARE_ACCOUNT_ID=... CLOUDFLARE_EMAIL=... CLOUDFLARE_API_KEY=... \
  node scripts/query-room-logs.mjs --minutes=1440 --trace=AB12CD34
```

The Cloudflare OAuth token used by Wrangler can tail Workers, but the current
token does not include Workers Observability Write, which the telemetry query
API requires. The query script therefore accepts a scoped API token or the
account email plus global API key and never prints credentials or raw request
URLs.
