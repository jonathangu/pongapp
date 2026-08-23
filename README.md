# PAL DUEL!

Summon. Return. Win.

PongApp is a fast RackeTapp-themed browser duel. Every match is a vertical,
first-to-five air-hockey battle with free 2D mallet movement, physical goals,
and persistent tiny heroes. Bumper steals and clears, Hook lassos and slings,
and Captain invades enemy ice to grab and shoot the puck.

Guest play is instant. Choose an AI opponent, share one complete room link, or
put two players on the same phone. Online movement, scores, puck physics,
energy, Pal AI, possession, ropes, Power Stars, and results are authoritative
on the room server.

## Local development

Requirements: Node 22 and pnpm 10.

```bash
pnpm install
pnpm dev
pnpm dev:server
```

The client runs at `http://localhost:5173/pongapp/`; the room service runs at
`http://localhost:8080`.

```bash
pnpm check
ROOM_SERVER_URL=http://127.0.0.1:8080 pnpm smoke:room
```

## Repository layout

- `apps/web` — React shell, PixiJS court, inputs, audio, and room UI.
- `apps/room-server` — authoritative Node/WebSocket room service for Fly.io.
- `packages/game-core` — deterministic Pal Duel simulation and AI.
- `packages/protocol` — strict protocol-v3 client/server contracts.

## Hosting

The static client is built at `/pongapp/` and deployed through GitHub Pages to
`https://www.jonathangu.com/pongapp/`. Online rooms run on Cloudflare at
`https://pongapp-room.pongapp-room-worker.workers.dev`. Each invite gets one
authoritative Durable Object placed near the player who creates the room; its
state and WebSocket session stay together at the edge. Override the client
endpoint with `VITE_ROOM_SERVER_URL`.

```bash
pnpm deploy:worker
ROOM_SERVER_URL=https://pongapp-room.pongapp-room-worker.workers.dev pnpm smoke:room
pnpm smoke:prod
```

The previous Fly service remains an emergency rollback target. See
[`docs/EDGE_OPERATIONS.md`](docs/EDGE_OPERATIONS.md) for local testing,
deployment, verification, and rollback.

PongApp remains standalone. Guest identity and progression are device-local;
RackeTapp code, accounts, legal flows, and Supabase are not involved.
