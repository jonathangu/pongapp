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

The smoke test creates a real Durable Object room, connects two WebSockets,
starts a two-human match, sends input, observes an acknowledged snapshot, and
summons a Pal.

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
