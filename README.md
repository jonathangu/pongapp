# Two Oars

Two Oars is a set of instant one-thumb river games. One person chooses co-op or
versus and texts its link. The recipient taps once, automatically takes the
empty oar or boat, and play begins. There are no accounts, installs, ready
buttons, or room-code steps in the primary flow.

Modes:

- **Co-op Adventure:** each player has one hold button. Both oars accelerate a
  shared boat; alternating oars steers. Synchronized rowing charges Harmony
  Rush, a temporary firefly magnet that smashes hazards. Rare lanterns add
  another power state, while swarms, moving logs, near misses, and three river
  biomes make each 90-second run escalate.
- **Rapid Rivals:** each player gets a boat. A tap switches lanes and adds a
  speed kick. Racers dodge rocks, collect boost stars, hit ramps, and race to
  620 metres.
- **Solo Adventure:** the co-op river runs locally with Scout AI controlling the
  right oar and reacting to upcoming hazards and prizes.

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
- Protocol v5 with explicit co-op/versus rooms, automatic two-seat assignment,
  and reconnect ownership
- Native Web Share when available, clipboard fallback, code entry only as backup

Co-op links use `#/room/CODE`; versus links use `#/race/CODE`. The URL is the
lobby: a new guest receives the first open oar or boat, while a returning guest
with the room's stored reconnect token reclaims the original seat.

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
