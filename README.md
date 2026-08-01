# PONG!

Four walls. One winner.

PongApp is a RackeTapp-themed multiplayer Pong game for the browser: classic
duels, a four-sided arena, crosscourt doubles, honest AI, signature skills,
contestable power-ups, and invite-code rooms.

## Local development

Requirements: Node 22 and pnpm 10.

```bash
pnpm install
pnpm dev
pnpm dev:worker
```

The web client runs at `http://localhost:5173/pongapp/`; the room service runs
at `http://localhost:8787`.

```bash
pnpm check
```

## Repository layout

- `apps/web` — React shell, PixiJS court, inputs, audio, and room UI.
- `apps/room-worker` — authoritative Cloudflare Durable Object rooms.
- `packages/game-core` — deterministic simulation, abilities, power-ups, AI.
- `packages/protocol` — versioned client/server contracts.

## Hosting

The static client is built with base path `/pongapp/` and deployed through
GitHub Pages to `https://www.jonathangu.com/pongapp/`. The live WebSocket room
service runs at `https://pongapp-room.pongapp-room-worker.workers.dev` and can
be overridden through `VITE_ROOM_SERVER_URL`.

```bash
pnpm --filter @pongapp/room-worker run deploy
ROOM_SERVER_URL=https://pongapp-room.pongapp-room-worker.workers.dev pnpm smoke:room
```

The current release is deliberately standalone. Identity and progression are
device-local; RackeTapp code and Supabase are not modified.
