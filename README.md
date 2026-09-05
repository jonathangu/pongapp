# Two Oars

Two Oars is a tiny same-team browser game for two phones. One person creates a
boat and texts its link. The recipient taps once, automatically takes the empty
oar, and the trip begins. There are no accounts, installs, ready buttons, or
room-code steps in the primary flow.

Each player has one hold button. Both oars accelerate the shared boat; only the
left oar turns it right and only the right oar turns it left. Together, the
players collect fireflies, avoid rocks, protect three shared hearts, and chase
one shared score during a 75-second trip.

## Why this game

The interaction is designed around real mobile-network constraints:

- Each control update is one scalar paddle value, not a continuous position.
- The button and oar animate locally, so input always feels immediate.
- Only the shared boat and river use authoritative edge snapshots.
- Coordination is important, but a brief delay cannot invalidate a precise hit.
- A reconnect token preserves the player's left/right seat through a dropped
  connection or backgrounded mobile browser.

## Architecture

- React/Vite client published at `https://www.jonathangu.com/pongapp/`
- Cloudflare Worker room API and one Durable Object per six-character room
- Authoritative deterministic simulation at 60 Hz
- Compact WebSocket snapshots at 30 Hz, plus event-triggered snapshots
- Protocol v4 with automatic two-seat assignment and reconnect ownership
- Native Web Share when available, clipboard fallback, code entry only as backup

The complete invite route is `#/room/CODE`. The URL is the lobby: a new guest
opening it receives the first open oar, while a returning guest with the room's
stored reconnect token reclaims the original oar.

## Development

Requires Node 22+ and pnpm 10.

```bash
pnpm install
pnpm dev
pnpm dev:worker
```

Run the full verifier:

```bash
pnpm check
```

Run a local end-to-end room check with the Worker running on port 8787:

```bash
ROOM_SERVER_URL=http://127.0.0.1:8787 pnpm smoke:room
```

Deploy and verify production:

```bash
pnpm deploy:worker
pnpm smoke:prod
```

The static site deploys from `main` via `.github/workflows/pages.yml`.
