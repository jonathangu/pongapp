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
pnpm dev:server
```

The web client runs at `http://localhost:5173/pongapp/`; the room service runs
at `http://localhost:8080`.

```bash
pnpm check
```

## Repository layout

- `apps/web` — React shell, PixiJS court, inputs, audio, and room UI.
- `apps/room-server` — authoritative Node/WebSocket room service for Fly.io.
- `apps/room-worker` — preserved Cloudflare rollback room service.
- `packages/game-core` — deterministic simulation, abilities, power-ups, AI.
- `packages/protocol` — versioned client/server contracts.

## Hosting

The static client is built with base path `/pongapp/` and deployed through
GitHub Pages to `https://www.jonathangu.com/pongapp/`. The live WebSocket room
service runs on one always-on `sjc` Fly Machine at
`https://pongapp-room.fly.dev`, with room snapshots persisted to its encrypted
volume. The client endpoint can be overridden through `VITE_ROOM_SERVER_URL`.

```bash
fly deploy --ha=false
ROOM_SERVER_URL=https://pongapp-room.fly.dev pnpm smoke:room
pnpm smoke:prod
```

Every production Pages deployment runs the same canonical-site and real-room
smoke checks after publishing.

The current release is deliberately standalone. Identity and progression are
device-local; RackeTapp code and Supabase are not modified.
