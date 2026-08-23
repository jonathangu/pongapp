# PongApp edge room operations

## Architecture

The browser remains on GitHub Pages. `apps/room-worker` is the protocol-v3 room
service on Cloudflare Workers. Room creation reaches the nearest Cloudflare
edge, and the first request creates a named `GameRoom` Durable Object there.
Both players' WebSockets, the 60 Hz authoritative simulation, 30 Hz snapshots,
and persisted room state are owned by that one object.

Durable Object state uses the `room-v3` key. The Worker treats the former
protocol-v1 `room` key as occupied but unreadable, so an old room can never be
mistaken for a current game.

## Local verification

```bash
pnpm install
pnpm check
pnpm dev:worker
ROOM_SERVER_URL=http://127.0.0.1:8787 pnpm smoke:room
```

The smoke test creates a real Durable Object room, connects two players, proves
a third player receives the full-room state, transfers the host seat to a new
page session exactly once, receives genuine control input there, and samples
room RTT.

## Logs and support traces

Room lifecycle logs are structured `pongapp.room.lifecycle.v2` objects. They
are persisted at 100% sampling; high-frequency WebSocket invocation logs are
disabled. Tail live events with:

```bash
pnpm --filter @pongapp/room-worker exec wrangler tail pongapp-room \
  --format=pretty --search pongapp.room.lifecycle.v2
```

Players may report the eight-character support trace shown on room errors and
full-room screens. Query persisted logs with `pnpm logs:rooms -- --minutes=1440
--trace=AB12CD34` after supplying Cloudflare observability credentials. See
`docs/INCIDENT_SHARED_ROOM_CONTROL_2026-08-22.md` for the field dictionary,
privacy boundary, RCA, and detection rules.

## Deploy and verify

Wrangler uses the authenticated Cloudflare account on the machine; no secret
belongs in the repository.

```bash
pnpm deploy:worker
curl https://pongapp-room.pongapp-room-worker.workers.dev/api/health
ROOM_SERVER_URL=https://pongapp-room.pongapp-room-worker.workers.dev pnpm smoke:room
pnpm smoke:prod
```

Production health must report protocol `3` and runtime
`cloudflare-durable-objects`. GitHub Actions builds the client with the
repository variable `ROOM_SERVER_URL`; it must equal the Worker URL above.

## Rollback

The previous regional service remains at `https://pongapp-room.fly.dev`.
Rollback requires changing the GitHub repository variable `ROOM_SERVER_URL`
to that URL and redeploying the Pages workflow. Existing Cloudflare rooms and
Fly rooms are separate; a room created before a switch cannot move between
them.
