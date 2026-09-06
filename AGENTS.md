# PongApp operating contract

## Mission

PongApp is RackeTapp's fast, beautiful browser side game. Optimize the loop
`open -> choose a mode -> play within seconds -> rematch or share a room`.

## Product invariants

- Keep guest play instant; authentication is optional.
- The room server is authoritative for scores, physics, abilities, and results.
- Cosmetics and mastery never change gameplay power.
- No text chat or public matchmaking in the first release.
- Preserve the RackeTapp visual family without importing RackeTapp application
  code or tennis-specific legal acceptance.
- Keep the game core framework-neutral so it can later be mounted in RackeTapp.

## Standalone boundary

- Keep PongApp standalone at `/pongapp/` until Jonathan requests integration.
- Do not edit RackeTapp, its Supabase project, or its account/legal flows.
- Guest identity and progression remain device-local for this release.
- Browser code never receives server secrets.

## Verification

Run `pnpm check`. For UI changes, verify the guest AI journey and online lobby
at phone and desktop sizes. Do not publish if simulation, protocol, or room
integration tests fail.

For Cloudflare room changes, also run a real local Durable Object smoke test:

```bash
pnpm dev:worker
ROOM_SERVER_URL=http://127.0.0.1:8787 pnpm smoke:room
```

Deploy from this repository with `pnpm deploy:worker`, then run
`ROOM_SERVER_URL=https://pongapp-room.pongapp-room-worker.workers.dev pnpm smoke:room`.

## Future mobile ARPG: reuse-first gate (2026-09-06)

For the future ricochet/physics ARPG, follow `docs/OPEN-SOURCE-FIRST.md` before
implementing or replacing a major subsystem. Consult the six-field catalog in
`docs/research/mobile-arpg-parts-bin/`; research alternatives, preserve code/asset
provenance, prefer structured content and small adapters, and require actual-phone
evidence before committing architecture. An installed app is explicitly acceptable;
browser retention is not required for this future game. This does not authorize
retiring the released browser game or changing its existing competitive rules.
